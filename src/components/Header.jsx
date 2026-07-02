import { LogOut, Settings } from "lucide-react";
import MonthTimeline from "./MonthTimeline";
import StatCards from "./StatCards";

const VIEWS = [
  ["urgent", "เรียงตามความด่วน"],
  ["company", "รายบริษัท"],
];

const ROLE_LABEL = { owner: "เจ้าของ", manager: "ผู้จัดการ", employee: "พนักงาน" };

export default function Header({
  today,
  monthLabel,
  monthAbbrev,
  view,
  setView,
  person,
  setPerson,
  people,
  overdue,
  dueSoon,
  doneCount,
  total,
  unpaidCount,
  showUnpaidOnly,
  onToggleUnpaidOnly,
  profile,
  onLogout,
  onOpenAdmin,
}) {
  const canManageUsers = profile && ["owner", "manager"].includes(profile.role);
  const isEmployee = profile?.role === "employee";
  const views = canManageUsers ? [...VIEWS, ["team", "ทีมงาน"]] : VIEWS;

  return (
    <div className="bg-brand-navy shadow-lg">
      <div className="mx-auto max-w-6xl px-4 pt-5 pb-4 sm:px-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.15em] text-brand-gold uppercase">YMTD Accounting</div>
            <h1 className="mt-0.5 text-xl font-bold text-white sm:text-2xl">{monthLabel}</h1>
          </div>
          <div className="flex items-start gap-3">
            <div className="text-right">
              <div className="text-xs text-white/50">วันนี้</div>
              <div className="font-mono text-lg font-bold text-white">{today} {monthAbbrev}</div>
            </div>
            {profile && (
              <div className="flex items-center gap-1 border-l border-white/15 pl-3">
                <div className="mr-1 text-right">
                  <div className="text-xs font-semibold text-white">{profile.label}</div>
                  <div className="text-[11px] text-white/50">{ROLE_LABEL[profile.role]}</div>
                </div>
                {canManageUsers && (
                  <button
                    onClick={onOpenAdmin}
                    aria-label="จัดการผู้ใช้"
                    className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                  >
                    <Settings size={16} />
                  </button>
                )}
                <button onClick={onLogout} aria-label="ออกจากระบบ" className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        <MonthTimeline today={today} />

        <div className="mt-4">
          <StatCards
            overdue={overdue}
            dueSoon={dueSoon}
            doneCount={doneCount}
            total={total}
            unpaidCount={unpaidCount}
            showUnpaidOnly={showUnpaidOnly}
            onToggleUnpaidOnly={onToggleUnpaidOnly}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg bg-white/10 p-1">
            {views.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === k ? "bg-white text-brand-navy shadow-sm" : "text-white/60 hover:text-white"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {isEmployee ? (
            <span className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm font-medium text-white">{person}</span>
          ) : (
            <select
              value={person}
              onChange={e => setPerson(e.target.value)}
              aria-label="กรองตามคนรับผิดชอบ"
              className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm font-medium text-white shadow-sm focus:ring-2 focus:ring-brand-gold focus:outline-none"
            >
              {people.map(p => (
                <option key={p} className="text-slate-900">
                  {p}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
