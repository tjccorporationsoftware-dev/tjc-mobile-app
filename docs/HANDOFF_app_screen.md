# คู่มือส่งต่องาน: สร้างหน้าจอในแอปมือถือ (React Native)

> สำหรับกรณี **API ฝั่ง PHP ทำเสร็จแล้ว** น้องมีหน้าที่ทำหน้าจอในแอปมาต่อเท่านั้น
> อ่านให้จบก่อนเขียนโค้ดบรรทัดแรก

---

## 0. เข้าใจก่อน 3 ข้อ

1. แอปนี้เป็น **ตัววาดหน้าจอ** อย่างเดียว — ตรรกะ การคำนวณ สิทธิ์ อยู่ฝั่ง PHP หมดแล้ว
   **ห้ามคำนวณตัวเลขสรุป/ตัดสินสิทธิ์เองในแอป** ถ้าข้อมูลไม่พอให้บอกพี่ไปเพิ่มใน API
2. ทุกหน้าจอ = **1 ไฟล์จบ** ยาว 500–4,000 บรรทัด ไม่มีการแชร์คอมโพเนนต์กัน
   → **วิธีทำงานคือก๊อปหน้าที่ใกล้เคียงที่สุดมาแก้** ไม่ใช่พยายามสร้างตัวกลางใหม่
3. โค้ดในแอปคุยกับ PHP แค่ 2 ท่าเท่านั้น (ดู §2) นอกนั้นเป็นงาน UI ล้วน

---

## 1. ของที่พี่ส่งให้ก่อนเริ่มงาน — ถ้าไม่ครบ ให้ทวง

พี่จะกรอกใบนี้ให้ **1 ใบต่อ 1 หน้าจอ** ถ้าขาดข้อไหน **อย่าเดาเอง ให้ถาม**

| # | หัวข้อ | ตัวอย่าง |
|---|---|---|
| 1 | ชื่อหน้าจอ + ชื่อไฟล์ที่จะสร้าง | `รายงานคลังสินค้า` → `app/(tabs)/WarehouseReport.tsx` |
| 2 | ชื่อไฟล์ `.php` ฝั่งเว็บ (ใช้เช็คสิทธิ์) | `warehouse_dashboard.php` |
| 3 | ลงทะเบียนใน `master_pages` แล้วหรือยัง | ✅ ลงแล้ว |
| 4 | URL + `action` สำหรับ **อ่าน** ข้อมูล | `api_mobile.php?action=get_warehouse_list&user_id=xx` |
| 5 | URL + `action` สำหรับ **เขียน** ข้อมูล (ถ้ามี) | `api_mobile.php?action=save_warehouse` |
| 6 | **ตัวอย่าง JSON จริงที่ API คืนมา** (คัดลอกมาแปะ) | `{"status":"success","list":[{...}]}` |
| 7 | ช่องไหนบังคับกรอก / ช่องไหนไม่บังคับ | `qty` บังคับ, `note` ไม่บังคับ |
| 8 | หน้าเว็บต้นแบบให้ดูหน้าตา | `http://.../warehouse_dashboard.php` |
| 9 | user/password ทดสอบ (ที่ **ไม่ใช่ admin**) | `test_staff` / `1234` |

> ข้อ 6 สำคัญที่สุด — **ห้ามเริ่มเขียนหน้าจอโดยยังไม่เห็น JSON จริง** เพราะชื่อคีย์ต้องตรงเป๊ะ

---

## 2. สองท่าที่ใช้คุยกับ PHP (ทั้งแอปมีแค่นี้)

### ท่าที่ 1 — อ่านข้อมูล

```tsx
const [items, setItems] = useState<any[]>([]);
const [loading, setLoading] = useState(true);
const [refreshing, setRefreshing] = useState(false);

const fetchData = async () => {
  try {
    if (!refreshing) setLoading(true);
    const res = await axios.get(
      `${API_BASE}/api_mobile.php?action=get_warehouse_list&user_id=${user?.id}`,
    );
    if (res.data.status === "success") {
      setItems(res.data.list || []);
    }
  } catch (e) {
    showAlert("error", "ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อข้อมูลได้");
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
};

useFocusEffect(useCallback(() => { if (user?.id) fetchData(); }, [user?.id]));
```

