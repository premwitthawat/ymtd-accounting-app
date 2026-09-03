# Brief: เพิ่มการออกใบเสร็จผ่าน FlowAccount OpenAPI

> เอกสารสั่งงานสำหรับ Claude Code — ทำใน local เท่านั้น ยังไม่ push
> วางไว้ที่ `docs/flowaccount-brief.md`
> เขียนเมื่อ 7 ส.ค. 2026

---

## 0. อ่านก่อนเริ่ม

**อ่านไฟล์เหล่านี้ให้ครบก่อนเขียนโค้ดบรรทัดแรก:**

| ไฟล์ | เหตุผล |
|---|---|
| `supabase/migrations/001_init.sql` | schema หลัก `companies` / `tasks` |
| `supabase/migrations/006_periods_and_payments.sql` | `company_services`, `tasks.period`, `payment_status` |
| `supabase/migrations/010_payment_records.sql` | ตารางหลักที่งานนี้ต่อยอด |
| `supabase/migrations/012_payment_notice_reminders.sql` | `notice_sent_at` / `last_reminded_at` |
| `supabase/functions/line-webhook/index.ts` | จุดที่ status เปลี่ยนเป็น paid + pattern การเขียน edge function |
| `supabase/functions/admin-users/index.ts` | pattern การตรวจ JWT + CORS (ตัวนี้คือแม่แบบของ function ใหม่) |
| `src/components/CompanyPaymentRecords.jsx` | UI ที่จะเพิ่มปุ่ม |

**สไตล์คอมเมนต์ของ repo นี้:** อธิบาย *ทำไม* ไม่ใช่ *ทำอะไร* — ทุก migration และ function เดิมเขียนแบบนี้หมด ให้เขียนต่อในสไตล์เดียวกัน ไม่ต้องประหยัดคำ

---

## 1. กติกา (ห้ามละเมิด)

- ทำงานบน branch `feat/flowaccount-receipt`
- **ห้าม `git push`** ทุกกรณี
- **ห้าม merge เข้า `main`**
- **ห้าม `supabase functions deploy`** และ **ห้าม `supabase db push`** — ใช้ local stack เท่านั้น
- **ห้ามแตะ `.github/workflows/deploy.yml` และ `daily-reminders.yml`** (กัน auto-deploy ทำงานโดยไม่ตั้งใจ)
- **ห้ามแก้ migration 001–015** ที่มีอยู่ ให้เพิ่มไฟล์ใหม่ต่อจาก 015 เท่านั้น
- **ห้าม hardcode secret** ใด ๆ — ใส่เป็น placeholder ใน `.env.example` อย่างเดียว
- commit เป็นก้อนย่อยตามหัวข้อด้านล่าง อย่ารวมเป็น commit เดียว

---

## 2. บริบทของงาน

ระบบเดิมมี LINE OA integration ครบแล้ว (push, verify signature, map company → LINE group) และมี `payment_records` ที่ track สถานะการชำระเงินอยู่แล้ว

งานนี้คือ **ต่อ FlowAccount OpenAPI เข้ากับจังหวะที่ `payment_records.status` กลายเป็น `'paid'`** เพื่อออกใบเสร็จรับเงินอัตโนมัติ

คอมเมนต์ใน `010_payment_records.sql` เขียนไว้เองแล้วว่า:
> *"A real invoice is a future concern (issued in FlowAccount once that integration exists)"*

งานนี้คือการทำ integration นั้น

### ขอบเขตเฟสนี้

| ทำ | ไม่ทำ (เฟสถัดไป) |
|---|---|
| ปุ่มให้ staff กดออกใบเสร็จเอง | auto-issue เมื่อ status เปลี่ยน |
| ต่อ Sandbox environment | ต่อ Production |
| เก็บ PDF ลง Supabase Storage | ส่งลิงก์ใบเสร็จเข้า LINE |
| mock mode สำหรับทดสอบ | e-Tax Invoice / e-Receipt |

**เหตุผลที่ยังไม่ auto:** เอกสารภาษีที่ออกผิดต้องแก้ด้วยใบลดหนี้ ซึ่งแพงกว่าการให้คนกดยืนยันหนึ่งครั้งเยอะ ให้ staff ตรวจยอดก่อนทุกครั้งจนกว่า master data จะสะอาด

---

## 3. ข้อเท็จจริงของ FlowAccount OpenAPI

ข้อมูล ณ ส.ค. 2026 — ไม่ต้องไปค้นใหม่ ใช้ตามนี้ได้

