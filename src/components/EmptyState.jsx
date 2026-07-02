import { PartyPopper } from "lucide-react";

export default function EmptyState({ typeFilter, person }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white py-16 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
        <PartyPopper size={24} className="text-emerald-600" />
      </div>
      <div className="font-bold text-emerald-600">
        ไม่มีงานค้าง{typeFilter ? `ประเภท ${typeFilter}` : ""}
        {person !== "ทุกคน" ? `ของ${person}` : ""}
      </div>
      <div className="mt-1 text-sm text-slate-500">ปิดเดือนนี้ได้เลย</div>
    </div>
  );
}
