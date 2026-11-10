# สเปก API มือถือ — แผนชำระรายงวด / Dashboard แนชเก่า / บัญชีลูกหนี้ แนส

หน้าที่ 6–8 ของงาน "เพิ่มหน้าแดชบอร์ดในแอปมือถือ 8 หน้า" (หน้าที่ 1–5 อยู่ที่ [LG_Dashboard_API_Spec.md](LG_Dashboard_API_Spec.md))

**หลักการร่วมของทั้ง 3 ไฟล์**
- ไฟล์ใหม่ใน `tjc-api/mobile_api/modules/` ไม่แก้ไฟล์เดิมของเว็บ และไม่ CREATE/ALTER ตาราง
- อ่านอย่างเดียว ทุก action เป็น `GET` ส่ง `user_id` มาด้วยทุกครั้ง
- เช็คสิทธิ์ด้วย `mapi_can_see_page()` ต่อชื่อไฟล์หน้าเว็บ ถ้าไม่มีสิทธิ์จะตอบ `{status:"error", code:"no_permission"}`
- สูตร KPI ยกมาจากหน้าเว็บทุกบรรทัด (ในหัวไฟล์ PHP ระบุเลขบรรทัดต้นทางไว้) ตัวเลขจึงตรงกับเว็บ
- ปีชีทและปีงบในตารางเป็น พ.ศ. ฝั่ง API ส่งค่าดิบตามตาราง แอปแปลงเป็น ค.ศ. ตอนแสดงผล
- วันที่ส่งเป็น `YYYY-MM-DD` และวันเวลาเป็น `YYYY-MM-DD HH:MM:SS`

| หน้าเว็บ | ไฟล์ API | หน้าแอป | เมนู |
|---|---|---|---|
| `installment_plans.php` | `installment_API_mobile.php` | `app/(tabs)/installment_plans.tsx` | หมวดบัญชี-การเงิน › แผนชำระรายงวด |
| `wip_dashboard.php` | `wip_API_mobile.php` | `app/(tabs)/wip_dashboard.tsx` | หมวดบัญชี-การเงิน › Dashboard แนชเก่า |
| `nas_accounting_dashboard.php` | `nas_API_mobile.php` | `app/(tabs)/nas_accounting_dashboard.tsx` | หมวดบัญชี-การเงิน › บัญชีลูกหนี้ แนส |

---

## 6. installment_API_mobile.php — แผนชำระรายงวด

### `get_dashboard` (`user_id`)
ตาราง: `installment_plans` + subquery จาก `installment_plan_items` และ `installment_plan_followups` (SQL เดียวกับเว็บ)

| ฟิลด์ | ความหมาย |
|---|---|
| `kpi_all`, `kpi_by_company[]` | `total_budget, total_paid, total_net, total_outstanding, debtor_units, plans_with_income, items, paid_items, plan_count` โดย `kpi_by_company` มี `comp_key, name` เพิ่ม |
| `follow_status_options[]` | สถานะติดตามล่าสุดที่มีจริงในรายการ เริ่มด้วย `ยังไม่เคยติดตาม` |
| `list[]` | `id, site_no, unit_name, company_name_raw, comp_key, comp_name, debt_user, installment_label, budget, paid_amount, paid_net, outstanding, pay_state, item_count, paid_count, latest_follow_status, latest_follow_at, latest_payment_at, …` |

สูตร:
- `budget` = `total_budget` ถ้าไม่มีให้ใช้ผลรวมงวด
- `outstanding` = max(budget − ยอดจ่ายงวดที่ `is_paid=1`, 0)
- `pay_state` มี 3 ค่า:
  - `unpaid` ถ้ายอดจ่าย ≤ 0
  - `paid_full` ถ้ายอดจ่าย ≥ budget − 0.01
  - `paid_partial` กรณีอื่น
- จับคู่บริษัท: ตัดคำว่า บริษัท/จำกัด/ช่องว่าง ออก แล้วเทียบแบบ contains กับ `companies` ถ้าไม่พบใช้ `comp_key = "other"`

KPI ไม่เปลี่ยนตามตัวกรอง เหมือนเว็บ การ์ดแต่ละใบกรองสถานะได้:

