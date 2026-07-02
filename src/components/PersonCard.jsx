import { ChevronDown } from "lucide-react";
import TaskRow from "./TaskRow";

export default function PersonCard({ p, todayDate, open, onToggleOpen, onToggle, onSkip, onRestore, onSetPaymentStatus, onSetDueDate }) {
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const barColor = pct === 100 ? "bg-emerald-600" : p.over ? "bg-rose-600" : "bg-brand-navy";
  const sortedPending = [...p.pending].sort((a, b) => a.dueDateStr.localeCompare(b.dueDateStr));

  return (
    <div
      className={`mb-2 overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md ${
        p.over > 0 ? "border-rose-200" : "border-slate-200"
      }`}
    >
      <div onClick={onToggleOpen} className="w-full cursor-pointer px-4 py-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">{p.owner}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
            {p.over > 0 && <span className="font-bold text-rose-600">เลยกำหนด {p.over}</span>}
            <span className="font-mono">{p.done}/{p.total}</span>
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </div>
        {p.companies.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {p.companies.map(c => (
              <span key={c.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {c.short}
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 h-1.5 rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {open && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {sortedPending.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-400">ไม่มีงานค้าง</div>
          ) : (
            sortedPending.map(t => (
              <TaskRow
                key={t.key}
                t={t}
                todayDate={todayDate}
                onToggle={onToggle}
                onSkip={onSkip}
                onRestore={onRestore}
                onSetPaymentStatus={onSetPaymentStatus}
                onSetDueDate={onSetDueDate}
                showCompany
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
