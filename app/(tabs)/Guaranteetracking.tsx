/**
 * GuaranteeTrackingScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า guarantee_tracking.php (รายการติดตามหนังสือค้ำประกัน)
 * สำหรับแอป tjc-mobile-app (Expo / React Native)
 *
 * สถานะไฟล์นี้: UI MOCKUP — ข้อมูลทั้งหมดเป็น MOCK_GUARANTEES ด้านล่าง
 * ปุ่มลบทำงานแบบ local state เท่านั้น (ยังไม่ยิง guarantee_tracking.php action=delete จริง)
 *
 * ตรงกับพฤติกรรม/สูตรจริงจาก guarantee_tracking.php:
 *  - การ์ดสรุป: ทั้งหมด + 7 สถานะการติดตาม (ยังไม่หมดสัญญา/แจ้งซ่อม/กำลังดำเนินการ/ตรวจชำรุด/
 *    ได้รับหนังสือแจ้งปลดภาระผูกพัน/อยู่ระหว่างส่งหนังสือค้ำคืนมา/ได้รับหนังสือค้ำแล้ว) + ยอดค้ำฯ รวม
 *    แตะการ์ดเพื่อกรอง เหมือน filterByCard()
 *  - ป้าย "รูปแบบการค้ำ" มี 3 สี: ค้ำแบบจนกว่าจะหมดภาระผูกพัน (ลิงก์), ค้ำเงินสด (เงิน), ปกติ (สัญญา)
 *  - "นับถอยหลัง" คำนวณจาก lg_end_date เทียบวันนี้ vs alert_days (default 30) ตรงสูตรเป๊ะ:
 *    เหลือมากกว่า alert_days = เขียว, 1..alert_days = เหลือง, วันนี้พอดี = แดง "วันนี้!",
 *    ติดลบ = เทา "หมดประกัน"
 *  - ปุ่ม "จัดการ": ดูรายละเอียด (เปิด modal เต็มข้อมูล เหมือน showModal()), แก้ไข (ไปหน้า
 *    guarantee_update.php?id= — เป็น stub เพราะเป็นหน้าฟอร์มแยก), ลบ (confirm ก่อนลบ เหมือน confirmDelete())
 *
 * ที่ปรับให้เหมาะกับมือถือ (ต่างจากต้นฉบับ):
 *  - ตัวกรองแบบ popup ต่อคอลัมน์ (รูปแบบการค้ำ/บริษัท/ช่วงปี-เดือน-วันที่) ย่อเหลือเป็นชิปกรองด่วน
 *    (สถานะ/บริษัท/รูปแบบการค้ำ) แทน เพราะ popup ต่อคอลัมน์เป็น UX เฉพาะตารางเดสก์ท็อป
 *  - ข้อมูลผู้ติดต่อ (contact_persons) ในต้นฉบับเป็น JSON โครงสร้างซับซ้อน — mockup นี้เก็บเป็น
 *    ลิสต์ข้อความสั้นๆ แทน
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons expo-router
 * ------------------------------------------------------------------
 */

import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// ====================================================================
// Types
// ====================================================================

type TrackStatus =
  | 'ยังไม่หมดสัญญา'
  | 'แจ้งซ่อม'
  | 'กำลังดำเนินการ'
  | 'ตรวจชำรุด'
  | 'ได้รับหนังสือแจ้งปลดภาระผูกพัน'
  | 'อยู่ระหว่างส่งหนังสือค้ำคืนมา'
  | 'ได้รับหนังสือค้ำแล้ว';

type LgCondition = 'หนังสือค้ำฯ' | 'ค้ำเเบบจนกว่าจะหมดภาระผูกพันธ์' | 'ค้ำเงินสด';
type WarrantyUnit = 'years' | 'months' | 'days';

