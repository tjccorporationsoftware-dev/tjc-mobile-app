/**
 * site_job_board.tsx — แจ้งจัดงาน (พอร์ตจากหน้าเว็บ site_job_board.php ครบทุกปุ่ม)
 * ------------------------------------------------------------------
 * หน้างาน-รอบที่แจ้งจัดงานแล้ว (แจ้งที่หน้าเช็คของส่งบนเว็บ) รอทีมจัดของขึ้นรถ · บันทึกขึ้นรถแล้วหายจากรายการเอง
 *  - ข้อมูลจาก tjc-api-server/mobile_api/modules/site_job_board_API_mobile.php (ฟังก์ชันชุดเดียวกับหน้าเว็บ ผลตรงกัน)
 *    list = รายการ (init=1 ตอนเปิดหน้าครั้งแรก) · sheet = ใบงาน · accept / release = รับงาน / ยกเลิกรับงาน
 *  - สถานะ: ยังไม่รับงาน → รับงานแล้ว → กำลังจัด (ยังไม่กดบันทึก) → รอขึ้น (บันทึกจัดแล้ว) → กำลังขึ้นรถ
 *    แท็บกรอง (เปิดหน้ามาที่ "ยังไม่รับงาน" แบบเว็บ) + เลือกรอบ + ค้นหา + เรียง · ตัวเลขบนแท็บตามรอบ/คำค้นที่เลือก
 *  - ถามรายการใหม่ทุก 30 วินาทีตอนเปิดหน้านี้อยู่ (เน็ตหลุดถามห่างขึ้น) · ดึงลงเพื่อโหลดใหม่ · การ์ดที่เพิ่งแจ้งเข้ามามีป้าย "ใหม่"
 *  - ดูใบงาน = รายการที่ยังต้องจัดในรอบที่กด (ค้าง − ที่บันทึกจัดในรอบนั้นแล้ว คิดแบบ packLeft ใน js/site_job_board.js)
 *  - รับงาน = บันทึกชื่อคนรับ แล้วเปิดหน้าเช็คของส่งในแอป (site_item_check.tsx พร้อม project_id)
 *    มีคนรับแล้ว = ปุ่ม "เปิดงาน" (เปิดหน้าเช็คของส่งเฉย ๆ) · ยกเลิกรับงานได้เฉพาะคนที่รับไว้ (เซิร์ฟเวอร์เช็คซ้ำ)
 *  - สิทธิ์เมนู: site_job_board.php ชุดเดียวกับเว็บ (master_pages)
 *  - หน้าตา: แถบสถานะ 6 ช่องแบ่งเท่ากันพอดีความกว้างจอ (ไม่มีเลื่อนข้าง) · ตัวเลือกเป็นก้อนขาวลอยเลื่อนเรียบ ๆ
 *    เลือกรอบใช้สวิตช์แบบเดียวกัน · หลอดจัดแล้วเป็นไล่สีมีแสงวิ่ง · การ์ดจางเข้าทีละใบ/ขยับตำแหน่งตอนกรอง
 *    ใบงาน/เรียงลำดับเป็น bottom sheet · โหลดครั้งแรกเป็นโครงการ์ดมีแสงวิ่ง (react-native-reanimated)
 *    แอนิเมชันทั้งหมดเป็น ease-out ไม่มีสปริง/เด้ง/ยืดหด/เต้น · ธีมสว่างอย่างเดียวให้ตรงกับหน้าเช็คของส่ง
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Pressable,
  PressableProps,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  type SharedValue,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useScreenInsets } from '../../components/useScreenInsets';
import { API_MODULES } from '../../constants/config';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';
import { useAuth } from '../_layout';

const SJB_API_URL = `${API_MODULES}/site_job_board_API_mobile.php`;
const POLL_MS = 30000;
const POLL_MAX_MS = 300000;

type IonName = keyof typeof Ionicons.glyphMap;
type Status = 'open' | 'taken' | 'packing' | 'packed' | 'loading';
type Tab = 'all' | Status;
type Sort = 'at' | 'new' | 'site';
type Grad = [string, string];

// โทนหน้า: พื้นขาวอมฟ้า การ์ดขาว เงานุ่มอมน้ำเงิน · สีหลักน้ำเงินสดเข้ากับแถบหัวแอป (THEME_GRADIENT ใน (tabs)/_layout.tsx)
const C = {
  bg: '#F4F6FB',
  surface: '#FFFFFF',
  surface2: '#F6F8FC',
  track: '#EDF1F7',
  line: '#E4E9F2',
  lineSoft: '#EEF1F7',
  ink: '#0A1222',
  text: '#1C2536',
  soft: '#5A667D',
  muted: '#8A95AA',
  faint: '#BCC4D2',
  brand: '#2459EA',
  brandSoft: '#EEF3FF',
  brandLine: '#D3E0FF',
  ok: '#0E9F6E',
  okSoft: '#E9FBF3',
  warn: '#D97706',
  warnSoft: '#FFF6E5',
  bad: '#E8335A',
  badSoft: '#FFF0F3',
};
const BRAND_GRAD: Grad = ['#4F86FF', '#2459EA'];
const NEW_GRAD: Grad = ['#FF8A5B', '#FF3D7F'];
const BG_GRAD = ['#E8EFFF', '#F2F5FC', '#F4F6FB'] as const;

/** color = สีตัวอักษร/ไอคอน (เข้มพออ่านบนขาว) · grad = ไล่สีสด (ไอคอนสถานะ/หลอด) · soft = พื้นอ่อน */
interface Tone { label: string; short: string; color: string; grad: Grad; soft: string; icon: IonName }

// สีสถานะ — คนละเฉดชัด ๆ ทุกสถานะ · label = ชื่อเต็มบนการ์ด · short = ชื่อสั้นบนแถบ 6 ช่อง (ให้พอดีจอ)
const STATUS: Record<Status, Tone> = {
  open: { label: 'ยังไม่รับงาน', short: 'ยังไม่รับ', color: '#E8335A', grad: ['#FF8FA3', '#F43F5E'], soft: '#FFF0F3', icon: 'hourglass-outline' },
  taken: { label: 'รับงานแล้ว', short: 'รับแล้ว', color: '#0E9F6E', grad: ['#4ADE9F', '#10B981'], soft: '#E9FBF3', icon: 'person' },
  packing: { label: 'กำลังจัด', short: 'กำลังจัด', color: '#DB7A00', grad: ['#FFCB52', '#F59E0B'], soft: '#FFF7E6', icon: 'cube' },
  packed: { label: 'รอขึ้น', short: 'รอขึ้น', color: '#0A8BD6', grad: ['#5CCBFF', '#0EA5E9'], soft: '#EAF7FF', icon: 'albums' },
  loading: { label: 'กำลังขึ้นรถ', short: 'ขึ้นรถ', color: '#7446F5', grad: ['#B79CFF', '#8B5CF6'], soft: '#F4F0FF', icon: 'bus' },
};
const ALL_TONE: Tone = { label: 'ทั้งหมด', short: 'ทั้งหมด', color: '#2459EA', grad: BRAND_GRAD, soft: '#EEF3FF', icon: 'layers' };
const FALLBACK_TONE: Tone = { label: '', short: '', color: C.soft, grad: ['#A9B3C6', '#6B778E'], soft: C.track, icon: 'ellipse' };
const TABS: Tab[] = ['all', 'open', 'taken', 'packing', 'packed', 'loading'];
const toneOf = (tab: Tab) => (tab === 'all' ? ALL_TONE : STATUS[tab]);
const TAB_INDEX = TABS.map((_, i) => i);
const TAB_COLORS = TABS.map((t) => toneOf(t).grad[1]);

// สีรอบ (.r1/.r2/.r3 ของหน้าเช็คของส่ง — ฟ้าน้ำทะเล / ส้ม / เขียว) เป็นไล่สีสด
const ROUND_COLOR: Record<number, { color: string; grad: Grad }> = {
  1: { color: '#0891B2', grad: ['#3DD5F3', '#0891B2'] },
  2: { color: '#EA580C', grad: ['#FFB067', '#F2620F'] },
  3: { color: '#16A34A', grad: ['#5EE38E', '#16A34A'] },
};
const roundColor = (round: number) => ROUND_COLOR[round] ?? { color: C.soft, grad: ['#A9B3C6', '#6B778E'] as Grad };

