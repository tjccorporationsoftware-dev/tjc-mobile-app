# ตารางงานขนส่ง (Fleet Schedule) — Spec สำหรับสร้างหน้าในแอป

อ้างอิงจากหน้าเว็บ `fm_jobs.php` + API `api_fm.php` เพื่อสร้างหน้าเดียวกันในแอป React Native (Expo)

- **Base URL:** `https://tjcgroup.tjc.co.th` (จาก `constants/config.ts` → `API_BASE`)
- **API:** ทุก endpoint ยิงไปที่ `${API_BASE}/api_fm.php`
- **รูปหลักฐาน:** เก็บที่ `uploads/proofs/<filename>` → เปิดด้วย `${IMG_BASE_URL}/proofs/<filename>`

---

## 1. ภาพรวมหน้าจอ

หน้าตาราง "คนขับ → รายการงาน" แบบ Accordion:

- แต่ละแถว = พนักงานขับรถ 1 คน (แสดงชื่อ + badge จำนวนงาน)
- กดแถวเพื่อกาง/หุบ (accordion) เห็นรายการงานของคนนั้น
- งานจัดกลุ่มด้วย "หัววันที่" (date separator) และเรียงเวลาใหม่→เก่า
- แต่ละงาน = การ์ด แสดง เวลา, สถานะ (สี), ลูกค้า, เบอร์โทร, ผู้ช่วย, ภารกิจ, ปลายทาง, ลิงก์ GPS
- มีปุ่มบนการ์ด: แก้ไข / ลบ / เปลี่ยนสถานะ (dropdown)
- Filter บนหัว: ค้นหา (ลูกค้า/ปลายทาง), วันที่, เลือกพนักงาน, เลือกสถานะ
- เลือกหลายงาน (checkbox) → "รวมบิล/เหมา" (group)

### สถานะงาน (status) + สี

| status        | ป้าย           | สี                      |
| ------------- | -------------- | ----------------------- |
| `pending`     | ⏳ รอดำเนินการ | ส้ม `#f59e0b`           |
| `in_progress` | 🚚 กำลังส่ง    | ฟ้า `#0ea5e9`/`#3b82f6` |
| `completed`   | ✅ เสร็จสิ้น   | เขียว `#10b981`         |
| `failed`      | ❌ ไม่สำเร็จ   | แดง `#ef4444`           |

---

## 2. โครงสร้างข้อมูล (จาก `fetch_schedule`)

`GET api_fm.php?action=fetch_schedule` → คืน:

```json
{
  "success": true,
  "drivers":  [ { "id", "name", "category", "priority", "default_vehicle_id" } ],
  "vehicles": [ { "id", "plate_number", "fleet_number" } ],
  "jobs":     [ { ...job fields... } ]
}
```

**drivers** — เรียงตาม `priority ASC` (ใช้ลำดับนี้เป็นลำดับแถว)
**vehicles** — มาจากตาราง `cars` (`plate` → `plate_number`, `car_number` → `fleet_number`)

**job fields (ตาราง `jobs`):**
| field | ความหมาย |
|---|---|
| `id` | รหัสงาน |
| `customer_name` | ชื่อลูกค้า / หน้างาน |
| `customer_phone`, `customer_phone2` | เบอร์ติดต่อ |
| `job_desc` | ภารกิจ / รายละเอียด |
| `origin`, `destination` | ต้นทาง / ปลายทาง |
| `gps_link` | ลิงก์ Google Maps |
| `driver_id`, `assistant_id` | คนขับ / ผู้ช่วย (อ้าง `drivers.id`) |
| `vehicle_id` | รถ (อ้าง `cars.id`) |
| `start_time` | `YYYY-MM-DD HH:MM:SS` |
| `end_time` | เวลาเสร็จ (ตอน complete) |
| `status` | pending/in_progress/completed/failed |
| `cost` | รายจ่าย (ค่ารถร่วม) |
| `proof_image` | ชื่อไฟล์รูปหลักฐาน |
| `group_id`, `group_name`, `group_price` | ถ้าถูกรวมบิล |

> **หมายเหตุ logic การจับคู่:** งานจะโผล่ในแถวของคนขับ ถ้า `job.driver_id == driver.id` **หรือ** `job.assistant_id == driver.id`

---

## 3. รายการ API Endpoints

ทุกอันเป็น `POST` แบบ `FormData` (ยกเว้น fetch ที่เป็น `GET`)

### อ่านข้อมูล

| action                   | method | params               | ผลลัพธ์                                                                                  |
| ------------------------ | ------ | -------------------- | ---------------------------------------------------------------------------------------- |
| `fetch_schedule`         | GET    | —                    | drivers, vehicles, jobs (ดูข้อ 2)                                                        |
| `fetch_provinces`        | GET    | —                    | `[{ name_th, region_name }]` — ไว้ทำ autocomplete ต้นทาง/ปลายทาง                         |
| `fetch_project_wip_info` | POST   | `year`, `job_number` | ดึงชื่อลูกค้า+เบอร์อัตโนมัติจากเลขหน้างาน → `{ success, customer, project_name, phone }` |

