/**
 * CreateProjectScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า create_project.php (สร้าง/แก้ไขโครงการ) — ฟอร์มสุดท้ายของชุด
 * tjc-mobile-app ที่เชื่อมจากปุ่ม "สร้างโครงการ" ในหน้า Dashboard หลัก
 *
 * สถานะไฟล์นี้: UI MOCKUP — ตัวเลือกทั้งหมด (บริษัท/ลูกค้า/ผู้ใช้/ทีม ฯลฯ) เป็นข้อมูลตัวอย่าง
 * ยังไม่ยิง POST action=save_project จริง (ดู TODO ท้ายไฟล์ handleSave)
 *
 * ตรงกับโครงสร้าง/พฤติกรรมจริงจาก create_project.php:
 *  - หัวฟอร์ม: วันที่ลงข้อมูล (อ่านอย่างเดียว), เลขหน้างานอัตโนมัติ (ตัวอย่าง), toggle
 *    "สร้างเป็นหน้างานสต๊อก" (ติ๊กแล้วข้ามการบังคับกรอกทุกอย่างได้ เหมือนต้นฉบับ)
 *  - ข้อมูลหลัก: บริษัท/ลูกค้า (+ฟอร์มเพิ่มลูกค้าใหม่แบบฝังในหน้าเดียวกัน), ชื่อโครงการ,
 *    ประเภทงาน, งบประมาณ, ผู้รับผิดชอบโครงการ (บุคคล/ทีม), ผู้ติดตามหนี้ (บุคคลเท่านั้น
 *    ตรงกับต้นฉบับที่ debt_type ถูก fix เป็น 'บุคคล' เสมอ), การค้ำประกัน 4 แบบ + ฟิลด์
 *    เงื่อนไขตามแบบ, ระยะเวลารับประกัน, ระยะเวลาจัดส่ง
 *  - ข้อมูลทีมช่าง: เพิ่ม/ลบทีมได้หลายทีม แต่ละทีมมีรายชื่อช่างเพิ่ม/ลบได้
 *  - ข้อมูลงานประกอบอุปกรณ์: มี/ไม่มีประกอบ (บังคับเลือก เหมือนต้นฉบับ required ทั้งคู่)
 *  - ข้อมูลสัญญา: เลขที่สัญญา/ใบสั่งซื้อ, วันเริ่ม+ระยะเวลา+วันสิ้นสุด (คำนวณอัตโนมัติจาก
 *    วันเริ่ม+ระยะเวลา เหมือน calcContractEndDate() แต่แก้เองทับได้), แจ้งเตือนก่อนหมดสัญญา,
 *    แนบไฟล์สัญญา
 *  - การยื่นซอง & ใบเสนอราคา: ยื่น/ไม่ยื่น + วันที่ยื่น (บังคับถ้ายื่น), เลขที่ใบเสนอราคา,
 *    ผู้เปิดใบเสนอราคา
 *
 * ที่ปรับให้เหมาะกับมือถือ/ตัดออก (เกินขอบเขต mockup):
 *  - ที่อยู่ลูกค้าใหม่ (จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์) ในต้นฉบับเป็น cascading dropdown
 *    จากฐานข้อมูลที่อยู่ไทยทั้งประเทศ — mockup นี้ใช้ช่องกรอกข้อความธรรมดาแทน
 *  - "TECH PICKER MODAL" ค้นหาช่างจากร้านภายนอก (มีรายละเอียดร้าน/ความชำนาญ/จังหวัด/เบอร์ติดต่อ
 *    แบบซับซ้อน) — ย่อเหลือกรอกชื่อช่างตรงๆ ต่อทีม
 *  - แนบไฟล์สัญญา (ต้อง expo-document-picker) — เป็น stub
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

type SalesType = 'บุคคล' | 'ทีม';
type GuaranteeType = 'ไม่มี' | 'หนังสือค้ำ' | 'ค้ำแบบจนกว่าจะหมดภาระผูกพันธ์' | 'เงินสด';
type BiddingType = 'ไม่ยื่น' | 'ยื่น';
type DurationUnit = 'days' | 'months' | 'years';

interface TechTeamBlock {
  id: string;
  teamName: string;
  technicians: string[];
}

interface FormState {
  isStockSite: boolean;
  companyId: string;
  isNewCustomer: boolean;
  customerId: string;
  newCustomer: {
    name: string;
    affiliation: string;
    contactPerson: string;
    address: string;
    province: string;
    district: string;
    subDistrict: string;
    zipCode: string;
    remark: string;
  };
  projectName: string;
  jobTypeId: string;
  projectBudget: string;
  salesType: SalesType;
  salesUser: string;
  salesTeam: string;
  debtUser: string;
  guaranteeType: GuaranteeType;
  guaranteeAmount: string;
  bankName: string;
  bankAccount: string;
  guaranteeNo: string;
  guaranteeStartDate: string;
  guaranteeEndDate: string;
  warrantyValue: string;
  warrantyUnit: DurationUnit;
  deliveryDays: string;
  hasTechnician: boolean | null;
  techTeams: TechTeamBlock[];
  isPcAssembly: boolean | null;
  contractNo: string;
  purchaseOrderNo: string;
  startDate: string;
  contractDuration: string;
  contractUnit: DurationUnit;
  endDate: string;
  endDateManual: boolean;
  alertContractDays: string;
  biddingType: BiddingType;
  biddingDate: string;
  quotationNo: string;
  quoteCreator: string;
}

export interface CreateProjectScreenProps {
  onBack?: () => void;
  onSaved?: () => void;
}

// ====================================================================
// Mock option lists
// ====================================================================

const COMPANIES = ['บริษัท ทีเจซี กรุ๊ป จำกัด', 'บริษัท เอบีซี เอ็นจิเนียริ่ง จำกัด', 'บริษัท เอ็กซ์วายแซด จำกัด'];
const CUSTOMERS = ['เทศบาลนครสมมติ', 'โรงพยาบาลสมมติ', 'บริษัท สมมติ จำกัด'];
const JOB_TYPES = ['ติดตั้งระบบกล้อง', 'ระบบไฟฟ้า', 'ระบบปรับอากาศ', 'งานลิฟต์', 'งานเครือข่าย', 'พลังงานทดแทน'];
const USERS = ['คุณอรทัย', 'คุณพิชญ์', 'คุณวรรณา', 'คุณสมชาย', 'คุณกานดา', 'คุณปิยะ'];
const SALES_TEAMS = ['ทีมขาย A', 'ทีมขาย B'];
const TECH_TEAMS = ['ทีมช่าง A', 'ทีมช่าง B', 'ทีมช่าง C'];
const BANKS = ['ธนาคารกรุงไทย', 'ธนาคารกสิกรไทย', 'ธนาคารไทยพาณิชย์', 'ธนาคารกรุงเทพ'];
const MOCK_NEXT_NUMBER = 545; // จำลอง get_next_number (ปกติดึงจาก DB จริง)

let uidCounter = 1;
function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}_${Date.now()}_${uidCounter}`;
}

function mkTeam(): TechTeamBlock {
  return { id: uid('team'), teamName: '', technicians: [''] };
}

function initialForm(): FormState {
  return {
    isStockSite: false,
    companyId: '',
    isNewCustomer: false,
    customerId: '',
    newCustomer: { name: '', affiliation: '', contactPerson: '', address: '', province: '', district: '', subDistrict: '', zipCode: '', remark: '' },
    projectName: '',
    jobTypeId: '',
    projectBudget: '',
    salesType: 'บุคคล',
    salesUser: '',
    salesTeam: '',
    debtUser: '',
    guaranteeType: 'ไม่มี',
    guaranteeAmount: '',
    bankName: '',
    bankAccount: '',
    guaranteeNo: '',
    guaranteeStartDate: '',
    guaranteeEndDate: '',
    warrantyValue: '',
    warrantyUnit: 'days',
    deliveryDays: '',
    hasTechnician: null,
    techTeams: [mkTeam()],
    isPcAssembly: null,
    contractNo: '',
    purchaseOrderNo: '',
    startDate: '',
    contractDuration: '',
    contractUnit: 'days',
    endDate: '',
    endDateManual: false,
    alertContractDays: '10',
    biddingType: 'ไม่ยื่น',
    biddingDate: '',
    quotationNo: '',
    quoteCreator: '',
  };
}

// ====================================================================
// Helpers
// ====================================================================

const UNIT_LABEL: Record<DurationUnit, string> = { days: 'วัน', months: 'เดือน', years: 'ปี' };

// เทียบเท่า calcContractEndDate() ของจริง — คำนวณวันสิ้นสุดจากวันเริ่ม + ระยะเวลา
function calcEndDate(startDateStr: string, duration: string, unit: DurationUnit): string {
  const m = startDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const dur = parseInt(duration, 10);
  if (!m || isNaN(dur) || dur <= 0) return '';
  const [, dd, mm, yyyy] = m;
  const d = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
  if (unit === 'days') d.setDate(d.getDate() + dur);
  else if (unit === 'months') d.setMonth(d.getMonth() + dur);
  else d.setFullYear(d.getFullYear() + dur);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ====================================================================
// Small reusable pieces
// ====================================================================

function SectionTitle({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Ionicons name={icon} size={14} color="#fff" />
      <Text style={styles.sectionTitleText}>{text}</Text>
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

function TwoOptionToggle({
  value,
  labelA,
  labelB,
  onChange,
}: {
  value: boolean | null;
  labelA: string;
  labelB: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.twoOptionRow}>
      <TouchableOpacity style={[styles.twoOptionBtn, value === false && styles.twoOptionBtnActiveNeutral]} onPress={() => onChange(false)}>
        <Ionicons name={value === false ? 'radio-button-on' : 'radio-button-off'} size={15} color={value === false ? '#64748b' : '#cbd5e1'} />
        <Text style={styles.twoOptionText}>{labelA}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.twoOptionBtn, value === true && styles.twoOptionBtnActiveGreen]} onPress={() => onChange(true)}>
        <Ionicons name={value === true ? 'radio-button-on' : 'radio-button-off'} size={15} color={value === true ? '#059669' : '#cbd5e1'} />
        <Text style={[styles.twoOptionText, value === true && { color: '#059669' }]}>{labelB}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ====================================================================
// Main screen
// ====================================================================

export default function CreateProjectScreen({ onBack, onSaved }: CreateProjectScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ edit_id?: string }>();
  const editId = params.edit_id;

  const [form, setForm] = useState<FormState>(initialForm());

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setNew<K extends keyof FormState['newCustomer']>(key: K, value: FormState['newCustomer'][K]) {
    setForm((f) => ({ ...f, newCustomer: { ...f.newCustomer, [key]: value } }));
  }

  const computedEndDate = useMemo(() => {
    if (form.endDateManual) return form.endDate;
    const auto = calcEndDate(form.startDate, form.contractDuration, form.contractUnit);
    return auto || form.endDate;
  }, [form.startDate, form.contractDuration, form.contractUnit, form.endDateManual, form.endDate]);

  function handleBack() {
    if (onBack) return onBack();
    if (router.canGoBack()) return router.back();
    router.push('/project_dashboard' as never);
  }

  function addTeam() {
    setForm((f) => ({ ...f, techTeams: [...f.techTeams, mkTeam()] }));
  }
  function removeTeam(id: string) {
    setForm((f) => ({ ...f, techTeams: f.techTeams.filter((t) => t.id !== id) }));
  }
  function updateTeamName(id: string, name: string) {
    setForm((f) => ({ ...f, techTeams: f.techTeams.map((t) => (t.id === id ? { ...t, teamName: name } : t)) }));
  }
  function addTechToTeam(id: string) {
    setForm((f) => ({ ...f, techTeams: f.techTeams.map((t) => (t.id === id ? { ...t, technicians: [...t.technicians, ''] } : t)) }));
  }
  function removeTechFromTeam(id: string, idx: number) {
    setForm((f) => ({ ...f, techTeams: f.techTeams.map((t) => (t.id === id ? { ...t, technicians: t.technicians.filter((_, i) => i !== idx) } : t)) }));
  }
  function updateTechName(id: string, idx: number, name: string) {
    setForm((f) => ({
      ...f,
      techTeams: f.techTeams.map((t) => (t.id === id ? { ...t, technicians: t.technicians.map((n, i) => (i === idx ? name : n)) } : t)),
    }));
  }

  function handleSave() {
    // TODO: ต่อ backend จริง -> POST create_project.php action=save_project (+ edit_id ถ้าแก้ไข)
    // payload ครอบคลุมทุกฟิลด์ใน `form` ด้านบน ตรงชื่อกับ $_POST[...] ในต้นฉบับ (company_id,
    // customer_id/new_customer_*, project_name, job_type_id, project_budget, sales_type/user/team,
    // debt_user, guarantee_type + ฟิลด์เงื่อนไข, warranty_value/unit, delivery_days,
    // has_technician + req_tech_team[]/tech_display[], is_pc_assembly, contract_no,
    // purchase_order_no, start_date, contract_duration/unit, end_date, alert_contract_days,
    // contract_file, bidding_type, bidding_date, quotation_no, quote_creator)
    if (!form.isStockSite) {
      if (!form.companyId) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกบริษัท');
      if (!form.isNewCustomer && !form.customerId) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกลูกค้า หรือติ๊กเพิ่มลูกค้าใหม่');
      if (form.isNewCustomer && !form.newCustomer.name.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุชื่อลูกค้าใหม่');
      if (!form.projectName.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุชื่องบ/โครงการ');
      if (!form.jobTypeId) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกประเภทงาน');
      if (form.hasTechnician === null) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุว่ามีทีมช่างสำหรับโครงการนี้หรือไม่');
      if (form.isPcAssembly === null) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุว่ามีงานประกอบอุปกรณ์หรือไม่');
      if (form.biddingType === 'ยื่น' && !form.biddingDate.trim()) return Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุวันที่ยื่นซอง');
    }
    Alert.alert('บันทึกสำเร็จ (mock)', editId ? 'แก้ไขข้อมูลโครงการเรียบร้อย!' : 'สร้างโครงการใหม่เรียบร้อย!', [
      { text: 'ตกลง', onPress: () => (onSaved ? onSaved() : handleBack()) },
    ]);
  }

  const today = new Date();
  const todayShow = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  const showGuaranteeFields = form.guaranteeType !== 'ไม่มี';
  const isCashGuarantee = form.guaranteeType === 'เงินสด';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color="#0f172a" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name={editId ? 'create-outline' : 'folder-open-outline'} size={18} color="#3b82f6" />
            <Text style={styles.title}>{editId ? 'แก้ไขโครงการ' : 'สร้างโครงการใหม่'}</Text>
          </View>
          <View style={styles.numberBadge}>
            <Text style={styles.numberBadgeLabel}>เลขหน้างาน</Text>
            <Text style={styles.numberBadgeValue}>{editId ?? MOCK_NEXT_NUMBER}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <SectionTitle icon="information-circle-outline" text="ข้อมูลหลัก (Main Info)" />

            <FieldLabel text="วันที่ลงข้อมูล (อ้างอิงตามระบบ)" />
            <View style={styles.readonlyInput}>
              <Ionicons name="calendar-outline" size={14} color="#64748b" />
              <Text style={styles.readonlyInputText}>{todayShow}</Text>
            </View>

            <TouchableOpacity style={styles.stockSiteBox} onPress={() => set('isStockSite', !form.isStockSite)} activeOpacity={0.8}>
              <Ionicons name={form.isStockSite ? 'checkbox' : 'square-outline'} size={20} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={styles.stockSiteTitle}>สร้างเป็นหน้างานสต๊อก</Text>
                <Text style={styles.stockSiteHint}>หากติ๊กเลือก ระบบจะไม่บังคับกรอกข้อมูลใดๆ (เว้นว่างได้ทั้งหมด)</Text>
              </View>
            </TouchableOpacity>

            <FieldLabel text="บริษัท" required />
            <ChipPicker options={COMPANIES} value={form.companyId} onChange={(v) => set('companyId', v)} />

            <View style={styles.customerHeaderRow}>
              <FieldLabel text="ชื่อลูกค้า" required />
              <TouchableOpacity style={styles.newCustomerToggle} onPress={() => set('isNewCustomer', !form.isNewCustomer)}>
                <Ionicons name={form.isNewCustomer ? 'checkbox' : 'square-outline'} size={14} color="#2563eb" />
                <Text style={styles.newCustomerToggleText}>เพิ่มลูกค้าใหม่</Text>
              </TouchableOpacity>
            </View>

            {!form.isNewCustomer ? (
              <ChipPicker options={CUSTOMERS} value={form.customerId} onChange={(v) => set('customerId', v)} />
            ) : (
              <View style={styles.newCustomerBox}>
                <TextInput style={styles.input} placeholder="ชื่อลูกค้าใหม่" placeholderTextColor="#94a3b8" value={form.newCustomer.name} onChangeText={(v) => setNew('name', v)} />
                <TextInput style={styles.input} placeholder="สังกัด / หน่วยงาน เช่น สพฐ., อบต." placeholderTextColor="#94a3b8" value={form.newCustomer.affiliation} onChangeText={(v) => setNew('affiliation', v)} />
                <TextInput style={styles.input} placeholder="ชื่อผู้ติดต่อ" placeholderTextColor="#94a3b8" value={form.newCustomer.contactPerson} onChangeText={(v) => setNew('contactPerson', v)} />
                <TextInput style={styles.input} placeholder="ที่อยู่ (เลขที่, หมู่, ซอย, ถนน)" placeholderTextColor="#94a3b8" value={form.newCustomer.address} onChangeText={(v) => setNew('address', v)} />
                <View style={styles.rowGap}>
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="จังหวัด" placeholderTextColor="#94a3b8" value={form.newCustomer.province} onChangeText={(v) => setNew('province', v)} />
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="อำเภอ/เขต" placeholderTextColor="#94a3b8" value={form.newCustomer.district} onChangeText={(v) => setNew('district', v)} />
                </View>
                <View style={styles.rowGap}>
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="ตำบล/แขวง" placeholderTextColor="#94a3b8" value={form.newCustomer.subDistrict} onChangeText={(v) => setNew('subDistrict', v)} />
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="รหัสไปรษณีย์" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={form.newCustomer.zipCode} onChangeText={(v) => setNew('zipCode', v)} />
                </View>
                <TextInput style={[styles.input, styles.textarea]} placeholder="หมายเหตุ (ถ้ามี)" placeholderTextColor="#94a3b8" multiline value={form.newCustomer.remark} onChangeText={(v) => setNew('remark', v)} />
              </View>
            )}

            <FieldLabel text="ชื่องบ / โครงการ" required />
            <TextInput style={[styles.input, styles.textarea]} placeholder="ระบุชื่อโครงการ..." placeholderTextColor="#94a3b8" multiline value={form.projectName} onChangeText={(v) => set('projectName', v)} />

            <FieldLabel text="ประเภทงาน" required />
            <ChipPicker options={JOB_TYPES} value={form.jobTypeId} onChange={(v) => set('jobTypeId', v)} />

            <FieldLabel text="ยอดงบ / โครงการ (บาท)" />
            <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={form.projectBudget} onChangeText={(v) => set('projectBudget', v)} />

            <FieldLabel text="ผู้รับผิดชอบโครงการ" />
            <View style={styles.rowGap}>
              <TouchableOpacity style={[styles.radioPill, form.salesType === 'บุคคล' && styles.radioPillActive]} onPress={() => set('salesType', 'บุคคล')}>
                <Text style={[styles.radioPillText, form.salesType === 'บุคคล' && styles.radioPillTextActive]}>บุคคล</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.radioPill, form.salesType === 'ทีม' && styles.radioPillActive]} onPress={() => set('salesType', 'ทีม')}>
                <Text style={[styles.radioPillText, form.salesType === 'ทีม' && styles.radioPillTextActive]}>ทีม</Text>
              </TouchableOpacity>
            </View>
            {form.salesType === 'บุคคล' ? (
              <ChipPicker options={USERS} value={form.salesUser} onChange={(v) => set('salesUser', v)} />
            ) : (
              <ChipPicker options={SALES_TEAMS} value={form.salesTeam} onChange={(v) => set('salesTeam', v)} />
            )}

            <FieldLabel text="ผู้ติดตามหนี้" />
            <ChipPicker options={USERS} value={form.debtUser} onChange={(v) => set('debtUser', v)} />

            <View style={styles.divider} />
            <Text style={styles.subHeading}>การค้ำประกัน</Text>

            <FieldLabel text="ประเภทการค้ำประกัน" />
            <ChipPicker
              options={['ไม่มี', 'หนังสือค้ำ', 'ค้ำแบบจนกว่าจะหมดภาระผูกพันธ์', 'เงินสด']}
              value={form.guaranteeType}
              onChange={(v) => set('guaranteeType', v as GuaranteeType)}
            />

            {showGuaranteeFields && (
              <>
                <FieldLabel text="จำนวนเงินค้ำประกัน (บาท)" />
                <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={form.guaranteeAmount} onChangeText={(v) => set('guaranteeAmount', v)} />

                {!isCashGuarantee ? (
                  <>
                    <FieldLabel text="ธนาคารผู้ออกหนังสือ" />
                    <ChipPicker options={BANKS} value={form.bankName} onChange={(v) => set('bankName', v)} />
                    <FieldLabel text="เลขที่บัญชี" />
                    <TextInput style={styles.input} placeholder="ระบุเลขที่บัญชี..." placeholderTextColor="#94a3b8" value={form.bankAccount} onChangeText={(v) => set('bankAccount', v)} />
                    <FieldLabel text="เลขที่หนังสือค้ำ" />
                    <TextInput style={styles.input} placeholder="ระบุเลขที่..." placeholderTextColor="#94a3b8" value={form.guaranteeNo} onChangeText={(v) => set('guaranteeNo', v)} />
                  </>
                ) : (
                  <>
                    <FieldLabel text="เลขที่บิล" />
                    <TextInput style={styles.input} placeholder="ระบุเลขที่บิล..." placeholderTextColor="#94a3b8" value={form.guaranteeNo} onChangeText={(v) => set('guaranteeNo', v)} />
                  </>
                )}

                <View style={styles.rowGap}>
                  <View style={{ flex: 1 }}>
                    <FieldLabel text="วันเริ่มค้ำประกัน" />
                    <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={form.guaranteeStartDate} onChangeText={(v) => set('guaranteeStartDate', v)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FieldLabel text="วันสิ้นสุดค้ำประกัน" />
                    <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={form.guaranteeEndDate} onChangeText={(v) => set('guaranteeEndDate', v)} />
                  </View>
                </View>

                <FieldLabel text="ระยะเวลารับประกัน" required />
                <View style={styles.rowGap}>
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="จำนวน" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={form.warrantyValue} onChangeText={(v) => set('warrantyValue', v)} />
                  <View style={{ flex: 1 }}>
                    <ChipPicker options={['days', 'months', 'years']} value={form.warrantyUnit} onChange={(v) => set('warrantyUnit', v as DurationUnit)} />
                  </View>
                </View>
              </>
            )}

            <FieldLabel text="ระยะเวลาจัดส่ง (วัน)" />
            <TextInput style={styles.input} placeholder="ระบุจำนวนวัน" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={form.deliveryDays} onChangeText={(v) => set('deliveryDays', v)} />
          </View>

          <View style={styles.card}>
            <SectionTitle icon="construct-outline" text="ข้อมูลทีมช่าง (Technician Info)" />

            <FieldLabel text="มีทีมช่างสำหรับโครงการนี้หรือไม่?" required />
            <TwoOptionToggle value={form.hasTechnician} labelA="ไม่มีช่าง" labelB="มีทีมช่าง" onChange={(v) => set('hasTechnician', v)} />

            {form.hasTechnician && (
              <View style={{ marginTop: 14 }}>
                {form.techTeams.map((team, tIdx) => (
                  <View key={team.id} style={styles.teamBlock}>
                    <View style={styles.teamBlockHeader}>
                      <Text style={styles.teamBlockTitle}>ทีมที่ {tIdx + 1}</Text>
                      {tIdx > 0 && (
                        <TouchableOpacity onPress={() => removeTeam(team.id)} style={styles.teamDeleteBtn}>
                          <Ionicons name="trash-outline" size={13} color="#ef4444" />
                          <Text style={styles.teamDeleteBtnText}>ลบทีมนี้</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <FieldLabel text="ชื่อทีมที่ต้องการช่าง" />
                    <ChipPicker options={TECH_TEAMS} value={team.teamName} onChange={(v) => updateTeamName(team.id, v)} />

                    <FieldLabel text="รายชื่อช่างประจำทีมนี้" />
                    {team.technicians.map((name, tnIdx) => (
                      <View key={tnIdx} style={styles.techNameRow}>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          placeholder="พิมพ์ชื่อช่าง..."
                          placeholderTextColor="#94a3b8"
                          value={name}
                          onChangeText={(v) => updateTechName(team.id, tnIdx, v)}
                        />
                        {team.technicians.length > 1 && (
                          <TouchableOpacity onPress={() => removeTechFromTeam(team.id, tnIdx)} style={styles.techRemoveBtn}>
                            <Ionicons name="close" size={14} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                    <TouchableOpacity style={styles.addTechBtn} onPress={() => addTechToTeam(team.id)}>
                      <Ionicons name="add" size={13} color="#059669" />
                      <Text style={styles.addTechBtnText}>เพิ่มช่างในทีมนี้</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity style={styles.addTeamBtn} onPress={addTeam}>
                  <Ionicons name="people-outline" size={14} color="#fff" />
                  <Text style={styles.addTeamBtnText}>เพิ่มทีมช่าง</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <SectionTitle icon="desktop-outline" text="ข้อมูลงานประกอบอุปกรณ์ (Hardware Assembly)" />
            <TwoOptionToggle value={form.isPcAssembly} labelA="ไม่มีประกอบ" labelB="มีประกอบ" onChange={(v) => set('isPcAssembly', v)} />
          </View>

          <View style={styles.card}>
            <SectionTitle icon="document-text-outline" text="ข้อมูลสัญญา (Contract)" />

            <View style={styles.rowGap}>
              <View style={{ flex: 1 }}>
                <FieldLabel text="เลขที่สัญญา" />
                <TextInput style={styles.input} placeholder="ระบุเลขที่สัญญา..." placeholderTextColor="#94a3b8" value={form.contractNo} onChangeText={(v) => set('contractNo', v)} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel text="เลขที่ใบสั่งซื้อ" />
                <TextInput style={styles.input} placeholder="ระบุเลขที่ใบสั่งซื้อ..." placeholderTextColor="#94a3b8" value={form.purchaseOrderNo} onChangeText={(v) => set('purchaseOrderNo', v)} />
              </View>
            </View>

            <FieldLabel text="วันที่เริ่มสัญญา" />
            <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={form.startDate} onChangeText={(v) => set('startDate', v)} />

            <FieldLabel text="กำหนดส่งมอบงาน" />
            <View style={styles.rowGap}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="ระบุจำนวน" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={form.contractDuration} onChangeText={(v) => set('contractDuration', v)} />
              <View style={{ flex: 1 }}>
                <ChipPicker options={['days', 'months', 'years']} value={form.contractUnit} onChange={(v) => set('contractUnit', v as DurationUnit)} />
              </View>
            </View>

            <FieldLabel text="วันที่สิ้นสุดสัญญา" />
            <TextInput
              style={[styles.input, { color: '#15803d', fontWeight: '700' }]}
              placeholder="คำนวณอัตโนมัติจากวันเริ่ม+ระยะเวลา"
              placeholderTextColor="#94a3b8"
              value={computedEndDate}
              onChangeText={(v) => {
                set('endDateManual', true);
                set('endDate', v);
              }}
            />
            {!form.endDateManual && <Text style={styles.autoHint}>คำนวณอัตโนมัติ — พิมพ์เพื่อแก้ไขเอง</Text>}

            <View style={styles.rowGap}>
              <View style={{ flex: 1 }}>
                <FieldLabel text="แจ้งเตือนก่อนหมดสัญญา (วัน)" />
                <TextInput style={styles.input} placeholder="เช่น 45, 60" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={form.alertContractDays} onChangeText={(v) => set('alertContractDays', v)} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel text="แนบไฟล์เอกสารสัญญา" />
                <TouchableOpacity style={styles.attachBtn} onPress={() => Alert.alert('แนบไฟล์', 'ต้องเพิ่ม expo-document-picker เพื่อเลือกไฟล์จริงบนมือถือ')}>
                  <Ionicons name="attach-outline" size={14} color="#dc2626" />
                  <Text style={styles.attachBtnText}>แนบไฟล์ PDF/รูปภาพ</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <SectionTitle icon="mail-open-outline" text="การยื่นซอง & ใบเสนอราคา" />

            <FieldLabel text="ประเภทการยื่นซอง" />
            <View style={styles.rowGap}>
              <TouchableOpacity style={[styles.radioPill, form.biddingType === 'ไม่ยื่น' && styles.radioPillActive]} onPress={() => set('biddingType', 'ไม่ยื่น')}>
                <Text style={[styles.radioPillText, form.biddingType === 'ไม่ยื่น' && styles.radioPillTextActive]}>ไม่ยื่น</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.radioPill, form.biddingType === 'ยื่น' && styles.radioPillActive]} onPress={() => set('biddingType', 'ยื่น')}>
                <Text style={[styles.radioPillText, form.biddingType === 'ยื่น' && styles.radioPillTextActive]}>ยื่น</Text>
              </TouchableOpacity>
            </View>

            {form.biddingType === 'ยื่น' && (
              <>
                <FieldLabel text="วันที่ยื่นซอง" required />
                <TextInput style={styles.input} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={form.biddingDate} onChangeText={(v) => set('biddingDate', v)} />
              </>
            )}

            <FieldLabel text="เลขที่ใบเสนอราคา" />
            <TextInput style={styles.input} placeholder="ระบุเลขที่ใบเสนอราคา..." placeholderTextColor="#94a3b8" value={form.quotationNo} onChangeText={(v) => set('quotationNo', v)} />

            <FieldLabel text="ผู้เปิดใบเสนอราคา" />
            <ChipPicker options={USERS} value={form.quoteCreator} onChange={(v) => set('quoteCreator', v)} />
          </View>

          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleBack}>
              <Ionicons name="close" size={16} color="#475569" />
              <Text style={styles.cancelBtnText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Ionicons name="save-outline" size={17} color="#fff" />
              <Text style={styles.saveBtnText}>บันทึกข้อมูลโครงการ</Text>
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
  safeArea: { flex: 1, backgroundColor: '#f4f7f9' },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15.5, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  numberBadge: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center' },
  numberBadgeLabel: { fontSize: 8.5, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase' },
  numberBadgeValue: { fontSize: 13, color: '#4f46e5', fontWeight: '800' },

  body: { padding: 14 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 14 },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#334155', alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14 },
  sectionTitleText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },

  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 10 },
  required: { color: '#ef4444' },

  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#0f172a', backgroundColor: '#fff' },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
  rowGap: { flexDirection: 'row', gap: 8 },
  autoHint: { fontSize: 10, color: '#94a3b8', marginTop: 4 },

  readonlyInput: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  readonlyInputText: { fontSize: 13, color: '#64748b', fontWeight: '700' },

  stockSiteBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#10b981', borderStyle: 'dashed', borderRadius: 12, padding: 12, marginTop: 12 },
  stockSiteTitle: { fontSize: 13, fontWeight: '800', color: '#047857' },
  stockSiteHint: { fontSize: 10.5, color: '#059669', marginTop: 2 },

  chipsRow: { gap: 6, paddingVertical: 2 },
  chip: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 220 },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  customerHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  newCustomerToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  newCustomerToggleText: { fontSize: 11, color: '#2563eb', fontWeight: '700' },
  newCustomerBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, gap: 8, marginTop: 4 },

  radioPill: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#fff' },
  radioPillActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  radioPillText: { fontSize: 12.5, color: '#64748b', fontWeight: '700' },
  radioPillTextActive: { color: '#2563eb' },

  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 16 },
  subHeading: { fontSize: 12.5, fontWeight: '800', color: '#7c3aed', marginBottom: 4 },

  twoOptionRow: { flexDirection: 'row', gap: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10 },
  twoOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center', paddingVertical: 6 },
  twoOptionBtnActiveNeutral: {},
  twoOptionBtnActiveGreen: {},
  twoOptionText: { fontSize: 12.5, fontWeight: '700', color: '#64748b' },

  teamBlock: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 12, padding: 12, marginBottom: 12 },
  teamBlockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  teamBlockTitle: { fontSize: 12.5, fontWeight: '800', color: '#047857' },
  teamDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  teamDeleteBtnText: { fontSize: 10.5, fontWeight: '700', color: '#ef4444' },

  techNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  techRemoveBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  addTechBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 4 },
  addTechBtnText: { fontSize: 11, fontWeight: '700', color: '#059669' },

  addTeamBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#059669', borderRadius: 10, paddingVertical: 11 },
  addTeamBtnText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },

  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10 },
  attachBtnText: { fontSize: 11.5, fontWeight: '700', color: '#dc2626' },

  footerRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 15 },
  cancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 14 },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 15 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});