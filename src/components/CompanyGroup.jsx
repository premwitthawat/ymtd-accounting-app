import { ChevronDown } from "lucide-react";
import CompanyCard from "./CompanyCard";

export default function CompanyGroup({
  owner,
  rows,
  open,
  onToggleOpen,
  todayDate,
  openCompanyId,
  onToggleCompany,
  onToggle,
  onSkip,
  onRestore,
  onEdit,
  onSetPaymentStatus,
  onSetDueDate,
  onSetOwner,
}) {
  const totalOver = rows.reduce((sum, c) => sum + c.over, 0);
  const totalDone = rows.reduce((sum, c) => sum + c.done, 0);
  const totalAll = rows.reduce((sum, c) => sum + c.total, 0);

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button onClick={onToggleOpen} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          {owner}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{rows.length} บริษัท</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {totalOver > 0 && <span className="font-bold text-rose-600">เลยกำหนด {totalOver}</span>}
          <span className="font-mono">{totalDone}/{totalAll}</span>
          <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50 p-2">
          {rows.map(c => (
            <CompanyCard
              key={c.id}
              c={c}
              todayDate={todayDate}
              open={openCompanyId === c.id}
              onToggleOpen={() => onToggleCompany(c.id)}
              onToggle={onToggle}
              onSkip={onSkip}
              onRestore={onRestore}
              onEdit={onEdit}
              onSetPaymentStatus={onSetPaymentStatus}
              onSetDueDate={onSetDueDate}
              onSetOwner={onSetOwner}
            />
          ))}
        </div>
      )}
    </div>
  );
}
