import { CheckCheck } from "lucide-react";
import { PHASE_LABEL } from "../data/tasks";
import { getUrgency, URGENCY_STYLES, parseDate } from "../lib/urgency";
import TaskRow from "./TaskRow";
import CompanyChipGroup from "./CompanyChipRow";

export default function DayGroup({ dateStr, dayTasks, todayDate, onToggle, onSkip, onRestore, onMarkGroupDone, onSetPaymentStatus, onSetDueDate, onSetOwner, displayMode = "row" }) {
  const date = parseDate(dateStr);
  const urgency = getUrgency(date, todayDate);
  const u = URGENCY_STYLES[urgency];
  const sorted = [...dayTasks].sort((a, b) => a.company.localeCompare(b.company, "th"));
  const dayLabel = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { day: "numeric", month: "short" }).format(date);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className={`flex items-center justify-between border-l-4 bg-slate-50 px-4 py-2.5 ${u.borderL}`}>
        <div className="flex items-baseline gap-2 text-sm font-bold text-slate-900">
          <span className="font-mono">{dayLabel}</span>
          <span className="text-xs font-medium text-slate-500">
            {PHASE_LABEL[dayTasks[0].phase]} · ค้าง {dayTasks.length}
          </span>
        </div>
        <button
          onClick={() => onMarkGroupDone(dayTasks)}
          className="flex shrink-0 items-center gap-1 rounded-md bg-brand-navy px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-navy-light"
        >
          <CheckCheck size={14} /> เสร็จทั้งกลุ่ม
        </button>
      </div>
      {displayMode === "chip" ? (
        <CompanyChipGroup
          tasks={sorted}
          todayDate={todayDate}
          onToggle={onToggle}
          onSkip={onSkip}
          onRestore={onRestore}
          onSetPaymentStatus={onSetPaymentStatus}
          onSetDueDate={onSetDueDate}
          onSetOwner={onSetOwner}
        />
      ) : (
        <div className="divide-y divide-slate-100">
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
              onSetOwner={onSetOwner}
            />
          ))}
        </div>
      )}
    </div>
  );
}
