package handlers

import (
	"fmt"
	"net/http"
	"time"

	"gugudu-backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type MembershipHandler struct {
	db *gorm.DB
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

	// 检查会员是否过期
	isPremiumActive := false
	if user.IsPremium && user.MembershipExpiry != nil {
		isPremiumActive = user.MembershipExpiry.After(time.Now())
		// 如果已过期，更新状态
		if !isPremiumActive && user.IsPremium {
			user.IsPremium = false
			h.db.Save(&user)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"is_premium":        user.IsPremium && isPremiumActive,
		"membership_type":   user.MembershipType,
		"membership_expiry": user.MembershipExpiry,
	})
}

// GetMembershipPlans 获取会员套餐列表
func (h *MembershipHandler) GetMembershipPlans(c *gin.Context) {
	plans := []gin.H{
		{
			"id":          "monthly",
			"name":        "月度会员",
			"name_en":     "Monthly",
			"price":       29.9,
			"currency":    "CNY",
			"duration":    30,
			"save_percent": 0,
			"features": []string{
				"无限制阅读所有文章",
				"AI 智能翻译",
				"生词本功能",
				"学习进度追踪",
			},
		},
		{
			"id":          "yearly",
			"name":        "年度会员",
			"name_en":     "Yearly",
			"price":       199.9,
			"currency":    "CNY",
			"duration":    365,
			"save_percent": 44,
			"features": []string{
				"无限制阅读所有文章",
				"AI 智能翻译",
				"生词本功能",
				"学习进度追踪",
				"优先客服支持",
				"独家学习资料",
			},
			"recommended": true,
		},
		{
			"id":          "lifetime",
			"name":        "终身会员",
			"name_en":     "Lifetime",
			"price":       599.9,
			"currency":    "CNY",
			"duration":    -1, // -1 表示永久
			"save_percent": 66,
			"features": []string{
				"无限制阅读所有文章",
				"AI 智能翻译",
				"生词本功能",
				"学习进度追踪",
				"优先客服支持",
				"独家学习资料",
				"终身免费更新",
				"VIP 专属徽章",
			},
		},
	}

	c.JSON(http.StatusOK, gin.H{
		"plans": plans,
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
	switch req.ProductType {
	case "monthly":
		amount = 29.9
		duration = 30
	case "yearly":
		amount = 199.9
		duration = 365
	case "lifetime":
		amount = 599.9
		duration = -1
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的产品类型"})
		return
	}

	// 生成订单号
	orderNo := fmt.Sprintf("GGD%d%d", time.Now().Unix(), userID)

	// 计算到期时间
	var expiryTime *time.Time
	if duration > 0 {
		expiry := time.Now().AddDate(0, 0, duration)
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
		"order": order,
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
	user.MembershipExpiry = order.ExpiryTime

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

	// 检查是否过期
	if user.MembershipExpiry != nil && user.MembershipExpiry.Before(time.Now()) {
		// 自动更新为非会员状态
		user.IsPremium = false
		db.Save(&user)
		return false, nil
	}

	return true, nil
}
