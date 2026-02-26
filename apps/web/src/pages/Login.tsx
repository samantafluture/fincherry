import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';

export function LoginPage() {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.verify.reset();
      navigate('/');
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    login.mutate({ passphrase });
  };

  return (
    <div className="min-h-screen bg-[var(--color-deep-blue)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-white)]">
            Fin<span className="text-[var(--color-cherry-pink)]">Cherry</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">Your personal finance dashboard</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider">
              Passphrase
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter your passphrase"
              autoFocus
              className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm text-[var(--color-white)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-cherry-pink)] focus:border-transparent transition"
            />
          </div>

          {error && (
            <p className="text-xs text-[var(--color-coral)] bg-[#1F1508] border border-[#3D2A0A] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending || !passphrase}
            className="w-full bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)] font-semibold rounded-xl py-3 text-sm hover:opacity-90 disabled:opacity-40 transition"
          >
            {login.isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
