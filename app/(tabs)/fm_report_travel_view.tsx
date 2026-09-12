/**
 * TravelAllowanceViewScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า fm_report_travel.php (mode=view) — "ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง"
 * ฉบับอ่าน/พิมพ์ เชื่อมจากปุ่ม "ดูใบเบิก" ในหน้า TravelAllowanceScreen
 *
 * ไม่มีไฟล์ต้นฉบับ PHP ของหน้านี้ส่งมาโดยตรง — โครงสร้าง/ฟิลด์ทั้งหมดสร้างจากภาพหน้าจอจริงที่
 * ส่งมาให้ดู (บรรทัดต่อบรรทัด) เพราะงั้นสูตรคำนวณเบื้องหลังส่วนที่มองไม่เห็นในภาพ (เช่น
 * validation ตอนบันทึกรายการหัก) เป็นการเดาที่สมเหตุสมผลจากพฤติกรรมหน้าอื่นในชุดเดียวกัน
 * ไม่ใช่ของที่พิสูจน์จากโค้ดจริงเหมือนไฟล์อื่นๆ ที่ทำมา
 *
 * ตรงกับภาพหน้าจอที่ส่งมา:
 *  - แถบบนสุด: ย้อนกลับ, badge "แก้ได้เฉพาะช่อง 'อื่นๆ (หัก)'", ชื่อผู้ใช้ปัจจุบัน, ปุ่ม
 *    "บันทึกรายการหัก" (เขียว), "แก้ไขข้อมูล" (น้ำเงิน — พาไปฟอร์มเต็ม), "พิมพ์"/"Excel" (เทา)
 *  - หัวเอกสาร: โลโก้+ชื่อบริษัท, บันทึกโดย+วันที่, วันที่เสนอเบิก
 *  - "ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง" + ผู้ขอเบิก/แผนก + ระหว่างวันที่-ถึงวันที่
 *  - ตารางรายการ: ลำดับ/วัน-เวลาเริ่ม/ต้นทาง-ปลายทาง/เบี้ยเลี้ยงวันละ/จำนวนวัน/ค่าเบี้ยเลี้ยง/
 *    ที่พัก-ระยะทาง(อ่านอย่างเดียว)/อื่นๆ(หัก — แก้ไขได้ช่องเดียวในหน้านี้)/รายละเอียด
 *    (บนมือถือแปลงตารางเป็นการ์ดต่อแถว เพราะ 9 คอลัมน์ไม่พอกับหน้าจอมือถือ)
 *  - แถวสรุป "รวมทั้งสิ้น" + คำอ่านภาษาไทย + ข้อความวิธีจ่ายเงิน
 *  - แถบสถิติล่างสุด: จำนวนรายการใบงาน / รวมจำนวนวัน / รวมค่าเบี้ยเลี้ยง (บาท)
 *
 * ที่เป็น stub (ไม่มีอยู่ในภาพ/ต้องไลบรารีเพิ่ม):
 *  - "พิมพ์" — ต้องสร้าง PDF ฝั่งเครื่อง (ดู pdf skill /expo-print) ยังไม่ได้ทำ
 *  - "Excel" — ทำแบบเดียวกับ DocumentDashboardScreen ได้ (xlsx + expo-file-system +
 *    expo-sharing) แต่ยังไม่ได้ต่อในรอบนี้ เพราะเป็นเอกสารใบเดียว ไม่ใช่รายการหลายแถว
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ====================================================================
// Types
// ====================================================================

interface ViewRow {
  no: number;
  dateTime: string; // "17/8/69"
  route: string; // ต้นทาง-ปลายทาง
  ratePerDay: number;
  qty: number;
  amount: number;
  lodgingLabel: string; // ที่พัก/ระยะทาง — อ่านอย่างเดียว
  deductKey: string; // อื่นๆ(หัก) — แก้ไขได้ในหน้านี้เท่านั้น
  detail: string;
}

// 🌟 [เพิ่มใหม่] ลำดับผู้ตรวจสอบ/อนุมัติ 3 ขั้น — ตรงกับแถวที่เห็นในภาพหน้าจอ
// (ธุรการจัดส่งตรวจสอบ -> HR อนุมัติ -> หัวหน้าอนุมัติ) ไม่มีไฟล์ต้นฉบับ PHP ของส่วนนี้
// จึงจำลอง state ง่ายๆ: เซ็นแล้ว (โชว์ชื่อ+วันที่) หรือยังไม่เซ็น (โชว์ปุ่มอนุมัติ)
interface ApprovalStep {
  key: 'dispatch' | 'hr' | 'chief';
  label: string;
  buttonColor: string;
  signed: boolean;
  signerName?: string;
  signedAtShow?: string;
}

export interface TravelAllowanceViewScreenProps {
  companyNameTh?: string;
  companyNameEn?: string;
  submittedBy?: string;
  submittedAtShow?: string;
  dateSubmit?: string;
  requesterName?: string;
  dept?: string;
  startDate?: string;
  endDate?: string;
  payMethod?: string;
  currentUser?: string;
  canEditDeductOnly?: boolean;
  rows?: ViewRow[];
  approvalSteps?: ApprovalStep[];
  footerCode?: string;
  currentUserForApproval?: string;
  onBack?: () => void;
  onEditFull?: () => void;
}

// ====================================================================
// Mock data (ค่าเริ่มต้นตรงกับภาพตัวอย่างที่ส่งมา)
// ====================================================================

const DEDUCT_OPTIONS = [
  { key: '', label: '— ไม่มี —', rate: 0 },
  { key: 'deduct50', label: 'พักเกิน 50 กม. ห่างจากหน้างาน (-100)', rate: -100 },
];

const DEFAULT_ROWS: ViewRow[] = [
  {
    no: 1,
    dateTime: '17/8/69',
    route: 'ชลบุรี',
    ratePerDay: 210,
    qty: 1,
    amount: 210,
    lodgingLabel: 'นอนโรงแรม (210)',
    deductKey: '',
    detail: 'เข้าลงนามสัญญา+สำรวจหน้างานติดตั้งในวันที่ 18/7/69',
  },
];

// ตรงกับภาพหน้าจอ: ธุรการจัดส่งเซ็นตรวจสอบแล้ว, HR ยังไม่อนุมัติ, หัวหน้ายังไม่อนุมัติ
const DEFAULT_APPROVAL_STEPS: ApprovalStep[] = [
  { key: 'dispatch', label: 'ธุรการจัดส่ง (ตรวจสอบ)', buttonColor: '#64748b', signed: true, signerName: 'วีระ อินทร์จันทร์', signedAtShow: '24/8/69' },
  { key: 'hr', label: 'HR (อนุมัติ)', buttonColor: '#d97706', signed: false },
  { key: 'chief', label: 'หัวหน้า (อนุมัติ)', buttonColor: '#059669', signed: false },
];

// ====================================================================
// Helpers (พอร์ตเหมือนกับ TravelAllowanceFormScreen)
// ====================================================================

function moneyFmt(v: number): string {
  const n = Math.round(v * 100) / 100;
  return n === Math.floor(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const THAI_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function thaiIntegerText(numberStr: string): string {
  const value = numberStr.replace(/^0+/, '') || '0';
  if (value === '0') return THAI_DIGITS[0];
  if (value.length > 6) {
    const head = value.slice(0, -6);
    const tail = value.slice(-6);
    const tailText = Number(tail) === 0 ? '' : thaiIntegerText(tail);
    return `${thaiIntegerText(head)}ล้าน${tailText}`;
  }
  let text = '';
  for (let index = 0; index < value.length; index++) {
    const digit = Number(value[index]);
    const place = value.length - index - 1;
    if (digit === 0) continue;
    if (place === 1 && digit === 1) text += 'สิบ';
    else if (place === 1 && digit === 2) text += 'ยี่สิบ';
    else if (place === 0 && digit === 1 && value.length > 1) text += 'เอ็ด';
    else text += THAI_DIGITS[digit] + THAI_PLACES[place];
  }
  return text;
}

function thaiBahtText(value: number): string {
  const roundedSatang = Math.round(value * 100);
  const absoluteSatang = Math.abs(roundedSatang);
  const baht = Math.floor(absoluteSatang / 100);
  const satang = absoluteSatang % 100;
  const prefix = roundedSatang < 0 ? 'ลบ' : '';
  let text = `${prefix}${thaiIntegerText(String(baht))}บาท`;
  text += satang === 0 ? 'ถ้วน' : `${thaiIntegerText(String(satang))}สตางค์`;
  return text;
}

function rowTotal(r: ViewRow): number {
  const deduct = DEDUCT_OPTIONS.find((o) => o.key === r.deductKey)?.rate ?? 0;
  return r.ratePerDay * r.qty + deduct;
}

// ====================================================================
// Main screen
// ====================================================================

export default function TravelAllowanceViewScreen({
  companyNameTh = 'บริษัท ทีเจซี คอร์ปอเรชั่น จำกัด',
  companyNameEn = 'TJC CORPORATION CO.,LTD.',
  submittedBy = 'สมชาย ใจดี',
  submittedAtShow = '13/9/69',
  dateSubmit = '2026-08-24',
  requesterName = 'วีระ อินทร์จันทร์',
  dept = 'พนักงานจัดส่ง',
  startDate = '2026-07-26',
  endDate = '2026-08-25',
  payMethod = 'โอนเข้าบัญชีพร้อมเงินเดือน',
  currentUser = 'สมชาย ใจดี',
  canEditDeductOnly = true,
  rows: initialRows = DEFAULT_ROWS,
  approvalSteps: initialApprovalSteps = DEFAULT_APPROVAL_STEPS,
  footerCode = 'FM-FIN-03 : Rev.00 : 25/09/2566',
  currentUserForApproval = 'คุณสมชาย',
  onBack,
  onEditFull,
}: TravelAllowanceViewScreenProps) {
  const [rows, setRows] = useState<ViewRow[]>(initialRows);
  const [approvalSteps, setApprovalSteps] = useState<ApprovalStep[]>(initialApprovalSteps);
  const [dirty, setDirty] = useState(false);

  const totals = useMemo(() => {
    const qty = rows.reduce((s, r) => s + r.qty, 0);
    const amount = rows.reduce((s, r) => s + rowTotal(r), 0);
    return { qty, amount };
  }, [rows]);

  function setDeduct(no: number, key: string) {
    setRows((prev) => prev.map((r) => (r.no === no ? { ...r, deductKey: key } : r)));
    setDirty(true);
  }

  function handleBack() {
    if (onBack) return onBack();
    Alert.alert('ย้อนกลับ', 'กลับไปหน้ารายการเบิกเบี้ยเลี้ยง');
  }

  function handleSaveDeduct() {
    // TODO: ต่อ backend จริง -> POST action=save_deduct (เฉพาะคอลัมน์ deduct_type ต่อแถว)
    Alert.alert('บันทึกสำเร็จ (mock)', 'บันทึกรายการหักเรียบร้อยแล้ว');
    setDirty(false);
  }

  // 🌟 [เพิ่มใหม่] กดอนุมัติแต่ละขั้น (ธุรการจัดส่ง/HR/หัวหน้า) — ไม่มีไฟล์ต้นฉบับของ action นี้
  // จำลอง sign เป็นชื่อผู้ใช้ปัจจุบัน + วันนี้ ตรงกับรูปแบบที่เห็นในภาพ (ชื่อ + วันที่)
  function signApproval(key: ApprovalStep['key']) {
    const today = new Date();
    const dateShow = `${today.getDate()}/${today.getMonth() + 1}/${String(today.getFullYear() + 543).slice(-2)}`;
    Alert.alert('ยืนยันการอนุมัติ?', `ยืนยันอนุมัติในนาม ${currentUserForApproval}`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'อนุมัติ',
        onPress: () => {
          // TODO: ต่อ backend จริง -> POST action=sign_action (sign_driver_id/sign_type)
          setApprovalSteps((prev) => prev.map((s) => (s.key === key ? { ...s, signed: true, signerName: currentUserForApproval, signedAtShow: dateShow } : s)));
        },
      },
    ]);
  }

  function stubFeature(name: string, detail: string) {
    Alert.alert(name, detail);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={14} color="#fff" />
          <Text style={styles.backBtnText}>ย้อนกลับ</Text>
        </TouchableOpacity>
        {canEditDeductOnly && (
          <View style={styles.editBadge}>
            <Ionicons name="create-outline" size={11} color="#fff" />
            <Text style={styles.editBadgeText}>แก้ได้เฉพาะช่อง "อื่นๆ (หัก)"</Text>
          </View>
        )}
      </View>
      <View style={styles.userRow}>
        <Ionicons name="person-circle-outline" size={13} color="#94a3b8" />
        <Text style={styles.userRowText}>User: {currentUser}</Text>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnGreen, !dirty && styles.actionBtnDisabled]} disabled={!dirty} onPress={handleSaveDeduct}>
          <Ionicons name="save-outline" size={13} color="#fff" />
          <Text style={styles.actionBtnText}>บันทึกรายการหัก</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnBlue]} onPress={onEditFull}>
          <Ionicons name="pencil-outline" size={13} color="#fff" />
          <Text style={styles.actionBtnText}>แก้ไขข้อมูล</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnGray]} onPress={() => stubFeature('พิมพ์', 'ต้องสร้าง PDF ฝั่งเครื่อง (expo-print) — ยังไม่ได้ทำในรอบนี้')}>
          <Ionicons name="print-outline" size={13} color="#64748b" />
          <Text style={[styles.actionBtnText, { color: '#64748b' }]}>พิมพ์</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnGray]} onPress={() => stubFeature('Export Excel', 'ทำแบบเดียวกับ DocumentDashboard ได้ (xlsx+expo-file-system+expo-sharing) — ยังไม่ได้ต่อในรอบนี้')}>
          <Ionicons name="document-outline" size={13} color="#64748b" />
          <Text style={[styles.actionBtnText, { color: '#64748b' }]}>Excel</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <View style={styles.docCard}>
          <View style={styles.docHeadRow}>
            <View style={styles.companyRow}>
              <View style={styles.logoCircle}>
                <Text style={styles.logoText}>TJC</Text>
              </View>
              <View>
                <Text style={styles.companyNameTh}>{companyNameTh}</Text>
                <Text style={styles.companyNameEn}>{companyNameEn}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.savedByText}>
                บันทึกโดย: {submittedBy} ({submittedAtShow})
              </Text>
              <Text style={styles.submitDateLabel}>วันที่เสนอเบิก</Text>
              <Text style={styles.submitDateValue}>{dateSubmit}</Text>
            </View>
          </View>

          <View style={styles.docTitleBar}>
            <Text style={styles.docTitleText}>ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง</Text>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>ผู้ขอเบิกชื่อพนักงาน</Text>
              <Text style={styles.infoGridValue}>{requesterName}</Text>
            </View>
            <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>ชื่อแผนก</Text>
              <Text style={styles.infoGridValue}>{dept}</Text>
            </View>
            <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>ระหว่างวันที่</Text>
              <Text style={styles.infoGridValue}>{startDate}</Text>
            </View>
            <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>ถึงวันที่</Text>
              <Text style={styles.infoGridValue}>{endDate}</Text>
            </View>
          </View>

          <Text style={styles.rowsSectionLabel}>รายการเดินทาง</Text>
          {rows.map((r) => (
            <View key={r.no} style={styles.rowCard}>
              <View style={styles.rowCardTop}>
                <View style={styles.rowNoBadge}>
                  <Text style={styles.rowNoBadgeText}>{r.no}</Text>
                </View>
                <Text style={styles.rowDateTime}>{r.dateTime}</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.rowAmount}>{moneyFmt(rowTotal(r))} บ.</Text>
              </View>
              <Text style={styles.rowRoute}>{r.route}</Text>

              <View style={styles.rowMiniGrid}>
                <View style={styles.rowMiniCell}>
                  <Text style={styles.rowMiniLabel}>เบี้ยเลี้ยง/วัน</Text>
                  <Text style={styles.rowMiniValue}>{moneyFmt(r.ratePerDay)}</Text>
                </View>
                <View style={styles.rowMiniCell}>
                  <Text style={styles.rowMiniLabel}>จำนวนวัน</Text>
                  <Text style={styles.rowMiniValue}>{r.qty}</Text>
                </View>
                <View style={styles.rowMiniCell}>
                  <Text style={styles.rowMiniLabel}>ค่าเบี้ยเลี้ยง</Text>
                  <Text style={styles.rowMiniValue}>{moneyFmt(r.ratePerDay * r.qty)}</Text>
                </View>
              </View>

              <View style={styles.rowFieldLine}>
                <Text style={styles.rowFieldLabel}>ที่พัก / ระยะทาง</Text>
                <View style={styles.readonlyChip}>
                  <Text style={styles.readonlyChipText}>{r.lodgingLabel}</Text>
                </View>
              </View>

              <View style={styles.rowFieldLine}>
                <Text style={styles.rowFieldLabel}>
                  อื่นๆ (หัก) <Text style={styles.editableTag}>แก้ได้</Text>
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.deductChipsRow}>
                  {DEDUCT_OPTIONS.map((o) => {
                    const active = r.deductKey === o.key;
                    return (
                      <TouchableOpacity key={o.key || 'none'} onPress={() => setDeduct(r.no, o.key)} style={[styles.deductChip, active && styles.deductChipActive]}>
                        <Text style={[styles.deductChipText, active && styles.deductChipTextActive]}>{o.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {!!r.detail && (
                <View style={styles.rowDetailBox}>
                  <Text style={styles.rowDetailText}>{r.detail}</Text>
                </View>
              )}
            </View>
          ))}

          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>รวมทั้งสิ้น</Text>
            <Text style={styles.grandTotalQty}>{totals.qty} วัน</Text>
            <Text style={styles.grandTotalAmount}>{moneyFmt(totals.amount)} บาท</Text>
          </View>

          <View style={styles.bahtTextRow}>
            <Text style={styles.bahtTextLabel}>(ตัวอักษร) บาท</Text>
            <Text style={styles.bahtTextValue}>{thaiBahtText(totals.amount)}</Text>
          </View>

          <View style={styles.payMethodBox}>
            <Text style={styles.payMethodText}>เบิกค่าเบี้ยเลี้ยงโดย{payMethod}</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statsCell}>
              <Text style={styles.statsCellLabel}>จำนวนรายการใบงาน</Text>
              <Text style={styles.statsCellValue}>{rows.length} รายการ</Text>
            </View>
            <View style={styles.statsCell}>
              <Text style={styles.statsCellLabel}>รวมจำนวนวัน</Text>
              <Text style={styles.statsCellValue}>{totals.qty} วัน</Text>
            </View>
            <View style={styles.statsCell}>
              <Text style={styles.statsCellLabel}>รวมค่าเบี้ยเลี้ยง (บาท)</Text>
              <Text style={[styles.statsCellValue, { color: '#4338ca' }]}>{moneyFmt(totals.amount)}</Text>
            </View>
          </View>

          {/* 🌟 [เพิ่มใหม่] แถวผู้ตรวจสอบ/อนุมัติ 3 ขั้น — ไม่มีไฟล์ต้นฉบับ สร้างจากภาพหน้าจอที่ส่งมา */}
          <View style={styles.approvalGrid}>
            {approvalSteps.map((s) => (
              <View key={s.key} style={styles.approvalCell}>
                <Text style={styles.approvalCellLabel}>{s.label}</Text>
                {s.signed ? (
                  <View style={styles.approvalSignedBox}>
                    <Text style={styles.approvalSignedName}>( {s.signerName} )</Text>
                    <Text style={styles.approvalSignedDate}>วันที่ {s.signedAtShow}</Text>
                  </View>
                ) : (
                  <View style={styles.approvalPendingBox}>
                    <Text style={styles.approvalPendingText}>ยังไม่อนุมัติ</Text>
                    <TouchableOpacity style={[styles.approveBtn, { backgroundColor: s.buttonColor }]} onPress={() => signApproval(s.key)}>
                      <Text style={styles.approveBtnText}>อนุมัติ</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>

          <View style={styles.footerRow}>
            <View style={styles.netBox}>
              <Text style={styles.netBoxLabel}>สุทธิ:</Text>
              <Text style={styles.netBoxValue}>{moneyFmt(totals.amount)}</Text>
            </View>
            <Text style={styles.footerCodeText}>{footerCode}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7fb' },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1e293b', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, flexWrap: 'wrap' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  backBtnText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  editBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#b45309', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  editBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1e293b', paddingHorizontal: 14, paddingBottom: 10 },
  userRowText: { color: '#cbd5e1', fontSize: 10.5, fontWeight: '600' },

  actionsRow: { flexDirection: 'row', gap: 7, backgroundColor: '#1e293b', paddingHorizontal: 14, paddingBottom: 12, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  actionBtnGreen: { backgroundColor: '#059669' },
  actionBtnBlue: { backgroundColor: '#2563eb' },
  actionBtnGray: { backgroundColor: '#e2e8f0' },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },

  docCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  docHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  logoCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 10, fontWeight: '900', color: '#b45309' },
  companyNameTh: { fontSize: 13, fontWeight: '800', color: '#1e293b' },
  companyNameEn: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  savedByText: { fontSize: 10, color: '#059669', fontWeight: '700' },
  submitDateLabel: { fontSize: 9.5, color: '#94a3b8', marginTop: 6 },
  submitDateValue: { fontSize: 12, fontWeight: '800', color: '#1e293b' },

  docTitleBar: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 9, alignItems: 'center', marginTop: 14 },
  docTitleText: { fontSize: 13, fontWeight: '800', color: '#1e293b' },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  infoGridItem: { width: '47%' },
  infoGridLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600' },
  infoGridValue: { fontSize: 12.5, fontWeight: '800', color: '#1e293b', marginTop: 3 },

  rowsSectionLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },

  rowCard: { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  rowCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowNoBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  rowNoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  rowDateTime: { fontSize: 11, color: '#64748b', fontWeight: '700' },
  rowAmount: { fontSize: 13.5, fontWeight: '900', color: '#4338ca' },
  rowRoute: { fontSize: 13, fontWeight: '800', color: '#1e293b', marginTop: 6 },

  rowMiniGrid: { flexDirection: 'row', gap: 8, marginTop: 9 },
  rowMiniCell: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 8, alignItems: 'center' },
  rowMiniLabel: { fontSize: 9, color: '#94a3b8', fontWeight: '600' },
  rowMiniValue: { fontSize: 12.5, fontWeight: '800', color: '#1e293b', marginTop: 3 },

  rowFieldLine: { marginTop: 10 },
  rowFieldLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', marginBottom: 5 },
  editableTag: { fontSize: 9, color: '#2563eb', fontWeight: '800' },
  readonlyChip: { alignSelf: 'flex-start', backgroundColor: '#eef2ff', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
  readonlyChipText: { fontSize: 11, fontWeight: '700', color: '#4338ca' },

  deductChipsRow: { gap: 6 },
  deductChip: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  deductChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  deductChipText: { fontSize: 10.5, fontWeight: '700', color: '#64748b' },
  deductChipTextActive: { color: '#fff' },

  rowDetailBox: { backgroundColor: '#fffbeb', borderRadius: 8, padding: 9, marginTop: 10 },
  rowDetailText: { fontSize: 11, color: '#92400e', lineHeight: 16 },

  grandTotalRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#334155', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, marginTop: 4, gap: 10 },
  grandTotalLabel: { color: '#fff', fontSize: 12, fontWeight: '800', flex: 1 },
  grandTotalQty: { color: '#cbd5e1', fontSize: 11.5, fontWeight: '700' },
  grandTotalAmount: { color: '#fff', fontSize: 14, fontWeight: '900' },

  bahtTextRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: '#f8fafc', borderRadius: 8, padding: 10 },
  bahtTextLabel: { fontSize: 10.5, fontWeight: '800', color: '#64748b' },
  bahtTextValue: { fontSize: 11.5, fontWeight: '700', color: '#1e293b', flexShrink: 1 },

  payMethodBox: { marginTop: 8, padding: 10 },
  payMethodText: { fontSize: 11, color: '#64748b', textAlign: 'center' },

  statsGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statsCell: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 10, alignItems: 'center' },
  statsCellLabel: { fontSize: 9, color: '#94a3b8', fontWeight: '700', textAlign: 'center' },
  statsCellValue: { fontSize: 13, fontWeight: '900', color: '#1e293b', marginTop: 5 },

  approvalGrid: { flexDirection: 'row', gap: 8, marginTop: 10 },
  approvalCell: { flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  approvalCellLabel: { fontSize: 9.5, fontWeight: '800', color: '#334155', textAlign: 'center', backgroundColor: '#f1f5f9', paddingVertical: 8, paddingHorizontal: 4 },
  approvalSignedBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 6, minHeight: 90 },
  approvalSignedName: { fontSize: 11, fontWeight: '700', color: '#1e293b', textAlign: 'center' },
  approvalSignedDate: { fontSize: 10, color: '#64748b', marginTop: 4 },
  approvalPendingBox: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 8, minHeight: 90 },
  approvalPendingText: { fontSize: 10.5, fontWeight: '700', color: '#94a3b8' },
  approveBtn: { borderRadius: 50, paddingHorizontal: 18, paddingVertical: 8 },
  approveBtnText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },

  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  netBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  netBoxLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155' },
  netBoxValue: { fontSize: 15, fontWeight: '900', color: '#1e293b' },
  footerCodeText: { fontSize: 10, color: '#94a3b8' },
});