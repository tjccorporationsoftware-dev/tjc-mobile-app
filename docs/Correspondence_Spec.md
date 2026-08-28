# ระบบสารบรรณ / ทะเบียนหนังสือ (Correspondence) — Spec สำหรับสร้างหน้าในแอป

อ้างอิงจากหน้าเว็บ 2 หน้า + API 1 ตัว เพื่อสร้างในแอป React Native (Expo)

- **หน้าเว็บต้นฉบับ:** `correspondence_book.php` (สมุดทะเบียน/บันทึก) + `dashboard_correspondence.php` (แดชบอร์ด/ลงรับ)
- **Backend เดียว:** ทุก endpoint ยิงไปที่ `${API_BASE}/api_correspondence.php`
- **Base URL:** `https://tjcgroup.tjc.co.th` (จาก `constants/config.ts`)
- **ไฟล์แนบ:** เก็บที่ `uploads/docs/<file_name>` → เปิดด้วย `${IMG_BASE_URL}/docs/<file_name>`

> แนะนำแยกเป็น 2 จอ: **จอแดชบอร์ด/ลงรับ** และ **จอบันทึกทะเบียน** (หรือรวมเป็นแท็บเดียวก็ได้)

---

## 1. แนวคิดหลัก

ระบบทะเบียนหนังสือเข้า-ออก แบ่งเป็น 2 ประเภท (`book_type`):

- **`received`** = ทะเบียนรับ (หนังสือเข้าจากภายนอก)
- **`sent`** = ทะเบียนส่ง (หนังสือออก)

หนังสือ "รับ" มีขั้นตอน **ลงรับ (acknowledge)** — พนักงานกดลงรับเพื่อบันทึกว่าใครเป็นผู้รับเรื่อง

---

## 2. โครงสร้างข้อมูล (ตาราง)

### ตาราง `correspondence` (ตัวหลัก)

| field            | ความหมาย                                   |
| ---------------- | ------------------------------------------ |
| `id`             | รหัส                                       |
| `book_type`      | `received` / `sent`                        |
| `reg_no`         | เลขทะเบียน                                 |
| `book_date`      | วันที่ลงทะเบียน (`YYYY-MM-DD`)             |
| `ref_no`         | ที่หนังสือ (อ้างอิง, ซ่อนใน UI ปัจจุบัน)   |
| `doc_date`       | วันที่ของเอกสาร (`YYYY-MM-DD`, optional)   |
| `sender`         | ผู้ส่ง (ความหมายเปลี่ยนตาม type — ดูข้อ 5) |
| `company`        | หน่วยงาน / บริษัท                          |
| `internal_staff` | เจ้าหน้าที่ภายใน (ความหมายเปลี่ยนตาม type) |
| `subject`        | เรื่อง / รายละเอียด **(required)**         |
| `note`           | หมายเหตุ                                   |
| `creator`        | ผู้สร้างรายการ                             |
| `receiver`       | ผู้ลงรับ (ว่าง = ยังไม่ลงรับ)              |
| `received_at`    | เวลาลงรับ (`YYYY-MM-DD HH:MM:SS`)          |

API เพิ่มให้ตอนส่งกลับ: `book_date_thai`, `doc_date_thai` (รูปแบบ `d/m/พ.ศ.`), `file_count`

### ตาราง `correspondence_files`

`id`, `correspondence_id`, `file_name` — ไฟล์อยู่ที่ `uploads/docs/<file_name>`

### ตาราง `correspondence_cancel_logs` (ประวัติยกเลิกการลงรับ)

`id`, `correspondence_id`, `canceled_by`, `remark`, `canceled_at`

---

## 3. API Endpoints (`api_correspondence.php`)

`action` ส่งผ่าน GET หรือ POST (`$_POST['action'] ?? $_GET['action']`). เขียนข้อมูลใช้ POST FormData

### อ่านข้อมูล (GET)

| action            | params                                                                   | ผลลัพธ์                                                     |
| ----------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `dashboard`       | filter (optional): `date`,`reg_no`,`sender`,`company`,`ref_no`,`subject` | `{ stats, monthly, companies, recent[] }`                   |
| `fetch`           | `type` (received/sent), `search`, `start` (=วันที่), `user`              | `{ list[], subjects_my_history[], subjects_all_history[] }` |
| `get_single`      | `id`                                                                     | `{ status, result: {...+ files[]} }`                        |
| `get_cancel_logs` | `id`                                                                     | `{ status, logs[] }`                                        |
| `get_companies`   | —                                                                        | `[{ name, logo }]` (เรียงตามลำดับพิเศษ)                     |
| `get_notify`      | —                                                                        | `{ status, count }` จำนวนหนังสือรับที่ยังไม่ลงรับ           |

**`dashboard.stats`** = `{ total, received, sent, today }`
**`dashboard.monthly`** = `{ "YYYY-MM": { received: n, sent: n } }` (ย้อนหลัง 6 เดือน) → ทำกราฟ
**`dashboard.companies`** = `[{ company, count }]` (Top 5)
**`dashboard.recent`** = รายการหนังสือทั้งหมด (ตามฟิลเตอร์) เรียงใหม่→เก่า

### เขียนข้อมูล (POST FormData)

