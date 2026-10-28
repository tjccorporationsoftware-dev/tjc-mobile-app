/**
 * nas_accounting_dashboard.tsx — บัญชีลูกหนี้ แนส (ดูข้อมูลอย่างเดียว)
 * ------------------------------------------------------------------
 * พอร์ตจากหน้าเว็บ nas_accounting_dashboard.php (ตาราง nas_projects / nas_payments / nas_followups)
 *  - ข้อมูลจาก tjc-api/mobile_api/modules/nas_API_mobile.php
 *      get_dashboard     = ปีงบ + KPI ภาพรวม/แยก 4 บริษัท + รายการโครงการ (API คำนวณด้วยสูตรเว็บ)
 *      get_payment_items = งวดชำระ + ประวัติการติดตาม (เว็บ: กดแถวเพื่อกาง)
 *  - KPI 7 การ์ด + งานระหว่างทำ (WIP) เหมือนเว็บ: ไม่เปลี่ยนตามตัวกรอง แต่เปลี่ยนตามบริษัทที่เลือก
 *  - ตัวกรองเหมือน applyFilters(): บริษัท × สถานะ (ชำระ/ติดตาม fs:/จ่ายเงิน cs:) × ผู้ติดตาม
 *    × ช่วงวันที่ปิดจบ/ติดตามล่าสุด/กรอกสถานะจ่ายเงินล่าสุด + เรียงตามวันปิดจบ
 *  - แอปดูเป็นหลัก แก้ได้อย่างเดียวคือ "ผู้รับผิดชอบติดตามหนี้" (save_debt_owner — เลือกบุคคลแบบ popup ของเว็บ)
 *    ไม่มีปุ่มนำเข้า/แก้ไข/ลบ/ลงบัญชี/บันทึกติดตาม/Export (ทำบนเว็บ)
 *  - งวดชำระ / ประวัติการติดตาม อยู่ในป๊อปอัพ (กดปุ่มในหน้ารายละเอียด)
 *  - ปีงบในตารางเป็น พ.ศ. — แอปแสดงเป็น ค.ศ. ตามกติกาทั้งแอป
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateField, formatShortThaiDate, formatShortThaiDateTime, ymdToDate } from '../../components/DateTimeField';
import ListPager, { pageCount } from '../../components/ListPager';
import { useScreenInsets } from '../../components/useScreenInsets';
import { API_MODULES } from '../../constants/config';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';
import { useAuth } from '../_layout';

const NAS_API_URL = `${API_MODULES}/nas_API_mobile.php`;
const PAGE_SIZE = 30;

// กติกาสีทั้งแอป: ปุ่มหลัก = PRIMARY, เขียว = เสร็จ/ปกติ, ส้ม = ค้าง/รอ, แดง = เกิน/มีปัญหา, เทา = ข้อมูลทั่วไป
const PRIMARY = '#4f46e5';
const GREEN = '#059669';
const AMBER = '#d97706';
const RED = '#dc2626';
const GRAY = '#64748b';
const TEAL = '#0d9488';

// -------------------- Types --------------------

type PayState = 'unpaid' | 'paid_partial' | 'paid_full';
// ค่าเดียวกับ #stateSelect ของเว็บ: all | unpaid_any | has_income | unpaid | paid_partial | fs:<ชื่อ> | cs:<ชื่อ>
type StateFilter = string;
type SortMode = 'default' | 'closed_desc' | 'closed_asc';

interface Kpi {
  totalBudget: number;
  totalReceived: number;
  totalNet: number;
  totalOutstanding: number;
  debtorCount: number;
  projectsWithIncome: number;
  paidFullProjects: number;
  projectCount: number;
  wipProjects: number;
  wipBudget: number;
}
interface CompanyKpi extends Kpi { code: string; name: string }

interface NasProject {
  id: number;
  siteNo: string;
  companyCode: string;
  companyName: string;
  contractNo: string;
  unitName: string;
  affiliation: string;
  address: string;
  contact: string;
  projectName: string;
  workType: string;
  salesOwner: string;
  warranty: string;
  submitDate: string;
  contractStart: string;
  contractEnd: string;
  guaranteeNo: string;
  guaranteeIssue: string;
  guaranteeEnd: string;
  rawNote: string;
  budget: number;
  gross: number;
  net: number;
  outstanding: number;
  payState: PayState;
  paymentCount: number;
  followStatus: string;
  followClosed: boolean;
  followAt: string;
  payStatus: string;
  payAt: string;
  remark: string;
  debtType: string;
  debtName: string;
  closedBy: string;
  closedAt: string;
  createdBy: string;
  editCount: number;
  lastEditor: string;
  lastEditedAt: string;
}

interface NasPayment {
  name: string;
  amount: number;
  net: number | null;
  fee: number | null;
  fine: number | null;
  wht: number | null;
  receiptNo: string;
  receiptDate: string;
  receivedDate: string;
  callStatus: string;
  remark: string;
  createdBy: string;
  createdAt: string;
}
interface NasFollow { name: string; callStatus: string; bank: string; remark: string; createdBy: string; createdAt: string }

const str = (v: any) => (v === null || v === undefined ? '' : String(v));
const num = (v: any) => Number(v ?? 0) || 0;
const numOrNull = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));

function mapKpi(k: any): Kpi {
  return {
    totalBudget: num(k?.total_budget),
    totalReceived: num(k?.total_received),
    totalNet: num(k?.total_net),
    totalOutstanding: num(k?.total_outstanding),
    debtorCount: num(k?.debtor_count),
    projectsWithIncome: num(k?.projects_with_income),
    paidFullProjects: num(k?.paid_full_projects),
    projectCount: num(k?.project_count),
    wipProjects: num(k?.wip_projects),
    wipBudget: num(k?.wip_budget),
  };
}

function mapProject(r: any): NasProject {
  const st = str(r.payment_state);
  return {
    id: num(r.id),
    siteNo: str(r.site_no),
    companyCode: str(r.company_code) || 'OTHER',
    companyName: str(r.company_name),
    contractNo: str(r.contract_no),
    unitName: str(r.unit_name),
    affiliation: str(r.affiliation),
    address: str(r.address),
    contact: str(r.contact),
    projectName: str(r.project_name),
    workType: str(r.work_type),
    salesOwner: str(r.sales_owner),
    warranty: str(r.warranty),
    submitDate: str(r.submit_date),
    contractStart: str(r.contract_start),
    contractEnd: str(r.contract_end),
    guaranteeNo: str(r.guarantee_no),
    guaranteeIssue: str(r.guarantee_issue),
    guaranteeEnd: str(r.guarantee_end),
    rawNote: str(r.raw_note),
    budget: num(r.budget),
    gross: num(r.gross),
    net: num(r.net),
    outstanding: num(r.outstanding),
    payState: st === 'paid_full' || st === 'paid_partial' ? st : 'unpaid',
    paymentCount: num(r.payment_count),
    followStatus: str(r.follow_status),
    followClosed: !!r.follow_closed,
    followAt: str(r.follow_at),
    payStatus: str(r.pay_status),
    payAt: str(r.pay_at),
    remark: str(r.remark),
    debtType: str(r.debt_type),
    debtName: str(r.debt_name),
    closedBy: str(r.closed_by),
    closedAt: str(r.closed_at),
    createdBy: str(r.created_by),
    editCount: num(r.edit_count),
    lastEditor: str(r.last_editor),
    lastEditedAt: str(r.last_edited_at),
  };
}

// -------------------- กติกาเดียวกับเว็บ --------------------

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ceYear = (be: number) => (be > 2400 ? be - 543 : be);

// สีป้ายจากคำในชื่อสถานะ — กติกาเดียวกับ nas_status_badge() ของเว็บ
function statusColor(s: string): { color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (/สำเร็จ|ได้รับ|จ่าย|ปิดยอด|โอน/.test(s)) return { color: GREEN, icon: 'checkmark-circle' };
  if (/รอ|กำลัง|ยัง|นัด/.test(s)) return { color: AMBER, icon: 'time' };
  if (/ยกเลิก|ปัญหา|ระงับ/.test(s)) return { color: RED, icon: 'warning' };
  return { color: PRIMARY, icon: 'information-circle' };
}

// ป้ายสถานะจ่ายเงิน: มีสถานะกลุ่มบัญชีใช้สถานะนั้น ไม่มีตกไปใช้ป้ายตามยอดเงิน
function payBadge(p: NasProject): { text: string; color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (p.payStatus) return { text: p.payStatus, ...statusColor(p.payStatus) };
  if (p.payState === 'paid_full') return { text: 'ชำระเรียบร้อย', color: GREEN, icon: 'checkmark-done-circle' };
  if (p.payState === 'paid_partial') return { text: 'จ่ายบางส่วน', color: AMBER, icon: 'hourglass' };
  return { text: 'ยังไม่มีเงินเข้า', color: RED, icon: 'close-circle' };
}

function followBadge(p: NasProject): { text: string; color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (p.followClosed) return { text: 'ปิดติดตามแล้ว', color: GRAY, icon: 'checkmark-circle' };
  if (!p.followStatus) return { text: 'ยังไม่เคยติดตาม', color: '#94a3b8', icon: 'remove' };
  return { text: p.followStatus, ...statusColor(p.followStatus) };
}

// stateMatch() + fs:/cs: ของ applyFilters() เว็บ
function stateMatch(p: NasProject, f: StateFilter): boolean {
  if (f === 'all') return true;
  if (f.startsWith('fs:')) {
    const want = f.slice(3);
    return want === '__closed__' ? p.followClosed : !p.followClosed && p.followStatus.trim() === want;
  }
  if (f.startsWith('cs:')) return p.payStatus.trim() === f.slice(3);
  if (f === 'unpaid_any') return p.payState !== 'paid_full';
  if (f === 'has_income' || f === 'paid_full') return p.payState === 'paid_full';
  return p.payState === f;
}

function stateLabel(f: StateFilter): string {
  if (f.startsWith('fs:')) {
    const v = f.slice(3);
    return v === '__closed__' ? 'ปิดติดตามแล้ว' : v ? `ติดตาม: ${v}` : 'ยังไม่เคยติดตาม';
  }
  if (f.startsWith('cs:')) return f.slice(3) ? `จ่ายเงิน: ${f.slice(3)}` : 'ยังไม่มีสถานะจ่ายเงิน';
  return (
    { all: 'ทั้งหมด', unpaid_any: 'รอชำระ', has_income: 'เงินเข้าครบแล้ว', paid_full: 'เงินเข้าครบแล้ว', unpaid: 'ยังไม่มีเงินเข้าเลย', paid_partial: 'จ่ายบางส่วน' } as Record<string, string>
  )[f] ?? f;
}

function inRange(dt: string, start: string, end: string): boolean {
  if (!start && !end) return true;
  const d = dt.slice(0, 10);
  if (!d) return false;
  return (!start || d >= start) && (!end || d <= end);
}

// -------------------- Screen --------------------

export default function NasAccountingDashboardScreen() {
  const { user } = useAuth();
  // ขอบจอจริง (หน้าใน Drawer ได้ insets.top = 0 จาก header) — ใช้วางป๊อปอัพไม่ให้ชนแถบสถานะ/แถบนำทาง
  const insets = useScreenInsets();

  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState(0); // ปีงบ พ.ศ. (0 = ให้ API เลือกปีล่าสุด)
  const [projects, setProjects] = useState<NasProject[]>([]);
  const [kpiAll, setKpiAll] = useState<Kpi>(mapKpi({}));
  const [kpiByComp, setKpiByComp] = useState<CompanyKpi[]>([]);
  const [followOptions, setFollowOptions] = useState<string[]>([]);
  const [payOptions, setPayOptions] = useState<string[]>([]);
  const [debtPresent, setDebtPresent] = useState<string[]>([]);
  const [debtUsers, setDebtUsers] = useState<string[]>([]); // รายชื่อให้เลือกเป็นผู้ติดตามหนี้ (แหล่งเดียวกับเว็บ)
  const [debtPicker, setDebtPicker] = useState<{ project: NasProject | null; search: string; saving: boolean }>({ project: null, search: '', saving: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [compFilter, setCompFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [debtFilter, setDebtFilter] = useState('');
  const [closedStart, setClosedStart] = useState('');
  const [closedEnd, setClosedEnd] = useState('');
  const [followStart, setFollowStart] = useState('');
  const [followEnd, setFollowEnd] = useState('');
  const [payStart, setPayStart] = useState('');
  const [payEnd, setPayEnd] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState<NasProject | null>(null);
  const [payments, setPayments] = useState<NasPayment[]>([]);
  const [follows, setFollows] = useState<NasFollow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  // ป๊อปอัพในหน้ารายละเอียด: งวดชำระ / ประวัติการติดตาม (แยกออกมาให้หน้ารายละเอียดสั้น ไม่ต้องเลื่อนหา)
  const [listPopup, setListPopup] = useState<'payments' | 'follows' | null>(null);
  // โครงการที่เปิดป๊อปอัพงวดชำระ/ประวัติติดตามอยู่ (เปิดได้ทั้งจากการ์ดและหน้ารายละเอียด)
  const [popupProject, setPopupProject] = useState<NasProject | null>(null);

  const load = useCallback(
    async (refresh = false, y = year) => {
      if (!user?.id) return;
      refresh ? setRefreshing(true) : setLoading(true);
      setLoadError(null);
      try {
        const res = await apiMobileGet(NAS_API_URL, 'get_dashboard', { user_id: user.id, ...(y ? { year: y } : {}) });
        setYears(Array.isArray(res.years) ? res.years.map(num) : []);
        setYear(num(res.year));
        setProjects(Array.isArray(res.list) ? res.list.map(mapProject) : []);
        setKpiAll(mapKpi(res.kpi_all));
        setKpiByComp((Array.isArray(res.kpi_by_company) ? res.kpi_by_company : []).map((c: any) => ({ ...mapKpi(c), code: str(c.code), name: str(c.name) })));
        setFollowOptions(Array.isArray(res.follow_status_options) ? res.follow_status_options.map(str) : []);
        setPayOptions(Array.isArray(res.pay_status_options) ? res.pay_status_options.map(str) : []);
        setDebtPresent(Array.isArray(res.debt_present) ? res.debt_present.map(str) : []);
        setDebtUsers(Array.isArray(res.debt_users) ? res.debt_users.map(str) : []);
      } catch (e: any) {
        const notReady = e?.response?.status === 404;
        setLoadError(notReady ? 'ยังเชื่อมต่อข้อมูลไม่ได้ — เซิร์ฟเวอร์ยังไม่มี API ของหน้านี้' : e?.message || 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        refresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [user?.id, year]
  );

  useEffect(() => {
    void load(false, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setDetail(null);
        setFilterSheetOpen(false);
        setListPopup(null);
        setDebtPicker({ project: null, search: '', saving: false });
      };
    }, [])
  );

  function changeYear(y: number) {
    if (y === year) return;
    resetFilters();
    void load(false, y);
  }

  async function openDetail(p: NasProject) {
    setDetail(p);
    setListPopup(null);
    await loadPaymentItems(p);
  }

  // ปุ่มบนการ์ด: เปิดป๊อปอัพงวดชำระ / ประวัติติดตาม โดยไม่ต้องเข้าหน้ารายละเอียด
  function openListFromCard(p: NasProject, kind: 'payments' | 'follows') {
    setListPopup(kind);
    void loadPaymentItems(p);
  }

  async function loadPaymentItems(p: NasProject) {
    setPopupProject(p);
    setPayments([]);
    setFollows([]);
    setItemsError(null);
    if (!user?.id) return;
    setItemsLoading(true);
    try {
      const res = await apiMobileGet(NAS_API_URL, 'get_payment_items', { user_id: user.id, id: p.id });
      setPayments(
        (Array.isArray(res.items) ? res.items : []).map((i: any) => ({
          name: str(i.payment_name),
          amount: num(i.payment_amount),
          net: numOrNull(i.net_amount),
          fee: numOrNull(i.fee_amount),
          fine: numOrNull(i.fine_amount),
          wht: numOrNull(i.wht_percent),
          receiptNo: str(i.receipt_no),
          receiptDate: str(i.receipt_date),
          receivedDate: str(i.payment_received_date),
          callStatus: str(i.call_status),
          remark: str(i.remark),
          createdBy: str(i.created_by),
          createdAt: str(i.created_at),
        }))
      );
      setFollows(
        (Array.isArray(res.follows) ? res.follows : []).map((f: any) => ({
          name: str(f.followup_name),
          callStatus: str(f.call_status),
          bank: str(f.bank_name),
          remark: str(f.remark),
          createdBy: str(f.created_by),
          createdAt: str(f.created_at),
        }))
      );
    } catch (e: any) {
      setItemsError(e?.message || 'โหลดงวดชำระไม่สำเร็จ');
    } finally {
      setItemsLoading(false);
    }
  }

  const kpi: Kpi = compFilter === 'all' ? kpiAll : kpiByComp.find((c) => c.code === compFilter) ?? mapKpi({});
  const compName = compFilter === 'all' ? '' : kpiByComp.find((c) => c.code === compFilter)?.name ?? compFilter;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dq = debtFilter.trim().toLowerCase();
    const rows = projects.filter((p) => {
      if (compFilter !== 'all' && p.companyCode !== compFilter) return false;
      if (!stateMatch(p, stateFilter)) return false;
      if (!inRange(p.closedAt, closedStart, closedEnd)) return false;
      if (!inRange(p.payAt, payStart, payEnd)) return false;
      if (!inRange(p.followAt, followStart, followEnd)) return false;
      if (debtFilter === '__none__') {
        if (p.debtName.trim() !== '') return false;
      } else if (dq && !p.debtName.toLowerCase().includes(dq)) return false;
      if (q) {
        const hay = [p.siteNo, p.companyName, p.unitName, p.affiliation, p.debtName, p.closedBy, p.projectName, p.contractNo, p.followStatus, p.payStatus, p.remark]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sortMode !== 'default') {
      // nasApplySort(): งานที่ยังไม่มีวันปิดจบอยู่ท้ายเสมอ
      const idx = new Map(projects.map((p, i) => [p.id, i]));
      rows.sort((a, b) => {
        const ka = a.closedAt;
        const kb = b.closedAt;
        if (!ka && !kb) return (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0);
        if (!ka) return 1;
        if (!kb) return -1;
        if (ka !== kb) return sortMode === 'closed_asc' ? (ka < kb ? -1 : 1) : ka > kb ? -1 : 1;
        return (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0);
      });
    }
    return rows;
  }, [projects, search, debtFilter, compFilter, stateFilter, closedStart, closedEnd, payStart, payEnd, followStart, followEnd, sortMode]);

  useEffect(() => {
    setPage(1);
  }, [search, debtFilter, compFilter, stateFilter, closedStart, closedEnd, payStart, payEnd, followStart, followEnd, sortMode, year]);
  const totalPages = pageCount(filtered.length, PAGE_SIZE);
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const rangeText = (a: string, b: string) => `${a ? formatShortThaiDate(a) : '-'} ถึง ${b ? formatShortThaiDate(b) : '-'}`;
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (compFilter !== 'all') chips.push({ key: 'comp', label: compName, clear: () => setCompFilter('all') });
  if (stateFilter !== 'all') chips.push({ key: 'st', label: stateLabel(stateFilter), clear: () => setStateFilter('all') });
  if (debtFilter) chips.push({ key: 'debt', label: debtFilter === '__none__' ? 'ยังไม่ระบุผู้ติดตาม' : debtFilter, clear: () => setDebtFilter('') });
  if (closedStart || closedEnd) chips.push({ key: 'cl', label: `ปิดจบ ${rangeText(closedStart, closedEnd)}`, clear: () => (setClosedStart(''), setClosedEnd('')) });
  if (followStart || followEnd) chips.push({ key: 'fu', label: `ติดตาม ${rangeText(followStart, followEnd)}`, clear: () => (setFollowStart(''), setFollowEnd('')) });
  if (payStart || payEnd) chips.push({ key: 'pa', label: `สถานะจ่ายเงิน ${rangeText(payStart, payEnd)}`, clear: () => (setPayStart(''), setPayEnd('')) });

  function resetFilters() {
    setCompFilter('all');
    setStateFilter('all');
    setDebtFilter('');
    setClosedStart('');
    setClosedEnd('');
    setFollowStart('');
    setFollowEnd('');
    setPayStart('');
    setPayEnd('');
    setSortMode('default');
    setSearch('');
  }

  // -------------------- render --------------------

  function renderYearTabs() {
    if (years.length <= 1) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {years.map((y) => {
          const active = y === year;
          return (
            <TouchableOpacity key={y} style={[styles.tab, active && styles.tabActive]} onPress={() => changeYear(y)}>
              <Text style={[styles.tabText, active && { color: '#fff' }]}>ปีงบ {ceYear(y)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }

  function renderCompanyTabs() {
    const tab = (code: string, label: string, n: number) => {
      const active = compFilter === code;
      return (
        <TouchableOpacity key={code} style={[styles.tab, active && styles.tabActive]} onPress={() => setCompFilter(code)}>
          <Text style={[styles.tabText, active && { color: '#fff' }]} numberOfLines={1}>{label}</Text>
          <View style={[styles.tabCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
            <Text style={[styles.tabCountText, active && { color: '#fff' }]}>{n}</Text>
          </View>
        </TouchableOpacity>
      );
    };
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {tab('all', 'ทุกบริษัท', kpiAll.projectCount)}
        {kpiByComp.map((c) => tab(c.code, c.name, c.projectCount))}
      </ScrollView>
    );
  }

  function renderSummary() {
    // 7 การ์ดเหมือน nas_mini_cards() ของเว็บ — กดเพื่อกรองสถานะ (กดซ้ำ = ล้าง)
    const box = (
      key: string,
      state: StateFilter,
      label: string,
      value: string,
      unit: string,
      color: string,
      icon: keyof typeof Ionicons.glyphMap
    ) => {
      const active = state !== 'all' && stateFilter === state;
      return (
        <TouchableOpacity
          key={key}
          style={[styles.kpiBox, { borderLeftColor: color }, active && { borderColor: color, backgroundColor: color + '0d' }]}
          onPress={() => setStateFilter(state === 'all' || stateFilter === state ? 'all' : state)}
        >
          {state !== 'all' && (
            <Ionicons name={active ? 'funnel' : 'funnel-outline'} size={10} color={active ? color : '#94a3b8'} style={styles.tapHintIcon} />
          )}
          <View style={styles.kpiLabelRow}>
            <Ionicons name={icon} size={12} color={color} />
            <Text style={[styles.kpiLabel, { color }]} numberOfLines={2}>{label}</Text>
          </View>
          <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
            {value}
            {!!unit && <Text style={styles.kpiUnit}> {unit}</Text>}
          </Text>
        </TouchableOpacity>
      );
    };
    const pct = kpi.totalBudget > 0 ? Math.min(kpi.totalReceived / kpi.totalBudget, 1) : 0;
    return (
      <View style={styles.summaryCard}>
        <View style={styles.summaryTopBar} />
        <View style={styles.summaryTotalRow}>
          <View style={styles.summaryIcon}>
            <Ionicons name="wallet" size={20} color={PRIMARY} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>{compName || 'ภาพรวมลูกหนี้ แนส ทุกบริษัท'} · ปีงบ {ceYear(year)}</Text>
            <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
              {money(kpi.totalReceived)} <Text style={styles.summaryUnit}>/ {money(kpi.totalBudget)}</Text>
            </Text>
            <Text style={styles.summarySub}>
              เงินเข้า {Math.round(pct * 100)}% ของทุนตั้งต้น · {kpi.projectCount.toLocaleString('en-US')} งาน
            </Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: GREEN }]} />
        </View>
        <Text style={styles.kpiHint}>
          <Ionicons name="funnel-outline" size={10} color="#94a3b8" /> แตะกล่องเพื่อกรองรายการ
        </Text>
        {/* จัดเป็นหมวด: ภาพรวม / ค้างชำระ / เงินเข้าแล้ว (การ์ดชุดเดียวกับเว็บ 7 ใบ) */}
        <Text style={styles.kpiGroupTitle}>ภาพรวม</Text>
        <View style={styles.kpiGrid}>
          {box('budget', 'all', 'ทุนตั้งต้น (งบรวม)', money(kpi.totalBudget), '', PRIMARY, 'cash')}
          {box('paid_full', 'paid_full', 'ชำระเรียบร้อย', kpi.paidFullProjects.toLocaleString('en-US'), 'งาน', '#7c3aed', 'ribbon')}
        </View>
        <Text style={styles.kpiGroupTitle}>ค้างชำระ</Text>
        <View style={styles.kpiGrid}>
          {box('debtor', 'unpaid_any', 'ลูกหนี้ค้างชำระ', kpi.debtorCount.toLocaleString('en-US'), 'เจ้า', AMBER, 'people')}
          {box('outstanding', 'unpaid_any', 'ลูกหนี้คงค้าง', money(kpi.totalOutstanding), '', RED, 'alert-circle')}
        </View>
        <Text style={styles.kpiGroupTitle}>เงินเข้าแล้ว</Text>
        <View style={styles.kpiGrid}>
          {box('income_units', 'has_income', 'หน้างานที่เงินเข้าแล้ว', kpi.projectsWithIncome.toLocaleString('en-US'), 'งาน', '#0891b2', 'document-text')}
          {box('received', 'has_income', 'เงินเข้าทั้งหมด (ยอดจ่าย)', money(kpi.totalReceived), '', GREEN, 'wallet')}
          {box('net', 'has_income', 'ยอดรับสุทธิ', money(kpi.totalNet), '', TEAL, 'cash-outline')}
        </View>
        <Text style={styles.kpiGroupTitle}>งานระหว่างทำ</Text>
        {/* งานระหว่างทำ (WIP) ที่ยังไม่ปิดจบ — ดึงจาก wip_jobs ปีเดียวกัน (เว็บแสดงเป็นกล่องเส้นประ ไม่ได้กดกรอง) */}
        <View style={styles.wipBox}>
          <Ionicons name="construct" size={16} color={AMBER} />
          <View style={{ flex: 1 }}>
            <Text style={styles.wipLabel}>งานระหว่างทำ (WIP) ยังไม่ปิดจบ</Text>
            <Text style={styles.wipValue}>
              {kpi.wipProjects.toLocaleString('en-US')} งาน · <Text style={{ color: AMBER }}>{money(kpi.wipBudget)}</Text>
            </Text>
          </View>
        </View>
      </View>
    );
  }


  // แถว "ผู้รับผิดชอบติดตามหนี้" ในแถบท้ายการ์ด — กดเพื่อเลือก/เปลี่ยน (ป๊อปอัพรายชื่อเดิม)
  function renderOwnerRow(name: string, isTeam: boolean, onPress: () => void) {
    return (
      <TouchableOpacity style={styles.ownerRow} onPress={onPress} accessibilityLabel="เลือกผู้รับผิดชอบติดตามหนี้">
        <View style={styles.ownerIcon}>
          <Ionicons name={isTeam ? 'people' : 'person'} size={14} color={PRIMARY} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.ownerLabel}>ผู้รับผิดชอบติดตามหนี้</Text>
          <Text style={[styles.ownerName, !name && { color: '#94a3b8' }]} numberOfLines={1}>{name || 'ยังไม่ระบุ'}</Text>
        </View>
        <View style={styles.ownerAction}>
          <Text style={styles.ownerActionText}>{name ? 'เปลี่ยน' : 'เลือก'}</Text>
          <Ionicons name="chevron-forward" size={12} color={PRIMARY} />
        </View>
      </TouchableOpacity>
    );
  }

  function renderCard(p: NasProject) {
    const pb = payBadge(p);
    const fb = followBadge(p);
    const pct = p.budget > 0 ? Math.min(p.gross / p.budget, 1) : 0;
    return (
      <TouchableOpacity key={p.id} activeOpacity={0.75} onPress={() => openDetail(p)} style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={styles.codeBadge}>
            <Text style={styles.codeBadgeText}>{p.siteNo || '-'}</Text>
          </View>
          <Text style={styles.cardComp} numberOfLines={1}>{p.companyName}</Text>
          <View style={[styles.stateChip, { backgroundColor: pb.color + '14' }]}>
            <Ionicons name={pb.icon} size={11} color={pb.color} />
            <Text style={[styles.stateChipText, { color: pb.color }]} numberOfLines={1}>{pb.text}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{p.unitName || '-'}</Text>
        {!!p.projectName && <Text style={styles.cardSub} numberOfLines={1}>{p.projectName}</Text>}
        <View style={styles.cardMoneyGrid}>
          <View style={styles.cardMoneyCell}>
            <Text style={styles.cardMoneyLabel}>งบตั้งต้น</Text>
            <Text style={styles.cardMoneyValue} numberOfLines={1} adjustsFontSizeToFit>{money(p.budget)}</Text>
          </View>
          <View style={styles.cardMoneyCell}>
            <Text style={styles.cardMoneyLabel}>ยอดจ่าย</Text>
            <Text style={[styles.cardMoneyValue, { color: p.gross > 0 ? GREEN : '#0f172a' }]} numberOfLines={1} adjustsFontSizeToFit>{money(p.gross)}</Text>
          </View>
          <View style={styles.cardMoneyCell}>
            <Text style={styles.cardMoneyLabel}>ค้างชำระ</Text>
            <Text style={[styles.cardMoneyValue, { color: p.outstanding > 0 ? RED : GREEN }]} numberOfLines={1} adjustsFontSizeToFit>{money(p.outstanding)}</Text>
          </View>
        </View>
        <View style={styles.progressTrackSm}>
          <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: pb.color }]} />
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="headset-outline" size={12} color={fb.color} />
            <Text style={[styles.metaText, { color: fb.color }]} numberOfLines={1}>{fb.text}</Text>
          </View>
          {!!p.closedAt && (
            <View style={styles.metaItem}>
              <Ionicons name="flag-outline" size={12} color={TEAL} />
              <Text style={[styles.metaText, { color: TEAL }]}>ปิดจบ {formatShortThaiDate(p.closedAt.slice(0, 10))}</Text>
            </View>
          )}
        </View>
        {/* แถบปุ่มท้ายการ์ด: ผู้รับผิดชอบ + ปุ่มการกระทำ */}
        <View style={styles.cardFooter}>
          {renderOwnerRow(p.debtName, p.debtType === 'ทีม', () => setDebtPicker({ project: p, search: '', saving: false }))}
        {/* ปุ่มดูงวดชำระ / ประวัติการติดตาม จากการ์ดเลย */}
        <View style={styles.cardBtnRow}>
          <TouchableOpacity style={styles.cardBtn} onPress={() => openListFromCard(p, 'payments')} accessibilityLabel="ดูงวดชำระ">
            <Ionicons name="list" size={14} color={pb.color} />
            <Text style={[styles.cardBtnText, { color: pb.color }]} numberOfLines={1}>งวดชำระ ({p.paymentCount})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardBtn} onPress={() => openListFromCard(p, 'follows')} accessibilityLabel="ดูประวัติการติดตาม">
            <Ionicons name="chatbubbles" size={14} color={fb.color} />
            <Text style={[styles.cardBtnText, { color: fb.color }]} numberOfLines={1}>ประวัติติดตาม</Text>
          </TouchableOpacity>
        </View>
        </View>
      </TouchableOpacity>
    );
  }

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
  const d = (v: string) => (v ? formatShortThaiDate(v) : '');

  function renderDetail() {
    const p = detail;
    const close = () => {
      setListPopup(null);
      setDetail(null);
    };
    const pb = p ? payBadge(p) : null;
    const fb = p ? followBadge(p) : null;
    const lastFollow = follows.length ? follows[follows.length - 1] : null;
    const lastPayment = payments.length ? payments[payments.length - 1] : null;
    const popupBtn = (
      key: 'payments' | 'follows',
      icon: keyof typeof Ionicons.glyphMap,
      title: string,
      count: number,
      sub: string,
      color: string
    ) => (
      <TouchableOpacity key={key} activeOpacity={0.8} style={styles.popupBtn} onPress={() => setListPopup(key)} disabled={itemsLoading}>
        <View style={[styles.popupBtnIcon, { backgroundColor: color + '14' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.popupBtnTitle}>
            {title} <Text style={{ color }}>({itemsLoading ? '…' : count})</Text>
          </Text>
          <Text style={[styles.popupBtnSub, !!itemsError && { color: RED }]} numberOfLines={1}>
            {itemsLoading ? 'กำลังโหลด…' : itemsError || sub}
          </Text>
        </View>
        {itemsLoading ? <ActivityIndicator size="small" color={PRIMARY} /> : <Ionicons name="chevron-forward" size={18} color="#94a3b8" />}
      </TouchableOpacity>
    );
    return (
      <Modal visible={!!p} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
        {/* ป๊อปอัพเลื่อนขึ้นจากด้านล่าง — เว้นด้านบนให้พ้นแถบสถานะ และเว้นท้ายให้พ้นแถบปุ่มนำทางของมือถือ */}
        <View style={styles.detailOverlay}>
          <TouchableOpacity style={{ height: insets.top + 24 }} activeOpacity={1} onPress={close} accessibilityLabel="ปิด" />
          <View style={[styles.detailSheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.detailGrip} />
          <View style={styles.detailHeader}>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>หน้างาน {p?.siteNo || ''}</Text>
            <TouchableOpacity onPress={close} style={styles.closeBtn} hitSlop={8} accessibilityLabel="ปิด">
              <Ionicons name="close" size={20} color="#475569" />
            </TouchableOpacity>
          </View>
          {p && pb && fb && (
            <ScrollView contentContainerStyle={styles.detailScroll}>
              <View style={styles.detailHero}>
                <View style={styles.heroChips}>
                  <View style={[styles.stateChip, { backgroundColor: pb.color + '14' }]}>
                    <Ionicons name={pb.icon} size={12} color={pb.color} />
                    <Text style={[styles.stateChipText, { color: pb.color }]}>{pb.text}</Text>
                  </View>
                  <View style={[styles.stateChip, { backgroundColor: fb.color + '14' }]}>
                    <Ionicons name="headset" size={12} color={fb.color} />
                    <Text style={[styles.stateChipText, { color: fb.color }]}>{fb.text}</Text>
                  </View>
                </View>
                <Text style={styles.detailHeroTitle}>{p.unitName || '-'}</Text>
                <Text style={styles.cardSub}>{p.companyName}{p.affiliation ? ` · ${p.affiliation}` : ''}</Text>
                <View style={styles.cardMoneyGrid}>
                  <View style={styles.cardMoneyCell}>
                    <Text style={styles.cardMoneyLabel}>งบตั้งต้น</Text>
                    <Text style={styles.cardMoneyValue} numberOfLines={1} adjustsFontSizeToFit>{money(p.budget)}</Text>
                  </View>
                  <View style={styles.cardMoneyCell}>
                    <Text style={styles.cardMoneyLabel}>ยอดจ่าย</Text>
                    <Text style={[styles.cardMoneyValue, { color: GREEN }]} numberOfLines={1} adjustsFontSizeToFit>{money(p.gross)}</Text>
                  </View>
                  <View style={styles.cardMoneyCell}>
                    <Text style={styles.cardMoneyLabel}>ค้างชำระ</Text>
                    <Text style={[styles.cardMoneyValue, { color: p.outstanding > 0 ? RED : GREEN }]} numberOfLines={1} adjustsFontSizeToFit>{money(p.outstanding)}</Text>
                  </View>
                </View>
                <Text style={styles.cardSub}>ยอดรับสุทธิ {money(p.net)} · {p.paymentCount} งวด</Text>
                {!!p.remark && <Text style={styles.heroRemark}>{p.remark}</Text>}
              </View>

              {/* ปุ่มเปิดป๊อปอัพ — อยู่ใต้ยอดเงินเลย เห็นทันทีไม่ต้องเลื่อน */}
              <View style={styles.popupBtnRow}>
                {popupBtn(
                  'payments',
                  'list',
                  'งวดชำระ',
                  payments.length,
                  lastPayment
                    ? `ล่าสุด: ${lastPayment.name || '-'}${lastPayment.callStatus ? ` · ${lastPayment.callStatus}` : ''}`
                    : 'ยังไม่มีการลงบัญชีรับชำระ',
                  GREEN
                )}
                {popupBtn(
                  'follows',
                  'chatbubbles',
                  'ประวัติการติดตาม',
                  follows.length,
                  lastFollow
                    ? `ล่าสุด: ${lastFollow.callStatus || lastFollow.name || '-'}${lastFollow.createdAt ? ` · ${formatShortThaiDate(lastFollow.createdAt.slice(0, 10))}` : ''}`
                    : 'ยังไม่เคยติดตาม',
                  AMBER
                )}
              </View>

              <Section icon={p.debtType === 'ทีม' ? 'people' : 'person'} title="ผู้รับผิดชอบติดตามหนี้">
                <View style={styles.debtRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{p.debtType === 'ทีม' ? 'ทีม' : 'บุคคล'}</Text>
                    <Text style={[styles.debtName, !p.debtName && { color: '#94a3b8' }]}>{p.debtName || 'ยังไม่ระบุ'}</Text>
                  </View>
                  <TouchableOpacity style={styles.debtBtn} onPress={() => setDebtPicker({ project: p, search: '', saving: false })}>
                    <Ionicons name={p.debtName ? 'swap-horizontal' : 'person-add'} size={14} color="#fff" />
                    <Text style={styles.debtBtnText}>{p.debtName ? 'เปลี่ยน' : 'เลือก'}</Text>
                  </TouchableOpacity>
                </View>
              </Section>

              <Section icon="briefcase" title="ข้อมูลโครงการ">
                <InfoRow label="หน้างาน" value={p.siteNo} />
                <InfoRow label="บริษัท" value={p.companyName} />
                <InfoRow label="ชื่องบ/โครงการ" value={p.projectName} />
                <InfoRow label="เลขที่สัญญา" value={p.contractNo} />
                <InfoRow label="ประเภทงาน" value={p.workType} />
                <InfoRow label="เซลล์ผู้ดูแล" value={p.salesOwner} />
                {!!p.rawNote && <InfoRow label="ข้อมูลดิบรอตรวจ" value={p.rawNote} color={AMBER} />}
              </Section>
              <Section icon="calendar" title="สัญญา / ค้ำประกัน">
                <InfoRow label="วันยื่นซอง" value={d(p.submitDate)} />
                <InfoRow label="วันที่เริ่มสัญญา" value={d(p.contractStart)} />
                <InfoRow label="วันที่สิ้นสุดสัญญา" value={d(p.contractEnd)} />
                <InfoRow label="รับประกัน" value={p.warranty} />
                <InfoRow label="เลขหนังสือค้ำ" value={p.guaranteeNo} />
                <InfoRow label="วันออกหนังสือค้ำ" value={d(p.guaranteeIssue)} />
                <InfoRow label="วันสิ้นสุดค้ำ" value={d(p.guaranteeEnd)} />
              </Section>
              <Section icon="business" title="หน่วยงาน">
                <InfoRow label="หน่วยงาน" value={p.unitName} />
                <InfoRow label="สังกัด" value={p.affiliation} />
                <InfoRow label="ที่อยู่" value={p.address} />
                <InfoRow label="ผู้ติดต่อ" value={p.contact} />
              </Section>

              <Section icon="person-circle" title="ผู้บันทึก / ปิดจบ">
                <InfoRow label="ผู้ปิดจบหน้างาน" value={p.closedBy} />
                <InfoRow label="วันเวลาปิดจบ" value={p.closedAt ? formatShortThaiDateTime(p.closedAt) : ''} />
                <InfoRow label="สถานะจ่ายเงินล่าสุดเมื่อ" value={p.payAt ? formatShortThaiDateTime(p.payAt) : ''} />
                <InfoRow label="ติดตามล่าสุดเมื่อ" value={p.followAt ? formatShortThaiDateTime(p.followAt) : ''} />
                <InfoRow label="ผู้นำเข้า/สร้าง" value={p.createdBy} />
                <InfoRow
                  label="ผู้แก้ไขล่าสุด"
                  value={p.lastEditor ? `${p.lastEditor} (${p.editCount} ครั้ง)${p.lastEditedAt ? ` · ${formatShortThaiDateTime(p.lastEditedAt)}` : ''}` : ''}
                />
              </Section>
            </ScrollView>
          )}
          {renderListPopup()}
          {renderDebtPicker()}
          </View>
        </View>
      </Modal>
    );
  }

  // ป๊อปอัพงวดชำระ / ประวัติการติดตาม — วางไว้ใน Modal รายละเอียด เพื่อให้ Android ซ้อนหน้าต่างถูกลำดับ
  function renderListPopup() {
    const isPayments = listPopup === 'payments';
    const closePopup = () => setListPopup(null);
    return (
      <Modal visible={!!listPopup} transparent animationType="slide" statusBarTranslucent onRequestClose={closePopup}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closePopup} />
          <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeadRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{isPayments ? `งวดชำระ (${itemsLoading ? '…' : payments.length})` : `ประวัติการติดตาม (${itemsLoading ? '…' : follows.length})`}</Text>
                {!!popupProject && (
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {popupProject.siteNo || '-'} · {popupProject.unitName || '-'}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={closePopup} hitSlop={8} accessibilityLabel="ปิด">
                <Ionicons name="close" size={22} color={GRAY} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              {itemsLoading ? (
                <ActivityIndicator color={PRIMARY} style={{ paddingVertical: 24 }} />
              ) : itemsError ? (
                <Text style={[styles.emptyText, { color: RED }]}>{itemsError}</Text>
              ) : isPayments ? (
                payments.length === 0 ? (
                  <Text style={styles.emptyText}>ยังไม่มีการลงบัญชีรับชำระ</Text>
                ) : (
                  payments.map((it, i) => {
                    const sc = it.callStatus ? statusColor(it.callStatus) : null;
                    return (
                      <View key={i} style={styles.itemCard}>
                        <View style={styles.itemHead}>
                          <View style={styles.itemNo}>
                            <Text style={styles.itemNoText}>{i + 1}</Text>
                          </View>
                          <Text style={styles.itemName} numberOfLines={1}>{it.name || `งวดที่ ${i + 1}`}</Text>
                          {sc && (
                            <View style={[styles.stateChip, { backgroundColor: sc.color + '14' }]}>
                              <Text style={[styles.stateChipText, { color: sc.color }]} numberOfLines={1}>{it.callStatus}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.itemGrid}>
                          <ItemCell label="ยอดจ่าย" value={money(it.amount)} strong />
                          <ItemCell label="ยอดรับสุทธิ" value={it.net === null ? '-' : money(it.net)} />
                          <ItemCell label="ค่าธรรมเนียม" value={it.fee === null ? '-' : money(it.fee)} />
                          <ItemCell label="ค่าปรับ" value={it.fine === null ? '-' : money(it.fine)} />
                          <ItemCell label="หัก ณ ที่จ่าย" value={it.wht === null ? '-' : `${it.wht}%`} />
                          <ItemCell label="เลขที่ใบเสร็จ" value={it.receiptNo || '-'} />
                          <ItemCell label="วันที่ใบเสร็จ" value={d(it.receiptDate) || '-'} />
                          <ItemCell label="วันที่รับเงิน" value={d(it.receivedDate) || '-'} />
                        </View>
                        {!!it.remark && <Text style={styles.itemRemark}>{it.remark}</Text>}
                        <Text style={styles.followAt}>
                          {it.createdBy || '-'}
                          {it.createdAt ? ` · ${formatShortThaiDateTime(it.createdAt)}` : ''}
                        </Text>
                      </View>
                    );
                  })
                )
              ) : follows.length === 0 ? (
                <Text style={styles.emptyText}>ยังไม่เคยติดตาม</Text>
              ) : (
                follows.map((f, i) => {
                  const sc = f.callStatus ? statusColor(f.callStatus) : null;
                  return (
                    <View key={i} style={styles.followRow}>
                      <View style={styles.followDot} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.followHead}>
                          {!!f.name && <Text style={styles.followName}>{f.name}</Text>}
                          {sc && (
                            <View style={[styles.stateChip, { backgroundColor: sc.color + '14' }]}>
                              <Text style={[styles.stateChipText, { color: sc.color }]}>{f.callStatus}</Text>
                            </View>
                          )}
                        </View>
                        {!!f.bank && <Text style={styles.followText}>ธนาคาร: {f.bank}</Text>}
                        {!!f.remark && <Text style={styles.followText}>{f.remark}</Text>}
                        <Text style={styles.followAt}>
                          {f.createdBy || '-'}
                          {f.createdAt ? ` · ${formatShortThaiDateTime(f.createdAt)}` : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // บันทึกผู้รับผิดชอบติดตามหนี้ แล้วอัปเดตรายการ/หน้ารายละเอียดทันที (ไม่ต้องโหลดใหม่ เหมือนเว็บ)
  async function saveDebtOwner(name: string) {
    const project = debtPicker.project;
    if (!project || !user?.id) return;
    setDebtPicker((s) => ({ ...s, saving: true }));
    try {
      const res = await apiMobilePost(NAS_API_URL, 'save_debt_owner', { user_id: user.id, id: project.id, debt_user: name });
      const debtName = str(res.debt_name) || name;
      const debtType = str(res.debt_type) || 'บุคคล';
      const editor = str(res.editor);
      const changed = Array.isArray(res.changed) && res.changed.length > 0;
      const now = new Date();
      const p2 = (n: number) => String(n).padStart(2, '0');
      const nowStr = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
      // API ลงประวัติแก้ไขเฉพาะเมื่อมีช่องเปลี่ยนจริง — นับผู้แก้ไขล่าสุดตามนั้น
      const patch = (x: NasProject): NasProject =>
        changed ? { ...x, debtName, debtType, lastEditor: editor || x.lastEditor, lastEditedAt: nowStr, editCount: x.editCount + 1 } : { ...x, debtName, debtType };
      setProjects((list) => list.map((x) => (x.id === project.id ? patch(x) : x)));
      setDetail((dt) => (dt && dt.id === project.id ? patch(dt) : dt));
      setDebtPresent((list) => (list.includes(debtName) ? list : [...list, debtName].sort((a, b) => a.localeCompare(b, 'th'))));
      setDebtPicker({ project: null, search: '', saving: false });
    } catch (e: any) {
      setDebtPicker((s) => ({ ...s, saving: false }));
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // ป๊อปอัพเลือกผู้รับผิดชอบ — เปิดได้ทั้งจากการ์ดในรายการและจากหน้ารายละเอียด
  function renderDebtPicker() {
    const project = debtPicker.project;
    const q = debtPicker.search.trim().toLowerCase();
    const list = debtUsers.filter((n) => !q || n.toLowerCase().includes(q));
    const close = () => {
      if (!debtPicker.saving) setDebtPicker({ project: null, search: '', saving: false });
    };
    return (
      <Modal visible={!!project} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHead}>
              <Ionicons name="person-circle" size={18} color={PRIMARY} />
              <Text style={styles.pickerTitle}>ผู้รับผิดชอบติดตามหนี้</Text>
              <TouchableOpacity onPress={close} hitSlop={8} accessibilityLabel="ปิด">
                <Ionicons name="close" size={20} color={GRAY} />
              </TouchableOpacity>
            </View>
            {!!project && (
              <Text style={styles.pickerSub} numberOfLines={1}>
                หน้างาน {project.siteNo || '-'} · {project.unitName || '-'}
              </Text>
            )}
            <View style={styles.pickerSearch}>
              <Ionicons name="search" size={14} color="#94a3b8" />
              <TextInput
                value={debtPicker.search}
                onChangeText={(v) => setDebtPicker((s) => ({ ...s, search: v }))}
                placeholder="ค้นหาชื่อพนักงาน..."
                placeholderTextColor="#94a3b8"
                style={styles.pickerSearchInput}
              />
            </View>
            {debtPicker.saving ? (
              <ActivityIndicator color={PRIMARY} style={{ paddingVertical: 24 }} />
            ) : (
              <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                {list.length === 0 ? (
                  <Text style={styles.emptyText}>ไม่พบรายชื่อ</Text>
                ) : (
                  list.map((n) => {
                    const current = project?.debtType !== 'ทีม' && project?.debtName === n;
                    return (
                      <TouchableOpacity key={n} style={[styles.pickerOption, current && styles.pickerOptionActive]} onPress={() => saveDebtOwner(n)}>
                        <Ionicons name="person-outline" size={15} color={current ? PRIMARY : GRAY} />
                        <Text style={[styles.pickerOptionText, current && { color: PRIMARY, fontWeight: '900' }]}>{n}</Text>
                        {current && <Ionicons name="checkmark" size={16} color={PRIMARY} />}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  function renderFilterSheet() {
    const opt = (key: string, label: string, active: boolean, onPress: () => void, count?: number) => (
      <TouchableOpacity key={key} activeOpacity={0.75} onPress={onPress} style={[styles.sheetOpt, active && styles.sheetOptActive]}>
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
    const range = (start: string, setS: (v: string) => void, end: string, setE: (v: string) => void) => (
      <View style={styles.rangeRow}>
        <View style={{ flex: 1 }}>
          <DateField value={start} onChange={setS} placeholder="ตั้งแต่" maximumDate={ymdToDate(end) ?? undefined} />
        </View>
        <Text style={styles.rangeTo}>ถึง</Text>
        <View style={{ flex: 1 }}>
          <DateField value={end} onChange={setE} placeholder="ถึง" minimumDate={ymdToDate(start) ?? undefined} />
        </View>
        {(!!start || !!end) && (
          <TouchableOpacity onPress={() => (setS(''), setE(''))} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#cbd5e1" />
          </TouchableOpacity>
        )}
      </View>
    );
    const cnt = (f: StateFilter) => projects.filter((p) => stateMatch(p, f)).length;
    const so = (s: StateFilter) => opt(s, stateLabel(s), stateFilter === s, () => setStateFilter(s), s === 'all' ? undefined : cnt(s));
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
              {group('wallet', 'สถานะชำระ', ['all', 'unpaid_any', 'has_income', 'unpaid', 'paid_partial'].map(so))}
              {group('headset', 'สถานะติดตาม', [...followOptions.map((n) => so(`fs:${n}`)), so('fs:'), so('fs:__closed__')])}
              {payOptions.length > 0 && group('cash', 'สถานะจ่ายเงิน', [...payOptions.map((n) => so(`cs:${n}`)), so('cs:')])}
              {group('business', 'บริษัท', [
                opt('all', 'ทุกบริษัท', compFilter === 'all', () => setCompFilter('all')),
                ...kpiByComp.map((c) => opt(c.code, c.name, compFilter === c.code, () => setCompFilter(c.code), c.projectCount)),
              ])}
              {group('person', 'ผู้รับผิดชอบติดตามหนี้', [
                opt('', 'ทั้งหมด', debtFilter === '', () => setDebtFilter('')),
                opt('__none__', 'ยังไม่ระบุ', debtFilter === '__none__', () => setDebtFilter('__none__'), projects.filter((p) => !p.debtName).length),
                ...debtPresent.map((n) => opt(n, n, debtFilter === n, () => setDebtFilter(n), projects.filter((p) => p.debtName === n).length)),
              ])}
              {group('swap-vertical', 'เรียงลำดับ', [
                opt('default', 'เลขหน้างาน', sortMode === 'default', () => setSortMode('default')),
                opt('closed_desc', 'ปิดจบล่าสุด → เก่าสุด', sortMode === 'closed_desc', () => setSortMode('closed_desc')),
                opt('closed_asc', 'ปิดจบเก่าสุด → ล่าสุด', sortMode === 'closed_asc', () => setSortMode('closed_asc')),
              ])}
              {group('flag', 'วันที่ปิดจบหน้างาน', range(closedStart, setClosedStart, closedEnd, setClosedEnd))}
              {group('calendar', 'วันที่ติดตามล่าสุด', range(followStart, setFollowStart, followEnd, setFollowEnd))}
              {group('calendar-outline', 'วันที่กรอกสถานะจ่ายเงินล่าสุด', range(payStart, setPayStart, payEnd, setPayEnd))}
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

  const activeCount = chips.length + (sortMode !== 'default' ? 1 : 0);
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <View style={styles.topBarSearch}>
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="ค้นหาหน้างาน/หน่วยงาน/สัญญา..."
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#cbd5e1" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={[styles.topBarBtn, activeCount > 0 && styles.topBarBtnActive]} onPress={() => setFilterSheetOpen(true)} accessibilityLabel="ตัวกรอง">
            <Ionicons name="options-outline" size={19} color={activeCount > 0 ? '#fff' : '#475569'} />
            {activeCount > 0 && (
              <View style={styles.topBarBadge}>
                <Text style={styles.topBarBadgeText}>{activeCount}</Text>
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
          {renderYearTabs()}
          {renderCompanyTabs()}
          {renderSummary()}
          <Text style={styles.resultText}>พบ {filtered.length.toLocaleString('en-US')} งาน</Text>
          {pageRows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="file-tray-outline" size={28} color="#cbd5e1" />
              <Text style={styles.emptyText}>{projects.length === 0 ? `ยังไม่มีข้อมูลปีงบ ${ceYear(year)}` : 'ไม่พบรายการตามตัวกรอง'}</Text>
            </View>
          ) : (
            pageRows.map(renderCard)
          )}
          <ListPager page={safePage} pageSize={PAGE_SIZE} total={filtered.length} unit="งาน" onChange={setPage} />
        </ScrollView>
      )}

      {renderFilterSheet()}
      {renderDetail()}
      {/* เปิดจากการ์ดในรายการ — ตอนเปิดหน้ารายละเอียดอยู่จะใช้ตัวที่ซ้อนในโมดัลรายละเอียดแทน */}
      {!detail && renderListPopup()}
      {!detail && renderDebtPicker()}
    </SafeAreaView>
  );
}

function ItemCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.itemCell}>
      <Text style={styles.itemCellLabel}>{label}</Text>
      <Text style={[styles.itemCellValue, strong && { fontWeight: '900', color: '#0f172a' }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardFooter: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 8 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 8 },
  ownerIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  ownerLabel: { fontSize: 10.5, color: GRAY },
  ownerName: { fontSize: 13, fontWeight: '800', color: '#0f172a', marginTop: 1 },
  ownerAction: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#eef2ff', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 5 },
  ownerActionText: { fontSize: 11.5, fontWeight: '800', color: PRIMARY },
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

  tabRow: { paddingHorizontal: 14, paddingTop: 12, gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 240, height: 36, borderRadius: 50, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', paddingHorizontal: 12 },
  tabActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  tabText: { flexShrink: 1, fontSize: 12, fontWeight: '800', color: '#334155' },
  tabCount: { minWidth: 20, borderRadius: 10, backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 1, alignItems: 'center' },
  tabCountText: { fontSize: 10.5, fontWeight: '900', color: '#475569' },

  summaryCard: { marginHorizontal: 14, marginTop: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden', paddingHorizontal: 12, paddingBottom: 12 },
  summaryTopBar: { height: 4, marginHorizontal: -12, backgroundColor: PRIMARY },
  summaryTotalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14 },
  summaryIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { color: GRAY, fontSize: 12, fontWeight: '700' },
  summaryValue: { color: '#0f172a', fontSize: 20, fontWeight: '900', marginTop: 2 },
  summaryUnit: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },
  summarySub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#f1f5f9', overflow: 'hidden', marginTop: 12 },
  progressTrackSm: { height: 5, borderRadius: 3, backgroundColor: '#f1f5f9', overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', borderRadius: 4 },
  kpiHint: { fontSize: 10.5, color: '#94a3b8', marginTop: 12, marginBottom: 8 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  kpiGroupTitle: { fontSize: 12, fontWeight: '900', color: '#334155', marginTop: 10, marginBottom: 6 },
  kpiBox: { width: '48.8%', minHeight: 66, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, paddingHorizontal: 9, paddingVertical: 8, gap: 4 },
  tapHintIcon: { position: 'absolute', top: 6, right: 7 },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
  kpiLabel: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  kpiValue: { color: '#0f172a', fontSize: 16, fontWeight: '900', marginTop: 'auto' },
  kpiUnit: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  wipBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#fcd34d', backgroundColor: '#fffbeb', padding: 10 },
  wipLabel: { fontSize: 11, fontWeight: '800', color: '#92400e' },
  wipValue: { fontSize: 14, fontWeight: '900', color: '#0f172a', marginTop: 2 },

  resultText: { marginHorizontal: 16, marginTop: 14, marginBottom: 2, fontSize: 12, color: GRAY, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 12.5, textAlign: 'center', paddingVertical: 8 },

  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 14, marginTop: 10, padding: 13, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codeBadge: { backgroundColor: '#ecfeff', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  codeBadgeText: { color: '#0e7490', fontSize: 12, fontWeight: '900' },
  cardComp: { flex: 1, fontSize: 11, color: GRAY, fontWeight: '700' },
  stateChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '100%' },
  stateChipText: { fontSize: 10.5, fontWeight: '800', flexShrink: 1 },
  cardTitle: { color: '#0f172a', fontSize: 14, fontWeight: '800', lineHeight: 20, marginTop: 10 },
  cardSub: { color: GRAY, fontSize: 11.5, marginTop: 3 },
  cardMoneyGrid: { flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  cardMoneyCell: { flex: 1 },
  cardMoneyLabel: { fontSize: 10.5, color: GRAY, fontWeight: '700' },
  cardMoneyValue: { fontSize: 13.5, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaText: { fontSize: 11, color: '#475569', fontWeight: '600', flexShrink: 1 },

  detailOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  detailSheet: { flex: 1, backgroundColor: '#f8fafc', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  detailGrip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginTop: 8, marginBottom: 2 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8fafc', paddingLeft: 16, paddingRight: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  detailHeaderTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: '#0f172a' },
  detailScroll: { padding: 14, paddingBottom: 32, gap: 12 },
  detailHero: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 13, gap: 4 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  detailHeroTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900', lineHeight: 22, marginTop: 6 },
  heroRemark: { fontSize: 12, color: '#334155', lineHeight: 18, marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: '#f8fafc' },
  section: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: '#c7d2fe', paddingHorizontal: 12, paddingBottom: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  infoLabel: { fontSize: 12, color: '#475569', fontWeight: '600', maxWidth: '45%' },
  infoValue: { flex: 1, fontSize: 12.5, color: '#0f172a', fontWeight: '800', textAlign: 'right' },

  itemCard: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginTop: 8 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemNo: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  itemNoText: { fontSize: 11.5, fontWeight: '900', color: '#3730a3' },
  itemName: { flex: 1, fontSize: 13, fontWeight: '800', color: '#0f172a' },
  itemGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, rowGap: 6 },
  itemCell: { width: '50%', paddingRight: 8 },
  itemCellLabel: { fontSize: 10.5, color: GRAY, fontWeight: '600' },
  itemCellValue: { fontSize: 12, color: '#334155', fontWeight: '700', marginTop: 1 },
  itemRemark: { fontSize: 11.5, color: '#475569', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e2e8f0' },

  followRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  followDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#c7d2fe', marginTop: 5 },
  followHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 3 },
  followName: { fontSize: 12.5, fontWeight: '800', color: '#0f172a' },
  followText: { fontSize: 12, color: '#334155', lineHeight: 18 },
  followAt: { fontSize: 10.5, color: '#94a3b8', marginTop: 4 },

  popupBtnRow: { gap: 8 },
  popupBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 11, minHeight: 56 },
  popupBtnIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  popupBtnTitle: { fontSize: 13.5, fontWeight: '900', color: '#0f172a' },
  popupBtnSub: { fontSize: 11.5, color: GRAY, marginTop: 2 },
  cardBtnRow: { flexDirection: 'row', gap: 8 },
  cardBtn: { flex: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', paddingHorizontal: 8 },
  cardBtnText: { flexShrink: 1, fontSize: 12, fontWeight: '800', color: '#334155' },

  debtChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 4 },
  debtChipEmpty: { backgroundColor: '#fff', borderStyle: 'dashed', borderColor: '#a5b4fc' },
  debtChipText: { fontSize: 11, color: '#3730a3', fontWeight: '800', flexShrink: 1 },
  debtRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  debtName: { fontSize: 14, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  debtBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  debtBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 20 },
  pickerSheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerTitle: { flex: 1, fontSize: 15, fontWeight: '900', color: '#0f172a' },
  pickerSub: { fontSize: 11.5, color: GRAY, marginTop: 4, marginBottom: 10 },
  pickerSearch: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, height: 40, marginBottom: 8 },
  pickerSearchInput: { flex: 1, fontSize: 13, color: '#0f172a', padding: 0 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8 },
  pickerOptionActive: { backgroundColor: '#eef2ff' },
  pickerOptionText: { flex: 1, fontSize: 13.5, color: '#334155', fontWeight: '600' },

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
  rangeRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  rangeTo: { fontSize: 12, color: GRAY, fontWeight: '700' },
  sheetFooter: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8 },
  sheetResetBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 12 },
  sheetResetText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  sheetApplyBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: PRIMARY, paddingVertical: 12 },
  sheetApplyText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});
