import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Upload,
  Target,
  Sparkles,
  Settings,
  PanelLeft,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';

const NAV_ITEMS: Array<{
  to: string;
  icon: LucideIcon;
  label: string;
  end: boolean;
}> = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions', end: false },
  { to: '/upload', icon: Upload, label: 'Upload', end: false },
  { to: '/goals', icon: Target, label: 'Goals', end: false },
  { to: '/ai', icon: Sparkles, label: 'AI', end: false },
];

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => navigate('/login'),
  });
  const isTransactionsView = location.pathname.startsWith('/transactions');

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-deep-blue)]">
      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          'hidden lg:flex flex-col w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)]',
          !isDesktopSidebarOpen && 'lg:hidden',
        )}
      >
        {/* Logo */}
        <div className="px-6 py-5 border-b border-[var(--color-border)]">
          <NavLink to="/" className="text-lg font-semibold tracking-tight text-[var(--color-white)]">
            Fin<span className="text-[var(--color-cherry-pink)]">Cherry</span>
          </NavLink>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[var(--color-cherry-pink-muted)] text-[var(--color-cherry-pink)]'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-white)] hover:bg-[var(--color-surface-hover)]',
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Settings + Logout */}
        <div className="px-3 py-4 border-t border-[var(--color-border)] space-y-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[var(--color-cherry-pink-muted)] text-[var(--color-cherry-pink)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-white)] hover:bg-[var(--color-surface-hover)]',
              )
            }
          >
            <Settings size={16} />
            Settings
          </NavLink>
          <button
            onClick={() => logout.mutate()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-white)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Desktop header */}
        <header className="hidden lg:flex sticky top-0 z-10 items-center justify-between px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <button
            type="button"
            onClick={() => setIsDesktopSidebarOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-white)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <PanelLeft size={14} />
            {isDesktopSidebarOpen ? 'Hide Menu' : 'Show Menu'}
          </button>
          <NavLink
            to="/settings"
            className="text-[var(--color-muted)] hover:text-[var(--color-white)] transition-colors"
          >
            <Settings size={16} />
          </NavLink>
        </header>

        {/* Mobile header */}
        <header className="lg:hidden glass sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <NavLink to="/" className="text-base font-semibold text-[var(--color-white)]">
            Fin<span className="text-[var(--color-cherry-pink)]">Cherry</span>
          </NavLink>
          <NavLink
            to="/settings"
            className="text-[var(--color-muted)] hover:text-[var(--color-white)] transition-colors"
          >
            <Settings size={18} />
          </NavLink>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div
            className={cn(
              'mx-auto w-full py-5 pb-24 lg:pb-6',
              isTransactionsView
                ? 'max-w-[1500px] px-3 lg:px-5'
                : 'max-w-[980px] px-4',
            )}
          >
            <Outlet />
          </div>
        </main>

        {/* ── Mobile Bottom Nav ─────────────────────────────────────────── */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 glass border-t border-[var(--color-border)] flex justify-around items-center py-2 pb-safe">
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 px-4 py-1.5 transition-colors',
                  isActive
                    ? 'text-[var(--color-cherry-pink)]'
                    : 'text-[var(--color-muted)]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={20}
                    style={
                      isActive
                        ? { filter: 'drop-shadow(0 0 6px var(--color-cherry-pink-muted))' }
                        : undefined
                    }
                  />
                  <span className="text-[10px] font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
