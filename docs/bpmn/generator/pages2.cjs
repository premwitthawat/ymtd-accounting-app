// Pages P3–P11 (appended to build.js's page list)
module.exports = function (pages, Page, L, TOP) {
// ===========================================================================
// P3 ตั้งค่าบริษัทและบริการที่ต้องยื่น
// ===========================================================================
{
  const p = new Page("P3 ตั้งค่าบริษัท-บริการ", {
    title: "P3 — ตั้งค่าบริษัทและบริการที่ต้องยื่น",
    subtitle:
      "ข้อมูลหลักของลูกค้า (master data) · งานประจำเดือนถูกสร้างอัตโนมัติจากบริการที่ติ๊กไว้ · เลขผู้เสียภาษี/ที่อยู่/ค่าบริการรายเดือน จำเป็นต่อการออกเอกสารใน FlowAccount (P8–P10)",
    cols: 9,
    colW: 190,
  });
  p.pool("สำนักงานบัญชี YMTD", [
    { ...L.OM, height: 210 },
    { ...L.APP, height: 130 },
    { key: "DB", label: "Supabase DB", kind: "backend", height: 130 },
  ]);
  const A = -40, B = 62; // แถวบน / แถวล่างใน lane เจ้าของ

  p.node("s1", "OM", 0, "start", "ลูกค้าใหม่ / ข้อมูลเปลี่ยน", { dy: A });
  p.node("t1", "OM", 1, "user", "กด “เพิ่มบริษัท” หรือ\n“แก้ไขบริษัท”", { dy: A });
  p.node("t2", "OM", 2, "user", "กรอกชื่อ, ตัวย่อ, ผู้รับผิดชอบ,\nค่าบริการรายเดือน, หัก ณ ที่จ่าย,\nเลขผู้เสียภาษี, ที่อยู่", { dy: A, size: [170, 70] });
  p.node("t3", "OM", 3, "user", "ติ๊กบริการที่ต้องยื่น (ภงด.,\nสปส., ภพ.30 …) หรือเพิ่ม\n“อื่นๆ” กำหนดวันครบกำหนดเอง", { dy: A, size: [170, 70] });
  p.node("t4", "OM", 4, "user", "กดบันทึก", { dy: A, size: [110, 50] });
  p.node("e1", "OM", 8, "end", "บริษัทพร้อมใช้งาน", { dy: A });

  p.node("a1", "APP", 4, "service", "insert/update companies\n+ upsert company_services\n(ปิดบริการที่เอาออก)", { size: [150, 64] });
  p.node("a2", "APP", 5, "service", "ลบงานค้างของบริการที่เอาออก /\nย้ายงานค้างไปผู้รับผิดชอบใหม่", { size: [170, 64] });
  p.node("d1", "DB", 6, "service", "RPC ensure_current_period_tasks\nสร้างงานเดือนนี้ให้บริการที่เพิ่ม\n(วันครบกำหนดจากวันประจำ/\nวันที่กำหนดเอง)", { size: [180, 74] });
  p.node("d2", "DB", 7, "send", "Realtime แจ้งทุกเครื่อง\nที่เปิดแอปอยู่");
  p.node("a3", "APP", 7, "service", "โหลดข้อมูลใหม่\nแสดงบริษัท + งานทันที");

  p.edge("s1", "t1");
  p.edge("t1", "t2");
  p.edge("t2", "t3");
  p.edge("t3", "t4");
  p.edge("t4", "a1");
  p.edge("a1", "a2");
  p.edge("a2", "d1", "", "seq", { exit: [1, 0.5], entry: [0.5, 0] });
  p.edge("d1", "d2");
  p.edge("d2", "a3");
  p.edge("a3", "e1", "", "seq", { exit: [1, 0.5], entry: [0.5, 1] });

  // แถวล่าง: ปิดใช้งานบริษัท / จัดการประเภทบริการ
  p.node("s2", "OM", 0, "start", "ลูกค้าเลิกใช้บริการ", { dy: B });
  p.node("t5", "OM", 1, "user", "กด “ปิดใช้งานบริษัท”\n(เก็บไว้ในส่วนเก็บถาวร)", { dy: B, size: [150, 56] });
  p.node("a4", "APP", 1, "service", "companies.active=false,\nปิดทุกบริการ, ลบงานที่\nยังค้างของเดือนนี้");
  p.node("e2", "OM", 2, "end", "หยุดสร้างงาน", { dy: B });

  p.node("s3", "OM", 4.4, "start", "ปรับรายการบริการมาตรฐาน", { dy: B });
  p.node("t6", "OM", 5.4, "user", "เพิ่ม / เปลี่ยนชื่อ / ลบ\nประเภทบริการ (ชื่อ, วัน\nครบกำหนด, สี)", { dy: B, size: [150, 60] });
  p.node("a5", "APP", 6.4, "service", "task_types insert / rename\n(อัปเดต company_services, tasks,\nperiod_due_days ตาม) / delete", { size: [190, 64], dy: 0 });
  p.node("e3", "OM", 7.4, "end", "มีผลกับทุกบริษัท", { dy: B });

  p.edge("s2", "t5");
  p.edge("t5", "a4");
  p.edge("a4", "e2", "", "seq", { exit: [1, 0.5], entry: [0.5, 1] });
  p.edge("s3", "t6");
  p.edge("t6", "a5", "", "seq", { exit: [1, 0.5], entry: [0.5, 0] });
  p.edge("a5", "e3", "", "seq", { exit: [1, 0.5], entry: [0.5, 1] });

  p.node("st1", "DB", 4, "store", "companies\ncompany_services");
  p.node("st2", "DB", 1, "store", "companies\ntasks");
  p.edge("a1", "st1", "", "dataAssoc", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("a4", "st2", "", "dataAssoc", { exit: [0.5, 1], entry: [0.5, 0] });
  p.node("n1", "DB", 2.6, "note", "เดือนย้อนหลังถูกล็อก — การแก้ไขทุกอย่าง\nมีผลกับเดือนปัจจุบันเท่านั้น", { size: [230, 40] });
  pages.push(p);
}

// ===========================================================================
// P4 เชื่อมกลุ่ม LINE กับบริษัท
// ===========================================================================
{
  const p = new Page("P4 เชื่อมกลุ่ม LINE", {
    title: "P4 — เชื่อมกลุ่ม LINE ของลูกค้ากับบริษัทในระบบ",
    subtitle:
      "บอท (LINE OA) ต้องอยู่ในกลุ่มของลูกค้าก่อน ระบบจึงรู้จัก groupId · บอทไม่โต้ตอบในกลุ่มลูกค้า — ส่งเฉพาะข้อความที่ระบบกำหนด (เตือนชำระ, ใบแจ้งหนี้, ใบเสร็จ) · การจับคู่ทำในหน้า “กลุ่ม LINE”",
    cols: 10,
    colW: 185,
  });
  p.pool("กลุ่ม LINE ของบริษัทลูกค้า", [], { key: "CUST", height: 60 });
  p.pool("LINE Platform (Messaging API)", [], { key: "LINE", height: 60 });
  p.pool("สำนักงานบัญชี YMTD", [
    { key: "FN", label: "Edge Function line-webhook", kind: "backend", height: 150 },
    { key: "DB", label: "Supabase DB", kind: "backend", height: 120 },
    { ...L.APP, height: 130 },
    { ...L.OM, height: 150 },
  ]);

  p.node("s", "FN", 0, "startMsg", "webhook: join / message\nจากกลุ่ม");
  p.node("f1", "FN", 1, "service", "ตรวจ x-line-signature\n(HMAC ด้วย channel secret)");
  p.node("g1", "FN", 2, "xor", "ถูกต้อง?");
  p.node("e0", "FN", 2, "endError", "ตอบ 401 (ปลอม)", { dy: -55, style: TOP });
  p.node("g2", "FN", 3, "xor", "เคยบันทึก\ngroupId นี้?");
  p.node("e1", "FN", 3, "end", "ไม่ทำอะไร", { dy: -55, style: TOP });
  p.node("f2", "FN", 4, "service", "ขอชื่อกลุ่มจาก LINE\n(group summary)");
  p.node("f3", "FN", 5, "service", "insert line_groups\n(groupId, ชื่อกลุ่ม,\nfirst_seen_at)");
  p.node("e2", "FN", 6, "end", "ตอบ 200 ให้ LINE");

  p.node("d1", "DB", 5, "store", "line_groups");
  p.node("d2", "DB", 6, "send", "Realtime →\nหน้ากลุ่ม LINE");
  p.node("a1", "APP", 6, "service", "แสดงกลุ่มที่บอทอยู่\n(ชื่อกลุ่ม, เวลาที่เจอครั้งแรก)\nพร้อมช่องเลือกบริษัท", { size: [160, 64] });
  p.node("s2", "OM", 5, "start", "ต้องการผูกกลุ่ม");
  p.node("t0", "OM", 6, "user", "เปิดหน้า “กลุ่ม LINE”");
  p.node("t1", "OM", 7, "user", "เลือกบริษัทให้กลุ่มนั้น\n(หรือยกเลิกการผูก)");
  p.node("a2", "APP", 8, "service", "ล้าง line_group_id เดิมที่ชี้\nกลุ่มนี้ แล้วตั้ง companies.\nline_group_id = groupId", { size: [160, 64] });
  p.node("d3", "DB", 8, "store", "companies");
  p.node("e3", "OM", 9, "end", "ผูกแล้ว — ทวง/รับสลิป/\nส่งเอกสารกับบริษัทนี้ได้");

  p.edge("CUST", "LINE", "เชิญบอทเข้ากลุ่ม / ส่งข้อความ", "msg", { exit: [0.05, 1], entry: [0.05, 0] });
  p.edge("LINE", "s", "POST webhook", "msg");
  p.edge("s", "f1");
  p.edge("f1", "g1");
  p.edge("g1", "e0", "ไม่", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("g1", "g2", "ใช่");
  p.edge("g2", "e1", "ใช่", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("g2", "f2", "ไม่ (กลุ่มใหม่)");
  p.edge("f2", "LINE", "GET group summary", "msg", { shift: -20, lx: -0.6 });
  p.edge("LINE", "f2", "groupName", "msg", { shift: 20, lx: -0.6 });
  p.edge("f2", "f3");
  p.edge("f3", "e2");
  p.edge("f3", "d1", "", "dataAssoc", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("d1", "d2", "", "seq");
  p.edge("d2", "a1");
  p.edge("s2", "t0");
  p.edge("t0", "t1");
  p.edge("a1", "t0", "", "seq", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("t1", "a2", "", "seq", { exit: [1, 0.5], entry: [0.5, 1] });
  p.edge("a2", "d3", "", "dataAssoc", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("a2", "e3", "", "seq", { exit: [1, 0.5], entry: [0.5, 0] });
  p.node("n1", "DB", 2.2, "note", "ตอบ 200 เสมอแม้ error ภายใน — LINE จะ retry\nและปิด webhook ถ้าตอบผิดซ้ำ ๆ", { size: [260, 40] });
  pages.push(p);
}

// ===========================================================================
// P5 งานยื่นภาษีประจำเดือน
// ===========================================================================
{
  const p = new Page("P5 งานยื่นภาษีประจำเดือน", {
    title: "P5 — งานยื่นภาษี/ประกันสังคมประจำเดือน",
    subtitle:
      "งานถูกสร้างอัตโนมัติทุกเดือนจากบริการที่แต่ละบริษัทติ๊กไว้ (P3) · พนักงานทำงานจริงนอกระบบแล้วกลับมามาร์กสถานะ · เดือนย้อนหลังดูได้แต่แก้ไม่ได้",
    cols: 10,
    colW: 190,
  });
  p.pool("สำนักงานบัญชี YMTD", [
    { ...L.OM, height: 140 },
    { ...L.EMP, height: 190 },
    { ...L.APP, height: 150 },
    { key: "DB", label: "Supabase DB", kind: "backend", height: 140 },
  ]);

  p.node("s", "APP", 0, "startTimer", "ขึ้นเดือนใหม่ /\nเปิดแอป");
  p.node("a1", "APP", 1, "service", "เรียก RPC\nensure_current_period_tasks\nทุกครั้งที่โหลด");
  p.node("d1", "DB", 1, "service", "สร้าง tasks ของเดือนนี้ที่ยังไม่มี\nจาก company_services ที่ active\n(วันครบกำหนด = วันประจำ /\nวันที่กำหนดเอง / วันของเดือนนี้)", { size: [200, 74] });
  p.node("a2", "APP", 2, "service", "แสดงงานเรียงตามความด่วน:\nเลยกำหนด / ครบใน 3 วัน / ปกติ\nกรองตามคน · ประเภท · ค้นหา", { size: [170, 70] });
  p.node("t1", "EMP", 3, "manual", "ทำงานยื่นภาษี / ประกันสังคม\nให้ลูกค้า (นอกระบบ:\ne-Filing, e-Service ฯลฯ)", { size: [160, 64], dy: -30 });
  p.node("g1", "EMP", 4, "xor", "ผลลัพธ์?", { dy: -30 });
  p.node("t2", "EMP", 5, "user", "กด “ทำรายการแล้ว”\n(หรือมาร์กทั้งวันทีเดียว)", { dy: -45 });
  p.node("t3", "EMP", 5, "user", "กด “ข้าม” — เดือนนี้\nไม่มีรายการต้องยื่น", { dy: 45 });
  p.node("a3", "APP", 5, "service", "tasks.status = done\n(เก็บเวลาที่กด)");
  p.node("a4", "APP", 6, "service", "tasks.status = skipped\n+ โน้ต “ไม่มีรายการเดือนนี้”");
  p.node("a5", "APP", 7, "service", "ย้ายไปส่วน “เสร็จแล้ว”\nงานที่ done จะรอเก็บเงิน\n(payment_status = unpaid → P6)");
  p.node("e", "EMP", 8, "end", "งานเดือนนี้เสร็จ", { dy: -30 });
  p.node("t4", "EMP", 8, "user", "กู้คืน (restore) งานที่เสร็จ/\nข้ามไปแล้วกลับมาเป็นค้าง", { dy: 45, size: [150, 56] });

  p.edge("s", "a1");
  p.edge("a1", "d1");
  p.edge("d1", "a2", "", "seq", { exit: [1, 0.5], entry: [0.5, 1] });
  p.edge("a2", "t1", "", "seq", { exit: [1, 0.5], entry: [0.5, 1] });
  p.edge("t1", "g1");
  p.edge("g1", "t2", "ทำแล้ว", "seq", { exit: [0.5, 0], entry: [0, 0.5], via: [[4, "EMP", -45]] });
  p.edge("g1", "t3", "ไม่มีรายการ", "seq", { exit: [0.5, 1], entry: [0, 0.5], via: [[4, "EMP", 45]] });
  p.edge("t2", "a3", "", "seq", { exit: [0.5, 1], entry: [0.3, 0] });
  p.edge("t3", "a4", "", "seq", { exit: [1, 0.5], entry: [0.5, 0] });
  p.edge("a3", "a4");
  p.edge("a4", "a5");
  p.edge("a5", "e", "", "seq", { exit: [1, 0.5], entry: [0.5, 1] });
  p.edge("t4", "a2", "status = pending", "seq", { exit: [0.5, 1], entry: [0.5, 1], via: [[8, "APP", 62], [2, "APP", 62]], lx: -0.3 });

  // เจ้าของ/ผู้จัดการ ปรับเดือนนี้ (ทำได้ทุกเมื่อ)
  p.node("s2", "OM", 0, "start", "ปรับแผนของเดือนนี้");
  p.node("g2", "OM", 1, "xor", "ปรับอะไร?");
  p.node("t5", "OM", 2.5, "user", "ตั้งวันครบกำหนดของเดือนนี้\nต่อประเภท (เช่น ตรงวันหยุด)", { size: [160, 56] });
  p.node("t6", "OM", 3.5, "user", "แก้วันครบกำหนด\nรายงาน (ดินสอ)", { size: [130, 56] });
  p.node("t7", "OM", 4.5, "user", "มอบหมายงานแทน\nชั่วคราว (คนลา)", { size: [130, 56] });
  p.node("d3", "DB", 2.5, "service", "period_due_days upsert +\ntasks.due_date ทุกงาน\nประเภทนั้นในเดือนนี้", { size: [160, 60] });
  p.node("d4", "DB", 3.5, "service", "tasks.due_date\nของงานนั้น", { size: [130, 56] });
  p.node("d5", "DB", 4.5, "service", "tasks.owner (เดือนถัดไป\nกลับเป็นคนเดิมเอง)", { size: [130, 56] });
  p.node("g3", "DB", 5.5, "xor", "");
  p.node("e2", "OM", 5.5, "end", "มีผลทันทีทุกเครื่อง\n(Realtime)");

  p.edge("s2", "g2");
  p.edge("g2", "t5", "วันครบกำหนด\nทั้งประเภท", "seq", { lx: -0.2 });
  p.edge("g2", "t6", "รายงาน", "seq", { exit: [0.5, 0], entry: [0.5, 0], via: [[1, "OM", -55], [3.5, "OM", -55]], lx: 0.85 });
  p.edge("g2", "t7", "ผู้รับผิดชอบ", "seq", { exit: [0.5, 0], entry: [0.5, 0], via: [[1, "OM", -55], [4.5, "OM", -55]], lx: 0.9 });
  p.edge("t5", "d3", "", "seq", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("t6", "d4", "", "seq", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("t7", "d5", "", "seq", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("d3", "g3", "", "seq", { exit: [0.5, 1], entry: [0.5, 1], via: [[2.5, "DB", 60], [5.5, "DB", 60]] });
  p.edge("d4", "g3", "", "seq", { exit: [0.5, 1], entry: [0.5, 1], via: [[3.5, "DB", 60], [5.5, "DB", 60]] });
  p.edge("d5", "g3");
  p.edge("g3", "e2", "", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.node("n1", "OM", 7.6, "note", "ทุกการแก้ไขถูกปฏิเสธเมื่อกำลังดูเดือนย้อนหลัง\n(“กำลังดูข้อมูลย้อนหลัง ไม่สามารถแก้ไขได้”)", { size: [260, 40] });
  pages.push(p);
}

// ===========================================================================
// P6 แจ้งชำระและทวงถามทาง LINE
// ===========================================================================
{
  const p = new Page("P6 แจ้งชำระ-ทวงถาม", {
    title: "P6 — แจ้งยอดชำระค่าบริการยื่นภาษี และทวงถามอัตโนมัติทาง LINE",
    subtitle:
      "ระบบเริ่มทวงเฉพาะรายการที่พนักงานกด “ส่งแจ้งชำระแล้ว” · GitHub Actions รันวันละ 2 รอบ (09:00 เตือนล่วงหน้า / 16:00 ทวงวันที่ครบกำหนดและเลยกำหนด) · 1 ข้อความต่อกลุ่มต่อวัน",
    cols: 10,
    colW: 190,
  });
  p.pool("สำนักงานบัญชี YMTD", [
    { ...L.OM, height: 200 },
    { ...L.APP, height: 120 },
    { key: "DB", label: "Supabase DB", kind: "backend", height: 110 },
    { key: "GH", label: "GitHub Actions (send-reminders.js)", kind: "sched", height: 230 },
  ]);
  p.pool("LINE Platform", [], { key: "LINE", height: 50 });
  p.pool("ลูกค้า (กลุ่ม LINE ของบริษัท)", [], { key: "CUST", height: 50 });

  const A = -45, B = 55;
  p.node("s", "OM", 0, "start", "งานยื่นเสร็จแล้ว\n(done, ยังไม่เก็บเงิน)", { dy: A });
  p.node("t1", "OM", 1, "manual", "คำนวณยอดและพิมพ์แจ้ง\nลูกค้าในกลุ่ม LINE เอง\n(นอกระบบ)", { dy: A });
  p.node("t2", "OM", 2, "user", "กดปุ่ม “ส่งแจ้งชำระแล้ว”\nที่รายการนั้นในแอป", { dy: A });
  p.node("a1", "APP", 2, "service", "insert payment_records\n{status: unpaid,\nnotice_sent_at: now}");
  p.node("d1", "DB", 2, "store", "payment_records");
  p.node("e0", "OM", 3, "end", "รอชำระ — ระบบเริ่ม\nทวงอัตโนมัติ", { dy: A });

  p.node("s2", "OM", 4.2, "start", "รายการนี้ไม่มียอด\nต้องเก็บ", { dy: A });
  p.node("t3", "OM", 5.2, "user", "กด “เอาออก” ที่รายการ\n(ยืนยันใน dialog)", { dy: A });
  p.node("a2", "APP", 5.2, "service", "delete payment_records\n+ tasks.payment_status =\nnot_applicable");
  p.node("e1", "OM", 6.2, "end", "หยุดแสดง/หยุดทวงทันที", { dy: A });

  p.node("st", "GH", 0, "startTimer", "cron 09:00 และ 16:00\n(เวลาไทย) / กดรันเอง", { dy: A });
  p.node("g0", "GH", 1, "script", "อ่าน payment_records ที่\nstatus = unpaid และมี\nnotice_sent_at", { dy: A });
  p.node("g1", "GH", 2, "xor", "รอบเช้า?", { dy: A, style: TOP });
  p.node("g2", "GH", 3, "task", "เลือกรายการที่ครบกำหนด\n“พรุ่งนี้” (เตือนล่วงหน้า)", { dy: A - 10, size: [150, 56] });
  p.node("g3", "GH", 3, "task", "เลือกรายการที่ครบกำหนด\n“วันนี้” หรือเลยกำหนดแล้ว", { dy: B, size: [150, 56] });
  p.node("g4", "GH", 4, "xor", "เตือนวันนี้แล้ว\nหรือไม่มีกลุ่ม LINE?", { dy: A, style: TOP });
  p.node("e2", "GH", 5, "end", "ข้ามรายการนั้น", { dy: B });
  p.node("g5", "GH", 5, "task", "รวมรายการของบริษัทเดียวกัน\nเป็น 1 ข้อความต่อกลุ่ม", { dy: A, size: [150, 56] });
  p.node("g6", "GH", 6, "send", "push ข้อความ [แจ้งเตือน\nชำระเงิน] + รายการ + “ส่งสลิป\nในกลุ่มนี้”", { dy: A, size: [150, 60] });
  p.node("g7", "GH", 7, "service", "update last_reminded_at\n(กันส่งซ้ำในวันเดียวกัน)", { dy: A });
  p.node("e3", "GH", 8, "end", "จบรอบ — ทำซ้ำทุกวัน\nจนกว่าจะชำระ (P7)", { dy: A });
  p.node("d2", "DB", 7, "store", "payment_records");

  p.edge("s", "t1");
  p.edge("t1", "LINE", "ข้อความแจ้งยอด", "msg", { shift: -95, exit: [0.15, 1], via: [[0.5, "OM", 20]], lx: 0.3 });
  p.edge("LINE", "CUST", "", "msg", { exit: [0.1, 1], entry: [0.1, 0] });
  p.edge("t1", "t2");
  p.edge("t2", "a1");
  p.edge("a1", "d1", "", "dataAssoc");
  p.edge("t2", "e0");
  p.edge("s2", "t3");
  p.edge("t3", "a2");
  p.edge("t3", "e1");

  p.edge("st", "g0");
  p.edge("g0", "g1");
  p.edge("g1", "g2", "ใช่ (09:00)", "seq", { entry: [0, 0.5] });
  p.edge("g1", "g3", "ไม่ (16:00)", "seq", { exit: [0.5, 1], entry: [0, 0.5], via: [[2, "GH", B]] });
  p.edge("g2", "g4");
  p.edge("g3", "g4", "", "seq", { exit: [1, 0.5], entry: [0.5, 1], via: [[4, "GH", B]] });
  p.edge("g4", "e2", "ใช่", "seq", { exit: [0.5, 1], entry: [0, 0.5], via: [[4, "GH", B + 0]] });
  p.edge("g4", "g5", "ไม่");
  p.edge("g5", "g6");
  p.edge("g6", "LINE", "push API", "msg", { lx: -0.6 });
  p.edge("LINE", "CUST", "", "msg", { exit: [0.62, 1], entry: [0.62, 0] });
  p.edge("g6", "g7");
  p.edge("g7", "d2", "", "dataAssoc", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("g7", "e3");
  p.node("n1", "GH", 8.2, "note", "สลิปเข้ามา (pending_review) หรือ\nถูกยืนยันเป็น paid → หลุดจาก\nเงื่อนไข จึงหยุดทวงเอง", { dy: B, size: [230, 56] });
  pages.push(p);
}

// ===========================================================================
// P7 รับสลิปและยืนยันการชำระ
// ===========================================================================
{
  const p = new Page("P7 รับสลิป-ยืนยันการชำระ", {
    title: "P7 — รับสลิปจากกลุ่ม LINE และยืนยันการชำระ (รวมคำสั่ง “clear”)",
    subtitle:
      "รูปภาพในกลุ่มจะถูกจับคู่กับรายการที่ “ส่งแจ้งชำระแล้ว” เท่านั้น · “clear” = พนักงานยืนยันว่าชำระแล้วโดยไม่ต้องเปิดแอป (รับเฉพาะ LINE ID ของพนักงาน; fail-open ชั่วคราวถ้ายังไม่ผูกใคร) · บอทไม่ตอบกลับในกลุ่ม",
    cols: 12,
    colW: 185,
  });
  p.pool("กลุ่ม LINE ของบริษัท (ลูกค้า + พนักงานที่อยู่ในกลุ่ม)", [], { key: "CUST", height: 50 });
  p.pool("LINE Platform (Messaging API / Content API)", [], { key: "LINE", height: 50 });
  p.pool("สำนักงานบัญชี YMTD", [
    { key: "FN", label: "Edge Function line-webhook", kind: "backend", height: 250 },
    { key: "DB", label: "Supabase DB / Storage", kind: "backend", height: 110 },
    { ...L.APP, height: 120 },
    { ...L.OM, height: 200 },
  ]);
  const A = -65, B = 65;

  p.node("s", "FN", 0, "startMsg", "webhook event\nจากกลุ่ม");
  p.node("f1", "FN", 1, "service", "ตรวจ signature, บันทึก\nline_groups, หา company\nจาก groupId");
  p.node("g1", "FN", 2, "xor", "ชนิดข้อความ?");
  p.node("eA", "FN", 5, "end", "เมินเงียบ (log เท่านั้น)\nไม่ตอบกลับในกลุ่ม");

  p.node("f2", "FN", 3, "service", "หา payment_records รอชำระ\nเก่าสุดของบริษัท (unpaid +\nnotice_sent_at)", { dy: A, size: [160, 64] });
  p.node("g2", "FN", 4, "xor", "พบบริษัท\nและรายการ?", { dy: A, style: TOP });
  p.node("f3", "FN", 5, "service", "ดึงไฟล์รูปจาก LINE →\nupload bucket payment_slips\n(ตัวย่อ/ปี/เดือน/…jpg)", { dy: A, size: [165, 64] });
  p.node("f4", "FN", 6, "service", "payment_records:\nstatus = pending_review,\nslip_path", { dy: A });

  p.node("fB1", "FN", 3, "service", "ตรวจ userId ผู้ส่งกับ\nprofiles.line_user_id\n(พนักงานที่ active)", { dy: B, size: [160, 64] });
  p.node("gB", "FN", 4, "xor", "พนักงาน และมี\nรายการรอชำระ?", { dy: B });
  p.node("fB2", "FN", 6, "service", "payment_records.status = paid\n+ tasks.payment_status = paid\n(รายการเก่าสุดที่รอชำระ)", { dy: B, size: [175, 64] });
  p.node("eB", "FN", 7, "end", "ชำระแล้ว →\nออกใบเสร็จ (P8)", { dy: B });

  p.node("d1", "DB", 5, "store", "bucket payment_slips");
  p.node("d2", "DB", 6, "store", "payment_records");
  p.node("d3", "DB", 9.3, "store", "payment_records\ntasks");

  p.node("a1", "APP", 6, "service", "Realtime: แสดงป้าย\n“รอตรวจสอบสลิป”\nที่รายการนั้น");
  p.node("e4", "APP", 7.5, "end", "กลับไปรอชำระ\n(ทวงต่อ)");
  p.node("a3", "APP", 8.5, "service", "status = unpaid,\nslip_path = null");
  p.node("a2", "APP", 9.3, "service", "payment_records: status = paid,\namount · tasks.payment_status\n= paid", { size: [170, 64] });

  const O = -30, O2 = 60;
  p.node("t1", "OM", 7, "user", "กด “ดูสลิป” (signed URL)\nตรวจยอด/วันที่/บัญชี", { dy: O });
  p.node("g3", "OM", 8, "xor", "ใช่สลิปของ\nรายการนี้?", { dy: O, style: TOP });
  p.node("t3", "OM", 8.5, "user", "กด “ไม่ใช่สลิป”\n(รูปอื่นในแชท)", { dy: O2, size: [130, 50] });
  p.node("t2", "OM", 9.3, "user", "กด “ยืนยันรับชำระ” พร้อม\nกรอกยอดที่โอน (สุทธิ)", { dy: O, size: [150, 56] });
  p.node("e3", "OM", 10.3, "end", "ชำระแล้ว →\nออกใบเสร็จ (P8)", { dy: O });

  p.edge("CUST", "LINE", "ส่งรูปสลิป / พิมพ์ “clear”", "msg", { exit: [0.04, 1], entry: [0.04, 0] });
  p.edge("LINE", "s", "POST webhook", "msg");
  p.edge("s", "f1");
  p.edge("f1", "g1");
  p.edge("g1", "f2", "รูปภาพ", "seq", { exit: [0.5, 0], entry: [0, 0.5], via: [[2, "FN", A]] });
  p.edge("g1", "fB1", "ข้อความ “clear”", "seq", { exit: [0.5, 1], entry: [0, 0.5], via: [[2, "FN", B]] });
  p.edge("g1", "eA", "อื่น ๆ");
  p.edge("f2", "g2");
  p.edge("g2", "eA", "ไม่", "seq", { exit: [0.5, 1], entry: [0, 0.5], via: [[4.45, "FN", A], [4.45, "FN", 0]] });
  p.edge("g2", "f3", "ใช่");
  p.edge("f3", "LINE", "GET message content", "msg", { shift: -25, lx: -0.6 });
  p.edge("LINE", "f3", "ไฟล์รูป", "msg", { shift: 25, lx: -0.6 });
  p.edge("f3", "f4");
  p.edge("f3", "d1", "", "dataAssoc", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("f4", "d2", "", "dataAssoc", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("f4", "a1", "Realtime", "seq", { exit: [1, 0.5], entry: [0.5, 0], via: [[6.7, "FN", A], [6.7, "APP", -48]], lx: 0.3 });
  p.edge("fB1", "gB");
  p.edge("gB", "eA", "ไม่", "seq", { exit: [0.5, 0], entry: [0, 0.5], via: [[4.45, "FN", B], [4.45, "FN", 0]] });
  p.edge("gB", "fB2", "ใช่");
  p.edge("fB2", "eB");
  p.edge("a1", "t1", "", "seq", { exit: [1, 0.5], entry: [0.5, 0] });
  p.edge("t1", "g3");
  p.edge("g3", "t2", "ใช่");
  p.edge("g3", "t3", "ไม่", "seq", { exit: [0.5, 1], entry: [0, 0.5], via: [[8, "OM", O2]] });
  p.edge("t3", "a3", "", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("a3", "e4");
  p.edge("t2", "a2", "", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("a2", "d3", "", "dataAssoc", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("t2", "e3");
  pages.push(p);
}

// ===========================================================================
// P8 ออกใบเสร็จค่าบริการยื่นภาษี
// ===========================================================================
{
  const p = new Page("P8 ออกใบเสร็จค่าบริการยื่นภาษี", {
    title: "P8 — ออกใบเสร็จรับเงินค่าบริการยื่นภาษี (FlowAccount)",
    subtitle:
      "ไม่ออกอัตโนมัติ: ยอดมาจากสลิป จึงให้คนยืนยันยอดเต็ม/หัก ณ ที่จ่ายก่อนทุกครั้ง (เอกสารผิดต้องออกใบลดหนี้) · FlowAccount เลิกใบเสร็จเดี่ยว จึงออกใบแจ้งหนี้แล้วใบเสร็จต่อกันในคลิกเดียว · กันออกซ้ำ 2 ชั้น (early return + CAS/unique index)",
    cols: 14,
    colW: 180,
  });
  p.pool("สำนักงานบัญชี YMTD", [
    { ...L.OM, height: 150 },
    { ...L.APP, height: 150 },
    { key: "DB", label: "Supabase DB / Storage", kind: "backend", height: 110 },
    { key: "FN", label: "Edge Function flowaccount-issue-receipt", kind: "backend", height: 230 },
  ]);
  p.pool("FlowAccount OpenAPI (Sandbox /test หรือ Production /v1)", [], { key: "FA", height: 50 });
  const A = -50, B = 60;

  p.node("s", "OM", 0, "start", "รายการชำระแล้ว\nยังไม่มีใบเสร็จ");
  p.node("t1", "OM", 1, "user", "กดปุ่ม “ออกใบเสร็จ”\nที่รายการ");
  p.node("a1", "APP", 2, "service", "เปิด modal: เติมยอดเต็มจาก\nunit_price, ติ๊ก “หัก ณ ที่จ่าย 3%”,\nแสดงยอดสุทธิเทียบกับยอดสลิป\n(เตือนถ้าไม่ตรง)", { size: [190, 74] });
  p.node("t2", "OM", 3, "user", "ตรวจยอดให้ตรงสลิป\nแล้วกด “ยืนยัน”");
  p.node("a2", "APP", 4, "service", "เรียก flowaccount-issue-receipt\n{payment_record_id, amount_gross,\nwht_rate} — ปิดปุ่มกันกดซ้ำ", { size: [180, 64] });
  p.node("a3", "APP", 5, "task", "Toast บอกว่าขาดอะไร\n(400 / 401 / 403)");
  p.node("e1", "OM", 5, "endError", "แก้ข้อมูลแล้วลองใหม่");
  p.node("a4", "APP", 12, "service", "แสดงเลขที่เอกสาร +\nลิงก์ “ดูใบเสร็จ”\n(signed URL ตอนคลิก)");
  p.node("e2", "OM", 12, "end", "ได้ใบเสร็จ PDF");
  p.node("a5", "APP", 13, "task", "Toast: ออกใบเสร็จแล้ว แต่\nดึง PDF ไม่สำเร็จ — กดซ้ำ\nเพื่อดึงอีกครั้ง (ไม่ออกซ้ำ)", { size: [165, 64] });
  p.node("e3", "OM", 13, "end", "มีใบเสร็จแล้ว รอ PDF");

  p.node("f1", "FN", 4, "service", "ตรวจ JWT + role\nowner/manager; โหลด\nrecord + task + company", { dy: A });
  p.node("g1", "FN", 5, "xor", "ผ่าน และข้อมูลครบ?\n(paid, ยอด > 0, tax_id)", { dy: A });
  p.node("g2", "FN", 6, "xor", "มี document_id\nแล้ว?", { dy: A, style: TOP });
  p.node("f2", "FN", 7, "service", "ขอ access token (cache ใน\nintegration_tokens) +\nensureContact (สร้างถ้าไม่มี)", { dy: A, size: [165, 64] });
  p.node("f3", "FN", 8, "service", "สร้างใบแจ้งหนี้ → บันทึก\nflowaccount_invoice_id\n(CAS; ใช้ซ้ำถ้ามีแล้ว)", { dy: A, size: [160, 64] });
  p.node("f4", "FN", 9, "service", "สร้างใบเสร็จอ้างอิง\nใบแจ้งหนี้ พร้อม WHT", { dy: A });
  p.node("f5", "FN", 10, "service", "บันทึก document_id/number,\nWHT, amount_received, issued_at\nก่อนดึง PDF (CAS .is null)", { dy: A, size: [180, 64] });
  p.node("f6", "FN", 11, "service", "export PDF (base64) →\nupload bucket receipts\n→ บันทึก receipt_path", { dy: A });
  p.node("g3", "FN", 12, "xor", "PDF สำเร็จ?", { dy: A });
  p.node("f8", "FN", 8, "service", "คืนข้อมูลเดิม — ถ้ายังไม่มี\nreceipt_path ให้ export PDF\nใหม่ (heal) ไม่สร้างเอกสารซ้ำ", { dy: B, size: [180, 64] });

  p.node("d1", "DB", 7, "store", "integration_tokens\ncompanies");
  p.node("d2", "DB", 10, "store", "payment_records");
  p.node("d3", "DB", 11, "store", "bucket receipts");

  p.edge("s", "t1");
  p.edge("t1", "a1", "", "seq", { exit: [1, 0.5], entry: [0.5, 0] });
  p.edge("a1", "t2", "", "seq", { exit: [1, 0.5], entry: [0.5, 1] });
  p.edge("t2", "a2", "", "seq", { exit: [1, 0.5], entry: [0.5, 0] });
  p.edge("a2", "f1");
  p.edge("f1", "g1");
  p.edge("g1", "a3", "ไม่", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("a3", "e1");
  p.edge("g1", "g2", "ใช่");
  p.edge("g2", "f2", "ไม่");
  p.edge("g2", "f8", "ใช่ (เคยออกแล้ว)", "seq", { exit: [0.5, 1], entry: [0, 0.5], via: [[6, "FN", B]], lx: -0.3 });
  p.edge("f2", "f3");
  p.edge("f3", "f4");
  p.edge("f4", "f5");
  p.edge("f5", "f6");
  p.edge("f6", "g3");
  p.edge("f8", "g3", "", "seq", { exit: [1, 0.5], entry: [0.5, 1], via: [[12, "FN", B]] });
  p.edge("g3", "a4", "ใช่", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("a4", "e2");
  p.edge("g3", "a5", "ไม่ (502)", "seq", { exit: [1, 0.5], entry: [0.5, 1] });
  p.edge("a5", "e3");
  p.edge("f2", "FA", "POST /token · GET/POST /contacts", "msg", { lx: -0.5 });
  p.edge("f3", "FA", "POST /invoices", "msg", { lx: -0.5 });
  p.edge("f4", "FA", "POST /receipts", "msg", { lx: -0.5 });
  p.edge("f6", "FA", "POST /receipts/{id}/export-pdf", "msg", { lx: -0.5 });
  p.edge("f8", "FA", "export-pdf (ถ้าขาด)", "msg", { lx: -0.5 });
  p.edge("f2", "d1", "", "dataAssoc", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("f5", "d2", "", "dataAssoc", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("f6", "d3", "", "dataAssoc", { exit: [0.5, 0], entry: [0.5, 1] });
  p.node("n1", "DB", 1.3, "note", "FLOWACCOUNT_MOCK=true → ตอบกลับปลอมตาม shape จริง\nโดยไม่ยิงออกเน็ต · เจอ HTTP 429 → retry แบบ exponential backoff", { size: [330, 44] });
  p.node("n2", "DB", 4.7, "note", "ถ้าสร้างเอกสารแล้วแต่บันทึก DB แพ้ race →\nlog ว่าเอกสารกำพร้า ให้ void ใน FlowAccount เอง", { size: [270, 44] });
  pages.push(p);
}

// ===========================================================================
// P9 ใบแจ้งหนี้ค่าบริการรายเดือน
// ===========================================================================
{
  const p = new Page("P9 ใบแจ้งหนี้รายเดือน", {
    title: "P9 — ใบแจ้งหนี้ค่าบริการรายเดือน (อัตโนมัติทุกวันที่ 1)",
    subtitle:
      "ออกเฉพาะบริษัท active ที่กรอกค่าบริการรายเดือนไว้ · รันซ้ำได้ปลอดภัย (ข้ามบริษัทที่ออกครบแล้ว, ทำต่อจากจุดที่ค้าง) · ส่งเข้ากลุ่ม LINE ครั้งเดียว ไม่มีทวงต่อ · บริษัทที่ข้อมูลไม่ครบถูกข้ามพร้อมบอกเหตุผล ไม่ทำให้ทั้งรอบล้ม",
    cols: 16,
    colW: 175,
  });
  p.pool("ลูกค้า (กลุ่ม LINE ของบริษัท)", [], { key: "CUST", height: 50 });
  p.pool("LINE Platform", [], { key: "LINE", height: 50 });
  p.pool("สำนักงานบัญชี YMTD", [
    { ...L.OM, height: 130 },
    { ...L.APP, height: 110 },
    { key: "DB", label: "Supabase DB / Storage", kind: "backend", height: 110 },
    { key: "GH", label: "GitHub Actions (monthly-invoices.yml)", kind: "sched", height: 210 },
    { key: "FN", label: "Edge Function flowaccount-invoices (generate)", kind: "backend", height: 230 },
  ]);
  p.pool("FlowAccount OpenAPI", [], { key: "FA", height: 50 });
  const A = -55, B = 60;

  p.node("s0", "OM", 0, "start", "ก่อนวันที่ 1");
  p.node("t1", "OM", 1, "user", "กรอกค่าบริการรายเดือน,\nหัก ณ ที่จ่าย, เลขผู้เสียภาษี,\nที่อยู่ ในหน้าแก้ไขบริษัท", { size: [165, 64] });
  p.node("t2", "OM", 2, "user", "(ถ้ามี) เพิ่มรายการพิเศษ\nของเดือนถัดไป ในหน้าบริษัท", { size: [165, 56] });
  p.node("e0", "OM", 3, "end", "พร้อมออกบิล");
  p.node("a0", "APP", 1.5, "service", "บันทึก companies /\ninvoice_extras");
  p.node("d0", "DB", 1.5, "store", "companies\ninvoice_extras");
  p.node("a9", "APP", 14.3, "service", "Realtime: แสดงใบแจ้งหนี้\n+ ปุ่มดู PDF / รับชำระแล้ว\nในหน้าบริษัท", { size: [160, 60] });
  p.node("e9", "OM", 14.3, "end", "เห็นใบแจ้งหนี้ในแอป");

  p.node("st", "GH", 3, "startTimer", "วันที่ 1 เวลา 08:30\n(cron) / กดรันเอง");
  p.node("g0", "GH", 4, "service", "POST flowaccount-invoices\n{action: generate}\nด้วย service_role key");
  p.node("g9", "GH", 15, "xor", "failed > 0?", { style: "labelPosition=left;align=right;verticalLabelPosition=middle;verticalAlign=middle;" });
  p.node("e8", "GH", 15, "endError", "run แดง — ให้คนเข้ามาดู", { dy: -65, style: TOP });
  p.node("e7", "GH", 15, "end", "รอบนี้สำเร็จ", { dy: 65 });

  p.node("f1", "FN", 4, "service", "คำนวณงวด (เวลาไทย) →\nดึง companies active ที่\nmonthly_fee > 0", { dy: A });
  p.node("f2", "FN", 5, "serviceLoop", "ทำทีละบริษัท\n(บริษัทหนึ่งล้มไม่กระทบ\nบริษัทอื่น)", { dy: A });
  p.node("g1", "FN", 6, "xor", "มี tax_id?", { dy: A, style: TOP });
  p.node("f9", "FN", 6.9, "task", "บันทึก failed:\n“ยังไม่มีเลขผู้เสียภาษี”", { dy: B, size: [140, 50] });
  p.node("f3", "FN", 7, "service", "จองแถว company_invoices\n(unique บริษัท+งวด) พร้อม\nยอดรวม + รายการพิเศษ + WHT", { dy: A, size: [170, 64] });
  p.node("g2", "FN", 8, "xor", "ออกครบแล้ว?\n(เอกสาร+PDF+LINE)", { dy: A, style: TOP });
  p.node("f10", "FN", 8.5, "task", "บันทึก skipped", { dy: B, size: [120, 44] });
  p.node("f4", "FN", 9, "service", "token + contact →\nสร้างใบแจ้งหนี้ → บันทึก\ndocument id ทันที (CAS)", { dy: A, size: [160, 64] });
  p.node("f5", "FN", 10, "service", "export PDF →\nupload bucket invoices\n→ invoice_path", { dy: A });
  p.node("g3", "FN", 11, "xor", "มีกลุ่ม LINE\nและ token?", { dy: A, style: TOP });
  p.node("f11", "FN", 11.5, "task", "ข้ามการส่ง (log)\nรอผูกกลุ่มแล้วรันซ้ำ", { dy: B, size: [140, 50] });
  p.node("f6", "FN", 12, "send", "push [ใบแจ้งหนี้ค่าบริการ]\nยอด + ลิงก์ PDF (signed 30 วัน)\n→ line_pushed_at", { dy: A, size: [175, 64] });
  p.node("f7", "FN", 13.3, "xor", "", { dy: A });
  p.node("f8", "FN", 14.3, "service", "สรุปผล created /\nskipped / failed\nตอบกลับ 200", { dy: A });

  p.node("d1", "DB", 7, "store", "company_invoices");
  p.node("d2", "DB", 9, "store", "integration_tokens\ncompanies");
  p.node("d3", "DB", 10, "store", "bucket invoices");

  p.edge("s0", "t1");
  p.edge("t1", "t2");
  p.edge("t2", "e0");
  p.edge("t1", "a0", "", "seq", { exit: [0.5, 1], entry: [0.3, 0] });
  p.edge("t2", "a0", "", "seq", { exit: [0.5, 1], entry: [0.7, 0] });
  p.edge("a0", "d0", "", "dataAssoc");
  p.edge("st", "g0");
  p.edge("g0", "f1");
  p.edge("f1", "f2");
  p.edge("f2", "g1");
  p.edge("g1", "f9", "ไม่", "seq", { exit: [0.5, 1], entry: [0, 0.5], via: [[6, "FN", B]] });
  p.edge("g1", "f3", "ใช่");
  p.edge("f3", "g2");
  p.edge("g2", "f10", "ใช่", "seq", { exit: [0.5, 1], entry: [0, 0.5], via: [[8, "FN", B]] });
  p.edge("g2", "f4", "ไม่");
  p.edge("f4", "f5");
  p.edge("f5", "g3");
  p.edge("g3", "f11", "ไม่", "seq", { exit: [0.5, 1], entry: [0, 0.5], via: [[11, "FN", B]] });
  p.edge("g3", "f6", "ใช่");
  p.edge("f6", "f7");
  p.edge("f11", "f7", "", "seq", { exit: [1, 0.5], entry: [0.5, 1], via: [[13.3, "FN", B]] });
  p.edge("f10", "f7", "", "seq", { exit: [1, 0.5], entry: [0.5, 1], via: [[13.3, "FN", B]] });
  p.edge("f9", "f7", "", "seq", { exit: [1, 0.5], entry: [0.5, 1], via: [[13.3, "FN", B]] });
  p.edge("f7", "f8");
  p.edge("f7", "f2", "บริษัทถัดไป", "seq", { exit: [0.5, 0], entry: [0.5, 0], via: [[13.3, "FN", -108], [5, "FN", -108]], lx: 0.5 });
  p.edge("f8", "g9", "", "seq", { exit: [1, 0.5], entry: [0.5, 1] });
  p.edge("g9", "e8", "ใช่", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("g9", "e7", "ไม่", "seq", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("f8", "a9", "Realtime", "seq", { exit: [0.5, 0], entry: [0.5, 1], lx: -0.3 });
  p.edge("a9", "e9");
  p.edge("f4", "FA", "POST /token · /contacts · /invoices", "msg", { lx: -0.5 });
  p.edge("f5", "FA", "export-pdf", "msg", { lx: -0.5 });
  p.edge("f6", "LINE", "push API", "msg", { lx: -0.7 });
  p.edge("LINE", "CUST", "", "msg", { exit: [0.77, 0], entry: [0.77, 1] });
  p.edge("f3", "d1", "", "dataAssoc", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("f4", "d2", "", "dataAssoc", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("f5", "d3", "", "dataAssoc", { exit: [0.5, 0], entry: [0.5, 1] });
  p.node("n1", "OM", 5.6, "note", "⚠ พอกรอกค่าบริการรายเดือนแล้ว วันที่ 1 ถัดไประบบจะส่งใบแจ้งหนี้\nเข้ากลุ่ม LINE ของบริษัทนั้นอัตโนมัติ — ถ้ายังไม่พร้อมอย่าเพิ่งกรอก", { size: [380, 44] });
  p.node("n2", "GH", 8, "note", "กำหนดชำระ = วันสุดท้ายของเดือนที่เรียกเก็บ · ไม่มี reminder ตามหลัง\n(พนักงานทวงเองหรือใช้ P10 เมื่อเห็นยอดโอน)", { size: [360, 44] });
  pages.push(p);
}

// ===========================================================================
// P10 รับชำระใบแจ้งหนี้รายเดือน + ใบเสร็จอัตโนมัติ
// ===========================================================================
{
  const p = new Page("P10 รับชำระใบแจ้งหนี้-ใบเสร็จอัตโนมัติ", {
    title: "P10 — รับชำระใบแจ้งหนี้รายเดือน และออกใบเสร็จอัตโนมัติส่งเข้ากลุ่ม LINE",
    subtitle:
      "2 ทางเข้า: ปุ่ม “รับชำระแล้ว” ในแอป หรือพนักงานพิมพ์ “paid” ในกลุ่ม (ต้องผูก LINE ID แล้วเท่านั้น — ไม่มี fail-open) · ออกใบเสร็จอัตโนมัติได้เพราะยอดถูกกำหนดไว้แล้วตอนออกใบแจ้งหนี้ · กดซ้ำปลอดภัย (heal)",
    cols: 14,
    colW: 180,
  });
  p.pool("กลุ่ม LINE ของบริษัท (ลูกค้า + พนักงาน)", [], { key: "CUST", height: 50 });
  p.pool("LINE Platform", [], { key: "LINE", height: 50 });
  p.pool("สำนักงานบัญชี YMTD", [
    { ...L.OM, height: 130 },
    { ...L.APP, height: 120 },
    { key: "DB", label: "Supabase DB / Storage", kind: "backend", height: 110 },
    { key: "FN", label: "Edge Function line-webhook → flowaccount-invoices (mark-paid)", kind: "backend", height: 240 },
  ]);
  p.pool("FlowAccount OpenAPI", [], { key: "FA", height: 50 });
  const A = -55, B = 60;

  p.node("s", "OM", 0.6, "start", "เห็นยอดโอนค่าบริการ\nรายเดือนของลูกค้า");
  p.node("t1", "OM", 1.6, "user", "กด “รับชำระแล้ว”\nที่ใบแจ้งหนี้ในหน้าบริษัท");
  p.node("a1", "APP", 1.6, "service", "เรียก flowaccount-invoices\n{action: mark-paid, invoice_id}\nพร้อม JWT", { size: [170, 60] });
  p.node("a2", "APP", 12, "service", "Realtime: สถานะ “ชำระแล้ว”\n+ ปุ่มดูใบเสร็จ PDF");
  p.node("e2", "OM", 12, "end", "เสร็จ — ลูกค้าได้\nใบเสร็จในกลุ่มแล้ว");

  p.node("sA", "FN", 0, "startMsg", "webhook: ข้อความ\n“paid” ในกลุ่ม", { dy: B });
  p.node("fA1", "FN", 1, "service", "ตรวจ signature + ผู้ส่งต้องเป็น\nพนักงานที่ผูก LINE ID (strict)\n+ หาใบแจ้งหนี้ค้างเก่าสุด", { dy: B, size: [175, 64] });
  p.node("gA", "FN", 2, "xor", "พนักงาน และมี\nใบแจ้งหนี้ค้าง?", { dy: B });
  p.node("eA", "FN", 2, "end", "เมินเงียบ (log)", { dy: A });
  p.node("fA2", "FN", 3, "service", "เรียก flowaccount-invoices\nmark-paid ภายใน\n(service_role)", { dy: B });
  p.node("gM", "FN", 4, "xor", "", { dy: A });
  p.node("f1", "FN", 5, "service", "ตรวจสิทธิ์ (service_role\nหรือ owner/manager) →\nโหลด invoice + company", { dy: A });
  p.node("f2", "FN", 6, "service", "company_invoices:\nstatus = paid, paid_at\n(CAS จาก unpaid)", { dy: A });
  p.node("g1", "FN", 7, "xor", "มีใบเสร็จแล้ว?", { dy: A, style: TOP });
  p.node("f7", "FN", 8, "service", "ไม่ออกซ้ำ: เติม PDF ถ้าขาด\n+ push LINE ถ้ายังไม่ส่ง (heal)", { dy: B, size: [175, 56] });
  p.node("f3", "FN", 8, "service", "token + contact → สร้างใบเสร็จ\nอ้างอิงใบแจ้งหนี้ (ยอด/WHT\nตามที่ออกไว้วันที่ 1)", { dy: A, size: [175, 64] });
  p.node("f4", "FN", 9, "service", "บันทึก receipt_document_id,\nreceipt_issued_at ก่อนดึง PDF\n(CAS)", { dy: A, size: [170, 64] });
  p.node("f5", "FN", 10, "service", "export PDF →\nbucket receipts\n→ receipt_path", { dy: A });
  p.node("g2", "FN", 11, "xor", "PDF สำเร็จ?", { dy: A });
  p.node("eE", "FN", 11.5, "endError", "ตอบ 502: ออกใบเสร็จแล้ว\nแต่ PDF ไม่สำเร็จ — กดซ้ำ", { dy: B });
  p.node("f6", "FN", 12, "send", "push [ใบเสร็จรับเงิน] เลขที่ +\nลิงก์ PDF (signed 30 วัน) →\nreceipt_line_pushed_at", { dy: A, size: [175, 64] });
  p.node("e", "FN", 13, "end", "ตอบ 200\n(receipt_document_number)", { dy: A });

  p.node("d1", "DB", 6, "store", "company_invoices");
  p.node("d2", "DB", 8, "store", "integration_tokens");
  p.node("d3", "DB", 10, "store", "bucket receipts");

  p.edge("CUST", "LINE", "พนักงานพิมพ์ “paid” หลังเห็นสลิป", "msg", { exit: [0.04, 1], entry: [0.04, 0] });
  p.edge("LINE", "sA", "POST webhook", "msg", { shift: -10, lx: 0.6 });
  p.edge("s", "t1");
  p.edge("t1", "a1");
  p.edge("a1", "gM", "", "seq", { exit: [1, 0.5], entry: [0.5, 0] });
  p.edge("sA", "fA1");
  p.edge("fA1", "gA");
  p.edge("gA", "eA", "ไม่", "seq", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("gA", "fA2", "ใช่");
  p.edge("fA2", "gM", "", "seq", { exit: [1, 0.5], entry: [0.5, 1] });
  p.edge("gM", "f1");
  p.edge("f1", "f2");
  p.edge("f2", "d1", "", "dataAssoc", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("f2", "g1");
  p.edge("g1", "f3", "ไม่");
  p.edge("g1", "f7", "ใช่", "seq", { exit: [0.5, 1], entry: [0, 0.5], via: [[7, "FN", B]] });
  p.edge("f3", "f4");
  p.edge("f4", "f5");
  p.edge("f5", "g2");
  p.edge("f7", "g2", "", "seq", { exit: [1, 0.5], entry: [0.5, 1], via: [[11, "FN", B]] });
  p.edge("g2", "eE", "ไม่", "seq", { exit: [1, 0.5], entry: [0.5, 0], via: [[11.5, "FN", A]] });
  p.edge("g2", "f6", "ใช่");
  p.edge("f6", "e");
  p.edge("f6", "LINE", "push API", "msg", { shift: 40, lx: -0.75 });
  p.edge("LINE", "CUST", "ใบเสร็จ PDF", "msg", { exit: [0.875, 0], entry: [0.875, 1] });
  p.edge("f6", "a2", "Realtime", "seq", { exit: [0.25, 0], entry: [0.25, 1], lx: -0.2 });
  p.edge("a2", "e2");
  p.edge("f3", "FA", "POST /token · /contacts · /receipts", "msg", { lx: -0.5 });
  p.edge("f5", "FA", "export-pdf", "msg", { lx: -0.5 });
  p.edge("f3", "d2", "", "dataAssoc", { exit: [0.5, 0], entry: [0.5, 1] });
  p.edge("f5", "d3", "", "dataAssoc", { exit: [0.5, 0], entry: [0.5, 1] });
  p.node("n1", "DB", 2.5, "note", "“paid” ใช้ได้เฉพาะคนที่ผูก LINE ID แล้ว → ทดลองวงแคบได้\nโดยผูกแค่ 3 คน คนอื่น (รวมลูกค้า) สั่งไม่ได้ ระบบเมินเงียบ", { size: [330, 44] });
  p.node("n2", "APP", 7, "note", "ใบแจ้งหนี้ที่ยังไม่ออกสำเร็จ (ไม่มี document id) จะถูกปฏิเสธ 409 —\nต้องรอรอบ generate (P9) ก่อน", { size: [360, 44] });
  pages.push(p);
}

// ===========================================================================
// P11 นำระบบขึ้นใช้งาน (Deploy / Go-live)
// ===========================================================================
{
  const p = new Page("P11 นำระบบขึ้นใช้งาน", {
    title: "P11 — นำระบบขึ้นใช้งานจริง (Deploy / Go-live ตาม docs/go-live-runbook.md)",
    subtitle:
      "ทำตามลำดับ ห้ามข้าม — แต่ละขั้นพึ่งขั้นก่อนหน้า · push ขึ้น main = deploy หน้าเว็บอัตโนมัติ · migration รันเองใน SQL Editor · Edge Function + secrets deploy ผ่าน CLI",
    cols: 12,
    colW: 185,
  });
  p.pool("FlowAccount (developer support)", [], { key: "FA", height: 50 });
  p.pool("ทีมงาน YMTD", [
    { key: "OWN", label: "เจ้าของระบบ", kind: "human", height: 180 },
    { key: "DEV", label: "ผู้พัฒนา (Claude Code)", kind: "human", height: 140 },
    { key: "GH", label: "GitHub Actions", kind: "sched", height: 110 },
    { key: "SB", label: "Supabase (production)", kind: "backend", height: 120 },
  ]);

  p.node("s", "OWN", 0, "start", "พร้อมขึ้นระบบ");
  p.node("gp", "OWN", 1, "and", "");
  p.node("t0", "OWN", 2, "send", "ขอ Production OpenAPI\ncredentials (แจ้งว่าใช้ Pro\nBusiness + ทดสอบ Sandbox แล้ว)", { dy: -45, size: [175, 60] });
  p.node("c0", "OWN", 3.2, "catchMsg", "ได้ client_id /\nclient_secret (1–2 วัน)", { dy: -45 });
  p.node("t1", "DEV", 2, "service", "merge feat/flowaccount-receipt\n→ main แล้ว push", { size: [165, 56] });
  p.node("g1", "GH", 3, "service", "deploy.yml: build + deploy\nหน้าเว็บขึ้น GitHub Pages\n(1–2 นาที)");
  p.node("t2", "OWN", 4, "user", "รัน migrations-016-019.sql\nใน SQL Editor ครั้งเดียว\n(ถ้าแดง หยุด ส่ง error มา)", { dy: 45, size: [170, 60] });
  p.node("s1", "SB", 4, "service", "ตาราง/คอลัมน์/bucket ใหม่\n(ใน transaction เดียว)");
  p.node("t3", "OWN", 5, "user", "สร้าง Supabase access token\n+ ตั้ง GitHub secrets\n(SUPABASE_URL, SERVICE_ROLE)", { dy: 45, size: [175, 60] });
  p.node("t4", "DEV", 6, "service", "supabase secrets set\n(FlowAccount prod, bank\naccount id) + deploy 4 functions", { size: [175, 60] });
  p.node("s2", "SB", 6, "service", "Edge Functions + secrets\nพร้อมใช้ (MOCK=false)");
  p.node("gj", "OWN", 7, "and", "");
  p.node("t5", "OWN", 8, "user", "ทดลองวงแคบ: ผูก LINE ID\n3 คน, บริษัททดลอง 1 ราย\n(tax_id, ที่อยู่, ค่าบริการ)", { size: [175, 64] });
  p.node("g2", "OWN", 9, "xor", "ไม่มีปัญหา?");
  p.node("t6", "DEV", 9, "task", "รับภาพ error →\nแก้ไขและ deploy ใหม่");
  p.node("t7", "OWN", 10, "user", "เปิดใช้จริง: ผูก LINE ทุกคน,\nกรอกข้อมูลลูกค้าครบ,\nประกาศใช้คำสั่ง paid", { size: [175, 64] });
  p.node("e", "OWN", 11, "end", "ระบบใช้งานจริง");

  p.edge("s", "gp");
  p.edge("gp", "t0", "", "seq", { exit: [0.5, 0], entry: [0, 0.5], via: [[1, "OWN", -45]] });
  p.edge("gp", "t1", "", "seq", { exit: [0.5, 1], entry: [0, 0.5], via: [[1, "DEV"]] });
  p.edge("t0", "FA", "อีเมลขอ credentials", "msg", { shift: -20, lx: -0.3 });
  p.edge("FA", "c0", "ส่ง credentials", "msg", { lx: 0.3 });
  p.edge("t0", "c0");
  p.edge("c0", "gj", "", "seq", { exit: [1, 0.5], entry: [0.5, 0], via: [[7, "OWN", -45]] });
  p.edge("t1", "g1", "", "seq", { exit: [1, 0.5], entry: [0.5, 0] });
  p.edge("g1", "t2", "", "seq", { exit: [0.5, 0], entry: [0, 0.5], via: [[3, "OWN", 45]] });
  p.edge("t2", "s1", "SQL", "seq", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("t2", "t3");
  p.edge("t3", "t4", "access token", "seq", { exit: [1, 0.5], entry: [0.5, 0], via: [[6, "OWN", 45]] });
  p.edge("t4", "s2");
  p.edge("t4", "gj", "", "seq", { exit: [1, 0.5], entry: [0.5, 1], via: [[7, "DEV"]] });
  p.edge("gj", "t5");
  p.edge("t5", "g2");
  p.edge("g2", "t6", "มีปัญหา", "seq", { exit: [0.5, 1], entry: [0.5, 0] });
  p.edge("t6", "t5", "ทดลองซ้ำ", "seq", { exit: [0, 0.5], entry: [0.5, 1], via: [[8, "DEV"]] });
  p.edge("g2", "t7", "ใช่");
  p.edge("t7", "e");
  p.node("n1", "GH", 6.5, "note", "ระหว่างรอ credentials (ขั้น 0) ทำขั้น merge / migration / GitHub secrets ไปก่อนได้\nแต่ Edge Function จะใช้จริงได้ต่อเมื่อมี production client_id/secret", { size: [430, 44] });
  p.node("n2", "SB", 8.6, "note", "ทดลองวงแคบไม่ต้องแก้โค้ด: “paid” ใช้ได้เฉพาะคนที่ผูก LINE ID\nและใบแจ้งหนี้ออกเฉพาะบริษัทที่กรอกค่าบริการรายเดือนแล้ว", { size: [380, 44] });
  pages.push(p);
}
};
