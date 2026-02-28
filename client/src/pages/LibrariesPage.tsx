import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  useLibraries,
  useCreateLibrary,
  useUpdateLibrary,
  useDeleteLibrary,
  useScanLibrary,
  useScanJobs,
  useRemoteHosts,
  type Library,
} from '@/api/hooks';
import {
  FolderOpen,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';

// ─── Scan Status Banner ────────────────────────────────────────────

function ScanStatusBanner({ libraryId }: { libraryId: string }) {
  const { data } = useScanJobs(libraryId);
  const latestJob = data?.data?.[0];

  if (!latestJob) return null;

  const statusConfig = {
    pending: {
      icon: Clock,
      text: 'Scan pending...',
      className: 'bg-warning/10 border-warning/20 text-warning',
    },
    running: {
      icon: Loader2,
      text:
        latestJob.progress != null && latestJob.totalItems != null
          ? `Scanning... ${latestJob.progress}/${latestJob.totalItems}`
          : 'Scanning...',
      className: 'bg-accent/10 border-accent/20 text-accent',
    },
    completed: {
      icon: CheckCircle2,
      text: `Scan completed${latestJob.totalItems != null ? ` — ${latestJob.totalItems} items` : ''}`,
      className: 'bg-success/10 border-success/20 text-success',
    },
    failed: {
      icon: XCircle,
      text: 'Scan failed',
      className: 'bg-error/10 border-error/20 text-error',
    },
  } as const;

  const config = statusConfig[latestJob.status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-xs flex items-center gap-2',
        config.className
      )}
    >
      <Icon
        size={14}
        className={cn('shrink-0', latestJob.status === 'running' && 'animate-spin')}
      />
      <span>{config.text}</span>
      {latestJob.status === 'failed' && latestJob.logOutput && (
        <span className="text-text-tertiary truncate ml-1">— {latestJob.logOutput}</span>
      )}
    </div>
  );
}

// ─── Library Card ──────────────────────────────────────────────────

