# คู่มือส่งต่องาน: เปิด API ฝั่งเว็บ (PHP) ให้แอปมือถือใช้

> เอกสารสั่งงาน / onboarding สำหรับผู้ที่มาทำต่อ
> อ่านให้จบก่อนเขียนโค้ดบรรทัดแรก — ใช้เวลาประมาณ 15 นาที
> อัปเดต: 21 สิงหาคม 2569

---

## 0. บริบท 3 นาที (ต้องเข้าใจก่อน)

- แอปมือถือ (`tjc-mobile-app`, React Native + Expo) เป็น **ลูกค้าบาง ๆ (thin client)** ของระบบเว็บ PHP เดิม
  → **ตรรกะธุรกิจ / การคำนวณ / สิทธิ์ อยู่ฝั่ง PHP ทั้งหมด** แอปแค่เอา JSON มาวาดหน้าจอ
- แอป **เรียกหน้า `.php` ของเว็บตรง ๆ ไม่ได้** เพราะหน้าเว็บคืน HTML และต้องมี session
  → งานของเราคือ **เพิ่ม `action` ใหม่เข้าไปในไฟล์ API ที่มีอยู่แล้ว** ไม่ใช่สร้างไฟล์ API ใหม่
- ไฟล์ API ทำงานแบบ **single-file action router** — ทุก endpoint ยิงไฟล์เดียวแล้วแยกด้วย `?action=xxx`

| ไฟล์ API | โมดูล |
|---|---|
| `api_mobile.php` | ตัวหลัก (~40 action): login, โปรไฟล์, รายงาน, ประวัติ, เมนู, แผนที่, งานคนขับ, งานเข้าเมือง |
| `api_tasks.php` | กระดานงานผู้บริหาร |
| `api_carboooking_mobile.php` | จองรถ |
| `api_fm.php` | งานขนส่ง |
| `api_correspondence.php` | สารบรรณ |

**ค่าเริ่มต้น: ถ้าไม่แน่ใจว่าจะเขียน action ใหม่ไว้ที่ไฟล์ไหน → `api_mobile.php`**

---

## 1. กฎเหล็ก 9 ข้อ (ผิดข้อใดข้อหนึ่ง = แอปพัง)

1. **คืน JSON เท่านั้น** — ไฟล์ API ต้องมี `header('Content-Type: application/json; charset=utf-8');` และ **ห้ามมี output อื่นหลุดออกไปก่อน JSON เด็ดขาด** (ไม่มี `echo`, `print_r`, `var_dump`, HTML, บรรทัดว่างหน้า `<?php`, ไม่มี BOM)
   → PHP warning/notice หลุดออกไปแม้บรรทัดเดียว axios ฝั่งแอปจะ parse ไม่ผ่านทันที
2. **ภาษาไทยต้องไม่เพี้ยน** — `json_encode($data, JSON_UNESCAPED_UNICODE)` + `$conn->set_charset('utf8mb4')`
3. **ไม่มี session** — API มือถือไม่มี `$_SESSION` ให้ใช้ **ห้ามพึ่ง `$_SESSION['user_id']` / `$_SESSION['fullname']`**
   → ให้รับ `user_id`, `username`, `role` มาเป็น parameter แทน
   *(ข้อยกเว้นเดียว: `api_correspondence.php` action `acknowledge` ที่ยังใช้ session อยู่ ห้ามไปรื้อ)*
