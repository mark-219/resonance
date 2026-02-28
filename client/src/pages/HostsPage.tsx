import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  useRemoteHosts,
  useCreateRemoteHost,
  useUpdateRemoteHost,
  useDeleteRemoteHost,
  useTestConnection,
  type RemoteHost,
  type TestConnectionResult,
} from '@/api/hooks';
import {
  Server,
  Plus,
  Pencil,
  Trash2,
  Wifi,
  Loader2,
  CheckCircle2,
  XCircle,
  Fingerprint,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';

// ─── Host Form Modal ────────────────────────────────────────────────

interface HostFormData {
  name: string;
  host: string;
  port: number;
  username: string;
  privateKeyPath: string;
}

function HostFormModal({
  host,
  onClose,
}: {
  host?: RemoteHost;
  onClose: () => void;
}) {
  const createMut = useCreateRemoteHost();
  const updateMut = useUpdateRemoteHost();
  const isEditing = !!host;

  const [form, setForm] = useState<HostFormData>({
    name: host?.name ?? '',
    host: host?.host ?? '',
    port: host?.port ?? 22,
    username: host?.username ?? '',
    privateKeyPath: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof HostFormData, string>>>({});

  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.host.trim()) e.host = 'Host is required';
    if (form.port < 1 || form.port > 65535) e.port = 'Port must be 1-65535';
    if (!form.username.trim()) e.username = 'Username is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;

    const body = {
      name: form.name.trim(),
      host: form.host.trim(),
      port: form.port,
      username: form.username.trim(),
      ...(form.privateKeyPath.trim() ? { privateKeyPath: form.privateKeyPath.trim() } : {}),
    };

    if (isEditing) {
      await updateMut.mutateAsync({ id: host.id, ...body });
    } else {
      await createMut.mutateAsync(body);
    }
    onClose();
  }

  const isPending = createMut.isPending || updateMut.isPending;
  const mutError = createMut.error || updateMut.error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface-raised border border-border-subtle rounded-lg w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <h2 className="text-sm font-medium text-text-primary">
            {isEditing ? 'Edit Host' : 'Add Host'}
          </h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <Field label="Name" error={errors.name}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="My Seedbox"
              className="w-full px-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent transition-colors"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Host" error={errors.host} className="col-span-2">
              <input
                type="text"
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                placeholder="seed.example.com"
                className="w-full px-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent transition-colors"
              />
            </Field>
            <Field label="Port" error={errors.port}>
              <input
                type="number"
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
                min={1}
                max={65535}
                className="w-full px-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent transition-colors"
              />
            </Field>
          </div>

          <Field label="Username" error={errors.username}>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="admin"
              className="w-full px-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent transition-colors"
            />
          </Field>

          <Field label="Private Key Path" hint="Path on the server filesystem">
            <input
              type="text"
              value={form.privateKeyPath}
              onChange={(e) => setForm((f) => ({ ...f, privateKeyPath: e.target.value }))}
              placeholder="/home/user/.ssh/id_ed25519"
              className="w-full px-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent transition-colors"
            />
          </Field>

          {mutError && (
            <p className="text-xs text-error">{mutError.message}</p>
          )}

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
              {isEditing ? 'Save' : 'Add Host'}
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
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-xs text-text-secondary mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-error mt-0.5">{error}</p>}
      {hint && !error && <p className="text-xs text-text-tertiary mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── Delete Confirmation ────────────────────────────────────────────

function DeleteConfirmModal({
  host,
  onClose,
}: {
  host: RemoteHost;
  onClose: () => void;
}) {
  const deleteMut = useDeleteRemoteHost();

  async function handleDelete() {
    await deleteMut.mutateAsync(host.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface-raised border border-border-subtle rounded-lg w-full max-w-sm mx-4 shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-medium text-text-primary mb-2">Delete Host</h2>
        <p className="text-sm text-text-secondary mb-4">
          Are you sure you want to delete <strong className="text-text-primary">{host.name}</strong>?
          This cannot be undone.
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

// ─── Test Connection Result ─────────────────────────────────────────

function TestResultBanner({
  result,
  onAccept,
  isAccepting,
  onDismiss,
}: {
  result: TestConnectionResult;
  onAccept?: () => void;
  isAccepting: boolean;
  onDismiss: () => void;
}) {
  const needsAcceptance = result.needsAcceptance && result.fingerprint;

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm flex items-start gap-2',
        result.success
          ? 'bg-success/10 border-success/20 text-success'
          : needsAcceptance
            ? 'bg-warning/10 border-warning/20 text-warning'
            : 'bg-error/10 border-error/20 text-error'
      )}
    >
      {result.success ? (
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
      ) : (
        <XCircle size={16} className="mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p>{result.message}</p>
        {needsAcceptance && result.fingerprint && (
          <div className="mt-2">
            <p className="text-xs font-mono break-all text-text-secondary">{result.fingerprint}</p>
            <button
              onClick={onAccept}
              disabled={isAccepting}
              className="mt-2 px-2 py-1 rounded text-xs bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {isAccepting && <Loader2 size={12} className="animate-spin" />}
              Accept Fingerprint
            </button>
          </div>
        )}
      </div>
      <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Host Card ──────────────────────────────────────────────────────

function HostCard({
  host,
  isAdmin,
  onEdit,
  onDelete,
}: {
  host: RemoteHost;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const testMut = useTestConnection();
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  async function handleTest(acceptFingerprint = false) {
    const result = await testMut.mutateAsync({ id: host.id, acceptFingerprint });
    setTestResult(result);
  }

  return (
    <section className="bg-surface-raised border border-border-subtle rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded bg-surface-overlay flex items-center justify-center shrink-0">
            <Server size={16} className="text-text-tertiary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-text-primary truncate">{host.name}</h3>
            <p className="text-xs text-text-secondary truncate">
              {host.username}@{host.host}:{host.port}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => handleTest()}
            disabled={testMut.isPending}
            className="p-1.5 rounded text-text-tertiary hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
            title="Test Connection"
          >
            {testMut.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Wifi size={15} />
            )}
          </button>
          {isAdmin && (
            <>
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
        <span className="flex items-center gap-1">
          <Fingerprint size={12} />
          {host.hostFingerprint ? 'Verified' : 'Not verified'}
        </span>
        <span>Added {new Date(host.createdAt).toLocaleDateString()}</span>
      </div>

      {testResult && (
        <TestResultBanner
          result={testResult}
          onAccept={() => handleTest(true)}
          isAccepting={testMut.isPending}
          onDismiss={() => setTestResult(null)}
        />
      )}
    </section>
  );
}

// ─── Hosts Page ─────────────────────────────────────────────────────

export function HostsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const { data: hosts, isLoading } = useRemoteHosts();

  const [showForm, setShowForm] = useState(false);
  const [editHost, setEditHost] = useState<RemoteHost | undefined>();
  const [deleteHost, setDeleteHost] = useState<RemoteHost | undefined>();

  function openAdd() {
    setEditHost(undefined);
    setShowForm(true);
  }

  function openEdit(host: RemoteHost) {
    setEditHost(host);
    setShowForm(true);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Remote Hosts</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Manage SSH connections to seedboxes
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-white text-sm hover:bg-accent/90 transition-colors"
          >
            <Plus size={15} />
            Add Host
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hosts || hosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Server size={40} className="text-text-tertiary mb-3" />
          <p className="text-sm text-text-secondary">No remote hosts configured</p>
          <p className="text-xs text-text-tertiary mt-1">
            {isAdmin
              ? 'Add a remote host to connect to your seedboxes.'
              : 'An admin needs to add remote hosts.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {hosts.map((host) => (
            <HostCard
              key={host.id}
              host={host}
              isAdmin={isAdmin}
              onEdit={() => openEdit(host)}
              onDelete={() => setDeleteHost(host)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <HostFormModal
          host={editHost}
          onClose={() => setShowForm(false)}
        />
      )}

      {deleteHost && (
        <DeleteConfirmModal
          host={deleteHost}
          onClose={() => setDeleteHost(undefined)}
        />
      )}
    </div>
  );
}
