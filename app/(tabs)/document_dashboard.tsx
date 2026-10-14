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
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ Config
import { API_BASE, API_MODULES } from '../../constants/config';
// 🌟 ปุ่มเลือกวันที่ + รูปแบบวันที่/เวลาสั้น "d/m/yy" มาตรฐานเดียวกันทั้งแอป
import { DateField, formatShortThaiDate, formatShortThaiDateTime } from '../../components/DateTimeField';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';
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

// ตรงกับ <select name="payment_status"> ใน DocumentDashboard.php:4293-4299 (ตัวเลือกฝังตายตัว ไม่ได้มาจาก get_master_data)
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

const CREDIT_OPTIONS = [15, 30, 45, 60, 90];
const DEPT_META: Record<DeptKey, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap; step: string }> = {
  warehouse: { label: 'คลัง', color: '#d97706', icon: 'cube-outline', step: 'wh_tax' },
  purchase: { label: 'จัดซื้อ', color: '#2563eb', icon: 'cart-outline', step: 'buyer_tax' },
  accounting: { label: 'บัญชี', color: '#9333ea', icon: 'calculator-outline', step: 'acc_tax' },
};

// รวมฟิลด์ของแต่ละแผนก (ผู้รับ/วันที่/เลขที่ใบกำกับ/ไฟล์แนบ/หมายเหตุ) ไว้จุดเดียว — ใช้ทั้งตอนแสดง
// การ์ดสรุปและตอนเปิด modal "ดูรายละเอียด" (deptDetailModal) กันข้อมูลไม่ตรงกัน 2 จุด
function deptFields(d: DocListItem, key: DeptKey) {
  if (key === 'warehouse') {
    return { receiver: d.wh_tax_receiver, receivedAt: d.wh_tax_received_at, invNos: arr(d.wh_tax_invoice_no), files: arr(d.wh_tax_files), note: d.wh_tax_note };
  }
  if (key === 'purchase') {
    return { receiver: d.tax_receiver, receivedAt: d.tax_received_at, invNos: arr(d.tax_invoice_no), files: arr(d.tax_files), note: d.note_buyer };
  }
  return { receiver: d.acc_receiver, receivedAt: d.acc_received_at, invNos: [] as string[], files: arr(d.acc_files), note: d.note_acc };
}

function slipUrl(name: string) {
  return `${API_BASE}/uploads/payment_slips/${name}`;
}
function refundUrl(name: string) {
  return `${API_BASE}/uploads/refunds/${name}`;
}
function rootUploadUrl(name: string) {
  return `${API_BASE}/uploads/${name}`;
}

