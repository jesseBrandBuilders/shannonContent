import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, Globe, Image, Info, Loader2, MonitorPlay, Pencil, XCircle } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { useUpdateLead } from '../../hooks/useLeads';
import { checkSite, leadWebsite, screenshotUrl } from '../../lib/leadSite';

const SIGNAL_STYLE = {
  good: { cls: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  warn: { cls: 'bg-amber-50 text-amber-700', Icon: AlertTriangle },
  bad: { cls: 'bg-red-50 text-red-700', Icon: XCircle },
  info: { cls: 'bg-stone-100 text-stone-600', Icon: Info }
};

/**
 * Company website at a glance, for weeding out posers before reaching out.
 * Live in a sandboxed iframe when the site allows framing; otherwise a
 * screenshot (fetched only then, to save the free screenshot quota).
 */
export function SitePreview({ lead }) {
  const toast = useToast();
  const updateLead = useUpdateLead();
  const site = leadWebsite(lead);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(site?.domain ?? '');
  const [view, setView] = useState(null); // 'live' | 'shot' — null = auto
  const [shotFailed, setShotFailed] = useState(false);

  useEffect(() => {
    setEditing(false);
    setDraft(site?.domain ?? '');
    setView(null);
    setShotFailed(false);
  }, [lead.id, site?.domain]);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['site-check', site?.domain],
    queryFn: () => checkSite(site.domain),
    enabled: !!site?.domain,
    staleTime: 60 * 60 * 1000,
    retry: false
  });

  const saveDomain = async (e) => {
    e?.preventDefault();
    try {
      await updateLead.mutateAsync({ id: lead.id, updates: { company_domain: draft.trim() || null } });
      setEditing(false);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const reachable = report?.reachable;
  const mode = view ?? (report?.frameable ? 'live' : 'shot');
  const target = report?.finalUrl ?? (site ? `https://${site.domain}` : null);

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 border-b border-stone-100 flex flex-wrap items-center gap-2">
        <Globe className="w-4 h-4 text-stone-400 shrink-0" />
        {editing || !site ? (
          <form onSubmit={saveDomain} className="flex-1 flex gap-2 min-w-[220px]">
            <Input
              placeholder={site ? '' : 'No website on file — add one, e.g. acme.com'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="py-1.5 text-sm"
            />
            <Button size="sm" type="submit" disabled={updateLead.isPending || !draft.trim()}>
              Check
            </Button>
          </form>
        ) : (
          <>
            <span className="text-sm font-medium text-stone-900 truncate">{site.domain}</span>
            {site.source === 'email' && <span className="text-xs text-stone-400">from their email</span>}
            <button onClick={() => setEditing(true)} className="p-1 rounded text-stone-400 hover:text-stone-700" title="Change website">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <div className="ml-auto flex items-center gap-1">
              {reachable && (
                <div className="flex bg-stone-100 rounded-lg p-0.5">
                  {[
                    ['live', MonitorPlay, 'Live'],
                    ['shot', Image, 'Screenshot']
                  ].map(([v, Icon, label]) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md ${
                        mode === v ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <a href={target} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100" title="Open site">
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </>
        )}
      </div>

      {site && (
        <div className="px-5 py-3 space-y-2">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-stone-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking {site.domain}…
            </p>
          ) : error ? (
            <p className="text-sm text-red-600">{error.message}</p>
          ) : (
            report && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {report.signals.map((s) => {
                    const { cls, Icon } = SIGNAL_STYLE[s.level];
                    return (
                      <span key={s.label} className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md ${cls}`}>
                        <Icon className="w-3 h-3" />
                        {s.label}
                      </span>
                    );
                  })}
                </div>
                {(report.title || report.description) && (
                  <div>
                    {report.title && <p className="text-sm font-medium text-stone-900 line-clamp-1">{report.title}</p>}
                    {report.description && <p className="text-xs text-stone-500 line-clamp-2">{report.description}</p>}
                  </div>
                )}
              </>
            )
          )}
        </div>
      )}

      {report?.reachable && (
        <div className="border-t border-stone-100 bg-stone-50">
          {mode === 'live' ? (
            <>
              <iframe
                key={report.finalUrl}
                src={report.finalUrl}
                title={`${report.finalHost} preview`}
                // Their site runs in its own origin; it can't navigate this app, open forms or reach the session
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                loading="lazy"
                className="w-full h-72 md:h-[26rem] bg-white"
              />
              <p className="px-5 py-2 text-[11px] text-stone-400">
                Blank? Some sites block previews —{' '}
                <button onClick={() => setView('shot')} className="underline hover:text-stone-600">
                  show a screenshot
                </button>
                .
              </p>
            </>
          ) : shotFailed && report.image ? (
            <img src={report.image} alt={`${report.finalHost} social image`} className="w-full max-h-[26rem] object-cover object-top" />
          ) : shotFailed ? (
            <p className="px-5 py-6 text-sm text-stone-500 text-center">Couldn’t capture a screenshot — open the site to take a look.</p>
          ) : (
            <img
              key={report.finalUrl}
              src={screenshotUrl(report.finalUrl)}
              alt={`Screenshot of ${report.finalHost}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setShotFailed(true)}
              className="w-full max-h-[26rem] object-cover object-top bg-white"
            />
          )}
        </div>
      )}
    </Card>
  );
}
