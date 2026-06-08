package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"gugudu-backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type MembershipHandler struct {
	db *gorm.DB
}

type membershipPlan struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	NameEN      string   `json:"name_en"`
	Price       float64  `json:"price"`
	Currency    string   `json:"currency"`
	Duration    int      `json:"duration"`
	SavePercent int      `json:"save_percent"`
	Features    []string `json:"features"`
	Recommended bool     `json:"recommended,omitempty"`
}

func NewMembershipHandler(db *gorm.DB) *MembershipHandler {
	return &MembershipHandler{db: db}
}

// GetMembershipInfo 获取会员信息
func (h *MembershipHandler) GetMembershipInfo(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	isPremiumActive := ensureMembershipActive(h.db, &user)

	c.JSON(http.StatusOK, gin.H{
		"is_premium":        isPremiumActive,
		"membership_type":   user.MembershipType,
		"membership_expiry": user.MembershipExpiry,
		"is_lifetime":       user.IsPremium && user.MembershipType == "lifetime",
	})
}

// GetMembershipPlans 获取会员套餐列表
func (h *MembershipHandler) GetMembershipPlans(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"plans": membershipPlans(),
	})
}

// GetMembershipBenefits 获取会员权益列表
func (h *MembershipHandler) GetMembershipBenefits(c *gin.Context) {
	var benefits []models.MembershipBenefit
	if err := h.db.Order("sort_order ASC").Find(&benefits).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取权益列表失败"})
		return
	}

	// 如果没有权益数据，返回默认权益
	if len(benefits) == 0 {
		defaultBenefits := []gin.H{
			{
				"name":        "无限阅读",
				"name_en":     "Unlimited Reading",
				"description": "解锁所有文章，无阅读限制",
				"icon":        "📚",
				"for_free":    false,
				"for_premium": true,
			},
			{
				"name":        "AI 智能翻译",
				"name_en":     "AI Translation",
				"description": "划词翻译，支持段落翻译",
				"icon":        "🌐",
				"for_free":    true,
				"for_premium": true,
			},
			{
				"name":        "生词本",
				"name_en":     "Vocabulary",
				"description": "保存生词，智能复习",
				"icon":        "📝",
				"for_free":    true,
				"for_premium": true,
			},
			{
				"name":        "学习追踪",
				"name_en":     "Progress Tracking",
				"description": "记录学习进度和统计",
				"icon":        "📊",
				"for_free":    true,
				"for_premium": true,
			},
			{
				"name":        "离线下载",
				"name_en":     "Offline Download",
				"description": "下载文章离线阅读",
				"icon":        "💾",
				"for_free":    false,
				"for_premium": true,
			},
			{
				"name":        "优先支持",
				"name_en":     "Priority Support",
				"description": "专属客服，快速响应",
				"icon":        "🎯",
				"for_free":    false,
				"for_premium": true,
			},
		}
		c.JSON(http.StatusOK, gin.H{"benefits": defaultBenefits})
		return
	}

	c.JSON(http.StatusOK, gin.H{"benefits": benefits})
}

// CreateOrder 创建订单
func (h *MembershipHandler) CreateOrder(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req struct {
		ProductType string `json:"product_type" binding:"required"` // monthly, yearly, lifetime
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// 验证产品类型
	var amount float64
	var duration int
	plan, ok := findMembershipPlan(req.ProductType)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的产品类型"})
		return
	}
	amount = plan.Price
	duration = plan.Duration

	// 生成订单号
	orderNo, err := generateOrderNo()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成订单号失败"})
		return
	}

	// 计算到期时间
	var expiryTime *time.Time
	if duration > 0 {
		expiry := calculateMembershipExpiry(time.Now(), duration, nil)
		expiryTime = &expiry
	}

	// 创建订单
	order := models.Order{
		UserID:      userID.(uint),
		OrderNo:     orderNo,
		ProductType: req.ProductType,
		Amount:      amount,
		Currency:    "CNY",
		Status:      "pending",
		ExpiryTime:  expiryTime,
	}

	if err := h.db.Create(&order).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建订单失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"order":   order,
		"plan":    plan,
		"message": "订单创建成功",
	})
}

// GetOrders 获取订单列表
func (h *MembershipHandler) GetOrders(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var orders []models.Order
	if err := h.db.Where("user_id = ?", userID).Order("created_at DESC").Find(&orders).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取订单列表失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"orders": orders,
	})
}