| การ์ด | กรองเป็น | ความหมาย |
|---|---|---|
| หน่วยงานค้างชำระ / ค้างชำระตามแผน | `pending` | ยังไม่ `paid_full` |
| หน้างานที่เงินเข้าแล้ว / เงินเข้าทั้งหมด / ยอดรับสุทธิ | `has_income` | ไม่ใช่ `unpaid` |
| งวดจ่ายแล้ว/ทั้งหมด | `paid_full` | จ่ายครบ |

### `get_plan_items` (`user_id`, `plan_id`)
- `items[]`: `installment_no, payment_name, amount, net_amount, cumulative_paid, remaining, invoice_no, invoice_date, due_date, received_date, is_paid, remark`
- `followups[]`: `followup_name, call_status, bank_name, remark, created_by, created_at`

### `save_debt_owner` (POST: `user_id`, `plan_id`, `debt_user`) — action เขียนตัวเดียวของไฟล์นี้
- ทำเหมือน `save_debt_owner` ของเว็บ (installment_plans.php:82-118):
  - แผนต้องมีอยู่ ถ้าไม่มี ตอบ `not_found`
  - ชื่อต้องตรงกับ `TRIM(fullname)` ของผู้ใช้ ถ้าไม่ตรง ตอบ `invalid_user`
  - บันทึก `installment_plans.debt_user`
- รายชื่อให้เลือกส่งมาเป็น `debt_users` ใน `get_dashboard` (`SELECT DISTINCT TRIM(fullname) ...` แบบเว็บ)
- เว็บไม่ลงประวัติแก้ไขของแผน ไฟล์นี้จึงไม่ลงเหมือนกัน
- ตอบกลับ `{ plan_id, debt_name }`

---

## 7. wip_API_mobile.php — Dashboard แนชเก่า (wip_jobs)

### `get_dashboard` (`user_id`, `year?` = ปีชีท พ.ศ.)
ถ้าไม่ส่ง `year` หรือส่งปีที่ไม่มีข้อมูล API จะใช้ปีล่าสุด

| ฟิลด์ | ความหมาย |
|---|---|
| `years[]`, `year` | ปีชีทที่มีข้อมูล (มากไปน้อย) และปีที่ใช้จริง |
| `kpi` | `total, budget_sum, near_due, overdue, closed, closed_unpaid, paid, not_closed, near_warranty, warranty_expired` นับเฉพาะงานที่ไม่ยกเลิก |
| `companies[]` | `company` (ค่าดิบ), `name` (ชื่อจาก companies), `cnt`, `budget_sum` เติม TJC/ASCENT/TANGJAI/A.R.T. ที่ไม่มีงานเป็น 0 เหมือนเว็บ |
| `job_types[]`, `debt_present[]` | ตัวเลือกกรองประเภทงาน และผู้รับผิดชอบที่มีอยู่จริง |
| `list[]` | ทุกงานของปี (รวมงานยกเลิก) เรียงเลขหน้างานจากมากไปน้อย พร้อม `days_remaining, status_key (normal/warning/danger/''), warranty_text, warranty_end, warranty_days_left, near_warranty, warranty_expired, job_status, closed_at, debt_name, edit_count, last_editor, …` |

กติกา (เหมือนเว็บ):
- นับถอยหลังจาก `end_date` ถึงวันนี้ งานที่ปิดจบแล้วหรือยกเลิกไม่นับ
  - เหลือ ≤ `alert_days` (ค่าเริ่มต้น 30) เป็น `warning`
  - เลยกำหนดแล้วเป็น `danger`
- วันหมดประกัน = `start_date` + `warranty_value` (ปี/เดือน/วัน) คำนวณด้วย `DateTime::modify` แบบเดียวกับเว็บ
- "ยอดงบรวม" บนเว็บรวมตามแถวที่กรองอยู่ แอปจึงคำนวณค่านี้เอง ส่วน KPI ตัวอื่นคงที่

### `get_edit_history` (`user_id`, `id`)
- `logs[]`: `editor, edited_at`

