/**
 * TravelAllowanceScreen.tsx
 * ------------------------------------------------------------------
 * หน้ารายการ "เบี้ยเลี้ยงขนส่ง" (fm_report_travel.php, mode=list) — ต่อ API จริงแล้ว
 * ผ่าน fm_travel_API_mobile.php (${API_MODULES}/fm_travel_API_mobile.php)
 *
 * เปลี่ยนจาก mockup เดิม:
 *  - ลบ MOCK_DRIVERS/DEFAULT_RATE_OPTIONS + ฟีเจอร์ "ตั้งค่าตัวเลือกเบี้ยเลี้ยง" (เพิ่ม/แก้/ลบ
 *    เกณฑ์) ออกทั้งหมด — ไม่มี action สำหรับ CRUD เกณฑ์ใน backend จริง (มีแค่ get_master_data
 *    ที่ "อ่าน" เกณฑ์ที่มีอยู่แล้วเพื่อใช้ในฟอร์มกรอกข้อมูล) ตามกติกา "ไม่มี action = ตัดทิ้ง"
 *  - ช่วงวันที่รอบเบิกเปลี่ยนเป็น "อ่านอย่างเดียว" ผูกกับ get_pay_cycle/get_master_data.pay_cycle
 *    แทนช่องกรอกวันที่เอง (ของเดิมให้พิมพ์วันที่มั่ว ๆ ได้ ซึ่งไม่มี action รองรับการ "ตั้งวันที่เอง"
 *    มีแต่ปุ่มรอบก่อนหน้า/รอบถัดไปที่ตรงกับ get_pay_cycle.prev/next จริง ๆ)
 *  - การ์ดคนขับ, แถบสรุปสถานะ ดึงจาก get_list/get_dashboard จริง ไม่ได้ reduce เองฝั่งไคลเอนต์
 *  - ปุ่ม "แก้ไขข้อมูล/กรอกข้อมูลใหม่" ถูกซ่อนถ้า can_save = false (สิทธิ์จากเซิร์ฟเวอร์)
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ Config + API helper กลาง (ตรงกับ pattern ที่ใช้ทั่วโปรเจกต์: apiMobileGet/apiMobilePost)
import { useAuth } from '../_layout';
import { apiMobileGet } from '../service/api_mobile';
import TravelAllowanceFormScreen from './fm_report_travel_form';
import TravelAllowanceMapScreen from './fm_report_travel_map';
import TravelAllowanceViewScreen from './fm_report_travel_view';

// 🌟 [ใหม่] URL โมดูลจริง — ตามธรรมเนียมของไฟล์นี้: ประกาศ const local ในไฟล์ (ดู accounting_dashboard.tsx)
import { API_MODULES } from '../../constants/config';
const FM_TRAVEL_API_URL = `${API_MODULES}/fm_travel_API_mobile.php`;

// ====================================================================
// Types — สะท้อน field จริงจาก get_list / get_dashboard / get_master_data
// ====================================================================

interface DriverRow {
  id: number;
  name: string;
  photoUrl?: string;
  hasData: boolean;
  totalAmount: number;
  jobTotal: number;
  jobDone: number;
  lastUpdateShow?: string; // ส่วนวันที่ของ updated_at_thai
  lastUpdateTime?: string; // ส่วนเวลาของ updated_at_thai
  statusEffective?: string;
  statusEffectiveText?: string;
}

interface DashboardStats {
  savedCount: number;
  unsavedCount: number;
  totalCount: number;
  jobSum: number;
  jobDoneSum: number;
  totalAmountSum: number;
}

interface PermFlags {
  canSave: boolean;
  canSignRequester: boolean;
  canSignChecker: boolean;
  canSignApprover: boolean;
  canFullAccess: boolean;
  myDriverId: number;
  myDriverName: string;
  lockedToSelf: boolean;
}

export interface TravelAllowanceScreenProps {
  onBack?: () => void;
}

// ====================================================================
// Helpers
// ====================================================================

// เทียบเท่า MoneyFmt() ของต้นฉบับ — จำนวนเต็มไม่โชว์ทศนิยม มีเศษถึงโชว์ 2 ตำแหน่ง
function moneyFmt(v: number): string {
  const n = Math.round(v * 100) / 100;
  return n === Math.floor(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// หมายเหตุ: ฟิลด์รายแถวของ get_list ไม่ได้ระบุชื่อ field แบบเป๊ะ ๆ ในเอกสาร (มีแค่ "list[]"
// เฉย ๆ + ระบุเพิ่มว่ามี signed_requester/signed_checker/signed_approver ต่อแถว) จึง map
// แบบมี fallback หลายชื่อ โดยยึดรูปแบบการตั้งชื่อเดียวกับ action อื่นในไฟล์เดียวกัน
// (get_dashboard: job_sum/job_done_sum/total_amount_sum, get_detail: grand_total/form_exists)
function mapDriverRow(row: any): DriverRow {
  const updatedThai: string = row.updated_at_thai || '';
  const [dateShow, timeShow] = updatedThai ? updatedThai.split(' ') : [undefined, undefined];
  return {
    id: Number(row.driver_id ?? row.id ?? 0),
    name: String(row.driver_name ?? row.name ?? ''),
    photoUrl: row.photo_url || undefined,
    hasData: !!(row.form_exists ?? row.has_data ?? Number(row.grand_total ?? 0) > 0),
    totalAmount: Number(row.grand_total ?? row.total_amount ?? 0),
    jobTotal: Number(row.job_total ?? row.jobs_count ?? 0),
    jobDone: Number(row.job_done ?? row.job_done_count ?? 0),
    lastUpdateShow: dateShow,
    lastUpdateTime: timeShow,
    statusEffective: row.status_effective,
    statusEffectiveText: row.status_effective_text,
  };
}

// ====================================================================
// Main screen
// ====================================================================

export default function TravelAllowanceScreen({ onBack }: TravelAllowanceScreenProps) {
  const { user } = useAuth();

  const [startDate, setStartDate] = useState(''); // YYYY-MM-DD ไว้ส่งเข้า API
  const [endDate, setEndDate] = useState('');
  const [startDateThai, setStartDateThai] = useState('');
  const [endDateThai, setEndDateThai] = useState('');

  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ savedCount: 0, unsavedCount: 0, totalCount: 0, jobSum: 0, jobDoneSum: 0, totalAmountSum: 0 });
  const [perm, setPerm] = useState<PermFlags>({
    canSave: false,
    canSignRequester: false,
    canSignChecker: false,
    canSignApprover: false,
    canFullAccess: false,
    myDriverId: 0,
    myDriverName: '',
    lockedToSelf: false,
  });

  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cycleLoading, setCycleLoading] = useState(false);

  const [formScreen, setFormScreen] = useState<{ visible: boolean; driver?: DriverRow }>({ visible: false });
  const [viewScreen, setViewScreen] = useState<{ visible: boolean; driver?: DriverRow }>({ visible: false });
  const [mapVisible, setMapVisible] = useState(false);

  // โหลดช่วงรอบเบิกเริ่มต้นจาก get_master_data.pay_cycle (ไม่คำนวณรอบเองฝั่งไคลเอนต์)
  const initCycle = useCallback(async () => {
    if (!user) return;
    setInitializing(true);
    try {
      const res = await apiMobileGet(FM_TRAVEL_API_URL, 'get_master_data', { user_id: user.id });
      const cycle = res.pay_cycle;
      if (cycle) {
        setStartDate(cycle.start_date);
        setEndDate(cycle.end_date);
        setStartDateThai(cycle.start_date_thai);
        setEndDateThai(cycle.end_date_thai);
      }
    } catch (e: any) {
      Alert.alert('โหลดข้อมูลตั้งต้นไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setInitializing(false);
    }
  }, [user]);

  useEffect(() => {
    void initCycle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // โหลดรายการคนขับ + สรุป KPI ของรอบเบิกปัจจุบัน
  const loadPeriodData = useCallback(
    async (refresh = false) => {
      if (!user || !startDate || !endDate) return;
      refresh ? setRefreshing(true) : setLoading(true);
      try {
        const [listRes, dashRes] = await Promise.all([
          apiMobileGet(FM_TRAVEL_API_URL, 'get_list', { user_id: user.id, start_date: startDate, end_date: endDate, limit: 200 }),
          apiMobileGet(FM_TRAVEL_API_URL, 'get_dashboard', { user_id: user.id, start_date: startDate, end_date: endDate }),
        ]);
        setDrivers(Array.isArray(listRes.list) ? listRes.list.map(mapDriverRow) : []);
        setPerm({
          canSave: !!listRes.can_save,
          canSignRequester: !!listRes.can_sign_requester,
          canSignChecker: !!listRes.can_sign_checker,
          canSignApprover: !!listRes.can_sign_approver,
          canFullAccess: !!listRes.can_full_access,
          myDriverId: Number(listRes.my_driver_id ?? 0),
          myDriverName: String(listRes.my_driver_name ?? ''),
          lockedToSelf: !!listRes.locked_to_self,
        });
        setStats({
          savedCount: Number(dashRes.saved_count ?? 0),
          unsavedCount: Number(dashRes.unsaved_count ?? 0),
          totalCount: Number(dashRes.total_count ?? 0),
          jobSum: Number(dashRes.job_sum ?? 0),
          jobDoneSum: Number(dashRes.job_done_sum ?? 0),
          totalAmountSum: Number(dashRes.total_amount_sum ?? 0),
        });
      } catch (e: any) {
        Alert.alert('โหลดรายการไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด');
      } finally {
        refresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [user, startDate, endDate]
  );

  useEffect(() => {
    if (startDate && endDate) void loadPeriodData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  // ปุ่ม "รอบก่อนหน้า/รอบถัดไป" — ตรงกับ get_pay_cycle.prev/next จริง ไม่ได้คำนวณวันที่เอง
  async function goCycle(direction: -1 | 1) {
    if (!user || cycleLoading) return;
    setCycleLoading(true);
    try {
      const res = await apiMobileGet(FM_TRAVEL_API_URL, 'get_pay_cycle', { user_id: user.id, date: startDate });
      const target = direction === -1 ? res.prev : res.next;
      if (target) {
        setStartDate(target.start_date);
        setEndDate(target.end_date);
        setStartDateThai(target.start_date_thai);
        setEndDateThai(target.end_date_thai);
      }
    } catch (e: any) {
      Alert.alert('เปลี่ยนรอบเบิกไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setCycleLoading(false);
    }
  }

  function renderDriverCard({ item: d }: { item: DriverRow }) {
    const initial = d.name.trim().charAt(0) || '?';
    return (
      <View style={styles.card}>
        <View style={[styles.cardStripe, { backgroundColor: d.hasData ? '#10b981' : '#f59e0b' }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.avatar, d.hasData && styles.avatarHasData]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{d.name}</Text>
              {!!d.statusEffectiveText && <Text style={styles.driverSeq}>{d.statusEffectiveText}</Text>}
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={[styles.statusBadge, d.hasData ? styles.statusBadgeSaved : styles.statusBadgeNew]}>
              <Ionicons name={d.hasData ? 'checkmark-circle' : 'time-outline'} size={12} color={d.hasData ? '#059669' : '#b45309'} />
              <Text style={[styles.statusBadgeText, { color: d.hasData ? '#059669' : '#b45309' }]}>{d.hasData ? 'บันทึกแล้ว' : 'ยังไม่ทำรายการ'}</Text>
            </View>
            {d.totalAmount > 0 && (
              <View style={styles.amountBadge}>
                <Ionicons name="cash-outline" size={12} color="#4338ca" />
                <Text style={styles.amountBadgeText}>
                  {moneyFmt(d.totalAmount)} <Text style={styles.amountBadgeUnit}>บาท</Text>
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.jobCountBox, d.jobTotal === 0 && styles.jobCountBoxEmpty]}>
            <Ionicons name="document-text-outline" size={12} color={d.jobTotal ? '#475569' : '#94a3b8'} />
            <Text style={[styles.jobCountText, !d.jobTotal && { color: '#94a3b8' }]}>
              ใบงานในช่วงนี้ <Text style={styles.jobCountStrong}>{d.jobTotal}</Text> ใบ
            </Text>
            {d.jobTotal > 0 && (
              <Text style={styles.jobCountSub}>
                ปิดงานแล้ว <Text style={styles.jobCountStrong}>{d.jobDone}</Text>
              </Text>
            )}
          </View>

          {d.lastUpdateShow ? (
            <View style={styles.dateBadge}>
              <Ionicons name="calendar-outline" size={12} color="#475569" />
              <Text style={styles.dateBadgeText}>
                บันทึกล่าสุด: <Text style={styles.dateBadgeStrong}>{d.lastUpdateShow}</Text>
                {d.lastUpdateTime ? <Text style={styles.dateBadgeTime}> ({d.lastUpdateTime} น.)</Text> : null}
              </Text>
            </View>
          ) : (
            <View style={styles.dateBadge}>
              <Ionicons name="calendar-clear-outline" size={12} color="#94a3b8" />
              <Text style={[styles.dateBadgeText, { color: '#94a3b8' }]}>ยังไม่มีข้อมูลในช่วงนี้</Text>
            </View>
          )}

          <View style={styles.cardActionsRow}>
            {d.hasData && (
              <TouchableOpacity style={[styles.cardActionBtn, styles.cardActionBtnSaved]} onPress={() => setViewScreen({ visible: true, driver: d })}>
                <Ionicons name="eye-outline" size={13} color="#0369a1" />
                <Text style={[styles.cardActionBtnText, { color: '#0369a1' }]}>ดูใบเบิก</Text>
              </TouchableOpacity>
            )}
            {/* 🌟 [เปลี่ยน] ซ่อนปุ่มแก้ไข/กรอกใหม่ถ้าไม่มีสิทธิ์ can_save จากเซิร์ฟเวอร์ */}
            {perm.canSave &&
              (d.hasData ? (
                <TouchableOpacity style={[styles.cardActionBtn, styles.cardActionBtnEdit]} onPress={() => setFormScreen({ visible: true, driver: d })}>
                  <Ionicons name="pencil-outline" size={13} color="#0ea5e9" />
                  <Text style={[styles.cardActionBtnText, { color: '#0ea5e9' }]}>แก้ไขข้อมูล</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.cardActionBtnNew} onPress={() => setFormScreen({ visible: true, driver: d })}>
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text style={styles.cardActionBtnNewText}>กรอกข้อมูลใหม่</Text>
                </TouchableOpacity>
              ))}
          </View>
        </View>
      </View>
    );
  }

  if (formScreen.visible && formScreen.driver) {
    return (
      <TravelAllowanceFormScreen
        driverId={String(formScreen.driver.id)}
        driverName={formScreen.driver.name}
        startDate={startDate}
        endDate={endDate}
        startDateThai={startDateThai}
        endDateThai={endDateThai}
        hasSavedData={formScreen.driver.hasData}
        onBack={() => setFormScreen({ visible: false })}
        onSaved={() => {
          setFormScreen({ visible: false });
          void loadPeriodData(true);
        }}
        onViewSubmission={() => {
          setFormScreen({ visible: false });
          setViewScreen({ visible: true, driver: formScreen.driver });
        }}
      />
    );
  }

  if (viewScreen.visible && viewScreen.driver) {
    return (
      <TravelAllowanceViewScreen
        driverId={String(viewScreen.driver.id)}
        requesterName={viewScreen.driver.name}
        startDate={startDate}
        endDate={endDate}
        onBack={() => {
          setViewScreen({ visible: false });
          void loadPeriodData(true);
        }}
        onEditFull={() => {
          setViewScreen({ visible: false });
          setFormScreen({ visible: true, driver: viewScreen.driver });
        }}
      />
    );
  }

  if (mapVisible) {
    return (
      <TravelAllowanceMapScreen
        startDate={startDate}
        endDate={endDate}
        cycleLabel={`${startDateThai} - ${endDateThai}`}
        onBack={() => setMapVisible(false)}
        onOpenSubmission={(driverId) => {
          const driver = drivers.find((d) => d.id === driverId);
          setMapVisible(false);
          if (driver) setFormScreen({ visible: true, driver });
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={drivers}
        keyExtractor={(d) => String(d.id)}
        renderItem={renderDriverCard}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPeriodData(true)} tintColor="#4338ca" />}
        ListEmptyComponent={
          initializing || loading ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator color="#4338ca" />
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={26} color="#cbd5e1" />
              <Text style={styles.emptyText}>ไม่พบคนขับในรอบนี้</Text>
            </View>
          )
        }
        ListHeaderComponent={
          <View>
            <View style={styles.titleBar}>
              {onBack ? (
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                  <Ionicons name="chevron-back" size={20} color="#0f172a" />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 32 }} />
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Ionicons name="receipt-outline" size={18} color="#4338ca" />
                <Text style={styles.title}>รายการเบิกเบี้ยเลี้ยง</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>
              ประจำวันที่ {startDateThai || '...'} ถึง {endDateThai || '...'}
            </Text>

            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={styles.cycleBtn} onPress={() => goCycle(-1)} disabled={cycleLoading}>
                {cycleLoading ? <ActivityIndicator size="small" color="#4338ca" /> : <Ionicons name="chevron-back" size={13} color="#4338ca" />}
                <Text style={styles.cycleBtnText}>รอบก่อนหน้า</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cycleBtn} onPress={() => goCycle(1)} disabled={cycleLoading}>
                <Text style={styles.cycleBtnText}>รอบถัดไป</Text>
                <Ionicons name="chevron-forward" size={13} color="#4338ca" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.mapTabHint} onPress={() => setMapVisible(true)}>
              <Ionicons name="map-outline" size={13} color="#64748b" />
              <Text style={styles.mapTabHintText}>ดูแผนที่จุดเบิก GPS</Text>
            </TouchableOpacity>

            <View style={styles.statsBar}>
              <View style={styles.statsItem}>
                <View style={[styles.dot, { backgroundColor: '#10b981' }]} />
                <Text style={styles.statsText}>
                  บันทึกแล้ว <Text style={styles.statsStrong}>{stats.savedCount}</Text>
                </Text>
              </View>
              <View style={styles.statsItem}>
                <View style={[styles.dot, { backgroundColor: '#f59e0b' }]} />
                <Text style={styles.statsText}>
                  ยังไม่ทำ <Text style={styles.statsStrong}>{stats.unsavedCount}</Text>
                </Text>
              </View>
              <View style={styles.statsItem}>
                <Text style={[styles.statsText, { color: '#4338ca', fontWeight: '800' }]}>รวม {stats.totalCount} คน</Text>
              </View>
              <View style={styles.statsItem}>
                <Text style={styles.statsTextMuted}>
                  ใบงานในช่วงนี้ <Text style={styles.statsStrong}>{stats.jobSum}</Text>
                </Text>
              </View>
            </View>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7fb' },

  titleBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12 },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginHorizontal: 14, marginTop: 4, fontSize: 11.5, color: '#64748b', fontWeight: '600' },

  actionButtonsRow: { flexDirection: 'row', gap: 6, marginHorizontal: 14, marginTop: 12, flexWrap: 'wrap' },
  cycleBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  cycleBtnText: { fontSize: 11, fontWeight: '700', color: '#4338ca' },

  mapTabHint: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginHorizontal: 14, marginTop: 10, backgroundColor: '#f1f5f9', borderRadius: 50, paddingHorizontal: 11, paddingVertical: 6 },
  mapTabHintText: { fontSize: 10.5, fontWeight: '700', color: '#64748b' },

  statsBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, backgroundColor: '#fff', borderRadius: 12, marginHorizontal: 14, marginTop: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  statsItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statsText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  statsTextMuted: { fontSize: 11, color: '#94a3b8' },
  statsStrong: { fontWeight: '900', color: '#0f172a' },

  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 14, marginTop: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  cardStripe: { height: 4 },
  cardBody: { padding: 13 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#e2e8f0' },
  avatarHasData: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#475569' },
  driverName: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  driverSeq: { fontSize: 10.5, color: '#94a3b8', marginTop: 2 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11, flexWrap: 'wrap' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 9, paddingVertical: 4 },
  statusBadgeSaved: { backgroundColor: '#ecfdf5' },
  statusBadgeNew: { backgroundColor: '#fffbeb' },
  statusBadgeText: { fontSize: 10.5, fontWeight: '700' },
  amountBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef2ff', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 4 },
  amountBadgeText: { fontSize: 11, fontWeight: '800', color: '#4338ca' },
  amountBadgeUnit: { fontSize: 9.5, fontWeight: '600' },

  jobCountBox: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 9 },
  jobCountBoxEmpty: { backgroundColor: '#f8fafc' },
  jobCountText: { fontSize: 11, color: '#475569' },
  jobCountStrong: { fontWeight: '800', color: '#1e293b' },
  jobCountSub: { fontSize: 10.5, color: '#94a3b8', marginLeft: 6 },

  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  dateBadgeText: { fontSize: 10.5, color: '#475569' },
  dateBadgeStrong: { fontWeight: '800' },
  dateBadgeTime: { color: '#94a3b8' },

  cardActionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cardActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 9, paddingVertical: 9, borderWidth: 1 },
  cardActionBtnSaved: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  cardActionBtnEdit: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  cardActionBtnText: { fontSize: 11.5, fontWeight: '700' },
  cardActionBtnNew: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#4338ca', borderRadius: 9, paddingVertical: 10 },
  cardActionBtnNewText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 12, textAlign: 'center' },
});
