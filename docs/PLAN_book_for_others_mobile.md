# แผนงาน: เพิ่มฟีเจอร์ "จองให้ตัวเอง + คนอื่น" ในแอปมือถือ (ให้เท่าเว็บ)

> เอกสารเตรียมการ (Spec / Handoff)
> จัดทำจากการอ่านไฟล์จริง 12 ไฟล์ (เว็บ 5 + แอป 3 + สิทธิ์/auth 4)
> อัปเดต: 30 กรกฎาคม 2569
>
> ## ✅ สถานะ: ลงมือแล้วครบทั้ง 12 ขั้น (30 ก.ค. 2569)
>
> ไฟล์ที่แก้จริง:
>
> | ไฟล์ | สถานะ |
> |---|---|
> | `mobile_permissions.php` | 🆕 สร้างใหม่ — `hasActionForUser()` / `getUserActionInfo()` |
> | `api_carboooking_mobile.php` | แก้: `get_booking_data`, `book_car` (โหมด group), `return_car`, `get_car_dashboard_data` |
> | `CarManager.php` | แก้: `getCarSchedules()` เพิ่ม `user_id` / `booked_by` / `booker_name` (เพิ่ม key เท่านั้น) |
> | `app/(tabs)/CarBooking.tsx` | แก้หนัก: toggle โหมด, multi-select, ฟอร์มรายคัน, Modal เลือกผู้ใช้รถ, `submitGroupBooking`, badge, `cleanNoteText` |
> | `app/(tabs)/CarDashboard.tsx` | แก้: ป้าย "ผู้ใช้รถ" + badge "จองแทนโดย", `cleanNoteText` |
>
> **ไม่ต้อง migrate DB** — ยืนยันแล้วว่า `master_actions.action_code = 'book_for_others'`
> มีอยู่จริง (id 39, ผูกกับ `CarBooking.php`) และ `car_bookings.booked_by` มีอยู่แล้ว
>
> **ผลทดสอบสิทธิ์ (§12.1) ผ่านครบ:** admin / role_actions / user_actions /
> ไม่มีสิทธิ์ / `user_denied_actions` ทับ role / ยิง API ตรงด้วย user ที่ถูกปิดสิทธิ์ → `no_permission`
> แก้สิทธิ์แล้วเห็นผลทันทีโดยไม่ต้องล็อกอินใหม่ (สิทธิ์คำนวณใหม่ทุก request)
>
> **หมายเหตุ:** §13.1 (API มือถือไม่มี token/auth) **ยังคงค้างอยู่** — เป็นงานแยกที่ต้องทำต่อ

---

## สารบัญ

