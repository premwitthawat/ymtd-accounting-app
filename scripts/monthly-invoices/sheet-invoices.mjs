// เทียบ "ใบแจ้งหนี้.xlsx" (สิ่งที่สำนักงานตั้งใจเก็บเดือนนี้) กับเอกสารจริงใน FlowAccount
// แล้วปรับให้ตรงกัน: สร้างใบที่ขาด · ลบใบที่ชีตบอกว่าไม่ออก · ออกใบวางบิลรวมยอดค้าง
// · ดึง PDF ลง Drive · ลบ PDF ของใบที่ถูกลบ
//
// ทำไมต้องมีชีตทับอีกชั้น ทั้งที่ create-invoices.mjs โคลนเดือนก่อนได้แล้ว: ค่าบริการ
// ไม่ได้คงที่ทุกเดือน — บางรายหยุด/ส่งแยก บางรายค้างหลายเดือนแล้วต้องรวมเป็นใบวางบิล
// ชีตคือที่ที่เจ้าของตัดสินใจเรื่องพวกนี้ สคริปต์แค่ทำให้ FlowAccount ตรงกับชีต
//
//   node scripts/monthly-invoices/sheet-invoices.mjs plan  --target 2026-09
//   node scripts/monthly-invoices/sheet-invoices.mjs apply --target 2026-09 --yes
//
//   --target  เดือนที่ออกเอกสาร (วันที่ 1) → อ่านคอลัมน์เดือนบริการ = เดือนก่อนหน้าในชีต ปี<พ.ศ.>
//   --date    วันที่ออกเอกสาร (ค่าเริ่มต้น วันที่ 1 ของ --target)
//   --sheet   path ของ ใบแจ้งหนี้.xlsx (ค่าเริ่มต้น: ในโฟลเดอร์ Drive)
//
// กติกาอ่านชีต (บล็อก "ใบแจ้งหนี้" / "ใบวางบิล" คอลัมน์เดือนบริการ):
//   ใบแจ้งหนี้ = ยอด  → ต้องมีใบแจ้งหนี้ยอดนั้น 1 ใบ (ไม่มี → สร้าง, ยอดไม่ตรง → รายงาน ไม่แก้เอง)
//   ใบแจ้งหนี้ ว่าง/0 → เดือนนี้ไม่ออก (ถ้ามีอยู่และยังสถานะรอดำเนินการ → ลบ)
//   ใบวางบิล   = ยอด  → ออกใบวางบิลรวม: ใบที่ยังค้าง (status ≠ ชำระแล้ว) ก่อนเดือนนี้ + ใบเดือนนี้
//                        ยอดรวมต้องเท่ากับชีต ไม่เท่า → รายงาน ไม่ออก
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  DRIVE_ROOT, SHEET_PATH, KIND_LABEL, here,
  getToken, listDocs, listYear, createDoc, deleteDoc, exportPdfToFolder, buildPayload, pdfFileName,
  indexMonthFolders, serviceMonthOf, prevMonth, monthFolderBE, thaiMonth, monthlyFeeName, itemName,
  isMonthlyFee, isUnpaid, bool, money, trunc, nameKey, loadRun, saveRun, printTable, parseArgs, safeName,
} from "./lib.mjs";

function help() {
  console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).slice(0, 22).map(l => l.slice(3)).join("\n"));
}

async function plan() {
  const { rows } = await buildPlan();
  printPlan(rows);
  console.log("\nนี่คือ dry-run — ยังไม่ได้แตะอะไร ถ้าถูกต้องให้รัน apply ... --yes");
}

