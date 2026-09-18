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
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, RefreshControl, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../_layout';
// ✅ Config
import { API_BASE, API_MODULES } from '../../constants/config';
import { apiMobileGet, apiMobilePost } from '../service/api_mobile';
// ปรับ path นี้ให้ตรงกับตำแหน่งไฟล์จริงในโปรเจกต์ ถ้าไม่ได้วางไว้โฟลเดอร์เดียวกัน
import AccountingDashboard from './accounting_dashboard';
import CheckIncompleteProjectsScreen from './Checkincompleteproject';
import CreateProjectScreen from './createproject';
import DriverTasksScreen from './DriverTasks';
import EstimateDashboardScreen from './Estimatedashboard';
import GuaranteeTrackingScreen from './Guaranteetracking';

// project_API_mobile.php — README_project.md
const PROJECT_API_URL = `${API_MODULES}/project_API_mobile.php`;
// ajax_get_item_status.php — endpoint เดี่ยวเดิม ไม่ได้อยู่ใน mobile_api/modules (ดูหมายเหตุหัวไฟล์)
const ITEM_STATUS_URL = `${API_BASE}/ajax_get_item_status.php`;

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
interface DashboardKpi {
  totalProjects: number;
  totalBudget: number;
  signedProjects: number;
  forceClosedProjects: number;
  waitingProjects: number;
  notClosedProjects: number;
}

const EMPTY_KPI: DashboardKpi = {
  totalProjects: 0,
  totalBudget: 0,
  signedProjects: 0,
  forceClosedProjects: 0,
  waitingProjects: 0,
  notClosedProjects: 0,
};

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
  companyName: string;
  customerName: string;
  projectName: string;
  budget: number;
  paymentState: PaymentState;
  contractEndDateShow: string; // end_date_show ('-' ถ้าไม่มี)
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
    companyName: String(raw.company_name ?? ''),
    customerName: String(raw.customer_name ?? ''),
    projectName: String(raw.project_name ?? ''),
    budget: Number(raw.project_budget ?? 0),
    paymentState: (raw.payment_state ?? 'unpaid') as PaymentState,
    contractEndDateShow: String(raw.end_date_show ?? '-'),
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

// รหัสงานที่แสดง = ส่วนหลัง '-' ของ project_code เหมือน PHP: explode('-', code)[1] ?? code
function displayCode(code: string): string {
  const parts = code.split('-');
  return parts[1] ?? code;
}

