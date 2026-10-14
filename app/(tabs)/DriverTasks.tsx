/**
 * DriverTasksScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า driver_tasks.php ("ระบบคนรถ - ยืนยันการส่งของ" / งานจัดส่งของฉัน)
 * สำหรับแอป tjc-mobile-app (Expo / React Native)
 *
 * สถานะไฟล์นี้: เชื่อม API จริงแล้ว (GET action=get_driver_tasks ผ่าน api_mobile.php) — action/param
 * name เป็นการเดาตาม pattern ในเอกสารโปรเจกต์ ยังไม่ได้ยืนยันกับ backend จริง
 *
 * ตรงกับพฤติกรรมจริงจาก driver_tasks.php:
 *  - ผู้ใช้ปัจจุบันถ้าอยู่ใน driver_list หรือ helper_list และมีงานสถานะ "กำลังจัดส่ง" ค้างอยู่
 *    ระบบจะพรีเซ็ตตัวกรองเป็นชื่อตัวเองอัตโนมัติ (default_driver/default_helper +
 *    has_pending_task) — จำลองไว้ด้วย CURRENT_USER ด้านล่าง
 *  - ตัวกรอง: สถานะ (กำลังจัดส่ง/เสร็จสิ้นแล้ว/ทั้งหมด — ค่าเริ่มต้น 'pending'), คนขับ, คนรถ,
 *    ช่วงวันที่ — กรองแบบ AND ทั้งหมดเหมือนต้นฉบับ
 *  - เลขหน้างานที่โชว์ตัดมาจาก delivery_no รูปแบบ "69-70-1" -> เอาส่วนกลาง (index 1) เหมือน PHP
 *    explode('-', ...) ถ้าไม่ใช่ 3 ส่วนจะ fallback ไปจับเลขท้ายสุดด้วย regex
 *  - งานที่ pending_items = 0 ถือว่า "เสร็จสิ้น" (ปุ่มเปลี่ยนเป็น "ดูประวัติการจัดส่ง")
 *    งานที่ยังมี pending_items > 0 ปุ่มเป็น "ตรวจสอบหน้างาน" ไปหน้า driver_confirm_items.php?do_no=
 *
 * ที่ยังไม่ได้ทำ (นอกขอบเขต "หน้ารายการหลัก" รอบนี้):
 *  - (อัปเดต) ปุ่ม "ตรวจสอบหน้างาน" เชื่อมกับหน้า DriverConfirmItems.tsx จริงแล้ว ผ่าน
 *    expo-router: router.push({ pathname: '/DriverConfirmItems', params: { do_no } }) —
 *    สมมติว่าไฟล์นั้นอยู่ที่ app/DriverConfirmItems.tsx (ตาม pattern เดียวกับ router.push("/DriverTasks")
 *    ที่ใช้ย้อนกลับมาไฟล์นี้) ถ้า path จริงไม่ตรงนี้ ให้แก้ pathname ในฟังก์ชัน handleAction
 *  - ปฏิทินเลือกช่วงวันที่แบบ native (ใช้ TextInput ธรรมดาไปก่อน เพื่อไม่ต้องเพิ่ม native module)
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons
 * ------------------------------------------------------------------
 */

import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../_layout';
// ✅ Config
import { API_BASE } from '../../constants/config';

// action ด้านล่างเป็นการเดาจาก pattern api_mobile.php (driver tasks) ตาม CLAUDE.md — ยังไม่ได้ยืนยันกับ backend จริง
const API_URL = `${API_BASE}/api_mobile.php`;

// ====================================================================
// Types
// ====================================================================

type StatusFilter = 'pending' | 'completed' | 'all';

interface DeliveryTask {
  id: string;
  deliveryNo: string; // เช่น "69-70-1"
  deliveryDateShow: string; // แสดงผลแบบ dd/mm/yyyy + เวลา
  driverName: string;
  helperName?: string;
  receiverName: string;
  totalItems: number;
  totalQty: number;
  isCompleted: boolean;
}

export interface DriverTasksScreenProps {
  onBack?: () => void;
  onOpenConfirmItems?: (deliveryNo: string) => void;
}

// ====================================================================
// Mock data
// ====================================================================

const DEFAULT_DRIVER_LIST: string[] = [];
const DEFAULT_HELPER_LIST: string[] = [];

