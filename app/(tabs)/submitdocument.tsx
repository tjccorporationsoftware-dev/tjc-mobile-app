/**
 * SubmitDocumentScreen.tsx
 * ------------------------------------------------------------------
 * หน้า SubmitDocument.php ฉบับมือถือ — ใช้ทั้ง "ลงสมุดเสนอเอกสาร" (สร้างใหม่) และ
 * "แก้ไขเอกสาร" (มี docId) เหมือนต้นฉบับที่เป็นไฟล์เดียวกันสลับโหมดด้วย $is_edit_mode
 * เชื่อมจากปุ่ม "แก้ไข" ในการ์ดเอกสารของ DocumentDashboardScreen
 *
 * API (document_API_mobile.php — SubmitDocument.php เว็บถูกบังคับ session ผ่าน auth.php ยิงตรงไม่ได้):
 *   get_submit_master_data — บริษัท/ธนาคาร(+เกณฑ์จำนวนหลัก)/ซัพพลายเออร์/ประวัติบัญชีจริง
 *   get_detail             — ข้อมูลเดิมตอนแก้ไข (+ ผู้แก้ไขใบกำกับล่าสุด + ยอดแยก VAT ที่ยังใช้ได้)
 *   submit_doc             — สร้างใหม่/แก้ไข (auto-add supplier/bank_accounts, diff log, auto-resolve
 *                            คำขอแก้ไข, สถานะ "ใบกำกับ 7%" ให้บัญชีเป็นคนปิด — กติกาเดียวกับเว็บ)
 *   receive_tax_warehouse/_buyer/_acc + from_submit=1 — ลงรับใบกำกับ 7% ต่อด้วย doc_id ที่ได้
 *     เรียกเฉพาะตอนฝ่ายนั้นลงรับครั้งแรก หรือเลขที่/ไฟล์/หมายเหตุเปลี่ยนจริง (save_tax_receive() ของเว็บ:
 *     คงชื่อ/เวลาผู้ลงรับคนแรก · หมายเหตุใน doc_note เขียนทับบรรทัดเดิม · log tax_receive)
 *
 * กติกาที่ยกมาจากเว็บ:
 *  - doc_type PO/AX เท่านั้น — เอกสาร AC (เคลียร์เงินทดรอง หลายกล่องร้านค้า) แก้ได้ที่หน้าเว็บเท่านั้น
 *  - ผู้เปิดเอกสาร: สร้างใหม่ = ผู้ใช้ปัจจุบัน (เซิร์ฟเวอร์ใช้ชื่อจาก user_id) · แก้ไข = ordered_by เดิม
 *  - หัก ณ ที่จ่าย: ช่องยอดหักแก้เองได้ เปิดมาเป็นยอดเดิม คำนวณใหม่เฉพาะตอนเปลี่ยนยอดเงิน/อัตรา (calculateWHT())
 *      ยอดจ่ายจริง → ยอดเต็ม = ยอดจ่ายจริง / (1 - เรต), ยอดหัก = ยอดเต็ม - ยอดจ่ายจริง
 *      เอกสารที่เว็บกรอกแบบราคาก่อน/รวม VAT (ผู้ใช้ยังไม่พิมพ์ยอดเอง) → ยอดหัก = ยอดก่อน VAT × เรต และ
 *      ยอดจ่ายจริง = รวม VAT − ยอดหัก (updateNetTotal()) ยอดในตารางจึงยังตรงกับ VAT เดิม
 *  - "ใบกำกับภาษี 7%": เลือกฝ่ายที่ลงรับ 1 ฝ่าย + ไฟล์อย่างน้อย 1 ไฟล์ (เลขที่ไม่บังคับ — taxAttachmentOk())
 *      ข้อมูลเดิมของแต่ละฝ่ายผูกกับฝ่ายนั้น เปลี่ยนฝ่ายแล้วของฝ่ายเก่าไม่ถูกส่งไป (toggleTaxDeptPanel())
 *      คลัง/จัดซื้อลงรับ = สถานะยังเป็น "รอใบกำกับ 7%" จนกว่าบัญชีจะลงรับ
 *  - เลขบัญชีต้องมีจำนวนหลักตาม bank_masters.digit_limit ไม่นับขีด (confirmSave())
 *
 * ที่ปรับให้เหมาะกับมือถือ:
 *  - แนบไฟล์ใบกำกับจากคลังรูป (expo-image-picker) แทน input file / วางรูป
 *  - select2 แบบพิมพ์ค้นหา/เพิ่มค่าใหม่ → ป๊อปอัพมีช่องค้นหา + ช่องพิมพ์ค่าใหม่ใต้ปุ่มเลือก
 *  - ไม่มีช่อง "ยอดที่กรอกคือ..." (VAT) — ยอดที่กรอกในแอปคือยอดจ่ายจริงเสมอ
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../_layout';
import { formatShortThaiDateTime } from '../../components/DateTimeField';
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
type RecvDept = 'wh' | 'buyer' | 'acc';
type TaxDept = '' | RecvDept;

// แถวเลขที่ใบกำกับ — dept = ฝ่ายเจ้าของเลขที่เดิมที่โหลดมา ('' = แถวที่เพิ่มในหน้านี้ ใช้กับฝ่ายที่เลือกตอนบันทึก)
// เหมือน data-dept ของแถวไฟล์เดิมในเว็บ: เลือกฝ่ายอื่นแล้วแถวเดิมของฝ่ายเก่าถูกซ่อนและไม่ถูกส่งไป
interface TaxInvRow {
  value: string;
  dept: TaxDept;
}
// ไฟล์ใบกำกับที่แนบไว้แล้วของแต่ละฝ่าย (ชื่อไฟล์ในราก uploads/) — ส่งกลับเป็น existing_files[] เฉพาะของฝ่ายที่เลือก
interface ExistingTaxFile {
  name: string;
  dept: RecvDept;
}

interface FormState {
  docType: DocType;
  docNumber: string;
  companyId: string;
  jobSite: string;
  supplierName: string;
  description: string;
  amount: string;
  // ผู้ใช้พิมพ์ช่องยอดจ่ายจริงเองแล้ว — เอกสาร VAT จากเว็บจะเลิกผูกยอดกับ "รวม VAT − หัก ณ ที่จ่าย"
  amountEdited: boolean;
  isCredit: boolean;
  creditTerm: string;
  accountName: string;
  bankAccount: string;
  bankName: string;
  attachmentSelect: AttachmentType | '';
  taxRecvDept: TaxDept;
  taxInvRows: TaxInvRow[];
  // หมายเหตุใบกำกับ — ยังไม่แตะ = โชว์หมายเหตุเดิมของฝ่ายที่เลือก · พิมพ์แล้ว = ใช้ข้อความที่พิมพ์กับฝ่ายที่เลือก
  taxNote: string;
  taxNoteEdited: boolean;
  taxFiles: PickedFile[];
  existingTaxFiles: ExistingTaxFile[];
  whtTax: WhtRate;
  whtAmount: string;
}

// ข้อมูลลงรับใบกำกับที่บันทึกไว้แล้วของ 1 ฝ่าย (มีชื่อผู้รับ = ฝ่ายนั้นลงรับแล้ว แบบที่เว็บเช็ค)
interface TaxDeptSaved {
  receiver: string;
  invoiceNumbers: string[];
  files: string[];
  note: string;
}

// ยอดแยก VAT จาก get_detail (docVatBreakdown ใน helpers/doc_vat.php) — null = ยอดจ่ายจริงแบบเดิม
interface VatBreakdown {
  mode: 'base' | 'gross';
  base: number;
  vat: number;
  gross: number;
}

// ค่าของเอกสารเดิม (โหมดแก้ไข) — ไม่ใช่ช่องกรอก ใช้โชว์ข้อมูลเดิม + เทียบว่าผู้ใช้เปลี่ยนอะไรจริงไหม
interface LoadedDoc {
  isAc: boolean;
  orderedBy: string;
  whtTax: WhtRate;
  vat: VatBreakdown | null;
  taxSaved: Partial<Record<RecvDept, TaxDeptSaved>>;
  accReceived: boolean;
  taxEditor: string;
  taxEditedAt: string;
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
const TAX_DEPTS: { key: RecvDept; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'wh', label: 'คลัง', icon: 'cube-outline', color: '#d97706' },
  { key: 'buyer', label: 'จัดซื้อ', icon: 'cart-outline', color: '#2563eb' },
  { key: 'acc', label: 'บัญชี', icon: 'calculator-outline', color: '#9333ea' },
];
// คีย์ใน get_detail ของแต่ละฝ่าย — ชุดเดียวกับ $tax_dept_cards (SubmitDocument.php:2182-2186)
// จัดซื้อกับบัญชีใช้ช่องเลขที่ tax_invoice_no ร่วมกัน (บัญชีไม่มีช่องเลขที่ของตัวเอง)
const TAX_DEPT_KEYS: Record<RecvDept, { recv: string; inv: string; files: string; note: string }> = {
  wh: { recv: 'wh_tax_receiver', inv: 'wh_tax_invoice_no', files: 'wh_tax_files', note: 'wh_tax_note' },
  buyer: { recv: 'tax_receiver', inv: 'tax_invoice_no', files: 'tax_files', note: 'note_buyer' },
  acc: { recv: 'acc_receiver', inv: 'tax_invoice_no', files: 'acc_files', note: 'note_acc' },
};
const WHT_RATES: WhtRate[] = ['ไม่มี', '1%', '2%', '3%', '5%'];
// ตัวเลือกเกินเท่านี้ค่อยโชว์ช่องค้นหาในป๊อปอัพ (ซัพพลายเออร์/บัญชีมีหลักพันรายการ บริษัทมีไม่กี่ตัว)
const PICKER_SEARCH_MIN = 10;

function initialForm(): FormState {
  return {
    docType: 'PO',
    docNumber: '',
    companyId: '',
    jobSite: '',
    supplierName: '',
    description: '',
    amount: '',
    amountEdited: false,
    isCredit: false,
    creditTerm: '',
    accountName: '',
    bankAccount: '',
    bankName: '',
    attachmentSelect: '',
    taxRecvDept: '',
    taxInvRows: [],
    taxNote: '',
    taxNoteEdited: false,
    taxFiles: [],
    existingTaxFiles: [],
    whtTax: 'ไม่มี',
    whtAmount: '',
  };
}

// ====================================================================
// Helpers
// ====================================================================

function strList(v: any): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

// แปลงข้อมูลดิบจาก get_detail ให้เข้ารูป FormState + เก็บค่าเดิมไว้เทียบ (LoadedDoc)
//  - ฝ่ายที่ลงรับใบกำกับแล้ว (มีชื่อผู้รับ) โหลดเลขที่/ไฟล์/หมายเหตุของ "ฝ่ายนั้น" แยกกัน — บัญชีอ่านเลขที่จาก
//    tax_invoice_no แบบเว็บ (:2185, :2202) · ฝ่ายที่ติ๊กไว้ตอนเปิด = ฝ่ายแรกที่ลงรับแล้ว คลัง → จัดซื้อ → บัญชี
//  - ไฟล์เดิมต้องส่งกลับเป็น existing_files[] ตอนบันทึก ไม่งั้นไฟล์ที่แนบไว้จะหลุดออกจากรายการ
function mapFormFromRaw(raw: any): { form: Partial<FormState>; loaded: LoadedDoc } {
  const attachments = strList(raw.attachments);

  const taxSaved: Partial<Record<RecvDept, TaxDeptSaved>> = {};
  const taxInvRows: TaxInvRow[] = [];
  const existingTaxFiles: ExistingTaxFile[] = [];
  TAX_DEPTS.forEach(({ key }) => {
    const k = TAX_DEPT_KEYS[key];
    const receiver = String(raw[k.recv] ?? '');
    if (!receiver) return;
    const saved: TaxDeptSaved = { receiver, invoiceNumbers: strList(raw[k.inv]), files: strList(raw[k.files]), note: String(raw[k.note] ?? '') };
    taxSaved[key] = saved;
    saved.invoiceNumbers.forEach((value) => taxInvRows.push({ value, dept: key }));
    saved.files.forEach((name) => existingTaxFiles.push({ name, dept: key }));
  });
  const firstDept: TaxDept = TAX_DEPTS.find(({ key }) => taxSaved[key])?.key ?? '';
  // ฝ่ายที่ติ๊กไว้ยังไม่มีเลขที่เดิม → เปิดช่องว่างให้ 1 แถว (เว็บเพิ่มแถวแรกให้เองใน toggleTaxDeptPanel())
  if (firstDept && !taxInvRows.some((r) => r.dept === firstDept)) taxInvRows.push({ value: '', dept: '' });

  const whtTax = (WHT_RATES as string[]).includes(raw.wht_tax) ? (raw.wht_tax as WhtRate) : 'ไม่มี';
  const whtStored = Number(raw.wht_amount) || 0;
  const vb = raw.vat_breakdown;
  const vat: VatBreakdown | null =
    vb && (vb.mode === 'base' || vb.mode === 'gross') ? { mode: vb.mode, base: Number(vb.base) || 0, vat: Number(vb.vat) || 0, gross: Number(vb.gross) || 0 } : null;

  return {
    form: {
      docType: raw.doc_type === 'AX' ? 'AX' : 'PO',
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
      // "รอใบกำกับภาษี 7%" = การ์ด "รอใบกำกับ 7%" + ซ่อนกล่องลงรับ แบบฟอร์มแก้ไขของเว็บ (กดการ์ด "ใบกำกับ 7%" ถึงจะโผล่)
      attachmentSelect: (ATTACHMENT_OPTIONS.some((o) => o.value === attachments[0]) ? attachments[0] : '') as AttachmentType | '',
      taxRecvDept: firstDept,
      taxInvRows,
      existingTaxFiles,
      whtTax,
      // ยอดหักที่บันทึกไว้ (เว็บโชว์ค่าเดิมในช่องให้แก้ได้ :2341-2343) — ไม่คำนวณใหม่ตอนเปิด
      whtAmount: whtTax !== 'ไม่มี' && whtStored > 0 ? whtStored.toFixed(2) : '',
    },
    loaded: {
      isAc: raw.doc_type === 'AC',
      orderedBy: String(raw.ordered_by ?? ''),
      whtTax,
      vat,
      taxSaved,
      accReceived: !!raw.acc_receiver,
      taxEditor: String(raw.tax_recv_editor ?? ''),
      taxEditedAt: String(raw.tax_recv_edited_at ?? ''),
    },
  };
}

function toFloat(s: string): number {
  return parseFloat((s || '').replace(/,/g, '')) || 0;
}

// ปัด 2 ตำแหน่งแบบเดียวกับ round2() ของเว็บ
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// เลขที่ใบกำกับที่จะส่ง — ตัดช่องว่าง/ค่าว่าง/ตัวซ้ำ แบบเดียวกับที่เซิร์ฟเวอร์เก็บ (doc_encode_list)
function uniqTrim(list: string[]): string[] {
  const out: string[] = [];
  list.forEach((v) => {
    const t = v.trim();
    if (t && !out.includes(t)) out.push(t);
  });
  return out;
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ยอดหัก ณ ที่จ่ายคำนวณใหม่ — calculateWHT() ของ SubmitDocument.php:2562-2577
//   ยอดจ่ายจริง (แบบเดิม) = ยอดหลังหัก → ยอดเต็ม = ยอดจ่ายจริง / (1 - เรต), ยอดหัก = ยอดเต็ม - ยอดจ่ายจริง
//   ราคาก่อน/รวม VAT (vatBase = ยอดก่อน VAT ที่ยังใช้ได้) → ยอดก่อน VAT × เรต
function calcWht(netAmountStr: string, rate: WhtRate, vatBase: number | null): string {
  if (rate === 'ไม่มี') return '';
  const r = parseFloat(rate.replace('%', '')) / 100;
  if (vatBase !== null) return (vatBase * r).toFixed(2);
  const net = toFloat(netAmountStr);
  const gross = r < 1 ? net / (1 - r) : net;
  return (gross - net).toFixed(2);
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

// ตัวเลือกในป๊อปอัพ — sub = บรรทัดรอง (เลขบัญชี: ชื่อบัญชี + ธนาคาร แบบ formatAccountOption() ของเว็บ)
interface PickerOption {
  value: string;
  label: string;
  sub?: string;
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

// หน้าแจ้งแทนฟอร์ม (โหลดไม่สำเร็จ / เอกสาร AC) — มีปุ่มกลับ ไม่ให้ค้างอยู่หน้านี้
function NoticeScreen({ icon, color, title, text, onBack }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; text?: string; onBack: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.noticeWrap}>
        <Ionicons name={icon} size={30} color={color} />
        <Text style={styles.noticeTitle}>{title}</Text>
        {!!text && <Text style={styles.noticeText}>{text}</Text>}
        <TouchableOpacity style={styles.noticeBackBtn} onPress={onBack}>
          <Ionicons name="chevron-back" size={16} color="#fff" />
          <Text style={styles.noticeBackBtnText}>กลับ</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
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
  // ค่าของเอกสารเดิม (โหมดแก้ไข) — สร้างใหม่ = null
  const [loaded, setLoaded] = useState<LoadedDoc | null>(null);
  const [master, setMaster] = useState<SubmitMasterData>(EMPTY_MASTER);
  const [loadingEdit, setLoadingEdit] = useState(isEditMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ป๊อปอัพเลือกตัวเลือกแบบใช้ร่วมกันทุกช่อง (บริษัท/ซัพพลายเออร์/ชื่อบัญชี/เลขบัญชี/ธนาคาร)
  // ซัพพลายเออร์ ~3,600 / บัญชี ~1,700 รายการ → มีช่องค้นหา + FlatList วาดเฉพาะแถวที่เห็น
  const [pickerModal, setPickerModal] = useState<{
    visible: boolean;
    title: string;
    options: PickerOption[];
    current: string;
    onSelect: (v: string) => void;
  }>({ visible: false, title: '', options: [], current: '', onSelect: () => {} });
  const [pickerSearch, setPickerSearch] = useState('');
  function openPicker(title: string, options: PickerOption[], current: string, onSelect: (v: string) => void) {
    setPickerSearch('');
    setPickerModal({ visible: true, title, options, current, onSelect });
  }
  function closePicker() {
    setPickerModal((s) => ({ ...s, visible: false }));
  }
  const pickerShownOptions = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return pickerModal.options;
    return pickerModal.options.filter((o) => o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q));
  }, [pickerModal.options, pickerSearch]);

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
        const mapped = mapFormFromRaw(res.detail);
        setForm((f) => ({ ...f, ...mapped.form }));
        setLoaded(mapped.loaded);
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
  // เลขบัญชี + บรรทัดรอง "ชื่อบัญชี (ธนาคาร)" แบบ formatAccountOption() ของเว็บ — พิมพ์ค้นหาด้วยชื่อคนรับเงินได้ด้วย
  const bankAccountOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: PickerOption[] = [];
    master.accounts_history.forEach((a) => {
      if (!a.bank_account || seen.has(a.bank_account)) return;
      seen.add(a.bank_account);
      out.push({ value: a.bank_account, label: a.bank_account, sub: [a.account_name, a.bank_name ? `(${a.bank_name})` : ''].filter(Boolean).join(' ') });
    });
    return out;
  }, [master.accounts_history]);

  // ---------------- หัก ณ ที่จ่าย ----------------
  // เอกสารที่เว็บกรอกแบบราคาก่อน/รวม VAT (ยอดแยก VAT ยังใช้ได้) และผู้ใช้ยังไม่พิมพ์ยอดจ่ายจริงเอง = ยังผูกกับ VAT:
  //   ยอดหัก = ยอดก่อน VAT × เรต · ยอดจ่ายจริง = รวม VAT − ยอดหัก (updateNetTotal() ของเว็บ / เซิร์ฟเวอร์เว็บเก็บ amount แบบนี้)
  //   ยอดในตารางจึงยังตรงกับ VAT เดิม เว็บเปิดแล้วยังเป็นโหมดราคาก่อน/รวม VAT · พิมพ์ยอดเองแล้ว = คิดแบบยอดจ่ายจริง
  function vatLinkOf(f: FormState): VatBreakdown | null {
    return loaded?.vat && !f.amountEdited ? loaded.vat : null;
  }
  // calculateWHT() ของเว็บทำงานเฉพาะตอนพิมพ์ยอดเงิน / เปลี่ยนอัตรา — เปิดเอกสารแล้วกดบันทึกเฉยๆ ยอดหักเดิมต้องไม่เปลี่ยน
  function onAmountChange(v: string) {
    setForm((f) => ({ ...f, amount: v, amountEdited: true, whtAmount: f.whtTax === 'ไม่มี' ? f.whtAmount : calcWht(v, f.whtTax, null) }));
  }
  function onWhtRateChange(rate: WhtRate) {
    setForm((f) => {
      if (f.whtTax === rate) return f;
      const vat = vatLinkOf(f);
      const whtAmount = calcWht(f.amount, rate, vat ? vat.base : null);
      return { ...f, whtTax: rate, whtAmount, ...(vat ? { amount: round2(vat.gross - toFloat(whtAmount)).toFixed(2) } : {}) };
    });
  }
  function onWhtAmountChange(v: string) {
    const whtAmount = v.replace(/[^0-9.]/g, '');
    setForm((f) => {
      const vat = vatLinkOf(f);
      // ยอดหักที่ส่งไปบันทึกถูกปัด 2 ตำแหน่ง — คิดยอดจ่ายจากค่าที่ปัดแล้วด้วย ไม่งั้นพิมพ์ 30.555 แล้ว
      // รวม VAT − ยอดหัก ≠ ยอดจ่าย 0.01 เว็บจะถอดโหมดก่อน/รวม VAT ของเอกสารนี้ทิ้ง (docVatBreakdown)
      return { ...f, whtAmount, ...(vat ? { amount: round2(vat.gross - round2(toFloat(whtAmount))).toFixed(2) } : {}) };
    });
  }
  const netNum = toFloat(form.amount);
  const whtNum = form.whtTax === 'ไม่มี' ? 0 : toFloat(form.whtAmount);
  const grossTotal = netNum + whtNum;
  const vatLinked = vatLinkOf(form);

  function handleBack() {
    if (onBack) return onBack();
    Alert.alert('ยกเลิก', 'กลับไปหน้ารายการเอกสาร');
  }

  // ---------------- ลงรับใบกำกับภาษี 7% ----------------
  const showTaxReceiveBox = form.attachmentSelect === 'ใบกำกับภาษี 7%';
  const taxDept = form.taxRecvDept;
  const taxSavedCur = taxDept ? loaded?.taxSaved[taxDept] : undefined;
  // แถวที่เห็น = แถวใหม่ + แถวเดิมของฝ่ายที่เลือก (แถวเดิมของฝ่ายอื่นซ่อนและไม่ถูกส่ง แบบ toggleTaxDeptPanel())
  const visibleInvRows = form.taxInvRows.map((r, idx) => ({ ...r, idx })).filter((r) => r.dept === '' || r.dept === taxDept);
  const visibleExistingFiles = form.existingTaxFiles.filter((f) => f.dept === taxDept);
  const taxNoteShown = form.taxNoteEdited ? form.taxNote : taxSavedCur?.note ?? '';
  // ผู้ลงรับ = คนที่ลงรับฝ่ายนี้ไว้แล้ว (บันทึกซ้ำไม่ทับ) · ยังไม่เคยลงรับ = ผู้ใช้ปัจจุบัน (:2277-2280)
  const taxReceiverShown = taxSavedCur?.receiver || currentUserLabel;
  // บัญชีลงรับ (รอบนี้หรือเคยลงรับไว้แล้ว) = สถานะ "ใบกำกับ 7%" · คลัง/จัดซื้อ = ยัง "รอใบกำกับ 7%"
  const taxAccDone = taxDept === 'acc' || !!loaded?.accReceived;

  function selectTaxDept(dept: RecvDept) {
    setForm((f) => {
      if (f.taxRecvDept === dept) return f;
      // ฝ่ายใหม่ยังไม่มีช่องเลขที่ให้กรอกเลย → เปิดแถวว่างให้ 1 แถว
      const hasRow = f.taxInvRows.some((r) => r.dept === '' || r.dept === dept);
      return { ...f, taxRecvDept: dept, taxInvRows: hasRow ? f.taxInvRows : [...f.taxInvRows, { value: '', dept: '' }] };
    });
  }
  function addTaxInvoiceRow() {
    setForm((f) => ({ ...f, taxInvRows: [...f.taxInvRows, { value: '', dept: '' }] }));
  }
  function removeTaxInvoiceRow(idx: number) {
    setForm((f) => ({ ...f, taxInvRows: f.taxInvRows.filter((_, i) => i !== idx) }));
  }
  function updateTaxInvoiceRow(idx: number, value: string) {
    setForm((f) => ({ ...f, taxInvRows: f.taxInvRows.map((r, i) => (i === idx ? { ...r, value } : r)) }));
  }
  function removeExistingTaxFile(file: ExistingTaxFile) {
    setForm((f) => ({ ...f, existingTaxFiles: f.existingTaxFiles.filter((x) => !(x.name === file.name && x.dept === file.dept)) }));
  }

  // สิ่งที่จะส่งไป receive_tax_* (เฉพาะของฝ่ายที่เลือก) + เปลี่ยนจากที่บันทึกไว้จริงไหม
  // ไม่เปลี่ยน = ไม่เรียก — เดิมเรียกทุกครั้งที่บันทึก ผู้ลงรับ/เวลากลายเป็นคนแก้ล่าสุด และหมายเหตุต่อท้าย doc_note ซ้ำ
  function buildTaxPayload() {
    const dept = taxDept as RecvDept;
    const invoiceNumbers = uniqTrim(visibleInvRows.map((r) => r.value));
    const keptFiles = visibleExistingFiles.map((f) => f.name);
    const note = taxNoteShown.trim();
    const changed =
      !taxSavedCur ||
      form.taxFiles.length > 0 ||
      !sameList(invoiceNumbers, taxSavedCur.invoiceNumbers) ||
      !sameList(keptFiles, taxSavedCur.files) ||
      note !== taxSavedCur.note.trim();
    return { dept, invoiceNumbers, keptFiles, note, changed, fileCount: keptFiles.length + form.taxFiles.length };
  }

  function handleSave() {
    if (loaded?.isAc) return;
    if (!form.docNumber.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุเลขที่เอกสาร');
    if (!form.companyId) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกบริษัท (ผู้ซื้อ)');
    if (!form.jobSite.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุโครงการ/หน้างาน');
    if (!form.description.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุรายละเอียด/งวดงาน');
    if (toFloat(form.amount) <= 0) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุยอดจ่ายจริง');
    if (form.isCredit && !form.creditTerm.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุจำนวนวันเครดิต');
    if (!form.accountName.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุชื่อบัญชี');
    if (!form.bankName) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกธนาคาร');
    if (!form.attachmentSelect) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกประเภทเอกสารแนบ 1 รายการ');
    // ยอดหัก ณ ที่จ่าย — เว็บบังคับกรอกเมื่อเปลี่ยนอัตราในรอบนี้ (toggleWHT() ตั้ง required)
    if (form.whtTax !== 'ไม่มี') {
      const raw = form.whtAmount.trim();
      if (raw === '' && form.whtTax !== (loaded?.whtTax ?? 'ไม่มี')) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุยอดหัก ณ ที่จ่าย');
      if (raw !== '' && !(Number(raw) >= 0)) return Alert.alert('ยอดหัก ณ ที่จ่ายไม่ถูกต้อง', 'กรอกเป็นตัวเลข เช่น 30.00');
    }
    // ตรงกับ confirmSave() — taxAttachmentOk() ก่อน แล้วซัพพลายเออร์ เลขบัญชี จำนวนหลักเลขบัญชี
    // ใบกำกับ 7% บังคับฝ่าย + ไฟล์อย่างน้อย 1 ไฟล์ (ไฟล์เดิมที่ยังเก็บไว้ก็นับ) — เลขที่ไม่บังคับ
    if (showTaxReceiveBox) {
      if (!form.taxRecvDept) return Alert.alert('ต้องแนบไฟล์ใบกำกับภาษี', 'เลือกฝ่ายที่ลงรับใบกำกับ แล้วแนบไฟล์อย่างน้อย 1 ไฟล์');
      if (buildTaxPayload().fileCount === 0) return Alert.alert('ต้องแนบไฟล์ใบกำกับภาษี', 'แนบไฟล์ใบกำกับอย่างน้อย 1 ไฟล์ก่อนบันทึก');
    }
    if (!form.supplierName.trim()) return Alert.alert('กรุณาระบุชื่อร้านค้า', 'ต้องเลือกหรือพิมพ์ชื่อซัพพลายเออร์ก่อนบันทึก');
    if (!form.bankAccount.trim()) return Alert.alert('กรุณาระบุเลขบัญชี', 'ต้องเลือกหรือพิมพ์เลขที่บัญชีก่อนบันทึก');
    const digitLimit = master.bank_rules[form.bankName] ?? 0;
    if (digitLimit > 0 && form.bankAccount.trim().replace(/-/g, '').length !== digitLimit) {
      return Alert.alert('เลขบัญชีไม่ถูกต้อง', `ธนาคาร ${form.bankName} ต้องมี ${digitLimit} หลัก`);
    }

    Alert.alert('บันทึกข้อมูล?', 'ยืนยันบันทึกเอกสารนี้', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'บันทึก', onPress: () => void submitToBackend() },
    ]);
  }

  // submit_doc สร้าง/แก้ไขเอกสารเท่านั้น — ลงรับใบกำกับภาษี 7% แยกยิงต่อด้วย receive_tax_warehouse/buyer/acc
  // + from_submit=1 (กติกา save_tax_receive() ของเว็บ) ด้วย doc_id ที่ได้กลับมา
  async function submitToBackend() {
    if (!userId || loaded?.isAc) return;
    setSaving(true);
    try {
      const tax = showTaxReceiveBox && taxDept ? buildTaxPayload() : null;
      // ผู้เปิดเอกสารไม่ต้องส่ง — เซิร์ฟเวอร์ใช้ชื่อจาก user_id (สร้างใหม่) / คง ordered_by เดิม (แก้ไข)
      const res = await apiMobilePost(DOCUMENT_API_URL, 'submit_doc', {
        user_id: userId,
        ...(isEditMode && docId ? { edit_doc_id: docId } : {}),
        doc_type: form.docType,
        doc_number: form.docNumber,
        company_id: form.companyId,
        job_site: form.jobSite,
        supplier_name: form.supplierName,
        description: form.description,
        // ทศนิยม 2 ตำแหน่งเสมอ (คอลัมน์ DECIMAL(15,2)) — ทศนิยมยาวทำให้ log ขึ้นว่ายอดเปลี่ยนทั้งที่เท่าเดิม
        amount: netNum.toFixed(2),
        credit_term: form.isCredit ? form.creditTerm : '0',
        account_name: form.accountName,
        bank_account: form.bankAccount,
        bank_name: form.bankName,
        attachment_select: form.attachmentSelect,
        tax_recv_dept: tax ? tax.dept : '',
        // จำนวนไฟล์ใบกำกับ (เดิมที่เก็บไว้ + ใหม่) ให้เซิร์ฟเวอร์กันแบบเว็บ — ไฟล์จริงส่งไป receive_tax_* ทีหลัง
        ...(tax ? { tax_file_count: tax.fileCount } : {}),
        wht_tax: form.whtTax,
        wht_amount: whtNum.toFixed(2),
      });

      const newDocId = res.doc_id;

      // ลงรับใบกำกับ 7% ต่อ — ทำ "หลัง" บันทึกเอกสารสำเร็จเพราะต้องใช้ doc_id และเฉพาะตอนลงรับครั้งแรกของฝ่ายนี้
      // หรือเลขที่/ไฟล์/หมายเหตุเปลี่ยนจริง (บัญชีลงรับ = เซิร์ฟเวอร์เปลี่ยน "รอใบกำกับภาษี 7%" เป็น "ใบกำกับภาษี 7%" ให้)
      if (tax && tax.changed && newDocId) {
        const taxAction = tax.dept === 'wh' ? 'receive_tax_warehouse' : tax.dept === 'buyer' ? 'receive_tax_buyer' : 'receive_tax_acc';
        const invField = tax.dept === 'wh' ? 'wh_tax_inv_number[]' : 'tax_inv_number[]';
        const noteField = tax.dept === 'wh' ? 'wh_action_note' : 'action_note';
        const fileField = tax.dept === 'wh' ? 'wh_tax_file_upload[]' : tax.dept === 'buyer' ? 'tax_file_upload[]' : 'acc_file_upload[]';
        const fdTax = new FormData();
        fdTax.append('action', taxAction);
        fdTax.append('user_id', String(userId));
        fdTax.append('doc_id', String(newDocId));
        fdTax.append('from_submit', '1');
        tax.invoiceNumbers.forEach((v) => fdTax.append(invField, v));
        fdTax.append(noteField, tax.note);
        form.taxFiles.forEach((f) => fdTax.append(fileField, { uri: f.uri, name: f.name, type: f.type } as any));
        // ไฟล์เดิมของฝ่ายนี้ที่ยังเก็บไว้ — ไม่ส่ง = เอาออกจากรายการ · ไฟล์ของฝ่ายอื่นไม่ส่งไปเด็ดขาด
        tax.keptFiles.forEach((name) => fdTax.append('existing_files[]', name));
        try {
          const taxRes = await axios.post(DOCUMENT_API_URL, fdTax, { headers: { 'Content-Type': 'multipart/form-data' } });
          if ((taxRes.data as any)?.status !== 'success') throw new Error((taxRes.data as any)?.message);
        } catch (taxErr: any) {
          // เอกสารหลักบันทึกสำเร็จไปแล้ว — แจ้งแยกว่าส่วนลงรับใบกำกับมีปัญหา (ฝ่ายนี้ยังไม่ถูกลงรับ บัญชียังไม่เคยรับ = ยัง "รอใบกำกับ 7%")
          Alert.alert('บันทึกเอกสารแล้ว แต่ลงรับใบกำกับไม่สำเร็จ', taxErr?.message || 'ลงรับใบกำกับอีกครั้งที่หน้าทะเบียนเอกสาร');
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

  if (loadingEdit) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={{ color: '#94a3b8', fontSize: 12.5 }}>กำลังโหลดข้อมูล...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return <NoticeScreen icon="alert-circle-outline" color="#ef4444" title="โหลดข้อมูลไม่สำเร็จ" text={loadError} onBack={handleBack} />;
  }

  // AC (เคลียร์เงินทดรอง) มีหลายกล่องร้านค้าที่ฟอร์มนี้ไม่มี — บันทึกจากแอปแล้วกล่องจะไม่ตรงกับหัวเอกสาร
  if (loaded?.isAc) {
    return <NoticeScreen icon="desktop-outline" color="#d97706" title="เอกสาร AC แก้ไขได้ที่หน้าเว็บ" text={form.docNumber ? `เลขที่ ${form.docNumber}` : undefined} onBack={handleBack} />;
  }

  return (
    <>
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
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
                {/* แก้ไข = ผู้เปิดเอกสารเดิม (เว็บ :1976-1978) · สร้างใหม่ = ผู้ใช้ปัจจุบัน */}
                <View style={styles.readonlyInput}>
                  <Text style={styles.readonlyInputText}>{isEditMode ? loaded?.orderedBy || '-' : currentUserLabel}</Text>
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
            <TextInput style={[styles.input, styles.amountInput]} placeholder="0.00" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={form.amount} onChangeText={onAmountChange} />
            {/* เอกสารที่เว็บกรอกแบบราคาก่อน/รวม VAT — ยอดจ่ายจริงผูกกับ รวม VAT − หัก ณ ที่จ่าย จนกว่าจะพิมพ์ยอดเอง */}
            {!!loaded?.vat && (
              <Text style={styles.vatNote}>
                {vatLinked
                  ? `กรอกแบบ${vatLinked.mode === 'base' ? 'ราคาก่อน VAT' : 'ราคารวม VAT'}ที่เว็บ · รวม VAT ${vatLinked.gross.toFixed(2)} (ก่อน VAT ${vatLinked.base.toFixed(2)}) − หัก ณ ที่จ่าย = ยอดจ่ายจริง`
                  : 'แก้ยอดแล้ว ยอดแยก VAT เดิมจะไม่ถูกใช้'}
              </Text>
            )}

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
              label={bankAccountOptions.some((o) => o.value === form.bankAccount) ? form.bankAccount : ''}
              placeholder="เลือกจากประวัติ..."
              onPress={() =>
                openPicker(
                  'เลือกเลขที่บัญชี',
                  bankAccountOptions,
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
                <Text style={styles.taxReceiveHint}>เลือกได้ฝ่ายเดียว และต้องแนบไฟล์ใบกำกับอย่างน้อย 1 ไฟล์ ถึงจะบันทึกเอกสารได้</Text>

                <View style={styles.rowGap}>
                  {TAX_DEPTS.map((d) => {
                    const active = form.taxRecvDept === d.key;
                    return (
                      <TouchableOpacity key={d.key} style={[styles.deptCard, active && { borderColor: d.color, backgroundColor: d.color + '12' }]} onPress={() => selectTaxDept(d.key)}>
                        <Ionicons name={d.icon} size={16} color={active ? d.color : '#94a3b8'} />
                        <Text style={[styles.deptCardText, active && { color: d.color }]}>{d.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* เลือกฝ่ายแล้วถึงจะโผล่ช่องกรอก (tax_recv_panel ของเว็บ) — ข้อมูลเดิมที่เห็นเป็นของฝ่ายที่เลือกเท่านั้น */}
                {taxDept !== '' && (
                  <>
                    <Text style={[styles.taxStatusHint, { color: taxAccDone ? '#059669' : '#d97706' }]}>
                      {taxAccDone
                        ? `บันทึกแล้วสถานะเอกสารจะเป็น "ใบกำกับ 7%"${taxDept === 'acc' ? '' : ' (บัญชีลงรับไว้ก่อนแล้ว)'}`
                        : 'บันทึกแล้วสถานะเอกสารจะยังเป็น "รอใบกำกับ 7%" จนกว่าบัญชีจะลงรับ'}
                    </Text>

                    <FieldLabel text="เลขที่ใบกำกับภาษี" />
                    {visibleInvRows.map((r) => (
                      <View key={r.idx} style={styles.taxInvRow}>
                        <TextInput style={[styles.input, { flex: 1 }]} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={r.value} onChangeText={(t) => updateTaxInvoiceRow(r.idx, t)} />
                        {visibleInvRows.length > 1 && (
                          <TouchableOpacity onPress={() => removeTaxInvoiceRow(r.idx)} style={styles.taxInvRemoveBtn}>
                            <Ionicons name="close" size={14} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                    <TouchableOpacity style={styles.addTaxInvBtn} onPress={addTaxInvoiceRow}>
                      <Ionicons name="add" size={13} color="#059669" />
                      <Text style={styles.addTaxInvBtnText}>เพิ่มเลขที่ใบกำกับ</Text>
                    </TouchableOpacity>

                    {visibleExistingFiles.length > 0 && (
                      <>
                        <FieldLabel text="ไฟล์ที่แนบไว้แล้ว" />
                        <View style={styles.taxFileChipsRow}>
                          {visibleExistingFiles.map((file, i) => (
                            <TouchableOpacity
                              key={`${file.dept}-${file.name}`}
                              style={[styles.taxFileChip, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}
                              onPress={() => Linking.openURL(`${API_BASE}/uploads/${file.name}`)}
                            >
                              <Ionicons name="checkmark-circle-outline" size={11} color="#059669" />
                              <Text style={[styles.taxFileChipText, { color: '#059669' }]} numberOfLines={1}>
                                ไฟล์ {i + 1}
                              </Text>
                              <TouchableOpacity onPress={() => removeExistingTaxFile(file)}>
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
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      placeholder="ระบุหมายเหตุ..."
                      placeholderTextColor="#94a3b8"
                      multiline
                      value={taxNoteShown}
                      onChangeText={(v) => setForm((f) => ({ ...f, taxNote: v, taxNoteEdited: true }))}
                    />

                    <FieldLabel text="ผู้ลงรับ" />
                    <View style={styles.readonlyInput}>
                      <Text style={styles.readonlyInputText}>{taxReceiverShown}</Text>
                    </View>
                    {!!loaded?.taxEditor && (
                      <>
                        <FieldLabel text="ผู้แก้ไขล่าสุด" />
                        <View style={styles.readonlyInput}>
                          <Text style={styles.readonlyInputText}>
                            {loaded.taxEditor}
                            {loaded.taxEditedAt ? `  ·  ${formatShortThaiDateTime(loaded.taxEditedAt)}` : ''}
                          </Text>
                        </View>
                      </>
                    )}
                  </>
                )}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <SectionHeader icon="calculator-outline" text="หัก ณ ที่จ่าย (WHT)" />
            <View style={styles.whtRow}>
              {WHT_RATES.map((r) => (
                <TouchableOpacity key={r} style={[styles.whtChip, form.whtTax === r && styles.whtChipActive]} onPress={() => onWhtRateChange(r)}>
                  <Text style={[styles.whtChipText, form.whtTax === r && styles.whtChipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.whtTax !== 'ไม่มี' && (
              <View style={styles.whtDetailBox}>
                {/* ช่องยอดหักแก้เองได้แบบเว็บ (:2341-2343) — ระบบคำนวณให้เฉพาะตอนเปลี่ยนยอดเงิน/อัตรา */}
                <View style={styles.whtAmountRow}>
                  <Text style={styles.whtAmountLabel}>ยอดหัก:</Text>
                  <TextInput
                    style={[styles.input, styles.whtAmountInput]}
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={form.whtAmount}
                    onChangeText={onWhtAmountChange}
                  />
                  <Text style={styles.whtAmountLabel}>บาท</Text>
                </View>
                <Text style={styles.whtHint}>คำนวณให้เมื่อเปลี่ยนยอดเงินหรืออัตรา แก้ตัวเลขเองได้</Text>
                {whtNum > 0 && (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.whtSummaryLine}>
                      ยอดจ่ายจริง <Text style={styles.whtSummaryStrong}>{netNum.toFixed(2)}</Text> + หัก ณ ที่จ่าย{' '}
                      <Text style={[styles.whtSummaryStrong, { color: '#ef4444' }]}>{whtNum.toFixed(2)}</Text>
                    </Text>
                    <View style={styles.whtGrossRow}>
                      <Text style={styles.whtGrossLabel}>ยอดเต็มก่อนหัก</Text>
                      <Text style={styles.whtGrossValue}>{grossTotal.toFixed(2)} บาท</Text>
                    </View>
                  </>
                )}
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

    <Modal visible={pickerModal.visible} transparent animationType="fade" onRequestClose={closePicker}>
      <KeyboardAvoidingView style={styles.pickerModalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* แตะพื้นหลังเพื่อปิด — แยกจากตัวกล่อง ไม่ให้แตะช่องค้นหา/ชื่อหัวข้อแล้วป๊อปอัพปิด */}
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closePicker} />
        <View style={styles.pickerModalSheet}>
          <Text style={styles.pickerModalTitle}>{pickerModal.title}</Text>
          {pickerModal.options.length > PICKER_SEARCH_MIN && (
            <View style={styles.pickerSearchBox}>
              <Ionicons name="search" size={14} color="#94a3b8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="พิมพ์ค้นหา..."
                placeholderTextColor="#94a3b8"
                value={pickerSearch}
                onChangeText={setPickerSearch}
                autoCorrect={false}
              />
              {pickerSearch !== '' && (
                <TouchableOpacity onPress={() => setPickerSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
          )}
          <FlatList
            style={styles.pickerModalList}
            data={pickerShownOptions}
            keyExtractor={(opt, i) => `${opt.value}|${i}`}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            maxToRenderPerBatch={30}
            windowSize={9}
            ListEmptyComponent={<Text style={styles.pickerModalEmptyText}>{pickerModal.options.length === 0 ? 'ยังไม่มีตัวเลือก' : 'ไม่พบรายการที่ค้นหา'}</Text>}
            renderItem={({ item: opt }) => {
              const active = pickerModal.current === opt.value;
              return (
                <TouchableOpacity
                  style={[styles.pickerModalOption, active && styles.pickerModalOptionActive]}
                  onPress={() => {
                    pickerModal.onSelect(opt.value);
                    closePicker();
                  }}
                >
                  <View style={{ flexShrink: 1 }}>
                    <Text style={styles.pickerModalOptionText}>{opt.label}</Text>
                    {!!opt.sub && <Text style={styles.pickerModalOptionSub}>{opt.sub}</Text>}
                  </View>
                  {active && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity style={styles.pickerModalCloseBtn} onPress={closePicker}>
            <Text style={styles.pickerModalCloseBtnText}>ปิด</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  vatNote: { fontSize: 11, color: '#64748b', marginTop: 6 },

  noticeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  noticeTitle: { fontSize: 14, fontWeight: '800', color: '#334155', textAlign: 'center' },
  noticeText: { fontSize: 12.5, color: '#64748b', textAlign: 'center' },
  noticeBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#4f46e5', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 },
  noticeBackBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rowGap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  readonlyInput: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  readonlyInputText: { fontSize: 13, color: '#64748b', fontWeight: '700' },

  pickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  pickerTriggerText: { fontSize: 13, color: '#0f172a', fontWeight: '600', flexShrink: 1 },
  pickerTriggerPlaceholder: { color: '#94a3b8', fontWeight: '400' },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  pickerModalSheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16, maxHeight: '88%' },
  pickerModalTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  pickerSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, marginBottom: 8, backgroundColor: '#f8fafc' },
  pickerSearchInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: '#0f172a' },
  pickerModalList: { flexGrow: 0, flexShrink: 1, maxHeight: 380 },
  pickerModalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  pickerModalOptionActive: { backgroundColor: '#eef2ff' },
  pickerModalOptionText: { fontSize: 12.5, fontWeight: '700', color: '#334155', flexShrink: 1 },
  pickerModalOptionSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
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
  taxStatusHint: { fontSize: 11.5, fontWeight: '700', marginTop: 10 },

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
  whtAmountInput: { width: 140, paddingVertical: 8, fontSize: 15, fontWeight: '900', color: '#ef4444' },
  whtHint: { fontSize: 10.5, color: '#94a3b8', marginTop: 6 },
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