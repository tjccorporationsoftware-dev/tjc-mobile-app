import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
// ปรับ path เหล่านี้ให้ตรงกับตำแหน่งไฟล์จริงในโปรเจกต์ ถ้าไม่ได้วางไว้โฟลเดอร์เดียวกัน
import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { useAuth } from '../_layout';
// ✅ Config
import { API_MODULES } from '../../constants/config';
// 🌟 ปุ่มเลือกวันที่ + รูปแบบวันที่/เวลาสั้น "d/m/yy" มาตรฐานเดียวกันทั้งแอป
import { DateField, formatShortThaiDate, formatShortThaiDateTime } from '../../components/DateTimeField';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';

import ProjectAccountingScreen from './projectaccounting';
import ProjectFollowupScreen from './projectfollowup';

/**
 * แดชบอร์ดบัญชีลูกหนี้ (mobile) — เชื่อม accounting_API_mobile.php ตัวจริง
 * ตามสเปกใน mobile_api/docs/README_accounting.md
 *
 * action ที่ใช้จริง: get_dashboard (การ์ด KPI รวม + แยกบริษัท), get_list (รายการ),
 * get_detail (popup "ดูข้อมูล" — ดึงตอนเปิดเท่านั้น ไม่ฝังมากับ get_list), save_debt_owner
 *
 * ตัด "ทำเครื่องหมายจ่ายแล้ว" (mark_paid) ออก — ไม่มี action นี้ใน accounting_API_mobile.php
 * (สถานะ "ชำระเรียบร้อย" เป็นผลคำนวณอัตโนมัติจากยอดจ่าย ไม่ใช่ปุ่มกดบันทึกเอง)
 *
 * ปุ่ม Export (handleExportCsv) ทำเป็น CSV ตารางเดียวฝั่ง client ล้วน จากแถวที่กรองอยู่ในแอปตอนนี้
 * (ไม่มี action export ฝั่งเซิร์ฟเวอร์เช่นกัน — เทียบเท่าเจตนาของปุ่ม "Export ตามตัวกรอง" บนเว็บ แต่
 * ตัดรูปแบบไฟล์ Excel หลายชีท/สรุปแยกกลุ่ม/จัดสีของเว็บออก เพราะหนักเกินไปสำหรับมือถือ)
 *
 * ปุ่ม "ติดตาม"/"ลงบัญชี" ยังอยู่ครบเพราะพาไปหน้าจอจริงอื่น (ProjectFollowupScreen / ProjectAccountingScreen)
 */

const ACCOUNTING_API_URL = `${API_MODULES}/accounting_API_mobile.php`;

type FollowState = 'not_started' | 'following' | 'closed';
type PayState = 'none' | 'paid';

// ตรงกับ kpi_all ของ get_dashboard (README_accounting.md ข้อ 4.2)
type Summary = {
  initialBudget: number;
  debtorsDue: number;
  outstanding: number;
  jobsWithPayment: number;
  totalReceived: number;
  netReceived: number;
  receivedToday: number;
  wipJobs: number;
  wipAmount: number;
};

const EMPTY_SUMMARY: Summary = {
  initialBudget: 0, debtorsDue: 0, outstanding: 0, jobsWithPayment: 0,
  totalReceived: 0, netReceived: 0, receivedToday: 0, wipJobs: 0, wipAmount: 0,
};

function mapSummary(k: any): Summary {
  return {
    initialBudget: Number(k?.total_budget ?? 0),
    debtorsDue: Number(k?.debtor_customers_count ?? 0),
    outstanding: Number(k?.total_outstanding ?? 0),
    jobsWithPayment: Number(k?.projects_with_income ?? 0),
    totalReceived: Number(k?.total_received ?? 0),
    netReceived: Number(k?.total_net ?? 0),
    receivedToday: Number(k?.today_received ?? 0),
    wipJobs: Number(k?.wip_projects ?? 0),
    wipAmount: Number(k?.wip_budget ?? 0),
  };
}

// 🌟 [เพิ่มใหม่] ประเภทการค้ำประกัน — ใช้กำหนดว่า modal "ดูข้อมูล" จะโชว์ฟิลด์ไหนบ้าง
type GuaranteeType = 'ไม่มี' | 'หนังสือค้ำ' | 'เงินสด' | 'ค้ำแบบจนกว่าจะหมดภาระผูกพันธ์' | 'บริษัทค้ำประกัน';

// ตรงกับ detail{} ของ get_detail (README_accounting.md ข้อ 4.4) — ดึงตอนเปิด modal เท่านั้น
// (ไม่ได้ฝังมากับแถวของ get_list เพราะจะกลายเป็นยิง API ต่อแถวตอนโหลดลิสต์)
type ProjectDetail = {
  contractNo: string;
  contractFile?: string;
  startDate: string;
  endDate: string;
  countdownText: string;
  countdownTone: 'green' | 'amber' | 'red' | 'gray';
  contractFinished: boolean;
  customerAffiliation: string;
  contactPerson: string;
  contactPhone: string; // คั่นด้วย , เช่น "โทร: 08x-xxx-1234, LINE: @sample"
  customerAddress: string;
  guaranteeType: GuaranteeType;
  bankName: string;
  guaranteeNo: string;
  guaranteeAmount: number;
  guaranteePercent: number;
  guaranteeStart: string;
  guaranteeEnd: string;
  warranty: string;
};

function guaranteeTone(daysLeft: number | null, isFinished: boolean): 'green' | 'amber' | 'red' | 'gray' {
  if (isFinished) return 'gray';
  if (daysLeft === null) return 'amber';
  if (daysLeft < 0) return 'red';
  if (daysLeft <= 30) return 'amber';
  return 'green';
}

// วันที่ในป็อปอัพ "รายละเอียดข้อมูลโครงการ" แสดงแบบเว็บ: DD/MM/YYYY (ปี ค.ศ.)
function fmtDateCE(s?: string | null): string {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || m[1] === '0000') return '-';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function mapProjectDetail(d: any): ProjectDetail {
  return {
    contractNo: String(d?.contract_no || d?.purchase_order_no || '-'),
    contractFile: d?.contract_file || undefined,
    // ใช้ start_date/end_date ดิบมาฟอร์แมตเป็น "d/m/yy" เอง แทน start_date_thai/end_date_thai
    // ที่เซิร์ฟเวอร์ส่งมาเป็นชื่อเดือนเต็ม ("30 กรกฎาคม 2569") ให้ตรงรูปแบบสั้นทั้งแอป
    startDate: fmtDateCE(d?.start_date),
    endDate: fmtDateCE(d?.end_date),
    countdownText: String(d?.contract_countdown || '-'),
    contractFinished: Boolean(d?.contract_is_finished),
    countdownTone: guaranteeTone(d?.contract_days_left ?? null, Boolean(d?.contract_is_finished)),
    customerAffiliation: String(d?.customer_affiliation || d?.customer_name || '-'),
    contactPerson: String(d?.contact_person || '-'),
    contactPhone: String(d?.contact_phone || ''),
    customerAddress: String(d?.customer_address || '-'),
    guaranteeType: (d?.guarantee_type || 'ไม่มี') as GuaranteeType,
    bankName: String(d?.bank_name || '-'),
    guaranteeNo: String(d?.guarantee_no || '-'),
    guaranteeAmount: Number(d?.guarantee_amount ?? 0),
    guaranteePercent: Number(d?.guarantee_percent ?? 0),
    guaranteeStart: fmtDateCE(d?.guarantee_start_date),
    guaranteeEnd: fmtDateCE(d?.guarantee_end_date),
    warranty: String(d?.warranty || '-'),
  };
}

// ตรงกับ 1 แถวของ get_payment_items.items[] — "งวดชำระเงิน" ตารางย่อยที่กางใต้แถวหลักบนเว็บ
type PaymentItem = {
  id: number;
  name: string;
  amount: number;
  netAmount: number;
  receiptDate: string;
  receiptNo: string;
  callStatus: string;
  createdBy: string;
  createdAtThai: string;
};

function mapPaymentItem(r: any): PaymentItem {
  return {
    id: Number(r.id ?? 0),
    name: String(r.payment_name ?? ''),
    amount: Number(r.payment_amount ?? 0),
    netAmount: Number(r.net_amount ?? 0),
    receiptDate: r.payment_received_date ? formatShortThaiDate(r.payment_received_date) : '-',
    receiptNo: String(r.receipt_no ?? ''),
    callStatus: String(r.call_status ?? ''),
    createdBy: String(r.created_by ?? ''),
    createdAtThai: r.created_at ? formatShortThaiDateTime(r.created_at) : String(r.created_at_thai ?? ''),
  };
}

// ตรงกับ 1 แถวของ get_payment_items.follows[] — "ประวัติการติดตาม" ตารางย่อยชุดที่ 2
type FollowItem = {
  id: number;
  name: string;
  callStatus: string;
  bankName: string;
  remark: string;
  createdBy: string;
  createdAtThai: string;
};

function mapFollowItem(r: any): FollowItem {
  return {
    id: Number(r.id ?? 0),
    name: String(r.followup_name ?? ''),
    callStatus: String(r.call_status ?? ''),
    bankName: String(r.bank_name ?? ''),
    remark: String(r.remark ?? ''),
    createdBy: String(r.created_by ?? ''),
    createdAtThai: r.created_at ? formatShortThaiDateTime(r.created_at) : String(r.created_at_thai ?? ''),
  };
}

// ตรงกับ 1 แถวของ get_list (README_accounting.md ข้อ 4.3) — ชื่อ field ในแอปคงไว้แบบเดิม
// เพื่อไม่ต้องแตะ UI ทั้งหมด แต่ mapProject() ด้านล่างอ่านจากคีย์ snake_case จริง
type Project = {
  id: string | number;
  jobNo: string;
  company: string;
  customer: string;
  projectName: string;
  owner: string; // debt_name — ผู้รับผิดชอบติดตามหนี้
  closedBy: string;
  closedAt?: string;
  initialBudget: number;
  paidAmount: number;
  outstanding: number;
  followState: FollowState;
  followDate?: string;
  payState: PayState;
  payDate?: string;
  note?: string;
  // ค่าดิบสำหรับตัวกรองสถานะแบบเว็บ (กติกาเดียวกับ get_list ?state=)
  followStatusRaw: string; // latest_follow_status_raw
  payStatusRaw: string; // latest_pay_status_raw
  paymentStateRaw: string; // payment_state: paid_full / paid_partial / unpaid
  hasToday: boolean; // มีเงินเข้าวันนี้
};

function mapProject(raw: any): Project {
  const followClosed = Number(raw.follow_closed ?? 0) === 1;
  const followState: FollowState = followClosed
    ? 'closed'
    : String(raw.latest_follow_status_raw || '').trim() !== ''
      ? 'following'
      : 'not_started';
  return {
    id: raw.project_id ?? raw.id,
    jobNo: String(raw.display_code ?? ''),
    company: String(raw.company_name ?? ''),
    customer: String(raw.customer_name ?? ''),
    projectName: String(raw.project_name ?? ''),
    owner: String(raw.debt_name || 'ยังไม่ระบุ'),
    closedBy: String(raw.closed_by || '-'),
    // ใช้ raw closed_at/latest_follow_at/latest_pay_at (YYYY-MM-DD HH:MM:SS) ฟอร์แมตเอง แทน
    // field "_thai" ของเซิร์ฟเวอร์ที่เป็นชื่อเดือนเต็ม ("4 สิงหาคม 2569 13:50 น.")
    closedAt: raw.closed_at ? formatShortThaiDateTime(raw.closed_at) : undefined,
    initialBudget: Number(raw.project_budget ?? 0),
    paidAmount: Number(raw.total_received_amount ?? 0),
    outstanding: Number(raw.outstanding_amount ?? 0),
    followState,
    followDate: raw.latest_follow_at ? formatShortThaiDateTime(raw.latest_follow_at) : undefined,
    payState: raw.payment_state === 'paid_full' ? 'paid' : 'none',
    payDate: raw.latest_pay_at ? formatShortThaiDateTime(raw.latest_pay_at) : undefined,
    note: raw.display_remark && raw.display_remark !== '-' ? String(raw.display_remark) : undefined,
    followStatusRaw: String(raw.latest_follow_status_raw ?? '').trim(),
    payStatusRaw: String(raw.latest_pay_status_raw ?? '').trim(),
    paymentStateRaw: String(raw.payment_state ?? ''),
    hasToday: Number(raw.has_today ?? 0) === 1,
  };
}

