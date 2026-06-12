'use client';

import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { translationAPI } from '@/lib/api';

interface LearnCardDefinition {
  pos: string;
  definition: string;
}

interface LearnCardExample {
  en: string;
  zh: string;
}

interface LearnCardProps {
  word: string;
  phonetic?: string;
  uk_phonetic?: string;
  us_phonetic?: string;
  translation?: string;
  definitions?: string;
  examples?: string;
  collocations?: string;
  onRating: (rating: 'good' | 'hard' | 'forgot') => void;
  disabled?: boolean;
}

function parseJSON<T>(value: string | undefined | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function speakWord(text: string) {
  if (!text) return;
  try {
    const response = await translationAPI.lookupWord(text, {});
    const data = response.data.data;
    const audioUrl = data.us_speech_url || data.speech_url || data.uk_speech_url;
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      await audio.play();
    }
  } catch {
    // 静默失败
  }
}

export default function LearnCard({
  word,
  phonetic,
  uk_phonetic,
  us_phonetic,
  translation,
  definitions,
  examples,
  collocations,
  onRating,
  disabled,
}: LearnCardProps) {
  const [flipped, setFlipped] = useState(false);

  const defs = parseJSON<LearnCardDefinition[]>(definitions, []);
  const exs = parseJSON<LearnCardExample[]>(examples, []);
  const colls = parseJSON<string[]>(collocations, []);

  const displayPhonetic = us_phonetic || uk_phonetic || phonetic;

  const handleRating = (rating: 'good' | 'hard' | 'forgot') => {
    if (disabled) return;
    onRating(rating);
    setFlipped(false);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* 翻牌区域 */}
      <div
        className="relative w-full max-w-md cursor-pointer"
        style={{ perspective: '1000px' }}
        onClick={() => setFlipped(!flipped)}
      >
        <div
          className="relative w-full transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* 正面:单词 */}
          <div
            className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <h2 className="mb-3 text-4xl font-black text-gray-950 dark:text-gray-100">
              {word}
            </h2>
            {displayPhonetic && (
              <p className="mb-4 text-lg text-gray-500 dark:text-gray-400">
                {displayPhonetic}
              </p>
            )}
            <button
              type="button"
              className="mb-6 flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20"
              onClick={(e) => {
                e.stopPropagation();
                speakWord(word);
              }}
            >
              <Volume2 className="h-4 w-4" />
              发音
            </button>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              点击卡片查看释义
            </p>
          </div>

          {/* 背面:释义 */}
          <div
            className="absolute inset-0 flex min-h-[360px] flex-col overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            <h3 className="mb-1 text-2xl font-bold text-gray-950 dark:text-gray-100">
              {word}
            </h3>
            {translation && (
              <p className="mb-4 text-lg font-medium text-blue-600 dark:text-blue-400">
                {translation}
              </p>
            )}

            {/* 释义列表 */}
            {defs.length > 0 && (
              <div className="mb-4 space-y-2">
                {defs.map((d, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      {d.pos}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">{d.definition}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 例句 */}
            {exs.length > 0 && (
              <div className="mb-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  例句
                </h4>
                {exs.map((ex, i) => (
                  <div key={i} className="text-sm">
                    <p className="text-gray-800 dark:text-gray-200">{ex.en}</p>
                    <p className="text-gray-500 dark:text-gray-400">{ex.zh}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 搭配 */}
            {colls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {colls.map((c, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 三个评分按钮 */}
      <div className="flex w-full max-w-md gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleRating('good')}
          className="flex-1 rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-600 disabled:opacity-50"
        >
          认识
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleRating('hard')}
          className="flex-1 rounded-xl bg-yellow-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-yellow-600 disabled:opacity-50"
        >
          模糊
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleRating('forgot')}
          className="flex-1 rounded-xl bg-red-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-red-600 disabled:opacity-50"
        >
          忘了
        </button>
      </div>
    </div>
  );
}
