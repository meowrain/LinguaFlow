'use client';

import { useEffect, useState } from 'react';
import { vocabularyAPI } from '@/lib/api';
import { Vocabulary } from '@/types';
import { BookOpen, Check, Loader2, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';

export default function VocabularyPage() {
  const [vocabulary, setVocabulary] = useState<Vocabulary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'due' | 'all' | 'learning' | 'learned'>('due');
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  const fetchVocabulary = async () => {
    try {
      setLoading(true);
      const response = await vocabularyAPI.getVocabulary();
      setVocabulary(response.data.data);
    } catch (error) {
      console.error('Failed to fetch vocabulary:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVocabulary();
  }, []);

  const handleMarkLearned = async (id: number) => {
    try {
      await vocabularyAPI.markLearned(id);
      setVocabulary((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, is_learned: true } : item
        )
      );
    } catch (error) {
      console.error('Failed to mark as learned:', error);
    }
  };

  const handleReview = async (id: number, rating: 'forgot' | 'hard' | 'good') => {
    try {
      setReviewingId(id);
      const response = await vocabularyAPI.reviewWord(id, rating);
      setVocabulary((prev) =>
        prev.map((item) => (item.id === id ? response.data.data : item))
      );
    } catch (error) {
      console.error('Failed to review word:', error);
    } finally {
      setReviewingId(null);
    }
  };

  const isDue = (item: Vocabulary) => {
    if (!item.next_review_at) return true;
    return new Date(item.next_review_at).getTime() <= Date.now();
  };

  const filteredVocabulary = vocabulary.filter((item) => {
    if (filter === 'due') return !item.is_learned || isDue(item);
    if (filter === 'learning') return !item.is_learned;
    if (filter === 'learned') return item.is_learned;
    return true;
  });

  const dueCount = vocabulary.filter((item) => !item.is_learned || isDue(item)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">我的生词本</h1>
        <p className="text-gray-400">
          已收藏 {vocabulary.length} 个单词，已掌握{' '}
          {vocabulary.filter((v) => v.is_learned).length} 个，今日待复习 {dueCount} 个
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-center space-x-2 mb-6">
        <button
          onClick={() => setFilter('due')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            filter === 'due'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          今日复习 ({dueCount})
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          全部 ({vocabulary.length})
        </button>
        <button
          onClick={() => setFilter('learning')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            filter === 'learning'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          学习中 ({vocabulary.filter((v) => !v.is_learned).length})
        </button>
        <button
          onClick={() => setFilter('learned')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            filter === 'learned'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          已掌握 ({vocabulary.filter((v) => v.is_learned).length})
        </button>
      </div>

      {/* Vocabulary List */}
      {filteredVocabulary.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500">暂无生词</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredVocabulary.map((item) => (
            <div
              key={item.id}
              className="bg-gray-900/50 border border-gray-800 rounded-lg p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-1">{item.word}</h3>
                  {item.phonetic && (
                    <p className="text-sm text-gray-500">{item.phonetic}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    复习 {item.review_count} 次
                    {item.next_review_at
                      ? ` · 下次 ${format(new Date(item.next_review_at), 'yyyy-MM-dd')}`
                      : ' · 尚未安排'}
                  </p>
                </div>
                {item.is_learned && (
                  <span className="flex items-center space-x-1 text-green-400 text-sm">
                    <Check className="w-4 h-4" />
                    <span>已掌握</span>
                  </span>
                )}
              </div>

              {item.translation && (
                <p className="text-gray-300 mb-3">{item.translation}</p>
              )}

              {item.context && (
                <div className="bg-gray-800/50 rounded p-3 mb-3 text-sm">
                  <p className="text-gray-400">{item.context}</p>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  添加于 {format(new Date(item.created_at), 'yyyy-MM-dd')}
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleReview(item.id, 'forgot')}
                    disabled={reviewingId === item.id}
                    className="inline-flex items-center gap-1 rounded bg-gray-700 px-2 py-1 text-white transition-colors hover:bg-gray-600 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    忘记
                  </button>
                  <button
                    onClick={() => handleReview(item.id, 'hard')}
                    disabled={reviewingId === item.id}
                    className="rounded bg-yellow-600 px-2 py-1 text-white transition-colors hover:bg-yellow-500 disabled:opacity-50"
                  >
                    模糊
                  </button>
                  <button
                    onClick={() => handleReview(item.id, 'good')}
                    disabled={reviewingId === item.id}
                    className="rounded bg-green-600 px-2 py-1 text-white transition-colors hover:bg-green-500 disabled:opacity-50"
                  >
                    记得
                  </button>
                  {!item.is_learned && (
                    <button
                      onClick={() => handleMarkLearned(item.id)}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-white transition-colors"
                    >
                      标记已掌握
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
