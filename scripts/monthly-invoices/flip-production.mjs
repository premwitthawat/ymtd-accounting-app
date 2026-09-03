// สลับ edge functions จากโหมดซ้อม (FLOWACCOUNT_MOCK=true) → FlowAccount production จริง
// แล้วล้างใบซ้อมของบริษัท test และออกใบแจ้งหนี้จริงส่งเข้ากลุ่มทดสอบใหม่
//
// ต้องมีใน .env: SUPABASE_ACCESS_TOKEN (personal token จาก dashboard/account/tokens,
// ขึ้นต้น sbp_) นอกเหนือจาก FLOWACCOUNT_* และ SUPABASE_* ที่มีอยู่แล้ว
//
//   node scripts/monthly-invoices/flip-production.mjs --yes
//
// ลำดับ: ตั้ง secrets → พักบริษัท test ชั่วคราว → วน probe จน MOCK ดับ (secrets ใช้เวลา
// กระจายสักครู่ และกันไม่ให้ generate รอบ probe ยิงข้อความซ้ำเข้ากลุ่ม) → ล้างใบซ้อม →
// เปิดบริษัท test → generate จริง
import fs from "node:fs";
import path from "node:path";
import { here, sleep } from "./lib.mjs";

const PROJECT_REF = "pslqzoiysoxvbmdbtymg";
const BANK_ACCOUNT_ID = "245476"; // กสิกร 057-3-47559-3 สาขาเมญ่า (จาก GET /bank-accounts จริง)
const TEST_COMPANY_ID = 49;

for (const file of [path.join(here, ".env"), "d:/projects/ymtd-accounting-app/.env.local"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SRK, SUPABASE_ACCESS_TOKEN, VITE_SUPABASE_ANON_KEY: ANON } = process.env;
if (!SUPABASE_ACCESS_TOKEN) throw new Error(`ยังไม่มี SUPABASE_ACCESS_TOKEN ใน ${path.join(here, ".env")} — สร้างที่ supabase.com/dashboard/account/tokens`);
if (!process.argv.includes("--yes")) throw new Error("ใส่ --yes เพื่อยืนยัน (จะตั้ง secrets จริงและออกเอกสารจริง)");

const mgmt = async (method, p, body) => {
  const r = await fetch(`https://api.supabase.com/v1${p}`, {
    method,
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
};
const rest = async (method, p, body) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    method,
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status}: ${(await r.text()).slice(0, 300)}`);
};

// 1) ตั้ง secrets (ลบของเดิมก่อน — Management API ไม่ทับค่าซ้ำชื่อให้)
const secrets = {
  FLOWACCOUNT_CLIENT_ID: process.env.FLOWACCOUNT_CLIENT_ID,
  FLOWACCOUNT_CLIENT_SECRET: process.env.FLOWACCOUNT_CLIENT_SECRET,
  FLOWACCOUNT_BASE_URL: "https://openapi.flowaccount.com/v1",
  FLOWACCOUNT_TOKEN_URL: "https://openapi.flowaccount.com/v1/token",
  FLOWACCOUNT_MOCK: "false",
  FLOWACCOUNT_BANK_ACCOUNT_ID: BANK_ACCOUNT_ID,
};
try {
  await mgmt("DELETE", `/projects/${PROJECT_REF}/secrets`, Object.keys(secrets));
} catch {
  /* ยังไม่เคยตั้ง — ข้าม */
}
await mgmt("POST", `/projects/${PROJECT_REF}/secrets`, Object.entries(secrets).map(([name, value]) => ({ name, value })));
console.log("✔ ตั้ง secrets แล้ว:", Object.keys(secrets).join(", "));

// 2) พักบริษัท test แล้ว probe ด้วย generate เปล่า (ไม่มีบริษัทเข้าเกณฑ์ → ไม่ยิง LINE)
await rest("PATCH", `companies?id=eq.${TEST_COMPANY_ID}`, { active: false });
const ownerSession = await mintOwnerSession();
let live = false;
for (let i = 0; i < 12; i++) {
  const res = await callFn("flowaccount-invoices", ownerSession, { action: "generate" });
  if (res.mock !== true) {
    live = true;
    break;
  }
  console.log(`  ยังเป็น mock อยู่ รอ secrets กระจาย... (${i + 1}/12)`);
  await sleep(10_000);
}
if (!live) {
  await rest("PATCH", `companies?id=eq.${TEST_COMPANY_ID}`, { active: true });
  throw new Error("secrets ยังไม่มีผลหลังรอ ~2 นาที — ลองรันซ้ำอีกครั้ง");
}
console.log("✔ functions ออกจากโหมดซ้อมแล้ว");

// 3) ล้างใบซ้อมของบริษัท test (แถว + ไฟล์ PDF เปล่า + token cache เก่า)
await rest("DELETE", `company_invoices?company_id=eq.${TEST_COMPANY_ID}&period=eq.2026-09`);
await rest("DELETE", `integration_tokens?provider=eq.flowaccount`);
await fetch(`${SUPABASE_URL}/storage/v1/object/invoices/company-${TEST_COMPANY_ID}/2026/09/MOCKINV202609-d9073f7c.pdf`, {
  method: "DELETE",
  headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
}).catch(() => {});
console.log("✔ ล้างใบซ้อมแล้ว");

// 4) เปิดบริษัท test แล้วออกใบจริง
await rest("PATCH", `companies?id=eq.${TEST_COMPANY_ID}`, { active: true });
const result = await callFn("flowaccount-invoices", ownerSession, { action: "generate" });
console.log(JSON.stringify(result, null, 2));
if (result.mock) throw new Error("ยังได้ mock อยู่ — ไม่ควรเกิด ลองรันซ้ำ");
console.log("\n✔ ใบแจ้งหนี้จริงออกและส่งเข้ากลุ่มแล้ว — ให้เปรม/พลอยพิมพ์ paid ในกลุ่มเพื่อทดสอบใบเสร็จ");

// ---------------------------------------------------------------------------
async function mintOwnerSession() {
  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: "prem01@ymtd.internal" }),
  });
  const link = await linkRes.json();
  const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
  if (!tokenHash) throw new Error(`generate_link ไม่ได้ hashed_token: ${JSON.stringify(link).slice(0, 200)}`);
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const session = await verifyRes.json();
  if (!session.access_token) throw new Error(`verify ไม่ได้ session: ${JSON.stringify(session).slice(0, 200)}`);
  return session.access_token;
}
async function callFn(name, jwt, body) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${name} → ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}
