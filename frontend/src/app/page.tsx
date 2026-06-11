'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, Loader2, Sparkles } from 'lucide-react';
import { articleAPI, isRemoteHTTPURL, resolveAPIAssetURL } from '@/lib/api';
import { Article } from '@/types';

const fallbackArticles: Article[] = [
  {
    id: -1,
    title: 'How virtual power plants could provide energy for data centers',
    title_cn: '虚拟电厂如何为数据中心提供能源',
    slug: 'virtual-power-plants-data-centers',
    summary: 'New grid software can coordinate batteries, buildings, and backup power into flexible clean-energy capacity.',
    category_id: 1,
    category: { id: 1, name: 'Climate change and energy', slug: 'climate-energy', sort_order: 1, created_at: '', updated_at: '' },
    source: 'MITTR',
    published_at: '2026-06-03',
    difficulty_level: 'medium',
    word_count: 917,
    reading_time: 6,
    view_count: 0,
    status: 'published',
    is_featured: true,
    created_at: '',
    updated_at: '',
    content: '',
    cover_image: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: -2,
    title: 'How small businesses can leverage AI',
    title_cn: '小企业如何利用人工智能',
    slug: 'small-businesses-leverage-ai',
    summary: 'Practical AI tools are changing support, operations, and customer research for smaller teams.',
    category_id: 2,
    category: { id: 2, name: 'Artificial intelligence', slug: 'ai', sort_order: 2, created_at: '', updated_at: '' },
    source: 'MITTR',
    published_at: '2026-06-02',
    difficulty_level: 'medium',
    word_count: 859,
    reading_time: 5,
    view_count: 0,
    status: 'published',
    is_featured: true,
    created_at: '',
    updated_at: '',
    content: '',
    cover_image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: -3,
    title: 'China has approved the world’s first invasive brain-computer chip',
    title_cn: '中国批准全球首个侵入性脑机接口芯片',
    slug: 'brain-computer-chip-approved',
    summary: 'A clinical milestone opens a new phase for neurotechnology and medical devices.',
    category_id: 3,
    category: { id: 3, name: 'Biotechnology and health', slug: 'biotech-health', sort_order: 3, created_at: '', updated_at: '' },
    source: 'MITTR',
    published_at: '2026-06-01',
    difficulty_level: 'hard',
    word_count: 1384,
    reading_time: 8,
    view_count: 0,
    status: 'published',
    is_featured: true,
    created_at: '',
    updated_at: '',
    content: '',
    cover_image: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: -4,
    title: 'The deadly Ebola outbreak is proving difficult to control',
    title_cn: '致命的埃博拉疫情难以控制',
    slug: 'ebola-outbreak-control',
    summary: 'Public health teams face a familiar set of barriers in tracing, treatment, and trust.',
    category_id: 3,
    category: { id: 3, name: 'Biotechnology and health', slug: 'biotech-health', sort_order: 3, created_at: '', updated_at: '' },
    source: 'MITTR',
    published_at: '2026-05-29',
    difficulty_level: 'hard',
    word_count: 1022,
    reading_time: 6,
    view_count: 0,
    status: 'published',
    is_featured: true,
    created_at: '',
    updated_at: '',
    content: '',
    cover_image: 'https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: -5,
    title: 'How the Pope’s Magnifica Humanitas offers a template for the AI moment',
    title_cn: '教宗的《辉煌人性》为个人应对人工智能时代提供了模板',
    slug: 'pope-ai-humanitas',
    summary: 'A human-centered text becomes a useful reference for technology ethics.',
    category_id: 2,
    category: { id: 2, name: 'Artificial intelligence', slug: 'ai', sort_order: 2, created_at: '', updated_at: '' },
    source: 'MITTR',
    published_at: '2026-05-29',
    difficulty_level: 'hard',
    word_count: 1032,
    reading_time: 7,
    view_count: 0,
    status: 'published',
    is_featured: true,
    created_at: '',
    updated_at: '',
    content: '',
    cover_image: 'https://images.unsplash.com/photo-1495562569060-2eec283d3391?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: -6,
    title: 'How a new extraction process could unlock the world’s lithium',
    title_cn: '新提炼技术或将开启全球锂资源新局面',
    slug: 'lithium-extraction-process',
    summary: 'Mining startups are testing cleaner routes to a crucial battery material.',
    category_id: 1,
    category: { id: 1, name: 'Climate change and energy', slug: 'climate-energy', sort_order: 1, created_at: '', updated_at: '' },
    source: 'MITTR',
    published_at: '2026-05-28',
    difficulty_level: 'hard',
    word_count: 1130,
    reading_time: 7,
    view_count: 0,
    status: 'published',
    is_featured: false,
    created_at: '',
    updated_at: '',
    content: '',
    cover_image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: -7,
    title: 'Climate tech companies are going public. What’s next?',
    title_cn: '气候科技公司纷纷上市，下一步是什么？',
    slug: 'climate-tech-going-public',
    summary: 'Investors are asking whether climate infrastructure can scale with public-market pressure.',
    category_id: 1,
    category: { id: 1, name: 'Climate change and energy', slug: 'climate-energy', sort_order: 1, created_at: '', updated_at: '' },
    source: 'MITTR',
    published_at: '2026-05-28',
    difficulty_level: 'medium',
    word_count: 935,
    reading_time: 5,
    view_count: 0,
    status: 'published',
    is_featured: false,
    created_at: '',
    updated_at: '',
    content: '',
    cover_image: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: -8,
    title: 'The AI Hype Index: AI gets booed in graduation season',
    title_cn: '人工智能热度指数：毕业季，人工智能遭遇嘘声',
    slug: 'ai-hype-index-graduation-season',
    summary: 'Campus debates show a widening gap between AI marketing and public trust.',
    category_id: 2,
    category: { id: 2, name: 'Artificial intelligence', slug: 'ai', sort_order: 2, created_at: '', updated_at: '' },
    source: 'MITTR',
    published_at: '2026-05-28',
    difficulty_level: 'easy',
    word_count: 160,
    reading_time: 2,
    view_count: 0,
    status: 'published',
    is_featured: false,
    created_at: '',
    updated_at: '',
    content: '',
    cover_image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: -9,
    title: 'It’s time to address the looming crisis in entry-level work.',
    title_cn: '是时候正视入门级工作面临的迫在眉睫的危机了',
    slug: 'entry-level-work-crisis',
    summary: 'Automation is reshaping the first rung of white-collar careers faster than institutions can respond.',
    category_id: 2,
    category: { id: 2, name: 'Artificial intelligence', slug: 'ai', sort_order: 2, created_at: '', updated_at: '' },
    source: 'MITTR',
    published_at: '2026-05-26',
    difficulty_level: 'hard',
    word_count: 1199,
    reading_time: 7,
    view_count: 0,
    status: 'published',
    is_featured: false,
    created_at: '',
    updated_at: '',
    content: '',
    cover_image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: -10,
    title: 'A reality check on the AI jobs hysteria',
    title_cn: '对AI就业恐慌的现实审视',
    slug: 'ai-jobs-hysteria-reality-check',
    summary: 'The data suggests disruption is real, but the labor story is more complicated than headlines imply.',
    category_id: 2,
    category: { id: 2, name: 'Artificial intelligence', slug: 'ai', sort_order: 2, created_at: '', updated_at: '' },
    source: 'MITTR',
    published_at: '2026-05-26',
    difficulty_level: 'hard',
    word_count: 3153,
    reading_time: 14,
    view_count: 0,
    status: 'published',
    is_featured: false,
    created_at: '',
    updated_at: '',
    content: '',
    cover_image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80',
  },
];

