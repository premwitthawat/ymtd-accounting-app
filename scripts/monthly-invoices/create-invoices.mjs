// ออกใบแจ้งหนี้ค่าบริการรายเดือนใน FlowAccount (production) โดย "โคลน" จาก
// ใบแจ้งหนี้ชุดเดือนก่อน แล้วเก็บ PDF ลงโฟลเดอร์ Google Drive ของแต่ละบริษัท
//
// ทำไมโคลนจากเดือนก่อน ไม่ใช่จากฐานข้อมูลของแอป: สำนักงานออกใบแจ้งหนี้ใน
// FlowAccount (เว็บ) อยู่แล้วทุกเดือน — contact, ชื่อรายการ, ยอด, หัก ณ ที่จ่าย
// ของทุกบริษัทจึงอยู่ที่นั่นครบและถูกต้องที่สุด ส่วน companies.monthly_fee ในแอป
// ยังไม่ได้กรอก การใช้ชุดเดือนก่อนเป็นต้นแบบทำให้ไม่ต้องคีย์ master data ซ้ำ
// และไม่สร้าง contact ซ้ำ (ส่ง contactId เดิมเสมอ — ดู docs/flowaccount-api-notes.md)
//
// วิธีใช้ (รันจาก root ของ repo):
//   node scripts/monthly-invoices/create-invoices.mjs list   --source 2026-08
//   node scripts/monthly-invoices/create-invoices.mjs plan   --source 2026-08 --target 2026-09
//   node scripts/monthly-invoices/create-invoices.mjs create --source 2026-08 --target 2026-09 --yes
//   node scripts/monthly-invoices/create-invoices.mjs pdf    --target 2026-09
//
//   --source  เดือนที่ "ออก" ใบแจ้งหนี้ต้นแบบ (publishedOn)  เช่น 2026-08 = ชุด INV202608xxxx
//   --target  เดือนที่จะออกใบใหม่ (publishedOn = วันที่ 1 ของเดือนนี้ เว้นแต่ระบุ --date)
//   --date    วันที่ออกเอกสาร YYYY-MM-DD (ค่าเริ่มต้น: วันที่ 1 ของ --target)
//   --only    ออกเฉพาะบางราย: รายชื่อ documentSerial ต้นแบบคั่นด้วยจุลภาค (ทดลองวงแคบ)
//   --yes     ยืนยันสร้างเอกสารจริง (ไม่ใส่ = dry-run)
//
// ข้อตกลงเรื่องโฟลเดอร์: ใบแจ้งหนี้ของเดือนบริการ M ถูกออกวันที่ 1 ของเดือน M+1
// และเก็บไว้ใน <โฟลเดอร์บริษัท>/[ใบแจ้งหนี้/]MM.YYYY(พ.ศ.) ของเดือน M
// สคริปต์หาโฟลเดอร์ปลายทางจาก "ที่ที่ไฟล์ต้นแบบถูกเก็บ" แล้วสร้างโฟลเดอร์เดือน
// ถัดไปข้าง ๆ — ไม่ต้องมีตาราง mapping บริษัท → โฟลเดอร์ให้ดูแล
//
// กันออกซ้ำ 2 ชั้น: (1) runs/<target>.json บันทึกทุกใบที่สร้างแล้ว รันซ้ำจะข้าม
// (2) ก่อนสร้างจะเช็กใน FlowAccount ว่าเดือนเป้าหมายมีใบของ contact นี้อยู่แล้วหรือไม่
// (เผื่อ log หาย หรือมีคนออกเองในเว็บไปก่อน)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, ".env"));

const BASE_URL = process.env.FLOWACCOUNT_BASE_URL ?? "https://openapi.flowaccount.com/v1";
const TOKEN_URL = process.env.FLOWACCOUNT_TOKEN_URL ?? "https://openapi.flowaccount.com/v1/token";
const CLIENT_ID = process.env.FLOWACCOUNT_CLIENT_ID;
const CLIENT_SECRET = process.env.FLOWACCOUNT_CLIENT_SECRET;
const DRIVE_ROOT =
  process.env.INVOICE_DRIVE_ROOT ?? "G:\\My Drive\\07  บริษัท วายเอ็มทีดี การบัญชี พาร์ทเนอร์ จำกัด\\ใบแจ้งหนี้+ใบเสร็จรับเงิน";
