import { Ionicons } from '@expo/vector-icons';
// ปรับ path เหล่านี้ให้ตรงกับตำแหน่งไฟล์จริงในโปรเจกต์ ถ้าไม่ได้วางไว้โฟลเดอร์เดียวกัน
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../_layout';
// ✅ Config
import { API_MODULES } from '../../constants/config';
import { apiMobileGet, apiMobilePost } from '../service/api_mobile';

import ProjectAccountingScreen from './projectaccounting';
import ProjectFollowupScreen from './projectfollowup';

/**
 * แดชบอร์ดบัญชีลูกหนี้ (mobile) — เชื่อม accounting_API_mobile.php ตัวจริง
 * ตามสเปกใน mobile_api/docs/README_accounting.md
 *
 * action ที่ใช้จริง: get_dashboard (การ์ด KPI รวม + แยกบริษัท), get_list (รายการ),
 * get_detail (popup "ดูข้อมูล" — ดึงตอนเปิดเท่านั้น ไม่ฝังมากับ get_list), save_debt_owner
 *
 * ตัด "ทำเครื่องหมายจ่ายแล้ว" (mark_paid) และปุ่ม Export ออกทั้งคู่ — ไม่มี action เหล่านี้ใน
 * accounting_API_mobile.php เลย (เอกสารข้อ 8 ระบุชัดว่า Export ไม่ได้ทำเป็น endpoint ฝั่งเซิร์ฟเวอร์
 * ส่วนสถานะ "ชำระเรียบร้อย" เป็นผลคำนวณอัตโนมัติจากยอดจ่าย ไม่ใช่ปุ่มกดบันทึกเอง) ปุ่ม "ติดตาม"/
 * "ลงบัญชี" ยังอยู่ครบเพราะพาไปหน้าจอจริงอื่น (ProjectFollowupScreen / ProjectAccountingScreen)
 */

const ACCOUNTING_API_URL = `${API_MODULES}/accounting_API_mobile.php`;

type FollowState = 'not_started' | 'following' | 'closed';
type PayState = 'none' | 'paid';

// ตรงกับ kpi_all ของ get_dashboard (README_accounting.md ข้อ 4.2)
type Summary = {
  initialBudget: number;
  debtorsDue: number;
  outstanding: number;
  jobsWithPayment: number;
  totalReceived: number;
  netReceived: number;
  receivedToday: number;
  wipJobs: number;
  wipAmount: number;
};

const EMPTY_SUMMARY: Summary = {
  initialBudget: 0, debtorsDue: 0, outstanding: 0, jobsWithPayment: 0,
  totalReceived: 0, netReceived: 0, receivedToday: 0, wipJobs: 0, wipAmount: 0,
};

function mapSummary(k: any): Summary {
  return {
    initialBudget: Number(k?.total_budget ?? 0),
    debtorsDue: Number(k?.debtor_customers_count ?? 0),
    outstanding: Number(k?.total_outstanding ?? 0),
    jobsWithPayment: Number(k?.projects_with_income ?? 0),
    totalReceived: Number(k?.total_received ?? 0),
    netReceived: Number(k?.total_net ?? 0),
    receivedToday: Number(k?.today_received ?? 0),
    wipJobs: Number(k?.wip_projects ?? 0),
    wipAmount: Number(k?.wip_budget ?? 0),
  };
}

// 🌟 [เพิ่มใหม่] ประเภทการค้ำประกัน — ใช้กำหนดว่า modal "ดูข้อมูล" จะโชว์ฟิลด์ไหนบ้าง
type GuaranteeType = 'ไม่มี' | 'หนังสือค้ำ' | 'เงินสด' | 'ค้ำแบบจนกว่าจะหมดภาระผูกพันธ์' | 'บริษัทค้ำประกัน';

// ตรงกับ detail{} ของ get_detail (README_accounting.md ข้อ 4.4) — ดึงตอนเปิด modal เท่านั้น
// (ไม่ได้ฝังมากับแถวของ get_list เพราะจะกลายเป็นยิง API ต่อแถวตอนโหลดลิสต์)
type ProjectDetail = {
  contractNo: string;
  contractFile?: string;
  startDate: string;
  endDate: string;
  countdownText: string;
  countdownTone: 'green' | 'amber' | 'red' | 'gray';
  customerAffiliation: string;
  contactPerson: string;
  contactPhone: string; // คั่นด้วย , เช่น "โทร: 08x-xxx-1234, LINE: @sample"
  customerAddress: string;
  guaranteeType: GuaranteeType;
  bankName: string;
  guaranteeNo: string;
  guaranteeAmount: number;
  guaranteePercent: number;
  guaranteeStart: string;
  guaranteeEnd: string;
  warranty: string;
};

function guaranteeTone(daysLeft: number | null, isFinished: boolean): 'green' | 'amber' | 'red' | 'gray' {
  if (isFinished) return 'gray';
  if (daysLeft === null) return 'amber';
  if (daysLeft < 0) return 'red';
  if (daysLeft <= 30) return 'amber';
  return 'green';
}

function mapProjectDetail(d: any): ProjectDetail {
  return {
    contractNo: String(d?.contract_no || d?.purchase_order_no || '-'),
    contractFile: d?.contract_file || undefined,
    startDate: String(d?.start_date_thai || d?.start_date || '-'),
    endDate: String(d?.end_date_thai || d?.end_date || '-'),
    countdownText: String(d?.contract_countdown || '-'),
    countdownTone: guaranteeTone(d?.contract_days_left ?? null, Boolean(d?.contract_is_finished)),
    customerAffiliation: String(d?.customer_affiliation || d?.customer_name || '-'),
    contactPerson: String(d?.contact_person || '-'),
    contactPhone: String(d?.contact_phone || ''),
    customerAddress: String(d?.customer_address || '-'),
    guaranteeType: (d?.guarantee_type || 'ไม่มี') as GuaranteeType,
    bankName: String(d?.bank_name || '-'),
    guaranteeNo: String(d?.guarantee_no || '-'),
    guaranteeAmount: Number(d?.guarantee_amount ?? 0),
    guaranteePercent: Number(d?.guarantee_percent ?? 0),
    guaranteeStart: String(d?.guarantee_start_date_thai || d?.guarantee_start_date || '-'),
    guaranteeEnd: String(d?.guarantee_end_date_thai || d?.guarantee_end_date || '-'),
    warranty: String(d?.warranty || '-'),
  };
}

// ตรงกับ 1 แถวของ get_list (README_accounting.md ข้อ 4.3) — ชื่อ field ในแอปคงไว้แบบเดิม
// เพื่อไม่ต้องแตะ UI ทั้งหมด แต่ mapProject() ด้านล่างอ่านจากคีย์ snake_case จริง
type Project = {
  id: string | number;
  jobNo: string;
  company: string;
  customer: string;
  projectName: string;
  owner: string; // debt_name — ผู้รับผิดชอบติดตามหนี้
  closedBy: string;
  closedAt?: string;
  initialBudget: number;
  paidAmount: number;
  outstanding: number;
  followState: FollowState;
  followDate?: string;
  payState: PayState;
  payDate?: string;
  note?: string;
};

