/**
 * site_item_check.tsx — เช็คของส่ง (พอร์ตจากหน้าเว็บ site_item_check.php + js/site_item_check.js ครบทั้งหน้า)
 * ------------------------------------------------------------------
 * ผู้ใช้สั่ง 10 พ.ย. 69 "ทำหน้าแอปครบทั้งหน้า" · เปิดจากหน้าแจ้งจัดงาน (รับงาน/เปิดงาน) หรือเลือกหน้างานในหน้านี้
 *  - ข้อมูล/บันทึกผ่าน tjc-api-server/mobile_api/modules/site_item_check_API_mobile.php
 *    ทุกคำสั่งเรียกฟังก์ชันชุดเดียวกับหน้าเว็บ (includes/site_item_check_*.php) ผลที่บันทึกจึงเหมือนกดจากเว็บ
 *  - ตรรกะทั้งหมดอยู่ในคลาส Board (ยกจาก js/site_item_check.js ทีละฟังก์ชัน ชื่อเดิม) ส่วนหน้าจออยู่ท้ายไฟล์
 *    บรรทัดรวมชื่อเดียวกัน · กล่องจัด/ขึ้นรายรอบ + ติ๊กครบ · 80% · หมายเหตุ · แก้ชื่อ · รายการย่อย · รูปจัดของ 3 รูป
 *    สถานะจัดงานรายรอบ · ข้อมูลใบส่ง · ใบเช็คของ · ผู้จัดของ + ประวัติแก้ · แถบบันทึก + ยืนยัน · ยกเลิกการแก้ไข
 *    อัปเดตอัตโนมัติทุก 2 วิ (ช่องชนขึ้นป้ายเลือกค่า) · กล่องจัดบันทึกเอง (ร่าง) · ช่องขึ้นเห็นตามกัน · ใครกำลังใช้หน้านี้
 *  - ต่างจากเว็บ: พิมพ์ใบเช็คของ = บันทึกว่าพิมพ์แล้ว + แชร์เป็นไฟล์ HTML ไปเปิดพิมพ์ (แอปไม่มีโมดูลพิมพ์)
 *    พิมพ์ใบส่งเปิดหน้าเว็บ · หน้าคนขับเปิดหน้า DriverConfirmItems ในแอป · กล้องถ่ายต่อกันด้วยกล้องของเครื่อง (ยกเลิก = พอแล้ว)
 *  - สิทธิ์: หน้าเว็บนี้ใช้ได้ทุกคนที่ล็อกอิน · ชื่อผู้ทำรายการเซิร์ฟเวอร์อ่านจาก user_id
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { type ComponentRef, memo, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { Easing, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateField, TimeField } from '../../components/DateTimeField';
import { useScreenInsets } from '../../components/useScreenInsets';
import { API_BASE, API_MODULES } from '../../constants/config';
import { useAuth } from '../_layout';

const SIC_API_URL = `${API_MODULES}/site_item_check_API_mobile.php`;
// รอบที่มี 1..N ตามหน้างาน (ผู้ใช้สั่ง 13 พ.ย. 69 รอบ 4 5 6 เพิ่มมาเรื่อย ๆ ไม่ฟิค) · ตั้งใหม่ทุกครั้งที่โหลดหน้า (Board.load จาก page.rounds)
let ROUNDS: number[] = [1, 2, 3];
const roundsOf = (rounds: any): number[] => {
  const n = Math.max(3, ...Object.keys(rounds || {}).map(Number).filter((r) => Number.isInteger(r) && r > 0));
  return Array.from({ length: n }, (_, i) => i + 1);
};
const MAX_QTY = 9999999;
const SYNC_MS = 2000;
const AUTO_MS = 1500;
const LIVE_MS = 700;
const ROUND_LOCK_TEXT = 'รอบนี้จัดส่งบันทึกส่งแล้ว แก้ไม่ได้';
// load_at = วันที่ขึ้นของ · job_note = หมายเหตุจัดงาน (ไม่อยู่ในใบส่งของ แก้อย่างเดียวไม่ต้องเขียนใบส่งใหม่ · headDoChanged)
const HEAD_KEYS = ['transport', 'driver', 'helper', 'vehicle', 'receiver', 'organizer', 'deliver_at', 'load_at', 'job_note', 'note'] as const;
const JOB_NOTE_MAX = 500; // = SIC_JOB_NOTE_MAX
const EMPTY_TEXT: Record<string, string> = { todo: 'ไม่มีรายการค้างแล้ว', done: 'ยังไม่มีรายการที่ติ๊กครบ', all: 'ไม่มีรายการ' };
const JOB_STATUS_TEXT: Record<string, string> = { waiting: 'รอจัด', packing: 'กำลังจัด', packed: 'รอขึ้น', loading: 'กำลังขึ้นรถ', loaded: 'ขึ้นครบแล้ว' };
const STOCK_BLOCKED_TEXT: Record<string, string> = { parts: 'ซื้อเป็นชิ้นส่วน เบิกเองที่หน้าโครงการ', split: 'แยกทุนส่วนประกอบ เบิกเองที่หน้าโครงการ' };
const SHEET_BASIS =
  'ค้าง = จำนวนตาม ปร. (ติ๊ก 80% ใช้ยอด 80%) หักยอดที่ส่งแล้ว รวมของที่ตีกลับ · ไม่แสดงรายการที่ครบแล้ว · หมายเหตุแสดงบิลตั้งแต่รอบนี้ขึ้นไปที่ยังส่งไม่ครบ · ของส่งคลังแสดงเมื่อคลังรับแล้ว';

// โทนเดียวกับหน้าแจ้งจัดงาน (site_job_board.tsx): พื้นขาวอมฟ้า การ์ดขาวเงานุ่ม น้ำเงินหลักเข้ากับแถบหัวแอป
const C = {
  primary: '#2459EA',
  primarySoft: '#EEF3FF',
  primaryLine: '#D3E0FF',
  text: '#0A1222',
  soft: '#5A667D',
  muted: '#8A95AA',
  faint: '#BCC4D2',
  line: '#E4E9F2',
  lineSoft: '#EEF1F7',
  surface2: '#F6F8FC',
  track: '#EDF1F7',
  bg: '#F4F6FB',
  ok: '#0E9F6E',
  okBg: '#E9FBF3',
  warn: '#C2620A',
  warnBg: '#FFF6E5',
  bad: '#E8335A',
  badBg: '#FFF0F3',
  info: '#0A8BD6',
  infoBg: '#EAF7FF',
  live: '#0284C7',
  liveBg: '#E0F2FE',
};
const BG_GRAD = ['#E8EFFF', '#F2F5FC', '#F4F6FB'] as const;
// สีรอบ (.r1/.r2/.r3 ของหน้าเว็บ — ฟ้าน้ำทะเล / ส้ม / เขียว) · grad = ป้ายรอบไล่สี
const ROUND_COLOR: Record<number, { c: string; tint: string; grad: [string, string] }> = {
  1: { c: '#0891B2', tint: '#E8F7FA', grad: ['#3DD5F3', '#0891B2'] },
  2: { c: '#EA580C', tint: '#FFF2E8', grad: ['#FFB067', '#F2620F'] },
  3: { c: '#16A34A', tint: '#E9F8EF', grad: ['#5EE38E', '#16A34A'] },
};
// รอบ 4 ขึ้นไปวนชุดสีนี้ (เดียวกับหน้าเว็บ SIC_ROUND_PALETTE) ม่วง / ชมพู / น้ำเงิน / น้ำตาลทอง / เทาฟ้า / บานเย็น
const ROUND_PALETTE: { c: string; tint: string; grad: [string, string] }[] = [
  { c: '#7C3AED', tint: '#F1EAFE', grad: ['#B69CFF', '#7C3AED'] },
  { c: '#DB2777', tint: '#FDEAF3', grad: ['#F58BB8', '#DB2777'] },
  { c: '#2563EB', tint: '#E8EFFE', grad: ['#8FB0FF', '#2563EB'] },
  { c: '#A16207', tint: '#FBF2DE', grad: ['#E6B85C', '#A16207'] },
  { c: '#475569', tint: '#ECEFF3', grad: ['#A3B1C4', '#475569'] },
  { c: '#C026D3', tint: '#FAE9FC', grad: ['#E58AF0', '#C026D3'] },
];
const roundColor = (round: number) => ROUND_COLOR[round] ?? ROUND_PALETTE[Math.max(0, round - 4) % ROUND_PALETTE.length];
// สถานะจัด/ขึ้นของรอบ — ชุดสีเดียวกับแท็บสถานะหน้าแจ้งจัดงาน
const JOB_STATUS_COLOR: Record<string, { c: string; bg: string }> = {
  waiting: { c: C.soft, bg: C.track },
  packing: { c: '#DB7A00', bg: '#FFF7E6' },
  packed: { c: C.info, bg: C.infoBg },
  loading: { c: '#7446F5', bg: '#F4F0FF' },
  loaded: { c: C.ok, bg: C.okBg },
};
// เลื่อนก้อนตัวเลือกแบบ ease-out ไม่เด้ง (แบบเดียวกับหน้าแจ้งจัดงาน)
const SLIDE = { duration: 260, easing: Easing.out(Easing.cubic) };
const SEG_PAD = 3;

// -------------------- Types --------------------

interface Member { id: number; name: string; qty: number; site: number; r: number[]; back: number; done: number; pk: number[]; pd: number; p80: number; stock: number }
interface Photo { id: number; src: string; thumb: string; by: string; at: string }
interface PhotoAdd { uri: string; key: string }
interface PhotoEdit { adds: PhotoAdd[]; dels: number[] }
interface PhotoCarry { sub: number; round: number; adds: PhotoAdd[] }
interface PoLine { no: string; cond: string; cond_po?: string; qty_text: string; tone: string; auto: boolean; wh: boolean; recv: [string, number][]; at: string; qty: number }
interface StockInfo { src: number; auto: number; blocked: string; no_cost: boolean }
interface LoadVal { r: string[]; d: number }
interface LiveEntry { r: string[]; d: number; b: LoadVal; by: string }
interface SubSaved { name: string; qty: string; unit: string; r: string[]; p: string[]; done: number; pd: number; stock: number; note: string }
type Head = Record<(typeof HEAD_KEYS)[number], string>;
interface Conflict { key: string; round: number; text: string; useTheirs: () => void; still: () => boolean }
interface DraftMap { items: Record<string, any>; subs: Record<string, any> }
interface Presence { name: string; since: string }
/** รับของคืนจากหน้างาน (includes/site_item_check_returns.php ฝั่งเว็บ · รูปแบบเดียวกับ data-returns) */
interface ReturnItem {
  id: number; item: number; name: string; unit: string; qty: number; reason: string; status: string; by: string; at: string;
  target_round: number; target_do: string; do: string; round: number; picked_qty: number; picked_by: string; picked_at: string;
}
interface ReturnsState { items: Record<string, number>; waiting: Record<string, number>; list: ReturnItem[]; target: { round: number; do: string } | null }
const readReturns = (r: any): ReturnsState => ({
  items: r?.items && typeof r.items === 'object' ? r.items : {},
  waiting: r?.waiting && typeof r.waiting === 'object' ? r.waiting : {},
  list: Array.isArray(r?.list) ? r.list : [],
  target: r?.target && r.target.do ? { round: Number(r.target.round) || 0, do: String(r.target.do) } : null,
});
interface Company { name: string; short: string; logo: string; color: string; ink: string; stops: string[] }
interface ProjectInfo { id: number; code: string; site: string; name: string; customer: string; stock_site: boolean; company: Company | null }
interface Transport { drivers: string[]; cars: { plate: string; label: string }[]; users: string[] }
interface RoundCard {
  round: number;
  do: string;
  hasDo: boolean;
  locked: boolean;
  missing: boolean;
  source: string;
  mismatch: boolean;
  head: Head;
  savedHead: Head;
  printed: string;
  jobOn: boolean;
  jobSaved: boolean;
  jobText: string;
  jobAt: string;
  done: boolean; // ยืนยันจบรอบแล้ว (finish_round · ผู้ใช้สั่ง 13 พ.ย. 69)
  doneText: string;
}

interface TrBase {
  key: string;
  load: string[];
  pack: string[];
  pendingDone: number;
  pendingPack: number;
  note: string;
  photos: Record<number, Photo[]>;
  photoEdit: Record<number, PhotoEdit | undefined>;
  shared: LoadVal | null;
  liveBy: string;
  conflicts: Conflict[];
  flash: number[];
  packState: '' | 'saving' | 'saved';
  autoFailed: boolean;
  v: number;
}
interface Row extends TrBase {
  isSub: false;
  id: number;
  ids: number[];
  sec: string;
  group: Group;
  name: string;
  nameInput: string;
  nameSaved: string;
  renaming: boolean;
  unit: string;
  qty: number;
  where: string;
  parts: [string, number][];
  partsText: string;
  ships: boolean;
  site: number;
  avail: number;
  members: Member[];
  stock: StockInfo | null;
  back: [number, string, number][];
  doneText: string;
  marks: any;
  skipReason: string;
  namesDiffer: boolean;
  multiUnit: boolean;
  hint: string;
  otherDo: number;
  po: PoLine[];
  savedLoad: string[];
  savedPack: string[];
  doneRound: number;
  packRound: number;
  p80: boolean;
  p80Saved: boolean;
  noteSaved: string;
  subs: Sub[];
}
interface Sub extends TrBase {
  isSub: true;
  id: number;
  parent: Row;
  name: string;
  qty: string;
  unit: string;
  deleted: boolean;
  saved: SubSaved | null;
  doneText: string;
  marks: any;
}
type Tr = Row | Sub;
interface Group { sec: string; order: number; name: string; search: string; rows: Row[] }
interface ChangeLine { name: string; where: string; text: string }
interface Changes {
  rows: any[];
  notes: any[];
  names: any[];
  rounds: Record<string, Head>;
  rounds_saved: Record<string, Head>; // หัวรอบตอนโหลด · เซิร์ฟเวอร์ทับเฉพาะช่องที่เราแก้
  round_base: Record<string, string>;
  header: Record<string, string>;
  subs: any[];
  jobs: Record<string, { on: string; base: string }>;
  live_clear: string[];
  confirm: number;
}
type ListItem = { type: 'sec'; sec: string; key: string } | { type: 'row'; row: Row; key: string } | { type: 'sub'; sub: Sub; key: string };

// -------------------- กติกาเดียวกับหน้าเว็บ --------------------

const round2 = (n: number) => Math.round(n * 100) / 100;
/** ยอดที่ติ๊กครบแล้วเติมให้: ที่ขาดจากเป้า · ถึงเป้า 80% แล้ว = ส่วนที่เหลือจนครบจำนวนเต็ม (เหมือน remainFor ในหน้าเว็บ) */
const remainFor = (target: number, full: number, others: number) => {
  const remain = Math.max(round2(target - others), 0);
  return remain > 0 || full <= others ? remain : round2(full - others);
};
// ติ๊กครบของบรรทัดรวม → ค่าของรายการ 1 รายการ: ครบไปแล้วในรอบก่อนคงรอบเดิม · เอาติ๊กออกล้างเฉพาะรายการที่ครบรอบเดียวกับบรรทัด
const memberDone = (old: number, next: number, saved: number) => (next > 0 ? (old > 0 && old < next ? old : next) : old === saved ? 0 : old);
const fmt = (n: number | string) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const str = (v: any) => (v === null || v === undefined ? '' : String(v));
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// กติกาเดียวกับ sic_name_key() ใน includes/site_item_check_lib.php
const keyOf = (s: string) => s.trim().toLowerCase().replace(/[×＊*]/g, 'x').replace(/\s+/g, '');
const unitText = (raw: string) => (raw && raw !== '-' ? ' ' + raw : '');
const sameJson = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

// ค่าช่องจำนวนแบบเดียวกับ sic_parse_qty()/sic_input_value() ใน PHP: '' = ยังไม่ส่ง, null = พิมพ์ผิด
function normQty(value: string): string | null {
  const text = String(value ?? '').replace(/,/g, '').trim();
  if (text === '') return '';
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > MAX_QTY) return null;
  return round2(n) > 0 ? String(round2(n)) : '';
}
// ค่ารอบในรูปแบบที่ส่งไปบันทึก ('' = ยังไม่ส่ง) แบบเดียวกับ sic_input_value()
const qtyText = (value: number) => (value > 0 ? String(round2(value)) : '');
const sumOf = (members: Member[], key: 'r' | 'pk', round: number) => normQty(String(round2(members.reduce((t, m) => t + (Number(m[key][round - 1]) || 0), 0)))) || '';
// ครบ = ทุกรายการครบแล้ว ใช้รอบล่าสุด (กติกาเดียวกับ PHP)
const mergedDone = (members: Member[], key: 'done' | 'pd' = 'done') => (members.every((m) => m[key] > 0) ? Math.max(...members.map((m) => m[key])) : 0);

function thaiDateTime(value: string) {
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  return m ? m[3] + '/' + m[2] + '/' + (Number(m[1]) + 543) + (m[4] ? ' ' + m[4] + ':' + m[5] : '') : '';
}
// วันเวลาสั้น 09/11/69 14:05 (พ.ศ. 2 หลัก)
function shortDateTime(value: string) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + String(Number(m[1]) + 543).slice(2) + ' ' + m[4] + ':' + m[5] : '';
}
const historyWho = (by: string, at: string) => [by, shortDateTime(at)].filter(Boolean).join(' ');
// "ว่าง → 6 เมตร" · "5 → 6 เมตร" · "5 เมตร → ว่าง"
function historyChange(from: number, to: number, unit: string) {
  const a = from > 0 ? fmt(from) : 'ว่าง';
  const b = to > 0 ? fmt(to) + unit : 'ว่าง';
  return (to > 0 || from <= 0 ? a : a + unit) + ' → ' + b;
}
// วันนี้ตามเวลาเครื่อง YYYY-MM-DD (toISOString เป็นเวลา UTC เช้ามืดได้วันของเมื่อวาน)
function todayYmd() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const savedBy = (names: string[] | null) => (names && names.length ? names.join(', ') + ' บันทึก' : 'มีคนบันทึก');
const NAME_PREFIX = /^(นางสาว|นาง|นาย|น\.ส\.|mrs?\.?|ms\.?)\s*/i;
const initialOf = (name: string) => (name.replace(NAME_PREFIX, '').match(/[ก-ฮa-z0-9]/i) || ['?'])[0].toUpperCase();
const hueOf = (name: string) => Array.from(name).reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) % 360, 7);
const avatarColor = (name: string) => `hsl(${hueOf(name)}, 55%, 45%)`;

function readHead(raw: any): Head {
  const src = raw && typeof raw === 'object' ? raw : {};
  const head = {} as Head;
  HEAD_KEYS.forEach((key) => {
    head[key] = str(src[key]).trim();
  });
  if (head.transport !== 'external') head.transport = 'internal';
  // วันเวลาเทียบกันแค่ระดับนาที (ฐานเก็บวินาที ช่องกรอกไม่มี)
  head.deliver_at = head.deliver_at.replace('T', ' ').slice(0, 16);
  head.load_at = head.load_at.slice(0, 10);
  if (head.transport === 'external') head.helper = '';
  return head;
}
// เงื่อนไขเดียวกับ sic_header_missing() ใน includes/site_item_check_delivery.php
function headMissing(head: Head) {
  if (head.transport === 'external') return head.driver === '' ? 'ยังไม่ระบุชื่อคนขับหรือขนส่ง' : '';
  return head.driver === '' || head.vehicle === '' ? 'ยังไม่ระบุคนขับหรือทะเบียนรถ' : '';
}
function headSummary(head: Head) {
  if (head.transport === 'internal' && !head.driver && !head.vehicle && !head.helper) return 'ยังไม่ระบุคนขับและรถ';
  if (head.transport === 'external') return ['รถนอก/ขนส่ง', head.driver || 'ยังไม่ระบุ'].concat(head.vehicle ? ['ทะเบียน ' + head.vehicle] : []).join(' · ');
  return ['รถบริษัท', 'คนขับ ' + (head.driver || '-')].concat(head.helper ? ['คนรถ ' + head.helper] : [], ['ทะเบียน ' + (head.vehicle || '-')]).join(' · ');
}
function headMeta(head: Head) {
  return [head.load_at ? 'ขึ้นของ ' + thaiDateTime(head.load_at) : '', head.deliver_at ? 'ส่ง ' + thaiDateTime(head.deliver_at) : '', head.receiver ? 'ผู้รับ ' + head.receiver : '', head.organizer ? 'ผู้จัดงาน ' + head.organizer : '']
    .filter(Boolean)
    .join(' · ');
}

// ส่วนที่ต้องออกใบส่งจากคลังของแต่ละรอบ · ต้องตรงกับ sic_do_split() ใน includes/site_item_check_delivery.php
function doSplit(values: number[], site: number) {
  let total = 0;
  let before = 0;
  return values.map((value) => {
    total += value;
    const over = Math.max(0, round2(total - site));
    const out = round2(over - before);
    before = over;
    return out;
  });
}

const savedLoadOf = (tr: Tr, i: number) => (tr.isSub ? (tr.saved ? str(tr.saved.r[i]) : '') : tr.savedLoad[i]);
const savedPackOf = (tr: Tr, i: number) => (tr.isSub ? (tr.saved ? str(tr.saved.p[i]) : '') : tr.savedPack[i]);
const savedDone = (tr: Tr) => (tr.isSub ? (tr.saved ? num(tr.saved.done) : 0) : tr.doneRound);
const savedPack = (tr: Tr) => (tr.isSub ? (tr.saved ? num(tr.saved.pd) : 0) : tr.packRound);
const qtyOf = (tr: Tr, round: number) => Number(normQty(tr.load[round - 1])) || 0;
const packOf = (tr: Tr, round: number) => Number(normQty(tr.pack[round - 1])) || 0;
const returnsOf = (tr: Tr): [number, string, number][] => (tr.isSub ? [] : tr.back);
const backQty = (tr: Tr) => returnsOf(tr).reduce((t, e) => t + e[2], 0);
// ยอดที่ถึงหน้างาน: ของตีกลับนับกลับเข้ายอดค้าง
const sentQty = (tr: Tr) => ROUNDS.reduce((t, r) => t + qtyOf(tr, r), 0) - backQty(tr);
const isDone = (row: Row) => row.doneRound > 0;
const trName = (tr: Tr) => (tr.isSub ? tr.name.trim() || 'รายการย่อย' : tr.name);
// ค่าที่ส่งไปบันทึก (ทั้งค่าใหม่และ base) รูปแบบเดียวกับ sic_parse_sub() ใน PHP
const subPayload = (v: SubSaved) => ({
  name: v.name, qty: v.qty || '', unit: v.unit, done: v.done, pd: v.pd, stock: v.stock, note: v.note,
  // ทุกรอบที่มี: r1.. (ขึ้น) pk1.. (จัด)
  ...Object.fromEntries(ROUNDS.flatMap((round, i) => [['r' + round, v.r[i] || ''], ['pk' + round, v.p[i] || '']])),
});

class ApiError extends Error {
  http: number;
  data: any;
  constructor(message: string, http: number, data: any) {
    super(message);
    this.http = http;
    this.data = data;
  }
}

// -------------------- Board: ตรรกะของหน้า (js/site_item_check.js) --------------------

interface Hooks {
  api: (action: string, fields: Record<string, string | number> | FormData) => Promise<any>;
  toast: (message: string, long?: boolean) => void;
  changed: () => void;
  reload: (message: string) => void;
  idle: () => boolean;
}

class Board {
  hooks: Hooks;
  me = '';
  project!: ProjectInfo;
  extraPending = 0;
  photoMax = 3;
  struct = '';
  groups: Group[] = [];
  rows: Row[] = [];
  rowOfItem = new Map<number, Row>();
  rounds: Record<number, RoundCard> = {};
  others: { no: string; lines: number; confirmed: boolean }[] = [];
  transport: Transport = { drivers: [], cars: [], users: [] };
  live: Record<string, LiveEntry> = {};
  drafts: DraftMap = { items: {}, subs: {} };
  myDrafts = 0;
  presence: Presence[] = [];
  syncStamp = '';
  syncLog = 0;
  staleBy: string[] | null = null;
  sortMode: 'name' | 'order' = 'name';
  saving = false;
  ctx = 0;
  uid = 0;
  myPackTouched = new Set<string>();
  autoTimers = new Map<Tr, ReturnType<typeof setTimeout>>();
  autoBusy = 0;
  autoChain: Promise<void> = Promise.resolve();
  liveTimers = new Map<Tr, ReturnType<typeof setTimeout>>();
  liveBusy = 0;
  liveSeq = 0;
  liveSent = false;
  liveChain: Promise<void> = Promise.resolve();
  liveToastAt = 0;
  syncTimer: ReturnType<typeof setTimeout> | null = null;
  syncBusy = false;
  syncFails = 0;
  syncOk = false;
  syncToastAt = 0;
  syncClashes = 0;
  syncRunning = false;
  confirmOpen = false;
  photoBusy = false;
  disposed = false;
  reloadAsked = false;
  canEditRound = false; // สิทธิ์ปุ่มแก้ไขรอบ (btn_sic_edit_round จาก API)
  editRound = 0; // รอบที่กดแก้ไขอยู่ (0 = แสดงรอบล่าสุดที่แจ้งจัดงาน)
  returns: ReturnsState = readReturns(null); // รับของคืนจากหน้างาน (page / sync / ผลปุ่ม)

  constructor(page: any, hooks: Hooks) {
    this.hooks = hooks;
    this.load(page);
  }

  // ---------- โหลดข้อมูลหน้า (site_item_check.php วาดหน้า) ----------
  load(page: any) {
    this.me = str(page.me);
    this.canEditRound = !!page.can_edit_round;
    this.editRound = 0;
    this.project = page.project;
    this.extraPending = num(page.extra_pending);
    this.photoMax = num(page.photo_max) || 3;
    this.struct = str(page.struct);
    this.syncStamp = str(page.stamp);
    this.syncLog = num(page.log);
    this.staleBy = null;
    this.transport = page.transport || { drivers: [], cars: [], users: [] };
    this.others = Array.isArray(page.others) ? page.others : [];
    this.live = page.live && typeof page.live === 'object' ? page.live : {};
    this.drafts = { items: page.drafts?.items || {}, subs: page.drafts?.subs || {} };
    this.myDrafts = num(page.my_drafts);
    this.presence = Array.isArray(page.presence) ? page.presence : [];
    this.returns = readReturns(page.returns);
    this.myPackTouched.clear();
    ROUNDS = roundsOf(page.rounds); // รอบที่มี (รอบ 4 ขึ้นไปเพิ่มเอง)
    this.rounds = {};
    ROUNDS.forEach((round) => {
      const info = page.rounds?.[String(round)] || {};
      const head = readHead(info.head);
      this.rounds[round] = {
        round,
        do: str(info.do),
        hasDo: !!info.has_do,
        locked: !!info.locked,
        missing: !!info.missing,
        source: str(info.source),
        mismatch: !!info.mismatch,
        head,
        savedHead: { ...head },
        printed: str(info.printed),
        jobOn: !!info.job_on,
        jobSaved: !!info.job_on,
        jobText: str(info.job_text),
        jobAt: str(info.job_at),
        done: !!info.done_on,
        doneText: str(info.done_text),
      };
    });
    const subsData = page.subs || {};
    this.groups = [];
    this.rows = [];
    this.rowOfItem.clear();
    (Array.isArray(page.groups) ? page.groups : []).forEach((g: any) => {
      const group: Group = { sec: str(g.sec), order: num(g.order), name: str(g.name), search: str(g.search), rows: [] };
      (Array.isArray(g.lines) ? g.lines : []).forEach((l: any) => {
        const members: Member[] = (l.members || []).map((m: any) => ({
          id: num(m.id), name: str(m.name), qty: num(m.qty), site: num(m.site), r: (m.r || ROUNDS.map(() => 0)).map(num), back: num(m.back),
          done: num(m.done), pk: (m.pk || ROUNDS.map(() => 0)).map(num), pd: num(m.pd), p80: num(m.p80), stock: num(m.stock),
        }));
        const savedLoad = ROUNDS.map((round) => sumOf(members, 'r', round));
        const savedPackV = ROUNDS.map((round) => sumOf(members, 'pk', round));
        const p80 = members.some((m) => m.p80 === 1);
        const row: Row = {
          isSub: false,
          key: 'i' + num(l.id),
          id: num(l.id),
          ids: (l.ids || []).map(num),
          sec: group.sec,
          group,
          name: str(l.name),
          nameInput: str(l.name),
          nameSaved: str(l.name),
          renaming: false,
          unit: str(l.unit),
          qty: num(l.qty),
          where: str(l.where),
          parts: (l.parts || []).map((p: any) => [str(p[0]), num(p[1])] as [string, number]),
          partsText: str(l.parts_text),
          ships: !!l.ships,
          site: num(l.site),
          avail: num(l.avail),
          members,
          stock: l.stock || null,
          back: (l.back || []).map((e: any) => [num(e[0]), str(e[1]), num(e[2])] as [number, string, number]),
          doneText: str(l.done_text),
          marks: l.marks || {},
          skipReason: str(l.skip_reason),
          namesDiffer: !!l.names_differ,
          multiUnit: !!l.multi_unit,
          hint: str(l.hint),
          otherDo: num(l.other_do),
          po: Array.isArray(l.po) ? l.po : [],
          savedLoad,
          savedPack: savedPackV,
          load: savedLoad.slice(),
          pack: savedPackV.slice(),
          doneRound: num(l.done_round),
          packRound: num(l.pack_round),
          pendingDone: num(l.done_round),
          pendingPack: num(l.pack_round),
          p80,
          p80Saved: p80,
          note: str(l.note),
          noteSaved: str(l.note),
          photos: this.photoMapOf(l.photos),
          photoEdit: {},
          shared: null,
          liveBy: '',
          conflicts: [],
          flash: ROUNDS.map(() => 0),
          packState: '',
          autoFailed: false,
          v: 0,
          subs: [],
        };
        (l.subs || []).forEach((sid: any) => {
          const s = subsData[String(sid)];
          if (s) row.subs.push(this.makeSub(row, s));
        });
        group.rows.push(row);
        this.rows.push(row);
        row.ids.forEach((id) => this.rowOfItem.set(id, row));
      });
      this.groups.push(group);
    });
    // ช่องขึ้นที่มีคนกรอกค้างไว้ แสดงตั้งแต่เปิดหน้า
    this.allTrs().forEach((tr) => {
      if (!this.liveKey(tr)) return;
      tr.shared = this.loadSaved(tr);
      this.applyLive(tr, false);
    });
    this.ctx++;
  }

  photoMapOf(raw: any): Record<number, Photo[]> {
    const out: Record<number, Photo[]> = {};
    ROUNDS.forEach((round) => {
      const list = raw?.[String(round)] ?? raw?.[round];
      out[round] = Array.isArray(list) ? list : [];
    });
    return out;
  }

  makeSub(parent: Row, s: any): Sub {
    const saved: SubSaved = this.subSavedOf(s.saved);
    return {
      isSub: true,
      key: 's' + num(s.id),
      id: num(s.id),
      parent,
      name: saved.name,
      qty: saved.qty,
      unit: saved.unit,
      load: saved.r.slice(),
      pack: saved.p.slice(),
      pendingDone: saved.done,
      pendingPack: saved.pd,
      note: saved.note,
      deleted: false,
      saved,
      doneText: str(s.done_text),
      marks: s.marks || {},
      photos: this.photoMapOf(s.photos),
      photoEdit: {},
      shared: null,
      liveBy: '',
      conflicts: [],
      flash: ROUNDS.map(() => 0),
      packState: '',
      autoFailed: false,
      v: 0,
    };
  }

  subSavedOf(raw: any): SubSaved {
    return {
      name: str(raw?.name),
      qty: str(raw?.qty),
      unit: str(raw?.unit),
      // ทุกรอบที่มี (รอบ 4 ขึ้นไปเพิ่มเอง) · เดิมฟิค 3 ช่อง รอบ 4+ อ่าน load[3] แล้วแอปพัง + บันทึกชน 409 ทุกครั้ง
      r: ROUNDS.map((_, i) => str(raw?.r?.[i])),
      p: ROUNDS.map((_, i) => str(raw?.p?.[i])),
      done: num(raw?.done),
      pd: num(raw?.pd),
      stock: num(raw?.stock),
      note: str(raw?.note),
    };
  }

  emit() {
    if (!this.disposed) this.hooks.changed();
  }
  touch(tr: Tr) {
    tr.v++;
  }
  touchAll() {
    this.allTrs().forEach((tr) => tr.v++);
    this.ctx++;
  }
  subRows(): Sub[] {
    return this.rows.flatMap((row) => row.subs);
  }
  allTrs(): Tr[] {
    return (this.rows as Tr[]).concat(this.subRows());
  }
  isLocked(round: number) {
    return !!this.rounds[round]?.locked;
  }
  /**
   * ยืนยันจบรอบแล้ว (ผู้ใช้สั่ง 13 พ.ย. 69 · หน้าเว็บ roundFrozen): ดูได้อย่างเดียว จนคนมีสิทธิ์แก้ไขรอบกดปุ่มแก้ไขของรอบนั้น
   * frozen = ล็อก (คนขับยืนยัน) หรือจบรอบ · เซิร์ฟเวอร์กันคนไม่มีสิทธิ์ซ้ำ (sic_round_scope_error)
   */
  roundDone(round: number) {
    return !!this.rounds[round]?.done;
  }
  roundClosed(round: number) {
    return this.roundDone(round) && this.editRound !== round;
  }
  roundFrozen(round: number) {
    return this.isLocked(round) || this.roundClosed(round);
  }
  frozenText(round: number) {
    return this.isLocked(round) ? ROUND_LOCK_TEXT : 'รอบนี้ยืนยันจบแล้ว' + (this.canEditRound ? ' กดแก้ไขที่กล่องสถานะจัดงานเพื่อแก้' : ' แก้ไม่ได้');
  }
  // บันทึกขึ้นของรอบนี้แล้ว (มีช่องขึ้นที่บันทึกแล้ว) = กดยืนยันจบรอบได้
  roundLoadSaved(round: number) {
    return this.allTrs().some((tr) => Number(savedLoadOf(tr, round - 1)) > 0);
  }
  /** ยืนยันจบรอบ (action finish_round · sic_finish_round) จบแล้วหน้าแจ้งจัดงานไม่แสดงรอบนี้ */
  async finishRound(round: number) {
    const data = await this.hooks.api('finish_round', { round: String(round) });
    const card = this.rounds[round];
    card.done = true;
    card.doneText = str(data.text);
    if (this.editRound === round) this.editRound = 0;
    this.touchAll();
    this.ctx++;
    this.emit();
  }

