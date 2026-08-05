import { useEffect, useMemo, useState } from "react";
import { X, RotateCcw, CalendarClock } from "lucide-react";
import { DEFAULT_TYPE_STYLE } from "../data/tasks";
import { clampDayToMonth, periodDueDateStr } from "../lib/dueDates";
import { parseDate } from "../lib/urgency";

const dateLabel = date =>
  new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { weekday: "short", day: "numeric", month: "short" }).format(date);

const isWeekend = date => date.getDay() === 0 || date.getDay() === 6;

// Only ever used to suggest a shift the manager can take or ignore — the
// office knows its own public holidays, this just catches the obvious
// weekend case so nobody has to eyeball a calendar. Returns null when
// the following Monday would fall in the next month (day 31 on a
// Saturday), since a period's due date has to stay inside that period.
function nextMondayDay(period, day) {
  const [year, month] = period.split("-").map(Number);
  const date = parseDate(periodDueDateStr(period, day));
  while (isWeekend(date)) date.setDate(date.getDate() + 1);
  const shifted = date.getDate();
  return shifted === clampDayToMonth(year, month, shifted) && date.getMonth() + 1 === month ? shifted : null;
}

// Deadlines are a property of the *month*, not of any one company: when
// the 15th is a holiday, every ภงด. of every company moves together. The
// per-task date pencil can do that too, but only one of ~30 rows at a
// time — and getting it wrong sends the LINE payment reminders out on
// the wrong day.
export default function DueDayPanel({ open, onClose, period, periodLabel, taskTypes, overrides, taskCounts, onApply, readOnly }) {
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const saved = useMemo(() => {
    const days = {};
    Object.entries(taskTypes).forEach(([type, cfg]) => {
      days[type] = overrides[type] ?? cfg.dueDay;
    });
    return days;
  }, [taskTypes, overrides]);

  // Keyed on open/period rather than on `saved`: loadAll() rebuilds
  // taskTypes on every realtime event (someone ticking a task off in
  // another tab), and resyncing from that would wipe out a number the
  // manager is halfway through typing.
  useEffect(() => {
    if (open) {
      setDraft(saved);
      setSaving(false);
    }
  }, [open, period]);

  if (!open) return null;

  const rows = Object.entries(taskTypes)
    .map(([type, cfg]) => {
      const day = draft[type] ?? saved[type];
      const dueDate = parseDate(periodDueDateStr(period, day));
      return {
        type,
        style: cfg,
        defaultDay: cfg.dueDay,
        day,
        dueDate,
        count: taskCounts[type] || 0,
        changed: day !== saved[type],
        overridden: day !== cfg.dueDay,
        mondayDay: isWeekend(dueDate) ? nextMondayDay(period, day) : null,
      };
    })
    .sort((a, b) => a.day - b.day || a.type.localeCompare(b.type, "th"));

  // A day typed back to the type's standing default clears the override
  // instead of storing a redundant copy of it, so next month's default
  // change (if the catalog ever gets edited) still reaches this month.
  const pending = rows.filter(r => r.changed).map(r => ({ type: r.type, day: r.overridden ? r.day : null }));

  const setDay = (type, day) => setDraft(d => ({ ...d, [type]: day }));

  const save = async () => {
    setSaving(true);
    const ok = await onApply(pending);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <CalendarClock size={18} className="text-brand-navy" />
            วันครบกำหนด · {periodLabel}
          </h2>
          <button onClick={onClose} aria-label="ปิด" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="mb-4 text-xs text-slate-500">
            ปกติแต่ละประเภทจะใช้วันเดิมทุกเดือนอัตโนมัติ — ปรับตรงนี้เฉพาะเดือนที่วันครบกำหนดตรงวันหยุด แล้วเลื่อนเป็นวันทำการสุดท้ายจริง
            ระบบจะเลื่อนงานของประเภทนั้น<b>ทุกบริษัทในเดือนนี้</b> พร้อมเลื่อนวันแจ้งเตือนลูกค้าใน LINE ตามไปด้วย
            เดือนถัดไปจะกลับไปใช้วันเดิมเองโดยไม่ต้องแก้คืน
          </p>

          {readOnly && (
            <div className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
              กำลังดูข้อมูลย้อนหลัง แก้ไขไม่ได้
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {rows.map(r => (
              <div
                key={r.type}
                className={`rounded-lg border px-3 py-2 ${r.overridden ? "border-brand-navy/30 bg-brand-navy/5" : "border-slate-200"}`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${(r.style || DEFAULT_TYPE_STYLE).bg}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">{r.type}</div>
                    <div className="text-[11px] text-slate-400">
                      ค่าเริ่มต้นวันที่ {r.defaultDay} · {r.count > 0 ? `${r.count} งานเดือนนี้` : "ไม่มีงานเดือนนี้"}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={r.day}
                    disabled={readOnly}
                    onChange={e => setDay(r.type, Math.min(31, Math.max(1, +e.target.value || 1)))}
                    aria-label={`วันครบกำหนดของ ${r.type}`}
                    className="w-16 shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm font-semibold focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setDay(r.type, r.defaultDay)}
                    disabled={readOnly || !r.overridden}
                    aria-label={`คืนค่าเริ่มต้นของ ${r.type}`}
                    title="คืนค่าเริ่มต้น"
                    className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:invisible"
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-[11px]">
                  <span className="font-semibold text-slate-500">ครบกำหนด {dateLabel(r.dueDate)}</span>
                  {isWeekend(r.dueDate) && (
                    <>
                      <span className="font-semibold text-amber-600">· ตรงวันหยุดสุดสัปดาห์</span>
                      {r.mondayDay && !readOnly && (
                        <button
                          type="button"
                          onClick={() => setDay(r.type, r.mondayDay)}
                          className="font-semibold text-amber-600 underline hover:text-amber-700"
                        >
                          เลื่อนเป็นวันจันทร์ที่ {r.mondayDay}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {!readOnly && (
          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
            <span className="mr-auto text-xs text-slate-400">
              {pending.length > 0 ? `แก้ไข ${pending.length} ประเภท` : "ยังไม่มีการแก้ไข"}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending.length === 0 || saving}
              className="rounded-lg bg-brand-navy px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-light disabled:opacity-40"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
