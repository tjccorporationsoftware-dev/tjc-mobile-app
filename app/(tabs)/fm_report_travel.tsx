/**
 * TravelAllowanceScreen.tsx
 * ------------------------------------------------------------------
 * หน้ารายการ "เบี้ยเลี้ยงขนส่ง" (fm_report_travel.php, mode=list) — ต่อ API จริงแล้ว
 * ผ่าน fm_travel_API_mobile.php (${API_MODULES}/fm_travel_API_mobile.php)
 *
 * เปลี่ยนจาก mockup เดิม:
 *  - ลบ MOCK_DRIVERS/DEFAULT_RATE_OPTIONS + ฟีเจอร์ "ตั้งค่าตัวเลือกเบี้ยเลี้ยง" (เพิ่ม/แก้/ลบ
 *    เกณฑ์) ออกทั้งหมด — ไม่มี action สำหรับ CRUD เกณฑ์ใน backend จริง (มีแค่ get_master_data
 *    ที่ "อ่าน" เกณฑ์ที่มีอยู่แล้วเพื่อใช้ในฟอร์มกรอกข้อมูล) ตามกติกา "ไม่มี action = ตัดทิ้ง"
 *  - ช่วงวันที่รอบเบิกเปลี่ยนเป็น "อ่านอย่างเดียว" ผูกกับ get_pay_cycle/get_master_data.pay_cycle
 *    แทนช่องกรอกวันที่เอง (ของเดิมให้พิมพ์วันที่มั่ว ๆ ได้ ซึ่งไม่มี action รองรับการ "ตั้งวันที่เอง"
 *    มีแต่ปุ่มรอบก่อนหน้า/รอบถัดไปที่ตรงกับ get_pay_cycle.prev/next จริง ๆ)
 *  - การ์ดคนขับ, แถบสรุปสถานะ ดึงจาก get_list/get_dashboard จริง ไม่ได้ reduce เองฝั่งไคลเอนต์
 *  - ปุ่ม "แก้ไขข้อมูล/กรอกข้อมูลใหม่" ถูกซ่อนถ้า can_save = false (สิทธิ์จากเซิร์ฟเวอร์)
 *
 * เพิ่ม: กล่องสรุป "ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง" (fm_report_travel.php:2272-2500) —
 * เดิมหน้านี้มีแค่การ์ดคนขับ (get_list) ไม่มีสรุปสถานะรอบเบิก/ขั้นตอนลงนาม 3 ฝ่ายเลย ทั้งที่เว็บมี
 * กล่องนี้แยกต่างหาก ต่อ action ใหม่ get_approval_rows (คนละชุดข้อมูลกับ get_list — เอาเฉพาะใบที่
 * มีอยู่จริงในตาราง expense_forms ของรอบนี้) คำนวณการ์ดสรุป/กรองทั้งหมดฝั่งแอปเองจากแถวชุดนี้
 * ตรงกับที่เว็บทำเป็น client-side JS ล้วน (ไม่มี endpoint สรุปแยกบนเว็บเช่นกัน) — กดการ์ดเพื่อกรอง
 * ตารางด้านล่างได้เหมือนต้นฉบับ (สถานะรอบ/HR/หัวหน้า กรองร่วมกันแบบ AND)
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 🌟 ปุ่มเลือกวันที่/รูปแบบย่อ "d/m/yy" มาตรฐานเดียวกันทั้งแอป (components/DateTimeField.tsx)
import { DateField, formatShortThaiDate, formatShortThaiDateTime } from '../../components/DateTimeField';
// ✅ Config + API helper กลาง (ตรงกับ pattern ที่ใช้ทั่วโปรเจกต์: apiMobileGet/apiMobilePost)
import { useAuth } from '../_layout';
import { apiMobileGet } from '../../service/api_mobile';
import TravelAllowanceFormScreen from './fm_report_travel_form';
import TravelAllowanceMapScreen from './fm_report_travel_map';
import TravelAllowanceViewScreen from './fm_report_travel_view';

// 🌟 [ใหม่] URL โมดูลจริง — ตามธรรมเนียมของไฟล์นี้: ประกาศ const local ในไฟล์ (ดู accounting_dashboard.tsx)
import { API_MODULES } from '../../constants/config';
const FM_TRAVEL_API_URL = `${API_MODULES}/fm_travel_API_mobile.php`;

// ====================================================================
// Types — สะท้อน field จริงจาก get_list / get_dashboard / get_master_data
// ====================================================================

interface DriverRow {
  id: number;
  name: string;
  photoUrl?: string;
  hasData: boolean;
  totalAmount: number;
  jobTotal: number;
  jobDone: number;
  lastUpdateShow?: string; // ส่วนวันที่ของ updated_at_thai
  lastUpdateTime?: string; // ส่วนเวลาของ updated_at_thai
  statusEffective?: string;
  statusEffectiveText?: string;
}

interface DashboardStats {
  savedCount: number;
  unsavedCount: number;
  totalCount: number;
  jobSum: number;
  jobDoneSum: number;
  totalAmountSum: number;
}

// กล่องสรุป "ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง" (fm_report_travel.php:2272-2364) — คนละชุดข้อมูลกับ
// DriverRow ด้านบน: เอาเฉพาะใบที่มีอยู่จริงในตาราง expense_forms ของรอบนี้ (get_approval_rows)
type ApprovalStatus = 'filling' | 'overdue' | 'checked' | 'approved';

interface ApprovalRow {
  formId: number;
  driverId: number;
  driverName: string;
  amount: number;
  status: ApprovalStatus;
  statusText: string;
  entries: number;
  entryRange?: string;
  adminBy: string;
  checkedBy: string;
  approvedBy: string;
  isChecked: boolean;
  isApproved: boolean;
  savedBy: string;
  updatedThai: string;
}

function mapApprovalRow(row: any): ApprovalRow {
  return {
    formId: Number(row.form_id ?? 0),
    driverId: Number(row.driver_id ?? 0),
    driverName: String(row.driver_name ?? ''),
    amount: Number(row.amount ?? 0),
    status: (row.status ?? 'filling') as ApprovalStatus,
    statusText: String(row.status_text ?? ''),
    entries: Number(row.entries ?? 0),
    entryRange: row.entry_range || undefined,
    adminBy: String(row.admin_by ?? ''),
    checkedBy: String(row.checked_by ?? ''),
    approvedBy: String(row.approved_by ?? ''),
    isChecked: !!row.is_checked,
    isApproved: !!row.is_approved,
    savedBy: String(row.saved_by ?? ''),
    // ใช้ updated (ดิบ) จัดรูปแบบเอง — updated_thai ของเซิร์ฟเวอร์เป็น พ.ศ. ไม่ตรงกับรูปแบบวันที่ทั้งแอป
    updatedThai: row.updated ? formatShortThaiDateTime(row.updated) : String(row.updated_thai ?? ''),
  };
}

interface PermFlags {
  canSave: boolean;
  canSignRequester: boolean;
  canSignChecker: boolean;
  canSignApprover: boolean;
  canFullAccess: boolean;
  myDriverId: number;
  myDriverName: string;
  lockedToSelf: boolean;
}

export interface TravelAllowanceScreenProps {
  onBack?: () => void;
}

// ====================================================================
// Helpers
// ====================================================================

// เทียบเท่า MoneyFmt() ของต้นฉบับ — จำนวนเต็มไม่โชว์ทศนิยม มีเศษถึงโชว์ 2 ตำแหน่ง
function moneyFmt(v: number): string {
  const n = Math.round(v * 100) / 100;
  return n === Math.floor(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// หมายเหตุ: ฟิลด์รายแถวของ get_list ไม่ได้ระบุชื่อ field แบบเป๊ะ ๆ ในเอกสาร (มีแค่ "list[]"
// เฉย ๆ + ระบุเพิ่มว่ามี signed_requester/signed_checker/signed_approver ต่อแถว) จึง map
// แบบมี fallback หลายชื่อ โดยยึดรูปแบบการตั้งชื่อเดียวกับ action อื่นในไฟล์เดียวกัน
// (get_dashboard: job_sum/job_done_sum/total_amount_sum, get_detail: grand_total/form_exists)
function mapDriverRow(row: any): DriverRow {
  // get_list ส่งวันที่ดิบมาใน last_update (เดิมอ่าน updated_at_thai ซึ่งไม่มีใน get_list -> "บันทึกล่าสุด" ว่างเสมอ)
  const rawUpdate: string = row.last_update || row.updated_at || '';
  const timeM = rawUpdate.match(/(\d{2}):(\d{2})(?::\d{2})?$/);
  const dateShow = rawUpdate ? formatShortThaiDate(rawUpdate) : undefined;
  const timeShow = timeM ? `${timeM[1]}:${timeM[2]}` : undefined;
  return {
    id: Number(row.driver_id ?? row.id ?? 0),
    name: String(row.driver_name ?? row.name ?? ''),
    photoUrl: row.photo_url || undefined,
    hasData: !!(row.form_exists ?? row.has_data ?? Number(row.grand_total ?? 0) > 0),
    totalAmount: Number(row.grand_total ?? row.total_amount ?? 0),
    jobTotal: Number(row.job_total ?? row.jobs_count ?? 0),
    jobDone: Number(row.job_done ?? row.job_done_count ?? 0),
    lastUpdateShow: dateShow,
    lastUpdateTime: timeShow,
    statusEffective: row.status_effective,
    statusEffectiveText: row.status_effective_text,
  };
}

// ====================================================================
// Main screen
// ====================================================================

export default function TravelAllowanceScreen({ onBack }: TravelAllowanceScreenProps) {
  const { user } = useAuth();

  const [startDate, setStartDate] = useState(''); // YYYY-MM-DD ไว้ส่งเข้า API
  const [endDate, setEndDate] = useState('');
  // แสดงผลย่อ "d/m/yy" คำนวณจาก startDate/endDate ตรงๆ (formatShortThaiDate) แทนการเก็บ
  // start_date_thai/end_date_thai แบบเต็ม ("5 กันยายน 2569") ที่ API ส่งมา — ให้ทุกหน้าในแอป
  // แสดงวันที่รูปแบบเดียวกันหมด ไม่ต้องพึ่งฟอร์แมตของ server ต่อ action
  const startDateThai = formatShortThaiDate(startDate);
  const endDateThai = formatShortThaiDate(endDate);

  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ savedCount: 0, unsavedCount: 0, totalCount: 0, jobSum: 0, jobDoneSum: 0, totalAmountSum: 0 });
  const [perm, setPerm] = useState<PermFlags>({
    canSave: false,
    canSignRequester: false,
    canSignChecker: false,
    canSignApprover: false,
    canFullAccess: false,
    myDriverId: 0,
    myDriverName: '',
    lockedToSelf: false,
  });

  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cycleLoading, setCycleLoading] = useState(false);

  // ค้นหาตามช่วงวันที่เอง — คนละส่วนกับรอบเบิก (pay cycle) ด้านบน ดูคอมเมนต์ toApiDate()
  const [customStartInput, setCustomStartInput] = useState('');
  const [customEndInput, setCustomEndInput] = useState('');
  const [customRangeActive, setCustomRangeActive] = useState(false);

  const [formScreen, setFormScreen] = useState<{ visible: boolean; driver?: DriverRow }>({ visible: false });
  const [viewScreen, setViewScreen] = useState<{ visible: boolean; driver?: DriverRow }>({ visible: false });
  const [mapVisible, setMapVisible] = useState(false);

  // กล่องสรุป "ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง" — action get_approval_rows
  const [approvalRows, setApprovalRows] = useState<ApprovalRow[]>([]);
  const [approvalCycleOpen, setApprovalCycleOpen] = useState(false);
  const [apStatusFilter, setApStatusFilter] = useState<'all' | 'filling' | 'overdue'>('all');
  const [apCheckFilter, setApCheckFilter] = useState<'' | 'yes' | 'no'>('');
  const [apApproveFilter, setApApproveFilter] = useState<'' | 'yes' | 'no'>('');
  const [apSearch, setApSearch] = useState('');
  const [apExpanded, setApExpanded] = useState(false);

  // แถบค้นหา/ตัวกรองด้านบน (แบบหน้าเอกสาร PO/AX) — กรองการ์ดคนขับฝั่งแอป
  const [driverSearch, setDriverSearch] = useState('');
  const [driverFilter, setDriverFilter] = useState<'all' | 'saved' | 'unsaved'>('all');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // ออกจากหน้านี้ (สลับเมนูใน drawer) -> ปิดหน้าย่อย/ชีตที่เปิดค้างไว้ กลับมาเจอหน้ารายการเสมอ
  useFocusEffect(
    useCallback(() => {
      return () => {
        setFormScreen({ visible: false });
        setViewScreen({ visible: false });
        setMapVisible(false);
        setFilterSheetOpen(false);
      };
    }, [])
  );

  // โหลดช่วงรอบเบิกเริ่มต้นจาก get_master_data.pay_cycle (ไม่คำนวณรอบเองฝั่งไคลเอนต์)
  const initCycle = useCallback(async () => {
    if (!user) return;
    setInitializing(true);
    try {
      const res = await apiMobileGet(FM_TRAVEL_API_URL, 'get_master_data', { user_id: user.id });
      const cycle = res.pay_cycle;
      if (cycle) {
        setStartDate(cycle.start_date);
        setEndDate(cycle.end_date);
      }
    } catch (e: any) {
      Alert.alert('โหลดข้อมูลตั้งต้นไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setInitializing(false);
    }
  }, [user]);

  useEffect(() => {
    void initCycle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // โหลดรายการคนขับ + สรุป KPI ของรอบเบิกปัจจุบัน
  const loadPeriodData = useCallback(
    async (refresh = false) => {
      if (!user || !startDate || !endDate) return;
      refresh ? setRefreshing(true) : setLoading(true);
      try {
        const [listRes, dashRes, approvalRes] = await Promise.all([
          apiMobileGet(FM_TRAVEL_API_URL, 'get_list', { user_id: user.id, start_date: startDate, end_date: endDate, limit: 200 }),
          apiMobileGet(FM_TRAVEL_API_URL, 'get_dashboard', { user_id: user.id, start_date: startDate, end_date: endDate }),
          apiMobileGet(FM_TRAVEL_API_URL, 'get_approval_rows', { user_id: user.id, start_date: startDate, end_date: endDate }),
        ]);
        setApprovalRows(Array.isArray(approvalRes.rows) ? approvalRes.rows.map(mapApprovalRow) : []);
        setApprovalCycleOpen(!!approvalRes.cycle_open);
        setDrivers(Array.isArray(listRes.list) ? listRes.list.map(mapDriverRow) : []);
        setPerm({
          canSave: !!listRes.can_save,
          canSignRequester: !!listRes.can_sign_requester,
          canSignChecker: !!listRes.can_sign_checker,
          canSignApprover: !!listRes.can_sign_approver,
          canFullAccess: !!listRes.can_full_access,
          myDriverId: Number(listRes.my_driver_id ?? 0),
          myDriverName: String(listRes.my_driver_name ?? ''),
          lockedToSelf: !!listRes.locked_to_self,
        });
        setStats({
          savedCount: Number(dashRes.saved_count ?? 0),
          unsavedCount: Number(dashRes.unsaved_count ?? 0),
          totalCount: Number(dashRes.total_count ?? 0),
          jobSum: Number(dashRes.job_sum ?? 0),
          jobDoneSum: Number(dashRes.job_done_sum ?? 0),
          totalAmountSum: Number(dashRes.total_amount_sum ?? 0),
        });
      } catch (e: any) {
        Alert.alert('โหลดรายการไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด');
      } finally {
        refresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [user, startDate, endDate]
  );

  useEffect(() => {
    if (startDate && endDate) void loadPeriodData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  // ปุ่ม "รอบก่อนหน้า/รอบถัดไป" — ตรงกับ get_pay_cycle.prev/next จริง ไม่ได้คำนวณวันที่เอง
  async function goCycle(direction: -1 | 1) {
    if (!user || cycleLoading) return;
    setCycleLoading(true);
    try {
      const res = await apiMobileGet(FM_TRAVEL_API_URL, 'get_pay_cycle', { user_id: user.id, date: startDate });
      const target = direction === -1 ? res.prev : res.next;
      if (target) {
        setStartDate(target.start_date);
        setEndDate(target.end_date);
      }
    } catch (e: any) {
      Alert.alert('เปลี่ยนรอบเบิกไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setCycleLoading(false);
    }
  }

  // ค้นหาตามช่วงวันที่เลือกเองผ่านปฏิทิน — ไม่ผูกกับรอบเบิก 26-25 อีกต่อไป ส่งตรงเข้า get_list/get_dashboard
  // (state startDate/endDate ตัวเดียวกับที่ใช้อยู่แล้ว ไม่ได้เพิ่มการยิง API แบบใหม่)
  function applyCustomSearch() {
    if (!customStartInput || !customEndInput) {
      Alert.alert('กรุณาเลือกวันที่', 'เลือกทั้งวันเริ่มต้นและวันสิ้นสุดก่อนค้นหา');
      return;
    }
    // เลือกกลับด้านมาก็ไม่เป็นไร — ฝั่ง API สลับ start/end ให้เองอยู่แล้ว (README_fm_travel.md)
    const [from, to] = customStartInput <= customEndInput ? [customStartInput, customEndInput] : [customEndInput, customStartInput];
    setStartDate(from);
    setEndDate(to);
    setCustomRangeActive(true);
  }

  // กลับไปดูรอบเบิกปัจจุบันตามปกติ (ล้างช่วงค้นหาเองทิ้ง)
  function clearCustomSearch() {
    setCustomStartInput('');
    setCustomEndInput('');
    setCustomRangeActive(false);
    void initCycle();
  }

  // ===== กล่องสรุป "ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง" — คำนวณฝั่งแอปทั้งหมดจาก approvalRows
  // (ตรงกับที่เว็บทำเป็น client-side JS ล้วนจากอาร์เรย์ ROWS เดียวกัน ไม่มี endpoint สรุปแยก) =====
  const apBaseRows = useMemo(() => {
    const q = apSearch.trim().toLowerCase();
    if (!q) return approvalRows;
    return approvalRows.filter((r) =>
      [r.driverName, r.adminBy, r.checkedBy, r.approvedBy, r.savedBy].some((v) => v.toLowerCase().includes(q))
    );
  }, [approvalRows, apSearch]);

  const apVisibleRows = useMemo(() => {
    return apBaseRows.filter((r) => {
      if (apStatusFilter !== 'all' && r.status !== apStatusFilter) return false;
      if (apCheckFilter === 'yes' && !r.isChecked) return false;
      if (apCheckFilter === 'no' && r.isChecked) return false;
      if (apApproveFilter === 'yes' && !r.isApproved) return false;
      if (apApproveFilter === 'no' && r.isApproved) return false;
      return true;
    });
  }, [apBaseRows, apStatusFilter, apCheckFilter, apApproveFilter]);

  function apSummarize(rows: ApprovalRow[]) {
    const amount = rows.reduce((s, r) => s + r.amount, 0);
    const entries = rows.reduce((s, r) => s + r.entries, 0);
    return { count: rows.length, amount, entries };
  }

  const apSummary = useMemo(() => {
    return {
      all: apSummarize(apBaseRows),
      filling: apSummarize(apBaseRows.filter((r) => r.status === 'filling')),
      overdue: apSummarize(apBaseRows.filter((r) => r.status === 'overdue')),
      checkYes: apSummarize(apBaseRows.filter((r) => r.isChecked)),
      checkNo: apSummarize(apBaseRows.filter((r) => !r.isChecked)),
      approveYes: apSummarize(apBaseRows.filter((r) => r.isApproved)),
      approveNo: apSummarize(apBaseRows.filter((r) => !r.isApproved)),
    };
  }, [apBaseRows]);

  function apToggleStatus(key: 'filling' | 'overdue') {
    setApStatusFilter((s) => (s === key ? 'all' : key));
  }
  function apToggleCheck(v: 'yes' | 'no') {
    setApCheckFilter((s) => (s === v ? '' : v));
  }
  function apToggleApprove(v: 'yes' | 'no') {
    setApApproveFilter((s) => (s === v ? '' : v));
  }

  // กรองการ์ดคนขับฝั่งแอป — ค้นหาชื่อ + สถานะบันทึกแล้ว/ยังไม่ทำ (ข้อมูลทั้งรอบมาจาก get_list อยู่แล้ว)
  const visibleDrivers = useMemo(() => {
    const q = driverSearch.trim().toLowerCase();
    return drivers.filter((d) => {
      if (driverFilter === 'saved' && !d.hasData) return false;
      if (driverFilter === 'unsaved' && d.hasData) return false;
      return !q || d.name.toLowerCase().includes(q);
    });
  }, [drivers, driverSearch, driverFilter]);

  // ตัวกรองที่ใช้อยู่ — chip เล็กใต้แถบค้นหา กด ✕ เพื่อลบทีละตัว
  const activeFilterChips: { key: string; label: string; clear: () => void }[] = [];
  if (driverFilter !== 'all') {
    activeFilterChips.push({ key: 'status', label: driverFilter === 'saved' ? 'บันทึกแล้ว' : 'ยังไม่ทำรายการ', clear: () => setDriverFilter('all') });
  }
  if (customRangeActive) {
    activeFilterChips.push({ key: 'range', label: `ช่วง ${startDateThai} – ${endDateThai}`, clear: clearCustomSearch });
  }

  function resetFilters() {
    setDriverFilter('all');
    setDriverSearch('');
    if (customRangeActive) clearCustomSearch();
  }

  function applyFilterSheet() {
    // เลือกวันที่ครบทั้งสองช่อง = ค้นหาตามช่วงวันที่เอง, ไม่ครบ = ปิดชีตเฉยๆ (ใช้รอบเบิกเดิม)
    if (customStartInput && customEndInput) applyCustomSearch();
    setFilterSheetOpen(false);
  }

  // แตะการ์ด = เปิดใบเบิก (ถ้ามีข้อมูลแล้ว) ไม่งั้นเปิดฟอร์มกรอก (ถ้ามีสิทธิ์ can_save)
  function openDriver(d: DriverRow) {
    if (d.hasData) setViewScreen({ visible: true, driver: d });
    else if (perm.canSave) setFormScreen({ visible: true, driver: d });
  }

  function renderDriverCard({ item: d }: { item: DriverRow }) {
    const initial = d.name.trim().charAt(0) || '?';
    // อนุมัติแล้ว (status_effective === 'approved') เป็นคนละสถานะกับ hasData — ถือว่า "ดี" ทั้งคู่
    const isApproved = d.statusEffective === 'approved';
    const isGood = d.hasData || isApproved;
    const tappable = d.hasData || perm.canSave;
    return (
      <View style={styles.card}>
      {/* โซนข้อมูล — แตะเพื่อเปิดใบเบิก/ฟอร์ม */}
      <Pressable onPress={() => openDriver(d)} disabled={!tappable} style={({ pressed }) => pressed && { opacity: 0.75 }}>
        <View style={styles.cardHeaderRow}>
          <View style={[styles.avatar, isGood && styles.avatarHasData]}>
            <Text style={[styles.avatarText, isGood && { color: '#059669' }]}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.driverName} numberOfLines={1}>{d.name}</Text>
            <View style={styles.cardMetaRow}>
              {/* อนุมัติแล้ว = เขียว, บันทึกแล้วแต่ยังรออนุมัติ = ส้ม, ยังไม่ทำ = เทา (กติกาสีทั้งแอป) */}
              {(() => {
                const tone = isApproved
                  ? { bg: '#ecfdf5', fg: '#059669', icon: 'checkmark-circle' as const, text: 'อนุมัติแล้ว' }
                  : d.hasData
                    ? { bg: '#fffbeb', fg: '#b45309', icon: 'document-text' as const, text: d.statusEffectiveText || 'บันทึกแล้ว' }
                    : { bg: '#f1f5f9', fg: '#64748b', icon: 'remove-circle-outline' as const, text: d.statusEffectiveText || 'ยังไม่ทำรายการ' };
                return (
                  <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
                    <Ionicons name={tone.icon} size={11} color={tone.fg} />
                    <Text style={[styles.statusBadgeText, { color: tone.fg }]}>{tone.text}</Text>
                  </View>
                );
              })()}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.cardAmount, !d.totalAmount && { color: '#cbd5e1' }]}>{moneyFmt(d.totalAmount)} ฿</Text>
            {tappable && <Ionicons name="chevron-forward" size={16} color="#cbd5e1" style={{ marginTop: 2 }} />}
          </View>
        </View>

        <View style={styles.cardInfoRow}>
          <Text style={styles.cardInfoText}>
            ใบงาน <Text style={styles.cardInfoStrong}>{d.jobTotal}</Text>
            {d.jobTotal > 0 ? (
              <Text>
                {' '}· ปิดแล้ว <Text style={styles.cardInfoStrong}>{d.jobDone}</Text>
              </Text>
            ) : null}
          </Text>
          <Text style={styles.cardInfoMuted} numberOfLines={1}>
            {d.lastUpdateShow ? `บันทึก ${d.lastUpdateShow}${d.lastUpdateTime ? ` ${d.lastUpdateTime} น.` : ''}` : 'ยังไม่มีข้อมูล'}
          </Text>
        </View>

      </Pressable>

        {/* โซนปุ่ม — ดูใบเบิก / กรอก-แก้ไข (ซ่อนปุ่มแก้ไขถ้าไม่มีสิทธิ์ can_save) แยกจากโซนข้อมูลด้วยเส้นคั่น */}
        <View style={[styles.quickActionRow, styles.cardActionZone]}>
          <Pressable
            style={[styles.quickActionBtn, !d.hasData && styles.quickActionBtnDisabled]}
            disabled={!d.hasData}
            onPress={() => setViewScreen({ visible: true, driver: d })}
          >
            <Ionicons name="eye-outline" size={15} color={d.hasData ? '#4f46e5' : '#cbd5e1'} />
            <Text style={[styles.quickActionBtnText, !d.hasData && { color: '#cbd5e1' }]}>ดูใบเบิก</Text>
          </Pressable>
          {perm.canSave && (
            <Pressable
              style={[styles.quickActionBtn, !d.hasData && styles.quickActionBtnPrimary]}
              onPress={() => setFormScreen({ visible: true, driver: d })}
            >
              <Ionicons name={d.hasData ? 'pencil-outline' : 'add'} size={15} color={d.hasData ? '#4338ca' : '#ffffff'} />
              <Text style={[styles.quickActionBtnText, !d.hasData && { color: '#ffffff' }]}>{d.hasData ? 'แก้ไขข้อมูล' : 'กรอกข้อมูล'}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  if (formScreen.visible && formScreen.driver) {
    return (
      <TravelAllowanceFormScreen
        driverId={String(formScreen.driver.id)}
        driverName={formScreen.driver.name}
        startDate={startDate}
        endDate={endDate}
        startDateThai={startDateThai}
        endDateThai={endDateThai}
        hasSavedData={formScreen.driver.hasData}
        onBack={() => setFormScreen({ visible: false })}
        onSaved={() => {
          setFormScreen({ visible: false });
          void loadPeriodData(true);
        }}
        onViewSubmission={() => {
          setFormScreen({ visible: false });
          setViewScreen({ visible: true, driver: formScreen.driver });
        }}
      />
    );
  }

  if (viewScreen.visible && viewScreen.driver) {
    return (
      <TravelAllowanceViewScreen
        driverId={String(viewScreen.driver.id)}
        requesterName={viewScreen.driver.name}
        startDate={startDate}
        endDate={endDate}
        onBack={() => {
          setViewScreen({ visible: false });
          void loadPeriodData(true);
        }}
        onEditFull={() => {
          setViewScreen({ visible: false });
          setFormScreen({ visible: true, driver: viewScreen.driver });
        }}
      />
    );
  }

  if (mapVisible) {
    return (
      <TravelAllowanceMapScreen
        startDate={startDate}
        endDate={endDate}
        cycleLabel={`${startDateThai} - ${endDateThai}`}
        onBack={() => setMapVisible(false)}
        onOpenSubmission={(driverId) => {
          const driver = drivers.find((d) => d.id === driverId);
          setMapVisible(false);
          if (driver) setFormScreen({ visible: true, driver });
        }}
      />
    );
  }

  const busy = initializing || loading;
  // กล่องสถานะบนการ์ดสรุป — แตะเพื่อกรองการ์ดคนขับ แตะซ้ำเพื่อล้าง
  const statusBoxes: { key: 'all' | 'saved' | 'unsaved'; label: string; count: number; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
    { key: 'saved', label: 'บันทึกแล้ว', count: stats.savedCount, icon: 'checkmark-circle', color: '#059669' },
    { key: 'unsaved', label: 'ยังไม่ทำ', count: stats.unsavedCount, icon: 'time', color: '#64748b' },
    { key: 'all', label: 'คนขับทั้งหมด', count: stats.totalCount, icon: 'people', color: '#64748b' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* แถบค้นหา + ตัวกรอง + แผนที่ — อยู่นอก FlatList จึงติดด้านบนเสมอ (แบบหน้าเอกสาร PO/AX) */}
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          {onBack && (
            <Pressable onPress={onBack} style={styles.topBarBack} hitSlop={6}>
              <Ionicons name="chevron-back" size={20} color="#0f172a" />
            </Pressable>
          )}
          <View style={styles.topBarSearch}>
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput
              value={driverSearch}
              onChangeText={setDriverSearch}
              placeholder="ค้นหาชื่อคนขับ..."
              placeholderTextColor="#94a3b8"
              style={styles.topBarSearchInput}
            />
            {driverSearch ? (
              <Pressable onPress={() => setDriverSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#cbd5e1" />
              </Pressable>
            ) : null}
          </View>
          <Pressable style={[styles.topBarBtn, activeFilterChips.length > 0 && styles.topBarBtnActive]}
            accessibilityLabel="ตัวกรอง" onPress={() => setFilterSheetOpen(true)}>
            <Ionicons name="options-outline" size={19} color={activeFilterChips.length > 0 ? '#fff' : '#475569'} />
            {activeFilterChips.length > 0 && (
              <View style={styles.topBarBadge}>
                <Text style={styles.topBarBadgeText}>{activeFilterChips.length}</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={styles.topBarAddBtn} accessibilityLabel="แผนที่" onPress={() => setMapVisible(true)}>
            <Ionicons name="map-outline" size={20} color="#fff" />
          </Pressable>
        </View>
        {activeFilterChips.length > 0 && (
          <View style={styles.activeFilterRow}>
            {activeFilterChips.map((c) => (
              <Pressable key={c.key} style={styles.activeFilterChip} onPress={c.clear}>
                <Text style={styles.activeFilterChipText} numberOfLines={1}>{c.label}</Text>
                <Ionicons name="close" size={12} color="#475569" />
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <FlatList
        data={busy ? [] : visibleDrivers}
        keyExtractor={(d) => String(d.id)}
        renderItem={renderDriverCard}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPeriodData(true)} tintColor="#4338ca" />}
        ListEmptyComponent={
          busy ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator color="#4338ca" />
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={26} color="#cbd5e1" />
              <Text style={styles.emptyText}>{drivers.length ? 'ไม่พบคนขับตามตัวกรอง' : 'ไม่พบคนขับในรอบนี้'}</Text>
            </View>
          )
        }
        ListHeaderComponent={
          <View>
            {/* การ์ดสรุปพื้นเข้มแบบหน้าเอกสาร PO/AX — ยอดเบิกรวมของรอบ + เปลี่ยนรอบ + กล่องสถานะ (แตะเพื่อกรอง) */}
            {/* การ์ดสรุปธีมเดียวกับเว็บ (เหมือนกล่องใบขออนุมัติด้านล่าง) — พื้นขาว แถบสีด้านบน การ์ดย่อยขอบบนสี */}
            <View style={styles.summaryCard}>
              <View style={[styles.summaryTopBar, { backgroundColor: '#4f46e5' }]} />
              <View style={styles.summaryTotalRow}>
                <View style={styles.summaryTotalIcon}>
                  <Ionicons name="receipt" size={20} color="#6366f1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryTotalLabel}>ยอดเบิกเบี้ยเลี้ยงรวม</Text>
                  <Text style={styles.summaryTotalValue}>
                    {busy ? '-' : moneyFmt(stats.totalAmountSum)} <Text style={styles.summaryTotalCurrency}>บาท</Text>
                  </Text>
                  <Text style={styles.summaryTotalSub}>
                    {customRangeActive ? 'ช่วงที่เลือก' : 'รอบเบิก'} {startDateThai || '...'} – {endDateThai || '...'}
                  </Text>
                </View>
              </View>

              {/* เปลี่ยนรอบเบิก — ตรงกับ get_pay_cycle.prev/next (ซ่อนตอนค้นหาช่วงวันที่เอง) */}
              {!customRangeActive && (
                <View style={styles.cycleRow}>
                  <Pressable style={styles.cycleBtn} onPress={() => goCycle(-1)} disabled={cycleLoading}>
                    <Ionicons name="chevron-back" size={14} color="#4338ca" />
                    <Text style={styles.cycleBtnText}>รอบก่อนหน้า</Text>
                  </Pressable>
                  {cycleLoading && <ActivityIndicator size="small" color="#4338ca" />}
                  <Pressable style={styles.cycleBtn} onPress={() => goCycle(1)} disabled={cycleLoading}>
                    <Text style={styles.cycleBtnText}>รอบถัดไป</Text>
                    <Ionicons name="chevron-forward" size={14} color="#4338ca" />
                  </Pressable>
                </View>
              )}

              <View style={styles.summaryRow}>
                {statusBoxes.map((b) => {
                  const active = driverFilter === b.key && b.key !== 'all';
                  return (
                    <Pressable
                      key={b.key}
                      onPress={() => setDriverFilter(b.key === 'all' || driverFilter === b.key ? 'all' : b.key)}
                      style={[styles.summaryBox, { borderTopColor: b.color }, active && { borderColor: b.color, backgroundColor: b.color + '0d' }]}
                    >
                      <Ionicons name={active ? 'funnel' : 'funnel-outline'} size={10} color={active ? b.color : '#94a3b8'} style={styles.tapHintIcon} />
                      <View style={styles.summaryBoxLabelRow}>
                        <Ionicons name={b.icon} size={12} color={b.color} />
                        <Text style={[styles.summaryBoxLabel, { color: b.color }]} numberOfLines={1}>{b.label}</Text>
                      </View>
                      <Text style={styles.summaryBoxCount}>
                        {busy ? '-' : b.count} <Text style={styles.summaryBoxUnit}>คน</Text>
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.summaryRow}>
                {([
                  { key: 'jobs', label: 'ใบงานในช่วงนี้', icon: 'document-text', color: '#64748b', value: stats.jobSum, unit: 'ใบ' },
                  { key: 'done', label: 'ปิดงานแล้ว', icon: 'checkmark-done', color: '#059669', value: stats.jobDoneSum, unit: 'ใบ' },
                  { key: 'forms', label: 'ใบขออนุมัติ', icon: 'create', color: '#64748b', value: approvalRows.length, unit: 'ใบ' },
                ] as const).map((b) => (
                  <View key={b.key} style={[styles.summaryBox, { borderTopColor: b.color }]}>
                    <View style={styles.summaryBoxLabelRow}>
                      <Ionicons name={b.icon} size={12} color={b.color} />
                      <Text style={[styles.summaryBoxLabel, { color: b.color }]} numberOfLines={1}>{b.label}</Text>
                    </View>
                    <Text style={styles.summaryBoxCount}>
                      {busy ? '-' : b.value} <Text style={styles.summaryBoxUnit}>{b.unit}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* กล่องสรุป "ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง" (fm_report_travel.php:2272-2500) —
                คนละชุดข้อมูลกับการ์ดคนขับด้านบน (เฉพาะใบที่มีอยู่จริงในรอบนี้ + สถานะลงนาม 3 ขั้น) */}
            <View style={styles.apBox}>
              <TouchableOpacity style={styles.apBoxHead} onPress={() => setApExpanded((v) => !v)}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="document-text-outline" size={15} color="#4338ca" />
                    <Text style={styles.apBoxTitle}>ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง</Text>
                  </View>
                  <Text style={styles.apBoxSubtitle}>
                    รอบ {startDateThai} – {endDateThai}
                    {approvalCycleOpen ? ' • รอบยังไม่ปิด' : ''} · {approvalRows.length} ใบ
                  </Text>
                </View>
                <Ionicons name={apExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#94a3b8" />
              </TouchableOpacity>

              {apExpanded && (
                <View style={styles.apBoxBody}>
                  {/* ธีมเดียวกับเว็บ: การ์ดสถานะ 3 ใบขอบบนสี + การ์ด HR (หัวน้ำเงิน) / หัวหน้า (หัวเขียว) แบ่งครึ่ง
                      ยังไม่อนุมัติ | อนุมัติแล้ว (สีเขียว) — แตะเพื่อกรองตารางด้านล่าง กรองร่วมกันแบบ AND เหมือนเดิม */}
                  <View style={styles.apSumRow}>
                    {([
                      { key: 'all', label: 'ทั้งหมด', icon: 'layers', color: '#64748b', sum: apSummary.all, active: apStatusFilter === 'all', onPress: () => setApStatusFilter('all') },
                      { key: 'filling', label: 'กำลังตรวจสอบ', icon: 'create-outline', color: '#f59e0b', sum: apSummary.filling, active: apStatusFilter === 'filling', onPress: () => apToggleStatus('filling') },
                      { key: 'overdue', label: 'เกินกำหนดตรวจ', icon: 'warning', color: '#ef4444', sum: apSummary.overdue, active: apStatusFilter === 'overdue', onPress: () => apToggleStatus('overdue') },
                    ] as const).map((c) => (
                      <TouchableOpacity
                        key={c.key}
                        style={[styles.apSumCard, { borderTopColor: c.color }, c.active && { borderColor: c.color, backgroundColor: c.color + '0d' }]}
                        onPress={c.onPress}
                      >
                        <Ionicons name={c.active ? 'funnel' : 'funnel-outline'} size={10} color={c.active ? c.color : '#94a3b8'} style={styles.tapHintIcon} />
                        <View style={styles.apSumLabelRow}>
                          <Ionicons name={c.icon} size={12} color={c.color} />
                          <Text style={[styles.apSumLabel, { color: c.color }]} numberOfLines={1}>{c.label}</Text>
                        </View>
                        <Text style={styles.apSumAmt} numberOfLines={1} adjustsFontSizeToFit>
                          {moneyFmt(c.sum.amount)} <Text style={styles.apSumUnit}>บาท</Text>
                        </Text>
                        <Text style={styles.apSumCnt}>{c.sum.count} ใบ · {c.sum.entries} รายการ</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {([
                    { key: 'hr', title: 'อนุมัติโดย HR', icon: 'person-add', headBg: '#475569', no: apSummary.checkNo, yes: apSummary.checkYes, filter: apCheckFilter, toggle: apToggleCheck },
                    { key: 'head', title: 'อนุมัติโดยหัวหน้า', icon: 'checkmark-circle', headBg: '#475569', no: apSummary.approveNo, yes: apSummary.approveYes, filter: apApproveFilter, toggle: apToggleApprove },
                  ] as const).map((step) => (
                    <View key={step.key} style={styles.apStepCard}>
                      <View style={[styles.apStepHeadBar, { backgroundColor: step.headBg }]}>
                        <Ionicons name={step.icon} size={14} color="#fff" />
                        <Text style={styles.apStepHeadText}>{step.title}</Text>
                      </View>
                      <View style={styles.apStepRow}>
                        <TouchableOpacity
                          style={[styles.apStepHalf, step.filter === 'no' && styles.apStepHalfActiveNo]}
                          onPress={() => step.toggle('no')}
                        >
                          <View style={styles.apSumLabelRow}>
                            <Ionicons name="hourglass-outline" size={12} color="#64748b" />
                            <Text style={styles.apStepHalfLabel}>ยังไม่อนุมัติ</Text>
                          </View>
                          <Text style={styles.apStepHalfAmt} numberOfLines={1} adjustsFontSizeToFit>
                            {moneyFmt(step.no.amount)} <Text style={styles.apSumUnit}>บาท</Text>
                          </Text>
                          <Text style={styles.apStepHalfCnt}>{step.no.count} ใบ · {step.no.entries} รายการ</Text>
                        </TouchableOpacity>
                        <View style={styles.apStepDivider} />
                        <TouchableOpacity
                          style={[styles.apStepHalf, step.filter === 'yes' && styles.apStepHalfActiveYes]}
                          onPress={() => step.toggle('yes')}
                        >
                          <View style={styles.apSumLabelRow}>
                            <Ionicons name="checkmark" size={13} color="#059669" />
                            <Text style={[styles.apStepHalfLabel, { color: '#059669' }]}>อนุมัติแล้ว</Text>
                          </View>
                          <Text style={[styles.apStepHalfAmt, { color: '#059669' }]} numberOfLines={1} adjustsFontSizeToFit>
                            {moneyFmt(step.yes.amount)} <Text style={styles.apSumUnit}>บาท</Text>
                          </Text>
                          <Text style={styles.apStepHalfCnt}>{step.yes.count} ใบ · {step.yes.entries} รายการ</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}

                  <View style={styles.apSearchRow}>
                    <Ionicons name="search" size={13} color="#94a3b8" />
                    <TextInput
                      style={styles.apSearchInput}
                      placeholder="ค้นหาชื่อคนขับ / ธุรการจัดส่ง / HR / หัวหน้า"
                      placeholderTextColor="#94a3b8"
                      value={apSearch}
                      onChangeText={setApSearch}
                    />
                    {(apSearch || apStatusFilter !== 'all' || apCheckFilter || apApproveFilter) && (
                      <TouchableOpacity
                        onPress={() => {
                          setApSearch('');
                          setApStatusFilter('all');
                          setApCheckFilter('');
                          setApApproveFilter('');
                        }}
                      >
                        <Ionicons name="close-circle" size={16} color="#94a3b8" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.apResultCount}>
                    {apVisibleRows.length === approvalRows.length ? `ทั้งหมด ${approvalRows.length} ใบ` : `พบ ${apVisibleRows.length} จาก ${approvalRows.length} ใบ`}
                  </Text>

                  {apVisibleRows.length === 0 ? (
                    <Text style={styles.apEmptyText}>ยังไม่มีใบขออนุมัติในรอบนี้</Text>
                  ) : (
                    apVisibleRows.map((r) => (
                      <View key={r.formId} style={[styles.apRowCard, r.isApproved && styles.apRowCardApproved]}>
                        <View style={styles.apRowTop}>
                          <Text style={styles.apRowDriver} numberOfLines={1}>{r.driverName}</Text>
                          {(() => {
                            // อนุมัติครบแล้ว (หัวหน้าลงนาม) = เขียวเสมอ ไม่ว่า status_text จะเขียนว่าอะไร
                            const tone = r.isApproved || r.status === 'approved'
                              ? { bg: '#ecfdf5', border: '#6ee7b7', fg: '#059669', icon: 'checkmark-circle' as const, text: 'อนุมัติแล้ว' }
                              : r.status === 'overdue'
                                ? { bg: '#fef2f2', border: '#fecaca', fg: '#ef4444', icon: 'warning' as const, text: r.statusText }
                                : r.status === 'filling'
                                  ? { bg: '#fffbeb', border: '#fde68a', fg: '#b45309', icon: 'create-outline' as const, text: r.statusText }
                                  : { bg: '#fffbeb', border: '#fde68a', fg: '#b45309', icon: 'time-outline' as const, text: r.statusText };
                            return (
                              <View style={[styles.apRowStatusChip, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                                <Ionicons name={tone.icon} size={12} color={tone.fg} />
                                <Text style={[styles.apRowStatusText, { color: tone.fg }]}>{tone.text}</Text>
                              </View>
                            );
                          })()}
                        </View>
                        <Text style={styles.apRowAmount}>
                          <Text style={styles.apRowAmountStrong}>฿{moneyFmt(r.amount)}</Text> • {r.entries} รายการ{r.entryRange ? ` (${r.entryRange})` : ''}
                        </Text>
                        <View style={styles.apRowSignRow}>
                          {([
                            ['ธุรการจัดส่ง', r.adminBy],
                            ['HR', r.checkedBy],
                            ['หัวหน้า', r.approvedBy],
                          ] as const).map(([label, by]) => (
                            <View key={label} style={[styles.apRowSignCell, !!by && styles.apRowSignCellDone]}>
                              <Text style={styles.apRowSignLabel}>{label}</Text>
                              <View style={styles.apSumLabelRow}>
                                {!!by && <Ionicons name="checkmark-circle" size={11} color="#059669" />}
                                <Text style={by ? styles.apRowSignDone : styles.apRowSignPending} numberOfLines={1}>{by || 'รอลงนาม'}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                        <View style={styles.apRowFoot}>
                          <Text style={styles.apRowUpdated}>{r.updatedThai || '-'}</Text>
                          <TouchableOpacity
                            onPress={() => {
                              const driver = drivers.find((d) => d.id === r.driverId) ?? { id: r.driverId, name: r.driverName, hasData: true, totalAmount: r.amount, jobTotal: 0, jobDone: 0 };
                              setViewScreen({ visible: true, driver });
                            }}
                          >
                            <Text style={styles.apRowViewLink}>ดูใบเบิก →</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
            <Text style={styles.resultText}>
              {busy ? 'กำลังโหลด...' : `${visibleDrivers.length} คน${visibleDrivers.length !== drivers.length ? ` จาก ${drivers.length}` : ''}`}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      />

      {/* ตัวกรองแบบ bottom sheet — สถานะการบันทึก + ค้นหาตามช่วงวันที่เอง (คนละส่วนกับรอบเบิก 26-25) */}
      <Modal visible={filterSheetOpen} transparent animationType="slide" onRequestClose={() => setFilterSheetOpen(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setFilterSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>ตัวกรอง</Text>
              <Pressable onPress={() => setFilterSheetOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#64748b" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 8, gap: 10 }} showsVerticalScrollIndicator={false}>
              <SheetGroup icon="people" color="#64748b" title="สถานะการบันทึก">
                <View style={styles.sheetOptGrid}>
                  {([['all', 'ทั้งหมด'], ['saved', 'บันทึกแล้ว'], ['unsaved', 'ยังไม่ทำรายการ']] as const).map(([key, label]) => (
                    <SheetOption key={key} label={label} active={driverFilter === key} onPress={() => setDriverFilter(key)} />
                  ))}
                </View>
              </SheetGroup>

              <SheetGroup icon="calendar" color="#64748b" title="ค้นหาตามช่วงวันที่">
                <View style={styles.dateSearchRow}>
                  <DateField value={customStartInput} onChange={setCustomStartInput} placeholder="วันเริ่มต้น" style={{ flex: 1 }} />
                  <Text style={styles.dateSearchDash}>ถึง</Text>
                  <DateField value={customEndInput} onChange={setCustomEndInput} placeholder="วันสิ้นสุด" style={{ flex: 1 }} />
                </View>
                {customRangeActive && (
                  <Pressable
                    style={styles.sheetLinkBtn}
                    onPress={() => {
                      clearCustomSearch();
                      setFilterSheetOpen(false);
                    }}
                  >
                    <Ionicons name="refresh" size={13} color="#4338ca" />
                    <Text style={styles.sheetLinkBtnText}>กลับไปรอบเบิกปัจจุบัน</Text>
                  </Pressable>
                )}
              </SheetGroup>
            </ScrollView>
            <View style={styles.sheetFooter}>
              <Pressable style={styles.sheetResetBtn} onPress={resetFilters}>
                <Text style={styles.sheetResetText}>ค่าเริ่มต้น</Text>
              </Pressable>
              <Pressable style={styles.sheetApplyBtn} onPress={applyFilterSheet}>
                <Text style={styles.sheetApplyText}>ดูผลลัพธ์</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
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

  // แถบค้นหา/ตัวกรอง/แผนที่ติดด้านบน — ค่าเดียวกับหน้าเอกสาร PO/AX
  topBar: { backgroundColor: '#ffffff', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarBack: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarSearch: { flex: 1, height: 40, borderRadius: 12, backgroundColor: '#f1f5f9', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  topBarSearchInput: { flex: 1, color: '#0f172a', fontSize: 13, padding: 0 },
  topBarBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  topBarBtnActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  topBarBadge: { position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  topBarBadgeText: { fontSize: 10.5, fontWeight: '900', color: '#4f46e5' },
  topBarAddBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  activeFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  activeFilterChip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef2ff', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 5 },
  activeFilterChipText: { color: '#3730a3', fontSize: 11, fontWeight: '700', flexShrink: 1 },

  // การ์ดสรุปพื้นเข้ม
  summaryCard: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden', marginHorizontal: 14, marginTop: 14, paddingHorizontal: 12, paddingBottom: 4, elevation: 2 },
  summaryTopBar: { height: 4, marginHorizontal: -12 },
  summaryTotalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14 },
  summaryTotalIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  summaryTotalLabel: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  summaryTotalValue: { color: '#0f172a', fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  summaryTotalCurrency: { fontSize: 13, fontWeight: '700', color: '#475569' },
  summaryTotalSub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  cycleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, marginBottom: 4 },
  cycleBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 50, paddingHorizontal: 11, paddingVertical: 6 },
  cycleBtnText: { color: '#4338ca', fontSize: 11, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 4 },
  summaryBox: { flex: 1, minHeight: 66, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', borderTopWidth: 4, paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  summaryBoxLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryBoxLabel: { fontSize: 10.5, fontWeight: '800', flexShrink: 1 },
  summaryBoxCount: { color: '#0f172a', fontSize: 18, fontWeight: '900', marginTop: 'auto' },
  summaryBoxUnit: { color: '#475569', fontSize: 10, fontWeight: '600' },

  resultText: { marginHorizontal: 14, marginTop: 14, color: '#64748b', fontSize: 12, fontWeight: '700' },

  apBox: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 14, marginTop: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  apBoxHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 13 },
  apBoxTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  apBoxSubtitle: { fontSize: 10.5, color: '#64748b', marginTop: 3 },
  apBoxBody: { paddingHorizontal: 12, paddingBottom: 14 },

  apSumRow: { flexDirection: 'row', gap: 6 },
  apSumCard: { flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderTopWidth: 4, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 9, gap: 3 },
  apSumLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  apSumLabel: { fontSize: 10.5, fontWeight: '800', flexShrink: 1 },
  apSumAmt: { fontSize: 15, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  apSumUnit: { fontSize: 10, fontWeight: '600', color: '#475569' },
  apSumCnt: { fontSize: 9.5, color: '#64748b', fontWeight: '600' },

  apStepCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  apStepHeadBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  apStepHeadText: { color: '#ffffff', fontSize: 12.5, fontWeight: '900' },
  apStepRow: { flexDirection: 'row' },
  apStepHalf: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  apStepHalfActiveNo: { backgroundColor: '#f1f5f9' },
  apStepHalfActiveYes: { backgroundColor: '#ecfdf5' },
  apStepDivider: { width: 1, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', marginVertical: 8 },
  apStepHalfLabel: { fontSize: 11, fontWeight: '800', color: '#475569' },
  apStepHalfAmt: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  apStepHalfCnt: { fontSize: 9.5, color: '#64748b', fontWeight: '600' },

  apSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 10, marginTop: 10 },
  apSearchInput: { flex: 1, paddingVertical: 8, fontSize: 12, color: '#0f172a' },
  apResultCount: { fontSize: 10.5, color: '#94a3b8', marginTop: 6, fontWeight: '600' },
  apEmptyText: { fontSize: 11.5, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },

  apRowCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, marginTop: 8 },
  apRowCardApproved: { borderColor: '#a7f3d0', borderLeftWidth: 4, borderLeftColor: '#10b981' },
  apRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  apRowDriver: { flex: 1, fontSize: 13, fontWeight: '900', color: '#0f172a' },
  apRowStatusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 50, paddingHorizontal: 9, paddingVertical: 3 },
  apRowStatusText: { fontSize: 10.5, fontWeight: '800' },
  apRowAmount: { fontSize: 11.5, color: '#475569', fontWeight: '600', marginTop: 5 },
  apRowAmountStrong: { fontSize: 13, color: '#0f172a', fontWeight: '900' },
  apRowSignRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  apRowSignCell: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#f1f5f9', paddingHorizontal: 7, paddingVertical: 5, gap: 1 },
  apRowSignCellDone: { backgroundColor: '#ecfdf5', borderColor: '#d1fae5' },
  apRowSignLabel: { fontSize: 9.5, color: '#64748b', fontWeight: '700' },
  apRowSignDone: { fontSize: 11, color: '#059669', fontWeight: '800', flexShrink: 1 },
  apRowSignPending: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  apRowFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  apRowUpdated: { fontSize: 10, color: '#94a3b8' },
  apRowViewLink: { fontSize: 11, fontWeight: '800', color: '#4338ca' },

  // การ์ดคนขับ (แบบย่อ)
  card: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 14, marginTop: 10, padding: 13, borderWidth: 1, borderColor: '#eef2f6', elevation: 1 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#e2e8f0' },
  avatarHasData: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  avatarText: { fontSize: 15, fontWeight: '800', color: '#475569' },
  driverName: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  cardMetaRow: { flexDirection: 'row', marginTop: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 10.5, fontWeight: '700' },
  cardAmount: { fontSize: 15, fontWeight: '900', color: '#4338ca' },
  cardInfoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  cardInfoText: { fontSize: 11, color: '#475569' },
  cardInfoStrong: { fontWeight: '800', color: '#0f172a' },
  cardInfoMuted: { flexShrink: 1, fontSize: 10.5, color: '#94a3b8' },
  quickActionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  cardActionZone: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  tapHintIcon: { position: 'absolute', top: 6, right: 7 },
  quickActionBtn: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  quickActionBtnDisabled: { backgroundColor: '#ffffff', borderColor: '#f1f5f9' },
  quickActionBtnPrimary: { backgroundColor: '#4338ca', borderColor: '#4338ca' },
  quickActionBtnText: { color: '#334155', fontSize: 12.5, fontWeight: '800' },

  // bottom sheet ตัวกรอง
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingBottom: 18 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginTop: 8, marginBottom: 6 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  sheetTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  sheetLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10 },
  sheetLinkBtnText: { color: '#4338ca', fontSize: 11.5, fontWeight: '700' },
  sheetFooter: { flexDirection: 'row', gap: 10, marginTop: 14 },
  sheetResetBtn: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  sheetResetText: { color: '#475569', fontSize: 13, fontWeight: '800' },
  sheetApplyBtn: { flex: 2, height: 46, borderRadius: 12, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  sheetApplyText: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  dateSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateSearchDash: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 12, textAlign: 'center' },
});
