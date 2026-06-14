'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

function NavigationProgressBar() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const prevPathname = useRef(pathname);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Skip on first render (initial page load, not a navigation)
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;

    // Clear any existing timers
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    // Start progress
    setLoading(true);
    setProgress(15);

    // Animate progress
    timersRef.current.push(setTimeout(() => setProgress(50), 150));
    timersRef.current.push(setTimeout(() => setProgress(80), 400));

    // Complete
    timersRef.current.push(
      setTimeout(() => {
        setProgress(100);
        timersRef.current.push(
          setTimeout(() => {
            setLoading(false);
            setProgress(0);
          }, 250)
        );
      }, 700)
    );

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [pathname]);

  if (!loading) return null;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[9999] h-[3px]"
      aria-hidden="true"
    >
      <div
        className="h-full transition-[width] duration-300 ease-out"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #ffffff))',
          boxShadow: '0 0 8px color-mix(in srgb, var(--accent) 60%, transparent)',
        }}
      />
    </div>
  );
}

export default function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  );
}
