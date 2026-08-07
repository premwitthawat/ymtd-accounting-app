import { useEffect, useState } from "react";
import { FileText, Plus, Trash2, MessageCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { invokeFunction } from "../lib/functions";

const STATUS_STYLES = {
  unpaid: { label: "รอชำระ", className: "bg-slate-100 text-slate-600" },
  paid: { label: "ชำระแล้ว", className: "bg-emerald-100 text-emerald-700" },
};

const periodLabel = period => {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "short", year: "numeric" }).format(new Date(y, m - 1, 1));
};

const formatBaht = n => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(n);

const currentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const nextPeriod = period => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Monthly service-fee invoices for one company: history of what the
// 1st-of-month run issued, the mark-paid action (which auto-issues the
// receipt server-side — see flowaccount-invoices), and the queue of
// one-off extras for the next un-invoiced month. Fetches its own data
// for the same reason CompanyPaymentRecords does: it only matters once
// a company card is expanded.
export default function CompanyInvoices({ companyId, monthlyFee, canApprove, onError }) {
  const [invoices, setInvoices] = useState([]);
  const [extras, setExtras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newExtra, setNewExtra] = useState({ description: "", amount: "" });

  // Extras attach to the next month whose invoice doesn't exist yet:
  // normally next month (this month's went out on the 1st), but this
  // month itself right after a company is created mid-month.
  const invoicedPeriods = new Set(invoices.map(i => i.period));
  const targetPeriod = invoicedPeriods.has(currentPeriod()) ? nextPeriod(currentPeriod()) : currentPeriod();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [{ data: invoicesData, error: invoicesErr }, { data: extrasData, error: extrasErr }] = await Promise.all([
        supabase.from("company_invoices").select("*").eq("company_id", companyId).order("period", { ascending: false }).limit(6),
        supabase.from("invoice_extras").select("*").eq("company_id", companyId).order("created_at"),
      ]);
      if (cancelled) return;
      if (invoicesErr) onError?.(invoicesErr.message);
      if (extrasErr) onError?.(extrasErr.message);
      setInvoices(invoicesData || []);
      setExtras(extrasData || []);
      setLoading(false);
    };
    setLoading(true);
    load();
    const channel = supabase
      .channel(`company-invoices-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_invoices", filter: `company_id=eq.${companyId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_extras", filter: `company_id=eq.${companyId}` }, load)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const openPdf = async (bucket, path) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error || !data) {
      onError?.(`เปิดเอกสารไม่สำเร็จ${error ? `: ${error.message}` : ""}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  // Server-side this both records the payment and issues the receipt —
  // one click, because the amounts were already fixed when the invoice
  // went out. Repeat clicks are safe (heal/idempotent on the function).
  const markPaid = async invoice => {
    setBusyId(invoice.id);
    const { error } = await invokeFunction("flowaccount-invoices", { action: "mark-paid", invoice_id: invoice.id });
    setBusyId(null);
    if (error) onError?.(error);
  };

  const addExtra = async e => {
    e.preventDefault();
    const description = newExtra.description.trim();
    const amount = Number(newExtra.amount);
    if (!description || !Number.isFinite(amount) || amount <= 0) return;
    const { error } = await supabase.from("invoice_extras").insert({ company_id: companyId, period: targetPeriod, description, amount });
    if (error) {
      onError?.(error.message);
      return;
    }
    setNewExtra({ description: "", amount: "" });
    setAdding(false);
  };

  const removeExtra = async extra => {
    const { error } = await supabase.from("invoice_extras").delete().eq("id", extra.id);
    if (error) onError?.(error.message);
  };

  const targetExtras = extras.filter(x => x.period === targetPeriod);

  if (loading) return null;
  // Nothing to show and nothing configurable: a company that isn't
  // auto-billed and has no history keeps its card clean.
  if (invoices.length === 0 && !monthlyFee && !canApprove) return null;

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <FileText size={13} /> ใบแจ้งหนี้รายเดือน
        {!monthlyFee && (
          <span className="font-normal text-slate-400">— ยังไม่ได้ตั้งค่าบริการรายเดือน (ตั้งได้ที่หน้าแก้ไขบริษัท)</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {invoices.map(invoice => {
          const status = STATUS_STYLES[invoice.status] ?? STATUS_STYLES.unpaid;
          const receiptPending = invoice.status === "paid" && !invoice.receipt_path;
          return (
            <div key={invoice.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <span className="font-semibold text-slate-800">{periodLabel(invoice.period)}</span>
              {invoice.flowaccount_document_number && <span className="text-slate-400">{invoice.flowaccount_document_number}</span>}
              <span className="font-mono text-slate-500">{formatBaht(invoice.amount_gross)}</span>
              {invoice.wht_amount > 0 && <span className="text-slate-400">ชำระสุทธิ {formatBaht(invoice.amount_due)}</span>}
              {invoice.line_pushed_at && (
                <span className="flex items-center gap-0.5 text-slate-400" title="ส่งเข้ากลุ่ม LINE แล้ว">
                  <MessageCircle size={11} /> ส่งแล้ว
                </span>
              )}
              <span className={`ml-auto rounded-full px-2 py-0.5 font-semibold ${status.className}`}>{status.label}</span>

              {invoice.invoice_path && (
                <button
                  onClick={() => openPdf("invoices", invoice.invoice_path)}
                  className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:border-slate-300"
                >
                  <FileText size={12} /> ใบแจ้งหนี้
                </button>
              )}

              {canApprove && invoice.status === "unpaid" && (
                <button
                  onClick={() => markPaid(invoice)}
                  disabled={busyId === invoice.id}
                  className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busyId === invoice.id ? "กำลังออกใบเสร็จ..." : "รับชำระแล้ว"}
                </button>
              )}

              {invoice.receipt_path && (
                <button
                  onClick={() => openPdf("receipts", invoice.receipt_path)}
                  className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:border-slate-300"
                >
                  <FileText size={12} /> ใบเสร็จ {invoice.receipt_document_number}
                </button>
              )}
              {canApprove && receiptPending && (
                <button
                  onClick={() => markPaid(invoice)}
                  disabled={busyId === invoice.id}
                  className="flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                >
                  {busyId === invoice.id ? "กำลังดึง PDF..." : "ดึงใบเสร็จอีกครั้ง"}
                </button>
              )}
            </div>
          );
        })}

        {invoices.length === 0 && monthlyFee > 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-400">
            ระบบจะออกใบแจ้งหนี้ {formatBaht(monthlyFee)} อัตโนมัติทุกเช้าวันที่ 1 และส่งเข้ากลุ่ม LINE ของบริษัทนี้
          </div>
        )}

        {canApprove && (monthlyFee > 0 || targetExtras.length > 0) && (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs">
            <div className="mb-1 font-semibold text-slate-500">รายการพิเศษ รอบบิล {periodLabel(targetPeriod)}</div>
            {targetExtras.length === 0 && !adding && <div className="text-slate-400">ไม่มี — ค่าบริการรายเดือนตามปกติ</div>}
            {targetExtras.map(extra => (
              <div key={extra.id} className="flex items-center gap-2 py-0.5">
                <span className="text-slate-700">{extra.description}</span>
                <span className="ml-auto font-mono text-slate-500">{formatBaht(extra.amount)}</span>
                <button
                  onClick={() => removeExtra(extra)}
                  aria-label={`ลบ ${extra.description}`}
                  className="rounded p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {adding ? (
              <form onSubmit={addExtra} className="mt-1.5 flex items-center gap-1.5">
                <input
                  value={newExtra.description}
                  onChange={e => setNewExtra(x => ({ ...x, description: e.target.value }))}
                  placeholder="เช่น ค่าปิดงบประจำปี"
                  className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 focus:border-brand-navy focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newExtra.amount}
                  onChange={e => setNewExtra(x => ({ ...x, amount: e.target.value }))}
                  placeholder="บาท"
                  className="w-20 rounded-md border border-slate-200 px-2 py-1 focus:border-brand-navy focus:outline-none"
                />
                <button type="submit" className="rounded-md bg-brand-navy px-2 py-1 font-semibold text-white">
                  เพิ่ม
                </button>
                <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-500">
                  ยกเลิก
                </button>
              </form>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="mt-1 flex items-center gap-1 font-semibold text-brand-navy hover:underline"
              >
                <Plus size={12} /> เพิ่มรายการพิเศษ
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
