/**
 * ProjectAccountingScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า project_accounting.php "โหมดปกติ" (ลงบัญชีลูกหนี้แบ่งงวด)
 * เปิดจากปุ่ม "ลงบัญชี" ในหน้า AccountingDashboard ผ่าน expo-router:
 *   router.push({ pathname: '/ProjectAccounting', params: { id } })
 * จึงอ่าน id ผ่าน useLocalSearchParams() ตรงๆ เหมือนไฟล์อื่นในชุดนี้
 *
 * ต้นฉบับมี 3 โหมด (ปกติ / แผนผ่อนชำระ ?plan_id= / ค้ำเงินสด ?lg_id=) — ปุ่ม "ลงบัญชี" ของ
 * accounting_dashboard.php ส่งมาแค่ ?id= เสมอ ไม่มี plan_id/lg_id เลย ดังนั้นไฟล์นี้ทำเฉพาะ
 * "โหมดปกติ" เท่านั้น ตรงกับเงื่อนไข !$is_plan_mode && !$is_lg_mode ของต้นฉบับ
 *
 * สถานะไฟล์นี้: UI MOCKUP — ยังไม่ยิง POST ajax_save จริง (ดู TODO ใน handleSave)
 *
 * ตรงกับพฤติกรรม/สูตรจริงจาก project_accounting.php (โหมดปกติ):
 *  - สูตรคำนวณต่องวดตรงกับ calculateRow() เป๊ะ (VAT 7%, 3 โหมดกรอก: ก่อน VAT / รวม VAT /
 *    รับสุทธิ, หัก ณ ที่จ่าย 0-5%, หักค่าธรรมเนียม+ค่าปรับ):
 *      mode=base : base=amount, vat=base*7%, gross=base+vat, wht=base*wht%, net=gross-wht-fee-fine
 *      mode=gross: gross=amount, base=gross/1.07, vat=gross-base, wht=base*wht%, net=gross-wht-fee-fine
 *      mode=net  : net=amount, base=(net+fee+fine)/(1.07-wht%), vat=base*7%, gross=base+vat, wht=base*wht%
 *  - แต่ละงวดพับ/ขยายได้เหมือนกันกับหน้าติดตามหนี้ (ProjectFollowupScreen)
 *  - เลือกสถานะ "แจ้งซ่อม" -> โผล่ฟอร์มย่อยเปิดใบแจ้งซ่อม (โครงสร้างเดียวกับ guarantee_update.php)
 *  - เลือกสถานะ "รับเช็คแล้ว" -> โผล่ช่องเลขที่เช็ค + วันที่ลงเช็ค
 *  - แถบสรุปยอดรวมทุกงวดท้ายหน้า (รวมยอดที่กรอก/ก่อนVAT/VAT/หัก ณ ที่จ่าย/ธรรมเนียม/ค่าปรับ/
 *    รับสุทธิรวม) รวมจากทุกงวดจริง ไม่ใช่ตัวเลขคงที่
 *  - ปุ่มลัด "ไปหน้าติดตามหนี้" (การติดตามหนี้แยกออกไปอีกหน้าแล้วในต้นฉบับ)
 *
 * ที่ตัดออก/ทำให้ง่ายลง (เกินขอบเขต mockup):
 *  - "จัดการสถานะ" (ตั้งค่าตัวเลือกสถานะเอง) และ "Export สรุปเงินเข้า" — ฟีเจอร์แอดมิน/ส่งออกไฟล์
 *  - ระบบ auto-close (ตั้งงวดสุดท้ายเป็น "ปิดยอด" อัตโนมัติเมื่อยอดกรอกครบงบ) — ต้องมี logic
 *    เพิ่มเติมพอสมควร ตัดออกไปก่อนเพื่อความเรียบง่าย ผู้ใช้เลือกสถานะปิดยอดเองได้ตรงๆ
 *  - แนบไฟล์ในฟอร์มแจ้งซ่อม — ต้อง expo-document-picker (เป็น stub)
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons expo-router
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
  owner: string;
  createdAtShow?: string;
  chequeNo: string;
  chequeDate: string;
  // ฟอร์มแจ้งซ่อม (เฉพาะตอนสถานะ = 'แจ้งซ่อม')
  srReceiver: string;
  srUrgency: 'normal' | 'urgent' | 'critical';
  srProduct: string;
  srJobType: string;
  srIssue: string;
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

export interface ProjectAccountingScreenProps {
  id?: string; // ถ้าส่งมาตรงๆ (เช่น embed จาก AccountingDashboard) จะใช้ค่านี้แทนค่าจาก route params
  onBack?: () => void;
  onSaved?: () => void;
}

// ====================================================================
// Constants
// ====================================================================

const VAT_RATE = 0.07;
const CURRENT_USER = 'คุณธนา';
const STATUS_LIST = ['รอชำระ', 'จ่ายเงินแล้ว (บางส่วน)', 'จ่ายเงินครบแล้ว (ปิดยอด)', 'รับเช็คแล้ว', 'แจ้งซ่อม'];
const STATUS_FULL = 'จ่ายเงินครบแล้ว (ปิดยอด)';
const REQ_AMOUNT_STATUSES = ['จ่ายเงินแล้ว (บางส่วน)', 'จ่ายเงินครบแล้ว (ปิดยอด)', 'รับเช็คแล้ว'];
const BANK_LIST = ['ธนาคารกรุงไทย', 'ธนาคารกสิกรไทย', 'ธนาคารไทยพาณิชย์', 'ธนาคารกรุงเทพ'];
const WHT_OPTIONS = [0, 1, 2, 3, 4, 5];
const CALC_MODE_OPTIONS: { value: CalcMode; label: string }[] = [
  { value: 'base', label: '1. ราคาก่อน VAT' },
  { value: 'gross', label: '2. ราคารวม VAT' },
  { value: 'net', label: '3. หลังหักภาษี (รับสุทธิ)' },
];
const MOCK_USERS = ['คุณธนา', 'คุณสมชาย', 'คุณกานดา', 'คุณปิยะ'];
const MOCK_JOB_TYPES = ['ซ่อมบำรุงทั่วไป', 'ระบบไฟฟ้า', 'ระบบปรับอากาศ', 'ระบบกล้องวงจรปิด', 'อื่นๆ'];

const MOCK_PROJECTS: Record<string, ProjectInfo> = {
  '548': { jobNo: '548', projectName: 'จัดซื้อครุภัณฑ์สำนักงาน บริษัท เจริญกิจ...', customer: 'ไม่ระบุ', budget: 64000, paidGross: 0 },
  '547': {
    jobNo: '547', projectName: 'วางระบบเครือข่ายคอมพิวเตอร์ บริษัท เจริญกิจเจริญทรัพย์...', customer: 'บริษัท เจริญกิจเจริญทรัพย์ จำกัด',
    budget: 225600, paidGross: 0, address: '99 ถ.สมมติ ต.ในเมือง อ.เมือง จ.สมมติ 30000', contact: 'คุณสมหญิง ใจงาม โทร: 08x-xxx-1234',
  },
  '546': { jobNo: '546', projectName: 'ติดตั้งระบบโซล่าเซลล์ บริษัท เจริญกิจเจริญทรัพย์...', customer: 'บริษัท เจริญกิจเจริญทรัพย์ จำกัด', budget: 64000, paidGross: 64000 },
  '545': {
    jobNo: '545', projectName: 'ปรับปรุงระบบไฟฟ้าภายในอาคาร บริษัท สมมติ...', customer: 'บริษัท สมมติ จำกัด',
    budget: 448900, paidGross: 0, address: '77 ถ.พาณิชย์ ต.ในเมือง อ.เมือง จ.สมมติ 30000', contact: 'คุณอรทัย ใจดี โทร: 08x-xxx-9012',
  },
  '544': { jobNo: '544', projectName: 'ติดตั้งระบบกล้องวงจรปิด บริษัท เจริญกิจเจริญทรัพย์...', customer: 'บริษัท เจริญกิจเจริญทรัพย์ จำกัด', budget: 32000, paidGross: 32000 },
};

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
    status: STATUS_LIST[0],
    fee: '',
    fine: '',
    bankName: '',
    receiptNo: '',
    receivedDate: '',
    receiptDate: '',
    remark: '',
    owner: CURRENT_USER,
    chequeNo: '',
    chequeDate: '',
    srReceiver: '',
    srUrgency: 'normal',
    srProduct: '',
    srJobType: '',
    srIssue: '',
    ...partial,
  };
}

const MOCK_PAYMENTS: Record<string, PaymentRow[]> = {
  '546': [
    mkRow({
      isNew: false, name: 'งวดเดียว (เต็มจำนวน)', amount: '63401.87', calcMode: 'net', whtPercent: 0, status: STATUS_FULL,
      receiptNo: 'RC-4562', receivedDate: '23/06/2026', receiptDate: '23/06/2026', owner: 'คุณอรทัย', createdAtShow: '23/06/2026 08:31',
    }),
  ],
  '544': [
    mkRow({
      isNew: false, name: 'งวดเดียว (เต็มจำนวน)', amount: '31700.93', calcMode: 'net', whtPercent: 0, status: STATUS_FULL,
      bankName: 'ธนาคารกรุงไทย', receiptNo: 'RC-3391', receivedDate: '11/07/2026', receiptDate: '11/07/2026', owner: 'คุณอรทัย', createdAtShow: '11/07/2026 14:20',
    }),
  ],
};

function num(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toFloat(s: string): number {
  return parseFloat((s || '').replace(/,/g, '')) || 0;
}

// เทียบเท่า calculateRow() ของต้นฉบับเป๊ะ
function calcRow(amountStr: string, feeStr: string, fineStr: string, mode: CalcMode, whtPercent: number) {
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
    vat = base * VAT_RATE;
    gross = base + vat;
    wht = base * whtRate;
    net = gross - wht - fee - fine;
  } else if (mode === 'gross') {
    gross = amount;
    base = gross / (1 + VAT_RATE);
    vat = gross - base;
    wht = base * whtRate;
    net = gross - wht - fee - fine;
  } else {
    net = amount;
    const target = net + fee + fine;
    const factor = 1 + VAT_RATE - whtRate;
    base = factor !== 0 ? target / factor : 0;
    vat = base * VAT_RATE;
    gross = base + vat;
    wht = base * whtRate;
  }
  return { base, vat, gross, wht, fee, fine, net };
}

// ====================================================================
// Main screen
// ====================================================================

export default function ProjectAccountingScreen({ id, onBack, onSaved }: ProjectAccountingScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const projectId = id ?? params.id ?? '547';

  const project = useMemo(() => MOCK_PROJECTS[projectId] ?? MOCK_PROJECTS['547'], [projectId]);
  const outstanding = Math.max(project.budget - project.paidGross, 0);

  const initialRows = MOCK_PAYMENTS[projectId] ?? [];
  const [rows, setRows] = useState<PaymentRow[]>(initialRows.length > 0 ? initialRows : [mkRow({ name: 'งวดที่ 1' })]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(rows.filter((r) => r.isNew).map((r) => r.id)));

  const rowCalcs = useMemo(() => {
    const map: Record<string, ReturnType<typeof calcRow>> = {};
    rows.forEach((r) => {
      map[r.id] = calcRow(r.amount, r.fee, r.fine, r.calcMode, r.whtPercent);
    });
    return map;
  }, [rows]);

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

  function addRow(preset?: Partial<PaymentRow>) {
    const r = mkRow({ name: `งวดที่ ${rows.length + 1}`, ...preset });
    setRows((prev) => [...prev, r]);
    setExpandedIds((prev) => new Set(prev).add(r.id));
  }

  function removeRow(row: PaymentRow) {
    if (!row.isNew) {
      Alert.alert('ยืนยันการลบงวดนี้?', 'งวดนี้เป็น "ข้อมูลในระบบ" หากลบทิ้งและกดบันทึก ประวัติจะหายไปอย่างถาวร', [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ยืนยันการลบ', style: 'destructive', onPress: () => setRows((prev) => prev.filter((r) => r.id !== row.id)) },
      ]);
    } else {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    }
  }

  function updateRow<K extends keyof PaymentRow>(id: string, field: K, value: PaymentRow[K]) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function handleSave() {
    // TODO: ต่อ backend จริง -> POST project_accounting.php?id=projectId, ajax_save=1
    // ส่ง payment_name[]/payment_amount[]/net_amount[]/calc_mode[]/wht_percent[]/call_status[]/
    // fee_amount[]/fine_amount[]/bank_name[]/receipt_no[]/payment_received_date[]/receipt_date[]/
    // remark[] ตรงตามชื่อ field ต้นฉบับ + sr_* ถ้ามีงวดไหนสถานะเป็น "แจ้งซ่อม"
    const invalidName = rows.some((r) => !r.name.trim());
    if (invalidName) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุ "ชื่องวด" ให้ครบทุกรายการก่อนบันทึก');
      return;
    }
    const invalidAmount = rows.some((r) => REQ_AMOUNT_STATUSES.includes(r.status) && toFloat(r.amount) <= 0);
    if (invalidAmount) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'มีงวดที่สถานะต้องระบุยอดเงิน แต่ยังไม่ได้กรอก');
      return;
    }
    const invalidSr = rows.some((r) => r.status === 'แจ้งซ่อม' && (!r.srReceiver || !r.srProduct.trim() || !r.srIssue.trim()));
    if (invalidSr) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'มีงวดที่แจ้งซ่อม แต่ยังกรอกข้อมูลใบแจ้งซ่อมไม่ครบ');
      return;
    }
    Alert.alert('บันทึกสำเร็จ (mock)', `บันทึกงวดชำระ ${rows.length} รายการเรียบร้อยแล้ว!`, [
      { text: 'ตกลง', onPress: () => (onSaved ? onSaved() : handleBack()) },
    ]);
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
              <TouchableOpacity style={styles.addBtnPaid} onPress={() => addRow({ name: 'งวดสุดท้าย (ปิดยอด)', status: STATUS_FULL })}>
                <Ionicons name="checkmark-done" size={13} color="#fff" />
                <Text style={styles.addBtnPaidText}>ปิดยอด</Text>
              </TouchableOpacity>
            </View>
          </View>

          {rows.map((r, idx) => {
            const c = rowCalcs[r.id];
            const expanded = expandedIds.has(r.id);
            const showCheque = r.status === 'รับเช็คแล้ว';
            const showSr = r.status === 'แจ้งซ่อม';

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
                      <Text style={styles.collapsedMeta}>👤 {r.owner}</Text>
                    </View>
                    <View style={styles.collapsedValRow}>
                      <Text style={styles.collapsedValLabel}>รับสุทธิงวดนี้</Text>
                      <Text style={styles.collapsedValValue}>{num(c.net)}</Text>
                    </View>
                    <View style={styles.collapsedStatusBadge}>
                      <Text style={styles.collapsedStatusBadgeText}>{r.status}</Text>
                    </View>
                    <View style={styles.expandBtn}>
                      <Ionicons name="create-outline" size={12} color="#475569" />
                      <Text style={styles.expandBtnText}>แก้ไข</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View>
                    <FieldLabel text="ชื่องวด" required />
                    <TextInput style={styles.input} placeholder="เช่น งวดที่ 1" placeholderTextColor="#94a3b8" value={r.name} onChangeText={(v) => updateRow(r.id, 'name', v)} />

                    <FieldLabel text="ยอดเงินที่กรอก (บาท)" required={REQ_AMOUNT_STATUSES.includes(r.status)} />
                    <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={r.amount} onChangeText={(v) => updateRow(r.id, 'amount', v)} />

                    <FieldLabel text="ยอดที่กรอกคือ..." />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                      {CALC_MODE_OPTIONS.map((m) => (
                        <TouchableOpacity key={m.value} onPress={() => updateRow(r.id, 'calcMode', m.value)} style={[styles.chip, r.calcMode === m.value && styles.chipActive]}>
                          <Text style={[styles.chipText, r.calcMode === m.value && styles.chipTextActive]}>{m.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <FieldLabel text="หัก ณ ที่จ่าย" />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                      {WHT_OPTIONS.map((w) => (
                        <TouchableOpacity key={w} onPress={() => updateRow(r.id, 'whtPercent', w)} style={[styles.chip, r.whtPercent === w && styles.chipActive]}>
                          <Text style={[styles.chipText, r.whtPercent === w && styles.chipTextActive]}>{w === 0 ? 'ไม่หัก' : `หัก ${w}%`}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <FieldLabel text="สถานะจ่ายเงิน" />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                      {STATUS_LIST.map((s) => (
                        <TouchableOpacity key={s} onPress={() => updateRow(r.id, 'status', s)} style={[styles.chip, r.status === s && styles.chipActive]}>
                          <Text style={[styles.chipText, r.status === s && styles.chipTextActive]}>{s}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

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
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                      <TouchableOpacity onPress={() => updateRow(r.id, 'bankName', '')} style={[styles.chip, r.bankName === '' && styles.chipActive]}>
                        <Text style={[styles.chipText, r.bankName === '' && styles.chipTextActive]}>ไม่ระบุ</Text>
                      </TouchableOpacity>
                      {BANK_LIST.map((b) => (
                        <TouchableOpacity key={b} onPress={() => updateRow(r.id, 'bankName', b)} style={[styles.chip, r.bankName === b && styles.chipActive]}>
                          <Text style={[styles.chipText, r.bankName === b && styles.chipTextActive]}>{b}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {/* สรุปยอดงวดนี้ */}
                    <View style={styles.rowSummaryBox}>
                      <View style={styles.rowSummaryLine}>
                        <Text style={styles.rowSummaryLabel}>ก่อน VAT</Text>
                        <Text style={styles.rowSummaryValue}>{num(c.base)}</Text>
                      </View>
                      <View style={styles.rowSummaryLine}>
                        <Text style={styles.rowSummaryLabel}>VAT 7%</Text>
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
                        <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={r.receiptDate} onChangeText={(v) => updateRow(r.id, 'receiptDate', v)} />
                      </View>
                    </View>
                    <FieldLabel text="วันที่รับเงิน / เงินเข้า" />
                    <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={r.receivedDate} onChangeText={(v) => updateRow(r.id, 'receivedDate', v)} />

                    <FieldLabel text="หมายเหตุ" />
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)..."
                      placeholderTextColor="#94a3b8"
                      multiline
                      value={r.remark}
                      onChangeText={(v) => updateRow(r.id, 'remark', v)}
                    />

                    <FieldLabel text="ผู้บันทึก" />
                    <View style={styles.stampBox}>
                      <Ionicons name="person-outline" size={13} color="#059669" />
                      <Text style={styles.stampBoxText}>{r.owner || '—'}</Text>
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
                            <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={r.chequeDate} onChangeText={(v) => updateRow(r.id, 'chequeDate', v)} />
                          </View>
                        </View>
                      </View>
                    )}

                    {showSr && (
                      <View style={styles.srBox}>
                        <Text style={styles.srBoxTitle}>
                          <Ionicons name="build-outline" size={12} color="#e11d48" /> ข้อมูลสำหรับเปิดใบแจ้งซ่อม
                        </Text>
                        <FieldLabel text="ผู้รับเรื่อง" required />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                          {MOCK_USERS.map((u) => (
                            <TouchableOpacity key={u} onPress={() => updateRow(r.id, 'srReceiver', u)} style={[styles.chip, r.srReceiver === u && styles.chipActiveRed]}>
                              <Text style={[styles.chipText, r.srReceiver === u && styles.chipTextActive]}>{u}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        <FieldLabel text="สินค้า / อุปกรณ์" required />
                        <TextInput style={styles.input} placeholder="เช่น กล้องวงจรปิด, PC..." placeholderTextColor="#94a3b8" value={r.srProduct} onChangeText={(v) => updateRow(r.id, 'srProduct', v)} />
                        <FieldLabel text="ประเภทงาน" required />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                          {MOCK_JOB_TYPES.map((jt) => (
                            <TouchableOpacity key={jt} onPress={() => updateRow(r.id, 'srJobType', jt)} style={[styles.chip, r.srJobType === jt && styles.chipActiveRed]}>
                              <Text style={[styles.chipText, r.srJobType === jt && styles.chipTextActive]}>{jt}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        <FieldLabel text="อาการ / ปัญหาที่พบ" required />
                        <TextInput
                          style={[styles.input, styles.textarea]}
                          placeholder="ระบุอาการเสีย..."
                          placeholderTextColor="#94a3b8"
                          multiline
                          value={r.srIssue}
                          onChangeText={(v) => updateRow(r.id, 'srIssue', v)}
                        />
                        <TouchableOpacity style={styles.attachBtn} onPress={() => Alert.alert('แนบไฟล์', 'ต้องเพิ่ม expo-document-picker เพื่อแนบไฟล์จริงบนมือถือ')}>
                          <Ionicons name="attach-outline" size={12} color="#64748b" />
                          <Text style={styles.attachBtnText}>อัปโหลดไฟล์แนบ (ถ้ามี)</Text>
                        </TouchableOpacity>
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
            <SummaryLine label="รวม VAT 7%" value={num(totals.vat)} color="#4ade80" />
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
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Ionicons name="save-outline" size={16} color="#fff" />
              <Text style={styles.saveBtnText}>บันทึกงวดชำระ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
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
  expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10 },
  expandBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 5, marginTop: 9 },
  required: { color: '#ef4444' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 12.5, color: '#0f172a', backgroundColor: '#fff' },
  textarea: { minHeight: 56, textAlignVertical: 'top' },
  rowGap: { flexDirection: 'row', gap: 8 },

  chipsRow: { gap: 6, paddingVertical: 2 },
  chip: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 11, paddingVertical: 7 },
  chipActive: { backgroundColor: '#059669', borderColor: '#059669' },
  chipActiveRed: { backgroundColor: '#e11d48', borderColor: '#e11d48' },
  chipText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  rowSummaryBox: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 10, padding: 11, marginTop: 12 },
  rowSummaryLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rowSummaryLabel: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  rowSummaryValue: { fontSize: 11.5, color: '#334155', fontWeight: '700' },
  rowSummaryNet: { fontSize: 14, color: '#059669', fontWeight: '900' },

  stampBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9 },
  stampBoxText: { fontSize: 11.5, color: '#64748b', fontWeight: '600' },

  chequeBox: { backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#d8b4fe', borderStyle: 'dashed', borderRadius: 10, padding: 11, marginTop: 12 },
  chequeBoxTitle: { fontSize: 11.5, fontWeight: '800', color: '#7c3aed', marginBottom: 4 },

  srBox: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', borderLeftWidth: 4, borderLeftColor: '#e11d48', borderRadius: 10, padding: 11, marginTop: 12 },
  srBoxTitle: { fontSize: 11.5, fontWeight: '800', color: '#e11d48', marginBottom: 4 },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start' },
  attachBtnText: { fontSize: 10.5, color: '#64748b', fontWeight: '600' },

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
});