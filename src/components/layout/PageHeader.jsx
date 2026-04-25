export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="px-4 md:px-8 pt-6 md:pt-10 pb-4 md:pb-6 flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tighter">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
