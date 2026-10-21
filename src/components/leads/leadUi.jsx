export const LEAD_STATUS = {
  new: { label: 'New', variant: 'indigo' },
  contacted: { label: 'Contacted', variant: 'amber' },
  connected: { label: 'Connected', variant: 'blue' },
  replied: { label: 'Replied', variant: 'green' },
  not_a_fit: { label: 'Not a fit', variant: 'default' },
  archived: { label: 'Archived', variant: 'default' }
};

export function FitBadge({ score = 0, compact = false }) {
  const tone =
    score >= 75
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : score >= 45
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-stone-100 text-stone-500 ring-stone-200';
  return (
    <div
      className={`shrink-0 flex flex-col items-center justify-center rounded-xl ring-1 ${tone} ${
        compact ? 'w-10 h-10' : 'w-14 h-14'
      }`}
      title="Fit score"
    >
      <span className={`${compact ? 'text-sm' : 'text-lg'} font-semibold leading-none tabular-nums`}>{score}</span>
      {!compact && <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide">fit</span>}
    </div>
  );
}