// ชื่อไฟล์ตามที่ FlowAccount ตั้งให้ตอนดาวน์โหลดจากเว็บ — ให้เหมือนของเดิมในโฟลเดอร์
const ISSUER_NAME = process.env.INVOICE_ISSUER_NAME ?? "บริษัท วายเอ็มทีดี การบัญชี พาร์ทเนอร์ จำกัด";
const RUNS_DIR = path.join(here, "runs");

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function help() {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).slice(0, 30).map(l => l.slice(3)).join("\n"));
}

// ---------------------------------------------------------------------------
// คำสั่ง
// ---------------------------------------------------------------------------
async function list() {
  const source = requireMonth("source");
  const token = await getToken();
  const docs = await listInvoices(token, source);
  printTable(docs.map(d => ({ serial: d.documentSerial, status: `${d.status} ${d.statusName ?? ""}`.trim(), published: d.publishedOn?.slice(0, 10), contact: trunc(d.contactName, 44), item: trunc(itemName(d), 40), total: money(d.grandTotal), wht: money(d.documentWithholdingTaxAmount), monthly: isMonthlyFee(d) ? "✔" : "" })));
  console.log(`\n${docs.length} ใบ · ค่าบริการรายเดือนที่ใช้เป็นต้นแบบได้ ${docs.filter(d => isCloneable(d) && isMonthlyFee(d)).length} ใบ`);
}

async function plan() {
  const { rows } = await buildPlan();
  printPlan(rows);
  console.log("\nนี่คือ dry-run — ยังไม่ได้สร้างอะไร ถ้าถูกต้องให้รัน create ... --yes");
}

async function create() {
  const { rows, token, target, targetMonthBE, publishedOn } = await buildPlan();
  printPlan(rows);
  const todo = rows.filter(r => r.action === "create");
  if (!todo.length) return console.log("\nไม่มีอะไรต้องสร้าง");
  if (!args.yes) return console.log(`\nจะสร้าง ${todo.length} ใบ ลงวันที่ ${publishedOn} — ใส่ --yes เพื่อยืนยัน (ตอนนี้เป็น dry-run)`);

  const run = loadRun(target);
  console.log(`\nกำลังสร้าง ${todo.length} ใบ ...`);
  for (const r of todo) {
    const src = r.source;
    try {
      const created = await createInvoice(token, src, { publishedOn, itemName: r.newItemName });
      run.created[src.documentSerial] = {
        sourceSerial: src.documentSerial,
        contactId: src.contactId,
        contactName: src.contactName,
        recordId: created.recordId,
        documentSerial: created.documentSerial,
        publishedOn,
        grandTotal: src.grandTotal,
        folder: r.targetFolder,
        pdf: null,
        createdAt: new Date().toISOString(),
      };
      saveRun(target, run); // บันทึกทันทีทีละใบ — พังกลางทางก็ไม่ออกซ้ำ
      console.log(`  ✔ ${created.documentSerial}  ${src.contactName}`);
    } catch (err) {
      console.error(`  ✖ ${src.documentSerial} → ${src.contactName}: ${err.message}`);
      run.failed[src.documentSerial] = { error: String(err.message), at: new Date().toISOString() };
      saveRun(target, run);
    }
  }
  await exportRunPdfs(token, target, run, targetMonthBE);
}

// ดึง PDF ซ้ำสำหรับใบที่สร้างแล้วแต่ยังไม่มีไฟล์ (เช่น Drive หลุด หรือ export ล้ม)
async function pdf() {
  const target = requireMonth("target");
  const run = loadRun(target);
  if (!Object.keys(run.created).length) throw new Error(`ไม่พบ runs/${target}.json — ยังไม่เคยสร้างใบของเดือนนี้`);
  const token = await getToken();
  await exportRunPdfs(token, target, run, monthFolderBE(serviceMonthOf(target)));
}

