package handlers

import (
	"gugudu-backend/database"
	"gugudu-backend/models"
	"math"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	defaultDailyReadMinutes = 20
	defaultDailyReviewWords = 10
	defaultDailyArticles    = 1
	studyCalendarDays       = 35
)

type studyProgress struct {
	ReadMinutes       int `json:"read_minutes"`
	ReviewedWords     int `json:"reviewed_words"`
	CompletedArticles int `json:"completed_articles"`
}

type studyTodayResponse struct {
	Goal        models.StudyGoal     `json:"goal"`
	Today       models.StudyRecord   `json:"today"`
	Progress    studyProgress        `json:"progress"`
	Completion  int                  `json:"completion"`
	IsCompleted bool                 `json:"is_completed"`
	Streak      int                  `json:"streak"`
	Calendar    []models.StudyRecord `json:"calendar"`
}

// GetStudyToday 获取今日学习闭环数据
func GetStudyToday(c *gin.Context) {
	userID, _ := c.Get("user_id")

	goal, err := ensureStudyGoal(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load study goal"})
		return
	}

	today, err := ensureTodayStudyRecord(userID.(uint), goal)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load study record"})
		return
	}

	calendar, err := getStudyCalendar(userID.(uint), time.Now(), studyCalendarDays)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load study calendar"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": buildStudyTodayResponse(goal, today, calendar)})
}

