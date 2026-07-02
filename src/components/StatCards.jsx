import { AlertTriangle, Clock, CheckCircle2, Banknote } from "lucide-react";

const TONES = {
  rose: { icon: "text-rose-600", iconBg: "bg-rose-50", value: "text-rose-600" },
  amber: { icon: "text-amber-600", iconBg: "bg-amber-50", value: "text-amber-600" },
  emerald: { icon: "text-emerald-600", iconBg: "bg-emerald-50", value: "text-emerald-600" },
  neutral: { icon: "text-slate-400", iconBg: "bg-slate-100", value: "text-slate-500" },
};

function StatCard({ label, value, icon: Icon, tone, muted, onClick, active }) {
  const t = TONES[muted ? "neutral" : tone];
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl border bg-white p-3 text-left shadow-sm transition-colors sm:gap-3 ${
        active ? "border-brand-navy ring-2 ring-brand-navy/20" : "border-slate-200"
      } ${onClick ? "hover:border-slate-300" : ""}`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.iconBg}`}>
        <Icon size={18} className={t.icon} />
      </div>
      <div className="min-w-0">
        <div className={`font-mono text-lg font-bold leading-tight ${t.value}`}>{value}</div>
        <div className="text-[11px] leading-tight font-medium text-slate-500">{label}</div>
      </div>
    </Wrapper>
  );
}

export default function StatCards({ overdue, dueSoon, doneCount, total, unpaidCount, unpaidActive, onClickUnpaid }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      <StatCard label="เลยกำหนด" value={overdue} icon={AlertTriangle} tone="rose" muted={overdue === 0} />
      <StatCard label="ครบใน 3 วัน" value={dueSoon} icon={Clock} tone="amber" muted={dueSoon === 0} />
      <StatCard label="เสร็จแล้ว" value={`${doneCount}/${total}`} icon={CheckCircle2} tone="emerald" />
      <StatCard
        label="รอลูกค้าชำระ"
        value={unpaidCount}
        icon={Banknote}
        tone="amber"
        muted={unpaidCount === 0}
        onClick={onClickUnpaid}
        active={unpaidActive}
      />
    </div>
  );
}
