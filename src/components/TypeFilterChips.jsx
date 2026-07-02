import { DEFAULT_TYPE_STYLE } from "../data/tasks";
import { useTaskTypes } from "../lib/TaskTypesContext";

export default function TypeFilterChips({ typeCounts, typeFilter, setTypeFilter }) {
  const taskTypes = useTaskTypes();
  const totalCount = Object.values(typeCounts).reduce((sum, n) => sum + n, 0);
  const knownTypes = Object.keys(taskTypes).filter(t => typeCounts[t]);
  const customTypes = Object.keys(typeCounts).filter(t => !taskTypes[t]);
  const orderedTypes = [...knownTypes, ...customTypes];

  return (
    <nav className="flex shrink-0 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2 sm:w-52">
      <button
        onClick={() => setTypeFilter(null)}
        className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
          !typeFilter ? "bg-brand-navy text-white" : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        <span>ทั้งหมด</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            !typeFilter ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {totalCount}
        </span>
      </button>

      {orderedTypes.map(t => {
        const type = taskTypes[t] || DEFAULT_TYPE_STYLE;
        const active = typeFilter === t;
        return (
          <button
            key={t}
            onClick={() => setTypeFilter(active ? null : t)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              active ? `${type.bg} text-white` : `text-slate-600 hover:bg-slate-50`
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-white" : type.bg}`} />
              {t}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {typeCounts[t]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