function LibraryCard({
  library,
  isAdmin,
  onEdit,
  onDelete,
}: {
  library: Library;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const scanMut = useScanLibrary();
  const isRemote = !!library.remoteHostId;

  return (
    <section className="bg-surface-raised border border-border-subtle rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded bg-surface-overlay flex items-center justify-center shrink-0">
            {isRemote ? (
              <HardDrive size={16} className="text-text-tertiary" />
            ) : (
              <FolderOpen size={16} className="text-text-tertiary" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-text-primary truncate">
                {library.name}
              </h3>
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider shrink-0',
                  isRemote
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'bg-surface-overlay text-text-secondary border border-border-subtle'
                )}
              >
                {isRemote ? 'Remote' : 'Local'}
              </span>
            </div>
            <p className="text-xs text-text-secondary truncate">
              {isRemote
                ? `${library.remoteHostName ?? 'Unknown host'}: ${library.remotePath}`
                : library.localPath}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isAdmin && (
            <>
              <button
                onClick={() => scanMut.mutate(library.id)}
                disabled={scanMut.isPending}
                className="p-1.5 rounded text-text-tertiary hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                title="Scan Library"
              >
                {scanMut.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <RefreshCw size={15} />
                )}
              </button>
              <button
                onClick={onEdit}
                className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-overlay transition-colors"
                title="Edit"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 rounded text-text-tertiary hover:text-error hover:bg-error/10 transition-colors"
                title="Delete"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-text-tertiary">
        <span>
          {library.lastScannedAt
            ? `Last scanned ${new Date(library.lastScannedAt).toLocaleDateString()}`
            : 'Never scanned'}
        </span>
        <span>Added {new Date(library.createdAt).toLocaleDateString()}</span>
      </div>

      <ScanStatusBanner libraryId={library.id} />
    </section>
  );
}

// ─── Library Form Modal ────────────────────────────────────────────

interface LibraryFormData {
  name: string;
  type: 'local' | 'remote';
  localPath: string;
  remoteHostId: string;
  remotePath: string;
}

function LibraryFormModal({
  library,
  onClose,
}: {
  library?: Library;
  onClose: () => void;
}) {
  const createMut = useCreateLibrary();
  const updateMut = useUpdateLibrary();
  const { data: hosts } = useRemoteHosts();
  const isEditing = !!library;

  const [form, setForm] = useState<LibraryFormData>({
    name: library?.name ?? '',
    type: library?.remoteHostId ? 'remote' : 'local',
    localPath: library?.localPath ?? '',
    remoteHostId: library?.remoteHostId ?? '',
    remotePath: library?.remotePath ?? '',
  });

  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (form.type === 'local') {
      if (!form.localPath.trim()) e.localPath = 'Local path is required';
    } else {
      if (!form.remoteHostId) e.remoteHostId = 'Select a remote host';
      if (!form.remotePath.trim()) e.remotePath = 'Remote path is required';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;

    if (isEditing) {
      await updateMut.mutateAsync({
        id: library.id,
        name: form.name.trim(),
        ...(form.type === 'local'
          ? { localPath: form.localPath.trim() }
          : { remotePath: form.remotePath.trim() }),
      });
    } else {
      await createMut.mutateAsync({
        name: form.name.trim(),
        ...(form.type === 'local'
          ? { localPath: form.localPath.trim() }
          : { remoteHostId: form.remoteHostId, remotePath: form.remotePath.trim() }),
      });
    }
    onClose();
  }

  const isPending = createMut.isPending || updateMut.isPending;
  const mutError = createMut.error || updateMut.error;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-surface-raised border border-border-subtle rounded-lg w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <h2 className="text-sm font-medium text-text-primary">
            {isEditing ? 'Edit Library' : 'Add Library'}
          </h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <Field label="Name" error={errors.name}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="My Music Library"
              className="w-full px-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent transition-colors"
            />
          </Field>

          {!isEditing && (
            <Field label="Type">
              <div className="flex gap-2">
                {(['local', 'remote'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={cn(
                      'flex-1 px-3 py-2 rounded border text-sm font-medium transition-colors',
                      form.type === t
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-overlay'
                    )}
                  >
                    {t === 'local' ? 'Local' : 'Remote'}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {form.type === 'local' ? (
            <Field label="Local Path" error={errors.localPath}>
              <input
                type="text"
                value={form.localPath}
                onChange={(e) => setForm((f) => ({ ...f, localPath: e.target.value }))}
                placeholder="/media/music"
                className="w-full px-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent transition-colors"
              />
            </Field>
          ) : (
            <>
              <Field label="Remote Host" error={errors.remoteHostId}>
                <select
                  value={form.remoteHostId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, remoteHostId: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary focus:border-accent transition-colors"
                >
                  <option value="">Select a host...</option>
                  {hosts?.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.host})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Remote Path" error={errors.remotePath}>
                <input
                  type="text"
                  value={form.remotePath}
                  onChange={(e) => setForm((f) => ({ ...f, remotePath: e.target.value }))}
                  placeholder="/home/user/music"
                  className="w-full px-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent transition-colors"
                />
              </Field>
            </>
          )}

          {mutError && <p className="text-xs text-error">{mutError.message}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-3 py-1.5 rounded bg-accent text-white text-sm hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              {isEditing ? 'Save' : 'Add Library'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-xs text-text-secondary mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-error mt-0.5">{error}</p>}
    </div>
  );
}

// ─── Delete Confirmation ────────────────────────────────────────────

function DeleteConfirmModal({
  library,
  onClose,
}: {
  library: Library;
  onClose: () => void;
}) {
  const deleteMut = useDeleteLibrary();

  async function handleDelete() {
    await deleteMut.mutateAsync(library.id);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-surface-raised border border-border-subtle rounded-lg w-full max-w-sm mx-4 shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-medium text-text-primary mb-2">Delete Library</h2>
        <p className="text-sm text-text-secondary mb-4">
          Are you sure you want to delete{' '}
          <strong className="text-text-primary">{library.name}</strong>? This will remove
          all associated albums, tracks, and scan history. This cannot be undone.
        </p>
        {deleteMut.error && (
          <p className="text-xs text-error mb-3">{deleteMut.error.message}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            className="px-3 py-1.5 rounded bg-error/10 border border-error/20 text-error text-sm hover:bg-error/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {deleteMut.isPending && <Loader2 size={14} className="animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Libraries Page ─────────────────────────────────────────────────

export function LibrariesPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const { data: librariesData, isLoading } = useLibraries();
  const libraries = librariesData?.data;

  const [showForm, setShowForm] = useState(false);
  const [editLibrary, setEditLibrary] = useState<Library | undefined>();
  const [deleteLibrary, setDeleteLibrary] = useState<Library | undefined>();

  function openAdd() {
    setEditLibrary(undefined);
    setShowForm(true);
  }

  function openEdit(library: Library) {
    setEditLibrary(library);
    setShowForm(true);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Libraries</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Manage music libraries across local and remote storage
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-white text-sm hover:bg-accent/90 transition-colors"
          >
            <Plus size={15} />
            Add Library
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !libraries || libraries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen size={40} className="text-text-tertiary mb-3" />
          <p className="text-sm text-text-secondary">No libraries configured</p>
          <p className="text-xs text-text-tertiary mt-1">
            {isAdmin
              ? 'Add a library to start organizing your music.'
              : 'An admin needs to add libraries.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {libraries.map((library) => (
            <LibraryCard
              key={library.id}
              library={library}
              isAdmin={isAdmin}
              onEdit={() => openEdit(library)}
              onDelete={() => setDeleteLibrary(library)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <LibraryFormModal library={editLibrary} onClose={() => setShowForm(false)} />
      )}

      {deleteLibrary && (
        <DeleteConfirmModal
          library={deleteLibrary}
          onClose={() => setDeleteLibrary(undefined)}
        />
      )}
    </div>
  );
}
