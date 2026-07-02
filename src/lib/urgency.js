// Supabase returns `date` columns as "YYYY-MM-DD" strings. Parsing with an
// explicit local midnight avoids the classic bug where `new Date("2026-07-15")`
// gets interpreted as UTC and can display as the wrong calendar day
// depending on the browser's timezone offset.
export function parseDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function diffDays(dueDate, today) {
  return Math.round((dueDate - today) / 86400000);
}

const dayMonthLabel = date => new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { day: "numeric", month: "short" }).format(date);

export function getUrgency(dueDate, today) {
  const diff = diffDays(dueDate, today);
  if (diff < 0) return "over";
  if (diff <= 3) return "soon";
  return "ok";
}

export const URGENCY_STYLES = {
  over: {
    rowBg: "bg-rose-50",
    barBg: "bg-rose-500",
    borderL: "border-rose-500",
    text: "text-rose-600",
    chip: "bg-rose-100 text-rose-700",
    label: (dueDate, today) => `เลยกำหนด ${Math.abs(diffDays(dueDate, today))} วัน`,
  },
  soon: {
    rowBg: "bg-amber-50",
    barBg: "bg-amber-500",
    borderL: "border-amber-500",
    text: "text-amber-700",
    chip: "bg-amber-100 text-amber-700",
    label: (dueDate, today) => {
      const diff = diffDays(dueDate, today);
      return diff === 0 ? "ครบกำหนดวันนี้" : `เหลือ ${diff} วัน`;
    },
  },
  ok: {
    rowBg: "bg-white",
    barBg: "bg-slate-300",
    borderL: "border-slate-300",
    text: "text-slate-500",
    chip: "bg-slate-100 text-slate-600",
    label: dueDate => `กำหนดวันที่ ${dayMonthLabel(dueDate)}`,
  },
};
