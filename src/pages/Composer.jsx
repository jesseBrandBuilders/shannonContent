import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Save,
  Send,
  Sparkles,
  Hash,
  Calendar as CalendarIcon,
  Trash2,
  Loader2,
  Wand2
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Badge } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { usePost, useCreatePost, useUpdatePost, useDeletePost } from '../hooks/usePosts';
import { generateDraft } from '../lib/claude';
import { copyAndOpenLinkedIn } from '../lib/linkedin';

const EOS_CATEGORIES = [
  { value: 'level10', label: 'Level 10 Meetings' },
  { value: 'rocks', label: 'Rocks' },
  { value: 'vto', label: 'V/TO™' },
  { value: 'people', label: 'People (GWC)' },
  { value: 'process', label: 'Process' },
  { value: 'traction', label: 'Traction' },
  { value: 'general', label: 'General EOS' }
];

const TONES = [
  { value: 'authoritative', label: 'Authoritative' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'storytelling', label: 'Storytelling' }
];

export default function Composer() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editId = params.get('id');

  const { data: existing } = usePost(editId);
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();

  const [content, setContent] = useState('');
  const [eosCategory, setEosCategory] = useState('general');
  const [showAI, setShowAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState('conversational');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (existing) {
      setContent(existing.content || '');
      setEosCategory(existing.eos_category || 'general');
    }
  }, [existing]);

  const charCount = content.length;
  const charLimit = 3000; // LinkedIn limit
  const charPercent = (charCount / charLimit) * 100;

  const handleSave = async (status = 'draft') => {
    try {
      const payload = { content, eos_category: eosCategory, status };
      if (editId) {
        await updatePost.mutateAsync({ id: editId, updates: payload });
        toast.success('Post saved');
      } else {
        const created = await createPost.mutateAsync(payload);
        toast.success('Post created');
        navigate(`/composer?id=${created.id}`, { replace: true });
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handlePublish = async () => {
    if (!content.trim()) {
      toast.error('Add some content first');
      return;
    }
    await handleSave('published');
    await copyAndOpenLinkedIn(content);
    toast.success('Copied to clipboard. LinkedIn opening…');
  };

  const handleDelete = async () => {
    if (!editId) return;
    if (!confirm('Delete this post permanently?')) return;
    try {
      await deletePost.mutateAsync(editId);
      toast.success('Post deleted');
      navigate('/library');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAIGenerate = async () => {
    setAiLoading(true);
    try {
      const result = await generateDraft({
        mode: content ? 'refine' : 'draft',
        prompt: aiPrompt,
        existingContent: content || undefined,
        eosCategory,
        tone: aiTone
      });
      setContent(result.content || result);
      setShowAI(false);
      setAiPrompt('');
      toast.success('Draft generated');
    } catch (err) {
      toast.error(err.message || 'AI generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={editId ? 'Edit Post' : 'New Post'}
        subtitle="Compose, refine, and publish to LinkedIn."
        action={
          <div className="flex items-center gap-2">
            {editId && (
              <Button variant="ghost" size="sm" onClick={handleDelete}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button variant="secondary" onClick={() => handleSave('draft')}>
              <Save className="w-4 h-4" />
              Save
            </Button>
            <Button onClick={handlePublish}>
              <Send className="w-4 h-4" />
              Publish
            </Button>
          </div>
        }
      />

      <div className="px-4 md:px-8 pb-8 grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <select
                  value={eosCategory}
                  onChange={(e) => setEosCategory(e.target.value)}
                  className="text-xs font-medium bg-indigo-50 text-indigo-700 border-0 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {EOS_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setShowAI(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 rounded-lg hover:from-indigo-100 hover:to-purple-100 transition-all"
              >
                <Wand2 className="w-3.5 h-3.5" />
                AI Assist
              </button>
            </div>

            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start writing, or use AI Assist to generate a draft based on an EOS topic…"
              rows={18}
              className="text-base leading-relaxed border-0 focus:ring-0 p-0"
            />

            <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-stone-500">
                <span>{charCount} / {charLimit}</span>
                <div className="w-24 h-1 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      charPercent > 95 ? 'bg-red-500' : charPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(charPercent, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Tips
            </h3>
            <ul className="space-y-2 text-sm text-stone-600">
              <li className="flex gap-2"><span className="text-indigo-600">•</span> Open with a hook in the first 2 lines (the "see more" cutoff).</li>
              <li className="flex gap-2"><span className="text-indigo-600">•</span> Use whitespace generously — short lines read better on mobile.</li>
              <li className="flex gap-2"><span className="text-indigo-600">•</span> End with a question to drive comments.</li>
              <li className="flex gap-2"><span className="text-indigo-600">•</span> 3-5 hashtags is the sweet spot.</li>
            </ul>
          </Card>

          {existing?.status === 'published' && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-stone-900 mb-3">Status</h3>
              <Badge variant="green">Published</Badge>
              <p className="mt-2 text-xs text-stone-500">
                Rate this post in Analytics to track what's resonating.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* AI Assistant Modal */}
      <Modal open={showAI} onClose={() => setShowAI(false)} title="AI Drafting Assistant" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              What's the post about?
            </label>
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g., How a quarterly Rocks review surfaced a hidden bottleneck in operations…"
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Category</label>
              <select
                value={eosCategory}
                onChange={(e) => setEosCategory(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {EOS_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Tone</label>
              <select
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {content && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              You have existing content. The AI will refine it based on your prompt.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAI(false)}>Cancel</Button>
            <Button onClick={handleAIGenerate} disabled={!aiPrompt.trim() || aiLoading}>
              {aiLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              ) : (
                <><Wand2 className="w-4 h-4" /> Generate</>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
