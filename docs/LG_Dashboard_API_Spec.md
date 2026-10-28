# สเปก API: Dashboard ขออนุมัติหนังสือค้ำ (มือถือ)

หน้าแอป `app/(tabs)/lg_dashboard.tsx` ← หน้าเว็บ `lg_dashboard.php`
(เมนูเว็บ: ขออนุมัติหนังสือค้ำ › Dashboard ขออนุมัติหนังสือค้ำ)

> **สถานะ: มีแล้ว** — `tjc-api/mobile_api/modules/lg_API_mobile.php` (ไฟล์ใหม่ อ่านอย่างเดียว ไม่แก้ไฟล์เดิม)
> ทั้ง `get_dashboard` และ `get_import_dashboard` ทดสอบกับฐานข้อมูล dev แล้ว

แอปใช้ **ดูข้อมูลอย่างเดียว** ไม่มี action เขียนข้อมูล (ตรวจ/อนุมัติ/ยกเลิก/แนบไฟล์ อยู่บนเว็บเท่านั้น)

---

## Endpoint

```
GET {API_BASE}/mobile_api/modules/lg_API_mobile.php?action=get_dashboard&user_id={id}
```

รูปแบบเดียวกับโมดูลอื่นใน `mobile_api/modules` — ยืนยันตัวตนด้วย `user_id` ไม่มี session
ตอบกลับ `{ "status": "success", ... }` หรือ `{ "status": "error", "message": "...", "code": "..." }`

## สิทธิ์ (ต้องเช็คฝั่ง API)

| เงื่อนไข | ผล |
|---|---|
| ผู้ใช้ไม่มีสิทธิ์หน้า `lg_dashboard.php` | `status: error`, `code: "no_permission"` |
| ผู้ใช้ไม่มี action `lg_view_approver_name` | ส่ง `checker_name` / `approver_name` เป็น `""` (ซ่อนชื่อ เหมือนเว็บ) แต่ยังส่ง `has_checker` / `has_approver` ตามจริง |

## Query (เหมือน `lg_dashboard.php` บรรทัด 128-136)

```sql
SELECT lg.*, c.customer_name, comp.company_name, comp.company_shortname
FROM letter_of_guarantees lg
LEFT JOIN customers c ON lg.customer_id = c.customer_id
LEFT JOIN companies comp ON lg.company_id = comp.id
WHERE (lg.lg_condition IS NULL OR lg.lg_condition <> 'ค้ำเงินสด')
  AND (lg.data_source IS NULL OR lg.data_source = 'manual')
ORDER BY lg.id DESC
```

ส่ง **ทุกแถวรวมแถวที่ยกเลิก** (แอปขีดฆ่าแถวยกเลิกเองและไม่นับใน KPI เหมือนเว็บ)
ไม่ต้องคำนวณ KPI / นับถอยหลัง ฝั่ง API — แอปคำนวณเองจากรายการ ด้วยสูตรเดียวกับ JS ของเว็บ

## Response

```json
{
  "status": "success",
  "can_view_approver_name": 1,
  "list": [
    {
      "id": 123,
      "project_code": "2026-544",
      "lg_condition": "หนังสือค้ำฯ",
      "contract_no": "01/2569",
      "project_name": "...",
      "company_name": "บริษัท ทีเจซี ...",
      "company_shortname": "TJC",
      "customer_name": "องค์การบริหารส่วนตำบล ...",
      "agency_address": "...",
      "bank_name": "กรุงไทย (KTB)",
      "lg_value": 16000.00,
      "lg_start_date": "2026-10-07",
      "lg_end_date": "2027-10-07",
      "alert_days": 30,
      "lg_status": "",
      "has_checker": 1,
      "checker_name": "สมชาย ใจดี",
      "checked_at": "2026-10-08 09:15:00",
      "has_approver": 0,
      "approver_name": "",
      "approved_at": "",
      "recorder": "ชูศักดิ์ รักไทย",
      "last_editor": "",
      "req_nickname": "",
      "req_department": "",
      "canceled_by": "",
      "canceled_at": "",
      "attached_files": [
        {
          "topic": "หนังสือค้ำประกัน",
          "file_path": "uploads/lg_files/LG_1728_abc.pdf",
          "original_name": "LG.pdf",
          "upload_date": "2026-10-07 14:20:00",
          "uploader_name": "ชูศักดิ์ รักไทย"
        }
      ]
    }
  ]
}
```

