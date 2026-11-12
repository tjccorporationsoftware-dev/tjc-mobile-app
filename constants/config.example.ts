// ═══════════════════════════════════════════════════════════════
//  แม่แบบ config.ts — ปลายทาง API
// ═══════════════════════════════════════════════════════════════
//
//  constants/config.ts ไม่อยู่ใน git (อยู่ใน .gitignore) — แต่ละเครื่องมีของตัวเอง
//  เครื่องใหม่ / clone ใหม่: คัดลอกไฟล์นี้เป็น constants/config.ts แล้วใส่ที่อยู่เซิร์ฟเวอร์จริง
//      cp constants/config.example.ts constants/config.ts
//  (ขอที่อยู่ PROD_HOST / DEV_HOST จากทีม · ห้าม commit config.ts)
//
//  EAS build ยังเอา config.ts ในเครื่องขึ้นไปด้วย เพราะ .easignore ไม่ได้ยกเว้นไฟล์นี้
//
//  true   → เซิร์ฟเวอร์จริง
//  false  → เครื่อง dev ในออฟฟิศ (ต้องเปิด XAMPP + แก้ DEV_HOST เป็น IP เครื่องที่รัน)
//
// ═══════════════════════════════════════════════════════════════

const USE_PRODUCTION = true; // true = เซิร์ฟเวอร์จริง, false = เครื่อง dev ในออฟฟิศ

/** เซิร์ฟเวอร์จริง — ไฟล์อยู่ที่ root ของโดเมน ไม่มีโฟลเดอร์คั่น */
const PROD_HOST = "https://your-production-host";

/** เครื่อง dev ในออฟฟิศ — โฟลเดอร์ชื่อ tjc-api-server
 *  แก้ IP ให้ตรงกับเครื่องที่รัน XAMPP (ดูด้วย ipconfig)
 *  ห้ามใช้ localhost เพราะมือถือจะวิ่งกลับเข้าหาตัวเอง
 *  มือถือกับคอมต้องอยู่ Wi-Fi วงเดียวกัน */
const DEV_HOST = "http://192.168.x.x/tjc-api-server";

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

/** ป้ายบอกโหมด เอาไปแสดงบนหน้าจอได้ เช่น <Text>{API_ENV_LABEL}</Text> */
export const API_ENV_LABEL = USE_PRODUCTION
  ? "เซิร์ฟเวอร์จริง"
  : "เครื่อง dev ในออฟฟิศ";

// บอกในหน้าต่าง Expo ทุกครั้งที่แอปเริ่ม/รีโหลด ว่ากำลังยิงที่ไหน
// กันพลาดแบบ "แก้ข้อมูลจริงโดยนึกว่าเป็นเครื่องทดสอบ"
console.log(
  `\n${USE_PRODUCTION ? "🔴" : "🟢"} API → ${API_ENV_LABEL}\n   ${API_BASE}\n`,
);
