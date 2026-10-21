import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  PenLine,
  Library,
  Calendar,
  LayoutTemplate,
  BarChart3,
  LogOut,
  Sparkles,
  Target,
  Inbox,
  Bot,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  X
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useReviewQueue } from '../../hooks/useAutopilot';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/review', icon: Inbox, label: 'Review', badge: 'review' },
  { to: '/leads', icon: Target, label: 'Leads' },
  { to: '/library', icon: Library, label: 'Library' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/composer', icon: PenLine, label: 'Composer' },
  { to: '/autopilot', icon: Bot, label: 'Autopilot' },
  { to: '/templates', icon: LayoutTemplate, label: 'Templates' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' }
];

// Phone bottom bar: these four, then "More" for everything else
const PRIMARY_MOBILE = 4;

// Below this width the sidebar starts as an icon rail
const WIDE_QUERY = '(min-width: 1280px)';
const STORAGE_KEY = 'cs.sidebarCollapsed';

function readStoredCollapsed() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

/**
 * Collapsed by default on small laptops/tablets, expanded on wide screens.
 * Once she toggles it, her choice sticks (per browser).
 */
function useSidebarCollapsed() {
  const [stored, setStored] = useState(readStoredCollapsed);
  const [narrow, setNarrow] = useState(() => !window.matchMedia(WIDE_QUERY).matches);

  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = (e) => setNarrow(!e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const collapsed = stored ?? narrow;
  const toggle = () => {
    const next = !collapsed;
    setStored(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* private mode — still works for this session */
    }
  };
  return [collapsed, toggle];
}

function CountBadge({ count, dot }) {
  if (!count) return null;
  if (dot) {
    return <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-white" />;
  }
  return (
    <span className="ml-auto min-w-[1.25rem] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[11px] font-semibold flex items-center justify-center tabular-nums">
      {count}
    </span>
  );
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: reviewQueue = [] } = useReviewQueue();
  const counts = { review: reviewQueue.length };

  // Close the phone "More" sheet whenever the page changes
  useEffect(() => setMoreOpen(false), [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const primary = navItems.slice(0, PRIMARY_MOBILE);
  const overflow = navItems.slice(PRIMARY_MOBILE);
  const overflowActive = overflow.some((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)));

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Sidebar (tablet and up) */}
      <aside
        className={`hidden md:flex flex-col border-r border-stone-200/80 bg-white/80 backdrop-blur-xl sticky top-0 h-screen shrink-0 transition-[width] duration-200 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className={`py-5 flex items-center ${collapsed ? 'flex-col gap-3 px-2' : 'gap-2.5 px-5'}`}>
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold text-stone-900 tracking-tight">Content Studio</h1>
              <p className="text-xs text-stone-500">EOS Edition</p>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        <nav className={`flex-1 space-y-0.5 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'}`}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              className={({ isActive }) =>
                `flex items-center rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center h-10' : 'gap-3 px-3 py-2'
                } ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'}`
              }
            >
              <span className="relative shrink-0">
                <item.icon className="w-4 h-4" />
                {collapsed && <CountBadge count={counts[item.badge]} dot />}
              </span>
              {!collapsed && (
                <>
                  <span className="truncate">{item.label}</span>
                  <CountBadge count={counts[item.badge]} />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={`py-4 border-t border-stone-100 ${collapsed ? 'px-2' : 'px-3'}`}>
          <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'gap-3 px-3 py-2'}`}>
            <div
              className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-sm font-semibold shrink-0"
              title={user?.email}
            >
              {user?.email?.[0]?.toUpperCase() ?? 'S'}
            </div>
            {!collapsed && (
              <p className="flex-1 min-w-0 text-sm font-medium text-stone-900 truncate">{user?.email ?? 'Signed in'}</p>
            )}
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Phone top bar */}
        <div className="md:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-stone-200/80 px-4 py-3 flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <h1 className="text-sm font-semibold text-stone-900 tracking-tight">Content Studio</h1>
        </div>

        <div className="flex-1 pb-24 md:pb-0">
          <Outlet />
        </div>

        {/* Phone "More" sheet */}
        {moreOpen && (
          <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="More pages">
            <div className="absolute inset-0 bg-stone-900/30 backdrop-blur-sm animate-fade-in" onClick={() => setMoreOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-xl border-t border-stone-200 p-4 pb-24 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-stone-900">More</p>
                <button onClick={() => setMoreOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100" aria-label="Close">
                  <X className="w-5 h-5 text-stone-500" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {overflow.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-colors ${
                        isActive ? 'bg-indigo-50 text-indigo-700' : 'text-stone-700 hover:bg-stone-50'
                      }`
                    }
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </NavLink>
                ))}
                <button
                  onClick={handleSignOut}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium text-stone-700 hover:bg-stone-50"
                >
                  <LogOut className="w-5 h-5" />
                  Sign out
                </button>
              </div>
              <p className="mt-3 text-xs text-stone-400 text-center truncate">{user?.email}</p>
            </div>
          </div>
        )}

        {/* Phone bottom bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-stone-200/80 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-around">
            {primary.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                    isActive && !moreOpen ? 'text-indigo-600' : 'text-stone-500'
                  }`
                }
              >
                <span className="relative">
                  <item.icon className="w-5 h-5" />
                  <CountBadge count={counts[item.badge]} dot />
                </span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </NavLink>
            ))}
            <button
              onClick={() => setMoreOpen((o) => !o)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                moreOpen || overflowActive ? 'text-indigo-600' : 'text-stone-500'
              }`}
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>
        </nav>
      </main>
    </div>
  );
}
