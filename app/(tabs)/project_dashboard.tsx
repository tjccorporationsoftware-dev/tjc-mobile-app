/**
 * ProjectDashboardScreen.tsx  (v3)
 * ------------------------------------------------------------------
 * แดชบอร์ดโครงการ (Expo / React Native) — เชื่อม project_API_mobile.php ตัวจริง
 * ตามสเปกใน mobile_api/docs/README_project.md (ไม่ใช่ project_dashboard.php เดิมอีกต่อไป)
 *
 * action ที่ใช้จริงในไฟล์นี้:
 *   อ่าน  — get_dashboard (การ์ด KPI), get_list (รายการโครงการ)
 *   เขียน — save_debt_owner, save_tech_onsite, force_complete_project,
 *           undo_complete_project, cancel_project
 *
 * ฟิลด์ทุกตัวอ่านตามชื่อ snake_case จริงจากเอกสาร (ไม่มีการเดาชื่อคีย์อีกแล้ว) รวม 108
 * คีย์ต่อแถวจาก get_list — จอมือถือนี้เลือกแสดงเฉพาะส่วนที่จำเป็นสำหรับการ์ดสรุป
 *
 * action ที่ยังไม่ได้ทำ UI รองรับ (มีจริงใน API แต่หน้านี้ยังไม่มีจอให้): get_master_data,
 * get_detail, get_notes/save_note/delete_note, get_edit_history, get_canceled_history,
 * get_undo_complete_history — เป็นโมดัลประวัติ/หมายเหตุที่ต้องออกแบบจอเพิ่ม นอกขอบเขตรอบนี้
 *
 * ตัวเลข KPI การ์ดบนสุดดึงจาก get_dashboard (kpi_all) ตรงๆ ไม่คำนวณเองในแอป
 * ตามกติกา "แอปเป็นแค่ตัววาดหน้าจอ" ใน API_CONTRACT_for_app.md
 *
 * โมดัล "สถานะอุปกรณ์" (itemStatus) ยังอิง ajax_get_item_status.php เดิม — endpoint นี้ไม่ได้
 * อยู่ใน project_API_mobile.php เลย (ไม่มี action เทียบเท่าในเอกสารชุดนี้) จึงคงพฤติกรรมเดิมไว้
 * ------------------------------------------------------------------
 */

import { FontAwesome5, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../_layout';
// ✅ Config
import { API_MODULES } from '../../constants/config';
// 🌟 รูปแบบวันที่สั้น "d/m/yy" มาตรฐานเดียวกันทั้งแอป
import { formatShortThaiDate, formatShortThaiDateTime } from '../../components/DateTimeField';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';
// ปรับ path นี้ให้ตรงกับตำแหน่งไฟล์จริงในโปรเจกต์ ถ้าไม่ได้วางไว้โฟลเดอร์เดียวกัน
import AccountingDashboard from './accounting_dashboard';
import CheckIncompleteProjectsScreen from './Checkincompleteproject';
import CreateProjectScreen from './createproject';
import DriverTasksScreen from './DriverTasks';
import EstimateDashboardScreen from './Estimatedashboard';
import GuaranteeTrackingScreen from './Guaranteetracking';
import ProjectAccountingScreen from './projectaccounting';

// project_API_mobile.php — README_project.md
const PROJECT_API_URL = `${API_MODULES}/project_API_mobile.php`;
// project_items_API_mobile.php — อ่านอย่างเดียว: สถานะรายการสินค้า / ประวัติรับเข้าคลัง / ประวัติจัดส่งหน้างาน
// (get_item_status เรียกตรรกะเดิมของ ajax_get_item_status.php ผ่าน user_id ไม่ต้องมี session เว็บ)
const PROJECT_ITEMS_API_URL = `${API_MODULES}/project_items_API_mobile.php`;
// inventory_API_mobile.php — รับของเข้าคลังจริง (v1: โหมดปกติเท่านั้น ไม่รวมเคลม/ของตีกลับ)
const INVENTORY_API_URL = `${API_MODULES}/inventory_API_mobile.php`;

// ====================================================================
// Types — ชื่อคีย์ snake_case ตรงกับ get_list/get_dashboard ใน README_project.md ทุกตัว
// ====================================================================

type PaymentState = 'unpaid' | 'paid_partial' | 'paid_full';

// ตรงกับ 1 แถวของ res.data ใน ajax_get_item_status.php (คนละ endpoint กับ project_API_mobile.php)
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

// การ์ด KPI บนสุด — ตรงกับ kpi_all ของ get_dashboard (README_project.md ข้อ 4.1)
// ครบทั้ง 14 การ์ดของเว็บ (pd_compute_card_stats) — ใช้ทั้งภาพรวม (kpi_all) และรายบริษัท (kpi_by_company)
interface DashboardKpi {
  totalProjects: number;
  totalBudget: number;
  signedProjects: number;
  completedProjects: number;
  forceClosedProjects: number;
  paidFullProjects: number;
  waitingProjects: number;
  notClosedProjects: number;
  poProjects: number;
  expiringProjects: number;
  expiringWarranty: number;
  countBuyP: number;
  countRecP: number;
  countDelP: number;
}

const EMPTY_KPI: DashboardKpi = {
  totalProjects: 0,
  totalBudget: 0,
  signedProjects: 0,
  completedProjects: 0,
  forceClosedProjects: 0,
  paidFullProjects: 0,
  waitingProjects: 0,
  notClosedProjects: 0,
  poProjects: 0,
  expiringProjects: 0,
  expiringWarranty: 0,
  countBuyP: 0,
  countRecP: 0,
  countDelP: 0,
};

function mapKpi(k: any): DashboardKpi {
  return {
    totalProjects: Number(k?.total_projects ?? 0),
    totalBudget: Number(k?.total_budget ?? 0),
    signedProjects: Number(k?.signed_projects ?? 0),
    completedProjects: Number(k?.completed_projects ?? 0),
    forceClosedProjects: Number(k?.force_closed_projects ?? 0),
    paidFullProjects: Number(k?.paid_full_projects ?? 0),
    waitingProjects: Number(k?.waiting_projects ?? 0),
    notClosedProjects: Number(k?.not_closed_projects ?? 0),
    poProjects: Number(k?.po_projects ?? 0),
    expiringProjects: Number(k?.expiring_projects ?? 0),
    expiringWarranty: Number(k?.expiring_warranty ?? 0),
    countBuyP: Number(k?.count_buy_p ?? 0),
    countRecP: Number(k?.count_rec_p ?? 0),
    countDelP: Number(k?.count_del_p ?? 0),
  };
}

interface CompanyKpi {
  companyId: number;
  companyName: string;
  kpi: DashboardKpi;
}

// โครงการที่ถูกยกเลิก — get_canceled_history (ปุ่ม "ประวัติงานยกเลิก" แบบเว็บ)
interface CanceledProject {
  id: number;
  displayCode: string;
  projectName: string;
  customerName: string;
  budget: number;
  cancelReason: string;
  canceledBy: string;
}

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

// ตรงกับ 1 แถวของ get_list / get_dashboard ใน README_project.md (108 คีย์ต่อแถวฝั่ง API —
// ที่นี่เลือกมาเฉพาะที่การ์ดบนมือถือใช้จริง ชื่อ field ยึดตาม JSON จริงทั้งหมด)
interface Project {
  id: number;
  code: string; // project_code เต็ม เช่น "2026-544"
  companyId: number;
  companyName: string;
  customerName: string;
  projectName: string;
  budget: number;
  paymentState: PaymentState;
  contractEndDateShow: string; // formatShortThaiDate(end_date) — "5/9/69" ('-' ถ้าไม่มี)
  contractDaysLeft: number | null; // contract_days_left
  contractDaysLeftText: string; // contract_countdown_text — ข้อความสำเร็จรูปจาก server
  contractUrgency: string; // contract_urgency: finished | overdue | warning | normal | none
  isPcAssembly: boolean; // is_pc_assembly
  jobType: string; // job_type_name
  statusRaw: string; // final_status — ใช้เทียบกับตัวกรองสถานะ
  statusShow: string; // status_show — ข้อความที่แสดงจริง (ต่างจาก final_status บางกรณี)
  badgeClass: string; // badge_class — ใช้เลือกจานสีป้ายสถานะ
  isFinished: boolean; // is_finished
  isCanceled: boolean; // is_canceled
  debtOwner: string | null; // debt_name
  debtIsTeam: boolean; // debt_type === 'ทีม'
  projectOwner: string; // sales_name
  salesIsTeam: boolean; // sales_type === 'ทีม'
  hasTech: boolean; // !empty(req_tech_team) || !empty(technicians)
  techTeam?: string; // req_tech_team
  techOnsite: boolean; // tech_onsite
  techOnsiteBy?: string; // tech_onsite_by
  techOnsiteAtThai?: string; // tech_onsite_at_thai
  isStockSite: boolean; // is_stock_site — ซ่อนไอคอน "จัดส่งหน้างาน" ถ้า true
  canceledBy?: string; // canceled_by
  cancelReason?: string; // cancel_reason
}

// popup "ดูรายละเอียด" — ตรงกับ key ที่ pjapi_row_to_json() ของ get_detail คืนจริง (อ่านตรงจาก
// mobile_api/modules/project_API_mobile.php ฝั่ง backend เอง ไม่ใช่การเดา) ชื่อคีย์เป็น snake_case
// ตามต้นฉบับทั้งหมด ไม่ map เป็น camelCase เพราะฟิลด์เยอะและใช้แสดงผลตรงๆ ในโมดัลเดียว
interface ProjectDetail {
  id: number;
  display_code: string;
  project_code: string;
  project_name: string;
  company_name: string;
  customer_name: string;
  customer_province: string;
  customer_address: string;
  customer_phone: string;
  customer_affiliation: string;
  contact_person: string;
  contact_phone: string;
  job_type_name: string;
  contract_no: string;
  purchase_order_no: string;
  contract_file: string;
  quotation_no: string;
  quote_creator: string;
  bidding_type: string;
  bidding_date: string;
  start_date: string;
  end_date: string;
  start_date_thai: string;
  end_date_thai: string;
  contract_duration: number;
  contract_unit: string;
  delivery_days: number;
  project_budget: number;
  submitted_price: number;
  factor_f: number;
  global_discount: number;
  global_discount_type: string;
  warranty_value: number;
  warranty_unit: string;
  net_warranty: string;
  guarantee_type: string;
  bank_name: string;
  bank_account: string;
  guarantee_no: string;
  guarantee_amount: number;
  guarantee_percent: number;
  guarantee_start_date: string;
  guarantee_end_date: string;
  status_show: string;
  badge_class: string;
  contract_days_left: number | null;
  contract_countdown_text: string;
  contract_urgency: string;
  warranty_days_left: number;
  warranty_countdown_text: string;
  warranty_urgency: string;
  warranty_end_date: string;
  alert_days_before_expire: number;
  alert_warranty_days: number;
  payment_state: string;
  sales_name: string;
  debt_type: string;
  debt_name: string;
  created_at: string;
  closed_at: string;
  recorder: string;
  last_editor: string;
  editor_count: number;
  technicians: string;
  tech_full_details: string;
  req_tech_team: string;
  tech_onsite: number;
  tech_onsite_by: string;
  tech_onsite_at: string;
  tech_onsite_at_thai: string;
  created_at_thai: string;
  closed_by: string;
  closed_at_thai: string;
  canceled_by: string;
  cancel_reason: string;
  inventory_remark: string;
  project_link: string;
}

// screenKey ตรงกับ target ของลิงก์จริงในเว็บ (href) — ใช้ map ไป navigation จริงตอนต่อ
export type QuickLinkScreenKey = 'estimate' | 'driverTasks' | 'guarantee' | 'accounting' | 'incomplete' | 'createProject';


// value ตรงกับ final_status จริงที่มีอยู่ใน DB (ดูตัวอย่างใน README_project.md 4.2/4.5)
// 'all' / 'not_closed' เป็นกลุ่มที่กรองฝั่งแอปจาก is_finished/is_canceled ไม่ใช่ค่า status จริง
const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'ทั้งหมด', value: 'all' },
  { label: 'ยังไม่ปิดจบ', value: 'not_closed' },
  { label: 'รอเซ็นสัญญา', value: 'รอเซ็นสัญญา' },
  { label: 'เซ็นสัญญา', value: 'เซ็นสัญญา' },
  { label: 'ปิดจบหน้างาน', value: 'ปิดจบหน้างาน' },
  { label: 'ชำระเรียบร้อย', value: 'ชำระเรียบร้อย' },
  { label: 'ยกเลิก', value: 'ยกเลิก' },
];

// การ์ดตัวเลข 14 ใบ (ธีมเดียวกับ project_dashboard.php บนเว็บ — ขอบซ้ายสี, ตัวเลขใหญ่ + "งาน")
// filter = ค่าใน STATUS_FILTERS ที่การ์ดนั้นกรองได้ (แตะเพื่อกรอง แตะซ้ำเพื่อล้าง) การ์ดที่ไม่มี filter ดูอย่างเดียว
// ส่วนของการ์ดภาพรวม — จัดการ์ด 14 ใบเป็น 4 หมวดตามขั้นตอนงาน (เรียงตามลำดับนี้)
type KpiGroupKey = 'overview' | 'contract' | 'supply' | 'alert';
// สีตามกติกาทั้งแอป: เขียว = เสร็จ, ส้ม = รอ/กำลังทำ, แดง = เกิน/ต้องจัดการ, เทา = ข้อมูลทั่วไป (ไม่ใช่สถานะ)
const KPI_GROUPS: { key: KpiGroupKey; label: string; icon: keyof typeof FontAwesome5.glyphMap; color: string }[] = [
  { key: 'overview', label: 'ภาพรวมโครงการ', icon: 'chart-bar', color: '#64748b' },
  { key: 'contract', label: 'สัญญา / เอกสาร / การชำระ', icon: 'file-contract', color: '#64748b' },
  { key: 'supply', label: 'จัดซื้อ / คลัง / จัดส่ง', icon: 'boxes', color: '#64748b' },
  { key: 'alert', label: 'แจ้งเตือน', icon: 'bell', color: '#64748b' },
];

const KPI_TILES: {
  key: keyof DashboardKpi;
  group: KpiGroupKey;
  label: string;
  icon: keyof typeof FontAwesome5.glyphMap;
  color: string;
  filter?: string;
  money?: boolean;
  highlight?: boolean;
}[] = [
  { key: 'totalProjects', group: 'overview', label: 'โครงการทั้งหมด', icon: 'folder-open', color: '#64748b', filter: 'all' },
  { key: 'notClosedProjects', group: 'overview', label: 'ยังไม่ปิดจบหน้างาน', icon: 'exclamation-circle', color: '#d97706', filter: 'not_closed', highlight: true },
  { key: 'forceClosedProjects', group: 'overview', label: 'ปิดจบหน้างาน', icon: 'flag-checkered', color: '#059669', filter: 'ปิดจบหน้างาน' },
  { key: 'totalBudget', group: 'overview', label: 'มูลค่างบประมาณรวม', icon: 'money-bill-wave', color: '#64748b', money: true },
  { key: 'waitingProjects', group: 'contract', label: 'รอเซ็นสัญญา', icon: 'hourglass-half', color: '#d97706', filter: 'รอเซ็นสัญญา' },
  { key: 'poProjects', group: 'contract', label: 'ใบสั่งซื้อ-จ้าง', icon: 'file-invoice', color: '#64748b' },
  { key: 'signedProjects', group: 'contract', label: 'สัญญา-จ้าง', icon: 'file-signature', color: '#64748b', filter: 'เซ็นสัญญา' },
  { key: 'countBuyP', group: 'supply', label: 'จัดซื้อบางส่วน', icon: 'shopping-basket', color: '#d97706' },
  { key: 'completedProjects', group: 'supply', label: 'สั่งซื้อครบแล้ว', icon: 'cart-plus', color: '#059669' },
  { key: 'countRecP', group: 'supply', label: 'คลังรับบางส่วน', icon: 'box-open', color: '#d97706' },
  { key: 'countDelP', group: 'supply', label: 'จัดส่งบางส่วน', icon: 'truck-loading', color: '#d97706' },
  { key: 'expiringProjects', group: 'alert', label: 'แจ้งเตือนครบกำหนดส่ง', icon: 'bell', color: '#dc2626' },
  { key: 'paidFullProjects', group: 'contract', label: 'ชำระเรียบร้อย', icon: 'award', color: '#059669', filter: 'ชำระเรียบร้อย' },
  { key: 'expiringWarranty', group: 'alert', label: 'แจ้งเตือนหมดประกัน', icon: 'shield-alt', color: '#dc2626' },
];

// ปุ่มเมนูลัดสีทึบแบบแถวปุ่มบนเว็บ — 'canceled' เปิดโมดัล "ประวัติงานยกเลิก" ในหน้านี้เอง
const WEB_QUICK_BUTTONS: { key: QuickLinkScreenKey | 'canceled'; label: string; icon: keyof typeof FontAwesome5.glyphMap; color: string }[] = [
  { key: 'driverTasks', label: 'ใบงานจัดส่ง', icon: 'truck', color: '#f59e0b' },
  { key: 'guarantee', label: 'หนังสือค้ำประกัน', icon: 'shield-alt', color: '#8b5cf6' },
  { key: 'accounting', label: 'บัญชีลูกหนี้', icon: 'file-invoice-dollar', color: '#06b6d4' },
  { key: 'incomplete', label: 'ข้อมูลตกหล่น', icon: 'exclamation-triangle', color: '#ea580c' },
  { key: 'canceled', label: 'ประวัติงานยกเลิก', icon: 'history', color: '#475569' },
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
  { key: 'edit', label: 'แก้ไข', icon: 'create-outline', color: '#4f46e5', targetNote: 'create_project.php?edit_id=' },
  { key: 'delivery', label: 'จัดส่งไปหน้างาน', icon: 'car-outline', color: '#d97706', targetNote: 'inventory_delivery.php?project_id=' },
  { key: 'accounting', label: 'บัญชี/ลูกหนี้', icon: 'document-text-outline', color: '#059669', targetNote: 'project_accounting.php?id=' },
];

// รายชื่อสำรองก่อนโหลด get_master_data.debt_present สำเร็จ (ดู loadMasterData ด้านล่าง)
const DEBT_OWNER_FALLBACK = ['คุณธนา', 'คุณสมชาย', 'คุณกานดา', 'คุณปิยะ', 'คุณอรทัย'];

// ====================================================================
// Helpers — ย่อจาก pd_compute_row_flags() / pd_render_*_badge() ของจริง
// ====================================================================

// แปลงข้อมูลดิบจาก backend ให้เข้ารูป ProjectItem — รองรับหลายชื่อ field เพราะยังไม่มี spec ยืนยัน
function mapProjectItem(raw: any): ProjectItem {
  return {
    id: Number(raw.id ?? 0),
    itemName: String(raw.itemName ?? raw.item_name ?? ''),
    boqQty: String(raw.boqQty ?? raw.boq_qty ?? ''),
    totalBuy: String(raw.totalBuy ?? raw.total_buy ?? ''),
    totalClaimBuy: String(raw.totalClaimBuy ?? raw.total_claim_buy ?? '0'),
    totalReceive: String(raw.totalReceive ?? raw.total_receive ?? ''),
    totalDelivered: String(raw.totalDelivered ?? raw.total_delivered ?? ''),
    totalClaimDelivered: String(raw.totalClaimDelivered ?? raw.total_claim_delivered ?? '0'),
    displayStatus: String(raw.displayStatus ?? raw.display_status ?? ''),
    color: String(raw.color ?? '#64748b'),
    bg: String(raw.bg ?? '#f1f5f9'),
  };
}

// แปลงแถวดิบจาก get_list / get_dashboard (project_API_mobile.php) ให้เข้ารูป Project
// ชื่อคีย์ทุกตัวยึดตาม README_project.md ข้อ 4.2 ตรงๆ ไม่มีการเดาชื่อ
function mapProject(raw: any): Project {
  return {
    id: Number(raw.id ?? raw.project_id ?? 0),
    code: String(raw.project_code ?? ''),
    companyId: Number(raw.company_id ?? 0),
    companyName: String(raw.company_name ?? ''),
    customerName: String(raw.customer_name ?? ''),
    projectName: String(raw.project_name ?? ''),
    budget: Number(raw.project_budget ?? 0),
    paymentState: (raw.payment_state ?? 'unpaid') as PaymentState,
    // ใช้ end_date ดิบ (YYYY-MM-DD) มาฟอร์แมตเองเป็น "d/m/yy" แทน end_date_show ของเซิร์ฟเวอร์
    // (ซึ่งเป็น "30/05/2026" ปี ค.ศ. 4 หลัก) ให้ตรงกับรูปแบบวันที่สั้นที่ใช้ทั้งแอปเป๊ะ
    contractEndDateShow: raw.end_date ? formatShortThaiDate(String(raw.end_date)) : '-',
    contractDaysLeft: raw.contract_days_left === null || raw.contract_days_left === undefined ? null : Number(raw.contract_days_left),
    contractDaysLeftText: String(raw.contract_countdown_text ?? '-'),
    contractUrgency: String(raw.contract_urgency ?? 'none'),
    isPcAssembly: Boolean(Number(raw.is_pc_assembly ?? 0)),
    jobType: String(raw.job_type_name ?? ''),
    statusRaw: String(raw.final_status ?? ''),
    statusShow: String(raw.status_show ?? raw.final_status ?? ''),
    badgeClass: String(raw.badge_class ?? ''),
    isFinished: Boolean(Number(raw.is_finished ?? 0)),
    isCanceled: Boolean(Number(raw.is_canceled ?? 0)),
    debtOwner: raw.debt_name ? String(raw.debt_name) : null,
    debtIsTeam: raw.debt_type === 'ทีม',
    projectOwner: String(raw.sales_name ?? ''),
    salesIsTeam: raw.sales_type === 'ทีม',
    hasTech: Boolean(raw.req_tech_team) || Boolean(raw.technicians),
    techTeam: raw.req_tech_team || undefined,
    techOnsite: Boolean(Number(raw.tech_onsite ?? 0)),
    techOnsiteBy: raw.tech_onsite_by || undefined,
    techOnsiteAtThai: raw.tech_onsite_at_thai || undefined,
    isStockSite: Boolean(Number(raw.is_stock_site ?? 0)),
    canceledBy: raw.canceled_by || undefined,
    cancelReason: raw.cancel_reason || undefined,
  };
}

function formatBaht(n: number): string {
  return '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ยอดเงิน 2 ทศนิยม — ใช้ในการ์ดสรุปพื้นเข้ม ให้หน้าตาตรงกับการ์ดสรุปของหน้าเอกสาร PO/AX ("11,440.00 ฿")
function num2(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// จำนวนที่ตัดทศนิยม/เลข 0 ท้ายทิ้ง (เทียบเท่า rtrim(rtrim(number_format($n,2),'0'),'.') ของเว็บ)
function rtrimNum(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// ถอดรูปแบบข้อความ tech_full_details 1 รายการ ("ร้าน (ช่าง) - ความเชี่ยวชาญ [จ.จังหวัด] [ติดต่อ: เบอร์]")
// ออกเป็นฟิลด์แยก — พอร์ตตรงจาก project_dashboard.php:6300-6313 (ส่วน modal-technicians)
function parseTechFullText(fullText: string) {
  const shop = fullText.split('(')[0].trim() || 'ไม่ระบุร้าน';
  const technician = fullText.includes('(') ? fullText.split('(')[1].split(')')[0].trim() : '-';
  const specialty = fullText.includes('-') ? fullText.split('-')[1].split('[')[0].trim() : '-';
  const province = fullText.includes('[จ.') ? fullText.split('[จ.')[1].split(']')[0].trim() : '-';
  const contact = fullText.includes('[ติดต่อ:') ? fullText.split('[ติดต่อ:')[1].split(']')[0].trim() : '-';
  const isPlainText = shop === fullText && !fullText.includes('[');
  return { shop, technician, specialty, province, contact, isPlainText };
}

// จัดกลุ่ม req_tech_team / technicians / tech_full_details เป็นทีมๆ — พอร์ตตรงจาก
// project_dashboard.php:6265-6297 (ตรรกะจับคู่แบบเดียวกับเว็บเป๊ะ รวมพฤติกรรม "ทีมสุดท้ายกวาด
// รายการที่เหลือทั้งหมด" ที่ดูแปลกแต่ต้องคงไว้ให้ตรงกับของจริง)
function groupTechTeams(reqTeam?: string, displayTechs?: string, techFull?: string) {
  const hasTeams = !!reqTeam && reqTeam.trim() !== '' && reqTeam.trim() !== '-';
  const hasDisplayTechs = !!displayTechs && displayTechs.trim() !== '' && displayTechs.trim() !== '-';
  const hasFullDetails = !!techFull && techFull.trim() !== '' && techFull.trim() !== '-';
  if (!hasTeams && !hasDisplayTechs && !hasFullDetails) return [];

  const teams = hasTeams ? reqTeam!.split(',').map((t) => t.trim()).filter(Boolean) : ['ทีมช่างหลัก'];
  const displayArr = hasDisplayTechs ? displayTechs!.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const fullArr = hasFullDetails ? techFull!.split(',').map((t) => t.trim()).filter(Boolean) : [];

  return teams.map((teamName, index) => {
    const isLast = index === teams.length - 1;
    const matchedDisplay = isLast ? displayArr.slice(index) : displayArr[index] ? [displayArr[index]] : [];
    const matchedFull = isLast ? fullArr.slice(index) : fullArr[index] ? [fullArr[index]] : [];
    const itemCount = Math.max(matchedDisplay.length, matchedFull.length);
    const items: { dispName: string; fullText: string }[] = [];
    for (let i = 0; i < itemCount; i++) {
      const dispName = (matchedDisplay[i] ?? '').trim();
      const fullText = (matchedFull[i] ?? '').trim() || dispName;
      if (!fullText) continue;
      items.push({ dispName, fullText });
    }
    return { teamName, items };
  });
}

// แถวข้อมูล label/value ใน modal "ดูรายละเอียด" — ไม่แสดงแถวถ้าไม่มีค่า (ตัดช่องว่างรกจอ)
function DetailRow({ label, value, valueColor, extra }: { label: string; value?: string | number | null; valueColor?: string; extra?: ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.detailValue, valueColor ? { color: valueColor, fontWeight: '900' } : null]}>{String(value)}</Text>
        {extra}
      </View>
    </View>
  );
}

// วันที่ในหน้ารายละเอียดโครงการแสดงแบบเว็บ: DD/MM/YYYY (ปี ค.ศ.) [HH:MM] — รับ 'YYYY-MM-DD[ HH:MM:SS]'
function fmtDateCE(s?: string | null): string {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m || m[1] === '0000') return '';
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]} น.` : ''}`;
}

