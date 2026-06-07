package models

import (
	"time"

	"gorm.io/gorm"
)

// User 用户模型
type User struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	Username  string         `gorm:"uniqueIndex;size:50;not null" json:"username"`
	Email     string         `gorm:"uniqueIndex;size:100;not null" json:"email"`
	Password  string         `gorm:"size:255;not null" json:"-"`
	Nickname  string         `gorm:"size:50" json:"nickname"`
	Avatar    string         `gorm:"size:255" json:"avatar"`
	IsPremium bool           `gorm:"default:false" json:"is_premium"`

	// 会员信息
	MembershipType   string     `gorm:"size:20;default:'free'" json:"membership_type"` // free, monthly, yearly, lifetime
	MembershipExpiry *time.Time `json:"membership_expiry"`                             // 会员到期时间

	// 学习统计
	TotalReadTime int `gorm:"default:0" json:"total_read_time"` // 总阅读时间（分钟）
	ArticlesRead  int `gorm:"default:0" json:"articles_read"`   // 已读文章数
	WordsLearned  int `gorm:"default:0" json:"words_learned"`   // 已学单词数

	// 关联
	Subscriptions []Subscription `gorm:"foreignKey:UserID" json:"subscriptions,omitempty"`
	ReadHistory   []ReadHistory  `gorm:"foreignKey:UserID" json:"read_history,omitempty"`
	Vocabulary    []Vocabulary   `gorm:"foreignKey:UserID" json:"vocabulary,omitempty"`
	Orders        []Order        `gorm:"foreignKey:UserID" json:"orders,omitempty"`
}

// Category 分类
type Category struct {
	ID          uint           `gorm:"primarykey" json:"id"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
	Name        string         `gorm:"size:100;not null" json:"name"`
	NameEN      string         `gorm:"size:100" json:"name_en"`
	Slug        string         `gorm:"uniqueIndex;size:100;not null" json:"slug"`
	Description string         `gorm:"size:500" json:"description"`
	Icon        string         `gorm:"size:100" json:"icon"`
	SortOrder   int            `gorm:"default:0" json:"sort_order"`

	Articles []Article `gorm:"foreignKey:CategoryID" json:"articles,omitempty"`
}

// Article 文章
type Article struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// 基本信息
	Title      string `gorm:"size:500;not null" json:"title"`
	TitleCN    string `gorm:"size:500" json:"title_cn"` // 中文标题
	Slug       string `gorm:"uniqueIndex;size:200;not null" json:"slug"`
	Summary    string `gorm:"type:text" json:"summary"`
	SummaryCN  string `gorm:"type:text" json:"summary_cn"`       // 中文摘要
	Content    string `gorm:"type:text;not null" json:"content"` // 英文内容
	ContentCN  string `gorm:"type:text" json:"content_cn"`       // 中文翻译
	CoverImage string `gorm:"size:500" json:"cover_image"`

	// 分类和标签
	CategoryID uint     `gorm:"not null;index" json:"category_id"`
	Category   Category `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	Tags       string   `gorm:"size:500" json:"tags"` // 逗号分隔

	// 来源信息
	Source      string    `gorm:"size:100" json:"source"` // 来源（如 MIT Technology Review）
	SourceURL   string    `gorm:"size:500" json:"source_url"`
	Author      string    `gorm:"size:100" json:"author"`
	PublishedAt time.Time `json:"published_at"`

	// 阅读难度和统计
	DifficultyLevel string `gorm:"size:20;default:'medium'" json:"difficulty_level"` // easy, medium, hard
	WordCount       int    `gorm:"default:0" json:"word_count"`
	ReadingTime     int    `gorm:"default:0" json:"reading_time"` // 预估阅读时间（分钟）
	ViewCount       int    `gorm:"default:0" json:"view_count"`

	// 状态
	Status     string `gorm:"size:20;default:'draft'" json:"status"` // draft, published, archived
	IsFeatured bool   `gorm:"default:false" json:"is_featured"`

	// 关联
	ReadHistory []ReadHistory `gorm:"foreignKey:ArticleID" json:"read_history,omitempty"`
}

// Subscription 用户订阅（我的订阅）
type Subscription struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID    uint `gorm:"not null;index" json:"user_id"`
	ArticleID uint `gorm:"not null;index" json:"article_id"`

	User    User    `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Article Article `gorm:"foreignKey:ArticleID" json:"article,omitempty"`
}

// ReadHistory 阅读历史
type ReadHistory struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID    uint `gorm:"not null;index:idx_user_article" json:"user_id"`
	ArticleID uint `gorm:"not null;index:idx_user_article" json:"article_id"`

	// 阅读进度
	ReadProgress float64   `gorm:"default:0" json:"read_progress"` // 0-100
	ReadTime     int       `gorm:"default:0" json:"read_time"`     // 阅读时长（秒）
	LastReadAt   time.Time `json:"last_read_at"`
	IsCompleted  bool      `gorm:"default:false" json:"is_completed"`

	User    User    `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Article Article `gorm:"foreignKey:ArticleID" json:"article,omitempty"`
}

