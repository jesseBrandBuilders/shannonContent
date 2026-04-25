import { useNavigate } from 'react-router-dom';
import { Layers, Target, Compass, Users, Workflow, TrendingUp } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Badge } from '../components/ui/Card';
import { useCreatePost } from '../hooks/usePosts';
import { useToast } from '../components/ui/Toast';

const TEMPLATES = [
  {
    id: 'level10',
    icon: Layers,
    color: 'bg-blue-50 text-blue-700',
    name: 'Level 10 Meeting Insight',
    category: 'level10',
    description: 'Share a recurring tension you noticed in L10s and how to break it.',
    structure: `[Hook: Surprising observation from a Level 10 Meeting]

The IDS list keeps growing. Same issues. Different week.

Here's what I've learned about why teams get stuck:

→ [Insight 1]
→ [Insight 2]
→ [Insight 3]

The fix isn't more meetings. It's better Identification.

What's the longest-running issue on your IDS list?`
  },
  {
    id: 'rocks',
    icon: Target,
    color: 'bg-emerald-50 text-emerald-700',
    name: 'Quarterly Rocks Reflection',
    category: 'rocks',
    description: 'Reflect on a Rock that succeeded — or failed — and what it taught you.',
    structure: `Rocks aren't goals. They're priorities.

Last quarter, [Company] set [number] Rocks.
[Number] were completed on time.

Here's what the misses taught us:

1. [Lesson 1]
2. [Lesson 2]
3. [Lesson 3]

Rock-setting is a skill. It gets sharper every 90 days.

What's one Rock you nailed last quarter?`
  },
  {
    id: 'vto',
    icon: Compass,
    color: 'bg-purple-50 text-purple-700',
    name: 'V/TO Clarity Story',
    category: 'vto',
    description: 'Tell the story of how a leadership team got crystal clear on Vision.',
    structure: `Most leadership teams think they're aligned.

Then we open the V/TO™.

Three executives. Three different answers to "what's our 10-Year Target?"

Here's what changed when we got it on one page:

[Detail the shift]

Vision without commitment is decoration.
Vision shared on a single page is a compass.

When did your team last revisit the V/TO?`
  },
  {
    id: 'people',
    icon: Users,
    color: 'bg-amber-50 text-amber-700',
    name: 'GWC People Lesson',
    category: 'people',
    description: 'A story about a Right Person / Wrong Seat moment.',
    structure: `"Right Person, Wrong Seat" is the hardest call in EOS.

[Brief story setup]

She had the values. She didn't Get It.

Here's how the conversation went:

[Conversation outline]

Today she's in a different seat — and thriving.

Letting people grow into the right seat is leadership.

What's a Right Person, Wrong Seat moment that changed your business?`
  },
  {
    id: 'process',
    icon: Workflow,
    color: 'bg-pink-50 text-pink-700',
    name: 'Process Component Win',
    category: 'process',
    description: 'Document a process that 10x\'d a part of the business.',
    structure: `Most companies have processes.
Few have *the* process.

We documented our [process name] in one afternoon.
It changed everything.

Before:
→ [Pain point]
→ [Pain point]

After:
→ [Result]
→ [Result]

The Process Component is EOS's most underrated tool.

What's one process you should document this week?`
  },
  {
    id: 'traction',
    icon: TrendingUp,
    color: 'bg-indigo-50 text-indigo-700',
    name: 'Traction Milestone',
    category: 'traction',
    description: 'Celebrate a Traction milestone with the lessons that got you there.',
    structure: `[Number] quarters into running on EOS.

Here's what's different:

✓ [Specific change]
✓ [Specific change]
✓ [Specific change]

The system works because it's simple.
The work is staying disciplined enough to keep using it.

If you're considering EOS — start with a single Level 10 Meeting next Monday.

What was your earliest sign EOS was working?`
  }
];

export default function Templates() {
  const navigate = useNavigate();
  const createPost = useCreatePost();
  const toast = useToast();

  const handleUseTemplate = async (template) => {
    try {
      const post = await createPost.mutateAsync({
        content: template.structure,
        eos_category: template.category,
        status: 'draft'
      });
      toast.success(`Started from "${template.name}"`);
      navigate(`/composer?id=${post.id}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle="EOS-specific starting points for common post types."
      />

      <div className="px-4 md:px-8 pb-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEMPLATES.map((t) => (
          <Card key={t.id} className="p-5 flex flex-col hover:border-stone-300 hover:shadow-md transition-all">
            <div className={`w-10 h-10 rounded-xl ${t.color} flex items-center justify-center mb-4`}>
              <t.icon className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-stone-900 tracking-tight">{t.name}</h3>
            <p className="mt-1 text-sm text-stone-500 leading-relaxed flex-1">
              {t.description}
            </p>
            <div className="mt-4 flex items-center justify-between">
              <Badge variant="indigo">{t.category}</Badge>
              <button
                onClick={() => handleUseTemplate(t)}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Use template →
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
