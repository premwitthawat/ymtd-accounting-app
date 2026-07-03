import { useState, useMemo, useEffect, useCallback } from "react";
import { Plus, List, LayoutGrid } from "lucide-react";
import { PEOPLE, TYPE_PALETTE } from "./data/tasks";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./lib/auth";
import { TaskTypesProvider } from "./lib/TaskTypesContext";
import { getUrgency, parseDate } from "./lib/urgency";
import Header from "./components/Header";
import LoginScreen from "./components/LoginScreen";
import AdminUsersPanel from "./components/AdminUsersPanel";
import HelpGuideModal from "./components/HelpGuideModal";
import TypeFilterChips from "./components/TypeFilterChips";
import DayGroup from "./components/DayGroup";
import CompanyCard from "./components/CompanyCard";
import CompanyGroup from "./components/CompanyGroup";
import PersonCard from "./components/PersonCard";
import EmptyState from "./components/EmptyState";
import CompletedSection from "./components/CompletedSection";
import AddCompanyModal from "./components/AddCompanyModal";
import EditCompanyModal from "./components/EditCompanyModal";
import UnpaidList from "./components/UnpaidList";
import Toast from "./components/Toast";

const toCompany = c => ({ id: c.id, name: c.name, short: c.short, owner: c.owner, active: c.active !== false });
const toTask = t => ({
  key: t.key,
  companyId: t.company_id,
  company: t.company,
  owner: t.owner,
  type: t.type,
  dueDateStr: t.due_date,
  dueDate: parseDate(t.due_date),
  phase: t.phase,
  status: t.status,
  paymentStatus: t.payment_status,
  note: t.note,
  updatedAt: t.updated_at,
});
const toCompanyService = cs => ({ id: cs.id, companyId: cs.company_id, type: cs.type, customDueDay: cs.custom_due_day, active: cs.active });
const toTaskTypes = rows =>
  Object.fromEntries(
    rows.map(r => [r.key, { dueDay: r.default_due_day, phase: r.phase, ...(TYPE_PALETTE[r.color] || TYPE_PALETTE.slate) }])
  );

