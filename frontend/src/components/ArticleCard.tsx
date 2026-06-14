'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Article } from '@/types';
import { isRemoteHTTPURL, resolveAPIAssetURL } from '@/lib/api';
import { Calendar, Clock, Eye, BookOpen } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface ArticleCardProps {
  article: Article;
}

const difficultyColors = {
  easy: 'bg-success-soft text-success-soft-fg',
  medium: 'bg-warning-soft text-warning-soft-fg',
  hard: 'bg-danger-soft text-danger-soft-fg',
};

const difficultyLabels = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

export default function ArticleCard({ article }: ArticleCardProps) {
  const [imageError, setImageError] = useState(false);
  const coverImageURL = article.cover_image ? resolveAPIAssetURL(article.cover_image) : '';
  const shouldBypassImageOptimizer = isRemoteHTTPURL(coverImageURL);

  // Deterministic image height variation based on title length for waterfall effect
  const titleLen = article.title?.length || 0;
  const imageHeights = ['h-36', 'h-44', 'h-48', 'h-52', 'h-56', 'h-60'];
  const imageHeight = imageHeights[titleLen % imageHeights.length];
  const placeholderHeight = imageHeights[(titleLen + 1) % imageHeights.length];

  return (
    <Link
      href={`/articles/${article.slug}`}
      className="block rounded-lg overflow-hidden transition-all duration-300 group mb-6 break-inside-avoid"
      style={{ backgroundColor: 'color-mix(in srgb, var(--surface) 60%, transparent)', border: '1px solid var(--border)' }}
    >
      {/* Cover Image */}
      {coverImageURL && !imageError ? (
        <div className={`relative ${imageHeight} w-full overflow-hidden`} style={{ backgroundColor: 'var(--surface-muted)' }}>
          <Image
            src={coverImageURL}
            alt={article.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized={shouldBypassImageOptimizer}
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div
          className={`${placeholderHeight} w-full flex items-center justify-center`}
          style={{ background: 'linear-gradient(135deg, var(--surface-muted), var(--border))' }}
        >
          <BookOpen className="w-16 h-16" style={{ color: 'var(--muted)' }} />
        </div>
      )}

      <div className="p-5">
        {/* Category and Difficulty */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium" style={{ color: 'var(--accent-soft-fg)' }}>
            {article.category?.name || article.source || 'MIT Technology Review'}
          </span>
          <span
            className={`text-xs px-2 py-1 rounded ${
              difficultyColors[article.difficulty_level]
            }`}
          >
            {difficultyLabels[article.difficulty_level]}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold mb-2 line-clamp-2 transition-colors group-hover:text-[var(--accent)]">
          {article.title}
        </h3>

        {/* Summary */}
        {article.summary && (
          <p className="text-sm text-gray-400 line-clamp-2 mb-4">
            {article.summary}
          </p>
        )}

        {/* Chinese Translation */}
        {article.title_cn && (
          <p className="text-xs text-gray-500 mb-4">{article.title_cn}</p>
        )}

        {/* Meta Info */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {format(new Date(article.published_at), 'yyyy-MM-dd')}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{article.reading_time}分钟</span>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <Eye className="w-3.5 h-3.5" />
            <span>{article.view_count}次</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
