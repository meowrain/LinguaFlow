'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2, PartyPopper, Shuffle, Volume2, X } from 'lucide-react';
import { wordBookAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { DailyTasks, WordBookDailyTaskNew, WordBookDailyTaskReview } from '@/types';
import LearnCard from '@/components/wordbook/LearnCard';
import DailyProgress from '@/components/wordbook/DailyProgress';
import { playWordAudio } from '@/lib/wordAudio';

type StudyPhase = 'new' | 'review' | 'done';
type ReviewType = 'card' | 'choice' | 'spelling' | 'audio_choice' | 'context_blank' | 'sentence_meaning';
type QuestionMode = 'mixed' | 'card' | 'choice' | 'listening' | 'spelling_focus' | 'context';

// 计算 Levenshtein 距离
function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[la][lb];
}

interface ExampleSentence { en: string; zh: string; }

// 解析 examples JSON
function parseExamples(raw: string | undefined): ExampleSentence[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ExampleSentence[];
    return [];
  } catch { return []; }
}

// 从例句中挖空目标词
function blankOutWord(sentence: string, word: string): string | null {
  if (!sentence || !word) return null;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'gi');
  if (!re.test(sentence)) return null;
  return sentence.replace(re, '_____');
}

// 随机选取复习题型
function pickReviewType(mode: QuestionMode): ReviewType {
  const r = Math.random();
  switch (mode) {
    case 'card':
      return 'card';
    case 'choice':
      return r < 0.5 ? 'choice' : 'spelling';
    case 'listening':
      return r < 0.6 ? 'audio_choice' : 'sentence_meaning';
    case 'spelling_focus':
      return r < 0.6 ? 'context_blank' : 'spelling';
    case 'context':
      if (r < 0.4) return 'context_blank';
      if (r < 0.7) return 'sentence_meaning';
      return 'choice';
    default: // mixed: 40% card, 15% choice, 15% spelling, 10% audio, 10% context, 10% sentence
      if (r < 0.40) return 'card';
      if (r < 0.55) return 'choice';
      if (r < 0.70) return 'spelling';
      if (r < 0.80) return 'audio_choice';
      if (r < 0.90) return 'context_blank';
      return 'sentence_meaning';
  }
}

const modeLabels: Record<QuestionMode, string> = {
  mixed: '混合题型',
  card: '纯翻卡',
  choice: '纯选择',
  listening: '听力模式',
  spelling_focus: '拼写模式',
  context: '语境模式',
};

