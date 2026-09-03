// ทดลองวงแคบกับกลุ่ม LINE "เจน นุ่น โบว์": ออกใบแจ้งหนี้ทดสอบชื่อ "test" ใน FlowAccount
// แล้วส่งข้อความ + ลิงก์เอกสารเข้ากลุ่มด้วย LINE Messaging API โดยตรง — ไม่แตะลูกค้าจริง
// ไม่แตะ Supabase (ขาออกอย่างเดียว; ขารับคำสั่ง "จ่ายแล้ว" ต้องรอ deploy edge functions)
//
//   node scripts/monthly-invoices/line-test.mjs invoice            สร้าง contact "test" + ใบแจ้งหนี้ 1 บาท
//   node scripts/monthly-invoices/line-test.mjs share --record <id>   ขอลิงก์แชร์เอกสาร
//   node scripts/monthly-invoices/line-test.mjs push --text "..."     ส่งข้อความเข้ากลุ่มทดสอบ
//   node scripts/monthly-invoices/line-test.mjs receipt --record <id> ออกใบเสร็จอ้างใบ test (ขั้นทดสอบจ่ายแล้ว)
//
// ต้องมีใน .env เพิ่ม (นอกจาก FlowAccount):
//   LINE_CHANNEL_ACCESS_TOKEN=...   จาก LINE Developers console → Messaging API
//   LINE_TEST_GROUP_ID=C...         groupId ของกลุ่ม เจน นุ่น โบว์ (ขึ้นต้น C ตามด้วย 32 ตัว)
import fs from "node:fs";
import path from "node:path";
import { here, api, getToken, createDoc } from "./lib.mjs";
import * as lib from "./lib.mjs";

const args = lib.parseArgs(process.argv.slice(3));
const command = process.argv[2] ?? "help";
const todayBangkok = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const GROUP_ID = args.group ?? process.env.LINE_TEST_GROUP_ID;
const RUN = "line-test";

const commands = { invoice, share, push, receipt, help };
try {
  await (commands[command] ?? help)();
} catch (err) {
  console.error("\n✖", err instanceof Error ? err.message : err);
  process.exit(1);
}

function help() {
  console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).map(l => l.slice(3)).join("\n"));
}

function loadState() {
  return lib.loadRun(RUN, { contactId: null, invoices: {}, receipts: {}, pushes: [] });
}

// contact ชื่อ "test" หนึ่งรายพอ — สร้างซ้ำจะกลายเป็นผู้ติดต่อขยะในสมุดรายชื่อจริง
async function ensureTestContact(token, state) {
  if (state.contactId) return state.contactId;
  const found = await api(token, "GET", `contacts?currentPage=1&pageSize=20&searchString=test`);
  const existing = (found.data?.list ?? []).find(c => String(c.contactName).trim().toLowerCase() === "test");
  if (existing) {
    state.contactId = String(existing.id);
  } else {
    const res = await api(token, "POST", "contacts", {
      contactName: "test",
      contactType: 3,
      contactGroup: 3,
      contactCode: "YMTD-TEST",
      contactAddress: "สำหรับทดสอบระบบ — เอกสารภายใต้ผู้ติดต่อนี้ลบทิ้งได้เสมอ",
      contactTaxId: "",
      contactBranch: "สำนักงานใหญ่",
      contactBranchCode: "00000",
    });
    const created = res.data?.list?.[0];
    if (!created?.id) throw new Error(`สร้าง contact test ไม่สำเร็จ: ${JSON.stringify(res).slice(0, 300)}`);
    state.contactId = String(created.id);
  }
  lib.saveRun(RUN, state);
  return state.contactId;
}

async function invoice() {
  const token = await getToken();
  const state = loadState();
  const contactId = await ensureTestContact(token, state);
  console.log(`contact test = ${contactId}`);
  const amount = Number(args.amount ?? 1);
  const publishedOn = args.date ?? todayBangkok();
  const doc = await createDoc(token, "invoice", lib.buildPayload(
    { contactId, contactName: "test", contactAddress: "สำหรับทดสอบระบบ", contactTaxId: "", creditDays: 0, creditType: 1, remarks: "เอกสารทดสอบระบบ — ไม่ใช่รายการค้าจริง" },
    { publishedOn, whtRate: 0, items: [{ name: "test", total: amount }] }
  ));
  state.invoices[doc.documentSerial] = { ...doc, amount, publishedOn, createdAt: publishedOn };
  lib.saveRun(RUN, state);
  console.log(`✔ ออกใบแจ้งหนี้ทดสอบ ${doc.documentSerial} (recordId ${doc.recordId}) ยอด ${amount} บาท ลงวันที่ ${publishedOn}`);
  console.log(`ต่อไป: node scripts/monthly-invoices/line-test.mjs share --record ${doc.recordId}`);
}