const SORTS: { key: Sort; label: string; hint: string; icon: IonName }[] = [
  { key: 'at', label: 'แจ้งก่อนอยู่บน', hint: 'งานที่รอนานที่สุดขึ้นก่อน', icon: 'time-outline' },
  { key: 'new', label: 'แจ้งล่าสุดอยู่บน', hint: 'งานที่เพิ่งแจ้งเข้ามาขึ้นก่อน', icon: 'flash-outline' },
  { key: 'site', label: 'เลขหน้างาน', hint: 'เรียงตามเลขหน้างาน แล้วตามรอบ', icon: 'reorder-four-outline' },
];

// จังหวะแอนิเมชันทั้งหน้า: เลื่อนนุ่มแบบ ease-out ไม่มีสปริง/เด้ง/ยืดหด (ผู้ใช้สั่งเอาเด้งดึ๋งออก 11 พ.ย. 69)
const SLIDE = { duration: 280, easing: Easing.out(Easing.cubic) };
const PRESS_IN = { duration: 90, easing: Easing.out(Easing.quad) };
const PRESS_OUT = { duration: 160, easing: Easing.out(Easing.quad) };
const ENTER = { duration: 320, easing: Easing.out(Easing.cubic) };
const RAIL_PAD = 4;
const SEG_PAD = 3;
const SHEET_EXTRA = 48; // ส่วนเกินใต้ขอบจอของ bottom sheet (กันขอบล่างโผล่ช่องว่างระหว่างเลื่อน)

// -------------------- Types --------------------

interface Company { name: string; short: string; color: string; ink: string; stops: string[] }

interface Job {
  project: number;
  round: number;
  site: string;
  name: string;
  customer: string;
  company: Company | null;
  stock: boolean;
  by: string;
  at: string;
  atText: string;
  deliver: string;
  organizer: string;
  truck: string;
  printed: string;
  taker: string;
  takenText: string;
  mine: boolean;
  status: string;
  total: number;
  done: number;
}

interface SheetItem { name: string; unit: string; left: number | null; packs: Record<string, number>; pd: number }
interface SheetBlock extends SheetItem { sec: string; subs: SheetItem[] }
type SheetLine =
  | { kind: 'sec'; key: string; label: string }
  | { kind: 'row'; key: string; no: number; name: string; left: number; unit: string; sub: boolean; parent: string };

const str = (v: any) => (v === null || v === undefined ? '' : String(v));
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function mapJob(r: any): Job {
  const c = r?.company;
  return {
    project: num(r.project),
    round: num(r.round),
    site: str(r.site),
    name: str(r.name),
    customer: str(r.customer),
    company: c && str(c.name)
      ? { name: str(c.name), short: str(c.short), color: str(c.color) || C.soft, ink: str(c.ink) || '#ffffff', stops: Array.isArray(c.stops) ? c.stops.map(String) : [] }
      : null,
    stock: !!r.stock,
    by: str(r.by),
    at: str(r.at),
    atText: str(r.at_text),
    deliver: str(r.deliver),
    organizer: str(r.organizer),
    truck: str(r.truck),
    printed: str(r.printed),
    taker: str(r.taker).trim(),
    takenText: str(r.taken_text),
    mine: !!r.mine,
    status: str(r.status),
    total: num(r.total),
    done: num(r.done),
  };
}

function mapSheetItem(r: any): SheetItem {
  return {
    name: str(r?.name),
    unit: str(r?.unit),
    left: r?.left === null || r?.left === undefined ? null : num(r.left),
    packs: r?.packs && typeof r.packs === 'object' ? r.packs : {},
    pd: num(r?.pd),
  };
}

const keyOf = (j: Job) => `${j.project}-${j.round}`;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

// อักษรตัวแรกของชื่อ (ตัดคำนำหน้า) + สีประจำชื่อ — ใช้วงกลมผู้รับงาน แบบเดียวกับหน้าเช็คของส่ง
const NAME_PREFIX = /^(นางสาว|นาง|นาย|น\.ส\.|mrs?\.?|ms\.?)\s*/i;
const initialOf = (name: string) => (name.replace(NAME_PREFIX, '').match(/[ก-ฮa-z0-9]/i) || ['?'])[0].toUpperCase();
const hueOf = (name: string) => Array.from(name).reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) % 360, 7);
const avatarGrad = (name: string): Grad => {
  const h = hueOf(name);
  return [`hsl(${h}, 85%, 66%)`, `hsl(${(h + 28) % 360}, 70%, 48%)`];
};

/** "YYYY-MM-DD HH:MM:SS" → เวลาเครื่อง (เทียบกับเวลาเซิร์ฟเวอร์ที่แปลงแบบเดียวกัน เขตเวลาจึงหักล้างกัน) */
function toTime(text: string): number {
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return Date.now();
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)).getTime();
}

/** แจ้งเมื่อกี่นาที/ชั่วโมง/วันก่อน — เกิน 1 วัน = old (ป้ายส้ม) แบบหน้าเว็บ */
function ago(at: string, now: number): { text: string; old: boolean } {
  const mins = Math.max(0, Math.floor((now - toTime(at)) / 60000));
  if (mins < 1) return { text: 'เมื่อสักครู่', old: false };
  if (mins < 60) return { text: `${mins} นาทีที่แล้ว`, old: false };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { text: `${hours} ชม.ที่แล้ว`, old: false };
  return { text: `${Math.floor(hours / 24)} วันที่แล้ว`, old: true };
}

/**
 * ยอดที่ยังต้องจัดในรอบนี้ = ค้าง − ที่บันทึกจัดในรอบนี้แล้ว · ติ๊กจัดครบรอบนี้ = 0
 * (packLeft ใน js/site_job_board.js — จำนวนรายการในใบงานจึง = y − x ของ "จัดแล้ว x/y" บนการ์ด)
 */
function packLeft(item: SheetItem, round: number): number {
  if (item.left === null || item.pd === round) return 0;
  const rest = Math.round((item.left - num(item.packs[String(round)])) * 100) / 100;
  return rest > 0.005 ? rest : 0;
}

/** แถวใบงาน: เรียงชื่อ ก-ฮ ในแต่ละหมวด · รายการย่อยอยู่ใต้รายการหลัก · นอก ปร. แยกหัวข้อ */
function sheetLines(blocks: SheetBlock[], round: number): { lines: SheetLine[]; count: number } {
  const lines: SheetLine[] = [];
  let no = 0;
  ([['goods', ''], ['extra', 'นอก ปร.']] as const).forEach(([sec, label]) => {
    const list = blocks.filter((b) => b.sec === sec).sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true }));
    const rows: SheetLine[] = [];
    list.forEach((b, bi) => {
      const main = packLeft(b, round);
      if (main) rows.push({ kind: 'row', key: `${sec}-${bi}`, no: ++no, name: b.name, left: main, unit: b.unit, sub: false, parent: '' });
      b.subs.forEach((s, si) => {
        const rest = packLeft(s, round);
        if (rest) rows.push({ kind: 'row', key: `${sec}-${bi}-${si}`, no: ++no, name: s.name, left: rest, unit: s.unit, sub: true, parent: main ? '' : b.name });
      });
    });
    if (!rows.length) return;
    if (label) lines.push({ kind: 'sec', key: `sec-${sec}`, label });
    lines.push(...rows);
  });
  return { lines, count: no };
}

/** ข้อความแจ้งเมื่อยิงไม่สำเร็จ: เน็ตหลุด / เซิร์ฟเวอร์ยังไม่มี API / ข้อความจากเซิร์ฟเวอร์ */
function errorText(e: any, fallback: string): string {
  if (e?.response?.status === 404) return 'เซิร์ฟเวอร์ยังไม่มี API ของหน้านี้';
  if (e?.isAxiosError) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  return e?.message || fallback;
}

// -------------------- ชิ้นส่วน UI (อยู่นอกตัวหน้า ไม่ให้ animation รีเซ็ตทุกครั้งที่ re-render) --------------------

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressProps = Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; children?: ReactNode; scaleTo?: number };

