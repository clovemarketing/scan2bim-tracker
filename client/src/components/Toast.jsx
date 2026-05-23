import { useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

export function Toast({ toasts, dismiss }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} dismiss={dismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, dismiss }) {
  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), 4000);
    return () => clearTimeout(id);
  }, [toast.id, dismiss]);

  const isErr = toast.type === 'error';
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm border animate-fade-in ${
        isErr
          ? 'bg-red-50 border-red-200 text-red-800'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
      }`}
    >
      {isErr ? (
        <XCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
      ) : (
        <CheckCircle size={18} className="text-emerald-500 mt-0.5 shrink-0" />
      )}
      <span className="flex-1">{toast.msg}</span>
      <button onClick={() => dismiss(toast.id)} className="opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

let nextId = 1;
export function useToast() {
  const [toasts, setToasts] = window.__toastState || [[], () => {}];
  return {
    success: (msg) => setToasts((p) => [...p, { id: nextId++, type: 'success', msg }]),
    error: (msg) => setToasts((p) => [...p, { id: nextId++, type: 'error', msg }]),
    dismiss: (id) => setToasts((p) => p.filter((t) => t.id !== id)),
    toasts,
  };
}
