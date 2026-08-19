# FlowAccount OpenAPI — สิ่งที่พิสูจน์แล้วกับ Sandbox จริง

บันทึกวันที่ 19 ส.ค. 2569 หลังได้ credentials Sandbox จากทีม FlowAccount
ทุกข้อในเอกสารนี้ **ยิงจริงแล้ว** ไม่ใช่อ่านจากคู่มือ — เพราะพบว่า Postman
collection กับ OpenAPI SDK ที่เขาให้มา **ขัดกับ API จริงหลายจุด** และของจริงชนะ

## สรุปสายงานที่ใช้จริง

```
POST /contacts                → สร้างลูกค้า 1 ครั้งต่อบริษัท เก็บ id ไว้
POST /tax-invoices            → ใบแจ้งหนี้ (ออกวันที่ 1)
POST /upgrade/receipts        → ใบเสร็จรับเงิน (อ้างใบแจ้งหนี้ข้างบน)
POST /{path}/{id}/export-pdf/base64  → PDF (ส่งเข้า LINE)
```

ผลทดสอบจริงใน sandbox: `INV2026080003` → `RE2026080002` พร้อม PDF ทั้งคู่

## จุดที่คู่มือผิด / ต้องระวัง

| เรื่อง | คู่มือ/ที่เดาไว้ | ของจริง |
|---|---|---|
| Token URL | `/token` | **`/test/token`** (sandbox) |
| ออกใบเสร็จ | `POST /receipts` | ใช้ไม่ได้ — ตอบ *"Create Receipt API is obsoleted, please follow the Upgrade Receipt procedure"* ต้องใช้ `POST /upgrade/receipts` และต้องมีใบแจ้งหนี้ก่อนเสมอ |
| `/receipts/with-payment` | SDK บอกว่าสร้างใบเสร็จพร้อมรับเงินได้ | ตอบ obsoleted เหมือนกัน |
| path ของใบเสร็จ | เดียวกันทั้ง create/read | **ไม่สมมาตร**: สร้างที่ `/upgrade/receipts` แต่ดึง PDF ที่ `/receipts/{id}` |
| รายการสินค้า | `documentLines[]` | **`items[]`** (`type: 1` = บริการ) |
| หัก ณ ที่จ่าย | `withholdingTaxPercent` | **`documentShowWithholdingTax` / `documentWithholdingTaxPercentage` / `documentWithholdingTaxAmount`** |
| ผูกลูกค้า | `contactId` หรือ `contactCode` ก็ได้ | ต้อง **`contactId` เท่านั้น** (ดูหัวข้อถัดไป) |
| export PDF | POST เปล่าๆ | ต้องมี `Content-Type: application/json` + body `{}` ไม่งั้น **415** |
| ผลลัพธ์ contact | `data.id` | **`data.list[0].id`** (ตอบเป็น list แม้สร้างใบเดียว) |
| ผลลัพธ์เอกสาร | `data.list[0]` | **`data`** ตรงๆ (`data.recordId`, `data.documentSerial`) |
| อ่านเอกสารกลับ (GET by id) | เหมือนตอนสร้าง | **`data.list[0]`** — สลับกับตอน POST |
| วันครบกำหนด | ส่ง `dueDate` ไปตรงๆ | **ถูกเมิน** — ระบบคำนวณเองจาก `publishedOn + creditDays` ต้องส่งเป็นจำนวนวัน |

## กับดักใหญ่: contact ซ้ำ

ทดสอบแล้วยืนยัน — ถ้า **ไม่ส่ง** `contactId` ในเอกสาร ระบบจะ**สร้างลูกค้าใหม่ทุกใบ**
(ทดสอบ 3 เอกสาร ได้ลูกค้าซ้ำ 3 ราย) แต่ถ้าส่ง `contactCode` ที่มีอยู่แล้วจะโดนปฏิเสธ
`ERROR.CONTACT_CODE_DUPLICATE` — มีแค่ `contactId` (ตัวเลข) ที่ผูกกับรายเดิมได้จริง

ถ้าพลาดข้อนี้: 30 บริษัท × 12 เดือน × 2 เอกสาร ≈ **ลูกค้าซ้ำ 700 รายต่อปี**
ในสมุดรายชื่อจริงของสำนักงาน — เลยเก็บ id ไว้ที่ `companies.flowaccount_contact_id`

## ค่าคงที่ที่ใช้

- `referenceDocumentType`: ใบเสนอราคา = 3, ใบวางบิล = 5, **ใบแจ้งหนี้ = 7** (เราใช้ 7)
- `documentType` ที่ได้กลับมา: ใบแจ้งหนี้ = 7, ใบเสร็จ = 9
- `creditType`: 1 = มีเครดิต (ใบแจ้งหนี้ มี dueDate), 3 = ชำระทันที (ใบเสร็จ)
- `contactType` 3 = นิติบุคคล, `contactGroup` 3 = ลูกค้า
- `items[].type` 1 = บริการ
- Rate limit sandbox = 20 ครั้ง/นาที (มี backoff ตาม `Retry-After` อยู่แล้ว)
- Token อายุ 86,400 วินาที (24 ชม.)

## ที่ยังต้องตัดสินใจก่อนขึ้นจริง

1. **VAT** — โค้ดตั้ง `isVat: false` ไว้ (สำนักงานไม่ได้จด VAT) ถ้าจด VAT ต้องแก้
2. **ข้อมูลบริษัทใน FlowAccount ยังว่าง** — `GET /company/info` ของ sandbox ไม่มีเลขผู้เสียภาษี
   ที่อยู่ เบอร์โทร ซึ่งจะไปโผล่หัวเอกสาร ต้องกรอกในหน้า FlowAccount ก่อน
3. **บัญชีธนาคาร** — `GET /bank-accounts` ยังว่าง ถ้าจะให้ใบเสร็จระบุว่ารับโอนเข้าบัญชีไหน
   ต้องเพิ่มใน FlowAccount ก่อน
4. **Production** ต้องแพ็กเกจ Pro Business (5,490 บาท/ปี) และสลับ
   `FLOWACCOUNT_BASE_URL` เป็น `/v1` กับ `FLOWACCOUNT_TOKEN_URL` เป็น `/token`

## บัญชีทดสอบ

Sandbox UI: https://sandbox-new.flowaccount.com/ (ดู user/password ในอีเมลจาก FlowAccount —
**ห้ามเก็บลง repo**) ตั้งค่า credentials ผ่าน `supabase secrets set` เท่านั้น
