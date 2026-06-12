'use client';

import Link from 'next/link';
import { BookOpen, Flame, Loader2 } from 'lucide-react';
import { WordBook, UserWordBook } from '@/types';

interface WordBookCardProps {
  book: WordBook;
  progress?: UserWordBook | null;
}

const categoryLabels: Record<string, string> = {
  cet4: 'CET-4',
  cet6: 'CET-6',
  kaoyan: '考研',
  toefl: '托福',
  gre: 'GRE',
  ielts: '雅思',
};

const difficultyLabels: Record<string, string> = {
  beginner: '入门',
  medium: '中等',
  advanced: '进阶',
};

const difficultyColors: Record<string, string> = {
  beginner: 'bg-green-500/10 text-green-500 border-green-500/30',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  advanced: 'bg-red-500/10 text-red-500 border-red-500/30',
};

export default function WordBookCard({ book, progress }: WordBookCardProps) {
  const isSubscribed = Boolean(progress);
  const learnedPct = book.word_count > 0 && progress
    ? Math.round((progress.learned_count / book.word_count) * 100)
    : 0;

  return (
    <Link
      href={`/wordbook/${book.id}`}
      className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-950 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
            {book.name}
          </h3>
          {book.name_en && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{book.name_en}</p>
          )}
        </div>
        <span
          className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
            difficultyColors[book.difficulty] || difficultyColors.medium
          }`}
        >
          {difficultyLabels[book.difficulty] || book.difficulty}
        </span>
      </div>

      <p className="mb-4 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
        {book.description || `${categoryLabels[book.category] || book.category} 核心词汇`}
      </p>

      <div className="mt-auto flex items-center justify-between text-sm">
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <BookOpen className="h-4 w-4" />
            {book.word_count} 词
          </span>
          {book.unit_count > 0 && (
            <span>{book.unit_count} 单元</span>
          )}
        </div>

        {isSubscribed && progress ? (
          <div className="flex items-center gap-2">
            {progress.current_streak > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-orange-500">
                <Flame className="h-3.5 w-3.5" />
                {progress.current_streak}
              </span>
            )}
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              {learnedPct}% 已学
            </span>
          </div>
        ) : (
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
            点击订阅
          </span>
        )}
      </div>

      {isSubscribed && progress && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${learnedPct}%` }}
          />
        </div>
      )}
    </Link>
  );
}
