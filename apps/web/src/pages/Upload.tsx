import { useState, useRef } from 'react';
import { Upload as UploadIcon } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatCAD } from '@/lib/formatCurrency';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast';

export function UploadPage() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState('');
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    data: accounts,
    error: accountsError,
    isLoading: accountsLoading,
  } = trpc.accounts.list.useQuery();
  const { data: preview } = trpc.uploads.preview.useQuery(
    { uploadId: uploadId! },
    { enabled: !!uploadId },
  );

  const confirm = trpc.uploads.confirm.useMutation({
    onSuccess: () => {
      const importedCount = preview?.filter((tx) => !tx.isDuplicate).length ?? 0;
      setFile(null);
      setUploadId(null);
      setAccountId('');
      toast({
        variant: 'success',
        title: 'Import complete',
        description:
          importedCount > 0
            ? `Imported ${importedCount} transaction${importedCount === 1 ? '' : 's'}.`
            : 'Upload confirmed.',
      });
    },
    onError: (err) => {
      setError(err.message);
      toast({
        variant: 'error',
        title: 'Import failed',
        description: err.message,
      });
    },
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') {
      setFile(dropped);
      setError('');
      return;
    }

    setError('Please drop a PDF file');
    toast({
      variant: 'error',
      title: 'Invalid file',
      description: 'Please drop a PDF file.',
      durationMs: 4500,
    });
  };

  const handleUpload = async () => {
    if (!file || !accountId) return;
    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('account_id', accountId);
      formData.append('file', file);

      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json() as { error: string };
        throw new Error(data.error);
      }

      const data = await res.json() as { uploadId: string };
      setUploadId(data.uploadId);
      toast({
        variant: 'success',
        title: 'Statement uploaded',
        description: 'Preview generated. Review and confirm import.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      toast({
        variant: 'error',
        title: 'Parsing failed',
        description: message,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-white)]">Upload Statement</h1>

      {!uploadId ? (
        <div className="space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-[var(--color-cherry-pink)] bg-[var(--color-cherry-pink-muted)]'
                : file
                ? 'border-[#2DD4A0] bg-[#0B2420]'
                : 'border-[var(--color-border)] hover:border-[var(--color-indigo-dye)] bg-[var(--color-surface)]'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
              }}
            />
            <UploadIcon
              size={32}
              className="mx-auto mb-3"
              style={{ color: file ? '#2DD4A0' : 'var(--color-muted)' }}
            />
            {file ? (
              <div>
                <p className="text-sm font-medium text-[var(--color-white)]">{file.name}</p>
                <p className="text-xs text-[var(--color-muted)] mt-1">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-[var(--color-white)]">Drop PDF here or click to browse</p>
                <p className="text-xs text-[var(--color-muted)] mt-1">Max 20 MB · PDF only</p>
              </div>
            )}
          </div>

          {/* Account selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium tracking-wider uppercase text-[var(--color-muted)]">
              Account
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={accountsLoading}
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm text-[var(--color-white)] focus:outline-none focus:ring-2 focus:ring-[var(--color-cherry-pink)]"
            >
              <option value="">
                {accountsLoading ? 'Loading accounts...' : 'Select account'}
              </option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
            {accountsError && (
              <p className="text-xs text-[var(--color-coral)]">
                Could not load accounts. Re-login and retry. If this persists, check API logs.
              </p>
            )}
            {!accountsLoading && !accountsError && (accounts?.length ?? 0) === 0 && (
              <p className="text-xs text-[var(--color-muted)]">
                No accounts found. Run `pnpm db:seed` from repo root, then refresh.
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-[var(--color-coral)] bg-[#1F1508] border border-[#3D2A0A] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || !accountId || uploading}
            className="w-full bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)] font-semibold rounded-xl py-3 text-sm hover:opacity-90 disabled:opacity-40 transition"
          >
            {uploading ? 'Uploading...' : 'Upload & Parse'}
          </button>
        </div>
      ) : (
        /* Preview */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-muted)]">
              {preview?.length ?? 0} transactions parsed
            </p>
            <button
              onClick={() => setUploadId(null)}
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-white)] transition-colors"
            >
              ← Back
            </button>
          </div>

          {!preview ? (
            <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        {['Date', 'Description', 'Amount', 'Suggested Category', 'Dup?'].map((h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-3 text-[11px] font-medium tracking-wider uppercase text-[var(--color-muted)]"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((tx, i) => (
                        <tr
                          key={i}
                          className={`border-b border-[var(--color-border)] last:border-0 ${
                            tx.isDuplicate ? 'opacity-50' : ''
                          }`}
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)]">
                            {tx.date}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--color-white)] max-w-[200px] truncate">
                            {tx.description}
                          </td>
                          <td
                            className="px-4 py-2.5 font-mono font-semibold text-sm whitespace-nowrap"
                            style={{ color: tx.amount > 0 ? '#2DD4A0' : 'var(--color-white)' }}
                          >
                            {tx.amount > 0 ? '+' : ''}{formatCAD(tx.amount)}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--color-muted)] text-xs">
                            {tx.suggestedCategoryId ? '✓ matched' : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {tx.isDuplicate && (
                              <span className="text-[var(--color-coral)]">duplicate</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <button
                onClick={() => confirm.mutate({ uploadId: uploadId! })}
                disabled={confirm.isPending}
                className="w-full bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)] font-semibold rounded-xl py-3 text-sm hover:opacity-90 disabled:opacity-40 transition"
              >
                {confirm.isPending
                  ? 'Importing...'
                  : `Import ${preview.filter((t) => !t.isDuplicate).length} transactions`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
