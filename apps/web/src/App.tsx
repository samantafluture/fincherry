import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { trpc, createTRPCClient } from '@/lib/trpc';
import { AppShell } from '@/components/layout/AppShell';
import { Skeleton } from '@/components/ui/Skeleton';
import { ToastProvider } from '@/components/ui/toast';

const LoginPage = lazy(() =>
  import('@/pages/Login').then((m) => ({ default: m.LoginPage })),
);
const DashboardPage = lazy(() =>
  import('@/pages/Dashboard').then((m) => ({ default: m.DashboardPage })),
);
const TransactionsPage = lazy(() =>
  import('@/pages/Transactions').then((m) => ({ default: m.TransactionsPage })),
);
const UploadPage = lazy(() =>
  import('@/pages/Upload').then((m) => ({ default: m.UploadPage })),
);
const GoalsPage = lazy(() =>
  import('@/pages/Goals').then((m) => ({ default: m.GoalsPage })),
);
const AIPage = lazy(() =>
  import('@/pages/AI').then((m) => ({ default: m.AIPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })),
);

function RouteLoader() {
  return (
    <div className="min-h-screen bg-[var(--color-deep-blue)] flex items-center justify-center">
      <div className="w-[min(92vw,24rem)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = trpc.auth.verify.useQuery();

  if (isLoading) {
    return <RouteLoader />;
  }

  if (!data?.valid) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  }));
  const [trpcClient] = useState(createTRPCClient);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route
                path="/login"
                element={(
                  <Suspense fallback={<RouteLoader />}>
                    <LoginPage />
                  </Suspense>
                )}
              />
              <Route
                element={
                  <AuthGuard>
                    <AppShell />
                  </AuthGuard>
                }
              >
                <Route
                  path="/"
                  element={(
                    <Suspense fallback={<RouteLoader />}>
                      <DashboardPage />
                    </Suspense>
                  )}
                />
                <Route
                  path="/transactions"
                  element={(
                    <Suspense fallback={<RouteLoader />}>
                      <TransactionsPage />
                    </Suspense>
                  )}
                />
                <Route
                  path="/upload"
                  element={(
                    <Suspense fallback={<RouteLoader />}>
                      <UploadPage />
                    </Suspense>
                  )}
                />
                <Route
                  path="/goals"
                  element={(
                    <Suspense fallback={<RouteLoader />}>
                      <GoalsPage />
                    </Suspense>
                  )}
                />
                <Route
                  path="/ai"
                  element={(
                    <Suspense fallback={<RouteLoader />}>
                      <AIPage />
                    </Suspense>
                  )}
                />
                <Route
                  path="/settings"
                  element={(
                    <Suspense fallback={<RouteLoader />}>
                      <SettingsPage />
                    </Suspense>
                  )}
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
