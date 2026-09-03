// helper ร่วมของสคริปต์ในโฟลเดอร์นี้: config จาก .env, FlowAccount client (token,
// list/get/create/delete, export PDF), โฟลเดอร์ Google Drive, ตารางพิมพ์, log ของรอบรัน
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const here = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv(path.join(here, ".env"));

export const BASE_URL = process.env.FLOWACCOUNT_BASE_URL ?? "https://openapi.flowaccount.com/v1";
// production ใช้ /v1/token (เอกสารบอก /token แต่ตอบ 403) — sandbox ใช้ /test/token
export const TOKEN_URL = process.env.FLOWACCOUNT_TOKEN_URL ?? "https://openapi.flowaccount.com/v1/token";
export const DRIVE_ROOT =
  process.env.INVOICE_DRIVE_ROOT ?? "G:\\My Drive\\07  บริษัท วายเอ็มทีดี การบัญชี พาร์ทเนอร์ จำกัด\\ใบแจ้งหนี้+ใบเสร็จรับเงิน";
export const SHEET_PATH = process.env.INVOICE_SHEET_PATH ?? path.join(DRIVE_ROOT, "ใบแจ้งหนี้.xlsx");
// ชื่อไฟล์ตามที่ FlowAccount ตั้งให้ตอนดาวน์โหลดจากเว็บ — ให้เหมือนของเดิมในโฟลเดอร์
export const ISSUER_NAME = process.env.INVOICE_ISSUER_NAME ?? "บริษัท วายเอ็มทีดี การบัญชี พาร์ทเนอร์ จำกัด";
export const RUNS_DIR = path.join(here, "runs");
export const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// path ของเอกสารแต่ละชนิด (สร้าง/อ่าน/ลบ/PDF ใช้ path เดียวกันสำหรับสองชนิดนี้)
export const KIND_PATH = { invoice: "tax-invoices", billing: "billing-notes" };
export const KIND_LABEL = { invoice: "ใบแจ้งหนี้", billing: "ใบวางบิล" };

