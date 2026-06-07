package services

import (
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// TranslationProvider 翻译服务提供商接口
type TranslationProvider interface {
	Translate(text, sourceLang, targetLang string) (string, error)
	GetProviderName() string
}

// BaiduTranslator 百度翻译
type BaiduTranslator struct {
	AppID  string
	Secret string
}

// YoudaoTranslator 有道翻译
type YoudaoTranslator struct {
	AppKey    string
	AppSecret string
}

// BaiduTranslateResponse 百度翻译API响应
type BaiduTranslateResponse struct {
	From        string `json:"from"`
	To          string `json:"to"`
	TransResult []struct {
		Src string `json:"src"`
		Dst string `json:"dst"`
	} `json:"trans_result"`
	ErrorCode string `json:"error_code"`
	ErrorMsg  string `json:"error_msg"`
}

// YoudaoTranslateResponse 有道翻译API响应
type YoudaoTranslateResponse struct {
	ErrorCode   string   `json:"errorCode"`
	Translation []string `json:"translation"`
	Basic       *struct {
		Phonetic  string   `json:"phonetic"`
		Explains  []string `json:"explains"`
	} `json:"basic"`
	Web []struct {
		Key   string   `json:"key"`
		Value []string `json:"value"`
	} `json:"web"`
}

// NewBaiduTranslator 创建百度翻译实例
func NewBaiduTranslator(appID, secret string) *BaiduTranslator {
	return &BaiduTranslator{
		AppID:  appID,
		Secret: secret,
	}
}

// NewYoudaoTranslator 创建有道翻译实例
func NewYoudaoTranslator(appKey, appSecret string) *YoudaoTranslator {
	return &YoudaoTranslator{
		AppKey:    appKey,
		AppSecret: appSecret,
	}
}

// Translate 百度翻译实现
func (b *BaiduTranslator) Translate(text, sourceLang, targetLang string) (string, error) {
	// 百度翻译API文档: https://fanyi-api.baidu.com/doc/21
	salt := strconv.Itoa(rand.Intn(100000))
	sign := b.generateSign(text, salt)

	// 语言代码转换（百度使用 zh, en）
	if sourceLang == "" {
		sourceLang = "auto"
	}

	apiURL := "https://fanyi-api.baidu.com/api/trans/vip/translate"
	params := url.Values{}
	params.Set("q", text)
	params.Set("from", sourceLang)
	params.Set("to", targetLang)
	params.Set("appid", b.AppID)
	params.Set("salt", salt)
	params.Set("sign", sign)

	resp, err := http.Get(apiURL + "?" + params.Encode())
	if err != nil {
		return "", fmt.Errorf("百度翻译请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}

	var result BaiduTranslateResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("解析响应失败: %w", err)
	}

	if result.ErrorCode != "" && result.ErrorCode != "52000" {
		return "", fmt.Errorf("百度翻译错误 [%s]: %s", result.ErrorCode, result.ErrorMsg)
	}

	if len(result.TransResult) == 0 {
		return "", fmt.Errorf("翻译结果为空")
	}

	return result.TransResult[0].Dst, nil
}

// generateSign 生成百度翻译签名
func (b *BaiduTranslator) generateSign(text, salt string) string {
	// 签名算法: MD5(appid+q+salt+密钥)
	str := b.AppID + text + salt + b.Secret
	hash := md5.Sum([]byte(str))
	return hex.EncodeToString(hash[:])
}

// GetProviderName 获取提供商名称
func (b *BaiduTranslator) GetProviderName() string {
	return "baidu"
}

// Translate 有道翻译实现
func (y *YoudaoTranslator) Translate(text, sourceLang, targetLang string) (string, error) {
	// 有道翻译API文档: https://ai.youdao.com/DOCSIRMA/html/trans/api/wbfy/index.html
	salt := strconv.FormatInt(time.Now().Unix(), 10)
	curtime := strconv.FormatInt(time.Now().Unix(), 10)
	sign := y.generateSign(text, salt, curtime)

	// 语言代码转换（有道使用 zh-CHS, en）
	if sourceLang == "" {
		sourceLang = "auto"
	}
	if targetLang == "zh" {
		targetLang = "zh-CHS"
	}

	apiURL := "https://openapi.youdao.com/api"
	params := url.Values{}
	params.Set("q", text)
	params.Set("from", sourceLang)
	params.Set("to", targetLang)
	params.Set("appKey", y.AppKey)
	params.Set("salt", salt)
	params.Set("sign", sign)
	params.Set("signType", "v3")
	params.Set("curtime", curtime)

	resp, err := http.Get(apiURL + "?" + params.Encode())
	if err != nil {
		return "", fmt.Errorf("有道翻译请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}

	var result YoudaoTranslateResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("解析响应失败: %w", err)
	}

	if result.ErrorCode != "0" {
		return "", fmt.Errorf("有道翻译错误代码: %s", result.ErrorCode)
	}

	if len(result.Translation) == 0 {
		return "", fmt.Errorf("翻译结果为空")
	}

	return result.Translation[0], nil
}

// generateSign 生成有道翻译签名 (v3)
func (y *YoudaoTranslator) generateSign(text, salt, curtime string) string {
	// 签名算法: SHA256(appKey+input+salt+curtime+appSecret)
	input := y.truncate(text)
	str := y.AppKey + input + salt + curtime + y.AppSecret
	hash := sha256.Sum256([]byte(str))
	return hex.EncodeToString(hash[:])
}

// truncate 截断文本（有道翻译签名规则）
func (y *YoudaoTranslator) truncate(text string) string {
	runes := []rune(text)
	length := len(runes)
	if length <= 20 {
		return text
	}
	return string(runes[:10]) + strconv.Itoa(length) + string(runes[length-10:])
}

// GetProviderName 获取提供商名称
func (y *YoudaoTranslator) GetProviderName() string {
	return "youdao"
}

// TranslationService 翻译服务管理器
type TranslationService struct {
	providers []TranslationProvider
	current   int
}

// NewTranslationService 创建翻译服务
func NewTranslationService() *TranslationService {
	return &TranslationService{
		providers: make([]TranslationProvider, 0),
		current:   0,
	}
}

// AddProvider 添加翻译提供商
func (s *TranslationService) AddProvider(provider TranslationProvider) {
	s.providers = append(s.providers, provider)
}

// Translate 翻译文本（自动切换提供商）
func (s *TranslationService) Translate(text, sourceLang, targetLang string) (string, string, error) {
	if len(s.providers) == 0 {
		return "", "", fmt.Errorf("未配置翻译服务")
	}

	// 尝试当前提供商
	provider := s.providers[s.current]
	result, err := provider.Translate(text, sourceLang, targetLang)
	if err == nil {
		return result, provider.GetProviderName(), nil
	}

	// 如果失败，尝试其他提供商
	for i := 0; i < len(s.providers); i++ {
		if i == s.current {
			continue
		}
		provider = s.providers[i]
		result, err = provider.Translate(text, sourceLang, targetLang)
		if err == nil {
			s.current = i // 切换到成功的提供商
			return result, provider.GetProviderName(), nil
		}
	}

	return "", "", fmt.Errorf("所有翻译服务均失败")
}
