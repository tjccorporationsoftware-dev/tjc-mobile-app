# Prompt: สร้างโมดูล "ระบบสารบรรณ (Correspondence)" บน tjc-mobile-app

> เอกสารนี้เป็น **prompt/spec ที่พร้อมส่งต่อให้ AI coding agent (เช่น Claude Code)** ใช้สร้างหน้าจอ React
> Native (Expo Router) ต่อจากระบบเว็บ PHP เดิม โดยวิเคราะห์จากไฟล์ต้นฉบับ 3 ไฟล์:
> `correspondence_book.php`, `dashboard_correspondence.php`, `api_mobile.php`

---

## 1. บริบทโปรเจกต์ (สำคัญ อ่านก่อนเริ่ม)

- โปรเจกต์ปลายทางคือ **`tjc-mobile-app`** (Expo Router, TypeScript)
- โครงสร้างหน้าจอทั้งหมดอยู่ที่ `app/(tabs)/*.tsx` — เป็นไฟล์ dashboard/report แยกตามบทบาท (role) เช่น
  `AdminDashboard.tsx`, `BossDashboard.tsx`, `Immigration_dashboard.tsx`, `Immigration_Report.tsx`,
  `ManagerSales.tsx`, `DriverTasks.tsx` ฯลฯ — **ให้ยึดรูปแบบ/สไตล์ไฟล์ที่มีอยู่แล้วเป็นต้นแบบ**
  โดยเฉพาะคู่ `Immigration_dashboard.tsx` + `Immigration_Report.tsx` เพราะมี pattern
  "list + dashboard สรุปสถิติ" ใกล้เคียงกับงานนี้ที่สุด
- Backend เดิมเป็น PHP ทำงานแบบ **single-file action router**: ทุก endpoint ยิงไปที่ไฟล์เดียว
  ผ่าน query param `?action=xxx` (ดูตัวอย่างจาก `api_mobile.php` ที่มี action กว่า 40 แบบอยู่แล้ว
  เช่น `login`, `get_history`, `get_map_data`, `get_driver_tasks` ฯลฯ)
- ระบบสารบรรณเว็บเดิมใช้คนละไฟล์ API คือ `api_correspondence.php` (ยังไม่ได้แนบมา) — งานนี้ต้อง
  **เพิ่ม action ใหม่เข้าไปใน `api_mobile.php`** (ไฟล์เดียวกับที่แอปมือถือเรียกอยู่แล้ว) แทนที่จะสร้างไฟล์ API แยก
  เพื่อให้แอปมือถือเรียก endpoint เดียวเหมือนฟีเจอร์อื่น ๆ ทั้งหมด
- Auth/permission ของแอปมือถือ อิงจาก action `login` ที่คืนค่า `allowed_pages` (array ของชื่อไฟล์หน้าจอที่
  role นั้นเข้าได้ หรือ `['ALL']` ถ้าเป็น admin) — หน้าจอใหม่ต้องถูกจดทะเบียนใน `master_pages` /
  `permissions` (ฝั่ง DB) ด้วยชื่อไฟล์ที่ตรงกับไฟล์ .tsx ที่จะสร้าง

---

## 2. วิเคราะห์ฟีเจอร์จากเว็บต้นฉบับ

### 2.1 `correspondence_book.php` — หน้า "บันทึกทะเบียนรับ-ส่ง"

หน้าจอเดียว มี 2 โหมดสลับกันด้วยแท็บ (ไม่ใช่คนละหน้า):