function DetailSectionTitle({ children }: { children: string }) {
  return <Text style={styles.detailSectionTitle}>{children}</Text>;
}

// กล่อง/ล็อคแยกแต่ละหัวข้อในป๊อปอัพ "ดูรายละเอียดโครงการ" ให้ดูเป็นระเบียบ แทนที่จะเป็นรายการยาวๆ
// ต่อเนื่องกันหมด
function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.detailSection}>
      <DetailSectionTitle>{title}</DetailSectionTitle>
      <View style={styles.detailSectionBox}>{children}</View>
    </View>
  );
}

// รหัสงานที่แสดง = ส่วนหลัง '-' ของ project_code เหมือน PHP: explode('-', code)[1] ?? code
function displayCode(code: string): string {
  const parts = code.split('-');
  return parts[1] ?? code;
}

// จานสีตาม badge_class ที่ server คำนวณมาให้แล้ว (project_dashboard_helpers.php) — แอปแค่เลือกสี
// ไม่ได้ตัดสินเองว่าสถานะไหนควรเป็นสีอะไรจาก final_status ตรงๆ (นั่นคือ business logic ฝั่ง PHP)
// สีป้ายสถานะตามกติกาทั้งแอป: ส้ม = รอ/กำลังดำเนินการ, เขียว = ปิดจบ/ชำระครบ, แดง = เกิน/มีปัญหา
const BADGE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  'badge-warning': { bg: '#fffbeb', fg: '#b45309', border: '#fcd34d' },
  'badge-purchasing': { bg: '#fffbeb', fg: '#b45309', border: '#fcd34d' },
  'badge-po': { bg: '#fffbeb', fg: '#b45309', border: '#fcd34d' },
  'badge-purchase-complete': { bg: '#fffbeb', fg: '#b45309', border: '#fcd34d' },
  'badge-success': { bg: '#ecfdf5', fg: '#059669', border: '#6ee7b7' },
  'badge-completed': { bg: '#ecfdf5', fg: '#059669', border: '#6ee7b7' },
  'badge-paid-full-status': { bg: '#ecfdf5', fg: '#059669', border: '#6ee7b7' },
  'badge-danger': { bg: '#fef2f2', fg: '#dc2626', border: '#fca5a5' },
};

function statusMeta(p: Project): { bg: string; fg: string; border: string; icon: keyof typeof Ionicons.glyphMap } {
  if (p.isCanceled) return { bg: '#f1f5f9', fg: '#64748b', border: '#cbd5e1', icon: 'ban-outline' };
  const c = BADGE_COLORS[p.badgeClass] ?? { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' };
  return { ...c, icon: p.isFinished ? 'flag-outline' : 'time-outline' };
}

// ข้อความ/สีนับถอยหลังสัญญามาจาก server ตรงๆ (contract_countdown_text / contract_urgency) —
// เทียบเท่า contract_countdown_html เดิมของเว็บ ที่แตกออกเป็น 3 คีย์แล้ว (README_project.md ข้อ 4.3)
const CONTRACT_URGENCY_META: Record<string, { fg: string; bg?: string; icon: keyof typeof Ionicons.glyphMap }> = {
  finished: { fg: '#10b981', icon: 'checkmark-circle' },
  overdue: { fg: '#fff', bg: '#ef4444', icon: 'alert-circle' },
  warning: { fg: '#ef4444', bg: '#fee2e2', icon: 'time' },
  normal: { fg: '#10b981', icon: 'time-outline' },
  none: { fg: '#94a3b8', icon: 'remove-outline' },
};

function contractCountdown(p: Project): { text: string; fg: string; bg?: string; icon: keyof typeof Ionicons.glyphMap } {
  const meta = CONTRACT_URGENCY_META[p.contractUrgency] ?? CONTRACT_URGENCY_META.none;
  return { text: p.contractDaysLeftText, ...meta };
}

// list/dashboard คืนมาแค่ is_pc_assembly (0/1) ไม่มีจำนวนชิ้นย่อยเหมือนหน้าเว็บเต็ม
function assemblyMeta(p: Project): { text: string; fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap } | null {
  if (!p.isPcAssembly) return null;
  return { text: 'มีประกอบคอม', fg: '#0ea5e9', bg: '#f0f9ff', icon: 'settings-outline' };
}

function paymentMeta(state: PaymentState): { text: string; fg: string; bg: string } | null {
  if (state === 'paid_partial') return { text: 'จ่ายบางส่วน', fg: '#d97706', bg: '#fffbeb' };
  if (state === 'unpaid') return { text: 'รอชำระเงิน', fg: '#ef4444', bg: '#fef2f2' };
  return null; // paid_full แสดงผ่านป้ายรหัสงานสีม่วงแทน (ดู renderProjectCard)
}

// เทียบเท่า .modal-header ของ project_dashboard.php — ทุก modal ใช้โครงเดียวกัน (แถบไล่สี +
// ไอคอน/หัวข้อสีขาว + ปุ่มปิดวงกลมมุมขวาบน) ต่างกันแค่ชุดสีตามความหมายของแต่ละ modal
// เพื่อให้ modal ทุกอันในหน้านี้ "เป็นชุดเดียวกัน" แทนที่จะมีหน้าตาไม่ตรงกันแบบเดิม
function ModalHeader({
  icon,
  title,
  colors,
  onClose,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  colors: [string, string];
  onClose: () => void;
}) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeaderBar}>
      <View style={styles.modalHeaderTitleRow}>
        <Ionicons name={icon} size={18} color="#ffffff" />
        <Text style={styles.modalHeaderTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} hitSlop={8}>
        <Ionicons name="close" size={16} color="#ffffff" />
      </TouchableOpacity>
    </LinearGradient>
  );
}

// ====================================================================
// Main screen
// ====================================================================

export interface ProjectDashboardScreenProps {
  // เรียกเมื่อแตะปุ่มลัดด้านบน (ทุนตั้งต้น/ใบงานจัดส่ง/ฯลฯ) — ถ้าไม่ส่งมาจะโชว์ Alert stub แทน
  onNavigate?: (screen: QuickLinkScreenKey) => void;
}