  // ---------- ค่าที่กรอกเทียบค่าที่บันทึกแล้ว ----------
  /**
   * จำนวนเป้าของแถว: ติ๊ก 80% แล้วเหลือ 80% · ปัดเศษตามปกติเป็นจำนวนเต็ม ต่ำกว่า .5 ปัดลง .5 ขึ้นไปปัดขึ้น (4 → 3 · 6 → 5 · 7.5 → 6)
   * ปัดแล้วเกินจำนวน = ปัดลง (1.9 → 1) · ได้ 0 = 1 (0.5 → 1) · ไม่มีทศนิยมเลย · ต้องตรงกับ sic_target_qty()
   */
  targetQty(row: Row) {
    const qty = row.qty;
    if (!row.p80) return qty;
    const exact = round2(qty * 0.8);
    let near = Math.floor(exact + 0.5 + 0.000001);
    if (near > round2(qty) + 0.000001) near = Math.floor(exact + 0.000001);
    return near < 1 && qty > 0 ? 1 : Math.max(0, near);
  }
  targetOf(tr: Tr) {
    return tr.isSub ? Number(this.subValues(tr).qty) || 0 : this.targetQty(tr);
  }
  /** จำนวนเต็ม (ไม่หัก 80%) ใช้คิด "เกิน" · ติ๊ก 80% แล้วส่งส่วนที่เหลือจนครบจำนวนเต็มไม่ใช่เกิน (เหมือนหน้าเว็บ 14 พ.ย. 69) */
  fullOf(tr: Tr) {
    return tr.isSub ? this.targetOf(tr) : Math.max(Number((tr as Row).qty) || 0, this.targetQty(tr as Row));
  }
  packChanged(row: Row) {
    return row.pendingPack !== row.packRound || ROUNDS.some((r) => normQty(row.pack[r - 1]) !== row.savedPack[r - 1]);
  }
  p80Changed(row: Row) {
    return row.p80 !== row.p80Saved;
  }
  noteChanged(row: Row) {
    return row.note.trim() !== row.noteSaved;
  }
  nameChanged(row: Row) {
    return row.nameInput.trim() !== row.nameSaved;
  }
  nameEmpty(row: Row) {
    return row.nameInput.trim() === '';
  }
  qtyInvalid(tr: Tr) {
    return ROUNDS.some((r) => normQty(tr.load[r - 1]) === null || normQty(tr.pack[r - 1]) === null);
  }
  rowChanged(row: Row) {
    return row.pendingDone !== row.doneRound || this.packChanged(row) || this.p80Changed(row) || ROUNDS.some((r) => normQty(row.load[r - 1]) !== row.savedLoad[r - 1]);
  }
  anyChange(row: Row) {
    return this.rowChanged(row) || this.noteChanged(row) || this.nameChanged(row);
  }
  // ที่แก้นอกกล่องจัด (กล่องจัดบันทึกเอง ช่องอื่นรอปุ่มบันทึก)
  rowOtherChange(row: Row) {
    return row.pendingDone !== row.doneRound || this.p80Changed(row) || ROUNDS.some((r) => normQty(row.load[r - 1]) !== row.savedLoad[r - 1]) || this.noteChanged(row) || this.nameChanged(row);
  }
  subValues(sub: Sub): SubSaved {
    return {
      name: sub.name.trim(),
      qty: normQty(sub.qty) as string,
      unit: sub.unit.trim(),
      r: ROUNDS.map((r) => normQty(sub.load[r - 1]) as string),
      p: ROUNDS.map((r) => normQty(sub.pack[r - 1]) as string),
      done: sub.pendingDone,
      pd: sub.pendingPack,
      stock: (sub.saved || { stock: 0 }).stock, // ช่องมีของเอาออกแล้ว คงค่าเดิมในฐาน
      note: sub.note.trim(),
    };
  }
  isNewSub(sub: Sub) {
    return sub.id === 0;
  }
  subChanged(sub: Sub) {
    return this.isNewSub(sub) || sub.deleted || !sameJson(this.subValues(sub), sub.saved);
  }
  // ช่องที่ยังกรอกไม่ครบ: ชื่อว่าง / จำนวนว่าง-ศูนย์-พิมพ์ผิด / จำนวนรอบพิมพ์ผิด
  subProblem(sub: Sub) {
    if (sub.deleted) return false;
    const v = this.subValues(sub);
    return v.name === '' || !v.qty || v.r.some((x) => x === null) || v.p.some((x) => x === null);
  }
  subOtherChange(sub: Sub) {
    const saved = sub.saved;
    return saved === null || !sameJson({ ...this.subValues(sub), p: null, pd: null }, { ...saved, p: null, pd: null });
  }
  subPlainChange(sub: Sub) {
    const saved = sub.saved;
    const strip = (v: SubSaved) => JSON.stringify({ ...v, r: null, done: null, p: null, pd: null });
    return saved === null || strip(this.subValues(sub)) !== strip(saved);
  }
  trDirty(tr: Tr) {
    return tr.isSub ? this.subChanged(tr) : this.anyChange(tr);
  }
  subHeld(sub: Sub) {
    const saved = sub.saved;
    return (
      saved !== null &&
      ROUNDS.some((round, i) => this.roundFrozen(round) && (Number(saved.r[i]) > 0 || Number(saved.done) === round || Number(saved.p[i]) > 0 || Number(saved.pd) === round))
    );
  }

  // ---------- สถานะจัดงาน ----------
  jobChanged(round: number) {
    const card = this.rounds[round];
    return card.jobOn !== card.jobSaved;
  }
  sheetReady(round: number) {
    return this.rounds[round].jobSaved;
  }
  sheetBlockText(round: number) {
    return this.rounds[round].jobOn ? 'กดบันทึกก่อน จึงพิมพ์ใบเช็คของรอบ ' + round + ' ได้' : 'ติ๊กแจ้งจัดงานรอบ ' + round + ' แล้วบันทึกก่อน จึงพิมพ์ใบเช็คของได้';
  }
  jobStatusText() {
    const on = ROUNDS.filter((r) => this.rounds[r].jobOn);
    return on.length ? 'แจ้งจัดงานแล้ว รอบที่ ' + on.join(', ') : 'ยังไม่แจ้งจัดงาน';
  }
  jobMeta(round: number) {
    const card = this.rounds[round];
    if (this.jobChanged(round)) return card.jobOn ? 'ยังไม่บันทึก' : 'ยกเลิกแจ้ง · ยังไม่บันทึก';
    if (card.jobOn && card.done) return card.doneText;
    return card.jobOn ? card.jobText : 'กดเพื่อแจ้งจัดงาน';
  }
  toggleJob(round: number) {
    // แจ้งจัดงานแล้ว (บันทึกแล้ว) ล็อกค้าง ยกเลิกไม่ได้ (ผู้ใช้สั่ง 11 พ.ย. 69) · เซิร์ฟเวอร์กันซ้ำที่ sic_save_changes
    if (this.rounds[round].jobSaved) {
      this.hooks.toast('แจ้งจัดงานรอบ ' + round + ' แล้ว ยกเลิกไม่ได้');
      return;
    }
    this.rounds[round].jobOn = !this.rounds[round].jobOn;
    this.ctx++;
    this.emit();
  }

  // กล่องจัดรอบนี้ยังไม่จบ: มีร่างที่ยังไม่กดบันทึก (ของใครก็ได้ รวมเรา) หรือเรากำลังพิมพ์/ติ๊กค้างอยู่
  packPending(tr: Tr, round: number) {
    if (this.packDraftNames(tr, round).length || this.myPackTouched.has(this.liveKey(tr) + '|' + round)) return true;
    if (normQty(tr.pack[round - 1]) !== savedPackOf(tr, round - 1)) return true;
    const pend = tr.pendingPack;
    const saved = savedPack(tr);
    return pend !== saved && (pend === round || saved === round);
  }

  /** สถานะจัด/ขึ้นของรอบที่แจ้งจัดงานแล้ว (ชุดเดียวกับหน้าแจ้งจัดงาน + ขึ้นครบแล้ว) */
  roundProgress(round: number) {
    let total = 0;
    let packed = 0;
    let loaded = 0;
    let packing = false;
    let pending = false;
    let loading = false;
    const count = (tr: Tr, target: number) => {
      const done = tr.pendingDone;
      if (done > 0 && done !== round) return;
      const need = Math.max(round2(target - (sentQty(tr) - qtyOf(tr, round))), 0);
      if (need <= 0 && done !== round) return;
      const pack = packOf(tr, round);
      const load = qtyOf(tr, round);
      total++;
      if (tr.pendingPack === round || pack >= need - 0.005) packed++;
      if (done === round || load >= need - 0.005) loaded++;
      if (pack > 0 || tr.pendingPack === round) packing = true;
      if (this.packPending(tr, round)) pending = true;
      if (load > 0 || done === round) loading = true;
    };
    this.groups
      .filter((g) => g.sec !== 'skip')
      .forEach((g) =>
        g.rows.forEach((row) => {
          count(row, this.targetQty(row));
          row.subs.filter((s) => !s.deleted).forEach((s) => count(s, Number(this.subValues(s).qty) || 0));
        })
      );
    // ไม่มีรายการต้องส่งในรอบนี้แล้ว (ครบในรอบก่อน) = ขึ้นครบแล้ว
    const status = loaded === total ? 'loaded' : loading ? 'loading' : pending ? 'packing' : packing ? 'packed' : 'waiting';
    return { status, total, packed, left: total - loaded };
  }

  // รอบที่เปิด = 1 ถึงรอบสูงสุดที่แจ้งจัดงานแล้ว (รวมที่ติ๊กค้าง) · รอบที่ยังไม่แจ้งแต่มีข้อมูลแล้วเปิดด้วย
  roundHasData(round: number) {
    const card = this.rounds[round];
    if (card.hasDo || card.locked) return true;
    const i = round - 1;
    return this.allTrs().some(
      (tr) =>
        savedDone(tr) === round ||
        savedPack(tr) === round ||
        tr.pendingDone === round ||
        tr.pendingPack === round ||
        this.photoTotal(tr, round) > 0 ||
        tr.load[i].trim() !== '' ||
        savedLoadOf(tr, i) !== '' ||
        tr.pack[i].trim() !== '' ||
        savedPackOf(tr, i) !== ''
    );
  }
  /**
   * แสดงทีละรอบ (ผู้ใช้สั่ง 11 พ.ย. 69 · paintRoundShow ในเว็บ): เห็นเฉพาะรอบล่าสุดที่แจ้งจัดงาน (รวมที่ติ๊กค้าง) · ยังไม่แจ้ง = ไม่แสดงช่องรอบ
   * ปุ่มแก้ไข (สิทธิ์ btn_sic_edit_round = can_edit_round) สลับไปแสดงรอบนั้น · เซิร์ฟเวอร์กันซ้ำ คนไม่มีสิทธิ์บันทึกได้เฉพาะรอบล่าสุด
   * ปุ่มแจ้งจัดงานที่เห็น: รอบที่แจ้งแล้ว + รอบถัดไป + รอบที่มีข้อมูล · ปุ่มแก้ไขที่รอบที่ไม่ได้แสดง (แจ้งแล้วหรือมีข้อมูล)
   */
  roundView() {
    const current = Math.max(0, ...ROUNDS.filter((r) => this.rounds[r].jobOn));
    // ยืนยันจบรอบแล้ว: รอบล่าสุดก็ต้องกดแก้ไขก่อนจึงแก้ได้ (ปุ่มแก้ไขขึ้นที่รอบที่แสดงอยู่ด้วย)
    if ((this.editRound === current && !this.roundDone(current)) || !this.canEditRound) this.editRound = 0;
    const shown = this.editRound || current;
    const jobTop = Math.min(ROUNDS.length, current + 1);
    const jobRows = ROUNDS.map((round) => {
      const hasData = this.roundHasData(round);
      return {
        round,
        visible: round <= jobTop || hasData,
        edit: this.canEditRound && (round !== shown || this.roundClosed(round)) && (round <= current || this.rounds[round].jobOn || hasData),
      };
    });
    return { shown, current, jobTop, jobRows, editing: this.editRound };
  }
  setEditRound(round: number) {
    this.editRound = round;
    this.touchAll();
    this.emit();
  }

  // ---------- หัวใบส่งของ ----------
  headChanged(round: number) {
    const head = this.rounds[round].head;
    return !sameJson({ ...head, job_note: head.job_note.trim() }, this.rounds[round].savedHead); // หมายเหตุจัดงานเก็บตามที่พิมพ์ เทียบแบบตัดช่องว่าง
  }
  /** หัวใบที่อยู่ในใบส่งของเปลี่ยน (ไม่นับวันที่ขึ้นของ) · เหมือน sic_head_only_load_changed() ฝั่งเซิร์ฟเวอร์ */
  headDoChanged(round: number) {
    return !sameJson({ ...this.rounds[round].head, load_at: '', job_note: '' }, { ...this.rounds[round].savedHead, load_at: '', job_note: '' });
  }
  /** หมายเหตุจัดงาน (กล่องสถานะจัดงาน ใต้วันที่ขึ้นของ) แก้หัวรอบ รอกดบันทึก · ไม่อยู่ในใบส่งของ · เก็บตามที่พิมพ์ (เซิร์ฟเวอร์ตัดช่องว่างหัวท้ายเอง) */
  setJobNote(round: number, text: string) {
    this.rounds[round].head = { ...this.rounds[round].head, job_note: text };
    this.emit();
  }
  jobNoteChanged(round: number) {
    return this.rounds[round].head.job_note.trim() !== this.rounds[round].savedHead.job_note;
  }
  setHead(round: number, head: Head) {
    this.rounds[round].head = readHead(head);
    this.ctx++;
    this.emit();
  }
  /** วันที่ขึ้นของ (กรอกที่กล่องสถานะจัดงาน) แก้หัวรอบ รอกดบันทึก + ยืนยัน */
  setLoadAt(round: number, ymd: string) {
    this.setHead(round, { ...this.rounds[round].head, load_at: ymd });
  }

  /**
   * แจกยอดของบรรทัดรวมกลับไปทีละรายการ · แจกใหม่เฉพาะรอบที่ยอดเปลี่ยน: เติมรายการแรกจนเต็มจำนวนที่ยังเหลือ แล้วค่อยรายการถัดไป
   * ส่วนที่เกินไปอยู่รายการสุดท้าย · ติ๊กครบ/80% ที่เปลี่ยน ใช้กับทุกรายการ · packOnly = แจกเฉพาะกล่องจัด
   */
  planMembers(row: Row, packOnly = false): Member[] {
    const members = row.members.map((m) => ({ ...m, r: m.r.slice(), pk: m.pk.slice() }));
    const boxes: ['load' | 'pack', 'r' | 'pk'][] = [
      ['load', 'r'],
      ['pack', 'pk'],
    ];
    (packOnly ? boxes.slice(1) : boxes).forEach(([box, key]) => {
      ROUNDS.forEach((round) => {
        const value = row[box][round - 1];
        const saved = box === 'load' ? row.savedLoad[round - 1] : row.savedPack[round - 1];
        if (normQty(value) === saved) return;
        let left = box === 'load' ? qtyOf(row, round) : packOf(row, round);
        members.forEach((m, i) => {
          const others = m[key].reduce((sum, v, k) => (k === round - 1 ? sum : sum + v), 0) - (m.back || 0);
          const give = i === members.length - 1 ? left : Math.min(left, Math.max(round2(m.qty - others), 0));
          m[key][round - 1] = round2(give);
          left = round2(left - give);
        });
      });
    });
    const doneChanged = !packOnly && row.pendingDone !== row.doneRound;
    const packDoneChanged = row.pendingPack !== row.packRound;
    members.forEach((m) => {
      // ติ๊กครบในรอบที่ล็อกแล้วแก้ไม่ได้ รายการนั้นคงค่าเดิม
      // รายการที่ครบไปแล้วในรอบก่อนคงรอบเดิม (ไม่นับเป็นการแก้รอบเก่า) · เหมือน memberDone ใน js/site_item_check.js
      if (doneChanged && !(m.done > 0 && this.isLocked(m.done))) m.done = memberDone(m.done, row.pendingDone, row.doneRound);
      if (packDoneChanged && !(m.pd > 0 && this.isLocked(m.pd))) m.pd = memberDone(m.pd, row.pendingPack, row.packRound);
      if (packOnly) return;
      if (this.p80Changed(row)) m.p80 = row.p80 ? 1 : 0;
    });
    return members;
  }
  // บรรทัดในใบส่งที่รอบนี้จะได้ ตามยอดในหน้าตอนนี้
  desiredLines(round: number) {
    return this.rows
      .filter((row) => row.ships)
      .flatMap((row) => this.planMembers(row).map((m) => ({ row, qty: doSplit(m.r, Number(m.site) || 0)[round - 1] })))
      .filter((line) => line.qty > 0);
  }
  roundTouched(round: number) {
    return this.headDoChanged(round) || this.rows.some((row) => normQty(row.load[round - 1]) !== row.savedLoad[round - 1]);
  }
  /** เบิกสต๊อกอัตโนมัติของบรรทัด · ต้องตรงกับ sic_stock_need() · null = ไม่เบิกหรือยอดส่งรวมไม่เปลี่ยน */
  stockPlan(row: Row) {
    if (!row.stock) return null;
    const info = row.stock;
    const sentOf = (members: Member[]) => round2(members.reduce((t, m) => t + m.r.reduce((a, b) => a + b, 0) - (m.back || 0), 0));
    // เซิร์ฟเวอร์คิดเบิกใหม่เมื่อยอดรอบใดรอบหนึ่งของรายการใดเปลี่ยน (ย้ายยอดข้ามรอบก็คิด) · เหมือน stockPlan() ในเว็บ
    const planned = this.planMembers(row);
    if (!planned.some((m, i) => m.r.some((v, k) => Math.abs(v - (row.members[i]?.r[k] || 0)) >= 0.005))) return null;
    const sent = sentOf(planned);
    const wanted = Math.max(0, round2(sent - info.src));
    const need = info.blocked ? Math.min(wanted, info.auto) : wanted;
    return { ...info, sent, held: info.blocked !== '' && wanted > need, delta: round2(need - info.auto) };
  }
  stockLine(row: Row, plan: NonNullable<ReturnType<Board['stockPlan']>>): ChangeLine | null {
    const name = row.name;
    if (plan.held) return { name, where: '⚠ ไม่เบิกสต๊อกอัตโนมัติ', text: STOCK_BLOCKED_TEXT[plan.blocked] || '' };
    if (plan.delta === 0) return null;
    const unit = row.unit ? ' ' + row.unit : '';
    if (plan.delta < 0) return { name, where: 'ถอยเบิกสต๊อกอัตโนมัติ', text: 'คืน ' + fmt(-plan.delta) + unit + ' (ยอดส่งลดลง)' };
    return {
      name,
      where: 'เบิกสต๊อกอัตโนมัติ',
      text: 'เบิก ' + fmt(plan.delta) + unit + ' · ส่งรวม ' + fmt(plan.sent) + ' มีของแล้ว ' + fmt(round2(plan.src + plan.auto)) + (plan.no_cost ? ' · ไม่มีทุน มูลค่าเป็น 0' : ''),
    };
  }

  // ---------- ช่องติ๊กครบ ----------
  /** ติ๊กครบ: ช่องว่างเติมยอดที่เหลือ / กรอกแล้วคงเลขเดิม · แถวละ 1 รอบ · เลิกติ๊ก: เลขเท่ายอดที่เหลือพอดี = ล้าง */
  markPending(tr: Tr, round: number, complete: boolean, target = this.targetOf(tr)) {
    const others = ROUNDS.filter((r) => r !== round).reduce((t, r) => t + qtyOf(tr, r), 0) - backQty(tr);
    const remain = remainFor(target, this.fullOf(tr), others);
    if (complete) {
      if (tr.pendingDone !== 0) return;
      tr.pendingDone = round;
      if (qtyOf(tr, round) <= 0 && remain > 0) tr.load[round - 1] = String(remain);
    } else {
      if (tr.pendingDone !== round) return;
      tr.pendingDone = 0;
      if (qtyOf(tr, round) > 0 && Math.abs(qtyOf(tr, round) - remain) < 0.005) tr.load[round - 1] = '';
    }
  }
  markPackPending(tr: Tr, round: number, complete: boolean, target = this.targetOf(tr)) {
    const others = ROUNDS.filter((r) => r !== round).reduce((t, r) => t + packOf(tr, r), 0) - backQty(tr);
    const remain = remainFor(target, this.fullOf(tr), others);
    if (complete) {
      if (tr.pendingPack !== 0) return;
      tr.pendingPack = round;
      if (packOf(tr, round) <= 0 && remain > 0) tr.pack[round - 1] = String(remain);
    } else {
      if (tr.pendingPack !== round) return;
      tr.pendingPack = 0;
      if (packOf(tr, round) > 0 && Math.abs(packOf(tr, round) - remain) < 0.005) tr.pack[round - 1] = '';
    }
  }

  // ---------- เหตุการณ์จากช่องกรอก (table input/change ของหน้าเว็บ) ----------
  /** พิมพ์ช่องขึ้น: ส่งค่าค้างให้เครื่องอื่นเห็น (ช่องจัดตามตอนกดบันทึก linkPacksForSave) */
  onLoadInput(tr: Tr, round: number, text: string) {
    tr.load[round - 1] = text;
    this.touch(tr);
    if (this.liveKey(tr)) this.scheduleLive(tr, LIVE_MS);
    this.emit();
  }
  /** ออกจากช่องขึ้น: จัดรูปเลข + ส่งทันที */
  onLoadCommit(tr: Tr, round: number) {
    const norm = normQty(tr.load[round - 1]);
    if (norm !== null) tr.load[round - 1] = norm;
    this.touch(tr);
    if (this.liveKey(tr)) this.queueLive(tr);
    this.emit();
  }
  onPackInput(tr: Tr, round: number, text: string) {
    tr.pack[round - 1] = text;
    tr.autoFailed = false;
    this.touch(tr);
    this.scheduleAutoSave(tr, AUTO_MS);
    this.emit();
  }
  onPackCommit(tr: Tr, round: number) {
    const norm = normQty(tr.pack[round - 1]);
    if (norm !== null) tr.pack[round - 1] = norm;
    tr.autoFailed = false;
    this.touch(tr);
    void this.queueAutoSave(tr);
    this.emit();
  }
  /** ติ๊กขึ้นครบ (เติมจำนวนขึ้นให้) · จัดครบ/จำนวนจัดตามตอนกดบันทึก (linkPacksForSave) */
  onLoadTick(tr: Tr, round: number, checked: boolean) {
    this.markPending(tr, round, checked);
    this.touch(tr);
    if (this.liveKey(tr)) this.queueLive(tr);
    this.emit();
  }
  onPackTick(tr: Tr, round: number, checked: boolean) {
    this.markPackPending(tr, round, checked);
    tr.autoFailed = false;
    this.touch(tr);
    void this.queueAutoSave(tr);
    this.emit();
  }
  // ---------- รับของคืนจากหน้างาน (ส่งถึงหน้างานแล้วเกินจำนวน/รายการถูกลบ) ----------
  /** ของเกินที่ต้องรับกลับของบรรทัด (ยังไม่กด) */
  returnOver(row: Row) {
    return round2(row.ids.reduce((sum, id) => sum + num(this.returns.items[String(id)]), 0));
  }
  /** รอรับคืนของบรรทัด (กดแล้ว รอคนขับรับ) */
  returnWaiting(row: Row) {
    return round2(row.ids.reduce((sum, id) => sum + num(this.returns.waiting[String(id)]), 0));
  }
  /** คนขับรับคืนแล้วของบรรทัด (30 วันล่าสุด) · ป้ายเขียว (ผู้ใช้สั่ง 13 พ.ย. 69 ให้เห็นชัด) */
  returnPicked(row: Row) {
    return round2(this.returns.list.filter((r) => r.status === 'picked' && row.ids.includes(num(r.item))).reduce((sum, r) => sum + num(r.picked_qty), 0));
  }
  /** กดรับของคืน / ยกเลิก: เซิร์ฟเวอร์คิดจำนวนใหม่เอง คืนข้อมูลรับคืนชุดใหม่ */
  async returnAction(action: 'return_request' | 'return_cancel', fields: Record<string, string>) {
    const data = await this.hooks.api(action, fields);
    this.returns = readReturns(data.returns);
    this.ctx++;
    this.emit();
  }

  /**
   * ช่องขึ้นเป็นตัวหลัก: ช่องจัดรอบเดียวกันได้เท่ากับช่องขึ้น (ลบขึ้น = ลบจัด) · ติ๊กขึ้นครบรอบใหม่ = ติ๊กจัดครบด้วย
   * ทำตอนกดบันทึกเท่านั้น (ผู้ใช้สั่ง 12 พ.ย. 69 เหมือนหน้าเว็บ linkPacksForSave) ช่องจัดลงไปพร้อมชุดบันทึก ไม่บันทึกเองแบบ draft
   * เฉพาะรอบที่ช่องขึ้นต่างจากค่าที่บันทึกแล้ว · ช่องจัดรอบที่ล็อกไม่แตะ
   */
  linkPacksForSave() {
    this.allTrs().forEach((tr) => {
      let changed = false;
      ROUNDS.forEach((round, i) => {
        if (this.isLocked(round)) return;
        const value = normQty(tr.load[i]);
        if (value === null || value === savedLoadOf(tr, i) || normQty(tr.pack[i]) === value) return;
        tr.pack[i] = value;
        changed = true;
      });
      const done = tr.pendingDone;
      if (done && done !== savedDone(tr) && tr.pendingPack === 0) {
        tr.pendingPack = done;
        changed = true;
      }
      if (changed) this.touch(tr);
    });
  }
  setP80(row: Row, on: boolean) {
    row.p80 = on;
    this.touch(row);
    this.emit();
  }
  setNote(tr: Tr, text: string) {
    tr.note = text;
    this.touch(tr);
    this.emit();
  }
  setName(row: Row, text: string) {
    row.nameInput = text;
    this.touch(row);
    this.emit();
  }
  openRename(row: Row) {
    row.renaming = true;
    this.touch(row);
    this.emit();
  }
  closeRename(row: Row, cancel = false) {
    if (cancel) row.nameInput = row.nameSaved;
    if (!this.nameChanged(row)) {
      row.nameInput = row.nameSaved;
      row.renaming = false;
    }
    this.touch(row);
    this.emit();
  }
  setSubField(sub: Sub, field: 'name' | 'qty' | 'unit', text: string) {
    sub[field] = text;
    this.touch(sub);
    this.emit();
  }
  commitSubQty(sub: Sub) {
    const norm = normQty(sub.qty);
    if (norm !== null) sub.qty = norm;
    this.touch(sub);
    this.emit();
  }
  addSub(row: Row) {
    const sub = this.makeSub(row, { id: 0, saved: {} });
    sub.saved = null;
    sub.key = 'n' + ++this.uid;
    sub.load = ROUNDS.map(() => '');
    sub.pack = ROUNDS.map(() => '');
    sub.pendingDone = 0;
    sub.pendingPack = 0;
    row.subs.push(sub);
    this.touch(row);
    this.ctx++;
    this.emit();
    return sub;
  }
  // แถวใหม่ที่ยังไม่บันทึกลบทิ้งได้เลย · แถวที่บันทึกแล้วทำเครื่องหมายไว้ ลบจริงตอนกดบันทึก (กดซ้ำ = ยกเลิกการลบ)
  toggleDeleteSub(sub: Sub) {
    if (this.isNewSub(sub)) {
      sub.parent.subs = sub.parent.subs.filter((s) => s !== sub);
      this.touch(sub.parent);
    } else {
      sub.deleted = !sub.deleted;
      this.touch(sub);
    }
    this.ctx++;
    this.emit();
  }
  resetSub(sub: Sub) {
    const s = sub.saved;
    if (!s) return;
    sub.deleted = false;
    sub.name = s.name;
    sub.qty = s.qty;
    sub.unit = s.unit;
    sub.load = s.r.slice();
    sub.pack = s.p.slice();
    sub.pendingDone = s.done;
    sub.pendingPack = s.pd;
    sub.note = s.note;
    this.touch(sub);
  }

  // ---------- การแสดงผลช่องรอบ (paintRounds) ----------
  leftInfo(tr: Tr) {
    const sent = sentQty(tr);
    const diff = round2(this.targetOf(tr) - sent);
    const over = round2(sent - this.fullOf(tr)); // เกินเทียบจำนวนเต็ม ไม่ใช่เป้า 80%
    return { text: over > 0 ? 'เกิน ' + fmt(over) : fmt(Math.max(diff, 0)), tone: over > 0 ? 'over' : diff <= 0 ? 'zero' : '' };
  }
  /**
   * ติ๊ก 80% แยกสองระดับ (เหมือน paintRounds ในเว็บ 14 พ.ย. 69): รอบที่ยอดสะสมถึงเป้า 80% และรอบที่ถึงจำนวนเต็ม
   * คิดจากยอดสะสม ไม่ใช่ติ๊กครบ · { target: 0, full: 0 } = ไม่ได้ติ๊ก 80% หรือยังไม่ถึง
   */
  reachRounds(tr: Tr) {
    const total = this.targetOf(tr);
    const full = this.fullOf(tr);
    const reach = { target: 0, full: 0 };
    if (!(full > total + 0.005)) return reach;
    const returns = returnsOf(tr);
    let acc = 0;
    ROUNDS.forEach((round, i) => {
      const back = returns.filter((e) => e[0] === round).reduce((t, e) => t + e[2], 0);
      const before = acc;
      acc = round2(acc + (Number(normQty(tr.load[i])) || 0) - back);
      if (!reach.target && total > 0 && acc >= total - 0.005 && before < total - 0.005) reach.target = round;
      if (!reach.full && acc >= full - 0.005 && before < full - 0.005) reach.full = round;
    });
    return reach;
  }
  /** ป้ายในแถว: ครบ 80% รอบไหน · ครบเต็มรอบไหน (ว่าง = ไม่ได้ติ๊ก 80%) */
  reachText(tr: Tr) {
    const reach = this.reachRounds(tr);
    return [reach.target ? 'ครบ 80% รอบ ' + reach.target : '', reach.full ? 'ครบเต็มรอบ ' + reach.full : ''].filter(Boolean).join(' · ');
  }
  roundCells(tr: Tr) {
    const total = this.targetOf(tr);
    const full = this.fullOf(tr);
    const done = tr.pendingDone;
    const returns = returnsOf(tr);
    const reach = this.reachRounds(tr);
    let sentSoFar = 0;
    return ROUNDS.map((round, i) => {
      const norm = normQty(tr.load[i]);
      const qty = Number(norm) || 0;
      const roundBack = returns.filter((e) => e[0] === round);
      const backOfRound = roundBack.reduce((t, e) => t + e[2], 0);
      sentSoFar += qty - backOfRound;
      const live = this.liveRound(tr, round, norm);
      const locked = this.roundFrozen(round); // คนขับยืนยันแล้ว หรือยืนยันจบรอบแล้ว (ยังไม่กดแก้ไข)
      const packNorm = normQty(tr.pack[i]);
      const packBy = packNorm === savedPackOf(tr, i) ? this.packDraftBy(tr, round) : '';
      const packDone = tr.pendingPack;
      const rest = Math.max(round2(total - sentSoFar), 0);
      const overAt = round2(sentSoFar - full);
      let status = '';
      let tone = '';
      if (norm === null) {
        status = 'จำนวนไม่ถูกต้อง';
        tone = 'over';
      } else if (overAt <= 0 && reach.full === round) {
        status = (reach.target && reach.target !== round ? 'ส่งเพิ่ม ' + fmt(round2(qty - backOfRound)) + ' · ' : '') + 'ครบเต็ม ' + fmt(full) + '/' + fmt(full);
        tone = 'done';
      } else if (overAt <= 0 && reach.target === round) {
        status = 'ครบ 80% · ' + fmt(round2(sentSoFar)) + '/' + fmt(full);
        tone = 'done';
      } else if (done === round) {
        status = 'ครบ';
        tone = 'done';
      } else if (qty > 0) {
        const backText = roundBack.map((e) => e[1] + ' ' + fmt(e[2]) + ' ').join('');
        status = overAt > 0 ? 'เกิน ' + fmt(overAt) : 'ได้ ' + fmt(round2(qty - backOfRound)) + ' ' + backText + 'ค้าง ' + fmt(rest);
        tone = overAt > 0 ? 'over' : '';
      }
      return {
        round,
        loadInvalid: norm === null,
        loadChanged: norm !== null && norm !== savedLoadOf(tr, i),
        live,
        liveTag: live ? tr.liveBy + ' · ขึ้นรอบันทึก' : '',
        locked,
        loadTick: done === round,
        loadTickDisabled: this.saving || locked || (done !== 0 && done !== round),
        packInvalid: packNorm === null,
        packChanged: packNorm !== null && packNorm !== savedPackOf(tr, i),
        packLive: packBy !== '',
        packTag: packBy ? packBy + ' · จัดรอบันทึก' : '',
        packTick: packDone === round,
        packTickDisabled: this.saving || locked || (packDone !== 0 && packDone !== round),
        status,
        tone,
        flash: tr.flash[i] > Date.now(),
      };
    });
  }

  // ---------- รูปจัดของ ----------
  savedPhotos(tr: Tr, round: number) {
    return tr.photos[round] || [];
  }
  photoEditOf(tr: Tr, round: number): PhotoEdit {
    return tr.photoEdit[round] || { adds: [], dels: [] };
  }
  photoPending(tr: Tr, round: number) {
    return !!tr.photoEdit[round];
  }
  photoTotal(tr: Tr, round: number) {
    const edit = this.photoEditOf(tr, round);
    return this.savedPhotos(tr, round).length - edit.dels.length + edit.adds.length;
  }
  setPhotoEdit(tr: Tr, round: number, edit: PhotoEdit) {
    if (edit.adds.length || edit.dels.length) tr.photoEdit[round] = edit;
    else delete tr.photoEdit[round];
    this.touch(tr);
    this.ctx++;
    this.emit();
  }
  // รูปที่จะส่งตอนบันทึก (รายการย่อยที่กำลังจะลบไม่ต้องส่ง)
  photoChanged(): { tr: Tr; round: number }[] {
    const out: { tr: Tr; round: number }[] = [];
    this.allTrs().forEach((tr) => {
      if (tr.isSub && tr.deleted) return;
      ROUNDS.forEach((round) => {
        if (this.photoPending(tr, round)) out.push({ tr, round });
      });
    });
    return out;
  }
  // รายการย่อยที่เพิ่งเพิ่ม (ยังไม่มี id): ถ่าย/เลือกรูปได้เลย เก็บไว้ในเครื่อง ส่งตามทันทีหลังบันทึกรายการย่อย (ผู้ใช้สั่ง 14 พ.ย. 69)
  photoWaitsSub(tr: Tr) {
    return tr.isSub && this.isNewSub(tr);
  }
  /** ส่งรูปที่แนบ/ลบของ 1 รายการ-รอบ · ทีละรูป (รูปจากกล้องมือถือไม่ได้ย่อในเครื่อง กันเกินที่เซิร์ฟเวอร์รับ) · พลาดโยน Error */
  async sendPhotos(tr: Tr, round: number) {
    const edit = this.photoEditOf(tr, round);
    const target = (form: FormData) => {
      form.append('round', String(round));
      if (tr.isSub) form.append('sub', String(tr.id));
      else form.append('ids', tr.ids.join(','));
    };
    let dels = edit.dels.slice();
    let photos: Photo[] | null = null;
    const queue = edit.adds.slice();
    if (!queue.length) {
      const form = new FormData();
      target(form);
      form.append('del', dels.join(','));
      photos = (await this.hooks.api('save_photos', form)).photos || [];
    }
    while (queue.length) {
      const add = queue[0];
      const form = new FormData();
      target(form);
      form.append('del', dels.join(','));
      form.append('photo[]', { uri: add.uri, name: 'photo.jpg', type: 'image/jpeg' } as any);
      photos = (await this.hooks.api('save_photos', form)).photos || [];
      // ส่งแล้ว: ตัวนี้ออกจากคิว · ลบที่ขอไปแล้วไม่ต้องส่งซ้ำ
      queue.shift();
      dels = [];
      const left = this.photoEditOf(tr, round);
      this.setPhotoEditQuiet(tr, round, { adds: left.adds.filter((a) => a.key !== add.key), dels: [] });
      tr.photos[round] = photos || [];
    }
    this.setPhotoEditQuiet(tr, round, { adds: [], dels: [] });
    tr.photos[round] = photos || [];
    this.touch(tr);
  }
  setPhotoEditQuiet(tr: Tr, round: number, edit: PhotoEdit) {
    if (edit.adds.length || edit.dels.length) tr.photoEdit[round] = edit;
    else delete tr.photoEdit[round];
  }
  // ถ่าย/ลบแล้วบันทึกทันที · ส่งไม่สำเร็จค้างไว้ในหน้า ส่งอีกครั้งตอนกดบันทึก · คืนข้อความแจ้ง ('' = สำเร็จ)
  async savePhotoNow(tr: Tr, round: number): Promise<string> {
    if (!this.photoPending(tr, round) || (tr.isSub && tr.deleted)) return '';
    if (this.photoWaitsSub(tr)) return 'รูปจะบันทึกพร้อมรายการย่อยนี้ตอนกดบันทึก';
    this.photoBusy = true;
    this.emit();
    try {
      await this.sendPhotos(tr, round);
      return '';
    } catch (err: any) {
      return 'ส่งรูปไม่สำเร็จ (' + err.message + ') จะส่งอีกครั้งตอนกดบันทึก';
    } finally {
      this.photoBusy = false;
      this.touch(tr);
      this.ctx++;
      this.emit();
    }
  }
  // กดบันทึกทั้งหน้า: รูปที่ค้างส่งทีละรายการ-รอบ · พลาดหยุดทันทีแล้วโยน Error พร้อมชื่อรายการ
  async savePhotos(onProgress?: (text: string) => void) {
    // รูปของรายการย่อยใหม่รอ id จากการบันทึกข้อมูล (sendNewSubPhotos)
    const list = this.photoChanged().filter(({ tr }) => !this.photoWaitsSub(tr));
    for (let i = 0; i < list.length; i++) {
      const { tr, round } = list[i];
      onProgress?.('กำลังส่งรูป ' + (i + 1) + '/' + list.length + '...');
      try {
        await this.sendPhotos(tr, round);
      } catch (err: any) {
        throw new Error(trName(tr) + ' รอบ ' + round + ': ' + err.message);
      }
    }
    if (list.length) onProgress?.('กำลังบันทึก...');
    return list.length;
  }
  /**
   * หลังบันทึกข้อมูล: ส่งรูปของรายการย่อยที่เพิ่งเพิ่ม ด้วย id ที่เซิร์ฟเวอร์ตอบกลับ (sub_ids {key: id})
   * ส่งไม่สำเร็จไม่โยน Error (ข้อมูลบันทึกไปแล้ว) คืนรูปที่ค้างไว้ให้ใส่กลับหลังโหลดหน้าใหม่ (restorePhotoAdds)
   */
  async sendNewSubPhotos(list: { tr: Tr; round: number }[], subIds: Record<string, any>, onProgress?: (text: string) => void) {
    const carry: PhotoCarry[] = [];
    const failed: string[] = [];
    let sent = 0;
    for (let i = 0; i < list.length; i++) {
      const { tr, round } = list[i];
      const id = num(subIds[tr.key]);
      if (!id) {
        failed.push(trName(tr) + ' รอบ ' + round);
        continue;
      }
      tr.id = id; // บันทึกแล้ว (หน้าโหลดใหม่ตามหลัง)
      onProgress?.('กำลังส่งรูปรายการย่อย ' + (i + 1) + '/' + list.length + '...');
      try {
        await this.sendPhotos(tr, round);
        sent++;
      } catch (err: any) {
        failed.push(trName(tr) + ' รอบ ' + round);
        const adds = this.photoEditOf(tr, round).adds;
        if (adds.length) carry.push({ sub: id, round, adds: adds.slice() });
      }
    }
    return { sent, failed, carry };
  }
  // ใส่รูปที่ส่งไม่สำเร็จกลับหลังโหลดหน้าใหม่ (ค้างเป็นรูปรอส่ง กดบันทึกส่งอีกครั้ง)
  restorePhotoAdds(carry: PhotoCarry[]) {
    carry.forEach(({ sub, round, adds }) => {
      const tr = this.rows.flatMap((row) => row.subs).find((s) => s.id === sub);
      if (!tr) return;
      const edit = this.photoEditOf(tr, round);
      // โหลดหน้าใหม่ไม่สำเร็จ = หน้าเดิม รูปยังค้างอยู่แล้ว ไม่ใส่ซ้ำ
      const fresh = adds.filter((add) => !edit.adds.some((a) => a.key === add.key));
      if (fresh.length) this.setPhotoEdit(tr, round, { adds: edit.adds.concat(fresh), dels: edit.dels.slice() });
    });
  }

