/**
 * DocumentDashboardScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า DocumentDashboard.php ("Dashboard ทะเบียนคุมเอกสาร")
 * สำหรับแอป tjc-mobile-app (Expo / React Native)
 *
 * ไฟล์ต้นฉบับใหญ่มาก (5,000+ บรรทัด) มี pipeline 4 ขั้น (รออนุมัติ→อนุมัติแล้ว→รอการเงิน→
 * รับเอกสารแล้ว) + การติดตามใบกำกับภาษี 3 แผนก (คลัง/จัดซื้อ/บัญชี) + เครดิต + คืนเงินซัพพลายเออร์
 * + ตีกลับเอกสาร/ใบกำกับ + โน้ต + ประวัติ + แก้ไข/ยกเลิก + ส่งออก Excel รวม 16+ actions,
 * 15+ modal ย่อย — mockup นี้ทำให้ครบทุก "ข้อมูล" ที่แสดง (ทุกคอลัมน์/badge ในตารางต้นฉบับ)
 * แต่เจาะจงทำ action หลักที่ใช้บ่อยให้ทำงานได้จริงแบบ local ส่วนที่เหลือ (แก้ไข/ยกเลิก/
 * คลังรับสินค้า/บิล+จ่ายเงิน/Export) เป็น stub — ดูรายละเอียดท้ายไฟล์นี้
 *
 * สถานะไฟล์นี้: UI MOCKUP — ข้อมูลทั้งหมดเป็น MOCK_DOCUMENTS ด้านล่าง ยังไม่ยิง fetch จริง
 *
 * ตรงกับพฤติกรรม/ข้อมูลจริงจาก DocumentDashboard.php:
 *  - การ์ดสรุป pipeline 4 ขั้น: รออนุมัติ/อนุมัติแล้ว/รอการเงิน/รับเอกสารแล้ว (นับซ้อนกันได้
 *    เหมือนต้นฉบับ — "อนุมัติแล้ว" นับรวมทุกเอกสารที่อนุมัติแล้วไม่ว่าการเงินจะรับรึยัง)
 *  - การ์ดสรุปประเภทเอกสาร: ใบสำคัญจ่าย/ใบกำกับภาษี 7%/รอใบกำกับภาษี 7%/ใบเสร็จรับเงิน/
 *    ชุดชำระเงิน (มาจากฟิลด์ attachments/extra type เดียวกับต้นฉบับ)
 *  - การ์ดเอกสารแต่ละใบโชว์ครบทุกคอลัมน์ของตารางต้นฉบับ: บริษัท/วันที่/เอกสาร(PO,AX)/
 *    ผู้สั่ง-ผู้เปิด/หน้างาน/ซัพพลายเออร์+ธนาคาร/ยอดเงิน/อนุมัติ/การเงินรับเอกสาร(+จำนวนสลิป)/
 *    กำหนดติดตาม 30 วัน/ตีกลับเอกสาร/รับใบกำกับ 3 แผนก(คลัง,จัดซื้อ,บัญชี)/ตีกลับใบกำกับภาษี/
 *    เครดิต/คืนเงินจากซัพพลายเออร์/หมายเหตุ
 *  - Action ที่ทำงานได้จริง (local state): อนุมัติ, การเงินรับเอกสาร(+แนบสลิป), บันทึกโน้ต,
 *    ตีกลับเอกสาร, รับใบกำกับภาษี 3 แผนก (ใช้ modal เดียวกัน parameterize ตามแผนก), ตีกลับ
 *    ใบกำกับภาษี, ระบุเครดิต (15/30/45/60/90 วัน ตรงกับ dropdown ต้นฉบับ), คืนเงินจากซัพพลายเออร์
 *  - เอกสารที่ถูกยกเลิก (is_cancelled) แสดงริบบิ้นสีเทาคาดผ่าน การ์ด ตรงกับ row-cancelled
 *
 * ที่เป็น stub (ต้องมี native module/endpoint เพิ่ม หรือเกินขอบเขต mockup รอบนี้):
 *  - แนบไฟล์จริง (สลิป/ใบกำกับ/คืนเงิน) — ต้อง expo-document-picker/expo-image-picker
 *  - แก้ไขข้อมูลเอกสาร (edit_doc) — ฟอร์มแยกทั้งหน้า
 *  - ยกเลิกเอกสาร (cancel_doc) + คำขอยกเลิก (request/approve flow) — ระบบสิทธิ์/อนุมัติซ้อน
 *  - คลังรับสินค้า (warehouse_receive), ข้อมูลบิล&การจ่ายเงิน (update_bill_pay) — ฟอร์มแยก
 *  - (อัปเดต) Export Excel ทำงานจริงแล้ว ตรงกับ modal_export ของต้นฉบับ (กรองผู้ทำรายการ/
 *    ประเภทเอกสาร/การแนบสลิป/ช่วงวันที่) ใช้ xlsx (SheetJS) สร้างไฟล์ .xlsx จริง แล้วเขียนลง
 *    เครื่องด้วย expo-file-system + เปิดแผงแชร์/บันทึกด้วย expo-sharing (มือถือไม่มีแนวคิด
 *    "โฟลเดอร์ดาวน์โหลด" แบบเว็บ จึงใช้ share sheet แทนการดาวน์โหลดตรงๆ) คอลัมน์ในไฟล์ตรงกับ
 *    ทุกฟิลด์ที่แสดงในการ์ดเอกสาร — ประวัติการเปลี่ยนแปลงแบบเต็ม (get_history) ยังคงย่อเป็น
 *    mock timeline สั้นๆ อยู่
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี):
 *   npx expo install @expo/vector-icons expo-file-system expo-sharing
 *   (import * as FileSystem from 'expo-file-system/legacy' — ดูคอมเมนต์ตรง import ด้านล่าง)
 *   npm install xlsx
 * ------------------------------------------------------------------
 */

import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as XLSX from 'xlsx';
// 🌟 Expo SDK 54+ ย้าย API แบบ string เดิม (documentDirectory/writeAsStringAsync/EncodingType)
// ไปอยู่ใต้ 'expo-file-system/legacy' แล้ว (API หลักตอนนี้เปลี่ยนไปใช้คลาส File/Directory แทน)
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
// ปรับ path นี้ให้ตรงกับตำแหน่งไฟล์จริงในโปรเจกต์ ถ้าไม่ได้วางไว้โฟลเดอร์เดียวกัน
import SubmitDocumentScreen from './submitdocument';

// ====================================================================
// Types
// ====================================================================

type DocType = 'PO' | 'AX';
type ExtraType = 'เอกสารทั่วไป' | 'รอใบกำกับฯ 7%' | 'ใบกำกับภาษี 7%' | 'ใบสำคัญจ่าย' | 'ใบเสร็จรับเงิน' | 'ชุดชำระเงิน';
type DeptKey = 'warehouse' | 'purchase' | 'accounting';

interface DeptReceive {
  received: boolean;
  receiver?: string;
  invoiceNumbers: string[];
  note?: string;
}

interface DocumentItem {
  id: number;
  company: string;
  createdAtShow: string;
  createdTimeShow: string;
  docType: DocType;
  docNumber: string;
  orderedBy: string;
  jobSite: string;
  supplierName: string;
  bankName?: string;
  bankAccount?: string;
  accountName?: string;
  amount: number;
  isCancelled: boolean;
  cancelReason?: string;
  approverName?: string;
  approvedAtShow?: string;
  financeReceiver?: string;
  financeReceivedAtShow?: string;
  slipCount: number;
  slipFullCount: number;
  isReturned: boolean;
  returnRemark?: string;
  warehouseReceive: DeptReceive;
  purchaseReceive: DeptReceive;
  accountingReceive: DeptReceive;
  isTaxReturned: boolean;
  taxReturnRemark?: string;
  creditTerm?: number;
  refundDone: boolean;
  refundDate?: string;
  refundNote?: string;
  extraType: ExtraType;
  noteGeneral?: string;
  // 🌟 [เพิ่มใหม่] ตรงกับปุ่มกรองพิเศษ "เกินกำหนดติดตาม"/"เครดิตใกล้หมด" ของต้นฉบับ — ของจริง
  // คำนวณจากวันที่จริง (DATE_ADD(...) < CURDATE()) แต่ mock นี้ใช้ flag ตรงๆ แทนเพื่อความชัดเจน
  // เพราะวันที่ตัวอย่างในไฟล์นี้ไม่ใช่วันที่จริงที่คำนวณย้อนกลับได้
  overdueFollowup?: boolean;
  creditAlert?: boolean;
}

export interface DocumentDashboardScreenProps {
  onBack?: () => void;
}

// ====================================================================
// Mock data
// ====================================================================

