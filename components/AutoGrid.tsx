/**
 * AutoGrid — จัดปุ่ม/การ์ดเป็นบล็อกแทนแถบเลื่อนซ้ายขวา
 *   1–4 รายการ  -> ตาราง 2 คอลัมน์ (2×2) — จำนวนคี่ ช่องสุดท้ายยืดเต็มแถว
 *   5 รายการขึ้นไป -> บล็อกยาวเต็มแถว เรียงลงมาทีละรายการ
 * รายการที่เป็น null/false (เงื่อนไขไม่ผ่าน) ไม่ถูกนับ
 */
import { Children, ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

export default function AutoGrid({
  children,
  style,
  twoColumns = false,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** บังคับ 2 คอลัมน์เสมอ แม้มี 5 รายการขึ้นไป (เช่น แถบบริษัทหน้าแนส) */
  twoColumns?: boolean;
}) {
  const items = Children.toArray(children);
  const full = !twoColumns && items.length >= 5;
  return (
    // columnGap: 0 ทับ gap ของ style ที่ส่งมา (สไตล์แถบเลื่อนเดิมมี gap) ไม่งั้น 48.8% × 2 + gap เกินแถวแล้วตกบรรทัด
    <View style={[styles.grid, style, { columnGap: 0, rowGap: 8 }]}>
      {items.map((child, i) => {
        // จำนวนคี่: ช่องสุดท้ายที่เหลือเดี่ยวยืดเต็มแถว ไม่ปล่อยครึ่งแถวว่าง
        const lastOdd = !full && items.length % 2 === 1 && i === items.length - 1;
        return (
          <View key={i} style={full || lastOdd ? styles.full : styles.half}>
            {child}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  half: { width: '48.8%' },
  full: { width: '100%' },
});
