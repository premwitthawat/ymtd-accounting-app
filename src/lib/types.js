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

export {};
