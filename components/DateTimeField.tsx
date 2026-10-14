/**
 * DateTimeField.tsx — ปุ่มเลือกวันที่/เวลาแบบมาตรฐานเดียวกันทั้งแอป
 * ------------------------------------------------------------------
 * แทนที่ช่องพิมพ์วันที่เอง (TextInput "วว/ดด/ปปปป") และรูปแบบวันที่เต็ม
 * "5 กันยายน 2569" ด้วย:
 *  - ปุ่มกดเปิดปฏิทินจริง (@react-native-community/datetimepicker) แทนพิมพ์เอง
 *  - แสดงผล "05/09/2026" (DD/MM/YYYY ปี ค.ศ. แบบเว็บ) แทนชื่อเดือนเต็ม — รูปแบบเดียวทั้งแอป
 *  - ปุ่มเลือกเวลาหน้าตา/พฤติกรรมเดียวกับปุ่มเลือกวันที่ (กดแล้วมีตัวเลือกเวลาให้เลือก)
 *
 * ใช้ร่วมกันทุกหน้าที่มีการเลือกวันที่/เวลา — ห้าม copy โค้ด date-picker แยกไปเขียนเองต่อหน้า
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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

function dateToYmd(d: Date): string {
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

function parseYmdToDate(ymd?: string): Date {
  if (ymd) {
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  }
  return new Date();
}

function parseHmToDate(hm?: string): Date {
  const d = new Date();
  if (hm) {
    const m = hm.match(/^(\d{1,2}):(\d{2})/);
    if (m) d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  }
  return d;
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

/** ปุ่มเลือกวันที่ — กดแล้วเปิดปฏิทินจริงเสมอ ไม่ใช่ช่องให้พิมพ์เอง */
export function DateField({ value, onChange, placeholder = 'เลือกวันที่', minimumDate, maximumDate, disabled, style }: DateFieldProps) {
  const [open, setOpen] = useState(false);

  function handleValueChange(_event: DateTimePickerChangeEvent, selected: Date) {
    if (Platform.OS === 'android') setOpen(false);
    onChange(dateToYmd(selected));
    if (Platform.OS === 'ios') setOpen(false);
  }

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
      {open && (
        <DateTimePicker
          value={parseYmdToDate(value)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onValueChange={handleValueChange}
          onDismiss={() => setOpen(false)}
        />
      )}
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
});
