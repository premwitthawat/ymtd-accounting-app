// The main service-type catalog (ภงด.1, สปส., ...) and the company/task
// seed data now live in Supabase — see supabase/migrations/002_seed.sql
// and 005_task_types.sql (migrated from the constants that used to be
// here). App.jsx fetches task_types and builds the same
// { [key]: { dueDay, phase, bg, text, border } } shape this used to export
// statically, via TaskTypesContext.

// Tailwind's build-time scanner only generates CSS for class names it can
// find as complete literal strings in source — task_types.color in the
// database is just a palette KEY (e.g. "blue"), looked up here, so we
// never construct class strings like `bg-${color}-600` at runtime.
export const TYPE_PALETTE = {
  blue: { bg: "bg-blue-600", text: "text-blue-600", border: "border-blue-600" },
  violet: { bg: "bg-violet-600", text: "text-violet-600", border: "border-violet-600" },
  emerald: { bg: "bg-emerald-600", text: "text-emerald-600", border: "border-emerald-600" },
  amber: { bg: "bg-amber-600", text: "text-amber-600", border: "border-amber-600" },
  rose: { bg: "bg-rose-700", text: "text-rose-700", border: "border-rose-700" },
  cyan: { bg: "bg-cyan-600", text: "text-cyan-600", border: "border-cyan-600" },
  pink: { bg: "bg-pink-600", text: "text-pink-600", border: "border-pink-600" },
  slate: { bg: "bg-slate-500", text: "text-slate-500", border: "border-slate-500" },
};

export const DEFAULT_TYPE_STYLE = TYPE_PALETTE.slate;

export const PHASE_LABEL = { 1: "ช่วงเตรียมเอกสาร", 2: "หัก ณ ที่จ่าย + กยศ. (ยื่นออนไลน์ถึง 15)", 3: "สปส. / ภพ.30 (ถึง 22–23)" };
export const PEOPLE = ["ทุกคน", "พลอย", "ปูนา"];
export const DEADLINE_MARKERS = [
  { day: 15, color: "bg-blue-400", label: "ภงด./กยศ." },
  { day: 22, color: "bg-amber-400", label: "สปส." },
  { day: 23, color: "bg-rose-400", label: "ภพ.30" },
];