const CURRENT_USER = 'คุณธนา';
const CREDIT_OPTIONS = [15, 30, 45, 60, 90];
const DEPT_META: Record<DeptKey, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  warehouse: { label: 'คลัง', color: '#d97706', icon: 'cube-outline' },
  purchase: { label: 'จัดซื้อ', color: '#2563eb', icon: 'cart-outline' },
  accounting: { label: 'บัญชี', color: '#9333ea', icon: 'calculator-outline' },
};

function mkDept(received = false, receiver = '', invoices: string[] = []): DeptReceive {
  return { received, receiver: received ? receiver : undefined, invoiceNumbers: invoices };
}

const MOCK_DOCUMENTS: DocumentItem[] = [
  {
    id: 1, company: 'ทีเจซี', createdAtShow: '05/09/2569', createdTimeShow: '09:20', docType: 'PO', docNumber: 'PO-6901',
    orderedBy: 'คุณอรทัย', jobSite: 'TJC69-014', supplierName: 'ร้าน สมมติอิเล็กทรอนิกส์', bankName: 'ธนาคารกรุงไทย', bankAccount: '123-4-56789-0', accountName: 'ร้าน สมมติอิเล็กทรอนิกส์',
    amount: 45000, isCancelled: false,
    approverName: undefined,
    warehouseReceive: mkDept(), purchaseReceive: mkDept(), accountingReceive: mkDept(),
    isReturned: false, isTaxReturned: false, refundDone: false, extraType: 'เอกสารทั่วไป', slipCount: 0, slipFullCount: 0,
  },
  {
    id: 2, company: 'ทีเจซี', createdAtShow: '01/09/2569', createdTimeShow: '13:40', docType: 'AX', docNumber: 'AX-2245',
    orderedBy: 'คุณพิชญ์', jobSite: 'TJC69-030', supplierName: 'บริษัท วัสดุก่อสร้างสมมติ จำกัด', bankName: 'ธนาคารกสิกรไทย', bankAccount: '987-6-54321-0',
    amount: 128500, isCancelled: false,
    approverName: 'คุณวรรณา', approvedAtShow: '02/09/2569 10:15',
    warehouseReceive: mkDept(), purchaseReceive: mkDept(), accountingReceive: mkDept(),
    isReturned: false, isTaxReturned: false, refundDone: false, extraType: 'รอใบกำกับฯ 7%', slipCount: 0, slipFullCount: 0,
    noteGeneral: 'รอซัพพลายเออร์ส่งใบกำกับภาษีตัวจริง',
  },
  {
    id: 3, company: 'เอบีซี', createdAtShow: '25/08/2569', createdTimeShow: '08:05', docType: 'PO', docNumber: 'PO-6877',
    orderedBy: 'คุณสมชาย', jobSite: 'ABC69-002', supplierName: 'หจก. อะไหล่ปรับอากาศสมมติ', bankName: 'ธนาคารไทยพาณิชย์', bankAccount: '111-2-22222-3',
    amount: 67200, isCancelled: false,
    approverName: 'คุณวรรณา', approvedAtShow: '25/08/2569 14:30',
    financeReceiver: 'คุณกานดา', financeReceivedAtShow: '26/08/2569 09:00', slipCount: 1, slipFullCount: 1,
    warehouseReceive: mkDept(true, 'คุณธนา', ['INV-7701']), purchaseReceive: mkDept(true, 'คุณปิยะ', ['INV-7701']), accountingReceive: mkDept(true, 'คุณสมชาย', ['INV-7701']),
    isReturned: false, isTaxReturned: false, creditTerm: 30, refundDone: false, extraType: 'ใบกำกับภาษี 7%', creditAlert: true,
  },
  {
    id: 4, company: 'ทีเจซี', createdAtShow: '10/08/2569', createdTimeShow: '11:00', docType: 'AX', docNumber: 'AX-2198',
    orderedBy: 'คุณอรทัย', jobSite: 'TJC68-091', supplierName: 'บริษัท ลิฟต์สมมติ จำกัด', bankName: 'ธนาคารกรุงเทพ', bankAccount: '222-3-33333-4', accountName: 'บริษัท ลิฟต์สมมติ จำกัด',
    amount: 350000, isCancelled: false,
    approverName: 'คุณวรรณา', approvedAtShow: '10/08/2569 15:00',
    financeReceiver: 'คุณกานดา', financeReceivedAtShow: '11/08/2569 09:30', slipCount: 2, slipFullCount: 2,
    warehouseReceive: mkDept(), purchaseReceive: mkDept(), accountingReceive: mkDept(),
    isReturned: false, isTaxReturned: false, creditTerm: 60, refundDone: true, refundDate: '20/08/2569', refundNote: 'คืนเงินค่าประกันของเสียหาย', extraType: 'ใบสำคัญจ่าย',
  },
  {
    id: 5, company: 'เอ็กซ์วายแซด', createdAtShow: '18/07/2569', createdTimeShow: '16:20', docType: 'PO', docNumber: 'PO-6742',
    orderedBy: 'คุณวรรณา', jobSite: 'XYZ69-021', supplierName: 'ร้าน โซล่าเซลล์สมมติ', amount: 89000, isCancelled: true, cancelReason: 'ลูกค้ายกเลิกออเดอร์กะทันหัน',
    warehouseReceive: mkDept(), purchaseReceive: mkDept(), accountingReceive: mkDept(),
    isReturned: false, isTaxReturned: false, refundDone: false, extraType: 'เอกสารทั่วไป', slipCount: 0, slipFullCount: 0,
  },
  {
    id: 6, company: 'เอบีซี', createdAtShow: '30/06/2569', createdTimeShow: '10:10', docType: 'AX', docNumber: 'AX-2050',
    orderedBy: 'คุณพิชญ์', jobSite: 'ABC69-003', supplierName: 'ร้านเครือข่ายสมมติ', bankName: 'ธนาคารกสิกรไทย', bankAccount: '333-4-44444-5',
    amount: 15800, isCancelled: false,
    approverName: 'คุณวรรณา', approvedAtShow: '30/06/2569 11:00',
    financeReceiver: 'คุณกานดา', financeReceivedAtShow: '01/07/2569 09:00', slipCount: 1, slipFullCount: 0,
    warehouseReceive: mkDept(), purchaseReceive: mkDept(), accountingReceive: mkDept(),
    isReturned: true, returnRemark: 'ตั้งโอนผิดบัญชี ต้องแก้ไขก่อน', isTaxReturned: false, refundDone: false, extraType: 'ใบเสร็จรับเงิน', overdueFollowup: true,
  },
];

// ====================================================================
// Helpers
// ====================================================================