// UpdateStudyGoal 更新每日目标
func UpdateStudyGoal(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req struct {
		DailyReadMinutes int `json:"daily_read_minutes" binding:"required,min=1,max=240"`
		DailyReviewWords int `json:"daily_review_words" binding:"required,min=1,max=500"`
		DailyArticles    int `json:"daily_articles" binding:"required,min=1,max=20"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	goal, err := ensureStudyGoal(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load study goal"})
		return
	}

	goal.DailyReadMinutes = req.DailyReadMinutes
	goal.DailyReviewWords = req.DailyReviewWords
	goal.DailyArticles = req.DailyArticles

	if err := database.DB.Save(&goal).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update study goal"})
		return
	}

	today, err := ensureTodayStudyRecord(userID.(uint), goal)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update study record"})
		return
	}

	calendar, err := getStudyCalendar(userID.(uint), time.Now(), studyCalendarDays)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load study calendar"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": buildStudyTodayResponse(goal, today, calendar)})
}

func addStudyReadTime(userID uint, seconds int, completedArticle bool) {
	if seconds <= 0 && !completedArticle {
		return
	}

	goal, err := ensureStudyGoal(userID)
	if err != nil {
		return
	}

	record, err := getOrCreateStudyRecord(userID, todayString(), time.Now())
	if err != nil {
		return
	}

	if seconds > 0 {
		record.ReadSeconds += seconds
	}
	if completedArticle {
		record.CompletedArticles++
	}
	updateStudyRecordCompletion(&record, goal)
	database.DB.Save(&record)
}

func addStudyReviewedWord(userID uint) {
	goal, err := ensureStudyGoal(userID)
	if err != nil {
		return
	}

	record, err := getOrCreateStudyRecord(userID, todayString(), time.Now())
	if err != nil {
		return
	}

	record.ReviewedWords++
	updateStudyRecordCompletion(&record, goal)
	database.DB.Save(&record)
}

func ensureStudyGoal(userID uint) (models.StudyGoal, error) {
	goal := models.StudyGoal{
		UserID:           userID,
		DailyReadMinutes: defaultDailyReadMinutes,
		DailyReviewWords: defaultDailyReviewWords,
		DailyArticles:    defaultDailyArticles,
	}

	err := database.DB.Where("user_id = ?", userID).
		Attrs(goal).
		FirstOrCreate(&goal).Error
	return goal, err
}

func ensureTodayStudyRecord(userID uint, goal models.StudyGoal) (models.StudyRecord, error) {
	record, err := getOrCreateStudyRecord(userID, todayString(), time.Now())
	if err != nil {
		return record, err
	}
	updateStudyRecordCompletion(&record, goal)
	if err := database.DB.Save(&record).Error; err != nil {
		return record, err
	}
	return record, nil
}

func getOrCreateStudyRecord(userID uint, date string, activityAt time.Time) (models.StudyRecord, error) {
	record := models.StudyRecord{
		UserID:         userID,
		Date:           date,
		LastActivityAt: activityAt,
	}

	err := database.DB.
		Clauses(clause.OnConflict{DoNothing: true}).
		Where("user_id = ? AND date = ?", userID, date).
		Attrs(record).
		FirstOrCreate(&record).Error
	if err != nil {
		return record, err
	}

	if record.LastActivityAt.IsZero() {
		record.LastActivityAt = activityAt
	}
	return record, nil
}

func updateStudyRecordCompletion(record *models.StudyRecord, goal models.StudyGoal) {
	record.LastActivityAt = time.Now()
	record.IsCompleted = record.ReadSeconds >= goal.DailyReadMinutes*60 &&
		record.ReviewedWords >= goal.DailyReviewWords &&
		record.CompletedArticles >= goal.DailyArticles
}

func getStudyCalendar(userID uint, now time.Time, days int) ([]models.StudyRecord, error) {
	start := now.AddDate(0, 0, -days+1).Format("2006-01-02")
	end := now.Format("2006-01-02")

	var records []models.StudyRecord
	if err := database.DB.
		Where("user_id = ? AND date BETWEEN ? AND ?", userID, start, end).
		Order("date ASC").
		Find(&records).Error; err != nil {
		return nil, err
	}

	byDate := make(map[string]models.StudyRecord, len(records))
	for _, record := range records {
		byDate[record.Date] = record
	}

	calendar := make([]models.StudyRecord, 0, days)
	for index := days - 1; index >= 0; index-- {
		date := now.AddDate(0, 0, -index).Format("2006-01-02")
		if record, ok := byDate[date]; ok {
			calendar = append(calendar, record)
			continue
		}
		calendar = append(calendar, models.StudyRecord{UserID: userID, Date: date})
	}
	return calendar, nil
}

func buildStudyTodayResponse(goal models.StudyGoal, today models.StudyRecord, calendar []models.StudyRecord) studyTodayResponse {
	progress := studyProgress{
		ReadMinutes:       int(math.Ceil(float64(today.ReadSeconds) / 60)),
		ReviewedWords:     today.ReviewedWords,
		CompletedArticles: today.CompletedArticles,
	}

	return studyTodayResponse{
		Goal:        goal,
		Today:       today,
		Progress:    progress,
		Completion:  calculateStudyCompletion(goal, today),
		IsCompleted: today.IsCompleted,
		Streak:      calculateStudyStreak(calendar),
		Calendar:    calendar,
	}
}

func calculateStudyCompletion(goal models.StudyGoal, record models.StudyRecord) int {
	readRatio := ratio(record.ReadSeconds, goal.DailyReadMinutes*60)
	reviewRatio := ratio(record.ReviewedWords, goal.DailyReviewWords)
	articleRatio := ratio(record.CompletedArticles, goal.DailyArticles)
	return int(math.Round((readRatio + reviewRatio + articleRatio) / 3 * 100))
}

func ratio(value, target int) float64 {
	if target <= 0 {
		return 1
	}
	if value >= target {
		return 1
	}
	if value <= 0 {
		return 0
	}
	return float64(value) / float64(target)
}

func calculateStudyStreak(calendar []models.StudyRecord) int {
	streak := 0
	for index := len(calendar) - 1; index >= 0; index-- {
		if !calendar[index].IsCompleted {
			break
		}
		streak++
	}
	return streak
}

func todayString() string {
	return time.Now().Format("2006-01-02")
}

func isRecordNotFound(err error) bool {
	return err != nil && err == gorm.ErrRecordNotFound
}
