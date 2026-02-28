import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PlayerBar } from '../player/PlayerBar';

export function Shell() {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        {/* Main content area */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        {/* Persistent player bar */}
        <PlayerBar />
      </div>
    </div>
  );
}
