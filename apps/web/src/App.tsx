import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { trpc, createTRPCClient } from '@/lib/trpc';
import { AppShell } from '@/components/layout/AppShell';

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
      <div className="text-[var(--color-muted)] text-sm animate-pulse">Loading...</div>
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = trpc.auth.verify.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-deep-blue)] flex items-center justify-center">
        <div className="text-[var(--color-muted)] text-sm animate-pulse">Loading...</div>
      </div>
    );
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
      </QueryClientProvider>
    </trpc.Provider>
  );
}