/** ปุ่มกดแล้วยุบลงนิดแล้วคืนรูปเรียบ ๆ (ไม่เด้ง) — ใช้แทน TouchableOpacity ทั้งหน้า */
function Press({ style, children, scaleTo = 0.97, onPressIn, onPressOut, ...rest }: PressProps) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        scale.value = withTiming(scaleTo, PRESS_IN);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, PRESS_OUT);
        onPressOut?.(e);
      }}
      style={[style, aStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** ตำแหน่งก้อนตัวเลือก (หน่วยเป็นช่อง) — เลื่อนไปช่องใหม่แบบ ease-out เรียบ ๆ ไม่ยืด ไม่เด้ง */
function useSlide(index: number) {
  const pos = useSharedValue(index);
  useEffect(() => {
    pos.value = withTiming(index, SLIDE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);
  return pos;
}

/** ป้ายสถานะการเชื่อมต่อ — จุดเขียวมีวงคลื่นกระจายตอนอัปเดตอัตโนมัติ · แดงนิ่งตอนขาดการเชื่อมต่อ · กดเพื่อโหลดทันที */
function LivePill({ live, running, onPress }: { live: boolean; running: boolean; onPress: () => void }) {
  const wave = useSharedValue(0);
  useEffect(() => {
    if (live && running) wave.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.out(Easing.quad) }), -1, false);
    else {
      cancelAnimation(wave);
      wave.value = 0;
    }
    return () => cancelAnimation(wave);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, running]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - wave.value), transform: [{ scale: 1 + wave.value * 1.8 }] }));
  const color = live ? '#10B981' : C.bad;
  return (
    <Press
      style={[s.live, !live && s.liveOff]}
      onPress={onPress}
     
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={live ? 'อัปเดตอัตโนมัติทุก 30 วินาที กดเพื่อโหลดทันที' : 'ขาดการเชื่อมต่อ กดเพื่อลองใหม่'}
    >
      <View style={s.liveDotBox}>
        {live && <Animated.View style={[s.liveRing, { backgroundColor: color }, ring]} />}
        <View style={[s.liveDot, { backgroundColor: color }]} />
      </View>
      <Text style={[s.liveText, !live && { color: C.bad }]}>{live ? 'อัปเดตสด' : 'ออฟไลน์'}</Text>
    </Press>
  );
}

/** 1 ช่องของแถบสถานะ — ก้อนขาวมาถึงช่องไหน ตัวเลขช่องนั้นค่อย ๆ เปลี่ยนเป็นสีสถานะ · ตัวเลขเปลี่ยน = ค่อย ๆ จางเข้า */
function RailTab({ index, tab, pos, count, active, onPress }: {
  index: number;
  tab: Tab;
  pos: SharedValue<number>;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const tone = toneOf(tab);
  const numBase = count ? C.text : C.faint;
  const numStyle = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(pos.value - index));
    return { color: interpolateColor(t, [0, 1], [numBase, tone.color]) };
  });
  const lblStyle = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(pos.value - index));
    return { color: interpolateColor(t, [0, 1], [C.muted, C.ink]) };
  });
  return (
    <Press
      style={s.railTab}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${tone.label} ${count} รอบ`}
    >
      <View style={s.railTop}>
        <View style={[s.railDot, { backgroundColor: tone.grad[1] }, !count && { opacity: 0.35 }]} />
        <Animated.Text key={count} entering={FadeIn.duration(220)} style={[s.railNum, numStyle]} maxFontSizeMultiplier={1.2}>
          {count}
        </Animated.Text>
      </View>
      <Animated.Text style={[s.railLbl, lblStyle]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.15}>
        {tone.short}
      </Animated.Text>
    </Press>
  );
}

/**
 * แถบสถานะ 6 ช่องแบ่งเท่ากันเต็มความกว้าง (ไม่มีเลื่อนข้าง)
 * ตัวเลือก = ก้อนขาวลอยมีเงา เลื่อนเรียบ ๆ ไปช่องที่กด · ขีดใต้ก้อนเปลี่ยนสีตามสถานะระหว่างทาง
 */
function StatusRail({ value, counts, onChange }: { value: Tab; counts: Record<string, number>; onChange: (t: Tab) => void }) {
  const pos = useSlide(Math.max(0, TABS.indexOf(value)));
  const colW = useSharedValue(0);
  const pill = useAnimatedStyle(() => ({
    width: colW.value,
    opacity: colW.value > 0 ? 1 : 0,
    transform: [{ translateX: pos.value * colW.value }],
  }));
  const glow = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(pos.value, TAB_INDEX, TAB_COLORS) }));
  return (
    <View
      style={s.rail}
      accessibilityRole="tablist"
      onLayout={(e) => {
        colW.value = (e.nativeEvent.layout.width - RAIL_PAD * 2) / TABS.length;
      }}
    >
      <Animated.View style={[s.railPill, pill]}>
        <Animated.View style={[s.railGlow, glow]} />
      </Animated.View>
      {TABS.map((tab, i) => (
        <RailTab key={tab} index={i} tab={tab} pos={pos} count={counts[tab] ?? 0} active={tab === value} onPress={() => onChange(tab)} />
      ))}
    </View>
  );
}

/** สวิตช์เลือกรอบ (ทุกรอบ / รอบ 1-3) แบ่งช่องเท่ากันพอดีจอ · ก้อนขาวเลื่อนเรียบ ๆ แบบเดียวกับแถบสถานะ */
function RoundSwitch({ rounds, value, onChange }: { rounds: number[]; value: number; onChange: (r: number) => void }) {
  const options = useMemo(() => [0, ...rounds], [rounds]);
  const pos = useSlide(Math.max(0, options.indexOf(value)));
  const [width, setWidth] = useState(0);
  const segW = useSharedValue(0);
  useEffect(() => {
    segW.value = width ? (width - SEG_PAD * 2) / options.length : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, options.length]);
  const pill = useAnimatedStyle(() => ({ width: segW.value, opacity: segW.value > 0 ? 1 : 0, transform: [{ translateX: pos.value * segW.value }] }));
  return (
    <View style={s.seg} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      <Animated.View style={[s.segPill, pill]} />
      {options.map((r, i) => (
        <RoundSeg key={r} index={i} round={r} pos={pos} active={r === value} onPress={() => onChange(r)} />
      ))}
    </View>
  );
}

function RoundSeg({ index, round, pos, active, onPress }: {
  index: number;
  round: number;
  pos: SharedValue<number>;
  active: boolean;
  onPress: () => void;
}) {
  const color = round ? roundColor(round).color : C.ink;
  const txt = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(pos.value - index));
    return { color: interpolateColor(t, [0, 1], [C.muted, color]) };
  });
  return (
    <Press style={s.segItem} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      {!!round && <LinearGradient colors={roundColor(round).grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.segDot} />}
      <Animated.Text style={[s.segText, txt]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {round ? `รอบ ${round}` : 'ทุกรอบ'}
      </Animated.Text>
    </Press>
  );
}

/**
 * หลอดจัดแล้ว — ไส้ไล่สีตามสถานะ ค่อย ๆ วิ่งขึ้น (ease-out ไม่เด้ง) ตอนการ์ดโผล่/ยอดเปลี่ยน
 * งานที่ยังจัดไม่ครบมีแสงวาบวิ่งผ่านเป็นระยะ (หยุดเมื่อออกจากหน้า)
 */
function Progress({ pct, grad, run }: { pct: number; grad: Grad; run: boolean }) {
  const w = useSharedValue(0);
  const trackW = useSharedValue(0);
  const shine = useSharedValue(0);
  const moving = run && pct > 0 && pct < 100;
  useEffect(() => {
    w.value = withDelay(180, withTiming(pct, { duration: 750, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);
  useEffect(() => {
    if (moving)
      shine.value = withDelay(
        1000,
        withRepeat(withSequence(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }), withDelay(2200, withTiming(0, { duration: 0 }))), -1, false)
      );
    else {
      cancelAnimation(shine);
      shine.value = 0;
    }
    return () => cancelAnimation(shine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.min(100, Math.max(0, w.value))}%` }));
  const sweep = useAnimatedStyle(() => {
    const fw = (trackW.value * Math.min(100, Math.max(0, w.value))) / 100;
    return { transform: [{ translateX: -48 + shine.value * (fw + 48) }] };
  });
  return (
    <View style={s.track} onLayout={(e) => (trackW.value = e.nativeEvent.layout.width)}>
      <Animated.View style={[s.trackFill, fill]}>
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <Animated.View style={[s.trackShine, sweep]}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** ป้าย "ใหม่" ไล่สีส้ม-ชมพู (นิ่ง ไม่เต้น) */
function NewBadge() {
  return (
    <View style={s.newBadge}>
      <LinearGradient colors={NEW_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 50 }]} />
      <Text style={s.newBadgeText}>ใหม่</Text>
    </View>
  );
}

/** ก้อนเลขรอบ — ไล่สีสดตามรอบ ตัวเลขขาว มีเงาสีเดียวกัน */
function RoundBadge({ round, size = 50 }: { round: number; size?: number }) {
  const rc = roundColor(round);
  return (
    <LinearGradient
      colors={rc.grad}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.round, { width: size, height: size, borderRadius: Math.round(size * 0.32), boxShadow: `0 6px 14px ${rc.color}45` }]}
    >
      <Text style={s.roundSmall}>รอบ</Text>
      <Text style={[s.roundNo, { fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.48) }]}>{round}</Text>
    </LinearGradient>
  );
}

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <LinearGradient colors={avatarGrad(name)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[s.avatarText, { fontSize: size * 0.42 }]}>{initialOf(name)}</Text>
    </LinearGradient>
  );
}

