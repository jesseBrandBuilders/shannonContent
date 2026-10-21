import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, PenLine } from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday
} from 'date-fns';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Badge } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { usePosts } from '../hooks/usePosts';

export default function Calendar() {
  const [cursor, setCursor] = useState(new Date());
  const { data: posts = [] } = usePosts();

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const getPostsForDay = (day) =>
    posts.filter((p) => {
      const date = p.scheduled_at || p.published_at || p.created_at;
      return isSameDay(new Date(date), day);
    });

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Schedule and visualize your posting cadence."
        action={
          <Link to="/composer">
            <Button>
              <PenLine className="w-4 h-4" />
              New Post
            </Button>
          </Link>
        }
      />

      <div className="px-4 md:px-8 pb-8">
        <Card className="overflow-hidden">
          {/* Month nav */}
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-stone-900 tracking-tight">
              {format(cursor, 'MMMM yyyy')}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCursor(subMonths(cursor, 1))}
                className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCursor(new Date())}
                className="px-3 py-1 text-sm font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => setCursor(addMonths(cursor, 1))}
                className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 border-b border-stone-100">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-xs font-medium text-stone-500 text-center"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const dayPosts = getPostsForDay(day);
              const inMonth = isSameMonth(day, cursor);
              const today = isToday(day);

              return (
                <div
                  key={day.toString()}
                  className={`min-h-[80px] md:min-h-[100px] border-r border-b border-stone-100 p-1.5 md:p-2 ${
                    !inMonth ? 'bg-stone-50/50' : 'bg-white'
                  }`}
                >
                  <div
                    className={`text-xs font-medium mb-1 ${
                      today
                        ? 'inline-flex items-center justify-center w-5 h-5 bg-indigo-600 text-white rounded-full'
                        : inMonth
                        ? 'text-stone-700'
                        : 'text-stone-400'
                    }`}
                  >
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {dayPosts.slice(0, 2).map((p) => (
                      <Link
                        key={p.id}
                        to={p.status === 'review' ? '/review' : `/composer?id=${p.id}`}
                        className={`block px-1.5 py-0.5 text-[10px] md:text-xs rounded truncate ${
                          p.status === 'review'
                            ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200'
                            : p.status === 'scheduled'
                            ? 'bg-amber-100 text-amber-800'
                            : p.status === 'published'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        {p.content?.slice(0, 30) || 'Draft'}
                      </Link>
                    ))}
                    {dayPosts.length > 2 && (
                      <div className="text-[10px] text-stone-500 px-1.5">
                        +{dayPosts.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
