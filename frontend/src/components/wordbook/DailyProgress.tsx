'use client';

import { BookOpen, RotateCcw } from 'lucide-react';

interface DailyProgressProps {
  newDone: number;
  newTotal: number;
  reviewDone: number;
  reviewTotal: number;
}

function clampPercent(value: number, target: number) {
  if (target <= 0) return 100;
  return Math.min(100, Math.round((value / target) * 100));
}

export default function DailyProgress({
  newDone,
  newTotal,
  reviewDone,
  reviewTotal,
}: DailyProgressProps) {
  const newPct = clampPercent(newDone, newTotal);
  const reviewPct = clampPercent(reviewDone, reviewTotal);
  const totalDone = newDone + reviewDone;
  const totalAll = newTotal + reviewTotal;
  const totalPct = clampPercent(totalDone, totalAll);

  return (
    <div className="space-y-3">
      {/* 总进度 */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          今日进度
        </span>
        <span className="font-bold text-gray-950 dark:text-gray-100">
          {totalDone}/{totalAll} ({totalPct}%)
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${totalPct}%` }}
        />
      </div>

      {/* 分项 */}
      <div className="flex gap-4 text-xs">
        <div className="flex flex-1 items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-gray-500 dark:text-gray-400">
            新词 {newDone}/{newTotal}
          </span>
          <div className="flex-1">
            <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${newPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center gap-2">
          <RotateCcw className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-gray-500 dark:text-gray-400">
            复习 {reviewDone}/{reviewTotal}
          </span>
          <div className="flex-1">
            <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-orange-500 transition-all duration-300"
                style={{ width: `${reviewPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