ต้นแบบจริง: [DriverConfirmItems.tsx:56](../app/(tabs)/DriverConfirmItems.tsx#L56) · [CarBooking.tsx:726](../app/(tabs)/CarBooking.tsx#L726)

### ท่าที่ 2 — เขียนข้อมูล

```tsx
const fd = new FormData();
fd.append("user_id", String(user?.id));
fd.append("qty", qty);
fd.append("note", note);

// ถ้ามีรูป
fd.append("photo[]", { uri, name: `img_${Date.now()}.jpg`, type: "image/jpeg" } as any);

const res = await axios.post(`${API_BASE}/api_mobile.php?action=save_warehouse`, fd, {
  headers: { "Content-Type": "multipart/form-data" },
});

if (res.data.status === "success") {
  showAlert("success", "สำเร็จ", "บันทึกเรียบร้อย", false, () => fetchData());
} else {
  showAlert("warning", "แจ้งเตือน", res.data.message || "บันทึกไม่สำเร็จ");
}
```

ต้นแบบจริง: [DriverConfirmItems.tsx:290](../app/(tabs)/DriverConfirmItems.tsx#L290)

**⚠️ 3 กับดักที่พลาดกันทุกคน**

1. **`action` ต้องอยู่ใน URL เสมอ แม้เป็น POST** — `api_mobile.php` อ่าน `$_GET['action']` อย่างเดียว
   ถ้าไป `fd.append("action", ...)` จะไม่เข้าเงื่อนไขไหนเลย ได้หน้าเปล่าโดยไม่มี error
2. **ไฟล์หลายรูปต้องมี `[]` ต่อท้ายชื่อ** — `fd.append("photo[]", ...)` ฝั่ง PHP ถึงจะอ่านเป็น array ได้
3. **บันทึกเสร็จต้อง `fetchData()` ใหม่เสมอ** ไม่งั้นหน้าจอยังเป็นข้อมูลเก่า

---

## 3. สร้างหน้าใหม่ = แก้ 3 ที่ + 1 แถวใน DB

ขาดข้อไหนข้อหนึ่ง เมนูจะไม่ขึ้น

**1) สร้างไฟล์** `app/(tabs)/WarehouseReport.tsx`

**2) เพิ่ม `<Drawer.Screen>`** ใน [app/(tabs)/_layout.tsx](../app/(tabs)/_layout.tsx)

```tsx
<Drawer.Screen
  name="WarehouseReport"
  options={getDrawerOptions("รายงานคลัง", "cube-outline", "warehouse_dashboard.php")}
/>
```
พารามิเตอร์ตัวที่ 3 คือ **ชื่อไฟล์ `.php` ฝั่งเว็บ** ใช้เช็คสิทธิ์ ต้องตรงกับที่ลงใน `master_pages`

**3) เพิ่มชื่อ route ใน `MENU_GROUPS`** (บนสุดของไฟล์เดียวกัน บรรทัด 33)

```tsx
{
  id: "work_report_group",
  title: "หมวดรายงานการทำงาน",
  items: ["write_report", "PurchaseReport", "WarehouseReport"],   // ← เติมตรงนี้
},
```
เมนูจะโผล่**เฉพาะ route ที่มีชื่ออยู่ใน `MENU_GROUPS`** ใส่ `<Drawer.Screen>` อย่างเดียวไม่พอ

**4) แถวใน DB** — พี่ลงให้แล้ว (ข้อ 3 ของใบส่งงาน) ถ้ายังไม่ได้ลง จะเห็นเมนูเฉพาะ admin

> **ทดสอบสิทธิ์:** แก้สิทธิ์ใน `ManagePermissions.php` แล้ว **ต้อง logout–login ใหม่ในแอป** ถึงจะเห็นผล
> เพราะ `allowed_pages` ถูกเก็บลงเครื่องตอน login ครั้งเดียว — ไม่ใช่บั๊ก

---

## 4. กติกาการเขียน (ทำตามของเดิม อย่าคิดเอง)

| เรื่อง | ทำยังไง |
|---|---|
| สี / ธีม | ประกาศ `const COLORS = { light: {...}, dark: {...} }` ในไฟล์ตัวเอง + `useColorScheme()` |
| ❌ ห้ามใช้ | `constants/Colors.ts` และ `components/Themed.tsx` — เป็นไฟล์เทมเพลตที่ทิ้งไว้ ไม่มีใครใช้ |
| สไตล์ | `StyleSheet.create` ท้ายไฟล์ |
| ไอคอน | `lucide-react-native` (หน้าใหม่) หรือ `@expo/vector-icons` (ตามหน้าที่ก๊อปมา) |
| URL | `import { API_BASE } from "../../constants/config"` **ห้ามพิมพ์ URL ลงในไฟล์หน้าจอเด็ดขาด** |
| รูปจาก server | `IMG_BASE_URL` + ชื่อไฟล์ที่ API ส่งมา |
| ข้อมูล user | `import { useAuth } from "../_layout"` → `const { user } = useAuth()` |
| แจ้งเตือน | ทำ `showAlert()` + `<Modal>` ในไฟล์ตัวเอง (ก๊อปจากหน้าอื่น) — ไม่ใช้ `Alert.alert` ในหน้าใหม่ |
| ดึงลงรีเฟรช | `<RefreshControl refreshing={refreshing} onRefresh={...} />` |
| วันที่ | รับ-ส่งเป็น `YYYY-MM-DD` เสมอ **แสดงผลเป็น พ.ศ. (ปี + 543)** |
| ข้อความ | ภาษาไทยทั้งหมด รวมคอมเมนต์ |

