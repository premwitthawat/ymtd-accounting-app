// เติม master data ของบริษัทในแอปจากแหล่งที่เชื่อถือได้ที่สุด: ใบแจ้งหนี้จริงใน
// FlowAccount (contactId, เลขผู้เสียภาษี, ที่อยู่, หัก ณ ที่จ่าย) เสริมด้วยเลขผู้เสียภาษี
// จากชีต ใบแจ้งหนี้.xlsx — เพื่อให้ระบบออกใบแจ้งหนี้อัตโนมัติ (cloud generate) ใช้ได้
//
// เจตนา: เติมเฉพาะช่องที่ยังว่าง ไม่ทับของที่มีอยู่ และ **ไม่แตะ monthly_fee เด็ดขาด**
// (กรอกค่าบริการรายเดือน = เปิดสวิตช์ส่งบิลเข้ากลุ่มลูกค้า — เป็นการตัดสินใจของเจ้าของ
// เป็นรายบริษัท ไม่ใช่ของสคริปต์)
//
//   node scripts/monthly-invoices/fill-companies.mjs plan
//   node scripts/monthly-invoices/fill-companies.mjs apply --yes
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { here, getToken, listDocs, nameKey, printTable, trunc, parseArgs } from "./lib.mjs";

for (const line of fs.readFileSync(path.join(here, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const U = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const args = parseArgs(process.argv.slice(3));
const command = process.argv[2] ?? "plan";

const rest = async (method, p, body) => {
  const r = await fetch(`${U}/rest/v1/${p}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body && JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
};

// --- แหล่งที่ 1: contact จากใบแจ้งหนี้จริง 3 เดือนล่าสุด (ก.ค.–ก.ย. 2569) ---
const token = await getToken();
const docs = (await Promise.all(["2026-07", "2026-08", "2026-09"].map(m => listDocs(token, "invoice", m)))).flat();
const contacts = new Map(); // nameKey → contact
for (const d of docs) {
  const k = nameKey(d.contactName);
  const cur = contacts.get(k) ?? { names: new Set() };
  cur.names.add(d.contactName);
  cur.contactId = String(d.contactId ?? cur.contactId ?? "");
  if (String(d.contactTaxId ?? "").trim()) cur.taxId = String(d.contactTaxId).trim();
  if (String(d.contactAddress ?? "").trim()) cur.address = String(d.contactAddress).trim();
  cur.whtRate = Math.max(Number(cur.whtRate ?? 0), Number(d.documentWithholdingTaxPercentage ?? 0));
  contacts.set(k, cur);
}
console.log(`FlowAccount: ${contacts.size} contact จากใบ ${docs.length} ใบ`);

// --- แหล่งที่ 2: เลขผู้เสียภาษีจากชีต (คอลัมน์ C) ---
const sheetRaw = JSON.parse(execFileSync("python", [path.join(here, "read-sheet.py"), path.join(process.env.INVOICE_DRIVE_ROOT ?? "G:\\My Drive\\07  บริษัท วายเอ็มทีดี การบัญชี พาร์ทเนอร์ จำกัด\\ใบแจ้งหนี้+ใบเสร็จรับเงิน", "ใบแจ้งหนี้.xlsx"), "2569"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
const sheetTax = new Map(sheetRaw.filter(r => r.taxId).map(r => [nameKey(r.name), r.taxId]));

// --- เป้าหมาย: บริษัทในแอป ---
const companies = await rest("GET", "companies?select=id,name,short,active,tax_id,address,branch_code,wht_rate,flowaccount_contact_id,monthly_fee&order=id");

// สะกดต่างกันระหว่างแอปกับ FlowAccount ที่รู้จักแล้ว (แก้ที่ต้นทางทีหลังได้ แต่ไม่ให้ขวางการเติมข้อมูล)
const ALIASES = [["นอร์ตไซต์", "นอร์ทไซด์"], ["เวทเก้า", "เวลเก้า"], ["ชิตี้", "ซิตี้"]];
const aliasKey = s => {
  let out = String(s ?? "");
  for (const [a, b] of ALIASES) out = out.replace(a, b);
  return nameKey(out);
};
const containLookup = (map, keys) => {
  for (const k of keys) if (map.has(k)) return map.get(k);
  for (const k of keys) {
    if (k.length < 6) continue;
    for (const [mk, v] of map) if (mk.includes(k) || k.includes(mk)) return v;
  }
  return null;
};
const match = c => {
  const keys = [aliasKey(c.name), aliasKey(c.short)];
  return containLookup(contacts, keys);
};

const rows = [];
for (const c of companies) {
  if (c.short === "test") continue;
  const fa = match(c);
  const sheetId = containLookup(sheetTax, [aliasKey(c.name), aliasKey(c.short)]);
  const patch = {};
  const taxId = c.tax_id?.trim() ? null : (fa?.taxId ?? sheetId ?? null);
  if (taxId) patch.tax_id = taxId;
  if (!c.address?.trim() && fa?.address) patch.address = fa.address;
  if (!c.branch_code?.trim()) patch.branch_code = "00000";
  if (!c.flowaccount_contact_id && fa?.contactId) patch.flowaccount_contact_id = fa.contactId;
  if (!(Number(c.wht_rate) > 0) && Number(fa?.whtRate) > 0) patch.wht_rate = Number(fa.whtRate);
  // ขัดแย้ง: แอปมีเลขอยู่แล้วแต่ไม่ตรงกับ FlowAccount/ชีต — รายงาน ไม่แก้เอง
  const conflict = c.tax_id?.trim() && fa?.taxId && c.tax_id.trim() !== fa.taxId ? `เลขในแอป ${c.tax_id} ≠ FlowAccount ${fa.taxId}` : "";
  rows.push({ company: c, fa, patch, conflict });
}

printTable(rows.map(r => ({
  id: r.company.id,
  "บริษัท (แอป)": trunc(r.company.name, 34),
  "จับคู่ FlowAccount": r.fa ? trunc([...r.fa.names][0], 34) : "— ไม่พบ —",
  "จะเติม": Object.keys(r.patch).length ? Object.entries(r.patch).map(([k, v]) => `${k}=${trunc(String(v), 18)}`).join(" · ") : "-",
  "หมายเหตุ": r.conflict || (r.fa ? "" : "ไม่มีใบใน 3 เดือนล่าสุด"),
})));
const todo = rows.filter(r => Object.keys(r.patch).length);
console.log(`\nจะอัปเดต ${todo.length}/${rows.length} บริษัท · จับคู่ไม่ได้ ${rows.filter(r => !r.fa).length} · ขัดแย้ง ${rows.filter(r => r.conflict).length} (ไม่แตะ)`);

if (command !== "apply") {
  console.log("dry-run — รัน apply --yes เพื่อบันทึกจริง (ไม่แตะ monthly_fee แน่นอน)");
} else if (!args.yes) {
  console.log("ใส่ --yes เพื่อยืนยัน");
} else {
  for (const r of todo) {
    await rest("PATCH", `companies?id=eq.${r.company.id}`, r.patch);
    console.log(`  ✔ ${r.company.id} ${trunc(r.company.name, 30)} ← ${Object.keys(r.patch).join(", ")}`);
  }
  console.log("เสร็จ");
}
