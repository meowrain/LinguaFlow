'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { historyAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { ReadHistory } from '@/types';
import { Loader2 } from 'lucide-react';

export default function HistoryPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuthStore();
  const [history, setHistory] = useState<ReadHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (!isAuthenticated || !token) {
      router.replace('/login');
      return;
    }

    const fetchHistory = async () => {
      try {
        setLoading(true);
        const response = await historyAPI.getReadHistory();
        setHistory(response.data.data);
      } catch (err) {
        console.error('Failed to fetch read history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [isAuthenticated, mounted, router, token]);

  if (!mounted || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-black">阅读历史</h1>
        <p className="text-gray-500">自动记录你打开过的文章和阅读进度。</p>
      </div>

      {history.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-10 text-center text-gray-500">
          暂无阅读历史
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((item) =>
            item.article ? (
              <Link
                key={item.id}
                href={`/articles/${item.article.slug}`}
                className="block rounded-lg border border-gray-800 bg-gray-900/40 p-5 transition-colors hover:border-gray-600"
              >
                <div className="mb-2 flex items-center justify-between gap-4">
                  <h2 className="text-lg font-bold text-gray-100">{item.article.title}</h2>
                  <span className="shrink-0 text-sm text-gray-500">
                    {Math.round(item.read_progress)}%
                  </span>
                </div>
                {item.article.title_cn && (
                  <p className="mb-3 text-gray-400">{item.article.title_cn}</p>
                )}
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${Math.min(100, Math.max(0, item.read_progress))}%` }}
                  />
                </div>
                <p className="mt-3 text-sm text-gray-500">
                  最近阅读：{format(new Date(item.last_read_at), 'yyyy-MM-dd HH:mm')}
                </p>
              </Link>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