### กติกาฟิลด์

| ฟิลด์ | หมายเหตุ |
|---|---|
| `lg_condition` | ค่าว่าง/NULL ให้ส่ง `"หนังสือค้ำฯ"` (เว็บแสดงแบบนี้) |
| `lg_status` | `"ยกเลิก"` = แถวยกเลิก, `"อนุมัติแล้ว"` = นำเข้าย้อนหลังแบบอนุมัติแล้ว (ไม่มีชื่อผู้อนุมัติ) |
| `has_checker` | `1` ถ้า `checker_name` ไม่ว่าง **หรือ** `lg_status = 'อนุมัติแล้ว'` (เหมือน `data-has-checker` บนเว็บ) |
| `has_approver` | `1` ถ้า `approver_name` ไม่ว่าง **หรือ** `lg_status = 'อนุมัติแล้ว'` |
| วันที่ทั้งหมด | ค.ศ. `YYYY-MM-DD` / `YYYY-MM-DD HH:MM:SS` ดิบ — ค่าว่าง/`0000-00-00` ให้ส่ง `""` (แอปจัดรูปแบบเอง) |
| `lg_value` | ตัวเลข (float) |
| `alert_days` | int, ค่าว่างให้ส่ง `30` (ค่าเริ่มต้นเดียวกับเว็บ) |
| `attached_files` | decode JSON จากคอลัมน์ `attached_files` แล้วส่งเป็น array, ไม่มีให้ส่ง `[]` · `uploader_name` ว่างให้ใช้ `req_fullname` ของแถว (เหมือนเว็บบรรทัด 222) |

## แอปคำนวณเอง (อ้างอิงเพื่อเทียบตัวเลขกับเว็บ)

ตรงกับ `applyFilters()` ใน `lg_dashboard.php` บรรทัด ~1930-2030 — นับเฉพาะแถวที่ **ไม่ยกเลิก** และผ่านตัวกรอง:

- มูลค่าค้ำรวม = ผลรวม `lg_value` · จำนวนรายการ
- รูปแบบ: `จนกว่าจะหมด…` / `เงินสด` / อื่นๆ = หนังสือค้ำฯ
- รอผู้จัดการ = `!has_checker` · ผู้จัดการอนุมัติ = `has_checker`
- รอผู้ดูแลหนังสือค้ำ = `!has_approver` · ผู้ดูแลอนุมัติ = `has_approver`
- นับถอยหลัง `d = lg_end_date − วันนี้` (วัน): `d > alert_days` ปกติ · `0 < d ≤ alert_days` ใกล้หมดอายุ · `d = 0` วันนี้! (นับเป็นใกล้หมดอายุ) · `d < 0` หมดประกัน

---

# ส่วนที่ 2: แดชบอร์ดหนังสือค้ำประกัน (ชุดนำเข้า)

หน้าแอป `app/(tabs)/lg_import_dashboard.tsx` ← หน้าเว็บ `lg_import_dashboard.php`
(เมนูเว็บ: ขออนุมัติหนังสือค้ำ › หนังสือค้ำฯ (ชุดนำเข้า)) — หน้าแอปใช้คอมโพเนนต์เดียวกับส่วนที่ 1

```
GET {API_BASE}/mobile_api/modules/lg_API_mobile.php?action=get_import_dashboard&user_id={id}
```

- **สิทธิ์:** หน้า `lg_import_dashboard.php` (ไม่มีสิทธิ์ → `code: "no_permission"`) · ซ่อนชื่อผู้อนุมัติตาม `lg_view_approver_name` เหมือนส่วนที่ 1
- **Query** (เหมือน `lg_import_dashboard.php` บรรทัด 137-145) — ส่งทุกแถวรวมที่ยกเลิก **เรียงตามวันหมดอายุ** (`ORDER BY lg.lg_end_date ASC`):

```sql
SELECT lg.*, c.customer_name, comp.company_name, comp.company_shortname,
       b.file_name AS batch_file, b.imported_at, b.imported_by
FROM letter_of_guarantees lg
LEFT JOIN customers c    ON lg.customer_id = c.customer_id
LEFT JOIN companies comp ON lg.company_id = comp.id
LEFT JOIN lg_import_batches b ON lg.import_batch_id = b.batch_id
WHERE lg.data_source = 'import'
  AND (lg.lg_condition IS NULL OR lg.lg_condition <> 'ค้ำเงินสด')
ORDER BY lg.lg_end_date ASC
```