4. **อ่านข้อมูล = GET, เขียนข้อมูล = POST** และ **ฝั่งแอปส่ง POST มาเป็น `FormData` (`multipart/form-data`)** → อ่านด้วย `$_POST` ปกติได้เลย ไม่ต้องอ่าน `php://input`
5. **รูปแบบ response คงที่** — สำเร็จ `{"status":"success", ...ข้อมูล}` / ล้มเหลว `{"status":"error","message":"..."}` และ **ต้อง `exit;` ท้ายทุก case**
6. **ต้อง prepared statement เสมอ** — ห้ามเอาค่าจาก `$_GET`/`$_POST` ไปต่อสตริงใน SQL
7. **วันที่ส่งเป็น string MySQL** `YYYY-MM-DD` หรือ `YYYY-MM-DD HH:MM:SS` (แอปแปลง พ.ศ. เอง) ถ้าจะช่วยแปลงไทยให้ ให้เพิ่มเป็น **คีย์ใหม่** เช่น `book_date_thai` ห้ามทับคีย์เดิม
8. **ไฟล์แนบ/รูป คืนแค่ชื่อไฟล์** เช่น `"abc.jpg"` ไม่ต้องคืน URL เต็ม (แอปเติม `IMG_BASE_URL` + โฟลเดอร์เอง เช่น `uploads/docs/`, `uploads/proofs/`, `uploads/profiles/`)
9. **`LIMIT` ทุก query ที่คืนเป็นรายการ** — จอมือถือไม่ได้ทำมาเพื่อรับ 10,000 แถว (ปกติใช้ 200 หรือแบ่งหน้า)

---

## 2. เทมเพลตโค้ด — คัดลอกไปใช้ได้เลย

### 2.1 action อ่านข้อมูล (GET)

```php
// ===== ดึงรายการ xxx สำหรับแอปมือถือ =====
case 'get_xxx_list':
    $user_id = $_GET['user_id'] ?? '';
    $role    = $_GET['role']    ?? '';
    $search  = trim($_GET['search'] ?? '');

    $sql = "SELECT id, doc_no, title, amount, status, created_at
            FROM your_table
            WHERE title LIKE ?
            ORDER BY created_at DESC
            LIMIT 200";
    $stmt = $conn->prepare($sql);
    $like = "%{$search}%";
    $stmt->bind_param("s", $like);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

    echo json_encode([
        "status" => "success",
        "list"   => $rows,
        "total"  => count($rows),
    ], JSON_UNESCAPED_UNICODE);
    exit;
```

### 2.2 action เขียนข้อมูล (POST FormData)

```php
case 'save_xxx':
    $user_id = $_POST['user_id'] ?? '';
    $title   = trim($_POST['title'] ?? '');

    if ($title === '') {
        echo json_encode(["status" => "error", "message" => "กรุณากรอกหัวข้อ"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $conn->prepare("INSERT INTO your_table (title, created_by, created_at) VALUES (?, ?, NOW())");
    $stmt->bind_param("ss", $title, $user_id);
    $ok = $stmt->execute();

    echo json_encode($ok
        ? ["status" => "success", "id" => $conn->insert_id]
        : ["status" => "error", "message" => "บันทึกไม่สำเร็จ"],
        JSON_UNESCAPED_UNICODE);
    exit;
```

### 2.3 ถ้าต้องคุมสิทธิ์ระดับปุ่ม (ไม่ใช่แค่ซ่อนทั้งหน้า)

ใช้ `hasActionForUser()` ใน `mobile_permissions.php` ที่มีอยู่แล้ว **และส่งผลสิทธิ์กลับไปพร้อมข้อมูลทุกครั้ง** อย่าไปยัดใส่ตอน login

```php
require_once 'mobile_permissions.php';

$can_edit = hasActionForUser($user_id, 'edit_xxx');

echo json_encode([
    "status"   => "success",
    "list"     => $rows,
    "can_edit" => $can_edit,          // แอปเอาไปซ่อน/โชว์ปุ่ม
], JSON_UNESCAPED_UNICODE);
exit;
```

และ **ต้องเช็คซ้ำตอนบันทึกด้วยเสมอ** (ห้ามเชื่อฝั่งแอป) ถ้าไม่ผ่านให้คืน

```php
echo json_encode(["status" => "error", "code" => "no_permission", "message" => "ไม่มีสิทธิ์"], JSON_UNESCAPED_UNICODE);
exit;
```