function mapProject(raw: any): Project {
  const followClosed = Number(raw.follow_closed ?? 0) === 1;
  const followState: FollowState = followClosed
    ? 'closed'
    : String(raw.latest_follow_status_raw || '').trim() !== ''
      ? 'following'
      : 'not_started';
  return {
    id: raw.project_id ?? raw.id,
    jobNo: String(raw.display_code ?? ''),
    company: String(raw.company_name ?? ''),
    customer: String(raw.customer_name ?? ''),
    projectName: String(raw.project_name ?? ''),
    owner: String(raw.debt_name || 'ยังไม่ระบุ'),
    closedBy: String(raw.closed_by || '-'),
    closedAt: raw.closed_at_thai || undefined,
    initialBudget: Number(raw.project_budget ?? 0),
    paidAmount: Number(raw.total_received_amount ?? 0),
    outstanding: Number(raw.outstanding_amount ?? 0),
    followState,
    followDate: raw.latest_follow_at_thai || undefined,
    payState: raw.payment_state === 'paid_full' ? 'paid' : 'none',
    payDate: raw.latest_pay_at_thai || undefined,
    note: raw.display_remark && raw.display_remark !== '-' ? String(raw.display_remark) : undefined,
  };
}

type DashboardData = {
  summary: Summary;
  projects: Project[];
  companies: CompanyBreakdown[];
};

// 🌟 [เพิ่มใหม่] สรุป KPI ต่อบริษัทหนึ่งใบ (โครงสร้างเดียวกับ Summary รวม) — kpi_by_company[]
type CompanyBreakdown = {
  id: string;
  name: string;
  summary: Summary;
};

function mapCompanyBreakdown(c: any): CompanyBreakdown {
  return { id: String(c.company_id ?? ''), name: String(c.company_name ?? ''), summary: mapSummary(c) };
}

type Props = {
  onBackToMain?: () => void;
  onViewCompanyBreakdown?: () => void;
  onViewProject?: (project: Project) => void;
  onFollowProject?: (project: Project) => void;
  onRecordProject?: (project: Project) => void;
};