// ActivateMembership 激活会员（模拟支付完成）
func (h *MembershipHandler) ActivateMembership(c *gin.Context) {
	userID, _ := c.Get("user_id")
	orderNo := c.Param("order_no")

	var order models.Order
	if err := h.db.Where("order_no = ? AND user_id = ?", orderNo, userID).First(&order).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "订单不存在"})
		return
	}

	if order.Status == "paid" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "订单已支付"})
		return
	}

	// 开始事务
	tx := h.db.Begin()

	// 更新订单状态
	now := time.Now()
	order.Status = "paid"
	order.PaymentTime = &now
	order.PaymentMethod = "demo" // 演示环境

	if err := tx.Save(&order).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新订单失败"})
		return
	}

	// 更新用户会员状态
	var user models.User
	if err := tx.First(&user, userID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	user.IsPremium = true
	user.MembershipType = order.ProductType
	if order.ProductType == "lifetime" {
		user.MembershipExpiry = nil
		order.ExpiryTime = nil
	} else {
		_, duration, ok := planPricing(order.ProductType)
		if !ok {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的产品类型"})
			return
		}
		expiry := calculateMembershipExpiry(now, duration, user.MembershipExpiry)
		user.MembershipExpiry = &expiry
		order.ExpiryTime = &expiry
	}

	if err := tx.Save(&order).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新订单失败"})
		return
	}

	if err := tx.Save(&user).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新用户状态失败"})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, gin.H{
		"message": "会员激活成功",
		"user": gin.H{
			"is_premium":        user.IsPremium,
			"membership_type":   user.MembershipType,
			"membership_expiry": user.MembershipExpiry,
			"is_lifetime":       user.MembershipType == "lifetime",
		},
	})
}

// CheckPremiumAccess 检查是否有会员权限（工具函数）
func CheckPremiumAccess(db *gorm.DB, userID uint) (bool, error) {
	var user models.User
	if err := db.First(&user, userID).Error; err != nil {
		return false, err
	}

	if !user.IsPremium {
		return false, nil
	}

	if user.MembershipType == "lifetime" {
		return true, nil
	}

	// 检查是否过期
	if user.MembershipExpiry != nil && user.MembershipExpiry.Before(time.Now()) {
		// 自动更新为非会员状态
		user.IsPremium = false
		db.Save(&user)
		return false, nil
	}

	return true, nil
}

func membershipPlans() []membershipPlan {
	return []membershipPlan{
		{
			ID:          "monthly",
			Name:        "月度会员",
			NameEN:      "Monthly",
			Price:       29.9,
			Currency:    "CNY",
			Duration:    30,
			SavePercent: 0,
			Features: []string{
				"无限制阅读所有文章",
				"AI 句子精读与智能翻译",
				"生词本和复习计划",
				"学习进度追踪",
			},
		},
		{
			ID:          "yearly",
			Name:        "年度会员",
			NameEN:      "Yearly",
			Price:       199.9,
			Currency:    "CNY",
			Duration:    365,
			SavePercent: 44,
			Features: []string{
				"无限制阅读所有文章",
				"AI 句子精读与智能翻译",
				"生词本和复习计划",
				"学习进度追踪",
				"优先客服支持",
				"独家学习资料",
			},
			Recommended: true,
		},
		{
			ID:          "lifetime",
			Name:        "终身会员",
			NameEN:      "Lifetime",
			Price:       599.9,
			Currency:    "CNY",
			Duration:    -1,
			SavePercent: 66,
			Features: []string{
				"无限制阅读所有文章",
				"AI 句子精读与智能翻译",
				"生词本和复习计划",
				"学习进度追踪",
				"优先客服支持",
				"独家学习资料",
				"终身免费更新",
				"VIP 专属徽章",
			},
		},
	}
}

func findMembershipPlan(productType string) (membershipPlan, bool) {
	for _, plan := range membershipPlans() {
		if plan.ID == productType {
			return plan, true
		}
	}
	return membershipPlan{}, false
}

func planPricing(productType string) (float64, int, bool) {
	plan, ok := findMembershipPlan(productType)
	if !ok {
		return 0, 0, false
	}
	return plan.Price, plan.Duration, true
}

func generateOrderNo() (string, error) {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return fmt.Sprintf("GGD%s%s", time.Now().UTC().Format("20060102150405"), strings.ToUpper(hex.EncodeToString(buf))), nil
}

func calculateMembershipExpiry(now time.Time, durationDays int, currentExpiry *time.Time) time.Time {
	base := now
	if currentExpiry != nil && currentExpiry.After(now) {
		base = *currentExpiry
	}
	return base.AddDate(0, 0, durationDays)
}

func ensureMembershipActive(db *gorm.DB, user *models.User) bool {
	if !user.IsPremium {
		return false
	}
	if user.MembershipType == "lifetime" {
		return true
	}
	if user.MembershipExpiry == nil {
		user.IsPremium = false
		user.MembershipType = "free"
		db.Save(user)
		return false
	}
	if user.MembershipExpiry.Before(time.Now()) {
		user.IsPremium = false
		user.MembershipType = "free"
		db.Save(user)
		return false
	}
	return true
}
