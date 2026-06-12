package database

import (
	"encoding/json"
	"errors"
	"fmt"
	"gugudu-backend/models"
	"log"
	"os"
	"path/filepath"

	"gorm.io/gorm"
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

	totalEntries := 0
	unitSet := make(map[int]bool)
	for _, u := range data.Units {
		totalEntries += len(u.Entries)
		unitSet[u.Unit] = true
	}

	var existing models.WordBook
	err = DB.Where("slug = ? AND version = ? AND word_count = ? AND unit_count = ?",
		data.Meta.Slug, data.Meta.Version, totalEntries, len(unitSet)).First(&existing).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("check wordbook %s: %w", data.Meta.Slug, err)
	}

	return DB.Transaction(func(tx *gorm.DB) error {
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
		if err := tx.Where("slug = ?", data.Meta.Slug).Attrs(book).FirstOrCreate(&saved).Error; err != nil {
			return fmt.Errorf("create wordbook %s: %w", data.Meta.Slug, err)
		}

		tx.Model(&saved).Updates(map[string]interface{}{
			"name":         data.Meta.Name,
			"name_en":      data.Meta.NameEN,
			"description":  book.Description,
			"category":     data.Meta.Category,
			"difficulty":   data.Meta.Difficulty,
			"cefr_level":   data.Meta.CEFRLevel,
			"word_count":   totalEntries,
			"unit_count":   len(unitSet),
			"is_published": true,
			"source":       data.Meta.Source,
			"license":      data.Meta.License,
			"version":      data.Meta.Version,
		})

		entries := make([]models.WordBookEntry, 0, totalEntries)
		sortOrder := 0
		for _, unit := range data.Units {
			for _, entry := range unit.Entries {
				sortOrder++
				definitionsJSON, _ := json.Marshal(entry.Definitions)
				examplesJSON, _ := json.Marshal(entry.Examples)
				collJSON, _ := json.Marshal(entry.Collocations)
				tagsJSON, _ := json.Marshal(entry.Tags)

				entries = append(entries, models.WordBookEntry{
					WordBookID:   saved.ID,
					SortOrder:    sortOrder,
					Unit:         unit.Unit,
					Word:         entry.Word,
					UKPhonetic:   entry.UKPhonetic,
					USPhonetic:   entry.USPhonetic,
					Phonetic:     entry.USPhonetic,
					Definitions:  string(definitionsJSON),
					Translation:  entry.Translation,
					Examples:     string(examplesJSON),
					Collocations: string(collJSON),
					Frequency:    entry.Frequency,
					Difficulty:   data.Meta.Difficulty,
					Tags:         string(tagsJSON),
				})
			}
		}

		if len(entries) > 0 {
			if err := tx.Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "word_book_id"}, {Name: "word"}},
				DoUpdates: clause.AssignmentColumns([]string{
					"definitions", "translation", "examples", "collocations",
					"phonetic", "uk_phonetic", "us_phonetic",
					"tags", "frequency", "difficulty", "sort_order", "unit",
				}),
			}).CreateInBatches(&entries, 500).Error; err != nil {
				return fmt.Errorf("batch insert entries for %s: %w", data.Meta.Slug, err)
			}
		}

		log.Printf("词书 seed 完成: %s (%d 词)", data.Meta.Name, totalEntries)
		return nil
	})
}
