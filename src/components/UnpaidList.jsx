export default function UnpaidList({ tasks, onMarkPaid }) {
  const sorted = [...tasks].sort((a, b) => a.company.localeCompare(b.company, "th"));

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">
        ไม่มีรายการรอลูกค้าชำระ
      </div>
    );
  }

  return (
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
  );
}
