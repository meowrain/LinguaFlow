export default function Loading() {
  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6"
      style={{ background: 'linear-gradient(to bottom, var(--background), var(--surface))' }}
    >
      {/* Brand */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <span className="text-3xl font-black tracking-tight" style={{ color: 'var(--foreground)' }}>
            LinguaFlow
          </span>
          {/* Shimmer overlay */}
          <span
            className="absolute inset-0 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
            style={{
              backgroundImage:
                'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 28%, transparent), transparent)',
            }}
            aria-hidden="true"
          />
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>正在加载...</p>
      </div>

      {/* Spinner */}
      <div className="relative h-10 w-10">
        <div
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: 'var(--border)' }}
        />
        <div
          className="absolute inset-0 animate-spin rounded-full border-2 border-transparent"
          style={{ borderTopColor: 'var(--accent)' }}
        />
      </div>

      {/* Skeleton hints */}
      <div className="mx-auto w-full max-w-2xl space-y-3 px-8">
        <div className="h-4 w-3/4 animate-pulse rounded-full" style={{ background: 'var(--surface-muted)' }} />
        <div className="h-4 w-1/2 animate-pulse rounded-full" style={{ background: 'var(--surface-muted)' }} />
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="h-24 animate-pulse rounded-xl" style={{ background: 'var(--surface-muted)' }} />
          <div className="h-24 animate-pulse rounded-xl" style={{ background: 'var(--surface-muted)' }} />
          <div className="h-24 animate-pulse rounded-xl" style={{ background: 'var(--surface-muted)' }} />
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