// ---------------------------------------------------------------------------
// แผนงาน (ใช้ร่วมกันระหว่าง plan / create)
// ---------------------------------------------------------------------------
async function buildPlan() {
  const source = requireMonth("source");
  const target = requireMonth("target");
  if (target <= source) throw new Error("--target ต้องเป็นเดือนหลัง --source");
  const publishedOn = args.date ?? `${target}-01`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedOn)) throw new Error("--date ต้องเป็น YYYY-MM-DD");

  // ใบที่ออกเดือน source คือค่าบริการของเดือนก่อนหน้านั้น (ออกวันที่ 1 ถัดจากเดือนบริการ)
  const sourceService = serviceMonthOf(source);
  const targetService = serviceMonthOf(target);
  const sourceMonthBE = monthFolderBE(sourceService);
  const targetMonthBE = monthFolderBE(targetService);

  const token = await getToken();
  console.log(`ต้นแบบ: ใบที่ออกเดือน ${source} (ค่าบริการเดือน ${thaiMonth(sourceService)} → โฟลเดอร์ ${sourceMonthBE})`);
  console.log(`เป้าหมาย: ออกวันที่ ${publishedOn} (ค่าบริการเดือน ${thaiMonth(targetService)} → โฟลเดอร์ ${targetMonthBE})`);

  const [sourceDocs, targetDocs] = await Promise.all([listInvoices(token, source), listInvoices(token, target)]);
  const existingByContact = new Map();
  for (const d of targetDocs) if (isCloneable(d)) existingByContact.set(String(d.contactId), d);
  const run = loadRun(target);
  const only = args.only ? new Set(String(args.only).split(",").map(s => s.trim())) : null;

  console.log(`กำลังหาโฟลเดอร์ต้นแบบ ${sourceMonthBE} ใน Drive ...`);
  const folderIndex = indexMonthFolders(DRIVE_ROOT, sourceMonthBE);

  const rows = [];
  for (const src of sourceDocs) {
    if (!isCloneable(src)) {
      rows.push({ source: src, action: "skip", reason: `ข้าม (${src.documentSerial.startsWith("INV") ? "สถานะ " + (src.statusName ?? src.status) : "ไม่ใช่ INV"})` });
      continue;
    }
    // ใบที่ออกระหว่างเดือน (ค่าหนังสือรับรอง, เปลี่ยนแปลงกรรมการ ฯลฯ) เป็นงานครั้งเดียว
    // ไม่ใช่ค่าบริการรายเดือน — ไม่โคลนแม้จะอยู่ในเดือนต้นแบบ
    if (!isMonthlyFee(src)) {
      rows.push({ source: src, action: "skip", reason: "ไม่ใช่ค่าบริการรายเดือน (งานครั้งเดียว)" });
      continue;
    }
    if (only && !only.has(src.documentSerial)) {
      rows.push({ source: src, action: "skip", reason: "ไม่อยู่ใน --only" });
      continue;
    }
    const srcName = itemName(src);
    const newItemName = relabelMonth(srcName, sourceService, targetService);
    const srcFolder = folderIndex.get(src.documentSerial);
    const targetFolder = srcFolder ? path.join(path.dirname(srcFolder), targetMonthBE) : null;

    if (run.created[src.documentSerial]) {
      rows.push({ source: src, action: "done", reason: `สร้างแล้ว ${run.created[src.documentSerial].documentSerial}`, newItemName, targetFolder });
    } else if (existingByContact.has(String(src.contactId))) {
      rows.push({ source: src, action: "exists", reason: `เดือนนี้มี ${existingByContact.get(String(src.contactId)).documentSerial} แล้ว (ออกเองในเว็บ?)`, newItemName, targetFolder });
    } else if (!targetFolder) {
      rows.push({ source: src, action: "nofolder", reason: `หาโฟลเดอร์ ${sourceMonthBE} ที่มีไฟล์ ${src.documentSerial} ไม่เจอ`, newItemName, targetFolder });
    } else if (newItemName === srcName && !srcName.includes(THAI_MONTHS[targetService.m - 1])) {
      rows.push({ source: src, action: "create", reason: "⚠ ชื่อรายการไม่มีชื่อเดือน จะใช้ชื่อเดิม", newItemName, targetFolder });
    } else {
      rows.push({ source: src, action: "create", reason: "", newItemName, targetFolder });
    }
  }
  return { rows, token, source, target, targetMonthBE, publishedOn };
}

