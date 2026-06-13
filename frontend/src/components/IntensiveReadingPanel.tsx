'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { articleAPI } from '@/lib/api';
import { Article, SentenceAnalysis } from '@/types';

interface Props {
  article: Article;
}

export default function IntensiveReadingPanel({ article }: Props) {
  const [selectedSentence, setSelectedSentence] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SentenceAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  const sentences = (article.content || '').split(/[.!?]+/).filter(Boolean);

  const handleSentenceClick = async (sentence: string) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    
    setSelectedSentence(trimmed);
    setLoading(true);
    setAnalysis(null);
    
    try {
      const result = await articleAPI.analyzeSentence(article.slug, trimmed);
      setAnalysis(result);
    } catch (error) {
      console.error('Failed to analyze sentence:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSentence = async () => {
    if (!selectedSentence) return;
    try {
      await articleAPI.saveSentence(article.slug, selectedSentence, analysis ? JSON.stringify(analysis) : undefined);
      alert('句子已收藏！');
    } catch (error) {
      console.error('Failed to save sentence:', error);
      alert('收藏失败，请重试');
    }
  };

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[500px] gap-4">
      {/* 左侧：原文句子列表 */}
      <div className="w-1/2 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/50 p-4">
        <h3 className="mb-4 text-sm font-semibold text-gray-400">点击句子查看解析</h3>
        <div className="space-y-2">
          {sentences.map((sentence, index) => {
            const trimmed = sentence.trim();
            if (!trimmed) return null;
            return (
              <button
                key={index}
                onClick={() => handleSentenceClick(trimmed)}
                className={`w-full text-left rounded-lg p-3 text-sm transition-colors ${
                  selectedSentence === trimmed 
                    ? 'bg-sky-900/30 border border-sky-500/50 text-sky-200' 
                    : 'hover:bg-gray-800 text-gray-300'
                }`}
              >
                {trimmed}
              </button>
            );
          })}
        </div>
      </div>

      {/* 右侧：解析面板 */}
      <div className="w-1/2 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/50 p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : analysis ? (
          <div className="space-y-4">
            {/* 语法拆解 */}
            <div className="rounded-lg bg-gray-800/50 p-4">
              <h4 className="mb-2 font-semibold text-sky-400">语法拆解</h4>
              <p className="text-sm text-gray-300">{analysis.grammar || '暂无解析'}</p>
            </div>

            {/* 难词注释 */}
            <div className="rounded-lg bg-gray-800/50 p-4">
              <h4 className="mb-2 font-semibold text-sky-400">难词注释</h4>
              {analysis.difficult_words && analysis.difficult_words.length > 0 ? (
                <div className="space-y-1">
                  {analysis.difficult_words.map((word, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="font-medium text-gray-200">{word.word}</span>
                      <span className="text-gray-400">{word.definition}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">暂无</p>
              )}
            </div>

            {/* 翻译 */}
            <div className="rounded-lg bg-gray-800/50 p-4">
              <h4 className="mb-2 font-semibold text-sky-400">翻译</h4>
              <p className="text-sm text-gray-300">{analysis.translation || '暂无翻译'}</p>
            </div>

            {/* 重点表达 */}
            <div className="rounded-lg bg-gray-800/50 p-4">
              <h4 className="mb-2 font-semibold text-sky-400">重点表达</h4>
              {analysis.expressions && analysis.expressions.length > 0 ? (
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
                  {analysis.expressions.map((exp, i) => (
                    <li key={i}>{exp}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">暂无</p>
              )}
            </div>

            {/* 收藏按钮 */}
            <button
              onClick={handleSaveSentence}
              className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
            >
              收藏此句
            </button>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            点击左侧句子查看解析
          </div>
        )}
      </div>
    </div>
  );
}