- Base URL: Sandbox `https://openapi.flowaccount.com/test` · Production `https://openapi.flowaccount.com/v1`
- Auth: OAuth2 **Client Credentials** (1 client ต่อ 1 บริษัท — ตรงกับเคสนี้)
- **Rate limit: Production 100 req/min, Sandbox 20 req/min** → เกินได้ `HTTP 429`
- Endpoint ที่ใช้:
  - `POST /receipts` — สร้างใบเสร็จรับเงิน
  - `POST /receipts/{id}/export-pdf/base64` — ดึง PDF (เพิ่มเมื่อ ก.ค. 2026)
  - `POST /contacts` / `GET /contacts` — จัดการผู้ติดต่อ
- Response ของ export-pdf:
  ```json
  { "status": true, "data": "JVBERi0xLjQK...", "message": "", "code": 0 }
  ```
  `data` = base64 ของไฟล์ PDF
- **ไม่มี webhook ขาออก** — FlowAccount ไม่ยิงกลับมาบอกอะไรเลย trigger ต้องมาจากฝั่งเราเสมอ

---

## 4. Task 1 — migration `016_flowaccount_fields.sql`

### `companies`
```
tax_id                  text
address                 text
branch_code             text default '00000'
flowaccount_contact_id  text
```

### `task_types`
```
flowaccount_product_name  text
unit_price                numeric
```
(map บริการ → รายการสินค้า/บริการใน FlowAccount)

### `payment_records`
```
amount_gross                 numeric
wht_rate                     numeric default 0
wht_amount                   numeric
amount_received              numeric
flowaccount_document_id      text
flowaccount_document_number  text
receipt_path                 text
issued_at                    timestamptz
```

**สำคัญ:**
- **ห้าม drop คอลัมน์ `amount` เดิม** — `CompanyPaymentRecords.jsx` และ flow เดิมยังใช้อยู่ ให้เพิ่มคอลัมน์ใหม่ขนานกันไป
- สร้าง `unique index` บน `flowaccount_document_id` (where not null) — นี่คือ idempotency guard ระดับ DB ที่กันใบเสร็จซ้ำได้แน่นอนที่สุด
- `receipt_path` เก็บ **object path ไม่ใช่ URL** — ทำตาม pattern เดิมของ `slip_path` (ดูคอมเมนต์ใน `line-webhook/index.ts` เรื่องทำไมถึงไม่เก็บ signed URL)

### เหตุผลเรื่อง WHT (เขียนลงคอมเมนต์ด้วย)

ค่าบริการทำบัญชีที่จ่ายโดยนิติบุคคลถูกหักภาษี ณ ที่จ่าย 3% ดังนั้น **ยอดในสลิปคือยอดสุทธิ แต่ใบเสร็จต้องแสดงยอดเต็ม** — schema เดิมมี `amount` ตัวเดียวจึงไม่พอ ต้องแยกสามค่า

### Storage bucket
```sql
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
```
private เท่านั้น + policy ให้ `authenticated` อ่านได้ (ลอกจาก `payment_slips` ใน `009_invoices_billing.sql`)

---

## 5. Task 2 — migration `017_integration_tokens.sql`

```sql
create table integration_tokens (
  provider     text primary key,
  access_token text not null,
  expires_at   timestamptz not null,
  updated_at   timestamptz not null default now()
);

alter table integration_tokens enable row level security;
-- ไม่มี policy ใด ๆ = service_role เข้าถึงได้อย่างเดียว
```

**เหตุผล (เขียนลงคอมเมนต์):** ต่างจาก `payment_records` ที่ staff อ่านได้ — token นี้คุมบัญชี FlowAccount จริงทั้งบัญชี ใครได้ไปสร้างเอกสารภาษีในนามบริษัทได้เลย จึงไม่ให้ `authenticated` แตะ

**ห้ามใส่ตารางนี้ใน `supabase_realtime` publication**

---

## 6. Task 3 — Edge Function `flowaccount-issue-receipt`

สร้างที่ `supabase/functions/flowaccount-issue-receipt/index.ts`

**แม่แบบ: `admin-users/index.ts`** (มี CORS + ตรวจ JWT อยู่แล้ว) — ไม่ใช่ `line-webhook` ซึ่งไม่มี CORS เพราะ LINE เรียกตรง

### Input
```json
{ "payment_record_id": "uuid", "amount_gross": 5000, "wht_rate": 3 }
```

### ลำดับการทำงาน

1. ตรวจ JWT ของ staff — ไม่มี/ไม่ถูก → `401`
2. โหลด `payment_records` + join `tasks` + `companies` + `task_types`
3. **early return ถ้ามี `flowaccount_document_id` แล้ว** → คืนข้อมูลเดิม ไม่ยิงซ้ำ
4. validate: `status = 'paid'`, มี `amount_gross`, `companies.tax_id` ไม่ว่าง → ถ้าไม่ผ่านคืน `400` พร้อมบอกว่าขาดอะไร
5. ขอ token: อ่าน `integration_tokens` ถ้า `expires_at` เหลือ > 60 วิ ใช้ตัวเดิม ไม่งั้นขอใหม่แล้ว upsert
6. contact: ถ้า `companies.flowaccount_contact_id` ว่าง → สร้างใหม่แล้วเขียนกลับ
7. `POST /receipts` พร้อม WHT
8. `POST /receipts/{id}/export-pdf/base64` → decode → upload เข้า bucket `receipts` ที่ path `{company.short}/{YYYY}/{MM}/{document_number}.pdf`
9. update `payment_records`: `flowaccount_document_id`, `flowaccount_document_number`, `receipt_path`, `issued_at`, `wht_amount`, `amount_received`