// ---------------------------------------------------------------------------
// แผน
// ---------------------------------------------------------------------------
async function buildPlan() {
  const target = args.target;
  if (!target || !/^\d{4}-\d{2}$/.test(String(target))) throw new Error("ต้องระบุ --target YYYY-MM");
  const publishedOn = args.date ?? `${target}-01`;
  const service = serviceMonthOf(target); // เดือนบริการที่เก็บ = คอลัมน์ในชีต
  const folderBE = monthFolderBE(service);
  const source = prevMonth(target); // ชุดเดือนก่อน = ต้นแบบ contact/หัก ณ ที่จ่าย/เครดิต + ที่อยู่โฟลเดอร์
  const sourceFolderBE = monthFolderBE(serviceMonthOf(source));

  const sheet = readSheet(args.sheet ?? SHEET_PATH, service.y + 543);
  console.log(`ชีต ปี${service.y + 543} คอลัมน์ ${thaiMonth(service)}: ${sheet.length} แถว · ออกเอกสารวันที่ ${publishedOn} · โฟลเดอร์ ${folderBE}`);

  const token = await getToken();
  const [targetInv, sourceInv, yearInv, targetBill] = await Promise.all([
    listDocs(token, "invoice", target),
    listDocs(token, "invoice", source),
    listYear(token, "invoice"),
    listDocs(token, "billing", target),
  ]);
  console.log(`FlowAccount: ใบแจ้งหนี้เดือน ${target} ${targetInv.length} ใบ · ต้นแบบเดือน ${source} ${sourceInv.length} ใบ · ใบวางบิลเดือน ${target} ${targetBill.length} ใบ`);
  console.log(`กำลังหาโฟลเดอร์ ${sourceFolderBE} ใน Drive ...`);
  const folderIndex = indexMonthFolders(DRIVE_ROOT, sourceFolderBE);

  // contact key = เลขผู้เสียภาษี ถ้ามี ไม่งั้นชื่อแบบตัดคำ (เจทูเคใน FlowAccount ไม่มีเลข)
  const keyOf = d => (String(d.contactTaxId ?? "").trim() || `name:${nameKey(d.contactName)}`);
  const keyOfRow = r => (r.taxId || `name:${nameKey(r.name)}`);
  const byKey = list => {
    const m = new Map();
    for (const d of list) {
      const k = keyOf(d);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    }
    return m;
  };
  const targetByKey = byKey(targetInv.filter(isMonthlyFee));
  const templateByKey = byKey(sourceInv.filter(isMonthlyFee));
  // ชื่อ → key ของทุกใบที่ FlowAccount รู้จัก ใช้เมื่อเลขผู้เสียภาษีสองฝั่งไม่ตรง/ขาดไปข้างหนึ่ง
  const nameIndex = new Map([...templateByKey.keys(), ...targetByKey.keys()].map(k => [nameKey((templateByKey.get(k) ?? targetByKey.get(k))[0].contactName), k]));
  const resolveKey = r => {
    const k = keyOfRow(r);
    if (templateByKey.has(k) || targetByKey.has(k)) return k;
    return nameIndex.get(nameKey(r.name)) ?? k; // ชีตไม่มีเลข แต่ FlowAccount มี → เทียบชื่อ
  };
  const targetStart = `${target}-01`;
  const unpaidBefore = yearInv.filter(d => isUnpaid(d) && String(d.publishedOn).slice(0, 10) < targetStart);
  const unpaidByKey = byKey(unpaidBefore);
  const billByKey = byKey(targetBill);
  const folderOfKey = new Map();
  for (const d of sourceInv) {
    const f = folderIndex.get(d.documentSerial);
    if (f) folderOfKey.set(keyOf(d), path.join(path.dirname(f), folderBE));
  }

  const run = loadRun(`${target}-sheet`, { target, invoices: {}, billing: {}, deleted: {} });
  const rows = [];
  const seen = new Set();
  let quiet = 0;
  for (const r of sheet) {
    const key = resolveKey(r);
    // แถวที่ไม่มีทั้งเลขผู้เสียภาษี ยอดของเดือนนี้ และไม่มีใบใน FlowAccount (รายชื่อรายปี/
    // ปิดกิจการที่ค้างอยู่ท้ายชีต) — ไม่แสดง
    if (!r.taxId && !r.invoice[service.m] && !r.billing[service.m] && !targetByKey.has(key)) {
      quiet++;
      continue;
    }
    seen.add(key);
    const expected = r.invoice[service.m];
    const expectBill = r.billing[service.m];
    const actual = targetByKey.get(key) ?? [];
    const template = (templateByKey.get(key) ?? [])[0];
    const folder = folderOfKey.get(key) ?? null;
    const base = { key, name: r.name, status: r.status, folder, template, actual, expected, expectBill };

    if (!expected) {
      if (actual.length) rows.push({ ...base, action: "delete", note: `ชีตว่าง/0 แต่มี ${actual.map(d => d.documentSerial).join(", ")} → ลบ` });
      else rows.push({ ...base, action: "none", note: r.status ? `ไม่ออก (${r.status})` : "ไม่ออกเดือนนี้" });
    } else if (!actual.length) {
      if (!template) rows.push({ ...base, action: "manual", note: "ไม่มีใบเดือนก่อนให้ใช้เป็นต้นแบบ — ออกเองในเว็บครั้งแรก" });
      else if (!folder) rows.push({ ...base, action: "manual", note: `หาโฟลเดอร์ ${sourceFolderBE} ใน Drive ไม่เจอ` });
      else rows.push({ ...base, action: "create", note: `สร้าง ${money(expected)}` });
    } else if (actual.length > 1) {
      rows.push({ ...base, action: "manual", note: `มีซ้ำ ${actual.map(d => d.documentSerial).join(", ")} — ลบเองให้เหลือใบเดียว` });
    } else if (Number(actual[0].grandTotal) !== Number(expected)) {
      rows.push({ ...base, action: "mismatch", note: `${actual[0].documentSerial} ยอด ${money(actual[0].grandTotal)} ≠ ชีต ${money(expected)}` });
    } else {
      rows.push({ ...base, action: "keep", note: actual[0].documentSerial });
    }

    // ใบวางบิลรวม
    if (expectBill) {
      const existing = billByKey.get(key) ?? [];
      const outstanding = (unpaidByKey.get(key) ?? []).sort((a, b) => String(a.publishedOn).localeCompare(String(b.publishedOn)));
      const thisMonth = expected ? [{ name: monthlyFeeName(service), total: Number(expected), synthetic: true }] : [];
      const items = [...outstanding.map(d => ({ name: itemName(d), total: Number(d.grandTotal), serial: d.documentSerial })), ...thisMonth];
      const sum = items.reduce((s, it) => s + it.total, 0);
      const detail = items.map(it => `${it.serial ?? "เดือนนี้"} ${money(it.total)}`).join(" + ");
      const billBase = { ...base, kind: "billing", items };
      if (existing.length) rows.push({ ...billBase, action: "keep-bill", note: `มี ${existing.map(d => d.documentSerial).join(", ")} แล้ว` });
      else if (sum !== Number(expectBill)) rows.push({ ...billBase, action: "bill-mismatch", note: `ชีต ${money(expectBill)} แต่ค้าง+เดือนนี้ = ${money(sum)} (${detail})` });
      else if (!template) rows.push({ ...billBase, action: "manual", note: "ไม่มีต้นแบบสำหรับใบวางบิล" });
      else rows.push({ ...billBase, action: "create-bill", note: `ออกใบวางบิล ${money(sum)} = ${detail}` });
    }
  }
  // ใบใน FlowAccount ที่ชีตไม่มีชื่อเลย — ไม่แตะ แค่บอก
  for (const [key, docs] of targetByKey) {
    if (seen.has(key)) continue;
    rows.push({ key, name: docs[0].contactName, status: "", folder: null, actual: docs, action: "extra", note: `${docs.map(d => d.documentSerial).join(", ")} ไม่อยู่ในชีต — ไม่แตะ` });
  }
  if (quiet) console.log(`(ข้ามแถวที่ไม่มีเลขผู้เสียภาษีและไม่มียอดเดือนนี้ ${quiet} แถว)`);
  return { rows, token, target, publishedOn, service, folderBE, run };
}

