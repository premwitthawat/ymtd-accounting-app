import { useEffect, useState } from "react";
import { X, Receipt, ImageIcon, Send, FileText } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { invokeFunction } from "../lib/functions";

const STATUS_STYLES = {
  unpaid: { label: "รอชำระ", className: "bg-slate-100 text-slate-600" },
  pending_review: { label: "รอตรวจสอบสลิป", className: "bg-amber-100 text-amber-700" },
  paid: { label: "ชำระแล้ว", className: "bg-emerald-100 text-emerald-700" },
};

const formatThaiDate = dateStr =>
  new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${dateStr}T00:00:00`)
  );

const formatBaht = amount =>
  amount == null ? "ยังไม่ระบุยอด" : new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(amount);

const round2 = n => Math.round(n * 100) / 100;

const invokeIssueReceipt = body => invokeFunction("flowaccount-issue-receipt", body);

// Fetches its own data instead of flowing down from App.jsx's loadAll
// like companies/tasks do — payment records only matter once a company
// card is expanded, so wiring them into the global load+realtime
// pipeline would mean every view pays for a table almost none of them
// render. Scoped so the line-webhook Edge Function attaching a slip (or
// staff approving one on another device) shows up here live.
export default function CompanyPaymentRecords({ companyId, canApprove, onError }) {
  const [records, setRecords] = useState([]);
  const [unnotifiedTasks, setUnnotifiedTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(null);
  const [issuing, setIssuing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [{ data: recordsData, error: recordsErr }, { data: tasksData, error: tasksErr }] = await Promise.all([
        supabase
          .from("payment_records")
          .select(
            "id, task_id, amount, status, slip_path, notice_sent_at, created_at, amount_gross, wht_rate, flowaccount_document_id, flowaccount_document_number, receipt_path, issued_at, tasks!inner(type, due_date, company_id)"
          )
          .eq("tasks.company_id", companyId)
          .order("created_at", { ascending: false }),
        // A filing only has an amount to chase once staff have actually
        // finished it — draws from `tasks` (not payment_records) because
        // a payment_records row doesn't exist yet until the notice is
        // sent for the first time.
        supabase.from("tasks").select("id, type, due_date").eq("company_id", companyId).eq("payment_status", "unpaid").eq("status", "done"),
      ]);
      if (cancelled) return;
      if (recordsErr) onError?.(recordsErr.message);
      if (tasksErr) onError?.(tasksErr.message);
      const recordedTaskIds = new Set((recordsData || []).map(r => r.task_id));
      setRecords(recordsData || []);
      setUnnotifiedTasks((tasksData || []).filter(t => !recordedTaskIds.has(t.id)));
      setLoading(false);
    };

    setLoading(true);
    load();
    // No per-company filter on payment_records (unlike the tasks query
    // above) — Postgres realtime filters can't reach through the tasks
    // join, so this just refetches on any change, same as App.jsx's
    // global channels do for tasks/companies.
    const channel = supabase
      .channel(`payment-records-company-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_records" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `company_id=eq.${companyId}` }, load)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  // Starts the daily LINE follow-up (scripts/send-reminders.js) for this
  // filing — staff send the amount to the client themselves in LINE,
  // then mark it sent here so the system knows to start chasing.
  const markNoticeSent = async task => {
    setBusyId(task.id);
    const { error } = await supabase
      .from("payment_records")
      .insert({ task_id: task.id, status: "unpaid", notice_sent_at: new Date().toISOString() });
    setBusyId(null);
    if (error) onError?.(error.message);
  };

  const approve = async (record, amount) => {
    setBusyId(record.id);
    const { error: recordErr } = await supabase.from("payment_records").update({ status: "paid", amount }).eq("id", record.id);
    if (recordErr) {
      onError?.(recordErr.message);
      setBusyId(null);
      return;
    }
    // Keeps the underlying task's own payment_status (used everywhere
    // else in the app — TaskRow, the "unpaid" view, ...) in sync with
    // the slip-approval outcome, so staff never have to flip both by hand.
    const { error: taskErr } = await supabase.from("tasks").update({ payment_status: "paid" }).eq("id", record.task_id);
    if (taskErr) onError?.(taskErr.message);
    setBusyId(null);
    setReviewing(null);
  };

  // Lets staff go back and fill in (or correct) the amount after already
  // approving — the slip/amount review and the approve action don't have
  // to happen in the same click, and the slip stays visible afterward
  // instead of disappearing once status flips to "paid".
  const saveAmount = async (record, amount) => {
    setBusyId(record.id);
    const { error } = await supabase.from("payment_records").update({ amount }).eq("id", record.id);
    setBusyId(null);
    if (error) {
      onError?.(error.message);
      return;
    }
    setReviewing(null);
  };

  // Receipts live in a private bucket as object paths (see 016) — a
  // fresh short-lived signed URL is minted on every click, same pattern
  // as the slip viewer, so nothing stored ever goes stale.
  const openReceipt = async record => {
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(record.receipt_path, 3600);
    if (error || !data) {
      onError?.(`เปิดใบเสร็จไม่สำเร็จ${error ? `: ${error.message}` : ""}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  // The "orphan heal" path: the receipt exists in FlowAccount (document
  // id saved) but its PDF export failed earlier. Re-invoking with just
  // the record id makes the function re-export the PDF only — it never
  // creates a second document.
  const retryReceiptPdf = async record => {
    setBusyId(record.id);
    const { error } = await invokeIssueReceipt({ payment_record_id: record.id });
    setBusyId(null);
    if (error) onError?.(error);
  };

  // Recovery for a false match — line-webhook only attaches images to
  // records staff have already marked "ส่งแจ้งชำระแล้ว" for, but someone
  // in the group can still post an unrelated photo while that's
  // pending. Clears the slip and drops back to 'unpaid' (still awaiting
  // payment — the notice was real, this photo just wasn't the slip for it).
  const dismissSlip = async record => {
    setBusyId(record.id);
    const { error } = await supabase.from("payment_records").update({ status: "unpaid", slip_path: null }).eq("id", record.id);
    setBusyId(null);
    if (error) {
      onError?.(error.message);
      return;
    }
    setReviewing(null);
  };

  if (loading) return <div className="px-4 py-3 text-xs text-slate-400">กำลังโหลดรายการชำระเงิน...</div>;
  if (records.length === 0 && (!canApprove || unnotifiedTasks.length === 0)) return null;

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Receipt size={13} /> การชำระเงิน
      </div>
      <div className="flex flex-col gap-1.5">
        {canApprove &&
          unnotifiedTasks.map(task => (
            <div key={task.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs">
              <span className="font-semibold text-slate-800">{task.type}</span>
              <span className="text-slate-400">ครบกำหนด {formatThaiDate(task.due_date)}</span>
              <button
                onClick={() => markNoticeSent(task)}
                disabled={busyId === task.id}
                className="ml-auto flex items-center gap-1 rounded-md bg-brand-navy px-2 py-1 font-semibold text-white hover:bg-brand-navy-light disabled:opacity-50"
              >
                <Send size={12} /> {busyId === task.id ? "กำลังบันทึก..." : "ส่งแจ้งชำระแล้ว"}
              </button>
            </div>
          ))}

        {records.map(record => {
          const status = STATUS_STYLES[record.status] ?? STATUS_STYLES.unpaid;
          return (
            <div key={record.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <span className="font-semibold text-slate-800">{record.tasks.type}</span>
              <span className="text-slate-400">ครบกำหนด {formatThaiDate(record.tasks.due_date)}</span>
              <span className="font-mono text-slate-500">{formatBaht(record.amount)}</span>
              {record.notice_sent_at && (
                <span className="text-slate-400">แจ้งลูกค้าแล้ว {formatThaiDate(record.notice_sent_at.slice(0, 10))}</span>
              )}
              {record.flowaccount_document_number && (
                <span className="text-slate-400">ใบเสร็จ {record.flowaccount_document_number}</span>
              )}
              <span className={`ml-auto rounded-full px-2 py-0.5 font-semibold ${status.className}`}>{status.label}</span>

              {(record.slip_path || (canApprove && record.status !== "paid")) && (
                <button
                  onClick={() => setReviewing(record)}
                  className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:border-slate-300"
                >
                  <ImageIcon size={12} />
                  {record.slip_path
                    ? record.status === "pending_review"
                      ? "ตรวจสอบสลิป"
                      : "ดูสลิป"
                    : "บันทึกว่าชำระแล้ว"}
                </button>
              )}

              {canApprove && record.status === "paid" && !record.flowaccount_document_id && (
                <button
                  onClick={() => setIssuing(record)}
                  className="flex items-center gap-1 rounded-md bg-brand-navy px-2 py-1 font-semibold text-white hover:bg-brand-navy-light"
                >
                  <FileText size={12} /> ออกใบเสร็จ
                </button>
              )}
              {record.flowaccount_document_id &&
                (record.receipt_path ? (
                  <button
                    onClick={() => openReceipt(record)}
                    className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:border-slate-300"
                  >
                    <FileText size={12} /> ดูใบเสร็จ
                  </button>
                ) : canApprove ? (
                  <button
                    onClick={() => retryReceiptPdf(record)}
                    disabled={busyId === record.id}
                    className="flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                  >
                    <FileText size={12} /> {busyId === record.id ? "กำลังดึง PDF..." : "ดึง PDF ใบเสร็จอีกครั้ง"}
                  </button>
                ) : null)}
            </div>
          );
        })}
      </div>

      {reviewing && (
        <SlipModal
          record={reviewing}
          canApprove={canApprove}
          busy={busyId === reviewing.id}
          onApprove={amount => approve(reviewing, amount)}
          onSaveAmount={amount => saveAmount(reviewing, amount)}
          onDismiss={() => dismissSlip(reviewing)}
          onClose={() => setReviewing(null)}
        />
      )}

      {issuing && <IssueReceiptModal record={issuing} onClose={() => setIssuing(null)} onOpenReceipt={openReceipt} onError={onError} />}
    </div>
  );
}

// Confirmation gate before anything touches FlowAccount: a receipt with
// the wrong amount has to be fixed with a credit note, so staff see the
// computed net (gross minus withholding) side by side with the amount
// read off the actual slip and can catch a mismatch *before* the
// document exists. The 3% rate is the standard withholding on
// accounting service fees paid by juristic clients; individuals don't
// withhold, hence a checkbox rather than always-on.
function IssueReceiptModal({ record, onClose, onOpenReceipt, onError }) {
  const [gross, setGross] = useState(record.amount_gross ?? "");
  const [withholding, setWithholding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null);

  // Prefill from the service type's standing price, but never overwrite
  // a number staff already typed (or a previously saved gross).
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("task_types")
      .select("unit_price")
      .eq("key", record.tasks.type)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || data?.unit_price == null) return;
        setGross(g => (g === "" ? String(data.unit_price) : g));
      });
    return () => {
      cancelled = true;
    };
  }, [record.tasks.type]);

  const grossNum = Number(gross);
  const valid = Number.isFinite(grossNum) && grossNum > 0;
  const whtRate = withholding ? 3 : 0;
  const whtAmount = valid ? round2((grossNum * whtRate) / 100) : 0;
  const net = valid ? round2(grossNum - whtAmount) : null;
  // The one number staff are here to verify — flag loudly when it
  // doesn't match what was recorded off the slip.
  const slipMismatch = valid && record.amount != null && net !== record.amount;

  const issue = async () => {
    setBusy(true);
    const { data, error } = await invokeIssueReceipt({ payment_record_id: record.id, amount_gross: grossNum, wht_rate: whtRate });
    setBusy(false);
    if (error) {
      onError?.(error);
      return;
    }
    setIssued(data);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">ออกใบเสร็จ — {record.tasks.type}</h2>
          <button onClick={onClose} aria-label="ปิด" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {issued ? (
          <div className="flex flex-col gap-3 p-5">
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              ออกใบเสร็จสำเร็จ — เลขที่ {issued.document_number}
            </div>
            <div className="flex justify-end gap-2">
              {issued.receipt_path && (
                <button
                  onClick={() => onOpenReceipt({ receipt_path: issued.receipt_path })}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <FileText size={14} /> ดูใบเสร็จ
                </button>
              )}
              <button onClick={onClose} className="rounded-lg bg-brand-navy px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-light">
                ปิด
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 p-5">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">ค่าบริการเต็ม (ก่อนหัก ณ ที่จ่าย)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={gross}
                  onChange={e => setGross(e.target.value)}
                  placeholder="ยอดเต็มที่จะแสดงบนใบเสร็จ"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={withholding} onChange={e => setWithholding(e.target.checked)} className="accent-brand-navy" />
                หัก ณ ที่จ่าย 3%
              </label>

              <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>หัก ณ ที่จ่าย</span>
                  <span className="font-mono">{formatBaht(whtAmount)}</span>
                </div>
                <div className="mt-1 flex justify-between font-semibold text-slate-800">
                  <span>ยอดสุทธิ (ควรตรงกับสลิป)</span>
                  <span className="font-mono">{net == null ? "—" : formatBaht(net)}</span>
                </div>
                {record.amount != null && (
                  <div className={`mt-1 flex justify-between ${slipMismatch ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                    <span>ยอดตามสลิปที่บันทึกไว้</span>
                    <span className="font-mono">{formatBaht(record.amount)}</span>
                  </div>
                )}
                {slipMismatch && (
                  <div className="mt-2 text-xs font-semibold text-rose-600">
                    ยอดสุทธิไม่ตรงกับสลิป — ตรวจสอบก่อนออกใบเสร็จ เอกสารที่ออกผิดต้องแก้ด้วยใบลดหนี้
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                ยกเลิก
              </button>
              <button
                onClick={issue}
                disabled={!valid || busy}
                className="flex items-center gap-1.5 rounded-lg bg-brand-navy px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-light disabled:opacity-50"
              >
                <FileText size={14} /> {busy ? "กำลังออกใบเสร็จ..." : "ยืนยันออกใบเสร็จ"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// payment_records only stores the Storage object path (permanent) —
// each time the modal opens it mints its own short-lived signed URL
// rather than trusting one saved days or weeks earlier, so there's
// never a stale link for staff to hit (see 013_slip_path_not_url.sql).
function SlipModal({ record, canApprove, busy, onApprove, onSaveAmount, onDismiss, onClose }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [amount, setAmount] = useState(record.amount ?? "");
  const hasSlip = !!record.slip_path;
  const isPending = record.status === "pending_review";
  const isPaid = record.status === "paid";

  // No slip to sign a URL for when staff are closing this out by hand
  // (e.g. several filings paid in one transfer, only one of which had a
  // slip attached by line-webhook — the rest never get a slip_path).
  useEffect(() => {
    if (!hasSlip) return;
    let cancelled = false;
    setImgUrl(null);
    setImgError(false);
    supabase.storage
      .from("payment_slips")
      .createSignedUrl(record.slip_path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) setImgError(true);
        else setImgUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [hasSlip, record.slip_path]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">
            สลิปการชำระเงิน — {record.tasks.type}
          </h2>
          <button onClick={onClose} aria-label="ปิด" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {!hasSlip ? (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-400">
              ไม่มีสลิปแนบ — บันทึกด้วยมือ
            </div>
          ) : imgError ? (
            <div className="flex h-48 items-center justify-center rounded-lg bg-slate-50 px-4 text-center text-sm text-slate-400">
              ไม่สามารถโหลดรูปสลิปได้
            </div>
          ) : !imgUrl ? (
            <div className="flex h-48 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">กำลังโหลดรูป...</div>
          ) : (
            <img
              src={imgUrl}
              alt="สลิปการชำระเงิน"
              onError={() => setImgError(true)}
              className="w-full rounded-lg border border-slate-200"
            />
          )}

          {canApprove && (
            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">ยอดเงินตามสลิป (บาท)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="อ่านยอดจากรูปสลิปด้านบน"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
              />
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            ปิด
          </button>
          {canApprove && hasSlip && isPending && (
            <button
              onClick={onDismiss}
              disabled={busy}
              className="rounded-lg border border-rose-200 px-3.5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              ไม่ใช่สลิป
            </button>
          )}
          {canApprove && !isPaid && (
            <button
              onClick={() => onApprove(amount === "" ? null : Number(amount))}
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "กำลังบันทึก..." : hasSlip ? "อนุมัติการชำระ" : "บันทึกว่าชำระแล้ว"}
            </button>
          )}
          {canApprove && isPaid && (
            <button
              onClick={() => onSaveAmount(amount === "" ? null : Number(amount))}
              disabled={busy}
              className="rounded-lg bg-brand-navy px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-light disabled:opacity-50"
            >
              {busy ? "กำลังบันทึก..." : "บันทึกยอดเงิน"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