### `save_debt_owner` (POST: `user_id`, `id`, `debt_user`) — action เขียนตัวเดียวของไฟล์นี้
- ทำเหมือน `wip_save_debt_owner` ของเว็บ: popup บนเว็บให้เลือกได้แค่ "บุคคล" จึงบันทึกเป็น `debt_type='บุคคล', debt_user=?, debt_team=NULL`
- `debt_user` ต้องอยู่ในรายชื่อ `debt_users` ที่ส่งมากับ `get_dashboard` (`SELECT fullname FROM users` แบบเดียวกับเว็บ) ถ้าไม่อยู่ ตอบ `invalid_user`
- ถ้าไม่พบงาน ตอบ `not_found` / ถ้าไม่มีสิทธิ์หน้า `wip_dashboard.php` ตอบ `no_permission` / ถ้าไม่ได้ส่งแบบ POST ถูกปฏิเสธ
- บันทึกแล้วเพิ่มแถวใน `wip_job_edit_logs` โดยใช้ชื่อผู้ใช้ (fullname) เป็น editor เหมือน `wip_logEdit()`
- ตอบกลับ `{ id, debt_type, debt_name, editor }`

### ปุ่มจัดการงาน (POST: `user_id`, `id`) — ตามคอลัมน์ "จัดการ" ของเว็บ ยกเว้นแก้ไข
| action | ต้นทางเว็บ | ทำอะไร | ใช้ได้เมื่อ |
|---|---|---|---|
| `close_job` | `wip_force_complete` (:202-233) | `status='ปิดจบหน้างาน'`, `closed_by`, `closed_at` + ลงประวัติแก้ไข + `wip_syncToNasProjects()` (สร้าง/อัปเดตแถวใน `nas_projects`) | ยังไม่ปิดจบและไม่ยกเลิก |
| `undo_close` | `wip_undo_complete` (:238-282) | กลับเป็น `สัญญาจ้าง` ล้าง `closed_*` + `wip_job_undo_logs` (ใน transaction) + ลงประวัติแก้ไข + `wip_maybeDeleteNasSync()` (ลบแถวที่ WIP สร้าง ถ้ายังไม่มีเงินเข้า) | ปิดจบแล้ว |
| `cancel_job` (+ `cancel_reason` บังคับ) | `wip_cancel_job` (:287-318) | `status='ยกเลิก'`, `cancel_reason`, `canceled_by` + ลงประวัติแก้ไข | ยังไม่ปิดจบและไม่ยกเลิก |

- ฟังก์ชัน sync ไปบัญชีลูกหนี้แนสเรียกตัวเดียวกับเว็บ (`require wip_nas_sync.php` โดยไม่แก้ไฟล์นั้น) ผลส่งกลับใน `nas_sync.message`
- ผู้ทำรายการคือ fullname ของ `user_id`
- เว็บซ่อนปุ่มตามสถานะ API ตรวจสถานะซ้ำอีกชั้น ถ้าไม่ตรงตอบ `invalid_state`
- ไม่มีในแอป: แก้ไขข้อมูลงาน (ตามที่ผู้ใช้สั่ง), นำเข้า/Export Excel, ปุ่ม "ลบ" หลายรายการ (เว็บระบุว่าไว้ใช้ช่วงทดสอบ และลบถาวรกู้คืนไม่ได้)

### `get_canceled_history` / `get_undo_history` (`user_id`, `year`)
- ปุ่มประวัติบนหัวตารางเว็บ ตามปีชีท
- `get_canceled_history` ส่ง `list[]` ฟิลด์ `id, site_no, project_name, company, budget, cancel_reason, canceled_by`
- `get_undo_history` ส่ง `list[]` ฟิลด์ `created_at, performed_by, site_no, company, project_name`

---

## 8. nas_API_mobile.php — บัญชีลูกหนี้ แนส

### `get_dashboard` (`user_id`, `year?` = ปีงบ พ.ศ.)

| ฟิลด์ | ความหมาย |
|---|---|
| `years[]`, `year` | ปีงบที่มี |
| `kpi_all`, `kpi_by_company[]` (4 บริษัท TJC/ART/TANGJAI/ASCENT) | `total_budget, total_received (ยอดจ่าย), total_net, total_outstanding, debtor_count, projects_with_income, paid_full_projects, project_count, wip_projects, wip_budget` |
| `follow_status_options[]`, `pay_status_options[]` | ชื่อสถานะกลุ่ม follow / payment จาก `payment_call_statuses` |
| `debt_present[]` | ผู้รับผิดชอบที่มีอยู่จริงในปีนั้น |
| `list[]` | `site_no, company_code, company_name, unit_name, project_name, budget, gross, net, outstanding, payment_state, follow_status, follow_closed, follow_at, pay_status, pay_at, remark, debt_name, closed_by, closed_at, …` |