const LABEL = {
  keep: "✔ ตรง", create: "＋ สร้าง", delete: "✖ ลบ", mismatch: "⚠ ยอดไม่ตรง", manual: "⚠ ทำเอง", none: "– ไม่ออก",
  "create-bill": "＋ วางบิล", "keep-bill": "✔ วางบิลแล้ว", "bill-mismatch": "⚠ วางบิลไม่ตรง", extra: "? นอกชีต",
};

function printPlan(rows) {
  printTable(
    rows.map(r => ({
      "บริษัท (ชีต)": trunc(r.name, 40),
      "สถานะ": r.status ?? "",
      "ใบแจ้งหนี้ชีต": r.kind === "billing" ? "" : money(r.expected),
      "ใน FlowAccount": r.kind === "billing" ? "" : (r.actual ?? []).map(d => `${d.documentSerial} ${money(d.grandTotal)}`).join(" | ") || "-",
      "ผล": `${LABEL[r.action]} — ${r.note}`,
    }))
  );
  const n = a => rows.filter(r => r.action === a).length;
  console.log(`\nตรง ${n("keep")} · สร้าง ${n("create")} · ลบ ${n("delete")} · ยอดไม่ตรง ${n("mismatch")} · ทำเอง ${n("manual")} · ไม่ออก ${n("none")} · นอกชีต ${n("extra")} · วางบิล: สร้าง ${n("create-bill")} มีแล้ว ${n("keep-bill")} ไม่ตรง ${n("bill-mismatch")}`);
}