// ---------------------------------------------------------------------------
// FlowAccount
// ---------------------------------------------------------------------------
export async function getToken() {
  const clientId = process.env.FLOWACCOUNT_CLIENT_ID, clientSecret = process.env.FLOWACCOUNT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(`ยังไม่มี FLOWACCOUNT_CLIENT_ID / FLOWACCOUNT_CLIENT_SECRET — ใส่ในไฟล์ ${path.join(here, ".env")} (ดู .env.example)`);
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "flowaccount-api" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ขอ token ไม่สำเร็จ (${res.status}): ${await res.text()}`);
  console.log(`เชื่อม FlowAccount แล้ว (${BASE_URL})`);
  return (await res.json()).access_token;
}

// เลี่ยง 429: production 100 req/นาที — ถอยตาม Retry-After หรือ 1s/2s/4s/8s
async function flowFetch(url, init, attempt = 0) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  if (res.status === 429 && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
    return flowFetch(url, init, attempt + 1);
  }
  return res;
}

export async function api(token, method, p, body) {
  const res = await flowFetch(`${BASE_URL}/${p}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) throw new Error(`${method} /${p} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

export function monthRange(month) {
  const [y, m] = month.split("-").map(Number);
  return { start: `${month}-01`, end: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
}

// เอกสารทุกใบที่ publishedOn อยู่ในเดือน YYYY-MM (ไล่ทุกหน้า) — เอกสารที่ถูกลบ
// (isDelete) ไม่ติดมากับ list อยู่แล้ว แต่กรองซ้ำเผื่อไว้
export async function listDocs(token, kind, month) {
  const { start, end } = monthRange(month);
  return listAll(token, `${KIND_PATH[kind]}?range=5&startDate=${start}&endDate=${end}`);
}

// ทุกใบของปีปัจจุบัน (range=7) — ใช้หายอดค้างชำระ
export async function listYear(token, kind) {
  return listAll(token, `${KIND_PATH[kind]}?range=7`);
}

async function listAll(token, query) {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const json = await api(token, "GET", `${query}&currentPage=${page}&pageSize=100`);
    const list = json.data?.list ?? [];
    out.push(...list);
    if (list.length < 100 || out.length >= Number(json.data?.totalDocument ?? 0)) break;
  }
  return out.filter(d => !bool(d.isDelete)).sort((a, b) => String(a.documentSerial).localeCompare(String(b.documentSerial)));
}

// GET by id ตอบ data.list[0] (สลับกับตอน POST ที่ตอบ data ตรง ๆ)
export async function getDoc(token, kind, id) {
  const json = await api(token, "GET", `${KIND_PATH[kind]}/${id}`);
  return json.data?.list?.[0] ?? json.data;
}

export async function createDoc(token, kind, payload) {
  const json = await api(token, "POST", KIND_PATH[kind], payload);
  const data = json.data;
  if (!data?.recordId) throw new Error(`สร้างแล้วแต่ไม่ได้ recordId: ${JSON.stringify(json).slice(0, 300)}`);
  return { recordId: String(data.recordId), documentSerial: String(data.documentSerial) };
}

// ลบได้เฉพาะสถานะรอดำเนินการ (allowDelete) — FlowAccount ลบแบบ soft (isDelete) และ
// จะนำเลขที่เอกสารกลับมาใช้ใหม่ถ้าเป็นใบล่าสุดของเดือน
export async function deleteDoc(token, kind, id) {
  await api(token, "DELETE", `${KIND_PATH[kind]}/${id}`);
}

// body {} จำเป็น — POST เปล่าตอบ 415
export async function exportPdf(token, kind, id) {
  const json = await api(token, "POST", `${KIND_PATH[kind]}/${id}/export-pdf/base64`, {});
  const bytes = Buffer.from(json.data, "base64");
  if (!bytes.subarray(0, 4).equals(Buffer.from("%PDF"))) throw new Error("ข้อมูลที่ได้ไม่ใช่ PDF");
  return bytes;
}

// Google Drive for desktop ปฏิเสธชื่อไฟล์ที่ยาวเกิน 255 ไบต์ (EINVAL) — ภาษาไทยกิน 3 ไบต์
// ต่อตัว ชื่อบริษัทยาว ๆ จึงเกินเมื่อรวมชื่อผู้ออกไว้ข้างหน้า สำนักงานเองก็ตัดชื่อผู้ออก
// ทิ้งกับรายพวกนี้อยู่แล้ว (ดูไฟล์ INV2026080020_… ใน 07.2569) จึงทำแบบเดียวกัน
export function pdfFileName(serial, contactName) {
  const full = `${ISSUER_NAME}_${serial}_${safeName(contactName)}.pdf`;
  return Buffer.byteLength(full, "utf8") <= 255 ? full : `${serial}_${safeName(contactName)}.pdf`;
}

export async function exportPdfToFolder(token, kind, doc, folder) {
  fs.mkdirSync(folder, { recursive: true });
  const bytes = await exportPdf(token, kind, doc.recordId);
  const file = path.join(folder, pdfFileName(doc.documentSerial, doc.contactName));
  // Google Drive for desktop (stream) ตอบ EINVAL ให้ไฟล์แรกในโฟลเดอร์ที่เพิ่งสร้างอยู่
  // บ้าง — รอแล้วลองใหม่ ไม่ใช่ path ผิด (เขียนซ้ำอีกครู่ผ่าน)
  for (let attempt = 0; ; attempt++) {
    try {
      fs.writeFileSync(file, bytes);
      return file;
    } catch (err) {
      if (attempt >= 3) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }
}

// SimpleDocument payload จากเอกสารต้นแบบ + รายการใหม่ (ใช้ทั้งใบแจ้งหนี้และใบวางบิล)
// isVat false เสมอ — สำนักงานยังไม่จด VAT; หัก ณ ที่จ่ายเป็นระดับเอกสาร (3% ทั้งใบ)
export function buildPayload(template, { publishedOn, items, whtRate }) {
  const subTotal = round2(items.reduce((s, it) => s + Number(it.total), 0));
  const rate = Number(whtRate ?? 0);
  const whtAmount = round2((subTotal * rate) / 100);
  const creditDays = Number(template.creditDays ?? 0);
  return {
    recordId: 0,
    contactId: Number(template.contactId),
    contactName: template.contactName,
    contactAddress: template.contactAddress ?? "",
    contactTaxId: template.contactTaxId ?? "",
    contactBranch: template.contactBranch ?? "สำนักงานใหญ่",
    contactGroup: Number(template.contactGroup ?? 3),
    publishedOn,
    creditType: Number(template.creditType ?? 1),
    creditDays,
    dueDate: addDays(publishedOn, creditDays),
    isVatInclusive: false,
    useReceiptDeduction: false,
    subTotal,
    discountPercentage: 0,
    discountAmount: 0,
    totalAfterDiscount: subTotal,
    isVat: false,
    vatAmount: 0,
    grandTotal: subTotal,
    documentShowWithholdingTax: rate > 0,
    documentWithholdingTaxPercentage: rate,
    documentWithholdingTaxAmount: whtAmount,
    documentDeductionType: 0,
    documentDeductionAmount: 0,
    remarks: template.remarks ?? "",
    internalNotes: "",
    showSignatureOrStamp: true,
    documentStructureType: "SimpleDocument",
    saleAndPurchaseChannel: 0,
    items: items.map(it => ({
      type: 1, // บริการ
      name: it.name,
      description: "",
      quantity: 1,
      unitName: it.unitName ?? "",
      pricePerUnit: Number(it.total),
      total: Number(it.total),
    })),
  };
}

// ---------------------------------------------------------------------------
// โฟลเดอร์ใน Drive
// ---------------------------------------------------------------------------
// Map<documentSerial, โฟลเดอร์เดือนที่เก็บไฟล์นั้น> ดูเฉพาะโฟลเดอร์ชื่อ MM.YYYY ลึกไม่เกิน
// 2 ชั้นใต้โฟลเดอร์บริษัท (บางบริษัทมีชั้น "ใบแจ้งหนี้" คั่น) — Drive แบบ stream ช้า
// จึงไม่ไล่ทุกไฟล์ทั้งต้น
export function indexMonthFolders(root, monthBE) {
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
          const m = f.match(/((?:INV|BL)\d{10})/);
          if (m && f.toLowerCase().endsWith(".pdf")) index.set(m[1], p);
        }
      } else if (depth < 2) visit(p, depth + 1);
    }
  };
  for (const e of fs.readdirSync(root, { withFileTypes: true })) if (e.isDirectory()) visit(path.join(root, e.name), 1);
  return index;
}

// ---------------------------------------------------------------------------
// เดือน / เงิน / ข้อความ
// ---------------------------------------------------------------------------
// เดือนบริการของใบที่ออกเดือน issued = เดือนก่อนหน้า (ออกวันที่ 1 ย้อนหลัง)
export function serviceMonthOf(issued) {
  const [y, m] = issued.split("-").map(Number);
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}
export const prevMonth = ym => {
  const { y, m } = serviceMonthOf(ym);
  return `${y}-${String(m).padStart(2, "0")}`;
};
export const monthFolderBE = ({ y, m }) => `${String(m).padStart(2, "0")}.${y + 543}`;
export const thaiMonth = ({ m }) => THAI_MONTHS[m - 1];
export const monthlyFeeName = ({ m }) => `ค่าบริการทางบัญชี ประจำเดือน${THAI_MONTHS[m - 1]}`;
export const itemName = d => d.items?.[0]?.name ?? "";
export const isMonthlyFee = d => /ประจำเดือน/.test(itemName(d)) && String(d.publishedOn ?? "").slice(8, 10) === "01";
export const isUnpaid = d => String(d.status) !== "9" && !bool(d.isDelete);
export const bool = v => v === true || v === "true" || v === 1 || v === "1";
export const round2 = n => Math.round(n * 100) / 100;
export const money = n => (n == null || n === "" ? "-" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 }));
export const trunc = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
export const safeName = s => String(s).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// คีย์เทียบชื่อบริษัทระหว่างชีตกับ FlowAccount เมื่อไม่มีเลขผู้เสียภาษี: ตัดช่องว่าง/วงเล็บ/
// คำนำหน้า-ต่อท้ายที่สะกดต่างกันบ่อย ("หจก." vs "ห้างหุ้นส่วนจำกัด")
export const nameKey = s =>
  String(s ?? "")
    .replace(/\(.*?\)/g, "")
    .replace(/ห้างหุ้นส่วนจำกัด|หจก\s*\.?/g, "")
    .replace(/บริษัท|จำกัด|จํากัด/g, "")
    .replace(/[\s.,]/g, "");

// ---------------------------------------------------------------------------
// log ของรอบรัน
// ---------------------------------------------------------------------------
export function loadRun(name, empty) {
  const file = path.join(RUNS_DIR, `${name}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : empty;
}
export function saveRun(name, run) {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RUNS_DIR, `${name}.json`), JSON.stringify(run, null, 2));
}

// ---------------------------------------------------------------------------
// ตาราง
// ---------------------------------------------------------------------------
export function printTable(rows) {
  if (!rows.length) return console.log("(ว่าง)");
  const cols = Object.keys(rows[0]);
  const width = Object.fromEntries(cols.map(c => [c, Math.max(dw(c), ...rows.map(r => dw(r[c])))]));
  const line = r => cols.map(c => pad(r[c], width[c])).join("  ");
  console.log(line(Object.fromEntries(cols.map(c => [c, c]))));
  console.log(cols.map(c => "─".repeat(width[c])).join("  "));
  for (const r of rows) console.log(line(r));
}
// สระบน/ล่าง/วรรณยุกต์ไทยไม่กินความกว้าง — นับเฉพาะตัวที่มีความกว้างจริง
const dw = s => [...String(s ?? "")].filter(ch => !/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(ch)).length;
const pad = (s, w) => String(s ?? "") + " ".repeat(Math.max(0, w - dw(s)));

export function parseArgs(list) {
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