// สถานะเครดิต (จำนวนวันคงเหลือ/วันครบกำหนด/สี) — พอร์ตตรงจาก DocumentDashboard.php:3669-3699
// (created_at + credit_term วัน = วันครบกำหนด, <=5 วันแดง, <=10 วันเหลือง, จ่ายแล้วเขียว)
type CreditTone = 'paid' | 'danger' | 'warn' | 'normal';
function creditStatus(d: DocListItem): { term: number; diffDays: number; dueShow: string; isPaid: boolean; tone: CreditTone } | null {
  const term = Number(d.credit_term ?? 0);
  if (!term || !d.created_at) return null;
  const created = new Date(d.created_at.replace(' ', 'T'));
  if (isNaN(created.getTime())) return null;
  const due = new Date(created);
  due.setDate(due.getDate() + term);
  const dueYmd = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const todayYmd = new Date();
  todayYmd.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((dueYmd - todayYmd.getTime()) / 86400000);
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
async function apiReceiveTaxDept(userId: string | number, dId: number, dept: DeptKey, invNos: string[], note: string, files: PickedFile[], reuseFiles: string[] = []) {
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
  // ไฟล์ที่ยืมมาจากแผนกอื่น (ชื่อไฟล์ที่มีอยู่แล้วบนเซิร์ฟเวอร์ ไม่ต้องอัปโหลดซ้ำ) — backend รวมเข้ากับไฟล์ใหม่ให้อัตโนมัติ
  reuseFiles.forEach((name) => fd.append('existing_files[]', name));
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
  const [kpiCompanies, setKpiCompanies] = useState<KpiCompany[]>([]);
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [perms, setPerms] = useState<Perms>(DEFAULT_PERMS);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [cancelledAmount, setCancelledAmount] = useState(0);

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
  const [financeModal, setFinanceModal] = useState<{ visible: boolean; doc?: DocListItem; slip: PickedFile[]; full: PickedFile[]; saving?: boolean }>({ visible: false, slip: [], full: [] });
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
  const [refundModal, setRefundModal] = useState<{ visible: boolean; doc?: DocListItem; date: string; note: string; files: PickedFile[]; saving?: boolean }>({ visible: false, date: '', note: '', files: [] });
  const [deptModal, setDeptModal] = useState<{ visible: boolean; doc?: DocListItem; dept?: DeptKey; invNo: string; note: string; files: PickedFile[]; reuseFiles: string[]; saving?: boolean }>({ visible: false, invNo: '', note: '', files: [], reuseFiles: [] });
  // "ดูรายละเอียด" ของแต่ละแผนกที่รับใบกำกับแล้ว — โชว์ไฟล์แนบจริง (กดดูรูปได้) แทน Alert ข้อความล้วน
  const [deptDetailModal, setDeptDetailModal] = useState<{ visible: boolean; doc?: DocListItem; dept?: DeptKey }>({ visible: false });
  const [historyModal, setHistoryModal] = useState<{ visible: boolean; doc?: DocListItem; logs: HistoryLog[]; loading: boolean }>({ visible: false, logs: [], loading: false });
  // หมายเหตุสถานะใบกำกับภาษี — action save_tax_status_note จริง (คนละคอลัมน์กับ doc_note ทั่วไป)
  const [statusNoteModal, setStatusNoteModal] = useState<{ visible: boolean; doc?: DocListItem; text: string; saving: boolean }>({ visible: false, text: '', saving: false });
  const [cancelModal, setCancelModal] = useState<{ visible: boolean; doc?: DocListItem; reason: string; saving?: boolean }>({ visible: false, reason: '' });
  const [docRequestModal, setDocRequestModal] = useState<{ visible: boolean; doc?: DocListItem; requestType: 'edit' | 'cancel'; remark: string; saving?: boolean }>({ visible: false, requestType: 'edit', remark: '' });
  const [acceptingReqId, setAcceptingReqId] = useState<number | null>(null);
  const [warehouseModal, setWarehouseModal] = useState<{ visible: boolean; doc?: DocListItem; docNo: string; saving?: boolean }>({ visible: false, docNo: '' });
  const [billPayModal, setBillPayModal] = useState<{
    visible: boolean; doc?: DocListItem; taxInvoiceNo: string; billingDocNo: string; billingDate: string; paymentDueDate: string; paymentStatus: string; saving?: boolean;
  }>({ visible: false, taxInvoiceNo: '', billingDocNo: '', billingDate: '', paymentDueDate: '', paymentStatus: '' });
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
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  useEffect(() => {
    setMoreInfoOpen(false);
  }, [detailModal.doc]);
  // ตัวกรองทั้งหมด (วันที่/ยอดเงิน/ประเภท/ตัวกรองพิเศษ) ย้ายเข้า bottom sheet — เดิมกางเต็มหัวจอเกือบทั้งหน้า
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // -------------------- Load --------------------

  const buildFilters = useCallback((): Record<string, string | number | undefined> => {
    const f: Record<string, string | number | undefined> = {};
    if (docTypeFilter !== 'all') f.doc_type = docTypeFilter;
    if (stageFilter !== 'all') f.status = stageFilter;
    if (amountRange !== 'all') f.amount_range = amountRange;
    if (search.trim()) f.search_all = search.trim();
    if (startDateFilter) f.start_date = startDateFilter;
    if (endDateFilter) f.end_date = endDateFilter;
    if (specialFilter === 'urgent') f.filter_urgent = 1;
    if (specialFilter === 'overdue') f.filter_overdue = 1;
    if (specialFilter === 'taxdone') f.filter_taxdone = 1;
    if (specialFilter === 'creditAlert') f.filter_credit_alert = 1;
    if (selectedCompanies.length > 0) f.company_id = selectedCompanies.join(',');
    if (keywordFilter) f.filter_keyword = keywordFilter;
    if (creditStatusFilter !== 'all') f.filter_credit_status = creditStatusFilter;
    return f;
  }, [docTypeFilter, stageFilter, amountRange, search, startDateFilter, endDateFilter, specialFilter, selectedCompanies, keywordFilter, creditStatusFilter]);

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
      // เว็บโชว์ชื่อเต็มบนการ์ดบริษัท (company_name ของ API เป็นชื่อย่อถ้ามี) จึงใช้ company_full_name ก่อน
      const byCompany: any[] = Array.isArray((dash as any).kpi_by_company) ? (dash as any).kpi_by_company : [];
      setKpiCompanies(
        byCompany.map((c) => ({ id: Number(c.company_id), name: String(c.company_full_name || c.company_name || '-'), kpi: c as KpiAll })),
      );
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
    load();
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
    // ไม่บังคับแนบสลิป — การเงินกดรับเอกสารก่อนแล้วค่อยแนบสลิปทีหลังได้ (เหมือนเว็บ / backend ไม่ได้บังคับ)
    // แต่ถ้ารับไปแล้วและไม่ได้เลือกไฟล์ใหม่ = ไม่มีอะไรเปลี่ยน -> ปิดเฉยๆ ไม่ยิง API
    // (กัน save_finance เขียนชื่อผู้รับเอกสารทับเป็นคนที่กดล่าสุด)
    const alreadyReceived = truthy(doc.is_finance_received) || !!doc.finance_receiver;
    if (slip.length === 0 && full.length === 0 && alreadyReceived) {
      setFinanceModal({ visible: false, slip: [], full: [] });
      return;
    }
    setFinanceModal((s) => ({ ...s, saving: true }));
    try {
      await apiSaveFinance(user.id, docId(doc), slip, full);
      setFinanceModal({ visible: false, slip: [], full: [] });
      load();
      Alert.alert(
        'บันทึกสำเร็จ',
        slip.length === 0 && full.length === 0 ? 'ลงรับเอกสารเรียบร้อย — แนบสลิปเพิ่มทีหลังได้' : 'ลงรับเอกสาร/แนบสลิปเรียบร้อย'
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
      await apiSaveRefund(user.id, docId(doc), refundModal.note.trim(), refundModal.date, refundModal.files);
      setRefundModal({ visible: false, date: '', note: '', files: [] });
      load();
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setRefundModal((s) => ({ ...s, saving: false }));
    }
  }

  async function confirmDeptReceive() {
    const { doc, dept, invNo, note, files, reuseFiles } = deptModal;
    if (!doc || !dept || !user) return;
    const invNos = invNo.split(',').map((s) => s.trim()).filter(Boolean);
    if (invNos.length === 0) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุเลขที่ใบกำกับอย่างน้อย 1 เลข');
      return;
    }
    setDeptModal((s) => ({ ...s, saving: true }));
    try {
      await apiReceiveTaxDept(user.id, docId(doc), dept, invNos, note.trim(), files, reuseFiles);
      setDeptModal({ visible: false, invNo: '', note: '', files: [], reuseFiles: [] });
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

  async function confirmStatusNote() {
    const doc = statusNoteModal.doc;
    if (!doc || !user) return;
    setStatusNoteModal((s) => ({ ...s, saving: true }));
    try {
      await apiSaveTaxStatusNote(user.id, docId(doc), statusNoteModal.text.trim());
      setStatusNoteModal({ visible: false, text: '', saving: false });
      load();
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
      load();
    } catch (e: any) {
      Alert.alert('ส่งคำขอไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
      setDocRequestModal((s) => ({ ...s, saving: false }));
    }
  }

  async function acceptDocRequest(requestId: number) {
    if (!user || acceptingReqId !== null) return;
    setAcceptingReqId(requestId);
    try {
      await apiAcceptDocRequest(user.id, requestId);
      load();
    } catch (e: any) {
      Alert.alert('รับทราบไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setAcceptingReqId(null);
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
        billing_date: billPayModal.billingDate,
        payment_due_date: billPayModal.paymentDueDate,
        payment_status: billPayModal.paymentStatus,
      });
      setBillPayModal({ visible: false, taxInvoiceNo: '', billingDocNo: '', billingDate: '', paymentDueDate: '', paymentStatus: '' });
      load();
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
      label: `${startDateFilter ? formatShortThaiDate(startDateFilter) : '...'} – ${endDateFilter ? formatShortThaiDate(endDateFilter) : '...'}`,
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
                  {(['all', 'PO', 'AX'] as const).map((t) => (
                    <SheetOption key={t} label={t === 'all' ? 'ทุกประเภท' : t} active={docTypeFilter === t} onPress={() => setDocTypeFilter(t)} />
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
                <Text style={styles.sheetApplyBtnText}>ดูผลลัพธ์ ({docs.length})</Text>
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

        <Text style={styles.resultCount}>แสดง {docs.length} เอกสาร</Text>
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
            onPress={() => (perms.can_save_finance ? setFinanceModal({ visible: true, doc: d, slip: [], full: [] }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ลงรับเอกสาร'))}
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
            {perms.can_edit_document && d.pending_request_status === 'pending' && !!d.pending_request_id && (
              <TouchableOpacity
                style={styles.pendingReqAcceptBtn}
                disabled={acceptingReqId === d.pending_request_id}
                onPress={() => acceptDocRequest(d.pending_request_id!)}
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
              {d.doc_type}-{(d.doc_number ?? '').replace(/^(PO|AX)-/, '')}
            </Text>
          </View>
        </View>

        <Text style={styles.supplierNameSummary} numberOfLines={1}>{d.supplier_name || '-'}</Text>
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

  // หน้ารายละเอียดเอกสาร — เปิดเต็มจอตอนแตะการ์ด รวมทุกอย่างที่เดิมอยู่ในการ์ดเดียว (ขั้นตอนอนุมัติ/
  // การเงิน, รับใบกำกับภาษี 3 แผนก, เครดิต/คืนเงิน/หมายเหตุ ฯลฯ) — เพิ่ม Stepper ให้เห็นขั้นตอนทันที
  // ตอนบน ส่วน logic/handler เดิมทั้งหมดคงไว้เหมือนเดิมทุกจุด ย้ายตำแหน่ง JSX เข้ามาเท่านั้น
  function renderDetailModal() {
    // ดึงเอกสารตัวล่าสุดจาก docs ตาม id ทุกครั้ง — หลังกดอนุมัติ/ลงรับ/ฯลฯ ลิสต์โหลดใหม่ แต่ snapshot
    // ใน detailModal.doc ยังเป็นของเก่า ถ้าไม่ sync หน้านี้จะค้างสถานะเดิมจนกว่าจะปิดแล้วเปิดใหม่
    const snapshot = detailModal.doc;
    if (!snapshot) return null;
    const d = docs.find((x) => docId(x) === docId(snapshot)) ?? snapshot;

    const isCancelled = truthy(d.is_cancelled);
    const attachments = arr(d.attachments);
    const isTaxDoc = attachments.some((a) => a.includes('ใบกำกับ'));
    // 🐛 [แก้บั๊ก] ป้ายเดิมโชว์ attachments[0] ตรงๆ ทำให้ค้างเป็น "ใบกำกับภาษี 7%" (สมบูรณ์) แม้มีแค่
    // คลัง/จัดซื้อลงรับ — backend เองก็ยึดกฎเดียวกัน: "รอใบกำกับภาษี 7%" ->"ใบกำกับภาษี 7%" จะถูก
    // เปลี่ยนสถานะเป็นสมบูรณ์ก็ต่อเมื่อ "บัญชี" (acc) ลงรับแล้วเท่านั้น (ดู receive_tax_acc ที่ทำ
    // str_replace ตรงนี้อัตโนมัติ) จึงต้องคำนวณจาก acc_receiver จริง ไม่ใช้ค่าดิบจาก attachments[0]
    const extraLabel = isTaxDoc ? (d.acc_receiver ? 'ใบกำกับภาษี 7%' : 'รอใบกำกับภาษี 7%') : attachments[0] ?? 'เอกสารทั่วไป';
    const slipFiles = arr(d.slip_files);
    const slipFullFiles = arr(d.slip_full_files);
    const isReturned = truthy(d.is_returned);
    const isTaxReturned = truthy(d.is_tax_returned);

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
      <Modal visible={detailModal.visible} animationType="slide" onRequestClose={() => setDetailModal({ visible: false })}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.detailHeaderBar}>
            <TouchableOpacity onPress={() => setDetailModal({ visible: false })} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color="#0f172a" />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>
              {d.doc_type}-{(d.doc_number ?? '').replace(/^(PO|AX)-/, '')}
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

            {!isCancelled && !!d.has_pending_request && (
              <View style={styles.pendingReqRibbon}>
                <Ionicons name="hourglass-outline" size={11} color="#fff" />
                <Text style={styles.pendingReqRibbonText}>
                  มีคำขอรออนุมัติ: {d.pending_request_type === 'cancel' ? 'ขอยกเลิกเอกสาร' : d.pending_request_type === 'edit' ? 'ขอแก้ไขเอกสาร' : d.pending_request_type}
                </Text>
                {perms.can_edit_document && d.pending_request_status === 'pending' && !!d.pending_request_id && (
                  <TouchableOpacity
                    style={styles.pendingReqAcceptBtn}
                    disabled={acceptingReqId === d.pending_request_id}
                    onPress={() => acceptDocRequest(d.pending_request_id!)}
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
                    {d.doc_type}-{(d.doc_number ?? '').replace(/^(PO|AX)-/, '')}
                  </Text>
                </View>
              </View>
              {/* ด้านบนเหลือ บริษัท/เลขที่ + ชื่อซัพพลายเออร์ + ยอดเงิน/ป้ายประเภท — วันที่ ผู้สั่ง หน้างาน ธนาคาร
                  อยู่ในกล่อง "รายละเอียดเพิ่มเติม" ด้านล่างที่เดียว (เดิมโชว์ซ้ำสองที่) */}
              <Text style={styles.supplierNameSummary} numberOfLines={2}>{d.supplier_name || '-'}</Text>

              <View style={styles.amountRow}>
                <Text style={styles.amountValue}>{num(d.amount)} ฿</Text>
                <TouchableOpacity
                  style={[styles.extraLabelRow, isTaxDoc && styles.extraLabelRowTax]}
                  onPress={() => setStatusNoteModal({ visible: true, doc: d, text: d.tax_status_note ?? '', saving: false })}
                >
                  <FontAwesome5 name="file-invoice" size={isTaxDoc ? 10 : 9} color={isTaxDoc ? '#b45309' : '#94a3b8'} />
                  <Text style={[styles.extraLabelText, isTaxDoc && styles.extraLabelTextTax]} numberOfLines={1}>
                    {extraLabel}
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
                    ['document-text', 'เอกสาร', `${d.doc_type} ${(d.doc_number ?? '').replace(/^(PO|AX)-/, '')}`],
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
                    <Ionicons name="storefront" size={11} color="#475569" />
                    <Text style={styles.miTileLabel}>ซัพพลายเออร์ / บัญชีปลายทาง</Text>
                  </View>
                  <Text style={styles.miSupplier}>{d.supplier_name || '-'}</Text>
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

                <View style={styles.miBlock}>
                  <Text style={styles.miTileLabel}>รายละเอียดงาน</Text>
                  <Text style={styles.miDesc}>{d.description?.trim() || '-'}</Text>
                </View>

                {!!d.wht_tax && d.wht_tax !== 'ไม่มี' && (
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

            {!isCancelled && (
              <>
                <View style={styles.section}>
                  {renderSectionTitle('git-commit-outline', 'สถานะเอกสาร')}
                  {renderStatusBoxes(d)}
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
                          onPress={() => setFinanceModal({ visible: true, doc: d, slip: [], full: [] })}
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
                          onPress={() => setFinanceModal({ visible: true, doc: d, slip: [], full: [] })}
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
                  {!isTaxDoc ? (
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
                                  // แนบไฟล์ใบกำกับที่แผนกอื่นบันทึกไว้แล้วให้อัตโนมัติ — เอกสารใบกำกับใบเดียวกัน
                                  // ไม่ควรให้ผู้ใช้ต้องแนบไฟล์ซ้ำทีละแผนก (ผู้ใช้สามารถกดเอาออก/เพิ่มไฟล์ใหม่ทับได้ในโมดัล)
                                  const siblingKeys = (['warehouse', 'purchase', 'accounting'] as DeptKey[]).filter((k) => k !== key);
                                  const seen = new Set<string>();
                                  siblingKeys.forEach((k) => deptFields(d, k).files.forEach((f) => seen.add(f)));
                                  setDeptModal({ visible: true, doc: d, dept: key, invNo: '', note: '', files: [], reuseFiles: Array.from(seen) });
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
                              {perms.can_cancel_step_receive && (
                                // โทนเทากลางแทนแดง — มี Alert ยืนยันก่อนลบอยู่แล้ว (askCancelStepReceive) ไม่ต้องตะโกนด้วยสี
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
                      </View>
                      <ActionPill
                        icon="arrow-undo"
                        label="ดู/ยกเลิก"
                        bg="#64748b"
                        onPress={() => (perms.can_return_document ? setReturnTaxModal({ visible: true, doc: d, text: d.return_tax_remark ?? '' }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ตีกลับใบกำกับภาษี'))}
                      />
                    </View>
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
                          icon={d.credit_term ? 'create' : 'add'}
                          label={d.credit_term ? 'แก้ไข' : 'ระบุ'}
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
                      </View>
                      <ActionPill
                        icon="arrow-undo"
                        label="ดู/ยกเลิก"
                        bg="#64748b"
                        onPress={() => (perms.can_return_document ? setReturnModal({ visible: true, doc: d, text: d.return_remark ?? '' }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ตีกลับเอกสาร'))}
                      />
                    </View>
                  )}
                  <View style={styles.actionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actionRowLabel}>คืนเงินจากซัพพลายเออร์</Text>
                      {truthy(d.is_refunded) && (
                        <Text style={[styles.actionRowSub, { color: '#059669' }]}>คืนแล้ว {formatShortThaiDateTime(d.refund_at)}</Text>
                      )}
                    </View>
                    <ActionPill
                      icon={truthy(d.is_refunded) ? 'checkmark-circle' : 'refresh'}
                      label={truthy(d.is_refunded) ? 'คืนแล้ว' : 'คืนเงิน'}
                      bg={truthy(d.is_refunded) ? '#059669' : '#f59e0b'}
                      onPress={() => (perms.can_save_refund ? setRefundModal({ visible: true, doc: d, date: d.refund_at ?? '', note: d.refund_note ?? '', files: [] }) : Alert.alert('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์บันทึกการคืนเงิน'))}
                    />
                  </View>

                  <View style={styles.actionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actionRowLabel}>หมายเหตุ</Text>
                      {!!d.doc_note && (
                        <Text style={styles.actionRowSub} numberOfLines={2}>
                          {d.doc_note}
                        </Text>
                      )}
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
                    {perms.can_edit_document && (
                      <TouchableOpacity style={styles.labeledBtn} onPress={() => setSubmitScreen({ visible: true, docId: String(docId(d)) })}>
                        <Ionicons name="create-outline" size={14} color="#475569" />
                        <Text style={styles.labeledBtnText}>แก้ไขเอกสาร</Text>
                      </TouchableOpacity>
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
        </SafeAreaView>
      </Modal>
    );
  }

  if (submitScreen.visible) {
    return (
      <SubmitDocumentScreen
        docId={submitScreen.docId}
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
      {renderTopBar()}
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

      {/* หน้ารายละเอียดเอกสาร — วางก่อนโมดัล action ทุกตัว ให้โมดัลอนุมัติ/ลงรับ/ฯลฯ ที่เปิดจากในนี้ซ้อนอยู่ด้านบน */}
      {renderDetailModal()}
      {renderSlipRemindModal('root')}
      {renderFilterSheet()}

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
        <DateField value={refundModal.date} onChange={(v) => setRefundModal((s) => ({ ...s, date: v }))} placeholder="เลือกวันที่คืนเงิน" />
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

      {/* Modal: ดูรายละเอียดที่แผนกรับใบกำกับไว้ — โชว์ไฟล์แนบจริง กดดูรูปได้ (แทน Alert ข้อความล้วนเดิม) */}
      <ModalShell
        visible={deptDetailModal.visible}
        title={deptDetailModal.dept ? `📂 ${DEPT_META[deptDetailModal.dept].label}รับใบกำกับแล้ว` : ''}
        color={deptDetailModal.dept ? DEPT_META[deptDetailModal.dept].color : '#4f46e5'}
        onClose={() => setDeptDetailModal({ visible: false })}
      >
        {deptDetailModal.doc && deptDetailModal.dept && (() => {
          const { receiver, receivedAt, invNos, files, note } = deptFields(deptDetailModal.doc, deptDetailModal.dept);
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
              {invNos.length > 0 && (
                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>เลขที่ใบกำกับ</Text>
                  <Text style={styles.infoLineValue}>{invNos.join(', ')}</Text>
                </View>
              )}
              {!!note && (
                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>หมายเหตุ</Text>
                  <Text style={styles.infoLineValue}>{note}</Text>
                </View>
              )}
              <FieldLabel text={`ไฟล์แนบ (${files.length})`} />
              {files.length === 0 ? (
                <Text style={styles.deptNaText}>ไม่มีไฟล์แนบ</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {files.map((f, i) => (
                    <TouchableOpacity key={i} style={styles.fileLinkBtn} onPress={() => viewAttachedFile(f, rootUploadUrl(f))}>
                      <Ionicons name="image-outline" size={15} color="#4f46e5" />
                      <Text style={styles.fileLinkText}>ไฟล์ {i + 1}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          );
        })()}
      </ModalShell>

      {/* Modal: รับใบกำกับภาษี (ใช้ร่วมกัน 3 แผนก) */}
      <ModalShell
        visible={deptModal.visible}
        title={deptModal.dept ? `📂 ${DEPT_META[deptModal.dept].label}รับใบกำกับภาษี` : ''}
        color={deptModal.dept ? DEPT_META[deptModal.dept].color : '#4f46e5'}
        onClose={() => setDeptModal({ visible: false, invNo: '', note: '', files: [], reuseFiles: [] })}
      >
        <FieldLabel text="เลขที่ใบกำกับภาษี (คั่นด้วย , ถ้ามีหลายเลข)" required />
        <TextInput style={styles.input} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={deptModal.invNo} onChangeText={(v) => setDeptModal((s) => ({ ...s, invNo: v }))} />
        {deptModal.doc && deptModal.dept
          ? (() => {
              const currentDept = deptModal.dept;
              const siblingKeys = (Object.keys(DEPT_META) as DeptKey[]).filter((k) => k !== currentDept);
              const seen = new Set<string>();
              const siblingFiles: { name: string; deptLabel: string }[] = [];
              siblingKeys.forEach((k) => {
                deptFields(deptModal.doc!, k).files.forEach((f) => {
                  if (!seen.has(f)) {
                    seen.add(f);
                    siblingFiles.push({ name: f, deptLabel: DEPT_META[k].label });
                  }
                });
              });
              if (siblingFiles.length === 0) return null;
              return (
                <>
                  <FieldLabel text="ใช้ไฟล์ที่แผนกอื่นแนบไว้แล้ว (ไม่ต้องแนบซ้ำ)" />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {siblingFiles.map(({ name, deptLabel }) => {
                      const active = deptModal.reuseFiles.includes(name);
                      return (
                        <TouchableOpacity
                          key={name}
                          style={[styles.fileLinkBtn, active && { backgroundColor: '#4f46e5', borderColor: '#4f46e5' }]}
                          onPress={() =>
                            setDeptModal((s) => ({
                              ...s,
                              reuseFiles: active ? s.reuseFiles.filter((n) => n !== name) : [...s.reuseFiles, name],
                            }))
                          }
                        >
                          <Ionicons name={active ? 'checkmark-circle' : 'image-outline'} size={15} color={active ? '#ffffff' : '#4f46e5'} />
                          <Text style={[styles.fileLinkText, active && { color: '#ffffff' }]}>ไฟล์จาก{deptLabel}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              );
            })()
          : null}
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
      <ModalShell visible={billPayModal.visible} title="📄 ข้อมูลบิล & การจ่ายเงิน" color="#4f46e5" onClose={() => setBillPayModal({ visible: false, taxInvoiceNo: '', billingDocNo: '', billingDate: '', paymentDueDate: '', paymentStatus: '' })}>
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
            {PAYMENT_STATUS_OPTIONS.find((o) => o.value === billPayModal.paymentStatus)?.label ?? '-- ยังไม่ระบุ --'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={billPayModal.paymentStatus ? '#fff' : '#64748b'} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#4f46e5', opacity: billPayModal.saving ? 0.6 : 1 }]} onPress={confirmBillPay} disabled={billPayModal.saving}>
          <Text style={styles.modalSaveBtnText}>{billPayModal.saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</Text>
        </TouchableOpacity>
      </ModalShell>

      {/* ป๊อปอัพเลือกสถานะการจ่ายเงินแบบตาราง — พอร์ตจาก <select id="bp_status"> ใน DocumentDashboard.php:4293-4299 */}
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
            {PAYMENT_STATUS_OPTIONS.map((o) => {
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

      {/* Modal: ดูรูปที่แนบไว้เต็มจอ (สลิป/พิสูจน์) — เปิดในแอปตรงๆ แทน Linking.openURL ที่พังง่าย */}
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

      {/* Modal: ประวัติ (get_history จริง) */}
      <ModalShell visible={historyModal.visible} title="ประวัติการเปลี่ยนแปลง" color="#334155" onClose={() => setHistoryModal({ visible: false, logs: [], loading: false })}>
        {historyModal.loading ? (
          <ActivityIndicator color="#334155" />
        ) : historyModal.logs.length === 0 ? (
          <Text style={styles.hintText}>ยังไม่มีประวัติการเปลี่ยนแปลง</Text>
        ) : (
          <View>
            {historyModal.logs.map((log) => (
              <HistoryLine key={log.id} when={formatShortThaiDateTime(log.action_at)} who={log.action_by} what={log.action_label} danger={log.action_type === 'cancel'} />
            ))}
          </View>
        )}
      </ModalShell>
    </SafeAreaView>
  );
}

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

  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

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

  detailHeaderBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
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
  historyDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#4f46e5', marginTop: 4 },
  historyWhat: { fontSize: 12.5, fontWeight: '700', color: '#1e293b' },
  historyMeta: { fontSize: 10.5, color: '#94a3b8', marginTop: 2 },
});
