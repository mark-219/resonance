import { useAuthStore } from '@/stores/authStore';
import { Settings, User, Shield } from 'lucide-react';

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Manage your account and preferences
        </p>
      </div>

      {/* Profile */}
      <section className="bg-surface-raised border border-border-subtle rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-3">
          <User size={18} className="text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Profile</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-text-tertiary mb-1">Username</p>
            <p className="text-text-primary">{user?.username ?? '—'}</p>
          </div>
          <div>
            <p className="text-text-tertiary mb-1">Email</p>
            <p className="text-text-primary">{user?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-text-tertiary mb-1">Role</p>
            <p className="text-text-primary capitalize">{user?.role ?? '—'}</p>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="bg-surface-raised border border-border-subtle rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Shield size={18} className="text-accent" />
          <h2 className="text-sm font-medium text-text-primary">Security</h2>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-primary">Sign out</p>
            <p className="text-xs text-text-tertiary">
              End your current session
            </p>
          </div>
          <button
            onClick={logout}
            className="px-3 py-1.5 rounded bg-error/10 border border-error/20 text-error text-sm hover:bg-error/20 transition-colors"
          >
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}
