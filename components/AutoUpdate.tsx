import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

// ------------------------------------------------------
// อัปเดต OTA (EAS Update) แบบเงียบอัตโนมัติ — ไม่มีป๊อปอัป ไม่ต้องกด
// ------------------------------------------------------
// 1. เปิดแอปใหม่ (cold start): native เช็ค + โหลดเอง (checkAutomatically ค่าตั้งต้น ON_LOAD)
//    และรอได้ไม่เกิน fallbackToCacheTimeout ใน app.json — โหลดทันก็เข้าเวอร์ชันใหม่เลย
// 2. โหลดไม่ทัน / เจอตัวใหม่ระหว่างใช้งาน → รีสตาร์ทเองเฉพาะ "ช่วงปลอดภัย" (SAFE_WINDOW_MS)
//    - ช่วงแรกหลังเปิดแอป (ยังอยู่หน้าล็อก/หน้าแรก ยังไม่ได้ทำอะไร)
//    - ช่วงแรกหลังกลับเข้าแอปที่ทิ้งไว้เบื้องหลังนาน (LONG_AWAY_MS)
//    นอกช่วงนี้ไม่รีสตาร์ท (กันฟอร์มที่กรอกค้าง/สลับไปถ่ายรูปแล้วหาย) — ได้เองตอนเปิดแอปครั้งหน้า
// - ปล่อยอัปเดต: eas update --channel production --message "..."
//   ส่งถึงเฉพาะ build ที่ runtimeVersion ตรงกัน (policy appVersion = "version" ใน app.json)
//   ⚠️ เพิ่ม/อัปเกรด native (แพ็กเกจที่มีโค้ด native, plugin ใน app.json, อัปเกรด SDK) ต้องขึ้น version ใหม่ + build ใหม่
// - Expo Go / dev ไม่ทำงาน (Updates.isEnabled = false)

const SAFE_WINDOW_MS = 15 * 1000;
const LONG_AWAY_MS = 30 * 60 * 1000;
const CHECK_EVERY_MS = 15 * 60 * 1000;

const RELOAD_SCREEN = {
  backgroundColor: "#ffffff",
  spinner: { enabled: true, color: "#1d4ed8", size: "large" as const },
  fade: true,
};

export function AutoUpdate() {
  const { isUpdatePending } = Updates.useUpdates();
  const isPendingRef = useRef(isUpdatePending);
  isPendingRef.current = isUpdatePending;
  // ตอนเปิดแอป native เช็คไปแล้ว นับจากตอนนี้ · ช่วงปลอดภัยแรก = ตอนเปิดแอป
  const lastCheckRef = useRef(Date.now());
  const safeUntilRef = useRef(Date.now() + SAFE_WINDOW_MS);
  const bgAtRef = useRef<number | null>(null);
  const reloadingRef = useRef(false);

  // อ่านแต่ ref — เรียกจาก listener ใน useEffect([]) ได้โดยไม่ติดค่าเก่า
  const reloadIfSafe = useRef(() => {
    if (reloadingRef.current || Date.now() > safeUntilRef.current) return;
    reloadingRef.current = true;
    Updates.reloadAsync({ reloadScreenOptions: RELOAD_SCREEN }).catch(() => {
      reloadingRef.current = false;
    });
  }).current;

  useEffect(() => {
    if (isUpdatePending) reloadIfSafe();
  }, [isUpdatePending, reloadIfSafe]);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    const sub = AppState.addEventListener("change", async (next) => {
      if (next === "background") {
        bgAtRef.current = Date.now();
        return;
      }
      if (next !== "active") return;
      const away = bgAtRef.current ? Date.now() - bgAtRef.current : 0;
      bgAtRef.current = null;
      if (away >= LONG_AWAY_MS) safeUntilRef.current = Date.now() + SAFE_WINDOW_MS;

      // โหลดค้างไว้แล้วจากรอบก่อน → กลับมานานพอก็รีสตาร์ทได้เลย ไม่ต้องเช็คใหม่
      if (isPendingRef.current) {
        reloadIfSafe();
        return;
      }
      if (away < LONG_AWAY_MS && Date.now() - lastCheckRef.current < CHECK_EVERY_MS) return;
      lastCheckRef.current = Date.now();
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) await Updates.fetchUpdateAsync(); // เสร็จแล้ว isUpdatePending → effect ด้านล่าง
      } catch {
        // เน็ตหลุด / โดน rate limit — รอบหน้าค่อยเช็คใหม่
      }
    });
    return () => sub.remove();
  }, [reloadIfSafe]);

  return null;
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// ป้ายเวอร์ชันบอกว่าเครื่องนี้รันอัปเดตตัวไหนอยู่ เช่น "เวอร์ชัน 1.0.0 · อัปเดต 27 ต.ค. 69 14:30"
// (ตัวที่ฝังมากับ build = ไม่มีส่วน "อัปเดต") — ไว้เช็คว่าอัปเดตลงเครื่องแล้วหรือยัง
export function appVersionLabel(version?: string) {
  let label = `เวอร์ชัน ${version || "-"}`;
  const d = Updates.createdAt;
  if (Updates.isEnabled && !Updates.isEmbeddedLaunch && d) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    label += ` · อัปเดต ${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)} ${hh}:${mm}`;
  }
  return label;
}