// จานสีตาม badge_class ที่ server คำนวณมาให้แล้ว (project_dashboard_helpers.php) — แอปแค่เลือกสี
// ไม่ได้ตัดสินเองว่าสถานะไหนควรเป็นสีอะไรจาก final_status ตรงๆ (นั่นคือ business logic ฝั่ง PHP)
const BADGE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  'badge-warning': { bg: '#fff7ed', fg: '#c2410c', border: '#fdba74' },
  'badge-success': { bg: '#ecfdf5', fg: '#059669', border: '#6ee7b7' },
  'badge-purchasing': { bg: '#eef2ff', fg: '#4338ca', border: '#a5b4fc' },
  'badge-po': { bg: '#ecfeff', fg: '#0e7490', border: '#67e8f9' },
  'badge-purchase-complete': { bg: '#fffbeb', fg: '#92400e', border: '#fcd34d' },
  'badge-completed': { bg: '#eff6ff', fg: '#1d4ed8', border: '#93c5fd' },
  'badge-paid-full-status': { bg: '#f5f3ff', fg: '#7e22ce', border: '#c4b5fd' },
  'badge-danger': { bg: '#fef2f2', fg: '#ef4444', border: '#fca5a5' },
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

  // ไม่มี navigation library ต่อจากภายนอก (onNavigate) -> สลับหน้าเองภายในไฟล์นี้
  // ตอนนี้มีแค่ 'estimate' (ทุนตั้งต้น) ที่สร้างสกรีนจริงแล้ว ปุ่มอื่นยังเป็น Alert stub
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'estimate' | 'driverTasks' | 'guarantee' | 'accounting' | 'incomplete' | 'createProject'>('dashboard');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [kpi, setKpi] = useState<DashboardKpi>(EMPTY_KPI);
  const [debtOwnerOptions, setDebtOwnerOptions] = useState<string[]>(DEBT_OWNER_FALLBACK);

  const userId = user?.id;

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
      const k = res.kpi_all ?? {};
      setKpi({
        totalProjects: Number(k.total_projects ?? 0),
        totalBudget: Number(k.total_budget ?? 0),
        signedProjects: Number(k.signed_projects ?? 0),
        forceClosedProjects: Number(k.force_closed_projects ?? 0),
        waitingProjects: Number(k.waiting_projects ?? 0),
        notClosedProjects: Number(k.not_closed_projects ?? 0),
      });
    } catch (e) {
      console.error('project_API_mobile get_dashboard failed', e);
    }
  }, [userId, selectedYear]);

  // get_master_data — ตอนนี้ใช้แค่ debt_present[] มาแทนรายชื่อผู้ติดตามหนี้ที่เคย hardcode ไว้
  const loadMasterData = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiMobileGet(PROJECT_API_URL, 'get_master_data', { user_id: userId, year: selectedYear });
      if (Array.isArray(res.debt_present) && res.debt_present.length > 0) {
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
  const [itemStatusModal, setItemStatusModal] = useState<{ visible: boolean; project?: Project; items: ProjectItem[]; loading: boolean }>({
    visible: false,
    items: [],
    loading: false,
  });

  // เปิด modal สถานะอุปกรณ์ + ยิง ajax_get_item_status.php แยกต่างหาก (ไม่ใช่ embed มากับรายการหลัก
  // และไม่มี action เทียบเท่าใน project_API_mobile.php — ดูหมายเหตุหัวไฟล์)
  async function openItemStatus(project: Project) {
    setItemStatusModal({ visible: true, project, items: [], loading: true });
    try {
      const res = await axios.get(ITEM_STATUS_URL, { params: { project_id: project.id } });
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : raw?.data ?? [];
      setItemStatusModal((s) => (s.project?.id === project.id ? { ...s, items: list.map(mapProjectItem), loading: false } : s));
    } catch (e) {
      console.error('load ajax_get_item_status failed', e);
      setItemStatusModal((s) => (s.project?.id === project.id ? { ...s, loading: false } : s));
    }
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
      return true;
    } catch (e: any) {
      console.error(`project_API_mobile action=${action} failed`, e);
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
      // toggleTechOnsite() ปรับ UI ล่วงหน้าแบบ optimistic ก่อนเรียกฟังก์ชันนี้ — ถ้าล้มเหลว ต้อง
      // resync จาก server กลับมาด้วย ไม่งั้น Switch จะค้างค่าที่ผิดจนกว่าจะ pull-to-refresh เอง
      void loadProjects({ silent: true });
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

  function openDebtModal(project: Project) {
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

  function toggleTechOnsite(project: Project, value: boolean) {
    // ติ๊กปุ๊บขยับ Switch ทันที (แค่ภาพ ไม่ใช่การคำนวณ) แล้วค่อย resync ชื่อผู้ยืนยัน/เวลาจาก server จริง
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, techOnsite: value } : p)));
    void saveProjectAction(project, 'save_tech_onsite', { onsite: value ? '1' : '0' });
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
    targetFilter: string
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
          <TouchableOpacity
            style={styles.yearChip}
            activeOpacity={0.7}
            onPress={() => setSelectedYear((y) => y - 1)}
            onLongPress={() => setSelectedYear(new Date().getFullYear())}
          >
            <Text style={styles.yearChipText}>ปี พ.ศ. {selectedYear + 543}</Text>
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
          {renderKpiCard('โครงการทั้งหมด', `${kpi.totalProjects} งาน`, 'folder-open', '#3b82f6', 'all')}
          {renderKpiCard('ยังไม่ปิดจบ', `${kpi.notClosedProjects} งาน`, 'alert-circle', '#f43f5e', 'not_closed')}
          {renderKpiCard('ปิดจบหน้างาน', `${kpi.forceClosedProjects} งาน`, 'flag', '#059669', 'ปิดจบหน้างาน')}
          {renderKpiCard('รอเซ็นสัญญา', `${kpi.waitingProjects} งาน`, 'time', '#d97706', 'รอเซ็นสัญญา')}
          {renderKpiCard('เซ็นสัญญา', `${kpi.signedProjects} งาน`, 'document-text', '#2563eb', 'เซ็นสัญญา')}
          <View key="budget" style={[styles.kpiCard, { borderColor: '#c4b5fd', backgroundColor: '#f5f3ff' }]}>
            <View style={styles.kpiTopRow}>
              <Ionicons name="cash" size={14} color="#7c3aed" />
              <Text style={[styles.kpiLabel, { color: '#7c3aed' }]} numberOfLines={1}>
                งบประมาณรวม
              </Text>
            </View>
            <Text style={styles.kpiValue}>{formatBaht(kpi.totalBudget)}</Text>
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
    const sm = statusMeta(p);
    const cc = contractCountdown(p);
    const asm = assemblyMeta(p);
    const pay = paymentMeta(p.paymentState);
    const isClosed = p.isFinished;
    const isCancelled = p.isCanceled;

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
            onPress={() => openItemStatus(p)}
            activeOpacity={0.7}
          >
            <Ionicons name={sm.icon} size={12} color={sm.fg} />
            <Text style={[styles.statusBadgeText, { color: sm.fg }]}>{p.statusShow}</Text>
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
            <MaterialCommunityIcons name="briefcase-outline" size={13} color="#64748b" />
            <Text style={styles.cardMetaLabel}>{p.jobType || '-'}</Text>
          </View>
        </View>
        {pay && (
          <View style={[styles.paymentBadge, { backgroundColor: pay.bg }]}>
            <Text style={[styles.paymentBadgeText, { color: pay.fg }]}>{pay.text}</Text>
          </View>
        )}

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

  if (loading && projects.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.emptyBox}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.emptyText}>กำลังโหลดข้อมูล...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={filteredProjects}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderProjectCard}
        ListHeaderComponent={renderHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} tintColor="#3b82f6" />}
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
        </View>
      </Modal>

      {/* Modal: เลือกผู้รับผิดชอบติดตามหนี้ */}
      <Modal visible={debtModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ModalHeader
              icon="person-outline"
              title="เลือกผู้รับผิดชอบติดตามหนี้"
              colors={['#1e3a8a', '#3b82f6']}
              onClose={() => setDebtModal({ visible: false })}
            />
            <View style={styles.modalBody}>
              <Text style={styles.modalSubtitle}>{debtModal.project?.projectName}</Text>
              {debtOwnerOptions.map((name) => (
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
              <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
              {itemStatusModal.loading ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#3b82f6" />
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