function num(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function stageOf(d: DocumentItem): 'pending_approve' | 'pending_finance' | 'finance_received' {
  if (!d.approverName) return 'pending_approve';
  if (!d.financeReceiver) return 'pending_finance';
  return 'finance_received';
}

const STAGE_META = {
  pending_approve: { label: 'รออนุมัติ', bg: '#fef3c7', fg: '#b45309', icon: 'create-outline' as const },
  pending_finance: { label: 'รอการเงิน', bg: '#dbeafe', fg: '#1d4ed8', icon: 'time-outline' as const },
  finance_received: { label: 'รับเอกสารแล้ว', bg: '#ede9fe', fg: '#6d28d9', icon: 'wallet-outline' as const },
};

const EXTRA_META: Record<ExtraType, { color: string; icon: keyof typeof FontAwesome5.glyphMap }> = {
  'เอกสารทั่วไป': { color: '#64748b', icon: 'file-alt' },
  'รอใบกำกับฯ 7%': { color: '#ef4444', icon: 'history' },
  'ใบกำกับภาษี 7%': { color: '#059669', icon: 'check-circle' },
  'ใบสำคัญจ่าย': { color: '#0891b2', icon: 'file-invoice-dollar' },
  'ใบเสร็จรับเงิน': { color: '#06b6d4', icon: 'receipt' },
  'ชุดชำระเงิน': { color: '#a855f7', icon: 'money-check-alt' },
};

// นับวันตั้งแต่ finance_received_at เทียบ 30 วัน (เทียบเท่า "กำหนดติดตาม")
function followupMeta(d: DocumentItem): { text: string; fg: string; bg: string } | null {
  if (!d.financeReceivedAtShow) return null;
  if (d.accountingReceive.received) return { text: 'รับใบกำกับแล้ว', fg: '#059669', bg: '#ecfdf5' };
  // mock: ใช้ index สุ่มจากวันที่โชว์เป็นตัวเลขวันคงเหลือ (ไม่ได้ผูกวันที่จริงเพื่อความง่าย)
  const daysLeftMock = (d.id * 7) % 40 - 5;
  if (daysLeftMock < 0) return { text: `เกินกำหนด ${Math.abs(daysLeftMock)} วัน`, fg: '#dc2626', bg: '#fef2f2' };
  return { text: `เหลือ ${daysLeftMock} วัน`, fg: '#2563eb', bg: '#eff6ff' };
}

// ====================================================================
// Main screen
// ====================================================================

export default function DocumentDashboardScreen({ onBack }: DocumentDashboardScreenProps) {
  const [docs, setDocs] = useState<DocumentItem[]>(MOCK_DOCUMENTS);

  // 🌟 [เพิ่มใหม่] สลับไปหน้า SubmitDocumentScreen (สร้างใหม่/แก้ไข) เองภายในไฟล์นี้
  const [submitScreen, setSubmitScreen] = useState<{ visible: boolean; docId?: string }>({ visible: false });
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | 'pending_approve' | 'approved' | 'pending_finance' | 'finance_received' | 'returned' | 'cancelled'>('all');
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | DocType>('all');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // 🌟 [เพิ่มใหม่] ตัวกรองที่เคยตกหล่นไป — ตรงกับแถบปุ่มกรองด่วนของต้นฉบับ (buildFilterUrl)
  const [specialFilter, setSpecialFilter] = useState<'none' | 'urgent' | 'overdue' | 'taxdone' | 'creditAlert'>('none');
  const [amountRange, setAmountRange] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [voidPanelOpen, setVoidPanelOpen] = useState(false);

  const [approveModal, setApproveModal] = useState<{ visible: boolean; doc?: DocumentItem }>({ visible: false });
  const [financeModal, setFinanceModal] = useState<{ visible: boolean; doc?: DocumentItem }>({ visible: false });
  const [noteModal, setNoteModal] = useState<{ visible: boolean; doc?: DocumentItem; text: string }>({ visible: false, text: '' });
  const [returnModal, setReturnModal] = useState<{ visible: boolean; doc?: DocumentItem; text: string }>({ visible: false, text: '' });
  const [creditModal, setCreditModal] = useState<{ visible: boolean; doc?: DocumentItem }>({ visible: false });
  const [refundModal, setRefundModal] = useState<{ visible: boolean; doc?: DocumentItem; date: string; note: string }>({ visible: false, date: '', note: '' });
  const [deptModal, setDeptModal] = useState<{ visible: boolean; doc?: DocumentItem; dept?: DeptKey; invNo: string; note: string }>({ visible: false, invNo: '', note: '' });
  const [historyModal, setHistoryModal] = useState<{ visible: boolean; doc?: DocumentItem }>({ visible: false });

  // 🌟 [เพิ่มใหม่] modal ส่งออก Excel — ฟิลด์ตรงกับ modal_export ของต้นฉบับ (ผู้ทำรายการ/
  // ประเภทเอกสาร/การแนบสลิป/ช่วงวันที่) ต่างจากตัวกรองหน้าหลักด้านบน (คนละชุดกัน)
  const [exportModal, setExportModal] = useState<{
    visible: boolean;
    orderedBy: string;
    docType: 'all' | DocType;
    slip: 'all' | 'any' | 'normal' | 'full' | 'both' | 'none';
    startDate: string;
    endDate: string;
  }>({ visible: false, orderedBy: '', docType: 'all', slip: 'all', startDate: '', endDate: '' });
  const [exporting, setExporting] = useState(false);

  const kpis = useMemo(() => {
    const active = docs.filter((d) => !d.isCancelled);
    const pendingApprove = active.filter((d) => !d.approverName).length;
    const approved = active.filter((d) => !!d.approverName).length;
    const pendingFinance = active.filter((d) => !!d.approverName && !d.financeReceiver).length;
    const financeReceived = active.filter((d) => !!d.financeReceiver).length;
    const totalMoney = active.reduce((s, d) => s + d.amount, 0);
    const byExtra = (t: ExtraType) => {
      const list = active.filter((d) => d.extraType === t);
      return { count: list.length, amount: list.reduce((s, d) => s + d.amount, 0) };
    };
    // 🌟 [เพิ่มใหม่] ตัวนับของปุ่มกรองด่วนที่เคยตกหล่นไป
    const urgentCount = active.filter((d) => d.extraType === 'รอใบกำกับฯ 7%').length;
    const overdueCount = active.filter((d) => d.overdueFollowup && !d.accountingReceive.received).length;
    const taxdoneCount = active.filter((d) => d.accountingReceive.received).length;
    const creditAlertCount = active.filter((d) => d.creditAlert && !!d.creditTerm).length;
    const returnedCount = docs.filter((d) => d.isReturned).length;
    const cancelledDocs = docs.filter((d) => d.isCancelled);
    const cancelledCount = cancelledDocs.length;
    const cancelledAmount = cancelledDocs.reduce((s, d) => s + d.amount, 0);
    return {
      totalMoney,
      totalJobs: active.length,
      pendingApprove,
      approved,
      pendingFinance,
      financeReceived,
      pv: byExtra('ใบสำคัญจ่าย'),
      vat: byExtra('ใบกำกับภาษี 7%'),
      wait: byExtra('รอใบกำกับฯ 7%'),
      receipt: byExtra('ใบเสร็จรับเงิน'),
      paymentSet: byExtra('ชุดชำระเงิน'),
      urgentCount,
      overdueCount,
      taxdoneCount,
      creditAlertCount,
      returnedCount,
      cancelledCount,
      cancelledAmount,
    };
  }, [docs]);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (docTypeFilter !== 'all' && d.docType !== docTypeFilter) return false;
      if (stageFilter !== 'all') {
        if (stageFilter === 'approved' && !d.approverName) return false;
        else if (stageFilter === 'pending_approve' && d.approverName) return false;
        else if (stageFilter === 'pending_finance' && (!d.approverName || d.financeReceiver)) return false;
        else if (stageFilter === 'finance_received' && !d.financeReceiver) return false;
        else if (stageFilter === 'returned' && !d.isReturned) return false;
        else if (stageFilter === 'cancelled' && !d.isCancelled) return false;
      }
      // 🌟 ซ่อนรายการที่ถูกยกเลิกออกจากทุกมุมมอง เว้นแต่กำลังดู "ประวัติการยกเลิก" (status=cancelled)
      // โดยเฉพาะ — ตรงกับเงื่อนไข if ($filter_status !== 'cancelled') ของต้นฉบับเป๊ะ
      if (stageFilter !== 'cancelled' && d.isCancelled) return false;
      // 🌟 [เพิ่มใหม่] ปุ่มกรองพิเศษ (คนละมิติกับ stageFilter — AND กัน ตรงกับ special_clauses ของต้นฉบับ)
      if (specialFilter === 'urgent' && d.extraType !== 'รอใบกำกับฯ 7%') return false;
      if (specialFilter === 'overdue' && !(d.overdueFollowup && !d.accountingReceive.received)) return false;
      if (specialFilter === 'taxdone' && !d.accountingReceive.received) return false;
      if (specialFilter === 'creditAlert' && !(d.creditAlert && !!d.creditTerm)) return false;
      // 🌟 [เพิ่มใหม่] ช่วงยอดเงิน
      if (amountRange === 'low' && d.amount > 10000) return false;
      if (amountRange === 'medium' && (d.amount <= 10000 || d.amount > 100000)) return false;
      if (amountRange === 'high' && d.amount <= 100000) return false;
      // 🌟 [เพิ่มใหม่] ช่วงวันที่ (เทียบกับวันที่สร้างเอกสาร)
      if (startDateFilter.trim()) {
        const from = dateSortKey(startDateFilter.trim());
        if (from > 0 && dateSortKey(d.createdAtShow) < from) return false;
      }
      if (endDateFilter.trim()) {
        const to = dateSortKey(endDateFilter.trim());
        if (to > 0 && dateSortKey(d.createdAtShow) > to) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${d.docNumber} ${d.company} ${d.supplierName} ${d.jobSite} ${d.orderedBy}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [docs, search, stageFilter, docTypeFilter, specialFilter, amountRange, startDateFilter, endDateFilter]);

  // 🌟 [เพิ่มใหม่] ปุ่ม "ค่าเริ่มต้น" — เคลียร์ตัวกรองทั้งหมดกลับสู่ค่าเริ่มต้น
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

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateDoc(id: number, patch: Partial<DocumentItem>) {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  // -------------------- Action handlers (mock) --------------------

  function confirmApprove() {
    const doc = approveModal.doc;
    if (!doc) return;
    updateDoc(doc.id, { approverName: CURRENT_USER, approvedAtShow: 'เมื่อสักครู่' });
    setApproveModal({ visible: false });
  }

  function confirmFinance() {
    const doc = financeModal.doc;
    if (!doc) return;
    updateDoc(doc.id, { financeReceiver: CURRENT_USER, financeReceivedAtShow: 'เมื่อสักครู่', slipCount: doc.slipCount + 1 });
    setFinanceModal({ visible: false });
    Alert.alert('บันทึกสำเร็จ (mock)', 'ลงรับเอกสารเรียบร้อย — การแนบไฟล์สลิปจริงต้องเพิ่ม expo-document-picker');
  }

  function confirmNote() {
    const doc = noteModal.doc;
    if (!doc) return;
    updateDoc(doc.id, { noteGeneral: noteModal.text });
    setNoteModal({ visible: false, text: '' });
  }

  function confirmReturn() {
    const doc = returnModal.doc;
    if (!doc) return;
    if (!doc.isReturned && !returnModal.text.trim()) {
      Alert.alert('กรุณาระบุหมายเหตุ', 'ต้องกรอกเหตุผลที่ตีกลับเอกสารก่อนยืนยัน');
      return;
    }
    updateDoc(doc.id, { isReturned: !doc.isReturned, returnRemark: !doc.isReturned ? returnModal.text.trim() : undefined });
    setReturnModal({ visible: false, text: '' });
  }

  function confirmCredit(days: number) {
    const doc = creditModal.doc;
    if (!doc) return;
    updateDoc(doc.id, { creditTerm: days });
    setCreditModal({ visible: false });
  }

  function confirmRefund() {
    const doc = refundModal.doc;
    if (!doc) return;
    if (!refundModal.date.trim()) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุวันที่คืนเงิน');
      return;
    }
    updateDoc(doc.id, { refundDone: true, refundDate: refundModal.date.trim(), refundNote: refundModal.note.trim() });
    setRefundModal({ visible: false, date: '', note: '' });
  }

  function confirmDeptReceive() {
    const { doc, dept, invNo, note } = deptModal;
    if (!doc || !dept) return;
    if (!invNo.trim()) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุเลขที่ใบกำกับอย่างน้อย 1 เลข');
      return;
    }
    const key = dept === 'warehouse' ? 'warehouseReceive' : dept === 'purchase' ? 'purchaseReceive' : 'accountingReceive';
    updateDoc(doc.id, { [key]: { received: true, receiver: CURRENT_USER, invoiceNumbers: [invNo.trim()], note: note.trim() } } as Partial<DocumentItem>);
    setDeptModal({ visible: false, invNo: '', note: '' });
  }

  function stubFeature(name: string, detail: string) {
    Alert.alert(name, detail);
  }

  // 🌟 [เพิ่มใหม่] Export Excel จริง — ตรงกับ modal_export + triggerExport() ของต้นฉบับ
  // (ต้นฉบับสร้างไฟล์ฝั่งเซิร์ฟเวอร์แล้วให้เบราว์เซอร์ดาวน์โหลด มือถือไม่มีแนวคิด "โฟลเดอร์ดาวน์โหลด"
  // แบบเดียวกัน จึงเขียนไฟล์ลงเครื่องด้วย expo-file-system แล้วเปิดแผงแชร์/บันทึกด้วย expo-sharing แทน)

  const orderedByOptions = useMemo(() => Array.from(new Set(docs.map((d) => d.orderedBy))).sort(), [docs]);

  // แปลง "dd/mm/yyyy" (ปี พ.ศ. หรือ ค.ศ. ก็ได้ เทียบแบบ string ตรงๆ ไม่ต้องแปลงปฏิทิน) เป็นตัวเลขเทียบลำดับได้
  function dateSortKey(dstr: string): number {
    const m = dstr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return 0;
    const [, dd, mm, yyyy] = m;
    return parseInt(yyyy, 10) * 10000 + parseInt(mm, 10) * 100 + parseInt(dd, 10);
  }

  function docMatchesExportFilters(d: DocumentItem): boolean {
    if (exportModal.orderedBy && d.orderedBy !== exportModal.orderedBy) return false;
    if (exportModal.docType !== 'all' && d.docType !== exportModal.docType) return false;
    if (exportModal.slip !== 'all') {
      const hasNormal = d.slipCount > 0;
      const hasFull = d.slipFullCount > 0;
      if (exportModal.slip === 'any' && !hasNormal && !hasFull) return false;
      if (exportModal.slip === 'normal' && !hasNormal) return false;
      if (exportModal.slip === 'full' && !hasFull) return false;
      if (exportModal.slip === 'both' && !(hasNormal && hasFull)) return false;
      if (exportModal.slip === 'none' && (hasNormal || hasFull)) return false;
    }
    if (exportModal.startDate.trim()) {
      const from = dateSortKey(exportModal.startDate.trim());
      if (from > 0 && dateSortKey(d.createdAtShow) < from) return false;
    }
    if (exportModal.endDate.trim()) {
      const to = dateSortKey(exportModal.endDate.trim());
      if (to > 0 && dateSortKey(d.createdAtShow) > to) return false;
    }
    return true;
  }

  // แถวข้อมูลในไฟล์ Excel — คอลัมน์ตรงกับตารางบนหน้าจอทุกช่อง (ตามที่ขอ "เหมือนในเว็บเลย")
  function buildExportRows(list: DocumentItem[]) {
    return list.map((d) => ({
      'บริษัท': d.company,
      'วันที่': `${d.createdAtShow} ${d.createdTimeShow}`,
      'ประเภทเอกสาร': d.docType,
      'เลขที่เอกสาร': d.docNumber,
      'ผู้สั่ง/ผู้เปิด': d.orderedBy,
      'หน้างาน': d.jobSite,
      'ซัพพลายเออร์': d.supplierName,
      'ธนาคาร': d.bankName ?? '',
      'เลขบัญชี': d.bankAccount ?? '',
      'ยอดเงิน': d.amount,
      'สถานะอนุมัติ': d.approverName ? `อนุมัติโดย ${d.approverName} (${d.approvedAtShow ?? '-'})` : 'รออนุมัติ',
      'การเงินรับเอกสาร': d.financeReceiver ? `${d.financeReceiver} (${d.financeReceivedAtShow ?? '-'})` : 'รอการเงิน',
      'จำนวนสลิป (ปกติ/เต็ม)': `${d.slipCount}/${d.slipFullCount}`,
      'ตีกลับเอกสาร': d.isReturned ? `ตีกลับ - ${d.returnRemark ?? ''}` : '-',
      'คลัง (รับใบกำกับ)': d.warehouseReceive.received ? `รับแล้ว (${d.warehouseReceive.invoiceNumbers.join(', ')})` : 'ยังไม่รับ',
      'จัดซื้อ (รับใบกำกับ)': d.purchaseReceive.received ? `รับแล้ว (${d.purchaseReceive.invoiceNumbers.join(', ')})` : 'ยังไม่รับ',
      'บัญชี (รับใบกำกับ)': d.accountingReceive.received ? `รับแล้ว (${d.accountingReceive.invoiceNumbers.join(', ')})` : 'ยังไม่รับ',
      'ตีกลับใบกำกับภาษี': d.isTaxReturned ? 'ตีกลับ' : '-',
      'เครดิต (วัน)': d.creditTerm ?? '',
      'คืนเงินจากซัพพลายเออร์': d.refundDone ? `คืนแล้ว ${d.refundDate ?? ''} - ${d.refundNote ?? ''}` : 'ยังไม่คืน',
      'ประเภทเอกสารเพิ่มเติม': d.extraType,
      'สถานะยกเลิก': d.isCancelled ? `ยกเลิก - ${d.cancelReason ?? ''}` : 'ปกติ',
      'หมายเหตุ': d.noteGeneral ?? '',
    }));
  }

  async function handleExportConfirm() {
    const matched = docs.filter(docMatchesExportFilters);
    if (matched.length === 0) {
      Alert.alert('ไม่มีข้อมูล', 'ไม่พบเอกสารที่ตรงกับเงื่อนไขที่เลือก');
      return;
    }
    setExporting(true);
    try {
      // TODO: ต่อ backend จริง -> ถ้าอยากได้ข้อมูลทุกหน้า (ไม่ใช่แค่ที่โหลดในเครื่อง) ต้องยิง API
      // ดึงชุดข้อมูลตามตัวกรองเดียวกันนี้ก่อน ตรงนี้ export จาก state ในเครื่อง (mock) เท่านั้น
      const rows = buildExportRows(matched);
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ทะเบียนคุมเอกสาร');

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileName = `DocumentDashboard_${Date.now()}.xlsx`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'บันทึก/แชร์ไฟล์ Excel',
          UTI: 'com.microsoft.excel.xlsx',
        });
      } else {
        Alert.alert('สร้างไฟล์สำเร็จ', `บันทึกไฟล์ไว้ที่:\n${fileUri}\n(เปิดแชร์ไม่ได้ในอุปกรณ์นี้)`);
      }
      setExportModal((s) => ({ ...s, visible: false }));
    } catch (err: any) {
      Alert.alert('ส่งออกไม่สำเร็จ', err?.message ?? 'เกิดข้อผิดพลาดระหว่างสร้างไฟล์ Excel');
    } finally {
      setExporting(false);
    }
  }

  // -------------------- Render --------------------

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
          <TouchableOpacity style={styles.addDocBtn} onPress={() => setSubmitScreen({ visible: true, docId: undefined })}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addDocBtnText}>เพิ่มเอกสาร</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.voidHistoryBtn} onPress={() => setVoidPanelOpen((v) => !v)}>
          <View style={styles.voidHistoryIconWrap}>
            <Ionicons name="time-outline" size={12} color="#ef4444" />
          </View>
          <Text style={styles.voidHistoryBtnText}>ประวัติการยกเลิก</Text>
          {kpis.cancelledCount > 0 && (
            <View style={styles.voidHistoryBadge}>
              <Text style={styles.voidHistoryBadgeText}>{kpis.cancelledCount}</Text>
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
                {kpis.cancelledCount} <Text style={styles.voidPanelCountUnit}>รายการ</Text>
              </Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.voidPanelAmountLabel}>ยอดรวมมูลค่า</Text>
                <Text style={styles.voidPanelAmountValue}>฿{num(kpis.cancelledAmount)}</Text>
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
            <Text style={styles.totalCardValue}>{num(kpis.totalMoney)} ฿</Text>
            <Text style={styles.totalCardSub}>รวม {kpis.totalJobs} รายการ</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pipelineRow}>
          <PipelineCard label="รออนุมัติ" value={kpis.pendingApprove} color="#f59e0b" icon="create-outline" active={stageFilter === 'pending_approve'} onPress={() => setStageFilter('pending_approve')} />
          <PipelineCard label="อนุมัติแล้ว" value={kpis.approved} color="#10b981" icon="checkmark-circle-outline" active={stageFilter === 'approved'} onPress={() => setStageFilter('approved')} />
          <PipelineCard label="รอการเงิน" value={kpis.pendingFinance} color="#3b82f6" icon="time-outline" active={stageFilter === 'pending_finance'} onPress={() => setStageFilter('pending_finance')} />
          <PipelineCard label="รับเอกสารแล้ว" value={kpis.financeReceived} color="#8b5cf6" icon="wallet-outline" active={stageFilter === 'finance_received'} onPress={() => setStageFilter('finance_received')} />
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.extraRow}>
          <ExtraCard label="ใบสำคัญจ่าย" count={kpis.pv.count} amount={kpis.pv.amount} icon="file-invoice-dollar" color="#0891b2" />
          <ExtraCard label="ใบกำกับ 7%" count={kpis.vat.count} amount={kpis.vat.amount} icon="check-circle" color="#059669" />
          <ExtraCard label="รอใบกำกับ" count={kpis.wait.count} amount={kpis.wait.amount} icon="history" color="#ef4444" />
          <ExtraCard label="ใบเสร็จรับเงิน" count={kpis.receipt.count} amount={kpis.receipt.amount} icon="receipt" color="#06b6d4" />
          <ExtraCard label="ชุดชำระเงิน" count={kpis.paymentSet.count} amount={kpis.paymentSet.amount} icon="money-check-alt" color="#a855f7" />
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
            {kpis.urgentCount > 0 && (
              <View style={[styles.specialChipBadge, specialFilter === 'urgent' && { backgroundColor: '#fff' }]}>
                <Text style={[styles.specialChipBadgeText, specialFilter === 'urgent' && { color: '#ef4444' }]}>{kpis.urgentCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.specialChip, specialFilter === 'overdue' && { backgroundColor: '#ef4444', borderColor: '#ef4444' }]}
            onPress={() => setSpecialFilter((f) => (f === 'overdue' ? 'none' : 'overdue'))}
          >
            <Ionicons name="calendar-clear" size={12} color={specialFilter === 'overdue' ? '#fff' : '#ef4444'} />
            <Text style={[styles.specialChipText, { color: specialFilter === 'overdue' ? '#fff' : '#ef4444' }]}>เกินกำหนดติดตาม</Text>
            {kpis.overdueCount > 0 && (
              <View style={[styles.specialChipBadge, { backgroundColor: specialFilter === 'overdue' ? '#fff' : '#ef4444' }]}>
                <Text style={[styles.specialChipBadgeText, { color: specialFilter === 'overdue' ? '#ef4444' : '#fff' }]}>{kpis.overdueCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.specialChip, specialFilter === 'taxdone' && { backgroundColor: '#059669', borderColor: '#059669' }]}
            onPress={() => setSpecialFilter((f) => (f === 'taxdone' ? 'none' : 'taxdone'))}
          >
            <Ionicons name="checkmark-circle" size={12} color={specialFilter === 'taxdone' ? '#fff' : '#059669'} />
            <Text style={[styles.specialChipText, { color: specialFilter === 'taxdone' ? '#fff' : '#059669' }]}>รับใบกำกับแล้ว</Text>
            {kpis.taxdoneCount > 0 && (
              <View style={[styles.specialChipBadge, { backgroundColor: specialFilter === 'taxdone' ? '#fff' : '#059669' }]}>
                <Text style={[styles.specialChipBadgeText, { color: specialFilter === 'taxdone' ? '#059669' : '#fff' }]}>{kpis.taxdoneCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.specialChip, styles.specialChipCredit, specialFilter === 'creditAlert' && styles.specialChipCreditActive]}
            onPress={() => setSpecialFilter((f) => (f === 'creditAlert' ? 'none' : 'creditAlert'))}
          >
            <Ionicons name="warning" size={12} color={specialFilter === 'creditAlert' ? '#fff' : '#d97706'} />
            <Text style={[styles.specialChipText, { color: specialFilter === 'creditAlert' ? '#fff' : '#d97706' }]}>เครดิตใกล้หมด</Text>
            {kpis.creditAlertCount > 0 && (
              <View style={[styles.specialChipBadge, { backgroundColor: specialFilter === 'creditAlert' ? '#fff' : '#d97706' }]}>
                <Text style={[styles.specialChipBadgeText, { color: specialFilter === 'creditAlert' ? '#d97706' : '#fff' }]}>{kpis.creditAlertCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.specialChipSolid, stageFilter === 'returned' && styles.specialChipSolidActive]}
            onPress={() => setStageFilter((f) => (f === 'returned' ? 'all' : 'returned'))}
          >
            <Ionicons name="arrow-undo" size={12} color="#fff" />
            <Text style={styles.specialChipSolidText}>ตีกลับ (แก้ไข)</Text>
            {kpis.returnedCount > 0 && (
              <View style={styles.specialChipSolidBadge}>
                <Text style={styles.specialChipSolidBadgeText}>{kpis.returnedCount}</Text>
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

        <Text style={styles.resultCount}>แสดง {filtered.length} จาก {docs.length} เอกสาร</Text>
      </View>
    );
  }

  function renderCard({ item: d }: { item: DocumentItem }) {
    const stage = STAGE_META[stageOf(d)];
    const extra = EXTRA_META[d.extraType];
    const fu = followupMeta(d);
    const expanded = expandedIds.has(d.id);

    return (
      <View style={[styles.card, d.isCancelled && styles.cardCancelled]}>
        {d.isCancelled && (
          <View style={styles.cancelRibbon}>
            <Ionicons name="ban" size={11} color="#fff" />
            <Text style={styles.cancelRibbonText}>ยกเลิกแล้ว{d.cancelReason ? ` — ${d.cancelReason}` : ''}</Text>
          </View>
        )}

        <View style={styles.cardTopRow}>
          <Text style={styles.companyText}>{d.company}</Text>
          <View style={styles.docTypeBadge}>
            <Text style={styles.docTypeBadgeText}>{d.docType}-{d.docNumber.replace(/^(PO|AX)-/, '')}</Text>
          </View>
        </View>
        <Text style={styles.dateText}>{d.createdAtShow} · {d.createdTimeShow} น.</Text>

        <View style={styles.metaRow}>
          <Ionicons name="person-outline" size={11} color="#94a3b8" />
          <Text style={styles.metaText}>{d.orderedBy}</Text>
          <Ionicons name="business-outline" size={11} color="#94a3b8" style={{ marginLeft: 8 }} />
          <Text style={styles.metaText}>{d.jobSite}</Text>
        </View>

        <View style={styles.supplierBox}>
          <Text style={styles.supplierName}>{d.supplierName}</Text>
          {!!d.bankName && (
            <Text style={styles.bankText}>
              🏦 {d.bankName} {!!d.bankAccount && `· ${d.bankAccount}`}
            </Text>
          )}
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.amountValue}>{num(d.amount)} ฿</Text>
          <TouchableOpacity style={[styles.extraBadge, { backgroundColor: extra.color + '18' }]} onPress={() => toggleExpand(d.id)}>
            <FontAwesome5 name={extra.icon} size={9} color={extra.color} />
            <Text style={[styles.extraBadgeText, { color: extra.color }]} numberOfLines={1}>
              {d.extraType}
            </Text>
          </TouchableOpacity>
        </View>

        {!d.isCancelled && (
          <TouchableOpacity
            style={[styles.stageBadge, { backgroundColor: stage.bg }]}
            onPress={() => {
              if (stageOf(d) === 'pending_approve') setApproveModal({ visible: true, doc: d });
              else if (stageOf(d) === 'pending_finance') setFinanceModal({ visible: true, doc: d });
              else Alert.alert('รับเอกสารแล้ว', `การเงินรับเอกสารโดย ${d.financeReceiver} เมื่อ ${d.financeReceivedAtShow}`);
            }}
          >
            <Ionicons name={stage.icon} size={13} color={stage.fg} />
            <Text style={[styles.stageBadgeText, { color: stage.fg }]}>{stage.label}</Text>
          </TouchableOpacity>
        )}

        {/* 🌟 [แก้ไข] แยกเป็น 2 ปุ่มชัดเจน (แนบสลิปปกติ / แนบสลิปเต็ม) ตรงกับต้นฉบับ แทนที่จะรวม
            เป็น pill เดียว — ต้นฉบับให้กดแนบแยกกันได้อิสระ ไม่ต้องรอครบคู่ */}
        {!d.isCancelled && stageOf(d) === 'finance_received' && (
          <View style={styles.slipBtnRow}>
            <TouchableOpacity
              style={[styles.slipBtn, d.slipCount > 0 ? styles.slipBtnFilled : styles.slipBtnEmpty]}
              onPress={() => setFinanceModal({ visible: true, doc: d })}
            >
              <Ionicons name={d.slipCount > 0 ? 'document-text' : 'cloud-upload-outline'} size={12} color={d.slipCount > 0 ? '#047857' : '#ef4444'} />
              <Text style={[styles.slipBtnText, { color: d.slipCount > 0 ? '#047857' : '#ef4444' }]} numberOfLines={1}>
                {d.slipCount > 0 ? `ดู/แก้ไขสลิปปกติ (${d.slipCount})` : 'แนบสลิปปกติ'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.slipBtn, d.slipFullCount > 0 ? styles.slipBtnFilledBlue : styles.slipBtnEmpty]}
              onPress={() => setFinanceModal({ visible: true, doc: d })}
            >
              <Ionicons name={d.slipFullCount > 0 ? 'document-attach' : 'cloud-upload-outline'} size={12} color={d.slipFullCount > 0 ? '#1e3a8a' : '#ef4444'} />
              <Text style={[styles.slipBtnText, { color: d.slipFullCount > 0 ? '#1e3a8a' : '#ef4444' }]} numberOfLines={1}>
                {d.slipFullCount > 0 ? `ดู/แก้ไขสลิปเต็ม (${d.slipFullCount})` : 'แนบสลิปเต็ม'}
              </Text>
            </TouchableOpacity>
          </View>
        )}


        <TouchableOpacity onPress={() => toggleExpand(d.id)} style={styles.expandToggle}>
          <Text style={styles.expandToggleText}>{expanded ? 'ย่อรายละเอียด' : 'ดูรายละเอียดเพิ่มเติม'}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color="#475569" />
        </TouchableOpacity>

        {expanded && !d.isCancelled && (
          <View style={styles.expandBody}>
            {fu && (
              <View style={[styles.infoLine, { backgroundColor: fu.bg }]}>
                <Text style={[styles.infoLineLabel, { color: fu.fg }]}>กำหนดติดตาม (30 วัน)</Text>
                <Text style={[styles.infoLineValue, { color: fu.fg }]}>{fu.text}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.infoLine, d.isReturned ? styles.infoLineDanger : styles.infoLineNeutral]}
              onPress={() => setReturnModal({ visible: true, doc: d, text: d.returnRemark ?? '' })}
            >
              <Text style={[styles.infoLineLabel, d.isReturned && { color: '#dc2626' }]}>ตีกลับเอกสาร (ตั้งโอน)</Text>
              <Text style={[styles.infoLineValue, d.isReturned && { color: '#dc2626' }]}>{d.isReturned ? `ตีกลับแล้ว — ${d.returnRemark}` : 'ยังไม่ตีกลับ'}</Text>
            </TouchableOpacity>

            <Text style={styles.deptSectionLabel}>รับใบกำกับภาษี 3 แผนก</Text>
            {(() => {
              // 🌟 [แก้ไข] ปุ่มรับใบกำกับ 3 แผนกนี้ใช้ได้เฉพาะเอกสารประเภทใบกำกับภาษีเท่านั้น
              // (extraType เป็น 'ใบกำกับภาษี 7%' หรือ 'รอใบกำกับฯ 7%') — เอกสารประเภทอื่น
              // (เช่นใบสำคัญจ่าย/ใบเสร็จ) ไม่เกี่ยวข้องกับคอลัมน์นี้เลย ต้นฉบับโชว์แค่ "-"
              const isTaxDoc = d.extraType === 'ใบกำกับภาษี 7%' || d.extraType === 'รอใบกำกับฯ 7%';
              if (!isTaxDoc) {
                return <Text style={styles.deptNaText}>— ไม่ใช่เอกสารประเภทใบกำกับภาษี —</Text>;
              }
              return (
                <View style={styles.deptRow}>
                  {(['warehouse', 'purchase', 'accounting'] as DeptKey[]).map((key) => {
                    const dept = key === 'warehouse' ? d.warehouseReceive : key === 'purchase' ? d.purchaseReceive : d.accountingReceive;
                    const meta = DEPT_META[key];
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.deptChip, dept.received ? { backgroundColor: meta.color + '18', borderColor: meta.color } : styles.deptChipEmpty]}
                        onPress={() =>
                          dept.received
                            ? Alert.alert(`${meta.label}รับใบกำกับแล้ว`, `ผู้รับ: ${dept.receiver}\nเลขที่: ${dept.invoiceNumbers.join(', ')}`, [
                                { text: 'ปิด', style: 'cancel' },
                                {
                                  text: 'ยกเลิกการรับ',
                                  style: 'destructive',
                                  onPress: () => {
                                    const key2 = key === 'warehouse' ? 'warehouseReceive' : key === 'purchase' ? 'purchaseReceive' : 'accountingReceive';
                                    updateDoc(d.id, { [key2]: mkDept() } as Partial<DocumentItem>);
                                  },
                                },
                              ])
                            : setDeptModal({ visible: true, doc: d, dept: key, invNo: '', note: '' })
                        }
                      >
                        <Ionicons name={meta.icon} size={13} color={dept.received ? meta.color : '#94a3b8'} />
                        <Text style={[styles.deptChipText, { color: dept.received ? meta.color : '#94a3b8' }]}>{meta.label}</Text>
                        <Ionicons name={dept.received ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={dept.received ? meta.color : '#cbd5e1'} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })()}

            <TouchableOpacity
              style={[styles.infoLine, d.isTaxReturned ? styles.infoLineDanger : styles.infoLineNeutral]}
              onPress={() => updateDoc(d.id, { isTaxReturned: !d.isTaxReturned })}
            >
              <Text style={[styles.infoLineLabel, d.isTaxReturned && { color: '#dc2626' }]}>ตีกลับใบกำกับภาษี</Text>
              <Text style={[styles.infoLineValue, d.isTaxReturned && { color: '#dc2626' }]}>{d.isTaxReturned ? 'ตีกลับแล้ว' : 'ปกติ'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.infoLine} onPress={() => setCreditModal({ visible: true, doc: d })}>
              <Text style={styles.infoLineLabel}>เครดิต</Text>
              <Text style={styles.infoLineValue}>{d.creditTerm ? `${d.creditTerm} วัน` : 'ยังไม่ระบุ — แตะเพื่อตั้งค่า'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.infoLine, d.refundDone && { backgroundColor: '#ecfdf5' }]}
              onPress={() => setRefundModal({ visible: true, doc: d, date: d.refundDate ?? '', note: d.refundNote ?? '' })}
            >
              <Text style={[styles.infoLineLabel, d.refundDone && { color: '#059669' }]}>คืนเงินจากซัพพลายเออร์</Text>
              <Text style={[styles.infoLineValue, d.refundDone && { color: '#059669' }]}>{d.refundDone ? `คืนแล้ว ${d.refundDate}` : 'ยังไม่คืน'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.infoLine} onPress={() => setNoteModal({ visible: true, doc: d, text: d.noteGeneral ?? '' })}>
              <Text style={styles.infoLineLabel}>หมายเหตุ</Text>
              <Text style={styles.infoLineValue} numberOfLines={2}>
                {d.noteGeneral || 'แตะเพื่อบันทึกหมายเหตุ'}
              </Text>
            </TouchableOpacity>

            <View style={styles.moreActionsRow}>
              <TouchableOpacity style={styles.moreActionBtn} onPress={() => setHistoryModal({ visible: true, doc: d })}>
                <Ionicons name="time-outline" size={13} color="#475569" />
                <Text style={styles.moreActionBtnText}>ประวัติ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moreActionBtn} onPress={() => setSubmitScreen({ visible: true, docId: String(d.id) })}>
                <Ionicons name="create-outline" size={13} color="#0ea5e9" />
                <Text style={[styles.moreActionBtnText, { color: '#0ea5e9' }]}>แก้ไข</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moreActionBtn} onPress={() => stubFeature('ยกเลิกเอกสาร', 'ต้องมีระบบขออนุมัติยกเลิกซ้อน — ยังไม่ได้ทำในรอบนี้')}>
                <Ionicons name="close-circle-outline" size={13} color="#ef4444" />
                <Text style={[styles.moreActionBtnText, { color: '#ef4444' }]}>ยกเลิก</Text>
              </TouchableOpacity>
              {/* 🌟 [แก้ไข] "คลังรับสินค้า" กับ "บิล/จ่ายเงิน" โชว์เฉพาะเอกสารที่มีเครดิต (has_credit)
                  เท่านั้น ตรงกับต้นฉบับเป๊ะ — เอกสารเงินสดทั่วไปไม่มี 2 ปุ่มนี้ */}
              {!!d.creditTerm && (
                <>
                  <TouchableOpacity style={styles.moreActionBtn} onPress={() => stubFeature('คลังรับสินค้า', 'ฟอร์มแยกทั้งหน้า — ยังไม่ได้ทำในรอบนี้')}>
                    <Ionicons name="cube-outline" size={13} color="#d97706" />
                    <Text style={[styles.moreActionBtnText, { color: '#d97706' }]}>คลังรับสินค้า</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.moreActionBtn} onPress={() => stubFeature('ข้อมูลบิล & การจ่ายเงิน', 'ฟอร์มแยกทั้งหน้า — ยังไม่ได้ทำในรอบนี้')}>
                    <Ionicons name="document-text-outline" size={13} color="#4f46e5" />
                    <Text style={[styles.moreActionBtnText, { color: '#4f46e5' }]}>บิล/จ่ายเงิน</Text>
                  </TouchableOpacity>
                </>
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
        docId={submitScreen.docId}
        onBack={() => setSubmitScreen({ visible: false })}
        onSaved={() => setSubmitScreen({ visible: false })}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={filtered}
        keyExtractor={(d) => String(d.id)}
        renderItem={renderCard}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={
          <TouchableOpacity style={styles.exportBtn} onPress={() => setExportModal((s) => ({ ...s, visible: true }))}>
            <Ionicons name="download-outline" size={14} color="#475569" />
            <Text style={styles.exportBtnText}>ส่งออกข้อมูล (Excel)</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="folder-open-outline" size={26} color="#cbd5e1" />
            <Text style={styles.emptyText}>ไม่พบเอกสารที่ตรงกับเงื่อนไข</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />

      {/* Modal: อนุมัติ */}
      <ModalShell visible={approveModal.visible} title="✍️ ลงนามผู้อนุมัติ" color="#4f46e5" onClose={() => setApproveModal({ visible: false })}>
        <FieldLabel text="ผู้อนุมัติ" />
        <View style={styles.readonlyInput}>
          <Text style={styles.readonlyInputText}>{CURRENT_USER}</Text>
        </View>
        <Text style={styles.hintText}>ระบบจะบันทึกเวลาปัจจุบันให้อัตโนมัติ</Text>
        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#4f46e5' }]} onPress={confirmApprove}>
          <Text style={styles.modalSaveBtnText}>ยืนยัน</Text>
        </TouchableOpacity>
      </ModalShell>

      {/* Modal: การเงินรับเอกสาร */}
      <ModalShell visible={financeModal.visible} title="💰 ลงรับเอกสาร / แนบสลิป" color="#d97706" onClose={() => setFinanceModal({ visible: false })}>
        <FieldLabel text="ผู้ทำรายการ" />
        <View style={styles.readonlyInput}>
          <Text style={styles.readonlyInputText}>{CURRENT_USER}</Text>
        </View>
        <TouchableOpacity style={styles.attachBtn} onPress={() => Alert.alert('แนบสลิป', 'ต้องเพิ่ม expo-document-picker/expo-image-picker เพื่อแนบไฟล์จริง')}>
          <Ionicons name="attach-outline" size={14} color="#d97706" />
          <Text style={styles.attachBtnText}>อัปโหลด/วางรูปสลิป (ปกติ + ฉบับเต็ม)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#d97706' }]} onPress={confirmFinance}>
          <Text style={styles.modalSaveBtnText}>บันทึกข้อมูล</Text>
        </TouchableOpacity>
      </ModalShell>

      {/* Modal: บันทึกโน้ต */}
      <ModalShell visible={noteModal.visible} title="📝 บันทึกข้อความ" color="#475569" onClose={() => setNoteModal({ visible: false, text: '' })}>
        <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุข้อความ..." placeholderTextColor="#94a3b8" multiline value={noteModal.text} onChangeText={(v) => setNoteModal((s) => ({ ...s, text: v }))} />
        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#475569' }]} onPress={confirmNote}>
          <Text style={styles.modalSaveBtnText}>บันทึก</Text>
        </TouchableOpacity>
      </ModalShell>

      {/* Modal: ตีกลับเอกสาร */}
      <ModalShell visible={returnModal.visible} title={returnModal.doc?.isReturned ? '↩️ ยกเลิกการตีกลับ' : '⚠️ ตีกลับเอกสาร (ตั้งโอน)'} color="#ef4444" onClose={() => setReturnModal({ visible: false, text: '' })}>
        {!returnModal.doc?.isReturned && (
          <>
            <FieldLabel text="เหตุผลที่ตีกลับ" required />
            <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุเหตุผล..." placeholderTextColor="#94a3b8" multiline value={returnModal.text} onChangeText={(v) => setReturnModal((s) => ({ ...s, text: v }))} />
          </>
        )}
        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#ef4444' }]} onPress={confirmReturn}>
          <Text style={styles.modalSaveBtnText}>{returnModal.doc?.isReturned ? 'ยืนยันยกเลิกการตีกลับ' : 'ยืนยันตีกลับ'}</Text>
        </TouchableOpacity>
      </ModalShell>

      {/* Modal: เครดิต */}
      <ModalShell visible={creditModal.visible} title="📅 ระบุเครดิต (Credit Term)" color="#4f46e5" onClose={() => setCreditModal({ visible: false })}>
        <FieldLabel text="เลือกเครดิต (วัน)" />
        <View style={styles.creditOptionsRow}>
          {CREDIT_OPTIONS.map((c) => (
            <TouchableOpacity key={c} style={styles.creditOption} onPress={() => confirmCredit(c)}>
              <Text style={styles.creditOptionText}>{c} วัน</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ModalShell>

      {/* Modal: คืนเงินจากซัพพลายเออร์ */}
      <ModalShell visible={refundModal.visible} title="💸 คืนเงินจากซัพพลายเออร์" color="#059669" onClose={() => setRefundModal({ visible: false, date: '', note: '' })}>
        <FieldLabel text="ผู้ทำรายการ" />
        <View style={styles.readonlyInput}>
          <Text style={styles.readonlyInputText}>{CURRENT_USER}</Text>
        </View>
        <FieldLabel text="วันที่คืนเงิน" required />
        <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={refundModal.date} onChangeText={(v) => setRefundModal((s) => ({ ...s, date: v }))} />
        <FieldLabel text="รายละเอียด" />
        <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุรายละเอียดการคืนเงิน..." placeholderTextColor="#94a3b8" multiline value={refundModal.note} onChangeText={(v) => setRefundModal((s) => ({ ...s, note: v }))} />
        <TouchableOpacity style={styles.attachBtn} onPress={() => Alert.alert('แนบไฟล์', 'ต้องเพิ่ม expo-document-picker เพื่อแนบไฟล์จริง')}>
          <Ionicons name="attach-outline" size={14} color="#059669" />
          <Text style={[styles.attachBtnText, { color: '#059669' }]}>แนบไฟล์ (สลิป/เอกสาร)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#059669' }]} onPress={confirmRefund}>
          <Text style={styles.modalSaveBtnText}>บันทึกการคืนเงิน</Text>
        </TouchableOpacity>
      </ModalShell>

      {/* Modal: รับใบกำกับภาษี (ใช้ร่วมกัน 3 แผนก) */}
      <ModalShell
        visible={deptModal.visible}
        title={deptModal.dept ? `📂 ${DEPT_META[deptModal.dept].label}รับใบกำกับภาษี` : ''}
        color={deptModal.dept ? DEPT_META[deptModal.dept].color : '#4f46e5'}
        onClose={() => setDeptModal({ visible: false, invNo: '', note: '' })}
      >
        <FieldLabel text="เลขที่ใบกำกับภาษี" required />
        <TextInput style={styles.input} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={deptModal.invNo} onChangeText={(v) => setDeptModal((s) => ({ ...s, invNo: v }))} />
        <TouchableOpacity style={styles.attachBtn} onPress={() => Alert.alert('แนบไฟล์', 'ต้องเพิ่ม expo-document-picker เพื่อแนบไฟล์จริง')}>
          <Ionicons name="attach-outline" size={14} color="#475569" />
          <Text style={styles.attachBtnText}>แนบไฟล์ใบกำกับ</Text>
        </TouchableOpacity>
        <FieldLabel text="หมายเหตุ (ถ้ามี)" />
        <TextInput style={[styles.input, styles.textarea]} placeholder="เช่น บิลมีปัญหา..." placeholderTextColor="#94a3b8" multiline value={deptModal.note} onChangeText={(v) => setDeptModal((s) => ({ ...s, note: v }))} />
        <FieldLabel text="ผู้รับใบกำกับ" />
        <View style={styles.readonlyInput}>
          <Text style={styles.readonlyInputText}>{CURRENT_USER}</Text>
        </View>
        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: deptModal.dept ? DEPT_META[deptModal.dept].color : '#4f46e5' }]} onPress={confirmDeptReceive}>
          <Text style={styles.modalSaveBtnText}>ยืนยัน</Text>
        </TouchableOpacity>
      </ModalShell>

      {/* Modal: ประวัติ (mock timeline สั้นๆ) */}
      <ModalShell visible={historyModal.visible} title="ประวัติการเปลี่ยนแปลง" color="#334155" onClose={() => setHistoryModal({ visible: false })}>
        {historyModal.doc && (
          <View>
            <HistoryLine when={historyModal.doc.createdAtShow} who={historyModal.doc.orderedBy} what="สร้างเอกสาร" />
            {!!historyModal.doc.approverName && <HistoryLine when={historyModal.doc.approvedAtShow ?? '-'} who={historyModal.doc.approverName} what="อนุมัติเอกสาร" />}
            {!!historyModal.doc.financeReceiver && <HistoryLine when={historyModal.doc.financeReceivedAtShow ?? '-'} who={historyModal.doc.financeReceiver} what="การเงินรับเอกสาร" />}
            {historyModal.doc.isReturned && <HistoryLine when="-" who="-" what={`ตีกลับเอกสาร: ${historyModal.doc.returnRemark}`} danger />}
            {historyModal.doc.refundDone && <HistoryLine when={historyModal.doc.refundDate ?? '-'} who={CURRENT_USER} what="คืนเงินจากซัพพลายเออร์" />}
          </View>
        )}
      </ModalShell>

      {/* Modal: ส่งออกข้อมูล (Excel) — ตรงกับ modal_export ของต้นฉบับ */}
      <ModalShell visible={exportModal.visible} title="📊 ส่งออกข้อมูล (Excel)" color="#107c41" onClose={() => setExportModal((s) => ({ ...s, visible: false }))}>
        <FieldLabel text="เลือกผู้ทำรายการ" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exportChipsRow}>
          <TouchableOpacity onPress={() => setExportModal((s) => ({ ...s, orderedBy: '' }))} style={[styles.chip, exportModal.orderedBy === '' && styles.chipActiveGreen]}>
            <Text style={[styles.chipText, exportModal.orderedBy === '' && styles.chipTextActive]}>ทั้งหมด (ทุกคน)</Text>
          </TouchableOpacity>
          {orderedByOptions.map((u) => (
            <TouchableOpacity key={u} onPress={() => setExportModal((s) => ({ ...s, orderedBy: u }))} style={[styles.chip, exportModal.orderedBy === u && styles.chipActiveGreen]}>
              <Text style={[styles.chipText, exportModal.orderedBy === u && styles.chipTextActive]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <FieldLabel text="ประเภทเอกสาร" />
        <View style={styles.exportChipsRow}>
          {(['all', 'AX', 'PO'] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setExportModal((s) => ({ ...s, docType: t }))} style={[styles.chip, exportModal.docType === t && styles.chipActiveGreen]}>
              <Text style={[styles.chipText, exportModal.docType === t && styles.chipTextActive]}>{t === 'all' ? 'ทั้งหมด' : t === 'AX' ? 'AX (ใบขอซื้อ)' : 'PO (ใบสั่งซื้อ)'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <FieldLabel text="การแนบสลิป" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exportChipsRow}>
          {(
            [
              { v: 'all', l: 'ทั้งหมด (ไม่กรอง)' },
              { v: 'any', l: 'มีสลิปแล้ว (ปกติ/เต็ม)' },
              { v: 'normal', l: 'มีสลิปปกติ' },
              { v: 'full', l: 'มีสลิปเต็ม' },
              { v: 'both', l: 'มีทั้งคู่' },
              { v: 'none', l: 'ยังไม่แนบสลิป' },
            ] as const
          ).map((o) => (
            <TouchableOpacity key={o.v} onPress={() => setExportModal((s) => ({ ...s, slip: o.v }))} style={[styles.chip, exportModal.slip === o.v && styles.chipActiveGreen]}>
              <Text style={[styles.chipText, exportModal.slip === o.v && styles.chipTextActive]}>{o.l}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <FieldLabel text="เลือกช่วงวันที่ (วว/ดด/ปปปป)" />
        <View style={styles.rowGapExport}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hintText}>จากวันที่</Text>
            <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={exportModal.startDate} onChangeText={(v) => setExportModal((s) => ({ ...s, startDate: v }))} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hintText}>ถึงวันที่</Text>
            <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={exportModal.endDate} onChangeText={(v) => setExportModal((s) => ({ ...s, endDate: v }))} />
          </View>
        </View>

        <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#107c41', opacity: exporting ? 0.6 : 1 }]} onPress={handleExportConfirm} disabled={exporting}>
          <Text style={styles.modalSaveBtnText}>{exporting ? 'กำลังสร้างไฟล์...' : '⬇ ดาวน์โหลด Excel'}</Text>
        </TouchableOpacity>
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

function HistoryLine({ when, who, what, danger }: { when: string; who: string; what: string; danger?: boolean }) {
  return (
    <View style={styles.historyLine}>
      <View style={[styles.historyDot, danger && { backgroundColor: '#ef4444' }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.historyWhat, danger && { color: '#dc2626' }]}>{what}</Text>
        <Text style={styles.historyMeta}>
          {when} · {who}
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
  slipCountPill: { backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 50, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 4 },
  slipBtnRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  slipBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 4 },
  slipBtnEmpty: { backgroundColor: '#fff', borderColor: '#ef4444' },
  slipBtnFilled: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  slipBtnFilledBlue: { backgroundColor: '#eff6ff', borderColor: '#1e3a8a' },
  slipBtnText: { fontSize: 9.5, fontWeight: '700', flexShrink: 1 },
  slipCountPillText: { fontSize: 9.5, fontWeight: '700' },

  expandToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10, paddingVertical: 6 },
  expandToggleText: { fontSize: 11, fontWeight: '700', color: '#475569' },

  expandBody: { marginTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, gap: 8 },
  infoLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  infoLineNeutral: {},
  infoLineDanger: { backgroundColor: '#fef2f2' },
  infoLineLabel: { fontSize: 11, color: '#64748b', fontWeight: '700' },
  infoLineValue: { fontSize: 11, color: '#334155', fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  deptSectionLabel: { fontSize: 10.5, color: '#94a3b8', fontWeight: '700', marginTop: 2 },
  deptRow: { flexDirection: 'row', gap: 6 },
  deptNaText: { fontSize: 11, color: '#cbd5e1', fontStyle: 'italic' },
  deptChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderRadius: 8, paddingVertical: 8 },
  deptChipEmpty: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  deptChipText: { fontSize: 10.5, fontWeight: '700' },

  moreActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  moreActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  moreActionBtnText: { fontSize: 10.5, fontWeight: '700', color: '#475569' },

  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, marginHorizontal: 14, marginTop: 16, paddingVertical: 12 },
  exportBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' },

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