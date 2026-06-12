'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Flame, Loader2, AlertTriangle } from 'lucide-react';
import { wordBookAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { WordBook, UserWordBook, DailyTasks } from '@/types';
import WordBookCard from '@/components/wordbook/WordBookCard';

const categoryTabs = [
  { key: '', label: '全部' },
  { key: 'cet4', label: 'CET-4' },
  { key: 'cet6', label: 'CET-6' },
  { key: 'kaoyan', label: '考研' },
  { key: 'toefl', label: '托福' },
  { key: 'gre', label: 'GRE' },
];

interface ActiveBookInfo {
  bookId: number;
  name: string;
  backlogCount: number;
  learnedCount: number;
  wordCount: number;
}

export default function WordBookPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuthStore();
  const [books, setBooks] = useState<WordBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('');
  const [mounted, setMounted] = useState(false);
  const [activeBooks, setActiveBooks] = useState<ActiveBookInfo[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isAuthenticated || !token) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const [booksRes] = await Promise.all([
          wordBookAPI.list(activeCategory ? { category: activeCategory } : undefined),
        ]);
        const loadedBooks: WordBook[] = booksRes.data.data || [];
        setBooks(loadedBooks);

        // 获取已订阅词书的堆积信息
        const active: ActiveBookInfo[] = [];
        for (const book of loadedBooks) {
          try {
            const detailRes = await wordBookAPI.get(book.id);
            const detail = detailRes.data.data;
            if (detail.is_subscribed && detail.user_progress) {
              try {
                const todayRes = await wordBookAPI.getToday(book.id);
                const tasks = todayRes.data.data as DailyTasks;
                active.push({
                  bookId: book.id,
                  name: book.name,
                  backlogCount: tasks.backlog_count,
                  learnedCount: detail.user_progress.learned_count,
                  wordCount: book.word_count,
                });
              } catch {
                // 静默
              }
            }
          } catch {
            // 静默
          }
        }
        setActiveBooks(active);
      } catch (err) {
        console.error('Failed to load wordbooks:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [mounted, isAuthenticated, token, activeCategory]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 页面标题 */}
      <section className="mb-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm font-semibold text-blue-600 dark:text-blue-400">
          <BookOpen className="h-4 w-4" />
          词书背词
        </div>
        <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-gray-100">
          选择你的词书,开始每日背词
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          系统化记忆四六级、考研、托福等考试核心词汇,每天进步一点点。
        </p>
      </section>

      {/* 我的活跃词书 */}
      {activeBooks.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-gray-950 dark:text-gray-100">
            我的活跃词书
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeBooks.map((ab) => {
              const pct = ab.wordCount > 0 ? Math.round((ab.learnedCount / ab.wordCount) * 100) : 0;
              return (
                <Link
                  key={ab.bookId}
                  href={`/wordbook/${ab.bookId}`}
                  className="relative rounded-xl border border-gray-200 bg-white p-4 transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
                >
                  {ab.backlogCount > 100 && (
                    <div className="absolute -right-1 -top-1 flex items-center gap-1 rounded-full bg-yellow-500 px-2 py-0.5 text-xs font-bold text-white shadow">
                      <AlertTriangle className="h-3 w-3" />
                      堆积 {ab.backlogCount}
                    </div>
                  )}
                  <h3 className="font-bold text-gray-950 dark:text-gray-100">{ab.name}</h3>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      {ab.learnedCount}/{ab.wordCount}
                    </span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 分类 Tab */}
      <div className="mb-6 flex flex-wrap gap-2">
        {categoryTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveCategory(tab.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeCategory === tab.key
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 加载中 */}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      )}

      {/* 词书列表 */}
      {!loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <WordBookCard key={book.id} book={book} />
          ))}
        </div>
      )}

      {!loading && books.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-700" />
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400">
            暂无可用词书
          </p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            更多词书正在准备中
          </p>
        </div>
      )}
    </div>
  );
}