- **Response:** รูปแบบเดียวกับส่วนที่ 1 (`can_view_approver_name` + `list[]` ฟิลด์ครบชุดเดิม) **บวกฟิลด์เพิ่มต่อแถว:**

| ฟิลด์ | มาจาก | หมายเหตุ |
|---|---|---|
| `lg_number` | `lg.lg_number` | เลขที่ LG (แอปใช้เป็นหัวการ์ด) |
| `doc_no` | `lg.doc_no` | เลขหนังสือออก |
| `contract_type` | `lg.contract_type` | ประเภทสัญญา |
| `import_sheet` | `lg.import_sheet` | ชื่อชีทใน Excel (ใช้เป็นตัวกรองชีท) |
| `source_row` | `lg.source_row` | แถวในไฟล์ Excel |
| `batch_file` | `b.file_name` | ชื่อไฟล์ที่นำเข้า |
| `imported_at` | `b.imported_at` | `YYYY-MM-DD HH:MM:SS` ดิบ |
| `imported_by` | `b.imported_by` | ชื่อคนนำเข้า |

- **แอปคำนวณเอง:** KPI/สถานะ/นับถอยหลัง สูตรเดียวกับส่วนที่ 1 (เว็บใช้ `lg_display_status()` / `lg_countdown()` ใน `lib/lg_helpers.php` ซึ่งเป็นสูตรเดียวกัน) · จำนวนต่อชีทนับเฉพาะแถวที่ไม่ยกเลิก ชีทว่าง = "ไม่ระบุ"

---

# ส่วนที่ 3: ติดตามหนังสือค้ำประกัน (LG)

หน้าแอป `app/(tabs)/guarantee_tracking.tsx` ← หน้าเว็บ `guarantee_tracking.php`
(เมนูเว็บ: ขออนุมัติหนังสือค้ำ › ติดตามหนังสือค้ำประกัน (LG)) — แทนหน้าเดิม `Guaranteetracking.tsx` ที่ลบไป 17 ต.ค. 69

```
GET {API_BASE}/mobile_api/modules/lg_API_mobile.php?action=get_tracking&user_id={id}
```

- **สิทธิ์:** หน้า `guarantee_tracking.php` (ไม่มีสิทธิ์ → `code: "no_permission"`)
- **Query** (เหมือน `guarantee_tracking.php` บรรทัด 124-141): ทุกใบที่ **ไม่ยกเลิก** และไม่ใช่ค้ำเงินสด ทั้งบันทึกในระบบและชุดนำเข้า `ORDER BY lg.id DESC`
- เว็บเพิ่มคอลัมน์ `track_status` / `debt_*` เองตอนเปิดหน้า (AUTO-SETUP) — API **ไม่แตะ schema** อ่านอย่างเดียว
- **Response:**

```json
{
  "status": "success",
  "track_statuses": ["ยังไม่หมดสัญญา","แจ้งซ่อม","กำลังดำเนินการ","ตรวจชำรุด","ได้รับหนังสือแจ้งปลดภาระผูกพัน","อยู่ระหว่างส่งหนังสือค้ำคืนมา","ได้รับหนังสือค้ำแล้ว"],
  "list": [{
    "id": 5, "project_code": "...", "lg_condition": "หนังสือค้ำฯ", "contract_no": "...", "lg_number": "", "doc_no": "",
    "project_name": "...", "company_name": "...", "company_shortname": "TJC", "customer_name": "...", "agency_address": "...",
    "bank_name": "...", "bank_branch": "", "lg_value": 26295, "total_budget": 0,
    "lg_start_date": "2026-10-07", "lg_end_date": "2027-10-07", "alert_days": 30,
    "warranty_value": 1, "warranty_unit": "years",
    "track_status": "ยังไม่หมดสัญญา", "debt_type": "บุคคล", "debt_name": "",
    "req_fullname": "", "req_nickname": "", "req_position": "", "req_department": "",
    "data_source": "manual", "import_sheet": "", "source_row": "",
    "contacts": [{ "name": "...", "position": "", "channels": [{ "channel": "เบอร์โทรหน่วยงาน", "value": "0066016666", "ext": "" }] }],
    "followups": [{ "detail": "...", "created_at": "2026-10-08 10:00:00" }],
    "attached_files": []
  }]
}
```

