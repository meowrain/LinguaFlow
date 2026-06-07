'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  BookmarkCheck,
  BookmarkPlus,
  ChevronLeft,
  Eye,
  Languages,
  Loader2,
  Share2,
  Timer,
  Volume2,
} from 'lucide-react';
import { articleAPI, subscriptionAPI, translationAPI, vocabularyAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Article, ArticleCompletion, SentenceAnalysis, Subscription, Vocabulary } from '@/types';
import TranslationTooltip from '@/components/TranslationTooltip';

const difficultyLabels = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

function splitParagraphs(content?: string) {
  return (content || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function normalizeWord(token: string) {
  return token.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').toLowerCase();
}

function getDictionaryWord(text: string) {
  if (/\s/.test(text.trim())) return '';

  const word = normalizeWord(text);
  if (!/^[a-z]+(?:['’][a-z]+)?$/.test(word)) return '';

  return word;
}

function getWordFromPoint(x: number, y: number) {
  let node: Node | null = null;
  let offset = 0;
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offsetNode: Node; offset: number } | null;
  };

  if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    node = range?.startContainer || null;
    offset = range?.startOffset || 0;
  } else if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(x, y);
    node = position?.offsetNode || null;
    offset = position?.offset || 0;
  }

  if (!node || node.nodeType !== Node.TEXT_NODE) return '';

  const text = node.textContent || '';
  if (!text) return '';

  if (offset >= text.length) offset = text.length - 1;
  if (offset > 0 && !/[A-Za-z]/.test(text[offset]) && /[A-Za-z]/.test(text[offset - 1])) {
    offset -= 1;
  }
  if (!/[A-Za-z]/.test(text[offset])) return '';

  let start = offset;
  let end = offset + 1;
  while (start > 0 && /[A-Za-z'’]/.test(text[start - 1])) start -= 1;
  while (end < text.length && /[A-Za-z'’]/.test(text[end])) end += 1;

  return normalizeWord(text.slice(start, end));
}

function tokenizeParagraph(paragraph: string) {
  return paragraph.split(/([A-Za-z]+(?:['’][A-Za-z]+)?)/g).filter(Boolean);
}

export default function ArticlePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { isAuthenticated } = useAuthStore();

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showTranslation, setShowTranslation] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipMode, setTooltipMode] = useState<'translate' | 'dictionary'>('dictionary');
  const [tooltipContext, setTooltipContext] = useState('');
  const [showChinese, setShowChinese] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [paragraphTranslations, setParagraphTranslations] = useState<
    Record<number, { loading: boolean; text?: string; error?: string }>
  >({});
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [vocabularyWords, setVocabularyWords] = useState<Set<string>>(new Set());
  const [completion, setCompletion] = useState<ArticleCompletion | null>(null);
  const [completionLoading, setCompletionLoading] = useState(false);
  const [sentenceAnalysis, setSentenceAnalysis] = useState<SentenceAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  const contentRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(Date.now());
  const lastSyncedProgressRef = useRef(0);
  const highlightRef = useRef<HTMLElement | null>(null);

  const englishParagraphs = useMemo(() => splitParagraphs(article?.content), [article]);
  const chineseParagraphs = useMemo(() => splitParagraphs(article?.content_cn), [article]);

  const syncProgress = useCallback(
    async (force = false) => {
      if (!article || !isAuthenticated) return;

      const progress = readProgress >= 96 ? 100 : Math.round(readProgress);
      const readTime = Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));

      if (!force && progress - lastSyncedProgressRef.current < 10 && progress < 100) {
        return;
      }

      try {
        await articleAPI.updateReadProgress(article.id, {
          progress,
          read_time: readTime,
        });
        lastSyncedProgressRef.current = progress;
        startedAtRef.current = Date.now();
      } catch (err) {
        console.error('Failed to sync read progress:', err);
      }
    },
    [article, isAuthenticated, readProgress]
  );

  useEffect(() => {
    const fetchArticle = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await articleAPI.getArticleBySlug(slug);
        setArticle(response.data.data);
      } catch (err: any) {
        setError(err.response?.data?.error || '文章加载失败');
      } finally {
        setLoading(false);
      }
    };

    if (slug) fetchArticle();
  }, [slug]);

  useEffect(() => {
    if (!article || !isAuthenticated) return;

    const fetchUserArticleData = async () => {
      try {
        const [subscriptionsResponse, vocabularyResponse] = await Promise.all([
          subscriptionAPI.getSubscriptions(),
          vocabularyAPI.getVocabulary(),
        ]);
        const subscriptions = subscriptionsResponse.data.data as Subscription[];
        const vocabulary = vocabularyResponse.data.data as Vocabulary[];
        setIsSubscribed(subscriptions.some((item) => item.article_id === article.id));
        setVocabularyWords(new Set(vocabulary.map((item) => normalizeWord(item.word))));
      } catch (err) {
        console.error('Failed to fetch user article data:', err);
      }
    };

    fetchUserArticleData();
  }, [article, isAuthenticated]);

  useEffect(() => {
    if (!article || !isAuthenticated || readProgress < 99 || completion || completionLoading) return;

    const fetchCompletion = async () => {
      try {
        setCompletionLoading(true);
        await syncProgress(true);
        const response = await articleAPI.getCompletion(article.id);
        setCompletion(response.data.data);
      } catch (err) {
        console.error('Failed to fetch completion summary:', err);
      } finally {
        setCompletionLoading(false);
      }
    };

    fetchCompletion();
  }, [article, completion, completionLoading, isAuthenticated, readProgress, syncProgress]);

  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current) return;

      const rect = contentRef.current.getBoundingClientRect();
      const contentTop = window.scrollY + rect.top;
      const contentHeight = contentRef.current.offsetHeight;
      const viewportBottom = window.scrollY + window.innerHeight;
      const rawProgress = ((viewportBottom - contentTop) / contentHeight) * 100;
      const nextProgress = Math.min(100, Math.max(0, rawProgress));
      setReadProgress(nextProgress);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [article]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      syncProgress();
    }, 15000);

    return () => {
      window.clearInterval(interval);
      syncProgress(true);
    };
  }, [syncProgress]);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      clearHighlight();
    };
  }, []);

  const clearHighlight = () => {
    const highlight = highlightRef.current;
    if (!highlight) return;

    const parent = highlight.parentNode;
    if (!parent) {
      highlightRef.current = null;
      return;
    }

    while (highlight.firstChild) {
      parent.insertBefore(highlight.firstChild, highlight);
    }
    parent.removeChild(highlight);
    parent.normalize();
    highlightRef.current = null;
  };

  const applyHighlight = (range: Range) => {
    clearHighlight();

    const mark = document.createElement('mark');
    mark.className = 'reading-selection-highlight';

    try {
      range.surroundContents(mark);
      highlightRef.current = mark;
      window.getSelection()?.removeAllRanges();
      return true;
    } catch (err) {
      console.error('Failed to apply highlight:', err);
      return false;
    }
  };

  const handleSubscription = async () => {
    if (!article) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    try {
      setSubscriptionLoading(true);
      if (isSubscribed) {
        await subscriptionAPI.removeSubscription(article.id);
        setIsSubscribed(false);
      } else {
        await subscriptionAPI.addSubscription(article.id);
        setIsSubscribed(true);
      }
    } catch (err) {
      console.error('Failed to update subscription:', err);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleShare = async () => {
    if (!article) return;

    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: article.title, url });
      return;
    }

    await navigator.clipboard.writeText(url);
  };

  const handleParagraphClick = (
    event: MouseEvent<HTMLParagraphElement>,
    paragraph: string
  ) => {
    const selected = window.getSelection()?.toString().trim();
    if (selected) return;

    const word = getWordFromPoint(event.clientX, event.clientY);
    if (!word) return;

    setSelectedText(word);
    setTooltipContext(paragraph);
    setTooltipMode('dictionary');
    setTooltipPosition({
      x: event.clientX,
      y: event.clientY - 12 + window.scrollY,
    });
    setShowTranslation(true);
  };

  const handleTextSelection = (paragraph: string) => {
    window.requestAnimationFrame(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (!text || text.length < 2) return;

      const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
      const rect = range?.getBoundingClientRect();
      if (!range || !rect) return;

      const dictionaryWord = getDictionaryWord(text);

      setSelectedText(dictionaryWord || text);
      setTooltipContext(paragraph);
      setTooltipMode(dictionaryWord ? 'dictionary' : 'translate');
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 12 + window.scrollY,
      });
      applyHighlight(range);
      setShowTranslation(true);
    });
  };

  const handleAnalyzeSentence = async (paragraph: string) => {
    const selection = window.getSelection()?.toString().trim();
    const text = selection && selection.length > 5 ? selection : paragraph;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    try {
      setAnalysisLoading(true);
      setAnalysisError('');
      const response = await translationAPI.analyzeSentence(text);
      setSentenceAnalysis(response.data.data);
    } catch (err) {
      console.error('Failed to analyze sentence:', err);
      setAnalysisError('精读解析失败');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleTranslateParagraph = async (index: number, paragraph: string) => {
    const current = paragraphTranslations[index];
    if (current?.text && !current.loading) {
      setParagraphTranslations((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      return;
    }

    setParagraphTranslations((prev) => ({
      ...prev,
      [index]: { loading: true },
    }));

    if (chineseParagraphs[index]) {
      setParagraphTranslations((prev) => ({
        ...prev,
        [index]: { loading: false, text: chineseParagraphs[index] },
      }));
      return;
    }

    try {
      const response = await translationAPI.translate({
        text: paragraph,
        target_lang: 'zh',
      });
      setParagraphTranslations((prev) => ({
        ...prev,
        [index]: { loading: false, text: response.data.translation },
      }));
    } catch (err) {
      console.error('Failed to translate paragraph:', err);
      setParagraphTranslations((prev) => ({
        ...prev,
        [index]: { loading: false, error: '段落翻译失败' },
      }));
    }
  };

  const handleReadParagraph = (index: number, paragraph: string) => {
    if (!('speechSynthesis' in window)) {
      alert('当前浏览器不支持朗读功能');
      return;
    }

    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(paragraph);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  const renderParagraph = (paragraph: string) =>
    tokenizeParagraph(paragraph).map((token, tokenIndex) => {
      const word = normalizeWord(token);
      if (!word || !vocabularyWords.has(word)) {
        return token;
      }

      return (
        <mark
          key={`${token}-${tokenIndex}`}
          className="rounded bg-amber-400/20 px-0.5 text-amber-200 ring-1 ring-amber-400/20"
        >
          {token}
        </mark>
      );
    });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4">
        <div className="text-center">
          <h1 className="mb-3 text-2xl font-bold">文章未找到</h1>
          <p className="mb-6 text-gray-500">{error || '该文章可能已被删除或不存在'}</p>
          <Link href="/" className="text-sky-500 hover:text-sky-400">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed left-0 right-0 top-16 z-40 h-1 bg-gray-800">
        <div
          className="h-full bg-red-500 transition-[width] duration-200"
          style={{ width: `${readProgress}%` }}
        />
      </div>

      <div className="mx-auto max-w-4xl px-4 py-9 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-300"
        >
          <ChevronLeft className="h-4 w-4" />
          返回文章列表
        </Link>

        <header className="mb-8">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-red-500">
            <span>{article.source || 'MITTR'}</span>
            <span className="text-gray-600">|</span>
            <span>{article.category?.name || '外刊精选'}</span>
          </div>

          <h1 className="mb-4 text-4xl font-black leading-tight text-gray-100 md:text-5xl">
            {article.title}
          </h1>

          {article.title_cn && (
            <h2 className="mb-6 text-2xl font-bold leading-relaxed text-gray-400">
              {article.title_cn}
            </h2>
          )}

          <p className="mb-7 text-lg leading-8 text-gray-400">
            {article.summary_cn || article.summary}
          </p>

          <div className="flex flex-col gap-4 border-y border-gray-800 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-5 text-sm text-gray-500">
              <span>{format(new Date(article.published_at), 'yyyy-MM-dd')}</span>
              <span className="inline-flex items-center gap-1">
                <Timer className="h-4 w-4" />
                {article.reading_time} 分钟
              </span>
              <span>{article.word_count} 词</span>
              <span>{difficultyLabels[article.difficulty_level]}</span>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {article.view_count}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowChinese((value) => !value)}
                className="inline-flex items-center gap-2 rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-900"
              >
                <Languages className="h-4 w-4" />
                {showChinese ? '隐藏中文' : '显示中文'}
              </button>
              <button
                onClick={handleSubscription}
                disabled={subscriptionLoading}
                className="inline-flex items-center gap-2 rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-900 disabled:opacity-50"
              >
                {subscriptionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isSubscribed ? (
                  <BookmarkCheck className="h-4 w-4 text-yellow-300" />
                ) : (
                  <BookmarkPlus className="h-4 w-4" />
                )}
                {isSubscribed ? '已订阅' : '订阅'}
              </button>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-900"
              >
                <Share2 className="h-4 w-4" />
                分享
              </button>
            </div>
          </div>
        </header>

        {article.cover_image && (
          <div className="relative mb-10 aspect-[16/8] overflow-hidden bg-gray-900">
            <Image
              src={article.cover_image}
              alt={article.title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 896px"
              className="object-cover"
            />
          </div>
        )}

        <article ref={contentRef} className="mb-12">
          <div className="space-y-8">
            {englishParagraphs.map((paragraph, index) => {
              const paragraphTranslation = paragraphTranslations[index];

              return (
                <section
                  key={`${paragraph}-${index}`}
                  className="group rounded-lg border border-transparent p-0 transition-colors hover:border-gray-800 hover:bg-gray-950/30 sm:p-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <p
                      onClick={(event) => handleParagraphClick(event, paragraph)}
                      onMouseUp={() => handleTextSelection(paragraph)}
                      className="flex-1 cursor-text whitespace-pre-wrap text-xl font-medium leading-10 text-gray-200"
                    >
                      {renderParagraph(paragraph)}
                    </p>

                    <div className="flex shrink-0 items-center gap-2 sm:pt-1">
                      <button
                        type="button"
                        onClick={() => handleTranslateParagraph(index, paragraph)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-300 hover:bg-gray-900"
                      >
                        {paragraphTranslation?.loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Languages className="h-4 w-4" />
                        )}
                        {paragraphTranslation?.text ? '隐藏' : '翻译'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReadParagraph(index, paragraph)}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold hover:bg-gray-900 ${
                          speakingIndex === index
                            ? 'border-sky-500 text-sky-300'
                            : 'border-gray-700 text-gray-300'
                        }`}
                      >
                        <Volume2 className="h-4 w-4" />
                        {speakingIndex === index ? '停止' : '朗读'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAnalyzeSentence(paragraph)}
                        disabled={analysisLoading}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-300 hover:bg-gray-900 disabled:opacity-50"
                      >
                        {analysisLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        精读
                      </button>
                    </div>
                  </div>

                  {(paragraphTranslation?.text || paragraphTranslation?.error) && (
                    <div className="mt-4 rounded-lg border border-gray-800 bg-gray-900/60 p-4 text-base leading-8 text-gray-300">
                      {paragraphTranslation.text || paragraphTranslation.error}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {showChinese && chineseParagraphs.length > 0 && (
            <section className="mt-10 border-t border-gray-800 pt-8">
              <h3 className="mb-5 text-xl font-bold text-gray-100">中文翻译</h3>
              <div className="space-y-5 text-lg leading-9 text-gray-400">
                {chineseParagraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          )}
        </article>

        {(sentenceAnalysis || analysisError) && (
          <section className="mb-8 rounded-lg border border-gray-800 bg-gray-950/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-100">句子精读</h3>
              <button
                type="button"
                onClick={() => {
                  setSentenceAnalysis(null);
                  setAnalysisError('');
                }}
                className="text-sm text-gray-500 hover:text-gray-300"
              >
                关闭
              </button>
            </div>
            {analysisError ? (
              <p className="text-sm text-red-400">{analysisError}</p>
            ) : sentenceAnalysis ? (
              <div className="space-y-4 text-sm leading-7 text-gray-300">
                <div className="inline-flex rounded border border-gray-700 px-2 py-1 text-xs text-gray-400">
                  {sentenceAnalysis.provider === 'ai' ? 'AI 精读' : '规则解析'}
                </div>
                <p className="text-base text-gray-100">{sentenceAnalysis.sentence}</p>
                <div className="rounded-md border border-gray-800 bg-gray-900/70 p-4">
                  {sentenceAnalysis.translation}
                </div>
                <div>
                  <h4 className="mb-2 font-semibold text-gray-100">结构拆解</h4>
                  <ul className="space-y-1">
                    {sentenceAnalysis.structure.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="mb-2 font-semibold text-gray-100">重点词组</h4>
                  <div className="flex flex-wrap gap-2">
                    {sentenceAnalysis.key_phrases.map((phrase) => (
                      <span
                        key={phrase}
                        className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300"
                      >
                        {phrase}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 font-semibold text-gray-100">阅读提示</h4>
                  <ul className="space-y-1 text-gray-400">
                    {sentenceAnalysis.difficulty_tips.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </section>
        )}

        {(completion || completionLoading) && (
          <section className="mb-8 rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-emerald-100">阅读完成</h3>
              {completionLoading && <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />}
            </div>
            {completion && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-md border border-emerald-900/50 p-3">
                    <div className="text-xs text-emerald-300/80">阅读时长</div>
                    <div className="mt-1 text-xl font-bold text-emerald-50">
                      {Math.max(1, Math.round(completion.stats.read_time / 60))} 分钟
                    </div>
                  </div>
                  <div className="rounded-md border border-emerald-900/50 p-3">
                    <div className="text-xs text-emerald-300/80">本篇生词</div>
                    <div className="mt-1 text-xl font-bold text-emerald-50">
                      {completion.stats.new_words}
                    </div>
                  </div>
                  <div className="rounded-md border border-emerald-900/50 p-3">
                    <div className="text-xs text-emerald-300/80">已掌握</div>
                    <div className="mt-1 text-xl font-bold text-emerald-50">
                      {completion.stats.learned_words}
                    </div>
                  </div>
                  <div className="rounded-md border border-emerald-900/50 p-3">
                    <div className="text-xs text-emerald-300/80">待复习</div>
                    <div className="mt-1 text-xl font-bold text-emerald-50">
                      {completion.stats.due_review_words}
                    </div>
                  </div>
                </div>

                {completion.words.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-emerald-100">本篇新增词</h4>
                    <div className="flex flex-wrap gap-2">
                      {completion.words.slice(0, 12).map((word) => (
                        <span
                          key={word.id}
                          className="rounded border border-emerald-900/70 px-2 py-1 text-xs text-emerald-100"
                        >
                          {word.word}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {completion.next_article?.slug && (
                  <Link
                    href={`/articles/${completion.next_article.slug}`}
                    className="inline-flex rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
                  >
                    下一篇同难度文章
                  </Link>
                )}
              </div>
            )}
          </section>
        )}

        <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-5 text-sm text-gray-500">
          阅读提示：点击任意英文单词可查词；每段右侧可单独翻译或朗读。登录后会自动记录阅读进度。
        </div>

        {showTranslation && selectedText && (
          <TranslationTooltip
            selectedText={selectedText}
            position={tooltipPosition}
            onClose={() => {
              setShowTranslation(false);
              clearHighlight();
            }}
            articleId={article.id}
            mode={tooltipMode}
            context={tooltipContext}
            onWordAdded={(word) => {
              const normalized = normalizeWord(word);
              if (!normalized) return;
              setVocabularyWords((prev) => new Set(prev).add(normalized));
            }}
          />
        )}
      </div>
    </>
  );
}
