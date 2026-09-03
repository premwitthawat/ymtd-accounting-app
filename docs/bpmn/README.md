# แผนภาพกระบวนการ (BPMN 2.0)

`ymtd-processes.drawio` — เปิดด้วย [draw.io / diagrams.net](https://app.diagrams.net) หรือ draw.io desktop
มี 12 หน้า (แท็บด้านล่างของ draw.io) หน้าละ 1 กระบวนการ ใช้สัญลักษณ์จากชุด **BPMN 2.0** ของ draw.io
และแบ่ง swimlane ตามหน้าที่ (pool = องค์กร, lane = บทบาท/ระบบ)

| หน้า | กระบวนการ | PNG |
|---|---|---|
| 0 | ภาพรวมทุกกระบวนการ (collapsed sub-process + message flow ข้ามองค์กร) | [png/00-overview.png](png/00-overview.png) |
| P1 | เข้าสู่ระบบ (username + PIN → Supabase Auth, บทบาท owner/manager/employee) | [png/01-login.png](png/01-login.png) |
| P2 | จัดการผู้ใช้และผูก LINE ID ของพนักงาน (admin-users, คำสั่ง `myid`) | [png/02-users-line-id.png](png/02-users-line-id.png) |
| P3 | ตั้งค่าบริษัท บริการที่ต้องยื่น ประเภทบริการ ปิดใช้งานบริษัท | [png/03-company-setup.png](png/03-company-setup.png) |
| P4 | เชื่อมกลุ่ม LINE ของลูกค้ากับบริษัท (line-webhook บันทึก `line_groups`) | [png/04-line-group-link.png](png/04-line-group-link.png) |
| P5 | งานยื่นภาษี/ประกันสังคมประจำเดือน (`ensure_current_period_tasks`, done/skip/restore, ปรับวันครบกำหนด) | [png/05-monthly-filing-tasks.png](png/05-monthly-filing-tasks.png) |
| P6 | แจ้งยอดชำระและทวงถามทาง LINE (`payment_records`, cron `send-reminders.js`) | [png/06-payment-notice-reminders.png](png/06-payment-notice-reminders.png) |
| P7 | รับสลิปจากกลุ่ม LINE, ตรวจสอบ/ยืนยัน, คำสั่ง `clear` | [png/07-slip-review-clear.png](png/07-slip-review-clear.png) |
| P8 | ออกใบเสร็จค่าบริการยื่นภาษีผ่าน FlowAccount (`flowaccount-issue-receipt`) | [png/08-filing-receipt-flowaccount.png](png/08-filing-receipt-flowaccount.png) |
| P9 | ใบแจ้งหนี้ค่าบริการรายเดือนอัตโนมัติทุกวันที่ 1 (`flowaccount-invoices` generate) | [png/09-monthly-invoices.png](png/09-monthly-invoices.png) |
| P10 | รับชำระใบแจ้งหนี้ + ออกใบเสร็จอัตโนมัติส่งเข้ากลุ่ม (ปุ่มในแอป / คำสั่ง `paid`) | [png/10-invoice-paid-auto-receipt.png](png/10-invoice-paid-auto-receipt.png) |
| P11 | นำระบบขึ้นใช้งานจริงตาม `go-live-runbook.md` | [png/11-deploy-go-live.png](png/11-deploy-go-live.png) |

## สีของ lane

| สี | ความหมาย |
|---|---|
| เหลืองอ่อน | คน — เจ้าของ/ผู้จัดการ, พนักงาน |
| ฟ้าอ่อน | เว็บแอป (React) |
| เขียวอ่อน | Supabase (DB / Auth / Storage / Edge Function) |
| ม่วงอ่อน | GitHub Actions (ตัวตั้งเวลา) |
| เทา (pool แยก) | องค์กรภายนอก — ลูกค้าในกลุ่ม LINE, LINE Platform, FlowAccount |

## แก้ไข

แก้ในไฟล์ `.drawio` ได้ตรง ๆ — แต่ถ้าต้องการจัด layout ใหม่ทั้งชุด ไฟล์นี้ถูก *สร้าง* จาก
`generator/` (Node.js ไม่มี dependency): แก้ `build.cjs` / `pages2.cjs` แล้วรัน

```powershell
.\docs\bpmn\generator\render.ps1     # สร้าง .drawio ใหม่ + export PNG ทุกหน้า (ต้องมี draw.io desktop)
node docs\bpmn\generator\build.cjs docs\bpmn\ymtd-processes.drawio   # เฉพาะ .drawio
```

ถ้าแก้ `.drawio` ด้วยมือแล้ว อย่ารัน generator ซ้ำ (จะเขียนทับ)
