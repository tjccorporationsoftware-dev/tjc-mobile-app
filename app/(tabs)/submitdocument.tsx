/**
 * SubmitDocumentScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า SubmitDocument.php — ใช้ทั้ง "ลงสมุดเสนอเอกสาร" (สร้างใหม่) และ
 * "แก้ไขเอกสาร" (มี docId) เหมือนต้นฉบับที่เป็นไฟล์เดียวกันสลับโหมดด้วย $is_edit_mode
 * เชื่อมจากปุ่ม "แก้ไข" ในการ์ดเอกสารของ DocumentDashboardScreen
 *
 * สถานะไฟล์นี้: เชื่อม API จริงแล้ว — SubmitDocument.php (เว็บ) ถูกบังคับผ่าน auth.php (ต้อง
 * session เว็บ) เหมือนหน้าอื่นๆ ที่เจอมาก่อน จึงย้ายมาใช้ document_API_mobile.php แทนทั้งหมด:
 *   get_submit_master_data — โหลดบริษัท/ธนาคาร(+เกณฑ์จำนวนหลัก)/ซัพพลายเออร์/ประวัติบัญชีจริง
 *   get_detail             — โหลดข้อมูลเดิมตอนแก้ไข (action ที่มีอยู่แล้ว ไม่เคยถูกใช้มาก่อน)
 *   submit_doc              — สร้างใหม่/แก้ไข (พอร์ตตรรกะจาก SubmitDocument.php ทุกขั้นตอน:
 *                             auto-add supplier/bank_accounts, diff log ตอนแก้ไข, auto-resolve
 *                             คำขอแก้ไขที่ค้างอยู่) ทดสอบ create+edit จริงแล้วก่อนส่งมอบ
 *   ส่วนการลงรับใบกำกับภาษี 7% (ถ้าเลือกไว้) แยกไปเรียก receive_tax_warehouse/receive_tax_buyer/
 *   receive_tax_acc ต่อด้วย doc_id ที่ได้ — action เดียวกับปุ่มในแดชบอร์ดเอกสาร (ทดสอบแล้วก่อนหน้านี้)
 *   กันไม่ให้มี logic ลงรับใบกำกับซ้ำสองที่
 *
 * ตรงกับโครงสร้าง/สูตร/validation จริงจาก SubmitDocument.php:
 *  - ข้อมูลเอกสาร: doc_type (PO/AX แบบปุ่มสวิตช์), เลขที่เอกสาร (กรองให้เหลือแค่ตัวเลข/ขีด),
 *    บริษัท(ผู้ซื้อ), โครงการ/หน้างาน, ผู้เปิดเอกสาร (ล็อกเป็นผู้ใช้ปัจจุบันเสมอ)
 *  - รายละเอียดการจ่ายเงิน: ซัพพลายเออร์, รายละเอียด/งวดงาน, ยอดจ่ายจริง, ขอเครดิต + preset
 *    วันมาตรฐาน (15/30/45/60/90) หรือกรอกเอง
 *  - บัญชีปลายทาง: ชื่อบัญชี/เลขที่บัญชี/ธนาคาร
 *  - เอกสารแนบ: เลือกได้ 1 ใน 5 ประเภท — ถ้าเลือก "ใบกำกับภาษี 7%" จะโผล่กล่องลงรับใบกำกับ
 *    ทันที (ต้องเลือกฝ่ายที่รับ 1 ใน 3: คลัง/จัดซื้อ/บัญชี + ต้องมีเลขที่ใบกำกับอย่างน้อย 1
 *    รายการ ถึงจะบันทึกได้ — ตรงกับ taxAttachmentOk() ของต้นฉบับ)
 *  - หัก ณ ที่จ่าย (WHT): ไม่มี/1%/2%/3%/5% — ยอดที่กรอกคือ "ยอดหลังหัก" ระบบคำนวณย้อนกลับหา
 *    ยอดเต็มก่อนหักให้อัตโนมัติ ตรงสูตร calculateWHT() เป๊ะ:
 *      ยอดเต็มก่อนหัก = ยอดจ่ายจริง / (1 - เรต), ยอดหัก = ยอดเต็มก่อนหัก - ยอดจ่ายจริง
 *  - Validation ก่อนบันทึก: ต้องมีซัพพลายเออร์ + เลขบัญชี (ตรงกับ confirmSave() ที่เช็ค 2 ช่องนี้
 *    ก่อนอื่น) — การเช็คจำนวนหลักเลขบัญชีต่อธนาคาร (bankRules) ย่อให้เป็นคำแนะนำทั่วไปแทน
 *    เพราะกฎจริงต้องดึงจากตาราง bank_masters ที่ไม่ได้อยู่ในไฟล์ที่ส่งมา
 *
 * ที่ปรับให้เหมาะกับมือถือ/ตัดออก (เกินขอบเขต mockup):
 *  - แนบไฟล์ใบกำกับภาษีจริง (ต้อง expo-document-picker) — เป็น stub
 *  - select2 แบบพิมพ์ค้นหา/เพิ่มค่าใหม่ (ซัพพลายเออร์/ชื่อบัญชี/เลขบัญชี) — ย่อเหลือ chip
 *    เลือกจากประวัติ + ช่องพิมพ์เพิ่มเอง
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../_layout';
// ✅ Config
import { API_BASE, API_MODULES } from '../../constants/config';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';

const DOCUMENT_API_URL = `${API_MODULES}/document_API_mobile.php`;

interface PickedFile {
  uri: string;
  name: string;
  type: string;
}

// ====================================================================
// Types
// ====================================================================

type DocType = 'PO' | 'AX';
type AttachmentType = 'ใบสำคัญจ่าย' | 'ใบกำกับภาษี 7%' | 'รอใบกำกับภาษี 7%' | 'ใบเสร็จรับเงิน' | 'ชุดชำระเงิน';
type WhtRate = 'ไม่มี' | '1%' | '2%' | '3%' | '5%';
type TaxDept = '' | 'wh' | 'buyer' | 'acc';

interface FormState {
  docType: DocType;
  docNumber: string;
  companyId: string;
  jobSite: string;
  supplierName: string;
  description: string;
  amount: string;
  isCredit: boolean;
  creditTerm: string;
  accountName: string;
  bankAccount: string;
  bankName: string;
  attachmentSelect: AttachmentType | '';
  taxRecvDept: TaxDept;
  taxInvoiceNumbers: string[];
  taxNote: string;
  taxFiles: PickedFile[];
  // ชื่อไฟล์ใบกำกับที่แผนกนี้เคยแนบไว้แล้ว (โหลดมาตอนแก้ไขเอกสาร) — ต้องส่งกลับไปตอนบันทึกด้วย
  // (existing_files[]) ไม่งั้น backend จะเขียนทับคอลัมน์ไฟล์เป็นค่าว่าง ไฟล์เดิมหายหมด
  existingTaxFiles: string[];
  whtTax: WhtRate;
  whtAmount: string;
}

export interface SubmitDocumentScreenProps {
  docId?: string; // มีค่า = โหมดแก้ไข (เหมือนต้นฉบับที่เช็คจาก $_GET['edit_id'])
  onBack?: () => void;
  onSaved?: () => void;
}

// ====================================================================
// ตัวเลือกคงที่ / ชนิดข้อมูล master data จริง (get_submit_master_data)
// ====================================================================

interface CompanyOption {
  id: number;
  company_name: string;
}
interface AccountHistoryEntry {
  bank_account: string;
  account_name: string;
  bank_name: string;
}
interface SubmitMasterData {
  companies: CompanyOption[];
  banks: string[];
  bank_rules: Record<string, number>;
  suppliers: string[];
  accounts_history: AccountHistoryEntry[];
}
const EMPTY_MASTER: SubmitMasterData = { companies: [], banks: [], bank_rules: {}, suppliers: [], accounts_history: [] };

const CREDIT_PRESETS = [15, 30, 45, 60, 90];
const ATTACHMENT_OPTIONS: { value: AttachmentType; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { value: 'ใบสำคัญจ่าย', icon: 'document-text-outline', color: '#0891b2' },
  { value: 'ใบกำกับภาษี 7%', icon: 'checkmark-circle-outline', color: '#059669' },
  { value: 'รอใบกำกับภาษี 7%', icon: 'time-outline', color: '#ef4444' },
  { value: 'ใบเสร็จรับเงิน', icon: 'receipt-outline', color: '#06b6d4' },
  { value: 'ชุดชำระเงิน', icon: 'wallet-outline', color: '#a855f7' },
];
const TAX_DEPTS: { key: TaxDept; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'wh', label: 'คลัง', icon: 'cube-outline', color: '#d97706' },
  { key: 'buyer', label: 'จัดซื้อ', icon: 'cart-outline', color: '#2563eb' },
  { key: 'acc', label: 'บัญชี', icon: 'calculator-outline', color: '#9333ea' },
];

function initialForm(): FormState {
  return {
    docType: 'PO',
    docNumber: '',
    companyId: '',
    jobSite: '',
    supplierName: '',
    description: '',
    amount: '',
    isCredit: false,
    creditTerm: '',
    accountName: '',
    bankAccount: '',
    bankName: '',
    attachmentSelect: '',
    taxRecvDept: '',
    taxInvoiceNumbers: [''],
    taxNote: '',
    taxFiles: [],
    existingTaxFiles: [],
    whtTax: 'ไม่มี',
    whtAmount: '',
  };
}

// ====================================================================
// Helpers
// ====================================================================

// แปลงข้อมูลดิบจาก get_detail (document_API_mobile.php — action จริง ยืนยันแล้ว) ให้เข้ารูป FormState
//
// 🐛 [แก้บั๊ก] เดิมไม่ดึงฝ่ายที่ลงรับ/เลขที่ใบกำกับ/ไฟล์ที่เคยแนบไว้แล้วมาเติมฟอร์มตอนแก้ไขเอกสาร
// เลยดูเหมือนไฟล์ที่แนบไว้ "หายไป" (แดชบอร์ดเอกสารเห็นว่าแนบแล้ว แต่หน้านี้ว่างเปล่า) และถ้ากด
// บันทึกโดยไม่แนบไฟล์ใหม่ backend จะเขียนทับคอลัมน์ไฟล์เป็นค่าว่าง ไฟล์เดิมหายจริงๆ — ต้องดึง
// ชื่อไฟล์เดิมมาเก็บไว้ใน existingTaxFiles แล้วส่งกลับไปเป็น existing_files[] ตอนบันทึกด้วยเสมอ
// (ดู confirmDeptReceive/apiReceiveTaxDept ใน document_dashboard.tsx ที่ทำแบบเดียวกันอยู่แล้ว)
function mapFormFromRaw(raw: any): Partial<FormState> {
  const attachments: string[] = Array.isArray(raw.attachments) ? raw.attachments : [];

  // แผนกไหนลงรับใบกำกับไปแล้ว (เช็คจากชื่อผู้รับ) — ใช้ตัวแรกที่เจอ (ปกติมีแค่แผนกเดียว ณ เวลาหนึ่ง)
  let taxRecvDept: TaxDept = '';
  let taxInvoiceNumbers: string[] = [''];
  let existingTaxFiles: string[] = [];
  let taxNote = '';
  if (raw.wh_tax_receiver) {
    taxRecvDept = 'wh';
    taxInvoiceNumbers = Array.isArray(raw.wh_tax_invoice_no) && raw.wh_tax_invoice_no.length ? raw.wh_tax_invoice_no : [''];
    existingTaxFiles = Array.isArray(raw.wh_tax_files) ? raw.wh_tax_files : [];
    taxNote = String(raw.wh_tax_note ?? '');
  } else if (raw.tax_receiver) {
    taxRecvDept = 'buyer';
    taxInvoiceNumbers = Array.isArray(raw.tax_invoice_no) && raw.tax_invoice_no.length ? raw.tax_invoice_no : [''];
    existingTaxFiles = Array.isArray(raw.tax_files) ? raw.tax_files : [];
    taxNote = String(raw.note_buyer ?? '');
  } else if (raw.acc_receiver) {
    taxRecvDept = 'acc';
    existingTaxFiles = Array.isArray(raw.acc_files) ? raw.acc_files : [];
    taxNote = String(raw.note_acc ?? '');
  }

  return {
    docType: (raw.doc_type || 'PO') as DocType,
    docNumber: String(raw.doc_number ?? ''),
    companyId: raw.company_id ? String(raw.company_id) : '',
    jobSite: String(raw.job_site ?? ''),
    supplierName: String(raw.supplier_name ?? ''),
    description: String(raw.description ?? ''),
    amount: raw.amount ? String(raw.amount) : '',
    isCredit: !!raw.credit_term && Number(raw.credit_term) > 0,
    creditTerm: raw.credit_term ? String(raw.credit_term) : '',
    accountName: String(raw.account_name ?? ''),
    bankAccount: String(raw.bank_account ?? ''),
    bankName: String(raw.bank_name ?? ''),
    attachmentSelect: (attachments[0] ?? '') as AttachmentType | '',
    taxRecvDept,
    taxInvoiceNumbers,
    taxNote,
    existingTaxFiles,
    whtTax: (raw.wht_tax || 'ไม่มี') as WhtRate,
    whtAmount: raw.wht_amount ? String(raw.wht_amount) : '',
  };
}

function toFloat(s: string): number {
  return parseFloat((s || '').replace(/,/g, '')) || 0;
}

// เทียบเท่า calculateWHT() ของต้นฉบับเป๊ะ — ยอดที่กรอกคือยอดหลังหัก คิดย้อนกลับหายอดเต็มก่อนหัก
function calcWht(netAmountStr: string, rate: WhtRate): number {
  if (rate === 'ไม่มี') return 0;
  const net = toFloat(netAmountStr);
  const r = parseFloat(rate.replace('%', '')) / 100;
  const gross = r < 1 ? net / (1 - r) : net;
  return gross - net;
}

// ====================================================================
// Small reusable pieces
// ====================================================================

function SectionHeader({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionHeaderIcon}>
        <Ionicons name={icon} size={13} color="#4f46e5" />
      </View>
      <Text style={styles.sectionHeaderText}>{text}</Text>
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

// ปุ่มกด-เปิดป๊อปอัพเลือกตัวเลือก — แทนที่ ChipPicker/CompanyPicker แบบเลื่อนแนวนอนเดิม
// (ตัวเลือกเยอะแล้วต้องเลื่อนหาเป็นแถวยาว เปลี่ยนเป็นกดแล้วเลือกจากลิสต์แทน)
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

async function pickTaxFile(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('แจ้งเตือน', 'กรุณาอนุญาตการเข้าถึงคลังรูป');
    return null;
  }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (r.canceled || !r.assets?.[0]) return null;
  const uri = r.assets[0].uri;
  const ext = (uri.split('.').pop() || 'jpg').toLowerCase();
  return { uri, name: `tax_${Date.now()}.${ext}`, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
}

// ====================================================================
// Main screen
// ====================================================================

export default function SubmitDocumentScreen({ docId, onBack, onSaved }: SubmitDocumentScreenProps) {
  const { user } = useAuth();
  const userId = (user as any)?.id;
  const currentUserLabel = user?.fullname || user?.username || '';

  const isEditMode = !!docId;
  const [form, setForm] = useState<FormState>(initialForm());
  const [master, setMaster] = useState<SubmitMasterData>(EMPTY_MASTER);
  const [loadingEdit, setLoadingEdit] = useState(isEditMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ป๊อปอัพเลือกตัวเลือกแบบใช้ร่วมกันทุกช่อง (บริษัท/ซัพพลายเออร์/ชื่อบัญชี/เลขบัญชี/ธนาคาร)
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
    if (!userId) return;
    apiMobileGet(DOCUMENT_API_URL, 'get_submit_master_data', { user_id: userId })
      .then((res) =>
        setMaster({
          companies: res.companies ?? [],
          banks: res.banks ?? [],
          bank_rules: res.bank_rules ?? {},
          suppliers: res.suppliers ?? [],
          accounts_history: res.accounts_history ?? [],
        })
      )
      .catch((e) => console.error('load get_submit_master_data failed', e));
  }, [userId]);

  useEffect(() => {
    if (!docId || !userId) return;
    let cancelled = false;
    (async () => {
      setLoadingEdit(true);
      setLoadError(null);
      try {
        const res = await apiMobileGet(DOCUMENT_API_URL, 'get_detail', { user_id: userId, doc_id: docId });
        if (cancelled || !res.detail) return;
        setForm((f) => ({ ...f, ...mapFormFromRaw(res.detail) }));
      } catch (e: any) {
        console.error('load get_detail failed', e);
        if (!cancelled) setLoadError(e?.message || 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, userId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const accountNameOptions = useMemo(() => Array.from(new Set(master.accounts_history.map((a) => a.account_name).filter(Boolean))), [master.accounts_history]);
  const bankAccountOptions = useMemo(() => Array.from(new Set(master.accounts_history.map((a) => a.bank_account).filter(Boolean))), [master.accounts_history]);

  const whtAmount = useMemo(() => calcWht(form.amount, form.whtTax), [form.amount, form.whtTax]);
  const grossTotal = toFloat(form.amount) + whtAmount;

  function handleBack() {
    if (onBack) return onBack();
    Alert.alert('ยกเลิก', 'กลับไปหน้ารายการเอกสาร');
  }

  function addTaxInvoiceRow() {
    setForm((f) => ({ ...f, taxInvoiceNumbers: [...f.taxInvoiceNumbers, ''] }));
  }
  function removeTaxInvoiceRow(idx: number) {
    setForm((f) => ({ ...f, taxInvoiceNumbers: f.taxInvoiceNumbers.filter((_, i) => i !== idx) }));
  }
  function updateTaxInvoiceRow(idx: number, value: string) {
    setForm((f) => ({ ...f, taxInvoiceNumbers: f.taxInvoiceNumbers.map((v, i) => (i === idx ? value : v)) }));
  }

  function handleSave() {
    if (!form.docNumber.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุเลขที่เอกสาร');
    if (!form.companyId) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกบริษัท (ผู้ซื้อ)');
    if (!form.jobSite.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุโครงการ/หน้างาน');
    if (!form.description.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุรายละเอียด/งวดงาน');
    if (toFloat(form.amount) <= 0) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุยอดจ่ายจริง');
    // ตรงกับ confirmSave() — เช็คซัพพลายเออร์กับเลขบัญชีก่อนอื่น
    if (!form.supplierName.trim()) return Alert.alert('กรุณาระบุชื่อร้านค้า', 'ต้องเลือกหรือพิมพ์ชื่อซัพพลายเออร์ก่อนบันทึก');
    if (!form.bankAccount.trim()) return Alert.alert('กรุณาระบุเลขบัญชี', 'ต้องเลือกหรือพิมพ์เลขที่บัญชีก่อนบันทึก');
    if (!form.bankName) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกธนาคาร');
    if (!form.attachmentSelect) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกประเภทเอกสารแนบ 1 รายการ');
    if (form.isCredit && !form.creditTerm.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุจำนวนวันเครดิต');
    // ตรงกับ taxAttachmentOk() — เลือก "ใบกำกับภาษี 7%" ต้องระบุฝ่ายที่รับ + มีเลขที่อย่างน้อย 1 รายการ
    if (form.attachmentSelect === 'ใบกำกับภาษี 7%') {
      if (!form.taxRecvDept) return Alert.alert('กรอกข้อมูลไม่ครบ', 'เลือก "ใบกำกับภาษี 7%" ต้องระบุฝ่ายที่ลงรับด้วย');
      if (!form.taxInvoiceNumbers.some((v) => v.trim())) return Alert.alert('กรอกข้อมูลไม่ครบ', 'ต้องระบุเลขที่ใบกำกับภาษีอย่างน้อย 1 รายการ');
    }

    Alert.alert('บันทึกข้อมูล?', 'ยืนยันบันทึกเอกสารนี้', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'บันทึก', onPress: () => void submitToBackend() },
    ]);
  }

  // action จริง ยืนยันแล้ว (document_API_mobile.php) — submit_doc สร้าง/แก้ไขเอกสารเท่านั้น
  // การลงรับใบกำกับภาษี 7% (ถ้าเลือกไว้) แยกยิงต่อด้วย receive_tax_warehouse/buyer/acc
  // ด้วย doc_id ที่ได้กลับมา (action เดียวกับปุ่มในแดชบอร์ดเอกสาร ทดสอบแล้วก่อนหน้านี้)
  async function submitToBackend() {
    if (!userId) return;
    setSaving(true);
    try {
      const res = await apiMobilePost(DOCUMENT_API_URL, 'submit_doc', {
        user_id: userId,
        ...(isEditMode && docId ? { edit_doc_id: docId } : {}),
        doc_type: form.docType,
        doc_number: form.docNumber,
        company_id: form.companyId,
        job_site: form.jobSite,
        ordered_by: currentUserLabel,
        supplier_name: form.supplierName,
        description: form.description,
        amount: form.amount,
        credit_term: form.isCredit ? form.creditTerm : '0',
        account_name: form.accountName,
        bank_account: form.bankAccount,
        bank_name: form.bankName,
        attachment_select: form.attachmentSelect,
        tax_recv_dept: form.attachmentSelect === 'ใบกำกับภาษี 7%' ? form.taxRecvDept : '',
        wht_tax: form.whtTax,
        wht_amount: String(whtAmount),
      });

      const newDocId = res.doc_id;

      // ลงรับใบกำกับภาษี 7% ต่อ ถ้าเลือกฝ่ายไว้ — ทำ "หลัง" สร้าง/แก้ไขเอกสารสำเร็จ เพราะต้องใช้ doc_id
      if (form.attachmentSelect === 'ใบกำกับภาษี 7%' && form.taxRecvDept && newDocId) {
        const taxAction = form.taxRecvDept === 'wh' ? 'receive_tax_warehouse' : form.taxRecvDept === 'buyer' ? 'receive_tax_buyer' : 'receive_tax_acc';
        const invField = form.taxRecvDept === 'wh' ? 'wh_tax_inv_number[]' : 'tax_inv_number[]';
        const noteField = form.taxRecvDept === 'wh' ? 'wh_action_note' : 'action_note';
        const fileField = form.taxRecvDept === 'wh' ? 'wh_tax_file_upload[]' : form.taxRecvDept === 'buyer' ? 'tax_file_upload[]' : 'acc_file_upload[]';
        const fdTax = new FormData();
        fdTax.append('action', taxAction);
        fdTax.append('user_id', String(userId));
        fdTax.append('doc_id', String(newDocId));
        form.taxInvoiceNumbers.filter((v) => v.trim()).forEach((v) => fdTax.append(invField, v.trim()));
        fdTax.append(noteField, form.taxNote);
        form.taxFiles.forEach((f) => fdTax.append(fileField, { uri: f.uri, name: f.name, type: f.type } as any));
        // ไฟล์ที่แผนกนี้เคยแนบไว้แล้ว (โหลดมาตอนแก้ไข) — ต้องส่งกลับไปด้วยเสมอ ไม่งั้น backend จะ
        // เขียนทับคอลัมน์ไฟล์เป็นค่าว่างเพราะไม่เห็นว่ามีไฟล์เดิมอยู่ (array_merge กับของใหม่ให้เอง)
        form.existingTaxFiles.forEach((name) => fdTax.append('existing_files[]', name));
        try {
          const taxRes = await axios.post(DOCUMENT_API_URL, fdTax, { headers: { 'Content-Type': 'multipart/form-data' } });
          if ((taxRes.data as any)?.status !== 'success') throw new Error((taxRes.data as any)?.message);
        } catch (taxErr: any) {
          // เอกสารหลักบันทึกสำเร็จไปแล้ว — แจ้งเตือนแยกว่าส่วนลงรับใบกำกับมีปัญหา ไม่ปนกับผลบันทึกหลัก
          Alert.alert('บันทึกเอกสารสำเร็จ แต่ลงรับใบกำกับไม่สำเร็จ', taxErr?.message || 'กรุณาลงรับใบกำกับอีกครั้งที่หน้าเอกสาร PO/AX');
          if (onSaved) onSaved();
          else handleBack();
          return;
        }
      }

      Alert.alert('บันทึกสำเร็จ', isEditMode ? 'แก้ไขเอกสารเรียบร้อย!' : 'ลงสมุดเสนอเอกสารเรียบร้อย!', [
        { text: 'ตกลง', onPress: () => (onSaved ? onSaved() : handleBack()) },
      ]);
    } catch (e: any) {
      console.error('submit_doc failed', e);
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  const showTaxReceiveBox = form.attachmentSelect === 'ใบกำกับภาษี 7%';

  if (loadingEdit) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={{ color: '#94a3b8', fontSize: 12.5 }}>กำลังโหลดข้อมูล...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 }}>
          <Ionicons name="alert-circle-outline" size={28} color="#ef4444" />
          <Text style={{ color: '#64748b', fontSize: 13, textAlign: 'center' }}>{loadError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.headerCard}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={18} color="#fff" />
            <Text style={styles.backBtnText}>กลับ</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name={isEditMode ? 'create-outline' : 'book-outline'} size={17} color="#fff" />
            <Text style={styles.headerTitle}>{isEditMode ? 'แก้ไขเอกสาร' : 'ลงสมุดเสนอเอกสาร'}</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            {isEditMode ? `กำลังแก้ไขรายการ: ${form.docNumber || docId}` : 'กรอกข้อมูล PO/AX เพื่อดำเนินการขออนุมัติและจ่ายเงิน'}
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <SectionHeader icon="document-text-outline" text="ข้อมูลเอกสาร" />

            <View style={styles.docTypeSwitch}>
              <TouchableOpacity style={[styles.docTypeBtn, form.docType === 'PO' && styles.docTypeBtnActive]} onPress={() => set('docType', 'PO')}>
                <Text style={[styles.docTypeBtnText, form.docType === 'PO' && styles.docTypeBtnTextActive]}>PO (ใบสั่งซื้อ)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.docTypeBtn, form.docType === 'AX' && styles.docTypeBtnActive]} onPress={() => set('docType', 'AX')}>
                <Text style={[styles.docTypeBtnText, form.docType === 'AX' && styles.docTypeBtnTextActive]}>AX (ค่าใช้จ่าย)</Text>
              </TouchableOpacity>
            </View>

            <FieldLabel text="เลขที่เอกสาร" required />
            <TextInput
              style={styles.input}
              placeholder="เช่น 2023-0001"
              placeholderTextColor="#94a3b8"
              value={form.docNumber}
              onChangeText={(v) => set('docNumber', v.replace(/[^0-9-]/g, ''))}
            />

            <FieldLabel text="บริษัท (ผู้ซื้อ)" required />
            <PickerTrigger
              label={master.companies.find((c) => String(c.id) === form.companyId)?.company_name ?? ''}
              placeholder="เลือกบริษัท..."
              onPress={() =>
                openPicker(
                  'เลือกบริษัท (ผู้ซื้อ)',
                  master.companies.map((c) => ({ value: String(c.id), label: c.company_name })),
                  form.companyId,
                  (v) => set('companyId', v)
                )
              }
            />

            <View style={styles.rowGap}>
              <View style={{ flex: 1 }}>
                <FieldLabel text="โครงการ / หน้างาน" required />
                <TextInput style={styles.input} placeholder="ระบุหน้างาน" placeholderTextColor="#94a3b8" value={form.jobSite} onChangeText={(v) => set('jobSite', v)} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel text="ผู้เปิดเอกสาร" />
                <View style={styles.readonlyInput}>
                  <Text style={styles.readonlyInputText}>{currentUserLabel}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <SectionHeader icon="cash-outline" text="รายละเอียดการจ่ายเงิน" />

            <FieldLabel text="ชื่อร้านค้า / Supplier" required />
            <PickerTrigger
              label={master.suppliers.includes(form.supplierName) ? form.supplierName : ''}
              placeholder="เลือกจากประวัติ..."
              onPress={() =>
                openPicker(
                  'เลือกชื่อร้านค้า / Supplier',
                  master.suppliers.map((s) => ({ value: s, label: s })),
                  form.supplierName,
                  (v) => set('supplierName', v)
                )
              }
            />
            <TextInput style={[styles.input, { marginTop: 6 }]} placeholder="หรือพิมพ์ชื่อร้านค้าใหม่..." placeholderTextColor="#94a3b8" value={form.supplierName} onChangeText={(v) => set('supplierName', v)} />

            <FieldLabel text="รายละเอียด / งวดงาน" required />
            <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุรายละเอียด..." placeholderTextColor="#94a3b8" multiline value={form.description} onChangeText={(v) => set('description', v)} />

            <FieldLabel text="ยอดจ่ายจริง (บาท)" required />
            <TextInput style={[styles.input, styles.amountInput]} placeholder="0.00" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={form.amount} onChangeText={(v) => set('amount', v)} />

            <TouchableOpacity style={styles.creditToggle} onPress={() => set('isCredit', !form.isCredit)}>
              <Ionicons name={form.isCredit ? 'checkbox' : 'square-outline'} size={18} color="#4f46e5" />
              <Text style={styles.creditToggleText}>ขอเครดิต (Credit Term)</Text>
            </TouchableOpacity>

            {form.isCredit && (
              <View style={styles.creditBox}>
                <FieldLabel text="เลือกวันมาตรฐาน (ตัวช่วย)" />
                <View style={styles.rowGap}>
                  {CREDIT_PRESETS.map((c) => (
                    <TouchableOpacity key={c} style={[styles.creditPreset, form.creditTerm === String(c) && styles.creditPresetActive]} onPress={() => set('creditTerm', String(c))}>
                      <Text style={[styles.creditPresetText, form.creditTerm === String(c) && styles.creditPresetTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <FieldLabel text="จำนวนวันเครดิต (พิมพ์เองได้)" required />
                <TextInput style={styles.input} placeholder="ระบุจำนวนวัน..." placeholderTextColor="#94a3b8" keyboardType="number-pad" value={form.creditTerm} onChangeText={(v) => set('creditTerm', v)} />
              </View>
            )}
          </View>

          <View style={styles.card}>
            <SectionHeader icon="business-outline" text="บัญชีปลายทาง" />

            <FieldLabel text="ชื่อบัญชี (ค้นหาจากชื่อคนรับเงิน)" required />
            <PickerTrigger
              label={accountNameOptions.includes(form.accountName) ? form.accountName : ''}
              placeholder="เลือกจากประวัติ..."
              onPress={() =>
                openPicker(
                  'เลือกชื่อบัญชี',
                  accountNameOptions.map((s) => ({ value: s, label: s })),
                  form.accountName,
                  (v) => {
                    const match = master.accounts_history.find((a) => a.account_name === v);
                    setForm((f) => ({ ...f, accountName: v, bankAccount: match?.bank_account ?? f.bankAccount, bankName: match?.bank_name ?? f.bankName }));
                  }
                )
              }
            />
            <TextInput style={[styles.input, { marginTop: 6 }]} placeholder="หรือพิมพ์ชื่อบัญชีใหม่..." placeholderTextColor="#94a3b8" value={form.accountName} onChangeText={(v) => set('accountName', v)} />

            <FieldLabel text="เลขที่บัญชี" required />
            <PickerTrigger
              label={bankAccountOptions.includes(form.bankAccount) ? form.bankAccount : ''}
              placeholder="เลือกจากประวัติ..."
              onPress={() =>
                openPicker(
                  'เลือกเลขที่บัญชี',
                  bankAccountOptions.map((s) => ({ value: s, label: s })),
                  form.bankAccount,
                  (v) => {
                    const match = master.accounts_history.find((a) => a.bank_account === v);
                    setForm((f) => ({ ...f, bankAccount: v, accountName: match?.account_name ?? f.accountName, bankName: match?.bank_name ?? f.bankName }));
                  }
                )
              }
            />
            <TextInput style={[styles.input, { marginTop: 6 }]} placeholder="หรือพิมพ์เลขบัญชีใหม่..." placeholderTextColor="#94a3b8" value={form.bankAccount} onChangeText={(v) => set('bankAccount', v)} />

            <FieldLabel text="ธนาคาร" required />
            <PickerTrigger
              label={master.banks.includes(form.bankName) ? form.bankName : ''}
              placeholder="เลือกธนาคาร..."
              onPress={() =>
                openPicker(
                  'เลือกธนาคาร',
                  master.banks.map((s) => ({ value: s, label: s })),
                  form.bankName,
                  (v) => set('bankName', v)
                )
              }
            />
          </View>

          <View style={styles.card}>
            <SectionHeader icon="attach-outline" text="เอกสารแนบ" />
            <FieldLabel text="เลือกประเภทเอกสารแนบ (1 รายการ)" required />
            <View style={styles.attachmentGrid}>
              {ATTACHMENT_OPTIONS.map((opt) => {
                const active = form.attachmentSelect === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.attachmentCard, active && { borderColor: opt.color, backgroundColor: opt.color + '12' }]}
                    onPress={() => set('attachmentSelect', opt.value)}
                  >
                    <Ionicons name={opt.icon} size={18} color={active ? opt.color : '#94a3b8'} />
                    <Text style={[styles.attachmentCardText, active && { color: opt.color }]}>{opt.value}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {showTaxReceiveBox && (
              <View style={styles.taxReceiveBox}>
                <Text style={styles.taxReceiveTitle}>
                  <Ionicons name="download-outline" size={13} color="#059669" /> ใบกำกับที่แนบมา ลงรับโดยฝ่ายไหน
                </Text>
                <Text style={styles.taxReceiveHint}>เลือกได้ฝ่ายเดียว และต้องระบุเลขที่ใบกำกับอย่างน้อย 1 รายการ ถึงจะบันทึกเอกสารได้</Text>

                <View style={styles.rowGap}>
                  {TAX_DEPTS.map((d) => {
                    const active = form.taxRecvDept === d.key;
                    return (
                      <TouchableOpacity key={d.key} style={[styles.deptCard, active && { borderColor: d.color, backgroundColor: d.color + '12' }]} onPress={() => set('taxRecvDept', d.key)}>
                        <Ionicons name={d.icon} size={16} color={active ? d.color : '#94a3b8'} />
                        <Text style={[styles.deptCardText, active && { color: d.color }]}>{d.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <FieldLabel text="เลขที่ใบกำกับภาษี" required />
                {form.taxInvoiceNumbers.map((v, idx) => (
                  <View key={idx} style={styles.taxInvRow}>
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={v} onChangeText={(t) => updateTaxInvoiceRow(idx, t)} />
                    {form.taxInvoiceNumbers.length > 1 && (
                      <TouchableOpacity onPress={() => removeTaxInvoiceRow(idx)} style={styles.taxInvRemoveBtn}>
                        <Ionicons name="close" size={14} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity style={styles.addTaxInvBtn} onPress={addTaxInvoiceRow}>
                  <Ionicons name="add" size={13} color="#059669" />
                  <Text style={styles.addTaxInvBtnText}>เพิ่มเลขที่และไฟล์ใบกำกับ</Text>
                </TouchableOpacity>

                {form.existingTaxFiles.length > 0 && (
                  <>
                    <FieldLabel text="ไฟล์ที่แนบไว้แล้ว" />
                    <View style={styles.taxFileChipsRow}>
                      {form.existingTaxFiles.map((name, i) => (
                        <TouchableOpacity
                          key={i}
                          style={[styles.taxFileChip, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}
                          onPress={() => Linking.openURL(`${API_BASE}/uploads/${name}`)}
                        >
                          <Ionicons name="checkmark-circle-outline" size={11} color="#059669" />
                          <Text style={[styles.taxFileChipText, { color: '#059669' }]} numberOfLines={1}>
                            ไฟล์ {i + 1}
                          </Text>
                          <TouchableOpacity
                            onPress={() => setForm((s) => ({ ...s, existingTaxFiles: s.existingTaxFiles.filter((_, idx) => idx !== i) }))}
                          >
                            <Ionicons name="close" size={12} color="#ef4444" />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={styles.attachFileBtn}
                  onPress={async () => {
                    const f = await pickTaxFile();
                    if (f) setForm((s) => ({ ...s, taxFiles: [...s.taxFiles, f] }));
                  }}
                >
                  <Ionicons name="attach-outline" size={13} color="#64748b" />
                  <Text style={styles.attachFileBtnText}>แนบไฟล์ใบกำกับเพิ่มเติม ({form.taxFiles.length})</Text>
                </TouchableOpacity>
                {form.taxFiles.length > 0 && (
                  <View style={styles.taxFileChipsRow}>
                    {form.taxFiles.map((f, i) => (
                      <View key={i} style={styles.taxFileChip}>
                        <Ionicons name="document-attach-outline" size={11} color="#475569" />
                        <Text style={styles.taxFileChipText} numberOfLines={1}>
                          {f.name}
                        </Text>
                        <TouchableOpacity onPress={() => setForm((s) => ({ ...s, taxFiles: s.taxFiles.filter((_, idx) => idx !== i) }))}>
                          <Ionicons name="close" size={12} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <FieldLabel text="หมายเหตุ (ถ้ามี)" />
                <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุหมายเหตุ..." placeholderTextColor="#94a3b8" multiline value={form.taxNote} onChangeText={(v) => set('taxNote', v)} />

                <FieldLabel text="ผู้ลงรับ" />
                <View style={styles.readonlyInput}>
                  <Text style={styles.readonlyInputText}>{currentUserLabel}</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <SectionHeader icon="calculator-outline" text="หัก ณ ที่จ่าย (WHT)" />
            <View style={styles.whtRow}>
              {(['ไม่มี', '1%', '2%', '3%', '5%'] as WhtRate[]).map((r) => (
                <TouchableOpacity key={r} style={[styles.whtChip, form.whtTax === r && styles.whtChipActive]} onPress={() => set('whtTax', r)}>
                  <Text style={[styles.whtChipText, form.whtTax === r && styles.whtChipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.whtTax !== 'ไม่มี' && (
              <View style={styles.whtDetailBox}>
                <View style={styles.whtAmountRow}>
                  <Text style={styles.whtAmountLabel}>ยอดหัก:</Text>
                  <Text style={styles.whtAmountValue}>{whtAmount.toFixed(2)} บาท</Text>
                </View>
                <View style={styles.divider} />
                <Text style={styles.whtSummaryLine}>
                  ยอดจ่ายจริง <Text style={styles.whtSummaryStrong}>{toFloat(form.amount).toFixed(2)}</Text> + หัก ณ ที่จ่าย{' '}
                  <Text style={[styles.whtSummaryStrong, { color: '#ef4444' }]}>{whtAmount.toFixed(2)}</Text>
                </Text>
                <View style={styles.whtGrossRow}>
                  <Text style={styles.whtGrossLabel}>ยอดเต็มก่อนหัก</Text>
                  <Text style={styles.whtGrossValue}>{grossTotal.toFixed(2)} บาท</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleBack}>
              <Ionicons name="close" size={16} color="#475569" />
              <Text style={styles.cancelBtnText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={17} color="#fff" />}
              <Text style={styles.saveBtnText}>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>

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
                    {active && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
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
    </>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7fb' },

  headerCard: { backgroundColor: '#4f46e5', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 10 },
  backBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, marginTop: 6 },

  body: { padding: 14 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 14 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionHeaderIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  sectionHeaderText: { fontSize: 13, fontWeight: '800', color: '#334155' },

  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 10 },
  required: { color: '#ef4444' },

  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#0f172a', backgroundColor: '#fff' },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
  amountInput: { fontSize: 17, fontWeight: '800', color: '#4f46e5' },
  rowGap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  readonlyInput: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  readonlyInputText: { fontSize: 13, color: '#64748b', fontWeight: '700' },

  pickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  pickerTriggerText: { fontSize: 13, color: '#0f172a', fontWeight: '600', flexShrink: 1 },
  pickerTriggerPlaceholder: { color: '#94a3b8', fontWeight: '400' },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  pickerModalSheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  pickerModalTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  pickerModalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  pickerModalOptionActive: { backgroundColor: '#eef2ff' },
  pickerModalOptionText: { fontSize: 12.5, fontWeight: '700', color: '#334155', flexShrink: 1 },
  pickerModalCloseBtn: { marginTop: 8, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 },
  pickerModalCloseBtnText: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },
  pickerModalEmptyText: { fontSize: 12, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },

  docTypeSwitch: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  docTypeBtn: { flex: 1, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  docTypeBtnActive: { backgroundColor: '#eef2ff', borderColor: '#4f46e5' },
  docTypeBtnText: { fontSize: 12.5, fontWeight: '700', color: '#64748b' },
  docTypeBtnTextActive: { color: '#4f46e5' },

  creditToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#eef2ff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12, alignSelf: 'flex-start' },
  creditToggleText: { fontSize: 12.5, fontWeight: '700', color: '#4f46e5' },
  creditBox: { backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderStyle: 'dashed', borderRadius: 14, padding: 14, marginTop: 12 },
  creditPreset: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  creditPresetActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  creditPresetText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  creditPresetTextActive: { color: '#fff' },

  attachmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attachmentCard: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 10 },
  attachmentCardText: { fontSize: 11, fontWeight: '700', color: '#64748b', flexShrink: 1 },

  taxReceiveBox: { backgroundColor: '#f0fdf4', borderWidth: 1.5, borderColor: '#a7f3d0', borderStyle: 'dashed', borderRadius: 14, padding: 14, marginTop: 14 },
  taxReceiveTitle: { fontSize: 12.5, fontWeight: '800', color: '#047857', marginBottom: 4 },
  taxReceiveHint: { fontSize: 10.5, color: '#64748b', marginBottom: 10 },

  deptCard: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingVertical: 10, backgroundColor: '#fff' },
  deptCardText: { fontSize: 11.5, fontWeight: '700', color: '#64748b' },

  taxInvRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  taxInvRemoveBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  addTaxInvBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 4 },
  addTaxInvBtnText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  attachFileBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start' },
  attachFileBtnText: { fontSize: 10.5, color: '#64748b', fontWeight: '600' },
  taxFileChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  taxFileChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 5, maxWidth: 160 },
  taxFileChipText: { fontSize: 10, color: '#475569', fontWeight: '600', flexShrink: 1 },

  whtRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  whtChip: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff' },
  whtChipActive: { backgroundColor: '#eef2ff', borderColor: '#4f46e5' },
  whtChipText: { fontSize: 12.5, fontWeight: '700', color: '#64748b' },
  whtChipTextActive: { color: '#4f46e5' },

  whtDetailBox: { backgroundColor: '#f8fafc', borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, marginTop: 14 },
  whtAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  whtAmountLabel: { fontSize: 13, fontWeight: '700', color: '#334155' },
  whtAmountValue: { fontSize: 15, fontWeight: '900', color: '#ef4444' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 10 },
  whtSummaryLine: { fontSize: 11.5, color: '#64748b' },
  whtSummaryStrong: { fontWeight: '800', color: '#0f172a' },
  whtGrossRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  whtGrossLabel: { fontSize: 13, fontWeight: '700', color: '#334155' },
  whtGrossValue: { fontSize: 18, fontWeight: '900', color: '#10b981' },

  footerRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 15 },
  cancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 14 },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 15 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});