export default function WordBookLearnPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, token } = useAuthStore();
  const bookId = Number(params.slug);

  const [tasks, setTasks] = useState<DailyTasks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  // 学习状态
  const [phase, setPhase] = useState<StudyPhase>('new');
  const [newIndex, setNewIndex] = useState(0);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [newDone, setNewDone] = useState(0);
  const [reviewDone, setReviewDone] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // 多题型状态
  const [questionMode, setQuestionMode] = useState<QuestionMode>('mixed');
  const [currentReviewType, setCurrentReviewType] = useState<ReviewType>('card');
  const [showModeMenu, setShowModeMenu] = useState(false);

  // 选择题状态
  const [choiceOptions, setChoiceOptions] = useState<string[]>([]);
  const [choiceSelected, setChoiceSelected] = useState<number | null>(null);
  const [choiceRevealed, setChoiceRevealed] = useState(false);

  // 拼写题状态
  const [spellingInput, setSpellingInput] = useState('');
  const [spellingResult, setSpellingResult] = useState<'correct' | 'wrong' | null>(null);

  // 听音辨词状态
  const [audioChoiceOptions, setAudioChoiceOptions] = useState<string[]>([]);
  const [audioChoiceSelected, setAudioChoiceSelected] = useState<number | null>(null);
  const [audioChoiceRevealed, setAudioChoiceRevealed] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);

  // 语境填空状态
  const [blankInput, setBlankInput] = useState('');
  const [blankResult, setBlankResult] = useState<'correct' | 'wrong' | null>(null);
  const [blankSentence, setBlankSentence] = useState('');
  const [blankHint, setBlankHint] = useState('');

  // 例句释义状态
  const [sentenceOptions, setSentenceOptions] = useState<string[]>([]);
  const [sentenceSelected, setSentenceSelected] = useState<number | null>(null);
  const [sentenceRevealed, setSentenceRevealed] = useState(false);
  const [sentenceText, setSentenceText] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  // 为当前复习词生成选项
  const generateChoiceOptions = useCallback(
    (correctTranslation: string) => {
      if (!tasks) return [correctTranslation];

      // 从复习词池和新词池中抽取干扰项
      const allTranslations = new Set<string>();
      for (const w of tasks.review_words) {
        if (w.translation && w.translation !== correctTranslation) {
          allTranslations.add(w.translation);
        }
      }
      for (const w of tasks.new_words) {
        if (w.translation && w.translation !== correctTranslation) {
          allTranslations.add(w.translation);
        }
      }

      const distractors = Array.from(allTranslations);
      // 随机选3个干扰项
      const shuffled = distractors.sort(() => Math.random() - 0.5).slice(0, 3);
      const options = [correctTranslation, ...shuffled].sort(() => Math.random() - 0.5);
      return options;
    },
    [tasks]
  );

  // 为听音辨词生成英文单词选项
  const generateWordOptions = useCallback(
    (correctWord: string) => {
      if (!tasks) return [correctWord];
      const allWords = new Set<string>();
      for (const w of tasks.review_words) {
        if (w.word && w.word.toLowerCase() !== correctWord.toLowerCase()) {
          allWords.add(w.word);
        }
      }
      for (const w of tasks.new_words) {
        if (w.word && w.word.toLowerCase() !== correctWord.toLowerCase()) {
          allWords.add(w.word);
        }
      }
      const distractors = Array.from(allWords).sort(() => Math.random() - 0.5).slice(0, 3);
      return [correctWord, ...distractors].sort(() => Math.random() - 0.5);
    },
    [tasks]
  );

  // 当 reviewIndex 或 questionMode 变化时,重新生成题型
  useEffect(() => {
    if (phase !== 'review' || !tasks) return;
    const current = tasks.review_words[reviewIndex];
    if (!current) return;

    // 重置所有题型状态
    setChoiceSelected(null);
    setChoiceRevealed(false);
    setSpellingInput('');
    setSpellingResult(null);
    setAudioChoiceSelected(null);
    setAudioChoiceRevealed(false);
    setAudioPlayed(false);
    setBlankInput('');
    setBlankResult(null);
    setSentenceSelected(null);
    setSentenceRevealed(false);

    let type = pickReviewType(questionMode);
    const examples = parseExamples(current.examples);

    if (type === 'context_blank') {
      const escaped = current.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = examples.find(ex => {
        const re = new RegExp(`\\b${escaped}\\b`, 'i');
        return ex.en && re.test(ex.en);
      });
      if (!match) {
        type = 'card';
      } else {
        setBlankSentence(blankOutWord(match.en, current.word)!);
        setBlankHint(current.translation || '');
      }
    }

    if (type === 'sentence_meaning') {
      if (examples.length === 0) {
        type = 'card';
      } else {
        const ex = examples[Math.floor(Math.random() * examples.length)];
        setSentenceText(ex.en);
        const options = generateChoiceOptions(current.translation || '');
        setSentenceOptions(options);
      }
    }

    if (type === 'choice') {
      const options = generateChoiceOptions(current.translation || '');
      setChoiceOptions(options);
    }

    if (type === 'audio_choice') {
      const options = generateWordOptions(current.word);
      setAudioChoiceOptions(options);
    }

    setCurrentReviewType(type);
  }, [reviewIndex, questionMode, phase, tasks, generateChoiceOptions, generateWordOptions]);

  // 加载今日任务
  useEffect(() => {
    if (!mounted || !isAuthenticated || !token || !bookId) return;

    const fetchTasks = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await wordBookAPI.getToday(bookId);
        const data = res.data.data as DailyTasks;
        setTasks(data);

        // 从服务端进度恢复今日学习位置（避免刷新或退出再进后从 0 开始）
        const p = data.progress;
        const resumedNewIndex = p ? Math.min(p.new_learned, data.total_new) : 0;
        const resumedReviewIndex = p ? Math.min(p.review_done, data.total_review) : 0;
        const resumedNewDone = p ? p.new_learned : 0;
        const resumedReviewDone = p ? p.review_done : 0;

        setNewIndex(resumedNewIndex);
        setReviewIndex(resumedReviewIndex);
        setNewDone(resumedNewDone);
        setReviewDone(resumedReviewDone);

        // 判断起始阶段：优先用服务端的 is_completed，否则按剩余任务数推断
        if (p?.is_completed) {
          setPhase('done');
        } else if (resumedNewIndex < data.total_new) {
          setPhase('new');
        } else if (resumedReviewIndex < data.total_review) {
          setPhase('review');
        } else {
          setPhase('done');
        }
      } catch (err: unknown) {
        setError('加载今日任务失败');
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [mounted, isAuthenticated, token, bookId]);

  // 提交新词学习
  const handleLearnRating = useCallback(
    async (rating: 'good' | 'hard' | 'forgot') => {
      if (!tasks || submitting) return;
      const current = tasks.new_words[newIndex];
      if (!current) return;

      try {
        setSubmitting(true);
        await wordBookAPI.learn(bookId, { entry_id: current.entry_id, rating });
        setNewDone((prev) => prev + 1);

        const nextIndex = newIndex + 1;
        if (nextIndex < tasks.total_new) {
          setNewIndex(nextIndex);
        } else {
          if (tasks.total_review > 0) {
            setPhase('review');
          } else {
            setPhase('done');
          }
        }
      } catch (err: unknown) {
        console.error('Learn submission failed:', err);
      } finally {
        setSubmitting(false);
      }
    },
    [tasks, newIndex, bookId, submitting]
  );

  // 提交复习
  const handleReviewRating = useCallback(
    async (rating: 'good' | 'hard' | 'forgot') => {
      if (!tasks || submitting) return;
      const current = tasks.review_words[reviewIndex];
      if (!current) return;

      try {
        setSubmitting(true);
        await wordBookAPI.review(bookId, { progress_id: current.progress_id, rating });
        setReviewDone((prev) => prev + 1);

        const nextIndex = reviewIndex + 1;
        if (nextIndex < tasks.total_review) {
          setReviewIndex(nextIndex);
        } else {
          setPhase('done');
        }
      } catch (err: unknown) {
        console.error('Review submission failed:', err);
      } finally {
        setSubmitting(false);
      }
    },
    [tasks, reviewIndex, bookId, submitting]
  );

  // 选择题:选择答案
  const handleChoiceSelect = useCallback(
    (index: number) => {
      if (choiceRevealed || submitting) return;
      setChoiceSelected(index);
      setChoiceRevealed(true);

      const current = tasks?.review_words[reviewIndex];
      if (!current) return;

      const selected = choiceOptions[index];
      const isCorrect = selected === current.translation;
      const rating = isCorrect ? 'good' : 'forgot';

      // 延迟提交,让用户看到结果
      setTimeout(() => {
        handleReviewRating(rating);
      }, 800);
    },
    [choiceRevealed, submitting, tasks, reviewIndex, choiceOptions, handleReviewRating]
  );

  // 拼写题:提交答案
  const handleSpellingSubmit = useCallback(() => {
    if (spellingResult || submitting) return;
    const current = tasks?.review_words[reviewIndex];
    if (!current || !spellingInput.trim()) return;

    const correct = current.word.toLowerCase().trim();
    const answer = spellingInput.trim().toLowerCase();
    const dist = levenshtein(answer, correct);

    const isCorrect = dist <= 1;
    setSpellingResult(isCorrect ? 'correct' : 'wrong');

    const rating = isCorrect ? 'good' : (dist <= 2 ? 'hard' : 'forgot');

    setTimeout(() => {
      handleReviewRating(rating);
    }, 1000);
  }, [spellingResult, submitting, tasks, reviewIndex, spellingInput, handleReviewRating]);

  // 听音辨词:播放音频
  const handlePlayAudio = useCallback(() => {
    const current = tasks?.review_words[reviewIndex];
    if (!current) return;
    playWordAudio(current.word, 'us');
    setAudioPlayed(true);
  }, [tasks, reviewIndex]);

  // 听音辨词:选择答案
  const handleAudioChoiceSelect = useCallback(
    (index: number) => {
      if (audioChoiceRevealed || submitting) return;
      setAudioChoiceSelected(index);
      setAudioChoiceRevealed(true);

      const current = tasks?.review_words[reviewIndex];
      if (!current) return;

      const selected = audioChoiceOptions[index];
      const isCorrect = selected.toLowerCase() === current.word.toLowerCase();
      const rating = isCorrect ? 'good' : 'forgot';

      setTimeout(() => {
        handleReviewRating(rating);
      }, 800);
    },
    [audioChoiceRevealed, submitting, tasks, reviewIndex, audioChoiceOptions, handleReviewRating]
  );

  // 语境填空:提交答案
  const handleBlankSubmit = useCallback(() => {
    if (blankResult || submitting) return;
    const current = tasks?.review_words[reviewIndex];
    if (!current || !blankInput.trim()) return;

    const correct = current.word.toLowerCase().trim();
    const answer = blankInput.trim().toLowerCase();
    const dist = levenshtein(answer, correct);

    const isCorrect = dist <= 1;
    setBlankResult(isCorrect ? 'correct' : 'wrong');

    const rating = isCorrect ? 'good' : (dist <= 2 ? 'hard' : 'forgot');

    setTimeout(() => {
      handleReviewRating(rating);
    }, 1000);
  }, [blankResult, submitting, tasks, reviewIndex, blankInput, handleReviewRating]);

  // 例句释义:选择答案
  const handleSentenceMeaningSelect = useCallback(
    (index: number) => {
      if (sentenceRevealed || submitting) return;
      setSentenceSelected(index);
      setSentenceRevealed(true);

      const current = tasks?.review_words[reviewIndex];
      if (!current) return;

      const selected = sentenceOptions[index];
      const isCorrect = selected === current.translation;
      const rating = isCorrect ? 'good' : 'forgot';

      setTimeout(() => {
        handleReviewRating(rating);
      }, 800);
    },
    [sentenceRevealed, submitting, tasks, reviewIndex, sentenceOptions, handleReviewRating]
  );

  // 当前新词之后的即将出现的单词列表（用于预加载音频）
  const upcomingNewWords = useMemo(() => {
    if (!tasks) return [];
    return tasks.new_words
      .slice(newIndex + 1, newIndex + 4)
      .map((w) => w.word);
  }, [tasks, newIndex]);

  // 当前复习词之后的即将出现的单词列表
  const upcomingReviewWords = useMemo(() => {
    if (!tasks) return [];
    return tasks.review_words
      .slice(reviewIndex + 1, reviewIndex + 4)
      .map((w) => w.word);
  }, [tasks, reviewIndex]);

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
        <Link href="/wordbook" className="mt-4 inline-block text-blue-500 hover:underline">
          返回词书广场
        </Link>
      </div>
    );
  }

  if (!tasks) return null;

  const currentNew = tasks.new_words[newIndex];
  const currentReview = tasks.review_words[reviewIndex];

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-6 sm:px-6">
      {/* 顶部导航 */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href={`/wordbook/${bookId}`}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Link>
        <DailyProgress
          newDone={newDone}
          newTotal={tasks.total_new}
          reviewDone={reviewDone}
          reviewTotal={tasks.total_review}
        />
      </div>

      {/* 题型偏好按钮(仅复习阶段) */}
      {phase === 'review' && (
        <div className="mb-4 flex justify-end">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowModeMenu(!showModeMenu)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <Shuffle className="h-3.5 w-3.5" />
              {modeLabels[questionMode]}
            </button>
            {showModeMenu && (
              <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                {(Object.keys(modeLabels) as QuestionMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setQuestionMode(m); setShowModeMenu(false); }}
                    className={`block w-full px-3 py-1.5 text-left text-xs ${
                      questionMode === m
                        ? 'bg-blue-50 font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                        : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    {modeLabels[m]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 学习阶段 */}
      {phase === 'new' && currentNew && (
        <div className="flex-1">
          <p className="mb-4 text-center text-xs font-medium text-gray-400 dark:text-gray-500">
            新词学习 ({newIndex + 1}/{tasks.total_new})
          </p>
          <LearnCard
            word={currentNew.word}
            phonetic={currentNew.phonetic}
            uk_phonetic={currentNew.uk_phonetic}
            us_phonetic={currentNew.us_phonetic}
            translation={currentNew.translation}
            definitions={currentNew.definitions}
            examples={currentNew.examples}
            collocations={currentNew.collocations}
            onRating={handleLearnRating}
            disabled={submitting}
            upcomingWords={upcomingNewWords}
            entryId={currentNew.entry_id}
            bookId={bookId}
          />
        </div>
      )}

      {/* 复习阶段 - 翻卡片模式 */}
      {phase === 'review' && currentReview && currentReviewType === 'card' && (
        <div className="flex-1">
          <p className="mb-4 text-center text-xs font-medium text-orange-500">
            复习阶段 ({reviewIndex + 1}/{tasks.total_review}) - 翻卡片
          </p>
          <LearnCard
            word={currentReview.word}
            phonetic={currentReview.phonetic}
            uk_phonetic={currentReview.uk_phonetic}
            us_phonetic={currentReview.us_phonetic}
            translation={currentReview.translation}
            onRating={handleReviewRating}
            disabled={submitting}
            upcomingWords={upcomingReviewWords}
            entryId={currentReview.entry_id}
            bookId={bookId}
          />
        </div>
      )}

      {/* 复习阶段 - 英译中四选一 */}
      {phase === 'review' && currentReview && currentReviewType === 'choice' && (
        <div className="flex-1">
          <p className="mb-4 text-center text-xs font-medium text-orange-500">
            复习阶段 ({reviewIndex + 1}/{tasks.total_review}) - 英译中选择
          </p>
          <div className="mx-auto max-w-md">
            <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
              <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">请选择正确的中文翻译</p>
              <h2 className="text-3xl font-black text-gray-950 dark:text-gray-100">
                {currentReview.word}
              </h2>
            </div>
            <div className="space-y-3">
              {choiceOptions.map((opt, i) => {
                const isCorrect = opt === currentReview.translation;
                let style = 'border-gray-200 bg-white hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-600';
                if (choiceRevealed && choiceSelected !== null) {
                  if (isCorrect) {
                    style = 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
                  } else if (choiceSelected === i) {
                    style = 'border-red-500 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300';
                  }
                }
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleChoiceSelect(i)}
                    disabled={choiceRevealed || submitting}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${style} disabled:cursor-not-allowed`}
                  >
                    <span className="mr-2 inline-block h-5 w-5 rounded-full border border-gray-300 text-center text-xs leading-5 dark:border-gray-600">
                      {String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 复习阶段 - 中译英拼写 */}
      {phase === 'review' && currentReview && currentReviewType === 'spelling' && (
        <div className="flex-1">
          <p className="mb-4 text-center text-xs font-medium text-orange-500">
            复习阶段 ({reviewIndex + 1}/{tasks.total_review}) - 拼写练习
          </p>
          <div className="mx-auto max-w-md">
            <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
              <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">请根据中文翻译拼写英文单词</p>
              <h2 className="text-2xl font-bold text-gray-950 dark:text-gray-100">
                {currentReview.translation}
              </h2>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                value={spellingInput}
                onChange={(e) => setSpellingInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSpellingSubmit(); }}
                placeholder="输入英文单词..."
                disabled={spellingResult !== null || submitting}
                autoFocus
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-lg font-medium dark:border-gray-700 dark:bg-gray-800 disabled:opacity-50"
              />
              {spellingResult && (
                <div className={`rounded-xl p-3 text-center text-sm font-bold ${
                  spellingResult === 'correct'
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                }`}>
                  {spellingResult === 'correct'
                    ? '正确!'
                    : `正确拼写: ${currentReview.word}`
                  }
                </div>
              )}
              {!spellingResult && (
                <button
                  type="button"
                  onClick={handleSpellingSubmit}
                  disabled={submitting || !spellingInput.trim()}
                  className="w-full rounded-xl bg-blue-500 px-4 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  确认
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 复习阶段 - 听音辨词 */}
      {phase === 'review' && currentReview && currentReviewType === 'audio_choice' && (
        <div className="flex-1">
          <p className="mb-4 text-center text-xs font-medium text-orange-500">
            复习阶段 ({reviewIndex + 1}/{tasks.total_review}) - 听音辨词
          </p>
          <div className="mx-auto max-w-md">
            <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
              <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">请听发音并选择正确的单词</p>
              <button
                type="button"
                onClick={handlePlayAudio}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-500 text-white transition-transform hover:scale-105 hover:bg-blue-600"
              >
                <Volume2 className="h-8 w-8" />
              </button>
              {!audioPlayed && (
                <p className="mt-3 text-xs text-gray-400">点击播放发音</p>
              )}
            </div>
            <div className="space-y-3">
              {audioChoiceOptions.map((opt, i) => {
                const isCorrect = opt.toLowerCase() === currentReview.word.toLowerCase();
                let style = 'border-gray-200 bg-white hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-600';
                if (audioChoiceRevealed && audioChoiceSelected !== null) {
                  if (isCorrect) {
                    style = 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
                  } else if (audioChoiceSelected === i) {
                    style = 'border-red-500 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300';
                  }
                }
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleAudioChoiceSelect(i)}
                    disabled={audioChoiceRevealed || submitting}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${style} disabled:cursor-not-allowed`}
                  >
                    <span className="mr-2 inline-block h-5 w-5 rounded-full border border-gray-300 text-center text-xs leading-5 dark:border-gray-600">
                      {String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 复习阶段 - 语境填空 */}
      {phase === 'review' && currentReview && currentReviewType === 'context_blank' && (
        <div className="flex-1">
          <p className="mb-4 text-center text-xs font-medium text-orange-500">
            复习阶段 ({reviewIndex + 1}/{tasks.total_review}) - 语境填空
          </p>
          <div className="mx-auto max-w-md">
            <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
              <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">根据语境补全单词</p>
              <p className="mb-4 text-lg leading-relaxed font-medium text-gray-950 dark:text-gray-100">
                {blankSentence}
              </p>
              {blankHint && (
                <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  提示: {blankHint}
                </span>
              )}
            </div>
            <div className="space-y-4">
              <input
                type="text"
                value={blankInput}
                onChange={(e) => setBlankInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleBlankSubmit(); }}
                placeholder="输入英文单词..."
                disabled={blankResult !== null || submitting}
                autoFocus
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-lg font-medium dark:border-gray-700 dark:bg-gray-800 disabled:opacity-50"
              />
              {blankResult && (
                <div className={`rounded-xl p-3 text-center text-sm font-bold ${
                  blankResult === 'correct'
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                }`}>
                  {blankResult === 'correct'
                    ? '正确!'
                    : `正确拼写: ${currentReview.word}`
                  }
                </div>
              )}
              {!blankResult && (
                <button
                  type="button"
                  onClick={handleBlankSubmit}
                  disabled={submitting || !blankInput.trim()}
                  className="w-full rounded-xl bg-blue-500 px-4 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  确认
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 复习阶段 - 例句释义 */}
      {phase === 'review' && currentReview && currentReviewType === 'sentence_meaning' && (
        <div className="flex-1">
          <p className="mb-4 text-center text-xs font-medium text-orange-500">
            复习阶段 ({reviewIndex + 1}/{tasks.total_review}) - 例句释义
          </p>
          <div className="mx-auto max-w-md">
            <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
              <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">请选择该句的正确中文含义</p>
              <p className="text-base leading-relaxed font-medium text-gray-950 dark:text-gray-100">
                {sentenceText.split(new RegExp(`(${currentReview.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                  part.toLowerCase() === currentReview.word.toLowerCase()
                    ? <span key={i} className="font-bold text-blue-600 dark:text-blue-400">{part}</span>
                    : <span key={i}>{part}</span>
                )}
              </p>
            </div>
            <div className="space-y-3">
              {sentenceOptions.map((opt, i) => {
                const isCorrect = opt === currentReview.translation;
                let style = 'border-gray-200 bg-white hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-600';
                if (sentenceRevealed && sentenceSelected !== null) {
                  if (isCorrect) {
                    style = 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
                  } else if (sentenceSelected === i) {
                    style = 'border-red-500 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300';
                  }
                }
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSentenceMeaningSelect(i)}
                    disabled={sentenceRevealed || submitting}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${style} disabled:cursor-not-allowed`}
                  >
                    <span className="mr-2 inline-block h-5 w-5 rounded-full border border-gray-300 text-center text-xs leading-5 dark:border-gray-600">
                      {String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <PartyPopper className="mb-4 h-16 w-16 text-yellow-500" />
          <h2 className="mb-2 text-2xl font-black text-gray-950 dark:text-gray-100">
            今日学习完成!
          </h2>
          <p className="mb-6 text-gray-500 dark:text-gray-400">
            新词 {newDone} 个,复习 {reviewDone} 个
          </p>
          <div className="flex gap-3">
            <Link
              href={`/wordbook/${bookId}`}
              className="rounded-xl bg-gray-100 px-6 py-3 text-sm font-bold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              返回词书
            </Link>
            <Link
              href="/wordbook"
              className="rounded-xl bg-blue-500 px-6 py-3 text-sm font-bold text-white hover:bg-blue-600"
            >
              词书广场
            </Link>
          </div>
        </div>
      )}

      {/* 堆积提示 */}
      {tasks.new_word_quota === 0 && tasks.backlog_count > 0 && (
        <div className="mt-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-center">
          <p className="text-sm font-bold text-yellow-700 dark:text-yellow-300">
            今日专注消化堆积复习
          </p>
          <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
            积压 {tasks.backlog_count} 词,新词已暂停释放
          </p>
        </div>
      )}
      {tasks.backlog_count > 100 && tasks.new_word_quota > 0 && (
        <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-center text-xs text-yellow-600 dark:text-yellow-400">
          积压复习词较多 ({tasks.backlog_count}),建议今日多复习少学新词
        </div>
      )}
    </div>
  );
}
