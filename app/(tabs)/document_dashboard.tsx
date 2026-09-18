/**
 * DocumentDashboardScreen.tsx
 * ------------------------------------------------------------------
 * หน้า "ทะเบียนคุมเอกสาร PO/AX" (มือถือ) — ต่อ API จริงจาก
 * document_API_mobile.php (22 actions: get_master_data, get_dashboard,
 * get_list, get_detail, get_history, get_pending_requests, approve_document,
 * save_finance, save_note, update_return_document, update_credit,
 * update_bill_pay, edit_document, cancel_document, save_refund,
 * receive_warehouse, receive_tax_warehouse, receive_tax_buyer,
 * receive_tax_acc, cancel_step_receive, save_tax_status_note,
 * update_return_tax)
 *
 * ปุ่ม "แก้ไข" (gated ด้วย can_edit_document จริง) เปิด editModal ในไฟล์นี้เอง ต่อ action
 * `edit_document` จริง (5 ช่องที่ API รองรับ: doc_number, job_site, supplier_name, description,
 * amount) ส่วนปุ่ม "เพิ่มเอกสาร" (สร้างใหม่) ยังพาไปหน้า SubmitDocumentScreen (submitdocument.tsx)
 * เหมือนเดิม เพราะ document_API_mobile.php ไม่มี action สำหรับสร้างเอกสารใหม่เลย (SubmitDocument.php
 * เป็นคนละไฟล์ backend ที่ยังไม่ยืนยัน — จำกัดผลกระทบไว้แค่โหมดสร้างใหม่เท่านั้น)
 *
 * ⚠️ save_finance: ต้องไม่ส่ง `slip_files_managed` เลย เพราะหน้านี้มีแค่ปุ่ม
 *    "แนบสลิปเพิ่ม" ไม่มี UI ลบไฟล์เดิม — ถ้าส่ง slip_files_managed=1 โดยไม่แนบ
 *    existing_slip_files[] ไฟล์เดิมทั้งหมดจะถูกลบทิ้งจากดิสก์ทันที (โหมด legacy
 *    ปลอดภัย: ไม่ส่ง flag นี้เลย ไฟล์เดิมจะไม่ถูกแตะต้อง)
 *
 * สิทธิ์ทุกปุ่มอ่านจากฟิลด์ can_xxx ที่ API คืนมาสดทุกครั้ง (ไม่แคช ไม่เดาเอง)
 * ตัวเลข/สถานะ/ยอดเงินทั้งหมดอ่านจากฟิลด์ที่ backend คำนวณมาให้แล้วเท่านั้น
 * ------------------------------------------------------------------
 */

import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import SubmitDocumentScreen from './submitdocument';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ Config
import { API_BASE, API_MODULES } from '../../constants/config';
import { apiMobileGet, apiMobilePost } from '../service/api_mobile';
import { useAuth } from '../_layout';
// ปรับ path นี้ให้ตรงกับตำแหน่งไฟล์จริงในโปรเจกต์ ถ้าไม่ได้วางไว้โฟลเดอร์เดียวกัน

const DOCUMENT_API_URL = `${API_MODULES}/document_API_mobile.php`;

// ====================================================================
// Types (ตั้งชื่อฟิลด์ตรงกับ API จริงเป๊ะ — snake_case)
// ====================================================================

type DocType = 'PO' | 'AX';
type DeptKey = 'warehouse' | 'purchase' | 'accounting';
type StageFilter = 'all' | 'pending_approve' | 'approved' | 'pending_finance' | 'finance_received' | 'returned' | 'cancelled';

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
  can_cancel_step_receive: boolean;
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
  can_cancel_step_receive: false,
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
  [key: string]: number;
}

