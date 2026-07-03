import { useState } from "react";
import { Check, Minus, Undo2, Pencil, CheckCheck } from "lucide-react";
import { useTaskTypeStyle } from "../lib/TaskTypesContext";
import { getUrgency, URGENCY_STYLES } from "../lib/urgency";

export default function TaskRow({ t, todayDate, onToggle, onSkip, onRestore, onSetPaymentStatus, onSetDueDate, showCompany = true }) {
  const [editingDate, setEditingDate] = useState(false);
  const done = t.status === "done";
  const skipped = t.status === "skipped";
  const urgency = getUrgency(t.dueDate, todayDate);
  const u = URGENCY_STYLES[urgency];
  const type = useTaskTypeStyle(t.type);
  const paid = t.paymentStatus === "paid";

  return (
    <div
      className={`group flex items-center gap-3 px-4 py-3 transition-colors ${
        done || skipped ? "bg-white" : u.rowBg
      } hover:bg-slate-50/80`}
    >
      <button
        onClick={() => onToggle(t)}
        aria-label={done ? "ยกเลิกเสร็จ" : "ทำเสร็จ"}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
          done ? "border-emerald-600 bg-emerald-600" : "border-slate-300 hover:border-slate-400"
        }`}
      >
        {done && <Check size={14} strokeWidth={3} className="text-white" />}
        {skipped && <Minus size={14} strokeWidth={3} className="text-slate-400" />}
      </button>

      <div className={`min-w-0 flex-1 ${skipped ? "opacity-50" : ""}`}>
        <div className="flex items-baseline gap-2">
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white ${type.bg}`}>
            {t.type}
          </span>
          {showCompany && (
            <span
              className={`truncate text-sm font-medium text-slate-900 ${done ? "line-through opacity-50" : ""}`}
            >
              {t.company}
            </span>
          )}
        </div>

        {editingDate ? (
          <input
            type="date"
            lang="en-GB"
            autoFocus
            defaultValue={t.dueDateStr}
            onBlur={e => {
              if (e.target.value && e.target.value !== t.dueDateStr) onSetDueDate(t.key, e.target.value);
              setEditingDate(false);
            }}
            onKeyDown={e => {
              if (e.key === "Enter") e.target.blur();
              if (e.key === "Escape") setEditingDate(false);
            }}
            className="mt-0.5 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
          />
        ) : (
          <div className={`mt-0.5 flex items-center text-xs ${skipped ? "text-slate-400" : urgency === "over" && !done ? "text-rose-600 font-semibold" : "text-slate-500"}`}>
            {skipped ? (
              <span>{`ข้าม · ${t.note}`}</span>
            ) : (
              <>
                <span className="whitespace-nowrap">{u.label(t.dueDate, todayDate)}</span>
                <button
                  onClick={() => setEditingDate(true)}
                  aria-label="แก้ไขวันครบกำหนด"
                  className="ml-0.5 shrink-0 rounded p-0.5 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                >
                  <Pencil size={10} />
                </button>
                <span className="truncate">&nbsp;· {t.owner}</span>
              </>
            )}
          </div>
        )}

        {done && (
          <button
            onClick={() => onSetPaymentStatus(t.key, paid ? "unpaid" : "paid")}
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {paid ? "ลูกค้าชำระแล้ว ✓" : "รอลูกค้าชำระ"}
          </button>
        )}
      </div>

      {!done && !skipped && (
        <>
          <button
            onClick={() => onToggle(t)}
            className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <CheckCheck size={12} /> ทำรายการแล้ว
          </button>
          <button
            onClick={() => onSkip(t)}
            className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700"
          >
            ข้าม
          </button>
        </>
      )}
      {skipped && (
        <button
          onClick={() => onRestore(t)}
          className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700"
        >
          <Undo2 size={12} /> คืนค่า
        </button>
      )}
      {done && (
        <button
          onClick={() => onToggle(t)}
          className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700"
        >
          <Undo2 size={12} /> ยกเลิก
        </button>
      )}
    </div>
  );
}