### เขียนงาน

| action          | method           | params                                                                                                                                                                                                                              |
| --------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `save_job`      | POST             | (มี `id` = แก้ไข, ไม่มี = เพิ่ม) `customer_name`_, `customer_phone`, `customer_phone2`, `job_desc`, `origin`, `destination`_, `gps_link`, `driver_id`_, `assistant_id`, `vehicle_id`, `start_time`_ (`YYYY-MM-DD HH:MM:SS`), `cost` |
| `delete_job`    | POST             | `id`                                                                                                                                                                                                                                |
| `update_status` | POST             | `id`, `status` (ถ้าไม่ใช่ completed จะล้าง end_time/proof)                                                                                                                                                                          |
| `complete_job`  | POST (multipart) | `id`, `end_time`, `proof_image` (ไฟล์รูป, optional)                                                                                                                                                                                 |

### รวมบิล / กลุ่มงาน

| action         | method | params                                                                           |
| -------------- | ------ | -------------------------------------------------------------------------------- |
| `create_group` | POST   | `group_name`, `total_price`, `type` (`cost`), `job_ids` (JSON array), `job_date` |
| `update_group` | POST   | `id`, `group_name`, `total_price`, `type`                                        |
| `delete_group` | POST   | `id` (แยกกลุ่ม+ลบ)                                                               |

### รถประจำ / ลำดับพนักงาน

| action                   | method | params                                               |
| ------------------------ | ------ | ---------------------------------------------------- |
| `update_default_vehicle` | POST   | `id` (driver), `vehicle_id`                          |
| `save_driver_order`      | POST   | `order_json` (JSON array ของ driver id ตามลำดับใหม่) |
| `update_driver_priority` | POST   | `id`, `priority`                                     |

_(`_` = required)\*

---

## 4. ฟอร์มเพิ่ม/แก้ไขงาน (Job Modal)

ฟิลด์ที่ต้องมีในฟอร์ม:

1. **ดึงข้อมูลอัตโนมัติ:** เลือกปี (พ.ศ.) + เลขหน้างาน (เช่น `001`) → กดปุ่ม → เรียก `fetch_project_wip_info` → เติม `customer_name` + `customer_phone` ให้
2. ลูกค้า / หน้างาน `customer_name` **(required)**
3. เบอร์โทร `customer_phone`, และเพิ่มเติม `customer_phone2`
4. ภารกิจ `job_desc`
5. ต้นทาง `origin` / ปลายทาง `destination`**(required)** — พร้อม autocomplete จังหวัด (จาก `fetch_provinces`, filter ด้วย `name_th`)
6. ลิงก์ GPS `gps_link`
7. วัน-เวลาเริ่ม `start_time` **(required)** — มีปุ่ม "เดี๋ยวนี้" set เป็นเวลาปัจจุบัน (โซนไทย, 24 ชม.)
8. รถที่ใช้ `vehicle_id` (dropdown จาก vehicles), ผู้ช่วย `assistant_id` (dropdown จาก drivers)
9. รายจ่าย `cost`

> คนขับ (`driver_id`) มาจากแถวที่กด "+ เพิ่มงาน" ไม่ต้องเลือกในฟอร์ม
> ตอนเลือกคนขับ ให้ auto-select รถประจำของคนนั้น (`driver.default_vehicle_id`)

---

## 5. Flow การใช้งานหลัก

1. โหลดหน้า → `fetch_schedule` + `fetch_provinces` → render ตาราง
2. แตะแถวคนขับ → กาง accordion เห็นงาน
3. แตะการ์ดงาน → ดูรายละเอียด / แก้ไข (`editJob`)
4. เปลี่ยน dropdown สถานะ → `update_status` (ถ้าเลือก completed ควรเปิด modal ขอ `end_time` + รูป แล้วยิง `complete_job`)
5. ปุ่มลบ → ยืนยัน → `delete_job`
6. เลือกหลายงาน (checkbox) → footer โผล่ → "รวมบิล" → `create_group`
7. หลังบันทึกทุกครั้ง → เรียก `fetch_schedule` ใหม่เพื่อ refresh

---

## 6. หมายเหตุสำหรับทำในแอป (React Native)

- ใช้ `axios` (มีอยู่แล้ว) — POST เป็น `FormData`; อัปโหลดรูปใช้ `expo-image-picker` แล้ว append `{ uri, name, type }`
- วันที่/เวลา: ใช้ `@react-native-community/datetimepicker` แทน flatpickr; ส่งรูปแบบ `YYYY-MM-DD HH:MM:SS`
- Accordion: ใช้ state `expandedDrivers: number[]`
- Autocomplete จังหวัด: filter `provinces` ด้วย `name_th.includes(text)` ในเครื่อง (ดึงมาครั้งเดียว)
- ลิงก์ GPS: เปิดด้วย `Linking.openURL` / โทรออกด้วย `tel:` จากเบอร์ลูกค้า
- ธีม dark/light: หน้าเว็บใช้ CSS variables — เทียบสีในตารางสถานะข้างบนได้เลย
