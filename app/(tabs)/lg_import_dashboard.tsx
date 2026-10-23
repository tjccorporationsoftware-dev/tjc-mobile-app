/**
 * lg_import_dashboard.tsx — แดชบอร์ดหนังสือค้ำประกัน (ชุดนำเข้า) — ดูข้อมูลอย่างเดียว
 * ------------------------------------------------------------------
 * พอร์ตจากหน้าเว็บ lg_import_dashboard.php (เมนู: ขออนุมัติหนังสือค้ำ › หนังสือค้ำฯ (ชุดนำเข้า))
 * หน้าตา/สูตร KPI/ตัวกรองใช้ชุดเดียวกับ lg_dashboard.tsx (LgDashboardView variant="import")
 * ข้อมูลจาก lg_API_mobile.php?action=get_import_dashboard — สเปกใน docs/LG_Dashboard_API_Spec.md
 * ------------------------------------------------------------------
 */

import { LgDashboardView } from './lg_dashboard';

export default function LgImportDashboardScreen() {
  return <LgDashboardView variant="import" />;
}
