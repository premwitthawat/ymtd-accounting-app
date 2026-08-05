// The app-side twin of the SQL that builds tasks.due_date — see
// clamp_day_to_month() and ensure_current_period_tasks() in
// supabase/migrations/006_periods_and_payments.sql and 015_period_due_days.sql.
// Both sides have to agree: the database sets the date when a task row is
// first generated, and the app rewrites it when a manager shifts that
// month's deadline for a whole type.

// Day 31 in a 30-day month has to land on the 30th, not roll into the
// next month the way `new Date(y, m - 1, 31)` would.
export function clampDayToMonth(year, month, day) {
  const lastDay = new Date(year, month, 0).getDate(); // month is 1-based here, so day 0 = its last day
  return Math.min(day, lastDay);
}

// "2026-08" + 17 -> "2026-08-17", the same "YYYY-MM-DD" shape Supabase
// returns for a `date` column.
export function periodDueDateStr(period, day) {
  const [year, month] = period.split("-").map(Number);
  return `${period}-${String(clampDayToMonth(year, month, day)).padStart(2, "0")}`;
}

// Which day of the month a type actually falls due in a given period:
// the manager's override for that month wins, then the per-company
// custom day (only ad-hoc "อื่นๆ" services have one), then the type's
// standing default. Mirrors the coalesce() in ensure_current_period_tasks().
export function effectiveDueDay({ override, customDueDay, defaultDueDay }) {
  return override ?? customDueDay ?? defaultDueDay ?? null;
}
