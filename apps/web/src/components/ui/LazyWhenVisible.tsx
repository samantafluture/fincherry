import { useEffect, useRef, useState, type ReactNode } from 'react';

type LazyWhenVisibleProps = {
  children: ReactNode;
  placeholder?: ReactNode;
  minHeight?: number;
  rootMargin?: string;
  className?: string;
};

export function LazyWhenVisible({
  children,
  placeholder,
  minHeight = 180,
  rootMargin = '180px',
  className,
}: LazyWhenVisibleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible) return;
    const node = containerRef.current;
    if (!node) return;

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setIsVisible(true);
          observer.disconnect();
          break;
        }
      },
      { rootMargin, threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  return (
    <div ref={containerRef} className={className}>
      {isVisible
        ? children
        : placeholder ?? (
            <div
              className="animate-pulse rounded-xl bg-[var(--color-surface-hover)]/80"
              style={{ minHeight }}
              aria-hidden
            />
          )}
    </div>
  );
}