const difficultyLabels = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

const difficultyStyles = {
  easy: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  hard: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
};

function articleHref(article: Article) {
  return article.id < 0 ? '/journals' : `/articles/${article.slug}`;
}


function ArticleCard({ article }: { article: Article }) {
  const coverImageURL = article.cover_image ? resolveAPIAssetURL(article.cover_image) : '';
  const shouldBypassImageOptimizer = isRemoteHTTPURL(coverImageURL);

  return (
    <Link href={articleHref(article)} className="group">
      <article className="overflow-hidden rounded-xl bg-white shadow-sm transition-all hover:shadow-md dark:bg-gray-900">
        <div className="relative aspect-[16/9] overflow-hidden bg-gray-100 dark:bg-gray-800">
          {coverImageURL ? (
            <Image
              src={coverImageURL}
              alt={article.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 400px"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              unoptimized={shouldBypassImageOptimizer}
            />
          ) : (
            <BookOpen className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-gray-300" />
          )}
        </div>
        <div className="p-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500">
            <span>{article.source || 'MITTR'}</span>
            <span>·</span>
            <span>{article.published_at}</span>
          </div>
          <h3 className="mb-2 line-clamp-2 text-lg font-bold leading-snug text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
            {article.title}
          </h3>
          {article.summary && (
            <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{article.summary}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className={`rounded-full px-2.5 py-0.5 font-medium ${difficultyStyles[article.difficulty_level]}`}>
              {difficultyLabels[article.difficulty_level]}
            </span>
            <span>{article.reading_time} 分钟</span>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default function Home() {
  const [articles, setArticles] = useState<Article[]>(fallbackArticles);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        setLoading(true);
        const response = await articleAPI.getArticles({ page: 1, page_size: 10 });
        const data = response.data.data;
        if (Array.isArray(data) && data.length > 0) {
          setArticles(data);
        }
      } catch (error) {
        console.error('Failed to fetch articles:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, []);

  const featuredArticle = articles[0];
  const latestArticles = useMemo(() => articles.slice(1, 9), [articles]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <section className="mb-16 text-center">
          <div className="mx-auto max-w-3xl">
            <h1 className="mb-4 text-4xl font-black tracking-tight text-gray-900 dark:text-gray-100 sm:text-5xl">
              把每一篇英文材料
              <span className="block text-blue-600 dark:text-blue-400">读成可复习的积累</span>
            </h1>
            <p className="mb-8 text-lg text-gray-600 dark:text-gray-400">
              划词查义、收藏句子、间隔复习，让英文阅读真正产生积累
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/study"
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 font-semibold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg"
              >
                开始学习
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/vocabulary"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-gray-900 shadow-md transition-all hover:shadow-lg dark:bg-gray-800 dark:text-gray-100"
              >
                生词复习
              </Link>
              <Link
                href="/ao3"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-gray-900 shadow-md transition-all hover:shadow-lg dark:bg-gray-800 dark:text-gray-100"
              >
                AO3 阅读
              </Link>
            </div>
          </div>
        </section>

        {/* Featured Article */}
        {loading ? (
          <div className="mb-16 flex min-h-[400px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : featuredArticle ? (
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">今日推荐</h2>
            </div>
            <Link href={articleHref(featuredArticle)} className="group">
              <article className="overflow-hidden rounded-2xl bg-white shadow-lg transition-all hover:shadow-xl dark:bg-gray-900">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-gray-800 md:aspect-auto">
                    {featuredArticle.cover_image ? (
                      <Image
                        src={resolveAPIAssetURL(featuredArticle.cover_image)}
                        alt={featuredArticle.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        unoptimized={isRemoteHTTPURL(resolveAPIAssetURL(featuredArticle.cover_image))}
                      />
                    ) : (
                      <BookOpen className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-gray-300" />
                    )}
                  </div>
                  <div className="flex flex-col justify-center p-8">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-500">
                      <span>{featuredArticle.source || 'MITTR'}</span>
                      <span>·</span>
                      <span>{featuredArticle.published_at}</span>
                      <span className={`ml-2 rounded-full px-3 py-0.5 text-xs font-semibold ${difficultyStyles[featuredArticle.difficulty_level]}`}>
                        {difficultyLabels[featuredArticle.difficulty_level]}
                      </span>
                    </div>
                    <h3 className="mb-3 text-2xl font-bold leading-tight text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
                      {featuredArticle.title}
                    </h3>
                    {featuredArticle.title_cn && (
                      <p className="mb-3 text-base font-medium text-gray-600 dark:text-gray-400">{featuredArticle.title_cn}</p>
                    )}
                    {featuredArticle.summary && (
                      <p className="mb-4 line-clamp-3 text-gray-600 dark:text-gray-400">{featuredArticle.summary}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{featuredArticle.word_count} 词</span>
                      <span>{featuredArticle.reading_time} 分钟</span>
                    </div>
                  </div>
                </div>
              </article>
            </Link>
          </section>
        ) : null}

        {/* Latest Articles Grid */}
        <section>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">最新文章</h2>
            <Link
              href="/journals"
              className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              查看全部
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {loading ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {latestArticles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
