"""อ่านชีต ปี<พ.ศ.> ของ ใบแจ้งหนี้.xlsx แล้วพิมพ์เป็น JSON ให้ sheet-invoices.mjs ใช้

โครงชีต (ยึดตามหัวคอลัมน์จริง ไม่ใช่ตำแหน่งตายตัว):
  A ลำดับ · B ชื่อบริษัท · C เลขผู้เสียภาษี · D สถานะ (เช่น "ส่งแยก")
  บล็อก "ใบแจ้งหนี้" : 12 คอลัมน์ มกราคม..ธันวาคม = ยอดใบแจ้งหนี้ของ *เดือนบริการ* นั้น
  บล็อก "ใบวางบิล"   : 12 คอลัมน์ มกราคม..ธันวาคม = ยอดรวมใบวางบิล (ค้างเก่า + เดือนนี้) ถ้ามี
ค่าว่าง = ไม่ออกเดือนนั้น, 0 = ไม่ออกเดือนนั้นเช่นกัน (ระบุชัดว่าไม่มี)

ใช้: python read-sheet.py "<path.xlsx>" 2569
"""
import json
import sys

import openpyxl

MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
          "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]

sys.stdout.reconfigure(encoding="utf-8")  # Windows console default ไม่ใช่ UTF-8 — JSON มีภาษาไทย
path, year_be = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb[f"ปี{year_be}"]
rows = list(ws.iter_rows(values_only=True))

header, months_row = rows[0], rows[2]
def find(label):
    for i, v in enumerate(header):
        if isinstance(v, str) and v.strip() == label:
            return i
    raise SystemExit(f"ไม่พบคอลัมน์ '{label}' ในชีต ปี{year_be}")

inv_start = find("ใบแจ้งหนี้")
bill_start = find("ใบวางบิล")
for start, label in ((inv_start, "ใบแจ้งหนี้"), (bill_start, "ใบวางบิล")):
    got = [str(m).strip() if m else "" for m in months_row[start:start + 12]]
    if got != MONTHS:
        raise SystemExit(f"หัวเดือนของบล็อก {label} ไม่ตรง: {got}")

def num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

out = []
for r_index, r in enumerate(rows[3:], start=4):
    name = r[1]
    if not isinstance(name, str) or not name.strip():
        continue
    tax = r[2]
    out.append({
        "row": r_index,
        "no": r[0],
        "name": name.strip(),
        "taxId": str(tax).strip() if tax not in (None, "") else "",
        "status": (str(r[3]).strip() if r[3] not in (None, "") else ""),
        "invoice": {m + 1: num(r[inv_start + m]) for m in range(12)},
        "billing": {m + 1: num(r[bill_start + m]) for m in range(12)},
    })
json.dump(out, sys.stdout, ensure_ascii=False)