function CompanyBadge({ company }: { company: Company }) {
  const label = (
    <Text style={[s.companyMark, { color: company.ink }]} numberOfLines={1}>
      {company.short || company.name}
    </Text>
  );
  return company.stops.length >= 2 ? (
    <LinearGradient colors={company.stops as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.company}>
      {label}
    </LinearGradient>
  ) : (
    <View style={[s.company, { backgroundColor: company.color }]}>{label}</View>
  );
}

function InfoRow({ icon, label, value, sub, color, right }: { icon: IonName; label: string; value: string; sub?: string; color?: string; right?: ReactNode }) {
  return (
    <View style={s.info}>
      <View style={s.infoIcon}>
        <Ionicons name={icon} size={13} color={color ?? C.muted} />
      </View>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, !!color && { color }]}>
        {value}
        {!!sub && <Text style={s.infoSub}>{'  '}{sub}</Text>}
      </Text>
      {right}
    </View>
  );
}

/** ปุ่มหลักของงาน: ยังไม่มีคนรับ = รับงาน · รับแล้ว (ใครก็ได้) = เปิดงาน (ของเรา = ปุ่มไล่สี / ของคนอื่น = ปุ่มขอบ) */
function GoButton({ job, busy, onPress }: { job: Job; busy: string | null; onPress: () => void }) {
  const taken = !!job.taker;
  const primary = !taken || job.mine;
  const working = busy === keyOf(job);
  const fg = primary ? '#FFFFFF' : C.brand;
  return (
    <Press
      style={[s.btn, primary ? s.btnPrimary : s.btnOutline, !!busy && !working && s.btnDim]}
      disabled={!!busy}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={taken ? 'เปิดงาน' : 'รับงาน'}
    >
      {primary && <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />}
      {working ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name={taken ? 'enter-outline' : 'hand-left-outline'} size={17} color={fg} />}
      <Text style={[s.btnText, { color: fg }]}>{taken ? 'เปิดงาน' : 'รับงาน'}</Text>
    </Press>
  );
}

function JobCard({ job, isNew, now, busy, run, onSheet, onGo, onRelease }: {
  job: Job;
  isNew: boolean;
  now: number;
  busy: string | null;
  run: boolean;
  onSheet: () => void;
  onGo: () => void;
  onRelease: () => void;
}) {
  const st = STATUS[job.status as Status] ?? { ...FALLBACK_TONE, label: job.status, short: job.status };
  const age = ago(job.at, now);
  const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <View style={[s.card, isNew && s.cardNew]} accessibilityLabel={`หน้างาน ${job.site} รอบ ${job.round}`}>
      {/* หัวการ์ด: รอบ + เลขหน้างาน + ชื่อโครงการ */}
      <View style={s.head}>
        <RoundBadge round={job.round} />
        <View style={s.headMain}>
          <View style={s.siteLine}>
            <Text style={s.site} numberOfLines={1}>
              <Text style={s.siteKicker}>หน้างาน </Text>
              {job.site}
            </Text>
            {isNew && <NewBadge />}
            {job.stock && (
              <View style={s.tag}>
                <Ionicons name="file-tray-stacked-outline" size={11} color={C.soft} />
                <Text style={s.tagText}>หน้างานสต๊อก</Text>
              </View>
            )}
          </View>
          <Text style={s.name}>{job.name || '-'}</Text>
        </View>
      </View>

      {/* สถานะจัดของ + หลอดจัดแล้ว x/y (รายการค้างของรอบนี้) */}
      <View style={s.state}>
        <View style={s.stateTop}>
          <View style={s.stateLabel}>
            <LinearGradient colors={st.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.stateIcon}>
              <Ionicons name={st.icon} size={12} color="#fff" />
            </LinearGradient>
            <Text style={[s.stateText, { color: st.color }]}>{st.label}</Text>
          </View>
          {job.total > 0 ? (
            <Text style={s.stateCount} accessibilityLabel={`จัดแล้ว ${job.done} จาก ${job.total} รายการ`}>
              จัดแล้ว <Text style={s.stateNum}>{job.done}</Text>
              <Text style={s.stateOf}>/{job.total}</Text>
            </Text>
          ) : (
            <Text style={s.stateEmpty}>ไม่มีรายการค้าง</Text>
          )}
        </View>
        {job.total > 0 && (
          <View style={s.trackRow}>
            <Progress pct={pct} grad={st.grad} run={run} />
            <Text style={[s.pct, { color: pct > 0 ? st.color : C.faint }]}>{pct}%</Text>
          </View>
        )}
      </View>

      {(job.company || !!job.customer) && (
        <View style={s.who}>
          {job.company && <CompanyBadge company={job.company} />}
          {!!job.customer && <Text style={s.customer}>{job.customer}</Text>}
        </View>
      )}

      {/* รายละเอียดเป็นแถว ป้าย-ค่า ตรงแนวกัน */}
      <View style={s.infoBox}>
        <InfoRow
          icon="megaphone-outline"
          label="ผู้แจ้ง"
          value={job.by || '-'}
          sub={job.atText}
          right={
            <View style={[s.age, age.old && { backgroundColor: C.warnSoft }]}>
              <Text style={[s.ageText, age.old && { color: C.warn }]}>{age.text}</Text>
            </View>
          }
        />
        {!!job.deliver && <InfoRow icon="calendar-outline" label="กำหนดส่ง" value={job.deliver} />}
        {!!job.organizer && <InfoRow icon="person-outline" label="ผู้จัดงาน" value={job.organizer} />}
        {!!job.truck && <InfoRow icon="car-outline" label="รถ" value={job.truck} />}
        {!!job.printed && <InfoRow icon="print-outline" label="ใบเช็ค" value={`พิมพ์แล้ว ${job.printed}`} color={C.ok} />}
      </View>

      {/* ผู้รับงาน — ของเรามีปุ่มยกเลิกรับงาน */}
      {!!job.taker && (
        <View style={s.taker}>
          <Avatar name={job.taker} />
          <View style={{ flex: 1 }}>
            <Text style={[s.takerKicker, job.mine && { color: C.brand }]}>{job.mine ? 'คุณรับงานนี้' : 'รับงานแล้วโดย'}</Text>
            <Text style={s.takerName}>
              {job.taker}
              {!!job.takenText && <Text style={s.takerAt}>  {job.takenText}</Text>}
            </Text>
          </View>
          {job.mine && (
            <Press style={[s.release, !!busy && s.btnDim]} disabled={!!busy} onPress={onRelease} accessibilityRole="button" accessibilityLabel="ยกเลิกรับงาน">
              <Ionicons name="arrow-undo" size={13} color={C.bad} />
              <Text style={s.releaseText}>ยกเลิกรับ</Text>
            </Press>
          )}
        </View>
      )}

      <View style={s.actions}>
        <Press style={[s.btn, s.btnSoft]} onPress={onSheet} accessibilityRole="button" accessibilityLabel="ดูใบงาน">
          <Ionicons name="document-text-outline" size={17} color={C.brand} />
          <Text style={[s.btnText, { color: C.brand }]}>ดูใบงาน</Text>
        </Press>
        <GoButton job={job} busy={busy} onPress={onGo} />
      </View>
    </View>
  );
}

/** โครงการ์ดระหว่างโหลดครั้งแรก — แสงวิ่งผ่าน */
function SkeletonCard({ delay }: { delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1250, easing: Easing.inOut(Easing.ease) }), -1, false));
    return () => cancelAnimation(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sheen = useAnimatedStyle(() => ({ transform: [{ translateX: -260 + t.value * 760 }] }));
  return (
    <Animated.View entering={FadeIn.delay(delay).duration(300)} style={[s.card, s.skCard]}>
      <View style={s.head}>
        <View style={[s.sk, { width: 50, height: 50, borderRadius: 16 }]} />
        <View style={{ flex: 1, gap: 9, paddingTop: 4 }}>
          <View style={[s.sk, { width: '42%', height: 11 }]} />
          <View style={[s.sk, { width: '88%', height: 15 }]} />
        </View>
      </View>
      <View style={[s.sk, { height: 56, borderRadius: 16 }]} />
      <View style={{ gap: 9 }}>
        <View style={[s.sk, { width: '76%', height: 10 }]} />
        <View style={[s.sk, { width: '58%', height: 10 }]} />
      </View>
      <View style={s.actions}>
        <View style={[s.sk, { flex: 1, height: 46, borderRadius: 14 }]} />
        <View style={[s.sk, { flex: 1, height: 46, borderRadius: 14 }]} />
      </View>
      <Animated.View pointerEvents="none" style={[s.sheen, sheen]}>
        <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </Animated.View>
  );
}

