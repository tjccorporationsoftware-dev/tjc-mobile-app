/**
 * guarantee_tracking_cash.tsx — ติดตามค้ำเงินสด (ดูข้อมูลอย่างเดียว)
 * ------------------------------------------------------------------
 * พอร์ตจากหน้าเว็บ guarantee_tracking_cash.php (เมนู: เงินสดค้ำ › ติดตามค้ำเงินสด)
 * หน้าตา/ตัวกรองใช้ชุดเดียวกับ guarantee_tracking.tsx (GuaranteeTrackingView variant="cash")
 * ข้อมูลจาก tjc-api/mobile_api/modules/lg_API_mobile.php?action=get_cash_tracking
 * ------------------------------------------------------------------
 */

import { GuaranteeTrackingView } from './guarantee_tracking';

export default function GuaranteeTrackingCashScreen() {
  return <GuaranteeTrackingView variant="cash" />;
}
