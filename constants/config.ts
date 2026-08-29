// ═══════════════════════════════════════════════════════════════
//  ปลายทาง API — สลับที่บรรทัดเดียว
// ═══════════════════════════════════════════════════════════════
//
//  true   → เซิร์ฟเวอร์จริง  (ค่าตั้งต้น · ใช้ได้เลยไม่ต้องตั้งอะไร)
//  false  → เครื่อง dev ในออฟฟิศ (ต้องเปิด XAMPP + แก้ DEV_HOST เป็น IP เครื่องตัวเอง)
//
//  ⚠️ เวลา push ขึ้น git ให้ค่านี้เป็น true เสมอ
//     ถ้าแก้ DEV_HOST เป็น IP เครื่องตัวเอง อย่า commit บรรทัดนั้นขึ้นไป
//     (เป็นค่าเฉพาะเครื่อง คนอื่นใช้ไม่ได้)
//
// ═══════════════════════════════════════════════════════════════

const USE_PRODUCTION = true;

/** เซิร์ฟเวอร์จริง — ไฟล์อยู่ที่ root ของโดเมน ไม่มีโฟลเดอร์คั่น */
const PROD_HOST = "https://tjcgroup.tjc.co.th";

/** เครื่อง dev ในออฟฟิศ — โฟลเดอร์ชื่อ tjc-api-server
 *  แก้ IP ให้ตรงกับเครื่องที่รัน XAMPP (ดูด้วย ipconfig)
 *  ห้ามใช้ localhost เพราะมือถือจะวิ่งกลับเข้าหาตัวเอง
 *  มือถือกับคอมต้องอยู่ Wi-Fi วงเดียวกัน */
const DEV_HOST = "http://192.168.0.177/tjc-api-server";

// ───────────────────────────────────────────────────────────────

/** ฐาน URL ของ API ทั้งหมด — ไม่ต้องใส่ / ปิดท้าย */
export const API_BASE = USE_PRODUCTION ? PROD_HOST : DEV_HOST;

/** โฟลเดอร์ไฟล์แนบ/รูป — API คืนมาแค่ชื่อไฟล์ ต้องเอามาต่อเอง
 *  เช่น `${IMG_BASE_URL}/payment_slips/${filename}` */
export const IMG_BASE_URL = `${API_BASE}/uploads`;

/** กระดานงานผู้บริหาร */
export const API_TASKS_URL = `${API_BASE}/api_tasks.php`;

/** 5 โมดูลใหม่ — ต่อท้ายด้วยชื่อไฟล์
 *  เช่น `${API_MODULES}/accounting_API_mobile.php?action=get_list&user_id=1` */
export const API_MODULES = `${API_BASE}/mobile_api/modules`;