1. [ขอบเขตงาน](#1-ขอบเขตงาน)
2. [ไฟล์ที่เกี่ยวข้องทั้งหมด](#2-ไฟล์ที่เกี่ยวข้องทั้งหมด)
3. [โครงสร้างฐานข้อมูลที่เกี่ยวข้อง](#3-โครงสร้างฐานข้อมูลที่เกี่ยวข้อง)
4. [ฟีเจอร์ในเว็บทำงานอย่างไร (ต้นแบบ)](#4-ฟีเจอร์ในเว็บทำงานอย่างไร-ต้นแบบ)
5. [ระบบสิทธิ์: เว็บ vs แอป](#5-ระบบสิทธิ์-เว็บ-vs-แอป)
6. [สถานะปัจจุบันฝั่งแอป + ตารางช่องว่าง (Gap Analysis)](#6-สถานะปัจจุบันฝั่งแอป--ตารางช่องว่าง-gap-analysis)
7. [แผนแก้ไข ส่วนที่ 1: ฐานข้อมูล (Prerequisite)](#7-แผนแก้ไข-ส่วนที่-1-ฐานข้อมูล-prerequisite)
8. [แผนแก้ไข ส่วนที่ 2: API (api_carboooking_mobile.php)](#8-แผนแก้ไข-ส่วนที่-2-api-api_carboooking_mobilephp)
9. [แผนแก้ไข ส่วนที่ 3: CarBooking.tsx](#9-แผนแก้ไข-ส่วนที่-3-carbookingtsx)
10. [แผนแก้ไข ส่วนที่ 4: CarDashboard.tsx](#10-แผนแก้ไข-ส่วนที่-4-cardashboardtsx)
11. [ลำดับการลงมือ (Implementation Order)](#11-ลำดับการลงมือ-implementation-order)
12. [Checklist การทดสอบ](#12-checklist-การทดสอบ)
13. [ความเสี่ยงและข้อควรระวัง](#13-ความเสี่ยงและข้อควรระวัง)
14. [ประเด็นที่ต้องตัดสินใจ (รอคำตอบ)](#14-ประเด็นที่ต้องตัดสินใจ-รอคำตอบ)
15. [ภาคผนวก: อ้างอิงโค้ดสำคัญ](#15-ภาคผนวก-อ้างอิงโค้ดสำคัญ)

---

## 1. ขอบเขตงาน

### เป้าหมาย

ยกฟีเจอร์ **"จองให้ตัวเอง + คนอื่น"** (group booking / จองแทน) ที่มีอยู่ในเว็บ `CarBooking.php`
ไปไว้ในแอปมือถือ `CarBooking.tsx` โดย**ต้องเคารพสิทธิ์การมองเห็นเหมือนเว็บ** คือแสดงปุ่ม/โหมดนี้
เฉพาะผู้ที่มี action `book_for_others` เท่านั้น

### อยู่ในขอบเขต (In Scope)

| # | รายการ |
|---|---|
| 1 | เพิ่มโหมดจองแบบกลุ่ม (หลายคัน / ระบุผู้ใช้รถแยกคัน) ในแอป |
| 2 | ระบบสิทธิ์ระดับ action สำหรับแอป (ปัจจุบันแอปมีแค่ระดับหน้า) |
| 3 | ตรวจสิทธิ์ซ้ำฝั่งเซิร์ฟเวอร์ (ไม่ใช่แค่ซ่อนปุ่ม) |
| 4 | ส่ง `booked_by` ให้ถูกต้องเพื่อบันทึกว่า "ใครจองแทน" |
| 5 | แสดง badge "คุณจองให้: X" / "จองให้คุณโดย: Y" ในการ์ดรายการจอง |
| 6 | แสดง "ผู้ใช้รถ" แยกจาก "ผู้จองแทน" ใน CarDashboard |

### ไม่อยู่ในขอบเขต (Out of Scope — แต่บันทึกไว้)

- แก้ SQL injection ที่ค้างอยู่ในไฟล์เดิม (ดู §13)
- ทำระบบ token/auth จริงให้ API มือถือ (ดู §13.1)
- แก้ `allowed_pages` ให้รวม `user_permissions` / `user_denied_pages` (คนละเรื่องกับงานนี้ แต่มี bug อยู่)

---

## 2. ไฟล์ที่เกี่ยวข้องทั้งหมด

### ฝั่งเว็บ (ต้นแบบ — ไม่ต้องแก้)

| ไฟล์ | บทบาท |
|---|---|
| `CarBooking.php` | หน้าจองรถ มีโหมด `self` / `group` — **ต้นแบบหลักของงานนี้** |
| `CarManager.php` | คลาสแกนกลาง ใช้ร่วมกับแอป — `createBooking()` รองรับ `booked_by` อยู่แล้ว |
| `CarDashboard.php` | แดชบอร์ดเว็บ (อ้างอิงการแสดงผล) |
| `CarHistory.php` | ประวัติรายบุคคล (ไม่กระทบงานนี้) |
| `CashFlow.php` | ไม่เกี่ยวกับงานนี้ |
| `auth.php` | นิยาม `hasAction()` — **ต้นแบบ logic สิทธิ์** |
| `ManagePermissions.php` | หน้าจัดการสิทธิ์ของแอดมิน — บอกโครงสร้างตารางสิทธิ์ทั้งหมด |

### ฝั่งแอป (ต้องแก้)

| ไฟล์ | ต้องแก้? | บทบาท |
|---|:---:|---|
| `api_carboooking_mobile.php` | ✅ **แก้หนัก** | API เดียวของระบบรถในแอป แยกงานด้วย `action` |
| `app/(tabs)/CarBooking.tsx` | ✅ **แก้หนัก** | หน้าจองรถในแอป |
| `app/(tabs)/CarDashboard.tsx` | ✅ แก้เล็กน้อย | แดชบอร์ดในแอป |
| `app/_layout.tsx` | ❌ **ไม่แก้** | AuthContext (เหตุผลใน §5.4) |
| `app/(tabs)/_layout.tsx` | ❌ ไม่แก้ | Drawer + `canAccess()` ระดับหน้า |
| `api_mobile.php` | ❌ ไม่แก้ | API หลัก (มี `login`, `get_menus` เป็นตัวอย่างแพตเทิร์นสิทธิ์) |
| `CarManager.php` | ❌ **ไม่แก้** | รองรับ `booked_by` ครบแล้ว — ข้อดีใหญ่ของงานนี้ |

---

## 3. โครงสร้างฐานข้อมูลที่เกี่ยวข้อง

### 3.1 ตารางระบบสิทธิ์

```
master_pages          (id, file_name, group_id, sort_order, tab_group_idx)
master_actions        (id, page_id, action_code, action_name)
master_roles          (id, role_name)

permissions           (role_name, page_id)          -- role → หน้า
role_actions          (role_name, action_code)      -- role → ปุ่ม/ฟีเจอร์

user_permissions      (user_id, page_id)            -- เพิ่มหน้าให้รายบุคคล
user_actions          (user_id, action_code)        -- เพิ่มปุ่มให้รายบุคคล
user_denied_pages     (user_id, page_id)            -- ปิดหน้ารายบุคคล (ทับ role)
user_denied_actions   (user_id, action_code)        -- ปิดปุ่มรายบุคคล (ทับ role)
```

### 3.2 ตารางข้อมูลรถ (ส่วนที่เกี่ยวข้อง)

```
users          (id, username, fullname, role, phone, avatar, password, ...)
cars           (id, name, plate, type, car_image, car_number, keeper_id, status)
car_bookings   (id, user_id, booked_by, car_id, start_date, end_date,
                destination, reason, passenger_count, status,
                return_note, actual_return_time, created_at)
maintenance_logs (id, vehicle_id, user_id, reporter_name, repair_date,
                  service_center, cost, status, ...)
```

**สำคัญ — ความหมายของ 2 คอลัมน์นี้ (นิยามจาก comment ใน `CarManager.php` บรรทัด 17):**

| คอลัมน์ | ความหมาย |
|---|---|
| `user_id` | **ผู้ใช้รถจริง** (คนขับ / คนที่ไปทำภารกิจ) |
| `booked_by` | **คนที่กดจอง** — `NULL` ถ้าจองให้ตัวเองผ่านโหมดปกติ |

คอลัมน์ `booked_by` ถูกเพิ่มด้วย auto-migration ใน constructor ของ `CarManager`
(`ALTER TABLE car_bookings ADD COLUMN booked_by INT NULL DEFAULT NULL AFTER user_id`)
→ **แอปกับเว็บใช้ `CarManager` ตัวเดียวกัน ดังนั้นคอลัมน์นี้มีอยู่แล้วแน่นอน ไม่ต้อง migrate เพิ่ม**

---

## 4. ฟีเจอร์ในเว็บทำงานอย่างไร (ต้นแบบ)

อ้างอิง `CarBooking.php` บรรทัด 88–272

### 4.1 การแยกโหมด

ฟอร์มส่ง field `booking_type` มาด้วย 2 ค่า:

| ค่า | ความหมาย |
|---|---|
| `self` | จองให้ตัวเอง 1 คัน (พฤติกรรมเดิม) |
| `group` | จองหลายคัน แต่ละคันระบุผู้ใช้รถ + รายละเอียดแยกกัน |

### 4.2 Field ที่ส่งมาในโหมด `group`

ทุกตัวเป็น **array ที่ index ด้วย `car_id`** (ไม่ใช่ index ตัวเลขเรียง):

| Field | ความหมาย |
|---|---|
| `driver_id[car_id]` | **id ของผู้ใช้รถ** สำหรับคันนั้น |
| `dest_per_car[car_id]` | สถานที่ไป |
| `reason_per_car[car_id]` | ภารกิจ / เหตุผล |
| `phone_per_car[car_id]` | เบอร์โทรของผู้ใช้รถคันนั้น |
| `start_date_per_car[car_id]` | วันรับรถ (`Y-m-d`) |
| `start_time_per_car[car_id]` | เวลารับรถ (`H:i`) |
| `end_date_per_car[car_id]` | วันคืนรถ |
| `end_time_per_car[car_id]` | เวลาคืนรถ |

> เว็บ `array_filter` เอา `driver_id` ที่เป็นค่าว่างออกก่อน → **คันที่ไม่ได้เลือกผู้ใช้รถ = ไม่ถูกจอง**
> คือใช้ `driver_id` เป็นทั้งตัวบอก "เลือกคันนี้" และ "ใช้รถคือใคร" ในตัวเดียว

### 4.3 ลำดับการตรวจสอบ (Validation Order) ในเว็บ

```
1. ตรวจสิทธิ์         → ถ้าไม่มี book_for_others  → "คุณไม่มีสิทธิ์จองรถให้คนอื่น กรุณาติดต่อผู้ดูแลระบบ"
2. ตรวจว่าเลือกรถ     → ถ้า driver_map ว่าง       → "กรุณาเลือกรถอย่างน้อย 1 คัน และระบุผู้ใช้รถ"
3. ตรวจความครบถ้วน    → ถ้าขาด field ใดของคันใด   → "กรุณากรอก ผู้ใช้รถ, เบอร์โทร, วัน-เวลา, สถานที่ และภารกิจ ให้ครบทุกคันที่เลือก"
4. ตรวจช่วงเวลา       → ถ้า end <= start คันใด    → "วัน-เวลาคืนรถของแต่ละคัน ต้องหลังจากเวลารับรถ"
5. วนสร้างการจองรายคัน → createBooking() ตรวจการชนซ้อนเองอีกชั้น
```

**หมายเหตุสำคัญ:** ข้อ 3 กับ 4 ใช้ `break` ทันทีที่เจอปัญหาแรก → ข้อความ error ไม่ระบุว่าคันไหนผิด
(ในแอปควรทำให้ดีกว่านี้ — ระบุคันที่มีปัญหา ดู §9.6)

### 4.4 การสร้างการจองรายคัน

```php
$res = $carMgr->createBooking(
    $did,                  // user_id     = ผู้ใช้รถ (จาก driver_id)
    $cid,                  // car_id
    $c_start, $c_end,      // วัน-เวลาของคันนั้น
    $car_dest, $car_reason,
    1,                     // passengers  = fix ที่ 1 เสมอ
    $_SESSION['user_id']   // booked_by   = คนที่กดจอง
);
```

ถ้าสำเร็จและมีเบอร์โทรส่งมา → `$carMgr->updateUserPhone($did, $car_phone)`
**⚠️ พฤติกรรมนี้เขียนทับเบอร์โทรใน `users` ของผู้ใช้รถ** (ดู §14 ข้อ 3)

เบอร์โทรถูก sanitize ด้วย `preg_replace('/[^0-9]/', '', ...)` เอาเฉพาะตัวเลข

### 4.5 การสรุปผลรายคัน

เว็บเก็บผลลัพธ์แยก 2 กอง แล้วสรุปเป็น 3 กรณี:

| กรณี | การแสดงผล |
|---|---|
| สำเร็จทั้งหมด | SweetAlert `success` — "จองรถสำเร็จ N คัน!" + รายการ ✅ ทีละคัน |
| ล้มเหลวทั้งหมด | SweetAlert `warning` — "จองไม่สำเร็จ:" + เหตุผลทีละคัน |
| สำเร็จบางส่วน | SweetAlert `warning` — "จองสำเร็จบางส่วน" + รายการทั้ง ✅ และ ❌ |

รูปแบบข้อความรายคัน:
- สำเร็จ: `✅ คันที่ 3 — Toyota Vios → สมชาย ใจดี (5/8 09:00 - 5/8 17:00)`
- ล้มเหลว: `❌ คันที่ 3 — Toyota Vios → สมชาย ใจดี` + บรรทัดล่างเป็นเหตุผล

### 4.6 การตรวจสิทธิ์ในเว็บ

```php
// CarBooking.php บรรทัด 34
$can_book_for_others = (function_exists('hasAction') && hasAction('book_for_others'));
```

ใช้ 2 จุด:
1. **ซ่อน UI** — `<?php if ($can_book_for_others): ?>` (บรรทัด 1016)
2. **กันจริงตอน submit** — เช็คซ้ำใน validation ข้อ 1 (บรรทัด 144)

> **แพตเทิร์นนี้ต้องลอกมาทั้งคู่** ห้ามซ่อนแค่ UI

---

## 5. ระบบสิทธิ์: เว็บ vs แอป

### 5.1 เว็บ — `hasAction()` (auth.php)

```
ถ้า $_SESSION['role'] === 'admin'  →  return true (God Mode ผ่านทุก action)

ไม่ใช่ admin → โหลดครั้งเดียวแคชใส่ $_SESSION['user_actions']:
    actions  = SELECT action_code FROM role_actions       WHERE role_name = <role ปัจจุบัน>
    actions += SELECT action_code FROM user_actions       WHERE user_id   = <uid>     (ไม่ซ้ำ)
    actions -= SELECT action_code FROM user_denied_actions WHERE user_id  = <uid>
    return in_array($action_code, $actions)
```

**สรุปสูตร:** `admin = ทุกอย่าง` | `คนอื่น = (role_actions ∪ user_actions) − user_denied_actions`

### 5.2 แอป — สิทธิ์ระดับหน้า (มีอยู่แล้ว)

`api_mobile.php` action `login` (บรรทัด 104–121):

```php
if ($role == 'admin') {
    $allowed_pages = ['ALL'];
} else {
    // permissions JOIN master_pages WHERE p.role_name = <role>
}
```

`app/(tabs)/_layout.tsx` → `canAccess(pageFile)` เทียบชื่อไฟล์ `.php` กับ `user.allowed_pages`
→ ซ่อน/แสดงเมนูใน Drawer ด้วย `drawerItemStyle: { display: "none" }`

**ข้อจำกัด 3 ข้อ:**
1. เป็นสิทธิ์**ระดับหน้า**เท่านั้น — ซ่อนปุ่มในหน้าไม่ได้
2. อ่านแค่ `permissions` (ตาม role) — **ไม่รวม** `user_permissions` / `user_denied_pages`
3. คำนวณตอน login แล้ว persist → แก้สิทธิ์ต้องล็อกอินใหม่จึงเห็นผล

### 5.3 แอป — สิทธิ์ระดับ action (มีแค่บางส่วน)

`api_mobile.php` action `get_menus` (บรรทัด 2837–2943) ทำใกล้เคียงที่สุด:

```php
if (strtolower($role) == 'admin') $allowed_actions = ['ALL'];
else $allowed_actions = SELECT action_code FROM role_actions WHERE role_name = '$safe_role';
// แล้วกรองเมนูด้วย $menu['requiredAction']
```

**เป็นแพตเทิร์นที่ใช้อ้างอิงได้ แต่ยังไม่ครบ:** อ่านแค่ `role_actions`
ขาด `user_actions` และ `user_denied_actions` → **ผลลัพธ์อาจไม่ตรงกับเว็บ**

### 5.4 ทำไมไม่แก้ที่ AuthContext / login

`app/_layout.tsx`:

```ts
export interface UserData {
  id, fullname, role, username, avatar, allowed_pages
}
```

- ไม่มีที่เก็บ action-level (และไม่มี `phone` ด้วย)
- `signIn()` เขียน AsyncStorage คีย์ `"user"` **ครั้งเดียว** — `loadUser()` แค่อ่านกลับ ไม่มี refresh
- ⇒ ถ้าเพิ่ม `allowed_actions` ไปกับ `login` **คนที่ล็อกอินค้างอยู่จะไม่ได้ค่าใหม่จนล็อกเอาต์-ล็อกอินใหม่**
- ⇒ แอดมินแก้สิทธิ์ใน ManagePermissions แล้วไม่เห็นผลทันที = สร้างงาน support

**การตัดสินใจ:** ส่งสิทธิ์มากับ `get_booking_data` ทุกครั้งที่เปิดหน้า
→ ไม่ต้องแตะ AuthContext, แก้สิทธิ์แล้วเห็นผลทันทีแค่ pull-to-refresh

---

## 6. สถานะปัจจุบันฝั่งแอป + ตารางช่องว่าง (Gap Analysis)

### 6.1 API — `api_carboooking_mobile.php`

| หัวข้อ | เว็บ | แอปตอนนี้ | ต้องทำ |
|---|---|---|---|
| ส่ง `booked_by` | ✅ ส่ง | ❌ **เรียก `createBooking()` แค่ 7 พารามิเตอร์** ไม่ส่งตัวที่ 8 | เพิ่ม |
| โหมด `group` | ✅ มี | ❌ ไม่มีเลย | สร้างใหม่ |
| รับ array รายคัน | ✅ มี | ❌ ไม่มี | สร้างใหม่ |
| รายชื่อพนักงาน (dropdown) | ✅ `getAllEmployees()` | ❌ ไม่ส่งออกมา | เพิ่ม (เมธอดมีอยู่แล้ว) |
| สิทธิ์ `book_for_others` | ✅ `hasAction()` | ❌ ไม่มีอะไรเลย | สร้าง `hasActionForUser()` |
| กันสิทธิ์ตอน submit | ✅ มี | ❌ ไม่มี | เพิ่ม |
| `require auth.php` | ✅ | ❌ ไม่ require (ไม่มี session) | ทำเวอร์ชันรับ `user_id` |
| ฟอร์แมต `return_note` | `📍 จอดที่: X \| 🔋 พลังงาน: Y \| ⚡ เสียบชาร์จอยู่ \| ⚠️ หมายเหตุ: Z` | `จอดที่: X \| พลังงานคงเหลือ: Y \| ปัญหา: Z` (ยัดสถานะชาร์จเข้า `car_issue`) | จัดให้ตรงกัน |
| ฟิลด์ `is_charging` | ✅ แยก | ❌ ไม่มี | เพิ่ม (งานพ่วง) |

**ข้อดี:** `getMyUpcomingBookings()` ส่ง `booked_by`, `driver_name`, `booker_name` มาอยู่แล้ว
และ API ก็ส่งผ่านครบ → **ฝั่ง API ไม่ต้องแก้ตรงนี้ แค่แอปยังไม่ได้ใช้**

### 6.2 หน้าจอ — `CarBooking.tsx`

| หัวข้อ | สถานะตอนนี้ | ต้องทำ |
|---|---|---|
| การเลือกรถ | `selectedCarId: number \| null` — **คันเดียว** | เพิ่มโหมด multi-select |
| ข้อมูลฟอร์ม | ชุดเดียวใช้ร่วมทั้งฟอร์ม (`phone`, `startDate`, `endDate`, `destination`, `reason`) | เพิ่ม state รายคัน |
| Toggle โหมด | ❌ ไม่มี | สร้าง + ผูกสิทธิ์ |
| Dropdown เลือกผู้ใช้รถ | ❌ ไม่มี | สร้าง (Modal + ค้นหา) |
| Badge จองแทน | ❌ ไม่มี | เพิ่มในการ์ด `renderActiveBookings()` |
| สรุปผลรายคัน | ❌ ไม่มี (alert เดียว) | ใช้ `CustomAlertModal` แสดงหลายบรรทัด |
| สิทธิ์ | ❌ `useAuth()` ใช้แค่ `user?.id` | รับ `can_book_for_others` จาก API |

### 6.3 หน้าจอ — `CarDashboard.tsx`

| หัวข้อ | สถานะตอนนี้ | ต้องทำ |
|---|---|---|
| Modal รายละเอียด | แสดงแค่ `"ผู้จอง"` = `fullname` (ซึ่งจริงๆ คือ**ผู้ใช้รถ**) | แยก "ผู้ใช้รถ" / "ผู้จองแทน" |
| ข้อมูลผู้จองแทนจาก API | ❌ `get_car_dashboard_data` ไม่ได้ map `booked_by` | เพิ่มใน API |

---

## 7. แผนแก้ไข ส่วนที่ 1: ฐานข้อมูล (Prerequisite)

### 7.1 ตรวจว่า action มีอยู่จริง

เนื่องจากคุณตั้งสิทธิ์ในเว็บไว้แล้ว **แถวนี้น่าจะมีอยู่แล้ว** แต่ต้องยืนยันชื่อ `action_code` ให้ตรงเป๊ะ
เพราะ API จะเช็คด้วยสตริงนี้:

```sql
-- 1. ยืนยันว่ามี action นี้และผูกกับหน้า CarBooking.php
SELECT ma.id, ma.action_code, ma.action_name, mp.file_name
FROM master_actions ma
LEFT JOIN master_pages mp ON ma.page_id = mp.id
WHERE ma.action_code = 'book_for_others';

-- 2. ดูว่า role ไหนได้สิทธิ์นี้
SELECT role_name FROM role_actions WHERE action_code = 'book_for_others';

-- 3. ดูว่าใครได้เพิ่มรายบุคคล / ใครถูกปิด
SELECT user_id FROM user_actions        WHERE action_code = 'book_for_others';
SELECT user_id FROM user_denied_actions WHERE action_code = 'book_for_others';
```

### 7.2 ถ้ายังไม่มีแถวใน `master_actions`

```sql
-- หา page_id ของ CarBooking.php ก่อน
SELECT id, file_name FROM master_pages WHERE file_name = 'CarBooking.php';

-- แล้วเพิ่ม (แทน <PAGE_ID> ด้วยค่าที่ได้)
INSERT INTO master_actions (page_id, action_code, action_name)
VALUES (<PAGE_ID>, 'book_for_others', 'จองรถให้ตัวเอง + คนอื่น');
```

> ⚠️ `action_code` เป็น `VARCHAR(50)` — `book_for_others` ยาว 16 ตัวอักษร ปลอดภัย

### 7.3 ไม่ต้องทำ

- ❌ ไม่ต้อง migrate `car_bookings.booked_by` — มีอยู่แล้วจาก auto-migration ใน `CarManager`
- ❌ ไม่ต้องแก้ `CarManager.php` เลย

---

## 8. แผนแก้ไข ส่วนที่ 2: API (`api_carboooking_mobile.php`)

### 8.1 ฟังก์ชันใหม่: `hasActionForUser()`

**ปัญหา:** `hasAction()` ในเว็บพึ่ง `$_SESSION` แต่ API มือถือไม่มี session (ไม่ `require auth.php` ด้วย)
**วิธีแก้:** เขียนเวอร์ชันรับ `$user_id` ตรงๆ ให้ logic ตรงกับเว็บ 100% (§5.1)

```
function hasActionForUser($conn, $user_id, $action_code) -> bool

  1. $user_id = intval(); ถ้า <= 0 return false
  2. อ่าน role ของ user นี้จาก DB (prepared statement)
       SELECT role FROM users WHERE id = ?
  3. ถ้า strtolower(role) === 'admin'  → return true      [ตรงกับ God Mode ในเว็บ]
  4. โหลดสิทธิ์ (prepared statement ทุกตัว):
       $a  = role_actions        WHERE role_name = <role>
       $a += user_actions        WHERE user_id   = <uid>   (ไม่ซ้ำ)
       $a -= user_denied_actions WHERE user_id   = <uid>
  5. return in_array($action_code, $a)
```

**ข้อกำหนด:**
- ใช้ **prepared statement ทั้งหมด** (ไม่ทำผิดซ้ำแบบ `get_menus` ที่ต่อสตริง)
- ห่อ `user_denied_actions` ด้วย `@$conn->prepare()` หรือเช็คตารางก่อน (เว็บทำแบบนี้ เผื่อตารางยังไม่ถูกสร้าง)
- ทำ static cache ในตัวแปร static เพื่อไม่ query ซ้ำหลายรอบใน request เดียว
- **แนะนำ:** แยกฟังก์ชันนี้ไปไฟล์ใหม่ `mobile_permissions.php` เพื่อให้ API อื่นในอนาคตเรียกใช้ได้
  (ถ้าอยากคุมความเสี่ยงต่ำสุด วางไว้ในไฟล์ API เดิมก็ได้)

### 8.2 แก้ `action = get_booking_data` (เพิ่มข้อมูล 2 ก้อน)

**เพิ่มใน response (ของเดิมคงไว้ทั้งหมด ไม่ลบอะไร):**

```jsonc
{
  "status": "success",
  "cars": [...],              // เดิม
  "my_bookings": [...],       // เดิม (มี booked_by, driver_name, booker_name อยู่แล้ว)
  "activeBooking": {...},     // เดิม
  "user_phone": "08...",      // เดิม

  // ✅ ใหม่
  "can_book_for_others": true,
  "employees": [
    { "id": 12, "fullname": "สมชาย ใจดี", "phone": "0812345678" }
  ]
}
```

**การคำนวณ:**
- `can_book_for_others` ← `hasActionForUser($conn, $user_id, 'book_for_others')`
- `employees` ← `$manager->getAllEmployees()` (เมธอดมีอยู่แล้วใน `CarManager` บรรทัด 89)
  **ส่งเฉพาะเมื่อ `can_book_for_others === true`** เพื่อไม่ปล่อยรายชื่อ+เบอร์พนักงานทั้งบริษัทให้คนที่ไม่มีสิทธิ์
  (ถ้าไม่มีสิทธิ์ให้ส่ง `[]`)

> `getAllEmployees()` คืน `id, fullname, phone` เรียงตาม `fullname ASC` — ตรงกับที่ dropdown ต้องใช้

### 8.3 แก้ `action = book_car` (รองรับ 2 โหมด)

#### 8.3.1 รูปแบบ payload ที่แนะนำ

เว็บใช้ `driver_id[car_id]` แบบ HTML array ซึ่งส่งจาก React Native ผ่าน `URLSearchParams` ได้แต่ยุ่งยาก
**แนะนำให้แอปส่ง JSON string มาแทน** แล้ว PHP `json_decode` — อ่านง่าย debug ง่าย ไม่ต้องกังวลเรื่อง encoding

```
POST api_carboooking_mobile.php
  action        = book_car
  user_id       = 7                 // คนที่กดจอง (booked_by)
  booking_type  = group             // 'self' (default) | 'group'
  items         = <JSON string>     // ใช้เฉพาะโหมด group
```

`items` มีรูปร่าง:

```jsonc
[
  {
    "car_id": 3,
    "driver_id": 12,
    "phone": "0812345678",
    "destination": "อ.วารินชำราบ",
    "reason": "ส่งเอกสารลูกค้า",
    "start": "2026-08-05 09:00:00",
    "end":   "2026-08-05 17:00:00"
  }
]
```

> **หมายเหตุ:** ให้แอปประกอบ `start` / `end` เป็น `Y-m-d H:i:s` สำเร็จรูปมาเลย
> (แอปมี helper `formatDT()` อยู่แล้วใน `CarBooking.tsx` บรรทัด 710)
> จะได้ไม่ต้องแยกส่ง 4 ฟิลด์ (`start_date_per_car` ฯลฯ) แบบเว็บ ซึ่งเกิดจากข้อจำกัดของ `<input type=date>`

#### 8.3.2 โหมด `self` — คงพฤติกรรมเดิม + แก้ 1 จุด

โค้ดเดิมเก็บไว้ทั้งหมด **แต่ให้ส่ง `booked_by = null` อย่างชัดเจน** (พารามิเตอร์ตัวที่ 8)
เพื่อความชัดว่าเป็นการจองด้วยตัวเอง ไม่ใช่จองแทน

> ⚠️ **ห้ามทำให้โหมด self พัง** — แอปเวอร์ชันเก่าที่ผู้ใช้ยังไม่อัปเดตจะยิงมาแบบไม่มี `booking_type`
> ดังนั้น `$booking_type = $_POST['booking_type'] ?? 'self'` → ค่า default ต้องเป็น `self`

#### 8.3.3 โหมด `group` — ลำดับการทำงาน

```
1. ตรวจสิทธิ์ (บังคับ — ชั้นความปลอดภัยจริง)
     if (!hasActionForUser($conn, $user_id, 'book_for_others'))
         return { status: "error", code: "no_permission",
                  message: "คุณไม่มีสิทธิ์จองรถให้คนอื่น กรุณาติดต่อผู้ดูแลระบบ" }

2. json_decode($_POST['items'], true)
     - ถ้า decode ไม่ได้ / ไม่ใช่ array / ว่าง
         → { status: "error", message: "กรุณาเลือกรถอย่างน้อย 1 คัน และระบุผู้ใช้รถ" }

3. ตรวจความครบถ้วนทุกรายการก่อน (ยังไม่แตะ DB)
     ต้องมีครบ: car_id, driver_id, phone, destination, reason, start, end
     - ถ้าขาด → เก็บชื่อคันที่ขาดไว้ แล้วรวมรายงานทีเดียว (ดีกว่าเว็บที่ break ทันที)
     - ตรวจ strtotime(end) > strtotime(start) ทุกรายการ

4. โหลด map ชื่อรถและชื่อพนักงาน (สำหรับข้อความสรุป)
     SELECT id, name, car_number FROM cars            → "คันที่ 3 — Toyota Vios"
     SELECT id, fullname         FROM users           → ชื่อผู้ใช้รถ

5. วนสร้างทีละรายการ
     $res = $manager->createBooking(
         $driver_id, $car_id, $start, $end, $dest, $reason, 1, $user_id
     );
     ถ้าสำเร็จ + มีเบอร์ → $manager->updateUserPhone($driver_id, $phoneDigitsOnly)
     เก็บผลใส่ $ok_list / $fail_list

6. ส่งผลกลับเป็น structured JSON (ไม่ใช่ HTML แบบเว็บ)
```

#### 8.3.4 รูปแบบ response ที่แนะนำ

**อย่าลอก HTML string แบบเว็บ** ให้ส่งข้อมูลดิบมา แล้วให้แอปจัดรูปแบบเอง:

```jsonc
{
  "status": "success",          // success = สำเร็จทั้งหมด
                                // partial = สำเร็จบางส่วน
                                // error   = ล้มเหลวทั้งหมด / ไม่มีสิทธิ์
  "ok_count": 2,
  "fail_count": 1,
  "results": [
    {
      "car_id": 3,
      "car_label": "คันที่ 3 — Toyota Vios",
      "driver_id": 12,
      "driver_name": "สมชาย ใจดี",
      "start": "2026-08-05 09:00:00",
      "end":   "2026-08-05 17:00:00",
      "success": true,
      "message": "บันทึกการจองสำเร็จ!"
    },
    {
      "car_id": 5,
      "car_label": "คันที่ 5 — Isuzu D-Max",
      "driver_id": 12,
      "driver_name": "สมชาย ใจดี",
      "success": false,
      "message": "ขออภัย รถคันนี้ถูกจองตัดหน้าในช่วงเวลาดังกล่าวแล้ว"
    }
  ]
}
```

**ข้อความ error ที่ `createBooking()` คืนมาได้ (ลอกมาแสดงตรงๆ ได้เลย):**

| ข้อความ | เงื่อนไข |
|---|---|
| `เวลาเริ่มต้นต้องมาก่อนเวลาสิ้นสุด` | `start >= end` |
| `ขออภัย รถคันนี้ถูกจองตัดหน้าในช่วงเวลาดังกล่าวแล้ว` | รถคันนั้นมีคิวทับ |
| `คุณมีการจองรถคันอื่นในช่วงเวลานี้อยู่แล้ว <br> ไม่สามารถจองเวลาซ้อนกันได้` | **ผู้ใช้รถคนนั้น**มีคิวทับ |
| `Error Execute: ...` / `Error Prepare: ...` | SQL error |

> ⚠️ ข้อความที่ 3 มี `<br>` ติดมา — **แอปต้อง `.replace(/<br\s*\/?>/gi, "\n")`** ก่อนแสดง
> และข้อความนี้พูดว่า "คุณ" แต่ในบริบทจองแทนหมายถึง "ผู้ใช้รถคนนั้น" → ควร map ข้อความให้เหมาะกับบริบท เช่น
> `"สมชาย ใจดี มีการจองรถคันอื่นในช่วงเวลานี้อยู่แล้ว"`

### 8.4 แก้ `action = get_car_dashboard_data` (เพิ่มผู้จองแทน)

ปัจจุบันฟังก์ชันนี้ map `fullname` จาก `users_map[$uid]` โดยใช้ `$ev['user_id']`
แต่ `getCarSchedules()` **ไม่ได้ select `booked_by` ออกมา** → ข้อมูลผู้จองแทนไม่มีทางไปถึงแอป

**2 ทางเลือก:**

| ทาง | วิธี | ข้อดี | ข้อเสีย |
|---|---|---|---|
| **A** | เพิ่ม `b.booked_by` ใน SELECT ของ `getCarSchedules()` ใน `CarManager.php` | สะอาด ได้ทั้งเว็บและแอป | แตะไฟล์ที่เว็บใช้ร่วม (ความเสี่ยงต่ำ เพราะเป็นแค่เพิ่มคอลัมน์ใน SELECT + key ใน array) |
| **B** | ใน API ยิง query เสริมดึง `id → booked_by` จาก `car_bookings` แล้ว map ทับ | ไม่แตะไฟล์ร่วม | เพิ่ม query, ตรรกะกระจาย |

**แนะนำทาง A** — เพิ่ม `b.booked_by` และ `booker.fullname AS booker_name`
(LEFT JOIN `users booker ON b.booked_by = booker.id`) ใน `getCarSchedules()`
แล้วใส่ key `booked_by` / `booker_name` เข้า array `$schedules[...]`
→ เว็บ `CarDashboard.php` ได้ประโยชน์ด้วยฟรีๆ

**ถ้าเลือกทาง A ต้องระวัง:** `getCarSchedules()` ถูกเรียกจาก `CarBooking.php`, `CarDashboard.php`,
และ API มือถือ 2 จุด → **เพิ่ม key เท่านั้น ห้ามลบ/เปลี่ยนชื่อ key เดิม**

---

## 9. แผนแก้ไข ส่วนที่ 3: `CarBooking.tsx`

### 9.1 State ที่ต้องเพิ่ม

```ts
// สิทธิ์ (มาจาก API ทุกครั้งที่ fetchData)
const [canBookForOthers, setCanBookForOthers] = useState(false);
const [employees, setEmployees] = useState<Employee[]>([]);

// โหมดการจอง
const [bookingMode, setBookingMode] = useState<"self" | "group">("self");

// ข้อมูลรายคัน (key = car_id)  — ใช้เฉพาะโหมด group
const [carEntries, setCarEntries] = useState<Record<number, CarEntry>>({});

// Modal เลือกผู้ใช้รถ
const [driverPickerCarId, setDriverPickerCarId] = useState<number | null>(null);
const [driverSearch, setDriverSearch] = useState("");
```

**Type ที่ต้องประกาศ:**

```ts
interface Employee { id: number; fullname: string; phone: string; }

interface CarEntry {
  driverId: number | null;
  driverName: string;
  phone: string;
  destination: string;
  reason: string;
  startDate: Date;
  endDate: Date;
}
```

### 9.2 แก้ `fetchData()`

```ts
if (data.status === "success") {
  // ...ของเดิมทั้งหมด...
  setCanBookForOthers(data.can_book_for_others === true);
  setEmployees(Array.isArray(data.employees) ? data.employees : []);
}
```

**ต้องมี guard สำคัญ:** ถ้าสิทธิ์ถูกถอนระหว่างที่ผู้ใช้ค้างอยู่ในโหมด group ต้องเด้งกลับโหมด self

```ts
useEffect(() => {
  if (!canBookForOthers && bookingMode === "group") {
    setBookingMode("self");
    setCarEntries({});
  }
}, [canBookForOthers]);
```

### 9.3 UI: Toggle โหมด (ผูกสิทธิ์)

วางไว้**บนสุดของ `formCard`** (ก่อนช่องเบอร์โทร บรรทัด ~1982)

```tsx
{canBookForOthers && (
  <SegmentedToggle
    value={bookingMode}
    options={[
      { value: "self",  label: "จองให้ตัวเอง",         icon: "person" },
      { value: "group", label: "จองให้ตัวเอง + คนอื่น", icon: "people" },
    ]}
    onChange={(m) => { setBookingMode(m); setSelectedCarId(null); setCarEntries({}); }}
  />
)}
```

**เงื่อนไขสำคัญ:** `canBookForOthers === false` → **ไม่เรนเดอร์ toggle เลย**
หน้าจอต้องเหมือนเดิม 100% กับผู้ใช้ทั่วไป (ไม่ใช่แสดงแบบ disabled — ให้ตรงกับเว็บที่ `if` ครอบไว้)

### 9.4 UI: การเลือกรถ

| โหมด | พฤติกรรม |
|---|---|
| `self` | เดิมทั้งหมด — แตะการ์ด = `setSelectedCarId(item.id)` เลือกได้คันเดียว |
| `group` | แตะการ์ด = toggle เข้า/ออก `carEntries` — เลือกได้หลายคัน |

**แก้ `renderCarItem` → `handlePressCar`:**

```ts
const handlePressCar = () => {
  if (bookingMode === "group") {
    setCarEntries((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];                       // ยกเลิกเลือก
      } else {
        next[item.id] = {                           // เลือก + ตั้งค่าเริ่มต้น
          driverId: null, driverName: "", phone: "",
          destination: "", reason: "",
          startDate: startDate, endDate: endDate,   // ยืมค่าจากฟอร์มด้านบนเป็น default
        };
      }
      return next;
    });
  } else {
    setSelectedCarId(item.id);
  }
  if (isMaintenance) { /* คำเตือนเดิม คงไว้ */ }
};
```

**การแสดง "ถูกเลือก" (`isSelected`)** ต้องรองรับทั้ง 2 โหมด:

```ts
const isSelected = bookingMode === "group"
  ? !!carEntries[item.id]
  : selectedCarId === item.id;
```

> เพิ่มเลข badge บนการ์ดในโหมด group (เช่น "1", "2") จะช่วยให้ผู้ใช้เห็นลำดับ

### 9.5 UI: การ์ดกรอกรายละเอียดรายคัน

ในโหมด `group` ให้แสดง section ใหม่ **หลังส่วนเลือกรถ** — การ์ด 1 ใบต่อ 1 คันที่เลือก

โครงสร้างการ์ดแต่ละใบ:

```
┌────────────────────────────────────────────┐
│ [3] Toyota Vios · กข-1234        [ลบ ✕]   │
├────────────────────────────────────────────┤
│ ผู้ใช้รถ *        [ เลือกพนักงาน...    ▾ ] │  ← เปิด Modal
│ เบอร์โทร *       [ 0812345678            ] │  ← autofill จาก employee.phone
│ รับรถ           [ 05/08/2569 ] [ 09:00 ]  │  ← DateTimePicker เดิม
│ คืนรถ           [ 05/08/2569 ] [ 17:00 ]  │
│ สถานที่ไป *      [ อ.วารินชำราบ          ] │
│ ภารกิจ *         [ ส่งเอกสารลูกค้า       ] │
└────────────────────────────────────────────┘
```

**รายละเอียดที่ต้องทำ:**

1. **Autofill เบอร์โทร** — เมื่อเลือกผู้ใช้รถ ให้เติม `employee.phone` ให้อัตโนมัติ
   (ตรงกับพฤติกรรมเว็บที่มี `$empPhones` map) แต่ยังแก้ได้
2. **DateTimePicker รายคัน** — ปัจจุบัน `showPicker(target: "start" | "end")` ผูกกับ state เดียว
   ต้องขยาย signature เป็น `showPicker(target, mode, carId?)` และให้ `handleDateChange` เขียนลง
   `carEntries[carId]` เมื่อมี `carId`
3. **ค่าเริ่มต้นวัน-เวลา** — ใช้ค่าจากฟอร์มหลักด้านบน (ผู้ใช้ตั้งช่วงเวลาทีเดียวแล้วปรับรายคันได้)
   ⚠️ ถ้าผู้ใช้แก้วัน-เวลาหลักหลังจากเลือกรถแล้ว **ไม่ควร** ไปเขียนทับค่าที่เขาปรับรายคันไปแล้ว
   → sync เฉพาะตอน "เพิ่มคันใหม่" เท่านั้น (หรือมีปุ่ม "ใช้เวลาเดียวกันทุกคัน" ให้กดเอง)
4. **ปุ่มลบ** — ลบคันนั้นออกจาก `carEntries`
5. **การซ่อนฟอร์มหลัก** — ในโหมด `group` ควรซ่อน/ยุบช่อง `destination` / `reason` / `phone`
   ของฟอร์มหลัก เพราะย้ายไปอยู่รายคันแล้ว (เหลือแค่วัน-เวลาเป็น "ค่าเริ่มต้น")
   **ต้องเขียนหัวข้อกำกับให้ชัด** ว่าเป็นค่าเริ่มต้น ไม่ใช่ค่าที่จะถูกใช้จริง

### 9.6 Validation ฝั่งแอป (ก่อนยิง API)

แก้ `handleBookingPress()` แยก 2 ทาง — **โหมด group ควรทำดีกว่าเว็บ คือรายงานทุกคันที่มีปัญหา
ไม่ใช่หยุดที่คันแรก**

```ts
const handleBookingPress = () => {
  if (!user?.id) return showAlert("error", "แจ้งเตือน", "กรุณา Login ใหม่");

  if (bookingMode === "group") {
    if (!canBookForOthers)
      return showAlert("error", "ไม่มีสิทธิ์",
        "คุณไม่มีสิทธิ์จองรถให้คนอื่น กรุณาติดต่อผู้ดูแลระบบ");

    const ids = Object.keys(carEntries).map(Number);
    if (ids.length === 0)
      return showAlert("warning", "แจ้งเตือน",
        "กรุณาเลือกรถอย่างน้อย 1 คัน และระบุผู้ใช้รถ");

    // เก็บ error ทุกคัน แล้วรายงานทีเดียว
    const problems: string[] = [];
    ids.forEach((cid) => {
      const e = carEntries[cid];
      const label = carLabel(cid);                 // "คันที่ 3 — Toyota Vios"
      if (!e.driverId)            problems.push(`${label}: ยังไม่เลือกผู้ใช้รถ`);
      if (!e.phone.trim())        problems.push(`${label}: ยังไม่กรอกเบอร์โทร`);
      if (!e.destination.trim())  problems.push(`${label}: ยังไม่กรอกสถานที่`);
      if (!e.reason.trim())       problems.push(`${label}: ยังไม่กรอกภารกิจ`);
      if (e.endDate <= e.startDate)
                                  problems.push(`${label}: เวลาคืนต้องหลังเวลารับ`);
    });
    if (problems.length) return showAlert("warning", "ข้อมูลไม่ครบ", problems.join("\n"));

    // เช็คคิวชนฝั่ง client เพื่อ UX (เซิร์ฟเวอร์เช็คจริงอีกชั้น)
    // ...ใช้ validateBookingConflict แต่ต้องส่งช่วงเวลารายคันเข้าไป (ดูข้อควรระวังด้านล่าง)

    return showAlert("question", "ยืนยันการจอง",
      `จองรถ ${ids.length} คัน ตรวจสอบข้อมูลครบถ้วนแล้ว?`, true, submitGroupBooking);
  }

  // โหมด self — logic เดิมทั้งหมด ไม่แตะ
};
```

**⚠️ ข้อควรระวัง — `validateBookingConflict()` มี bug เชิงโครงสร้าง**

ฟังก์ชันนี้ (บรรทัด 425) อ่านช่วงเวลาจาก **state `startDate` / `endDate` ของฟอร์มหลัก** โดยตรง:

```ts
const reqStart = startDate.getTime(), reqEnd = endDate.getTime();
```

ในโหมด group แต่ละคันมีช่วงเวลาของตัวเอง → **ต้อง refactor ให้รับพารามิเตอร์**:

```ts
const validateBookingConflict = (selectedCar: any, from = startDate, to = endDate) => { ... }
```

แล้วเรียกแบบ `validateBookingConflict(car, entry.startDate, entry.endDate)`
โหมด self เรียกแบบเดิมได้เพราะมี default parameter

> **ผลข้างเคียงที่ต้องระวัง:** `filteredCars` (บรรทัด 443) ก็เรียกฟังก์ชันนี้ด้วย
> → ต้องตรวจว่าตัวกรอง "ว่าง / ไม่ว่าง" ยังทำงานถูก และ `useMemo` dependency ยังครบ

### 9.7 ฟังก์ชันใหม่: `submitGroupBooking()`

```ts
const submitGroupBooking = async () => {
  try {
    setLoading(true);
    const items = Object.entries(carEntries).map(([cid, e]) => ({
      car_id: Number(cid),
      driver_id: e.driverId,
      phone: e.phone.replace(/[^0-9]/g, ""),      // ตรงกับ preg_replace ของเว็บ
      destination: e.destination.trim(),
      reason: e.reason.trim(),
      start: formatDT(e.startDate) + ":00",
      end:   formatDT(e.endDate)   + ":00",
    }));

    const params = new URLSearchParams({
      action: "book_car",
      booking_type: "group",
      user_id: String(user?.id),
      items: JSON.stringify(items),
    });

    const res = await axios.post(
      `${API_BASE}/api_carboooking_mobile.php`,
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    // ⚠️ ต้องใช้ตัวแยก JSON แบบเดียวกับ submitBooking() (บรรทัด 736-746)
    //    เพราะ PHP อาจแทรก warning ก่อน JSON — โค้ดเดิมตัดด้วย indexOf("{")
    //    แต่ response ก้อนนี้เป็น object ที่มี array ข้างใน ยังใช้วิธีเดิมได้
    //    (ถ้าเปลี่ยนเป็น response ที่ root เป็น array ต้องแก้ตัวแยกด้วย)

    // แสดงสรุปรายคัน
    const lines = data.results.map((r) =>
      `${r.success ? "✅" : "❌"} ${r.car_label} → ${r.driver_name}` +
      (r.success ? "" : `\n     ${stripHtml(r.message)}`)
    );
    // status: success → icon success | partial → warning | error → error
    showAlert(iconByStatus(data.status), titleByStatus(data), lines.join("\n"), false, async () => {
      setCarEntries({});
      setBookingMode("self");      // หรือคงโหมดไว้ — ดู §14 ข้อ 5
      await fetchData();
      scrollToTop();
    });
  } catch (e) { /* ... */ } finally { setLoading(false); }
};
```

**Helper ที่ต้องเพิ่ม:**
```ts
const stripHtml = (s: string) => (s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
```

> **หมายเหตุเรื่อง `CustomAlertModal`:** component นี้รับ `message` เป็น string
> ถ้ารายการยาว 5-6 คันอาจล้นจอ → ต้องเช็คว่ามี `ScrollView` ครอบหรือยัง
> ถ้าไม่มี ควรเพิ่ม หรือทำ Modal สรุปผลแยกตัวสำหรับกรณี group

### 9.8 UI: Modal เลือกผู้ใช้รถ

แอปไม่มี component dropdown อยู่แล้ว (เว็บใช้ `<select>`) → ต้องสร้าง Modal

```
┌──────────────────────────────┐
│ เลือกผู้ใช้รถ           [✕] │
│ [ 🔍 ค้นหาชื่อ...         ] │
├──────────────────────────────┤
│ ⭐ ตัวฉัน (สมหญิง รักงาน)   │  ← ทางลัด: จองให้ตัวเอง
│ ─────────────────────────── │
│  สมชาย ใจดี      0812345678 │
│  สมศรี ขยัน       081...    │
│  ...                        │
└──────────────────────────────┘
```

**ข้อกำหนด:**
- ใช้ `FlatList` (รายชื่อพนักงานอาจหลายร้อยคน) — **ไม่ใช่ `.map()` ใน ScrollView**
- ค้นหาแบบ client-side filter จาก `employees` ที่โหลดมาแล้ว
- **ต้องมีตัวเลือก "ตัวฉัน"** ปักหมุดบนสุด — เพราะฟีเจอร์นี้ชื่อ "จองให้ตัวเอง **+** คนอื่น"
  ผู้ใช้ต้องเลือกตัวเองได้ (เว็บทำได้เพราะ `getAllEmployees()` คืนทุกคนรวมตัวเอง)
- เมื่อเลือก → set `driverId`, `driverName`, และ autofill `phone`

### 9.9 UI: Badge ในการ์ดรายการจอง

แก้ `renderActiveBookings()` (บรรทัด 1812) — เพิ่ม badge ใต้ชื่อรถ
ข้อมูลมีอยู่ใน response แล้ว (`booked_by`, `driver_name`, `booker_name`)

```ts
const myId = String(user?.id);
const iBookedForOther  = String(b.booked_by) === myId && String(b.user_id) !== myId;
const bookedForMeByOther = String(b.user_id) === myId
                        && b.booked_by && String(b.booked_by) !== myId;
```

| เงื่อนไข | Badge |
|---|---|
| `iBookedForOther` | 🏷️ `คุณจองให้: {driver_name}` (พื้นฟ้าอ่อน) |
| `bookedForMeByOther` | ✅ `จองให้คุณโดย: {booker_name}` (พื้นฟ้าอ่อน) |
| ทั้งคู่ false | ไม่แสดง badge (จองเอง ใช้เอง) |

> ตรงกับเว็บ `CarBooking.php` บรรทัด 875–883
> ⚠️ **ใช้ `String()` เทียบ** เพราะ API มือถือส่ง id เป็น string บางที่ (`login` cast `(string)$row['id']`)
> การเทียบ `===` ระหว่าง `"7"` กับ `7` จะพลาด

### 9.10 ปุ่มคืนรถ / ยกเลิก ในกรณีจองแทน

`CarManager` รองรับแล้ว — ทั้ง `returnCar()` (บรรทัด 301) และ `cancelBooking()` (บรรทัด 344)
ใช้เงื่อนไข `(user_id = ? OR booked_by = ?)` → **คนจองแทนกดคืน/ยกเลิกได้**

**ดังนั้นฝั่งแอปไม่ต้องแก้ logic ปุ่ม** แต่ควรพิจารณาข้อความยืนยันให้ชัด เช่น
`"ยืนยันคืนรถแทน สมชาย ใจดี?"` เพื่อกันกดผิด

---

## 10. แผนแก้ไข ส่วนที่ 4: `CarDashboard.tsx`

งานเบา — แก้เฉพาะ `renderDetailModal()` (บรรทัด 1264)

### 10.1 ปัญหาปัจจุบัน

```ts
const userName = selectedDetail.fullname || selectedDetail.user || "ไม่ระบุชื่อ";
// ...
<Text>ผู้จอง</Text>
<Text>{userName}</Text>
```

`fullname` มาจาก `users_map[$ev['user_id']]` = **ผู้ใช้รถ** ไม่ใช่ผู้จอง
→ หัวข้อ "ผู้จอง" **ผิดความหมาย** เมื่อเป็นการจองแทน

### 10.2 แก้เป็น

```tsx
<Text style={label}>ผู้ใช้รถ</Text>
<Text style={value}>{userName}</Text>
<Text style={sub}>📞 {phoneNumber}</Text>

{selectedDetail.booker_name && (
  <View style={badgeRow}>
    <Ionicons name="person-add" size={12} />
    <Text>จองแทนโดย: {selectedDetail.booker_name}</Text>
  </View>
)}
```

**ต้องทำก่อน:** API ส่ง `booker_name` มาให้ (§8.4) — ถ้าไม่ส่ง badge จะไม่ขึ้นเฉยๆ ไม่ error
→ **ปลอดภัยที่จะแก้แอปก่อน แล้วค่อยแก้ API** (graceful degradation)

### 10.3 ที่อื่นที่ควรพิจารณา (optional)

- ตารางประวัติในแดชบอร์ด (`filteredHistory`) — จะเพิ่มไอคอนเล็กๆ ท้ายชื่อคนขับ
  เพื่อบอกว่ารายการนี้ถูกจองแทนก็ได้ แต่พื้นที่จำกัด อาจรบกวนสายตา → **แนะนำแสดงแค่ใน Modal**

---

## 11. ลำดับการลงมือ (Implementation Order)

ทำตามลำดับนี้ แต่ละขั้นทดสอบได้เอง ไม่พังของเดิม

| ขั้น | งาน | ไฟล์ | ทดสอบว่า |
|:--:|---|---|---|
| **0** | ตรวจ/เพิ่ม `master_actions` + ตั้งสิทธิ์ทดสอบ | SQL | เว็บยังแสดง/ซ่อนปุ่มถูกต้อง |
| **1** | สร้าง `hasActionForUser()` | API | ยิงทดสอบด้วย user หลายคน ได้ผลตรงกับเว็บ |
| **2** | เพิ่ม `can_book_for_others` + `employees` ใน `get_booking_data` | API | เปิดแอป (ยังไม่แก้ UI) → response มี field ใหม่ ของเดิมไม่หาย |
| **3** | เพิ่ม Toggle + อ่านสิทธิ์ในแอป (ยังไม่มีฟอร์ม group) | `CarBooking.tsx` | คนมีสิทธิ์เห็น toggle, คนไม่มีสิทธิ์หน้าจอเหมือนเดิม 100% |
| **4** | Refactor `validateBookingConflict` รับพารามิเตอร์ | `CarBooking.tsx` | **โหมด self ยังจองได้ปกติ + ตัวกรองว่าง/ไม่ว่างยังถูก** |
| **5** | เพิ่ม multi-select + `carEntries` + การ์ดรายคัน | `CarBooking.tsx` | เลือกหลายคัน กรอกข้อมูลได้ (ยังไม่ยิง API) |
| **6** | Modal เลือกผู้ใช้รถ + autofill เบอร์ | `CarBooking.tsx` | เลือกคนได้ ค้นหาได้ มี "ตัวฉัน" |
| **7** | รองรับโหมด `group` ใน `book_car` + ส่ง `booked_by` | API | จองแทนสำเร็จ, `booked_by` ลง DB ถูก, สิทธิ์กันได้ |
| **8** | `submitGroupBooking()` + Modal สรุปผลรายคัน | `CarBooking.tsx` | ทดสอบครบ 3 กรณี (สำเร็จหมด/บางส่วน/ล้มเหลวหมด) |
| **9** | Badge จองแทนในการ์ดรายการจอง | `CarBooking.tsx` | badge ขึ้นถูกทั้ง 2 ทิศทาง |
| **10** | `booked_by` + `booker_name` ใน `getCarSchedules()` | `CarManager.php` | **เว็บทั้ง 3 หน้ายังทำงานปกติ** |
| **11** | แสดงผู้จองแทนใน Dashboard modal | `CarDashboard.tsx` | ขึ้นถูก และไม่ขึ้นตอนจองเอง |
| **12** | (พ่วง) จัดฟอร์แมต `return_note` + `is_charging` ให้ตรงเว็บ | API | เว็บอ่าน note จากแอปได้ถูก และกลับกัน |

> **จุดเสี่ยงสูงสุดคือขั้น 4 และ 10** — ทั้งสองแตะโค้ดที่ของเดิมใช้อยู่
> แนะนำแยก commit และทดสอบ regression ก่อนไปต่อ

---

## 12. Checklist การทดสอบ

### 12.1 สิทธิ์ (สำคัญที่สุด)

- [ ] **admin** → เห็น toggle (God Mode ผ่านทุก action)
- [ ] role ที่ติ๊ก `book_for_others` ใน `role_actions` → เห็น toggle
- [ ] role ที่ไม่ติ๊ก → **ไม่เห็น toggle** และหน้าจอเหมือนเดิมเป๊ะ
- [ ] user ที่ role ไม่มีสิทธิ์ แต่ถูกเพิ่มใน `user_actions` → **เห็น** toggle
- [ ] user ที่ role มีสิทธิ์ แต่ถูกปิดใน `user_denied_actions` → **ไม่เห็น** toggle
- [ ] ผลลัพธ์ทั้ง 5 ข้อบน **ตรงกับที่เว็บแสดง** สำหรับ user คนเดียวกัน
- [ ] **ยิง API โดยตรงด้วย user ที่ไม่มีสิทธิ์** (Postman) `booking_type=group` → ต้องถูกปฏิเสธ
- [ ] แก้สิทธิ์ใน ManagePermissions → pull-to-refresh ในแอป → **เห็นผลทันทีโดยไม่ต้องล็อกอินใหม่**
- [ ] ถอนสิทธิ์ขณะผู้ใช้อยู่ในโหมด group → refresh → เด้งกลับโหมด self ไม่ค้าง

### 12.2 การจองแบบกลุ่ม

- [ ] จอง 1 คันให้คนอื่น → `car_bookings.user_id` = คนอื่น, `booked_by` = ตัวเรา
- [ ] จอง 1 คันให้ตัวเองผ่านโหมด group → `user_id` = `booked_by` = ตัวเรา
- [ ] จอง 3 คันให้ 3 คน คนละช่วงเวลา → สำเร็จทั้งหมด
- [ ] จอง 2 คันให้**คนเดียวกัน** ช่วงเวลา**ไม่ทับกัน** → สำเร็จทั้งคู่ (เว็บอนุญาต — comment บรรทัด 117)
- [ ] จอง 2 คันให้**คนเดียวกัน** ช่วงเวลา**ทับกัน** → คันที่ 2 ล้มเหลว (`createBooking` กัน)
- [ ] จองคันที่คนอื่นจองไว้แล้ว → ล้มเหลว ข้อความชัดว่าคันไหน
- [ ] สำเร็จบางส่วน → สรุปแสดงทั้ง ✅ และ ❌ ครบทุกคัน
- [ ] เบอร์โทรที่กรอกไปเขียนทับ `users.phone` ของผู้ใช้รถจริง (พฤติกรรมเดียวกับเว็บ)
- [ ] ข้อความ `<br>` จาก `createBooking` ถูกแปลงเป็นบรรทัดใหม่ ไม่โชว์ tag ดิบ

### 12.3 ไม่ทำของเดิมพัง (Regression)

- [ ] โหมด `self` จองได้เหมือนเดิมทุกกรณี
- [ ] **แอปเวอร์ชันเก่า** (ไม่ส่ง `booking_type`) ยังจองได้ → default = `self`
- [ ] ตัวกรอง "ทั้งหมด / ว่าง / ไม่ว่าง" ยังถูกต้องหลัง refactor `validateBookingConflict`
- [ ] Modal ตารางงาน (ปฏิทิน) ยังแสดงถูก
- [ ] ปุ่มคืนรถ / ยกเลิก ยังทำงาน
- [ ] คนจองแทนกดคืนรถ/ยกเลิกแทนได้ (`CarManager` รองรับแล้ว)
- [ ] **เว็บ 3 หน้า** (`CarBooking.php`, `CarDashboard.php`, `CarHistory.php`) ยังทำงานปกติหลังแก้ `CarManager`
- [ ] Dark mode ยังแสดงถูกทุก component ใหม่

### 12.4 Edge cases

- [ ] `employees` ว่าง (ไม่มีสิทธิ์) → Modal เลือกคนไม่ค้าง / ไม่ crash
- [ ] เลือกรถแล้วเปลี่ยนโหมด → `carEntries` ถูกเคลียร์ ไม่มีข้อมูลค้าง
- [ ] เลือก 10+ คัน → หน้าจอยังใช้งานได้ Modal สรุปผลไม่ล้น
- [ ] เน็ตหลุดกลางการจองกลุ่ม → ข้อความ error ชัด ไม่จองซ้ำเมื่อกดใหม่
- [ ] รถสถานะ `maintenance` → เลือกได้ (จองล่วงหน้า) พร้อมคำเตือน เหมือนโหมด self

---

## 13. ความเสี่ยงและข้อควรระวัง

### 13.1 ⚠️ API มือถือไม่มีการยืนยันตัวตน (สำคัญ)

`api_carboooking_mobile.php` ไม่มี token/session — รับ `user_id` จาก request ตรงๆ
และตั้ง `Access-Control-Allow-Origin: *`

**ผลกระทบต่องานนี้:** การเช็ค `hasActionForUser($conn, $_POST['user_id'], ...)`
กันคนที่ **ใช้แอปตามปกติ** ได้ แต่**ไม่กันคนที่ยิง request เองแล้วปลอม `user_id`**
เป็น id ของคนที่มีสิทธิ์ได้

**สรุป:** งานนี้ทำให้ระบบสิทธิ์**ตรงกับเว็บ**และกันการใช้ผิดปกติทั่วไปได้
แต่**ไม่ใช่การป้องกันระดับความปลอดภัยจริง** — ปัญหานี้มีอยู่ก่อนแล้วทั้งระบบ (ทุก action ในไฟล์นี้)
ควรทำเป็นงานแยก: เพิ่ม token ตอน login แล้วให้ทุก action ตรวจ token

> ควรบันทึกเรื่องนี้แจ้งผู้เกี่ยวข้อง ไม่ควรปล่อยผ่านเงียบๆ

### 13.2 SQL Injection ที่ค้างอยู่ (ไม่ได้เกิดจากงานนี้)

| ไฟล์ | จุด |
|---|---|
| `api_carboooking_mobile.php` | `$m_sql .= " AND m.vehicle_id = '$f_car_id'"` และอีก 3 บรรทัด (ตัวกรอง `d`/`m`/`y`) |
| `api_mobile.php` | `get_menus`: `WHERE role_name = '$safe_role'` (มี `real_escape_string` — พอใช้ได้แต่ไม่ใช่ prepared) |
| `CarHistory.php` | ตัวกรองทั้งหมดต่อสตริง |
| `CashFlow.php` | `$date_condition` ต่อสตริงจาก `$_GET` |
| `CarBooking.php` | `$check_sql` โหมด self ต่อสตริง |

**ขั้นต่ำที่ต้องทำในงานนี้:** โค้ดใหม่ทุกบรรทัด**ต้องใช้ prepared statement**
ห้ามเพิ่มจุดใหม่ (เฉพาะ `hasActionForUser` ที่รับ `user_id` จากภายนอกโดยตรง ยิ่งต้องเข้ม)

### 13.3 ความไม่ตรงกันของฟอร์แมต `return_note`

| ที่มา | ฟอร์แมต |
|---|---|
| เว็บ | `📍 จอดที่: X \| 🔋 พลังงาน: Y \| ⚡ เสียบชาร์จอยู่ \| ⚠️ หมายเหตุ: Z` |
| แอป | `จอดที่: X \| พลังงานคงเหลือ: Y \| ปัญหา: Z` |

`cleanNoteText()` ในแอป (`CarBooking.tsx` บรรทัด 118) เขียน regex รองรับ**ทั้งสองแบบ**อยู่แล้ว
(มี `พลังงาน(คงเหลือ)?` และ `(ปัญหา|หมายเหตุ)`) → **ยังไม่พังตอนนี้**

แต่ถ้าแก้ฝั่งใดฝั่งหนึ่ง **ต้องตรวจ `cleanNoteText()` และ `$last_energy`/`$is_charging_status`
ใน `CarDashboard.php` ด้วย** เพราะเว็บ parse ข้อความนี้ไปแสดงบนการ์ดรถ
→ **แนะนำเก็บงานนี้ไว้ทำท้ายสุด (ขั้น 12) แยก commit**

### 13.4 `passenger_count` ถูก fix ที่ 1

ทั้งเว็บ (`CarBooking.php` บรรทัด 238) และโหมด group (บรรทัด 174) ส่ง `1` เสมอ
→ ทำเหมือนกัน ไม่ต้องเพิ่ม UI (ถ้าจะเพิ่มควรทำทั้งเว็บและแอปพร้อมกัน)

### 13.5 Timezone

- `CarManager` ตั้ง `SET time_zone = '+07:00'` ทุกครั้งที่ new
- เว็บทุกไฟล์ตั้ง `date_default_timezone_set('Asia/Bangkok')`
- **`api_carboooking_mobile.php` ไม่ได้ตั้ง** → พึ่ง default ของ php.ini
- แอปส่งเวลาจาก `Date` ของเครื่องผู้ใช้ (`formatDT()` ใช้ local time)

**⚠️ ควรเพิ่ม `date_default_timezone_set('Asia/Bangkok')` ในไฟล์ API มือถือ**
เพราะ `returnCar()` ใช้ `time()` และ `NOW()` คำนวณความล่าช้า — timezone เพี้ยนแล้วคำนวณผิด

### 13.6 การเทียบ id string vs number

`api_mobile.php` login cast id เป็น string (`(string)$row['id']`) → `user.id` ในแอปเป็น **string**
แต่ `car_bookings.user_id` ที่ API ส่งกลับอาจเป็น number
→ **ใช้ `String(a) === String(b)` หรือ `==` เสมอเมื่อเทียบ id** (ดู §9.9)

### 13.7 `getAllEmployees()` คืนพนักงานทุกคน

รวมคนที่ลาออก/ปิดบัญชี (ถ้ามี) เพราะ query คือ `SELECT id, fullname, phone FROM users` ไม่มีเงื่อนไข
→ ถ้าตาราง `users` มีคอลัมน์สถานะ (เช่น `is_active`) อาจควรกรอง
**แต่ถ้ากรองในแอปแต่เว็บไม่กรอง จะไม่ตรงกัน** → ถ้าจะทำ ควรแก้ที่ `CarManager` ให้ตรงกันทั้งคู่

---

## 14. ประเด็นที่ต้องตัดสินใจ — ✅ ตัดสินใจแล้ว

ทั้ง 7 ข้อทำตามคำแนะนำในคอลัมน์ขวาของแผนเดิม

| # | คำถาม | สิ่งที่ทำจริง |
|:--:|---|---|
| 1 | ชื่อ `action_code` ตรงเป๊ะไหม? | ✅ **ยืนยันด้วย SQL แล้ว** — `book_for_others` (id 39, `page_id` → `CarBooking.php`) ไม่ต้อง `INSERT` เพิ่ม |
| 2 | วาง `hasActionForUser()` ที่ไหน? | **(ก)** ไฟล์ใหม่ `mobile_permissions.php` — API มือถืออื่นเรียกใช้ต่อได้ |
| 3 | เขียนทับ `users.phone` ของผู้ใช้รถไหม? | **(ก) ทับ** เหมือนเว็บ (เฉพาะคันที่จองสำเร็จ) |
| 4 | วัน-เวลาแยกทุกคัน หรือมีปุ่ม copy? | **(ข)** แยกรายคัน + ปุ่ม "ใช้เวลาเดียวกันทุกคัน (N)" ในฟอร์มหลัก |
| 5 | หลังจองสำเร็จ กลับโหมด self ไหม? | **(ข) คงโหมด group** และ**เคลียร์เฉพาะคันที่จองสำเร็จ** — คันที่ล้มเหลวคงข้อมูลไว้ให้แก้แล้วยิงซ้ำ |
| 6 | จำกัดจำนวนคันต่อครั้งไหม? | **(ก)** ไม่จำกัดใน UI + guard ฝั่ง API ที่ **50 รายการ** กัน payload ผิดปกติ |
| 7 | แก้ `allowed_pages` ด้วยไหม? | **แยกงาน** — ยังไม่แตะ (bug เดิมที่มีอยู่แล้ว) |

### 14.1 สิ่งที่ทำเพิ่มจากแผนเดิม

| รายการ | เหตุผล |
|---|---|
| แก้ `cleanNoteText()` ทั้ง 2 ไฟล์ ให้ลบ emoji นำหน้า (📍 🔋 ⚡ ⚠️) ก่อน parse | **พบบั๊กที่มีอยู่เดิม** — §13.3 เข้าใจผิดว่ารองรับ 2 ฟอร์แมตแล้ว จริงๆ โน้ตจากเว็บถูก clean ไม่หมด เหลือ `"📍  ⚡   ยางแบน"` ค้างบนจอ |
| `return_car` แปลง `เสียบชาร์จอยู่` ที่ปนมาใน `car_issue` ของแอปเวอร์ชันเก่า ออกเป็น `is_charging` | ไม่ให้เกิด `⚠️ หมายเหตุ:` ว่างเปล่าในโน้ต และแอปเก่ายังใช้งานได้ |
| ครอบ `message` ของ `CustomAlertModal` ด้วย `ScrollView` (สูงสุด 260px) | สรุปผลจอง 5-6 คันเคยล้นจอ (§9.7) |
| ในโหมด group รถที่เลือกไว้ **ไม่หายไป**เวลาสลับตัวกรอง ว่าง/ไม่ว่าง | กัน UX สะดุด — เห็นการ์ดรายละเอียดด้านล่างแต่หาการ์ดรถที่กดเลือกไม่เจอ |
| การ์ดรถที่เลือกในโหมด group เช็คคิวชนด้วย**ช่วงเวลาของคันนั้นเอง** | ป้าย ว่าง/ไม่ว่าง ต้องตรงกับเวลาที่ผู้ใช้ตั้งให้คันนั้น ไม่ใช่ค่าเริ่มต้น |
| ข้อความ `"คุณมีการจองรถคันอื่น..."` ถูก map เป็น `"{ชื่อผู้ใช้รถ} มีการจองรถคันอื่น..."` | ในบริบทจองแทน คำว่า "คุณ" หมายถึงผู้ใช้รถ ไม่ใช่คนกดจอง (§8.3.4) |
| ข้อความยืนยันคืนรถ/ยกเลิกระบุชื่อผู้ใช้รถเมื่อเป็นการจองแทน | §9.10 — กันกดผิด |

---

## 15. ภาคผนวก: อ้างอิงโค้ดสำคัญ

### 15.1 `CarManager::createBooking()` — ไม่ต้องแก้

```php
// CarManager.php บรรทัด 222
public function createBooking(
    $user_id, $car_id, $start, $end, $dest, $reason,
    $passengers = 1,
    $booked_by = null          // ✅ รองรับแล้ว — API มือถือแค่ต้องส่งมา
)
```

ตรวจซ้อน 2 ชั้นด้วย prepared statement:
1. **รถชน** — `car_id = ? AND status IN ('active','approved','pending') AND (start_date < ? AND end_date > ?)`
2. **คนชน** — `user_id = ?` ด้วยเงื่อนไขเดียวกัน

สถานะที่สร้าง = `'approved'` (ไม่ใช่ `pending` — ไม่มีขั้นอนุมัติ)

### 15.2 `CarManager::getMyUpcomingBookings()` — ไม่ต้องแก้

```php
// CarManager.php บรรทัด 536 — รองรับการจองแทนครบแล้ว
WHERE (b.user_id = ? OR b.booked_by = ?)
  AND b.status IN ('active', 'approved', 'pending')
```

SELECT มี `driver.fullname AS driver_name` และ `booker.fullname AS booker_name` แล้ว
→ **ข้อมูลสำหรับ badge §9.9 พร้อมใช้ ไม่ต้องแก้อะไรฝั่ง backend**

### 15.3 ตำแหน่งบรรทัดที่ต้องแก้ (อ้างอิงเร็ว)

| ไฟล์ | บรรทัด | สิ่งที่อยู่ตรงนั้น |
|---|---|---|
| `api_carboooking_mobile.php` | ~29 | เริ่ม `get_booking_data` — เพิ่ม 2 field ท้าย response |
| `api_carboooking_mobile.php` | ~89 | เริ่ม `book_car` — แยกโหมด |
| `api_carboooking_mobile.php` | ~110 | `createBooking(...)` 7 พารามิเตอร์ — เพิ่มตัวที่ 8 |
| `api_carboooking_mobile.php` | ~150 | เริ่ม `get_car_dashboard_data` — map `booker_name` |
| `CarBooking.tsx` | 425 | `validateBookingConflict` — refactor รับพารามิเตอร์ |
| `CarBooking.tsx` | 443 | `filteredCars` useMemo — กระทบจากข้อบน |
| `CarBooking.tsx` | 595 | `fetchData` — อ่าน field ใหม่ |
| `CarBooking.tsx` | 658 | `showPicker` — ขยายรับ `carId` |
| `CarBooking.tsx` | 674 | `handleDateChange` — เขียนลง `carEntries` |
| `CarBooking.tsx` | 715 | `submitBooking` — เพิ่ม `submitGroupBooking` ข้างๆ |
| `CarBooking.tsx` | 787 | `handleBookingPress` — แยก 2 ทาง |
| `CarBooking.tsx` | 1582 | `handlePressCar` — multi-select |
| `CarBooking.tsx` | 1812 | `renderActiveBookings` — เพิ่ม badge |
| `CarBooking.tsx` | 1982 | หัว `formCard` — วาง toggle |
| `CarDashboard.tsx` | 1275 | `userName` ใน `renderDetailModal` — เปลี่ยนป้าย |
| `CarManager.php` | 30 | `getCarSchedules()` SQL — เพิ่ม `booked_by` (ถ้าเลือกทาง A) |

### 15.4 ข้อความภาษาไทยที่ต้องใช้ (ให้ตรงกับเว็บ)

```
"คุณไม่มีสิทธิ์จองรถให้คนอื่น กรุณาติดต่อผู้ดูแลระบบ"
"กรุณาเลือกรถอย่างน้อย 1 คัน และระบุผู้ใช้รถ"
"กรุณากรอก ผู้ใช้รถ, เบอร์โทร, วัน-เวลา, สถานที่ และภารกิจ ให้ครบทุกคันที่เลือก"
"วัน-เวลาคืนรถของแต่ละคัน ต้องหลังจากเวลารับรถ"
"จองรถสำเร็จ {N} คัน!"
"จองสำเร็จบางส่วน"
"จองไม่สำเร็จ:"
"คุณจองให้: {ชื่อ}"
"จองให้คุณโดย: {ชื่อ}"
```

---

## สรุปสั้น

| ประเด็น | คำตอบ |
|---|---|
| **แก้กี่ไฟล์** | 3 ไฟล์หลัก (`api_carboooking_mobile.php`, `CarBooking.tsx`, `CarDashboard.tsx`) + `CarManager.php` เล็กน้อย (optional) |
| **ต้อง migrate DB ไหม** | ไม่ (`booked_by` มีแล้ว) — แค่ตรวจว่ามีแถวใน `master_actions` |
| **ต้องแตะ AuthContext ไหม** | ไม่ (ตั้งใจเลี่ยง เพื่อให้แก้สิทธิ์เห็นผลทันที) |
| **งานหนักที่สุด** | UI ฟอร์มรายคันใน `CarBooking.tsx` (§9.5) |
| **จุดเสี่ยงที่สุด** | refactor `validateBookingConflict` (§9.6) และแก้ `getCarSchedules` (§8.4) |
| **สิ่งที่ต้องยืนยันก่อนเริ่ม** | ชื่อ `action_code` ใน `master_actions` (§7.1) |
