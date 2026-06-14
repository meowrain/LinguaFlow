'use client';

import { useEffect, useState, useMemo, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Flame,
  Loader2,
  Target,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { wordBookAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { WordBookStats } from '@/types';

export default function WordBookStatsPage() {
  const params = useParams();
  const { isAuthenticated, token } = useAuthStore();
  const bookId = Number(params.slug);

  const [stats, setStats] = useState<WordBookStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isAuthenticated || !token || !bookId) return;

    const fetchStats = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await wordBookAPI.getStats(bookId);
        setStats(res.data.data as WordBookStats);
      } catch (err: unknown) {
        setError('加载统计数据失败');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [mounted, isAuthenticated, token, bookId]);

  // 构造 90 天热力图数据
  const heatmapData = useMemo(() => {
    if (!stats) return [];

    const today = new Date();
    const days: { date: string; count: number; hasData: boolean }[] = [];

    // 构建日期到数据的映射
    const dataMap = new Map<string, number>();
    for (const record of stats.calendar) {
      const total = record.new_count + record.review_count;
      dataMap.set(record.date, total);
    }

    // 生成近 90 天
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = dataMap.get(dateStr) || 0;
      days.push({ date: dateStr, count, hasData: count > 0 });
    }

    return days;
  }, [stats]);

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

  if (!stats) return null;

  const learnedCount = stats.total_entries - stats.new_count;
  const learnedPct = stats.learned_pct;
  const masteredPct = stats.mastered_pct;

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

      <h1 className="mb-6 text-2xl font-black text-gray-950 dark:text-gray-100">
        学习统计
      </h1>

      {/* 进度概览卡片 */}
      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<BookOpen className="h-5 w-5 text-blue-500" />}
          label="已学/总量"
          value={`${learnedCount}/${stats.total_entries}`}
        />
        <StatCard
          icon={<Target className="h-5 w-5 text-emerald-500" />}
          label="已掌握"
          value={`${stats.mastered_count}`}
        />
        <StatCard
          icon={<Flame className="h-5 w-5 text-orange-500" />}
          label="连续打卡"
          value={`${stats.current_streak} 天`}
        />
        <StatCard
          icon={<Calendar className="h-5 w-5 text-purple-500" />}
          label="累计学习"
          value={`${stats.total_studied_days} 天`}
        />
      </section>

      {/* 进度圆环 */}
      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-bold text-gray-950 dark:text-gray-100">
          整体进度
        </h2>
        <div className="flex items-center justify-around">
          <ProgressRing label="已学习" percentage={learnedPct} color="text-blue-500" />
          <ProgressRing label="已掌握" percentage={masteredPct} color="text-emerald-500" />
        </div>
      </section>

      {/* 学习数据 */}
      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-bold text-gray-950 dark:text-gray-100">
          学习数据
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DataItem
            icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
            label="日均新词"
            value={stats.avg_daily_new.toFixed(1)}
          />
          <DataItem
            icon={<TrendingUp className="h-4 w-4 text-orange-500" />}
            label="日均复习"
            value={stats.avg_daily_review.toFixed(1)}
          />
          <DataItem
            icon={<Clock className="h-4 w-4 text-purple-500" />}
            label="预估剩余"
            value={stats.estimated_days_remaining > 0 ? `${stats.estimated_days_remaining} 天` : '--'}
          />
        </div>
      </section>

      {/* 热力图 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-bold text-gray-950 dark:text-gray-100">
          打卡日历 (近 90 天)
        </h2>
        <div className="overflow-x-auto">
          <div className="inline-grid grid-flow-col gap-1" style={{ gridTemplateRows: 'repeat(7, 1fr)' }}>
            {heatmapData.map((day, i) => (
              <div
                key={i}
                title={`${day.date}: ${day.count} 词`}
                className="h-3 w-3 rounded-sm"
                style={heatColorStyle(day.count)}
              />
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>少</span>
          <div className="h-3 w-3 rounded-sm" style={heatColorStyle(0)} />
          <div className="h-3 w-3 rounded-sm" style={heatColorStyle(3)} />
          <div className="h-3 w-3 rounded-sm" style={heatColorStyle(10)} />
          <div className="h-3 w-3 rounded-sm" style={heatColorStyle(40)} />
          <span>多</span>
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-2">{icon}</div>
      <p className="text-lg font-black text-gray-950 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function ProgressRing({ label, percentage, color }: { label: string; percentage: number; color: string }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          className="stroke-gray-100 dark:stroke-gray-800"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${color.replace('text-', 'stroke-')} transition-all duration-1000`}
        />
      </svg>
      <p className="mt-1 text-xl font-black text-gray-950 dark:text-gray-100">{percentage}%</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function DataItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800">
      {icon}
      <div>
        <p className="text-sm font-bold text-gray-950 dark:text-gray-100">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

// Heatmap intensity → accent-tinted background, theme-aware via CSS variables.
// 0 counts use the muted surface; higher counts blend more of the accent in.
function heatColorStyle(count: number): CSSProperties {
  if (count === 0) return { backgroundColor: 'var(--surface-muted)' };
  const intensity =
    count <= 5 ? 0.25 :
    count <= 15 ? 0.45 :
    count <= 30 ? 0.68 :
    0.92;
  return {
    backgroundColor: `color-mix(in srgb, var(--accent) ${Math.round(intensity * 100)}%, var(--surface-muted))`,
  };
}
