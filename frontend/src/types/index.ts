export interface Article {
  id: number;
  title: string;
  title_cn?: string;
  slug: string;
  summary: string;
  summary_cn?: string;
  content: string;
  content_cn?: string;
  cover_image?: string;
  category_id: number;
  category?: Category;
  tags?: string;
  source?: string;
  source_url?: string;
  author?: string;
  published_at: string;
  difficulty_level: 'easy' | 'medium' | 'hard';
  word_count: number;
  reading_time: number;
  view_count: number;
  status: string;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  name_en?: string;
  slug: string;
  description?: string;
  icon?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Vocabulary {
  id: number;
  user_id: number;
  word: string;
  phonetic?: string;
  definition?: string;
  translation?: string;
  examples?: string;
  article_id?: number;
  context?: string;
  is_learned: boolean;
  review_count: number;
  last_review?: string;
  next_review_at?: string;
  review_interval: number;
  review_ease: number;
  created_at: string;
  updated_at: string;
}

export interface ReadHistory {
  id: number;
  user_id: number;
  article_id: number;
  article?: Article;
  read_progress: number;
  read_time: number;
  last_read_at: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: number;
  user_id: number;
  article_id: number;
  article?: Article;
  created_at: string;
  updated_at: string;
}

export interface TranslationResult {
  source_text: string;
  translation: string;
  target_lang: string;
  cached: boolean;
}

export interface SentenceAnalysis {
  sentence: string;
  translation: string;
  word_count: number;
  structure: string[];
  key_phrases: string[];
  difficulty_tips: string[];
  provider?: string;
}

export interface ArticleCompletion {
  article: Article;
  history: ReadHistory;
  stats: {
    read_time: number;
    read_progress: number;
    is_completed: boolean;
    new_words: number;
    learned_words: number;
    due_review_words: number;
  };
  words: Vocabulary[];
  next_article?: Article;
}

export interface PaginationInfo {
  page: number;
  page_size: number;
  total: number;
  total_page: number;
}

export interface ApiResponse<T> {
  data: T;
  pagination?: PaginationInfo;
  message?: string;
}
