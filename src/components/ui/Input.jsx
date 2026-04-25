export function Input({ label, error, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-stone-700 mb-1.5">{label}</label>
      )}
      <input
        className={`w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-150 ${className}`}
        {...props}
      />
      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className = '', rows = 6, ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-stone-700 mb-1.5">{label}</label>
      )}
      <textarea
        rows={rows}
        className={`w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-150 resize-none ${className}`}
        {...props}
      />
      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
}
