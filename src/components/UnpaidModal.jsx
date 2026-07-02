import { X } from "lucide-react";

export default function UnpaidModal({ open, onClose, tasks, onMarkPaid }) {
  if (!open) return null;

  const sorted = [...tasks].sort((a, b) => a.company.localeCompare(b.company, "th"));

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">รอลูกค้าชำระ</h2>
          <button onClick={onClose} aria-label="ปิด" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2 px-5 py-4">
          {sorted.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">ไม่มีรายการรอลูกค้าชำระ</div>
          ) : (
            sorted.map(t => (
              <div key={t.key} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-md bg-brand-navy px-1.5 py-0.5 text-[11px] font-bold text-white">{t.type}</span>
                    <span className="truncate text-sm font-semibold text-slate-900">{t.company}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{t.owner} · ยื่นแล้ว รอลูกค้าชำระ</div>
                </div>
                <button
                  onClick={() => onMarkPaid(t.key)}
                  className="shrink-0 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  ชำระแล้ว
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