### ข้อกำหนดเพิ่ม

- **retry แบบ exponential backoff เมื่อเจอ HTTP 429** (FlowAccount แนะนำเองในประกาศ rate limit)
- base URL อ่านจาก env — **ค่า default ต้องเป็น Sandbox** ไม่ใช่ Production
- ใช้ timezone Asia/Bangkok สำหรับ path ปี/เดือน — ลอก `bangkokYearMonth()` จาก `line-webhook/index.ts` มาใช้ อย่าเขียนใหม่
- ถ้าสร้างใบเสร็จสำเร็จแต่ export PDF พัง → **ต้องบันทึก `flowaccount_document_id` ลง DB ให้ได้ก่อน** แล้วค่อยคืน error เรื่อง PDF ไม่งั้นจะเกิดใบเสร็จกำพร้าที่ระบบมองไม่เห็นและกดซ้ำได้

### Mock mode

env `FLOWACCOUNT_MOCK=true` → คืน response ปลอมตาม shape จริง (รวม base64 ของ PDF สั้น ๆ) โดยไม่ยิงออกเน็ต

**เหตุผล:** credentials จริงต้องรอ 1–2 วันทำการหลังลงทะเบียนที่ `form.flowaccount.com/request-openapi` — mock mode ทำให้ทดสอบ flow ทั้งเส้นจบได้ก่อน

---

## 7. Task 4 — UI ปุ่ม "ออกใบเสร็จ"

แก้ `src/components/CompanyPaymentRecords.jsx`

- ปุ่มโผล่เฉพาะเมื่อ `status === 'paid'` **และ** `flowaccount_document_id` ยังว่าง
- กดแล้วเปิด modal:
  - ช่องกรอกยอดเต็ม (prefill จาก `task_types.unit_price`)
  - checkbox "หัก ณ ที่จ่าย 3%"
  - **แสดงยอดสุทธิที่คำนวณได้ให้เห็นก่อนกดยืนยัน** — เจ้าหน้าที่จะได้เทียบกับยอดในสลิปว่าตรงกันไหม
- ระหว่างเรียก: disable ปุ่ม + spinner (กัน double-submit ฝั่ง client เสริมจาก guard ฝั่ง DB)
- สำเร็จ → แสดงเลขที่เอกสาร + ลิงก์ "ดูใบเสร็จ" ที่มินต์ signed URL สด ๆ ตอนคลิก (ทำตาม pattern ปุ่ม "ดูสลิป" ที่มีอยู่แล้ว)
- ใช้ `Toast.jsx` ที่มีอยู่แล้วสำหรับ error อย่าสร้างระบบ notification ใหม่

---

## 8. Task 5 — ปิดช่องโหว่ `clear` (commit แยก)

**ทำเป็น commit แยกต่างหาก** เพราะเป็น security fix ที่ควร merge ได้ก่อน ไม่ต้องรอ FlowAccount เสร็จ

### ปัญหา

`handleClearCommand()` ใน `line-webhook/index.ts` ทำงานจากข้อความ `"clear"` ในกลุ่ม LINE ของลูกค้า — แปลว่า **ลูกค้าเองก็พิมพ์ได้** ตอนนี้ผลกระทบแค่เปลี่ยนสถานะในแอป แต่พอแขวน FlowAccount ไว้ปลายทางนี้เมื่อไหร่ = ลูกค้าสั่งออกเอกสารภาษีในนามบริษัทได้

### แก้

1. migration `018_staff_line_users.sql` — เพิ่ม `profiles.line_user_id text unique`
2. `handleClearCommand` เช็ค `event.source.userId` เทียบกับ `profiles` ก่อนทำงาน
3. ไม่ตรง → log warning แล้ว return เงียบ ๆ **ห้ามตอบกลับในกลุ่ม** (repo นี้มีข้อกำหนดชัดว่า bot ต้องไม่โพสต์ในกลุ่มลูกค้า — ดูคอมเมนต์ใน `011_line_groups.sql`)
4. ถ้ายังไม่มีใครผูก `line_user_id` เลย → คงพฤติกรรมเดิมไว้ (fail open) ไม่งั้นระบบที่ใช้อยู่จะพังทันที เขียนคอมเมนต์กำกับว่านี่เป็น transition state