/** หน้าว่าง/ผิดพลาด — ค่อย ๆ จางเข้า (ไอคอนนิ่ง) + ปุ่มทางออก */
function EmptyState({ icon, grad, tint, title, text, action }: {
  icon: IonName;
  grad: Grad;
  tint: string;
  title: string;
  text: string;
  action?: { label: string; icon: IonName; onPress: () => void };
}) {
  return (
    <Animated.View entering={FadeIn.duration(300)} style={s.empty}>
      <View style={[s.emptyHalo, { backgroundColor: tint }]}>
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.emptyIcon}>
          <Ionicons name={icon} size={30} color="#fff" />
        </LinearGradient>
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyText}>{text}</Text>
      {action && (
        <Press style={s.emptyBtn} onPress={action.onPress} accessibilityRole="button">
          <Ionicons name={action.icon} size={15} color={C.brand} />
          <Text style={s.emptyBtnText}>{action.label}</Text>
        </Press>
      )}
    </Animated.View>
  );
}

/**
 * bottom sheet เลื่อนขึ้นเรียบ ๆ (ease-out ไม่เด้ง) พื้นหลังค่อย ๆ มืด · ปิด = เลื่อนลงจนพ้นจอแล้วค่อยถอด Modal
 * (Modal ถอดทันทีจะไม่เห็นตอนเลื่อนลง จึงถือ mounted ไว้เองอีกชั้น)
 */
