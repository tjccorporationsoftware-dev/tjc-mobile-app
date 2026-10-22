/**
 * DocumentDashboardScreen.tsx
 * ------------------------------------------------------------------
 * หน้า "ทะเบียนคุมเอกสาร PO/AX" (มือถือ) — ต่อ API จริงจาก
 * document_API_mobile.php (27 actions: get_master_data, get_dashboard,
 * get_list, get_detail, get_history, get_pending_requests, approve_document,
 * save_finance, save_note, update_return_document, update_credit,
 * update_bill_pay, edit_document, cancel_document, save_refund,
 * receive_warehouse, receive_tax_warehouse, receive_tax_buyer,
 * receive_tax_acc, cancel_step_receive, save_tax_status_note,
 * update_return_tax, get_submit_master_data, submit_doc,
 * submit_request, accept_request)
 *
 * "แจ้ง" (submit_request) แสดงเฉพาะผู้ไม่มีสิทธิ์ can_edit_document — พอร์ตตรรกะการแสดงปุ่ม
 * จาก DocumentDashboard.php เป๊ะ (มีสิทธิ์แก้ไข = เห็นปุ่มแก้ไข/ยกเลิกตรง, ไม่มีสิทธิ์ = เห็นปุ่มแจ้งแทน)
 * ปุ่ม "รับทราบ" (accept_request) ในริบบิ้นคำขอ โชว์ให้คนมีสิทธิ์ can_edit_document เท่านั้น
 * ส่วนการปิดคำขอจริง (status=done) เกิดอัตโนมัติที่ backend ตอน edit_document/cancel_document สำเร็จ
 *
 * ปุ่ม "แก้ไข" (gated ด้วย can_edit_document จริง) และปุ่ม "เพิ่มเอกสาร" ใช้หน้าเดียวกันคือ
 * SubmitDocumentScreen (submitdocument.tsx) — "เพิ่มเอกสาร" เปิดแบบไม่ส่ง docId (โหมดสร้างใหม่)
 * ส่วนปุ่มแก้ไขส่ง docId ของเอกสารนั้นเข้าไป (โหมดแก้ไขเต็มรูปแบบ, isEditMode ในไฟล์นั้นโหลด
 * get_detail มาเติมฟอร์มเอง) ซึ่งเชื่อม document_API_mobile.php จริงแล้วทั้งคู่ (submit_doc +
 * get_submit_master_data + get_detail) — SubmitDocument.php (เว็บ) ถูกบังคับ session เหมือนหน้า
 * อื่นๆ ที่เจอมาก่อน จึงย้ายมาไว้ที่โมดูลมือถือนี้แทนทั้งหมด ทดสอบ create+edit จริงแล้วก่อนส่งมอบ
 *
 * save_finance (17 ต.ค. 69): ป๊อปอัพสลิปมีปุ่ม "ลบ" แบบเว็บแล้ว — ส่ง slip_files_managed=1 เฉพาะตอนกดลบ
 *    พร้อม existing_slip_files[] / existing_slip_full_files[] ครบทั้ง 2 ช่อง (apiSaveFinanceManaged) จากข้อมูลสดตอนบันทึก
 *    สลิปที่ไม่ได้ส่งกลับ = ถูกลบ เซิร์ฟเวอร์ย้ายลงถังขยะ (ไม่ลบไฟล์จริง) · ไม่ได้ลบ = ไม่ส่ง managed เซิร์ฟเวอร์เก็บของเดิมเอง
 * ป๊อปอัปที่ส่งรายการไฟล์เดิมกลับ (สลิป/รับใบกำกับ/แก้ไขข้อมูล/กล่อง AC) เปิดผ่าน loadFreshDoc() ดึงเอกสารใหม่ก่อนเสมอ
 *
 * สิทธิ์ทุกปุ่มอ่านจากฟิลด์ can_xxx ที่ API คืนมาสดทุกครั้ง (ไม่แคช ไม่เดาเอง)
 * ตัวเลข/สถานะ/ยอดเงินทั้งหมดอ่านจากฟิลด์ที่ backend คำนวณมาให้แล้วเท่านั้น
 *
 * ลิสต์โหลดทีละหน้า (PAGE_SIZE) เลื่อนถึงท้ายแล้วโหลดต่อ — จำนวนทั้งหมดใช้ total ของ get_list
 * หลังกดปุ่มทำรายการ ดึงเอกสารใบนั้นใบเดียวใหม่ (get_list + doc_id) แทนโหลดลิสต์ใหม่ทั้งก้อน
 * หน้ารายละเอียดจึงเห็นสถานะล่าสุดเสมอ แม้เอกสารหลุดจากตัวกรองที่เลือกอยู่ไปแล้ว
 * ------------------------------------------------------------------
 */

import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import SubmitDocumentScreen from './submitdocument';
import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
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

// ✅ Config
import { API_BASE, API_MODULES } from '../../constants/config';
// 🌟 ปุ่มเลือกวันที่ + รูปแบบวันที่/เวลาสั้น "d/m/yy" มาตรฐานเดียวกันทั้งแอป
import { DateField, TimeField, formatShortThaiDate, formatShortThaiDateTime } from '../../components/DateTimeField';
import ListPager, { pageCount } from '../../components/ListPager';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';
import { useAuth } from '../_layout';
// ปรับ path นี้ให้ตรงกับตำแหน่งไฟล์จริงในโปรเจกต์ ถ้าไม่ได้วางไว้โฟลเดอร์เดียวกัน

const DOCUMENT_API_URL = `${API_MODULES}/document_API_mobile.php`;

// ====================================================================
// Types (ตั้งชื่อฟิลด์ตรงกับ API จริงเป๊ะ — snake_case)
// ====================================================================

// AC = เคลียร์เงินทดรอง (หลายกล่องร้านค้า) — แอปแสดงได้แต่แก้ไขไม่ได้ (ทำที่หน้าเว็บ)
type DocType = 'PO' | 'AX' | 'AC';
type DeptKey = 'warehouse' | 'purchase' | 'accounting';
type StageFilter = 'all' | 'pending_approve' | 'approved' | 'pending_finance' | 'finance_received' | 'returned' | 'cancelled';
// ชื่อแผนกฝั่ง API (คีย์ของ tax_pairs / tax_recv_defaults ใน get_list)
type TaxDeptApiKey = 'wh' | 'buyer' | 'acc';
// คู่ "ไฟล์ ↔ เลขที่ใบกำกับ" ตามลำดับจริงในคอลัมน์ (ไฟล์ว่าง = มีแต่เลขที่)
interface TaxPair {
  file: string;
  inv: string;
}
// ช่องไฟล์เดิมของแผนกอื่นที่ดึงมารอตอนกดรับครั้งแรก — src = แผนกเจ้าของไฟล์
interface TaxSlot extends TaxPair {
  src: TaxDeptApiKey;
}

// ── ส่วนเสริมนอก AC (17 ต.ค. 69) — ฟิลด์ต่อแถวของ get_list ที่เพิ่มให้ตรงกับเว็บ (interface merge ไม่แตะบล็อกเดิม) ──
interface TaxSlot {
  // 1 = ไฟล์ที่บันทึกในช่องของแผนกนี้อยู่แล้ว (เอาออกต้องมีสิทธิ์ยกเลิกการรับของแผนกนั้น) — มีเฉพาะ tax_edit_slots
  own?: number;
}
// ยอดแยก VAT (docVatBreakdown) — null = กรอกเป็นยอดจ่ายจริง หรือยอดถูกแก้ทีหลังจนไม่ตรง (ไม่ต้องโชว์กล่อง)
interface VatBreakdown {
  mode: 'base' | 'gross';
  base: number;
  vat: number;
  gross: number;
  rate: number;
}
interface DocListItem {
  fin_cancel_count?: number;
  can_cancel_finance_receive?: number | boolean;
  vat_mode?: string | null;
  amount_before_vat?: number | null;
  vat_amount?: number | null;
  amount_incl_vat?: number | null;
  vat_breakdown?: VatBreakdown | null;
  // ช่องไฟล์ของป๊อปอัพ "แก้ไขข้อมูล" ของแผนกที่ลงรับแล้ว (ของตัวเองก่อน ตามด้วยไฟล์ของแผนกอื่นที่ยังไม่ถูกปฏิเสธ)
  tax_edit_slots?: Partial<Record<TaxDeptApiKey, TaxSlot[]>>;
  doc_note_general?: string;
  tax7_files?: string[];
  can_accept_request?: number | boolean;
  cancel_return_by?: string;
  cancel_return_at?: string;
  cancel_return_tax_by?: string;
  cancel_return_tax_at?: string;
}
// แถวไฟล์ที่ถูกลบ (get_file_trash)
interface TrashRow {
  id: number;
  doc_id: number;
  column: string;
  column_label: string;
  file_name: string;
  file_url: string;
  file_exists: number;
  invoice_no: string;
  source: string;
  source_label: string;
  deleted_by: string;
  deleted_at: string;
  can_restore: number;
}
// ประวัติยกเลิกการรับของการเงิน (get_finance_cancel_history)
interface FinCancelRow {
  received_at: string;
  slip_count: number;
  remark: string;
  cancelled_by: string;
  cancelled_at: string;
}
// AC (เคลียร์เงินทดรอง): 1 เอกสารมีหลายกล่องร้านค้า — get_list ส่ง ac_items มากับแถว AC (doc_ac_item_to_json ฝั่ง API)
// ลงรับใบกำกับแยกรายกล่อง/รายฝ่าย (receipts) · เลขที่+ไฟล์ของกล่องใช้ร่วมกันทุกฝ่าย (tax_pairs)
interface AcReceipt {
  by: string;
  at: string;
  note: string;
}
interface AcItem {
  id: number;
  line_no: number;
  job_site: string;
  supplier_name: string;
  description: string;
  attachment_type: string;
  vat_mode: string;
  amount_entered: number;
  vat: { mode: string; base: number; vat: number; gross: number } | null;
  wht_tax: string;
  wht_amount: number;
  amount: number;
  gross_before_wht: number;
  tax_pairs: TaxPair[];
  tax_note: string;
  receipts: Partial<Record<TaxDeptApiKey, AcReceipt>>;
  can_receive_tax: boolean;
}

interface DocListItem {
  id: number;
  doc_id?: number;
  company_id?: number | string;
  company_display?: string;
  company_full_name?: string;
  company_shortname?: string;
  doc_type: DocType;
  doc_number: string;
  created_at?: string;
  created_at_thai?: string;
  ordered_by?: string;
  job_site?: string;
  supplier_name?: string;
  description?: string;
  amount: number;
  bank_name?: string;
  bank_account?: string;
  account_name?: string;
  wht_tax?: string;
  wht_amount?: number;
  attachments?: string[];
  approver_name?: string;
  approved_at?: string;
  approved_at_thai?: string;
  is_approved?: boolean | number;
  finance_receiver?: string;
  finance_received_at?: string;
  is_finance_received?: boolean | number;
  slip_files?: string[];
  slip_full_files?: string[];
  slip_last_at?: string;
  warehouse_receiver?: string;
  warehouse_received_at?: string;
  warehouse_doc_no?: string;
  wh_tax_receiver?: string;
  wh_tax_received_at?: string;
  wh_tax_invoice_no?: string[];
  wh_tax_files?: string[];
  wh_tax_note?: string;
  tax_receiver?: string;
  tax_received_at?: string;
  tax_invoice_no?: string[];
  // ค่าดิบในคอลัมน์ tax_invoice_no — ป๊อปอัพบิล/จ่ายเงินเติมค่านี้ลงช่องเหมือนเว็บ
  tax_invoice_no_raw?: string;
  tax_pairs?: Partial<Record<TaxDeptApiKey, TaxPair[]>>;
  tax_recv_defaults?: Partial<Record<TaxDeptApiKey, TaxSlot[]>>;
  tax_files?: string[];
  note_buyer?: string;
  acc_receiver?: string;
  acc_received_at?: string;
  acc_files?: string[];
  note_acc?: string;
  tax_status_note?: string;
  tax_issue_status?: string;
  return_doc_by?: string;
  return_doc_at?: string;
  return_remark?: string;
  is_returned?: boolean | number;
  return_tax_by?: string;
  return_tax_at?: string;
  return_tax_remark?: string;
  is_tax_returned?: boolean | number;
  credit_term?: number | string;
  billing_doc_no?: string;
  billing_date?: string;
  payment_due_date?: string;
  payment_status?: string;
  bill_updater_name?: string;
  bill_updated_at?: string;
  refund_by?: string;
  refund_at?: string;
  refund_at_thai?: string;
  refund_note?: string;
  refund_files?: string[];
  is_refunded?: boolean | number;
  doc_note?: string;
  doc_note_by?: string;
  is_cancelled?: boolean | number;
  cancelled_by?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  pending_request_type?: string;
  has_pending_request?: boolean | number;
  pending_request_id?: number;
  pending_request_status?: string;
  // AC (เคลียร์เงินทดรอง) — มีเฉพาะแถว AC
  ac_items_count?: number;
  ac_wht_total?: number;
  ac_items?: AcItem[];
}

interface Perms {
  can_view_all_docs: boolean;
  can_edit_document: boolean;
  can_return_document: boolean;
  can_approve: boolean;
  can_save_finance: boolean;
  can_save_note: boolean;
  can_update_credit: boolean;
  can_update_bill_pay: boolean;
  can_cancel_document: boolean;
  can_save_refund: boolean;
  can_receive_warehouse: boolean;
  can_receive_tax: boolean;
  // ปุ่ม "ยกเลิกการรับ" แยกสิทธิ์รายแผนก (btn_cancel_receive_wh / _buyer / _acc) — 1 ปุ่ม = 1 รหัส
  can_cancel_receive_wh: boolean;
  can_cancel_receive_buyer: boolean;
  can_cancel_receive_acc: boolean;
  // ส่วนเสริมนอก AC — ปุ่ม "กู้คืนรายการ" ของเอกสารที่ยกเลิก (btn_edit แบบเว็บ)
  can_restore_document: boolean;
}

const DEFAULT_PERMS: Perms = {
  can_view_all_docs: false,
  can_edit_document: false,
  can_return_document: false,
  can_approve: false,
  can_save_finance: false,
  can_save_note: false,
  can_update_credit: false,
  can_update_bill_pay: false,
  can_cancel_document: false,
  can_save_refund: false,
  can_receive_warehouse: false,
  can_receive_tax: false,
  can_cancel_receive_wh: false,
  can_cancel_receive_buyer: false,
  can_cancel_receive_acc: false,
  can_restore_document: false,
};

interface UploadLimits {
  allowed_extensions?: string[];
  allowed_extensions_slip?: string[];
  upload_max_filesize?: string;
  post_max_size?: string;
  max_file_uploads?: number;
}

interface MasterData {
  companies: { id: number | string; name: string }[];
  users: { id: number | string; name: string }[];
  doc_types: string[];
  amount_ranges: { value: string; label: string }[];
  statuses: { value: string; label: string }[];
  payment_status_options: { value: string; label: string }[];
  upload_limits: UploadLimits;
}

// ตรงกับ <select id="bp_status"> ใน DocumentDashboard.php:5290-5297 — ชุดสำรอง: ปกติใช้ payment_status_options จาก get_master_data (paymentStatusOptions)
const PAYMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'วางบิลแล้ว', label: 'วางบิลแล้ว' },
  { value: 'รออนุมัติจ่าย', label: 'รออนุมัติจ่าย' },
  { value: 'เตรียมเช็ค/โอน', label: 'เตรียมเช็ค/โอน' },
  { value: 'จ่ายแล้ว (Complete)', label: '✅ จ่ายแล้ว (Complete)' },
  { value: 'ยกเลิก', label: '❌ ยกเลิก' },
];

interface KpiAll {
  job_count: number;
  total_money: number;
  count_pending_app: number;
  count_approved: number;
  count_pending_fin: number;
  count_received: number;
  count_returned: number;
  count_urgent: number;
  count_overdue: number;
  count_taxdone: number;
  count_credit_alert: number;
  count_pv: number;
  amount_pv: number;
  count_vat: number;
  amount_vat: number;
  count_wait: number;
  amount_wait: number;
  count_receipt: number;
  amount_receipt: number;
  count_payment: number;
  amount_payment: number;
  count_credit_paid: number;
  count_credit_unpaid: number;
  amount_credit_paid: number;
  amount_credit_unpaid: number;
  [key: string]: number;
}

// 1 แถวของ get_dashboard.kpi_by_company[] — ตัวเลขชุดเดียวกับ kpi_all แต่แยกต่อบริษัท
interface KpiCompany {
  id: number;
  name: string;
  kpi: KpiAll;
}

type CreditStatusFilter = 'all' | 'paid' | 'unpaid';

// กล่องสถานะ 4 แบบ — color ใช้บนพื้นขาว (การ์ดบริษัท), faIcon/onDark/tint ใช้ในการ์ดสรุปพื้นเข้ม
// (ไอคอน/โทนสีตามกล่องบนหน้าเว็บ DocumentDashboard.php) แตะเพื่อกรอง แตะซ้ำเพื่อล้าง
// สีตามกติกาทั้งแอป: ส้ม = รอ, เขียว = เสร็จ, แดง = เกิน/มีปัญหา, เทา/ขาว = ข้อมูลทั่วไป
const STAGE_CHIPS: {
  key: StageFilter;
  label: string;
  color: string;
  countKey: keyof KpiAll;
  faIcon: keyof typeof FontAwesome5.glyphMap;
  onDark: string;
  tint: string;
  tintBorder: string;
}[] = [
  { key: 'pending_approve', label: 'รออนุมัติ', color: '#d97706', countKey: 'count_pending_app', faIcon: 'signature', onDark: '#fbbf24', tint: 'rgba(245,158,11,0.16)', tintBorder: 'rgba(245,158,11,0.45)' },
  { key: 'approved', label: 'อนุมัติแล้ว', color: '#059669', countKey: 'count_approved', faIcon: 'check-circle', onDark: '#34d399', tint: 'rgba(16,185,129,0.16)', tintBorder: 'rgba(52,211,153,0.4)' },
  { key: 'pending_finance', label: 'รอการเงิน', color: '#d97706', countKey: 'count_pending_fin', faIcon: 'clock', onDark: '#fbbf24', tint: 'rgba(245,158,11,0.16)', tintBorder: 'rgba(245,158,11,0.45)' },
  { key: 'finance_received', label: 'รับเอกสารแล้ว', color: '#059669', countKey: 'count_received', faIcon: 'wallet', onDark: '#34d399', tint: 'rgba(16,185,129,0.16)', tintBorder: 'rgba(52,211,153,0.4)' },
];

// ยอดแยกตามประเภทเอกสาร — เดิมเป็นการ์ดเลื่อนแนวนอนที่โดนตัดขอบจอ ย้ายไปอยู่ในส่วนพับเก็บ
// keyword = ค่า filter_keyword ที่ backend ใช้กรอง attachments (ตรงกับลิงก์ของกล่องประเภทเอกสารบนเว็บ)
const DOC_BREAKDOWN: {
  label: string;
  keyword: string;
  icon: keyof typeof FontAwesome5.glyphMap;
  color: string;
  onDark: string;
  countKey: keyof KpiAll;
  amountKey: keyof KpiAll;
}[] = [
  { label: 'ใบสำคัญจ่าย', keyword: 'ใบสำคัญจ่าย', icon: 'file-invoice-dollar', color: '#64748b', onDark: '#ffffff', countKey: 'count_pv', amountKey: 'amount_pv' },
  { label: 'ใบกำกับ 7%', keyword: 'ใบกำกับภาษี 7%', icon: 'check-circle', color: '#059669', onDark: '#34d399', countKey: 'count_vat', amountKey: 'amount_vat' },
  { label: 'รอใบกำกับ', keyword: 'รอใบกำกับภาษี 7%', icon: 'history', color: '#d97706', onDark: '#fbbf24', countKey: 'count_wait', amountKey: 'amount_wait' },
  { label: 'ใบเสร็จรับเงิน', keyword: 'ใบเสร็จรับเงิน', icon: 'receipt', color: '#64748b', onDark: '#ffffff', countKey: 'count_receipt', amountKey: 'amount_receipt' },
  { label: 'ชุดชำระเงิน', keyword: 'ชุดชำระเงิน', icon: 'money-check-alt', color: '#64748b', onDark: '#ffffff', countKey: 'count_payment', amountKey: 'amount_payment' },
];

// เครดิตจ่ายแล้ว/ค้างจ่าย — เขียว/ส้มตามหน้าเว็บ (โทนสว่างเพราะอยู่บนพื้นเข้ม) แตะเพื่อกรอง (filter_credit_status)
const CREDIT_TILES: {
  key: Exclude<CreditStatusFilter, 'all'>;
  label: string;
  faIcon: keyof typeof FontAwesome5.glyphMap;
  onDark: string;
  tint: string;
  tintBorder: string;
  countKey: keyof KpiAll;
  amountKey: keyof KpiAll;
}[] = [
  { key: 'paid', label: 'เครดิต (จ่ายแล้ว)', faIcon: 'check-double', onDark: '#34d399', tint: 'rgba(16,185,129,0.14)', tintBorder: 'rgba(52,211,153,0.35)', countKey: 'count_credit_paid', amountKey: 'amount_credit_paid' },
  { key: 'unpaid', label: 'เครดิต (ค้างจ่าย)', faIcon: 'clock', onDark: '#fbbf24', tint: 'rgba(245,158,11,0.14)', tintBorder: 'rgba(251,191,36,0.4)', countKey: 'count_credit_unpaid', amountKey: 'amount_credit_unpaid' },
];

interface HistoryLog {
  id: number;
  doc_id: number;
  action_type: string;
  action_label: string;
  // สีป้ายแบบเว็บ: cancel = แดง (ยกเลิก/ลบไฟล์) · restore = เขียว (กู้คืน) · edit = ปกติ
  action_tone?: string;
  action_by: string;
  action_at: string;
  action_at_thai?: string;
  changes?: { field: string; old: string; new: string }[];
  details_lines?: string[];
}

interface PickedFile {
  uri: string;
  name: string;
  type: string;
}

export interface DocumentDashboardScreenProps {
  onBack?: () => void;
}

// ====================================================================
// Helpers
// ====================================================================

function truthy(v: any): boolean {
  return v === true || v === 1 || v === '1';
}

function num(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ยอดเต็มไม่มีทศนิยม — กล่องประเภทเอกสารบนเว็บใช้ number_format() แบบไม่มีทศนิยม (เช่น "6,200 บ.")
function num0(n: number | undefined | null): string {
  return Math.round(n ?? 0).toLocaleString('en-US');
}

function arr(v: any): string[] {
  if (Array.isArray(v)) return v.filter((x) => !!x);
  return [];
}

// กำหนดติดตาม (30 วัน) — คัดลอกตรรกะคอลัมน์ "กำหนดติดตาม" ของ DocumentDashboard.php:
//  - ใบกำกับ 7% แนบมาตั้งแต่เปิดเอกสาร (ยังไม่มี 3 ฝ่ายไหนกดรับ) -> "แนบใบกำกับภาษี"
//  - ใบกำกับ 7% / บัญชีรับใบกำกับแล้ว -> "รับใบกำกับแล้ว"
//  - รอใบกำกับ 7% + การเงินรับแล้ว -> ครบกำหนด = วันที่การเงินรับ + 30 วัน: จ่ายแล้ว / เกินกำหนด / เหลือ N วัน
//  - อื่นๆ -> ไม่มี (null)
type FollowUp = { label: string; due?: string; bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap };
function followUpOf(d: DocListItem): FollowUp | null {
  const att = (d.attachments ?? []).join(' ');
  const isWaitingTax = att.includes('รอใบกำกับภาษี 7%');
  const isReceivedTax = att.includes('ใบกำกับภาษี 7%') && !isWaitingTax;
  const hasAnyTaxReceiver = !!d.wh_tax_receiver || !!d.tax_receiver || !!d.acc_receiver;
  if (isReceivedTax && !hasAnyTaxReceiver) return { label: 'แนบใบกำกับภาษี', bg: '#065f46', fg: '#ffffff', icon: 'attach' };
  if (isReceivedTax || (isWaitingTax && !!d.acc_receiver)) return { label: 'รับใบกำกับแล้ว', bg: '#059669', fg: '#ffffff', icon: 'checkmark-circle' };
  if (isWaitingTax && d.finance_received_at) {
    const m = String(d.finance_received_at).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 30);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
    const dueShow = `${String(due.getDate()).padStart(2, '0')}/${String(due.getMonth() + 1).padStart(2, '0')}/${due.getFullYear()}`;
    if (d.payment_status === 'จ่ายแล้ว (Complete)') return { label: 'จ่ายแล้ว', due: dueShow, bg: '#d1fae5', fg: '#047857', icon: 'checkmark-done' };
    if (diff < 0) return { label: 'เกินกำหนด', due: dueShow, bg: '#dc2626', fg: '#ffffff', icon: 'alert-circle' };
    return { label: `เหลือ ${diff} วัน`, due: dueShow, bg: '#fef3c7', fg: '#b45309', icon: 'time-outline' };
  }
  return null;
}

function FollowUpBadge({ f, showDue = true }: { f: FollowUp; showDue?: boolean }) {
  return (
    <View style={{ alignItems: 'flex-end', gap: 3 }}>
      {showDue && !!f.due && <Text style={styles.followDueText}>{f.due}</Text>}
      <View style={[styles.followBadge, { backgroundColor: f.bg }]}>
        <Ionicons name={f.icon} size={11} color={f.fg} />
        <Text style={[styles.followBadgeText, { color: f.fg }]}>{f.label}</Text>
      </View>
    </View>
  );
}

// วันที่แบบเว็บใน "รายละเอียดเพิ่มเติม": DD/MM/YYYY HH:MM (ปี ค.ศ.)
function fmtDateTimeCE(s?: string | null): string {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m || m[1] === '0000') return '-';
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]} น.` : ''}`;
}

function docId(d: DocListItem): number {
  return Number(d.id ?? d.doc_id);
}

// ป้ายประเภทเอกสาร — ลำดับเดียวกับปุ่มประเภทในตารางเว็บ (DocumentDashboard.php:4757-4786)
// ตัดสินจากค่าใน attachments ตรง ๆ ("ใบกำกับภาษี 7%" = ได้ใบกำกับแล้ว แม้บัญชียังไม่กดรับ) ไม่เดาจากผู้รับ
type DocTypeTone = 'wait' | 'tax' | 'normal';
function docTypeLabel(d: DocListItem): { text: string; tone: DocTypeTone } {
  const att = (d.attachments ?? []).join(' ');
  if (att.includes('รอใบกำกับภาษี 7%')) return { text: 'รอใบกำกับฯ 7%', tone: 'wait' };
  if (att.includes('ใบกำกับภาษี 7%')) return { text: 'ใบกำกับภาษี 7%', tone: 'tax' };
  if (att.includes('ใบสำคัญจ่าย')) return { text: 'ใบสำคัญจ่าย', tone: 'normal' };
  if (att.includes('ใบเสร็จรับเงิน')) return { text: 'ใบเสร็จรับเงิน', tone: 'normal' };
  if (att.includes('ชุดชำระเงิน')) return { text: 'ชุดชำระเงิน', tone: 'normal' };
  if (att.includes('เคลียร์เงินทดรอง')) return { text: 'เคลียร์เงินทดรอง', tone: 'normal' };
  return { text: 'เอกสารทั่วไป', tone: 'normal' };
}

const CREDIT_OPTIONS = [15, 30, 45, 60, 90];
const DEPT_META: Record<
  DeptKey,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap; step: string; apiKey: TaxDeptApiKey; cancelPerm: keyof Perms }
> = {
  warehouse: { label: 'คลัง', color: '#d97706', icon: 'cube-outline', step: 'wh_tax', apiKey: 'wh', cancelPerm: 'can_cancel_receive_wh' },
  purchase: { label: 'จัดซื้อ', color: '#2563eb', icon: 'cart-outline', step: 'buyer_tax', apiKey: 'buyer', cancelPerm: 'can_cancel_receive_buyer' },
  accounting: { label: 'บัญชี', color: '#9333ea', icon: 'calculator-outline', step: 'acc_tax', apiKey: 'acc', cancelPerm: 'can_cancel_receive_acc' },
};
const TAX_SRC_LABEL: Record<TaxDeptApiKey, string> = { wh: 'คลัง', buyer: 'จัดซื้อ', acc: 'บัญชี' };

// รวมฟิลด์ของแต่ละแผนก (ผู้รับ/วันที่/เลขที่ใบกำกับ/ไฟล์แนบ/หมายเหตุ) ไว้จุดเดียว — ใช้ทั้งตอนแสดง
// การ์ดสรุปและตอนเปิด modal "ดูรายละเอียด" (deptDetailModal) กันข้อมูลไม่ตรงกัน 2 จุด
// บัญชีใช้เลขที่คอลัมน์ tax_invoice_no ร่วมกับจัดซื้อ (เว็บ :4480)
function deptFields(d: DocListItem, key: DeptKey) {
  if (key === 'warehouse') {
    return { receiver: d.wh_tax_receiver, receivedAt: d.wh_tax_received_at, invNos: arr(d.wh_tax_invoice_no), files: arr(d.wh_tax_files), note: d.wh_tax_note };
  }
  if (key === 'purchase') {
    return { receiver: d.tax_receiver, receivedAt: d.tax_received_at, invNos: arr(d.tax_invoice_no), files: arr(d.tax_files), note: d.note_buyer };
  }
  return { receiver: d.acc_receiver, receivedAt: d.acc_received_at, invNos: arr(d.tax_invoice_no), files: arr(d.acc_files), note: d.note_acc };
}

// คู่ไฟล์ ↔ เลขที่ใบกำกับของป๊อปอัพ "ดูรายละเอียด" — ใช้ tax_pairs จาก get_list (คงลำดับจริงในคอลัมน์)
// ถ้าไม่มี (ข้อมูลรุ่นเก่า) จับคู่ตามตำแหน่งจากรายการที่มี · บัญชีไม่มีไฟล์ของตัวเองใช้ของคลัง/จัดซื้อแทน (เว็บ :4479)
function deptPairs(d: DocListItem, key: DeptKey): TaxPair[] {
  const fromApi = d.tax_pairs?.[DEPT_META[key].apiKey];
  if (Array.isArray(fromApi)) return fromApi;
  const { invNos, files } = deptFields(d, key);
  const shownFiles = key === 'accounting' && files.length === 0 ? (arr(d.wh_tax_files).length ? arr(d.wh_tax_files) : arr(d.tax_files)) : files;
  const out: TaxPair[] = [];
  for (let i = 0; i < Math.max(shownFiles.length, invNos.length); i++) out.push({ file: shownFiles[i] ?? '', inv: invNos[i] ?? '' });
  return out;
}

function slipUrl(name: string) {
  return `${API_BASE}/uploads/payment_slips/${name}`;
}
// วัน/เวลาปัจจุบันของเครื่อง — ค่าเริ่มต้นของช่องวันที่คืนเงิน (เว็บตั้งเป็นตอนนี้ถ้ายังไม่เคยบันทึก)
function todayYmd(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function nowHm(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}
function refundUrl(name: string) {
  return `${API_BASE}/uploads/refunds/${name}`;
}
function rootUploadUrl(name: string) {
  return `${API_BASE}/uploads/${name}`;
}

// จำนวนวันเครดิตแบบคอลัมน์ "เครดิต" บนเว็บ (:4642-4653) — credit_term ถ้าว่างหาจากประเภทแนบที่มีคำว่า "เครดิต ... วัน"
function displayCreditTerm(d: DocListItem): number {
  const term = Number(d.credit_term ?? 0);
  if (term > 0) return term;
  for (const a of d.attachments ?? []) {
    if (a.includes('เครดิต') && a.includes('วัน')) return Number(a.replace(/[^0-9]/g, '')) || 0;
  }
  return 0;
}

// สถานะเครดิต (จำนวนวันคงเหลือ/วันครบกำหนด/สี) — พอร์ตตรงจาก DocumentDashboard.php:4654-4673
// ครบกำหนด = created_at + N วัน (คงเวลาเดิม) · เหลือกี่วัน = ปัดขึ้นจากเวลาจริงถึงตอนนี้ (ไม่ตัดเวลาทิ้ง)
// <=5 วันแดง, <=10 วันเหลือง, จ่ายแล้วเขียว
type CreditTone = 'paid' | 'danger' | 'warn' | 'normal';
function creditStatus(d: DocListItem): { term: number; diffDays: number; dueShow: string; isPaid: boolean; tone: CreditTone } | null {
  const term = displayCreditTerm(d);
  if (!term || !d.created_at) return null;
  const created = new Date(d.created_at.replace(' ', 'T'));
  if (isNaN(created.getTime())) return null;
  const due = new Date(created);
  due.setDate(due.getDate() + term);
  const diffDays = Math.ceil((due.getTime() - Date.now()) / 86400000);
  const dueShow = `${String(due.getDate()).padStart(2, '0')}/${String(due.getMonth() + 1).padStart(2, '0')}/${String(due.getFullYear()).slice(-2)}`;
  const isPaid = d.payment_status === 'จ่ายแล้ว (Complete)';
  const tone: CreditTone = isPaid ? 'paid' : diffDays <= 5 ? 'danger' : diffDays <= 10 ? 'warn' : 'normal';
  return { term, diffDays, dueShow, isPaid, tone };
}
const CREDIT_TONE_COLORS: Record<CreditTone, string> = { paid: '#059669', danger: '#ef4444', warn: '#d97706', normal: '#4f46e5' };
function openFile(url: string) {
  Linking.openURL(url).catch(() => Alert.alert('เปิดไฟล์ไม่ได้', url));
}

// สลิป/ไฟล์แนบรับได้หลายนามสกุล (pdf/xls/doc/zip ด้วย ไม่ใช่แค่รูป) — เปิดผ่านแอปนอกด้วย Linking
// ได้ผลจริงเฉพาะถ้าเครื่องมีแอปเปิดไฟล์นั้นและตั้งเบราว์เซอร์เริ่มต้นไว้ ซึ่งพังง่าย/ดูไม่ออกว่าพังจากอะไร
// รูปภาพเปิดในแอปตรงๆ ด้วย <Image> แทนเสมอ (ImagePreviewModal) เชื่อถือได้กว่ามาก
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'gif'];
function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.includes(extOf(name));
}

