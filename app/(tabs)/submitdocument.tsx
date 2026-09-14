/**
 * SubmitDocumentScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า SubmitDocument.php — ใช้ทั้ง "ลงสมุดเสนอเอกสาร" (สร้างใหม่) และ
 * "แก้ไขเอกสาร" (มี docId) เหมือนต้นฉบับที่เป็นไฟล์เดียวกันสลับโหมดด้วย $is_edit_mode
 * เชื่อมจากปุ่ม "แก้ไข" ในการ์ดเอกสารของ DocumentDashboardScreen
 *
 * สถานะไฟล์นี้: UI MOCKUP — ตัวเลือก (บริษัท/ซัพพลายเออร์/บัญชี/ธนาคาร) เป็นข้อมูลตัวอย่าง
 * ยังไม่ยิง POST action=submit_doc จริง (ดู TODO ใน handleSave)
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
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ Config
import { API_BASE } from '../../constants/config';

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
  whtTax: WhtRate;
  whtAmount: string;
}

export interface SubmitDocumentScreenProps {
  docId?: string; // มีค่า = โหมดแก้ไข (เหมือนต้นฉบับที่เช็คจาก $_GET['edit_id'])
  onBack?: () => void;
  onSaved?: () => void;
}

// ====================================================================
// Mock option lists
// ====================================================================

const CURRENT_USER = 'คุณธนา';
const COMPANIES = ['บริษัท ทีเจซี กรุ๊ป จำกัด', 'บริษัท เอบีซี เอ็นจิเนียริ่ง จำกัด', 'บริษัท เอ็กซ์วายแซด จำกัด'];
const SUPPLIERS_LIST = ['ร้าน สมมติอิเล็กทรอนิกส์', 'บริษัท วัสดุก่อสร้างสมมติ จำกัด', 'หจก. อะไหล่ปรับอากาศสมมติ', 'บริษัท ลิฟต์สมมติ จำกัด', 'ร้าน โซล่าเซลล์สมมติ', 'ร้านเครือข่ายสมมติ'];
const ACCOUNT_NAMES = ['ร้าน สมมติอิเล็กทรอนิกส์', 'บริษัท วัสดุก่อสร้างสมมติ จำกัด', 'หจก. อะไหล่ปรับอากาศสมมติ', 'บริษัท ลิฟต์สมมติ จำกัด'];
const BANK_ACCOUNTS = ['123-4-56789-0', '987-6-54321-0', '111-2-22222-3', '222-3-33333-4'];
const BANKS = ['ธนาคารกรุงไทย', 'ธนาคารกสิกรไทย', 'ธนาคารไทยพาณิชย์', 'ธนาคารกรุงเทพ'];
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
    whtTax: 'ไม่มี',
    whtAmount: '',
  };
}

// mock ข้อมูลเดิมสำหรับโหมดแก้ไข — ใช้ id เดียวกับ DocumentDashboardScreen (1-6)
const MOCK_EDIT_DATA: Record<string, Partial<FormState>> = {
  '2': {
    docType: 'AX', docNumber: '2245', companyId: COMPANIES[0], jobSite: 'TJC69-030', supplierName: SUPPLIERS_LIST[1],
    description: 'ค่าวัสดุก่อสร้างงวดที่ 1', amount: '128500', accountName: ACCOUNT_NAMES[1], bankAccount: BANK_ACCOUNTS[1], bankName: BANKS[1],
    attachmentSelect: 'รอใบกำกับภาษี 7%',
  },
  '3': {
    docType: 'PO', docNumber: '6877', companyId: COMPANIES[1], jobSite: 'ABC69-002', supplierName: SUPPLIERS_LIST[2],
    description: 'ค่าอะไหล่ปรับอากาศ', amount: '67200', isCredit: true, creditTerm: '30', accountName: ACCOUNT_NAMES[2], bankAccount: BANK_ACCOUNTS[2], bankName: BANKS[2],
    attachmentSelect: 'ใบกำกับภาษี 7%', taxRecvDept: 'buyer', taxInvoiceNumbers: ['INV-7701'],
  },
  '4': {
    docType: 'AX', docNumber: '2198', companyId: COMPANIES[0], jobSite: 'TJC68-091', supplierName: SUPPLIERS_LIST[3],
    description: 'ค่าติดตั้งลิฟต์โดยสาร งวดสุดท้าย', amount: '350000', isCredit: true, creditTerm: '60', accountName: ACCOUNT_NAMES[3], bankAccount: BANK_ACCOUNTS[3], bankName: BANKS[3],
    attachmentSelect: 'ใบสำคัญจ่าย', whtTax: '3%',
  },
  '6': {
    docType: 'AX', docNumber: '2050', companyId: COMPANIES[1], jobSite: 'ABC69-003', supplierName: SUPPLIERS_LIST[5],
    description: 'ค่าบำรุงรักษาระบบเครือข่าย', amount: '15800', accountName: '', bankAccount: BANK_ACCOUNTS[1], bankName: BANKS[1],
    attachmentSelect: 'ใบเสร็จรับเงิน',
  },
};

// ====================================================================
// Helpers
// ====================================================================

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

function ChipPicker({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <TouchableOpacity key={opt} onPress={() => onChange(opt)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ====================================================================
// Main screen
// ====================================================================

export default function SubmitDocumentScreen({ docId, onBack, onSaved }: SubmitDocumentScreenProps) {
  const isEditMode = !!docId;
  const [form, setForm] = useState<FormState>(() => ({ ...initialForm(), ...(docId ? MOCK_EDIT_DATA[docId] ?? {} : {}) }));

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

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
    // TODO: ต่อ backend จริง -> POST SubmitDocument.php action=submit_doc (+ edit_doc_id ถ้าแก้ไข)
    // payload ตรงชื่อกับ $_POST[...] ในต้นฉบับ: doc_type, doc_number, company_id, job_site,
    // ordered_by, supplier_name, description, amount, is_credit, credit_term, account_name,
    // bank_account, bank_name, attachment_select, tax_recv_dept + existing_inv[]/tax_recv_inv[]/
    // tax_file_upload[]/tax_recv_note, wht_tax, wht_amount
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
      {
        text: 'บันทึก',
        onPress: () => {
          Alert.alert('บันทึกสำเร็จ (mock)', isEditMode ? 'แก้ไขเอกสารเรียบร้อย!' : 'ลงสมุดเสนอเอกสารเรียบร้อย!', [
            { text: 'ตกลง', onPress: () => (onSaved ? onSaved() : handleBack()) },
          ]);
        },
      },
    ]);
  }

  const showTaxReceiveBox = form.attachmentSelect === 'ใบกำกับภาษี 7%';

  return (
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
            <ChipPicker options={COMPANIES} value={form.companyId} onChange={(v) => set('companyId', v)} />

            <View style={styles.rowGap}>
              <View style={{ flex: 1 }}>
                <FieldLabel text="โครงการ / หน้างาน" required />
                <TextInput style={styles.input} placeholder="ระบุหน้างาน" placeholderTextColor="#94a3b8" value={form.jobSite} onChangeText={(v) => set('jobSite', v)} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel text="ผู้เปิดเอกสาร" />
                <View style={styles.readonlyInput}>
                  <Text style={styles.readonlyInputText}>{CURRENT_USER}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <SectionHeader icon="cash-outline" text="รายละเอียดการจ่ายเงิน" />

            <FieldLabel text="ชื่อร้านค้า / Supplier" required />
            <ChipPicker options={SUPPLIERS_LIST} value={form.supplierName} onChange={(v) => set('supplierName', v)} />
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
            <ChipPicker options={ACCOUNT_NAMES} value={form.accountName} onChange={(v) => set('accountName', v)} />
            <TextInput style={[styles.input, { marginTop: 6 }]} placeholder="หรือพิมพ์ชื่อบัญชีใหม่..." placeholderTextColor="#94a3b8" value={form.accountName} onChangeText={(v) => set('accountName', v)} />

            <FieldLabel text="เลขที่บัญชี" required />
            <ChipPicker options={BANK_ACCOUNTS} value={form.bankAccount} onChange={(v) => set('bankAccount', v)} />
            <TextInput style={[styles.input, { marginTop: 6 }]} placeholder="หรือพิมพ์เลขบัญชีใหม่..." placeholderTextColor="#94a3b8" value={form.bankAccount} onChangeText={(v) => set('bankAccount', v)} />

            <FieldLabel text="ธนาคาร" required />
            <ChipPicker options={BANKS} value={form.bankName} onChange={(v) => set('bankName', v)} />
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
                <TouchableOpacity style={styles.attachFileBtn} onPress={() => Alert.alert('แนบไฟล์', 'ต้องเพิ่ม expo-document-picker เพื่อแนบไฟล์จริง')}>
                  <Ionicons name="attach-outline" size={13} color="#64748b" />
                  <Text style={styles.attachFileBtnText}>แนบไฟล์ใบกำกับ (แต่ละรายการ)</Text>
                </TouchableOpacity>

                <FieldLabel text="หมายเหตุ (ถ้ามี)" />
                <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุหมายเหตุ..." placeholderTextColor="#94a3b8" multiline value={form.taxNote} onChangeText={(v) => set('taxNote', v)} />

                <FieldLabel text="ผู้ลงรับ" />
                <View style={styles.readonlyInput}>
                  <Text style={styles.readonlyInputText}>{CURRENT_USER}</Text>
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
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Ionicons name="save-outline" size={17} color="#fff" />
              <Text style={styles.saveBtnText}>บันทึกข้อมูล</Text>
            </TouchableOpacity>
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

  chipsRow: { gap: 6, paddingVertical: 2 },
  chip: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 220 },
  chipActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  chipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

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