| ส่วน | รายละเอียด |
|---|---|
| แท็บบน | สลับ **ทะเบียนรับ (received)** / **ทะเบียนส่ง (sent)** — เปลี่ยนสี ธีม label และ placeholder ทั้งหมดตามชนิด |
| ฟอร์มบันทึก (ฝั่งซ้าย) | เลขทะเบียน, วันที่ (date picker, ค่าเริ่มต้น = วันนี้), ผู้ส่ง/ผู้เขียน (สลับ label+readonly ตามแท็บ), ผู้เขียน/ผู้รับผิดชอบภายใน (auto-fill = ชื่อผู้ใช้ login, readonly เมื่ออยู่โหมดรับ), เรื่อง/รายละเอียด (textarea auto-expand + autocomplete แบบ dropdown 2 โหมด: "คำของฉัน" กับ "คำทั้งหมดในระบบ" สลับได้), เลขที่อ้างอิง (ซ่อนอยู่ในโค้ดปัจจุบัน), หน่วยงาน/บริษัท (autocomplete จากตาราง companies พร้อมโลโก้), แนบไฟล์ (ซ่อนอยู่ในโค้ดปัจจุบัน — มี logic รองรับ multi-file แต่ UI ปิดไว้) |
| ตารางรายการ (ฝั่งขวา) | ค้นหาแบบ debounce (400ms), กรองตามวันที่เดียว (start=end=d), pagination ฝั่ง client (PAGE_SIZE=20, คำนวณจาก array ที่โหลดมาทั้งหมด), คอลัมน์: ลำดับ, วันที่, เลขทะเบียน, ผู้ส่ง/ผู้เขียน (label เปลี่ยนตามแท็บ), หน่วยงาน, เรื่อง, ปุ่มจัดการ |
| Modal รายละเอียด | เปิดเมื่อคลิกแถว → ดึงข้อมูลเดี่ยวจาก `get_single` แสดง: เลขทะเบียน, วันที่ (แปลง พ.ศ. +543), เรื่อง, จาก/ผู้เขียน, ผู้เขียน/ผู้ลงนาม (label สลับตามชนิด), หน่วยงาน, เลขที่อ้างอิง, ผู้บันทึก (เฉพาะ admin), แกลเลอรีไฟล์แนบ (รูปแสดง thumbnail, ไฟล์อื่นแสดงไอคอน + นามสกุล, คลิกเพื่อเปิดเต็ม) |
| บันทึก/แก้ไข | ส่งเป็น `FormData` (multipart เพราะรองรับไฟล์) ไป `action=save` (ชื่อ endpoint ฝั่งเว็บ ให้ตั้งชื่อใหม่ตอน map เป็น mobile) พร้อม `id` (ว่าง = สร้างใหม่, มีค่า = แก้ไข), `book_type`, `creator` |

**Field หลักของ record 1 รายการ (correspondence entry):**
```
id, reg_no, book_date (YYYY-MM-DD), book_type ('received' | 'sent'),
sender, internal_staff, subject, ref_no, company, creator,
files: [{ file_name }], receiver  // receiver ใช้เฉพาะฝั่ง dashboard (ดูข้อ 2.2)
```

### 2.2 `dashboard_correspondence.php` — หน้า "Dashboard สรุปงานสารบรรณ"

| ส่วน | รายละเอียด |
|---|---|
| Stat cards | 4 การ์ด: ทั้งหมด (total), รับ (received) พร้อม %, ส่ง (sent) พร้อม %, วันนี้ (today) — มี progress bar animate |
| Company filter | แถบการ์ดโลโก้บริษัท (เลื่อนแนวนอน) รวมการ์ด "ทั้งหมด" คลิกแล้ว filter ทันที |
| ตัวกรองเพิ่มเติม | วันที่, เลขทะเบียน, ผู้ส่ง, เลขอ้างอิง, เรื่อง (text inputs + ปุ่ม reset) |
| Status tabs | ทั้งหมด / รอรับทราบ (waiting) / รับแล้ว (done) — เฉพาะทะเบียนรับ / ทะเบียนส่ง (sent) — กรองฝั่ง client จากข้อมูลที่โหลดมา พร้อมตัวเลขนับในแต่ละแท็บ |
| ตาราง + pagination | คล้ายหน้าแรกแต่เพิ่มคอลัมน์สถานะการรับทราบ (badge "รับแล้วโดย X" หรือปุ่มยังไม่รับ) |
| Modal รายละเอียด + Acknowledge flow | นอกจากข้อมูลเหมือนหน้าแรก ยังมี: **ปุ่มกดรับทราบ** (`action=acknowledge`, บันทึกชื่อผู้ใช้ปัจจุบันเป็น `receiver`) เฉพาะทะเบียนรับที่ยังไม่มี `receiver`, ถ้ามี `receiver` แล้วจะโชว์ **ปุ่มยกเลิกรับ** (`action=cancel_acknowledge`, บังคับกรอกหมายเหตุ), และปุ่ม **ดูประวัติยกเลิกรับ** (`action=get_cancel_logs` → ตาราง วันเวลา/ผู้ยกเลิก/หมายเหตุ) |

