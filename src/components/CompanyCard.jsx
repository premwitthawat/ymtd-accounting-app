import { ChevronDown, Pencil } from "lucide-react";
import TaskRow from "./TaskRow";

export default function CompanyCard({ c, todayDate, open, onToggleOpen, onToggle, onSkip, onRestore, onEdit, onSetPaymentStatus, onSetDueDate }) {
  const pct = Math.round((c.done / c.total) * 100);
  const barColor = pct === 100 ? "bg-emerald-600" : c.over ? "bg-rose-600" : "bg-brand-navy";

  return (
    <div
      className={`mb-2 overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md ${
        c.over > 0 ? "border-rose-200" : "border-slate-200"
      }`}
    >
      <div onClick={onToggleOpen} className="w-full cursor-pointer px-4 py-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">{c.short}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
            {c.over > 0 && <span className="font-bold text-rose-600">เลยกำหนด {c.over}</span>}
            <span>{c.owner} · <span className="font-mono">{c.done}/{c.total}</span></span>
            {onEdit && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onEdit(c);
                }}
                aria-label="แก้ไขบริษัท"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <Pencil size={14} />
              </button>
            )}
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {open && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {[...c.ct]
            .sort((a, b) => a.dueDateStr.localeCompare(b.dueDateStr))
            .map(t => (
              <TaskRow
                key={t.key}
                t={t}
                todayDate={todayDate}
                onToggle={onToggle}
                onSkip={onSkip}
                onRestore={onRestore}
                onSetPaymentStatus={onSetPaymentStatus}
                onSetDueDate={onSetDueDate}
                showCompany={false}
              />
            ))}
        </div>
      )}
    </div>
  );
}
