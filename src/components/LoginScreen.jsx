import { useState } from "react";

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    if (!username.trim() || pin.length < 6) return;
    setLoading(true);
    setError("");
    const { error } = await onLogin(username, pin);
    setLoading(false);
    if (error) {
      setError("รหัสผู้ใช้หรือ PIN ไม่ถูกต้อง");
      setPin("");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-[11px] font-semibold tracking-[0.15em] text-brand-gold uppercase">YMTD Accounting</div>
          <h1 className="mt-1 text-lg font-bold text-slate-900">เข้าสู่ระบบ</h1>
        </div>

        <label className="mb-3 flex flex-col gap-1 text-sm">
          <span className="font-semibold text-slate-700">รหัสผู้ใช้ (ID)</span>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="เช่น prem01"
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-slate-700">รหัสผ่าน (PIN)</span>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="กรอกรหัส PIN"
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-center text-lg tracking-[0.3em] focus:border-brand-navy focus:ring-1 focus:ring-brand-navy focus:outline-none"
          />
        </label>

        {error && <div className="mt-3 text-center text-xs font-semibold text-rose-600">{error}</div>}

        <button
          type="submit"
          disabled={loading || !username.trim() || pin.length < 6}
          className="mt-4 w-full rounded-lg bg-brand-navy px-3.5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-navy-light disabled:opacity-40"
        >
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
