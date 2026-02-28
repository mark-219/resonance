import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Shell } from '@/components/layout/Shell';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { LibraryPage } from '@/pages/LibraryPage';
import { BrowsePage } from '@/pages/BrowsePage';
import { SettingsPage } from '@/pages/SettingsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function App() {
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route
          path="/playlists"
          element={
            <div className="p-6">
              <h1 className="text-xl font-semibold text-text-primary">Playlists</h1>
              <p className="text-sm text-text-secondary mt-1">Coming soon</p>
            </div>
          }
        />
        <Route
          path="/collections"
          element={
            <div className="p-6">
              <h1 className="text-xl font-semibold text-text-primary">Collections</h1>
              <p className="text-sm text-text-secondary mt-1">Coming soon</p>
            </div>
          }
        />
        <Route
          path="/hosts"
          element={
            <div className="p-6">
              <h1 className="text-xl font-semibold text-text-primary">Remote Hosts</h1>
              <p className="text-sm text-text-secondary mt-1">Coming soon</p>
            </div>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
