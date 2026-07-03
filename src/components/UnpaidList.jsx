import { useMemo, useState } from "react";
import { ChevronDown, History, Check, Banknote } from "lucide-react";
import { useTaskTypeStyle } from "../lib/TaskTypesContext";

const daysSince = iso => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const AGING_STYLE = days => (days > 15 ? "bg-rose-100 text-rose-700" : days >= 7 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500");

function groupByCompany(tasks) {
  const map = new Map();
  tasks.forEach(t => {
    if (!map.has(t.companyId)) map.set(t.companyId, { companyId: t.companyId, company: t.company, owner: t.owner, tasks: [] });
    map.get(t.companyId).tasks.push(t);
  });
  return [...map.values()];
}

function UnpaidChip({ t, onMarkPaid }) {
  const type = useTaskTypeStyle(t.type);
  return (
    <button
      onClick={() => onMarkPaid(t.key)}
      className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white ${type.bg}`}
    >
      {t.type}
    </button>
  );
}

function PaidChip({ t, onUndoPaid }) {
  return (
    <button
      onClick={() => onUndoPaid(t.key)}
      className="flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold text-white"
    >
      <Check size={11} strokeWidth={3} />
      {t.type}
    </button>
  );
}

function PaidSection({ tasks, onUndoPaid }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(
    () => groupByCompany(tasks).sort((a, b) => a.company.localeCompare(b.company, "th")),
    [tasks]
  );

  if (tasks.length === 0) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <History size={16} className="text-slate-400" />
          ลูกค้าชำระแล้ว
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{tasks.length}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {groups.map(group => (
            <div key={group.companyId} className="px-4 py-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-slate-900">{group.company}</span>
                <span className="text-xs text-slate-400">{group.owner}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {group.tasks.map(t => (
                  <PaidChip key={t.key} t={t} onUndoPaid={onUndoPaid} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UnpaidList({ tasks, paidTasks, onMarkPaid, onUndoPaid, onMarkCompanyPaid }) {
  const groups = useMemo(() => {
    return groupByCompany(tasks)
      .map(group => ({ ...group, oldestDays: Math.max(...group.tasks.map(t => daysSince(t.updatedAt))) }))
      .sort((a, b) => b.oldestDays - a.oldestDays);
  }, [tasks]);

  return (
    <div>
      {groups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">
          ไม่มีรายการรอลูกค้าชำระ
        </div>
      ) : (
        <>
          <div className="mb-3 text-sm font-medium text-slate-500">
            รอชำระ {groups.length} บริษัท · {tasks.length} รายการ
          </div>
          <div className="flex flex-col gap-2">
            {groups.map(group => (
              <div key={group.companyId} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="truncate text-sm font-semibold text-slate-900">{group.company}</span>
                      <span className="shrink-0 text-xs text-slate-400">{group.owner}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${AGING_STYLE(group.oldestDays)}`}>
                      ค้าง {group.oldestDays} วัน
                    </span>
                    <span className="text-xs text-slate-500">{group.tasks.length} รายการ</span>
                    <button
                      onClick={() => onMarkCompanyPaid(group.tasks.map(t => t.key))}
                      className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Banknote size={13} /> ชำระแล้วทั้งบริษัท
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.tasks.map(t => (
                    <UnpaidChip key={t.key} t={t} onMarkPaid={onMarkPaid} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <PaidSection tasks={paidTasks} onUndoPaid={onUndoPaid} />
    </div>
  );
}
