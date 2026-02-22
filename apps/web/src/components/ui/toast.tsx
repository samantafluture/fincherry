import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastVariant = 'info' | 'success' | 'error';

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastRecord = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const toastVariantStyles: Record<ToastVariant, { panel: string; dot: string }> = {
  info: {
    panel: 'border-[var(--color-border)] bg-[var(--color-surface)]',
    dot: 'bg-[var(--color-soft-blue)]',
  },
  success: {
    panel: 'border-[#124A3B] bg-[#0D2B23]',
    dot: 'bg-[var(--color-green)]',
  },
  error: {
    panel: 'border-[#5C1F20] bg-[#311315]',
    dot: 'bg-[var(--color-coral)]',
  },
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timersRef = useRef(new Map<number, number>());
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    const timerId = timersRef.current.get(id);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = ++nextIdRef.current;
      const variant = input.variant ?? 'info';
      setToasts((prev) => [
        ...prev,
        { id, title: input.title, description: input.description, variant },
      ]);

      const durationMs = input.durationMs ?? (variant === 'error' ? 6500 : 4200);
      const timerId = window.setTimeout(() => dismiss(id), durationMs);
      timersRef.current.set(id, timerId);
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      for (const timerId of timersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      timersRef.current.clear();
    },
    [],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((item) => {
          const style = toastVariantStyles[item.variant];
          return (
            <div
              key={item.id}
              role={item.variant === 'error' ? 'alert' : 'status'}
              aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
              className={`pointer-events-auto rounded-xl border px-3 py-2 shadow-lg ${style.panel}`}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-1 inline-block h-2 w-2 rounded-full ${style.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--color-white)]">{item.title}</p>
                  {item.description && (
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">{item.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="text-xs text-[var(--color-muted)] hover:text-[var(--color-white)]"
                  aria-label="Dismiss notification"
                >
                  x
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
