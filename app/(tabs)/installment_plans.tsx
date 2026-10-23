/**
 * installment_plans.tsx — แผนชำระรายงวด (ดูข้อมูลอย่างเดียว)
 * ------------------------------------------------------------------
 * พอร์ตจากหน้าเว็บ installment_plans.php
 *  - ข้อมูลจาก tjc-api/mobile_api/modules/installment_API_mobile.php
 *      get_dashboard  = รายการแผน + KPI ภาพรวม/แยกบริษัท (API คำนวณด้วยสูตรเดียวกับเว็บ)
 *      get_plan_items = งวดชำระ + ประวัติติดตามของแผน (เว็บ: กดแถวเพื่อขยาย)
 *  - KPI 7 การ์ดเหมือนเว็บ: ไม่เปลี่ยนตามตัวกรอง (เว็บคำนวณฝั่ง PHP ครั้งเดียว) แต่เปลี่ยนตามบริษัทที่เลือก
 *  - ตัวกรองเหมือน applyRowFilters(): บริษัท × สถานะชำระ × สถานะติดตาม × ช่วงวันที่บันทึกติดตาม/ชำระเงิน
 *  - แอปดูอย่างเดียว ไม่มีปุ่มนำเข้า/แก้ไข/ลบ/เลือกผู้ติดตาม/ตั้งค่าแจ้งเตือน (ทำบนเว็บ)
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

import { DateField, formatShortThaiDate, formatShortThaiDateTime, ymdToDate } from '../../components/DateTimeField';
import ListPager, { pageCount } from '../../components/ListPager';
import { API_MODULES } from '../../constants/config';
import { apiMobileGet } from '../../service/api_mobile';
import { useAuth } from '../_layout';

const INST_API_URL = `${API_MODULES}/installment_API_mobile.php`;
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
type StateFilter = 'all' | 'pending' | 'has_income' | PayState;

interface Kpi {
  totalBudget: number;
  totalPaid: number;
  totalNet: number;
  totalOutstanding: number;
  debtorUnits: number;
  plansWithIncome: number;
  items: number;
  paidItems: number;
  planCount: number;
}
interface CompanyKpi extends Kpi { key: string; name: string }

interface Plan {
  id: number;
  projectCode: string;
  projectName: string;
  siteNo: string;
  unitName: string;
  companyRaw: string;
  compKey: string;
  compName: string;
  customerAddress: string;
  customerContact: string;
  debtUser: string;
  installmentLabel: string;
  sourceSheet: string;
  note: string;
  budget: number;
  paid: number;
  paidNet: number;
  outstanding: number;
  payState: PayState;
  itemCount: number;
  paidCount: number;
  followStatus: string;
  followAt: string;
  followRemark: string;
  paymentAt: string;
}

interface PlanItem {
  no: string;
  name: string;
  amount: number;
  net: number | null;
  cumulative: number | null;
  remaining: number | null;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  receivedDate: string;
  isPaid: boolean;
  remark: string;
}
interface PlanFollowup { name: string; callStatus: string; bank: string; remark: string; createdBy: string; createdAt: string }

const str = (v: any) => (v === null || v === undefined ? '' : String(v));
const num = (v: any) => Number(v ?? 0) || 0;
const numOrNull = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));

function mapKpi(k: any): Kpi {
  return {
    totalBudget: num(k?.total_budget),
    totalPaid: num(k?.total_paid),
    totalNet: num(k?.total_net),
    totalOutstanding: num(k?.total_outstanding),
    debtorUnits: num(k?.debtor_units),
    plansWithIncome: num(k?.plans_with_income),
    items: num(k?.items),
    paidItems: num(k?.paid_items),
    planCount: num(k?.plan_count),
  };
}

function mapPlan(r: any): Plan {
  const st = str(r.pay_state);
  return {
    id: num(r.id),
    projectCode: str(r.project_code),
    projectName: str(r.project_name),
    siteNo: str(r.site_no),
    unitName: str(r.unit_name),
    companyRaw: str(r.company_name_raw),
    compKey: str(r.comp_key) || 'other',
    compName: str(r.comp_name),
    customerAddress: str(r.customer_address),
    customerContact: str(r.customer_contact),
    debtUser: str(r.debt_user),
    installmentLabel: str(r.installment_label),
    sourceSheet: str(r.source_sheet),
    note: str(r.note),
    budget: num(r.budget),
    paid: num(r.paid_amount),
    paidNet: num(r.paid_net),
    outstanding: num(r.outstanding),
    payState: st === 'paid_full' || st === 'paid_partial' ? st : 'unpaid',
    itemCount: num(r.item_count),
    paidCount: num(r.paid_count),
    followStatus: str(r.latest_follow_status) || 'ยังไม่เคยติดตาม',
    followAt: str(r.latest_follow_at),
    followRemark: str(r.latest_follow_remark),
    paymentAt: str(r.latest_payment_at),
  };
}

// -------------------- กติกาเดียวกับเว็บ --------------------

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAY_STATE_META: Record<PayState, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  paid_full: { label: 'จ่ายครบตามแผน', color: GREEN, icon: 'checkmark-done-circle' },
  paid_partial: { label: 'จ่ายบางส่วน', color: AMBER, icon: 'pie-chart' },
  unpaid: { label: 'ยังไม่มีเงินเข้า', color: GRAY, icon: 'hourglass-outline' },
};

// ชื่อเดียวกับ stateNames ของเว็บ
const STATE_LABEL: Record<StateFilter, string> = {
  all: 'ทั้งหมด',
  pending: 'ยังชำระไม่ครบ',
  has_income: 'มีเงินเข้าแล้ว',
  paid_full: 'จ่ายครบตามแผน',
  paid_partial: 'จ่ายบางส่วน',
  unpaid: 'ยังไม่มีเงินเข้า',
};

// stateMatch() ของเว็บ
function stateMatch(s: PayState, f: StateFilter): boolean {
  if (f === 'all') return true;
  if (f === 'pending') return s !== 'paid_full';
  if (f === 'has_income') return s !== 'unpaid';
  return s === f;
}

// planDateMatches() ของเว็บ — เทียบเฉพาะส่วนวันที่ YYYY-MM-DD
function dateMatches(value: string, start: string, end: string): boolean {
  if (!start && !end) return true;
  const d = value.slice(0, 10);
  return !!d && (!start || d >= start) && (!end || d <= end);
}

const followColor = (s: string) => (s === 'ยังไม่เคยติดตาม' || s === 'ยังไม่ระบุสถานะ' ? GRAY : AMBER);

// -------------------- Screen --------------------

export default function InstallmentPlansScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [kpiAll, setKpiAll] = useState<Kpi>(mapKpi({}));
  const [kpiByComp, setKpiByComp] = useState<CompanyKpi[]>([]);
  const [followOptions, setFollowOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [compFilter, setCompFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [followFilter, setFollowFilter] = useState('');
  const [followStart, setFollowStart] = useState('');
  const [followEnd, setFollowEnd] = useState('');
  const [payStart, setPayStart] = useState('');
  const [payEnd, setPayEnd] = useState('');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState<Plan | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [followups, setFollowups] = useState<PlanFollowup[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  // ป๊อปอัพในหน้ารายละเอียด: งวดชำระ / ประวัติการติดตาม (แยกออกมาให้หน้ารายละเอียดสั้น ไม่ต้องเลื่อนหา)
  const [listPopup, setListPopup] = useState<'items' | 'followups' | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (!user?.id) return;
      refresh ? setRefreshing(true) : setLoading(true);
      setLoadError(null);
      try {
        const res = await apiMobileGet(INST_API_URL, 'get_dashboard', { user_id: user.id });
        setPlans(Array.isArray(res.list) ? res.list.map(mapPlan) : []);
        setKpiAll(mapKpi(res.kpi_all));
        setKpiByComp(
          (Array.isArray(res.kpi_by_company) ? res.kpi_by_company : []).map((c: any) => ({ ...mapKpi(c), key: str(c.comp_key), name: str(c.name) }))
        );
        setFollowOptions(Array.isArray(res.follow_status_options) ? res.follow_status_options.map(str) : []);
      } catch (e: any) {
        const notReady = e?.response?.status === 404;
        setLoadError(notReady ? 'ยังเชื่อมต่อข้อมูลไม่ได้ — เซิร์ฟเวอร์ยังไม่มี API ของหน้านี้' : e?.message || 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        refresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setDetail(null);
        setFilterSheetOpen(false);
      };
    }, [])
  );

  async function openDetail(p: Plan) {
    setDetail(p);
    setListPopup(null);
    setItems([]);
    setFollowups([]);
    setItemsError(null);
    if (!user?.id) return;
    setItemsLoading(true);
    try {
      const res = await apiMobileGet(INST_API_URL, 'get_plan_items', { user_id: user.id, plan_id: p.id });
      setItems(
        (Array.isArray(res.items) ? res.items : []).map((i: any) => ({
          no: str(i.installment_no),
          name: str(i.payment_name),
          amount: num(i.amount),
          net: numOrNull(i.net_amount),
          cumulative: numOrNull(i.cumulative_paid),
          remaining: numOrNull(i.remaining),
          invoiceNo: str(i.invoice_no),
          invoiceDate: str(i.invoice_date),
          dueDate: str(i.due_date),
          receivedDate: str(i.received_date),
          isPaid: !!Number(i.is_paid ?? 0),
          remark: str(i.remark),
        }))
      );
      setFollowups(
        (Array.isArray(res.followups) ? res.followups : []).map((f: any) => ({
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

  const kpi: Kpi = compFilter === 'all' ? kpiAll : kpiByComp.find((c) => c.key === compFilter) ?? mapKpi({});
  const compName = compFilter === 'all' ? '' : kpiByComp.find((c) => c.key === compFilter)?.name ?? '';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((p) => {
      if (compFilter !== 'all' && p.compKey !== compFilter) return false;
      if (!stateMatch(p.payState, stateFilter)) return false;
      if (followFilter && p.followStatus !== followFilter) return false;
      if (!dateMatches(p.followAt, followStart, followEnd)) return false;
      if (!dateMatches(p.paymentAt, payStart, payEnd)) return false;
      if (q) {
        const hay = [p.siteNo, p.unitName, p.companyRaw, p.compName, p.debtUser, p.projectCode, p.projectName, p.customerContact, p.installmentLabel]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [plans, search, compFilter, stateFilter, followFilter, followStart, followEnd, payStart, payEnd]);

  useEffect(() => {
    setPage(1);
  }, [search, compFilter, stateFilter, followFilter, followStart, followEnd, payStart, payEnd]);
  const totalPages = pageCount(filtered.length, PAGE_SIZE);
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const rangeText = (a: string, b: string) => `${a ? formatShortThaiDate(a) : '-'} ถึง ${b ? formatShortThaiDate(b) : '-'}`;
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (compFilter !== 'all') chips.push({ key: 'comp', label: compName || 'บริษัท', clear: () => setCompFilter('all') });
  if (stateFilter !== 'all') chips.push({ key: 'st', label: STATE_LABEL[stateFilter], clear: () => setStateFilter('all') });
  if (followFilter) chips.push({ key: 'fs', label: `ติดตาม: ${followFilter}`, clear: () => setFollowFilter('') });
  if (followStart || followEnd)
    chips.push({ key: 'fd', label: `บันทึกติดตาม ${rangeText(followStart, followEnd)}`, clear: () => (setFollowStart(''), setFollowEnd('')) });
  if (payStart || payEnd)
    chips.push({ key: 'pd', label: `บันทึกชำระ ${rangeText(payStart, payEnd)}`, clear: () => (setPayStart(''), setPayEnd('')) });

  function resetFilters() {
    setCompFilter('all');
    setStateFilter('all');
    setFollowFilter('');
    setFollowStart('');
    setFollowEnd('');
    setPayStart('');
    setPayEnd('');
    setSearch('');
  }

  // -------------------- render --------------------

  function renderCompanyTabs() {
    if (kpiByComp.length === 0) return null;
    const tab = (key: string, label: string, n: number) => {
      const active = compFilter === key;
      return (
        <TouchableOpacity key={key} style={[styles.compTab, active && styles.compTabActive]} onPress={() => setCompFilter(key)}>
          <Text style={[styles.compTabText, active && { color: '#fff' }]} numberOfLines={1}>{label}</Text>
          <View style={[styles.compTabCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
            <Text style={[styles.compTabCountText, active && { color: '#fff' }]}>{n}</Text>
          </View>
        </TouchableOpacity>
      );
    };
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compTabRow}>
        {tab('all', 'ทุกบริษัท', kpiAll.planCount)}
        {kpiByComp.map((c) => tab(c.key, c.name, c.planCount))}
      </ScrollView>
    );
  }

  function renderSummary() {
    // 7 การ์ดเหมือน render_mini_cards() ของเว็บ — กดเพื่อกรองสถานะ (กดซ้ำ = ล้าง)
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
    const pct = kpi.totalBudget > 0 ? Math.min(kpi.totalPaid / kpi.totalBudget, 1) : 0;
    return (
      <View style={styles.summaryCard}>
        <View style={styles.summaryTopBar} />
        <View style={styles.summaryTotalRow}>
          <View style={styles.summaryIcon}>
            <Ionicons name="calendar-number" size={20} color={PRIMARY} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>{compName || 'ภาพรวมทุกบริษัท'}</Text>
            <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
              {money(kpi.totalPaid)} <Text style={styles.summaryUnit}>/ {money(kpi.totalBudget)}</Text>
            </Text>
            <Text style={styles.summarySub}>
              เงินเข้า {Math.round(pct * 100)}% ของทุนตั้งต้น · {kpi.planCount.toLocaleString('en-US')} แผน
            </Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: GREEN }]} />
        </View>
        <Text style={styles.kpiHint}>
          <Ionicons name="funnel-outline" size={10} color="#94a3b8" /> แตะกล่องเพื่อกรองรายการ
        </Text>
        <View style={styles.kpiGrid}>
          {box('budget', 'all', 'ทุนตั้งต้น (งบรวมตามแผน)', money(kpi.totalBudget), '', PRIMARY, 'cash')}
          {box('debtor', 'pending', 'หน่วยงานค้างชำระ', kpi.debtorUnits.toLocaleString('en-US'), 'เจ้า', AMBER, 'people')}
          {box('outstanding', 'pending', 'ค้างชำระตามแผน', money(kpi.totalOutstanding), '', RED, 'alert-circle')}
          {box('income_units', 'has_income', 'หน้างานที่เงินเข้าแล้ว', kpi.plansWithIncome.toLocaleString('en-US'), 'งาน', '#0891b2', 'document-text')}
          {box('paid', 'has_income', 'เงินเข้าทั้งหมด (ตามแผน)', money(kpi.totalPaid), '', GREEN, 'wallet')}
          {box('net', 'has_income', 'ยอดรับสุทธิ', money(kpi.totalNet), '', TEAL, 'cash-outline')}
          {box('items', 'paid_full', 'งวดจ่ายแล้ว/ทั้งหมด', `${kpi.paidItems.toLocaleString('en-US')}/${kpi.items.toLocaleString('en-US')}`, 'งวด', '#7c3aed', 'list')}
        </View>
      </View>
    );
  }

  function renderCard(p: Plan) {
    const st = PAY_STATE_META[p.payState];
    const pct = p.budget > 0 ? Math.min(p.paid / p.budget, 1) : 0;
    return (
      <TouchableOpacity key={p.id} activeOpacity={0.75} onPress={() => openDetail(p)} style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={styles.codeBadge}>
            <Text style={styles.codeBadgeText}>{p.siteNo || '-'}</Text>
          </View>
          <Text style={styles.cardComp} numberOfLines={1}>{p.compName}</Text>
          <View style={[styles.stateChip, { backgroundColor: st.color + '14' }]}>
            <Ionicons name={st.icon} size={11} color={st.color} />
            <Text style={[styles.stateChipText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{p.unitName || 'ไม่ระบุลูกค้า/ชื่องบ'}</Text>
        {!!p.installmentLabel && <Text style={styles.cardSub} numberOfLines={1}>งวดชำระ: {p.installmentLabel}</Text>}

        <View style={styles.cardMoneyGrid}>
          <View style={styles.cardMoneyCell}>
            <Text style={styles.cardMoneyLabel}>งบตั้งต้น</Text>
            <Text style={styles.cardMoneyValue} numberOfLines={1} adjustsFontSizeToFit>{money(p.budget)}</Text>
          </View>
          <View style={styles.cardMoneyCell}>
            <Text style={styles.cardMoneyLabel}>ยอดจ่าย</Text>
            <Text style={[styles.cardMoneyValue, { color: p.paid > 0 ? GREEN : '#0f172a' }]} numberOfLines={1} adjustsFontSizeToFit>{money(p.paid)}</Text>
          </View>
          <View style={styles.cardMoneyCell}>
            <Text style={styles.cardMoneyLabel}>ค้างชำระ</Text>
            <Text style={[styles.cardMoneyValue, { color: p.outstanding > 0 ? RED : GREEN }]} numberOfLines={1} adjustsFontSizeToFit>{money(p.outstanding)}</Text>
          </View>
        </View>
        <View style={styles.progressTrackSm}>
          <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: st.color }]} />
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={12} color={GRAY} />
            <Text style={[styles.metaText, !p.debtUser && { color: '#94a3b8' }]} numberOfLines={1}>{p.debtUser || 'ยังไม่ระบุผู้ติดตาม'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="headset-outline" size={12} color={followColor(p.followStatus)} />
            <Text style={[styles.metaText, { color: followColor(p.followStatus) }]} numberOfLines={1}>{p.followStatus}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="list-outline" size={12} color={GRAY} />
            <Text style={styles.metaText}>{p.paidCount}/{p.itemCount} งวด</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
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

  function renderDetail() {
    const p = detail;
    const close = () => {
      setListPopup(null);
      setDetail(null);
    };
    const st = p ? PAY_STATE_META[p.payState] : null;
    const lastFollow = followups.length ? followups[followups.length - 1] : null;
    const popupBtn = (
      key: 'items' | 'followups',
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
      <Modal visible={!!p} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
        {/* Modal เป็นหน้าต่างแยก — เว้นขอบ notch/แถบล่างเองด้วย insets ไม่งั้นปุ่มกลับบน iPhone กดไม่ได้ */}
        <View style={[styles.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <StatusBar barStyle="dark-content" />
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={close} style={styles.backBtn} hitSlop={8} accessibilityLabel="กลับ">
              <Ionicons name="chevron-back" size={22} color="#0f172a" />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>แผนชำระ {p?.siteNo || ''}</Text>
          </View>
          {p && st && (
            <ScrollView contentContainerStyle={styles.detailScroll}>
              <View style={styles.detailHero}>
                <View style={[styles.stateChip, { alignSelf: 'flex-start', backgroundColor: st.color + '14' }]}>
                  <Ionicons name={st.icon} size={12} color={st.color} />
                  <Text style={[styles.stateChipText, { color: st.color }]}>{st.label}</Text>
                </View>
                <Text style={styles.detailHeroTitle}>{p.unitName || 'ไม่ระบุลูกค้า/ชื่องบ'}</Text>
                <Text style={styles.cardSub}>{p.compName}</Text>
                <View style={styles.cardMoneyGrid}>
                  <View style={styles.cardMoneyCell}>
                    <Text style={styles.cardMoneyLabel}>งบตั้งต้น</Text>
                    <Text style={styles.cardMoneyValue} numberOfLines={1} adjustsFontSizeToFit>{money(p.budget)}</Text>
                  </View>
                  <View style={styles.cardMoneyCell}>
                    <Text style={styles.cardMoneyLabel}>ยอดจ่าย</Text>
                    <Text style={[styles.cardMoneyValue, { color: GREEN }]} numberOfLines={1} adjustsFontSizeToFit>{money(p.paid)}</Text>
                  </View>
                  <View style={styles.cardMoneyCell}>
                    <Text style={styles.cardMoneyLabel}>ค้างชำระ</Text>
                    <Text style={[styles.cardMoneyValue, { color: p.outstanding > 0 ? RED : GREEN }]} numberOfLines={1} adjustsFontSizeToFit>{money(p.outstanding)}</Text>
                  </View>
                </View>
                <Text style={styles.cardSub}>ยอดรับสุทธิ {money(p.paidNet)} · จ่ายแล้ว {p.paidCount}/{p.itemCount} งวด</Text>
              </View>

              {/* ปุ่มเปิดป๊อปอัพ — อยู่ใต้ยอดเงินเลย เห็นทันทีไม่ต้องเลื่อน */}
              <View style={styles.popupBtnRow}>
                {popupBtn(
                  'items',
                  'list',
                  'งวดชำระ',
                  items.length,
                  items.length ? `จ่ายแล้ว ${items.filter((i) => i.isPaid).length}/${items.length} งวด` : 'ยังไม่มีงวดชำระ',
                  GREEN
                )}
                {popupBtn(
                  'followups',
                  'chatbubbles',
                  'ประวัติการติดตาม',
                  followups.length,
                  lastFollow
                    ? `ล่าสุด: ${lastFollow.callStatus || lastFollow.name || '-'}${lastFollow.createdAt ? ` · ${formatShortThaiDate(lastFollow.createdAt.slice(0, 10))}` : ''}`
                    : 'ยังไม่เคยติดตาม',
                  AMBER
                )}
              </View>

              <Section icon="document-text" title="ข้อมูลแผน">
                <InfoRow label="เลขหน้างาน" value={p.siteNo} />
                <InfoRow label="บริษัท (ตามชีท)" value={p.companyRaw} />
                <InfoRow label="บริษัทในระบบ" value={p.compName} />
                <InfoRow label="โครงการ" value={[p.projectCode, p.projectName].filter(Boolean).join(' · ')} />
                <InfoRow label="งวดชำระ" value={p.installmentLabel} />
                <InfoRow label="ผู้รับผิดชอบติดตามหนี้" value={p.debtUser} />
                <InfoRow label="ผู้ติดต่อ" value={p.customerContact} />
                <InfoRow label="ที่อยู่" value={p.customerAddress} />
                {!!p.sourceSheet && <InfoRow label="ชีทต้นทาง" value={p.sourceSheet} />}
                {!!p.note && <InfoRow label="หมายเหตุ" value={p.note} />}
              </Section>
            </ScrollView>
          )}
          {renderListPopup()}
        </View>
      </Modal>
    );
  }

  // ป๊อปอัพงวดชำระ / ประวัติการติดตาม — วางไว้ใน Modal รายละเอียด เพื่อให้ Android ซ้อนหน้าต่างถูกลำดับ
  function renderListPopup() {
    const isItems = listPopup === 'items';
    const closePopup = () => setListPopup(null);
    return (
      <Modal visible={!!listPopup && !!detail} transparent animationType="slide" statusBarTranslucent onRequestClose={closePopup}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closePopup} />
          <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeadRow}>
              <Text style={styles.sheetTitle}>{isItems ? `งวดชำระ (${items.length})` : `ประวัติการติดตาม (${followups.length})`}</Text>
              <TouchableOpacity onPress={closePopup} hitSlop={8} accessibilityLabel="ปิด">
                <Ionicons name="close" size={22} color={GRAY} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              {isItems ? (
                items.length === 0 ? (
                  <Text style={styles.emptyText}>ยังไม่มีงวดชำระ</Text>
                ) : (
                  items.map((it, i) => (
                    <View key={i} style={[styles.itemCard, it.isPaid && styles.itemCardPaid]}>
                      <View style={styles.itemHead}>
                        <View style={[styles.itemNo, { backgroundColor: it.isPaid ? GREEN : '#e2e8f0' }]}>
                          <Text style={[styles.itemNoText, { color: it.isPaid ? '#fff' : '#475569' }]}>{it.no || i + 1}</Text>
                        </View>
                        <Text style={styles.itemName} numberOfLines={1}>{it.name || `งวดที่ ${it.no || i + 1}`}</Text>
                        <View style={[styles.stateChip, { backgroundColor: (it.isPaid ? GREEN : AMBER) + '14' }]}>
                          <Ionicons name={it.isPaid ? 'checkmark-circle' : 'time-outline'} size={11} color={it.isPaid ? GREEN : AMBER} />
                          <Text style={[styles.stateChipText, { color: it.isPaid ? GREEN : AMBER }]}>{it.isPaid ? 'ชำระแล้ว' : 'ยังไม่ชำระ'}</Text>
                        </View>
                      </View>
                      <View style={styles.itemGrid}>
                        <ItemCell label="ยอดเงิน" value={money(it.amount)} strong />
                        <ItemCell label="ยอดสุทธิ" value={it.net === null ? '-' : money(it.net)} />
                        <ItemCell label="ยอดสะสม" value={it.cumulative === null ? '-' : money(it.cumulative)} />
                        <ItemCell label="คงเหลือ" value={it.remaining === null ? '-' : money(it.remaining)} />
                        <ItemCell label="เลขใบแจ้งหนี้" value={it.invoiceNo || '-'} />
                        <ItemCell label="วันที่ใบแจ้งหนี้" value={it.invoiceDate ? formatShortThaiDate(it.invoiceDate) : '-'} />
                        <ItemCell label="ครบกำหนด" value={it.dueDate ? formatShortThaiDate(it.dueDate) : '-'} />
                        <ItemCell label="วันที่รับเงิน" value={it.receivedDate ? formatShortThaiDate(it.receivedDate) : '-'} />
                      </View>
                      {!!it.remark && <Text style={styles.itemRemark}>{it.remark}</Text>}
                    </View>
                  ))
                )
              ) : followups.length === 0 ? (
                <Text style={styles.emptyText}>ยังไม่เคยติดตาม</Text>
              ) : (
                  followups.map((f, i) => (
                    <View key={i} style={styles.followRow}>
                      <View style={styles.followDot} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.followHead}>
                          {!!f.name && <Text style={styles.followName}>{f.name}</Text>}
                          {!!f.callStatus && (
                            <View style={[styles.stateChip, { backgroundColor: followColor(f.callStatus) + '14' }]}>
                              <Text style={[styles.stateChipText, { color: followColor(f.callStatus) }]}>{f.callStatus}</Text>
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
                  ))
              )}
            </ScrollView>
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
    const compCount = (key: string) => plans.filter((p) => p.compKey === key).length;
    const STATES: StateFilter[] = ['all', 'pending', 'has_income', 'paid_full', 'paid_partial', 'unpaid'];
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
              {group('wallet', 'สถานะชำระเงิน', STATES.map((s) => opt(s, STATE_LABEL[s], stateFilter === s, () => setStateFilter(s))))}
              {kpiByComp.length > 0 &&
                group('business', 'บริษัท', [
                  opt('all', 'ทุกบริษัท', compFilter === 'all', () => setCompFilter('all')),
                  ...kpiByComp.map((c) => opt(c.key, c.name, compFilter === c.key, () => setCompFilter(c.key), compCount(c.key))),
                ])}
              {followOptions.length > 0 &&
                group('headset', 'สถานะติดตาม', [
                  opt('', 'ทั้งหมด', followFilter === '', () => setFollowFilter('')),
                  ...followOptions.map((s) => opt(s, s, followFilter === s, () => setFollowFilter(s), plans.filter((p) => p.followStatus === s).length)),
                ])}
              {group('calendar', 'วันที่บันทึกติดตาม', range(followStart, setFollowStart, followEnd, setFollowEnd))}
              {group('calendar-outline', 'วันที่บันทึกชำระเงิน', range(payStart, setPayStart, payEnd, setPayEnd))}
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
              placeholder="ค้นหาเลขหน้างาน/ลูกค้า/ผู้ติดตาม..."
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#cbd5e1" />
              </TouchableOpacity>
            )}
          </View>
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
          {renderCompanyTabs()}
          {renderSummary()}
          <Text style={styles.resultText}>พบ {filtered.length.toLocaleString('en-US')} แผน</Text>
          {pageRows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="file-tray-outline" size={28} color="#cbd5e1" />
              <Text style={styles.emptyText}>{plans.length === 0 ? 'ยังไม่มีแผนชำระ' : 'ไม่พบรายการตามตัวกรอง'}</Text>
            </View>
          ) : (
            pageRows.map(renderCard)
          )}
          <ListPager page={safePage} pageSize={PAGE_SIZE} total={filtered.length} unit="แผน" onChange={setPage} />
        </ScrollView>
      )}

      {renderFilterSheet()}
      {renderDetail()}
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

  compTabRow: { paddingHorizontal: 14, paddingTop: 12, gap: 8 },
  compTab: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 240, height: 36, borderRadius: 50, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', paddingHorizontal: 12 },
  compTabActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  compTabText: { flexShrink: 1, fontSize: 12, fontWeight: '800', color: '#334155' },
  compTabCount: { minWidth: 20, borderRadius: 10, backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 1, alignItems: 'center' },
  compTabCountText: { fontSize: 10.5, fontWeight: '900', color: '#475569' },

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
  kpiBox: { width: '48.8%', minHeight: 66, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, paddingHorizontal: 9, paddingVertical: 8, gap: 4 },
  tapHintIcon: { position: 'absolute', top: 6, right: 7 },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
  kpiLabel: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  kpiValue: { color: '#0f172a', fontSize: 16, fontWeight: '900', marginTop: 'auto' },
  kpiUnit: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },

  resultText: { marginHorizontal: 16, marginTop: 14, marginBottom: 2, fontSize: 12, color: GRAY, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 12.5, textAlign: 'center', paddingVertical: 8 },

  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 14, marginTop: 10, padding: 13, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codeBadge: { backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  codeBadgeText: { color: '#4338ca', fontSize: 12, fontWeight: '900' },
  cardComp: { flex: 1, fontSize: 11, color: GRAY, fontWeight: '700' },
  stateChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3 },
  stateChipText: { fontSize: 10.5, fontWeight: '800' },
  cardTitle: { color: '#0f172a', fontSize: 14, fontWeight: '800', lineHeight: 20, marginTop: 10 },
  cardSub: { color: GRAY, fontSize: 11.5, marginTop: 3 },
  cardMoneyGrid: { flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  cardMoneyCell: { flex: 1 },
  cardMoneyLabel: { fontSize: 10.5, color: GRAY, fontWeight: '700' },
  cardMoneyValue: { fontSize: 13.5, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaText: { fontSize: 11, color: '#475569', fontWeight: '600', flexShrink: 1 },

  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  detailHeaderTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: '#0f172a' },
  detailScroll: { padding: 14, paddingBottom: 32, gap: 12 },
  detailHero: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 13, gap: 4 },
  detailHeroTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900', lineHeight: 22, marginTop: 6 },
  section: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: '#c7d2fe', paddingHorizontal: 12, paddingBottom: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  infoLabel: { fontSize: 12, color: '#475569', fontWeight: '600', maxWidth: '45%' },
  infoValue: { flex: 1, fontSize: 12.5, color: '#0f172a', fontWeight: '800', textAlign: 'right' },

  popupBtnRow: { gap: 8 },
  popupBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 11, minHeight: 56 },
  popupBtnIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  popupBtnTitle: { fontSize: 13.5, fontWeight: '900', color: '#0f172a' },
  popupBtnSub: { fontSize: 11.5, color: GRAY, marginTop: 2 },
  itemCard: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginTop: 8 },
  itemCardPaid: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemNo: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  itemNoText: { fontSize: 11.5, fontWeight: '900' },
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
  followAt: { fontSize: 10.5, color: '#94a3b8', marginTop: 2 },

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
