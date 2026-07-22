import { useEffect, useState } from "react";
import { X, MessageCircle, Link2, Unlink } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const formatThaiDateTime = iso =>
  new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );

// The bot never posts in a group chat (client-facing chats stay clean,
// per explicit request) — instead line-webhook silently records every
// group it's added to (supabase/migrations/011_line_groups.sql), and
// staff link each one to a company here. companies.line_group_id (set
// in 009) stays the actual field slip-matching reads from; this panel
// is just where that field gets set from a friendly UI instead of SQL.
export default function LineGroupsPanel({ open, onClose }) {
  const [groups, setGroups] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    const [{ data: groupsData, error: groupsErr }, { data: companiesData, error: companiesErr }] = await Promise.all([
      supabase.from("line_groups").select("*").order("first_seen_at", { ascending: false }),
      supabase.from("companies").select("id, short, line_group_id").eq("active", true).order("short"),
    ]);
    if (groupsErr) setError(groupsErr.message);
    else if (companiesErr) setError(companiesErr.message);
    else {
      setGroups(groupsData || []);
      setCompanies(companiesData || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  if (!open) return null;

  const link = async (groupId, companyId) => {
    setSavingId(groupId);
    setError("");
    // Clear the group off any company it was previously linked to first —
    // line_group_id has no uniqueness constraint, so without this a
    // re-assign could leave two companies pointing at the same group.
    const { error: clearErr } = await supabase.from("companies").update({ line_group_id: null }).eq("line_group_id", groupId);
    if (clearErr) {
      setError(clearErr.message);
      setSavingId(null);
      return;
    }
    if (companyId) {
      const { error: setErr } = await supabase.from("companies").update({ line_group_id: groupId }).eq("id", companyId);
      if (setErr) {
        setError(setErr.message);
        setSavingId(null);
        return;
      }
    }
    await load();
    setSavingId(null);
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">จัดการกลุ่ม LINE</h2>
          <button onClick={onClose} aria-label="ปิด" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="mb-4 text-xs text-slate-500">
            เชิญบอท "Ymtd Accounting" เข้ากลุ่ม LINE ของลูกค้าแต่ละบริษัท กลุ่มจะมาโผล่ในรายการด้านล่างอัตโนมัติ — เลือกบริษัทที่ตรงกันแล้วบันทึกได้เลย
          </p>

          {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</div>}
          {loading && <div className="text-sm text-slate-400">กำลังโหลด...</div>}
          {!loading && groups.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400">
              ยังไม่มีกลุ่ม LINE ไหนเชิญบอทเข้าไปเลย
            </div>
          )}

          <div className="flex flex-col gap-2">
            {groups.map(g => {
              const linkedCompany = companies.find(c => c.line_group_id === g.line_group_id);
              return (
                <div key={g.line_group_id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <MessageCircle size={16} className="mt-0.5 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-800">{g.group_name || "(ไม่ทราบชื่อกลุ่ม)"}</div>
                      <div className="text-[11px] text-slate-400">เห็นครั้งแรก {formatThaiDateTime(g.first_seen_at)}</div>
                    </div>
                    {linkedCompany ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <Link2 size={11} /> {linkedCompany.short}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">ยังไม่ผูก</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      value={linkedCompany?.id ?? ""}
                      onChange={e => link(g.line_group_id, e.target.value ? Number(e.target.value) : null)}
                      disabled={savingId === g.line_group_id}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
                    >
                      <option value="">— เลือกบริษัท —</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.short}
                        </option>
                      ))}
                    </select>
                    {linkedCompany && (
                      <button
                        type="button"
                        onClick={() => link(g.line_group_id, null)}
                        disabled={savingId === g.line_group_id}
                        aria-label="เลิกผูก"
                        title="เลิกผูก"
                        className="shrink-0 rounded-md border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300 disabled:opacity-50"
                      >
                        <Unlink size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
