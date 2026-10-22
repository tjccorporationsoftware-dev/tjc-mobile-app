/**
 * CostCheckScreen.tsx
 * ------------------------------------------------------------------
 * "ตรวจสอบต้นทุน" (project cost check / approval) — มือถือ
 * เชื่อม API จริงของโมดูลนี้ครบทั้ง 9 action: cost_check_API_mobile.php
 *   get_cost_detail, get_purchase_history, get_cost_history, get_pending_pos,
 *   get_po_details, approve_cost, exec_approve_cost, approve_installment,
 *   update_cost_price
 *
 * ปุ่ม "ประวัติการซื้อ"/"ประวัติแก้ไขราคา"/"PO ค้างอนุมัติ" เปิด modal จริง (ไม่ใช่ stub) —
 * "PO ค้างอนุมัติ" กดต่อเข้า get_po_details แสดงงวดชำระย่อยของแต่ละรายการ พร้อมปุ่มอนุมัติ
 * รายงวด (approve_installment) แยกระดับผจก./ผู้บริหาร ตาม can_approve_mgr/can_approve_exec
 * ที่ backend ส่งมา (คนละ flow กับปุ่มอนุมัติทั้งรายการใน CostItemCard ที่ใช้ approve_cost/
 * exec_approve_cost)
 *
 * หน้านี้ทำงานแบบ "รายโครงการ" (ต้องมี project_id) เหมือน ProjectAccountingScreen /
 * ProjectFollowupScreen ในชุดนี้ — รับ id ผ่าน prop `id` (ถ้า embed จากหน้าอื่น) หรือผ่าน
 * route params `id` (ถ้า router.push ตรงมาที่หน้านี้) ตามธรรมเนียมเดียวกัน
 *
 * เมนูใน Drawer ยังไม่มีกลไกส่ง project_id ให้หน้าจอโดยตรง (ไม่เหมือน AccountingDashboard/
 * ProjectDashboard ที่ฝัง sub-screen ไว้ในไฟล์เดียวกันแล้ว switch ด้วย local state) จึงทำหน้า
 * นี้ให้ "เลือกโครงการเอง" เป็นทางเข้าเริ่มต้นเมื่อไม่มี id ส่งมา (ไม่มี action สำหรับ "รายชื่อ
 * โครงการทั้งหมด" อยู่ใน spec 9 action ของโมดูลนี้ จึงให้กรอก/แปะ project_id ตรงๆ แทนการเดา
 * endpoint ใหม่)
 *
 * ห้ามคำนวณเงิน/สิทธิ์อนุมัติเองฝั่งแอป — ทุกตัวเลขและสิทธิ์ (can_approve_mgr/can_approve_exec/
 * can_update_cost_price) อ่านจากค่าที่ backend ส่งมาเท่านั้น
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

// 🌟 รูปแบบวันที่/เวลาสั้น "d/m/yy" มาตรฐานเดียวกันทั้งแอป
import { formatShortThaiDate, formatShortThaiDateTime } from '../../components/DateTimeField';
// ✅ Config + API helpers กลาง (ตรงกับ pattern ของ accounting_dashboard.tsx)
import { API_MODULES } from '../../constants/config';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';
import { useAuth } from '../_layout';

const COST_CHECK_API_URL = `${API_MODULES}/cost_check_API_mobile.php`;

// ====================================================================
// Types — ชื่อฟิลด์ตรงกับ response จริงของ cost_check_API_mobile.php เป๊ะ (snake_case)
// ====================================================================

interface ProjectInfo {
  id?: number | string;
  project_id?: number | string;
  name?: string;
  project_name?: string;
  code?: string;
  project_code?: string;
  display_code?: string;
}

interface SummaryData {
  grand_total_standard: number;
  grand_total_plan: number;
  total_discount_value: number;
  net_grand_total_plan: number;
  grand_total_actual_product: number;
  grand_total_actual_full: number;
  grand_total_claim: number;
  grand_diff: number;
  grand_diff_percent: number;
}

interface CutOutItem {
  item_id?: number | string;
  item_name?: string;
  qty?: number;
  unit?: string;
  [key: string]: any;
}

interface CutOutData {
  items: CutOutItem[];
  total_cut_std: number;
  total_cut_plan: number;
}

interface ApproveHistoryEntry {
  po_number: string;
  approved_by: string;
  approved_at: string;
}

interface PoProgressEntry {
  total: number;
  done: number;
  units: number;
  mgr: number;
  exec: number;
}

interface SubItem {
  name?: string;
  item_name?: string;
  qty?: number;
  quantity?: number;
  [key: string]: any;
}

interface CostItem {
  id?: number | string;
  item_id?: number | string;
  item_name: string;
  model_name?: string;
  item_type?: string;
  unit?: string;
  purchase_status?: string;
  custom_name?: string;
  plan_qty: number;
  actual_qty?: number;
  standard_price?: number;
  cost_price?: number;
  total_standard_budget?: number;
  total_plan_budget?: number;
  total_product_only?: number;
  total_with_expenses?: number;
  claim_cost?: number;
  diff?: number;
  diff_percent?: number;
  is_expense_row?: number;
  total_po_count?: number;
  mgr_approved_count?: number;
  exec_approved_count?: number;
  cost_approved_by?: string;
  cost_approved_at?: string;
  exec_approved_by?: string;
  exec_approved_at?: string;
  mgr_approve_history?: ApproveHistoryEntry[];
  exec_approve_history?: ApproveHistoryEntry[];
  po_progress?: Record<string, PoProgressEntry>;
  po_numbers?: string[];
  orderers?: string[];
  sub_items?: SubItem[];
  has_network_bom?: number;
}

interface CostDetailResponse {
  project: ProjectInfo;
  sim_delivery: number;
  summary: SummaryData;
  cut_out?: CutOutData;
  items: CostItem[];
  items_total: number;
  can_approve_mgr: boolean;
  can_approve_exec: boolean;
  can_update_cost_price: boolean;
}

interface PurchaseHistoryRow {
  project_item_id: number;
  item_name: string;
  po_number: string;
  supplier_name: string;
  orderer_name: string;
  order_date?: string;
  order_date_thai?: string;
  buy_quantity: number;
  buy_unit_price: number;
  total_price: number;
  cost_approved_by?: string;
  exec_approved_by?: string;
}

interface CostHistoryRow {
  item_name: string;
  user: string;
  time?: string;
  time_thai: string;
  old_unit: number;
  new_unit: number;
  old_total: number;
  new_total: number;
  note?: string;
}

interface PendingPoRow {
  po_number: string;
  project_count: number;
  item_count: number;
}

interface PoDetailInstallment {
  id: number;
  amount: number;
  cost_approved_by?: string;
  exec_approved_by?: string;
}

interface PoDetailItem {
  item_id: number;
  item_name: string;
  project_id: number;
  project_name: string;
  display_code?: string;
  buy_quantity: number;
  total_price: number;
  order_date?: string;
  order_date_thai?: string;
  poi_cost_pending: number;
  poi_exec_pending: number;
  installments: PoDetailInstallment[];
}

export interface CostCheckScreenProps {
  // project_id — ถ้าส่งมาตรงๆ (เช่น embed จากหน้าอื่นในอนาคต) จะใช้ค่านี้แทนค่าจาก route
  // params เหมือนธรรมเนียมของ ProjectAccountingScreen/ProjectFollowupScreen ในชุดนี้
  id?: number | string;
  onBack?: () => void;
}

// ====================================================================
// Helpers
// ====================================================================

function toNum(v: any): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function fmt(v: any): string {
  return toNum(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function itemId(it: CostItem): number | string | undefined {
  return it.id ?? it.item_id;
}

function aggregateProgress(item: CostItem): { total: number; done: number } {
  const entries = item.po_progress ? Object.values(item.po_progress) : [];
  if (entries.length > 0) {
    return entries.reduce(
      (acc, e) => ({ total: acc.total + toNum(e.total), done: acc.done + toNum(e.done) }),
      { total: 0, done: 0 }
    );
  }
  // fallback เมื่อไม่มี po_progress ในแถวนี้ — ใช้ total_po_count/mgr_approved_count/exec_approved_count
  const total = toNum(item.total_po_count) * 2;
  const done = toNum(item.mgr_approved_count) + toNum(item.exec_approved_count);
  return { total, done };
}

// ====================================================================
// Small presentational bits
// ====================================================================

type StatTone = 'blue' | 'orange' | 'red' | 'teal' | 'green' | 'mint' | 'violet' | 'gray';

const statTone: Record<StatTone, { ink: string; edge: string }> = {
  blue: { ink: '#2f7fe0', edge: '#4a90ea' },
  orange: { ink: '#e08a12', edge: '#f0ad2b' },
  red: { ink: '#e8443f', edge: '#f4635c' },
  teal: { ink: '#0e9fb4', edge: '#2bb9cc' },
  green: { ink: '#12a35f', edge: '#2cba76' },
  mint: { ink: '#0e9f8c', edge: '#2bb9a6' },
  violet: { ink: '#7c4fdc', edge: '#9a71ea' },
  gray: { ink: '#5a6b7e', edge: '#8b98a8' },
};

function StatTile({ icon, label, value, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone: StatTone }) {
  const color = statTone[tone];
  return (
    <View style={styles.tile}>
      <View style={[styles.tileEdge, { backgroundColor: color.edge }]} />
      <View style={styles.tileBody}>
        <View style={styles.tileLabelRow}>
          <Ionicons name={icon} size={13} color="#7d8a99" />
          <Text style={styles.tileLabel} numberOfLines={2}>{label}</Text>
        </View>
        <Text style={[styles.tileValue, { color: color.ink }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function ProgressBadge({ total, done }: { total: number; done: number }) {
  const complete = total > 0 && done >= total;
  const partial = done > 0 && !complete;
  const color = complete ? '#0e8f60' : partial ? '#c47f04' : '#93a2b3';
  const bg = complete ? '#e5f8ee' : partial ? '#fff6de' : '#f6f8fa';
  const border = complete ? '#a9e2c4' : partial ? '#f2cf74' : '#dfe6ee';
  return (
    <View style={[styles.chip, { backgroundColor: bg, borderColor: border }]}>
      <Ionicons name={complete ? 'checkmark-circle' : partial ? 'time-outline' : 'ellipse-outline'} size={13} color={color} />
      <Text style={[styles.chipText, { color }]}>อนุมัติแล้ว {done}/{total || 0}</Text>
    </View>
  );
}

// ====================================================================
// Item card
// ====================================================================

function CostItemCard({
  item,
  canApproveMgr,
  canApproveExec,
  canUpdatePrice,
  busy,
  onOpenDetail,
  onApprove,
  onEditPrice,
}: {
  item: CostItem;
  canApproveMgr: boolean;
  canApproveExec: boolean;
  canUpdatePrice: boolean;
  busy: boolean;
  onOpenDetail: () => void;
  onApprove: (level: 'mgr' | 'exec') => void;
  onEditPrice: () => void;
}) {
  const progress = aggregateProgress(item);
  const diffColor = toNum(item.diff) > 0 ? '#e8443f' : toNum(item.diff) < 0 ? '#0e8f60' : '#5a6b7e';
  const pending = progress.total > 0 && progress.done < progress.total;

  return (
    <Pressable onPress={onOpenDetail} style={({ pressed }) => [styles.itemCard, pressed && styles.pressed]}>
      <View style={styles.itemTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemName} numberOfLines={2}>{item.item_name}</Text>
          {!!item.model_name && <Text style={styles.itemModel} numberOfLines={1}>รุ่น: {item.model_name}</Text>}
        </View>
        {item.is_expense_row ? (
          <View style={styles.expenseTag}>
            <Text style={styles.expenseTagText}>ค่าใช้จ่าย</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.itemMetaRow}>
        <Text style={styles.itemMeta}>
          {item.custom_name && item.custom_name.trim() ? item.custom_name : 'รายการทั่วไป'}
        </Text>
        {!!item.purchase_status && <Text style={styles.itemMetaDim}>• {item.purchase_status}</Text>}
      </View>

      <View style={styles.itemQtyRow}>
        <View style={styles.itemQtyCell}>
          <Text style={styles.microLabel}>แผน / จริง</Text>
          <Text style={styles.itemQtyValue}>
            {fmt(item.plan_qty)} / {fmt(item.actual_qty ?? 0)} {item.unit ?? ''}
          </Text>
        </View>
        <View style={styles.itemQtyCell}>
          <Text style={styles.microLabel}>ราคากลาง / ทุน</Text>
          <Text style={styles.itemQtyValue}>{fmt(item.standard_price)} / {fmt(item.cost_price)}</Text>
        </View>
      </View>

      <View style={styles.itemDiffRow}>
        <Text style={styles.microLabel}>ส่วนต่าง</Text>
        <Text style={[styles.itemDiffValue, { color: diffColor }]}>
          {toNum(item.diff) >= 0 ? '+' : ''}
          {fmt(item.diff)} ({toNum(item.diff_percent).toFixed(2)}%)
        </Text>
      </View>

      <View style={styles.itemFooterRow}>
        <ProgressBadge total={progress.total} done={progress.done} />
        {item.has_network_bom ? (
          <View style={styles.infoTag}>
            <Ionicons name="git-network-outline" size={11} color="#5a6b7e" />
            <Text style={styles.infoTagText}>มี BOM ซื้อในเครือ</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.itemActionsRow}>
        {canApproveMgr && pending ? (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onApprove('mgr'); }}
            disabled={busy}
            style={({ pressed }) => [styles.rowAction, styles.mgrAction, pressed && styles.pressed, busy && styles.disabled]}
          >
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark-done" size={14} color="#fff" />}
            <Text style={styles.rowActionText}>อนุมัติ (ผจก.)</Text>
          </Pressable>
        ) : null}
        {canApproveExec && pending ? (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onApprove('exec'); }}
            disabled={busy}
            style={({ pressed }) => [styles.rowAction, styles.execAction, pressed && styles.pressed, busy && styles.disabled]}
          >
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="ribbon" size={14} color="#fff" />}
            <Text style={styles.rowActionText}>อนุมัติ (ผู้บริหาร)</Text>
          </Pressable>
        ) : null}
        {canUpdatePrice ? (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onEditPrice(); }}
            style={({ pressed }) => [styles.rowAction, styles.editAction, pressed && styles.pressed]}
          >
            <Ionicons name="pencil" size={14} color="#fff" />
            <Text style={styles.rowActionText}>แก้ไขราคาทุน</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

// ====================================================================
// Main screen
// ====================================================================

export default function CostCheckScreen({ id, onBack }: CostCheckScreenProps) {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const resolvedId = id ?? params.id;

  const [projectId, setProjectId] = useState<string | number | undefined>(resolvedId);
  const [pickerInput, setPickerInput] = useState('');

  const [data, setData] = useState<CostDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [simDelivery, setSimDelivery] = useState(false);
  const [cutOutExpanded, setCutOutExpanded] = useState(false);

  const [busyItemId, setBusyItemId] = useState<string | number | null>(null);

  const [detailModal, setDetailModal] = useState<{ visible: boolean; item?: CostItem }>({ visible: false });
  const [priceModal, setPriceModal] = useState<{ visible: boolean; item?: CostItem }>({ visible: false });
  const [newPrice, setNewPrice] = useState('');
  const [priceNote, setPriceNote] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  const [search, setSearch] = useState('');

  const [purchaseHistoryModal, setPurchaseHistoryModal] = useState<{ visible: boolean; loading: boolean; rows: PurchaseHistoryRow[] }>({ visible: false, loading: false, rows: [] });
  const [costHistoryModal, setCostHistoryModal] = useState<{ visible: boolean; loading: boolean; rows: CostHistoryRow[] }>({ visible: false, loading: false, rows: [] });
  const [pendingPosModal, setPendingPosModal] = useState<{ visible: boolean; loading: boolean; rows: PendingPoRow[] }>({ visible: false, loading: false, rows: [] });
  const [poDetailModal, setPoDetailModal] = useState<{
    visible: boolean; loading: boolean; poNumber: string; items: PoDetailItem[]; canApproveMgr: boolean; canApproveExec: boolean;
  }>({ visible: false, loading: false, poNumber: '', items: [], canApproveMgr: false, canApproveExec: false });
  const [busyInstId, setBusyInstId] = useState<number | null>(null);
  const [busyPoItemId, setBusyPoItemId] = useState<number | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!projectId || !user?.id) return;
    refresh ? setRefreshing(true) : setLoading(true);
    setOffline(false);
    try {
      const res = await apiMobileGet(COST_CHECK_API_URL, 'get_cost_detail', {
        user_id: user.id,
        project_id: projectId,
        sim_delivery: simDelivery ? 1 : 0,
      });
      setData(res as unknown as CostDetailResponse);
    } catch (e) {
      console.error('load cost_check_API_mobile get_cost_detail failed', e);
      setOffline(true);
    } finally {
      refresh ? setRefreshing(false) : setLoading(false);
    }
  }, [projectId, simDelivery, user?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const items = useMemo(() => {
    const list = data?.items ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((it) => `${it.item_name} ${it.model_name ?? ''} ${it.custom_name ?? ''}`.toLowerCase().includes(term));
  }, [data?.items, search]);

  async function handleApprove(item: CostItem, level: 'mgr' | 'exec') {
    const iid = itemId(item);
    if (iid == null || !user?.id) return;
    setBusyItemId(iid);
    try {
      const action = level === 'mgr' ? 'approve_cost' : 'exec_approve_cost';
      const res = await apiMobilePost(COST_CHECK_API_URL, action, { user_id: user.id, item_id: iid });
      setToast((res as any).message || 'อนุมัติเรียบร้อย');
      await load(true);
    } catch (e: any) {
      console.error('approve cost_check_API_mobile failed', e);
      setToast(e?.message || 'อนุมัติไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setBusyItemId(null);
    }
  }

  function openPriceModal(item: CostItem) {
    setNewPrice(item.cost_price != null ? String(item.cost_price) : '');
    setPriceNote('');
    setPriceModal({ visible: true, item });
  }

  async function handleSavePrice() {
    const item = priceModal.item;
    const iid = item ? itemId(item) : undefined;
    if (!item || iid == null || !user?.id) return;
    if (!newPrice.trim()) {
      setToast('กรุณากรอกราคาทุนใหม่');
      return;
    }
    setSavingPrice(true);
    try {
      const res = await apiMobilePost(COST_CHECK_API_URL, 'update_cost_price', {
        user_id: user.id,
        item_id: iid,
        new_unit_price: newPrice.trim(),
        qty: item.plan_qty,
        note: priceNote,
      });
      const changed = Number((res as any).changed);
      setToast(changed === 0 ? 'ไม่มีการเปลี่ยนแปลง' : (res as any).message || 'บันทึกราคาทุนสำเร็จ');
      setPriceModal({ visible: false });
      await load(true);
    } catch (e: any) {
      console.error('update_cost_price failed', e);
      setToast(e?.message || 'บันทึกราคาทุนไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setSavingPrice(false);
    }
  }

  async function openPurchaseHistory() {
    if (!user?.id || !projectId) return;
    setPurchaseHistoryModal({ visible: true, loading: true, rows: [] });
    try {
      const res = await apiMobileGet(COST_CHECK_API_URL, 'get_purchase_history', { user_id: user.id, project_id: projectId });
      setPurchaseHistoryModal({ visible: true, loading: false, rows: ((res as any).history ?? []) as PurchaseHistoryRow[] });
    } catch (e: any) {
      setToast(e?.message || 'โหลดประวัติการซื้อไม่สำเร็จ');
      setPurchaseHistoryModal({ visible: false, loading: false, rows: [] });
    }
  }

  async function openCostHistory() {
    if (!user?.id || !projectId) return;
    setCostHistoryModal({ visible: true, loading: true, rows: [] });
    try {
      const res = await apiMobileGet(COST_CHECK_API_URL, 'get_cost_history', { user_id: user.id, project_id: projectId });
      setCostHistoryModal({ visible: true, loading: false, rows: ((res as any).data ?? []) as CostHistoryRow[] });
    } catch (e: any) {
      setToast(e?.message || 'โหลดประวัติแก้ไขราคาไม่สำเร็จ');
      setCostHistoryModal({ visible: false, loading: false, rows: [] });
    }
  }

  async function openPendingPos() {
    if (!user?.id) return;
    setPendingPosModal({ visible: true, loading: true, rows: [] });
    try {
      const res = await apiMobileGet(COST_CHECK_API_URL, 'get_pending_pos', { user_id: user.id });
      setPendingPosModal({ visible: true, loading: false, rows: ((res as any).data ?? []) as PendingPoRow[] });
    } catch (e: any) {
      setToast(e?.message || 'โหลดรายการ PO ค้างอนุมัติไม่สำเร็จ');
      setPendingPosModal({ visible: false, loading: false, rows: [] });
    }
  }

  async function openPoDetail(poNumber: string) {
    if (!user?.id) return;
    setPoDetailModal({ visible: true, loading: true, poNumber, items: [], canApproveMgr: false, canApproveExec: false });
    try {
      const res = await apiMobileGet(COST_CHECK_API_URL, 'get_po_details', { user_id: user.id, po_number: poNumber });
      setPoDetailModal({
        visible: true,
        loading: false,
        poNumber,
        items: ((res as any).data ?? []) as PoDetailItem[],
        canApproveMgr: !!(res as any).can_approve_mgr,
        canApproveExec: !!(res as any).can_approve_exec,
      });
    } catch (e: any) {
      setToast(e?.message || 'โหลดรายละเอียด PO ไม่สำเร็จ');
      setPoDetailModal({ visible: false, loading: false, poNumber: '', items: [], canApproveMgr: false, canApproveExec: false });
    }
  }

  async function handleApprovePoItem(item: PoDetailItem, level: 'mgr' | 'exec') {
    if (!user?.id || busyPoItemId !== null) return;
    setBusyPoItemId(item.item_id);
    try {
      const action = level === 'mgr' ? 'approve_cost' : 'exec_approve_cost';
      const res = await apiMobilePost(COST_CHECK_API_URL, action, {
        user_id: user.id,
        item_id: item.item_id,
        po_number: poDetailModal.poNumber,
      });
      setToast((res as any).message || 'อนุมัติเรียบร้อย');
      const poNumber = poDetailModal.poNumber;
      if (poNumber) await openPoDetail(poNumber);
      if (projectId) await load(true);
    } catch (e: any) {
      setToast(e?.message || 'อนุมัติไม่สำเร็จ');
    } finally {
      setBusyPoItemId(null);
    }
  }

  async function handleApproveInstallment(instId: number, role: 'mgr' | 'exec') {
    if (!user?.id || busyInstId !== null) return;
    setBusyInstId(instId);
    try {
      const res = await apiMobilePost(COST_CHECK_API_URL, 'approve_installment', { user_id: user.id, inst_id: instId, role });
      setToast((res as any).message || 'อนุมัติงวดเรียบร้อย');
      const poNumber = poDetailModal.poNumber;
      if (poNumber) await openPoDetail(poNumber);
      if (projectId) await load(true);
    } catch (e: any) {
      setToast(e?.message || 'อนุมัติงวดไม่สำเร็จ');
    } finally {
      setBusyInstId(null);
    }
  }

  const projectLabel = data?.project
    ? data.project.project_name ?? data.project.name ?? `โครงการ #${projectId}`
    : `โครงการ #${projectId}`;
  const projectCode = data?.project?.display_code ?? data?.project?.project_code ?? data?.project?.code;

  // -------------------- ยังไม่มี project_id — หน้าจอเลือกโครงการ --------------------
  // หมายเหตุ: ไม่มี action สำหรับ "รายชื่อโครงการทั้งหมด" อยู่ใน 9 action ของโมดูลนี้
  // (get_pending_pos ให้แค่รายการ PO ข้ามโครงการ ไม่ใช่รายชื่อโครงการ) จึงให้กรอก project_id
  // ตรงๆ แทนการเดา endpoint ใหม่ที่ไม่ได้อยู่ใน spec
  if (!projectId) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.pickerWrap}>
          <View style={styles.pickerCard}>
            <Ionicons name="calculator-outline" size={30} color="#0e9fb4" />
            <Text style={styles.pickerTitle}>ตรวจสอบต้นทุน</Text>
            <Text style={styles.pickerSubtitle}>ระบุรหัสโครงการ (project_id) เพื่อดูข้อมูลต้นทุน/อนุมัติรายการ</Text>
            <TextInput
              value={pickerInput}
              onChangeText={setPickerInput}
              placeholder="เช่น 548"
              placeholderTextColor="#9caab8"
              keyboardType="number-pad"
              style={styles.pickerInput}
            />
            <Pressable
              onPress={() => { if (pickerInput.trim()) setProjectId(pickerInput.trim()); }}
              style={({ pressed }) => [styles.pickerBtn, pressed && styles.pressed]}
            >
              <Ionicons name="arrow-forward-circle" size={17} color="#fff" />
              <Text style={styles.pickerBtnText}>โหลดข้อมูล</Text>
            </Pressable>
            {onBack ? (
              <Pressable onPress={onBack} style={({ pressed }) => [styles.ghostButton, { marginTop: 10 }, pressed && styles.pressed]}>
                <Ionicons name="arrow-back" size={16} color="#5a6b7e" />
                <Text style={styles.ghostText}>ย้อนกลับ</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const summary = data?.summary;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#0e9fb4" />}
      >
        {/* -------------------- Header -------------------- */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.titleIcon}>
              <Ionicons name="calculator" size={20} color="#0e9fb4" />
            </View>
            <View style={styles.titleCopy}>
              <Text style={styles.title}>ตรวจสอบต้นทุน</Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {projectLabel}{projectCode ? ` (${projectCode})` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.headerControls}>
            <Pressable onPress={onBack ?? (() => setProjectId(undefined))} style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}>
              <Ionicons name="arrow-back" size={16} color="#5a6b7e" />
              <Text style={styles.ghostText}>{onBack ? 'ย้อนกลับ' : 'เปลี่ยนโครงการ'}</Text>
            </Pressable>
            <Pressable onPress={() => load(true)} style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}>
              <Ionicons name="sync" size={16} color="#0e9fb4" />
              <Text style={styles.refreshText}>รีเฟรช</Text>
            </Pressable>
          </View>

          <View style={styles.simRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Switch value={simDelivery} onValueChange={setSimDelivery} trackColor={{ false: '#e2e8f0', true: '#a5f3fc' }} thumbColor={simDelivery ? '#0891b2' : '#f8fafc'} />
              <Text style={styles.simLabel}>จำลองตัดของยังไม่ส่ง</Text>
            </View>
          </View>
        </View>

        {offline ? (
          <Pressable onPress={() => load()} style={styles.offline}>
            <Ionicons name="cloud-offline-outline" size={16} color="#a34545" />
            <Text style={styles.offlineText}>โหลดข้อมูลไม่สำเร็จ แตะเพื่อลองใหม่</Text>
            <Ionicons name="refresh-outline" size={15} color="#a34545" />
          </Pressable>
        ) : null}

        {/* -------------------- Summary tiles -------------------- */}
        {loading && !data ? (
          <View style={styles.tileGrid}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => <View key={k} style={styles.tileSkeleton} />)}
          </View>
        ) : summary ? (
          <View style={styles.panel}>
            <View style={styles.tileGrid}>
              <StatTile icon="pricetag-outline" label="ราคากลางรวม" value={fmt(summary.grand_total_standard)} tone="blue" />
              <StatTile icon="wallet-outline" label="ทุนเดิมรวม" value={fmt(summary.grand_total_plan)} tone="teal" />
              <StatTile icon="pricetags-outline" label="ส่วนลดท้ายบิล" value={fmt(summary.total_discount_value)} tone="violet" />
              <StatTile icon="cash-outline" label="ทุนสุทธิ" value={fmt(summary.net_grand_total_plan)} tone="green" />
              <StatTile icon="cart-outline" label="ซื้อจริงรวม (เฉพาะสินค้า)" value={fmt(summary.grand_total_actual_product)} tone="mint" />
              <StatTile icon="receipt-outline" label="ซื้อจริงรวม (รวมค่าใช้จ่าย)" value={fmt(summary.grand_total_actual_full)} tone="orange" />
              <StatTile icon="return-down-back-outline" label="มูลค่าเคลมรวม" value={fmt(summary.grand_total_claim)} tone="gray" />
              <StatTile
                icon="swap-vertical-outline"
                label="ส่วนต่าง"
                value={`${toNum(summary.grand_diff) >= 0 ? '+' : ''}${fmt(summary.grand_diff)}`}
                tone={toNum(summary.grand_diff) > 0 ? 'red' : 'green'}
              />
              <StatTile
                icon="analytics-outline"
                label="ทุน %"
                value={`${toNum(summary.grand_diff_percent).toFixed(2)}%`}
                tone={toNum(summary.grand_diff_percent) > 100 ? 'red' : 'blue'}
              />
            </View>
          </View>
        ) : null}

        {/* -------------------- Cut-out (sim_delivery) -------------------- */}
        {simDelivery && data?.cut_out ? (
          <View style={styles.panel}>
            <Pressable onPress={() => setCutOutExpanded((v) => !v)} style={styles.cutOutHead}>
              <Ionicons name="cut-outline" size={16} color="#d97706" />
              <Text style={styles.cutOutTitle}>รายการที่ถูกตัดออก (ยังไม่ส่งของ) — {data.cut_out.items?.length ?? 0} รายการ</Text>
              <Ionicons name={cutOutExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#77879a" />
            </Pressable>
            <View style={styles.cutOutSummaryRow}>
              <Text style={styles.microLabel}>ราคากลางที่ตัดออก: {fmt(data.cut_out.total_cut_std)}</Text>
              <Text style={styles.microLabel}>ทุนที่ตัดออก: {fmt(data.cut_out.total_cut_plan)}</Text>
            </View>
            {cutOutExpanded && (
              <View style={{ marginTop: 6 }}>
                {(data.cut_out.items ?? []).map((it, idx) => (
                  <View key={String(it.item_id ?? idx)} style={styles.cutOutRow}>
                    <Text style={styles.cutOutRowText} numberOfLines={1}>{it.item_name ?? '-'}</Text>
                    {it.qty != null && <Text style={styles.cutOutRowQty}>{fmt(it.qty)} {it.unit ?? ''}</Text>}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* -------------------- Secondary features -------------------- */}
        <View style={styles.secondaryRow}>
          <Pressable onPress={openPurchaseHistory} style={styles.secondaryBtn}>
            <Ionicons name="time-outline" size={14} color="#0e9fb4" />
            <Text style={styles.secondaryBtnText}>ประวัติการซื้อ</Text>
          </Pressable>
          <Pressable onPress={openCostHistory} style={styles.secondaryBtn}>
            <Ionicons name="document-text-outline" size={14} color="#0e9fb4" />
            <Text style={styles.secondaryBtnText}>ประวัติแก้ไขราคา</Text>
          </Pressable>
          <Pressable onPress={openPendingPos} style={styles.secondaryBtn}>
            <Ionicons name="albums-outline" size={14} color="#0e9fb4" />
            <Text style={styles.secondaryBtnText}>PO ค้างอนุมัติ</Text>
          </Pressable>
        </View>

        {/* -------------------- Search -------------------- */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color="#8b98a8" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นหาชื่อรายการ, หมวด..."
            placeholderTextColor="#9caab8"
            style={styles.searchInput}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#a9b5c2" />
            </Pressable>
          ) : null}
        </View>

        {/* -------------------- Item list -------------------- */}
        {loading && !data ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color="#0e9fb4" />
            <Text style={styles.stateText}>กำลังโหลดรายการต้นทุน...</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.stateBox}>
            <Ionicons name="file-tray-outline" size={28} color="#9aa7b5" />
            <Text style={styles.stateTitle}>ไม่พบรายการ</Text>
            <Text style={styles.stateText}>ลองเปลี่ยนคำค้นหา หรือรีเฟรชใหม่</Text>
          </View>
        ) : (
          items.map((item, idx) => {
            const iid = itemId(item) ?? idx;
            return (
              <CostItemCard
                key={String(iid)}
                item={item}
                canApproveMgr={!!data?.can_approve_mgr}
                canApproveExec={!!data?.can_approve_exec}
                canUpdatePrice={!!data?.can_update_cost_price}
                busy={busyItemId === iid}
                onOpenDetail={() => setDetailModal({ visible: true, item })}
                onApprove={(level) => handleApprove(item, level)}
                onEditPrice={() => openPriceModal(item)}
              />
            );
          })
        )}

        <View style={styles.footer}>
          <Ionicons name="shield-checkmark-outline" size={14} color="#0e9fb4" />
          <Text style={styles.footerText}>ข้อมูลต้นทุนซิงก์กับ TJC API — {data?.items_total ?? 0} รายการทั้งหมด</Text>
        </View>
      </ScrollView>

      {toast ? (
        <View style={styles.toast}>
          <Ionicons name="information-circle" size={16} color="#ffffff" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* -------------------- Detail sheet -------------------- */}
      <Modal visible={detailModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle} numberOfLines={2}>{detailModal.item?.item_name ?? 'รายละเอียดรายการ'}</Text>
              <Pressable onPress={() => setDetailModal({ visible: false })} hitSlop={8}>
                <Ionicons name="close" size={20} color="#64748b" />
              </Pressable>
            </View>

            {detailModal.item && (
              <ScrollView style={{ marginTop: 8 }} showsVerticalScrollIndicator={false}>
                <View style={styles.modalBox}>
                  <Text style={styles.modalBoxTitle}>
                    <Ionicons name="information-circle-outline" size={13} color="#0e9fb4" /> ข้อมูลรายการ
                  </Text>
                  <ModalRow label="หมวด" value={detailModal.item.custom_name?.trim() || 'รายการทั่วไป'} />
                  <ModalRow label="สถานะจัดซื้อ" value={detailModal.item.purchase_status ?? '-'} />
                  <ModalRow label="จำนวนแผน / จริง" value={`${fmt(detailModal.item.plan_qty)} / ${fmt(detailModal.item.actual_qty ?? 0)} ${detailModal.item.unit ?? ''}`} />
                  <ModalRow label="ผู้สั่งซื้อ" value={(detailModal.item.orderers ?? []).join(', ') || '-'} />
                  <ModalRow label="เลขที่ PO" value={(detailModal.item.po_numbers ?? []).join(', ') || '-'} />
                </View>

                {detailModal.item.cost_approved_by ? (
                  <View style={styles.modalBox}>
                    <Text style={styles.modalBoxTitle}>
                      <Ionicons name="checkmark-done-outline" size={13} color="#0e9fb4" /> อนุมัติระดับผู้จัดการ (ล่าสุด)
                    </Text>
                    <ModalRow label="โดย" value={detailModal.item.cost_approved_by} />
                    <ModalRow label="เมื่อ" value={formatShortThaiDateTime(detailModal.item.cost_approved_at)} />
                  </View>
                ) : null}

                {detailModal.item.exec_approved_by ? (
                  <View style={styles.modalBox}>
                    <Text style={styles.modalBoxTitle}>
                      <Ionicons name="ribbon-outline" size={13} color="#0e9fb4" /> อนุมัติระดับผู้บริหาร (ล่าสุด)
                    </Text>
                    <ModalRow label="โดย" value={detailModal.item.exec_approved_by} />
                    <ModalRow label="เมื่อ" value={formatShortThaiDateTime(detailModal.item.exec_approved_at)} />
                  </View>
                ) : null}

                {(detailModal.item.mgr_approve_history?.length ?? 0) > 0 && (
                  <View style={styles.modalBox}>
                    <Text style={styles.modalBoxTitle}>ประวัติอนุมัติ (ผจก.)</Text>
                    {detailModal.item.mgr_approve_history!.map((h, i) => (
                      <ModalRow key={i} label={h.po_number} value={`${h.approved_by} • ${formatShortThaiDateTime(h.approved_at)}`} />
                    ))}
                  </View>
                )}

                {(detailModal.item.exec_approve_history?.length ?? 0) > 0 && (
                  <View style={styles.modalBox}>
                    <Text style={styles.modalBoxTitle}>ประวัติอนุมัติ (ผู้บริหาร)</Text>
                    {detailModal.item.exec_approve_history!.map((h, i) => (
                      <ModalRow key={i} label={h.po_number} value={`${h.approved_by} • ${formatShortThaiDateTime(h.approved_at)}`} />
                    ))}
                  </View>
                )}

                {(detailModal.item.sub_items?.length ?? 0) > 0 && (
                  <View style={styles.modalBox}>
                    <Text style={styles.modalBoxTitle}>รายการย่อย</Text>
                    {detailModal.item.sub_items!.map((s, i) => (
                      <ModalRow key={i} label={s.name ?? s.item_name ?? `รายการย่อย ${i + 1}`} value={String(s.qty ?? s.quantity ?? '-')} />
                    ))}
                  </View>
                )}
              </ScrollView>
            )}

            <Pressable onPress={() => setDetailModal({ visible: false })} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>ปิดหน้าต่าง</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* -------------------- Price edit modal -------------------- */}
      <Modal visible={priceModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle} numberOfLines={2}>แก้ไขราคาทุน — {priceModal.item?.item_name}</Text>
              <Pressable onPress={() => setPriceModal({ visible: false })} hitSlop={8}>
                <Ionicons name="close" size={20} color="#64748b" />
              </Pressable>
            </View>
            <Text style={styles.fieldLabel}>ราคาทุน/หน่วย ใหม่</Text>
            <TextInput
              style={styles.priceInput}
              keyboardType="decimal-pad"
              value={newPrice}
              onChangeText={setNewPrice}
              placeholder="0.00"
              placeholderTextColor="#9caab8"
            />
            <Text style={styles.fieldLabel}>หมายเหตุ (ถ้ามี)</Text>
            <TextInput
              style={styles.noteInput}
              value={priceNote}
              onChangeText={setPriceNote}
              placeholder="ระบุเหตุผลที่แก้ไข..."
              placeholderTextColor="#9caab8"
              multiline
            />
            <Pressable
              onPress={handleSavePrice}
              disabled={savingPrice}
              style={({ pressed }) => [styles.pickerBtn, pressed && styles.pressed, savingPrice && styles.disabled]}
            >
              {savingPrice ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={16} color="#fff" />}
              <Text style={styles.pickerBtnText}>บันทึกราคาทุน</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* -------------------- Purchase history modal -------------------- */}
      <Modal visible={purchaseHistoryModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle}>ประวัติการซื้อ</Text>
              <Pressable onPress={() => setPurchaseHistoryModal({ visible: false, loading: false, rows: [] })} hitSlop={8}>
                <Ionicons name="close" size={20} color="#64748b" />
              </Pressable>
            </View>
            {purchaseHistoryModal.loading ? (
              <ActivityIndicator color="#0e9fb4" style={{ marginTop: 20 }} />
            ) : purchaseHistoryModal.rows.length === 0 ? (
              <Text style={styles.stateText}>ยังไม่มีประวัติการซื้อ</Text>
            ) : (
              <ScrollView style={{ marginTop: 8, maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {purchaseHistoryModal.rows.map((r, i) => (
                  <View key={i} style={styles.historyRow}>
                    <Text style={styles.historyRowTitle} numberOfLines={2}>{r.item_name}</Text>
                    <Text style={styles.historyRowSub}>PO {r.po_number || '-'} • {r.supplier_name || '-'}</Text>
                    <Text style={styles.historyRowSub}>สั่งโดย {r.orderer_name || '-'} • {r.order_date ? formatShortThaiDate(r.order_date) : r.order_date_thai || '-'}</Text>
                    <View style={styles.historyRowFoot}>
                      <Text style={styles.historyRowAmount}>{fmt(r.buy_quantity)} x {fmt(r.buy_unit_price)} = {fmt(r.total_price)}</Text>
                      <Text style={styles.historyRowApprove}>
                        {r.cost_approved_by ? 'ผจก. ✓' : 'ผจก. รออนุมัติ'} / {r.exec_approved_by ? 'ผู้บริหาร ✓' : 'ผู้บริหาร รออนุมัติ'}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* -------------------- Cost edit history modal -------------------- */}
      <Modal visible={costHistoryModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle}>ประวัติแก้ไขราคาทุน</Text>
              <Pressable onPress={() => setCostHistoryModal({ visible: false, loading: false, rows: [] })} hitSlop={8}>
                <Ionicons name="close" size={20} color="#64748b" />
              </Pressable>
            </View>
            {costHistoryModal.loading ? (
              <ActivityIndicator color="#0e9fb4" style={{ marginTop: 20 }} />
            ) : costHistoryModal.rows.length === 0 ? (
              <Text style={styles.stateText}>ยังไม่มีประวัติแก้ไขราคาทุน</Text>
            ) : (
              <ScrollView style={{ marginTop: 8, maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {costHistoryModal.rows.map((r, i) => (
                  <View key={i} style={styles.historyRow}>
                    <Text style={styles.historyRowTitle} numberOfLines={2}>{r.item_name}</Text>
                    <Text style={styles.historyRowSub}>โดย {r.user || '-'} • {r.time ? formatShortThaiDateTime(r.time) : r.time_thai || '-'}</Text>
                    <Text style={styles.historyRowAmount}>
                      {fmt(r.old_unit)} → {fmt(r.new_unit)} /หน่วย (รวม {fmt(r.old_total)} → {fmt(r.new_total)})
                    </Text>
                    {!!r.note && <Text style={styles.historyRowSub}>หมายเหตุ: {r.note}</Text>}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* -------------------- Pending POs modal (ข้ามโครงการ) -------------------- */}
      <Modal visible={pendingPosModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle}>PO ค้างอนุมัติ (ข้ามโครงการ)</Text>
              <Pressable onPress={() => setPendingPosModal({ visible: false, loading: false, rows: [] })} hitSlop={8}>
                <Ionicons name="close" size={20} color="#64748b" />
              </Pressable>
            </View>
            {pendingPosModal.loading ? (
              <ActivityIndicator color="#0e9fb4" style={{ marginTop: 20 }} />
            ) : pendingPosModal.rows.length === 0 ? (
              <Text style={styles.stateText}>ไม่มี PO ค้างอนุมัติ</Text>
            ) : (
              <ScrollView style={{ marginTop: 8, maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {pendingPosModal.rows.map((r, i) => (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}
                    onPress={() => openPoDetail(r.po_number)}
                  >
                    <Text style={styles.historyRowTitle}>PO {r.po_number}</Text>
                    <Text style={styles.historyRowSub}>{r.project_count} โครงการ • {r.item_count} รายการ</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* -------------------- PO detail modal — อนุมัติรายงวด (approve_installment) -------------------- */}
      <Modal visible={poDetailModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle}>PO {poDetailModal.poNumber}</Text>
              <Pressable onPress={() => setPoDetailModal({ visible: false, loading: false, poNumber: '', items: [], canApproveMgr: false, canApproveExec: false })} hitSlop={8}>
                <Ionicons name="close" size={20} color="#64748b" />
              </Pressable>
            </View>
            {poDetailModal.loading ? (
              <ActivityIndicator color="#0e9fb4" style={{ marginTop: 20 }} />
            ) : poDetailModal.items.length === 0 ? (
              <Text style={styles.stateText}>ไม่พบรายการของ PO นี้</Text>
            ) : (
              <ScrollView style={{ marginTop: 8, maxHeight: 460 }} showsVerticalScrollIndicator={false}>
                {poDetailModal.items.map((it) => (
                  <View key={it.item_id} style={styles.historyRow}>
                    <Text style={styles.historyRowTitle} numberOfLines={2}>{it.item_name}</Text>
                    <Text style={styles.historyRowSub}>{it.display_code || it.project_name} • {it.order_date ? formatShortThaiDate(it.order_date) : it.order_date_thai || '-'}</Text>
                    <Text style={styles.historyRowAmount}>{fmt(it.buy_quantity)} • รวม {fmt(it.total_price)}</Text>

                    {it.installments.length === 0 ? (
                      (it.poi_cost_pending || it.poi_exec_pending) ? (
                        <View style={styles.instRow}>
                          <Text style={styles.instRowAmount}>บิลนี้ไม่มีงวดย่อย — อนุมัติทั้งบิล</Text>
                          <View style={styles.instRowActions}>
                            {poDetailModal.canApproveMgr && !!it.poi_cost_pending ? (
                              <Pressable
                                disabled={busyPoItemId === it.item_id}
                                onPress={() => handleApprovePoItem(it, 'mgr')}
                                style={[styles.rowAction, styles.mgrAction, busyPoItemId === it.item_id && styles.disabled]}
                              >
                                {busyPoItemId === it.item_id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.rowActionText}>อนุมัติ (ผจก.)</Text>}
                              </Pressable>
                            ) : !it.poi_cost_pending ? (
                              <Text style={styles.instRowStatus}>ผจก. ✓</Text>
                            ) : null}
                            {poDetailModal.canApproveExec && !!it.poi_exec_pending ? (
                              <Pressable
                                disabled={busyPoItemId === it.item_id}
                                onPress={() => handleApprovePoItem(it, 'exec')}
                                style={[styles.rowAction, styles.execAction, busyPoItemId === it.item_id && styles.disabled]}
                              >
                                {busyPoItemId === it.item_id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.rowActionText}>อนุมัติ (ผู้บริหาร)</Text>}
                              </Pressable>
                            ) : !it.poi_exec_pending ? (
                              <Text style={styles.instRowStatus}>ผู้บริหาร ✓</Text>
                            ) : null}
                          </View>
                        </View>
                      ) : (
                        <Text style={[styles.historyRowSub, { marginTop: 4 }]}>อนุมัติครบแล้ว</Text>
                      )
                    ) : (
                      it.installments.map((inst) => (
                        <View key={inst.id} style={styles.instRow}>
                          <Text style={styles.instRowAmount}>งวด {fmt(inst.amount)}</Text>
                          <View style={styles.instRowActions}>
                            {poDetailModal.canApproveMgr && !inst.cost_approved_by ? (
                              <Pressable
                                disabled={busyInstId === inst.id}
                                onPress={() => handleApproveInstallment(inst.id, 'mgr')}
                                style={[styles.rowAction, styles.mgrAction, busyInstId === inst.id && styles.disabled]}
                              >
                                {busyInstId === inst.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.rowActionText}>อนุมัติ (ผจก.)</Text>}
                              </Pressable>
                            ) : (
                              <Text style={styles.instRowStatus}>{inst.cost_approved_by ? `ผจก. ✓ ${inst.cost_approved_by}` : 'ผจก. รออนุมัติ'}</Text>
                            )}
                            {poDetailModal.canApproveExec && !inst.exec_approved_by ? (
                              <Pressable
                                disabled={busyInstId === inst.id}
                                onPress={() => handleApproveInstallment(inst.id, 'exec')}
                                style={[styles.rowAction, styles.execAction, busyInstId === inst.id && styles.disabled]}
                              >
                                {busyInstId === inst.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.rowActionText}>อนุมัติ (ผู้บริหาร)</Text>}
                              </Pressable>
                            ) : (
                              <Text style={styles.instRowStatus}>{inst.exec_approved_by ? `ผู้บริหาร ✓ ${inst.exec_approved_by}` : 'ผู้บริหาร รออนุมัติ'}</Text>
                            )}
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ModalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.modalRow}>
      <Text style={styles.modalRowLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.modalRowValue} numberOfLines={3}>{value || '-'}</Text>
    </View>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#eef2f6' },
  content: { padding: 14, paddingBottom: 36 },

  header: { backgroundColor: '#ffffff', borderRadius: 20, padding: 16, marginBottom: 14, elevation: 2 },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  titleIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#e5f6f9', alignItems: 'center', justifyContent: 'center' },
  titleCopy: { flex: 1 },
  title: { color: '#0f2438', fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  subtitle: { color: '#6c7d90', fontSize: 12, lineHeight: 17, marginTop: 5 },
  headerControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 15 },
  ghostButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#dae2ea', flexDirection: 'row', alignItems: 'center', gap: 6 },
  ghostText: { color: '#54677b', fontSize: 12, fontWeight: '700' },
  refresh: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#bfe9f0', backgroundColor: '#f0fbfd', flexDirection: 'row', alignItems: 'center', gap: 6 },
  refreshText: { color: '#0e9fb4', fontSize: 12, fontWeight: '800' },
  simRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f6' },
  simLabel: { color: '#3f5266', fontSize: 13, fontWeight: '700' },

  offline: { backgroundColor: '#fbe9e7', borderRadius: 13, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 },
  offlineText: { flex: 1, color: '#8d4747', fontSize: 12 },

  panel: { backgroundColor: '#ffffff', borderRadius: 20, padding: 12, marginBottom: 14, elevation: 2 },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48.6%', minHeight: 74, borderRadius: 14, borderWidth: 1, borderColor: '#e6ecf2', backgroundColor: '#ffffff', flexDirection: 'row', overflow: 'hidden' },
  tileEdge: { width: 4 },
  tileBody: { flex: 1, padding: 10, justifyContent: 'space-between' },
  tileLabelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  tileLabel: { flex: 1, color: '#6d7d8e', fontSize: 10.5, lineHeight: 14 },
  tileValue: { fontSize: 15, fontWeight: '900', marginTop: 6 },
  tileSkeleton: { width: '31%', height: 74, borderRadius: 14, backgroundColor: '#e6ecf2' },

  cutOutHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cutOutTitle: { flex: 1, color: '#92400e', fontSize: 12.5, fontWeight: '800' },
  cutOutSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  cutOutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  cutOutRowText: { flex: 1, color: '#3f5266', fontSize: 12.5 },
  cutOutRowQty: { color: '#6c7d90', fontSize: 12 },

  secondaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 16, borderWidth: 1, borderColor: '#bfe9f0', backgroundColor: '#f0fbfd' },
  secondaryBtnText: { color: '#0e9fb4', fontSize: 12, fontWeight: '700' },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, height: 44, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 13, color: '#2b3746' },

  stateBox: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  stateTitle: { color: '#3f5266', fontSize: 14, fontWeight: '800' },
  stateText: { color: '#8b98a8', fontSize: 12 },

  itemCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 13, marginBottom: 10, elevation: 1, borderWidth: 1, borderColor: '#eef2f6' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  itemTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemName: { color: '#0f2438', fontSize: 14.5, fontWeight: '800' },
  itemModel: { color: '#8b98a8', fontSize: 11.5, marginTop: 2 },
  expenseTag: { backgroundColor: '#fef3c7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  expenseTagText: { color: '#92400e', fontSize: 10.5, fontWeight: '800' },
  itemMetaRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  itemMeta: { color: '#0e9fb4', fontSize: 11.5, fontWeight: '700' },
  itemMetaDim: { color: '#9aa7b5', fontSize: 11.5 },

  microLabel: { color: '#8b98a8', fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  itemQtyRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  itemQtyCell: { flex: 1, backgroundColor: '#f6f8fa', borderRadius: 10, padding: 8 },
  itemQtyValue: { color: '#2b3746', fontSize: 12.5, fontWeight: '700' },

  itemDiffRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  itemDiffValue: { fontSize: 13, fontWeight: '900' },

  itemFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 11, fontWeight: '800' },
  infoTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  infoTagText: { color: '#5a6b7e', fontSize: 10.5, fontWeight: '700' },

  itemActionsRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  rowAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  rowActionText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  mgrAction: { backgroundColor: '#2f7fe0' },
  execAction: { backgroundColor: '#7c4fdc' },
  editAction: { backgroundColor: '#0e9f8c' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  footerText: { color: '#8b98a8', fontSize: 11 },

  toast: { position: 'absolute', bottom: 24, left: 20, right: 20, backgroundColor: '#1f2937', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 4 },
  toastText: { flex: 1, color: '#ffffff', fontSize: 12.5, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxHeight: '84%', backgroundColor: '#ffffff', borderRadius: 20, padding: 16 },
  modalHeadRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  modalTitle: { flex: 1, color: '#0f2438', fontSize: 15.5, fontWeight: '900' },
  modalBox: { backgroundColor: '#f6f8fa', borderRadius: 14, padding: 12, marginBottom: 10 },
  modalBoxTitle: { color: '#3f5266', fontSize: 12.5, fontWeight: '800', marginBottom: 8 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  modalRowLabel: { color: '#8b98a8', fontSize: 12, flexShrink: 0 },
  modalRowValue: { flex: 1, textAlign: 'right', color: '#2b3746', fontSize: 12.5, fontWeight: '700' },
  modalCloseBtn: { marginTop: 6, alignItems: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: '#f1f5f9' },
  modalCloseBtnText: { color: '#3f5266', fontSize: 13, fontWeight: '800' },

  historyRow: { borderWidth: 1, borderColor: '#e7ecf2', borderRadius: 14, padding: 12, marginBottom: 8, backgroundColor: '#fbfcfd' },
  historyRowTitle: { color: '#0f2438', fontSize: 13, fontWeight: '800' },
  historyRowSub: { color: '#77879a', fontSize: 11.5, marginTop: 2 },
  historyRowFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, flexWrap: 'wrap', gap: 4 },
  historyRowAmount: { color: '#2b3746', fontSize: 12.5, fontWeight: '700', marginTop: 4 },
  historyRowApprove: { color: '#5a6b7e', fontSize: 10.5, fontWeight: '700' },

  instRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eef2f6' },
  instRowAmount: { color: '#2b3746', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  instRowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  instRowStatus: { color: '#8b98a8', fontSize: 11, fontWeight: '600' },

  fieldLabel: { color: '#5a6b7e', fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  priceInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#2b3746' },
  noteInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#2b3746', minHeight: 60, textAlignVertical: 'top' },

  pickerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  pickerCard: { width: '100%', backgroundColor: '#ffffff', borderRadius: 20, padding: 22, alignItems: 'center', elevation: 2 },
  pickerTitle: { color: '#0f2438', fontSize: 18, fontWeight: '900', marginTop: 8 },
  pickerSubtitle: { color: '#6c7d90', fontSize: 12.5, textAlign: 'center', marginTop: 6, marginBottom: 16, lineHeight: 18 },
  pickerInput: { width: '100%', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#2b3746', textAlign: 'center', marginBottom: 12 },
  pickerBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0e9fb4', borderRadius: 14, paddingVertical: 13, marginTop: 4 },
  pickerBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
});
