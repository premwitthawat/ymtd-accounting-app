import { useEffect } from "react";
import { AlertCircle, X } from "lucide-react";

export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-lg border border-rose-700 bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
        <AlertCircle size={16} className="shrink-0" />
        <span>{toast.message}</span>
        <button onClick={onDismiss} aria-label="ปิด" className="ml-1 shrink-0 rounded p-0.5 hover:bg-white/15">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