interface Guarantee {
  id: number;
  projectCode: string;
  lgCondition: LgCondition;
  contractNo: string;
  lgNumber?: string;
  docNo?: string;
  dataSource: 'manual' | 'import';
  importSheet?: string;
  companyName: string;
  customerName: string; // แสดงในคอลัมน์ "หน่วยงาน"
  bankName: string;
  lgValue: number;
  totalBudget?: number;
  startDateShow: string; // dd/mm/พ.ศ.
  endDateShow: string;
  endDaysLeft: number | null; // ผลลัพธ์เทียบเท่า $days_diff (null = ไม่มีวันสิ้นสุด)
  alertDays: number;
  warrantyValue: number;
  warrantyUnit: WarrantyUnit;
  trackStatus: TrackStatus;
  agencyAddress?: string;
  reqFullname?: string;
  reqPosition?: string;
  reqDepartment?: string;
  contacts: string[];
  followups: string[];
}

export interface GuaranteeTrackingScreenProps {
  onBack?: () => void;
}

// ====================================================================
// Mock data
// ====================================================================

const MOCK_GUARANTEES: Guarantee[] = [
  {
    id: 1,
    projectCode: 'TJC69-014',
    lgCondition: 'หนังสือค้ำฯ',
    contractNo: 'สัญญาเลขที่ 45/2569',
    lgNumber: 'LG-2026-0891',
    docNo: 'ทน.115/2569',
    dataSource: 'manual',
    companyName: 'ทีเจซี',
    customerName: 'เทศบาลนครสมมติ',
    bankName: 'ธนาคารกรุงไทย',
    lgValue: 62500,
    totalBudget: 1250000,
    startDateShow: '01/12/2569',
    endDateShow: '30/11/2570',
    endDaysLeft: 445,
    alertDays: 30,
    warrantyValue: 1,
    warrantyUnit: 'years',
    trackStatus: 'ยังไม่หมดสัญญา',
    agencyAddress: '99 ถ.สมมติ ต.ในเมือง อ.เมือง จ.สมมติ 30000',
    reqFullname: 'คุณอรทัย ใจดี',
    reqPosition: 'ผู้จัดการโครงการ',
    reqDepartment: 'ฝ่ายขาย',
    contacts: ['คุณสมหญิง (เจ้าหน้าที่พัสดุ) 08x-xxx-1234'],
    followups: ['12/09/2569 — ยื่นเรื่องขอ LG เรียบร้อย'],
  },
  {
    id: 2,
    projectCode: 'ABC69-002',
    lgCondition: 'หนังสือค้ำฯ',
    contractNo: 'สัญญาเลขที่ 12/2569',
    lgNumber: 'LG-2026-0755',
    dataSource: 'import',
    importSheet: 'นำเข้า ก.ย. 69',
    companyName: 'เอบีซี',
    customerName: 'โรงพยาบาลสมมติ',
    bankName: 'ธนาคารกสิกรไทย',
    lgValue: 21500,
    totalBudget: 430000,
    startDateShow: '10/06/2569',
    endDateShow: '20/09/2569',
    endDaysLeft: 8,
    alertDays: 30,
    warrantyValue: 6,
    warrantyUnit: 'months',
    trackStatus: 'ยังไม่หมดสัญญา',
    agencyAddress: '55 ถ.การแพทย์ ต.ในเมือง อ.เมือง จ.สมมติ 30000',
    contacts: ['คุณวิไล (พัสดุ) 08x-xxx-5678'],
    followups: [],
  },
  {
    id: 3,
    projectCode: 'TJC68-091',
    lgCondition: 'ค้ำเเบบจนกว่าจะหมดภาระผูกพันธ์',
    contractNo: 'สัญญาเลขที่ 8/2568',
    dataSource: 'manual',
    companyName: 'ทีเจซี',
    customerName: 'บริษัท สมมติ จำกัด',
    bankName: 'ธนาคารไทยพาณิชย์',
    lgValue: 105000,
    totalBudget: 2100000,
    startDateShow: '05/03/2568',
    endDateShow: '-',
    endDaysLeft: null,
    alertDays: 30,
    warrantyValue: 0,
    warrantyUnit: 'days',
    trackStatus: 'ได้รับหนังสือค้ำแล้ว',
    agencyAddress: '12 ถ.อุตสาหกรรม ต.สมมติ อ.เมือง จ.สมมติ 30000',
    contacts: [],
    followups: ['10/03/2569 — ลูกค้าส่งหนังสือค้ำตัวจริงคืนแล้ว', '15/03/2569 — ปิดเรื่องสมบูรณ์'],
  },
  {
    id: 4,
    projectCode: 'XYZ69-021',
    lgCondition: 'หนังสือค้ำฯ',
    contractNo: 'สัญญาเลขที่ 30/2569',
    dataSource: 'manual',
    companyName: 'เอ็กซ์วายแซด',
    customerName: 'เทศบาลนครสมมติ',
    bankName: 'ธนาคารกรุงเทพ',
    lgValue: 182500,
    totalBudget: 3650000,
    startDateShow: '18/09/2568',
    endDateShow: '18/09/2569',
    endDaysLeft: 0,
    alertDays: 30,
    warrantyValue: 1,
    warrantyUnit: 'years',
    trackStatus: 'แจ้งซ่อม',
    agencyAddress: '99 ถ.สมมติ ต.ในเมือง อ.เมือง จ.สมมติ 30000',
    contacts: ['คุณประไพ (หัวหน้าฝ่ายช่าง) 08x-xxx-9012'],
    followups: ['18/09/2569 — ลูกค้าแจ้งลิฟต์มีเสียงดังผิดปกติ ส่งช่างเข้าตรวจวันนี้'],
  },
  {
    id: 5,
    projectCode: 'ABC69-003',
    lgCondition: 'หนังสือค้ำฯ',
    contractNo: 'สัญญาเลขที่ 19/2569',
    dataSource: 'manual',
    companyName: 'เอบีซี',
    customerName: 'โรงพยาบาลสมมติ',
    bankName: 'ธนาคารกสิกรไทย',
    lgValue: 28000,
    totalBudget: 560000,
    startDateShow: '25/09/2567',
    endDateShow: '25/09/2568',
    endDaysLeft: -365,
    alertDays: 30,
    warrantyValue: 1,
    warrantyUnit: 'years',
    trackStatus: 'อยู่ระหว่างส่งหนังสือค้ำคืนมา',
    agencyAddress: '55 ถ.การแพทย์ ต.ในเมือง อ.เมือง จ.สมมติ 30000',
    contacts: [],
    followups: ['01/10/2568 — ลูกค้าแจ้งว่าส่งหนังสือค้ำตัวจริงทางไปรษณีย์แล้ว รอตรวจรับ'],
  },
  {
    id: 6,
    projectCode: 'TJC69-030',
    lgCondition: 'ค้ำเงินสด',
    contractNo: 'สัญญาเลขที่ 41/2569',
    dataSource: 'manual',
    companyName: 'ทีเจซี',
    customerName: 'บริษัท สมมติ จำกัด',
    bankName: '-',
    lgValue: 210000,
    totalBudget: 4200000,
    startDateShow: '20/09/2569',
    endDateShow: '20/03/2570',
    endDaysLeft: 190,
    alertDays: 30,
    warrantyValue: 6,
    warrantyUnit: 'months',
    trackStatus: 'กำลังดำเนินการ',
    agencyAddress: '77 ถ.พาณิชย์ ต.ในเมือง อ.เมือง จ.สมมติ 30000',
    contacts: ['คุณพิชญ์ (ผู้จัดการฝ่ายจัดซื้อ) 08x-xxx-3456'],
    followups: [],
  },
];

