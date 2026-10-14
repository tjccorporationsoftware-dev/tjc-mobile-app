/**
 * CheckCostScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของชุดฟอร์ม ปร.4 / ปร.5 / ปร.6 / Factor F จาก check_cost.php
 * สำหรับแอป tjc-mobile-app (Expo / React Native)
 *
 * ตามที่เลือกไว้: ทำชุด ปร.4/ปร.5/ปร.6/Factor F ก่อน (ข้าม Tab "ฟอร์มทำทุนทั่วไป")
 * และพยายามใส่ฟีเจอร์ power-user ให้ครบที่สุดเท่าที่ทำได้แบบไม่ต้องพึ่ง native module เพิ่ม
 *
 * สถานะไฟล์นี้: เชื่อม API จริงแล้ว (GET api_save_estimate.php action=detail ตอนแก้ไข, POST
 * action=save ตอนบันทึก) — action/param names เป็นการเดาตาม TODO เดิม ยังไม่ได้ยืนยันกับ backend จริง
 *
 * ตรงกับสูตร/พฤติกรรมจริงจาก check_cost.php:
 *  - ปร.4: รายการแบ่งเป็น "หมวดงาน" (category) แต่ละรายการมี จำนวน/หน่วย/ค่าวัสดุ(ต่อหน่วย+รวม)/
 *    ค่าแรงงาน(ต่อหน่วย+รวม)/รวมวัสดุ+แรง/ทุนต่อหน่วย/รวมทุน — ตรงกับ addCategory2()/addRow2ToGroup()
 *  - รวมวัสดุ+แรงงานทั้งหมด × Factor F = ราคายื่น (auto, override เองได้ — data-manual flag)
 *    ตรงกับ calculateGrandTotal2()
 *  - ทุน% = (รวมทุน/ราคายื่น)×100, กำไร% = (ราคายื่น×100/รวมทุน)-100 — สูตรเดียวกับต้นฉบับ
 *  - ปร.5: ตารางสรุป แถวแรกดึงจาก ปร.4 อัตโนมัติ (ค่างานต้นทุน × Factor F = ค่าก่อสร้าง)
 *    เพิ่มแถวเองได้ ตรงกับ calcPR5()
 *  - ปร.6: ผลรวมจาก ปร.5 ไหลมาอัตโนมัติเป็นค่าก่อสร้างสุทธิ ตรงกับโค้ดที่ sync pr6-cost-1/pr6-grand-total
 *  - Factor F: สูตร F = D − [(D−E)×(A−B)] / (C−B), A มาจาก ปร.4 อัตโนมัติ, B/C/D/E กรอกเอง,
 *    กรณี A=B ผลลัพธ์=D, A=C ผลลัพธ์=E — ตรงกับ calculateFF() เป๊ะ พร้อมตารางอ้างอิง Factor F
 *    งานอาคารจากต้นฉบับ (ปุ่ม "ใช้ค่านี้ในปร.4" แทนการ auto-push ทุกครั้งที่พิมพ์ เพื่อลด re-render บนมือถือ)
 *
 * ฟีเจอร์ power-user ที่ใส่มาให้ (ทำงานได้จริงแบบ local, ไม่ต้องเพิ่ม native module):
 *  - เลือกหลายรายการ (checkbox) + ใส่ลิงก์อ้างอิงให้ทีเดียวทั้งหมด (bulk apply)
 *  - "กรอกแบบตาราง (Grid)" — วางข้อความหลายบรรทัด คั่นด้วย Tab เพื่อสร้างหลายรายการทีเดียว
 *  - Autocomplete ชื่อรายการแบบง่าย (filter จากลิสต์ตัวอย่างในเครื่อง)
 *
 * ฟีเจอร์ที่ต้องมี native module/เอนด์พอยต์เพิ่ม จึงเป็น stub พร้อม TODO:
 *  - นำเข้า/ส่งออก Excel (ต้อง xlsx + expo-document-picker + expo-file-system)
 *  - แนบไฟล์เอกสาร (ต้อง expo-document-picker/expo-image-picker)
 *  - เซฟเป็นต้นแบบ / ดึงต้นแบบมาใช้ (ต้อง endpoint รายการ template ที่ไม่ได้อยู่ในไฟล์ที่ส่งมา)
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons
 * ------------------------------------------------------------------
 */

import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

// ✅ Config
import { API_BASE } from '../../constants/config';

// action สำหรับโหลดข้อมูลตอนแก้ไข ('detail') เป็นการเดา — ส่วน payload ของ action='save' อ้างอิงจาก
// TODO เดิมของไฟล์นี้ ยังไม่ได้ยืนยันกับ backend จริงทั้งคู่
const API_URL = `${API_BASE}/api_save_estimate.php`;

// ====================================================================
// Types
// ====================================================================

type TabKey = 'pr4' | 'pr5' | 'pr6' | 'factorF';

interface Pr4Item {
  id: string;
  name: string;
  isExpense: boolean;
  model: string;
  note: string;
  qty: string;
  unit: string;
  matUnitPrice: string;
  laborUnitPrice: string;
  costUnitPrice: string;
  sourceLink: string;
  selected: boolean;
}

interface Pr4Category {
  id: string;
  name: string;
  subLabel: string;
  subLabel2: string;
  items: Pr4Item[];
}

interface Pr5Row {
  id: string;
  name: string;
  cost: string;
  factor: string;
  locked?: boolean; // แถวแรก sync จาก ปร.4 อัตโนมัติ
}

interface HeaderInfo {
  projectName: string;
  agency: string;
  location: string;
  province: string;
  date: string;
  sheetsPr5: string;
  sheetsPr6: string;
}

interface FactorFInputs {
  B: string;
  C: string;
  D: string;
  E: string;
  advance: string;
  retention: string;
  interest: string;
  vat: string;
}

export interface CheckCostScreenProps {
  onBack?: () => void;
  onSaved?: () => void;
  editUuid?: string; // ถ้ามี = โหมดแก้ไข (ยังไม่ preload ข้อมูลจริง — ดู TODO)
}

// ====================================================================
// Constants
// ====================================================================

const TABS: { key: TabKey; label: string; icon: keyof typeof FontAwesome5.glyphMap }[] = [
  { key: 'pr4', label: 'ฟอร์ม ปร.4', icon: 'hard-hat' },
  { key: 'pr5', label: 'ฟอร์ม ปร.5', icon: 'file-signature' },
  { key: 'pr6', label: 'ฟอร์ม ปร.6', icon: 'file-contract' },
  { key: 'factorF', label: 'Factor F', icon: 'calculator' },
];

const UNIT_SUGGESTIONS = ['ชุด', 'ตัว', 'เมตร', 'ตร.ม.', 'ลบ.ม.', 'งาน', 'แผ่น', 'จุด', 'ม้วน'];

const ITEM_NAME_SUGGESTIONS = [
  'สายไฟ THW 2.5 sq.mm.',
  'ท่อ PVC ขนาด 1/2 นิ้ว',
  'เต้ารับคู่ 16A',
  'เบรกเกอร์ลูกย่อย 20A',
  'ตู้คอนซูมเมอร์ยูนิต 12 ช่อง',
  'โคมไฟ LED Downlight 12W',
  'ค่าแรงเดินสายไฟ (ต่อจุด)',
  'ค่าแรงติดตั้งเต้ารับ/สวิตช์',
  'ปูนซีเมนต์ปอร์ตแลนด์',
  'เหล็กเส้นกลม RB9',
  'ค่าแรงงานก่ออิฐฉาบปูน',
  'กระเบื้องเซรามิค 60x60 ซม.',
];

