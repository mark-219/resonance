import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import {
  LayoutDashboard,
  Library,
  FolderOpen,
  ListMusic,
  Bookmark,
  Settings,
  HardDrive,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/library', icon: Library, label: 'Library' },
  { to: '/browse', icon: FolderOpen, label: 'Browse' },
  { to: '/playlists', icon: ListMusic, label: 'Playlists' },
  { to: '/collections', icon: Bookmark, label: 'Collections' },
] as const;

const bottomItems = [
  { to: '/hosts', icon: HardDrive, label: 'Hosts' },
  { to: '/settings', icon: Settings, label: 'Settings' },
] as const;

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-surface-sunken border-r border-border-subtle transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-border-subtle">
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight text-text-primary">
            resonance
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'p-1.5 rounded hover:bg-surface-raised text-text-tertiary hover:text-text-secondary transition-colors',
            collapsed ? 'mx-auto' : 'ml-auto'
          )}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent-subtle text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="py-3 px-2 border-t border-border-subtle space-y-0.5">
        {bottomItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent-subtle text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
