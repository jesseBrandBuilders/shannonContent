import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Copy, Plus, Radio } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { useCreateLeadSource, useLeadSources, webhookUrlFor } from '../../hooks/useLeads';
import { copyToClipboard } from '../../lib/linkedin';

export function SourcesModal({ open, onClose, workspaceId }) {
  const toast = useToast();
  const { data: sources = [] } = useLeadSources();
  const createSource = useCreateLeadSource();
  const [name, setName] = useState('');

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createSource.mutateAsync({ name: name.trim(), workspaceId });
      setName('');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="AudienceLab sources" size="lg">
      <div className="space-y-5">
        <div className="text-sm text-stone-600 space-y-2">
          <p>
            Each source gives you a private webhook URL. Point an AudienceLab audience at it and new
            matches flow into your Leads queue automatically.
          </p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Create a source below (one per audience keeps reporting tidy).</li>
            <li>In AudienceLab, open the audience → Sync / AudienceSync → add an HTTP endpoint destination.</li>
            <li>Paste the URL, method POST, format JSON, and save.</li>
          </ol>
          <p className="text-xs text-stone-500">
            Treat the URL like a password — anyone with it can add leads.
          </p>
        </div>

        <form onSubmit={add} className="flex gap-2">
          <Input
            placeholder="Source name, e.g. Tampa Bay founders 10–250"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={!name.trim() || createSource.isPending} className="shrink-0">
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </form>

        {sources.length > 0 && (
          <ul className="space-y-3">
            {sources.map((s) => {
              const url = webhookUrlFor(s);
              return (
                <li key={s.id} className="rounded-2xl border border-stone-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Radio className={`w-4 h-4 shrink-0 ${s.last_received_at ? 'text-emerald-600' : 'text-stone-300'}`} />
                      <p className="text-sm font-medium text-stone-900 truncate">{s.name}</p>
                    </div>
                    <p className="text-xs text-stone-500 shrink-0">
                      {s.last_received_at
                        ? `${s.records_received} received · last ${formatDistanceToNow(new Date(s.last_received_at))} ago`
                        : 'Waiting for first push'}
                    </p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <code className="flex-1 min-w-0 truncate px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700">
                      {url}
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(url).then(() => toast.success('Webhook URL copied'))}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