// ตารางอ้างอิง Factor F งานอาคาร (ต้นฉบับจาก check_cost.php)
const FACTOR_F_REFERENCE: { work: string; factor: string }[] = [
  { work: '<0.5', factor: '1.3091' },
  { work: '1', factor: '1.3067' },
  { work: '2', factor: '1.3051' },
  { work: '5', factor: '1.3020' },
  { work: '10', factor: '1.2960' },
  { work: '15', factor: '1.2611' },
  { work: '20', factor: '1.2535' },
  { work: '25', factor: '1.2265' },
  { work: '30', factor: '1.2181' },
  { work: '40', factor: '1.2177' },
  { work: '50', factor: '1.2176' },
  { work: '60', factor: '1.2078' },
  { work: '70', factor: '1.2067' },
  { work: '80', factor: '1.2067' },
  { work: '90', factor: '1.2066' },
  { work: '100', factor: '1.2066' },
  { work: '150', factor: '1.2039' },
  { work: '200', factor: '1.2039' },
  { work: '250', factor: '1.2031' },
  { work: '300', factor: '1.1969' },
  { work: '350', factor: '1.1884' },
  { work: '400', factor: '1.1877' },
  { work: '500', factor: '1.1871' },
  { work: '>500', factor: '1.1805' },
];