  // ---------- ช่องขึ้นเห็นตามกัน (live) ----------
  liveKey(tr: Tr) {
    if (tr.isSub) return tr.id ? 's' + tr.id : '';
    return 'i' + tr.id;
  }
  loadNow(tr: Tr): LoadVal {
    return { r: ROUNDS.map((r) => normQty(tr.load[r - 1]) as string), d: tr.pendingDone };
  }
  loadSaved(tr: Tr): LoadVal | null {
    if (!tr.isSub) return { r: tr.savedLoad.slice(), d: tr.doneRound };
    return tr.saved ? { r: tr.saved.r.slice(), d: Number(tr.saved.done) || 0 } : null;
  }
  // ช่องขึ้นต่างจากค่าที่บันทึกแล้ว (จะบันทึกไปตอนกดบันทึก)
  loadPending(tr: Tr) {
    const saved = this.loadSaved(tr);
    return this.liveKey(tr) !== '' && saved !== null && !(tr.isSub && tr.deleted) && !sameJson(this.loadNow(tr), saved);
  }
  // เรากำลังพิมพ์ช่องขึ้นอยู่ ยังไม่ได้ส่งให้เครื่องอื่น
  loadMine(tr: Tr) {
    return this.liveKey(tr) !== '' && !(tr.isSub && tr.deleted) && tr.shared !== null && !sameJson(this.loadNow(tr), tr.shared);
  }
  // ค่าขึ้นที่แถวนี้ควรแสดง: ค่าที่มีคนกรอกค้าง (base ยังตรงค่าที่บันทึกแล้ว) หรือค่าที่บันทึกแล้ว · รอบที่ล็อกใช้ค่าที่บันทึกแล้ว
  liveTarget(tr: Tr): { value: LoadVal; by: string } {
    const saved = this.loadSaved(tr) as LoadVal;
    const entry = this.live[this.liveKey(tr)];
    if (!entry || !sameJson(entry.b, saved)) return { value: saved, by: '' };
    const r = ROUNDS.map((round, i) => (this.isLocked(round) ? saved.r[i] : str(entry.r[i])));
    const d = (saved.d && this.isLocked(saved.d)) || (entry.d && this.isLocked(entry.d)) ? saved.d : Number(entry.d) || 0;
    const value = { r, d };
    return sameJson(value, saved) ? { value: saved, by: '' } : { value, by: str(entry.by) };
  }
  // ใช้ค่าขึ้นที่ทุกเครื่องเห็นกับแถว: ช่องที่เราไม่ได้พิมพ์ค้างเปลี่ยนตาม
  applyLive(tr: Tr, flash: boolean) {
    if (!this.liveKey(tr) || (tr.isSub && tr.deleted) || this.loadSaved(tr) === null) return;
    const before = tr.shared || (this.loadSaved(tr) as LoadVal);
    const target = this.liveTarget(tr);
    const now = this.loadNow(tr);
    ROUNDS.forEach((round, i) => {
      if (now.r[i] !== before.r[i] || target.value.r[i] === now.r[i]) return;
      tr.load[i] = target.value.r[i];
      if (flash) tr.flash[i] = Date.now() + 2600;
    });
    if (now.d === before.d && target.value.d !== now.d) tr.pendingDone = target.value.d;
    tr.shared = { r: target.value.r.slice(), d: target.value.d };
    tr.liveBy = target.by === this.me ? '' : target.by;
    this.touch(tr);
  }
  // ช่องขึ้นรอบนี้กำลังแสดงค่าที่คนอื่นกรอกค้างอยู่ไหม
  liveRound(tr: Tr, round: number, norm: string | null) {
    if (!tr.liveBy || !tr.shared) return false;
    const shared = tr.shared;
    if (norm !== savedLoadOf(tr, round - 1) && norm === shared.r[round - 1]) return true;
    const done = tr.pendingDone;
    return done === round && done !== savedDone(tr) && shared.d === done;
  }
  liveWho(tr: Tr, round: number, value: string | null) {
    return this.liveRound(tr, round, value) ? ' (' + tr.liveBy + ' กรอก)' : '';
  }
  async sendLive(tr: Tr) {
    if (this.disposed || !this.loadMine(tr) || this.saving) return;
    const value = this.loadNow(tr);
    if (value.r.some((v) => v === null)) return; // พิมพ์ผิด ยังไม่ส่ง (แถบบันทึกบอกเอง)
    const saved = this.loadSaved(tr) as LoadVal;
    const key = this.liveKey(tr);
    const where = tr.isSub ? { sub: tr.id } : { id: tr.id };
    let ok = false;
    this.liveBusy++;
    this.liveSeq++;
    try {
      await this.hooks.api('live_load', { live: JSON.stringify({ ...where, r: value.r, d: value.d, base: saved }) });
      ok = true;
      this.liveSent = true;
      if (sameJson(value, saved)) delete this.live[key];
      else this.live[key] = { r: value.r, d: value.d, b: saved, by: this.me };
      tr.shared = value;
      tr.liveBy = '';
    } catch (err) {
      // ส่งไม่ได้: ค่ายังอยู่ในช่องของเรา กดบันทึกได้ตามปกติ
      if (Date.now() - this.liveToastAt > 30000) {
        this.liveToastAt = Date.now();
        this.hooks.toast('ส่งช่องขึ้นให้เครื่องอื่นเห็นไม่สำเร็จ · กดบันทึกได้ตามปกติ', true);
      }
    } finally {
      this.liveBusy--;
      this.touch(tr);
      if (ok && this.loadMine(tr) && !this.liveTimers.has(tr)) this.scheduleLive(tr, LIVE_MS);
      this.emit();
    }
  }
  queueLive(tr: Tr) {
    const t = this.liveTimers.get(tr);
    if (t) clearTimeout(t);
    this.liveTimers.delete(tr);
    this.liveChain = this.liveChain.then(() => this.sendLive(tr)).catch(() => {});
    return this.liveChain;
  }
  scheduleLive(tr: Tr, ms: number) {
    const t = this.liveTimers.get(tr);
    if (t) clearTimeout(t);
    this.liveTimers.set(
      tr,
      setTimeout(() => {
        this.liveTimers.delete(tr);
        void this.queueLive(tr);
      }, ms)
    );
  }
  cancelLive() {
    this.liveTimers.forEach((t) => clearTimeout(t));
    this.liveTimers.clear();
    return this.liveChain;
  }

  // ---------- กล่องจัดที่คนอื่นกรอกค้าง (drafts) ----------
  packDraftNames(tr: Tr, round: number): string[] {
    const names = new Set<string>();
    const take = (entry: any) => {
      const name = ((((entry || {}).pack || {})[round] || []) as string[])[0];
      if (name) names.add(name);
    };
    if (tr.isSub) {
      if (tr.id) take((this.drafts.subs || {})[tr.id]);
    } else {
      tr.ids.forEach((id) => take((this.drafts.items || {})[id]));
    }
    return Array.from(names);
  }
  packDraftBy(tr: Tr, round: number) {
    return this.packDraftNames(tr, round)
      .filter((name) => name !== this.me)
      .join(', ');
  }
  clearMyDrafts() {
    this.myPackTouched.clear();
    (['items', 'subs'] as const).forEach((part) =>
      Object.values(this.drafts[part] || {}).forEach((entry: any) => {
        Object.values((entry && entry.pack) || {}).forEach((names: any) => {
          if (Array.isArray(names)) names.splice(0, names.length, ...names.filter((name: string) => name !== this.me));
        });
      })
    );
  }

  // ---------- กล่องจัดบันทึกเอง (draft) ----------
  packAutoOk(tr: Tr) {
    if (tr.autoFailed) return false;
    if (tr.isSub && (this.isNewSub(tr) || tr.deleted)) return false;
    return ROUNDS.every((r) => normQty(tr.pack[r - 1]) !== null);
  }
  packValuesOf(tr: Tr) {
    return { p: ROUNDS.map((r) => normQty(tr.pack[r - 1]) as string), pd: tr.pendingPack };
  }
  packDirty(tr: Tr) {
    if (!tr.isSub) return this.packChanged(tr);
    const saved = tr.saved;
    const v = this.packValuesOf(tr);
    return saved !== null && (!sameJson(v.p, saved.p) || v.pd !== saved.pd);
  }
  /** แถวที่จะบันทึกของบรรทัดนี้: แจกเป็นรายการจริง ส่งเฉพาะรายการที่ค่าเปลี่ยน · base = ค่าที่บันทึกแล้ว (กันทับคนอื่น) */
  memberEntries(row: Row, packOnly = false) {
    const saved = row.members;
    return this.planMembers(row, packOnly).flatMap((m, i) => {
      const old = saved[i];
      const same =
        m.done === old.done &&
        m.pd === old.pd &&
        m.p80 === old.p80 &&
        m.stock === old.stock &&
        m.r.every((v, k) => Math.abs(v - old.r[k]) < 0.005) &&
        m.pk.every((v, k) => Math.abs(v - old.pk[k]) < 0.005);
      if (same) return [];
      const entry: any = { id: m.id, done: m.done, pd: m.pd, p80: m.p80, stock: m.stock, base: { done: old.done, pd: old.pd, p80: old.p80, stock: old.stock } };
      ROUNDS.forEach((round) => {
        entry['r' + round] = qtyText(m.r[round - 1]);
        entry.base['r' + round] = qtyText(old.r[round - 1]);
        entry['pk' + round] = qtyText(m.pk[round - 1]);
        entry.base['pk' + round] = qtyText(old.pk[round - 1]);
      });
      return [entry];
    });
  }
  packPayload(tr: Tr): any {
    if (!tr.isSub) {
      const rows = this.memberEntries(tr, true);
      return rows.length ? { rows } : null;
    }
    const saved = tr.saved as SubSaved;
    const v = this.packValuesOf(tr);
    return { subs: [{ op: 'edit', id: tr.id, base: subPayload(saved), ...subPayload({ ...saved, p: v.p, pd: v.pd }) }] };
  }
  // บันทึกแล้ว: กล่องจัดเป็นค่าที่บันทึกแล้ว (ช่องที่พิมพ์ต่อระหว่างส่งยังค้างไว้ส่งรอบถัดไป)
  packSaved(tr: Tr, data: any, sent: { p: string[]; pd: number }) {
    if (tr.isSub) {
      tr.saved = { ...(tr.saved as SubSaved), p: sent.p.map((v) => v || ''), pd: sent.pd };
      return;
    }
    const members = tr.members.map((m) => ({ ...m }));
    (data.rows || []).forEach((state: any) => {
      const member = members.find((m) => m.id === num(state.id));
      if (!member) return;
      member.pk = ROUNDS.map((round) => Number(state.packs?.[round]) || 0);
      member.pd = num(state.pack_round);
    });
    tr.members = members;
    ROUNDS.forEach((round, i) => {
      tr.savedPack[i] = sumOf(members, 'pk', round);
      if (normQty(tr.pack[i]) === sent.p[i]) tr.pack[i] = tr.savedPack[i];
    });
    const pd = mergedDone(members, 'pd');
    if (tr.pendingPack === sent.pd) tr.pendingPack = pd;
    tr.packRound = pd;
  }
  async autoSavePack(tr: Tr) {
    if (this.disposed) return;
    if (!this.packDirty(tr)) {
      tr.autoFailed = false;
      return;
    }
    if (tr.isSub && (this.isNewSub(tr) || tr.deleted)) return;
    if (ROUNDS.some((r) => normQty(tr.pack[r - 1]) === null)) return;
    const payload = this.packPayload(tr);
    if (!payload) return;
    payload.draft = 1; // ยังไม่ลงชื่อ/ประวัติ จนเรากดบันทึก
    const before = { p: ROUNDS.map((r) => savedPackOf(tr, r - 1) || ''), pd: savedPack(tr) };
    this.autoBusy++;
    tr.packState = 'saving';
    this.touch(tr);
    this.emit();
    try {
      let sent = this.packValuesOf(tr);
      let data: any;
      try {
        data = await this.hooks.api('save_changes', { changes: JSON.stringify(payload) });
      } catch (err: any) {
        if (!(err instanceof ApiError) || err.http !== 409) throw err;
        // มีคนบันทึกแถวนี้ไปก่อน: ค่าล่าสุดเป็นค่าเทียบ แล้วส่งค่าที่เรากรอกซ้ำ
        await this.syncForSave();
        if (!this.packDirty(tr)) {
          tr.autoFailed = false;
          return;
        }
        sent = this.packValuesOf(tr);
        data = await this.hooks.api('save_changes', { changes: JSON.stringify({ ...this.packPayload(tr), draft: 1 }) });
      }
      this.packSaved(tr, data, sent);
      ROUNDS.forEach((round, i) => {
        if ((sent.p[i] || '') !== before.p[i] || (sent.pd === round) !== (before.pd === round)) this.myPackTouched.add(this.liveKey(tr) + '|' + round);
      });
      this.myDrafts = num(data.drafts);
      tr.autoFailed = false;
      tr.packState = 'saved';
      setTimeout(() => {
        if (tr.packState === 'saved') {
          tr.packState = '';
          this.touch(tr);
          this.emit();
        }
      }, 1400);
    } catch (err: any) {
      tr.autoFailed = true;
      tr.packState = '';
      this.hooks.toast('บันทึกช่องจัดไม่สำเร็จ · ' + err.message, true);
    } finally {
      this.autoBusy--;
      if (tr.packState === 'saving') tr.packState = '';
      this.touch(tr);
      this.ctx++;
      this.emit();
    }
  }
  queueAutoSave(tr: Tr) {
    const t = this.autoTimers.get(tr);
    if (t) clearTimeout(t);
    this.autoTimers.delete(tr);
    this.autoChain = this.autoChain.then(() => this.autoSavePack(tr)).catch(() => {});
    return this.autoChain;
  }
  scheduleAutoSave(tr: Tr, ms: number) {
    const t = this.autoTimers.get(tr);
    if (t) clearTimeout(t);
    this.autoTimers.set(
      tr,
      setTimeout(() => {
        this.autoTimers.delete(tr);
        if (this.saving) this.scheduleAutoSave(tr, AUTO_MS);
        else void this.queueAutoSave(tr);
      }, ms)
    );
  }
  async flushAutoSaves() {
    Array.from(this.autoTimers.keys()).forEach((tr) => void this.queueAutoSave(tr));
    await this.autoChain;
  }

  // ---------- แถบบันทึก ----------
  saveBar() {
    const subs = this.subRows();
    const changedRows =
      this.rows.filter((row) => this.rowOtherChange(row) || (this.packChanged(row) && !this.packAutoOk(row))).length +
      subs.filter((s) => this.subChanged(s) && (this.isNewSub(s) || s.deleted || this.subOtherChange(s) || !this.packAutoOk(s))).length;
    const badQty = this.rows.filter((row) => this.qtyInvalid(row)).length;
    const badName = this.rows.filter((row) => this.nameEmpty(row)).length;
    const badSub = subs.filter((s) => this.subProblem(s)).length;
    const others = ROUNDS.filter((r) => this.headChanged(r)).length + ROUNDS.filter((r) => this.jobChanged(r)).length + this.photoChanged().length;
    const edits = changedRows + others;
    const total = edits + (this.myDrafts > 0 ? 1 : 0);
    const liveRows = this.allTrs().filter((tr) => this.loadPending(tr) && !this.loadMine(tr));
    const local =
      others +
      this.rows.filter((row) => this.p80Changed(row) || this.noteChanged(row) || this.nameChanged(row) || this.loadMine(row) || (this.packChanged(row) && !this.packAutoOk(row))).length +
      subs.filter((s) => this.subChanged(s) && (this.isNewSub(s) || s.deleted || this.subPlainChange(s) || this.loadMine(s) || !this.packAutoOk(s))).length;
    const liveNames = Array.from(new Set(liveRows.map((tr) => tr.liveBy).filter(Boolean)));
    const problems: string[] = [];
    if (badQty) problems.push('จำนวนไม่ถูกต้อง ' + badQty + ' แถว');
    if (badName) problems.push('ชื่อรายการว่าง ' + badName + ' แถว');
    if (badSub) problems.push('รายการย่อยใส่ชื่อหรือจำนวนไม่ครบ ' + badSub + ' แถว');
    ROUNDS.forEach((round) => {
      if (!this.roundTouched(round) || !this.desiredLines(round).length) return;
      const missing = headMissing(this.rounds[round].head);
      if (missing) problems.push('รอบ ' + round + ' ' + missing);
    });
    const dirty = local > 0 || this.autoTimers.size > 0 || this.autoBusy > 0 || this.liveTimers.size > 0 || this.liveBusy > 0;
    let message = 'กรอกช่องจัดแล้ว · กดบันทึกเพื่อลงชื่อผู้จัด';
    if (problems.length) message = problems.join(' · ') + ' แก้ก่อนบันทึก';
    else if (local || (edits && !liveRows.length)) message = 'แก้ไข ' + total + ' รายการ ยังไม่ได้บันทึก';
    else if (liveRows.length) message = 'ขึ้นรอบันทึก ' + liveRows.length + ' รายการ' + (liveNames.length ? ' (' + liveNames.join(', ') + ' กรอก)' : '') + ' · กดบันทึกเพื่อออกใบส่ง';
    const syncNote = this.staleBy !== null ? savedBy(this.staleBy) + 'ข้อมูลใหม่ · บันทึกของคุณแล้วหน้าจะอัปเดตเอง' : '';
    return { show: total > 0, total, problems, message, dirty, canSave: !this.saving && problems.length === 0, syncNote };
  }

  // ---------- รวบรวมสิ่งที่แก้ (collectChanges) ----------
  sortedGroups(): Group[] {
    const out: Group[] = [];
    ['goods', 'extra', 'skip'].forEach((sec) => {
      const list = this.groups.filter((g) => g.sec === sec);
      list.sort((a, b) => (this.sortMode === 'name' ? a.name.localeCompare(b.name, 'th', { numeric: true }) : a.order - b.order));
      out.push(...list);
    });
    return out;
  }
  orderedRows(): Row[] {
    return this.sortedGroups().flatMap((g) => g.rows);
  }
  collectChanges() {
    const changes: Changes = { rows: [], notes: [], names: [], rounds: {}, rounds_saved: {}, round_base: {}, header: {}, subs: [], jobs: {}, live_clear: [], confirm: 0 };
    const lines: ChangeLine[] = [];
    let ticked = 0;
    let unticked = 0;
    const rows = this.orderedRows();
    rows.forEach((row) => {
      const parts: string[] = [];
      const ids = row.members.map((m) => m.id);
      if (this.nameChanged(row)) {
        const name = row.nameInput.trim();
        row.members.forEach((m) => changes.names.push({ id: m.id, name, base: m.name }));
        parts.push('เปลี่ยนชื่อเป็น: ' + name + (ids.length > 1 ? ' (ทั้ง ' + ids.length + ' รายการ)' : ''));
      }
      if (this.rowChanged(row)) {
        changes.rows.push(...this.memberEntries(row));
        if (this.p80Changed(row)) parts.push(row.p80 ? 'ติ๊ก 80%: จำนวน ' + fmt(row.qty) + ' → ' + fmt(this.targetQty(row)) : 'ยกเลิก 80%: จำนวนกลับเป็น ' + fmt(row.qty));
        ROUNDS.forEach((round) => {
          ([['pack', 'จัด'], ['load', 'ขึ้น']] as const).forEach(([box, word]) => {
            const value = normQty(row[box][round - 1]);
            const saved = box === 'load' ? row.savedLoad[round - 1] : row.savedPack[round - 1];
            if (value !== saved) {
              const who = box === 'load' ? this.liveWho(row, round, value) : '';
              parts.push(word + 'รอบ ' + round + ': ' + (saved ? fmt(saved) : '-') + ' → ' + (value ? fmt(value) : '-') + who);
            }
          });
        });
        if (row.pendingPack !== row.packRound) {
          if (row.packRound) parts.push('ยกเลิกจัดครบรอบ ' + row.packRound);
          if (row.pendingPack) parts.push('ติ๊กจัดครบรอบ ' + row.pendingPack);
        }
        if (row.pendingDone !== row.doneRound) {
          if (row.doneRound) {
            parts.push('ยกเลิกขึ้นครบรอบ ' + row.doneRound);
            unticked++;
          }
          if (row.pendingDone) {
            parts.push('ติ๊กขึ้นครบรอบ ' + row.pendingDone);
            ticked++;
          }
        }
      }
      if (this.noteChanged(row)) {
        const text = row.note.trim();
        // base = หมายเหตุที่เห็นตอนโหลด · มีคนแก้ไปก่อน เซิร์ฟเวอร์ตอบ 409 ไม่ลบ/ทับของคนอื่น (เหมือนเว็บ)
        ids.forEach((id) => changes.notes.push({ id, note: text, base: row.noteSaved }));
        parts.push(text ? 'หมายเหตุ: ' + text : 'ลบหมายเหตุ');
      }
      if (parts.length) lines.push({ name: row.name, where: row.where, text: parts.join(' · ') });
    });

    // รายการย่อยที่เพิ่ม/แก้/ลบ (ไม่ออกในใบส่งของ)
    rows.flatMap((row) => row.subs).filter((s) => this.subChanged(s)).forEach((sub) => {
      const v = this.subValues(sub);
      const saved = sub.saved;
      const where = 'ย่อยของ ' + sub.parent.name;
      const unit = v.unit ? ' ' + v.unit : '';
      if (this.isNewSub(sub)) {
        // k = รหัสชั่วคราว เซิร์ฟเวอร์ตอบ id กลับใน sub_ids ให้ส่งรูปที่แนบไว้ตามไป
        changes.subs.push({ op: 'add', parent: sub.parent.id, k: sub.key, ...subPayload(v) });
        const rounds = ROUNDS.flatMap((round) => [v.p[round - 1] ? 'จัดรอบ ' + round + ': ' + fmt(v.p[round - 1]) : '', v.r[round - 1] ? 'ขึ้นรอบ ' + round + ': ' + fmt(v.r[round - 1]) : '']).filter(Boolean);
        lines.push({ name: v.name || '(ยังไม่มีชื่อ)', where, text: ['เพิ่มรายการย่อย จำนวน ' + fmt(v.qty || 0) + unit].concat(rounds).join(' · ') });
        return;
      }
      const s = saved as SubSaved;
      if (sub.deleted) {
        changes.subs.push({ op: 'delete', id: sub.id, base: subPayload(s) });
        lines.push({ name: s.name, where, text: 'ลบรายการย่อย' });
        return;
      }
      changes.subs.push({ op: 'edit', id: sub.id, base: subPayload(s), ...subPayload(v) });
      const parts: string[] = [];
      if (v.name !== s.name) parts.push('เปลี่ยนชื่อเป็น: ' + v.name);
      if (v.qty !== s.qty) parts.push('จำนวน: ' + fmt(s.qty) + ' → ' + fmt(v.qty || 0));
      if (v.unit !== s.unit) parts.push('หน่วย: ' + (s.unit || '-') + ' → ' + (v.unit || '-'));
      ROUNDS.forEach((round, i) => {
        if (v.p[i] !== s.p[i]) parts.push('จัดรอบ ' + round + ': ' + (s.p[i] ? fmt(s.p[i]) : '-') + ' → ' + (v.p[i] ? fmt(v.p[i]) : '-'));
        if (v.r[i] !== s.r[i]) parts.push('ขึ้นรอบ ' + round + ': ' + (s.r[i] ? fmt(s.r[i]) : '-') + ' → ' + (v.r[i] ? fmt(v.r[i]) : '-') + this.liveWho(sub, round, v.r[i]));
      });
      if (v.pd !== s.pd) {
        if (s.pd) parts.push('ยกเลิกจัดครบรอบ ' + s.pd);
        if (v.pd) parts.push('ติ๊กจัดครบรอบ ' + v.pd);
      }
      if (v.done !== s.done) {
        if (s.done) parts.push('ยกเลิกขึ้นครบรอบ ' + s.done);
        if (v.done) parts.push('ติ๊กขึ้นครบรอบ ' + v.done);
      }
      if (v.note !== s.note) parts.push(v.note ? 'หมายเหตุ: ' + v.note : 'ลบหมายเหตุ');
      lines.push({ name: s.name, where, text: parts.join(' · ') });
    });

    // รูปจัดของที่แนบ/ลบ (ส่งก่อนข้อมูลอื่น ทีละรายการ-รอบ)
    this.photoChanged().forEach(({ tr, round }) => {
      const edit = this.photoEditOf(tr, round);
      const parts: string[] = [];
      if (edit.adds.length) parts.push('แนบ ' + edit.adds.length + ' รูป');
      if (edit.dels.length) parts.push('ลบ ' + edit.dels.length + ' รูป');
      const where = tr.isSub ? 'ย่อยของ ' + tr.parent.name + ' · ' : '';
      lines.push({ name: trName(tr), where: where + 'รูปจัดของ รอบ ' + round, text: parts.join(' · ') });
    });

    // ใบส่งของ: รอบที่จำนวนหรือหัวใบเปลี่ยน จะออก/แก้/ยกเลิกใบส่งให้ตรงกับหน้า
    const doLines: ChangeLine[] = [];
    ROUNDS.forEach((round) => {
      const card = this.rounds[round];
      changes.round_base[round] = card.do;
      if (this.headChanged(round)) {
        changes.rounds[round] = card.head;
        changes.rounds_saved[round] = card.savedHead;
      }
      // วันที่ขึ้นของ (ไม่อยู่ในใบส่ง) บอกแยกบรรทัด · แก้อย่างเดียวไม่แตะใบส่ง
      if (card.head.load_at !== card.savedHead.load_at)
        doLines.push({ name: 'วันที่ขึ้นของ รอบ ' + round, where: '', text: card.head.load_at ? thaiDateTime(card.head.load_at) : 'ล้างวันที่ขึ้นของ' });
      if (this.jobNoteChanged(round))
        doLines.push({ name: 'หมายเหตุจัดงาน รอบ ' + round, where: '', text: card.head.job_note.trim() || 'ล้างหมายเหตุจัดงาน' });
      if (!this.roundTouched(round)) return;
      const want = this.desiredLines(round);
      const no = card.hasDo ? card.do : '';
      let text = '';
      if (want.length) text = (no ? 'แก้ใบส่ง ' + no : 'ออกใบส่งใหม่') + ' · ' + want.length + ' รายการ · ' + headSummary(card.head);
      else if (no) text = 'ยกเลิกใบส่ง ' + no + ' (ไม่มีของจากคลังในรอบนี้แล้ว)';
      else if (this.headDoChanged(round)) text = 'แก้ข้อมูลใบส่ง · ' + headSummary(card.head);
      if (text) doLines.push({ name: 'ใบส่งของ รอบ ' + round, where: '', text });
    });

    // เบิกสต๊อกอัตโนมัติตามยอดส่งที่เปลี่ยน
    let stockCount = 0;
    this.rows.filter((row) => this.rowChanged(row)).forEach((row) => {
      const plan = this.stockPlan(row);
      const line = plan && this.stockLine(row, plan);
      if (!line) return;
      lines.push(line);
      if (plan && plan.delta !== 0) stockCount++;
    });

    // ของในคลังไม่พอ: เตือนแต่ให้ส่งได้
    this.rows.filter((row) => row.ships && this.rowChanged(row)).forEach((row) => {
      const want = this.planMembers(row).reduce((t, m) => t + doSplit(m.r, Number(m.site) || 0).reduce((a, b) => a + b, 0), 0);
      const plan = this.stockPlan(row);
      const avail = round2((Number(row.avail) || 0) + (plan ? plan.delta : 0));
      if (want > avail + 0.005) {
        doLines.push({ name: row.name, where: '⚠ เกินของในคลัง', text: 'ออกใบส่งรวม ' + fmt(want) + ' แต่คลังมี ' + fmt(avail) + ' (บันทึกได้ คลังยังไม่ได้รับเข้าในระบบ)' });
      }
    });
    lines.push(...doLines);

    ROUNDS.filter((r) => this.jobChanged(r)).forEach((round) => {
      const on = this.rounds[round].jobOn;
      changes.jobs[round] = { on: on ? '1' : '0', base: this.rounds[round].jobSaved ? '1' : '0' };
      lines.push({ name: 'สถานะจัดงาน', where: '', text: (on ? 'แจ้งจัดงานแล้ว รอบที่ ' : 'ยกเลิกแจ้งจัดงาน รอบที่ ') + round });
    });
    // ช่องขึ้นที่บันทึกในชุดนี้ ล้างค่าค้างที่ทุกเครื่องเห็นอยู่
    changes.live_clear = this.allTrs().filter((tr) => this.loadPending(tr)).map((tr) => this.liveKey(tr));
    // กล่องจัดที่บันทึกเองไว้ ลงชื่อผู้จัดตอนกดบันทึกนี้
    changes.confirm = this.myDrafts > 0 ? 1 : 0;
    if (changes.confirm) lines.push({ name: 'ลงชื่อผู้จัด', where: '', text: 'ช่องจัดที่กรอกไว้ (ค่าบันทึกแล้ว) ลงชื่อคุณเป็นผู้จัด' });
    return { changes, lines, ticked, unticked, stockCount };
  }
  hasDataChanges(changes: Changes) {
    return (
      changes.rows.length + changes.notes.length + changes.names.length + changes.subs.length > 0 ||
      Object.keys(changes.rounds).length + Object.keys(changes.jobs).length + Object.keys(changes.header).length > 0 ||
      changes.confirm === 1
    );
  }

  // เก็บค่าที่บันทึกแล้วลงรายการจริงในบรรทัดก่อน แล้วค่อยรวมเป็นค่าของบรรทัด
  applySaved(data: any) {
    const touched = new Map<Row, any[]>();
    (data.rows || []).forEach((state: any) => {
      const row = this.rowOfItem.get(num(state.id));
      if (!row) return;
      const members = row.members.map((m) => ({ ...m }));
      const member = members.find((m) => m.id === num(state.id));
      if (!member) return;
      member.r = ROUNDS.map((round) => Number(state.rounds?.[round]) || 0);
      member.done = num(state.done_round);
      member.pk = ROUNDS.map((round) => Number(state.packs?.[round]) || 0);
      member.pd = num(state.pack_round);
      member.p80 = num(state.p80);
      member.stock = num(state.stock);
      row.members = members;
      if (!touched.has(row)) touched.set(row, []);
      touched.get(row)!.push(state);
    });
    touched.forEach((states, row) => {
      const members = row.members;
      ROUNDS.forEach((round, i) => {
        row.load[i] = sumOf(members, 'r', round);
        row.savedLoad[i] = row.load[i];
        row.pack[i] = sumOf(members, 'pk', round);
        row.savedPack[i] = row.pack[i];
      });
      row.packRound = mergedDone(members, 'pd');
      row.pendingPack = row.packRound;
      const done = mergedDone(members);
      row.doneRound = done;
      row.pendingDone = done;
      row.shared = this.loadSaved(row);
      row.liveBy = '';
      const doneState = states.find((s) => done > 0 && num(s.done_round) === done);
      if (!done) row.doneText = '';
      else if (doneState) row.doneText = str(doneState.done_text);
      row.p80 = members.some((m) => m.p80 === 1);
      row.p80Saved = row.p80;
      this.touch(row);
    });
    (data.notes || []).forEach((saved: any) => {
      const row = this.rowOfItem.get(num(saved.id));
      if (!row) return;
      row.note = str(saved.note);
      row.noteSaved = row.note;
      this.touch(row);
    });
    (data.names || []).forEach((saved: any) => {
      const row = this.rowOfItem.get(num(saved.id));
      if (!row) return;
      row.nameInput = str(saved.name);
      row.nameSaved = row.nameInput;
      row.name = row.nameInput;
      row.renaming = false;
      this.touch(row);
    });
    Object.entries(data.jobs || {}).forEach(([round, saved]: [string, any]) => {
      const card = this.rounds[Number(round)];
      if (!card) return;
      card.jobOn = num(saved.on) === 1;
      card.jobSaved = card.jobOn;
      card.jobText = str(saved.text);
      card.jobAt = str(saved.at);
    });
    this.ctx++;
  }

  /**
   * ส่งทุกการแก้ไขไปบันทึก (รูปก่อน แล้วข้อมูลอื่นครั้งเดียว แล้วรูปของรายการย่อยใหม่) คืน { reload, message } · พลาดโยน Error
   * photoFail = ข้อมูลบันทึกแล้วแต่ส่งรูปรายการย่อยใหม่ไม่สำเร็จ · carry = รูปที่ใส่กลับหลังโหลดหน้าใหม่
   */
  async saveAll(onProgress?: (text: string) => void): Promise<{ reload: boolean; message: string; photoFail?: string; carry?: PhotoCarry[] }> {
    this.linkPacksForSave(); // ทางบันทึกที่ไม่ผ่านหน้าต่างยืนยัน ช่องจัดก็ตามช่องขึ้น
    await this.flushAutoSaves();
    await this.cancelLive();
    const { changes } = this.collectChanges();
    this.saving = true;
    this.ctx++;
    this.emit();
    try {
      const photoCount = await this.savePhotos(onProgress);
      const photoText = photoCount ? ' · รูปจัดของ ' + photoCount + ' รายการ' : '';
      if (!this.hasDataChanges(changes)) return { reload: false, message: 'บันทึกแล้ว' + photoText };
      const photoNote = photoCount ? ' (รูปจัดของบันทึกแล้ว)' : '';
      let data: any;
      try {
        data = await this.hooks.api('save_changes', { changes: JSON.stringify(changes) });
      } catch (err: any) {
        if (!(err instanceof ApiError) || err.http !== 409) throw new Error(err.message + photoNote);
        // มีคนบันทึกไปก่อนไม่กี่วินาที: ดึงค่าล่าสุดมาเป็นค่าเทียบ · ไม่ได้แก้ช่องเดียวกัน = บันทึกซ้ำให้เลย
        onProgress?.('มีคนเพิ่งบันทึก กำลังดึงค่าล่าสุด...');
        let clashes = 0;
        try {
          clashes = await this.syncForSave();
        } catch (e) {
          throw new Error(err.message + photoNote);
        }
        if (clashes) throw new Error('มีคนบันทึกช่องเดียวกันไปก่อน เลือกค่าที่ป้ายสีส้มแล้วกดบันทึกอีกครั้ง' + photoNote);
        const retry = this.collectChanges().changes;
        if (!this.hasDataChanges(retry)) return { reload: false, message: 'ค่าตรงกับที่มีคนเพิ่งบันทึกแล้ว' + photoNote };
        onProgress?.('กำลังบันทึก...');
        try {
          data = await this.hooks.api('save_changes', { changes: JSON.stringify(retry) });
        } catch (again: any) {
          throw new Error(again.message + photoNote);
        }
      }
      // รายการย่อยใหม่ที่แนบรูปไว้ (เก็บก่อน applySaved · ยังเป็นตัวใหม่อยู่จนโหลดหน้าใหม่)
      const newSubPhotos = this.photoChanged().filter(({ tr }) => this.photoWaitsSub(tr));
      this.applySaved(data);
      this.myDrafts = num(data.drafts);
      if (!this.myDrafts) this.clearMyDrafts();
      ROUNDS.forEach((round) => {
        this.rounds[round].savedHead = { ...this.rounds[round].head };
      });
      let subPhotoText = '';
      let photoFail = '';
      let carry: PhotoCarry[] = [];
      if (newSubPhotos.length) {
        const res = await this.sendNewSubPhotos(newSubPhotos, data.sub_ids || {}, onProgress);
        if (res.sent) subPhotoText = ' · รูปรายการย่อย ' + res.sent + ' รายการ';
        if (res.failed.length) {
          photoFail = 'บันทึกแล้ว แต่ส่งรูปไม่สำเร็จ: ' + res.failed.join(', ') + (res.carry.length ? ' · รูปค้างไว้ กดบันทึกอีกครั้ง' : ' · แนบรูปใหม่อีกครั้ง');
        }
        carry = res.carry;
      }
      const message = 'บันทึกแล้ว' + photoText + subPhotoText + (data.stock_count ? ' · เบิกสต๊อกอัตโนมัติ ' + data.stock_count + ' รายการ' : '');
      // รายการย่อยที่เพิ่ม/ลบ ชื่อเปลี่ยน หรือออก/แก้ใบส่ง: ต้องวาดหน้าใหม่จากเซิร์ฟเวอร์
      return { reload: Boolean(data.reload) || changes.subs.length > 0, message, photoFail, carry };
    } finally {
      this.saving = false;
      this.touchAll();
      this.emit();
    }
  }

