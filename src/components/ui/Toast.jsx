import { create } from 'zustand';
import { CheckCircle2, XCircle, Info } from 'lucide-react';

const useToastStore = create((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Date.now() + Math.random();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, toast.duration || 3000);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}));

export function useToast() {
  const addToast = useToastStore((s) => s.addToast);
  return {
    success: (message) => addToast({ type: 'success', message }),
    error: (message) => addToast({ type: 'error', message }),
    info: (message) => addToast({ type: 'info', message })
  };
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
    error: <XCircle className="w-5 h-5 text-red-600" />,
    info: <Info className="w-5 h-5 text-indigo-600" />
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 bg-white border border-stone-200 rounded-xl shadow-lg p-4 animate-slide-up cursor-pointer"
          onClick={() => removeToast(t.id)}
        >
          {icons[t.type]}
          <p className="text-sm text-stone-900 flex-1">{t.message}</p>
        </div>
      ))}
    </div>
  );
}