function BottomSheet({ visible, onClose, height, bottomInset, children }: { visible: boolean; onClose: () => void; height?: number; bottomInset: number; children: ReactNode }) {
  const { height: winH } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const y = useSharedValue(winH);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      fade.value = withTiming(1, { duration: 240 });
      y.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
      return;
    }
    fade.value = withTiming(0, { duration: 200 });
    y.value = withTiming(winH, { duration: 230, easing: Easing.in(Easing.cubic) });
    const t = setTimeout(() => setMounted(false), 240);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdrop = useAnimatedStyle(() => ({ opacity: fade.value }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[s.backdrop, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="ปิด" />
      </Animated.View>
      <Animated.View style={[s.sheet, height ? { height: height + SHEET_EXTRA } : null, { paddingBottom: bottomInset + 12 + SHEET_EXTRA }, panel]}>
        <View style={s.grip} />
        {children}
      </Animated.View>
    </Modal>
  );
}

// -------------------- Screen --------------------

export default function SiteJobBoardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useScreenInsets();
  const { height: winH } = useWindowDimensions();

  const [items, setItems] = useState<Job[]>([]);
  const [rounds, setRounds] = useState<number[]>([1, 2, 3]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [onScreen, setOnScreen] = useState(true);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  // เวลาเซิร์ฟเวอร์ − เวลาเครื่อง (นาฬิกามือถืออาจเพี้ยน) ใช้คิด "กี่นาทีที่แล้ว"
  const [clockOffset, setClockOffset] = useState(0);

  // เปิดหน้ามาแสดงงานที่ยังไม่มีคนรับก่อน (ผู้ใช้สั่ง 10 พ.ย. 69 เหมือนหน้าเว็บ)
  const [status, setStatus] = useState<Tab>('open');
  const [round, setRound] = useState(0);
  const [search, setSearch] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const [sort, setSort] = useState<Sort>('at');
  const [sortOpen, setSortOpen] = useState(false);

  const [sheetJob, setSheetJob] = useState<Job | null>(null);
  const [sheet, setSheet] = useState<{ loading: boolean; error: string; blocks: SheetBlock[] }>({ loading: false, error: '', blocks: [] });
  const [busy, setBusy] = useState<string | null>(null); // คีย์งานที่กำลังรับ/ยกเลิก (กันกดซ้ำ)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fails = useRef(0);
  const focused = useRef(false);
  const inited = useRef(false);
  const seen = useRef<Set<string> | null>(null);
  const loadSeq = useRef(0);
  const sheetSeq = useRef(0);
  const lastSheetJob = useRef<Job | null>(null);

  const stopPoll = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const load = useCallback(
    async (mode: 'first' | 'poll' | 'refresh') => {
      if (!user?.id) return;
      stopPoll();
      const seq = ++loadSeq.current;
      if (mode === 'first') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      try {
        const res = await apiMobileGet(SJB_API_URL, 'list', { user_id: user.id, init: inited.current ? undefined : 1 });
        if (seq !== loadSeq.current) return;
        inited.current = true;
        const list = (Array.isArray(res.list) ? res.list : []).map(mapJob);
        const keys = list.map(keyOf);
        // งานที่เพิ่งแจ้งเข้ามาตั้งแต่ถามครั้งก่อน (ครั้งแรกไม่นับ)
        setFresh(seen.current ? new Set(keys.filter((k) => !seen.current!.has(k))) : new Set());
        seen.current = new Set(keys);
        setItems(list);
        if (Array.isArray(res.rounds) && res.rounds.length) setRounds(res.rounds.map(Number));
        if (typeof res.now === 'string') setClockOffset(toTime(res.now) - Date.now());
        setLoadError(null);
        setLive(true);
        fails.current = 0;
      } catch (e: any) {
        if (seq !== loadSeq.current) return;
        fails.current++;
        setLive(false);
        // โหลดครั้งแรกไม่ได้ = ขึ้นหน้าข้อผิดพลาด · ถามรอบต่อ ๆ ไปไม่ได้ = คงรายการเดิมไว้ ป้ายบอก "ขาดการเชื่อมต่อ"
        if (!seen.current) setLoadError(errorText(e, 'โหลดข้อมูลไม่สำเร็จ'));
      } finally {
        if (seq === loadSeq.current) {
          setLoading(false);
          setRefreshing(false);
          if (focused.current && AppState.currentState === 'active') {
            const wait = fails.current ? Math.min(POLL_MS * 2 ** fails.current, POLL_MAX_MS) : POLL_MS;
            timer.current = setTimeout(() => void load('poll'), wait);
          }
        }
      }
    },
    [user?.id]
  );

  // เปิดหน้านี้อยู่ = ถามรายการใหม่เรื่อย ๆ · ออกจากหน้า = หยุดถาม ปิดป๊อปอัป หยุดแอนิเมชันวนซ้ำ
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setOnScreen(true);
      void load(seen.current ? 'poll' : 'first');
      return () => {
        focused.current = false;
        setOnScreen(false);
        stopPoll();
        setSheetJob(null);
        setSortOpen(false);
      };
    }, [load])
  );

  // แอปถูกพับ = หยุดถาม · กลับมา = ถามทันที
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopPoll();
      else if (focused.current) void load('poll');
    });
    return () => sub.remove();
  }, [load]);

  useEffect(() => stopPoll, []);

  // -------------------- กรอง / นับ / เรียง (ทำในเครื่องแบบหน้าเว็บ) --------------------

  const view = useMemo(() => {
    const q = norm(search);
    const inScope = items.filter(
      (j) =>
        (round === 0 || j.round === round) &&
        (!q || norm([j.site, j.name, j.customer, j.company?.name ?? '', j.by, j.organizer, j.taker].join(' ')).includes(q))
    );
    const counts: Record<string, number> = { all: inScope.length };
    inScope.forEach((j) => (counts[j.status] = (counts[j.status] ?? 0) + 1));
    let shown = inScope.filter((j) => status === 'all' || j.status === status);
    const bySite = (a: Job, b: Job) => a.site.localeCompare(b.site, 'th', { numeric: true }) || a.round - b.round;
    if (sort === 'new') shown = shown.slice().sort((a, b) => toTime(b.at) - toTime(a.at) || bySite(a, b));
    else if (sort === 'site') shown = shown.slice().sort(bySite);
    const sites = new Set(items.map((j) => j.project)).size;
    return { counts, shown, sites, q };
  }, [items, search, round, status, sort]);

  // -------------------- รับงาน / ยกเลิกรับงาน / เปิดหน้าเช็คของส่ง --------------------

  // เปิดหน้าเช็คของส่งในแอป (site_item_check.tsx) ของหน้างานนั้น
  function openCheck(job: Job) {
    router.push({ pathname: '/site_item_check', params: { project_id: String(job.project) } } as never);
  }

  // รับงาน: บันทึกชื่อก่อนแล้วค่อยเปิดหน้าเช็คของส่ง · มีคนรับไปก่อน = แจ้งชื่อแล้วโหลดรายการใหม่
  async function accept(job: Job) {
    if (!user?.id || busy) return;
    setBusy(keyOf(job));
    try {
      await apiMobilePost(SJB_API_URL, 'accept', { user_id: user.id, project_id: job.project, round: job.round });
      setSheetJob(null);
      openCheck(job);
    } catch (e: any) {
      setSheetJob(null);
      Alert.alert('รับงานไม่สำเร็จ', errorText(e, 'รับงานไม่สำเร็จ ลองใหม่อีกครั้ง'));
    } finally {
      setBusy(null);
      void load('poll');
    }
  }

  function release(job: Job) {
    if (!user?.id || busy) return;
    Alert.alert('ยกเลิกรับงาน', `หน้างาน ${job.site} รอบ ${job.round} ?`, [
      { text: 'ไม่', style: 'cancel' },
      {
        text: 'ยกเลิกรับงาน',
        style: 'destructive',
        onPress: async () => {
          setBusy(keyOf(job));
          try {
            await apiMobilePost(SJB_API_URL, 'release', { user_id: user.id, project_id: job.project, round: job.round });
          } catch (e: any) {
            Alert.alert('ยกเลิกรับงานไม่สำเร็จ', errorText(e, 'ยกเลิกรับงานไม่สำเร็จ ลองใหม่อีกครั้ง'));
          } finally {
            setBusy(null);
            void load('poll');
          }
        },
      },
    ]);
  }

  const go = (job: Job) => (job.taker ? openCheck(job) : accept(job));

  // -------------------- ใบงาน --------------------

  async function openSheet(job: Job) {
    if (!user?.id) return;
    const seq = ++sheetSeq.current;
    setSheetJob(job);
    setSheet({ loading: true, error: '', blocks: [] });
    try {
      const res = await apiMobileGet(SJB_API_URL, 'sheet', { user_id: user.id, project_id: job.project });
      if (seq !== sheetSeq.current) return;
      const blocks: SheetBlock[] = (Array.isArray(res.blocks) ? res.blocks : []).map((b: any) => ({
        ...mapSheetItem(b),
        sec: str(b?.sec),
        subs: (Array.isArray(b?.subs) ? b.subs : []).map(mapSheetItem),
      }));
      setSheet({ loading: false, error: '', blocks });
    } catch (e: any) {
      if (seq === sheetSeq.current) setSheet({ loading: false, error: errorText(e, 'โหลดใบงานไม่สำเร็จ ลองใหม่อีกครั้ง'), blocks: [] });
    }
  }

  // งานในป๊อปอัปใบงานใช้ข้อมูลล่าสุดจากรายการ (มีคนรับระหว่างเปิดอยู่ ปุ่มเปลี่ยนเป็นเปิดงาน)
  const sheetCurrent = sheetJob ? items.find((j) => keyOf(j) === keyOf(sheetJob)) ?? sheetJob : null;
  // ตอนกำลังเลื่อนปิด sheetJob เป็น null แล้ว — ใช้งานล่าสุดค้างไว้ให้เนื้อหาไม่หายกลางทาง
  if (sheetCurrent) lastSheetJob.current = sheetCurrent;

  function renderSheet() {
    const job = sheetCurrent ?? lastSheetJob.current;
    const close = () => {
      sheetSeq.current++;
      setSheetJob(null);
    };
    const result = job && !sheet.loading && !sheet.error ? sheetLines(sheet.blocks, job.round) : null;
    const allPacked = !!result && !result.count && sheet.blocks.length > 0;
    let rowIndex = 0;
    return (
      <BottomSheet visible={!!sheetJob} onClose={close} height={Math.min(winH * 0.88, winH - insets.top - 12)} bottomInset={insets.bottom}>
        {job && (
          <>
            <View style={s.shHead}>
              <RoundBadge round={job.round} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={s.shKicker}>ใบงาน · หน้างาน {job.site}</Text>
                <Text style={s.shTitle} numberOfLines={2}>
                  {job.name || '-'}
                </Text>
              </View>
              <Press onPress={close} style={s.closeBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="ปิด">
                <Ionicons name="close" size={20} color={C.soft} />
              </Press>
            </View>

            <View style={s.shMeta}>
              {!!result?.count && (
                <Animated.View entering={FadeIn.duration(240)} style={s.shCount}>
                  <LinearGradient colors={STATUS.packing.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.shCountIcon}>
                    <Ionicons name="cube" size={11} color="#fff" />
                  </LinearGradient>
                  <Text style={s.shCountText}>ค้างจัด {result.count} รายการ</Text>
                </Animated.View>
              )}
              <View style={s.basis}>
                <Ionicons name="information-circle-outline" size={15} color={C.muted} />
                <Text style={s.basisText}>
                  ค้าง = จำนวนที่ต้องส่ง (ติ๊ก 80% ใช้ยอด 80%) หักที่ขึ้นรถแล้วและที่บันทึกจัดในรอบนี้แล้ว · ไม่แสดงที่จัดครบแล้ว
                </Text>
              </View>
            </View>

            <View style={s.tHead}>
              <Text style={[s.th, s.colNo]}>#</Text>
              <Text style={[s.th, s.colName]}>รายการ</Text>
              <Text style={[s.th, s.colQty]}>ค้าง</Text>
              <Text style={[s.th, s.colUnit]}>หน่วย</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
              {sheet.loading ? (
                <View style={s.shNote}>
                  <ActivityIndicator color={C.brand} />
                  <Text style={s.shNoteText}>กำลังโหลดใบงาน...</Text>
                </View>
              ) : sheet.error ? (
                <View style={s.shNote}>
                  <LinearGradient colors={STATUS.open.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.shNoteIcon}>
                    <Ionicons name="cloud-offline" size={24} color="#fff" />
                  </LinearGradient>
                  <Text style={[s.shNoteText, { color: C.bad }]}>{sheet.error}</Text>
                  <Press style={s.retryBtn} onPress={() => openSheet(job)} accessibilityRole="button">
                    <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />
                    <Ionicons name="refresh" size={15} color="#fff" />
                    <Text style={s.retryText}>ลองใหม่</Text>
                  </Press>
                </View>
              ) : !result?.count ? (
                <Animated.View entering={FadeInDown.duration(320)} style={s.shNote}>
                  <LinearGradient colors={STATUS.taken.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.shNoteIcon}>
                    <Ionicons name={allPacked ? 'checkmark-done' : 'file-tray-outline'} size={24} color="#fff" />
                  </LinearGradient>
                  <Text style={s.shNoteText}>{allPacked ? 'จัดครบทุกรายการแล้ว รอขึ้นรถ' : 'ไม่มีรายการค้าง'}</Text>
                </Animated.View>
              ) : (
                result.lines.map((line) => {
                  const d = Math.min(rowIndex++, 14) * 24;
                  return line.kind === 'sec' ? (
                    <Animated.View key={line.key} entering={FadeIn.delay(d).duration(260)} style={s.tSec}>
                      <View style={s.tSecPill}>
                        <Text style={s.tSecText}>{line.label}</Text>
                      </View>
                    </Animated.View>
                  ) : (
                    <Animated.View key={line.key} entering={FadeInDown.delay(d).duration(300)} style={[s.tr, line.sub && s.trSub]}>
                      <Text style={[s.td, s.colNo, s.tdNo]}>{line.no}</Text>
                      <View style={s.colName}>
                        <Text style={s.td}>
                          {line.sub && <Text style={s.subMark}>↳ </Text>}
                          {line.name || '-'}
                        </Text>
                        {!!line.parent && <Text style={s.subParent}>ย่อยของ {line.parent}</Text>}
                      </View>
                      <Text style={[s.td, s.colQty, s.tdQty]}>{fmt(line.left)}</Text>
                      <Text style={[s.td, s.colUnit, s.tdUnit]}>{line.unit || '-'}</Text>
                    </Animated.View>
                  );
                })
              )}
            </ScrollView>

            <View style={s.shFoot}>
              <Press style={[s.btn, s.btnGhost]} onPress={close} accessibilityRole="button">
                <Text style={[s.btnText, { color: C.text }]}>ปิด</Text>
              </Press>
              <GoButton job={job} busy={busy} onPress={() => go(job)} />
            </View>
          </>
        )}
      </BottomSheet>
    );
  }

  // -------------------- เลือกการเรียง --------------------

  function renderSortSheet() {
    return (
      <BottomSheet visible={sortOpen} onClose={() => setSortOpen(false)} bottomInset={insets.bottom}>
        <Text style={s.sortTitle}>เรียงลำดับ</Text>
        <View style={s.sortList}>
          {SORTS.map((o) => {
            const active = o.key === sort;
            return (
              <Press
                key={o.key}
                style={[s.sortOpt, active && s.sortOptOn]}
               
                onPress={() => {
                  setSort(o.key);
                  setSortOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
              >
                <View style={s.sortIcon}>
                  {active && <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 13 }]} />}
                  <Ionicons name={o.icon} size={18} color={active ? '#fff' : C.soft} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sortLabel, active && { color: C.brand }]}>{o.label}</Text>
                  <Text style={s.sortHint}>{o.hint}</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={22} color={C.brand} />}
              </Press>
            );
          })}
        </View>
      </BottomSheet>
    );
  }

  // -------------------- main --------------------

  const now = Date.now() + clockOffset;
  const tone = toneOf(status);
  const sortLabel = SORTS.find((o) => o.key === sort)?.label ?? '';
  const clearFilters = () => {
    setStatus('all');
    setRound(0);
    setSearch('');
  };

  function renderEmpty() {
    if (!items.length)
      return <EmptyState icon="checkmark-done" grad={STATUS.taken.grad} tint={C.okSoft} title="ไม่มีงานรอจัด" text="แจ้งจัดงานที่หน้าเช็คของส่งแล้วจะขึ้นที่นี่" />;
    if (status === 'open' && !view.q && round === 0)
      return (
        <EmptyState
          icon="people"
          grad={BRAND_GRAD}
          tint={C.brandSoft}
          title="ทุกงานมีคนรับแล้ว"
          text={'กดแท็บ "ทั้งหมด" หรือ "รับแล้ว" เพื่อดูงานที่มีคนรับไปแล้ว'}
          action={{ label: 'ดูงานทั้งหมด', icon: 'layers-outline', onPress: () => setStatus('all') }}
        />
      );
    return (
      <EmptyState
        icon="search"
        grad={['#A9B3C6', '#6B778E']}
        tint={C.track}
        title="ไม่พบรายการที่ค้นหา"
        text="ลองเปลี่ยนสถานะ รอบ หรือคำค้นหา"
        action={{ label: 'ล้างตัวกรอง', icon: 'close-circle-outline', onPress: clearFilters }}
      />
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['left', 'right']}>
      <LinearGradient colors={BG_GRAD} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

      {/* แผงตัวกรองด้านบน (ค้นหา + เรียง / สถานะ 6 ช่อง / รอบ) — ทุกแถวพอดีความกว้างจอ */}
      <View style={s.panel}>
        <View style={s.searchRow}>
          {/* collapsable={false}: กรอบเปลี่ยนเงาตอนโฟกัส ต้องไม่ให้ Fabric ย้าย TextInput (คีย์บอร์ดเด้งแล้วหุบ) */}
          <View collapsable={false} style={[s.search, searchFocus && s.searchOn]}>
            <Ionicons name="search" size={17} color={searchFocus ? C.brand : C.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setSearchFocus(false)}
              placeholder="ค้นหาเลขหน้างาน ชื่อโครงการ ลูกค้า"
              placeholderTextColor={C.muted}
              style={s.searchInput}
              autoCorrect={false}
              returnKeyType="search"
            />
            {!!search && (
              <Press onPress={() => setSearch('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="ล้างคำค้นหา">
                <Ionicons name="close-circle" size={18} color={C.faint} />
              </Press>
            )}
          </View>
          <Press style={s.sortBtn} onPress={() => setSortOpen(true)} accessibilityRole="button" accessibilityLabel={`เรียงลำดับ: ${sortLabel}`}>
            <Ionicons name="swap-vertical" size={19} color={sort === 'at' ? C.text : C.brand} />
            {sort !== 'at' && <View style={s.sortDot} />}
          </Press>
        </View>

        <StatusRail value={status} counts={view.counts} onChange={setStatus} />
        <RoundSwitch rounds={rounds} value={round} onChange={setRound} />
      </View>

      {loading ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 + insets.bottom }} scrollEnabled={false}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={s.cardWrap}>
              <SkeletonCard delay={i * 140} />
            </View>
          ))}
        </ScrollView>
      ) : loadError ? (
        <View style={s.center}>
          <EmptyState
            icon="cloud-offline"
            grad={STATUS.open.grad}
            tint={C.badSoft}
            title="โหลดข้อมูลไม่สำเร็จ"
            text={loadError}
            action={{ label: 'ลองใหม่', icon: 'refresh', onPress: () => load('first') }}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 28 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={C.brand} colors={[C.brand]} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* สรุป: สถานะที่ดูอยู่ + จำนวน · ป้ายอัปเดตสด */}
          <View style={s.summary}>
            <View style={{ flex: 1 }}>
              <View style={s.summaryTop}>
                <LinearGradient colors={tone.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.summaryDot} />
                <Text style={s.summaryTitle} numberOfLines={1}>
                  {tone.label}
                </Text>
                <Text style={[s.summaryNum, { color: tone.color }]}>{view.shown.length} รอบ</Text>
              </View>
              <Text style={s.summarySub} numberOfLines={1}>
                ค้างทั้งหมด {items.length} รอบ · {view.sites} หน้างาน · {sortLabel}
              </Text>
            </View>
            <LivePill live={live} running={onScreen} onPress={() => load('refresh')} />
          </View>

          {view.shown.length === 0
            ? renderEmpty()
            : view.shown.map((job, i) => (
                <Animated.View
                  key={keyOf(job)}
                  style={s.cardWrap}
                  entering={FadeInDown.delay(Math.min(i, 6) * 50).duration(ENTER.duration).easing(ENTER.easing)}
                  exiting={FadeOut.duration(160)}
                  layout={LinearTransition.duration(260).easing(Easing.out(Easing.cubic))}
                >
                  <JobCard
                    job={job}
                    isNew={fresh.has(keyOf(job))}
                    now={now}
                    busy={busy}
                    run={onScreen}
                    onSheet={() => openSheet(job)}
                    onGo={() => go(job)}
                    onRelease={() => release(job)}
                  />
                </Animated.View>
              ))}
        </ScrollView>
      )}

      {renderSheet()}
      {renderSortSheet()}
    </SafeAreaView>
  );
}