function printPlan(rows) {
  const label = { create: "จะสร้าง", done: "สร้างแล้ว", exists: "มีอยู่แล้ว", nofolder: "ไม่มีโฟลเดอร์", skip: "ข้าม" };
  printTable(
    rows.map(r => ({
      "ต้นแบบ": r.source.documentSerial,
      "บริษัท": trunc(r.source.contactName, 40),
      "รายการใหม่": trunc(r.newItemName ?? "", 42),
      "ยอด": money(r.source.grandTotal),
      "หัก ณ ที่จ่าย": money(r.source.documentWithholdingTaxAmount),
      "โฟลเดอร์": r.targetFolder ? trunc(path.relative(DRIVE_ROOT, r.targetFolder), 48) : "-",
      "ผล": label[r.action] + (r.reason ? ` — ${r.reason}` : ""),
    }))
  );
  const n = a => rows.filter(r => r.action === a).length;
  console.log(`\nจะสร้าง ${n("create")} · สร้างแล้ว ${n("done")} · มีอยู่แล้ว ${n("exists")} · หาโฟลเดอร์ไม่เจอ ${n("nofolder")} · ข้าม ${n("skip")}`);
  const total = rows.filter(r => r.action === "create").reduce((s, r) => s + Number(r.source.grandTotal || 0), 0);
  console.log(`ยอดรวมที่จะออก ${money(total)} บาท`);
}

// ---------------------------------------------------------------------------
// FlowAccount
// ---------------------------------------------------------------------------
async function getToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(`ยังไม่มี FLOWACCOUNT_CLIENT_ID / FLOWACCOUNT_CLIENT_SECRET — ใส่ในไฟล์ ${path.join(here, ".env")} (ดู .env.example)`);
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: "flowaccount-api" }),
  });
  if (!res.ok) throw new Error(`ขอ token ไม่สำเร็จ (${res.status}): ${await res.text()}`);
  const body = await res.json();
  console.log(`เชื่อม FlowAccount แล้ว (${BASE_URL})`);
  return body.access_token;
}

// เลี่ยง 429: production 100 req/นาที — ถอยตาม Retry-After หรือ 1s/2s/4s
async function flowFetch(url, init, attempt = 0) {
  const res = await fetch(url, init);
  if (res.status === 429 && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
    return flowFetch(url, init, attempt + 1);
  }
  return res;
}

