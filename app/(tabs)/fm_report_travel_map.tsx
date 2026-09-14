/**
 * TravelAllowanceMapScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของแท็บ "แผนที่พิกัด" ในหน้า fm_report_travel.php — แผนที่จุด GPS ที่จับตอน
 * กรอกใบเบิกเบี้ยเลี้ยง (เฉพาะเกณฑ์ที่ตั้งค่าไว้ว่า "ต้องจับพิกัด GPS")
 * เชื่อมจากปุ่ม "ดูแผนที่จุดเบิก GPS" ในหน้า TravelAllowanceScreen
 *
 * สถานะไฟล์นี้: UI MOCKUP — พิกัด/ข้อมูลจุดเป็น MOCK_POINTS ด้านล่าง
 *
 * ตรงกับพฤติกรรมจริงจากแท็บแผนที่ของต้นฉบับ (initTravelMap/drawMapPoints/mapPopupHtml ฯลฯ):
 *  - แถบบนแผนที่: ปุ่มกลับไปหน้ารายการ, "รอบ X · N จุด", ถ้ามีเกณฑ์ต้องจับพิกัดจะโชว์
 *    "ต้องจับ Y รายการ" + ป้าย "ขาด Z"(แดง) หรือ "ครบแล้ว"(เขียว)
 *  - ตัวกรอง: ค้นหาคนขับ/เส้นทาง, คนขับ, เกณฑ์การเบิก, ช่วงวันที่ (ล็อกไว้ในรอบที่กำลังดู),
 *    ปุ่มล้างตัวกรอง — กรองแบบ AND ทั้งหมดตรงกับ matchMapPoint()
 *  - หมุด = สีตามเกณฑ์การเบิก (แจกสีอัตโนมัติทีละเกณฑ์ตรงกับ buildMapFilterOptions()), มีตัวอักษร
 *    ย่อชื่อคนขับตรงกลาง (ต้นฉบับใช้รูปคนขับจริงถ้ามี — mockup นี้ใช้ตัวอักษรย่อเป็นหลัก)
 *  - แตะหมุด/การ์ด -> รายละเอียดครบ: ชื่อคนขับ, วันเวลา, เส้นทาง, ยอดเงิน, เวลาที่จับพิกัด,
 *    ป้ายเกณฑ์ที่ใช้, ปุ่ม "เปิดใน Google Maps" + "เปิดใบเบิก" (ตรงกับ mapPopupHtml())
 *  - Legend มุมล่างซ้าย โชว์สีของแต่ละเกณฑ์
 *  - 2 สถานะว่าง: "ยังไม่มีพิกัดในรอบนี้" (ไม่มีจุดเลย) กับ "ไม่พบจุดที่ตรงกับตัวกรอง" (มีจุดแต่กรองแล้วไม่เจอ)
 *
 * ที่ปรับให้เหมาะกับมือถือ:
 *  - ใช้ react-native-maps (มีอยู่แล้วใน package.json ของโปรเจกต์) แทน Leaflet.js
 *  - หมุดใช้ตัวอักษรย่อ+สีเกณฑ์เป็นหลัก แทนที่จะพยายามโหลดรูปคนขับจริงพร้อม fallback หลายชั้น
 *    แบบต้นฉบับ (ของจริงมี logic ตรวจรูปขาวโล่ง/โลโก้บริษัทด้วย — ซับซ้อนเกินความจำเป็นของ mockup)
 *  - Android ต้องตั้งค่า Google Maps API key ใน app.json (expo.android.config.googleMaps.apiKey)
 *    ถึงจะเห็นแผนที่พื้นหลังจริง ไม่งั้นจะขึ้นตารางเทาว่างเปล่า
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons react-native-maps
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Linking, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ Config
import { API_BASE } from '../../constants/config';

// ====================================================================
// Types
// ====================================================================

interface MapPoint {
  id: string;
  driver: string;
  driverId: number;
  date: string; // YYYY-MM-DD ไว้เทียบกรอง
  dateText: string; // ข้อความไทยไว้โชว์
  time: string;
  route: string;
  rateKey: string;
  label: string;
  amount: number;
  lat: number;
  lng: number;
  at: string; // เวลาที่จับพิกัด
}

export interface TravelAllowanceMapScreenProps {
  startDate?: string;
  endDate?: string;
  cycleLabel?: string;
  onBack?: () => void;
  onOpenSubmission?: (driverId: number) => void;
}

// ====================================================================
// Mock data — จุดรอบ จ.ชลบุรี/กรุงเทพฯ ให้พอเห็นภาพบนแผนที่จริง
// ====================================================================

const MAP_PALETTE = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

const MOCK_POINTS: MapPoint[] = [
  { id: 'p1', driver: 'วิชัย ใจดี', driverId: 1, date: '2569-08-17', dateText: '17 สิงหาคม 2569', time: '14:20', route: 'ชลบุรี', rateKey: 'hotel', label: 'นอนโรงแรม (210)', amount: 210, lat: 13.3611, lng: 100.9847, at: '14:25' },
  { id: 'p2', driver: 'สมชาย รักไทย', driverId: 2, date: '2569-09-03', dateText: '3 กันยายน 2569', time: '08:35', route: 'คลังสินค้าหลัก - โครงการ TJC69-030', rateKey: '1-200', label: '1-200 กม.', amount: 80, lat: 13.7367, lng: 100.5231, at: '08:40' },
  { id: 'p3', driver: 'สมชาย รักไทย', driverId: 2, date: '2569-09-05', dateText: '5 กันยายน 2569', time: '07:10', route: 'คลังสินค้าหลัก - จ.ขอนแก่น', rateKey: '200-500', label: '200-500 กม.', amount: 160, lat: 16.4419, lng: 102.836, at: '07:15' },
  { id: 'p4', driver: 'อรทัย ใจงาม', driverId: 4, date: '2569-09-06', dateText: '6 กันยายน 2569', time: '11:00', route: 'สมุทรปราการ', rateKey: 'vehicle', label: 'นอนรถ/นอนบ้านพัก', amount: 310, lat: 13.5991, lng: 100.5998, at: '11:05' },
  { id: 'p5', driver: 'กานดา สุขใจ', driverId: 6, date: '2569-09-08', dateText: '8 กันยายน 2569', time: '09:40', route: 'คลังสินค้าหลัก - จ.นครราชสีมา', rateKey: '500+', label: '500 กม. ขึ้นไป', amount: 210, lat: 14.9799, lng: 102.0977, at: '09:45' },
];

let uidCounter = 1;
function uid(): string {
  uidCounter += 1;
  return `pt_${Date.now()}_${uidCounter}`;
}
void uid; // เผื่อใช้ตอนต่อ backend จริง (สร้าง key ให้จุดที่โหลดมาใหม่)

// ====================================================================
// Helpers
// ====================================================================

function moneyFmt(v: number): string {
  return v.toLocaleString('th-TH', { minimumFractionDigits: 2 });
}

function rateColorMap(points: MapPoint[]): Record<string, string> {
  const keys = Array.from(new Set(points.map((p) => p.rateKey))).sort((a, b) => a.localeCompare(b, 'th'));
  const map: Record<string, string> = {};
  keys.forEach((k, i) => (map[k] = MAP_PALETTE[i % MAP_PALETTE.length]));
  return map;
}

// ====================================================================
// Main screen
// ====================================================================

export default function TravelAllowanceMapScreen({ startDate = '01/09/2569', endDate = '15/09/2569', cycleLabel, onBack, onOpenSubmission }: TravelAllowanceMapScreenProps) {
  const allPoints = MOCK_POINTS;
  const [search, setSearch] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [rateFilter, setRateFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<MapPoint | null>(null);

  const colorOf = useMemo(() => rateColorMap(allPoints), [allPoints]);

  const drivers = useMemo(() => Array.from(new Set(allPoints.map((p) => p.driver))).sort((a, b) => a.localeCompare(b, 'th')), [allPoints]);
  const rateKeys = useMemo(() => Array.from(new Set(allPoints.map((p) => p.rateKey))), [allPoints]);
  const rateLabelOf = useMemo(() => {
    const map: Record<string, string> = {};
    allPoints.forEach((p) => (map[p.rateKey] = p.label));
    return map;
  }, [allPoints]);

  // ตรงกับ matchMapPoint() ของต้นฉบับ — กรองแบบ AND ทุกเงื่อนไข
  const points = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPoints.filter((p) => {
      if (driverFilter && p.driver !== driverFilter) return false;
      if (rateFilter && p.rateKey !== rateFilter) return false;
      if (fromDate && p.date < fromDate) return false;
      if (toDate && p.date > toDate) return false;
      if (q) {
        const hay = `${p.driver} ${p.route} ${p.label} ${p.date} ${p.dateText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allPoints, search, driverFilter, rateFilter, fromDate, toDate]);

  function resetFilters() {
    setSearch('');
    setDriverFilter('');
    setRateFilter('');
    setFromDate('');
    setToDate('');
  }

  const needGpsCount = 0; // TODO: ต่อ backend จริง -> นับจากแถวที่ rate_type ต้องจับพิกัดทั้งหมดในรอบนี้ (ไม่ใช่แค่ที่จับสำเร็จ)
  const hasGpsCount = allPoints.length;

  const initialRegion: Region | undefined = points.length
    ? { latitude: points[0].lat, longitude: points[0].lng, latitudeDelta: 6, longitudeDelta: 6 }
    : { latitude: 13.7563, longitude: 100.5018, latitudeDelta: 6, longitudeDelta: 6 };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <View style={styles.mapBar}>
        <TouchableOpacity style={styles.mapBackBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={13} color="#fff" />
          <Text style={styles.mapBackBtnText}>รายการเบิก</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.mapBarTitle}>
            <Ionicons name="location" size={12} color="#fff" /> พิกัดที่จับตอนกรอกใบเบิก
          </Text>
          <Text style={styles.mapBarSub}>
            รอบ {cycleLabel ?? `${startDate} - ${endDate}`} · {allPoints.length} จุด
            {needGpsCount > 0 && (hasGpsCount < needGpsCount ? ` · ขาด ${needGpsCount - hasGpsCount}` : ' · ครบแล้ว')}
          </Text>
        </View>
      </View>

      <View style={styles.filtersBox}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={13} color="#94a3b8" />
          <TextInput style={styles.searchInput} placeholder="ค้นหาคนขับ หรือ เส้นทาง" placeholderTextColor="#94a3b8" value={search} onChangeText={setSearch} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          <TouchableOpacity onPress={() => setDriverFilter('')} style={[styles.filterChip, !driverFilter && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, !driverFilter && styles.filterChipTextActive]}>คนขับทั้งหมด</Text>
          </TouchableOpacity>
          {drivers.map((d) => (
            <TouchableOpacity key={d} onPress={() => setDriverFilter(d)} style={[styles.filterChip, driverFilter === d && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, driverFilter === d && styles.filterChipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          <TouchableOpacity onPress={() => setRateFilter('')} style={[styles.filterChip, !rateFilter && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, !rateFilter && styles.filterChipTextActive]}>เกณฑ์ทั้งหมด</Text>
          </TouchableOpacity>
          {rateKeys.map((k) => (
            <TouchableOpacity key={k} onPress={() => setRateFilter(k)} style={[styles.filterChip, rateFilter === k && { backgroundColor: colorOf[k], borderColor: colorOf[k] }]}>
              <View style={[styles.chipDot, { backgroundColor: colorOf[k] }]} />
              <Text style={[styles.filterChipText, rateFilter === k && styles.filterChipTextActive]}>{rateLabelOf[k]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.dateFilterRow}>
          <TextInput style={styles.dateFilterInput} placeholder="ตั้งแต่ (ทั้งรอบ)" placeholderTextColor="#94a3b8" value={fromDate} onChangeText={setFromDate} />
          <TextInput style={styles.dateFilterInput} placeholder="ถึง (ทั้งรอบ)" placeholderTextColor="#94a3b8" value={toDate} onChangeText={setToDate} />
          <TouchableOpacity style={styles.resetFilterBtn} onPress={resetFilters}>
            <Ionicons name="refresh" size={12} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mapWrap}>
        {allPoints.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="location-outline" size={30} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>ยังไม่มีพิกัดในรอบนี้</Text>
            <Text style={styles.emptyText}>พิกัดจะถูกจับตอนกรอกใบเบิก เฉพาะเกณฑ์ที่ตั้งค่าไว้ว่า "ต้องจับพิกัด GPS"</Text>
          </View>
        ) : points.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="filter-outline" size={26} color="#cbd5e1" />
            <Text style={styles.emptyText}>ไม่พบจุดที่ตรงกับตัวกรอง</Text>
            <TouchableOpacity style={styles.resetFilterBtnBig} onPress={resetFilters}>
              <Ionicons name="refresh" size={13} color="#fff" />
              <Text style={styles.resetFilterBtnBigText}>ล้างตัวกรอง</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <MapView style={StyleSheet.absoluteFill} initialRegion={initialRegion}>
            {points.map((p) => (
              <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} onPress={() => setSelected(p)}>
                <View style={[styles.pin, { borderColor: colorOf[p.rateKey] }]}>
                  <Text style={styles.pinText}>{p.driver.trim().charAt(0)}</Text>
                </View>
                <View style={[styles.pinTail, { borderTopColor: colorOf[p.rateKey] }]} />
              </Marker>
            ))}
          </MapView>
        )}

        <View style={styles.mapCountBadge}>
          <Text style={styles.mapCountBadgeText}>{points.length} จุด</Text>
        </View>

        {points.length > 0 && (
          <View style={styles.legendBox}>
            {rateKeys
              .filter((k) => points.some((p) => p.rateKey === k))
              .map((k) => (
                <View key={k} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colorOf[k] }]} />
                  <Text style={styles.legendText} numberOfLines={1}>
                    {rateLabelOf[k]}
                  </Text>
                </View>
              ))}
          </View>
        )}
      </View>

      {/* Modal: รายละเอียดจุด — ตรงกับ mapPopupHtml() ของต้นฉบับ */}
      <Modal visible={!!selected} transparent animationType="fade">
        <TouchableOpacity style={styles.popupOverlay} activeOpacity={1} onPress={() => setSelected(null)}>
          {selected && (
            <View style={styles.popupCard}>
              <View style={styles.popupHeadRow}>
                <Text style={styles.popupDriver}>{selected.driver}</Text>
                <TouchableOpacity onPress={() => setSelected(null)} hitSlop={8}>
                  <Ionicons name="close" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>
              <View style={styles.popupRow}>
                <Ionicons name="calendar-outline" size={12} color="#64748b" />
                <Text style={styles.popupRowText}>
                  {selected.dateText} {selected.time}
                </Text>
              </View>
              {!!selected.route && (
                <View style={styles.popupRow}>
                  <Ionicons name="navigate-outline" size={12} color="#64748b" />
                  <Text style={styles.popupRowText}>{selected.route}</Text>
                </View>
              )}
              <View style={styles.popupRow}>
                <Ionicons name="cash-outline" size={12} color="#64748b" />
                <Text style={styles.popupRowText}>{moneyFmt(selected.amount)} บาท</Text>
              </View>
              <View style={styles.popupRow}>
                <Ionicons name="time-outline" size={12} color="#64748b" />
                <Text style={styles.popupRowText}>จับพิกัด {selected.at}</Text>
              </View>
              <View style={[styles.popupTag, { backgroundColor: colorOf[selected.rateKey] + '18' }]}>
                <Text style={[styles.popupTagText, { color: colorOf[selected.rateKey] }]}>{selected.label}</Text>
              </View>
              <View style={styles.popupLinksRow}>
                <TouchableOpacity
                  style={styles.popupLinkBtn}
                  onPress={() => Linking.openURL(`https://www.google.com/maps?q=${selected.lat},${selected.lng}`)}
                >
                  <Ionicons name="navigate" size={13} color="#2563eb" />
                  <Text style={styles.popupLinkBtnText}>เปิดใน Google Maps</Text>
                </TouchableOpacity>
                {!!selected.driverId && onOpenSubmission && (
                  <TouchableOpacity
                    style={styles.popupLinkBtn}
                    onPress={() => {
                      setSelected(null);
                      onOpenSubmission(selected.driverId);
                    }}
                  >
                    <Ionicons name="document-text" size={13} color="#4338ca" />
                    <Text style={[styles.popupLinkBtnText, { color: '#4338ca' }]}>เปิดใบเบิก</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0f172a' },

  mapBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1e293b', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  mapBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  mapBackBtnText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  mapBarTitle: { color: '#fff', fontSize: 12, fontWeight: '800' },
  mapBarSub: { color: '#94a3b8', fontSize: 10, marginTop: 3 },

  filtersBox: { backgroundColor: '#1e293b', paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 12 },
  filterChipsRow: { gap: 6 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#334155', borderWidth: 1, borderColor: '#334155', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 6 },
  filterChipActive: { backgroundColor: '#4338ca', borderColor: '#4338ca' },
  filterChipText: { fontSize: 10.5, color: '#cbd5e1', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  dateFilterRow: { flexDirection: 'row', gap: 6 },
  dateFilterInput: { flex: 1, backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, color: '#fff', fontSize: 11 },
  resetFilterBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },

  mapWrap: { flex: 1, backgroundColor: '#e2e8f0' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8, backgroundColor: '#f8fafc' },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: '#475569' },
  emptyText: { fontSize: 11.5, color: '#94a3b8', textAlign: 'center', lineHeight: 17 },
  resetFilterBtnBig: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#4338ca', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9, marginTop: 6 },
  resetFilterBtnBigText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  mapCountBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(15,23,42,0.85)', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 5 },
  mapCountBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },

  pin: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  pinText: { fontSize: 12, fontWeight: '900', color: '#334155' },
  pinTail: { alignSelf: 'center', width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },

  legendBox: { position: 'absolute', bottom: 12, left: 10, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: 9, gap: 5, maxWidth: 180 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 9.5, color: '#334155', fontWeight: '600', flexShrink: 1 },

  popupOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  popupCard: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 },
  popupHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  popupDriver: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  popupRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  popupRowText: { fontSize: 12, color: '#475569' },
  popupTag: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4, marginTop: 2, marginBottom: 12 },
  popupTagText: { fontSize: 11, fontWeight: '700' },
  popupLinksRow: { flexDirection: 'row', gap: 8 },
  popupLinkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#eff6ff', borderRadius: 9, paddingVertical: 11 },
  popupLinkBtnText: { fontSize: 11.5, fontWeight: '700', color: '#2563eb' },
});