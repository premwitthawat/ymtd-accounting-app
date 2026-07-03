import { DEADLINE_MARKERS } from "../data/tasks";

const TICKS = [5, 10, 15, 20, 25, 30];
const MONTH_SCALE = 31;

export default function MonthTimeline({ today, isCurrentPeriod = true }) {
  return (
    <div className="relative mt-5 h-9">
      <div className="absolute top-3 right-0 left-0 h-1.5 rounded-full bg-white/15" />

      {TICKS.map(d => (
        <span
          key={d}
          className="absolute top-4 -translate-x-1/2 font-mono text-[10px] text-white/40"
          style={{ left: `${(d / MONTH_SCALE) * 100}%` }}
        >
          {d}
        </span>
      ))}

      {DEADLINE_MARKERS.map(({ day, color, label }) => (
        <div
          key={day}
          className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${(day / MONTH_SCALE) * 100}%` }}
        >
          <span className="mb-0.5 whitespace-nowrap text-[9px] font-medium leading-none text-white/50">{label}</span>
          <div className={`h-3 w-1.5 rounded-sm ${color}`} />
        </div>
      ))}

      {isCurrentPeriod && (
        <div
          className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${(today / MONTH_SCALE) * 100}%` }}
        >
          <div className="h-9 w-0.5 bg-brand-gold" />
          <span className="relative -mt-1.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-gold opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-gold ring-2 ring-brand-navy" />
          </span>
        </div>
      )}
    </div>
  );
}