// -------------------- Styles --------------------

const TABULAR = { fontVariant: ['tabular-nums' as const] };

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center' },

  // แผงตัวกรอง — ขาว มุมล่างโค้ง ลอยเหนือรายการ
  panel: {
    zIndex: 2,
    backgroundColor: C.surface,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    boxShadow: '0 1px 2px rgba(30,45,90,0.05), 0 12px 28px rgba(30,45,90,0.08)',
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface2,
    borderWidth: 1.5,
    borderColor: C.lineSoft,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  searchOn: { backgroundColor: C.surface, borderColor: '#7EA4FF', boxShadow: '0 0 0 4px rgba(36,89,234,0.12)' },
  searchInput: { flex: 1, color: C.ink, fontSize: 14, padding: 0 },
  sortBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface2,
    borderWidth: 1.5,
    borderColor: C.lineSoft,
  },
  sortDot: { position: 'absolute', top: 9, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3D7F', borderWidth: 1.5, borderColor: C.surface },

  // แถบสถานะ 6 ช่อง — รางเทาอ่อน + ก้อนขาวลอย
  rail: { flexDirection: 'row', padding: RAIL_PAD, borderRadius: 20, backgroundColor: C.track },
  railPill: {
    position: 'absolute',
    top: RAIL_PAD,
    bottom: RAIL_PAD,
    left: RAIL_PAD,
    borderRadius: 16,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 5,
    boxShadow: '0 1px 2px rgba(30,45,90,0.08), 0 6px 16px rgba(30,45,90,0.12)',
  },
  railGlow: { width: 18, height: 3, borderRadius: 2 },
  railTab: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, paddingBottom: 4, gap: 1 },
  railTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  railDot: { width: 6, height: 6, borderRadius: 3 },
  railNum: { fontSize: 17, fontWeight: '800', lineHeight: 21, ...TABULAR },
  railLbl: { fontSize: 10.5, fontWeight: '700', lineHeight: 14, textAlign: 'center' },

  // สวิตช์รอบ
  seg: { flexDirection: 'row', height: 40, padding: SEG_PAD, borderRadius: 14, backgroundColor: C.track },
  segPill: {
    position: 'absolute',
    top: SEG_PAD,
    bottom: SEG_PAD,
    left: SEG_PAD,
    borderRadius: 11,
    backgroundColor: C.surface,
    boxShadow: '0 1px 2px rgba(30,45,90,0.08), 0 4px 10px rgba(30,45,90,0.10)',
  },
  segItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segDot: { width: 8, height: 8, borderRadius: 4 },
  segText: { fontSize: 12.5, fontWeight: '700' },

  // สรุป + ป้ายอัปเดตสด
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 16, marginBottom: 2 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  summaryDot: { width: 10, height: 10, borderRadius: 5 },
  summaryTitle: { flexShrink: 1, fontSize: 15.5, fontWeight: '800', color: C.ink },
  summaryNum: { fontSize: 13, fontWeight: '800', ...TABULAR },
  summarySub: { marginTop: 3, fontSize: 11.5, color: C.muted, fontWeight: '500' },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 50,
    backgroundColor: C.surface,
    paddingLeft: 10,
    paddingRight: 11,
    paddingVertical: 6,
    boxShadow: '0 1px 2px rgba(30,45,90,0.06), 0 4px 10px rgba(30,45,90,0.06)',
  },
  liveOff: { backgroundColor: C.badSoft },
  liveDotBox: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  liveRing: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 11.5, fontWeight: '800', color: '#0E9F6E' },

  // การ์ด
  cardWrap: { marginHorizontal: 12, marginTop: 12 },
  card: {
    backgroundColor: C.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#EDF0F7',
    padding: 14,
    gap: 12,
    boxShadow: '0 1px 2px rgba(30,45,90,0.04), 0 8px 22px rgba(30,45,90,0.07)',
  },
  cardNew: { borderColor: '#FFC2D4', boxShadow: '0 0 0 3px rgba(255,61,127,0.10), 0 12px 28px rgba(255,61,127,0.16)' },
  head: { flexDirection: 'row', gap: 12 },
  round: { alignItems: 'center', justifyContent: 'center' },
  roundSmall: { fontSize: 9.5, fontWeight: '700', lineHeight: 12, color: 'rgba(255,255,255,0.9)' },
  roundNo: { fontWeight: '900', color: '#FFFFFF', ...TABULAR },
  headMain: { flex: 1, gap: 4, paddingTop: 1 },
  siteLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  site: { flexShrink: 1, fontSize: 13, fontWeight: '800', color: C.brand, letterSpacing: 0.2 },
  siteKicker: { fontWeight: '600', color: C.muted, letterSpacing: 0 },
  name: { color: C.ink, fontSize: 15.5, fontWeight: '700', lineHeight: 22 },
  newBadge: { borderRadius: 50, paddingHorizontal: 9, paddingVertical: 2, boxShadow: '0 3px 8px rgba(255,61,127,0.35)' },
  newBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, backgroundColor: C.track, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 10.5, fontWeight: '700', color: C.soft },

  // กล่องสถานะ + หลอด (พื้นกลาง ไม่ทาสี)
  state: { borderRadius: 16, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.lineSoft, paddingHorizontal: 12, paddingVertical: 11, gap: 10 },
  stateTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stateLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  stateIcon: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stateText: { fontSize: 13.5, fontWeight: '800' },
  stateCount: { fontSize: 12, fontWeight: '600', color: C.muted, ...TABULAR },
  stateNum: { fontSize: 15, fontWeight: '900', color: C.ink },
  stateOf: { fontSize: 12.5, fontWeight: '700', color: C.soft },
  stateEmpty: { fontSize: 12, fontWeight: '600', color: C.muted },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#E6EAF2', overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 5, overflow: 'hidden' },
  trackShine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 48 },
  pct: { minWidth: 38, textAlign: 'right', fontSize: 13, fontWeight: '900', ...TABULAR },

  who: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  company: { maxWidth: '100%', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  companyMark: { fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },
  customer: { flexShrink: 1, fontSize: 12.5, color: C.soft, lineHeight: 18 },

  infoBox: { gap: 7, paddingTop: 2 },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  infoIcon: { width: 22, height: 19, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { width: 62, fontSize: 12, color: C.muted, fontWeight: '600', lineHeight: 19 },
  infoValue: { flex: 1, fontSize: 12.5, color: C.text, fontWeight: '600', lineHeight: 19 },
  infoSub: { fontSize: 11.5, color: C.muted, fontWeight: '500' },
  age: { borderRadius: 50, backgroundColor: C.track, paddingHorizontal: 8, paddingVertical: 2 },
  ageText: { fontSize: 10.5, fontWeight: '700', color: C.soft },

  taker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.lineSoft,
    backgroundColor: C.surface2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  avatarText: { color: '#fff', fontWeight: '800' },
  takerKicker: { fontSize: 10.5, fontWeight: '800', color: C.muted, letterSpacing: 0.2 },
  takerName: { fontSize: 13, fontWeight: '700', color: C.ink, marginTop: 1 },
  takerAt: { fontSize: 11.5, fontWeight: '500', color: C.muted },
  release: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#FFC9D5',
    backgroundColor: C.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  releaseText: { fontSize: 12, fontWeight: '800', color: C.bad },

  actions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14 },
  btnPrimary: { borderWidth: 0, boxShadow: '0 8px 18px rgba(36,89,234,0.30)' },
  btnOutline: { backgroundColor: C.surface, borderColor: C.brandLine },
  btnSoft: { backgroundColor: C.brandSoft, borderColor: C.brandSoft },
  btnGhost: { backgroundColor: C.track, borderColor: C.track },
  btnDim: { opacity: 0.55 },
  btnText: { fontSize: 14, fontWeight: '800' },

  // โครงการ์ดระหว่างโหลด
  skCard: { overflow: 'hidden' },
  sk: { backgroundColor: C.track, borderRadius: 6 },
  sheen: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 220 },

  // หน้าว่าง
  empty: { alignItems: 'center', paddingTop: 44, paddingBottom: 32, paddingHorizontal: 32, gap: 8 },
  emptyHalo: { width: 96, height: 96, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16.5, fontWeight: '800', color: C.ink },
  emptyText: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    borderRadius: 50,
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    boxShadow: '0 1px 2px rgba(30,45,90,0.06), 0 6px 14px rgba(30,45,90,0.08)',
  },
  emptyBtnText: { fontSize: 13, fontWeight: '800', color: C.brand },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  // bottom sheet
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,14,30,0.55)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -SHEET_EXTRA,
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    boxShadow: '0 -10px 30px rgba(8,14,30,0.18)',
  },
  grip: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#D5DBE5', marginTop: 9, marginBottom: 4 },

  // ใบงาน
  shHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  shKicker: { fontSize: 11.5, fontWeight: '700', color: C.muted },
  shTitle: { fontSize: 16, fontWeight: '800', color: C.ink, lineHeight: 22, marginTop: 1 },
  closeBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  shMeta: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 8 },
  shCount: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 50, backgroundColor: C.warnSoft, paddingLeft: 4, paddingRight: 11, paddingVertical: 4 },
  shCountIcon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  shCountText: { fontSize: 12, fontWeight: '800', color: C.warn },
  basis: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: 12, backgroundColor: C.surface2, paddingHorizontal: 10, paddingVertical: 8 },
  basisText: { flex: 1, fontSize: 11, color: C.soft, lineHeight: 16 },
  tHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.lineSoft,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  th: { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 0.3 },
  tSec: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  tSecPill: { alignSelf: 'flex-start', borderRadius: 50, backgroundColor: C.warnSoft, paddingHorizontal: 10, paddingVertical: 3 },
  tSecText: { fontSize: 11.5, fontWeight: '800', color: C.warn },
  tr: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  trSub: { backgroundColor: '#FAFBFE' },
  td: { fontSize: 13.5, color: C.ink, lineHeight: 20 },
  tdNo: { color: C.faint, fontWeight: '700', ...TABULAR },
  tdQty: { fontSize: 14.5, fontWeight: '900', textAlign: 'right', color: C.brand, ...TABULAR },
  tdUnit: { color: C.soft, textAlign: 'center', fontSize: 12.5 },
  colNo: { width: 30 },
  colName: { flex: 1, paddingRight: 8 },
  colQty: { width: 66, textAlign: 'right' },
  colUnit: { width: 56, textAlign: 'center' },
  subMark: { color: C.faint },
  subParent: { fontSize: 11, color: C.muted, marginTop: 2 },
  shNote: { alignItems: 'center', gap: 12, paddingVertical: 44, paddingHorizontal: 24 },
  shNoteIcon: { width: 60, height: 60, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  shNoteText: { fontSize: 13.5, color: C.soft, textAlign: 'center', lineHeight: 20, fontWeight: '600' },
  shFoot: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.lineSoft },

  // เรียงลำดับ
  sortTitle: { fontSize: 17, fontWeight: '800', color: C.ink, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  sortList: { paddingHorizontal: 12, gap: 4 },
  sortOpt: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 11 },
  sortOptOn: { backgroundColor: C.brandSoft },
  sortIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  sortLabel: { fontSize: 14.5, fontWeight: '700', color: C.ink },
  sortHint: { fontSize: 12, color: C.muted, marginTop: 2 },
});