let uidCounter = 1;
function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}_${Date.now()}_${uidCounter}`;
}

function mkItem(partial: Partial<Pr4Item> = {}): Pr4Item {
  return {
    id: uid('item'),
    name: '',
    isExpense: false,
    model: '',
    note: '',
    qty: '1',
    unit: '',
    matUnitPrice: '',
    laborUnitPrice: '',
    costUnitPrice: '',
    sourceLink: '',
    selected: false,
    ...partial,
  };
}

function mkCategory(name = '', items: Pr4Item[] = []): Pr4Category {
  return { id: uid('cat'), name, subLabel: '', subLabel2: '', items };
}

// ====================================================================
// Helpers — คำนวณเหมือนต้นฉบับเป๊ะ
// ====================================================================

function num(s: string): number {
  const v = parseFloat((s || '').replace(/,/g, ''));
  return isNaN(v) ? 0 : v;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeItemTotals(item: Pr4Item) {
  const qty = num(item.qty);
  const matUnit = num(item.matUnitPrice);
  const laborUnit = num(item.laborUnitPrice);
  const costUnit = num(item.costUnitPrice);
  const matTotal = qty * matUnit;
  const laborTotal = qty * laborUnit;
  const totalMatLab = matTotal + laborTotal;
  const costTotal = qty * costUnit;
  return { qty, matTotal, laborTotal, totalMatLab, costTotal };
}

function pr5RowTotal(row: Pr5Row): number {
  const c = num(row.cost);
  const f = parseFloat(row.factor) || 0;
  return f > 0 ? c * f : c;
}

// สูตรเดียวกับ calculateFF() ในต้นฉบับเป๊ะ
function computeFactorF(A: number, B: number, C: number, D: number, E: number): number {
  if (A === B) return D;
  if (A === C) return E;
  if (C !== B && A > B && A < C) return D - ((D - E) * (A - B)) / (C - B);
  return D;
}

// ====================================================================
// Main screen
// ====================================================================

export default function CheckCostScreen({ onBack, onSaved, editUuid }: CheckCostScreenProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('pr4');

  const [header, setHeader] = useState<HeaderInfo>({
    projectName: '',
    agency: '',
    location: '',
    province: '',
    date: '',
    sheetsPr5: '',
    sheetsPr6: '',
  });

  const [categories, setCategories] = useState<Pr4Category[]>([
    mkCategory('งานระบบไฟฟ้าภายในอาคาร', [
      mkItem({ name: 'สายไฟ THW 2.5 sq.mm.', qty: '120', unit: 'เมตร', matUnitPrice: '18', laborUnitPrice: '5', costUnitPrice: '15' }),
      mkItem({ name: 'เต้ารับคู่ 16A', qty: '24', unit: 'ตัว', matUnitPrice: '120', laborUnitPrice: '80', costUnitPrice: '95' }),
    ]),
  ]);

  const [useFactorF, setUseFactorF] = useState(true);
  const [factorF, setFactorF] = useState('1.3091');
  const [submitPrice, setSubmitPrice] = useState('');
  const [submitManual, setSubmitManual] = useState(false);

  const [pr5ExtraRows, setPr5ExtraRows] = useState<Pr5Row[]>([]);
  const [pr6Note, setPr6Note] = useState('');

  const [ff, setFf] = useState<FactorFInputs>({ B: '', C: '500,000', D: '1.3091', E: '1.3091', advance: '0.00', retention: '0.00', interest: '7.00', vat: '7.00' });

  // -------------------- Selection & bulk apply --------------------
  const [selectMode, setSelectMode] = useState(false);
  const [bulkLinkModal, setBulkLinkModal] = useState(false);
  const [bulkLinkText, setBulkLinkText] = useState('');

  // -------------------- Grid paste modal --------------------
  const [gridModal, setGridModal] = useState<{ visible: boolean; categoryId?: string }>({ visible: false });
  const [gridText, setGridText] = useState('');

  // -------------------- Autocomplete --------------------
  const [autocompleteFor, setAutocompleteFor] = useState<string | null>(null); // item id ที่กำลังพิมพ์อยู่

  // -------------------- Preload ตอนแก้ไข (editUuid) --------------------
  const [loadingEdit, setLoadingEdit] = useState(!!editUuid);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editUuid) return;
    let cancelled = false;
    (async () => {
      setLoadingEdit(true);
      try {
        const res = await axios.get(API_URL, { params: { action: 'detail', uuid: editUuid } });
        const d = res.data?.data ?? res.data;
        if (cancelled || !d) return;
        if (d.header) setHeader((h) => ({ ...h, ...d.header }));
        if (Array.isArray(d.categories) && d.categories.length > 0) setCategories(d.categories);
        if (d.use_factor_f != null) setUseFactorF(Boolean(d.use_factor_f));
        if (d.factor_f != null) setFactorF(String(d.factor_f));
        if (d.submitted_price != null) {
          setSubmitPrice(String(d.submitted_price));
          setSubmitManual(true);
        }
        if (Array.isArray(d.pr5_rows)) setPr5ExtraRows(d.pr5_rows.filter((r: Pr5Row) => !r.locked));
        if (d.pr6_note != null) setPr6Note(String(d.pr6_note));
        if (d.factor_f_calc) setFf((prev) => ({ ...prev, ...d.factor_f_calc }));
      } catch (e) {
        console.error('load api_save_estimate detail failed', e);
        if (!cancelled) Alert.alert('โหลดข้อมูลไม่สำเร็จ', 'ไม่สามารถโหลดข้อมูลใบประเมินราคานี้ได้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editUuid]);

  // -------------------- Derived totals (ปร.4) --------------------
  const totals = useMemo(() => {
    let grandTotalMatLab = 0;
    let grandTotalCost = 0;
    categories.forEach((cat) => {
      cat.items.forEach((it) => {
        const t = computeItemTotals(it);
        grandTotalMatLab += t.totalMatLab;
        grandTotalCost += t.costTotal;
      });
    });
    const factorFVal = useFactorF ? parseFloat(factorF) || 1 : 1;
    const autoSubmit = grandTotalMatLab * factorFVal;
    const submit = submitManual ? num(submitPrice) : autoSubmit;
    const costPercent = submit > 0 ? (grandTotalCost / submit) * 100 : null;
    const diff = submit - grandTotalCost;
    const profitPercent = grandTotalCost > 0 ? (submit * 100) / grandTotalCost - 100 : submit > 0 ? 100 : 0;
    return { grandTotalMatLab, grandTotalCost, factorFVal, autoSubmit, submit, costPercent, diff, profitPercent };
  }, [categories, useFactorF, factorF, submitManual, submitPrice]);

  // -------------------- Derived (ปร.5 / ปร.6) --------------------
  const pr5Rows: Pr5Row[] = useMemo(() => {
    const row0: Pr5Row = {
      id: 'pr5_auto_0',
      name: 'ค่างานต้นทุน (จาก ปร.4)',
      cost: fmt(totals.grandTotalMatLab),
      factor: totals.factorFVal.toFixed(4),
      locked: true,
    };
    return [row0, ...pr5ExtraRows];
  }, [totals.grandTotalMatLab, totals.factorFVal, pr5ExtraRows]);

  const pr5GrandTotal = useMemo(() => pr5Rows.reduce((sum, r) => sum + pr5RowTotal(r), 0), [pr5Rows]);
  const pr5SumBaseCost = useMemo(() => pr5Rows.reduce((sum, r) => sum + num(r.cost), 0), [pr5Rows]);

  const pr6Total = pr5GrandTotal; // sync ตรงตัวเหมือนต้นฉบับ

  // -------------------- Derived (Factor F) --------------------
  const ffResult = useMemo(() => {
    const A = totals.grandTotalMatLab;
    const B = num(ff.B);
    const C = num(ff.C);
    const D = parseFloat(ff.D) || 0;
    const E = parseFloat(ff.E) || 0;
    return computeFactorF(A, B, C, D, E);
  }, [totals.grandTotalMatLab, ff]);

  // -------------------- Category / item actions --------------------

  function addCategory() {
    setCategories((prev) => [...prev, mkCategory('')]);
  }

  function removeCategory(catId: string) {
    Alert.alert('ยืนยันการลบหมวดงาน', 'รายการย่อยทั้งหมดในหมวดนี้จะถูกลบทิ้งด้วย', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบทิ้ง', style: 'destructive', onPress: () => setCategories((prev) => prev.filter((c) => c.id !== catId)) },
    ]);
  }

  function updateCategoryField(catId: string, field: 'name' | 'subLabel' | 'subLabel2', value: string) {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, [field]: value } : c)));
  }

  function addItem(catId: string, partial?: Partial<Pr4Item>) {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, items: [...c.items, mkItem(partial)] } : c)));
  }

  function removeItem(catId: string, itemId: string) {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, items: c.items.filter((it) => it.id !== itemId) } : c)));
  }

  function updateItemField(catId: string, itemId: string, field: keyof Pr4Item, value: string | boolean) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId ? { ...c, items: c.items.map((it) => (it.id === itemId ? { ...it, [field]: value } : it)) } : c
      )
    );
  }

  function toggleSelectItem(catId: string, itemId: string) {
    updateItemField(catId, itemId, 'selected', !categories.find((c) => c.id === catId)?.items.find((i) => i.id === itemId)?.selected);
  }

  const selectedCount = useMemo(() => categories.reduce((sum, c) => sum + c.items.filter((i) => i.selected).length, 0), [categories]);

  function applyBulkLink() {
    if (!bulkLinkText.trim()) {
      Alert.alert('กรุณาระบุลิงก์', 'ใส่ลิงก์อ้างอิงก่อนกด "นำไปใช้"');
      return;
    }
    setCategories((prev) =>
      prev.map((c) => ({ ...c, items: c.items.map((it) => (it.selected ? { ...it, sourceLink: bulkLinkText.trim(), selected: false } : it)) }))
    );
    setBulkLinkText('');
    setBulkLinkModal(false);
    setSelectMode(false);
  }

  // -------------------- Grid paste --------------------

  function openGridModal(categoryId: string) {
    setGridText('');
    setGridModal({ visible: true, categoryId });
  }

  function applyGridPaste() {
    const catId = gridModal.categoryId;
    if (!catId) return;
    const lines = gridText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      Alert.alert('ไม่มีข้อมูล', 'วางข้อมูลอย่างน้อย 1 บรรทัดก่อนแปลง');
      return;
    }
    const newItems: Pr4Item[] = lines.map((line) => {
      const cols = line.split('\t').length > 1 ? line.split('\t') : line.split(/\s{2,}|,/);
      const [name = '', qty = '1', unit = '', matPrice = '', laborPrice = '', costPrice = ''] = cols.map((c) => c.trim());
      return mkItem({ name, qty: qty || '1', unit, matUnitPrice: matPrice, laborUnitPrice: laborPrice, costUnitPrice: costPrice });
    });
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, items: [...c.items, ...newItems] } : c)));
    setGridModal({ visible: false });
    Alert.alert('สำเร็จ', `เพิ่ม ${newItems.length} รายการจาก Grid แล้ว`);
  }

  // -------------------- ปร.5 row actions --------------------

  function addPr5Row() {
    setPr5ExtraRows((prev) => [...prev, { id: uid('pr5'), name: '', cost: '', factor: '1.3091' }]);
  }

  function removePr5Row(id: string) {
    setPr5ExtraRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updatePr5Row(id: string, field: 'name' | 'cost' | 'factor', value: string) {
    setPr5ExtraRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  // -------------------- Factor F actions --------------------

  function applyFactorFResult() {
    setFactorF(ffResult.toFixed(4));
    Alert.alert('อัปเดตแล้ว', `ตั้งค่า Factor F ในฟอร์ม ปร.4 เป็น ${ffResult.toFixed(4)} เรียบร้อย`);
  }

  // -------------------- Stub actions (ต้อง native module / endpoint เพิ่ม) --------------------

  function stubFeature(name: string, detail: string) {
    Alert.alert(name, detail);
  }

  async function handleSave() {
    if (!header.projectName.trim()) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุชื่องาน/โครงการก่อนบันทึก');
      return;
    }

    // payload ตรงกับ TODO เดิมของไฟล์นี้ — โครงสร้างซ้อน (categories/pr5_rows/factor_f_calc) ส่งเป็น JSON string
    // ในฟอร์ม multipart ตามธรรมเนียมของโปรเจกต์นี้ (อ่านฝั่ง PHP ด้วย json_decode($_POST[...]))
    const fd = new FormData();
    fd.append('action', 'save');
    if (editUuid) fd.append('edit_uuid', editUuid);
    fd.append('form_type', 'pr4');
    fd.append('province', header.province);
    fd.append('project_name', header.projectName);
    fd.append('agency', header.agency);
    fd.append('location', header.location);
    fd.append('date', header.date);
    fd.append('categories', JSON.stringify(categories));
    fd.append('grand_total_mat_lab', String(totals.grandTotalMatLab));
    fd.append('grand_total_cost', String(totals.grandTotalCost));
    fd.append('factor_f', factorF);
    fd.append('use_factor_f', useFactorF ? '1' : '0');
    fd.append('submitted_price', String(totals.submit));
    fd.append('pr5_rows', JSON.stringify(pr5Rows));
    fd.append('pr6_note', pr6Note);
    fd.append('factor_f_calc', JSON.stringify({ A: totals.grandTotalMatLab, B: ff.B, C: ff.C, D: ff.D, E: ff.E, result: ffResult }));

    setSaving(true);
    try {
      const res = await axios.post(API_URL, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.status === 'success' || res.data?.success) {
        Alert.alert('บันทึกสำเร็จ', `บันทึกใบประเมินราคา "${header.projectName}" เรียบร้อย`, [{ text: 'ตกลง', onPress: () => onSaved?.() }]);
      } else {
        Alert.alert('บันทึกไม่สำเร็จ', res.data?.message || 'กรุณาลองใหม่อีกครั้ง');
      }
    } catch (e) {
      console.error('save api_save_estimate failed', e);
      Alert.alert('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  // -------------------- Render: Header (ใช้ร่วมทุกแท็บยกเว้น Factor F ซึ่งมีฟิลด์แยก) --------------------

  function renderSharedHeaderFields() {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>ข้อมูลส่วนหัวเอกสาร</Text>
        <TextInput style={styles.input} placeholder="งานปรับปรุง/ซ่อมแซม (ชื่องาน)" placeholderTextColor="#94a3b8" value={header.projectName} onChangeText={(v) => setHeader((h) => ({ ...h, projectName: v }))} />
        <TextInput style={styles.input} placeholder="หน่วยงาน / เจ้าของโครงการ" placeholderTextColor="#94a3b8" value={header.agency} onChangeText={(v) => setHeader((h) => ({ ...h, agency: v }))} />
        <TextInput style={styles.input} placeholder="สถานที่ก่อสร้าง" placeholderTextColor="#94a3b8" value={header.location} onChangeText={(v) => setHeader((h) => ({ ...h, location: v }))} />
        <View style={styles.rowGap}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="จังหวัด" placeholderTextColor="#94a3b8" value={header.province} onChangeText={(v) => setHeader((h) => ({ ...h, province: v }))} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="ประมาณราคาวันที่ (DD/MM/YYYY)" placeholderTextColor="#94a3b8" value={header.date} onChangeText={(v) => setHeader((h) => ({ ...h, date: v }))} />
        </View>
      </View>
    );
  }

  // -------------------- Render: ปร.4 --------------------

  function renderItemCard(cat: Pr4Category, item: Pr4Item) {
    const t = computeItemTotals(item);
    const suggestions =
      autocompleteFor === item.id && item.name.trim().length > 0
        ? ITEM_NAME_SUGGESTIONS.filter((s) => s.toLowerCase().includes(item.name.toLowerCase())).slice(0, 4)
        : [];

    return (
      <View key={item.id} style={styles.itemCard}>
        <View style={styles.itemTopRow}>
          {selectMode && (
            <TouchableOpacity onPress={() => toggleSelectItem(cat.id, item.id)} style={[styles.checkbox, item.selected && styles.checkboxChecked]}>
              {item.selected && <Ionicons name="checkmark" size={13} color="#fff" />}
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <TextInput
              style={styles.itemNameInput}
              placeholder="พิมพ์ชื่อรายการ..."
              placeholderTextColor="#94a3b8"
              value={item.name}
              onFocus={() => setAutocompleteFor(item.id)}
              onChangeText={(v) => updateItemField(cat.id, item.id, 'name', v)}
            />
            {suggestions.length > 0 && (
              <View style={styles.suggestionRow}>
                {suggestions.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={styles.suggestionChip}
                    onPress={() => {
                      updateItemField(cat.id, item.id, 'name', s);
                      setAutocompleteFor(null);
                    }}
                  >
                    <Text style={styles.suggestionChipText} numberOfLines={1}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <TouchableOpacity onPress={() => removeItem(cat.id, item.id)} style={styles.itemDeleteBtn}>
            <Ionicons name="trash-outline" size={15} color="#ef4444" />
          </TouchableOpacity>
        </View>

        <View style={styles.itemToggleRow}>
          <TouchableOpacity style={styles.toggleChip} onPress={() => updateItemField(cat.id, item.id, 'isExpense', !item.isExpense)}>
            <Ionicons name={item.isExpense ? 'checkbox' : 'square-outline'} size={14} color={item.isExpense ? '#d97706' : '#94a3b8'} />
            <Text style={[styles.toggleChipText, item.isExpense && { color: '#d97706' }]}>ค่าใช้จ่าย</Text>
          </TouchableOpacity>
          <TextInput style={styles.noteInput} placeholder="✍️ หมายเหตุ (ถ้ามี)" placeholderTextColor="#94a3b8" value={item.note} onChangeText={(v) => updateItemField(cat.id, item.id, 'note', v)} />
        </View>

        <View style={styles.fieldGrid}>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>จำนวน</Text>
            <TextInput style={styles.fieldInput} keyboardType="decimal-pad" value={item.qty} onChangeText={(v) => updateItemField(cat.id, item.id, 'qty', v)} />
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>หน่วย</Text>
            <TextInput style={styles.fieldInput} value={item.unit} onChangeText={(v) => updateItemField(cat.id, item.id, 'unit', v)} placeholder="เมตร" placeholderTextColor="#cbd5e1" />
          </View>
        </View>
        <View style={styles.unitSuggestRow}>
          {UNIT_SUGGESTIONS.map((u) => (
            <TouchableOpacity key={u} style={styles.unitChip} onPress={() => updateItemField(cat.id, item.id, 'unit', u)}>
              <Text style={styles.unitChipText}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.priceBlockTitle}>ค่าวัสดุ (ขาย)</Text>
          <View style={styles.rowGap}>
            <TextInput style={[styles.fieldInput, { flex: 1 }]} keyboardType="decimal-pad" placeholder="ราคา/หน่วย" placeholderTextColor="#cbd5e1" value={item.matUnitPrice} onChangeText={(v) => updateItemField(cat.id, item.id, 'matUnitPrice', v)} />
            <View style={[styles.readonlyBox, { flex: 1 }]}>
              <Text style={styles.readonlyText}>{fmt(t.matTotal)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.priceBlockTitle}>ค่าแรงงาน (ขาย)</Text>
          <View style={styles.rowGap}>
            <TextInput style={[styles.fieldInput, { flex: 1 }]} keyboardType="decimal-pad" placeholder="ราคา/หน่วย" placeholderTextColor="#cbd5e1" value={item.laborUnitPrice} onChangeText={(v) => updateItemField(cat.id, item.id, 'laborUnitPrice', v)} />
            <View style={[styles.readonlyBox, { flex: 1 }]}>
              <Text style={styles.readonlyText}>{fmt(t.laborTotal)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.rowGap}>
          <View style={[styles.miniStat, { backgroundColor: '#eef2ff' }]}>
            <Text style={styles.miniStatLabel}>รวมวัสดุ+แรง</Text>
            <Text style={[styles.miniStatValue, { color: '#3730a3' }]}>{fmt(t.totalMatLab)}</Text>
          </View>
          <View style={[styles.miniStat, { backgroundColor: '#f1f5f9' }]}>
            <Text style={styles.miniStatLabel}>ทุน/หน่วย</Text>
            <TextInput style={styles.miniStatInput} keyboardType="decimal-pad" value={item.costUnitPrice} onChangeText={(v) => updateItemField(cat.id, item.id, 'costUnitPrice', v)} />
          </View>
          <View style={[styles.miniStat, { backgroundColor: '#f1f5f9' }]}>
            <Text style={styles.miniStatLabel}>รวมทุน</Text>
            <Text style={[styles.miniStatValue, { color: '#0891b2' }]}>{fmt(t.costTotal)}</Text>
          </View>
        </View>

        {!!item.sourceLink && (
          <View style={styles.linkPreview}>
            <Ionicons name="link-outline" size={12} color="#2563eb" />
            <Text style={styles.linkPreviewText} numberOfLines={1}>
              {item.sourceLink}
            </Text>
          </View>
        )}
      </View>
    );
  }

  function renderCategory(cat: Pr4Category) {
    return (
      <View key={cat.id} style={styles.categoryCard}>
        <View style={styles.categoryHeaderRow}>
          <Ionicons name="folder-open" size={16} color="#fff" />
          <TextInput style={styles.categoryNameInput} placeholder="พิมพ์ชื่อหมวดงาน..." placeholderTextColor="#c7d2fe" value={cat.name} onChangeText={(v) => updateCategoryField(cat.id, 'name', v)} />
          <TouchableOpacity onPress={() => removeCategory(cat.id)} style={styles.categoryDeleteBtn}>
            <Ionicons name="trash-outline" size={15} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.rowGap}>
          <TextInput style={[styles.subInput, { flex: 1 }]} placeholder="หัวข้อรอง" placeholderTextColor="#94a3b8" value={cat.subLabel} onChangeText={(v) => updateCategoryField(cat.id, 'subLabel', v)} />
          <TextInput style={[styles.subInput, { flex: 1 }]} placeholder="หัวข้อรอง 2" placeholderTextColor="#94a3b8" value={cat.subLabel2} onChangeText={(v) => updateCategoryField(cat.id, 'subLabel2', v)} />
        </View>

        {cat.items.map((it) => renderItemCard(cat, it))}

        <View style={styles.categoryFooterRow}>
          <TouchableOpacity style={styles.addItemBtn} onPress={() => addItem(cat.id)}>
            <Ionicons name="add-circle-outline" size={15} color="#059669" />
            <Text style={styles.addItemBtnText}>เพิ่มรายการ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addItemBtn, styles.addItemBtnAlt]} onPress={() => openGridModal(cat.id)}>
            <Ionicons name="grid-outline" size={15} color="#0284c7" />
            <Text style={[styles.addItemBtnText, { color: '#0284c7' }]}>กรอกแบบตาราง (Grid)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addItemBtn, styles.addItemBtnAlt2]}
            onPress={() => stubFeature('ดึงต้นแบบมาใช้', 'ฟีเจอร์นี้ต้องมี endpoint รายการต้นแบบเพิ่มเติม (ไม่ได้อยู่ในไฟล์ที่ส่งมา)')}
          >
            <Ionicons name="download-outline" size={15} color="#7e22ce" />
            <Text style={[styles.addItemBtnText, { color: '#7e22ce' }]}>ดึงต้นแบบมาใช้</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderPr4() {
    return (
      <View>
        {renderSharedHeaderFields()}

        <View style={styles.card}>
          <View style={styles.bulkBarRow}>
            <TouchableOpacity style={[styles.bulkToggleBtn, selectMode && styles.bulkToggleBtnActive]} onPress={() => setSelectMode((s) => !s)}>
              <Ionicons name="checkbox-outline" size={14} color={selectMode ? '#fff' : '#475569'} />
              <Text style={[styles.bulkToggleText, selectMode && { color: '#fff' }]}>{selectMode ? `เลือกแล้ว ${selectedCount} รายการ` : 'เลือกหลายรายการ'}</Text>
            </TouchableOpacity>
            {selectMode && selectedCount > 0 && (
              <TouchableOpacity style={styles.bulkApplyBtn} onPress={() => setBulkLinkModal(true)}>
                <Ionicons name="link-outline" size={14} color="#fff" />
                <Text style={styles.bulkApplyBtnText}>ใส่ลิงก์อ้างอิงให้ทั้งหมด</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.powerUserRow}>
            <TouchableOpacity style={styles.powerUserBtn} onPress={() => stubFeature('นำเข้า Excel', 'ต้องเพิ่ม xlsx + expo-document-picker เพื่ออ่านไฟล์ .xlsx จริงบนมือถือ')}>
              <Ionicons name="cloud-upload-outline" size={14} color="#d97706" />
              <Text style={[styles.powerUserBtnText, { color: '#d97706' }]}>นำเข้า Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.powerUserBtn} onPress={() => stubFeature('โหลดฟอร์มเปล่า', 'ต้องเพิ่ม expo-file-system เพื่อสร้าง/บันทึกไฟล์เทมเพลตลงเครื่อง')}>
              <Ionicons name="document-outline" size={14} color="#0891b2" />
              <Text style={[styles.powerUserBtnText, { color: '#0891b2' }]}>โหลดฟอร์มเปล่า</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.powerUserBtn} onPress={() => stubFeature('แนบไฟล์เอกสาร', 'ต้องเพิ่ม expo-document-picker เพื่อเลือกไฟล์จากเครื่อง')}>
              <Ionicons name="attach-outline" size={14} color="#7c3aed" />
              <Text style={[styles.powerUserBtnText, { color: '#7c3aed' }]}>แนบไฟล์</Text>
            </TouchableOpacity>
          </View>
        </View>

        {categories.map((cat) => renderCategory(cat))}

        <TouchableOpacity style={styles.addCategoryBtn} onPress={addCategory}>
          <Ionicons name="folder-open-outline" size={16} color="#fff" />
          <Text style={styles.addCategoryBtnText}>เพิ่มหมวดงาน (รายการหลัก)</Text>
        </TouchableOpacity>

        <View style={styles.summaryCard}>
          <View style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>รวมวัสดุและแรงงาน (ปร.4)</Text>
            <Text style={styles.summaryValue}>{fmt(totals.grandTotalMatLab)}</Text>
          </View>
          <View style={styles.summaryLine}>
            <Text style={[styles.summaryLabel, { color: '#0891b2' }]}>รวมราคาทุน</Text>
            <Text style={[styles.summaryValue, { color: '#0891b2' }]}>{fmt(totals.grandTotalCost)}</Text>
          </View>

          <View style={styles.factorSwitchRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Switch value={useFactorF} onValueChange={setUseFactorF} trackColor={{ false: '#e2e8f0', true: '#a5f3fc' }} thumbColor={useFactorF ? '#0891b2' : '#f8fafc'} />
              <Text style={styles.factorSwitchLabel}>ใช้ Factor F</Text>
            </View>
            <TextInput style={styles.factorInput} keyboardType="decimal-pad" value={factorF} onChangeText={setFactorF} />
          </View>

          <View style={styles.submitRow}>
            <Text style={styles.submitLabel}>ราคายื่น (เสนอขาย)</Text>
            <TextInput
              style={styles.submitInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#6ee7b7"
              value={submitManual ? submitPrice : fmt(totals.autoSubmit)}
              onChangeText={(v) => {
                setSubmitManual(v.trim() !== '');
                setSubmitPrice(v);
              }}
            />
          </View>
          {!submitManual && <Text style={styles.autoHint}>คำนวณอัตโนมัติจาก รวมวัสดุ+แรง × Factor F — พิมพ์เพื่อกำหนดเอง</Text>}

          <View style={styles.statPillRow}>
            <View style={styles.statPill}>
              <Text style={styles.statPillLabel}>ทุน %</Text>
              <Text style={[styles.statPillValue, { color: (totals.costPercent ?? 0) > 100 ? '#dc2626' : '#3730a3' }]}>
                {totals.costPercent === null ? '—' : `${totals.costPercent.toFixed(2)}%`}
              </Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statPillLabel}>กำไร %</Text>
              <Text style={[styles.statPillValue, { color: totals.diff >= 0 ? '#059669' : '#dc2626' }]}>{totals.profitPercent.toFixed(2)}%</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statPillLabel}>กำไร (บาท)</Text>
              <Text style={[styles.statPillValue, { color: totals.diff >= 0 ? '#059669' : '#dc2626' }]}>
                {totals.diff >= 0 ? '+' : '-'}
                {fmt(Math.abs(totals.diff))}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // -------------------- Render: ปร.5 --------------------

  function renderPr5() {
    return (
      <View>
        {renderSharedHeaderFields()}
        <View style={styles.card}>
          <TextInput style={styles.input} placeholder="แบบ ปร.4(ก) ที่แนบ จำนวน (แผ่น)" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={header.sheetsPr5} onChangeText={(v) => setHeader((h) => ({ ...h, sheetsPr5: v }))} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>สรุปค่างาน (ตาราง ปร.5)</Text>
          <View style={styles.infoBanner}>
            <Ionicons name="flash" size={13} color="#d97706" />
            <Text style={styles.infoBannerText}>แถวแรก "ค่างานต้นทุน" ดึงยอดมาจากหน้า ปร.4 ให้อัตโนมัติ</Text>
          </View>

          {pr5Rows.map((row) => (
            <View key={row.id} style={styles.pr5Row}>
              <TextInput
                style={[styles.fieldInput, { flex: 1.6 }]}
                value={row.name}
                editable={!row.locked}
                placeholder="รายการ"
                placeholderTextColor="#cbd5e1"
                onChangeText={(v) => !row.locked && updatePr5Row(row.id, 'name', v)}
              />
              <TextInput
                style={[styles.fieldInput, { flex: 1 }]}
                keyboardType="decimal-pad"
                value={row.cost}
                editable={!row.locked}
                onChangeText={(v) => !row.locked && updatePr5Row(row.id, 'cost', v)}
              />
              <TextInput
                style={[styles.fieldInput, { flex: 0.7 }]}
                keyboardType="decimal-pad"
                value={row.factor}
                editable={!row.locked}
                onChangeText={(v) => !row.locked && updatePr5Row(row.id, 'factor', v)}
              />
              <View style={[styles.readonlyBox, { flex: 1 }]}>
                <Text style={styles.readonlyText}>{fmt(pr5RowTotal(row))}</Text>
              </View>
              {!row.locked && (
                <TouchableOpacity onPress={() => removePr5Row(row.id)} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <View style={styles.pr5HeaderLabels}>
            <Text style={[styles.pr5HeaderLabelText, { flex: 1.6 }]}>รายการ</Text>
            <Text style={[styles.pr5HeaderLabelText, { flex: 1 }]}>ค่างานต้นทุน</Text>
            <Text style={[styles.pr5HeaderLabelText, { flex: 0.7 }]}>Factor F</Text>
            <Text style={[styles.pr5HeaderLabelText, { flex: 1 }]}>ค่าก่อสร้าง</Text>
          </View>

          <TouchableOpacity style={styles.addItemBtn} onPress={addPr5Row}>
            <Ionicons name="add-circle-outline" size={15} color="#059669" />
            <Text style={styles.addItemBtnText}>เพิ่มรายการ</Text>
          </TouchableOpacity>

          <View style={styles.divider} />
          <View style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>รวมค่างานต้นทุนทั้งสิ้น</Text>
            <Text style={styles.summaryValue}>{fmt(pr5SumBaseCost)}</Text>
          </View>
          <View style={styles.summaryLine}>
            <Text style={[styles.summaryLabel, { color: '#059669', fontWeight: '800' }]}>รวมค่าก่อสร้างทั้งสิ้น</Text>
            <Text style={[styles.summaryValue, { color: '#059669', fontSize: 17 }]}>{fmt(pr5GrandTotal)}</Text>
          </View>
        </View>
      </View>
    );
  }

  // -------------------- Render: ปร.6 --------------------

  function renderPr6() {
    return (
      <View>
        {renderSharedHeaderFields()}
        <View style={styles.card}>
          <TextInput style={styles.input} placeholder="แบบ ปร.4/5/6 + Factor F แนบทั้งหมด จำนวน (แผ่น)" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={header.sheetsPr6} onChangeText={(v) => setHeader((h) => ({ ...h, sheetsPr6: v }))} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>สรุปค่าก่อสร้าง (ตาราง ปร.6)</Text>
          <View style={styles.infoBanner}>
            <Ionicons name="flash" size={13} color="#d97706" />
            <Text style={styles.infoBannerText}>ค่าก่อสร้างดึงยอดมาจากหน้า ปร.5 ให้อัตโนมัติ</Text>
          </View>

          <View style={styles.pr6Row}>
            <View style={styles.pr6IndexBadge}>
              <Text style={styles.pr6IndexBadgeText}>1</Text>
            </View>
            <Text style={styles.pr6ItemName}>รวมค่าก่อสร้าง</Text>
            <View style={[styles.readonlyBox, { flex: 1 }]}>
              <Text style={[styles.readonlyText, { color: '#059669', fontWeight: '800' }]}>{fmt(pr6Total)}</Text>
            </View>
          </View>
          <TextInput style={[styles.input, { marginTop: 8 }]} placeholder="หมายเหตุ..." placeholderTextColor="#94a3b8" value={pr6Note} onChangeText={setPr6Note} />

          <View style={styles.divider} />
          <View style={styles.summaryLine}>
            <Text style={[styles.summaryLabel, { fontWeight: '800' }]}>รวมค่าก่อสร้างเป็นเงินทั้งสิ้น</Text>
            <Text style={[styles.summaryValue, { color: '#059669', fontSize: 18 }]}>{fmt(pr6Total)}</Text>
          </View>
        </View>
      </View>
    );
  }

  // -------------------- Render: Factor F --------------------

  function renderFactorF() {
    return (
      <View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ตารางแสดงการคำนวณหาค่า FACTOR F งานอาคาร</Text>
          <TextInput style={styles.input} placeholder="งานปรับปรุง/ซ่อมแซม (ชื่องาน)" placeholderTextColor="#94a3b8" value={header.projectName} onChangeText={(v) => setHeader((h) => ({ ...h, projectName: v }))} />
          <TextInput style={styles.input} placeholder="สถานที่ก่อสร้าง" placeholderTextColor="#94a3b8" value={header.location} onChangeText={(v) => setHeader((h) => ({ ...h, location: v }))} />
          <View style={styles.rowGap}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="จังหวัด" placeholderTextColor="#94a3b8" value={header.province} onChangeText={(v) => setHeader((h) => ({ ...h, province: v }))} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="หน่วยงาน" placeholderTextColor="#94a3b8" value={header.agency} onChangeText={(v) => setHeader((h) => ({ ...h, agency: v }))} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>เงื่อนไข</Text>
          {[
            { key: 'advance' as const, label: 'เงินล่วงหน้าจ่าย (ร้อยละ)' },
            { key: 'retention' as const, label: 'ค่าประกันผลงาน หัก (ร้อยละ)' },
            { key: 'interest' as const, label: 'ดอกเบี้ยเงินกู้ (ร้อยละ)' },
            { key: 'vat' as const, label: 'ค่าภาษีมูลค่าเพิ่ม (VAT) (ร้อยละ)' },
          ].map((f) => (
            <View key={f.key} style={styles.condRow}>
              <Text style={styles.condLabel}>{f.label}</Text>
              <TextInput style={styles.condInput} keyboardType="decimal-pad" value={ff[f.key]} onChangeText={(v) => setFf((s) => ({ ...s, [f.key]: v }))} />
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.formulaText}>Factor F = D − [(D−E)×(A−B)] / (C−B)</Text>

          <View style={styles.ffVarRow}>
            <Text style={styles.ffVarLabel}>A = ค่างานวัสดุและแรงงานต้นทุน</Text>
            <View style={[styles.readonlyBox, { width: 130 }]}>
              <Text style={styles.readonlyText}>{fmt(totals.grandTotalMatLab)}</Text>
            </View>
          </View>
          <Text style={styles.ffSyncHint}>(ค่านี้ sync มาจากผลรวม ปร.4 อัตโนมัติ)</Text>

          <View style={styles.ffVarRow}>
            <Text style={styles.ffVarLabel}>B = ค่างานตัวต่ำกว่าต้นทุน</Text>
            <TextInput style={[styles.fieldInput, { width: 130 }]} keyboardType="decimal-pad" value={ff.B} onChangeText={(v) => setFf((s) => ({ ...s, B: v }))} placeholder="-" placeholderTextColor="#cbd5e1" />
          </View>
          <View style={styles.ffVarRow}>
            <Text style={styles.ffVarLabel}>C = ค่างานตัวสูงกว่าต้นทุน</Text>
            <TextInput style={[styles.fieldInput, { width: 130 }]} keyboardType="decimal-pad" value={ff.C} onChangeText={(v) => setFf((s) => ({ ...s, C: v }))} />
          </View>
          <View style={styles.ffVarRow}>
            <Text style={styles.ffVarLabel}>D = Factor F ตัวต่ำกว่าต้นทุน</Text>
            <TextInput style={[styles.fieldInput, { width: 130 }]} keyboardType="decimal-pad" value={ff.D} onChangeText={(v) => setFf((s) => ({ ...s, D: v }))} />
          </View>
          <View style={styles.ffVarRow}>
            <Text style={styles.ffVarLabel}>E = Factor F ตัวสูงกว่าต้นทุน</Text>
            <TextInput style={[styles.fieldInput, { width: 130 }]} keyboardType="decimal-pad" value={ff.E} onChangeText={(v) => setFf((s) => ({ ...s, E: v }))} />
          </View>

          <View style={styles.ffResultBox}>
            <Text style={styles.ffResultLabel}>ค่า FACTOR F เท่ากับ</Text>
            <Text style={styles.ffResultValue}>{ffResult.toFixed(4)}</Text>
          </View>
          <TouchableOpacity style={styles.ffApplyBtn} onPress={applyFactorFResult}>
            <Ionicons name="arrow-redo-outline" size={15} color="#fff" />
            <Text style={styles.ffApplyBtnText}>ใช้ค่านี้ในฟอร์ม ปร.4</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ตารางอ้างอิง Factor F (งานอาคาร)</Text>
          <View style={styles.refTableHeader}>
            <Text style={[styles.refTableHeaderText, { flex: 1 }]}>ค่างาน (ล้านบ.)</Text>
            <Text style={[styles.refTableHeaderText, { flex: 1 }]}>Factor F</Text>
          </View>
          {FACTOR_F_REFERENCE.map((r) => (
            <View key={r.work} style={styles.refTableRow}>
              <Text style={[styles.refTableCell, { flex: 1 }]}>{r.work}</Text>
              <Text style={[styles.refTableCell, { flex: 1, fontWeight: '700', color: '#0891b2' }]}>{r.factor}</Text>
            </View>
          ))}
          <Text style={styles.refNote}>กรณีค่างานอยู่ระหว่างช่วงที่กำหนด ให้เทียบอัตราส่วนหาค่า Factor F (กรอก B/C/D/E ด้านบนแล้วระบบคำนวณให้อัตโนมัติ)</Text>
        </View>
      </View>
    );
  }

  if (loadingEdit) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ActivityIndicator size="large" color="#0891b2" />
          <Text style={{ color: '#94a3b8', fontSize: 12.5 }}>กำลังโหลดข้อมูล...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.titleRow}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color="#2c3e50" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
        <Text style={styles.title}>{editUuid ? '✏️ แก้ไขใบประเมินราคา' : 'สร้างทุนใหม่'}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <TouchableOpacity key={t.key} style={[styles.tabPill, active && styles.tabPillActive]} onPress={() => setActiveTab(t.key)}>
              <FontAwesome5 name={t.icon} size={12} color={active ? '#fff' : '#475569'} />
              <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {activeTab === 'pr4' && renderPr4()}
        {activeTab === 'pr5' && renderPr5()}
        {activeTab === 'pr6' && renderPr6()}
        {activeTab === 'factorF' && renderFactorF()}

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={17} color="#fff" />}
          <Text style={styles.saveBtnText}>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลโครงการ'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal: ใส่ลิงก์อ้างอิงให้หลายรายการทีเดียว */}
      <Modal visible={bulkLinkModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>ใส่ลิงก์อ้างอิงให้ {selectedCount} รายการที่เลือก</Text>
            <TextInput style={styles.modalTextarea} placeholder="วางลิงก์...(ที่มาของรายการ)" placeholderTextColor="#94a3b8" value={bulkLinkText} onChangeText={setBulkLinkText} />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setBulkLinkModal(false)}>
                <Text style={styles.modalBtnGhostText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#2563eb' }]} onPress={applyBulkLink}>
                <Text style={styles.modalBtnText}>นำไปใช้</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: กรอกแบบตาราง (Grid) */}
      <Modal visible={gridModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>กรอกแบบตาราง (Grid)</Text>
            <Text style={styles.modalSubtitle}>วางข้อมูลหลายบรรทัด คั่นแต่ละคอลัมน์ด้วย Tab (คัดลอกมาจาก Excel ได้เลย){'\n'}ลำดับคอลัมน์: ชื่อรายการ, จำนวน, หน่วย, ราคาวัสดุ, ราคาแรงงาน, ทุน/หน่วย</Text>
            <TextInput style={[styles.modalTextarea, { minHeight: 140 }]} multiline placeholder={'สายไฟ THW\t50\tเมตร\t18\t5\t15'} placeholderTextColor="#94a3b8" value={gridText} onChangeText={setGridText} />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setGridModal({ visible: false })}>
                <Text style={styles.modalBtnGhostText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#0891b2' }]} onPress={applyGridPaste}>
                <Text style={styles.modalBtnText}>แปลงข้อมูล</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7f9' },

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 12 },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: '#2c3e50' },

  tabsRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tabPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 13, paddingVertical: 8 },
  tabPillActive: { backgroundColor: '#3f51b5', borderColor: '#3f51b5' },
  tabPillText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  tabPillTextActive: { color: '#fff' },

  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#334155', marginBottom: 10 },

  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: '#0f172a', marginBottom: 8 },
  rowGap: { flexDirection: 'row', gap: 8 },

  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fffbeb', borderRadius: 8, padding: 8, marginBottom: 10 },
  infoBannerText: { fontSize: 11.5, color: '#92400e', flex: 1 },

  bulkBarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bulkToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  bulkToggleBtnActive: { backgroundColor: '#3b82f6' },
  bulkToggleText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  bulkApplyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  bulkApplyBtnText: { fontSize: 11.5, fontWeight: '700', color: '#fff' },

  powerUserRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  powerUserBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  powerUserBtnText: { fontSize: 11, fontWeight: '700' },

  categoryCard: { backgroundColor: '#eef2ff', borderRadius: 14, padding: 10, marginBottom: 12 },
  categoryHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#4338ca', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8 },
  categoryNameInput: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 13.5 },
  categoryDeleteBtn: { padding: 4 },
  subInput: { borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, marginBottom: 8 },

  categoryFooterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8 },
  addItemBtnAlt: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  addItemBtnAlt2: { backgroundColor: '#f5f3ff', borderColor: '#d8b4fe' },
  addItemBtnText: { fontSize: 11.5, fontWeight: '700', color: '#059669' },

  addCategoryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#334155', borderRadius: 10, paddingVertical: 11, marginBottom: 14 },
  addCategoryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  itemCard: { backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 8 },
  itemTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  checkboxChecked: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  itemNameInput: { fontSize: 13.5, fontWeight: '700', color: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 4 },
  itemDeleteBtn: { padding: 4, marginTop: 2 },

  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  suggestionChip: { backgroundColor: '#eff6ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 160 },
  suggestionChipText: { fontSize: 10.5, color: '#1d4ed8' },

  itemToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  toggleChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toggleChipText: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  noteInput: { flex: 1, fontSize: 11.5, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', color: '#475569', paddingVertical: 2 },

  fieldGrid: { flexDirection: 'row', gap: 8, marginTop: 10 },
  fieldCell: { flex: 1 },
  fieldLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '700', marginBottom: 3 },
  fieldInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, fontSize: 12.5, color: '#0f172a' },

  unitSuggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  unitChip: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3 },
  unitChipText: { fontSize: 10.5, color: '#64748b', fontWeight: '600' },

  priceBlock: { marginTop: 10 },
  priceBlockTitle: { fontSize: 10.5, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  readonlyBox: { backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8, alignItems: 'flex-end', justifyContent: 'center' },
  readonlyText: { fontSize: 12.5, fontWeight: '700', color: '#15803d' },

  miniStat: { flex: 1, borderRadius: 8, padding: 8, alignItems: 'center' },
  miniStatLabel: { fontSize: 9.5, color: '#64748b', fontWeight: '700', marginBottom: 3 },
  miniStatValue: { fontSize: 12.5, fontWeight: '800' },
  miniStatInput: { fontSize: 12.5, fontWeight: '800', color: '#0891b2', textAlign: 'center', minWidth: 50 },

  linkPreview: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, backgroundColor: '#eff6ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  linkPreviewText: { fontSize: 10.5, color: '#2563eb', flex: 1 },

  summaryCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 16 },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { fontSize: 12.5, color: '#64748b', fontWeight: '600' },
  summaryValue: { fontSize: 13.5, fontWeight: '800', color: '#0f172a' },

  factorSwitchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0f9ff', borderRadius: 10, padding: 10, marginTop: 8 },
  factorSwitchLabel: { fontSize: 12.5, fontWeight: '700', color: '#0891b2' },
  factorInput: { borderWidth: 1.5, borderColor: '#0dcaf0', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, fontWeight: '700', color: '#0891b2', width: 100, textAlign: 'right' },

  submitRow: { marginTop: 12 },
  submitLabel: { fontSize: 12.5, fontWeight: '700', color: '#059669', marginBottom: 5 },
  submitInput: { borderWidth: 2, borderColor: '#10b981', backgroundColor: '#ecfdf5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '800', color: '#059669', textAlign: 'right' },
  autoHint: { fontSize: 10, color: '#94a3b8', marginTop: 4 },

  statPillRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statPill: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 8, padding: 8, alignItems: 'center' },
  statPillLabel: { fontSize: 9.5, color: '#94a3b8', fontWeight: '700', marginBottom: 2 },
  statPillValue: { fontSize: 12, fontWeight: '800' },

  pr5Row: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 8 },
  pr5HeaderLabels: { flexDirection: 'row', gap: 6, marginTop: -4, marginBottom: 8 },
  pr5HeaderLabelText: { fontSize: 9.5, color: '#94a3b8', fontWeight: '700' },

  pr6Row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pr6IndexBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  pr6IndexBadgeText: { fontSize: 11, fontWeight: '800', color: '#64748b' },
  pr6ItemName: { flex: 1, fontSize: 13, fontWeight: '700', color: '#334155' },

  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 10 },

  condRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  condLabel: { fontSize: 12, color: '#475569', flex: 1 },
  condInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12.5, color: '#0f172a', width: 90, textAlign: 'right' },

  formulaText: { fontSize: 14, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 14 },
  ffVarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  ffVarLabel: { fontSize: 12, color: '#334155', flex: 1, marginRight: 8 },
  ffSyncHint: { fontSize: 10, color: '#94a3b8', marginBottom: 10 },

  ffResultBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginTop: 12 },
  ffResultLabel: { fontSize: 13, fontWeight: '700', color: '#334155' },
  ffResultValue: { fontSize: 18, fontWeight: '800', color: '#0891b2' },
  ffApplyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#0891b2', borderRadius: 10, paddingVertical: 10, marginTop: 10 },
  ffApplyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  refTableHeader: { flexDirection: 'row', backgroundColor: '#475569', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 2 },
  refTableHeaderText: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  refTableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  refTableCell: { fontSize: 11.5, color: '#334155', textAlign: 'center' },
  refNote: { fontSize: 10.5, color: '#94a3b8', marginTop: 10, lineHeight: 15 },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3f51b5', borderRadius: 12, paddingVertical: 14, marginTop: 6 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  modalSubtitle: { fontSize: 11.5, color: '#64748b', marginTop: 6, lineHeight: 17 },
  modalTextarea: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginTop: 10, fontSize: 13, color: '#0f172a', textAlignVertical: 'top' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: '#f1f5f9' },
  modalBtnGhostText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});