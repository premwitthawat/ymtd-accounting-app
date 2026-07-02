import { useState, useMemo } from "react";

// ---------- ข้อมูลตั้งต้น (จากไฟล์ _List_Work.xlsx ของจริง) ----------
const TASK_TYPES = {
  "ภงด.1":   { dueDay: 15, phase: 2, color: "#3B5BA5" },
  "ภงด.3":   { dueDay: 15, phase: 2, color: "#3B5BA5" },
  "ภงด.53":  { dueDay: 15, phase: 2, color: "#3B5BA5" },
  "ภพ.36":   { dueDay: 15, phase: 2, color: "#7A4FA3" },
  "กยศ.":    { dueDay: 15, phase: 2, color: "#4E7A3B" },
  "สปส.":    { dueDay: 22, phase: 3, color: "#B06A22" },
  "ภพ.30":   { dueDay: 23, phase: 3, color: "#8A3B3B" },
  "ใบหัก ณ ที่จ่าย": { dueDay: 10, phase: 1, color: "#5A6B7A" },
  "ประมาณการกำไรขาดทุน": { dueDay: 20, phase: 3, color: "#5A6B7A" },
};

const COMPANIES = [
  { id: 1,  name: "หจก.ส.เจริญ ซัพพลาย 2015",        short: "ส.เจริญ 2015",  owner: "เปรม", tasks: ["ภงด.1","ภงด.3","ภงด.53","ภพ.30"] },
  { id: 2,  name: "บจ.ส.เจริญ ซัพพลาย 2018",         short: "ส.เจริญ 2018",  owner: "เปรม", tasks: ["ภงด.1","ภงด.3","ภงด.53","ภพ.30"] },
  { id: 3,  name: "ไดมอนด์ อินเตอร์ฯ วีซ่า แอนด์ ทราเวล", short: "ไดมอนด์",       owner: "ต๋อง", tasks: ["ภงด.1","ภงด.3","ภงด.53","สปส."] },
  { id: 4,  name: "บจ.สารภี ช. คอน",                  short: "สารภี ช.คอน",   owner: "เปรม", tasks: ["ภงด.1","ภงด.3","ภงด.53","สปส."] },
  { id: 5,  name: "บจ.โอที กรุ๊ป (เชียงใหม่)",         short: "โอที กรุ๊ป",     owner: "ต๋อง", tasks: ["ภงด.1","ภงด.3","ภงด.53","สปส.","ภพ.30","ภพ.36","กยศ."] },
  { id: 6,  name: "หจก.นอร์ตไซต์ เอ็นจิเนียริ่ง",       short: "นอร์ตไซต์",     owner: "ต๋อง", tasks: ["ภงด.1","ภงด.3","ภงด.53","สปส.","ภพ.30","ประมาณการกำไรขาดทุน"] },
  { id: 7,  name: "103 คอนโดมิเนียม 2",               short: "103 คอนโด",     owner: "ต๋อง", tasks: ["ภงด.1","ภงด.3","ภงด.53","ใบหัก ณ ที่จ่าย"] },
  { id: 8,  name: "บจ.เฮียหมา คาร์เร้นท์ 4289",        short: "เฮียหมา",       owner: "เปรม", tasks: ["ภงด.1","ภงด.3","ภงด.53","สปส.","ภพ.30"] },
  { id: 9,  name: "บจ.เจทูเค ไบค์ เรนทอล (j2k)",       short: "j2k",           owner: "ต๋อง", tasks: ["ภงด.53","สปส."] },
  { id: 10, name: "บจ.วายเอ็มทีดี การบัญชี พาร์ทเนอร์", short: "วายเอ็มทีดี",   owner: "เปรม", tasks: ["ภงด.1","ภงด.3","ภงด.53","สปส."] },
  { id: 11, name: "ฟาส์ทลุค",                          short: "ฟาส์ทลุค",      owner: "เปรม", tasks: ["ภงด.1","ภงด.3","ภงด.53","สปส.","ภพ.30"] },
  { id: 12, name: "บจ.พีวาย คอนสตรัคชั่น 2566",        short: "พีวาย คอนฯ",    owner: "ต๋อง", tasks: ["ภพ.30"] },
];

// สถานะเริ่มต้น: จำลองว่าเดือนนี้ทำไปแล้วบางส่วน (เหมือนกลางเดือนจริง)
const PRE_DONE = new Set(["1-ภงด.1","1-ภงด.53","2-ภงด.1","2-ภงด.3","2-ภงด.53","3-ภงด.1","5-ภงด.1","5-กยศ.","4-ภงด.1","4-ภงด.3","10-ภงด.1","7-ใบหัก ณ ที่จ่าย"]);
const PRE_SKIP = { "1-ภงด.3": "ไม่มีรายการเดือนนี้", "8-ภงด.3": "ไม่มีรายการเดือนนี้", "8-ภงด.53": "ไม่มีรายการเดือนนี้", "5-ภพ.36": "ไม่มีรายการเดือนนี้" };