export default function App() {
  const { session, profile, loading: authLoading, login, logout } = useAuth();

  const [companies, setCompanies] = useState([]);
  const [companyServices, setCompanyServices] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskTypes, setTaskTypes] = useState({});
  const now = new Date();
  const today = now.getDate();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthAbbrev = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "short" }).format(now);
  const yearLabel = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { year: "numeric" })
    .formatToParts(now)
    .find(p => p.type === "year").value;
  const [view, setView] = useState("urgent");
  const [person, setPerson] = useState("ทุกคน");
  const isEmployee = profile?.role === "employee";

  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const isCurrentPeriod = selectedPeriod === currentPeriod;
  const shiftPeriod = delta => {
    const [y, m] = selectedPeriod.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const goToCurrentPeriod = () => setSelectedPeriod(currentPeriod);
  const [selectedPeriodY, selectedPeriodM] = selectedPeriod.split("-").map(Number);
  const selectedPeriodDate = new Date(selectedPeriodY, selectedPeriodM - 1, 1);
  const selectedMonthAbbrev = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "short" }).format(selectedPeriodDate);
  const selectedYearLabel = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { year: "numeric" })
    .formatToParts(selectedPeriodDate)
    .find(p => p.type === "year").value;

  // Employees only ever see their own work — lock the person filter to
  // their own label instead of letting them switch to "ทุกคน" or others.
  // Owner/manager get reset to "ทุกคน" on login too, so a stale filter
  // from a previous account (e.g. an employee logged in earlier in the
  // same browser tab) never carries over after switching accounts.
  useEffect(() => {
    if (!profile) return;
    setPerson(profile.role === "employee" ? profile.label : "ทุกคน");
  }, [profile?.id, profile?.role, profile?.label]);

  const [typeFilter, setTypeFilter] = useState(null);
  const [urgentDisplayMode, setUrgentDisplayMode] = useState("row");
  const [openCompany, setOpenCompany] = useState(null);
  const [search, setSearch] = useState("");
  const [showArchivedCompanies, setShowArchivedCompanies] = useState(false);
  const [openOwnerGroups, setOpenOwnerGroups] = useState(() => new Set());
  const toggleOwnerGroup = owner =>
    setOpenOwnerGroups(prev => {
      const next = new Set(prev);
      next.has(owner) ? next.delete(owner) : next.add(owner);
      return next;
    });
  const [openPerson, setOpenPerson] = useState(null);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [showAdminUsers, setShowAdminUsers] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [toast, setToast] = useState(null);
  const notifyError = message => setToast({ id: Date.now(), message });

  const loadAll = useCallback(async () => {
    const [
      { data: companiesData, error: companiesError },
      { data: servicesData, error: servicesError },
      { data: tasksData, error: tasksError },
      { data: taskTypesData, error: taskTypesError },
    ] = await Promise.all([
      supabase.from("companies").select("*").order("id"),
      supabase.from("company_services").select("*").order("id"),
      supabase.from("tasks").select("*").eq("period", selectedPeriod).order("id"),
      supabase.from("task_types").select("*").order("created_at"),
    ]);
    if (companiesError) console.error(companiesError);
    if (servicesError) console.error(servicesError);
    if (tasksError) console.error(tasksError);
    if (taskTypesError) console.error(taskTypesError);
    setCompanies((companiesData || []).map(toCompany));
    setCompanyServices((servicesData || []).map(toCompanyService));
    setTasks((tasksData || []).map(toTask));
    setTaskTypes(toTaskTypes(taskTypesData || []));
  }, [selectedPeriod]);

  useEffect(() => {
    if (!session) return;
    supabase
      .rpc("ensure_current_period_tasks")
      .then(({ error }) => {
        if (error) console.error(error);
      })
      .finally(loadAll);
    const channel = supabase
      .channel("db-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_services" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_types" }, loadAll)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session, loadAll]);

  const addTaskType = async ({ key, dueDay, color }) => {
    const { error } = await supabase.from("task_types").insert({ key, default_due_day: dueDay, phase: 3, color });
    if (error) {
      throw new Error(error.message.includes("duplicate") ? "มีบริการนี้อยู่แล้ว" : error.message);
    }
    await loadAll();
  };

  const deleteTaskType = async key => {
    const { error } = await supabase.from("task_types").delete().eq("key", key);
    if (error) throw new Error(error.message);
    await loadAll();
  };

  const renameTaskType = async (oldKey, newKey) => {
    const { error: typeError } = await supabase.from("task_types").update({ key: newKey }).eq("key", oldKey);
    if (typeError) {
      throw new Error(typeError.message.includes("duplicate") ? "มีบริการชื่อนี้อยู่แล้ว" : typeError.message);
    }
    const { error: csError } = await supabase.from("company_services").update({ type: newKey }).eq("type", oldKey);
    if (csError) console.error(csError);
    const { error: tasksError } = await supabase.from("tasks").update({ type: newKey }).eq("type", oldKey);
    if (tasksError) console.error(tasksError);
    await loadAll();
  };

  const addCompany = async ({ name, short, owner, services, customServices }) => {
    const { data: company, error: companyError } = await supabase.from("companies").insert({ name, short, owner }).select().single();
    if (companyError) {
      console.error(companyError);
      notifyError("เพิ่มบริษัทไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    const rows = [
      ...services.map(type => ({ company_id: company.id, type, custom_due_day: null })),
      ...customServices.map(cs => ({ company_id: company.id, type: cs.type, custom_due_day: cs.dueDay })),
    ];
    const { error: csError } = await supabase.from("company_services").insert(rows);
    if (csError) {
      console.error(csError);
      notifyError("เพิ่มบริการของบริษัทไม่สำเร็จ กรุณาลองใหม่");
    }

    const { error: rpcError } = await supabase.rpc("ensure_current_period_tasks");
    if (rpcError) {
      console.error(rpcError);
      notifyError("สร้างงานประจำเดือนไม่สำเร็จ กรุณาลองใหม่");
    }
    await loadAll();
  };

  const updateCompany = async (company, { name, short, owner, services, customServices }) => {
    const { error: companyError } = await supabase.from("companies").update({ name, short, owner }).eq("id", company.id);
    if (companyError) {
      console.error(companyError);
      notifyError("บันทึกข้อมูลบริษัทไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    // Keep the denormalized company/owner text on every existing task row
    // in sync (covers a plain rename or a responsibility hand-off) —
    // applies across all periods, not just the current one.
    const { error: syncError } = await supabase.from("tasks").update({ company: short, owner }).eq("company_id", company.id);
    if (syncError) {
      console.error(syncError);
      notifyError("อัปเดตชื่อบริษัทในงานเดิมไม่สำเร็จ");
    }

    const newTypes = [...services, ...customServices.map(cs => cs.type)];
    const existingTypes = company.services.map(cs => cs.type);
    const toAdd = newTypes.filter(t => !existingTypes.includes(t));
    const toRemove = existingTypes.filter(t => !newTypes.includes(t));

    if (toRemove.length) {
      // Soft-retire — keeps past months' completed history intact, just
      // stops future generation.
      const { error } = await supabase.from("company_services").update({ active: false }).eq("company_id", company.id).in("type", toRemove);
      if (error) {
        console.error(error);
        notifyError("ปิดบริการเดิมไม่สำเร็จ กรุณาลองใหม่");
      }
      // Drop this period's instance only if it's still pending (not done/skipped).
      const { error: delErr } = await supabase
        .from("tasks")
        .delete()
        .eq("company_id", company.id)
        .eq("status", "pending")
        .in("type", toRemove);
      if (delErr) {
        console.error(delErr);
        notifyError("ลบงานค้างของบริการเดิมไม่สำเร็จ");
      }
    }

    if (toAdd.length) {
      const rows = toAdd.map(type => {
        const custom = customServices.find(cs => cs.type === type);
        return { company_id: company.id, type, custom_due_day: custom ? custom.dueDay : null, active: true };
      });
      const { error } = await supabase.from("company_services").upsert(rows, { onConflict: "company_id,type" });
      if (error) {
        console.error(error);
        notifyError("เพิ่มบริการใหม่ไม่สำเร็จ กรุณาลองใหม่");
      }
    }

    const { error: rpcError } = await supabase.rpc("ensure_current_period_tasks");
    if (rpcError) {
      console.error(rpcError);
      notifyError("สร้างงานประจำเดือนไม่สำเร็จ กรุณาลองใหม่");
    }
    await loadAll();
  };

  const setCompanyActive = async (company, active) => {
    const { error } = await supabase.from("companies").update({ active }).eq("id", company.id);
    if (error) {
      console.error(error);
      notifyError(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    if (!active) {
      // Closing out a company: stop generating future tasks and drop this
      // period's still-pending ones, same as removing every service would.
      const { error: csError } = await supabase.from("company_services").update({ active: false }).eq("company_id", company.id);
      if (csError) {
        console.error(csError);
        notifyError("ปิดบริการของบริษัทไม่สำเร็จ");
      }
      const { error: delErr } = await supabase.from("tasks").delete().eq("company_id", company.id).eq("status", "pending");
      if (delErr) {
        console.error(delErr);
        notifyError("ลบงานค้างของบริษัทไม่สำเร็จ");
      }
    }
    setEditingCompany(null);
    await loadAll();
  };

  const setStatus = async (key, status, note = "") => {
    if (!isCurrentPeriod) return notifyError("กำลังดูข้อมูลย้อนหลัง ไม่สามารถแก้ไขได้");
    const { error } = await supabase
      .from("tasks")
      .update({ status, note: note || (status === "skipped" ? "ไม่มีรายการเดือนนี้" : ""), updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) {
      console.error(error);
      notifyError("บันทึกสถานะงานไม่สำเร็จ กรุณาลองใหม่");
    }
    await loadAll();
  };

  const toggle = t => setStatus(t.key, t.status === "done" ? "pending" : "done");
  const skip = t => setStatus(t.key, "skipped");
  const restore = t => setStatus(t.key, "pending");

  const setPaymentStatus = async (key, paymentStatus) => {
    if (!isCurrentPeriod) return notifyError("กำลังดูข้อมูลย้อนหลัง ไม่สามารถแก้ไขได้");
    const { error } = await supabase.from("tasks").update({ payment_status: paymentStatus }).eq("key", key);
    if (error) {
      console.error(error);
      notifyError("บันทึกสถานะการชำระเงินไม่สำเร็จ กรุณาลองใหม่");
    }
    await loadAll();
  };

  const markCompanyPaid = async keys => {
    if (!isCurrentPeriod) return notifyError("กำลังดูข้อมูลย้อนหลัง ไม่สามารถแก้ไขได้");
    const { error } = await supabase.from("tasks").update({ payment_status: "paid" }).in("key", keys);
    if (error) {
      console.error(error);
      notifyError("บันทึกการชำระเงินไม่สำเร็จ กรุณาลองใหม่");
    }
    await loadAll();
  };

  const setDueDate = async (key, dueDateStr) => {
    if (!isCurrentPeriod) return notifyError("กำลังดูข้อมูลย้อนหลัง ไม่สามารถแก้ไขได้");
    const { error } = await supabase.from("tasks").update({ due_date: dueDateStr }).eq("key", key);
    if (error) {
      console.error(error);
      notifyError("บันทึกวันครบกำหนดไม่สำเร็จ กรุณาลองใหม่");
    }
    await loadAll();
  };

  const markGroupDone = async dayTasks => {
    if (!isCurrentPeriod) return notifyError("กำลังดูข้อมูลย้อนหลัง ไม่สามารถแก้ไขได้");
    const { error } = await supabase
      .from("tasks")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .in("key", dayTasks.map(d => d.key));
    if (error) {
      console.error(error);
      notifyError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    }
    await loadAll();
  };

  const searchQuery = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      tasks.filter(
        t =>
          (person === "ทุกคน" || t.owner === person) &&
          (!typeFilter || t.type === typeFilter) &&
          (!searchQuery || t.company.toLowerCase().includes(searchQuery))
      ),
    [tasks, person, typeFilter, searchQuery]
  );

  const pending = visible.filter(t => t.status === "pending");
  const overdue = pending.filter(t => getUrgency(t.dueDate, todayDate) === "over");
  const dueSoon = pending.filter(t => getUrgency(t.dueDate, todayDate) === "soon");
  const doneCount = visible.filter(t => t.status !== "pending").length;
  const unpaidTasks = useMemo(
    () => visible.filter(t => t.status === "done" && t.paymentStatus === "unpaid"),
    [visible]
  );
  const paidTasks = useMemo(
    () => visible.filter(t => t.status === "done" && t.paymentStatus === "paid"),
    [visible]
  );

  const groups = useMemo(() => {
    const g = {};
    pending.forEach(t => {
      (g[t.dueDateStr] = g[t.dueDateStr] || []).push(t);
    });
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [pending]);

  const typeCounts = useMemo(() => {
    const c = {};
    tasks
      .filter(t => t.status === "pending" && (person === "ทุกคน" || t.owner === person))
      .forEach(t => (c[t.type] = (c[t.type] || 0) + 1));
    return c;
  }, [tasks, person]);

  const companyRows = useMemo(
    () =>
      companies
        .filter(c => (showArchivedCompanies || c.active) && (person === "ทุกคน" || c.owner === person))
        .map(c => {
        const ct = tasks.filter(t => t.companyId === c.id);
        const services = companyServices.filter(cs => cs.companyId === c.id && cs.active);
        const done = ct.filter(t => t.status !== "pending").length;
        const over = ct.filter(t => t.status === "pending" && getUrgency(t.dueDate, todayDate) === "over").length;
        return { ...c, ct, services, done, total: ct.length, over };
      }),
    [companies, companyServices, tasks, person, todayDate, showArchivedCompanies]
  );

  const companySearchMatch = useMemo(() => {
    if (!searchQuery) return null;
    return companyRows.filter(c => c.short.toLowerCase().includes(searchQuery) || c.name.toLowerCase().includes(searchQuery));
  }, [companyRows, searchQuery]);

  const companyGroups = useMemo(() => {
    const groups = {};
    companyRows.forEach(c => {
      (groups[c.owner] = groups[c.owner] || []).push(c);
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], "th"));
  }, [companyRows]);

  // Team overview (owner/manager only) — always shows every staff member
  // regardless of the "person" filter, since the point is comparing them.
  const teamRows = useMemo(() => {
    const owners = [...new Set(companies.map(c => c.owner))];
    return owners.map(owner => {
      const ownerCompanies = companies.filter(c => c.owner === owner);
      const ownerTasks = tasks.filter(t => t.owner === owner);
      const taskPending = ownerTasks.filter(t => t.status === "pending");
      const done = ownerTasks.filter(t => t.status !== "pending").length;
      const over = taskPending.filter(t => getUrgency(t.dueDate, todayDate) === "over").length;
      const pendingByType = {};
      taskPending.forEach(t => (pendingByType[t.type] = (pendingByType[t.type] || 0) + 1));
      return { owner, companies: ownerCompanies, pending: taskPending, pendingByType, done, total: ownerTasks.length, over };
    });
  }, [companies, tasks, todayDate]);

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">กำลังโหลด...</div>;
  }

  if (!session) {
    return <LoginScreen onLogin={login} />;
  }

  return (
    <TaskTypesProvider value={taskTypes}>
      <div className="min-h-screen bg-slate-50 font-sans">
        <Header
          today={today}
          monthLabel={`งานประจำเดือน ${selectedMonthAbbrev} ${selectedYearLabel}`}
          monthAbbrev={monthAbbrev}
          isCurrentPeriod={isCurrentPeriod}
          onPrevMonth={() => shiftPeriod(-1)}
          onNextMonth={() => shiftPeriod(1)}
          onGoToCurrent={goToCurrentPeriod}
          view={view}
          setView={setView}
          person={person}
          setPerson={setPerson}
          people={PEOPLE}
          search={search}
          setSearch={setSearch}
          overdue={overdue.length}
          dueSoon={dueSoon.length}
          doneCount={doneCount}
          total={visible.length}
          unpaidCount={unpaidTasks.length}
          profile={profile}
          onLogout={logout}
          onOpenAdmin={() => setShowAdminUsers(true)}
          onOpenHelp={() => setShowHelp(true)}
        />

        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          {view === "urgent" && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <TypeFilterChips typeCounts={typeCounts} typeFilter={typeFilter} setTypeFilter={setTypeFilter} />

              <div className="min-w-0 flex-1">
                <div className="mb-3 flex justify-end">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                    <button
                      onClick={() => setUrgentDisplayMode("row")}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        urgentDisplayMode === "row" ? "bg-brand-navy text-white" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      <List size={14} /> รายแถว
                    </button>
                    <button
                      onClick={() => setUrgentDisplayMode("chip")}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        urgentDisplayMode === "chip" ? "bg-brand-navy text-white" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      <LayoutGrid size={14} /> รายบริษัท
                    </button>
                  </div>
                </div>

                {groups.length === 0 && <EmptyState typeFilter={typeFilter} person={person} />}

                {groups.map(([dateStr, dayTasks]) => (
                  <DayGroup
                    key={dateStr}
                    dateStr={dateStr}
                    dayTasks={dayTasks}
                    todayDate={todayDate}
                    displayMode={urgentDisplayMode}
                    onToggle={toggle}
                    onSkip={skip}
                    onRestore={restore}
                    onMarkGroupDone={markGroupDone}
                    onSetPaymentStatus={setPaymentStatus}
                    onSetDueDate={setDueDate}
                  />
                ))}

                <CompletedSection
                  tasks={visible.filter(t => t.status !== "pending")}
                  todayDate={todayDate}
                  onToggle={toggle}
                  onSkip={skip}
                  onRestore={restore}
                  onSetPaymentStatus={setPaymentStatus}
                  onSetDueDate={setDueDate}
                />
              </div>
            </div>
          )}

          {view === "company" && (
            <>
              {!isEmployee && isCurrentPeriod && (
                <div className="mb-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowAddCompany(true)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-navy px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy-light"
                  >
                    <Plus size={16} /> เพิ่มบริษัท
                  </button>
                </div>
              )}

              <label className="mb-3 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-500">
                <input
                  type="checkbox"
                  checked={showArchivedCompanies}
                  onChange={e => setShowArchivedCompanies(e.target.checked)}
                  className="accent-brand-navy"
                />
                แสดงบริษัทที่ปิดให้บริการแล้ว
              </label>

              {companySearchMatch ? (
                companySearchMatch.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">
                    ไม่พบบริษัทที่ตรงกับ &quot;{search}&quot;
                  </div>
                ) : (
                  companySearchMatch.map(c => (
                    <CompanyCard
                      key={c.id}
                      c={c}
                      todayDate={todayDate}
                      open={openCompany === c.id}
                      onToggleOpen={() => setOpenCompany(openCompany === c.id ? null : c.id)}
                      onToggle={toggle}
                      onSkip={skip}
                      onRestore={restore}
                      onEdit={isEmployee || !isCurrentPeriod ? undefined : setEditingCompany}
                      onSetPaymentStatus={setPaymentStatus}
                      onSetDueDate={setDueDate}
                    />
                  ))
                )
              ) : companyGroups.length > 1 ? (
                companyGroups.map(([owner, rows]) => (
                    <CompanyGroup
                      key={owner}
                      owner={owner}
                      rows={rows}
                      open={openOwnerGroups.has(owner)}
                      onToggleOpen={() => toggleOwnerGroup(owner)}
                      todayDate={todayDate}
                      openCompanyId={openCompany}
                      onToggleCompany={id => setOpenCompany(openCompany === id ? null : id)}
                      onToggle={toggle}
                      onSkip={skip}
                      onRestore={restore}
                      onEdit={isEmployee || !isCurrentPeriod ? undefined : setEditingCompany}
                      onSetPaymentStatus={setPaymentStatus}
                      onSetDueDate={setDueDate}
                    />
                  ))
              ) : (
                companyRows.map(c => (
                    <CompanyCard
                      key={c.id}
                      c={c}
                      todayDate={todayDate}
                      open={openCompany === c.id}
                      onToggleOpen={() => setOpenCompany(openCompany === c.id ? null : c.id)}
                      onToggle={toggle}
                      onSkip={skip}
                      onRestore={restore}
                      onEdit={isEmployee || !isCurrentPeriod ? undefined : setEditingCompany}
                      onSetPaymentStatus={setPaymentStatus}
                      onSetDueDate={setDueDate}
                    />
                  ))
              )}
            </>
          )}

          {view === "team" && (
            <>
              {teamRows.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">
                  ยังไม่มีข้อมูลทีมงาน
                </div>
              )}
              {teamRows.map(p => (
                <PersonCard
                  key={p.owner}
                  p={p}
                  todayDate={todayDate}
                  open={openPerson === p.owner}
                  onToggleOpen={() => setOpenPerson(openPerson === p.owner ? null : p.owner)}
                />
              ))}
            </>
          )}

          {view === "unpaid" && (
            <UnpaidList
              tasks={unpaidTasks}
              paidTasks={paidTasks}
              onMarkPaid={key => setPaymentStatus(key, "paid")}
              onUndoPaid={key => setPaymentStatus(key, "unpaid")}
              onMarkCompanyPaid={markCompanyPaid}
            />
          )}
        </div>

        <AddCompanyModal
          open={showAddCompany}
          onClose={() => setShowAddCompany(false)}
          onAdd={addCompany}
          onAddTaskType={addTaskType}
          onDeleteTaskType={deleteTaskType}
          onRenameTaskType={renameTaskType}
        />
        <EditCompanyModal
          open={!!editingCompany}
          onClose={() => setEditingCompany(null)}
          company={editingCompany}
          onSave={updateCompany}
          onAddTaskType={addTaskType}
          onDeleteTaskType={deleteTaskType}
          onRenameTaskType={renameTaskType}
          onSetActive={setCompanyActive}
        />
        <AdminUsersPanel open={showAdminUsers} onClose={() => setShowAdminUsers(false)} profile={profile} />
        <HelpGuideModal open={showHelp} onClose={() => setShowHelp(false)} />
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </div>
    </TaskTypesProvider>
  );
}
