import { useState } from 'react';
import Papa from 'papaparse';
import { FileUp } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { useImportLeads } from '../../hooks/useLeads';
import { mapLeadRecord, dedupeByLinkedIn } from '../../../supabase/functions/_shared/leadFields.js';

export function ImportLeadsModal({ open, onClose, workspaceId }) {
  const toast = useToast();
  const importLeads = useImportLeads();
  const [parsed, setParsed] = useState(null); // { fileName, total, rows }
  const [progress, setProgress] = useState(0);

  const reset = () => {
    setParsed(null);
    setProgress(0);
  };

  const handleFile = (file) => {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const rows = dedupeByLinkedIn(data.map(mapLeadRecord).filter(Boolean));
        setParsed({ fileName: file.name, total: data.length, rows });
      },
      error: (err) => toast.error(`Couldn’t read that file: ${err.message}`)
    });
  };

  const runImport = async () => {
    try {
      const n = await importLeads.mutateAsync({ rows: parsed.rows, workspaceId, onProgress: setProgress });
      toast.success(`Imported ${n} leads`);
      reset();
      onClose();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import leads from CSV"
    >
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          In AudienceLab, open the audience and download its CSV, then drop it here. Any row with a
          LinkedIn profile URL is imported; people already in your list are updated, not duplicated.
        </p>

        {!parsed ? (
          <label className="flex flex-col items-center justify-center gap-2 px-6 py-10 border-2 border-dashed border-stone-200 rounded-2xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors">
            <FileUp className="w-6 h-6 text-stone-400" />
            <span className="text-sm font-medium text-stone-700">Choose a CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
        ) : (
          <div className="rounded-2xl bg-stone-50 border border-stone-200 p-4 space-y-1">
            <p className="text-sm font-medium text-stone-900 truncate">{parsed.fileName}</p>
            <p className="text-sm text-stone-600">
              {parsed.rows.length} leads with a LinkedIn URL
              {parsed.total - parsed.rows.length > 0 && (
                <span className="text-stone-400">
                  {' '}
                  · {parsed.total - parsed.rows.length} rows skipped (no LinkedIn URL or duplicate)
                </span>
              )}
            </p>
            {parsed.rows.length === 0 && (
              <p className="text-sm text-red-600">
                No LinkedIn URL column found. The file needs a column like “LINKEDIN_URL” or “LinkedIn”.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {parsed && (
            <Button variant="ghost" onClick={reset} disabled={importLeads.isPending}>
              Choose another
            </Button>
          )}
          <Button onClick={runImport} disabled={!parsed?.rows.length || importLeads.isPending}>
            {importLeads.isPending ? `Importing… ${progress}/${parsed.rows.length}` : 'Import'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