function buildTasks() {
  const list = [];
  COMPANIES.forEach(c => c.tasks.forEach(t => {
    const key = `${c.id}-${t}`;
    list.push({
      key, companyId: c.id, company: c.short, owner: c.owner, type: t,
      dueDay: TASK_TYPES[t].dueDay, phase: TASK_TYPES[t].phase,
      status: PRE_DONE.has(key) ? "done" : PRE_SKIP[key] ? "skipped" : "pending",
      note: PRE_SKIP[key] || "",
    });
  }));
  return list;
}

const PHASE_LABEL = { 1: "ช่วงเตรียมเอกสาร", 2: "หัก ณ ที่จ่าย + กยศ. (ยื่นออนไลน์ถึง 15)", 3: "สปส. / ภพ.30 (ถึง 22–23)" };
const PEOPLE = ["ทุกคน", "เปรม", "ต๋อง"];

export default function App() {
  const [tasks, setTasks] = useState(buildTasks);
  const [today, setToday] = useState(13);
  const [view, setView] = useState("urgent");
  const [person, setPerson] = useState("ทุกคน");
  const [typeFilter, setTypeFilter] = useState(null);
  const [openCompany, setOpenCompany] = useState(null);

  const setStatus = (key, status, note = "") =>
    setTasks(ts => ts.map(t => t.key === key ? { ...t, status, note: note || (status === "skipped" ? "ไม่มีรายการเดือนนี้" : "") } : t));

  const toggle = (t) => setStatus(t.key, t.status === "done" ? "pending" : "done");

  const visible = useMemo(() => tasks.filter(t =>
    (person === "ทุกคน" || t.owner === person) && (!typeFilter || t.type === typeFilter)
  ), [tasks, person, typeFilter]);

  const pending = visible.filter(t => t.status === "pending");
  const overdue = pending.filter(t => t.dueDay < today);
  const dueSoon = pending.filter(t => t.dueDay >= today && t.dueDay - today <= 3);
  const doneCount = visible.filter(t => t.status !== "pending").length;

  const urgency = (t) => t.dueDay < today ? "over" : t.dueDay - today <= 3 ? "soon" : "ok";
  const uStyle = {
    over: { bar: "#C6362B", bg: "#FCEEEC", label: (d) => `เลยกำหนด ${today - d} วัน` },
    soon: { bar: "#B97A0F", bg: "#FBF4E4", label: (d) => d === today ? "ครบกำหนดวันนี้" : `เหลือ ${d - today} วัน` },
    ok:   { bar: "#C9D2CC", bg: "#FFFFFF", label: (d) => `กำหนดวันที่ ${d}` },
  };

  const groups = useMemo(() => {
    const g = {};
    pending.forEach(t => { (g[t.dueDay] = g[t.dueDay] || []).push(t); });
    return Object.entries(g).sort((a, b) => a[0] - b[0]);
  }, [pending]);

  const markGroupDone = (dayTasks) =>
    setTasks(ts => ts.map(t => dayTasks.some(d => d.key === t.key) ? { ...t, status: "done" } : t));

  const typeCounts = useMemo(() => {
    const c = {};
    tasks.filter(t => t.status === "pending" && (person === "ทุกคน" || t.owner === person))
      .forEach(t => c[t.type] = (c[t.type] || 0) + 1);
    return c;
  }, [tasks, person]);

  const companyRows = useMemo(() => COMPANIES
    .filter(c => person === "ทุกคน" || c.owner === person)
    .map(c => {
      const ct = tasks.filter(t => t.companyId === c.id);
      const done = ct.filter(t => t.status !== "pending").length;
      const over = ct.filter(t => t.status === "pending" && t.dueDay < today).length;
      return { ...c, ct, done, total: ct.length, over };
    }), [tasks, person, today]);

  const Row = ({ t, showCompany = true }) => {
    const u = uStyle[urgency(t)];
    const done = t.status === "done", skipped = t.status === "skipped";
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 border-b" style={{ borderColor: "#E4E9E6", background: done || skipped ? "#F6F8F7" : u.bg }}>
        <button onClick={() => toggle(t)} aria-label={done ? "ยกเลิกเสร็จ" : "ทำเสร็จ"}
          className="w-6 h-6 rounded flex items-center justify-center shrink-0 border-2 transition-colors"
          style={{ borderColor: done ? "#0E7C5B" : "#9AA8A0", background: done ? "#0E7C5B" : "transparent" }}>
          {done && <span className="text-white text-sm leading-none">✓</span>}
          {skipped && <span style={{ color: "#9AA8A0" }} className="text-xs leading-none">—</span>}
        </button>
        <div className="flex-1 min-w-0" style={{ opacity: done || skipped ? 0.5 : 1 }}>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-bold px-1.5 py-0.5 rounded text-white shrink-0" style={{ background: TASK_TYPES[t.type].color }}>{t.type}</span>
            {showCompany && <span className="text-sm font-medium truncate" style={{ color: "#1B2A41", textDecoration: done ? "line-through" : "none" }}>{t.company}</span>}
          </div>
          <div className="text-xs mt-0.5" style={{ color: skipped ? "#9AA8A0" : urgency(t) === "over" ? "#C6362B" : "#6B7A72", fontWeight: urgency(t) === "over" ? 700 : 400 }}>
            {skipped ? `ข้าม · ${t.note}` : done ? "เสร็จแล้ว" : `${u.label(t.dueDay)} · ${t.owner}`}
          </div>
        </div>
        {!done && !skipped &&
          <button onClick={() => setStatus(t.key, "skipped")} className="text-xs px-2 py-1 rounded border shrink-0" style={{ color: "#6B7A72", borderColor: "#C9D2CC" }}>ข้าม</button>}
        {skipped &&
          <button onClick={() => setStatus(t.key, "pending")} className="text-xs px-2 py-1 rounded border shrink-0" style={{ color: "#6B7A72", borderColor: "#C9D2CC" }}>คืนค่า</button>}
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: "#EFF2EF", fontFamily: "'IBM Plex Sans Thai','Noto Sans Thai',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');`}</style>

      <div className="sticky top-0 z-10 shadow-sm" style={{ background: "#1B2A41" }}>
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs tracking-widest font-semibold" style={{ color: "#8FA3C0" }}>YMTD ACCOUNTING</div>
              <h1 className="text-white text-lg font-bold">งานประจำเดือน มิ.ย. 2569</h1>
            </div>
            <div className="text-right">
              <div className="text-xs" style={{ color: "#8FA3C0" }}>วันนี้</div>
              <div className="text-white font-bold" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{today} ก.ค.</div>
            </div>
          </div>

          <div className="mt-3 relative h-9 rounded" style={{ background: "#22344F" }}>
            {[5, 10, 15, 20, 25, 30].map(d =>
              <span key={d} className="absolute top-0.5 text-[10px]" style={{ left: `${(d / 31) * 100}%`, color: "#5C7192", fontFamily: "'IBM Plex Mono',monospace" }}>{d}</span>)}
            {[["15", "#3B5BA5", "ภงด./กยศ."], ["22", "#B06A22", "สปส."], ["23", "#8A3B3B", "ภพ.30"]].map(([d, c, l]) =>
              <div key={d} className="absolute bottom-0.5 flex flex-col items-center" style={{ left: `${(d / 31) * 100}%`, transform: "translateX(-50%)" }}>
                <span className="text-[9px] leading-none mb-0.5" style={{ color: "#AAB8CC" }}>{l}</span>
                <div className="w-1.5 h-3 rounded-sm" style={{ background: c }} />
              </div>)}
            <div className="absolute -bottom-1 flex flex-col items-center" style={{ left: `${(today / 31) * 100}%`, transform: "translateX(-50%)" }}>
              <div className="w-0.5 h-9" style={{ background: "#F5C64B" }} />
              <div className="w-2 h-2 rounded-full -mt-1" style={{ background: "#F5C64B" }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            {[['เลยกำหนด', overdue.length, '#FF8A7A'], ['ครบใน 3 วัน', dueSoon.length, '#F5C64B'], ['เสร็จแล้ว', `${doneCount}/${visible.length}`, '#7BD8B0']].map(([l, v, c]) =>
              <div key={l} className="rounded px-3 py-2" style={{ background: "#22344F" }}>
                <div className="text-lg font-bold leading-tight" style={{ color: c, fontFamily: "'IBM Plex Mono',monospace" }}>{v}</div>
                <div className="text-[11px]" style={{ color: "#8FA3C0" }}>{l}</div>
              </div>)}
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-1">
              {[['urgent', 'เรียงตามความด่วน'], ['company', 'รายบริษัท']].map(([k, l]) =>
                <button key={k} onClick={() => setView(k)} className="text-sm px-3 py-1.5 rounded-t font-medium"
                  style={{ background: view === k ? "#EFF2EF" : "transparent", color: view === k ? "#1B2A41" : "#8FA3C0" }}>{l}</button>)}
            </div>
            <select value={person} onChange={e => setPerson(e.target.value)} aria-label="กรองตามคนรับผิดชอบ"
              className="text-sm rounded px-2 py-1 font-medium" style={{ background: "#22344F", color: "#fff", border: "1px solid #3A4E6E" }}>
              {PEOPLE.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {view === "urgent" && <>
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
            <button onClick={() => setTypeFilter(null)} className="text-xs px-2.5 py-1.5 rounded-full whitespace-nowrap font-medium border"
              style={{ background: !typeFilter ? "#1B2A41" : "#fff", color: !typeFilter ? "#fff" : "#1B2A41", borderColor: "#1B2A41" }}>ทั้งหมด</button>
            {Object.keys(TASK_TYPES).filter(t => typeCounts[t]).map(t =>
              <button key={t} onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                className="text-xs px-2.5 py-1.5 rounded-full whitespace-nowrap font-medium border"
                style={{ background: typeFilter === t ? TASK_TYPES[t].color : "#fff", color: typeFilter === t ? "#fff" : TASK_TYPES[t].color, borderColor: TASK_TYPES[t].color }}>
                {t} · {typeCounts[t]}</button>)}
          </div>

          {groups.length === 0 &&
            <div className="text-center py-14 rounded-lg bg-white border" style={{ borderColor: "#E4E9E6" }}>
              <div className="text-3xl mb-2">🎉</div>
              <div className="font-bold" style={{ color: "#0E7C5B" }}>ไม่มีงานค้าง{typeFilter ? `ประเภท ${typeFilter}` : ""}{person !== "ทุกคน" ? `ของ${person}` : ""}</div>
              <div className="text-sm mt-1" style={{ color: "#6B7A72" }}>ปิดเดือนนี้ได้เลย</div>
            </div>}

          {groups.map(([day, dayTasks]) => {
            const u = uStyle[+day < today ? "over" : +day - today <= 3 ? "soon" : "ok"];
            return (
              <div key={day} className="mb-4 rounded-lg overflow-hidden bg-white border" style={{ borderColor: "#E4E9E6" }}>
                <div className="flex items-center justify-between px-3 py-2" style={{ background: "#F3F6F4", borderLeft: `4px solid ${u.bar}` }}>
                  <div className="text-sm font-bold" style={{ color: "#1B2A41" }}>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{day} ก.ค.</span>
                    <span className="font-medium ml-2 text-xs" style={{ color: "#6B7A72" }}>{PHASE_LABEL[dayTasks[0].phase]} · ค้าง {dayTasks.length}</span>
                  </div>
                  <button onClick={() => markGroupDone(dayTasks)} className="text-xs font-semibold px-2.5 py-1 rounded"
                    style={{ background: "#0E7C5B", color: "#fff" }}>เสร็จทั้งกลุ่ม</button>
                </div>
                {dayTasks.sort((a, b) => a.company.localeCompare(b.company, "th")).map(t => <Row key={t.key} t={t} />)}
              </div>);
          })}
        </>}

        {view === "company" && companyRows.map(c => {
          const pct = Math.round((c.done / c.total) * 100);
          const open = openCompany === c.id;
          return (
            <div key={c.id} className="mb-2 rounded-lg overflow-hidden bg-white border" style={{ borderColor: c.over ? "#E8B4AD" : "#E4E9E6" }}>
              <button onClick={() => setOpenCompany(open ? null : c.id)} className="w-full text-left px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold truncate" style={{ color: "#1B2A41" }}>{c.short}</span>
                  <span className="text-xs shrink-0" style={{ color: "#6B7A72" }}>
                    {c.over > 0 && <span className="font-bold mr-2" style={{ color: "#C6362B" }}>เลยกำหนด {c.over}</span>}
                    {c.owner} · <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{c.done}/{c.total}</span>
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full" style={{ background: "#E4E9E6" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#0E7C5B" : c.over ? "#C6362B" : "#3B5BA5" }} />
                </div>
              </button>
              {open && <div className="border-t" style={{ borderColor: "#E4E9E6" }}>
                {c.ct.sort((a, b) => a.dueDay - b.dueDay).map(t => <Row key={t.key} t={t} showCompany={false} />)}
              </div>}
            </div>);
        })}

        <div className="mt-6 rounded-lg p-3 border border-dashed" style={{ borderColor: "#9AA8A0", background: "#F6F8F7" }}>
          <div className="flex items-center justify-between text-xs font-semibold" style={{ color: "#6B7A72" }}>
            <span>🔧 โหมดทดลอง: เลื่อนดูว่าแต่ละวันของเดือน หน้าจอเปลี่ยนยังไง</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{today} ก.ค.</span>
          </div>
          <input type="range" min={1} max={31} value={today} onChange={e => setToday(+e.target.value)}
            className="w-full mt-2" aria-label="จำลองวันที่" />
        </div>
      </div>
    </div>
  );
}
