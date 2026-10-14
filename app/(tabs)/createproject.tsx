/**
 * CreateProjectScreen.tsx
 * ------------------------------------------------------------------
 * หน้า สร้าง/แก้ไขโครงการ — พอร์ตจาก create_project.php เชื่อมจากปุ่ม "สร้างโครงการ" ในหน้า
 * Dashboard หลัก
 *
 * เชื่อม API จริงครบแล้ว: project_API_mobile.php action=save_project (พอร์ตจาก
 * create_project.php action=save_project ทั้งดุ้น — $_SESSION['fullname'] เปลี่ยนเป็น
 * user_id param) + get_next_number (เลขหน้างานถัดไปแบบ real-time) + get_master_data
 * (บริษัท/ลูกค้า/ประเภทงาน/ธนาคาร/ทีมช่าง — ของจริงทั้งหมด ไม่มี mock แล้ว)
 *
 * ตรงกับโครงสร้าง/พฤติกรรมจริงจาก create_project.php:
 *  - หัวฟอร์ม: วันที่ลงข้อมูล (อ่านอย่างเดียว), เลขหน้างานอัตโนมัติ (ตัวอย่าง), toggle
 *    "สร้างเป็นหน้างานสต๊อก" (ติ๊กแล้วข้ามการบังคับกรอกทุกอย่างได้ เหมือนต้นฉบับ)
 *  - ข้อมูลหลัก: บริษัท/ลูกค้า (+ฟอร์มเพิ่มลูกค้าใหม่แบบฝังในหน้าเดียวกัน), ชื่อโครงการ,
 *    ประเภทงาน, งบประมาณ, ผู้รับผิดชอบโครงการ (บุคคล/ทีม), ผู้ติดตามหนี้ (บุคคลเท่านั้น
 *    ตรงกับต้นฉบับที่ debt_type ถูก fix เป็น 'บุคคล' เสมอ), การค้ำประกัน 4 แบบ + ฟิลด์
 *    เงื่อนไขตามแบบ, ระยะเวลารับประกัน, ระยะเวลาจัดส่ง
 *  - ข้อมูลทีมช่าง: เพิ่ม/ลบทีมได้หลายทีม แต่ละทีมมีรายชื่อช่างเพิ่ม/ลบได้
 *  - ข้อมูลงานประกอบอุปกรณ์: มี/ไม่มีประกอบ (บังคับเลือก เหมือนต้นฉบับ required ทั้งคู่)
 *  - ข้อมูลสัญญา: เลขที่สัญญา/ใบสั่งซื้อ, วันเริ่ม+ระยะเวลา+วันสิ้นสุด (คำนวณอัตโนมัติจาก
 *    วันเริ่ม+ระยะเวลา เหมือน calcContractEndDate() แต่แก้เองทับได้), แจ้งเตือนก่อนหมดสัญญา,
 *    แนบไฟล์สัญญา
 *  - การยื่นซอง & ใบเสนอราคา: ยื่น/ไม่ยื่น + วันที่ยื่น (บังคับถ้ายื่น), เลขที่ใบเสนอราคา,
 *    ผู้เปิดใบเสนอราคา
 *
 * ที่อยู่ลูกค้าใหม่ (จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์) เป็น cascading dropdown จริงแล้ว — โหลด
 * ฐานข้อมูลที่อยู่ไทยทั้งประเทศจาก jquery.Thailand.js (raw_database.json บน GitHub) แบบเดียวกับที่
 * create_project_script.js ฝั่งเว็บใช้ (เว็บเองก็ fetch จากลิงก์เดียวกันนี้ ไม่ได้มาจาก DB) เลือก
 * จังหวัดแล้วตัวเลือกอำเภอ/ตำบล/รหัสไปรษณีย์กรองตามลำดับ เปลี่ยนตัวบนจะล้างตัวล่างเหมือนต้นฉบับ
 *
 * แนบไฟล์สัญญา (contract_file) ใช้ expo-document-picker จริงแล้ว (PDF/JPG/JPEG/PNG ตรงกับที่
 * project_API_mobile.php action=save_project อนุญาต) ส่งเป็น multipart ไปกับฟอร์มตอนบันทึก
 *
 * ที่ปรับให้เหมาะกับมือถือ/ตัดออก (เกินขอบเขต mockup):
 *  - "TECH PICKER MODAL" ค้นหาช่างจากร้านภายนอก (มีรายละเอียดร้าน/ความชำนาญ/จังหวัด/เบอร์ติดต่อ
 *    แบบซับซ้อน) — ย่อเหลือกรอกชื่อช่างตรงๆ ต่อทีม
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons expo-router
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../_layout';
// ✅ Config
import { API_MODULES } from '../../constants/config';
import { DateField, formatShortThaiDate } from '../../components/DateTimeField';
import { apiMobileGet } from '../../service/api_mobile';

// project_API_mobile.php — get_detail / get_next_number / get_master_data / save_project (ของจริงทั้งหมด)
const PROJECT_API_URL = `${API_MODULES}/project_API_mobile.php`;
// ฐานข้อมูลที่อยู่ไทยทั้งประเทศ — ลิงก์เดียวกับที่ create_project_script.js ฝั่งเว็บ fetch ตรงๆ
// (ไม่ได้มาจาก DB ของ TJC เอง เป็น dataset สาธารณะของ jquery.Thailand.js)
const THAI_ADDRESS_URL = 'https://raw.githubusercontent.com/earthchie/jquery.Thailand.js/master/jquery.Thailand.js/database/raw_database/raw_database.json';

// ====================================================================
// Types
// ====================================================================

type SalesType = 'บุคคล' | 'ทีม';
type GuaranteeType = 'ไม่มี' | 'หนังสือค้ำ' | 'ค้ำแบบจนกว่าจะหมดภาระผูกพันธ์' | 'เงินสด';
type BiddingType = 'ไม่ยื่น' | 'ยื่น';
type DurationUnit = 'days' | 'months' | 'years';

interface TechTeamBlock {
  id: string;
  teamName: string;
  technicians: string[];
}

interface FormState {
  isStockSite: boolean;
  companyId: string;
  isNewCustomer: boolean;
  customerId: string;
  newCustomer: {
    name: string;
    affiliation: string;
    contactPerson: string;
    address: string;
    province: string;
    district: string;
    subDistrict: string;
    zipCode: string;
    remark: string;
  };
  projectName: string;
  jobTypeId: string;
  projectBudget: string;
  salesType: SalesType;
  salesUser: string;
  salesTeam: string;
  debtUser: string;
  guaranteeType: GuaranteeType;
  guaranteeAmount: string;
  bankName: string;
  bankAccount: string;
  guaranteeNo: string;
  guaranteeStartDate: string;
  guaranteeEndDate: string;
  warrantyValue: string;
  warrantyUnit: DurationUnit;
  deliveryDays: string;
  hasTechnician: boolean | null;
  techTeams: TechTeamBlock[];
  isPcAssembly: boolean | null;
  contractNo: string;
  purchaseOrderNo: string;
  startDate: string;
  contractDuration: string;
  contractUnit: DurationUnit;
  endDate: string;
  endDateManual: boolean;
  alertContractDays: string;
  biddingType: BiddingType;
  biddingDate: string;
  quotationNo: string;
  quoteCreator: string;
  contractFile: PickedFile | null;
}

interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string;
}

// แถวข้อมูลที่อยู่ไทย 1 ตำบล จาก raw_database.json (p=จังหวัด, a=อำเภอ, d=ตำบล, z=รหัสไปรษณีย์)
interface AddressRow {
  p: string;
  a: string;
  d: string;
  z: string;
}

export interface CreateProjectScreenProps {
  onBack?: () => void;
  onSaved?: () => void;
  editId?: string;
}

// ====================================================================
// Master data types — โหลดจริงจาก get_master_data (ไม่มี mock แล้ว)
// ====================================================================

interface IdOption {
  id: string;
  label: string;
}

interface MasterData {
  companies: IdOption[];
  customers: IdOption[];
  jobTypes: IdOption[];
  users: string[];
  salesTeams: string[];
  techTeamOptions: string[];
  banks: string[];
}

const EMPTY_MASTER: MasterData = { companies: [], customers: [], jobTypes: [], users: [], salesTeams: [], techTeamOptions: [], banks: [] };

let uidCounter = 1;
function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}_${Date.now()}_${uidCounter}`;
}

function mkTeam(): TechTeamBlock {
  return { id: uid('team'), teamName: '', technicians: [''] };
}

function initialForm(): FormState {
  return {
    isStockSite: false,
    companyId: '',
    isNewCustomer: false,
    customerId: '',
    newCustomer: { name: '', affiliation: '', contactPerson: '', address: '', province: '', district: '', subDistrict: '', zipCode: '', remark: '' },
    projectName: '',
    jobTypeId: '',
    projectBudget: '',
    salesType: 'บุคคล',
    salesUser: '',
    salesTeam: '',
    debtUser: '',
    guaranteeType: 'ไม่มี',
    guaranteeAmount: '',
    bankName: '',
    bankAccount: '',
    guaranteeNo: '',
    guaranteeStartDate: '',
    guaranteeEndDate: '',
    warrantyValue: '',
    warrantyUnit: 'days',
    deliveryDays: '',
    hasTechnician: null,
    techTeams: [mkTeam()],
    isPcAssembly: null,
    contractNo: '',
    purchaseOrderNo: '',
    startDate: '',
    contractDuration: '',
    contractUnit: 'days',
    endDate: '',
    endDateManual: false,
    alertContractDays: '10',
    biddingType: 'ไม่ยื่น',
    biddingDate: '',
    quotationNo: '',
    quoteCreator: '',
    contractFile: null,
  };
}

// ====================================================================
// Helpers
// ====================================================================

const UNIT_LABEL: Record<DurationUnit, string> = { days: 'วัน', months: 'เดือน', years: 'ปี' };

// เทียบเท่า calcContractEndDate() ของจริง — คำนวณวันสิ้นสุดจากวันเริ่ม + ระยะเวลา
// รับ/คืนค่าเป็น YYYY-MM-DD ให้ตรงกับ DateField (ส่งเข้า API ได้ตรงๆ)
function calcEndDate(startDateStr: string, duration: string, unit: DurationUnit): string {
  const m = startDateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dur = parseInt(duration, 10);
  if (!m || isNaN(dur) || dur <= 0) return '';
  const [, yyyy, mm, dd] = m;
  const d = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
  if (unit === 'days') d.setDate(d.getDate() + dur);
  else if (unit === 'months') d.setMonth(d.getMonth() + dur);
  else d.setFullYear(d.getFullYear() + dur);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ====================================================================
// Small reusable pieces
// ====================================================================

function SectionTitle({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Ionicons name={icon} size={14} color="#fff" />
      <Text style={styles.sectionTitleText}>{text}</Text>
    </View>
  );
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {text} {required ? <Text style={styles.required}>*</Text> : null}
    </Text>
  );
}

// ปุ่มกด-เปิดป๊อปอัพเลือกตัวเลือก — แทนที่ ChipPicker/IdChipPicker แบบเลื่อนแนวนอนเดิม
function PickerTrigger({ label, placeholder, onPress }: { label: string; placeholder: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.pickerTrigger} onPress={onPress}>
      <Text style={[styles.pickerTriggerText, !label && styles.pickerTriggerPlaceholder]} numberOfLines={1}>
        {label || placeholder}
      </Text>
      <Ionicons name="chevron-down" size={16} color="#64748b" />
    </TouchableOpacity>
  );
}

function TwoOptionToggle({
  value,
  labelA,
  labelB,
  onChange,
}: {
  value: boolean | null;
  labelA: string;
  labelB: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.twoOptionRow}>
      <TouchableOpacity style={[styles.twoOptionBtn, value === false && styles.twoOptionBtnActiveNeutral]} onPress={() => onChange(false)}>
        <Ionicons name={value === false ? 'radio-button-on' : 'radio-button-off'} size={15} color={value === false ? '#64748b' : '#cbd5e1'} />
        <Text style={styles.twoOptionText}>{labelA}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.twoOptionBtn, value === true && styles.twoOptionBtnActiveGreen]} onPress={() => onChange(true)}>
        <Ionicons name={value === true ? 'radio-button-on' : 'radio-button-off'} size={15} color={value === true ? '#059669' : '#cbd5e1'} />
        <Text style={[styles.twoOptionText, value === true && { color: '#059669' }]}>{labelB}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ====================================================================
// Main screen
// ====================================================================

export default function CreateProjectScreen({ onBack, onSaved, editId: editIdProp }: CreateProjectScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ edit_id?: string }>();
  const editId = editIdProp ?? params.edit_id;
  const { user } = useAuth();
  const userId = (user as any)?.id ?? (user as any)?.user_id;

  const [form, setForm] = useState<FormState>(initialForm());
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [master, setMaster] = useState<MasterData>(EMPTY_MASTER);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [nextNumber, setNextNumber] = useState<number | null>(null);

  // ที่อยู่ไทยทั้งประเทศ (จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์) — โหลดครั้งแรกที่ติ๊ก "เพิ่มลูกค้าใหม่"
  const [thaiAddress, setThaiAddress] = useState<AddressRow[]>([]);
  const [loadingThaiAddress, setLoadingThaiAddress] = useState(false);
  const [addressPickerModal, setAddressPickerModal] = useState<{
    visible: boolean; field: 'province' | 'district' | 'subDistrict' | 'zipCode' | null; title: string; options: string[]; search: string;
  }>({ visible: false, field: null, title: '', options: [], search: '' });

  // ป๊อปอัพเลือกตัวเลือกแบบใช้ร่วมกันทุกช่อง (บริษัท/ลูกค้า/ประเภทงาน/ผู้ใช้/ทีม/ธนาคาร ฯลฯ)
  // แทนที่ ChipPicker/IdChipPicker แบบเลื่อนแนวนอนเดิม
  const [pickerModal, setPickerModal] = useState<{
    visible: boolean;
    title: string;
    options: { value: string; label: string }[];
    current: string;
    onSelect: (v: string) => void;
  }>({ visible: false, title: '', options: [], current: '', onSelect: () => {} });
  function openPicker(title: string, options: { value: string; label: string }[], current: string, onSelect: (v: string) => void) {
    setPickerModal({ visible: true, title, options, current, onSelect });
  }

  useEffect(() => {
    if (!form.isNewCustomer || thaiAddress.length > 0 || loadingThaiAddress) return;
    let cancelled = false;
    setLoadingThaiAddress(true);
    (async () => {
      try {
        const res = await fetch(THAI_ADDRESS_URL);
        const json = await res.json();
        if (cancelled) return;
        const rows: AddressRow[] = (json as any[]).map((item) => ({
          p: String(item.province ?? ''),
          a: String(item.amphoe ?? ''),
          d: String(item.district ?? ''),
          z: String(item.zipcode ?? ''),
        }));
        setThaiAddress(rows);
      } catch (e) {
        console.error('load thai address dataset failed', e);
      } finally {
        if (!cancelled) setLoadingThaiAddress(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.isNewCustomer, thaiAddress.length, loadingThaiAddress]);

  function openAddressPicker(field: 'province' | 'district' | 'subDistrict' | 'zipCode') {
    if (loadingThaiAddress || thaiAddress.length === 0) {
      Alert.alert('กำลังโหลดข้อมูลที่อยู่', 'กรุณารอสักครู่แล้วลองใหม่อีกครั้ง');
      return;
    }
    const nc = form.newCustomer;
    let options: string[] = [];
    let title = '';
    if (field === 'province') {
      title = 'เลือกจังหวัด';
      options = [...new Set(thaiAddress.map((r) => r.p))].filter(Boolean).sort();
    } else if (field === 'district') {
      if (!nc.province) { Alert.alert('กรุณาเลือกจังหวัดก่อน', ''); return; }
      title = 'เลือกอำเภอ/เขต';
      options = [...new Set(thaiAddress.filter((r) => r.p === nc.province).map((r) => r.a))].filter(Boolean).sort();
    } else if (field === 'subDistrict') {
      if (!nc.district) { Alert.alert('กรุณาเลือกอำเภอ/เขตก่อน', ''); return; }
      title = 'เลือกตำบล/แขวง';
      options = [...new Set(thaiAddress.filter((r) => r.p === nc.province && r.a === nc.district).map((r) => r.d))].filter(Boolean).sort();
    } else {
      if (!nc.subDistrict) { Alert.alert('กรุณาเลือกตำบล/แขวงก่อน', ''); return; }
      title = 'เลือกรหัสไปรษณีย์';
      options = [...new Set(thaiAddress.filter((r) => r.p === nc.province && r.a === nc.district && r.d === nc.subDistrict).map((r) => r.z))].filter(Boolean).sort();
    }
    setAddressPickerModal({ visible: true, field, title, options, search: '' });
  }

  function selectAddressOption(value: string) {
    const field = addressPickerModal.field;
    if (!field) return;
    setForm((f) => {
      const nc = { ...f.newCustomer, [field]: value };
      // เปลี่ยนตัวบน ล้างตัวล่างเสมอ — ตรงกับ clearAddress()/onChange ของ select2-addr ฝั่งเว็บ
      if (field === 'province') { nc.district = ''; nc.subDistrict = ''; nc.zipCode = ''; }
      else if (field === 'district') { nc.subDistrict = ''; nc.zipCode = ''; }
      else if (field === 'subDistrict') { nc.zipCode = ''; }
      return { ...f, newCustomer: nc };
    });
    setAddressPickerModal({ visible: false, field: null, title: '', options: [], search: '' });
  }

  // โหลดตัวเลือกดรอปดาวน์จริงทั้งหมด (บริษัท/ลูกค้า/ประเภทงาน/ผู้ใช้/ทีม/ธนาคาร/ทีมช่าง)
  // จาก get_master_data — เรียกครั้งเดียวตอนเปิดหน้า ใช้ร่วมกันทั้งโหมดสร้างใหม่และแก้ไข
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoadingMaster(true);
    (async () => {
      try {
        const res = await apiMobileGet(PROJECT_API_URL, 'get_master_data', { user_id: userId });
        if (cancelled) return;
        setMaster({
          companies: (res.companies ?? []).map((c: any) => ({ id: String(c.id), label: c.display_name || c.company_name })),
          customers: (res.customers ?? []).map((c: any) => ({ id: String(c.customer_id), label: c.customer_name })),
          jobTypes: (res.job_types ?? []).map((j: any) => ({ id: String(j.id), label: j.type_name })),
          users: res.users ?? [],
          salesTeams: res.teams ?? [],
          techTeamOptions: res.tech_team_options ?? [],
          banks: (res.banks ?? []).map((b: any) => b.name),
        });
      } catch (e) {
        console.error('project_API_mobile action=get_master_data failed', e);
      } finally {
        if (!cancelled) setLoadingMaster(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // เลขหน้างานถัดไปแบบ real-time — เฉพาะตอนสร้างใหม่ (แก้ไขใช้เลขเดิม/editId)
  useEffect(() => {
    if (editId || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiMobileGet(PROJECT_API_URL, 'get_next_number', { user_id: userId, year: new Date().getFullYear() });
        if (!cancelled) setNextNumber(Number(res.next_number));
      } catch (e) {
        console.error('project_API_mobile action=get_next_number failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, userId]);

  // โหลดข้อมูลเดิมมาเติมฟอร์มตอนเปิดแก้ไข — เชื่อม get_detail จริงของ project_API_mobile.php
  // (README_project.md ข้อ 4.4) ผู้ใช้ยังตรวจสอบ/แก้ไขค่าที่เติมมาได้ก่อนกดบันทึกอีกที
  useEffect(() => {
    if (!editId || !userId) return;
    let cancelled = false;
    setLoadingDetail(true);
    (async () => {
      try {
        const res = await apiMobileGet(PROJECT_API_URL, 'get_detail', { user_id: userId, project_id: editId });
        const d = res.detail as any;
        if (cancelled || !d) return;
        setForm((f) => ({
          ...f,
          isStockSite: false,
          companyId: d.company_id ? String(d.company_id) : '',
          isNewCustomer: false,
          customerId: String(d.customer_id ?? ''),
          projectName: d.project_name || '',
          jobTypeId: d.job_type_id ? String(d.job_type_id) : '',
          projectBudget: d.project_budget ? String(d.project_budget) : '',
          salesType: d.sales_type === 'ทีม' ? 'ทีม' : 'บุคคล',
          salesUser: d.sales_user || '',
          salesTeam: d.sales_team || '',
          debtUser: d.debt_user || '',
          guaranteeType: (['ไม่มี', 'หนังสือค้ำ', 'ค้ำแบบจนกว่าจะหมดภาระผูกพันธ์', 'เงินสด'] as const).includes(d.guarantee_type)
            ? d.guarantee_type
            : 'ไม่มี',
          guaranteeAmount: d.guarantee_amount ? String(d.guarantee_amount) : '',
          bankName: d.bank_name || '',
          bankAccount: d.bank_account || '',
          guaranteeNo: d.guarantee_no || '',
          guaranteeStartDate: d.guarantee_start_date || '',
          guaranteeEndDate: d.guarantee_end_date || '',
          warrantyValue: d.warranty_value ? String(d.warranty_value) : '',
          warrantyUnit: (['days', 'months', 'years'] as const).includes(d.warranty_unit) ? d.warranty_unit : 'days',
          deliveryDays: d.delivery_days ? String(d.delivery_days) : '',
          hasTechnician: Boolean(d.req_tech_team || d.technicians),
          techTeams: d.req_tech_team
            ? [{ id: uid('team'), teamName: d.req_tech_team, technicians: (d.tech_full_details || d.technicians || '').split(',').map((s: string) => s.trim()).filter(Boolean) }]
            : f.techTeams,
          isPcAssembly: Boolean(Number(d.is_pc_assembly ?? 0)),
          contractNo: d.contract_no || '',
          purchaseOrderNo: d.purchase_order_no || '',
          startDate: d.start_date || '',
          contractDuration: d.contract_duration ? String(d.contract_duration) : '',
          contractUnit: (['days', 'months', 'years'] as const).includes(d.contract_unit) ? d.contract_unit : 'days',
          endDate: d.end_date || '',
          endDateManual: true, // ใช้ end_date เดิมจาก server ตรงๆ ไม่คำนวณทับจากวันเริ่ม+ระยะเวลา
          alertContractDays: d.alert_days_before_expire ? String(d.alert_days_before_expire) : f.alertContractDays,
          biddingType: d.bidding_type === 'ยื่น' ? 'ยื่น' : 'ไม่ยื่น',
          biddingDate: d.bidding_date || '',
          quotationNo: d.quotation_no || '',
          quoteCreator: d.quote_creator || '',
        }));
      } catch (e) {
        console.error('project_API_mobile action=get_detail failed', e);
        Alert.alert('โหลดข้อมูลเดิมไม่สำเร็จ', 'กรุณาลองเปิดหน้านี้ใหม่อีกครั้ง');
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, userId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setNew<K extends keyof FormState['newCustomer']>(key: K, value: FormState['newCustomer'][K]) {
    setForm((f) => ({ ...f, newCustomer: { ...f.newCustomer, [key]: value } }));
  }

  const computedEndDate = useMemo(() => {
    if (form.endDateManual) return form.endDate;
    const auto = calcEndDate(form.startDate, form.contractDuration, form.contractUnit);
    return auto || form.endDate;
  }, [form.startDate, form.contractDuration, form.contractUnit, form.endDateManual, form.endDate]);

  function handleBack() {
    if (onBack) return onBack();
    if (router.canGoBack()) return router.back();
    router.push('/project_dashboard' as never);
  }

  // แนบไฟล์สัญญา — จำกัดนามสกุลตรงกับที่ project_API_mobile.php action=save_project อนุญาต
  // (pdf/jpg/jpeg/png) ให้ตรงกับ create_project.php ต้นฉบับเป๊ะ
  async function pickContractFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const f = res.assets[0];
      const ext = (f.name.split('.').pop() ?? '').toLowerCase();
      if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
        Alert.alert('นามสกุลไฟล์ไม่ถูกต้อง', 'รองรับเฉพาะ PDF, JPG, JPEG, PNG เท่านั้น');
        return;
      }
      set('contractFile', { uri: f.uri, name: f.name, mimeType: f.mimeType });
    } catch (e) {
      console.error('pick contract file failed', e);
      Alert.alert('เลือกไฟล์ไม่สำเร็จ', 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  function addTeam() {
    setForm((f) => ({ ...f, techTeams: [...f.techTeams, mkTeam()] }));
  }
  function removeTeam(id: string) {
    setForm((f) => ({ ...f, techTeams: f.techTeams.filter((t) => t.id !== id) }));
  }
  function updateTeamName(id: string, name: string) {
    setForm((f) => ({ ...f, techTeams: f.techTeams.map((t) => (t.id === id ? { ...t, teamName: name } : t)) }));
  }
  function addTechToTeam(id: string) {
    setForm((f) => ({ ...f, techTeams: f.techTeams.map((t) => (t.id === id ? { ...t, technicians: [...t.technicians, ''] } : t)) }));
  }
  function removeTechFromTeam(id: string, idx: number) {
    setForm((f) => ({ ...f, techTeams: f.techTeams.map((t) => (t.id === id ? { ...t, technicians: t.technicians.filter((_, i) => i !== idx) } : t)) }));
  }
  function updateTechName(id: string, idx: number, name: string) {
    setForm((f) => ({
      ...f,
      techTeams: f.techTeams.map((t) => (t.id === id ? { ...t, technicians: t.technicians.map((n, i) => (i === idx ? name : n)) } : t)),
    }));
  }

  async function handleSave() {
    if (editId && loadingDetail) {
      Alert.alert('กรุณารอสักครู่', 'ระบบกำลังโหลดข้อมูลเดิมของโครงการ');
      return;
    }
    if (!form.isStockSite) {
      if (!form.companyId) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกบริษัท');
      if (!form.isNewCustomer && !form.customerId) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกลูกค้า หรือติ๊กเพิ่มลูกค้าใหม่');
      if (form.isNewCustomer && !form.newCustomer.name.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุชื่อลูกค้าใหม่');
      if (!form.projectName.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุชื่องบ/โครงการ');
      if (!form.jobTypeId) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกประเภทงาน');
      if (form.hasTechnician === null) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุว่ามีทีมช่างสำหรับโครงการนี้หรือไม่');
      if (form.isPcAssembly === null) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุว่ามีงานประกอบอุปกรณ์หรือไม่');
      if (form.biddingType === 'ยื่น' && !form.biddingDate.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุวันที่ยื่นซอง');
    }

    // ชื่อ field ตรงกับ $_POST[...] ที่ create_project.php action=save_project รับจริง (ยืนยันแล้ว
    // ผ่าน curl กับ project_API_mobile.php ซึ่งพอร์ต logic เดิมมาทั้งดุ้น)
    const fd = new FormData();
    fd.append('action', 'save_project');
    fd.append('user_id', String(userId));
    if (editId) fd.append('edit_id', String(editId));
    fd.append('is_stock_site', form.isStockSite ? '1' : '0');
    fd.append('company_id', form.companyId);
    if (form.isNewCustomer) {
      fd.append('is_new_customer', '1');
      fd.append('new_customer_name', form.newCustomer.name);
      fd.append('new_affiliation', form.newCustomer.affiliation);
      fd.append('new_contact_person', form.newCustomer.contactPerson);
      fd.append('new_address', form.newCustomer.address);
      fd.append('new_province', form.newCustomer.province);
      fd.append('new_district', form.newCustomer.district);
      fd.append('new_sub_district', form.newCustomer.subDistrict);
      fd.append('new_zip_code', form.newCustomer.zipCode);
      fd.append('new_remark', form.newCustomer.remark);
    } else {
      fd.append('customer_id', form.customerId);
    }
    fd.append('project_name', form.projectName);
    fd.append('job_type_id', form.jobTypeId);
    fd.append('project_budget', form.projectBudget);
    fd.append('sales_type', form.salesType);
    fd.append('sales_user', form.salesUser);
    fd.append('sales_team', form.salesTeam);
    // ผู้ติดตามหนี้เป็น "บุคคล" เสมอตามต้นฉบับ (ฟอร์มนี้ตัดตัวเลือกทีมติดตามหนี้ออกเพื่อความง่าย)
    fd.append('debt_type', 'บุคคล');
    fd.append('debt_user', form.debtUser);
    fd.append('guarantee_type', form.guaranteeType);
    if (showGuaranteeFields) {
      fd.append('guarantee_amount', form.guaranteeAmount);
      fd.append('bank_name', form.bankName);
      fd.append('bank_account', form.bankAccount);
      fd.append('guarantee_no', form.guaranteeNo);
      fd.append('guarantee_start_date', form.guaranteeStartDate);
      fd.append('guarantee_end_date', form.guaranteeEndDate);
      fd.append('warranty_value', form.warrantyValue);
      fd.append('warranty_unit', form.warrantyUnit);
    }
    fd.append('delivery_days', form.deliveryDays);
    fd.append('has_technician', form.hasTechnician ? '1' : '0');
    if (form.hasTechnician) {
      form.techTeams.forEach((t) => {
        fd.append('req_tech_team[]', t.teamName);
        fd.append('tech_display[]', t.technicians.filter((n) => n.trim()).join(', '));
      });
    }
    fd.append('is_pc_assembly', form.isPcAssembly ? '1' : '0');
    fd.append('contract_no', form.contractNo);
    fd.append('purchase_order_no', form.purchaseOrderNo);
    fd.append('start_date', form.startDate);
    fd.append('contract_duration', form.contractDuration);
    fd.append('contract_unit', form.contractUnit);
    fd.append('end_date', computedEndDate);
    fd.append('alert_contract_days', form.alertContractDays);
    fd.append('bidding_type', form.biddingType);
    fd.append('bidding_date', form.biddingDate);
    fd.append('quotation_no', form.quotationNo);
    fd.append('quote_creator', form.quoteCreator);
    if (form.contractFile) {
      // FormData ของ React Native รับไฟล์เป็น object { uri, name, type } (คนละแบบกับ Blob ฝั่งเว็บ)
      fd.append('contract_file', {
        uri: form.contractFile.uri,
        name: form.contractFile.name,
        type: form.contractFile.mimeType || 'application/octet-stream',
      } as any);
    }

    setSaving(true);
    try {
      const res = await axios.post(PROJECT_API_URL, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.status === 'success' || res.data?.success) {
        Alert.alert('บันทึกสำเร็จ', editId ? 'แก้ไขข้อมูลโครงการเรียบร้อย!' : 'สร้างโครงการใหม่เรียบร้อย!', [
          { text: 'ตกลง', onPress: () => (onSaved ? onSaved() : handleBack()) },
        ]);
      } else {
        Alert.alert('บันทึกไม่สำเร็จ', res.data?.message || 'กรุณาลองใหม่อีกครั้ง');
      }
    } catch (e) {
      console.error('save_project failed', e);
      Alert.alert('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  const today = new Date();
  const todayShow = formatShortThaiDate(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  );

  const showGuaranteeFields = form.guaranteeType !== 'ไม่มี';
  const isCashGuarantee = form.guaranteeType === 'เงินสด';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color="#0f172a" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name={editId ? 'create-outline' : 'folder-open-outline'} size={18} color="#3b82f6" />
            <Text style={styles.title}>{editId ? 'แก้ไขโครงการ' : 'สร้างโครงการใหม่'}</Text>
          </View>
          <View style={styles.numberBadge}>
            <Text style={styles.numberBadgeLabel}>เลขหน้างาน</Text>
            <Text style={styles.numberBadgeValue}>{editId ?? nextNumber ?? '...'}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <SectionTitle icon="information-circle-outline" text="ข้อมูลหลัก (Main Info)" />

            <FieldLabel text="วันที่ลงข้อมูล (อ้างอิงตามระบบ)" />
            <View style={styles.readonlyInput}>
              <Ionicons name="calendar-outline" size={14} color="#64748b" />
              <Text style={styles.readonlyInputText}>{todayShow}</Text>
            </View>

            <TouchableOpacity style={styles.stockSiteBox} onPress={() => set('isStockSite', !form.isStockSite)} activeOpacity={0.8}>
              <Ionicons name={form.isStockSite ? 'checkbox' : 'square-outline'} size={20} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={styles.stockSiteTitle}>สร้างเป็นหน้างานสต๊อก</Text>
                <Text style={styles.stockSiteHint}>หากติ๊กเลือก ระบบจะไม่บังคับกรอกข้อมูลใดๆ (เว้นว่างได้ทั้งหมด)</Text>
              </View>
            </TouchableOpacity>

            <FieldLabel text="บริษัท" required />
            {loadingMaster ? (
              <ActivityIndicator style={{ alignSelf: 'flex-start', marginVertical: 6 }} color="#3b82f6" />
            ) : (
              <PickerTrigger
                label={master.companies.find((o) => o.id === form.companyId)?.label ?? ''}
                placeholder="เลือกบริษัท..."
                onPress={() =>
                  openPicker(
                    'เลือกบริษัท',
                    master.companies.map((o) => ({ value: o.id, label: o.label })),
                    form.companyId,
                    (v) => set('companyId', v)
                  )
                }
              />
            )}

            <View style={styles.customerHeaderRow}>
              <FieldLabel text="ชื่อลูกค้า" required />
              <TouchableOpacity style={styles.newCustomerToggle} onPress={() => set('isNewCustomer', !form.isNewCustomer)}>
                <Ionicons name={form.isNewCustomer ? 'checkbox' : 'square-outline'} size={14} color="#2563eb" />
                <Text style={styles.newCustomerToggleText}>เพิ่มลูกค้าใหม่</Text>
              </TouchableOpacity>
            </View>

            {!form.isNewCustomer ? (
              loadingMaster || (editId && loadingDetail) ? (
                <ActivityIndicator style={{ alignSelf: 'flex-start', marginVertical: 6 }} color="#3b82f6" />
              ) : (
                <PickerTrigger
                  label={master.customers.find((o) => o.id === form.customerId)?.label ?? ''}
                  placeholder="เลือกลูกค้า..."
                  onPress={() =>
                    openPicker(
                      'เลือกชื่อลูกค้า',
                      master.customers.map((o) => ({ value: o.id, label: o.label })),
                      form.customerId,
                      (v) => set('customerId', v)
                    )
                  }
                />
              )
            ) : (
              <View style={styles.newCustomerBox}>
                <TextInput style={styles.input} placeholder="ชื่อลูกค้าใหม่" placeholderTextColor="#94a3b8" value={form.newCustomer.name} onChangeText={(v) => setNew('name', v)} />
                <TextInput style={styles.input} placeholder="สังกัด / หน่วยงาน เช่น สพฐ., อบต." placeholderTextColor="#94a3b8" value={form.newCustomer.affiliation} onChangeText={(v) => setNew('affiliation', v)} />
                <TextInput style={styles.input} placeholder="ชื่อผู้ติดต่อ" placeholderTextColor="#94a3b8" value={form.newCustomer.contactPerson} onChangeText={(v) => setNew('contactPerson', v)} />
                <TextInput style={styles.input} placeholder="ที่อยู่ (เลขที่, หมู่, ซอย, ถนน)" placeholderTextColor="#94a3b8" value={form.newCustomer.address} onChangeText={(v) => setNew('address', v)} />
                {loadingThaiAddress && <Text style={styles.autoHint}>กำลังโหลดฐานข้อมูลที่อยู่ไทย...</Text>}
                <View style={styles.rowGap}>
                  <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => openAddressPicker('province')}>
                    <Text style={form.newCustomer.province ? styles.addrPickedText : styles.addrPlaceholderText}>
                      {form.newCustomer.province || 'จังหวัด'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => openAddressPicker('district')}>
                    <Text style={form.newCustomer.district ? styles.addrPickedText : styles.addrPlaceholderText}>
                      {form.newCustomer.district || 'อำเภอ/เขต'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.rowGap}>
                  <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => openAddressPicker('subDistrict')}>
                    <Text style={form.newCustomer.subDistrict ? styles.addrPickedText : styles.addrPlaceholderText}>
                      {form.newCustomer.subDistrict || 'ตำบล/แขวง'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => openAddressPicker('zipCode')}>
                    <Text style={form.newCustomer.zipCode ? styles.addrPickedText : styles.addrPlaceholderText}>
                      {form.newCustomer.zipCode || 'รหัสไปรษณีย์'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput style={[styles.input, styles.textarea]} placeholder="หมายเหตุ (ถ้ามี)" placeholderTextColor="#94a3b8" multiline value={form.newCustomer.remark} onChangeText={(v) => setNew('remark', v)} />
              </View>
            )}

            <FieldLabel text="ชื่องบ / โครงการ" required />
            <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุชื่อโครงการ..." placeholderTextColor="#94a3b8" multiline value={form.projectName} onChangeText={(v) => set('projectName', v)} />

            <FieldLabel text="ประเภทงาน" required />
            <PickerTrigger
              label={master.jobTypes.find((o) => o.id === form.jobTypeId)?.label ?? ''}
              placeholder="เลือกประเภทงาน..."
              onPress={() =>
                openPicker(
                  'เลือกประเภทงาน',
                  master.jobTypes.map((o) => ({ value: o.id, label: o.label })),
                  form.jobTypeId,
                  (v) => set('jobTypeId', v)
                )
              }
            />

            <FieldLabel text="ยอดงบ / โครงการ (บาท)" />
            <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={form.projectBudget} onChangeText={(v) => set('projectBudget', v)} />

            <FieldLabel text="ผู้รับผิดชอบโครงการ" />
            <View style={styles.rowGap}>
              <TouchableOpacity style={[styles.radioPill, form.salesType === 'บุคคล' && styles.radioPillActive]} onPress={() => set('salesType', 'บุคคล')}>
                <Text style={[styles.radioPillText, form.salesType === 'บุคคล' && styles.radioPillTextActive]}>บุคคล</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.radioPill, form.salesType === 'ทีม' && styles.radioPillActive]} onPress={() => set('salesType', 'ทีม')}>
                <Text style={[styles.radioPillText, form.salesType === 'ทีม' && styles.radioPillTextActive]}>ทีม</Text>
              </TouchableOpacity>
            </View>
            {form.salesType === 'บุคคล' ? (
              <PickerTrigger
                label={form.salesUser}
                placeholder="เลือกผู้รับผิดชอบ..."
                onPress={() => openPicker('เลือกผู้รับผิดชอบโครงการ', master.users.map((u) => ({ value: u, label: u })), form.salesUser, (v) => set('salesUser', v))}
              />
            ) : (
              <PickerTrigger
                label={form.salesTeam}
                placeholder="เลือกทีม..."
                onPress={() => openPicker('เลือกทีมผู้รับผิดชอบโครงการ', master.salesTeams.map((u) => ({ value: u, label: u })), form.salesTeam, (v) => set('salesTeam', v))}
              />
            )}

            <FieldLabel text="ผู้ติดตามหนี้" />
            <PickerTrigger
              label={form.debtUser}
              placeholder="เลือกผู้ติดตามหนี้..."
              onPress={() => openPicker('เลือกผู้ติดตามหนี้', master.users.map((u) => ({ value: u, label: u })), form.debtUser, (v) => set('debtUser', v))}
            />

            <View style={styles.divider} />
            <Text style={styles.subHeading}>การค้ำประกัน</Text>

            <FieldLabel text="ประเภทการค้ำประกัน" />
            <PickerTrigger
              label={form.guaranteeType}
              placeholder="เลือกประเภทการค้ำประกัน..."
              onPress={() =>
                openPicker(
                  'เลือกประเภทการค้ำประกัน',
                  ['ไม่มี', 'หนังสือค้ำ', 'ค้ำแบบจนกว่าจะหมดภาระผูกพันธ์', 'เงินสด'].map((o) => ({ value: o, label: o })),
                  form.guaranteeType,
                  (v) => set('guaranteeType', v as GuaranteeType)
                )
              }
            />

            {showGuaranteeFields && (
              <>
                <FieldLabel text="จำนวนเงินค้ำประกัน (บาท)" />
                <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={form.guaranteeAmount} onChangeText={(v) => set('guaranteeAmount', v)} />

                {!isCashGuarantee ? (
                  <>
                    <FieldLabel text="ธนาคารผู้ออกหนังสือ" />
                    <PickerTrigger
                      label={form.bankName}
                      placeholder="เลือกธนาคาร..."
                      onPress={() => openPicker('เลือกธนาคารผู้ออกหนังสือ', master.banks.map((b) => ({ value: b, label: b })), form.bankName, (v) => set('bankName', v))}
                    />
                    <FieldLabel text="เลขที่บัญชี" />
                    <TextInput style={styles.input} placeholder="ระบุเลขที่บัญชี..." placeholderTextColor="#94a3b8" value={form.bankAccount} onChangeText={(v) => set('bankAccount', v)} />
                    <FieldLabel text="เลขที่หนังสือค้ำ" />
                    <TextInput style={styles.input} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={form.guaranteeNo} onChangeText={(v) => set('guaranteeNo', v)} />
                  </>
                ) : (
                  <>
                    <FieldLabel text="เลขที่บิล" />
                    <TextInput style={styles.input} placeholder="ระบุเลขที่บิล..." placeholderTextColor="#94a3b8" value={form.guaranteeNo} onChangeText={(v) => set('guaranteeNo', v)} />
                  </>
                )}

                <View style={styles.rowGap}>
                  <View style={{ flex: 1 }}>
                    <FieldLabel text="วันเริ่มค้ำประกัน" />
                    <DateField value={form.guaranteeStartDate} onChange={(v) => set('guaranteeStartDate', v)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FieldLabel text="วันสิ้นสุดค้ำประกัน" />
                    <DateField value={form.guaranteeEndDate} onChange={(v) => set('guaranteeEndDate', v)} />
                  </View>
                </View>

                <FieldLabel text="ระยะเวลารับประกัน" required />
                <View style={styles.rowGap}>
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="จำนวน" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={form.warrantyValue} onChangeText={(v) => set('warrantyValue', v)} />
                  <View style={{ flex: 1 }}>
                    <PickerTrigger
                      label={form.warrantyUnit}
                      placeholder="เลือกหน่วย..."
                      onPress={() =>
                        openPicker(
                          'เลือกหน่วยระยะเวลารับประกัน',
                          ['days', 'months', 'years'].map((o) => ({ value: o, label: o })),
                          form.warrantyUnit,
                          (v) => set('warrantyUnit', v as DurationUnit)
                        )
                      }
                    />
                  </View>
                </View>
              </>
            )}

            <FieldLabel text="ระยะเวลาจัดส่ง (วัน)" />
            <TextInput style={styles.input} placeholder="ระบุจำนวนวัน" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={form.deliveryDays} onChangeText={(v) => set('deliveryDays', v)} />
          </View>

          <View style={styles.card}>
            <SectionTitle icon="construct-outline" text="ข้อมูลทีมช่าง (Technician Info)" />

            <FieldLabel text="มีทีมช่างสำหรับโครงการนี้หรือไม่?" required />
            <TwoOptionToggle value={form.hasTechnician} labelA="ไม่มีช่าง" labelB="มีทีมช่าง" onChange={(v) => set('hasTechnician', v)} />

            {form.hasTechnician && (
              <View style={{ marginTop: 14 }}>
                {form.techTeams.map((team, tIdx) => (
                  <View key={team.id} style={styles.teamBlock}>
                    <View style={styles.teamBlockHeader}>
                      <Text style={styles.teamBlockTitle}>ทีมที่ {tIdx + 1}</Text>
                      {tIdx > 0 && (
                        <TouchableOpacity onPress={() => removeTeam(team.id)} style={styles.teamDeleteBtn}>
                          <Ionicons name="trash-outline" size={13} color="#ef4444" />
                          <Text style={styles.teamDeleteBtnText}>ลบทีมนี้</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <FieldLabel text="ชื่อทีมที่ต้องการช่าง" />
                    <PickerTrigger
                      label={team.teamName}
                      placeholder="เลือกทีมช่าง..."
                      onPress={() =>
                        openPicker('เลือกชื่อทีมที่ต้องการช่าง', master.techTeamOptions.map((o) => ({ value: o, label: o })), team.teamName, (v) => updateTeamName(team.id, v))
                      }
                    />

                    <FieldLabel text="รายชื่อช่างประจำทีมนี้" />
                    {team.technicians.map((name, tnIdx) => (
                      <View key={tnIdx} style={styles.techNameRow}>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          placeholder="พิมพ์ชื่อช่าง..."
                          placeholderTextColor="#94a3b8"
                          value={name}
                          onChangeText={(v) => updateTechName(team.id, tnIdx, v)}
                        />
                        {team.technicians.length > 1 && (
                          <TouchableOpacity onPress={() => removeTechFromTeam(team.id, tnIdx)} style={styles.techRemoveBtn}>
                            <Ionicons name="close" size={14} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                    <TouchableOpacity style={styles.addTechBtn} onPress={() => addTechToTeam(team.id)}>
                      <Ionicons name="add" size={13} color="#059669" />
                      <Text style={styles.addTechBtnText}>เพิ่มช่างในทีมนี้</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity style={styles.addTeamBtn} onPress={addTeam}>
                  <Ionicons name="people-outline" size={14} color="#fff" />
                  <Text style={styles.addTeamBtnText}>เพิ่มทีมช่าง</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <SectionTitle icon="desktop-outline" text="ข้อมูลงานประกอบอุปกรณ์ (Hardware Assembly)" />
            <TwoOptionToggle value={form.isPcAssembly} labelA="ไม่มีประกอบ" labelB="มีประกอบ" onChange={(v) => set('isPcAssembly', v)} />
          </View>

          <View style={styles.card}>
            <SectionTitle icon="document-text-outline" text="ข้อมูลสัญญา (Contract)" />

            <View style={styles.rowGap}>
              <View style={{ flex: 1 }}>
                <FieldLabel text="เลขที่สัญญา" />
                <TextInput style={styles.input} placeholder="ระบุเลขที่สัญญา..." placeholderTextColor="#94a3b8" value={form.contractNo} onChangeText={(v) => set('contractNo', v)} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel text="เลขที่ใบสั่งซื้อ" />
                <TextInput style={styles.input} placeholder="ระบุเลขที่ใบสั่งซื้อ..." placeholderTextColor="#94a3b8" value={form.purchaseOrderNo} onChangeText={(v) => set('purchaseOrderNo', v)} />
              </View>
            </View>

            <FieldLabel text="วันที่เริ่มสัญญา" />
            <DateField value={form.startDate} onChange={(v) => set('startDate', v)} />

            <FieldLabel text="กำหนดส่งมอบงาน" />
            <View style={styles.rowGap}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="ระบุจำนวน" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={form.contractDuration} onChangeText={(v) => set('contractDuration', v)} />
              <View style={{ flex: 1 }}>
                <PickerTrigger
                  label={form.contractUnit}
                  placeholder="เลือกหน่วย..."
                  onPress={() =>
                    openPicker(
                      'เลือกหน่วยระยะเวลาสัญญา',
                      ['days', 'months', 'years'].map((o) => ({ value: o, label: o })),
                      form.contractUnit,
                      (v) => set('contractUnit', v as DurationUnit)
                    )
                  }
                />
              </View>
            </View>

            <FieldLabel text="วันที่สิ้นสุดสัญญา" />
            <DateField
              value={computedEndDate}
              placeholder="คำนวณอัตโนมัติจากวันเริ่ม+ระยะเวลา"
              onChange={(v) => {
                set('endDateManual', true);
                set('endDate', v);
              }}
            />
            {!form.endDateManual && <Text style={styles.autoHint}>คำนวณอัตโนมัติ — กดเพื่อแก้ไขเอง</Text>}

            <View style={styles.rowGap}>
              <View style={{ flex: 1 }}>
                <FieldLabel text="แจ้งเตือนก่อนหมดสัญญา (วัน)" />
                <TextInput style={styles.input} placeholder="เช่น 45, 60" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={form.alertContractDays} onChangeText={(v) => set('alertContractDays', v)} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel text="แนบไฟล์เอกสารสัญญา" />
                <TouchableOpacity style={styles.attachBtn} onPress={pickContractFile}>
                  <Ionicons name="attach-outline" size={14} color="#dc2626" />
                  <Text style={styles.attachBtnText} numberOfLines={1}>
                    {form.contractFile ? form.contractFile.name : 'แนบไฟล์ PDF/รูปภาพ'}
                  </Text>
                </TouchableOpacity>
                {form.contractFile && (
                  <TouchableOpacity onPress={() => set('contractFile', null)} style={{ marginTop: 4 }}>
                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>ลบไฟล์ที่แนบ</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <SectionTitle icon="mail-open-outline" text="การยื่นซอง & ใบเสนอราคา" />

            <FieldLabel text="ประเภทการยื่นซอง" />
            <View style={styles.rowGap}>
              <TouchableOpacity style={[styles.radioPill, form.biddingType === 'ไม่ยื่น' && styles.radioPillActive]} onPress={() => set('biddingType', 'ไม่ยื่น')}>
                <Text style={[styles.radioPillText, form.biddingType === 'ไม่ยื่น' && styles.radioPillTextActive]}>ไม่ยื่น</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.radioPill, form.biddingType === 'ยื่น' && styles.radioPillActive]} onPress={() => set('biddingType', 'ยื่น')}>
                <Text style={[styles.radioPillText, form.biddingType === 'ยื่น' && styles.radioPillTextActive]}>ยื่น</Text>
              </TouchableOpacity>
            </View>

            {form.biddingType === 'ยื่น' && (
              <>
                <FieldLabel text="วันที่ยื่นซอง" required />
                <DateField value={form.biddingDate} onChange={(v) => set('biddingDate', v)} />
              </>
            )}

            <FieldLabel text="เลขที่ใบเสนอราคา" />
            <TextInput style={styles.input} placeholder="ระบุเลขที่ใบเสนอราคา..." placeholderTextColor="#94a3b8" value={form.quotationNo} onChangeText={(v) => set('quotationNo', v)} />

            <FieldLabel text="ผู้เปิดใบเสนอราคา" />
            <PickerTrigger
              label={form.quoteCreator}
              placeholder="เลือกผู้เปิดใบเสนอราคา..."
              onPress={() => openPicker('เลือกผู้เปิดใบเสนอราคา', master.users.map((u) => ({ value: u, label: u })), form.quoteCreator, (v) => set('quoteCreator', v))}
            />
          </View>

          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleBack}>
              <Ionicons name="close" size={16} color="#475569" />
              <Text style={styles.cancelBtnText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, (saving || loadingDetail) && { opacity: 0.7 }]} onPress={handleSave} disabled={saving || loadingDetail}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={17} color="#fff" />}
              <Text style={styles.saveBtnText}>{saving ? 'กำลังบันทึก...' : loadingDetail ? 'กำลังโหลดข้อมูลเดิม...' : 'บันทึกข้อมูลโครงการ'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Modal เลือกที่อยู่แบบ cascading — จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์ จาก raw_database.json */}
      <Modal visible={addressPickerModal.visible} transparent animationType="slide" onRequestClose={() => setAddressPickerModal((s) => ({ ...s, visible: false }))}>
        <TouchableOpacity style={styles.addrModalOverlay} activeOpacity={1} onPress={() => setAddressPickerModal((s) => ({ ...s, visible: false }))}>
          <TouchableOpacity activeOpacity={1} style={styles.addrModalCard} onPress={() => {}}>
            <View style={styles.addrModalTitleRow}>
              <Text style={styles.addrModalTitle}>{addressPickerModal.title}</Text>
              <TouchableOpacity onPress={() => setAddressPickerModal((s) => ({ ...s, visible: false }))}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="ค้นหา..."
              placeholderTextColor="#94a3b8"
              value={addressPickerModal.search}
              onChangeText={(v) => setAddressPickerModal((s) => ({ ...s, search: v }))}
            />
            <ScrollView style={{ marginTop: 8 }} keyboardShouldPersistTaps="handled">
              {(() => {
                const term = addressPickerModal.search.trim().toLowerCase();
                const filtered = term ? addressPickerModal.options.filter((o) => o.toLowerCase().includes(term)) : addressPickerModal.options;
                if (filtered.length === 0) return <Text style={styles.addrModalEmpty}>ไม่พบตัวเลือกที่ตรงกัน</Text>;
                return filtered.map((opt) => (
                  <TouchableOpacity key={opt} style={styles.addrModalRow} onPress={() => selectAddressOption(opt)}>
                    <Text style={styles.addrModalRowText}>{opt}</Text>
                  </TouchableOpacity>
                ));
              })()}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ป๊อปอัพเลือกตัวเลือกแบบใช้ร่วมกันทุกช่อง (แทนที่ ChipPicker/IdChipPicker แบบเลื่อนแนวนอน) */}
      <Modal visible={pickerModal.visible} transparent animationType="fade" onRequestClose={() => setPickerModal((s) => ({ ...s, visible: false }))}>
        <TouchableOpacity style={styles.pickerModalOverlay} activeOpacity={1} onPress={() => setPickerModal((s) => ({ ...s, visible: false }))}>
          <View style={styles.pickerModalSheet}>
            <Text style={styles.pickerModalTitle}>{pickerModal.title}</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {pickerModal.options.length === 0 ? (
                <Text style={styles.pickerModalEmptyText}>ยังไม่มีตัวเลือก</Text>
              ) : (
                pickerModal.options.map((opt) => {
                  const active = pickerModal.current === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.pickerModalOption, active && styles.pickerModalOptionActive]}
                      onPress={() => {
                        pickerModal.onSelect(opt.value);
                        setPickerModal((s) => ({ ...s, visible: false }));
                      }}
                    >
                      <Text style={styles.pickerModalOptionText}>{opt.label}</Text>
                      {active && <Ionicons name="checkmark" size={16} color="#2563eb" />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity style={styles.pickerModalCloseBtn} onPress={() => setPickerModal((s) => ({ ...s, visible: false }))}>
              <Text style={styles.pickerModalCloseBtnText}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7f9' },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15.5, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  numberBadge: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center' },
  numberBadgeLabel: { fontSize: 8.5, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase' },
  numberBadgeValue: { fontSize: 13, color: '#4f46e5', fontWeight: '800' },

  body: { padding: 14 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 14 },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#334155', alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14 },
  sectionTitleText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },

  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 10 },
  required: { color: '#ef4444' },

  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#0f172a', backgroundColor: '#fff' },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
  rowGap: { flexDirection: 'row', gap: 8 },
  autoHint: { fontSize: 10, color: '#94a3b8', marginTop: 4 },
  addrPickedText: { fontSize: 13.5, color: '#0f172a', fontWeight: '600' },
  addrPlaceholderText: { fontSize: 13.5, color: '#94a3b8' },
  addrModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  addrModalCard: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '75%', padding: 16 },
  addrModalTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  addrModalTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  addrModalRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  addrModalRowText: { fontSize: 14, color: '#1e293b' },
  addrModalEmpty: { textAlign: 'center', color: '#94a3b8', paddingVertical: 24 },

  readonlyInput: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  readonlyInputText: { fontSize: 13, color: '#64748b', fontWeight: '700' },

  stockSiteBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#10b981', borderStyle: 'dashed', borderRadius: 12, padding: 12, marginTop: 12 },
  stockSiteTitle: { fontSize: 13, fontWeight: '800', color: '#047857' },
  stockSiteHint: { fontSize: 10.5, color: '#059669', marginTop: 2 },

  pickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  pickerTriggerText: { fontSize: 13, color: '#0f172a', fontWeight: '600', flexShrink: 1 },
  pickerTriggerPlaceholder: { color: '#94a3b8', fontWeight: '400' },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  pickerModalSheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  pickerModalTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  pickerModalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  pickerModalOptionActive: { backgroundColor: '#eff6ff' },
  pickerModalOptionText: { fontSize: 12.5, fontWeight: '700', color: '#334155', flexShrink: 1 },
  pickerModalCloseBtn: { marginTop: 8, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 },
  pickerModalCloseBtnText: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },
  pickerModalEmptyText: { fontSize: 12, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },

  customerHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  newCustomerToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  newCustomerToggleText: { fontSize: 11, color: '#2563eb', fontWeight: '700' },
  newCustomerBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, gap: 8, marginTop: 4 },

  radioPill: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#fff' },
  radioPillActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  radioPillText: { fontSize: 12.5, color: '#64748b', fontWeight: '700' },
  radioPillTextActive: { color: '#2563eb' },

  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 16 },
  subHeading: { fontSize: 12.5, fontWeight: '800', color: '#7c3aed', marginBottom: 4 },

  twoOptionRow: { flexDirection: 'row', gap: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10 },
  twoOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center', paddingVertical: 6 },
  twoOptionBtnActiveNeutral: {},
  twoOptionBtnActiveGreen: {},
  twoOptionText: { fontSize: 12.5, fontWeight: '700', color: '#64748b' },

  teamBlock: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 12, padding: 12, marginBottom: 12 },
  teamBlockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  teamBlockTitle: { fontSize: 12.5, fontWeight: '800', color: '#047857' },
  teamDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  teamDeleteBtnText: { fontSize: 10.5, fontWeight: '700', color: '#ef4444' },

  techNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  techRemoveBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  addTechBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 4 },
  addTechBtnText: { fontSize: 11, fontWeight: '700', color: '#059669' },

  addTeamBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#059669', borderRadius: 10, paddingVertical: 11 },
  addTeamBtnText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },

  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10 },
  attachBtnText: { fontSize: 11.5, fontWeight: '700', color: '#dc2626' },

  footerRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 15 },
  cancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 14 },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 15 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});