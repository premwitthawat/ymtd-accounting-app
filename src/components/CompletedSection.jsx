import { useState } from "react";
import { ChevronDown, History } from "lucide-react";
import TaskRow from "./TaskRow";

export default function CompletedSection({ tasks, todayDate, onToggle, onSkip, onRestore, onSetPaymentStatus, onSetDueDate }) {
  const [open, setOpen] = useState(false);

  if (tasks.length === 0) return null;

  const sorted = [...tasks].sort((a, b) => a.dueDateStr.localeCompare(b.dueDateStr) || a.company.localeCompare(b.company, "th"));

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <History size={16} className="text-slate-400" />
          งานที่ทำแล้ว / ข้ามแล้ว
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{tasks.length}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {sorted.map(t => (
            <TaskRow
              key={t.key}
              t={t}
              todayDate={todayDate}
              onToggle={onToggle}
              onSkip={onSkip}
              onRestore={onRestore}
              onSetPaymentStatus={onSetPaymentStatus}
              onSetDueDate={onSetDueDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