// ลิงก์เอกสารสาธารณะจาก FlowAccount เอง — ไม่ต้องพึ่ง Supabase storage ในเฟสทดสอบ
async function share() {
  const token = await getToken();
  const recordId = requireArg("record");
  const state = loadState();
  // ลองทั้งสอง shape ที่ API รุ่นนี้ใช้กันอยู่ (path-param และ body) — อันไหนติดใช้อันนั้น
  // ตาม swagger: body = {documentId (= recordId), culture} และลิงก์อยู่ที่ data.link
  const attempts = [
    ["POST", `tax-invoices/sharedocument`, { documentId: Number(recordId), culture: "th" }],
  ];
  for (const [method, p, body] of attempts) {
    try {
      const res = await api(token, method, p, body);
      console.log(`✔ ${method} /${p} →`, JSON.stringify(res).slice(0, 500));
      const url = res.data?.link ?? res.data?.url ?? (typeof res.data === "string" ? res.data : null);
      if (url) {
        const serial = Object.keys(state.invoices).find(s => state.invoices[s].recordId === String(recordId));
        if (serial) {
          state.invoices[serial].shareUrl = url;
          lib.saveRun(RUN, state);
        }
        console.log(`\nลิงก์เอกสาร: ${url}`);
      }
      return;
    } catch (err) {
      console.log(`  ✖ ${method} /${p}: ${err.message.slice(0, 160)}`);
    }
  }
  throw new Error("ยังหา endpoint แชร์ลิงก์ที่ใช้ได้ไม่เจอ — ใช้ PDF แนบมือไปก่อน หรือรอผลตรวจ swagger");
}

async function push() {
  if (!LINE_TOKEN) throw new Error(`ยังไม่มี LINE_CHANNEL_ACCESS_TOKEN ใน ${path.join(here, ".env")} — เอาจาก LINE Developers console → ช่อง Messaging API → Channel access token (long-lived)`);
  if (!GROUP_ID) throw new Error("ยังไม่มี LINE_TEST_GROUP_ID (groupId ของกลุ่ม เจน นุ่น โบว์) — ใส่ใน .env หรือส่ง --group C…");
  if (!/^C[0-9a-f]{32}$/.test(GROUP_ID)) throw new Error(`groupId หน้าตาไม่ถูก (${GROUP_ID}) — ต้องขึ้นต้น C ตามด้วย 32 ตัวอักษร/เลข`);
  const text = args.text;
  if (!text) throw new Error("ต้องระบุ --text ข้อความที่จะส่ง");
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to: GROUP_ID, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) throw new Error(`LINE push ไม่สำเร็จ (${res.status}): ${await res.text()}`);
  const state = loadState();
  state.pushes.push({ groupId: GROUP_ID, text, at: args.date ?? "" });
  lib.saveRun(RUN, state);
  console.log("✔ ส่งเข้ากลุ่มแล้ว");
}

// จำลองขั้น "ลูกค้าจ่ายแล้ว" ของจริง: ใบเสร็จต้องอ้างใบแจ้งหนี้เสมอ (FlowAccount เลิกใบเสร็จเดี่ยว)
async function receipt() {
  const token = await getToken();
  const recordId = requireArg("record");
  const state = loadState();
  const serial = Object.keys(state.invoices).find(s => state.invoices[s].recordId === String(recordId));
  if (!serial) throw new Error(`ไม่พบใบ recordId ${recordId} ใน runs/line-test.json`);
  const inv = state.invoices[serial];
  const publishedOn = args.date ?? inv.publishedOn;
  const payload = {
    ...lib.buildPayload(
      { contactId: state.contactId, contactName: "test", contactAddress: "สำหรับทดสอบระบบ", contactTaxId: "", creditDays: 0, creditType: 3, remarks: `รับชำระตามใบแจ้งหนี้ ${serial} (ทดสอบระบบ)` },
      { publishedOn, whtRate: 0, items: [{ name: "test", total: inv.amount }] }
    ),
    documentReference: [{ recordId: Number(inv.recordId), referenceDocumentSerial: serial, referenceDocumentType: 7 }],
  };
  // ใบเสร็จสร้างที่ /upgrade/receipts (POST /receipts ตรง ๆ ถูกปลดระวางแล้ว) แต่ดึง PDF
  // ที่ /receipts/{id} — path ไม่สมมาตร จึงไม่เข้า KIND_PATH ของ lib
  const res = await api(token, "POST", "upgrade/receipts", payload);
  if (!res.data?.recordId) throw new Error(`ออกใบเสร็จแล้วแต่ไม่ได้ recordId: ${JSON.stringify(res).slice(0, 300)}`);
  const doc = { recordId: String(res.data.recordId), documentSerial: String(res.data.documentSerial) };
  state.receipts[doc.documentSerial] = { ...doc, forInvoice: serial, publishedOn };
  lib.saveRun(RUN, state);
  console.log(`✔ ออกใบเสร็จทดสอบ ${doc.documentSerial} อ้าง ${serial}`);
}

function requireArg(name) {
  const v = args[name];
  if (!v) throw new Error(`ต้องระบุ --${name}`);
  return String(v);
}
