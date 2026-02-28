import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { apiFetch } from '@/api/client';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const fetchUser = useAuthStore((s) => s.fetchUser);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      await fetchUser();
      if (useAuthStore.getState().isAuthenticated) {
        navigate('/');
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  }

  function handleOIDCLogin() {
    window.location.href = '/api/auth/oidc/login';
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            resonance
          </h1>
          <p className="text-sm text-text-tertiary mt-1">Music library manager</p>
        </div>

        <div className="bg-surface-raised border border-border-subtle rounded-lg p-6 space-y-5">
          {/* OIDC Login */}
          <button
            onClick={handleOIDCLogin}
            className="w-full py-2.5 px-4 rounded bg-accent hover:bg-accent-hover text-text-inverse text-sm font-medium transition-colors"
          >
            Sign in with SSO
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              or
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Local login form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="px-3 py-2 rounded bg-error/10 border border-error/20 text-error text-sm">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="username"
                className="block text-sm text-text-secondary mb-1.5"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded bg-surface border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent transition-colors"
                placeholder="admin"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm text-text-secondary mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded bg-surface border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded bg-surface-overlay hover:bg-border text-text-primary text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
