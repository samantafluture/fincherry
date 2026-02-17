import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { trpc, createTRPCClient } from '@/lib/trpc';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/Login';
import { DashboardPage } from '@/pages/Dashboard';
import { TransactionsPage } from '@/pages/Transactions';
import { UploadPage } from '@/pages/Upload';
import { GoalsPage } from '@/pages/Goals';
import { AIPage } from '@/pages/AI';
import { SettingsPage } from '@/pages/Settings';

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
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <AuthGuard>
                  <AppShell />
                </AuthGuard>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/goals" element={<GoalsPage />} />
              <Route path="/ai" element={<AIPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