function extOf(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function checkExt(name: string, allowed?: string[]): boolean {
  if (!allowed || allowed.length === 0) return true;
  const ext = extOf(name);
  return allowed.map((e) => e.toLowerCase().replace(/^\./, '')).includes(ext);
}

async function pickImageAsset(source: 'camera' | 'library'): Promise<PickedFile | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('แจ้งเตือน', 'กรุณาอนุญาตการใช้กล้อง');
      return null;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return null;
    const uri = r.assets[0].uri;
    const ext = extOf(uri) || 'jpg';
    return { uri, name: `photo_${Date.now()}.${ext}`, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('แจ้งเตือน', 'กรุณาอนุญาตการเข้าถึงคลังรูป');
    return null;
  }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (r.canceled || !r.assets?.[0]) return null;
  const uri = r.assets[0].uri;
  const ext = extOf(uri) || 'jpg';
  return { uri, name: `photo_${Date.now()}.${ext}`, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
}

function askPickImage(cb: (f: PickedFile) => void) {
  Alert.alert('แนบไฟล์', 'เลือกวิธีแนบไฟล์', [
    { text: '📷 ถ่ายรูป', onPress: async () => { const f = await pickImageAsset('camera'); if (f) cb(f); } },
    { text: '🖼️ เลือกจากคลังรูป', onPress: async () => { const f = await pickImageAsset('library'); if (f) cb(f); } },
    { text: 'ยกเลิก', style: 'cancel' },
  ]);
}

// -------------------- Read fetchers --------------------

async function fetchMasterData(userId: string | number): Promise<MasterData> {
  const res = await apiMobileGet(DOCUMENT_API_URL, 'get_master_data', { user_id: userId });
  return res as unknown as MasterData;
}
// จำนวนแถวต่อหน้าของลิสต์ — 30 เท่าตารางเว็บ ($per_page ของ DocumentDashboard.php) และหน้าโครงการ/ลูกหนี้ในแอป
// เลื่อนถึงท้ายแล้วโหลดหน้าถัดไป (offset = จำนวนแถวที่โหลดมาแล้ว)
const PAGE_SIZE = 30;
type ListFilters = Record<string, string | number | undefined>;

async function fetchDashboard(userId: string | number, filters: ListFilters) {
  return apiMobileGet(DOCUMENT_API_URL, 'get_dashboard', { user_id: userId, ...filters });
}
async function fetchList(userId: string | number, filters: ListFilters, offset = 0) {
  return apiMobileGet(DOCUMENT_API_URL, 'get_list', { user_id: userId, ...filters, limit: PAGE_SIZE, offset });
}
// เอกสารใบเดียว (get_list + doc_id) — ได้แถวรูปแบบเดียวกับลิสต์ รวมคำขอค้าง/คู่ไฟล์ใบกำกับ
// doc = null แปลว่าไม่เข้าเงื่อนไขตัวกรองที่ส่งมาแล้ว หรือถูกยกเลิก (ลิสต์ปกติซ่อนเอกสารที่ยกเลิกเสมอ)
async function fetchOneDoc(userId: string | number, id: number, filters: ListFilters = {}) {
  const res = await apiMobileGet(DOCUMENT_API_URL, 'get_list', { user_id: userId, ...filters, doc_id: id, limit: 1, offset: 0 });
  const rows: DocListItem[] = (res as any).list ?? [];
  return { doc: rows.find((r) => docId(r) === id) ?? null, res };
}
// การ์ด "รายการยกเลิก (VOID)" — นับ/รวมยอดใน SQL แบบเว็บ (DocumentDashboard.php:3401-3421) ไม่บวกเองจากแถวที่โหลดมา
// เว็บกรองแค่ช่วงวันที่ (ต้องครบ 2 วัน) + บริษัท ไม่สนตัวกรองอื่น · ตัวเลขยังจำกัดตามสิทธิ์ view_all_docs เหมือนลิสต์ที่เปิดดูได้
async function fetchVoidSummary(userId: string | number, filters: ListFilters) {
  const p: ListFilters = { user_id: userId, status: 'cancelled', limit: 1, offset: 0 };
  if (filters.start_date && filters.end_date) {
    p.start_date = filters.start_date;
    p.end_date = filters.end_date;
  }
  if (filters.company_id) p.company_id = filters.company_id;
  const res = await apiMobileGet(DOCUMENT_API_URL, 'get_list', p);
  return { count: Number((res as any).total ?? 0), amount: Number((res as any).total_amount ?? 0) };
}
async function fetchHistory(userId: string | number, dId: number) {
  return apiMobileGet(DOCUMENT_API_URL, 'get_history', { user_id: userId, doc_id: dId, limit: 50, offset: 0 });
}

// -------------------- Write (form-urlencoded, no files) --------------------

async function apiApprove(userId: string | number, dId: number) {
  return apiMobilePost(DOCUMENT_API_URL, 'approve_document', { user_id: userId, doc_id: dId });
}
async function apiSaveNote(userId: string | number, dId: number, doc_note: string) {
  return apiMobilePost(DOCUMENT_API_URL, 'save_note', { user_id: userId, doc_id: dId, doc_note });
}
async function apiSaveTaxStatusNote(userId: string | number, dId: number, status_note_text: string) {
  return apiMobilePost(DOCUMENT_API_URL, 'save_tax_status_note', { user_id: userId, doc_id: dId, status_note_text });
}
async function apiUpdateReturnDocument(userId: string | number, dId: number, isReturning: boolean, remark: string) {
  return apiMobilePost(DOCUMENT_API_URL, 'update_return_document', { user_id: userId, doc_id: dId, is_returning: isReturning ? 1 : 0, return_remark: remark });
}
async function apiUpdateReturnTax(userId: string | number, dId: number, isReturning: boolean, remark: string) {
  return apiMobilePost(DOCUMENT_API_URL, 'update_return_tax', { user_id: userId, doc_id: dId, is_returning: isReturning ? 1 : 0, return_remark: remark });
}
async function apiUpdateCredit(userId: string | number, dId: number, creditTerm: number) {
  return apiMobilePost(DOCUMENT_API_URL, 'update_credit', { user_id: userId, doc_id: dId, credit_term: creditTerm });
}
async function apiUpdateBillPay(
  userId: string | number,
  dId: number,
  fields: { tax_invoice_no?: string; billing_doc_no?: string; billing_date?: string; payment_due_date?: string; payment_status?: string },
) {
  return apiMobilePost(DOCUMENT_API_URL, 'update_bill_pay', { user_id: userId, doc_id: dId, ...fields });
}
async function apiCancelDocument(userId: string | number, dId: number, cancel_reason: string) {
  return apiMobilePost(DOCUMENT_API_URL, 'cancel_document', { user_id: userId, doc_id: dId, cancel_reason });
}
async function apiReceiveWarehouse(userId: string | number, dId: number, warehouse_doc_no: string) {
  return apiMobilePost(DOCUMENT_API_URL, 'receive_warehouse', { user_id: userId, doc_id: dId, warehouse_doc_no });
}
async function apiSubmitDocRequest(userId: string | number, dId: number, requestType: 'edit' | 'cancel', remark: string) {
  return apiMobilePost(DOCUMENT_API_URL, 'submit_request', { user_id: userId, doc_id: dId, request_type: requestType, remark });
}
async function apiAcceptDocRequest(userId: string | number, requestId: number) {
  return apiMobilePost(DOCUMENT_API_URL, 'accept_request', { user_id: userId, request_id: requestId });
}
async function apiCancelStepReceive(userId: string | number, dId: number, step: string) {
  return apiMobilePost(DOCUMENT_API_URL, 'cancel_step_receive', { user_id: userId, doc_id: dId, step });
}
// ── ส่วนเสริมนอก AC (17 ต.ค. 69) — action ที่ปิดช่องว่างกับเว็บ ──
// ยกเลิกการรับของการเงิน: เฉพาะคนที่กดรับ ต้องมีหมายเหตุ (≤500) · สลิปไม่ลบ
async function apiCancelFinanceReceive(userId: string | number, dId: number, cancel_remark: string) {
  return apiMobilePost(DOCUMENT_API_URL, 'cancel_finance_receive', { user_id: userId, doc_id: dId, cancel_remark });
}
async function fetchFinanceCancelHistory(userId: string | number, dId: number) {
  return apiMobileGet(DOCUMENT_API_URL, 'get_finance_cancel_history', { user_id: userId, doc_id: dId });
}
// กู้คืนเอกสารที่ยกเลิก (btn_edit)
async function apiRestoreDocument(userId: string | number, dId: number) {
  return apiMobilePost(DOCUMENT_API_URL, 'restore_document', { user_id: userId, doc_id: dId });
}
// ไฟล์ที่ถูกลบของช่องเดียว (wh_tax_file / tax_file / acc_file) + กู้คืนทีละไฟล์
async function fetchFileTrash(userId: string | number, dId: number, column: string) {
  return apiMobileGet(DOCUMENT_API_URL, 'get_file_trash', { user_id: userId, doc_id: dId, column, show: 'pending' });
}
async function apiRestoreTrashFile(userId: string | number, trashId: number) {
  return apiMobilePost(DOCUMENT_API_URL, 'restore_trash_file', { user_id: userId, trash_id: trashId });
}
// สลิปแบบเว็บ (slip_files_managed=1): ส่งรายการไฟล์เดิมที่ยังเก็บไว้ครบทั้ง 2 ช่อง — ตัวที่ไม่ส่ง = ถูกลบ (ย้ายลงถังขยะ ไม่ลบไฟล์จริง)
// keep = null -> ไม่ได้กดลบอะไร: ไม่ส่ง managed เซิร์ฟเวอร์เก็บไฟล์เดิมทั้งหมดเอง (กันสลิปที่คนอื่นเพิ่งแนบหลุด)
async function apiSaveFinanceManaged(userId: string | number, dId: number, slipFiles: PickedFile[], fullFiles: PickedFile[], keep: { slip: string[]; full: string[] } | null) {
  const fd = new FormData();
  fd.append('action', 'save_finance');
  fd.append('user_id', String(userId));
  fd.append('doc_id', String(dId));
  if (keep) {
    fd.append('slip_files_managed', '1');
    keep.slip.forEach((n) => fd.append('existing_slip_files[]', n));
    keep.full.forEach((n) => fd.append('existing_slip_full_files[]', n));
  }
  slipFiles.forEach((f) => fd.append('slip_file[]', { uri: f.uri, name: f.name, type: f.type } as any));
  fullFiles.forEach((f) => fd.append('slip_full_file[]', { uri: f.uri, name: f.name, type: f.type } as any));
  return postFormData(fd);
}
// คอลัมน์ไฟล์ของแต่ละแผนก (ใช้กับ get_file_trash)
const DEPT_TRASH_COLUMN: Record<TaxDeptApiKey, string> = { wh: 'wh_tax_file', buyer: 'tax_file', acc: 'acc_file' };

// -------------------- Write (multipart — has file uploads) --------------------

async function postFormData(fd: FormData) {
  const res = await axios.post(DOCUMENT_API_URL, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  const data = res.data as any;
  if (data?.status !== 'success') throw new Error(data?.message || 'บันทึกไม่สำเร็จ');
  return data;
}

async function postMultipart(fields: Record<string, string | number | undefined>, files: { field: string; file: PickedFile }[]) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fd.append(k, String(v));
  });
  files.forEach(({ field, file }) => {
    fd.append(field, { uri: file.uri, name: file.name, type: file.type } as any);
  });
  return postFormData(fd);
}

// save_finance ใช้ apiSaveFinanceManaged (ด้านบน) — ป๊อปอัพสลิปลบไฟล์เดิมได้แบบเว็บแล้ว
// keepFiles = ไฟล์เดิมที่ยังเก็บไว้ ส่งกลับเป็น existing_refund_files[] แบบเว็บ (:887-891)
// ไฟล์เดิมตัวที่ไม่ได้ส่งกลับ = ถูกกดลบ (เซิร์ฟเวอร์ย้ายลงถังขยะ ไม่ลบไฟล์จริง) — ไม่ส่งเลยไฟล์เดิมจะหลุดหมด
async function apiSaveRefund(userId: string | number, dId: number, refund_note: string, refund_date: string, files: PickedFile[], keepFiles: string[]) {
  const fd = new FormData();
  fd.append('action', 'save_refund');
  fd.append('user_id', String(userId));
  fd.append('doc_id', String(dId));
  fd.append('refund_note', refund_note);
  fd.append('refund_date', refund_date);
  keepFiles.forEach((name) => fd.append('existing_refund_files[]', name));
  files.forEach((f) => fd.append('refund_files_upload[]', { uri: f.uri, name: f.name, type: f.type } as any));
  return postFormData(fd);
}
async function apiReceiveTaxDept(userId: string | number, dId: number, dept: DeptKey, invNos: string[], note: string, files: PickedFile[], keptSlots: TaxPair[] = [], shownSlots: TaxPair[] = []) {
  const action = dept === 'warehouse' ? 'receive_tax_warehouse' : dept === 'purchase' ? 'receive_tax_buyer' : 'receive_tax_acc';
  const fd = new FormData();
  fd.append('action', action);
  fd.append('user_id', String(userId));
  fd.append('doc_id', String(dId));
  const invField = dept === 'warehouse' ? 'wh_tax_inv_number[]' : 'tax_inv_number[]';
  invNos.forEach((n) => fd.append(invField, n));
  const noteField = dept === 'warehouse' ? 'wh_action_note' : 'action_note';
  fd.append(noteField, note);
  const fileField = dept === 'warehouse' ? 'wh_tax_file_upload[]' : dept === 'purchase' ? 'tax_file_upload[]' : 'acc_file_upload[]';
  files.forEach((f) => fd.append(fileField, { uri: f.uri, name: f.name, type: f.type } as any));
  // ช่องไฟล์เดิมที่ดึงมาจากแผนกอื่น (ไม่ต้องอัปโหลดซ้ำ) — ส่งไฟล์คู่กับเลขที่ตามลำดับแบบเว็บ (existing_files[] + existing_inv[])
  // ระบบจับคู่ไฟล์กับเลขที่ใบกำกับตามตำแหน่ง (ถังขยะ/กู้คืนไฟล์บนเว็บใช้คู่นี้) ช่องเดิมมาก่อน ตามด้วยเลขที่/ไฟล์ใหม่
  keptSlots.forEach((s) => {
    fd.append('existing_files[]', s.file);
    fd.append('existing_inv[]', s.inv);
  });
  // ช่องทั้งหมดที่ดึงมาแสดง (shown_files[] + shown_invs[] แบบเว็บ) — ช่องที่ถูกเอาออก ระบบจดลงถังของแผนกนี้
  // ป๊อปอัปครั้งหน้า (ทั้งแอปและเว็บ) จะได้ไม่ดึงไฟล์นั้นกลับมาให้อีก
  shownSlots.forEach((s) => {
    fd.append('shown_files[]', s.file);
    fd.append('shown_invs[]', s.inv);
  });
  return postFormData(fd);
}

// -------------------- AC (เคลียร์เงินทดรอง): รับใบกำกับ "รายกล่องร้านค้า" --------------------
// ช่อง 3 ฝ่ายของกล่อง — ป้าย/สี/สิทธิ์ยกเลิก ใช้ชุดเดียวกับ 3 แผนกของหัวเอกสาร (DEPT_META)
const AC_RECV_DEPTS: { key: TaxDeptApiKey; dept: DeptKey }[] = [
  { key: 'wh', dept: 'warehouse' },
  { key: 'buyer', dept: 'purchase' },
  { key: 'acc', dept: 'accounting' },
];
// แถวใหม่ในป๊อปอัปรับใบกำกับของกล่อง: เลขที่ + ไฟล์ (มีอย่างใดอย่างหนึ่งก็ได้ แบบช่องบนเว็บ)
interface AcNewRow {
  inv: string;
  file: PickedFile | null;
}
// ยิง receive_tax_* + ac_item_id (ชื่อช่องชุดเดิมของแต่ละฝ่าย) — เซิร์ฟเวอร์จับคู่ "เลขที่ช่อง i ↔ ไฟล์ช่อง i"
// ส่งแถวที่มีไฟล์ก่อน แล้วค่อยแถวที่มีแต่เลขที่ ลำดับไฟล์จึงตรงกับเลขที่เสมอ (แอปส่งช่องไฟล์ว่างไม่ได้)
// keep = คู่เลขที่/ไฟล์เดิมของกล่องที่ยังเก็บไว้ (existing_files[] + existing_inv[]) — ไม่ส่งคู่ไหน = เอาออก (ต้องมีสิทธิ์ยกเลิกการรับของฝ่ายนั้น)
async function apiAcItemReceive(userId: string | number, dId: number, itemId: number, key: TaxDeptApiKey, keep: TaxPair[], rows: AcNewRow[], note: string) {
  const fd = new FormData();
  fd.append('action', key === 'wh' ? 'receive_tax_warehouse' : key === 'buyer' ? 'receive_tax_buyer' : 'receive_tax_acc');
  fd.append('user_id', String(userId));
  fd.append('doc_id', String(dId));
  fd.append('ac_item_id', String(itemId));
  fd.append(key === 'wh' ? 'wh_action_note' : 'action_note', note);
  keep.forEach((p) => {
    fd.append('existing_files[]', p.file);
    fd.append('existing_inv[]', p.inv);
  });
  const invField = key === 'wh' ? 'wh_tax_inv_number[]' : 'tax_inv_number[]';
  const fileField = key === 'wh' ? 'wh_tax_file_upload[]' : key === 'buyer' ? 'tax_file_upload[]' : 'acc_file_upload[]';
  const filled = rows.filter((r) => r.inv.trim() !== '' || r.file);
  const ordered = [...filled.filter((r) => r.file), ...filled.filter((r) => !r.file)];
  ordered.forEach((r) => fd.append(invField, r.inv.trim()));
  ordered.forEach((r) => {
    if (r.file) fd.append(fileField, { uri: r.file.uri, name: r.file.name, type: r.file.type } as any);
  });
  return postFormData(fd);
}
async function apiAcItemCancelReceive(userId: string | number, dId: number, itemId: number, key: TaxDeptApiKey) {
  return apiMobilePost(DOCUMENT_API_URL, 'ac_item_cancel_receive', { user_id: userId, doc_id: dId, ac_item_id: itemId, dept: key });
}

// ====================================================================
// Main screen
// ====================================================================

