'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Article, Vocabulary } from '@/types';

function normalizeWord(token: string) {
  return token.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').toLowerCase();
}

function tokenizeParagraph(paragraph: string) {
  return paragraph.split(/([A-Za-z]+(?:[''][A-Za-z]+)?)/g).filter(Boolean);
}

interface ArticleLearningPanelProps {
  article: Article;
  paragraphs: string[];
  vocabularyByWord: Map<string, Vocabulary>;
  isAuthenticated: boolean;
}

export default function ArticleLearningPanel({
  article,
  paragraphs,
  vocabularyByWord,
  isAuthenticated,
}: ArticleLearningPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const analysis = useMemo(() => {
    const articleWords = new Set<string>();
    const learnedInArticle = new Map<string, Vocabulary>();
    const weakInArticle = new Map<string, Vocabulary>();

    paragraphs.forEach((paragraph) => {
      tokenizeParagraph(paragraph).forEach((token) => {
        const word = normalizeWord(token);
        if (!word || word.length < 2) return;
        articleWords.add(word);

        const vocab = vocabularyByWord.get(word);
        if (!vocab) return;

        learnedInArticle.set(word, vocab);
        if (vocab.forgotten_count > 0 || (!vocab.is_learned && vocab.review_count > 0)) {
          weakInArticle.set(word, vocab);
        }
      });
    });

    const uniqueWords = new Set(
      Array.from(articleWords).filter((w) => w.length >= 4)
    );
    const coveragePercent = uniqueWords.size > 0
      ? Math.round((learnedInArticle.size / uniqueWords.size) * 100)
      : 0;

    return {
      articleWords,
      learnedInArticle,
      weakInArticle,
      totalUniqueWords: uniqueWords.size,
      learnedCount: learnedInArticle.size,
      weakWords: Array.from(weakInArticle.values())
        .sort((a, b) => b.forgotten_count - a.forgotten_count)
        .slice(0, 12),
      weakCount: weakInArticle.size,
      coveragePercent: Math.min(coveragePercent, 100),
    };
  }, [paragraphs, vocabularyByWord]);

  if (!isAuthenticated || vocabularyByWord.size === 0) return null;

  return (
    <div
      className="mb-8 rounded-xl border"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--accent-soft) 60%, var(--surface))',
        borderColor: 'var(--accent-soft-border)',
      }}
    >
      {/* Header — always visible */}
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/15">
            <Target className="h-5 w-5 text-sky-300" />
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-gray-100">
              <Sparkles className="h-4 w-4 text-amber-300" />
              本文学习洞察
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              基于你的生词本，分析这篇文章的词汇分布
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-5">
          {/* Stats row */}
          <div className="flex items-center gap-5">
            <div className="text-center">
              <p className="text-2xl font-black text-emerald-400">{analysis.learnedCount}</p>
              <p className="text-xs text-gray-500">已学词</p>
            </div>
            <div className="h-8 w-px bg-gray-800" />
            <div className="text-center">
              <p className="text-2xl font-black text-amber-400">{analysis.weakCount}</p>
              <p className="text-xs text-gray-500">薄弱词</p>
            </div>
            <div className="h-8 w-px bg-gray-800" />
            <div className="text-center">
              <p className="text-2xl font-black text-sky-400">{analysis.coveragePercent}%</p>
              <p className="text-xs text-gray-500">词汇覆盖</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800"
          >
            {expanded ? (
              <>收起 <ChevronUp className="h-3.5 w-3.5" /></>
            ) : (
              <>详情 <ChevronDown className="h-3.5 w-3.5" /></>
            )}
          </button>
        </div>
      </div>

      {/* Coverage bar */}
      <div className="mx-5 mb-5">
        <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--surface-muted)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${analysis.coveragePercent}%`, backgroundColor: 'var(--accent)' }}
          />
        </div>
      </div>

      {/* Quick weak-word chips (always visible when weak words exist) */}
      {analysis.weakWords.length > 0 && (
        <div className="mx-5 mb-5 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            需关注：
          </span>
          {analysis.weakWords.slice(0, 6).map((vocab) => (
            <span
              key={vocab.id}
              className="group relative inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200"
              title={vocab.translation || vocab.definition || ''}
            >
              {vocab.word}
              {vocab.forgotten_count > 0 && (
                <span className="text-amber-400/60">×{vocab.forgotten_count}</span>
              )}
            </span>
          ))}
          {analysis.weakCount > 6 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs font-semibold text-gray-500 hover:text-gray-300"
            >
              +{analysis.weakCount - 6} 更多
            </button>
          )}
        </div>
      )}

      {/* No weak words — show encouragement */}
      {analysis.weakWords.length === 0 && analysis.learnedCount > 0 && (
        <div className="mx-5 mb-5 flex items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          <TrendingUp className="h-3.5 w-3.5" />
          这篇文章里的生词你都学过，放心阅读！
        </div>
      )}

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-gray-800/60 p-5">
          {/* Weak words detail list */}
          {analysis.weakWords.length > 0 && (
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-bold text-gray-200">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  薄弱词详情
                </h4>
                <Link
                  href="/vocabulary?weak=true"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  去复习全部薄弱词
                </Link>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {analysis.weakWords.map((vocab) => (
                  <div
                    key={vocab.id}
                    className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-amber-200">{vocab.word}</span>
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400/70">
                        忘记 {vocab.forgotten_count} 次
                      </span>
                    </div>
                    <p className="line-clamp-1 text-xs leading-5 text-gray-400">
                      {vocab.translation || vocab.definition || ''}
                    </p>
                    {vocab.context && (
                      <p className="mt-1 line-clamp-1 text-xs italic text-gray-600">
                        &ldquo;{vocab.context.length > 50 ? vocab.context.slice(0, 50) + '...' : vocab.context}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Learned words overview */}
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-200">
              <BookOpen className="h-4 w-4 text-emerald-400" />
              已掌握词 ({analysis.learnedCount})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(analysis.learnedInArticle.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([word, vocab]) => (
                  <span
                    key={word}
                    className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-300"
                    title={
                      vocab.translation
                        ? `${vocab.word}: ${vocab.translation}`
                        : vocab.word
                    }
                  >
                    {word}
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
