import { useState } from "react";
import { ChevronDown, History, Undo2 } from "lucide-react";

function PaidSection({ tasks, onUndoPaid }) {
  const [open, setOpen] = useState(false);

  if (tasks.length === 0) return null;

  const sorted = [...tasks].sort((a, b) => a.company.localeCompare(b.company, "th"));

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
          {sorted.map(t => (
            <div key={t.key} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-md bg-brand-navy px-1.5 py-0.5 text-[11px] font-bold text-white">{t.type}</span>
                  <span className="truncate text-sm font-semibold text-slate-900">{t.company}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{t.owner} · ชำระแล้ว</div>
              </div>
              <button
                onClick={() => onUndoPaid(t.key)}
                className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300"
              >
                <Undo2 size={13} /> ย้อนกลับ
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UnpaidList({ tasks, paidTasks, onMarkPaid, onUndoPaid }) {
  const sorted = [...tasks].sort((a, b) => a.company.localeCompare(b.company, "th"));

  return (
    <div>
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">
          ไม่มีรายการรอลูกค้าชำระ
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map(t => (
            <div key={t.key} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
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
          ))}
        </div>
      )}

      <PaidSection tasks={paidTasks} onUndoPaid={onUndoPaid} />
    </div>
  );
}