---

## 9. ห้ามทำ

- ❌ เรียก FlowAccount API จาก frontend — `VITE_*` ถูก bake ลง bundle ใครก็เปิดดูได้
- ❌ แขวน FlowAccount call ไว้กับ `handleClearCommand` หรือ `handleSlipImage`
- ❌ push LINE message จาก edge function ในเฟสนี้
- ❌ แก้ logic reminder เดิมใน `scripts/send-reminders.js`
- ❌ เปลี่ยน RLS ของตารางเดิม
- ❌ เพิ่ม dependency ใหม่ใน `package.json` โดยไม่จำเป็น (edge function ใช้ `esm.sh` เหมือนของเดิม)
- ❌ ตั้งค่า default ชี้ Production

---

## 10. Definition of Done

รันให้ผ่านครบทุกข้อก่อนบอกว่าเสร็จ:

- [ ] `supabase db reset` รัน migration ครบตั้งแต่ 001 ถึง 018 ไม่มี error
- [ ] `supabase functions serve` แล้วเรียก `flowaccount-issue-receipt` ด้วย `FLOWACCOUNT_MOCK=true` ได้ผลลัพธ์ถูกต้อง
- [ ] เรียกซ้ำด้วย `payment_record_id` เดิม → ได้ผลเดิม **ไม่เกิดใบเสร็จใบที่สอง**
- [ ] เรียกโดยไม่มี JWT → `401`
- [ ] เรียกตอน `status != 'paid'` → `400` พร้อมข้อความบอกเหตุผล
- [ ] `npm run build` ผ่าน ไม่มี warning ใหม่
- [ ] `git diff --stat` ไม่มีไฟล์ใน `.github/workflows/`
- [ ] `git log --oneline` เห็น commit แยกก้อนตามหัวข้อ ไม่ใช่ก้อนเดียว
- [ ] grep หา secret ที่หลุด: `git diff | grep -iE "client_secret|access_token|Bearer [A-Za-z0-9]"` ต้องไม่เจอค่าจริง
- [ ] `.env.example` อัปเดตครบทุกตัวแปรใหม่ เป็น placeholder ทั้งหมด

---

## 11. รายงานกลับ

เมื่อเสร็จ ให้สรุปเป็นข้อความในแชท (ไม่ต้องสร้างไฟล์เพิ่ม):

1. ไฟล์ที่สร้าง / แก้ ทั้งหมด
2. รายการ env vars ใหม่ที่ต้องตั้งค่าก่อนใช้จริง
3. อะไรที่ยังทดสอบไม่ได้เพราะติด mock
4. ข้อสังเกตหรือความเสี่ยงที่เจอระหว่างทางแต่ไม่ได้อยู่ในสโคป

---

## ภาคผนวก — env vars ใหม่

```bash
# .env.example
FLOWACCOUNT_BASE_URL=https://openapi.flowaccount.com/test
FLOWACCOUNT_CLIENT_ID=your-client-id
FLOWACCOUNT_CLIENT_SECRET=your-client-secret
FLOWACCOUNT_MOCK=true
```

ตั้งเป็น function secret ตอน deploy จริง:
```bash
supabase secrets set FLOWACCOUNT_CLIENT_ID=... FLOWACCOUNT_CLIENT_SECRET=...
```

---

## ภาคผนวก — เรื่องที่ต้องจัดการนอกโค้ด

1. **ลงทะเบียนขอ OpenAPI** ที่ `form.flowaccount.com/request-openapi` — รอ 1–2 วันทำการ, Sandbox ใช้ได้ 30 วัน
2. **แพ็กเกจ FlowAccount** ต้องเป็น Pro Business รายปีถึงจะเปิด OpenAPI ได้
3. **กรอก master data** — `tax_id` / `address` ของลูกค้าทุกราย และ `unit_price` ของทุกบริการ นี่คืองานหนักที่สุดของโปรเจกต์นี้ และเป็นงานที่โค้ดช่วยไม่ได้
4. **โควตา LINE** — ระบบ push reminder วันละ 2 รอบอยู่แล้ว โควตาฟรี 300 ข้อความ/เดือนอาจใกล้เต็ม ควรนับ push จริงจาก Actions log ก่อนวางแผนเฟสส่งใบเสร็จเข้า LINE
5. **e-Tax Invoice & e-Receipt** — ถ้าต้องการให้ใบเสร็จอิเล็กทรอนิกส์มีผลทางกฎหมายเต็มรูปแบบ ต้องขึ้นทะเบียนกับกรมสรรพากรและมีใบรับรองอิเล็กทรอนิกส์ คนละเรื่องกับการส่งไฟล์ PDF
6. **PDPA** — ก่อนส่งเอกสารการเงินผ่าน LINE ควรมีการขอความยินยอมจากลูกค้า