export default function ProjectDashboardScreen({ onNavigate }: ProjectDashboardScreenProps = {}) {
  const { user } = useAuth();
  const router = useRouter();

  // ไม่มี navigation library ต่อจากภายนอก (onNavigate) -> สลับหน้าเองภายในไฟล์นี้
  // ตอนนี้มีแค่ 'estimate' (ทุนตั้งต้น) ที่สร้างสกรีนจริงแล้ว ปุ่มอื่นยังเป็น Alert stub
  const [activeScreen, setActiveScreen] = useState<
    'dashboard' | 'estimate' | 'driverTasks' | 'guarantee' | 'accounting' | 'incomplete' | 'createProject' | 'projectAccounting' | 'editProject' | 'delivery'
  >('dashboard');
  // project_id ที่กำลังดูบัญชี — ตั้งก่อนสลับ activeScreen แล้วส่งเป็น prop ตรงๆ (ดู handleLinkIcon)
  const [accountingProjectId, setAccountingProjectId] = useState<string | undefined>(undefined);
  // project_id ที่กำลังแก้ไข — ส่งเป็น editId prop ให้ CreateProjectScreen โหลด get_detail เอง
  const [editProjectId, setEditProjectId] = useState<string | undefined>(undefined);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  // ตัวเลือกปีในป็อปอัพ — เริ่มด้วยปีปัจจุบัน แล้วแทนด้วยปีที่มีข้อมูลจริงจาก get_master_data
  const [yearOptions, setYearOptions] = useState<number[]>([new Date().getFullYear()]);
  const [kpi, setKpi] = useState<DashboardKpi>(EMPTY_KPI);
  const [kpiTotals, setKpiTotals] = useState({ inclCancel: 0, cancelled: 0 });
  const [kpiByCompany, setKpiByCompany] = useState<CompanyKpi[]>([]);
  // "สรุปข้อมูลแยกตามบริษัท" (พับไว้ก่อน) + โมดัล "ประวัติงานยกเลิก" (get_canceled_history)
  const [companyBreakdownOpen, setCompanyBreakdownOpen] = useState(false);
  // การ์ดตัวเลขบนสุด: พับไว้ (โชว์ 4 ใบหลัก) จนกว่าจะกด "ดูทั้งหมด"
  const [kpiExpanded, setKpiExpanded] = useState(false);
  const [expandedCompanyId, setExpandedCompanyId] = useState<number | null>(null);
  const [masterCompanies, setMasterCompanies] = useState<{ id: number; name: string }[]>([]);
  const [canceledModal, setCanceledModal] = useState<{ visible: boolean; loading: boolean; list: CanceledProject[]; total: number; totalBudget: number }>({
    visible: false, loading: false, list: [], total: 0, totalBudget: 0,
  });
  const [debtOwnerOptions, setDebtOwnerOptions] = useState<string[]>(DEBT_OWNER_FALLBACK);
  // ตัวกรองสถานะ/บริษัทอยู่ใน bottom sheet (แบบหน้าเอกสาร PO/AX) — แถบค้นหาด้านบนติดค้างตลอด
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // เมนู ⋯ ในหน้ารายละเอียด — รวม action ที่ย้อน/ทำลายสถานะ (ยกเลิกโครงการ, ยกเลิกปิดจบ) ไว้ที่เดียว
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const userId = user?.id;

  // ออกจากหน้านี้ (สลับไปเมนูอื่นใน drawer) แล้วกลับเข้ามาใหม่ -> รีเซ็ตกลับหน้าหลักเสมอ
  // ไม่งั้น drawer จะคง activeScreen เดิมไว้ (เช่นค้างอยู่หน้าสร้าง/แก้ไขโครงการ) เพราะสกรีนไม่ได้ unmount ตอนสลับแท็บ
  useFocusEffect(
    useCallback(() => {
      return () => {
        setActiveScreen('dashboard');
        setDetailModal((s) => ({ ...s, visible: false }));
        setMoreMenuOpen(false);
        setFilterSheetOpen(false);
      };
    }, [])
  );

  // get_list — README_project.md ข้อ 4.2 (โหลดทั้งปีมาครั้งเดียว แล้วกรอง search/บริษัท/สถานะในแอป
  // เหมือนพฤติกรรมเดิมของหน้านี้ ตัวข้อมูลทุกฟิลด์ยังมาจาก server ตรงๆ ไม่ได้คำนวณเอง)
  const loadProjects = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userId) return;
    if (!opts?.silent) setLoading(true);
    setLoadError(null);
    try {
      const res = await apiMobileGet(PROJECT_API_URL, 'get_list', { user_id: userId, year: selectedYear, limit: 500 });
      const list = Array.isArray(res.list) ? res.list : [];
      setProjects(list.map(mapProject));
    } catch (e) {
      console.error('project_API_mobile get_list failed', e);
      setLoadError('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, selectedYear]);

  // get_dashboard — การ์ด KPI บนสุด ตัวเลขทั้งหมดมาจาก kpi_all ตรงๆ (README_project.md ข้อ 4.1)
  const loadDashboard = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiMobileGet(PROJECT_API_URL, 'get_dashboard', { user_id: userId, year: selectedYear });
      setKpi(mapKpi(res.kpi_all ?? {}));
      setKpiTotals({ inclCancel: Number(res.total_incl_cancel ?? 0), cancelled: Number(res.cancelled_projects ?? 0) });
      setKpiByCompany(
        Array.isArray(res.kpi_by_company)
          ? res.kpi_by_company.map((c: any) => ({ companyId: Number(c.company_id ?? 0), companyName: String(c.company_name ?? ''), kpi: mapKpi(c) }))
          : []
      );
    } catch (e) {
      console.error('project_API_mobile get_dashboard failed', e);
    }
  }, [userId, selectedYear]);

  // get_master_data — popup "เลือกผู้รับผิดชอบติดตามหนี้" ต้องใช้รายชื่อพนักงานทั้งหมด (users)
  // เหมือนเว็บ (PD_DEBT_USERS <- $pd_users_array <- SELECT fullname FROM users) ไม่ใช่ debt_present
  // ซึ่งเป็นลิสต์สั้นสำหรับ "ตัวกรอง" ใต้หัวตารางเท่านั้น (คนละจุดกับ popup นี้)
  const loadMasterData = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiMobileGet(PROJECT_API_URL, 'get_master_data', { user_id: userId, year: selectedYear });
      // ปีที่เลือกได้ = ปีที่มีโครงการจริง (get_master_data.years: DISTINCT YEAR(created_at) จาก projects)
      // ปีไหนไม่มีข้อมูลก็ไม่ขึ้นให้กด — ถ้าปีที่เลือกอยู่ไม่มีข้อมูล เลื่อนไปปีล่าสุดที่มีข้อมูลให้เอง
      if (Array.isArray(res.years) && res.years.length > 0) {
        const ys: number[] = res.years.map((y: any) => Number(y)).filter((y: number) => y > 0);
        if (ys.length > 0) {
          setYearOptions(ys);
          setSelectedYear((cur) => (ys.includes(cur) ? cur : ys[0]));
        }
      }
      // รายชื่อบริษัททั้งหมด (เรียงตาม list_order แบบเว็บ) — kpi_by_company มีเฉพาะบริษัทที่มีงานในปีนั้น
      if (Array.isArray(res.companies)) {
        setMasterCompanies(
          res.companies.map((c: any) => ({ id: Number(c.id ?? 0), name: String(c.display_name || c.company_shortname || c.company_name || '') }))
        );
      }
      if (Array.isArray(res.users) && res.users.length > 0) {
        setDebtOwnerOptions(res.users.map((n: any) => String(n)));
      } else if (Array.isArray(res.debt_present) && res.debt_present.length > 0) {
        setDebtOwnerOptions(res.debt_present.map((n: any) => String(n)));
      }
    } catch (e) {
      console.error('project_API_mobile get_master_data failed', e);
      // เงียบไว้ — มีลิสต์สำรอง (DEBT_OWNER_FALLBACK) ให้ใช้ต่อได้อยู่แล้ว
    }
  }, [userId, selectedYear]);

  useEffect(() => {
    loadProjects();
    loadDashboard();
    loadMasterData();
  }, [loadProjects, loadDashboard, loadMasterData]);

  function onRefresh() {
    setRefreshing(true);
    loadProjects({ silent: true });
    loadDashboard();
  }

  const [cancelFormModal, setCancelFormModal] = useState<{ visible: boolean; project?: Project }>({ visible: false });
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [cancelViewModal, setCancelViewModal] = useState<{ visible: boolean; project?: Project }>({ visible: false });
  const [debtModal, setDebtModal] = useState<{ visible: boolean; project?: Project }>({ visible: false });
  const [debtSearch, setDebtSearch] = useState('');
  const [itemStatusModal, setItemStatusModal] = useState<{ visible: boolean; project?: Project; items: ProjectItem[]; loading: boolean }>({
    visible: false,
    items: [],
    loading: false,
  });

  // เปิด modal สถานะอุปกรณ์ + ยิง ajax_get_item_status.php แยกต่างหาก (ไม่ใช่ embed มากับรายการหลัก
  // และไม่มี action เทียบเท่าใน project_API_mobile.php — ดูหมายเหตุหัวไฟล์)
  async function openItemStatus(project: Project) {
    if (!userId) return;
    setItemStatusModal({ visible: true, project, items: [], loading: true });
    try {
      const res = await apiMobileGet(PROJECT_ITEMS_API_URL, 'get_item_status', { user_id: userId, project_id: project.id });
      const list: any[] = Array.isArray(res.data) ? res.data : [];
      setItemStatusModal((s) => (s.project?.id === project.id ? { ...s, items: list.map(mapProjectItem), loading: false } : s));
    } catch (e) {
      console.error('load ajax_get_item_status failed', e);
      setItemStatusModal((s) => (s.project?.id === project.id ? { ...s, loading: false } : s));
    }
  }

  // หมายเหตุ PO ต่อ 1 รายการสินค้า — project_items_API_mobile.php (get_po_remark_log/save_po_note/
  // edit_po_note/delete_po_note) แก้/ลบได้เฉพาะข้อความที่ตัวเองบันทึก (เทียบชื่อ fullname เหมือนเว็บ)
  const [poNoteModal, setPoNoteModal] = useState<{
    visible: boolean;
    itemId?: number;
    itemName?: string;
    poId?: number;
    poNumber?: string;
    logs: { user: string; datetime: string; note: string }[];
    loading: boolean;
    text: string;
    editingIndex: number | null;
    saving: boolean;
  }>({ visible: false, logs: [], loading: false, text: '', editingIndex: null, saving: false });

  async function loadPoNotes(itemId: number, itemName: string, poId: number, poNumber: string) {
    if (!userId) return;
    setPoNoteModal({ visible: true, itemId, itemName, poId, poNumber, logs: [], loading: true, text: '', editingIndex: null, saving: false });
    try {
      const res = await apiMobileGet(PROJECT_ITEMS_API_URL, 'get_po_remark_log', { user_id: userId, po_id: poId, item_id: itemId });
      setPoNoteModal((s) => (s.itemId === itemId && s.poId === poId ? { ...s, logs: res.logs ?? [], loading: false } : s));
    } catch (e: any) {
      setPoNoteModal((s) => ({ ...s, loading: false }));
      Alert.alert('โหลดหมายเหตุไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // กดปุ่ม "หมายเหตุ" ที่แถวรายการ — ถ้ามี PO เดียวเปิดตรง ถ้ามีหลายใบให้เลือกก่อน
  async function openPoNotesForItem(itemId: number, itemName: string) {
    if (!userId) return;
    try {
      const res = await apiMobileGet(PROJECT_ITEMS_API_URL, 'get_item_pos', { user_id: userId, item_id: itemId });
      const pos: { po_id: number; po_number: string }[] = res.pos ?? [];
      if (pos.length === 0) {
        Alert.alert('ยังไม่มี PO', 'รายการนี้ยังไม่ถูกสั่งซื้อ จึงยังไม่มีหมายเหตุ PO ให้บันทึก');
        return;
      }
      if (pos.length === 1) {
        void loadPoNotes(itemId, itemName, pos[0].po_id, pos[0].po_number || `PO #${pos[0].po_id}`);
        return;
      }
      Alert.alert(
        'เลือกใบสั่งซื้อ (PO)',
        'รายการนี้มีมากกว่า 1 PO เลือกใบที่ต้องการดู/บันทึกหมายเหตุ',
        pos.map((p) => ({ text: p.po_number || `PO #${p.po_id}`, onPress: () => void loadPoNotes(itemId, itemName, p.po_id, p.po_number || `PO #${p.po_id}`) }))
      );
    } catch (e: any) {
      Alert.alert('โหลดข้อมูลไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  async function confirmPoNoteSave() {
    const { itemId, poId, text, editingIndex } = poNoteModal;
    if (!userId || !itemId || !poId) return;
    if (!text.trim()) {
      Alert.alert('กรุณากรอกหมายเหตุ', 'ยังไม่ได้พิมพ์ข้อความ');
      return;
    }
    setPoNoteModal((s) => ({ ...s, saving: true }));
    try {
      const action = editingIndex === null ? 'save_po_note' : 'edit_po_note';
      const fields: Record<string, string | number> = { user_id: userId, po_id: poId, item_id: itemId, note: text.trim() };
      if (editingIndex !== null) fields.log_index = editingIndex;
      const res = await apiMobilePost(PROJECT_ITEMS_API_URL, action, fields);
      setPoNoteModal((s) => ({ ...s, logs: res.logs ?? s.logs, text: '', editingIndex: null, saving: false }));
    } catch (e: any) {
      setPoNoteModal((s) => ({ ...s, saving: false }));
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  function confirmPoNoteDelete(index: number) {
    Alert.alert('ยืนยันลบหมายเหตุ?', 'ลบแล้วไม่สามารถกู้คืนได้', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: async () => {
          const { itemId, poId } = poNoteModal;
          if (!userId || !itemId || !poId) return;
          try {
            const res = await apiMobilePost(PROJECT_ITEMS_API_URL, 'delete_po_note', { user_id: userId, po_id: poId, item_id: itemId, log_index: index });
            setPoNoteModal((s) => ({ ...s, logs: res.logs ?? s.logs }));
          } catch (e: any) {
            Alert.alert('ลบไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
          }
        },
      },
    ]);
  }

  // ---- จัดการ PO ต่อรายการสินค้า (จำนวน/ราคา/ใบกำกับ/สลิป/ลบ) + ใช้จากสต๊อก + รวมค่าแรงช่าง ----
  // project_items_API_mobile.php: get_item_pos (เวอร์ชันขยาย), update_tax_invoice, upload_slip,
  // delete_po, delete_po_item, delete_project_item, use_from_stock, set_labor_merge
  interface PoLine {
    poi_id: number; po_id: number; po_number: string; order_date: string; supplier_name: string;
    has_tax_invoice: number; tax_invoice_2: number; slip_file: string;
    buy_quantity: number; buy_unit_price: number; total_price: number; note: string; is_claim: number;
  }
  const [poManageModal, setPoManageModal] = useState<{
    visible: boolean; itemId?: number; itemName?: string; itemPurchaseStatus?: string; lines: PoLine[]; loading: boolean; busyPoiId?: number;
  }>({ visible: false, lines: [], loading: false });

  async function openPoManage(itemId: number, itemName: string) {
    if (!userId) return;
    setPoManageModal({ visible: true, itemId, itemName, lines: [], loading: true });
    try {
      const res = await apiMobileGet(PROJECT_ITEMS_API_URL, 'get_item_pos', { user_id: userId, item_id: itemId });
      setPoManageModal((s) => (s.itemId === itemId ? { ...s, lines: res.pos ?? [], itemPurchaseStatus: res.item_purchase_status ?? '', loading: false } : s));
    } catch (e: any) {
      setPoManageModal((s) => ({ ...s, loading: false }));
      Alert.alert('โหลดข้อมูลไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  function refreshPoManage() {
    if (poManageModal.itemId) void openPoManage(poManageModal.itemId, poManageModal.itemName ?? '');
  }

  async function toggleTaxInvoice(poId: number, docType: 'inv1' | 'inv2') {
    if (!userId) return;
    try {
      await apiMobilePost(PROJECT_ITEMS_API_URL, 'update_tax_invoice', { user_id: userId, po_id: poId, doc_type: docType });
      refreshPoManage();
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  async function attachSlip(poId: number) {
    if (!userId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('แจ้งเตือน', 'กรุณาอนุญาตการเข้าถึงคลังรูป');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    const uri = r.assets[0].uri;
    const ext = (uri.split('.').pop() || 'jpg').toLowerCase();
    setPoManageModal((s) => ({ ...s, busyPoiId: -1 }));
    try {
      const fd = new FormData();
      fd.append('action', 'upload_slip');
      fd.append('user_id', String(userId));
      fd.append('po_id', String(poId));
      fd.append('slip_file', { uri, name: `slip_${poId}.${ext}`, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` } as any);
      const res = await axios.post(PROJECT_ITEMS_API_URL, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if ((res.data as any)?.status !== 'success') throw new Error((res.data as any)?.message || 'แนบสลิปไม่สำเร็จ');
      refreshPoManage();
    } catch (e: any) {
      Alert.alert('แนบสลิปไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    } finally {
      setPoManageModal((s) => ({ ...s, busyPoiId: undefined }));
    }
  }

  // เหตุผลการลบ — ใช้ร่วมกันทั้ง delete_po และ delete_po_item
  const [deleteReasonModal, setDeleteReasonModal] = useState<{ visible: boolean; kind?: 'po' | 'po_item'; poId?: number; poiId?: number; reason: string; saving: boolean }>({
    visible: false,
    reason: '',
    saving: false,
  });

  async function confirmDeleteReason() {
    const { kind, poId, poiId, reason } = deleteReasonModal;
    if (!userId || !poManageModal.itemId) return;
    if (!reason.trim()) {
      Alert.alert('กรุณาระบุเหตุผล', 'ต้องกรอกเหตุผลที่ลบก่อนยืนยัน');
      return;
    }
    setDeleteReasonModal((s) => ({ ...s, saving: true }));
    try {
      if (kind === 'po' && poId) {
        await apiMobilePost(PROJECT_ITEMS_API_URL, 'delete_po', { user_id: userId, po_id: poId, project_id: itemStatusModal.project?.id, reason: reason.trim() });
      } else if (kind === 'po_item' && poiId) {
        await apiMobilePost(PROJECT_ITEMS_API_URL, 'delete_po_item', { user_id: userId, poi_id: poiId, project_id: itemStatusModal.project?.id, reason: reason.trim() });
      }
      setDeleteReasonModal({ visible: false, reason: '', saving: false });
      refreshPoManage();
    } catch (e: any) {
      setDeleteReasonModal((s) => ({ ...s, saving: false }));
      Alert.alert('ลบไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  function confirmDeleteWholeItem() {
    const itemId = poManageModal.itemId;
    if (!itemId || !userId) return;
    Alert.alert(
      'ยืนยันลบรายการสินค้านี้',
      `จะลบ "${poManageModal.itemName}" พร้อมประวัติการสั่งซื้อ/รับเข้าคลัง/จัดส่งทั้งหมดถาวร ย้อนกลับไม่ได้ ใช่หรือไม่?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ใช่, ลบถาวร',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiMobilePost(PROJECT_ITEMS_API_URL, 'delete_project_item', { user_id: userId, 'item_ids[]': itemId });
              setPoManageModal({ visible: false, lines: [], loading: false });
              const p = itemStatusModal.project;
              if (p) void openItemStatus(p);
            } catch (e: any) {
              Alert.alert('ลบไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
            }
          },
        },
      ]
    );
  }

  // ใช้จากสต๊อก (สร้าง PO+รับของ "ใช้ในสต๊อก" จริง) — ฟอร์มง่ายๆ: จำนวน/ราคาต่อหน่วย/ผู้เบิก
  const [stockUseModal, setStockUseModal] = useState<{ visible: boolean; qty: string; unitPrice: string; withdrawUser: string; saving: boolean }>({
    visible: false,
    qty: '',
    unitPrice: '',
    withdrawUser: '',
    saving: false,
  });

  async function confirmUseFromStock() {
    const itemId = poManageModal.itemId;
    const projectId = itemStatusModal.project?.id;
    if (!userId || !itemId || !projectId) return;
    const qtyNum = Number(stockUseModal.qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      Alert.alert('กรอกจำนวนไม่ถูกต้อง', 'กรุณาระบุจำนวนที่จะเบิกเป็นตัวเลขมากกว่า 0');
      return;
    }
    setStockUseModal((s) => ({ ...s, saving: true }));
    try {
      await apiMobilePost(PROJECT_ITEMS_API_URL, 'use_from_stock', {
        user_id: userId,
        project_id: projectId,
        item_id: itemId,
        qty: qtyNum,
        unit_price: Number(stockUseModal.unitPrice) || 0,
        withdraw_user: stockUseModal.withdrawUser.trim() || 'ไม่ระบุ',
      });
      setStockUseModal({ visible: false, qty: '', unitPrice: '', withdrawUser: '', saving: false });
      refreshPoManage();
    } catch (e: any) {
      setStockUseModal((s) => ({ ...s, saving: false }));
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // รวม/ยกเลิกรวมเป็น "ค่าแรงช่าง" — รวมไม่ต้องมีหมายเหตุ, ยกเลิกต้องกรอกเหตุผลเสมอ (กติกาเดียวกับเว็บ)
  const [laborUnmergeNoteModal, setLaborUnmergeNoteModal] = useState<{ visible: boolean; note: string; saving: boolean }>({ visible: false, note: '', saving: false });

  async function mergeAsLabor() {
    const itemId = poManageModal.itemId;
    const projectId = itemStatusModal.project?.id;
    if (!userId || !itemId || !projectId) return;
    try {
      await apiMobilePost(PROJECT_ITEMS_API_URL, 'set_labor_merge', { user_id: userId, project_id: projectId, mode: 'merge', 'item_ids[]': itemId });
      refreshPoManage();
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  async function confirmUnmergeLabor() {
    const itemId = poManageModal.itemId;
    const projectId = itemStatusModal.project?.id;
    if (!userId || !itemId || !projectId) return;
    if (!laborUnmergeNoteModal.note.trim()) {
      Alert.alert('กรุณาระบุหมายเหตุ', 'ต้องกรอกเหตุผลที่ยกเลิกรวมค่าแรงก่อนยืนยัน');
      return;
    }
    setLaborUnmergeNoteModal((s) => ({ ...s, saving: true }));
    try {
      await apiMobilePost(PROJECT_ITEMS_API_URL, 'set_labor_merge', {
        user_id: userId, project_id: projectId, mode: 'unmerge', 'item_ids[]': itemId, note: laborUnmergeNoteModal.note.trim(),
      });
      setLaborUnmergeNoteModal({ visible: false, note: '', saving: false });
      refreshPoManage();
    } catch (e: any) {
      setLaborUnmergeNoteModal((s) => ({ ...s, saving: false }));
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // ---- ประวัติการลบ PO/รายการสินค้า + ประวัติยกเลิกรวมค่าแรงช่าง (อ่านอย่างเดียว ระดับโครงการ) ----
  const [historyLogModal, setHistoryLogModal] = useState<{ visible: boolean; kind?: 'delete' | 'unmerge'; logs: any[]; loading: boolean }>({
    visible: false,
    logs: [],
    loading: false,
  });

  async function openHistoryLog(kind: 'delete' | 'unmerge') {
    const project = itemStatusModal.project;
    if (!userId || !project) return;
    setHistoryLogModal({ visible: true, kind, logs: [], loading: true });
    try {
      const res = await apiMobileGet(PROJECT_ITEMS_API_URL, kind === 'delete' ? 'get_delete_logs' : 'get_labor_unmerge_logs', {
        user_id: userId,
        project_id: project.id,
      });
      setHistoryLogModal((s) => (s.kind === kind ? { ...s, logs: res.logs ?? [], loading: false } : s));
    } catch (e: any) {
      setHistoryLogModal((s) => ({ ...s, loading: false }));
      Alert.alert('โหลดข้อมูลไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  const [logModal, setLogModal] = useState<{ visible: boolean; kind?: 'receive' | 'delivery'; project?: Project; logs: any[]; loading: boolean }>({
    visible: false,
    logs: [],
    loading: false,
  });

  // ประวัติรับเข้าคลัง / จัดส่งหน้างาน ของโครงการ — อ่านอย่างเดียวจาก project_items_API_mobile.php
  async function openLogModal(kind: 'receive' | 'delivery', project: Project) {
    if (!userId) return;
    setLogModal({ visible: true, kind, project, logs: [], loading: true });
    try {
      const res = await apiMobileGet(PROJECT_ITEMS_API_URL, kind === 'receive' ? 'get_receive_logs' : 'get_delivery_logs', {
        user_id: userId,
        project_id: project.id,
      });
      setLogModal((s) => (s.project?.id === project.id && s.kind === kind ? { ...s, logs: res.logs ?? [], loading: false } : s));
    } catch (e: any) {
      setLogModal((s) => ({ ...s, loading: false }));
      Alert.alert('โหลดข้อมูลไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // -------------------- รับของเข้าคลัง (inventory_API_mobile.php) --------------------
  const [receivePoListModal, setReceivePoListModal] = useState<{
    visible: boolean; project?: Project; loading: boolean; pos: any[]; mode: 'normal' | 'claim';
  }>({ visible: false, loading: false, pos: [], mode: 'normal' });

  const [receiveFormModal, setReceiveFormModal] = useState<{
    visible: boolean; project?: Project; poId?: number | string; poNumber?: string; loading: boolean; saving: boolean;
    items: any[]; qtyMap: Record<string, string>;
  }>({ visible: false, loading: false, saving: false, items: [], qtyMap: {} });

  async function openReceivePoList(project: Project, mode: 'normal' | 'claim' = 'normal') {
    if (!userId) return;
    setReceivePoListModal({ visible: true, project, loading: true, pos: [], mode });
    try {
      const res = await apiMobileGet(INVENTORY_API_URL, 'get_receive_pos', { user_id: userId, project_id: project.id, mode });
      setReceivePoListModal((s) => (s.project?.id === project.id ? { ...s, pos: res.pos ?? [], loading: false } : s));
    } catch (e: any) {
      setReceivePoListModal((s) => ({ ...s, loading: false }));
      Alert.alert('โหลดรายการ PO ไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  async function openReceiveForm(project: Project, poId: number | string, poNumber: string, mode: 'normal' | 'claim' = 'normal') {
    if (!userId) return;
    setReceiveFormModal({ visible: true, project, poId, poNumber, loading: true, saving: false, items: [], qtyMap: {} });
    try {
      const res = await apiMobileGet(INVENTORY_API_URL, 'get_po_receive_items', { user_id: userId, po_id: poId, project_id: project.id, mode });
      setReceiveFormModal((s) => (s.poId === poId ? { ...s, items: res.items ?? [], loading: false } : s));
    } catch (e: any) {
      setReceiveFormModal((s) => ({ ...s, loading: false }));
      Alert.alert('โหลดรายการสินค้าไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  async function confirmSaveReceive() {
    const { project, poId, poNumber, items, qtyMap } = receiveFormModal;
    if (!userId || !project || !poId) return;

    const receiveData: { poi_id: string; qty: number; po_number: string }[] = [];
    for (const it of items) {
      const mainQty = parseFloat(qtyMap[String(it.poi_id)] ?? '');
      if (!isNaN(mainQty) && mainQty > 0) {
        receiveData.push({ poi_id: String(it.poi_id), qty: mainQty, po_number: poNumber ?? '' });
      }
      for (const sub of it.sub_items ?? []) {
        const subKey = `SUB_${sub.sub_id}`;
        const subQty = parseFloat(qtyMap[subKey] ?? '');
        if (!isNaN(subQty) && subQty > 0) {
          receiveData.push({ poi_id: subKey, qty: subQty, po_number: poNumber ?? '' });
        }
      }
    }
    if (receiveData.length === 0) {
      Alert.alert('ไม่มีรายการที่กรอก', 'กรุณากรอกจำนวนที่รับอย่างน้อย 1 รายการ');
      return;
    }

    setReceiveFormModal((s) => ({ ...s, saving: true }));
    try {
      await apiMobilePost(INVENTORY_API_URL, 'save_receive', {
        user_id: userId,
        receive_data_json: JSON.stringify(receiveData),
      });
      setReceiveFormModal({ visible: false, loading: false, saving: false, items: [], qtyMap: {} });
      setReceivePoListModal({ visible: false, loading: false, pos: [], mode: 'normal' });
      Alert.alert('บันทึกสำเร็จ', 'รับของเข้าคลังเรียบร้อยแล้ว');
      if (logModal.project?.id === project.id && logModal.kind === 'receive') {
        openLogModal('receive', project);
      }
    } catch (e: any) {
      setReceiveFormModal((s) => ({ ...s, saving: false }));
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // -------------------- จัดส่งหน้างาน (inventory_API_mobile.php) --------------------
  const [deliveryFormModal, setDeliveryFormModal] = useState<{
    visible: boolean; project?: Project; loading: boolean; saving: boolean;
    items: any[]; qtyMap: Record<string, string>;
    transportType: 'internal' | 'external';
    driver: string; helper: string; vehicle: string; receiverName: string; note: string;
    editDoNo?: string;
  }>({
    visible: false, loading: false, saving: false, items: [], qtyMap: {},
    transportType: 'internal', driver: '', helper: '', vehicle: '', receiverName: '', note: '',
  });

  // -------------------- หน้ารวม "จัดส่งสินค้าไปหน้างาน" (inventory_delivery.php?project_id=) --------------------
  const [deliveryHub, setDeliveryHub] = useState<{
    project?: Project;
    info?: { project_code: string; project_name: string; customer_name: string; customer_address: string };
    items: any[];
    loading: boolean;
  }>({
    items: [],
    loading: false,
  });
  const [doPickerModal, setDoPickerModal] = useState<{ visible: boolean; loading: boolean; options: string[] }>({
    visible: false,
    loading: false,
    options: [],
  });

  async function openDeliveryHub(project: Project) {
    if (!userId) return;
    setDeliveryHub({ project, items: [], loading: true });
    setActiveScreen('delivery');
    try {
      // project_info มาจากคำเดียวกับ get_delivery_ready_items — อ่าน customer_address ตรงจาก
      // ตาราง projects เหมือน inventory_delivery.php เป๊ะ (ไม่ผ่าน get_detail ที่ใช้แหล่งอื่น
      // จากตาราง customers ทำให้ที่อยู่ไม่ตรงกับหน้าเว็บที่หน้านี้อ้างอิงอยู่)
      const itemsRes = await apiMobileGet(INVENTORY_API_URL, 'get_delivery_ready_items', { user_id: userId, project_id: project.id });
      setDeliveryHub((s) => (s.project?.id === project.id ? { ...s, info: itemsRes.project_info, items: itemsRes.items ?? [], loading: false } : s));
    } catch (e: any) {
      setDeliveryHub((s) => ({ ...s, loading: false }));
      Alert.alert('โหลดข้อมูลไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // "ตรวจสอบหน้างาน (รายบิล)" — ต้องเลือกเลขที่ใบจัดส่ง (DO) ก่อน แล้วค่อยไปหน้า DriverConfirmItems
  // (เหมือนเว็บ: openDriverConfirm() โชว์ dropdown เลือก DO ก่อนเปิดแท็บใหม่)
  async function openDriverConfirmPicker(project: Project) {
    if (!userId) return;
    setDoPickerModal({ visible: true, loading: true, options: [] });
    try {
      const res = await apiMobileGet(PROJECT_ITEMS_API_URL, 'get_delivery_logs', { user_id: userId, project_id: project.id });
      const nos = Array.from(new Set<string>((res.logs ?? []).map((l: any) => String(l.delivery_no)).filter(Boolean)));
      setDoPickerModal({ visible: true, loading: false, options: nos });
    } catch (e: any) {
      setDoPickerModal({ visible: false, loading: false, options: [] });
      Alert.alert('โหลดรายการไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // -------------------- แก้ไข/ลบประวัติรับเข้าคลัง --------------------
  const [editReceiveLogModal, setEditReceiveLogModal] = useState<{ visible: boolean; log?: any; newQty: string; note: string; saving: boolean }>({
    visible: false, newQty: '', note: '', saving: false,
  });
  const [deleteReceiveDocModal, setDeleteReceiveDocModal] = useState<{ visible: boolean; docId?: number; reason: string; saving: boolean }>({
    visible: false, reason: '', saving: false,
  });

  function openEditReceiveLog(log: any) {
    setEditReceiveLogModal({ visible: true, log, newQty: String(log.receive_qty ?? ''), note: '', saving: false });
  }

  async function confirmEditReceiveLog() {
    const { log, newQty, note } = editReceiveLogModal;
    if (!userId || !log) return;
    const qty = parseFloat(newQty);
    if (isNaN(qty) || qty < 0) {
      Alert.alert('กรอกจำนวนไม่ถูกต้อง', 'กรุณาระบุจำนวนที่ถูกต้อง');
      return;
    }
    setEditReceiveLogModal((s) => ({ ...s, saving: true }));
    try {
      await apiMobilePost(INVENTORY_API_URL, 'update_receive_log', { user_id: userId, log_id: log.id, new_qty: qty, note: note.trim() });
      setEditReceiveLogModal({ visible: false, newQty: '', note: '', saving: false });
      const project = logModal.project;
      if (project) openLogModal('receive', project);
    } catch (e: any) {
      setEditReceiveLogModal((s) => ({ ...s, saving: false }));
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  function openDeleteReceiveDoc(docId: number) {
    if (!docId) {
      Alert.alert('ลบไม่ได้', 'รายการนี้ไม่มีเลขที่บิลอ้างอิง');
      return;
    }
    setDeleteReceiveDocModal({ visible: true, docId, reason: '', saving: false });
  }

  async function confirmDeleteReceiveDoc() {
    const { docId, reason } = deleteReceiveDocModal;
    if (!userId || !docId) return;
    if (!reason.trim()) {
      Alert.alert('กรุณากรอกเหตุผล', 'โปรดระบุเหตุผลที่ลบบิลรับของนี้');
      return;
    }
    setDeleteReceiveDocModal((s) => ({ ...s, saving: true }));
    try {
      await apiMobilePost(INVENTORY_API_URL, 'delete_receive_session', { user_id: userId, doc_id: docId, reason: reason.trim() });
      setDeleteReceiveDocModal({ visible: false, reason: '', saving: false });
      const project = logModal.project;
      if (project) openLogModal('receive', project);
    } catch (e: any) {
      setDeleteReceiveDocModal((s) => ({ ...s, saving: false }));
      Alert.alert('ลบไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  async function openDeliveryForm(project: Project) {
    if (!userId) return;
    setDeliveryFormModal({
      visible: true, project, loading: true, saving: false, items: [], qtyMap: {},
      transportType: 'internal', driver: '', helper: '', vehicle: '', receiverName: '', note: '',
    });
    try {
      const res = await apiMobileGet(INVENTORY_API_URL, 'get_delivery_ready_items', { user_id: userId, project_id: project.id });
      setDeliveryFormModal((s) => (s.project?.id === project.id ? { ...s, items: res.items ?? [], loading: false } : s));
    } catch (e: any) {
      setDeliveryFormModal((s) => ({ ...s, loading: false }));
      Alert.alert('โหลดรายการสินค้าไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // แก้ไขใบจัดส่งเดิม (ก่อนคนขับกดยืนยัน) — inventory_API_mobile.php action=update_delivery
  async function openDeliveryEditForm(project: Project, deliveryNo: string) {
    if (!userId) return;
    setDeliveryFormModal({
      visible: true, project, loading: true, saving: false, items: [], qtyMap: {},
      transportType: 'internal', driver: '', helper: '', vehicle: '', receiverName: '', note: '',
      editDoNo: deliveryNo,
    });
    try {
      const res = await apiMobileGet(INVENTORY_API_URL, 'get_delivery_ready_items', { user_id: userId, project_id: project.id, edit_do: deliveryNo });
      const items = res.items ?? [];
      const qtyMap: Record<string, string> = {};
      for (const it of items) {
        if (it.saved_qty > 0) qtyMap[String(it.project_item_id)] = String(it.saved_qty);
        for (const sub of it.sub_items ?? []) {
          if (sub.saved_qty > 0) qtyMap[`SUB_${sub.sub_id}`] = String(sub.saved_qty);
        }
      }
      setDeliveryFormModal((s) => (s.project?.id === project.id ? { ...s, items, qtyMap, loading: false } : s));
    } catch (e: any) {
      setDeliveryFormModal((s) => ({ ...s, loading: false }));
      Alert.alert('โหลดรายการสินค้าไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  async function confirmSaveDelivery() {
    const { project, items, qtyMap, transportType, driver, helper, vehicle, receiverName, note, editDoNo } = deliveryFormModal;
    if (!userId || !project) return;
    if (!driver.trim() || !vehicle.trim()) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุคนขับและทะเบียนรถ');
      return;
    }

    const itemsData: { project_item_id: number; sub_id: number; qty: number; project_id: number }[] = [];
    for (const it of items) {
      const mainQty = parseFloat(qtyMap[String(it.project_item_id)] ?? '');
      if (!isNaN(mainQty) && mainQty > 0) {
        itemsData.push({ project_item_id: it.project_item_id, sub_id: 0, qty: mainQty, project_id: Number(project.id) });
      }
      for (const sub of it.sub_items ?? []) {
        const subKey = `SUB_${sub.sub_id}`;
        const subQty = parseFloat(qtyMap[subKey] ?? '');
        if (!isNaN(subQty) && subQty > 0) {
          itemsData.push({ project_item_id: it.project_item_id, sub_id: sub.sub_id, qty: subQty, project_id: Number(project.id) });
        }
      }
    }
    if (itemsData.length === 0) {
      Alert.alert('ไม่มีรายการที่กรอก', 'กรุณากรอกจำนวนที่จะจัดส่งอย่างน้อย 1 รายการ');
      return;
    }

    setDeliveryFormModal((s) => ({ ...s, saving: true }));
    try {
      if (editDoNo) {
        await apiMobilePost(INVENTORY_API_URL, 'update_delivery', {
          user_id: userId,
          edit_do_no: editDoNo,
          delivery_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
          delivery_type: transportType,
          internal_driver: transportType === 'internal' ? driver.trim() : undefined,
          internal_helper: transportType === 'internal' ? helper.trim() : undefined,
          internal_vehicle: transportType === 'internal' ? vehicle.trim() : undefined,
          external_driver: transportType === 'external' ? driver.trim() : undefined,
          external_vehicle: transportType === 'external' ? vehicle.trim() : undefined,
          receiver_name: receiverName.trim(),
          items_json: JSON.stringify(itemsData),
        });
        Alert.alert('บันทึกสำเร็จ', `แก้ไขใบจัดส่งเลขที่ ${editDoNo} เรียบร้อยแล้ว`);
      } else {
        await apiMobilePost(INVENTORY_API_URL, 'save_delivery', {
          user_id: userId,
          delivery_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
          delivery_type: transportType,
          internal_driver: transportType === 'internal' ? driver.trim() : undefined,
          internal_helper: transportType === 'internal' ? helper.trim() : undefined,
          internal_vehicle: transportType === 'internal' ? vehicle.trim() : undefined,
          external_driver: transportType === 'external' ? driver.trim() : undefined,
          external_vehicle: transportType === 'external' ? vehicle.trim() : undefined,
          receiver_name: receiverName.trim(),
          main_note: note.trim(),
          items_json: JSON.stringify(itemsData),
        });
        Alert.alert('บันทึกสำเร็จ', 'สร้างใบจัดส่งเรียบร้อยแล้ว');
      }
      setDeliveryFormModal({
        visible: false, loading: false, saving: false, items: [], qtyMap: {},
        transportType: 'internal', driver: '', helper: '', vehicle: '', receiverName: '', note: '',
      });
      if (logModal.project?.id === project.id && logModal.kind === 'delivery') {
        openLogModal('delivery', project);
      }
    } catch (e: any) {
      setDeliveryFormModal((s) => ({ ...s, saving: false }));
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  const [detailModal, setDetailModal] = useState<{ visible: boolean; project?: Project; detail?: ProjectDetail; loading: boolean }>({
    visible: false,
    loading: false,
  });

  // id โครงการที่เปิดหน้ารายละเอียดอยู่ "ตอนนี้" — งาน async (get_detail/get_notes) เทียบกับ ref นี้
  // แทน detailModal ใน closure ที่ค้างค่าก่อน setState (เดิมทำให้หมายเหตุหมุนโหลดค้างตอนเปิดครั้งแรก)
  const detailProjectIdRef = useRef<number | string | null>(null);

  // ปุ่ม "ดูประวัติแก้ไข" ข้างผู้แก้ไขล่าสุด (ส่วนข้อมูลระบบ) — get_edit_history
  const [editHistory, setEditHistory] = useState<{ visible: boolean; loading: boolean; logs: { seq: number; editor: string; editedAt: string }[] }>({
    visible: false, loading: false, logs: [],
  });
  async function openEditHistory(projectId: number) {
    if (!userId) return;
    setEditHistory({ visible: true, loading: true, logs: [] });
    try {
      const res = await apiMobileGet(PROJECT_API_URL, 'get_edit_history', { user_id: userId, project_id: projectId });
      const logs = (Array.isArray(res.logs) ? res.logs : []).map((l: any) => ({
        seq: Number(l.seq ?? 0),
        editor: String(l.editor ?? ''),
        editedAt: fmtDateCE(l.edited_at),
      }));
      setEditHistory({ visible: true, loading: false, logs });
    } catch (e: any) {
      setEditHistory((s) => ({ ...s, loading: false }));
      Alert.alert('โหลดประวัติแก้ไขไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // เปิดหน้ารายละเอียด + ยิง get_detail ของ project_API_mobile.php จริง (README_project.md ข้อ 4.4)
  async function openDetailModal(project: Project) {
    if (!userId) return;
    detailProjectIdRef.current = project.id;
    setDetailModal({ visible: true, project, loading: true });
    void loadProjectNotes(project);
    await refreshDetail(project, { showError: true });
  }

  // โหลด get_detail ใหม่เงียบๆ — ใช้ตอนเปิดหน้า และหลังกด action ในหน้ารายละเอียด (ปิดจบ/กู้คืน/ฯลฯ)
  // ให้ข้อมูลในหน้า (ปิดจบโดย/สถานะ ฯลฯ) ตรงกับ server ทันทีโดยไม่ต้องปิดแล้วเปิดใหม่
  async function refreshDetail(project: Project, opts?: { showError?: boolean }) {
    if (!userId) return;
    try {
      const res = await apiMobileGet(PROJECT_API_URL, 'get_detail', { user_id: userId, project_id: project.id });
      const detail = res.detail as ProjectDetail;
      if (detailProjectIdRef.current === project.id) setDetailModal((s) => ({ ...s, detail, loading: false }));
    } catch (e: any) {
      console.error('project_API_mobile action=get_detail failed', e);
      if (detailProjectIdRef.current === project.id) setDetailModal((s) => ({ ...s, loading: false }));
      if (opts?.showError) Alert.alert('โหลดรายละเอียดไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // "หมายเหตุโครงการ" — แทนที่ส่วน "ลิงก์หลักของโครงการ" เดิม (เว็บจริงไม่มีช่องแก้ไขลิงก์ตรงนี้
  // แต่มีกล่องกรอกหมายเหตุ + ลิสต์หมายเหตุที่เคยบันทึกไว้แทน) ต่อ action get_notes/save_note/
  // delete_note ของ project_API_mobile.php ที่มีอยู่แล้ว (README_project.md ข้อ 4.4 อ้างถึงไว้)
  const [projectNotes, setProjectNotes] = useState<{ loading: boolean; list: any[]; text: string; saving: boolean }>({
    loading: false,
    list: [],
    text: '',
    saving: false,
  });

  async function loadProjectNotes(project: Project) {
    if (!userId) return;
    setProjectNotes((s) => ({ ...s, loading: true, text: '' }));
    try {
      const res = await apiMobileGet(PROJECT_API_URL, 'get_notes', { user_id: userId, project_id: project.id });
      if (detailProjectIdRef.current === project.id) setProjectNotes((s) => ({ ...s, loading: false, list: res.notes ?? [] }));
    } catch (e: any) {
      console.error('project_API_mobile action=get_notes failed', e);
      setProjectNotes((s) => ({ ...s, loading: false }));
    }
  }

  async function saveProjectNote() {
    const project = detailModal.project;
    if (!userId || !project || !projectNotes.text.trim()) return;
    setProjectNotes((s) => ({ ...s, saving: true }));
    try {
      await apiMobilePost(PROJECT_API_URL, 'save_note', { user_id: userId, project_id: project.id, note: projectNotes.text.trim() });
      setProjectNotes((s) => ({ ...s, saving: false, text: '' }));
      void loadProjectNotes(project);
    } catch (e: any) {
      setProjectNotes((s) => ({ ...s, saving: false }));
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  function confirmDeleteProjectNote(noteId: number) {
    const project = detailModal.project;
    if (!userId || !project) return;
    Alert.alert('ลบหมายเหตุ', 'ต้องการลบหมายเหตุนี้ใช่หรือไม่?', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiMobilePost(PROJECT_API_URL, 'delete_note', { user_id: userId, project_id: project.id, note_id: noteId });
            void loadProjectNotes(project);
          } catch (e: any) {
            Alert.alert('ลบไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
          }
        },
      },
    ]);
  }

  const companies = useMemo(() => Array.from(new Set(projects.map((p) => p.companyName))), [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (companyFilter !== 'all' && p.companyName !== companyFilter) return false;
      if (statusFilter === 'not_closed') {
        if (p.isFinished || p.isCanceled) return false;
      } else if (statusFilter !== 'all' && p.statusRaw !== statusFilter) {
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

  // -------------------- Row actions (เชื่อม project_API_mobile.php จริง) --------------------
  // ทุก action เขียนต้องมี user_id + project_id (README_project.md ข้อ 3) หลังสำเร็จ โหลด get_list
  // + get_dashboard ใหม่แบบเงียบๆ แทนการคำนวณ/เดาสถานะเองฝั่งแอป (badge_class, closed_by ฯลฯ
  // ล้วนคำนวณฝั่ง PHP ทั้งหมด — ตามกติกา "แอปเป็นแค่ตัววาดหน้าจอ")
  async function saveProjectAction(project: Project, action: string, fields: Record<string, unknown> = {}) {
    if (!userId) return false;
    try {
      await apiMobilePost(PROJECT_API_URL, action, { user_id: userId, project_id: project.id, ...fields });
      await Promise.all([loadProjects({ silent: true }), loadDashboard()]);
      if (detailProjectIdRef.current === project.id) void refreshDetail(project);
      return true;
    } catch (e: any) {
      console.error(`project_API_mobile action=${action} failed`, e);
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
      // toggleTechOnsiteInModal() ปรับ UI ล่วงหน้าแบบ optimistic ก่อนเรียกฟังก์ชันนี้ — ถ้าล้มเหลว ต้อง
      // resync จาก server กลับมาด้วย ไม่งั้นช่องติ๊กจะค้างค่าที่ผิดจนกว่าจะเปิดหน้าใหม่
      void loadProjects({ silent: true });
      if (detailProjectIdRef.current === project.id) void refreshDetail(project);
      return false;
    }
  }

  function handleForceComplete(project: Project) {
    Alert.alert(
      `ยืนยันปิดจบหน้างาน (${displayCode(project.code)})`,
      `จะเปลี่ยนสถานะของ "${project.projectName}" เป็น "ปิดจบหน้างาน" ใช่หรือไม่?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ใช่, ปิดจบเลย', onPress: () => void saveProjectAction(project, 'force_complete_project') },
      ]
    );
  }

  function handleUndoComplete(project: Project) {
    Alert.alert(
      `ยืนยันยกเลิกปิดจบหน้างาน (${displayCode(project.code)})`,
      `จะยกเลิกการปิดจบของ "${project.projectName}" และคำนวณสถานะใหม่ตามเงื่อนไขจริง ใช่หรือไม่?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ใช่, ยกเลิกปิดจบ', onPress: () => void saveProjectAction(project, 'undo_complete_project') },
      ]
    );
  }

  function openCancelForm(project: Project) {
    setCancelReasonText('');
    setCancelFormModal({ visible: true, project });
  }

  function confirmCancelProject() {
    if (!cancelReasonText.trim()) {
      Alert.alert('กรุณาระบุหมายเหตุ', 'ต้องกรอกเหตุผลที่ยกเลิกโครงการก่อนยืนยัน');
      return;
    }
    const project = cancelFormModal.project;
    if (project) {
      void saveProjectAction(project, 'cancel_project', { cancel_reason: cancelReasonText.trim() });
    }
    setCancelFormModal({ visible: false });
  }

  function handleRestoreProject(project: Project) {
    Alert.alert(
      `ยืนยันกู้คืนหน้างาน (${displayCode(project.code)})`,
      `จะกู้คืน "${project.projectName}" กลับมาจากสถานะยกเลิก ระบบจะคำนวณสถานะที่ถูกต้องให้เองอัตโนมัติ ใช่หรือไม่?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ใช่, กู้คืนเลย', onPress: () => void saveProjectAction(project, 'restore_project') },
      ]
    );
  }

  function openDebtModal(project: Project) {
    setDebtSearch('');
    setDebtModal({ visible: true, project });
  }

  function assignDebtOwner(name: string) {
    const project = debtModal.project;
    if (project) {
      // debt_type ล็อกเป็น 'บุคคล' เสมอตามต้นฉบับ (ดูคอมเมนต์เดียวกันใน createproject.tsx)
      void saveProjectAction(project, 'save_debt_owner', { debt_type: 'บุคคล', debt_user: name, debt_team: '' });
    }
    setDebtModal({ visible: false });
  }

  // ติ๊ก "ช่างเข้าหน้างาน" ในกล่องทีมช่างของหน้ารายละเอียด — ขยับช่องติ๊กทันที (แค่ภาพ)
  // แล้วค่อย resync ชื่อผู้ยืนยัน/เวลาจาก server จริงผ่าน saveProjectAction -> refreshDetail
  function toggleTechOnsiteInModal(value: boolean) {
    const project = detailModal.project;
    if (!project) return;
    setDetailModal((s) => (s.detail ? { ...s, detail: { ...s.detail, tech_onsite: value ? 1 : 0 } } : s));
    void saveProjectAction(project, 'save_tech_onsite', { onsite: value ? '1' : '0' });
  }

  function handleLinkIcon(key: string, project: Project) {
    const link = LINK_ICONS.find((l) => l.key === key);
    if (key === 'view') {
      void openDetailModal(project);
      return;
    }
    // 'edit' (create_project.php?edit_id=) — เชื่อมแล้ว: CreateProjectScreen โหลดข้อมูลเดิมจาก
    // get_detail มาเติมฟอร์มเอง (ดู useEffect ในไฟล์นั้น) แต่ฟิลด์ "ลูกค้า" ล็อกไว้เป็นค่าเดิม
    // เพราะยังไม่มี API ค้นหา/ยืนยันลูกค้าจริงฝั่งมือถือ (เปลี่ยนลูกค้าต้องทำผ่านหน้าเว็บ)
    if (key === 'edit') {
      setEditProjectId(String(project.id));
      setActiveScreen('editProject');
      return;
    }
    if (key === 'accounting') {
      // project_accounting.php?id= -> ใช้ ProjectAccountingScreen เดิม (มีอยู่แล้ว) แค่ส่ง id เข้าไป
      setAccountingProjectId(String(project.id));
      setActiveScreen('projectAccounting');
      return;
    }
    if (key === 'delivery' && project.isStockSite) return; // ของจริงซ่อนไอคอนนี้ถ้าเป็นหน้างานสต๊อก
    if (key === 'delivery') {
      // เชื่อมไปหน้ารวม "จัดส่งสินค้าไปหน้างาน" ของโปรเจกต์นี้ (inventory_delivery.php?project_id=)
      void openDeliveryHub(project);
      return;
    }
    Alert.alert(link?.label ?? key, `จะเชื่อมไปหน้า: ${link?.targetNote} (project id ${project.id})`);
  }

  // -------------------- Render helpers --------------------

  // ไปหน้าเมนูลัด (ใบงานจัดส่ง/ค้ำประกัน/บัญชีลูกหนี้/ข้อมูลตกหล่น/สร้างโครงการ)
  function navigateQuick(key: QuickLinkScreenKey) {
    if (onNavigate) return onNavigate(key);
    if (key === 'estimate') return setActiveScreen('estimate');
    if (key === 'driverTasks') return setActiveScreen('driverTasks');
    if (key === 'guarantee') return setActiveScreen('guarantee');
    if (key === 'accounting') return setActiveScreen('accounting');
    if (key === 'incomplete') return setActiveScreen('incomplete');
    if (key === 'createProject') return setActiveScreen('createProject');
  }

  // ตัวกรองที่ใช้อยู่ — โชว์เป็น chip เล็กใต้แถบค้นหา กด ✕ เพื่อลบทีละตัว (แบบหน้าเอกสาร PO/AX)
  const activeFilterChips: { key: string; label: string; clear: () => void }[] = [];
  if (statusFilter !== 'all') {
    activeFilterChips.push({ key: 'status', label: STATUS_FILTERS.find((f) => f.value === statusFilter)?.label ?? statusFilter, clear: () => setStatusFilter('all') });
  }
  if (companyFilter !== 'all') activeFilterChips.push({ key: 'company', label: companyFilter, clear: () => setCompanyFilter('all') });

  // แถบค้นหา + ปุ่มตัวกรอง + ปุ่มสร้างโครงการ — วางนอก FlatList จึงติดค้างด้านบนเสมอขณะเลื่อนรายการ
  function renderTopBar() {
    return (
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <View style={styles.topBarSearch}>
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="ค้นหารหัสงาน/โครงการ/ลูกค้า..."
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color="#cbd5e1" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={[styles.topBarBtn, activeFilterChips.length > 0 && styles.topBarBtnActive]}
            accessibilityLabel="ตัวกรอง" onPress={() => setFilterSheetOpen(true)}>
            <Ionicons name="options-outline" size={19} color={activeFilterChips.length > 0 ? '#fff' : '#475569'} />
            {activeFilterChips.length > 0 && (
              <View style={styles.topBarBadge}>
                <Text style={styles.topBarBadgeText}>{activeFilterChips.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBarAddBtn} accessibilityLabel="สร้างโครงการ" onPress={() => navigateQuick('createProject')}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {activeFilterChips.length > 0 && (
          <View style={styles.activeFilterRow}>
            {activeFilterChips.map((c) => (
              <TouchableOpacity key={c.key} style={styles.activeFilterChip} onPress={c.clear}>
                <Text style={styles.activeFilterChipText} numberOfLines={1}>{c.label}</Text>
                <Ionicons name="close" size={12} color="#475569" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  }

  function renderFilterSheet() {
    return (
      <Modal visible={filterSheetOpen} transparent animationType="slide" onRequestClose={() => setFilterSheetOpen(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setFilterSheetOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeadRow}>
              <Text style={styles.sheetTitle}>ตัวกรอง</Text>
              <TouchableOpacity onPress={() => setFilterSheetOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8, gap: 10 }}>
              <SheetGroup icon="flag" color="#64748b" title="สถานะโครงการ">
                <View style={styles.sheetOptGrid}>
                  {STATUS_FILTERS.map((f) => (
                    <SheetOption key={f.value} label={f.label} active={statusFilter === f.value} onPress={() => setStatusFilter(f.value)} />
                  ))}
                </View>
              </SheetGroup>

              <SheetGroup icon="business" color="#64748b" title="บริษัท">
                <View style={styles.sheetOptGrid}>
                  {['all', ...companies].map((c) => (
                    <SheetOption key={c} label={c === 'all' ? 'ทุกบริษัท' : c} active={companyFilter === c} onPress={() => setCompanyFilter(c)} />
                  ))}
                </View>
              </SheetGroup>
            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity
                style={styles.sheetResetBtn}
                onPress={() => {
                  setStatusFilter('all');
                  setCompanyFilter('all');
                  setSearch('');
                }}
              >
                <Text style={styles.sheetResetBtnText}>ค่าเริ่มต้น</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetApplyBtn} onPress={() => setFilterSheetOpen(false)}>
                <Text style={styles.sheetApplyBtnText}>ดูผลลัพธ์ ({filteredProjects.length})</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // การ์ดบริษัททั้งหมดแบบเว็บ — ใช้รายชื่อจาก get_master_data.companies (ครบทุกบริษัท เรียงตาม list_order)
  // จับคู่ตัวเลขจาก kpi_by_company ด้วย company_id บริษัทที่ยังไม่มีงานในปีนั้นได้ตัวเลข 0 ทั้งหมด
  const companyCards: CompanyKpi[] = masterCompanies.length
    ? masterCompanies.map((m) => ({ companyId: m.id, companyName: m.name, kpi: kpiByCompany.find((k) => k.companyId === m.id)?.kpi ?? EMPTY_KPI }))
    : kpiByCompany;

  // บริษัทที่เลือกอยู่ (ตัวกรองบริษัทเก็บเป็นชื่อ) -> หา kpi ของบริษัทนั้นจาก kpi_by_company ด้วย company_id
  // เลือกบริษัทแล้วการ์ดสรุปโชว์ตัวเลขของบริษัทนั้น แบบที่เว็บสลับการ์ดตามบริษัท
  const selectedCompanyCid = companyFilter === 'all' ? undefined : projects.find((p) => p.companyName === companyFilter)?.companyId;
  const selectedCompanyKpi =
    companyFilter === 'all' ? undefined : companyCards.find((c) => (selectedCompanyCid ? c.companyId === selectedCompanyCid : c.companyName === companyFilter));
  const shownKpi = selectedCompanyKpi?.kpi ?? kpi;

  // แตะการ์ดบริษัทใน "สรุปข้อมูลแยกตามบริษัท" -> กรองรายการเฉพาะบริษัทนั้น (ชื่อเอาจาก get_list ให้ตรงกับตัวกรองเดิม)
  function selectCompany(c: CompanyKpi) {
    const name = projects.find((p) => p.companyId === c.companyId)?.companyName ?? c.companyName;
    setCompanyFilter(companyFilter === name ? 'all' : name);
  }

  async function openCanceledHistory() {
    if (!userId) return;
    setCanceledModal({ visible: true, loading: true, list: [], total: 0, totalBudget: 0 });
    try {
      const res = await apiMobileGet(PROJECT_API_URL, 'get_canceled_history', { user_id: userId, year: selectedYear, limit: 200 });
      const list: CanceledProject[] = (Array.isArray(res.data) ? res.data : []).map((r: any) => ({
        id: Number(r.id ?? 0),
        displayCode: String(r.display_code ?? r.project_code ?? ''),
        projectName: String(r.project_name ?? ''),
        customerName: String(r.customer_name ?? ''),
        budget: Number(r.project_budget ?? 0),
        cancelReason: String(r.cancel_reason ?? ''),
        canceledBy: String(r.canceled_by ?? ''),
      }));
      setCanceledModal({ visible: true, loading: false, list, total: Number(res.total ?? list.length), totalBudget: Number(res.total_budget ?? 0) });
    } catch (e: any) {
      setCanceledModal((s) => ({ ...s, loading: false }));
      Alert.alert('โหลดประวัติงานยกเลิกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  function renderCanceledModal() {
    const close = () => setCanceledModal((s) => ({ ...s, visible: false }));
    return (
      <Modal visible={canceledModal.visible} animationType="slide" onRequestClose={close}>
        {/* iOS: Modal เป็นหน้าต่างแยก SafeAreaProvider ของแอปครอบไม่ถึง -> SafeAreaView ได้ระยะขอบ 0
            หัวหน้า/ปุ่มกลับไปอยู่ใต้ notch กดไม่ได้ จึงต้องมี provider ของตัวเองใน Modal */}
        <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.canceledHeaderBar}>
            <TouchableOpacity onPress={close} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={22} color="#0f172a" />
            </TouchableOpacity>
            <Text style={styles.canceledHeaderTitle}>ประวัติงานยกเลิก (ปี ค.ศ. {selectedYear})</Text>
          </View>
          {canceledModal.loading ? (
            <ActivityIndicator color="#475569" style={{ marginTop: 40 }} />
          ) : (
            <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 10 }}>
              <View style={styles.canceledSummary}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.canceledSummaryLabel}>จำนวนงานยกเลิก</Text>
                  <Text style={styles.canceledSummaryValue}>{canceledModal.total} งาน</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.canceledSummaryLabel}>งบประมาณรวม</Text>
                  <Text style={[styles.canceledSummaryValue, { color: '#ef4444' }]}>฿{num2(canceledModal.totalBudget)}</Text>
                </View>
              </View>
              {canceledModal.list.length === 0 ? (
                <Text style={styles.canceledEmpty}>ไม่มีงานที่ถูกยกเลิกในปีนี้</Text>
              ) : (
                canceledModal.list.map((c) => (
                  <View key={c.id} style={styles.canceledCard}>
                    <View style={styles.canceledCardTop}>
                      <Text style={styles.canceledCode}>{c.displayCode}</Text>
                      <Text style={styles.canceledBudget}>฿{num2(c.budget)}</Text>
                    </View>
                    <Text style={styles.canceledName} numberOfLines={2}>{c.projectName}</Text>
                    <Text style={styles.canceledCustomer} numberOfLines={1}>{c.customerName}</Text>
                    <View style={styles.canceledReasonBox}>
                      <Text style={styles.canceledReasonLabel}>เหตุผล{c.canceledBy ? ` · ยกเลิกโดย ${c.canceledBy}` : ''}</Text>
                      <Text style={styles.canceledReasonText}>{c.cancelReason || '-'}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    );
  }

  function renderKpiTiles(k: DashboardKpi, opts?: { interactive?: boolean; collapsed?: boolean }) {
    // collapsed = โชว์แค่หมวด "ภาพรวมโครงการ" (4 ใบหลัก) ไม่มีหัวหมวด — ใช้กับการ์ดบนสุดตอนยังไม่กด "ดูทั้งหมด"
    const groups = opts?.collapsed ? KPI_GROUPS.filter((g) => g.key === 'overview') : KPI_GROUPS;
    return (
      <View style={styles.kpiSections}>
        {groups.map((g) => (
          <View key={g.key} style={styles.kpiSection}>
            {!opts?.collapsed && (
            <View style={styles.kpiSectionHead}>
              <View style={[styles.kpiSectionIcon, { backgroundColor: g.color + '1a' }]}>
                <FontAwesome5 name={g.icon} size={11} color={g.color} />
              </View>
              <Text style={styles.kpiSectionTitle}>{g.label}</Text>
            </View>
            )}
            <View style={styles.kpiGrid}>
        {KPI_TILES.filter((t) => t.group === g.key).map((t) => {
          const active = !!opts?.interactive && !!t.filter && t.filter !== 'all' && statusFilter === t.filter;
          const highlight = t.highlight && k[t.key] > 0;
          const canFilter = !!opts?.interactive && !!t.filter;
          const body = (
            <>
              {canFilter && <Ionicons name={active ? 'funnel' : 'funnel-outline'} size={11} color={active ? t.color : '#94a3b8'} style={styles.tapHintIcon} />}
              <View style={styles.kpiLabelRow}>
                <FontAwesome5 name={t.icon} size={11} color={t.highlight ? t.color : '#475569'} />
                <Text style={[styles.kpiLabel, t.highlight && { color: t.color }]} numberOfLines={2}>{t.label}</Text>
              </View>
              {t.money ? (
                <Text style={[styles.kpiMoney, { color: '#0f172a' }]} numberOfLines={1} adjustsFontSizeToFit>฿{num2(k[t.key])}</Text>
              ) : (
                <Text style={[styles.kpiValue, t.highlight && { color: t.color }]}>
                  {k[t.key]} <Text style={[styles.kpiUnit, t.highlight && { color: t.color }]}>งาน</Text>
                </Text>
              )}
              {t.key === 'totalProjects' && opts?.interactive && kpiTotals.cancelled > 0 && (
                <Text style={styles.kpiSub}>
                  ทั้งหมด {kpiTotals.inclCancel} · <Text style={{ color: '#ef4444' }}>ยกเลิก {kpiTotals.cancelled}</Text>
                </Text>
              )}
            </>
          );
          const tileStyle = [styles.kpiTile, { borderLeftColor: t.color }, highlight && styles.kpiTileHighlight, active && { borderColor: t.color, borderWidth: 2, borderLeftWidth: 4 }];
          return opts?.interactive && t.filter ? (
            <TouchableOpacity key={t.key} style={tileStyle} onPress={() => setStatusFilter(t.filter === 'all' || statusFilter === t.filter ? 'all' : t.filter!)}>
              {body}
            </TouchableOpacity>
          ) : (
            <View key={t.key} style={tileStyle}>{body}</View>
          );
        })}
            </View>
          </View>
        ))}
      </View>
    );
  }

  function renderHeader() {
    return (
      <View>
        {/* ปุ่มเมนูลัดสีทึบแบบเว็บ (รวมปุ่ม "ประวัติงานยกเลิก") — 3 ปุ่มต่อแถว ปุ่ม "สร้างโครงการ" อยู่ที่แถบค้นหาด้านบน */}
        <View style={styles.webQuickGrid}>
          {WEB_QUICK_BUTTONS.map((b) => (
            <TouchableOpacity
              key={b.key}
              style={styles.webQuickBtn}
              onPress={() => (b.key === 'canceled' ? openCanceledHistory() : navigateQuick(b.key))}
            >
              <FontAwesome5 name={b.icon} size={13} color="#475569" />
              <Text style={styles.webQuickBtnText} numberOfLines={1}>{b.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* การ์ดภาพรวม — ธีมเดียวกับเว็บ: พื้นขาว แถบน้ำเงินด้านบน โลโก้ TJC + การ์ดตัวเลข 14 ใบขอบซ้ายสี */}
        <View style={styles.overviewCard}>
          <View style={[styles.overviewTopBar, { backgroundColor: '#4f46e5' }]} />
          <View style={styles.overviewHead}>
            <View style={styles.brandMark}>
              <Text style={styles.brandText}>TJC</Text>
            </View>
            <Text style={styles.overviewTitle} numberOfLines={2}>
              {selectedCompanyKpi ? `ภาพรวม ${selectedCompanyKpi.companyName}` : 'ภาพรวมทุกบริษัท (รวมทั้งหมด)'}
            </Text>
            <TouchableOpacity style={styles.overviewYearChip} onPress={() => setYearPickerVisible(true)}>
              <Text style={styles.overviewYearChipText}>ค.ศ. {selectedYear}</Text>
              <Ionicons name="chevron-down" size={12} color="#475569" />
            </TouchableOpacity>
          </View>
          <Text style={styles.kpiHint}>
            <Ionicons name="funnel-outline" size={10} color="#94a3b8" /> การ์ดที่มีไอคอนกรวย แตะเพื่อกรองรายการ
          </Text>
          {renderKpiTiles(shownKpi, { interactive: true, collapsed: !kpiExpanded })}
          <TouchableOpacity style={styles.kpiToggleBtn} onPress={() => setKpiExpanded((v) => !v)}>
            <Text style={styles.kpiToggleText}>{kpiExpanded ? 'ย่อ' : `ดูทั้งหมด (${KPI_TILES.length - KPI_TILES.filter((t) => t.group === 'overview').length})`}</Text>
            <Ionicons name={kpiExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#4f46e5" />
          </TouchableOpacity>
        </View>

        {/* สรุปข้อมูลแยกตามบริษัท (kpi_by_company) — ปุ่มไล่สีน้ำเงินแบบเว็บ กดเพื่อกาง/พับ */}
        {companyCards.length > 0 && (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setCompanyBreakdownOpen((v) => !v)} style={styles.breakdownBtnWrap}>
            <View style={[styles.breakdownBtn, { backgroundColor: '#4f46e5' }]}>
              <FontAwesome5 name="chart-pie" size={16} color="#fff" />
              <Text style={styles.breakdownBtnText}>สรุปข้อมูลแยกตามบริษัท</Text>
              <Ionicons name={companyBreakdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#fff" />
            </View>
          </TouchableOpacity>
        )}
        {/* การ์ดบริษัทแบบเว็บ — ตาราง 2 คอลัมน์ แถบไล่สีน้ำเงิน-ม่วงด้านบน, ไอคอนตึก + ชื่อ + ปุ่ม ›
            แตะการ์ด = กรองรายการเฉพาะบริษัทนั้น (แตะซ้ำยกเลิก), แตะ › = กางตัวเลข 14 ใบของบริษัทนั้นด้านล่าง */}
        {companyBreakdownOpen && (
          <View style={styles.companyGrid}>
            {companyCards.map((c) => {
              const name = projects.find((p) => p.companyId === c.companyId)?.companyName ?? c.companyName;
              const active = companyFilter === name;
              const expanded = expandedCompanyId === c.companyId;
              return (
                <TouchableOpacity
                  key={c.companyId}
                  activeOpacity={0.8}
                  onPress={() => selectCompany(c)}
                  style={[styles.companyMiniCard, active && styles.companyMiniCardActive]}
                >
                  <View style={[styles.companyMiniTopBar, { backgroundColor: '#e2e8f0' }]} />
                  <View style={styles.companyMiniBody}>
                    <View style={styles.companyMiniIcon}>
                      <FontAwesome5 name="building" size={15} color="#64748b" />
                    </View>
                    <Text style={styles.companyMiniName} numberOfLines={2}>{c.companyName}</Text>
                    <TouchableOpacity
                      hitSlop={8}
                      style={[styles.companyMiniChevron, expanded && styles.companyMiniChevronActive]}
                      onPress={() => setExpandedCompanyId(expanded ? null : c.companyId)}
                    >
                      <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={14} color={expanded ? '#4f46e5' : '#64748b'} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.companyMiniSub, active && { color: '#4f46e5', fontWeight: '800' }]} numberOfLines={1}>
                    {active ? '✓ กำลังแสดงเฉพาะบริษัทนี้' : `${c.kpi.totalProjects} งาน · ฿${num2(c.kpi.totalBudget)}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {companyBreakdownOpen &&
          (() => {
            const c = companyCards.find((x) => x.companyId === expandedCompanyId);
            if (!c) return null;
            return (
              <View style={[styles.overviewCard, styles.companyKpiCard]}>
                <View style={styles.overviewHead}>
                  <View style={styles.companyMiniIcon}>
                    <FontAwesome5 name="building" size={15} color="#64748b" />
                  </View>
                  <Text style={styles.overviewTitle} numberOfLines={1}>{c.companyName}</Text>
                  <TouchableOpacity onPress={() => setExpandedCompanyId(null)} hitSlop={8}>
                    <Ionicons name="close" size={20} color="#64748b" />
                  </TouchableOpacity>
                </View>
                {renderKpiTiles(c.kpi)}
              </View>
            );
          })()}

        <Text style={styles.resultCount}>พบ {filteredProjects.length} โครงการ</Text>
      </View>
    );
  }

  // หน้ารวม "จัดส่งสินค้าไปหน้างาน" (inventory_delivery.php?project_id=) — เวอร์ชันหลัก:
  // การ์ดข้อมูลโปรเจกต์ + 2 stat การ์ด (รอจัดส่ง/ส่งครบ) + ตารางรายการหลัก + 3 ปุ่มลิงก์
  // (ไม่ทำสถานะย่อย 7 แบบ + รายการย่อยเครือข่ายแบบเว็บ — ใช้ can_deliver/remain_wh 2 สถานะแทน)
  function renderDeliveryHub() {
    const { project, info, items, loading } = deliveryHub;
    // "ส่งครบแล้ว" นับจาก is_sent (ยอดถึงหน้างานครบ boq_qty แล้วหรือยัง) — คนละแกนกับ can_deliver
    // (มีของพร้อมส่งไหม) ให้ตรงความหมายเดียวกับ $total_ready/$total_sent ของเว็บ
    const readyItems = items.filter((it) => !it.is_sent);
    const sentItems = items.filter((it) => it.is_sent);

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#0f172a', '#334155']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.deliveryHubHeader}>
          <TouchableOpacity style={styles.deliveryHubBackBtn} onPress={() => setActiveScreen('dashboard')}>
            <Ionicons name="arrow-back" size={16} color="#fff" />
            <Text style={styles.deliveryHubBackBtnText}>ย้อนกลับ</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <Ionicons name="car" size={22} color="#facc15" />
            <View>
              <Text style={styles.deliveryHubTitle}>จัดส่งสินค้าไปหน้างาน</Text>
              <Text style={styles.deliveryHubSubtitle}>ระบบเบิกจ่ายและแพ็คของจากคลังส่งไปยังโครงการ</Text>
            </View>
          </View>
          <View style={styles.deliveryHubLinksRow}>
            <TouchableOpacity style={[styles.deliveryHubLinkBtn, { backgroundColor: '#059669' }]} onPress={() => setActiveScreen('driverTasks')}>
              <Ionicons name="phone-portrait-outline" size={13} color="#fff" />
              <Text style={styles.deliveryHubLinkBtnText}>โหมดคนรถ (หน้ารวม)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deliveryHubLinkBtn, { backgroundColor: '#6d28d9' }]}
              onPress={() => project && openDriverConfirmPicker(project)}
            >
              <Ionicons name="checkmark-done-outline" size={13} color="#fff" />
              <Text style={styles.deliveryHubLinkBtnText}>ตรวจสอบหน้างาน (รายบิล)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.deliveryHubLinkBtn, { backgroundColor: '#4f46e5' }]} onPress={() => project && openLogModal('delivery', project)}>
              <Ionicons name="time-outline" size={13} color="#fff" />
              <Text style={styles.deliveryHubLinkBtnText}>ประวัติจัดส่ง</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator size="large" color="#4f46e5" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            {info && (
              <DetailSection title="ข้อมูลโปรเจกต์">
                <DetailRow label="เลขหน้างาน" value={info.project_code} />
                <DetailRow label="ชื่องบ / โครงการ" value={info.project_name} />
                <DetailRow label="ชื่อลูกค้า" value={info.customer_name} />
                <DetailRow label="ที่อยู่ลูกค้า" value={info.customer_address} />
              </DetailSection>
            )}

            <View style={styles.deliveryHubStatRow}>
              <View style={[styles.deliveryHubStatCard, { borderBottomColor: '#f59e0b' }]}>
                <View style={[styles.deliveryHubStatIcon, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="cube-outline" size={20} color="#d97706" />
                </View>
                <View>
                  <Text style={styles.deliveryHubStatLabel}>รอจัดส่งไปหน้างาน</Text>
                  <Text style={styles.deliveryHubStatValue}>{readyItems.length} รายการ</Text>
                </View>
              </View>
              <View style={[styles.deliveryHubStatCard, { borderBottomColor: '#10b981' }]}>
                <View style={[styles.deliveryHubStatIcon, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="checkmark-done" size={20} color="#059669" />
                </View>
                <View>
                  <Text style={styles.deliveryHubStatLabel}>จัดส่งครบแล้ว</Text>
                  <Text style={styles.deliveryHubStatValue}>{sentItems.length} รายการ</Text>
                </View>
              </View>
            </View>

            <View style={styles.deliveryHubTableCard}>
              <Text style={styles.deliveryHubTableTitle}>รายการสินค้า</Text>
              {items.length === 0 ? (
                <Text style={styles.itemEmptyText}>คลังสินค้ายังไม่มีของที่รอจัดส่งไปหน้างาน</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    <View style={styles.deliveryHubTableHeadRow}>
                      <Text style={[styles.deliveryHubTableHeadCell, { width: 30 }]}>#</Text>
                      <Text style={[styles.deliveryHubTableHeadCell, { width: 200 }]}>รายการสินค้า</Text>
                      <Text style={[styles.deliveryHubTableHeadCell, { width: 70, textAlign: 'center' }]}>หน่วย</Text>
                      <Text style={[styles.deliveryHubTableHeadCell, { width: 120, textAlign: 'center', color: '#d97706' }]}>รอจัดส่ง (คงเหลือ)</Text>
                      <Text style={[styles.deliveryHubTableHeadCell, { width: 100, textAlign: 'center' }]}>สถานะ</Text>
                      <Text style={[styles.deliveryHubTableHeadCell, { width: 130, textAlign: 'center' }]}>จัดการ</Text>
                    </View>
                    {items.map((it, idx) => (
                      <View key={it.project_item_id} style={styles.deliveryHubTableRow}>
                        <Text style={[styles.deliveryHubTableCell, { width: 30, color: '#94a3b8' }]}>{idx + 1}</Text>
                        <Text style={[styles.deliveryHubTableCell, { width: 200, fontWeight: '700', color: '#1e293b' }]} numberOfLines={2}>
                          {it.item_name}
                        </Text>
                        <View style={{ width: 70, alignItems: 'center' }}>
                          <View style={styles.deliveryHubUnitChip}>
                            <Text style={styles.deliveryHubUnitChipText}>{it.unit}</Text>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.deliveryHubTableCell,
                            { width: 120, textAlign: 'center', fontWeight: '800', fontSize: 15, color: it.remain_wh > 0 ? '#d97706' : '#cbd5e1' },
                          ]}
                        >
                          {rtrimNum(it.remain_wh)}
                        </Text>
                        <View style={{ width: 100, alignItems: 'center' }}>
                          <View style={[styles.deliveryHubStatusPill, { backgroundColor: it.is_sent ? '#dcfce7' : '#f1f5f9' }]}>
                            <Text style={[styles.deliveryHubStatusPillText, { color: it.is_sent ? '#047857' : '#475569' }]}>
                              {it.is_sent ? 'ส่งสำเร็จ' : 'รอจัดส่ง'}
                            </Text>
                          </View>
                        </View>
                        <View style={{ width: 130, alignItems: 'center' }}>
                          {it.remain_wh > 0 ? (
                            <TouchableOpacity style={styles.deliveryHubDispatchBtn} onPress={() => project && openDeliveryForm(project)}>
                              <Ionicons name="car-outline" size={12} color="#fff" />
                              <Text style={styles.deliveryHubDispatchBtnText}>เปิดใบจัดส่ง</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.deliveryHubDisabledBtn}>
                              <Ionicons name="ban-outline" size={12} color="#94a3b8" />
                              <Text style={styles.deliveryHubDisabledBtnText}>ไม่พร้อมจัดส่ง</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </ScrollView>
        )}

        {project && (
          <TouchableOpacity style={styles.deliveryHubFab} onPress={() => openDeliveryForm(project)}>
            <Ionicons name="car-outline" size={16} color="#fff" />
            <Text style={styles.deliveryHubFabText}>สร้างใบจัดส่งใหม่</Text>
          </TouchableOpacity>
        )}

        {/* Modal: เลือกเลขที่ใบจัดส่ง (DO) ก่อนไปหน้า "ตรวจสอบหน้างาน (รายบิล)" — เหมือน openDriverConfirm() บนเว็บ */}
        <Modal visible={doPickerModal.visible} transparent animationType="fade" onRequestClose={() => setDoPickerModal((s) => ({ ...s, visible: false }))}>
          <TouchableOpacity style={styles.pickerModalOverlay} activeOpacity={1} onPress={() => setDoPickerModal((s) => ({ ...s, visible: false }))}>
            <View style={styles.pickerModalSheet}>
              <Text style={styles.pickerModalTitle}>เลือกใบจัดส่ง (DO)</Text>
              {doPickerModal.loading ? (
                <ActivityIndicator color="#6d28d9" style={{ paddingVertical: 20 }} />
              ) : doPickerModal.options.length === 0 ? (
                <Text style={styles.itemEmptyText}>หน้างานนี้ยังไม่เคยมีการสร้างใบจัดส่งสินค้าครับ</Text>
              ) : (
                <ScrollView style={{ maxHeight: 380 }}>
                  {doPickerModal.options.map((no) => (
                    <TouchableOpacity
                      key={no}
                      style={styles.pickerModalOption}
                      onPress={() => {
                        setDoPickerModal((s) => ({ ...s, visible: false }));
                        router.push({ pathname: '/DriverConfirmItems', params: { do_no: no } } as never);
                      }}
                    >
                      <Text style={styles.pickerModalOptionText}>{no}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity style={styles.pickerModalCloseBtn} onPress={() => setDoPickerModal((s) => ({ ...s, visible: false }))}>
                <Text style={styles.pickerModalCloseBtnText}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    );
  }

  // ปุ่มลัด จัดส่งสินค้า / บัญชีโครงการ — 2 ช่องกว้างเท่ากันในแถวเดียว (แบบปุ่มคลัง/บิลของหน้าเอกสาร PO/AX)
  // ใช้ทั้งในการ์ดลิสต์ (กดได้เลยไม่ต้องเข้าหน้ารายละเอียด) และในหน้ารายละเอียด หน้างานสต๊อกไม่มีปุ่มจัดส่ง (ตามเว็บ)
  function renderProjectQuickActions(p: Project, style?: object) {
    return (
      <View style={[styles.quickActionRow, style]}>
        {!p.isStockSite && (
          <TouchableOpacity style={styles.quickActionBtn} onPress={() => handleLinkIcon('delivery', p)}>
            <Ionicons name="car-outline" size={16} color="#4f46e5" />
            <Text style={styles.quickActionBtnText} numberOfLines={1}>จัดส่งสินค้า</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.quickActionBtn} onPress={() => handleLinkIcon('accounting', p)}>
          <Ionicons name="document-text-outline" size={16} color="#4f46e5" />
          <Text style={styles.quickActionBtnText} numberOfLines={1}>บัญชีโครงการ</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // การ์ดในลิสต์ — สรุป: รหัสงาน/สถานะ, ชื่อโครงการ, บริษัท/ลูกค้า, งบ, นับถอยหลังสัญญา + ปุ่มลัด 2 ปุ่ม
  // รายละเอียดที่เหลือทั้งหมด (ผู้รับผิดชอบ/ช่าง/ปิดจบ/ยกเลิก ฯลฯ — เดิม 13 ส่วนในการ์ดเดียว) อยู่ใน
  // renderDetailModal() แตะที่ไหนในการ์ดก็ได้เพื่อเปิด
  function renderProjectCard({ item: p }: { item: Project }) {
    const sm = statusMeta(p);
    const cc = contractCountdown(p);
    const pay = paymentMeta(p.paymentState);
    const isCancelled = p.isCanceled;

    return (
      <View style={[styles.card, isCancelled && styles.cardCancelled]}>
        {/* โซนข้อมูล — แตะเพื่อเปิดหน้ารายละเอียด */}
        <TouchableOpacity activeOpacity={0.7} onPress={() => void openDetailModal(p)}>
        <View style={styles.cardTopRow}>
          {p.paymentState === 'paid_full' ? (
            <View style={styles.codeBadgePaidFull}>
              <Ionicons name="checkmark-circle" size={12} color="#e9d5ff" />
              <Text style={styles.codeBadgePaidFullText}>{displayCode(p.code)}</Text>
            </View>
          ) : (
            <View style={styles.codeBadge}>
              <Text style={styles.codeBadgeText}>{displayCode(p.code)}</Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: sm.bg, borderColor: sm.border }]}>
            <Ionicons name={sm.icon} size={12} color={sm.fg} />
            <Text style={[styles.statusBadgeText, { color: sm.fg }]}>{p.statusShow}</Text>
          </View>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {p.projectName}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {p.companyName} • {p.customerName}
        </Text>

        {isCancelled && !!p.cancelReason && (
          <Text style={styles.cardCancelLine} numberOfLines={1}>
            ยกเลิก — {p.cancelReason}
          </Text>
        )}

        <View style={styles.cardSummaryBottomRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardBudget}>{formatBaht(p.budget)}</Text>
            <View style={styles.cardCountdownLine}>
              <Ionicons name={cc.icon} size={12} color={cc.fg} />
              <Text style={[styles.cardCountdownText, { color: cc.fg }]} numberOfLines={1}>
                สัญญาถึง {p.contractEndDateShow} · {cc.text}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {pay && (
              <View style={[styles.paymentBadge, { backgroundColor: pay.bg, marginTop: 0 }]}>
                <Text style={[styles.paymentBadgeText, { color: pay.fg }]}>{pay.text}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
          </View>
        </View>

        </TouchableOpacity>

        {/* โซนปุ่ม — แยกจากโซนข้อมูลด้วยเส้นคั่น กันกดพลาด */}
        {!isCancelled && <View style={styles.cardActionZone}>{renderProjectQuickActions(p)}</View>}
      </View>
    );
  }

  function closeDetail() {
    detailProjectIdRef.current = null;
    setMoreMenuOpen(false);
    setDetailModal((s) => ({ ...s, visible: false }));
  }

  // หน้ารายละเอียดโครงการเต็มจอ (แบบหน้าเอกสาร PO/AX) — หัวสรุป + ปุ่มจัดการ + ผู้รับผิดชอบ + ข้อมูล get_detail
  // + หมายเหตุ + ทีมช่าง; action ที่ย้อน/ทำลายสถานะ (ยกเลิกปิดจบ, ยกเลิกโครงการ) อยู่ในเมนู ⋯ มุมขวาบน
  function renderDetailModal() {
    const snapshot = detailModal.project;
    if (!snapshot) return null;
    // ดึงตัวล่าสุดจากลิสต์ตาม id — หลังกด action ลิสต์โหลดใหม่ หน้านี้จะเห็นสถานะใหม่ทันที
    const p = projects.find((x) => x.id === snapshot.id) ?? snapshot;
    const sm = statusMeta(p);
    const cc = contractCountdown(p);
    const asm = assemblyMeta(p);
    const pay = paymentMeta(p.paymentState);
    const isCancelled = p.isCanceled;
    const isClosed = p.isFinished;

    const menuItems: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }[] = [];
    if (!isCancelled && isClosed) menuItems.push({ key: 'undo', label: 'ยกเลิกปิดจบหน้างาน', icon: 'arrow-undo-outline', onPress: () => handleUndoComplete(p) });
    if (!isCancelled) menuItems.push({ key: 'cancel', label: 'ยกเลิกโครงการ', icon: 'ban-outline', onPress: () => openCancelForm(p) });

    return (
      <Modal visible={detailModal.visible} animationType="slide" onRequestClose={closeDetail}>
        {/* iOS: Modal เป็นหน้าต่างแยก SafeAreaProvider ของแอปครอบไม่ถึง -> SafeAreaView ได้ระยะขอบ 0
            หัวหน้า/ปุ่มกลับไปอยู่ใต้ notch กดไม่ได้ จึงต้องมี provider ของตัวเองใน Modal */}
        <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.detailHeaderBar}>
            <TouchableOpacity onPress={closeDetail} style={styles.detailHeaderBtn}>
              <Ionicons name="chevron-back" size={22} color="#0f172a" />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>
              โครงการ {displayCode(p.code)}
            </Text>
            {menuItems.length > 0 ? (
              <TouchableOpacity onPress={() => setMoreMenuOpen(true)} style={styles.detailHeaderBtn} accessibilityLabel="เมนูเพิ่มเติม">
                <Ionicons name="ellipsis-horizontal" size={22} color="#0f172a" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>

          <ScrollView contentContainerStyle={styles.detailScrollContent} showsVerticalScrollIndicator={false}>
            {/* หัวสรุป */}
            <View style={styles.detailTopCard}>
              <View style={styles.cardTopRow}>
                {p.paymentState === 'paid_full' ? (
                  <View style={styles.codeBadgePaidFull}>
                    <Ionicons name="checkmark-circle" size={12} color="#e9d5ff" />
                    <Text style={styles.codeBadgePaidFullText}>{displayCode(p.code)}</Text>
                  </View>
                ) : (
                  <View style={styles.codeBadge}>
                    <Text style={styles.codeBadgeText}>{displayCode(p.code)}</Text>
                  </View>
                )}
                <View style={[styles.statusBadge, { backgroundColor: sm.bg, borderColor: sm.border }]}>
                  <Ionicons name={sm.icon} size={12} color={sm.fg} />
                  <Text style={[styles.statusBadgeText, { color: sm.fg }]}>{p.statusShow}</Text>
                </View>
              </View>
              <Text style={styles.cardTitle}>{p.projectName}</Text>
              <Text style={styles.cardSubtitle}>
                {p.companyName} • {p.customerName}
              </Text>
              <View style={styles.cardMetaRow}>
                <View style={styles.cardMetaItem}>
                  <Ionicons name="cash-outline" size={13} color="#059669" />
                  <Text style={styles.cardMetaValue}>{formatBaht(p.budget)}</Text>
                </View>
                <View style={styles.cardMetaItem}>
                  <MaterialCommunityIcons name="briefcase-outline" size={13} color="#64748b" />
                  <Text style={styles.cardMetaLabel}>{p.jobType || '-'}</Text>
                </View>
              </View>
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
                {pay && (
                  <View style={[styles.paymentBadge, { backgroundColor: pay.bg, marginTop: 0 }]}>
                    <Text style={[styles.paymentBadgeText, { color: pay.fg }]}>{pay.text}</Text>
                  </View>
                )}
              </View>
            </View>

            {isCancelled && (
              <>
                <TouchableOpacity style={styles.cancelReasonBox} onPress={() => setCancelViewModal({ visible: true, project: p })} activeOpacity={0.7}>
                  <Ionicons name="information-circle" size={13} color="#ef4444" />
                  <Text style={styles.cancelReasonText} numberOfLines={2}>
                    ดูเหตุผลที่ยกเลิก — {p.cancelReason}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.restoreBox} onPress={() => handleRestoreProject(p)} activeOpacity={0.7}>
                  <Ionicons name="refresh" size={13} color="#059669" />
                  <Text style={styles.restoreBoxText}>กู้คืนหน้างานที่ถูกยกเลิก</Text>
                </TouchableOpacity>
              </>
            )}

            {!isCancelled && (
              <>
                <Text style={styles.detailSectionLabel}>จัดการโครงการ</Text>
                {renderProjectQuickActions(p)}
                <View style={styles.quickActionRow}>
                  <TouchableOpacity style={styles.quickActionBtn} onPress={() => handleLinkIcon('edit', p)}>
                    <Ionicons name="create-outline" size={16} color="#4f46e5" />
                    <Text style={styles.quickActionBtnText} numberOfLines={1}>แก้ไขโครงการ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickActionBtn} onPress={() => openItemStatus(p)}>
                    <Ionicons name="cube-outline" size={16} color="#7c3aed" />
                    <Text style={styles.quickActionBtnText} numberOfLines={1}>สถานะอุปกรณ์</Text>
                  </TouchableOpacity>
                </View>
                {!isClosed && (
                  <TouchableOpacity style={styles.primaryActionBtn} onPress={() => handleForceComplete(p)}>
                    <Ionicons name="flag" size={16} color="#fff" />
                    <Text style={styles.primaryActionBtnText}>ปิดจบหน้างาน</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <Text style={styles.detailSectionLabel}>ผู้รับผิดชอบ</Text>
            <View style={[styles.ownersRow, styles.detailOwnersBox]}>
              <TouchableOpacity style={styles.ownerTapArea} onPress={() => openDebtModal(p)} activeOpacity={0.7}>
                <Text style={styles.ownerLabel}>ติดตามหนี้ (แตะเพื่อเปลี่ยน)</Text>
                {p.debtOwner ? (
                  <View style={styles.ownerChip}>
                    <Ionicons name={p.debtIsTeam ? 'people-outline' : 'person-outline'} size={11} color="#4f46e5" />
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
                  <Ionicons name={p.salesIsTeam ? 'people-outline' : 'person-outline'} size={11} color="#4f46e5" />
                  <Text style={styles.ownerChipText}>{p.projectOwner}</Text>
                </View>
              </View>
            </View>

            {detailModal.loading ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4f46e5" />
              </View>
            ) : !detailModal.detail ? (
              <Text style={styles.itemEmptyText}>ไม่พบข้อมูลโครงการนี้</Text>
            ) : (
              renderDetailSections(detailModal.detail)
            )}
          </ScrollView>

          {/* เมนู ⋯ — ซ้อนอยู่ในหน้ารายละเอียด ปิดเมนูก่อนแล้วค่อยเปิดหน้ายืนยันของรายการที่เลือก */}
          <Modal visible={moreMenuOpen} transparent animationType="fade" onRequestClose={() => setMoreMenuOpen(false)}>
            <View style={styles.sheetOverlay}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setMoreMenuOpen(false)} />
              <View style={styles.sheet}>
                <View style={styles.sheetHandle} />
                <Text style={styles.menuSheetHint}>รายการด้านล่างจะถามยืนยันก่อนเสมอ</Text>
                {menuItems.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={styles.menuSheetItem}
                    onPress={() => {
                      setMoreMenuOpen(false);
                      m.onPress();
                    }}
                  >
                    <Ionicons name={m.icon} size={18} color="#dc2626" />
                    <Text style={styles.menuSheetItemText}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.sheetResetBtn} onPress={() => setMoreMenuOpen(false)}>
                  <Text style={styles.sheetResetBtnText}>ปิด</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    );
  }

  // ส่วนข้อมูลจาก get_detail (สัญญา/ลูกค้า/ยื่นซอง/ค้ำประกัน/รับประกัน/ระบบ) + หมายเหตุ + ทีมช่าง
  // ย้ายมาจาก modal "ดูรายละเอียด" แบบป๊อปอัพเดิม — เนื้อหา/การทำงานเหมือนเดิมทุกอย่าง
  function renderDetailSections(d: ProjectDetail) {
    return (
      <>
        <DetailSection title="ข้อมูลโครงการและสัญญา">
          <DetailRow label="บริษัท" value={d.company_name} />
          <DetailRow label="ประเภทงาน" value={d.job_type_name} />
          <DetailRow label="สถานะ" value={d.status_show} />
          <DetailRow label="เลขที่สัญญา" value={d.contract_no} />
          <DetailRow label="เลขที่ PO" value={d.purchase_order_no} />
          <DetailRow label="วันที่เริ่ม" value={fmtDateCE(d.start_date) || d.start_date_thai} />
          <DetailRow label="วันที่สิ้นสุด" value={fmtDateCE(d.end_date) || d.end_date_thai} />
          <DetailRow label="ระยะเวลาสัญญา" value={d.contract_duration ? `${d.contract_duration} ${d.contract_unit}` : ''} />
          <DetailRow label="คงเหลือ (สัญญา)" value={d.contract_countdown_text} />
          <DetailRow label="งบประมาณโครงการ" value={formatBaht(d.project_budget)} />
        </DetailSection>

        <DetailSection title="ข้อมูลลูกค้า">
          <DetailRow label="ชื่อลูกค้า" value={d.customer_name} />
          <DetailRow label="สังกัด/หน่วยงาน" value={d.customer_affiliation} />
          <DetailRow label="จังหวัด" value={d.customer_province} />
          <DetailRow label="ที่อยู่" value={d.customer_address} />
          <DetailRow label="ผู้ติดต่อ" value={d.contact_person} />
          <DetailRow label="เบอร์ติดต่อ" value={d.contact_phone} />
        </DetailSection>

        {/* ลำดับ/ชื่อช่องตามหน้าเว็บ (project detail) — วันที่ทุกช่องเป็น DD/MM/YYYY ปี ค.ศ. แบบเว็บ */}
        <DetailSection title="ข้อมูลการยื่นซองและเสนอราคา">
          <DetailRow label="ประเภทการยื่นซอง" value={d.bidding_type || '-'} />
          <DetailRow label="เลขที่ใบเสนอราคา" value={d.quotation_no || '-'} />
          <DetailRow label="ผู้เปิดใบเสนอราคา" value={d.quote_creator || '-'} />
          <DetailRow label="วันที่ยื่นซอง" value={fmtDateCE(d.bidding_date)} />
        </DetailSection>

        <DetailSection title="ข้อมูลการค้ำประกัน">
          <DetailRow label="ประเภทการค้ำประกัน" value={d.guarantee_type || '-'} />
          <DetailRow label="ธนาคาร" value={d.bank_name} />
          <DetailRow label="เลขบัญชี" value={d.bank_account} />
          <DetailRow label="เลขที่หนังสือค้ำ" value={d.guarantee_no} />
          <DetailRow
            label="จำนวนเงินค้ำประกัน"
            value={d.guarantee_amount ? `${formatBaht(d.guarantee_amount)} (${Number(d.guarantee_percent || 0).toFixed(2)}%)` : ''}
            valueColor="#059669"
          />
          <DetailRow label="วันออกค้ำประกัน" value={fmtDateCE(d.guarantee_start_date)} />
          <DetailRow label="วันสิ้นสุดค้ำประกัน" value={fmtDateCE(d.guarantee_end_date)} />
          <DetailRow
            label="ระยะประกันสุทธิ"
            value={d.net_warranty ? (/^\d+$/.test(String(d.net_warranty).trim()) ? `${d.net_warranty} วัน` : d.net_warranty) : ''}
            valueColor="#d97706"
          />
        </DetailSection>

        <DetailSection title="การรับประกันและการแจ้งเตือน">
          <DetailRow
            label="สถานะการรับประกัน"
            value={d.warranty_countdown_text}
            valueColor={
              // w_level จาก server: expired / warning / normal / not_started / none
              d.warranty_urgency === 'expired' ? '#dc2626'
                : d.warranty_urgency === 'warning' ? '#d97706'
                  : d.warranty_urgency === 'normal' ? '#059669'
                    : '#64748b'
            }
          />
          <DetailRow label="ระยะเวลารับประกัน" value={d.warranty_value ? `${d.warranty_value} ${d.warranty_unit}` : ''} />
          <DetailRow label="วันสิ้นสุดรับประกัน" value={fmtDateCE(d.warranty_end_date)} />
          <DetailRow label="แจ้งเตือนหมดประกัน" value={`${d.alert_warranty_days ?? 0} วัน`} />
          <DetailRow label="แจ้งเตือนครบกำหนดส่งมอบ" value={`${d.alert_days_before_expire ?? 0} วัน`} />
        </DetailSection>

        <DetailSection title="ข้อมูลระบบ">
          <DetailRow label="ผู้รับผิดชอบโครงการ" value={`(${d.debt_type || 'บุคคล'}) ${d.debt_name || '-'}`} />
          <DetailRow label="ผู้ดูแลงานขาย" value={d.sales_name} />
          <DetailRow label="ผู้ลงข้อมูล" value={d.recorder || '-'} />
          <DetailRow
            label="ผู้แก้ไขล่าสุด"
            value={d.last_editor || '-'}
            extra={
              d.editor_count > 0 ? (
                <TouchableOpacity style={styles.editHistoryBtn} onPress={() => openEditHistory(d.id)}>
                  <Ionicons name="time-outline" size={12} color="#4f46e5" />
                  <Text style={styles.editHistoryBtnText}>ดูประวัติแก้ไข ({d.editor_count})</Text>
                </TouchableOpacity>
              ) : undefined
            }
          />
          <DetailRow label="วันเวลาที่ลงข้อมูล" value={fmtDateCE(d.created_at) || d.created_at_thai} />
          <DetailRow
            label="ปิดจบหน้างานโดย"
            value={d.closed_by}
            extra={d.closed_at ? <Text style={styles.detailSubValue}>🕒 {fmtDateCE(d.closed_at)}</Text> : undefined}
          />
          <DetailRow label="ยกเลิกโดย" value={d.canceled_by} />
          <DetailRow label="เหตุผลที่ยกเลิก" value={d.cancel_reason} />
          <DetailRow label="หมายเหตุคลัง" value={d.inventory_remark} />
        </DetailSection>

        <View style={styles.detailSection}>
          <DetailSectionTitle>หมายเหตุโครงการ</DetailSectionTitle>
          <View style={styles.detailSectionBox}>
            <Text style={styles.noteFieldLabel}>
              <Ionicons name="create-outline" size={12} color="#475569" /> กรอกหมายเหตุ
            </Text>
            <TextInput
              value={projectNotes.text}
              onChangeText={(v) => setProjectNotes((s) => ({ ...s, text: v }))}
              placeholder="ระบุรายละเอียดหมายเหตุ..."
              placeholderTextColor="#94a3b8"
              multiline
              style={[styles.modalTextarea, { minHeight: 70 }]}
            />
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: '#4f46e5', marginTop: 8, opacity: projectNotes.saving || !projectNotes.text.trim() ? 0.6 : 1 }]}
              onPress={saveProjectNote}
              disabled={projectNotes.saving || !projectNotes.text.trim()}
            >
              <Text style={styles.modalBtnText}>{projectNotes.saving ? 'กำลังบันทึก...' : 'บันทึกหมายเหตุ'}</Text>
            </TouchableOpacity>
          </View>

          {projectNotes.loading ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <ActivityIndicator color="#4f46e5" />
            </View>
          ) : projectNotes.list.length === 0 ? (
            <View style={styles.noteEmptyBox}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color="#94a3b8" />
              <Text style={styles.noteEmptyText}>ยังไม่มีหมายเหตุสำหรับโครงการนี้</Text>
            </View>
          ) : (
            projectNotes.list.map((n) => (
              <View key={n.id} style={styles.noteItemBox}>
                <Text style={styles.noteItemText}>{n.note}</Text>
                <View style={styles.noteItemFootRow}>
                  <Text style={styles.noteItemMeta}>
                    {n.name} · {n.created_at ? fmtDateCE(n.created_at) : n.created_at_thai}
                    {n.is_edited ? ' (แก้ไขแล้ว)' : ''}
                  </Text>
                  <TouchableOpacity onPress={() => confirmDeleteProjectNote(n.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={15} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* กล่อง "ข้อมูลการจัดสรรทีมช่าง" — พอร์ตตรงจาก project_dashboard.php:4632-4652
            (แยกออกจาก DetailSection ปกติเพราะต้องมีปุ่มติ๊ก "ช่างเข้าหน้างาน" ที่หัวกล่อง
            และการ์ดทีมช่างแบบพาร์สข้อความ ไม่ใช่แค่แถว label/value ธรรมดา) — วางไว้
            ล่างสุดต่อจาก "หมายเหตุโครงการ" ให้ตรงลำดับกับเว็บ */}
        <View style={styles.detailSection}>
          <View style={styles.techBoxHeadRow}>
            <Text style={styles.detailSectionTitle}>ข้อมูลการจัดสรรทีมช่าง</Text>
            <TouchableOpacity
              style={[styles.techOnsiteToggle, !!d.tech_onsite && styles.techOnsiteToggleActive]}
              onPress={() => toggleTechOnsiteInModal(!d.tech_onsite)}
            >
              <Ionicons name={d.tech_onsite ? 'checkbox' : 'square-outline'} size={15} color={d.tech_onsite ? '#059669' : '#94a3b8'} />
              <Text style={[styles.techOnsiteToggleText, !!d.tech_onsite && { color: '#059669' }]}>ช่างเข้าหน้างาน</Text>
            </TouchableOpacity>
          </View>
          {d.tech_onsite ? (
            <Text style={styles.techOnsiteConfirmedText}>
              ยืนยันโดย {d.tech_onsite_by || '-'} เมื่อ {fmtDateCE(d.tech_onsite_at) || d.tech_onsite_at_thai || '-'}
            </Text>
          ) : null}

          {(() => {
            const teams = groupTechTeams(d.req_tech_team, d.technicians, d.tech_full_details);
            if (teams.length === 0) {
              return (
                <View style={styles.techEmptyBox}>
                  <Ionicons name="person-remove-outline" size={22} color="#cbd5e1" />
                  <Text style={styles.techEmptyText}>ไม่มีข้อมูลทีมช่างสำหรับโครงการนี้</Text>
                </View>
              );
            }
            return teams.map((team, ti) => (
              <View key={ti} style={styles.techTeamBlock}>
                {teams.length > 1 && <Text style={styles.techTeamName}>{team.teamName}</Text>}
                {team.items.length === 0 ? (
                  <Text style={styles.techEmptyText}>ยังไม่มีรายชื่อช่างของทีมนี้</Text>
                ) : (
                  team.items.map((it, ii) => {
                    const parsed = parseTechFullText(it.fullText);
                    return (
                      <View key={ii} style={styles.techCard}>
                        {!!it.dispName && (
                          <View style={styles.techCardTag}>
                            <Ionicons name="create-outline" size={11} color="#4338ca" />
                            <Text style={styles.techCardTagText}>ระบุชื่อ: {it.dispName}</Text>
                          </View>
                        )}
                        {parsed.isPlainText ? (
                          <Text style={styles.techCardPlainText}>{it.fullText}</Text>
                        ) : (
                          <>
                            <View style={styles.techCardRow}>
                              <Ionicons name="storefront-outline" size={14} color="#4f46e5" />
                              <Text style={styles.techCardShop}>{parsed.shop}</Text>
                            </View>
                            <DetailRow label="ช่างผู้รับผิดชอบ" value={parsed.technician} />
                            <DetailRow label="ความเชี่ยวชาญ" value={parsed.specialty} />
                            <DetailRow label="จังหวัด" value={parsed.province !== '-' ? `จ.${parsed.province}` : undefined} />
                            <DetailRow label="ติดต่อ" value={parsed.contact} />
                          </>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            ));
          })()}
        </View>

        {/* ประวัติแก้ไข — ซ้อนอยู่ในโมดัลรายละเอียด (render ข้างในเพื่อให้ขึ้นบนสุดบน Android) */}
        <Modal visible={editHistory.visible} transparent animationType="fade" onRequestClose={() => setEditHistory((s) => ({ ...s, visible: false }))}>
          <View style={styles.editHistoryOverlay}>
            <View style={styles.editHistorySheet}>
              <View style={styles.editHistoryHead}>
                <Ionicons name="time-outline" size={16} color="#4f46e5" />
                <Text style={styles.editHistoryTitle}>ประวัติการแก้ไข</Text>
                <TouchableOpacity onPress={() => setEditHistory((s) => ({ ...s, visible: false }))} hitSlop={8}>
                  <Ionicons name="close" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
              {editHistory.loading ? (
                <ActivityIndicator color="#4f46e5" style={{ paddingVertical: 24 }} />
              ) : editHistory.logs.length === 0 ? (
                <Text style={styles.editHistoryEmpty}>ยังไม่มีประวัติการแก้ไข</Text>
              ) : (
                <ScrollView style={{ maxHeight: 380 }}>
                  {editHistory.logs.map((l) => (
                    <View key={l.seq} style={styles.editHistoryRow}>
                      <View style={styles.editHistorySeq}>
                        <Text style={styles.editHistorySeqText}>{l.seq}</Text>
                      </View>
                      <Text style={styles.editHistoryEditor} numberOfLines={1}>{l.editor || '-'}</Text>
                      <Text style={styles.editHistoryAt}>{l.editedAt}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </>
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
    return (
      <CheckIncompleteProjectsScreen
        onBack={() => setActiveScreen('dashboard')}
        onEditProject={(id) => {
          setEditProjectId(id);
          setActiveScreen('editProject');
        }}
      />
    );
  }
  // กลับจากหน้าแก้ไข/บัญชีโครงการ -> ข้อมูลอาจเปลี่ยน โหลดรายการ+KPI ใหม่แบบเงียบๆ ก่อนกลับ dashboard
  function backToDashboardAndRefresh() {
    setActiveScreen('dashboard');
    void loadProjects({ silent: true });
    void loadDashboard();
  }

  if (activeScreen === 'createProject') {
    return <CreateProjectScreen onBack={() => setActiveScreen('dashboard')} onSaved={() => setActiveScreen('dashboard')} />;
  }
  if (activeScreen === 'projectAccounting') {
    return <ProjectAccountingScreen id={accountingProjectId} onBack={backToDashboardAndRefresh} onSaved={backToDashboardAndRefresh} />;
  }
  if (activeScreen === 'editProject') {
    return <CreateProjectScreen editId={editProjectId} onBack={backToDashboardAndRefresh} onSaved={backToDashboardAndRefresh} />;
  }
  if (activeScreen === 'delivery') {
    return renderDeliveryHub();
  }

  if (loading && projects.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.emptyBox}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.emptyText}>กำลังโหลดข้อมูล...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      {renderTopBar()}
      <FlatList
        data={filteredProjects}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderProjectCard}
        ListHeaderComponent={renderHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} tintColor="#4f46e5" />}
        ListEmptyComponent={
          loadError ? (
            <View style={styles.emptyBox}>
              <Ionicons name="alert-circle-outline" size={28} color="#ef4444" />
              <Text style={styles.emptyText}>{loadError}</Text>
              <TouchableOpacity style={styles.actionBtn} onPress={() => loadProjects()}>
                <Text style={styles.actionBtnText}>ลองใหม่</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="folder-open-outline" size={28} color="#cbd5e1" />
              <Text style={styles.emptyText}>ไม่พบโครงการที่ตรงกับตัวกรอง</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />

      {/* หน้ารายละเอียด + bottom sheet ตัวกรอง — วางก่อนโมดัล action ทุกตัว ให้โมดัลที่เปิดจากหน้ารายละเอียดซ้อนอยู่ด้านบน */}
      {renderDetailModal()}
      {renderFilterSheet()}
      {renderCanceledModal()}

      {/* Modal: ยกเลิกโครงการ (บังคับกรอกเหตุผล — ตรงกับ cancelProject() ของจริง) */}
      <Modal visible={cancelFormModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ModalHeader
              icon="ban-outline"
              title="ยืนยันการยกเลิกโครงการ"
              colors={['#ef4444', '#b91c1c']}
              onClose={() => setCancelFormModal({ visible: false })}
            />
            <View style={styles.modalBody}>
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
        </View>
      </Modal>

      {/* Modal: ดูเหตุผลที่ยกเลิก (อ่านอย่างเดียว — ตรงกับ showCancelReason() ของจริง) */}
      <Modal visible={cancelViewModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ModalHeader
              icon="information-circle-outline"
              title="ข้อมูลการยกเลิกโครงการ"
              colors={['#334155', '#1e293b']}
              onClose={() => setCancelViewModal({ visible: false })}
            />
            <View style={styles.modalBody}>
              <View style={styles.cancelViewRow}>
                <Ionicons name="person-circle-outline" size={22} color="#4f46e5" />
                <View>
                  <Text style={styles.cancelViewLabel}>ผู้ทำรายการยกเลิก</Text>
                  <Text style={styles.cancelViewValue}>{cancelViewModal.project?.canceledBy ?? 'ไม่ระบุ'}</Text>
                </View>
              </View>
              <Text style={[styles.modalFieldLabel, { marginTop: 12 }]}>หมายเหตุ / เหตุผลที่ยกเลิก</Text>
              <View style={styles.cancelViewReasonBox}>
                <Text style={styles.cancelViewReasonText}>{cancelViewModal.project?.cancelReason ?? 'ไม่มีหมายเหตุ'}</Text>
              </View>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#4f46e5', marginTop: 16 }]} onPress={() => setCancelViewModal({ visible: false })}>
                <Text style={styles.modalBtnText}>ปิดหน้าต่าง</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: เลือกปี — กดปุ่มปีแล้วมีลิสต์ให้เลือกตรงๆ เหมือนดรอปดาวน์บนเว็บ แทนที่จะกดแล้วปีลดลงทีละ 1
          แบบเดิม (ปุ่มมีไอคอน chevron-down หลอกว่าเป็นดรอปดาวน์ แต่จริงๆ กดแล้วลดปีไม่มีลิสต์ให้เลือก) */}
      <Modal visible={yearPickerVisible} transparent animationType="fade" onRequestClose={() => setYearPickerVisible(false)}>
        <TouchableOpacity style={styles.pickerModalOverlay} activeOpacity={1} onPress={() => setYearPickerVisible(false)}>
          <View style={styles.pickerModalSheet}>
            <Text style={styles.pickerModalTitle}>เลือกปี</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {yearOptions.map((y) => {
                const active = selectedYear === y;
                return (
                  <TouchableOpacity
                    key={y}
                    style={[styles.pickerModalOption, active && styles.pickerModalOptionActive]}
                    onPress={() => {
                      setSelectedYear(y);
                      setYearPickerVisible(false);
                    }}
                  >
                    <Text style={styles.pickerModalOptionText}>ปี ค.ศ. {y}</Text>
                    {active && <Ionicons name="checkmark" size={16} color="#1e40af" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.pickerModalCloseBtn} onPress={() => setYearPickerVisible(false)}>
              <Text style={styles.pickerModalCloseBtnText}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal: เลือกผู้รับผิดชอบติดตามหนี้ */}
      <Modal visible={debtModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <ModalHeader
              icon="person-outline"
              title="เลือกผู้รับผิดชอบติดตามหนี้"
              colors={['#4338ca', '#4f46e5']}
              onClose={() => setDebtModal({ visible: false })}
            />
            <View style={[styles.modalBody, { flexShrink: 1 }]}>
              <Text style={styles.modalSubtitle}>{debtModal.project?.projectName}</Text>
              <View style={styles.debtSearchBox}>
                <Ionicons name="search" size={14} color="#94a3b8" />
                <TextInput
                  style={styles.debtSearchInput}
                  placeholder="ค้นหาชื่อผู้ติดตามหนี้..."
                  placeholderTextColor="#94a3b8"
                  value={debtSearch}
                  onChangeText={setDebtSearch}
                />
              </View>
              <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
                {debtOwnerOptions
                  .filter((name) => name.toLowerCase().includes(debtSearch.trim().toLowerCase()))
                  .map((name) => (
                    <TouchableOpacity key={name} style={styles.debtOptionRow} onPress={() => assignDebtOwner(name)}>
                      <Ionicons name="person-circle-outline" size={18} color="#4f46e5" />
                      <Text style={styles.debtOptionText}>{name}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 10 }]} onPress={() => setDebtModal({ visible: false })}>
                <Text style={styles.modalBtnGhostText}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: สถานะอุปกรณ์ — โครงสร้างข้อมูลตรงกับ ajax_get_item_status.php */}
      <Modal visible={itemStatusModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <ModalHeader
              icon="list-outline"
              title="สถานะอุปกรณ์"
              colors={['#334155', '#0f172a']}
              onClose={() => setItemStatusModal((s) => ({ ...s, visible: false }))}
            />
            <View style={[styles.modalBody, { flexShrink: 1 }]}>
              <Text style={styles.modalSubtitle}>{itemStatusModal.project?.projectName}</Text>
              <View style={styles.itemHistoryBtnRow}>
                <TouchableOpacity style={styles.itemHistoryBtn} onPress={() => openHistoryLog('delete')}>
                  <Ionicons name="trash-outline" size={11} color="#64748b" />
                  <Text style={styles.itemHistoryBtnText}>ประวัติการลบ</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.itemHistoryBtn} onPress={() => openHistoryLog('unmerge')}>
                  <Ionicons name="construct-outline" size={11} color="#64748b" />
                  <Text style={styles.itemHistoryBtnText}>ประวัติยกเลิกรวมค่าแรง</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
              {itemStatusModal.loading ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#4f46e5" />
                </View>
              ) : itemStatusModal.items.length === 0 ? (
                <Text style={styles.itemEmptyText}>ยังไม่มีรายการสินค้าในโครงการนี้</Text>
              ) : (
                itemStatusModal.items.map((it) => (
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
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                      <TouchableOpacity style={[styles.itemNoteBtn, { flex: 1, marginTop: 0 }]} onPress={() => void openPoNotesForItem(it.id, it.itemName)}>
                        <Ionicons name="chatbubble-ellipses-outline" size={12} color="#475569" />
                        <Text style={styles.itemNoteBtnText}>หมายเหตุ PO</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.itemNoteBtn, { flex: 1, marginTop: 0, backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }]} onPress={() => void openPoManage(it.id, it.itemName)}>
                        <Ionicons name="construct-outline" size={12} color="#4f46e5" />
                        <Text style={[styles.itemNoteBtnText, { color: '#4f46e5' }]}>จัดการ PO</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
              </ScrollView>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 12 }]} onPress={() => setItemStatusModal((s) => ({ ...s, visible: false }))}>
                <Text style={styles.modalBtnGhostText}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: จัดการ PO ของรายการสินค้า — get_item_pos (ขยาย)/update_tax_invoice/upload_slip/
          delete_po/delete_po_item/delete_project_item/use_from_stock/set_labor_merge */}
      <Modal visible={poManageModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <ModalHeader
              icon="construct-outline"
              title="จัดการ PO"
              colors={['#4f46e5', '#4338ca']}
              onClose={() => setPoManageModal((s) => ({ ...s, visible: false }))}
            />
            <View style={[styles.modalBody, { flexShrink: 1 }]}>
              <Text style={styles.modalSubtitle}>{poManageModal.itemName}</Text>

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#4f46e5' }]} onPress={() => setStockUseModal({ visible: true, qty: '', unitPrice: '', withdrawUser: '', saving: false })}>
                  <Text style={styles.modalBtnText}>ใช้จากสต๊อก</Text>
                </TouchableOpacity>
                {poManageModal.itemPurchaseStatus === 'รวมค่าแรง' ? (
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#d97706' }]} onPress={() => setLaborUnmergeNoteModal({ visible: true, note: '', saving: false })}>
                    <Text style={styles.modalBtnText}>ยกเลิกรวมค่าแรง</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#7c3aed' }]} onPress={mergeAsLabor}>
                    <Text style={styles.modalBtnText}>รวมเป็นค่าแรงช่าง</Text>
                  </TouchableOpacity>
                )}
              </View>
              {poManageModal.itemPurchaseStatus === 'รวมค่าแรง' && (
                <View style={[styles.warnBadge, { alignSelf: 'flex-start', marginTop: 8 }]}>
                  <Ionicons name="construct" size={11} color="#fff" />
                  <Text style={styles.warnBadgeText}>สถานะปัจจุบัน: รวมค่าแรงช่างแล้ว</Text>
                </View>
              )}

              <ScrollView style={{ marginTop: 12, maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                {poManageModal.loading ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#4f46e5" />
                  </View>
                ) : poManageModal.lines.length === 0 ? (
                  <Text style={styles.itemEmptyText}>ยังไม่มีประวัติการสั่งซื้อ/เบิกของรายการนี้</Text>
                ) : (
                  poManageModal.lines.map((l) => (
                    <View key={l.poi_id} style={styles.poLineCard}>
                      <View style={styles.poLineTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.poLineNumber}>{l.po_number}</Text>
                          <Text style={styles.poLineSupplier}>
                            {l.supplier_name} · {formatShortThaiDate(l.order_date)}
                            {l.is_claim ? ' · เคลม' : ''}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.poLineDeleteBtn}
                          onPress={() => setDeleteReasonModal({ visible: true, kind: 'po_item', poiId: l.poi_id, poId: l.po_id, reason: '', saving: false })}
                        >
                          <Ionicons name="trash-outline" size={13} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.poLineGrid}>
                        <View style={styles.itemGridCell}>
                          <Text style={styles.itemGridLabel}>จำนวน</Text>
                          <Text style={styles.itemGridValue}>{l.buy_quantity}</Text>
                        </View>
                        <View style={styles.itemGridCell}>
                          <Text style={styles.itemGridLabel}>ราคา/หน่วย</Text>
                          <Text style={styles.itemGridValue}>{formatBaht(l.buy_unit_price)}</Text>
                        </View>
                        <View style={styles.itemGridCell}>
                          <Text style={styles.itemGridLabel}>รวม</Text>
                          <Text style={styles.itemGridValue}>{formatBaht(l.total_price)}</Text>
                        </View>
                      </View>
                      <View style={styles.poLineChipRow}>
                        <TouchableOpacity
                          style={[styles.poLineChip, l.has_tax_invoice ? { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' } : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}
                          onPress={() => toggleTaxInvoice(l.po_id, 'inv1')}
                        >
                          <Ionicons name={l.has_tax_invoice ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={l.has_tax_invoice ? '#059669' : '#94a3b8'} />
                          <Text style={[styles.poLineChipText, { color: l.has_tax_invoice ? '#059669' : '#94a3b8' }]}>ใบกำกับ 1</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.poLineChip, l.tax_invoice_2 ? { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' } : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}
                          onPress={() => toggleTaxInvoice(l.po_id, 'inv2')}
                        >
                          <Ionicons name={l.tax_invoice_2 ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={l.tax_invoice_2 ? '#059669' : '#94a3b8'} />
                          <Text style={[styles.poLineChipText, { color: l.tax_invoice_2 ? '#059669' : '#94a3b8' }]}>ใบกำกับ 2</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.poLineChip, l.slip_file ? { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' } : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}
                          onPress={() => attachSlip(l.po_id)}
                          disabled={poManageModal.busyPoiId === -1}
                        >
                          <Ionicons name={l.slip_file ? 'document-attach' : 'attach-outline'} size={12} color={l.slip_file ? '#4f46e5' : '#94a3b8'} />
                          <Text style={[styles.poLineChipText, { color: l.slip_file ? '#4f46e5' : '#94a3b8' }]}>{l.slip_file ? 'มีสลิป (แนบเพิ่ม)' : 'แนบสลิป'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.poLineChip, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]} onPress={() => setDeleteReasonModal({ visible: true, kind: 'po', poId: l.po_id, reason: '', saving: false })}>
                          <Ionicons name="trash" size={12} color="#ef4444" />
                          <Text style={[styles.poLineChipText, { color: '#ef4444' }]}>ลบทั้งบิลนี้</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>

              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ef4444', marginTop: 12 }]} onPress={confirmDeleteWholeItem}>
                <Text style={styles.modalBtnText}>ลบรายการสินค้านี้ทั้งหมด</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 8 }]} onPress={() => setPoManageModal((s) => ({ ...s, visible: false }))}>
                <Text style={styles.modalBtnGhostText}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: กรอกเหตุผลลบ PO / บรรทัดสั่งซื้อ */}
      <Modal visible={deleteReasonModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ModalHeader
              icon="trash-outline"
              title={deleteReasonModal.kind === 'po' ? 'ลบทั้งบิล PO' : 'ลบรายการสั่งซื้อนี้'}
              colors={['#ef4444', '#b91c1c']}
              onClose={() => setDeleteReasonModal({ visible: false, reason: '', saving: false })}
            />
            <View style={styles.modalBody}>
              <Text style={styles.modalSubtitle}>การลบนี้ถาวร ย้อนกลับไม่ได้ — โปรดระบุเหตุผล</Text>
              <TextInput
                value={deleteReasonModal.reason}
                onChangeText={(v) => setDeleteReasonModal((s) => ({ ...s, reason: v }))}
                placeholder="กรอกเหตุผลที่ลบ..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                style={styles.modalTextarea}
              />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setDeleteReasonModal({ visible: false, reason: '', saving: false })}>
                  <Text style={styles.modalBtnGhostText}>ยกเลิก</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ef4444', opacity: deleteReasonModal.saving ? 0.6 : 1 }]} onPress={confirmDeleteReason} disabled={deleteReasonModal.saving}>
                  <Text style={styles.modalBtnText}>{deleteReasonModal.saving ? 'กำลังลบ...' : 'ยืนยันลบ'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: ใช้จากสต๊อก */}
      <Modal visible={stockUseModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ModalHeader
              icon="cube-outline"
              title="ใช้จากสต๊อก"
              colors={['#4f46e5', '#4338ca']}
              onClose={() => setStockUseModal({ visible: false, qty: '', unitPrice: '', withdrawUser: '', saving: false })}
            />
            <View style={styles.modalBody}>
              <Text style={styles.modalFieldLabel}>จำนวนที่เบิก</Text>
              <TextInput
                value={stockUseModal.qty}
                onChangeText={(v) => setStockUseModal((s) => ({ ...s, qty: v }))}
                placeholder="0"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                style={styles.modalTextarea}
              />
              <Text style={styles.modalFieldLabel}>ราคาต่อหน่วย (ถ้ามี)</Text>
              <TextInput
                value={stockUseModal.unitPrice}
                onChangeText={(v) => setStockUseModal((s) => ({ ...s, unitPrice: v }))}
                placeholder="0"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                style={styles.modalTextarea}
              />
              <Text style={styles.modalFieldLabel}>ผู้เบิก</Text>
              <TextInput
                value={stockUseModal.withdrawUser}
                onChangeText={(v) => setStockUseModal((s) => ({ ...s, withdrawUser: v }))}
                placeholder="ชื่อผู้เบิก"
                placeholderTextColor="#94a3b8"
                style={styles.modalTextarea}
              />
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#4f46e5', marginTop: 12, opacity: stockUseModal.saving ? 0.6 : 1 }]} onPress={confirmUseFromStock} disabled={stockUseModal.saving}>
                <Text style={styles.modalBtnText}>{stockUseModal.saving ? 'กำลังบันทึก...' : 'ยืนยันเบิกจากสต๊อก'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: หมายเหตุยกเลิกรวมค่าแรงช่าง (บังคับกรอก) */}
      <Modal visible={laborUnmergeNoteModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ModalHeader
              icon="construct-outline"
              title="ยกเลิกรวมค่าแรงช่าง"
              colors={['#d97706', '#b45309']}
              onClose={() => setLaborUnmergeNoteModal({ visible: false, note: '', saving: false })}
            />
            <View style={styles.modalBody}>
              <Text style={styles.modalFieldLabel}>เหตุผลที่ยกเลิก (บังคับกรอก)</Text>
              <TextInput
                value={laborUnmergeNoteModal.note}
                onChangeText={(v) => setLaborUnmergeNoteModal((s) => ({ ...s, note: v }))}
                placeholder="ระบุเหตุผล..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                style={styles.modalTextarea}
              />
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#d97706', marginTop: 12, opacity: laborUnmergeNoteModal.saving ? 0.6 : 1 }]}
                onPress={confirmUnmergeLabor}
                disabled={laborUnmergeNoteModal.saving}
              >
                <Text style={styles.modalBtnText}>{laborUnmergeNoteModal.saving ? 'กำลังบันทึก...' : 'ยืนยันยกเลิกรวมค่าแรง'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: ประวัติการลบ / ประวัติยกเลิกรวมค่าแรงช่าง (อ่านอย่างเดียว) */}
      <Modal visible={historyLogModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <ModalHeader
              icon={historyLogModal.kind === 'delete' ? 'trash-outline' : 'construct-outline'}
              title={historyLogModal.kind === 'delete' ? 'ประวัติการลบ PO/รายการสินค้า' : 'ประวัติยกเลิกรวมค่าแรงช่าง'}
              colors={['#475569', '#1e293b']}
              onClose={() => setHistoryLogModal((s) => ({ ...s, visible: false }))}
            />
            <View style={[styles.modalBody, { flexShrink: 1 }]}>
              <ScrollView style={{ marginTop: 6, maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                {historyLogModal.loading ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#4f46e5" />
                  </View>
                ) : historyLogModal.logs.length === 0 ? (
                  <Text style={styles.itemEmptyText}>ยังไม่มีประวัติ</Text>
                ) : historyLogModal.kind === 'delete' ? (
                  historyLogModal.logs.map((log) => (
                    <View key={log.id} style={styles.poNoteRow}>
                      <View style={styles.poNoteRowHead}>
                        <Text style={styles.poNoteRowUser}>{log.po_number || `PO #${log.po_id}`}</Text>
                        <Text style={styles.poNoteRowAt}>{formatShortThaiDateTime(log.deleted_at)}</Text>
                      </View>
                      <Text style={styles.poNoteRowText}>ลบโดย {log.deleted_by} — {log.delete_reason}</Text>
                      {Array.isArray(log.items) && log.items.length > 0 && (
                        <Text style={[styles.poNoteRowText, { color: '#94a3b8', marginTop: 4 }]}>
                          รายการ: {log.items.map((it: any) => it.item_name).join(', ')}
                        </Text>
                      )}
                    </View>
                  ))
                ) : (
                  historyLogModal.logs.map((log) => (
                    <View key={log.id} style={styles.poNoteRow}>
                      <View style={styles.poNoteRowHead}>
                        <Text style={styles.poNoteRowUser}>{log.created_by}</Text>
                        <Text style={styles.poNoteRowAt}>{formatShortThaiDateTime(log.created_at)}</Text>
                      </View>
                      <Text style={styles.poNoteRowText}>{log.note}</Text>
                      {Array.isArray(log.items) && log.items.length > 0 && (
                        <Text style={[styles.poNoteRowText, { color: '#94a3b8', marginTop: 4 }]}>
                          รายการ: {log.items.map((it: any) => it.name).join(', ')}
                        </Text>
                      )}
                    </View>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 12 }]} onPress={() => setHistoryLogModal((s) => ({ ...s, visible: false }))}>
                <Text style={styles.modalBtnGhostText}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: หมายเหตุ PO ต่อรายการสินค้า — get_po_remark_log/save_po_note/edit_po_note/delete_po_note */}
      <Modal visible={poNoteModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <ModalHeader
              icon="chatbubble-ellipses-outline"
              title="หมายเหตุ PO"
              colors={['#475569', '#1e293b']}
              onClose={() => setPoNoteModal((s) => ({ ...s, visible: false }))}
            />
            <View style={[styles.modalBody, { flexShrink: 1 }]}>
              <Text style={styles.modalSubtitle}>
                {poNoteModal.itemName}
                {'\n'}
                {poNoteModal.poNumber}
              </Text>
              <ScrollView style={{ marginTop: 10, maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {poNoteModal.loading ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#4f46e5" />
                  </View>
                ) : poNoteModal.logs.length === 0 ? (
                  <Text style={styles.itemEmptyText}>ยังไม่มีหมายเหตุ</Text>
                ) : (
                  poNoteModal.logs.map((log, idx) => {
                    const isMine = log.user === user?.fullname;
                    return (
                      <View key={idx} style={styles.poNoteRow}>
                        <View style={styles.poNoteRowHead}>
                          <Text style={styles.poNoteRowUser}>{log.user}</Text>
                          <Text style={styles.poNoteRowAt}>{formatShortThaiDateTime(log.datetime)}</Text>
                        </View>
                        <Text style={styles.poNoteRowText}>{log.note}</Text>
                        {isMine && (
                          <View style={styles.poNoteRowActions}>
                            <TouchableOpacity onPress={() => setPoNoteModal((s) => ({ ...s, text: log.note, editingIndex: idx }))}>
                              <Text style={styles.poNoteRowActionText}>แก้ไข</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => confirmPoNoteDelete(idx)}>
                              <Text style={[styles.poNoteRowActionText, { color: '#ef4444' }]}>ลบ</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
              <Text style={[styles.modalFieldLabel, { marginTop: 12 }]}>{poNoteModal.editingIndex !== null ? 'แก้ไขหมายเหตุ' : 'เพิ่มหมายเหตุใหม่'}</Text>
              <TextInput
                value={poNoteModal.text}
                onChangeText={(v) => setPoNoteModal((s) => ({ ...s, text: v }))}
                placeholder="กรอกหมายเหตุ..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                style={styles.modalTextarea}
              />
              <View style={styles.modalBtnRow}>
                {poNoteModal.editingIndex !== null && (
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnGhost]}
                    onPress={() => setPoNoteModal((s) => ({ ...s, text: '', editingIndex: null }))}
                  >
                    <Text style={styles.modalBtnGhostText}>ยกเลิกแก้ไข</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#334155', opacity: poNoteModal.saving ? 0.6 : 1 }]}
                  onPress={confirmPoNoteSave}
                  disabled={poNoteModal.saving}
                >
                  <Text style={styles.modalBtnText}>{poNoteModal.saving ? 'กำลังบันทึก...' : poNoteModal.editingIndex !== null ? 'บันทึกการแก้ไข' : 'เพิ่มหมายเหตุ'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: ประวัติรับเข้าคลัง / ประวัติจัดส่งหน้างาน (อ่านอย่างเดียว) */}
      <Modal visible={logModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <ModalHeader
              icon={logModal.kind === 'receive' ? 'cube-outline' : 'car-outline'}
              title={logModal.kind === 'receive' ? 'ประวัติรับเข้าคลัง' : 'ประวัติจัดส่งหน้างาน'}
              colors={logModal.kind === 'receive' ? ['#4f46e5', '#4338ca'] : ['#d97706', '#b45309']}
              onClose={() => setLogModal((s) => ({ ...s, visible: false }))}
            />
            <View style={[styles.modalBody, { flexShrink: 1 }]}>
              <Text style={styles.modalSubtitle}>{logModal.project?.projectName}</Text>
              <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
                {logModal.loading ? (
                  <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#4f46e5" />
                  </View>
                ) : logModal.logs.length === 0 ? (
                  <Text style={styles.itemEmptyText}>
                    {logModal.kind === 'receive' ? 'ยังไม่มีประวัติรับเข้าคลัง' : 'ยังไม่มีประวัติจัดส่งหน้างาน'}
                  </Text>
                ) : (
                  logModal.logs.map((l) => (
                    <View key={l.id} style={styles.itemCard}>
                      <View style={styles.itemCardTopRow}>
                        <Text style={styles.itemName} numberOfLines={2}>
                          {l.item_name}
                        </Text>
                        {logModal.kind === 'delivery' && !!l.delivery_status && (
                          <View style={[styles.itemStatusChip, { backgroundColor: '#f1f5f9' }]}>
                            <Text style={[styles.itemStatusChipText, { color: '#475569' }]}>{l.delivery_status}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.itemGrid}>
                        <View style={styles.itemGridCell}>
                          <Text style={styles.itemGridLabel}>{logModal.kind === 'receive' ? 'จำนวนรับ' : 'จำนวนส่ง'}</Text>
                          <Text style={styles.itemGridValue}>
                            {logModal.kind === 'receive' ? l.receive_qty : l.delivery_qty} {l.unit}
                          </Text>
                        </View>
                        <View style={styles.itemGridCell}>
                          <Text style={styles.itemGridLabel}>วันที่</Text>
                          <Text style={styles.itemGridValue}>
                            {formatShortThaiDate(String(logModal.kind === 'receive' ? l.receive_date : l.delivery_date).slice(0, 10))}
                          </Text>
                        </View>
                        <View style={styles.itemGridCell}>
                          <Text style={styles.itemGridLabel}>{logModal.kind === 'receive' ? 'ผู้รับ' : 'ผู้ส่ง'}</Text>
                          <Text style={styles.itemGridValue}>{(logModal.kind === 'receive' ? l.receiver_name : l.sender_name) || '-'}</Text>
                        </View>
                        {logModal.kind === 'receive' && !!l.po_number && (
                          <View style={styles.itemGridCell}>
                            <Text style={styles.itemGridLabel}>PO</Text>
                            <Text style={styles.itemGridValue}>{l.po_number}</Text>
                          </View>
                        )}
                        {logModal.kind === 'delivery' && (
                          <>
                            <View style={styles.itemGridCell}>
                              <Text style={styles.itemGridLabel}>ผู้รับหน้างาน</Text>
                              <Text style={styles.itemGridValue}>{l.receiver_name || '-'}</Text>
                            </View>
                            {!!l.delivery_no && (
                              <View style={styles.itemGridCell}>
                                <Text style={styles.itemGridLabel}>เลขที่ใบส่ง</Text>
                                <Text style={styles.itemGridValue}>{l.delivery_no}</Text>
                              </View>
                            )}
                            {Number(l.damaged_qty) > 0 && (
                              <View style={styles.itemGridCell}>
                                <Text style={styles.itemGridLabel}>ตีกลับ/เสียหาย</Text>
                                <Text style={[styles.itemGridValue, { color: '#ef4444' }]}>{l.damaged_qty}</Text>
                              </View>
                            )}
                          </>
                        )}
                      </View>

                      {logModal.kind === 'receive' && (
                        <View style={styles.logRowActions}>
                          <TouchableOpacity style={styles.logRowActionBtn} onPress={() => openEditReceiveLog(l)}>
                            <Ionicons name="create-outline" size={13} color="#4f46e5" />
                            <Text style={styles.logRowActionText}>แก้ไข</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.logRowActionBtn, { borderColor: '#fca5a5' }]} onPress={() => openDeleteReceiveDoc(l.receive_doc_id)}>
                            <Ionicons name="trash-outline" size={13} color="#ef4444" />
                            <Text style={[styles.logRowActionText, { color: '#ef4444' }]}>ลบทั้งบิล</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {logModal.kind === 'delivery' && l.delivery_status === 'กำลังจัดส่ง' && (
                        <View style={styles.logRowActions}>
                          <TouchableOpacity
                            style={styles.logRowActionBtn}
                            onPress={() => openDeliveryEditForm(logModal.project!, l.delivery_no)}
                          >
                            <Ionicons name="create-outline" size={13} color="#d97706" />
                            <Text style={[styles.logRowActionText, { color: '#d97706' }]}>แก้ไขใบจัดส่งนี้</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </ScrollView>
              {logModal.kind === 'receive' && logModal.project && (
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#4f46e5', marginTop: 12 }]}
                  onPress={() => openReceivePoList(logModal.project!)}
                >
                  <Text style={styles.modalBtnText}>+ รับของเข้าคลัง</Text>
                </TouchableOpacity>
              )}
              {logModal.kind === 'delivery' && logModal.project && (
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#d97706', marginTop: 12 }]}
                  onPress={() => openDeliveryForm(logModal.project!)}
                >
                  <Text style={styles.modalBtnText}>+ จัดส่งของไปหน้างาน</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 8 }]} onPress={() => setLogModal((s) => ({ ...s, visible: false }))}>
                <Text style={styles.modalBtnGhostText}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: แก้ไขจำนวนรับของในบิลเดิม — inventory_API_mobile.php action=update_receive_log */}
      <Modal visible={editReceiveLogModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ModalHeader
              icon="create-outline"
              title="แก้ไขจำนวนรับของ"
              colors={['#4f46e5', '#4338ca']}
              onClose={() => setEditReceiveLogModal((s) => ({ ...s, visible: false }))}
            />
            <View style={styles.modalBody}>
              <Text style={styles.modalSubtitle}>{editReceiveLogModal.log?.item_name}</Text>
              <Text style={styles.modalFieldLabel}>จำนวนที่รับ (เดิม {editReceiveLogModal.log?.receive_qty} {editReceiveLogModal.log?.unit})</Text>
              <TextInput
                style={styles.modalTextarea}
                keyboardType="decimal-pad"
                value={editReceiveLogModal.newQty}
                onChangeText={(v) => setEditReceiveLogModal((s) => ({ ...s, newQty: v }))}
                placeholder="0"
                placeholderTextColor="#94a3b8"
              />
              <Text style={styles.modalFieldLabel}>หมายเหตุการแก้ไข (ถ้ามี)</Text>
              <TextInput
                style={styles.modalTextarea}
                value={editReceiveLogModal.note}
                onChangeText={(v) => setEditReceiveLogModal((s) => ({ ...s, note: v }))}
                placeholder="ระบุเหตุผลที่แก้ไข..."
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5', opacity: editReceiveLogModal.saving ? 0.6 : 1 }]}
                onPress={confirmEditReceiveLog}
                disabled={editReceiveLogModal.saving}
              >
                <Text style={styles.modalBtnText}>{editReceiveLogModal.saving ? 'กำลังบันทึก...' : 'บันทึก'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: ลบบิลรับของทั้งรอบ — inventory_API_mobile.php action=delete_receive_session */}
      <Modal visible={deleteReceiveDocModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ModalHeader
              icon="trash-outline"
              title="ลบบิลรับของทั้งรอบ"
              colors={['#ef4444', '#b91c1c']}
              onClose={() => setDeleteReceiveDocModal((s) => ({ ...s, visible: false }))}
            />
            <View style={styles.modalBody}>
              <Text style={styles.modalSubtitle}>ลบแล้วรายการรับของทั้งหมดในบิลนี้จะหายไป (ระบบเก็บประวัติการลบไว้)</Text>
              <Text style={styles.modalFieldLabel}>เหตุผลที่ลบ</Text>
              <TextInput
                style={styles.modalTextarea}
                value={deleteReceiveDocModal.reason}
                onChangeText={(v) => setDeleteReceiveDocModal((s) => ({ ...s, reason: v }))}
                placeholder="ระบุเหตุผล..."
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#ef4444', opacity: deleteReceiveDocModal.saving ? 0.6 : 1 }]}
                onPress={confirmDeleteReceiveDoc}
                disabled={deleteReceiveDocModal.saving}
              >
                <Text style={styles.modalBtnText}>{deleteReceiveDocModal.saving ? 'กำลังลบ...' : 'ยืนยันลบบิลนี้'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: กรอกจำนวนจัดส่งหน้างาน — inventory_API_mobile.php action=get_delivery_ready_items / save_delivery */}
      <Modal visible={deliveryFormModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <ModalHeader
              icon="car-outline"
              title={deliveryFormModal.editDoNo ? `แก้ไขใบจัดส่ง ${deliveryFormModal.editDoNo}` : 'จัดส่งของไปหน้างาน'}
              colors={['#d97706', '#b45309']}
              onClose={() => setDeliveryFormModal((s) => ({ ...s, visible: false }))}
            />
            <View style={[styles.modalBody, { flexShrink: 1 }]}>
              <Text style={styles.modalSubtitle}>{deliveryFormModal.project?.projectName}</Text>
              <ScrollView style={{ marginTop: 6 }} showsVerticalScrollIndicator={false}>
                {deliveryFormModal.loading ? (
                  <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#d97706" />
                  </View>
                ) : (
                  <>
                    {deliveryFormModal.items.length === 0 ? (
                      <Text style={styles.itemEmptyText}>ไม่มีสินค้าในคลังที่พร้อมจัดส่ง</Text>
                    ) : (
                      deliveryFormModal.items.map((it) => (
                        <View key={it.project_item_id} style={styles.itemCard}>
                          <Text style={styles.itemName} numberOfLines={2}>{it.item_name}</Text>
                          <View style={styles.itemGrid}>
                            <View style={styles.itemGridCell}>
                              <Text style={styles.itemGridLabel}>คงเหลือในคลัง</Text>
                              <Text style={[styles.itemGridValue, { color: it.remain_wh > 0 ? '#16a34a' : '#94a3b8' }]}>{it.remain_wh} {it.unit}</Text>
                            </View>
                          </View>
                          {it.remain_wh > 0 && (
                            <View style={{ marginTop: 8 }}>
                              <Text style={styles.modalFieldLabel}>จำนวนที่จัดส่ง</Text>
                              <TextInput
                                style={styles.modalTextarea}
                                keyboardType="decimal-pad"
                                placeholder="0"
                                placeholderTextColor="#94a3b8"
                                value={deliveryFormModal.qtyMap[String(it.project_item_id)] ?? ''}
                                onChangeText={(v) => setDeliveryFormModal((s) => ({ ...s, qtyMap: { ...s.qtyMap, [String(it.project_item_id)]: v } }))}
                              />
                            </View>
                          )}
                          {(it.sub_items ?? []).map((sub: any) => (
                            <View key={sub.sub_id} style={{ marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: '#e2e8f0' }}>
                              <Text style={styles.itemGridLabel}>{sub.item_name} (คงเหลือ {sub.remain_wh})</Text>
                              <TextInput
                                style={styles.modalTextarea}
                                keyboardType="decimal-pad"
                                placeholder="0"
                                placeholderTextColor="#94a3b8"
                                value={deliveryFormModal.qtyMap[`SUB_${sub.sub_id}`] ?? ''}
                                onChangeText={(v) => setDeliveryFormModal((s) => ({ ...s, qtyMap: { ...s.qtyMap, [`SUB_${sub.sub_id}`]: v } }))}
                              />
                            </View>
                          ))}
                        </View>
                      ))
                    )}

                    <Text style={[styles.modalFieldLabel, { marginTop: 4 }]}>ประเภทรถ</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['internal', 'external'] as const).map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[styles.filterChip, deliveryFormModal.transportType === t && styles.filterChipActive]}
                          onPress={() => setDeliveryFormModal((s) => ({ ...s, transportType: t }))}
                        >
                          <Text style={[styles.filterChipText, deliveryFormModal.transportType === t && styles.filterChipTextActive]}>
                            {t === 'internal' ? 'รถบริษัท' : 'รถนอก'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.modalFieldLabel}>ชื่อคนขับ</Text>
                    <TextInput
                      style={styles.modalTextarea}
                      value={deliveryFormModal.driver}
                      onChangeText={(v) => setDeliveryFormModal((s) => ({ ...s, driver: v }))}
                      placeholder="ชื่อคนขับ"
                      placeholderTextColor="#94a3b8"
                    />
                    {deliveryFormModal.transportType === 'internal' && (
                      <>
                        <Text style={styles.modalFieldLabel}>คนรถ (ถ้ามี)</Text>
                        <TextInput
                          style={styles.modalTextarea}
                          value={deliveryFormModal.helper}
                          onChangeText={(v) => setDeliveryFormModal((s) => ({ ...s, helper: v }))}
                          placeholder="ชื่อคนรถ"
                          placeholderTextColor="#94a3b8"
                        />
                      </>
                    )}
                    <Text style={styles.modalFieldLabel}>ทะเบียนรถ</Text>
                    <TextInput
                      style={styles.modalTextarea}
                      value={deliveryFormModal.vehicle}
                      onChangeText={(v) => setDeliveryFormModal((s) => ({ ...s, vehicle: v }))}
                      placeholder="เช่น 1กก-1234"
                      placeholderTextColor="#94a3b8"
                    />
                    <Text style={styles.modalFieldLabel}>ผู้รับที่หน้างาน (ถ้าทราบ)</Text>
                    <TextInput
                      style={styles.modalTextarea}
                      value={deliveryFormModal.receiverName}
                      onChangeText={(v) => setDeliveryFormModal((s) => ({ ...s, receiverName: v }))}
                      placeholder="ชื่อผู้รับหน้างาน"
                      placeholderTextColor="#94a3b8"
                    />
                    <Text style={styles.modalFieldLabel}>หมายเหตุ (ถ้ามี)</Text>
                    <TextInput
                      style={styles.modalTextarea}
                      value={deliveryFormModal.note}
                      onChangeText={(v) => setDeliveryFormModal((s) => ({ ...s, note: v }))}
                      placeholder="ระบุหมายเหตุ..."
                      placeholderTextColor="#94a3b8"
                    />
                  </>
                )}
              </ScrollView>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#d97706', marginTop: 12, opacity: deliveryFormModal.saving ? 0.6 : 1 }]}
                onPress={confirmSaveDelivery}
                disabled={deliveryFormModal.saving}
              >
                <Text style={styles.modalBtnText}>
                  {deliveryFormModal.saving ? 'กำลังบันทึก...' : deliveryFormModal.editDoNo ? 'บันทึกการแก้ไข' : 'สร้างใบจัดส่ง'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 8 }]} onPress={() => setDeliveryFormModal((s) => ({ ...s, visible: false }))}>
                <Text style={styles.modalBtnGhostText}>ยกเลิก</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: เลือก PO ที่จะรับของเข้าคลัง — inventory_API_mobile.php action=get_receive_pos */}
      <Modal visible={receivePoListModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <ModalHeader
              icon="cube-outline"
              title="เลือกใบสั่งซื้อที่จะรับของ"
              colors={['#4f46e5', '#4338ca']}
              onClose={() => setReceivePoListModal((s) => ({ ...s, visible: false }))}
            />
            <View style={[styles.modalBody, { flexShrink: 1 }]}>
              <Text style={styles.modalSubtitle}>{receivePoListModal.project?.projectName}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {(['normal', 'claim'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.filterChip, receivePoListModal.mode === m && styles.filterChipActive]}
                    onPress={() => openReceivePoList(receivePoListModal.project!, m)}
                  >
                    <Text style={[styles.filterChipText, receivePoListModal.mode === m && styles.filterChipTextActive]}>
                      {m === 'normal' ? 'ปกติ' : 'เคลม / ตีกลับ'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
                {receivePoListModal.loading ? (
                  <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#4f46e5" />
                  </View>
                ) : receivePoListModal.pos.length === 0 ? (
                  <Text style={styles.itemEmptyText}>
                    {receivePoListModal.mode === 'claim' ? 'ไม่มีรายการเคลม/ของตีกลับที่รอรับเข้าคลัง' : 'ไม่มีใบสั่งซื้อที่รอรับเข้าคลัง'}
                  </Text>
                ) : (
                  receivePoListModal.pos.map((po) => (
                    <TouchableOpacity
                      key={po.id}
                      style={styles.itemCard}
                      onPress={() => openReceiveForm(receivePoListModal.project!, po.id, po.po_number, receivePoListModal.mode)}
                    >
                      <View style={styles.itemCardTopRow}>
                        <Text style={styles.itemName} numberOfLines={1}>{po.po_number}</Text>
                        <View
                          style={[
                            styles.itemStatusChip,
                            { backgroundColor: po.status_text === 'ครบแล้ว' ? '#dcfce7' : po.status_text === 'บางส่วน' ? '#fef3c7' : '#f1f5f9' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.itemStatusChipText,
                              { color: po.status_text === 'ครบแล้ว' ? '#047857' : po.status_text === 'บางส่วน' ? '#b45309' : '#64748b' },
                            ]}
                          >
                            {po.status_text}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.itemGrid}>
                        <View style={styles.itemGridCell}>
                          <Text style={styles.itemGridLabel}>ผู้ขาย</Text>
                          <Text style={styles.itemGridValue} numberOfLines={1}>{po.supplier_name || '-'}</Text>
                        </View>
                        <View style={styles.itemGridCell}>
                          <Text style={styles.itemGridLabel}>รับแล้ว / สั่งซื้อ</Text>
                          <Text style={styles.itemGridValue}>{po.total_received} / {po.total_buy}</Text>
                        </View>
                        <View style={styles.itemGridCell}>
                          <Text style={styles.itemGridLabel}>คงเหลือ</Text>
                          <Text style={[styles.itemGridValue, { color: po.remain_qty > 0 ? '#d97706' : '#16a34a' }]}>{po.remain_qty}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 12 }]} onPress={() => setReceivePoListModal((s) => ({ ...s, visible: false }))}>
                <Text style={styles.modalBtnGhostText}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: กรอกจำนวนรับของ — inventory_API_mobile.php action=get_po_receive_items / save_receive */}
      <Modal visible={receiveFormModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <ModalHeader
              icon="cube-outline"
              title={`รับของ — PO ${receiveFormModal.poNumber ?? ''}`}
              colors={['#4f46e5', '#4338ca']}
              onClose={() => setReceiveFormModal((s) => ({ ...s, visible: false }))}
            />
            <View style={[styles.modalBody, { flexShrink: 1 }]}>
              <ScrollView style={{ marginTop: 6 }} showsVerticalScrollIndicator={false}>
                {receiveFormModal.loading ? (
                  <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#4f46e5" />
                  </View>
                ) : receiveFormModal.items.length === 0 ? (
                  <Text style={styles.itemEmptyText}>ไม่มีรายการให้รับในใบสั่งซื้อนี้</Text>
                ) : (
                  receiveFormModal.items.map((it) => (
                    <View key={it.poi_id} style={styles.itemCard}>
                      <Text style={styles.itemName} numberOfLines={2}>{it.item_name}</Text>
                      <View style={styles.itemGrid}>
                        <View style={styles.itemGridCell}>
                          <Text style={styles.itemGridLabel}>สั่งซื้อ / รับแล้ว</Text>
                          <Text style={styles.itemGridValue}>{it.buy_quantity} / {it.receive_qty} {it.unit}</Text>
                        </View>
                        <View style={styles.itemGridCell}>
                          <Text style={styles.itemGridLabel}>คงเหลือ</Text>
                          <Text style={[styles.itemGridValue, { color: it.remain_qty > 0 ? '#d97706' : '#16a34a' }]}>{it.remain_qty}</Text>
                        </View>
                      </View>
                      {it.remain_qty > 0 && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={styles.modalFieldLabel}>จำนวนที่รับ</Text>
                          <TextInput
                            style={styles.modalTextarea}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor="#94a3b8"
                            value={receiveFormModal.qtyMap[String(it.poi_id)] ?? ''}
                            onChangeText={(v) => setReceiveFormModal((s) => ({ ...s, qtyMap: { ...s.qtyMap, [String(it.poi_id)]: v } }))}
                          />
                        </View>
                      )}
                      {(it.sub_items ?? []).map((sub: any) => (
                        sub.remain_qty > 0 && (
                          <View key={sub.sub_id} style={{ marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: '#e2e8f0' }}>
                            <Text style={styles.itemGridLabel}>{sub.item_name} (คงเหลือ {sub.remain_qty})</Text>
                            <TextInput
                              style={styles.modalTextarea}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor="#94a3b8"
                              value={receiveFormModal.qtyMap[`SUB_${sub.sub_id}`] ?? ''}
                              onChangeText={(v) => setReceiveFormModal((s) => ({ ...s, qtyMap: { ...s.qtyMap, [`SUB_${sub.sub_id}`]: v } }))}
                            />
                          </View>
                        )
                      ))}
                    </View>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5', marginTop: 12, opacity: receiveFormModal.saving ? 0.6 : 1 }]}
                onPress={confirmSaveReceive}
                disabled={receiveFormModal.saving}
              >
                <Text style={styles.modalBtnText}>{receiveFormModal.saving ? 'กำลังบันทึก...' : 'บันทึกรับของ'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 8 }]} onPress={() => setReceiveFormModal((s) => ({ ...s, visible: false }))}>
                <Text style={styles.modalBtnGhostText}>ยกเลิก</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ====================================================================
// Styles
// ====================================================================

// ---- แผ่นตัวกรอง: กล่องตามหมวด + ปุ่มตัวเลือกกว้างเท่ากัน 2 คอลัมน์ (รูปแบบเดียวกับหน้าลูกหนี้) ----
function SheetGroup({ icon, color, title, children }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; children: ReactNode }) {
  return (
    <View style={styles.sheetGroup}>
      <View style={styles.sheetGroupHead}>
        <View style={[styles.sheetGroupIcon, { backgroundColor: color + '1a' }]}>
          <Ionicons name={icon} size={13} color={color} />
        </View>
        <Text style={styles.sheetGroupTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function SheetOption({ label, active, onPress, icon, activeColor = '#4f46e5', count }: {
  label: string; active: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; activeColor?: string; count?: number;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.sheetOpt, active && { backgroundColor: activeColor, borderColor: activeColor }]}
    >
      {active ? (
        <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
      ) : icon ? (
        <Ionicons name={icon} size={13} color={activeColor} />
      ) : null}
      <Text style={[styles.sheetOptText, active && { color: '#ffffff' }]} numberOfLines={2}>{label}</Text>
      {(count ?? 0) > 0 && (
        <View style={[styles.sheetOptCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
          <Text style={[styles.sheetOptCountText, active && { color: '#ffffff' }]}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // แผ่นตัวกรอง (รูปแบบเดียวกับหน้าลูกหนี้)
  sheetGroup: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 10 },
  sheetGroupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sheetGroupIcon: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  sheetGroupTitle: { color: '#0f172a', fontSize: 13, fontWeight: '900' },
  sheetDateLabel: { color: '#64748b', fontSize: 11.5, fontWeight: '700', marginBottom: 6 },
  sheetOptGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  sheetOpt: { width: '48.8%', minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  sheetOptText: { flexShrink: 1, color: '#334155', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  sheetOptCount: { minWidth: 20, height: 18, borderRadius: 9, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  sheetOptCountText: { fontSize: 10.5, fontWeight: '900', color: '#475569' },
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },

  // ---- แบบเดียวกับหน้าเอกสาร PO/AX: แถบค้นหาติดบน / bottom sheet / การ์ดสรุปพื้นเข้ม / หน้ารายละเอียด ----
  topBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarSearch: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  topBarBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  topBarBtnActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  topBarBadge: { position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  topBarBadgeText: { fontSize: 10.5, fontWeight: '900', color: '#4f46e5' },
  topBarAddBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  activeFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  activeFilterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 220, backgroundColor: '#f1f5f9', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 5 },
  activeFilterChipText: { fontSize: 11.5, fontWeight: '600', color: '#334155', flexShrink: 1 },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingBottom: 16, maxHeight: '85%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', marginTop: 8 },
  sheetHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sheetFooter: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8 },
  sheetResetBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 12 },
  sheetResetBtnText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  sheetApplyBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#4f46e5', paddingVertical: 12 },
  sheetApplyBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  menuSheetHint: { fontSize: 11.5, color: '#94a3b8', textAlign: 'center', marginTop: 10, marginBottom: 6 },
  menuSheetItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  menuSheetItemText: { fontSize: 14, fontWeight: '700', color: '#dc2626' },

  // ปุ่มเมนูลัดสีทึบ (แบบเว็บ) — 3 ปุ่มต่อแถว
  webQuickGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 6, marginHorizontal: 14, marginTop: 12 },
  webQuickBtn: { width: '31.5%', height: 42, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 4 },
  webQuickBtnText: { color: '#334155', fontSize: 11, fontWeight: '800', flexShrink: 1 },

  // การ์ดภาพรวม (ธีมเว็บ) — พื้นขาว แถบน้ำเงินด้านบน การ์ดตัวเลขขอบซ้ายสี
  overviewCard: { marginHorizontal: 14, marginTop: 12, backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1.5, borderColor: '#c7d2fe', overflow: 'hidden', paddingBottom: 12, elevation: 2 },
  overviewTopBar: { height: 6 },
  overviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10 },
  brandMark: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e0d7c1', backgroundColor: '#fdfbf6', alignItems: 'center', justifyContent: 'center' },
  brandText: { color: '#a8904f', fontSize: 11, fontWeight: '900' },
  overviewTitle: { flex: 1, color: '#0f172a', fontSize: 14.5, fontWeight: '900' },
  overviewYearChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 6 },
  overviewYearChipText: { color: '#475569', fontSize: 11, fontWeight: '800' },
  cardActionZone: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  kpiSections: { gap: 12, paddingHorizontal: 10 },
  kpiSection: { gap: 8 },
  kpiSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  kpiSectionIcon: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  kpiSectionTitle: { color: '#334155', fontSize: 12.5, fontWeight: '900' },
  tapHintIcon: { position: 'absolute', top: 6, right: 7 },
  kpiToggleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10, marginHorizontal: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  kpiToggleText: { fontSize: 12, fontWeight: '800', color: '#4f46e5' },
  kpiHint: { fontSize: 10.5, color: '#94a3b8', paddingHorizontal: 12, marginBottom: 6 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  kpiTile: { width: '48.8%', minHeight: 74, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, paddingHorizontal: 10, paddingVertical: 9, gap: 4 },
  kpiTileHighlight: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  kpiLabel: { flex: 1, color: '#334155', fontSize: 11, fontWeight: '700' },
  kpiValue: { color: '#0f172a', fontSize: 20, fontWeight: '900' },
  kpiUnit: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  kpiMoney: { fontSize: 17, fontWeight: '900' },
  kpiSub: { color: '#94a3b8', fontSize: 10, fontWeight: '600' },

  // ปุ่ม "สรุปข้อมูลแยกตามบริษัท" + การ์ดรายบริษัท
  breakdownBtnWrap: { marginHorizontal: 40, marginTop: 14, borderRadius: 50, overflow: 'hidden', elevation: 3 },
  breakdownBtn: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  breakdownBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  companyKpiCard: { borderColor: '#e2e8f0', borderWidth: 1 },
  companyGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginHorizontal: 14, marginTop: 14 },
  companyMiniCard: { width: '48.5%', minHeight: 96, backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: 'transparent', elevation: 3, shadowColor: '#94a3b8', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  companyMiniCardActive: { borderColor: '#4f46e5' },
  companyMiniTopBar: { height: 4 },
  companyMiniBody: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingTop: 14 },
  companyMiniIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  companyMiniName: { flex: 1, color: '#0f172a', fontSize: 13.5, fontWeight: '900' },
  companyMiniChevron: { width: 26, height: 26, borderRadius: 7, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  companyMiniChevronActive: { borderColor: '#a5b4fc', backgroundColor: '#eef2ff' },
  companyMiniSub: { color: '#94a3b8', fontSize: 10.5, fontWeight: '600', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 12 },

  // โมดัลประวัติงานยกเลิก
  canceledHeaderBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff', paddingHorizontal: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  canceledHeaderTitle: { flex: 1, color: '#0f172a', fontSize: 16, fontWeight: '900' },
  canceledSummary: { flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: '#475569', padding: 12 },
  canceledSummaryLabel: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  canceledSummaryValue: { color: '#0f172a', fontSize: 18, fontWeight: '900', marginTop: 2 },
  canceledEmpty: { color: '#94a3b8', fontSize: 12.5, textAlign: 'center', paddingVertical: 30 },
  canceledCard: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, gap: 3 },
  canceledCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  canceledCode: { color: '#475569', fontSize: 12, fontWeight: '900' },
  canceledBudget: { color: '#ef4444', fontSize: 13, fontWeight: '900' },
  canceledName: { color: '#0f172a', fontSize: 13.5, fontWeight: '800', marginTop: 2 },
  canceledCustomer: { color: '#64748b', fontSize: 11.5 },
  canceledReasonBox: { marginTop: 6, backgroundColor: '#fef2f2', borderRadius: 8, padding: 8 },
  canceledReasonLabel: { color: '#b91c1c', fontSize: 10.5, fontWeight: '800' },
  canceledReasonText: { color: '#7f1d1d', fontSize: 12, marginTop: 2 },

  cardCancelled: { opacity: 0.7 },
  codeBadge: { backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  codeBadgeText: { color: '#4338ca', fontWeight: '800', fontSize: 12 },
  cardCancelLine: { fontSize: 11.5, color: '#b91c1c', marginTop: 6 },
  cardSummaryBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 },
  cardBudget: { fontSize: 16, fontWeight: '900', color: '#4f46e5' },
  cardCountdownLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardCountdownText: { fontSize: 11, fontWeight: '600', flexShrink: 1 },
  quickActionRow: { flexDirection: 'row', gap: 8 },
  quickActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, minHeight: 44 },
  quickActionBtnText: { fontSize: 12, fontWeight: '700', color: '#334155' },

  detailHeaderBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  detailHeaderBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  detailHeaderTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#0f172a' },
  detailScrollContent: { padding: 16, paddingBottom: 40, gap: 8 },
  detailTopCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 14 },
  detailSectionLabel: { fontSize: 12, fontWeight: '800', color: '#64748b', marginTop: 8 },
  detailOwnersBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12 },
  primaryActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#059669', borderRadius: 10, minHeight: 46 },
  primaryActionBtnText: { fontSize: 13.5, fontWeight: '800', color: '#fff' },

  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  pickerModalSheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  pickerModalTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  pickerModalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  pickerModalOptionActive: { backgroundColor: '#eef2ff' },
  pickerModalOptionText: { fontSize: 12.5, fontWeight: '700', color: '#334155', flexShrink: 1 },
  pickerModalCloseBtn: { marginTop: 8, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 },
  pickerModalCloseBtnText: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },

  deliveryHubHeader: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  deliveryHubBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 6 },
  deliveryHubBackBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  deliveryHubTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  deliveryHubSubtitle: { color: '#cbd5e1', fontSize: 11.5, marginTop: 2, maxWidth: 260 },
  deliveryHubLinksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  deliveryHubLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  deliveryHubLinkBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  deliveryHubStatRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  deliveryHubStatCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', borderBottomWidth: 4 },
  deliveryHubStatIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deliveryHubStatLabel: { fontSize: 11.5, color: '#64748b', fontWeight: '600', marginBottom: 2 },
  deliveryHubStatValue: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  deliveryHubTableCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  deliveryHubTableTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  deliveryHubTableHeadRow: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 6, gap: 6 },
  deliveryHubTableHeadCell: { fontSize: 11, fontWeight: '800', color: '#475569' },
  deliveryHubTableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6, gap: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  deliveryHubTableCell: { fontSize: 12.5, color: '#334155' },
  deliveryHubUnitChip: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  deliveryHubUnitChipText: { fontSize: 11, color: '#475569' },
  deliveryHubDispatchBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#d97706', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  deliveryHubDispatchBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  deliveryHubDisabledBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  deliveryHubDisabledBtnText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
  deliveryHubStatusPill: { borderRadius: 50, paddingHorizontal: 10, paddingVertical: 5 },
  deliveryHubStatusPillText: { fontSize: 11, fontWeight: '700' },
  deliveryHubFab: { position: 'absolute', left: 16, right: 16, bottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#d97706', borderRadius: 14, paddingVertical: 14, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  deliveryHubFabText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  searchInput: { flex: 1, fontSize: 13, color: '#0f172a', padding: 0 },

  filterChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 6 },
  filterChipActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  filterChipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },

  resultCount: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, fontSize: 12, color: '#64748b', fontWeight: '600' },

  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginHorizontal: 16, marginTop: 12, padding: 14 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codeBadgePaidFull: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#7e22ce', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  codeBadgePaidFullText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 50, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  // จังหวะระยะห่างในการ์ดโครงการ (13 ส่วนซ้อนกัน) ปรับให้เหลือ 2 ค่า: 8 = เกี่ยวเนื่องกันแน่น
  // (เช่น subtitle ใต้ title), 12 = คั่นระหว่างส่วน (เดิมมีทั้ง 6/8/10 ปนกันไม่มีแพทเทิร์น)
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 8 },
  cardSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },

  cancelReasonBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#fef2f2', borderRadius: 8, padding: 8, marginTop: 12 },
  cancelReasonText: { fontSize: 11.5, color: '#b91c1c', flex: 1 },
  restoreBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#ecfdf5', borderRadius: 8, padding: 8, marginTop: 8 },
  restoreBoxText: { fontSize: 11.5, color: '#059669', fontWeight: '700' },

  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaValue: { fontSize: 12.5, fontWeight: '700', color: '#059669' },
  cardMetaLabel: { fontSize: 12, color: '#64748b' },

  paymentBadge: { alignSelf: 'flex-start', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 3, marginTop: 8 },
  paymentBadgeText: { fontSize: 11, fontWeight: '700' },

  countdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  countdownBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countdownText: { fontSize: 11.5, fontWeight: '600' },
  assemblyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3 },
  assemblyBadgeText: { fontSize: 10.5, fontWeight: '700' },

  ownersRow: { flexDirection: 'row', justifyContent: 'space-between' },
  ownerTapArea: { flex: 1 },
  ownerLabel: { fontSize: 10.5, color: '#94a3b8', fontWeight: '600', marginBottom: 4 },
  ownerChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#eef2ff', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 3 },
  ownerChipText: { fontSize: 11.5, color: '#4338ca', fontWeight: '700' },
  ownerChipEmpty: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  ownerChipEmptyText: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },

  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  actionBtnText: { fontSize: 11.5, fontWeight: '700' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { color: '#94a3b8', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  // เทียบเท่า .modal-header ของ .php — ทุก modal ใช้โครง/ระยะห่างชุดเดียวกัน ต่างแค่สีไล่เฉด
  modalHeaderBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  modalHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 10 },
  modalHeaderTitle: { fontSize: 15, fontWeight: '800', color: '#ffffff', flexShrink: 1 },
  modalCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  modalBody: { padding: 18 },
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
  debtSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
  debtSearchInput: { flex: 1, fontSize: 13, color: '#0f172a', padding: 0 },

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
  logRowActions: { flexDirection: 'row', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eef2f6' },
  logRowActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#a5f3fc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  logRowActionText: { fontSize: 11.5, fontWeight: '700', color: '#4f46e5' },
  itemNoteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingVertical: 7, marginTop: 8 },
  itemNoteBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  itemHistoryBtnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  itemHistoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  itemHistoryBtnText: { fontSize: 10, fontWeight: '700', color: '#64748b' },
  poLineCard: { backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 10, marginBottom: 8 },
  poLineTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  poLineNumber: { fontSize: 12.5, fontWeight: '800', color: '#1e293b' },
  poLineSupplier: { fontSize: 10.5, color: '#94a3b8', marginTop: 1 },
  poLineDeleteBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
  poLineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  poLineChipRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  poLineChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1 },
  poLineChipText: { fontSize: 10, fontWeight: '700' },
  warnBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#d97706', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 6 },
  warnBadgeText: { fontSize: 10.5, fontWeight: '800', color: '#fff' },
  poNoteRow: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, marginBottom: 8 },
  poNoteRowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  poNoteRowUser: { fontSize: 11.5, fontWeight: '800', color: '#334155' },
  poNoteRowAt: { fontSize: 10, color: '#94a3b8' },
  poNoteRowText: { fontSize: 12.5, color: '#1e293b', marginTop: 5, lineHeight: 18 },
  poNoteRowActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  poNoteRowActionText: { fontSize: 11, fontWeight: '700', color: '#4f46e5' },

  detailSection: { marginTop: 14 },
  detailSectionTitle: { fontSize: 12.5, fontWeight: '800', color: '#1e293b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  detailSectionBox: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10 },
  noteFieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#475569', marginTop: 10, marginBottom: 4 },
  techBoxHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  techOnsiteToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 5 },
  techOnsiteToggleActive: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  techOnsiteToggleText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  techOnsiteConfirmedText: { fontSize: 10.5, color: '#059669', marginBottom: 8 },
  techEmptyBox: { alignItems: 'center', gap: 6, paddingVertical: 24, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', borderRadius: 12, backgroundColor: '#fff' },
  techEmptyText: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  techTeamBlock: { marginTop: 8 },
  techTeamName: { fontSize: 11.5, fontWeight: '800', color: '#334155', marginBottom: 6 },
  techCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#4f46e5', padding: 12, marginTop: 8 },
  techCardTag: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  techCardTagText: { fontSize: 10.5, fontWeight: '700', color: '#4338ca' },
  techCardPlainText: { fontSize: 12.5, fontWeight: '700', color: '#1e293b' },
  techCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  techCardShop: { fontSize: 13, fontWeight: '800', color: '#1e293b' },
  noteEmptyBox: { alignItems: 'center', gap: 6, paddingVertical: 18, marginTop: 10, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', borderRadius: 10 },
  noteEmptyText: { fontSize: 12, color: '#94a3b8' },
  noteItemBox: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginTop: 8 },
  noteItemText: { fontSize: 12.5, color: '#1e293b', lineHeight: 18 },
  noteItemFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  noteItemMeta: { fontSize: 10.5, color: '#94a3b8' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  detailLabel: { fontSize: 12.5, color: '#64748b', flexShrink: 0, maxWidth: '42%' },
  detailValue: { fontSize: 12.5, color: '#0f172a', fontWeight: '600', textAlign: 'right' },
  detailSubValue: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  editHistoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  editHistoryBtnText: { fontSize: 10.5, fontWeight: '800', color: '#4f46e5' },
  editHistoryOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  editHistorySheet: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16 },
  editHistoryHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 10, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  editHistoryTitle: { flex: 1, fontSize: 14, fontWeight: '900', color: '#0f172a' },
  editHistoryEmpty: { color: '#94a3b8', fontSize: 12.5, textAlign: 'center', paddingVertical: 24 },
  editHistoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  editHistorySeq: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  editHistorySeqText: { fontSize: 11, fontWeight: '900', color: '#4f46e5' },
  editHistoryEditor: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#0f172a' },
  editHistoryAt: { fontSize: 11.5, color: '#64748b', fontWeight: '600' },
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