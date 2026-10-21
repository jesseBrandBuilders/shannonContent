import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, PenLine, Filter } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Badge } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { usePosts } from '../hooks/usePosts';
import { format } from 'date-fns';

const STATUS_VARIANT = {
  review: 'indigo',
  draft: 'default',
  scheduled: 'amber',
  published: 'green'
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'review', label: 'In review' },
  { value: 'draft', label: 'Drafts' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' }
];

export default function Library() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { data: posts = [], isLoading } = usePosts(
    filter === 'all' ? {} : { status: filter }
  );

  const filtered = search
    ? posts.filter((p) => p.content?.toLowerCase().includes(search.toLowerCase()))
    : posts;

  return (
    <div>
      <PageHeader
        title="Library"
        subtitle={`${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`}
        action={
          <Link to="/composer">
            <Button>
              <PenLine className="w-4 h-4" />
              New Post
            </Button>
          </Link>
        }
      />

      <div className="px-4 md:px-8 pb-8 space-y-4">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input
              type="search"
              placeholder="Search posts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1 bg-white border border-stone-200 rounded-xl p-1 overflow-x-auto no-scrollbar">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  filter === f.value
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-stone-600 hover:bg-stone-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <Card className="p-8 text-center text-sm text-stone-500">Loading…</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-stone-100 rounded-2xl mb-3">
              <Filter className="w-6 h-6 text-stone-400" />
            </div>
            <h3 className="text-sm font-medium text-stone-900">No posts found</h3>
            <p className="mt-1 text-sm text-stone-500">
              {search ? 'Try a different search term.' : 'Create your first post to get started.'}
            </p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((post) => (
              <Link key={post.id} to={`/composer?id=${post.id}`}>
                <Card className="p-5 hover:border-stone-300 hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={STATUS_VARIANT[post.status]}>{post.status}</Badge>
                      {post.eos_category && (
                        <Badge variant="indigo">{post.eos_category}</Badge>
                      )}
                    </div>
                    <span className="text-xs text-stone-500 flex-shrink-0">
                      {format(new Date(post.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <p className="text-sm text-stone-700 line-clamp-3 leading-relaxed">
                    {post.content || <span className="text-stone-400 italic">Untitled draft</span>}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
