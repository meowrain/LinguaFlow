package middleware

import (
	"net/http"
	"time"

	"gugudu-backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PremiumRequired 会员权限中间件
func PremiumRequired(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
			c.Abort()
			return
		}

		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "用户不存在"})
			c.Abort()
			return
		}

		// 检查是否是会员
		if !user.IsPremium {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "此功能需要会员权限",
				"code":  "PREMIUM_REQUIRED",
			})
			c.Abort()
			return
		}

		if user.MembershipType == "lifetime" {
			c.Next()
			return
		}

		if user.MembershipExpiry == nil {
			user.IsPremium = false
			user.MembershipType = "free"
			db.Save(&user)

			c.JSON(http.StatusForbidden, gin.H{
				"error": "会员状态无效，请重新开通",
				"code":  "MEMBERSHIP_INVALID",
			})
			c.Abort()
			return
		}

		// 检查会员是否过期
		if user.MembershipExpiry.Before(time.Now()) {
			// 自动更新为非会员
			user.IsPremium = false
			user.MembershipType = "free"
			db.Save(&user)

			c.JSON(http.StatusForbidden, gin.H{
				"error": "会员已过期，请续费",
				"code":  "MEMBERSHIP_EXPIRED",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