// ---------------------------------------------------------------------------
// ทำจริง
// ---------------------------------------------------------------------------
async function apply() {
  const { rows, token, target, publishedOn, service, folderBE, run } = await buildPlan();
  printPlan(rows);
  const todo = rows.filter(r => ["create", "delete", "create-bill"].includes(r.action));
  const missingPdf = rows.filter(r => r.action === "keep" && r.folder && !fs.existsSync(path.join(r.folder, pdfFileName(r.actual[0].documentSerial, r.actual[0].contactName))));
  if (!todo.length && !missingPdf.length) return console.log("\nFlowAccount ตรงกับชีตแล้ว ไม่มีอะไรต้องทำ");
  if (!args.yes) return console.log(`\nจะทำ ${todo.length} รายการ + ดึง PDF ที่ขาด ${missingPdf.length} ใบ — ใส่ --yes เพื่อยืนยัน (ตอนนี้เป็น dry-run)`);

  // 1) ลบก่อน — ถ้าใบที่ลบเป็นใบล่าสุดของเดือน FlowAccount จะนำเลขกลับมาใช้กับใบที่สร้างถัดไป
  for (const r of rows.filter(r => r.action === "delete")) {
    for (const d of r.actual) {
      try {
        await deleteDoc(token, "invoice", d.recordId);
        run.deleted[d.documentSerial] = { recordId: d.recordId, contactName: d.contactName, grandTotal: d.grandTotal, at: new Date().toISOString() };
        saveRun(`${target}-sheet`, run);
        console.log(`  ✖ ลบ ${d.documentSerial} ${d.contactName}`);
        removeStalePdf(r.folder ?? folderOfDoc(d), d.documentSerial);
      } catch (err) {
        console.error(`  ✖ ลบ ${d.documentSerial} ไม่สำเร็จ: ${err.message}`);
      }
    }
  }
  // ไฟล์ PDF ของใบที่ถูกลบไปแล้วก่อนหน้า (เช่น ลบในเว็บ) แต่ไฟล์ยังค้างใน Drive
  await cleanupDeletedPdfs(token, rows, target);

  // 2) สร้างใบแจ้งหนี้
  const createdInv = new Map();
  for (const r of rows.filter(r => r.action === "create")) {
    try {
      const whtRate = Number(r.template.documentWithholdingTaxPercentage ?? 0);
      const payload = buildPayload(r.template, { publishedOn, whtRate, items: [{ name: monthlyFeeName(service), total: Number(r.expected) }] });
      const doc = await createDoc(token, "invoice", payload);
      const rec = { ...doc, contactName: r.template.contactName, grandTotal: r.expected, folder: r.folder, pdf: null, createdAt: new Date().toISOString() };
      run.invoices[doc.documentSerial] = rec;
      saveRun(`${target}-sheet`, run);
      createdInv.set(r.key, rec);
      console.log(`  ＋ ${doc.documentSerial} ${r.template.contactName} ${money(r.expected)}`);
    } catch (err) {
      console.error(`  ✖ สร้างของ ${r.name} ไม่สำเร็จ: ${err.message}`);
    }
  }

  // 3) ใบวางบิลรวม
  for (const r of rows.filter(r => r.action === "create-bill")) {
    try {
      const whtRate = Number(r.template.documentWithholdingTaxPercentage ?? 0);
      const payload = buildPayload(r.template, { publishedOn, whtRate, items: r.items.map(it => ({ name: it.name, total: it.total })) });
      const doc = await createDoc(token, "billing", payload);
      const rec = { ...doc, contactName: r.template.contactName, grandTotal: payload.grandTotal, items: r.items, folder: r.folder, pdf: null, createdAt: new Date().toISOString() };
      run.billing[doc.documentSerial] = rec;
      saveRun(`${target}-sheet`, run);
      console.log(`  ＋ ${doc.documentSerial} ใบวางบิล ${r.template.contactName} ${money(payload.grandTotal)}`);
    } catch (err) {
      console.error(`  ✖ ออกใบวางบิลของ ${r.name} ไม่สำเร็จ: ${err.message}`);
    }
  }

  // 4) PDF: ใบที่สร้างรอบนี้ + ใบที่ตรงอยู่แล้วแต่ไฟล์ขาด
  const pdfJobs = [
    ...Object.values(run.invoices).filter(c => !c.pdf || !fs.existsSync(c.pdf)).map(c => ({ kind: "invoice", doc: c, folder: c.folder, rec: c })),
    ...Object.values(run.billing).filter(c => !c.pdf || !fs.existsSync(c.pdf)).map(c => ({ kind: "billing", doc: c, folder: c.folder, rec: c })),
    ...missingPdf.map(r => ({ kind: "invoice", doc: r.actual[0], folder: r.folder })),
  ];
  if (pdfJobs.length) console.log(`\nกำลังดึง PDF ${pdfJobs.length} ใบลง Drive ...`);
  for (const j of pdfJobs) {
    try {
      const folder = j.folder ?? path.join(DRIVE_ROOT, "_unsorted", folderBE);
      const file = await exportPdfToFolder(token, j.kind, j.doc, folder);
      if (j.rec) {
        j.rec.pdf = file;
        saveRun(`${target}-sheet`, run);
      }
      console.log(`  ✔ ${j.doc.documentSerial} → ${path.relative(DRIVE_ROOT, file)}`);
    } catch (err) {
      console.error(`  ✖ PDF ${j.doc.documentSerial}: ${err.message} (รัน apply ซ้ำเพื่อลองใหม่)`);
    }
  }
  console.log("\nเสร็จ — รัน plan อีกครั้งเพื่อตรวจว่า FlowAccount ตรงกับชีตแล้ว");
}

