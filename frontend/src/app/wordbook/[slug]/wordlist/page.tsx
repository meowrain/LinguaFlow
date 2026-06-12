'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Volume2,
  X,
} from 'lucide-react';
import { wordBookAPI, translationAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { WordBookEntry, WordBookProgressSnapshot } from '@/types';

interface LearnCardDef {
  pos: string;
  definition: string;
}

interface LearnCardEx {
  en: string;
  zh: string;
}

function parseJSON<T>(value: string | undefined | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const statusLabels: Record<string, string> = {
  new: '未学',
  learning: '学习中',
  mastered: '已掌握',
};

const statusColors: Record<string, string> = {
  new: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  learning: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
  mastered: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400',
};

const statusFilterOptions = [
  { key: '', label: '全部' },
  { key: 'new', label: '未学' },
  { key: 'learning', label: '学习中' },
  { key: 'mastered', label: '已掌握' },
];

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

export default function WordBookWordlistPage() {
  const params = useParams();
  const { isAuthenticated, token } = useAuthStore();
  const bookId = Number(params.slug);

  const [entries, setEntries] = useState<WordBookEntry[]>([]);
  const [progress, setProgress] = useState<Record<string, WordBookProgressSnapshot>>({});
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  // 筛选
  const [statusFilter, setStatusFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 单元列表:{unit -> count},来自 GET /wordbooks/:id/units
  const [unitCounts, setUnitCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchEntries = useCallback(async () => {
    if (!bookId) return;
    try {
      setLoading(true);
      setError('');
      const res = await wordBookAPI.getWordList(bookId, {
        page,
        page_size: 30,
        unit: unitFilter || undefined,
        status: statusFilter || undefined,
        search: searchQuery || undefined,
      });
      const data = res.data;
      setEntries(data.data.items || []);
      setTotal(data.data.total || 0);
      setTotalPages(data.data.total_pages || 1);
      setProgress(data.user_progress || {});
    } catch (err: unknown) {
      setError('加载词表失败');
    } finally {
      setLoading(false);
    }
  }, [bookId, page, unitFilter, statusFilter, searchQuery]);

  // 单独加载单元元数据(每个单元的词条数),这样 2000+ 词的词书也能完整列出所有单元
  useEffect(() => {
    if (!mounted || !isAuthenticated || !token || !bookId) return;
    let cancelled = false;
    wordBookAPI.getUnits(bookId)
      .then((res) => {
        if (cancelled) return;
        const units: { unit: number; count: number }[] = res.data?.data?.units || [];
        const map: Record<number, number> = {};
        for (const u of units) map[u.unit] = u.count;
        setUnitCounts(map);
      })
      .catch(() => { /* 静默失败,选择器不显示即可 */ });
    return () => { cancelled = true; };
  }, [mounted, isAuthenticated, token, bookId]);

  useEffect(() => {
    if (!mounted || !isAuthenticated || !token || !bookId) return;
    fetchEntries();
  }, [mounted, isAuthenticated, token, fetchEntries, bookId]);

  // 搜索防抖
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimer) clearTimeout(searchTimer);
    const timer = setTimeout(() => {
      setPage(1);
    }, 400);
    setSearchTimer(timer);
  };

  if (!mounted || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-lg text-red-500">{error}</p>
        <Link href={`/wordbook/${bookId}`} className="mt-4 inline-block text-blue-500 hover:underline">
          返回词书
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 返回 */}
      <Link
        href={`/wordbook/${bookId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        返回词书
      </Link>

      <h1 className="mb-4 text-2xl font-black text-gray-950 dark:text-gray-100">
        词表浏览
      </h1>

      {/* 筛选栏 */}
      <div className="mb-4 flex flex-wrap gap-3">
        {/* 搜索 */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索单词..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </div>

        {/* 单元筛选 */}
        {Object.keys(unitCounts).length > 0 && (
          <select
            value={unitFilter}
            onChange={(e) => { setUnitFilter(Number(e.target.value)); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value={0}>全部单元</option>
            {Object.keys(unitCounts)
              .map((k) => Number(k))
              .sort((a, b) => a - b)
              .map((u) => (
                <option key={u} value={u}>单元 {u} ({unitCounts[u]} 词)</option>
              ))}
          </select>
        )}

        {/* 状态筛选 */}
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {statusFilterOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      </div>

      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        共 {total} 个词条
      </p>

      {/* 词条列表 */}
      <div className="space-y-2">
        {entries.map((entry) => {
          const prog = progress[String(entry.id)];
          const status = prog?.status || 'new';
          const isExpanded = expandedId === entry.id;

          return (
            <div
              key={entry.id}
              className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 p-3 text-left"
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-950 dark:text-gray-100">
                      {entry.word}
                    </span>
                    {(entry.us_phonetic || entry.uk_phonetic) && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {entry.us_phonetic || entry.uk_phonetic}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-gray-400">
                    {entry.translation}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusColors[status]}`}>
                    {statusLabels[status]}
                  </span>
                  {prog && prog.review_count > 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {prog.review_count}次
                    </span>
                  )}
                </div>
              </button>

              {/* 展开详情 */}
              {isExpanded && (
                <div className="border-t border-gray-200 p-4 dark:border-gray-800">
                  {/* 发音按钮 */}
                  <button
                    type="button"
                    onClick={() => speakWord(entry.word)}
                    className="mb-3 flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    播放发音
                  </button>

                  {/* 音标 */}
                  {(entry.uk_phonetic || entry.us_phonetic) && (
                    <div className="mb-3 flex gap-4 text-sm text-gray-500 dark:text-gray-400">
                      {entry.uk_phonetic && <span>英 {entry.uk_phonetic}</span>}
                      {entry.us_phonetic && <span>美 {entry.us_phonetic}</span>}
                    </div>
                  )}

                  {/* 释义 */}
                  <EntryDefinitions definitions={entry.definitions} />

                  {/* 例句 */}
                  <EntryExamples examples={entry.examples} />

                  {/* 搭配 */}
                  <EntryCollocations collocations={entry.collocations} />

                  {/* 复习信息 */}
                  {prog && (
                    <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      <p>复习次数:{prog.review_count} | 遗忘次数:{prog.forgotten_count}</p>
                      <p>复习间隔:{prog.review_interval} 天 | 难度系数:{prog.review_ease.toFixed(2)}</p>
                      {prog.next_review_at && (
                        <p>下次复习:{new Date(prog.next_review_at).toLocaleDateString('zh-CN')}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {entries.length === 0 && (
        <div className="py-12 text-center text-gray-500 dark:text-gray-400">
          没有找到匹配的词条
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-700"
          >
            <ChevronLeft className="h-4 w-4" />
            上一页
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-700"
          >
            下一页
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function EntryDefinitions({ definitions }: { definitions?: string }) {
  const defs = parseJSON<LearnCardDef[]>(definitions, []);
  if (defs.length === 0) return null;

  return (
    <div className="mb-3 space-y-1">
      {defs.map((d, i) => (
        <div key={i} className="flex gap-2 text-sm">
          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            {d.pos}
          </span>
          <span className="text-gray-700 dark:text-gray-300">{d.definition}</span>
        </div>
      ))}
    </div>
  );
}

function EntryExamples({ examples }: { examples?: string }) {
  const exs = parseJSON<LearnCardEx[]>(examples, []);
  if (exs.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
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
  );
}

function EntryCollocations({ collocations }: { collocations?: string }) {
  const colls = parseJSON<string[]>(collocations, []);
  if (colls.length === 0) return null;

  return (
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
  );
}
