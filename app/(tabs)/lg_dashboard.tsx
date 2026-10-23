/**
 * lg_dashboard.tsx — Dashboard ขออนุมัติหนังสือค้ำ (ดูข้อมูลอย่างเดียว)
 *  ใช้ร่วมกับ lg_import_dashboard.tsx (ชุดนำเข้า) ผ่าน <LgDashboardView variant="import" /> — สูตร/หน้าตาเดียวกัน
 *  ต่างแค่แหล่งข้อมูล (data_source) ฟิลด์ที่มาจาก Excel และตัวกรองชีท
 * ------------------------------------------------------------------
 * พอร์ตจากหน้าเว็บ lg_dashboard.php (เมนู: ขออนุมัติหนังสือค้ำ › Dashboard ขออนุมัติหนังสือค้ำ)
 *  - แอปใช้ดูอย่างเดียว ไม่มีปุ่มตรวจ/อนุมัติ/ยกเลิก/แนบไฟล์ (ทำบนเว็บ)
 *  - ข้อมูลจาก lg_API_mobile.php?action=get_dashboard — สเปกอยู่ที่ docs/LG_Dashboard_API_Spec.md
 *    (ไฟล์ API: tjc-api/mobile_api/modules/lg_API_mobile.php — ถ้าเรียกไม่ได้หน้าจะขึ้นข้อความแจ้ง ไม่ crash)
 *  - KPI ทุกตัวคำนวณในแอปจากรายการ ด้วยสูตรเดียวกับ applyFilters() ของเว็บ: นับเฉพาะแถวที่ไม่ยกเลิก
 *    และผ่านตัวกรอง (ตัวเลขจึงเปลี่ยนตามตัวกรองเหมือนเว็บ)
 *  - เห็นเมนูได้เฉพาะคนที่มีสิทธิ์ lg_dashboard.php (getDrawerOptions ใน _layout) และ API เช็คซ้ำ
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatShortThaiDate, formatShortThaiDateTime } from '../../components/DateTimeField';
import ListPager, { pageCount } from '../../components/ListPager';
import { API_BASE, API_MODULES } from '../../constants/config';
import { apiMobileGet } from '../../service/api_mobile';
import { useAuth } from '../_layout';

const LG_API_URL = `${API_MODULES}/lg_API_mobile.php`;
const PAGE_SIZE = 30;

// กติกาสีทั้งแอป: ปุ่มหลัก = PRIMARY, เขียว = เสร็จ, ส้ม = รอ, แดง = เกิน/มีปัญหา, เทา = ข้อมูลทั่วไป
const PRIMARY = '#4f46e5';
const GREEN = '#059669';
const AMBER = '#d97706';
const RED = '#dc2626';
const GRAY = '#64748b';

// -------------------- Types --------------------

interface LgFile {
  topic: string;
  filePath: string;
  originalName: string;
  uploadDate: string;
  uploaderName: string;
}

interface LgRow {
  id: number;
  projectCode: string;
  condition: string;
  contractNo: string;
  projectName: string;
  companyName: string;
  companyShort: string;
  customerName: string;
  agencyAddress: string;
  bankName: string;
  value: number;
  startDate: string;
  endDate: string;
  alertDays: number;
  status: string;
  hasChecker: boolean;
  checkerName: string;
  checkedAt: string;
  hasApprover: boolean;
  approverName: string;
  approvedAt: string;
  recorder: string;
  lastEditor: string;
  reqNickname: string;
  reqDepartment: string;
  canceledBy: string;
  canceledAt: string;
  files: LgFile[];
  // เฉพาะชุดนำเข้า (lg_import_dashboard.php)
  lgNumber: string;
  docNo: string;
  contractType: string;
  importSheet: string;
  sourceRow: string;
  batchFile: string;
  importedAt: string;
  importedBy: string;
}

const str = (v: any) => (v === null || v === undefined ? '' : String(v));
const ymd = (v: any) => {
  const s = str(v);
  return s.startsWith('0000') ? '' : s;
};

function mapRow(r: any): LgRow {
  const files = Array.isArray(r.attached_files) ? r.attached_files : [];
  return {
    id: Number(r.id ?? 0),
    projectCode: str(r.project_code),
    condition: str(r.lg_condition) || 'หนังสือค้ำฯ',
    contractNo: str(r.contract_no),
    projectName: str(r.project_name),
    companyName: str(r.company_name),
    companyShort: str(r.company_shortname),
    customerName: str(r.customer_name),
    agencyAddress: str(r.agency_address),
    bankName: str(r.bank_name),
    value: Number(r.lg_value ?? 0) || 0,
    startDate: ymd(r.lg_start_date),
    endDate: ymd(r.lg_end_date),
    alertDays: Number(r.alert_days ?? 30) || 30,
    status: str(r.lg_status),
    hasChecker: !!Number(r.has_checker ?? 0) || !!str(r.checker_name) || str(r.lg_status) === 'อนุมัติแล้ว',
    checkerName: str(r.checker_name),
    checkedAt: ymd(r.checked_at),
    hasApprover: !!Number(r.has_approver ?? 0) || !!str(r.approver_name) || str(r.lg_status) === 'อนุมัติแล้ว',
    approverName: str(r.approver_name),
    approvedAt: ymd(r.approved_at),
    recorder: str(r.recorder),
    lastEditor: str(r.last_editor),
    reqNickname: str(r.req_nickname),
    reqDepartment: str(r.req_department),
    canceledBy: str(r.canceled_by),
    canceledAt: ymd(r.canceled_at),
    lgNumber: str(r.lg_number),
    docNo: str(r.doc_no),
    contractType: str(r.contract_type),
    importSheet: str(r.import_sheet),
    sourceRow: str(r.source_row),
    batchFile: str(r.batch_file),
    importedAt: ymd(r.imported_at),
    importedBy: str(r.imported_by),
    files: files.map((f: any) => ({
      topic: str(f.topic) || 'เอกสารแนบ',
      filePath: str(f.file_path),
      originalName: str(f.original_name),
      uploadDate: ymd(f.upload_date),
      uploaderName: str(f.uploader_name),
    })),
  };
}

// -------------------- กติกาเดียวกับเว็บ --------------------

const isCanceled = (r: LgRow) => r.status === 'ยกเลิก';
const companyLabel = (r: LgRow) => r.companyShort.trim() || r.companyName.trim() || 'ไม่ระบุ';

// รูปแบบการค้ำ 3 แบบ (เว็บนับจากข้อความในคอลัมน์: มี "จนกว่าจะหมด" / มี "เงินสด" / อื่นๆ)
type CondKind = 'normal' | 'unlimited' | 'cash';
function condKind(r: LgRow): CondKind {
  if (r.condition.includes('จนกว่าจะหมด')) return 'unlimited';
  if (r.condition.includes('เงินสด')) return 'cash';
  return 'normal';
}
const COND_META: Record<CondKind, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  normal: { label: 'หนังสือค้ำฯ', icon: 'document-text' },
  unlimited: { label: 'จนกว่าจะหมดภาระผูกพัน', icon: 'link' },
  cash: { label: 'ค้ำเงินสด', icon: 'cash' },
};

// นับถอยหลังถึงวันสิ้นสุด (เทียบวันนี้ตอนเที่ยงคืน) — เกณฑ์ alert_days ของแถว (ค่าเริ่มต้น 30)
type Countdown = { kind: 'none' | 'ok' | 'expiring' | 'today' | 'expired'; days: number };
function countdown(r: LgRow): Countdown {
  const m = r.endDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { kind: 'none', days: 0 };
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((end.getTime() - today.getTime()) / 86400000);
  if (days > r.alertDays) return { kind: 'ok', days };
  if (days > 0) return { kind: 'expiring', days };
  if (days === 0) return { kind: 'today', days };
  return { kind: 'expired', days };
}
// เว็บนับ "ใกล้หมดอายุ" จากป้ายสีส้ม (bg-warning) หรือแดง (วันนี้!) — เหมือนกันที่นี่
const isExpiring = (c: Countdown) => c.kind === 'expiring' || c.kind === 'today';

function countdownBadge(c: Countdown): { text: string; fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap } | null {
  switch (c.kind) {
    case 'ok':
      return { text: `${c.days} วัน`, fg: GREEN, bg: '#ecfdf5', icon: 'time-outline' };
    case 'expiring':
      return { text: `${c.days} วัน`, fg: AMBER, bg: '#fffbeb', icon: 'warning-outline' };
    case 'today':
      return { text: 'วันนี้!', fg: '#ffffff', bg: RED, icon: 'notifications' };
    case 'expired':
      return { text: 'หมดประกัน', fg: '#ffffff', bg: '#94a3b8', icon: 'close-circle' };
    default:
      return null;
  }
}

// ตัวกรองสถานะ — ค่าเดียวกับปุ่มกรองบนเว็บ (currentStatusFilter)
type StatusFilter = 'all' | 'รอผู้จัดการ' | 'รอผู้ดูแล' | 'ผู้จัดการอนุมัติ' | 'ผู้ดูแลอนุมัติ' | 'ใกล้หมดอายุ' | 'หมดประกัน' | 'ยกเลิก';
function matchStatus(r: LgRow, f: StatusFilter): boolean {
  if (f === 'ยกเลิก') return isCanceled(r);
  if (isCanceled(r)) return false;
  switch (f) {
    case 'รอผู้จัดการ':
      return !r.hasChecker;
    case 'รอผู้ดูแล':
      return !r.hasApprover;
    case 'ผู้จัดการอนุมัติ':
      return r.hasChecker;
    case 'ผู้ดูแลอนุมัติ':
      return r.hasApprover;
    case 'ใกล้หมดอายุ':
      return isExpiring(countdown(r));
    case 'หมดประกัน':
      return countdown(r).kind === 'expired';
    default:
      return true;
  }
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const yearOf = (d: string) => (/^\d{4}/.test(d) ? d.slice(0, 4) : '');

// -------------------- Screen --------------------

// manual = lg_dashboard.php (บันทึกในระบบ) / import = lg_import_dashboard.php (ชุดนำเข้าจาก Excel)
export type LgVariant = 'manual' | 'import';
const VARIANT: Record<LgVariant, { action: string; specDoc: string }> = {
  manual: { action: 'get_dashboard', specDoc: 'docs/LG_Dashboard_API_Spec.md' },
  import: { action: 'get_import_dashboard', specDoc: 'docs/LG_Dashboard_API_Spec.md (ส่วนชุดนำเข้า)' },
};

export default function LgDashboardScreen() {
  return <LgDashboardView variant="manual" />;
}

export function LgDashboardView({ variant }: { variant: LgVariant }) {
  const isImport = variant === 'import';
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<LgRow[]>([]);
  const [canViewNames, setCanViewNames] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [condFilter, setCondFilter] = useState<'all' | CondKind>('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [bankFilter, setBankFilter] = useState('all');
  const [startYear, setStartYear] = useState('all');
  const [endYear, setEndYear] = useState('all');
  const [checkerFilter, setCheckerFilter] = useState('all');
  const [approverFilter, setApproverFilter] = useState('all');
  const [sheetFilter, setSheetFilter] = useState('all'); // ชุดนำเข้า: ชีทใน Excel (import_sheet)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<LgRow | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (!user?.id) return;
      refresh ? setRefreshing(true) : setLoading(true);
      setLoadError(null);
      try {
        const res = await apiMobileGet(LG_API_URL, VARIANT[variant].action, { user_id: user.id });
        setRows(Array.isArray(res.list) ? res.list.map(mapRow) : []);
        setCanViewNames(!!Number(res.can_view_approver_name ?? 0));
      } catch (e: any) {
        // 404 = ยังไม่มีไฟล์ lg_API_mobile.php บนเซิร์ฟเวอร์ (ดู docs/LG_Dashboard_API_Spec.md)
        const notReady = e?.response?.status === 404;
        setLoadError(notReady ? 'ยังเชื่อมต่อข้อมูลไม่ได้ — เซิร์ฟเวอร์ยังไม่มี API ของหน้านี้' : e?.message || 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        refresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [user?.id, variant]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // ออกจากหน้า (สลับเมนูใน drawer) -> ปิดหน้ารายละเอียด/แผ่นตัวกรองที่ค้างไว้
  useFocusEffect(
    useCallback(() => {
      return () => {
        setDetail(null);
        setFilterSheetOpen(false);
      };
    }, [])
  );

  // ตัวเลือกตัวกรอง — เอาจากข้อมูลจริง (ไม่มีตัวเลือกที่กดแล้วว่างเปล่า เหมือนเว็บ)
  const options = useMemo(() => {
    const count = (vals: string[]) => {
      const m = new Map<string, number>();
      vals.filter(Boolean).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
      return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'th'));
    };
    return {
      companies: count(rows.map(companyLabel)),
      banks: count(rows.map((r) => r.bankName.trim())),
      startYears: Array.from(new Set(rows.map((r) => yearOf(r.startDate)).filter(Boolean))).sort(),
      endYears: Array.from(new Set(rows.map((r) => yearOf(r.endDate)).filter(Boolean))).sort(),
      checkers: count(rows.map((r) => r.checkerName.trim())),
      approvers: count(rows.map((r) => r.approverName.trim())),
      // เว็บนับจำนวนต่อชีทเฉพาะแถวที่ไม่ยกเลิก ชีทว่าง = "ไม่ระบุ"
      sheets: count(rows.filter((r) => !isCanceled(r)).map((r) => r.importSheet.trim() || 'ไม่ระบุ')),
    };
  }, [rows]);

  // ผ่านตัวกรองทุกตัว "ยกเว้น" สถานะ — ใช้คำนวณ KPI (เว็บนับ KPI ก่อนกรองสถานะ)
  const baseRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = [
          r.projectCode, r.condition, r.contractNo, r.projectName, companyLabel(r), r.companyName, r.customerName,
          r.agencyAddress, r.bankName, r.reqNickname, r.reqDepartment, r.recorder, r.lastEditor,
          r.lgNumber, r.docNo, r.contractType, r.importSheet,
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (condFilter !== 'all' && condKind(r) !== condFilter) return false;
      if (companyFilter !== 'all' && companyLabel(r) !== companyFilter) return false;
      if (bankFilter !== 'all' && r.bankName.trim() !== bankFilter) return false;
      if (startYear !== 'all' && yearOf(r.startDate) !== startYear) return false;
      if (endYear !== 'all' && yearOf(r.endDate) !== endYear) return false;
      if (checkerFilter !== 'all' && r.checkerName.trim() !== checkerFilter) return false;
      if (approverFilter !== 'all' && r.approverName.trim() !== approverFilter) return false;
      if (sheetFilter !== 'all' && (r.importSheet.trim() || 'ไม่ระบุ') !== sheetFilter) return false;
      return true;
    });
  }, [rows, search, condFilter, companyFilter, bankFilter, startYear, endYear, checkerFilter, approverFilter, sheetFilter]);

  const kpi = useMemo(() => {
    const k = {
      amount: 0, count: 0, normal: 0, unlimited: 0, cash: 0,
      pendingMgr: 0, pendingAdmin: 0, approvedMgr: 0, approvedAdmin: 0, expiring: 0, expired: 0,
    };
    baseRows.forEach((r) => {
      if (isCanceled(r)) return;
      k.count++;
      k.amount += r.value;
      k[condKind(r)]++;
      if (r.hasChecker) k.approvedMgr++;
      else k.pendingMgr++;
      if (r.hasApprover) k.approvedAdmin++;
      else k.pendingAdmin++;
      const c = countdown(r);
      if (isExpiring(c)) k.expiring++;
      if (c.kind === 'expired') k.expired++;
    });
    return k;
  }, [baseRows]);

  const filtered = useMemo(() => baseRows.filter((r) => matchStatus(r, statusFilter)), [baseRows, statusFilter]);

  // เปลี่ยนตัวกรอง -> กลับไปหน้า 1
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, condFilter, companyFilter, bankFilter, startYear, endYear, checkerFilter, approverFilter, sheetFilter]);
  const totalPages = pageCount(filtered.length, PAGE_SIZE);
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // chip ตัวกรองที่ใช้อยู่ — กด ✕ ลบทีละตัว
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (statusFilter !== 'all') chips.push({ key: 'status', label: statusFilter, clear: () => setStatusFilter('all') });
  if (condFilter !== 'all') chips.push({ key: 'cond', label: COND_META[condFilter].label, clear: () => setCondFilter('all') });
  if (companyFilter !== 'all') chips.push({ key: 'company', label: companyFilter, clear: () => setCompanyFilter('all') });
  if (bankFilter !== 'all') chips.push({ key: 'bank', label: bankFilter, clear: () => setBankFilter('all') });
  if (startYear !== 'all') chips.push({ key: 'sy', label: `เริ่มปี ${startYear}`, clear: () => setStartYear('all') });
  if (endYear !== 'all') chips.push({ key: 'ey', label: `สิ้นสุดปี ${endYear}`, clear: () => setEndYear('all') });
  if (checkerFilter !== 'all') chips.push({ key: 'ck', label: `ผจก. ${checkerFilter}`, clear: () => setCheckerFilter('all') });
  if (approverFilter !== 'all') chips.push({ key: 'ap', label: `ผู้ดูแล ${approverFilter}`, clear: () => setApproverFilter('all') });
  if (sheetFilter !== 'all') chips.push({ key: 'sheet', label: `ชีท ${sheetFilter}`, clear: () => setSheetFilter('all') });

  function resetFilters() {
    setStatusFilter('all');
    setCondFilter('all');
    setCompanyFilter('all');
    setBankFilter('all');
    setStartYear('all');
    setEndYear('all');
    setCheckerFilter('all');
    setApproverFilter('all');
    setSheetFilter('all');
    setSearch('');
  }

  // -------------------- render: ส่วนหัว --------------------

  function renderSummary() {
    // กล่องสถานะ — แตะเพื่อกรอง แตะซ้ำเพื่อล้าง (ไอคอนกรวย = กดกรองได้)
    const statusBox = (f: StatusFilter, label: string, value: number, color: string, icon: keyof typeof Ionicons.glyphMap) => {
      const active = statusFilter === f;
      return (
        <TouchableOpacity
          key={f}
          style={[styles.kpiBox, { borderTopColor: color }, active && { borderColor: color, backgroundColor: color + '0d' }]}
          onPress={() => setStatusFilter(active ? 'all' : f)}
        >
          <Ionicons name={active ? 'funnel' : 'funnel-outline'} size={10} color={active ? color : '#94a3b8'} style={styles.tapHintIcon} />
          <View style={styles.kpiLabelRow}>
            <Ionicons name={icon} size={12} color={color} />
            <Text style={[styles.kpiLabel, { color }]} numberOfLines={2}>{label}</Text>
          </View>
          <Text style={styles.kpiValue}>{value.toLocaleString('en-US')}</Text>
        </TouchableOpacity>
      );
    };

    return (
      <View style={styles.summaryCard}>
        <View style={styles.summaryTopBar} />
        <View style={styles.summaryTotalRow}>
          <View style={styles.summaryIcon}>
            <Ionicons name="shield-checkmark" size={20} color={PRIMARY} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>มูลค่าค้ำประกันรวม</Text>
            <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
              {money(kpi.amount)} <Text style={styles.summaryUnit}>บาท</Text>
            </Text>
            <Text style={styles.summarySub}>{kpi.count.toLocaleString('en-US')} รายการ (ไม่รวมที่ยกเลิก)</Text>
          </View>
        </View>

        {/* รูปแบบการค้ำ — ข้อมูลทั่วไป (เทา) แตะเพื่อกรองรูปแบบ */}
        <View style={styles.condRow}>
          {(['normal', 'unlimited'] as CondKind[]).map((k) => {
            const active = condFilter === k;
            return (
              <TouchableOpacity key={k} style={[styles.condBox, active && styles.condBoxActive]} onPress={() => setCondFilter(active ? 'all' : k)}>
                <Ionicons name={COND_META[k].icon} size={13} color={active ? PRIMARY : GRAY} />
                <Text style={styles.condLabel} numberOfLines={1}>{COND_META[k].label}</Text>
                <Text style={styles.condValue}>{kpi[k].toLocaleString('en-US')}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.kpiHint}>
          <Ionicons name="funnel-outline" size={10} color="#94a3b8" /> แตะกล่องเพื่อกรองรายการ
        </Text>
        <Text style={styles.kpiGroupTitle}>ขั้นที่ 1 · ผู้จัดการ</Text>
        <View style={styles.kpiRow}>
          {statusBox('รอผู้จัดการ', 'รออนุมัติ', kpi.pendingMgr, AMBER, 'hourglass-outline')}
          {statusBox('ผู้จัดการอนุมัติ', 'อนุมัติแล้ว', kpi.approvedMgr, GREEN, 'checkmark-circle')}
        </View>
        <Text style={styles.kpiGroupTitle}>ขั้นที่ 2 · ผู้ดูแลหนังสือค้ำ</Text>
        <View style={styles.kpiRow}>
          {statusBox('รอผู้ดูแล', 'รออนุมัติ', kpi.pendingAdmin, AMBER, 'hourglass-outline')}
          {statusBox('ผู้ดูแลอนุมัติ', 'อนุมัติแล้ว', kpi.approvedAdmin, GREEN, 'checkmark-done-circle')}
        </View>
        <Text style={styles.kpiGroupTitle}>อายุหนังสือค้ำ</Text>
        <View style={styles.kpiRow}>
          {statusBox('ใกล้หมดอายุ', 'ใกล้หมดอายุ', kpi.expiring, RED, 'notifications')}
          {statusBox('หมดประกัน', 'หมดประกันแล้ว', kpi.expired, GRAY, 'close-circle')}
        </View>
      </View>
    );
  }

  // -------------------- render: การ์ดรายการ --------------------

  function ApprovalStep({ label, done, name, at }: { label: string; done: boolean; name: string; at: string }) {
    return (
      <View style={[styles.stepBox, done ? styles.stepDone : styles.stepWait]}>
        <Text style={styles.stepLabel}>{label}</Text>
        <View style={styles.stepRow}>
          <Ionicons name={done ? 'checkmark-circle' : 'hourglass-outline'} size={13} color={done ? GREEN : AMBER} />
          <Text style={[styles.stepStatus, { color: done ? GREEN : AMBER }]} numberOfLines={1}>
            {!done ? 'รออนุมัติ' : canViewNames && name ? name : 'อนุมัติแล้ว'}
          </Text>
        </View>
        {done && !!at && <Text style={styles.stepAt}>{formatShortThaiDateTime(at)}</Text>}
      </View>
    );
  }

  function renderCard(r: LgRow) {
    const canceled = isCanceled(r);
    const cd = countdown(r);
    const badge = canceled ? null : countdownBadge(cd);
    const kind = condKind(r);
    return (
      <TouchableOpacity key={r.id} activeOpacity={0.75} onPress={() => setDetail(r)} style={[styles.card, canceled && styles.cardCanceled]}>
        {canceled && (
          <View style={styles.cancelRibbon}>
            <Ionicons name="ban" size={11} color="#fff" />
            <Text style={styles.cancelRibbonText} numberOfLines={1}>
              ยกเลิกแล้ว{r.canceledBy ? ` โดย ${r.canceledBy}` : ''}
            </Text>
          </View>
        )}
        <View style={styles.cardTopRow}>
          <View style={styles.codeBadge}>
            <Text style={styles.codeBadgeText}>{isImport ? r.lgNumber || r.projectCode || '-' : r.projectCode || '-'}</Text>
          </View>
          <View style={styles.condChip}>
            <Ionicons name={COND_META[kind].icon} size={11} color={GRAY} />
            <Text style={styles.condChipText} numberOfLines={1}>{r.condition}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {badge && (
            <View style={[styles.cdBadge, { backgroundColor: badge.bg }]}>
              <Ionicons name={badge.icon} size={11} color={badge.fg} />
              <Text style={[styles.cdBadgeText, { color: badge.fg }]}>{badge.text}</Text>
            </View>
          )}
        </View>

        <Text style={[styles.cardTitle, canceled && styles.strike]} numberOfLines={2}>{r.customerName || 'ไม่ระบุหน่วยงาน'}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>
          {companyLabel(r)} · สัญญา {r.contractNo || '-'} · {r.bankName || '-'}
        </Text>
        {isImport && (
          <Text style={styles.cardSub} numberOfLines={1}>
            {r.projectCode ? `หน้างาน ${r.projectCode} · ` : ''}
            {r.docNo ? `หนังสือออก ${r.docNo} · ` : ''}
            {r.contractType || 'ไม่ระบุประเภทสัญญา'}
          </Text>
        )}

        <View style={styles.cardMoneyRow}>
          <Text style={[styles.cardValue, canceled && styles.strike]}>฿{money(r.value)}</Text>
          <Text style={styles.cardDates} numberOfLines={1}>
            {formatShortThaiDate(r.startDate || null)} → {formatShortThaiDate(r.endDate || null)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
        </View>

        {!canceled && (
          <View style={styles.stepRowWrap}>
            <ApprovalStep label="ผู้จัดการ" done={r.hasChecker} name={r.checkerName} at={r.checkedAt} />
            <ApprovalStep label="ผู้ดูแลหนังสือค้ำ" done={r.hasApprover} name={r.approverName} at={r.approvedAt} />
          </View>
        )}

        {(r.files.length > 0 || isImport) && (
          <View style={styles.fileHint}>
            {r.files.length > 0 && (
              <>
                <Ionicons name="attach" size={13} color={GRAY} />
                <Text style={styles.fileHintText}>{r.files.length} ไฟล์แนบ</Text>
              </>
            )}
            {isImport && (
              <>
                <Ionicons name="layers-outline" size={13} color={GRAY} style={{ marginLeft: r.files.length > 0 ? 8 : 0 }} />
                <Text style={styles.fileHintText} numberOfLines={1}>{r.importSheet ? `ชีท ${r.importSheet}` : 'นำเข้า'}</Text>
              </>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // -------------------- render: หน้ารายละเอียด --------------------

  function InfoRow({ label, value, color }: { label: string; value?: string; color?: string }) {
    return (
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, color ? { color, fontWeight: '900' } : null]}>{value?.trim() ? value : '-'}</Text>
      </View>
    );
  }
  function Section({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: ReactNode }) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIcon}>
            <Ionicons name={icon} size={14} color={PRIMARY} />
          </View>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {children}
      </View>
    );
  }

  function renderDetail() {
    const r = detail;
    const close = () => setDetail(null);
    const cd = r ? countdown(r) : null;
    const badge = r && cd && !isCanceled(r) ? countdownBadge(cd) : null;
    return (
      <Modal visible={!!r} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
        {/* Modal เป็นหน้าต่างแยก — เว้นขอบ notch/แถบล่างเองด้วย insets ไม่งั้นปุ่มกลับบน iPhone กดไม่ได้ */}
        <View style={[styles.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <StatusBar barStyle="dark-content" />
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={close} style={styles.backBtn} hitSlop={8} accessibilityLabel="กลับ">
              <Ionicons name="chevron-back" size={22} color="#0f172a" />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>
              หนังสือค้ำ {(isImport ? r?.lgNumber || r?.projectCode : r?.projectCode) || ''}
            </Text>
          </View>
          {r && (
            <ScrollView contentContainerStyle={styles.detailScroll}>
              {isCanceled(r) && (
                <View style={styles.cancelBox}>
                  <Ionicons name="ban" size={14} color={RED} />
                  <Text style={styles.cancelBoxText}>
                    ยกเลิกแล้ว{r.canceledBy ? ` โดย ${r.canceledBy}` : ''}
                    {r.canceledAt ? ` · ${formatShortThaiDateTime(r.canceledAt)}` : ''}
                  </Text>
                </View>
              )}

              <Section icon="document-text" title="ข้อมูลหนังสือค้ำ">
                {isImport && <InfoRow label="เลขที่ LG" value={r.lgNumber} />}
                {isImport && <InfoRow label="เลขหนังสือออก" value={r.docNo} />}
                <InfoRow label="เลขหน้างาน" value={r.projectCode} />
                <InfoRow label="รูปแบบการค้ำ" value={r.condition} />
                <InfoRow label="เลขที่สัญญา" value={r.contractNo} />
                {isImport && <InfoRow label="ประเภทสัญญา" value={r.contractType} />}
                <InfoRow label="โครงการ" value={r.projectName} />
                <InfoRow label="บริษัท" value={r.companyName || companyLabel(r)} />
                <InfoRow label="ธนาคาร" value={r.bankName} />
                <InfoRow label="มูลค่าค้ำประกัน" value={`฿${money(r.value)}`} color={GREEN} />
              </Section>

              <Section icon="calendar" title="ระยะเวลา">
                <InfoRow label="วันเริ่มต้น" value={formatShortThaiDate(r.startDate || null)} />
                <InfoRow label="วันสิ้นสุด" value={formatShortThaiDate(r.endDate || null)} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>นับถอยหลัง</Text>
                  {badge ? (
                    <View style={[styles.cdBadge, { backgroundColor: badge.bg }]}>
                      <Ionicons name={badge.icon} size={11} color={badge.fg} />
                      <Text style={[styles.cdBadgeText, { color: badge.fg }]}>{badge.text}</Text>
                    </View>
                  ) : (
                    <Text style={styles.infoValue}>-</Text>
                  )}
                </View>
                <InfoRow label="แจ้งเตือนล่วงหน้า" value={`${r.alertDays} วัน`} />
              </Section>

              <Section icon="business" title="หน่วยงาน / ผู้ขอ">
                <InfoRow label="หน่วยงาน" value={r.customerName} />
                <InfoRow label="ที่อยู่หน่วยงาน" value={r.agencyAddress} />
                <InfoRow label="ผู้ขอ" value={r.reqNickname} />
                <InfoRow label="แผนก" value={r.reqDepartment} />
              </Section>

              <Section icon="checkmark-done" title="การอนุมัติ">
                <View style={styles.stepRowWrap}>
                  <ApprovalStep label="ขั้นที่ 1 · ผู้จัดการ" done={r.hasChecker} name={r.checkerName} at={r.checkedAt} />
                  <ApprovalStep label="ขั้นที่ 2 · ผู้ดูแลหนังสือค้ำ" done={r.hasApprover} name={r.approverName} at={r.approvedAt} />
                </View>
                <InfoRow label="ผู้ลงข้อมูล" value={r.recorder} />
                <InfoRow label="ผู้แก้ไขล่าสุด" value={r.lastEditor} />
              </Section>

              {isImport && (
                <Section icon="layers" title="ที่มา (นำเข้าจาก Excel)">
                  <InfoRow label="ชีท" value={r.importSheet} />
                  <InfoRow label="แถวในไฟล์" value={r.sourceRow} />
                  <InfoRow label="ไฟล์ที่นำเข้า" value={r.batchFile} />
                  <InfoRow label="นำเข้าเมื่อ" value={r.importedAt ? formatShortThaiDateTime(r.importedAt) : ''} />
                  <InfoRow label="นำเข้าโดย" value={r.importedBy} />
                </Section>
              )}

              <Section icon="attach" title={`เอกสารแนบ (${r.files.length})`}>
                {r.files.length === 0 ? (
                  <Text style={styles.emptyText}>ไม่มีเอกสารแนบ</Text>
                ) : (
                  r.files.map((f, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.fileRow}
                      onPress={() => f.filePath && Linking.openURL(`${API_BASE}/${f.filePath.replace(/^\/+/, '')}`)}
                    >
                      <Ionicons name="document-attach" size={18} color={PRIMARY} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fileTopic} numberOfLines={1}>{f.topic}</Text>
                        <Text style={styles.fileName} numberOfLines={1}>{f.originalName || f.filePath}</Text>
                        <Text style={styles.fileMeta} numberOfLines={1}>
                          {f.uploaderName || '-'}
                          {f.uploadDate ? ` · ${formatShortThaiDateTime(f.uploadDate)}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="open-outline" size={16} color="#94a3b8" />
                    </TouchableOpacity>
                  ))
                )}
              </Section>
            </ScrollView>
          )}
        </View>
      </Modal>
    );
  }

  // -------------------- render: แผ่นตัวกรอง --------------------

  function renderFilterSheet() {
    const opt = (label: string, active: boolean, onPress: () => void, count?: number) => (
      <TouchableOpacity key={label} activeOpacity={0.75} onPress={onPress} style={[styles.sheetOpt, active && styles.sheetOptActive]}>
        {active && <Ionicons name="checkmark-circle" size={14} color="#fff" />}
        <Text style={[styles.sheetOptText, active && { color: '#fff' }]} numberOfLines={2}>
          {label}
          {count !== undefined ? ` (${count})` : ''}
        </Text>
      </TouchableOpacity>
    );
    const group = (icon: keyof typeof Ionicons.glyphMap, title: string, children: ReactNode) => (
      <View style={styles.sheetGroup}>
        <View style={styles.sheetGroupHead}>
          <View style={styles.sheetGroupIcon}>
            <Ionicons name={icon} size={13} color={GRAY} />
          </View>
          <Text style={styles.sheetGroupTitle}>{title}</Text>
        </View>
        <View style={styles.sheetOptGrid}>{children}</View>
      </View>
    );
    const STATUS: StatusFilter[] = ['all', 'รอผู้จัดการ', 'รอผู้ดูแล', 'ผู้จัดการอนุมัติ', 'ผู้ดูแลอนุมัติ', 'ใกล้หมดอายุ', 'หมดประกัน', 'ยกเลิก'];
    return (
      <Modal visible={filterSheetOpen} transparent animationType="slide" onRequestClose={() => setFilterSheetOpen(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setFilterSheetOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeadRow}>
              <Text style={styles.sheetTitle}>ตัวกรอง</Text>
              <TouchableOpacity onPress={() => setFilterSheetOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={GRAY} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
              {isImport && options.sheets.length > 0 &&
                group('layers', 'ชีทที่นำเข้า', [
                  opt('ทุกชีท', sheetFilter === 'all', () => setSheetFilter('all')),
                  ...options.sheets.map(([name, n]) => opt(name, sheetFilter === name, () => setSheetFilter(name), n)),
                ])}
              {group('flag', 'สถานะ', STATUS.map((s) => opt(s === 'all' ? 'ทั้งหมด' : s, statusFilter === s, () => setStatusFilter(s))))}
              {group('document-text', 'รูปแบบการค้ำ', [
                opt('ทั้งหมด', condFilter === 'all', () => setCondFilter('all')),
                ...(['normal', 'unlimited'] as CondKind[]).map((k) => opt(COND_META[k].label, condFilter === k, () => setCondFilter(k))),
              ])}
              {options.companies.length > 0 &&
                group('business', 'บริษัท', [
                  opt('ทุกบริษัท', companyFilter === 'all', () => setCompanyFilter('all')),
                  ...options.companies.map(([name, n]) => opt(name, companyFilter === name, () => setCompanyFilter(name), n)),
                ])}
              {options.banks.length > 0 &&
                group('card', 'ธนาคาร', [
                  opt('ทุกธนาคาร', bankFilter === 'all', () => setBankFilter('all')),
                  ...options.banks.map(([name, n]) => opt(name, bankFilter === name, () => setBankFilter(name), n)),
                ])}
              {options.startYears.length > 0 &&
                group('calendar', 'ปีที่เริ่มค้ำ (ค.ศ.)', [
                  opt('ทุกปี', startYear === 'all', () => setStartYear('all')),
                  ...options.startYears.map((y) => opt(y, startYear === y, () => setStartYear(y))),
                ])}
              {options.endYears.length > 0 &&
                group('calendar-clear', 'ปีที่สิ้นสุด (ค.ศ.)', [
                  opt('ทุกปี', endYear === 'all', () => setEndYear('all')),
                  ...options.endYears.map((y) => opt(y, endYear === y, () => setEndYear(y))),
                ])}
              {/* กรองชื่อผู้อนุมัติ — เฉพาะคนที่มีสิทธิ์เห็นชื่อ (lg_view_approver_name) เหมือนเว็บ */}
              {canViewNames && options.checkers.length > 0 &&
                group('person', 'ผู้จัดการที่อนุมัติ', [
                  opt('ทุกคน', checkerFilter === 'all', () => setCheckerFilter('all')),
                  ...options.checkers.map(([name, n]) => opt(name, checkerFilter === name, () => setCheckerFilter(name), n)),
                ])}
              {canViewNames && options.approvers.length > 0 &&
                group('person-circle', 'ผู้ดูแลหนังสือค้ำที่อนุมัติ', [
                  opt('ทุกคน', approverFilter === 'all', () => setApproverFilter('all')),
                  ...options.approvers.map(([name, n]) => opt(name, approverFilter === name, () => setApproverFilter(name), n)),
                ])}
            </ScrollView>
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.sheetResetBtn} onPress={resetFilters}>
                <Text style={styles.sheetResetText}>ค่าเริ่มต้น</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetApplyBtn} onPress={() => setFilterSheetOpen(false)}>
                <Text style={styles.sheetApplyText}>ดูผลลัพธ์ ({filtered.length})</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // -------------------- main --------------------

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {/* แถบค้นหา + ตัวกรอง — ไม่มีปุ่มเพิ่ม เพราะแอปดูข้อมูลอย่างเดียว */}
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <View style={styles.topBarSearch}>
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={isImport ? 'ค้นหาเลขที่ LG/สัญญา/หน่วยงาน...' : 'ค้นหาเลขหน้างาน/สัญญา/หน่วยงาน...'}
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#cbd5e1" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.topBarBtn, chips.length > 0 && styles.topBarBtnActive]}
            onPress={() => setFilterSheetOpen(true)}
            accessibilityLabel="ตัวกรอง"
          >
            <Ionicons name="options-outline" size={19} color={chips.length > 0 ? '#fff' : '#475569'} />
            {chips.length > 0 && (
              <View style={styles.topBarBadge}>
                <Text style={styles.topBarBadgeText}>{chips.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        {chips.length > 0 && (
          <View style={styles.chipRow}>
            {chips.map((c) => (
              <TouchableOpacity key={c.key} style={styles.chip} onPress={c.clear}>
                <Text style={styles.chipText} numberOfLines={1}>{c.label}</Text>
                <Ionicons name="close" size={12} color="#475569" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={36} color="#cbd5e1" />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
            <Ionicons name="refresh" size={14} color="#fff" />
            <Text style={styles.retryText}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={PRIMARY} />}
        >
          {renderSummary()}
          <Text style={styles.resultText}>
            พบ {filtered.length.toLocaleString('en-US')} รายการ
            {statusFilter === 'all' ? ' (รวมที่ยกเลิก)' : ''}
          </Text>
          {pageRows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="file-tray-outline" size={28} color="#cbd5e1" />
              <Text style={styles.emptyText}>ไม่พบรายการตามตัวกรอง</Text>
            </View>
          ) : (
            pageRows.map(renderCard)
          )}
          <ListPager page={safePage} pageSize={PAGE_SIZE} total={filtered.length} unit="รายการ" onChange={setPage} />
        </ScrollView>
      )}

      {renderFilterSheet()}
      {renderDetail()}
    </SafeAreaView>
  );
}

// -------------------- Styles --------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  errorText: { color: '#475569', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  topBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarSearch: { flex: 1, height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10 },
  searchInput: { flex: 1, color: '#0f172a', fontSize: 13, padding: 0 },
  topBarBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  topBarBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  topBarBadge: { position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', borderWidth: 1.5, borderColor: PRIMARY, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  topBarBadgeText: { fontSize: 10.5, fontWeight: '900', color: PRIMARY },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef2ff', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: '#3730a3', fontSize: 11, fontWeight: '700', flexShrink: 1 },

  summaryCard: { marginHorizontal: 14, marginTop: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden', paddingHorizontal: 12, paddingBottom: 12 },
  summaryTopBar: { height: 4, marginHorizontal: -12, backgroundColor: PRIMARY },
  summaryTotalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14 },
  summaryIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { color: GRAY, fontSize: 12, fontWeight: '700' },
  summaryValue: { color: '#0f172a', fontSize: 22, fontWeight: '900', marginTop: 2 },
  summaryUnit: { fontSize: 13, fontWeight: '700', color: '#475569' },
  summarySub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  condRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  condBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  condBoxActive: { borderColor: PRIMARY, backgroundColor: '#eef2ff' },
  condLabel: { flex: 1, fontSize: 11, color: '#334155', fontWeight: '700' },
  condValue: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  kpiHint: { fontSize: 10.5, color: '#94a3b8', marginTop: 12 },
  kpiGroupTitle: { fontSize: 12, fontWeight: '900', color: '#334155', marginTop: 10, marginBottom: 6 },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiBox: { flex: 1, minHeight: 64, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', borderTopWidth: 4, paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  tapHintIcon: { position: 'absolute', top: 6, right: 7 },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
  kpiLabel: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  kpiValue: { color: '#0f172a', fontSize: 20, fontWeight: '900', marginTop: 'auto' },

  resultText: { marginHorizontal: 16, marginTop: 14, marginBottom: 2, fontSize: 12, color: GRAY, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 12.5, textAlign: 'center' },

  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 14, marginTop: 10, padding: 13, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  cardCanceled: { opacity: 0.6, backgroundColor: '#f8fafc' },
  cancelRibbon: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: RED, marginHorizontal: -13, marginTop: -13, marginBottom: 10, paddingHorizontal: 13, paddingVertical: 5 },
  cancelRibbonText: { flex: 1, color: '#fff', fontSize: 11, fontWeight: '800' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codeBadge: { backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  codeBadgeText: { color: '#4338ca', fontSize: 12, fontWeight: '900' },
  condChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 150 },
  condChipText: { fontSize: 10.5, color: '#475569', fontWeight: '700', flexShrink: 1 },
  cdBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  cdBadgeText: { fontSize: 10.5, fontWeight: '900' },
  cardTitle: { color: '#0f172a', fontSize: 14, fontWeight: '800', lineHeight: 20, marginTop: 10 },
  cardSub: { color: GRAY, fontSize: 11.5, marginTop: 3 },
  strike: { textDecorationLine: 'line-through' },
  cardMoneyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  cardValue: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  cardDates: { flex: 1, textAlign: 'right', fontSize: 11, color: GRAY, fontWeight: '600' },
  stepRowWrap: { flexDirection: 'row', gap: 8, marginTop: 10 },
  stepBox: { flex: 1, borderRadius: 10, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7, gap: 2 },
  stepDone: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  stepWait: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  stepLabel: { fontSize: 10, color: GRAY, fontWeight: '700' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepStatus: { flexShrink: 1, fontSize: 12, fontWeight: '800' },
  stepAt: { fontSize: 10, color: GRAY },
  fileHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  fileHintText: { fontSize: 11, color: GRAY, fontWeight: '600' },

  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  detailHeaderTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: '#0f172a' },
  detailScroll: { padding: 14, paddingBottom: 32, gap: 12 },
  cancelBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: 10 },
  cancelBoxText: { flex: 1, color: '#991b1b', fontSize: 12, fontWeight: '700' },
  section: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: '#c7d2fe', paddingHorizontal: 12, paddingBottom: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  infoLabel: { fontSize: 12, color: '#475569', fontWeight: '600', maxWidth: '45%' },
  infoValue: { flex: 1, fontSize: 12.5, color: '#0f172a', fontWeight: '800', textAlign: 'right' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  fileTopic: { fontSize: 12.5, fontWeight: '800', color: '#0f172a' },
  fileName: { fontSize: 11, color: '#475569' },
  fileMeta: { fontSize: 10.5, color: '#94a3b8' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, maxHeight: '85%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', marginTop: 8 },
  sheetHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sheetGroup: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 10 },
  sheetGroupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sheetGroupIcon: { width: 24, height: 24, borderRadius: 7, backgroundColor: '#64748b1a', alignItems: 'center', justifyContent: 'center' },
  sheetGroupTitle: { color: '#0f172a', fontSize: 13, fontWeight: '900' },
  sheetOptGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  sheetOpt: { width: '48.8%', minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  sheetOptActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  sheetOptText: { flexShrink: 1, color: '#334155', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  sheetFooter: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8 },
  sheetResetBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 12 },
  sheetResetText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  sheetApplyBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: PRIMARY, paddingVertical: 12 },
  sheetApplyText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});