> เหตุผลที่ส่งสิทธิ์มากับข้อมูลทุกครั้ง แทนที่จะส่งตอน login: อธิบายไว้ใน [PLAN_book_for_others_mobile.md](PLAN_book_for_others_mobile.md) §5.4 — สรุปคือ `allowed_pages` ถูกเก็บลงเครื่องตอน login ครั้งเดียว ถ้าฝังสิทธิ์ไว้ตรงนั้น แอดมินแก้สิทธิ์แล้วผู้ใช้ต้อง logout-login ใหม่ถึงจะเห็นผล

---

## 3. เช็คลิสต์ต่อ 1 ฟีเจอร์ (ทำตามลำดับ ห้ามข้าม)

- [ ] **1. คุยให้ชัดก่อนเขียน** — จะเอาข้อมูลจากหน้าเว็บไหน (`ชื่อไฟล์.php`) ตารางอะไร คอลัมน์ไหนบ้างที่จอมือถือต้องใช้จริง
- [ ] **2. เขียน action ใน PHP** ตามเทมเพลต §2 — เอา query จากหน้าเว็บเดิมมาใช้ซ้ำ อย่าเขียน logic ใหม่
- [ ] **3. ทดสอบด้วยเบราว์เซอร์** เปิด `.../api_mobile.php?action=get_xxx_list&user_id=1` ต้องเห็น JSON ล้วน ๆ ไม่มี HTML/warning ปน และภาษาไทยอ่านออก
- [ ] **4. ลงทะเบียนหน้าในตารางสิทธิ์** — `INSERT` ชื่อไฟล์หน้าเว็บลง `master_pages` แล้วผูก role ใน `permissions`
      → ถ้าไม่ทำ **เมนูจะโผล่เฉพาะ admin** เพราะแอปเช็คสิทธิ์จากชื่อไฟล์ `.php` ที่ action `login` ส่งกลับมาใน `allowed_pages`
      → หลังแก้สิทธิ์ ผู้ใช้ที่ล็อกอินค้างอยู่ **ต้อง logout–login ใหม่** ถึงจะเห็น (ค่าถูกเก็บลงเครื่องตอน login)
- [ ] **5. ถ้าเป็นการ์ดในหน้า "ประวัติงาน" หรือ "ภาพรวมผู้บริหาร"** ต้องเพิ่มแถวเมนูใน DB ที่ `get_menus` / `get_manager_menus` อ่าน โดยใส่ `label`, `subLabel`, `icon` (ชื่อไอคอน FontAwesome5), `color`, `route` (พาธในแอป เช่น `/history/foo`) — การ์ดพวกนี้ไม่ได้ฮาร์ดโค้ดในแอป
- [ ] **6. ทดสอบจากมือถือจริง** ผ่าน [app/test-api.tsx](../app/test-api.tsx)
- [ ] **7. แจ้งพี่** พร้อมส่ง: ชื่อ action, URL ตัวอย่าง, และ **ตัวอย่าง JSON ที่คืนมาจริง** (คัดลอกมาแปะ) → พี่จะทำจอในแอปต่อ

---

## 4. ถือว่างานเสร็จเมื่อ (Definition of Done)

1. เปิด URL ใน **เบราว์เซอร์มือถือ** (ไม่ใช่แค่บนคอม) แล้วเห็น JSON ถูกต้อง
2. ยิงด้วย user ที่ **ไม่ใช่ admin** แล้วได้ข้อมูลถูกตามสิทธิ์ (ไม่ใช่ error, ไม่ใช่ว่างเปล่า)
3. ยิงโดย **ไม่ส่ง parameter** เลย → ต้องได้ `{"status":"error",...}` สวย ๆ ไม่ใช่ PHP Fatal Error
4. ภาษาไทยไม่เพี้ยน ไม่เป็น `?????` และไม่เป็น `กา`
5. หน้าเว็บเดิมยังใช้งานได้ปกติทุกอย่าง (ไม่ไปแก้ของเดิมจนพัง)
6. ส่งตัวอย่าง JSON จริงให้พี่แล้ว

---

## 5. วิธีทดสอบ