type DashboardData = {
  summary: Summary;
  projects: Project[];
  companies: CompanyBreakdown[];
};

// 🌟 [เพิ่มใหม่] สรุป KPI ต่อบริษัทหนึ่งใบ (โครงสร้างเดียวกับ Summary รวม) — kpi_by_company[]
type CompanyBreakdown = {
  id: string;
  name: string;
  summary: Summary;
};

function mapCompanyBreakdown(c: any): CompanyBreakdown {
  return { id: String(c.company_id ?? ''), name: String(c.company_name ?? ''), summary: mapSummary(c) };
}

type Props = {
  onBackToMain?: () => void;
  onViewCompanyBreakdown?: () => void;
  onViewProject?: (project: Project) => void;
  onFollowProject?: (project: Project) => void;
  onRecordProject?: (project: Project) => void;
};

function num(value: number) {
  const decimals = value % 1 === 0 ? 0 : 2;
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

// สีป้ายสถานะจ่ายเงินของแต่ละงวด (call_status ของ project_payments) — เดาโทนสีจากคำที่พบบ่อย
// เพราะ backend ไม่ได้ส่งรหัสสีมาให้ตรงๆ ในชุดนี้ (ต่างจาก payment_call_statuses.status_icon)
function payStatusTone(status: string): { bg: string; color: string; border: string } {
  const s = status.trim();
  if (s.includes('รอ')) return { bg: '#fff6de', color: '#c47f04', border: '#f2cf74' };
  if (s.includes('ครบ') || s.includes('สำเร็จ') || s.includes('แล้ว')) return { bg: '#e5f8ee', color: '#0e8f60', border: '#a9e2c4' };
  if (s === '') return { bg: '#f6f8fa', color: '#93a2b3', border: '#dfe6ee' };
  return { bg: '#eef2f6', color: '#5d7085', border: '#dde5ee' };
}

/* ---------- การ์ดสรุป (โทนสีเดียวกับ accounting_dashboard.php บนเว็บ) ---------- */

// กล่องสถานะติดตาม 4 แบบ — แตะเพื่อกรอง แตะซ้ำเพื่อล้าง (จำนวนนับจากรายการของปีที่เลือก)
const FOLLOW_BOXES: {
  value: string; // ค่าเดียวกับตัวกรองสถานะ (STATE_FILTERS_FALLBACK / state_filters จาก server)
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  match: (p: Project) => boolean;
}[] = [
  { value: 'fs:', label: 'ยังไม่เคยติดตาม', icon: 'remove-circle', color: '#64748b', bg: '#f1f5f9', match: (p) => p.followState === 'not_started' },
  { value: '__following__', label: 'กำลังติดตาม', icon: 'time', color: '#d97706', bg: '#fef3c7', match: (p) => p.followState === 'following' },
  { value: 'fs:__closed__', label: 'ปิดติดตามแล้ว', icon: 'checkmark-circle', color: '#059669', bg: '#d1fae5', match: (p) => p.followState === 'closed' },
  { value: 'paid_full', label: 'จ่ายเงินครบแล้ว', icon: 'wallet', color: '#059669', bg: '#d1fae5', match: (p) => p.payState === 'paid' },
];

// การ์ดตัวเลข 7 ใบ — สีขอบซ้าย/ตัวเลขตรงกับเว็บ (ฟ้า/ส้ม/แดง/ฟ้าอมเขียว/เขียว/เขียวหัวเป็ด/ม่วง)
// สีตามกติกาทั้งแอป: เขียว = เสร็จ/เงินเข้า, ส้ม = รอ/ค้าง, แดง = คงค้าง/มีปัญหา, เทา = ข้อมูลทั่วไป
const SUMMARY_TILES: { key: keyof Summary; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; unit?: string }[] = [
  { key: 'initialBudget', label: 'ทุนตั้งต้น (งบรวม)', icon: 'card', color: '#64748b' },
  { key: 'debtorsDue', label: 'ลูกหนี้ค้างชำระ', icon: 'people', color: '#d97706', unit: 'เจ้า' },
  { key: 'outstanding', label: 'ลูกหนี้คงค้าง', icon: 'alert-circle', color: '#dc2626' },
  { key: 'jobsWithPayment', label: 'หน้างานที่เงินเข้าแล้ว', icon: 'document-text', color: '#64748b', unit: 'งาน' },
  { key: 'totalReceived', label: 'เงินเข้าทั้งหมด (ยอดจ่าย)', icon: 'cash', color: '#059669' },
  { key: 'netReceived', label: 'ยอดรับสุทธิ', icon: 'layers', color: '#059669' },
  { key: 'receivedToday', label: 'เงินเข้าวันนี้', icon: 'calendar', color: '#059669' },
];

/* ---------- ป้ายสถานะ ---------- */

function FollowChip({ state }: { state: FollowState }) {
  const config = {
    not_started: { label: 'ยังไม่เคยติดตาม', color: '#93a2b3', bg: '#f6f8fa', border: '#dfe6ee', icon: 'remove-outline' as const },
    following: { label: 'กำลังติดตาม', color: '#c47f04', bg: '#fff6de', border: '#f2cf74', icon: 'time-outline' as const },
    closed: { label: 'ปิดติดตามแล้ว', color: '#0e8f60', bg: '#e5f8ee', border: '#a9e2c4', icon: 'checkmark-circle-outline' as const },
  }[state];

  return (
    <View style={[styles.chip, { backgroundColor: config.bg, borderColor: config.border }]}>
      <Ionicons name={config.icon} size={14} color={config.color} />
      <Text style={[styles.chipText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

function PayChip({ state }: { state: PayState }) {
  const config = state === 'paid'
    ? { label: 'จ่ายเงินครบแล้ว (ปิดยอด)', color: '#0e8f60', bg: '#e5f8ee', border: '#a9e2c4', icon: 'checkmark-circle' as const }
    : { label: 'ยังไม่มีสถานะจ่ายเงิน', color: '#93a2b3', bg: '#f6f8fa', border: '#dfe6ee', icon: 'remove-outline' as const };

  return (
    <View style={[styles.chip, { backgroundColor: config.bg, borderColor: config.border }]}>
      <Ionicons name={config.icon} size={14} color={config.color} />
      <Text style={[styles.chipText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

function DateHint({ date }: { date?: string }) {
  if (date) return <Text style={styles.dateHint}>{date}</Text>;
  return (
    <View style={styles.noDate}>
      <Ionicons name="help-circle" size={13} color="#e79a2b" />
      <Text style={styles.noDateText}>ไม่มีวันที่</Text>
    </View>
  );
}

// สถานะติดตาม + สถานะจ่ายเงิน (ปุ่มกดดูประวัติติดตาม / งวดชำระ) — ใช้ทั้งการ์ดในลิสต์และหน้ารายละเอียด
function StatusPair({ item, onViewFollowHistory, onViewPaymentTerms, style }: { item: Project; onViewFollowHistory: () => void; onViewPaymentTerms: () => void; style?: object }) {
  return (
    <View style={[styles.statusRow, style]}>
      <Pressable onPress={onViewFollowHistory} style={({ pressed }) => [styles.statusCol, pressed && styles.pressed]}>
        <Text style={styles.microLabel}>สถานะติดตาม</Text>
        <FollowChip state={item.followState} />
        {item.followState === 'closed'
          ? <Text style={styles.flagText}>⚑ เก็บเงินครบแล้ว</Text>
          : <DateHint date={item.followDate} />}
      </Pressable>
      <Pressable onPress={onViewPaymentTerms} style={({ pressed }) => [styles.statusCol, pressed && styles.pressed]}>
        <Text style={styles.microLabel}>สถานะจ่ายเงิน</Text>
        <PayChip state={item.payState} />
        <DateHint date={item.payDate} />
      </Pressable>
    </View>
  );
}

/* ---------- การ์ดรายโครงการ ---------- */

// การ์ดในลิสต์ — สรุป: เลขหน้างาน/สถานะติดตาม, ชื่อโครงการ, บริษัท/ลูกค้า, ค้างชำระ + ปุ่มลัด ติดตาม/ลงบัญชี
// (แบบการ์ดหน้าเอกสาร PO/AX) แตะการ์ดเพื่อเปิดหน้ารายละเอียดเต็มจอ
function ProjectCard({
  item,
  busy,
  onOpen,
  onFollow,
  onRecord,
  onViewFollowHistory,
  onViewPaymentTerms,
}: {
  item: Project;
  busy: boolean;
  onOpen: () => void;
  onFollow: () => void;
  onRecord: () => void;
  onViewFollowHistory: () => void;
  onViewPaymentTerms: () => void;
}) {
  return (
    <View style={styles.card}>
      {/* โซนข้อมูล — แตะเพื่อเปิดหน้ารายละเอียด */}
      <Pressable onPress={onOpen} style={({ pressed }) => pressed && styles.pressed}>
      <View style={styles.cardTopRow}>
        <View style={styles.jobBadge}>
          <Text style={styles.jobBadgeText}>{item.jobNo}</Text>
        </View>
        <Text style={styles.cardCompanyTag} numberOfLines={1}>{item.company}</Text>
      </View>

      <Text style={styles.cardProjectName} numberOfLines={2}>{item.projectName}</Text>
      <Text style={styles.cardSub} numberOfLines={1}>{item.customer}</Text>

      <View style={styles.cardSummaryBottomRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.microLabel}>ค้างชำระ</Text>
          <Text style={[styles.cardOutstanding, item.outstanding > 0 ? styles.moneyDanger : styles.moneyPositive]}>{num(item.outstanding)} ฿</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
      </View>
      </Pressable>

      {/* โซนปุ่ม — ปุ่มครบเหมือนเดิม (สถานะติดตาม / สถานะจ่ายเงิน / ติดตาม / ลงบัญชี) แยกพื้นที่แตะจากโซนข้อมูล
          ปุ่มสถานะย่อเหลือแถวเดียว (วันที่ดูต่อได้ในหน้ารายละเอียด/ป็อปอัพประวัติ) */}
      <View style={styles.cardActionZone}>
        <View style={styles.statusCompactRow}>
          <Pressable onPress={onViewFollowHistory} style={({ pressed }) => [styles.statusCompactCol, pressed && styles.pressed]} accessibilityLabel="ดูประวัติการติดตาม">
            <FollowChip state={item.followState} />
          </Pressable>
          <Pressable onPress={onViewPaymentTerms} style={({ pressed }) => [styles.statusCompactCol, pressed && styles.pressed]} accessibilityLabel="ดูงวดชำระเงิน">
            <PayChip state={item.payState} />
          </Pressable>
        </View>
        <QuickActions busy={busy} onFollow={onFollow} onRecord={onRecord} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

// ปุ่มลัด ติดตาม / ลงบัญชี — 2 ช่องกว้างเท่ากันในแถวเดียว ใช้ทั้งในการ์ดและหน้ารายละเอียด
function QuickActions({ busy, onFollow, onRecord, style }: { busy: boolean; onFollow: () => void; onRecord: () => void; style?: object }) {
  return (
    <View style={[styles.quickActionRow, style]}>
      <Pressable onPress={onFollow} disabled={busy} style={({ pressed }) => [styles.quickActionBtn, pressed && styles.pressed, busy && styles.disabled]}>
        <Ionicons name="headset" size={16} color="#4f46e5" />
        <Text style={styles.quickActionBtnText}>ติดตาม</Text>
      </Pressable>
      <Pressable onPress={onRecord} disabled={busy} style={({ pressed }) => [styles.quickActionBtn, pressed && styles.pressed, busy && styles.disabled]}>
        {busy ? <ActivityIndicator size="small" color="#4f46e5" /> : <Ionicons name="create" size={16} color="#4f46e5" />}
        <Text style={styles.quickActionBtnText}>ลงบัญชี</Text>
      </Pressable>
    </View>
  );
}

// เนื้อหาหน้ารายละเอียด — หัวสรุป + ยอดเงิน + สถานะติดตาม/จ่ายเงิน + หมายเหตุ + ข้อมูลสัญญา/ลูกค้า/ค้ำประกัน
// (ย้ายมาจากการ์ดเดิมที่กาง "ดูข้อมูล" แทรกในการ์ด) การกดสถานะ/หมายเหตุยังเปิดประวัติเหมือนเดิม
function ProjectDetailBody({
  item,
  busy,
  onFollow,
  onRecord,
  onOwnerPress,
  expandedLoading,
  expandedDetail,
  onViewFollowHistory,
  onViewPaymentTerms,
  onViewBoth,
}: {
  item: Project;
  busy: boolean;
  onFollow: () => void;
  onRecord: () => void;
  onOwnerPress: () => void;
  expandedLoading: boolean;
  expandedDetail?: ProjectDetail;
  onViewFollowHistory: () => void;
  onViewPaymentTerms: () => void;
  onViewBoth: () => void;
}) {
  return (
    <View style={styles.detailCard}>
      <View style={styles.cardHead}>
        <View>
          <Text style={styles.jobLabel}>เลขหน้างาน</Text>
          <Text style={styles.jobNo}>{item.jobNo}</Text>
        </View>
        <View style={styles.cardHeadRight}>
          <Text style={styles.company}>{item.company}</Text>
          <Text style={styles.customer}>ลูกค้า: {item.customer}</Text>
        </View>
      </View>

      <Text style={styles.projectName}>{item.projectName}</Text>

      <View style={styles.peopleRow}>
        <Pressable onPress={onOwnerPress} style={({ pressed }) => [styles.ownerChip, pressed && styles.pressed]}>
          <Ionicons name="person" size={12} color="#4f46e5" />
          <Text style={styles.ownerText} numberOfLines={1}>{item.owner}</Text>
          <Ionicons name="chevron-down" size={11} color="#4f46e5" />
        </Pressable>
        <View style={styles.closedBlock}>
          <Text style={styles.microLabel}>ปิดจบโดย</Text>
          <Text style={styles.closedBy}>{item.closedBy}</Text>
          <Text style={styles.closedAt}>{item.closedAt ?? 'ยังไม่ปิดจบ'}</Text>
        </View>
      </View>

      <View style={styles.moneyGrid}>
        <View style={styles.moneyCell}>
          <Text style={styles.microLabel}>งบตั้งต้น</Text>
          <Text style={styles.moneyValue}>{num(item.initialBudget)}</Text>
        </View>
        <View style={styles.moneyCell}>
          <Text style={styles.microLabel}>ยอดจ่าย</Text>
          <Text style={styles.moneyValue}>{num(item.paidAmount)}</Text>
        </View>
        <View style={styles.moneyCell}>
          <Text style={styles.microLabel}>ค้างชำระ</Text>
          <Text style={[styles.moneyValue, item.outstanding > 0 && styles.moneyDanger]}>{num(item.outstanding)}</Text>
        </View>
      </View>

      <StatusPair item={item} onViewFollowHistory={onViewFollowHistory} onViewPaymentTerms={onViewPaymentTerms} />

      {item.note ? (
        <Pressable onPress={onViewBoth} style={({ pressed }) => [styles.note, pressed && styles.pressed]}>
          <Text style={styles.noteLabel}>หมายเหตุ</Text>
          <Text style={styles.noteText}>{item.note}</Text>
        </Pressable>
      ) : null}

      <QuickActions busy={busy} onFollow={onFollow} onRecord={onRecord} style={{ marginTop: 12 }} />

      {/* ข้อมูลสัญญา/ลูกค้า/ค้ำประกัน (get_detail) — โหลดตอนเปิดหน้ารายละเอียด */}
      <View style={styles.inlineDetailBox}>
          {expandedLoading ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator color="#4f46e5" />
            </View>
          ) : (
            (() => {
              const d = expandedDetail;
              const countdownColor = d
                ? d.countdownTone === 'green' ? '#0e8f60'
                : d.countdownTone === 'amber' ? '#c47f04'
                : d.countdownTone === 'red' ? '#e8443f'
                : '#93a2b3'
                : '#93a2b3';
              const showGuarantee = !!d && d.guaranteeType !== 'ไม่มี';
              const isCash = d?.guaranteeType === 'เงินสด';

              // ช่องทางติดต่อ: contact_phone คั่นด้วย , -> chip ทีละช่องทาง (แบบเว็บ)
              const channels = (d?.contactPhone ?? '').split(',').map((c) => c.trim()).filter(Boolean);

              return (
                <>
                  {/* ธีมเดียวกับป็อปอัพ "รายละเอียดข้อมูลโครงการ" บนเว็บ — การ์ดขาวขอบซ้ายฟ้า หัวข้อมีไอคอน แถวมีไอคอนนำ */}
                  <View style={styles.infoCard}>
                    <InfoCardHead icon="clipboard" title="ข้อมูลโครงการและสัญญา" />
                    <InfoRow icon="create" label="ชื่องบ / โครงการ" value={item.projectName} />
                    <InfoRow icon="document-text" label="เลขที่สัญญา" value={d?.contractNo ?? '-'} />
                    <InfoRow icon="cash" label="มูลค่าโครงการ" value={num(item.initialBudget)} valueColor="#059669" />
                    <InfoRow icon="calendar" label="วันที่เริ่มสัญญา" value={d?.startDate ?? '-'} />
                    <InfoRow icon="calendar-clear" label="สิ้นสุดสัญญา" value={d?.endDate ?? '-'} />
                    <InfoRow
                      icon="hourglass"
                      iconColor="#f59e0b"
                      label="ครบกำหนดส่ง"
                      value={d ? (d.contractFinished ? `✓ ${d.countdownText}` : d.countdownText) : '-'}
                      valueColor={d ? (d.contractFinished ? '#059669' : countdownColor) : undefined}
                    />
                  </View>

                  <View style={styles.infoCard}>
                    <InfoCardHead icon="business" title="ข้อมูลลูกค้า" />
                    <InfoRow icon="git-network" label="สังกัด" value={d?.customerAffiliation ?? item.customer} />
                    <InfoRow icon="person" iconColor="#15803d" label="ชื่อผู้ติดต่อ" value={d?.contactPerson && d.contactPerson !== '-' ? d.contactPerson : 'ไม่ระบุ'} />
                    <View style={styles.infoRow}>
                      <View style={styles.infoRowLabelWrap}>
                        <Ionicons name="call" size={14} color="#15803d" />
                        <Text style={styles.infoRowLabel}>ช่องทางติดต่อ</Text>
                      </View>
                      <View style={styles.infoChannelWrap}>
                        {channels.length === 0 ? (
                          <Text style={styles.infoRowValue}>-</Text>
                        ) : (
                          channels.map((ch, i) => (
                            <View key={i} style={styles.infoChannelChip}>
                              <Ionicons name="chatbubble-ellipses" size={11} color="#475569" />
                              <Text style={styles.infoChannelText}>{ch}</Text>
                            </View>
                          ))
                        )}
                      </View>
                    </View>
                    <InfoRow icon="location" label="ที่อยู่" value={d?.customerAddress ?? '-'} />
                  </View>

                  <View style={styles.infoCard}>
                    <InfoCardHead icon="shield-checkmark" title="ข้อมูลการค้ำประกัน" />
                    <InfoRow icon="document-attach" label="ประเภทการค้ำประกัน" value={d?.guaranteeType ?? 'ไม่มี'} />
                    {showGuarantee && d && (
                      <>
                        {!isCash && <InfoRow icon="business" label="ธนาคาร" value={d.bankName} />}
                        <InfoRow icon="receipt" label={isCash ? 'เลขที่บิล/ใบเสร็จ' : 'เลขที่หนังสือค้ำ'} value={d.guaranteeNo} />
                        <InfoRow
                          icon="wallet"
                          label="จำนวนเงินค้ำประกัน"
                          value={`฿${num(d.guaranteeAmount)} (${Number(d.guaranteePercent || 0).toFixed(2)}%)`}
                          valueColor="#059669"
                        />
                        <InfoRow icon="calendar" label="วันออกค้ำประกัน" value={d.guaranteeStart} />
                        <InfoRow icon="calendar-clear" label="วันสิ้นสุดค้ำประกัน" value={d.guaranteeEnd} />
                        <InfoRow icon="calculator" iconColor="#f59e0b" label="ระยะประกันสุทธิ" value={d.warranty} valueColor="#d97706" />
                      </>
                    )}
                  </View>
                </>
              );
            })()
          )}
      </View>
    </View>
  );
}

// ป็อปอัพ "งวดชำระเงิน" + "ประวัติการติดตาม" — เปิดจากกล่องหมายเหตุ/สถานะติดตามบนการ์ด
// (แยกจากแถบ "ดูข้อมูล" ซึ่งเป็นข้อมูลสัญญา/ลูกค้า/ค้ำประกันคนละชุดกัน และแสดงแบบขยายในการ์ดแทน)
// ช่องข้อมูล label/value เดี่ยว — ใช้ต่อแถวการ์ดแนวตั้งแทนตารางเลื่อนด้านข้างเดิม
function KV({ label, value, width = '48%' }: { label: string; value: ReactNode; width?: `${number}%` }) {
  return (
    <View style={[styles.kvCell, { width }]}>
      <Text style={styles.kvLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? <Text style={styles.kvValue}>{value}</Text> : value}
    </View>
  );
}

function PaymentHistoryModal({
  visible,
  projectName,
  mode,
  loading,
  items,
  follows,
  onClose,
}: {
  visible: boolean;
  projectName?: string;
  mode: 'both' | 'payment' | 'follow';
  loading: boolean;
  items: PaymentItem[];
  follows: FollowItem[];
  onClose: () => void;
}) {
  const showPayments = mode !== 'follow';
  const showFollows = mode !== 'payment';
  const title = mode === 'payment' ? 'งวดชำระเงิน' : mode === 'follow' ? 'ประวัติการติดตาม' : projectName || 'งวดชำระเงิน / ประวัติการติดตาม';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeadRow}>
            <Text style={styles.modalTitle} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#64748b" />
            </Pressable>
          </View>
          {mode === 'both' && !!projectName && <Text style={styles.modalSubTitle} numberOfLines={2}>{projectName}</Text>}

          {loading ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <ActivityIndicator color="#4f46e5" />
            </View>
          ) : (
            <ScrollView style={{ marginTop: 8, flex: 1 }} showsVerticalScrollIndicator={false}>
              {showPayments && (
                <View style={styles.subTableBox}>
                  <View style={styles.subTableHeadRow}>
                    <Ionicons name="document-text-outline" size={13} color="#4f46e5" />
                    <Text style={styles.subTableTitle}>งวดชำระเงิน</Text>
                    <View style={styles.subTableCountBadge}>
                      <Text style={styles.subTableCountText}>{items.length} งวด</Text>
                    </View>
                  </View>
                  {items.length === 0 ? (
                    <Text style={styles.subTableEmptyText}>ยังไม่มีงวดชำระเงิน</Text>
                  ) : (
                    <View style={{ marginTop: 8, gap: 10 }}>
                      {items.map((p, i) => {
                        const payTone = payStatusTone(p.callStatus);
                        return (
                          <View key={p.id} style={styles.kvCard}>
                            <View style={styles.kvCardHeadRow}>
                              <Text style={styles.kvCardHeadText}>งวดที่ {i + 1}</Text>
                              <View style={[styles.subTablePayBadge, { backgroundColor: payTone.bg, borderColor: payTone.border }]}>
                                <Text style={[styles.subTablePayBadgeText, { color: payTone.color }]}>{p.callStatus || 'ยังไม่ระบุ'}</Text>
                              </View>
                            </View>
                            <View style={styles.kvRow}>
                              <KV label="ยอดจ่าย" value={num(p.amount)} />
                              <KV label="ยอดรับสุทธิ" value={num(p.netAmount)} />
                            </View>
                            <View style={styles.kvRow}>
                              <KV label="วันที่เงินเข้า" value={p.receiptDate || '-'} />
                              <KV label="เลขที่ใบเสร็จ" value={p.receiptNo || '-'} />
                            </View>
                            <View style={styles.kvRow}>
                              <KV
                                label="ผู้บันทึก"
                                width="100%"
                                value={
                                  <>
                                    <Text style={styles.kvValue}>{p.createdBy || '-'}</Text>
                                    {!!p.createdAtThai && <Text style={styles.subTableMetaSub}>{p.createdAtThai}</Text>}
                                  </>
                                }
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {showFollows && (
                <View style={[styles.subTableBox, showPayments && { marginTop: 12 }]}>
                  <View style={styles.subTableHeadRow}>
                    <Ionicons name="headset-outline" size={13} color="#c47f04" />
                    <Text style={styles.subTableTitle}>ประวัติการติดตาม</Text>
                    <View style={[styles.subTableCountBadge, { backgroundColor: '#fff6de' }]}>
                      <Text style={[styles.subTableCountText, { color: '#c47f04' }]}>{follows.length} ครั้ง</Text>
                    </View>
                  </View>
                  {follows.length === 0 ? (
                    <Text style={styles.subTableEmptyText}>ยังไม่มีประวัติการติดตาม</Text>
                  ) : (
                    <View style={{ marginTop: 8, gap: 10 }}>
                      {follows.map((f, i) => (
                        <View key={f.id} style={styles.kvCard}>
                          <View style={styles.kvCardHeadRow}>
                            <Text style={styles.kvCardHeadText}>ครั้งที่ {i + 1}</Text>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#c47f04' }}>{f.callStatus || 'ยังไม่โทร'}</Text>
                          </View>
                          <View style={styles.kvRow}>
                            <KV label="ชื่อครั้ง" value={f.name || '-'} />
                            <KV label="บันทึกเมื่อ" value={f.createdAtThai || '-'} />
                          </View>
                          <View style={styles.kvRow}>
                            <KV label="ธนาคาร" value={f.bankName || '-'} />
                            <KV label="ผู้บันทึก" value={f.createdBy || '-'} />
                          </View>
                          <View style={styles.kvRow}>
                            <KV label="รายละเอียด" width="100%" value={f.remark || '-'} />
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          )}

          <Pressable onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={styles.modalCloseBtnText}>ปิดหน้าต่าง</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- หน้าหลัก ---------- */

// ตัวเลือก "สถานะ" แบบ dropdown ของเว็บ — ได้จาก get_master_data.state_filters (มีสถานะติดตาม/จ่ายเงินจาก master)
// ใช้ชุดนี้ระหว่างรอโหลด/ถ้าโหลดไม่ได้ group: main | follow (ครั้งล่าสุด) | pay (งวดล่าสุด)
type StateOption = { value: string; label: string; group: 'main' | 'follow' | 'pay' };
const STATE_FILTERS_FALLBACK: StateOption[] = [
  { value: 'all', label: '💳 ทุกสถานะ', group: 'main' },
  { value: 'unpaid', label: '❌ รอชำระเงิน (ยังเก็บไม่ครบ)', group: 'main' },
  { value: 'paid_full', label: '✅ จ่ายเงินครบแล้ว', group: 'main' },
  { value: 'has_today', label: '🔥 ยอดเงินเข้า', group: 'main' },
  { value: 'fs:', label: '⚪ ยังไม่เคยติดตาม', group: 'follow' },
  { value: 'fs:__closed__', label: '🏁 ปิดติดตามแล้ว (เก็บเงินครบ)', group: 'follow' },
  { value: 'cs:', label: '⚪ ยังไม่มีสถานะจ่ายเงิน', group: 'pay' },
];
const STATE_GROUP_LABELS: Record<StateOption['group'], string> = {
  main: '',
  follow: 'สถานะติดตาม (ครั้งล่าสุด)',
  pay: 'สถานะจ่ายเงิน (งวดล่าสุด)',
};

// กติกาเดียวกับ get_list ?state= ใน accounting_API_mobile.php ('__following__' = กล่อง "กำลังติดตาม" บนการ์ดสรุป)
function matchState(p: Project, state: string): boolean {
  if (state === 'all' || state === '') return true;
  if (state === 'unpaid') return p.paymentStateRaw !== 'paid_full';
  if (state === 'paid_full') return p.paymentStateRaw === 'paid_full';
  if (state === 'has_today') return p.hasToday;
  if (state === '__following__') return p.followState === 'following';
  if (state.startsWith('cs:')) return p.payStatusRaw === state.slice(3);
  if (state.startsWith('fs:')) {
    const want = state.slice(3);
    if (want === '__closed__') return p.followState === 'closed';
    return p.followState !== 'closed' && p.followStatusRaw === want;
  }
  return p.paymentStateRaw === state;
}

export default function AccountingDashboard({
  onBackToMain,
  onViewCompanyBreakdown,
  onViewProject,
  onFollowProject,
  onRecordProject,
}: Props) {
  const { user } = useAuth();
  const userId = user?.id;

  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [companies, setCompanies] = useState<CompanyBreakdown[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  // ตัวเลือกปีในป็อปอัพ — เริ่มด้วยปีปัจจุบัน แล้วแทนด้วยปีที่มีข้อมูลจริงจาก get_master_data
  const [yearOptions, setYearOptions] = useState<number[]>([new Date().getFullYear()]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 🌟 modal "ดูข้อมูล" — ดึง get_detail ตอนเปิด modal เท่านั้น (ไม่ฝังกับ get_list)
  const [detailModal, setDetailModal] = useState<{ visible: boolean; project?: Project; loading: boolean; detail?: ProjectDetail }>({
    visible: false,
    loading: false,
  });

  // แถบ "งวดชำระเงิน" + "ประวัติการติดตาม" — กดที่กล่องหมายเหตุ/สถานะติดตามเพื่อขยาย (get_payment_items)
  // mode คุมว่าป็อปอัพจะโชว์ส่วนไหน: สถานะติดตาม -> เฉพาะประวัติการติดตาม, สถานะจ่ายเงิน -> เฉพาะงวดชำระเงิน, หมายเหตุ -> ทั้งคู่
  const [paymentModal, setPaymentModal] = useState<{
    visible: boolean; project?: Project; mode: 'both' | 'payment' | 'follow'; loading: boolean; items: PaymentItem[]; follows: FollowItem[];
  }>({ visible: false, mode: 'both', loading: false, items: [], follows: [] });

  // เลือกผู้รับผิดชอบติดตามหนี้ — เหมือน project_dashboard.tsx (ลิสต์พนักงานทั้งหมด + ค้นหาได้)
  const [debtOwnerOptions, setDebtOwnerOptions] = useState<string[]>([]);
  const [debtModal, setDebtModal] = useState<{ visible: boolean; project?: Project; search: string; saving: boolean }>({
    visible: false, search: '', saving: false,
  });

  // 🌟 สลับไปหน้า "ติดตาม"/"ลงบัญชี" เองภายในไฟล์นี้เมื่อไม่มี onFollowProject/onRecordProject จากภายนอก
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'followup' | 'accounting'>('dashboard');
  const [activeProjectId, setActiveProjectId] = useState<string | number | null>(null);

  // ออกจากหน้านี้ (สลับไปเมนูอื่นใน drawer) แล้วกลับเข้ามาใหม่ -> รีเซ็ตกลับหน้าหลักเสมอ
  useFocusEffect(
    useCallback(() => {
      return () => {
        setActiveScreen('dashboard');
        setDetailModal({ visible: false, loading: false });
        setFilterSheetOpen(false);
      };
    }, [])
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stateOptions, setStateOptions] = useState<StateOption[]>(STATE_FILTERS_FALLBACK);
  // ตัวกรองทั้งหมด (สถานะ/บริษัท/ช่วงวันที่) อยู่ใน bottom sheet แบบหน้าเอกสาร PO/AX
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [followFrom, setFollowFrom] = useState('');
  const [followTo, setFollowTo] = useState('');
  const [payFrom, setPayFrom] = useState('');
  const [payTo, setPayTo] = useState('');

  // 🌟 [เพิ่มใหม่] state ของส่วน "ดูข้อมูลบัญชีแยกตามบริษัท" — ตรงกับ
  // masterCompanyContainer(collapsed)/currentCompanyFilter/toggleCompanyCard ของต้นฉบับ
  const [breakdownExpanded, setBreakdownExpanded] = useState(false);
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  // การ์ดบริษัทที่กางดูตัวเลขอยู่ (ค่าเริ่มต้นพับทุกใบ)
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<Set<string>>(new Set());

  const asOfDate = useMemo(() => {
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return formatShortThaiDate(ymd);
  }, []);

  // get_dashboard — README_accounting.md ข้อ 4.2 (kpi_all + kpi_by_company)
  const load = useCallback(async (refresh = false) => {
    if (!userId) return;
    refresh ? setRefreshing(true) : setLoading(true);
    setOffline(false);
    try {
      const [dash, list] = await Promise.all([
        apiMobileGet(ACCOUNTING_API_URL, 'get_dashboard', { user_id: userId, year: selectedYear }),
        apiMobileGet(ACCOUNTING_API_URL, 'get_list', {
          user_id: userId,
          year: selectedYear,
          limit: 500,
          // 🐛 [แก้บั๊ก] เดิมตัวกรองช่วงวันที่มี state/UI ครบแต่ไม่เคยถูกส่งเข้า get_list เลย —
          // เลือกวันที่แล้วไม่มีผลอะไรกับรายการที่แสดง ทั้งที่ backend รองรับอยู่แล้ว
          // ชื่อพารามิเตอร์ตรงกับ accounting_dashboard.php ตัวจริง: closed_start/end = ช่วงวันที่
          // ปิดจบ, status_start/end = ช่วงวันที่กรอกสถานะล่าสุด (ไม่ใช่ "สถานะติดตาม/จ่ายเงิน"
          // ตามป้ายเดิมของ mockup — ป้ายก็แก้ให้ตรงกับของจริงแล้วด้านล่าง)
          closed_start: followFrom || undefined,
          closed_end: followTo || undefined,
          status_start: payFrom || undefined,
          status_end: payTo || undefined,
        }),
      ]);
      setSummary(mapSummary(dash.kpi_all));
      setCompanies(Array.isArray(dash.kpi_by_company) ? dash.kpi_by_company.map(mapCompanyBreakdown) : []);
      setProjectList(Array.isArray(list.list) ? list.list.map(mapProject) : []);
    } catch (e) {
      console.error('accounting_API_mobile load failed', e);
      setOffline(true);
    } finally {
      refresh ? setRefreshing(false) : setLoading(false);
    }
  }, [userId, selectedYear, followFrom, followTo, payFrom, payTo]);

  useEffect(() => { void load(); }, [load]);

  // get_master_data.users — รายชื่อพนักงานทั้งหมด สำหรับป็อปอัพเลือกผู้รับผิดชอบติดตามหนี้
  useEffect(() => {
    if (!userId) return;
    apiMobileGet(ACCOUNTING_API_URL, 'get_master_data', { user_id: userId })
      .then((res) => {
        // ปีที่เลือกได้ = ปีที่มีโครงการจริง (get_master_data.years: DISTINCT YEAR(created_at) จาก projects)
        // ปีไหนไม่มีข้อมูลก็ไม่ขึ้นให้กด — ถ้าปีที่เลือกอยู่ไม่มีข้อมูล เลื่อนไปปีล่าสุดที่มีข้อมูลให้เอง
        if (Array.isArray(res.years) && res.years.length > 0) {
          const ys: number[] = res.years.map((y: any) => Number(y)).filter((y: number) => y > 0);
          if (ys.length > 0) {
            setYearOptions(ys);
            setSelectedYear((cur) => (ys.includes(cur) ? cur : ys[0]));
          }
        }
        setDebtOwnerOptions(Array.isArray(res.users) ? res.users.map(String) : []);
        if (Array.isArray(res.state_filters) && res.state_filters.length > 0) {
          setStateOptions(
            res.state_filters.map((o: any) => ({
              value: String(o.value ?? ''),
              label: String(o.label ?? ''),
              group: o.group === 'follow' || o.group === 'pay' ? o.group : 'main',
            }))
          );
        }
      })
      .catch((e) => console.error('accounting_API_mobile get_master_data failed', e));
  }, [userId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const projects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projectList.filter((item) => {
      const haystack = `${item.jobNo} ${item.company} ${item.customer} ${item.projectName} ${item.owner} ${item.closedBy}`.toLowerCase();
      const matchesTerm = !term || haystack.includes(term);
      const matchesStatus = matchState(item, statusFilter);
      // 🌟 [เพิ่มใหม่] กรองตามบริษัทที่เลือกจากการ์ดใน "ข้อมูลแยกตามบริษัท"
      const matchesCompany = companyFilter === 'all' || item.company === companyFilter;
      return matchesTerm && matchesStatus && matchesCompany;
    });
  }, [projectList, search, statusFilter, companyFilter]);

  const [exporting, setExporting] = useState(false);

  // Export ตามตัวกรองหน้าจอปัจจุบัน — เทียบเท่า "exportFilteredExcel()" ฝั่งเว็บ แต่ทำเป็น CSV
  // ตารางเดียว (ไม่มี action Export ฝั่งเซิร์ฟเวอร์ และไฟล์ Excel หลายชีท/จัดสีของเว็บหนักเกินไปสำหรับ
  // มือถือ — ใช้แถวที่กรองอยู่ตอนนี้ในแอปเป็นความจริงหนึ่งเดียวเหมือนเว็บ)
  async function handleExportCsv() {
    if (projects.length === 0) {
      setToast('ไม่มีข้อมูลตามตัวกรองให้ export');
      return;
    }
    setExporting(true);
    try {
      const headers = [
        'เลขหน้างาน', 'บริษัท', 'ลูกค้า', 'ชื่อโครงการ', 'ผู้รับผิดชอบติดตามหนี้',
        'งบตั้งต้น', 'ยอดรับสุทธิ', 'ค้างชำระ', 'สถานะติดตาม', 'สถานะจ่ายเงิน',
        'วันที่ปิดจบ', 'ผู้ปิดจบ', 'หมายเหตุ',
      ];
      const followLabel: Record<FollowState, string> = {
        not_started: 'ยังไม่เคยติดตาม',
        following: 'กำลังติดตาม',
        closed: 'ปิดการติดตามแล้ว',
      };
      const csvEscape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const lines = [headers.map(csvEscape).join(',')];
      for (const p of projects) {
        lines.push([
          p.jobNo, p.company, p.customer, p.projectName, p.owner,
          String(p.initialBudget), String(p.paidAmount), String(p.outstanding),
          followLabel[p.followState], p.payState === 'paid' ? 'จ่ายเงินครบแล้ว' : 'ยังไม่ครบ',
          p.closedAt ?? '', p.closedBy, p.note ?? '',
        ].map((v) => csvEscape(String(v))).join(','));
      }
      // ใส่ BOM กัน Excel เปิดภาษาไทยเพี้ยน
      const csvContent = '﻿' + lines.join('\r\n');

      const now = new Date();
      const fileName = `ลูกหนี้_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.csv`;
      const fileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export ลูกหนี้ตามตัวกรอง' });
      } else {
        setToast('อุปกรณ์นี้แชร์ไฟล์ไม่ได้ — ไฟล์ถูกสร้างไว้ที่แคชแอปแล้ว');
      }
    } catch (e: any) {
      console.error('export csv failed', e);
      setToast(e?.message || 'สร้างไฟล์ export ไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  }

  // 🌟 [เพิ่มใหม่] ปุ่ม "ดูข้อมูล" — ถ้ามี prop จากภายนอกให้ใช้ตามนั้น ไม่งั้นขยายแถบข้อมูลแทรกใน
  // การ์ดเดียวกัน (accordion) + ยิง get_detail(project_id) ตอนนี้เอง — ตรงกับเว็บที่กด "ดูข้อมูล"
  // แล้วแถบข้อมูลโผล่ต่อท้ายแถวเดิมในตารางเลย ไม่ใช่ป็อปอัพแยก (เดิมทำเป็น Modal ผิดจากเว็บ)
  const handleView = async (project: Project) => {
    if (onViewProject) return onViewProject(project);
    setDetailModal({ visible: true, project, loading: true });
    if (!userId) return;
    try {
      const res = await apiMobileGet(ACCOUNTING_API_URL, 'get_detail', { user_id: userId, project_id: project.id });
      setDetailModal((s) => (s.project?.id === project.id ? { ...s, loading: false, detail: mapProjectDetail(res.detail) } : s));
    } catch (e) {
      console.error('accounting_API_mobile get_detail failed', e);
      setDetailModal((s) => (s.project?.id === project.id ? { ...s, loading: false } : s));
    }
  };

  // กล่อง "หมายเหตุ"/"สถานะติดตาม" — ขยายแถบ "งวดชำระเงิน" + "ประวัติการติดตาม" แทรกในการ์ด
  // (accordion แยกจาก "ดูข้อมูล" ด้านบน) ยิง get_payment_items ตอนเปิดเท่านั้น
  const handleViewPayments = async (project: Project, mode: 'both' | 'payment' | 'follow' = 'both') => {
    if (paymentModal.visible && paymentModal.project?.id === project.id && paymentModal.mode === mode) {
      setPaymentModal({ visible: false, mode: 'both', loading: false, items: [], follows: [] });
      return;
    }
    setPaymentModal({ visible: true, project, mode, loading: true, items: [], follows: [] });
    if (!userId) return;
    try {
      const res = await apiMobileGet(ACCOUNTING_API_URL, 'get_payment_items', { user_id: userId, project_id: project.id });
      setPaymentModal((s) =>
        s.project?.id === project.id
          ? {
              ...s,
              loading: false,
              items: Array.isArray(res.items) ? res.items.map(mapPaymentItem) : [],
              follows: Array.isArray(res.follows) ? res.follows.map(mapFollowItem) : [],
            }
          : s
      );
    } catch (e) {
      console.error('accounting_API_mobile get_payment_items failed', e);
      setPaymentModal((s) => (s.project?.id === project.id ? { ...s, loading: false } : s));
    }
  };

  // ปุ่มชื่อผู้รับผิดชอบติดตามหนี้ — เปิดป็อปอัพเลือกจากรายชื่อพนักงานทั้งหมด (เหมือน project_dashboard.tsx)
  const openDebtModal = (project: Project) => {
    setDebtModal({ visible: true, project, search: '', saving: false });
  };

  const assignDebtOwner = async (name: string) => {
    const project = debtModal.project;
    if (!project || !userId) return;
    setDebtModal((s) => ({ ...s, saving: true }));
    try {
      await apiMobilePost(ACCOUNTING_API_URL, 'save_debt_owner', {
        user_id: userId,
        project_id: project.id,
        debt_type: 'บุคคล',
        debt_user: name,
      });
      setDebtModal({ visible: false, search: '', saving: false });
      setProjectList((prev) => prev.map((p) => (p.id === project.id ? { ...p, owner: name } : p)));
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
      setDebtModal((s) => ({ ...s, saving: false }));
    }
  };

  // ปุ่ม "ติดตาม" — เชื่อมแล้ว: ProjectFollowupScreen ตอนนี้ใช้ project_API_mobile.php
  // (action=get_followup_detail/save_followup) แทน project_followup.php เดิมที่ต้อง session
  // เว็บซึ่งแอปมือถือไม่มี (ดูหมายเหตุหัวไฟล์ projectfollowup.tsx)
  const handleFollow = (project: Project) => {
    if (onFollowProject) return onFollowProject(project);
    setActiveProjectId(project.id);
    setActiveScreen('followup');
  };

  const handleRecord = (project: Project) => {
    setBusyId(project.id);
    try {
      if (onRecordProject) return onRecordProject(project);
      // 🌟 [เพิ่มใหม่] ตอนนี้มีสกรีนจริงแล้ว (ProjectAccountingScreen) — mockup นี้ยังไม่ได้ทำ
      // ระบบสิทธิ์ can_do_accounting ของต้นฉบับ จึงโชว์ปุ่มนี้เสมอ
      setActiveProjectId(project.id);
      setActiveScreen('accounting');
    } finally {
      setBusyId(null);
    }
  };

  const clearAllFilters = () => {
    setFollowFrom('');
    setFollowTo('');
    setPayFrom('');
    setPayTo('');
    setStatusFilter('all');
    setCompanyFilter('all');
    setSearch('');
  };

  // ชื่อที่โชว์ของค่าสถานะ — ยอดเงินเข้าต่อท้ายวันที่แบบเว็บ, '__following__' มาจากกล่องบนการ์ดสรุป
  function stateLabel(value: string) {
    if (value === '__following__') return 'กำลังติดตาม';
    const o = stateOptions.find((x) => x.value === value);
    const label = o?.label ?? value;
    return value === 'has_today' ? `${label} (${asOfDate})` : label;
  }

  // ตัวกรองที่ใช้อยู่ — chip เล็กใต้แถบค้นหา กด ✕ เพื่อลบทีละตัว
  const activeFilterChips: { key: string; label: string; clear: () => void }[] = [];
  if (statusFilter !== 'all') {
    activeFilterChips.push({ key: 'status', label: stateLabel(statusFilter), clear: () => setStatusFilter('all') });
  }
  if (companyFilter !== 'all') activeFilterChips.push({ key: 'company', label: companyFilter, clear: () => setCompanyFilter('all') });
  if (followFrom || followTo) {
    activeFilterChips.push({
      key: 'closed',
      label: `ปิดจบ ${followFrom ? formatShortThaiDate(followFrom) : '...'} – ${followTo ? formatShortThaiDate(followTo) : '...'}`,
      clear: () => {
        setFollowFrom('');
        setFollowTo('');
      },
    });
  }
  if (payFrom || payTo) {
    activeFilterChips.push({
      key: 'statusDate',
      label: `กรอกสถานะ ${payFrom ? formatShortThaiDate(payFrom) : '...'} – ${payTo ? formatShortThaiDate(payTo) : '...'}`,
      clear: () => {
        setPayFrom('');
        setPayTo('');
      },
    });
  }

  // นับจำนวนตามสถานะติดตามจากรายการของปีที่เลือก (ก่อนกรอง) — ใช้แสดงในกล่องสถานะของการ์ดสรุป
  const followCounts = FOLLOW_BOXES.map((b) => projectList.filter(b.match).length);
  // เลือกบริษัทแล้ว -> การ์ดสรุปโชว์ตัวเลขของบริษัทนั้น (kpi_by_company) แบบ filterByCompany() บนเว็บ
  const shownSummary = companyFilter === 'all' ? summary : companies.find((c) => c.name === companyFilter)?.summary ?? summary;
  const detailProject = detailModal.project ? projectList.find((p) => p.id === detailModal.project!.id) ?? detailModal.project : undefined;

  // 🌟 [เพิ่มใหม่] ปุ่ม "ดูข้อมูลบัญชีแยกตามบริษัท" — ถ้ามี prop จากภายนอกให้ใช้ตามนั้น (เผื่อ
  // อยากพาไปหน้าจอแยกจริงๆ ในอนาคต) ไม่งั้น toggle ส่วนที่ฝังอยู่ในหน้านี้เลย ตรงกับ
  // toggleMasterCompany() ของต้นฉบับที่แค่ toggle class 'collapsed' บนหน้าเดิม
  const handleToggleBreakdown = () => {
    if (onViewCompanyBreakdown) return onViewCompanyBreakdown();
    setBreakdownExpanded((v) => !v);
  };

  // ตรงกับ filterByCompany() ของต้นฉบับ — 'all' = ภาพรวมทุกบริษัท
  const handleSelectCompany = (id: string) => {
    setCompanyFilter(id);
  };

  // ตรงกับ toggleCompanyCard() ของต้นฉบับ — ย่อ/ขยายการ์ดของบริษัทเดียว (ไม่กระทบตัวกรอง)
  const toggleCompanyCardExpand = (id: string) => {
    setExpandedCompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (activeScreen === 'followup' && activeProjectId !== null) {
    return <ProjectFollowupScreen id={String(activeProjectId)} onBack={() => setActiveScreen('dashboard')} onSaved={() => setActiveScreen('dashboard')} />;
  }
  if (activeScreen === 'accounting' && activeProjectId !== null) {
    return <ProjectAccountingScreen id={String(activeProjectId)} onBack={() => setActiveScreen('dashboard')} onSaved={() => setActiveScreen('dashboard')} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* แถบค้นหา + ตัวกรอง + Export — วางนอก ScrollView จึงติดค้างด้านบนเสมอ (แบบหน้าเอกสาร PO/AX)
          หัวข้อ "แดชบอร์ดบัญชีลูกหนี้" เดิมซ้ำกับแถบหัวของ drawer จึงตัดออก ปุ่มย้อนกลับโชว์เฉพาะตอนเปิดจากหน้าโครงการ */}
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          {onBackToMain && (
            <Pressable onPress={onBackToMain} style={styles.topBarBack} hitSlop={6}>
              <Ionicons name="chevron-back" size={20} color="#0f172a" />
            </Pressable>
          )}
          <View style={styles.topBarSearch}>
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="ค้นหาชื่อ, รหัส..."
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
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
          <Pressable style={[styles.topBarAddBtn, exporting && { opacity: 0.6 }]} accessibilityLabel="Export" onPress={handleExportCsv} disabled={exporting}>
            {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="download-outline" size={20} color="#fff" />}
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#4f46e5" />}
      >
        {offline ? (
          <Pressable onPress={() => load()} style={styles.offline}>
            <Ionicons name="cloud-offline-outline" size={16} color="#a34545" />
            <Text style={styles.offlineText}>แสดงข้อมูลล่าสุด แตะเพื่อเชื่อมต่อใหม่</Text>
            <Ionicons name="refresh-outline" size={15} color="#a34545" />
          </Pressable>
        ) : null}

        {/* การ์ดสรุปโทนสีเดียวกับเว็บ — แถบสีรุ้งด้านบน, การ์ดตัวเลขขอบซ้ายสี, แถบ WIP, สถานะติดตาม 4 กล่อง (แตะเพื่อกรอง) */}
        <View style={styles.summaryCard}>
          <View style={[styles.summaryRainbow, { backgroundColor: '#4f46e5' }]} />
          <View style={styles.summaryHead}>
            <View style={styles.brandMark}>
              <Text style={styles.brandText}>TJC</Text>
            </View>
            <Text style={styles.summaryTitle} numberOfLines={2}>
              {companyFilter === 'all' ? 'ภาพรวมลูกหนี้ทุกบริษัท (รวมทั้งหมด)' : `ภาพรวมลูกหนี้ ${companyFilter}`}
            </Text>
            <Pressable style={styles.summaryYearChip} onPress={() => setYearPickerVisible(true)}>
              <Text style={styles.summaryYearChipText}>ค.ศ. {selectedYear}</Text>
              <Ionicons name="chevron-down" size={12} color="#475569" />
            </Pressable>
          </View>
          <View style={styles.tileGrid}>
            {SUMMARY_TILES.map((t) => (
              <View key={t.key} style={[styles.tile, { borderLeftColor: t.color }]}>
                <View style={styles.tileLabelRow}>
                  <Ionicons name={t.icon} size={13} color="#475569" />
                  <Text style={styles.tileLabel} numberOfLines={2}>
                    {t.key === 'receivedToday' ? `เงินเข้า (${asOfDate})` : t.label}
                  </Text>
                </View>
                <Text style={[styles.tileValue, { color: t.color }]} numberOfLines={1}>
                  {loading ? '-' : t.unit ? String(shownSummary[t.key]) : num(shownSummary[t.key])}
                  {!!t.unit && <Text style={styles.tileUnit}> {t.unit}</Text>}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.wip}>
            <Ionicons name="construct" size={16} color="#f59e0b" />
            <Text style={styles.wipLabel} numberOfLines={2}>
              งานระหว่างทำ (WIP) <Text style={styles.wipLight}>ยังไม่ปิดจบ</Text>
            </Text>
            <Text style={styles.wipJobs}>{loading ? '-' : shownSummary.wipJobs} งาน</Text>
            <Text style={styles.wipDivider}>|</Text>
            <Text style={styles.wipValue}>{loading ? '-' : num(shownSummary.wipAmount)}</Text>
          </View>

          <Text style={styles.followTitle}>สถานะติดตาม  <Ionicons name="funnel-outline" size={10} color="#94a3b8" /> แตะเพื่อกรอง</Text>
          <View style={styles.followRow}>
            {FOLLOW_BOXES.map((b, i) => {
              const active = statusFilter === b.value;
              return (
                <Pressable
                  key={b.value}
                  onPress={() => setStatusFilter(active ? 'all' : b.value)}
                  style={[styles.followBox, { backgroundColor: b.bg }, active && { borderColor: b.color }]}
                >
                  <Ionicons name={active ? 'funnel' : 'funnel-outline'} size={10} color={b.color} style={styles.tapHintIcon} />
                  <Ionicons name={b.icon} size={14} color={b.color} />
                  <Text style={[styles.followCount, { color: b.color }]}>{loading ? '-' : followCounts[i]}</Text>
                  <Text style={styles.followLabel} numberOfLines={2}>{b.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* แยกตามบริษัท (kpi_by_company) — แตะชื่อ = กรองเฉพาะบริษัทนั้น, แตะลูกศร = กางดูตัวเลขของบริษัท */}
        {companies.length > 0 && (
          <Pressable style={styles.breakdownToggle} onPress={handleToggleBreakdown}>
            <Text style={styles.breakdownToggleText}>
              แยกตามบริษัท ({companies.length}){companyFilter !== 'all' ? ' · เลือก 1' : ''}
            </Text>
            <Ionicons name={breakdownExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#64748b" />
          </Pressable>
        )}
        {breakdownExpanded && (
          <View style={styles.companyList}>
            {companies.map((c) => {
              const isActive = companyFilter === c.name;
              const isExpanded = expandedCompanyIds.has(c.id);
              const cs = c.summary;
              return (
                <View key={c.id} style={[styles.companyCard, isActive && styles.companyCardActive]}>
                  <View style={styles.companyCardHead}>
                    <Pressable style={styles.companyCardInfo} onPress={() => handleSelectCompany(isActive ? 'all' : c.name)}>
                      <View style={styles.companyBadge}>
                        <Ionicons name="business" size={18} color="#94a3b8" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.companyCardName} numberOfLines={2}>{c.name}</Text>
                        <Text style={styles.companyCardMoney}>ค้าง {num(cs.outstanding)} ฿</Text>
                        {isActive && (
                          <View style={styles.companySelectedRow}>
                            <Ionicons name="checkmark-circle" size={11} color="#059669" />
                            <Text style={styles.companySelectedText}>แสดงผลอยู่</Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                    <Pressable onPress={() => toggleCompanyCardExpand(c.id)} hitSlop={8} style={styles.companyCollapseBtn}>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
                    </Pressable>
                  </View>
                  {isExpanded && (
                    <View style={styles.companyDetails}>
                      <ModalRow label="ทุนตั้งต้น (งบรวม)" value={num(cs.initialBudget)} />
                      <ModalRow label="ลูกหนี้ค้างชำระ" value={`${cs.debtorsDue} เจ้า`} />
                      <ModalRow label="ลูกหนี้คงค้าง" value={num(cs.outstanding)} />
                      <ModalRow label="หน้างานที่เงินเข้า" value={`${cs.jobsWithPayment} งาน`} />
                      <ModalRow label="เงินเข้าทั้งหมด (ยอดจ่าย)" value={num(cs.totalReceived)} />
                      <ModalRow label="ยอดรับสุทธิ" value={num(cs.netReceived)} />
                      <ModalRow label="งานระหว่างทำ (WIP)" value={`${cs.wipJobs} งาน | ${num(cs.wipAmount)}`} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.resultRow}>
          <Text style={styles.resultText}>
            {loading ? 'กำลังโหลด...' : `${projects.length} โครงการ`}
            {!loading && projects.length !== projectList.length ? ` จาก ${projectList.length}` : ''}
          </Text>
          <Pressable onPress={() => load(true)} hitSlop={8} style={styles.resultRefresh}>
            <Ionicons name="sync" size={14} color="#4f46e5" />
            <Text style={styles.resultRefreshText}>รีเฟรช</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color="#4f46e5" />
            <Text style={styles.stateText}>กำลังโหลดรายการลูกหนี้...</Text>
          </View>
        ) : projects.length === 0 ? (
          <View style={styles.stateBox}>
            <Ionicons name="file-tray-outline" size={28} color="#9aa7b5" />
            <Text style={styles.stateTitle}>ไม่พบรายการ</Text>
            <Text style={styles.stateText}>ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา</Text>
          </View>
        ) : (
          projects.map((item) => (
            <ProjectCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onOpen={() => handleView(item)}
              onFollow={() => handleFollow(item)}
              onRecord={() => handleRecord(item)}
              onViewFollowHistory={() => handleViewPayments(item, 'follow')}
              onViewPaymentTerms={() => handleViewPayments(item, 'payment')}
            />
          ))
        )}
      </ScrollView>

      {toast ? (
        <View style={styles.toast}>
          <Ionicons name="information-circle" size={16} color="#ffffff" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* ตัวกรองแบบ bottom sheet — สถานะติดตาม / บริษัท / ช่วงวันที่ (แบบหน้าเอกสาร PO/AX) */}
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
            {/* จัดเป็นกล่องตามหมวด — ปุ่มทุกอันกว้างเท่ากัน 2 คอลัมน์ ข้อความยาวตัดเป็น 2 บรรทัดในปุ่ม */}
            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 8, gap: 10 }} showsVerticalScrollIndicator={false}>
              {(['main', 'follow', 'pay'] as const).map((g) => {
                const opts = stateOptions.filter((o) => o.group === g);
                if (opts.length === 0) return null;
                const head = {
                  main: { icon: 'card' as const, color: '#64748b', title: 'สถานะการชำระ' },
                  follow: { icon: 'call' as const, color: '#64748b', title: STATE_GROUP_LABELS.follow },
                  pay: { icon: 'wallet' as const, color: '#64748b', title: STATE_GROUP_LABELS.pay },
                }[g];
                return (
                  <View key={g} style={styles.sheetGroup}>
                    <View style={styles.sheetGroupHead}>
                      <View style={[styles.sheetGroupIcon, { backgroundColor: head.color + '1a' }]}>
                        <Ionicons name={head.icon} size={13} color={head.color} />
                      </View>
                      <Text style={styles.sheetGroupTitle}>{head.title}</Text>
                    </View>
                    <View style={styles.sheetChipWrap}>
                      {opts.map((o) => (
                        <SheetOption
                          key={o.value}
                          // ตัดอีโมจินำหน้าออก (💳 ❌ ✅ 🔥 ⚪ 🏁) ให้ทุกปุ่มเริ่มตรงกัน — ใช้ไอคอนเช็คบอกตัวที่เลือกแทน
                          label={(o.value === 'has_today' ? `${o.label} (${asOfDate})` : o.label).replace(/^[^฀-๿A-Za-z0-9(]+/, '')}
                          active={o.value === statusFilter}
                          onPress={() => setStatusFilter(o.value)}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}

              {companies.length > 0 && (
                <View style={styles.sheetGroup}>
                  <View style={styles.sheetGroupHead}>
                    <View style={[styles.sheetGroupIcon, { backgroundColor: '#64748b1a' }]}>
                      <Ionicons name="business" size={13} color="#64748b" />
                    </View>
                    <Text style={styles.sheetGroupTitle}>บริษัท</Text>
                  </View>
                  <View style={styles.sheetChipWrap}>
                    <SheetOption label="ทุกบริษัท" active={companyFilter === 'all'} onPress={() => setCompanyFilter('all')} />
                    {companies.map((c) => (
                      <SheetOption key={c.id} label={c.name} active={companyFilter === c.name} onPress={() => setCompanyFilter(c.name)} />
                    ))}
                  </View>
                </View>
              )}

              {/* ตรงกับตัวกรองจริงของ accounting_dashboard.php: closed_start/end, status_start/end */}
              <View style={styles.sheetGroup}>
                <View style={styles.sheetGroupHead}>
                  <View style={[styles.sheetGroupIcon, { backgroundColor: '#64748b1a' }]}>
                    <Ionicons name="calendar" size={13} color="#64748b" />
                  </View>
                  <Text style={styles.sheetGroupTitle}>ช่วงวันที่</Text>
                </View>
                <Text style={styles.sheetDateLabel}>วันที่ปิดจบ</Text>
                <View style={styles.filterInputs}>
                  <DateField value={followFrom} onChange={setFollowFrom} placeholder="ตั้งแต่" style={{ flex: 1 }} />
                  <DateField value={followTo} onChange={setFollowTo} placeholder="ถึง" style={{ flex: 1 }} />
                </View>
                <Text style={[styles.sheetDateLabel, { marginTop: 10 }]}>วันที่กรอกสถานะล่าสุด</Text>
                <View style={styles.filterInputs}>
                  <DateField value={payFrom} onChange={setPayFrom} placeholder="ตั้งแต่" style={{ flex: 1 }} />
                  <DateField value={payTo} onChange={setPayTo} placeholder="ถึง" style={{ flex: 1 }} />
                </View>
              </View>
            </ScrollView>
            <View style={styles.sheetFooter}>
              <Pressable style={styles.sheetResetBtn} onPress={clearAllFilters}>
                <Text style={styles.sheetResetText}>ค่าเริ่มต้น</Text>
              </Pressable>
              <Pressable style={styles.sheetApplyBtn} onPress={() => setFilterSheetOpen(false)}>
                <Text style={styles.sheetApplyText}>ดูผลลัพธ์ ({projects.length})</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* หน้ารายละเอียดเต็มจอ — render ก่อนโมดัลประวัติ/เลือกผู้ติดตามหนี้ เพื่อให้โมดัลเหล่านั้นซ้อนอยู่ด้านบนบน Android */}
      <Modal
        visible={detailModal.visible && !!detailProject}
        animationType="slide"
        onRequestClose={() => setDetailModal({ visible: false, loading: false })}
      >
        {/* iOS: Modal เป็นหน้าต่างแยก SafeAreaProvider ของแอปครอบไม่ถึง -> SafeAreaView ได้ระยะขอบ 0
            หัวหน้า/ปุ่มกลับไปอยู่ใต้ notch กดไม่ได้ จึงต้องมี provider ของตัวเองใน Modal */}
        <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <View style={styles.detailHeaderBar}>
            <Pressable onPress={() => setDetailModal({ visible: false, loading: false })} hitSlop={8} style={styles.detailHeaderBack}>
              <Ionicons name="chevron-back" size={22} color="#0f172a" />
            </Pressable>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>หน้างาน {detailProject?.jobNo}</Text>
          </View>
          {detailProject && (
            <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
              <ProjectDetailBody
                item={detailProject}
                busy={busyId === detailProject.id}
                onFollow={() => {
                  setDetailModal({ visible: false, loading: false });
                  handleFollow(detailProject);
                }}
                onRecord={() => {
                  setDetailModal({ visible: false, loading: false });
                  handleRecord(detailProject);
                }}
                onOwnerPress={() => openDebtModal(detailProject)}
                expandedLoading={detailModal.loading}
                expandedDetail={detailModal.detail}
                onViewFollowHistory={() => handleViewPayments(detailProject, 'follow')}
                onViewPaymentTerms={() => handleViewPayments(detailProject, 'payment')}
                onViewBoth={() => handleViewPayments(detailProject, 'both')}
              />
            </ScrollView>
          )}
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      <PaymentHistoryModal
        visible={paymentModal.visible}
        projectName={paymentModal.project?.projectName}
        mode={paymentModal.mode}
        loading={paymentModal.loading}
        items={paymentModal.items}
        follows={paymentModal.follows}
        onClose={() => setPaymentModal({ visible: false, mode: 'both', loading: false, items: [], follows: [] })}
      />

      {/* Modal: เลือกปี — กดปุ่มปีแล้วมีลิสต์ให้เลือกตรงๆ เหมือนดรอปดาวน์บนเว็บ แทนที่จะกดแล้วปีลดลงทีละ 1 */}
      <Modal visible={yearPickerVisible} transparent animationType="fade" onRequestClose={() => setYearPickerVisible(false)}>
        <Pressable style={styles.pickerModalOverlay} onPress={() => setYearPickerVisible(false)}>
          <View style={styles.pickerModalSheet}>
            <Text style={styles.pickerModalTitle}>เลือกปี</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {yearOptions.map((y) => {
                const active = selectedYear === y;
                return (
                  <Pressable
                    key={y}
                    style={[styles.pickerModalOption, active && styles.pickerModalOptionActive]}
                    onPress={() => {
                      setSelectedYear(y);
                      setYearPickerVisible(false);
                    }}
                  >
                    <Text style={styles.pickerModalOptionText}>ปี ค.ศ. {y}</Text>
                    {active && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.pickerModalCloseBtn} onPress={() => setYearPickerVisible(false)}>
              <Text style={styles.pickerModalCloseBtnText}>ปิด</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Modal: เลือกผู้รับผิดชอบติดตามหนี้ — รายชื่อพนักงานทั้งหมด + ค้นหาได้ เหมือน project_dashboard.tsx */}
      <Modal visible={debtModal.visible} transparent animationType="fade" onRequestClose={() => setDebtModal({ visible: false, search: '', saving: false })}>
        <Pressable style={styles.pickerModalOverlay} onPress={() => setDebtModal({ visible: false, search: '', saving: false })}>
          <Pressable style={styles.pickerModalSheet} onPress={() => {}}>
            <Text style={styles.pickerModalTitle}>เลือกผู้รับผิดชอบติดตามหนี้</Text>
            <Text style={{ fontSize: 11.5, color: '#8b98a8', marginBottom: 8 }} numberOfLines={1}>
              {debtModal.project?.projectName}
            </Text>
            <View style={styles.debtSearchBox}>
              <Ionicons name="search" size={14} color="#94a3b8" />
              <TextInput
                style={styles.debtSearchInput}
                placeholder="ค้นหาชื่อผู้ติดตามหนี้..."
                placeholderTextColor="#94a3b8"
                value={debtModal.search}
                onChangeText={(v) => setDebtModal((s) => ({ ...s, search: v }))}
              />
            </View>
            {debtModal.saving ? (
              <ActivityIndicator color="#4f46e5" style={{ paddingVertical: 20 }} />
            ) : (
              <ScrollView style={{ maxHeight: 380 }}>
                {debtOwnerOptions
                  .filter((name) => name.toLowerCase().includes(debtModal.search.trim().toLowerCase()))
                  .map((name) => (
                    <Pressable key={name} style={[styles.pickerModalOption, { justifyContent: 'flex-start', gap: 8 }]} onPress={() => assignDebtOwner(name)}>
                      <Ionicons name="person-circle-outline" size={16} color="#4f46e5" />
                      <Text style={styles.pickerModalOptionText}>{name}</Text>
                    </Pressable>
                  ))}
              </ScrollView>
            )}
            <Pressable style={styles.pickerModalCloseBtn} onPress={() => setDebtModal({ visible: false, search: '', saving: false })}>
              <Text style={styles.pickerModalCloseBtnText}>ปิด</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ปุ่มตัวเลือกในแผ่นตัวกรอง — กว้างเท่ากัน (2 คอลัมน์) สูงเท่ากัน ข้อความกลางปุ่ม ตัวที่เลือกมีไอคอนเช็ค
function SheetOption({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sheetChip, active && styles.sheetChipActive, pressed && styles.pressed]}>
      {active && <Ionicons name="checkmark-circle" size={14} color="#ffffff" />}
      <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

// หัวการ์ด + แถวข้อมูลแบบป็อปอัพเว็บ (ไอคอนในกล่องฟ้าอ่อน, แถว: ไอคอน + ป้ายซ้าย / ค่าตัวหนาขวา)
function InfoCardHead({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={styles.infoCardHead}>
      <View style={styles.infoCardIcon}>
        <Ionicons name={icon} size={15} color="#4f46e5" />
      </View>
      <Text style={styles.infoCardTitle}>{title}</Text>
    </View>
  );
}

function InfoRow({ icon, iconColor, label, value, valueColor }: { icon: keyof typeof Ionicons.glyphMap; iconColor?: string; label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRowLabelWrap}>
        <Ionicons name={icon} size={14} color={iconColor ?? '#94a3b8'} />
        <Text style={styles.infoRowLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoRowValue, valueColor ? { color: valueColor } : null]}>{value || '-'}</Text>
    </View>
  );
}

function ModalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.modalRow}>
      <Text style={styles.modalRowLabel}>{label}</Text>
      <Text style={styles.modalRowValue} numberOfLines={3}>
        {value || '-'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // #f8fafc ให้ตรงกับพื้นหลังหน้าจอของอีก 3 โมดูล (project/document/fm_report_travel) — เดิมใช้ #eef2f6 ต่างกันเล็กน้อย
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 14, paddingBottom: 36 },

  // แถบค้นหา/ตัวกรอง/Export ติดด้านบน — ค่าเดียวกับหน้าเอกสาร PO/AX
  topBar: { backgroundColor: '#ffffff', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarBack: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarSearch: { flex: 1, height: 40, borderRadius: 12, backgroundColor: '#f1f5f9', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchInput: { flex: 1, color: '#0f172a', fontSize: 13, padding: 0 },
  topBarBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  topBarBtnActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  topBarBadge: { position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  topBarBadgeText: { fontSize: 10.5, fontWeight: '900', color: '#4f46e5' },
  topBarAddBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  activeFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  activeFilterChip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef2ff', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 5 },
  activeFilterChipText: { color: '#3730a3', fontSize: 11, fontWeight: '700', flexShrink: 1 },

  offline: { backgroundColor: '#fbe9e7', borderRadius: 13, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 },
  offlineText: { flex: 1, color: '#8d4747', fontSize: 12 },

  // การ์ดสรุป (โทนเว็บ)
  summaryCard: { backgroundColor: '#ffffff', borderRadius: 18, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingBottom: 14, elevation: 2 },
  summaryRainbow: { height: 4 },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  brandMark: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e0d7c1', backgroundColor: '#fdfbf6', alignItems: 'center', justifyContent: 'center' },
  brandText: { color: '#a8904f', fontSize: 11, fontWeight: '900' },
  summaryTitle: { flex: 1, color: '#0f172a', fontSize: 14.5, fontWeight: '900' },
  summaryYearChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 6 },
  summaryYearChipText: { color: '#475569', fontSize: 11, fontWeight: '800' },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, paddingHorizontal: 12 },
  tile: { width: '48.8%', minHeight: 78, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, paddingHorizontal: 10, paddingVertical: 9, justifyContent: 'space-between' },
  tileLabelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  tileLabel: { flex: 1, color: '#475569', fontSize: 11, fontWeight: '700', lineHeight: 15 },
  tileValue: { fontSize: 19, fontWeight: '900', letterSpacing: -0.3, marginTop: 6 },
  tileUnit: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  wip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, marginTop: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', backgroundColor: '#f8fafc', paddingHorizontal: 12, paddingVertical: 12 },
  wipLabel: { flex: 1, color: '#334155', fontSize: 12, fontWeight: '800' },
  wipLight: { color: '#64748b', fontWeight: '500', fontSize: 11 },
  wipJobs: { color: '#0f172a', fontSize: 13, fontWeight: '900' },
  wipDivider: { color: '#94a3b8' },
  wipValue: { color: '#f59e0b', fontSize: 14, fontWeight: '900' },
  followTitle: { color: '#64748b', fontSize: 11.5, fontWeight: '800', paddingHorizontal: 14, marginTop: 14, marginBottom: 8 },
  followRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12 },
  tapHintIcon: { position: 'absolute', top: 5, right: 6 },
  followBox: { flex: 1, minHeight: 72, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 6, gap: 2 },
  followCount: { fontSize: 17, fontWeight: '900' },
  followLabel: { color: '#475569', fontSize: 10, fontWeight: '700', textAlign: 'center' },

  // แยกตามบริษัท
  breakdownToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 2 },
  breakdownToggleText: { color: '#475569', fontSize: 13, fontWeight: '800' },
  companyList: { gap: 8, marginBottom: 6 },
  companyCard: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1.5, borderColor: '#e2e8f0', overflow: 'hidden' },
  companyCardActive: { borderColor: '#059669', backgroundColor: '#f0fdf4' },
  companyCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  companyCardInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  companyBadge: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  companyCardName: { color: '#0f172a', fontSize: 13, fontWeight: '800' },
  companyCardMoney: { color: '#e8443f', fontSize: 12, fontWeight: '800', marginTop: 2 },
  companySelectedRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  companySelectedText: { color: '#059669', fontSize: 10.5, fontWeight: '800' },
  companyCollapseBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  companyDetails: { borderTopWidth: 1, borderTopColor: '#eef2f6', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },

  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 2 },
  resultText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  resultRefresh: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  resultRefreshText: { color: '#4f46e5', fontSize: 12, fontWeight: '800' },

  // bottom sheet ตัวกรอง
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingBottom: 18 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginTop: 8, marginBottom: 6 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  sheetTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  sheetGroup: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 10 },
  sheetGroupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sheetGroupIcon: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  sheetGroupTitle: { color: '#0f172a', fontSize: 13, fontWeight: '900' },
  sheetDateLabel: { color: '#64748b', fontSize: 11.5, fontWeight: '700', marginBottom: 6 },
  sheetChipWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  sheetChip: { width: '48.8%', minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  sheetChipActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  sheetChipText: { flexShrink: 1, color: '#334155', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  sheetChipTextActive: { color: '#ffffff' },
  sheetFooter: { flexDirection: 'row', gap: 10, marginTop: 14 },
  sheetResetBtn: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  sheetResetText: { color: '#475569', fontSize: 13, fontWeight: '800' },
  sheetApplyBtn: { flex: 2, height: 46, borderRadius: 12, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  sheetApplyText: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  filterInputs: { flexDirection: 'row', gap: 8 },

  // หน้ารายละเอียดเต็มจอ
  detailHeaderBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  detailHeaderBack: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  detailHeaderTitle: { flex: 1, color: '#0f172a', fontSize: 16, fontWeight: '900' },
  detailScroll: { padding: 14, paddingBottom: 36 },
  detailCard: { backgroundColor: '#ffffff', borderRadius: 18, padding: 14, elevation: 1 },

  // การ์ดในลิสต์ (แบบย่อ)
  card: { backgroundColor: '#ffffff', borderRadius: 16, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#eef2f6', elevation: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  jobBadge: { backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  jobBadgeText: { color: '#4338ca', fontSize: 12, fontWeight: '900' },
  cardProjectName: { color: '#0f172a', fontSize: 14, lineHeight: 20, fontWeight: '800', marginTop: 10 },
  cardSub: { color: '#64748b', fontSize: 11.5, marginTop: 3 },
  cardSummaryBottomRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  cardOutstanding: { fontSize: 16, fontWeight: '900', marginTop: 2 },
  cardCompanyTag: { flexShrink: 1, color: '#64748b', fontSize: 11.5, fontWeight: '800', marginLeft: 8 },
  paidSoftBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#e5f8ee', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3 },
  paidSoftBadgeText: { color: '#0e8f60', fontSize: 10.5, fontWeight: '800' },
  quickActionRow: { flexDirection: 'row', gap: 8 },
  quickActionBtn: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  quickActionBtnText: { color: '#334155', fontSize: 12.5, fontWeight: '800' },

  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  jobLabel: { color: '#98a5b3', fontSize: 10 },
  jobNo: { color: '#4f46e5', fontSize: 24, fontWeight: '900', letterSpacing: -0.6, marginTop: 1 },
  cardHeadRight: { alignItems: 'flex-end' },
  company: { color: '#4a5d72', fontSize: 13, fontWeight: '900', letterSpacing: 0.3 },
  customer: { color: '#8b98a8', fontSize: 11, marginTop: 3 },
  // จังหวะระยะห่างแนวตั้งของการ์ด — รวมเป็น 12px คั่นทุกส่วน (เดิมมี 11/12/13 ปนกันไม่มีแพทเทิร์น)
  projectName: { color: '#22364c', fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 12 },

  peopleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f6' },
  ownerChip: { maxWidth: '52%', minHeight: 30, borderRadius: 15, backgroundColor: '#eef2ff', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  ownerText: { color: '#4f46e5', fontSize: 11.5, fontWeight: '800' },
  closedBlock: { alignItems: 'flex-end' },
  microLabel: { color: '#98a5b3', fontSize: 10 },
  closedBy: { color: '#33475d', fontSize: 11.5, fontWeight: '900', marginTop: 2 },
  closedAt: { color: '#8b98a8', fontSize: 10, marginTop: 1 },

  moneyGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 12 },
  moneyCell: { width: '25%' },
  moneyValue: { color: '#1b2f45', fontSize: 13.5, fontWeight: '900', marginTop: 3 },
  moneyPositive: { color: '#0e8f60' },
  moneyDanger: { color: '#e8443f' },

  cardActionZone: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  statusCompactRow: { flexDirection: 'row', gap: 8 },
  statusCompactCol: { flex: 1 },
  statusRow: { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f6' },
  statusCol: { flex: 1, gap: 6 },
  chip: { minHeight: 32, borderRadius: 16, borderWidth: 1, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipText: { fontSize: 10.5, fontWeight: '800', flexShrink: 1 },
  dateHint: { color: '#6d7d8e', fontSize: 10.5 },
  noDate: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noDateText: { color: '#c88a1e', fontSize: 10.5, fontWeight: '700' },
  flagText: { color: '#5d7085', fontSize: 10.5 },

  note: { marginTop: 12, borderRadius: 11, borderWidth: 1, borderColor: '#f2d488', backgroundColor: '#fffbee', padding: 10 },
  noteLabel: { color: '#b98a12', fontSize: 10, fontWeight: '900' },
  noteText: { color: '#7d6112', fontSize: 11.5, lineHeight: 17, marginTop: 4 },

  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },

  stateBox: { backgroundColor: '#ffffff', borderRadius: 18, minHeight: 180, marginTop: 10, alignItems: 'center', justifyContent: 'center', gap: 8 },
  stateTitle: { color: '#4b5f74', fontSize: 14, fontWeight: '900' },
  stateText: { color: '#8b98a8', fontSize: 12 },


  toast: { position: 'absolute', left: 16, right: 16, bottom: 22, minHeight: 46, borderRadius: 14, backgroundColor: '#22364c', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  toastText: { flex: 1, color: '#ffffff', fontSize: 12.5, fontWeight: '700' },

  // เต็มจอ — ใช้กับ PaymentHistoryModal (งวดชำระเงิน/ประวัติการติดตาม) เท่านั้น โมดัลอื่นในไฟล์นี้ใช้ style แยก
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', paddingTop: 40 },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  pickerModalSheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  pickerModalTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  pickerModalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  pickerModalOptionActive: { backgroundColor: '#eef2ff' },
  pickerModalOptionText: { fontSize: 12.5, fontWeight: '700', color: '#334155', flexShrink: 1 },
  debtSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f6f8fa', borderWidth: 1, borderColor: '#dfe6ee', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
  debtSearchInput: { flex: 1, fontSize: 13, color: '#22364c', padding: 0 },
  pickerModalCloseBtn: { marginTop: 8, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 },
  pickerModalCloseBtnText: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },
  modalCard: { flex: 1, backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, overflow: 'hidden' },
  modalHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: '#22364c', marginRight: 10 },
  modalSubTitle: { fontSize: 12, color: '#5a6b7e', fontWeight: '600', marginTop: 4 },
  modalBox: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, marginTop: 12 },
  infoCard: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: '#c7d2fe', paddingHorizontal: 14, paddingBottom: 8, marginTop: 12 },
  infoCardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  infoCardIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  infoCardTitle: { fontSize: 14.5, fontWeight: '900', color: '#0f172a' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 9 },
  infoRowLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0, maxWidth: '45%' },
  infoRowLabel: { fontSize: 12, color: '#475569', fontWeight: '600', flexShrink: 1 },
  infoRowValue: { flex: 1, fontSize: 12.5, color: '#0f172a', fontWeight: '800', textAlign: 'right' },
  infoChannelWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  infoChannelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  infoChannelText: { fontSize: 11.5, fontWeight: '800', color: '#0f172a' },
  inlineDetailBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e7ecf2', borderStyle: 'dashed' },
  subTableBox: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 12 },
  subTableHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subTableTitle: { fontSize: 12.5, fontWeight: '800', color: '#22364c', flex: 1 },
  subTableCountBadge: { backgroundColor: '#eef2ff', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2 },
  subTableCountText: { fontSize: 10.5, fontWeight: '700', color: '#4f46e5' },
  subTableEmptyText: { fontSize: 11.5, color: '#93a2b3', marginTop: 8 },
  // การ์ดต่อรายการ (เลื่อนแนวตั้ง) แทนตารางเลื่อนแนวนอนเดิม — แต่ละงวด/ครั้งเป็นการ์ดของตัวเอง
  // label/value วางเป็นคู่ในแถวเดียวกัน (kvRow) ไม่ใช้ wrap+gap ล้นขอบแบบที่เคยพังบน Android
  kvCard: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#eef2f6', padding: 10, gap: 6 },
  kvCardHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kvCardHeadText: { fontSize: 12.5, fontWeight: '800', color: '#22364c' },
  kvRow: { flexDirection: 'row', gap: 10 },
  kvCell: { gap: 1 },
  kvLabel: { fontSize: 9.5, color: '#8b98a8', fontWeight: '700' },
  kvValue: { fontSize: 11.5, color: '#33475d', fontWeight: '600' },
  subTableMetaSub: { fontSize: 9.5, color: '#8b98a8', marginTop: 1 },
  subTablePayBadge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2 },
  subTablePayBadgeText: { fontSize: 10, fontWeight: '700' },
  modalBoxTitle: { fontSize: 12, fontWeight: '900', color: '#4f46e5', marginBottom: 8 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  modalRowLabel: { fontSize: 11.5, color: '#8b98a8', fontWeight: '700', flexShrink: 0 },
  modalRowValue: { fontSize: 12, color: '#22364c', fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  modalChannelsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  modalChannelChip: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e9f0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  modalChannelChipText: { fontSize: 10.5, color: '#4b5f74', fontWeight: '600' },
  modalCloseBtn: { marginTop: 16, backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalCloseBtnText: { color: '#5a6b7e', fontWeight: '800', fontSize: 13.5 },
});

/* API ที่หน้านี้เรียกจริง — accounting_API_mobile.php (README_accounting.md), ผ่าน API_MODULES ใน
 * constants/config.ts และ apiMobileGet จาก app/service/api_mobile.ts:
 * GET get_dashboard -> kpi_all + kpi_by_company (การ์ดสรุป)
 * GET get_list       -> รายการโครงการ (การ์ดลูกหนี้)
 * GET get_detail      -> รายละเอียดโครงการเดียว ดึงตอนเปิด modal "ดูข้อมูล" เท่านั้น
 * ไม่มี action mark_paid ใน API จริง จึงตัดปุ่มนั้นออก (ดูคอมเมนต์หัวไฟล์) — ส่วน Export ทำเป็น
 * CSV ตารางเดียวฝั่ง client ล้วน (ไม่มี action export ฝั่งเซิร์ฟเวอร์เช่นกัน) จากแถวที่กรองอยู่ตอนนี้
 * ในแอป (handleExportCsv) เทียบเท่าเจตนาของปุ่ม "Export ตามตัวกรอง" บนเว็บ แต่ตัดรูปแบบไฟล์ Excel
 * หลายชีท/จัดสีของเว็บออก (หนักเกินไปสำหรับมือถือ)
 * ปุ่มรายรายการ (ดูข้อมูล / ติดตาม / ลงบัญชี) ส่งออกทาง props: onViewProject, onFollowProject, onRecordProject
 * — ถ้าไม่ส่ง prop เหล่านี้ หน้านี้จะเปิด modal ดูข้อมูลในตัว และสลับไป ProjectFollowupScreen/
 * ProjectAccountingScreen ที่ import ไว้ด้านบนเอง
 */