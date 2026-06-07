package main

import (
	"gugudu-backend/config"
	"gugudu-backend/database"
	"gugudu-backend/handlers"
	"gugudu-backend/middleware"
	"log"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// 加载配置
	cfg := config.LoadConfig()

	// 设置 Gin 模式
	gin.SetMode(cfg.Server.GinMode)

	// 初始化数据库
	if err := database.InitDB(cfg); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer database.CloseDB()

	// 初始化 Redis
	if err := database.InitRedis(cfg); err != nil {
		log.Fatal("Failed to initialize Redis:", err)
	}
	defer database.CloseRedis()

	// 初始化 JWT
	middleware.InitJWT(cfg)

	// 初始化翻译服务
	handlers.InitTranslationService(
		cfg.Translation.BaiduAppID,
		cfg.Translation.BaiduSecret,
		cfg.Translation.BaiduDictAPIKey,
		cfg.Translation.BaiduDictSecretKey,
		cfg.Translation.YoudaoAppKey,
		cfg.Translation.YoudaoAppSecret,
	)
	handlers.InitAIAnalysisService(
		cfg.AI.Enabled,
		cfg.AI.BaseURL,
		cfg.AI.APIKey,
		cfg.AI.Model,
		cfg.AI.RequestTimeout,
	)
	handlers.InitRSSImportService(database.DB, cfg.RSS)

	// 创建 Gin 路由
	r := gin.Default()

	// CORS 配置
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.CORS.AllowedOrigins},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Import-Token"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// API 路由组
	api := r.Group("/api")
	{
		// 认证相关（无需登录）
		auth := api.Group("/auth")
		{
			auth.POST("/register", handlers.Register)
			auth.POST("/login", handlers.Login)
		}

		// 公开文章接口
		articles := api.Group("/articles")
		{
			articles.GET("", middleware.OptionalAuth(), handlers.GetArticles)
			articles.GET("/featured", handlers.GetFeaturedArticles)
			articles.GET("/:slug", middleware.OptionalAuth(), handlers.GetArticleBySlug)
		}

		// 分类
		api.GET("/categories", handlers.GetCategories)

		// 翻译服务（无需登录）
		api.POST("/translate", handlers.Translate)
		api.GET("/dictionary", handlers.LookupWord)

		// RSS 导入（导入 token 保护，供本地脚本或定时任务调用）
		api.POST("/admin/rss/import", handlers.ImportRSS)

		// 需要认证的路由
		protected := api.Group("")
		protected.Use(middleware.AuthRequired())
		{
			// 用户相关
			protected.GET("/profile", handlers.GetProfile)

			// 会员相关
			membershipHandler := handlers.NewMembershipHandler(database.DB)
			membership := protected.Group("/membership")
			{
				membership.GET("/info", membershipHandler.GetMembershipInfo)
				membership.GET("/plans", membershipHandler.GetMembershipPlans)
				membership.GET("/benefits", membershipHandler.GetMembershipBenefits)
				membership.POST("/orders", membershipHandler.CreateOrder)
				membership.GET("/orders", membershipHandler.GetOrders)
				membership.POST("/orders/:order_no/activate", membershipHandler.ActivateMembership)
			}

			// 订阅管理
			protected.GET("/subscriptions", handlers.GetMySubscriptions)
			protected.POST("/subscriptions", handlers.AddSubscription)
			protected.DELETE("/subscriptions/:article_id", handlers.RemoveSubscription)

			// 阅读历史
			protected.GET("/history", handlers.GetReadHistory)
			protected.POST("/articles/:id/progress", handlers.UpdateReadProgress)
			protected.GET("/article-completions/:id", handlers.GetArticleCompletion)
			protected.POST("/sentences/analyze", handlers.AnalyzeSentence)

			// 生词本
			protected.GET("/vocabulary", handlers.GetVocabulary)
			protected.POST("/vocabulary", handlers.AddToVocabulary)
			protected.PATCH("/vocabulary/:id/learned", handlers.MarkWordLearned)
			protected.POST("/vocabulary/:id/review", handlers.ReviewVocabulary)
		}
	}

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// 启动服务器
	log.Printf("Server starting on port %s", cfg.Server.Port)
	if err := r.Run(":" + cfg.Server.Port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