async function api(token, method, p, body) {
  const res = await flowFetch(`${BASE_URL}/${p}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) throw new Error(`${method} /${p} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

// ใบแจ้งหนี้ทุกใบที่ publishedOn อยู่ในเดือน YYYY-MM (ไล่ทุกหน้า)
async function listInvoices(token, month) {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const out = [];
  for (let page = 1; page < 50; page++) {
    const json = await api(token, "GET", `tax-invoices?currentPage=${page}&pageSize=100&range=5&startDate=${start}&endDate=${end}`);
    const list = json.data?.list ?? [];
    out.push(...list);
    if (list.length < 100 || out.length >= Number(json.data?.totalDocument ?? 0)) break;
  }
  return out.sort((a, b) => String(a.documentSerial).localeCompare(String(b.documentSerial)));
}

// รายการสินค้าอาจไม่ติดมากับ list — ดึงรายใบเมื่อจำเป็น (GET by id ตอบ data.list[0])
async function fullDocument(token, doc) {
  if (Array.isArray(doc.items) && doc.items.length) return doc;
  const json = await api(token, "GET", `tax-invoices/${doc.recordId}`);
  return json.data?.list?.[0] ?? json.data ?? doc;
}

async function createInvoice(token, src, { publishedOn, itemName: newName }) {
  const full = await fullDocument(token, src);
  const items = (full.items ?? []).map((it, i) => ({
    type: Number(it.type ?? 1),
    name: i === 0 ? newName : String(it.name ?? ""),
    description: String(it.description ?? ""),
    quantity: Number(it.quantity ?? 1),
    unitName: String(it.unitName ?? "งาน"),
    pricePerUnit: Number(it.pricePerUnit ?? 0),
    total: Number(it.total ?? 0),
  }));
  if (!items.length) throw new Error("ใบต้นแบบไม่มีรายการสินค้า");
  const wht = Number(full.documentWithholdingTaxAmount ?? 0);
  const whtPct = Number(full.documentWithholdingTaxPercentage ?? 0);
  const creditDays = Number(full.creditDays ?? 0);
  const payload = {
    recordId: 0,
    contactId: Number(full.contactId),
    contactName: full.contactName,
    contactAddress: full.contactAddress ?? "",
    contactTaxId: full.contactTaxId ?? "",
    contactBranch: full.contactBranch ?? "สำนักงานใหญ่",
    contactBranchCode: full.contactBranchCode ?? "00000",
    contactGroup: Number(full.contactGroup ?? 3),
    publishedOn,
    creditType: Number(full.creditType ?? 1),
    creditDays,
    dueDate: addDays(publishedOn, creditDays),
    isVatInclusive: bool(full.isVatInclusive),
    useReceiptDeduction: false,
    subTotal: Number(full.subTotal),
    discountPercentage: Number(full.discountPercentage ?? 0),
    discountAmount: Number(full.discountAmount ?? 0),
    totalAfterDiscount: Number(full.totalAfterDiscount ?? full.subTotal),
    isVat: bool(full.isVat),
    vatAmount: Number(full.vatAmount ?? 0),
    grandTotal: Number(full.grandTotal),
    documentShowWithholdingTax: wht > 0 || bool(full.documentShowWithholdingTax),
    documentWithholdingTaxPercentage: whtPct,
    documentWithholdingTaxAmount: wht,
    documentDeductionType: 0,
    documentDeductionAmount: 0,
    remarks: full.remarks ?? "",
    internalNotes: full.internalNotes ?? "",
    showSignatureOrStamp: true,
    documentStructureType: "SimpleDocument",
    saleAndPurchaseChannel: 0,
    items,
  };
  const json = await api(token, "POST", "tax-invoices", payload);
  const data = json.data;
  if (!data?.recordId) throw new Error(`สร้างแล้วแต่ไม่ได้ recordId: ${JSON.stringify(json).slice(0, 300)}`);
  return { recordId: String(data.recordId), documentSerial: String(data.documentSerial) };
}

async function exportRunPdfs(token, target, run, targetMonthBE) {
  const pending = Object.values(run.created).filter(c => !c.pdf || !fs.existsSync(c.pdf));
  if (!pending.length) return console.log("\nPDF ครบทุกใบแล้ว");
  console.log(`\nกำลังดึง PDF ${pending.length} ใบลง Drive ...`);
  for (const c of pending) {
    try {
      const folder = c.folder ?? path.join(DRIVE_ROOT, "_unsorted", targetMonthBE);
      fs.mkdirSync(folder, { recursive: true });
      const json = await api(token, "POST", `tax-invoices/${c.recordId}/export-pdf/base64`, {});
      const bytes = Buffer.from(json.data, "base64");
      if (!bytes.subarray(0, 4).equals(Buffer.from("%PDF"))) throw new Error("ข้อมูลที่ได้ไม่ใช่ PDF");
      const file = path.join(folder, `${ISSUER_NAME}_${c.documentSerial}_${safeName(c.contactName)}.pdf`);
      fs.writeFileSync(file, bytes);
      c.pdf = file;
      saveRun(target, run);
      console.log(`  ✔ ${c.documentSerial} → ${path.relative(DRIVE_ROOT, file)}`);
    } catch (err) {
      console.error(`  ✖ ${c.documentSerial}: ${err.message} (รัน "pdf --target ${target}" เพื่อลองใหม่)`);
    }
  }
}

// ---------------------------------------------------------------------------
// โฟลเดอร์ใน Drive
// ---------------------------------------------------------------------------
// คืน Map<documentSerial, โฟลเดอร์เดือนที่เก็บไฟล์นั้น> โดยดูเฉพาะโฟลเดอร์ชื่อ MM.YYYY
// ลึกไม่เกิน 2 ชั้นใต้โฟลเดอร์บริษัท (บางบริษัทมีชั้น "ใบแจ้งหนี้" คั่น) — Drive
// แบบ stream ช้า จึงไม่ไล่ทุกไฟล์ทั้งต้น
function indexMonthFolders(root, monthBE) {
  const index = new Map();
  if (!fs.existsSync(root)) throw new Error(`ไม่พบโฟลเดอร์ Drive: ${root}`);
  const visit = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const p = path.join(dir, e.name);
      if (e.name === monthBE) {
        for (const f of fs.readdirSync(p)) {
          const m = f.match(/(INV\d{10})/);
          if (m && f.toLowerCase().endsWith(".pdf")) index.set(m[1], p);
        }
      } else if (depth < 2) visit(p, depth + 1);
    }
  };
  for (const e of fs.readdirSync(root, { withFileTypes: true })) if (e.isDirectory()) visit(path.join(root, e.name), 1);
  return index;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    if (!list[i].startsWith("--")) continue;
    const key = list[i].slice(2);
    const next = list[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else out[key] = next, i++;
  }
  return out;
}
function requireMonth(name) {
  const v = args[name];
  if (!v || !/^\d{4}-\d{2}$/.test(String(v))) throw new Error(`ต้องระบุ --${name} YYYY-MM`);
  return String(v);
}
// เดือนบริการของใบที่ออกเดือน issued = เดือนก่อนหน้า (ออกวันที่ 1 ย้อนหลัง)
function serviceMonthOf(issued) {
  const [y, m] = issued.split("-").map(Number);
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}
const monthFolderBE = ({ y, m }) => `${String(m).padStart(2, "0")}.${y + 543}`;
const thaiMonth = ({ m }) => THAI_MONTHS[m - 1];
function relabelMonth(name, from, to) {
  const a = THAI_MONTHS[from.m - 1], b = THAI_MONTHS[to.m - 1];
  return name.includes(a) ? name.replace(a, b) : name;
}
const itemName = d => (Array.isArray(d.items) && d.items[0]?.name) || d.items?.[0]?.name || "(ต้องดึงรายใบ)";
// status เป็นตัวเลข (เช่น 1 = รอดำเนินการ, 9 = ชำระแล้ว) และมี statusName กำกับ —
// ตัดเฉพาะใบที่ถูกยกเลิก; ใบเดือนก่อนที่ลูกค้ายังไม่จ่ายก็ยังเป็นต้นแบบของเดือนนี้ได้
const isCloneable = d => String(d.documentSerial).startsWith("INV") && !/void|cancel|ยกเลิก/i.test(`${d.status} ${d.statusName ?? ""}`);
// ค่าบริการรายเดือน = ออกวันที่ 1 และชื่อรายการมีคำว่า "ประจำเดือน"
const isMonthlyFee = d => /ประจำเดือน/.test(itemName(d)) && String(d.publishedOn ?? "").slice(8, 10) === "01";
const bool = v => v === true || v === "true" || v === 1 || v === "1";
const money = n => (n == null || n === "" ? "-" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 }));
const trunc = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
const safeName = s => String(s).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function runFile(target) {
  return path.join(RUNS_DIR, `${target}.json`);
}
function loadRun(target) {
  if (!fs.existsSync(runFile(target))) return { target, created: {}, failed: {} };
  return JSON.parse(fs.readFileSync(runFile(target), "utf8"));
}
function saveRun(target, run) {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.writeFileSync(runFile(target), JSON.stringify(run, null, 2));
}
function printTable(rows) {
  if (!rows.length) return console.log("(ว่าง)");
  const cols = Object.keys(rows[0]);
  const width = Object.fromEntries(cols.map(c => [c, Math.max(dw(c), ...rows.map(r => dw(r[c])))]));
  const line = r => cols.map(c => pad(r[c], width[c])).join("  ");
  console.log(line(Object.fromEntries(cols.map(c => [c, c]))));
  console.log(cols.map(c => "─".repeat(width[c])).join("  "));
  for (const r of rows) console.log(line(r));
}
// ตัวอักษรไทยแบบสระบน/ล่าง/วรรณยุกต์ไม่กินความกว้าง — นับเฉพาะตัวที่มีความกว้างจริง
const dw = s => [...String(s ?? "")].filter(ch => !/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(ch)).length;
const pad = (s, w) => String(s ?? "") + " ".repeat(Math.max(0, w - dw(s)));

// ---------------------------------------------------------------------------
// entry point — อยู่ท้ายไฟล์เพราะ helper ด้านบนเป็น const (ต้องประกาศก่อนใช้)
// ---------------------------------------------------------------------------
const [, , command = "help", ...rest] = process.argv;
const args = parseArgs(rest);

const commands = { list, plan, create, pdf, help };
if (!commands[command]) {
  console.error(`ไม่รู้จักคำสั่ง "${command}"`);
  help();
  process.exit(2);
}
try {
  await commands[command]();
} catch (err) {
  console.error("\n✖", err instanceof Error ? err.message : err);
  process.exit(1);
}
