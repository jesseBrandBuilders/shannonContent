import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, TrendingUp, Award } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Badge } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Textarea } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { usePosts } from '../hooks/usePosts';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

function StarRating({ value, onChange, label }) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-2">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="p-1 hover:scale-110 transition-transform"
          >
            <Star
              className={`w-6 h-6 ${
                n <= value ? 'fill-amber-400 text-amber-400' : 'text-stone-300'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Analytics() {
  const { data: posts = [] } = usePosts({ status: 'published' });
  const [ratingPost, setRatingPost] = useState(null);
  const [engagement, setEngagement] = useState(0);
  const [resonance, setResonance] = useState(0);
  const [notes, setNotes] = useState('');
  const toast = useToast();
  const qc = useQueryClient();

  const openRating = (post) => {
    const existing = post.ratings?.[0];
    setRatingPost(post);
    setEngagement(existing?.engagement_score || 0);
    setResonance(existing?.resonance_score || 0);
    setNotes(existing?.notes || '');
  };

  const saveRating = async () => {
    if (!ratingPost) return;
    try {
      const existing = ratingPost.ratings?.[0];
      const payload = {
        post_id: ratingPost.id,
        engagement_score: engagement,
        resonance_score: resonance,
        notes,
        rated_at: new Date().toISOString()
      };
      if (existing) {
        await supabase.from('ratings').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('ratings').insert(payload);
      }
      qc.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Rating saved');
      setRatingPost(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const ratedPosts = posts.filter((p) => p.ratings?.length);
  const avgEng = ratedPosts.length
    ? ratedPosts.reduce((sum, p) => sum + (p.ratings[0]?.engagement_score || 0), 0) / ratedPosts.length
    : 0;
  const avgRes = ratedPosts.length
    ? ratedPosts.reduce((sum, p) => sum + (p.ratings[0]?.resonance_score || 0), 0) / ratedPosts.length
    : 0;

  // Best performing by category
  const byCategory = {};
  ratedPosts.forEach((p) => {
    const cat = p.eos_category || 'general';
    const score = ((p.ratings[0]?.engagement_score || 0) + (p.ratings[0]?.resonance_score || 0)) / 2;
    if (!byCategory[cat] || byCategory[cat].avg < score) {
      byCategory[cat] = { post: p, avg: score };
    }
  });

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Rate your published posts to learn what resonates."
      />

      <div className="px-4 md:px-8 pb-8 space-y-6">
        {/* Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Star className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-stone-900">
                  {avgEng ? avgEng.toFixed(1) : '—'}
                </div>
                <div className="text-xs text-stone-500">Avg Engagement</div>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <Award className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-stone-900">
                  {avgRes ? avgRes.toFixed(1) : '—'}
                </div>
                <div className="text-xs text-stone-500">Avg Resonance</div>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-stone-900">
                  {ratedPosts.length}
                </div>
                <div className="text-xs text-stone-500">Rated Posts</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Top by category */}
        {Object.keys(byCategory).length > 0 && (
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100">
              <h2 className="text-base font-semibold text-stone-900 tracking-tight">
                Top performer by category
              </h2>
            </div>
            <ul className="divide-y divide-stone-100">
              {Object.entries(byCategory).map(([cat, { post, avg }]) => (
                <li key={cat}>
                  <Link to={`/composer?id=${post.id}`} className="block px-5 py-4 hover:bg-stone-50">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant="indigo">{cat}</Badge>
                      <span className="text-xs text-stone-500">avg {avg.toFixed(1)}/5</span>
                    </div>
                    <p className="text-sm text-stone-700 line-clamp-2">{post.content}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* All published */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100">
            <h2 className="text-base font-semibold text-stone-900 tracking-tight">
              All published posts
            </h2>
          </div>
          {posts.length === 0 ? (
            <div className="p-12 text-center text-sm text-stone-500">
              Publish some posts to start rating them.
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {posts.map((post) => {
                const rating = post.ratings?.[0];
                return (
                  <li key={post.id} className="px-5 py-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-stone-700 line-clamp-2">{post.content}</p>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {post.eos_category && <Badge variant="indigo">{post.eos_category}</Badge>}
                          {post.published_at && (
                            <span className="text-xs text-stone-500">
                              {format(new Date(post.published_at), 'MMM d, yyyy')}
                            </span>
                          )}
                          {rating && (
                            <div className="flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              <span className="text-xs text-stone-600">
                                {((rating.engagement_score + rating.resonance_score) / 2).toFixed(1)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => openRating(post)}>
                        {rating ? 'Edit rating' : 'Rate'}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={!!ratingPost}
        onClose={() => setRatingPost(null)}
        title="Rate this post"
        size="md"
      >
        <div className="space-y-5">
          <div className="bg-stone-50 rounded-xl p-3 text-sm text-stone-700 line-clamp-3">
            {ratingPost?.content}
          </div>
          <StarRating
            label="Engagement (likes, comments, shares)"
            value={engagement}
            onChange={setEngagement}
          />
          <StarRating
            label="Resonance (did it land with the right audience?)"
            value={resonance}
            onChange={setResonance}
          />
          <Textarea
            label="Notes"
            placeholder="What worked? What would you change next time?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRatingPost(null)}>Cancel</Button>
            <Button onClick={saveRating}>Save rating</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
