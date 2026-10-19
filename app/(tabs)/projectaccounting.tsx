/**
 * ProjectAccountingScreen.tsx
 * ------------------------------------------------------------------
 * หน้าลงบัญชีรับชำระ — พอร์ตจาก project_accounting.php "โหมดปกติ" (ลงบัญชีลูกหนี้แบ่งงวด)
 * เปิดได้ 2 ทาง:
 *   - ฝังในหน้าอื่น (AccountingDashboard / project_dashboard) ส่ง id + onBack/onSaved/onOpenFollowup มาเป็น props
 *   - เปิดเป็น route ตรง ๆ: router.push({ pathname: '/projectaccounting', params: { id } })
 *     (อ่าน id ผ่าน useLocalSearchParams() เหมือนไฟล์อื่นในชุดนี้)
 *
 * ต้นฉบับมี 3 โหมด (ปกติ / แผนผ่อนชำระ ?plan_id= / ค้ำเงินสด ?lg_id=) — ปุ่ม "ลงบัญชี" ของ
 * accounting_dashboard.php ส่งมาแค่ ?id= เสมอ ไม่มี plan_id/lg_id เลย ดังนั้นไฟล์นี้ทำเฉพาะ
 * "โหมดปกติ" เท่านั้น ตรงกับเงื่อนไข !$is_plan_mode && !$is_lg_mode ของต้นฉบับ
 *
 * ต่อ API จริงทั้งโหลดและบันทึก (accounting_API_mobile.php — README_accounting.md):
 *  - โหลด: action=get_detail = ข้อมูลโครงการ + งวดชำระทุกงวด (พร้อมผู้บันทึก/เวลาบันทึก) + ตัวเลือก
 *    ในฟอร์มชุดเดียวกับเว็บ (สถานะกลุ่มจ่ายเงิน, ธนาคาร bank_masters, VAT setup_vat) + สิทธิ์ can_do_accounting
 *  - บันทึก: action=save_payments ส่งงวดทั้งชุดเป็น JSON ก้อนเดียว เซิร์ฟเวอร์ลบงวดเดิมของโครงการแล้ว
 *    เขียนใหม่ทั้งชุดใน transaction — งวดเดิมจับคู่ด้วย row_uid (pp_uid) จึงคงผู้บันทึก/เวลาบันทึกเดิม และลง
 *    ประวัติผู้แก้ไขเฉพาะงวดที่ค่าเปลี่ยนจริง ส่วนผู้บันทึกงวดใหม่เซิร์ฟเวอร์ใส่เองจาก user_id
 *
 * กติกาที่พอร์ตจากต้นฉบับ (โหมดปกติ):
 *  - สูตรคำนวณต่องวดตรงกับ calculateRow() เป๊ะ (VAT จาก setup_vat, 3 โหมดกรอก: ก่อน VAT / รวม VAT /
 *    รับสุทธิ, หัก ณ ที่จ่าย 0-5%, หักค่าธรรมเนียม+ค่าปรับ):
 *      mode=base : base=amount, vat=base*VAT, gross=base+vat, wht=base*wht%, net=gross-wht-fee-fine
 *      mode=gross: gross=amount, base=gross/(1+VAT), vat=gross-base, wht=base*wht%, net=gross-wht-fee-fine
 *      mode=net  : net=amount, base=(net+fee+fine)/(1+VAT-wht%), vat=base*VAT, gross=base+vat, wht=base*wht%
 *  - สถานะให้เลือกเฉพาะกลุ่ม "จ่ายเงิน" จาก master — งวดใหม่ตั้งต้นที่ตัวแรกของกลุ่ม, ปุ่ม "ปิดยอด" ใช้ชื่อ
 *    สถานะที่มีคำว่า "ปิดยอด" จาก master, ทุกสถานะในกลุ่ม (+ 'โอน'/'รับเช็คแล้ว' ของงวดเก่า) ต้องกรอกยอด
 *  - ยอดที่กรอกรวมครบงบ -> ตั้งงวดสุดท้ายที่มียอดเป็น "ปิดยอด" ให้อัตโนมัติ (autoCloseIfFull)
 *  - สถานะ "รับเช็คแล้ว" (งวดเก่า) -> โผล่ช่องเลขที่เช็ค + วันที่ลงเช็ค / เปลี่ยนเป็นสถานะอื่นล้างช่องเช็คทิ้ง
 *  - แต่ละงวดพับ/ขยายได้เหมือนกันกับหน้าติดตามหนี้ (ProjectFollowupScreen)
 *  - แถบสรุปยอดรวมทุกงวดท้ายหน้า รวมจากทุกงวดจริง ไม่ใช่ตัวเลขคงที่
 *  - ปุ่มลัด "ไปหน้าติดตามหนี้" (การติดตามหนี้แยกออกไปอีกหน้าแล้วในต้นฉบับ)
 *  - ไม่มีสิทธิ์ acc_do_accounting -> ไม่โชว์ฟอร์มเลย (เว็บกันตั้งแต่เปิดหน้า)
 *
 * ที่ตัดออก (ฟีเจอร์แอดมิน/ส่งออกไฟล์): "จัดการสถานะ" และ "Export สรุปเงินเข้า"
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../_layout';
// ✅ Config
import { API_MODULES } from '../../constants/config';
import { DateField, formatShortThaiDateTime } from '../../components/DateTimeField';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';

// ⚠️ ห้ามยิงตรงไป project_accounting.php (เว็บ) — หน้านั้นบังคับ PHP session จาก login หน้าเว็บ
// แต่แอปมือถือ login แบบ stateless (ไม่มี session) จึงโดน redirect ไป login.php เงียบ ๆ ทุกครั้ง
// ทั้งโหลด (get_detail) และบันทึก (save_payments) จึงใช้ accounting_API_mobile.php แทน
const ACCOUNTING_API_URL = `${API_MODULES}/accounting_API_mobile.php`;

// ====================================================================
// Types
// ====================================================================

type CalcMode = 'base' | 'gross' | 'net';

interface PaymentRow {
  id: string;
  isNew: boolean;
  name: string;
  amount: string;
  calcMode: CalcMode;
  whtPercent: number;
  status: string;
  fee: string;
  fine: string;
  bankName: string;
  receiptNo: string;
  receivedDate: string;
  receiptDate: string;
  remark: string;
  owner: string; // ผู้บันทึก — งวดเดิม = created_by จาก DB, งวดใหม่ = คนที่ล็อกอินอยู่ (โชว์เฉย ๆ เซิร์ฟเวอร์ใส่เอง)
  createdAtShow: string; // วันเวลาที่บันทึก
  chequeNo: string;
  chequeDate: string;
  // ธงของระบบตั้ง "ปิดยอด" อัตโนมัติ (เหมือน data-user-picked / data-auto-closed ของต้นฉบับ)
  userPicked?: boolean; // ผู้ใช้เลือกสถานะเองแล้ว -> ระบบไม่แตะงวดนี้อีก
  autoClosed?: boolean; // ระบบตั้ง "ปิดยอด" ให้เอง -> ถอยกลับได้ถ้ายอดกลับมาไม่ครบ
}

interface ProjectInfo {
  jobNo: string;
  projectName: string;
  customer: string;
  budget: number;
  paidGross: number;
  address?: string;
  contact?: string;
}

// ตัวเลือกในฟอร์มจาก get_detail — ชุดเดียวกับที่ project_accounting.php ใช้วาดฟอร์ม (ห้าม hardcode ในแอป
// เคย hardcode แล้วชื่อสถานะ "ปิดยอด" สะกดไม่ตรง master ทำให้คอลัมน์สถานะจ่ายเงินบนเว็บมองไม่เห็น)
interface FormOptions {
  payStatuses: string[]; // สถานะกลุ่ม "จ่ายเงิน" เรียงตาม master
  defaultStatus: string; // สถานะตั้งต้นของงวดใหม่ (ตัวแรกของกลุ่ม)
  closingStatus: string; // ชื่อสถานะ "ปิดยอด" จริงจาก master
  reqAmountStatuses: string[]; // สถานะที่ต้องกรอกยอดเงิน
  banks: string[]; // bank_masters
  vatRate: number; // setup_vat แปลงเป็นทศนิยมแล้ว (7% = 0.07)
}

export interface ProjectAccountingScreenProps {
  id?: string; // ถ้าส่งมาตรงๆ (เช่น embed จาก AccountingDashboard) จะใช้ค่านี้แทนค่าจาก route params
  onBack?: () => void;
  onSaved?: () => void;
  // ปุ่ม "ไปหน้าติดตามหนี้" — หน้าที่ฝังหน้านี้ไว้ส่งมาเพื่อสลับไปหน้าติดตามภายในตัวเอง
  // (ไม่ส่ง = เปิด route /projectfollowup แบบเดิม ใช้ตอนเปิดหน้านี้เป็น route เดี่ยว ๆ)
  onOpenFollowup?: (id: string) => void;
}

// ====================================================================
// Constants
// ====================================================================

const WHT_OPTIONS = [0, 1, 2, 3, 4, 5];
const CALC_MODE_OPTIONS: { value: CalcMode; label: string }[] = [
  { value: 'base', label: '1. ราคาก่อน VAT' },
  { value: 'gross', label: '2. ราคารวม VAT' },
  { value: 'net', label: '3. หลังหักภาษี (รับสุทธิ)' },
];
// งวดเก่าที่ยังติดสถานะนี้มีช่องเลขที่เช็ค/วันที่ลงเช็ค (ต้นฉบับเทียบชื่อนี้ตรง ๆ เหมือนกัน)
const CHEQUE_STATUS = 'รับเช็คแล้ว';
const NEW_ROW_STAMP = 'ระบบจะประทับให้เมื่อกดบันทึก';

const EMPTY_PROJECT: ProjectInfo = { jobNo: '', projectName: '', customer: '', budget: 0, paidGross: 0 };
const EMPTY_OPTIONS: FormOptions = { payStatuses: [], defaultStatus: '', closingStatus: '', reqAmountStatuses: [], banks: [], vatRate: 0.07 };

// แปลงข้อมูลดิบจาก accounting_API_mobile.php action=get_detail ให้เข้ารูป ProjectInfo/PaymentRow
// ชื่อคีย์ยึดตาม acc_row_to_json()/get_detail ใน accounting_API_mobile.php จริง (ยืนยันแล้ว)
function mapProjectInfo(raw: any, paidGross: number): ProjectInfo {
  return {
    jobNo: String(raw.display_code ?? ''),
    projectName: String(raw.project_name ?? ''),
    customer: String(raw.customer_name ?? ''),
    budget: Number(raw.project_budget ?? 0),
    paidGross,
    address: raw.customer_address || undefined,
    contact: raw.contact_person || undefined,
  };
}

function mapFormOptions(res: any): FormOptions {
  const strList = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
  const payStatuses = strList(res.pay_statuses);
  const defaultStatus = String(res.default_pay_status || payStatuses[0] || '');
  const vat = Number(res.vat_percent ?? 7);
  return {
    payStatuses,
    defaultStatus,
    closingStatus: String(res.closing_pay_status || defaultStatus),
    reqAmountStatuses: strList(res.req_amount_statuses),
    banks: strList(res.bank_list),
    vatRate: Number.isFinite(vat) ? vat / 100 : 0.07,
  };
}

// ชื่อสถานะของงวดเดิมที่สะกดต่างจาก master แค่ เเ/แ หรือช่องว่าง (แอปรุ่นเก่าเคยบันทึกไว้) -> ใช้ชื่อ master
// ไม่ตรงอะไรเลยคืนค่าเดิม (โชว์เป็น "สถานะเดิม" ให้เลือกเปลี่ยนเอง) — กติกาเดียวกับ accApi_match_pay_status() ฝั่ง API
function matchPayStatus(status: string, names: string[]): string {
  const s = status.trim();
  if (!s || names.includes(s)) return s;
  const norm = (v: string) => v.trim().replace(/เเ/g, 'แ').replace(/\s+/g, ' ');
  return names.find((n) => norm(n) === norm(s)) ?? s;
}

// ⚠️ id ต้องเป็น row_uid (คงตัวข้ามการลบ/เขียนใหม่ฝั่ง save_payments) ไม่ใช่ id ตัวเลขจาก DB —
// ถ้าส่ง id ตัวเลขกลับไปเป็น pp_uid, save_payments จะจับคู่กับแถวเดิมไม่ได้ (มองว่าเป็นงวดใหม่ทุกครั้ง)
// ทำให้ created_by/ประวัติการแก้ไขหลุดทุกครั้งที่บันทึก — get_detail จึงต้องส่ง row_uid มาด้วยเสมอ
function mapPaymentRow(raw: any, opts: FormOptions): PaymentRow {
  return mkRow({
    id: String(raw.row_uid || raw.id || uid()),
    isNew: false,
    name: String(raw.payment_name ?? ''),
    amount: String(raw.payment_amount ?? ''),
    calcMode: (raw.calc_mode || 'base') as CalcMode,
    whtPercent: Number(raw.wht_percent ?? 0),
    status: matchPayStatus(String(raw.call_status ?? ''), opts.payStatuses),
    fee: String(raw.fee_amount ?? ''),
    fine: String(raw.fine_amount ?? ''),
    bankName: String(raw.bank_name ?? ''),
    receiptNo: String(raw.receipt_no ?? ''),
    receivedDate: String(raw.payment_received_date ?? ''),
    receiptDate: String(raw.receipt_date ?? ''),
    remark: String(raw.remark ?? ''),
    // ผู้บันทึก/เวลาบันทึกจริงของงวดนั้น — งวดเก่าที่ยังไม่มีชื่อปล่อยว่าง (คนแรกที่แก้จะกลายเป็นผู้บันทึก เหมือนเว็บ)
    owner: String(raw.created_by ?? '').trim(),
    createdAtShow: raw.created_at ? formatShortThaiDateTime(raw.created_at) : 'ไม่ระบุ',
    chequeNo: String(raw.cheque_no ?? ''),
    chequeDate: String(raw.cheque_date ?? ''),
  });
}

let uidCounter = 1;
function uid(): string {
  uidCounter += 1;
  return `pay_new_${Date.now()}_${uidCounter}`;
}

function mkRow(partial: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: uid(),
    isNew: true,
    name: '',
    amount: '',
    calcMode: 'base',
    whtPercent: 0,
    status: '',
    fee: '',
    fine: '',
    bankName: '',
    receiptNo: '',
    receivedDate: '',
    receiptDate: '',
    remark: '',
    owner: '',
    createdAtShow: NEW_ROW_STAMP,
    chequeNo: '',
    chequeDate: '',
    ...partial,
  };
}

function num(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toFloat(s: string): number {
  return parseFloat((s || '').replace(/,/g, '')) || 0;
}

// เทียบเท่า calculateRow() ของต้นฉบับเป๊ะ (vatRate = GLOBAL_VAT_RATE จาก setup_vat)
function calcRow(amountStr: string, feeStr: string, fineStr: string, mode: CalcMode, whtPercent: number, vatRate: number) {
  const amount = toFloat(amountStr);
  const fee = toFloat(feeStr);
  const fine = toFloat(fineStr);
  const whtRate = whtPercent / 100;
  let base = 0,
    vat = 0,
    gross = 0,
    wht = 0,
    net = 0;

  if (mode === 'base') {
    base = amount;
    vat = base * vatRate;
    gross = base + vat;
    wht = base * whtRate;
    net = gross - wht - fee - fine;
  } else if (mode === 'gross') {
    gross = amount;
    base = gross / (1 + vatRate);
    vat = gross - base;
    wht = base * whtRate;
    net = gross - wht - fee - fine;
  } else {
    net = amount;
    const target = net + fee + fine;
    const factor = 1 + vatRate - whtRate;
    base = factor !== 0 ? target / factor : 0;
    vat = base * vatRate;
    gross = base + vat;
    wht = base * whtRate;
  }
  return { base, vat, gross, wht, fee, fine, net };
}

// เทียบเท่า autoCloseIfFull() ของต้นฉบับ — ยอดที่กรอกรวมครบงบเมื่อไหร่ ตั้งงวดสุดท้ายเป็น "ปิดยอด" ให้เลย
//  - เทียบ "ยอดที่กรอกรวม" กับงบประมาณ (สูตรเดียวกับคอลัมน์ค้างชำระของหน้าลูกหนี้)
//  - แตะเฉพาะงวดสุดท้ายที่มียอดเงิน และไม่แตะงวดที่ผู้ใช้เลือกสถานะเองแล้ว
//  - แก้ยอดจนไม่ครบ สถานะที่ระบบตั้งให้จะถอยกลับเป็นสถานะตั้งต้น (ของที่ผู้ใช้เลือกเองไม่โดน)
//  - เรียกเฉพาะตอนผู้ใช้แก้ยอด/เพิ่ม/ลบงวด ไม่เรียกตอนโหลดหน้า (งานที่จ่ายครบอยู่แล้วจะไม่ถูกเปลี่ยนเอง)
// คืนแถวชุดใหม่ + ข้อความแจ้งเตือน (ถ้ามีการเปลี่ยนสถานะ)
function autoCloseIfFull(rows: PaymentRow[], budget: number, opts: FormOptions): { rows: PaymentRow[]; message?: string } {
  if (budget <= 0 || !opts.closingStatus) return { rows };
  const target = [...rows].reverse().find((r) => toFloat(r.amount) > 0);
  if (!target || target.userPicked) return { rows };

  const sumEntered = rows.reduce((s, r) => s + toFloat(r.amount), 0);
  const isFull = sumEntered + 0.01 >= budget;
  // ตั้งสถานะให้ = เปลี่ยนสถานะ -> ล้างช่องเช็คเหมือนตอนเปลี่ยนสถานะเองบนเว็บ
  const setStatus = (status: string, autoClosed: boolean) =>
    rows.map((r) => (r.id === target.id ? { ...r, status, autoClosed, chequeNo: '', chequeDate: '' } : r));

  if (isFull && target.status !== opts.closingStatus) {
    return { rows: setStatus(opts.closingStatus, true), message: `ยอดครบตามงบแล้ว — ตั้งสถานะงวดนี้เป็น "${opts.closingStatus}" ให้อัตโนมัติ` };
  }
  if (!isFull && target.autoClosed && opts.defaultStatus) {
    return { rows: setStatus(opts.defaultStatus, false), message: `ยอดยังไม่ครบงบ — ถอยสถานะกลับเป็น "${opts.defaultStatus}"` };
  }
  return { rows };
}

// ====================================================================
// Main screen
// ====================================================================

export default function ProjectAccountingScreen({ id, onBack, onSaved, onOpenFollowup }: ProjectAccountingScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  // ไม่มี id = เปิดผิดทาง ห้ามเดาเลขหน้างานเอง (เดิม fallback เป็น 547 ของ mockup — เสี่ยงบันทึกผิดโครงการ)
  const projectId = String(id ?? params.id ?? '');
  const { user } = useAuth();
  const userId = (user as any)?.id;
  // ผู้บันทึกงวดใหม่ = คนที่ล็อกอินอยู่ (โชว์เฉย ๆ — ตอนบันทึกเซิร์ฟเวอร์ใส่ชื่อจาก user_id เอง)
  const currentUserName = String(user?.fullname ?? '').trim();

  const [project, setProject] = useState<ProjectInfo>(EMPTY_PROJECT);
  const [opts, setOpts] = useState<FormOptions>(EMPTY_OPTIONS);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  // โหลดงวดมาครบทุกงวดไหม — ไม่ครบห้ามบันทึก (save_payments ลบงวดเดิมทั้งโครงการแล้วเขียนใหม่)
  const [allRowsLoaded, setAllRowsLoaded] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noPermission, setNoPermission] = useState(false);
  const [saving, setSaving] = useState(false);
  // แจ้งเตือนแบบไม่ขวางทาง (ระบบตั้ง/ถอยสถานะ "ปิดยอด" ให้เอง) เหมือน accToast() ของต้นฉบับ
  const [toast, setToast] = useState<string | null>(null);
  const autoMsgRef = useRef<string | null>(null);

  // ป๊อปอัพเลือกตัวเลือกแบบใช้ร่วมกันทุกช่อง (แทนที่ chip picker แบบเลื่อนแนวนอนเดิม)
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

  const loadData = useCallback(async () => {
    if (!userId) return;
    if (!projectId) {
      setLoadError('ไม่พบเลขหน้างาน กรุณากลับไปเลือกโครงการใหม่');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setNoPermission(false);
    try {
      // limit = เพดานของ API — ต้องได้ครบทุกงวด เพราะตอนบันทึกเซิร์ฟเวอร์ลบงวดเดิมทั้งโครงการแล้วเขียนใหม่
      const res = await apiMobileGet(ACCOUNTING_API_URL, 'get_detail', { user_id: userId, project_id: projectId, limit: 2000 });
      // ไม่มีสิทธิ์ "ลงบัญชีรับชำระ" -> เว็บกันตั้งแต่เปิดหน้า (project_accounting.php:12) แอปจึงไม่โชว์ฟอร์มเช่นกัน
      if (Number(res.can_do_accounting ?? 0) !== 1) {
        setNoPermission(true);
        return;
      }
      const options = mapFormOptions(res);
      if (options.payStatuses.length === 0) throw new Error('โหลดตัวเลือกสถานะจ่ายเงินไม่ได้ กรุณาลองใหม่อีกครั้ง');

      const rawRows: any[] = Array.isArray(res.payment_items) ? res.payment_items : [];
      // "จ่ายแล้ว" แบบเว็บ = รวมยอดที่กรอกเฉพาะงวดที่มียอดรับสุทธิ > 0 (project_accounting.php:1132-1138)
      const paidGross = rawRows.reduce((sum, r) => (Number(r.net_amount ?? 0) > 0 ? sum + Number(r.payment_amount ?? 0) : sum), 0);
      const mappedRows: PaymentRow[] =
        rawRows.length > 0
          ? rawRows.map((r) => mapPaymentRow(r, options))
          : [mkRow({ name: 'งวดที่ 1', status: options.defaultStatus, owner: currentUserName })];
      setOpts(options);
      setProject(mapProjectInfo(res.detail ?? {}, paidGross));
      setRows(mappedRows);
      setAllRowsLoaded(rawRows.length >= Number(res.payment_items_total ?? rawRows.length));
      setExpandedIds(new Set(mappedRows.filter((r) => r.isNew).map((r) => r.id)));
    } catch (e: any) {
      console.error('load accounting_API_mobile get_detail failed', e);
      setLoadError(e?.message || 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [projectId, userId, currentUserName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ข้อความจากระบบตั้ง "ปิดยอด" อัตโนมัติ — จดไว้ใน ref ตอนคำนวณแถวชุดใหม่ แล้วค่อยโชว์หลัง render
  useEffect(() => {
    if (autoMsgRef.current) {
      setToast(autoMsgRef.current);
      autoMsgRef.current = null;
    }
  }, [rows]);

  const rowCalcs = useMemo(() => {
    const map: Record<string, ReturnType<typeof calcRow>> = {};
    rows.forEach((r) => {
      map[r.id] = calcRow(r.amount, r.fee, r.fine, r.calcMode, r.whtPercent, opts.vatRate);
    });
    return map;
  }, [rows, opts.vatRate]);

  // ป้าย "VAT 7%" ตามอัตราจริง (เว็บโชว์ floatval ของ vat_percent เช่น 7 / 7.5)
  const vatPctText = String(Math.round(opts.vatRate * 10000) / 100);

  const totals = useMemo(() => {
    return rows.reduce(
      (sum, r) => {
        const c = rowCalcs[r.id];
        sum.entered += toFloat(r.amount);
        sum.base += c.base;
        sum.vat += c.vat;
        sum.wht += c.wht;
        sum.fee += c.fee;
        sum.fine += c.fine;
        sum.net += c.net;
        return sum;
      },
      { entered: 0, base: 0, vat: 0, wht: 0, fee: 0, fine: 0, net: 0 }
    );
  }, [rows, rowCalcs]);

  function handleBack() {
    if (onBack) return onBack();
    if (router.canGoBack()) return router.back();
    router.push('/accounting_dashboard' as never);
  }

  function goFollowup() {
    // ฝังอยู่ในหน้าอื่น -> ให้หน้านั้นสลับไปหน้าติดตามเอง (push route จะหลุดออกจากหน้าที่ฝังไว้ กดกลับแล้วหลงทาง)
    if (onOpenFollowup) return onOpenFollowup(projectId);
    router.push({ pathname: '/projectfollowup', params: { id: projectId } });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // แก้ที่กระทบยอด (ยอด/ค่าธรรมเนียม/ค่าปรับ/โหมด/ภาษี, เพิ่ม/ลบงวด) -> เช็คตั้ง "ปิดยอด" อัตโนมัติด้วย
  // เหมือนต้นฉบับที่ calculateRow() -> calculateTotal() -> autoCloseIfFull() ทุกครั้ง
  function setRowsAndAutoClose(update: (prev: PaymentRow[]) => PaymentRow[]) {
    setRows((prev) => {
      const res = autoCloseIfFull(update(prev), project.budget, opts);
      if (res.message) autoMsgRef.current = res.message;
      return res.rows;
    });
  }

  function addRow(preset?: Partial<PaymentRow>) {
    const r = mkRow({ name: `งวดที่ ${rows.length + 1}`, status: opts.defaultStatus, owner: currentUserName, ...preset });
    setRowsAndAutoClose((prev) => [...prev, r]);
    setExpandedIds((prev) => new Set(prev).add(r.id));
  }

  function removeRow(row: PaymentRow) {
    const drop = () => setRowsAndAutoClose((prev) => prev.filter((r) => r.id !== row.id));
    if (!row.isNew) {
      Alert.alert('ยืนยันการลบงวดนี้?', 'งวดนี้เป็น "ข้อมูลในระบบ" หากลบทิ้งและกดบันทึก ประวัติจะหายไปอย่างถาวร', [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ยืนยันการลบ', style: 'destructive', onPress: drop },
      ]);
    } else {
      drop();
    }
  }

  function updateRow<K extends keyof PaymentRow>(id: string, field: K, value: PaymentRow[K]) {
    const update = (prev: PaymentRow[]) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r));
    if (field === 'amount' || field === 'fee' || field === 'fine' || field === 'calcMode' || field === 'whtPercent') setRowsAndAutoClose(update);
    else setRows(update);
  }

  // ผู้ใช้เลือกสถานะเอง -> ติดธงไว้ ระบบจะไม่ไปทับงวดนี้อีก และถ้าไม่ใช่ "รับเช็คแล้ว" ล้างช่องเช็คทิ้ง
  // (เหมือน change event ของ select สถานะในต้นฉบับ — เลือกค่าเดิมซ้ำไม่นับว่าเปลี่ยน)
  function pickStatus(id: string, status: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id && r.status !== status
          ? { ...r, status, userPicked: true, autoClosed: false, ...(status !== CHEQUE_STATUS ? { chequeNo: '', chequeDate: '' } : {}) }
          : r
      )
    );
  }

  // ตัวเลือกสถานะ = กลุ่ม "จ่ายเงิน" จาก master — งวดเดิมที่ติดสถานะนอกลิสต์ โชว์ค่าเดิมต่อท้ายไว้
  // (ไม่งั้นกดบันทึกแล้วสถานะจะถูกเปลี่ยนเงียบ ๆ โดยที่ผู้ใช้ไม่ได้เลือก)
  function statusOptions(current: string) {
    const list = opts.payStatuses.map((s) => ({ value: s, label: s }));
    if (current && !opts.payStatuses.includes(current)) list.push({ value: current, label: `${current} (สถานะเดิม)` });
    return list;
  }

  // ธนาคาร = bank_masters — ค่าเดิมที่ไม่อยู่ในลิสต์แล้ว ยังโชว์ไว้ให้ ไม่งั้นบันทึกแล้วธนาคารเดิมหายเงียบ ๆ
  function bankOptions(current: string) {
    const list = [{ value: '', label: 'ไม่ระบุ' }, ...opts.banks.map((b) => ({ value: b, label: b }))];
    if (current && !opts.banks.includes(current)) list.push({ value: current, label: `${current} (ค่าเดิม)` });
    return list;
  }

  // บันทึก — action=save_payments (accounting_API_mobile.php) พอร์ตตรรกะบันทึก "โหมดปกติ" ของ
  // project_accounting.php ทั้งชุด: ลบงวดเดิมทั้งโครงการแล้วเขียนใหม่ทุกงวดใน transaction โดยส่ง row_uid
  // ของงวดเดิมกลับไปเป็น pp_uid ให้เซิร์ฟเวอร์ยกผู้บันทึก/เวลาบันทึกเดิมข้ามมา และลงประวัติผู้แก้ไข
  // เฉพาะงวดที่ค่าเปลี่ยนจริง (งวดใหม่ส่ง pp_uid ว่าง = ผู้บันทึกคือคนที่ล็อกอินอยู่)
  async function handleSave() {
    if (!userId) return;
    if (!allRowsLoaded) {
      Alert.alert('บันทึกไม่ได้', 'งานนี้มีงวดชำระมากเกินกว่าที่แอปโหลดได้ กรุณาบันทึกผ่านหน้าเว็บ');
      return;
    }
    const invalidName = rows.some((r) => !r.name.trim());
    if (invalidName) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุ "ชื่องวด" ให้ครบทุกรายการก่อนบันทึก');
      return;
    }
    // เว็บไม่มีตัวเลือกสถานะว่าง (select ต้องมีค่าเสมอ) แอปจึงบังคับเลือกให้ครบเช่นกัน
    if (rows.some((r) => !r.status.trim())) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือก "สถานะจ่ายเงิน" ให้ครบทุกงวดก่อนบันทึก');
      return;
    }
    const invalidAmount = rows.some((r) => opts.reqAmountStatuses.includes(r.status) && toFloat(r.amount) <= 0);
    if (invalidAmount) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'มีงวดที่สถานะต้องระบุยอดเงิน แต่ยังไม่ได้กรอก');
      return;
    }

    const payload = rows.map((r) => {
      const c = rowCalcs[r.id];
      return {
        pp_uid: r.isNew ? '' : r.id,
        payment_name: r.name,
        payment_amount: r.amount,
        net_amount: c.net,
        call_status: r.status,
        fee_amount: r.fee,
        fine_amount: r.fine,
        bank_name: r.bankName,
        cheque_date: r.chequeDate,
        calc_mode: r.calcMode,
        wht_percent: r.whtPercent,
        cheque_no: r.chequeNo,
        payment_received_date: r.receivedDate,
        remark: r.remark,
        receipt_date: r.receiptDate,
        receipt_no: r.receiptNo,
      };
    });

    setSaving(true);
    try {
      const res = await apiMobilePost(ACCOUNTING_API_URL, 'save_payments', {
        user_id: userId,
        project_id: projectId,
        payments_json: JSON.stringify(payload),
      });
      Alert.alert('บันทึกสำเร็จ', `บันทึกงวดชำระ ${res.saved ?? rows.length} รายการเรียบร้อยแล้ว!`, [
        { text: 'ตกลง', onPress: () => (onSaved ? onSaved() : handleBack()) },
      ]);
    } catch (e: any) {
      console.error('save_payments failed', e);
      Alert.alert('บันทึกไม่สำเร็จ', e?.message || 'กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={{ color: '#94a3b8', fontSize: 12.5 }}>กำลังโหลดข้อมูล...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 }}>
          <Ionicons name="alert-circle-outline" size={28} color="#ef4444" />
          <Text style={{ color: '#64748b', fontSize: 13, textAlign: 'center' }}>{loadError}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.addBtnPlain} onPress={handleBack}>
              <Text style={styles.addBtnPlainText}>กลับ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtnPaid} onPress={loadData}>
              <Text style={styles.addBtnPaidText}>ลองใหม่</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ไม่มีสิทธิ์ "ลงบัญชีรับชำระ" — เว็บขึ้นหน้า "ไม่มีสิทธิ์เข้าถึง" ตั้งแต่เปิด แอปจึงไม่โชว์ฟอร์มเหมือนกัน
  if (noPermission) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 }}>
          <Ionicons name="lock-closed-outline" size={28} color="#ef4444" />
          <Text style={{ color: '#64748b', fontSize: 13, textAlign: 'center' }}>ไม่มีสิทธิ์ลงบัญชีรับชำระ ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์</Text>
          <TouchableOpacity style={styles.addBtnPaid} onPress={handleBack}>
            <Text style={styles.addBtnPaidText}>กลับ</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.headerCard}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={18} color="#fff" />
            <Text style={styles.backBtnText}>กลับ</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="cash-outline" size={17} color="#fff" />
            <Text style={styles.headerTitle}>จัดการบัญชีลูกหนี้ (แบ่งงวด)</Text>
          </View>
          <Text style={styles.headerSubtitle}>ลงยอดรับชำระแต่ละงวด — การติดตามหนี้แยกไปอยู่หน้า "ติดตามหนี้" แล้ว</Text>
          <TouchableOpacity style={styles.headerLinkBtn} onPress={goFollowup}>
            <Ionicons name="headset-outline" size={13} color="#fff" />
            <Text style={styles.headerLinkBtnText}>ไปหน้าติดตามหนี้</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <View style={styles.infoPanel}>
            <View style={styles.infoBadge}>
              <Ionicons name="folder-open-outline" size={11} color="#065f46" />
              <Text style={styles.infoBadgeText}>ข้อมูลโครงการ</Text>
            </View>
            <View style={styles.infoGrid}>
              <InfoItem icon="pricetag-outline" label="เลขหน้างาน" value={`#${project.jobNo}`} valueColor="#d97706" />
              <InfoItem icon="cash-outline" label="งบประมาณรวม" value={`${num(project.budget)} ฿`} valueColor="#059669" sub={`จ่ายแล้ว: ${num(project.paidGross)} ฿`} />
            </View>
            <InfoItem icon="git-network-outline" label="ชื่องบ / โครงการ" value={project.projectName} full />
            <InfoItem icon="business-outline" label="ลูกค้า" value={project.customer} valueColor="#2563eb" full />
            {!!project.address && <InfoItem icon="location-outline" label="ที่อยู่ลูกค้า" value={project.address} full small />}
            {!!project.contact && <InfoItem icon="call-outline" label="ข้อมูลติดต่อ" value={project.contact} full small />}
          </View>

          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="list-outline" size={15} color="#047857" />
              <Text style={styles.sectionHeaderText}>รายการงวดชำระ</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity style={styles.addBtnPlain} onPress={() => addRow()}>
                <Ionicons name="add" size={13} color="#059669" />
                <Text style={styles.addBtnPlainText}>เพิ่มงวด</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtnPaid} onPress={() => addRow({ name: 'งวดสุดท้าย (ปิดยอด)', status: opts.closingStatus })}>
                <Ionicons name="checkmark-done" size={13} color="#fff" />
                <Text style={styles.addBtnPaidText}>ปิดยอด</Text>
              </TouchableOpacity>
            </View>
          </View>

          {rows.map((r, idx) => {
            const c = rowCalcs[r.id];
            const expanded = expandedIds.has(r.id);
            const showCheque = r.status === CHEQUE_STATUS;
            const amountRequired = opts.reqAmountStatuses.includes(r.status);

            return (
              <View key={r.id} style={[styles.rowCard, r.isNew && styles.rowCardNew]}>
                <View style={styles.rowTopRow}>
                  <View style={[styles.rowBadge, r.isNew ? styles.rowBadgeNew : styles.rowBadgeExisting]}>
                    <Ionicons name={r.isNew ? 'sparkles' : 'server'} size={10} color={r.isNew ? '#7c3aed' : '#0891b2'} />
                    <Text style={[styles.rowBadgeText, { color: r.isNew ? '#7c3aed' : '#0891b2' }]}>{r.isNew ? 'รายการใหม่ (รอเซฟ)' : 'ข้อมูลในระบบ'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeRow(r)} style={styles.rowDeleteBtn}>
                    <Ionicons name="close" size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                {!r.isNew && !expanded ? (
                  <TouchableOpacity onPress={() => toggleExpand(r.id)} activeOpacity={0.7}>
                    <Text style={styles.collapsedName}>{r.name || `งวดที่ ${idx + 1}`}</Text>
                    <View style={styles.collapsedMetaRow}>
                      <Text style={styles.collapsedMeta}>🕐 {r.createdAtShow}</Text>
                      <Text style={styles.collapsedMeta}>👤 {r.owner || '-'}</Text>
                    </View>
                    <View style={styles.collapsedValRow}>
                      <Text style={styles.collapsedValLabel}>รับสุทธิงวดนี้</Text>
                      <Text style={styles.collapsedValValue}>{num(c.net)}</Text>
                    </View>
                    <View style={styles.collapsedStatusBadge}>
                      <Text style={styles.collapsedStatusBadgeText}>{r.status || '-'}</Text>
                    </View>
                    {!!r.remark.trim() && <Text style={styles.collapsedRemark}>💬 {r.remark}</Text>}
                    <View style={styles.expandBtn}>
                      <Ionicons name="create-outline" size={12} color="#475569" />
                      <Text style={styles.expandBtnText}>แก้ไข</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View>
                    <FieldLabel text="ชื่องวด" required />
                    <TextInput style={styles.input} placeholder="เช่น งวดที่ 1" placeholderTextColor="#94a3b8" value={r.name} onChangeText={(v) => updateRow(r.id, 'name', v)} />

                    <FieldLabel text="ยอดเงินที่กรอก (บาท)" required={amountRequired} />
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={r.amount} onChangeText={(v) => updateRow(r.id, 'amount', v)} />

                    <FieldLabel text="ยอดที่กรอกคือ..." />
                    <PickerTrigger
                      label={CALC_MODE_OPTIONS.find((m) => m.value === r.calcMode)?.label ?? ''}
                      placeholder="เลือก..."
                      onPress={() =>
                        openPicker('ยอดที่กรอกคือ...', CALC_MODE_OPTIONS.map((m) => ({ value: m.value, label: m.label })), r.calcMode, (v) => updateRow(r.id, 'calcMode', v as CalcMode))
                      }
                    />

                    <FieldLabel text="หัก ณ ที่จ่าย" />
                    <PickerTrigger
                      label={r.whtPercent === 0 ? 'ไม่หัก' : `หัก ${r.whtPercent}%`}
                      placeholder="เลือก..."
                      onPress={() =>
                        openPicker(
                          'หัก ณ ที่จ่าย',
                          WHT_OPTIONS.map((w) => ({ value: String(w), label: w === 0 ? 'ไม่หัก' : `หัก ${w}%` })),
                          String(r.whtPercent),
                          (v) => updateRow(r.id, 'whtPercent', Number(v))
                        )
                      }
                    />

                    <FieldLabel text="สถานะจ่ายเงิน" />
                    <PickerTrigger
                      label={r.status}
                      placeholder="เลือกสถานะ..."
                      onPress={() => openPicker('สถานะจ่ายเงิน', statusOptions(r.status), r.status, (v) => pickStatus(r.id, v))}
                    />

                    <View style={styles.rowGap}>
                      <View style={{ flex: 1 }}>
                        <FieldLabel text="ค่าธรรมเนียม" />
                        <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={r.fee} onChangeText={(v) => updateRow(r.id, 'fee', v)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <FieldLabel text="ค่าปรับ" />
                        <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={r.fine} onChangeText={(v) => updateRow(r.id, 'fine', v)} />
                      </View>
                    </View>

                    <FieldLabel text="ธนาคาร (เข้าเช็ค)" />
                    <PickerTrigger
                      label={r.bankName}
                      placeholder="ไม่ระบุ"
                      onPress={() => openPicker('ธนาคาร (เข้าเช็ค)', bankOptions(r.bankName), r.bankName, (v) => updateRow(r.id, 'bankName', v))}
                    />

                    {/* สรุปยอดงวดนี้ */}
                    <View style={styles.rowSummaryBox}>
                      <View style={styles.rowSummaryLine}>
                        <Text style={styles.rowSummaryLabel}>ก่อน VAT</Text>
                        <Text style={styles.rowSummaryValue}>{num(c.base)}</Text>
                      </View>
                      <View style={styles.rowSummaryLine}>
                        <Text style={styles.rowSummaryLabel}>VAT {vatPctText}%</Text>
                        <Text style={[styles.rowSummaryValue, { color: '#059669' }]}>{num(c.vat)}</Text>
                      </View>
                      <View style={styles.rowSummaryLine}>
                        <Text style={styles.rowSummaryLabel}>หัก ณ ที่จ่าย</Text>
                        <Text style={[styles.rowSummaryValue, { color: '#dc2626' }]}>-{num(c.wht)}</Text>
                      </View>
                      <View style={styles.rowSummaryLine}>
                        <Text style={styles.rowSummaryLabel}>ธรรมเนียม+ค่าปรับ</Text>
                        <Text style={[styles.rowSummaryValue, { color: '#dc2626' }]}>
                          -{num(c.fee + c.fine)}
                        </Text>
                      </View>
                      <View style={styles.divider} />
                      <View style={styles.rowSummaryLine}>
                        <Text style={[styles.rowSummaryLabel, { fontWeight: '900', color: '#0f172a' }]}>รับสุทธิงวดนี้</Text>
                        <Text style={styles.rowSummaryNet}>{num(c.net)} ฿</Text>
                      </View>
                    </View>

                    <View style={styles.rowGap}>
                      <View style={{ flex: 1 }}>
                        <FieldLabel text="เลขที่ใบเสร็จ" />
                        <TextInput style={styles.input} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={r.receiptNo} onChangeText={(v) => updateRow(r.id, 'receiptNo', v)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <FieldLabel text="วันที่ออกใบเสร็จ" />
                        <DateField value={r.receiptDate} onChange={(v) => updateRow(r.id, 'receiptDate', v)} />
                      </View>
                    </View>
                    <FieldLabel text="วันที่รับเงิน / เงินเข้า" />
                    <DateField value={r.receivedDate} onChange={(v) => updateRow(r.id, 'receivedDate', v)} />

                    <FieldLabel text="หมายเหตุ" />
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)..."
                      placeholderTextColor="#94a3b8"
                      multiline
                      value={r.remark}
                      onChangeText={(v) => updateRow(r.id, 'remark', v)}
                    />

                    {/* ใครลงงวดนี้ ลงเมื่อไหร่ — ระบบเติมให้ ไม่ให้เลือก/แก้เอง (เหมือนต้นฉบับ) */}
                    <View style={styles.rowGap}>
                      <View style={{ flex: 1 }}>
                        <FieldLabel text="ผู้บันทึก" />
                        <View style={styles.stampBox}>
                          <Ionicons name="person-outline" size={13} color="#059669" />
                          <Text style={styles.stampBoxText}>{r.owner || '—'}</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <FieldLabel text="วันเวลาที่บันทึก" />
                        <View style={styles.stampBox}>
                          <Ionicons name="time-outline" size={13} color="#d97706" />
                          <Text style={styles.stampBoxText}>{r.createdAtShow}</Text>
                        </View>
                      </View>
                    </View>

                    {showCheque && (
                      <View style={styles.chequeBox}>
                        <Text style={styles.chequeBoxTitle}>รายละเอียดเช็ค</Text>
                        <View style={styles.rowGap}>
                          <View style={{ flex: 1 }}>
                            <FieldLabel text="เลขที่เช็ค" />
                            <TextInput style={styles.input} placeholder="ระบุเลขที่เช็ค..." placeholderTextColor="#94a3b8" value={r.chequeNo} onChangeText={(v) => updateRow(r.id, 'chequeNo', v)} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <FieldLabel text="วันที่ลงเช็ค" />
                            <DateField value={r.chequeDate} onChange={(v) => updateRow(r.id, 'chequeDate', v)} />
                          </View>
                        </View>
                      </View>
                    )}

                    {!r.isNew && (
                      <TouchableOpacity onPress={() => toggleExpand(r.id)} style={styles.collapseBtn}>
                        <Ionicons name="chevron-up" size={13} color="#475569" />
                        <Text style={styles.collapseBtnText}>พับเก็บ</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          <View style={styles.summaryPanel}>
            <Text style={styles.summaryPanelTitle}>
              <Ionicons name="calculator" size={13} color="#fff" /> สรุปยอดรวมทุกงวด
            </Text>
            <SummaryLine label="รวมยอดที่กรอก (ยอดเรียกเก็บ)" value={num(totals.entered)} color="#60a5fa" />
            <SummaryLine label="มูลค่ารวม (ก่อน VAT)" value={num(totals.base)} color="#e2e8f0" />
            <SummaryLine label={`รวม VAT ${vatPctText}%`} value={num(totals.vat)} color="#4ade80" />
            <SummaryLine label="รวมหักภาษี ณ ที่จ่าย" value={`-${num(totals.wht)}`} color="#f87171" />
            <SummaryLine label="รวมค่าธรรมเนียม" value={`-${num(totals.fee)}`} color="#f87171" />
            <SummaryLine label="รวมค่าปรับ" value={`-${num(totals.fine)}`} color="#f87171" />
            <View style={styles.summaryTotalCard}>
              <Text style={styles.summaryTotalLabel}>ยอดรับสุทธิรวมทั้งหมด</Text>
              <Text style={styles.summaryTotalValue}>{num(totals.net)} บาท</Text>
            </View>
          </View>

          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleBack}>
              <Ionicons name="arrow-back" size={15} color="#475569" />
              <Text style={styles.cancelBtnText}>กลับไปหน้าหลัก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={16} color="#fff" />}
              <Text style={styles.saveBtnText}>{saving ? 'กำลังบันทึก...' : 'บันทึกงวดชำระ'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Ionicons name="information-circle" size={16} color="#ffffff" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* ป๊อปอัพเลือกตัวเลือกแบบใช้ร่วมกันทุกช่อง (แทนที่ chip picker แบบเลื่อนแนวนอนเดิม) */}
      <Modal visible={pickerModal.visible} transparent animationType="fade" onRequestClose={() => setPickerModal((s) => ({ ...s, visible: false }))}>
        <TouchableOpacity style={styles.pickerModalOverlay} activeOpacity={1} onPress={() => setPickerModal((s) => ({ ...s, visible: false }))}>
          <View style={styles.pickerModalSheet}>
            <Text style={styles.pickerModalTitle}>{pickerModal.title}</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {pickerModal.options.map((opt) => {
                const active = pickerModal.current === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value || '__none__'}
                    style={[styles.pickerModalOption, active && styles.pickerModalOptionActive]}
                    onPress={() => {
                      pickerModal.onSelect(opt.value);
                      setPickerModal((s) => ({ ...s, visible: false }));
                    }}
                  >
                    <Text style={styles.pickerModalOptionText}>{opt.label}</Text>
                    {active && <Ionicons name="checkmark" size={16} color="#059669" />}
                  </TouchableOpacity>
                );
              })}
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