interface HistoryLog {
  id: number;
  doc_id: number;
  action_type: string;
  action_label: string;
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

function arr(v: any): string[] {
  if (Array.isArray(v)) return v.filter((x) => !!x);
  return [];
}

/** แปลง วว/ดด/ปปปป (ปี พ.ศ. หรือ ค.ศ.) เป็น yyyy-mm-dd ให้ API */
function toApiDate(dstr: string): string | undefined {
  const m = dstr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  let y = parseInt(yyyy, 10);
  if (y > 2400) y -= 543;
  return `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function docId(d: DocListItem): number {
  return Number(d.id ?? d.doc_id);
}

function stageOf(d: DocListItem): 'pending_approve' | 'pending_finance' | 'finance_received' {
  if (!truthy(d.is_approved) && !d.approver_name) return 'pending_approve';
  if (!truthy(d.is_finance_received) && !d.finance_receiver) return 'pending_finance';
  return 'finance_received';
}

const CREDIT_OPTIONS = [15, 30, 45, 60, 90];
const DEPT_META: Record<DeptKey, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap; step: string }> = {
  warehouse: { label: 'คลัง', color: '#d97706', icon: 'cube-outline', step: 'wh_tax' },
  purchase: { label: 'จัดซื้อ', color: '#2563eb', icon: 'cart-outline', step: 'buyer_tax' },
  accounting: { label: 'บัญชี', color: '#9333ea', icon: 'calculator-outline', step: 'acc_tax' },
};

const STAGE_META = {
  pending_approve: { label: 'รออนุมัติ', bg: '#fef3c7', fg: '#b45309', icon: 'create-outline' as const },
  pending_finance: { label: 'รอการเงิน', bg: '#dbeafe', fg: '#1d4ed8', icon: 'time-outline' as const },
  finance_received: { label: 'รับเอกสารแล้ว', bg: '#ede9fe', fg: '#6d28d9', icon: 'wallet-outline' as const },
};

function slipUrl(name: string) {
  return `${API_BASE}/uploads/payment_slips/${name}`;
}
function refundUrl(name: string) {
  return `${API_BASE}/uploads/refunds/${name}`;
}
function rootUploadUrl(name: string) {
  return `${API_BASE}/uploads/${name}`;
}
function openFile(url: string) {
  Linking.openURL(url).catch(() => Alert.alert('เปิดไฟล์ไม่ได้', url));
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
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
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
async function fetchDashboard(userId: string | number, filters: Record<string, string | number | undefined>) {
  return apiMobileGet(DOCUMENT_API_URL, 'get_dashboard', { user_id: userId, ...filters });
}
async function fetchList(userId: string | number, filters: Record<string, string | number | undefined>) {
  return apiMobileGet(DOCUMENT_API_URL, 'get_list', { user_id: userId, ...filters, limit: 200, offset: 0 });
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
async function apiEditDocument(
  userId: string | number,
  dId: number,
  fields: { doc_number: string; job_site: string; supplier_name: string; description: string; amount: number },
) {
  return apiMobilePost(DOCUMENT_API_URL, 'edit_document', { user_id: userId, doc_id: dId, ...fields });
}
async function apiReceiveWarehouse(userId: string | number, dId: number, warehouse_doc_no: string) {
  return apiMobilePost(DOCUMENT_API_URL, 'receive_warehouse', { user_id: userId, doc_id: dId, warehouse_doc_no });
}
async function apiCancelStepReceive(userId: string | number, dId: number, step: string) {
  return apiMobilePost(DOCUMENT_API_URL, 'cancel_step_receive', { user_id: userId, doc_id: dId, step });
}

// -------------------- Write (multipart — has file uploads) --------------------

async function postMultipart(fields: Record<string, string | number | undefined>, files: { field: string; file: PickedFile }[]) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fd.append(k, String(v));
  });
  files.forEach(({ field, file }) => {
    fd.append(field, { uri: file.uri, name: file.name, type: file.type } as any);
  });
  const res = await axios.post(DOCUMENT_API_URL, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  const data = res.data as any;
  if (data?.status !== 'success') throw new Error(data?.message || 'บันทึกไม่สำเร็จ');
  return data;
}

/** ⚠️ Trap 1: ห้ามส่ง slip_files_managed เด็ดขาด — หน้านี้มีแค่ "แนบเพิ่ม" ไม่มี UI ลบไฟล์เดิม
 *  ถ้าส่ง flag นี้โดยไม่แนบ existing_slip_files[] ไฟล์เดิมทั้งหมดจะถูกลบจากดิสก์จริงทันที
 *  จึงใช้โหมด legacy ปลอดภัย (ไม่ส่ง flag) — ไฟล์เดิมจะไม่ถูกแตะต้องเลย */
async function apiSaveFinance(userId: string | number, dId: number, slipFiles: PickedFile[], fullFiles: PickedFile[]) {
  const files = [
    ...slipFiles.map((f) => ({ field: 'slip_file[]', file: f })),
    ...fullFiles.map((f) => ({ field: 'slip_full_file[]', file: f })),
  ];
  return postMultipart({ action: 'save_finance', user_id: userId, doc_id: dId }, files);
}
async function apiSaveRefund(userId: string | number, dId: number, refund_note: string, refund_date: string, files: PickedFile[]) {
  return postMultipart(
    { action: 'save_refund', user_id: userId, doc_id: dId, refund_note, refund_date },
    files.map((f) => ({ field: 'refund_files_upload[]', file: f })),
  );
}
async function apiReceiveTaxDept(userId: string | number, dId: number, dept: DeptKey, invNos: string[], note: string, files: PickedFile[]) {
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
  const res = await axios.post(DOCUMENT_API_URL, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  const data = res.data as any;
  if (data?.status !== 'success') throw new Error(data?.message || 'บันทึกไม่สำเร็จ');
  return data;
}

// ====================================================================
// Main screen
// ====================================================================

export default function DocumentDashboardScreen({ onBack }: DocumentDashboardScreenProps) {
  const { user } = useAuth();


  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [master, setMaster] = useState<MasterData | null>(null);
  const [kpiAll, setKpiAll] = useState<KpiAll | null>(null);
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [perms, setPerms] = useState<Perms>(DEFAULT_PERMS);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [cancelledAmount, setCancelledAmount] = useState(0);

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | DocType>('all');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const [specialFilter, setSpecialFilter] = useState<'none' | 'urgent' | 'overdue' | 'taxdone' | 'creditAlert'>('none');
  const [amountRange, setAmountRange] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [voidPanelOpen, setVoidPanelOpen] = useState(false);

  const [approveModal, setApproveModal] = useState<{ visible: boolean; doc?: DocListItem; saving?: boolean }>({ visible: false });
  const [financeModal, setFinanceModal] = useState<{ visible: boolean; doc?: DocListItem; slip: PickedFile[]; full: PickedFile[]; saving?: boolean }>({ visible: false, slip: [], full: [] });
  const [noteModal, setNoteModal] = useState<{ visible: boolean; doc?: DocListItem; text: string; saving?: boolean }>({ visible: false, text: '' });
  const [returnModal, setReturnModal] = useState<{ visible: boolean; doc?: DocListItem; text: string; saving?: boolean }>({ visible: false, text: '' });
  const [returnTaxModal, setReturnTaxModal] = useState<{ visible: boolean; doc?: DocListItem; text: string; saving?: boolean }>({ visible: false, text: '' });
  const [creditModal, setCreditModal] = useState<{ visible: boolean; doc?: DocListItem; saving?: boolean }>({ visible: false });
  const [refundModal, setRefundModal] = useState<{ visible: boolean; doc?: DocListItem; date: string; note: string; files: PickedFile[]; saving?: boolean }>({ visible: false, date: '', note: '', files: [] });
  const [deptModal, setDeptModal] = useState<{ visible: boolean; doc?: DocListItem; dept?: DeptKey; invNo: string; note: string; files: PickedFile[]; saving?: boolean }>({ visible: false, invNo: '', note: '', files: [] });
  const [historyModal, setHistoryModal] = useState<{ visible: boolean; doc?: DocListItem; logs: HistoryLog[]; loading: boolean }>({ visible: false, logs: [], loading: false });
  const [cancelModal, setCancelModal] = useState<{ visible: boolean; doc?: DocListItem; reason: string; saving?: boolean }>({ visible: false, reason: '' });
  const [warehouseModal, setWarehouseModal] = useState<{ visible: boolean; doc?: DocListItem; docNo: string; saving?: boolean }>({ visible: false, docNo: '' });
  const [billPayModal, setBillPayModal] = useState<{
    visible: boolean; doc?: DocListItem; taxInvoiceNo: string; billingDocNo: string; billingDate: string; paymentDueDate: string; paymentStatus: string; saving?: boolean;
  }>({ visible: false, taxInvoiceNo: '', billingDocNo: '', billingDate: '', paymentDueDate: '', paymentStatus: '' });
  // "เพิ่มเอกสาร" (ลงสมุดเสนอเอกสารใหม่) — document_API_mobile.php ไม่มี action สำหรับสร้างเอกสารใหม่เลย
  // (มีแต่อ่าน + เขียนแก้ไขเอกสารที่มีอยู่แล้ว) จึงยังต้องใช้ SubmitDocumentScreen เดิม (คุยกับ
  // SubmitDocument.php คนละไฟล์ที่ยังไม่ยืนยันกับ backend จริง) เฉพาะโหมดสร้างใหม่ (docId undefined)
  // ส่วนโหมดแก้ไขเอกสารเดิม (มี docId) ย้ายไปใช้ editModal ต่อ action edit_document จริงแล้วด้านล่าง
  const [submitScreen, setSubmitScreen] = useState<{ visible: boolean }>({ visible: false });
  // แก้ไขเอกสาร — ต่อ action edit_document จริง (5 ช่องที่ API รองรับ) แทนที่การพาไปหน้า
  // SubmitDocumentScreen เดิมซึ่งคุยกับ SubmitDocument.php คนละไฟล์ที่ยังไม่ยืนยันกับ backend จริง
  const [editModal, setEditModal] = useState<{
    visible: boolean; doc?: DocListItem; docNumber: string; jobSite: string; supplierName: string; description: string; amount: string; saving?: boolean;
  }>({ visible: false, docNumber: '', jobSite: '', supplierName: '', description: '', amount: '' });

  // -------------------- Load --------------------

  const buildFilters = useCallback((): Record<string, string | number | undefined> => {
    const f: Record<string, string | number | undefined> = {};
    if (docTypeFilter !== 'all') f.doc_type = docTypeFilter;
    if (stageFilter !== 'all') f.status = stageFilter;
    if (amountRange !== 'all') f.amount_range = amountRange;
    if (search.trim()) f.search_all = search.trim();
    const sd = toApiDate(startDateFilter);
    if (sd) f.start_date = sd;
    const ed = toApiDate(endDateFilter);
    if (ed) f.end_date = ed;
    if (specialFilter === 'urgent') f.filter_urgent = 1;
    if (specialFilter === 'overdue') f.filter_overdue = 1;
    if (specialFilter === 'taxdone') f.filter_taxdone = 1;
    if (specialFilter === 'creditAlert') f.filter_credit_alert = 1;
    return f;
  }, [docTypeFilter, stageFilter, amountRange, search, startDateFilter, endDateFilter, specialFilter]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const filters = buildFilters();
      const [dash, list, cancelled] = await Promise.all([
        fetchDashboard(user.id, filters),
        fetchList(user.id, filters),
        apiMobileGet(DOCUMENT_API_URL, 'get_list', { user_id: user.id, status: 'cancelled', show_all: 1, limit: 200, offset: 0 }),
      ]);
      setKpiAll((dash as any).kpi_all ?? null);
      const rows: DocListItem[] = (list as any).list ?? [];
      setDocs(rows);
      setPerms({
        can_view_all_docs: truthy((list as any).can_view_all_docs),
        can_edit_document: truthy((list as any).can_edit_document),
        can_return_document: truthy((list as any).can_return_document),
        can_approve: truthy((list as any).can_approve),
        can_save_finance: truthy((list as any).can_save_finance),
        can_save_note: truthy((list as any).can_save_note),
        can_update_credit: truthy((list as any).can_update_credit),
        can_update_bill_pay: truthy((list as any).can_update_bill_pay),
        can_cancel_document: truthy((list as any).can_cancel_document),
        can_save_refund: truthy((list as any).can_save_refund),
        can_receive_warehouse: truthy((list as any).can_receive_warehouse),
        can_receive_tax: truthy((list as any).can_receive_tax),
        can_cancel_step_receive: truthy((list as any).can_cancel_step_receive),
      });
      const cRows: DocListItem[] = (cancelled as any).list ?? [];
      setCancelledCount((cancelled as any).total ?? cRows.length);
      setCancelledAmount(cRows.reduce((s, d) => s + (Number(d.amount) || 0), 0));
    } catch (e: any) {
      Alert.alert('โหลดข้อมูลไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, buildFilters]);

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
      load();
    }, [load]),
  );

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetAllFilters() {
    setSearch('');
    setStageFilter('all');
    setDocTypeFilter('all');
    setSpecialFilter('none');
    setAmountRange('all');
    setStartDateFilter('');
    setEndDateFilter('');
    setVoidPanelOpen(false);
  }

  // -------------------- Action handlers (real API) --------------------

  async function confirmApprove() {
    const doc = approveModal.doc;
    if (!doc || !user) return;
    setApproveModal((s) => ({ ...s, saving: true }));
    try {
      await apiApprove(user.id, docId(doc));
      setApproveModal({ visible: false });
      load();
    } catch (e: any) {
      Alert.alert('อนุมัติไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setApproveModal((s) => ({ ...s, saving: false }));
    }
  }

  async function confirmFinance() {
    const { doc, slip, full } = financeModal;
    if (!doc || !user) return;
    if (slip.length === 0 && full.length === 0) {
      Alert.alert('ยังไม่ได้แนบไฟล์', 'กรุณาแนบสลิปอย่างน้อย 1 ไฟล์');
      return;
    }
    setFinanceModal((s) => ({ ...s, saving: true }));
    try {
      await apiSaveFinance(user.id, docId(doc), slip, full);
      setFinanceModal({ visible: false, slip: [], full: [] });
      load();
      Alert.alert('บันทึกสำเร็จ', 'ลงรับเอกสาร/แนบสลิปเรียบร้อย');
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
      load();
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
      load();
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
      load();
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
      load();
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setCreditModal((s) => ({ ...s, saving: false }));
    }
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
      const apiDate = toApiDate(refundModal.date.trim()) ?? refundModal.date.trim();
      await apiSaveRefund(user.id, docId(doc), refundModal.note.trim(), apiDate, refundModal.files);
      setRefundModal({ visible: false, date: '', note: '', files: [] });
      load();
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setRefundModal((s) => ({ ...s, saving: false }));
    }
  }

  async function confirmDeptReceive() {
    const { doc, dept, invNo, note, files } = deptModal;
    if (!doc || !dept || !user) return;
    const invNos = invNo.split(',').map((s) => s.trim()).filter(Boolean);
    if (invNos.length === 0) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุเลขที่ใบกำกับอย่างน้อย 1 เลข');
      return;
    }
    setDeptModal((s) => ({ ...s, saving: true }));
    try {
      await apiReceiveTaxDept(user.id, docId(doc), dept, invNos, note.trim(), files);
      setDeptModal({ visible: false, invNo: '', note: '', files: [] });
      load();
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setDeptModal((s) => ({ ...s, saving: false }));
    }
  }

  function askCancelStepReceive(doc: DocListItem, dept: DeptKey) {
    if (!user) return;
    const meta = DEPT_META[dept];
    Alert.alert(`ยกเลิกการรับใบกำกับ (${meta.label})`, 'ไฟล์ที่แนบไว้ของแผนกนี้จะถูกลบ ยืนยันหรือไม่?', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ยืนยัน',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiCancelStepReceive(user.id, docId(doc), meta.step);
            load();
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
      load();
    } catch (e: any) {
      Alert.alert('ยกเลิกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setCancelModal((s) => ({ ...s, saving: false }));
    }
  }

  async function confirmWarehouseReceive() {
    const doc = warehouseModal.doc;
    if (!doc || !user) return;
    setWarehouseModal((s) => ({ ...s, saving: true }));
    try {
      await apiReceiveWarehouse(user.id, docId(doc), warehouseModal.docNo.trim());
      setWarehouseModal({ visible: false, docNo: '' });
      load();
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setWarehouseModal((s) => ({ ...s, saving: false }));
    }
  }

  async function confirmBillPay() {
    const doc = billPayModal.doc;
    if (!doc || !user) return;
    setBillPayModal((s) => ({ ...s, saving: true }));
    try {
      await apiUpdateBillPay(user.id, docId(doc), {
        tax_invoice_no: billPayModal.taxInvoiceNo.trim(),
        billing_doc_no: billPayModal.billingDocNo.trim(),
        billing_date: toApiDate(billPayModal.billingDate.trim()) ?? billPayModal.billingDate.trim(),
        payment_due_date: toApiDate(billPayModal.paymentDueDate.trim()) ?? billPayModal.paymentDueDate.trim(),
        payment_status: billPayModal.paymentStatus,
      });
      setBillPayModal({ visible: false, taxInvoiceNo: '', billingDocNo: '', billingDate: '', paymentDueDate: '', paymentStatus: '' });
      load();
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setBillPayModal((s) => ({ ...s, saving: false }));
    }
  }

  function openEditModal(doc: DocListItem) {
    setEditModal({
      visible: true,
      doc,
      docNumber: doc.doc_number ?? '',
      jobSite: doc.job_site ?? '',
      supplierName: doc.supplier_name ?? '',
      description: doc.description ?? '',
      amount: doc.amount != null ? String(doc.amount) : '',
    });
  }

  async function confirmEditDocument() {
    const doc = editModal.doc;
    if (!doc || !user) return;
    if (!editModal.supplierName.trim()) {
      Alert.alert('กรุณากรอกข้อมูล', 'ต้องระบุชื่อซัพพลายเออร์');
      return;
    }
    const amountNum = Number(editModal.amount.replace(/,/g, ''));
    if (!Number.isFinite(amountNum)) {
      Alert.alert('ยอดเงินไม่ถูกต้อง', 'กรุณากรอกยอดเงินเป็นตัวเลข');
      return;
    }
    setEditModal((s) => ({ ...s, saving: true }));
    try {
      await apiEditDocument(user.id, docId(doc), {
        doc_number: editModal.docNumber.trim(),
        job_site: editModal.jobSite.trim(),
        supplier_name: editModal.supplierName.trim(),
        description: editModal.description.trim(),
        amount: amountNum,
      });
      setEditModal({ visible: false, docNumber: '', jobSite: '', supplierName: '', description: '', amount: '' });
      load();
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setEditModal((s) => ({ ...s, saving: false }));
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name="document-text" size={18} color="#4f46e5" />
            <Text style={styles.title}>ทะเบียนคุมเอกสาร</Text>
          </View>
          <TouchableOpacity style={styles.addDocBtn} onPress={() => setSubmitScreen({ visible: true })}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addDocBtnText}>เพิ่มเอกสาร</Text>
          </TouchableOpacity>
        </View>

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

        <View style={styles.totalCard}>
          <View style={styles.totalCardIcon}>
            <Ionicons name="stats-chart" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.totalCardLabel}>ยอดรวมสุทธิ (ทั้งหมด)</Text>
            <Text style={styles.totalCardValue}>{num(kpis?.total_money)} ฿</Text>
            <Text style={styles.totalCardSub}>รวม {kpis?.job_count ?? 0} รายการ</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pipelineRow}>
          <PipelineCard label="รออนุมัติ" value={kpis?.count_pending_app ?? 0} color="#f59e0b" icon="create-outline" active={stageFilter === 'pending_approve'} onPress={() => setStageFilter('pending_approve')} />
          <PipelineCard label="อนุมัติแล้ว" value={kpis?.count_approved ?? 0} color="#10b981" icon="checkmark-circle-outline" active={stageFilter === 'approved'} onPress={() => setStageFilter('approved')} />
          <PipelineCard label="รอการเงิน" value={kpis?.count_pending_fin ?? 0} color="#3b82f6" icon="time-outline" active={stageFilter === 'pending_finance'} onPress={() => setStageFilter('pending_finance')} />
          <PipelineCard label="รับเอกสารแล้ว" value={kpis?.count_received ?? 0} color="#8b5cf6" icon="wallet-outline" active={stageFilter === 'finance_received'} onPress={() => setStageFilter('finance_received')} />
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.extraRow}>
          <ExtraCard label="ใบสำคัญจ่าย" count={kpis?.count_pv ?? 0} amount={kpis?.amount_pv ?? 0} icon="file-invoice-dollar" color="#0891b2" />
          <ExtraCard label="ใบกำกับ 7%" count={kpis?.count_vat ?? 0} amount={kpis?.amount_vat ?? 0} icon="check-circle" color="#059669" />
          <ExtraCard label="รอใบกำกับ" count={kpis?.count_wait ?? 0} amount={kpis?.amount_wait ?? 0} icon="history" color="#ef4444" />
          <ExtraCard label="ใบเสร็จรับเงิน" count={kpis?.count_receipt ?? 0} amount={kpis?.amount_receipt ?? 0} icon="receipt" color="#06b6d4" />
          <ExtraCard label="ชุดชำระเงิน" count={kpis?.count_payment ?? 0} amount={kpis?.amount_payment ?? 0} icon="money-check-alt" color="#a855f7" />
        </ScrollView>

        <View style={styles.dateRangeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateRangeLabel}>📅 วันที่เริ่ม</Text>
            <TextInput style={styles.dateRangeInput} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={startDateFilter} onChangeText={setStartDateFilter} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateRangeLabel}>📅 ถึงวันที่</Text>
            <TextInput style={styles.dateRangeInput} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={endDateFilter} onChangeText={setEndDateFilter} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.specialFilterRow}>
          <TouchableOpacity
            style={[styles.specialChip, styles.specialChipUrgent, specialFilter === 'urgent' && styles.specialChipUrgentActive]}
            onPress={() => setSpecialFilter((f) => (f === 'urgent' ? 'none' : 'urgent'))}
          >
            <Ionicons name="flame" size={12} color={specialFilter === 'urgent' ? '#fff' : '#ef4444'} />
            <Text style={[styles.specialChipText, { color: specialFilter === 'urgent' ? '#fff' : '#ef4444' }]}>งานต้องตาม</Text>
            {(kpis?.count_urgent ?? 0) > 0 && (
              <View style={[styles.specialChipBadge, specialFilter === 'urgent' && { backgroundColor: '#fff' }]}>
                <Text style={[styles.specialChipBadgeText, specialFilter === 'urgent' && { color: '#ef4444' }]}>{kpis?.count_urgent}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.specialChip, specialFilter === 'overdue' && { backgroundColor: '#ef4444', borderColor: '#ef4444' }]}
            onPress={() => setSpecialFilter((f) => (f === 'overdue' ? 'none' : 'overdue'))}
          >
            <Ionicons name="calendar-clear" size={12} color={specialFilter === 'overdue' ? '#fff' : '#ef4444'} />
            <Text style={[styles.specialChipText, { color: specialFilter === 'overdue' ? '#fff' : '#ef4444' }]}>เกินกำหนดติดตาม</Text>
            {(kpis?.count_overdue ?? 0) > 0 && (
              <View style={[styles.specialChipBadge, { backgroundColor: specialFilter === 'overdue' ? '#fff' : '#ef4444' }]}>
                <Text style={[styles.specialChipBadgeText, { color: specialFilter === 'overdue' ? '#ef4444' : '#fff' }]}>{kpis?.count_overdue}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.specialChip, specialFilter === 'taxdone' && { backgroundColor: '#059669', borderColor: '#059669' }]}
            onPress={() => setSpecialFilter((f) => (f === 'taxdone' ? 'none' : 'taxdone'))}
          >
            <Ionicons name="checkmark-circle" size={12} color={specialFilter === 'taxdone' ? '#fff' : '#059669'} />
            <Text style={[styles.specialChipText, { color: specialFilter === 'taxdone' ? '#fff' : '#059669' }]}>รับใบกำกับแล้ว</Text>
            {(kpis?.count_taxdone ?? 0) > 0 && (
              <View style={[styles.specialChipBadge, { backgroundColor: specialFilter === 'taxdone' ? '#fff' : '#059669' }]}>
                <Text style={[styles.specialChipBadgeText, { color: specialFilter === 'taxdone' ? '#059669' : '#fff' }]}>{kpis?.count_taxdone}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.specialChip, styles.specialChipCredit, specialFilter === 'creditAlert' && styles.specialChipCreditActive]}
            onPress={() => setSpecialFilter((f) => (f === 'creditAlert' ? 'none' : 'creditAlert'))}
          >
            <Ionicons name="warning" size={12} color={specialFilter === 'creditAlert' ? '#fff' : '#d97706'} />
            <Text style={[styles.specialChipText, { color: specialFilter === 'creditAlert' ? '#fff' : '#d97706' }]}>เครดิตใกล้หมด</Text>
            {(kpis?.count_credit_alert ?? 0) > 0 && (
              <View style={[styles.specialChipBadge, { backgroundColor: specialFilter === 'creditAlert' ? '#fff' : '#d97706' }]}>
                <Text style={[styles.specialChipBadgeText, { color: specialFilter === 'creditAlert' ? '#d97706' : '#fff' }]}>{kpis?.count_credit_alert}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.specialChipSolid, stageFilter === 'returned' && styles.specialChipSolidActive]}
            onPress={() => setStageFilter((f) => (f === 'returned' ? 'all' : 'returned'))}
          >
            <Ionicons name="arrow-undo" size={12} color="#fff" />
            <Text style={styles.specialChipSolidText}>ตีกลับ (แก้ไข)</Text>
            {(kpis?.count_returned ?? 0) > 0 && (
              <View style={styles.specialChipSolidBadge}>
                <Text style={styles.specialChipSolidBadgeText}>{kpis?.count_returned}</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#94a3b8" />
          <TextInput style={styles.searchInput} placeholder="ค้นหาเลขเอกสาร/ซัพพลายเออร์/หน้างาน..." placeholderTextColor="#94a3b8" value={search} onChangeText={setSearch} />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#cbd5e1" />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.filterGroupLabel}>ช่วงยอดเงิน</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {(
            [
              { v: 'all', l: 'ทั้งหมด' },
              { v: 'low', l: '0 - 10,000' },
              { v: 'medium', l: '10,001 - 100,000' },
              { v: 'high', l: '100,001 ขึ้นไป' },
            ] as const
          ).map((o) => {
            const active = amountRange === o.v;
            return (
              <TouchableOpacity key={o.v} onPress={() => setAmountRange(o.v)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.l}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.resetBtnRow}>
          <TouchableOpacity
            style={styles.showAllBtn}
            onPress={() => {
              setStartDateFilter('');
              setEndDateFilter('');
            }}
          >
            <Ionicons name="calendar" size={12} color="#fff" />
            <Text style={styles.showAllBtnText}>แสดงทั้งหมด</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetDefaultBtn} onPress={resetAllFilters}>
            <Ionicons name="sync-outline" size={12} color="#475569" />
            <Text style={styles.resetDefaultBtnText}>ค่าเริ่มต้น</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {(['all', 'PO', 'AX'] as const).map((t) => {
            const active = docTypeFilter === t;
            return (
              <TouchableOpacity key={t} onPress={() => setDocTypeFilter(t)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t === 'all' ? 'ทุกประเภท' : t}</Text>
              </TouchableOpacity>
            );
          })}
          {stageFilter !== 'all' && (
            <TouchableOpacity onPress={() => setStageFilter('all')} style={[styles.chip, styles.clearChip]}>
              <Ionicons name="close" size={11} color="#ef4444" />
              <Text style={[styles.chipText, { color: '#ef4444' }]}>ล้างตัวกรองสถานะ</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <Text style={styles.resultCount}>แสดง {docs.length} เอกสาร</Text>
        {loading && <ActivityIndicator style={{ marginTop: 8 }} color="#4f46e5" />}
      </View>
    );
  }

  function renderCard({ item: d }: { item: DocListItem }) {
    const id = docId(d);
    const isCancelled = truthy(d.is_cancelled);
    const stage = STAGE_META[stageOf(d)];
    const attachments = arr(d.attachments);
    const extraLabel = attachments[0] ?? 'เอกสารทั่วไป';
    const isTaxDoc = attachments.some((a) => a.includes('ใบกำกับ'));
    const expanded = expandedIds.has(id);
    const slipFiles = arr(d.slip_files);
    const slipFullFiles = arr(d.slip_full_files);
    const isReturned = truthy(d.is_returned);
    const isTaxReturned = truthy(d.is_tax_returned);
    const hasCredit = !!d.credit_term;

    return (
      <View style={[styles.card, isCancelled && styles.cardCancelled]}>
        {isCancelled && (
          <View style={styles.cancelRibbon}>
            <Ionicons name="ban" size={11} color="#fff" />
            <Text style={styles.cancelRibbonText}>ยกเลิกแล้ว{d.cancel_reason ? ` — ${d.cancel_reason}` : ''}</Text>
          </View>
        )}

        <View style={styles.cardTopRow}>
          <Text style={styles.companyText}>{d.company_display || d.company_full_name || d.company_shortname || '-'}</Text>
          <View style={styles.docTypeBadge}>
            <Text style={styles.docTypeBadgeText}>{d.doc_type}-{(d.doc_number ?? '').replace(/^(PO|AX)-/, '')}</Text>
          </View>
        </View>
        <Text style={styles.dateText}>{d.created_at_thai || d.created_at || '-'}</Text>

        <View style={styles.metaRow}>
          <Ionicons name="person-outline" size={11} color="#94a3b8" />
          <Text style={styles.metaText}>{d.ordered_by || '-'}</Text>
          <Ionicons name="business-outline" size={11} color="#94a3b8" style={{ marginLeft: 8 }} />
          <Text style={styles.metaText}>{d.job_site || '-'}</Text>
        </View>

        <View style={styles.supplierBox}>
          <Text style={styles.supplierName}>{d.supplier_name || '-'}</Text>
          {!!d.bank_name && (
            <Text style={styles.bankText}>
              🏦 {d.bank_name} {!!d.bank_account && `· ${d.bank_account}`}
            </Text>
          )}
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.amountValue}>{num(d.amount)} ฿</Text>
          <TouchableOpacity style={[styles.extraBadge, { backgroundColor: '#64748b18' }]} onPress={() => toggleExpand(id)}>
            <FontAwesome5 name="file-alt" size={9} color="#64748b" />
            <Text style={[styles.extraBadgeText, { color: '#64748b' }]} numberOfLines={1}>
              {extraLabel}
            </Text>
          </TouchableOpacity>
        </View>

        {!isCancelled && (
          <TouchableOpacity
            style={[styles.stageBadge, { backgroundColor: stage.bg }]}
            onPress={() => {
              if (stageOf(d) === 'pending_approve') {
                if (perms.can_approve) setApproveModal({ visible: true, doc: d });
                else Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์อนุมัติเอกสาร');
              } else if (stageOf(d) === 'pending_finance') {
                if (perms.can_save_finance) setFinanceModal({ visible: true, doc: d, slip: [], full: [] });
                else Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ลงรับเอกสาร');
              } else Alert.alert('รับเอกสารแล้ว', `การเงินรับเอกสารโดย ${d.finance_receiver ?? '-'} เมื่อ ${d.finance_received_at ?? '-'}`);
            }}
          >
            <Ionicons name={stage.icon} size={13} color={stage.fg} />
            <Text style={[styles.stageBadgeText, { color: stage.fg }]}>{stage.label}</Text>
          </TouchableOpacity>
        )}

        {!isCancelled && perms.can_save_finance && stageOf(d) === 'finance_received' && (
          <View style={styles.slipBtnRow}>
            <TouchableOpacity
              style={[styles.slipBtn, slipFiles.length > 0 ? styles.slipBtnFilled : styles.slipBtnEmpty]}
              onPress={() => setFinanceModal({ visible: true, doc: d, slip: [], full: [] })}
            >
              <Ionicons name={slipFiles.length > 0 ? 'document-text' : 'cloud-upload-outline'} size={12} color={slipFiles.length > 0 ? '#047857' : '#ef4444'} />
              <Text style={[styles.slipBtnText, { color: slipFiles.length > 0 ? '#047857' : '#ef4444' }]} numberOfLines={1}>
                {slipFiles.length > 0 ? `ดู/แนบเพิ่มสลิปปกติ (${slipFiles.length})` : 'แนบสลิปปกติ'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.slipBtn, slipFullFiles.length > 0 ? styles.slipBtnFilledBlue : styles.slipBtnEmpty]}
              onPress={() => setFinanceModal({ visible: true, doc: d, slip: [], full: [] })}
            >
              <Ionicons name={slipFullFiles.length > 0 ? 'document-attach' : 'cloud-upload-outline'} size={12} color={slipFullFiles.length > 0 ? '#1e3a8a' : '#ef4444'} />
              <Text style={[styles.slipBtnText, { color: slipFullFiles.length > 0 ? '#1e3a8a' : '#ef4444' }]} numberOfLines={1}>
                {slipFullFiles.length > 0 ? `ดู/แนบเพิ่มสลิปเต็ม (${slipFullFiles.length})` : 'แนบสลิปเต็ม'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={() => toggleExpand(id)} style={styles.expandToggle}>
          <Text style={styles.expandToggleText}>{expanded ? 'ย่อรายละเอียด' : 'ดูรายละเอียดเพิ่มเติม'}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color="#475569" />
        </TouchableOpacity>

        {expanded && !isCancelled && (
          <View style={styles.expandBody}>
            {!!d.tax_issue_status && (
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>กำหนดติดตามใบกำกับ</Text>
                <Text style={styles.infoLineValue}>{d.tax_issue_status}</Text>
              </View>
            )}

            {slipFiles.length + slipFullFiles.length > 0 && (
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>ไฟล์สลิป</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                  {slipFiles.map((f, i) => (
                    <TouchableOpacity key={`s${i}`} onPress={() => openFile(slipUrl(f))}>
                      <Text style={styles.fileLinkText}>สลิป {i + 1}</Text>
                    </TouchableOpacity>
                  ))}
                  {slipFullFiles.map((f, i) => (
                    <TouchableOpacity key={`f${i}`} onPress={() => openFile(slipUrl(f))}>
                      <Text style={styles.fileLinkText}>เต็ม {i + 1}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.infoLine, isReturned ? styles.infoLineDanger : styles.infoLineNeutral]}
              onPress={() => (perms.can_return_document ? setReturnModal({ visible: true, doc: d, text: d.return_remark ?? '' }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ตีกลับเอกสาร'))}
            >
              <Text style={[styles.infoLineLabel, isReturned && { color: '#dc2626' }]}>ตีกลับเอกสาร (ตั้งโอน)</Text>
              <Text style={[styles.infoLineValue, isReturned && { color: '#dc2626' }]}>{isReturned ? `ตีกลับแล้ว — ${d.return_remark}` : 'ยังไม่ตีกลับ'}</Text>
            </TouchableOpacity>

            <Text style={styles.deptSectionLabel}>รับใบกำกับภาษี 3 แผนก</Text>
            {!isTaxDoc ? (
              <Text style={styles.deptNaText}>— ไม่ใช่เอกสารประเภทใบกำกับภาษี —</Text>
            ) : (
              <View style={styles.deptRow}>
                {(['warehouse', 'purchase', 'accounting'] as DeptKey[]).map((key) => {
                  const meta = DEPT_META[key];
                  const received =
                    key === 'warehouse' ? !!d.wh_tax_receiver
                    : key === 'purchase' ? !!d.tax_receiver
                    : !!d.acc_receiver;
                  const receiver = key === 'warehouse' ? d.wh_tax_receiver : key === 'purchase' ? d.tax_receiver : d.acc_receiver;
                  const invNos = key === 'warehouse' ? arr(d.wh_tax_invoice_no) : key === 'purchase' ? arr(d.tax_invoice_no) : [];
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.deptChip, received ? { backgroundColor: meta.color + '18', borderColor: meta.color } : styles.deptChipEmpty]}
                      onPress={() => {
                        if (received) {
                          const buttons: any[] = [{ text: 'ปิด', style: 'cancel' }];
                          if (perms.can_cancel_step_receive) buttons.push({ text: 'ยกเลิกการรับ', style: 'destructive', onPress: () => askCancelStepReceive(d, key) });
                          Alert.alert(`${meta.label}รับใบกำกับแล้ว`, `ผู้รับ: ${receiver}\nเลขที่: ${invNos.join(', ') || '-'}`, buttons);
                        } else if (perms.can_receive_tax) {
                          setDeptModal({ visible: true, doc: d, dept: key, invNo: '', note: '', files: [] });
                        } else {
                          Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์รับใบกำกับภาษี');
                        }
                      }}
                    >
                      <Ionicons name={meta.icon} size={13} color={received ? meta.color : '#94a3b8'} />
                      <Text style={[styles.deptChipText, { color: received ? meta.color : '#94a3b8' }]}>{meta.label}</Text>
                      <Ionicons name={received ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={received ? meta.color : '#cbd5e1'} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <TouchableOpacity
              style={[styles.infoLine, isTaxReturned ? styles.infoLineDanger : styles.infoLineNeutral]}
              onPress={() => (perms.can_return_document ? setReturnTaxModal({ visible: true, doc: d, text: d.return_tax_remark ?? '' }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ตีกลับใบกำกับภาษี'))}
            >
              <Text style={[styles.infoLineLabel, isTaxReturned && { color: '#dc2626' }]}>ตีกลับใบกำกับภาษี</Text>
              <Text style={[styles.infoLineValue, isTaxReturned && { color: '#dc2626' }]}>{isTaxReturned ? `ตีกลับแล้ว — ${d.return_tax_remark ?? ''}` : 'ปกติ'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.infoLine}
              onPress={() => (perms.can_update_credit ? setCreditModal({ visible: true, doc: d }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ตั้งค่าเครดิต'))}
            >
              <Text style={styles.infoLineLabel}>เครดิต</Text>
              <Text style={styles.infoLineValue}>{d.credit_term ? `${d.credit_term} วัน` : 'ยังไม่ระบุ — แตะเพื่อตั้งค่า'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.infoLine, truthy(d.is_refunded) && { backgroundColor: '#ecfdf5' }]}
              onPress={() => (perms.can_save_refund ? setRefundModal({ visible: true, doc: d, date: d.refund_at ?? '', note: d.refund_note ?? '', files: [] }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์บันทึกการคืนเงิน'))}
            >
              <Text style={[styles.infoLineLabel, truthy(d.is_refunded) && { color: '#059669' }]}>คืนเงินจากซัพพลายเออร์</Text>
              <Text style={[styles.infoLineValue, truthy(d.is_refunded) && { color: '#059669' }]}>{truthy(d.is_refunded) ? `คืนแล้ว ${d.refund_at_thai ?? d.refund_at ?? ''}` : 'ยังไม่คืน'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.infoLine}
              onPress={() => (perms.can_save_note ? setNoteModal({ visible: true, doc: d, text: d.doc_note ?? '' }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์บันทึกหมายเหตุ'))}
            >
              <Text style={styles.infoLineLabel}>หมายเหตุ</Text>
              <Text style={styles.infoLineValue} numberOfLines={2}>
                {d.doc_note || 'แตะเพื่อบันทึกหมายเหตุ'}
              </Text>
            </TouchableOpacity>

            <View style={styles.moreActionsRow}>
              <TouchableOpacity style={styles.moreActionBtn} onPress={() => openHistory(d)}>
                <Ionicons name="time-outline" size={13} color="#475569" />
                <Text style={styles.moreActionBtnText}>ประวัติ</Text>
              </TouchableOpacity>
              {perms.can_edit_document && (
                <TouchableOpacity style={styles.moreActionBtn} onPress={() => openEditModal(d)}>
                  <Ionicons name="create-outline" size={13} color="#0ea5e9" />
                  <Text style={[styles.moreActionBtnText, { color: '#0ea5e9' }]}>แก้ไข</Text>
                </TouchableOpacity>
              )}
              {perms.can_cancel_document && (
                <TouchableOpacity style={styles.moreActionBtn} onPress={() => setCancelModal({ visible: true, doc: d, reason: '' })}>
                  <Ionicons name="close-circle-outline" size={13} color="#ef4444" />
                  <Text style={[styles.moreActionBtnText, { color: '#ef4444' }]}>ยกเลิก</Text>
                </TouchableOpacity>
              )}
              {hasCredit && perms.can_receive_warehouse && (
                <TouchableOpacity style={styles.moreActionBtn} onPress={() => setWarehouseModal({ visible: true, doc: d, docNo: d.warehouse_doc_no ?? '' })}>
                  <Ionicons name="cube-outline" size={13} color="#d97706" />
                  <Text style={[styles.moreActionBtnText, { color: '#d97706' }]}>คลังรับสินค้า</Text>
                </TouchableOpacity>
              )}
              {hasCredit && perms.can_update_bill_pay && (
                <TouchableOpacity
                  style={styles.moreActionBtn}
                  onPress={() =>
                    setBillPayModal({
                      visible: true,
                      doc: d,
                      taxInvoiceNo: '',
                      billingDocNo: d.billing_doc_no ?? '',
                      billingDate: d.billing_date ?? '',
                      paymentDueDate: d.payment_due_date ?? '',
                      paymentStatus: d.payment_status ?? '',
                    })
                  }
                >
                  <Ionicons name="document-text-outline" size={13} color="#4f46e5" />
                  <Text style={[styles.moreActionBtnText, { color: '#4f46e5' }]}>บิล/จ่ายเงิน</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    );
  }

  if (submitScreen.visible) {
    return (
      <SubmitDocumentScreen
        onBack={() => setSubmitScreen({ visible: false })}
        onSaved={() => {
          setSubmitScreen({ visible: false });
          load();
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <FlatList
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
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />

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
        <Text style={styles.hintText}>ไฟล์เดิมจะไม่ถูกลบ — ปุ่มนี้แนบไฟล์เพิ่มเข้าไปเท่านั้น</Text>
        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#d97706', opacity: financeModal.saving ? 0.6 : 1 }]} onPress={confirmFinance} disabled={financeModal.saving}>
          <Text style={styles.modalSaveBtnText}>{financeModal.saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</Text>
        </TouchableOpacity>
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
      <ModalShell visible={refundModal.visible} title="💸 คืนเงินจากซัพพลายเออร์" color="#059669" onClose={() => setRefundModal({ visible: false, date: '', note: '', files: [] })}>
        <FieldLabel text="ผู้ทำรายการ" />
        <View style={styles.readonlyInput}>
          <Text style={styles.readonlyInputText}>{user?.fullname ?? '-'}</Text>
        </View>
        <FieldLabel text="วันที่คืนเงิน" required />
        <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={refundModal.date} onChangeText={(v) => setRefundModal((s) => ({ ...s, date: v }))} />
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
      </ModalShell>

      {/* Modal: รับใบกำกับภาษี (ใช้ร่วมกัน 3 แผนก) */}
      <ModalShell
        visible={deptModal.visible}
        title={deptModal.dept ? `📂 ${DEPT_META[deptModal.dept].label}รับใบกำกับภาษี` : ''}
        color={deptModal.dept ? DEPT_META[deptModal.dept].color : '#4f46e5'}
        onClose={() => setDeptModal({ visible: false, invNo: '', note: '', files: [] })}
      >
        <FieldLabel text="เลขที่ใบกำกับภาษี (คั่นด้วย , ถ้ามีหลายเลข)" required />
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
          <Text style={styles.attachBtnText}>แนบไฟล์ใบกำกับ ({deptModal.files.length})</Text>
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
      </ModalShell>

      {/* Modal: ยกเลิกเอกสาร */}
      <ModalShell visible={cancelModal.visible} title="🚫 ยกเลิกเอกสาร" color="#ef4444" onClose={() => setCancelModal({ visible: false, reason: '' })}>
        <FieldLabel text="เหตุผลที่ยกเลิก" required />
        <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุเหตุผล..." placeholderTextColor="#94a3b8" multiline value={cancelModal.reason} onChangeText={(v) => setCancelModal((s) => ({ ...s, reason: v }))} />
        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#ef4444', opacity: cancelModal.saving ? 0.6 : 1 }]} onPress={confirmCancelDocument} disabled={cancelModal.saving}>
          <Text style={styles.modalSaveBtnText}>{cancelModal.saving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิกเอกสาร'}</Text>
        </TouchableOpacity>
      </ModalShell>

      {/* Modal: แก้ไขเอกสาร — action edit_document จริง (5 ช่องที่ API รองรับเท่านั้น) */}
      <ModalShell
        visible={editModal.visible}
        title="✏️ แก้ไขเอกสาร"
        color="#0ea5e9"
        onClose={() => setEditModal({ visible: false, docNumber: '', jobSite: '', supplierName: '', description: '', amount: '' })}
      >
        <FieldLabel text="เลขที่เอกสาร" />
        <TextInput style={styles.input} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={editModal.docNumber} onChangeText={(v) => setEditModal((s) => ({ ...s, docNumber: v }))} />
        <FieldLabel text="หน้างาน" />
        <TextInput style={styles.input} placeholder="ระบุหน้างาน..." placeholderTextColor="#94a3b8" value={editModal.jobSite} onChangeText={(v) => setEditModal((s) => ({ ...s, jobSite: v }))} />
        <FieldLabel text="ซัพพลายเออร์" required />
        <TextInput style={styles.input} placeholder="ระบุชื่อซัพพลายเออร์..." placeholderTextColor="#94a3b8" value={editModal.supplierName} onChangeText={(v) => setEditModal((s) => ({ ...s, supplierName: v }))} />
        <FieldLabel text="รายละเอียด" />
        <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุรายละเอียด..." placeholderTextColor="#94a3b8" multiline value={editModal.description} onChangeText={(v) => setEditModal((s) => ({ ...s, description: v }))} />
        <FieldLabel text="ยอดเงิน" required />
        <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94a3b8" keyboardType="numeric" value={editModal.amount} onChangeText={(v) => setEditModal((s) => ({ ...s, amount: v }))} />
        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#0ea5e9', opacity: editModal.saving ? 0.6 : 1 }]} onPress={confirmEditDocument} disabled={editModal.saving}>
          <Text style={styles.modalSaveBtnText}>{editModal.saving ? 'กำลังบันทึก...' : 'บันทึก'}</Text>
        </TouchableOpacity>
      </ModalShell>

      {/* Modal: คลังรับสินค้า */}
      <ModalShell visible={warehouseModal.visible} title="📦 คลังรับสินค้า" color="#d97706" onClose={() => setWarehouseModal({ visible: false, docNo: '' })}>
        <FieldLabel text="เลขที่เอกสารรับของคลัง" />
        <TextInput style={styles.input} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={warehouseModal.docNo} onChangeText={(v) => setWarehouseModal((s) => ({ ...s, docNo: v }))} />
        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#d97706', opacity: warehouseModal.saving ? 0.6 : 1 }]} onPress={confirmWarehouseReceive} disabled={warehouseModal.saving}>
          <Text style={styles.modalSaveBtnText}>{warehouseModal.saving ? 'กำลังบันทึก...' : 'บันทึก'}</Text>
        </TouchableOpacity>
      </ModalShell>

      {/* Modal: บิล/จ่ายเงิน */}
      <ModalShell visible={billPayModal.visible} title="📄 ข้อมูลบิล & การจ่ายเงิน" color="#4f46e5" onClose={() => setBillPayModal({ visible: false, taxInvoiceNo: '', billingDocNo: '', billingDate: '', paymentDueDate: '', paymentStatus: '' })}>
        <FieldLabel text="เลขที่ใบกำกับภาษี" />
        <TextInput style={styles.input} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={billPayModal.taxInvoiceNo} onChangeText={(v) => setBillPayModal((s) => ({ ...s, taxInvoiceNo: v }))} />
        <FieldLabel text="เลขที่เอกสารวางบิล" />
        <TextInput style={styles.input} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={billPayModal.billingDocNo} onChangeText={(v) => setBillPayModal((s) => ({ ...s, billingDocNo: v }))} />
        <FieldLabel text="วันที่วางบิล" />
        <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={billPayModal.billingDate} onChangeText={(v) => setBillPayModal((s) => ({ ...s, billingDate: v }))} />
        <FieldLabel text="วันครบกำหนดชำระ" />
        <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={billPayModal.paymentDueDate} onChangeText={(v) => setBillPayModal((s) => ({ ...s, paymentDueDate: v }))} />
        <FieldLabel text="สถานะการจ่ายเงิน" />
        <View style={styles.exportChipsRow}>
          {(master?.payment_status_options ?? []).map((o) => (
            <TouchableOpacity key={o.value} onPress={() => setBillPayModal((s) => ({ ...s, paymentStatus: o.value }))} style={[styles.chip, billPayModal.paymentStatus === o.value && styles.chipActive]}>
              <Text style={[styles.chipText, billPayModal.paymentStatus === o.value && styles.chipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#4f46e5', opacity: billPayModal.saving ? 0.6 : 1 }]} onPress={confirmBillPay} disabled={billPayModal.saving}>
          <Text style={styles.modalSaveBtnText}>{billPayModal.saving ? 'กำลังบันทึก...' : 'บันทึก'}</Text>
        </TouchableOpacity>
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
              <HistoryLine key={log.id} when={log.action_at_thai ?? log.action_at} who={log.action_by} what={log.action_label} danger={log.action_type === 'cancel'} />
            ))}
          </View>
        )}
      </ModalShell>
    </SafeAreaView>
  );
}

function PipelineCard({ label, value, color, icon, active, onPress }: { label: string; value: number; color: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.pipelineCard, { backgroundColor: color + '18', borderColor: active ? color : 'transparent' }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.pipelineCardLabel, { color }]}>{label}</Text>
      <Text style={styles.pipelineCardValue}>{value}</Text>
    </TouchableOpacity>
  );
}

function ExtraCard({ label, count, amount, icon, color }: { label: string; count: number; amount: number; icon: keyof typeof FontAwesome5.glyphMap; color: string }) {
  return (
    <View style={styles.extraCard}>
      <FontAwesome5 name={icon} size={13} color={color} />
      <Text style={styles.extraCardLabel}>{label}</Text>
      <Text style={[styles.extraCardValue, { color }]}>{count}</Text>
      <Text style={styles.extraCardSub}>{num(amount)} บ.</Text>
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

function HistoryLine({ when, who, what, danger }: { when?: string; who?: string; what: string; danger?: boolean }) {
  return (
    <View style={styles.historyLine}>
      <View style={[styles.historyDot, danger && { backgroundColor: '#ef4444' }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.historyWhat, danger && { color: '#dc2626' }]}>{what}</Text>
        <Text style={styles.historyMeta}>
          {when ?? '-'} · {who ?? '-'}
        </Text>
      </View>
    </View>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7fb' },

  titleBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12 },
  addDocBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#4f46e5', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 8 },
  addDocBtnText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },

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

  dateRangeRow: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 14 },
  dateRangeLabel: { fontSize: 10.5, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  dateRangeInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: '#0f172a', backgroundColor: '#fff' },

  specialFilterRow: { paddingHorizontal: 14, paddingTop: 12, gap: 6 },
  specialChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 11, paddingVertical: 7 },
  specialChipUrgent: { borderColor: '#fca5a5' },
  specialChipUrgentActive: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  specialChipCredit: { borderColor: '#fde68a' },
  specialChipCreditActive: { backgroundColor: '#d97706', borderColor: '#d97706' },
  specialChipText: { fontSize: 11, fontWeight: '700' },
  specialChipBadge: { backgroundColor: '#fff', borderRadius: 50, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 2 },
  specialChipBadgeText: { fontSize: 10, fontWeight: '800' },
  specialChipSolid: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#64748b', borderRadius: 50, paddingHorizontal: 11, paddingVertical: 7 },
  specialChipSolidActive: { backgroundColor: '#334155' },
  specialChipSolidText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  specialChipSolidBadge: { backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 50, paddingHorizontal: 6, paddingVertical: 1 },
  specialChipSolidBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  filterGroupLabel: { marginHorizontal: 14, marginTop: 14, marginBottom: 6, fontSize: 11, fontWeight: '700', color: '#64748b' },

  resetBtnRow: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 12 },
  showAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#3b82f6', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 8 },
  showAllBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  resetDefaultBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f1f5f9', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 8 },
  resetDefaultBtnText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },

  totalCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#4f46e5', borderRadius: 16, padding: 14, marginHorizontal: 14, marginTop: 12 },
  totalCardIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  totalCardLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  totalCardValue: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2 },
  totalCardSub: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, marginTop: 2 },

  pipelineRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  pipelineCard: { width: 108, borderRadius: 12, borderWidth: 1.5, padding: 10, alignItems: 'flex-start', gap: 4 },
  pipelineCardLabel: { fontSize: 10.5, fontWeight: '700' },
  pipelineCardValue: { fontSize: 18, fontWeight: '900', color: '#0f172a' },

  extraRow: { paddingHorizontal: 14, gap: 8, paddingBottom: 4 },
  extraCard: { width: 96, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 10, alignItems: 'flex-start', gap: 3 },
  extraCardLabel: { fontSize: 9.5, color: '#64748b', fontWeight: '700' },
  extraCardValue: { fontSize: 16, fontWeight: '900' },
  extraCardSub: { fontSize: 9, color: '#94a3b8', fontWeight: '600' },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 12.5, color: '#0f172a' },

  chipsRow: { paddingHorizontal: 14, paddingTop: 10, gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  chipActiveGreen: { backgroundColor: '#107c41', borderColor: '#107c41' },
  exportChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 2 },
  rowGapExport: { flexDirection: 'row', gap: 8, marginTop: 4 },
  clearChip: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  chipText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  chipTextActive: { color: '#fff' },

  resultCount: { marginHorizontal: 14, marginTop: 12, marginBottom: 4, fontSize: 11.5, color: '#64748b', fontWeight: '600' },

  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 14, marginTop: 12, padding: 13, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  cardCancelled: { opacity: 0.7 },
  cancelRibbon: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#64748b', marginHorizontal: -13, marginTop: -13, paddingHorizontal: 13, paddingVertical: 6, marginBottom: 10 },
  cancelRibbonText: { color: '#fff', fontSize: 10.5, fontWeight: '700', flexShrink: 1 },

  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  companyText: { fontSize: 13, fontWeight: '800', color: '#4f46e5' },
  docTypeBadge: { backgroundColor: '#eef2ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  docTypeBadgeText: { fontSize: 11, fontWeight: '800', color: '#4338ca' },
  dateText: { fontSize: 11, color: '#94a3b8', marginTop: 3, fontWeight: '600' },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  metaText: { fontSize: 11.5, color: '#475569', marginLeft: 4 },

  supplierBox: { marginTop: 8, backgroundColor: '#f8fafc', borderRadius: 8, padding: 8 },
  supplierName: { fontSize: 12.5, fontWeight: '700', color: '#1e293b' },
  bankText: { fontSize: 10.5, color: '#64748b', marginTop: 3 },

  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  amountValue: { fontSize: 16, fontWeight: '900', color: '#4f46e5' },
  extraBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 140 },
  extraBadgeText: { fontSize: 9.5, fontWeight: '700' },

  stageBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 10 },
  stageBadgeText: { fontSize: 11.5, fontWeight: '700' },
  slipBtnRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  slipBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 4 },
  slipBtnEmpty: { backgroundColor: '#fff', borderColor: '#ef4444' },
  slipBtnFilled: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  slipBtnFilledBlue: { backgroundColor: '#eff6ff', borderColor: '#1e3a8a' },
  slipBtnText: { fontSize: 9.5, fontWeight: '700', flexShrink: 1 },

  expandToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10, paddingVertical: 6 },
  expandToggleText: { fontSize: 11, fontWeight: '700', color: '#475569' },

  expandBody: { marginTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, gap: 8 },
  infoLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  infoLineNeutral: {},
  infoLineDanger: { backgroundColor: '#fef2f2' },
  infoLineLabel: { fontSize: 11, color: '#64748b', fontWeight: '700' },
  infoLineValue: { fontSize: 11, color: '#334155', fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  fileLinkText: { fontSize: 10.5, color: '#2563eb', fontWeight: '700', textDecorationLine: 'underline' },

  deptSectionLabel: { fontSize: 10.5, color: '#94a3b8', fontWeight: '700', marginTop: 2 },
  deptRow: { flexDirection: 'row', gap: 6 },
  deptNaText: { fontSize: 11, color: '#cbd5e1', fontStyle: 'italic' },
  deptChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderRadius: 8, paddingVertical: 8 },
  deptChipEmpty: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  deptChipText: { fontSize: 10.5, fontWeight: '700' },

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
  historyDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#4f46e5', marginTop: 4 },
  historyWhat: { fontSize: 12.5, fontWeight: '700', color: '#1e293b' },
  historyMeta: { fontSize: 10.5, color: '#94a3b8', marginTop: 2 },
});