// แปลงข้อมูลดิบจาก backend ให้เข้ารูป DeliveryTask — รองรับหลายชื่อ field เพราะยังไม่มี spec ยืนยัน
function mapTask(raw: any): DeliveryTask {
  return {
    id: String(raw.id ?? raw.delivery_id ?? raw.deliveryNo ?? raw.delivery_no),
    deliveryNo: String(raw.deliveryNo ?? raw.delivery_no ?? ''),
    deliveryDateShow: String(raw.deliveryDateShow ?? raw.delivery_date_show ?? raw.delivery_date ?? ''),
    driverName: String(raw.driverName ?? raw.driver_name ?? ''),
    helperName: raw.helperName ?? raw.helper_name ?? undefined,
    receiverName: String(raw.receiverName ?? raw.receiver_name ?? ''),
    totalItems: Number(raw.totalItems ?? raw.total_items ?? 0),
    totalQty: Number(raw.totalQty ?? raw.total_qty ?? 0),
    isCompleted: Boolean(raw.isCompleted ?? raw.is_completed ?? (Number(raw.pending_items ?? 0) === 0)),
  };
}

// ====================================================================
// Helpers
// ====================================================================

// เทียบเท่า explode('-', $delivery_no) แล้วเอา index 1 ถ้ามี >=3 ส่วน ไม่งั้น fallback regex เลขท้าย
function displayDeliveryNo(deliveryNo: string): string {
  const parts = deliveryNo.split('-');
  if (parts.length >= 3) return parts[1];
  const m = deliveryNo.match(/-(\d+)$/);
  return m ? m[1] : deliveryNo;
}

function senderLabel(task: DeliveryTask): string {
  return task.helperName ? `คนขับ: ${task.driverName} | คนรถ: ${task.helperName}` : `คนขับ: ${task.driverName}`;
}

// ====================================================================
// Main screen
// ====================================================================

