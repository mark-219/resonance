import { Library, HardDrive, Music, Disc3, Users } from 'lucide-react';
import { useStats } from '@/api/hooks';

export function Dashboard() {
  const { data: stats, isLoading } = useStats();

  const cards = [
    { icon: Library, label: 'Libraries', value: stats?.libraries ?? 0 },
    { icon: HardDrive, label: 'Remote Hosts', value: stats?.remoteHosts ?? 0 },
    { icon: Users, label: 'Artists', value: stats?.artists ?? 0 },
    { icon: Disc3, label: 'Albums', value: stats?.albums ?? 0 },
    { icon: Music, label: 'Tracks', value: stats?.tracks ?? 0 },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary mt-1">
          Overview of your music libraries
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="bg-surface-raised border border-border-subtle rounded-lg p-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-accent-subtle">
                <Icon size={18} className="text-accent" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-text-primary">
                  {isLoading ? '—' : value.toLocaleString()}
                </p>
                <p className="text-xs text-text-secondary">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h2 className="text-sm font-medium text-text-primary mb-4">Recent Activity</h2>
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-text-tertiary">
            {stats && stats.tracks > 0
              ? `${stats.albums} albums and ${stats.tracks} tracks indexed across ${stats.libraries} libraries.`
              : 'No activity yet. Add a library to get started.'}
          </p>
        </div>
      </div>
    </div>
  );
}
