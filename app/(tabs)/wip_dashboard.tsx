/**
 * wip_dashboard.tsx — Dashboard แนชเก่า / งานระหว่างทำ (ดูข้อมูลอย่างเดียว)
 * ------------------------------------------------------------------
 * พอร์ตจากหน้าเว็บ wip_dashboard.php (ตาราง wip_jobs แยกตามปีชีท)
 *  - ข้อมูลจาก tjc-api/mobile_api/modules/wip_API_mobile.php
 *      get_dashboard    = ปีที่มี + KPI + แยกบริษัท + รายการของปี (นับถอยหลัง/ประกันคำนวณที่ API ด้วยสูตรเว็บ)
 *      get_edit_history = ประวัติการแก้ไขของงาน
 *  - KPI การ์ดเหมือนเว็บ: นับเฉพาะงานที่ไม่ยกเลิก ไม่เปลี่ยนตามตัวกรอง ยกเว้น "ยอดงบรวม" ที่เว็บรวมตามแถวที่กรองอยู่
 *  - กดการ์ด = wipFilterByKpi() ของเว็บ (ตั้งตัวกรองสถานะนับถอยหลัง/สถานะงาน/ประกัน)
 *  - ปุ่มตามเว็บ ยกเว้นแก้ไข: เลือกผู้รับผิดชอบ, ปิดจบหน้างาน, ยกเลิกปิดจบ, ยกเลิกงาน (ต้องใส่เหตุผล),
 *    ประวัติงานที่ยกเลิก, ประวัติยกเลิกปิดจบ — ไม่มี นำเข้า/Export Excel/ลบทดสอบ (ทำบนเว็บ)
 *  - ปีชีทในตารางเป็น พ.ศ. — แอปแสดงเป็น ค.ศ. ตามกติกาทั้งแอป
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import AutoGrid from '../../components/AutoGrid';
import ListPager, { pageCount } from '../../components/ListPager';
import { useScreenInsets } from '../../components/useScreenInsets';
import { API_MODULES } from '../../constants/config';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';
import { useAuth } from '../_layout';

const WIP_API_URL = `${API_MODULES}/wip_API_mobile.php`;
const PAGE_SIZE = 30;

// กติกาสีทั้งแอป: ปุ่มหลัก = PRIMARY, เขียว = เสร็จ/ปกติ, ส้ม = ใกล้/ค้าง, แดง = เกิน/มีปัญหา, เทา = ข้อมูลทั่วไป
const PRIMARY = '#4f46e5';
const GREEN = '#059669';
const AMBER = '#d97706';
const RED = '#dc2626';
const GRAY = '#64748b';

// -------------------- Types --------------------

type CountdownKey = '' | 'normal' | 'warning' | 'danger';
type CountdownFilter = 'all' | 'normal' | 'warning' | 'danger';
// ค่าเดียวกับ #jobStatusFilter ของเว็บ
type JobStatusFilter = 'all' | 'สัญญาจ้าง' | '__not_closed__' | 'ปิดจบหน้างาน' | 'ชำระเรียบร้อย' | 'ยกเลิก';
type WarrantyFlag = '' | 'near' | 'expired';
type KpiKey = 'all' | 'warning' | 'near_warranty' | 'not_closed' | 'closed' | 'paid' | 'danger' | 'warranty_expired';

interface Kpi {
  total: number;
  budgetSum: number;
  nearDue: number;
  overdue: number;
  closed: number;
  closedUnpaid: number;
  paid: number;
  notClosed: number;
  nearWarranty: number;
  warrantyExpired: number;
}
interface CompanyKpi { company: string; name: string; cnt: number; budgetSum: number }

interface WipJob {
  id: number;
  siteNo: string;
  company: string;
  contractNo: string;
  agency: string;
  projectName: string;
  budget: number | null;
  address: string;
  affiliation: string;
  contactPhone: string;
  jobType: string;
  submitDate: string;
  submitNote: string;
  startDate: string;
  startNote: string;
  endDate: string;
  endNote: string;
  entryDate: string;
  alertDays: number;
  daysRemaining: number | null;
  statusKey: CountdownKey;
  warrantyText: string;
  warrantyStart: string;
  warrantyEnd: string;
  warrantyDaysLeft: number | null;
  nearWarranty: boolean;
  warrantyExpired: boolean;
  jobStatus: string;
  cancelReason: string;
  canceledBy: string;
  closedBy: string;
  closedAt: string;
  recordedBy: string;
  lastEditor: string;
  editCount: number;
  debtType: string;
  debtName: string;
  remark: string;
}

const str = (v: any) => (v === null || v === undefined ? '' : String(v));
const num = (v: any) => Number(v ?? 0) || 0;
const numOrNull = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));

function mapJob(r: any): WipJob {
  const sk = str(r.status_key);
  return {
    id: num(r.id),
    siteNo: str(r.site_no),
    company: str(r.company),
    contractNo: str(r.contract_no),
    agency: str(r.agency_name),
    projectName: str(r.project_name),
    budget: numOrNull(r.budget),
    address: str(r.address),
    affiliation: str(r.affiliation),
    contactPhone: str(r.contact_phone),
    jobType: str(r.job_type),
    submitDate: str(r.submit_date),
    submitNote: str(r.submit_note),
    startDate: str(r.start_date),
    startNote: str(r.start_note),
    endDate: str(r.end_date),
    endNote: str(r.end_note),
    entryDate: str(r.entry_date),
    alertDays: num(r.alert_days) || 30,
    daysRemaining: numOrNull(r.days_remaining),
    statusKey: sk === 'normal' || sk === 'warning' || sk === 'danger' ? sk : '',
    warrantyText: str(r.warranty_text),
    warrantyStart: str(r.warranty_start),
    warrantyEnd: str(r.warranty_end),
    warrantyDaysLeft: numOrNull(r.warranty_days_left),
    nearWarranty: !!r.near_warranty,
    warrantyExpired: !!r.warranty_expired,
    jobStatus: str(r.job_status) || 'สัญญาจ้าง',
    cancelReason: str(r.cancel_reason),
    canceledBy: str(r.canceled_by),
    closedBy: str(r.closed_by),
    closedAt: str(r.closed_at),
    recordedBy: str(r.recorded_by),
    lastEditor: str(r.last_editor),
    editCount: num(r.edit_count),
    debtType: str(r.debt_type),
    debtName: str(r.debt_name),
    remark: str(r.remark),
  };
}

// -------------------- กติกาเดียวกับเว็บ --------------------

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isFinished = (j: WipJob) => j.jobStatus === 'ปิดจบหน้างาน' || j.jobStatus === 'ชำระเรียบร้อย';
const isCanceled = (j: WipJob) => j.jobStatus === 'ยกเลิก';
const ceYear = (be: number) => (be > 2400 ? be - 543 : be);

const JOB_STATUS_META: Record<string, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  สัญญาจ้าง: { color: AMBER, icon: 'document-text' },
  ปิดจบหน้างาน: { color: GREEN, icon: 'flag' },
  ชำระเรียบร้อย: { color: GREEN, icon: 'cash' },
  ยกเลิก: { color: GRAY, icon: 'ban' },
};
const jobStatusMeta = (s: string) => JOB_STATUS_META[s] ?? { color: GRAY, icon: 'ellipse-outline' as const };

const JOB_STATUS_LABEL: Record<JobStatusFilter, string> = {
  all: 'ทั้งหมด',
  สัญญาจ้าง: 'สัญญาจ้าง',
  __not_closed__: 'ยังไม่ปิดจบ (คงค้าง)',
  ปิดจบหน้างาน: 'ปิดจบหน้างาน',
  ชำระเรียบร้อย: 'ชำระเรียบร้อย',
  ยกเลิก: 'ยกเลิก',
};
const COUNTDOWN_LABEL: Record<CountdownFilter, string> = { all: 'ทั้งหมด', normal: 'ปกติ', warning: 'ใกล้ครบกำหนด', danger: 'เกินกำหนด' };

// ป้ายนับถอยหลังวันสิ้นสุด — ข้อความเดียวกับ $badge_text / $dueDisplayText ของเว็บ
function dueBadge(j: WipJob): { text: string; fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap } {
  if (isCanceled(j)) return { text: 'ยกเลิกงานแล้ว', fg: GRAY, bg: '#f1f5f9', icon: 'ban' };
  if (isFinished(j)) return { text: 'จบงานแล้ว', fg: GREEN, bg: '#ecfdf5', icon: 'checkmark-circle' };
  const d = j.daysRemaining;
  if (d === null) return { text: 'ไม่ทราบวันสิ้นสุด', fg: AMBER, bg: '#fffbeb', icon: 'help-circle-outline' };
  if (d < 0) return { text: `เกินกำหนด ${Math.abs(d).toLocaleString('en-US')} วัน`, fg: '#fff', bg: RED, icon: 'alert-circle' };
  if (d <= j.alertDays) return { text: `ใกล้ครบกำหนด (${d.toLocaleString('en-US')} วัน)`, fg: RED, bg: '#fef2f2', icon: 'hourglass' };
  return { text: `ปกติ (${d.toLocaleString('en-US')} วัน)`, fg: GREEN, bg: '#ecfdf5', icon: 'time-outline' };
}

function warrantyCountdown(j: WipJob): { text: string; color: string } {
  const d = j.warrantyDaysLeft;
  if (d === null) return { text: '-', color: GRAY };
  if (d < 0) return { text: `หมดประกันแล้ว ${Math.abs(d).toLocaleString('en-US')} วัน`, color: RED };
  if (j.nearWarranty) return { text: `ใกล้หมดประกัน (เหลือ ${d.toLocaleString('en-US')} วัน)`, color: RED };
  return { text: `เหลือ ${d.toLocaleString('en-US')} วัน`, color: GREEN };
}

// วันที่แสดง: มีวันที่ใช้วันที่ ไม่มีใช้หมายเหตุจากชีท (เหมือน $startDateDisplay ฯลฯ)
const dateOrNote = (d: string, note: string) => (d ? formatShortThaiDate(d) : note || '-');

// -------------------- Screen --------------------

export default function WipDashboardScreen() {
  const { user } = useAuth();
  // ขอบจอจริง (หน้าใน Drawer ได้ insets.top = 0 จาก header) — ใช้วางป๊อปอัพไม่ให้ชนแถบสถานะ/แถบนำทาง
  const insets = useScreenInsets();

  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState(0); // ปีชีท พ.ศ. (0 = ให้ API เลือกปีล่าสุด)
  const [jobs, setJobs] = useState<WipJob[]>([]);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [companies, setCompanies] = useState<CompanyKpi[]>([]);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [debtPresent, setDebtPresent] = useState<string[]>([]);
  const [debtUsers, setDebtUsers] = useState<string[]>([]); // รายชื่อให้เลือกเป็นผู้ติดตามหนี้ (แหล่งเดียวกับเว็บ)
  const [debtPicker, setDebtPicker] = useState<{ job: WipJob | null; search: string; saving: boolean }>({ job: null, search: '', saving: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState('');
  const [countdownFilter, setCountdownFilter] = useState<CountdownFilter>('all');
  const [jobStatusFilter, setJobStatusFilter] = useState<JobStatusFilter>('all');
  const [warrantyFlag, setWarrantyFlag] = useState<WarrantyFlag>('');
  const [debtFilter, setDebtFilter] = useState(''); // '' ทั้งหมด / '__none__' ยังไม่ระบุ / ชื่อ
  const [closedStart, setClosedStart] = useState('');
  const [closedEnd, setClosedEnd] = useState('');
  const [sortAsc, setSortAsc] = useState(false); // ค่าเริ่มต้นเว็บ: เลขหน้างาน มาก->น้อย
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false); // ส่วนสรุปด้านบน: ปกติย่อไว้
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState<WipJob | null>(null);
  const [editLogs, setEditLogs] = useState<{ editor: string; editedAt: string }[] | null>(null);
  // ปุ่มจัดการตามเว็บ (ยกเว้นแก้ไข): ปิดจบ / ยกเลิกปิดจบ / ยกเลิกงาน
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [cancelJob, setCancelJob] = useState<{ job: WipJob | null; reason: string; saving: boolean }>({ job: null, reason: '', saving: false });
  // ป๊อปอัพประวัติ (ปุ่มบนหัวตารางเว็บ)
  const [historyPopup, setHistoryPopup] = useState<{ kind: 'canceled' | 'undo' | null; loading: boolean; list: any[]; error: string | null }>({
    kind: null,
    loading: false,
    list: [],
    error: null,
  });

  const load = useCallback(
    async (refresh = false, y = year) => {
      if (!user?.id) return;
      refresh ? setRefreshing(true) : setLoading(true);
      setLoadError(null);
      try {
        const res = await apiMobileGet(WIP_API_URL, 'get_dashboard', { user_id: user.id, ...(y ? { year: y } : {}) });
        setYears(Array.isArray(res.years) ? res.years.map(num) : []);
        setYear(num(res.year));
        setJobs(Array.isArray(res.list) ? res.list.map(mapJob) : []);
        const k = res.kpi ?? {};
        setKpi({
          total: num(k.total),
          budgetSum: num(k.budget_sum),
          nearDue: num(k.near_due),
          overdue: num(k.overdue),
          closed: num(k.closed),
          closedUnpaid: num(k.closed_unpaid),
          paid: num(k.paid),
          notClosed: num(k.not_closed),
          nearWarranty: num(k.near_warranty),
          warrantyExpired: num(k.warranty_expired),
        });
        setCompanies(
          (Array.isArray(res.companies) ? res.companies : []).map((c: any) => ({ company: str(c.company), name: str(c.name), cnt: num(c.cnt), budgetSum: num(c.budget_sum) }))
        );
        setJobTypes(Array.isArray(res.job_types) ? res.job_types.map(str) : []);
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
        setDebtPicker({ job: null, search: '', saving: false });
      };
    }, [])
  );

  function changeYear(y: number) {
    if (y === year) return;
    resetFilters();
    void load(false, y);
  }

  async function openDetail(j: WipJob) {
    setDetail(j);
    setEditLogs(null);
    if (!user?.id || j.editCount === 0) {
      setEditLogs([]);
      return;
    }
    try {
      const res = await apiMobileGet(WIP_API_URL, 'get_edit_history', { user_id: user.id, id: j.id });
      setEditLogs((Array.isArray(res.logs) ? res.logs : []).map((l: any) => ({ editor: str(l.editor), editedAt: str(l.edited_at) })));
    } catch {
      setEditLogs([]);
    }
  }

  // wipFilterByKpi() ของเว็บ
  function filterByKpi(type: KpiKey) {
    setWarrantyFlag('');
    if (type === 'all') {
      setCountdownFilter('all');
      setJobStatusFilter('all');
    } else if (type === 'warning' || type === 'danger') {
      setCountdownFilter(type);
      setJobStatusFilter('all');
    } else if (type === 'closed') {
      setCountdownFilter('all');
      setJobStatusFilter('ปิดจบหน้างาน');
    } else if (type === 'paid') {
      setCountdownFilter('all');
      setJobStatusFilter('ชำระเรียบร้อย');
    } else if (type === 'not_closed') {
      setCountdownFilter('all');
      setJobStatusFilter('__not_closed__');
    } else {
      setCountdownFilter('all');
      setJobStatusFilter('all');
      setWarrantyFlag(type === 'near_warranty' ? 'near' : 'expired');
    }
  }
  const activeKpi: KpiKey | null = warrantyFlag
    ? warrantyFlag === 'near' ? 'near_warranty' : 'warranty_expired'
    : countdownFilter === 'warning' || countdownFilter === 'danger'
      ? jobStatusFilter === 'all' ? countdownFilter : null
      : countdownFilter === 'all'
        ? jobStatusFilter === 'ปิดจบหน้างาน' ? 'closed'
          : jobStatusFilter === 'ชำระเรียบร้อย' ? 'paid'
            : jobStatusFilter === '__not_closed__' ? 'not_closed'
              : null
        : null;

  // เลือกช่วงวันปิดจบ = ดูเฉพาะงานที่ปิดจบ (wipApplyClosedDateFilter ของเว็บ)
  function setClosedRange(start: string, end: string) {
    setClosedStart(start);
    setClosedEnd(end);
    if (start || end) {
      setCountdownFilter('all');
      setJobStatusFilter('ปิดจบหน้างาน');
      setWarrantyFlag('');
    }
  }

  // applyFilters() ของเว็บ
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dq = debtFilter.trim().toLowerCase();
    const rows = jobs.filter((j) => {
      if (q) {
        const hay = [j.siteNo, j.company, j.contractNo, j.agency, j.projectName, j.jobType, j.debtName, j.jobStatus, j.affiliation].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (debtFilter === '__none__') {
        if (j.debtName.trim() !== '') return false;
      } else if (dq && !j.debtName.toLowerCase().includes(dq)) return false;
      if (companyFilter && j.company !== companyFilter) return false;
      if (jobTypeFilter && j.jobType !== jobTypeFilter) return false;
      if (countdownFilter !== 'all' && j.statusKey !== countdownFilter) return false;
      if (jobStatusFilter === '__not_closed__') {
        if (isFinished(j) || isCanceled(j)) return false;
      } else if (jobStatusFilter !== 'all' && j.jobStatus !== jobStatusFilter) return false;
      // งานที่ยกเลิกแล้วซ่อนไว้ — เห็นเฉพาะตอนเลือกตัวกรองสถานะงาน "ยกเลิก" (ผู้ใช้ขอ ต่างจากตารางเว็บที่โชว์ปนแบบขีดฆ่า)
      if (isCanceled(j) && jobStatusFilter !== 'ยกเลิก') return false;
      if (warrantyFlag === 'near' && !j.nearWarranty) return false;
      if (warrantyFlag === 'expired' && !j.warrantyExpired) return false;
      if (closedStart || closedEnd) {
        const cd = j.closedAt.slice(0, 10);
        if (!cd) return false;
        if (closedStart && cd < closedStart) return false;
        if (closedEnd && cd > closedEnd) return false;
      }
      return true;
    });
    if (sortAsc) rows.reverse();
    return rows;
  }, [jobs, search, debtFilter, companyFilter, jobTypeFilter, countdownFilter, jobStatusFilter, warrantyFlag, closedStart, closedEnd, sortAsc]);

  // "ยอดงบรวม" ของเว็บรวมตามแถวที่กรองอยู่ (ไม่รวมงานยกเลิก)
  const filteredBudget = useMemo(() => filtered.reduce((s, j) => (isCanceled(j) ? s : s + (j.budget ?? 0)), 0), [filtered]);

  useEffect(() => {
    setPage(1);
  }, [search, debtFilter, companyFilter, jobTypeFilter, countdownFilter, jobStatusFilter, warrantyFlag, closedStart, closedEnd, sortAsc, year]);
  const totalPages = pageCount(filtered.length, PAGE_SIZE);
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const compName = (raw: string) => companies.find((c) => c.company === raw)?.name || raw || 'ไม่ระบุ';
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (companyFilter) chips.push({ key: 'comp', label: compName(companyFilter), clear: () => setCompanyFilter('') });
  if (jobTypeFilter) chips.push({ key: 'jt', label: jobTypeFilter, clear: () => setJobTypeFilter('') });
  if (countdownFilter !== 'all') chips.push({ key: 'cd', label: COUNTDOWN_LABEL[countdownFilter], clear: () => setCountdownFilter('all') });
  if (jobStatusFilter !== 'all') chips.push({ key: 'js', label: JOB_STATUS_LABEL[jobStatusFilter], clear: () => setJobStatusFilter('all') });
  if (warrantyFlag) chips.push({ key: 'w', label: warrantyFlag === 'near' ? 'ใกล้หมดประกัน' : 'หมดประกันแล้ว', clear: () => setWarrantyFlag('') });
  if (debtFilter) chips.push({ key: 'debt', label: debtFilter === '__none__' ? 'ยังไม่ระบุผู้ติดตาม' : debtFilter, clear: () => setDebtFilter('') });
  if (closedStart || closedEnd)
    chips.push({
      key: 'closed',
      label: `ปิดจบ ${closedStart ? formatShortThaiDate(closedStart) : '-'} ถึง ${closedEnd ? formatShortThaiDate(closedEnd) : '-'}`,
      clear: () => (setClosedStart(''), setClosedEnd('')),
    });

  function resetFilters() {
    setCompanyFilter('');
    setJobTypeFilter('');
    setCountdownFilter('all');
    setJobStatusFilter('all');
    setWarrantyFlag('');
    setDebtFilter('');
    setClosedStart('');
    setClosedEnd('');
    setSearch('');
  }

  // -------------------- render --------------------

  function renderYearTabs() {
    if (years.length <= 1) return null;
    return (
      <AutoGrid style={styles.yearRow}>
        {years.map((y) => {
          const active = y === year;
          return (
            <TouchableOpacity key={y} style={[styles.yearTab, active && styles.yearTabActive]} onPress={() => changeYear(y)}>
              <Text style={[styles.yearTabText, active && { color: '#fff' }]}>ปี {ceYear(y)}</Text>
            </TouchableOpacity>
          );
        })}
      </AutoGrid>
    );
  }

  function renderSummary() {
    if (!kpi) return null;
    // ย่อ/กางสรุป — ปกติแสดงแค่ปุ่มกรองด่วน รายการจะขึ้นมาใกล้ด้านบน
    const quick = (key: string, label: string, count: number, color: string, active: boolean, onPress: () => void) => (
      <TouchableOpacity key={key} style={[styles.quickChip, active && { borderColor: color, backgroundColor: color + '14' }]} onPress={onPress}>
        <Text style={[styles.quickChipLabel, active && { color }]} numberOfLines={1}>{label}</Text>
        <View style={[styles.quickChipCount, { backgroundColor: color }]}>
          <Text style={styles.quickChipCountText}>{count.toLocaleString('en-US')}</Text>
        </View>
      </TouchableOpacity>
    );
    const summaryToggle = (
      <TouchableOpacity style={styles.summaryToggle} onPress={() => setSummaryOpen((v) => !v)}>
        <Text style={styles.summaryToggleText}>{summaryOpen ? 'ย่อสรุป' : 'ดูสรุปทั้งหมด'}</Text>
        <Ionicons name={summaryOpen ? 'chevron-up' : 'chevron-down'} size={14} color={PRIMARY} />
      </TouchableOpacity>
    );

    const box = (type: KpiKey, label: string, value: number, color: string, icon: keyof typeof Ionicons.glyphMap, extra?: string) => {
      const active = activeKpi === type && type !== 'all';
      return (
        <TouchableOpacity
          key={type}
          style={[styles.kpiBox, { borderTopColor: color }, active && { borderColor: color, backgroundColor: color + '0d' }]}
          onPress={() => filterByKpi(active ? 'all' : type)}
        >
          {type !== 'all' && <Ionicons name={active ? 'funnel' : 'funnel-outline'} size={10} color={active ? color : '#94a3b8'} style={styles.tapHintIcon} />}
          <View style={styles.kpiLabelRow}>
            <Ionicons name={icon} size={12} color={color} />
            <Text style={[styles.kpiLabel, { color }]} numberOfLines={2}>{label}</Text>
          </View>
          <Text style={styles.kpiValue}>
            {value.toLocaleString('en-US')} <Text style={styles.kpiUnit}>งาน</Text>
          </Text>
          {!!extra && <Text style={styles.kpiExtra}>{extra}</Text>}
        </TouchableOpacity>
      );
    };
    return (
      <View style={styles.summaryCard}>
        <View style={styles.summaryTopBar} />
        <View style={styles.summaryTotalRow}>
          <View style={styles.summaryIcon}>
            <Ionicons name="construct" size={20} color={PRIMARY} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>ยอดงบรวม{chips.length > 0 || search ? ' (ตามตัวกรอง)' : ''}</Text>
            <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
              ฿{money(filteredBudget)}
            </Text>
            <Text style={styles.summarySub}>
              งานทั้งหมด {kpi.total.toLocaleString('en-US')} งาน · ปีชีท {ceYear(year)} (ไม่รวมที่ยกเลิก)
            </Text>
          </View>
        </View>
        {!summaryOpen && (
          <AutoGrid style={styles.quickRow}>
            {quick('not_closed', 'ยังไม่ปิดจบ', kpi.notClosed, AMBER, activeKpi === 'not_closed', () => filterByKpi(activeKpi === 'not_closed' ? 'all' : 'not_closed'))}
            {quick('danger', 'เกินกำหนด', kpi.overdue, RED, activeKpi === 'danger', () => filterByKpi(activeKpi === 'danger' ? 'all' : 'danger'))}
            {quick('warning', 'ใกล้ครบกำหนด', kpi.nearDue, AMBER, activeKpi === 'warning', () => filterByKpi(activeKpi === 'warning' ? 'all' : 'warning'))}
            {quick('near_warranty', 'ใกล้หมดประกัน', kpi.nearWarranty, AMBER, activeKpi === 'near_warranty', () => filterByKpi(activeKpi === 'near_warranty' ? 'all' : 'near_warranty'))}
          </AutoGrid>
        )}
        {summaryOpen && (
          <>
        <Text style={styles.kpiHint}>
          <Ionicons name="funnel-outline" size={10} color="#94a3b8" /> แตะกล่องเพื่อกรองรายการ
        </Text>
        {/* จัดเป็นหมวด: สถานะงาน / กำหนดส่งมอบ / การรับประกัน */}
        <Text style={styles.kpiGroupTitle}>สถานะงาน</Text>
        <View style={styles.kpiGrid}>
          {box('all', 'งานทั้งหมด', kpi.total, PRIMARY, 'folder-open')}
          {box('not_closed', 'ยังไม่ปิดจบหน้างาน', kpi.notClosed, AMBER, 'alert-circle')}
          {box('closed', 'ปิดจบหน้างาน', kpi.closed, GREEN, 'flag', kpi.closedUnpaid > 0 ? `(${kpi.closedUnpaid.toLocaleString('en-US')} ยังไม่ชำระ)` : undefined)}
          {box('paid', 'ชำระเรียบร้อย', kpi.paid, GREEN, 'cash')}
        </View>
        <Text style={styles.kpiGroupTitle}>กำหนดส่งมอบ</Text>
        <View style={styles.kpiGrid}>
          {box('warning', 'ใกล้ครบกำหนดส่ง', kpi.nearDue, AMBER, 'hourglass')}
          {box('danger', 'เกินกำหนด', kpi.overdue, RED, 'alarm')}
        </View>
        <Text style={styles.kpiGroupTitle}>การรับประกัน</Text>
        <View style={styles.kpiGrid}>
          {box('near_warranty', 'ใกล้หมดประกัน', kpi.nearWarranty, AMBER, 'shield-half')}
          {box('warranty_expired', 'หมดประกันแล้ว', kpi.warrantyExpired, GRAY, 'shield-outline')}
        </View>
          </>
        )}
        {summaryToggle}
      </View>
    );
  }


  function renderCompanies() {
    if (companies.length === 0) return null;
    return (
      <AutoGrid style={styles.compRow}>
        {companies.map((c) => {
          const active = companyFilter === c.company;
          return (
            <TouchableOpacity
              key={c.company}
              style={[styles.compCard, active && styles.compCardActive]}
              onPress={() => setCompanyFilter(active ? '' : c.company)}
            >
              <Text style={[styles.compName, active && { color: '#fff' }]} numberOfLines={1}>{c.name}</Text>
              <Text style={[styles.compCount, active && { color: '#fff' }]}>{c.cnt.toLocaleString('en-US')} งาน</Text>
              <Text style={[styles.compBudget, active && { color: '#e0e7ff' }]} numberOfLines={1}>฿{money(c.budgetSum)}</Text>
            </TouchableOpacity>
          );
        })}
      </AutoGrid>
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

  function renderCard(j: WipJob) {
    const canceled = isCanceled(j);
    const due = dueBadge(j);
    const st = jobStatusMeta(j.jobStatus);
    const phone = j.contactPhone.replace(/[^\d+]/g, '');
    return (
      <TouchableOpacity key={j.id} activeOpacity={0.75} onPress={() => openDetail(j)} style={[styles.card, canceled && styles.cardCanceled]}>
        <View style={styles.cardTopRow}>
          <View style={styles.codeBadge}>
            <Text style={styles.codeBadgeText}>{j.siteNo || '-'}</Text>
          </View>
          <Text style={styles.cardComp} numberOfLines={1}>{compName(j.company)}</Text>
          <View style={[styles.stateChip, { backgroundColor: st.color + '14' }]}>
            <Ionicons name={st.icon} size={11} color={st.color} />
            <Text style={[styles.stateChipText, { color: st.color }]}>{j.jobStatus}</Text>
          </View>
        </View>
        <Text style={[styles.cardTitle, canceled && styles.strike]} numberOfLines={2}>{j.projectName || 'ไม่ระบุชื่อโครงการ'}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>{j.agency || '-'}</Text>
        {!!j.contractNo && <Text style={styles.cardSub} numberOfLines={1}>สัญญา {j.contractNo}</Text>}
        <View style={styles.cardMoneyRow}>
          <Text style={[styles.cardValue, canceled && styles.strike]}>{j.budget === null ? '-' : `฿${money(j.budget)}`}</Text>
          <View style={{ flex: 1 }} />
          <View style={[styles.cdBadge, { backgroundColor: due.bg }]}>
            <Ionicons name={due.icon} size={11} color={due.fg} />
            <Text style={[styles.cdBadgeText, { color: due.fg }]} numberOfLines={1}>{due.text}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={12} color={GRAY} />
            <Text style={styles.metaText} numberOfLines={1}>
              {dateOrNote(j.startDate, j.startNote)} → {dateOrNote(j.endDate, j.endNote)}
            </Text>
          </View>
          {(j.nearWarranty || j.warrantyExpired) && (
            <View style={styles.metaItem}>
              <Ionicons name="shield-half" size={12} color={j.warrantyExpired ? GRAY : AMBER} />
              <Text style={[styles.metaText, { color: j.warrantyExpired ? GRAY : AMBER }]}>{j.warrantyExpired ? 'หมดประกัน' : 'ใกล้หมดประกัน'}</Text>
            </View>
          )}
        </View>
        {/* แถบปุ่มท้ายการ์ด: ผู้รับผิดชอบ + ปุ่มการกระทำ */}
        <View style={styles.cardFooter}>
          {renderOwnerRow(j.debtName, j.debtType === 'ทีม', () => setDebtPicker({ job: j, search: '', saving: false }))}
        {/* ปุ่มจัดการตามเว็บ (ยกเว้นแก้ไข) + โทรหาหน่วยงาน — กดจากการ์ดได้เลย */}
        {renderJobActions(j)}
        {!!phone && (
          <View style={styles.cardBtnRow}>
            <TouchableOpacity style={styles.cardBtn} onPress={() => Linking.openURL(`tel:${phone}`)} accessibilityLabel="โทรหาหน่วยงาน">
              <Ionicons name="call" size={14} color={PRIMARY} />
              <Text style={[styles.cardBtnText, { color: PRIMARY }]} numberOfLines={1}>โทร {j.contactPhone}</Text>
            </TouchableOpacity>
          </View>
        )}
        </View>
      </TouchableOpacity>
    );
  }

  // แถวข้อมูลแบบ modal รายละเอียดของเว็บ: ไอคอน + หัวข้อซ้าย / ค่าขวา (sub = บรรทัดเล็กใต้ค่า เช่น เวลาปิดจบ)
  function InfoRow({ label, value, color, icon, sub, onPress }: { label: string; value?: string; color?: string; icon?: keyof typeof Ionicons.glyphMap; sub?: string; onPress?: () => void }) {
    const body = (
      <>
        <View style={styles.infoLabelWrap}>
          {!!icon && <Ionicons name={icon} size={14} color="#94a3b8" />}
          <Text style={styles.infoLabel}>{label}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.infoValue, color ? { color, fontWeight: '900' } : null]}>{value?.trim() ? value : '-'}</Text>
          {!!sub && <Text style={styles.infoSub}>{sub}</Text>}
        </View>
      </>
    );
    return onPress ? (
      <TouchableOpacity style={styles.infoRow} onPress={onPress}>{body}</TouchableOpacity>
    ) : (
      <View style={styles.infoRow}>{body}</View>
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
    const j = detail;
    const close = () => setDetail(null);
    const due = j ? dueBadge(j) : null;
    const wc = j ? warrantyCountdown(j) : null;
    const phone = j?.contactPhone.replace(/[^\d+]/g, '') ?? '';
    return (
      <Modal visible={!!j} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
        {/* ป๊อปอัพเลื่อนขึ้นจากด้านล่าง — เว้นด้านบนให้พ้นแถบสถานะ และเว้นท้ายให้พ้นแถบปุ่มนำทางของมือถือ */}
        <View style={styles.detailOverlay}>
          <TouchableOpacity style={{ height: insets.top + 24 }} activeOpacity={1} onPress={close} accessibilityLabel="ปิด" />
          <View style={[styles.detailSheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.detailGrip} />
          <View style={styles.detailHeader}>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>หน้างาน {j?.siteNo || ''}</Text>
            <TouchableOpacity onPress={close} style={styles.closeBtn} hitSlop={8} accessibilityLabel="ปิด">
              <Ionicons name="close" size={20} color="#475569" />
            </TouchableOpacity>
          </View>
          {j && due && wc && (
            <ScrollView contentContainerStyle={styles.detailScroll}>
              {isCanceled(j) && (
                <View style={styles.cancelBox}>
                  <Ionicons name="ban" size={14} color={RED} />
                  <Text style={styles.cancelBoxText}>
                    ยกเลิกแล้ว{j.canceledBy ? ` โดย ${j.canceledBy}` : ''}
                    {j.cancelReason ? `\nเหตุผล: ${j.cancelReason}` : ''}
                  </Text>
                </View>
              )}
              {/* 4 กล่องเรียงตาม modal รายละเอียดของเว็บ: ข้อมูลงาน / ข้อมูลหน่วยงาน / การรับประกัน / ข้อมูลระบบ */}
              <Section icon="clipboard" title="ข้อมูลงาน">
                <InfoRow icon="pricetag-outline" label="หน้างาน" value={j.siteNo} />
                <InfoRow icon="business-outline" label="บริษัท" value={compName(j.company)} />
                <InfoRow icon="document-text-outline" label="เลขที่สัญญา" value={j.contractNo} />
                <InfoRow icon="construct-outline" label="ประเภทงาน" value={j.jobType} />
                <InfoRow icon="cash-outline" label="ยอดงบ" value={j.budget === null ? '' : `฿${money(j.budget)}`} color={GREEN} />
                <InfoRow icon="calendar-outline" label="วันเริ่มสัญญา" value={dateOrNote(j.startDate, j.startNote)} />
                <InfoRow icon="calendar-clear-outline" label="วันสิ้นสุดสัญญา" value={dateOrNote(j.endDate, j.endNote)} />
                <InfoRow icon="cube-outline" label="ครบกำหนดส่งมอบ" value={due.text} color={due.bg === RED ? RED : due.fg} />
                <InfoRow icon="mail-outline" label="วันยื่นซอง" value={dateOrNote(j.submitDate, j.submitNote)} />
                {!!j.remark && <InfoRow icon="chatbox-ellipses-outline" label="หมายเหตุ" value={j.remark} />}
              </Section>
              <Section icon="business" title="ข้อมูลหน่วยงาน">
                <InfoRow icon="library-outline" label="หน่วยงาน" value={j.agency} />
                <InfoRow icon="create-outline" label="ชื่อโครงการ" value={j.projectName} />
                <InfoRow icon="location-outline" label="ที่อยู่" value={j.address} />
                <InfoRow icon="git-network-outline" label="สังกัด" value={j.affiliation} />
                <InfoRow
                  icon="call-outline"
                  label="เบอร์ติดต่อ"
                  value={j.contactPhone}
                  color={phone ? PRIMARY : undefined}
                  onPress={phone ? () => Linking.openURL(`tel:${phone}`) : undefined}
                />
              </Section>
              <Section icon="shield-half" title="การรับประกัน">
                <InfoRow icon="shield-outline" label="ระยะเวลารับประกัน" value={j.warrantyText} />
                <InfoRow icon="calendar-outline" label="วันที่เริ่มรับประกัน" value={j.warrantyStart ? formatShortThaiDate(j.warrantyStart) : ''} />
                <InfoRow icon="calendar-clear-outline" label="วันที่สิ้นสุดค้ำ" value={j.warrantyEnd ? formatShortThaiDate(j.warrantyEnd) : ''} />
                <InfoRow icon="hourglass-outline" label="สถานะรับประกัน" value={wc.text} color={wc.text === '-' ? undefined : wc.color} />
              </Section>
              <Section icon="people" title="ข้อมูลระบบ">
                <InfoRow icon="person-add-outline" label="ผู้ลงข้อมูล" value={j.recordedBy} />
                <InfoRow icon="pencil-outline" label="วันที่ลงข้อมูล" value={j.entryDate ? formatShortThaiDate(j.entryDate) : ''} />
                <InfoRow icon="time-outline" label="ผู้แก้ไขล่าสุด" value={j.lastEditor ? `${j.lastEditor} (${j.editCount} ครั้ง)` : ''} />
                <InfoRow
                  icon="flag-outline"
                  label="ปิดจบหน้างานโดย"
                  value={j.closedBy}
                  sub={j.closedAt ? formatShortThaiDateTime(j.closedAt) : undefined}
                />
              </Section>
              {!isCanceled(j) && (
                <Section icon="flag" title="จัดการงาน">
                  {renderJobActions(j)}
                  <View style={{ height: 6 }} />
                </Section>
              )}
              <Section icon={j.debtType === 'ทีม' ? 'people' : 'person'} title="ผู้รับผิดชอบติดตามหนี้">
                <View style={styles.debtRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{j.debtType === 'ทีม' ? 'ทีม' : 'บุคคล'}</Text>
                    <Text style={[styles.debtName, !j.debtName && { color: '#94a3b8' }]}>{j.debtName || 'ยังไม่ระบุ'}</Text>
                  </View>
                  <TouchableOpacity style={styles.debtBtn} onPress={() => setDebtPicker({ job: j, search: '', saving: false })}>
                    <Ionicons name={j.debtName ? 'swap-horizontal' : 'person-add'} size={14} color="#fff" />
                    <Text style={styles.debtBtnText}>{j.debtName ? 'เปลี่ยน' : 'เลือก'}</Text>
                  </TouchableOpacity>
                </View>
              </Section>
              {j.editCount > 0 && (
                <Section icon="time" title={`ประวัติการแก้ไข (${j.editCount})`}>
                  {editLogs === null ? (
                    <ActivityIndicator color={PRIMARY} style={{ paddingVertical: 12 }} />
                  ) : editLogs.length === 0 ? (
                    <Text style={styles.emptyText}>ไม่มีประวัติ</Text>
                  ) : (
                    editLogs.map((l, i) => (
                      <View key={i} style={styles.logRow}>
                        <Text style={styles.logNo}>{i + 1}.</Text>
                        <Text style={styles.logEditor} numberOfLines={1}>{l.editor || '-'}</Text>
                        <Text style={styles.logAt}>{formatShortThaiDateTime(l.editedAt)}</Text>
                      </View>
                    ))
                  )}
                </Section>
              )}
            </ScrollView>
          )}
          {renderDebtPicker()}
          {renderCancelModal()}
          </View>
        </View>
      </Modal>
    );
  }

  // บันทึกผู้รับผิดชอบติดตามหนี้ แล้วอัปเดตรายการ/หน้ารายละเอียด/ประวัติแก้ไขทันที (ไม่ต้องโหลดใหม่ เหมือนเว็บ)
  // ปุ่ม ปิดจบ / ยกเลิกปิดจบ / ยกเลิกงาน — ตามคอลัมน์ "จัดการ" ของเว็บ (แสดงตามสถานะงาน)
  function renderJobActions(j: WipJob) {
    if (isCanceled(j)) return null;
    const busy = actionBusyId === j.id;
    if (isFinished(j)) {
      return (
        <View style={styles.cardBtnRow}>
          <TouchableOpacity style={[styles.cardBtn, styles.actBtnAmber]} disabled={busy} onPress={() => confirmJobAction(j, 'undo_close')} accessibilityLabel="ยกเลิกปิดจบหน้างาน">
            {busy ? <ActivityIndicator size="small" color={AMBER} /> : <Ionicons name="arrow-undo" size={14} color={AMBER} />}
            <Text style={[styles.cardBtnText, { color: AMBER }]} numberOfLines={1}>ยกเลิกปิดจบหน้างาน</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.cardBtnRow}>
        <TouchableOpacity style={[styles.cardBtn, styles.actBtnGreen]} disabled={busy} onPress={() => confirmJobAction(j, 'close_job')} accessibilityLabel="ปิดจบหน้างาน">
          {busy ? <ActivityIndicator size="small" color={GREEN} /> : <Ionicons name="flag" size={14} color={GREEN} />}
          <Text style={[styles.cardBtnText, { color: GREEN }]} numberOfLines={1}>ปิดจบหน้างาน</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.cardBtn, styles.actBtnRed]} disabled={busy} onPress={() => setCancelJob({ job: j, reason: '', saving: false })} accessibilityLabel="ยกเลิกงาน">
          <Ionicons name="ban" size={14} color={RED} />
          <Text style={[styles.cardBtnText, { color: RED }]} numberOfLines={1}>ยกเลิกงาน</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const jobLabel = (j: WipJob) => [j.siteNo, j.projectName].filter(Boolean).join(' ') || 'รายการนี้';

  // ยืนยันก่อนทำ (ข้อความเดียวกับ Swal ของเว็บ) แล้วโหลดใหม่ให้ KPI ตรงกับเว็บ
  function confirmJobAction(j: WipJob, action: 'close_job' | 'undo_close') {
    const isClose = action === 'close_job';
    Alert.alert(
      isClose ? 'ยืนยันปิดจบหน้างาน?' : 'ยืนยันยกเลิกปิดจบหน้างาน?',
      isClose
        ? `คุณกำลังจะเปลี่ยนสถานะ\n${jobLabel(j)}\nให้กลายเป็น "ปิดจบหน้างาน" ใช่หรือไม่?`
        : `คุณกำลังจะยกเลิกการปิดจบหน้างานของ\n${jobLabel(j)}\nสถานะจะกลับไปเป็น "สัญญาจ้าง" ใช่หรือไม่?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: isClose ? 'ใช่, ปิดจบเลย' : 'ใช่, ยกเลิกปิดจบ', onPress: () => void runJobAction(j, action) },
      ]
    );
  }

  async function runJobAction(j: WipJob, action: 'close_job' | 'undo_close' | 'cancel_job', reason = '') {
    if (!user?.id) return;
    setActionBusyId(j.id);
    try {
      const res = await apiMobilePost(WIP_API_URL, action, { user_id: user.id, id: j.id, ...(action === 'cancel_job' ? { cancel_reason: reason } : {}) });
      const nasMsg = str(res.nas_sync?.message);
      const title = action === 'close_job' ? 'ปิดจบหน้างานเรียบร้อย' : action === 'undo_close' ? 'ยกเลิกปิดจบหน้างานสำเร็จ' : 'ยกเลิกงานเรียบร้อย';
      Alert.alert(title, nasMsg || undefined);
      setDetail(null);
      await load(true);
    } catch (e: any) {
      Alert.alert('เกิดข้อผิดพลาด', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    } finally {
      setActionBusyId(null);
    }
  }

  async function submitCancel() {
    const j = cancelJob.job;
    const reason = cancelJob.reason.trim();
    if (!j) return;
    if (!reason) {
      Alert.alert('กรุณาระบุเหตุผล', 'ต้องระบุหมายเหตุ/เหตุผลในการยกเลิก');
      return;
    }
    setCancelJob((s) => ({ ...s, saving: true }));
    await runJobAction(j, 'cancel_job', reason);
    setCancelJob({ job: null, reason: '', saving: false });
  }

  // ป๊อปอัพกรอกเหตุผลยกเลิกงาน (เว็บบังคับกรอก)
  function renderCancelModal() {
    const j = cancelJob.job;
    const close = () => {
      if (!cancelJob.saving) setCancelJob({ job: null, reason: '', saving: false });
    };
    return (
      <Modal visible={!!j} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHead}>
              <Ionicons name="ban" size={18} color={RED} />
              <Text style={styles.pickerTitle}>ยืนยันการยกเลิกงาน?</Text>
              <TouchableOpacity onPress={close} hitSlop={8} accessibilityLabel="ปิด">
                <Ionicons name="close" size={20} color={GRAY} />
              </TouchableOpacity>
            </View>
            {!!j && <Text style={styles.pickerSub} numberOfLines={2}>{jobLabel(j)}</Text>}
            <Text style={styles.cancelHint}>ไม่ลบข้อมูล แต่งานนี้จะไม่ถูกนำไปคำนวณ</Text>
            <TextInput
              value={cancelJob.reason}
              onChangeText={(v) => setCancelJob((s) => ({ ...s, reason: v }))}
              placeholder="ระบุหมายเหตุ/เหตุผลในการยกเลิก *"
              placeholderTextColor="#94a3b8"
              multiline
              style={styles.cancelInput}
              editable={!cancelJob.saving}
            />
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.sheetResetBtn} onPress={close} disabled={cancelJob.saving}>
                <Text style={styles.sheetResetText}>ปิด</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetApplyBtn, { backgroundColor: RED }]} onPress={submitCancel} disabled={cancelJob.saving}>
                {cancelJob.saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.sheetApplyText}>ยืนยันยกเลิกงาน</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  async function openHistory(kind: 'canceled' | 'undo') {
    if (!user?.id) return;
    setHistoryPopup({ kind, loading: true, list: [], error: null });
    try {
      const res = await apiMobileGet(WIP_API_URL, kind === 'canceled' ? 'get_canceled_history' : 'get_undo_history', { user_id: user.id, year });
      setHistoryPopup({ kind, loading: false, list: Array.isArray(res.list) ? res.list : [], error: null });
    } catch (e: any) {
      setHistoryPopup({ kind, loading: false, list: [], error: e?.message || 'โหลดประวัติไม่สำเร็จ' });
    }
  }

  function renderHistoryPopup() {
    const h = historyPopup;
    const close = () => setHistoryPopup({ kind: null, loading: false, list: [], error: null });
    const isCanceledList = h.kind === 'canceled';
    return (
      <Modal visible={!!h.kind} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
          <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeadRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{isCanceledList ? 'ประวัติงานที่ถูกยกเลิก' : 'ประวัติการยกเลิกปิดจบหน้างาน'}</Text>
                <Text style={styles.cardSub}>ปีชีท {ceYear(year)} · {h.loading ? '…' : h.list.length} รายการ</Text>
              </View>
              <TouchableOpacity onPress={close} hitSlop={8} accessibilityLabel="ปิด">
                <Ionicons name="close" size={22} color={GRAY} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              {h.loading ? (
                <ActivityIndicator color={PRIMARY} style={{ paddingVertical: 24 }} />
              ) : h.error ? (
                <Text style={[styles.emptyText, { color: RED }]}>{h.error}</Text>
              ) : h.list.length === 0 ? (
                <Text style={styles.emptyText}>ไม่มีประวัติ</Text>
              ) : (
                h.list.map((x: any, i: number) => (
                  <View key={i} style={styles.histRow}>
                    <View style={styles.histHead}>
                      <View style={styles.codeBadge}>
                        <Text style={styles.codeBadgeText}>{str(x.site_no) || '-'}</Text>
                      </View>
                      <Text style={styles.cardComp} numberOfLines={1}>{compName(str(x.company))}</Text>
                      {isCanceledList && x.budget !== null && x.budget !== undefined && (
                        <Text style={styles.histBudget}>฿{money(num(x.budget))}</Text>
                      )}
                    </View>
                    <Text style={styles.histTitle} numberOfLines={2}>{str(x.project_name) || '-'}</Text>
                    {isCanceledList ? (
                      <>
                        {!!str(x.cancel_reason) && <Text style={styles.histText}>เหตุผล: {str(x.cancel_reason)}</Text>}
                        <Text style={styles.histMeta}>ยกเลิกโดย {str(x.canceled_by) || '-'}</Text>
                      </>
                    ) : (
                      <Text style={styles.histMeta}>
                        {str(x.performed_by) || '-'}
                        {x.created_at ? ` · ${formatShortThaiDateTime(str(x.created_at))}` : ''}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  async function saveDebtOwner(name: string) {
    const job = debtPicker.job;
    if (!job || !user?.id) return;
    setDebtPicker((s) => ({ ...s, saving: true }));
    try {
      const res = await apiMobilePost(WIP_API_URL, 'save_debt_owner', { user_id: user.id, id: job.id, debt_user: name });
      const debtName = str(res.debt_name) || name;
      const debtType = str(res.debt_type) || 'บุคคล';
      const editor = str(res.editor);
      const patch = (x: WipJob): WipJob => ({ ...x, debtName, debtType, lastEditor: editor || x.lastEditor, editCount: x.editCount + 1 });
      setJobs((list) => list.map((x) => (x.id === job.id ? patch(x) : x)));
      setDetail((d) => (d && d.id === job.id ? patch(d) : d));
      const now = new Date();
      const p2 = (n: number) => String(n).padStart(2, '0');
      const nowStr = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
      setEditLogs((logs) => [...(logs ?? []), { editor, editedAt: nowStr }]);
      setDebtPresent((list) => (list.includes(debtName) ? list : [...list, debtName].sort((a, b) => a.localeCompare(b, 'th'))));
      setDebtPicker({ job: null, search: '', saving: false });
    } catch (e: any) {
      setDebtPicker((s) => ({ ...s, saving: false }));
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // ป๊อปอัพเลือกผู้รับผิดชอบ — render "ใน" โมดัลรายละเอียด ให้ซ้อนอยู่ด้านบนบน Android
  function renderDebtPicker() {
    const job = debtPicker.job;
    const q = debtPicker.search.trim().toLowerCase();
    const list = debtUsers.filter((n) => !q || n.toLowerCase().includes(q));
    const close = () => {
      if (!debtPicker.saving) setDebtPicker({ job: null, search: '', saving: false });
    };
    return (
      <Modal visible={!!job} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHead}>
              <Ionicons name="person-circle" size={18} color={PRIMARY} />
              <Text style={styles.pickerTitle}>ผู้รับผิดชอบติดตามหนี้</Text>
              <TouchableOpacity onPress={close} hitSlop={8} accessibilityLabel="ปิด">
                <Ionicons name="close" size={20} color={GRAY} />
              </TouchableOpacity>
            </View>
            {!!job && (
              <Text style={styles.pickerSub} numberOfLines={1}>
                หน้างาน {job.siteNo || '-'} · {job.projectName || job.agency || '-'}
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
                    const current = job?.debtType !== 'ทีม' && job?.debtName === n;
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
    const JS: JobStatusFilter[] = ['all', 'สัญญาจ้าง', '__not_closed__', 'ปิดจบหน้างาน', 'ชำระเรียบร้อย', 'ยกเลิก'];
    // จำนวนในตัวเลือกนับเฉพาะงานที่ไม่ยกเลิก ให้ตรงกับรายการที่เห็น (งานยกเลิกดูได้ผ่านตัวกรอง "ยกเลิก")
    const activeJobs = jobs.filter((j) => !isCanceled(j));
    const CD: CountdownFilter[] = ['all', 'normal', 'warning', 'danger'];
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
              {group('pricetag', 'สถานะงาน', JS.map((s) => opt(s, JOB_STATUS_LABEL[s], jobStatusFilter === s, () => setJobStatusFilter(s), s === 'ยกเลิก' ? jobs.filter(isCanceled).length : undefined)))}
              {group('hourglass', 'สถานะนับถอยหลัง', CD.map((s) => opt(s, COUNTDOWN_LABEL[s], countdownFilter === s, () => setCountdownFilter(s))))}
              {group('shield-half', 'การรับประกัน', [
                opt('', 'ทั้งหมด', warrantyFlag === '', () => setWarrantyFlag('')),
                opt('near', 'ใกล้หมดประกัน', warrantyFlag === 'near', () => setWarrantyFlag('near')),
                opt('expired', 'หมดประกันแล้ว', warrantyFlag === 'expired', () => setWarrantyFlag('expired')),
              ])}
              {companies.length > 0 &&
                group('business', 'บริษัท', [
                  opt('', 'ทั้งหมด', companyFilter === '', () => setCompanyFilter('')),
                  ...companies.map((c) => opt(c.company, c.name, companyFilter === c.company, () => setCompanyFilter(c.company), activeJobs.filter((j) => j.company === c.company).length)),
                ])}
              {jobTypes.length > 0 &&
                group('construct', 'ประเภทงาน', [
                  opt('', 'ทั้งหมด', jobTypeFilter === '', () => setJobTypeFilter('')),
                  ...jobTypes.map((t) => opt(t, t, jobTypeFilter === t, () => setJobTypeFilter(t), activeJobs.filter((j) => j.jobType === t).length)),
                ])}
              {group('person', 'ผู้รับผิดชอบติดตามหนี้', [
                opt('', 'ทั้งหมด', debtFilter === '', () => setDebtFilter('')),
                opt('__none__', 'ยังไม่ระบุ', debtFilter === '__none__', () => setDebtFilter('__none__'), activeJobs.filter((j) => !j.debtName).length),
                ...debtPresent.map((d) => opt(d, d, debtFilter === d, () => setDebtFilter(d), activeJobs.filter((j) => j.debtName === d).length)),
              ])}
              {group(
                'flag',
                'วันที่ปิดจบหน้างาน',
                <View style={styles.rangeRow}>
                  <View style={{ flex: 1 }}>
                    <DateField value={closedStart} onChange={(v) => setClosedRange(v, closedEnd)} placeholder="ตั้งแต่" maximumDate={ymdToDate(closedEnd) ?? undefined} />
                  </View>
                  <Text style={styles.rangeTo}>ถึง</Text>
                  <View style={{ flex: 1 }}>
                    <DateField value={closedEnd} onChange={(v) => setClosedRange(closedStart, v)} placeholder="ถึง" minimumDate={ymdToDate(closedStart) ?? undefined} />
                  </View>
                  {(!!closedStart || !!closedEnd) && (
                    <TouchableOpacity onPress={() => (setClosedStart(''), setClosedEnd(''))} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color="#cbd5e1" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
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

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <View style={styles.topBarSearch}>
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="ค้นหาหน่วยงาน, โครงการ, เลขที่สัญญา..."
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#cbd5e1" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.topBarBtn} onPress={() => setSortAsc((v) => !v)} accessibilityLabel="เรียงหน้างาน">
            <Ionicons name={sortAsc ? 'arrow-up' : 'arrow-down'} size={18} color="#475569" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topBarBtn, chips.length > 0 && styles.topBarBtnActive]} onPress={() => setFilterSheetOpen(true)} accessibilityLabel="ตัวกรอง">
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
          {renderYearTabs()}
          {renderSummary()}
          {renderCompanies()}
          {/* ปุ่มประวัติบนหัวตารางเว็บ: งานที่ถูกยกเลิก / การยกเลิกปิดจบหน้างาน (ตามปีชีทที่เลือก) */}
          <View style={[styles.cardBtnRow, { marginHorizontal: 14, marginTop: 12 }]}>
            <TouchableOpacity style={styles.cardBtn} onPress={() => openHistory('canceled')} accessibilityLabel="ประวัติงานที่ถูกยกเลิก">
              <Ionicons name="ban" size={14} color={GRAY} />
              <Text style={styles.cardBtnText} numberOfLines={1}>ประวัติงานที่ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardBtn} onPress={() => openHistory('undo')} accessibilityLabel="ประวัติยกเลิกปิดจบหน้างาน">
              <Ionicons name="arrow-undo" size={14} color={AMBER} />
              <Text style={[styles.cardBtnText, { color: AMBER }]} numberOfLines={1}>ประวัติยกเลิกปิดจบ</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.resultText}>
            พบ {filtered.length.toLocaleString('en-US')} งาน · เรียงหน้างาน{sortAsc ? 'น้อย→มาก' : 'มาก→น้อย'}
          </Text>
          {pageRows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="file-tray-outline" size={28} color="#cbd5e1" />
              <Text style={styles.emptyText}>{jobs.length === 0 ? 'ยังไม่มีงานในปีนี้' : 'ไม่พบรายการตามตัวกรอง'}</Text>
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
      {!detail && renderDebtPicker()}
      {!detail && renderCancelModal()}
      {renderHistoryPopup()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  quickRow: { gap: 8, paddingTop: 12, paddingBottom: 2 },
  quickChip: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8 },
  quickChipLabel: { flexShrink: 1, fontSize: 12, fontWeight: '700', color: '#334155' },
  quickChipCount: { minWidth: 22, borderRadius: 11, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' },
  quickChipCountText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  summaryToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8, paddingVertical: 6 },
  summaryToggleText: { fontSize: 12, fontWeight: '800', color: PRIMARY },
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

  yearRow: { paddingHorizontal: 14, paddingTop: 12, gap: 8 },
  yearTab: { height: 42, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', paddingHorizontal: 14, justifyContent: 'center' },
  yearTabActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  yearTabText: { fontSize: 12.5, fontWeight: '800', color: '#334155' },

  summaryCard: { marginHorizontal: 14, marginTop: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden', paddingHorizontal: 12, paddingBottom: 12 },
  summaryTopBar: { height: 4, marginHorizontal: -12, backgroundColor: PRIMARY },
  summaryTotalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14 },
  summaryIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { color: GRAY, fontSize: 12, fontWeight: '700' },
  summaryValue: { color: '#0f172a', fontSize: 22, fontWeight: '900', marginTop: 2 },
  summarySub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  kpiHint: { fontSize: 10.5, color: '#94a3b8', marginTop: 12, marginBottom: 8 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  kpiGroupTitle: { fontSize: 12, fontWeight: '900', color: '#334155', marginTop: 10, marginBottom: 6 },
  kpiBox: { width: '48.8%', minHeight: 66, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', borderTopWidth: 4, paddingHorizontal: 9, paddingVertical: 8, gap: 4 },
  tapHintIcon: { position: 'absolute', top: 6, right: 7 },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
  kpiLabel: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  kpiValue: { color: '#0f172a', fontSize: 19, fontWeight: '900', marginTop: 'auto' },
  kpiUnit: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  kpiExtra: { fontSize: 10.5, fontWeight: '700', color: RED },

  compRow: { paddingHorizontal: 14, paddingTop: 12, gap: 8 },
  compCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 9 },
  compCardActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  compName: { fontSize: 12.5, fontWeight: '900', color: '#0f172a' },
  compCount: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginTop: 2 },
  compBudget: { fontSize: 11, color: GRAY, marginTop: 1 },

  resultText: { marginHorizontal: 16, marginTop: 14, marginBottom: 2, fontSize: 12, color: GRAY, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 12.5, textAlign: 'center', paddingVertical: 8 },

  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 14, marginTop: 10, padding: 13, borderWidth: 1, borderColor: '#e2e8f0' },
  cardCanceled: { opacity: 0.6, backgroundColor: '#f8fafc' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codeBadge: { backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  codeBadgeText: { color: '#4338ca', fontSize: 12, fontWeight: '900' },
  cardComp: { flex: 1, fontSize: 11, color: GRAY, fontWeight: '700' },
  stateChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3 },
  stateChipText: { fontSize: 10.5, fontWeight: '800' },
  cardTitle: { color: '#0f172a', fontSize: 14, fontWeight: '800', lineHeight: 20, marginTop: 10 },
  cardSub: { color: GRAY, fontSize: 11.5, marginTop: 3 },
  strike: { textDecorationLine: 'line-through' },
  cardMoneyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  cardValue: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  cdBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '62%' },
  cdBadgeText: { fontSize: 10.5, fontWeight: '900', flexShrink: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaText: { fontSize: 11, color: '#475569', fontWeight: '600', flexShrink: 1 },

  detailOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  detailSheet: { flex: 1, backgroundColor: '#f8fafc', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  detailGrip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginTop: 8, marginBottom: 2 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8fafc', paddingLeft: 16, paddingRight: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  detailHeaderTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: '#0f172a' },
  detailScroll: { padding: 14, paddingBottom: 32, gap: 12 },
  cancelBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: 10 },
  cancelBoxText: { flex: 1, color: '#991b1b', fontSize: 12, fontWeight: '700', lineHeight: 18 },
  section: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: '#c7d2fe', paddingHorizontal: 12, paddingBottom: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  infoLabel: { fontSize: 12, color: '#475569', fontWeight: '600', flexShrink: 1, lineHeight: 18 },
  infoValue: { flex: 1, fontSize: 12.5, color: '#0f172a', fontWeight: '800', textAlign: 'right', lineHeight: 18 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  logNo: { width: 22, fontSize: 11.5, color: GRAY, fontWeight: '700' },
  logEditor: { flex: 1, fontSize: 12.5, color: '#0f172a', fontWeight: '800' },
  logAt: { fontSize: 11, color: GRAY },
  infoLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, width: '38%', flexShrink: 0 },
  infoSub: { fontSize: 10.5, color: '#94a3b8', textAlign: 'right', marginTop: 2 },
  cardBtnRow: { flexDirection: 'row', gap: 8 },
  cardBtn: { flex: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', paddingHorizontal: 8 },
  cardBtnText: { flexShrink: 1, fontSize: 12, fontWeight: '800', color: '#334155' },
  actBtnGreen: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  actBtnAmber: { backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  actBtnRed: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  cancelHint: { fontSize: 11.5, color: GRAY, marginBottom: 8 },
  cancelInput: { minHeight: 80, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#f8fafc', padding: 10, fontSize: 13, color: '#0f172a', textAlignVertical: 'top' },
  histRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 4 },
  histHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  histBudget: { fontSize: 12, fontWeight: '900', color: '#0f172a' },
  histTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  histText: { fontSize: 12, color: '#334155' },
  histMeta: { fontSize: 11, color: '#94a3b8' },
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
