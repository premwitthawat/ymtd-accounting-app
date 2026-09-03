const fs = require("fs");
const path = require("path");
const { Page, file, TOP } = require("./bpmn.cjs");

const pages = [];

// ---------------------------------------------------------------------------
// Lane presets (หน้าที่ / role ที่ใช้ซ้ำทุกหน้า)
// ---------------------------------------------------------------------------
const L = {
  OM: { key: "OM", label: "เจ้าของ / ผู้จัดการ", kind: "human" },
  EMP: { key: "EMP", label: "พนักงานบัญชี", kind: "human" },
  STAFF: { key: "STAFF", label: "พนักงาน (ผูก LINE ID แล้ว)", kind: "human" },
  APP: { key: "APP", label: "เว็บแอป (React)", kind: "app" },
  DB: { key: "DB", label: "Supabase DB / Auth / Storage", kind: "backend" },
  FN: { key: "FN", label: "Edge Function", kind: "backend" },
  GH: { key: "GH", label: "GitHub Actions (ตัวตั้งเวลา)", kind: "sched" },
};

// ===========================================================================
// P0 ภาพรวมกระบวนการ
// ===========================================================================
{
  const p = new Page("0 ภาพรวม", {
    title: "ภาพรวมกระบวนการทั้งหมด — ระบบติดตามงานบัญชี YMTD",
    subtitle:
      "แต่ละกล่องคือกระบวนการย่อย (Collapsed Sub-Process) ที่มีแผนภาพ BPMN แยกหน้าของตัวเอง · เส้นทึบ = ลำดับก่อน-หลัง · เส้นประ = ข้อความข้ามองค์กร (Message Flow)",
    cols: 10,
    colW: 205,
  });
  p.pool("FlowAccount (OpenAPI)", [], { key: "FA", height: 60 });
  p.pool("สำนักงานบัญชี YMTD", [
    { ...L.OM, height: 170 },
    { ...L.EMP, height: 120 },
    { key: "SYS", label: "ระบบ (อัตโนมัติ)", kind: "backend", height: 170 },
  ]);
  p.pool("ลูกค้า (กลุ่ม LINE ของแต่ละบริษัท)", [], { key: "CUST", height: 60 });

  const S = [150, 64];
  p.node("s", "OM", 0, "start", "เริ่มใช้ระบบ", { dy: -30 });
  p.node("p1", "OM", 1, "sub", "P1 เข้าสู่ระบบ", { size: S, dy: -30 });
  p.node("p2", "OM", 2, "sub", "P2 จัดการผู้ใช้และ\nผูก LINE ID พนักงาน", { size: S, dy: -30 });
  p.node("p3", "OM", 3, "sub", "P3 ตั้งค่าบริษัทและ\nบริการที่ต้องยื่น", { size: S, dy: -30 });
  p.node("p4", "OM", 4, "sub", "P4 เชื่อมกลุ่ม LINE\nกับบริษัท", { size: S, dy: -30 });
  p.node("p5", "EMP", 5, "sub", "P5 งานยื่นภาษี\nประจำเดือน", { size: S });
  p.node("p6", "OM", 6, "sub", "P6 แจ้งชำระและ\nทวงถามทาง LINE", { size: S, dy: -30 });
  p.node("p7", "SYS", 7, "sub", "P7 รับสลิปและ\nยืนยันการชำระ", { size: S, dy: -40 });
  p.node("p8", "OM", 8, "sub", "P8 ออกใบเสร็จ\nค่าบริการยื่นภาษี", { size: S, dy: -30 });
  p.node("p9", "SYS", 3.5, "sub", "P9 ใบแจ้งหนี้ค่าบริการ\nรายเดือน (ทุกวันที่ 1)", { size: S, dy: 40 });
  p.node("p10", "SYS", 5.5, "sub", "P10 รับชำระใบแจ้งหนี้\n+ ออกใบเสร็จอัตโนมัติ", { size: S, dy: 40 });
  p.node("p11", "SYS", 0.3, "sub", "P11 นำระบบขึ้นใช้งาน\n(Deploy / Go-live)", { size: S, dy: -40 });
  p.node("e", "OM", 9, "end", "จบรอบเดือน", { dy: -30 });

  p.edge("s", "p1");
  p.edge("p1", "p2");
  p.edge("p2", "p3");
  p.edge("p3", "p4");
  p.edge("p4", "p5", "", "seq", { exit: [1, 0.5], entry: [0.5, 0] });
  p.edge("p5", "p6", "งานเสร็จ → เก็บเงิน", "seq", { exit: [1, 0.5], entry: [0.5, 1] });
  p.edge("p6", "p7", "", "seq", { exit: [1, 0.5], entry: [0.5, 0] });
  p.edge("p7", "p8", "ชำระแล้ว", "seq", { exit: [0.5, 0], entry: [0.5, 1], lx: -0.3 });
  p.edge("p8", "e");
  p.edge("p4", "p9", "กรอกค่าบริการรายเดือนไว้", "seq", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("p9", "p10");
  p.edge("p10", "e", "", "seq", { exit: [1, 0.5], entry: [0.5, 1], via: [[9, "SYS", 40]] });
  p.edge("p11", "p1", "ระบบพร้อมใช้", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("p6", "CUST", "เตือนชำระ", "msg", { shift: -20 });
  p.edge("CUST", "p7", "สลิป / “clear”", "msg");
  p.edge("p9", "CUST", "ใบแจ้งหนี้ PDF", "msg");
  p.edge("p10", "CUST", "ใบเสร็จ PDF", "msg", { shift: -25, lx: -0.4 });
  p.edge("CUST", "p10", "“paid”", "msg", { shift: 25, lx: 0.4 });
  p.edge("p8", "FA", "ออกใบเสร็จ", "msg");
  p.edge("p9", "FA", "ออกใบแจ้งหนี้", "msg", { lx: 0.6 });
  p.edge("p10", "FA", "ออกใบเสร็จ", "msg", { lx: 0.6 });
  pages.push(p);
}

// ===========================================================================
// P1 เข้าสู่ระบบ
// ===========================================================================
{
  const p = new Page("P1 เข้าสู่ระบบ", {
    title: "P1 — เข้าสู่ระบบ",
    subtitle:
      "ไม่มีหน้าสมัครสมาชิก — เจ้าของ/ผู้จัดการสร้างบัญชีให้ (P2) · username + PIN ถูกแปลงเป็น email ภายใน (username@ymtd.internal) เพื่อใช้ Supabase Auth · พนักงานเห็นเฉพาะงานของตัวเอง",
    cols: 7,
    colW: 190,
  });
  p.pool("สำนักงานบัญชี YMTD", [
    { key: "EMP", label: "ผู้ใช้ทุกตำแหน่ง", kind: "human", height: 130 },
    { ...L.APP, height: 130 },
    { key: "DB", label: "Supabase Auth / DB", kind: "backend", height: 130 },
  ]);

  p.node("s1", "EMP", 0, "start", "ต้องการใช้งาน");
  p.node("t1", "EMP", 1, "user", "กรอก username และ PIN\nในหน้า Login");
  p.node("e2", "EMP", 4, "endTerminate", "ถูกตัดออกจากระบบ");
  p.node("e1", "EMP", 5, "end", "พร้อมใช้งาน");

  p.node("a1", "APP", 1, "service", "แปลง username →\nemail ภายใน แล้วเรียก\nsignInWithPassword");
  p.node("a2", "APP", 2, "task", "แสดง “ไอดีหรือ PIN\nไม่ถูกต้อง”");
  p.node("a4", "APP", 4, "service", "signOut ทันที\n(บัญชีถูกปิดใช้งาน)");
  p.node("a3", "APP", 5, "service", "เปิดหน้างาน — ล็อกตัวกรอง\nให้พนักงานเห็นเฉพาะของ\nตัวเอง, เจ้าของ/ผู้จัดการ\nเห็นทุกคน", { size: [150, 70] });

  p.node("d1", "DB", 1, "service", "Supabase Auth\nตรวจสอบ email + PIN");
  p.node("g1", "DB", 2, "xor", "ถูกต้อง?");
  p.node("d2", "DB", 3, "service", "โหลด public_profiles\n(role, label, active)");
  p.node("g2", "DB", 4, "xor", "active?");

  p.edge("s1", "t1");
  p.edge("t1", "a1");
  p.edge("a1", "d1");
  p.edge("d1", "g1");
  p.edge("g1", "a2", "ไม่", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("a2", "t1", "ลองใหม่", "seq", { exit: [0.5, 0], entry: [0.8, 1], via: [[2, "EMP", 45], [1.2, "EMP", 45]] });
  p.edge("g1", "d2", "ใช่");
  p.edge("d2", "g2");
  p.edge("g2", "a4", "ไม่", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("a4", "e2", "", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("g2", "a3", "ใช่", "seq", { exit: [1, 0.5], entry: [0.5, 1] });
  p.edge("a3", "e1", "", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.node("n1", "DB", 6, "note", "Realtime: ถ้าผู้จัดการปิดใช้งาน\nบัญชีระหว่างใช้ ผู้ใช้จะถูก\nsignOut ทันทีเช่นกัน", { size: [165, 56] });
  pages.push(p);
}

// ===========================================================================
// P2 จัดการผู้ใช้และผูก LINE ID
// ===========================================================================
{
  const p = new Page("P2 จัดการผู้ใช้-ผูก LINE ID", {
    title: "P2 — จัดการผู้ใช้และผูก LINE ID ของพนักงาน",
    subtitle:
      "ทุกการแก้ไขบัญชีผ่าน Edge Function admin-users ที่ใช้ service_role และตรวจ role ของผู้เรียกซ้ำทุกครั้ง · LINE ID ของพนักงานจำเป็นสำหรับคำสั่ง “paid” / “clear” ในกลุ่ม (P7, P10)",
    cols: 11,
    colW: 180,
  });
  p.pool("สำนักงานบัญชี YMTD", [
    { ...L.OM, height: 190 },
    { ...L.EMP, height: 130 },
    { ...L.APP, height: 120 },
    { key: "FN", label: "Edge Function admin-users / line-webhook", kind: "backend", height: 130 },
    { key: "DB", label: "Supabase Auth / DB", kind: "backend", height: 110 },
  ]);
  p.pool("LINE Platform (Messaging API)", [], { key: "LINE", height: 60 });

  // เจ้าของ/ผู้จัดการ
  const R = 15; // main row offset in OM lane
  p.node("s2", "OM", 0, "start", "ต้องการจัดการผู้ใช้", { dy: R });
  p.node("t2", "OM", 1, "user", "เปิดหน้า “จัดการผู้ใช้”\n(ไอคอนเฟือง)", { dy: R });
  p.node("g3", "OM", 2, "xor", "ทำอะไร?", { dy: R });
  p.node("t6", "OM", 3, "user", "สร้างผู้ใช้: ตำแหน่ง,\nชื่อเรียก, username,\nPIN ≥ 6 หลัก", { dy: R, size: [140, 60] });
  p.node("t7", "OM", 4, "user", "รีเซ็ต PIN\n(พนักงานลืมรหัส)", { dy: R, size: [140, 60] });
  p.node("t8", "OM", 5, "user", "เปิด / ปิดใช้งานบัญชี", { dy: R, size: [140, 60] });
  p.node("t5", "OM", 6, "user", "วาง LINE ID ที่ได้จาก\nพนักงาน แล้วบันทึก", { dy: R, size: [140, 60] });
  p.node("g5", "OM", 7, "xor", "", { dy: R });
  p.node("e3", "OM", 8, "endError", "ไม่มีสิทธิ์ / ข้อมูลไม่ถูกต้อง", { dy: R });
  p.node("e2", "OM", 10, "end", "จัดการเสร็จ", { dy: R });
  p.node("n1", "OM", 9.2, "note", "ผู้จัดการสร้างได้เฉพาะตำแหน่ง “พนักงาน”\nและแก้ไข/ปิดบัญชีเจ้าของไม่ได้", { dy: -60, size: [230, 40] });

  // พนักงาน — ขอ LINE ID ด้วยตัวเอง
  p.node("s3", "EMP", 0, "start", "ต้องการผูก LINE");
  p.node("t3", "EMP", 1, "send", "แอดบอทเป็นเพื่อน แล้ว\nพิมพ์ “myid” ในแชท\nส่วนตัว (1:1)");
  p.node("t4", "EMP", 3, "receive", "ได้รับ LINE ID\n(U + 32 ตัวอักษร)");
  p.node("t9", "EMP", 4, "manual", "ส่ง ID ให้เจ้าของ/\nผู้จัดการ");
  p.node("e4", "EMP", 5, "end", "รอผู้จัดการผูกให้");

  // เว็บแอป
  p.node("a5", "APP", 7, "service", "เรียก admin-users พร้อม\nJWT (action: create /\nreset-pin / set-active /\nset-line-id)", { size: [150, 70] });
  p.node("a7", "APP", 8, "task", "แสดง Toast\nข้อผิดพลาด");
  p.node("a6", "APP", 10, "task", "รีเฟรชรายชื่อผู้ใช้");

  // Edge Function
  p.node("f3", "FN", 2, "service", "line-webhook: ตรวจ\nx-line-signature →\nตอบกลับ userId ของผู้ส่ง");
  p.node("f1", "FN", 7, "service", "ตรวจ JWT + role ผู้เรียก\nจาก profiles (owner /\nmanager เท่านั้น) และ\nรูปแบบข้อมูล", { size: [150, 70] });
  p.node("g4", "FN", 8, "xor", "ผ่าน?");
  p.node("f2", "FN", 9, "service", "ดำเนินการด้วย service_role:\ncreateUser / updateUser /\nban / profiles.line_user_id", { size: [160, 64] });

  // DB
  p.node("d3", "DB", 9, "store", "auth.users\nprofiles");

  // edges — OM
  p.edge("s2", "t2");
  p.edge("t2", "g3");
  p.edge("g3", "t6", "สร้าง");
  const top = -60;
  p.edge("g3", "t7", "รีเซ็ต PIN", "seq", { exit: [0.5, 0], entry: [0.5, 0], via: [[2, "OM", top], [4, "OM", top]], lx: 0.85 });
  p.edge("g3", "t8", "เปิด/ปิด", "seq", { exit: [0.5, 0], entry: [0.5, 0], via: [[2, "OM", top], [5, "OM", top]], lx: 0.9 });
  p.edge("g3", "t5", "ผูก LINE", "seq", { exit: [0.5, 0], entry: [0.5, 0], via: [[2, "OM", top], [6, "OM", top]], lx: 0.92 });
  const bot = 75;
  p.edge("t6", "g5", "", "seq", { exit: [0.5, 1], entry: [0.5, 1], via: [[3, "OM", bot], [7, "OM", bot]] });
  p.edge("t7", "g5", "", "seq", { exit: [0.5, 1], entry: [0.5, 1], via: [[4, "OM", bot], [7, "OM", bot]] });
  p.edge("t8", "g5", "", "seq", { exit: [0.5, 1], entry: [0.5, 1], via: [[5, "OM", bot], [7, "OM", bot]] });
  p.edge("t5", "g5");
  p.edge("g5", "a5", "", "seq", { exit: [1, 0.5], entry: [0.5, 0], via: [[7.5, "OM", R]] });
  p.edge("a5", "f1");
  p.edge("f1", "g4");
  p.edge("g4", "a7", "ไม่ (400/401/403)", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("a7", "e3", "", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("g4", "f2", "ใช่");
  p.edge("f2", "d3", "", "dataAssoc", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("f2", "a6", "ผลลัพธ์", "seq", { exit: [1, 0.5], entry: [0.5, 1] });
  p.edge("a6", "e2", "", "seq", { exit: [0.5, 0], entry: [0.5, 1] });

  // edges — myid
  p.edge("s3", "t3");
  p.edge("t3", "LINE", "ข้อความ “myid”", "msg");
  p.edge("LINE", "f3", "webhook (source=user)", "msg", { shift: -20, lx: -0.6 });
  p.edge("f3", "LINE", "reply: LINE ID", "msg", { shift: 20, lx: -0.6 });
  p.edge("LINE", "t4", "ข้อความตอบกลับ", "msg");
  p.edge("t4", "t9");
  p.edge("t9", "e4");
  p.edge("t9", "t5", "LINE ID", "assoc", { exit: [1, 0.5], entry: [0.5, 1], via: [[6, "EMP"]] });
  pages.push(p);
}

require("./pages2.cjs")(pages, Page, L, TOP);

module.exports = { pages };

if (require.main === module) {
  const out = process.argv[2] ?? path.join(__dirname, "out.drawio");
  fs.writeFileSync(out, file(pages));
  console.log("wrote", out, pages.length, "pages");
}
