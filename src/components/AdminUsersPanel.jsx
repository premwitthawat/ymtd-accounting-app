import { useEffect, useState } from "react";
import { Plus, RotateCcw, UserX, UserCheck, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const ROLE_LABEL = { owner: "เจ้าของ", manager: "ผู้จัดการ", employee: "พนักงาน" };

export default function AdminUsersPanel({ open, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [newRole, setNewRole] = useState("employee");
  const [newLabel, setNewLabel] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPin, setNewPin] = useState("");

  const [resetTarget, setResetTarget] = useState(null);
  const [resetPin, setResetPin] = useState("");

  const call = async body => {
    const { data, error } = await supabase.functions.invoke("admin-users", { body });
    if (error) throw new Error(error.message || "เกิดข้อผิดพลาด");
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await call({ action: "list" });
      setUsers(data.users || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  if (!open) return null;

  const createUser = async e => {
    e.preventDefault();
    setError("");
    try {
      await call({ action: "create", role: newRole, label: newLabel.trim(), username: newUsername.trim().toLowerCase(), pin: newPin });
      setNewLabel("");
      setNewUsername("");
      setNewPin("");
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const submitResetPin = async e => {
    e.preventDefault();
    setError("");
    try {
      await call({ action: "reset-pin", id: resetTarget.id, pin: resetPin });
      setResetTarget(null);
      setResetPin("");
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleActive = async u => {
    setError("");
    try {
      await call({ action: "set-active", id: u.id, active: !u.active });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">จัดการผู้ใช้</h2>
          <button onClick={onClose} aria-label="ปิด" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</div>}

          <div className="mb-4 flex flex-col gap-2">
            {loading && <div className="text-sm text-slate-400">กำลังโหลด...</div>}
            {users.map(u => (
              <div
                key={u.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  u.active ? "border-slate-200" : "border-slate-100 bg-slate-50 opacity-60"
                }`}
              >
                <div>
                  <div className="font-semibold text-slate-800">
                    {u.label} <span className="font-mono text-xs font-normal text-slate-400">({u.username})</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {ROLE_LABEL[u.role]}
                    {!u.active && " · ปิดใช้งาน"}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setResetTarget(u);
                      setResetPin("");
                      setError("");
                    }}
                    className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300"
                    aria-label="ตั้งรหัส PIN ใหม่"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(u)}
                    className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300"
                    aria-label={u.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  >
                    {u.active ? <UserX size={14} /> : <UserCheck size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {resetTarget && (
            <form onSubmit={submitResetPin} className="mb-4 flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 p-3 text-sm">
              <div className="font-semibold text-slate-700">ตั้งรหัส PIN ใหม่ให้ {resetTarget.label}</div>
              <input
                type="text"
                inputMode="numeric"
                minLength={6}
                required
                value={resetPin}
                onChange={e => setResetPin(e.target.value.replace(/\D/g, ""))}
                placeholder="PIN ใหม่ (อย่างน้อย 6 หลัก)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setResetTarget(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  ยกเลิก
                </button>
                <button type="submit" className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white">
                  บันทึก
                </button>
              </div>
            </form>
          )}

          <form onSubmit={createUser} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm">
            <div className="font-semibold text-slate-700">เพิ่มผู้ใช้ใหม่</div>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
            >
              <option value="employee">พนักงาน</option>
              <option value="manager">ผู้จัดการ</option>
              <option value="owner">เจ้าของ</option>
            </select>
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              required
              placeholder="ชื่อเรียก เช่น พนักงาน 1 (ไม่ต้องใส่ชื่อจริง)"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
            />
            <input
              value={newUsername}
              onChange={e => setNewUsername(e.target.value.toLowerCase())}
              required
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="ID สำหรับล็อกอิน เช่น prem01 (a-z, 0-9, 3-20 ตัว)"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
            />
            <input
              type="text"
              inputMode="numeric"
              minLength={6}
              required
              value={newPin}
              onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))}
              placeholder="PIN (อย่างน้อย 6 หลัก)"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
            />
            <button
              type="submit"
              className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-navy px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-light"
            >
              <Plus size={16} /> เพิ่มผู้ใช้
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
