/**
 * DateTimeField.tsx — ปุ่มเลือกวันที่/เวลาแบบมาตรฐานเดียวกันทั้งแอป
 * ------------------------------------------------------------------
 * แทนที่ช่องพิมพ์วันที่เอง (TextInput "วว/ดด/ปปปป") และรูปแบบวันที่เต็ม
 * "5 กันยายน 2569" ด้วย:
 *  - ปุ่มกดเปิดปฏิทินจริงแทนพิมพ์เอง — ปฏิทินแบบหน้า ManagerSales (CalendarPickerModal) ทั้งแอป
 *  - แสดงผล "05/09/2026" (DD/MM/YYYY ปี ค.ศ. แบบเว็บ) แทนชื่อเดือนเต็ม — รูปแบบเดียวทั้งแอป
 *  - ปุ่มเลือกเวลาหน้าตา/พฤติกรรมเดียวกับปุ่มเลือกวันที่ (ตัวเลือกเวลายังเป็นของเครื่อง @react-native-community/datetimepicker)
 *
 *  - หน้าที่มีปุ่มเปิดปฏิทินหน้าตาของตัวเอง ใช้ CalendarPickerModal ตรงๆ แทน <DateTimePicker mode="date">
 *
 * ใช้ร่วมกันทุกหน้าที่มีการเลือกวันที่/เวลา — ห้าม copy โค้ด date-picker แยกไปเขียนเองต่อหน้า
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { ReactNode, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// -------------------- Format helpers --------------------

/** YYYY-MM-DD (หรือ YYYY-MM-DD HH:mm:ss) -> "05/09/2026" (DD/MM/YYYY ปี ค.ศ.) — รูปแบบวันที่เดียวทั้งแอป
 *  ตรงกับหน้าเว็บ (เดิมเป็น "5/9/69" พ.ศ. 2 หลัก ซึ่งทำให้การ์ดกับหน้ารายละเอียดใช้คนละรูปแบบ)
 *  ชื่อฟังก์ชันคงไว้เหมือนเดิม เพราะถูก import อยู่ทั่วแอป */
export function formatShortThaiDate(ymd?: string | null): string {
  if (!ymd) return '-';
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(ymd);
  const [, yyyy, mm, dd] = m;
  if (yyyy === '0000') return '-';
  return `${dd}/${mm}/${yyyy}`;
}

/** "YYYY-MM-DD HH:MM:SS" (หรือแค่ date) -> "05/09/2026 14:30 น." — ใช้กับฟิลด์ audit-trail ทั่วแอป
 * (closed_at, approved_at, received_at ฯลฯ) แทน field "_thai" ของเซิร์ฟเวอร์ที่มักเป็นชื่อเดือนเต็ม */
