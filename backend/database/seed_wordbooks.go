package database

import (
	"encoding/json"
	"fmt"
	"gugudu-backend/models"
	"log"
	"os"
	"path/filepath"

	"gorm.io/gorm/clause"
)

// wordBookJSON 词书 JSON 结构
type wordBookJSON struct {
	Meta struct {
		Name       string `json:"name"`
		NameEN     string `json:"name_en"`
		Slug       string `json:"slug"`
		Category   string `json:"category"`
		Difficulty string `json:"difficulty"`
		CEFRLevel  string `json:"cefr_level"`
		Version    string `json:"version"`
		Source     string `json:"source"`
		License    string `json:"license"`
	} `json:"meta"`
	Units []struct {
		Unit    int    `json:"unit"`
		Name    string `json:"name"`
		Entries []struct {
			Word         string   `json:"word"`
			UKPhonetic   string   `json:"uk_phonetic"`
			USPhonetic   string   `json:"us_phonetic"`
			Definitions  []struct {
				Pos        string `json:"pos"`
				Definition string `json:"definition"`
			} `json:"definitions"`
			Translation  string   `json:"translation"`
			Examples     []struct {
				EN string `json:"en"`
				ZH string `json:"zh"`
			} `json:"examples"`
			Collocations []string `json:"collocations"`
			Frequency    int      `json:"frequency"`
			Tags         []string `json:"tags"`
		} `json:"entries"`
	} `json:"units"`
}

// SeedWordBooks 从 JSON 文件幂等写入词书数据
func SeedWordBooks() error {
	dataDir := filepath.Join("data", "wordbooks")

	// 尝试多个可能的路径
	possibleDirs := []string{
		dataDir,
		filepath.Join("..", "data", "wordbooks"),
	}

	var selectedDir string
	for _, dir := range possibleDirs {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			selectedDir = dir
			break
		}
	}
	if selectedDir == "" {
		log.Println("词书数据目录未找到,跳过 seed")
		return nil
	}

	files, err := filepath.Glob(filepath.Join(selectedDir, "*.json"))
	if err != nil {
		return fmt.Errorf("failed to list wordbook files: %w", err)
	}

	for _, file := range files {
		if err := seedOneWordBook(file); err != nil {
			log.Printf("词书 seed 失败 (%s): %v", file, err)
		}
	}

	return nil
}

func seedOneWordBook(filePath string) error {
	raw, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("read file %s: %w", filePath, err)
	}

	var data wordBookJSON
	if err := json.Unmarshal(raw, &data); err != nil {
		return fmt.Errorf("parse JSON %s: %w", filePath, err)
	}

	// 统计词条总数和单元数
	totalEntries := 0
	unitSet := make(map[int]bool)
	for _, u := range data.Units {
		totalEntries += len(u.Entries)
		unitSet[u.Unit] = true
	}

	// FirstOrCreate 词书
	book := models.WordBook{
		Name:        data.Meta.Name,
		NameEN:      data.Meta.NameEN,
		Slug:        data.Meta.Slug,
		Description: fmt.Sprintf("%s (%s)", data.Meta.Name, data.Meta.Source),
		Category:    data.Meta.Category,
		Difficulty:  data.Meta.Difficulty,
		CEFRLevel:   data.Meta.CEFRLevel,
		WordCount:   totalEntries,
		UnitCount:   len(unitSet),
		IsPublished: true,
		Source:      data.Meta.Source,
		License:     data.Meta.License,
		Version:     data.Meta.Version,
	}

	var saved models.WordBook
	if err := DB.Where("slug = ?", data.Meta.Slug).Attrs(book).FirstOrCreate(&saved).Error; err != nil {
		return fmt.Errorf("create wordbook %s: %w", data.Meta.Slug, err)
	}

	// 写入词条
	sortOrder := 0
	for _, unit := range data.Units {
		for _, entry := range unit.Entries {
			sortOrder++
			definitionsJSON, _ := json.Marshal(entry.Definitions)
			examplesJSON, _ := json.Marshal(entry.Examples)
			collJSON, _ := json.Marshal(entry.Collocations)
			tagsJSON, _ := json.Marshal(entry.Tags)

			wbe := models.WordBookEntry{
				WordBookID:  saved.ID,
				SortOrder:   sortOrder,
				Unit:        unit.Unit,
				Word:        entry.Word,
				UKPhonetic:  entry.UKPhonetic,
				USPhonetic:  entry.USPhonetic,
				Phonetic:    entry.USPhonetic,
				Definitions: string(definitionsJSON),
				Translation: entry.Translation,
				Examples:    string(examplesJSON),
				Collocations: string(collJSON),
				Frequency:   entry.Frequency,
				Difficulty:  data.Meta.Difficulty,
				Tags:        string(tagsJSON),
			}

			result := DB.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "word_book_id"}, {Name: "word"}},
				DoNothing: true,
			}).Create(&wbe)
			if result.Error != nil {
				log.Printf("词书词条写入跳过 (%s/%s): %v", data.Meta.Slug, entry.Word, result.Error)
			}
		}
	}

	log.Printf("词书 seed 完成: %s (%d 词)", data.Meta.Name, totalEntries)
	return nil
}