function InfoItem({
  icon,
  label,
  value,
  valueColor,
  sub,
  full,
  small,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
  full?: boolean;
  small?: boolean;
}) {
  return (
    <View style={[styles.infoItem, full && { width: '100%' }]}>
      <View style={styles.infoItemLabelRow}>
        <Ionicons name={icon} size={11} color="#94a3b8" />
        <Text style={styles.infoItemLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoItemValue, valueColor ? { color: valueColor } : null, small && { fontSize: 11.5, fontWeight: '600' }]}>{value}</Text>
      {!!sub && <Text style={styles.infoItemSub}>{sub}</Text>}
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

// ปุ่มกด-เปิดป๊อปอัพเลือกตัวเลือก — แทนที่ chip picker แบบเลื่อนแนวนอนเดิม
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

function SummaryLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLineLabel}>{label}</Text>
      <Text style={[styles.summaryLineValue, { color }]}>{value} บาท</Text>
    </View>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8faff' },

  headerCard: { backgroundColor: '#059669', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 10 },
  backBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, marginTop: 6 },
  headerLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 7, marginTop: 12 },
  headerLinkBtnText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },

  body: { padding: 16 },

  infoPanel: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  infoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#ecfdf5', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 4, marginBottom: 10 },
  infoBadgeText: { fontSize: 10, fontWeight: '800', color: '#065f46' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  infoItem: { width: '47%', marginBottom: 10 },
  infoItemLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  infoItemLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600' },
  infoItemValue: { fontSize: 13, color: '#1e293b', fontWeight: '700' },
  infoItemSub: { fontSize: 10.5, color: '#0ea5e9', fontWeight: '600', marginTop: 3 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  sectionHeaderText: { fontSize: 13, fontWeight: '800', color: '#334155' },
  addBtnPlain: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  addBtnPlainText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  addBtnPaid: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  addBtnPaidText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  rowCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 12 },
  rowCardNew: { borderColor: '#c4b5fd', backgroundColor: '#faf5ff' },
  rowTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  rowBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3 },
  rowBadgeNew: { backgroundColor: '#f5f3ff' },
  rowBadgeExisting: { backgroundColor: '#f0f9ff' },
  rowBadgeText: { fontSize: 9.5, fontWeight: '700' },
  rowDeleteBtn: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },

  collapsedName: { fontSize: 13.5, fontWeight: '800', color: '#1e293b' },
  collapsedMetaRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  collapsedMeta: { fontSize: 11, color: '#64748b' },
  collapsedValRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8 },
  collapsedValLabel: { fontSize: 11, color: '#065f46', fontWeight: '700' },
  collapsedValValue: { fontSize: 13, color: '#059669', fontWeight: '900' },
  collapsedStatusBadge: { alignSelf: 'flex-start', backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, marginTop: 6 },
  collapsedStatusBadgeText: { fontSize: 11, color: '#334155', fontWeight: '700' },
  collapsedRemark: { fontSize: 11, color: '#64748b', marginTop: 6 },
  expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10 },
  expandBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 5, marginTop: 9 },
  required: { color: '#ef4444' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 12.5, color: '#0f172a', backgroundColor: '#fff' },
  textarea: { minHeight: 56, textAlignVertical: 'top' },
  rowGap: { flexDirection: 'row', gap: 8 },

  pickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  pickerTriggerText: { fontSize: 13, color: '#0f172a', fontWeight: '600', flexShrink: 1 },
  pickerTriggerPlaceholder: { color: '#94a3b8', fontWeight: '400' },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  pickerModalSheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  pickerModalTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  pickerModalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  pickerModalOptionActive: { backgroundColor: '#ecfdf5' },
  pickerModalOptionText: { fontSize: 12.5, fontWeight: '700', color: '#334155', flexShrink: 1 },
  pickerModalCloseBtn: { marginTop: 8, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 },
  pickerModalCloseBtnText: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },

  rowSummaryBox: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 10, padding: 11, marginTop: 12 },
  rowSummaryLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rowSummaryLabel: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  rowSummaryValue: { fontSize: 11.5, color: '#334155', fontWeight: '700' },
  rowSummaryNet: { fontSize: 14, color: '#059669', fontWeight: '900' },

  stampBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9 },
  stampBoxText: { fontSize: 11.5, color: '#64748b', fontWeight: '600' },

  chequeBox: { backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#d8b4fe', borderStyle: 'dashed', borderRadius: 10, padding: 11, marginTop: 12 },
  chequeBoxTitle: { fontSize: 11.5, fontWeight: '800', color: '#7c3aed', marginBottom: 4 },

  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 6 },

  collapseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 14, paddingVertical: 7, marginTop: 14 },
  collapseBtnText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },

  summaryPanel: { backgroundColor: '#0f172a', borderRadius: 14, padding: 16, marginTop: 6 },
  summaryPanelTitle: { color: '#fff', fontSize: 13, fontWeight: '800', marginBottom: 10 },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLineLabel: { fontSize: 11.5, color: '#94a3b8' },
  summaryLineValue: { fontSize: 12, fontWeight: '700' },
  summaryTotalCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 12, marginTop: 8 },
  summaryTotalLabel: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  summaryTotalValue: { color: '#4ade80', fontSize: 17, fontWeight: '900' },

  footerRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 14 },
  cancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  saveBtn: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', borderRadius: 12, paddingVertical: 14 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // แจ้งเตือนแบบไม่ขวางทาง (ค่าเดียวกับ toast ของ accounting_dashboard.tsx)
  toast: { position: 'absolute', left: 16, right: 16, bottom: 22, minHeight: 46, borderRadius: 14, backgroundColor: '#22364c', paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  toastText: { flex: 1, color: '#ffffff', fontSize: 12.5, fontWeight: '700' },
});