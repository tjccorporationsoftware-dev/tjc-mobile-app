/**
 * TravelAllowanceFormScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า fm_report_travel_form.php ("กรอกข้อมูลค่าเบี้ยเลี้ยง" รายคน)
 * เชื่อมจากปุ่ม "กรอกข้อมูลใหม่ / แก้ไขข้อมูล" ในหน้า TravelAllowanceScreen (fm_report_travel.php)
 *
 * สถานะไฟล์นี้: UI MOCKUP — ข้อมูลตัวเลือก/ใบงานเดิมเป็น mock ด้านล่าง ยังไม่ยิง
 * POST action=save_travel_form จริง (ดู TODO ใน handleSave)
 *
 * ตรงกับพฤติกรรม/สูตรจริงจาก fm_report_travel_form.php:
 *  - ช่วงรอบเบิก (เริ่ม-สิ้นสุด) + ปุ่ม "โหลดช่วงวันที่" (ยืนยันก่อนเปลี่ยน เพราะข้อมูลที่ยังไม่ได้
 *    บันทึกจะหายไป — ตรงกับ changePeriod() ของต้นฉบับ)
 *  - ข้อมูลทั่วไป: ชื่อผู้ขอเบิก/แผนก/วันที่เสนอเบิก/วิธีรับเงิน
 *  - รายการค่าเบี้ยเลี้ยง: เพิ่มจากใบงานเดิม (เลือกจากรายการใบงานในช่วงนี้) หรือเพิ่มเอง — แต่ละ
 *    แถวมี วันที่/เวลา/เส้นทาง/ประเภทที่พัก-ระยะทาง(auto-fill อัตรา)/อัตรา-วัน/จำนวนวัน/
 *    รายการหัก(เรตติดลบ)/รวม(คำนวณอัตโนมัติ)/รายละเอียด/รูปหลักฐาน/จับพิกัด GPS
 *    (โผล่เฉพาะตัวเลือกที่ตั้งค่าไว้ว่าต้องจับ — เกณฑ์เดียวกับที่ตั้งค่าไว้ในหน้ารายการ)
 *  - สูตรคำนวณต่อแถวตรงกับ calc() เป๊ะ: รวม = อัตรา × จำนวนวัน + รายการหัก(ค่าติดลบ)
 *  - สรุปยอดรวมท้ายฟอร์ม: จำนวนรายการ/รวมจำนวนวัน/ยอดเบิกสุทธิ + คำอ่านเป็นภาษาไทย (ตรงกับ
 *    thaiBahtText()/thaiIntegerText() ของต้นฉบับ พอร์ตมาทั้งฟังก์ชัน)
 *
 * ที่ปรับให้เหมาะกับมือถือ/ตัดออก (เกินขอบเขต mockup):
 *  - แนบรูปหลักฐานจริง (ต้อง expo-image-picker) — เป็น stub เก็บแค่จำนวนไฟล์
 *  - จับพิกัด GPS จริง (ต้อง expo-location + สิทธิ์ตำแหน่ง) — เป็น stub สุ่มพิกัดตัวอย่างแทน
 *  - สถานะ "ใบล็อกแก้ไขไม่ได้" (ธุรการจัดส่งตรวจสอบแล้ว) — ต้องมีระบบสิทธิ์/สถานะฝั่ง backend
 *    เพิ่มเติม ตัดออกก่อน มือถือนี้แก้ไขได้เสมอ
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ Config
import { API_BASE } from '../../constants/config';

// ====================================================================
// Types
// ====================================================================

interface RateOption {
  key: string;
  label: string;
  rate: number;
  requiresGps: boolean;
}

interface JobRow {
  key: string;
  jobId: number; // 0 = กรอกเอง, >0 = ดึงจากใบงาน
  date: string;
  time: string;
  route: string;
  rateType: string;
  rate: string;
  qty: string;
  deductType: string;
  detail: string;
  proofCount: number;
  gpsCaptured: boolean;
  gpsAt?: string;
  isSaved: boolean; // แถวที่เคยบันทึกไว้แล้วจากรอบก่อน (พับเก็บไว้ก่อน)
}

interface SourceJob {
  jobId: number;
  date: string;
  time: string;
  route: string;
  customer: string;
  detail: string;
  status: 'completed' | 'pending' | 'in_progress' | 'failed';
}

export interface TravelAllowanceFormScreenProps {
  driverId?: string;
  driverName?: string;
  startDate?: string;
  endDate?: string;
  hasSavedData?: boolean;
  onBack?: () => void;
  onSaved?: () => void;
  onViewSubmission?: () => void;
}

// ====================================================================
// Mock data
// ====================================================================

const RATE_OPTIONS: RateOption[] = [
  { key: 'hotel', label: 'นอนโรงแรม', rate: 210, requiresGps: false },
  { key: 'vehicle', label: 'นอนรถ/นอนบ้านพัก', rate: 310, requiresGps: false },
  { key: 'roundtrip', label: 'ไป-กลับ', rate: 80, requiresGps: false },
  { key: '1-200', label: '1-200 กม.', rate: 80, requiresGps: true },
  { key: '200-500', label: '200-500 กม.', rate: 160, requiresGps: true },
  { key: '500+', label: '500 กม. ขึ้นไป', rate: 210, requiresGps: true },
];
const DEDUCT_OPTIONS: RateOption[] = [{ key: 'deduct50', label: 'พักเกิน 50 กม. ห่างจากหน้างาน', rate: -100, requiresGps: true }];
const ALL_RATES: Record<string, RateOption> = Object.fromEntries([...RATE_OPTIONS, ...DEDUCT_OPTIONS].map((o) => [o.key, o]));

const PAY_METHODS = ['โอนเข้าบัญชีพร้อมเงินเดือน', 'เงินสด', 'อื่นๆ'];

const SOURCE_JOBS: SourceJob[] = [
  { jobId: 101, date: '03/09/2569', time: '08:30', route: 'คลังสินค้าหลัก - โครงการ TJC69-030', customer: 'บริษัท เจริญกิจเจริญทรัพย์ จำกัด', detail: 'ส่งอุปกรณ์โซล่าเซลล์', status: 'completed' },
  { jobId: 102, date: '05/09/2569', time: '07:00', route: 'คลังสินค้าหลัก - จ.ขอนแก่น', customer: 'บริษัท วัสดุก่อสร้างสมมติ จำกัด', detail: 'ส่งวัสดุก่อสร้างรอบ 2', status: 'completed' },
  { jobId: 103, date: '12/09/2569', time: '13:15', route: 'คลังสินค้าหลัก - จ.นครราชสีมา', customer: 'หจก. อะไหล่ปรับอากาศสมมติ', detail: '', status: 'in_progress' },
];

const STATUS_LABEL: Record<SourceJob['status'], string> = { completed: 'เสร็จแล้ว', pending: 'รอดำเนินการ', in_progress: 'กำลังส่ง', failed: 'ไม่สำเร็จ' };

let uidCounter = 1;
function uid(): string {
  uidCounter += 1;
  return `row_${Date.now()}_${uidCounter}`;
}

function mkManualRow(): JobRow {
  return { key: uid(), jobId: 0, date: '', time: '', route: '', rateType: '', rate: '0', qty: '1', deductType: '', detail: '', proofCount: 0, gpsCaptured: false, isSaved: false };
}

function mkRowFromSource(j: SourceJob): JobRow {
  return { key: uid(), jobId: j.jobId, date: j.date, time: j.time, route: j.route, rateType: '', rate: '0', qty: '1', deductType: '', detail: j.detail, proofCount: 0, gpsCaptured: false, isSaved: false };
}

// ====================================================================
// Helpers
// ====================================================================

function toNum(v: string): number {
  return parseFloat((v || '').replace(/,/g, '')) || 0;
}

function moneyFmt(v: number): string {
  const n = Math.round(v * 100) / 100;
  return n === Math.floor(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rowAmount(row: JobRow): number {
  const deduct = row.deductType && ALL_RATES[row.deductType] ? ALL_RATES[row.deductType].rate : 0;
  return toNum(row.rate) * toNum(row.qty) + deduct;
}

// พอร์ตตรงจาก thaiIntegerText()/thaiBahtText() ของต้นฉบับ
const THAI_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function thaiIntegerText(numberStr: string): string {
  const value = numberStr.replace(/^0+/, '') || '0';
  if (value === '0') return THAI_DIGITS[0];
  if (value.length > 6) {
    const head = value.slice(0, -6);
    const tail = value.slice(-6);
    const tailText = Number(tail) === 0 ? '' : thaiIntegerText(tail);
    return `${thaiIntegerText(head)}ล้าน${tailText}`;
  }
  let text = '';
  for (let index = 0; index < value.length; index++) {
    const digit = Number(value[index]);
    const place = value.length - index - 1;
    if (digit === 0) continue;
    if (place === 1 && digit === 1) text += 'สิบ';
    else if (place === 1 && digit === 2) text += 'ยี่สิบ';
    else if (place === 0 && digit === 1 && value.length > 1) text += 'เอ็ด';
    else text += THAI_DIGITS[digit] + THAI_PLACES[place];
  }
  return text;
}

function thaiBahtText(value: number): string {
  const roundedSatang = Math.round(value * 100);
  const absoluteSatang = Math.abs(roundedSatang);
  const baht = Math.floor(absoluteSatang / 100);
  const satang = absoluteSatang % 100;
  const prefix = roundedSatang < 0 ? 'ลบ' : '';
  let text = `${prefix}${thaiIntegerText(String(baht))}บาท`;
  text += satang === 0 ? 'ถ้วน' : `${thaiIntegerText(String(satang))}สตางค์`;
  return text;
}

// ====================================================================
// Small reusable pieces
// ====================================================================

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {text} {required ? <Text style={styles.required}>*</Text> : null}
    </Text>
  );
}

function ChipPicker({ options, value, onChange, formatLabel }: { options: RateOption[]; value: string; onChange: (v: string) => void; formatLabel?: (o: RateOption) => string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      <TouchableOpacity onPress={() => onChange('')} style={[styles.chip, value === '' && styles.chipActive]}>
        <Text style={[styles.chipText, value === '' && styles.chipTextActive]}>— ไม่เลือก —</Text>
      </TouchableOpacity>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <TouchableOpacity key={o.key} onPress={() => onChange(o.key)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {formatLabel ? formatLabel(o) : `${o.label} (${moneyFmt(o.rate)})`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ====================================================================
// Main screen
// ====================================================================

export default function TravelAllowanceFormScreen({
  driverId,
  driverName = 'วิชัย ใจดี',
  startDate: initialStart = '01/09/2569',
  endDate: initialEnd = '15/09/2569',
  hasSavedData = false,
  onBack,
  onSaved,
  onViewSubmission,
}: TravelAllowanceFormScreenProps) {
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);

  const [reqName, setReqName] = useState(driverName);
  const [dept, setDept] = useState('พนักงานจัดส่ง');
  const [submitDate, setSubmitDate] = useState(startDate);
  const [payMethod, setPayMethod] = useState(PAY_METHODS[0]);

  const [rows, setRows] = useState<JobRow[]>(() => (hasSavedData ? [{ ...mkManualRow(), isSaved: true, date: startDate, route: 'คลังสินค้าหลัก - จ.สมมติ', rateType: 'hotel', rate: '210', qty: '2' }] : []));
  const [showSaved, setShowSaved] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const importedJobIds = useMemo(() => new Set(rows.map((r) => r.jobId).filter((id) => id !== 0)), [rows]);
  const savedRows = rows.filter((r) => r.isSaved);
  const visibleRows = rows.filter((r) => !r.isSaved || showSaved);

  const summary = useMemo(() => {
    const days = rows.reduce((s, r) => s + toNum(r.qty), 0);
    const total = rows.reduce((s, r) => s + rowAmount(r), 0);
    return { count: rows.length, days, total };
  }, [rows]);

  function updateRow<K extends keyof JobRow>(key: string, field: K, value: JobRow[K]) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function applyRateType(key: string, rateType: string) {
    const opt = ALL_RATES[rateType];
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, rateType, rate: opt ? String(opt.rate) : '0' } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function addManualJob() {
    setRows((prev) => [...prev, mkManualRow()]);
    setPickerVisible(false);
  }

  function addFromSource(j: SourceJob) {
    setRows((prev) => [...prev, mkRowFromSource(j)]);
  }

  function captureGps(key: string) {
    // TODO: ต่อ expo-location จริง -> ขอสิทธิ์ + Location.getCurrentPositionAsync()
    const now = new Date();
    const timeShow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    updateRow(key, 'gpsCaptured', true);
    updateRow(key, 'gpsAt', timeShow);
    Alert.alert('จับพิกัดแล้ว (mock)', `บันทึกตำแหน่งเวลา ${timeShow} น. — ต้องเพิ่ม expo-location เพื่อจับพิกัดจริง`);
  }

  function addProof(key: string) {
    // TODO: ต่อ expo-image-picker จริง
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, proofCount: r.proofCount + 1 } : r)));
  }

  function changePeriod(newStart: string, newEnd: string) {
    if (!newStart || !newEnd || newStart > newEnd) {
      Alert.alert('ช่วงวันที่ไม่ถูกต้อง', 'กรุณาตรวจสอบวันที่');
      return;
    }
    Alert.alert('เปลี่ยนช่วงวันที่?', 'ข้อมูลที่ยังไม่ได้บันทึกจะหายไป', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'เปลี่ยนช่วง',
        onPress: () => {
          setStartDate(newStart);
          setEndDate(newEnd);
          setRows([]);
        },
      },
    ]);
  }

  function handleBack() {
    if (onBack) return onBack();
    Alert.alert('ยกเลิก', 'กลับไปหน้ารายการเบิกเบี้ยเลี้ยง');
  }

  function handleSave() {
    // TODO: ต่อ backend จริง -> POST fm_report_travel_form.php action=save_travel_form
    // payload: doc[req_name]/doc[dept]/doc[date_submit]/doc[pay_method]/doc[grand_qty]/
    // doc[grand_total] + jobs[key][date]/time/route/rate_type/rate/qty/deduct_type/amount/detail
    if (!reqName.trim() || !dept.trim() || !submitDate.trim()) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณากรอกชื่อผู้ขอเบิก, แผนก และวันที่เสนอเบิกให้ครบ');
      return;
    }
    const missingGps = rows.some((r) => r.rateType && ALL_RATES[r.rateType]?.requiresGps && !r.gpsCaptured);
    if (missingGps) {
      Alert.alert('ยังไม่ได้จับพิกัด', 'มีรายการที่เลือกประเภทซึ่งต้องจับพิกัด GPS แต่ยังไม่ได้กด "จับพิกัด GPS"');
      return;
    }
    Alert.alert('บันทึกสำเร็จ (mock)', 'บันทึกข้อมูลค่าเบี้ยเลี้ยงเรียบร้อย! กำลังกลับไปหน้ารายการ...', [{ text: 'ตกลง', onPress: () => (onSaved ? onSaved() : handleBack()) }]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <View style={styles.headerCard}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={18} color="#fff" />
            <Text style={styles.backBtnText}>กลับ</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="create-outline" size={17} color="#fff" />
            <Text style={styles.headerTitle}>กรอกข้อมูลค่าเบี้ยเลี้ยง</Text>
          </View>
          <Text style={styles.headerSubtitle}>ใช้สำหรับกรอกและแก้ไขข้อมูลเท่านั้น การตรวจสอบและอนุมัติอยู่ในหน้าใบเบิก</Text>
          <View style={styles.headerPillsRow}>
            <View style={styles.pill}>
              <Ionicons name="ellipse" size={7} color="#fff" />
              <Text style={styles.pillText}>{hasSavedData ? 'มีข้อมูลแล้ว' : 'ยังไม่มีข้อมูล'}</Text>
            </View>
            {hasSavedData && (
              <TouchableOpacity style={styles.heroLink} onPress={onViewSubmission}>
                <Ionicons name="eye-outline" size={12} color="#fff" />
                <Text style={styles.heroLinkText}>ดูใบเบิก</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.periodRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.periodLabel}>เริ่มรอบเบิก</Text>
              <TextInput style={styles.periodInput} placeholder="วว/ดด/ปปปป" placeholderTextColor="rgba(255,255,255,0.6)" value={startDate} onChangeText={setStartDate} />
            </View>
            <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.7)" style={{ marginTop: 18 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.periodLabel}>สิ้นสุดรอบเบิก</Text>
              <TextInput style={styles.periodInput} placeholder="วว/ดด/ปปปป" placeholderTextColor="rgba(255,255,255,0.6)" value={endDate} onChangeText={setEndDate} />
            </View>
          </View>
          <TouchableOpacity style={styles.loadPeriodBtn} onPress={() => changePeriod(startDate, endDate)}>
            <Ionicons name="refresh" size={12} color="#4338ca" />
            <Text style={styles.loadPeriodBtnText}>โหลดช่วงวันที่</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.stepsRow}>
          <StepPill n={1} label="ข้อมูลผู้ขอเบิก" />
          <StepPill n={2} label="รายการเดินทาง" />
          <StepPill n={3} label="ตรวจสอบยอดและบันทึก" />
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <CardHead icon="person-outline" title="ข้อมูลทั่วไป" sub="ข้อมูลที่จะแสดงบนใบขออนุมัติเบิกจ่าย" />
            <FieldLabel text="ชื่อผู้ขอเบิก" required />
            <TextInput style={styles.input} value={reqName} onChangeText={setReqName} placeholderTextColor="#94a3b8" />
            <FieldLabel text="แผนก" required />
            <TextInput style={styles.input} value={dept} onChangeText={setDept} placeholderTextColor="#94a3b8" />
            <FieldLabel text="วันที่เสนอเบิก" required />
            <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={submitDate} onChangeText={setSubmitDate} />
            <FieldLabel text="วิธีรับเงิน" />
            <View style={styles.rowGap}>
              {PAY_METHODS.map((m) => (
                <TouchableOpacity key={m} onPress={() => setPayMethod(m)} style={[styles.radioPill, payMethod === m && styles.radioPillActive]}>
                  <Text style={[styles.radioPillText, payMethod === m && styles.radioPillTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.jobsHeadRow}>
              <CardHead icon="navigate-outline" title="รายการค่าเบี้ยเลี้ยง" sub="ดึงข้อมูลจากใบงานเดิม หรือเพิ่มใบงานและกรอกข้อมูลเอง" noMargin />
            </View>
            <View style={styles.jobsActionRow}>
              {savedRows.length > 0 && (
                <TouchableOpacity style={styles.jobsActionBtnNeutral} onPress={() => setShowSaved((v) => !v)}>
                  <Ionicons name={showSaved ? 'eye-off-outline' : 'time-outline'} size={13} color="#475569" />
                  <Text style={styles.jobsActionBtnNeutralText}>{showSaved ? `ซ่อนรายการที่กรอกแล้ว (${savedRows.length})` : `แก้ไขรายการที่กรอกแล้ว (${savedRows.length})`}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.jobsActionBtnSoft} onPress={() => setPickerVisible(true)}>
                <Ionicons name="download-outline" size={13} color="#4338ca" />
                <Text style={styles.jobsActionBtnSoftText}>เพิ่มจากใบงาน</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.jobsActionBtnNeutral} onPress={addManualJob}>
                <Ionicons name="create-outline" size={13} color="#475569" />
                <Text style={styles.jobsActionBtnNeutralText}>เพิ่มใบงานเอง</Text>
              </TouchableOpacity>
            </View>

            {visibleRows.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="reader-outline" size={26} color="#cbd5e1" />
                <Text style={styles.emptyText}>ยังไม่มีรายการ กด "เพิ่มจากใบงาน" หรือ "เพิ่มใบงานเอง"</Text>
              </View>
            ) : (
              visibleRows.map((row, idx) => {
                const opt = row.rateType ? ALL_RATES[row.rateType] : undefined;
                const needsGps = !!opt?.requiresGps;
                return (
                  <View key={row.key} style={[styles.jobRow, row.isSaved && styles.jobRowSaved]}>
                    <View style={styles.jobRowHead}>
                      <View style={styles.jobNoBadge}>
                        <Text style={styles.jobNoBadgeText}>{idx + 1}</Text>
                      </View>
                      {row.isSaved && (
                        <View style={styles.savedTag}>
                          <Ionicons name="checkmark" size={9} color="#059669" />
                          <Text style={styles.savedTagText}>เคยบันทึกแล้ว</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }} />
                      <TouchableOpacity onPress={() => removeRow(row.key)} style={styles.jobRemoveBtn}>
                        <Ionicons name="trash-outline" size={14} color="#ef4444" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.rowGap}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>วันที่</Text>
                        <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={row.date} onChangeText={(v) => updateRow(row.key, 'date', v)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>เวลา</Text>
                        <TextInput style={styles.input} placeholder="00:00" placeholderTextColor="#94a3b8" value={row.time} onChangeText={(v) => updateRow(row.key, 'time', v)} />
                      </View>
                    </View>

                    <Text style={styles.miniLabel}>ต้นทาง - ปลายทาง</Text>
                    <TextInput style={styles.input} placeholder="ระบุเส้นทาง" placeholderTextColor="#94a3b8" value={row.route} onChangeText={(v) => updateRow(row.key, 'route', v)} />

                    <Text style={styles.miniLabel}>ประเภทที่พัก / ระยะทาง</Text>
                    <ChipPicker options={RATE_OPTIONS} value={row.rateType} onChange={(v) => applyRateType(row.key, v)} />

                    <View style={styles.rowGap}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>อัตรา/วัน</Text>
                        <TextInput style={styles.input} keyboardType="decimal-pad" value={row.rate} onChangeText={(v) => updateRow(row.key, 'rate', v)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>จำนวนวัน</Text>
                        <TextInput style={styles.input} keyboardType="decimal-pad" value={row.qty} onChangeText={(v) => updateRow(row.key, 'qty', v)} />
                      </View>
                    </View>

                    <Text style={styles.miniLabel}>รายการหัก</Text>
                    <ChipPicker options={DEDUCT_OPTIONS} value={row.deductType} onChange={(v) => updateRow(row.key, 'deductType', v)} />

                    <View style={styles.amountBox}>
                      <Text style={styles.amountBoxLabel}>รวม (บาท)</Text>
                      <Text style={styles.amountBoxValue}>{moneyFmt(rowAmount(row))}</Text>
                    </View>

                    <Text style={styles.miniLabel}>รายละเอียด</Text>
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      placeholder="รายละเอียดงานหรือหมายเหตุ"
                      placeholderTextColor="#94a3b8"
                      multiline
                      value={row.detail}
                      onChangeText={(v) => updateRow(row.key, 'detail', v)}
                    />

                    <View style={styles.proofRow}>
                      <TouchableOpacity style={styles.proofBtn} onPress={() => addProof(row.key)}>
                        <Ionicons name="camera-outline" size={13} color="#475569" />
                        <Text style={styles.proofBtnText}>แนบรูป</Text>
                      </TouchableOpacity>
                      {row.proofCount > 0 && <Text style={styles.proofCountText}>แนบแล้ว {row.proofCount} รูป</Text>}
                    </View>

                    {needsGps && (
                      <View style={styles.gpsBox}>
                        <TouchableOpacity style={[styles.gpsBtn, row.gpsCaptured && styles.gpsBtnDone]} onPress={() => captureGps(row.key)}>
                          <Ionicons name="location" size={13} color={row.gpsCaptured ? '#059669' : '#2563eb'} />
                          <Text style={[styles.gpsBtnText, { color: row.gpsCaptured ? '#059669' : '#2563eb' }]}>{row.gpsCaptured ? `จับพิกัดแล้ว (${row.gpsAt} น.)` : 'จับพิกัด GPS'}</Text>
                        </TouchableOpacity>
                        {!row.gpsCaptured && <Text style={styles.gpsHint}>ตัวเลือกนี้ต้องจับพิกัดก่อนบันทึก</Text>}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.driverBlock}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>{driverName.trim().charAt(0)}</Text>
              </View>
              <Text style={styles.driverName}>{driverName}</Text>
              <Text style={styles.driverSub}>พนักงานผู้ขอเบิกค่าเดินทาง</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumRowLabel}>จำนวนรายการ</Text>
              <Text style={styles.sumRowValue}>{summary.count}</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumRowLabel}>รวมจำนวนวัน</Text>
              <Text style={styles.sumRowValue}>{Number.isInteger(summary.days) ? summary.days : summary.days.toFixed(2)}</Text>
            </View>
            <View style={styles.sumTotalBox}>
              <Text style={styles.sumTotalLabel}>ยอดเบิกสุทธิ</Text>
              <Text style={styles.sumTotalValue}>
                {moneyFmt(summary.total)} <Text style={styles.sumTotalUnit}>บาท</Text>
              </Text>
              <Text style={styles.sumBahtText}>{thaiBahtText(summary.total)}</Text>
            </View>
            <Text style={styles.sumNote}>
              <Ionicons name="information-circle-outline" size={11} color="#94a3b8" /> หลังบันทึก ระบบจะพากลับไปหน้ารายการเบิกเบี้ยเลี้ยง
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.saveBar}>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleBack}>
          <Ionicons name="close" size={16} color="#475569" />
          <Text style={styles.cancelBtnText}>ยกเลิก</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Ionicons name="save-outline" size={16} color="#fff" />
          <Text style={styles.saveBtnText}>บันทึกและกลับหน้ารายการ</Text>
        </TouchableOpacity>
      </View>

      {/* Modal: เพิ่มจากใบงาน */}
      <Modal visible={pickerVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle}>เลือกใบงานในช่วงนี้</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
              {SOURCE_JOBS.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="folder-open-outline" size={24} color="#cbd5e1" />
                  <Text style={styles.emptyText}>ไม่พบใบงานในช่วงนี้</Text>
                  <TouchableOpacity style={styles.saveBtn} onPress={addManualJob}>
                    <Text style={styles.saveBtnText}>เพิ่มใบงานเอง</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                SOURCE_JOBS.map((j) => {
                  const added = importedJobIds.has(j.jobId);
                  return (
                    <View key={j.jobId} style={styles.sourceItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sourceDate}>
                          {j.date} {j.time} <Text style={styles.sourceStatus}>{STATUS_LABEL[j.status]}</Text>
                        </Text>
                        <Text style={styles.sourceRoute}>{j.route}</Text>
                        <Text style={styles.sourceCustomer}>
                          {j.customer}
                          {j.detail ? ` — ${j.detail}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity disabled={added} style={[styles.sourceAddBtn, added && styles.sourceAddBtnDone]} onPress={() => addFromSource(j)}>
                        <Text style={[styles.sourceAddBtnText, added && { color: '#94a3b8' }]}>{added ? 'เพิ่มแล้ว' : '+ เพิ่ม'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function StepPill({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stepPill}>
      <View style={styles.stepPillN}>
        <Text style={styles.stepPillNText}>{n}</Text>
      </View>
      <Text style={styles.stepPillLabel}>{label}</Text>
    </View>
  );
}

function CardHead({ icon, title, sub, noMargin }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; noMargin?: boolean }) {
  return (
    <View style={[styles.cardHeadRow, noMargin && { marginBottom: 0 }]}>
      <View style={styles.cardHeadIcon}>
        <Ionicons name={icon} size={14} color="#4338ca" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardHeadTitle}>{title}</Text>
        <Text style={styles.cardHeadSub}>{sub}</Text>
      </View>
    </View>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7fb' },

  headerCard: { backgroundColor: '#4338ca', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 10 },
  backBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 6, lineHeight: 16 },
  headerPillsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  heroLink: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 5 },
  heroLinkText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },

  periodRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 14 },
  periodLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '700', marginBottom: 5 },
  periodInput: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)' },
  loadPeriodBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 9, paddingVertical: 9, marginTop: 10 },
  loadPeriodBtnText: { color: '#4338ca', fontSize: 11.5, fontWeight: '700' },

  stepsRow: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 14, marginTop: 12, borderRadius: 12, padding: 10, gap: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  stepPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  stepPillN: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  stepPillNText: { fontSize: 9.5, fontWeight: '800', color: '#4338ca' },
  stepPillLabel: { fontSize: 9.5, fontWeight: '700', color: '#475569', flexShrink: 1 },

  body: { padding: 14 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 14 },
  cardHeadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 12 },
  cardHeadIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  cardHeadTitle: { fontSize: 13, fontWeight: '800', color: '#1e293b' },
  cardHeadSub: { fontSize: 10, color: '#94a3b8', marginTop: 2 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 9 },
  miniLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', marginBottom: 5, marginTop: 9 },
  required: { color: '#ef4444' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 12.5, color: '#0f172a', backgroundColor: '#fff' },
  textarea: { minHeight: 56, textAlignVertical: 'top' },
  rowGap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  radioPill: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  radioPillActive: { backgroundColor: '#eef2ff', borderColor: '#4338ca' },
  radioPillText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  radioPillTextActive: { color: '#4338ca', fontWeight: '700' },

  jobsHeadRow: {},
  jobsActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  jobsActionBtnSoft: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  jobsActionBtnSoftText: { fontSize: 10.5, fontWeight: '700', color: '#4338ca' },
  jobsActionBtnNeutral: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  jobsActionBtnNeutralText: { fontSize: 10.5, fontWeight: '700', color: '#475569' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 11.5, textAlign: 'center', paddingHorizontal: 20 },

  chipsRow: { gap: 6, paddingVertical: 2 },
  chip: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 11, paddingVertical: 7, maxWidth: 200 },
  chipActive: { backgroundColor: '#4338ca', borderColor: '#4338ca' },
  chipText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  jobRow: { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  jobRowSaved: { backgroundColor: '#f0fdf4', borderColor: '#a7f3d0' },
  jobRowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  jobNoBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#4338ca', alignItems: 'center', justifyContent: 'center' },
  jobNoBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  savedTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#ecfdf5', borderRadius: 50, paddingHorizontal: 7, paddingVertical: 2 },
  savedTagText: { fontSize: 9, fontWeight: '700', color: '#059669' },
  jobRemoveBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },

  amountBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, marginTop: 9 },
  amountBoxLabel: { fontSize: 10.5, fontWeight: '700', color: '#64748b' },
  amountBoxValue: { fontSize: 15, fontWeight: '900', color: '#4338ca' },

  proofRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  proofBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  proofBtnText: { fontSize: 10.5, fontWeight: '700', color: '#475569' },
  proofCountText: { fontSize: 10.5, color: '#059669', fontWeight: '700' },

  gpsBox: { marginTop: 9 },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#93c5fd', borderRadius: 9, paddingVertical: 10 },
  gpsBtnDone: { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' },
  gpsBtnText: { fontSize: 11.5, fontWeight: '700' },
  gpsHint: { fontSize: 9.5, color: '#ef4444', marginTop: 4, textAlign: 'center' },

  summaryCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 16 },
  driverBlock: { alignItems: 'center', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', marginBottom: 12 },
  driverAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  driverAvatarText: { fontSize: 20, fontWeight: '800', color: '#4338ca' },
  driverName: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  driverSub: { fontSize: 10.5, color: '#94a3b8', marginTop: 2 },

  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sumRowLabel: { fontSize: 11.5, color: '#64748b' },
  sumRowValue: { fontSize: 12.5, fontWeight: '800', color: '#1e293b' },

  sumTotalBox: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 6 },
  sumTotalLabel: { fontSize: 10.5, color: '#64748b', fontWeight: '600' },
  sumTotalValue: { fontSize: 22, fontWeight: '900', color: '#4338ca', marginTop: 4 },
  sumTotalUnit: { fontSize: 13, fontWeight: '600' },
  sumBahtText: { fontSize: 10.5, color: '#94a3b8', marginTop: 4, fontStyle: 'italic' },

  sumNote: { fontSize: 9.5, color: '#94a3b8', marginTop: 12, lineHeight: 14 },

  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 12, paddingBottom: 20 },
  cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 13 },
  cancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#4338ca', borderRadius: 12, paddingVertical: 13 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, maxHeight: '80%' },
  modalHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b' },

  sourceItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8fafc', borderRadius: 10, padding: 11, marginBottom: 8 },
  sourceDate: { fontSize: 10.5, color: '#64748b', fontWeight: '600' },
  sourceStatus: { color: '#4338ca', fontWeight: '700' },
  sourceRoute: { fontSize: 12.5, fontWeight: '800', color: '#1e293b', marginTop: 3 },
  sourceCustomer: { fontSize: 10.5, color: '#94a3b8', marginTop: 2 },
  sourceAddBtn: { backgroundColor: '#4338ca', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  sourceAddBtnDone: { backgroundColor: '#f1f5f9' },
  sourceAddBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});