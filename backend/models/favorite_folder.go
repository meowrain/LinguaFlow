package models

import (
	"time"

	"gorm.io/gorm"
)

// FavoriteFolder 收藏夹
type FavoriteFolder struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID    uint   `gorm:"not null;index" json:"user_id"`
	Name      string `gorm:"size:100;not null" json:"name"`
	Icon      string `gorm:"size:50;default:'folder'" json:"icon"`
	SortOrder int    `gorm:"default:0" json:"sort_order"`
	IsDefault bool   `gorm:"default:false" json:"is_default"`

	User          User           `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Subscriptions []Subscription `gorm:"foreignKey:FolderID" json:"subscriptions,omitempty"`
}
