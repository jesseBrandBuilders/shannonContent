import { useEffect, useMemo, useState } from 'react';
import { FileUp, Radio, Search, Target } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Badge } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LeadDetail } from '../components/leads/LeadDetail';
import { ImportLeadsModal } from '../components/leads/ImportLeadsModal';
import { SourcesModal } from '../components/leads/SourcesModal';
import { FitBadge, LEAD_STATUS } from '../components/leads/leadUi';
import { useLeadCounts, useLeads, useOutreachPacing, useWorkspace } from '../hooks/useLeads';

// LinkedIn starts restricting accounts that send much more than ~100 invites a week
const WEEKLY_INVITE_GUIDE = 100;

const FILTERS = ['new', 'contacted', 'connected', 'replied', 'all'];

export default function Leads() {
  const [filter, setFilter] = useState('new');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const { data: workspace } = useWorkspace();
  const { data: leads = [], isLoading } = useLeads({ status: filter });
  const { data: counts = {} } = useLeadCounts();
  const { data: pacing = {} } = useOutreachPacing();

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.full_name, l.title, l.company, l.industry, l.location].some((v) => v?.toLowerCase().includes(q))
    );
  }, [leads, search]);

  const selected = visible.find((l) => l.id === selectedId);

  // Desktop: keep the top lead open so Shannon can start working immediately
  useEffect(() => {
    if (!selectedId && visible.length && window.matchMedia('(min-width: 1024px)').matches) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  const goNext = () => {
    const i = visible.findIndex((l) => l.id === selectedId);
    const next = visible[i + 1] ?? visible[i - 1];
    setSelectedId(next?.id ?? null);
  };

  const invites = pacing.connection || 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={`${counts.new || 0} new · ${total} total`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowSources(true)}>
              <Radio className="w-4 h-4" />
              <span className="hidden sm:inline">Sources</span>
            </Button>
            <Button onClick={() => setShowImport(true)}>
              <FileUp className="w-4 h-4" />
              <span className="hidden sm:inline">Import CSV</span>
            </Button>
          </div>
        }
      />

      <div className="px-4 md:px-8 pb-8 space-y-4">
        {/* Weekly pacing */}
        <Card className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-stone-900">Invites this week</span>
                <span className={`tabular-nums ${invites >= WEEKLY_INVITE_GUIDE * 0.8 ? 'text-amber-700 font-medium' : 'text-stone-500'}`}>
                  {invites} / ~{WEEKLY_INVITE_GUIDE}
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${invites >= WEEKLY_INVITE_GUIDE * 0.8 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                  style={{ width: `${Math.min(100, (invites / WEEKLY_INVITE_GUIDE) * 100)}%` }}
                />
              </div>
            </div>
            <div className="text-sm">
              <span className="font-medium text-stone-900 tabular-nums">{pacing.inmail || 0}</span>
              <span className="text-stone-500"> InMails this week</span>
            </div>
          </div>
        </Card>

        {/* Side-by-side only when there is room for both panes; otherwise list → detail */}
        <div className="grid lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] gap-4 items-start">
          {/* Queue */}
          <div className={`min-w-0 space-y-3 ${selected ? 'hidden lg:block' : ''}`}>
            <div className="flex gap-1 bg-white border border-stone-200 rounded-xl p-1 overflow-x-auto no-scrollbar">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setFilter(f);
                    setSelectedId(null);
                  }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                    filter === f ? 'bg-indigo-50 text-indigo-700' : 'text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {f === 'all' ? 'All' : LEAD_STATUS[f].label}
                  {f !== 'all' && counts[f] ? (
                    <span className="ml-1.5 text-xs text-stone-400 tabular-nums">{counts[f]}</span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <Input
                type="search"
                placeholder="Search name, title, company…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Card className="overflow-hidden">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-stone-500">Loading…</div>
              ) : visible.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-stone-100 rounded-2xl mb-3">
                    <Target className="w-6 h-6 text-stone-400" />
                  </div>
                  <h3 className="text-sm font-medium text-stone-900">
                    {total === 0 ? 'No leads yet' : 'Nothing here'}
                  </h3>
                  <p className="mt-1 text-sm text-stone-500">
                    {total === 0
                      ? 'Connect an AudienceLab audience or import a CSV to fill your queue.'
                      : 'Try another filter.'}
                  </p>
                  {total === 0 && (
                    <div className="mt-4 flex justify-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setShowSources(true)}>
                        Connect AudienceLab
                      </Button>
                      <Button size="sm" onClick={() => setShowImport(true)}>
                        Import CSV
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-stone-100 max-h-[70vh] overflow-y-auto">
                  {visible.map((l) => (
                    <li key={l.id}>
                      <button
                        onClick={() => setSelectedId(l.id)}
                        className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                          l.id === selectedId ? 'bg-indigo-50/60' : 'hover:bg-stone-50'
                        }`}
                      >
                        <FitBadge score={l.fit_score} compact />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900 truncate">
                            {l.full_name || 'Unnamed lead'}
                          </p>
                          <p className="text-xs text-stone-500 truncate">
                            {[l.title, l.company].filter(Boolean).join(' · ') || l.linkedin_url}
                          </p>
                        </div>
                        {filter === 'all' && (
                          <Badge variant={LEAD_STATUS[l.status]?.variant}>{LEAD_STATUS[l.status]?.label}</Badge>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Detail */}
          <div className={`min-w-0 ${selected ? '' : 'hidden lg:block'}`}>
            {selected ? (
              <LeadDetail
                key={selected.id}
                lead={selected}
                workspaceId={workspace?.workspace_id}
                onBack={() => setSelectedId(null)}
                onNext={goNext}
              />
            ) : (
              <Card className="p-12 text-center text-sm text-stone-500">Select a lead to start.</Card>
            )}
          </div>
        </div>
      </div>

      <ImportLeadsModal open={showImport} onClose={() => setShowImport(false)} workspaceId={workspace?.workspace_id} />
      <SourcesModal open={showSources} onClose={() => setShowSources(false)} workspaceId={workspace?.workspace_id} />
    </div>
  );
}