export function formatShortThaiDateTime(dt?: string | null): string {
  if (!dt) return '-';
  const s = String(dt);
  const datePart = formatShortThaiDate(s);
  if (datePart === '-') return '-';
  const timeMatch = s.match(/(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!timeMatch) return datePart;
  return `${datePart} ${timeMatch[1]}:${timeMatch[2]} น.`;
}

/** "HH:mm" หรือ "HH:mm:ss" -> "14:30 น." */
export function formatShortTime(hm?: string | null): string {
  if (!hm) return '-';
  const m = String(hm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(hm);
  return `${m[1].padStart(2, '0')}:${m[2]} น.`;
}

/** "05/09/2026" (หรือ "5/9/26", "5/9/2569") -> "2026-09-05" (ส่งเข้า API เสมอเป็น ค.ศ.) */
export function parseShortThaiDate(input: string): string | undefined {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return undefined;
  const [, dd, mm, yy] = m;
  let y = parseInt(yy, 10);
  if (y < 100) y += 2000; // เลข 2 หลัก -> ค.ศ. (20xx) ตามรูปแบบแสดงผลปัจจุบัน
  if (y > 2400) y -= 543; // ยังรับ พ.ศ. 4 หลักได้ -> แปลงเป็น ค.ศ.
  const mNum = parseInt(mm, 10);
  const dNum = parseInt(dd, 10);
  if (mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return undefined;
  return `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/** Date -> "YYYY-MM-DD" ตามเวลาเครื่อง (ไม่ผ่าน toISOString ที่เลื่อนวันใน UTC+7) */
export function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateToHm(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** "YYYY-MM-DD" -> Date (เที่ยงคืนเวลาเครื่อง) · ว่าง/รูปแบบผิด = null — ใช้เป็น value ของ CalendarPickerModal */
export function ymdToDate(ymd?: string | null): Date | null {
  const m = String(ymd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || m[1] === '0000') return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function parseHmToDate(hm?: string): Date {
  const d = new Date();
  if (hm) {
    const m = hm.match(/^(\d{1,2}):(\d{2})/);
    if (m) d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  }
  return d;
}

// -------------------- CalendarPickerModal --------------------

const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const CAL_PRIMARY = '#2563eb'; // สีหลักของหน้า ManagerSales

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export interface CalendarPickerModalProps {
  /** วันที่ที่ไฮไลต์อยู่ — null = ยังไม่เลือก (เปิดที่เดือนปัจจุบัน) */
  value: Date | null;
  /** แตะเลือกวันแล้ว — ปฏิทินเรียก onClose ต่อให้เอง ไม่ต้องปิดเอง */
  onChange: (date: Date) => void;
  onClose: () => void;
  minimumDate?: Date;
  maximumDate?: Date;
  /** ไม่ส่ง = เปิดอยู่ตลอดที่ render (ใช้แบบ {show && <CalendarPickerModal .../>} แทน <DateTimePicker> เดิมได้ตรงตัว) */
  visible?: boolean;
}

/** ปฏิทินเลือกวันที่แบบหน้า ManagerSales — หัวสีน้ำเงิน ‹ › เลื่อนเดือน, แตะชื่อเดือน/ปีเพื่อกระโดดเลือก,
 *  วันที่เลือกเป็นวงกลมทึบ · ใช้แทนปฏิทินของเครื่อง (DateTimePicker mode="date") ทั้งแอป
 *  Modal อยู่ในตำแหน่งที่วางคอมโพเนนต์นี้ — วางไว้ในป๊อปอัพ/แผ่นตัวกรองที่เปิดมัน จะซ้อนอยู่บนสุดเสมอ */
export function CalendarPickerModal({ value, onChange, onClose, minimumDate, maximumDate, visible = true }: CalendarPickerModalProps) {
  // เดือนที่กำลังดูในปฏิทิน (วันที่ 1) — แยกจากค่าที่เลือก เลื่อนดูเดือนอื่นได้โดยค่ายังไม่เปลี่ยน
  const [viewMonth, setViewMonth] = useState(() => {
    const base = value ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [view, setView] = useState<'day' | 'month' | 'year'>('day');

  // เปิดใหม่ทุกครั้ง -> กลับไปเดือนของค่าที่เลือก (กรณีคุม visible เองแล้วคอมโพเนนต์ค้างอยู่)
  useEffect(() => {
    if (!visible) return;
    const base = value ?? new Date();
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setView('day');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function changeMonth(offset: number) {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + offset, 1));
  }

  function isOutOfRange(d: Date) {
    return (!!minimumDate && d < startOfDay(minimumDate)) || (!!maximumDate && d > startOfDay(maximumDate));
  }

  function renderDays() {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const cells: ReactNode[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(<View key={`empty-${i}`} style={styles.calDayEmpty} />);
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const isSelected = !!value && value.getFullYear() === year && value.getMonth() === month && value.getDate() === day;
      const off = isOutOfRange(d);
      cells.push(
        <TouchableOpacity
          key={day}
          disabled={off}
          onPress={() => {
            // คงเวลาของ value ไว้แบบ DateTimePicker mode="date" (ไม่มีค่า = เวลาตอนนี้ เหมือนเดิมที่หน้าต่างๆ ส่ง `x || new Date()`)
            // บางหน้าเก็บวัน+เวลาใน Date ตัวเดียว (BossCommand) และหลายหน้าแปลงด้วย toISOString — คืนเที่ยงคืนจะเลื่อนไปวันก่อนหน้า (UTC+7)
            const base = value ?? new Date();
            onChange(new Date(year, month, day, base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds()));
            onClose();
          }}
          style={[styles.calDay, isSelected && styles.calDaySelected]}
        >
          <Text style={[styles.calDayText, isSelected && styles.calDayTextSelected, off && styles.calDayTextOff]}>{day}</Text>
        </TouchableOpacity>,
      );
    }
    return <View style={styles.calGrid}>{cells}</View>;
  }

  function renderMonths() {
    return (
      <View style={styles.yearGrid}>
        {TH_MONTHS_FULL.map((m, i) => (
          <TouchableOpacity
            key={m}
            onPress={() => {
              setViewMonth(new Date(viewMonth.getFullYear(), i, 1));
              setView('day');
            }}
            style={styles.yearItem}
          >
            <Text style={[styles.yearText, viewMonth.getMonth() === i && styles.yearTextActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderYears() {
    // ±5 ปีจากปีนี้แบบ ManagerSales — ขยายให้ครอบปีที่กำลังดูด้วย (เช่นวันสิ้นสุดค้ำประกันที่ไกลกว่า 5 ปี)
    const current = new Date().getFullYear();
    const viewing = viewMonth.getFullYear();
    const years: number[] = [];
    for (let y = Math.min(current, viewing) - 5; y <= Math.max(current, viewing) + 5; y++) years.push(y);
    return (
      <ScrollView style={{ maxHeight: 300 }}>
        <View style={styles.yearGrid}>
          {years.map((y) => (
            <TouchableOpacity
              key={y}
              onPress={() => {
                setViewMonth(new Date(y, viewMonth.getMonth(), 1));
                setView('day');
              }}
              style={styles.yearItem}
            >
              <Text style={[styles.yearText, viewing === y && styles.yearTextActive]}>{y}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.calOverlay}>
        <View style={styles.calCard}>
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calNavBtn}>
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setView('month')}>
                <Text style={styles.calTitle}>{TH_MONTHS_FULL[viewMonth.getMonth()]}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setView('year')}>
                <Text style={styles.calTitle}> {viewMonth.getFullYear()}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calNavBtn}>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={{ padding: 15 }}>
            {view === 'day' && (
              <>
                <View style={styles.calWeekRow}>
                  {TH_WEEKDAYS_SHORT.map((d, i) => (
                    <Text key={i} style={styles.calWeekText}>
                      {d}
                    </Text>
                  ))}
                </View>
                {renderDays()}
              </>
            )}
            {view === 'month' && renderMonths()}
            {view === 'year' && renderYears()}
          </View>
          <TouchableOpacity style={styles.calCloseBtn} onPress={onClose}>
            <Text style={styles.calCloseText}>ปิด</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// -------------------- DateField --------------------

export interface DateFieldProps {
  /** ค่าปัจจุบัน รูปแบบ YYYY-MM-DD หรือ '' ถ้ายังไม่เลือก */
  value: string;
  /** เรียกทันทีที่เลือกวันที่ใหม่ — ได้ค่าเป็น YYYY-MM-DD (ส่งเข้า API ได้ตรงๆ) */
  onChange: (ymd: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
  style?: any;
}

/** ปุ่มเลือกวันที่ — กดแล้วเปิดปฏิทินแบบหน้า ManagerSales (CalendarPickerModal) ไม่ใช่ช่องให้พิมพ์เอง */
export function DateField({ value, onChange, placeholder = 'เลือกวันที่', minimumDate, maximumDate, disabled, style }: DateFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed, disabled && styles.fieldDisabled, style]}
      >
        <Ionicons name="calendar-outline" size={15} color="#4338ca" />
        <Text style={[styles.fieldText, !value && styles.fieldPlaceholder]} numberOfLines={1}>
          {value ? formatShortThaiDate(value) : placeholder}
        </Text>
      </Pressable>
      <CalendarPickerModal
        visible={open}
        value={ymdToDate(value)}
        onChange={(d) => onChange(dateToYmd(d))}
        onClose={() => setOpen(false)}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
      />
    </View>
  );
}

// -------------------- TimeField --------------------

export interface TimeFieldProps {
  /** ค่าปัจจุบัน รูปแบบ HH:mm หรือ '' ถ้ายังไม่เลือก */
  value: string;
  onChange: (hm: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: any;
}

/** ปุ่มเลือกเวลา — หน้าตา/พฤติกรรมเดียวกับ DateField เป๊ะ ต่างแค่เปิดตัวเลือกเวลาแทนวันที่ */
export function TimeField({ value, onChange, placeholder = 'เลือกเวลา', disabled, style }: TimeFieldProps) {
  const [open, setOpen] = useState(false);

  function handleValueChange(_event: DateTimePickerChangeEvent, selected: Date) {
    if (Platform.OS === 'android') setOpen(false);
    onChange(dateToHm(selected));
    if (Platform.OS === 'ios') setOpen(false);
  }

  return (
    <View>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed, disabled && styles.fieldDisabled, style]}
      >
        <Ionicons name="time-outline" size={15} color="#4338ca" />
        <Text style={[styles.fieldText, !value && styles.fieldPlaceholder]} numberOfLines={1}>
          {value ? formatShortTime(value) : placeholder}
        </Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={parseHmToDate(value)}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onValueChange={handleValueChange}
          onDismiss={() => setOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  fieldPressed: { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' },
  fieldDisabled: { opacity: 0.5 },
  fieldText: { fontSize: 12, color: '#0f172a', fontWeight: '600' },
  fieldPlaceholder: { color: '#94a3b8', fontWeight: '400' },

  // ปฏิทินของ CalendarPickerModal — ค่าเดียวกับ "ปฏิทินเลือกวันที่" ใน ManagerSales.tsx
  calOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center' },
  calCard: { width: 320, maxWidth: '92%', backgroundColor: '#ffffff', borderRadius: 16 },
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: CAL_PRIMARY,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  calTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  calNavBtn: { padding: 5 },
  calWeekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 5 },
  calWeekText: { color: '#475569', fontSize: 14, width: 35, textAlign: 'center' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  calDay: { width: '14.28%', height: 40, justifyContent: 'center', alignItems: 'center' },
  calDayText: { fontSize: 16, color: '#0f172a' },
  calDayEmpty: { width: '14.28%', height: 40 },
  calDaySelected: { backgroundColor: CAL_PRIMARY, borderRadius: 20 },
  calDayTextSelected: { color: '#fff', fontWeight: '700' },
  calDayTextOff: { color: '#cbd5e1' },
  calCloseBtn: { alignSelf: 'center', padding: 10, marginTop: 10 },
  calCloseText: { color: '#666' },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  yearItem: { padding: 15, width: '30%', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 8 },
  yearText: { fontSize: 16, color: '#0f172a' },
  yearTextActive: { color: CAL_PRIMARY, fontWeight: 'bold' },
});
