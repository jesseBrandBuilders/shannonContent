import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp, Loader2, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { useWorkspace } from '../hooks/useLeads';
import {
  buildVoiceProfile,
  generateBatch,
  useAddVoiceSamples,
  useContentSettings,
  useDeleteVoiceSample,
  useSaveContentSettings,
  useVoiceSamples
} from '../hooks/useAutopilot';
import { parseLinkedInExport, parsePastedSamples } from '../lib/linkedinExport';

const TOPICS = [
  { value: 'level10', label: 'Level 10 Meetings' },
  { value: 'rocks', label: 'Rocks' },
  { value: 'vto', label: 'V/TO' },
  { value: 'people', label: 'People (GWC)' },
  { value: 'process', label: 'Process' },
  { value: 'traction', label: 'Traction' },
  { value: 'general', label: 'General EOS' }
];

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' }
];

const MIN_SAMPLES = 3;

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
        active ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
      }`}
    >
      {children}
    </button>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-stone-900 tracking-tight">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
    </div>
  );
}

function VoiceSection({ workspaceId, settings }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: voice } = useVoiceSamples();
  const addSamples = useAddVoiceSamples();
  const deleteSample = useDeleteVoiceSample();
  const saveSettings = useSaveContentSettings();

  const [profile, setProfile] = useState(settings.voice_profile || '');
  const [building, setBuilding] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [pasted, setPasted] = useState('');

  useEffect(() => setProfile(settings.voice_profile || ''), [settings.voice_profile]);

  const count = voice?.count ?? 0;

  const add = async (samples, label) => {
    if (!samples.length) {
      toast.error(`No posts long enough to learn from in that ${label}.`);
      return;
    }
    const added = await addSamples.mutateAsync({ workspaceId, samples });
    const dupes = samples.length - added;
    toast.success(`Added ${added} ${added === 1 ? 'post' : 'posts'}${dupes ? ` (${dupes} already saved)` : ''}`);
  };

  const onExport = async (file) => {
    if (!file) return;
    try {
      await add(await parseLinkedInExport(file), 'export');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const onPaste = async () => {
    try {
      await add(parsePastedSamples(pasted), 'text');
      setPasted('');
      setShowPaste(false);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const build = async () => {
    setBuilding(true);
    try {
      const res = await buildVoiceProfile();
      setProfile(res.profile);
      qc.invalidateQueries({ queryKey: ['content_settings'] });
      toast.success(`Voice learned from ${res.used} posts`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBuilding(false);
    }
  };

  const saveProfile = async () => {
    try {
      await saveSettings.mutateAsync({ workspaceId, updates: { voice_profile: profile } });
      toast.success('Voice profile saved');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card className="p-5 md:p-6 space-y-5">
      <SectionTitle
        title="Shannon’s voice"
        subtitle="Every draft — weekly posts, Composer, outreach — is written from this."
      />

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 p-4 border border-stone-200 rounded-2xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-stone-900">
            <FileUp className="w-4 h-4 text-indigo-600" />
            Upload LinkedIn export
          </span>
          <span className="text-xs text-stone-500">
            The .zip from LinkedIn → Settings → Data privacy → Get a copy of your data. Or just Shares.csv.
          </span>
          <input
            type="file"
            accept=".zip,.csv,application/zip,text/csv"
            className="sr-only"
            onChange={(e) => {
              onExport(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => setShowPaste(true)}
          className="flex flex-col gap-1 p-4 text-left border border-stone-200 rounded-2xl hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-stone-900">
            <Wand2 className="w-4 h-4 text-indigo-600" />
            Paste writing samples
          </span>
          <span className="text-xs text-stone-500">Posts, newsletters, talk notes — anything that sounds like her.</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-stone-700">
          <span className="font-semibold tabular-nums">{count}</span> {count === 1 ? 'post' : 'posts'} saved
          {count > 0 && (
            <button onClick={() => setShowSamples(true)} className="ml-2 text-indigo-600 hover:underline">
              view
            </button>
          )}
        </p>
        <Button className="ml-auto" onClick={build} disabled={building || count < MIN_SAMPLES}>
          {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {building ? 'Learning…' : settings.voice_profile ? 'Re-learn voice' : 'Learn her voice'}
        </Button>
      </div>
      {count < MIN_SAMPLES && (
        <p className="text-xs text-stone-500">Add at least {MIN_SAMPLES} posts to learn from — 20+ is better.</p>
      )}

      {(profile || settings.voice_profile) && (
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <label className="text-sm font-medium text-stone-700">Voice profile</label>
            {settings.voice_profile_updated_at && (
              <span className="text-xs text-stone-400">
                learned {formatDistanceToNow(new Date(settings.voice_profile_updated_at))} ago
              </span>
            )}
          </div>
          <Textarea rows={14} value={profile} onChange={(e) => setProfile(e.target.value)} className="text-sm" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-stone-500">Edit freely — fix anything that isn’t her.</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={saveProfile}
              disabled={profile === (settings.voice_profile || '') || saveSettings.isPending}
            >
              Save edits
            </Button>
          </div>
        </div>
      )}

      <Modal open={showPaste} onClose={() => setShowPaste(false)} title="Paste writing samples" size="lg">
        <div className="space-y-3">
          <p className="text-sm text-stone-600">
            Paste one or more pieces. Put a line with just <span className="font-mono">---</span> between them.
          </p>
          <Textarea rows={14} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'First post…\n---\nSecond post…'} />
          <div className="flex justify-end">
            <Button onClick={onPaste} disabled={!pasted.trim() || addSamples.isPending}>
              Add samples
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showSamples} onClose={() => setShowSamples(false)} title={`Saved posts (${count})`} size="lg">
        <ul className="divide-y divide-stone-100 -my-2">
          {(voice?.samples ?? []).map((s) => (
            <li key={s.id} className="py-3 flex gap-3">
              <p className="flex-1 text-sm text-stone-700 whitespace-pre-line line-clamp-4">{s.content}</p>
              <button
                onClick={() => deleteSample.mutate(s.id)}
                className="self-start p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50"
                title="Remove — it won't be used to learn her voice"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
        {count > 50 && <p className="mt-3 text-xs text-stone-500">Showing the 50 most recent.</p>}
      </Modal>
    </Card>
  );
}

function ScheduleSection({ workspaceId, settings }) {
  const toast = useToast();
  const qc = useQueryClient();
  const save = useSaveContentSettings();
  const [form, setForm] = useState(settings);
  const [generating, setGenerating] = useState(false);
  const synced = useRef(settings);

  // Settings reload after any write to the row (including voice learning).
  // Take fresh server values only for fields she hasn't changed here, so
  // unsaved edits survive.
  useEffect(() => {
    const prev = synced.current;
    setForm((f) => {
      const next = { ...settings };
      for (const k of Object.keys(f)) {
        if (JSON.stringify(f[k]) !== JSON.stringify(prev[k])) next[k] = f[k];
      }
      return next;
    });
    synced.current = settings;
  }, [settings]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleIn = (key, value) =>
    set({ [key]: form[key].includes(value) ? form[key].filter((v) => v !== value) : [...form[key], value].sort() });

  const dirty =
    ['autopilot_enabled', 'posts_per_week', 'posting_time', 'guidance'].some((k) => (form[k] ?? '') !== (settings[k] ?? '')) ||
    JSON.stringify(form.topics) !== JSON.stringify(settings.topics) ||
    JSON.stringify(form.posting_days) !== JSON.stringify(settings.posting_days);

  const persist = async (updates) => {
    try {
      await save.mutateAsync({ workspaceId, updates });
      toast.success('Autopilot settings saved');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const onSave = () =>
    persist({
      autopilot_enabled: form.autopilot_enabled,
      posts_per_week: Number(form.posts_per_week),
      topics: form.topics,
      posting_days: form.posting_days,
      posting_time: String(form.posting_time).slice(0, 5),
      guidance: form.guidance || null
    });

  const generateNow = async () => {
    setGenerating(true);
    try {
      const res = await generateBatch(Number(form.posts_per_week));
      toast.success(`${res.created} drafts are in Review`);
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['content_settings'] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="p-5 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <SectionTitle
          title="Weekly drafts"
          subtitle="Every Friday morning the app writes next week’s posts and puts them in Review. Nothing posts without Shannon’s approval."
        />
        <button
          type="button"
          role="switch"
          aria-checked={form.autopilot_enabled}
          onClick={() => set({ autopilot_enabled: !form.autopilot_enabled })}
          className={`shrink-0 relative w-11 h-6 rounded-full transition-colors ${form.autopilot_enabled ? 'bg-indigo-600' : 'bg-stone-300'}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              form.autopilot_enabled ? 'translate-x-5' : ''
            }`}
          />
          <span className="sr-only">Autopilot</span>
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Posts per week</label>
          <select
            value={form.posts_per_week}
            onChange={(e) => set({ posts_per_week: Number(e.target.value) })}
            className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Posting time ({form.timezone.replace('_', ' ')})</label>
          <input
            type="time"
            value={String(form.posting_time).slice(0, 5)}
            onChange={(e) => set({ posting_time: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-stone-700">Posting days</label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <Chip key={d.value} active={form.posting_days.includes(d.value)} onClick={() => toggleIn('posting_days', d.value)}>
              {d.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-stone-700">Topics to rotate through</label>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <Chip key={t.value} active={form.topics.includes(t.value)} onClick={() => toggleIn('topics', t.value)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      <Textarea
        label="Focus for upcoming posts (optional)"
        rows={3}
        value={form.guidance || ''}
        onChange={(e) => set({ guidance: e.target.value })}
        placeholder="e.g. Q4 planning season — lean into annual planning and Rocks. Mention the Tampa workshop on Nov 12."
      />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button onClick={onSave} disabled={!dirty || save.isPending || !form.topics.length || !form.posting_days.length}>
          Save settings
        </Button>
        <Button variant="secondary" onClick={generateNow} disabled={generating}>
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Writing…' : `Write ${form.posts_per_week} now`}
        </Button>
        {settings.last_batch_at && (
          <span className="ml-auto text-xs text-stone-400">
            Last batch {formatDistanceToNow(new Date(settings.last_batch_at))} ago
          </span>
        )}
      </div>
    </Card>
  );
}

export default function Autopilot() {
  const { data: workspace } = useWorkspace();
  const { data: settings, isLoading } = useContentSettings(workspace?.workspace_id);

  return (
    <div>
      <PageHeader title="Autopilot" subtitle="Teach the app Shannon’s voice, then let it write her week." />
      <div className="px-4 md:px-8 pb-8 space-y-4 max-w-3xl">
        {isLoading || !settings ? (
          <div className="p-8 text-center text-sm text-stone-500">Loading…</div>
        ) : (
          <>
            <VoiceSection workspaceId={workspace.workspace_id} settings={settings} />
            <ScheduleSection workspaceId={workspace.workspace_id} settings={settings} />
          </>
        )}
      </div>
    </div>
  );
}
