/**
 * TravelAllowanceFormScreen.tsx
 * ------------------------------------------------------------------
 * ฟอร์มกรอก/แก้ไขค่าเบี้ยเลี้ยงรายคน (fm_report_travel_form.php) — ต่อ API จริงแล้ว ผ่าน
 * fm_travel_API_mobile.php: get_master_data / get_detail / get_source_jobs / upload_proof / save_form
 *
 * เปลี่ยนจาก mockup เดิม:
 *  - ตัวเลือกเกณฑ์ (RATE_OPTIONS/DEDUCT_OPTIONS) มาจาก get_master_data.rate_options_positive /
 *    rate_options_negative จริง ไม่ hardcode
 *  - รายการใบงานเดิม (SOURCE_JOBS) มาจาก get_source_jobs จริง
 *  - ข้อมูลฟอร์ม/รายการที่เคยบันทึกมาจาก get_detail จริง
 *  - บันทึกจริงผ่าน save_form (doc_json/jobs_json) — amount ไม่ส่งไป (เซิร์ฟเวอร์คำนวณเอง)
 *  - แนบรูป: ใช้ expo-image-picker จริง (มีอยู่แล้วใน package.json) แล้วอัปโหลดทันทีผ่าน
 *    upload_proof (multipart) ตาม pattern ที่ระบุ — ไม่รอถึงตอนกดบันทึกฟอร์ม
 *  - จับพิกัด: ใช้ expo-location จริง (มีอยู่แล้วใน package.json)
 *  - ⚠️ require_gps: เซิร์ฟเวอร์ "ไม่" บังคับพิกัดตอนบันทึก (มีแต่ฝั่ง JS ของเว็บเดิม) จึงบังคับ
 *    เองฝั่งแอปนี้ก่อนกดบันทึก ถ้าแถวเลือกเกณฑ์ที่ require_gps=1 แต่ยังไม่มี lat/lng
 *  - เอาช่องแก้ไข "ช่วงรอบเบิก" ในฟอร์มออก — รอบเบิกกำหนดจากหน้ารายการ (get_pay_cycle) เท่านั้น
 *    ไม่มี action ให้ "ตั้งวันที่เอง" ในฟอร์มนี้
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ Config + API helper กลาง
import { API_MODULES } from '../../constants/config';
import { useAuth } from '../_layout';
import { apiMobileGet, apiMobilePost } from '../service/api_mobile';

const FM_TRAVEL_API_URL = `${API_MODULES}/fm_travel_API_mobile.php`;

// ====================================================================
// Types
// ====================================================================

interface RateOption {
  key: string; // opt_key
  label: string;
  rate: number;
  group: string; // group_name
  requireGps: boolean;
  isDeduct: boolean;
}

interface JobRow {
  key: string; // uid ฝั่งไคลเอนต์ล้วน ๆ ไว้ผูก state
  jobId: number; // job_id จากใบงานต้นทาง, 0 = กรอกเอง
  dateYmd: string; // date_ymd — ใช้ส่งกลับ backend
  dateThai?: string; // date_thai — ใช้โชว์ผลเท่านั้น
  time: string;
  route: string;
  rateType: string;
  rate: string;
  qty: string;
  deductType: string;
  detail: string;
  photos: string[]; // path ที่ได้จาก upload_proof แล้ว (uploads/expense_proofs/...)
  lat?: number;
  lng?: number;
  gpsAt?: string;
  gpsAcc?: number;
  isSaved: boolean; // เคยมาจาก get_detail (บันทึกไว้แล้วในรอบก่อน) — พับเก็บไว้ก่อนถ้ามีหลายแถว
  serverAmount?: number; // amount ที่เซิร์ฟเวอร์เคยคำนวณไว้ (ใช้โชว์ก่อนแก้ไข)
}

interface SourceJob {
  jobId: number;
  dateYmd: string;
  dateThai?: string;
  time: string;
  route: string;
  customer?: string;
  detail: string;
  status?: string;
}

export interface TravelAllowanceFormScreenProps {
  driverId?: string;
  driverName?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  startDateThai?: string;
  endDateThai?: string;
  hasSavedData?: boolean;
  onBack?: () => void;
  onSaved?: () => void;
  onViewSubmission?: () => void;
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

// พอร์ตตรงจาก thaiIntegerText()/thaiBahtText() ของต้นฉบับ — ใช้แค่แสดงผล ไม่ใช่ตัวเลขทางการ
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

let uidCounter = 1;
function uid(): string {
  uidCounter += 1;
  return `row_${Date.now()}_${uidCounter}`;
}

function mkManualRow(): JobRow {
  return { key: uid(), jobId: 0, dateYmd: '', time: '', route: '', rateType: '', rate: '0', qty: '1', deductType: '', detail: '', photos: [], isSaved: false };
}

function mkRowFromSource(j: SourceJob): JobRow {
  return { key: uid(), jobId: j.jobId, dateYmd: j.dateYmd, dateThai: j.dateThai, time: j.time, route: j.route, rateType: '', rate: '0', qty: '1', deductType: '', detail: j.detail, photos: [], isSaved: false };
}

function mapRateOption(raw: any): RateOption {
  return {
    key: String(raw.opt_key ?? raw.key ?? ''),
    label: String(raw.label ?? ''),
    rate: Number(raw.rate ?? 0),
    group: String(raw.group_name ?? raw.group ?? ''),
    requireGps: !!raw.require_gps,
    isDeduct: !!raw.is_deduct,
  };
}

function mapSourceJob(raw: any): SourceJob {
  return {
    jobId: Number(raw.job_id ?? raw.id ?? 0),
    dateYmd: String(raw.date_ymd ?? raw.date ?? ''),
    dateThai: raw.date_thai,
    time: String(raw.time ?? ''),
    route: String(raw.route ?? ''),
    customer: raw.customer ?? raw.customer_name,
    detail: String(raw.detail ?? ''),
    status: raw.status,
  };
}

function mapDetailJobRow(raw: any): JobRow {
  return {
    key: uid(),
    jobId: Number(raw.job_id ?? 0),
    dateYmd: String(raw.date_ymd ?? ''),
    dateThai: raw.date_thai,
    time: String(raw.time ?? ''),
    route: String(raw.route ?? ''),
    rateType: String(raw.rate_type ?? ''),
    rate: String(raw.rate ?? '0'),
    qty: String(raw.qty ?? '1'),
    deductType: String(raw.deduct_type ?? ''),
    detail: String(raw.detail ?? ''),
    photos: Array.isArray(raw.photos) ? raw.photos : [],
    lat: typeof raw.lat === 'number' ? raw.lat : undefined,
    lng: typeof raw.lng === 'number' ? raw.lng : undefined,
    gpsAt: raw.gps_at || undefined,
    gpsAcc: typeof raw.gps_acc === 'number' ? raw.gps_acc : undefined,
    isSaved: true,
    serverAmount: typeof raw.amount === 'number' ? raw.amount : undefined,
  };
}

// preview เท่านั้น (แสดงระหว่างกรอก) — สูตรตรงกับที่เซิร์ฟเวอร์ใช้จริง (round(rate*qty+deduct,2))
// แต่ตัวเลขที่นับเป็นทางการเสมอคือค่าที่ backend คืนกลับมาหลัง save_form สำเร็จ
function rowAmountPreview(row: JobRow, rateByKey: Record<string, RateOption>): number {
  const deduct = row.deductType && rateByKey[row.deductType] ? rateByKey[row.deductType].rate : 0;
  return Math.round((toNum(row.rate) * toNum(row.qty) + deduct) * 100) / 100;
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
  driverName = '',
  startDate = '',
  endDate = '',
  startDateThai,
  endDateThai,
  hasSavedData = false,
  onBack,
  onSaved,
  onViewSubmission,
}: TravelAllowanceFormScreenProps) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(false);

  const [rateOptionsPositive, setRateOptionsPositive] = useState<RateOption[]>([]);
  const [rateOptionsNegative, setRateOptionsNegative] = useState<RateOption[]>([]);
  const rateByKey = useMemo(() => {
    const map: Record<string, RateOption> = {};
    [...rateOptionsPositive, ...rateOptionsNegative].forEach((o) => (map[o.key] = o));
    return map;
  }, [rateOptionsPositive, rateOptionsNegative]);

  const [reqName, setReqName] = useState(driverName);
  const [dept, setDept] = useState('');
  const [submitDate, setSubmitDate] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payMethods, setPayMethods] = useState<string[]>([]);

  const [rows, setRows] = useState<JobRow[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [sourceJobs, setSourceJobs] = useState<SourceJob[]>([]);
  const [sourceJobsLoading, setSourceJobsLoading] = useState(false);

  const [gpsBusyKey, setGpsBusyKey] = useState<string | null>(null);
  const [photoBusyKey, setPhotoBusyKey] = useState<string | null>(null);

  const importedJobIds = useMemo(() => new Set(rows.map((r) => r.jobId).filter((id) => id !== 0)), [rows]);
  const savedRows = rows.filter((r) => r.isSaved);
  const visibleRows = rows.filter((r) => !r.isSaved || showSaved);

  const summary = useMemo(() => {
    const days = rows.reduce((s, r) => s + toNum(r.qty), 0);
    const total = rows.reduce((s, r) => s + rowAmountPreview(r, rateByKey), 0);
    return { count: rows.length, days, total };
  }, [rows, rateByKey]);

  // โหลด master data (เกณฑ์/วิธีรับเงิน) + ใบเบิกเดิมของคนขับคนนี้ในรอบนี้
  const load = useCallback(async () => {
    if (!user || !driverId) return;
    setLoading(true);
    try {
      const [masterRes, detailRes] = await Promise.all([
        apiMobileGet(FM_TRAVEL_API_URL, 'get_master_data', { user_id: user.id }),
        apiMobileGet(FM_TRAVEL_API_URL, 'get_detail', { user_id: user.id, driver_id: driverId, start_date: startDate, end_date: endDate }),
      ]);

      const positive: RateOption[] = Array.isArray(masterRes.rate_options_positive) ? masterRes.rate_options_positive.map(mapRateOption) : [];
      const negative: RateOption[] = Array.isArray(masterRes.rate_options_negative) ? masterRes.rate_options_negative.map(mapRateOption) : [];
      setRateOptionsPositive(positive);
      setRateOptionsNegative(negative);
      setPayMethods(Array.isArray(masterRes.pay_methods) ? masterRes.pay_methods : []);

      const detail = detailRes.detail || {};
      const formExists = !!detail.form_exists;
      setReqName(formExists ? detail.req_name || driverName : driverName);
      setDept(formExists ? detail.dept || '' : masterRes.default_dept || '');
      setSubmitDate(formExists ? detail.date_submit || '' : startDate);
      setPayMethod(formExists ? detail.pay_method || '' : masterRes.default_pay_method || (Array.isArray(masterRes.pay_methods) ? masterRes.pay_methods[0] : ''));

      const jobs = Array.isArray(detailRes.jobs) ? detailRes.jobs.map(mapDetailJobRow) : [];
      setRows(jobs);

      setCanSave(!!detailRes.can_save);
    } catch (e: any) {
      Alert.alert('โหลดข้อมูลไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด', [{ text: 'ตกลง', onPress: onBack }]);
    } finally {
      setLoading(false);
    }
  }, [user, driverId, startDate, endDate, driverName, onBack]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, startDate, endDate]);

  // เปิดโมดัล "เพิ่มจากใบงาน" -> โหลด get_source_jobs
  async function openSourcePicker() {
    setPickerVisible(true);
    if (!user || !driverId) return;
    setSourceJobsLoading(true);
    try {
      const res = await apiMobileGet(FM_TRAVEL_API_URL, 'get_source_jobs', { user_id: user.id, driver_id: driverId, start_date: startDate, end_date: endDate, limit: 200 });
      // โมดัล "เพิ่มจากใบงาน" ต้องโชว์ใบงานทั้งหมดในช่วง (jobs[]) ไม่ใช่ initial_jobs (ที่กรองเฉพาะ
      // status=completed สำหรับตั้งต้นฟอร์มใหม่เท่านั้น) — ถ้า jobs ว่างจริงๆ ก็ต้องโชว์ว่างจริง ไม่ fallback
      const jobs: any[] = Array.isArray(res.jobs) ? res.jobs : [];
      setSourceJobs(jobs.map(mapSourceJob));
    } catch (e: any) {
      Alert.alert('โหลดใบงานไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSourceJobsLoading(false);
    }
  }

  function updateRow<K extends keyof JobRow>(key: string, field: K, value: JobRow[K]) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function applyRateType(key: string, rateType: string) {
    const opt = rateByKey[rateType];
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

  // จับพิกัดจริงด้วย expo-location (มีอยู่แล้วใน package.json ของโปรเจกต์)
  async function captureGps(key: string) {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('ไม่ได้รับสิทธิ์ตำแหน่ง', 'กรุณาอนุญาตการเข้าถึงตำแหน่งเพื่อจับพิกัด');
        return;
      }
      setGpsBusyKey(key);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      updateRow(key, 'lat', pos.coords.latitude);
      updateRow(key, 'lng', pos.coords.longitude);
      updateRow(key, 'gpsAcc', pos.coords.accuracy ?? undefined);
      updateRow(key, 'gpsAt', new Date(pos.timestamp).toISOString());
    } catch (e: any) {
      Alert.alert('จับพิกัดไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setGpsBusyKey(null);
    }
  }

  // อัปโหลดรูปทันทีที่เลือก ผ่าน action=upload_proof (multipart) — ใช้ axios ตรงเพราะ
  // apiMobilePost ในไฟล์กลางส่งแบบ urlencoded เท่านั้น ไม่รองรับไฟล์แนบ
  async function uploadProofPhoto(uri: string, fileName: string): Promise<{ path: string; filename: string }> {
    const match = /\.(\w+)$/.exec(fileName);
    const ext = (match ? match[1] : 'jpg').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const form = new FormData();
    form.append('action', 'upload_proof');
    form.append('user_id', String(user?.id ?? ''));
    form.append('photo', { uri, name: fileName, type: mime } as any);
    const res = await axios.post(FM_TRAVEL_API_URL, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    if ((res.data as any)?.status !== 'success') throw new Error((res.data as any)?.message || 'อัปโหลดรูปไม่สำเร็จ');
    return { path: (res.data as any).path, filename: (res.data as any).filename };
  }

  async function addProof(key: string) {
    const row = rows.find((r) => r.key === key);
    if (row && row.photos.length >= 8) {
      Alert.alert('แนบรูปครบแล้ว', 'แนบได้สูงสุด 8 รูปต่อรายการ');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('ไม่ได้รับสิทธิ์เข้าถึงรูปภาพ', 'กรุณาอนุญาตการเข้าถึงคลังภาพเพื่อแนบรูปหลักฐาน');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const fileName = asset.fileName || asset.uri.split('/').pop() || `photo_${Date.now()}.jpg`;
    setPhotoBusyKey(key);
    try {
      const uploaded = await uploadProofPhoto(asset.uri, fileName);
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, photos: [...r.photos, uploaded.path] } : r)));
    } catch (e: any) {
      Alert.alert('อัปโหลดรูปไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setPhotoBusyKey(null);
    }
  }

  function removePhoto(key: string, path: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, photos: r.photos.filter((p) => p !== path) } : r)));
  }

  function handleBack() {
    if (onBack) return onBack();
  }

  async function handleSave() {
    if (!user || !driverId) return;
    if (!canSave) {
      Alert.alert('ไม่มีสิทธิ์', 'บัญชีนี้ไม่มีสิทธิ์บันทึกใบเบิกเบี้ยเลี้ยง');
      return;
    }
    if (!reqName.trim() || !dept.trim() || !submitDate.trim()) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณากรอกชื่อผู้ขอเบิก, แผนก และวันที่เสนอเบิกให้ครบ');
      return;
    }
    // ⚠️ บังคับ GPS เองฝั่งแอป — เซิร์ฟเวอร์ไม่บังคับ (ดูคอมเมนต์หัวไฟล์)
    const missingGps = rows.some((r) => {
      const opt = r.rateType ? rateByKey[r.rateType] : undefined;
      return opt?.requireGps && !(typeof r.lat === 'number' && typeof r.lng === 'number');
    });
    if (missingGps) {
      Alert.alert('ยังไม่ได้จับพิกัด', 'มีรายการที่เลือกประเภทซึ่งต้องจับพิกัด GPS แต่ยังไม่ได้กด "จับพิกัด GPS"');
      return;
    }

    const jobsPayload = rows.map((r) => ({
      date: r.dateYmd,
      time: r.time,
      route: r.route,
      rate: toNum(r.rate),
      qty: toNum(r.qty),
      rate_type: r.rateType,
      deduct_type: r.deductType,
      detail: r.detail,
      lat: typeof r.lat === 'number' ? r.lat : undefined,
      lng: typeof r.lng === 'number' ? r.lng : undefined,
      gps_at: r.gpsAt || undefined,
      gps_acc: typeof r.gpsAcc === 'number' ? r.gpsAcc : undefined,
      photos: r.photos,
    }));

    setSaving(true);
    try {
      await apiMobilePost(FM_TRAVEL_API_URL, 'save_form', {
        user_id: user.id,
        driver_id: driverId,
        start_date: startDate,
        end_date: endDate,
        doc_json: JSON.stringify({ req_name: reqName, dept, date_submit: submitDate, pay_method: payMethod }),
        jobs_json: JSON.stringify(jobsPayload),
      });
      Alert.alert('บันทึกสำเร็จ', 'บันทึกข้อมูลค่าเบี้ยเลี้ยงเรียบร้อย! กำลังกลับไปหน้ารายการ...', [{ text: 'ตกลง', onPress: () => (onSaved ? onSaved() : handleBack()) }]);
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#4338ca" size="large" />
      </SafeAreaView>
    );
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
              <Text style={styles.periodValue}>{startDateThai || startDate}</Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.7)" style={{ marginTop: 18 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.periodLabel}>สิ้นสุดรอบเบิก</Text>
              <Text style={styles.periodValue}>{endDateThai || endDate}</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <CardHead icon="person-outline" title="ข้อมูลทั่วไป" sub="ข้อมูลที่จะแสดงบนใบขออนุมัติเบิกจ่าย" />
            <FieldLabel text="ชื่อผู้ขอเบิก" required />
            <TextInput style={styles.input} value={reqName} onChangeText={setReqName} placeholderTextColor="#94a3b8" />
            <FieldLabel text="แผนก" required />
            <TextInput style={styles.input} value={dept} onChangeText={setDept} placeholderTextColor="#94a3b8" />
            <FieldLabel text="วันที่เสนอเบิก" required />
            <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" value={submitDate} onChangeText={setSubmitDate} />
            {payMethods.length > 0 && (
              <>
                <FieldLabel text="วิธีรับเงิน" />
                <View style={styles.rowGap}>
                  {payMethods.map((m) => (
                    <TouchableOpacity key={m} onPress={() => setPayMethod(m)} style={[styles.radioPill, payMethod === m && styles.radioPillActive]}>
                      <Text style={[styles.radioPillText, payMethod === m && styles.radioPillTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
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
              <TouchableOpacity style={styles.jobsActionBtnSoft} onPress={openSourcePicker}>
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
                const opt = row.rateType ? rateByKey[row.rateType] : undefined;
                const needsGps = !!opt?.requireGps;
                const hasGps = typeof row.lat === 'number' && typeof row.lng === 'number';
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
                        <Text style={styles.miniLabel}>วันที่ (YYYY-MM-DD)</Text>
                        <TextInput style={styles.input} placeholder="2026-09-03" placeholderTextColor="#94a3b8" value={row.dateYmd} onChangeText={(v) => updateRow(row.key, 'dateYmd', v)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>เวลา</Text>
                        <TextInput style={styles.input} placeholder="00:00" placeholderTextColor="#94a3b8" value={row.time} onChangeText={(v) => updateRow(row.key, 'time', v)} />
                      </View>
                    </View>

                    <Text style={styles.miniLabel}>ต้นทาง - ปลายทาง</Text>
                    <TextInput style={styles.input} placeholder="ระบุเส้นทาง" placeholderTextColor="#94a3b8" value={row.route} onChangeText={(v) => updateRow(row.key, 'route', v)} />

                    <Text style={styles.miniLabel}>ประเภทที่พัก / ระยะทาง</Text>
                    <ChipPicker options={rateOptionsPositive} value={row.rateType} onChange={(v) => applyRateType(row.key, v)} />

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
                    <ChipPicker options={rateOptionsNegative} value={row.deductType} onChange={(v) => updateRow(row.key, 'deductType', v)} />

                    <View style={styles.amountBox}>
                      <Text style={styles.amountBoxLabel}>รวม (บาท) — ประมาณการ</Text>
                      <Text style={styles.amountBoxValue}>{moneyFmt(rowAmountPreview(row, rateByKey))}</Text>
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
                      <TouchableOpacity style={styles.proofBtn} onPress={() => addProof(row.key)} disabled={photoBusyKey === row.key}>
                        {photoBusyKey === row.key ? <ActivityIndicator size="small" color="#475569" /> : <Ionicons name="camera-outline" size={13} color="#475569" />}
                        <Text style={styles.proofBtnText}>แนบรูป</Text>
                      </TouchableOpacity>
                      {row.photos.length > 0 && <Text style={styles.proofCountText}>แนบแล้ว {row.photos.length} รูป</Text>}
                    </View>
                    {row.photos.length > 0 && (
                      <View style={styles.photoChipsRow}>
                        {row.photos.map((p) => (
                          <TouchableOpacity key={p} style={styles.photoChip} onPress={() => removePhoto(row.key, p)}>
                            <Text style={styles.photoChipText} numberOfLines={1}>{p.split('/').pop()}</Text>
                            <Ionicons name="close-circle" size={13} color="#ef4444" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {needsGps && (
                      <View style={styles.gpsBox}>
                        <TouchableOpacity style={[styles.gpsBtn, hasGps && styles.gpsBtnDone]} onPress={() => captureGps(row.key)} disabled={gpsBusyKey === row.key}>
                          {gpsBusyKey === row.key ? (
                            <ActivityIndicator size="small" color="#2563eb" />
                          ) : (
                            <Ionicons name="location" size={13} color={hasGps ? '#059669' : '#2563eb'} />
                          )}
                          <Text style={[styles.gpsBtnText, { color: hasGps ? '#059669' : '#2563eb' }]}>{hasGps ? 'จับพิกัดแล้ว' : 'จับพิกัด GPS'}</Text>
                        </TouchableOpacity>
                        {!hasGps && <Text style={styles.gpsHint}>ตัวเลือกนี้ต้องจับพิกัดก่อนบันทึก</Text>}
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
                <Text style={styles.driverAvatarText}>{(driverName || '?').trim().charAt(0)}</Text>
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
              <Text style={styles.sumTotalLabel}>ยอดเบิกสุทธิ (ประมาณการ)</Text>
              <Text style={styles.sumTotalValue}>
                {moneyFmt(summary.total)} <Text style={styles.sumTotalUnit}>บาท</Text>
              </Text>
              <Text style={styles.sumBahtText}>{thaiBahtText(summary.total)}</Text>
            </View>
            <Text style={styles.sumNote}>
              <Ionicons name="information-circle-outline" size={11} color="#94a3b8" /> ยอดที่เป็นทางการจะยืนยันโดยเซิร์ฟเวอร์หลังกดบันทึก
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.saveBar}>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleBack}>
          <Ionicons name="close" size={16} color="#475569" />
          <Text style={styles.cancelBtnText}>ยกเลิก</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]} onPress={handleSave} disabled={!canSave || saving}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={16} color="#fff" />}
          <Text style={styles.saveBtnText}>{canSave ? 'บันทึกและกลับหน้ารายการ' : 'ไม่มีสิทธิ์บันทึก'}</Text>
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
              {sourceJobsLoading ? (
                <View style={styles.emptyBox}>
                  <ActivityIndicator color="#4338ca" />
                </View>
              ) : sourceJobs.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="folder-open-outline" size={24} color="#cbd5e1" />
                  <Text style={styles.emptyText}>ไม่พบใบงานในช่วงนี้</Text>
                  <TouchableOpacity style={styles.saveBtn} onPress={addManualJob}>
                    <Text style={styles.saveBtnText}>เพิ่มใบงานเอง</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                sourceJobs.map((j) => {
                  const added = importedJobIds.has(j.jobId);
                  return (
                    <View key={j.jobId} style={styles.sourceItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sourceDate}>
                          {j.dateThai || j.dateYmd} {j.time} {j.status ? <Text style={styles.sourceStatus}>{j.status}</Text> : null}
                        </Text>
                        <Text style={styles.sourceRoute}>{j.route}</Text>
                        {(j.customer || j.detail) && (
                          <Text style={styles.sourceCustomer}>
                            {j.customer}
                            {j.detail ? ` — ${j.detail}` : ''}
                          </Text>
                        )}
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
  periodValue: { fontSize: 13, color: '#fff', fontWeight: '800' },

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
  photoChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  photoChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, maxWidth: 160 },
  photoChipText: { fontSize: 9.5, color: '#475569', fontWeight: '600', flexShrink: 1 },

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
  saveBtnDisabled: { opacity: 0.5 },
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
