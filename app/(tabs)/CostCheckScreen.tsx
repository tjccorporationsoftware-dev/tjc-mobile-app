/**
 * CostCheckScreen.tsx
 * ------------------------------------------------------------------
 * "ตรวจสอบต้นทุน / วิเคราะห์ต้นทุน" รายโครงการ — มือถือของหน้าเว็บ cost_check.php
 * ใช้ API v2: mobile_api/modules/cost_check_API_mobile.php (17 action — ดู mobile_api/docs/README_cost_check.md)
 *
 * หน้าเว็บเป็นตาราง 22 คอลัมน์ → แอปวาดเป็น "การ์ดรายการ" 1 ใบต่อแถว เรียงและแบ่งหมวดตามเว็บ
 * ทุกตัวเลข ป้ายสถานะ สีการ์ด และสิทธิ์ มาจาก API แล้ว — หน้านี้มีหน้าที่วาดอย่างเดียว
 *   (ยกเว้นแถบสรุปตอนติ๊กเลือกใบในป็อปอัป "ผูกใบ" และยอดปุ่มอนุมัติข้ามหน้างาน ที่เว็บก็คิดสดตามที่ติ๊ก)
 *
 * ทางเข้า: 1) เมนู sidebar "ตรวจสอบต้นทุน" (หมวดแดชบอร์ดโครงการ สิทธิ์ cost_check.php แบบเว็บ) — ไม่มี id
 *          2) แดชบอร์ดโครงการ → ปุ่ม "วิเคราะห์ต้นทุน" (ส่ง id + onBack มา) — แบบปุ่มในหน้า project_details.php
 *          ไม่มี id = เปิดหน้าเลือกหน้างาน (list_projects)
 *
 * ป็อปอัปเปิดทีละอัน — ป็อปอัปที่เปิดต่อจากอันอื่น (ยกเลิกอนุมัติ/ประวัติ/ผูกใบ) ปิดแล้วพากลับอันเดิม
 * แบบเดียวกับที่เว็บเปิด "จัดการเอกสาร" กลับมาให้ (Modal ซ้อนกันบน iOS ไม่ขึ้น)
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ListPager from '../../components/ListPager';
import { API_BASE, API_MODULES } from '../../constants/config';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';
import { useAuth } from '../_layout';

const COST_API = `${API_MODULES}/cost_check_API_mobile.php`;
const PROJECT_API = `${API_MODULES}/project_API_mobile.php`;
const PENDING_PAGE_SIZE = 30;

// ====================================================================
// Types — ชื่อฟิลด์ตรงกับ response จริงของ cost_check_API_mobile.php v2
// ====================================================================

type Perms = {
  can_approve_mgr: boolean;
  can_approve_exec: boolean;
  can_update_cost_price: boolean;
  can_cancel_approval_mgr: boolean;
  can_cancel_approval_exec: boolean;
  can_link_docs: boolean;
  can_edit_po: boolean;
  can_close_project: boolean;
  can_cancel_project: boolean;
};

type StatusInfo = {
  state: 'open' | 'closed' | 'canceled';
  label: string;
  badge_class: string;
  badge_icon: string;
  closed_by: string;
  closed_at_display: string;
  canceled_by: string;
  cancel_reason: string;
  can_close: boolean;
  can_undo_close: boolean;
  can_cancel: boolean;
};

type Project = {
  id: number;
  project_code: string;
  display_code: string;
  project_name: string;
  customer_name: string;
  customer_address: string;
  company: { short: string; name: string; logo: string };
  status_info: StatusInfo;
};

type Summary = {
  grand_total_standard: number;
  grand_total_plan: number;
  total_discount_value: number;
  net_grand_total_plan: number;
  grand_total_actual_product: number;
  grand_total_actual_full: number;
  grand_total_claim: number;
  grand_diff: number;
  grand_diff_percent: number;
  project_budget: number;
  factor_f: number;
  has_factor_f: boolean;
  actual_budget_pct: number | null;
  actual_budget_pct_bar: number | null;
  actual_over_budget: boolean;
  is_save: boolean;
  diff_text: string;
  net_profit_percent: number;
  show_actual_full_total: boolean;
};

type Colors3 = { bg: string; border: string; text: string };

type PayCard = {
  pn: string;
  bill: number;
  here: number;
  sites: number;
  docs: number;
  paid_docs: number;
  paid: number;
  at_display: string;
  linked: boolean;
  comps: { name: string; cross: boolean; n: number; paid: number }[];
  state: string;
  label: string;
  colors: Colors3;
  diff_label: string;
  diff_amount: number;
};

type PayBlock = {
  show: 'cards' | 'stock' | 'none';
  collapsed: boolean;
  summary: null | {
    bill_count: number;
    done_text: string;
    sum_bill: number;
    sum_paid: number;
    sum_diff: number;
    show_diff: boolean;
    diff_label: string;
    colors: Colors3;
  };
  cards: PayCard[];
  stock_count: number;
};

type ApprovalCell = {
  mode: 'normal' | 'labor_merged';
  label: string;
  approved: null | { name: string; count_text: string; date_dmy: string; clock: string };
  pending: null | { label: string };
  can_cancel: boolean;
};

type PoPill = { po_number: string; state: 'full' | 'partial' | 'pending'; progress_pct: number; progress_text: string };

type CostItem = {
  id: number;
  row_no: number; // เลขลำดับ "#" แบบที่เว็บวาด (API เรียงกลุ่มหมวดแบบเว็บมาให้แล้ว)
  item_name: string;
  model_name: string;
  unit: string;
  pr_label: string;
  group_key: string;
  group_label: string;
  plan_qty: number;
  actual_qty: number;
  original_plan_qty: number;
  original_actual_qty: number;
  qty_changed_by_sim: boolean;
  over_qty: number;
  over_price_qty: number;
  return_wh_qty: number;
  claim_qty: number;
  standard_price: number;
  cost_price: number;
  split_sub_plan_cost: number;
  latest_buy_price: number;
  latest_price_trend: '' | 'up' | 'down' | 'same';
  price_flag: { state: '' | 'over' | 'cheaper' | 'equal'; text: string };
  total_standard_budget: number;
  total_plan_budget: number;
  total_product_only: number;
  total_with_expenses: number;
  ext_cost: number;
  actual_full_display: 'expense_used' | 'with_hidden' | 'none';
  claim_cost: number;
  show_claim: boolean;
  diff_rounded: number;
  diff_sign: 'plus' | 'minus' | 'zero';
  diff_percent: number;
  expense_box: null | { budget: number; used: number; remain: number; percent_bar: number };
  is_expense_row: number;
  is_expense_type: number;
  is_labor_merged: number;
  has_network_bom: number;
  mgr_cell: ApprovalCell;
  exec_cell: ApprovalCell;
  po_numbers: string[];
  po_pills: PoPill[];
  refunded_po_numbers: string[];
  pay: PayBlock;
  orderers: string[];
  sub_breakdown_count: number;
  supplier_name: string;
  custom_name_raw: string;
  custom_subname: string;
  custom_subname2: string;
  edit_cost: { qty: number; current_unit_cost: number };
};

type SiteRow = { pid: number; name: string; cus: string; co: string; amt: number; here: boolean };

type CostDetail = Perms & {
  project: Project;
  sim_delivery: number;
  summary: Summary;
  cut_out: { items: { name: string; cut_qty: number; unit: string; std_total: number; plan_total: number }[]; total_cut_std: number; total_cut_plan: number };
  orderers: { orderer_name: string; count: number }[];
  po_site_map: Record<string, { sites: SiteRow[]; total: number }>;
  refund_count: number;
  items: CostItem[];
};

type CancelOpt = {
  scope: 'installment' | 'po' | 'item';
  role: 'mgr' | 'exec';
  instId?: number;
  seqNo?: number;
  poNumber?: string;
  itemIds?: number[];
  itemName?: string;
};

type ItemPopupMode = 'over' | 'over_price' | 'sub' | 'bom';

// ====================================================================
// Helpers
// ====================================================================

function num(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return isFinite(n) ? n : 0;
}
/** ตัวเลข 2 ตำแหน่งแบบ number_format ของเว็บ */
function fmt(v: any, digits = 2): string {
  return num(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
/** จำนวนแบบ toLocaleString() ของเว็บ (ไม่บังคับทศนิยม) */
function fmtQty(v: any): string {
  return num(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
/** วันที่ dd/mm/yy พ.ศ. แบบ toLocaleDateString('th-TH', 2-digit) ในป็อปอัปผู้สั่งซื้อ */
function thShort(ymd?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd ?? ''));
  if (!m) return '-';
  return `${m[3]}/${m[2]}/${String(parseInt(m[1], 10) + 543).slice(-2)}`;
}
function errMsg(e: any, fallback: string): string {
  return (e && e.message) || fallback;
}

const PILL_TONE: Record<PoPill['state'], Colors3> = {
  full: { bg: '#dcfce7', border: '#86efac', text: '#15803d' },
  partial: { bg: '#fef3c7', border: '#fcd34d', text: '#a16207' },
  pending: { bg: '#ffedd5', border: '#fed7aa', text: '#c2410c' },
};

const PR_TONE: Record<string, Colors3> = {
  'ตาม ปร.': { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
  'นอก ปร.': { bg: '#fffbeb', border: '#fcd34d', text: '#b45309' },
};
const NEUTRAL_TONE: Colors3 = { bg: '#f1f5f9', border: '#cbd5e1', text: '#475569' };

/** สีป้ายสถานะงาน — ชุดเดียวกับ .ph-st-* ของหน้าเว็บ (class จาก pd_compute_row_flags) */
const STATUS_TONE: Record<string, Colors3> = {
  success: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
  completed: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
  warning: { bg: '#fffbeb', border: '#fcd34d', text: '#b45309' },
  'purchase-complete': { bg: '#fefce8', border: '#fde047', text: '#854d0e' },
  purchasing: { bg: '#eef2ff', border: '#c7d2fe', text: '#4338ca' },
  po: { bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490' },
  'paid-full-status': { bg: '#faf5ff', border: '#e9d5ff', text: '#7e22ce' },
  danger: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
};
function statusTone(cls: string): Colors3 {
  return STATUS_TONE[cls] ?? { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b' };
}

// ====================================================================
// ชิ้นส่วนเล็ก
// ====================================================================

function Badge({ text, tone, icon, onPress, mono }: { text: string; tone: Colors3; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void; mono?: boolean }) {
  const body = (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      {icon ? <Ionicons name={icon} size={11} color={tone.text} /> : null}
      <Text style={[styles.badgeText, { color: tone.text }, mono && styles.mono]}>{text}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} hitSlop={4} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

/** หัวหมวดย่อยในตารางตัวเลขของการ์ดรายการ */
function NumHead({ text, first }: { text: string; first?: boolean }) {
  return (
    <View style={[styles.numHead, first && styles.numHeadFirst]}>
      <Text style={styles.numHeadText}>{text}</Text>
    </View>
  );
}

/** แถวตัวเลข 1 ช่อง: ป้ายซ้าย ค่าชิดขวา */
function NumRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.numRow}>
      <Text style={styles.numLabel}>{label}</Text>
      <View style={styles.numValCol}>{children}</View>
    </View>
  );
}

function Dash() {
  return <Text style={styles.dash}>-</Text>;
}

function SheetModal({
  visible,
  title,
  icon,
  color,
  onClose,
  children,
  footer,
  tall,
}: {
  visible: boolean;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tall?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, tall && styles.modalCardTall]}>
          <View style={[styles.modalHead, { backgroundColor: color }]}>
            <Ionicons name={icon} size={17} color="#fff" />
            <Text style={styles.modalHeadTitle} numberOfLines={2}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={styles.modalFooter}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

function LoadingBox({ text }: { text: string }) {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator color="#4f46e5" />
      <Text style={styles.stateText}>{text}</Text>
    </View>
  );
}

function EmptyBox({ text, icon = 'information-circle-outline' }: { text: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.stateBox}>
      <Ionicons name={icon} size={26} color="#94a3b8" />
      <Text style={styles.stateText}>{text}</Text>
    </View>
  );
}

// ====================================================================
// ช่องอนุมัติ / การ์ดจ่ายเงิน / การ์ดรายการ
// ====================================================================

/**
 * ช่องอนุมัติ 1 ฝั่ง — ค้างอนุมัติ + มีสิทธิ์ระดับนี้ (bills ไม่ว่าง) → แสดงปุ่มอนุมัติแทนป้าย "รออนุมัติ" (บิลละปุ่ม)
 * ไม่มีสิทธิ์ → bills ว่าง → ยังเห็นป้าย "รออนุมัติ" แบบเดิม
 */
function ApprovalBox({
  title,
  cell,
  role,
  bills,
  busy,
  onCancel,
  onApprove,
}: {
  title: string;
  cell: ApprovalCell;
  role: 'mgr' | 'exec';
  bills: string[];
  busy: BillBusy | null;
  onCancel: () => void;
  onApprove: (pn: string) => void;
}) {
  const isMgr = role === 'mgr';
  // อนุมัติแล้วใช้โทนเขียวเดียวกันทั้ง 2 ฝั่ง (หัวคอลัมน์บอกอยู่แล้วว่าใครอนุมัติ) — ลดจำนวนสีในการ์ด
  const tone = { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', sub: '#15803d' };
  return (
    <View style={styles.apprCol}>
      <Text style={styles.apprTitle}>{title}</Text>
      {cell.mode === 'labor_merged' ? (
        <Badge text="รวมค่าแรง" icon="hammer" tone={{ bg: '#d1fae5', border: '#6ee7b7', text: '#047857' }} />
      ) : (
        <>
          {cell.approved ? (
            <View style={[styles.apprBox, { backgroundColor: tone.bg, borderColor: tone.border }]}>
              <View style={styles.apprNameRow}>
                <Ionicons name={isMgr ? 'checkmark-circle' : 'person-circle'} size={13} color={tone.sub} />
                <Text style={[styles.apprName, { color: tone.text }]} numberOfLines={2}>{cell.approved.name}</Text>
                {cell.approved.count_text ? (
                  <View style={[styles.apprCount, { borderColor: tone.border }]}>
                    <Text style={[styles.apprCountText, { color: tone.sub }]}>{cell.approved.count_text}</Text>
                  </View>
                ) : null}
              </View>
              {cell.approved.date_dmy ? (
                <Text style={[styles.apprTime, { color: tone.sub }]}>{cell.approved.date_dmy} · {cell.approved.clock}</Text>
              ) : null}
              {cell.can_cancel ? (
                <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelMini, pressed && styles.pressed]}>
                  <Ionicons name="ban" size={11} color="#dc2626" />
                  <Text style={styles.cancelMiniText}>ยกเลิกอนุมัติ</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {cell.pending && bills.length > 0
            ? bills.map((pn) => (
                <ApproveBillBtn
                  key={pn}
                  role={role}
                  pn={bills.length > 1 ? pn : undefined}
                  busy={busy?.pn === pn && busy.role === role}
                  disabled={!!busy}
                  onPress={() => onApprove(pn)}
                />
              ))
            : null}
          {cell.pending && bills.length === 0 ? (
            <View style={styles.pendingBox}>
              <Ionicons name="hourglass-outline" size={12} color="#d97706" />
              <Text style={styles.pendingText}>{cell.pending.label}</Text>
            </View>
          ) : null}
          {!cell.approved && !cell.pending ? <Dash /> : null}
        </>
      )}
    </View>
  );
}

function PayCardView({ c, onLink, onSites }: { c: PayCard; onLink: () => void; onSites: () => void }) {
  return (
    // พื้นการ์ดขาว — สีสถานะจาก API ใช้แค่แถบซ้าย + ป้ายสถานะ ไม่ให้ทั้งใบเป็นสี
    <View style={[styles.payCard, { borderLeftColor: c.colors.text }]}>
      <View style={styles.payTop}>
        <Text style={styles.payPn} numberOfLines={1}>
          {c.pn}
          {c.linked ? '  🔗' : ''}
        </Text>
        <View style={[styles.payState, { backgroundColor: c.colors.bg, borderColor: c.colors.border }]}>
          <Text style={[styles.payStateText, { color: c.colors.text }]}>{c.label}</Text>
        </View>
      </View>
      <View style={styles.payRow}>
        <Text style={styles.payLbl}>จ่ายแล้ว</Text>
        <Text style={[styles.payVal, { color: c.paid > 0 ? '#15803d' : '#cbd5e1' }]}>{fmt(c.paid)}</Text>
      </View>
      <View style={styles.payRow}>
        <Text style={styles.payLbl}>ยอดบิล</Text>
        <Text style={[styles.payVal, { color: '#475569' }]}>{fmt(c.bill)}</Text>
      </View>
      {c.sites > 1 ? (
        <View style={styles.payRow}>
          <Text style={styles.payLbl}>เฉพาะหน้างานนี้</Text>
          <Text style={[styles.payVal, { color: '#0f172a' }]}>{fmt(c.here)}</Text>
        </View>
      ) : null}
      {c.comps.length > 0 ? (
        <View style={styles.payRow}>
          <Text style={styles.payLbl}>บริษัทที่จ่าย</Text>
          <Text style={styles.payComps}>
            {c.comps.map((m, i) => (
              <Text key={i} style={{ color: m.cross ? '#7c3aed' : '#334155' }}>
                {i ? ' · ' : ''}
                {m.name}
                {m.cross ? ' ⇄' : ''}
              </Text>
            ))}
          </Text>
        </View>
      ) : null}
      {c.diff_label ? (
        <View style={[styles.payRow, styles.payDiffRow]}>
          <Text style={[styles.payLbl, { color: c.colors.text }]}>{c.diff_label}</Text>
          <Text style={[styles.payVal, { color: c.colors.text }]}>{fmt(c.diff_amount)}</Text>
        </View>
      ) : null}
      {c.at_display || c.sites > 1 ? (
        <View style={styles.payFoot}>
          <Text style={styles.payDate}>{c.at_display}</Text>
          {c.sites > 1 ? (
            <Pressable onPress={onSites} hitSlop={6}>
              <Text style={styles.paySites}>{c.sites} หน้างาน</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Pressable onPress={onLink} style={({ pressed }) => [styles.payLinkBtn, pressed && styles.pressed]}>
        <Ionicons name="link" size={11} color="#4f46e5" />
        <Text style={styles.payLinkText}>ผูกใบ</Text>
      </Pressable>
    </View>
  );
}

type ItemHandlers = {
  openPo: (pn: string) => void;
  openRefund: (pn: string) => void;
  openPopup: (item: CostItem, mode: ItemPopupMode) => void;
  openPayList: (item: CostItem) => void;
  openLink: (pn: string) => void;
  openSites: (pn: string) => void;
  openOrderer: (name: string) => void;
  cancelItem: (item: CostItem, role: 'mgr' | 'exec') => void;
  editCost: (item: CostItem) => void;
  approveBill: (item: CostItem, pn: string, role: 'mgr' | 'exec') => void;
};

/** บิลที่กำลังเช็กก่อนอนุมัติจากปุ่มในการ์ด (ส่งให้เฉพาะการ์ดที่กด) */
type BillBusy = { itemId: number; pn: string; role: 'mgr' | 'exec' };

/** กล่องเลขที่เอกสาร 1 บิล — แถบซ้าย + ป้ายความคืบหน้าใช้สีสถานะ (PILL_TONE) ตัวเลขบิลใหญ่สีเข้ม */
function PoBox({ pn, sub, tone, refunded, onPress }: { pn: string; sub?: string; tone: Colors3; refunded?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.poBox, { borderLeftColor: tone.text }, refunded && styles.poBoxRefunded, pressed && styles.pressed]}>
      <View style={[styles.poBoxIcon, { backgroundColor: tone.bg, borderColor: tone.border }]}>
        <Ionicons name={refunded ? 'arrow-undo' : 'document-text'} size={15} color={tone.text} />
      </View>
      <Text style={[styles.poBoxNo, refunded && styles.poBoxNoRefunded]} numberOfLines={1}>{pn}</Text>
      {sub ? (
        <View style={[styles.poBoxTag, { backgroundColor: tone.bg, borderColor: tone.border }]}>
          <Text style={[styles.poBoxTagText, { color: tone.text }]} numberOfLines={1}>{sub}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
    </Pressable>
  );
}

/** ปุ่มอนุมัติในช่องอนุมัติ — รายการที่มีหลายบิลจะมีบิลละปุ่ม พร้อมเลขบิลใต้คำว่าอนุมัติ */
function ApproveBillBtn({ role, pn, busy, disabled, onPress }: { role: 'mgr' | 'exec'; pn?: string; busy: boolean; disabled: boolean; onPress: () => void }) {
  const isMgr = role === 'mgr';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.billApproveBtn, { backgroundColor: isMgr ? '#059669' : '#4f46e5' }, disabled && !busy && styles.disabled, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={isMgr ? 'checkmark' : 'checkmark-done'} size={15} color="#fff" />}
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.billApproveBtnText}>อนุมัติ</Text>
        {pn ? <Text style={styles.billApproveBtnPn} numberOfLines={1}>{pn}</Text> : null}
      </View>
    </Pressable>
  );
}

const ItemCard = memo(function ItemCard({
  item,
  index,
  canEdit,
  canApproveMgr,
  canApproveExec,
  busy,
  h,
}: {
  item: CostItem;
  index: number;
  canEdit: boolean;
  canApproveMgr: boolean;
  canApproveExec: boolean;
  busy: BillBusy | null;
  h: ItemHandlers;
}) {
  const isExpense = item.is_expense_type === 1;
  const pay = item.pay;
  // บิลที่ใช้ทำปุ่มอนุมัติในช่องอนุมัติ — เฉพาะฝั่งที่ผู้ใช้มีสิทธิ์ (บิลไหนอนุมัติครบแล้ว เซิร์ฟเวอร์บอกตอนกด)
  const billNos = item.po_pills.map((p) => p.po_number);
  const mgrBills = canApproveMgr ? billNos : [];
  const execBills = canApproveExec ? billNos : [];
  const diffTone =
    item.diff_sign === 'plus' ? { bg: '#f0fdf4', text: '#16a34a' } : item.diff_sign === 'minus' ? { bg: '#fef2f2', text: '#dc2626' } : { bg: '#f8fafc', text: '#64748b' };
  return (
    <View style={[styles.itemCard, { borderLeftColor: isExpense ? '#f59e0b' : '#6366f1' }]}>
      {/* หัวการ์ด: ลำดับ + ชื่อรายการ + ประเภท ปร. */}
      <View style={styles.itemHead}>
        <View style={styles.itemNo}>
          <Text style={styles.itemNoText}>{index}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.itemName}>{item.item_name}</Text>
          {item.model_name ? <Text style={styles.itemModel}>รุ่น: {item.model_name}</Text> : null}
          <View style={styles.rowWrap}>
            <View style={styles.itemType}>
              <Ionicons name={isExpense ? 'receipt-outline' : 'cube-outline'} size={12} color="#64748b" />
              <Text style={styles.itemTypeText}>{isExpense ? 'ค่าใช้จ่าย' : 'สินค้า'}</Text>
            </View>
            {item.pr_label ? <Badge text={item.pr_label} tone={PR_TONE[item.pr_label] ?? NEUTRAL_TONE} /> : null}
          </View>
        </View>
      </View>

      <View style={styles.itemBody}>
        {item.expense_box ? (
          <View style={styles.expBox}>
            <View style={styles.expRow}>
              <Text style={styles.expBudget}>งบตั้งต้น: ฿{fmt(item.expense_box.budget)}</Text>
              <Text style={styles.expUsed}>ใช้ไปแล้ว: ฿{fmt(item.expense_box.used)}</Text>
            </View>
            <View style={styles.expTrack}>
              <View style={[styles.expFill, { width: `${Math.min(100, Math.max(0, item.expense_box.percent_bar))}%` }]} />
            </View>
            <Text style={[styles.expRemain, { color: item.expense_box.remain < 0 ? '#dc2626' : '#059669' }]}>
              คงเหลือสุทธิ: {item.expense_box.remain < 0 ? '-' : ''}฿{fmt(Math.abs(item.expense_box.remain))}
            </Text>
          </View>
        ) : null}

        {item.sub_breakdown_count > 0 || item.has_network_bom ? (
          <View style={styles.rowWrap}>
            {item.sub_breakdown_count > 0 ? (
              <Pressable onPress={() => h.openPopup(item, 'sub')} style={({ pressed }) => [styles.ghostChip, pressed && styles.pressed]}>
                <Ionicons name="git-branch-outline" size={12} color="#6366f1" />
                <Text style={styles.ghostChipText}>ดูส่วนประกอบย่อย</Text>
              </Pressable>
            ) : null}
            {item.has_network_bom ? (
              <Badge text="ซื้อในเครือ" icon="business" tone={{ bg: '#ecfdf5', border: '#a7f3d0', text: '#059669' }} onPress={() => h.openPopup(item, 'bom')} />
            ) : null}
          </View>
        ) : null}

        {/* เลขที่เอกสาร — บิลละกล่องเต็มความกว้าง แตะเปิดหน้าต่างจัดการเอกสาร */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            เลขที่เอกสาร
            {item.po_pills.length + item.refunded_po_numbers.length > 1 ? (
              <Text style={styles.sectionHint}> ({item.po_pills.length + item.refunded_po_numbers.length} บิล)</Text>
            ) : null}
          </Text>
          {item.po_pills.length === 0 && item.refunded_po_numbers.length === 0 ? (
            <Dash />
          ) : (
            <View style={{ gap: 6 }}>
              {item.po_pills.map((p) => (
                <PoBox key={p.po_number} pn={p.po_number} sub={p.progress_text} tone={PILL_TONE[p.state]} onPress={() => h.openPo(p.po_number)} />
              ))}
              {item.refunded_po_numbers.map((pn) => (
                <PoBox key={`rf-${pn}`} pn={pn} sub="คืนเงินแล้ว" tone={{ bg: '#f1f5f9', border: '#cbd5e1', text: '#94a3b8' }} refunded onPress={() => h.openRefund(pn)} />
              ))}
            </View>
          )}
        </View>

        {/* อนุมัติ */}
        <View style={[styles.apprRow, styles.sectionLine]}>
          <ApprovalBox
            title="ผู้จัดการอนุมัติ"
            role="mgr"
            cell={item.mgr_cell}
            bills={mgrBills}
            busy={busy}
            onCancel={() => h.cancelItem(item, 'mgr')}
            onApprove={(pn) => h.approveBill(item, pn, 'mgr')}
          />
          <View style={styles.apprDivider} />
          <ApprovalBox
            title="ผู้บริหารอนุมัติ"
            role="exec"
            cell={item.exec_cell}
            bills={execBills}
            busy={busy}
            onCancel={() => h.cancelItem(item, 'exec')}
            onApprove={(pn) => h.approveBill(item, pn, 'exec')}
          />
        </View>

        {/* จ่ายเงิน */}
        <View style={[styles.section, styles.sectionLine]}>
          <Text style={styles.sectionLabel}>จ่ายเงิน <Text style={styles.sectionHint}>(การเงิน + สลิป)</Text></Text>
          {pay.show === 'none' ? <Dash /> : null}
          {pay.show === 'stock' ? <Badge text="ใช้ในสต๊อก" icon="layers-outline" tone={NEUTRAL_TONE} /> : null}
          {pay.show === 'cards' && pay.collapsed && pay.summary ? (
            <Pressable onPress={() => h.openPayList(item)} style={({ pressed }) => [styles.payCard, { borderLeftColor: pay.summary!.colors.text }, pressed && styles.pressed]}>
              <View style={styles.payTop}>
                <Text style={styles.payPn}>
                  <Ionicons name="layers-outline" size={12} color="#334155" /> {pay.summary.bill_count} บิล
                </Text>
                <View style={[styles.payState, { backgroundColor: pay.summary.colors.bg, borderColor: pay.summary.colors.border }]}>
                  <Text style={[styles.payStateText, { color: pay.summary.colors.text }]}>{pay.summary.done_text}</Text>
                </View>
              </View>
              <View style={styles.payRow}>
                <Text style={styles.payLbl}>จ่ายแล้ว</Text>
                <Text style={[styles.payVal, { color: '#15803d' }]}>{fmt(pay.summary.sum_paid)}</Text>
              </View>
              <View style={styles.payRow}>
                <Text style={styles.payLbl}>ยอดบิลรวม</Text>
                <Text style={[styles.payVal, { color: '#475569' }]}>{fmt(pay.summary.sum_bill)}</Text>
              </View>
              {pay.summary.show_diff ? (
                <View style={[styles.payRow, styles.payDiffRow]}>
                  <Text style={[styles.payLbl, { color: pay.summary.sum_diff < 0 ? '#b91c1c' : '#b45309' }]}>{pay.summary.diff_label}</Text>
                  <Text style={[styles.payVal, { color: pay.summary.sum_diff < 0 ? '#b91c1c' : '#b45309' }]}>{fmt(Math.abs(pay.summary.sum_diff))}</Text>
                </View>
              ) : null}
              <Text style={styles.payTapHint}>แตะเพื่อดูรายบิล ›</Text>
            </Pressable>
          ) : null}
          {pay.show === 'cards' && !pay.collapsed
            ? pay.cards.map((c) => <PayCardView key={c.pn} c={c} onLink={() => h.openLink(c.pn)} onSites={() => h.openSites(c.pn)} />)
            : null}
          {pay.show === 'cards' && pay.stock_count > 0 ? <Badge text="ใช้ในสต๊อก" icon="layers-outline" tone={NEUTRAL_TONE} /> : null}
        </View>

        {/* ตารางตัวเลข — ป้ายซ้าย ค่าชิดขวา สีเฉพาะค่าที่ต้องเตือน (เกิน/เคลม/ราคาขึ้นลง/ส่วนต่าง) */}
        <View style={styles.numTable}>
          <NumHead text="จำนวน" first />
          {isExpense ? (
            <NumRow label="จำนวนเต็ม / ซื้อจริง">
              <Badge text="หมวดค่าใช้จ่าย" tone={{ bg: '#fffbeb', border: '#fcd34d', text: '#b45309' }} />
            </NumRow>
          ) : (
            <NumRow label="จำนวนเต็ม / ซื้อจริง">
              {item.qty_changed_by_sim ? (
                <>
                  <Text style={styles.strike}>{fmt(item.original_plan_qty)} / {fmt(item.original_actual_qty)}</Text>
                  <Text style={styles.simQty}>🚚 {fmt(item.plan_qty)} / {fmt(item.actual_qty)}</Text>
                </>
              ) : (
                <Text style={styles.numVal}>
                  <Text style={styles.numValSoft}>{fmt(item.plan_qty)}</Text> / {fmt(item.actual_qty)}
                </Text>
              )}
              {item.claim_qty > 0 ? <Text style={styles.claimTag}>เคลม: {fmt(item.claim_qty)}</Text> : null}
              {item.return_wh_qty > 0 ? <Text style={styles.returnTag}>ตีกลับ: {fmt(item.return_wh_qty)}</Text> : null}
            </NumRow>
          )}
          <NumRow label="หน่วย">
            <Text style={styles.numVal}>{item.unit || '-'}</Text>
          </NumRow>
          <NumRow label="ซื้อเกิน (ชิ้น)">
            {item.over_qty > 0 ? (
              <Badge text={`เกิน ${fmt(item.over_qty)}`} icon="cube" tone={{ bg: '#fee2e2', border: '#fecaca', text: '#dc2626' }} onPress={() => h.openPopup(item, 'over')} />
            ) : (
              <Dash />
            )}
          </NumRow>

          <NumHead text="ราคาต่อหน่วย" />
          <NumRow label="ราคากลาง">
            <Text style={styles.numVal}>{fmt(item.standard_price)}</Text>
          </NumRow>
          <NumRow label="ทุนเดิม">
            <Text style={styles.numVal}>{fmt(item.cost_price)}</Text>
          </NumRow>
          <NumRow label="ซื้อล่าสุด">
            {item.latest_buy_price > 0 ? (
              <Text style={[styles.numVal, item.latest_price_trend === 'up' ? { color: '#dc2626' } : item.latest_price_trend === 'down' ? { color: '#15803d' } : null]}>
                {item.latest_price_trend === 'up' ? '↑ ' : item.latest_price_trend === 'down' ? '↓ ' : ''}
                {fmt(item.latest_buy_price)}
              </Text>
            ) : (
              <Dash />
            )}
          </NumRow>
          <NumRow label="ส่วนต่างราคา">
            {item.price_flag.state === 'over' ? (
              <Badge text={item.price_flag.text} icon="search" tone={{ bg: '#ffedd5', border: '#fed7aa', text: '#c2410c' }} onPress={() => h.openPopup(item, 'over_price')} />
            ) : item.price_flag.state === 'cheaper' ? (
              <Badge text={item.price_flag.text} icon="arrow-down" tone={{ bg: '#dcfce7', border: '#86efac', text: '#15803d' }} />
            ) : item.price_flag.state === 'equal' ? (
              <Badge text={item.price_flag.text} tone={NEUTRAL_TONE} />
            ) : (
              <Dash />
            )}
          </NumRow>

          <NumHead text="มูลค่ารวม" />
          <NumRow label="ราคากลาง (รวม)">
            <Text style={styles.numVal}>{fmt(item.total_standard_budget)}</Text>
          </NumRow>
          <NumRow label="ทุนเดิม (รวม)">
            <Text style={styles.numVal}>{fmt(item.total_plan_budget)}</Text>
            {item.split_sub_plan_cost > 0 ? <Text style={styles.splitTag}>รวมย่อยแยกทุน +{fmt(item.split_sub_plan_cost)}</Text> : null}
          </NumRow>
          <NumRow label="ซื้อจริง (เฉพาะสินค้า)">
            {item.is_labor_merged ? (
              <Badge text="รวมค่าแรง" icon="hammer" tone={{ bg: '#d1fae5', border: '#6ee7b7', text: '#047857' }} />
            ) : item.is_expense_row ? (
              <Dash />
            ) : (
              <Text style={styles.numVal}>{fmt(item.total_product_only)}</Text>
            )}
          </NumRow>
          <NumRow label="ซื้อเคลม">
            {item.show_claim ? (
              <>
                <Text style={[styles.numVal, { color: '#dc2626' }]}>{fmt(item.claim_cost)}</Text>
                <Text style={styles.claimSub}>({fmt(item.claim_qty)} ชิ้น)</Text>
              </>
            ) : (
              <Dash />
            )}
          </NumRow>
          <NumRow label="ซื้อจริง (รวมค่าใช้จ่าย)">
            {item.actual_full_display === 'expense_used' ? (
              <>
                <Text style={styles.usedTag}>ใช้ไปแล้ว</Text>
                <Text style={styles.numVal}>{fmt(item.total_with_expenses)}</Text>
              </>
            ) : item.actual_full_display === 'with_hidden' ? (
              <>
                <Text style={styles.numVal}>{fmt(item.total_with_expenses)}</Text>
                <Text style={styles.hiddenTag}>(แฝง +{fmt(item.ext_cost)})</Text>
              </>
            ) : (
              <Dash />
            )}
          </NumRow>

          {/* ส่วนต่าง — แถวสรุปท้ายตาราง */}
          <View style={[styles.numDiff, { backgroundColor: diffTone.bg }]}>
            <Text style={styles.numDiffLabel}>ส่วนต่าง</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.diffVal, { color: diffTone.text }]}>
                {item.diff_sign === 'plus' ? '+ ' : item.diff_sign === 'minus' ? '- ' : ''}
                {fmt(Math.abs(item.diff_rounded))}
              </Text>
              <Text style={styles.diffPct}>ทุน {fmt(item.diff_percent)}%</Text>
            </View>
          </View>
        </View>

        {/* ผู้สั่งซื้อ + แก้ไขทุน */}
        <View style={styles.itemFoot}>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={styles.sectionLabel}>ผู้สั่งซื้อ</Text>
            {item.orderers.length === 0 ? (
              <Dash />
            ) : (
              <View style={styles.rowWrap}>
                {item.orderers.map((o) => (
                  <Pressable key={o} onPress={() => h.openOrderer(o)} style={({ pressed }) => [styles.ordererChip, pressed && styles.pressed]}>
                    <Ionicons name="person-circle" size={13} color="#4f46e5" />
                    <Text style={styles.ordererChipText}>{o}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          {canEdit ? (
            <Pressable onPress={() => h.editCost(item)} style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}>
              <Ionicons name="create-outline" size={13} color="#4f46e5" />
              <Text style={styles.editBtnText}>แก้ไขทุน(เดิม)</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
});

// ====================================================================
// หน้าเลือกหน้างาน (list_projects) — ใช้ทั้งเป็นหน้าเต็มตอนไม่มี id และเป็นป็อปอัปจากชิป "# หน้างาน"
// ====================================================================

type JumpRow = { id: number; code: string; cus: string; name: string; co: string; st: string; cls: string; icon: string; cancel: boolean; current: boolean };

function ProjectPicker({ userId, currentId, onPick }: { userId: number | string; currentId?: number; onPick: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [co, setCo] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [rows, setRows] = useState<JumpRow[]>([]);
  const [meta, setMeta] = useState<{ total: number; all: number; cancel: number; companies: { name: string; count: number }[] }>({ total: 0, all: 0, cancel: 0, companies: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiMobileGet(COST_API, 'list_projects', {
          user_id: userId, q, company: co, show_cancel: showCancel ? 1 : 0, current_project_id: currentId,
        });
        if (my !== seq.current) return;
        setRows(res.projects ?? []);
        setMeta({ total: num(res.total), all: num(res.all_count), cancel: num(res.cancel_count), companies: res.companies ?? [] });
      } catch (e) {
        if (my === seq.current) setError(errMsg(e, 'ดึงรายชื่อหน้างานไม่สำเร็จ'));
      } finally {
        if (my === seq.current) setLoading(false);
      }
    }, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [userId, q, co, showCancel, currentId]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={15} color="#94a3b8" />
        <TextInput value={q} onChangeText={setQ} placeholder="พิมพ์เลขหน้างาน, หน่วยงาน หรือชื่อโครงการ..." placeholderTextColor="#94a3b8" style={styles.searchInput} autoCorrect={false} />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#cbd5e1" />
          </Pressable>
        ) : null}
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipBar}>
          <Pressable onPress={() => setCo('')} style={[styles.filterChip, co === '' && styles.filterChipOn]}>
            <Text style={[styles.filterChipText, co === '' && styles.filterChipTextOn]}>ทั้งหมด {meta.all}</Text>
          </Pressable>
          {meta.companies.map((c) => (
            <Pressable key={c.name} onPress={() => setCo(c.name)} style={[styles.filterChip, co === c.name && styles.filterChipOn]}>
              <Text style={[styles.filterChipText, co === c.name && styles.filterChipTextOn]}>{c.name} {c.count}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {meta.cancel > 0 ? (
        <View style={styles.toggleRow}>
          <Switch value={showCancel} onValueChange={setShowCancel} />
          <Text style={styles.toggleText}>แสดงงานที่ยกเลิก ({meta.cancel})</Text>
        </View>
      ) : null}
      {error ? (
        <EmptyBox text={error} icon="cloud-offline-outline" />
      ) : loading && rows.length === 0 ? (
        <LoadingBox text="กำลังโหลดรายชื่อหน้างาน..." />
      ) : rows.length === 0 ? (
        <EmptyBox text={`ไม่พบหน้างานที่ตรงกับ "${q}"`} icon="search" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.id)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: r }) => {
            const t = statusTone(r.cls);
            return (
              <Pressable onPress={() => onPick(r.id)} style={({ pressed }) => [styles.pickRow, r.current && styles.pickRowCurrent, r.cancel && styles.pickRowCancel, pressed && styles.pressed]}>
                <View style={styles.pickCode}>
                  <Text style={styles.pickCodeText}>{r.code}</Text>
                  {r.current ? <Text style={styles.pickCurrent}>เปิดอยู่</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickCus} numberOfLines={1}>{r.cus || 'ไม่ระบุหน่วยงาน'}</Text>
                  <Text style={styles.pickName} numberOfLines={1}>
                    {r.co ? <Text style={styles.pickCo}>{r.co} </Text> : null}
                    {r.name}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border, maxWidth: 110 }]}>
                  <Text style={[styles.badgeText, { color: t.text }]} numberOfLines={1}>{r.st}</Text>
                </View>
              </Pressable>
            );
          }}
          ListFooterComponent={<Text style={styles.pickFoot}>แสดง {rows.length} จาก {meta.all} หน้างาน</Text>}
        />
      )}
    </View>
  );
}

// ====================================================================
// หน้าหลัก
// ====================================================================

export interface CostCheckScreenProps {
  id?: number | string;
  onBack?: () => void;
}

export default function CostCheckScreen({ id, onBack }: CostCheckScreenProps) {
  const { user } = useAuth();
  // โมดัลเลือกหน้างานแบบเต็มจอ — SafeAreaView ใน <Modal> บน Android (edge-to-edge) วัด inset ได้ 0
  // ปุ่มปิดจะไปซ้อนใต้แถบสถานะ จึงอ่านค่าจากหน้าหลักแล้ว pad เอง (แบบ document_dashboard)
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const uid = user?.id;
  const [projectId, setProjectId] = useState<number | undefined>(() => {
    const v = parseInt(String(id ?? params.id ?? ''), 10);
    return v > 0 ? v : undefined;
  });

  const [data, setData] = useState<CostDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [sim, setSim] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // ---- ป็อปอัป ----
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cutOutOpen, setCutOutOpen] = useState(false);
  const [orderer, setOrderer] = useState<{ name: string; tab: 'product' | 'expense' } | null>(null);
  const [history, setHistory] = useState<{ projectId: number; loading: boolean; byOrderer: any[] } | null>(null);
  const [itemPopup, setItemPopup] = useState<{ item: CostItem; mode: ItemPopupMode; loading: boolean; detail: any } | null>(null);
  const [payList, setPayList] = useState<CostItem | null>(null);
  const [sites, setSites] = useState<{ pn: string; back?: CostItem } | null>(null);
  const [link, setLink] = useState<{ pn: string; loading: boolean; res: any; picked: Set<number>; saving: boolean; back?: CostItem } | null>(null);
  const [poManage, setPoManage] = useState<{ pn: string; loading: boolean; data: any } | null>(null);
  const poDirty = useRef(false);
  const [billBusy, setBillBusy] = useState<BillBusy | null>(null);
  const [cancelAppr, setCancelAppr] = useState<{ opt: CancelOpt; note: string; saving: boolean } | null>(null);
  const [cancelHist, setCancelHist] = useState<{ pn: string; loading: boolean; data: any[]; empty: string } | null>(null);
  const [refundHist, setRefundHist] = useState<{ pn: string; loading: boolean; data: any[]; total: number } | null>(null);
  const [costHist, setCostHist] = useState<{ loading: boolean; data: any[] } | null>(null);
  const [editCost, setEditCost] = useState<{ item: CostItem; unit: string; total: string; note: string; saving: boolean; error: string } | null>(null);
  const [cancelProject, setCancelProject] = useState<{ reason: string; saving: boolean; error: string } | null>(null);
  const [globalPo, setGlobalPo] = useState<{
    company: string; q: string; page: number; loading: boolean; list: any[]; total: number; allTotal: number; companies: any[];
    sel: any | null; detailLoading: boolean; detail: any | null; checked: Record<number, boolean>; saving: boolean;
  } | null>(null);

  const showToast = useCallback((m: string) => setToast(m), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------------- โหลดหน้า (คิดทั้งโครงการทุกครั้ง → ขอครั้งเดียวทั้งหมด limit=2000) ----------------
  const reqSeq = useRef(0);
  const load = useCallback(async (mode: 'full' | 'refresh' | 'silent' = 'full') => {
    if (!projectId || !uid) return;
    const my = ++reqSeq.current;
    if (mode === 'full') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError('');
    try {
      const res = await apiMobileGet(COST_API, 'get_cost_detail', { user_id: uid, project_id: projectId, sim_delivery: sim ? 1 : undefined, limit: 2000 });
      if (my !== reqSeq.current) return;
      setData(res as unknown as CostDetail);
    } catch (e) {
      if (my === reqSeq.current) setError(errMsg(e, 'โหลดข้อมูลไม่สำเร็จ'));
    } finally {
      if (my === reqSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [projectId, uid, sim]);

  useEffect(() => {
    void load('full');
  }, [load]);

  // เปลี่ยนหน้างาน → ล้างข้อมูลเก่าที่ผูกกับหน้างานเดิม
  useEffect(() => {
    setData(null);
    setSearch('');
    setHistory(null);
  }, [projectId]);

  const perms: Perms | null = data;

  // ---------------- รายการ + หัวหมวด (ค้นหาในเครื่องแบบช่องค้นหาของเว็บ filterTable) ----------------
  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const term = search.trim().toLowerCase();
    type GroupRow = { type: 'group'; key: string; label: string; count: number };
    const out: (GroupRow | { type: 'item'; item: CostItem; index: number })[] = [];
    let lastGroup: string | null = null;
    let groupRow: GroupRow | null = null;
    items.forEach((it, i) => {
      if (term) {
        const hay = [it.item_name, it.model_name, it.custom_name_raw, it.custom_subname, it.custom_subname2, it.unit, it.pr_label, it.supplier_name, ...it.orderers, ...it.po_numbers, ...it.refunded_po_numbers]
          .join(' ').toLowerCase();
        if (!hay.includes(term)) return;
      }
      if (it.group_key !== lastGroup) {
        lastGroup = it.group_key;
        groupRow = it.group_label ? { type: 'group', key: `g-${i}`, label: it.group_label, count: 0 } : null;
        if (groupRow) out.push(groupRow);
      }
      if (groupRow) groupRow.count += 1; // นับเฉพาะรายการที่ผ่านช่องค้นหา
      out.push({ type: 'item', item: it, index: it.row_no || i + 1 });
    });
    return out;
  }, [data?.items, search]);

  // ---------------- ป็อปอัปของรายการ ----------------
  const openPopup = useCallback(async (item: CostItem, mode: ItemPopupMode) => {
    if (!uid || !projectId) return;
    setItemPopup({ item, mode, loading: true, detail: null });
    try {
      const res = await apiMobileGet(COST_API, 'get_item_detail', { user_id: uid, project_id: projectId, item_id: item.id, sim_delivery: sim ? 1 : undefined });
      setItemPopup((s) => (s && s.item.id === item.id ? { ...s, loading: false, detail: res } : s));
    } catch (e) {
      setItemPopup(null);
      showToast(errMsg(e, 'โหลดรายละเอียดไม่สำเร็จ'));
    }
  }, [uid, projectId, sim, showToast]);

  const openOrderer = useCallback(async (name: string) => {
    if (!uid || !projectId) return;
    setOrderer({ name, tab: 'product' });
    if (history && history.projectId === projectId && !history.loading) return;
    setHistory({ projectId, loading: true, byOrderer: [] });
    try {
      const res = await apiMobileGet(COST_API, 'get_purchase_history', { user_id: uid, project_id: projectId, limit: 1 });
      setHistory({ projectId, loading: false, byOrderer: res.by_orderer ?? [] });
    } catch (e) {
      setHistory(null);
      setOrderer(null);
      showToast(errMsg(e, 'โหลดประวัติผู้สั่งซื้อไม่สำเร็จ'));
    }
  }, [uid, projectId, history, showToast]);

  // ---------------- จัดการเอกสาร (get_po_manage) ----------------
  const openPo = useCallback(async (pn: string) => {
    if (!uid || !projectId) return;
    setPoManage({ pn, loading: true, data: null });
    try {
      const res = await apiMobileGet(COST_API, 'get_po_manage', { user_id: uid, project_id: projectId, po_number: pn });
      setPoManage({ pn, loading: false, data: res });
    } catch (e) {
      setPoManage(null);
      showToast(errMsg(e, 'ไม่พบรายการสำหรับเอกสารนี้'));
    }
  }, [uid, projectId, showToast]);

  function closePoManage() {
    setPoManage(null);
    // อนุมัติรายงวดระหว่างเปิดหน้าต่าง → โหลดหน้าหลักใหม่ตอนปิด (แบบ didClose ของเว็บ)
    if (poDirty.current) {
      poDirty.current = false;
      void load('silent');
    }
  }

  function approveInstallment(inst: any, role: 'mgr' | 'exec', pn: string) {
    const roleLabel = role === 'mgr' ? 'ผู้จัดการ' : 'ผู้บริหาร';
    Alert.alert(
      `ยืนยันการอนุมัติ (${roleLabel})`,
      `อนุมัติเฉพาะ งวด ${inst.seq} ยอด ฿${fmt(inst.amount)}\nเลขที่เอกสาร: ${pn}\n\nงวดอื่นในบิลนี้จะยังค้างอนุมัติไว้เหมือนเดิม`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ใช่, อนุมัติงวดนี้',
          onPress: async () => {
            try {
              await apiMobilePost(COST_API, 'approve_installment', { user_id: uid, inst_id: inst.id, role });
              poDirty.current = true;
              showToast(`อนุมัติงวด ${inst.seq} ในนาม ${roleLabel} เรียบร้อย!`);
            } catch (e) {
              showToast(errMsg(e, 'บันทึกไม่สำเร็จ'));
            }
            void openPo(pn);
          },
        },
      ],
    );
  }

  function approvePoSide(pn: string, role: 'mgr' | 'exec', ids: number[], poTotal?: number) {
    const roleLabel = role === 'mgr' ? 'ผู้จัดการ' : 'ผู้บริหาร';
    if (ids.length === 0) {
      showToast(`รายการทั้งหมดในบิลนี้ ถูกอนุมัติในนาม ${roleLabel} ไปหมดแล้ว`);
      return;
    }
    const totalLine = poTotal !== undefined ? `\nยอดรวมทั้งหมดใน PO นี้: ฿${fmt(poTotal)}` : '';
    Alert.alert(`ยืนยันการอนุมัติ (${roleLabel})`, `คุณต้องการอนุมัติรายการสั่งซื้อในบิลนี้จำนวน ${ids.length} รายการ\nเลขที่เอกสาร: ${pn}${totalLine}\n\nใช่หรือไม่?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ใช่, ยืนยันอนุมัติ',
        onPress: async () => {
          try {
            await apiMobilePost(COST_API, role === 'mgr' ? 'approve_cost' : 'exec_approve_cost', { user_id: uid, po_number: pn, item_ids: JSON.stringify(ids) });
            showToast(`อนุมัติในนาม ${roleLabel} เรียบร้อย!`);
            setPoManage(null);
            poDirty.current = false;
            void load('silent');
          } catch (e) {
            showToast(errMsg(e, 'อนุมัติไม่สำเร็จ'));
          }
        },
      },
    ]);
  }

  // ปุ่ม "อนุมัติตามบิล" ในการ์ด — เช็กบิลด้วย get_po_manage ตัวเดียวกับหน้าต่างจัดการเอกสารก่อน
  // (payload รายการไม่บอกว่าบิลไหนอนุมัติไปแล้ว) แล้วยืนยันเหมือนปุ่ม "อนุมัติ (เฉพาะบิลนี้)"
  async function approveBill(item: CostItem, pn: string, role: 'mgr' | 'exec') {
    if (!uid || !projectId || billBusy) return;
    const roleLabel = role === 'mgr' ? 'ผู้จัดการ' : 'ผู้บริหาร';
    setBillBusy({ itemId: item.id, pn, role });
    try {
      const res = await apiMobileGet(COST_API, 'get_po_manage', { user_id: uid, project_id: projectId, po_number: pn });
      const side = res?.[role];
      if (!side) {
        showToast('ไม่พบข้อมูลการอนุมัติของบิลนี้');
      } else if (side.approved_all) {
        showToast(`บิล ${pn} อนุมัติในนาม ${roleLabel} ครบแล้ว`);
        void load('silent');
      } else if (!side.can_approve) {
        showToast(`🔒 ไม่มีสิทธิ์อนุมัติระดับ ${roleLabel} สำหรับบิล ${pn}`);
      } else {
        approvePoSide(pn, role, side.pending_item_ids ?? [], num(res.po_grand_total));
      }
    } catch (e) {
      showToast(errMsg(e, 'ไม่พบรายการสำหรับเอกสารนี้'));
    } finally {
      setBillBusy(null);
    }
  }

  // ---------------- ยกเลิกอนุมัติ ----------------
  function openCancel(opt: CancelOpt) {
    setPoManage(null); // ปิดหน้าต่างจัดการเอกสารก่อน แล้วพากลับมาเมื่อปิด/พลาด
    setCancelAppr({ opt, note: '', saving: false });
  }
  function closeCancel(reopen: boolean) {
    const pn = cancelAppr?.opt.poNumber;
    const fromPo = cancelAppr?.opt.scope !== 'item' && pn;
    setCancelAppr(null);
    if (reopen && fromPo) void openPo(pn!);
  }
  async function submitCancel() {
    if (!cancelAppr || !uid) return;
    const note = cancelAppr.note.trim();
    if (!note) {
      showToast('กรุณากรอกหมายเหตุการยกเลิกก่อน');
      return;
    }
    const { opt } = cancelAppr;
    setCancelAppr({ ...cancelAppr, saving: true });
    try {
      const res = await apiMobilePost(COST_API, 'cancel_approval', {
        user_id: uid,
        scope: opt.scope,
        role: opt.role,
        note,
        project_id: projectId,
        po_number: opt.poNumber,
        inst_id: opt.scope === 'installment' ? opt.instId : undefined,
        item_ids: opt.itemIds && opt.itemIds.length ? JSON.stringify(opt.itemIds) : undefined,
      });
      setCancelAppr(null);
      showToast(`ยกเลิกอนุมัติ (${opt.role === 'mgr' ? 'ผู้จัดการ' : 'ผู้บริหาร'}) เรียบร้อย · ถอน ${res.count} หน่วย`);
      void load('silent');
    } catch (e) {
      showToast(errMsg(e, 'ยกเลิกไม่สำเร็จ'));
      closeCancel(true);
    }
  }

  // ---------------- ประวัติต่าง ๆ ----------------
  async function openCancelHistory(pn: string) {
    if (!uid || !projectId) return;
    setPoManage(null);
    setCancelHist({ pn, loading: true, data: [], empty: '' });
    try {
      const res = await apiMobileGet(COST_API, 'get_cancel_history', { user_id: uid, project_id: projectId, po_number: pn || undefined });
      setCancelHist({ pn, loading: false, data: res.data ?? [], empty: res.empty_text ?? '' });
    } catch (e) {
      setCancelHist(null);
      showToast(errMsg(e, 'ดึงประวัติไม่สำเร็จ'));
    }
  }
  function closeCancelHistory() {
    const pn = cancelHist?.pn;
    setCancelHist(null);
    if (pn) void openPo(pn); // เปิดจากหน้าต่างจัดการเอกสาร → กลับหน้าต่างเดิม
  }

  const openRefund = useCallback(async (pn: string) => {
    if (!uid || !projectId) return;
    setRefundHist({ pn, loading: true, data: [], total: 0 });
    try {
      const res = await apiMobileGet(COST_API, 'get_refund_history', { user_id: uid, project_id: projectId, po_number: pn || undefined });
      setRefundHist({ pn, loading: false, data: res.data ?? [], total: num(res.bill_total) });
    } catch (e) {
      setRefundHist(null);
      showToast(errMsg(e, 'ดึงประวัติคืนเงินไม่สำเร็จ'));
    }
  }, [uid, projectId, showToast]);

  async function openCostHistory() {
    if (!uid || !projectId) return;
    setCostHist({ loading: true, data: [] });
    try {
      const res = await apiMobileGet(COST_API, 'get_cost_history', { user_id: uid, project_id: projectId, limit: 2000 });
      setCostHist({ loading: false, data: res.data ?? [] });
    } catch (e) {
      setCostHist(null);
      showToast(errMsg(e, 'ดึงประวัติไม่สำเร็จ'));
    }
  }

  // ---------------- ผูกใบในสมุด ----------------
  const openLink = useCallback(async (pn: string, back?: CostItem) => {
    if (!uid || !projectId) return;
    setPayList(null);
    setLink({ pn, loading: true, res: null, picked: new Set(), saving: false, back });
    try {
      const res = await apiMobileGet(COST_API, 'find_link_docs', { user_id: uid, project_id: projectId, po_number: pn });
      const picked = new Set<number>((res.docs ?? []).filter((d: any) => d.linked_here).map((d: any) => d.id));
      setLink({ pn, loading: false, res, picked, saving: false, back });
    } catch (e) {
      setLink(null);
      showToast(errMsg(e, 'ค้นใบไม่สำเร็จ'));
    }
  }, [uid, projectId, showToast]);
  function closeLink() {
    const back = link?.back;
    setLink(null);
    if (back) setPayList(back);
  }
  async function saveLink() {
    if (!link || !uid) return;
    setLink({ ...link, saving: true });
    try {
      const res = await apiMobilePost(COST_API, 'save_link_docs', { user_id: uid, project_id: projectId, po_number: link.pn, doc_ids: Array.from(link.picked).join(',') });
      setLink(null);
      showToast(`ผูกใบกับบิล ${link.pn} จำนวน ${res.linked} ใบ`);
      void load('silent');
    } catch (e) {
      setLink((s) => (s ? { ...s, saving: false } : s));
      showToast(errMsg(e, 'บันทึกไม่สำเร็จ'));
    }
  }

  const openSites = useCallback((pn: string, back?: CostItem) => {
    setPayList(null);
    setSites({ pn, back });
  }, []);
  function closeSites() {
    const back = sites?.back;
    setSites(null);
    if (back) setPayList(back);
  }

  // ---------------- แก้ทุนเดิม ----------------
  const openEditCost = useCallback((item: CostItem) => {
    const qty = item.edit_cost.qty || 1;
    const unit = item.edit_cost.current_unit_cost;
    setEditCost({ item, unit: String(unit), total: (unit * qty).toFixed(2), note: '', saving: false, error: '' });
  }, []);
  async function saveEditCost() {
    if (!editCost || !uid) return;
    if (!editCost.note.trim()) {
      setEditCost({ ...editCost, error: 'กรุณาระบุหมายเหตุ / เหตุผลที่แก้ไข' });
      return;
    }
    setEditCost({ ...editCost, saving: true, error: '' });
    try {
      const res = await apiMobilePost(COST_API, 'update_cost_price', {
        user_id: uid, item_id: editCost.item.id, new_unit_price: editCost.unit || '0', qty: editCost.item.edit_cost.qty || 1, note: editCost.note.trim(),
      });
      setEditCost(null);
      showToast(num(res.changed) === 0 ? 'ไม่มีการเปลี่ยนแปลง' : 'บันทึกสำเร็จ! อัปเดตราคาทุนใหม่เรียบร้อย');
      void load('silent');
    } catch (e) {
      setEditCost((s) => (s ? { ...s, saving: false, error: errMsg(e, 'บันทึกไม่สำเร็จ') } : s));
    }
  }

  // ---------------- ปิดจบ / ยกเลิกปิดจบ / ยกเลิกโครงการ (project_API_mobile.php ตัวเดียวกับแดชบอร์ดโครงการ) ----------------
  function confirmClose() {
    const p = data?.project;
    if (!p) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear() + 543} เวลา ${pad(now.getHours())}:${pad(now.getMinutes())} น.`;
    Alert.alert(`ยืนยันปิดจบหน้างาน (${p.display_code})`, `คุณกำลังจะเปลี่ยนสถานะโครงการ\n${p.project_name}\nให้เป็น "ปิดจบหน้างาน" ใช่หรือไม่?\n\nเวลาที่จะถูกบันทึก: ${timeStr}`, [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ใช่, ปิดจบเลย!', onPress: () => void projectAction('force_complete_project', {}, 'ปิดจบหน้างานเรียบร้อย!') },
    ]);
  }
  function confirmUndoClose() {
    const p = data?.project;
    if (!p) return;
    Alert.alert(`ยืนยันยกเลิกปิดจบหน้างาน (${p.display_code})`, `คุณกำลังจะยกเลิกการปิดจบหน้างานของโครงการ\n${p.project_name}\nและกลับไปคำนวณสถานะตามเงื่อนไขจริง ใช่หรือไม่?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ใช่, ยกเลิกปิดจบ', onPress: () => void projectAction('undo_complete_project', {}, 'ยกเลิกปิดจบหน้างานสำเร็จ!') },
    ]);
  }
  async function projectAction(action: string, extra: Record<string, string>, okText: string): Promise<boolean> {
    if (!uid || !projectId) return false;
    try {
      await apiMobilePost(PROJECT_API, action, { user_id: uid, project_id: projectId, ...extra });
      showToast(okText);
      void load('silent');
      return true;
    } catch (e) {
      showToast(errMsg(e, 'บันทึกไม่สำเร็จ'));
      return false;
    }
  }
  async function submitCancelProject() {
    if (!cancelProject) return;
    const reason = cancelProject.reason.trim();
    if (!reason) {
      setCancelProject({ ...cancelProject, error: 'กรุณาระบุหมายเหตุ/เหตุผลในการยกเลิก' });
      return;
    }
    setCancelProject({ ...cancelProject, saving: true, error: '' });
    const ok = await projectAction('cancel_project', { cancel_reason: reason }, 'ยกเลิกโครงการเรียบร้อย!');
    if (ok) setCancelProject(null);
    else setCancelProject((s) => (s ? { ...s, saving: false } : s));
  }

  // ---------------- อนุมัติเอกสารข้ามหน้างาน ----------------
  const gpSeq = useRef(0);
  const loadPending = useCallback(async (company: string, q: string, page: number) => {
    if (!uid) return;
    const my = ++gpSeq.current;
    setGlobalPo((s) => (s ? { ...s, loading: true } : s));
    try {
      const res = await apiMobileGet(COST_API, 'get_pending_pos', {
        user_id: uid, company_id: company === '' ? undefined : company, q: q || undefined, limit: PENDING_PAGE_SIZE, offset: (page - 1) * PENDING_PAGE_SIZE,
      });
      if (my !== gpSeq.current) return;
      setGlobalPo((s) => (s ? { ...s, loading: false, list: res.data ?? [], total: num(res.total), allTotal: num(res.all_total), companies: res.companies ?? [], page } : s));
    } catch (e) {
      if (my === gpSeq.current) {
        setGlobalPo((s) => (s ? { ...s, loading: false } : s));
        showToast(errMsg(e, 'ไม่สามารถดึงข้อมูลได้'));
      }
    }
  }, [uid, showToast]);

  function openGlobalPo() {
    setGlobalPo({ company: '', q: '', page: 1, loading: true, list: [], total: 0, allTotal: 0, companies: [], sel: null, detailLoading: false, detail: null, checked: {}, saving: false });
  }
  // โหลดรายการเอกสาร ตอนเปิด/พิมพ์ค้นหา/เปลี่ยนบริษัท (หน่วง 0.35 วิ ตอนพิมพ์)
  const gpOpen = !!globalPo;
  const gpQ = globalPo?.q ?? '';
  const gpCompany = globalPo?.company ?? '';
  useEffect(() => {
    if (!gpOpen) return;
    const t = setTimeout(() => void loadPending(gpCompany, gpQ, 1), gpQ ? 350 : 0);
    return () => clearTimeout(t);
  }, [gpOpen, gpQ, gpCompany, loadPending]);

  async function openGlobalDetail(row: any) {
    if (!uid) return;
    setGlobalPo((s) => (s ? { ...s, sel: row, detailLoading: true, detail: null } : s));
    try {
      const res = await apiMobileGet(COST_API, 'get_po_details', { user_id: uid, po_number: row.po_number, company_id: row.company_id, limit: 2000 });
      const checked: Record<number, boolean> = {};
      (res.projects ?? []).forEach((pp: any) => { checked[pp.project_id] = !!pp.selectable; });
      setGlobalPo((s) => (s ? { ...s, detailLoading: false, detail: res, checked } : s));
    } catch (e) {
      setGlobalPo((s) => (s ? { ...s, detailLoading: false } : s));
      showToast(errMsg(e, 'ดึงข้อมูล PO ไม่สำเร็จ'));
    }
  }

  function submitGlobal(role: 'mgr' | 'exec') {
    if (!globalPo?.detail || !globalPo.sel) return;
    const ids: number[] = [];
    (globalPo.detail.projects ?? []).forEach((pp: any) => {
      if (globalPo.checked[pp.project_id]) ids.push(...(role === 'mgr' ? pp.mgr_ids : pp.exec_ids));
    });
    if (ids.length === 0) {
      showToast('กรุณาเลือกหน้างานที่ต้องการอนุมัติ');
      return;
    }
    const roleName = role === 'mgr' ? 'ผู้จัดการ' : 'ผู้บริหาร';
    const sel = globalPo.sel;
    Alert.alert(`ยืนยันการอนุมัติ (${roleName})`, `คุณกำลังจะอนุมัติต้นทุนจำนวน ${ids.length} รายการ\nภายใต้เลขที่เอกสาร: ${sel.po_number}\n\n⚠️ ตรวจสอบความถูกต้องก่อนกดยืนยัน`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: `ยืนยันอนุมัติ (${roleName})`,
        onPress: async () => {
          setGlobalPo((s) => (s ? { ...s, saving: true } : s));
          try {
            await apiMobilePost(COST_API, role === 'mgr' ? 'approve_cost' : 'exec_approve_cost', { user_id: uid, po_number: sel.po_number, item_ids: JSON.stringify(ids) });
            showToast(`อนุมัติในนาม ${roleName} สำเร็จ!`);
            setGlobalPo((s) => (s ? { ...s, saving: false } : s));
            void openGlobalDetail(sel);
            void load('silent');
          } catch (e) {
            setGlobalPo((s) => (s ? { ...s, saving: false } : s));
            showToast(errMsg(e, 'อนุมัติไม่สำเร็จ'));
          }
        },
      },
    ]);
  }

  // ---------------- handler ของการ์ดรายการ (อ้างอิงคงที่ ให้ memo ทำงาน) ----------------
  const hRef = useRef<ItemHandlers | null>(null);
  hRef.current = {
    openPo: (pn) => void openPo(pn),
    openRefund: (pn) => void openRefund(pn),
    openPopup: (item, mode) => void openPopup(item, mode),
    openPayList: (item) => setPayList(item),
    openLink: (pn) => void openLink(pn),
    openSites: (pn) => openSites(pn),
    openOrderer: (name) => void openOrderer(name),
    cancelItem: (item, role) => openCancel({ scope: 'item', role, itemIds: [item.id], itemName: item.item_name }),
    editCost: (item) => openEditCost(item),
    approveBill: (item, pn, role) => void approveBill(item, pn, role),
  };
  const handlers = useMemo<ItemHandlers>(() => ({
    openPo: (pn) => hRef.current?.openPo(pn),
    openRefund: (pn) => hRef.current?.openRefund(pn),
    openPopup: (i, m) => hRef.current?.openPopup(i, m),
    openPayList: (i) => hRef.current?.openPayList(i),
    openLink: (pn) => hRef.current?.openLink(pn),
    openSites: (pn) => hRef.current?.openSites(pn),
    openOrderer: (n) => hRef.current?.openOrderer(n),
    cancelItem: (i, r) => hRef.current?.cancelItem(i, r),
    editCost: (i) => hRef.current?.editCost(i),
    approveBill: (i, pn, r) => hRef.current?.approveBill(i, pn, r),
  }), []);

  const goBack = onBack ?? (() => setProjectId(undefined));

  // ====================================================================
  // ไม่มีหน้างาน → หน้าเลือกหน้างาน
  // ====================================================================
  if (!uid) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyBox text="กรุณาเข้าสู่ระบบ" />
      </SafeAreaView>
    );
  }
  if (!projectId) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.pickHeader}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={16} color="#475569" />
              <Text style={styles.backText}>กลับ</Text>
            </Pressable>
          ) : null}
          <Text style={styles.pickTitle}>วิเคราะห์ต้นทุน · เลือกหน้างาน</Text>
        </View>
        <ProjectPicker userId={uid} onPick={(pid) => setProjectId(pid)} />
      </SafeAreaView>
    );
  }

  // ====================================================================
  // ส่วนหัวรายการ (FlatList header)
  // ====================================================================
  const p = data?.project;
  const s = data?.summary;
  const st = p?.status_info;
  const tone = st?.state === 'canceled' ? { bg: '#fef2f2', border: '#fecaca' } : st?.state === 'closed' ? { bg: '#f0fdf4', border: '#bbf7d0' } : { bg: '#ffffff', border: '#c7d2fe' };
  const siteInfo = sites ? data?.po_site_map[sites.pn] : undefined;

  const header = (
    <View>
      {/* หัวหน้า */}
      <View style={[styles.pageHeader, { backgroundColor: tone.bg, borderColor: tone.border }]}>
        <View style={styles.phTop}>
          <Pressable onPress={goBack} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={15} color="#475569" />
            <Text style={styles.backText}>{onBack ? 'กลับ' : 'เลือกหน้างาน'}</Text>
          </Pressable>
          {p ? (
            <View style={styles.coBox}>
              {p.company.logo ? (
                <Image source={{ uri: `${API_BASE}/${p.company.logo}` }} style={styles.coLogo} resizeMode="contain" />
              ) : (
                <View style={[styles.coLogo, styles.coLogoPh]}>
                  <Ionicons name="briefcase" size={13} color="#94a3b8" />
                </View>
              )}
              <View style={{ flexShrink: 1 }}>
                {p.company.short || p.company.name ? (
                  <>
                    {p.company.short ? <Text style={styles.coShort}>{p.company.short}</Text> : null}
                    {p.company.name ? <Text style={styles.coName} numberOfLines={1}>{p.company.name}</Text> : null}
                  </>
                ) : (
                  <Text style={styles.coName}>ไม่ระบุบริษัท</Text>
                )}
              </View>
            </View>
          ) : null}
        </View>

        {p ? (
          <>
            <Text style={styles.phTitle}>{p.customer_name || 'ไม่ระบุชื่อลูกค้า'}</Text>
            <Pressable onPress={() => setPickerOpen(true)} style={({ pressed }) => [styles.codeChip, pressed && styles.pressed]}>
              <Text style={styles.codeChipText}># หน้างาน <Text style={{ fontWeight: '900' }}>{p.display_code}</Text></Text>
              <Ionicons name="chevron-down" size={13} color="#4f46e5" />
            </Pressable>
            <View style={styles.phLine}>
              <Ionicons name="folder-open-outline" size={13} color="#6366f1" />
              <Text style={styles.phLineText}><Text style={styles.phLabel}>โครงการ </Text>{p.project_name}</Text>
            </View>
            <View style={styles.phLine}>
              <Ionicons name="location-outline" size={13} color="#94a3b8" />
              <Text style={[styles.phLineText, { color: '#64748b' }]}>{p.customer_address || 'ไม่ระบุที่อยู่'}</Text>
            </View>
          </>
        ) : null}

        <View style={[styles.simRow, sim && styles.simRowOn]}>
          <Switch value={sim} onValueChange={setSim} trackColor={{ false: '#e2e8f0', true: '#fcd34d' }} thumbColor={sim ? '#f59e0b' : '#f8fafc'} />
          <View style={{ flex: 1 }}>
            <Text style={styles.simTitle}>✨ วิเคราะห์ต้นทุนตามจัดส่งจริง</Text>
            <Text style={styles.simSub}>{sim ? 'เปิดอยู่ · แตะสวิตช์เพื่อกลับสู่ค่าเดิม' : 'ตัดของที่ยังไม่ส่งถึงหน้างานออกชั่วคราว'}</Text>
          </View>
        </View>

        {st ? (
          <View style={styles.statusArea}>
            {st.state === 'canceled' ? (
              <View style={[styles.stamp, styles.stampCancel]}>
                <Ionicons name="ban" size={18} color="#dc2626" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stampTitle, { color: '#b91c1c' }]}>ยกเลิกโครงการแล้ว</Text>
                  <Text style={styles.stampMeta} numberOfLines={2}>
                    {st.canceled_by}
                    {st.cancel_reason ? ` | ${st.cancel_reason.length > 48 ? `${st.cancel_reason.slice(0, 47)}…` : st.cancel_reason}` : ''}
                  </Text>
                </View>
              </View>
            ) : st.state === 'closed' ? (
              <>
                <View style={styles.stamp}>
                  <Ionicons name="flag" size={18} color="#16a34a" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stampTitle}>ปิดจบหน้างานแล้ว</Text>
                    <Text style={styles.stampMeta}>{st.closed_by}{st.closed_at_display ? ` | ${st.closed_at_display}` : ''}</Text>
                  </View>
                </View>
                {st.can_undo_close ? (
                  <Pressable onPress={confirmUndoClose} style={({ pressed }) => [styles.pjBtn, styles.pjBtnUndo, pressed && styles.pressed]}>
                    <Ionicons name="arrow-undo" size={13} color="#fff" />
                    <Text style={styles.pjBtnText}>ยกเลิกปิดจบ</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <Badge text={st.label} tone={statusTone(st.badge_class)} />
                <View style={styles.rowWrap}>
                  {st.can_close ? (
                    <Pressable onPress={confirmClose} style={({ pressed }) => [styles.pjBtn, styles.pjBtnClose, pressed && styles.pressed]}>
                      <Ionicons name="flag" size={13} color="#fff" />
                      <Text style={styles.pjBtnText}>ปิดจบหน้างาน</Text>
                    </Pressable>
                  ) : null}
                  {st.can_cancel ? (
                    <Pressable onPress={() => setCancelProject({ reason: '', saving: false, error: '' })} style={({ pressed }) => [styles.pjBtn, styles.pjBtnCancel, pressed && styles.pressed]}>
                      <Ionicons name="ban" size={13} color="#fff" />
                      <Text style={styles.pjBtnText}>ยกเลิกโครงการ</Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            )}
          </View>
        ) : null}
      </View>

      {data?.sim_delivery ? (
        <View style={styles.simBanner}>
          <Ionicons name="analytics" size={20} color="#f59e0b" />
          <View style={{ flex: 1 }}>
            <Text style={styles.simBannerTitle}>โหมดจำลองสถานการณ์ต้นทุน (What-If Analysis)</Text>
            <Text style={styles.simBannerText}>
              ระบบทำการ <Text style={{ color: '#dc2626', fontWeight: '800' }}>ตัดมูลค่าสินค้าส่วนที่ยังไม่ได้จัดส่งหน้างานทิ้งชั่วคราว</Text> เพื่อคำนวณต้นทุน/กำไร ตามจริง ณ ปัจจุบัน
            </Text>
            <Pressable
              onPress={() => ((data?.cut_out.items.length ?? 0) === 0 ? showToast('ไม่มีรายการสินค้าที่ถูกตัดออก (ส่งครบ 100% แล้ว)') : setCutOutOpen(true))}
              style={({ pressed }) => [styles.simBannerBtn, pressed && styles.pressed]}
            >
              <Ionicons name="search" size={12} color="#d97706" />
              <Text style={styles.simBannerBtnText}>ดูรายการที่ถูกหักออก</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {error ? (
        <Pressable onPress={() => void load('full')} style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={16} color="#b91c1c" />
          <Text style={styles.errorText}>{error} · แตะเพื่อลองใหม่</Text>
        </Pressable>
      ) : null}

      {/* การ์ดสรุป */}
      {s && p ? (
        <View style={styles.sumGrid}>
          <SumCard icon="document-text" label="ยอดงบโครงการ" value={`฿${fmt(s.project_budget)}`} />
          {s.has_factor_f ? <SumCard icon="calculator" label="ค่าใช้จ่าย Factor F" value={fmt(s.factor_f, 4)} /> : null}
          <SumCard icon="clipboard" label="ราคากลาง(รวม)" value={`฿${fmt(s.grand_total_standard)}`} />
          <SumCard icon="locate" label="รวมทุนเดิม" value={`฿${fmt(s.net_grand_total_plan)}`}>
            {s.total_discount_value > 0 ? (
              <>
                <SumSub label="จากทุนเดิม" value={`฿${fmt(s.grand_total_plan)}`} />
                <SumSub label="ลดโครงการไป" value={`-฿${fmt(s.total_discount_value)}`} color="#dc2626" />
              </>
            ) : null}
          </SumCard>
          <SumCard icon="cart" label="ซื้อจริง (ทุนใหม่รวม)" value={`฿${fmt(s.grand_total_actual_full)}`}>
            <SumSub label="เฉพาะสินค้า" value={`฿${fmt(s.grand_total_actual_product)}`} />
            <SumSub label="คิดเป็นของงบโครงการ" value={s.actual_budget_pct === null ? '- %' : `${fmt(s.actual_budget_pct)}%`} color={s.actual_over_budget ? '#dc2626' : undefined} />
            {s.actual_budget_pct_bar !== null ? (
              <View style={styles.meter}>
                <View style={[styles.meterFill, { width: `${s.actual_budget_pct_bar}%`, backgroundColor: s.actual_over_budget ? '#dc2626' : '#6366f1' }]} />
              </View>
            ) : null}
          </SumCard>
          <SumCard
            icon={s.is_save ? 'trending-down' : 'trending-up'}
            color={s.is_save ? '#16a34a' : '#dc2626'}
            ink={s.is_save ? '#16a34a' : '#dc2626'}
            label="ส่วนต่าง"
            pill={s.diff_text}
            value={`${s.is_save ? '+' : '-'}฿${fmt(Math.abs(s.grand_diff))}`}
          >
            <SumSub label="ทุน" value={`${fmt(s.grand_diff_percent)}%`} />
          </SumCard>
        </View>
      ) : null}

      {/* ผู้สั่งซื้อ */}
      {data ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>รายชื่อผู้ทำรายการสั่งซื้อในโครงการนี้</Text>
          {data.orderers.length === 0 ? (
            <Text style={styles.mutedPill}>ยังไม่มีประวัติผู้สั่งซื้อในโครงการนี้</Text>
          ) : (
            <View style={styles.rowWrap}>
              {data.orderers.map((o) => (
                <Pressable key={o.orderer_name} onPress={() => void openOrderer(o.orderer_name)} style={({ pressed }) => [styles.ordererChipBig, pressed && styles.pressed]}>
                  <Ionicons name="person-circle" size={15} color="#4f46e5" />
                  <Text style={styles.ordererChipBigText}>{o.orderer_name}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {/* แถบเครื่องมือ */}
      {data ? (
        <View style={styles.toolGrid}>
          <ToolBtn icon="time-outline" text="ประวัติแก้ไขทุน" onPress={() => void openCostHistory()} />
          <ToolBtn icon="ban-outline" text="ประวัติยกเลิกอนุมัติ" onPress={() => void openCancelHistory('')} />
          <ToolBtn icon="arrow-undo-outline" text="ประวัติคืนเงิน" count={data.refund_count} onPress={() => void openRefund('')} />
          <ToolBtn icon="layers" text="อนุมัติเอกสาร (หลายหน้างาน)" primary onPress={openGlobalPo} />
        </View>
      ) : null}

      {data ? (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color="#94a3b8" />
          <TextInput value={search} onChangeText={setSearch} placeholder="ค้นหารายการ, หมวดหมู่, ผู้สั่งซื้อ..." placeholderTextColor="#94a3b8" style={styles.searchInput} />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#cbd5e1" />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  // ท้ายตาราง — รวมยอดทั้งโครงการ
  const footer = s ? (
    <View style={styles.totalCard}>
      <Text style={styles.totalTitle}>รวมยอดทั้งโครงการ</Text>
      <TotalRow label="ราคากลางรวม" value={`฿ ${fmt(s.grand_total_standard)}`} />
      <TotalRow label="ทุนเดิมรวมสุทธิ" value={`฿ ${fmt(s.net_grand_total_plan)}`} note={s.total_discount_value > 0 ? `(หักส่วนลด ฿${fmt(s.total_discount_value)})` : undefined} />
      <TotalRow label="ซื้อจริงรวม (เฉพาะสินค้า)" value={`฿ ${fmt(s.grand_total_actual_product)}`} />
      <TotalRow label="ซื้อเคลม (รวมมูลค่า)" value={`฿ ${fmt(s.grand_total_claim)}`} color={s.grand_total_claim > 0 ? '#dc2626' : undefined} />
      <TotalRow label="ซื้อจริงรวม (รวมค่าใช้จ่าย)" value={s.show_actual_full_total ? `฿ ${fmt(s.grand_total_actual_full)}` : '-'} />
      <View style={styles.totalDiff}>
        <Text style={styles.totalDiffLabel}>ส่วนต่าง</Text>
        <Text style={[styles.totalDiffVal, { color: s.grand_diff > 0 ? '#16a34a' : s.grand_diff < 0 ? '#dc2626' : '#64748b' }]}>
          {s.grand_diff > 0 ? '+ ' : s.grand_diff < 0 ? '- ' : ''}฿ {fmt(Math.abs(s.grand_diff))}
        </Text>
      </View>
      <View style={styles.rowWrap}>
        <View style={styles.totalPill}><Text style={styles.totalPillText}>ทุนคิดเป็น {fmt(s.grand_diff_percent)}%</Text></View>
        <View style={[styles.totalPill, { backgroundColor: s.is_save ? '#ecfdf5' : '#fef2f2', borderColor: s.is_save ? '#a7f3d0' : '#fca5a5' }]}>
          <Text style={[styles.totalPillText, { color: s.is_save ? '#059669' : '#dc2626' }]}>กำไรสุทธิ {fmt(s.net_profit_percent)}%</Text>
        </View>
      </View>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safe}>
      {/* ไอคอนแถบสถานะสีขาว — หน้านี้อยู่ใต้แถบหัวสีน้ำเงินของ drawer เสมอ (ทั้งเปิดจากเมนูและจากแดชบอร์ดโครงการ) */}
      <StatusBar barStyle="light-content" />
      {loading && !data ? (
        <ScrollView>
          {header}
          <LoadingBox text="กำลังคำนวณต้นทุนทั้งโครงการ... (หน้างานใหญ่อาจใช้เวลาหลายวินาที)" />
        </ScrollView>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => (r.type === 'group' ? r.key : String(r.item.id))}
          renderItem={({ item: r }) =>
            r.type === 'group' ? (
              <View style={styles.groupBar}>
                <Ionicons name="folder-open" size={15} color="#fff" />
                <Text style={styles.groupText}>{r.label}</Text>
                <View style={styles.groupCount}>
                  <Text style={styles.groupCountText}>{r.count} รายการ</Text>
                </View>
              </View>
            ) : (
              <ItemCard
                item={r.item}
                index={r.index}
                canEdit={!!perms?.can_update_cost_price}
                canApproveMgr={!!perms?.can_approve_mgr}
                canApproveExec={!!perms?.can_approve_exec}
                busy={billBusy && billBusy.itemId === r.item.id ? billBusy : null}
                h={handlers}
              />
            )
          }
          extraData={billBusy}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={data ? <EmptyBox text={search ? `ไม่พบรายการที่ตรงกับ "${search}"` : 'ไม่พบข้อมูลสินค้า'} icon="cube-outline" /> : null}
          // สลับโหมดจำลอง/โหลดใหม่ทั้งหน้าขณะมีข้อมูลเดิมอยู่ → ขึ้น spinner ด้านบนให้รู้ว่ากำลังคำนวณ
          refreshControl={<RefreshControl refreshing={refreshing || (loading && !!data)} onRefresh={() => void load('refresh')} tintColor="#4f46e5" />}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={6}
          windowSize={7}
          contentContainerStyle={{ paddingBottom: 30 }}
        />
      )}

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Ionicons name="information-circle" size={16} color="#fff" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* ---------------- เลือกหน้างาน ---------------- */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <StatusBar barStyle="dark-content" />
          <View style={styles.pickHeader}>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={8} style={styles.backBtn}>
              <Ionicons name="close" size={16} color="#475569" />
              <Text style={styles.backText}>ปิด</Text>
            </Pressable>
            <Text style={styles.pickTitle}>⇄ เลือกหน้างาน</Text>
          </View>
          {pickerOpen ? (
            <ProjectPicker
              userId={uid}
              currentId={projectId}
              onPick={(pid) => {
                setPickerOpen(false);
                if (pid !== projectId) setProjectId(pid);
              }}
            />
          ) : null}
        </View>
      </Modal>

      {/* ---------------- รายการที่ถูกหักออก (โหมดจำลอง) ---------------- */}
      <SheetModal visible={cutOutOpen} title="รายการที่ถูกตัดออกจากการคำนวณ (ยังไม่จัดส่ง)" icon="cut" color="#d97706" onClose={() => setCutOutOpen(false)} tall>
        {(data?.cut_out.items ?? []).map((c, i) => (
          <View key={i} style={styles.listRow}>
            <Text style={styles.listTitle}>{i + 1}. {c.name}</Text>
            <View style={styles.kvRow}><Text style={styles.kvLabel}>จำนวนที่ตัด</Text><Text style={[styles.kvVal, { color: '#dc2626' }]}>{fmtQty(c.cut_qty)} {c.unit}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvLabel}>ราคากลางที่ตัด</Text><Text style={[styles.kvVal, { color: '#8b5cf6' }]}>฿{fmt(c.std_total)}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvLabel}>ทุนเดิมที่ตัด</Text><Text style={[styles.kvVal, { color: '#3b82f6' }]}>฿{fmt(c.plan_total)}</Text></View>
          </View>
        ))}
        {data ? (
          <View style={styles.sumBar}>
            <View style={styles.kvRow}><Text style={styles.kvLabelBold}>รวมราคากลางที่ตัด</Text><Text style={[styles.kvValBig, { color: '#7c3aed' }]}>฿{fmt(data.cut_out.total_cut_std)}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvLabelBold}>รวมทุนเดิมที่ตัด</Text><Text style={[styles.kvValBig, { color: '#2563eb' }]}>฿{fmt(data.cut_out.total_cut_plan)}</Text></View>
          </View>
        ) : null}
      </SheetModal>

      {/* ---------------- ประวัติทำรายการโดย (ผู้สั่งซื้อ) ---------------- */}
      <SheetModal visible={!!orderer} title={`ประวัติทำรายการโดย ${orderer?.name ?? ''}`} icon="person" color="#2563eb" onClose={() => setOrderer(null)} tall>
        {!history || history.loading ? (
          <LoadingBox text="กำลังโหลดประวัติ..." />
        ) : (
          (() => {
            const g = history.byOrderer.find((x: any) => x.orderer_name === orderer?.name);
            if (!g || !orderer) return <EmptyBox text="ไม่มีประวัติการสั่งซื้อสำหรับผู้ใช้นี้" />;
            const prod = (g.rows ?? []).filter((r: any) => r.item_type !== 'expense');
            const exp = (g.rows ?? []).filter((r: any) => r.item_type === 'expense');
            const tab = orderer.tab;
            const list = tab === 'product' ? prod : exp;
            return (
              <>
                <View style={styles.tabRow}>
                  <Pressable onPress={() => setOrderer({ ...orderer, tab: 'product' })} style={[styles.tabBtn, tab === 'product' && { backgroundColor: '#3b82f6', borderColor: '#2563eb' }]}>
                    <Text style={[styles.tabText, tab === 'product' && { color: '#fff' }]}>รายการสินค้า ({prod.length})</Text>
                  </Pressable>
                  <Pressable onPress={() => setOrderer({ ...orderer, tab: 'expense' })} style={[styles.tabBtn, tab === 'expense' && { backgroundColor: '#f59e0b', borderColor: '#d97706' }]}>
                    <Text style={[styles.tabText, tab === 'expense' && { color: '#fff' }]}>ค่าใช้จ่าย ({exp.length})</Text>
                  </Pressable>
                </View>
                {list.length === 0 ? <EmptyBox text={tab === 'product' ? 'ไม่มีรายการสินค้า' : 'ไม่มีรายการค่าใช้จ่าย'} /> : null}
                {list.map((h: any, i: number) => (
                  <View key={i} style={styles.listRow}>
                    <View style={styles.kvRow}>
                      <Text style={styles.kvLabel}>{thShort(h.order_date)}</Text>
                      <Text style={[styles.poTag, tab === 'expense' && { backgroundColor: '#ffedd5', color: '#c2410c' }]}>{h.po_number || '-'}</Text>
                    </View>
                    <Text style={[styles.listTitle, { color: tab === 'product' ? '#1e3a8a' : '#9a3412' }]}>{h.item_name}</Text>
                    <Text style={styles.listSub}>{tab === 'product' ? `🏪 ${h.supplier_name || '-'}` : `🏷 ${h.note || '-'}`}</Text>
                    {tab === 'product' && h.sub_items.length > 0 ? (
                      <View style={styles.subBox}>
                        <Text style={styles.subBoxTitle}>รายการอะไหล่ในบิลนี้:</Text>
                        {h.sub_items.map((sub: any, k: number) => (
                          <View key={k} style={styles.kvRow}>
                            <Text style={styles.subName}>• {sub.item_name}</Text>
                            <Text style={styles.subVal}>{fmtQty(sub.quantity)} × {fmt(sub.unit_price)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <View style={styles.kvRow}>
                      <Text style={styles.kvLabel}>{fmtQty(h.buy_quantity)} × {fmt(h.buy_unit_price)}</Text>
                      <Text style={[styles.kvVal, { color: tab === 'product' ? '#059669' : '#ea580c' }]}>{fmt(h.total_price)}</Text>
                    </View>
                  </View>
                ))}
                <View style={styles.sumBar}>
                  <View style={styles.kvRow}>
                    <Text style={styles.kvLabelBold}>{tab === 'product' ? 'ยอดรวมสินค้า' : 'ยอดรวมค่าใช้จ่าย'}</Text>
                    <Text style={[styles.kvValBig, { color: tab === 'product' ? '#1d4ed8' : '#ea580c' }]}>฿ {fmt(tab === 'product' ? g.product_total : g.expense_total)}</Text>
                  </View>
                </View>
              </>
            );
          })()
        )}
      </SheetModal>

      {/* ---------------- ป็อปอัปของรายการ: ซื้อเกิน / แพงกว่าทุน / ส่วนประกอบย่อย / ซื้อในเครือ ---------------- */}
      <SheetModal
        visible={!!itemPopup}
        tall
        onClose={() => setItemPopup(null)}
        title={itemPopup?.mode === 'over' ? 'ตรวจสอบการสั่งซื้อเกินแผน' : itemPopup?.mode === 'over_price' ? 'ตรวจสอบการซื้อแพงกว่าทุนเดิม' : itemPopup?.mode === 'sub' ? 'รายละเอียดส่วนประกอบย่อย' : 'ข้อมูลบิลในเครือข่าย'}
        icon={itemPopup?.mode === 'over' ? 'warning' : itemPopup?.mode === 'over_price' ? 'search' : itemPopup?.mode === 'sub' ? 'git-branch' : 'git-network'}
        color={itemPopup?.mode === 'over' ? '#dc2626' : itemPopup?.mode === 'over_price' ? '#ea580c' : itemPopup?.mode === 'sub' ? '#4f46e5' : '#059669'}
      >
        {itemPopup ? <Text style={styles.popItemName}>{itemPopup.item.item_name}</Text> : null}
        {!itemPopup || itemPopup.loading ? (
          <LoadingBox text="กำลังโหลด..." />
        ) : itemPopup.mode === 'over' ? (
          <>
            <View style={[styles.infoBand, { backgroundColor: '#fef2f2', borderLeftColor: '#dc2626' }]}>
              <Text style={styles.infoBandText}>
                เป้าหมาย: <Text style={{ fontWeight: '800' }}>{fmtQty(itemPopup.detail.over.plan_qty)}</Text> | ซื้อรวม: <Text style={{ fontWeight: '800', color: '#b45309' }}>{fmtQty(itemPopup.detail.over.actual_qty)}</Text>
              </Text>
              <Text style={[styles.infoBandText, { color: '#dc2626', fontWeight: '800' }]}>ส่วนที่เกิน: {fmtQty(itemPopup.detail.over.over_qty)} หน่วย</Text>
              <Text style={styles.infoBandSub}>มูลค่าส่วนที่เกิน (ประเมิน)</Text>
              <Text style={styles.infoBandBig}>฿ {fmt(itemPopup.detail.over.over_cost)}</Text>
            </View>
            <Text style={styles.subHead}>ประวัติเฉพาะบิลที่สั่งเกินเป้าหมาย:</Text>
            {itemPopup.detail.over.bills.map((b: any, i: number) => (
              <View key={i} style={styles.listRow}>
                <View style={styles.kvRow}><Text style={styles.kvLabel}>{b.order_date_dmy || '-'}</Text><Text style={styles.poTag}>{b.po_number || '-'}</Text></View>
                <Text style={styles.listSub}>👤 {b.orderer_name || '-'}</Text>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>ยอดซื้อในบิล {fmtQty(b.buy_quantity)} <Text style={{ color: '#ef4444' }}>(ส่วนเกิน +{fmtQty(b.excess_part)})</Text></Text>
                  <Text style={[styles.kvVal, { color: '#059669' }]}>{fmt(b.total_price)}</Text>
                </View>
                {b.is_network ? <Badge text="ซื้อในเครือ" icon="business" tone={{ bg: '#ecfdf5', border: '#a7f3d0', text: '#059669' }} /> : null}
                {b.note ? <Text style={styles.noteBox}>💬 {b.note}</Text> : null}
              </View>
            ))}
          </>
        ) : itemPopup.mode === 'over_price' ? (
          <>
            <View style={[styles.infoBand, { backgroundColor: '#fff7ed', borderLeftColor: '#ea580c' }]}>
              <Text style={styles.infoBandText}>ทุนเดิมที่ตั้งไว้: <Text style={{ fontWeight: '800', color: '#3730a3' }}>฿{fmt(itemPopup.detail.over_price.cost_price)}</Text> / หน่วย</Text>
            </View>
            <Text style={styles.subHead}>ประวัติเฉพาะบิลที่ซื้อแพงกว่าทุน:</Text>
            {itemPopup.detail.purchase_rows.length === 0 ? (
              <EmptyBox text="ไม่มีประวัติการสั่งซื้อ" />
            ) : itemPopup.detail.over_price.bills.length === 0 ? (
              <EmptyBox text="ไม่พบข้อมูลบิลที่ซื้อแพงกว่าทุน" />
            ) : (
              itemPopup.detail.over_price.bills.map((b: any, i: number) => (
                <View key={i} style={styles.listRow}>
                  <View style={styles.kvRow}><Text style={styles.kvLabel}>{b.order_date_dmy || '-'}</Text><Text style={styles.poTag}>{b.po_number || '-'}</Text></View>
                  <View style={styles.kvRow}><Text style={styles.kvLabel}>จำนวน</Text><Text style={styles.kvVal}>{fmtQty(b.buy_quantity)}</Text></View>
                  <View style={styles.kvRow}><Text style={styles.kvLabel}>ซื้อจริง/หน่วย</Text><Text style={[styles.kvVal, { color: '#c2410c' }]}>฿{fmt(b.buy_unit_price)}</Text></View>
                  <View style={styles.kvRow}><Text style={styles.kvLabel}>ส่วนต่าง/หน่วย</Text><Text style={[styles.kvVal, { color: '#dc2626' }]}>+ ฿{fmt(b.diff_price)}</Text></View>
                  {b.note && b.note !== '-' ? <Text style={styles.noteBox}>💬 {b.note}</Text> : null}
                </View>
              ))
            )}
          </>
        ) : itemPopup.mode === 'sub' ? (
          <>
            {itemPopup.detail.sub_breakdown.cost_note ? <Text style={styles.costNote}>{itemPopup.detail.sub_breakdown.cost_note}</Text> : null}
            {itemPopup.detail.sub_breakdown.rows.length === 0 ? <EmptyBox text="ไม่มีรายการส่วนประกอบย่อย" /> : null}
            {itemPopup.detail.sub_breakdown.rows.map((r: any, i: number) => (
              <View key={i} style={styles.listRow}>
                <Text style={styles.listTitle}>{i + 1}. {r.name}</Text>
                {!r.has_plan ? <Text style={styles.listSub}>ไม่พบในแผน</Text> : null}
                <View style={styles.subGrid}>
                  <View style={[styles.subCol, { backgroundColor: '#fffbeb' }]}>
                    <Text style={[styles.subColHead, { color: '#92400e' }]}>ตามแผน</Text>
                    <Text style={styles.subLine}>จำนวน {r.has_plan ? fmtQty(r.plan_qty) : '—'}</Text>
                    <Text style={styles.subLine}>ทุน/หน่วย {r.has_plan ? fmt(r.plan_unit_cost) : '—'}</Text>
                    <Text style={[styles.subLine, { fontWeight: '800' }]}>รวมทุน {r.has_plan ? fmt(r.plan_total) : '—'}</Text>
                  </View>
                  <View style={[styles.subCol, { backgroundColor: '#eff6ff' }]}>
                    <Text style={[styles.subColHead, { color: '#1e40af' }]}>เกิดขึ้นจริง</Text>
                    <Text style={[styles.subLine, { color: '#0369a1' }]}>สั่งซื้อใหม่ {fmtQty(r.buy)}</Text>
                    <Text style={[styles.subLine, { color: '#047857' }]}>เบิกสต๊อก {fmtQty(r.stock)}</Text>
                    <Text style={[styles.subLine, { color: '#b91c1c' }]}>เคลม {fmtQty(r.claim)}</Text>
                    <Text style={[styles.subLine, { fontWeight: '800' }]}>รวม {fmtQty(r.total)}</Text>
                  </View>
                </View>
              </View>
            ))}
            {itemPopup.detail.sub_breakdown.has_plan ? (
              <>
                <View style={[styles.sumBar, { backgroundColor: '#fffbeb' }]}>
                  <View style={styles.kvRow}><Text style={[styles.kvLabelBold, { color: '#92400e' }]}>รวมทุนรายการย่อยตามแผน</Text><Text style={[styles.kvValBig, { color: '#92400e' }]}>{fmt(itemPopup.detail.sub_breakdown.plan_total)}</Text></View>
                </View>
                <Text style={styles.hint}>รายการชื่อเดียวกันรวมไว้ในแถวเดียว ทุน/หน่วยแสดงค่าเฉลี่ยตามจำนวนเมื่อมีหลายราคา</Text>
              </>
            ) : null}
          </>
        ) : (
          <>
            {itemPopup.detail.network_bom.length === 0 ? <EmptyBox text="ไม่พบข้อมูลรายละเอียดบิล" /> : null}
            {itemPopup.detail.network_bom.map((b: any, i: number) => (
              <View key={i} style={styles.bomCard}>
                <View style={styles.kvRow}><Text style={styles.bomNo}>📄 {b.quotation_no || '-'}</Text><Text style={styles.bomDate}>{b.created_at_dmy}</Text></View>
                <Text style={styles.bomLine}>ผู้ออกบิล: <Text style={{ fontWeight: '800', color: '#0f172a' }}>{b.issuer_name || '-'}</Text></Text>
                <Text style={styles.bomLine}>สังกัดบริษัท: <Text style={{ fontWeight: '800', color: '#0f172a' }}>{b.company_name || '-'}</Text></Text>
              </View>
            ))}
          </>
        )}
      </SheetModal>

      {/* ---------------- การจ่ายเงินรายบิล (รายการที่มีเกิน 2 บิล) ---------------- */}
      <SheetModal visible={!!payList} title="การจ่ายเงินรายบิล" icon="cash" color="#10b981" onClose={() => setPayList(null)} tall>
        {payList?.pay.cards.map((c) => (
          <PayCardView key={c.pn} c={c} onLink={() => void openLink(c.pn, payList)} onSites={() => openSites(c.pn, payList)} />
        ))}
        {payList?.pay.summary ? (
          <View style={styles.sumBar}>
            <View style={styles.kvRow}><Text style={styles.kvLabelBold}>รวม {payList.pay.cards.length} บิล · จ่ายแล้ว</Text><Text style={[styles.kvValBig, { color: '#15803d' }]}>{fmt(payList.pay.summary.sum_paid)}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvLabelBold}>ยอดบิลรวม</Text><Text style={[styles.kvValBig, { color: '#475569' }]}>{fmt(payList.pay.summary.sum_bill)}</Text></View>
          </View>
        ) : null}
      </SheetModal>

      {/* ---------------- บิลใช้ร่วมหลายหน้างาน ---------------- */}
      <SheetModal visible={!!sites} title={`บิล ${sites?.pn ?? ''} ใช้ร่วม ${siteInfo?.sites.length ?? 0} หน้างาน`} icon="git-merge" color="#2563eb" onClose={closeSites}>
        <Text style={styles.hint}>ยอดบิลที่เอาไปเทียบกับเงินที่จ่ายจริง คือยอดรวมของทุกหน้างานด้านล่างนี้</Text>
        {(siteInfo?.sites ?? []).map((r) => (
          <View key={r.pid} style={[styles.listRow, r.here && { backgroundColor: '#eff6ff' }]}>
            <View style={styles.kvRow}>
              <Text style={styles.listTitle}>{r.pid}{r.here ? '  (หน้างานที่เปิดอยู่)' : ''}</Text>
              <Text style={[styles.kvVal, { color: '#475569' }]}>{fmt(r.amt)}</Text>
            </View>
            <Text style={styles.listSub}>{r.cus || r.name || '-'}{r.co ? ` · ${r.co}` : ''}</Text>
            {!r.here ? (
              <Pressable onPress={() => { setSites(null); setProjectId(r.pid); }} style={({ pressed }) => [styles.smallBtn, { backgroundColor: '#2563eb' }, pressed && styles.pressed]}>
                <Text style={styles.smallBtnText}>เปิดหน้างาน ›</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        <View style={styles.sumBar}>
          <View style={styles.kvRow}><Text style={styles.kvLabelBold}>ยอดบิลรวม</Text><Text style={styles.kvValBig}>{fmt(siteInfo?.total ?? 0)}</Text></View>
        </View>
      </SheetModal>

      {/* ---------------- ผูกใบในสมุดกับบิล ---------------- */}
      <SheetModal
        visible={!!link}
        title={`ผูกใบในสมุดกับบิล ${link?.pn ?? ''}`}
        icon="link"
        color="#2563eb"
        onClose={closeLink}
        tall
        footer={
          link && !link.loading && (link.res?.docs ?? []).length > 0 ? (
            <View style={styles.modalBtnRow}>
              <Pressable onPress={closeLink} style={[styles.modalBtn, styles.modalBtnGhost]}><Text style={styles.modalBtnGhostText}>ยกเลิก</Text></Pressable>
              {perms?.can_link_docs ? (
                <Pressable onPress={() => void saveLink()} disabled={link.saving} style={[styles.modalBtn, { backgroundColor: '#059669' }, link.saving && styles.disabled]}>
                  {link.saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnText}>✓ บันทึกการผูก</Text>}
                </Pressable>
              ) : null}
            </View>
          ) : undefined
        }
      >
        {!link || link.loading ? (
          <LoadingBox text="กำลังค้นใบในสมุด..." />
        ) : (link.res?.docs ?? []).length === 0 ? (
          <EmptyBox text={`ยังไม่มีใบลงสมุดคุมเอกสารที่ใช้เลข ${link.pn}\nรอฝ่ายการเงินลงสมุดก่อน แล้วค่อยกลับมาผูก`} />
        ) : (
          <>
            <Text style={styles.hint}>
              ติ๊กใบที่เป็นของบิลนี้ — ติ๊กได้หลายใบถ้าจ่ายเป็นงวด · ติ๊กออกเพื่อปลดใบที่จับคู่ผิด
              {link.res.sites > 1 ? `\nบิลนี้ใช้ร่วม ${link.res.sites} หน้างาน — ยอดที่เทียบคือยอดรวมทุกหน้างาน` : ''}
            </Text>
            {link.res.docs.map((d: any) => {
              const on = link.picked.has(d.id);
              return (
                <Pressable
                  key={d.id}
                  onPress={() => {
                    const next = new Set(link.picked);
                    if (on) next.delete(d.id); else next.add(d.id);
                    setLink({ ...link, picked: next });
                  }}
                  style={[styles.docRow, on && styles.docRowOn]}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? '#059669' : '#94a3b8'} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.kvRow}><Text style={[styles.listTitle, styles.mono]}>{d.no}</Text><Text style={styles.kvVal}>{fmt(d.amount)}</Text></View>
                    <Text style={styles.listSub}>{d.supplier || '-'}</Text>
                    <Text style={styles.listSub}>{d.job_site || '-'} · {d.date || '-'}</Text>
                    <View style={styles.rowWrap}>
                      {d.site_hit ? <Badge text="หน้างานตรง" tone={{ bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' }} /> : d.other_job ? <Badge text="ระบุเป็นงานอื่น/สต๊อก" tone={{ bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' }} /> : null}
                      {!d.same_company ? <Badge text={`ในเครือ ${d.company}`} tone={{ bg: '#f5f3ff', border: '#ddd6fe', text: '#7c3aed' }} /> : null}
                      <Badge text={d.paid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'} tone={d.paid ? { bg: '#f0fdf4', border: '#86efac', text: '#15803d' } : { bg: '#f8fafc', border: '#cbd5e1', text: '#64748b' }} />
                      {d.linked_other ? <Badge text={`ผูกอยู่กับ ${d.other_pn} (${d.other_site})`} tone={{ bg: '#fffbeb', border: '#fcd34d', text: '#b45309' }} /> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
            {(() => {
              // แถบสรุปคิดสดตามที่ติ๊ก (เว็บก็คิดในหน้าจอแบบเดียวกัน)
              let paid = 0;
              link.res.docs.forEach((d: any) => { if (link.picked.has(d.id) && d.paid) paid += num(d.amount); });
              const diff = Math.round((num(link.res.bill) - paid) * 100) / 100;
              const ok = Math.abs(diff) <= 1;
              const color = ok ? '#15803d' : diff > 0 ? '#b45309' : '#b91c1c';
              return (
                <View style={styles.sumBar}>
                  <View style={styles.kvRow}><Text style={styles.kvLabel}>เลือกไว้</Text><Text style={styles.kvVal}>{link.picked.size} ใบ</Text></View>
                  <View style={styles.kvRow}><Text style={styles.kvLabel}>ยอดบิล</Text><Text style={styles.kvVal}>{fmt(link.res.bill)}</Text></View>
                  <View style={styles.kvRow}><Text style={styles.kvLabel}>จ่ายแล้ว (เฉพาะใบที่มีสลิป)</Text><Text style={[styles.kvVal, { color: '#15803d' }]}>{fmt(paid)}</Text></View>
                  <Text style={[styles.kvValBig, { color, textAlign: 'right' }]}>{ok ? 'ตรงพอดี' : `${diff > 0 ? 'ยังขาด' : 'จ่ายเกิน'} ${fmt(Math.abs(diff))}`}</Text>
                </View>
              );
            })()}
          </>
        )}
      </SheetModal>

      {/* ---------------- จัดการเอกสาร ---------------- */}
      <SheetModal visible={!!poManage} title={`จัดการเอกสาร ${poManage?.pn ?? ''}`} icon="document-text" color="#1e3a8a" onClose={closePoManage} tall>
        {!poManage || poManage.loading || !poManage.data ? (
          <LoadingBox text="กำลังโหลดเอกสาร..." />
        ) : (
          (() => {
            const m = poManage.data;
            return (
              <>
                <Text style={styles.subHead}>📦 รายการสินค้าและอะไหล่ในเอกสารนี้</Text>
                {m.items.map((it: any, idx: number) => (
                  <View key={idx} style={styles.poItem}>
                    <Text style={styles.listTitle}>{idx + 1}. {it.name}</Text>
                    <View style={styles.kvRow}><Text style={styles.kvLabel}>วันที่สั่ง</Text><Text style={styles.kvVal}>{it.order_date_thai || '-'}</Text></View>
                    <View style={styles.kvRow}><Text style={styles.kvLabel}>จำนวน × ซื้อจริง/หน่วย</Text><Text style={styles.kvVal}>{fmtQty(it.qty)} × ฿{fmt(it.unit_price)}</Text></View>
                    <View style={styles.kvRow}><Text style={styles.kvLabel}>ซื้อจริง (รวม)</Text><Text style={[styles.kvVal, { color: '#059669' }]}>฿{fmt(it.main_total)}</Text></View>
                    {it.installments.map((inst: any) => (
                      <View key={inst.id} style={styles.instRow}>
                        <View style={styles.kvRow}>
                          <Text style={styles.instTitle}>📅 งวด {inst.seq}</Text>
                          <Text style={[styles.kvVal, { color: inst.waiting ? '#f59e0b' : '#7c3aed' }]}>{inst.waiting ? 'รอชำระ' : `฿${fmt(inst.amount)}`}</Text>
                        </View>
                        {!inst.waiting ? (
                          <View style={styles.rowWrap}>
                            {(['mgr', 'exec'] as const).map((role) => {
                              const r = inst[role];
                              const label = role === 'mgr' ? 'ผจก.' : 'ผบห.';
                              if (r.approved) {
                                return (
                                  <View key={role} style={styles.rowWrap}>
                                    <Badge text={`✓ ${label}${r.at_display ? ` ${r.at_display}` : ''}`} tone={role === 'mgr' ? { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' } : { bg: '#f5f3ff', border: '#c4b5fd', text: '#4c1d95' }} />
                                    {r.can_cancel ? (
                                      <Pressable onPress={() => openCancel({ scope: 'installment', role, instId: inst.id, seqNo: inst.seq, poNumber: m.po_number })} style={({ pressed }) => [styles.cancelMini, pressed && styles.pressed]}>
                                        <Text style={styles.cancelMiniText}>⊘ ยกเลิก</Text>
                                      </Pressable>
                                    ) : null}
                                  </View>
                                );
                              }
                              return r.can_approve ? (
                                <Pressable key={role} onPress={() => approveInstallment(inst, role, m.po_number)} style={({ pressed }) => [styles.instPendingBtn, pressed && styles.pressed]}>
                                  <Text style={styles.instPendingText}>⏳ {label} · อนุมัติงวดนี้</Text>
                                </Pressable>
                              ) : (
                                <Text key={role} style={styles.instPendingPlain}>⏳ {label}</Text>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    ))}
                    {it.subs.map((sub: any, k: number) => (
                      <View key={k} style={styles.subLineRow}>
                        <Text style={styles.subName}>🔧 {sub.name}</Text>
                        <Text style={styles.subVal}>{fmtQty(sub.qty)} × ฿{fmt(sub.unit_price)} = ฿{fmt(sub.total_price)}</Text>
                      </View>
                    ))}
                    {it.show_expense ? (
                      <View style={styles.subLineRow}>
                        <Text style={[styles.subName, { color: '#64748b' }]}>ค่าใช้จ่าย: {it.expense_name}</Text>
                        <Text style={[styles.subVal, { color: '#64748b' }]}>฿{fmt(it.expense_price)}</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
                <View style={[styles.sumBar, { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' }]}>
                  {m.remarks ? <Text style={styles.remark}>💬 หมายเหตุ: {m.remarks}</Text> : null}
                  <View style={styles.kvRow}><Text style={[styles.kvLabelBold, { color: '#065f46' }]}>ยอดรวมทั้งหมดใน PO นี้</Text><Text style={[styles.kvValBig, { color: '#059669' }]}>฿{fmt(m.po_grand_total)}</Text></View>
                </View>

                {(['mgr', 'exec'] as const).map((role) => {
                  const side = m[role];
                  const isMgr = role === 'mgr';
                  return (
                    <View key={role} style={[styles.sideBox, isMgr ? { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' } : { backgroundColor: '#f5f3ff', borderColor: '#c4b5fd' }]}>
                      <Text style={[styles.sideTitle, { color: isMgr ? '#065f46' : '#4c1d95' }]}>{isMgr ? '✓ ส่วนของผู้จัดการ' : '✓✓ ส่วนของผู้บริหาร'}</Text>
                      {side.approved_all ? (
                        <>
                          <Text style={[styles.sideName, { color: isMgr ? '#065f46' : '#4c1d95' }]}>{side.approver_name}</Text>
                          <Text style={[styles.sideTime, { color: isMgr ? '#059669' : '#6d28d9' }]}>{side.approved_date_dmy} · {side.approved_clock}</Text>
                          {side.can_cancel ? (
                            <Pressable onPress={() => openCancel({ scope: 'po', role, poNumber: m.po_number, itemIds: m.all_item_ids })} style={({ pressed }) => [styles.cancelMini, { alignSelf: 'center', marginTop: 8 }, pressed && styles.pressed]}>
                              <Ionicons name="ban" size={12} color="#dc2626" />
                              <Text style={styles.cancelMiniText}>ยกเลิกอนุมัติ</Text>
                            </Pressable>
                          ) : null}
                        </>
                      ) : side.can_approve ? (
                        <Pressable onPress={() => approvePoSide(m.po_number, role, side.pending_item_ids)} style={({ pressed }) => [styles.bigBtn, { backgroundColor: isMgr ? '#10b981' : '#8b5cf6' }, pressed && styles.pressed]}>
                          <Text style={styles.bigBtnText}>{isMgr ? 'อนุมัติ ผู้จัดการ (เฉพาะบิลนี้)' : 'อนุมัติ ผู้บริหาร (เฉพาะบิลนี้)'}</Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.noPerm}>🔒 ไม่มีสิทธิ์อนุมัติระดับนี้</Text>
                      )}
                    </View>
                  );
                })}

                {m.bills.map((b: any, i: number) => (
                  <Pressable
                    key={b.id}
                    disabled={!b.editable}
                    onPress={() => Linking.openURL(`${API_BASE}/${b.edit_url}`).catch(() => showToast('เปิดหน้าเว็บไม่ได้'))}
                    style={({ pressed }) => [styles.billBtn, !b.editable && styles.billBtnLocked, pressed && styles.pressed]}
                  >
                    <Ionicons name={b.editable ? 'create-outline' : 'lock-closed'} size={13} color={b.editable ? '#fff' : '#94a3b8'} />
                    <Text style={[styles.billBtnText, !b.editable && { color: '#94a3b8' }]}>
                      แก้ไขบิล (หน้าเว็บ){m.bills.length > 1 ? ` · ใบที่ ${i + 1} · ${b.supplier || '-'}${b.date_thai ? ` · ${b.date_thai}` : ''} · ฿${fmt(b.total)}` : ''}
                    </Text>
                  </Pressable>
                ))}
                {m.bills.some((b: any) => !b.editable) ? <Text style={styles.hint}>บิลที่ล็อก: ผู้จัดการหรือผู้บริหารอนุมัติแล้ว ต้องมีสิทธิ์แก้ไขเอกสารจึงจะแก้ไขได้</Text> : null}
                <Pressable onPress={() => void openCancelHistory(m.po_number)} style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}>
                  <Ionicons name="ban" size={13} color="#dc2626" />
                  <Text style={styles.outlineBtnText}>ประวัติการยกเลิกอนุมัติของบิลนี้</Text>
                </Pressable>
              </>
            );
          })()
        )}
      </SheetModal>

      {/* ---------------- ยกเลิกการอนุมัติ ---------------- */}
      <SheetModal
        visible={!!cancelAppr}
        title={`ยกเลิกการอนุมัติ (${cancelAppr?.opt.role === 'exec' ? 'ผู้บริหาร' : 'ผู้จัดการ'})`}
        icon="ban"
        color="#dc2626"
        onClose={() => closeCancel(true)}
        footer={
          <View style={styles.modalBtnRow}>
            <Pressable onPress={() => closeCancel(true)} style={[styles.modalBtn, styles.modalBtnGhost]}><Text style={styles.modalBtnGhostText}>ปิด</Text></Pressable>
            <Pressable onPress={() => void submitCancel()} disabled={cancelAppr?.saving} style={[styles.modalBtn, { backgroundColor: '#dc2626' }, cancelAppr?.saving && styles.disabled]}>
              {cancelAppr?.saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnText}>ยืนยันยกเลิกอนุมัติ</Text>}
            </Pressable>
          </View>
        }
      >
        {cancelAppr ? (
          <>
            <Text style={styles.cancelTarget}>
              {cancelAppr.opt.scope === 'installment'
                ? `ยกเลิกอนุมัติเฉพาะ งวด ${cancelAppr.opt.seqNo} ของเลขที่เอกสาร ${cancelAppr.opt.poNumber}`
                : cancelAppr.opt.scope === 'po'
                  ? `ยกเลิกอนุมัติ ทุกรายการ/ทุกงวดที่อนุมัติแล้ว ในเลขที่เอกสาร ${cancelAppr.opt.poNumber}`
                  : `ยกเลิกอนุมัติของรายการ ${cancelAppr.opt.itemName} (ทุกบิล/ทุกงวดที่อนุมัติแล้ว)`}
            </Text>
            <Text style={styles.warnText}>⚠ รายการจะกลับไปเป็นสถานะ "รออนุมัติ" และระบบจะเก็บประวัติการยกเลิกไว้</Text>
            <Text style={styles.fieldLabel}>หมายเหตุการยกเลิก (จำเป็นต้องกรอก)</Text>
            <TextInput
              value={cancelAppr.note}
              onChangeText={(t) => setCancelAppr({ ...cancelAppr, note: t })}
              placeholder="เช่น ราคาทุนผิด / แนบบิลผิดใบ / รอเอกสารเพิ่มเติม"
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={1000}
              style={styles.textarea}
            />
          </>
        ) : null}
      </SheetModal>

      {/* ---------------- ประวัติยกเลิกอนุมัติ ---------------- */}
      <SheetModal visible={!!cancelHist} title={`ประวัติการยกเลิกอนุมัติ${cancelHist?.pn ? ` — ${cancelHist.pn}` : ''}`} icon="ban" color="#dc2626" onClose={closeCancelHistory} tall>
        {!cancelHist || cancelHist.loading ? (
          <LoadingBox text="กำลังโหลดประวัติ..." />
        ) : cancelHist.data.length === 0 ? (
          <EmptyBox text={`ยังไม่มีประวัติการยกเลิกอนุมัติ\n${cancelHist.empty}`} />
        ) : (
          cancelHist.data.map((h: any) => (
            <View key={h.id} style={styles.listRow}>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>🕐 {h.cancelled_at_display}</Text>
                <Badge text={h.role_label} tone={h.role === 'mgr' ? { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' } : { bg: '#f5f3ff', border: '#c4b5fd', text: '#4c1d95' }} />
              </View>
              <Text style={[styles.listTitle, { color: '#b91c1c' }]}>{h.cancelled_by}</Text>
              <View style={styles.kvRow}><Text style={styles.poTag}>{h.po_number || '-'}</Text></View>
              <Text style={styles.listSub}>{h.item_name || '-'}{h.inst_seq > 0 ? ` (งวด ${h.inst_seq})` : ''}</Text>
              <Text style={styles.listSub}>ผู้อนุมัติเดิม: {h.prev_approved_by || '-'}{h.prev_approved_at_display ? ` · ${h.prev_approved_at_display}` : ''}</Text>
              <Text style={styles.noteBox}>{h.note || '-'}</Text>
            </View>
          ))
        )}
      </SheetModal>

      {/* ---------------- ประวัติคืนเงิน ---------------- */}
      <SheetModal visible={!!refundHist} title={`ประวัติคืนเงินจากซัพพลายเออร์${refundHist?.pn ? ` — ${refundHist.pn}` : ''}`} icon="arrow-undo" color="#475569" onClose={() => setRefundHist(null)} tall>
        {!refundHist || refundHist.loading ? (
          <LoadingBox text="กำลังโหลด..." />
        ) : refundHist.data.length === 0 ? (
          <EmptyBox text="ยังไม่มีประวัติคืนเงิน · หน้างานนี้ยังไม่มีบิลที่คืนเงินจากซัพพลายเออร์" />
        ) : (
          <>
            <Text style={styles.hint}>
              บิลที่คืนเงินแล้วถูกยกเลิกเหมือนลบ ไม่นับในยอดซื้อจริง / ยอดใช้จ่าย / การอนุมัติ · รวม {refundHist.data.length} บิล ยอด <Text style={styles.strikeInline}>{fmt(refundHist.total)}</Text> บาท
            </Text>
            {refundHist.data.map((h: any, i: number) => (
              <View key={i} style={styles.listRow}>
                <View style={styles.kvRow}>
                  <Badge mono text={h.po_number} icon="arrow-undo-outline" tone={{ bg: '#f1f5f9', border: '#cbd5e1', text: '#64748b' }} />
                  <Text style={styles.strikeInline}>{fmt(h.bill_amount)}</Text>
                </View>
                <Text style={styles.listTitle}>{h.supplier || '-'}</Text>
                <Text style={styles.listSub}>{num(h.items)} รายการในบิล</Text>
                <Text style={styles.listSub}>ใบในสมุด {h.doc_no} · {h.company} · {fmt(h.doc_amount)} บาท</Text>
                <Text style={styles.listSub}>🕐 {h.refund_at_display} · {h.refund_by || '-'}</Text>
                {h.refund_note ? <Text style={styles.noteBox}>{h.refund_note}</Text> : null}
                {(h.refund_file_urls ?? []).length > 0 ? (
                  <View style={styles.rowWrap}>
                    {h.refund_file_urls.map((u: string, k: number) => (
                      <Badge key={k} text={`ไฟล์ ${k + 1}`} icon="attach" tone={{ bg: '#fff', border: '#cbd5e1', text: '#334155' }} onPress={() => Linking.openURL(`${API_BASE}/${u}`).catch(() => showToast('เปิดไฟล์ไม่ได้'))} />
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </>
        )}
      </SheetModal>

      {/* ---------------- ประวัติแก้ไขทุน ---------------- */}
      <SheetModal visible={!!costHist} title="ประวัติการแก้ไขราคาทุน" icon="time" color="#f59e0b" onClose={() => setCostHist(null)} tall>
        {!costHist || costHist.loading ? (
          <LoadingBox text="กำลังดึงประวัติ..." />
        ) : costHist.data.length === 0 ? (
          <EmptyBox text="ยังไม่มีประวัติการแก้ไขราคาทุนในโครงการนี้" />
        ) : (
          costHist.data.map((h: any, i: number) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listTitle}>{i + 1}. {h.item_name}</Text>
              <Text style={styles.listSub}>👤 <Text style={{ color: '#1e40af', fontWeight: '700' }}>{h.user}</Text> · 🕐 {h.time_dmy}</Text>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>ราคา/หน่วย</Text>
                <Text><Text style={styles.strikeInline}>฿{fmt(h.old_unit)}</Text>  <Text style={[styles.kvVal, { color: '#ef4444' }]}>฿{fmt(h.new_unit)}</Text></Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>ทุนรวมแผน</Text>
                <Text><Text style={styles.strikeInline}>฿{fmt(h.old_total)}</Text>  <Text style={[styles.kvVal, { color: '#b45309' }]}>฿{fmt(h.new_total)}</Text></Text>
              </View>
              <Text style={styles.noteBox}>{h.note || '-'}</Text>
            </View>
          ))
        )}
      </SheetModal>

      {/* ---------------- แก้ไขทุนเดิม ---------------- */}
      <SheetModal
        visible={!!editCost}
        title="แก้ไขทุนเดิม · ปรับราคาต้นทุนสินค้าในแผน"
        icon="create"
        color="#f59e0b"
        onClose={() => setEditCost(null)}
        footer={
          <View style={styles.modalBtnRow}>
            <Pressable onPress={() => setEditCost(null)} style={[styles.modalBtn, styles.modalBtnGhost]}><Text style={styles.modalBtnGhostText}>ยกเลิก</Text></Pressable>
            <Pressable onPress={() => void saveEditCost()} disabled={editCost?.saving} style={[styles.modalBtn, { backgroundColor: '#f59e0b' }, editCost?.saving && styles.disabled]}>
              {editCost?.saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnText}>บันทึกข้อมูล</Text>}
            </Pressable>
          </View>
        }
      >
        {editCost ? (
          <>
            <Text style={styles.fieldLabel}>รายการสินค้า</Text>
            <Text style={styles.listTitle}>{editCost.item.item_name}</Text>
            <Text style={styles.fieldLabel}>ทุนต่อหน่วย (ราคาต่อ 1 หน่วย)</Text>
            <TextInput
              value={editCost.unit}
              keyboardType="decimal-pad"
              onChangeText={(t) => {
                const qty = editCost.item.edit_cost.qty || 1;
                setEditCost({ ...editCost, unit: t, total: (num(t) * qty).toFixed(2) });
              }}
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>ทุนรวมทั้งหมด (ราคารวม {fmtQty(editCost.item.edit_cost.qty || 1)} หน่วย)</Text>
            <TextInput
              value={editCost.total}
              keyboardType="decimal-pad"
              onChangeText={(t) => {
                const qty = editCost.item.edit_cost.qty || 1;
                setEditCost({ ...editCost, total: t, unit: (qty > 0 ? num(t) / qty : 0).toFixed(4) });
              }}
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>💬 หมายเหตุ / เหตุผลที่แก้ไข</Text>
            <TextInput
              value={editCost.note}
              onChangeText={(t) => setEditCost({ ...editCost, note: t, error: '' })}
              placeholder="ระบุเหตุผลการเปลี่ยนแปลงราคาทุน..."
              placeholderTextColor="#94a3b8"
              multiline
              style={styles.textarea}
            />
            {editCost.error ? <Text style={styles.formError}>{editCost.error}</Text> : null}
          </>
        ) : null}
      </SheetModal>

      {/* ---------------- ยกเลิกโครงการ ---------------- */}
      <SheetModal
        visible={!!cancelProject}
        title="ยืนยันการยกเลิกโครงการ?"
        icon="ban"
        color="#ef4444"
        onClose={() => setCancelProject(null)}
        footer={
          <View style={styles.modalBtnRow}>
            <Pressable onPress={() => setCancelProject(null)} style={[styles.modalBtn, styles.modalBtnGhost]}><Text style={styles.modalBtnGhostText}>ปิด</Text></Pressable>
            <Pressable onPress={() => void submitCancelProject()} disabled={cancelProject?.saving} style={[styles.modalBtn, { backgroundColor: '#ef4444' }, cancelProject?.saving && styles.disabled]}>
              {cancelProject?.saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnText}>ใช่, ยกเลิกโครงการ</Text>}
            </Pressable>
          </View>
        }
      >
        {cancelProject ? (
          <>
            <Text style={styles.cancelTarget}>คุณกำลังจะยกเลิกโครงการ{'\n'}<Text style={{ color: '#ef4444', fontWeight: '800' }}>{p?.project_name}</Text></Text>
            <Text style={styles.hint}>ข้อมูลจะถูกขีดฆ่าและจะไม่ถูกนำไปคำนวณในระบบ</Text>
            <Text style={styles.fieldLabel}>โปรดระบุหมายเหตุการยกเลิก (บังคับกรอก)</Text>
            <TextInput
              value={cancelProject.reason}
              onChangeText={(t) => setCancelProject({ ...cancelProject, reason: t, error: '' })}
              placeholder="กรอกเหตุผลที่ยกเลิกโครงการที่นี่..."
              placeholderTextColor="#94a3b8"
              multiline
              style={styles.textarea}
            />
            {cancelProject.error ? <Text style={styles.formError}>{cancelProject.error}</Text> : null}
          </>
        ) : null}
      </SheetModal>

      {/* ---------------- อนุมัติเอกสารข้ามหน้างาน ---------------- */}
      <SheetModal
        visible={!!globalPo}
        title={globalPo?.sel ? `${globalPo.sel.po_number} · ${globalPo.sel.company_label}` : 'อนุมัติเอกสารข้ามหน้างาน'}
        icon="layers"
        color="#1e3a8a"
        onClose={() => setGlobalPo(null)}
        tall
        footer={
          globalPo?.sel && globalPo.detail ? (
            <View style={{ gap: 8 }}>
              {(['mgr', 'exec'] as const).map((role) => {
                const isMgr = role === 'mgr';
                const can = isMgr ? perms?.can_approve_mgr : perms?.can_approve_exec;
                const totalPending = isMgr ? globalPo.detail.total_pending_mgr : globalPo.detail.total_pending_exec;
                let count = 0;
                (globalPo.detail.projects ?? []).forEach((pp: any) => { if (globalPo.checked[pp.project_id]) count += isMgr ? pp.mgr_count : pp.exec_count; });
                return (
                  <View key={role} style={[styles.sideBoxSmall, isMgr ? { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' } : { backgroundColor: '#f5f3ff', borderColor: '#c4b5fd' }]}>
                    <Text style={[styles.sideTitle, { color: isMgr ? '#065f46' : '#4c1d95', marginBottom: 0 }]}>{isMgr ? 'ส่วนของผู้จัดการ' : 'ส่วนของผู้บริหาร'}</Text>
                    {!can ? (
                      <Text style={styles.noPerm}>🔒 ไม่มีสิทธิ์อนุมัติระดับนี้</Text>
                    ) : totalPending === 0 ? (
                      <Text style={[styles.doneText, { color: isMgr ? '#059669' : '#6d28d9' }]}>✓ อนุมัติครบแล้ว</Text>
                    ) : (
                      <Pressable onPress={() => submitGlobal(role)} disabled={count === 0 || globalPo.saving} style={({ pressed }) => [styles.bigBtnSmall, { backgroundColor: isMgr ? '#10b981' : '#8b5cf6' }, (count === 0 || globalPo.saving) && styles.disabled, pressed && styles.pressed]}>
                        <Text style={styles.bigBtnText}>อนุมัติ {count} รายการ (ในหน้างานที่เลือก)</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          ) : undefined
        }
      >
        {!globalPo ? null : !globalPo.sel ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipBarInner}>
              <Pressable onPress={() => setGlobalPo({ ...globalPo, company: '' })} style={[styles.filterChip, globalPo.company === '' && styles.filterChipOn]}>
                <Text style={[styles.filterChipText, globalPo.company === '' && styles.filterChipTextOn]}>ทุกบริษัท ({globalPo.allTotal} เอกสาร)</Text>
              </Pressable>
              {globalPo.companies.map((c: any) => (
                <Pressable key={c.company_id} onPress={() => setGlobalPo({ ...globalPo, company: String(c.company_id) })} style={[styles.filterChip, globalPo.company === String(c.company_id) && styles.filterChipOn]}>
                  <Text style={[styles.filterChipText, globalPo.company === String(c.company_id) && styles.filterChipTextOn]}>{c.name} ({c.count})</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={[styles.searchBox, { marginHorizontal: 0 }]}>
              <Ionicons name="search" size={15} color="#94a3b8" />
              <TextInput value={globalPo.q} onChangeText={(t) => setGlobalPo({ ...globalPo, q: t })} placeholder="พิมพ์ค้นหาเลขที่เอกสาร PO/AX เช่น ax6906 00029" placeholderTextColor="#94a3b8" style={styles.searchInput} autoCorrect={false} />
            </View>
            {globalPo.loading && globalPo.list.length === 0 ? (
              <LoadingBox text="กำลังค้นหาเอกสาร..." />
            ) : globalPo.list.length === 0 ? (
              <EmptyBox text={globalPo.q ? 'ไม่พบเอกสารที่ค้นหา' : 'ไม่มีเอกสารที่รออนุมัติค้างอยู่ในระบบ'} />
            ) : (
              globalPo.list.map((r: any) => (
                <Pressable key={r.key} onPress={() => void openGlobalDetail(r)} style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}>
                  <View style={styles.kvRow}>
                    <Text style={[styles.listTitle, styles.mono]}>{r.po_number}</Text>
                    <Text style={styles.coTag}>{r.company_label}</Text>
                  </View>
                  <Text style={styles.listSub}>รออนุมัติ {r.item_count} รายการ / กระจาย {r.project_count} หน้างาน</Text>
                </Pressable>
              ))
            )}
            <ListPager page={globalPo.page} pageSize={PENDING_PAGE_SIZE} total={globalPo.total} loading={globalPo.loading} unit="เอกสาร" onChange={(pg) => void loadPending(globalPo.company, globalPo.q, pg)} />
          </>
        ) : (
          <>
            <Pressable onPress={() => setGlobalPo({ ...globalPo, sel: null, detail: null })} style={({ pressed }) => [styles.backBtn, { marginBottom: 8 }, pressed && styles.pressed]}>
              <Ionicons name="arrow-back" size={14} color="#475569" />
              <Text style={styles.backText}>เลือกเอกสารอื่น</Text>
            </Pressable>
            {globalPo.detailLoading || !globalPo.detail ? (
              <LoadingBox text="กำลังดึงข้อมูล..." />
            ) : globalPo.detail.projects.length === 0 ? (
              <EmptyBox text="ไม่พบรายการสำหรับเอกสารนี้" />
            ) : (
              <>
                {globalPo.detail.projects.map((pp: any) => {
                  const on = !!globalPo.checked[pp.project_id];
                  return (
                    <View key={pp.project_id} style={styles.gpProject}>
                      <Pressable
                        disabled={!pp.selectable}
                        onPress={() => setGlobalPo({ ...globalPo, checked: { ...globalPo.checked, [pp.project_id]: !on } })}
                        style={styles.gpProjectHead}
                      >
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={pp.selectable ? '#1e40af' : '#cbd5e1'} />
                        <Text style={styles.gpProjectTitle}>
                          <Text style={styles.gpCode}> {pp.display_code} </Text> | {pp.project_name}
                        </Text>
                      </Pressable>
                      {pp.bills.map((b: any) => (
                        <Text key={b.id} style={styles.listSub}>{b.editable ? '✏️' : '🔒'} บิล #{b.id} · {b.supplier || '-'} · ฿{fmt(b.total)}</Text>
                      ))}
                      {pp.items.map((it: any) => (
                        <View key={it.item_id} style={styles.gpItem}>
                          <Text style={styles.listTitle}>{it.item_name}</Text>
                          <View style={styles.kvRow}><Text style={styles.kvLabel}>{fmtQty(it.buy_quantity)} × ฿{fmt(it.unit_price)}</Text><Text style={[styles.kvVal, { color: '#059669' }]}>฿{fmt(it.main_total)}</Text></View>
                          <View style={styles.rowWrap}>
                            <Badge text={`ผจก. ${it.mgr_status.text}`} tone={it.mgr_status.approved ? { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' } : { bg: '#fffbeb', border: '#fcd34d', text: '#d97706' }} />
                            <Badge text={`ผบห. ${it.exec_status.text}`} tone={it.exec_status.approved ? { bg: '#f5f3ff', border: '#c4b5fd', text: '#4c1d95' } : { bg: '#fffbeb', border: '#fcd34d', text: '#d97706' }} />
                          </View>
                          {it.subs.map((sub: any, k: number) => (
                            <View key={k} style={styles.subLineRow}>
                              <Text style={styles.subName}>🔧 {sub.name}</Text>
                              <Text style={styles.subVal}>{fmtQty(sub.qty)} × ฿{fmt(sub.unit_price)} = ฿{fmt(sub.total_price)}</Text>
                            </View>
                          ))}
                          {num(it.expense_price) !== 0 ? (
                            <View style={styles.subLineRow}>
                              <Text style={[styles.subName, { color: '#64748b' }]}>ค่าใช้จ่าย: {it.expense_name || 'ค่าใช้จ่ายเพิ่มเติม'}</Text>
                              <Text style={[styles.subVal, { color: '#64748b' }]}>฿{fmt(it.expense_price)}</Text>
                            </View>
                          ) : null}
                          {it.installments.some((x: any) => !x.waiting)
                            ? it.installments.map((inst: any) => (
                              <View key={inst.id} style={styles.instRow}>
                                <View style={styles.kvRow}>
                                  <Text style={styles.instTitle}>📅 งวด {inst.seq}</Text>
                                  <Text style={[styles.kvVal, { color: inst.waiting ? '#f59e0b' : '#7c3aed' }]}>{inst.waiting ? 'รอชำระ' : `฿${fmt(inst.amount)}`}</Text>
                                </View>
                                {!inst.waiting ? (
                                  <Text style={styles.listSub}>ผจก. {inst.cost_approved_by || '⏳ รออนุมัติ'} · ผบห. {inst.exec_approved_by || '⏳ รออนุมัติ'}</Text>
                                ) : null}
                              </View>
                            ))
                            : null}
                        </View>
                      ))}
                    </View>
                  );
                })}
                <View style={[styles.sumBar, { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' }]}>
                  <View style={styles.kvRow}><Text style={[styles.kvLabelBold, { color: '#065f46' }]}>ยอดรวมทั้งหมดใน PO นี้</Text><Text style={[styles.kvValBig, { color: '#064e3b' }]}>฿{fmt(globalPo.detail.po_grand_total)}</Text></View>
                </View>
              </>
            )}
          </>
        )}
      </SheetModal>
    </SafeAreaView>
  );
}

// ====================================================================
// การ์ดสรุป / ปุ่มเครื่องมือ / แถวรวมท้ายตาราง
// ====================================================================

/** การ์ดสรุปโทนกลาง (ไอคอนคราม ตัวเลขสีเข้ม) — ส่ง color/ink เฉพาะการ์ดที่สีมีความหมาย เช่น ส่วนต่าง กำไร/ขาดทุน */
function SumCard({ icon, color = '#6366f1', ink = '#0f172a', label, value, pill, children }: { icon: keyof typeof Ionicons.glyphMap; color?: string; ink?: string; label: string; value: string; pill?: string; children?: React.ReactNode }) {
  return (
    <View style={styles.sumCard}>
      <View style={styles.sumHead}>
        <View style={[styles.sumIcon, { backgroundColor: `${color}1a` }]}>
          <Ionicons name={icon} size={14} color={color} />
        </View>
        <Text style={styles.sumLabel} numberOfLines={2}>{label}</Text>
      </View>
      {pill ? (
        <View style={[styles.sumPill, { backgroundColor: `${color}1f` }]}>
          <Text style={[styles.sumPillText, { color }]}>{pill}</Text>
        </View>
      ) : null}
      <Text style={[styles.sumValue, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {children}
    </View>
  );
}

function SumSub({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.sumSub}>
      <Text style={styles.sumSubLabel}>{label}</Text>
      <Text style={[styles.sumSubVal, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function ToolBtn({ icon, text, count, primary, onPress }: { icon: keyof typeof Ionicons.glyphMap; text: string; count?: number; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.toolBtn, primary && styles.toolBtnPrimary, pressed && styles.pressed]}>
      <Ionicons name={icon} size={15} color={primary ? '#fff' : '#4f46e5'} />
      <Text style={[styles.toolBtnText, primary && styles.toolBtnTextPrimary]} numberOfLines={2}>{text}</Text>
      {count ? (
        <View style={styles.toolCount}>
          <Text style={styles.toolCountText}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function TotalRow({ label, value, color = '#0f172a', note }: { label: string; value: string; color?: string; note?: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.totalVal, { color }]}>{value}</Text>
        {note ? <Text style={styles.totalNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#eef2f7' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  mono: { fontFamily: 'monospace' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  dash: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },

  // ป้าย
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '800', flexShrink: 1 },

  // หัวหน้า
  pageHeader: { margin: 12, marginBottom: 6, borderRadius: 18, borderWidth: 1.5, padding: 14, gap: 6 },
  phTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  backText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  coBox: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  coLogo: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#fff' },
  coLogoPh: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  coShort: { fontSize: 12, fontWeight: '900', color: '#1e293b', textAlign: 'right' },
  coName: { fontSize: 10.5, color: '#64748b', textAlign: 'right', maxWidth: 180 },
  phTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a', marginTop: 4 },
  codeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  codeChipText: { fontSize: 12.5, color: '#4338ca', fontWeight: '700' },
  phLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  phLineText: { flex: 1, fontSize: 12.5, color: '#334155', lineHeight: 18 },
  phLabel: { color: '#6366f1', fontWeight: '800' },
  simRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, padding: 8, borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  simRowOn: { backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  simTitle: { fontSize: 12.5, fontWeight: '800', color: '#334155' },
  simSub: { fontSize: 11, color: '#64748b' },
  statusArea: { gap: 8, marginTop: 6 },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#86efac', backgroundColor: '#f0fdf4', borderRadius: 12, padding: 10 },
  stampCancel: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  stampTitle: { fontSize: 14, fontWeight: '900', color: '#15803d' },
  stampMeta: { fontSize: 11.5, color: '#475569', marginTop: 2 },
  pjBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  pjBtnClose: { backgroundColor: '#10b981' },
  pjBtnCancel: { backgroundColor: '#ef4444' },
  pjBtnUndo: { backgroundColor: '#f97316' },
  pjBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  simBanner: { flexDirection: 'row', gap: 10, marginHorizontal: 12, marginBottom: 6, padding: 12, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  simBannerTitle: { fontSize: 13, fontWeight: '900', color: '#b45309' },
  simBannerText: { fontSize: 12, color: '#9a3412', marginTop: 3, lineHeight: 17 },
  simBannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fcd34d', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  simBannerBtnText: { fontSize: 12, fontWeight: '800', color: '#d97706' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { flex: 1, color: '#b91c1c', fontSize: 12.5, fontWeight: '700' },

  // การ์ดสรุป
  sumGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 12, rowGap: 8, marginTop: 4 },
  sumCard: { width: '48.8%', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 11, gap: 3 },
  sumHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sumIcon: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  sumLabel: { flex: 1, fontSize: 11.5, fontWeight: '700', color: '#64748b' },
  sumValue: { fontSize: 16, fontWeight: '900', marginTop: 2 },
  sumPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  sumPillText: { fontSize: 10.5, fontWeight: '800' },
  sumSub: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  sumSubLabel: { fontSize: 10.5, color: '#94a3b8', flexShrink: 1 },
  sumSubVal: { fontSize: 10.5, fontWeight: '800', color: '#475569' },
  meter: { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginTop: 3 },
  meterFill: { height: 6, borderRadius: 3 },

  panel: { marginHorizontal: 12, marginTop: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, gap: 8 },
  panelTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  mutedPill: { fontSize: 12, color: '#64748b', backgroundColor: '#f1f5f9', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  ordererChipBig: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  ordererChipBigText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 12, rowGap: 8, marginTop: 10 },
  toolBtn: { width: '48.8%', minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  toolBtnPrimary: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  toolBtnText: { color: '#334155', fontSize: 12, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  toolBtnTextPrimary: { color: '#fff' },
  toolCount: { backgroundColor: '#eef2ff', borderRadius: 999, minWidth: 20, paddingHorizontal: 6, alignItems: 'center' },
  toolCountText: { color: '#4338ca', fontSize: 11, fontWeight: '900' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 10, marginBottom: 4, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#0f172a', padding: 0 },

  // หัวหมวด + การ์ดรายการ
  // แยกการ์ดให้ชัด: เว้นระยะ 14 + เงา + แถบสีซ้าย (คราม = สินค้า, เหลือง = ค่าใช้จ่าย) + หัวการ์ดพื้นเทา
  groupBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 22, backgroundColor: '#4f46e5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  groupText: { flex: 1, color: '#fff', fontSize: 13.5, fontWeight: '800' },
  groupCount: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  groupCountText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  itemCard: {
    marginHorizontal: 12,
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe3ec',
    borderLeftWidth: 4,
    // ไม่ใส่ overflow hidden — บน iOS จะตัดเงาทิ้ง หัวการ์ดจึงโค้งมุมเอง
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#f8fafc', borderTopLeftRadius: 10, borderTopRightRadius: 13, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10 },
  itemNo: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 6, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  itemNoText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  itemName: { fontSize: 14.5, fontWeight: '800', color: '#0f172a', lineHeight: 21 },
  itemModel: { fontSize: 11.5, color: '#64748b' },
  itemType: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  itemTypeText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  itemBody: { padding: 12, gap: 12 },
  expBox: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 10, gap: 5 },
  expRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  expBudget: { fontSize: 11.5, fontWeight: '700', color: '#334155' },
  expUsed: { fontSize: 11.5, fontWeight: '700', color: '#b45309' },
  expTrack: { height: 8, backgroundColor: '#fef3c7', borderRadius: 4, overflow: 'hidden' },
  expFill: { height: 8, backgroundColor: '#f59e0b' },
  expRemain: { textAlign: 'right', fontSize: 12, fontWeight: '800' },
  ghostChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  ghostChipText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  section: { gap: 6 },
  sectionLine: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  sectionLabel: { fontSize: 11.5, fontWeight: '800', color: '#64748b' },
  sectionHint: { fontSize: 10.5, fontWeight: '600', color: '#94a3b8' },
  apprRow: { flexDirection: 'row', gap: 10 },
  apprDivider: { width: 1, backgroundColor: '#f1f5f9' },
  apprCol: { flex: 1, gap: 5 },
  apprTitle: { fontSize: 11.5, fontWeight: '800', color: '#64748b' },
  apprBox: { borderWidth: 1, borderRadius: 9, padding: 7, gap: 3 },
  apprNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  apprName: { fontSize: 11.5, fontWeight: '800', flexShrink: 1 },
  apprCount: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, backgroundColor: '#fff' },
  apprCountText: { fontSize: 10, fontWeight: '800' },
  apprTime: { fontSize: 10.5, fontWeight: '600' },
  cancelMini: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderStyle: 'dashed', borderColor: '#fca5a5', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  cancelMiniText: { fontSize: 10.5, fontWeight: '800', color: '#dc2626' },
  pendingBox: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#fffbeb', borderWidth: 1, borderStyle: 'dashed', borderColor: '#fcd34d', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  pendingText: { fontSize: 11, fontWeight: '800', color: '#d97706' },
  poBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  poBoxRefunded: { backgroundColor: '#f8fafc', shadowOpacity: 0, elevation: 0 },
  poBoxIcon: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  poBoxNo: { flex: 1, fontFamily: 'monospace', fontSize: 15, fontWeight: '900', color: '#0f172a', letterSpacing: 0.3 },
  poBoxNoRefunded: { color: '#94a3b8', textDecorationLine: 'line-through' },
  poBoxTag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, maxWidth: 120 },
  poBoxTagText: { fontSize: 11, fontWeight: '800' },
  billApproveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, minHeight: 38 },
  billApproveBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  billApproveBtnPn: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },

  payCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderRadius: 10, padding: 9, gap: 3 },
  payTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingBottom: 5, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  payPn: { flexShrink: 1, fontFamily: 'monospace', fontSize: 13.5, fontWeight: '900', color: '#0f172a' },
  payState: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  payStateText: { fontSize: 10.5, fontWeight: '800' },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  payDiffRow: { borderTopWidth: 1, borderTopColor: '#e2e8f0', borderStyle: 'dashed', marginTop: 3, paddingTop: 3 },
  payLbl: { fontSize: 11.5, color: '#64748b', fontWeight: '600' },
  payVal: { fontSize: 12.5, fontWeight: '800' },
  payComps: { flexShrink: 1, textAlign: 'right', fontSize: 11, fontWeight: '800' },
  payFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  payDate: { fontSize: 10.5, color: '#94a3b8' },
  paySites: { fontSize: 11, fontWeight: '800', color: '#2563eb', textDecorationLine: 'underline' },
  payLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', marginTop: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3 },
  payLinkText: { fontSize: 11, fontWeight: '800', color: '#4f46e5' },
  payTapHint: { textAlign: 'center', fontSize: 11, color: '#4f46e5', fontWeight: '700', marginTop: 4 },

  // ตารางตัวเลขในการ์ด
  numTable: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, overflow: 'hidden' },
  numHead: { backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 5 },
  numHeadFirst: { borderTopWidth: 0 },
  numHeadText: { fontSize: 11, fontWeight: '800', color: '#475569', letterSpacing: 0.2 },
  numRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 8, minHeight: 38 },
  numLabel: { flex: 1, fontSize: 12.5, color: '#64748b' },
  numValCol: { alignItems: 'flex-end', flexShrink: 1, gap: 2 },
  numVal: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', fontVariant: ['tabular-nums'] },
  numValSoft: { color: '#94a3b8', fontWeight: '700' },
  numDiff: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 9 },
  numDiffLabel: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  strike: { fontSize: 11, color: '#94a3b8', textDecorationLine: 'line-through' },
  strikeInline: { color: '#94a3b8', textDecorationLine: 'line-through', fontSize: 12 },
  simQty: { fontSize: 13, fontWeight: '800', color: '#059669' },
  claimTag: { fontSize: 11, fontWeight: '800', color: '#dc2626' },
  returnTag: { fontSize: 11, fontWeight: '800', color: '#be123c' },
  claimSub: { fontSize: 11, color: '#94a3b8' },
  splitTag: { fontSize: 10.5, color: '#64748b', fontWeight: '700' },
  usedTag: { fontSize: 10.5, color: '#64748b', fontWeight: '800' },
  hiddenTag: { fontSize: 10.5, color: '#64748b' },
  diffVal: { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  diffPct: { fontSize: 11, color: '#64748b', fontWeight: '700' },
  itemFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  ordererChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  ordererChipText: { fontSize: 11.5, color: '#334155', fontWeight: '600' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  editBtnText: { fontSize: 11.5, fontWeight: '800', color: '#4f46e5' },

  // ท้ายตาราง
  totalCard: { margin: 12, marginTop: 22, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', borderTopWidth: 4, borderTopColor: '#4f46e5', padding: 14, gap: 8 },
  totalTitle: { fontSize: 15, fontWeight: '900', color: '#1e1b4b' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  totalLabel: { fontSize: 12.5, color: '#475569', flexShrink: 1 },
  totalVal: { fontSize: 14, fontWeight: '900' },
  totalNote: { fontSize: 10.5, color: '#dc2626' },
  totalDiff: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 10, marginTop: 4 },
  totalDiffLabel: { fontSize: 13, fontWeight: '800', color: '#1e1b4b' },
  totalDiffVal: { fontSize: 18, fontWeight: '900' },
  totalPill: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  totalPillText: { fontSize: 12, fontWeight: '800', color: '#64748b' },

  // เลือกหน้างาน
  pickHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  pickTitle: { flex: 1, fontSize: 15, fontWeight: '900', color: '#0f172a' },
  chipBar: { gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  chipBarInner: { gap: 6, paddingVertical: 4 },
  filterChip: { borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  filterChipOn: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  filterChipTextOn: { color: '#fff' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  toggleText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 6, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 10 },
  pickRowCurrent: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  pickRowCancel: { opacity: 0.6 },
  pickCode: { minWidth: 46, alignItems: 'center' },
  pickCodeText: { fontSize: 15, fontWeight: '900', color: '#1e293b' },
  pickCurrent: { fontSize: 9.5, color: '#4f46e5', fontWeight: '800' },
  pickCus: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  pickName: { fontSize: 11.5, color: '#64748b' },
  pickCo: { color: '#4f46e5', fontWeight: '800' },
  pickFoot: { textAlign: 'center', color: '#94a3b8', fontSize: 11.5, paddingVertical: 14 },

  stateBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36, gap: 10, paddingHorizontal: 20 },
  stateText: { color: '#64748b', fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(15,23,42,0.92)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  toastText: { flex: 1, color: '#fff', fontSize: 12.5, fontWeight: '700' },

  // ป็อปอัป
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 14 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', maxHeight: '88%' },
  modalCardTall: { height: '88%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  modalHeadTitle: { flex: 1, color: '#fff', fontSize: 14.5, fontWeight: '800' },
  modalCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  modalScroll: { flexShrink: 1 },
  modalBody: { padding: 14, gap: 8, paddingBottom: 20 },
  modalFooter: { padding: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  modalBtnRow: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnGhost: { backgroundColor: '#f1f5f9' },
  modalBtnGhostText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  modalBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  listRow: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, gap: 4 },
  listTitle: { fontSize: 13, fontWeight: '800', color: '#1e293b', flexShrink: 1 },
  listSub: { fontSize: 11.5, color: '#64748b', lineHeight: 16 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  kvLabel: { fontSize: 11.5, color: '#64748b', flexShrink: 1 },
  kvLabelBold: { fontSize: 12.5, fontWeight: '800', color: '#334155', flexShrink: 1 },
  kvVal: { fontSize: 12.5, fontWeight: '800', color: '#0f172a' },
  kvValBig: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  sumBar: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, gap: 4 },
  poTag: { fontFamily: 'monospace', fontSize: 11, fontWeight: '800', color: '#1e40af', backgroundColor: '#e0e7ff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  coTag: { fontSize: 11, fontWeight: '800', color: '#4f46e5' },
  noteBox: { fontSize: 11.5, color: '#c2410c', backgroundColor: '#fff7ed', borderWidth: 1, borderStyle: 'dashed', borderColor: '#fdba74', borderRadius: 8, padding: 6 },
  hint: { fontSize: 11.5, color: '#64748b', lineHeight: 17 },
  subHead: { fontSize: 12.5, fontWeight: '800', color: '#475569', marginTop: 4 },
  popItemName: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  infoBand: { borderLeftWidth: 5, borderRadius: 10, padding: 10, gap: 3 },
  infoBandText: { fontSize: 12.5, color: '#334155' },
  infoBandSub: { fontSize: 11, color: '#64748b', marginTop: 4 },
  infoBandBig: { fontSize: 18, fontWeight: '900', color: '#dc2626' },
  costNote: { fontSize: 12, color: '#7c3aed' },
  subGrid: { flexDirection: 'row', gap: 6 },
  subCol: { flex: 1, borderRadius: 8, padding: 7, gap: 2 },
  subColHead: { fontSize: 11, fontWeight: '900' },
  subLine: { fontSize: 11.5, color: '#334155' },
  subBox: { backgroundColor: '#fff7ed', borderWidth: 1, borderStyle: 'dashed', borderColor: '#fed7aa', borderRadius: 8, padding: 7, gap: 2 },
  subBoxTitle: { fontSize: 10.5, fontWeight: '800', color: '#c2410c' },
  subName: { flex: 1, fontSize: 11.5, color: '#d97706' },
  subVal: { fontSize: 11.5, color: '#b45309', fontWeight: '700' },
  subLineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, backgroundColor: '#fffcf8', borderRadius: 6, padding: 5 },
  tabRow: { flexDirection: 'row', gap: 8 },
  tabBtn: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, backgroundColor: '#fff' },
  tabText: { fontSize: 12.5, fontWeight: '800', color: '#64748b' },
  bomCard: { borderWidth: 1, borderColor: '#a7f3d0', borderLeftWidth: 5, borderLeftColor: '#10b981', backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, gap: 5 },
  bomNo: { fontFamily: 'monospace', fontSize: 13, fontWeight: '900', color: '#065f46' },
  bomDate: { fontSize: 11.5, color: '#059669', fontWeight: '700' },
  bomLine: { fontSize: 12.5, color: '#064e3b' },
  smallBtn: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4 },
  smallBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  docRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, backgroundColor: '#fff' },
  docRowOn: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },

  poItem: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, gap: 4 },
  instRow: { backgroundColor: '#faf5ff', borderRadius: 8, padding: 7, gap: 4 },
  instTitle: { fontSize: 12, fontWeight: '800', color: '#7c3aed' },
  instPendingBtn: { backgroundColor: '#fffbeb', borderWidth: 1, borderStyle: 'dashed', borderColor: '#f59e0b', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  instPendingText: { fontSize: 11, fontWeight: '800', color: '#b45309' },
  instPendingPlain: { fontSize: 11, fontWeight: '800', color: '#d97706' },
  remark: { fontSize: 12, color: '#d97706', fontWeight: '600' },
  sideBox: { borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'stretch' },
  sideBoxSmall: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  sideTitle: { fontSize: 12.5, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  sideName: { fontSize: 13.5, fontWeight: '800', textAlign: 'center' },
  sideTime: { fontSize: 11.5, fontWeight: '700', textAlign: 'center' },
  bigBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  bigBtnSmall: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  bigBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  noPerm: { textAlign: 'center', color: '#94a3b8', fontSize: 12, fontWeight: '600', paddingVertical: 6 },
  doneText: { textAlign: 'center', fontSize: 13, fontWeight: '800', paddingVertical: 6 },
  billBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f59e0b', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  billBtnLocked: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  billBtnText: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '800' },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingVertical: 9, backgroundColor: '#fff' },
  outlineBtnText: { color: '#dc2626', fontSize: 12.5, fontWeight: '800' },
  gpProject: { borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 12, padding: 10, gap: 6, backgroundColor: '#f8fbff' },
  gpProjectHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gpProjectTitle: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#1e40af' },
  gpCode: { fontFamily: 'monospace', fontWeight: '900', backgroundColor: '#dbeafe' },
  gpItem: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 10, padding: 8, gap: 4 },

  fieldLabel: { fontSize: 12, fontWeight: '800', color: '#334155', marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, fontWeight: '700', color: '#0f172a', backgroundColor: '#f8fafc' },
  textarea: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, minHeight: 80, textAlignVertical: 'top', fontSize: 13, color: '#0f172a', backgroundColor: '#f8fafc' },
  formError: { color: '#dc2626', fontSize: 12, fontWeight: '700' },
  cancelTarget: { fontSize: 13, color: '#334155', lineHeight: 20 },
  warnText: { fontSize: 12, color: '#b45309' },
});
