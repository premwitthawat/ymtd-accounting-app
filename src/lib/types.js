// JSDoc type definitions mirroring the Supabase schema (see
// supabase/migrations/*.sql). This project is plain JS, not TypeScript —
// these give editor autocomplete/checking without adding a build step.

/**
 * @typedef {Object} Company
 * @property {number} id
 * @property {string} name
 * @property {string} short
 * @property {string} owner
 * @property {boolean} active
 * @property {string|null} line_group_id
 * @property {string} created_at
 */

/**
 * @typedef {"unpaid" | "pending_review" | "paid"} PaymentStatus
 */

/**
 * A payment/slip record for one filing task (ภงด./สปส./ภพ.30/etc — a
 * `tasks` row), not a standalone invoice — see
 * supabase/migrations/010_payment_records.sql for why.
 * @typedef {Object} PaymentRecord
 * @property {string} id
 * @property {number} task_id
 * @property {number|null} amount
 * @property {PaymentStatus} status
 * @property {string|null} slip_path storage object path in the `payment_slips` bucket, not a URL — sign on demand
 * @property {string|null} notice_sent_at
 * @property {string|null} last_reminded_at
 * @property {string} created_at
 */

/**
 * One month's deadline for a whole service type, set by a manager when
 * the type's standing day lands on a holiday — see
 * supabase/migrations/015_period_due_days.sql. Absent for the usual
 * month, where the type's default applies.
 * @typedef {Object} PeriodDueDay
 * @property {string} period "YYYY-MM", same key as tasks.period
 * @property {string} type task_types.key, or an ad-hoc company_services.type
 * @property {number} due_day day of month, clamped to the month's length when applied
 * @property {string} updated_at
 */

export {};