**Field เพิ่มเติมเฉพาะ dashboard:**
```
receiver (ชื่อคนกดรับทราบ, ว่าง = ยังไม่รับ), book_date_thai (string วันที่ไทยที่ backend ฟอร์แมตมาแล้ว),
stats: { total, received, sent, today }
cancel log: { canceled_at, canceled_by, remark }
```

### 2.3 `api_mobile.php` — รูปแบบ backend ที่ต้องเลียนแบบ

- Router เดียว, entry ผ่าน `$action = $_GET['action']`, ตอบกลับเป็น JSON เสมอ (`Content-Type: application/json`)
- ฟังก์ชันช่วยที่มีอยู่แล้วและควร**นำมาใช้ซ้ำ**: `getInput()` (อ่าน JSON body หรือ `$_POST`), `uploadSingleFile()`,
  `uploadMultipleFiles()` (multi-image upload พร้อม rename กัน collision), `getJsonField()`
- Pattern การตอบกลับ: `{"status": "success", "data": [...]}` หรือ `{"status":"error","message":"..."}`
  (บาง endpoint เก่าใช้ `success: true/false` แทน `status` — ให้ยึด `status` เป็นหลักสำหรับ endpoint ใหม่
  เพื่อความสอดคล้องกับ 40+ action ที่มีอยู่แล้ว)
- รูปภาพที่ส่งกลับต้องแปลงเป็น URL เต็มก่อนส่งให้แอป (ดู helper `$formatImage` ใน action `get_delivery_detail`
  เป็นตัวอย่าง) — ให้ทำแบบเดียวกันกับไฟล์แนบสารบรรณ โดย base path คือ `uploads/docs/`
- Auth: ไม่มี session ฝั่ง mobile (ต่างจากเว็บที่ใช้ `$_SESSION`) → ทุก action ต้องรับ `fullname` และ/หรือ
  `role` มาจาก client เอง (ตามที่ `get_customers`, `get_bidding_teams` ทำอยู่แล้ว)

---

## 3. Endpoint ใหม่ที่ต้องเพิ่มใน `api_mobile.php`

ให้เพิ่ม action ต่อไปนี้ (ตั้งชื่อ prefix `correspondence_` ให้ชัดเจนไม่ชนของเดิม):

| Action | Method | Input หลัก | Output |
|---|---|---|---|
| `get_correspondence_list` | GET | `type` (received/sent), `search`, `start`, `end`, `fullname` | `{status, list:[...], subjects_my_history:[...], subjects_all_history:[...]}` |
| `get_correspondence_detail` | GET | `id` | `{status, result:{...รายละเอียดเต็ม + files[]}}` |
| `save_correspondence` | POST (multipart) | `id`(ว่าง=สร้างใหม่), `book_type`, `reg_no`, `book_date`, `sender`, `internal_staff`, `subject`, `ref_no`, `company`, `creator`, `old_attachments`, `attachments[]` (files) | `{status, message}` |
| `get_correspondence_dashboard` | GET | `role`, `date`, `reg_no`, `sender`, `ref_no`, `subject`, `company` | `{status, stats:{total,received,sent,today}, recent:[...]}` |
| `acknowledge_correspondence` | POST | `id`, `fullname` | `{status, message}` |
| `cancel_acknowledge_correspondence` | POST | `id`, `remark`, `fullname` | `{status, message}` |
| `get_correspondence_cancel_logs` | GET | `id` | `{status, logs:[{canceled_at, canceled_by, remark}]}` |
| `get_correspondence_companies` | GET | - | คืนรายชื่อ+โลโก้บริษัท (อาจ reuse `get_companies` เดิมถ้าโครงสร้างพอ) |