| action               | params                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `save`               | (มี `id` = แก้ไข) `book_type`_, `reg_no`, `book_date`_, `ref_no`, `doc_date`, `sender`, `company`, `internal_staff`, `subject`\*, `note`, `creator`, `attachments[]` (ไฟล์), `old_attachments` (ชื่อไฟล์เดิมที่เก็บไว้ คั่นด้วย `,`) |
| `acknowledge`        | `id` → ตั้ง `receiver` = ชื่อ user ปัจจุบัน (จาก session), `received_at` = now                                                                                                                                                       |
| `cancel_acknowledge` | `id`, `remark`\* → ล้าง receiver + บันทึก log                                                                                                                                                                                        |
| `delete`             | `id` → ลบรายการ + ไฟล์แนบทั้งหมด                                                                                                                                                                                                     |

> `receiver` มาจาก **session ฝั่ง server** (`$_SESSION['fullname']`) ไม่ได้ส่งจาก client — ในแอปต้องยิงด้วย session/cookie เดียวกับที่ล็อกอิน (axios `withCredentials`)

---

## 4. หน้าจอ A — แดชบอร์ด + ลงรับ (`dashboard_correspondence.php`)

1. **การ์ดสถิติ 4 ใบ:** ทั้งหมด (`total`), ทะเบียนรับ (`received`), ทะเบียนส่ง (`sent`), วันนี้ (`today`) — พร้อม % และ progress bar
2. **กราฟรายเดือน** จาก `monthly` (เข้า vs ออก 6 เดือน)
3. **Top บริษัท** จาก `companies`
4. **ตารางรายการ** จาก `recent[]` มี **แท็บกรอง** (นับจำนวนในแต่ละแท็บเอง client-side):
   - **ทั้งหมด** (`tabCountAll`)
   - **รอลงรับ** (`waiting`): `book_type==='received' && !receiver`
   - **ลงรับแล้ว** (`done`): `book_type==='received' && receiver`
   - **ทะเบียนส่ง** (`sent`): `book_type==='sent'`
5. **แต่ละแถว:**
   - ทะเบียนรับที่ยังไม่ลงรับ → badge "รอการรับ" + ปุ่ม **ลงรับ** → `acknowledge`
   - ลงรับแล้ว → แสดงชื่อผู้รับ + ปุ่ม **ยกเลิกการลงรับ** (ต้องกรอก remark) → `cancel_acknowledge`
   - กดดูรายละเอียด → `get_single` (โชว์ไฟล์แนบ)
   - ดูประวัติยกเลิก → `get_cancel_logs`

---

## 5. หน้าจอ B — บันทึกทะเบียน (`correspondence_book.php`)

**แท็บสลับประเภท:** ทะเบียนรับ (`received`) / ทะเบียนส่ง (`sent`) → เปลี่ยน `book_type` + เปลี่ยน label ของฟอร์ม

### ฟิลด์ฟอร์ม (`save`)

| ฟิลด์            | received                                             | sent                                 |
| ---------------- | ---------------------------------------------------- | ------------------------------------ |
| `reg_no`         | เลขทะเบียน                                           | เลขทะเบียน                           |
| `book_date` \*   | วันที่                                               | วันที่                               |
| `sender`         | **จาก (ผู้ส่งภายนอก)**                               | **ผู้เขียน / เจ้าของเรื่อง (ภายใน)** |
| `internal_staff` | **ผู้เขียน / ผู้รับผิดชอบ (ภายใน)**                  | **ชื่อผู้รับ / หน่วยงาน \***         |
| `subject` \*     | เรื่อง / รายละเอียด                                  | เรื่อง / รายละเอียด                  |
| `company`        | หน่วยงาน / บริษัท (autocomplete จาก `get_companies`) | เหมือนกัน                            |
| `attachments[]`  | แนบไฟล์ (รูป/PDF, ปัจจุบันซ่อนใน UI web)             | เหมือนกัน                            |

> `subject` มี autocomplete จากประวัติ (`subjects_my_history` / `subjects_all_history`)
> `creator` และ `internal_staff` เริ่มต้น = ชื่อ user ที่ล็อกอิน

### รายการด้านขวา

- แสดง `list[]` จาก `action=fetch&type=<received|sent>` — ค้นหา (`search`), กรองวันที่ (`start`)
- กดแถว → เปิดแก้ไข (`get_single`) / ลบ (`delete`)

---

## 6. หมายเหตุการทำในแอป (React Native)

- **สำคัญ — session:** `acknowledge`/`cancel_acknowledge` ผูกกับ user จาก session ฝั่ง server → axios ต้องส่ง cookie session (ตั้ง `withCredentials: true` และใช้ instance เดียวกับที่ล็อกอิน) ไม่งั้น `receiver` จะเป็น "System"
- POST ทุกอันเป็น `FormData`; อัปโหลดไฟล์ append `attachments[]` เป็น `{ uri, name, type }` (`expo-document-picker` / `expo-image-picker`)
- วันที่ส่ง `YYYY-MM-DD`; ใช้ `book_date_thai` / `doc_date_thai` ที่ API แปลงมาให้แสดงผลได้เลย
- แท็บ waiting/done/sent กรองใน client จาก `recent[]` (ตามเงื่อนไข `book_type` + `receiver`)
- ไฟล์แนบเปิดด้วย `Linking.openURL(`${IMG_BASE_URL}/docs/${file_name}`)`
- badge จำนวนแจ้งเตือน (หนังสือรับที่ยังไม่ลงรับ) ใช้ `action=get_notify`