// ไฟล์ PDF ในโฟลเดอร์เดือนนี้ที่เลขที่เอกสารไม่ตรงกับใบที่ยังมีอยู่จริงของบริษัทนั้น —
// เกิดเมื่อใบถูกลบในเว็บแล้ว FlowAccount เอาเลขไปให้บริษัทอื่น (เกิดแล้วกับ INV2026090001)
async function cleanupDeletedPdfs(token, rows, target) {
  const live = new Map(); // serial → contactName ของใบที่ยังอยู่
  for (const d of await listDocs(token, "invoice", target)) live.set(d.documentSerial, d.contactName);
  for (const d of await listDocs(token, "billing", target)) live.set(d.documentSerial, d.contactName);
  const folders = new Set(rows.map(r => r.folder).filter(Boolean));
  for (const folder of folders) {
    if (!fs.existsSync(folder)) continue;
    for (const f of fs.readdirSync(folder)) {
      const m = f.match(/((?:INV|BL)\d{10})/);
      if (!m || !f.toLowerCase().endsWith(".pdf")) continue;
      const owner = live.get(m[1]);
      const fileContact = f.replace(/^.*?_(?:INV|BL)\d{10}_/, "").replace(/\.pdf$/i, "");
      if (owner && safeName(owner) === fileContact) continue; // ไฟล์ของใบที่ยังอยู่และเป็นบริษัทเดียวกัน
      fs.unlinkSync(path.join(folder, f));
      console.log(`  🗑 ลบไฟล์ค้าง ${path.relative(DRIVE_ROOT, path.join(folder, f))} (${owner ? "เลขนี้เป็นของ " + owner : "เอกสารถูกลบแล้ว"})`);
    }
  }
}

function removeStalePdf(folder, serial) {
  if (!folder || !fs.existsSync(folder)) return;
  for (const f of fs.readdirSync(folder)) if (f.includes(`_${serial}_`)) fs.unlinkSync(path.join(folder, f));
}
function folderOfDoc() {
  return null;
}

// ---------------------------------------------------------------------------
// ชีต
// ---------------------------------------------------------------------------
function readSheet(file, yearBE) {
  if (!fs.existsSync(file)) throw new Error(`ไม่พบชีต ${file}`);
  const out = execFileSync("python", [path.join(here, "read-sheet.py"), file, String(yearBE)], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(out).map(r => ({
    ...r,
    invoice: Object.fromEntries(Object.entries(r.invoice).map(([m, v]) => [Number(m), v])),
    billing: Object.fromEntries(Object.entries(r.billing).map(([m, v]) => [Number(m), v])),
  }));
}

// entry point — อยู่ท้ายไฟล์เพราะ const ด้านบนต้องประกาศก่อนใช้
const [, , command = "help", ...rest] = process.argv;
const args = parseArgs(rest);

const commands = { plan, apply, help };
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
