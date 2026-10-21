import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  ExternalLink,
  MapPin,
  MessageSquareText,
  SkipForward,
  Sparkles,
  UserPlus,
  Users
} from 'lucide-react';
import { Card, Badge } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { usePosts } from '../../hooks/usePosts';
import { useLeadOutreach, useLogOutreach, useUpdateLead } from '../../hooks/useLeads';
import { generateOutreach } from '../../lib/claude';
import { copyAndOpenProfile, copyToClipboard } from '../../lib/linkedin';
import { FitBadge, LEAD_STATUS } from './leadUi';

const NOTE_MAX = 300;
const SUBJECT_MAX = 200;
const INMAIL_MAX = 1900;

const KINDS = [
  { value: 'connection', label: 'Connection note', icon: UserPlus },
  { value: 'inmail', label: 'InMail', icon: MessageSquareText }
];

export function LeadDetail({ lead, workspaceId, onBack, onNext }) {
  const toast = useToast();
  const [kind, setKind] = useState('connection');
  const [postId, setPostId] = useState('');
  const [angle, setAngle] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [opened, setOpened] = useState(false);

  const { data: posts = [] } = usePosts();
  const { data: history = [] } = useLeadOutreach(lead.id);
  const logOutreach = useLogOutreach();
  const updateLead = useUpdateLead();

  // Fresh slate whenever Shannon moves to another lead
  useEffect(() => {
    setSubject('');
    setBody('');
    setAngle('');
    setOpened(false);
    setKind(lead.status === 'connected' ? 'inmail' : 'connection');
  }, [lead.id, lead.status]);

  const shareable = useMemo(
    // Published posts first — those have a live link worth sharing
    () =>
      posts
        .filter((p) => p.content?.trim())
        .sort((a, b) => (b.status === 'published') - (a.status === 'published')),
    [posts]
  );
  const post = shareable.find((p) => p.id === postId);

  const limit = kind === 'connection' ? NOTE_MAX : INMAIL_MAX;
  const over = body.length > limit || subject.length > SUBJECT_MAX;

  const draft = async () => {
    setDrafting(true);
    try {
      const out = await generateOutreach({ kind, lead, post, angle, existing: body || undefined });
      setBody(out.body || '');
      if (kind === 'inmail') setSubject(out.subject || '');
      setOpened(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDrafting(false);
    }
  };

  const copyAndOpen = async () => {
    const ok = await copyAndOpenProfile(body, lead.linkedin_url);
    setOpened(true);
    if (ok) {
      toast.info(
        kind === 'connection'
          ? 'Note copied — on LinkedIn: Connect → Add a note → paste'
          : 'Message copied — on LinkedIn: Message → paste (copy the subject separately)'
      );
    } else {
      toast.error('Couldn’t copy automatically — select the text and copy it');
    }
  };

  const markSent = async () => {
    try {
      await logOutreach.mutateAsync({
        lead_id: lead.id,
        workspace_id: workspaceId,
        kind,
        subject: kind === 'inmail' ? subject : null,
        body,
        post_id: post?.id ?? null,
        status: 'sent'
      });
      toast.success('Logged as sent');
      onNext?.();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const setStatus = async (status) => {
    try {
      await updateLead.mutateAsync({ id: lead.id, updates: { status } });
      if (status === 'not_a_fit' || status === 'archived') onNext?.();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const name = lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unnamed lead';

  return (
    <div className="space-y-4">
      {onBack && (
        <button
          onClick={onBack}
          className="md:hidden flex items-center gap-1.5 text-sm font-medium text-stone-600"
        >
          <ArrowLeft className="w-4 h-4" />
          All leads
        </button>
      )}

      {/* Profile */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-stone-900 tracking-tight truncate">{name}</h2>
            {lead.title && <p className="mt-0.5 text-sm text-stone-700">{lead.title}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
              {lead.company && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {lead.company}
                </span>
              )}
              {lead.company_size && (
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {lead.company_size} employees
                </span>
              )}
              {lead.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {lead.location}
                </span>
              )}
            </div>
          </div>
          <FitBadge score={lead.fit_score} />
        </div>

        {lead.fit_reasons?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {lead.fit_reasons.map((r) => (
              <Badge key={r} variant="default">{r}</Badge>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">
              <ExternalLink className="w-3.5 h-3.5" />
              View profile
            </Button>
          </a>
          <select
            value={lead.status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white border border-stone-200 rounded-xl text-stone-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Lead status"
          >
            {Object.entries(LEAD_STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {onNext && (
            <Button variant="ghost" size="sm" onClick={onNext}>
              <SkipForward className="w-3.5 h-3.5" />
              Skip
            </Button>
          )}
        </div>
      </Card>

      {/* Composer */}
      <Card className="p-5 space-y-4">
        <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
          {KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => {
                setKind(k.value);
                setBody('');
                setSubject('');
                setOpened(false);
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                kind === k.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <k.icon className="w-4 h-4" />
              {k.label}
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Share a post (optional)</label>
            <select
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">No post</option>
              {shareable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.status === 'published' ? '● ' : ''}
                  {p.content.split('\n')[0].slice(0, 70)}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Angle (optional)"
            placeholder="e.g. they just hired a COO"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
          />
        </div>

        {kind === 'inmail' && (
          <div>
            <div className="flex items-end justify-between mb-1.5">
              <label className="text-sm font-medium text-stone-700">Subject</label>
              <button
                onClick={() => copyToClipboard(subject).then(() => toast.success('Subject copied'))}
                disabled={!subject}
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 disabled:text-stone-300"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
            </div>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
          </div>
        )}

        <div>
          <Textarea
            label={kind === 'connection' ? 'Note' : 'Message'}
            rows={kind === 'connection' ? 5 : 10}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setOpened(false);
            }}
            placeholder={drafting ? 'Drafting…' : 'Hit Draft, or write your own'}
          />
          <p className={`mt-1 text-xs text-right ${body.length > limit ? 'text-red-600 font-medium' : 'text-stone-400'}`}>
            {body.length} / {limit}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={draft} disabled={drafting}>
            <Sparkles className="w-4 h-4" />
            {drafting ? 'Drafting…' : body ? 'Redraft' : 'Draft'}
          </Button>
          <Button onClick={copyAndOpen} disabled={!body.trim() || over}>
            <Copy className="w-4 h-4" />
            Copy &amp; open LinkedIn
          </Button>
          {opened && (
            <Button variant="secondary" onClick={markSent} disabled={logOutreach.isPending}>
              <Check className="w-4 h-4 text-emerald-600" />
              Sent — next lead
            </Button>
          )}
        </div>
        {kind === 'inmail' && (
          <p className="text-xs text-stone-500">
            InMail uses a credit unless they’re already a connection — then it’s a free message.
          </p>
        )}
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-stone-100">
            <h3 className="text-sm font-semibold text-stone-900">History</h3>
          </div>
          <ul className="divide-y divide-stone-100">
            {history.map((h) => (
              <li key={h.id} className="px-5 py-3">
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <Badge variant={h.kind === 'connection' ? 'blue' : 'indigo'}>
                    {h.kind === 'connection' ? 'Connection' : h.kind === 'inmail' ? 'InMail' : 'Message'}
                  </Badge>
                  {h.sent_at && <span>{format(new Date(h.sent_at), 'MMM d, h:mm a')}</span>}
                </div>
                {h.subject && <p className="mt-1.5 text-sm font-medium text-stone-900">{h.subject}</p>}
                <p className="mt-1 text-sm text-stone-700 whitespace-pre-line line-clamp-4">{h.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
