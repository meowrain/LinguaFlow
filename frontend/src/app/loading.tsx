export default function Loading() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Brand */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <span className="text-3xl font-black tracking-tight text-gray-950 dark:text-gray-100">
            LinguaFlow
          </span>
          {/* Shimmer overlay */}
          <span
            className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
            aria-hidden="true"
          />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">正在加载...</p>
      </div>

      {/* Spinner */}
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-2 border-gray-200 dark:border-gray-700" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-blue-600 dark:border-t-blue-400" />
      </div>

      {/* Skeleton hints */}
      <div className="mx-auto w-full max-w-2xl space-y-3 px-8">
        <div className="h-4 w-3/4 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800" />
        <div className="h-4 w-1/2 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800" />
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="h-24 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />
          <div className="h-24 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />
          <div className="h-24 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