| ฟิลด์ | หมายเหตุ |
|---|---|
| `track_status` | ค่าว่าง → `"ยังไม่หมดสัญญา"` (เหมือนเว็บ) |
| `debt_name` | `debt_type = 'ทีม'` ใช้ `debt_team` ไม่งั้นใช้ `debt_user` |
| `contacts` | decode `contact_persons` · รูปแบบเก่ามีแค่ `phone` แปลงเป็น `channels: [{channel:"โทร", value: phone}]` |
| `followups` | จาก `lg_followups` เรียงตาม id (เว็บใช้ `GROUP_CONCAT(... '||')`) |

- **การ์ดสถานะ** นับจากทุกรายการ **ไม่เปลี่ยนตามตัวกรอง** (เว็บนับฝั่ง PHP ครั้งเดียว)

## ส่วนที่ 3 (ต่อ): เลือกผู้รับผิดชอบติดตามหนี้ — action เขียนข้อมูลตัวเดียว

ผู้ใช้ขอให้หน้าติดตามในแอปเลือกผู้รับผิดชอบได้ (หน้าอื่นยังดูอย่างเดียว)

- `get_tracking` ส่ง `"debt_users": ["ชื่อ", ...]` เพิ่ม — รายชื่อพนักงานชุดเดียวกับเว็บ (`guarantee_tracking.php:207-216`: `deleted_at IS NULL`, ตัดชื่อว่าง/ขีด/ซ้ำ)
- บันทึก (เทียบเท่า `POST action=save_debt_owner` ของ `guarantee_tracking.php:33-79`):

```
POST {API_BASE}/mobile_api/modules/lg_API_mobile.php
action=save_debt_owner&user_id={id}&lg_id={lg_id}&debt_user={ชื่อ}
→ { "status": "success", "lg_id": 5, "debt_type": "บุคคล", "debt_name": "งามตา ใจดี" }
```

| เงื่อนไข | ผล |
|---|---|
| ไม่ใช่ POST | `code: "method_not_allowed"` |
| ไม่มีสิทธิ์หน้า `guarantee_tracking.php` | `code: "no_permission"` |
| `debt_user` ว่าง | "กรุณาเลือกผู้รับผิดชอบ" |
| ใบไม่อยู่ในหน้าติดตาม (ยกเลิก / ค้ำเงินสด / ไม่มี) | `code: "not_found"` |
| ชื่อไม่อยู่ใน `debt_users` | `code: "invalid_user"` |

- ป๊อปอัพบนเว็บเลือกได้เฉพาะ **บุคคล** (`:2544-2590`) แอปจึงบันทึก `debt_type = 'บุคคล'`, `debt_team = NULL` เหมือนกัน

## ปุ่มอนุมัติ — `lg_action` (หน้า 1, 2)

ตรงกับ `?action=…&id=…` ของ `lg_dashboard.php:12-71` และ `lg_import_dashboard.php:33-82` (สองหน้าใช้ตรรกะเดียวกัน) ส่วนหน้าค้ำเงินสดบนเว็บซ่อนปุ่มอนุมัติไว้ จึงไม่มีในแอป

```
POST {API_BASE}/mobile_api/modules/lg_API_mobile.php
action=lg_action&user_id={id}&kind=lg|import&id={lg_id}&op={op}
→ { status, id, op, message }
```

| `op` | ผล | สิทธิ์ |
|---|---|---|
| `check` | `checker_name`, `checked_at` (ผู้จัดการอนุมัติ) | เข้าหน้าได้ (เว็บไม่เช็คเพิ่ม) |
| `approve` | `approver_name`, `approved_at`, `lg_status='อนุมัติ'` | เข้าหน้าได้ |
| `uncheck` | ล้างทั้ง 2 ขั้น + `lg_status=NULL` | `lg_cancel_approval` |
| `unapprove` | ล้างขั้นผู้ดูแล + `lg_status=NULL` | `lg_cancel_approval` |
| `cancel` | `lg_status='ยกเลิก'`, `canceled_by`, `canceled_at` | `lg_cancel_record` |