const STATUS_STYLE: Record<TrackStatus, { icon: keyof typeof FontAwesome5.glyphMap; fg: string; bg: string }> = {
  ยังไม่หมดสัญญา: { icon: 'clock', fg: '#2563eb', bg: '#eff6ff' },
  แจ้งซ่อม: { icon: 'wrench', fg: '#d97706', bg: '#fffbeb' },
  กำลังดำเนินการ: { icon: 'spinner', fg: '#7c3aed', bg: '#f5f3ff' },
  ตรวจชำรุด: { icon: 'search', fg: '#dc2626', bg: '#fef2f2' },
  ได้รับหนังสือแจ้งปลดภาระผูกพัน: { icon: 'unlock', fg: '#0891b2', bg: '#f0f9ff' },
  อยู่ระหว่างส่งหนังสือค้ำคืนมา: { icon: 'truck', fg: '#ea580c', bg: '#fff7ed' },
  ได้รับหนังสือค้ำแล้ว: { icon: 'check-circle', fg: '#059669', bg: '#ecfdf5' },
};

const STATUS_LIST: TrackStatus[] = Object.keys(STATUS_STYLE) as TrackStatus[];

// ====================================================================
// Helpers
// ====================================================================

function formatBaht(n: number): string {
  return '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function warrantyLabel(value: number, unit: WarrantyUnit): string {
  const unitLabel = unit === 'years' ? 'ปี' : unit === 'months' ? 'เดือน' : 'วัน';
  return `${value} ${unitLabel}`;
}