function num(value: number) {
  const decimals = value % 1 === 0 ? 0 : 2;
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/* ---------- การ์ดสรุปภาพรวม ---------- */

type StatTone = 'blue' | 'orange' | 'red' | 'teal' | 'green' | 'mint' | 'violet';

const statTone: Record<StatTone, { ink: string; edge: string }> = {
  blue: { ink: '#2f7fe0', edge: '#4a90ea' },
  orange: { ink: '#e08a12', edge: '#f0ad2b' },
  red: { ink: '#e8443f', edge: '#f4635c' },
  teal: { ink: '#0e9fb4', edge: '#2bb9cc' },
  green: { ink: '#12a35f', edge: '#2cba76' },
  mint: { ink: '#0e9f8c', edge: '#2bb9a6' },
  violet: { ink: '#7c4fdc', edge: '#9a71ea' },
};

function StatTile({
  icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  unit?: string;
  tone: StatTone;
}) {
  const color = statTone[tone];
  return (
    <View style={styles.tile}>
      <View style={[styles.tileEdge, { backgroundColor: color.edge }]} />
      <View style={styles.tileBody}>
        <View style={styles.tileLabelRow}>
          <Ionicons name={icon} size={14} color="#7d8a99" />
          <Text style={styles.tileLabel} numberOfLines={2}>{label}</Text>
        </View>
        <View style={styles.tileValueRow}>
          <Text style={[styles.tileValue, { color: color.ink }]}>{value}</Text>
          {unit ? <Text style={styles.tileUnit}>{unit}</Text> : null}
        </View>
      </View>
    </View>
  );
}

/* ---------- ป้ายสถานะ ---------- */

function FollowChip({ state }: { state: FollowState }) {
  const config = {
    not_started: { label: 'ยังไม่เคยติดตาม', color: '#93a2b3', bg: '#f6f8fa', border: '#dfe6ee', icon: 'remove-outline' as const },
    following: { label: 'กำลังติดตาม', color: '#c47f04', bg: '#fff6de', border: '#f2cf74', icon: 'time-outline' as const },
    closed: { label: 'ปิดติดตามแล้ว', color: '#5d7085', bg: '#eef2f6', border: '#dde5ee', icon: 'checkmark-circle-outline' as const },
  }[state];

  return (
    <View style={[styles.chip, { backgroundColor: config.bg, borderColor: config.border }]}>
      <Ionicons name={config.icon} size={14} color={config.color} />
      <Text style={[styles.chipText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

function PayChip({ state }: { state: PayState }) {
  const config = state === 'paid'
    ? { label: 'จ่ายเงินครบแล้ว (ปิดยอด)', color: '#0e8f60', bg: '#e5f8ee', border: '#a9e2c4', icon: 'checkmark-circle' as const }
    : { label: 'ยังไม่มีสถานะจ่ายเงิน', color: '#93a2b3', bg: '#f6f8fa', border: '#dfe6ee', icon: 'remove-outline' as const };

  return (
    <View style={[styles.chip, { backgroundColor: config.bg, borderColor: config.border }]}>
      <Ionicons name={config.icon} size={14} color={config.color} />
      <Text style={[styles.chipText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

function DateHint({ date }: { date?: string }) {
  if (date) return <Text style={styles.dateHint}>{date}</Text>;
  return (
    <View style={styles.noDate}>
      <Ionicons name="help-circle" size={13} color="#e79a2b" />
      <Text style={styles.noDateText}>ไม่มีวันที่</Text>
    </View>
  );
}

/* ---------- การ์ดรายโครงการ ---------- */

function ProjectCard({
  item,
  busy,
  onView,
  onFollow,
  onRecord,
}: {
  item: Project;
  busy: boolean;
  onView: () => void;
  onFollow: () => void;
  onRecord: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View>
          <Text style={styles.jobLabel}>เลขหน้างาน</Text>
          <Text style={styles.jobNo}>{item.jobNo}</Text>
        </View>
        <View style={styles.cardHeadRight}>
          <Text style={styles.company}>{item.company}</Text>
          <Text style={styles.customer}>ลูกค้า: {item.customer}</Text>
        </View>
      </View>

      <Text style={styles.projectName} numberOfLines={2}>{item.projectName}</Text>

      <View style={styles.peopleRow}>
        <View style={styles.ownerChip}>
          <Ionicons name="person" size={12} color="#2b6fd6" />
          <Text style={styles.ownerText} numberOfLines={1}>{item.owner}</Text>
        </View>
        <View style={styles.closedBlock}>
          <Text style={styles.microLabel}>ปิดจบโดย</Text>
          <Text style={styles.closedBy}>{item.closedBy}</Text>
          <Text style={styles.closedAt}>{item.closedAt ?? 'ยังไม่ปิดจบ'}</Text>
        </View>
      </View>

      <View style={styles.moneyGrid}>
        <View style={styles.moneyCell}>
          <Text style={styles.microLabel}>งบตั้งต้น</Text>
          <Text style={styles.moneyValue}>{num(item.initialBudget)}</Text>
        </View>
        <View style={styles.moneyCell}>
          <Text style={styles.microLabel}>ยอดจ่าย</Text>
          <Text style={styles.moneyValue}>{num(item.paidAmount)}</Text>
        </View>
        <View style={styles.moneyCell}>
          <Text style={styles.microLabel}>ค้างชำระ</Text>
          <Text style={[styles.moneyValue, item.outstanding > 0 && styles.moneyDanger]}>{num(item.outstanding)}</Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusCol}>
          <Text style={styles.microLabel}>สถานะติดตาม</Text>
          <FollowChip state={item.followState} />
          {item.followState === 'closed'
            ? <Text style={styles.flagText}>⚑ เก็บเงินครบแล้ว</Text>
            : <DateHint date={item.followDate} />}
        </View>
        <View style={styles.statusCol}>
          <Text style={styles.microLabel}>สถานะจ่ายเงิน</Text>
          <PayChip state={item.payState} />
          <DateHint date={item.payDate} />
        </View>
      </View>

      {item.note ? (
        <View style={styles.note}>
          <Text style={styles.noteLabel}>หมายเหตุ</Text>
          <Text style={styles.noteText}>{item.note}</Text>
        </View>
      ) : null}

      <View style={styles.cardActions}>
        <Pressable
          onPress={onView}
          disabled={busy}
          style={({ pressed }) => [styles.rowAction, styles.viewAction, pressed && styles.pressed, busy && styles.disabled]}
        >
          <Ionicons name="eye" size={15} color="#ffffff" />
          <Text style={styles.rowActionText}>ดูข้อมูล</Text>
        </Pressable>
        <Pressable
          onPress={onFollow}
          disabled={busy}
          style={({ pressed }) => [styles.rowAction, styles.followAction, pressed && styles.pressed, busy && styles.disabled]}
        >
          <Ionicons name="headset" size={15} color="#ffffff" />
          <Text style={styles.rowActionText}>ติดตาม</Text>
        </Pressable>
        <Pressable
          onPress={onRecord}
          disabled={busy}
          style={({ pressed }) => [styles.rowAction, styles.recordAction, pressed && styles.pressed, busy && styles.disabled]}
        >
          {busy ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="create" size={15} color="#ffffff" />}
          <Text style={styles.rowActionText}>ลงบัญชี</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------- หน้าหลัก ---------- */

const STATUS_FILTERS = ['ทุกสถานะ', 'ยังไม่เคยติดตาม', 'กำลังติดตาม', 'ปิดติดตามแล้ว', 'จ่ายเงินครบแล้ว'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function AccountingDashboard({
  onBackToMain,
  onViewCompanyBreakdown,
  onViewProject,
  onFollowProject,
  onRecordProject,
}: Props) {
  const { user } = useAuth();
  const userId = user?.id;

  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [companies, setCompanies] = useState<CompanyBreakdown[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 🌟 modal "ดูข้อมูล" — ดึง get_detail ตอนเปิด modal เท่านั้น (ไม่ฝังกับ get_list)
  const [detailModal, setDetailModal] = useState<{ visible: boolean; project?: Project; loading: boolean; detail?: ProjectDetail }>({
    visible: false,
    loading: false,
  });

  // 🌟 สลับไปหน้า "ติดตาม"/"ลงบัญชี" เองภายในไฟล์นี้เมื่อไม่มี onFollowProject/onRecordProject จากภายนอก
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'followup' | 'accounting'>('dashboard');
  const [activeProjectId, setActiveProjectId] = useState<string | number | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ทุกสถานะ');
  const [statusOpen, setStatusOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [followFrom, setFollowFrom] = useState('');
  const [followTo, setFollowTo] = useState('');
  const [payFrom, setPayFrom] = useState('');
  const [payTo, setPayTo] = useState('');

  // 🌟 [เพิ่มใหม่] state ของส่วน "ดูข้อมูลบัญชีแยกตามบริษัท" — ตรงกับ
  // masterCompanyContainer(collapsed)/currentCompanyFilter/toggleCompanyCard ของต้นฉบับ
  const [breakdownExpanded, setBreakdownExpanded] = useState(false);
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [collapsedCompanyIds, setCollapsedCompanyIds] = useState<Set<string>>(new Set());

  const asOfDate = useMemo(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }, []);

  // get_dashboard — README_accounting.md ข้อ 4.2 (kpi_all + kpi_by_company)
  const load = useCallback(async (refresh = false) => {
    if (!userId) return;
    refresh ? setRefreshing(true) : setLoading(true);
    setOffline(false);
    try {
      const [dash, list] = await Promise.all([
        apiMobileGet(ACCOUNTING_API_URL, 'get_dashboard', { user_id: userId, year: selectedYear }),
        apiMobileGet(ACCOUNTING_API_URL, 'get_list', { user_id: userId, year: selectedYear, limit: 500 }),
      ]);
      setSummary(mapSummary(dash.kpi_all));
      setCompanies(Array.isArray(dash.kpi_by_company) ? dash.kpi_by_company.map(mapCompanyBreakdown) : []);
      setProjectList(Array.isArray(list.list) ? list.list.map(mapProject) : []);
    } catch (e) {
      console.error('accounting_API_mobile load failed', e);
      setOffline(true);
    } finally {
      refresh ? setRefreshing(false) : setLoading(false);
    }
  }, [userId, selectedYear]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const projects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projectList.filter((item) => {
      const haystack = `${item.jobNo} ${item.company} ${item.customer} ${item.projectName} ${item.owner} ${item.closedBy}`.toLowerCase();
      const matchesTerm = !term || haystack.includes(term);
      const matchesStatus =
        statusFilter === 'ทุกสถานะ' ? true
        : statusFilter === 'จ่ายเงินครบแล้ว' ? item.payState === 'paid'
        : statusFilter === 'ยังไม่เคยติดตาม' ? item.followState === 'not_started'
        : statusFilter === 'กำลังติดตาม' ? item.followState === 'following'
        : item.followState === 'closed';
      // 🌟 [เพิ่มใหม่] กรองตามบริษัทที่เลือกจากการ์ดใน "ข้อมูลแยกตามบริษัท"
      const matchesCompany = companyFilter === 'all' || item.company === companyFilter;
      return matchesTerm && matchesStatus && matchesCompany;
    });
  }, [projectList, search, statusFilter, companyFilter]);

  // 🌟 [เพิ่มใหม่] ปุ่ม "ดูข้อมูล" — ถ้ามี prop จากภายนอกให้ใช้ตามนั้น ไม่งั้นเปิด modal + ยิง
  // get_detail(project_id) ตอนนี้เอง (ของจริงก็เป็น modal ในหน้าเดียวกัน — openDetailsModal ในต้นฉบับ)
  const handleView = async (project: Project) => {
    if (onViewProject) return onViewProject(project);
    setDetailModal({ visible: true, project, loading: true });
    if (!userId) return;
    try {
      const res = await apiMobileGet(ACCOUNTING_API_URL, 'get_detail', { user_id: userId, project_id: project.id });
      setDetailModal((s) => (s.project?.id === project.id ? { ...s, loading: false, detail: mapProjectDetail(res.detail) } : s));
    } catch (e) {
      console.error('accounting_API_mobile get_detail failed', e);
      setDetailModal((s) => (s.project?.id === project.id ? { ...s, loading: false } : s));
    }
  };

  // 🌟 [เพิ่มใหม่] ปุ่ม "ติดตาม" — ตอนนี้มีสกรีนจริงแล้ว (ProjectFollowupScreen) จึงสลับมาแสดง
  // ในไฟล์นี้เลยเมื่อไม่มี onFollowProject จากภายนอก
  const handleFollow = (project: Project) => {
    if (onFollowProject) return onFollowProject(project);
    setActiveProjectId(project.id);
    setActiveScreen('followup');
  };

  const handleRecord = (project: Project) => {
    setBusyId(project.id);
    try {
      if (onRecordProject) return onRecordProject(project);
      // 🌟 [เพิ่มใหม่] ตอนนี้มีสกรีนจริงแล้ว (ProjectAccountingScreen) — mockup นี้ยังไม่ได้ทำ
      // ระบบสิทธิ์ can_do_accounting ของต้นฉบับ จึงโชว์ปุ่มนี้เสมอ
      setActiveProjectId(project.id);
      setActiveScreen('accounting');
    } finally {
      setBusyId(null);
    }
  };

  const clearAllFilters = () => {
    setFollowFrom('');
    setFollowTo('');
    setPayFrom('');
    setPayTo('');
    setStatusFilter('ทุกสถานะ');
    setSearch('');
  };

  // 🌟 [เพิ่มใหม่] ปุ่ม "ดูข้อมูลบัญชีแยกตามบริษัท" — ถ้ามี prop จากภายนอกให้ใช้ตามนั้น (เผื่อ
  // อยากพาไปหน้าจอแยกจริงๆ ในอนาคต) ไม่งั้น toggle ส่วนที่ฝังอยู่ในหน้านี้เลย ตรงกับ
  // toggleMasterCompany() ของต้นฉบับที่แค่ toggle class 'collapsed' บนหน้าเดิม
  const handleToggleBreakdown = () => {
    if (onViewCompanyBreakdown) return onViewCompanyBreakdown();
    setBreakdownExpanded((v) => !v);
  };

  // ตรงกับ filterByCompany() ของต้นฉบับ — 'all' = ภาพรวมทุกบริษัท
  const handleSelectCompany = (id: string) => {
    setCompanyFilter(id);
  };

  // ตรงกับ toggleCompanyCard() ของต้นฉบับ — ย่อ/ขยายการ์ดของบริษัทเดียว (ไม่กระทบตัวกรอง)
  const toggleCompanyCardCollapse = (id: string) => {
    setCollapsedCompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (activeScreen === 'followup' && activeProjectId !== null) {
    return <ProjectFollowupScreen id={String(activeProjectId)} onBack={() => setActiveScreen('dashboard')} onSaved={() => setActiveScreen('dashboard')} />;
  }
  if (activeScreen === 'accounting' && activeProjectId !== null) {
    return <ProjectAccountingScreen id={String(activeProjectId)} onBack={() => setActiveScreen('dashboard')} onSaved={() => setActiveScreen('dashboard')} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#eef2f6" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#0e9fb4" />}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.titleIcon}>
              <Ionicons name="document-text" size={20} color="#0e9fb4" />
            </View>
            <View style={styles.titleCopy}>
              <Text style={styles.title}>แดชบอร์ดบัญชีลูกหนี้</Text>
              <Text style={styles.subtitle}>ติดตามสถานะการรับชำระเงิน และยอดลูกหนี้คงค้าง</Text>
            </View>
            <Pressable style={styles.bell} onPress={() => setToast('ยังไม่มีการแจ้งเตือนใหม่')}>
              <Ionicons name="notifications" size={18} color="#4f6075" />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <View style={styles.headerControls}>
            <Pressable onPress={onBackToMain} style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}>
              <Ionicons name="arrow-back" size={16} color="#5a6b7e" />
              <Text style={styles.ghostText}>กลับแดชบอร์ดหลัก</Text>
            </Pressable>
            <View style={[styles.dateButton, { opacity: 0.85 }]}>
              <Ionicons name="calendar" size={15} color="#b23bd8" />
              <Text style={styles.dateText}>{asOfDate}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.yearButton, pressed && styles.pressed]}
              onPress={() => setSelectedYear((y) => y - 1)}
              onLongPress={() => setSelectedYear(new Date().getFullYear())}
            >
              <Text style={styles.yearText}>ปี ค.ศ. {selectedYear}</Text>
              <Ionicons name="chevron-down" size={14} color="#5a6b7e" />
            </Pressable>
          </View>
        </View>

        {offline ? (
          <Pressable onPress={() => load()} style={styles.offline}>
            <Ionicons name="cloud-offline-outline" size={16} color="#a34545" />
            <Text style={styles.offlineText}>แสดงข้อมูลล่าสุด แตะเพื่อเชื่อมต่อใหม่</Text>
            <Ionicons name="refresh-outline" size={15} color="#a34545" />
          </Pressable>
        ) : null}

        <View style={styles.panel}>
          <View style={styles.rainbow}>
            <View style={[styles.rainbowSegment, { backgroundColor: '#2f7fe0' }]} />
            <View style={[styles.rainbowSegment, { backgroundColor: '#0e9fb4' }]} />
            <View style={[styles.rainbowSegment, { backgroundColor: '#12a35f' }]} />
          </View>

          <Pressable onPress={() => handleSelectCompany('all')} style={[styles.panelHead, companyFilter === 'all' && styles.panelHeadActive]}>
            <View style={styles.brandMark}>
              <Text style={styles.brandText}>TJC</Text>
            </View>
            <Text style={styles.panelTitle}>ภาพรวมลูกหนี้ทุกบริษัท (รวมทั้งหมด)</Text>
            {companyFilter === 'all' && <Ionicons name="checkmark-circle" size={18} color="#0e9fb4" />}
          </Pressable>

          {loading ? (
            <View style={styles.tileGrid}>
              {[0, 1, 2, 3, 4, 5].map((key) => <View key={key} style={styles.tileSkeleton} />)}
            </View>
          ) : (
            <View style={styles.tileGrid}>
              <StatTile icon="card-outline" label="ทุนตั้งต้น (งบรวม)" value={num(summary.initialBudget)} tone="blue" />
              <StatTile icon="people-outline" label="ลูกหนี้ค้างชำระ" value={String(summary.debtorsDue)} unit="เจ้า" tone="orange" />
              <StatTile icon="alert-circle-outline" label="ลูกหนี้คงค้าง" value={num(summary.outstanding)} tone="red" />
              <StatTile icon="document-outline" label="หน้างานที่เงินเข้าแล้ว" value={String(summary.jobsWithPayment)} unit="งาน" tone="teal" />
              <StatTile icon="cash-outline" label="เงินเข้าทั้งหมด (ยอดจ่าย)" value={num(summary.totalReceived)} tone="green" />
              <StatTile icon="layers-outline" label="ยอดรับสุทธิ" value={num(summary.netReceived)} tone="mint" />
              <StatTile icon="calendar-outline" label={`เงินเข้า (${asOfDate})`} value={num(summary.receivedToday)} tone="violet" />
            </View>
          )}

          <View style={styles.wip}>
            <Ionicons name="construct" size={17} color="#d8a12c" />
            <Text style={styles.wipLabel}>
              สรุปยอดงานระหว่างทำ (WIP) <Text style={styles.wipLight}>(งานที่ยังไม่ปิดจบ)</Text>
            </Text>
            <Text style={styles.wipValue}>
              {summary.wipJobs} งาน <Text style={styles.wipDivider}>|</Text> {num(summary.wipAmount)}
            </Text>
          </View>
        </View>

        <Pressable onPress={handleToggleBreakdown} style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
          <Ionicons name="git-network" size={18} color="#ffffff" />
          <Text style={styles.ctaText}>ดูข้อมูลบัญชีแยกตามบริษัท</Text>
          <Ionicons name={breakdownExpanded ? 'chevron-up' : 'chevron-down'} size={17} color="#ffffff" />
        </Pressable>

        {breakdownExpanded && (
          <View style={styles.companyGrid}>
            {companies.map((c) => {
              const isActive = companyFilter === c.name;
              const isCollapsed = collapsedCompanyIds.has(c.id);
              const cs = c.summary;
              return (
                <View key={c.id} style={[styles.companyCard, isActive && styles.companyCardActive]}>
                  <Pressable onPress={() => handleSelectCompany(c.name)} style={styles.companyCardHead}>
                    <View style={styles.companyBadge}>
                      <Ionicons name="business" size={16} color="#4a5d72" />
                    </View>
                    <Text style={styles.companyCardName} numberOfLines={1}>
                      {c.name}
                    </Text>
                    {isActive && <Ionicons name="checkmark-circle" size={16} color="#0e9fb4" />}
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        toggleCompanyCardCollapse(c.id);
                      }}
                      hitSlop={8}
                      style={styles.companyCollapseBtn}
                    >
                      <Ionicons name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={15} color="#8b98a8" />
                    </Pressable>
                  </Pressable>

                  {!isCollapsed && (
                    <>
                      <View style={styles.companyTileGrid}>
                        <StatTile icon="card-outline" label="ทุนตั้งต้น (งบรวม)" value={num(cs.initialBudget)} tone="blue" />
                        <StatTile icon="people-outline" label="ลูกหนี้ค้างชำระ" value={String(cs.debtorsDue)} unit="เจ้า" tone="orange" />
                        <StatTile icon="alert-circle-outline" label="ลูกหนี้คงค้าง" value={num(cs.outstanding)} tone="red" />
                        <StatTile icon="document-outline" label="หน้างานที่เงินเข้า" value={String(cs.jobsWithPayment)} unit="งาน" tone="teal" />
                        <StatTile icon="cash-outline" label="เงินเข้าทั้งหมด (ยอดจ่าย)" value={num(cs.totalReceived)} tone="green" />
                        <StatTile icon="layers-outline" label="ยอดรับสุทธิ" value={num(cs.netReceived)} tone="mint" />
                      </View>
                      <View style={[styles.wip, { marginHorizontal: 12, marginBottom: 12 }]}>
                        <Ionicons name="construct" size={15} color="#d8a12c" />
                        <Text style={styles.wipLabel}>งานระหว่างทำ (WIP)</Text>
                        <Text style={styles.wipValue}>
                          {cs.wipJobs} งาน <Text style={styles.wipDivider}>|</Text> {num(cs.wipAmount)}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {companyFilter !== 'all' && (
          <Pressable onPress={() => handleSelectCompany('all')} style={styles.activeCompanyChip}>
            <Ionicons name="business" size={13} color="#0e9fb4" />
            <Text style={styles.activeCompanyChipText}>กำลังดูเฉพาะ: {companyFilter}</Text>
            <Ionicons name="close-circle" size={15} color="#0e9fb4" />
          </Pressable>
        )}

        <View style={styles.detailHead}>
          <View style={styles.detailTitleRow}>
            <Ionicons name="list" size={19} color="#3c4c60" />
            <Text style={styles.detailTitle}>รายละเอียดลูกหนี้รายโครงการ</Text>
          </View>

          <View style={styles.actionBar}>
            <Pressable onPress={() => load(true)} style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}>
              <Ionicons name="sync" size={16} color="#0e9fb4" />
              <Text style={styles.refreshText}>รีเฟรช</Text>
            </Pressable>
          </View>
          {/* ปุ่ม "Export ตามตัวกรอง" และ "ทำเครื่องหมายจ่ายแล้ว" ถูกตัดออก — accounting_API_mobile.php
              ไม่มี action สำหรับสองอย่างนี้เลย (README_accounting.md ข้อ 8: Export ไม่ได้ทำเป็น endpoint
              ฝั่งเซิร์ฟเวอร์ ส่วนสถานะจ่ายเงินคำนวณอัตโนมัติจาก project_payments ไม่มีปุ่มกดบันทึกเอง) */}

          <View style={styles.searchRow}>
            <Pressable onPress={() => setStatusOpen(!statusOpen)} style={styles.statusSelect}>
              <Ionicons name="card" size={15} color="#c88a1e" />
              <Text style={styles.statusSelectText} numberOfLines={1}>{statusFilter}</Text>
              <Ionicons name={statusOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#77879a" />
            </Pressable>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={15} color="#8b98a8" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="ค้นหาชื่อ, รหัส..."
                placeholderTextColor="#9caab8"
                style={styles.searchInput}
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color="#a9b5c2" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {statusOpen ? (
            <View style={styles.dropdown}>
              {STATUS_FILTERS.map((option) => {
                const active = option === statusFilter;
                return (
                  <Pressable
                    key={option}
                    onPress={() => { setStatusFilter(option); setStatusOpen(false); }}
                    style={({ pressed }) => [styles.dropdownItem, active && styles.dropdownItemActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.dropdownText, active && styles.dropdownTextActive]}>{option}</Text>
                    {active ? <Ionicons name="checkmark" size={15} color="#0e9fb4" /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Pressable onPress={() => setShowFilters(!showFilters)} style={styles.filterToggle}>
            <Ionicons name="funnel-outline" size={14} color="#5f6f82" />
            <Text style={styles.filterToggleText}>ตัวกรองช่วงวันที่</Text>
            <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={14} color="#77879a" />
          </Pressable>

          {showFilters ? (
            <View style={styles.filterPanel}>
              <Text style={styles.filterGroupLabel}>สถานะติดตาม</Text>
              <View style={styles.filterInputs}>
                <View style={styles.filterInput}>
                  <Ionicons name="calendar-outline" size={14} color="#8b98a8" />
                  <TextInput value={followFrom} onChangeText={setFollowFrom} placeholder="ตั้งแต่.." placeholderTextColor="#9caab8" style={styles.filterInputText} />
                </View>
                <View style={styles.filterInput}>
                  <Ionicons name="calendar-outline" size={14} color="#8b98a8" />
                  <TextInput value={followTo} onChangeText={setFollowTo} placeholder="ถึง.." placeholderTextColor="#9caab8" style={styles.filterInputText} />
                </View>
              </View>

              <Text style={styles.filterGroupLabel}>สถานะจ่ายเงิน</Text>
              <View style={styles.filterInputs}>
                <View style={styles.filterInput}>
                  <Ionicons name="calendar-outline" size={14} color="#8b98a8" />
                  <TextInput value={payFrom} onChangeText={setPayFrom} placeholder="ตั้งแต่.." placeholderTextColor="#9caab8" style={styles.filterInputText} />
                </View>
                <View style={styles.filterInput}>
                  <Ionicons name="calendar-outline" size={14} color="#8b98a8" />
                  <TextInput value={payTo} onChangeText={setPayTo} placeholder="ถึง.." placeholderTextColor="#9caab8" style={styles.filterInputText} />
                </View>
              </View>

              <Pressable onPress={clearAllFilters} style={({ pressed }) => [styles.clearFilters, pressed && styles.pressed]}>
                <Ionicons name="refresh" size={14} color="#5f6f82" />
                <Text style={styles.clearFiltersText}>ล้างตัวกรองทั้งหมด</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color="#0e9fb4" />
            <Text style={styles.stateText}>กำลังโหลดรายการลูกหนี้...</Text>
          </View>
        ) : projects.length === 0 ? (
          <View style={styles.stateBox}>
            <Ionicons name="file-tray-outline" size={28} color="#9aa7b5" />
            <Text style={styles.stateTitle}>ไม่พบรายการ</Text>
            <Text style={styles.stateText}>ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา</Text>
          </View>
        ) : (
          projects.map((item) => (
            <ProjectCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onView={() => handleView(item)}
              onFollow={() => handleFollow(item)}
              onRecord={() => handleRecord(item)}
            />
          ))
        )}

        <View style={styles.footer}>
          <Ionicons name="shield-checkmark-outline" size={14} color="#0e9fb4" />
          <Text style={styles.footerText}>ข้อมูลลูกหนี้ซิงก์กับ TJC API</Text>
        </View>
      </ScrollView>

      {toast ? (
        <View style={styles.toast}>
          <Ionicons name="information-circle" size={16} color="#ffffff" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* 🌟 [เพิ่มใหม่] Modal "ดูข้อมูล" — ตรงกับ openDetailsModal() ของต้นฉบับ (3 กล่องข้อมูล) */}
      <Modal visible={detailModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle}>รายละเอียดโครงการ</Text>
              <Pressable onPress={() => setDetailModal({ visible: false, loading: false })} hitSlop={8}>
                <Ionicons name="close" size={20} color="#64748b" />
              </Pressable>
            </View>

            {detailModal.loading ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <ActivityIndicator color="#0e9fb4" />
              </View>
            ) : detailModal.project && (
              <ScrollView style={{ marginTop: 8 }} showsVerticalScrollIndicator={false}>
                {(() => {
                  const p = detailModal.project!;
                  const d = detailModal.detail;
                  const countdownColor = d
                    ? d.countdownTone === 'green' ? '#0e8f60'
                    : d.countdownTone === 'amber' ? '#c47f04'
                    : d.countdownTone === 'red' ? '#e8443f'
                    : '#93a2b3'
                    : '#93a2b3';
                  const showGuarantee = !!d && d.guaranteeType !== 'ไม่มี';
                  const isCash = d?.guaranteeType === 'เงินสด';

                  return (
                    <>
                      <View style={styles.modalBox}>
                        <Text style={styles.modalBoxTitle}>
                          <Ionicons name="document-text-outline" size={13} color="#0e9fb4" /> ข้อมูลสัญญา
                        </Text>
                        <ModalRow label="ชื่อโครงการ" value={p.projectName} />
                        <ModalRow label="เลขที่สัญญา" value={d?.contractNo ?? '-'} />
                        <ModalRow label="งบประมาณ" value={num(p.initialBudget)} />
                        <ModalRow label="วันที่เริ่ม" value={d?.startDate ?? '-'} />
                        <ModalRow label="วันที่สิ้นสุด" value={d?.endDate ?? '-'} />
                        {d && (
                          <View style={styles.modalRow}>
                            <Text style={styles.modalRowLabel}>นับถอยหลัง</Text>
                            <Text style={[styles.modalRowValue, { color: countdownColor, fontWeight: '900' }]}>{d.countdownText}</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.modalBox}>
                        <Text style={styles.modalBoxTitle}>
                          <Ionicons name="person-outline" size={13} color="#0e9fb4" /> ข้อมูลลูกค้า / ติดต่อ
                        </Text>
                        <ModalRow label="สังกัด/หน่วยงาน" value={d?.customerAffiliation ?? p.customer} />
                        <ModalRow label="ผู้ติดต่อ" value={d?.contactPerson ?? '-'} />
                        <ModalRow label="ที่อยู่" value={d?.customerAddress ?? '-'} />
                        {!!d?.contactPhone && (
                          <View style={styles.modalChannelsRow}>
                            {d.contactPhone.split(',').map((ch, i) => (
                              <View key={i} style={styles.modalChannelChip}>
                                <Text style={styles.modalChannelChipText}>{ch.trim()}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>

                      {showGuarantee && d && (
                        <View style={styles.modalBox}>
                          <Text style={styles.modalBoxTitle}>
                            <Ionicons name="shield-checkmark-outline" size={13} color="#0e9fb4" /> ข้อมูลค้ำประกัน
                          </Text>
                          <ModalRow label="ประเภทการค้ำประกัน" value={d.guaranteeType} />
                          {!isCash && <ModalRow label="ธนาคารผู้ออกหนังสือ" value={d.bankName} />}
                          <ModalRow label={isCash ? 'เลขที่บิล/ใบเสร็จ' : 'เลขที่หนังสือค้ำ'} value={d.guaranteeNo} />
                          <ModalRow label="จำนวนเงินค้ำประกัน" value={`${num(d.guaranteeAmount)} (${d.guaranteePercent}%)`} />
                          <ModalRow label="วันที่เริ่มค้ำประกัน" value={d.guaranteeStart} />
                          <ModalRow label="วันที่สิ้นสุดค้ำประกัน" value={d.guaranteeEnd} />
                          <ModalRow label="ระยะเวลารับประกันสุทธิ" value={d.warranty} />
                        </View>
                      )}
                    </>
                  );
                })()}
              </ScrollView>
            )}

            <Pressable onPress={() => setDetailModal({ visible: false, loading: false })} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>ปิดหน้าต่าง</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ModalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.modalRow}>
      <Text style={styles.modalRowLabel}>{label}</Text>
      <Text style={styles.modalRowValue} numberOfLines={3}>
        {value || '-'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#eef2f6' },
  content: { padding: 14, paddingBottom: 36 },

  header: { backgroundColor: '#ffffff', borderRadius: 20, padding: 16, marginBottom: 14, elevation: 2 },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  titleIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#e5f6f9', alignItems: 'center', justifyContent: 'center' },
  titleCopy: { flex: 1 },
  title: { color: '#0f2438', fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  subtitle: { color: '#6c7d90', fontSize: 12, lineHeight: 17, marginTop: 5 },
  bell: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#f4f7f9', alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 8, backgroundColor: '#ef4f58' },
  headerControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 15 },
  ghostButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 21, borderWidth: 1, borderColor: '#dae2ea', flexDirection: 'row', alignItems: 'center', gap: 6 },
  ghostText: { color: '#54677b', fontSize: 12, fontWeight: '700' },
  dateButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 21, borderWidth: 1.5, borderColor: '#e2a7f2', backgroundColor: '#fdf4ff', flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { color: '#a02fc6', fontSize: 13, fontWeight: '900' },
  yearButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 21, borderWidth: 1, borderColor: '#dae2ea', flexDirection: 'row', alignItems: 'center', gap: 6 },
  yearText: { color: '#3f5266', fontSize: 12, fontWeight: '800' },

  offline: { backgroundColor: '#fbe9e7', borderRadius: 13, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 },
  offlineText: { flex: 1, color: '#8d4747', fontSize: 12 },

  panel: { backgroundColor: '#ffffff', borderRadius: 20, overflow: 'hidden', marginBottom: 14, elevation: 2 },
  rainbow: { height: 4, flexDirection: 'row' },
  rainbowSegment: { flex: 1 },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingTop: 15, paddingBottom: 13 },
  brandMark: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#e0d7c1', backgroundColor: '#fdfbf6', alignItems: 'center', justifyContent: 'center' },
  brandText: { color: '#a8904f', fontSize: 10, fontWeight: '900' },
  panelTitle: { flex: 1, color: '#0e9fb4', fontSize: 15, fontWeight: '900' },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 15 },
  tile: { width: '48.6%', minHeight: 86, borderRadius: 14, borderWidth: 1, borderColor: '#e6ecf2', backgroundColor: '#ffffff', flexDirection: 'row', overflow: 'hidden' },
  tileEdge: { width: 4 },
  tileBody: { flex: 1, padding: 11, justifyContent: 'space-between' },
  tileLabelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  tileLabel: { flex: 1, color: '#6d7d8e', fontSize: 11, lineHeight: 15 },
  tileValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 },
  tileValue: { fontSize: 19, fontWeight: '900', letterSpacing: -0.4 },
  tileUnit: { color: '#8b98a8', fontSize: 11 },
  tileSkeleton: { width: '48.6%', height: 86, borderRadius: 14, backgroundColor: '#f1f4f7' },

  wip: { margin: 15, minHeight: 54, borderRadius: 13, borderWidth: 1, borderColor: '#f2ddaa', backgroundColor: '#fffdf5', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  wipLabel: { flex: 1, color: '#5f7085', fontSize: 12, fontWeight: '900' },
  wipLight: { fontWeight: '500', color: '#8b98a8' },
  wipValue: { color: '#d8a12c', fontSize: 13, fontWeight: '900' },
  wipDivider: { color: '#dfd0a4' },

  cta: { minHeight: 56, borderRadius: 28, backgroundColor: '#0fa6bd', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 12, elevation: 3 },
  ctaPressed: { backgroundColor: '#0c8fa3' },
  ctaText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },

  panelHeadActive: { backgroundColor: '#f0fbfd' },

  companyGrid: { gap: 10, marginBottom: 12 },
  companyCard: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1.5, borderColor: '#e6ecf2', overflow: 'hidden', elevation: 1 },
  companyCardActive: { borderColor: '#0e9fb4' },
  companyCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  companyBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f4f7f9', alignItems: 'center', justifyContent: 'center' },
  companyCardName: { flex: 1, color: '#22364c', fontSize: 14, fontWeight: '900' },
  companyCollapseBtn: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  companyTileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 4 },

  activeCompanyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#e5f6f9', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  activeCompanyChipText: { color: '#0e9fb4', fontSize: 12, fontWeight: '800' },

  detailHead: { backgroundColor: '#ffffff', borderRadius: 20, padding: 15, marginBottom: 4, elevation: 2 },
  detailTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailTitle: { color: '#22364c', fontSize: 17, fontWeight: '900' },
  actionBar: { flexDirection: 'row', gap: 7, marginTop: 14 },
  refresh: { minHeight: 44, paddingHorizontal: 13, borderRadius: 22, borderWidth: 1.5, borderColor: '#8fd8e3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  refreshText: { color: '#0e9fb4', fontSize: 12, fontWeight: '900' },
  export: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: '#0d9c6d', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  markPaid: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: '#9333e5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  solidText: { color: '#ffffff', fontSize: 10, fontWeight: '900' },
  badgeCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeCountText: { fontSize: 11, fontWeight: '900' },

  searchRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statusSelect: { width: 128, minHeight: 46, borderRadius: 23, borderWidth: 1, borderColor: '#dbe3eb', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusSelectText: { flex: 1, color: '#3f5266', fontSize: 12, fontWeight: '700' },
  searchBox: { flex: 1, minHeight: 46, borderRadius: 23, borderWidth: 1, borderColor: '#dbe3eb', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7 },
  searchInput: { flex: 1, color: '#1f3348', fontSize: 13 },

  dropdown: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: '#e2e9f0', overflow: 'hidden' },
  dropdownItem: { minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#f0f3f6' },
  dropdownItemActive: { backgroundColor: '#f2fbfc' },
  dropdownText: { color: '#4b5f74', fontSize: 12.5 },
  dropdownTextActive: { color: '#0e9fb4', fontWeight: '900' },

  filterToggle: { marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  filterToggleText: { color: '#5f6f82', fontSize: 12, fontWeight: '800' },
  filterPanel: { borderTopWidth: 1, borderTopColor: '#eef2f6', paddingTop: 12, gap: 8 },
  filterGroupLabel: { color: '#6d7d8e', fontSize: 11, fontWeight: '900' },
  filterInputs: { flexDirection: 'row', gap: 8 },
  filterInput: { flex: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: '#dbe3eb', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterInputText: { flex: 1, color: '#1f3348', fontSize: 12 },
  clearFilters: { alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 13, borderRadius: 20, backgroundColor: '#f2f5f8', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  clearFiltersText: { color: '#5f6f82', fontSize: 12, fontWeight: '800' },

  card: { backgroundColor: '#ffffff', borderRadius: 18, padding: 14, marginTop: 10, elevation: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  jobLabel: { color: '#98a5b3', fontSize: 10 },
  jobNo: { color: '#0e9fb4', fontSize: 24, fontWeight: '900', letterSpacing: -0.6, marginTop: 1 },
  cardHeadRight: { alignItems: 'flex-end' },
  company: { color: '#4a5d72', fontSize: 13, fontWeight: '900', letterSpacing: 0.3 },
  customer: { color: '#8b98a8', fontSize: 11, marginTop: 3 },
  projectName: { color: '#22364c', fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 11 },

  peopleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginTop: 11, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f6' },
  ownerChip: { maxWidth: '52%', minHeight: 30, borderRadius: 15, backgroundColor: '#eef5fd', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  ownerText: { color: '#2b6fd6', fontSize: 11.5, fontWeight: '800' },
  closedBlock: { alignItems: 'flex-end' },
  microLabel: { color: '#98a5b3', fontSize: 10 },
  closedBy: { color: '#33475d', fontSize: 11.5, fontWeight: '900', marginTop: 2 },
  closedAt: { color: '#8b98a8', fontSize: 10, marginTop: 1 },

  moneyGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 12 },
  moneyCell: { width: '25%' },
  moneyValue: { color: '#1b2f45', fontSize: 13.5, fontWeight: '900', marginTop: 3 },
  moneyPositive: { color: '#0e8f60' },
  moneyDanger: { color: '#e8443f' },

  statusRow: { flexDirection: 'row', gap: 9, marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f6' },
  statusCol: { flex: 1, gap: 6 },
  chip: { minHeight: 32, borderRadius: 16, borderWidth: 1, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipText: { fontSize: 10.5, fontWeight: '800', flexShrink: 1 },
  dateHint: { color: '#6d7d8e', fontSize: 10.5 },
  noDate: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noDateText: { color: '#c88a1e', fontSize: 10.5, fontWeight: '700' },
  flagText: { color: '#5d7085', fontSize: 10.5 },

  note: { marginTop: 12, borderRadius: 11, borderWidth: 1, borderColor: '#f2d488', backgroundColor: '#fffbee', padding: 10 },
  noteLabel: { color: '#b98a12', fontSize: 10, fontWeight: '900' },
  noteText: { color: '#7d6112', fontSize: 11.5, lineHeight: 17, marginTop: 4 },

  cardActions: { flexDirection: 'row', gap: 7, marginTop: 13 },
  rowAction: { flex: 1, minHeight: 42, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  viewAction: { backgroundColor: '#3b82f0' },
  followAction: { backgroundColor: '#ee9b06' },
  recordAction: { backgroundColor: '#12b4cb' },
  rowActionText: { color: '#ffffff', fontSize: 11.5, fontWeight: '900' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },

  stateBox: { backgroundColor: '#ffffff', borderRadius: 18, minHeight: 180, marginTop: 10, alignItems: 'center', justifyContent: 'center', gap: 8 },
  stateTitle: { color: '#4b5f74', fontSize: 14, fontWeight: '900' },
  stateText: { color: '#8b98a8', fontSize: 12 },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 20 },
  footerText: { color: '#93a1af', fontSize: 10 },

  toast: { position: 'absolute', left: 16, right: 16, bottom: 22, minHeight: 46, borderRadius: 14, backgroundColor: '#22364c', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  toastText: { flex: 1, color: '#ffffff', fontSize: 12.5, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 18 },
  modalCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 18, maxHeight: '85%' },
  modalHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 16, fontWeight: '900', color: '#22364c' },
  modalBox: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, marginTop: 12 },
  modalBoxTitle: { fontSize: 12, fontWeight: '900', color: '#0e9fb4', marginBottom: 8 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  modalRowLabel: { fontSize: 11.5, color: '#8b98a8', fontWeight: '700', flexShrink: 0 },
  modalRowValue: { fontSize: 12, color: '#22364c', fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  modalChannelsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  modalChannelChip: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e9f0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  modalChannelChipText: { fontSize: 10.5, color: '#4b5f74', fontWeight: '600' },
  modalCloseBtn: { marginTop: 16, backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalCloseBtnText: { color: '#5a6b7e', fontWeight: '800', fontSize: 13.5 },
});

/* API ที่หน้านี้เรียกจริง — accounting_API_mobile.php (README_accounting.md), ผ่าน API_MODULES ใน
 * constants/config.ts และ apiMobileGet จาก app/service/api_mobile.ts:
 * GET get_dashboard -> kpi_all + kpi_by_company (การ์ดสรุป)
 * GET get_list       -> รายการโครงการ (การ์ดลูกหนี้)
 * GET get_detail      -> รายละเอียดโครงการเดียว ดึงตอนเปิด modal "ดูข้อมูล" เท่านั้น
 * ไม่มี action mark_paid / export ใน API จริง จึงตัดปุ่มทั้งสองออก (ดูคอมเมนต์หัวไฟล์)
 * ปุ่มรายรายการ (ดูข้อมูล / ติดตาม / ลงบัญชี) ส่งออกทาง props: onViewProject, onFollowProject, onRecordProject
 * — ถ้าไม่ส่ง prop เหล่านี้ หน้านี้จะเปิด modal ดูข้อมูลในตัว และสลับไป ProjectFollowupScreen/
 * ProjectAccountingScreen ที่ import ไว้ด้านบนเอง
 */