**ก๊อปหน้าไหนดี**
- หน้ารายการอ่านอย่างเดียว → [DriverTasks.tsx](../app/(tabs)/DriverTasks.tsx) (553 บรรทัด สั้นสุด)
- หน้าฟอร์ม + อัปโหลดรูป → [correspondence_book.tsx](../app/(tabs)/correspondence_book.tsx) (1,334 บรรทัด)
- หน้าแดชบอร์ด/สถิติ → [correspondence_dashboard.tsx](../app/(tabs)/correspondence_dashboard.tsx)

---

## 5. วิธีรันและทดสอบ

```bash
npm install
npm start          # แล้วสแกน QR ด้วยแอป Expo Go
```

- แก้ `API_BASE` ใน [constants/config.ts](../constants/config.ts) ให้เป็น **IP ของเครื่องที่รัน XAMPP** (ห้ามใช้ `localhost`)
- มือถือกับคอมต้องอยู่ **Wi-Fi วงเดียวกัน**
- ทดสอบ API เปล่า ๆ ก่อนได้ที่จอ [app/test-api.tsx](../app/test-api.tsx)
- ⚠️ **`constants/config.ts` ห้าม commit ขึ้น git** ถ้าแก้เป็น IP เครื่องตัวเอง (ไฟล์นี้ถูกสลับไปมาระหว่าง IP dev กับ production)

---

## 6. ถือว่างานเสร็จเมื่อ (Definition of Done)

1. เปิดหน้าจอแล้วข้อมูลขึ้นครบ **ตรงกับหน้าเว็บต้นแบบ**
2. **ดึงลงรีเฟรชได้** และกลับเข้าหน้าใหม่แล้วข้อมูลอัปเดต
3. ตอนกำลังโหลดมี `ActivityIndicator` ไม่ใช่จอขาวเปล่า
4. **ไม่มีข้อมูลก็ต้องไม่พัง** — ขึ้นข้อความ "ไม่พบข้อมูล" แทน
5. **เน็ตหลุดแล้วไม่พัง** — ขึ้นแจ้งเตือน ไม่ใช่จอแดง
6. ทดสอบด้วย user ที่ **ไม่ใช่ admin** แล้วเห็น/ไม่เห็นเมนูถูกต้อง
7. ลองทั้ง **โหมดสว่างและมืด** (สลับที่ตั้งค่าเครื่อง) ตัวหนังสือต้องอ่านออกทั้งคู่
8. ทดสอบบน **มือถือจริง** ไม่ใช่แค่ emulator

---

## 7. ห้ามทำ (ถามพี่ก่อน)

- ❌ **ห้ามแก้ไฟล์ PHP** — ถ้าข้อมูลไม่พอ/ผิด ให้แจ้งพี่ อย่าไปแก้เอง
- ❌ **ห้ามแก้ [app/_layout.tsx](../app/_layout.tsx)** (ระบบล็อกอิน) — พังทั้งแอป
- ❌ **ห้ามแตะหน้าจออื่นที่ไม่ใช่ของตัวเอง** แม้จะเห็นว่าโค้ดซ้ำกันน่ารวบ
- ❌ **ห้ามลงไลบรารีใหม่** (`npm install`) โดยไม่ถาม
- ❌ **ห้ามฮาร์ดโค้ด URL / IP / ชื่อคน / user_id** ลงในโค้ด
- ❌ **ห้ามพยายามแยกคอมโพเนนต์ร่วม / รีแฟกเตอร์โค้ดเดิม** — งานนี้คือทำหน้าใหม่ให้เสร็จ

---

## 8. งานแรกที่ได้รับมอบหมาย

> พี่กรอกใบ §1 แนบมากับเอกสารนี้

- **หน้าจอ:** ______________________
- **ไฟล์ที่ต้องสร้าง:** `app/(tabs)/____________.tsx`
- **หน้าให้ก๊อปเป็นแบบ:** ______________________
- **กำหนดส่ง:** ______________