export default function DriverTasksScreen({ onBack, onOpenConfirmItems }: DriverTasksScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const currentUserLabel = user?.fullname || user?.username || '';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [driverFilter, setDriverFilter] = useState('');
  const [helperFilter, setHelperFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const [tasks, setTasks] = useState<DeliveryTask[]>([]);
  const [driverList, setDriverList] = useState<string[]>(DEFAULT_DRIVER_LIST);
  const [helperList, setHelperList] = useState<string[]>(DEFAULT_HELPER_LIST);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const presetAppliedRef = useRef(false);

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await axios.get(API_URL, { params: { action: 'get_driver_tasks', username: user?.username } });
      const data = res.data;
      const rawTasks = Array.isArray(data) ? data : data?.tasks ?? data?.data ?? [];
      const mapped: DeliveryTask[] = rawTasks.map(mapTask);
      setTasks(mapped);
      if (Array.isArray(data?.drivers) && data.drivers.length) setDriverList(data.drivers);
      if (Array.isArray(data?.helpers) && data.helpers.length) setHelperList(data.helpers);

      // ค่าเริ่มต้นของตัวกรอง: ถ้าผู้ใช้ปัจจุบันมีงานค้างอยู่ ให้พรีเซ็ตเป็นชื่อตัวเอง เหมือนต้นฉบับ (has_pending_task)
      if (!presetAppliedRef.current) {
        presetAppliedRef.current = true;
        const hasPending = mapped.some((t) => !t.isCompleted && (t.driverName === currentUserLabel || t.helperName === currentUserLabel));
        if (hasPending) setDriverFilter(currentUserLabel);
      }
    } catch (e) {
      console.error('load get_driver_tasks failed', e);
      setError('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.username, currentUserLabel]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function onRefresh() {
    setRefreshing(true);
    loadData({ silent: true });
  }

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter === 'pending' && t.isCompleted) return false;
      if (statusFilter === 'completed' && !t.isCompleted) return false;
      if (driverFilter && t.driverName !== driverFilter) return false;
      if (helperFilter && t.helperName !== helperFilter) return false;
      if (dateFilter.trim()) {
        // mock: จับคู่แบบ substring ง่ายๆ กับวันที่ที่แสดง (ของจริงเทียบช่วงวันที่จาก DB)
        if (!t.deliveryDateShow.includes(dateFilter.trim())) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, driverFilter, helperFilter, dateFilter]);

  function resetFilters() {
    setStatusFilter('pending');
    setDriverFilter('');
    setHelperFilter('');
    setDateFilter('');
  }

  function handleAction(task: DeliveryTask) {
    if (onOpenConfirmItems) return onOpenConfirmItems(task.deliveryNo);
    // เชื่อมจริงกับหน้า DriverConfirmItems.tsx ที่มีอยู่แล้ว — อ่านค่าผ่าน useLocalSearchParams().do_no
    // ปรับ pathname ตรงนี้ถ้าไฟล์จริงไม่ได้อยู่ที่ app/DriverConfirmItems.tsx (root ของ app/)
    router.push({ pathname: '/DriverConfirmItems', params: { do_no: task.deliveryNo } });
  }

  function renderHeader() {
    return (
      <View>
        <View style={styles.titleBar}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 32 }} />
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <FontAwesome5 name="truck-moving" size={15} color="#fff" />
              <Text style={styles.title}>งานจัดส่งของฉัน</Text>
            </View>
            <Text style={styles.subtitle}>รายการสินค้าที่กำลังนำส่งโดย: {currentUserLabel}</Text>
          </View>
        </View>

        <View style={styles.filterCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusChipsRow}>
            {(
              [
                { key: 'pending' as const, label: '⏳ กำลังจัดส่ง' },
                { key: 'completed' as const, label: '✅ เสร็จสิ้นแล้ว' },
                { key: 'all' as const, label: '📦 ทั้งหมด' },
              ]
            ).map((s) => {
              const active = statusFilter === s.key;
              return (
                <TouchableOpacity key={s.key} onPress={() => setStatusFilter(s.key)} style={[styles.statusChip, active && styles.statusChipActive]}>
                  <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.filterLabel}>🚚 คนขับ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <TouchableOpacity onPress={() => setDriverFilter('')} style={[styles.chip, driverFilter === '' && styles.chipActive]}>
              <Text style={[styles.chipText, driverFilter === '' && styles.chipTextActive]}>ทั้งหมด</Text>
            </TouchableOpacity>
            {driverList.map((d) => (
              <TouchableOpacity key={d} onPress={() => setDriverFilter(d)} style={[styles.chip, driverFilter === d && styles.chipActive]}>
                <Text style={[styles.chipText, driverFilter === d && styles.chipTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.filterLabel}>👷 คนรถ (เด็กติดรถ)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <TouchableOpacity onPress={() => setHelperFilter('')} style={[styles.chip, helperFilter === '' && styles.chipActive]}>
              <Text style={[styles.chipText, helperFilter === '' && styles.chipTextActive]}>ทั้งหมด</Text>
            </TouchableOpacity>
            {helperList.map((h) => (
              <TouchableOpacity key={h} onPress={() => setHelperFilter(h)} style={[styles.chip, helperFilter === h && styles.chipActive]}>
                <Text style={[styles.chipText, helperFilter === h && styles.chipTextActive]}>{h}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={15} color="#94a3b8" />
            <TextInput style={styles.dateInput} placeholder="เลือกช่วงวันที่... เช่น 12/09" placeholderTextColor="#94a3b8" value={dateFilter} onChangeText={setDateFilter} />
            <TouchableOpacity onPress={resetFilters} style={styles.resetBtn}>
              <Ionicons name="sync-outline" size={13} color="#475569" />
              <Text style={styles.resetBtnText}>ล้างค่า</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.resultCount}>พบ {filtered.length} งาน</Text>
      </View>
    );
  }

  function renderCard({ item: t }: { item: DeliveryTask }) {
    return (
      <View style={[styles.card, t.isCompleted && styles.cardCompleted]}>
        <View style={styles.cardTopRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Ionicons name="document-text-outline" size={14} color="#475569" />
            <Text style={styles.doNoLabel}>เลขหน้างาน {displayDeliveryNo(t.deliveryNo)}</Text>
          </View>
          <View style={[styles.statusBadge, t.isCompleted ? styles.statusBadgeDone : styles.statusBadgePending]}>
            <Ionicons name={t.isCompleted ? 'checkmark-circle' : 'flash'} size={12} color={t.isCompleted ? '#059669' : '#d97706'} />
            <Text style={[styles.statusBadgeText, { color: t.isCompleted ? '#059669' : '#d97706' }]}>{t.isCompleted ? 'เสร็จสิ้น' : 'กำลังจัดส่ง'}</Text>
          </View>
        </View>

        <View style={styles.dateLine}>
          <Ionicons name="calendar" size={13} color="#ea580c" />
          <Text style={styles.dateLineText}>วันที่จัดส่ง: {t.deliveryDateShow}</Text>
        </View>

        <Text style={styles.detailLine}>
          <Text style={styles.detailLineLabel}>ผู้ส่ง/รถ: </Text>
          {senderLabel(t)}
        </Text>
        <Text style={styles.detailLine}>
          <Text style={styles.detailLineLabel}>ผู้รับหน้างาน: </Text>
          {t.receiverName}
        </Text>

        <View style={styles.qtyPill}>
          <Text style={styles.qtyPillText}>
            รวม {t.totalItems} รายการ ({t.totalQty} ชิ้น)
          </Text>
        </View>

        <TouchableOpacity style={[styles.actionBtn, t.isCompleted && styles.actionBtnDone]} onPress={() => handleAction(t)}>
          <Ionicons name={t.isCompleted ? 'search-outline' : 'clipboard-outline'} size={15} color={t.isCompleted ? '#475569' : '#fff'} />
          <Text style={[styles.actionBtnText, t.isCompleted && { color: '#475569' }]}>{t.isCompleted ? 'ดูประวัติการจัดส่ง' : 'ตรวจสอบหน้างาน'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && tasks.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.emptyBox}>
          <ActivityIndicator size="large" color="#334155" />
          <Text style={styles.emptyText}>กำลังโหลดข้อมูล...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <FlatList
        data={filtered}
        keyExtractor={(t) => t.id}
        renderItem={renderCard}
        ListHeaderComponent={renderHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#334155']} tintColor="#334155" />}
        ListEmptyComponent={
          error ? (
            <View style={styles.emptyBox}>
              <Ionicons name="alert-circle-outline" size={30} color="#ef4444" />
              <Text style={styles.emptyText}>{error}</Text>
              <TouchableOpacity style={styles.actionBtn} onPress={() => loadData()}>
                <Text style={styles.actionBtnText}>ลองใหม่</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="cube-outline" size={30} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>ไม่มีงานจัดส่งในหมวดหมู่นี้</Text>
              <Text style={styles.emptyText}>ลองเปลี่ยนตัวกรองดูนะครับ</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7f9' },

  titleBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#334155', paddingHorizontal: 14, paddingVertical: 16 },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 11.5, color: 'rgba(255,255,255,0.8)', marginTop: 3 },

  filterCard: { backgroundColor: '#fff', margin: 14, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  statusChipsRow: { gap: 6, paddingBottom: 8 },
  statusChip: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 7 },
  statusChipActive: { backgroundColor: '#334155', borderColor: '#334155' },
  statusChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  statusChipTextActive: { color: '#fff' },

  filterLabel: { fontSize: 10.5, color: '#94a3b8', fontWeight: '700', marginTop: 8, marginBottom: 5 },
  chipsRow: { gap: 6 },
  chip: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 11, paddingVertical: 6 },
  chipActive: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
  chipText: { fontSize: 11.5, color: '#475569', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  dateInput: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: '#0f172a' },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  resetBtnText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },

  resultCount: { marginHorizontal: 14, marginBottom: 4, fontSize: 12, color: '#64748b', fontWeight: '600' },

  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', marginHorizontal: 14, marginTop: 12, padding: 14 },
  cardCompleted: { opacity: 0.85 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  doNoLabel: { fontSize: 13, fontWeight: '800', color: '#334155' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  statusBadgePending: { backgroundColor: '#fef3c7', borderColor: '#fde68a' },
  statusBadgeDone: { backgroundColor: '#dcfce7', borderColor: '#a7f3d0' },
  statusBadgeText: { fontSize: 10.5, fontWeight: '700' },

  dateLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  dateLineText: { fontSize: 12.5, fontWeight: '700', color: '#ea580c' },

  detailLine: { fontSize: 12.5, color: '#334155', marginTop: 4 },
  detailLineLabel: { fontWeight: '700', color: '#0f172a' },

  qtyPill: { alignSelf: 'flex-start', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 10 },
  qtyPillText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },

  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#334155', borderRadius: 10, paddingVertical: 11, marginTop: 12 },
  actionBtnDone: { backgroundColor: '#f1f5f9' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { color: '#64748b', fontSize: 14, fontWeight: '700', marginTop: 4 },
  emptyText: { color: '#94a3b8', fontSize: 12.5 },
});