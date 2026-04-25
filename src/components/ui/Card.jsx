export function Card({ children, className = '', ...props }) {
  return (
    <div
      className={`bg-white border border-stone-200/80 rounded-2xl shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-stone-100 text-stone-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700'
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