  /** ยกเลิกการแก้ไข: คืนทุกช่อง · กล่องจัดที่บันทึกเองไว้/ช่องขึ้นที่ส่งไปแล้ว ให้เซิร์ฟเวอร์ถอยกลับ */
  async discard() {
    this.autoTimers.forEach((t) => clearTimeout(t));
    this.autoTimers.clear();
    this.allTrs().forEach((tr) => {
      tr.autoFailed = false;
    });
    await this.autoChain;
    await this.cancelLive();
    this.rows.forEach((row) => {
      ROUNDS.forEach((round, i) => {
        row.load[i] = row.savedLoad[i];
        row.pack[i] = row.savedPack[i];
      });
      row.pendingDone = row.doneRound;
      row.pendingPack = row.packRound;
      row.p80 = row.p80Saved;
      row.note = row.noteSaved;
      row.nameInput = row.nameSaved;
      row.renaming = false;
      row.subs = row.subs.filter((s) => !this.isNewSub(s));
      row.subs.forEach((s) => this.resetSub(s));
      this.touch(row);
    });
    ROUNDS.forEach((round) => {
      const card = this.rounds[round];
      card.head = { ...card.savedHead };
      card.jobOn = card.jobSaved;
    });
    this.allTrs().forEach((tr) => {
      tr.photoEdit = {};
    });
    // ช่องขึ้น: ค่าที่เรากรอกค้างไว้ล้างทิ้ง · ค่าที่คนอื่นกรอกค้างยังแสดงตามเดิม
    const hadLive = this.liveSent || Object.values(this.live).some((entry) => entry.by === this.me);
    Object.keys(this.live).forEach((key) => {
      if (this.live[key].by === this.me) delete this.live[key];
    });
    this.allTrs().forEach((tr) => {
      if (!this.liveKey(tr)) return;
      tr.shared = this.loadSaved(tr);
      this.applyLive(tr, false);
    });
    this.touchAll();
    this.emit();
    if (this.myDrafts > 0 || hadLive) {
      await this.hooks.api('discard_drafts', {});
      this.myDrafts = 0;
      this.liveSent = false;
      this.clearMyDrafts();
      await this.syncForSave();
      return hadLive ? 'ยกเลิกแล้ว ช่องที่กรอกไว้กลับเป็นค่าเดิม' : 'ยกเลิกแล้ว ช่องจัดกลับเป็นค่าเดิม';
    }
    return '';
  }

  // ---------- อัปเดตอัตโนมัติ (sync) ----------
  markOf(entry: any, box: string, round: number): [string, string] | null {
    const draft = ((entry.drafts || {})[box] || {})[round];
    return draft ? [draft, ''] : ((entry.marks && entry.marks[box]) || {})[round] || null;
  }
  addConflict(tr: Tr, round: number, key: string, text: string, useTheirs: () => void, still: () => boolean) {
    this.syncClashes++;
    tr.conflicts = tr.conflicts.filter((c) => !(c.key === key && c.round === round)).concat([{ key, round, text, useTheirs, still }]);
  }
  boxClash(tr: Tr, round: number, box: 'pack' | 'load', value: string, mark: [string, string] | null) {
    const unit = tr.isSub ? unitText(tr.unit.trim()) : unitText(tr.unit);
    const arr = box === 'pack' ? 'pack' : 'load';
    this.addConflict(
      tr,
      round,
      box,
      (mark ? mark[0] + ' ' : 'มีคน') + (box === 'pack' ? 'บันทึกจัด ' : 'บันทึกขึ้น ') + (value ? fmt(value) + unit : 'ว่าง'),
      () => {
        tr[arr][round - 1] = value;
      },
      () => normQty(tr[arr][round - 1]) !== (box === 'pack' ? savedPackOf(tr, round - 1) : savedLoadOf(tr, round - 1))
    );
  }
  tickClash(tr: Tr, box: 'pack' | 'load', saved: number, mark: [string, string] | null) {
    const word = box === 'pack' ? 'จัดครบ' : 'ขึ้นครบ';
    const who = mark ? mark[0] + ' ' : 'มีคน';
    const cur = box === 'pack' ? tr.pendingPack : tr.pendingDone;
    this.addConflict(
      tr,
      saved || cur || 1,
      'tick-' + box,
      saved ? who + 'ติ๊ก' + word + 'รอบ ' + saved : who + 'เอาติ๊ก' + word + 'ออก',
      () => {
        if (box === 'pack') tr.pendingPack = saved;
        else tr.pendingDone = saved;
      },
      () => (box === 'pack' ? tr.pendingPack : tr.pendingDone) !== saved
    );
  }
  syncPhotos(tr: Tr, photos: any) {
    let changed = false;
    ROUNDS.forEach((round) => {
      if (this.photoPending(tr, round)) return;
      const list = (photos || {})[round] || (photos || {})[String(round)] || [];
      if (sameJson(list, this.savedPhotos(tr, round))) return;
      tr.photos[round] = list;
      changed = true;
    });
    return changed;
  }
  syncTicks(tr: Tr, values: { load: number; pack: number }, entry: any) {
    let changed = false;
    (['load', 'pack'] as const).forEach((box) => {
      const before = box === 'load' ? savedDone(tr) : savedPack(tr);
      const after = values[box];
      if (after === before) return;
      changed = true;
      const mine = box === 'load' ? tr.pendingDone : tr.pendingPack;
      if (!tr.isSub) {
        if (box === 'load') tr.doneRound = after;
        else tr.packRound = after;
      }
      if (box === 'load') return; // ขึ้นครบเปลี่ยนตามค่าที่ทุกเครื่องเห็น (applyLive)
      if (mine === before) tr.pendingPack = after;
      else if (mine !== after) this.tickClash(tr, box, after, this.markOf(entry, box, after || before));
    });
    return changed;
  }
  syncLine(row: Row, line: any) {
    const members: Member[] = (line.members || []).map((m: any) => ({
      id: num(m.id), name: str(m.name), qty: num(m.qty), site: num(m.site), r: (m.r || ROUNDS.map(() => 0)).map(num), back: num(m.back),
      done: num(m.done), pk: (m.pk || ROUNDS.map(() => 0)).map(num), pd: num(m.pd), p80: num(m.p80), stock: num(m.stock),
    }));
    let changed = false;
    ROUNDS.forEach((round, i) => {
      // กล่องจัด
      const beforeP = row.savedPack[i];
      const afterP = sumOf(members, 'pk', round);
      if (afterP !== beforeP) {
        changed = true;
        const mine = normQty(row.pack[i]);
        row.savedPack[i] = afterP;
        if (mine === beforeP) {
          row.pack[i] = afterP;
          row.flash[i] = Date.now() + 2600;
        } else if (mine !== afterP) {
          this.boxClash(row, round, 'pack', afterP, this.markOf(line, 'pack', round));
        }
      }
      // กล่องขึ้น: เปลี่ยนตามค่าที่ทุกเครื่องเห็น (applyLive หลังอัปเดตทั้งหน้า)
      const afterL = sumOf(members, 'r', round);
      if (afterL !== row.savedLoad[i]) {
        changed = true;
        row.savedLoad[i] = afterL;
      }
    });
    if (this.syncTicks(row, { load: mergedDone(members), pack: mergedDone(members, 'pd') }, line)) changed = true;
    const p80After = members.some((m) => m.p80 === 1);
    if (p80After !== row.p80Saved) {
      changed = true;
      if (!this.p80Changed(row)) row.p80 = p80After;
      row.p80Saved = p80After;
    }
    const note = str(line.note);
    if (note !== row.noteSaved) {
      changed = true;
      if (!this.noteChanged(row)) row.note = note;
      row.noteSaved = note;
    }
    row.members = members;
    row.doneText = savedDone(row) > 0 ? str(line.done_text) : '';
    row.back = (line.back || []).map((e: any) => [num(e[0]), str(e[1]), num(e[2])] as [number, string, number]);
    row.stock = line.stock || null;
    row.avail = num(line.avail);
    row.site = num(line.site);
    // บิลในช่องหมายเหตุ (คลังกดรับ: ส่งคลังรอรับ → คลังรับแล้ว / เปิดบิลใหม่) เปลี่ยนตามทันที ไม่นับเป็นการบันทึกของคนในหน้า
    if (Array.isArray(line.po) && !sameJson(row.po, line.po)) row.po = line.po;
    if (this.syncPhotos(row, line.photos)) changed = true;
    this.touch(row);
    return changed;
  }
  syncSub(sub: Sub, data: any) {
    const before = sub.saved as SubSaved;
    const after = this.subSavedOf(data.saved);
    const photosChanged = this.syncPhotos(sub, data.photos);
    if (sameJson(before, after)) return photosChanged;
    const mine = this.subValues(sub);
    if (after.name !== before.name && mine.name === before.name) sub.name = after.name;
    if (after.qty !== before.qty && mine.qty === before.qty) sub.qty = after.qty;
    if (after.unit !== before.unit && mine.unit === before.unit) sub.unit = after.unit;
    if (after.note !== before.note && mine.note === before.note) sub.note = after.note;
    sub.saved = after;
    ROUNDS.forEach((round, i) => {
      if (after.p[i] === before.p[i]) return;
      if (mine.p[i] === before.p[i]) {
        sub.pack[i] = after.p[i];
        sub.flash[i] = Date.now() + 2600;
      } else if (mine.p[i] !== after.p[i]) {
        this.boxClash(sub, round, 'pack', after.p[i], this.markOf(data, 'pack', round));
      }
    });
    // ติ๊กของรายการย่อย: ค่าเทียบอยู่ใน saved (ตั้งแล้วด้านบน) จึงเทียบกับ before เอง
    if (after.pd !== before.pd) {
      if (sub.pendingPack === before.pd) sub.pendingPack = after.pd;
      else if (sub.pendingPack !== after.pd) this.tickClash(sub, 'pack', after.pd, this.markOf(data, 'pack', after.pd || before.pd));
    }
    sub.doneText = after.done > 0 ? str(data.done_text) : '';
    this.touch(sub);
    return true;
  }
  syncRounds(rounds: any) {
    let changed = false;
    ROUNDS.forEach((round) => {
      const info = rounds?.[String(round)] || rounds?.[round];
      if (!info) return;
      const card = this.rounds[round];
      const locked = num(info.locked) === 1;
      if (card.locked !== locked || card.do !== str(info.do)) changed = true;
      card.do = str(info.do);
      card.hasDo = num(info.has_do) === 1;
      card.locked = locked;
      const head = readHead(info.head);
      if (!sameJson(head, card.savedHead)) {
        if (!this.headChanged(round)) card.head = { ...head };
        card.savedHead = head;
        changed = true;
      }
      card.printed = str(info.printed);
      const saved = num(info.job_on) === 1;
      if (card.jobSaved !== saved || card.jobText !== str(info.job_text)) {
        if (!this.jobChanged(round)) card.jobOn = saved;
        card.jobSaved = saved;
        card.jobText = str(info.job_text);
        card.jobAt = str(info.job_at);
        changed = true;
      }
      // ยืนยันจบรอบ (มีคนกดจบ / แจ้งจัดงานใหม่แล้วล้าง) · ช่องรอบนี้เปิด/ปิดตาม (roundFrozen) ผู้เรียกวาดทุกแถวใหม่
      const done = num(info.done_on) === 1;
      if (card.done !== done || card.doneText !== str(info.done_text)) {
        card.done = done;
        card.doneText = str(info.done_text);
        changed = true;
      }
    });
    return changed;
  }
  /** ใช้ค่าที่บันทึกแล้วชุดใหม่ทั้งหน้า คืน { count, clashes } */
  applySync(data: any) {
    this.syncClashes = 0;
    if (data.returns) this.returns = readReturns(data.returns); // รับของคืน (ป้ายในการ์ด + กล่องรายการ วาดใหม่ตาม ctx)
    const lines = data.lines || {};
    const subs = data.subs || {};
    let count = 0;
    this.rows.forEach((row) => {
      const line = lines[String(row.id)];
      if (line && this.syncLine(row, line)) count++;
    });
    this.subRows().forEach((sub) => {
      const s = sub.id ? subs[String(sub.id)] : null;
      if (s && this.syncSub(sub, s)) count++;
    });
    const roundsChanged = this.syncRounds(data.rounds || {});
    this.live = data.live && typeof data.live === 'object' ? data.live : {};
    this.allTrs().forEach((tr) => this.applyLive(tr, true));
    this.drafts = { items: data.drafts?.items || {}, subs: data.drafts?.subs || {} };
    this.syncStamp = str(data.stamp);
    this.syncLog = Math.max(this.syncLog, num(data.log));
    if (data.struct && data.struct !== this.struct) this.staleBy = Array.isArray(data.by) ? data.by : [];
    this.touchAll();
    if (count && Date.now() - this.syncToastAt > 30000) {
      this.syncToastAt = Date.now();
      this.hooks.toast(savedBy(data.by) + ' ' + count + ' รายการ · อัปเดตแล้ว');
    } else if (!count && roundsChanged) {
      this.hooks.toast(savedBy(data.by) + 'ข้อมูลรอบ · อัปเดตแล้ว');
    }
    // ป้ายเราอยู่ไหม ค่าตรงกันแล้วป้ายหายเอง
    this.cleanConflicts();
    return { count, clashes: this.syncClashes };
  }
  cleanConflicts() {
    this.allTrs().forEach((tr) => {
      if (!tr.conflicts.length) return;
      const keep = tr.conflicts.filter((c) => c.still());
      if (keep.length !== tr.conflicts.length) {
        tr.conflicts = keep;
        this.touch(tr);
      }
    });
  }
  async fetchSync(force: boolean) {
    const data = await this.hooks.api('sync', { stamp: force ? '' : this.syncStamp, log: String(this.syncLog) });
    if (Array.isArray(data.presence)) this.presence = data.presence;
    return data;
  }
  async syncForSave() {
    const data = await this.fetchSync(true);
    return this.applySync(data).clashes;
  }
  startSync(delay = 500) {
    this.syncRunning = true;
    this.scheduleSync(delay);
  }
  stopSync() {
    this.syncRunning = false;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = null;
  }
  scheduleSync(ms: number) {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    if (!this.syncRunning || this.disposed) return;
    this.syncTimer = setTimeout(() => void this.runSync(), ms);
  }
  async runSync() {
    if (this.syncBusy || this.disposed) return;
    if (this.saving || this.confirmOpen) {
      this.scheduleSync(SYNC_MS);
      return;
    }
    this.syncBusy = true;
    const seq = this.liveSeq;
    try {
      const data = await this.fetchSync(false);
      this.syncFails = 0;
      this.syncOk = true;
      if (data.changed && !this.saving && !this.confirmOpen && seq === this.liveSeq && this.liveBusy === 0) this.applySync(data);
    } catch (err) {
      this.syncFails++;
      if (this.syncFails >= 2) this.syncOk = false;
    } finally {
      this.syncBusy = false;
      this.ctx++;
      this.emit();
      // โครงหน้าเปลี่ยน (ใบส่งใหม่/รายการย่อย/ชื่อ): ว่างอยู่โหลดหน้าใหม่เอง
      if (this.staleBy !== null && !this.reloadAsked && this.hooks.idle() && !this.saveBar().dirty) {
        this.reloadAsked = true;
        this.hooks.reload(savedBy(this.staleBy) + 'ข้อมูลใหม่ · อัปเดตหน้าแล้ว');
      }
      this.scheduleSync(this.syncFails ? Math.min(SYNC_MS * 2 ** this.syncFails, 60000) : SYNC_MS);
    }
  }
  dispose() {
    this.disposed = true;
    this.stopSync();
    this.autoTimers.forEach((t) => clearTimeout(t));
    this.liveTimers.forEach((t) => clearTimeout(t));
  }

  // ---------- สรุปบนหัวหน้า ----------
  counts() {
    const rows = this.groups.filter((g) => g.sec === 'goods').flatMap((g) => g.rows);
    const done = rows.filter(isDone).length;
    const extraRows = this.groups.filter((g) => g.sec === 'extra').flatMap((g) => g.rows);
    return {
      todo: rows.length - done,
      done,
      all: rows.length,
      pct: rows.length ? (done / rows.length) * 100 : 0,
      perRound: ROUNDS.map((round) => rows.filter((row) => row.doneRound === round).length),
      extraDone: extraRows.filter(isDone).length,
      extraAll: extraRows.length,
      skipAll: this.groups.filter((g) => g.sec === 'skip').reduce((t, g) => t + g.rows.length, 0),
    };
  }

  // ---------- ใบเช็คของ ----------
  // รอบของเวลานี้ = รอบแรกที่แจ้งจัดงานหลังเวลานี้ · หลังรอบที่แจ้งล่าสุด = รอบถัดไป · 0 = หลังแจ้งจัดงานรอบสุดท้ายแล้ว
  roundOfTime(at: string) {
    let last = 0;
    for (const round of ROUNDS) {
      const cutoff = this.rounds[round].jobAt;
      if (!cutoff) continue;
      if (at <= cutoff) return round;
      last = round;
    }
    return last === ROUNDS[ROUNDS.length - 1] ? 0 : last + 1;
  }
  // บิลที่ขึ้นในหมายเหตุของใบเช็ครอบนี้ (ของรอบก่อนจัดงานไปแล้วและยอดที่ส่งครบแล้วไม่ต้องแสดง)
  sheetBills(row: Row, round: number) {
    const unit = row.unit && row.unit !== '-' ? ' ' + row.unit : '';
    const roundText = (n: number) => (n ? 'รอบ ' + n : 'หลังรอบสุดท้าย');
    const lots: { po: PoLine; index: number; at: string; qty: number }[] = [];
    row.po.filter((po) => !po.auto).forEach((po, index) => {
      const times: [string, number][] = po.wh ? po.recv : [[po.at || '', Number(po.qty) || 0]];
      times.forEach(([at, qty]) => lots.push({ po, index, at: str(at), qty: num(qty) }));
    });
    lots.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const autoStock = row.stock ? row.stock.auto : 0;
    let covered = Math.max(round2(sentQty(row) - autoStock), 0);
    const groups = new Map<string, { po: PoLine; billRoundNo: number; got: number; left: number }>();
    lots.forEach((lot) => {
      const used = Math.min(lot.qty, covered);
      covered = round2(covered - used);
      const billRoundNo = this.roundOfTime(lot.at);
      const key = lot.index + '|' + billRoundNo;
      if (!groups.has(key)) groups.set(key, { po: lot.po, billRoundNo, got: 0, left: 0 });
      const g = groups.get(key)!;
      g.got = round2(g.got + lot.qty);
      g.left = round2(g.left + lot.qty - used);
    });
    const bills: { no: string; when: string; cond: string; qty: string }[] = [];
    groups.forEach(({ po, billRoundNo, got, left }) => {
      if (billRoundNo !== 0 && billRoundNo < round) return;
      if (got > 0 && left <= 0) return;
      const word = po.wh ? 'คลังรับ' : po.no === 'ใช้ในสต๊อก' ? 'เบิก' : 'ซื้อ';
      const label = (po.wh ? 'รับแล้ว ' : 'จำนวน ') + fmt(got);
      const qty = got <= 0 ? po.qty_text : (left < got ? label + ' · เหลือส่ง ' + fmt(left) : label) + unit;
      bills.push({ no: po.no, when: word + roundText(billRoundNo), cond: (po.wh && po.cond_po) || po.cond, qty });
    });
    return bills;
  }
  // ยอดเหลือของ 1 แถวในใบเช็ค · null = ครบแล้ว (ติ๊กครบรอบไหนก็ได้ หรือไม่เหลือยอด)
  sheetLine(tr: Tr, target: number) {
    const left = Math.max(round2(target - sentQty(tr)), 0);
    return tr.pendingDone > 0 || left <= 0 ? null : left;
  }
  checkLines() {
    const lines: { tr: Tr; left: number; sec: string; isSub: boolean; parentName: string }[] = [];
    this.sortedGroups()
      .filter((g) => g.sec !== 'skip')
      .forEach((g) =>
        g.rows.forEach((row) => {
          const main = this.sheetLine(row, this.targetQty(row));
          if (main !== null) lines.push({ tr: row, left: main, sec: g.sec, isSub: false, parentName: '' });
          row.subs.filter((s) => !s.deleted).forEach((s) => {
            const left = this.sheetLine(s, Number(this.subValues(s).qty) || 0);
            if (left !== null) lines.push({ tr: s, left, sec: g.sec, isSub: true, parentName: main !== null ? '' : row.name });
          });
        })
      );
    return lines;
  }
  latestJobRound() {
    return ROUNDS.reduce((latest, round) => (this.sheetReady(round) ? round : latest), 1);
  }
  subHasSheetNote(sub: Sub) {
    if (sub.deleted || !sub.note.trim()) return false;
    return this.sheetLine(sub, Number(this.subValues(sub).qty) || 0) !== null;
  }
  rowHasSheetNote(row: Row, round: number) {
    const inSheet = this.sheetLine(row, this.targetQty(row)) !== null;
    if (inSheet && (row.note.trim() !== '' || row.back.length > 0 || this.sheetBills(row, round).length > 0)) return true;
    return row.subs.some((s) => this.subHasSheetNote(s));
  }
  noteFilterCount() {
    const round = this.latestJobRound();
    return this.groups.filter((g) => g.sec !== 'skip').flatMap((g) => g.rows).filter((row) => this.rowHasSheetNote(row, round)).length;
  }
}

// -------------------- ส่วนประกอบหน้าจอ --------------------

type IonName = keyof typeof Ionicons.glyphMap;

function Chip({ text, color = C.soft, bg = C.track, icon, bold }: { text: string; color?: string; bg?: string; icon?: IonName; bold?: boolean }) {
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      {!!icon && <Ionicons name={icon} size={11} color={color} />}
      <Text style={[s.chipText, { color }, bold && { fontWeight: '800' }]}>{text}</Text>
    </View>
  );
}

function Tick({ on, disabled, color, onPress, label }: { on: boolean; disabled: boolean; color: string; onPress: () => void; label: string }) {
  return (
    <TouchableOpacity
      style={[s.tick, on && { backgroundColor: color, borderColor: color }, disabled && !on && s.tickDisabled]}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      aria-checked={on}
      hitSlop={6}
    >
      {on && <Ionicons name="checkmark" size={17} color="#fff" />}
    </TouchableOpacity>
  );
}

function CompanyBadge({ company }: { company: Company }) {
  const label = (
    <Text style={[s.companyText, { color: company.ink }]} numberOfLines={1}>
      {company.short || company.name}
    </Text>
  );
  if (company.stops.length >= 2) {
    return (
      <LinearGradient colors={company.stops as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.company}>
        {label}
      </LinearGradient>
    );
  }
  return <View style={[s.company, { backgroundColor: company.color }]}>{label}</View>;
}

/** ป้ายรอบเล็ก (ไล่สีตามรอบ) */
function RoundPill({ round, suffix = '' }: { round: number; suffix?: string }) {
  const rc = roundColor(round);
  return (
    <LinearGradient colors={rc.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.roundPill}>
      <Text style={s.roundPillText}>
        รอบ {round}
        {suffix}
      </Text>
    </LinearGradient>
  );
}

/** ก้อนเลขรอบสี่เหลี่ยม · off = ยังไม่แจ้งจัดงาน (เทา) */
function RoundBadge({ round, size = 44, off }: { round: number; size?: number; off?: boolean }) {
  const rc = roundColor(round);
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.32) };
  const no = { fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.48) };
  if (off) {
    return (
      <View style={[s.roundBadge, box, s.roundBadgeOff]}>
        <Text style={[s.roundBadgeSmall, { color: C.muted }]}>รอบ</Text>
        <Text style={[s.roundBadgeNo, no, { color: C.muted }]}>{round}</Text>
      </View>
    );
  }
  return (
    <LinearGradient colors={rc.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.roundBadge, box, { boxShadow: `0 5px 12px ${rc.c}40` }]}>
      <Text style={s.roundBadgeSmall}>รอบ</Text>
      <Text style={[s.roundBadgeNo, no]}>{round}</Text>
    </LinearGradient>
  );
}

function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(name) }]}>
      <Text style={[s.avatarText, { fontSize: Math.round(size * 0.44) }]}>{initialOf(name)}</Text>
    </View>
  );
}