กติกา (เหมือนเว็บ):
- `payment_state` = `paid_full` เมื่อมีงวดใดมีสถานะ "ปิดยอด" หรือยอดจ่าย ≥ งบ (และงบ > 0)
  - มียอดจ่ายแต่ยังไม่ถึงเกณฑ์นั้น เป็น `paid_partial`
  - ไม่มียอดจ่ายเลย เป็น `unpaid`
- สถานะมี 2 คอลัมน์ที่มาจากต่างแหล่ง:
  - สถานะติดตาม มาจาก `nas_followups` ครั้งล่าสุด
  - สถานะจ่ายเงิน มาจากงวดล่าสุดใน `nas_payments` ที่อยู่ในกลุ่ม payment
- ถ้าสถานะจ่ายเงินมีคำว่า "ปิดยอด" ระบบถือว่าปิดติดตามแล้ว (`follow_closed=true`)
- `wip_*` คืองาน `wip_jobs` ปีเดียวกันที่ยังไม่ปิดจบ (ไม่รวมงานยกเลิก)
- การกรองสถานะใช้ค่าชุดเดียวกับ `#stateSelect` ของเว็บ:
  - สถานะชำระ: `unpaid_any`, `has_income` (เงินเข้าครบ), `unpaid`, `paid_partial`
  - สถานะติดตาม: `fs:<ชื่อ>`, `fs:` (ยังไม่เคยติดตาม), `fs:__closed__` (ปิดติดตามแล้ว)
  - สถานะจ่ายเงิน: `cs:<ชื่อ>`, `cs:` (ยังไม่มีสถานะจ่ายเงิน)

ไฟล์นี้ไม่เรียก `ensure_*()` ของ `call_status_lib.php` เพราะฟังก์ชันพวกนั้น CREATE/ALTER ตาราง แต่จะอ่านคอลัมน์ `status_group` ตรงๆ แทน ถ้ายังไม่มีคอลัมน์นี้จะแบ่งกลุ่มด้วยคำ ("ปิดยอด/จ่ายเงิน/จ่ายครบ/จ่ายแล้ว" = payment) แบบเดียวกับเว็บ

### `save_debt_owner` (POST: `user_id`, `id`, `debt_user`) — action เขียนตัวเดียวของไฟล์นี้
- ให้ผลเหมือนตอนเว็บส่ง `fields {debt_type:'บุคคล', debt_user, debt_team:''}` เข้า `nas_update`
  - บันทึก `debt_team = ''` (ค่าว่าง ไม่ใช่ NULL) และอัปเดต `updated_at`
  - ลง `nas_project_logs` (action `update`, `changed_fields`) **เฉพาะเมื่อมีช่องเปลี่ยนจริง** โดยใช้ชื่อผู้ใช้ (fullname) เป็น `user_name`
- `debt_user` ต้องอยู่ใน `debt_users` ที่ส่งมากับ `get_dashboard` ถ้าไม่อยู่ ตอบ `invalid_user`
- ถ้าไม่พบโครงการ ตอบ `not_found` / ถ้าไม่มีสิทธิ์ ตอบ `no_permission` / ถ้าไม่ได้ส่งแบบ POST ถูกปฏิเสธ
- ตอบกลับ `{ id, debt_type, debt_name, changed[], editor }`

### `get_payment_items` (`user_id`, `id`)
- `items[]`: `payment_name, payment_amount, net_amount, fee_amount, fine_amount, wht_percent, receipt_no, receipt_date, payment_received_date, call_status, remark, created_by, created_at`
- `follows[]`: `followup_name, call_status, bank_name, remark, created_by, created_at`

---

## สิ่งที่ตั้งใจไม่ทำในแอป (ทำบนเว็บ)
- นำเข้า Excel / Export Excel
- แก้ไข / ลบ / ปิดจบ / ยกเลิกปิดจบ / ยกเลิกงาน
- ลงบัญชีรับชำระ / บันทึกติดตาม
- ตั้งค่าวันแจ้งเตือน