- ผู้กดคือ fullname ของ `user_id` และใช้เวลาไทยแบบเว็บ
- `get_dashboard` / `get_import_dashboard` ส่งข้อมูลเพิ่มให้แอปใช้แสดงปุ่ม
  - สิทธิ์ `can_cancel_approval`, `can_cancel_record`
  - ทุกแถวมี `checker_set` / `approver_set` (มีชื่อในคอลัมน์จริง)
  - แอปใช้ค่าเหล่านี้แสดงปุ่มแบบเดียวกับช่องในตารางเว็บ ผู้จัดการแบบนำเข้าย้อนหลัง "อนุมัติแล้ว" ไม่มีปุ่มยกเลิก
- API กันเพิ่มจากเว็บ
  - รายการต้องอยู่ในหน้านั้นจริง ถ้าไม่ใช่ ตอบ `not_found`
  - รายการที่ยกเลิกไปแล้วกดซ้ำไม่ได้ ตอบ `invalid_state`

## จัดการเอกสารแนบ — `save_attachments` (หน้า 1, 2, 4)

ตรงกับฟอร์ม `update_files_lg_id` ของ `lg_dashboard.php:77-125`, `lg_import_dashboard.php` และ `lg_cash_dashboard.php:87-130`

```
POST (multipart) {API_BASE}/mobile_api/modules/lg_API_mobile.php
action=save_attachments, user_id, kind=lg|import|cash, id,
keep=["uploads/lg_files/...", ...]      ← file_path ของไฟล์เดิมที่ไม่ลบ
upload_files[]=<ไฟล์>, new_file_topics[]=<หัวข้อ>
→ { status, id, added, removed, attached_files: [...] }
```

| `kind` | ตาราง / เงื่อนไขแถว | สิทธิ์หน้า |
|---|---|---|
| `lg` | `letter_of_guarantees` ที่ไม่ใช่ค้ำเงินสด และ `data_source` เป็น NULL หรือ `manual` | `lg_dashboard.php` |
| `import` | `letter_of_guarantees` ที่ไม่ใช่ค้ำเงินสด และ `data_source = 'import'` | `lg_import_dashboard.php` |
| `cash` | `cash_guarantees` | `lg_cash_dashboard.php` |

- ไฟล์เดิมที่เก็บไว้ ใช้ก้อนข้อมูลเดิมจาก DB โดยเทียบ `file_path` กับ `keep` (ไม่รับ JSON ไฟล์จากเครื่องลูก)
- ไฟล์ใหม่ใช้รูปแบบเดียวกับเว็บ
  - ตั้งชื่อ `LG_<time>_<uniqid>.<ext>` และเก็บที่ `uploads/lg_files/`
  - เก็บข้อมูล `{topic, file_path, original_name, upload_date, uploader_name}` โดย `uploader_name` เป็น fullname ของ `user_id`
- หัวข้อในแอปชุดเดียวกับเว็บ: ส่งมอบงาน / สัญญาจ้าง / หนังสือค้ำประกัน / เอกสารอื่นๆ ถ้าไม่ระบุ ใช้ "เอกสารแนบเพิ่มเติม" แบบเว็บ
- **ต่างจากเว็บ 1 จุด:** API รับเฉพาะ `pdf, doc, docx, jpg, jpeg, png` ตาม `accept` ของฟอร์มเว็บ
  - เว็บไม่ได้ตรวจฝั่งเซิร์ฟเวอร์ จึงอัปไฟล์สคริปต์ขึ้นไปได้
  - API ตรวจนามสกุลทุกไฟล์ก่อนย้ายไฟล์ใดๆ ถ้ามีไฟล์ใดผิด ทั้งคำขอถูกปฏิเสธ (`invalid_file`) และไม่มีไฟล์ค้างบนเซิร์ฟเวอร์
- แอปเปิดป๊อปอัพนี้ได้ทั้งจากปุ่ม "ไฟล์แนบ/แนบไฟล์" บนการ์ด และปุ่ม "จัดการเอกสารแนบ" ในหน้ารายละเอียด

---

# ส่วนที่ 4: Dashboard ค้ำเงินสด

หน้าแอป `app/(tabs)/lg_cash_dashboard.tsx` ← หน้าเว็บ `lg_cash_dashboard.php` (เมนูเว็บ: เงินสดค้ำ › Dashboard ค้ำเงินสด)

