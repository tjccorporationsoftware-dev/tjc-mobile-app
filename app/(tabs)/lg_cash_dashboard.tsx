/**
 * lg_cash_dashboard.tsx — Dashboard ค้ำเงินสด (ดูข้อมูลอย่างเดียว)
 * ------------------------------------------------------------------
 * พอร์ตจากหน้าเว็บ lg_cash_dashboard.php (เมนู: เงินสดค้ำ › Dashboard ค้ำเงินสด)
 *  - ข้อมูลจาก tjc-api/mobile_api/modules/lg_API_mobile.php?action=get_cash_dashboard (ตาราง cash_guarantees)
 *  - แอปดูอย่างเดียว ไม่มีปุ่มตรวจ/อนุมัติ/ยกเลิก/แนบไฟล์/นำเข้า (ทำบนเว็บ)
 *  - KPI สูตรเดียวกับ applyFilters() ของเว็บ: นับเฉพาะแถวที่ไม่ยกเลิกและผ่านตัวกรอง
 *    (มูลค่ารวม / จำนวน / ใกล้หมดอายุ / หมดประกัน) — หน้านี้บนเว็บไม่มีคอลัมน์อนุมัติ 2 ขั้น จึงไม่มีการ์ดอนุมัติ
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatShortThaiDate, formatShortThaiDateTime } from '../../components/DateTimeField';
import AttachmentManagerModal, { AttachedFile } from '../../components/AttachmentManagerModal';
import ListPager, { pageCount } from '../../components/ListPager';
import { useScreenInsets } from '../../components/useScreenInsets';
import { API_BASE, API_MODULES } from '../../constants/config';
import { apiMobileGet } from '../../service/api_mobile';
import { useAuth } from '../_layout';

const LG_API_URL = `${API_MODULES}/lg_API_mobile.php`;
const PAGE_SIZE = 30;

// กติกาสีทั้งแอป: ปุ่มหลัก = PRIMARY, เขียว = เสร็จ/ปกติ, ส้ม = ใกล้หมด, แดง = เกิน/มีปัญหา, เทา = ข้อมูลทั่วไป
const PRIMARY = '#4f46e5';
const GREEN = '#059669';
const AMBER = '#d97706';
const RED = '#dc2626';
const GRAY = '#64748b';

// -------------------- Types --------------------

interface Channel { channel: string; value: string; ext: string }
interface Contact { name: string; position: string; channels: Channel[] }
interface CashFile { topic: string; filePath: string; originalName: string; uploadDate: string; uploaderName: string }

interface CashRow {
  id: number;
  projectCode: string;
  condition: string;
  receiptNo: string; // contract_no — หัวคอลัมน์บนเว็บเรียก "เลขที่ใบเสร็จ"
  contractType: string;
  projectName: string;
  companyId: number;
  companyName: string;
  companyShort: string;
  agency: string;
  agencyAddress: string;
  bankName: string;
  bankBranch: string;
  totalBudget: number;
  value: number;
  startDate: string;
  endDate: string;
  alertDays: number;
  warrantyValue: number | null;
  warrantyUnit: string;
  status: string;
  recorder: string;
  lastEditor: string;
  reqFullname: string;
  reqNickname: string;
  reqDepartment: string;
  canceledBy: string;
  canceledAt: string;
  isImported: boolean;
  importNote: string;
  contacts: Contact[];
  files: CashFile[];
}

const str = (v: any) => (v === null || v === undefined ? '' : String(v));

function mapRow(r: any): CashRow {
  return {
    id: Number(r.id ?? 0),
    projectCode: str(r.project_code),
    condition: str(r.lg_condition) || 'หนังสือค้ำฯ',
    receiptNo: str(r.contract_no),
    contractType: str(r.contract_type),
    projectName: str(r.project_name),
    companyId: Number(r.company_id ?? 0),
    companyName: str(r.company_name),
    companyShort: str(r.company_shortname),
    agency: str(r.agency_display),
    agencyAddress: str(r.agency_address),
    bankName: str(r.bank_name),
    bankBranch: str(r.bank_branch),
    totalBudget: Number(r.total_budget ?? 0) || 0,
    value: Number(r.lg_value ?? 0) || 0,
    startDate: str(r.lg_start_date),
    endDate: str(r.lg_end_date),
    alertDays: Number(r.alert_days ?? 30) || 30,
    warrantyValue: r.warranty_value === null || r.warranty_value === undefined ? null : Number(r.warranty_value),
    warrantyUnit: str(r.warranty_unit) || 'days',
    status: str(r.lg_status),
    recorder: str(r.recorder),
    lastEditor: str(r.last_editor),
    reqFullname: str(r.req_fullname),
    reqNickname: str(r.req_nickname),
    reqDepartment: str(r.req_department),
    canceledBy: str(r.canceled_by),
    canceledAt: str(r.canceled_at),
    isImported: !!Number(r.is_imported ?? 0),
    importNote: str(r.import_note),
    contacts: (Array.isArray(r.contacts) ? r.contacts : []).map((c: any) => ({
      name: str(c.name),
      position: str(c.position),
      channels: (Array.isArray(c.channels) ? c.channels : []).map((ch: any) => ({ channel: str(ch.channel), value: str(ch.value), ext: str(ch.ext) })),
    })),
    files: (Array.isArray(r.attached_files) ? r.attached_files : []).map((f: any) => ({
      topic: str(f.topic) || 'เอกสารแนบ',
      filePath: str(f.file_path),
      originalName: str(f.original_name),
      uploadDate: str(f.upload_date),
      uploaderName: str(f.uploader_name),
    })),
  };
}

// -------------------- กติกาเดียวกับเว็บ --------------------

const isCanceled = (r: CashRow) => r.status === 'ยกเลิก';
const companyLabel = (r: CashRow) => r.companyShort.trim() || r.companyName.trim() || '-';
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const yearOf = (d: string) => (/^\d{4}/.test(d) ? d.slice(0, 4) : '');
const warrantyText = (r: CashRow) =>
  r.warrantyValue ? `${r.warrantyValue} ${r.warrantyUnit === 'years' ? 'ปี' : r.warrantyUnit === 'months' ? 'เดือน' : 'วัน'}` : '';

type Countdown = { kind: 'none' | 'ok' | 'expiring' | 'today' | 'expired'; days: number };
function countdown(r: CashRow): Countdown {
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
// เว็บนับ "ใกล้หมดอายุ" จากป้ายสีส้ม (bg-warning) หรือแดง (วันนี้!)
const isExpiring = (c: Countdown) => c.kind === 'expiring' || c.kind === 'today';
function countdownBadge(c: Countdown): { text: string; fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap } | null {
  switch (c.kind) {
    case 'ok':
      return { text: `${c.days} วัน`, fg: GREEN, bg: '#ecfdf5', icon: 'time-outline' };
    case 'expiring':
      return { text: `${c.days} วัน`, fg: AMBER, bg: '#fffbeb', icon: 'warning-outline' };
    case 'today':
      return { text: 'วันนี้!', fg: '#fff', bg: RED, icon: 'notifications' };
    case 'expired':
      return { text: 'หมดประกัน', fg: '#fff', bg: '#94a3b8', icon: 'close-circle' };
    default:
      return null;
  }
}

type StatusFilter = 'all' | 'ใกล้หมดอายุ' | 'หมดประกัน' | 'ยกเลิก';
function matchStatus(r: CashRow, f: StatusFilter): boolean {
  if (f === 'ยกเลิก') return isCanceled(r);
  if (isCanceled(r)) return false;
  if (f === 'ใกล้หมดอายุ') return isExpiring(countdown(r));
  if (f === 'หมดประกัน') return countdown(r).kind === 'expired';
  return true;
}

function channelLink(ch: Channel): string | null {
  const v = ch.value.trim();
  if (!v) return null;
  if (/โทร|มือถือ|เบอร์|phone|tel/i.test(ch.channel)) {
    const digits = v.replace(/[^\d+]/g, '');
    return digits ? `tel:${digits}` : null;
  }
  if (/mail/i.test(ch.channel) || /@.+\./.test(v)) return `mailto:${v}`;
  return null;
}

// -------------------- Screen --------------------

export default function LgCashDashboardScreen() {
  const { user } = useAuth();
  // ขอบจอจริง (หน้าใน Drawer ได้ insets.top = 0 จาก header) — ใช้วางป๊อปอัพไม่ให้ชนแถบสถานะ/แถบนำทาง
  const insets = useScreenInsets();

  const [rows, setRows] = useState<CashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [companyFilter, setCompanyFilter] = useState(0); // 0 = ทุกบริษัท (เว็บกรองด้วย company_id)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'import'>('all');
  const [startYear, setStartYear] = useState('all');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<CashRow | null>(null);
  // รายการที่เปิดป๊อปอัพ "จัดการเอกสารแนบ" อยู่ (เปิดได้จากการ์ดและหน้ารายละเอียด)
  const [attachFor, setAttachFor] = useState<CashRow | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (!user?.id) return;
      refresh ? setRefreshing(true) : setLoading(true);
      setLoadError(null);
      try {
        const res = await apiMobileGet(LG_API_URL, 'get_cash_dashboard', { user_id: user.id });
        setRows(Array.isArray(res.list) ? res.list.map(mapRow) : []);
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
        setAttachFor(null);
      };
    }, [])
  );

  const options = useMemo(() => {
    const comps = new Map<number, { label: string; n: number }>();
    rows.forEach((r) => {
      const cur = comps.get(r.companyId);
      comps.set(r.companyId, { label: companyLabel(r), n: (cur?.n ?? 0) + 1 });
    });
    return {
      companies: Array.from(comps.entries()).sort((a, b) => a[1].label.localeCompare(b[1].label, 'th')),
      startYears: Array.from(new Set(rows.map((r) => yearOf(r.startDate)).filter(Boolean))).sort(),
      hasImport: rows.some((r) => r.isImported),
    };
  }, [rows]);

  // ผ่านตัวกรองทุกตัวยกเว้นสถานะ — ใช้คำนวณ KPI (เว็บนับ KPI ก่อนกรองสถานะ)
  const baseRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (companyFilter && r.companyId !== companyFilter) return false;
      if (sourceFilter === 'import' && !r.isImported) return false;
      if (sourceFilter === 'manual' && r.isImported) return false;
      if (startYear !== 'all' && yearOf(r.startDate) !== startYear) return false;
      if (q) {
        const hay = [
          r.projectCode, r.condition, r.receiptNo, r.projectName, companyLabel(r), r.companyName, r.agency,
          r.agencyAddress, r.reqNickname, r.reqDepartment, r.recorder, r.lastEditor,
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, companyFilter, sourceFilter, startYear]);

  const kpi = useMemo(() => {
    const k = { amount: 0, count: 0, expiring: 0, expired: 0, canceled: 0 };
    baseRows.forEach((r) => {
      if (isCanceled(r)) {
        k.canceled++;
        return;
      }
      k.count++;
      k.amount += r.value;
      const c = countdown(r);
      if (isExpiring(c)) k.expiring++;
      if (c.kind === 'expired') k.expired++;
    });
    return k;
  }, [baseRows]);

  const filtered = useMemo(() => baseRows.filter((r) => matchStatus(r, statusFilter)), [baseRows, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, companyFilter, sourceFilter, startYear]);
  const totalPages = pageCount(filtered.length, PAGE_SIZE);
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (statusFilter !== 'all') chips.push({ key: 'st', label: statusFilter, clear: () => setStatusFilter('all') });
  if (companyFilter) chips.push({ key: 'comp', label: options.companies.find(([id]) => id === companyFilter)?.[1].label ?? 'บริษัท', clear: () => setCompanyFilter(0) });
  if (sourceFilter !== 'all') chips.push({ key: 'src', label: sourceFilter === 'import' ? 'นำเข้า' : 'บันทึกในระบบ', clear: () => setSourceFilter('all') });
  if (startYear !== 'all') chips.push({ key: 'sy', label: `เริ่มปี ${startYear}`, clear: () => setStartYear('all') });

  function resetFilters() {
    setStatusFilter('all');
    setCompanyFilter(0);
    setSourceFilter('all');
    setStartYear('all');
    setSearch('');
  }

  // -------------------- render --------------------

  function renderSummary() {
    const box = (f: StatusFilter, label: string, value: number, color: string, icon: keyof typeof Ionicons.glyphMap) => {
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
            <Ionicons name="cash" size={20} color={PRIMARY} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>มูลค่าค้ำประกันรวม</Text>
            <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
              {money(kpi.amount)} <Text style={styles.summaryUnit}>บาท</Text>
            </Text>
            <Text style={styles.summarySub}>รายการทั้งหมด {kpi.count.toLocaleString('en-US')} ฉบับ (ไม่รวมที่ยกเลิก)</Text>
          </View>
        </View>
        <Text style={styles.kpiHint}>
          <Ionicons name="funnel-outline" size={10} color="#94a3b8" /> แตะกล่องเพื่อกรองรายการ
        </Text>
        {/* จัดเป็นหมวดแบบหน้า Dashboard ขออนุมัติหนังสือค้ำ */}
        <Text style={styles.kpiGroupTitle}>อายุค้ำประกัน</Text>
        <View style={styles.kpiRow}>
          {box('ใกล้หมดอายุ', 'ใกล้หมดอายุ', kpi.expiring, RED, 'notifications')}
          {box('หมดประกัน', 'หมดประกันแล้ว', kpi.expired, GRAY, 'close-circle')}
        </View>
        <Text style={styles.kpiGroupTitle}>สถานะรายการ</Text>
        <View style={styles.kpiRow}>
          {box('ยกเลิก', 'ยกเลิก', kpi.canceled, GRAY, 'ban')}
          <View style={{ flex: 1 }} />
        </View>
      </View>
    );
  }


  function renderCard(r: CashRow) {
    const canceled = isCanceled(r);
    const badge = canceled ? null : countdownBadge(countdown(r));
    return (
      <TouchableOpacity key={r.id} activeOpacity={0.75} onPress={() => setDetail(r)} style={[styles.card, canceled && styles.cardCanceled]}>
        {canceled && (
          <View style={styles.cancelRibbon}>
            <Ionicons name="ban" size={11} color="#fff" />
            <Text style={styles.cancelRibbonText} numberOfLines={1}>ยกเลิกแล้ว{r.canceledBy ? ` โดย ${r.canceledBy}` : ''}</Text>
          </View>
        )}
        <View style={styles.cardTopRow}>
          {/* เลขหน้างาน + ป้ายที่มาแบบคอลัมน์ "เลขหน้างาน" ของเว็บ: นำเข้า (Excel) / คีย์เอง */}
          {(!r.isImported || !!r.projectCode) && (
            <View style={styles.codeBadge}>
              <Text style={styles.codeBadgeText}>{r.projectCode || '-'}</Text>
            </View>
          )}
          <View style={[styles.srcBadge, r.isImported ? styles.srcImport : styles.srcManual]}>
            <Ionicons name={r.isImported ? 'document-text' : 'keypad'} size={10} color={r.isImported ? GREEN : GRAY} />
            <Text style={[styles.srcText, { color: r.isImported ? GREEN : GRAY }]}>{r.isImported ? 'นำเข้า' : 'คีย์เอง'}</Text>
          </View>
          <View style={styles.condChip}>
            <Ionicons name="cash-outline" size={11} color={GRAY} />
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
        <Text style={[styles.cardTitle, canceled && styles.strike]} numberOfLines={2}>{r.agency || 'ไม่ระบุหน่วยงาน'}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>
          {companyLabel(r)} · ใบเสร็จ {r.receiptNo || '-'}
        </Text>
        {!!r.projectName && (
          <Text style={styles.cardSub} numberOfLines={1}>{r.projectName}</Text>
        )}
        <View style={styles.cardMoneyRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardValue, canceled && styles.strike]}>฿{money(r.value)}</Text>
            {r.totalBudget > 0 && <Text style={styles.cardBudget}>งบ ฿{money(r.totalBudget)}</Text>}
          </View>
          <Text style={styles.cardDates} numberOfLines={1}>
            {formatShortThaiDate(r.startDate || null)} → {formatShortThaiDate(r.endDate || null)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
        </View>
        <View style={styles.metaRow}>
          {!!r.recorder && (
            <View style={styles.metaItem}>
              <Ionicons name="person-add-outline" size={12} color={GRAY} />
              <Text style={styles.metaText} numberOfLines={1}>{r.recorder}</Text>
            </View>
          )}
        </View>
        {/* แถบปุ่มท้ายการ์ด: เอกสารแนบ */}
        <View style={styles.cardFooter}>
          <TouchableOpacity style={styles.footerBtn} onPress={() => setAttachFor(r)} accessibilityLabel="จัดการเอกสารแนบ">
            <Ionicons name="attach" size={15} color={PRIMARY} />
            <Text style={styles.footerBtnText}>{r.files.length > 0 ? `เอกสารแนบ (${r.files.length} ไฟล์)` : 'แนบไฟล์'}</Text>
          </TouchableOpacity>
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
    const r = detail;
    const close = () => setDetail(null);
    const badge = r && !isCanceled(r) ? countdownBadge(countdown(r)) : null;
    return (
      <Modal visible={!!r} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
        {/* ป๊อปอัพเลื่อนขึ้นจากด้านล่าง — เว้นด้านบนให้พ้นแถบสถานะ และเว้นท้ายให้พ้นแถบปุ่มนำทางของมือถือ */}
        <View style={styles.detailOverlay}>
          <TouchableOpacity style={{ height: insets.top + 24 }} activeOpacity={1} onPress={close} accessibilityLabel="ปิด" />
          <View style={[styles.detailSheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.detailGrip} />
          <View style={styles.detailHeader}>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>ค้ำเงินสด {r?.projectCode || ''}</Text>
            <TouchableOpacity onPress={close} style={styles.closeBtn} hitSlop={8} accessibilityLabel="ปิด">
              <Ionicons name="close" size={20} color="#475569" />
            </TouchableOpacity>
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
              <Section icon="cash" title="ข้อมูลค้ำเงินสด">
                <InfoRow label="เลขหน้างาน" value={r.projectCode} />
                <InfoRow label="รูปแบบการค้ำ" value={r.condition} />
                <InfoRow label="เลขที่ใบเสร็จ" value={r.receiptNo} />
                <InfoRow label="ประเภทสัญญา" value={r.contractType} />
                <InfoRow label="ชื่องบ / โครงการ" value={r.projectName} />
                <InfoRow label="บริษัท" value={r.companyName || companyLabel(r)} />
                <InfoRow label="ธนาคาร" value={r.bankBranch ? `${r.bankName} (${r.bankBranch})` : r.bankName} />
                <InfoRow label="ยอดงบประมาณ" value={r.totalBudget ? `฿${money(r.totalBudget)}` : ''} />
                <InfoRow label="มูลค่าค้ำประกัน" value={`฿${money(r.value)}`} color={GREEN} />
              </Section>
              <Section icon="calendar" title="ระยะเวลา">
                <InfoRow label="วันที่เริ่มค้ำฯ" value={formatShortThaiDate(r.startDate || null)} />
                <InfoRow label="ระยะเวลาค้ำ" value={warrantyText(r)} />
                <InfoRow label="วันที่สิ้นสุดค้ำฯ" value={formatShortThaiDate(r.endDate || null)} />
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
              <Section icon="business" title="หน่วยงาน / ผู้ติดต่อ">
                <InfoRow label="หน่วยงาน" value={r.agency} />
                <InfoRow label="ที่อยู่" value={r.agencyAddress} />
                {r.contacts.length === 0 ? (
                  <Text style={styles.emptyText}>ไม่มีข้อมูลผู้ติดต่อ</Text>
                ) : (
                  r.contacts.map((c, i) => (
                    <View key={i} style={styles.contactCard}>
                      <Text style={styles.contactName}>
                        {i + 1}. {c.name || '-'}
                        {c.position ? <Text style={styles.contactPos}>  {c.position}</Text> : null}
                      </Text>
                      {c.channels.map((ch, j) => {
                        const link = channelLink(ch);
                        return (
                          <TouchableOpacity key={j} disabled={!link} onPress={() => link && Linking.openURL(link)} style={styles.channelRow}>
                            <Ionicons name={link?.startsWith('tel:') ? 'call' : link?.startsWith('mailto:') ? 'mail' : 'chatbubble-ellipses'} size={13} color={link ? PRIMARY : GRAY} />
                            <Text style={styles.contactLine}>
                              <Text style={{ color: GRAY }}>{ch.channel}: </Text>
                              <Text style={[styles.channelValue, link && { color: PRIMARY }]}>{`${ch.value}${ch.ext ? ` ต่อ ${ch.ext}` : ''}`}</Text>
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))
                )}
              </Section>
              <Section icon="person-circle" title="ผู้ขอ / ผู้ลงข้อมูล">
                <InfoRow label="ผู้ขอ" value={r.reqFullname || r.reqNickname} />
                <InfoRow label="แผนก" value={r.reqDepartment} />
                <InfoRow label="ผู้ลงข้อมูล" value={r.recorder} />
                <InfoRow label="ผู้แก้ไขล่าสุด" value={r.lastEditor} />
              </Section>
              <Section icon="attach" title={`เอกสารแนบ (${r.files.length})`}>
                {/* ปุ่ม "จัดการเอกสารแนบ" แบบเว็บ — เพิ่มไฟล์ใหม่ / ลบไฟล์เดิม */}
                <TouchableOpacity style={styles.attachManageBtn} onPress={() => setAttachFor(r)}>
                  <Ionicons name="cloud-upload-outline" size={15} color={PRIMARY} />
                  <Text style={styles.attachManageText}>จัดการเอกสารแนบ</Text>
                </TouchableOpacity>
                {r.files.length === 0 ? (
                  <Text style={styles.emptyText}>ไม่มีเอกสารแนบ</Text>
                ) : (
                  r.files.map((f, i) => (
                    <TouchableOpacity key={i} style={styles.fileRow} onPress={() => f.filePath && Linking.openURL(`${API_BASE}/${f.filePath.replace(/^\/+/, '')}`)}>
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
              <Section icon="git-branch" title="ที่มาของข้อมูล">
                <InfoRow label="ที่มา" value={r.isImported ? 'นำเข้าจาก Excel' : 'บันทึกในระบบ'} />
                {r.isImported && <InfoRow label="หมายเหตุการนำเข้า" value={r.importNote} />}
              </Section>
            </ScrollView>
          )}
          </View>
          {renderAttachModal()}
        </View>
      </Modal>
    );
  }

  // ป๊อปอัพจัดการเอกสารแนบ — บันทึกแล้วอัปเดตรายการ/หน้ารายละเอียดทันที
  function renderAttachModal() {
    const a = attachFor;
    return (
      <AttachmentManagerModal
        visible={!!a}
        onClose={() => setAttachFor(null)}
        userId={user?.id}
        kind="cash"
        recordId={a?.id ?? 0}
        label={a?.receiptNo ?? ''} // เว็บแสดง contract_no (หน้านี้เรียกเลขที่ใบเสร็จ)
        files={(a?.files ?? []) as AttachedFile[]}
        onSaved={(files) => {
          if (!a) return;
          setRows((list) => list.map((x) => (x.id === a.id ? { ...x, files } : x)));
          setDetail((d) => (d && d.id === a.id ? { ...d, files } : d));
        }}
      />
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
    const STATUS: StatusFilter[] = ['all', 'ใกล้หมดอายุ', 'หมดประกัน', 'ยกเลิก'];
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
              {group('flag', 'สถานะ', STATUS.map((s) => opt(s, s === 'all' ? 'ทั้งหมด' : s, statusFilter === s, () => setStatusFilter(s))))}
              {options.companies.length > 0 &&
                group('business', 'บริษัท', [
                  opt('0', 'ทุกบริษัท', companyFilter === 0, () => setCompanyFilter(0)),
                  ...options.companies.map(([id, c]) => opt(String(id), c.label, companyFilter === id, () => setCompanyFilter(id), c.n)),
                ])}
              {options.hasImport &&
                group('git-branch', 'ที่มาของข้อมูล', [
                  opt('all', 'ทั้งหมด', sourceFilter === 'all', () => setSourceFilter('all')),
                  opt('manual', 'บันทึกในระบบ', sourceFilter === 'manual', () => setSourceFilter('manual')),
                  opt('import', 'นำเข้าจาก Excel', sourceFilter === 'import', () => setSourceFilter('import')),
                ])}
              {options.startYears.length > 0 &&
                group('calendar', 'ปีที่เริ่มค้ำ (ค.ศ.)', [
                  opt('all', 'ทุกปี', startYear === 'all', () => setStartYear('all')),
                  ...options.startYears.map((y) => opt(y, y, startYear === y, () => setStartYear(y))),
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

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <View style={styles.topBarSearch}>
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="ค้นหาเลขหน้างาน/ใบเสร็จ/หน่วยงาน..."
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
          {renderSummary()}
          <Text style={styles.resultText}>
            พบ {filtered.length.toLocaleString('en-US')} รายการ{statusFilter === 'all' ? ' (รวมที่ยกเลิก)' : ''}
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
      {!detail && renderAttachModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cardFooter: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 8 },
  footerBtn: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', paddingHorizontal: 10 },
  footerBtnText: { fontSize: 12.5, fontWeight: '800', color: PRIMARY },
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
  kpiHint: { fontSize: 10.5, color: '#94a3b8', marginTop: 12, marginBottom: 8 },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiGroupTitle: { fontSize: 12, fontWeight: '900', color: '#334155', marginTop: 10, marginBottom: 6 },
  kpiBox: { flex: 1, minHeight: 64, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', borderTopWidth: 4, paddingHorizontal: 9, paddingVertical: 8, gap: 4 },
  tapHintIcon: { position: 'absolute', top: 6, right: 7 },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
  kpiLabel: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  kpiValue: { color: '#0f172a', fontSize: 20, fontWeight: '900', marginTop: 'auto' },

  resultText: { marginHorizontal: 16, marginTop: 14, marginBottom: 2, fontSize: 12, color: GRAY, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 12.5, textAlign: 'center', paddingVertical: 8 },

  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 14, marginTop: 10, padding: 13, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  cardCanceled: { opacity: 0.6, backgroundColor: '#f8fafc' },
  cancelRibbon: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: RED, marginHorizontal: -13, marginTop: -13, marginBottom: 10, paddingHorizontal: 13, paddingVertical: 5 },
  cancelRibbonText: { flex: 1, color: '#fff', fontSize: 11, fontWeight: '800' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codeBadge: { backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  codeBadgeText: { color: '#4338ca', fontSize: 12, fontWeight: '900' },
  srcBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3 },
  srcImport: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  srcManual: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  srcText: { fontSize: 10, fontWeight: '800' },
  condChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 150 },
  condChipText: { fontSize: 10.5, color: '#475569', fontWeight: '700', flexShrink: 1 },
  cdBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  cdBadgeText: { fontSize: 10.5, fontWeight: '900' },
  cardTitle: { color: '#0f172a', fontSize: 14, fontWeight: '800', lineHeight: 20, marginTop: 10 },
  cardSub: { color: GRAY, fontSize: 11.5, marginTop: 3 },
  strike: { textDecorationLine: 'line-through' },
  cardMoneyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  cardValue: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  cardBudget: { fontSize: 10.5, color: GRAY, marginTop: 1 },
  cardDates: { textAlign: 'right', fontSize: 11, color: GRAY, fontWeight: '600' },
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
  cancelBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: 10 },
  cancelBoxText: { flex: 1, color: '#991b1b', fontSize: 12, fontWeight: '700' },
  section: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: '#c7d2fe', paddingHorizontal: 12, paddingBottom: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  infoLabel: { fontSize: 12, color: '#475569', fontWeight: '600', maxWidth: '45%' },
  infoValue: { flex: 1, fontSize: 12.5, color: '#0f172a', fontWeight: '800', textAlign: 'right' },
  contactCard: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginBottom: 8, gap: 4 },
  contactName: { fontSize: 13, fontWeight: '900', color: '#0f172a' },
  contactPos: { fontSize: 11, fontWeight: '600', color: GRAY },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  contactLine: { flexShrink: 1, fontSize: 12, color: '#334155' },
  channelValue: { fontWeight: '800', color: '#0f172a' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  fileTopic: { fontSize: 12.5, fontWeight: '800', color: '#0f172a' },
  fileName: { fontSize: 11, color: '#475569' },
  fileMeta: { fontSize: 10.5, color: '#94a3b8' },
  attachManageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#a5b4fc', backgroundColor: '#eef2ff', marginTop: 8, marginBottom: 4 },
  attachManageText: { fontSize: 12.5, fontWeight: '800', color: PRIMARY },
  attachCardBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 50, borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff', paddingHorizontal: 10, paddingVertical: 5 },
  attachCardText: { fontSize: 11.5, fontWeight: '800', color: PRIMARY },


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
