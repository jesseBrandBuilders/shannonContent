import { Link } from 'react-router-dom';
import { PenLine, FileText, Calendar, TrendingUp, ArrowUpRight, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Badge } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { usePosts } from '../hooks/usePosts';
import { format } from 'date-fns';

const STATUS_VARIANT = {
  draft: 'default',
  scheduled: 'amber',
  published: 'green'
};

export default function Dashboard() {
  const { data: posts = [], isLoading } = usePosts();

  const drafts = posts.filter((p) => p.status === 'draft').length;
  const scheduled = posts.filter((p) => p.status === 'scheduled').length;
  const published = posts.filter((p) => p.status === 'published').length;
  const recent = posts.slice(0, 5);

  const avgRating =
    posts
      .filter((p) => p.ratings?.length)
      .map((p) => p.ratings[0]?.engagement_score || 0)
      .reduce((a, b, _, arr) => a + b / arr.length, 0) || 0;

  const stats = [
    { label: 'Drafts', value: drafts, icon: FileText, color: 'text-stone-600 bg-stone-50' },
    { label: 'Scheduled', value: scheduled, icon: Calendar, color: 'text-amber-600 bg-amber-50' },
    { label: 'Published', value: published, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Avg Rating', value: avgRating ? avgRating.toFixed(1) : '—', icon: Sparkles, color: 'text-indigo-600 bg-indigo-50' }
  ];

  return (
    <div>
      <PageHeader
        title="Welcome back, Shannon"
        subtitle="Here's what's happening with your content."
        action={
          <Link to="/composer">
            <Button>
              <PenLine className="w-4 h-4" />
              New Post
            </Button>
          </Link>
        }
      />

      <div className="px-4 md:px-8 pb-8 space-y-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-4 md:p-5">
              <div className={`w-9 h-9 rounded-lg ${s.color} flex items-center justify-center mb-3`}>
                <s.icon className="w-4 h-4" />
              </div>
              <div className="text-2xl font-semibold text-stone-900 tracking-tight">
                {s.value}
              </div>
              <div className="text-xs text-stone-500 mt-0.5">{s.label}</div>
            </Card>
          ))}
        </div>

        {/* Recent posts */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-stone-900 tracking-tight">
              Recent Posts
            </h2>
            <Link
              to="/library"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
            >
              View all
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-sm text-stone-500">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-stone-100 rounded-2xl mb-3">
                <FileText className="w-6 h-6 text-stone-400" />
              </div>
              <h3 className="text-sm font-medium text-stone-900">No posts yet</h3>
              <p className="mt-1 text-sm text-stone-500">
                Start by drafting your first LinkedIn post.
              </p>
              <Link to="/composer">
                <Button className="mt-4">
                  <PenLine className="w-4 h-4" />
                  Create your first post
                </Button>
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {recent.map((post) => (
                <li key={post.id}>
                  <Link
                    to={`/composer?id=${post.id}`}
                    className="block px-5 py-4 hover:bg-stone-50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-stone-900 line-clamp-2">
                          {post.content || <span className="text-stone-400 italic">Untitled draft</span>}
                        </p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-stone-500">
                          <Badge variant={STATUS_VARIANT[post.status]}>{post.status}</Badge>
                          {post.eos_category && (
                            <Badge variant="indigo">{post.eos_category}</Badge>
                          )}
                          <span>{format(new Date(post.created_at), 'MMM d')}</span>
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-stone-400 flex-shrink-0 mt-1" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