```
GET {API_BASE}/mobile_api/modules/lg_API_mobile.php?action=get_cash_dashboard&user_id={id}
```

- **สิทธิ์:** หน้า `lg_cash_dashboard.php`
- **ตาราง `cash_guarantees`** (คนละตารางกับ `letter_of_guarantees`) — query เหมือนเว็บบรรทัด 413-420 ทุกแถวรวมที่ยกเลิก `ORDER BY lg.id DESC`
- เว็บสร้างตาราง/คอลัมน์เสริมเองตอนเปิดหน้า (`cash_status_staging`, `agency_name`, `import_batch_id` ฯลฯ) — API อ่านอย่างเดียว ไม่แตะ schema
- **ฟิลด์ที่ต่างจากส่วนอื่น:** `contract_no` (เว็บเรียก "เลขที่ใบเสร็จ"), `contract_type`, `total_budget` (ยอดงบประมาณ), `company_id` (เว็บกรองบริษัทด้วย id), `agency_display` = `customer_name` ไม่งั้น `agency_name` (แถวนำเข้าไม่มี customer_id — เว็บ :1081), `is_imported` (มี `import_batch_id`), `import_note`, `contacts[]`, `attached_files[]`
- **KPI (แอปคำนวณ):** นับเฉพาะแถวไม่ยกเลิกที่ผ่านตัวกรอง — มูลค่ารวม / จำนวนฉบับ / ใกล้หมดอายุ / หมดประกัน · ตัวกรองสถานะ: ใกล้หมดอายุ / หมดประกัน / ยกเลิก
- หน้านี้บนเว็บ **ไม่มีคอลัมน์อนุมัติ 2 ขั้น** (ปิดไว้) แอปจึงไม่มีการ์ดอนุมัติ

---

# ส่วนที่ 5: ติดตามค้ำเงินสด

หน้าแอป `app/(tabs)/guarantee_tracking_cash.tsx` ← หน้าเว็บ `guarantee_tracking_cash.php` (เมนูเว็บ: เงินสดค้ำ › ติดตามค้ำเงินสด)
หน้าแอปใช้คอมโพเนนต์เดียวกับส่วนที่ 3 (`GuaranteeTrackingView variant="cash"`)

```
GET {API_BASE}/mobile_api/modules/lg_API_mobile.php?action=get_cash_tracking&user_id={id}
```

- **สิทธิ์:** หน้า `guarantee_tracking_cash.php`
- **Query** (เว็บบรรทัด 280-307): `cash_guarantees` ทุกใบที่ไม่ยกเลิก `ORDER BY lg.id DESC`
- **`track_statuses`:** ลิสต์จริงจาก `setup_cash_lg_status ORDER BY seq, id` (แก้ชื่อ/เพิ่มได้บนเว็บ) — ไม่มีตาราง → ชุดเริ่มต้นเดียวกับเว็บ (`$lg_known_style`) · `track_status` ว่าง → สถานะแรกของลิสต์ · สถานะที่ไม่อยู่ในลิสต์แล้วเติมท้ายลิสต์ (เว็บ :382-386)
- **`customer_name`:** `customer_name` ไม่งั้น `agency_name` (แถวนำเข้าไม่มี customer_id)
- **`data_source`:** `import` ถ้ามี `import_batch_id` · `import_note` · `contract_type`
- **`followups[]`** จาก `cash_followups` เรียงแบบเว็บ (`followup_date IS NULL, followup_date ASC, id ASC`):
  `{ "followup_date": "YYYY-MM-DD", "call_status": "...", "detail": "...", "from_excel": 0|1, "created_by": "..." }` — ข้ามแถวที่ทั้ง detail และ call_status ว่าง
- **ไม่มีผู้รับผิดชอบติดตามหนี้** (หน้าเว็บนี้ไม่มี) แอปจึงไม่มีปุ่มเลือก
- **การ์ด:** ทั้งหมด + ทุกสถานะในลิสต์ + **หมดประกัน** (วันสิ้นสุดผ่านไปแล้ว) + ยอดรวม — นับจากทุกรายการ ไม่เปลี่ยนตามตัวกรอง (เว็บนับฝั่ง PHP)
- เว็บมีขั้นตอน "แตกสถานะจาก staging เป็นรายการติดตาม" (`cash_status_staging`) — เป็นงานเขียนข้อมูล แอปไม่ทำ