/** หัวกล่อง: ไอคอนในกรอบสี + ชื่อ + ส่วนขวา */
function PanelTitle({ icon, title, right, color = C.primary }: { icon: IonName; title: string; right?: ReactNode; color?: string }) {
  return (
    <View style={s.panelHead}>
      <View style={[s.panelIcon, { backgroundColor: color + '17' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={s.panelTitle}>{title}</Text>
      {right}
    </View>
  );
}

/** ปุ่มแบ่งช่องเท่ากัน (ค้าง / ครบแล้ว / ทั้งหมด) · ก้อนขาวเลื่อนเรียบ ๆ ไปช่องที่เลือก */
function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string; count?: number; color?: string }[]; value: T; onChange: (key: T) => void }) {
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  const pos = useSharedValue(idx);
  const segW = useSharedValue(0);
  useEffect(() => {
    pos.value = withTiming(idx, SLIDE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);
  const pill = useAnimatedStyle(() => ({ width: segW.value, opacity: segW.value > 0 ? 1 : 0, transform: [{ translateX: pos.value * segW.value }] }));
  return (
    <View
      style={s.seg}
      accessibilityRole="tablist"
      onLayout={(e) => {
        segW.value = (e.nativeEvent.layout.width - SEG_PAD * 2) / options.length;
      }}
    >
      <Animated.View style={[s.segPill, pill]} />
      {options.map((o) => {
        const on = o.key === value;
        const color = o.color || C.primary;
        return (
          <TouchableOpacity key={o.key} style={s.segItem} onPress={() => onChange(o.key)} activeOpacity={0.7} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[s.segText, on && { color: C.text }]} numberOfLines={1}>
              {o.label}
            </Text>
            {o.count !== undefined && (
              <View style={[s.segCount, on && { backgroundColor: color + '1A' }]}>
                <Text style={[s.segCountText, on && { color }]}>{o.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** ปุ่มคำสั่งของรอบ (ตารางช่องเท่ากัน) */
function ActTile({ icon, label, onPress, disabled, blocked }: { icon: IonName; label: string; onPress: () => void; disabled?: boolean; blocked?: boolean }) {
  const off = disabled || blocked;
  return (
    <TouchableOpacity style={[s.actTile, disabled && { opacity: 0.45 }]} disabled={disabled} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[s.actIcon, off && { backgroundColor: C.track }]}>
        <Ionicons name={icon} size={17} color={off ? C.muted : C.primary} />
      </View>
      <Text style={[s.actText, off && { color: C.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** ป้ายบอกว่าอีกคนกำลังกรอกช่องนี้ (รอบันทึก) */
function LiveTag({ text }: { text: string }) {
  return (
    <View style={s.liveTag}>
      <View style={s.liveTagDot} />
      <Text style={s.liveTagText}>{text}</Text>
    </View>
  );
}

interface CardActions {
  loadInput: (tr: Tr, round: number, text: string) => void;
  loadCommit: (tr: Tr, round: number) => void;
  packInput: (tr: Tr, round: number, text: string) => void;
  packCommit: (tr: Tr, round: number) => void;
  loadTick: (tr: Tr, round: number) => void;
  packTick: (tr: Tr, round: number) => void;
  photo: (tr: Tr, round: number) => void;
  viewPhoto: (tr: Tr, round: number) => void;
  note: (tr: Tr, text: string) => void;
  focus: (row: Row | null) => void;
  p80: (row: Row) => void;
  rename: (row: Row) => void;
  name: (row: Row, text: string) => void;
  nameDone: (row: Row, cancel: boolean) => void;
  addSub: (row: Row) => void;
  subField: (sub: Sub, field: 'name' | 'qty' | 'unit', text: string) => void;
  subQtyDone: (sub: Sub) => void;
  subDelete: (sub: Sub) => void;
  conflict: (tr: Tr, c: Conflict, take: boolean) => void;
  /** เลื่อนช่องที่เพิ่งโฟกัสให้พ้นคีย์บอร์ด (ช่องของรายการย่อยที่ไม่ได้เรียก focus) */
  reveal: () => void;
  /** รับของคืน: บรรทัดที่ส่งเกิน (ไปขึ้นในใบส่งรอบถัดไป) */
  returnReq: (row: Row) => void;
}

/** บรรทัดรายละเอียดของรายการรับคืน 1 รายการ (เหมือน renderReturns ของหน้าเว็บ) */
function returnMeta(r: ReturnItem) {
  if (r.status === 'found') return 'ส่งถึงหน้างานแล้ว กดรับของคืนเพื่อให้รอบถัดไปรับกลับ';
  if (r.status === 'waiting')
    return (r.target_round ? 'ขึ้นในใบส่งรอบ ' + r.target_round + ' (' + r.target_do + ')' : 'รอรอบถัดไป (ยังไม่มีใบส่ง)') + (r.by ? ' · แจ้งโดย ' + r.by + ' ' + thaiDateTime(r.at) : '');
  return 'คนขับรับคืนแล้ว รอบ ' + r.round + (r.do ? ' (' + r.do + ')' : '') + ' · ' + r.picked_by + ' ' + thaiDateTime(r.picked_at) + (returnShort(r) ? ' · รับไม่ครบ ที่เหลือรอรอบถัดไป' : '');
}
/** รับคืนไม่ครบ (คนขับรับได้น้อยกว่าที่แจ้ง ที่เหลือรอรอบถัดไป) */
const returnShort = (r: ReturnItem) => r.status === 'picked' && num(r.picked_qty) < num(r.qty) - 0.005;
/** ป้ายสถานะรับคืน (เหมือน RETURN_STATUS ของหน้าเว็บ) */
const RETURN_STATUS: Record<string, { text: string; icon: 'alert-circle' | 'car' | 'checkmark-circle'; color: string; bg: string }> = {
  found: { text: 'ยังไม่แจ้งรับคืน', icon: 'alert-circle', color: C.bad, bg: C.badBg },
  waiting: { text: 'รอคนขับรับคืน', icon: 'car', color: C.info, bg: C.infoBg },
  picked: { text: 'รับคืนแล้ว', icon: 'checkmark-circle', color: '#fff', bg: C.ok },
};

/** ช่องรอบ 1 รอบ: หัว (รอบ + สถานะ + ปุ่มรูป) · กล่องจัดของ / ขึ้นรถ (จำนวน + ติ๊กครบ) · ป้ายคนอื่นกรอก · ค่าชนกัน */
function RoundBox({ b, tr, cell, act, disabledAll }: { b: Board; tr: Tr; cell: ReturnType<Board['roundCells']>[number]; act: CardActions; disabledAll: boolean }) {
  const round = cell.round;
  const rc = roundColor(round);
  const total = b.photoTotal(tr, round);
  // ปุ่มกล้อง = ถ่ายอย่างเดียว · ปุ่มดูรูปแยก โผล่เมื่อมีรูป (ผู้ใช้สั่ง 14 พ.ย. 69) · รอบล็อกถ่ายเพิ่มไม่ได้ ซ่อนกล้อง
  // รายการย่อยที่เพิ่งเพิ่มก็แนบรูปได้เลย (ส่งตามหลังกดบันทึก)
  const camFull = total >= b.photoMax;
  const conflicts = tr.conflicts.filter((c) => c.round === round && c.still());
  return (
    <View style={[s.roundBox, { backgroundColor: rc.tint, borderColor: rc.c + '2E' }, cell.locked && s.roundBoxLocked]}>
      <View style={s.roundBoxHead}>
        <RoundPill round={round} />
        {cell.locked && <Ionicons name="lock-closed" size={12} color={C.muted} />}
        <Text style={[s.cellStatus, cell.tone === 'over' && { color: C.bad }, cell.tone === 'done' && { color: C.ok, fontWeight: '800' }]} numberOfLines={2}>
          {cell.status}
        </Text>
        {total > 0 && (
          <TouchableOpacity
            style={[s.photoBtn, s.photoBtnOn, b.photoPending(tr, round) && s.photoBtnPending]}
            onPress={() => act.viewPhoto(tr, round)}
            accessibilityLabel={'ดูรูปจัดของ รอบ ' + round}
          >
            <Text style={[s.photoBtnText, { color: '#fff' }]}>{'ดูรูป ' + total + '/' + b.photoMax}</Text>
          </TouchableOpacity>
        )}
        {!cell.locked && (
          <TouchableOpacity
            style={[s.photoBtn, camFull && { opacity: 0.4 }]}
            disabled={camFull}
            onPress={() => act.photo(tr, round)}
            accessibilityLabel={camFull ? 'ครบ ' + b.photoMax + ' รูปแล้ว' : 'ถ่ายรูปจัดของ รอบ ' + round}
          >
            <Ionicons name="camera" size={15} color={C.primary} />
            {total === 0 && <Text style={s.photoBtnText}>ถ่ายรูป</Text>}
          </TouchableOpacity>
        )}
      </View>
      <View style={s.boxPair}>
        <View style={[s.box, cell.flash && s.boxFlash]}>
          <View style={s.boxLabelRow}>
            <Text style={s.boxTag}>จัดของ</Text>
            {tr.packState === 'saving' && <ActivityIndicator size="small" color={C.primary} style={s.boxSpin} />}
            {tr.packState === 'saved' && <Ionicons name="checkmark-done" size={14} color={C.ok} />}
          </View>
          <View style={s.boxField}>
            <TextInput
              style={[s.qtyInput, cell.packChanged && s.inputChanged, cell.packInvalid && s.inputInvalid, cell.packLive && s.inputLive, cell.locked && s.inputLocked]}
              value={tr.pack[round - 1]}
              onChangeText={(t) => act.packInput(tr, round, t)}
              onEndEditing={() => act.packCommit(tr, round)}
              onFocus={() => act.focus(tr.isSub ? tr.parent : tr)}
              onBlur={() => act.focus(null)}
              keyboardType="decimal-pad"
              editable={!cell.locked && !disabledAll}
              selectTextOnFocus
              placeholder="-"
              placeholderTextColor={C.faint}
              accessibilityLabel={'จำนวนจัดรอบ ' + round + ' ' + trName(tr)}
            />
            <Tick on={cell.packTick} disabled={cell.packTickDisabled || disabledAll} color={rc.c} onPress={() => act.packTick(tr, round)} label={'จัดครบรอบ ' + round + ' ' + trName(tr)} />
          </View>
        </View>
        <View style={s.box}>
          <View style={s.boxLabelRow}>
            <Text style={s.boxTag}>ขึ้นรถ</Text>
          </View>
          <View style={s.boxField}>
            <TextInput
              style={[s.qtyInput, cell.loadChanged && s.inputChanged, cell.loadInvalid && s.inputInvalid, cell.live && s.inputLive, cell.locked && s.inputLocked]}
              value={tr.load[round - 1]}
              onChangeText={(t) => act.loadInput(tr, round, t)}
              onEndEditing={() => act.loadCommit(tr, round)}
              onFocus={() => act.focus(tr.isSub ? tr.parent : tr)}
              onBlur={() => act.focus(null)}
              keyboardType="decimal-pad"
              editable={!cell.locked && !disabledAll}
              selectTextOnFocus
              placeholder="-"
              placeholderTextColor={C.faint}
              accessibilityLabel={'จำนวนขึ้นรถรอบ ' + round + ' ' + trName(tr)}
            />
            <Tick on={cell.loadTick} disabled={cell.loadTickDisabled || disabledAll} color={rc.c} onPress={() => act.loadTick(tr, round)} label={'ขึ้นครบรอบ ' + round + ' ' + trName(tr)} />
          </View>
        </View>
      </View>
      {!!cell.packTag && <LiveTag text={cell.packTag} />}
      {!!cell.liveTag && <LiveTag text={cell.liveTag} />}
      {conflicts.map((c) => (
        <View key={c.key + c.round} style={s.remote}>
          <View style={s.remoteHead}>
            <Ionicons name="git-compare" size={14} color={C.warn} />
            <Text style={s.remoteText}>{c.text}</Text>
          </View>
          <View style={s.remoteBtns}>
            <TouchableOpacity style={s.remoteTake} onPress={() => act.conflict(tr, c, true)}>
              <Text style={s.remoteTakeText}>ใช้ค่านี้</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.remoteKeep} onPress={() => act.conflict(tr, c, false)}>
              <Text style={s.remoteKeepText}>ใช้ของฉัน</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

// ของตีกลับ + บิล (ใบเช็ค / กรองหมายเหตุ)
function BillList({ b, row, round }: { b: Board; row: Row; round: number }) {
  const bills = b.sheetBills(row, round);
  const unit = row.unit && row.unit !== '-' ? ' ' + row.unit : '';
  if (!row.back.length && !bills.length) return null;
  return (
    <View style={s.billList}>
      {row.back.map(([from, label, qty], i) => (
        <Text key={'b' + i} style={s.billBack}>
          <Text style={{ fontWeight: '800' }}>{label + ' ' + fmt(qty) + unit}</Text> จากรอบ {from}
        </Text>
      ))}
      {bills.map((bill, i) => (
        <Text key={'p' + i} style={s.billLine}>
          <Text style={{ fontWeight: '800' }}>{bill.no}</Text> <Text style={{ fontWeight: '700' }}>{bill.when}</Text>
          {[bill.cond, bill.qty].filter(Boolean).map((p) => ' · ' + p).join('')}
        </Text>
      ))}
    </View>
  );
}

const RowCard = memo(function RowCard({ b, row, shown, noteOnly, act }: { b: Board; row: Row; v: number; ctx: number; shown: number; noteOnly: boolean; act: CardActions }) {
  const cells = b.roundCells(row).filter((c) => c.round === shown);
  const left = b.leftInfo(row);
  const dirty = b.anyChange(row);
  const ids = row.ids;
  const [poOpen, setPoOpen] = useState(false);
  const rc = row.doneRound ? roundColor(row.doneRound) : null;
  const poShow = row.po.length > 4 ? (poOpen ? row.po : row.po.slice(0, 3)) : row.po;
  const inSheet = row.sec !== 'skip' && b.sheetLine(row, b.targetQty(row)) !== null;
  const retOver = b.returnOver(row); // ส่งถึงหน้างานแล้วเกินจำนวน → รับกลับ
  const retWait = b.returnWaiting(row); // กดรับคืนแล้ว รอคนขับรับ
  const retGot = b.returnPicked(row); // คนขับรับคืนแล้ว (ป้ายเขียว)
  const reachText = b.reachText(row); // ติ๊ก 80%: ครบ 80% รอบไหน · ครบเต็มรอบไหน
  const hasTags =
    !!row.skipReason || ids.length > 1 || row.parts.length > 1 || !!row.where || row.namesDiffer || row.multiUnit || !!row.hint || row.otherDo > 0 || !!row.doneText || dirty
    || retOver > 0 || retWait > 0 || retGot > 0 || !!reachText;
  const leftTone = left.tone === 'over' ? s.leftOver : left.tone === 'zero' ? s.leftZero : null;
  const leftColor = left.tone === 'over' ? C.bad : left.tone === 'zero' ? C.ok : C.warn;
  return (
    <View style={[s.card, dirty && s.cardDirty]}>
      {rc && <View style={[s.doneStrip, { backgroundColor: rc.c }]} />}
      <View style={s.nameRow}>
        {row.renaming ? (
          <TextInput
            style={[s.nameInput, b.nameChanged(row) && s.inputChanged, b.nameEmpty(row) && s.inputInvalid]}
            value={row.nameInput}
            onChangeText={(t) => act.name(row, t)}
            onEndEditing={() => act.nameDone(row, false)}
            autoFocus
            maxLength={255}
            accessibilityLabel="ชื่อรายการ"
          />
        ) : (
          <Text style={s.itemName}>{row.name || '-'}</Text>
        )}
        {row.renaming ? (
          <TouchableOpacity style={s.iconBtn} onPress={() => act.nameDone(row, true)} hitSlop={6} accessibilityLabel="ยกเลิกแก้ชื่อ">
            <Ionicons name="close" size={17} color={C.soft} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.iconBtn} onPress={() => act.rename(row)} hitSlop={6} accessibilityLabel={'แก้ชื่อ ' + row.name}>
            <Ionicons name="pencil" size={14} color={C.soft} />
          </TouchableOpacity>
        )}
      </View>
      {hasTags && (
        <View style={s.tags}>
          {!!reachText && <Chip text={reachText} color={C.ok} bg="#fff" bold />}
          {!!row.doneText && <Chip text={row.doneText} color={C.ok} bg={C.okBg} icon="checkmark-circle" bold />}
          {dirty && <Chip text="ยังไม่บันทึก" color={C.warn} bg={C.warnBg} icon="create" bold />}
          {!!row.skipReason && <Chip text={row.skipReason} />}
          {ids.length > 1 && <Chip text={'รวม ' + ids.length + ' รายการ'} color={C.info} bg={C.infoBg} />}
          {row.parts.length > 1
            ? row.parts.map(([where, q], i) => <Chip key={i} text={(where !== '' ? where : 'ไม่ระบุที่') + ' ' + fmt(q)} icon="location-outline" />)
            : !!row.where && <Chip text={row.where} icon="location-outline" />}
          {row.namesDiffer && <Chip text="ชื่อเขียนต่างกันเล็กน้อย" color={C.warn} bg={C.warnBg} />}
          {row.multiUnit && <Chip text="ชื่อนี้มีหลายหน่วย แยกบรรทัดตามหน่วย" color={C.warn} bg={C.warnBg} />}
          {!!row.hint && <Chip text={row.hint} color={C.info} bg={C.infoBg} />}
          {row.otherDo > 0 && <Chip text={'ส่งด้วยใบส่งอื่นแล้ว ' + fmt(row.otherDo)} color={C.warn} bg={C.warnBg} />}
          {retOver > 0 && <Chip text={'ส่งเกิน · รับกลับ ' + fmt(retOver) + unitText(row.unit)} color={C.bad} bg={C.badBg} icon="arrow-undo" bold />}
          {retOver > 0 && (
            <TouchableOpacity style={s.returnBtn} onPress={() => act.returnReq(row)} accessibilityRole="button" accessibilityLabel={'รับของคืน ' + row.name}>
              <Ionicons name="arrow-undo" size={13} color={C.bad} />
              <Text style={s.returnBtnText}>รับของคืน</Text>
            </TouchableOpacity>
          )}
          {retWait > 0 && <Chip text={'รอรับคืน ' + fmt(retWait) + unitText(row.unit)} color={C.info} bg={C.infoBg} icon="time-outline" bold />}
          {retGot > 0 && <Chip text={'รับคืนแล้ว ' + fmt(retGot) + unitText(row.unit)} color={C.ok} bg={C.okBg} icon="checkmark-circle" bold />}
        </View>
      )}

      {/* จำนวน · 80% · ค้าง */}
      <View style={s.stats}>
        <View style={s.statMain}>
          <Text style={s.statLabel}>จำนวน{row.p80 ? ' (80%)' : ''}</Text>
          <Text style={s.statValue}>
            {fmt(b.targetQty(row))}
            <Text style={s.statUnit}> {row.unit || '-'}</Text>
          </Text>
          {row.p80 && <Text style={s.statSub}>เต็ม {fmt(row.qty)}</Text>}
        </View>
        <TouchableOpacity style={[s.p80, row.p80 && s.p80On, b.p80Changed(row) && s.p80Changed]} onPress={() => act.p80(row)} accessibilityLabel={'80% ' + row.name}>
          <Ionicons name={row.p80 ? 'checkbox' : 'square-outline'} size={16} color={row.p80 ? C.primary : C.muted} />
          <Text style={[s.p80Text, row.p80 && { color: C.primary }]}>80%</Text>
        </TouchableOpacity>
        <View style={[s.leftBox, leftTone]}>
          <Text style={[s.leftLabel, { color: leftColor }]}>ค้าง</Text>
          <Text style={[s.leftValue, { color: leftColor }]}>{left.text}</Text>
        </View>
      </View>

      {cells.map((cell) => (
        <RoundBox key={cell.round} b={b} tr={row} cell={cell} act={act} disabledAll={b.saving} />
      ))}

      {noteOnly ? (
        inSheet ? <BillList b={b} row={row} round={b.latestJobRound()} /> : null
      ) : row.back.length > 0 || poShow.length > 0 ? (
        <View style={s.poBox}>
          {row.back.map(([r, label, q], i) => (
            <Text key={'r' + i} style={s.backLine}>
              <Text style={{ fontWeight: '800' }}>{label + ' ' + fmt(q) + unitText(row.unit)}</Text> จากรอบ {r}
            </Text>
          ))}
          {poShow.map((po, i) => (
            <View key={i} style={s.poLine}>
              <Text style={s.poNo}>{po.no}</Text>
              <Text style={[s.poCond, po.tone === 'site' ? { color: C.ok } : po.tone === 'wait' ? { color: C.warn } : po.tone === 'wh' ? { color: C.info } : { color: C.muted }]}>{po.cond}</Text>
              <Text style={s.poQty}>{po.qty_text}</Text>
            </View>
          ))}
          {row.po.length > 4 && (
            <TouchableOpacity onPress={() => setPoOpen((o) => !o)} style={s.poMoreBtn}>
              <Text style={s.poMore}>{poOpen ? 'ซ่อนบิล' : 'อีก ' + (row.po.length - 3) + ' บิล'}</Text>
              <Ionicons name={poOpen ? 'chevron-up' : 'chevron-down'} size={13} color={C.primary} />
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      <TextInput
        style={[s.noteInput, b.noteChanged(row) && s.inputChanged]}
        value={row.note}
        onChangeText={(t) => act.note(row, t)}
        onFocus={() => act.focus(row)}
        onBlur={() => act.focus(null)}
        placeholder="เพิ่มหมายเหตุ"
        placeholderTextColor={C.muted}
        maxLength={5000}
        multiline
        accessibilityLabel={'หมายเหตุ ' + row.name}
      />
      <TouchableOpacity style={s.addSub} onPress={() => act.addSub(row)} disabled={b.saving}>
        <Ionicons name="add-circle-outline" size={16} color={C.primary} />
        <Text style={s.addSubText}>เพิ่มรายการย่อย</Text>
      </TouchableOpacity>
    </View>
  );
});

const SubCard = memo(function SubCard({ b, sub, shown, act }: { b: Board; sub: Sub; v: number; ctx: number; shown: number; act: CardActions }) {
  const cells = b.roundCells(sub).filter((c) => c.round === shown);
  const left = b.leftInfo(sub);
  const v = b.subValues(sub);
  const saved = sub.saved;
  const held = b.subHeld(sub);
  const changed = (key: keyof SubSaved) => saved !== null && JSON.stringify(v[key]) !== JSON.stringify(saved[key]);
  const disabled = sub.deleted || b.saving;
  const leftTone = left.tone === 'over' ? s.leftOver : left.tone === 'zero' ? s.leftZero : null;
  const leftColor = left.tone === 'over' ? C.bad : left.tone === 'zero' ? C.ok : C.warn;
  return (
    <View style={s.subWrap}>
      <View style={s.subConnector} />
      <View style={[s.subCard, sub.deleted && s.subDeleted, b.subChanged(sub) && s.cardDirty]}>
        <View style={s.subHead}>
          <TextInput
            style={[s.subName, changed('name') && s.inputChanged, v.name === '' && s.inputInvalid]}
            value={sub.name}
            onChangeText={(t) => act.subField(sub, 'name', t)}
            onFocus={act.reveal}
            editable={!disabled}
            maxLength={255}
            placeholder="ชื่อรายการย่อย เช่น หลอด LED T8 *"
            placeholderTextColor={C.muted}
            accessibilityLabel="ชื่อรายการย่อย"
          />
          <TouchableOpacity
            style={[s.subDel, held && { opacity: 0.4 }]}
            disabled={held || b.saving}
            onPress={() => act.subDelete(sub)}
            accessibilityLabel={held ? ROUND_LOCK_TEXT : sub.deleted ? 'ยกเลิกการลบ' : 'ลบรายการย่อย'}
          >
            <Ionicons name={sub.deleted ? 'arrow-undo' : 'trash-outline'} size={16} color={C.bad} />
          </TouchableOpacity>
        </View>
        <View style={s.tags}>
          <Chip text="รายการย่อย" color={C.info} bg={C.infoBg} icon="return-down-forward" />
          {!!sub.doneText && <Chip text={sub.doneText} color={C.ok} bg={C.okBg} icon="checkmark-circle" bold />}
          {b.isNewSub(sub) && <Chip text="ยังไม่บันทึก" color={C.warn} bg={C.warnBg} icon="create" bold />}
          {sub.deleted && <Chip text="จะลบตอนบันทึก" color={C.bad} bg={C.badBg} icon="trash" bold />}
        </View>
        <View style={s.subQtyRow}>
          <TextInput
            style={[s.subQty, changed('qty') && s.inputChanged, !v.qty && s.inputInvalid]}
            value={sub.qty}
            onChangeText={(t) => act.subField(sub, 'qty', t)}
            onEndEditing={() => act.subQtyDone(sub)}
            onFocus={act.reveal}
            editable={!disabled}
            keyboardType="decimal-pad"
            placeholder="จำนวน *"
            placeholderTextColor={C.muted}
            accessibilityLabel="จำนวนรายการย่อย"
          />
          <TextInput
            style={[s.subUnit, changed('unit') && s.inputChanged]}
            value={sub.unit}
            onChangeText={(t) => act.subField(sub, 'unit', t)}
            onFocus={act.reveal}
            editable={!disabled}
            maxLength={50}
            placeholder="หน่วย"
            placeholderTextColor={C.muted}
            accessibilityLabel="หน่วยรายการย่อย"
          />
          <View style={[s.leftBox, leftTone]}>
            <Text style={[s.leftLabel, { color: leftColor }]}>ค้าง</Text>
            <Text style={[s.leftValue, { color: leftColor }]}>{left.text}</Text>
          </View>
        </View>
        {cells.map((cell) => (
          <RoundBox key={cell.round} b={b} tr={sub} cell={cell} act={act} disabledAll={disabled} />
        ))}
        <TextInput
          style={[s.noteInput, changed('note') && s.inputChanged]}
          value={sub.note}
          onChangeText={(t) => act.note(sub, t)}
          onFocus={act.reveal}
          editable={!disabled}
          maxLength={1000}
          placeholder="เพิ่มหมายเหตุ"
          placeholderTextColor={C.muted}
          accessibilityLabel="หมายเหตุรายการย่อย"
        />
      </View>
    </View>
  );
});

function SheetModal({ visible, onClose, children, title, sub, insetsTop, insetsBottom, footer }: {
  visible: boolean; onClose: () => void; children: ReactNode; title: string; sub?: string; insetsTop: number; insetsBottom: number; footer?: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={{ height: insetsTop + 30 }} activeOpacity={1} onPress={onClose} accessibilityLabel="ปิด" />
        <View style={[s.sheet, { paddingBottom: 12 + insetsBottom }]}>
          <View style={s.grip} />
          <View style={s.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>{title}</Text>
              {!!sub && <Text style={s.sheetSub}>{sub}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={8} accessibilityLabel="ปิด">
              <Ionicons name="close" size={20} color={C.soft} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>{children}</View>
          {footer}
        </View>
      </View>
    </Modal>
  );
}

function ChoiceModal({ visible, title, options, value, onPick, onClose, allowEmpty, searchable }: {
  visible: boolean; title: string; options: { value: string; label: string }[]; value: string; onPick: (v: string) => void; onClose: () => void; allowEmpty?: string; searchable?: boolean;
}) {
  const [q, setQ] = useState('');
  useEffect(() => {
    if (visible) setQ('');
  }, [visible]);
  const key = q.toLowerCase().replace(/\s+/g, '');
  const list = options.filter((o) => !key || o.label.toLowerCase().replace(/\s+/g, '').includes(key));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.pickerOverlay}>
        <View style={s.picker}>
          <View style={s.pickerHead}>
            <Text style={s.pickerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={s.closeBtnSm}>
              <Ionicons name="close" size={18} color={C.soft} />
            </TouchableOpacity>
          </View>
          {searchable && (
            <View style={s.pickerSearch}>
              <Ionicons name="search" size={15} color={C.muted} />
              <TextInput value={q} onChangeText={setQ} placeholder="ค้นหา..." placeholderTextColor={C.muted} style={s.pickerSearchInput} />
            </View>
          )}
          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {allowEmpty !== undefined && (
              <TouchableOpacity style={[s.pickerOption, value === '' && s.pickerOptionOn]} onPress={() => onPick('')}>
                <Text style={[s.pickerOptionText, value === '' && { color: C.primary, fontWeight: '800' }]}>{allowEmpty}</Text>
                {value === '' && <Ionicons name="checkmark-circle" size={18} color={C.primary} />}
              </TouchableOpacity>
            )}
            {list.map((o) => (
              <TouchableOpacity key={o.value} style={[s.pickerOption, value === o.value && s.pickerOptionOn]} onPress={() => onPick(o.value)}>
                <Text style={[s.pickerOptionText, value === o.value && { color: C.primary, fontWeight: '800' }]}>{o.label}</Text>
                {value === o.value && <Ionicons name="checkmark-circle" size={18} color={C.primary} />}
              </TouchableOpacity>
            ))}
            {!list.length && <Text style={s.emptySmall}>ไม่พบรายการ</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** ป๊อปอัปหมายเหตุจัดงาน (กดช่องหมายเหตุในกล่องสถานะจัดงาน) ดูเต็ม/แก้ · readOnly = ดูอย่างเดียว (เหมือน #sicJobNoteDialog ในเว็บ) */
function JobNoteModal({ round, value, readOnly, lockText, onSave, onClose }: {
  round: number; value: string; readOnly: boolean; lockText: string; onSave: (text: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    if (round) setText(value);
  }, [round, value]);
  return (
    <Modal visible={round > 0} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.pickerOverlay}>
          <View style={s.picker}>
            <View style={s.pickerHead}>
              <Text style={s.pickerTitle}>หมายเหตุจัดงาน รอบ {round}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8} style={s.closeBtnSm} accessibilityLabel="ปิด">
                <Ionicons name="close" size={18} color={C.soft} />
              </TouchableOpacity>
            </View>
            <Text style={s.jobNoteSub}>{readOnly ? lockText + ' · ดูอย่างเดียว' : 'บอกทีมจัดของ/ขึ้นรถ · ไม่อยู่ในใบส่งของ · ตกลงแล้วกดบันทึกเพื่อยืนยัน'}</Text>
            {readOnly ? (
              <ScrollView style={{ maxHeight: 320 }}>
                <Text style={s.jobNoteFull}>{value || 'ไม่มีหมายเหตุ'}</Text>
              </ScrollView>
            ) : (
              <>
                <TextInput
                  style={s.jobNoteArea}
                  value={text}
                  onChangeText={setText}
                  placeholder="พิมพ์หมายเหตุจัดงาน"
                  placeholderTextColor={C.faint}
                  maxLength={JOB_NOTE_MAX}
                  multiline
                  autoFocus
                  textAlignVertical="top"
                />
                <Text style={s.jobNoteCount}>{text.length} / {JOB_NOTE_MAX}</Text>
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={onClose}>
                <Text style={[s.btnText, { color: C.text }]}>{readOnly ? 'ปิด' : 'ยกเลิก'}</Text>
              </TouchableOpacity>
              {!readOnly && (
                <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => onSave(text.trim())}>
                  <Ionicons name="checkmark" size={17} color="#fff" />
                  <Text style={[s.btnText, { color: '#fff' }]}>ตกลง</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// -------------------- หน้าจอหลัก --------------------

interface WhoLine { key: string; tr: Tr; sub: boolean; name: string; unit: string; pack: [number, boolean]; load: [number, boolean] }

export default function SiteItemCheckScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useScreenInsets();
  const params = useLocalSearchParams<{ project_id?: string }>();
  const paramId = Number(params.project_id) || 0;

  const [projectId, setProjectId] = useState(paramId);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [, setTick] = useState(0);
  const boardRef = useRef<Board | null>(null);
  const b = boardRef.current;
  const bump = useCallback(() => setTick((t) => t + 1), []);

  const [tab, setTab] = useState<'todo' | 'done' | 'all'>('todo');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'name' | 'order'>('name');
  const [skipOpen, setSkipOpen] = useState(false);
  const [noteOnly, setNoteOnly] = useState(false);
  const [focusRow, setFocusRow] = useState<Row | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [confirm, setConfirm] = useState<ReturnType<Board['collectChanges']> | null>(null);
  const [busyText, setBusyText] = useState('');
  const [leave, setLeave] = useState<{ go: () => void; error: string } | null>(null);
  const [headRound, setHeadRound] = useState(0);
  const [headDraft, setHeadDraft] = useState<Head | null>(null);
  const [choice, setChoice] = useState<'' | 'driver' | 'helper' | 'vehicle' | 'organizer'>('');
  const [sheetRound, setSheetRound] = useState(0);
  const [who, setWho] = useState<{ round: number; loading: boolean; error: string; lines: WhoLine[]; rows: any } | null>(null);
  const [hist, setHist] = useState<Record<string, { open: boolean; loading: boolean; error: string; data: any }>>({});
  const [photo, setPhoto] = useState<{ tr: Tr; round: number; note: string } | null>(null);
  const [finishing, setFinishing] = useState(0); // รอบที่กำลังส่งยืนยันจบรอบ (0 = ไม่มี)
  const [jobNoteRound, setJobNoteRound] = useState(0); // ป๊อปอัปหมายเหตุจัดงานของรอบนี้ (0 = ปิด)
  const [viewer, setViewer] = useState('');
  const [pick, setPick] = useState<{ loading: boolean; error: string; list: any[]; q: string; co: string; cancel: boolean } | null>(null);
  const [sortOpen, setSortOpen] = useState(false);

  const showToast = useCallback((text: string, long?: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), long ? 15000 : 5000);
  }, []);

  // ---------- เรียก API ----------
  const api = useCallback(
    async (action: string, fields: Record<string, string | number> | FormData, pid = projectId) => {
      if (!user?.id) throw new ApiError('ไม่พบผู้ใช้ กรุณาเข้าสู่ระบบใหม่', 401, null);
      try {
        let res;
        if (action === 'page' || action === 'projects') {
          res = await axios.get(SIC_API_URL, { params: { action, user_id: user.id, project_id: pid, ...(fields as any) }, timeout: 60000 });
        } else if (fields instanceof FormData) {
          fields.append('action', action);
          fields.append('user_id', String(user.id));
          fields.append('project_id', String(pid));
          res = await axios.post(SIC_API_URL, fields, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
        } else {
          const body = new URLSearchParams();
          body.append('action', action);
          body.append('user_id', String(user.id));
          body.append('project_id', String(pid));
          Object.entries(fields).forEach(([k, v]) => body.append(k, String(v)));
          res = await axios.post(SIC_API_URL, body.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 60000 });
        }
        const data = res.data;
        if (!data || typeof data !== 'object') throw new ApiError('บันทึกไม่สำเร็จ กรุณาลองใหม่ (ค่าที่แก้ยังอยู่ในหน้า)', 0, null);
        if (data.status !== 'success') throw new ApiError(str(data.message) || 'บันทึกไม่สำเร็จ', num(data.http), data);
        return data;
      } catch (e: any) {
        if (e instanceof ApiError) throw e;
        if (e?.response?.status === 404) throw new ApiError('เซิร์ฟเวอร์ยังไม่มี API ของหน้านี้', 404, null);
        throw new ApiError('บันทึกไม่สำเร็จ กรุณาลองใหม่ (ค่าที่แก้ยังอยู่ในหน้า)', 0, null);
      }
    },
    [user?.id, projectId]
  );

  // หน้าว่าง = ไม่ได้เปิดหน้าต่าง ไม่ได้พิมพ์ช่องไหนอยู่ (โหลดหน้าใหม่ได้โดยไม่รบกวน)
  const modalOpenRef = useRef(false);
  modalOpenRef.current = !!(confirm || leave || headRound || sheetRound || who || photo || pick || viewer);
  const focusRef = useRef<Row | null>(null);
  focusRef.current = focusRow;
  // เปิดหน้านี้อยู่ไหม (โหลดเสร็จตอนอยู่หน้าอื่น = ยังไม่เริ่มอัปเดตอัตโนมัติ)
  const screenFocused = useRef(false);
  // หน้างานที่ขอเปิดล่าสุด (กันพารามิเตอร์ project_id เดิมเปิดซ้ำ / เลือกหน้างานในหน้านี้แล้วกลับมาเปิดจากหน้าแจ้งจัดงาน)
  const lastRequested = useRef(paramId);

  const loadPage = useCallback(
    async (pid: number, message = '') => {
      if (!user?.id || !pid) return;
      if (!boardRef.current) setLoading(true);
      setLoadError('');
      try {
        const data = await api('page', {}, pid);
        boardRef.current?.dispose();
        const board = new Board(data, {
          api: (action, fields) => api(action, fields, pid),
          toast: showToast,
          changed: bump,
          reload: (msg) => void loadPage(pid, msg),
          idle: () => !modalOpenRef.current && !focusRef.current && !boardRef.current?.rows.some((r) => r.renaming),
        });
        board.sortMode = sortMode;
        boardRef.current = board;
        setFocusRow(null);
        if (screenFocused.current) board.startSync(500);
        if (message) showToast(message);
      } catch (e: any) {
        if (!boardRef.current) setLoadError(e?.message || 'โหลดข้อมูลไม่สำเร็จ');
        else showToast(e?.message || 'โหลดข้อมูลไม่สำเร็จ', true);
      } finally {
        setLoading(false);
        bump();
      }
    },
    [api, bump, showToast, sortMode, user?.id]
  );

  // เปิดหน้า / เปลี่ยนหน้างาน (จากหน้าแจ้งจัดงาน หรือเลือกหน้างาน)
  useEffect(() => {
    if (paramId && paramId !== lastRequested.current) requestProject(paramId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId]);
  useEffect(() => {
    if (projectId) void loadPage(projectId);
    return () => {
      const board = boardRef.current;
      if (board) {
        board.dispose();
        void api('presence_leave', {}, board.project.id).catch(() => {});
      }
      boardRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user?.id]);

  // เปิดหน้านี้อยู่ = อัปเดตอัตโนมัติ · ออกจากหน้า/พับแอป = หยุด + แจ้งออก
  useFocusEffect(
    useCallback(() => {
      screenFocused.current = true;
      boardRef.current?.startSync(0);
      const sub = AppState.addEventListener('change', (state) => {
        const board = boardRef.current;
        if (!board) return;
        if (state === 'active') board.startSync(0);
        else board.stopSync();
      });
      return () => {
        screenFocused.current = false;
        sub.remove();
        const board = boardRef.current;
        if (board) {
          board.stopSync();
          void api('presence_leave', {}, board.project.id).catch(() => {});
        }
      };
    }, [api])
  );

  useEffect(() => {
    if (b) {
      b.sortMode = sortMode;
      b.ctx++;
      bump();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode]);

  const bar = b ? b.saveBar() : null;
  const dirty = !!bar?.dirty;

  // ปุ่มย้อนกลับของเครื่อง: ยังไม่บันทึก = ถามก่อน
  useFocusEffect(
    useCallback(() => {
      const handler = BackHandler.addEventListener('hardwareBackPress', () => {
        const board = boardRef.current;
        if (board && board.saveBar().dirty) {
          openLeave(() => router.back());
          return true;
        }
        return false;
      });
      return () => handler.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // ---------- คีย์บอร์ด: ช่องที่กำลังพิมพ์ต้องไม่โดนบัง ----------
  // คีย์บอร์ดขึ้น = ซ่อนแถบบันทึก (เดิมโผล่ทับช่องตรงขอบคีย์บอร์ดทันทีที่พิมพ์) · เว้นท้ายรายการเท่าส่วนที่คีย์บอร์ดทับ
  // แล้วเลื่อนช่องที่โฟกัสขึ้นมาให้พ้นคีย์บอร์ด (ใช้ได้ทั้ง Android ที่ระบบย่อจอเอง/ไม่ย่อ และ iOS)
  const listRef = useRef<FlatList<ListItem>>(null);
  const listBoxRef = useRef<ComponentRef<typeof View>>(null);
  const scrollYRef = useRef(0);
  const kbTopRef = useRef(0); // ขอบบนคีย์บอร์ด (พิกัดบนจอ) · 0 = คีย์บอร์ดไม่ได้ขึ้น
  const [kbOpen, setKbOpen] = useState(false);
  const [kbPad, setKbPad] = useState(0);

  const reveal = useCallback(() => {
    const kbTop = kbTopRef.current;
    const input = TextInput.State.currentlyFocusedInput() as any;
    const box = listBoxRef.current;
    // ช่องในป๊อปอัป (ข้อมูลใบส่ง ฯลฯ) ไม่ต้องเลื่อนรายการข้างหลัง
    if (!kbTop || !input?.measureInWindow || !box || modalOpenRef.current) return;
    box.measureInWindow((_bx, by, _bw, bh) => {
      const visibleBottom = Math.min(by + bh, kbTop) - 24; // เว้นใต้ช่องไว้นิด ให้เห็นปุ่มติ๊กข้าง ๆ ชัด
      input.measureInWindow((_ix: number, iy: number, _iw: number, ih: number) => {
        const over = iy + ih - visibleBottom;
        if (over > 0) listRef.current?.scrollToOffset({ offset: scrollYRef.current + over, animated: true });
      });
    });
  }, []);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const kbTop = e.endCoordinates.screenY;
      kbTopRef.current = kbTop;
      setKbOpen(true);
      listBoxRef.current?.measureInWindow((_x, y, _w, h) => {
        setKbPad(Math.max(0, Math.round(y + h - kbTop)));
        setTimeout(reveal, ios ? 30 : 80);
      });
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      kbTopRef.current = 0;
      setKbOpen(false);
      setKbPad(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [reveal]);

  function requestProject(pid: number) {
    const board = boardRef.current;
    const go = () => {
      lastRequested.current = pid;
      router.setParams({ project_id: String(pid) });
      if (board) {
        board.dispose();
        void api('presence_leave', {}, board.project.id).catch(() => {});
      }
      boardRef.current = null;
      setFocusRow(null);
      setLoading(true);
      setProjectId(pid);
      if (pid === projectId) void loadPage(pid);
    };
    if (board && board.saveBar().dirty) openLeave(go);
    else go();
  }

  function openLeave(go: () => void) {
    const board = boardRef.current;
    if (!board) return go();
    const bar2 = board.saveBar();
    setLeave({ go, error: bar2.canSave ? '' : bar2.message });
  }

  // ---------- การกระทำในการ์ด ----------
  const actRef = useRef<CardActions | null>(null);
  if (!actRef.current) {
    const with_ = (fn: (board: Board) => void) => {
      const board = boardRef.current;
      if (board) fn(board);
    };
    actRef.current = {
      loadInput: (tr, round, text) => with_((bd) => bd.onLoadInput(tr, round, text)),
      loadCommit: (tr, round) => with_((bd) => bd.onLoadCommit(tr, round)),
      packInput: (tr, round, text) => with_((bd) => bd.onPackInput(tr, round, text)),
      packCommit: (tr, round) => with_((bd) => bd.onPackCommit(tr, round)),
      loadTick: (tr, round) => with_((bd) => bd.onLoadTick(tr, round, tr.pendingDone !== round)),
      packTick: (tr, round) => with_((bd) => bd.onPackTick(tr, round, tr.pendingPack !== round)),
      photo: (tr, round) => with_((bd) => onPhotoButton(bd, tr, round)),
      viewPhoto: (tr, round) => setPhoto({ tr, round, note: '' }),
      note: (tr, text) => with_((bd) => bd.setNote(tr, text)),
      focus: (row) => {
        setFocusRow(row);
        // คีย์บอร์ดเปิดค้างอยู่แล้วกดย้ายไปช่องอื่น (ไม่มี keyboardDidShow ใหม่) = เลื่อนหาช่องเอง
        if (row) setTimeout(reveal, 60);
      },
      reveal: () => setTimeout(reveal, 60),
      p80: (row) => with_((bd) => bd.setP80(row, !row.p80)),
      rename: (row) => with_((bd) => bd.openRename(row)),
      name: (row, text) => with_((bd) => bd.setName(row, text)),
      nameDone: (row, cancel) => with_((bd) => bd.closeRename(row, cancel)),
      addSub: (row) => with_((bd) => bd.addSub(row)),
      subField: (sub, field, text) => with_((bd) => bd.setSubField(sub, field, text)),
      subQtyDone: (sub) => with_((bd) => bd.commitSubQty(sub)),
      subDelete: (sub) => with_((bd) => bd.toggleDeleteSub(sub)),
      conflict: (tr, c, take) =>
        with_((bd) => {
          if (take) c.useTheirs();
          tr.conflicts = tr.conflicts.filter((x) => x !== c);
          bd.touch(tr);
          bd.emit();
        }),
      returnReq: (row) =>
        with_((bd) => void runReturn(bd, 'return_request', { ids: row.ids.filter((id) => num(bd.returns.items[String(id)]) > 0).join(',') })),
    };
  }
  const act = actRef.current;

  // ---------- รับของคืนจากหน้างาน ----------
  async function runReturn(bd: Board, action: 'return_request' | 'return_cancel', fields: Record<string, string>) {
    try {
      await bd.returnAction(action, fields);
      const target = bd.returns.target;
      bd.hooks.toast(action === 'return_cancel' ? 'ยกเลิกรอรับคืนแล้ว' : 'แจ้งรับของคืนแล้ว · ' + (target ? 'ขึ้นในใบส่งรอบ ' + target.round : 'รอรอบถัดไป'));
    } catch (err: any) {
      bd.hooks.toast(err?.message || 'บันทึกไม่สำเร็จ', true);
    }
  }
  // ---------- ยืนยันจบรอบ (ผู้ใช้สั่ง 13 พ.ย. 69 "กดบันทึกยังไม่จบรอบ ให้มียืนยันจบแล้วด้วย") ----------
  // ต้องบันทึกให้หมดก่อน (ไม่มีอะไรค้างในแถบบันทึก) · จบแล้วหน้าแจ้งจัดงานไม่แสดงรอบนี้ · รอบนี้ดูได้อย่างเดียวจนกดแก้ไข
  function askFinishRound(bd: Board, round: number) {
    const bar = bd.saveBar();
    if (bar.show || bar.dirty) {
      bd.hooks.toast('ยังมีที่แก้ค้างอยู่ กดบันทึกก่อน แล้วค่อยยืนยันจบรอบ ' + round, true);
      return;
    }
    const left = bd.roundProgress(round).left;
    Alert.alert(
      'ยืนยันจบรอบ ' + round + '?',
      (left > 0 ? 'ยังค้างขึ้น ' + left + ' รายการ (ส่งรอบถัดไป)\n' : '') +
        'จบแล้วหน้าแจ้งจัดงานไม่แสดงรอบนี้ · ' +
        (bd.canEditRound ? 'แก้ต่อได้ที่ปุ่มแก้ไข' : 'แก้ต่อได้เฉพาะคนที่มีสิทธิ์แก้ไขรอบ'),
      [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ยืนยันจบรอบ', onPress: () => void runFinish(bd, round) },
      ],
    );
  }
  async function runFinish(bd: Board, round: number) {
    setFinishing(round);
    try {
      await bd.finishRound(round);
      bd.hooks.toast('ยืนยันจบรอบ ' + round + ' แล้ว');
    } catch (err: any) {
      bd.hooks.toast(err?.message || 'บันทึกไม่สำเร็จ', true);
    } finally {
      setFinishing(0);
    }
  }
  function askCancelReturn(bd: Board, r: ReturnItem) {
    Alert.alert('ยกเลิกรอรับคืน?', r.name + ' ' + fmt(r.qty) + unitText(r.unit), [
      { text: 'ไม่ใช่', style: 'cancel' },
      { text: 'ยกเลิกรอรับคืน', style: 'destructive', onPress: () => void runReturn(bd, 'return_cancel', { id: String(r.id) }) },
    ]);
  }

  // ---------- รูปจัดของ ----------
  async function pickImages(camera: boolean, room: number): Promise<PhotoAdd[]> {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('ไม่ได้อนุญาตให้ใช้กล้อง', 'เปิดสิทธิ์กล้องให้แอปในการตั้งค่าเครื่อง หรือเลือกรูปจากเครื่องแทน');
        return [];
      }
      // ถ่ายต่อกันจนครบ (ยกเลิกกล้อง = พอแล้ว) แบบกล้องในหน้าเว็บ
      const shots: PhotoAdd[] = [];
      while (shots.length < room) {
        const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
        if (r.canceled || !r.assets?.length) break;
        shots.push({ uri: r.assets[0].uri, key: 'a' + Date.now() + '_' + shots.length });
      }
      return shots;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsMultipleSelection: true, selectionLimit: room });
    if (r.canceled) return [];
    return (r.assets || []).slice(0, room).map((a, i) => ({ uri: a.uri, key: 'g' + Date.now() + '_' + i }));
  }

  async function addPhotos(board: Board, tr: Tr, round: number, camera: boolean) {
    const room = Math.max(board.photoMax - board.photoTotal(tr, round), 0);
    if (!room || board.roundFrozen(round) || board.photoBusy) return;
    const adds = await pickImages(camera, room);
    // ยกเลิกกล้อง = ไม่ทำอะไร (ดูรูปมีปุ่มแยกแล้ว)
    if (!adds.length) return;
    const edit = board.photoEditOf(tr, round);
    board.setPhotoEdit(tr, round, { adds: edit.adds.concat(adds), dels: edit.dels.slice() });
    setPhoto({ tr, round, note: '' });
    const note = await board.savePhotoNow(tr, round);
    setPhoto((p) => (p && p.tr === tr && p.round === round ? { ...p, note } : p));
  }

  // ปุ่มกล้อง = เปิดกล้องทันที (ถ่ายแล้วบันทึกเลย) · รอบล็อก/ครบแล้ว/กำลังส่ง = เปิดหน้าต่างรูปแทน (ปุ่มดูรูปแยก: viewPhoto)
  function onPhotoButton(board: Board, tr: Tr, round: number) {
    if (board.roundFrozen(round) || board.photoTotal(tr, round) >= board.photoMax || board.photoBusy) {
      setPhoto({ tr, round, note: '' });
      return;
    }
    void addPhotos(board, tr, round, true);
  }

  async function deletePhoto(board: Board, tr: Tr, round: number, ph: Photo) {
    const edit = board.photoEditOf(tr, round);
    if (!edit.dels.includes(ph.id)) {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert('ลบรูปนี้?', '', [
          { text: 'ไม่', style: 'cancel', onPress: () => resolve(false) },
          { text: 'ลบรูป', style: 'destructive', onPress: () => resolve(true) },
        ])
      );
      if (!ok) return;
      board.setPhotoEdit(tr, round, { adds: edit.adds.slice(), dels: edit.dels.concat([ph.id]) });
    } else if (board.photoTotal(tr, round) >= board.photoMax) {
      setPhoto({ tr, round, note: 'ครบ ' + board.photoMax + ' รูปแล้ว เอารูปใหม่ออกก่อนจึงคืนรูปนี้ได้' });
      return;
    } else {
      board.setPhotoEdit(tr, round, { adds: edit.adds.slice(), dels: edit.dels.filter((id) => id !== ph.id) });
    }
    const note = await board.savePhotoNow(tr, round);
    setPhoto({ tr, round, note });
  }

  // ---------- บันทึก ----------
  function openConfirm() {
    if (!b) return;
    b.linkPacksForSave(); // ช่องจัดตามช่องขึ้นตอนกดบันทึก (หน้าต่างยืนยันเห็นช่องจัดด้วย)
    b.emit();
    const result = b.collectChanges();
    if (!result.lines.length) return;
    b.confirmOpen = true;
    setConfirm(result);
  }
  function closeConfirm() {
    if (b) b.confirmOpen = false;
    setConfirm(null);
  }
  async function doSave(after?: () => void) {
    const board = boardRef.current;
    if (!board) return false;
    setBusyText('กำลังบันทึก...');
    try {
      const { reload, message, photoFail, carry } = await board.saveAll((t) => setBusyText(t));
      board.confirmOpen = false;
      setConfirm(null);
      if (reload) await loadPage(board.project.id, message);
      else showToast(message);
      // รูปรายการย่อยใหม่ส่งไม่สำเร็จ: ใส่กลับเป็นรูปรอส่ง แจ้งเตือน และอยู่หน้านี้ต่อ (ไม่ทำต่อ เช่น ออกจากหน้า)
      if (photoFail) {
        if (carry?.length) boardRef.current?.restorePhotoAdds(carry);
        showToast(photoFail, true);
        return false;
      }
      after?.();
      return true;
    } catch (err: any) {
      board.confirmOpen = false;
      setConfirm(null);
      showToast(err.message, true);
      return false;
    } finally {
      setBusyText('');
    }
  }

  function askDiscard() {
    if (!b) return;
    const q = b.myDrafts > 0 ? 'ยกเลิกการแก้ไขทั้งหมด? ช่องจัดที่กรอกไว้จะกลับเป็นค่าเดิม' : 'ยกเลิกการแก้ไขทั้งหมดที่ยังไม่บันทึก?';
    Alert.alert('ยกเลิกการแก้ไข', q, [
      { text: 'ไม่', style: 'cancel' },
      {
        text: 'ยกเลิกการแก้ไข',
        style: 'destructive',
        onPress: async () => {
          try {
            const msg = await b.discard();
            if (msg) showToast(msg);
          } catch (err: any) {
            showToast(err.message, true);
          } finally {
            b.touchAll();
            bump();
          }
        },
      },
    ]);
  }

  // ---------- ผู้จัดของ ----------
  function whoLines(board: Board, round: number): WhoLine[] {
    const out: WhoLine[] = [];
    const savedNum = (v: any) => Number(normQty(v == null ? '' : String(v))) || 0;
    board.orderedRows().forEach((row) => {
      out.push({
        key: 'i' + row.id, tr: row, sub: false, name: row.name, unit: unitText(row.unit),
        pack: [savedNum(row.savedPack[round - 1]), row.packRound === round],
        load: [savedNum(row.savedLoad[round - 1]), row.doneRound === round],
      });
      row.subs.filter((sb) => sb.id && sb.saved).forEach((sb) => {
        const sv = sb.saved as SubSaved;
        out.push({
          key: 's' + sb.id, tr: sb, sub: true, name: sv.name || 'รายการย่อย', unit: unitText(sv.unit),
          pack: [savedNum(sv.p[round - 1]), Number(sv.pd) === round],
          load: [savedNum(sv.r[round - 1]), Number(sv.done) === round],
        });
      });
    });
    return out;
  }
  async function loadWho(round: number) {
    const board = boardRef.current;
    if (!board) return;
    const lines = whoLines(board, round);
    setWho({ round, loading: true, error: '', lines, rows: {} });
    setHist({});
    try {
      const payload = lines.map((line) => (line.sub ? { k: line.key, sub: Number(line.key.slice(1)) } : { k: line.key, ids: (line.tr as Row).ids }));
      const data = await api('who_saved', { round, lines: JSON.stringify(payload) });
      setWho((w) => (w && w.round === round ? { ...w, loading: false, rows: data.rows || {} } : w));
    } catch (err) {
      setWho((w) => (w && w.round === round ? { ...w, loading: false, error: 'โหลดไม่สำเร็จ ลองใหม่อีกครั้ง' } : w));
    }
  }
  async function toggleHistory(line: WhoLine, box: 'pack' | 'load') {
    const k = line.key + '|' + box;
    const cur = hist[k];
    if (cur && (cur.data || cur.loading)) {
      setHist((h) => ({ ...h, [k]: { ...cur, open: !cur.open } }));
      return;
    }
    setHist((h) => ({ ...h, [k]: { open: true, loading: true, error: '', data: null } }));
    try {
      const fields: Record<string, string | number> = { round: who?.round || 1, box };
      if (line.sub) fields.sub = line.key.slice(1);
      else fields.ids = (line.tr as Row).ids.join(',');
      const data = await api('box_history', fields);
      setHist((h) => ({ ...h, [k]: { open: true, loading: false, error: '', data } }));
    } catch (err) {
      setHist((h) => ({ ...h, [k]: { open: true, loading: false, error: 'โหลดไม่สำเร็จ กดอีกครั้ง', data: null } }));
    }
  }

  // ---------- ใบเช็คของ: พิมพ์ = บันทึกว่าพิมพ์แล้ว + แชร์เป็นไฟล์ HTML ----------
  async function printSheet(round: number) {
    const board = boardRef.current;
    if (!board) return;
    try {
      const data = await api('mark_printed', { round });
      board.rounds[round].printed = str(data.text);
      board.ctx++;
      bump();
    } catch (err: any) {
      if (err instanceof ApiError && err.data?.job_required) {
        setSheetRound(0);
        showToast(err.message);
        return;
      }
      showToast(err.message);
    }
    try {
      const html = sheetHtml(board, round);
      const uri = FileSystem.cacheDirectory + 'check_' + board.project.site + '_r' + round + '.html';
      await FileSystem.writeAsStringAsync(uri, html, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/html', dialogTitle: 'ใบเช็คของ รอบ ' + round, UTI: 'public.html' });
      else showToast('อุปกรณ์นี้แชร์ไฟล์ไม่ได้');
    } catch (err: any) {
      showToast('สร้างไฟล์ใบเช็คไม่สำเร็จ', true);
    }
  }

  // ---------- เลือกหน้างาน ----------
  async function openPicker() {
    setPick({ loading: true, error: '', list: [], q: '', co: '', cancel: false });
    try {
      const data = await api('projects', {});
      setPick((p) => (p ? { ...p, loading: false, list: Array.isArray(data.projects) ? data.projects : [] } : p));
    } catch (err) {
      setPick((p) => (p ? { ...p, loading: false, error: 'โหลดรายชื่อหน้างานไม่สำเร็จ ปิดแล้วลองใหม่' } : p));
    }
  }

  // ---------- รายการที่แสดง (applyFilter) ----------
  const view = useMemo(() => {
    if (!b) return null;
    const raw = search.trim();
    const q = keyOf(raw);
    const items: ListItem[] = [];
    const matched: Group[] = [];
    let visible = 0;
    const groups = b.sortedGroups();
    const secShown: Record<string, boolean> = {};
    const groupRows = new Map<Group, Row[]>();
    groups.forEach((g) => {
      const isMatch = !q || g.search.includes(q);
      const collapsed = g.sec === 'skip' && !skipOpen && !q;
      const rows = g.rows.filter((row) => {
        // แถวที่กำลังแก้อยู่ไม่หายจากแท็บ แม้อีกคนบันทึกครบไปแล้ว
        const inTab = tab === 'all' || (tab === 'done') === isDone(row) || b.trDirty(row) || row.subs.some((sb) => b.trDirty(sb)) || row === focusRow;
        return isMatch && !collapsed && inTab;
      });
      groupRows.set(g, rows);
      if (rows.length) {
        visible++;
        secShown[g.sec] = true;
      }
      if (isMatch && (q || g.sec !== 'skip')) matched.push(g);
    });
    const counts = b.counts();
    ['goods', 'extra', 'skip'].forEach((sec) => {
      const secGroups = groups.filter((g) => g.sec === sec);
      if (!secGroups.length) return;
      const headShown = sec === 'goods' ? false : sec === 'skip' ? !(q !== '' && !secShown[sec]) : !!secShown[sec];
      if (headShown) items.push({ type: 'sec', sec, key: 'sec-' + sec });
      secGroups.forEach((g) =>
        (groupRows.get(g) || []).forEach((row) => {
          items.push({ type: 'row', row, key: row.key });
          row.subs.forEach((sb) => items.push({ type: 'sub', sub: sb, key: sb.key }));
        })
      );
    });
    let sumText = '';
    if (q) {
      const sumWithUnit = (rows: Row[]) => {
        const totals = new Map<string, number>();
        rows.forEach((row) => totals.set(row.unit || 'ไม่มีหน่วย', (totals.get(row.unit || 'ไม่มีหน่วย') || 0) + row.qty));
        return Array.from(totals, ([unit, total]) => fmt(total) + ' ' + unit).join(' + ');
      };
      const rowsIn = (sec: string) => matched.filter((g) => g.sec === sec).flatMap((g) => g.rows);
      const allMatched = matched.flatMap((g) => g.rows);
      const parts = [
        ['goods', 'รวม'],
        ['extra', 'นอก ปร.'],
        ['skip', 'ไม่นับเป็นของ'],
      ]
        .map(([sec, label]) => [label, rowsIn(sec)] as [string, Row[]])
        .filter(([, rows]) => rows.length)
        .map(([label, rows]) => label + ' ' + sumWithUnit(rows));
      sumText = allMatched.length
        ? 'ผลค้นหา "' + raw + '": ' + matched.length + ' ชื่อ ' + allMatched.length + ' แถว · ' + parts.join(' · ') + ' · ค้าง ' + allMatched.filter((row) => !isDone(row)).length + ' แถว'
        : 'ไม่พบ "' + raw + '"';
    }
    const emptyText = visible ? '' : q ? 'ไม่พบรายการนี้ในแท็บนี้ ลองกดแท็บทั้งหมด' : EMPTY_TEXT[tab];
    return { items, sumText, emptyText, counts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, b?.ctx, search, tab, skipOpen, focusRow, sortMode, b ? b.rows.reduce((t, r) => t + r.v + r.subs.reduce((x, sb) => x + sb.v, 0), 0) : 0]);

  // ---------- render ----------
  if (loading && !b) {
    return (
      <View style={s.center}>
        <LinearGradient colors={BG_GRAD} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={s.centerHint}>กำลังโหลดหน้างาน...</Text>
      </View>
    );
  }
  if (!projectId) {
    return (
      <SafeAreaView style={s.safe} edges={['left', 'right']}>
        <LinearGradient colors={BG_GRAD} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={s.center}>
          <View style={[s.centerIcon, { backgroundColor: C.primarySoft }]}>
            <Ionicons name="clipboard-outline" size={32} color={C.primary} />
          </View>
          <Text style={s.centerTitle}>เลือกหน้างานที่จะเช็คของส่ง</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={openPicker}>
            <Ionicons name="swap-horizontal" size={16} color="#fff" />
            <Text style={s.primaryBtnText}>เลือกหน้างาน</Text>
          </TouchableOpacity>
        </View>
        {renderPicker()}
      </SafeAreaView>
    );
  }
  if (!b) {
    return (
      <SafeAreaView style={s.safe} edges={['left', 'right']}>
        <LinearGradient colors={BG_GRAD} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={s.center}>
          <View style={[s.centerIcon, { backgroundColor: C.badBg }]}>
            <Ionicons name="cloud-offline-outline" size={32} color={C.bad} />
          </View>
          <Text style={s.centerTitle}>โหลดข้อมูลไม่สำเร็จ</Text>
          <Text style={s.errorText}>{loadError || 'โหลดข้อมูลไม่สำเร็จ'}</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => loadPage(projectId)}>
            <Ionicons name="refresh" size={15} color="#fff" />
            <Text style={s.primaryBtnText}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const roundView = b.roundView();
  const hasItems = b.rows.length > 0;
  const counts = view!.counts;

  function renderHeader() {
    const board = b as Board;
    const p = board.project;
    const me = board.me;
    const users = board.presence.filter((u) => u && u.name);
    if (me && !users.some((u) => u.name === me)) users.unshift({ name: me, since: '' });
    users.sort((x, y) => Number(y.name === me) - Number(x.name === me));
    const liveText = board.syncOk ? 'อัปเดตสด' : board.syncFails >= 2 ? 'ขาดการเชื่อมต่อ' : 'กำลังเชื่อมต่อ';
    const anyJob = ROUNDS.some((r) => board.rounds[r].jobOn);
    return (
      <View>
        {/* หัวหน้า: หน้างาน + ความคืบหน้า + คนที่กำลังใช้ */}
        <View style={s.hero}>
          <View style={s.heroTop}>
            <TouchableOpacity
              style={s.backChip}
              onPress={() => {
                const go = () => router.push('/site_job_board' as never);
                if (board.saveBar().dirty) openLeave(go);
                else go();
              }}
              accessibilityLabel="กลับหน้าแจ้งจัดงาน"
            >
              <Ionicons name="arrow-back" size={15} color={C.primary} />
              <Text style={s.backChipText}>แจ้งจัดงาน</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {hasItems && (
              <View style={[s.livePill, !board.syncOk && s.livePillOff]}>
                <View style={[s.liveDot, { backgroundColor: board.syncOk ? '#10B981' : C.faint }]} />
                <Text style={[s.livePillText, !board.syncOk && { color: C.muted }]}>{liveText}</Text>
              </View>
            )}
          </View>

          <View style={s.heroProject}>
            <TouchableOpacity style={s.codeBtn} onPress={openPicker} accessibilityLabel="เลือกหน้างานอื่น">
              <Text style={s.codeKicker}>หน้างาน</Text>
              <Text style={s.codeText}>{p.site}</Text>
              <Ionicons name="chevron-down" size={14} color={C.primary} />
            </TouchableOpacity>
            {p.company && <CompanyBadge company={p.company} />}
          </View>
          <Text style={s.heroName}>{p.name}</Text>
          {!!p.customer && <Text style={s.heroCustomer}>{p.customer}</Text>}

          {hasItems && (
            <View style={s.progress}>
              <View style={s.progressTop}>
                <Text style={s.progressLabel}>ส่งครบแล้ว</Text>
                <Text style={s.progressPct}>
                  {counts.pct.toFixed(2)}
                  <Text style={s.progressPctUnit}>%</Text>
                </Text>
              </View>
              <View style={s.sumBar}>
                {ROUNDS.map((round) => (
                  <View key={round} style={{ width: `${counts.all ? (counts.perRound[round - 1] / counts.all) * 100 : 0}%`, backgroundColor: roundColor(round).c }} />
                ))}
              </View>
              <View style={s.legend}>
                {ROUNDS.filter((round) => counts.perRound[round - 1] > 0).map((round) => (
                  <View key={round} style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: roundColor(round).c }]} />
                    <Text style={s.legendText}>
                      รอบ {round} · {counts.perRound[round - 1]}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={s.statRow}>
                <View style={s.statTile}>
                  <Text style={[s.statTileNum, { color: C.warn }]}>{counts.todo}</Text>
                  <Text style={s.statTileLabel}>ค้าง</Text>
                </View>
                <View style={s.statTile}>
                  <Text style={[s.statTileNum, { color: C.ok }]}>{counts.done}</Text>
                  <Text style={s.statTileLabel}>ครบแล้ว</Text>
                </View>
                <View style={s.statTile}>
                  <Text style={s.statTileNum}>{counts.all}</Text>
                  <Text style={s.statTileLabel}>ทั้งหมด</Text>
                </View>
              </View>
            </View>
          )}

          <View style={s.heroFoot}>
            <View style={s.avatarStack}>
              {users.slice(0, 4).map((u, i) => (
                <View key={u.name} style={[s.stackItem, i > 0 && { marginLeft: -9 }, { zIndex: 10 - i }]}>
                  <Avatar name={u.name} size={28} />
                </View>
              ))}
              {users.length > 4 && (
                <View style={[s.stackItem, s.stackMore, { marginLeft: -9 }]}>
                  <Text style={s.stackMoreText}>+{users.length - 4}</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.presenceTitle}>กำลังใช้หน้านี้ {users.length} คน</Text>
              <Text style={s.presenceNames} numberOfLines={1}>
                {users.map((u) => (u.name === me ? 'คุณ' : u.name)).join(' · ')}
              </Text>
            </View>
            <TouchableOpacity
              style={s.shareBtn}
              onPress={() => {
                const url = API_BASE + '/site_item_check.php?project_id=' + p.id;
                const title = 'เช็คของส่ง หน้างาน ' + p.site;
                void Share.share({ message: title + ' (ล็อกอินก่อนเข้า)\n' + url, title });
              }}
              accessibilityLabel="ส่งลิงก์หน้านี้ (หน้าเว็บ ผู้รับต้องล็อกอินก่อน)"
            >
              <Ionicons name="share-social-outline" size={15} color={C.primary} />
              <Text style={s.shareText}>ส่งลิงก์</Text>
            </TouchableOpacity>
          </View>
        </View>

        {board.extraPending > 0 && (
          <View style={s.notice}>
            <View style={s.noticeIcon}>
              <Ionicons name="hourglass" size={15} color={C.warn} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.noticeTitle}>สินค้านอก ปร. รออนุมัติ {board.extraPending} รายการ</Text>
              <Text style={s.noticeText}>ยังไม่ขึ้นในหน้านี้ จะขึ้นเมื่อผู้จัดการหรือผู้บริหารอนุมัติที่หน้าตรวจสอบต้นทุน</Text>
            </View>
          </View>
        )}

        {/* รับของคืนจากหน้างาน: รายการที่ลบแล้ว (ส่งไปแล้ว) / รอรับคืน / รับคืนแล้ว · ซ่อนเมื่อไม่มี */}
        {board.returns.list.length > 0 && (() => {
          const retOpen = board.returns.list.filter((r) => r.status !== 'picked').length;
          const retDone = board.returns.list.length - retOpen;
          const allDone = retOpen === 0; // รับคืนครบหมดแล้ว = กรอบ/หัวเขียว
          return (
          <View style={[s.returnPanel, allDone && { borderColor: C.ok }]}>
            <View style={s.returnHead}>
              <Ionicons name={allDone ? 'checkmark-circle' : 'arrow-undo'} size={16} color={allDone ? C.ok : C.bad} />
              <Text style={[s.returnTitle, allDone && { color: C.ok }]}>รับของคืนจากหน้างาน</Text>
              <Text style={[s.returnSum, { color: allDone ? C.ok : C.bad }]}>
                {[retOpen ? 'ค้าง ' + retOpen : '', retDone ? 'รับคืนแล้ว ' + retDone : ''].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={s.returnTarget}>
              {allDone
                ? 'คนขับรับของคืนครบแล้ว'
                : board.returns.target
                  ? 'รอรับคืนจะขึ้นในใบส่งรอบ ' + board.returns.target.round + ' (' + board.returns.target.do + ')'
                  : 'ยังไม่มีใบส่งรอบถัดไป · รอรับคืนจะขึ้นเมื่อออกใบส่งรอบถัดไป'}
            </Text>
            {board.returns.list.map((r) => {
              const st = RETURN_STATUS[r.status] || RETURN_STATUS.found;
              return (
              <View key={r.id} style={[s.returnItem, r.status === 'picked' && { borderColor: C.ok, backgroundColor: C.okBg }]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={[s.returnStatus, { backgroundColor: st.bg }]}>
                    <Ionicons name={st.icon} size={12} color={st.color} />
                    <Text style={[s.returnStatusText, { color: st.color }]}>{st.text}</Text>
                  </View>
                  <View style={s.returnLine}>
                    <Text style={s.returnName}>{r.name}</Text>
                    <Text style={[s.returnQty, r.status === 'picked' && { color: C.ok }]}>
                      {(r.status === 'picked' ? fmt(r.picked_qty) + (returnShort(r) ? ' จาก ' + fmt(r.qty) : '') : fmt(r.qty)) + unitText(r.unit)}
                    </Text>
                    <Chip text={r.reason === 'deleted' ? 'ลบรายการแล้ว' : 'แก้จำนวนลด'} color={r.reason === 'deleted' ? C.warn : C.info} bg={r.reason === 'deleted' ? C.warnBg : C.infoBg} />
                  </View>
                  <Text style={s.returnMeta}>{returnMeta(r)}</Text>
                </View>
                {r.status === 'found' && (
                  <TouchableOpacity style={s.returnBtn} onPress={() => void runReturn(board, 'return_request', { found: String(r.id) })} accessibilityRole="button" accessibilityLabel={'รับของคืน ' + r.name}>
                    <Ionicons name="arrow-undo" size={13} color={C.bad} />
                    <Text style={s.returnBtnText}>รับของคืน</Text>
                  </TouchableOpacity>
                )}
                {r.status === 'waiting' && (
                  <TouchableOpacity onPress={() => askCancelReturn(board, r)} hitSlop={8} accessibilityRole="button" accessibilityLabel={'ยกเลิกรอรับคืน ' + r.name}>
                    <Text style={s.returnCancel}>ยกเลิก</Text>
                  </TouchableOpacity>
                )}
              </View>
              );
            })}
          </View>
          );
        })()}

        {!hasItems ? (
          <View style={s.emptyPage}>
            <View style={[s.centerIcon, { backgroundColor: C.track }]}>
              <Ionicons name="file-tray-outline" size={30} color={C.muted} />
            </View>
            <Text style={s.emptyPageText}>โครงการนี้ยังไม่มีรายการสินค้า</Text>
          </View>
        ) : (
          <>
            {/* สถานะจัดงาน: กดแจ้งจัดงานรายรอบ ค้างไว้จนกดบันทึก + ยืนยัน */}
            <View style={s.panel}>
              <PanelTitle
                icon="megaphone"
                title="สถานะจัดงาน"
                right={
                  <Text style={[s.panelRight, anyJob && { color: C.ok }]} numberOfLines={1}>
                    {board.jobStatusText()}
                  </Text>
                }
              />
              {roundView.jobRows.filter((jr) => jr.visible).map(({ round, edit }) => {
                const card = board.rounds[round];
                const rc = roundColor(round);
                const changed = board.jobChanged(round);
                const show = card.jobOn && !changed;
                const prog = show ? board.roundProgress(round) : null;
                const pc = prog ? JOB_STATUS_COLOR[prog.status] : null;
                const isShown = round === roundView.shown;
                // วันที่ขึ้นของ: กรอกที่กล่องสถานะจัดงาน (ผู้ใช้สั่ง 12 พ.ย. 69) · รอบที่คนขับยืนยันแล้ว/จบรอบแล้ว/ไม่มีสิทธิ์แก้ไขรอบเก่า แก้ไม่ได้ (เซิร์ฟเวอร์กันซ้ำ)
                const loadLocked = board.roundFrozen(round) || (!board.canEditRound && round !== roundView.current);
                const loadChanged = card.head.load_at !== card.savedHead.load_at;
                // ยืนยันจบรอบ (ผู้ใช้สั่ง 13 พ.ย. 69): แจ้งจัดงานแล้ว (บันทึกแล้ว) + บันทึกขึ้นของรอบนี้แล้ว + ยังไม่จบ · ไม่มีสิทธิ์แก้ไขรอบ = เฉพาะรอบล่าสุด
                const done = show && card.done;
                // ทุกคนจบได้ทุกรอบที่แจ้งแล้ว (จบรอบไม่แก้ข้อมูล · เดิมจำกัดรอบล่าสุด รอบเก่าค้างในหน้าแจ้งจัดงาน)
                const canFinish = card.jobSaved && show && !card.done && board.roundLoadSaved(round);
                return (
                  <View key={round} style={{ gap: 6 }}>
                  <View style={s.jobRow}>
                    <TouchableOpacity
                      style={[s.jobBtn, card.jobOn && { backgroundColor: rc.tint, borderColor: rc.c + '40' }, isShown && { borderColor: rc.c, borderWidth: 1.5 }, changed && s.jobChanged]}
                      onPress={() => board.toggleJob(round)}
                      disabled={board.saving}
                      activeOpacity={0.75}
                      accessibilityState={{ checked: card.jobOn }}
                    >
                      <RoundBadge round={round} size={42} off={!card.jobOn} />
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={[s.jobState, card.jobOn && { color: rc.c }, done && { color: C.ok }]}>{done ? 'จบรอบแล้ว' : card.jobOn ? 'แจ้งจัดงานแล้ว' : 'ยังไม่แจ้งจัดงาน'}</Text>
                        <Text style={s.jobMeta} numberOfLines={2}>
                          {board.jobMeta(round)}
                        </Text>
                        {prog && pc && (
                          <View style={s.jobProg}>
                            <View style={s.jobProgTop}>
                              <View style={[s.jobProgPill, { backgroundColor: pc.bg }]}>
                                <Text style={[s.jobProgLabel, { color: pc.c }]}>{JOB_STATUS_TEXT[prog.status]}</Text>
                              </View>
                              <Text style={s.jobProgCount}>{prog.total === 0 ? 'ไม่มีรายการค้าง' : 'จัดแล้ว ' + prog.packed + '/' + prog.total}</Text>
                            </View>
                            {prog.total > 0 && prog.status !== 'loaded' && (
                              <>
                                <View style={s.jobBar}>
                                  <View style={{ width: `${Math.round((prog.packed / prog.total) * 100)}%`, backgroundColor: pc.c, height: '100%', borderRadius: 3 }} />
                                </View>
                                <Text style={s.jobProgLeft}>ค้างขึ้น {prog.left} รายการ</Text>
                              </>
                            )}
                          </View>
                        )}
                      </View>
                      <Ionicons
                        name={done ? 'flag' : card.jobSaved ? 'lock-closed' : card.jobOn ? 'checkmark-circle' : 'ellipse-outline'}
                        size={card.jobSaved ? 18 : 24}
                        color={done ? C.ok : card.jobOn ? rc.c : C.faint}
                        accessibilityLabel={done ? 'จบรอบแล้ว' : card.jobSaved ? 'แจ้งแล้ว ยกเลิกไม่ได้' : undefined}
                      />
                    </TouchableOpacity>
                    {edit && (
                      <TouchableOpacity style={s.jobEdit} onPress={() => board.setEditRound(round)} accessibilityLabel={'แก้ไขรอบ ' + round}>
                        <Ionicons name="pencil" size={14} color={C.primary} />
                        <Text style={s.jobEditText}>แก้ไข</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={[s.jobLoadField, loadChanged && s.jobLoadChanged, loadLocked && { opacity: 0.6 }]}>
                    <Ionicons name="cube-outline" size={15} color={C.info} />
                    <Text style={s.jobLoadText}>วันที่ขึ้นของ</Text>
                    <View style={{ flex: 1 }}>
                      <DateField value={card.head.load_at} onChange={(ymd) => board.setLoadAt(round, ymd)} placeholder="เลือกวันที่" disabled={loadLocked} />
                    </View>
                    {!!card.head.load_at && !loadLocked && (
                      <TouchableOpacity onPress={() => board.setLoadAt(round, '')} hitSlop={8} accessibilityLabel={'ล้างวันที่ขึ้นของ รอบ ' + round}>
                        <Ionicons name="close-circle" size={19} color={C.faint} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {/* หมายเหตุจัดงาน (ผู้ใช้สั่ง 13 พ.ย. 69) ใต้วันที่ขึ้นของ · กติกาแก้ได้เหมือนวันที่ขึ้นของ · แสดงในหน้าแจ้งจัดงาน ไม่อยู่ในใบส่งของ */}
                  {/* ยาวแสดงบรรทัดเดียว กดเปิดป๊อปอัปดูเต็ม/แก้ (JobNoteModal) · แก้ไม่ได้ = ดูอย่างเดียว */}
                  <TouchableOpacity
                    style={[s.jobNoteField, board.jobNoteChanged(round) && s.jobLoadChanged, loadLocked && { opacity: 0.75 }]}
                    onPress={() => setJobNoteRound(round)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={'หมายเหตุจัดงาน รอบ ' + round + ' กดเพื่อดูทั้งหมด'}
                  >
                    <Ionicons name="document-text-outline" size={15} color={C.warn} />
                    <Text style={s.jobNoteLabel}>หมายเหตุ</Text>
                    <Text style={[s.jobNoteInput, !card.head.job_note.trim() && { color: C.faint }]} numberOfLines={1}>
                      {card.head.job_note.trim() || (loadLocked ? 'ไม่มีหมายเหตุ' : 'เพิ่มหมายเหตุจัดงาน (ถ้ามี)')}
                    </Text>
                    <Ionicons name="open-outline" size={14} color={C.muted} />
                  </TouchableOpacity>
                  {canFinish && (
                    <TouchableOpacity
                      style={[s.jobFinish, finishing === round && { opacity: 0.6 }]}
                      onPress={() => askFinishRound(board, round)}
                      disabled={board.saving || finishing !== 0}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={'ยืนยันจบรอบ ' + round}
                    >
                      <Ionicons name="flag" size={16} color="#fff" />
                      <Text style={s.jobFinishText}>{finishing === round ? 'กำลังบันทึก...' : 'ยืนยันจบรอบ ' + round}</Text>
                    </TouchableOpacity>
                  )}
                  </View>
                );
              })}
              {roundView.editing > 0 && (
                <View style={s.jobView}>
                  <Ionicons name="eye-outline" size={15} color={C.warn} />
                  <Text style={s.jobViewText}>
                    กำลังแก้รอบ {roundView.editing} {roundView.editing === roundView.current ? '(ยืนยันจบแล้ว)' : '(ซ่อนรอบอื่น)'}
                  </Text>
                  <TouchableOpacity onPress={() => board.setEditRound(0)} accessibilityLabel="กลับรอบล่าสุด">
                    <Text style={s.jobViewBack}>
                      {roundView.editing === roundView.current ? 'เสร็จแก้ไข' : roundView.current ? 'กลับรอบ ' + roundView.current + ' (ล่าสุด)' : 'ซ่อนรอบนี้'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={s.hintRow}>
                <Ionicons name="information-circle-outline" size={14} color={C.muted} />
                <Text style={s.hintText}>แจ้งจัดงานแล้วบันทึก จึงพิมพ์ใบเช็คของรอบนั้นได้</Text>
              </View>
            </View>

            {/* รอบที่แสดง: ใบส่ง + ข้อมูลขนส่ง + ปุ่มคำสั่ง */}
            {ROUNDS.filter((round) => round === roundView.shown).map((round) => {
              const card = board.rounds[round];
              const head = card.head;
              const ready = board.sheetReady(round);
              const meta = headMeta(head);
              const tiles: ReactNode[] = [
                <ActTile
                  key="head"
                  icon="car"
                  label="ข้อมูลใบส่ง"
                  disabled={card.locked}
                  blocked={board.roundClosed(round)}
                  onPress={() => {
                    // ยืนยันจบรอบแล้ว: แก้ข้อมูลใบส่งต้องกดแก้ไขรอบก่อน (เหมือนช่องจัด/ขึ้น)
                    if (board.roundClosed(round)) {
                      showToast(board.frozenText(round));
                      return;
                    }
                    setHeadRound(round);
                    setHeadDraft({ ...card.head });
                  }}
                />,
                <ActTile
                  key="sheet"
                  icon="list"
                  label="ใบเช็คของ"
                  blocked={!ready}
                  onPress={() => {
                    if (board.sheetReady(round)) setSheetRound(round);
                    else showToast(board.sheetBlockText(round));
                  }}
                />,
                <ActTile key="who" icon="people" label="ผู้จัดของ" onPress={() => loadWho(round)} />,
              ];
              if (card.hasDo) {
                tiles.push(
                  <ActTile
                    key="print"
                    icon="print"
                    label="พิมพ์ใบส่ง"
                    onPress={() => Linking.openURL(API_BASE + '/print_delivery_note.php?doc_no=' + encodeURIComponent(card.do)).catch(() => showToast('เปิดหน้าเว็บไม่ได้'))}
                  />,
                  <ActTile key="driver" icon="clipboard" label="หน้าคนขับ" onPress={() => router.push({ pathname: '/DriverConfirmItems', params: { do_no: card.do } } as never)} />
                );
              }
              const tileRows: ReactNode[][] = [];
              for (let i = 0; i < tiles.length; i += 3) tileRows.push(tiles.slice(i, i + 3));
              return (
                <View key={round} style={[s.panel, board.headChanged(round) && s.cardDirty, card.locked && s.panelLocked]}>
                  <View style={s.rcTop}>
                    <RoundBadge round={round} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.rcTitle}>
                        รอบ {round}
                        
                      </Text>
                      <Text style={s.rcSub}>
                        ครบ <Text style={{ fontWeight: '900', color: C.text }}>{counts.perRound[round - 1]}</Text> รายการ
                      </Text>
                    </View>
                    {card.locked && (
                      <View style={[s.statePill, { backgroundColor: C.track }]}>
                        <Ionicons name="lock-closed" size={11} color={C.soft} />
                        <Text style={[s.statePillText, { color: C.soft }]}>ล็อกแล้ว</Text>
                      </View>
                    )}
                  </View>

                  <View style={s.doBox}>
                    <Ionicons name="document-text-outline" size={16} color={C.soft} />
                    {card.hasDo ? (
                      <>
                        <Text style={s.doNo}>ใบส่ง {card.do}</Text>
                        <View style={[s.statePill, { backgroundColor: card.locked ? C.okBg : C.warnBg }]}>
                          <Text style={[s.statePillText, { color: card.locked ? C.ok : C.warn }]}>{card.locked ? 'คนขับยืนยันรับของแล้ว' : 'รอคนขับยืนยัน'}</Text>
                        </View>
                      </>
                    ) : card.missing ? (
                      <Text style={[s.doState, { color: C.bad }]}>ใบส่ง {card.do} ถูกลบไปแล้ว</Text>
                    ) : (
                      <Text style={s.doState}>ยังไม่ออกใบส่ง</Text>
                    )}
                  </View>
                  {card.source === 'adopted' && <Text style={s.roundNote}>ดึงจากใบส่งที่เปิดไว้ก่อน จะผูกเข้ารอบนี้เมื่อกดบันทึก</Text>}
                  {card.mismatch && <Text style={[s.roundNote, { color: C.bad }]}>จำนวนในใบส่งไม่ตรงกับหน้านี้ (มีคนแก้จากที่อื่น) ถ้าบันทึกรอบนี้ ใบส่งจะถูกแก้ตามหน้านี้</Text>}

                  <View style={s.infoBox}>
                    <View style={s.infoLine}>
                      <Ionicons name="car-outline" size={15} color={C.muted} />
                      <Text style={s.infoText}>{headSummary(head)}</Text>
                    </View>
                    {!!meta && (
                      <View style={s.infoLine}>
                        <Ionicons name="calendar-outline" size={15} color={C.muted} />
                        <Text style={[s.infoText, { color: C.soft, fontWeight: '500' }]}>{meta}</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ gap: 8 }}>
                    {tileRows.map((rowTiles, i) => (
                      <View key={i} style={s.actRow}>
                        {rowTiles}
                        {Array.from({ length: 3 - rowTiles.length }).map((_, k) => (
                          <View key={'pad' + k} style={{ flex: 1 }} />
                        ))}
                      </View>
                    ))}
                  </View>
                  {!!card.printed && (
                    <View style={s.printedRow}>
                      <Ionicons name="checkmark-circle" size={14} color={C.ok} />
                      <Text style={s.printed}>พิมพ์รายการแล้ว {card.printed}</Text>
                    </View>
                  )}
                </View>
              );
            })}

            {board.others.length > 0 && (
              <View style={s.notice}>
                <View style={s.noticeIcon}>
                  <Ionicons name="documents-outline" size={15} color={C.warn} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.noticeTitle}>ใบส่งของอื่นของโครงการนี้</Text>
                  <Text style={s.noticeText}>(เกิน 3 รอบ จึงไม่อยู่ในรอบไหน จำนวนในใบเหล่านี้ไม่ได้นับในช่องรอบ)</Text>
                  {board.others.map((o) => (
                    <Text key={o.no} style={s.noticeText}>
                      {o.no} · {o.lines} รายการ · {o.confirmed ? 'คนขับยืนยันแล้ว' : 'รอคนขับยืนยัน'}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {/* แท็บ + ค้นหา + ตัวกรอง */}
            <View style={s.toolsHead}>
              <Text style={s.toolsTitle}>รายการของ</Text>
              {roundView.shown > 0 && <RoundPill round={roundView.shown} suffix=" ที่แสดง" />}
            </View>
            <View style={s.tools}>
              <Segmented
                options={[
                  { key: 'todo', label: 'ค้าง', count: counts.todo, color: C.warn },
                  { key: 'done', label: 'ครบแล้ว', count: counts.done, color: C.ok },
                  { key: 'all', label: 'ทั้งหมด', count: counts.all, color: C.primary },
                ]}
                value={tab}
                onChange={setTab}
              />
              <View style={s.searchBox}>
                <Ionicons name="search" size={16} color={C.muted} />
                <TextInput value={search} onChangeText={setSearch} placeholder="ค้นหาชื่อรายการ เช่น ข้องอ" placeholderTextColor={C.muted} style={s.searchInput} autoCorrect={false} />
                {!!search && (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="ล้างคำค้นหา">
                    <Ionicons name="close-circle" size={17} color={C.faint} />
                  </TouchableOpacity>
                )}
              </View>
              <View style={s.toolRow}>
                <TouchableOpacity style={[s.toolBtn, noteOnly && s.toolBtnOn]} onPress={() => setNoteOnly((n) => !n)} aria-selected={noteOnly}>
                  <Ionicons name="funnel" size={13} color={noteOnly ? '#fff' : C.primary} />
                  <Text style={[s.toolBtnText, noteOnly && { color: '#fff' }]}>
                    หมายเหตุตามใบเช็ค รอบ {board.latestJobRound()} · {board.noteFilterCount()}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.toolBtn} onPress={() => setSortOpen(true)}>
                  <Ionicons name="swap-vertical" size={13} color={C.primary} />
                  <Text style={s.toolBtnText}>{sortMode === 'name' ? 'เรียงตามชื่อ ก-ฮ' : 'เรียงตามลำดับใน ปร.'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            {!!view!.sumText && (
              <View style={s.searchSum}>
                <Ionicons name="search-circle" size={16} color={C.info} />
                <Text style={s.searchSumText}>{view!.sumText}</Text>
              </View>
            )}
          </>
        )}
      </View>
    );
  }

  function renderSec(sec: string) {
    if (sec === 'extra') {
      return (
        <View style={s.secHead}>
          <View style={[s.secIcon, { backgroundColor: C.warnBg }]}>
            <Ionicons name="cube" size={15} color={C.warn} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.secTitle}>รายการนอก ปร.</Text>
            <Text style={s.secText}>
              ครบ {counts.extraDone} จาก {counts.extraAll} แถว · แยกไว้ ไม่นับใน % เพราะอาจซ้ำกับรายการด้านบน
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View style={s.secHead}>
        <View style={[s.secIcon, { backgroundColor: C.track }]}>
          <Ionicons name="eye-off" size={15} color={C.soft} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.secTitle}>ไม่นับเป็นของ</Text>
          <Text style={s.secText}>{counts.skipAll} แถว เช่น หัวข้อ งานรื้อถอน งานบริการ รายการรวมค่าแรง และรายการที่ไม่มีราคากลาง/ทุน</Text>
        </View>
        <TouchableOpacity style={s.secToggle} onPress={() => setSkipOpen((o) => !o)}>
          <Text style={s.secToggleText}>{skipOpen ? 'ซ่อน' : 'แสดง'}</Text>
          <Ionicons name={skipOpen ? 'chevron-up' : 'chevron-down'} size={13} color={C.primary} />
        </TouchableOpacity>
      </View>
    );
  }

  function renderItem({ item }: { item: ListItem }) {
    const board = b as Board;
    if (item.type === 'sec') return renderSec(item.sec);
    if (item.type === 'row') return <RowCard b={board} row={item.row} v={item.row.v} ctx={board.ctx} shown={roundView.shown} noteOnly={noteOnly} act={act} />;
    return <SubCard b={board} sub={item.sub} v={item.sub.v} ctx={board.ctx} shown={roundView.shown} act={act} />;
  }

  // ---------- ป๊อปอัป ----------
  function renderConfirm() {
    if (!confirm) return null;
    const { lines, ticked, unticked, stockCount } = confirm;
    const sum =
      'แก้ไข ' + lines.length + ' รายการ' + (ticked ? ' · ติ๊กครบ ' + ticked : '') + (unticked ? ' · ยกเลิกครบ ' + unticked : '') + (stockCount ? ' · เบิกสต๊อกอัตโนมัติ ' + stockCount + ' รายการ' : '') + (ticked ? ' · รายการที่ครบจะย้ายออกจากแท็บค้าง' : '');
    return (
      <SheetModal
        visible
        onClose={() => !busyText && closeConfirm()}
        title="ยืนยันบันทึก"
        sub={sum}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        footer={
          <View style={s.sheetActions}>
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={closeConfirm} disabled={!!busyText}>
              <Text style={[s.btnText, { color: C.text }]}>กลับไปแก้</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnPrimary, !!busyText && { opacity: 0.7 }]} onPress={() => doSave()} disabled={!!busyText}>
              {busyText ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={17} color="#fff" />}
              <Text style={[s.btnText, { color: '#fff' }]}>{busyText || 'ยืนยันบันทึก'}</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <ChangeList lines={lines} />
      </SheetModal>
    );
  }

  function renderLeave() {
    if (!leave || !b) return null;
    const { lines } = b.collectChanges();
    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busyText) setLeave(null);
        }}
      >
        <View style={s.pickerOverlay}>
          <View style={s.picker}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <View style={[s.centerIcon, { backgroundColor: C.warnBg, width: 60, height: 60, borderRadius: 22 }]}>
                <Ionicons name="warning" size={28} color={C.warn} />
              </View>
              <Text style={s.pickerTitle}>ยังไม่ได้บันทึก</Text>
              <Text style={s.leaveText}>แก้ไข {lines.length} รายการ ยังไม่ได้บันทึก ถ้าออกตอนนี้สิ่งที่แก้จะหายไป</Text>
            </View>
            <ScrollView style={{ maxHeight: 220, marginTop: 10 }}>
              <ChangeList lines={lines} />
            </ScrollView>
            {!!leave.error && <Text style={s.leaveError}>{leave.error}</Text>}
            <View style={{ gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={[s.btn, s.btnPrimary, (!!leave.error || !!busyText) && { opacity: 0.5 }]}
                disabled={!!leave.error || !!busyText}
                onPress={async () => {
                  const go = leave.go;
                  const ok = await doSave();
                  if (ok) {
                    setLeave(null);
                    go();
                  } else {
                    setLeave((l) => (l ? { ...l, error: 'บันทึกไม่สำเร็จ · ยังไม่ได้ออกจากหน้า' } : l));
                  }
                }}
              >
                {busyText ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save" size={16} color="#fff" />}
                <Text style={[s.btnText, { color: '#fff' }]}>{busyText || 'บันทึกแล้วออก'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btn, s.btnDanger]}
                disabled={!!busyText}
                onPress={() => {
                  const go = leave.go;
                  setLeave(null);
                  go();
                }}
              >
                <Ionicons name="exit-outline" size={16} color="#fff" />
                <Text style={[s.btnText, { color: '#fff' }]}>ออกโดยไม่บันทึก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnGhost]} disabled={!!busyText} onPress={() => setLeave(null)}>
                <Text style={[s.btnText, { color: C.text }]}>ยกเลิก อยู่หน้านี้ต่อ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  function renderHead() {
    if (!headRound || !headDraft || !b) return null;
    const card = b.rounds[headRound];
    const d = headDraft;
    const set = (patch: Partial<Head>) => setHeadDraft((h) => (h ? { ...h, ...patch } : h));
    const external = d.transport === 'external';
    const datePart = d.deliver_at ? d.deliver_at.slice(0, 10) : '';
    const timePart = d.deliver_at ? d.deliver_at.slice(11, 16) : '';
    const staffSet = new Set(b.transport.users);
    const carLabel = (plate: string) => b.transport.cars.find((c) => c.plate === plate)?.label || plate;
    const close = () => {
      setHeadRound(0);
      setHeadDraft(null);
      setChoice('');
    };
    const withValue = (list: { value: string; label: string }[], value: string) => (value && !list.some((o) => o.value === value) ? [{ value, label: value }].concat(list) : list);
    return (
      <SheetModal
        visible
        onClose={close}
        title={'ข้อมูลใบส่งของ รอบ ' + headRound + (card.do ? ' · ' + card.do : '')}
        sub="ใช้ออกใบส่งของของรอบนี้ ข้อมูลจะถูกบันทึกเมื่อกดบันทึกและยืนยัน · * ต้องกรอกก่อนออกใบส่ง"
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        footer={
          <View style={s.sheetActions}>
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={close}>
              <Text style={[s.btnText, { color: C.text }]}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnPrimary]}
              onPress={() => {
                const head: Head = {
                  transport: external ? 'external' : 'internal',
                  driver: d.driver.trim(),
                  helper: external ? '' : d.helper.trim(),
                  vehicle: d.vehicle.trim(),
                  receiver: d.receiver.trim(),
                  organizer: d.organizer.trim(),
                  deliver_at: d.deliver_at.replace('T', ' '),
                  load_at: d.load_at,
                  job_note: b.rounds[headRound].head.job_note, // กรอกที่กล่องสถานะจัดงาน ไม่อยู่ในป๊อปอัปนี้ คงค่าเดิม
                  note: d.note.trim(),
                };
                b.setHead(headRound, head);
                close();
              }}
            >
              <Ionicons name="checkmark" size={17} color="#fff" />
              <Text style={[s.btnText, { color: '#fff' }]}>ตกลง</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
          <Text style={s.formLabel}>การขนส่ง</Text>
          <View style={s.segment}>
            {(['internal', 'external'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[s.segmentBtn, d.transport === t && s.segmentOn]}
                onPress={() => set(t === d.transport ? {} : { transport: t, driver: '', vehicle: '', helper: '' })}
              >
                <Ionicons name={t === 'internal' ? 'business-outline' : 'cube-outline'} size={15} color={d.transport === t ? C.primary : C.muted} />
                <Text style={[s.segmentText, d.transport === t && { color: C.primary }]}>{t === 'internal' ? 'รถบริษัท' : 'รถนอก / ขนส่ง'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {!external ? (
            <>
              <Text style={s.formLabel}>
                คนขับ <Text style={{ color: C.bad }}>*</Text>
              </Text>
              <TouchableOpacity style={s.selectBox} onPress={() => setChoice('driver')}>
                <Ionicons name="person-outline" size={15} color={C.muted} />
                <Text style={[s.selectText, !d.driver && s.placeholder]}>{d.driver || 'เลือกคนขับ'}</Text>
                <Ionicons name="chevron-down" size={15} color={C.muted} />
              </TouchableOpacity>
              <Text style={s.formLabel}>คนรถ</Text>
              <TouchableOpacity style={s.selectBox} onPress={() => setChoice('helper')}>
                <Ionicons name="people-outline" size={15} color={C.muted} />
                <Text style={[s.selectText, !d.helper && s.placeholder]}>{d.helper || 'ไม่มี'}</Text>
                <Ionicons name="chevron-down" size={15} color={C.muted} />
              </TouchableOpacity>
              <Text style={s.formLabel}>
                รถ <Text style={{ color: C.bad }}>*</Text>
              </Text>
              <TouchableOpacity style={s.selectBox} onPress={() => setChoice('vehicle')}>
                <Ionicons name="car-outline" size={15} color={C.muted} />
                <Text style={[s.selectText, !d.vehicle && s.placeholder]}>{d.vehicle ? carLabel(d.vehicle) : 'เลือกรถ'}</Text>
                <Ionicons name="chevron-down" size={15} color={C.muted} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.formLabel}>
                ชื่อคนขับหรือขนส่ง <Text style={{ color: C.bad }}>*</Text>
              </Text>
              <TextInput style={s.textField} value={d.driver} onChangeText={(t) => set({ driver: t })} maxLength={255} placeholder="เช่น ส่งแฟลช" placeholderTextColor={C.muted} />
              <Text style={s.formLabel}>ทะเบียนรถ / เลขพัสดุ</Text>
              <TextInput style={s.textField} value={d.vehicle} onChangeText={(t) => set({ vehicle: t })} maxLength={100} placeholder="ไม่บังคับ" placeholderTextColor={C.muted} />
            </>
          )}
          <Text style={s.formLabel}>ผู้จัดงาน</Text>
          <TouchableOpacity style={s.selectBox} onPress={() => setChoice('organizer')}>
            <Ionicons name="person" size={15} color={C.muted} />
            <Text style={[s.selectText, !d.organizer && s.placeholder]}>{d.organizer || 'เลือก/พิมพ์ชื่อ'}</Text>
            {!!d.organizer && (
              <TouchableOpacity onPress={() => set({ organizer: '' })} hitSlop={8} accessibilityLabel="ล้างชื่อผู้จัดงาน">
                <Ionicons name="close-circle" size={17} color={C.faint} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          {!!d.organizer && !staffSet.has(d.organizer) && <Text style={s.fieldHint}>ไม่อยู่ในรายชื่อพนักงาน จะบันทึกตามที่พิมพ์</Text>}
          {/* วันที่ขึ้นของ: แจ้งทีมจัดของว่าขึ้นรถวันไหน (หน้าแจ้งจัดงาน/สถานะจัดงาน/ใบเช็คของ) ไม่อยู่ในใบส่งของ */}
          <Text style={s.formLabel}>วันที่ขึ้นของ</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <DateField value={d.load_at} onChange={(ymd) => set({ load_at: ymd })} placeholder="เลือกวันที่ขึ้นของ" />
            </View>
            {!!d.load_at && (
              <TouchableOpacity onPress={() => set({ load_at: '' })} style={{ justifyContent: 'center' }} accessibilityLabel="ล้างวันที่ขึ้นของ">
                <Ionicons name="close-circle" size={19} color={C.faint} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={s.formLabel}>วันเวลาส่ง</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 3 }}>
              <DateField value={datePart} onChange={(ymd) => set({ deliver_at: ymd + ' ' + (timePart || '08:00') })} placeholder="เลือกวันที่" />
            </View>
            <View style={{ flex: 2 }}>
              <TimeField value={timePart} onChange={(hm) => set({ deliver_at: (datePart || todayYmd()) + ' ' + hm })} placeholder="เวลา" />
            </View>
            {!!d.deliver_at && (
              <TouchableOpacity onPress={() => set({ deliver_at: '' })} style={{ justifyContent: 'center' }} accessibilityLabel="ล้างวันเวลาส่ง">
                <Ionicons name="close-circle" size={19} color={C.faint} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={s.formLabel}>ผู้รับหน้างาน</Text>
          <TextInput style={s.textField} value={d.receiver} onChangeText={(t) => set({ receiver: t })} maxLength={100} placeholder="เช่น ช่าง A, โฟร์แมน B" placeholderTextColor={C.muted} />
          <Text style={s.formLabel}>หมายเหตุใบส่ง</Text>
          <TextInput style={[s.textField, { minHeight: 72, textAlignVertical: 'top' }]} value={d.note} onChangeText={(t) => set({ note: t })} maxLength={2000} multiline />
        </ScrollView>
        <ChoiceModal
          visible={choice === 'driver' || choice === 'helper'}
          title={choice === 'driver' ? 'เลือกคนขับ' : 'เลือกคนรถ'}
          options={withValue(b.transport.drivers.map((n) => ({ value: n, label: n })), choice === 'driver' ? d.driver : d.helper)}
          value={choice === 'driver' ? d.driver : d.helper}
          allowEmpty={choice === 'helper' ? 'ไม่มี' : undefined}
          onPick={(v) => {
            set(choice === 'driver' ? { driver: v } : { helper: v });
            setChoice('');
          }}
          onClose={() => setChoice('')}
        />
        <ChoiceModal
          visible={choice === 'vehicle'}
          title="เลือกรถ"
          options={withValue(b.transport.cars.map((c) => ({ value: c.plate, label: c.label })), d.vehicle)}
          value={d.vehicle}
          searchable
          onPick={(v) => {
            set({ vehicle: v });
            setChoice('');
          }}
          onClose={() => setChoice('')}
        />
        <OrganizerModal
          visible={choice === 'organizer'}
          staff={b.transport.users}
          value={d.organizer}
          onPick={(v) => {
            set({ organizer: v });
            setChoice('');
          }}
          onClose={() => setChoice('')}
        />
      </SheetModal>
    );
  }

  function renderSheet() {
    if (!sheetRound || !b) return null;
    const round = sheetRound;
    const card = b.rounds[round];
    const head = card.head;
    const lines = b.checkLines();
    let number = 0;
    let section = 'goods';
    const meta = [head.load_at ? 'วันที่ขึ้นของ ' + thaiDateTime(head.load_at) : '', head.deliver_at ? 'วันที่ส่ง ' + thaiDateTime(head.deliver_at) : '', head.driver ? headSummary(head) : '', head.organizer ? 'ผู้จัดงาน ' + head.organizer : '', head.job_note ? 'หมายเหตุจัดงาน: ' + head.job_note : ''].filter(Boolean).join(' · ');
    const subCount = lines.filter((l) => l.isSub).length;
    const rowsOut: ReactNode[] = [];
    lines.forEach((line, idx) => {
      if (line.sec !== section) {
        section = line.sec;
        rowsOut.push(
          <View key={'sec' + idx} style={s.sheetSecWrap}>
            <Text style={s.sheetSec}>รายการนอก ปร.</Text>
          </View>
        );
      }
      const tr = line.tr;
      if (!line.isSub) number++;
      const name = line.isSub ? (tr as Sub).name.trim() : (tr as Row).name;
      const detail = line.isSub ? (line.parentName ? 'ย่อยของ ' + line.parentName : '') : (tr as Row).partsText;
      const unit = line.isSub ? (tr as Sub).unit.trim() : (tr as Row).unit;
      rowsOut.push(
        <View key={'l' + idx} style={[s.sheetRow, line.isSub && { backgroundColor: '#FAFBFE' }]}>
          <Text style={s.sheetNo}>{line.isSub ? '' : number}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.sheetName}>
              {line.isSub ? '↳ ' : ''}
              {name}
            </Text>
            {!!detail && <Text style={s.sheetDetail}>{detail}</Text>}
            {!!tr.note.trim() && <Text style={s.sheetMemo}>{tr.note.trim()}</Text>}
            {!line.isSub && <BillList b={b} row={tr as Row} round={round} />}
          </View>
          <Text style={s.sheetQty}>
            {fmt(line.left)}
            {unit ? ' ' + unit : ''}
          </Text>
        </View>
      );
    });
    return (
      <SheetModal
        visible
        onClose={() => setSheetRound(0)}
        title={'ใบเช็คของ รอบ ' + round + (card.do ? ' · ใบส่ง ' + card.do : '')}
        sub={[b.project.customer, 'หน้างาน ' + b.project.site + (b.project.company ? ' · ' + b.project.company.name : ''), meta].filter(Boolean).join('\n')}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        footer={
          <View style={s.sheetActions}>
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => setSheetRound(0)}>
              <Text style={[s.btnText, { color: C.text }]}>ปิด</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnPrimary, !lines.length && { opacity: 0.5 }]} disabled={!lines.length} onPress={() => printSheet(round)}>
              <Ionicons name="print" size={16} color="#fff" />
              <Text style={[s.btnText, { color: '#fff' }]}>พิมพ์ / แชร์</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
          <View style={s.basis}>
            <Ionicons name="information-circle-outline" size={15} color={C.muted} />
            <Text style={s.basisText}>{SHEET_BASIS}</Text>
          </View>
          <View style={s.sheetTableHead}>
            <Text style={[s.sheetTh, { width: 28 }]}>#</Text>
            <Text style={[s.sheetTh, { flex: 1 }]}>รายการ / หมายเหตุ</Text>
            <Text style={[s.sheetTh, { width: 84, textAlign: 'right' }]}>ค้าง</Text>
          </View>
          {lines.length ? rowsOut : <Text style={s.emptySmall}>ไม่มีของค้างแล้ว</Text>}
          {!!lines.length && <Text style={s.sheetSum}>{'รวม ' + number + ' รายการ' + (subCount ? ' · รายการย่อย ' + subCount + ' แถว' : '')}</Text>}
          {dirty && <Text style={s.sheetDirty}>มีตัวเลขที่ยังไม่บันทึก ใบเช็คนี้คิดจากตัวเลขที่เห็นในหน้าตอนนี้</Text>}
        </ScrollView>
      </SheetModal>
    );
  }

  function renderWho() {
    if (!who || !b) return null;
    const rows = who.rows || {};
    const shown = who.lines.filter((line) => rows[line.key] || line.pack[0] > 0 || line.pack[1] || line.load[0] > 0 || line.load[1]);
    const boxCell = (line: WhoLine, box: 'pack' | 'load') => {
      const info = (rows[line.key] || {})[box] || null;
      const [qty, done] = line[box];
      if (!info && qty <= 0 && !done) return <Text style={s.whoEmpty}>-</Text>;
      const pending: string[] = info && info.pending ? info.pending : [];
      const k = line.key + '|' + box;
      const h = hist[k];
      return (
        <View style={{ gap: 2 }}>
          <Text style={s.whoVal}>
            {qty > 0 ? fmt(qty) + line.unit : 'ว่าง'}
            {done ? <Text style={s.whoDone}> ครบ</Text> : null}
          </Text>
          <Text style={s.whoLine}>
            <Text style={s.whoK}>คนแรก </Text>
            {info && info.first ? historyWho(info.first[0], info.first[1]) : pending.length ? '-' : 'ไม่ทราบ'}
          </Text>
          {info && info.edits > 0 && info.last ? (
            <TouchableOpacity onPress={() => toggleHistory(line, box)}>
              <Text style={s.whoLine}>
                <Text style={s.whoK}>แก้ </Text>
                <Text style={s.whoEdits}>{historyWho(info.last[0], info.last[1]) + ' (' + info.edits + ' ครั้ง)'}</Text>
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.whoLine}>
              <Text style={s.whoK}>แก้ </Text>-
            </Text>
          )}
          {pending.length > 0 && (
            <Text style={[s.whoLine, { color: C.live }]}>
              <Text style={s.whoK}>รอบันทึก </Text>
              {pending.join(', ')}
            </Text>
          )}
          {h && h.open && <HistoryList state={h} unit={line.unit} />}
        </View>
      );
    };
    return (
      <SheetModal
        visible
        onClose={() => setWho(null)}
        title="ผู้จัดของ"
        sub={who.loading ? 'รอบ ' + who.round : 'รอบ ' + who.round + ' · ' + shown.length + ' รายการ'}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
      >
        <View style={s.whoTabs}>
          {ROUNDS.filter((round) => round === roundView.shown).map((round) => (
            <TouchableOpacity key={round} style={[s.whoTab, who.round === round && { backgroundColor: roundColor(round).c, borderColor: roundColor(round).c }]} onPress={() => loadWho(round)}>
              <Text style={[s.whoTabText, { color: who.round === round ? '#fff' : roundColor(round).c }]}>รอบ {round}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {bar?.show && <Text style={s.sheetDirty}>มีค่าที่ยังไม่บันทึก ตารางนี้แสดงเฉพาะที่บันทึกแล้ว</Text>}
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          {who.loading ? (
            <View style={{ alignItems: 'center', paddingTop: 24, gap: 8 }}>
              <ActivityIndicator color={C.primary} />
              <Text style={s.emptySmall}>กำลังโหลด...</Text>
            </View>
          ) : who.error ? (
            <Text style={[s.emptySmall, { color: C.bad }]}>{who.error}</Text>
          ) : !shown.length ? (
            <Text style={s.emptySmall}>รอบนี้ยังไม่มีใครบันทึก</Text>
          ) : (
            shown.map((line, i) => (
              <View key={line.key} style={[s.whoRow, line.sub && { backgroundColor: '#FAFBFE' }]}>
                <Text style={s.whoName}>
                  <Text style={s.whoNo}>{i + 1}. </Text>
                  {line.sub ? '↳ ' : ''}
                  {line.name}
                </Text>
                <View style={s.whoBoxes}>
                  <View style={s.whoBox}>
                    <Text style={s.whoBoxHead}>จัดของ</Text>
                    {boxCell(line, 'pack')}
                  </View>
                  <View style={s.whoBox}>
                    <Text style={s.whoBoxHead}>ขึ้นรถ</Text>
                    {boxCell(line, 'load')}
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SheetModal>
    );
  }

  function renderPhoto() {
    if (!photo || !b) return null;
    const { tr, round } = photo;
    const locked = b.roundFrozen(round);
    const edit = b.photoEditOf(tr, round);
    const total = b.photoTotal(tr, round);
    const busy = b.photoBusy;
    const full = locked || busy || total >= b.photoMax;
    const left = b.photoMax - total;
    const msg = locked
      ? b.frozenText(round) + ' ดูรูปได้อย่างเดียว'
      : busy
        ? 'กำลังบันทึกรูป...'
        : photo.note ||
          (b.photoWaitsSub(tr)
            ? 'รูปจะบันทึกพร้อมรายการย่อยนี้ตอนกดบันทึก'
            : b.photoPending(tr, round)
            ? 'ยังไม่ได้บันทึกรูป จะส่งตอนกดบันทึก'
            : total >= b.photoMax
              ? 'บันทึกแล้ว ครบ ' + b.photoMax + ' รูป'
              : total
                ? 'บันทึกแล้ว · ถ่ายต่อได้อีก ' + left + ' รูป'
                : 'ถ่ายรูปแล้วบันทึกทันที');
    const imgUrl = (path: string) => (path.startsWith('file:') || path.startsWith('content:') || path.startsWith('http') ? path : API_BASE + '/' + path);
    return (
      <SheetModal
        visible
        onClose={() => setPhoto(null)}
        title={'รูปจัดของ รอบ ' + round}
        sub={trName(tr) + ' · ' + total + '/' + b.photoMax + ' รูป'}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        footer={
          <View style={s.sheetActions}>
            <TouchableOpacity style={[s.btn, s.btnOutline, full && { opacity: 0.45 }]} disabled={full} onPress={() => addPhotos(b, tr, round, true)}>
              <Ionicons name="camera" size={16} color={C.primary} />
              <Text style={[s.btnText, { color: C.primary }]}>{total ? 'ถ่ายต่อ' : 'ถ่ายรูป'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnOutline, full && { opacity: 0.45 }]} disabled={full} onPress={() => addPhotos(b, tr, round, false)}>
              <Ionicons name="image" size={16} color={C.primary} />
              <Text style={[s.btnText, { color: C.primary }]}>เลือกรูป</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => setPhoto(null)}>
              <Text style={[s.btnText, { color: '#fff' }]}>เสร็จ</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <ScrollView contentContainerStyle={s.photoGrid}>
          {b.savedPhotos(tr, round).map((ph) => {
            const del = edit.dels.includes(ph.id);
            return (
              <View key={ph.id} style={[s.photoTile, del && { opacity: 0.45 }]}>
                <Pressable onPress={() => setViewer(imgUrl(ph.src))}>
                  <Image source={{ uri: imgUrl(ph.thumb || ph.src) }} style={s.photoImg} />
                </Pressable>
                {!locked && !busy && (
                  <TouchableOpacity style={s.photoX} onPress={() => deletePhoto(b, tr, round, ph)} accessibilityLabel={del ? 'ไม่ลบรูปนี้' : 'ลบรูปนี้'}>
                    <Ionicons name={del ? 'arrow-undo' : 'close'} size={14} color="#fff" />
                  </TouchableOpacity>
                )}
                <Text style={s.photoCap} numberOfLines={2}>
                  {del ? 'จะลบตอนบันทึก' : [ph.by, ph.at ? thaiDateTime(ph.at) : ''].filter(Boolean).join(' · ')}
                </Text>
              </View>
            );
          })}
          {edit.adds.map((add) => (
            <View key={add.key} style={s.photoTile}>
              <Pressable onPress={() => setViewer(add.uri)}>
                <Image source={{ uri: add.uri }} style={s.photoImg} />
              </Pressable>
              {!busy && (
                <TouchableOpacity
                  style={s.photoX}
                  onPress={() => {
                    const next = b.photoEditOf(tr, round);
                    b.setPhotoEdit(tr, round, { adds: next.adds.filter((a) => a !== add), dels: next.dels.slice() });
                  }}
                  accessibilityLabel="เอารูปนี้ออก"
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              )}
              <Text style={[s.photoCap, { color: C.warn }]}>ยังไม่บันทึก</Text>
            </View>
          ))}
          {!locked &&
            Array.from({ length: Math.max(0, b.photoMax - total) }).map((_, i) => (
              <TouchableOpacity key={'slot' + i} style={[s.photoTile, s.photoSlot]} disabled={full} onPress={() => addPhotos(b, tr, round, false)}>
                <Ionicons name="add" size={24} color={C.muted} />
                <Text style={s.photoCap}>เพิ่มรูป</Text>
              </TouchableOpacity>
            ))}
        </ScrollView>
        <Text style={[s.photoMsg, !!photo.note && !locked && !busy && { color: C.warn }]}>{msg}</Text>
        <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer('')}>
          <Pressable style={s.viewer} onPress={() => setViewer('')}>
            {!!viewer && <Image source={{ uri: viewer }} style={s.viewerImg} resizeMode="contain" />}
            <Text style={s.viewerClose}>แตะเพื่อปิดรูป</Text>
          </Pressable>
        </Modal>
      </SheetModal>
    );
  }

  function renderPicker() {
    if (!pick) return null;
    const terms = pick.q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let rows = pick.list.filter((p: any) => (pick.cancel || !p.cancel || p.id === projectId) && (!pick.co || p.co === pick.co));
    if (terms.length) {
      rows = rows.filter((p: any) => {
        const hay = `${p.code} ${p.id} ${p.cus} ${p.name} ${p.co}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
      if (/^\d+$/.test(terms[0])) {
        const rank = (p: any) => (String(p.code) === terms[0] ? 0 : String(p.code).startsWith(terms[0]) ? 1 : 2);
        rows = rows.slice().sort((a: any, z: any) => rank(a) - rank(z) || z.id - a.id);
      }
    }
    const cos = new Map<string, number>();
    pick.list.forEach((p: any) => {
      if (p.co) cos.set(p.co, (cos.get(p.co) || 0) + 1);
    });
    const coNames = Array.from(cos.keys()).sort((a, z) => (cos.get(z) || 0) - (cos.get(a) || 0));
    const canceled = pick.list.filter((p: any) => p.cancel).length;
    return (
      <SheetModal visible onClose={() => setPick(null)} title="เลือกหน้างาน" insetsTop={insets.top} insetsBottom={insets.bottom}>
        <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 6 }}>
          <View style={s.searchBox}>
            <Ionicons name="search" size={16} color={C.muted} />
            <TextInput value={pick.q} onChangeText={(q) => setPick((p) => (p ? { ...p, q } : p))} placeholder="พิมพ์เลขหน้างาน, หน่วยงาน หรือชื่อโครงการ..." placeholderTextColor={C.muted} style={s.searchInput} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {[''].concat(coNames).map((co) => (
              <TouchableOpacity key={co || 'all'} style={[s.pickChip, pick.co === co && s.pickChipOn]} onPress={() => setPick((p) => (p ? { ...p, co } : p))}>
                <Text style={[s.pickChipText, pick.co === co && { color: '#fff' }]}>
                  {co || 'ทั้งหมด'} {co ? cos.get(co) : pick.list.length}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {canceled > 0 && (
            <TouchableOpacity style={s.pickCancel} onPress={() => setPick((p) => (p ? { ...p, cancel: !p.cancel } : p))}>
              <Ionicons name={pick.cancel ? 'checkbox' : 'square-outline'} size={17} color={C.primary} />
              <Text style={s.pickCancelText}>แสดงงานที่ยกเลิก ({canceled})</Text>
            </TouchableOpacity>
          )}
        </View>
        {pick.loading ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} />
        ) : pick.error ? (
          <Text style={[s.emptySmall, { color: C.bad }]}>{pick.error}</Text>
        ) : (
          <FlatList
            data={rows.slice(0, 300)}
            keyExtractor={(p: any) => String(p.id)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={s.emptySmall}>ไม่พบหน้างานที่ตรงกับ "{pick.q}"</Text>}
            ListFooterComponent={<Text style={s.pickFoot}>แสดง {Math.min(rows.length, 300)} จาก {rows.length} หน้างาน (ทั้งหมด {pick.list.length})</Text>}
            renderItem={({ item: p }: { item: any }) => {
              const cur = p.id === projectId;
              return (
                <TouchableOpacity
                  style={[s.pickRow, cur && { backgroundColor: C.primarySoft }, p.cancel && { opacity: 0.6 }]}
                  onPress={() => {
                    setPick(null);
                    if (!cur) requestProject(p.id);
                  }}
                >
                  <View style={[s.pickCode, cur && { backgroundColor: C.primary }]}>
                    <Text style={[s.pickCodeText, cur && { color: '#fff' }]}>{p.code}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={s.pickCus} numberOfLines={1}>
                      {p.cus || 'ไม่ระบุหน่วยงาน'}
                    </Text>
                    <Text style={s.pickName} numberOfLines={2}>
                      {p.co ? '[' + p.co + '] ' : ''}
                      {p.name}
                    </Text>
                    {cur && <Text style={s.pickCur}>เปิดอยู่</Text>}
                  </View>
                  <Text style={[s.pickStatus, p.cancel && { color: C.bad }]} numberOfLines={2}>
                    {p.st}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SheetModal>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['left', 'right']}>
      <LinearGradient colors={BG_GRAD} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View ref={listBoxRef} collapsable={false} style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        data={hasItems ? view!.items : []}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        extraData={b.ctx}
        ListHeaderComponent={renderHeader()}
        ListEmptyComponent={
          hasItems && view!.emptyText ? (
            <View style={s.emptyList}>
              <Ionicons name={tab === 'todo' && !search ? 'checkmark-done-circle-outline' : 'search-outline'} size={34} color={C.faint} />
              <Text style={s.emptyListText}>{view!.emptyText}</Text>
            </View>
          ) : undefined
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: (bar?.show && !kbOpen ? 170 : 40) + insets.bottom + kbPad }}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        initialNumToRender={12}
        windowSize={9}
      />
      </View>

      {/* ซ่อนตอนคีย์บอร์ดขึ้น (ไม่ให้ทับช่องที่กำลังพิมพ์) · ปิดคีย์บอร์ดแล้วกลับมา */}
      {bar?.show && !kbOpen && (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOut.duration(160)}
          style={[s.saveBar, { bottom: 10 + insets.bottom }, bar.problems.length > 0 && s.saveBarBad]}
        >
          <View style={s.saveMsgRow}>
            <Ionicons name={bar.problems.length ? 'alert-circle' : 'create'} size={17} color={bar.problems.length ? C.bad : C.warn} />
            <Text style={[s.saveMsg, bar.problems.length > 0 && { color: C.bad }]}>{bar.message}</Text>
          </View>
          {!!bar.syncNote && <Text style={s.syncNote}>{bar.syncNote}</Text>}
          <View style={s.saveActions}>
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={askDiscard} disabled={b.saving}>
              <Text style={[s.btnText, { color: C.text }]}>ยกเลิกการแก้ไข</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnPrimary, !bar.canSave && { opacity: 0.5 }]} onPress={openConfirm} disabled={!bar.canSave}>
              <Ionicons name="save" size={16} color="#fff" />
              <Text style={[s.btnText, { color: '#fff' }]}>บันทึก</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {!!toast && (
        <Animated.View key={toast.id} entering={FadeInDown.duration(200)} exiting={FadeOut.duration(160)} style={[s.toast, { bottom: kbOpen ? kbPad + 12 : (bar?.show ? 170 : 24) + insets.bottom }]} pointerEvents="none">
          <Text style={s.toastText}>{toast.text}</Text>
        </Animated.View>
      )}

      {renderConfirm()}
      {/* หมายเหตุจัดงาน: แก้ได้ตามกติกาเดียวกับวันที่ขึ้นของ (ล็อกคนขับ/จบรอบ/ไม่มีสิทธิ์รอบเก่า = ดูอย่างเดียว) */}
      <JobNoteModal
        round={jobNoteRound}
        value={jobNoteRound ? b.rounds[jobNoteRound].head.job_note : ''}
        readOnly={!!jobNoteRound && (b.roundFrozen(jobNoteRound) || (!b.canEditRound && jobNoteRound !== roundView.current))}
        lockText={jobNoteRound && b.roundFrozen(jobNoteRound) ? b.frozenText(jobNoteRound) : 'ไม่มีสิทธิ์แก้ไขรอบนี้'}
        onSave={(text) => {
          b.setJobNote(jobNoteRound, text);
          setJobNoteRound(0);
        }}
        onClose={() => setJobNoteRound(0)}
      />
      {renderLeave()}
      {renderHead()}
      {renderSheet()}
      {renderWho()}
      {renderPhoto()}
      {renderPicker()}
      <ChoiceModal
        visible={sortOpen}
        title="เรียงลำดับ"
        options={[
          { value: 'name', label: 'เรียงตามชื่อ ก-ฮ' },
          { value: 'order', label: 'เรียงตามลำดับใน ปร.' },
        ]}
        value={sortMode}
        onPick={(v) => {
          setSortMode(v === 'order' ? 'order' : 'name');
          setSortOpen(false);
        }}
        onClose={() => setSortOpen(false)}
      />
    </SafeAreaView>
  );
}

function ChangeList({ lines }: { lines: ChangeLine[] }) {
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}>
      {lines.map((line, i) => (
        <View key={i} style={s.changeItem}>
          <Text style={s.changeName}>{line.name}</Text>
          {!!line.where && <Text style={s.changeWhere}>{line.where}</Text>}
          <Text style={s.changeText}>{line.text}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function HistoryList({ state, unit }: { state: { loading: boolean; error: string; data: any }; unit: string }) {
  if (state.loading) return <Text style={s.histNote}>กำลังโหลด...</Text>;
  if (state.error) return <Text style={[s.histNote, { color: C.bad }]}>{state.error}</Text>;
  const data = state.data || {};
  const items: ReactNode[] = (data.list || []).map((entry: any, i: number) => (
    <View key={i} style={s.histItem}>
      <Text style={s.histWhat}>
        {Math.abs(num(entry.from) - num(entry.to)) >= 0.005 ? historyChange(num(entry.from), num(entry.to), unit) : ''}
        {entry.tick ? <Text style={{ color: entry.tick === 'on' ? C.ok : C.bad, fontWeight: '800' }}>{(Math.abs(num(entry.from) - num(entry.to)) >= 0.005 ? ' · ' : '') + (entry.tick === 'on' ? 'ติ๊กครบ' : 'เอาติ๊กครบออก')}</Text> : null}
      </Text>
      <Text style={s.histWho}>{historyWho(str(entry.by), str(entry.at))}</Text>
    </View>
  ));
  if (data.more) items.push(<Text key="more" style={s.histNote}>{'แสดง ' + (data.list || []).length + ' ครั้งล่าสุด'}</Text>);
  if (data.before) {
    const before = data.before;
    items.push(
      <View key="before" style={[s.histItem, { opacity: 0.8 }]}>
        <Text style={s.histWhat}>
          {'ค่าเดิม ' + (num(before.qty) > 0 ? fmt(before.qty) + unit : 'ว่าง')}
          {before.done ? <Text style={{ color: C.ok, fontWeight: '800' }}> · ติ๊กครบ</Text> : null}
        </Text>
        <Text style={s.histWho}>{historyWho(str(before.by), str(before.at)) || 'กรอกก่อนเริ่มเก็บประวัติ'}</Text>
      </View>
    );
  }
  if (!items.length) items.push(<Text key="none" style={s.histNote}>ไม่มีรายละเอียด</Text>);
  return <View style={s.histList}>{items}</View>;
}

/** ผู้จัดงาน: ค้นรายชื่อพนักงาน · ชื่อนอกรายชื่อเลือก "ใช้ชื่อที่พิมพ์" ได้ */
function OrganizerModal({ visible, staff, value, onPick, onClose }: { visible: boolean; staff: string[]; value: string; onPick: (v: string) => void; onClose: () => void }) {
  const [q, setQ] = useState(value);
  useEffect(() => {
    if (visible) setQ(value);
  }, [visible, value]);
  const query = q.trim();
  const key = query.toLowerCase().replace(/\s+/g, '');
  const matches = staff.filter((name) => !key || name.toLowerCase().replace(/\s+/g, '').includes(key));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.pickerOverlay}>
        <View style={s.picker}>
          <View style={s.pickerHead}>
            <Text style={s.pickerTitle}>ผู้จัดงาน</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={s.closeBtnSm}>
              <Ionicons name="close" size={18} color={C.soft} />
            </TouchableOpacity>
          </View>
          <View style={s.pickerSearch}>
            <Ionicons name="person" size={15} color={C.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder="พิมพ์ค้นหาชื่อ" placeholderTextColor={C.muted} style={s.pickerSearchInput} maxLength={255} autoFocus />
          </View>
          <Text style={s.comboHead}>{key ? (matches.length ? 'พบ ' + matches.length + ' คน' : 'ไม่พบในรายชื่อพนักงาน') : 'รายชื่อพนักงาน ' + staff.length + ' คน'}</Text>
          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            {matches.slice(0, 200).map((name) => (
              <TouchableOpacity key={name} style={[s.pickerOption, name === value && s.pickerOptionOn]} onPress={() => onPick(name)}>
                <Avatar name={name} size={28} />
                <Text style={[s.pickerOptionText, name === value && { color: C.primary, fontWeight: '800' }]}>{name}</Text>
                {name === value && <Ionicons name="checkmark-circle" size={18} color={C.primary} />}
              </TouchableOpacity>
            ))}
            {!!query && !staff.includes(query) && (
              <TouchableOpacity style={s.pickerOption} onPress={() => onPick(query)}>
                <View style={[s.avatar, { width: 28, height: 28, borderRadius: 14, backgroundColor: C.track }]}>
                  <Ionicons name="pencil" size={13} color={C.soft} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.pickerOptionText}>ใช้ชื่อ “{query}”</Text>
                  <Text style={s.fieldHint}>ไม่อยู่ในรายชื่อพนักงาน</Text>
                </View>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ใบเช็คของเป็น HTML (แชร์ไปเปิดพิมพ์) — รายการเดียวกับป๊อปอัปใบเช็คของ
function sheetHtml(b: Board, round: number) {
  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  const card = b.rounds[round];
  const head = card.head;
  const meta = [head.load_at ? 'วันที่ขึ้นของ ' + thaiDateTime(head.load_at) : '', head.deliver_at ? 'วันที่ส่ง ' + thaiDateTime(head.deliver_at) : '', head.driver ? headSummary(head) : '', head.organizer ? 'ผู้จัดงาน ' + head.organizer : '', head.job_note ? 'หมายเหตุจัดงาน: ' + head.job_note : ''].filter(Boolean).join(' · ');
  let number = 0;
  let section = 'goods';
  const rows = b
    .checkLines()
    .map((line) => {
      let out = '';
      if (line.sec !== section) {
        section = line.sec;
        out += '<tr class="sec"><td colspan="6">รายการนอก ปร.</td></tr>';
      }
      const tr = line.tr;
      if (!line.isSub) number++;
      const name = line.isSub ? (tr as Sub).name.trim() : (tr as Row).name;
      const detail = line.isSub ? (line.parentName ? 'ย่อยของ ' + line.parentName : '') : (tr as Row).partsText;
      const unit = line.isSub ? (tr as Sub).unit.trim() : (tr as Row).unit;
      const bills = line.isSub ? [] : b.sheetBills(tr as Row, round);
      const back = line.isSub ? [] : (tr as Row).back;
      const u = unit && unit !== '-' ? ' ' + unit : '';
      const memo =
        (tr.note.trim() ? '<div>' + esc(tr.note.trim()) + '</div>' : '') +
        back.map(([from, label, qty]) => '<div><b>' + esc(label + ' ' + fmt(qty) + u) + '</b> จากรอบ ' + from + '</div>').join('') +
        bills.map((bill) => '<div><b>' + esc(bill.no) + '</b> <strong>' + esc(bill.when) + '</strong>' + esc([bill.cond, bill.qty].filter(Boolean).map((p) => ' · ' + p).join('')) + '</div>').join('');
      out +=
        '<tr' + (line.isSub ? ' class="sub"' : '') + '><td class="n">' + (line.isSub ? '' : number) + '</td><td>' + (line.isSub ? '↳ ' : '') + esc(name) +
        (detail ? '<small>' + esc(detail) + '</small>' : '') + '</td><td class="q">' + fmt(line.left) + esc(unit ? ' ' + unit : '') + '</td><td></td><td class="b"><span></span></td><td class="m">' + memo + '</td></tr>';
      return out;
    })
    .join('');
  return (
    '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ใบเช็คของ รอบ ' + round + '</title>' +
    '<style>body{font-family:Tahoma,sans-serif;margin:16px;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:2px 0;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}th,td{border:1px solid #999;padding:4px;vertical-align:top}th{background:#eee}td small{display:block;color:#555}.n{width:28px;text-align:center}.q{width:80px;text-align:right;white-space:nowrap}.b{width:30px;text-align:center}.b span{display:inline-block;width:14px;height:14px;border:1px solid #333}.m{width:35%}.sec td{background:#fdf1d8;font-weight:bold}.sub td{background:#fafafa}</style></head><body>' +
    '<h1>ใบเช็คของ รอบ ' + round + (card.do ? ' · ใบส่ง ' + esc(card.do) : '') + '</h1>' +
    '<p>' + esc(SHEET_BASIS) + '</p><p>' + esc(b.project.customer) + '</p><p>หน้างาน ' + esc(b.project.site) + (b.project.company ? ' · ' + esc(b.project.company.name) : '') + '</p>' + (meta ? '<p>' + esc(meta) + '</p>' : '') +
    '<table><thead><tr><th>#</th><th>รายการ</th><th>ค้าง</th><th>จำนวนที่ส่ง<br>ในรอบนี้</th><th>ครบ</th><th>หมายเหตุ</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p>รวม ' + number + ' รายการ</p><script>setTimeout(function(){window.print&&window.print()},400)</script></body></html>'
  );
}

// -------------------- Styles --------------------

const TABULAR = { fontVariant: ['tabular-nums' as const] };
const CARD_SHADOW = '0 1px 2px rgba(30,45,90,0.04), 0 8px 22px rgba(30,45,90,0.07)';

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10, backgroundColor: C.bg },
  centerIcon: { width: 76, height: 76, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  centerTitle: { fontSize: 16.5, fontWeight: '800', color: C.text, textAlign: 'center' },
  centerHint: { fontSize: 13, color: C.muted, fontWeight: '600' },
  errorText: { color: C.soft, fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 6, boxShadow: '0 8px 18px rgba(36,89,234,0.28)' },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // หัวหน้า
  hero: { marginHorizontal: 12, marginBottom: 12, backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: '#EDF0F7', padding: 16, gap: 8, boxShadow: CARD_SHADOW },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  backChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 50, backgroundColor: C.primarySoft, paddingLeft: 9, paddingRight: 12, paddingVertical: 6 },
  backChipText: { color: C.primary, fontSize: 12.5, fontWeight: '800' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 50, backgroundColor: '#E9FBF3', paddingHorizontal: 10, paddingVertical: 5 },
  livePillOff: { backgroundColor: C.track },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  livePillText: { fontSize: 11, fontWeight: '800', color: C.ok },
  heroProject: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  codeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.primarySoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  codeKicker: { color: C.muted, fontSize: 11.5, fontWeight: '700' },
  codeText: { color: C.primary, fontSize: 14, fontWeight: '900', letterSpacing: 0.2, ...TABULAR },
  company: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '100%' },
  companyText: { fontSize: 11.5, fontWeight: '900', letterSpacing: 0.3 },
  heroName: { fontSize: 17, color: C.text, fontWeight: '800', lineHeight: 24 },
  heroCustomer: { fontSize: 13, color: C.soft, lineHeight: 19, marginTop: -4 },

  progress: { backgroundColor: C.surface2, borderRadius: 18, borderWidth: 1, borderColor: C.lineSoft, padding: 12, gap: 9, marginTop: 4 },
  progressTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  progressLabel: { fontSize: 13, fontWeight: '800', color: C.soft },
  progressPct: { fontSize: 24, fontWeight: '900', color: C.primary, ...TABULAR },
  progressPctUnit: { fontSize: 14, fontWeight: '800' },
  sumBar: { height: 10, borderRadius: 5, backgroundColor: '#E3E8F1', flexDirection: 'row', overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11.5, color: C.soft, fontWeight: '600' },
  statRow: { flexDirection: 'row', gap: 8 },
  statTile: { flex: 1, alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.lineSoft },
  statTileNum: { fontSize: 18, fontWeight: '900', color: C.text, ...TABULAR },
  statTileLabel: { fontSize: 11.5, color: C.muted, fontWeight: '700', marginTop: 1 },

  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: 12, marginTop: 4 },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  stackItem: { borderRadius: 16, borderWidth: 2, borderColor: '#fff' },
  stackMore: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  stackMoreText: { fontSize: 11, fontWeight: '800', color: C.soft },
  presenceTitle: { fontSize: 12.5, color: C.text, fontWeight: '800' },
  presenceNames: { fontSize: 11.5, color: C.muted, marginTop: 1 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 50, borderWidth: 1, borderColor: C.primaryLine, paddingHorizontal: 11, paddingVertical: 7 },
  shareText: { fontSize: 12, color: C.primary, fontWeight: '800' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800' },

  notice: { flexDirection: 'row', gap: 10, marginHorizontal: 12, marginBottom: 12, backgroundColor: C.warnBg, borderRadius: 16, borderWidth: 1, borderColor: '#FBE3BC', padding: 12 },
  noticeIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  noticeTitle: { fontSize: 13, fontWeight: '800', color: C.warn },
  // รับของคืนจากหน้างาน
  returnPanel: { marginHorizontal: 12, marginBottom: 12, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#F8C9D3', borderLeftWidth: 4, borderLeftColor: C.bad, padding: 12, gap: 8 },
  returnHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  returnTitle: { fontSize: 14, fontWeight: '800', color: C.bad },
  returnSum: { marginLeft: 'auto', fontSize: 12, fontWeight: '700' },
  returnStatus: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999 },
  returnStatusText: { fontSize: 11.5, fontWeight: '800' },
  returnTarget: { fontSize: 12, color: C.soft },
  returnItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10 },
  returnLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  returnName: { fontSize: 13, fontWeight: '700', color: C.text },
  returnQty: { fontSize: 13, fontWeight: '800', color: C.bad },
  returnMeta: { fontSize: 11.5, color: C.soft },
  returnBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: C.bad, backgroundColor: '#fff' },
  returnBtnText: { fontSize: 12, fontWeight: '800', color: C.bad },
  returnCancel: { fontSize: 12.5, fontWeight: '700', color: C.primary, textDecorationLine: 'underline' },
  noticeText: { fontSize: 12, color: '#7C4A12', lineHeight: 18 },
  emptyPage: { alignItems: 'center', gap: 6, padding: 30 },
  emptyPageText: { color: C.soft, fontSize: 14, fontWeight: '700' },

  // กล่องหลัก
  panel: { marginHorizontal: 12, marginBottom: 12, backgroundColor: '#fff', borderRadius: 22, borderWidth: 1, borderColor: '#EDF0F7', padding: 14, gap: 10, boxShadow: CARD_SHADOW },
  panelLocked: { backgroundColor: '#FBFCFE' },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  panelIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  panelRight: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '700', color: C.muted },

  jobRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  jobBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 10, backgroundColor: '#fff' },
  jobChanged: { borderStyle: 'dashed', borderColor: C.warn, borderWidth: 1.5 },
  jobEdit: { alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 16, backgroundColor: C.primarySoft, paddingHorizontal: 12 },
  jobEditText: { fontSize: 11.5, fontWeight: '800', color: C.primary },
  // ยืนยันจบรอบ: ปุ่มเขียวเต็มกว้างใต้ช่องวันที่ขึ้นของ
  jobFinish: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 42, borderRadius: 12, backgroundColor: C.ok },
  jobFinishText: { fontSize: 13.5, fontWeight: '800', color: '#fff' },
  jobView: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, backgroundColor: C.warnBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  jobViewText: { fontSize: 12.5, fontWeight: '800', color: C.warn },
  jobViewBack: { fontSize: 12.5, fontWeight: '900', color: C.primary, textDecorationLine: 'underline' },
  jobState: { fontSize: 13.5, fontWeight: '800', color: C.text },
  jobMeta: { fontSize: 11.5, color: C.muted, lineHeight: 16 },
  // ช่องวันที่ขึ้นของใต้ปุ่มรอบ (กล่องสถานะจัดงาน)
  jobLoadField: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.infoBg },
  jobLoadChanged: { borderColor: C.warn, backgroundColor: C.warnBg },
  jobLoadText: { fontSize: 12.5, fontWeight: '800', color: C.info },
  jobNoteField: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.warnBg },
  jobNoteLabel: { fontSize: 12.5, fontWeight: '800', color: C.warn },
  jobNoteInput: { flex: 1, minHeight: 32, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', color: C.text, fontSize: 13.5, overflow: 'hidden' },
  jobNoteSub: { fontSize: 12.5, color: C.soft, marginBottom: 10 },
  jobNoteArea: { minHeight: 140, maxHeight: 260, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2, color: C.text, fontSize: 15, lineHeight: 22 },
  jobNoteCount: { alignSelf: 'flex-end', marginTop: 4, fontSize: 11.5, color: C.muted },
  jobNoteFull: { fontSize: 15, lineHeight: 24, color: C.text, padding: 12, borderRadius: 12, backgroundColor: C.surface2 },
  jobProg: { gap: 6, marginTop: 7 },
  jobProgTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  jobProgPill: { borderRadius: 50, paddingHorizontal: 9, paddingVertical: 2 },
  jobProgLabel: { fontSize: 11.5, fontWeight: '800' },
  jobProgCount: { fontSize: 11.5, fontWeight: '700', color: C.soft, ...TABULAR },
  jobBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.85)', overflow: 'hidden' },
  jobProgLeft: { fontSize: 11, fontWeight: '700', color: C.soft },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText: { flex: 1, fontSize: 11.5, color: C.muted },

  rcTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rcTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  rcSub: { fontSize: 12, color: C.muted, marginTop: 1 },
  statePill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 9, paddingVertical: 3 },
  statePillText: { fontSize: 11, fontWeight: '800' },
  doBox: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  doNo: { fontSize: 13, fontWeight: '900', color: C.text, ...TABULAR },
  doState: { fontSize: 12.5, fontWeight: '700', color: C.muted },
  roundNote: { fontSize: 11.5, color: C.warn, lineHeight: 17 },
  infoBox: { gap: 7, paddingHorizontal: 2 },
  infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoText: { flex: 1, fontSize: 12.5, color: C.text, fontWeight: '600', lineHeight: 18 },
  actRow: { flexDirection: 'row', gap: 8 },
  actTile: { flex: 1, alignItems: 'center', gap: 6, borderRadius: 16, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.surface2, paddingVertical: 11, paddingHorizontal: 4 },
  actIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  actText: { fontSize: 12, fontWeight: '800', color: C.text },
  printedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  printed: { fontSize: 12, color: C.ok, fontWeight: '700' },

  // รายการของ: หัว + แท็บ + ค้นหา
  toolsHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 6, marginBottom: 8 },
  toolsTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: C.text },
  tools: { marginHorizontal: 12, gap: 10 },
  seg: { flexDirection: 'row', height: 44, padding: SEG_PAD, borderRadius: 15, backgroundColor: '#E8EDF5' },
  segPill: { position: 'absolute', top: SEG_PAD, bottom: SEG_PAD, left: SEG_PAD, borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(30,45,90,0.08), 0 4px 10px rgba(30,45,90,0.10)' },
  segItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segText: { fontSize: 13, fontWeight: '800', color: C.muted },
  segCount: { minWidth: 22, alignItems: 'center', borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 6, paddingVertical: 1 },
  segCountText: { fontSize: 11.5, fontWeight: '900', color: C.soft, ...TABULAR },
  searchBox: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 12 },
  searchInput: { flex: 1, minWidth: 0, color: C.text, fontSize: 14, padding: 0 },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 50, borderWidth: 1, borderColor: C.primaryLine, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  toolBtnOn: { backgroundColor: C.primary, borderColor: C.primary },
  toolBtnText: { fontSize: 12, fontWeight: '800', color: C.primary },
  searchSum: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: 12, marginTop: 10, backgroundColor: C.infoBg, borderRadius: 12, padding: 10 },
  searchSumText: { flex: 1, fontSize: 12, color: '#075C8F', fontWeight: '600', lineHeight: 18 },
  emptyList: { alignItems: 'center', gap: 8, padding: 36 },
  emptyListText: { textAlign: 'center', color: C.soft, fontSize: 13.5, fontWeight: '600' },
  emptySmall: { textAlign: 'center', color: C.muted, fontSize: 12.5, padding: 18 },

  secHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 18, marginBottom: 2, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: C.lineSoft, padding: 12 },
  secIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  secTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  secText: { fontSize: 11.5, color: C.muted, lineHeight: 17 },
  secToggle: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 50, backgroundColor: C.primarySoft, paddingHorizontal: 11, paddingVertical: 6 },
  secToggleText: { fontSize: 12, fontWeight: '800', color: C.primary },

  // การ์ดรายการ
  card: { marginHorizontal: 12, marginTop: 12, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#EDF0F7', padding: 14, gap: 11, boxShadow: CARD_SHADOW },
  cardDirty: { borderColor: '#F5B94A', borderWidth: 1.5, boxShadow: '0 0 0 3px rgba(245,158,11,0.10), 0 8px 22px rgba(30,45,90,0.07)' },
  doneStrip: { position: 'absolute', left: 0, top: 16, bottom: 16, width: 4, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemName: { flex: 1, fontSize: 15.5, fontWeight: '800', color: C.text, lineHeight: 22 },
  iconBtn: { width: 32, height: 32, borderRadius: 11, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  nameInput: { flex: 1, minWidth: 0, borderWidth: 1.5, borderColor: C.primaryLine, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14.5, color: C.text, backgroundColor: '#fff' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 9, paddingVertical: 3, maxWidth: '100%' },
  chipText: { fontSize: 11.5, fontWeight: '700', flexShrink: 1 },

  stats: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  statMain: { flex: 1, backgroundColor: C.surface2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center' },
  statLabel: { fontSize: 11, color: C.muted, fontWeight: '700' },
  statValue: { fontSize: 18, fontWeight: '900', color: C.text, ...TABULAR },
  statUnit: { fontSize: 12.5, fontWeight: '700', color: C.soft },
  statSub: { fontSize: 11, color: C.muted, ...TABULAR },
  p80: { alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, backgroundColor: '#fff' },
  p80On: { borderColor: C.primaryLine, backgroundColor: C.primarySoft },
  p80Changed: { borderColor: '#F5B94A', borderStyle: 'dashed' },
  p80Text: { fontSize: 12, fontWeight: '800', color: C.muted },
  leftBox: { minWidth: 82, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: C.warnBg, paddingHorizontal: 10, paddingVertical: 8 },
  leftOver: { backgroundColor: C.badBg },
  leftZero: { backgroundColor: C.okBg },
  leftLabel: { fontSize: 11, fontWeight: '800' },
  leftValue: { fontSize: 17, fontWeight: '900', ...TABULAR },

  // ช่องรอบ
  roundBox: { borderWidth: 1, borderRadius: 16, padding: 10, gap: 9 },
  roundBoxLocked: { backgroundColor: C.track, borderColor: C.line },
  roundBoxHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundPill: { borderRadius: 50, paddingHorizontal: 10, paddingVertical: 3 },
  roundPillText: { fontSize: 11.5, fontWeight: '800', color: '#fff' },
  roundBadge: { alignItems: 'center', justifyContent: 'center' },
  roundBadgeOff: { backgroundColor: C.track, borderWidth: 1, borderColor: C.line },
  roundBadgeSmall: { fontSize: 9.5, fontWeight: '700', lineHeight: 12, color: 'rgba(255,255,255,0.9)' },
  roundBadgeNo: { fontWeight: '900', color: '#fff', ...TABULAR },
  cellStatus: { flex: 1, fontSize: 12, color: C.soft, fontWeight: '600' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, borderRadius: 50, borderWidth: 1, borderColor: C.primaryLine, paddingHorizontal: 10, backgroundColor: '#fff' },
  photoBtnOn: { backgroundColor: C.primary, borderColor: C.primary },
  photoBtnPending: { borderColor: '#F5B94A', borderStyle: 'dashed' },
  photoBtnText: { fontSize: 11.5, fontWeight: '800', color: C.primary, ...TABULAR },
  boxPair: { flexDirection: 'row', gap: 8 },
  box: { flex: 1, backgroundColor: '#fff', borderRadius: 13, padding: 8, gap: 6 },
  boxFlash: { backgroundColor: C.liveBg },
  boxLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 16 },
  boxTag: { fontSize: 11.5, fontWeight: '800', color: C.soft },
  boxSpin: { transform: [{ scale: 0.7 }], height: 14 },
  boxField: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  qtyInput: { flex: 1, minWidth: 0, height: 42, borderWidth: 1.5, borderColor: C.line, borderRadius: 11, paddingHorizontal: 6, fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'center', backgroundColor: C.surface2 },
  inputChanged: { borderColor: '#F5B94A', backgroundColor: '#FFFBEB' },
  inputInvalid: { borderColor: C.bad, backgroundColor: C.badBg },
  inputLive: { borderColor: '#38BDF8', backgroundColor: C.liveBg },
  inputLocked: { backgroundColor: C.track, color: C.muted },
  tick: { width: 34, height: 34, borderRadius: 11, borderWidth: 1.5, borderColor: '#C3CBD8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  tickDisabled: { opacity: 0.35 },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveTagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.live },
  liveTagText: { flex: 1, fontSize: 11.5, color: C.live, fontWeight: '700' },
  remote: { borderWidth: 1, borderColor: '#F5B94A', backgroundColor: '#FFFBEB', borderRadius: 12, padding: 9, gap: 8 },
  remoteHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  remoteText: { flex: 1, fontSize: 12, color: C.warn, fontWeight: '800', lineHeight: 17 },
  remoteBtns: { flexDirection: 'row', gap: 8 },
  remoteTake: { flex: 1, alignItems: 'center', backgroundColor: C.warn, borderRadius: 10, paddingVertical: 8 },
  remoteTakeText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  remoteKeep: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: C.warn, borderRadius: 10, paddingVertical: 8, backgroundColor: '#fff' },
  remoteKeepText: { color: C.warn, fontSize: 12.5, fontWeight: '800' },

  // บิล / หมายเหตุ / รายการย่อย
  poBox: { gap: 6, backgroundColor: C.surface2, borderRadius: 14, padding: 10 },
  backLine: { fontSize: 12, color: C.bad },
  poLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  poNo: { fontSize: 12, fontWeight: '900', color: C.text, ...TABULAR },
  poCond: { fontSize: 11.5, fontWeight: '700' },
  poQty: { marginLeft: 'auto', fontSize: 11.5, color: C.soft, fontWeight: '600' },
  poMoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  poMore: { fontSize: 12, color: C.primary, fontWeight: '800' },
  noteInput: { borderWidth: 1, borderColor: C.lineSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13.5, color: C.text, backgroundColor: C.surface2, minHeight: 42 },
  billList: { gap: 4, backgroundColor: C.surface2, borderRadius: 12, padding: 9 },
  billBack: { fontSize: 11.5, color: C.bad },
  billLine: { fontSize: 11.5, color: C.text, lineHeight: 17 },
  addSub: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 2 },
  addSubText: { fontSize: 12.5, fontWeight: '800', color: C.primary },

  subWrap: { marginLeft: 30, marginRight: 12, marginTop: 8 },
  subConnector: { position: 'absolute', left: -16, top: -10, width: 14, height: 38, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: '#D5DCE8', borderBottomLeftRadius: 10 },
  subCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#EDF0F7', padding: 12, gap: 9, boxShadow: '0 1px 2px rgba(30,45,90,0.04), 0 4px 12px rgba(30,45,90,0.05)' },
  subDeleted: { opacity: 0.55, borderColor: C.bad },
  subHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subName: { flex: 1, minWidth: 0, height: 42, borderWidth: 1.5, borderColor: C.line, borderRadius: 11, paddingHorizontal: 10, fontSize: 14, color: C.text, backgroundColor: C.surface2 },
  subDel: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.badBg },
  subQtyRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  subQty: { flex: 1, minWidth: 0, height: 44, borderWidth: 1.5, borderColor: C.line, borderRadius: 11, paddingHorizontal: 8, fontSize: 14.5, fontWeight: '700', color: C.text, backgroundColor: C.surface2, textAlign: 'center' },
  subUnit: { width: 84, height: 44, borderWidth: 1.5, borderColor: C.line, borderRadius: 11, paddingHorizontal: 8, fontSize: 13.5, color: C.text, backgroundColor: C.surface2, textAlign: 'center' },

  // แถบบันทึก + แจ้งเตือน
  saveBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    backgroundColor: '#fff',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#F5B94A',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 9,
    boxShadow: '0 -2px 8px rgba(30,45,90,0.06), 0 14px 32px rgba(30,45,90,0.20)',
  },
  saveBarBad: { borderColor: C.bad },
  saveMsgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  saveMsg: { flex: 1, fontSize: 13, fontWeight: '700', color: C.warn, lineHeight: 19 },
  syncNote: { fontSize: 11.5, color: C.live, fontWeight: '700' },
  saveActions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 10 },
  btnPrimary: { backgroundColor: C.primary, borderColor: C.primary, boxShadow: '0 8px 18px rgba(36,89,234,0.28)' },
  btnOutline: { backgroundColor: '#fff', borderColor: C.primaryLine },
  btnGhost: { backgroundColor: C.track, borderColor: C.track },
  btnDanger: { backgroundColor: C.bad, borderColor: C.bad },
  btnText: { fontSize: 14, fontWeight: '800' },
  toast: { position: 'absolute', left: 20, right: 20, backgroundColor: 'rgba(10,18,34,0.92)', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, boxShadow: '0 10px 26px rgba(10,18,34,0.25)' },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 19, textAlign: 'center' },

  // ป๊อปอัปแบบแผ่นล่าง
  overlay: { flex: 1, backgroundColor: 'rgba(8,14,30,0.55)' },
  sheet: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  grip: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#D5DBE5', marginTop: 9 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  sheetSub: { fontSize: 12, color: C.soft, marginTop: 3, lineHeight: 18 },
  closeBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  closeBtnSm: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  sheetActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.lineSoft },
  changeItem: { backgroundColor: C.surface2, borderRadius: 14, padding: 11, gap: 2 },
  changeName: { fontSize: 13.5, fontWeight: '800', color: C.text },
  changeWhere: { fontSize: 11, color: C.muted },
  changeText: { fontSize: 12.5, color: C.soft, lineHeight: 18 },
  leaveText: { fontSize: 13, color: C.soft, textAlign: 'center', lineHeight: 19 },
  leaveError: { fontSize: 12.5, color: C.bad, fontWeight: '700', marginTop: 8 },

  form: { paddingHorizontal: 16, paddingBottom: 20, gap: 7 },
  formLabel: { fontSize: 12.5, fontWeight: '800', color: C.soft, marginTop: 8 },
  segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: '#E8EDF5' },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11, paddingVertical: 10 },
  segmentOn: { backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(30,45,90,0.08), 0 4px 10px rgba(30,45,90,0.10)' },
  segmentText: { fontSize: 13.5, fontWeight: '800', color: C.muted },
  selectBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: C.line, borderRadius: 13, paddingHorizontal: 12, backgroundColor: C.surface2 },
  selectText: { flex: 1, fontSize: 14, color: C.text },
  placeholder: { color: C.muted },
  textField: { minHeight: 46, borderWidth: 1.5, borderColor: C.line, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.text, backgroundColor: C.surface2 },
  fieldHint: { fontSize: 11, color: C.warn },

  basis: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: 16, marginBottom: 10, backgroundColor: C.surface2, borderRadius: 12, padding: 10 },
  basisText: { flex: 1, fontSize: 11, color: C.soft, lineHeight: 16 },
  sheetTableHead: { flexDirection: 'row', backgroundColor: C.surface2, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.lineSoft },
  sheetTh: { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 0.3 },
  sheetSecWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  sheetSec: { alignSelf: 'flex-start', fontSize: 11.5, fontWeight: '800', color: C.warn, backgroundColor: C.warnBg, borderRadius: 50, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3 },
  sheetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  sheetNo: { width: 22, fontSize: 12.5, color: C.faint, fontWeight: '700', ...TABULAR },
  sheetName: { fontSize: 13.5, color: C.text, fontWeight: '600', lineHeight: 19 },
  sheetDetail: { fontSize: 11, color: C.muted },
  sheetMemo: { fontSize: 11.5, color: C.soft, marginTop: 2 },
  sheetQty: { width: 84, textAlign: 'right', fontSize: 14, fontWeight: '900', color: C.primary, ...TABULAR },
  sheetSum: { fontSize: 12.5, fontWeight: '800', color: C.text, paddingHorizontal: 16, paddingTop: 12 },
  sheetDirty: { fontSize: 11.5, color: C.warn, paddingHorizontal: 16, paddingTop: 6 },

  whoTabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  whoTab: { borderWidth: 1, borderColor: C.line, borderRadius: 50, paddingHorizontal: 14, paddingVertical: 6 },
  whoTabText: { fontSize: 12.5, fontWeight: '800' },
  whoRow: { paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.lineSoft, gap: 8 },
  whoName: { fontSize: 13.5, fontWeight: '800', color: C.text },
  whoNo: { color: C.faint },
  whoBoxes: { flexDirection: 'row', gap: 8 },
  whoBox: { flex: 1, backgroundColor: C.surface2, borderRadius: 12, padding: 9, gap: 3 },
  whoBoxHead: { fontSize: 11, fontWeight: '800', color: C.muted },
  whoEmpty: { fontSize: 12.5, color: C.faint },
  whoVal: { fontSize: 14, fontWeight: '900', color: C.text },
  whoDone: { fontSize: 11, color: C.ok, fontWeight: '900' },
  whoLine: { fontSize: 11.5, color: C.soft },
  whoK: { color: C.muted, fontWeight: '700' },
  whoEdits: { color: C.primary, fontWeight: '800', textDecorationLine: 'underline' },
  histList: { gap: 4, marginTop: 4, borderLeftWidth: 2, borderLeftColor: C.primaryLine, paddingLeft: 7 },
  histItem: { gap: 1 },
  histWhat: { fontSize: 11.5, color: C.text, fontWeight: '700' },
  histWho: { fontSize: 10.5, color: C.muted },
  histNote: { fontSize: 11, color: C.muted, marginTop: 3 },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  photoTile: { width: '30.5%', gap: 4 },
  photoImg: { width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: C.track },
  photoX: { position: 'absolute', top: 5, right: 5, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(10,18,34,0.75)', alignItems: 'center', justifyContent: 'center' },
  photoCap: { fontSize: 10.5, color: C.muted },
  photoSlot: { aspectRatio: 1, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.faint, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 },
  photoMsg: { fontSize: 12, color: C.muted, paddingHorizontal: 16, paddingBottom: 6 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '85%' },
  viewerClose: { color: '#fff', fontSize: 13, marginTop: 10 },

  // ป๊อปอัปกลางจอ (เลือก / ผู้จัดงาน / ยังไม่บันทึก)
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(8,14,30,0.55)', justifyContent: 'center', padding: 18 },
  picker: { backgroundColor: '#fff', borderRadius: 24, padding: 16, maxHeight: '90%', boxShadow: '0 20px 50px rgba(8,14,30,0.25)' },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  pickerTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  pickerSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.line, borderRadius: 13, paddingHorizontal: 12, height: 44, marginBottom: 8 },
  pickerSearchInput: { flex: 1, fontSize: 14, color: C.text, padding: 0 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 13 },
  pickerOptionOn: { backgroundColor: C.primarySoft },
  pickerOptionText: { flex: 1, fontSize: 14, color: C.text, fontWeight: '600' },
  comboHead: { fontSize: 11.5, color: C.muted, marginBottom: 4, fontWeight: '600' },
  pickChip: { borderWidth: 1, borderColor: C.line, borderRadius: 50, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  pickChipOn: { backgroundColor: C.primary, borderColor: C.primary },
  pickChipText: { fontSize: 12, fontWeight: '800', color: C.soft },
  pickCancel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pickCancelText: { fontSize: 12.5, color: C.soft, fontWeight: '600' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  pickCode: { minWidth: 60, alignItems: 'center', borderRadius: 10, backgroundColor: C.primarySoft, paddingHorizontal: 8, paddingVertical: 6 },
  pickCodeText: { fontSize: 13.5, fontWeight: '900', color: C.primary, ...TABULAR },
  pickCur: { fontSize: 10.5, color: C.primary, fontWeight: '800' },
  pickCus: { fontSize: 13, fontWeight: '800', color: C.text },
  pickName: { fontSize: 11.5, color: C.muted, lineHeight: 16 },
  pickStatus: { width: 78, fontSize: 10.5, color: C.muted, textAlign: 'right' },
  pickFoot: { textAlign: 'center', fontSize: 11.5, color: C.muted, padding: 14 },
});
