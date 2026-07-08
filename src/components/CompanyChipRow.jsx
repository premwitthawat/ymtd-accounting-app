import { useMemo, useState } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import { useTaskTypeStyle } from "../lib/TaskTypesContext";
import TaskRow from "./TaskRow";

function TaskChip({ t, onToggle, onSkip, onRestore }) {
  const type = useTaskTypeStyle(t.type);
  const done = t.status === "done";
  const skipped = t.status === "skipped";

  if (skipped) {
    return (
      <button
        onClick={() => onRestore(t)}
        className="flex items-center gap-1 rounded-md bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-500"
      >
        <span className="line-through">{t.type}</span>
        <span>· ไม่เรียกเก็บ</span>
      </button>
    );
  }

  return (
    <span className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white ${type.bg}`}>
      <button onClick={() => onToggle(t)} className="flex items-center gap-1">
        {done && <Check size={11} strokeWidth={3} />}
        {t.type}
      </button>
      {!done && (
        <button
          onClick={e => {
            e.stopPropagation();
            onSkip(t);
          }}
          aria-label={`ข้าม ${t.type}`}
          className="rounded p-0.5 hover:bg-black/15"
        >
          <X size={11} strokeWidth={3} />
        </button>
      )}
    </span>
  );
}

export default function CompanyChipGroup({ tasks, todayDate, onToggle, onSkip, onRestore, onSetPaymentStatus, onSetDueDate, onSetOwner }) {
  const [expandedCompanyId, setExpandedCompanyId] = useState(null);

  const byCompany = useMemo(() => {
    const map = new Map();
    tasks.forEach(t => {
      if (!map.has(t.companyId)) map.set(t.companyId, { companyId: t.companyId, company: t.company, tasks: [] });
      map.get(t.companyId).tasks.push(t);
    });
    return [...map.values()].sort((a, b) => a.company.localeCompare(b.company, "th"));
  }, [tasks]);

  return (
    <div className="divide-y divide-slate-100">
      {byCompany.map(group => {
        const open = expandedCompanyId === group.companyId;
        return (
          <div key={group.companyId}>
            <button
              onClick={() => setExpandedCompanyId(open ? null : group.companyId)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50/80"
            >
              <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
              <span className="shrink-0 text-sm font-semibold text-slate-900">{group.company}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {group.tasks.map(t => (
                  <TaskChip key={t.key} t={t} onToggle={onToggle} onSkip={onSkip} onRestore={onRestore} />
                ))}
              </span>
            </button>
            {open && (
              <div className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/50">
                {group.tasks.map(t => (
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
                    showCompany={false}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
