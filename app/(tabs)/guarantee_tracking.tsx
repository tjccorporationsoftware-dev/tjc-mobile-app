/**
 * guarantee_tracking.tsx — ติดตามหนังสือค้ำประกัน (LG) — ดูข้อมูลอย่างเดียว
 * ------------------------------------------------------------------
 * พอร์ตจากหน้าเว็บ guarantee_tracking.php (เมนู: ขออนุมัติหนังสือค้ำ › ติดตามหนังสือค้ำประกัน (LG))
 * แทนหน้าเดิม Guaranteetracking.tsx ที่ลบไปเมื่อ 17 ต.ค. 69
 * ใช้ร่วมกับ guarantee_tracking_cash.tsx (ติดตามค้ำเงินสด) ผ่าน <GuaranteeTrackingView variant="cash" />
 *   ต่างกันที่: ตาราง cash_guarantees, ลิสต์สถานะจริงจาก setup_cash_lg_status, การ์ด "หมดประกัน",
 *   ประวัติติดตามมีวันที่/สถานะ/มาจาก Excel และไม่มีผู้รับผิดชอบติดตามหนี้ (หน้าเว็บค้ำเงินสดไม่มี)
 *  - ข้อมูลจาก tjc-api/mobile_api/modules/lg_API_mobile.php?action=get_tracking
 *    (ทุกใบที่ไม่ยกเลิก ไม่รวมค้ำเงินสด ทั้งที่บันทึกในระบบและชุดนำเข้า)
 *  - แอปดูข้อมูลเป็นหลัก ไม่มีปุ่มแก้ไข / ลบ (ทำบนเว็บ) — ยกเว้น "เลือกผู้รับผิดชอบติดตามหนี้"
 *    ที่ผู้ใช้ขอเพิ่ม (save_debt_owner) เลือกได้เฉพาะ "บุคคล" จากรายชื่อพนักงาน เหมือนป๊อปอัพบนเว็บ
 *  - การ์ดสถานะ 7 ขั้น + ทั้งหมด + ยอดรวม นับจากทุกรายการ "ไม่เปลี่ยนตามตัวกรอง" เหมือนเว็บ
 *    (เว็บนับฝั่ง PHP ครั้งเดียว ตัวกรองแค่ซ่อนแถว)
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

import { formatShortThaiDate, formatShortThaiDateTime } from '../../components/DateTimeField';
import AutoGrid from '../../components/AutoGrid';
import ListPager, { pageCount } from '../../components/ListPager';
import { useScreenInsets } from '../../components/useScreenInsets';
import { API_MODULES } from '../../constants/config';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';
import { useAuth } from '../_layout';

const LG_API_URL = `${API_MODULES}/lg_API_mobile.php`;
const PAGE_SIZE = 30;

// กติกาสีทั้งแอป: ปุ่มหลัก = PRIMARY, เขียว = เสร็จ, ส้ม = รอ/กำลังทำ, แดง = เกิน/มีปัญหา, เทา = ยังไม่เริ่ม/ข้อมูลทั่วไป
const PRIMARY = '#4f46e5';
const GREEN = '#059669';
const AMBER = '#d97706';
const RED = '#dc2626';
const GRAY = '#64748b';

// สถานะติดตาม 7 ขั้น — ลำดับตามเว็บ ($status_style_map) สีตามกติกาแอป
const STATUS_META: Record<string, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  ยังไม่หมดสัญญา: { color: GRAY, icon: 'time-outline' },
  แจ้งซ่อม: { color: RED, icon: 'construct' },
  กำลังดำเนินการ: { color: AMBER, icon: 'sync' },
  ตรวจชำรุด: { color: RED, icon: 'search' },
  ได้รับหนังสือแจ้งปลดภาระผูกพัน: { color: AMBER, icon: 'lock-open' },
  อยู่ระหว่างส่งหนังสือค้ำคืนมา: { color: AMBER, icon: 'car' },
  ได้รับหนังสือค้ำแล้ว: { color: GREEN, icon: 'checkmark-circle' },
};
const DEFAULT_STATUSES = Object.keys(STATUS_META);
function statusMeta(s: string): { color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (STATUS_META[s]) return STATUS_META[s];
  if (s.includes('ปิดยอด') || s.includes('ครบ')) return { color: GREEN, icon: 'checkmark-done-circle' };
  if (s.includes('บางส่วน')) return { color: AMBER, icon: 'wallet' };
  if (s.includes('แก้ไข')) return { color: RED, icon: 'create' };
  if (s.includes('ติดตาม') || s.includes('วางเบิก') || s.includes('เช็ค') || s.includes('ดำเนินการ')) return { color: AMBER, icon: 'sync' };
  return { color: GRAY, icon: 'ellipse-outline' };
}

// -------------------- Types --------------------

interface Channel { channel: string; value: string; ext: string }
interface Contact { name: string; position: string; channels: Channel[] }
interface Followup { detail: string; createdAt: string; followupDate: string; callStatus: string; fromExcel: boolean }
interface LgFile { topic: string; filePath: string; originalName: string; uploadDate: string; uploaderName: string }

interface TrackRow {
  id: number;
  projectCode: string;
  condition: string;
  contractNo: string;
  lgNumber: string;
  docNo: string;
  projectName: string;
  companyName: string;
  companyShort: string;
  customerName: string;
  agencyAddress: string;
  bankName: string;
  bankBranch: string;
  value: number;
  totalBudget: number;
  startDate: string;
  endDate: string;
  alertDays: number;
  warrantyValue: number | null;
  warrantyUnit: string;
  status: string;
  debtType: string;
  debtName: string;
  reqFullname: string;
  reqNickname: string;
  reqPosition: string;
  reqDepartment: string;
  source: 'manual' | 'import';
  importSheet: string;
  sourceRow: string;
  contacts: Contact[];
  followups: Followup[];
  files: LgFile[];
  importNote: string;
  contractType: string;
}

const str = (v: any) => (v === null || v === undefined ? '' : String(v));

function mapRow(r: any): TrackRow {
  return {
    id: Number(r.id ?? 0),
    projectCode: str(r.project_code),
    condition: str(r.lg_condition) || 'หนังสือค้ำฯ',
    contractNo: str(r.contract_no),
    lgNumber: str(r.lg_number),
    docNo: str(r.doc_no),
    projectName: str(r.project_name),
    companyName: str(r.company_name),
    companyShort: str(r.company_shortname),
    customerName: str(r.customer_name),
    agencyAddress: str(r.agency_address),
    bankName: str(r.bank_name),
    bankBranch: str(r.bank_branch),
    value: Number(r.lg_value ?? 0) || 0,
    totalBudget: Number(r.total_budget ?? 0) || 0,
    startDate: str(r.lg_start_date),
    endDate: str(r.lg_end_date),
    alertDays: Number(r.alert_days ?? 30) || 30,
    warrantyValue: r.warranty_value === null || r.warranty_value === undefined ? null : Number(r.warranty_value),
    warrantyUnit: str(r.warranty_unit) || 'days',
    status: str(r.track_status) || 'ยังไม่หมดสัญญา',
    debtType: str(r.debt_type) || 'บุคคล',
    debtName: str(r.debt_name),
    reqFullname: str(r.req_fullname),
    reqNickname: str(r.req_nickname),
    reqPosition: str(r.req_position),
    reqDepartment: str(r.req_department),
    source: r.data_source === 'import' ? 'import' : 'manual',
    importSheet: str(r.import_sheet),
    sourceRow: str(r.source_row),
    contacts: (Array.isArray(r.contacts) ? r.contacts : []).map((c: any) => ({
      name: str(c.name),
      position: str(c.position),
      channels: (Array.isArray(c.channels) ? c.channels : []).map((ch: any) => ({ channel: str(ch.channel), value: str(ch.value), ext: str(ch.ext) })),
    })),
    followups: (Array.isArray(r.followups) ? r.followups : []).map((f: any) => ({
      detail: str(f.detail),
      createdAt: str(f.created_at),
      followupDate: str(f.followup_date),
      callStatus: str(f.call_status),
      fromExcel: !!Number(f.from_excel ?? 0),
    })),
    importNote: str(r.import_note),
    contractType: str(r.contract_type),
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

const companyLabel = (r: TrackRow) => r.companyShort.trim() || r.companyName.trim() || '-';
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const yearOf = (d: string) => (/^\d{4}/.test(d) ? d.slice(0, 4) : '');
const warrantyText = (r: TrackRow) =>
  r.warrantyValue ? `${r.warrantyValue} ${r.warrantyUnit === 'years' ? 'ปี' : r.warrantyUnit === 'months' ? 'เดือน' : 'วัน'}` : '';

// นับถอยหลัง (guarantee_tracking.php:174-187) — 4 ระดับสีเหมือนหน้า dashboard
type Countdown = { kind: 'none' | 'ok' | 'expiring' | 'today' | 'expired'; days: number };
function countdown(r: TrackRow): Countdown {
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
function countdownBadge(c: Countdown): { text: string; fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap } | null {
  switch (c.kind) {
    case 'ok':
      return { text: `เหลือ ${c.days} วัน`, fg: GREEN, bg: '#ecfdf5', icon: 'time-outline' };
    case 'expiring':
      return { text: `เหลือ ${c.days} วัน`, fg: AMBER, bg: '#fffbeb', icon: 'warning-outline' };
    case 'today':
      return { text: 'หมดวันนี้', fg: '#fff', bg: RED, icon: 'notifications' };
    case 'expired':
      return { text: `หมดแล้ว ${Math.abs(c.days)} วัน`, fg: '#fff', bg: '#94a3b8', icon: 'close-circle' };
    default:
      return null;
  }
}

// ช่องทางติดต่อ -> ลิงก์ที่กดได้ (โทร/อีเมล) — อย่างอื่นแสดงเป็นข้อความ
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

// lg = guarantee_tracking.php (หนังสือค้ำ) / cash = guarantee_tracking_cash.php (ค้ำเงินสด)
export type TrackingVariant = 'lg' | 'cash';
const VARIANT: Record<TrackingVariant, { action: string; debtEditable: boolean; showExpiredBox: boolean }> = {
  lg: { action: 'get_tracking', debtEditable: true, showExpiredBox: false },
  cash: { action: 'get_cash_tracking', debtEditable: false, showExpiredBox: true },
};
const EXPIRED_FILTER = '__expired__'; // การ์ด "หมดประกัน" ของหน้าค้ำเงินสด (toggleExpiredCard บนเว็บ)

export default function GuaranteeTrackingScreen() {
  return <GuaranteeTrackingView variant="lg" />;
}

export function GuaranteeTrackingView({ variant }: { variant: TrackingVariant }) {
  const cfg = VARIANT[variant];
  const { user } = useAuth();
  // ขอบจอจริง (หน้าใน Drawer ได้ insets.top = 0 จาก header) — ใช้วางป๊อปอัพไม่ให้ชนแถบสถานะ/แถบนำทาง
  const insets = useScreenInsets();

  const [rows, setRows] = useState<TrackRow[]>([]);
  const [statuses, setStatuses] = useState<string[]>(DEFAULT_STATUSES);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [condFilter, setCondFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [debtFilter, setDebtFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'import'>('all');
  const [startYear, setStartYear] = useState('all');
  const [endYear, setEndYear] = useState('all');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false); // ส่วนสรุปด้านบน: ปกติย่อไว้
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<TrackRow | null>(null);
  // เลือกผู้รับผิดชอบติดตามหนี้ — รายชื่อพนักงานจาก get_tracking.debt_users
  const [debtUsers, setDebtUsers] = useState<string[]>([]);
  const [debtPicker, setDebtPicker] = useState<{ row: TrackRow | null; search: string; saving: boolean }>({ row: null, search: '', saving: false });

  const load = useCallback(
    async (refresh = false) => {
      if (!user?.id) return;
      refresh ? setRefreshing(true) : setLoading(true);
      setLoadError(null);
      try {
        const res = await apiMobileGet(LG_API_URL, cfg.action, { user_id: user.id });
        setRows(Array.isArray(res.list) ? res.list.map(mapRow) : []);
        if (Array.isArray(res.track_statuses) && res.track_statuses.length > 0) setStatuses(res.track_statuses.map(String));
        setDebtUsers(Array.isArray(res.debt_users) ? res.debt_users.map(String) : []);
      } catch (e: any) {
        const notReady = e?.response?.status === 404;
        setLoadError(notReady ? 'ยังเชื่อมต่อข้อมูลไม่ได้ — เซิร์ฟเวอร์ยังไม่มี API ของหน้านี้' : e?.message || 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        refresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [user?.id, cfg.action]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setDetail(null);
        setFilterSheetOpen(false);
        setDebtPicker({ row: null, search: '', saving: false });
      };
    }, [])
  );

  // การ์ดสรุป: นับจากทุกรายการ ไม่ขึ้นกับตัวกรอง (เหมือนเว็บ)
  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    statuses.forEach((s) => (counts[s] = 0));
    let amount = 0;
    let expired = 0;
    rows.forEach((r) => {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      amount += r.value;
      if (countdown(r).kind === 'expired') expired++;
    });
    return { counts, amount, total: rows.length, expired };
  }, [rows, statuses]);

  // ตัวเลือกตัวกรอง — จากข้อมูลจริง
  const options = useMemo(() => {
    const count = (vals: string[]) => {
      const m = new Map<string, number>();
      vals.filter(Boolean).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
      return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'th'));
    };
    return {
      conds: count(rows.map((r) => r.condition)),
      companies: count(rows.map(companyLabel)),
      debts: count(rows.map((r) => r.debtName.trim() || 'ยังไม่ระบุ')),
      startYears: Array.from(new Set(rows.map((r) => yearOf(r.startDate)).filter(Boolean))).sort(),
      endYears: Array.from(new Set(rows.map((r) => yearOf(r.endDate)).filter(Boolean))).sort(),
      hasImport: rows.some((r) => r.source === 'import'),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === EXPIRED_FILTER) {
        if (countdown(r).kind !== 'expired') return false;
      } else if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (condFilter !== 'all' && r.condition !== condFilter) return false;
      if (companyFilter !== 'all' && companyLabel(r) !== companyFilter) return false;
      if (debtFilter !== 'all' && (r.debtName.trim() || 'ยังไม่ระบุ') !== debtFilter) return false;
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
      if (startYear !== 'all' && yearOf(r.startDate) !== startYear) return false;
      if (endYear !== 'all' && yearOf(r.endDate) !== endYear) return false;
      if (q) {
        const hay = [
          r.projectCode, r.condition, r.contractNo, r.lgNumber, r.docNo, r.projectName, companyLabel(r), r.companyName,
          r.customerName, r.bankName, r.status, r.debtName, r.reqFullname, r.reqNickname,
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, condFilter, companyFilter, debtFilter, sourceFilter, startYear, endYear]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, condFilter, companyFilter, debtFilter, sourceFilter, startYear, endYear]);
  const totalPages = pageCount(filtered.length, PAGE_SIZE);
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (statusFilter !== 'all') chips.push({ key: 'st', label: statusFilter === EXPIRED_FILTER ? 'หมดประกัน' : statusFilter, clear: () => setStatusFilter('all') });
  if (condFilter !== 'all') chips.push({ key: 'cond', label: condFilter, clear: () => setCondFilter('all') });
  if (companyFilter !== 'all') chips.push({ key: 'comp', label: companyFilter, clear: () => setCompanyFilter('all') });
  if (debtFilter !== 'all') chips.push({ key: 'debt', label: `ผู้ติดตาม ${debtFilter}`, clear: () => setDebtFilter('all') });
  if (sourceFilter !== 'all') chips.push({ key: 'src', label: sourceFilter === 'import' ? 'นำเข้าจาก Excel' : 'บันทึกในระบบ', clear: () => setSourceFilter('all') });
  if (startYear !== 'all') chips.push({ key: 'sy', label: `เริ่มปี ${startYear}`, clear: () => setStartYear('all') });
  if (endYear !== 'all') chips.push({ key: 'ey', label: `สิ้นสุดปี ${endYear}`, clear: () => setEndYear('all') });

  function resetFilters() {
    setStatusFilter('all');
    setCondFilter('all');
    setCompanyFilter('all');
    setDebtFilter('all');
    setSourceFilter('all');
    setStartYear('all');
    setEndYear('all');
    setSearch('');
  }

  // บันทึกผู้รับผิดชอบติดตามหนี้ แล้วอัปเดตทั้งรายการและหน้ารายละเอียดทันที (ไม่ต้องโหลดใหม่ เหมือนเว็บ)
  async function saveDebtOwner(name: string) {
    const row = debtPicker.row;
    if (!row || !user?.id) return;
    setDebtPicker((s) => ({ ...s, saving: true }));
    try {
      const res = await apiMobilePost(LG_API_URL, 'save_debt_owner', { user_id: user.id, lg_id: row.id, debt_user: name });
      const debtName = String(res.debt_name ?? name);
      const debtType = String(res.debt_type ?? 'บุคคล');
      setRows((list) => list.map((x) => (x.id === row.id ? { ...x, debtName, debtType } : x)));
      setDetail((d) => (d && d.id === row.id ? { ...d, debtName, debtType } : d));
      setDebtPicker({ row: null, search: '', saving: false });
    } catch (e: any) {
      setDebtPicker((s) => ({ ...s, saving: false }));
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // ป๊อปอัพเลือกผู้รับผิดชอบ — render "ใน" โมดัลรายละเอียด ให้ซ้อนอยู่ด้านบนบน Android
  function renderDebtPicker() {
    const row = debtPicker.row;
    const q = debtPicker.search.trim().toLowerCase();
    const list = debtUsers.filter((n) => !q || n.toLowerCase().includes(q));
    const close = () => {
      if (!debtPicker.saving) setDebtPicker({ row: null, search: '', saving: false });
    };
    return (
      <Modal visible={!!row} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHead}>
              <Ionicons name="person-circle" size={18} color={PRIMARY} />
              <Text style={styles.pickerTitle}>ผู้รับผิดชอบติดตามหนี้</Text>
              <TouchableOpacity onPress={close} hitSlop={8}>
                <Ionicons name="close" size={20} color={GRAY} />
              </TouchableOpacity>
            </View>
            {!!row && (
              <Text style={styles.pickerSub} numberOfLines={1}>
                {row.projectCode || row.lgNumber || ''} · {row.customerName}
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
                    const current = row?.debtName === n;
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

  // -------------------- render: การ์ดสรุป --------------------

  function renderSummary() {
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

    const box = (key: string, label: string, value: number, color: string, icon: keyof typeof Ionicons.glyphMap) => {
      const active = statusFilter === key;
      return (
        <TouchableOpacity
          key={key}
          style={[styles.kpiBox, { borderTopColor: color }, active && { borderColor: color, backgroundColor: color + '0d' }]}
          onPress={() => setStatusFilter(active || key === 'all' ? 'all' : key)}
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
            <Ionicons name="list-circle" size={22} color={PRIMARY} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>ยอดค้ำฯ รวม</Text>
            <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
              {money(summary.amount)} <Text style={styles.summaryUnit}>บาท</Text>
            </Text>
            <Text style={styles.summarySub}>ทั้งหมด {summary.total.toLocaleString('en-US')} ใบ (ไม่รวมที่ยกเลิก)</Text>
          </View>
        </View>
        {!summaryOpen && (
          <AutoGrid style={styles.quickRow}>
            {statuses
              .filter((s) => (summary.counts[s] ?? 0) > 0)
              .map((s) => quick(s, s, summary.counts[s] ?? 0, statusMeta(s).color, statusFilter === s, () => setStatusFilter(statusFilter === s ? 'all' : s)))}
            {cfg.showExpiredBox &&
              quick(EXPIRED_FILTER, 'หมดประกัน', summary.expired, GRAY, statusFilter === EXPIRED_FILTER, () =>
                setStatusFilter(statusFilter === EXPIRED_FILTER ? 'all' : EXPIRED_FILTER)
              )}
          </AutoGrid>
        )}
        {summaryOpen && (
          <>
        <Text style={styles.kpiHint}>
          <Ionicons name="funnel-outline" size={10} color="#94a3b8" /> สถานะการติดตาม — แตะเพื่อกรองรายการ
        </Text>
        {/* จัดสถานะเป็นหมวดตามกติกาสี (เทา = ปกติ, แดง = มีปัญหา, ส้ม = กำลังดำเนินการ, เขียว = เสร็จสิ้น) */}
        {[
          { title: 'ภาพรวม', color: GRAY, withAll: true },
          { title: 'มีปัญหา', color: RED },
          { title: 'กำลังดำเนินการ', color: AMBER },
          { title: 'เสร็จสิ้น', color: GREEN },
        ].map((g) => {
          const list = statuses.filter((s) => statusMeta(s).color === g.color);
          if (!g.withAll && list.length === 0) return null;
          return (
            <View key={g.title}>
              <Text style={styles.kpiGroupTitle}>{g.title}</Text>
              <View style={styles.kpiGrid}>
                {g.withAll && box('all', 'ทั้งหมด', summary.total, PRIMARY, 'layers')}
                {list.map((s) => box(s, s, summary.counts[s] ?? 0, statusMeta(s).color, statusMeta(s).icon))}
              </View>
            </View>
          );
        })}
        {cfg.showExpiredBox && (
          <>
            <Text style={styles.kpiGroupTitle}>อายุค้ำประกัน</Text>
            <View style={styles.kpiGrid}>{box(EXPIRED_FILTER, 'หมดประกัน', summary.expired, GRAY, 'close-circle')}</View>
          </>
        )}
          </>
        )}
        {summaryToggle}
      </View>
    );
  }


  // -------------------- render: การ์ดรายการ --------------------

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

  function renderCard(r: TrackRow) {
    const badge = countdownBadge(countdown(r));
    const sm = statusMeta(r.status);
    return (
      <TouchableOpacity key={r.id} activeOpacity={0.75} onPress={() => setDetail(r)} style={styles.card}>
        <View style={styles.cardTopRow}>
          {/* เลขหน้างาน + ที่มาของรายการ (นำเข้าจาก Excel / คีย์เองในระบบ) */}
          <View style={styles.codeBadge}>
            <Text style={styles.codeBadgeText}>{r.projectCode || r.lgNumber || '-'}</Text>
            <View style={styles.codeBadgeDivider} />
            <Ionicons
              name={r.source === 'import' ? 'layers-outline' : 'create-outline'}
              size={11}
              color={r.source === 'import' ? '#b45309' : '#0f766e'}
            />
            <Text style={[styles.codeSourceText, { color: r.source === 'import' ? '#b45309' : '#0f766e' }]}>
              {r.source === 'import' ? 'นำเข้า' : 'คีย์เอง'}
            </Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: sm.color + '14', borderColor: sm.color + '55' }]}>
            <Ionicons name={sm.icon} size={11} color={sm.color} />
            <Text style={[styles.statusChipText, { color: sm.color }]} numberOfLines={1}>{r.status}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {badge && (
            <View style={[styles.cdBadge, { backgroundColor: badge.bg }]}>
              <Ionicons name={badge.icon} size={11} color={badge.fg} />
              <Text style={[styles.cdBadgeText, { color: badge.fg }]}>{badge.text}</Text>
            </View>
          )}
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{r.customerName || 'ไม่ระบุหน่วยงาน'}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>
          {companyLabel(r)} · {r.condition} · {r.bankName || '-'}
        </Text>

        <View style={styles.cardMoneyRow}>
          <Text style={styles.cardValue}>฿{money(r.value)}</Text>
          <Text style={styles.cardDates} numberOfLines={1}>
            {formatShortThaiDate(r.startDate || null)} → {formatShortThaiDate(r.endDate || null)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
        </View>

        <View style={styles.metaRow}>
          {r.followups.length > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="chatbubbles-outline" size={12} color={GRAY} />
              <Text style={styles.metaText}>ติดตาม {r.followups.length} ครั้ง</Text>
            </View>
          )}
        </View>
        {/* แถบปุ่มท้ายการ์ด: ผู้รับผิดชอบ */}
        {cfg.debtEditable && (
          <View style={styles.cardFooter}>
            {renderOwnerRow(r.debtName, r.debtType === 'ทีม', () => setDebtPicker({ row: r, search: '', saving: false }))}
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
    const badge = r ? countdownBadge(countdown(r)) : null;
    const sm = r ? statusMeta(r.status) : null;
    return (
      <Modal visible={!!r} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
        {/* ป๊อปอัพเลื่อนขึ้นจากด้านล่าง — เว้นด้านบนให้พ้นแถบสถานะ และเว้นท้ายให้พ้นแถบปุ่มนำทางของมือถือ */}
        <View style={styles.detailOverlay}>
          <TouchableOpacity style={{ height: insets.top + 24 }} activeOpacity={1} onPress={close} accessibilityLabel="ปิด" />
          <View style={[styles.detailSheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.detailGrip} />
          <View style={styles.detailHeader}>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>
              {r ? [r.projectCode || r.lgNumber, r.customerName].filter(Boolean).join(' · ') || 'รายละเอียด' : ''}
            </Text>
            <TouchableOpacity onPress={close} style={styles.closeBtn} hitSlop={8} accessibilityLabel="ปิด">
              <Ionicons name="close" size={20} color="#475569" />
            </TouchableOpacity>
          </View>
          {r && sm && (
            <ScrollView contentContainerStyle={styles.detailScroll}>
              <View style={[styles.statusBanner, { backgroundColor: sm.color + '14', borderColor: sm.color + '55' }]}>
                <Ionicons name={sm.icon} size={18} color={sm.color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusBannerLabel}>สถานะการติดตาม</Text>
                  <Text style={[styles.statusBannerValue, { color: sm.color }]}>{r.status}</Text>
                </View>
                {badge && (
                  <View style={[styles.cdBadge, { backgroundColor: badge.bg }]}>
                    <Ionicons name={badge.icon} size={11} color={badge.fg} />
                    <Text style={[styles.cdBadgeText, { color: badge.fg }]}>{badge.text}</Text>
                  </View>
                )}
              </View>

              <Section icon="document-text" title="ข้อมูลหนังสือค้ำ">
                <InfoRow label="เลขหน้างาน" value={r.projectCode} />
                <InfoRow label="เลขที่สัญญา" value={r.contractNo} />
                <InfoRow label="เลขที่ LG" value={r.lgNumber} />
                <InfoRow label="เลขหนังสือออก" value={r.docNo} />
                <InfoRow label="รูปแบบการค้ำ" value={r.condition} />
                {!!r.contractType && <InfoRow label="ประเภทสัญญา" value={r.contractType} />}
                <InfoRow label="โครงการ" value={r.projectName} />
                <InfoRow label="บริษัท" value={r.companyName || companyLabel(r)} />
                <InfoRow label="ธนาคาร" value={r.bankBranch ? `${r.bankName} (${r.bankBranch})` : r.bankName} />
                <InfoRow label="งบประมาณโครงการ" value={r.totalBudget ? `฿${money(r.totalBudget)}` : ''} />
                <InfoRow label="มูลค่าค้ำประกัน" value={`฿${money(r.value)}`} color={GREEN} />
              </Section>

              <Section icon="calendar" title="ระยะเวลา">
                <InfoRow label="วันที่เริ่มค้ำฯ" value={formatShortThaiDate(r.startDate || null)} />
                <InfoRow label="ระยะเวลาค้ำ" value={warrantyText(r)} />
                <InfoRow label="วันที่สิ้นสุดค้ำฯ" value={formatShortThaiDate(r.endDate || null)} />
                <InfoRow label="แจ้งเตือนล่วงหน้า" value={`${r.alertDays} วัน`} />
              </Section>

              {cfg.debtEditable && (
              <Section icon={r.debtType === 'ทีม' ? 'people' : 'person'} title="ผู้รับผิดชอบติดตามหนี้">
                <View style={styles.debtRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{r.debtType === 'ทีม' ? 'ทีม' : 'บุคคล'}</Text>
                    <Text style={[styles.debtName, !r.debtName && { color: '#94a3b8' }]}>{r.debtName || 'ยังไม่ระบุ'}</Text>
                  </View>
                  <TouchableOpacity style={styles.debtBtn} onPress={() => setDebtPicker({ row: r, search: '', saving: false })}>
                    <Ionicons name={r.debtName ? 'swap-horizontal' : 'person-add'} size={14} color="#fff" />
                    <Text style={styles.debtBtnText}>{r.debtName ? 'เปลี่ยน' : 'เลือก'}</Text>
                  </TouchableOpacity>
                </View>
              </Section>
              )}

              <Section icon="business" title="หน่วยงาน / ผู้ติดต่อ">
                <InfoRow label="หน่วยงาน" value={r.customerName} />
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
                      {c.channels.length === 0 ? (
                        <Text style={styles.contactLine}>-</Text>
                      ) : (
                        c.channels.map((ch, j) => {
                          const link = channelLink(ch);
                          const text = `${ch.value}${ch.ext ? ` ต่อ ${ch.ext}` : ''}`;
                          return (
                            <TouchableOpacity key={j} disabled={!link} onPress={() => link && Linking.openURL(link)} style={styles.channelRow}>
                              <Ionicons name={link?.startsWith('tel:') ? 'call' : link?.startsWith('mailto:') ? 'mail' : 'chatbubble-ellipses'} size={13} color={link ? PRIMARY : GRAY} />
                              <Text style={styles.contactLine}>
                                <Text style={{ color: GRAY }}>{ch.channel}: </Text>
                                <Text style={[styles.channelValue, link && { color: PRIMARY }]}>{text}</Text>
                              </Text>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  ))
                )}
              </Section>

              <Section icon="chatbubbles" title={`ประวัติการติดตาม (${r.followups.length})`}>
                {r.followups.length === 0 ? (
                  <Text style={styles.emptyText}>ยังไม่มีประวัติการติดตาม</Text>
                ) : (
                  r.followups.map((f, i) => (
                    <View key={i} style={styles.followRow}>
                      <View style={styles.followDot} />
                      <View style={{ flex: 1 }}>
                        {(!!f.followupDate || !!f.callStatus || f.fromExcel) && (
                          <View style={styles.followHead}>
                            {!!f.followupDate && <Text style={styles.followDate}>{formatShortThaiDate(f.followupDate)}</Text>}
                            {!!f.callStatus && (
                              <View style={[styles.followStatus, { backgroundColor: statusMeta(f.callStatus).color + '14' }]}>
                                <Text style={[styles.followStatusText, { color: statusMeta(f.callStatus).color }]}>{f.callStatus}</Text>
                              </View>
                            )}
                            {f.fromExcel && <Text style={styles.followExcel}>Excel</Text>}
                          </View>
                        )}
                        {!!f.detail && <Text style={styles.followText}>{f.detail}</Text>}
                        {!!f.createdAt && <Text style={styles.followAt}>{formatShortThaiDateTime(f.createdAt)}</Text>}
                      </View>
                    </View>
                  ))
                )}
              </Section>

              <Section icon="person-circle" title="ผู้ขอ">
                <InfoRow label="ชื่อ" value={r.reqFullname} />
                <InfoRow label="ชื่อเล่น" value={r.reqNickname} />
                <InfoRow label="ตำแหน่ง" value={r.reqPosition} />
                <InfoRow label="แผนก" value={r.reqDepartment} />
              </Section>

              {/* ไม่มีกล่องเอกสารแนบ — หน้าเว็บติดตาม (LG / ค้ำเงินสด) ไม่ได้แสดงไฟล์แนบ */}
              <Section icon="git-branch" title="ที่มาของข้อมูล">
                <InfoRow label="ที่มา" value={r.source === 'import' ? 'นำเข้าจาก Excel' : 'บันทึกในระบบ'} />
                {r.source === 'import' && !!r.importSheet && <InfoRow label="ชีท" value={r.importSheet} />}
                {r.source === 'import' && !!r.sourceRow && <InfoRow label="แถวในไฟล์" value={r.sourceRow} />}
                {r.source === 'import' && !!r.importNote && <InfoRow label="หมายเหตุการนำเข้า" value={r.importNote} />}
              </Section>
            </ScrollView>
          )}
          {renderDebtPicker()}
          </View>
        </View>
      </Modal>
    );
  }

  // -------------------- render: แผ่นตัวกรอง --------------------

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
              {group('flag', 'สถานะการติดตาม', [
                opt('all', 'ทั้งหมด', statusFilter === 'all', () => setStatusFilter('all')),
                ...statuses.map((s) => opt(s, s, statusFilter === s, () => setStatusFilter(s), summary.counts[s] ?? 0)),
                ...(cfg.showExpiredBox ? [opt(EXPIRED_FILTER, 'หมดประกัน', statusFilter === EXPIRED_FILTER, () => setStatusFilter(EXPIRED_FILTER), summary.expired)] : []),
              ])}
              {options.conds.length > 0 &&
                group('document-text', 'รูปแบบการค้ำ', [
                  opt('all', 'ทั้งหมด', condFilter === 'all', () => setCondFilter('all')),
                  ...options.conds.map(([n, c]) => opt(n, n, condFilter === n, () => setCondFilter(n), c)),
                ])}
              {options.companies.length > 0 &&
                group('business', 'บริษัท', [
                  opt('all', 'ทุกบริษัท', companyFilter === 'all', () => setCompanyFilter('all')),
                  ...options.companies.map(([n, c]) => opt(n, n, companyFilter === n, () => setCompanyFilter(n), c)),
                ])}
              {cfg.debtEditable && options.debts.length > 0 &&
                group('person', 'ผู้รับผิดชอบติดตามหนี้', [
                  opt('all', 'ทุกคน', debtFilter === 'all', () => setDebtFilter('all')),
                  ...options.debts.map(([n, c]) => opt(n, n, debtFilter === n, () => setDebtFilter(n), c)),
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
              {options.endYears.length > 0 &&
                group('calendar-clear', 'ปีที่สิ้นสุด (ค.ศ.)', [
                  opt('all', 'ทุกปี', endYear === 'all', () => setEndYear('all')),
                  ...options.endYears.map((y) => opt(y, y, endYear === y, () => setEndYear(y))),
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
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <View style={styles.topBarSearch}>
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="ค้นหาเลขหน้างาน/สัญญา/หน่วยงาน..."
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
          <Text style={styles.resultText}>พบ {filtered.length.toLocaleString('en-US')} รายการ</Text>
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
      {/* เปิดจากการ์ดในรายการ — ตอนเปิดหน้ารายละเอียดอยู่จะใช้ตัวที่ซ้อนในโมดัลรายละเอียดแทน */}
      {!detail && renderDebtPicker()}
    </SafeAreaView>
  );
}

// -------------------- Styles --------------------

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

  summaryCard: { marginHorizontal: 14, marginTop: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden', paddingHorizontal: 12, paddingBottom: 12 },
  summaryTopBar: { height: 4, marginHorizontal: -12, backgroundColor: PRIMARY },
  summaryTotalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14 },
  summaryIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { color: GRAY, fontSize: 12, fontWeight: '700' },
  summaryValue: { color: '#0f172a', fontSize: 22, fontWeight: '900', marginTop: 2 },
  summaryUnit: { fontSize: 13, fontWeight: '700', color: '#475569' },
  summarySub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  kpiHint: { fontSize: 10.5, color: '#94a3b8', marginTop: 12, marginBottom: 8 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  kpiGroupTitle: { fontSize: 12, fontWeight: '900', color: '#334155', marginTop: 10, marginBottom: 6 },
  kpiBox: { width: '48.8%', minHeight: 64, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', borderTopWidth: 4, paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  tapHintIcon: { position: 'absolute', top: 6, right: 7 },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
  kpiLabel: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  kpiValue: { color: '#0f172a', fontSize: 20, fontWeight: '900', marginTop: 'auto' },

  resultText: { marginHorizontal: 16, marginTop: 14, marginBottom: 2, fontSize: 12, color: GRAY, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 12.5, textAlign: 'center', paddingVertical: 8 },

  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 14, marginTop: 10, padding: 13, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTopRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  codeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  codeBadgeText: { color: '#4338ca', fontSize: 12, fontWeight: '900' },
  codeBadgeDivider: { width: 1, height: 12, backgroundColor: '#c7d2fe', marginHorizontal: 2 },
  codeSourceText: { fontSize: 10.5, fontWeight: '800' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 170 },
  statusChipText: { fontSize: 10.5, fontWeight: '800', flexShrink: 1 },
  cdBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  cdBadgeText: { fontSize: 10.5, fontWeight: '900' },
  cardTitle: { color: '#0f172a', fontSize: 14, fontWeight: '800', lineHeight: 20, marginTop: 10 },
  cardSub: { color: GRAY, fontSize: 11.5, marginTop: 3 },
  cardMoneyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  cardValue: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  cardDates: { flex: 1, textAlign: 'right', fontSize: 11, color: GRAY, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaText: { fontSize: 11, color: '#475569', fontWeight: '600', flexShrink: 1 },

  detailOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  detailSheet: { flex: 1, backgroundColor: '#f8fafc', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  detailGrip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginTop: 8, marginBottom: 2 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8fafc', paddingLeft: 16, paddingRight: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  detailHeaderTitle: { flex: 1, fontSize: 15, fontWeight: '900', color: '#0f172a' },
  detailScroll: { padding: 14, paddingBottom: 32, gap: 12 },
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
  statusBannerLabel: { fontSize: 11, color: GRAY, fontWeight: '700' },
  statusBannerValue: { fontSize: 15, fontWeight: '900', marginTop: 1 },
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
  debtRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  debtName: { fontSize: 14, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  debtBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  debtBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  debtChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 4 },
  debtChipEmpty: { backgroundColor: '#fff', borderStyle: 'dashed', borderColor: '#a5b4fc' },
  debtChipText: { fontSize: 11, color: '#3730a3', fontWeight: '800', flexShrink: 1 },
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
  followRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  followDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY, marginTop: 5 },
  followHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 3 },
  followDate: { fontSize: 11.5, fontWeight: '800', color: '#334155' },
  followStatus: { borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2 },
  followStatusText: { fontSize: 10.5, fontWeight: '800' },
  followExcel: { fontSize: 10, fontWeight: '800', color: GRAY, backgroundColor: '#f1f5f9', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  followText: { fontSize: 12.5, color: '#0f172a', lineHeight: 19 },
  followAt: { fontSize: 10.5, color: '#94a3b8', marginTop: 2 },
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