```bash
# อ่านข้อมูล
curl "http://<host>/tjc-api/api_mobile.php?action=get_xxx_list&user_id=1&role=staff"

# เขียนข้อมูล (จำลอง FormData แบบที่แอปส่ง)
curl -F "action=save_xxx" -F "user_id=1" -F "title=ทดสอบ" \
     "http://<host>/tjc-api/api_mobile.php"
```

ดูว่าผลลัพธ์ **ขึ้นต้นด้วย `{` และจบด้วย `}` เท่านั้น** ถ้ามีอะไรโผล่มาก่อน `{` คือมี output รั่ว ให้ไล่หาว่ามาจากไหน

ทดสอบจากแอป: เปิดจอ [app/test-api.tsx](../app/test-api.tsx) มีปุ่มยิง API ให้อยู่แล้ว
**หมายเหตุ:** `API_BASE` ใน [constants/config.ts](../constants/config.ts) ต้องเป็น IP/โดเมนที่ **เครื่องมือถือ** เข้าถึงได้ (ห้ามใช้ `localhost` และต้องอยู่วง Wi-Fi เดียวกันถ้าเป็น IP ภายใน)

---

## 6. ห้ามทำ (ถามพี่ก่อน)

- ❌ **ห้ามสร้างไฟล์ `api_*.php` ใหม่** — ให้เพิ่ม `action` ในไฟล์เดิม
- ❌ **ห้ามแก้ action ที่มีอยู่แล้ว** โดยเฉพาะ `login`, `get_menus`, `get_history` — แอปที่ผู้ใช้ติดตั้งไปแล้วพึ่งพารูปร่าง JSON เดิมอยู่ ถ้าจะเพิ่มข้อมูล ให้ **เพิ่มคีย์ใหม่** อย่าเปลี่ยนชื่อ/ลบคีย์เดิม
- ❌ **ห้ามเปลี่ยนชื่อคีย์ใน response** ที่แอปใช้อยู่ (เช่น `status`, `fullname`, `allowed_pages`)
- ❌ **ห้ามแก้โครงสร้างตารางเดิม / ลบคอลัมน์** — ถ้าจำเป็นให้แจ้งก่อน
- ❌ **ห้ามแตะโค้ดในโปรเจกต์แอป** (`tjc-mobile-app`) — งานนี้ทำเฉพาะฝั่ง PHP ยกเว้นทดสอบผ่าน `test-api.tsx`
- ❌ **ห้ามใส่ IP/รหัสผ่าน DB ลง git**

---

## 7. อ่านเพิ่มถ้าจะทำโมดูลเหล่านี้

สเปกเก่าที่เขียนไว้ละเอียดมาก (โครงสร้างตาราง + ทุก action + params + response) — **อ่านก่อนแตะโมดูลนั้น**

| โมดูล | เอกสาร |
|---|---|
| สารบรรณ / ทะเบียนหนังสือ | [Correspondence_Spec.md](Correspondence_Spec.md) |
| ตารางงานขนส่ง | [FleetSchedule_Spec.md](FleetSchedule_Spec.md) |
| จองรถ + สิทธิ์จองแทนคนอื่น | [PLAN_book_for_others_mobile.md](PLAN_book_for_others_mobile.md) |

ใช้ 3 ไฟล์นี้เป็น **ตัวอย่างว่า "งานที่ทำเสร็จดี" หน้าตาเป็นยังไง** ถ้าทำโมดูลใหม่ ให้เขียนสเปกสั้น ๆ แบบเดียวกันไว้ใน `docs/` ด้วย

---

## 8. งานแรกที่ได้รับมอบหมาย

> พี่กรอกช่องนี้ก่อนส่งเอกสารให้น้อง

- **หน้าเว็บต้นทาง:** `__________.php`
- **ตาราง/ข้อมูลที่ต้องดึง:** ______________________
- **ชื่อ action ที่จะสร้าง:** `get___________`
- **ไฟล์ที่ต้องแก้:** `api_mobile.php`
- **ตัวอย่างที่ให้ดูเป็นแบบ:** action `______` ในไฟล์เดียวกัน (ก๊อปโครงมาแก้ได้เลย)
- **กำหนดส่ง:** ______________
