'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Flame,
  Loader2,
  Play,
  Settings,
  BarChart3,
  List,
  AlertTriangle,
} from 'lucide-react';
import { wordBookAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { WordBook, UserWordBook, DailyTasks } from '@/types';

export default function WordBookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, token } = useAuthStore();
  const bookId = Number(params.slug);

  const [book, setBook] = useState<WordBook | null>(null);
  const [progress, setProgress] = useState<UserWordBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planForm, setPlanForm] = useState({ daily_new_words: 20, daily_review_words: 50 });
  const [todayTasks, setTodayTasks] = useState<DailyTasks | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isAuthenticated || !token) return;
    if (!bookId) return;

    const fetchBook = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await wordBookAPI.get(bookId);
        const data = res.data.data;
        setBook(data as WordBook);
        if (data.is_subscribed && data.user_progress) {
          setProgress(data.user_progress as UserWordBook);
          setPlanForm({
            daily_new_words: data.user_progress.daily_new_words,
            daily_review_words: data.user_progress.daily_review_words,
          });
          // 获取今日任务(含堆积信息)
          try {
            const todayRes = await wordBookAPI.getToday(bookId);
            setTodayTasks(todayRes.data.data as DailyTasks);
          } catch {
            // 静默失败
          }
        }
      } catch (err: unknown) {
        setError('加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchBook();
  }, [mounted, isAuthenticated, token, bookId]);

  const handleSubscribe = async () => {
    if (!bookId) return;
    try {
      setSubscribing(true);
      const res = await wordBookAPI.subscribe(bookId, planForm);
      setProgress(res.data.data as UserWordBook);
      setShowPlanForm(false);
    } catch (err: unknown) {
      setError('订阅失败,可能已订阅');
    } finally {
      setSubscribing(false);
    }
  };

  const handleUpdatePlan = async () => {
    if (!bookId || !progress) return;
    try {
      await wordBookAPI.updatePlan(bookId, planForm);
      setProgress({ ...progress, ...planForm });
      setShowPlanForm(false);
    } catch (err: unknown) {
      setError('更新计划失败');
    }
  };

  const handleUnsubscribe = async () => {
    if (!bookId || !confirm('确定取消订阅?学习进度将保留在词书记录中。')) return;
    try {
      await wordBookAPI.unsubscribe(bookId);
      setProgress(null);
    } catch (err: unknown) {
      setError('取消订阅失败');
    }
  };

  if (!mounted || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-lg text-gray-500">词书不存在</p>
        <Link href="/wordbook" className="mt-4 inline-block text-blue-500 hover:underline">
          返回词书广场
        </Link>
      </div>
    );
  }

  const isSubscribed = Boolean(progress);
  const learnedPct = book.word_count > 0 && progress
    ? Math.round((progress.learned_count / book.word_count) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 返回按钮 */}
      <Link
        href="/wordbook"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        返回词书广场
      </Link>

      {/* 词书信息 */}
      <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-950 dark:text-gray-100">
              {book.name}
            </h1>
            {book.name_en && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{book.name_en}</p>
            )}
          </div>
          <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
            {book.cefr_level}
          </span>
        </div>

        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          {book.description}
        </p>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <BookOpen className="h-4 w-4" />
            {book.word_count} 词
          </span>
          <span>{book.unit_count} 单元</span>
          {book.source && <span>来源:{book.source}</span>}
        </div>
      </section>

      {/* 堆积警告 */}
      {todayTasks && todayTasks.backlog_count > 100 && (
        <div className="mb-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-500" />
            <div>
              <p className="text-sm font-bold text-yellow-700 dark:text-yellow-300">
                复习堆积警告
              </p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                当前积压 {todayTasks.backlog_count} 词,建议今日优先复习,减少或不学新词。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 导航链接:统计 + 词表 */}
      {isSubscribed && (
        <div className="mb-4 flex gap-3">
          <Link
            href={`/wordbook/${bookId}/stats`}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <BarChart3 className="h-4 w-4" />
            学习统计
          </Link>
          <Link
            href={`/wordbook/${bookId}/wordlist`}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <List className="h-4 w-4" />
            词表浏览
          </Link>
        </div>
      )}

      {/* 订阅 / 学习区域 */}
      {!isSubscribed ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-lg font-bold text-gray-950 dark:text-gray-100">
            订阅此词书
          </h2>

          {showPlanForm ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  每日新词数
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={planForm.daily_new_words}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, daily_new_words: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  每日复习数
                </label>
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={planForm.daily_review_words}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, daily_review_words: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSubscribe}
                  disabled={subscribing}
                  className="flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  确认订阅
                </button>
                <button
                  onClick={() => setShowPlanForm(false)}
                  className="rounded-xl px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowPlanForm(true)}
              className="flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-sm font-bold text-white hover:bg-blue-600"
            >
              <CheckCircle2 className="h-4 w-4" />
              订阅词书
            </button>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          {/* 进度概览 */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-950 dark:text-gray-100">
                学习进度
              </h2>
              {progress && progress.current_streak > 0 && (
                <span className="flex items-center gap-1 text-sm font-medium text-orange-500">
                  <Flame className="h-4 w-4" />
                  连续 {progress.current_streak} 天
                </span>
              )}
            </div>

            <div className="mb-4">
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  已学 {progress?.learned_count || 0}/{book.word_count}
                </span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{learnedPct}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${learnedPct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <p className="text-2xl font-black text-gray-950 dark:text-gray-100">
                  {progress?.learned_count || 0}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">已学习</p>
              </div>
              <div>
                <p className="text-2xl font-black text-gray-950 dark:text-gray-100">
                  {progress?.mastered_count || 0}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">已掌握</p>
              </div>
              <div>
                <p className="text-2xl font-black text-gray-950 dark:text-gray-100">
                  {progress?.total_studied_days || 0}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">学习天数</p>
              </div>
            </div>
          </div>

          {/* 继续学习按钮 */}
          <Link
            href={`/wordbook/${bookId}/learn`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-6 py-4 text-lg font-bold text-white shadow-sm transition-all hover:bg-blue-600"
          >
            <Play className="h-5 w-5" />
            继续学习
          </Link>

          {/* 计划设置 */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-950 dark:text-gray-100">
                每日计划
              </h3>
              <button
                onClick={() => setShowPlanForm(!showPlanForm)}
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
              >
                <Settings className="h-3.5 w-3.5" />
                调整
              </button>
            </div>

            {showPlanForm ? (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                    每日新词 (5-100)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={planForm.daily_new_words}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, daily_new_words: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                    每日复习 (10-300)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={300}
                    value={planForm.daily_review_words}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, daily_review_words: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
                <button
                  onClick={handleUpdatePlan}
                  className="rounded-lg bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600"
                >
                  保存
                </button>
              </div>
            ) : (
              <div className="mt-2 flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span>新词: {progress?.daily_new_words}/天</span>
                <span>复习: {progress?.daily_review_words}/天</span>
              </div>
            )}
          </div>

          {/* 取消订阅 */}
          <button
            onClick={handleUnsubscribe}
            className="w-full rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-500/10"
          >
            取消订阅
          </button>
        </section>
      )}

      {error && (
        <p className="mt-4 text-center text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
