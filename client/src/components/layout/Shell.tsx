import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PlayerBar } from '../player/PlayerBar';
import { usePlayerStore } from '@/stores/playerStore';

export function Shell() {
  const initAudio = usePlayerStore((s) => s.initAudio);

  useEffect(() => {
    initAudio();
  }, [initAudio]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <PlayerBar />
      </div>
    </div>
  );
}
