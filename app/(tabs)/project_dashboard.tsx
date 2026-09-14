/**
 * ProjectDashboardScreen.tsx  (v2)
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า project_dashboard.php (Dashboard โครงการ) สำหรับแอป
 * tjc-mobile-app (Expo / React Native)
 *
 * เวอร์ชันนี้ปรับให้ตรงกับพฤติกรรมจริงหลังอ่าน:
 *  - project_dashboard_helpers.php  (pd_render_project_row / pd_compute_row_flags)
 *  - ajax_get_item_status.php       (โครงสร้างข้อมูลสถานะอุปกรณ์รายชิ้น)
 *
 * สถานะไฟล์นี้: ยังเป็น UI MOCKUP — ข้อมูลทั้งหมดเป็น MOCK_PROJECTS ด้านล่าง
 * ปุ่ม action ต่างๆ อัปเดตแค่ state ในเครื่อง ยังไม่ยิง fetch จริง
 *
 * จุดที่ตรงกับของจริง 1:1 แล้ว:
 *  - แตะที่ "ป้ายสถานะ" ของการ์ด = เปิดหน้าสถานะอุปกรณ์ (เหมือน onclick="openItemStatusModal(...)"
 *    ที่ครอบทั้งปุ่มสถานะในแถวตารางจริง ไม่ใช่ปุ่มแยก)
 *  - โครงสร้างข้อมูล item status (boq/สั่งซื้อ/รับเข้าคลัง/จัดส่ง/เคลม/สถานะ+สี) อ้างจาก
 *    response ของ ajax_get_item_status.php ตรงๆ
 *  - ฟอร์มยกเลิกโครงการบังคับกรอกเหตุผล + ปุ่ม "ดูเหตุผลที่ยกเลิก" แยกจากฟอร์มสร้างใหม่
 *    (ของจริงมี 2 ฟังก์ชันคนละตัว: cancelProject() กับ showCancelReason())
 *  - ป้ายชำระเงิน (รอชำระ/จ่ายบางส่วน/ปิดยอด) ใต้ยอดงบ, ป้ายงานประกอบ 3 สถานะ,
 *    เลขรหัสงาน (ตัด prefix ด้วย split('-')[1] แบบเดียวกับ PHP)
 *  - แถบไอคอน "จัดการ" (ดูรายละเอียด/แก้ไข/รายการสินค้า/คลังรับของ/จัดส่ง/บัญชี) มีครบ
 *    ตามของจริง แต่ยังเป็น stub เพราะแต่ละอันคือหน้าแยกทั้งหน้า (create_project.php,
 *    project_details.php, inventory_receive.php, inventory_delivery.php,
 *    project_accounting.php) — นอกขอบเขตของ "หน้าตารางหลัก" รอบนี้
 *
 * ที่ยังตัดออก (เกินขอบเขต "หน้าตารางหลักก่อน" ของรอบนี้):
 *  - popup "ดูรายละเอียด" แบบเต็ม (สัญญา/ลูกค้า/ค้ำประกัน/ผู้บันทึก ฯลฯ — ข้อมูลก้อนใหญ่มาก)
 *  - popup "หมายเหตุโครงการ" (get/save/delete_project_note)
 *  - popup ประวัติต่างๆ (ประวัติยกเลิก / ประวัติกู้คืน / ประวัติยกเลิกปิดจบ)
 *  - ระบบเรียลไทม์ / แบ่งหน้า (pagination)
 *
 * ต้องติดตั้ง (ถ้ายังไม่มีในโปรเจกต์):
 *   npx expo install @expo/vector-icons
 * ------------------------------------------------------------------
 */

