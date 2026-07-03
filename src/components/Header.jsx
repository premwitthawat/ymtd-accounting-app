import { ChevronLeft, ChevronRight, HelpCircle, LogOut, Search, Settings } from "lucide-react";
import MonthTimeline from "./MonthTimeline";
import StatCards from "./StatCards";

const URGENT_TAB = ["urgent", "เรียงตามความด่วน"];
const UNPAID_TAB = ["unpaid", "รอลูกค้าชำระ"];
const TEAM_TAB = ["team", "ทีมงาน"];
const COMPANY_TAB = ["company", "รายบริษัท"];

const ROLE_LABEL = { owner: "เจ้าของ", manager: "ผู้จัดการ", employee: "พนักงาน" };

export default function Header({
  today,
  monthLabel,
  monthAbbrev,
  isCurrentPeriod,
  onPrevMonth,
  onNextMonth,
  onGoToCurrent,
  view,
  setView,
  person,
  setPerson,
  people,
  search,
  setSearch,
  overdue,
  dueSoon,
  doneCount,
  total,
  unpaidCount,
  profile,
  onLogout,
  onOpenAdmin,
  onOpenHelp,
}) {
  const canManageUsers = profile && ["owner", "manager"].includes(profile.role);
  const isEmployee = profile?.role === "employee";
  const views = [URGENT_TAB, UNPAID_TAB, ...(canManageUsers ? [TEAM_TAB] : []), COMPANY_TAB];

  return (
    <div className="bg-brand-navy shadow-lg">
      <div className="mx-auto max-w-6xl px-4 pt-5 pb-4 sm:px-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.15em] text-brand-gold uppercase">YMTD Accounting</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <button
                onClick={onPrevMonth}
                aria-label="เดือนก่อนหน้า"
                className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft size={18} />
              </button>
              <h1 className="text-xl font-bold text-white sm:text-2xl">{monthLabel}</h1>
              <button
                onClick={onNextMonth}
                disabled={isCurrentPeriod}
                aria-label="เดือนถัดไป"
                className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight size={18} />
              </button>
              {!isCurrentPeriod && (
                <div className="ml-2 flex items-center gap-2">
                  <span className="rounded-full bg-brand-gold/20 px-2 py-0.5 text-[11px] font-semibold text-brand-gold">
                    ดูย้อนหลัง · อ่านอย่างเดียว
                  </span>
                  <button onClick={onGoToCurrent} className="text-[11px] font-semibold text-white/60 underline hover:text-white">
                    กลับเดือนปัจจุบัน
                  </button>
                </div>
              )}
            </div>
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
                <button
                  onClick={onOpenHelp}
                  aria-label="คู่มือการใช้งาน"
                  className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <HelpCircle size={16} />
                </button>
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

        <MonthTimeline today={today} isCurrentPeriod={isCurrentPeriod} />

        <div className="mt-4">
          <StatCards
            overdue={overdue}
            dueSoon={dueSoon}
            doneCount={doneCount}
            total={total}
            unpaidCount={unpaidCount}
            unpaidActive={view === "unpaid"}
            onClickUnpaid={() => setView("unpaid")}
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
          <div className="relative min-w-0 flex-1 max-w-xs">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาบริษัท..."
              aria-label="ค้นหาบริษัท"
              className="w-full rounded-lg border border-white/20 bg-white/10 py-1.5 pr-3 pl-8 text-sm text-white placeholder:text-white/40 shadow-sm focus:border-brand-gold focus:ring-1 focus:ring-brand-gold focus:outline-none"
            />
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
