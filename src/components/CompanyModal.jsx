import { useEffect, useState } from "react";
import { X, Plus, Trash2, Pencil } from "lucide-react";
import { TYPE_PALETTE } from "../data/tasks";
import { useTaskTypes } from "../lib/TaskTypesContext";
import { supabase } from "../lib/supabaseClient";

const PALETTE_KEYS = Object.keys(TYPE_PALETTE);

const blankState = {
  name: "",
  short: "",
  owner: "",
  services: {},
  otherEnabled: false,
  otherText: "",
  otherDueDay: 20,
};

const blankNewType = { name: "", dueDay: 20, color: PALETTE_KEYS[0] };

export default function CompanyModal({ open, onClose, onSubmit, title, submitLabel, initial, onAddTaskType, onDeleteTaskType, onRenameTaskType }) {
  const taskTypes = useTaskTypes();
  const [form, setForm] = useState(blankState);
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState(blankNewType);
  const [newTypeError, setNewTypeError] = useState("");
  const [staffOptions, setStaffOptions] = useState([]);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...blankState, ...initial } : blankState);
      setAddingType(false);
      setNewType(blankNewType);
      setNewTypeError("");
    }
  }, [open, initial]);

  // "ผู้รับผิดชอบ" is only ever assigned to managers/employees — owners
  // oversee everything already without needing to be picked per company.
  useEffect(() => {
    if (!open) return;
    supabase
      .from("public_profiles")
      .select("*")
      .then(({ data }) => setStaffOptions((data || []).filter(p => p.role === "manager" || p.role === "employee")));
  }, [open]);

  useEffect(() => {
    if (open && !initial && !form.owner && staffOptions.length) {
      setForm(f => (f.owner ? f : { ...f, owner: staffOptions[0].label }));
    }
  }, [open, initial, form.owner, staffOptions]);

  if (!open) return null;

  // Defensive: keep the company's current owner selectable even if it's a
  // legacy value (e.g. an owner-role account from before this rule, or a
  // name that doesn't have a login account yet) so editing never silently
  // reassigns it.
  const ownerOptions = [...new Set([...staffOptions.map(p => p.label), form.owner].filter(Boolean))];

  const toggleService = key => setForm(f => ({ ...f, services: { ...f.services, [key]: !f.services[key] } }));

  const renameType = async (e, key) => {
    e.preventDefault();
    e.stopPropagation();
    const next = window.prompt("แก้ไขชื่อบริการ", key);
    if (!next || !next.trim() || next.trim() === key) return;
    const newKey = next.trim();
    try {
      await onRenameTaskType(key, newKey);
      setForm(f => {
        if (!f.services[key]) return f;
        const services = { ...f.services };
        delete services[key];
        services[newKey] = true;
        return { ...f, services };
      });
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteType = async (e, key) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`ลบบริการ "${key}" ออกจากรายการหลักถาวร?\n(งานที่มีอยู่แล้วของบริษัทอื่นจะไม่หายไป แต่จะกลายเป็นบริการ "อื่นๆ" แทน)`)) return;
    try {
      await onDeleteTaskType(key);
      setForm(f => {
        const services = { ...f.services };
        delete services[key];
        return { ...f, services };
      });
    } catch (err) {
      alert(err.message);
    }
  };

  const submitNewType = async e => {
    e.preventDefault();
    const key = newType.name.trim();
    if (!key) return;
    setNewTypeError("");
    try {
      await onAddTaskType({ key, dueDay: newType.dueDay, color: newType.color });
      setForm(f => ({ ...f, services: { ...f.services, [key]: true } }));
      setAddingType(false);
      setNewType(blankNewType);
    } catch (err) {
      setNewTypeError(err.message);
    }
  };

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.name.trim() || !form.short.trim()) return;

    const standardServices = Object.keys(form.services).filter(k => form.services[k]);
    const customServices = form.otherEnabled
      ? form.otherText
          .split(/[,\n]/)
          .map(s => s.trim())
          .filter(Boolean)
          .map(type => ({ type, dueDay: form.otherDueDay }))
      : [];

    if (standardServices.length === 0 && customServices.length === 0) return;

    onSubmit({ name: form.name.trim(), short: form.short.trim(), owner: form.owner, services: standardServices, customServices });
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="ปิด" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-slate-700">ชื่อบริษัท</span>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
              placeholder="เช่น บจ.ตัวอย่าง จำกัด"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-slate-700">ชื่อย่อ</span>
            <input
              value={form.short}
              onChange={e => setForm(f => ({ ...f, short: e.target.value }))}
              required
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
              placeholder="เช่น ตัวอย่าง"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-slate-700">ผู้รับผิดชอบ</span>
            <select
              value={form.owner}
              onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
            >
              {ownerOptions.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-slate-700">บริการที่ต้องทำ</span>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.keys(taskTypes).map(t => (
                <label
                  key={t}
                  className={`group flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    form.services[t] ? "border-brand-navy bg-brand-navy/5 text-brand-navy" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <input type="checkbox" checked={!!form.services[t]} onChange={() => toggleService(t)} className="accent-brand-navy" />
                  <span className="flex-1">{t}</span>
                  <button
                    type="button"
                    onClick={e => renameType(e, t)}
                    aria-label={`แก้ไขชื่อบริการ ${t}`}
                    className="rounded p-0.5 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={e => deleteType(e, t)}
                    aria-label={`ลบบริการ ${t}`}
                    className="rounded p-0.5 text-slate-300 opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </label>
              ))}
            </div>

            {!addingType ? (
              <button
                type="button"
                onClick={() => setAddingType(true)}
                className="flex items-center gap-1 self-start text-xs font-semibold text-brand-navy hover:underline"
              >
                <Plus size={13} /> เพิ่มบริการหลักใหม่
              </button>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 p-3">
                <input
                  value={newType.name}
                  onChange={e => setNewType(n => ({ ...n, name: e.target.value }))}
                  placeholder="ชื่อบริการ เช่น ภงด.2"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
                />
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    วันครบกำหนดของเดือน
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={newType.dueDay}
                      onChange={e => setNewType(n => ({ ...n, dueDay: +e.target.value }))}
                      className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-1.5">
                  {PALETTE_KEYS.map(key => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNewType(n => ({ ...n, color: key }))}
                      aria-label={key}
                      className={`h-5 w-5 rounded-full ${TYPE_PALETTE[key].bg} ${
                        newType.color === key ? "ring-2 ring-offset-1 ring-brand-navy" : ""
                      }`}
                    />
                  ))}
                </div>
                {newTypeError && <div className="text-xs font-semibold text-rose-600">{newTypeError}</div>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddingType(false);
                      setNewTypeError("");
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={submitNewType}
                    className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    เพิ่มบริการ
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-slate-300 p-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.otherEnabled}
                onChange={e => setForm(f => ({ ...f, otherEnabled: e.target.checked }))}
                className="accent-brand-navy"
              />
              อื่นๆ (นอกเหนือจากบริการหลัก)
            </label>
            {form.otherEnabled && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={form.otherText}
                  onChange={e => setForm(f => ({ ...f, otherText: e.target.value }))}
                  rows={2}
                  placeholder="ระบุชื่องาน คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่ถ้ามีหลายรายการ"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
                />
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  วันครบกำหนดของเดือน
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.otherDueDay}
                    onChange={e => setForm(f => ({ ...f, otherDueDay: +e.target.value }))}
                    className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg bg-brand-navy px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-light"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
