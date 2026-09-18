/**
 * TravelAllowanceMapScreen.tsx
 * ------------------------------------------------------------------
 * แผนที่จุดพิกัด GPS ที่จับตอนกรอกใบเบิกเบี้ยเลี้ยง — ต่อ API จริงแล้ว
 *
 * ⚠️ หมายเหตุสำคัญ: fm_travel_API_mobile.php "ไม่มี" action สำหรับดึงจุดแผนที่รวมทุกคนขับในรอบ
 * เดียว (ไม่มี get_map_points หรือเทียบเท่า) เอกสาร action มีแค่ get_list (รายชื่อคนขับ) กับ
 * get_detail (รายละเอียด+jobs ของคนขับ "ทีละคน") จึงประกอบจุดแผนที่ขึ้นจากการเรียก 2 action
 * ที่มีจริงนี้: get_list ก่อนเพื่อได้รายชื่อคนขับที่มีข้อมูลในรอบนี้ แล้วเรียก get_detail ของ
 * แต่ละคนขับแบบขนาน (Promise.all) มาเก็บเฉพาะแถวที่ has_gps=1 — ไม่ได้เดา endpoint ใหม่ขึ้นมาเอง
 * ยังใช้ get_master_data เพื่อรู้ว่าเกณฑ์ไหนตั้งค่า require_gps=1 ไว้บ้าง (ไว้คำนวณ "ต้องจับ N
 * รายการ/ขาด Z" ให้ตรงของจริง ไม่ใช่แค่จำนวนจุดที่จับมาแล้ว)
 *
 * เปลี่ยนจาก mockup เดิม: ลบ MOCK_POINTS ออกทั้งหมด ที่เหลือ (ตัวกรอง/สี/ป้าย/popup) คงพฤติกรรม
 * เดิมไว้ครบ เพราะยังใช้ react-native-maps ตัวเดียวกัน
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ Config + API helper กลาง
import { API_MODULES } from '../../constants/config';
import { useAuth } from '../_layout';
import { apiMobileGet } from '../service/api_mobile';

const FM_TRAVEL_API_URL = `${API_MODULES}/fm_travel_API_mobile.php`;

// ====================================================================
// Types
// ====================================================================

interface MapPoint {
  id: string;
  driver: string;
  driverId: number;
  dateYmd: string;
  dateThai: string;
  time: string;
  route: string;
  rateKey: string;
  label: string;
  amount: number;
  lat: number;
  lng: number;
  at: string;
  mapUrl: string;
}

export interface TravelAllowanceMapScreenProps {
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  cycleLabel?: string;
  onBack?: () => void;
  onOpenSubmission?: (driverId: number) => void;
}

const MAP_PALETTE = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

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

export default function TravelAllowanceMapScreen({ startDate = '', endDate = '', cycleLabel, onBack, onOpenSubmission }: TravelAllowanceMapScreenProps) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allPoints, setAllPoints] = useState<MapPoint[]>([]);
  const [needGpsCount, setNeedGpsCount] = useState(0);
  const [hasGpsCount, setHasGpsCount] = useState(0);

  const [search, setSearch] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [rateFilter, setRateFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<MapPoint | null>(null);

  // ประกอบจุดแผนที่จาก get_list + get_detail (ดูคอมเมนต์หัวไฟล์) + get_master_data
  // (require_gps) — ไม่มี action รวมจุดแผนที่ตัวเดียวในเอกสารจริง
  const load = useCallback(async () => {
    if (!user || !startDate || !endDate) return;
    setLoading(true);
    try {
      const [listRes, masterRes] = await Promise.all([
        apiMobileGet(FM_TRAVEL_API_URL, 'get_list', { user_id: user.id, start_date: startDate, end_date: endDate, limit: 200 }),
        apiMobileGet(FM_TRAVEL_API_URL, 'get_master_data', { user_id: user.id }),
      ]);

      const allRateOptions = [
        ...(Array.isArray(masterRes.rate_options_positive) ? masterRes.rate_options_positive : []),
        ...(Array.isArray(masterRes.rate_options_negative) ? masterRes.rate_options_negative : []),
      ];
      const requireGpsKeys = new Set<string>(allRateOptions.filter((o: any) => !!o.require_gps).map((o: any) => String(o.opt_key)));

      const driverRows: any[] = Array.isArray(listRes.list) ? listRes.list : [];
      const withData = driverRows.filter((r) => !!(r.form_exists ?? r.has_data));

      const details = await Promise.all(
        withData.map((r) =>
          apiMobileGet(FM_TRAVEL_API_URL, 'get_detail', {
            user_id: user.id,
            driver_id: r.driver_id ?? r.id,
            start_date: startDate,
            end_date: endDate,
          }).catch(() => null)
        )
      );

      const pts: MapPoint[] = [];
      let needCount = 0;
      let hasCount = 0;

      details.forEach((res, idx) => {
        if (!res) return;
        const driverRow = withData[idx];
        const driverId = Number(driverRow.driver_id ?? driverRow.id ?? 0);
        const driverName = String(driverRow.driver_name ?? driverRow.name ?? '');
        const jobs: any[] = Array.isArray(res.jobs) ? res.jobs : [];
        jobs.forEach((j) => {
          const needsGps = requireGpsKeys.has(String(j.rate_type));
          const hasGps = Number(j.has_gps ?? 0) === 1 && typeof j.lat === 'number' && typeof j.lng === 'number';
          if (needsGps) {
            needCount += 1;
            if (hasGps) hasCount += 1;
          }
          if (hasGps) {
            pts.push({
              id: `${driverId}_${j.job_id ?? 0}_${j.no ?? pts.length}`,
              driver: driverName,
              driverId,
              dateYmd: String(j.date_ymd ?? ''),
              dateThai: String(j.date_thai ?? ''),
              time: String(j.time ?? ''),
              route: String(j.route ?? ''),
              rateKey: String(j.rate_type ?? ''),
              label: String(j.rate_type_label ?? j.rate_type ?? ''),
              amount: Number(j.amount ?? 0),
              lat: j.lat,
              lng: j.lng,
              at: String(j.gps_at ?? ''),
              mapUrl: String(j.gps_map_url ?? ''),
            });
          }
        });
      });

      setAllPoints(pts);
      setNeedGpsCount(needCount);
      setHasGpsCount(hasCount);
      setLoadError(null);
    } catch (e: any) {
      // ไม่บล็อกทั้งหน้าถ้าโหลดพิกัดไม่สำเร็จ — แต่ต้องแยกให้ออกจาก "รอบนี้ไม่มีพิกัดจริงๆ"
      // ไม่งั้นผู้ใช้เข้าใจผิดว่าไม่มีใครลืมจับพิกัด ทั้งที่จริงคือโหลดข้อมูลพัง
      console.error('fm_report_travel_map load failed', e);
      setAllPoints([]);
      setLoadError(e?.message || 'โหลดพิกัดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [user, startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const colorOf = useMemo(() => rateColorMap(allPoints), [allPoints]);

  const drivers = useMemo(() => Array.from(new Set(allPoints.map((p) => p.driver))).sort((a, b) => a.localeCompare(b, 'th')), [allPoints]);
  const rateKeys = useMemo(() => Array.from(new Set(allPoints.map((p) => p.rateKey))), [allPoints]);
  const rateLabelOf = useMemo(() => {
    const map: Record<string, string> = {};
    allPoints.forEach((p) => (map[p.rateKey] = p.label));
    return map;
  }, [allPoints]);

  const points = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPoints.filter((p) => {
      if (driverFilter && p.driver !== driverFilter) return false;
      if (rateFilter && p.rateKey !== rateFilter) return false;
      if (fromDate && p.dateYmd < fromDate) return false;
      if (toDate && p.dateYmd > toDate) return false;
      if (q) {
        const hay = `${p.driver} ${p.route} ${p.label} ${p.dateYmd} ${p.dateThai}`.toLowerCase();
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
          <TextInput style={styles.dateFilterInput} placeholder="ตั้งแต่ (YYYY-MM-DD)" placeholderTextColor="#94a3b8" value={fromDate} onChangeText={setFromDate} />
          <TextInput style={styles.dateFilterInput} placeholder="ถึง (YYYY-MM-DD)" placeholderTextColor="#94a3b8" value={toDate} onChangeText={setToDate} />
          <TouchableOpacity style={styles.resetFilterBtn} onPress={resetFilters}>
            <Ionicons name="refresh" size={12} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mapWrap}>
        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator color="#4338ca" />
          </View>
        ) : loadError ? (
          <View style={styles.emptyBox}>
            <Ionicons name="cloud-offline-outline" size={30} color="#ef4444" />
            <Text style={styles.emptyTitle}>โหลดพิกัดไม่สำเร็จ</Text>
            <Text style={styles.emptyText}>{loadError}</Text>
            <TouchableOpacity onPress={() => void load()} style={{ marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eef2ff' }}>
              <Text style={{ color: '#4338ca', fontWeight: '700', fontSize: 12.5 }}>ลองใหม่</Text>
            </TouchableOpacity>
          </View>
        ) : allPoints.length === 0 ? (
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

        {!loading && allPoints.length > 0 && (
          <View style={styles.mapCountBadge}>
            <Text style={styles.mapCountBadgeText}>{points.length} จุด</Text>
          </View>
        )}

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

      {/* Modal: รายละเอียดจุด */}
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
                  {selected.dateThai} {selected.time}
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
              {!!selected.at && (
                <View style={styles.popupRow}>
                  <Ionicons name="time-outline" size={12} color="#64748b" />
                  <Text style={styles.popupRowText}>จับพิกัด {selected.at}</Text>
                </View>
              )}
              <View style={[styles.popupTag, { backgroundColor: colorOf[selected.rateKey] + '18' }]}>
                <Text style={[styles.popupTagText, { color: colorOf[selected.rateKey] }]}>{selected.label}</Text>
              </View>
              <View style={styles.popupLinksRow}>
                <TouchableOpacity
                  style={styles.popupLinkBtn}
                  onPress={() => Linking.openURL(selected.mapUrl || `https://www.google.com/maps?q=${selected.lat},${selected.lng}`)}
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
