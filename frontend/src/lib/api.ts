import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加 token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期或无效，清除本地存储
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 认证 API
export const authAPI = {
  register: (data: { username: string; email: string; password: string; nickname?: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  getProfile: () =>
    api.get('/profile'),
};

// 文章 API
export const articleAPI = {
  getArticles: (params?: {
    page?: number;
    page_size?: number;
    category?: string;
    difficulty?: string;
    search?: string;
  }) => api.get('/articles', { params }),
  getFeaturedArticles: (limit?: number) =>
    api.get('/articles/featured', { params: { limit } }),
  getArticleBySlug: (slug: string) =>
    api.get(`/articles/${slug}`),
  updateReadProgress: (id: number, data: { progress: number; read_time: number }) =>
    api.post(`/articles/${id}/progress`, data),
  getCompletion: (id: number) =>
    api.get(`/article-completions/${id}`),
};

// 分类 API
export const categoryAPI = {
  getCategories: () => api.get('/categories'),
};

// 翻译 API
export const translationAPI = {
  translate: (data: { text: string; target_lang: string; source_lang?: string }) =>
    api.post('/translate', data),
  lookupWord: (word: string) =>
    api.get('/dictionary', { params: { word } }),
  analyzeSentence: (text: string) =>
    api.post('/sentences/analyze', { text }),
};

// 生词本 API
export const vocabularyAPI = {
  getVocabulary: (params?: { due?: boolean; article_id?: number }) =>
    api.get('/vocabulary', { params }),
  addWord: (data: {
    word: string;
    article_id?: number;
    context?: string;
    phonetic?: string;
    definition?: string;
    translation?: string;
    examples?: string;
  }) => api.post('/vocabulary', data),
  markLearned: (id: number) =>
    api.patch(`/vocabulary/${id}/learned`),
  reviewWord: (id: number, rating: 'forgot' | 'hard' | 'good') =>
    api.post(`/vocabulary/${id}/review`, { rating }),
};

// 订阅 API
export const subscriptionAPI = {
  getSubscriptions: () => api.get('/subscriptions'),
  addSubscription: (article_id: number) =>
    api.post('/subscriptions', { article_id }),
  removeSubscription: (article_id: number) =>
    api.delete(`/subscriptions/${article_id}`),
};

// 历史记录 API
export const historyAPI = {
  getReadHistory: () => api.get('/history'),
};

export default api;
