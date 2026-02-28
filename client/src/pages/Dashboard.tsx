import { Library, HardDrive, Music, Disc3 } from 'lucide-react';

export function Dashboard() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary mt-1">
          Overview of your music libraries
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Library, label: 'Libraries', value: '—' },
          { icon: HardDrive, label: 'Remote Hosts', value: '—' },
          { icon: Disc3, label: 'Albums', value: '—' },
          { icon: Music, label: 'Tracks', value: '—' },
        ].map(({ icon: Icon, label, value }) => (
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
                  {value}
                </p>
                <p className="text-xs text-text-secondary">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent activity placeholder */}
      <div className="bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h2 className="text-sm font-medium text-text-primary mb-4">
          Recent Activity
        </h2>
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-text-tertiary">
            No activity yet. Add a library to get started.
          </p>
        </div>
      </div>
    </div>
  );
}
