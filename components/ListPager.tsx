/**
 * ListPager.tsx — แถบเปลี่ยนหน้าแบบตารางเว็บ (หน้าละ 30 รายการ)
 * ------------------------------------------------------------------
 * ใช้กับรายการยาว ๆ (แดชบอร์ดเอกสาร / แดชบอร์ดโครงการ / บัญชีลูกหนี้) ให้บนจอมีไม่เกิน 1 หน้าเสมอ
 * เหมือนแถบแบ่งหน้าของเว็บ (#docPaginationBar / #projPaginationBar) — เดิมแอปเลื่อนแล้วต่อท้ายไปเรื่อย ๆ
 * จนรายการค้างเป็นหลักร้อย เครื่องหน่วง
 *
 * ใช้ร่วมกันทุกหน้าที่มีรายการแบ่งหน้า — ห้าม copy ไปเขียนแยกต่อหน้า
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  page: number; // หน้าปัจจุบัน เริ่มที่ 1
  pageSize: number;
  total: number; // จำนวนทั้งหมดตามตัวกรอง
  loading?: boolean; // กำลังโหลดหน้าใหม่ — ปุ่มกดไม่ได้ชั่วคราว
  unit?: string; // คำนับ เช่น 'เอกสาร' / 'โครงการ'
  onChange: (page: number) => void;
};

/** จำนวนหน้าทั้งหมด (อย่างน้อย 1) — ให้หน้าจอใช้คำนวณหน้าสุดท้ายแบบเดียวกับแถบนี้ */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export default function ListPager({ page, pageSize, total, loading, unit = 'รายการ', onChange }: Props) {
  if (total <= 0) return null;
  const totalPages = pageCount(total, pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;
  const fmt = (n: number) => n.toLocaleString('en-US');

  return (
    <View style={styles.wrap}>
      <Text style={styles.info}>
        แสดง {fmt(from)}–{fmt(to)} จาก {fmt(total)} {unit}
      </Text>
      {totalPages > 1 && (
        <View style={styles.row}>
          <Pressable style={[styles.iconBtn, !canPrev && styles.btnOff]} disabled={!canPrev} onPress={() => onChange(1)} accessibilityLabel="หน้าแรก" hitSlop={4}>
            <Ionicons name="play-skip-back" size={14} color={canPrev ? '#4f46e5' : '#cbd5e1'} />
          </Pressable>
          <Pressable style={[styles.btn, !canPrev && styles.btnOff]} disabled={!canPrev} onPress={() => onChange(page - 1)}>
            <Ionicons name="chevron-back" size={15} color={canPrev ? '#4f46e5' : '#cbd5e1'} />
            <Text style={[styles.btnText, !canPrev && styles.btnTextOff]}>ก่อนหน้า</Text>
          </Pressable>
          <View style={styles.pageBox}>
            {loading ? <ActivityIndicator size="small" color="#4f46e5" /> : <Text style={styles.pageText}>หน้า {fmt(page)} / {fmt(totalPages)}</Text>}
          </View>
          <Pressable style={[styles.btn, !canNext && styles.btnOff]} disabled={!canNext} onPress={() => onChange(page + 1)}>
            <Text style={[styles.btnText, !canNext && styles.btnTextOff]}>ถัดไป</Text>
            <Ionicons name="chevron-forward" size={15} color={canNext ? '#4f46e5' : '#cbd5e1'} />
          </Pressable>
          <Pressable style={[styles.iconBtn, !canNext && styles.btnOff]} disabled={!canNext} onPress={() => onChange(totalPages)} accessibilityLabel="หน้าสุดท้าย" hitSlop={4}>
            <Ionicons name="play-skip-forward" size={14} color={canNext ? '#4f46e5' : '#cbd5e1'} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 16, alignItems: 'center', gap: 8 },
  info: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, height: 36, borderRadius: 10,
    borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff',
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff',
  },
  btnOff: { borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  btnText: { fontSize: 12.5, fontWeight: '700', color: '#4f46e5' },
  btnTextOff: { color: '#cbd5e1' },
  pageBox: { minWidth: 92, height: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  pageText: { fontSize: 12.5, fontWeight: '700', color: '#334155' },
});
