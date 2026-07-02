import { ChevronDown } from "lucide-react";
import { useTaskTypeStyle } from "../lib/TaskTypesContext";
import { getUrgency, URGENCY_STYLES } from "../lib/urgency";

function TypeCountBadge({ type, count }) {
  const style = useTaskTypeStyle(type);
  return (
    <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.border} ${style.text}`}>
      {type} <span className="font-mono">{count}</span>
    </span>
  );
}

function ReadOnlyTaskRow({ t, todayDate }) {
  const type = useTaskTypeStyle(t.type);
  const urgency = getUrgency(t.dueDate, todayDate);
  const u = URGENCY_STYLES[urgency];

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${u.rowBg}`}>
      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white ${type.bg}`}>{t.type}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{t.company}</span>
      <span className={`shrink-0 text-xs ${urgency === "over" ? "font-semibold text-rose-600" : "text-slate-500"}`}>
        {u.label(t.dueDate, todayDate)}
      </span>
    </div>
  );
}

export default function PersonCard({ p, todayDate, open, onToggleOpen }) {
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const barColor = pct === 100 ? "bg-emerald-600" : p.over ? "bg-rose-600" : "bg-brand-navy";
  const sortedPending = [...p.pending].sort((a, b) => a.dueDateStr.localeCompare(b.dueDateStr));
  const typeBreakdown = Object.entries(p.pendingByType).sort((a, b) => b[1] - a[1]);

  return (
    <div
      className={`mb-2 overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md ${
        p.over > 0 ? "border-rose-200" : "border-slate-200"
      }`}
    >
      <div onClick={onToggleOpen} className="w-full cursor-pointer px-4 py-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-900">{p.owner}</span>
            <span className="shrink-0 text-xs text-slate-400">ทำ {p.companies.length} บริษัท</span>
          </span>
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
        {typeBreakdown.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400">ค้าง:</span>
            {typeBreakdown.map(([type, count]) => (
              <TypeCountBadge key={type} type={type} count={count} />
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
            sortedPending.map(t => <ReadOnlyTaskRow key={t.key} t={t} todayDate={todayDate} />)
          )}
        </div>
      )}
    </div>
  );
}