export default function DocumentDashboardScreen({ onBack }: DocumentDashboardScreenProps) {
  const { user } = useAuth();
  // ใช้กับโมดัลรายละเอียดแบบเต็มจอ — SafeAreaView ภายใน <Modal> บน Android (edge-to-edge)
  // วัด inset ได้ 0 ทำให้ปุ่มย้อนกลับไปซ้อนใต้แถบสถานะจนกดไม่ได้ จึงอ่านค่าจากหน้าจอหลักแล้ว pad เอง
  const insets = useSafeAreaInsets();


  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [master, setMaster] = useState<MasterData | null>(null);
  const [kpiAll, setKpiAll] = useState<KpiAll | null>(null);
  const [kpiCompanies, setKpiCompanies] = useState<KpiCompany[]>([]);
  const [docs, setDocs] = useState<DocListItem[]>([]);
  // จำนวนเอกสารทั้งหมดตามตัวกรอง (total ของ get_list) — docs คือ "หน้าเดียว" ที่กำลังดูอยู่ (ไม่เกิน PAGE_SIZE)
  const [listTotal, setListTotal] = useState(0);
  // หน้าที่กำลังดู (เริ่ม 1) แบบแถบแบ่งหน้าของเว็บ — เปลี่ยนตัวกรองแล้วกลับหน้า 1 เสมอ
  const [page, setPage] = useState(1);
  const pageRef = useRef(1);
  const [pageLoading, setPageLoading] = useState(false);
  const listRef = useRef<FlatList<DocListItem>>(null);
  const [perms, setPerms] = useState<Perms>(DEFAULT_PERMS);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [cancelledAmount, setCancelledAmount] = useState(0);
  // ลำดับคำขอโหลดล่าสุด — เปลี่ยนตัวกรองเร็ว ๆ แล้วผลของคำขอเก่ามาถึงทีหลัง ต้องไม่ทับผลของคำขอใหม่
  const loadSeqRef = useRef(0);
  // ตัวกรองชุดที่ลิสต์ปัจจุบันโหลดมา — ใช้ต่อหน้าถัดไป/ดึงเอกสารใบเดียวหลังกดปุ่ม ให้ตรงชุดเดียวกัน
  const filtersRef = useRef<ListFilters>({});
  const docsRef = useRef<DocListItem[]>([]);
  docsRef.current = docs;

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | DocType>('all');

  const [specialFilter, setSpecialFilter] = useState<'none' | 'urgent' | 'overdue' | 'taxdone' | 'creditAlert'>('none');
  const [amountRange, setAmountRange] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  // กรองหลายบริษัทพร้อมกันได้ (company_id คั่นด้วย , ) — แตะการ์ดบริษัทเพื่อเพิ่ม/เอาออก เหมือนหน้าเว็บ
  const [selectedCompanies, setSelectedCompanies] = useState<number[]>([]);
  const [keywordFilter, setKeywordFilter] = useState('');
  const [creditStatusFilter, setCreditStatusFilter] = useState<CreditStatusFilter>('all');
  const [companiesOpen, setCompaniesOpen] = useState(false);
  const [expandedCompanies, setExpandedCompanies] = useState<number[]>([]);
  const [voidPanelOpen, setVoidPanelOpen] = useState(false);

  const [approveModal, setApproveModal] = useState<{ visible: boolean; doc?: DocListItem; saving?: boolean }>({ visible: false });
  // keepSlip/keepFull = สลิปเดิมที่ยังเก็บไว้ (undefined = ยังไม่ได้กดลบ ใช้ของเอกสาร) — กดลบได้แบบเว็บ ลงถังขยะตอนบันทึก
  const [financeModal, setFinanceModal] = useState<{ visible: boolean; doc?: DocListItem; slip: PickedFile[]; full: PickedFile[]; saving?: boolean; keepSlip?: string[]; keepFull?: string[] }>({ visible: false, slip: [], full: [] });
  // ดูรูปที่แนบไว้ (สลิป/พิสูจน์) ในแอปตรงๆ — แทนที่จะเด้งออกไปเบราว์เซอร์นอกด้วย Linking.openURL
  // ซึ่งพังง่ายถ้าเครื่องไม่มีเบราว์เซอร์เริ่มต้น หรือ intent picker ค้าง (ดูรูปแนบไม่ได้)
  const [imagePreview, setImagePreview] = useState<{ visible: boolean; url?: string }>({ visible: false });
  function viewAttachedFile(name: string, url: string) {
    if (isImageFile(name)) setImagePreview({ visible: true, url });
    else openFile(url);
  }
  const [noteModal, setNoteModal] = useState<{ visible: boolean; doc?: DocListItem; text: string; saving?: boolean }>({ visible: false, text: '' });
  const [returnModal, setReturnModal] = useState<{ visible: boolean; doc?: DocListItem; text: string; saving?: boolean }>({ visible: false, text: '' });
  const [returnTaxModal, setReturnTaxModal] = useState<{ visible: boolean; doc?: DocListItem; text: string; saving?: boolean }>({ visible: false, text: '' });
  const [creditModal, setCreditModal] = useState<{ visible: boolean; doc?: DocListItem; saving?: boolean }>({ visible: false });
  // คืนเงิน: วันที่ + เวลา (เว็บเลือกได้ทั้งคู่) · keepFiles = ไฟล์เดิมที่ยังเก็บไว้ (กดลบออกได้แบบเว็บ)
  const [refundModal, setRefundModal] = useState<{
    visible: boolean; doc?: DocListItem; date: string; time: string; note: string; files: PickedFile[]; keepFiles: string[]; saving?: boolean;
  }>({ visible: false, date: '', time: '', note: '', files: [], keepFiles: [] });
  // รับใบกำกับ: slots = ช่องไฟล์เดิมของแผนกอื่นที่ดึงมารอ (tax_recv_defaults) · keep[i] = ยังเก็บช่องนั้นไว้
  const [deptModal, setDeptModal] = useState<{
    visible: boolean; doc?: DocListItem; dept?: DeptKey; invNo: string; note: string; files: PickedFile[]; slots: TaxSlot[]; keep: boolean[]; saving?: boolean;
    // ส่วนเสริมนอก AC: edit = เปิดจาก "แก้ไขข้อมูล" ของแผนกที่ลงรับแล้ว (slots = tax_edit_slots มีไฟล์ของตัวเองด้วย)
    edit?: boolean;
  }>({ visible: false, invNo: '', note: '', files: [], slots: [], keep: [] });
  // "ดูรายละเอียด" ของแต่ละแผนกที่รับใบกำกับแล้ว — โชว์ไฟล์แนบจริง (กดดูรูปได้) แทน Alert ข้อความล้วน
  const [deptDetailModal, setDeptDetailModal] = useState<{ visible: boolean; doc?: DocListItem; dept?: DeptKey }>({ visible: false });
  const [historyModal, setHistoryModal] = useState<{ visible: boolean; doc?: DocListItem; logs: HistoryLog[]; loading: boolean }>({ visible: false, logs: [], loading: false });
  // หมายเหตุสถานะใบกำกับภาษี — action save_tax_status_note จริง (คนละคอลัมน์กับ doc_note ทั่วไป)
  const [statusNoteModal, setStatusNoteModal] = useState<{ visible: boolean; doc?: DocListItem; text: string; saving: boolean }>({ visible: false, text: '', saving: false });
  const [cancelModal, setCancelModal] = useState<{ visible: boolean; doc?: DocListItem; reason: string; saving?: boolean }>({ visible: false, reason: '' });
  const [docRequestModal, setDocRequestModal] = useState<{ visible: boolean; doc?: DocListItem; requestType: 'edit' | 'cancel'; remark: string; saving?: boolean }>({ visible: false, requestType: 'edit', remark: '' });
  const [acceptingReqId, setAcceptingReqId] = useState<number | null>(null);
  const [warehouseModal, setWarehouseModal] = useState<{ visible: boolean; doc?: DocListItem; docNo: string; saving?: boolean }>({ visible: false, docNo: '' });
  // taxInvoiceNoOrig = ค่าที่เติมไว้ตอนเปิด — ไม่ได้แก้ช่องนี้ = ไม่ส่งไป (เลขที่ใบกำกับที่ฝ่ายอื่นลงรับไว้จะไม่ถูกทับ)
  const [billPayModal, setBillPayModal] = useState<{
    visible: boolean; doc?: DocListItem; taxInvoiceNo: string; taxInvoiceNoOrig: string; billingDocNo: string; billingDate: string; paymentDueDate: string; paymentStatus: string; saving?: boolean;
  }>({ visible: false, taxInvoiceNo: '', taxInvoiceNoOrig: '', billingDocNo: '', billingDate: '', paymentDueDate: '', paymentStatus: '' });
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  // ใช้ SubmitDocumentScreen ทั้งสร้างใหม่ (docId undefined) และแก้ไขเอกสารเดิม (มี docId ส่งเข้าไป
  // ให้ SubmitDocumentScreen โหลด get_detail มาเติมฟอร์มเอง — isEditMode ในไฟล์นั้น)
  const [submitScreen, setSubmitScreen] = useState<{ visible: boolean; docId?: string }>({ visible: false });
  // หน้ารายละเอียดเอกสาร (เดิมทุกอย่างอยู่ในการ์ดเดียวยาวเกิน 2 จอ) — การ์ดในลิสต์เหลือแค่สรุป
  // แตะการ์ดแล้วเปิดโมดัลนี้เต็มจอแทน รวม logic/handler เดิมทั้งหมดไว้เหมือนเดิม แค่ย้ายตำแหน่ง JSX
  const [detailModal, setDetailModal] = useState<{ visible: boolean; doc?: DocListItem }>({ visible: false });
  // เมนู "⋯" ในหน้ารายละเอียด — รวมปุ่มที่ทำลาย/ย้อนสถานะข้อมูล (ตีกลับ x2, ยกเลิกเอกสาร) ไว้ที่เดียว
  // แทนปุ่มแดงที่กระจายอยู่ทั่วหน้า (ทุกตัวยังเปิดโมดัลที่ต้องกรอกเหตุผลก่อนยืนยันเหมือนเดิม)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  // ── ส่วนเสริมนอก AC (17 ต.ค. 69) — state/handler ของปุ่มที่เพิ่มให้ตรงกับเว็บ ──
  // ยกเลิกการรับของการเงิน (หมายเหตุบังคับ · เฉพาะคนที่กดรับ) + ประวัติยกเลิกการรับ (DocumentDashboard.php:4050-4164)
  const [finCancelModal, setFinCancelModal] = useState<{ visible: boolean; doc?: DocListItem; remark: string; saving?: boolean }>({ visible: false, remark: '' });
  const [finHistoryModal, setFinHistoryModal] = useState<{ visible: boolean; doc?: DocListItem; rows: FinCancelRow[]; loading: boolean; error?: string }>({ visible: false, rows: [], loading: false });
  // "ไฟล์ที่ถูกลบ" ของแผนกที่เปิด "ดูรายละเอียด" อยู่ — โหลดเฉพาะคนมีสิทธิ์ยกเลิกการรับของแผนกนั้น (js viewTaxDetails :1688)
  const [deptTrash, setDeptTrash] = useState<{ key: string; rows: TrashRow[]; loading: boolean; error?: string; restoringId?: number }>({ key: '', rows: [], loading: false });
  const [restoringDoc, setRestoringDoc] = useState(false);

  // ปุ่ม "รับทราบ" คำขอ — เว็บรับทราบได้จากกระดิ่งของผู้ได้รับแจ้งเตือนคำขอนั้นเท่านั้น (API ใหม่ส่ง can_accept_request ต่อแถว)
  function canAcceptRequest(d: DocListItem): boolean {
    if (d.can_accept_request !== undefined) return truthy(d.can_accept_request);
    return perms.can_edit_document; // API รุ่นก่อน (ยังไม่มีคีย์) — เกณฑ์เดิมของแอป
  }

  async function confirmFinCancel() {
    const doc = finCancelModal.doc;
    if (!doc || !user) return;
    const remark = finCancelModal.remark.trim();
    if (!remark) {
      Alert.alert('กรุณาใส่หมายเหตุ', 'ใส่หมายเหตุก่อนยกเลิกการรับ');
      return;
    }
    setFinCancelModal((s) => ({ ...s, saving: true }));
    try {
      await apiCancelFinanceReceive(user.id, docId(doc), remark);
      setFinCancelModal({ visible: false, remark: '' });
      refreshAfterAction(docId(doc));
      Alert.alert('ยกเลิกการรับแล้ว', 'สลิปเดิมยังอยู่ ลงรับใหม่ได้');
    } catch (e: any) {
      Alert.alert('ยกเลิกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setFinCancelModal((s) => ({ ...s, saving: false }));
    }
  }

  function openFinHistory(d: DocListItem) {
    if (!user) return;
    setFinHistoryModal({ visible: true, doc: d, rows: [], loading: true });
    fetchFinanceCancelHistory(user.id, docId(d))
      .then((res: any) => setFinHistoryModal({ visible: true, doc: d, rows: Array.isArray(res?.rows) ? res.rows : [], loading: false }))
      .catch((e: any) => setFinHistoryModal({ visible: true, doc: d, rows: [], loading: false, error: e?.message || 'โหลดประวัติไม่สำเร็จ' }));
  }

  // กู้คืนเอกสารที่ยกเลิก (btn_edit) — แบบปุ่ม "กู้คืนรายการ" ของแถวยกเลิกบนเว็บ (:4735-4742)
  function askRestoreDocument(d: DocListItem) {
    if (!user || restoringDoc) return;
    if (!perms.can_restore_document) {
      Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์กู้คืนรายการ');
      return;
    }
    Alert.alert('กู้คืนรายการ', `กู้คืน ${d.doc_type} ${d.doc_number ?? ''} กลับมาใช้งาน?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'กู้คืน',
        onPress: async () => {
          setRestoringDoc(true);
          try {
            await apiRestoreDocument(user.id, docId(d));
            await refreshAfterAction(docId(d));
            Alert.alert('กู้คืนแล้ว', 'รายการกลับมาตามสถานะเดิม');
          } catch (e: any) {
            Alert.alert('กู้คืนไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
          } finally {
            setRestoringDoc(false);
          }
        },
      },
    ]);
  }

  function loadDeptTrash(doc: DocListItem, dept: DeptKey) {
    if (!user) return;
    const apiKey = DEPT_META[dept].apiKey;
    const key = `${docId(doc)}|${apiKey}`;
    setDeptTrash({ key, rows: [], loading: true });
    fetchFileTrash(user.id, docId(doc), DEPT_TRASH_COLUMN[apiKey])
      .then((res: any) => setDeptTrash((s) => (s.key === key ? { key, rows: Array.isArray(res?.rows) ? res.rows : [], loading: false } : s)))
      .catch((e: any) => setDeptTrash((s) => (s.key === key ? { key, rows: [], loading: false, error: e?.message || 'โหลดไฟล์ที่ถูกลบไม่สำเร็จ' } : s)));
  }
  const deptTrashAllowed = !!deptDetailModal.dept && perms[DEPT_META[deptDetailModal.dept].cancelPerm];
  const deptTrashKey =
    deptDetailModal.visible && deptDetailModal.doc && deptDetailModal.dept ? `${docId(deptDetailModal.doc)}|${DEPT_META[deptDetailModal.dept].apiKey}` : '';
  useEffect(() => {
    if (!deptTrashKey || !deptTrashAllowed || !deptDetailModal.doc || !deptDetailModal.dept) return;
    loadDeptTrash(deptDetailModal.doc, deptDetailModal.dept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptTrashKey, deptTrashAllowed]);

  // กู้คืนไฟล์จากถังขยะกลับเข้าช่องของแผนกนี้ — ขั้นตอนต้องลงรับอยู่ (เซิร์ฟเวอร์เช็ค) แล้วโหลดเอกสาร+ถังขยะใหม่
  function askRestoreTrash(row: TrashRow) {
    const doc = deptDetailModal.doc;
    const dept = deptDetailModal.dept;
    if (!user || !doc || !dept || deptTrash.restoringId) return;
    Alert.alert('กู้คืนไฟล์', `${row.invoice_no ? `เลขที่ ${row.invoice_no} · ` : ''}กลับเข้าช่อง${DEPT_META[dept].label}?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'กู้คืน',
        onPress: async () => {
          setDeptTrash((s) => ({ ...s, restoringId: row.id }));
          try {
            await apiRestoreTrashFile(user.id, row.id);
            await refreshAfterAction(docId(doc));
            loadDeptTrash(doc, dept);
          } catch (e: any) {
            setDeptTrash((s) => ({ ...s, restoringId: undefined }));
            Alert.alert('กู้คืนไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
          }
        },
      },
    ]);
  }

  // ป๊อปอัปที่ส่ง "ไฟล์เดิมที่เก็บไว้" กลับไป (สลิป/รับใบกำกับ/กล่อง AC) ต้องเปิดจากข้อมูลสด — แถวในลิสต์อาจเก่า
  // อีกคนแนบไฟล์ทางเว็บระหว่างนั้น -> ไฟล์นั้นไม่อยู่ในรายการที่ส่งกลับ = เซิร์ฟเวอร์นับว่าถูกลบ
  const openingFreshRef = useRef(false);
  async function loadFreshDoc(d: DocListItem): Promise<DocListItem | null> {
    if (!user || openingFreshRef.current) return null;
    openingFreshRef.current = true;
    try {
      const { doc: fresh } = await fetchOneDoc(user.id, docId(d));
      if (!fresh) {
        Alert.alert('เปิดไม่ได้', 'ไม่พบเอกสารนี้แล้ว (อาจถูกยกเลิก)');
        return null;
      }
      setDocs((prev) => prev.map((x) => (docId(x) === docId(fresh) ? fresh : x)));
      setDetailModal((s) => (s.visible && s.doc && docId(s.doc) === docId(fresh) ? { ...s, doc: fresh } : s));
      return fresh;
    } catch (e: any) {
      Alert.alert('โหลดข้อมูลไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      return null;
    } finally {
      openingFreshRef.current = false;
    }
  }

  // "แก้ไขข้อมูล" ของแผนกที่ลงรับแล้ว — เปิดป๊อปอัพรับใบกำกับเดิมพร้อมไฟล์ของแผนกนั้น + ไฟล์ของแผนกอื่นที่ยังไม่ถูกปฏิเสธ (:4310-4529)
  async function openDeptEdit(d: DocListItem, key: DeptKey) {
    if (!perms.can_receive_tax) {
      Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์รับใบกำกับภาษี');
      return;
    }
    setDeptDetailModal({ visible: false });
    // iOS เปิด Modal ใหม่ระหว่างที่อีกตัวกำลังปิดไม่ขึ้น (กดแล้วเงียบ) — รอปิดเสร็จ พร้อมดึงข้อมูลสดไปด้วย
    const [fresh] = await Promise.all([loadFreshDoc(d), new Promise((r) => setTimeout(r, 400))]);
    if (!fresh) return;
    const { receiver, note } = deptFields(fresh, key);
    if (!receiver) {
      Alert.alert('แก้ไขไม่ได้', `${DEPT_META[key].label}ถูกยกเลิกการรับไปแล้ว`);
      return;
    }
    const slots = fresh.tax_edit_slots?.[DEPT_META[key].apiKey] ?? [];
    setDeptModal({ visible: true, doc: fresh, dept: key, invNo: '', note: note ?? '', files: [], slots, keep: slots.map(() => true), edit: true });
  }
  // เอาไฟล์เดิมของแผนกตัวเองออกต้องมีสิทธิ์ยกเลิกการรับของแผนกนั้น (เว็บโชว์กุญแจแทนปุ่มลบ) — ไฟล์ที่ดึงจากแผนกอื่นเอาออกได้เสมอ
  function toggleDeptSlot(i: number) {
    const slot = deptModal.slots[i];
    const dept = deptModal.dept;
    if (dept && slot && truthy(slot.own) && deptModal.keep[i] && !perms[DEPT_META[dept].cancelPerm]) {
      Alert.alert('เอาออกไม่ได้', `ไม่มีสิทธิ์ลบไฟล์เดิมของ${DEPT_META[dept].label}`);
      return;
    }
    setDeptModal((s) => ({ ...s, keep: s.keep.map((k, j) => (j === i ? !k : k)) }));
  }
  // ตัวเลือกสถานะการจ่ายเงินจาก get_master_data (ชุดเดียวกับ select ของเว็บ) — API รุ่นก่อนส่งเป็นสตริง ใช้ชุดในแอปแทน
  const paymentStatusOptions: { value: string; label: string }[] =
    Array.isArray(master?.payment_status_options) &&
    master!.payment_status_options.length > 0 &&
    master!.payment_status_options.every((o: any) => o && typeof o.value === 'string' && typeof o.label === 'string')
      ? master!.payment_status_options
      : PAYMENT_STATUS_OPTIONS;

  // ป๊อปอัพ "แจ้งเตือนให้แนบสลิป" (ปุ่มติ๊ก ✓ ข้างกล่องการเงินรับเอกสาร) — get_slip_remind_info / notify_slip / notify_slip_clear
  const [slipRemind, setSlipRemind] = useState<{
    visible: boolean; doc?: DocListItem; loading: boolean; saving: boolean;
    normal: boolean; full: boolean; hasNormal: boolean; hasFull: boolean;
    pendingNormal: number; pendingFull: number; names: string[]; docLabel: string;
  }>({ visible: false, loading: false, saving: false, normal: false, full: false, hasNormal: false, hasFull: false, pendingNormal: 0, pendingFull: 0, names: [], docLabel: '' });

  async function openSlipRemind(d: DocListItem) {
    if (!user?.id) return;
    const hasNormal = arr(d.slip_files).length > 0;
    const hasFull = arr(d.slip_full_files).length > 0;
    setSlipRemind({
      visible: true, doc: d, loading: true, saving: false,
      // ยังไม่แนบ -> ติ๊กไว้ให้ก่อน, แนบแล้ว -> ไม่ติ๊ก (เตือนซ้ำได้ถ้าต้องการให้แก้)
      normal: !hasNormal, full: !hasFull, hasNormal, hasFull,
      pendingNormal: 0, pendingFull: 0, names: [], docLabel: `${d.doc_type} ${d.doc_number ?? ''}`.trim(),
    });
    try {
      const res = await apiMobileGet(DOCUMENT_API_URL, 'get_slip_remind_info', { user_id: user.id, doc_id: docId(d) });
      setSlipRemind((st) => ({
        ...st,
        loading: false,
        hasNormal: !!res.has_normal,
        hasFull: !!res.has_full,
        pendingNormal: Number(res.pending?.normal ?? 0),
        pendingFull: Number(res.pending?.full ?? 0),
        names: Array.isArray(res.target_names) ? res.target_names.map(String) : [],
        docLabel: String(res.doc_label || st.docLabel),
      }));
    } catch (e: any) {
      setSlipRemind((st) => ({ ...st, loading: false }));
      Alert.alert('โหลดข้อมูลไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  async function sendSlipRemind() {
    const d = slipRemind.doc;
    if (!d || !user?.id) return;
    if (!slipRemind.normal && !slipRemind.full) return Alert.alert('กรุณาเลือก', 'เลือกอย่างน้อย 1 รายการที่ต้องการแจ้งเตือน');
    setSlipRemind((st) => ({ ...st, saving: true }));
    try {
      const res = await apiMobilePost(DOCUMENT_API_URL, 'notify_slip', {
        user_id: user.id, doc_id: docId(d), slip_normal: slipRemind.normal ? 1 : 0, slip_full: slipRemind.full ? 1 : 0,
      });
      setSlipRemind((st) => ({ ...st, visible: false, saving: false }));
      Alert.alert('ส่งแจ้งเตือนแล้ว', res?.message || 'ส่งแจ้งเตือนเรียบร้อย');
    } catch (e: any) {
      setSlipRemind((st) => ({ ...st, saving: false }));
      Alert.alert('ส่งแจ้งเตือนไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  async function clearSlipRemind() {
    const d = slipRemind.doc;
    if (!d || !user?.id) return;
    setSlipRemind((st) => ({ ...st, saving: true }));
    try {
      const res = await apiMobilePost(DOCUMENT_API_URL, 'notify_slip_clear', { user_id: user.id, doc_id: docId(d) });
      setSlipRemind((st) => ({ ...st, saving: false, pendingNormal: 0, pendingFull: 0 }));
      Alert.alert('ยกเลิกแจ้งเตือน', res?.message || 'เรียบร้อย');
    } catch (e: any) {
      setSlipRemind((st) => ({ ...st, saving: false }));
      Alert.alert('ยกเลิกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    }
  }

  // render ทั้งที่ root และในโมดัลรายละเอียด — ตัวที่เปิดขึ้นจริงขึ้นกับว่ากดจากที่ไหน (Android ซ้อนโมดัลตามลำดับ render)
  function renderSlipRemindModal(where: 'root' | 'detail') {
    const visible = slipRemind.visible && (where === 'detail' ? detailModal.visible : !detailModal.visible);
    const close = () => setSlipRemind((st) => ({ ...st, visible: false }));
    const names = slipRemind.names;
    const who = names.length <= 5 ? names.join(', ') : `${names.slice(0, 5).join(', ')} และอีก ${names.length - 5} คน`;
    const opts = [
      { key: 'normal' as const, label: 'แนบสลิปปกติ', has: slipRemind.hasNormal, pending: slipRemind.pendingNormal, checked: slipRemind.normal },
      { key: 'full' as const, label: 'แนบสลิปเต็ม', has: slipRemind.hasFull, pending: slipRemind.pendingFull, checked: slipRemind.full },
    ];
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.srOverlay}>
          <View style={styles.srSheet}>
            <Text style={styles.srTitle}>🔔 แจ้งเตือนให้แนบสลิป</Text>
            {slipRemind.loading ? (
              <ActivityIndicator color="#4f46e5" style={{ paddingVertical: 30 }} />
            ) : (
              <>
                {opts.map((o) => (
                  <TouchableOpacity
                    key={o.key}
                    activeOpacity={0.8}
                    style={[styles.srOption, o.has ? styles.srOptionDone : styles.srOptionTodo]}
                    onPress={() => setSlipRemind((st) => ({ ...st, [o.key]: !st[o.key] }))}
                  >
                    <View style={[styles.srCheck, o.checked && styles.srCheckOn]}>
                      {o.checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.srOptionTitle}>{o.label}</Text>
                      <Text style={styles.srOptionSub}>
                        {o.has ? '✅ แนบแล้ว — เตือนอีกครั้งได้ถ้าต้องการให้แก้ไข' : '⏳ ยังไม่แนบ'}
                        {o.pending > 0 ? `  ·  🔔 ค้างแจ้งเตือน ${o.pending}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}

                <View style={styles.srInfo}>
                  <Text style={styles.srInfoLine}>
                    <Ionicons name="paper-plane" size={12} color="#475569" /> ส่งถึง: <Text style={styles.srInfoStrong}>ผู้มีสิทธิ์ {names.length} คน</Text>
                  </Text>
                  {names.length > 0 ? (
                    <Text style={styles.srInfoNames}>{who}</Text>
                  ) : (
                    <Text style={[styles.srInfoNames, { color: '#dc2626' }]}>ยังไม่มีใครได้รับสิทธิ์ "รับแจ้งเตือนให้แนบสลิป"</Text>
                  )}
                  <Text style={[styles.srInfoLine, { marginTop: 10 }]}>
                    <Ionicons name="document-text" size={12} color="#475569" /> เอกสาร: {slipRemind.docLabel || '-'}
                  </Text>
                  <Text style={styles.srInfoLine}>
                    <Ionicons name="hourglass" size={12} color="#475569" /> แจ้งเตือนจะค้างในกระดิ่ง และเด้งซ้ำทุก 30 นาที จนกว่าจะแนบสลิปจริง
                  </Text>
                </View>
              </>
            )}

            <View style={styles.srBtnRow}>
              <TouchableOpacity
                style={[styles.srBtn, { backgroundColor: '#4f46e5' }, (slipRemind.saving || slipRemind.loading) && { opacity: 0.6 }]}
                disabled={slipRemind.saving || slipRemind.loading}
                onPress={sendSlipRemind}
              >
                <Text style={styles.srBtnText}>{slipRemind.saving ? 'กำลังส่ง...' : 'ส่งแจ้งเตือน'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.srBtn, { backgroundColor: '#f59e0b' }, (slipRemind.saving || slipRemind.loading) && { opacity: 0.6 }]}
                disabled={slipRemind.saving || slipRemind.loading}
                onPress={clearSlipRemind}
              >
                <Text style={styles.srBtnText}>ยกเลิกที่ค้าง</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.srBtn, { backgroundColor: '#94a3b8' }]} onPress={close}>
                <Text style={styles.srBtnText}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }
  // ปุ่ม "รายละเอียดเพิ่มเติม" ในส่วนข้อมูลเอกสาร — พับไว้ก่อน เปิดเอกสารใหม่ทุกครั้งเริ่มแบบพับ
  // (ผูกกับ id ไม่ใช่ตัวออบเจกต์ — หลังกดปุ่มทำรายการ snapshot ถูกแทนด้วยข้อมูลสด ไม่ต้องพับกลับ)
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const detailDocKey = detailModal.visible && detailModal.doc ? docId(detailModal.doc) : 0;
  useEffect(() => {
    setMoreInfoOpen(false);
  }, [detailDocKey]);
  // ตัวกรองทั้งหมด (วันที่/ยอดเงิน/ประเภท/ตัวกรองพิเศษ) ย้ายเข้า bottom sheet — เดิมกางเต็มหัวจอเกือบทั้งหน้า
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // -------------------- Load --------------------

  // ช่วงวันที่ใช้กรองจริงเมื่อเลือกครบทั้ง 2 วันเท่านั้น — เว็บกรองแบบเดียวกัน (DocumentDashboard.php:2221)
  // เลือกวันเดียวยังไม่ส่งไปเซิร์ฟเวอร์ (ไม่โหลดใหม่เปล่า ๆ) และชิปบอกว่ายังไม่กรอง
  const dateRangeReady = !!startDateFilter && !!endDateFilter;
  const appliedStartDate = dateRangeReady ? startDateFilter : '';
  const appliedEndDate = dateRangeReady ? endDateFilter : '';

  const buildFilters = useCallback((): ListFilters => {
    const f: ListFilters = {};
    if (docTypeFilter !== 'all') f.doc_type = docTypeFilter;
    if (stageFilter !== 'all') f.status = stageFilter;
    if (amountRange !== 'all') f.amount_range = amountRange;
    if (search.trim()) f.search_all = search.trim();
    if (appliedStartDate && appliedEndDate) {
      f.start_date = appliedStartDate;
      f.end_date = appliedEndDate;
    }
    if (specialFilter === 'urgent') f.filter_urgent = 1;
    if (specialFilter === 'overdue') f.filter_overdue = 1;
    if (specialFilter === 'taxdone') f.filter_taxdone = 1;
    if (specialFilter === 'creditAlert') f.filter_credit_alert = 1;
    if (selectedCompanies.length > 0) f.company_id = selectedCompanies.join(',');
    if (keywordFilter) f.filter_keyword = keywordFilter;
    if (creditStatusFilter !== 'all') f.filter_credit_status = creditStatusFilter;
    return f;
  }, [docTypeFilter, stageFilter, amountRange, search, appliedStartDate, appliedEndDate, specialFilter, selectedCompanies, keywordFilter, creditStatusFilter]);

  // สิทธิ์ปุ่มจากคำตอบของ action อ่าน (ทุกตัวแนบผลสิทธิ์มาด้วย)
  function permsFrom(res: any): Perms {
    return {
      can_view_all_docs: truthy(res?.can_view_all_docs),
      can_edit_document: truthy(res?.can_edit_document),
      can_return_document: truthy(res?.can_return_document),
      can_approve: truthy(res?.can_approve),
      can_save_finance: truthy(res?.can_save_finance),
      can_save_note: truthy(res?.can_save_note),
      can_update_credit: truthy(res?.can_update_credit),
      can_update_bill_pay: truthy(res?.can_update_bill_pay),
      can_cancel_document: truthy(res?.can_cancel_document),
      can_save_refund: truthy(res?.can_save_refund),
      can_receive_warehouse: truthy(res?.can_receive_warehouse),
      can_receive_tax: truthy(res?.can_receive_tax),
      can_cancel_receive_wh: truthy(res?.can_cancel_receive_wh),
      can_cancel_receive_buyer: truthy(res?.can_cancel_receive_buyer),
      can_cancel_receive_acc: truthy(res?.can_cancel_receive_acc),
      can_restore_document: truthy(res?.can_restore_document),
    };
  }

  // การ์ดสรุป (KPI รวม + รายบริษัท) และการ์ด VOID
  function applySummary(dash: any, voidSum: { count: number; amount: number }) {
    setKpiAll(dash?.kpi_all ?? null);
    // เว็บโชว์ชื่อเต็มบนการ์ดบริษัท (company_name ของ API เป็นชื่อย่อถ้ามี) จึงใช้ company_full_name ก่อน
    const byCompany: any[] = Array.isArray(dash?.kpi_by_company) ? dash.kpi_by_company : [];
    setKpiCompanies(
      byCompany.map((c) => ({ id: Number(c.company_id), name: String(c.company_full_name || c.company_name || '-'), kpi: c as KpiAll })),
    );
    setCancelledCount(voidSum.count);
    setCancelledAmount(voidSum.amount);
  }

  // โหลดการ์ดสรุป + "หน้า" ที่ต้องการของลิสต์ (หน้าละ PAGE_SIZE แบบตารางเว็บ) — ไม่ส่งหน้า = หน้า 1
  const load = useCallback(async (targetPage: number = 1) => {
    if (!user) return;
    const seq = ++loadSeqRef.current;
    const filters = buildFilters();
    try {
      const [dash, list, voidSum] = await Promise.all([
        fetchDashboard(user.id, filters),
        fetchList(user.id, filters, (targetPage - 1) * PAGE_SIZE),
        fetchVoidSummary(user.id, filters),
      ]);
      if (seq !== loadSeqRef.current) return; // มีคำขอใหม่กว่าแล้ว (เปลี่ยนตัวกรองระหว่างรอ) — ทิ้งผลชุดเก่า
      const total = Number((list as any).total ?? 0);
      // หน้าที่ขอเกินหน้าสุดท้าย (เช่น เอกสารลดลงระหว่างดูหน้าท้าย ๆ) -> ไปหน้าสุดท้ายที่มีจริงแทน
      const lastPage = pageCount(total, PAGE_SIZE);
      if (targetPage > lastPage && total > 0) {
        void load(lastPage);
        return;
      }
      filtersRef.current = filters;
      applySummary(dash, voidSum);
      const rows: DocListItem[] = (list as any).list ?? [];
      setDocs(rows);
      setListTotal(total || rows.length);
      pageRef.current = targetPage;
      setPage(targetPage);
      setPerms(permsFrom(list));
      // หน้ารายละเอียดที่เปิดค้างอยู่ใช้แถวชุดใหม่ด้วย (ถ้ายังอยู่ในลิสต์)
      setDetailModal((s) => {
        if (!s.visible || !s.doc) return s;
        const fresh = rows.find((x) => docId(x) === docId(s.doc!));
        return fresh ? { ...s, doc: fresh } : s;
      });
    } catch (e: any) {
      if (seq !== loadSeqRef.current) return;
      Alert.alert('โหลดข้อมูลไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
        setPageLoading(false);
      }
    }
  }, [user, buildFilters]);

  // แถบแบ่งหน้า (ListPager) -> เปลี่ยนหน้า: เลื่อนกลับไปแถวแรกของรายการ แล้วโหลดหน้านั้น
  function goToPage(p: number) {
    if (p === pageRef.current) return;
    setPageLoading(true);
    try {
      listRef.current?.scrollToIndex({ index: 0, animated: true, viewPosition: 0 });
    } catch {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    void load(p);
  }

  // แก้ฟิลด์ของเอกสารใบเดียวทั้งในลิสต์และหน้ารายละเอียด (ใช้ค่าที่เซิร์ฟเวอร์ตอบกลับมาเท่านั้น)
  function patchDoc(id: number, patch: Partial<DocListItem>) {
    setDocs((prev) => prev.map((x) => (docId(x) === id ? { ...x, ...patch } : x)));
    setDetailModal((s) => (s.visible && s.doc && docId(s.doc) === id ? { ...s, doc: { ...s.doc, ...patch } } : s));
  }

  // หลังกดปุ่มทำรายการ: ดึงเอกสารใบนั้นใบเดียวมาใหม่ แทนการโหลดลิสต์ใหม่ทั้งก้อน (หน้าที่เลื่อนโหลดไว้ไม่หลุดกลับหน้าแรก)
  //  - ยังเข้าเงื่อนไขตัวกรองของลิสต์ -> แทนแถวเดิม · ไม่เข้าแล้ว (เช่น อนุมัติตอนกรอง "รออนุมัติ") -> เอาออกจากลิสต์
  //  - หน้ารายละเอียดที่เปิดอยู่ได้ข้อมูลสดเสมอ (ปุ่มที่ทำไปแล้วหายไปเอง กันกดซ้ำ) · ถูกยกเลิก/มองไม่เห็นแล้ว -> ปิดหน้ารายละเอียด
  //  - ตัวเลขการ์ดสรุป/การ์ด VOID โหลดใหม่ด้วย
  async function refreshAfterAction(id: number) {
    if (!user) return;
    const seq = loadSeqRef.current;
    const filters = filtersRef.current;
    try {
      const [inList, dash, voidSum] = await Promise.all([
        fetchOneDoc(user.id, id, filters),
        fetchDashboard(user.id, filters),
        fetchVoidSummary(user.id, filters),
      ]);
      // หลุดจากตัวกรองแล้ว -> ถามอีกรอบแบบไม่มีตัวกรอง (ลิสต์ปกติ) ว่ายังเห็นเอกสารนี้อยู่ไหม
      const fresh = inList.doc ?? (await fetchOneDoc(user.id, id)).doc;
      if (seq !== loadSeqRef.current) return; // ระหว่างนี้ตัวกรองเปลี่ยน — load() ชุดใหม่จัดการแล้ว
      applySummary(dash, voidSum);
      setPerms(permsFrom(inList.res));
      const wasInList = docsRef.current.some((x) => docId(x) === id);
      setDocs((prev) => (inList.doc ? prev.map((x) => (docId(x) === id ? inList.doc! : x)) : prev.filter((x) => docId(x) !== id)));
      if (wasInList && !inList.doc) setListTotal((t) => Math.max(0, t - 1));
      setDetailModal((s) => {
        if (!s.visible || !s.doc || docId(s.doc) !== id) return s;
        return fresh ? { ...s, doc: fresh } : { visible: false };
      });
      if (!fresh) setMoreMenuOpen(false);
    } catch {
      load(pageRef.current); // ดึงใบเดียวไม่สำเร็จ -> โหลดหน้าที่ดูอยู่ใหม่ทั้งหน้าแทน
    }
  }

  useEffect(() => {
    if (!user) return;
    fetchMasterData(user.id).then(setMaster).catch(() => {});
  }, [user]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      load();
    }, 350);
    return () => clearTimeout(t);
  }, [load]);

  // ตัวจับรอบแรกกันโหลดซ้ำตอนเมานต์: effect ด้านบนยิง load() (debounce 350ms) อยู่แล้วตอนเมานต์
  // ครั้งแรกนับเป็น "focus" ครั้งแรกด้วยเสมอ ถ้าไม่กันไว้จะยิง get_dashboard/get_list ซ้ำ 2 รอบ
  const hasFocusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      load(pageRef.current); // กลับเข้าหน้านี้ -> อยู่หน้าเดิม ไม่เด้งกลับหน้า 1
    }, [load]),
  );

  // ออกจากหน้านี้ (สลับไปเมนูอื่นใน drawer) แล้วกลับเข้ามาใหม่ -> รีเซ็ตกลับหน้ารายการหลักเสมอ
  // ไม่งั้น drawer จะคง submitScreen เดิมไว้ (ค้างอยู่หน้าเพิ่ม/แก้ไขเอกสาร) เพราะสกรีนไม่ได้ unmount ตอนสลับแท็บ
  useFocusEffect(
    useCallback(() => {
      return () => {
        setSubmitScreen({ visible: false });
        setDetailModal({ visible: false });
        setMoreMenuOpen(false);
        setFilterSheetOpen(false);
      };
    }, [])
  );

  function onRefresh() {
    setRefreshing(true);
    load(pageRef.current);
  }

  function resetAllFilters() {
    setSearch('');
    setStageFilter('all');
    setDocTypeFilter('all');
    setSpecialFilter('none');
    setAmountRange('all');
    setStartDateFilter('');
    setEndDateFilter('');
    setSelectedCompanies([]);
    setKeywordFilter('');
    setCreditStatusFilter('all');
    setVoidPanelOpen(false);
  }

  // -------------------- Action handlers (real API) --------------------

  async function confirmApprove() {
    const doc = approveModal.doc;
    if (!doc || !user) return;
    setApproveModal((s) => ({ ...s, saving: true }));
    try {
      const res = await apiApprove(user.id, docId(doc));
      setApproveModal({ visible: false });
      // ใส่ผู้อนุมัติจากคำตอบเซิร์ฟเวอร์ทันที แล้วค่อยดึงใบนี้ใหม่ — ปุ่ม "อนุมัติ" หายเลย กันกดซ้ำระหว่างรอ
      // (เว็บเองไม่กันอนุมัติซ้ำ action 'approve' เขียนทับชื่อ/เวลาเสมอ จึงต้องกันที่หน้าจอ)
      patchDoc(docId(doc), { approver_name: String(res.approver_name ?? user.fullname ?? ''), approved_at: String(res.approved_at ?? ''), is_approved: 1 });
      refreshAfterAction(docId(doc));
    } catch (e: any) {
      Alert.alert('อนุมัติไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setApproveModal((s) => ({ ...s, saving: false }));
    }
  }

  // ป๊อปอัปการเงินเปิดจากข้อมูลสด — รายการสลิปเดิม (ปุ่มลบ) ต้องตรงกับที่อยู่ในเอกสารตอนนี้
  async function openFinanceModal(d: DocListItem) {
    const fresh = await loadFreshDoc(d);
    if (fresh) setFinanceModal({ visible: true, doc: fresh, slip: [], full: [] });
  }

  async function confirmFinance() {
    const { doc, slip, full } = financeModal;
    if (!doc || !user) return;
    // ไม่บังคับแนบสลิป — การเงินกดรับเอกสารก่อนแล้วค่อยแนบสลิปทีหลังได้ (เหมือนเว็บ / backend ไม่ได้บังคับ)
    // แต่ถ้ารับไปแล้วและไม่ได้เลือกไฟล์ใหม่ = ไม่มีอะไรเปลี่ยน -> ปิดเฉยๆ ไม่ยิง API
    // (กัน save_finance เขียนชื่อผู้รับเอกสารทับเป็นคนที่กดล่าสุด)
    const alreadyReceived = truthy(doc.is_finance_received) || !!doc.finance_receiver;
    // สลิปเดิมที่กดลบ (กดลบออกได้แบบเว็บ) — ตัวที่ลบ = ลงถังขยะ
    const keepSlip = financeModal.keepSlip ?? arr(doc.slip_files);
    const keepFull = financeModal.keepFull ?? arr(doc.slip_full_files);
    const removedSlip = arr(doc.slip_files).filter((f) => !keepSlip.includes(f));
    const removedFull = arr(doc.slip_full_files).filter((f) => !keepFull.includes(f));
    const removedCount = removedSlip.length + removedFull.length;
    if (slip.length === 0 && full.length === 0 && removedCount === 0 && alreadyReceived) {
      setFinanceModal({ visible: false, slip: [], full: [] });
      return;
    }
    setFinanceModal((s) => ({ ...s, saving: true }));
    try {
      // มีการลบ -> ส่งรายการที่เก็บไว้จากข้อมูลสดตอนกดบันทึก (เอาออกเฉพาะตัวที่กดลบ) สลิปที่คนอื่นเพิ่งแนบไม่หลุด
      let keep: { slip: string[]; full: string[] } | null = null;
      if (removedCount > 0) {
        const { doc: fresh } = await fetchOneDoc(user.id, docId(doc));
        if (!fresh) throw new Error('ไม่พบเอกสารนี้แล้ว (อาจถูกยกเลิก)');
        keep = {
          slip: arr(fresh.slip_files).filter((f) => !removedSlip.includes(f)),
          full: arr(fresh.slip_full_files).filter((f) => !removedFull.includes(f)),
        };
      }
      await apiSaveFinanceManaged(user.id, docId(doc), slip, full, keep);
      setFinanceModal({ visible: false, slip: [], full: [] });
      refreshAfterAction(docId(doc));
      const added = slip.length + full.length > 0;
      Alert.alert(
        'บันทึกสำเร็จ',
        added ? 'ลงรับเอกสาร/แนบสลิปเรียบร้อย' : removedCount > 0 ? 'ลบสลิปเรียบร้อย' : 'ลงรับเอกสารเรียบร้อย — แนบสลิปเพิ่มทีหลังได้'
      );
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setFinanceModal((s) => ({ ...s, saving: false }));
    }
  }

  async function confirmNote() {
    const doc = noteModal.doc;
    if (!doc || !user) return;
    setNoteModal((s) => ({ ...s, saving: true }));
    try {
      await apiSaveNote(user.id, docId(doc), noteModal.text);
      setNoteModal({ visible: false, text: '' });
      refreshAfterAction(docId(doc));
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setNoteModal((s) => ({ ...s, saving: false }));
    }
  }

  async function confirmReturn() {
    const doc = returnModal.doc;
    if (!doc || !user) return;
    const isReturned = truthy(doc.is_returned);
    if (!isReturned && !returnModal.text.trim()) {
      Alert.alert('กรุณาระบุหมายเหตุ', 'ต้องกรอกเหตุผลที่ตีกลับเอกสารก่อนยืนยัน');
      return;
    }
    setReturnModal((s) => ({ ...s, saving: true }));
    try {
      await apiUpdateReturnDocument(user.id, docId(doc), !isReturned, returnModal.text.trim());
      setReturnModal({ visible: false, text: '' });
      refreshAfterAction(docId(doc));
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setReturnModal((s) => ({ ...s, saving: false }));
    }
  }

  async function confirmReturnTax() {
    const doc = returnTaxModal.doc;
    if (!doc || !user) return;
    const isReturned = truthy(doc.is_tax_returned);
    if (!isReturned && !returnTaxModal.text.trim()) {
      Alert.alert('กรุณาระบุหมายเหตุ', 'ต้องกรอกเหตุผลที่ตีกลับใบกำกับภาษีก่อนยืนยัน');
      return;
    }
    setReturnTaxModal((s) => ({ ...s, saving: true }));
    try {
      await apiUpdateReturnTax(user.id, docId(doc), !isReturned, returnTaxModal.text.trim());
      setReturnTaxModal({ visible: false, text: '' });
      refreshAfterAction(docId(doc));
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setReturnTaxModal((s) => ({ ...s, saving: false }));
    }
  }

  async function confirmCredit(days: number) {
    const doc = creditModal.doc;
    if (!doc || !user) return;
    setCreditModal((s) => ({ ...s, saving: true }));
    try {
      await apiUpdateCredit(user.id, docId(doc), days);
      setCreditModal({ visible: false });
      refreshAfterAction(docId(doc));
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setCreditModal((s) => ({ ...s, saving: false }));
    }
  }

  // เปิดป๊อปอัพคืนเงิน — เคยบันทึกแล้ว: วัน/เวลา/รายละเอียด/ไฟล์เดิมตามที่บันทึกไว้ · ยังไม่เคย: วัน-เวลาปัจจุบัน (เหมือนเว็บ)
  function openRefundModal(d: DocListItem) {
    const at = String(d.refund_at ?? '').match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
    setRefundModal({
      visible: true,
      doc: d,
      date: at ? at[1] : todayYmd(),
      time: at ? at[2] ?? '00:00' : nowHm(),
      note: d.refund_note ?? '',
      files: [],
      keepFiles: arr(d.refund_files),
    });
  }

  async function confirmRefund() {
    const doc = refundModal.doc;
    if (!doc || !user) return;
    if (!refundModal.date.trim()) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุวันที่คืนเงิน');
      return;
    }
    setRefundModal((s) => ({ ...s, saving: true }));
    try {
      // ส่งวัน + เวลา "Y-m-d H:i" แบบเว็บ (flatpickr enableTime) — เดิมส่งแค่วันที่ เวลาเลยกลายเป็น 00:00
      const refundAt = `${refundModal.date} ${refundModal.time || '00:00'}`;
      await apiSaveRefund(user.id, docId(doc), refundModal.note.trim(), refundAt, refundModal.files, refundModal.keepFiles);
      setRefundModal({ visible: false, date: '', time: '', note: '', files: [], keepFiles: [] });
      refreshAfterAction(docId(doc));
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setRefundModal((s) => ({ ...s, saving: false }));
    }
  }

  // เปิดป๊อปอัพรับใบกำกับครั้งแรกของแผนก — ช่องไฟล์เดิมที่ดึงมารอใช้ชุดเดียวกับเว็บ (tax_recv_defaults จาก get_list)
  // คลัง: ไม่ดึงของใคร · จัดซื้อ: ของคลัง · บัญชี: ของคลัง ถ้าคลังไม่มีใช้ของจัดซื้อ (ทุกช่องติดเลขที่ใบกำกับคู่กันมาด้วย)
  async function openDeptReceive(d: DocListItem, key: DeptKey) {
    const fresh = await loadFreshDoc(d);
    if (!fresh) return;
    if (deptFields(fresh, key).receiver) {
      Alert.alert('ลงรับแล้ว', `${DEPT_META[key].label}ลงรับไปแล้ว`);
      return;
    }
    const slots = fresh.tax_recv_defaults?.[DEPT_META[key].apiKey] ?? [];
    setDeptModal({ visible: true, doc: fresh, dept: key, invNo: '', note: '', files: [], slots, keep: slots.map(() => true) });
  }

  async function confirmDeptReceive() {
    const { doc, dept, invNo, note, files, slots, keep, edit } = deptModal;
    if (!doc || !dept || !user) return;
    const invNos = invNo.split(',').map((s) => s.trim()).filter(Boolean);
    const keptSlots = slots.filter((_, i) => keep[i]);
    // รับครั้งแรก: ต้องมีเลขที่อย่างน้อย 1 เลข — นับเลขที่ที่ติดมากับช่องไฟล์เดิมด้วย ไม่ต้องพิมพ์ซ้ำ
    // แก้ไขข้อมูล: เว็บไม่บังคับเลขที่ (แผนกที่รับแบบมีแต่ไฟล์ต้องแก้หมายเหตุ/เอาไฟล์ออกได้) · เซิร์ฟเวอร์บังคับไฟล์ ≥ 1 เอง
    if (!edit && invNos.length === 0 && !keptSlots.some((s) => s.inv.trim() !== '')) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุเลขที่ใบกำกับอย่างน้อย 1 เลข');
      return;
    }
    setDeptModal((s) => ({ ...s, saving: true }));
    try {
      await apiReceiveTaxDept(user.id, docId(doc), dept, invNos, note.trim(), files, keptSlots, slots);
      setDeptModal({ visible: false, invNo: '', note: '', files: [], slots: [], keep: [] });
      refreshAfterAction(docId(doc));
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setDeptModal((s) => ({ ...s, saving: false }));
    }
  }

  // ยกเลิกการรับใบกำกับ — สิทธิ์แยกรายแผนก (can_cancel_receive_wh/_buyer/_acc) · ไฟล์ไม่ลบจริง ย้ายลงถังขยะ กู้คืนได้ที่เว็บ
  function askCancelStepReceive(doc: DocListItem, dept: DeptKey) {
    if (!user) return;
    const meta = DEPT_META[dept];
    if (!perms[meta.cancelPerm]) {
      Alert.alert('ไม่มีสิทธิ์', `คุณไม่มีสิทธิ์ยกเลิกการรับของ${meta.label}`);
      return;
    }
    Alert.alert(`ยกเลิกการรับใบกำกับ (${meta.label})`, 'ข้อมูลและไฟล์ของขั้นนี้จะถูกเคลียร์ (กู้คืนไฟล์ได้ที่ "ดูรายละเอียด") ยืนยันหรือไม่?', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ยืนยัน',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiCancelStepReceive(user.id, docId(doc), meta.step);
            refreshAfterAction(docId(doc));
          } catch (e: any) {
            Alert.alert('ยกเลิกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
          }
        },
      },
    ]);
  }

  // -------------------- AC (เคลียร์เงินทดรอง): รับ/ยกเลิกรับใบกำกับรายกล่องร้านค้า --------------------
  // ป๊อปอัปรับใบกำกับของกล่อง (เปิดจากหน้ารายละเอียด) — เปิดซ้ำเมื่อรับแล้ว = "ดูรายละเอียด" แก้ไขได้แบบเว็บ (acItemReceive)
  // keep[i] = ยังเก็บคู่เลขที่/ไฟล์เดิมช่องที่ i (เอาออกได้เฉพาะคนมีสิทธิ์ยกเลิกการรับของฝ่ายนั้น) · rows = แถวใหม่
  const [acRecv, setAcRecv] = useState<{
    visible: boolean; doc?: DocListItem; item?: AcItem; key?: TaxDeptApiKey; keep: boolean[]; rows: AcNewRow[]; note: string; saving?: boolean;
  }>({ visible: false, keep: [], rows: [], note: '' });
  // ดูรูปในป๊อปอัปรับใบกำกับของกล่อง — เปิดซ้อนในป๊อปอัปนั้นเอง (ไม่งั้นรูปไปเปิดอยู่ใต้ป๊อปอัป)
  const [acPreviewUrl, setAcPreviewUrl] = useState('');
  // รายชื่อร้านค้าทุกกล่องของเอกสาร AC (ชิป "N รายการร้านค้า" บนการ์ด) — openSupplierPopup() บนเว็บ
  const [acShops, setAcShops] = useState<{ visible: boolean; doc?: DocListItem; q: string }>({ visible: false, q: '' });

  async function openAcReceive(d: DocListItem, it: AcItem, key: TaxDeptApiKey) {
    if (!perms.can_receive_tax) {
      Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์รับใบกำกับภาษี');
      return;
    }
    // คู่เลขที่/ไฟล์ของกล่องต้องเป็นชุดล่าสุด — ตัวที่ไม่ได้ส่งกลับ เซิร์ฟเวอร์นับว่าถูกเอาออก
    const fresh = await loadFreshDoc(d);
    if (!fresh) return;
    const item = (fresh.ac_items ?? []).find((x) => x.id === it.id);
    if (!item) {
      Alert.alert('เปิดไม่ได้', 'ไม่พบรายการนี้แล้ว (อาจถูกแก้ไข)');
      return;
    }
    setAcRecv({
      visible: true,
      doc: fresh,
      item,
      key,
      keep: (item.tax_pairs ?? []).map(() => true),
      rows: [{ inv: '', file: null }],
      note: item.receipts?.[key]?.note ?? '',
    });
  }

  async function confirmAcReceive() {
    const { doc, item, key, keep, rows, note } = acRecv;
    if (!doc || !item || !key || !user) return;
    const pairs = item.tax_pairs ?? [];
    // คู่เดิมที่มีไฟล์ = ส่งกลับตามที่เลือก · คู่ที่มีแต่เลขที่ เซิร์ฟเวอร์คงไว้เองเสมอ
    const kept = pairs.filter((p, i) => !!p.file && keep[i]);
    const newRows = rows.filter((r) => r.inv.trim() !== '' || r.file);
    if (kept.length === 0 && newRows.length === 0 && !pairs.some((p) => !p.file && !!p.inv)) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'ใส่เลขที่ใบกำกับหรือแนบไฟล์อย่างน้อย 1 รายการ');
      return;
    }
    setAcRecv((s) => ({ ...s, saving: true }));
    try {
      await apiAcItemReceive(user.id, docId(doc), item.id, key, kept, newRows, note.trim());
      setAcRecv({ visible: false, keep: [], rows: [], note: '' });
      refreshAfterAction(docId(doc));
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setAcRecv((s) => ({ ...s, saving: false }));
    }
  }

  // ยกเลิกการรับของฝ่ายหนึ่งในกล่อง — สิทธิ์รายแผนกชุดเดียวกับหัวเอกสาร (btn_cancel_receive_*) · เลขที่/ไฟล์ของกล่องไม่ลบ
  function askAcCancelReceive(d: DocListItem, it: AcItem, key: TaxDeptApiKey, dept: DeptKey) {
    if (!user) return;
    const meta = DEPT_META[dept];
    if (!perms[meta.cancelPerm]) {
      Alert.alert('ไม่มีสิทธิ์', `คุณไม่มีสิทธิ์ยกเลิกการรับของ${meta.label}`);
      return;
    }
    Alert.alert(`ยกเลิก${meta.label}รับใบกำกับ`, `รายการที่ ${it.line_no}: ${it.supplier_name}\nเลขที่/ไฟล์ใบกำกับของรายการนี้ยังอยู่`, [
      { text: 'ปิด', style: 'cancel' },
      {
        text: 'ยืนยัน',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiAcItemCancelReceive(user.id, docId(d), it.id, key);
            refreshAfterAction(docId(d));
          } catch (e: any) {
            Alert.alert('ยกเลิกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
          }
        },
      },
    ]);
  }

  async function confirmCancelDocument() {
    const doc = cancelModal.doc;
    if (!doc || !user) return;
    if (!cancelModal.reason.trim()) {
      Alert.alert('กรุณาระบุเหตุผล', 'ต้องกรอกเหตุผลที่ยกเลิกเอกสารก่อนยืนยัน');
      return;
    }
    setCancelModal((s) => ({ ...s, saving: true }));
    try {
      await apiCancelDocument(user.id, docId(doc), cancelModal.reason.trim());
      setCancelModal({ visible: false, reason: '' });
      // เอกสารที่ยกเลิกแล้วทำอะไรต่อไม่ได้ — ปิดหน้ารายละเอียดเลย ไม่ค้างหน้าที่ยังมีปุ่มครบ
      setMoreMenuOpen(false);
      setDetailModal((s) => (s.doc && docId(s.doc) === docId(doc) ? { visible: false } : s));
      refreshAfterAction(docId(doc));
      Alert.alert('ยกเลิกเอกสารแล้ว', 'ดูได้ที่ "ประวัติการยกเลิก"');
    } catch (e: any) {
      Alert.alert('ยกเลิกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setCancelModal((s) => ({ ...s, saving: false }));
    }
  }

  async function confirmStatusNote() {
    const doc = statusNoteModal.doc;
    if (!doc || !user) return;
    setStatusNoteModal((s) => ({ ...s, saving: true }));
    try {
      await apiSaveTaxStatusNote(user.id, docId(doc), statusNoteModal.text.trim());
      setStatusNoteModal({ visible: false, text: '', saving: false });
      refreshAfterAction(docId(doc));
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setStatusNoteModal((s) => ({ ...s, saving: false }));
    }
  }

  async function confirmDocRequest() {
    const doc = docRequestModal.doc;
    if (!doc || !user) return;
    if (!docRequestModal.remark.trim()) {
      Alert.alert('กรุณากรอกเหตุผล', 'โปรดระบุเหตุผลที่ขอแก้ไข/ยกเลิก');
      return;
    }
    setDocRequestModal((s) => ({ ...s, saving: true }));
    try {
      await apiSubmitDocRequest(user.id, docId(doc), docRequestModal.requestType, docRequestModal.remark.trim());
      setDocRequestModal({ visible: false, requestType: 'edit', remark: '' });
      Alert.alert('ส่งคำขอแล้ว', 'แจ้งผู้มีสิทธิ์อนุมัติเรียบร้อย');
      refreshAfterAction(docId(doc));
    } catch (e: any) {
      Alert.alert('ส่งคำขอไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setDocRequestModal((s) => ({ ...s, saving: false }));
    }
  }

  async function acceptDocRequest(d: DocListItem) {
    const requestId = Number(d.pending_request_id ?? 0);
    if (!user || !requestId || acceptingReqId !== null) return;
    setAcceptingReqId(requestId);
    try {
      await apiAcceptDocRequest(user.id, requestId);
      refreshAfterAction(docId(d));
    } catch (e: any) {
      Alert.alert('รับทราบไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setAcceptingReqId(null);
    }
  }

  async function confirmWarehouseReceive() {
    const doc = warehouseModal.doc;
    if (!doc || !user) return;
    // ช่องบังคับแบบเว็บ (required ในฟอร์มคลังรับสินค้า)
    if (!warehouseModal.docNo.trim()) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณากรอกเลขที่เอกสารรับของ');
      return;
    }
    setWarehouseModal((s) => ({ ...s, saving: true }));
    try {
      await apiReceiveWarehouse(user.id, docId(doc), warehouseModal.docNo.trim());
      setWarehouseModal({ visible: false, docNo: '' });
      refreshAfterAction(docId(doc));
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setWarehouseModal((s) => ({ ...s, saving: false }));
    }
  }

  // เปิดป๊อปอัพบิล/จ่ายเงิน — เติมค่าเดิมทุกช่องแบบเว็บ (js/DocumentDashboard.js:702) รวมเลขที่ใบกำกับเป็นค่าดิบในคอลัมน์
  function openBillPay(d: DocListItem) {
    const invs = arr(d.tax_invoice_no);
    const taxRaw = d.tax_invoice_no_raw ?? (invs.length ? JSON.stringify(invs) : '');
    setBillPayModal({
      visible: true,
      doc: d,
      taxInvoiceNo: taxRaw,
      taxInvoiceNoOrig: taxRaw,
      billingDocNo: d.billing_doc_no ?? '',
      billingDate: d.billing_date ?? '',
      paymentDueDate: d.payment_due_date ?? '',
      paymentStatus: d.payment_status ?? '',
    });
  }

  async function confirmBillPay() {
    const doc = billPayModal.doc;
    if (!doc || !user) return;
    setBillPayModal((s) => ({ ...s, saving: true }));
    try {
      await apiUpdateBillPay(user.id, docId(doc), {
        // ส่งเลขที่ใบกำกับเฉพาะตอนแก้ช่องนี้จริง — คอลัมน์เดียวกับที่จัดซื้อ/บัญชีลงรับ ห้ามทับด้วยค่าที่ไม่ได้ตั้งใจ
        tax_invoice_no: billPayModal.taxInvoiceNo !== billPayModal.taxInvoiceNoOrig ? billPayModal.taxInvoiceNo.trim() : undefined,
        billing_doc_no: billPayModal.billingDocNo.trim(),
        billing_date: billPayModal.billingDate,
        payment_due_date: billPayModal.paymentDueDate,
        payment_status: billPayModal.paymentStatus,
      });
      setBillPayModal({ visible: false, taxInvoiceNo: '', taxInvoiceNoOrig: '', billingDocNo: '', billingDate: '', paymentDueDate: '', paymentStatus: '' });
      refreshAfterAction(docId(doc));
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setBillPayModal((s) => ({ ...s, saving: false }));
    }
  }

  function openHistory(doc: DocListItem) {
    setHistoryModal({ visible: true, doc, logs: [], loading: true });
    if (!user) return;
    fetchHistory(user.id, docId(doc))
      .then((res) => setHistoryModal({ visible: true, doc, logs: (res as any).logs ?? [], loading: false }))
      .catch(() => setHistoryModal({ visible: true, doc, logs: [], loading: false }));
  }

  // -------------------- Render helpers --------------------

  const kpis = kpiAll;

  // ตัวกรองที่อยู่ใน bottom sheet และกำลังใช้งานอยู่ — โชว์เป็น chip เล็กใต้แถบค้นหา กด ✕ เพื่อลบทีละตัว
  // (ชิปสถานะ 4 ตัวในส่วนสรุปไม่นับซ้ำ เพราะเห็นสถานะ "เลือกอยู่" ตรงนั้นอยู่แล้ว)
  const AMOUNT_LABEL: Record<'low' | 'medium' | 'high', string> = { low: '0 - 10,000', medium: '10,001 - 100,000', high: '100,001 ขึ้นไป' };
  const SPECIAL_LABEL: Record<'urgent' | 'overdue' | 'taxdone' | 'creditAlert', string> = {
    urgent: 'งานต้องตาม',
    overdue: 'เกินกำหนดติดตาม',
    taxdone: 'รับใบกำกับแล้ว',
    creditAlert: 'เครดิตใกล้หมด',
  };
  const activeFilterChips: { key: string; label: string; clear: () => void }[] = [];
  if (startDateFilter || endDateFilter) {
    activeFilterChips.push({
      key: 'date',
      // เลือกวันเดียว = ยังไม่กรอง (เว็บกรองช่วงวันที่เมื่อครบ 2 วันเท่านั้น) — บอกตรง ๆ บนชิป
      label: `${startDateFilter ? formatShortThaiDate(startDateFilter) : '...'} – ${endDateFilter ? formatShortThaiDate(endDateFilter) : '...'}${dateRangeReady ? '' : ' (ยังไม่กรอง)'}`,
      clear: () => {
        setStartDateFilter('');
        setEndDateFilter('');
      },
    });
  }
  if (amountRange !== 'all') activeFilterChips.push({ key: 'amount', label: `฿ ${AMOUNT_LABEL[amountRange]}`, clear: () => setAmountRange('all') });
  if (docTypeFilter !== 'all') activeFilterChips.push({ key: 'type', label: docTypeFilter, clear: () => setDocTypeFilter('all') });
  if (specialFilter !== 'none') activeFilterChips.push({ key: 'special', label: SPECIAL_LABEL[specialFilter], clear: () => setSpecialFilter('none') });
  if (stageFilter === 'returned') activeFilterChips.push({ key: 'returned', label: 'ตีกลับ (แก้ไข)', clear: () => setStageFilter('all') });
  if (stageFilter === 'cancelled') activeFilterChips.push({ key: 'cancelled', label: 'ยกเลิกแล้ว', clear: () => setStageFilter('all') });
  selectedCompanies.forEach((cid) => {
    const name = kpiCompanies.find((c) => c.id === cid)?.name ?? `บริษัท #${cid}`;
    activeFilterChips.push({ key: `company-${cid}`, label: name, clear: () => setSelectedCompanies((list) => list.filter((x) => x !== cid)) });
  });
  if (keywordFilter) {
    const label = DOC_BREAKDOWN.find((b) => b.keyword === keywordFilter)?.label ?? keywordFilter;
    activeFilterChips.push({ key: 'keyword', label, clear: () => setKeywordFilter('') });
  }
  if (creditStatusFilter !== 'all') {
    activeFilterChips.push({
      key: 'credit',
      label: creditStatusFilter === 'paid' ? 'เครดิต: จ่ายแล้ว' : 'เครดิต: ค้างจ่าย',
      clear: () => setCreditStatusFilter('all'),
    });
  }

  // แถบค้นหา + ปุ่มตัวกรอง + ปุ่มเพิ่มเอกสาร — วางนอก FlatList จึงติดค้างด้านบนเสมอขณะเลื่อนรายการ
  // (แทนแถบหัวเดิมที่มีแค่ปุ่มเพิ่มเอกสาร + ช่องค้นหาที่จมอยู่กลางกองตัวกรอง)
  function renderTopBar() {
    return (
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color="#0f172a" />
            </TouchableOpacity>
          )}
          <View style={styles.topBarSearch}>
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput style={styles.searchInput} placeholder="ค้นหาเลขเอกสาร/ซัพพลายเออร์..." placeholderTextColor="#94a3b8" value={search} onChangeText={setSearch} />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color="#cbd5e1" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.topBarBtn, activeFilterChips.length > 0 && styles.topBarBtnActive]}
            accessibilityLabel="ตัวกรอง"
            onPress={() => setFilterSheetOpen(true)}
          >
            <Ionicons name="options-outline" size={19} color={activeFilterChips.length > 0 ? '#fff' : '#475569'} />
            {activeFilterChips.length > 0 && (
              <View style={styles.topBarBadge}>
                <Text style={styles.topBarBadgeText}>{activeFilterChips.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBarAddBtn} accessibilityLabel="เพิ่มเอกสาร" onPress={() => setSubmitScreen({ visible: true })}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {activeFilterChips.length > 0 && (
          <View style={styles.activeFilterRow}>
            {activeFilterChips.map((c) => (
              <TouchableOpacity key={c.key} style={styles.activeFilterChip} onPress={c.clear}>
                <Text style={styles.activeFilterChipText} numberOfLines={1}>{c.label}</Text>
                <Ionicons name="close" size={12} color="#475569" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  }

  function renderFilterSheet() {
    const specialChip = (key: 'urgent' | 'overdue' | 'taxdone' | 'creditAlert', icon: keyof typeof Ionicons.glyphMap, color: string, count?: number) => (
      <SheetOption
        key={key}
        label={SPECIAL_LABEL[key]}
        icon={icon}
        activeColor={color}
        count={count}
        active={specialFilter === key}
        onPress={() => setSpecialFilter((f) => (f === key ? 'none' : key))}
      />
    );

    return (
      <Modal visible={filterSheetOpen} transparent animationType="slide" onRequestClose={() => setFilterSheetOpen(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setFilterSheetOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeadRow}>
              <Text style={styles.sheetTitle}>ตัวกรอง</Text>
              <TouchableOpacity onPress={() => setFilterSheetOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8, gap: 10 }}>
              <SheetGroup icon="calendar" color="#64748b" title="ช่วงวันที่">
                <View style={styles.formRow}>
                  <View style={styles.formRowCol}>
                    <DateField value={startDateFilter} onChange={setStartDateFilter} placeholder="วันที่เริ่ม" />
                  </View>
                  <View style={styles.formRowCol}>
                    <DateField value={endDateFilter} onChange={setEndDateFilter} placeholder="ถึงวันที่" />
                  </View>
                </View>
                {(!!startDateFilter || !!endDateFilter) && !dateRangeReady && (
                  <Text style={styles.sheetDateHint}>เลือกให้ครบทั้ง 2 วัน จึงจะกรองตามช่วงวันที่</Text>
                )}
              </SheetGroup>

              <SheetGroup icon="cash" color="#64748b" title="ช่วงยอดเงิน">
                <View style={styles.sheetOptGrid}>
                  {(['all', 'low', 'medium', 'high'] as const).map((v) => (
                    <SheetOption key={v} label={v === 'all' ? 'ทั้งหมด' : AMOUNT_LABEL[v]} active={amountRange === v} onPress={() => setAmountRange(v)} />
                  ))}
                </View>
              </SheetGroup>

              <SheetGroup icon="document-text" color="#64748b" title="ประเภทเอกสาร">
                <View style={styles.sheetOptGrid}>
                  {/* AC = เคลียร์เงินทดรอง (ตัวกรอง PO/AX/AC บนเว็บ :3684) — doc_type กรองฝั่ง API */}
                  {(['all', 'PO', 'AX', 'AC'] as const).map((t) => (
                    <SheetOption key={t} label={t === 'all' ? 'ทุกประเภท' : t === 'AC' ? 'AC (เคลียร์เงินทดรอง)' : t} active={docTypeFilter === t} onPress={() => setDocTypeFilter(t)} />
                  ))}
                </View>
              </SheetGroup>

              <SheetGroup icon="flash" color="#64748b" title="ตัวกรองพิเศษ">
                <View style={styles.sheetOptGrid}>
                  {specialChip('urgent', 'flame', '#ef4444', kpis?.count_urgent)}
                  {specialChip('overdue', 'calendar-clear', '#ef4444', kpis?.count_overdue)}
                  {specialChip('taxdone', 'checkmark-circle', '#059669', kpis?.count_taxdone)}
                  {specialChip('creditAlert', 'warning', '#d97706', kpis?.count_credit_alert)}
                  <SheetOption
                    label="ตีกลับ (แก้ไข)"
                    icon="arrow-undo"
                    activeColor="#64748b"
                    count={kpis?.count_returned}
                    active={stageFilter === 'returned'}
                    onPress={() => setStageFilter((f) => (f === 'returned' ? 'all' : 'returned'))}
                  />
                </View>
              </SheetGroup>
            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.sheetResetBtn} onPress={resetAllFilters}>
                <Text style={styles.sheetResetBtnText}>ค่าเริ่มต้น</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetApplyBtn} onPress={() => setFilterSheetOpen(false)}>
                <Text style={styles.sheetApplyBtnText}>ดูผลลัพธ์ ({listTotal.toLocaleString('en-US')})</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  function renderHeader() {
    return (
      <View>
        {!perms.can_view_all_docs && (
          <View style={styles.viewScopeBanner}>
            <Ionicons name="eye-outline" size={12} color="#64748b" />
            <Text style={styles.viewScopeBannerText}>แสดงเฉพาะเอกสารของคุณ</Text>
          </View>
        )}

        <TouchableOpacity style={styles.voidHistoryBtn} onPress={() => setVoidPanelOpen((v) => !v)}>
          <View style={styles.voidHistoryIconWrap}>
            <Ionicons name="time-outline" size={12} color="#ef4444" />
          </View>
          <Text style={styles.voidHistoryBtnText}>ประวัติการยกเลิก</Text>
          {cancelledCount > 0 && (
            <View style={styles.voidHistoryBadge}>
              <Text style={styles.voidHistoryBadgeText}>{cancelledCount}</Text>
            </View>
          )}
          <Ionicons name={voidPanelOpen ? 'chevron-up' : 'chevron-down'} size={11} color="#94a3b8" />
        </TouchableOpacity>

        {voidPanelOpen && (
          <TouchableOpacity
            style={styles.voidPanelCard}
            onPress={() => {
              setStageFilter('cancelled');
              setVoidPanelOpen(false);
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="ban" size={70} color="rgba(255,255,255,0.15)" style={styles.voidPanelBgIcon} />
            <View style={styles.voidPanelTopRow}>
              <View>
                <Text style={styles.voidPanelTitle}>รายการยกเลิก (VOID)</Text>
                <Text style={styles.voidPanelSubtitle}>แตะเพื่อกรองข้อมูล</Text>
              </View>
              <View style={styles.voidPanelIconBox}>
                <Ionicons name="document-text" size={18} color="#fff" />
              </View>
            </View>
            <View style={styles.voidPanelBottomRow}>
              <Text style={styles.voidPanelCount}>
                {cancelledCount} <Text style={styles.voidPanelCountUnit}>รายการ</Text>
              </Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.voidPanelAmountLabel}>ยอดรวมมูลค่า</Text>
                <Text style={styles.voidPanelAmountValue}>฿{num(cancelledAmount)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* การ์ดสรุปพื้นเข้มแบบหน้าเว็บ — ยอดรวม + สถานะ 4 + ประเภทเอกสาร 5 + เครดิต 2 รวมในการ์ดเดียว
            แตะกล่องไหนก็กรองรายการตามนั้น แตะซ้ำเพื่อล้าง (เหมือนกล่องลิงก์บนเว็บ) ตัวกรองที่เลือกโชว์เป็น chip บนแถบค้นหา */}
        <LinearGradient colors={['#1e1b4b', '#312e81', '#4f46e5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
          <View style={styles.summaryTotalRow}>
            <View style={styles.summaryTotalIcon}>
              <FontAwesome5 name="chart-line" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTotalLabel}>ยอดรวมสุทธิ (ทั้งหมด)</Text>
              <Text style={styles.summaryTotalValue}>
                {num(kpis?.total_money)} <Text style={styles.summaryTotalCurrency}>฿</Text>
              </Text>
              <Text style={styles.summaryTotalSub}>รวม {kpis?.job_count ?? 0} รายการ</Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            {STAGE_CHIPS.map((s) => {
              const active = stageFilter === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => setStageFilter(active ? 'all' : s.key)}
                  style={[styles.summaryBox, { backgroundColor: s.tint, borderColor: s.tintBorder }, active && styles.summaryBoxActive]}
                >
                  <FontAwesome5 name={s.faIcon} size={13} color={s.onDark} />
                  <Text style={styles.summaryBoxLabel} numberOfLines={2}>{s.label}</Text>
                  <Text style={styles.summaryBoxCount}>{kpis?.[s.countKey] ?? 0}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 5 กล่องประเภทเอกสารจัดเป็น 3 + 2 (เว็บวาง 5 ช่องแถวเดียวแต่จอมือถือแคบเกินจะอ่านยอดเงินได้) */}
          {[DOC_BREAKDOWN.slice(0, 3), DOC_BREAKDOWN.slice(3)].map((row, i) => (
            <View key={i} style={styles.summaryRow}>
              {row.map((b) => {
                const active = keywordFilter === b.keyword;
                return (
                  <TouchableOpacity
                    key={b.keyword}
                    onPress={() => setKeywordFilter(active ? '' : b.keyword)}
                    style={[styles.summaryBox, active && styles.summaryBoxActive]}
                  >
                    <FontAwesome5 name={b.icon} size={13} color={b.onDark} />
                    <Text style={styles.summaryBoxLabel} numberOfLines={2}>{b.label}</Text>
                    <Text style={styles.summaryBoxCount}>{kpis?.[b.countKey] ?? 0}</Text>
                    <Text style={styles.summaryBoxAmount} numberOfLines={1}>{num0(kpis?.[b.amountKey])} บ.</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <View style={styles.summaryRow}>
            {CREDIT_TILES.map((t) => {
              const active = creditStatusFilter === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setCreditStatusFilter(active ? 'all' : t.key)}
                  style={[styles.summaryBox, styles.summaryCreditBox, { backgroundColor: t.tint, borderColor: t.tintBorder }, active && styles.summaryBoxActive]}
                >
                  <View style={styles.summaryCreditHead}>
                    <FontAwesome5 name={t.faIcon} size={13} color={t.onDark} />
                    <Text style={styles.summaryCreditLabel} numberOfLines={1}>{t.label}</Text>
                  </View>
                  <Text style={[styles.summaryBoxCount, { color: t.onDark }]}>{kpis?.[t.countKey] ?? 0}</Text>
                  <Text style={[styles.summaryBoxAmount, { color: t.onDark }]} numberOfLines={1}>{num(kpis?.[t.amountKey])} บ.</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </LinearGradient>

        {/* แยกตามบริษัท (kpi_by_company) — เหมือนการ์ดบริษัทบนเว็บ: แตะชื่อ = เพิ่ม/เอาบริษัทนั้นออกจากตัวกรอง,
            แตะลูกศร = กางดูตัวเลขของบริษัทนั้น (แตะตัวเลขในนั้นเพื่อกรองบริษัทนั้น + เงื่อนไขนั้น เหมือนลิงก์บนเว็บ) */}
        {kpiCompanies.length > 0 && (
          <TouchableOpacity style={styles.breakdownToggle} onPress={() => setCompaniesOpen((v) => !v)}>
            <Text style={styles.breakdownToggleText}>
              แยกตามบริษัท ({kpiCompanies.length}){selectedCompanies.length > 0 ? ` · เลือก ${selectedCompanies.length}` : ''}
            </Text>
            <Ionicons name={companiesOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#64748b" />
          </TouchableOpacity>
        )}
        {companiesOpen && (
          <View style={styles.companyList}>
            {kpiCompanies.map((c) => {
              const selected = selectedCompanies.includes(c.id);
              const expanded = expandedCompanies.includes(c.id);
              return (
                <View key={c.id} style={[styles.companyCard, selected && styles.companyCardSelected]}>
                  <View style={styles.companyCardHead}>
                    <TouchableOpacity
                      style={styles.companyCardInfo}
                      onPress={() => setSelectedCompanies((list) => (list.includes(c.id) ? list.filter((x) => x !== c.id) : [...list, c.id]))}
                    >
                      <View style={styles.companyIcon}>
                        <Ionicons name="business" size={18} color="#94a3b8" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.companyName} numberOfLines={2}>{c.name}</Text>
                        <Text style={styles.companyMoney}>{num(c.kpi.total_money)} ฿</Text>
                        {selected && (
                          <View style={styles.companySelectedRow}>
                            <Ionicons name="checkmark-circle" size={11} color="#059669" />
                            <Text style={styles.companySelectedText}>แสดงผลอยู่</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.companyChevron}
                      hitSlop={8}
                      onPress={() => setExpandedCompanies((list) => (list.includes(c.id) ? list.filter((x) => x !== c.id) : [...list, c.id]))}
                      accessibilityLabel={expanded ? 'ย่อรายละเอียดบริษัท' : 'ดูรายละเอียดบริษัท'}
                    >
                      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
                    </TouchableOpacity>
                  </View>

                  {expanded && (
                    <View style={styles.companyDetails}>
                      {/* 2 แถว x 2 ช่อง (ไม่ใช้ flexWrap + % เพราะเคยล้นขอบบน Android) */}
                      {[STAGE_CHIPS.slice(0, 2), STAGE_CHIPS.slice(2, 4)].map((pair, i) => (
                        <View key={i} style={styles.companyStatRow}>
                          {pair.map((s) => (
                            <TouchableOpacity
                              key={s.key}
                              style={styles.companyStatBox}
                              onPress={() => {
                                setSelectedCompanies([c.id]);
                                setStageFilter(s.key);
                              }}
                            >
                              <Text style={[styles.companyStatCount, { color: s.color }]}>{c.kpi[s.countKey] ?? 0}</Text>
                              <Text style={styles.companyStatLabel} numberOfLines={1}>{s.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ))}
                      <Text style={styles.companySubLabel}>ประเภทเอกสาร</Text>
                      {DOC_BREAKDOWN.map((b) => (
                        <TouchableOpacity
                          key={b.keyword}
                          style={styles.breakdownRow}
                          onPress={() => {
                            setSelectedCompanies([c.id]);
                            setKeywordFilter(b.keyword);
                          }}
                        >
                          <FontAwesome5 name={b.icon} size={12} color={b.color} style={{ width: 18 }} />
                          <Text style={styles.breakdownLabel}>{b.label}</Text>
                          <Text style={styles.breakdownCount}>{c.kpi[b.countKey] ?? 0}</Text>
                          <Text style={styles.breakdownAmount}>{num(c.kpi[b.amountKey] ?? 0)} ฿</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* docs = หน้าที่ดูอยู่ (ไม่เกิน PAGE_SIZE) · listTotal = จำนวนทั้งหมดตามตัวกรอง · เปลี่ยนหน้าที่แถบท้ายรายการ */}
        <Text style={styles.resultCount}>
          {listTotal > 0
            ? `แสดง ${((page - 1) * PAGE_SIZE + 1).toLocaleString('en-US')}–${((page - 1) * PAGE_SIZE + docs.length).toLocaleString('en-US')} จาก ${listTotal.toLocaleString('en-US')} เอกสาร · หน้า ${page}/${pageCount(listTotal, PAGE_SIZE)}`
            : 'ไม่มีเอกสาร'}
        </Text>
        {loading && <ActivityIndicator style={{ marginTop: 8 }} color="#4f46e5" />}
      </View>
    );
  }

  // คลังรับของ + บิล/จ่ายเงิน (เฉพาะเอกสารที่มีเครดิต) — 2 ช่องกว้างเท่ากันในแถวเดียว ไม่ตกบรรทัด
  // ใช้ทั้งในการ์ดลิสต์ (กดได้เลยไม่ต้องเข้าหน้ารายละเอียด) และในหน้ารายละเอียด หน้าตา/การทำงานเหมือนกันทุกจุด
  // เสร็จแล้วเป็นสีเขียว: "คลังรับแล้ว" เป็นกล่องข้อมูลกดไม่ได้ (เว็บไม่มี onclick), "บันทึกแล้ว" ยังกดแก้ได้
  function renderCreditSteps(d: DocListItem, style?: object) {
    if (!d.credit_term || !(perms.can_receive_warehouse || perms.can_update_bill_pay)) return null;
    return (
      <View style={[styles.creditStepsRow, style]}>
        {perms.can_receive_warehouse &&
          (d.warehouse_receiver ? (
            <View style={[styles.creditStepBtn, { backgroundColor: '#059669' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <View style={styles.creditStepBtnTextWrap}>
                <Text style={styles.creditStepBtnTitle} numberOfLines={1}>คลังรับแล้ว</Text>
                {!!d.warehouse_doc_no && <Text style={styles.creditStepBtnSub} numberOfLines={1}>Ref: {d.warehouse_doc_no}</Text>}
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.creditStepBtn, { backgroundColor: '#d97706' }]}
              onPress={() => setWarehouseModal({ visible: true, doc: d, docNo: d.warehouse_doc_no ?? '' })}
            >
              <Ionicons name="cube" size={16} color="#fff" />
              <Text style={styles.creditStepBtnTitle} numberOfLines={1}>คลังรับของ</Text>
            </TouchableOpacity>
          ))}
        {perms.can_update_bill_pay && (
          <TouchableOpacity
            style={[styles.creditStepBtn, { backgroundColor: d.payment_status ? '#059669' : '#4f46e5' }]}
            onPress={() => openBillPay(d)}
          >
            <Ionicons name={d.payment_status ? 'checkmark-done' : 'document-text'} size={16} color="#fff" />
            <View style={styles.creditStepBtnTextWrap}>
              <Text style={styles.creditStepBtnTitle} numberOfLines={1}>{d.payment_status ? 'บันทึกแล้ว' : 'บิล/จ่ายเงิน'}</Text>
              {!!d.payment_status && <Text style={styles.creditStepBtnSub} numberOfLines={1}>{d.payment_status}</Text>}
            </View>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // อนุมัติ + รับเอกสาร (การเงิน) — 2 ช่องกว้างเท่ากัน แบบคอลัมน์ "อนุมัติ"/"การเงิน" บนเว็บ
  // ทำแล้ว = กล่องสีโชว์ชื่อผู้ทำ + วันเวลา, ยังไม่ทำ = ปุ่มกดทำได้เลย (สองขั้นอิสระต่อกัน กดอันไหนก่อนก็ได้)
  function renderStatusBoxes(d: DocListItem, style?: object) {
    const approved = !!d.approver_name;
    const received = truthy(d.is_finance_received) || !!d.finance_receiver;
    return (
      <View style={[styles.statusBoxRow, style]}>
        {approved ? (
          <View style={[styles.statusBox, styles.statusBoxApproved]}>
            <View style={styles.statusBoxHead}>
              <Ionicons name="checkmark-circle" size={14} color="#059669" />
              <Text style={[styles.statusBoxLabel, { color: '#059669' }]}>อนุมัติแล้ว</Text>
            </View>
            <Text style={styles.statusBoxName} numberOfLines={1}>{d.approver_name}</Text>
            <Text style={styles.statusBoxTime}>{formatShortThaiDateTime(d.approved_at)}</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.statusBtn, { backgroundColor: '#f59e0b' }]}
            onPress={() => (perms.can_approve ? setApproveModal({ visible: true, doc: d }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์อนุมัติเอกสาร'))}
          >
            <Ionicons name="create-outline" size={17} color="#fff" />
            <Text style={styles.statusBtnText}>อนุมัติ</Text>
          </TouchableOpacity>
        )}
        {received ? (
          // ปุ่มติ๊ก ✓ ข้างกล่อง = "แจ้งเตือนให้แนบสลิป" แบบเว็บ (มีเฉพาะเมื่อการเงินรับแล้ว)
          // วันที่: แนบสลิปแล้ว -> วันแนบล่าสุด (slip_last_at) ไม่งั้นวันกดรับ — เหมือนเว็บ
          <View style={styles.receivedWrap}>
            <View style={[styles.statusBox, styles.statusBoxReceived]}>
              <View style={styles.statusBoxHead}>
                <Ionicons name="wallet" size={14} color="#059669" />
                <Text style={[styles.statusBoxLabel, { color: '#059669' }]}>รับเอกสารแล้ว</Text>
              </View>
              <Text style={styles.statusBoxName} numberOfLines={1}>{d.finance_receiver || '-'}</Text>
              <Text style={styles.statusBoxTime}>{formatShortThaiDateTime(d.slip_last_at || d.finance_received_at)}</Text>
            </View>
            <TouchableOpacity style={styles.slipRemindTick} onPress={() => openSlipRemind(d)} accessibilityLabel="แจ้งเตือนให้แนบสลิป">
              <Ionicons name="notifications-outline" size={16} color="#4f46e5" />
              <Text style={styles.slipRemindTickText}>เตือน{'\n'}สลิป</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.statusBtn, { backgroundColor: '#f59e0b' }]}
            onPress={() => (perms.can_save_finance ? openFinanceModal(d) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ลงรับเอกสาร'))}
          >
            <Ionicons name="wallet-outline" size={17} color="#fff" />
            <Text style={styles.statusBtnText}>รับเอกสาร</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function renderSectionTitle(icon: keyof typeof Ionicons.glyphMap, title: string) {
    return (
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={15} color="#4f46e5" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
    );
  }

  // หัวข้อ "ใบกำกับภาษี (3 แผนก)" ของเอกสาร AC — แทนข้อความ "ไม่ใช่เอกสารประเภทใบกำกับภาษี": สรุปว่ากล่องไหนฝ่ายไหนรับแล้ว
  function renderAcTaxSummary(d: DocListItem) {
    const taxItems = (d.ac_items ?? []).filter((it) => it.attachment_type === 'รอใบกำกับภาษี 7%' || it.attachment_type === 'ใบกำกับภาษี 7%');
    if (taxItems.length === 0) return <Text style={styles.deptNaText}>— ไม่มีร้านค้าที่เป็นใบกำกับภาษี —</Text>;
    return (
      <View style={{ gap: 6 }}>
        <Text style={acStyles.sumHint}>ลงรับทีละร้านในรายการเคลียร์เงินทดรองด้านบน</Text>
        {taxItems.map((it) => (
          <View key={it.id} style={acStyles.sumRow}>
            <Text style={acStyles.sumName} numberOfLines={1}>
              {it.line_no}. {it.supplier_name}
            </Text>
            <View style={acStyles.sumDepts}>
              {AC_RECV_DEPTS.map(({ key, dept }) => {
                const done = !!it.receipts?.[key];
                return (
                  <View key={key} style={[acStyles.sumDept, done && acStyles.sumDeptDone]}>
                    <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={11} color={done ? '#059669' : '#94a3b8'} />
                    <Text style={[acStyles.sumDeptText, done && { color: '#047857' }]}>{DEPT_META[dept].label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    );
  }

  // -------------------- AC (เคลียร์เงินทดรอง): กล่องร้านค้าในหน้ารายละเอียด (#d_ac_box บนเว็บ js:274-382) --------------------
  // แต่ละกล่อง: ร้าน/หน้างาน/ประเภทเอกสารแนบ · ใบกำกับ (เลขที่ ↔ ไฟล์) · ยอด ก่อน VAT|VAT|ยอดจ่ายจริง · รายละเอียดงาน · WHT
  // กล่อง รอใบกำกับ/ใบกำกับ 7% มีช่องรับ 3 ฝ่าย: รับแล้ว = ชื่อ/เวลา/หมายเหตุ + ดูรายละเอียด + ยกเลิกการรับ (ตามสิทธิ์) · ยังไม่รับ = ปุ่มรับ
  function renderAcItemsSection(d: DocListItem) {
    const items = d.ac_items ?? [];
    const cancelled = truthy(d.is_cancelled);
    const whtTotal = Number(d.ac_wht_total ?? 0);
    const amt = (label: string, val: number, strong?: boolean) => (
      <View style={acStyles.amtBox}>
        <Text style={acStyles.amtLbl}>{label}</Text>
        <Text style={[acStyles.amtVal, strong && acStyles.amtValStrong]}>{num(val)}</Text>
      </View>
    );
    return (
      <View style={styles.section}>
        {renderSectionTitle('layers-outline', `รายการเคลียร์เงินทดรอง (${items.length} รายการ)`)}
        {whtTotal > 0 && <Text style={acStyles.whtTotal}>หัก ณ ที่จ่ายรวม {num(whtTotal)} บาท</Text>}
        {items.map((it, i) => {
          const isWait = it.attachment_type === 'รอใบกำกับภาษี 7%';
          const isTax = it.attachment_type === 'ใบกำกับภาษี 7%';
          return (
            <View key={it.id} style={acStyles.item}>
              <View style={acStyles.head}>
                <View style={acStyles.no}>
                  <Text style={acStyles.noText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={acStyles.sup}>{it.supplier_name || '-'}</Text>
                  {!!it.job_site && (
                    <Text style={acStyles.site}>
                      <Text style={acStyles.siteLbl}>หน้างาน: </Text>
                      {it.job_site}
                    </Text>
                  )}
                  <View style={[acStyles.att, isWait && acStyles.attWait, isTax && acStyles.attTax]}>
                    <Text style={[acStyles.attText, isWait && { color: '#b45309' }, isTax && { color: '#047857' }]}>{it.attachment_type || '-'}</Text>
                  </View>
                </View>
              </View>

              {/* เนื้อกล่อง (พื้นขาว) แยกจากแถบหัวสีของร้าน — กล่องย่อยด้านในเป็นพื้นเทาให้ตัดกัน */}
              <View style={acStyles.body}>
                <View style={acStyles.amtRow}>
                  {!!it.vat && amt('ก่อน VAT', it.vat.base)}
                  {!!it.vat && amt('VAT', it.vat.vat)}
                  {amt('ยอดจ่ายจริง', it.amount, true)}
                </View>

                {it.tax_pairs.length > 0 && (
                  <View style={acStyles.invRow}>
                    <Text style={acStyles.invLbl}>ใบกำกับ</Text>
                    {it.tax_pairs.map((p, j) =>
                      p.file ? (
                        <TouchableOpacity key={j} style={acStyles.invChip} onPress={() => viewAttachedFile(p.file, rootUploadUrl(p.file))}>
                          <Ionicons name="attach" size={12} color="#4f46e5" />
                          <Text style={acStyles.invChipText}>{p.inv || 'ไม่ระบุเลขที่'}</Text>
                        </TouchableOpacity>
                      ) : (
                        <View key={j} style={[acStyles.invChip, acStyles.invChipNoFile]}>
                          <Text style={acStyles.invChipTextMuted}>{p.inv}</Text>
                        </View>
                      ),
                    )}
                  </View>
                )}
                {!!it.tax_note && <Text style={acStyles.taxNote}>หมายเหตุใบกำกับ: {it.tax_note}</Text>}

                <View style={acStyles.secRow}>
                  <View style={acStyles.sec}>
                    <Text style={acStyles.secLbl}>รายละเอียดงาน</Text>
                    <Text style={acStyles.secVal}>{it.description?.trim() || '-'}</Text>
                  </View>
                  <View style={acStyles.sec}>
                    <Text style={[acStyles.secLbl, { color: '#ef4444' }]}>WHT</Text>
                    {it.wht_amount > 0 ? (
                      <>
                        <Text style={acStyles.secVal}>
                          {it.wht_tax} ({num(it.wht_amount)} บ.)
                        </Text>
                        <Text style={acStyles.gross}>
                          ยอดเต็มก่อนหัก <Text style={acStyles.grossVal}>{num(it.gross_before_wht)}</Text> บาท
                        </Text>
                      </>
                    ) : (
                      <Text style={acStyles.secVal}>-</Text>
                    )}
                  </View>
                </View>

                {it.can_receive_tax && !cancelled && (
                  <View style={acStyles.recvWrap}>
                    {AC_RECV_DEPTS.map(({ key, dept }) => {
                      const meta = DEPT_META[dept];
                      const r = it.receipts?.[key];
                      if (!r) {
                        return (
                          <TouchableOpacity
                            key={key}
                            style={[acStyles.recvBtn, { backgroundColor: meta.color }]}
                            onPress={() => (perms.can_receive_tax ? openAcReceive(d, it, key) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์รับใบกำกับภาษี'))}
                          >
                            <Ionicons name={meta.icon} size={13} color="#fff" />
                            <Text style={acStyles.recvBtnText}>{meta.label} (รับใบกำกับ)</Text>
                          </TouchableOpacity>
                        );
                      }
                      return (
                        <View key={key} style={[acStyles.recvDone, { borderLeftColor: meta.color }]}>
                          <View style={acStyles.recvDoneHead}>
                            <Ionicons name={meta.icon} size={12} color={meta.color} />
                            <Text style={[acStyles.recvDoneLbl, { color: meta.color }]}>{meta.label}รับแล้ว</Text>
                            <Text style={acStyles.recvAt}>{formatShortThaiDateTime(r.at)}</Text>
                          </View>
                          <Text style={acStyles.recvBy}>{r.by || '-'}</Text>
                          {!!r.note && (
                            <Text style={acStyles.recvNote} numberOfLines={2}>
                              {r.note}
                            </Text>
                          )}
                          <View style={styles.deptReceivedBtnRow}>
                            <TouchableOpacity style={styles.outlineBtnGreen} onPress={() => openAcReceive(d, it, key)}>
                              <Ionicons name="search" size={11} color="#059669" />
                              <Text style={styles.outlineBtnGreenText}>ดูรายละเอียด</Text>
                            </TouchableOpacity>
                            {perms[meta.cancelPerm] && (
                              <TouchableOpacity style={styles.outlineBtnNeutral} onPress={() => askAcCancelReceive(d, it, key, dept)}>
                                <Ionicons name="close-circle-outline" size={11} color="#64748b" />
                                <Text style={styles.outlineBtnNeutralText}>ยกเลิกการรับ</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  // ป๊อปอัปของ AC — รับใบกำกับรายกล่อง (ซ้อนในหน้ารายละเอียด) / รายชื่อร้านค้า (เปิดจากการ์ดในลิสต์ = ระดับหน้า)
  function renderAcModals(where: 'root' | 'detail') {
    if (where === 'root') {
      const sd = acShops.doc;
      const q = acShops.q.trim().toLowerCase();
      const shops = (sd?.ac_items ?? []).filter((it) => !q || `${it.supplier_name} ${it.job_site}`.toLowerCase().includes(q));
      return (
        <ModalShell
          visible={acShops.visible}
          title={`ซัพพลายเออร์ (${sd?.ac_items?.length ?? 0} ร้าน)`}
          color="#4f46e5"
          onClose={() => setAcShops({ visible: false, q: '' })}
        >
          <Text style={acStyles.shopDoc}>{sd ? `${sd.doc_type} ${(sd.doc_number ?? '').replace(/^(PO|AX|AC)-/, '')}` : ''}</Text>
          <TextInput
            style={styles.input}
            placeholder="พิมพ์ค้นหาร้านค้า / หน้างาน..."
            placeholderTextColor="#94a3b8"
            value={acShops.q}
            onChangeText={(v) => setAcShops((s) => ({ ...s, q: v }))}
          />
          {shops.length === 0 ? (
            <Text style={styles.hintText}>ไม่พบร้านค้าที่ค้นหา</Text>
          ) : (
            shops.map((it) => (
              <View key={it.id} style={acStyles.shopRow}>
                <Text style={acStyles.shopNo}>{it.line_no}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={acStyles.shopName}>{it.supplier_name || '-'}</Text>
                  {!!it.job_site && <Text style={acStyles.shopSite}>หน้างาน: {it.job_site}</Text>}
                </View>
                <Text style={acStyles.shopAmt}>{num(it.amount)}</Text>
              </View>
            ))
          )}
        </ModalShell>
      );
    }

    const { doc, item, key } = acRecv;
    const dept = AC_RECV_DEPTS.find((x) => x.key === key)?.dept;
    const meta = dept ? DEPT_META[dept] : null;
    const pairs = item?.tax_pairs ?? [];
    const receipt = item && key ? item.receipts?.[key] : undefined;
    const canRemove = meta ? perms[meta.cancelPerm] : false;
    const close = () => {
      setAcPreviewUrl('');
      setAcRecv({ visible: false, keep: [], rows: [], note: '' });
    };
    const viewFile = (name: string) => {
      const url = rootUploadUrl(name);
      if (isImageFile(name)) setAcPreviewUrl(url);
      else openFile(url);
    };
    return (
      <ModalShell visible={acRecv.visible} title={meta ? `📂 ${meta.label}รับใบกำกับ` : ''} color={meta?.color ?? '#4f46e5'} onClose={close}>
        <View style={acStyles.recvSub}>
          <Text style={acStyles.recvSubText}>
            เคลียร์เงินทดรอง {doc ? `${doc.doc_type} ${(doc.doc_number ?? '').replace(/^(PO|AX|AC)-/, '')}` : ''} · รายการที่ {item?.line_no}: {item?.supplier_name}
          </Text>
        </View>
        {!!receipt && (
          <Text style={styles.hintText}>
            รับแล้วโดย {receipt.by || '-'} · {formatShortThaiDateTime(receipt.at)} — บันทึกซ้ำ = เปลี่ยนเป็นชื่อคุณ
          </Text>
        )}

        {pairs.length > 0 && (
          <>
            <FieldLabel text="ใบกำกับของรายการนี้ (ใช้ร่วมกันทุกฝ่าย)" />
            {pairs.map((p, i) => {
              const active = !!acRecv.keep[i];
              const locked = !p.file || !canRemove;
              return (
                <View key={`${p.file}-${i}`} style={[styles.taxSlotRow, active && styles.taxSlotRowActive]}>
                  <TouchableOpacity
                    style={styles.taxSlotToggle}
                    disabled={locked}
                    onPress={() => setAcRecv((s) => ({ ...s, keep: s.keep.map((k, j) => (j === i ? !k : k)) }))}
                  >
                    <Ionicons name={locked ? 'lock-closed' : active ? 'checkbox' : 'square-outline'} size={18} color={active ? '#4f46e5' : '#94a3b8'} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.taxSlotInv} numberOfLines={1}>{p.inv || '- ไม่ระบุเลขที่ -'}</Text>
                      <Text style={styles.taxSlotSrc}>{!p.file ? 'ไม่มีไฟล์' : active ? 'เก็บไว้' : 'จะเอาออก'}</Text>
                    </View>
                  </TouchableOpacity>
                  {!!p.file && (
                    <TouchableOpacity style={styles.refundOldFileView} onPress={() => viewFile(p.file)}>
                      <Ionicons name="eye-outline" size={13} color="#059669" />
                      <Text style={styles.refundOldFileViewText}>ดู</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {!canRemove && pairs.some((p) => !!p.file) && !!meta && (
              <Text style={styles.hintText}>เอาไฟล์เดิมออกได้เฉพาะผู้มีสิทธิ์ยกเลิกการรับของ{meta.label}</Text>
            )}
          </>
        )}

        <FieldLabel text="เพิ่มเลขที่ / ไฟล์ใบกำกับ" />
        {acRecv.rows.map((r, i) => (
          <View key={i} style={acStyles.newRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="เลขที่ใบกำกับ"
              placeholderTextColor="#94a3b8"
              value={r.inv}
              onChangeText={(v) => setAcRecv((s) => ({ ...s, rows: s.rows.map((x, j) => (j === i ? { ...x, inv: v } : x)) }))}
            />
            <TouchableOpacity
              style={[acStyles.newRowFile, !!r.file && acStyles.newRowFileOn]}
              onPress={() =>
                askPickImage((f) => {
                  if (!checkExt(f.name, master?.upload_limits?.allowed_extensions)) {
                    Alert.alert('ไฟล์ไม่รองรับ', 'นามสกุลไฟล์นี้ไม่อยู่ในรายการที่อนุญาต');
                    return;
                  }
                  setAcRecv((s) => ({ ...s, rows: s.rows.map((x, j) => (j === i ? { ...x, file: f } : x)) }));
                })
              }
            >
              <Ionicons name={r.file ? 'document-attach' : 'attach-outline'} size={14} color={r.file ? '#047857' : '#475569'} />
              <Text style={[acStyles.newRowFileText, !!r.file && { color: '#047857' }]}>{r.file ? 'แนบแล้ว' : 'แนบไฟล์'}</Text>
            </TouchableOpacity>
            {acRecv.rows.length > 1 && (
              <TouchableOpacity hitSlop={6} onPress={() => setAcRecv((s) => ({ ...s, rows: s.rows.filter((_, j) => j !== i) }))}>
                <Ionicons name="close-circle" size={20} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity style={styles.attachBtn} onPress={() => setAcRecv((s) => ({ ...s, rows: [...s.rows, { inv: '', file: null }] }))}>
          <Ionicons name="add" size={14} color="#475569" />
          <Text style={[styles.attachBtnText, { color: '#475569' }]}>เพิ่มแถว</Text>
        </TouchableOpacity>

        <FieldLabel text="หมายเหตุ (ถ้ามี)" />
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="เช่น บิลมีปัญหา..."
          placeholderTextColor="#94a3b8"
          multiline
          value={acRecv.note}
          onChangeText={(v) => setAcRecv((s) => ({ ...s, note: v }))}
        />
        <FieldLabel text="ผู้รับใบกำกับ" />
        <View style={styles.readonlyInput}>
          <Text style={styles.readonlyInputText}>{user?.fullname ?? '-'}</Text>
        </View>
        <TouchableOpacity
          style={[styles.modalSaveBtn, { backgroundColor: meta?.color ?? '#4f46e5', opacity: acRecv.saving ? 0.6 : 1 }]}
          onPress={confirmAcReceive}
          disabled={acRecv.saving}
        >
          <Text style={styles.modalSaveBtnText}>{acRecv.saving ? 'กำลังบันทึก...' : 'บันทึก'}</Text>
        </TouchableOpacity>

        {/* ดูรูปเต็มจอ — ซ้อนในป๊อปอัปนี้ (ไม่งั้นรูปไปเปิดอยู่ใต้ป๊อปอัป) */}
        <Modal visible={!!acPreviewUrl} transparent animationType="fade" onRequestClose={() => setAcPreviewUrl('')}>
          <View style={styles.imagePreviewOverlay}>
            <TouchableOpacity style={styles.imagePreviewCloseBtn} onPress={() => setAcPreviewUrl('')}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            {!!acPreviewUrl && <Image source={{ uri: acPreviewUrl }} style={styles.imagePreviewImage} resizeMode="contain" />}
            {!!acPreviewUrl && (
              <TouchableOpacity style={styles.imagePreviewOpenExternalBtn} onPress={() => openFile(acPreviewUrl)}>
                <Ionicons name="open-outline" size={14} color="#fff" />
                <Text style={styles.imagePreviewOpenExternalText}>เปิดในเบราว์เซอร์ / บันทึกรูป</Text>
              </TouchableOpacity>
            )}
          </View>
        </Modal>
      </ModalShell>
    );
  }

  // การ์ดในลิสต์ — สรุป: บริษัท/เลขที่, ซัพพลายเออร์, วันที่, ยอดเงิน + ช่องอนุมัติ/รับเอกสาร (ใคร/เมื่อไหร่)
  // ปุ่มคลังรับของ/บิล-จ่ายเงินย้ายไปอยู่ในหน้ารายละเอียดส่วน "เครดิต / การชำระเงิน" อย่างเดียว
  // รายละเอียดที่เหลือทั้งหมด (เดิมยาวเกิน 2 จอต่อการ์ด) อยู่ใน renderDetailModal() แตะการ์ดเพื่อเปิด
  function renderCard({ item: d }: { item: DocListItem }) {
    const isCancelled = truthy(d.is_cancelled);

    return (
      <View style={[styles.card, isCancelled && styles.cardCancelled]}>
        {/* โซนข้อมูล — แตะเพื่อเปิดหน้ารายละเอียด */}
        <TouchableOpacity activeOpacity={0.7} onPress={() => setDetailModal({ visible: true, doc: d })}>
        {isCancelled && (
          <View style={styles.cancelRibbon}>
            <Ionicons name="ban" size={11} color="#fff" />
            <Text style={styles.cancelRibbonText}>ยกเลิกแล้ว{d.cancel_reason ? ` — ${d.cancel_reason}` : ''}</Text>
          </View>
        )}

        {!isCancelled && !!d.has_pending_request && (
          <View style={styles.pendingReqRibbon}>
            <Ionicons name="hourglass-outline" size={11} color="#fff" />
            <Text style={styles.pendingReqRibbonText}>
              มีคำขอรออนุมัติ: {d.pending_request_type === 'cancel' ? 'ขอยกเลิกเอกสาร' : d.pending_request_type === 'edit' ? 'ขอแก้ไขเอกสาร' : d.pending_request_type}
            </Text>
            {canAcceptRequest(d) && d.pending_request_status === 'pending' && !!d.pending_request_id && (
              <TouchableOpacity
                style={styles.pendingReqAcceptBtn}
                disabled={acceptingReqId === d.pending_request_id}
                onPress={() => acceptDocRequest(d)}
              >
                <Text style={styles.pendingReqAcceptBtnText}>
                  {acceptingReqId === d.pending_request_id ? '...' : 'รับทราบ'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.cardTopRow}>
          <Text style={styles.companyText} numberOfLines={1}>
            {d.company_display || d.company_full_name || d.company_shortname || '-'}
          </Text>
          <View style={styles.docTypeBadge}>
            <Text style={styles.docTypeBadgeText} numberOfLines={1}>
              {d.doc_type}-{(d.doc_number ?? '').replace(/^(PO|AX|AC)-/, '')}
            </Text>
          </View>
        </View>

        <Text style={styles.supplierNameSummary} numberOfLines={1}>{d.supplier_name || '-'}</Text>
        {/* AC: ชิป "N รายการร้านค้า" แบบคอลัมน์ซัพพลายเออร์บนเว็บ — แตะดูรายชื่อร้าน/หน้างาน/ยอดทุกกล่อง */}
        {(d.ac_items_count ?? 0) > 0 && (
          <TouchableOpacity style={acStyles.shopChip} onPress={() => setAcShops({ visible: true, doc: d, q: '' })} hitSlop={6}>
            <Ionicons name="layers-outline" size={12} color="#4f46e5" />
            <Text style={acStyles.shopChipText}>{d.ac_items_count} รายการร้านค้า</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.dateText}>{formatShortThaiDateTime(d.created_at)}</Text>

        <View style={styles.cardSummaryBottomRow}>
          <Text style={styles.amountValue}>{num(d.amount)} ฿</Text>
          {/* ป้ายสถานะเดิมตรงนี้ตัดออก — ซ้ำกับช่องอนุมัติ/รับเอกสารด้านล่าง; แทนด้วย "กำหนดติดตาม (30 วัน)" แบบคอลัมน์บนเว็บ */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {(() => {
              const f = isCancelled ? null : followUpOf(d);
              return f ? <FollowUpBadge f={f} /> : null;
            })()}
            <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
          </View>
        </View>
        </TouchableOpacity>

        {/* โซนปุ่ม — แยกจากโซนข้อมูลด้วยเส้นคั่น แตะพื้นที่ว่างตรงนี้ไม่เปิดรายละเอียด กันกดพลาด */}
        {!isCancelled && (
          <View style={styles.cardActionZone}>
            {renderStatusBoxes(d)}
          </View>
        )}
      </View>
    );
  }

  // โมดัล action ต้องซ้อนอยู่ในโมดัลรายละเอียดตอนที่หน้านั้นเปิดอยู่ — วางเป็นพี่น้องที่ root แล้วโดนหน้ารายละเอียดทับ
  // (กดรับใบกำกับแล้วป๊อปอัพไม่ขึ้นจนกว่าจะปิดหน้ารายละเอียด) · เช็ค doc ด้วยเพราะ renderDetailModal คืน null ถ้าไม่มี
  const actionModalsInDetail = detailModal.visible && !!detailModal.doc;

  // หน้ารายละเอียดเอกสาร — เปิดเต็มจอตอนแตะการ์ด รวมทุกอย่างที่เดิมอยู่ในการ์ดเดียว (ขั้นตอนอนุมัติ/
  // การเงิน, รับใบกำกับภาษี 3 แผนก, เครดิต/คืนเงิน/หมายเหตุ ฯลฯ) — เพิ่ม Stepper ให้เห็นขั้นตอนทันที
  // ตอนบน ส่วน logic/handler เดิมทั้งหมดคงไว้เหมือนเดิมทุกจุด ย้ายตำแหน่ง JSX เข้ามาเท่านั้น
  function renderDetailModal() {
    // detailModal.doc คือข้อมูลสดเสมอ — ทุกปุ่มทำรายการดึงใบนี้ใหม่ (refreshAfterAction) และ load() ก็ sync ให้
    // ไม่หาใน docs เพราะเอกสารที่เพิ่งหลุดจากตัวกรอง (เช่น อนุมัติตอนกรอง "รออนุมัติ") จะไม่อยู่ในลิสต์แล้ว
    const d = detailModal.doc;
    if (!d) return null;

    const isCancelled = truthy(d.is_cancelled);
    const attachments = arr(d.attachments);
    // เอกสารภาษี = มี "ใบกำกับภาษี 7%" (รวม "รอใบกำกับภาษี 7%") — เงื่อนไขเดียวกับปุ่มรับใบกำกับ 3 แผนกบนเว็บ (:4355)
    const isTaxDoc = attachments.some((a) => a.includes('ใบกำกับภาษี 7%'));
    // ป้ายประเภทตามค่าใน attachments แบบเว็บ — เอกสารเก่าที่แนบ "ใบกำกับภาษี 7%" มาตั้งแต่เปิด (บัญชีไม่ได้กดรับ)
    // ต้องขึ้น "ใบกำกับภาษี 7%" ตรงกับตัวนับ "ใบกำกับ 7%" บนการ์ดสรุป ไม่ใช่ "รอ"
    const typeLabel = docTypeLabel(d);
    const slipFiles = arr(d.slip_files);
    const slipFullFiles = arr(d.slip_full_files);
    const isReturned = truthy(d.is_returned);
    const isTaxReturned = truthy(d.is_tax_returned);
    // AC (เคลียร์เงินทดรอง) ที่มีกล่องร้านค้า: รายละเอียดงาน/WHT อยู่ในกล่องแต่ละร้าน → ซ่อนของหัวเอกสาร (js/DocumentDashboard.js:366-382)
    const isAc = (d.ac_items?.length ?? 0) > 0;

    // ปุ่มที่ทำลาย/ย้อนสถานะเอกสาร รวมไว้ในเมนู ⋯ — ทุกตัวเปิดโมดัลที่ต้องกรอกเหตุผลก่อนยืนยันอยู่แล้ว
    const menuItems: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }[] = [];
    if (!isReturned) {
      menuItems.push({
        key: 'return',
        label: 'ตีกลับเอกสาร (ตั้งโอน)',
        icon: 'arrow-undo',
        onPress: () => (perms.can_return_document ? setReturnModal({ visible: true, doc: d, text: d.return_remark ?? '' }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ตีกลับเอกสาร')),
      });
    }
    if (!isTaxReturned) {
      menuItems.push({
        key: 'returnTax',
        label: 'ตีกลับใบกำกับภาษี',
        icon: 'arrow-undo',
        onPress: () => (perms.can_return_document ? setReturnTaxModal({ visible: true, doc: d, text: d.return_tax_remark ?? '' }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ตีกลับใบกำกับภาษี')),
      });
    }
    if (perms.can_cancel_document) {
      menuItems.push({ key: 'cancel', label: 'ยกเลิกเอกสาร', icon: 'close-circle-outline', onPress: () => setCancelModal({ visible: true, doc: d, reason: '' }) });
    }

    return (
      <Modal
        visible={detailModal.visible}
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setDetailModal({ visible: false })}
      >
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {/* โมดัลเต็มจอหัวขาว: ไอคอนแถบสถานะสีเข้มตอนเปิด (ปิดแล้วกลับเป็นสีขาวของแถบหัวน้ำเงิน) */}
          <StatusBar barStyle="dark-content" />
          <View style={styles.detailHeaderBar}>
            <TouchableOpacity onPress={() => setDetailModal({ visible: false })} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color="#0f172a" />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>
              {d.doc_type}-{(d.doc_number ?? '').replace(/^(PO|AX|AC)-/, '')}
            </Text>
            {!isCancelled && menuItems.length > 0 ? (
              <TouchableOpacity onPress={() => setMoreMenuOpen(true)} style={styles.backBtn} accessibilityLabel="เมนูเพิ่มเติม">
                <Ionicons name="ellipsis-horizontal" size={22} color="#0f172a" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 32 }} />
            )}
          </View>

          <ScrollView contentContainerStyle={styles.detailScrollContent} showsVerticalScrollIndicator={false}>
            {isCancelled && (
              <View style={styles.cancelRibbon}>
                <Ionicons name="ban" size={11} color="#fff" />
                <Text style={styles.cancelRibbonText}>ยกเลิกแล้ว{d.cancel_reason ? ` — ${d.cancel_reason}` : ''}</Text>
              </View>
            )}
            {/* ส่วนเสริมนอก AC: เอกสารที่ยกเลิก — ใคร/เมื่อไหร่/สาเหตุ + กู้คืน (btn_edit) + ดูประวัติ แบบแถวยกเลิกบนเว็บ (:4725-4746) */}
            {isCancelled && (
              <View style={nonacStyles.voidBox}>
                <Text style={nonacStyles.voidTitle}>รายการถูกยกเลิก</Text>
                <Text style={nonacStyles.voidLine}>ผู้ยกเลิก: {d.cancelled_by || '-'}</Text>
                <Text style={nonacStyles.voidLine}>เมื่อ: {formatShortThaiDateTime(d.cancelled_at)}</Text>
                <Text style={nonacStyles.voidReason}>สาเหตุ: {d.cancel_reason || '-'}</Text>
                <View style={nonacStyles.btnRow}>
                  {perms.can_restore_document && (
                    <TouchableOpacity
                      style={[nonacStyles.btn, { backgroundColor: '#059669', opacity: restoringDoc ? 0.6 : 1 }]}
                      disabled={restoringDoc}
                      onPress={() => askRestoreDocument(d)}
                    >
                      <Ionicons name="arrow-undo" size={13} color="#fff" />
                      <Text style={nonacStyles.btnText}>{restoringDoc ? 'กำลังกู้คืน...' : 'กู้คืนรายการ'}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[nonacStyles.btn, { backgroundColor: '#64748b' }]} onPress={() => openHistory(d)}>
                    <Ionicons name="time-outline" size={13} color="#fff" />
                    <Text style={nonacStyles.btnText}>ดูประวัติ</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!isCancelled && !!d.has_pending_request && (
              <View style={styles.pendingReqRibbon}>
                <Ionicons name="hourglass-outline" size={11} color="#fff" />
                <Text style={styles.pendingReqRibbonText}>
                  มีคำขอรออนุมัติ: {d.pending_request_type === 'cancel' ? 'ขอยกเลิกเอกสาร' : d.pending_request_type === 'edit' ? 'ขอแก้ไขเอกสาร' : d.pending_request_type}
                </Text>
                {canAcceptRequest(d) && d.pending_request_status === 'pending' && !!d.pending_request_id && (
                  <TouchableOpacity
                    style={styles.pendingReqAcceptBtn}
                    disabled={acceptingReqId === d.pending_request_id}
                    onPress={() => acceptDocRequest(d)}
                  >
                    <Text style={styles.pendingReqAcceptBtnText}>
                      {acceptingReqId === d.pending_request_id ? '...' : 'รับทราบ'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* จัดหน้ารายละเอียดเป็นส่วนๆ: ข้อมูลเอกสาร / สถานะ (อนุมัติ-รับเอกสาร) / ใบกำกับภาษี / เครดิต / อื่นๆ */}
            <View style={[styles.section, { gap: 0 }]}>
              {renderSectionTitle('document-text-outline', 'ข้อมูลเอกสาร')}
              <View style={styles.cardTopRow}>
                <Text style={styles.companyText} numberOfLines={1}>
                  {d.company_display || d.company_full_name || d.company_shortname || '-'}
                </Text>
                <View style={styles.docTypeBadge}>
                  <Text style={styles.docTypeBadgeText} numberOfLines={1}>
                    {d.doc_type}-{(d.doc_number ?? '').replace(/^(PO|AX|AC)-/, '')}
                  </Text>
                </View>
              </View>
              {/* ด้านบนเหลือ บริษัท/เลขที่ + ชื่อซัพพลายเออร์ + ยอดเงิน/ป้ายประเภท — วันที่ ผู้สั่ง หน้างาน ธนาคาร
                  อยู่ในกล่อง "รายละเอียดเพิ่มเติม" ด้านล่างที่เดียว (เดิมโชว์ซ้ำสองที่) */}
              <Text style={styles.supplierNameSummary} numberOfLines={2}>{d.supplier_name || '-'}</Text>

              <View style={styles.amountRow}>
                <Text style={styles.amountValue}>{num(d.amount)} ฿</Text>
                {/* สีตามเว็บ: รอใบกำกับ = ส้ม (ต้องตาม) · ได้ใบกำกับ 7% แล้ว = เขียว · อื่น ๆ = เทา */}
                <TouchableOpacity
                  style={[
                    styles.extraLabelRow,
                    typeLabel.tone === 'wait' && styles.extraLabelRowTax,
                    typeLabel.tone === 'tax' && styles.extraLabelRowTaxDone,
                  ]}
                  onPress={() => setStatusNoteModal({ visible: true, doc: d, text: d.tax_status_note ?? '', saving: false })}
                >
                  <FontAwesome5
                    name={typeLabel.tone === 'tax' ? 'check-circle' : 'file-invoice'}
                    size={typeLabel.tone === 'normal' ? 9 : 10}
                    color={typeLabel.tone === 'wait' ? '#b45309' : typeLabel.tone === 'tax' ? '#047857' : '#94a3b8'}
                  />
                  <Text
                    style={[
                      styles.extraLabelText,
                      typeLabel.tone === 'wait' && styles.extraLabelTextTax,
                      typeLabel.tone === 'tax' && styles.extraLabelTextTaxDone,
                    ]}
                    numberOfLines={1}
                  >
                    {typeLabel.text}
                  </Text>
                  {!!d.tax_status_note && <View style={styles.extraLabelDot} />}
                </TouchableOpacity>
              </View>

              {/* รายละเอียดเพิ่มเติม — ฟิลด์ที่กรอกตอนส่งเอกสาร (submitdocument.tsx) ซึ่งเดิมไม่ได้โชว์ในหน้านี้เลย */}
              <TouchableOpacity style={styles.moreInfoBtn} onPress={() => setMoreInfoOpen((v) => !v)}>
                <Ionicons name="information-circle-outline" size={16} color="#fff" />
                <Text style={styles.moreInfoBtnText}>รายละเอียดเพิ่มเติม</Text>
                <Ionicons name={moreInfoOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#fff" />
              </TouchableOpacity>
              {moreInfoOpen && (
              <View style={styles.moreInfoBox}>
                {/* แถวข้อมูลย่อย: บริษัท / วันที่ / เอกสาร / ผู้สั่ง / หน้างาน */}
                <View style={styles.miGrid}>
                  {([
                    ['business', 'บริษัท', d.company_display || d.company_shortname || d.company_full_name || '-'],
                    ['calendar', 'วันที่', fmtDateTimeCE(d.created_at)],
                    ['document-text', 'เอกสาร', `${d.doc_type} ${(d.doc_number ?? '').replace(/^(PO|AX|AC)-/, '')}`],
                    ['person', 'ผู้สั่ง/ผู้เปิด', d.ordered_by || '-'],
                    ['location', 'หน้างาน', d.job_site || '-'],
                  ] as const).map(([icon, label, value]) => (
                    <View key={label} style={styles.miTile}>
                      <View style={styles.miTileHead}>
                        <Ionicons name={icon} size={11} color="#475569" />
                        <Text style={styles.miTileLabel}>{label}</Text>
                      </View>
                      <Text style={styles.miTileValue}>{value}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.miBlock}>
                  <View style={styles.miTileHead}>
                    <Ionicons name={isAc ? 'business' : 'storefront'} size={11} color="#475569" />
                    <Text style={styles.miTileLabel}>{isAc ? 'บัญชีปลายทาง' : 'ซัพพลายเออร์ / บัญชีปลายทาง'}</Text>
                  </View>
                  {/* AC: ชื่อร้านอยู่ในกล่องแต่ละร้านแล้ว — กล่องนี้โชว์แค่บัญชีปลายทาง (ไม่มีบัญชี = "-") */}
                  {isAc ? (
                    !d.bank_name && !d.bank_account && !d.account_name && <Text style={styles.miSupplier}>-</Text>
                  ) : (
                    <Text style={styles.miSupplier}>{d.supplier_name || '-'}</Text>
                  )}
                  {!!d.bank_name && (
                    <View style={styles.miBankRow}>
                      <View style={styles.miBankIcon}><Ionicons name="business-outline" size={12} color="#475569" /></View>
                      <Text style={styles.miBankText}>{d.bank_name}</Text>
                    </View>
                  )}
                  {(!!d.bank_account || !!d.account_name) && (
                    <View style={styles.miBankRow}>
                      <View style={styles.miBankIcon}><Text style={{ fontSize: 11, color: '#475569', fontWeight: '800' }}>#</Text></View>
                      <Text style={styles.miBankText}>
                        <Text style={styles.miAccountNo}>{d.bank_account || '-'}</Text>
                        {d.account_name ? <Text style={styles.miAccountName}>  /  {d.account_name}</Text> : null}
                      </Text>
                    </View>
                  )}
                </View>

                <LinearGradient colors={['#4f46e5', '#6366f1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.miAmountBar}>
                  <View style={styles.miTileHead}>
                    <FontAwesome5 name="coins" size={11} color="#fff" />
                    <Text style={[styles.miTileLabel, { color: '#fff' }]}>ยอดเงิน</Text>
                  </View>
                  <Text style={styles.miAmountValue}>{num(d.amount)} บาท</Text>
                </LinearGradient>

                {/* ส่วนเสริมนอก AC: ยอดแยก VAT (#d_vat_box :5214-5223) — เฉพาะเอกสารที่กรอกเป็นราคาก่อน/รวม VAT และยอดยังตรงกับยอดจ่ายจริง */}
                {!!d.vat_breakdown && (
                  <View style={nonacStyles.vatBox}>
                    <Text style={nonacStyles.vatEntered}>
                      ยอดที่กรอก: {d.vat_breakdown.mode === 'base' ? `ราคาก่อน VAT ${num(d.vat_breakdown.base)}` : `ราคารวม VAT ${num(d.vat_breakdown.gross)}`} บาท
                    </Text>
                    {([
                      ['ราคาก่อน VAT', d.vat_breakdown.base, '#0f172a'],
                      [d.vat_breakdown.base > 0 ? `VAT ${d.vat_breakdown.rate}%` : 'VAT', d.vat_breakdown.vat, '#10b981'],
                      ['ราคารวม VAT', d.vat_breakdown.gross, '#0f172a'],
                      ['หัก ณ ที่จ่าย', Number(d.wht_amount ?? 0), '#ef4444'],
                      ['ยอดจ่ายจริง', Number(d.amount ?? 0), '#4f46e5'],
                    ] as const).map(([label, value, color]) => (
                      <View key={label} style={nonacStyles.vatRow}>
                        <Text style={nonacStyles.vatLabel}>{label}</Text>
                        <Text style={[nonacStyles.vatValue, { color }]}>{num(value)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {!isAc && (
                  <View style={styles.miBlock}>
                    <Text style={styles.miTileLabel}>รายละเอียดงาน</Text>
                    <Text style={styles.miDesc}>{d.description?.trim() || '-'}</Text>
                  </View>
                )}

                {!isAc && !!d.wht_tax && d.wht_tax !== 'ไม่มี' && (
                  <View style={styles.miBlock}>
                    <Text style={[styles.miTileLabel, { color: '#ef4444' }]}>WHT</Text>
                    <Text style={styles.miWht}>
                      {d.wht_tax}
                      {Number(d.wht_amount) > 0 ? ` (${num(Number(d.wht_amount))} บ.)` : ''}
                    </Text>
                    {Number(d.wht_amount) > 0 && (
                      <Text style={styles.miWhtSub}>
                        ยอดเต็มก่อนหัก <Text style={styles.miWhtGross}>{num(Number(d.amount) + Number(d.wht_amount))}</Text> บาท
                      </Text>
                    )}
                  </View>
                )}

                <View style={styles.miBlock}>
                  <View style={styles.miTileHead}>
                    <Ionicons name="attach" size={12} color="#475569" />
                    <Text style={styles.miTileLabel}>เอกสารแนบ</Text>
                  </View>
                  {attachments.length === 0 ? (
                    <Text style={styles.miDesc}>-</Text>
                  ) : (
                    attachments.map((a) => (
                      <View key={a} style={styles.miAttachRow}>
                        <Ionicons name="checkmark-circle" size={16} color="#1e293b" />
                        <Text style={styles.miDesc}>{a}</Text>
                      </View>
                    ))
                  )}
                  {/* ส่วนเสริมนอก AC: ไฟล์แนบจากผู้เปิดเอกสาร (tax7_file) แบบเว็บ (js buildDocAttachFilesHtml :173, :431) */}
                  {arr(d.tax7_files).length > 0 && (
                    <View style={{ marginTop: 8, gap: 6 }}>
                      <Text style={styles.miTileLabel}>ไฟล์แนบจากผู้เปิดเอกสาร ({arr(d.tax7_files).length} ไฟล์)</Text>
                      {arr(d.tax7_files).map((f, i) => (
                        <TouchableOpacity key={`t7${i}`} style={styles.fileLinkBtn} onPress={() => viewAttachedFile(f, rootUploadUrl(f))}>
                          <Ionicons name="image-outline" size={15} color="#4f46e5" />
                          <Text style={styles.fileLinkText}>ดูไฟล์ {i + 1}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {/* หมายเหตุสถานะ (tax_status_note) — กดแก้ไขได้ เปิดโมดัลเดิมของป้ายประเภทเอกสาร */}
                  <View style={styles.miStatusNote}>
                    <View style={styles.miStatusNoteHead}>
                      <Ionicons name="information-circle" size={13} color="#9a3412" />
                      <Text style={styles.miStatusNoteLabel}>หมายเหตุสถานะ:</Text>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                        onPress={() => setStatusNoteModal({ visible: true, doc: d, text: d.tax_status_note ?? '', saving: false })}
                        hitSlop={8}
                      >
                        <Ionicons name="pencil" size={12} color="#ea580c" />
                        <Text style={styles.miStatusNoteEdit}>แก้ไข</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.miStatusNoteText}>{d.tax_status_note?.trim() || '-'}</Text>
                  </View>
                </View>

                <Text style={styles.miFooter}>บันทึกเมื่อ {fmtDateTimeCE(d.created_at)}</Text>
              </View>
              )}
            </View>

            {/* AC (เคลียร์เงินทดรอง): กล่องร้านค้า + ช่องรับใบกำกับ 3 ฝ่ายรายกล่อง — โชว์แม้เอกสารถูกยกเลิก (ไม่มีปุ่ม) */}
            {isAc && renderAcItemsSection(d)}

            {!isCancelled && (
              <>
                <View style={styles.section}>
                  {renderSectionTitle('git-commit-outline', 'สถานะเอกสาร')}
                  {renderStatusBoxes(d)}
                  {/* ส่วนเสริมนอก AC: ยกเลิกการรับของการเงิน (เฉพาะคนที่กดรับ) + ประวัติยกเลิกการรับ (มีเมื่อเคยยกเลิก) — :4050-4061, :4158-4164 */}
                  {(truthy(d.can_cancel_finance_receive) || Number(d.fin_cancel_count ?? 0) > 0) && (
                    <View style={nonacStyles.btnRow}>
                      {truthy(d.can_cancel_finance_receive) && (
                        <TouchableOpacity style={nonacStyles.outlineRed} onPress={() => setFinCancelModal({ visible: true, doc: d, remark: '' })}>
                          <Ionicons name="arrow-undo" size={12} color="#dc2626" />
                          <Text style={nonacStyles.outlineRedText}>ยกเลิกการรับ (การเงิน)</Text>
                        </TouchableOpacity>
                      )}
                      {Number(d.fin_cancel_count ?? 0) > 0 && (
                        <TouchableOpacity style={nonacStyles.outlineGray} onPress={() => openFinHistory(d)}>
                          <Ionicons name="time-outline" size={12} color="#475569" />
                          <Text style={nonacStyles.outlineGrayText}>ประวัติยกเลิกการรับ ({Number(d.fin_cancel_count)})</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  {/* เช็คสถานะการเงินตรงๆ แทน stageOf(d) — ตอนนี้การเงินกับอนุมัติเป็นอิสระต่อกันแล้ว
                      (ดูคอมเมนต์ป้ายสถานะด้านบน) ปุ่มแนบสลิปจึงต้องโผล่ตามสถานะการเงินเพียงอย่างเดียว
                      ไม่ใช่ต้องรออนุมัติก่อนด้วยเหมือนที่ stageOf() รวมไว้แต่เดิม */}
                  {/* ปุ่มแนบ + ปุ่มดูรูปที่แนบแล้ว จัดเป็น 2 คอลัมน์ตรงกัน (ปกติ/เต็ม) แทนการแยกเป็นแถว
                      "ไฟล์สลิป" ต่างหากด้านล่าง — กดดูรูปได้ทันทีใต้ปุ่มแนบของสลิปประเภทเดียวกัน */}
                  {!isCancelled && perms.can_save_finance && (truthy(d.is_finance_received) || !!d.finance_receiver) && (
                    <View style={styles.slipBtnRow}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <TouchableOpacity
                          style={[styles.slipBtn, slipFiles.length > 0 ? styles.slipBtnFilled : styles.slipBtnEmpty]}
                          onPress={() => openFinanceModal(d)}
                        >
                          <Ionicons name={slipFiles.length > 0 ? 'document-text' : 'cloud-upload-outline'} size={12} color={slipFiles.length > 0 ? '#047857' : '#ef4444'} />
                          <Text style={[styles.slipBtnText, { color: slipFiles.length > 0 ? '#047857' : '#ef4444' }]} numberOfLines={1}>
                            {slipFiles.length > 0 ? `ดู/แนบเพิ่มสลิปปกติ (${slipFiles.length})` : 'แนบสลิปปกติ'}
                          </Text>
                        </TouchableOpacity>
                        {slipFiles.map((f, i) => (
                          <TouchableOpacity key={`s${i}`} style={styles.fileLinkBtn} onPress={() => viewAttachedFile(f, slipUrl(f))}>
                            <Ionicons name="image-outline" size={15} color="#4f46e5" />
                            <Text style={styles.fileLinkText}>ดูรูปสลิป {i + 1}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <TouchableOpacity
                          style={[styles.slipBtn, slipFullFiles.length > 0 ? styles.slipBtnFilledBlue : styles.slipBtnEmpty]}
                          onPress={() => openFinanceModal(d)}
                        >
                          <Ionicons name={slipFullFiles.length > 0 ? 'document-attach' : 'cloud-upload-outline'} size={12} color={slipFullFiles.length > 0 ? '#047857' : '#ef4444'} />
                          <Text style={[styles.slipBtnText, { color: slipFullFiles.length > 0 ? '#047857' : '#ef4444' }]} numberOfLines={1}>
                            {slipFullFiles.length > 0 ? `ดู/แนบเพิ่มสลิปเต็ม (${slipFullFiles.length})` : 'แนบสลิปเต็ม'}
                          </Text>
                        </TouchableOpacity>
                        {slipFullFiles.map((f, i) => (
                          <TouchableOpacity key={`f${i}`} style={styles.fileLinkBtn} onPress={() => viewAttachedFile(f, slipUrl(f))}>
                            <Ionicons name="image-outline" size={15} color="#4f46e5" />
                            <Text style={styles.fileLinkText}>ดูรูปเต็ม {i + 1}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                <View style={styles.section}>
                  {renderSectionTitle('receipt-outline', 'ใบกำกับภาษี (3 แผนก)')}
                  {(() => {
                    const f = followUpOf(d);
                    return (
                      <View style={styles.actionRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.actionRowLabel}>กำหนดติดตาม (30 วัน)</Text>
                          {!f && <Text style={styles.actionRowSub}>-</Text>}
                        </View>
                        {f && <FollowUpBadge f={f} />}
                      </View>
                    );
                  })()}
                  {isAc ? (
                    // AC: ไม่มีช่องรับบนหัวเอกสาร (เว็บไม่มีปุ่ม) — สรุปการลงรับของแต่ละกล่องแทน
                    renderAcTaxSummary(d)
                  ) : !isTaxDoc && !d.wh_tax_receiver && !d.tax_receiver && !d.acc_receiver ? (
                    // ไม่ใช่เอกสารภาษีแต่มีแผนกลงรับไว้แล้ว (เปลี่ยนประเภททีหลัง) — เว็บยังโชว์ช่องที่รับแล้ว + ปุ่มบัญชีถ้าจัดซื้อรับแล้ว (:4563)
                    <Text style={styles.deptNaText}>— ไม่ใช่เอกสารประเภทใบกำกับภาษี —</Text>
                  ) : (
                    <>
                      {/* stepper ภาพรวม 3 แผนก คลัง -> จัดซื้อ -> บัญชี ก่อนรายละเอียด/ปุ่มกดจริงแต่ละแผนกด้านล่าง */}
                      <Stepper
                        steps={(['warehouse', 'purchase', 'accounting'] as DeptKey[]).map((key) => {
                          const meta = DEPT_META[key];
                          const { receiver } = deptFields(d, key);
                          return { key, label: meta.label, icon: meta.icon, color: '#059669', state: receiver ? 'done' : 'pending' };
                        })}
                      />
                      {(['warehouse', 'purchase', 'accounting'] as DeptKey[]).map((key) => {
                        const meta = DEPT_META[key];
                        const { receiver, receivedAt } = deptFields(d, key);
                        const received = !!receiver;

                        // ส่วนเสริมนอก AC: ปุ่มรับของคลัง/จัดซื้อมีเฉพาะเอกสารภาษี · บัญชีมีเมื่อเป็นเอกสารภาษีหรือจัดซื้อรับแล้ว (:4360, :4454, :4563)
                        if (!received && !isTaxDoc && !(key === 'accounting' && !!d.tax_receiver)) {
                          return (
                            <View key={key} style={styles.actionRow}>
                              <Text style={styles.actionRowLabel}>{meta.label} (รับใบกำกับ)</Text>
                              <Text style={styles.actionRowSub}>-</Text>
                            </View>
                          );
                        }

                        if (!received) {
                          return (
                            <View key={key} style={styles.actionRow}>
                              <Text style={styles.actionRowLabel}>{meta.label} (รับใบกำกับ)</Text>
                              <ActionPill
                                icon={meta.icon}
                                label={`${meta.label}รับเอกสาร`}
                                bg={meta.color}
                                onPress={() => {
                                  if (!perms.can_receive_tax) {
                                    Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์รับใบกำกับภาษี');
                                    return;
                                  }
                                  // ไฟล์ใบกำกับที่แผนกก่อนหน้าบันทึกไว้ถูกดึงมาเป็นช่องรอให้อัตโนมัติ (ไม่ต้องแนบซ้ำ กดเอาออกได้)
                                  openDeptReceive(d, key);
                                }}
                              />
                            </View>
                          );
                        }

                        return (
                          <View
                            key={key}
                            style={[
                              styles.deptReceivedCard,
                              { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', borderLeftWidth: 4, borderLeftColor: '#059669' },
                            ]}
                          >
                            <View style={styles.deptReceivedHead}>
                              <Ionicons name={meta.icon} size={14} color="#059669" />
                              <Text style={[styles.deptReceivedLabel, { color: '#059669' }]}>{meta.label}รับใบกำกับแล้ว</Text>
                            </View>
                            <Text style={styles.deptReceivedName}>{receiver}</Text>
                            {!!receivedAt && <Text style={styles.deptReceivedAt}>{formatShortThaiDateTime(receivedAt)}</Text>}
                            <View style={styles.deptReceivedBtnRow}>
                              <TouchableOpacity
                                style={styles.outlineBtnGreen}
                                onPress={() => setDeptDetailModal({ visible: true, doc: d, dept: key })}
                              >
                                <Ionicons name="search" size={11} color="#059669" />
                                <Text style={styles.outlineBtnGreenText}>ดูรายละเอียด</Text>
                              </TouchableOpacity>
                              {perms[meta.cancelPerm] && (
                                // สิทธิ์รายแผนก (btn_cancel_receive_wh/_buyer/_acc) แบบเว็บ — มีรหัสของแผนกไหนเห็นปุ่มของแผนกนั้นเท่านั้น
                                // โทนเทากลางแทนแดง — มี Alert ยืนยันก่อนอยู่แล้ว (askCancelStepReceive) ไม่ต้องตะโกนด้วยสี
                                <TouchableOpacity style={styles.outlineBtnNeutral} onPress={() => askCancelStepReceive(d, key)}>
                                  <Ionicons name="close-circle-outline" size={11} color="#64748b" />
                                  <Text style={styles.outlineBtnNeutralText}>ยกเลิกการรับ</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </>
                  )}

                  {isTaxReturned && (
                    <View style={styles.actionRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.actionRowLabel}>ตีกลับใบกำกับภาษี</Text>
                        <Text style={styles.actionRowSub} numberOfLines={2}>
                          ตีกลับแล้ว — {d.return_tax_remark ?? ''}
                        </Text>
                        {/* ส่วนเสริมนอก AC: ผู้ตีกลับ + เวลา แบบเว็บ (:4589-4598) */}
                        <Text style={nonacStyles.histLine}>โดย {d.return_tax_by || '-'} · {formatShortThaiDateTime(d.return_tax_at)}</Text>
                      </View>
                      <ActionPill
                        icon="arrow-undo"
                        label="ดู/ยกเลิก"
                        bg="#64748b"
                        onPress={() => (perms.can_return_document ? setReturnTaxModal({ visible: true, doc: d, text: d.return_tax_remark ?? '' }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ตีกลับใบกำกับภาษี'))}
                      />
                    </View>
                  )}
                  {/* ส่วนเสริมนอก AC: ประวัติยกเลิกการตีกลับใบกำกับ (:4619-4627) */}
                  {!isTaxReturned && !!d.cancel_return_tax_by && (
                    <Text style={nonacStyles.histLine}>ยกเลิกการตีกลับใบกำกับโดย {d.cancel_return_tax_by} ({formatShortThaiDateTime(d.cancel_return_tax_at)})</Text>
                  )}
                </View>

                <View style={styles.section}>
                  {renderSectionTitle('card-outline', 'เครดิต / การชำระเงิน')}
                  {(() => {
                    const credit = creditStatus(d);
                    const creditColor = credit ? CREDIT_TONE_COLORS[credit.tone] : '#64748b';
                    return (
                      <View style={styles.actionRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.actionRowLabel}>เครดิต</Text>
                          {credit && (
                            <Text style={[styles.actionRowSub, { color: creditColor, fontWeight: '700' }]}>
                              {credit.term} วัน · {credit.isPaid ? 'จ่ายแล้ว' : credit.diffDays < 0 ? 'เกินกำหนด' : `เหลือ ${credit.diffDays} วัน`} · ครบ {credit.dueShow}
                            </Text>
                          )}
                        </View>
                        <ActionPill
                          icon={credit ? 'create' : 'add'}
                          label={credit ? 'แก้ไข' : 'ระบุ'}
                          bg={creditColor}
                          onPress={() => (perms.can_update_credit ? setCreditModal({ visible: true, doc: d }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ตั้งค่าเครดิต'))}
                        />
                      </View>
                    );
                  })()}
                  {renderCreditSteps(d)}
                </View>

                <View style={styles.section}>
                  {renderSectionTitle('ellipsis-horizontal-circle-outline', 'อื่นๆ')}
                  {/* ตีกลับ: โชว์ในเนื้อหาเฉพาะตอน "ตีกลับแล้ว" (เป็นข้อมูลสถานะ) — การเริ่มตีกลับย้ายไปเมนู ⋯ */}
                  {isReturned && (
                    <View style={styles.actionRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.actionRowLabel}>ตีกลับเอกสาร (ตั้งโอน)</Text>
                        <Text style={styles.actionRowSub} numberOfLines={2}>
                          ตีกลับแล้ว — {d.return_remark}
                        </Text>
                        {/* ส่วนเสริมนอก AC: ผู้ตีกลับ + เวลา แบบเว็บ (:4243-4254) */}
                        <Text style={nonacStyles.histLine}>โดย {d.return_doc_by || '-'} · {formatShortThaiDateTime(d.return_doc_at)}</Text>
                      </View>
                      <ActionPill
                        icon="arrow-undo"
                        label="ดู/ยกเลิก"
                        bg="#64748b"
                        onPress={() => (perms.can_return_document ? setReturnModal({ visible: true, doc: d, text: d.return_remark ?? '' }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ตีกลับเอกสาร'))}
                      />
                    </View>
                  )}
                  {/* ส่วนเสริมนอก AC: ประวัติยกเลิกการตีกลับเอกสาร (:4280-4291) */}
                  {!isReturned && !!d.cancel_return_by && (
                    <Text style={nonacStyles.histLine}>ยกเลิกการตีกลับโดย {d.cancel_return_by} ({formatShortThaiDateTime(d.cancel_return_at)})</Text>
                  )}
                  <View style={styles.actionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actionRowLabel}>คืนเงินจากซัพพลายเออร์</Text>
                      {truthy(d.is_refunded) && (
                        // ส่วนเสริมนอก AC: ผู้บันทึก + จำนวนไฟล์แนบ แบบปุ่ม "คืนเงินแล้ว" ของเว็บ (:4701-4712)
                        <Text style={[styles.actionRowSub, { color: '#059669' }]}>
                          คืนแล้ว {formatShortThaiDateTime(d.refund_at)}
                          {d.refund_by ? ` · ${d.refund_by}` : ''}
                          {arr(d.refund_files).length > 0 ? ` · แนบ ${arr(d.refund_files).length} ไฟล์` : ''}
                        </Text>
                      )}
                    </View>
                    <ActionPill
                      icon={truthy(d.is_refunded) ? 'checkmark-circle' : 'refresh'}
                      label={truthy(d.is_refunded) ? 'คืนแล้ว' : 'คืนเงิน'}
                      bg={truthy(d.is_refunded) ? '#059669' : '#f59e0b'}
                      onPress={() => (perms.can_save_refund ? openRefundModal(d) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์บันทึกการคืนเงิน'))}
                    />
                  </View>

                  <View style={styles.actionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actionRowLabel}>หมายเหตุ</Text>
                      {/* ส่วนเสริมนอก AC: หมายเหตุทั่วไป (ตัดบรรทัด [ผู้ซื้อรับใบกำกับ]/[บัญชีรับใบกำกับ] ออกแบบเว็บ :3863-3876) + ผู้บันทึก */}
                      {!!(d.doc_note_general ?? d.doc_note) && (
                        <Text style={styles.actionRowSub} numberOfLines={2}>
                          {d.doc_note_general ?? d.doc_note}
                        </Text>
                      )}
                      {!!(d.doc_note_general ?? d.doc_note) && !!d.doc_note_by && <Text style={nonacStyles.histLine}>โดย: {d.doc_note_by}</Text>}
                    </View>
                    <ActionPill
                      icon="create"
                      label={d.doc_note ? 'แก้ไข' : 'บันทึก'}
                      bg="#64748b"
                      onPress={() => (perms.can_save_note ? setNoteModal({ visible: true, doc: d, text: d.doc_note ?? '' }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์บันทึกหมายเหตุ'))}
                    />
                  </View>

                  {/* เดิมเป็นปุ่มไอคอนล้วน (นาฬิกา/ดินสอ/✕) ไม่รู้ว่ากดแล้วทำอะไร — ใส่ข้อความกำกับ
                      ส่วนปุ่ม ✕ ยกเลิกเอกสาร (ทำลายข้อมูล) ย้ายไปอยู่ในเมนู ⋯ ด้านบนแทน */}
                  <View style={styles.moreActionsRow}>
                    <TouchableOpacity style={styles.labeledBtn} onPress={() => openHistory(d)}>
                      <Ionicons name="time-outline" size={14} color="#475569" />
                      <Text style={styles.labeledBtnText}>ประวัติ</Text>
                    </TouchableOpacity>
                    {perms.can_edit_document && d.doc_type !== 'AC' && (
                      <TouchableOpacity style={styles.labeledBtn} onPress={() => setSubmitScreen({ visible: true, docId: String(docId(d)) })}>
                        <Ionicons name="create-outline" size={14} color="#475569" />
                        <Text style={styles.labeledBtnText}>แก้ไขเอกสาร</Text>
                      </TouchableOpacity>
                    )}
                    {/* AC (เคลียร์เงินทดรอง) มีหลายกล่องร้านค้า ฟอร์มแก้ไขในแอปรองรับไม่ได้ — ให้ไปแก้ที่หน้าเว็บ */}
                    {perms.can_edit_document && d.doc_type === 'AC' && (
                      <View style={styles.acEditNote}>
                        <Ionicons name="desktop-outline" size={13} color="#64748b" />
                        <Text style={styles.acEditNoteText}>เอกสาร AC แก้ไขได้ที่หน้าเว็บ</Text>
                      </View>
                    )}
                    {!perms.can_edit_document && !d.has_pending_request && (
                      <TouchableOpacity
                        style={styles.notifyReqBtn}
                        onPress={() => setDocRequestModal({ visible: true, doc: d, requestType: 'edit', remark: '' })}
                      >
                        <Ionicons name="notifications" size={13} color="#b45309" />
                        <Text style={styles.notifyReqBtnText}>แจ้ง</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </>
            )}
          </ScrollView>

          {renderSlipRemindModal('detail')}

          {/* เมนู ⋯ — ซ้อนอยู่ในโมดัลรายละเอียด ปิดเมนูก่อนแล้วค่อยเปิดโมดัลกรอกเหตุผลของรายการที่เลือก */}
          <Modal visible={moreMenuOpen} transparent animationType="fade" onRequestClose={() => setMoreMenuOpen(false)}>
            <View style={styles.sheetOverlay}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setMoreMenuOpen(false)} />
              <View style={styles.sheet}>
                <View style={styles.sheetHandle} />
                <Text style={styles.menuSheetHint}>รายการด้านล่างจะเปิดหน้ายืนยันให้กรอกเหตุผลก่อนเสมอ</Text>
                {menuItems.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={styles.menuSheetItem}
                    onPress={() => {
                      setMoreMenuOpen(false);
                      m.onPress();
                    }}
                  >
                    <Ionicons name={m.icon} size={18} color="#dc2626" />
                    <Text style={styles.menuSheetItemText}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.sheetResetBtn} onPress={() => setMoreMenuOpen(false)}>
                  <Text style={styles.sheetResetBtnText}>ปิด</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* โมดัล action ที่เปิดจากหน้านี้ (รับใบกำกับ/อนุมัติ/ลงรับ/ดูรูป ฯลฯ) ต้องซ้อนอยู่ "ใน" โมดัลนี้ — ถ้าวางเป็นพี่น้องที่ root
              โมดัลรายละเอียดจะทับไว้ ต้องปิดหน้านี้ก่อนถึงจะเห็น (หลักเดียวกับ renderSlipRemindModal) */}
          {actionModalsInDetail && renderActionModals()}
          {/* AC: ป๊อปอัปรับใบกำกับรายกล่องร้านค้า — เปิดจากหน้านี้เท่านั้น จึงซ้อนอยู่ในนี้ */}
          {renderAcModals('detail')}
        </View>
      </Modal>
    );
  }

  // โมดัล action ทั้งหมด — render ที่เดียวต่อครั้ง: ซ้อนในโมดัลรายละเอียดถ้าเปิดค้างอยู่ ไม่งั้นที่ root (ดู actionModalsInDetail)
  function renderActionModals() {
    return (
      <>
        {/* Modal: อนุมัติ */}
        <ModalShell visible={approveModal.visible} title="✍️ ลงนามผู้อนุมัติ" color="#4f46e5" onClose={() => setApproveModal({ visible: false })}>
          <FieldLabel text="ผู้อนุมัติ" />
          <View style={styles.readonlyInput}>
            <Text style={styles.readonlyInputText}>{user?.fullname ?? '-'}</Text>
          </View>
          <Text style={styles.hintText}>ระบบจะบันทึกเวลาปัจจุบันให้อัตโนมัติ</Text>
          <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#4f46e5', opacity: approveModal.saving ? 0.6 : 1 }]} onPress={confirmApprove} disabled={approveModal.saving}>
            <Text style={styles.modalSaveBtnText}>{approveModal.saving ? 'กำลังบันทึก...' : 'ยืนยัน'}</Text>
          </TouchableOpacity>
        </ModalShell>

        {/* Modal: การเงินรับเอกสาร */}
        <ModalShell visible={financeModal.visible} title="💰 ลงรับเอกสาร / แนบสลิป" color="#d97706" onClose={() => setFinanceModal({ visible: false, slip: [], full: [] })}>
          <FieldLabel text="ผู้ทำรายการ" />
          <View style={styles.readonlyInput}>
            <Text style={styles.readonlyInputText}>{user?.fullname ?? '-'}</Text>
          </View>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() =>
              askPickImage((f) => {
                if (!checkExt(f.name, master?.upload_limits?.allowed_extensions_slip)) {
                  Alert.alert('ไฟล์ไม่รองรับ', 'นามสกุลไฟล์นี้ไม่อยู่ในรายการที่อนุญาต');
                  return;
                }
                setFinanceModal((s) => ({ ...s, slip: [...s.slip, f] }));
              })
            }
          >
            <Ionicons name="attach-outline" size={14} color="#d97706" />
            <Text style={styles.attachBtnText}>อัปโหลดสลิปปกติ ({financeModal.slip.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() =>
              askPickImage((f) => {
                if (!checkExt(f.name, master?.upload_limits?.allowed_extensions_slip)) {
                  Alert.alert('ไฟล์ไม่รองรับ', 'นามสกุลไฟล์นี้ไม่อยู่ในรายการที่อนุญาต');
                  return;
                }
                setFinanceModal((s) => ({ ...s, full: [...s.full, f] }));
              })
            }
          >
            <Ionicons name="attach-outline" size={14} color="#d97706" />
            <Text style={styles.attachBtnText}>อัปโหลดสลิปฉบับเต็ม ({financeModal.full.length})</Text>
          </TouchableOpacity>
          {/* ส่วนเสริมนอก AC: สลิปที่แนบไว้แล้ว — ดู/ลบได้แบบป๊อปอัพเว็บ (renderSlipOldFiles) ลบจริงตอนบันทึก (เซิร์ฟเวอร์ย้ายลงถังขยะ) */}
          {(['slip', 'full'] as const).map((kind) => {
            const doc = financeModal.doc;
            const kept = kind === 'slip' ? financeModal.keepSlip ?? arr(doc?.slip_files) : financeModal.keepFull ?? arr(doc?.slip_full_files);
            if (kept.length === 0) return null;
            return (
              <View key={kind}>
                <FieldLabel text={`${kind === 'slip' ? 'สลิปปกติ' : 'สลิปเต็ม'}ที่แนบไว้แล้ว (${kept.length})`} />
                {kept.map((f, i) => (
                  <View key={f} style={styles.refundOldFileRow}>
                    <Ionicons name="attach" size={14} color="#065f46" />
                    <Text style={styles.refundOldFileName} numberOfLines={1}>
                      ไฟล์ {i + 1}
                    </Text>
                    <TouchableOpacity style={styles.refundOldFileView} onPress={() => viewAttachedFile(f, slipUrl(f))}>
                      <Ionicons name="eye-outline" size={13} color="#059669" />
                      <Text style={styles.refundOldFileViewText}>ดู</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.refundOldFileDel}
                      onPress={() =>
                        setFinanceModal((s) =>
                          kind === 'slip'
                            ? { ...s, keepSlip: (s.keepSlip ?? arr(s.doc?.slip_files)).filter((x) => x !== f) }
                            : { ...s, keepFull: (s.keepFull ?? arr(s.doc?.slip_full_files)).filter((x) => x !== f) },
                        )
                      }
                    >
                      <Ionicons name="trash-outline" size={13} color="#ef4444" />
                      <Text style={styles.refundOldFileDelText}>ลบ</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            );
          })}
          <Text style={styles.hintText}>ไฟล์ที่กดลบจะออกจากเอกสารตอนกดบันทึก</Text>
          <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#d97706', opacity: financeModal.saving ? 0.6 : 1 }]} onPress={confirmFinance} disabled={financeModal.saving}>
            <Text style={styles.modalSaveBtnText}>{financeModal.saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</Text>
          </TouchableOpacity>
          {imagePreviewHost === 'finance' && renderImagePreview()}
        </ModalShell>

        {/* Modal: บันทึกโน้ต */}
        <ModalShell visible={noteModal.visible} title="📝 บันทึกข้อความ" color="#475569" onClose={() => setNoteModal({ visible: false, text: '' })}>
          <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุข้อความ..." placeholderTextColor="#94a3b8" multiline value={noteModal.text} onChangeText={(v) => setNoteModal((s) => ({ ...s, text: v }))} />
          <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#475569', opacity: noteModal.saving ? 0.6 : 1 }]} onPress={confirmNote} disabled={noteModal.saving}>
            <Text style={styles.modalSaveBtnText}>{noteModal.saving ? 'กำลังบันทึก...' : 'บันทึก'}</Text>
          </TouchableOpacity>
        </ModalShell>

        {/* Modal: ตีกลับเอกสาร */}
        <ModalShell visible={returnModal.visible} title={truthy(returnModal.doc?.is_returned) ? '↩️ ยกเลิกการตีกลับ' : '⚠️ ตีกลับเอกสาร (ตั้งโอน)'} color="#ef4444" onClose={() => setReturnModal({ visible: false, text: '' })}>
          {!truthy(returnModal.doc?.is_returned) && (
            <>
              <FieldLabel text="เหตุผลที่ตีกลับ" required />
              <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุเหตุผล..." placeholderTextColor="#94a3b8" multiline value={returnModal.text} onChangeText={(v) => setReturnModal((s) => ({ ...s, text: v }))} />
            </>
          )}
          <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#ef4444', opacity: returnModal.saving ? 0.6 : 1 }]} onPress={confirmReturn} disabled={returnModal.saving}>
            <Text style={styles.modalSaveBtnText}>{truthy(returnModal.doc?.is_returned) ? 'ยืนยันยกเลิกการตีกลับ' : 'ยืนยันตีกลับ'}</Text>
          </TouchableOpacity>
        </ModalShell>

        {/* Modal: ตีกลับใบกำกับภาษี */}
        <ModalShell visible={returnTaxModal.visible} title={truthy(returnTaxModal.doc?.is_tax_returned) ? '↩️ ยกเลิกการตีกลับใบกำกับ' : '⚠️ ตีกลับใบกำกับภาษี'} color="#ef4444" onClose={() => setReturnTaxModal({ visible: false, text: '' })}>
          {!truthy(returnTaxModal.doc?.is_tax_returned) && (
            <>
              <FieldLabel text="เหตุผลที่ตีกลับ" required />
              <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุเหตุผล..." placeholderTextColor="#94a3b8" multiline value={returnTaxModal.text} onChangeText={(v) => setReturnTaxModal((s) => ({ ...s, text: v }))} />
            </>
          )}
          <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#ef4444', opacity: returnTaxModal.saving ? 0.6 : 1 }]} onPress={confirmReturnTax} disabled={returnTaxModal.saving}>
            <Text style={styles.modalSaveBtnText}>{truthy(returnTaxModal.doc?.is_tax_returned) ? 'ยืนยันยกเลิกการตีกลับ' : 'ยืนยันตีกลับ'}</Text>
          </TouchableOpacity>
        </ModalShell>

        {/* Modal: เครดิต */}
        <ModalShell visible={creditModal.visible} title="📅 ระบุเครดิต (Credit Term)" color="#4f46e5" onClose={() => setCreditModal({ visible: false })}>
          <FieldLabel text="เลือกเครดิต (วัน)" />
          <View style={styles.creditOptionsRow}>
            {CREDIT_OPTIONS.map((c) => (
              <TouchableOpacity key={c} style={styles.creditOption} onPress={() => confirmCredit(c)} disabled={creditModal.saving}>
                <Text style={styles.creditOptionText}>{c} วัน</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ModalShell>

        {/* Modal: คืนเงินจากซัพพลายเออร์ */}
        <ModalShell
          visible={refundModal.visible}
          title="💸 คืนเงินจากซัพพลายเออร์"
          color="#059669"
          onClose={() => setRefundModal({ visible: false, date: '', time: '', note: '', files: [], keepFiles: [] })}
        >
          <FieldLabel text="ผู้ทำรายการ" />
          <View style={styles.readonlyInput}>
            <Text style={styles.readonlyInputText}>{user?.fullname ?? '-'}</Text>
          </View>
          {/* วัน + เวลาคืนเงิน แบบป๊อปอัพเว็บ (flatpickr enableTime) — ค่าเริ่มต้นคือตอนนี้ ถ้าเคยบันทึกแล้วใช้ค่าเดิม */}
          <FieldLabel text="วันที่คืนเงิน" required />
          <View style={styles.formRow}>
            <View style={styles.formRowCol}>
              <DateField value={refundModal.date} onChange={(v) => setRefundModal((s) => ({ ...s, date: v }))} placeholder="เลือกวันที่" />
            </View>
            <View style={styles.formRowCol}>
              <TimeField value={refundModal.time} onChange={(v) => setRefundModal((s) => ({ ...s, time: v }))} placeholder="เลือกเวลา" />
            </View>
          </View>
          <Text style={styles.hintText}>
            {refundModal.doc?.refund_by ? `บันทึกไว้โดย ${refundModal.doc.refund_by} — แก้วันที่แล้วกดบันทึกซ้ำได้` : 'ค่าเริ่มต้นคือตอนนี้ เปลี่ยนเป็นวันที่คืนเงินจริงได้'}
          </Text>
          {/* ไฟล์ที่แนบไว้แล้ว — กดดูได้ / กดลบออกได้แบบเว็บ (ลบจริงตอนกดบันทึก เซิร์ฟเวอร์ย้ายลงถังขยะ) */}
          {refundModal.keepFiles.length > 0 && (
            <>
              <FieldLabel text={`ไฟล์ที่แนบไว้แล้ว (${refundModal.keepFiles.length})`} />
              {refundModal.keepFiles.map((f, i) => (
                <View key={f} style={styles.refundOldFileRow}>
                  <Ionicons name="attach" size={14} color="#065f46" />
                  <Text style={styles.refundOldFileName} numberOfLines={1}>
                    ไฟล์ {i + 1}
                  </Text>
                  <TouchableOpacity style={styles.refundOldFileView} onPress={() => viewAttachedFile(f, refundUrl(f))}>
                    <Ionicons name="eye-outline" size={13} color="#059669" />
                    <Text style={styles.refundOldFileViewText}>ดู</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.refundOldFileDel}
                    onPress={() => setRefundModal((s) => ({ ...s, keepFiles: s.keepFiles.filter((x) => x !== f) }))}
                  >
                    <Ionicons name="trash-outline" size={13} color="#ef4444" />
                    <Text style={styles.refundOldFileDelText}>ลบ</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
          <FieldLabel text="รายละเอียด" />
          <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุรายละเอียดการคืนเงิน..." placeholderTextColor="#94a3b8" multiline value={refundModal.note} onChangeText={(v) => setRefundModal((s) => ({ ...s, note: v }))} />
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() =>
              askPickImage((f) => {
                if (!checkExt(f.name, master?.upload_limits?.allowed_extensions)) {
                  Alert.alert('ไฟล์ไม่รองรับ', 'นามสกุลไฟล์นี้ไม่อยู่ในรายการที่อนุญาต');
                  return;
                }
                setRefundModal((s) => ({ ...s, files: [...s.files, f] }));
              })
            }
          >
            <Ionicons name="attach-outline" size={14} color="#059669" />
            <Text style={[styles.attachBtnText, { color: '#059669' }]}>แนบไฟล์ (สลิป/เอกสาร) ({refundModal.files.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#059669', opacity: refundModal.saving ? 0.6 : 1 }]} onPress={confirmRefund} disabled={refundModal.saving}>
            <Text style={styles.modalSaveBtnText}>{refundModal.saving ? 'กำลังบันทึก...' : 'บันทึกการคืนเงิน'}</Text>
          </TouchableOpacity>
          {imagePreviewHost === 'refund' && renderImagePreview()}
        </ModalShell>

        {/* Modal: ดูรายละเอียดที่แผนกรับใบกำกับไว้ — โชว์ไฟล์แนบจริง กดดูรูปได้ (แทน Alert ข้อความล้วนเดิม) */}
        <ModalShell
          visible={deptDetailModal.visible}
          title={deptDetailModal.dept ? `📂 ${DEPT_META[deptDetailModal.dept].label}รับใบกำกับแล้ว` : ''}
          color={deptDetailModal.dept ? DEPT_META[deptDetailModal.dept].color : '#4f46e5'}
          onClose={() => setDeptDetailModal({ visible: false })}
        >
          {deptDetailModal.doc && deptDetailModal.dept && (() => {
            // ส่วนเสริมนอก AC: ใช้ข้อมูลสดของหน้ารายละเอียด (หลังกู้คืนไฟล์ refreshAfterAction อัปเดต detailModal.doc ไม่ใช่ตัวนี้)
            const ddDoc = detailModal.doc && docId(detailModal.doc) === docId(deptDetailModal.doc) ? detailModal.doc : deptDetailModal.doc;
            const ddDept = deptDetailModal.dept;
            const { receiver, receivedAt, note } = deptFields(ddDoc, ddDept);
            // เลขที่ใบกำกับคู่กับไฟล์ทีละรายการแบบป๊อปอัพเว็บ (viewTaxDetails) — บัญชีใช้เลขที่คอลัมน์ tax_invoice_no
            const pairs = deptPairs(ddDoc, ddDept);
            const ddCancelled = truthy(ddDoc.is_cancelled);
            const ddTrashKey = `${docId(ddDoc)}|${DEPT_META[ddDept].apiKey}`;
            return (
              <>
                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>ผู้รับ</Text>
                  <Text style={styles.infoLineValue}>{receiver || '-'}</Text>
                </View>
                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>วันที่รับ</Text>
                  <Text style={styles.infoLineValue}>{receivedAt ? formatShortThaiDateTime(receivedAt) : '-'}</Text>
                </View>
                {!!note && (
                  <View style={styles.infoLine}>
                    <Text style={styles.infoLineLabel}>หมายเหตุ</Text>
                    <Text style={styles.infoLineValue}>{note}</Text>
                  </View>
                )}
                <FieldLabel text={`เลขที่ใบกำกับ / ไฟล์แนบ (${pairs.length})`} />
                {pairs.length === 0 ? (
                  <Text style={styles.deptNaText}>ไม่ระบุเลขที่ · ไม่มีไฟล์แนบ</Text>
                ) : (
                  pairs.map((p, i) => (
                    <View key={i} style={styles.taxPairBox}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.taxPairLabel}>เลขที่ใบกำกับ</Text>
                        <Text style={styles.taxPairInv}>{p.inv || '- ไม่ระบุเลขที่ -'}</Text>
                      </View>
                      {p.file ? (
                        <TouchableOpacity style={styles.fileLinkBtn} onPress={() => viewAttachedFile(p.file, rootUploadUrl(p.file))}>
                          <Ionicons name="image-outline" size={15} color="#4f46e5" />
                          <Text style={styles.fileLinkText}>ดูไฟล์</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.taxPairNoFile}>ไม่มีไฟล์แนบ</Text>
                      )}
                    </View>
                  ))
                )}

                {/* ส่วนเสริมนอก AC: "ไฟล์ที่ถูกลบ" ของช่องนี้ (get_file_trash) — เฉพาะคนมีสิทธิ์ยกเลิกการรับของแผนกนี้ ไม่มีไฟล์ = ซ่อน (js :1460-1510) */}
                {perms[DEPT_META[ddDept].cancelPerm] && deptTrash.key === ddTrashKey && (deptTrash.loading || !!deptTrash.error || deptTrash.rows.length > 0) && (
                  <View style={nonacStyles.trashBox}>
                    <Text style={nonacStyles.trashHead}>ไฟล์ที่ถูกลบ {deptTrash.rows.length > 0 ? `(${deptTrash.rows.length})` : ''}</Text>
                    {deptTrash.loading ? (
                      <ActivityIndicator color="#64748b" />
                    ) : deptTrash.error ? (
                      <Text style={nonacStyles.trashErr}>{deptTrash.error}</Text>
                    ) : (
                      deptTrash.rows.map((r) => (
                        <View key={r.id} style={nonacStyles.trashItem}>
                          <View style={{ flex: 1 }}>
                            {r.file_exists ? (
                              <TouchableOpacity onPress={() => viewAttachedFile(r.file_name, `${API_BASE}/${r.file_url}`)}>
                                <Text style={nonacStyles.trashFile} numberOfLines={1}>{r.file_name.split('_').pop() || r.file_name}</Text>
                              </TouchableOpacity>
                            ) : (
                              <Text style={[nonacStyles.trashFile, { color: '#94a3b8' }]} numberOfLines={1}>{r.file_name.split('_').pop() || r.file_name}</Text>
                            )}
                            {!!r.invoice_no && <Text style={nonacStyles.trashMeta}>เลขที่ใบกำกับ: {r.invoice_no}</Text>}
                            <Text style={nonacStyles.trashMeta}>
                              ลบโดย {r.deleted_by || '-'} · {formatShortThaiDateTime(r.deleted_at)} · {r.source_label}
                            </Text>
                          </View>
                          {!r.file_exists ? (
                            <Text style={nonacStyles.trashMeta}>ไม่พบไฟล์</Text>
                          ) : !ddCancelled && truthy(r.can_restore) ? (
                            <TouchableOpacity
                              style={[nonacStyles.restoreBtn, deptTrash.restoringId === r.id && { opacity: 0.6 }]}
                              disabled={!!deptTrash.restoringId}
                              onPress={() => askRestoreTrash(r)}
                            >
                              <Ionicons name="arrow-undo" size={12} color="#fff" />
                              <Text style={nonacStyles.restoreBtnText}>{deptTrash.restoringId === r.id ? '...' : 'กู้คืน'}</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ))
                    )}
                  </View>
                )}

                {/* ส่วนเสริมนอก AC: "แก้ไขข้อมูล" แบบปุ่มท้ายป๊อปอัพเว็บ (เอกสารที่ยกเลิกไม่มีปุ่มนี้) */}
                {!ddCancelled && (
                  <TouchableOpacity
                    style={[styles.modalSaveBtn, { backgroundColor: DEPT_META[ddDept].color }]}
                    onPress={() => openDeptEdit(ddDoc, ddDept)}
                  >
                    <Text style={styles.modalSaveBtnText}>แก้ไขข้อมูล</Text>
                  </TouchableOpacity>
                )}
              </>
            );
          })()}
          {imagePreviewHost === 'deptDetail' && renderImagePreview()}
        </ModalShell>

        {/* Modal: รับใบกำกับภาษี (ใช้ร่วมกัน 3 แผนก) */}
        <ModalShell
          visible={deptModal.visible}
          title={deptModal.dept ? `📂 ${DEPT_META[deptModal.dept].label}${deptModal.edit ? 'แก้ไขใบกำกับภาษี' : 'รับใบกำกับภาษี'}` : ''}
          color={deptModal.dept ? DEPT_META[deptModal.dept].color : '#4f46e5'}
          onClose={() => setDeptModal({ visible: false, invNo: '', note: '', files: [], slots: [], keep: [] })}
        >
          {/* ช่องไฟล์เดิมจากแผนกก่อนหน้า (ชุดเดียวกับเว็บ) — แต่ละช่องมีเลขที่ใบกำกับคู่กันมา แตะเพื่อเลือก/เอาออก
              โหมดแก้ไข (ส่วนเสริมนอก AC): มีไฟล์ของแผนกตัวเองด้วย — ไม่มีสิทธิ์ยกเลิกการรับของแผนกนี้ = เอาไฟล์ของตัวเองออกไม่ได้ (กุญแจ) */}
          {deptModal.slots.length > 0 && (
            <>
              <FieldLabel text={deptModal.edit ? 'ไฟล์ในช่องนี้ (แตะเพื่อเอาออก)' : 'ใบกำกับที่แผนกอื่นรับไว้แล้ว (ไม่ต้องแนบซ้ำ)'} />
              {deptModal.slots.map((slot, i) => {
                const active = !!deptModal.keep[i];
                const locked = !!deptModal.dept && truthy(slot.own) && !perms[DEPT_META[deptModal.dept].cancelPerm];
                return (
                  <View key={`${slot.file}-${i}`} style={[styles.taxSlotRow, active && styles.taxSlotRowActive]}>
                    <TouchableOpacity style={styles.taxSlotToggle} onPress={() => toggleDeptSlot(i)}>
                      <Ionicons
                        name={locked ? 'lock-closed' : active ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={locked ? '#94a3b8' : active ? '#4f46e5' : '#94a3b8'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.taxSlotInv} numberOfLines={1}>{slot.inv || '- ไม่ระบุเลขที่ -'}</Text>
                        <Text style={styles.taxSlotSrc}>
                          {truthy(slot.own) && deptModal.dept ? `ไฟล์ของ${DEPT_META[deptModal.dept].label}` : `ไฟล์จาก${TAX_SRC_LABEL[slot.src] ?? ''}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {slot.file ? (
                      <TouchableOpacity style={styles.refundOldFileView} onPress={() => viewAttachedFile(slot.file, rootUploadUrl(slot.file))}>
                        <Ionicons name="eye-outline" size={13} color="#059669" />
                        <Text style={styles.refundOldFileViewText}>ดู</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.taxPairNoFile}>ไม่มีไฟล์</Text>
                    )}
                  </View>
                );
              })}
            </>
          )}
          <FieldLabel
            text={deptModal.slots.length > 0 ? 'เลขที่ใบกำกับภาษีใหม่ (คั่นด้วย , ถ้ามีหลายเลข)' : 'เลขที่ใบกำกับภาษี (คั่นด้วย , ถ้ามีหลายเลข)'}
            required={!deptModal.keep.some((k, i) => k && !!deptModal.slots[i]?.inv)}
          />
          <TextInput style={styles.input} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={deptModal.invNo} onChangeText={(v) => setDeptModal((s) => ({ ...s, invNo: v }))} />
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() =>
              askPickImage((f) => {
                if (!checkExt(f.name, master?.upload_limits?.allowed_extensions)) {
                  Alert.alert('ไฟล์ไม่รองรับ', 'นามสกุลไฟล์นี้ไม่อยู่ในรายการที่อนุญาต');
                  return;
                }
                setDeptModal((s) => ({ ...s, files: [...s.files, f] }));
              })
            }
          >
            <Ionicons name="attach-outline" size={14} color="#475569" />
            <Text style={styles.attachBtnText}>แนบไฟล์ใบกำกับใหม่ ({deptModal.files.length})</Text>
          </TouchableOpacity>
          <FieldLabel text="หมายเหตุ (ถ้ามี)" />
          <TextInput style={[styles.input, styles.textarea]} placeholder="เช่น บิลมีปัญหา..." placeholderTextColor="#94a3b8" multiline value={deptModal.note} onChangeText={(v) => setDeptModal((s) => ({ ...s, note: v }))} />
          <FieldLabel text="ผู้รับใบกำกับ" />
          <View style={styles.readonlyInput}>
            <Text style={styles.readonlyInputText}>{user?.fullname ?? '-'}</Text>
          </View>
          <TouchableOpacity
            style={[styles.modalSaveBtn, { backgroundColor: deptModal.dept ? DEPT_META[deptModal.dept].color : '#4f46e5', opacity: deptModal.saving ? 0.6 : 1 }]}
            onPress={confirmDeptReceive}
            disabled={deptModal.saving}
          >
            <Text style={styles.modalSaveBtnText}>{deptModal.saving ? 'กำลังบันทึก...' : 'ยืนยัน'}</Text>
          </TouchableOpacity>
          {imagePreviewHost === 'dept' && renderImagePreview()}
        </ModalShell>

        {/* Modal: ยกเลิกเอกสาร */}
        <ModalShell visible={cancelModal.visible} title="🚫 ยกเลิกเอกสาร" color="#ef4444" onClose={() => setCancelModal({ visible: false, reason: '' })}>
          <FieldLabel text="เหตุผลที่ยกเลิก" required />
          <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุเหตุผล..." placeholderTextColor="#94a3b8" multiline value={cancelModal.reason} onChangeText={(v) => setCancelModal((s) => ({ ...s, reason: v }))} />
          <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#ef4444', opacity: cancelModal.saving ? 0.6 : 1 }]} onPress={confirmCancelDocument} disabled={cancelModal.saving}>
            <Text style={styles.modalSaveBtnText}>{cancelModal.saving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิกเอกสาร'}</Text>
          </TouchableOpacity>
        </ModalShell>

        {/* Modal: แจ้งขอแก้ไข/ยกเลิกรายการ — action submit_request (สำหรับผู้ใช้ที่ไม่มีสิทธิ์แก้ไข/ยกเลิกตรง) */}
        <ModalShell
          visible={docRequestModal.visible}
          title="🔔 แจ้งขอแก้ไข/ยกเลิกรายการ"
          color="#d97706"
          onClose={() => setDocRequestModal({ visible: false, requestType: 'edit', remark: '' })}
        >
          <FieldLabel text="ประเภทคำขอ" />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            {(['edit', 'cancel'] as const).map((rt) => {
              const active = docRequestModal.requestType === rt;
              return (
                <TouchableOpacity
                  key={rt}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setDocRequestModal((s) => ({ ...s, requestType: rt }))}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{rt === 'edit' ? 'ขอแก้ไข' : 'ขอยกเลิก'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <FieldLabel text="เหตุผล" required />
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="ระบุเหตุผลที่ขอแก้ไข/ยกเลิก..."
            placeholderTextColor="#94a3b8"
            multiline
            value={docRequestModal.remark}
            onChangeText={(v) => setDocRequestModal((s) => ({ ...s, remark: v }))}
          />
          <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#d97706', opacity: docRequestModal.saving ? 0.6 : 1 }]} onPress={confirmDocRequest} disabled={docRequestModal.saving}>
            <Text style={styles.modalSaveBtnText}>{docRequestModal.saving ? 'กำลังส่ง...' : 'ส่งคำขอ'}</Text>
          </TouchableOpacity>
        </ModalShell>

        {/* Modal: หมายเหตุสถานะใบกำกับ — action save_tax_status_note จริง */}
        <ModalShell visible={statusNoteModal.visible} title="📝 หมายเหตุสถานะใบกำกับ" color="#ea580c" onClose={() => setStatusNoteModal({ visible: false, text: '', saving: false })}>
          <FieldLabel text="ระบุรายละเอียด" />
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="เช่น ติดปัญหาเรื่องยอด, รอเคลียร์กับร้านค้า..."
            placeholderTextColor="#94a3b8"
            multiline
            value={statusNoteModal.text}
            onChangeText={(v) => setStatusNoteModal((s) => ({ ...s, text: v }))}
          />
          <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#ea580c', opacity: statusNoteModal.saving ? 0.6 : 1 }]} onPress={confirmStatusNote} disabled={statusNoteModal.saving}>
            <Text style={styles.modalSaveBtnText}>{statusNoteModal.saving ? 'กำลังบันทึก...' : 'บันทึก'}</Text>
          </TouchableOpacity>
        </ModalShell>

        {/* Modal: คลังรับสินค้า */}
        <ModalShell visible={warehouseModal.visible} title="📦 คลังรับสินค้า" color="#d97706" onClose={() => setWarehouseModal({ visible: false, docNo: '' })}>
          <FieldLabel text="ผู้รับสินค้า" />
          <View style={styles.readonlyInput}>
            <Text style={styles.readonlyInputText}>{user?.fullname ?? '-'}</Text>
          </View>
          <FieldLabel text="เลขที่เอกสารรับของ (GR/Ref No.)" required />
          <TextInput style={styles.input} placeholder="ระบุเลขที่เอกสารรับ..." placeholderTextColor="#94a3b8" value={warehouseModal.docNo} onChangeText={(v) => setWarehouseModal((s) => ({ ...s, docNo: v }))} />
          <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#d97706', opacity: warehouseModal.saving ? 0.6 : 1 }]} onPress={confirmWarehouseReceive} disabled={warehouseModal.saving}>
            <Text style={styles.modalSaveBtnText}>{warehouseModal.saving ? 'กำลังบันทึก...' : 'ยืนยันการรับของ'}</Text>
          </TouchableOpacity>
        </ModalShell>

        {/* Modal: บิล/จ่ายเงิน */}
        <ModalShell
          visible={billPayModal.visible}
          title="📄 ข้อมูลบิล & การจ่ายเงิน"
          color="#4f46e5"
          onClose={() => setBillPayModal({ visible: false, taxInvoiceNo: '', taxInvoiceNoOrig: '', billingDocNo: '', billingDate: '', paymentDueDate: '', paymentStatus: '' })}
        >
          <View style={styles.formRow}>
            <View style={styles.formRowCol}>
              <FieldLabel text="เลขที่ใบกำกับภาษี" />
              <TextInput style={styles.input} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={billPayModal.taxInvoiceNo} onChangeText={(v) => setBillPayModal((s) => ({ ...s, taxInvoiceNo: v }))} />
            </View>
            <View style={styles.formRowCol}>
              <FieldLabel text="เลขที่ใบวางบิล" />
              <TextInput style={styles.input} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={billPayModal.billingDocNo} onChangeText={(v) => setBillPayModal((s) => ({ ...s, billingDocNo: v }))} />
            </View>
          </View>
          <View style={styles.formRow}>
            <View style={styles.formRowCol}>
              <FieldLabel text="วันที่ใบวางบิล" />
              <DateField value={billPayModal.billingDate} onChange={(v) => setBillPayModal((s) => ({ ...s, billingDate: v }))} placeholder="เลือกวันที่วางบิล" />
            </View>
            <View style={styles.formRowCol}>
              <FieldLabel text="วันที่ครบกำหนดติดตาม" />
              <DateField value={billPayModal.paymentDueDate} onChange={(v) => setBillPayModal((s) => ({ ...s, paymentDueDate: v }))} placeholder="เลือกวันครบกำหนด" />
            </View>
          </View>
          <FieldLabel text="สถานะการจ่ายเงิน" />
          <TouchableOpacity
            style={[styles.statusPickerTrigger, !!billPayModal.paymentStatus && styles.statusPickerTriggerFilled]}
            onPress={() => setStatusPickerOpen(true)}
          >
            <Text style={[styles.statusPickerTriggerText, !!billPayModal.paymentStatus && styles.statusPickerTriggerTextFilled]} numberOfLines={1}>
              {paymentStatusOptions.find((o) => o.value === billPayModal.paymentStatus)?.label ?? (billPayModal.paymentStatus || '-- ยังไม่ระบุ --')}
            </Text>
            <Ionicons name="chevron-down" size={16} color={billPayModal.paymentStatus ? '#fff' : '#64748b'} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#4f46e5', opacity: billPayModal.saving ? 0.6 : 1 }]} onPress={confirmBillPay} disabled={billPayModal.saving}>
            <Text style={styles.modalSaveBtnText}>{billPayModal.saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</Text>
          </TouchableOpacity>
          {/* ป๊อปอัพเลือกสถานะการจ่ายเงินแบบตาราง — พอร์ตจาก <select id="bp_status"> ใน DocumentDashboard.php:4293-4299 */}
          {/* ซ้อนอยู่ในป๊อปอัพนี้ — วางเป็นพี่น้องกันแล้วตัวเลือกจะโดนป๊อปอัพบิล/จ่ายเงินทับ */}
          <Modal visible={statusPickerOpen} transparent animationType="fade" onRequestClose={() => setStatusPickerOpen(false)}>
            <TouchableOpacity style={styles.pickerModalOverlay} activeOpacity={1} onPress={() => setStatusPickerOpen(false)}>
              <View style={styles.pickerModalSheet}>
                <Text style={styles.pickerModalTitle}>สถานะการจ่ายเงิน</Text>
                <TouchableOpacity
                  style={[styles.pickerModalOption, !billPayModal.paymentStatus && styles.pickerModalOptionActive]}
                  onPress={() => {
                    setBillPayModal((s) => ({ ...s, paymentStatus: '' }));
                    setStatusPickerOpen(false);
                  }}
                >
                  <Text style={styles.pickerModalOptionText}>-- ยังไม่ระบุ --</Text>
                  {!billPayModal.paymentStatus && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
                </TouchableOpacity>
                {paymentStatusOptions.map((o) => {
                  const active = billPayModal.paymentStatus === o.value;
                  return (
                    <TouchableOpacity
                      key={o.value}
                      style={[styles.pickerModalOption, active && styles.pickerModalOptionActive]}
                      onPress={() => {
                        setBillPayModal((s) => ({ ...s, paymentStatus: o.value }));
                        setStatusPickerOpen(false);
                      }}
                    >
                      <Text style={styles.pickerModalOptionText}>{o.label}</Text>
                      {active && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableOpacity>
          </Modal>
        </ModalShell>

        {/* ดูรูปเต็มจอ — ถ้าเปิดจากป๊อปอัพที่มีปุ่ม "ดู" ในตัว จะไป render ซ้อนในป๊อปอัพนั้นแทน (imagePreviewHost) */}
        {imagePreviewHost === 'page' && renderImagePreview()}

        {/* ส่วนเสริมนอก AC — Modal: ยกเลิกการรับของการเงิน (หมายเหตุบังคับ ≤ 500 ตัว · สลิปไม่ลบ) */}
        <ModalShell visible={finCancelModal.visible} title="↩️ ยกเลิกการรับเอกสาร (การเงิน)" color="#dc2626" onClose={() => setFinCancelModal({ visible: false, remark: '' })}>
          {!!finCancelModal.doc && <Text style={styles.hintText}>เอกสาร {finCancelModal.doc.doc_type} {finCancelModal.doc.doc_number}</Text>}
          <Text style={styles.hintText}>สลิปที่แนบไว้ไม่หาย จะขึ้นอีกครั้งตอนลงรับใหม่</Text>
          <FieldLabel text="หมายเหตุ" required />
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="ระบุเหตุผล..."
            placeholderTextColor="#94a3b8"
            multiline
            maxLength={500}
            value={finCancelModal.remark}
            onChangeText={(v) => setFinCancelModal((s) => ({ ...s, remark: v }))}
          />
          <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#dc2626', opacity: finCancelModal.saving ? 0.6 : 1 }]} onPress={confirmFinCancel} disabled={finCancelModal.saving}>
            <Text style={styles.modalSaveBtnText}>{finCancelModal.saving ? 'กำลังบันทึก...' : 'ยืนยันยกเลิกการรับ'}</Text>
          </TouchableOpacity>
        </ModalShell>

        {/* ส่วนเสริมนอก AC — Modal: ประวัติยกเลิกการรับของการเงิน (ใหม่สุดก่อน แบบเว็บ js :2190-2235) */}
        <ModalShell visible={finHistoryModal.visible} title="ประวัติยกเลิกการรับ (การเงิน)" color="#334155" onClose={() => setFinHistoryModal({ visible: false, rows: [], loading: false })}>
          {finHistoryModal.loading ? (
            <ActivityIndicator color="#334155" />
          ) : finHistoryModal.error ? (
            <Text style={[styles.hintText, { color: '#dc2626' }]}>{finHistoryModal.error}</Text>
          ) : finHistoryModal.rows.length === 0 ? (
            <Text style={styles.hintText}>ยังไม่มีประวัติยกเลิกการรับ</Text>
          ) : (
            finHistoryModal.rows.map((r, i) => (
              <View key={`${r.cancelled_at}-${i}`} style={nonacStyles.finHistItem}>
                <View style={nonacStyles.finHistHead}>
                  <Text style={nonacStyles.finHistWho}>ครั้งที่ {finHistoryModal.rows.length - i} · {r.cancelled_by}</Text>
                  <Text style={nonacStyles.finHistWhen}>{formatShortThaiDateTime(r.cancelled_at)}</Text>
                </View>
                <Text style={nonacStyles.trashMeta}>
                  กดรับไว้เมื่อ {formatShortThaiDateTime(r.received_at)}
                  {Number(r.slip_count) > 0 ? ` · ตอนยกเลิกมีสลิป ${Number(r.slip_count)} ไฟล์` : ''}
                </Text>
                <Text style={nonacStyles.finHistRemark}>{r.remark}</Text>
              </View>
            ))
          )}
        </ModalShell>

        {/* Modal: ประวัติ (get_history จริง) */}
        <ModalShell visible={historyModal.visible} title="ประวัติการเปลี่ยนแปลง" color="#334155" onClose={() => setHistoryModal({ visible: false, logs: [], loading: false })}>
          {historyModal.loading ? (
            <ActivityIndicator color="#334155" />
          ) : historyModal.logs.length === 0 ? (
            <Text style={styles.hintText}>ยังไม่มีประวัติการเปลี่ยนแปลง</Text>
          ) : (
            <View>
              {historyModal.logs.map((log) => (
                <HistoryLine key={log.id} log={log} />
              ))}
            </View>
          )}
        </ModalShell>
      </>
    );
  }

  // ดูรูปเต็มจอต้องซ้อนอยู่ใน Modal ที่กดเปิด — ป๊อปอัพรับใบกำกับ/ดูรายละเอียดใบกำกับ/คืนเงินมีปุ่ม "ดู" ในตัว
  // ถ้าวางเป็นพี่น้องกัน รูปจะเปิดอยู่ใต้ป๊อปอัพจนจอดูเหมือนค้าง · นอกนั้นอยู่ระดับหน้า (ใน renderActionModals)
  const imagePreviewHost: 'deptDetail' | 'dept' | 'refund' | 'finance' | 'page' = deptDetailModal.visible
    ? 'deptDetail'
    : deptModal.visible
      ? 'dept'
      : refundModal.visible
        ? 'refund'
        : financeModal.visible // ส่วนเสริมนอก AC: ป๊อปอัพสลิปมีปุ่ม "ดู" สลิปเดิมแล้ว
          ? 'finance'
          : 'page';

  // Modal: ดูรูปที่แนบไว้เต็มจอ (สลิป/พิสูจน์) — เปิดในแอปตรงๆ แทน Linking.openURL ที่พังง่าย
  function renderImagePreview() {
    return (
      <Modal visible={imagePreview.visible} transparent animationType="fade" onRequestClose={() => setImagePreview({ visible: false })}>
        <View style={styles.imagePreviewOverlay}>
          <TouchableOpacity style={styles.imagePreviewCloseBtn} onPress={() => setImagePreview({ visible: false })}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {imagePreview.url && (
            <Image source={{ uri: imagePreview.url }} style={styles.imagePreviewImage} resizeMode="contain" />
          )}
          {imagePreview.url && (
            <TouchableOpacity style={styles.imagePreviewOpenExternalBtn} onPress={() => openFile(imagePreview.url!)}>
              <Ionicons name="open-outline" size={14} color="#fff" />
              <Text style={styles.imagePreviewOpenExternalText}>เปิดในเบราว์เซอร์ / บันทึกรูป</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>
    );
  }

  if (submitScreen.visible) {
    return (
      <SubmitDocumentScreen
        docId={submitScreen.docId}
        onBack={() => setSubmitScreen({ visible: false })}
        onSaved={() => {
          const editedId = submitScreen.docId ? Number(submitScreen.docId) : 0;
          setSubmitScreen({ visible: false });
          // แก้ไขเอกสารเดิม -> ดึงใบนั้นมาใหม่ทั้งในลิสต์และหน้ารายละเอียดที่เปิดค้างอยู่ (ใบที่โหลดมาจากการเลื่อนหน้า
          // ไม่อยู่ในหน้าแรกของ load() — เดิมหน้ารายละเอียดค้างค่าก่อนแก้ แล้วปุ่มรับใบกำกับทำงานบนข้อมูลเก่า)
          if (editedId > 0) void refreshAfterAction(editedId);
          else load();
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      {renderTopBar()}
      <FlatList
        ref={listRef}
        data={docs}
        keyExtractor={(d) => String(docId(d))}
        renderItem={renderCard}
        ListHeaderComponent={renderHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyBox}>
              <Ionicons name="folder-open-outline" size={26} color="#cbd5e1" />
              <Text style={styles.emptyText}>ไม่พบเอกสารที่ตรงกับเงื่อนไข</Text>
            </View>
          ) : null
        }
        // แบ่งหน้าแบบตารางเว็บ หน้าละ PAGE_SIZE — บนจอมีไม่เกิน 1 หน้าเสมอ (เดิมเลื่อนแล้วต่อท้ายสะสมเป็นร้อยรายการ)
        ListFooterComponent={
          <ListPager page={page} pageSize={PAGE_SIZE} total={listTotal} loading={pageLoading} unit="เอกสาร" onChange={goToPage} />
        }
        onScrollToIndexFailed={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />

      {/* หน้ารายละเอียดเอกสาร — ระหว่างเปิดอยู่ โมดัล action ทั้งหมดไป render ซ้อนข้างในแทน (actionModalsInDetail) */}
      {renderDetailModal()}
      {renderSlipRemindModal('root')}
      {renderFilterSheet()}
      {!actionModalsInDetail && renderActionModals()}
      {/* AC: รายชื่อร้านค้าจากชิปบนการ์ด */}
      {renderAcModals('root')}
    </SafeAreaView>
  );
}

// ── ส่วนเสริมนอก AC (17 ต.ค. 69) — สไตล์ของกล่อง/ปุ่มที่เพิ่ม (แยกจาก styles หลักกันชนกับงาน AC) ──
const nonacStyles = StyleSheet.create({
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  outlineRed: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fef2f2', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  outlineRedText: { color: '#dc2626', fontSize: 12, fontWeight: '700' },
  outlineGray: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  outlineGrayText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  voidBox: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: 12, marginBottom: 12 },
  voidTitle: { color: '#b91c1c', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  voidLine: { color: '#7f1d1d', fontSize: 12.5, marginTop: 2 },
  voidReason: { color: '#dc2626', fontSize: 13, fontWeight: '600', marginTop: 6 },
  histLine: { color: '#64748b', fontSize: 11.5, marginTop: 3 },
  vatBox: { borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, marginTop: 8, gap: 4 },
  vatEntered: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 2 },
  vatRow: { flexDirection: 'row', justifyContent: 'space-between' },
  vatLabel: { fontSize: 12.5, color: '#64748b' },
  vatValue: { fontSize: 13, fontWeight: '800' },
  trashBox: { borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', borderRadius: 10, padding: 10, marginTop: 12, gap: 8 },
  trashHead: { fontSize: 12.5, fontWeight: '800', color: '#475569' },
  trashErr: { fontSize: 12, color: '#dc2626' },
  trashItem: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8 },
  trashFile: { fontSize: 12.5, fontWeight: '700', color: '#4f46e5' },
  trashMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#059669', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  restoreBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  finHistItem: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, marginBottom: 8 },
  finHistHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  finHistWho: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#0f172a' },
  finHistWhen: { fontSize: 11.5, color: '#64748b' },
  finHistRemark: { fontSize: 13, color: '#334155', marginTop: 6 },
});

// ปุ่มพื้นทึบไฮไลต์สี ให้หน้าตาตรงกับปุ่ม action บนตารางของเว็บ (ตีกลับ/คืนเงิน/ระบุเครดิต ฯลฯ)
function ActionPill({ icon, label, bg, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; bg: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.actionPill, { backgroundColor: bg }]} onPress={onPress}>
      <Ionicons name={icon} size={12} color="#fff" />
      <Text style={styles.actionPillText}>{label}</Text>
    </TouchableOpacity>
  );
}

// แถบขั้นตอนแนวนอน (เช่น คลัง -> จัดซื้อ -> บัญชี) ใช้ในหน้ารายละเอียดเอกสารแทนรายการ badge ซ้อนกัน
// ให้เห็นทันทีว่าเอกสารอยู่ขั้นไหน — step ที่ done ติ๊กเขียว, current ไฮไลต์สีจริง, ที่เหลือเป็นเทากลาง
function Stepper({
  steps,
}: {
  steps: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; state: 'done' | 'current' | 'pending'; onPress?: () => void }[];
}) {
  return (
    <View style={styles.stepperRow}>
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        const dotColor = s.state === 'pending' ? '#cbd5e1' : s.color;
        const Wrapper = s.onPress ? TouchableOpacity : View;
        return (
          <View key={s.key} style={styles.stepperItemWrap}>
            <View style={styles.stepperItem}>
              <Wrapper
                style={[styles.stepperDot, { borderColor: dotColor, backgroundColor: s.state === 'done' ? dotColor : '#fff' }]}
                {...(s.onPress ? { onPress: s.onPress, activeOpacity: 0.7 } : {})}
              >
                <Ionicons name={s.state === 'done' ? 'checkmark' : s.icon} size={14} color={s.state === 'done' ? '#fff' : dotColor} />
              </Wrapper>
              <Text style={[styles.stepperLabel, { color: s.state === 'pending' ? '#94a3b8' : '#0f172a', fontWeight: s.state === 'current' ? '800' : '600' }]} numberOfLines={1}>
                {s.label}
              </Text>
            </View>
            {!isLast && <View style={[styles.stepperLine, { backgroundColor: s.state === 'done' ? s.color : '#e2e8f0' }]} />}
          </View>
        );
      })}
    </View>
  );
}

function ModalShell({ visible, title, color, onClose, children }: { visible: boolean; title: string; color: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeadRow}>
            <Text style={[styles.modalTitle, { color }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {text} {required ? <Text style={styles.required}>*</Text> : null}
    </Text>
  );
}

// 1 แถวประวัติ — ป้าย/สีแบบเว็บ (ยกเลิก/ลบไฟล์ = แดง · กู้คืน = เขียว · อื่น ๆ = ปกติ) + รายละเอียดที่เปลี่ยน
// changes = บรรทัด "ฟิลด์: เก่า -> ใหม่" ที่ API แตกให้แล้ว · details_lines = บรรทัดข้อความทั่วไป (เหตุผล/ชื่อไฟล์ ฯลฯ)
function HistoryLine({ log }: { log: HistoryLog }) {
  const tone = log.action_tone ?? (log.action_type === 'cancel' ? 'cancel' : 'edit');
  const color = tone === 'cancel' ? '#dc2626' : tone === 'restore' ? '#059669' : '#4f46e5';
  const changes = Array.isArray(log.changes) ? log.changes : [];
  const lines = Array.isArray(log.details_lines) ? log.details_lines : [];
  return (
    <View style={styles.historyLine}>
      <View style={[styles.historyDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.historyHeadRow}>
          <View style={[styles.historyBadge, { backgroundColor: color + '1a', borderColor: color + '55' }]}>
            <Text style={[styles.historyBadgeText, { color }]}>{log.action_label}</Text>
          </View>
          <Text style={styles.historyMeta} numberOfLines={1}>
            {formatShortThaiDateTime(log.action_at)} · {log.action_by || '-'}
          </Text>
        </View>
        {changes.map((c, i) => (
          <Text key={`c${i}`} style={styles.historyDetail}>
            <Text style={styles.historyField}>{c.field}: </Text>
            <Text style={styles.historyOld}>{c.old || '-'}</Text>
            <Text> → </Text>
            <Text style={styles.historyNew}>{c.new || '-'}</Text>
          </Text>
        ))}
        {lines.map((l, i) => (
          <Text key={`l${i}`} style={styles.historyDetail}>
            {l}
          </Text>
        ))}
      </View>
    </View>
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
  // #f8fafc ให้ตรงกับพื้นหลังหน้าจอของอีก 3 โมดูล — เดิมใช้ #f4f7fb ต่างกันเล็กน้อย
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },

  // แถบค้นหา/ตัวกรอง/เพิ่มเอกสาร ที่ติดค้างด้านบน (นอก FlatList)
  topBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarSearch: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  topBarBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  topBarBtnActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  topBarBadge: { position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  topBarBadgeText: { fontSize: 10.5, fontWeight: '900', color: '#4f46e5' },
  topBarAddBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  activeFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  activeFilterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 220, backgroundColor: '#f1f5f9', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 5 },
  activeFilterChipText: { fontSize: 11.5, fontWeight: '600', color: '#334155', flexShrink: 1 },

  viewScopeBanner: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f1f5f9', borderRadius: 8, marginHorizontal: 14, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  viewScopeBannerText: { fontSize: 10.5, color: '#64748b', fontWeight: '600' },

  voidHistoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 14, marginTop: 10 },
  voidHistoryIconWrap: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  voidHistoryBtnText: { fontSize: 11.5, fontWeight: '700', color: '#334155' },
  voidHistoryBadge: { backgroundColor: '#ef4444', borderRadius: 50, paddingHorizontal: 7, paddingVertical: 1 },
  voidHistoryBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },

  voidPanelCard: { backgroundColor: '#dc2626', borderRadius: 16, padding: 16, marginHorizontal: 14, marginTop: 10, overflow: 'hidden' },
  voidPanelBgIcon: { position: 'absolute', right: -10, bottom: -16 },
  voidPanelTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  voidPanelTitle: { color: '#fff', fontSize: 14, fontWeight: '800', opacity: 0.95 },
  voidPanelSubtitle: { color: '#fff', fontSize: 11, opacity: 0.8, marginTop: 3 },
  voidPanelIconBox: { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  voidPanelBottomRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 16 },
  voidPanelCount: { color: '#fff', fontSize: 26, fontWeight: '900' },
  voidPanelCountUnit: { fontSize: 12, fontWeight: '500', opacity: 0.85 },
  voidPanelAmountLabel: { color: '#fff', fontSize: 10.5, opacity: 0.8 },
  voidPanelAmountValue: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 2 },

  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  // bottom sheet ตัวกรอง
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingBottom: 16, maxHeight: '85%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', marginTop: 8 },
  sheetHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sheetFooter: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8 },
  sheetResetBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 12 },
  sheetResetBtnText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  sheetApplyBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#4f46e5', paddingVertical: 12 },
  sheetApplyBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  // การ์ดสรุปพื้นเข้มแบบหน้าเว็บ (ไล่สี navy -> indigo) กล่องข้างในเป็นขาวโปร่งแสง ตัวหนังสือขาว
  summaryCard: { marginHorizontal: 14, marginTop: 12, borderRadius: 18, padding: 14, gap: 8, overflow: 'hidden' },
  summaryTotalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 2 },
  summaryTotalIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  summaryTotalLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  summaryTotalValue: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 1 },
  summaryTotalCurrency: { fontSize: 16, fontWeight: '800' },
  summaryTotalSub: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5, marginTop: 1 },
  summaryDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 2 },
  summaryRow: { flexDirection: 'row', gap: 6 },
  summaryBox: { flex: 1, alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 4 },
  summaryBoxActive: { backgroundColor: 'rgba(255,255,255,0.26)', borderColor: '#ffffff' },
  summaryBoxLabel: { color: '#fff', fontSize: 10.5, fontWeight: '600', textAlign: 'center' },
  summaryBoxCount: { color: '#fff', fontSize: 15, fontWeight: '900' },
  summaryBoxAmount: { color: 'rgba(255,255,255,0.9)', fontSize: 10.5, fontWeight: '600' },
  summaryCreditBox: { paddingVertical: 10 },
  summaryCreditHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  summaryCreditLabel: { color: '#fff', fontSize: 11.5, fontWeight: '700', flexShrink: 1 },

  breakdownToggle: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, marginHorizontal: 14, marginTop: 10, paddingVertical: 4 },
  breakdownToggleText: { fontSize: 11.5, fontWeight: '700', color: '#64748b' },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  breakdownLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: '#334155' },
  breakdownCount: { fontSize: 12.5, fontWeight: '800', color: '#0f172a', minWidth: 24, textAlign: 'right' },
  breakdownAmount: { fontSize: 11.5, color: '#64748b', minWidth: 96, textAlign: 'right' },

  companyList: { marginHorizontal: 14, marginTop: 6, gap: 8 },
  companyCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12 },
  companyCardSelected: { borderColor: '#4f46e5', backgroundColor: '#f8fbff' },
  companyCardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  companyCardInfo: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  companyIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  companyName: { fontSize: 13, fontWeight: '800', color: '#334155' },
  companyMoney: { fontSize: 13.5, fontWeight: '800', color: '#4f46e5', marginTop: 2 },
  companySelectedRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  companySelectedText: { fontSize: 10.5, fontWeight: '700', color: '#059669' },
  companyChevron: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  companyDetails: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 8 },
  companyStatRow: { flexDirection: 'row', gap: 8 },
  companyStatBox: { flex: 1, alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 10, paddingVertical: 8 },
  companyStatCount: { fontSize: 16, fontWeight: '900' },
  companyStatLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 1 },
  companySubLabel: { fontSize: 11.5, fontWeight: '700', color: '#64748b', marginTop: 4 },

  searchInput: { flex: 1, fontSize: 12.5, color: '#0f172a', padding: 0 },

  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  chipActiveGreen: { backgroundColor: '#107c41', borderColor: '#107c41' },
  exportChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 2 },
  rowGapExport: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chipText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  chipTextActive: { color: '#fff' },

  resultCount: { marginHorizontal: 14, marginTop: 12, marginBottom: 4, fontSize: 11.5, color: '#64748b', fontWeight: '600' },

  cardActionZone: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 14, marginTop: 12, padding: 13, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  cardCancelled: { opacity: 0.7 },
  // การ์ดสรุปในลิสต์ — ซัพพลายเออร์เป็นข้อมูลหลักที่ใช้ไล่หา จึงตัวใหญ่กว่าเดิม
  supplierNameSummary: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 8 },
  cardSummaryBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },

  detailHeaderBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  detailHeaderTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#0f172a' },
  detailScrollContent: { padding: 16, paddingBottom: 40 },
  cancelRibbon: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#64748b', marginHorizontal: -13, marginTop: -13, paddingHorizontal: 13, paddingVertical: 6, marginBottom: 10 },
  cancelRibbonText: { color: '#fff', fontSize: 10.5, fontWeight: '700', flexShrink: 1 },
  pendingReqRibbon: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#d97706', marginHorizontal: -13, marginTop: -13, paddingHorizontal: 13, paddingVertical: 6, marginBottom: 10 },
  pendingReqRibbonText: { color: '#fff', fontSize: 10.5, fontWeight: '700', flexShrink: 1 },
  pendingReqAcceptBtn: { marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pendingReqAcceptBtnText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  notifyReqBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#f59e0b', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  notifyReqBtnText: { color: '#b45309', fontSize: 11.5, fontWeight: '700' },

  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  companyText: { fontSize: 13, fontWeight: '800', color: '#4f46e5', flex: 1, flexShrink: 1 },
  docTypeBadge: { backgroundColor: '#eef2ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  docTypeBadgeText: { fontSize: 11, fontWeight: '800', color: '#4338ca' },
  dateText: { fontSize: 11, color: '#94a3b8', marginTop: 3, fontWeight: '600' },


  // 12 = คั่นระหว่างบล็อกข้อมูลคนละกลุ่ม ให้จังหวะเดียวกับ metaRow/amountRow/สถานะด้านล่าง

  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  amountValue: { fontSize: 16, fontWeight: '900', color: '#4f46e5' },
  extraBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 140 },
  extraBadgeText: { fontSize: 9.5, fontWeight: '700' },
  // ป้ายบอกประเภทเอกสาร (ไม่ใช่ปุ่ม) — ตั้งใจให้หน้าตาต่างจากปุ่ม "รับเอกสาร" ด้านล่างชัดเจน
  // ไม่มีพื้นหลัง/กรอบเม็ดยา กันดูเหมือนซ้อนกันเป็นปุ่มคู่
  extraLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 140 },
  extraLabelText: { fontSize: 10, fontWeight: '600', color: '#94a3b8' },
  moreInfoBtn: { marginTop: 12, height: 44, borderRadius: 10, backgroundColor: '#4f46e5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  moreInfoBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  moreInfoBox: { marginTop: 8, gap: 8 },
  // รายละเอียดเพิ่มเติม (แบบป็อปอัพเว็บ)
  miGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  miTile: { width: '48.8%', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 9, gap: 3 },
  miTileHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  miTileLabel: { fontSize: 10.5, fontWeight: '800', color: '#334155' },
  miTileValue: { fontSize: 13, fontWeight: '900', color: '#0f172a' },
  miBlock: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, gap: 5 },
  miSupplier: { fontSize: 13.5, fontWeight: '900', color: '#0f172a' },
  miBankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miBankIcon: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  miBankText: { flex: 1, fontSize: 12, color: '#0f172a', fontWeight: '700' },
  miAccountNo: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12.5, fontWeight: '700' },
  miAccountName: { fontSize: 11.5, color: '#475569', fontWeight: '500' },
  miAmountBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  miAmountValue: { color: '#ffffff', fontSize: 19, fontWeight: '900' },
  miDesc: { fontSize: 13, color: '#0f172a', lineHeight: 19 },
  miWht: { fontSize: 15, fontWeight: '900', color: '#ef4444' },
  miWhtSub: { fontSize: 11.5, color: '#334155', fontWeight: '700' },
  miWhtGross: { fontSize: 14, color: '#10b981', fontWeight: '900' },
  miAttachRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miStatusNote: { marginTop: 4, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', borderRadius: 8, padding: 9, gap: 4 },
  miStatusNoteHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  miStatusNoteLabel: { flex: 1, fontSize: 11, fontWeight: '800', color: '#9a3412' },
  miStatusNoteEdit: { fontSize: 11, fontWeight: '800', color: '#ea580c' },
  miStatusNoteText: { fontSize: 12, color: '#9a3412' },
  miFooter: { fontSize: 10.5, color: '#94a3b8', textAlign: 'right' },
  // กำหนดติดตาม (30 วัน)
  followDueText: { fontSize: 11, fontWeight: '800', color: '#334155' },
  followBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  followBadgeText: { fontSize: 10.5, fontWeight: '900' },
  extraLabelDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f97316' },
  // ไฮไลต์ป้ายเมื่อเป็นเอกสารประเภทใบกำกับภาษี — ให้เด่นกว่าป้ายเอกสารทั่วไป
  extraLabelRowTax: { backgroundColor: '#fef3c7', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 160 },
  extraLabelTextTax: { color: '#b45309', fontWeight: '800' },

  approvedInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  approvedInfoText: { fontSize: 11, fontWeight: '700', color: '#0e8f60', flexShrink: 1 },
  slipBtnRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  slipBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 4 },
  slipBtnEmpty: { backgroundColor: '#fff', borderColor: '#ef4444' },
  slipBtnFilled: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  slipBtnFilledBlue: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  slipBtnText: { fontSize: 9.5, fontWeight: '700', flexShrink: 1 },

  expandToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12, paddingVertical: 6 },
  expandToggleText: { fontSize: 11, fontWeight: '700', color: '#475569' },

  expandBody: { marginTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, gap: 8 },
  infoLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  infoLineNeutral: {},
  infoLineDanger: { backgroundColor: '#fef2f2' },
  infoLineLabel: { fontSize: 11, color: '#64748b', fontWeight: '700' },
  infoLineValue: { fontSize: 11, color: '#334155', fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  // แถว action ไฮไลต์ (ตีกลับ/เครดิต/คืนเงิน/หมายเหตุ) — label ทางซ้าย + ปุ่มพื้นทึบสีทางขวา ตรงกับ
  // หน้าตาปุ่มของตารางบนเว็บ (ตีกลับ = แดง / คืนเงิน = ส้ม / เครดิต-หมายเหตุ = เทา)
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  actionRowLabel: { fontSize: 11, color: '#64748b', fontWeight: '700' },
  actionRowSub: { fontSize: 10.5, color: '#dc2626', marginTop: 2 },
  actionPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 10, paddingVertical: 6 },
  actionPillText: { fontSize: 10.5, fontWeight: '800', color: '#fff' },

  stepperRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepperItemWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stepperItem: { alignItems: 'center', gap: 4, width: 72 },
  stepperDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepperLabel: { fontSize: 10.5, textAlign: 'center' },
  stepperLine: { flex: 1, height: 2, marginTop: -16 },
  // คลังรับของ / บิล-จ่ายเงิน — 2 ช่อง flex:1 แบ่งความกว้างเท่ากันเสมอ ข้อความยาวตัด "..." ในปุ่มแทนการตกบรรทัด
  creditStepsRow: { flexDirection: 'row', gap: 8 },
  // ช่องอนุมัติ / รับเอกสาร — 2 ช่อง flex:1 เท่ากัน (การ์ดลิสต์ + หน้ารายละเอียด)
  statusBoxRow: { flexDirection: 'row', gap: 8 },
  statusBox: { flex: 1, minHeight: 64, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' },
  statusBoxApproved: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  receivedWrap: { flex: 1, flexDirection: 'row', gap: 4 },
  slipRemindTick: { width: 52, borderRadius: 10, borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 4 },
  slipRemindTickText: { fontSize: 10, fontWeight: '800', color: '#4f46e5', textAlign: 'center', lineHeight: 12 },
  srOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 18 },
  srSheet: { backgroundColor: '#ffffff', borderRadius: 16, padding: 18 },
  srTitle: { fontSize: 19, fontWeight: '900', color: '#0f172a', textAlign: 'center', marginBottom: 14 },
  srOption: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  srOptionDone: { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
  srOptionTodo: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  srCheck: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: '#64748b', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  srCheckOn: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  srOptionTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  srOptionSub: { fontSize: 11.5, color: '#475569', marginTop: 2 },
  srInfo: { marginTop: 4 },
  srInfoLine: { fontSize: 12, color: '#475569', marginTop: 3 },
  srInfoStrong: { fontWeight: '900', color: '#0f172a' },
  srInfoNames: { fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 18 },
  srBtnRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  srBtn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  srBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  statusBoxReceived: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  statusBoxHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusBoxLabel: { fontSize: 10.5, fontWeight: '800' },
  statusBoxName: { fontSize: 13, fontWeight: '800', color: '#0f172a', marginTop: 3 },
  statusBoxTime: { fontSize: 11, color: '#475569', marginTop: 1 },
  statusBtn: { flex: 1, minHeight: 64, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  statusBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  // ส่วนต่างๆ ในหน้ารายละเอียด
  section: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginTop: 12, gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 8, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#0f172a' },
  creditStepBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minHeight: 48 },
  creditStepBtnTextWrap: { flexShrink: 1 },
  creditStepBtnTitle: { fontSize: 12, fontWeight: '800', color: '#fff' },
  creditStepBtnSub: { fontSize: 10, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  // ปุ่มรองที่มีข้อความกำกับเสมอ (เดิมเป็นไอคอนวงกลมล้วน ไม่รู้ว่ากดแล้วทำอะไร)
  labeledBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', borderRadius: 50, paddingHorizontal: 11, paddingVertical: 6 },
  labeledBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },

  menuSheetHint: { fontSize: 11.5, color: '#94a3b8', textAlign: 'center', marginTop: 10, marginBottom: 6 },
  menuSheetItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  menuSheetItemText: { fontSize: 14, fontWeight: '700', color: '#dc2626' },
  fileLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, minHeight: 40 },
  fileLinkText: { fontSize: 13, color: '#4f46e5', fontWeight: '700' },

  imagePreviewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  imagePreviewImage: { width: '100%', height: '75%' },
  imagePreviewCloseBtn: { position: 'absolute', top: 48, right: 18, zIndex: 1, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  imagePreviewOpenExternalBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  imagePreviewOpenExternalText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  deptSectionLabel: { fontSize: 10.5, color: '#94a3b8', fontWeight: '700', marginTop: 2 },
  deptRow: { flexDirection: 'row', gap: 6 },
  deptNaText: { fontSize: 11, color: '#cbd5e1', fontStyle: 'italic' },
  deptChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderRadius: 8, paddingVertical: 8 },
  deptChipEmpty: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  deptChipText: { fontSize: 10.5, fontWeight: '700' },


  // การ์ด "รับใบกำกับแล้ว" ต่อแผนก — ชื่อผู้รับ+เวลา แล้วมีปุ่ม "ดูรายละเอียด"/"ยกเลิกการรับ" แยกกัน
  deptReceivedCard: { backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 10, gap: 2 },
  deptReceivedHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  deptReceivedLabel: { fontSize: 11, fontWeight: '800' },
  deptReceivedName: { fontSize: 11.5, fontWeight: '700', color: '#1e293b', marginTop: 2 },
  deptReceivedAt: { fontSize: 10, color: '#94a3b8' },
  deptReceivedBtnRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  outlineBtnGreen: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 5 },
  outlineBtnGreenText: { fontSize: 10, fontWeight: '700', color: '#059669' },
  outlineBtnNeutral: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 5 },
  outlineBtnNeutralText: { fontSize: 10, fontWeight: '700', color: '#64748b' },

  moreActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  moreActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  moreActionBtnText: { fontSize: 10.5, fontWeight: '700', color: '#475569' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 18 },
  modalCard: { backgroundColor: '#fff', borderRadius: 18, padding: 18, maxHeight: '85%' },
  modalHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 15, fontWeight: '800', flexShrink: 1 },

  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 10 },
  required: { color: '#ef4444' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#0f172a', backgroundColor: '#fff' },
  formRow: { flexDirection: 'row', gap: 10 },
  formRowCol: { flex: 1 },
  statusPickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#fff' },
  statusPickerTriggerFilled: { backgroundColor: '#059669', borderColor: '#059669' },
  statusPickerTriggerText: { fontSize: 13, fontWeight: '600', color: '#0f172a', flexShrink: 1 },
  statusPickerTriggerTextFilled: { color: '#fff', fontWeight: '800' },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  pickerModalSheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  pickerModalTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  pickerModalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  pickerModalOptionActive: { backgroundColor: '#eef2ff' },
  pickerModalOptionText: { fontSize: 12.5, fontWeight: '700', color: '#334155', flexShrink: 1 },
  textarea: { minHeight: 70, textAlignVertical: 'top' },

  readonlyInput: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  readonlyInputText: { fontSize: 13, color: '#64748b', fontWeight: '700' },
  hintText: { fontSize: 10.5, color: '#94a3b8', marginTop: 6 },

  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginTop: 12 },
  attachBtnText: { fontSize: 11.5, fontWeight: '700', color: '#d97706' },

  modalSaveBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  modalSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },

  creditOptionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  creditOption: { backgroundColor: '#eef2ff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  creditOptionText: { color: '#4338ca', fontWeight: '700', fontSize: 13 },

  historyLine: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  historyDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#4f46e5', marginTop: 6 },
  historyHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  historyBadge: { borderWidth: 1, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2 },
  historyBadgeText: { fontSize: 11, fontWeight: '800' },
  historyMeta: { fontSize: 10.5, color: '#94a3b8', flexShrink: 1 },
  historyDetail: { fontSize: 11.5, color: '#334155', marginTop: 4, lineHeight: 17 },
  historyField: { fontWeight: '800', color: '#1e293b' },
  historyOld: { color: '#dc2626', textDecorationLine: 'line-through' },
  historyNew: { color: '#059669', fontWeight: '700' },

  // ช่วงวันที่เลือกไม่ครบ / ท้ายลิสต์
  sheetDateHint: { fontSize: 11, color: '#b45309', fontWeight: '700', marginTop: 8 },
  listEndText: { textAlign: 'center', fontSize: 11, color: '#94a3b8', marginVertical: 16 },
  // ป้ายประเภท "ใบกำกับภาษี 7%" (ได้ใบกำกับแล้ว) — เขียว คู่กับ extraLabelRowTax (รอใบกำกับ = ส้ม)
  extraLabelRowTaxDone: { backgroundColor: '#d1fae5', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 160 },
  extraLabelTextTaxDone: { color: '#047857', fontWeight: '800' },
  acEditNote: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', borderRadius: 50, paddingHorizontal: 11, paddingVertical: 6 },
  acEditNoteText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  // ไฟล์คืนเงินที่แนบไว้แล้ว (ดู/ลบ) — โทนเขียวแบบป๊อปอัพเว็บ
  refundOldFileRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#6ee7b7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6 },
  refundOldFileName: { flex: 1, fontSize: 12, fontWeight: '700', color: '#065f46' },
  refundOldFileView: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#fff', borderWidth: 1, borderColor: '#10b981', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6 },
  refundOldFileViewText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  refundOldFileDel: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6 },
  refundOldFileDelText: { fontSize: 11, fontWeight: '700', color: '#ef4444' },
  // คู่เลขที่ใบกำกับ ↔ ไฟล์ ในป๊อปอัพ "ดูรายละเอียด"
  taxPairBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, marginTop: 6 },
  taxPairLabel: { fontSize: 10.5, color: '#64748b', fontWeight: '600' },
  taxPairInv: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 1 },
  taxPairNoFile: { fontSize: 11.5, color: '#ef4444', fontWeight: '600' },
  // ช่องไฟล์เดิมจากแผนกอื่นในป๊อปอัพรับใบกำกับ
  taxSlotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
  taxSlotRowActive: { borderColor: '#c7d2fe', backgroundColor: '#eef2ff' },
  taxSlotToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  taxSlotInv: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  taxSlotSrc: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
});

// ---- AC (เคลียร์เงินทดรอง): ชิปจำนวนร้าน / กล่องร้านค้าในหน้ารายละเอียด / ป๊อปอัปรับใบกำกับรายกล่อง ----
const acStyles = StyleSheet.create({
  // ชิป "N รายการร้านค้า" บนการ์ด + ป๊อปอัปรายชื่อร้าน
  shopChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 3, marginTop: 4 },
  shopChipText: { fontSize: 11, fontWeight: '800', color: '#4f46e5' },
  shopDoc: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 8 },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  shopNo: { width: 22, fontSize: 12, fontWeight: '800', color: '#64748b', textAlign: 'center' },
  shopName: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  shopSite: { fontSize: 11, color: '#64748b', marginTop: 1 },
  shopAmt: { fontSize: 12.5, fontWeight: '800', color: '#0f172a' },

  // กล่องร้านค้า — แถบหัวสีม่วงอ่อน (เลข/ร้าน/ประเภท) + กรอบม่วง ให้แต่ละร้านแยกกันชัดบนพื้นขาวของ section
  whtTotal: { fontSize: 11.5, fontWeight: '700', color: '#ef4444' },
  item: { borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden', marginTop: 4, elevation: 1 },
  head: { flexDirection: 'row', gap: 8, backgroundColor: '#eef2ff', paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#c7d2fe' },
  body: { padding: 10, gap: 8 },
  no: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  noText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sup: { fontSize: 13.5, fontWeight: '900', color: '#0f172a' },
  site: { fontSize: 11.5, color: '#334155' },
  siteLbl: { fontWeight: '700', color: '#64748b' },
  att: { alignSelf: 'flex-start', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2 },
  attWait: { backgroundColor: '#fef3c7', borderColor: '#fde68a' },
  attTax: { backgroundColor: '#d1fae5', borderColor: '#a7f3d0' },
  attText: { fontSize: 10.5, fontWeight: '800', color: '#475569' },
  amtRow: { flexDirection: 'row', gap: 6 },
  amtBox: { flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'flex-end' },
  amtLbl: { fontSize: 10, color: '#64748b', fontWeight: '700' },
  amtVal: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  amtValStrong: { color: '#047857' },
  invRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  invLbl: { fontSize: 11, fontWeight: '800', color: '#475569' },
  invChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  invChipNoFile: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  invChipText: { fontSize: 11.5, fontWeight: '700', color: '#4f46e5' },
  invChipTextMuted: { fontSize: 11.5, fontWeight: '700', color: '#64748b' },
  taxNote: { fontSize: 11, color: '#9a3412' },
  secRow: { flexDirection: 'row', gap: 6 },
  sec: { flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 8, gap: 2 },
  secLbl: { fontSize: 10.5, fontWeight: '800', color: '#64748b' },
  secVal: { fontSize: 12, color: '#0f172a' },
  gross: { fontSize: 10.5, color: '#64748b', fontWeight: '600' },
  grossVal: { fontSize: 12, fontWeight: '800', color: '#10b981' },

  // ช่องรับใบกำกับ 3 ฝ่ายของกล่อง
  recvWrap: { gap: 6 },
  recvBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, paddingVertical: 9 },
  recvBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  recvDone: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderRadius: 8, padding: 8, gap: 2 },
  recvDoneHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  recvDoneLbl: { fontSize: 11, fontWeight: '800' },
  recvAt: { marginLeft: 'auto', fontSize: 10, color: '#94a3b8' },
  recvBy: { fontSize: 12, fontWeight: '700', color: '#1e293b' },
  recvNote: { fontSize: 11, color: '#64748b' },

  // หัวข้อใบกำกับ (3 แผนก) ของเอกสาร AC
  sumHint: { fontSize: 11, color: '#64748b' },
  sumRow: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 8, gap: 5 },
  sumName: { fontSize: 12, fontWeight: '800', color: '#0f172a' },
  sumDepts: { flexDirection: 'row', gap: 6 },
  sumDept: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2 },
  sumDeptDone: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  sumDeptText: { fontSize: 10.5, fontWeight: '700', color: '#64748b' },

  // ป๊อปอัปรับใบกำกับของกล่อง
  recvSub: { backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  recvSubText: { fontSize: 11.5, fontWeight: '700', color: '#3730a3' },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  newRowFile: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10 },
  newRowFileOn: { borderStyle: 'solid', borderColor: '#6ee7b7', backgroundColor: '#f0fdf4' },
  newRowFileText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
});
