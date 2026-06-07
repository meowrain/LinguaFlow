'use client';

import { useEffect, useState } from 'react';
import ArticleCard from '@/components/ArticleCard';
import { articleAPI } from '@/lib/api';
import { Article } from '@/types';
import { Loader2 } from 'lucide-react';

export default function LatestPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        setLoading(true);
        const response = await articleAPI.getArticles({ page: 1, page_size: 30 });
        setArticles(response.data.data);
      } catch (err) {
        console.error('Failed to fetch latest articles:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-black">最近更新</h1>
        <p className="text-gray-500">按发布时间浏览全部外刊文章。</p>
      </div>

      {articles.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-10 text-center text-gray-500">
          暂无文章
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
