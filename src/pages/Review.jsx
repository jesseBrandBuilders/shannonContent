import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Check, CheckCircle2, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Badge } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { useWorkspace } from '../hooks/useLeads';
import { generateBatch, useContentSettings, useReviewDecision, useReviewQueue } from '../hooks/useAutopilot';
import { generateDraft } from '../lib/claude';
import { useQueryClient } from '@tanstack/react-query';

const CATEGORY_LABEL = {
  level10: 'Level 10',
  rocks: 'Rocks',
  vto: 'V/TO',
  people: 'People',
  process: 'Process',
  traction: 'Traction',
  general: 'General EOS'
};

const PLACEHOLDER = /\[\[[^\]]+\]\]/g;

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm"
const toLocalInput = (iso) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '');
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

function ReviewCard({ post }) {
  const toast = useToast();
  const decide = useReviewDecision();
  const [content, setContent] = useState(post.content);
  const [when, setWhen] = useState(toLocalInput(post.scheduled_at));
  const [mode, setMode] = useState(null); // null | 'redo' | 'reject'
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => setContent(post.content), [post.content]);

  const placeholders = content.match(PLACEHOLDER) ?? [];

  const approve = async () => {
    try {
      await decide.mutateAsync({ id: post.id, decision: 'approve', content, scheduledAt: fromLocalInput(when) });
      toast.success(`Scheduled for ${when ? format(new Date(when), 'EEE MMM d, h:mm a') : 'later'}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const reject = async () => {
    try {
      await decide.mutateAsync({ id: post.id, decision: 'reject', note });
      toast.info(note.trim() ? 'Rejected — future drafts will take that into account' : 'Rejected');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const redo = async () => {
    if (!note.trim()) return;
    setWorking(true);
    try {
      const result = await generateDraft({
        mode: 'refine',
        prompt: note,
        existingContent: content,
        eosCategory: post.eos_category,
        tone: 'conversational'
      });
      setContent(result.content || content);
      setMode(null);
      setNote('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="indigo">{CATEGORY_LABEL[post.eos_category] ?? 'Post'}</Badge>
        {placeholders.length > 0 && (
          <Badge variant="amber">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {placeholders.length} to fill in
          </Badge>
        )}
        <div className="ml-auto">
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="px-2.5 py-1.5 text-sm bg-white border border-stone-200 rounded-lg text-stone-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Posting time"
          />
        </div>
      </div>

      <Textarea rows={Math.min(18, Math.max(8, content.split('\n').length + 2))} value={content} onChange={(e) => setContent(e.target.value)} />

      {placeholders.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Replace the <span className="font-mono">[[…]]</span> spots with a real example or number before approving. The
          draft never makes those up for you.
        </p>
      )}

      {mode && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            autoFocus
            placeholder={mode === 'redo' ? 'What should change? e.g. “shorter, punchier hook”' : 'Why not? (optional — teaches future drafts)'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (mode === 'redo' ? redo() : reject())}
          />
          <div className="flex gap-2 shrink-0">
            {mode === 'redo' ? (
              <Button onClick={redo} disabled={!note.trim() || working}>
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Rewrite
              </Button>
            ) : (
              <Button variant="danger" onClick={reject} disabled={decide.isPending}>
                Reject
              </Button>
            )}
            <Button variant="ghost" onClick={() => { setMode(null); setNote(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!mode && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={approve} disabled={decide.isPending || !content.trim()}>
            <Check className="w-4 h-4" />
            Approve
          </Button>
          <Button variant="secondary" onClick={() => setMode('redo')}>
            <RefreshCw className="w-4 h-4" />
            Redo with a note
          </Button>
          <Button variant="ghost" onClick={() => setMode('reject')}>
            <X className="w-4 h-4" />
            Reject
          </Button>
          <span className="ml-auto text-xs text-stone-400 tabular-nums">{content.length} chars</span>
        </div>
      )}
    </Card>
  );
}

export default function Review() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: workspace } = useWorkspace();
  const { data: settings } = useContentSettings(workspace?.workspace_id);
  const { data: queue = [], isLoading } = useReviewQueue();
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await generateBatch();
      toast.success(`${res.created} new drafts ready`);
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['content_settings'] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const noVoice = settings && !settings.voice_profile;

  return (
    <div>
      <PageHeader
        title="Review"
        subtitle={
          queue.length
            ? `${queue.length} ${queue.length === 1 ? 'draft' : 'drafts'} waiting — approve, tweak or toss.`
            : 'Drafts written for you land here.'
        }
        action={
          <Button variant="secondary" onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Writing…' : 'Write more'}
          </Button>
        }
      />

      <div className="px-4 md:px-8 pb-8 space-y-4 max-w-3xl">
        {noVoice && (
          <Card className="p-4 flex items-start gap-3 bg-indigo-50/50 border-indigo-100">
            <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <p className="text-sm text-stone-700">
              Drafts will sound generic until the app has learned Shannon’s voice.{' '}
              <Link to="/autopilot" className="font-medium text-indigo-700 hover:underline">
                Add her LinkedIn posts in Autopilot →
              </Link>
            </p>
          </Card>
        )}

        {isLoading ? (
          <div className="p-8 text-center text-sm text-stone-500">Loading…</div>
        ) : queue.length === 0 ? (
          <Card className="p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-stone-900">All caught up</h3>
            <p className="mt-1 text-sm text-stone-500">
              {settings?.autopilot_enabled
                ? 'Next week’s drafts will show up here automatically.'
                : 'Turn on Autopilot to get a fresh batch every week, or write some now.'}
              {settings?.last_batch_at && ` Last batch ${formatDistanceToNow(new Date(settings.last_batch_at))} ago.`}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button onClick={generate} disabled={generating}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? 'Writing…' : 'Write this week’s posts'}
              </Button>
              {!settings?.autopilot_enabled && (
                <Link to="/autopilot">
                  <Button variant="secondary">Set up Autopilot</Button>
                </Link>
              )}
            </div>
          </Card>
        ) : (
          queue.map((post) => (
            <div key={post.id} className="space-y-2">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                {post.scheduled_at ? format(new Date(post.scheduled_at), 'EEEE, MMM d') : 'Unscheduled'}
              </p>
              <ReviewCard post={post} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
