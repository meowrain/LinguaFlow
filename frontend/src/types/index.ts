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
  forgotten_count: number;
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

export interface StudyGoal {
  id: number;
  user_id: number;
  daily_read_minutes: number;
  daily_review_words: number;
  daily_articles: number;
  created_at: string;
  updated_at: string;
}

export interface StudyRecord {
  id?: number;
  user_id: number;
  date: string;
  read_seconds: number;
  reviewed_words: number;
  completed_articles: number;
  is_completed: boolean;
  last_activity_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StudyToday {
  goal: StudyGoal;
  today: StudyRecord;
  progress: {
    read_minutes: number;
    reviewed_words: number;
    completed_articles: number;
  };
  completion: number;
  is_completed: boolean;
  streak: number;
  calendar: StudyRecord[];
}

export interface Subscription {
  id: number;
  user_id: number;
  article_id: number;
  article?: Article;
  created_at: string;
  updated_at: string;
}

export interface MembershipPlan {
  id: 'monthly' | 'yearly' | 'lifetime';
  name: string;
  name_en: string;
  price: number;
  currency: string;
  duration: number;
  save_percent: number;
  features: string[];
  recommended?: boolean;
}

export interface MembershipBenefit {
  id?: number;
  name: string;
  name_en?: string;
  description: string;
  icon?: string;
  for_free: boolean;
  for_premium: boolean;
  sort_order?: number;
}

export interface MembershipInfo {
  is_premium: boolean;
  membership_type: 'free' | 'monthly' | 'yearly' | 'lifetime';
  membership_expiry?: string | null;
  is_lifetime?: boolean;
}

export interface MembershipOrder {
  id: number;
  order_no: string;
  product_type: 'monthly' | 'yearly' | 'lifetime';
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  payment_method?: string;
  payment_time?: string | null;
  expiry_time?: string | null;
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

export interface ArticleAssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ArticleAssistantResult {
  message: ArticleAssistantMessage;
  provider: string;
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

export interface RSSFeedSummary {
  name: string;
  source: string;
  category_name?: string;
  category_en?: string;
  category_slug?: string;
  tags?: string;
  enabled: boolean;
  article_count: number;
  latest_article?: Article;
  latest_published_at?: string;
}

export interface RSSImportFeedReport {
  name: string;
  url: string;
  created: number;
  updated: number;
  skipped: number;
  errors?: string[];
}

export interface RSSImportReport {
  feeds: RSSImportFeedReport[];
  created: number;
  updated: number;
  skipped: number;
  errors?: string[];
  imported_at: string;
}

export interface AO3WorkSummary {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  fandoms: string[];
  rating: string;
  warnings: string[];
  categories: string[];
  relationships: string[];
  characters: string[];
  tags: string[];
  language: string;
  words: string;
  chapters: string;
  comments: string;
  kudos: string;
  bookmarks: string;
  hits: string;
  updated_at: string;
  url: string;
  ao3_path: string;
}

export interface AO3SearchResponse {
  query: string;
  page: number;
  works: AO3WorkSummary[];
  has_next: boolean;
  source_url: string;
  disclaimer: string;
}

export interface AO3Chapter {
  id: string;
  index: number;
  title: string;
  summary: string;
  notes: string;
  content_html: string;
  content_text: string;
  paragraphs: string[];
}

export interface AO3Work extends Omit<AO3WorkSummary, 'comments' | 'kudos' | 'bookmarks' | 'hits' | 'ao3_path'> {
  notes: string;
  published_at: string;
  content_html: string;
  content_text: string;
  paragraphs: string[];
  chapters_data: AO3Chapter[];
  disclaimer: string;
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

export interface AdminArticleInput {
  title: string;
  title_cn?: string;
  slug?: string;
  summary?: string;
  summary_cn?: string;
  content: string;
  content_cn?: string;
  cover_image?: string;
  category_id: number;
  tags?: string;
  source?: string;
  source_url?: string;
  author?: string;
  published_at?: string;
  difficulty_level?: 'easy' | 'medium' | 'hard' | 'auto';
  status?: 'draft' | 'published' | 'archived';
  is_featured?: boolean;
}