// เทียบเท่า $duration_html ใน guarantee_tracking.php เป๊ะ
function countdownMeta(daysLeft: number | null, alertDays: number): { text: string; fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap } {
  if (daysLeft === null) return { text: '-', fg: '#94a3b8', bg: '#f1f5f9', icon: 'remove-outline' };
  if (daysLeft > alertDays) return { text: `${daysLeft} วัน`, fg: '#15803d', bg: '#dcfce7', icon: 'time-outline' };
  if (daysLeft > 0) return { text: `${daysLeft} วัน`, fg: '#b45309', bg: '#fef3c7', icon: 'warning-outline' };
  if (daysLeft === 0) return { text: 'วันนี้!', fg: '#fff', bg: '#ef4444', icon: 'notifications' };
  return { text: 'หมดประกัน', fg: '#fff', bg: '#64748b', icon: 'close-circle' };
}

function conditionMeta(cond: LgCondition): { icon: keyof typeof FontAwesome5.glyphMap; fg: string; bg: string } {
  if (cond === 'ค้ำเเบบจนกว่าจะหมดภาระผูกพันธ์') return { icon: 'link', fg: '#7c3aed', bg: '#f5f3ff' };
  if (cond === 'ค้ำเงินสด') return { icon: 'money-bill-wave', fg: '#059669', bg: '#ecfdf5' };
  return { icon: 'file-contract', fg: '#2563eb', bg: '#eff6ff' };
}

// ====================================================================
// Main screen
// ====================================================================

