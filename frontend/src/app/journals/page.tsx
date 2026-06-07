'use client';

import Link from 'next/link';

type Journal = {
  name: string;
  nameEn: string;
  slug: string;
  logo: string;
  bg: string;
  fg: string;
};

type JournalGroup = {
  title: string;
  items: Journal[];
};

const journalGroups: JournalGroup[] = [
  {
    title: '杂志',
    items: [
      { name: '经济学人', nameEn: 'The Economist', slug: 'the-economist', logo: 'E', bg: 'bg-red-600', fg: 'text-white' },
      { name: '大西洋月刊', nameEn: 'The Atlantic', slug: 'the-atlantic', logo: 'A', bg: 'bg-black', fg: 'text-white' },
      { name: '纽约客', nameEn: 'New Yorker', slug: 'new-yorker', logo: 'NY', bg: 'bg-slate-100', fg: 'text-slate-950' },
      { name: '哈佛商业评论', nameEn: 'Harvard Business Review', slug: 'hbr', logo: 'HBR', bg: 'bg-black', fg: 'text-white' },
      { name: '国家地理', nameEn: 'National Geographic', slug: 'national-geographic', logo: 'NG', bg: 'bg-black', fg: 'text-yellow-300' },
      { name: '科学美国人', nameEn: 'Scientific American', slug: 'scientific-american', logo: 'SCI', bg: 'bg-black', fg: 'text-white' },
      { name: '彭博商业周刊', nameEn: 'Bloomberg', slug: 'bloomberg', logo: 'B', bg: 'bg-yellow-300', fg: 'text-black' },
      { name: '纽约时报杂志', nameEn: 'NYTimes Magazine', slug: 'nyt-magazine', logo: 'T', bg: 'bg-black', fg: 'text-white' },
      { name: '时代周刊', nameEn: 'Times', slug: 'time', logo: 'TIME', bg: 'bg-red-500', fg: 'text-white' },
      { name: '连线杂志', nameEn: 'WIRED', slug: 'wired', logo: 'W', bg: 'bg-black', fg: 'text-white' },
      { name: 'MIT技术评论', nameEn: 'MITTR', slug: 'mit-technology-review', logo: 'MIT', bg: 'bg-black', fg: 'text-white' },
      { name: '新科学家', nameEn: 'New Scientist', slug: 'new-scientist', logo: 'NS', bg: 'bg-black', fg: 'text-white' },
      { name: '今日心理学', nameEn: 'Psychology Today', slug: 'psychology-today', logo: 'PT', bg: 'bg-sky-500', fg: 'text-white' },
    ],
  },
  {
    title: '日报',
    items: [
      { name: '纽约时报', nameEn: 'NYTimes', slug: 'new-york-times', logo: 'T', bg: 'bg-black', fg: 'text-white' },
      { name: '金融时报', nameEn: 'Financial Times', slug: 'financial-times', logo: 'FT', bg: 'bg-orange-200', fg: 'text-slate-950' },
      { name: '卫报', nameEn: 'The Guardian', slug: 'the-guardian', logo: 'G', bg: 'bg-blue-900', fg: 'text-white' },
      { name: '华尔街日报', nameEn: 'The Wall Street Journal', slug: 'wall-street-journal', logo: 'WSJ', bg: 'bg-white', fg: 'text-slate-950' },
      { name: '福克斯新闻网', nameEn: 'FoxNews', slug: 'fox-news', logo: 'FOX', bg: 'bg-blue-700', fg: 'text-white' },
      { name: '基督教科学箴言报', nameEn: 'The Christian Science Monitor', slug: 'christian-science-monitor', logo: 'M', bg: 'bg-yellow-300', fg: 'text-slate-950' },
      { name: '华盛顿邮报', nameEn: 'The Washington Post', slug: 'washington-post', logo: 'WP', bg: 'bg-white', fg: 'text-slate-950' },
      { name: '南华早报', nameEn: 'South China Morning Post', slug: 'south-china-morning-post', logo: 'SCMP', bg: 'bg-white', fg: 'text-slate-950' },
    ],
  },
];

function JournalItem({ item }: { item: Journal }) {
  return (
    <Link
      href={`/journals/${item.slug}`}
      className="group grid grid-cols-[56px_1fr] items-center gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-gray-900"
    >
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-base font-black shadow-sm ${item.bg} ${item.fg}`}
      >
        {item.logo}
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-base font-bold text-gray-100 group-hover:text-white">
          {item.name}
        </h3>
        <p className="truncate text-sm font-semibold text-gray-400">
          {item.nameEn}
        </p>
      </div>
    </Link>
  );
}

export default function JournalsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-2xl font-bold">全部外刊</h1>

      <div className="space-y-14">
        {journalGroups.map((group) => (
          <section key={group.title}>
            <div className="mb-5 border-b border-gray-700 pb-2">
              <h2 className="text-xl font-bold">{group.title}</h2>
            </div>
            <div className="grid grid-cols-1 gap-x-12 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
              {group.items.map((item) => (
                <JournalItem key={item.slug} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-14 text-center text-sm italic text-gray-500">
        更多外刊加入中，敬请期待！
      </p>
    </div>
  );
}