import { FontAwesome5, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ Config
import { API_BASE } from '../../constants/config';
// ปรับ path นี้ให้ตรงกับตำแหน่งไฟล์จริงในโปรเจกต์ ถ้าไม่ได้วางไว้โฟลเดอร์เดียวกัน
import AccountingDashboard from './accounting_dashboard';
import CheckIncompleteProjectsScreen from './Checkincompleteproject';
import CreateProjectScreen from './createproject';
import DriverTasksScreen from './DriverTasks';
import EstimateDashboardScreen from './Estimatedashboard';
import GuaranteeTrackingScreen from './Guaranteetracking';

// ====================================================================
// Types — อิงจาก field ที่ pd_render_project_row() / pd_compute_row_flags() ใช้จริง
// ====================================================================

// หมายเหตุ: ของจริง final_status มีค่าได้หลายสิบแบบ (ขึ้นกับสต๊อก/จัดซื้อ/จัดส่งของแต่ละ
// รายการ) mockup นี้ย่อเหลือ 5 กลุ่มหลักให้พอใช้กรอง/แสดงผลบนมือถือ
type ProjectStatus = 'รอเซ็นสัญญา' | 'เซ็นสัญญา' | 'ระหว่างดำเนินการ' | 'ปิดจบหน้างาน' | 'ยกเลิก';

type AssemblyState = 'none' | 'flagged' | 'doing' | 'done'; // ตรงกับ pd_assembly_state()
type PaymentState = 'unpaid' | 'paid_partial' | 'paid_full'; // ตรงกับ $row['payment_state']

// ตรงกับ 1 แถวของ res.data ใน ajax_get_item_status.php
interface ProjectItem {
  id: number;
  itemName: string;
  boqQty: string;
  totalBuy: string;
  totalClaimBuy: string;
  totalReceive: string;
  totalDelivered: string;
  totalClaimDelivered: string;
  displayStatus: string;
  color: string;
  bg: string;
}

interface Project {
  id: number;
  code: string; // project_code เต็ม เช่น "TJC69-014"
  companyName: string;
  customerName: string;
  projectName: string;
  budget: number;
  paymentState: PaymentState;
  contractEndDateShow: string; // end_date_show ('-' ถ้าไม่มี)
  contractDaysLeft: number | null; // ผลลัพธ์เทียบเท่า $diff_c (null = ไม่มีข้อมูลสัญญา)
  contractAlertDays: number; // alert_days_before_expire (default 30 ฝั่ง backend)
  deliveryDueDate: string;
  assembly: AssemblyState;
  asmDone: number;
  asmTotal: number;
  jobType: string;
  status: ProjectStatus;
  debtOwner: string | null;
  debtIsTeam: boolean;
  projectOwner: string;
  salesIsTeam: boolean;
  hasTech: boolean; // !empty(req_tech_team) || !empty(technicians)
  techTeam?: string;
  techOnsite: boolean;
  techOnsiteBy?: string;
  isStockSite: boolean; // ซ่อนไอคอน "จัดส่งหน้างาน" ถ้า true
  canceledBy?: string;
  cancelReason?: string;
  items: ProjectItem[];
}

// ====================================================================
// Mock data — ใช้แสดงผล UI เท่านั้น ตัวเลข/ชื่อเป็นข้อมูลสมมติ
// ====================================================================

const DEBT_OWNER_OPTIONS = ['คุณสมชาย', 'คุณกานดา', 'คุณปิยะ', 'คุณวรรณา'];

function item(
  id: number,
  itemName: string,
  boqQty: string,
  totalBuy: string,
  totalReceive: string,
  totalDelivered: string,
  displayStatus: string,
  color: string,
  bg: string,
  totalClaimBuy = '0',
  totalClaimDelivered = '0'
): ProjectItem {
  return { id, itemName, boqQty, totalBuy, totalReceive, totalDelivered, displayStatus, color, bg, totalClaimBuy, totalClaimDelivered };
}

const INITIAL_PROJECTS: Project[] = [
  {
    id: 1,
    code: 'TJC69-014',
    companyName: 'บริษัท ทีเจซี กรุ๊ป จำกัด',
    customerName: 'เทศบาลนครสมมติ',
    projectName: 'ติดตั้งระบบกล้องวงจรปิดอาคาร A',
    budget: 1250000,
    paymentState: 'unpaid',
    contractEndDateShow: '30/11/2569',
    contractDaysLeft: 82,
    contractAlertDays: 30,
    deliveryDueDate: '15/10/2569',
    assembly: 'doing',
    asmDone: 3,
    asmTotal: 8,
    jobType: 'ติดตั้งระบบกล้อง',
    status: 'ระหว่างดำเนินการ',
    debtOwner: 'คุณสมชาย',
    debtIsTeam: false,
    projectOwner: 'คุณอรทัย',
    salesIsTeam: false,
    hasTech: true,
    techTeam: 'ทีมช่าง A',
    techOnsite: false,
    isStockSite: false,
    items: [
      item(1, 'กล้องวงจรปิด IP 4MP', '24', '24', '10', '0', 'คลังรับครบแล้ว', '#0d9488', '#ccfbf1'),
      item(2, 'เครื่องบันทึก NVR 32CH', '2', '2', '2', '2', 'ส่งครบแล้ว', '#059669', '#dcfce7'),
      item(3, 'สาย LAN Cat6 (ม้วน)', '18', '10', '10', '0', 'สั่งซื้อบางส่วน', '#d97706', '#fef3c7'),
    ],
  },
  {
    id: 2,
    code: 'TJC69-015',
    companyName: 'บริษัท ทีเจซี กรุ๊ป จำกัด',
    customerName: 'บริษัท สมมติ จำกัด',
    projectName: 'ปรับปรุงระบบแจ้งเตือนอัคคีภัย โซน B',
    budget: 890000,
    paymentState: 'unpaid',
    contractEndDateShow: '-',
    contractDaysLeft: null,
    contractAlertDays: 30,
    deliveryDueDate: '05/09/2569',
    assembly: 'none',
    asmDone: 0,
    asmTotal: 0,
    jobType: 'ระบบแจ้งเตือนไฟไหม้',
    status: 'รอเซ็นสัญญา',
    debtOwner: null,
    debtIsTeam: false,
    projectOwner: 'คุณอรทัย',
    salesIsTeam: false,
    hasTech: false,
    techOnsite: false,
    isStockSite: false,
    items: [item(1, 'ตู้ควบคุมสัญญาณแจ้งเหตุเพลิงไหม้', '3', '0', '0', '0', 'รอสั่งซื้อ', '#64748b', '#f1f5f9')],
  },
  {
    id: 3,
    code: 'ABC69-002',
    companyName: 'บริษัท เอบีซี เอ็นจิเนียริ่ง จำกัด',
    customerName: 'โรงพยาบาลสมมติ',
    projectName: 'จัดหาและติดตั้งเครื่องปรับอากาศห้องเซิร์ฟเวอร์',
    budget: 430000,
    paymentState: 'paid_partial',
    contractEndDateShow: '10/12/2569',
    contractDaysLeft: 14,
    contractAlertDays: 30,
    deliveryDueDate: '01/12/2569',
    assembly: 'none',
    asmDone: 0,
    asmTotal: 0,
    jobType: 'งานระบบปรับอากาศ',
    status: 'เซ็นสัญญา',
    debtOwner: 'คุณกานดา',
    debtIsTeam: false,
    projectOwner: 'คุณพิชญ์',
    salesIsTeam: false,
    hasTech: true,
    techTeam: 'ทีมช่าง B',
    techOnsite: true,
    techOnsiteBy: 'คุณธนา',
    isStockSite: false,
    items: [
      item(1, 'เครื่องปรับอากาศ Precision 5 ตัน', '2', '2', '2', '1', 'ส่งบางรายการ', '#c2410c', '#ffedd5'),
      item(2, 'ท่อลมส่งความเย็น', '1', '1', '1', '1', 'ส่งครบแล้ว', '#059669', '#dcfce7'),
    ],
  },
  {
    id: 4,
    code: 'TJC68-091',
    companyName: 'บริษัท ทีเจซี กรุ๊ป จำกัด',
    customerName: 'บริษัท สมมติ จำกัด',
    projectName: 'ระบบควบคุมประตูอัตโนมัติ อาคารจอดรถ',
    budget: 2100000,
    paymentState: 'paid_full',
    contractEndDateShow: '05/03/2569',
    contractDaysLeft: null,
    contractAlertDays: 30,
    deliveryDueDate: '01/02/2569',
    assembly: 'done',
    asmDone: 5,
    asmTotal: 5,
    jobType: 'ระบบควบคุมอาคาร',
    status: 'ปิดจบหน้างาน',
    debtOwner: 'คุณปิยะ',
    debtIsTeam: false,
    projectOwner: 'คุณพิชญ์',
    salesIsTeam: false,
    hasTech: true,
    techTeam: 'ทีมช่าง A',
    techOnsite: true,
    techOnsiteBy: 'คุณธนา',
    isStockSite: false,
    items: [item(1, 'ประตูกันชนอัตโนมัติ', '5', '5', '5', '5', 'ส่งครบแล้ว', '#059669', '#dcfce7')],
  },
  {
    id: 5,
    code: 'XYZ69-021',
    companyName: 'บริษัท เอ็กซ์วายแซด จำกัด',
    customerName: 'เทศบาลนครสมมติ',
    projectName: 'ติดตั้งลิฟต์โดยสารอาคารสำนักงาน',
    budget: 3650000,
    paymentState: 'unpaid',
    contractEndDateShow: '18/09/2569',
    contractDaysLeft: -6,
    contractAlertDays: 30,
    deliveryDueDate: '10/09/2569',
    assembly: 'flagged',
    asmDone: 0,
    asmTotal: 0,
    jobType: 'งานลิฟต์',
    status: 'ระหว่างดำเนินการ',
    debtOwner: null,
    debtIsTeam: false,
    projectOwner: 'คุณวรรณา',
    salesIsTeam: false,
    hasTech: true,
    techTeam: 'ทีมช่าง C',
    techOnsite: false,
    isStockSite: false,
    items: [
      item(1, 'ลิฟต์โดยสาร 13 ชั้น', '1', '1', '0', '0', 'รับเข้าคลังบางส่วน', '#9333ea', '#f3e8ff'),
      item(2, 'ตู้ควบคุมลิฟต์', '1', '0', '0', '0', 'รอสั่งซื้อ', '#64748b', '#f1f5f9'),
    ],
  },
  {
    id: 6,
    code: 'ABC69-003',
    companyName: 'บริษัท เอบีซี เอ็นจิเนียริ่ง จำกัด',
    customerName: 'โรงพยาบาลสมมติ',
    projectName: 'บำรุงรักษาระบบโครงข่ายไฟเบอร์ออปติก',
    budget: 560000,
    paymentState: 'unpaid',
    contractEndDateShow: '25/09/2569',
    contractDaysLeft: 15,
    contractAlertDays: 30,
    deliveryDueDate: '12/09/2569',
    assembly: 'none',
    asmDone: 0,
    asmTotal: 0,
    jobType: 'งานเครือข่าย',
    status: 'เซ็นสัญญา',
    debtOwner: 'คุณสมชาย',
    debtIsTeam: false,
    projectOwner: 'คุณอรทัย',
    salesIsTeam: false,
    hasTech: false,
    techOnsite: false,
    isStockSite: true,
    items: [item(1, 'สายไฟเบอร์ออปติก (ม้วน)', '10', '10', '10', '10', 'ส่งครบแล้ว', '#059669', '#dcfce7')],
  },
  {
    id: 7,
    code: 'TJC68-077',
    companyName: 'บริษัท ทีเจซี กรุ๊ป จำกัด',
    customerName: 'เทศบาลนครสมมติ',
    projectName: 'ปรับปรุงระบบไฟฟ้าส่องสว่างถนน',
    budget: 780000,
    paymentState: 'unpaid',
    contractEndDateShow: '01/06/2569',
    contractDaysLeft: null,
    contractAlertDays: 30,
    deliveryDueDate: '15/05/2569',
    assembly: 'none',
    asmDone: 0,
    asmTotal: 0,
    jobType: 'งานระบบไฟฟ้า',
    status: 'ยกเลิก',
    debtOwner: null,
    debtIsTeam: false,
    projectOwner: 'คุณวรรณา',
    salesIsTeam: false,
    hasTech: false,
    techOnsite: false,
    isStockSite: false,
    canceledBy: 'คุณวรรณา',
    cancelReason: 'ลูกค้าเลื่อนโครงการออกไปไม่มีกำหนด รอเทศบาลอนุมัติงบใหม่ปีหน้า',
    items: [],
  },
  {
    id: 8,
    code: 'XYZ69-030',
    companyName: 'บริษัท เอ็กซ์วายแซด จำกัด',
    customerName: 'บริษัท สมมติ จำกัด',
    projectName: 'ติดตั้งระบบโซลาร์เซลล์บนหลังคา',
    budget: 4200000,
    paymentState: 'unpaid',
    contractEndDateShow: '-',
    contractDaysLeft: null,
    contractAlertDays: 30,
    deliveryDueDate: '20/09/2569',
    assembly: 'none',
    asmDone: 0,
    asmTotal: 0,
    jobType: 'พลังงานทดแทน',
    status: 'รอเซ็นสัญญา',
    debtOwner: null,
    debtIsTeam: false,
    projectOwner: 'คุณพิชญ์',
    salesIsTeam: false,
    hasTech: false,
    techOnsite: false,
    isStockSite: false,
    items: [],
  },
];

// screenKey ตรงกับ target ของลิงก์จริงในเว็บ (href) — ใช้ map ไป navigation จริงตอนต่อ
export type QuickLinkScreenKey = 'estimate' | 'driverTasks' | 'guarantee' | 'accounting' | 'incomplete' | 'createProject';

const QUICK_LINKS: { label: string; icon: keyof typeof FontAwesome5.glyphMap; color: string; screenKey: QuickLinkScreenKey }[] = [
  { label: 'ทุนตั้งต้น', icon: 'calculator', color: '#059669', screenKey: 'estimate' }, // dashboard_estimate.php
  { label: 'ใบงานจัดส่ง', icon: 'truck', color: '#d97706', screenKey: 'driverTasks' }, // driver_tasks.php
  { label: 'ค้ำประกัน', icon: 'shield-alt', color: '#7c3aed', screenKey: 'guarantee' }, // guarantee_tracking.php
  { label: 'บัญชีลูกหนี้', icon: 'file-invoice-dollar', color: '#0891b2', screenKey: 'accounting' }, // accounting_dashboard.php
  { label: 'ข้อมูลตกหล่น', icon: 'exclamation-triangle', color: '#b56704', screenKey: 'incomplete' }, // check_incomplete_projects.php
  { label: 'สร้างโครงการ', icon: 'plus-circle', color: '#2563eb', screenKey: 'createProject' }, // create_project.php
];

const STATUS_FILTERS: { label: string; value: ProjectStatus | 'all' | 'not_closed' }[] = [
  { label: 'ทั้งหมด', value: 'all' },
  { label: 'ยังไม่ปิดจบ', value: 'not_closed' },
  { label: 'รอเซ็นสัญญา', value: 'รอเซ็นสัญญา' },
  { label: 'เซ็นสัญญา', value: 'เซ็นสัญญา' },
  { label: 'ปิดจบหน้างาน', value: 'ปิดจบหน้างาน' },
  { label: 'ยกเลิก', value: 'ยกเลิก' },
];

// "จัดการ" — ไอคอนลิงก์ไปหน้าอื่นที่ปรากฏในทุกแถวของจริง (นอกขอบเขตรอบนี้ จึงเป็น stub)
const LINK_ICONS: {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  targetNote: string; // หน้าเป้าหมายจริงฝั่งเว็บ ไว้ใช้ตอนต่อ navigation จริง
}[] = [
  { key: 'view', label: 'ดูรายละเอียด', icon: 'eye-outline', color: '#475569', targetNote: 'popup รายละเอียดเต็ม (ยังไม่ทำรอบนี้)' },
  { key: 'edit', label: 'แก้ไข', icon: 'create-outline', color: '#2563eb', targetNote: 'create_project.php?edit_id=' },
  { key: 'items', label: 'รายการสินค้า', icon: 'cart-outline', color: '#7c3aed', targetNote: 'project_details.php?id=' },
  { key: 'warehouse', label: 'คลังรับของ', icon: 'cube-outline', color: '#0891b2', targetNote: 'inventory_receive.php?project_id=' },
  { key: 'delivery', label: 'จัดส่งหน้างาน', icon: 'car-outline', color: '#d97706', targetNote: 'inventory_delivery.php?project_id=' },
  { key: 'accounting', label: 'บัญชี/ลูกหนี้', icon: 'document-text-outline', color: '#059669', targetNote: 'project_accounting.php?id=' },
];

// ====================================================================
// Helpers — ย่อจาก pd_compute_row_flags() / pd_render_*_badge() ของจริง
// ====================================================================

function formatBaht(n: number): string {
  return '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// รหัสงานที่แสดง = ส่วนหลัง '-' ของ project_code เหมือน PHP: explode('-', code)[1] ?? code
function displayCode(code: string): string {
  const parts = code.split('-');
  return parts[1] ?? code;
}

function statusMeta(status: ProjectStatus): {
  bg: string;
  fg: string;
  border: string;
  icon: keyof typeof Ionicons.glyphMap;
} {
  switch (status) {
    case 'รอเซ็นสัญญา':
      return { bg: '#fff7ed', fg: '#c2410c', border: '#fdba74', icon: 'hourglass-outline' };
    case 'เซ็นสัญญา':
      return { bg: '#ecfdf5', fg: '#059669', border: '#6ee7b7', icon: 'document-text-outline' };
    case 'ระหว่างดำเนินการ':
      return { bg: '#eef2ff', fg: '#4338ca', border: '#a5b4fc', icon: 'cart-outline' };
    case 'ปิดจบหน้างาน':
      return { bg: '#eff6ff', fg: '#1d4ed8', border: '#93c5fd', icon: 'flag-outline' };
    case 'ยกเลิก':
      return { bg: '#f1f5f9', fg: '#64748b', border: '#cbd5e1', icon: 'ban-outline' };
  }
}

// เทียบเท่า $contract_countdown_html ใน pd_compute_row_flags()
function contractCountdown(p: Project): { text: string; fg: string; bg?: string; icon: keyof typeof Ionicons.glyphMap } {
  if (p.status === 'ปิดจบหน้างาน') {
    return { text: 'งานเสร็จสมบูรณ์', fg: '#10b981', icon: 'checkmark-circle' };
  }
  if (p.contractDaysLeft === null) {
    return { text: '-', fg: '#94a3b8', icon: 'remove-outline' };
  }
  if (p.contractDaysLeft < 0) {
    return { text: `เลยกำหนด ${Math.abs(p.contractDaysLeft)} วัน`, fg: '#fff', bg: '#ef4444', icon: 'alert-circle' };
  }
  if (p.contractDaysLeft <= p.contractAlertDays) {
    return { text: `เหลือ ${p.contractDaysLeft} วัน`, fg: '#ef4444', bg: '#fee2e2', icon: 'time' };
  }
  return { text: `เหลือ ${p.contractDaysLeft} วัน`, fg: '#10b981', icon: 'time-outline' };
}

// เทียบเท่า pd_assembly_state() + ข้อความป้าย 3 สถานะใน pd_render_project_row()
function assemblyMeta(
  p: Project
): { text: string; fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap } | null {
  switch (p.assembly) {
    case 'done':
      return { text: 'ประกอบเสร็จ', fg: '#059669', bg: '#ecfdf5', icon: 'checkmark-circle-outline' };
    case 'doing':
      return { text: `กำลังประกอบ ${p.asmDone}/${p.asmTotal}`, fg: '#f97316', bg: '#fff7ed', icon: 'construct-outline' };
    case 'flagged':
      return { text: 'มีประกอบ', fg: '#0ea5e9', bg: '#f0f9ff', icon: 'settings-outline' };
    default:
      return null;
  }
}

function paymentMeta(state: PaymentState): { text: string; fg: string; bg: string } | null {
  if (state === 'paid_partial') return { text: 'จ่ายบางส่วน', fg: '#d97706', bg: '#fffbeb' };
  if (state === 'unpaid') return { text: 'รอชำระเงิน', fg: '#ef4444', bg: '#fef2f2' };
  return null; // paid_full แสดงผ่านป้ายรหัสงานสีม่วงแทน (ดู renderProjectCard)
}

// ====================================================================
// Main screen
// ====================================================================

export interface ProjectDashboardScreenProps {
  // เรียกเมื่อแตะปุ่มลัดด้านบน (ทุนตั้งต้น/ใบงานจัดส่ง/ฯลฯ) — ถ้าไม่ส่งมาจะโชว์ Alert stub แทน
  onNavigate?: (screen: QuickLinkScreenKey) => void;
}

export default function ProjectDashboardScreen({ onNavigate }: ProjectDashboardScreenProps = {}) {
  // ไม่มี navigation library ต่อจากภายนอก (onNavigate) -> สลับหน้าเองภายในไฟล์นี้
  // ตอนนี้มีแค่ 'estimate' (ทุนตั้งต้น) ที่สร้างสกรีนจริงแล้ว ปุ่มอื่นยังเป็น Alert stub
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'estimate' | 'driverTasks' | 'guarantee' | 'accounting' | 'incomplete' | 'createProject'>('dashboard');
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all' | 'not_closed'>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState('2569');

  const [cancelFormModal, setCancelFormModal] = useState<{ visible: boolean; project?: Project }>({ visible: false });
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [cancelViewModal, setCancelViewModal] = useState<{ visible: boolean; project?: Project }>({ visible: false });
  const [debtModal, setDebtModal] = useState<{ visible: boolean; project?: Project }>({ visible: false });
  const [itemStatusModal, setItemStatusModal] = useState<{ visible: boolean; project?: Project }>({ visible: false });

  const companies = useMemo(() => Array.from(new Set(projects.map((p) => p.companyName))), [projects]);

  // KPI คำนวณจากข้อมูลทั้งหมด (ของจริงคำนวณฝั่ง backend ผ่าน pd_compute_card_stats())
  const kpis = useMemo(() => {
    const totalAll = projects.length;
    const notClosed = projects.filter((p) => p.status !== 'ปิดจบหน้างาน' && p.status !== 'ยกเลิก').length;
    const closed = projects.filter((p) => p.status === 'ปิดจบหน้างาน').length;
    const waiting = projects.filter((p) => p.status === 'รอเซ็นสัญญา').length;
    const signed = projects.filter((p) => p.status === 'เซ็นสัญญา').length;
    const totalBudget = projects.filter((p) => p.status !== 'ยกเลิก').reduce((sum, p) => sum + p.budget, 0);
    return { totalAll, notClosed, closed, waiting, signed, totalBudget };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (companyFilter !== 'all' && p.companyName !== companyFilter) return false;
      if (statusFilter === 'not_closed') {
        if (p.status === 'ปิดจบหน้างาน' || p.status === 'ยกเลิก') return false;
      } else if (statusFilter !== 'all' && p.status !== statusFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${p.code} ${p.projectName} ${p.customerName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [projects, search, statusFilter, companyFilter]);

  // -------------------- Row actions (mock เท่านั้น — ดู TODO แต่ละจุด) --------------------

  function handleForceComplete(project: Project) {
    // TODO: ต่อ backend จริง -> POST project_dashboard.php action=force_complete_project, project_id
    Alert.alert(
      `ยืนยันปิดจบหน้างาน (${displayCode(project.code)})`,
      `จะเปลี่ยนสถานะของ "${project.projectName}" เป็น "ปิดจบหน้างาน" ใช่หรือไม่?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ใช่, ปิดจบเลย',
          onPress: () =>
            setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status: 'ปิดจบหน้างาน' } : p))),
        },
      ]
    );
  }

  function handleUndoComplete(project: Project) {
    // TODO: ต่อ backend จริง -> action=undo_complete_project, project_id
    Alert.alert(
      `ยืนยันยกเลิกปิดจบหน้างาน (${displayCode(project.code)})`,
      `จะยกเลิกการปิดจบของ "${project.projectName}" และคำนวณสถานะใหม่ตามเงื่อนไขจริง ใช่หรือไม่?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ใช่, ยกเลิกปิดจบ',
          onPress: () =>
            setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status: 'ระหว่างดำเนินการ' } : p))),
        },
      ]
    );
  }

  function openCancelForm(project: Project) {
    setCancelReasonText('');
    setCancelFormModal({ visible: true, project });
  }

  function confirmCancelProject() {
    // TODO: ต่อ backend จริง -> action=cancel_project, project_id, cancel_reason (บังคับกรอก)
    if (!cancelReasonText.trim()) {
      Alert.alert('กรุณาระบุหมายเหตุ', 'ต้องกรอกเหตุผลที่ยกเลิกโครงการก่อนยืนยัน');
      return;
    }
    const project = cancelFormModal.project;
    if (project) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === project.id
            ? { ...p, status: 'ยกเลิก', canceledBy: 'ผู้ใช้ปัจจุบัน', cancelReason: cancelReasonText.trim() }
            : p
        )
      );
    }
    setCancelFormModal({ visible: false });
  }

  function openDebtModal(project: Project) {
    setDebtModal({ visible: true, project });
  }

  function assignDebtOwner(name: string) {
    // TODO: ต่อ backend จริง -> action=save_debt_owner, project_id, debt_type, debt_user, debt_team
    const project = debtModal.project;
    if (project) {
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, debtOwner: name } : p)));
    }
    setDebtModal({ visible: false });
  }

  function toggleTechOnsite(project: Project, value: boolean) {
    // TODO: ต่อ backend จริง -> action=save_tech_onsite, project_id, onsite
    // หมายเหตุ: ของจริง toggle นี้อยู่ใน popup "รายละเอียดโครงการ" ไม่ใช่ในแถวตาราง
    // เอามาไว้ที่การ์ดโดยตรงเพื่อความสะดวกบนมือถือ (ยิง action เดียวกัน)
    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id ? { ...p, techOnsite: value, techOnsiteBy: value ? 'ผู้ใช้ปัจจุบัน' : undefined } : p
      )
    );
  }

  function handleLinkIcon(key: string, project: Project) {
    const link = LINK_ICONS.find((l) => l.key === key);
    if (key === 'view') {
      Alert.alert('ดูรายละเอียด', `จะเปิด popup รายละเอียดเต็มของ "${project.projectName}" ในเวอร์ชันถัดไป`);
      return;
    }
    if (key === 'delivery' && project.isStockSite) return; // ของจริงซ่อนไอคอนนี้ถ้าเป็นหน้างานสต๊อก
    Alert.alert(link?.label ?? key, `จะเชื่อมไปหน้า: ${link?.targetNote} (project id ${project.id})`);
  }

  // -------------------- Render helpers --------------------

  function renderKpiCard(
    label: string,
    value: string,
    icon: keyof typeof Ionicons.glyphMap,
    color: string,
    targetFilter: ProjectStatus | 'all' | 'not_closed'
  ) {
    const active = statusFilter === targetFilter;
    return (
      <TouchableOpacity
        key={label}
        onPress={() => setStatusFilter(targetFilter)}
        activeOpacity={0.75}
        style={[styles.kpiCard, { borderColor: active ? color : '#e2e8f0', backgroundColor: active ? color + '14' : '#fff' }]}
      >
        <View style={styles.kpiTopRow}>
          <Ionicons name={icon} size={14} color={color} />
          <Text style={[styles.kpiLabel, { color }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <Text style={styles.kpiValue}>{value}</Text>
      </TouchableOpacity>
    );
  }

  function renderHeader() {
    return (
      <View>
        <View style={styles.titleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="pie-chart" size={20} color="#3b82f6" />
            <Text style={styles.title}>Dashboard โครงการ</Text>
          </View>
          <TouchableOpacity style={styles.yearChip} activeOpacity={0.7}>
            <Text style={styles.yearChipText}>ปี พ.ศ. {selectedYear}</Text>
            <Ionicons name="chevron-down" size={14} color="#1e40af" />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickLinksRow}>
          {QUICK_LINKS.map((q) => (
            <TouchableOpacity
              key={q.label}
              style={styles.quickLinkPill}
              activeOpacity={0.75}
              onPress={() => {
                if (onNavigate) return onNavigate(q.screenKey);
                if (q.screenKey === 'estimate') return setActiveScreen('estimate');
                if (q.screenKey === 'driverTasks') return setActiveScreen('driverTasks');
                if (q.screenKey === 'guarantee') return setActiveScreen('guarantee');
                if (q.screenKey === 'accounting') return setActiveScreen('accounting');
                if (q.screenKey === 'incomplete') return setActiveScreen('incomplete');
                if (q.screenKey === 'createProject') return setActiveScreen('createProject');
                Alert.alert(q.label, 'หน้านี้ยังไม่ได้สร้าง — ส่งไฟล์ PHP มาได้เลย จะทำสกรีนต่อให้');
              }}
            >
              <FontAwesome5 name={q.icon} size={13} color={q.color} />
              <Text style={[styles.quickLinkText, { color: q.color }]}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiRow}>
          {renderKpiCard('โครงการทั้งหมด', `${kpis.totalAll} งาน`, 'folder-open', '#3b82f6', 'all')}
          {renderKpiCard('ยังไม่ปิดจบ', `${kpis.notClosed} งาน`, 'alert-circle', '#f43f5e', 'not_closed')}
          {renderKpiCard('ปิดจบหน้างาน', `${kpis.closed} งาน`, 'flag', '#059669', 'ปิดจบหน้างาน')}
          {renderKpiCard('รอเซ็นสัญญา', `${kpis.waiting} งาน`, 'time', '#d97706', 'รอเซ็นสัญญา')}
          {renderKpiCard('เซ็นสัญญา', `${kpis.signed} งาน`, 'document-text', '#2563eb', 'เซ็นสัญญา')}
          <View key="budget" style={[styles.kpiCard, { borderColor: '#c4b5fd', backgroundColor: '#f5f3ff' }]}>
            <View style={styles.kpiTopRow}>
              <Ionicons name="cash" size={14} color="#7c3aed" />
              <Text style={[styles.kpiLabel, { color: '#7c3aed' }]} numberOfLines={1}>
                งบประมาณรวม
              </Text>
            </View>
            <Text style={styles.kpiValue}>{formatBaht(kpis.totalBudget)}</Text>
          </View>
        </ScrollView>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#94a3b8" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นหารหัสงาน / ชื่อโครงการ / ลูกค้า..."
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#cbd5e1" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value;
            return (
              <TouchableOpacity key={f.label} onPress={() => setStatusFilter(f.value)} style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterChipsRow, { marginTop: 6 }]}>
          {['all', ...companies].map((c) => {
            const active = companyFilter === c;
            return (
              <TouchableOpacity key={c} onPress={() => setCompanyFilter(c)} style={[styles.filterChip, styles.companyChip, active && styles.companyChipActive]}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>
                  {c === 'all' ? 'ทุกบริษัท' : c}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.resultCount}>พบ {filteredProjects.length} โครงการ</Text>
      </View>
    );
  }

  function renderProjectCard({ item: p }: { item: Project }) {
    const sm = statusMeta(p.status);
    const cc = contractCountdown(p);
    const asm = assemblyMeta(p);
    const pay = paymentMeta(p.paymentState);
    const isClosed = p.status === 'ปิดจบหน้างาน';
    const isCancelled = p.status === 'ยกเลิก';

    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          {p.paymentState === 'paid_full' ? (
            <View style={styles.codeBadgePaidFull}>
              <Ionicons name="checkmark-circle" size={12} color="#e9d5ff" />
              <Text style={styles.codeBadgePaidFullText}>{displayCode(p.code)}</Text>
            </View>
          ) : (
            <Text style={styles.cardCode}>{displayCode(p.code)}</Text>
          )}

          {/* แตะป้ายสถานะ = เปิดสถานะอุปกรณ์ (เหมือนของจริงที่ onclick ครอบทั้งปุ่มนี้) */}
          <TouchableOpacity
            style={[styles.statusBadge, { backgroundColor: sm.bg, borderColor: sm.border }]}
            onPress={() => setItemStatusModal({ visible: true, project: p })}
            activeOpacity={0.7}
          >
            <Ionicons name={sm.icon} size={12} color={sm.fg} />
            <Text style={[styles.statusBadgeText, { color: sm.fg }]}>{p.status}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {p.projectName}
        </Text>
        <Text style={styles.cardSubtitle}>
          {p.companyName} • {p.customerName}
        </Text>

        {isCancelled && (
          <TouchableOpacity style={styles.cancelReasonBox} onPress={() => setCancelViewModal({ visible: true, project: p })} activeOpacity={0.7}>
            <Ionicons name="information-circle" size={13} color="#ef4444" />
            <Text style={styles.cancelReasonText} numberOfLines={2}>
              ดูเหตุผลที่ยกเลิก — {p.cancelReason}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.cardMetaRow}>
          <View style={styles.cardMetaItem}>
            <Ionicons name="cash-outline" size={13} color="#059669" />
            <Text style={styles.cardMetaValue}>{formatBaht(p.budget)}</Text>
          </View>
          <View style={styles.cardMetaItem}>
            <Ionicons name="calendar-outline" size={13} color="#64748b" />
            <Text style={styles.cardMetaLabel}>ส่งมอบ {p.deliveryDueDate}</Text>
          </View>
        </View>
        {pay && (
          <View style={[styles.paymentBadge, { backgroundColor: pay.bg }]}>
            <Text style={[styles.paymentBadgeText, { color: pay.fg }]}>{pay.text}</Text>
          </View>
        )}

        <View style={styles.cardMetaRow}>
          <View style={styles.cardMetaItem}>
            <MaterialCommunityIcons name="briefcase-outline" size={13} color="#64748b" />
            <Text style={styles.cardMetaLabel}>{p.jobType}</Text>
          </View>
        </View>

        {/* นับถอยหลังสัญญา (เทียบเท่า $contract_countdown_html) */}
        <View style={styles.countdownRow}>
          <View style={[styles.countdownBadge, cc.bg ? { backgroundColor: cc.bg } : null]}>
            <Ionicons name={cc.icon} size={13} color={cc.fg} />
            <Text style={[styles.countdownText, { color: cc.fg }]}>สัญญาถึง {p.contractEndDateShow} · {cc.text}</Text>
          </View>
          {asm && (
            <View style={[styles.assemblyBadge, { backgroundColor: asm.bg }]}>
              <Ionicons name={asm.icon} size={12} color={asm.fg} />
              <Text style={[styles.assemblyBadgeText, { color: asm.fg }]}>{asm.text}</Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.ownersRow}>
          <TouchableOpacity style={styles.ownerTapArea} onPress={() => openDebtModal(p)} activeOpacity={0.7}>
            <Text style={styles.ownerLabel}>ติดตามหนี้</Text>
            {p.debtOwner ? (
              <View style={styles.ownerChip}>
                <Ionicons name={p.debtIsTeam ? 'people-outline' : 'person-outline'} size={11} color="#2563eb" />
                <Text style={styles.ownerChipText}>{p.debtOwner}</Text>
              </View>
            ) : (
              <View style={[styles.ownerChip, styles.ownerChipEmpty]}>
                <Ionicons name="person-add-outline" size={12} color="#94a3b8" />
                <Text style={styles.ownerChipEmptyText}>เลือก</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.ownerTapArea}>
            <Text style={styles.ownerLabel}>ผู้รับผิดชอบโครงการ</Text>
            <View style={styles.ownerChip}>
              <Ionicons name={p.salesIsTeam ? 'people-outline' : 'person-outline'} size={11} color="#2563eb" />
              <Text style={styles.ownerChipText}>{p.projectOwner}</Text>
            </View>
          </View>
        </View>

        {p.hasTech && (
          <View style={styles.techRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              <MaterialCommunityIcons name="account-hard-hat-outline" size={15} color="#047857" />
              <Text style={styles.techLabel} numberOfLines={1}>
                {p.techOnsite
                  ? `ช่างเข้าหน้างาน${p.techTeam ? `: ${p.techTeam}` : ''}${p.techOnsiteBy ? ` (${p.techOnsiteBy})` : ''}`
                  : `มีช่าง${p.techTeam ? `: ${p.techTeam}` : ''}`}
              </Text>
            </View>
            <Switch
              value={p.techOnsite}
              onValueChange={(v) => toggleTechOnsite(p, v)}
              trackColor={{ false: '#e2e8f0', true: '#a7f3d0' }}
              thumbColor={p.techOnsite ? '#059669' : '#f8fafc'}
            />
          </View>
        )}

        <View style={styles.divider} />

        {/* แถวไอคอน "จัดการ" — ลิงก์ไปหน้าอื่น (stub รอบนี้) */}
        <View style={styles.linkIconsRow}>
          {LINK_ICONS.filter((l) => !(l.key === 'delivery' && p.isStockSite)).map((l) => (
            <TouchableOpacity key={l.key} style={styles.linkIconBtn} onPress={() => handleLinkIcon(l.key, p)}>
              <Ionicons name={l.icon} size={16} color={l.color} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ปุ่มเปลี่ยนสถานะหลัก */}
        {!isCancelled && (
          <View style={styles.actionsRow}>
            {!isClosed ? (
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleForceComplete(p)}>
                <Ionicons name="flag-outline" size={15} color="#059669" />
                <Text style={[styles.actionBtnText, { color: '#059669' }]}>ปิดจบหน้างาน</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleUndoComplete(p)}>
                <Ionicons name="arrow-undo-outline" size={15} color="#f97316" />
                <Text style={[styles.actionBtnText, { color: '#f97316' }]}>ยกเลิกปิดจบ</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionBtn} onPress={() => openCancelForm(p)}>
              <Ionicons name="ban-outline" size={15} color="#ef4444" />
              <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>ยกเลิกโครงการ</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  if (activeScreen === 'estimate') {
    return <EstimateDashboardScreen onBack={() => setActiveScreen('dashboard')} />;
  }
  if (activeScreen === 'driverTasks') {
    return <DriverTasksScreen onBack={() => setActiveScreen('dashboard')} />;
  }
  if (activeScreen === 'guarantee') {
    return <GuaranteeTrackingScreen onBack={() => setActiveScreen('dashboard')} />;
  }
  if (activeScreen === 'accounting') {
    return (
      <AccountingDashboard onBackToMain={() => setActiveScreen('dashboard')} />
      // onViewCompanyBreakdown/onViewProject/onFollowProject/onRecordProject: ไม่ส่ง prop เหล่านี้ตั้งใจ —
      // AccountingDashboard.tsx จัดการเอง (modal "ดูข้อมูล" ในตัว + สลับไป ProjectFollowupScreen/
      // ProjectAccountingScreen ที่ import ไว้แล้ว ซึ่งตอนนี้เชื่อม API จริงแล้วทั้งคู่)
    );
  }
  if (activeScreen === 'incomplete') {
    return <CheckIncompleteProjectsScreen onBack={() => setActiveScreen('dashboard')} />;
  }
  if (activeScreen === 'createProject') {
    return <CreateProjectScreen onBack={() => setActiveScreen('dashboard')} onSaved={() => setActiveScreen('dashboard')} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={filteredProjects}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderProjectCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="folder-open-outline" size={28} color="#cbd5e1" />
            <Text style={styles.emptyText}>ไม่พบโครงการที่ตรงกับตัวกรอง</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />

      {/* Modal: ยกเลิกโครงการ (บังคับกรอกเหตุผล — ตรงกับ cancelProject() ของจริง) */}
      <Modal visible={cancelFormModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>ยืนยันการยกเลิกโครงการ</Text>
            <Text style={styles.modalSubtitle}>
              {cancelFormModal.project?.projectName}
              {'\n'}ข้อมูลจะถูกขีดฆ่าและไม่ถูกนำไปคำนวณในระบบ
            </Text>
            <Text style={styles.modalFieldLabel}>โปรดระบุหมายเหตุการยกเลิก (บังคับกรอก)</Text>
            <TextInput
              value={cancelReasonText}
              onChangeText={setCancelReasonText}
              placeholder="กรอกเหตุผลที่ยกเลิกโครงการที่นี่..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={4}
              style={styles.modalTextarea}
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setCancelFormModal({ visible: false })}>
                <Text style={styles.modalBtnGhostText}>ปิด</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ef4444' }]} onPress={confirmCancelProject}>
                <Text style={styles.modalBtnText}>ใช่, ยกเลิกโครงการ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: ดูเหตุผลที่ยกเลิก (อ่านอย่างเดียว — ตรงกับ showCancelReason() ของจริง) */}
      <Modal visible={cancelViewModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>ข้อมูลการยกเลิกโครงการ</Text>
            <View style={styles.cancelViewRow}>
              <Ionicons name="person-circle-outline" size={22} color="#3b82f6" />
              <View>
                <Text style={styles.cancelViewLabel}>ผู้ทำรายการยกเลิก</Text>
                <Text style={styles.cancelViewValue}>{cancelViewModal.project?.canceledBy ?? 'ไม่ระบุ'}</Text>
              </View>
            </View>
            <Text style={[styles.modalFieldLabel, { marginTop: 12 }]}>หมายเหตุ / เหตุผลที่ยกเลิก</Text>
            <View style={styles.cancelViewReasonBox}>
              <Text style={styles.cancelViewReasonText}>{cancelViewModal.project?.cancelReason ?? 'ไม่มีหมายเหตุ'}</Text>
            </View>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#3b82f6', marginTop: 16 }]} onPress={() => setCancelViewModal({ visible: false })}>
              <Text style={styles.modalBtnText}>ปิดหน้าต่าง</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: เลือกผู้รับผิดชอบติดตามหนี้ */}
      <Modal visible={debtModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เลือกผู้รับผิดชอบติดตามหนี้</Text>
            <Text style={styles.modalSubtitle}>{debtModal.project?.projectName}</Text>
            {DEBT_OWNER_OPTIONS.map((name) => (
              <TouchableOpacity key={name} style={styles.debtOptionRow} onPress={() => assignDebtOwner(name)}>
                <Ionicons name="person-circle-outline" size={18} color="#3b82f6" />
                <Text style={styles.debtOptionText}>{name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 10 }]} onPress={() => setDebtModal({ visible: false })}>
              <Text style={styles.modalBtnGhostText}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: สถานะอุปกรณ์ — โครงสร้างข้อมูลตรงกับ ajax_get_item_status.php */}
      <Modal visible={itemStatusModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>สถานะอุปกรณ์</Text>
            <Text style={styles.modalSubtitle}>{itemStatusModal.project?.projectName}</Text>
            <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
              {(itemStatusModal.project?.items.length ?? 0) === 0 ? (
                <Text style={styles.itemEmptyText}>ยังไม่มีรายการสินค้าในโครงการนี้</Text>
              ) : (
                itemStatusModal.project?.items.map((it) => (
                  <View key={it.id} style={styles.itemCard}>
                    <View style={styles.itemCardTopRow}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {it.itemName}
                      </Text>
                      <View style={[styles.itemStatusChip, { backgroundColor: it.bg }]}>
                        <Text style={[styles.itemStatusChipText, { color: it.color }]}>{it.displayStatus}</Text>
                      </View>
                    </View>
                    <View style={styles.itemGrid}>
                      <View style={styles.itemGridCell}>
                        <Text style={styles.itemGridLabel}>BOQ</Text>
                        <Text style={styles.itemGridValue}>{it.boqQty}</Text>
                      </View>
                      <View style={styles.itemGridCell}>
                        <Text style={styles.itemGridLabel}>สั่งซื้อแล้ว</Text>
                        <Text style={styles.itemGridValue}>{it.totalBuy}</Text>
                      </View>
                      <View style={styles.itemGridCell}>
                        <Text style={styles.itemGridLabel}>รับเข้าคลัง</Text>
                        <Text style={styles.itemGridValue}>{it.totalReceive}</Text>
                      </View>
                      <View style={styles.itemGridCell}>
                        <Text style={styles.itemGridLabel}>ส่งหน้างานแล้ว</Text>
                        <Text style={styles.itemGridValue}>{it.totalDelivered}</Text>
                      </View>
                      {(it.totalClaimBuy !== '0' || it.totalClaimDelivered !== '0') && (
                        <View style={[styles.itemGridCell, { minWidth: '100%' }]}>
                          <Text style={styles.itemGridLabel}>ยอดเคลม (สั่ง/ส่ง)</Text>
                          <Text style={[styles.itemGridValue, { color: '#ef4444' }]}>
                            {it.totalClaimBuy} / {it.totalClaimDelivered}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 12 }]} onPress={() => setItemStatusModal({ visible: false })}>
              <Text style={styles.modalBtnGhostText}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  yearChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 6 },
  yearChipText: { color: '#1e40af', fontWeight: '700', fontSize: 12 },

  quickLinksRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  quickLinkPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 8 },
  quickLinkText: { fontSize: 12, fontWeight: '700' },

  kpiRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  kpiCard: { width: 128, borderWidth: 1.5, borderRadius: 14, padding: 10, backgroundColor: '#fff' },
  kpiTopRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  kpiLabel: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
  kpiValue: { fontSize: 15, fontWeight: '800', color: '#0f172a' },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 13, color: '#0f172a', padding: 0 },

  filterChipsRow: { paddingHorizontal: 16, paddingTop: 10, gap: 6 },
  filterChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 6 },
  filterChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  filterChipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  companyChip: { backgroundColor: '#f8fafc', maxWidth: 180 },
  companyChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },

  resultCount: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, fontSize: 12, color: '#64748b', fontWeight: '600' },

  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginHorizontal: 16, marginTop: 12, padding: 14 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardCode: { fontSize: 12, fontWeight: '800', color: '#94a3b8' },
  codeBadgePaidFull: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#7e22ce', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  codeBadgePaidFullText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 50, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 6 },
  cardSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },

  cancelReasonBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#fef2f2', borderRadius: 8, padding: 8, marginTop: 8 },
  cancelReasonText: { fontSize: 11.5, color: '#b91c1c', flex: 1 },

  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaValue: { fontSize: 12.5, fontWeight: '700', color: '#059669' },
  cardMetaLabel: { fontSize: 12, color: '#64748b' },

  paymentBadge: { alignSelf: 'flex-start', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 3, marginTop: 6 },
  paymentBadgeText: { fontSize: 11, fontWeight: '700' },

  countdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  countdownBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countdownText: { fontSize: 11.5, fontWeight: '600' },
  assemblyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3 },
  assemblyBadgeText: { fontSize: 10.5, fontWeight: '700' },

  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 10 },

  ownersRow: { flexDirection: 'row', justifyContent: 'space-between' },
  ownerTapArea: { flex: 1 },
  ownerLabel: { fontSize: 10.5, color: '#94a3b8', fontWeight: '600', marginBottom: 4 },
  ownerChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#eff6ff', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 3 },
  ownerChipText: { fontSize: 11.5, color: '#1d4ed8', fontWeight: '700' },
  ownerChipEmpty: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  ownerChipEmptyText: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },

  techRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0fdf4', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10 },
  techLabel: { fontSize: 12, color: '#047857', fontWeight: '600', flexShrink: 1 },

  linkIconsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  linkIconBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  actionBtnText: { fontSize: 11.5, fontWeight: '700' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { color: '#94a3b8', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalSubtitle: { fontSize: 12.5, color: '#64748b', marginTop: 6, lineHeight: 18 },
  modalFieldLabel: { fontSize: 12.5, fontWeight: '700', color: '#334155', marginTop: 14 },
  modalTextarea: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginTop: 6, minHeight: 80, textAlignVertical: 'top', fontSize: 13, color: '#0f172a' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: '#f1f5f9' },
  modalBtnGhostText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  cancelViewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, backgroundColor: '#f8fafc', borderRadius: 10, padding: 10 },
  cancelViewLabel: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  cancelViewValue: { fontSize: 14, color: '#0f172a', fontWeight: '700' },
  cancelViewReasonBox: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginTop: 6, minHeight: 60 },
  cancelViewReasonText: { fontSize: 13, color: '#334155', lineHeight: 19 },

  debtOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  debtOptionText: { fontSize: 13.5, color: '#0f172a', fontWeight: '600' },

  itemEmptyText: { textAlign: 'center', color: '#94a3b8', fontSize: 13, paddingVertical: 30 },
  itemCard: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, marginBottom: 10 },
  itemCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  itemName: { fontSize: 13, fontWeight: '700', color: '#0f172a', flex: 1 },
  itemStatusChip: { borderRadius: 50, paddingHorizontal: 9, paddingVertical: 3 },
  itemStatusChipText: { fontSize: 10.5, fontWeight: '700' },
  itemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  itemGridCell: { minWidth: '45%' },
  itemGridLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600' },
  itemGridValue: { fontSize: 13, color: '#0f172a', fontWeight: '700', marginTop: 1 },
});

/**
 * ------------------------------------------------------------------
 * ตัวอย่างการต่อ onNavigate เข้ากับระบบนำทางจริง (เลือกแบบที่ตรงกับโปรเจกต์):
 *
 * — ถ้ายังไม่มี navigation library (สลับสกรีนแบบง่ายด้วย state ใน parent):
 *   const [screen, setScreen] = useState<'dashboard' | 'estimate'>('dashboard');
 *   return screen === 'dashboard'
 *     ? <ProjectDashboardScreen onNavigate={(k) => k === 'estimate' && setScreen('estimate')} />
 *     : <EstimateDashboardScreen onBack={() => setScreen('dashboard')} />;
 *
 * — ถ้าใช้ React Navigation (stack):
 *   <ProjectDashboardScreen onNavigate={(k) => {
 *     if (k === 'estimate') navigation.navigate('EstimateDashboard');
 *   }} />
 *
 * — ถ้าใช้ Expo Router:
 *   <ProjectDashboardScreen onNavigate={(k) => {
 *     if (k === 'estimate') router.push('/estimate-dashboard');
 *   }} />
 * ------------------------------------------------------------------
 */