export default function GuaranteeTrackingScreen({ onBack }: GuaranteeTrackingScreenProps) {
  const router = useRouter();
  const [guarantees, setGuarantees] = useState<Guarantee[]>(MOCK_GUARANTEES);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TrackStatus | 'all'>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [detailModal, setDetailModal] = useState<{ visible: boolean; item?: Guarantee }>({ visible: false });

  const companies = useMemo(() => Array.from(new Set(guarantees.map((g) => g.companyName))), [guarantees]);

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    STATUS_LIST.forEach((s) => (byStatus[s] = 0));
    let totalAmount = 0;
    guarantees.forEach((g) => {
      byStatus[g.trackStatus] = (byStatus[g.trackStatus] || 0) + 1;
      totalAmount += g.lgValue;
    });
    return { total: guarantees.length, byStatus, totalAmount };
  }, [guarantees]);

  const filtered = useMemo(() => {
    return guarantees.filter((g) => {
      if (statusFilter !== 'all' && g.trackStatus !== statusFilter) return false;
      if (companyFilter !== 'all' && g.companyName !== companyFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${g.projectCode} ${g.contractNo} ${g.companyName} ${g.customerName} ${g.bankName} ${g.trackStatus}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [guarantees, search, statusFilter, companyFilter]);

  function handleDelete(item: Guarantee) {
    // TODO: ต่อ backend จริง -> POST guarantee_tracking.php { action: 'delete', id }
    Alert.alert('ยืนยันลบข้อมูล', `ยืนยันลบข้อมูลการขอเปิด LG หน้างาน: ${item.projectCode} ?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบข้อมูล', style: 'destructive', onPress: () => setGuarantees((prev) => prev.filter((g) => g.id !== item.id)) },
    ]);
  }

  function handleEdit(item: Guarantee) {
    // ปรับ pathname นี้ให้ตรงกับไฟล์จริงถ้าไม่ได้อยู่ที่ app/GuaranteeUpdate.tsx
    router.push({ pathname: '/Guaranteeupdate', params: { id: String(item.id) } });
  }

  function renderHeader() {
    return (
      <View>
        <View style={styles.titleBar}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color="#0f172a" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 32 }} />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="shield-checkmark" size={19} color="#7c3aed" />
            <Text style={styles.title}>รายการติดตามหนังสือค้ำประกัน</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statRow}>
          <TouchableOpacity onPress={() => setStatusFilter('all')} style={[styles.statCard, statusFilter === 'all' && styles.statCardActive]}>
            <View style={[styles.statIcon, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="layers" size={16} color="#3b82f6" />
            </View>
            <Text style={styles.statValue}>{counts.total}</Text>
            <Text style={styles.statLabel}>ทั้งหมด</Text>
          </TouchableOpacity>
          {STATUS_LIST.map((s) => {
            const st = STATUS_STYLE[s];
            const active = statusFilter === s;
            return (
              <TouchableOpacity key={s} onPress={() => setStatusFilter(s)} style={[styles.statCard, active && styles.statCardActive]}>
                <View style={[styles.statIcon, { backgroundColor: st.bg }]}>
                  <FontAwesome5 name={st.icon} size={13} color={st.fg} />
                </View>
                <Text style={styles.statValue}>{counts.byStatus[s] || 0}</Text>
                <Text style={styles.statLabel} numberOfLines={2}>
                  {s}
                </Text>
              </TouchableOpacity>
            );
          })}
          <View style={[styles.statCard, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
            <View style={[styles.statIcon, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="cash" size={16} color="#d97706" />
            </View>
            <Text style={[styles.statValue, { fontSize: 12.5 }]}>{formatBaht(counts.totalAmount)}</Text>
            <Text style={styles.statLabel}>ยอดค้ำฯ รวม</Text>
          </View>
        </ScrollView>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหารหัส, สัญญา, บริษัท, หน่วยงาน, ธนาคาร..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#cbd5e1" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {['all', ...companies].map((c) => {
            const active = companyFilter === c;
            return (
              <TouchableOpacity key={c} onPress={() => setCompanyFilter(c)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c === 'all' ? 'ทุกบริษัท' : c}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.resultCount}>
          แสดง {filtered.length} / {guarantees.length} รายการ
        </Text>
      </View>
    );
  }

  function renderCard({ item: g }: { item: Guarantee }) {
    const cc = countdownMeta(g.endDaysLeft, g.alertDays);
    const cond = conditionMeta(g.lgCondition);
    const st = STATUS_STYLE[g.trackStatus];

    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <Text style={styles.codeText}>{g.projectCode}</Text>
          <View style={[styles.condBadge, { backgroundColor: cond.bg }]}>
            <FontAwesome5 name={cond.icon} size={10} color={cond.fg} />
            <Text style={[styles.condBadgeText, { color: cond.fg }]} numberOfLines={1}>
              {g.lgCondition}
            </Text>
          </View>
        </View>

        <Text style={styles.contractText}>{g.contractNo}</Text>
        <Text style={styles.companyText}>
          {g.companyName} • {g.customerName}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="business-outline" size={12} color="#64748b" />
            <Text style={styles.metaText}>{g.bankName}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="cash-outline" size={12} color="#059669" />
            <Text style={[styles.metaText, { color: '#059669', fontWeight: '700' }]}>{formatBaht(g.lgValue)}</Text>
          </View>
        </View>

        <View style={styles.dateRow}>
          <View style={styles.dateCell}>
            <Text style={styles.dateLabel}>เริ่มค้ำ</Text>
            <Text style={styles.dateValue}>{g.startDateShow}</Text>
          </View>
          <View style={styles.dateCell}>
            <Text style={styles.dateLabel}>ระยะเวลา</Text>
            <Text style={styles.dateValue}>{warrantyLabel(g.warrantyValue, g.warrantyUnit)}</Text>
          </View>
          <View style={styles.dateCell}>
            <Text style={styles.dateLabel}>สิ้นสุดค้ำ</Text>
            <Text style={[styles.dateValue, { color: '#ef4444', fontWeight: '800' }]}>{g.endDateShow}</Text>
          </View>
        </View>

        <View style={styles.badgeRow}>
          <View style={[styles.countdownBadge, { backgroundColor: cc.bg }]}>
            <Ionicons name={cc.icon} size={12} color={cc.fg} />
            <Text style={[styles.countdownText, { color: cc.fg }]}>{cc.text}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
            <FontAwesome5 name={st.icon} size={10} color={st.fg} />
            <Text style={[styles.statusBadgeText, { color: st.fg }]} numberOfLines={1}>
              {g.trackStatus}
            </Text>
          </View>
          {g.dataSource === 'import' && (
            <View style={styles.importBadge}>
              <Ionicons name="document-text-outline" size={11} color="#0891b2" />
              <Text style={styles.importBadgeText} numberOfLines={1}>
                {g.importSheet || 'นำเข้า'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setDetailModal({ visible: true, item: g })}>
            <Ionicons name="eye-outline" size={16} color="#475569" />
            <Text style={styles.iconBtnText}>ดูรายละเอียด</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => handleEdit(g)}>
            <Ionicons name="create-outline" size={16} color="#d97706" />
            <Text style={[styles.iconBtnText, { color: '#d97706' }]}>แก้ไข</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(g)}>
            <Ionicons name="trash-outline" size={16} color="#dc2626" />
            <Text style={[styles.iconBtnText, { color: '#dc2626' }]}>ลบ</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const d = detailModal.item;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={filtered}
        keyExtractor={(g) => String(g.id)}
        renderItem={renderCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="folder-open-outline" size={28} color="#cbd5e1" />
            <Text style={styles.emptyText}>ไม่พบข้อมูลการขอเปิดหนังสือค้ำประกัน</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={detailModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={styles.modalHeadRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.modalHeadIcon}>
                  <Ionicons name="shield-checkmark" size={16} color="#fff" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>รายละเอียดหนังสือค้ำประกัน</Text>
                  <Text style={styles.modalSubtitle}>{d?.projectCode}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setDetailModal({ visible: false })}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {d && (
              <ScrollView style={{ marginTop: 12 }} showsVerticalScrollIndicator={false}>
                <DetailSection title="ข้อมูล LG & สัญญา" icon="document-text-outline">
                  <DetailRow label="รูปแบบการค้ำ" value={d.lgCondition} />
                  <DetailRow label="เลขที่สัญญา" value={d.contractNo} valueColor="#2563eb" />
                  {!!d.lgNumber && <DetailRow label="เลขที่ LG" value={d.lgNumber} valueColor="#059669" />}
                  {!!d.docNo && <DetailRow label="เลขหนังสือออก" value={d.docNo} />}
                  <DetailRow label="ที่มาข้อมูล" value={d.dataSource === 'import' ? d.importSheet || 'นำเข้า' : 'กรอกเอง'} />
                </DetailSection>

                <DetailSection title="งบประมาณ & ธนาคาร" icon="cash-outline">
                  {!!d.totalBudget && <DetailRow label="ยอดงบโครงการ" value={formatBaht(d.totalBudget)} />}
                  <DetailRow label="มูลค่าค้ำประกัน" value={formatBaht(d.lgValue)} valueColor="#059669" />
                  <DetailRow label="ธนาคารที่ออก" value={d.bankName} />
                </DetailSection>

                <DetailSection title="ระยะเวลาค้ำประกัน" icon="calendar-outline">
                  <DetailRow label="วันที่เริ่มค้ำ" value={d.startDateShow} />
                  <DetailRow label="ระยะเวลารับประกัน" value={warrantyLabel(d.warrantyValue, d.warrantyUnit)} />
                  <DetailRow label="วันที่สิ้นสุดค้ำ" value={d.endDateShow} valueColor="#ef4444" />
                </DetailSection>

                <DetailSection title="ข้อมูลหน่วยงาน" icon="location-outline">
                  <DetailRow label="หน่วยงาน" value={d.customerName} />
                  {!!d.agencyAddress && (
                    <View style={styles.addressBox}>
                      <Text style={styles.addressText}>{d.agencyAddress}</Text>
                    </View>
                  )}
                </DetailSection>

                {d.contacts.length > 0 && (
                  <DetailSection title="ข้อมูลผู้ติดต่อ" icon="people-outline">
                    {d.contacts.map((c, i) => (
                      <Text key={i} style={styles.contactLine}>
                        • {c}
                      </Text>
                    ))}
                  </DetailSection>
                )}

                <DetailSection title="ประวัติการติดตามงาน" icon="time-outline">
                  {d.followups.length === 0 ? (
                    <Text style={styles.noFollowupText}>ยังไม่มีประวัติการติดตาม</Text>
                  ) : (
                    d.followups.map((f, i) => (
                      <Text key={i} style={styles.followupLine}>
                        • {f}
                      </Text>
                    ))
                  )}
                </DetailSection>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailSection({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View style={styles.detailSection}>
      <View style={styles.detailSectionTitleRow}>
        <Ionicons name={icon} size={13} color="#7c3aed" />
        <Text style={styles.detailSectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor ? { color: valueColor } : null]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7f9' },

  titleBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12 },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15.5, fontWeight: '800', color: '#0f172a', flexShrink: 1 },

  statRow: { paddingHorizontal: 14, paddingVertical: 14, gap: 8 },
  statCard: { width: 96, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 9, backgroundColor: '#fff' },
  statCardActive: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  statIcon: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 9.5, color: '#64748b', fontWeight: '600', marginTop: 2 },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 12.5, color: '#0f172a' },

  chipsRow: { paddingHorizontal: 14, paddingTop: 10, gap: 6 },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: '#334155', borderColor: '#334155' },
  chipText: { fontSize: 11.5, color: '#475569', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  resultCount: { marginHorizontal: 14, marginTop: 12, marginBottom: 4, fontSize: 11.5, color: '#64748b', fontWeight: '600' },

  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', marginHorizontal: 14, marginTop: 12, padding: 13 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  codeText: { fontSize: 13, fontWeight: '800', color: '#334155' },
  condBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 170 },
  condBadgeText: { fontSize: 10, fontWeight: '700' },

  contractText: { fontSize: 12.5, color: '#0f172a', fontWeight: '700', marginTop: 6 },
  companyText: { fontSize: 11.5, color: '#64748b', marginTop: 2 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11.5, color: '#64748b' },

  dateRow: { flexDirection: 'row', marginTop: 10, backgroundColor: '#f8fafc', borderRadius: 8, padding: 8 },
  dateCell: { flex: 1, alignItems: 'center' },
  dateLabel: { fontSize: 9.5, color: '#94a3b8', fontWeight: '600' },
  dateValue: { fontSize: 11.5, color: '#334155', fontWeight: '700', marginTop: 2 },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  countdownBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3 },
  countdownText: { fontSize: 10.5, fontWeight: '700' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 160 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  importBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0f9ff', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 130 },
  importBadgeText: { fontSize: 10, fontWeight: '700', color: '#0891b2' },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  iconBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  iconBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { color: '#94a3b8', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 18 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  modalHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalHeadIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  modalSubtitle: { fontSize: 11, color: '#94a3b8', marginTop: 1 },

  detailSection: { marginBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 10 },
  detailSectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  detailSectionTitle: { fontSize: 12.5, fontWeight: '800', color: '#7c3aed' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, gap: 10 },
  detailLabel: { fontSize: 11.5, color: '#94a3b8', fontWeight: '600' },
  detailValue: { fontSize: 12, color: '#0f172a', fontWeight: '700', flexShrink: 1, textAlign: 'right' },

  addressBox: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 9, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 4 },
  addressText: { fontSize: 11.5, color: '#334155', lineHeight: 17 },

  contactLine: { fontSize: 11.5, color: '#334155', marginBottom: 4 },
  followupLine: { fontSize: 11.5, color: '#334155', marginBottom: 6, lineHeight: 16 },
  noFollowupText: { fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic' },
});