> หมายเหตุ: ชื่อ action ข้างต้นเป็นข้อเสนอ ให้ปรับตามธรรมเนียมการตั้งชื่อจริงของทีม แต่ **ต้องคง shape
> ของ input/output ให้ตรงกับที่ frontend เว็บเดิมส่ง/รับ** เพื่อให้ backend query เดิมทำงานได้โดยแก้น้อยที่สุด

---

## 4. สเปกหน้าจอ React Native ที่ต้องสร้าง

สร้าง 2 ไฟล์ใหม่ใน `app/(tabs)/` ตามธรรมเนียมโปรเจกต์:

### 4.1 `CorrespondenceBook.tsx` (จาก `correspondence_book.php`)

- แท็บสลับ รับ/ส่ง ด้านบน (ใช้สีธีมต่างกัน: เขียว teal = รับ, ส้ม amber = ส่ง ตามต้นฉบับ)
- ฟอร์มบันทึกเป็น **Bottom Sheet หรือ Modal แยกจากลิสต์** (บนมือถือไม่ควรวางฟอร์ม+ตารางคู่กันแบบเว็บ)
  เปิดด้วยปุ่ม floating action button "+"
- Input ที่ต้องมี: เลขทะเบียน (TextInput), วันที่ (date picker native), ผู้ส่ง/ผู้เขียน (label สลับตามแท็บ),
  ผู้รับผิดชอบภายใน (auto-fill จาก user login), เรื่อง (multiline TextInput + ปุ่มเปิด dropdown ประวัติคำเดิม
  2 โหมด "ของฉัน"/"ทั้งหมด"), หน่วยงาน/บริษัท (autocomplete list พร้อมโลโก้), แนบไฟล์ (ใช้
  `expo-image-picker` + `expo-document-picker`, รองรับหลายไฟล์, preview รูปก่อนอัปโหลด, ลบไฟล์เดิม/ใหม่แยกกัน)
- ลิสต์รายการ: `FlatList` พร้อม pull-to-refresh, search bar (debounce), filter วันที่, infinite scroll
  หรือ pagination ปุ่มถัดไป/ก่อนหน้า (เทียบเท่า `PAGE_SIZE=20` ของเว็บ)
- แตะแถว → เปิด modal รายละเอียด (เหมือนเว็บ) พร้อม gallery รูปแนบ (เปิดเต็มจอด้วย image viewer)
- Role/permission: เช็คจาก `allowed_pages` ที่ได้ตอน login (ควรมีชื่อ `CorrespondenceBook.tsx` อยู่ในรายการ
  หรือ `ALL`) — ถ้าไม่มีสิทธิ์ ไม่ต้องแสดงในเมนู

### 4.2 `CorrespondenceDashboard.tsx` (จาก `dashboard_correspondence.php`)

- 4 stat cards ด้านบน (ทั้งหมด/รับ/ส่ง/วันนี้) แบบ scroll แนวนอนหรือ grid 2x2 บนจอเล็ก
- แถบโลโก้บริษัทเลื่อนแนวนอนสำหรับ filter (horizontal `FlatList`)
- ช่องกรองเพิ่มเติม (พับ/ขยายได้เพื่อประหยัดพื้นที่จอ): วันที่, เลขทะเบียน, ผู้ส่ง, เลขอ้างอิง, เรื่อง + ปุ่ม reset
- Status tabs พร้อมตัวเลขนับ: ทั้งหมด / รอรับทราบ / รับแล้ว / ทะเบียนส่ง
- ลิสต์รายการพร้อม badge สถานะ (สีเขียว = รับแล้วโดยใคร, สีเหลือง/เทา = รอรับทราบ) — ให้ทำ badge เป็น component
  ใช้ซ้ำได้กับหน้า Book ด้วย
