package handlers

import (
	"fmt"
	"gugudu-backend/services"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

var ao3Client = services.NewAO3Client(12 * time.Second)

func InitAO3Service(proxy string, timeoutSeconds int) {
	if timeoutSeconds < 45 {
		timeoutSeconds = 45
	}
	timeout := time.Duration(timeoutSeconds) * time.Second
	ao3Client = services.NewAO3ClientWithProxy(timeout, proxy)
	if proxy != "" {
		fmt.Printf("✓ AO3 公开搜索已初始化，代理: %s\n", proxy)
	} else {
		fmt.Println("✓ AO3 公开搜索已初始化，未配置代理")
	}
}

func SearchAO3Works(c *gin.Context) {
	query := c.Query("q")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))

	result, err := ao3Client.Search(c.Request.Context(), query, page)
	if err != nil {
		status := http.StatusBadGateway
		if query == "" {
			status = http.StatusBadRequest
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": result})
}

func GetAO3Work(c *gin.Context) {
	work, err := ao3Client.GetWork(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": work})
}