// Vocabulary 生词本
type Vocabulary struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID uint   `gorm:"not null;index:idx_user_word" json:"user_id"`
	Word   string `gorm:"size:100;not null;index:idx_user_word" json:"word"`

	// 词汇信息
	Phonetic    string `gorm:"size:100" json:"phonetic"`    // 音标
	Definition  string `gorm:"type:text" json:"definition"` // 释义（JSON格式，包含多个释义）
	Translation string `gorm:"size:500" json:"translation"` // 中文翻译
	Examples    string `gorm:"type:text" json:"examples"`   // 例句（JSON格式）

	// 学习相关
	ArticleID      *uint      `gorm:"index" json:"article_id"`         // 从哪篇文章添加的
	Context        string     `gorm:"type:text" json:"context"`        // 上下文语境
	IsLearned      bool       `gorm:"default:false" json:"is_learned"` // 是否已掌握
	ReviewCount    int        `gorm:"default:0" json:"review_count"`   // 复习次数
	LastReview     *time.Time `json:"last_review"`
	NextReviewAt   *time.Time `gorm:"index" json:"next_review_at"`      // 下次复习时间
	ReviewInterval int        `gorm:"default:0" json:"review_interval"` // 复习间隔（天）
	ReviewEase     float64    `gorm:"default:2.5" json:"review_ease"`   // 间隔重复难度系数

	User    User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Article *Article `gorm:"foreignKey:ArticleID" json:"article,omitempty"`
}

// TranslationCache 翻译缓存
type TranslationCache struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	SourceText  string `gorm:"type:text;not null;uniqueIndex:idx_source_target" json:"source_text"`
	TargetLang  string `gorm:"size:10;not null;uniqueIndex:idx_source_target" json:"target_lang"`
	Translation string `gorm:"type:text;not null" json:"translation"`
	Provider    string `gorm:"size:50" json:"provider"` // 翻译服务提供商
}

// DictionaryCache 查词缓存
type DictionaryCache struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	Word        string `gorm:"size:100;not null;uniqueIndex" json:"word"`
	Provider    string `gorm:"size:50" json:"provider"`
	Phonetic    string `gorm:"size:100" json:"phonetic"`
	UKPhonetic  string `gorm:"size:100" json:"uk_phonetic"`
	USPhonetic  string `gorm:"size:100" json:"us_phonetic"`
	SpeechURL   string `gorm:"size:1000" json:"speech_url"`
	UKSpeechURL string `gorm:"size:1000" json:"uk_speech_url"`
	USSpeechURL string `gorm:"size:1000" json:"us_speech_url"`
	Translation string `gorm:"type:text" json:"translation"`
	Definitions string `gorm:"type:text" json:"definitions"`
	WebMeanings string `gorm:"type:text" json:"web_meanings"`
	Error       string `gorm:"type:text" json:"error"`
}

// Order 订单模型
type Order struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID        uint       `gorm:"not null;index" json:"user_id"`
	OrderNo       string     `gorm:"uniqueIndex;size:100;not null" json:"order_no"` // 订单号
	ProductType   string     `gorm:"size:20;not null" json:"product_type"`          // monthly, yearly, lifetime
	Amount        float64    `gorm:"not null" json:"amount"`                        // 金额
	Currency      string     `gorm:"size:10;default:'CNY'" json:"currency"`         // 货币类型
	Status        string     `gorm:"size:20;default:'pending'" json:"status"`       // pending, paid, cancelled, refunded
	PaymentMethod string     `gorm:"size:50" json:"payment_method"`                 // alipay, wechat, stripe 等
	PaymentTime   *time.Time `json:"payment_time"`
	ExpiryTime    *time.Time `json:"expiry_time"` // 会员到期时间

	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// MembershipBenefit 会员权益
type MembershipBenefit struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Name        string `gorm:"size:100;not null" json:"name"`   // 权益名称
	NameEN      string `gorm:"size:100" json:"name_en"`         // 英文名称
	Description string `gorm:"type:text" json:"description"`    // 描述
	Icon        string `gorm:"size:100" json:"icon"`            // 图标
	ForFree     bool   `gorm:"default:false" json:"for_free"`   // 免费用户是否可用
	ForPremium  bool   `gorm:"default:true" json:"for_premium"` // 会员用户是否可用
	SortOrder   int    `gorm:"default:0" json:"sort_order"`
}
