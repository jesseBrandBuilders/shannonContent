import { X } from 'lucide-react';
import { useEffect } from 'react';

export function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${sizes[size]} bg-white rounded-2xl shadow-xl border border-stone-200 max-h-[90vh] overflow-hidden flex flex-col animate-slide-up`}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
            <h2 className="text-lg font-semibold text-stone-900 tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5 text-stone-500" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