- Modal รายละเอียด: เหมือนหน้า Book + ส่วนพิเศษด้านล่าง:
  - ปุ่ม **"กดรับทราบ / รับหนังสือฉบับนี้"** (แสดงเมื่อ `book_type === 'received'` และยังไม่มี `receiver`) →
    ยืนยันด้วย native `Alert.alert` แบบ confirm ก่อนยิง `acknowledge_correspondence`
  - เมื่อรับแล้ว: แสดงชื่อผู้รับ + ปุ่ม **"ยกเลิกรับ"** → เปิด prompt ให้กรอกหมายเหตุ (บังคับกรอก) ก่อนยิง
    `cancel_acknowledge_correspondence`
  - ปุ่ม **"ประวัติยกเลิกรับหนังสือ"** → เปิด modal/list แสดง log การยกเลิกทั้งหมด (`get_correspondence_cancel_logs`)

### 4.3 Component ที่ควรแชร์ระหว่าง 2 หน้า

- `CorrespondenceStatusBadge` (แสดงสถานะรับทราบ)
- `CompanyAutocomplete` (dropdown บริษัท+โลโก้)
- `SubjectAutocomplete` (dropdown เรื่อง 2 โหมด ของฉัน/ทั้งหมด)
- `AttachmentPicker` + `AttachmentGallery` (เลือก/แสดง/เปิดไฟล์แนบ, แยก state ไฟล์เก่า vs ใหม่)
- ฟังก์ชัน util แปลงวันที่เป็น พ.ศ. (ค.ศ. + 543) ให้ตรงกับที่เว็บทำ

---

## 5. Checklist ก่อนเริ่มโค้ดจริง (ให้ AI agent ทำตามลำดับ)

1. อ่านโครงสร้างไฟล์ `app/(tabs)/Immigration_dashboard.tsx` และ `Immigration_Report.tsx` (หรือไฟล์คู่ที่ใกล้เคียงที่สุด)
   เพื่อดึง pattern จริง: การเรียก API, การจัดการ state, สไตล์ (ใช้ StyleSheet/NativeWind/อะไร), การจัดการ
   role-based navigation, base URL ของ backend อยู่ตรงไหน (constants/ หรือ .env)
2. ยืนยัน base URL / config การเชื่อมต่อ backend PHP ที่ใช้อยู่จริงในโปรเจกต์ (ดูโฟลเดอร์ `constants/`)
3. เพิ่ม action ใหม่ตามข้อ 3 ใน `api_mobile.php` (หรือไฟล์ backend คู่ขนานของทีม) — ทดสอบด้วย Postman/curl ก่อน
4. สร้าง `CorrespondenceBook.tsx` และ `CorrespondenceDashboard.tsx` ตามสเปกข้อ 4
5. เพิ่ม entry เมนู/route ทั้งสองหน้าในระบบ navigation ของแอป (เช่นเมนูของ role ที่เกี่ยวข้อง: admin,
   เลขานุการ, หรือ role ที่ตั้งไว้) และเพิ่มชื่อไฟล์ทั้งสองใน `master_pages`/`permissions` ฝั่ง DB
6. เพิ่ม `.gitignore`/`assets` สำหรับโฟลเดอร์ไฟล์แนบถ้าจำเป็น (ไม่ต้อง commit ไฟล์ uploads)

---

## 6. สิ่งที่ยังต้องถามทีม/ยืนยันก่อนเริ่ม (ไม่มีคำตอบในโค้ดที่ให้มา)

- ไฟล์ `api_correspondence.php` ตัวเต็ม (ยังไม่ได้แนบ) — เพื่อดู query DB จริงของ action `fetch`,
  `save`, `dashboard`, `acknowledge` ฯลฯ ก่อน port เข้า `api_mobile.php`
- Base URL / วิธีเก็บ config backend ในแอป (อยู่ใน `constants/` ไฟล์ไหน)
- Role ใดบ้างที่ควรเห็นเมนูสารบรรณนี้ (permission mapping)
- ต้องการฟีเจอร์แนบไฟล์ในมือถือจริงหรือไม่ (เว็บปิด UI ส่วนนี้ไว้ด้วย `display:none` ทั้งที่ logic ยังอยู่)