/**
 * EstimateDashboardScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า dashboard_estimate.php (แดชบอร์ดประวัติการทำทุน)
 * สำหรับแอป tjc-mobile-app (Expo / React Native)
 *
 * สถานะไฟล์นี้: UI MOCKUP เท่านั้น — ข้อมูลทั้งหมดเป็น MOCK_ESTIMATES ด้านล่าง
 * ปุ่มลบทำงานแบบ local state เท่านั้น (ยังไม่ยิง api_save_estimate.php จริง)
 *
 * ตรงกับของจริงจากไฟล์ dashboard_estimate.php:
 *  - การ์ดสรุป 3 ใบ: ใบเสนอราคาทั้งหมด / ฟอร์มทำทุนทั่วไป / ฟอร์ม ปร.4
 *  - ตัวกรองประเภทฟอร์ม (ทั้งหมด/ทั่วไป/ปร.4) + สถานะ (ทั้งหมด/กำไร/ขาดทุน/เท่าทุน) + ค้นหา
 *  - สูตรคำนวณกำไร/ขาดทุนตรงกับ PHP เป๊ะ:
 *      ทั่วไป: sell = submit > 0 ? submit : median  |  ปร.4: sell = submit
 *      diff = sell - cost, percent = cost > 0 ? (sell*100/cost)-100 : (diff>0 ? 100 : 0)
 *  - ไอคอนจัดการ: ดูรายละเอียด (view_estimate.php?uuid=) / แก้ไข (check_cost.php?edit_uuid=) /
 *    ลบ (api_save_estimate.php action=delete, มี confirm ก่อนลบเหมือนของจริง)
 *  - ปุ่ม "สร้างทุนใหม่" -> check_cost.php
 *
 * วิธีเชื่อมกับ ProjectDashboardScreen (ปุ่ม "ทุนตั้งต้น"):
 *   ส่ง prop onNavigate={(screen) => { if (screen === 'estimate') ... }} เข้า ProjectDashboardScreen
 *   แล้วสลับไปแสดงสกรีนนี้ — ตัวอย่างการต่อ navigation จริงดูที่ท้ายไฟล์ ProjectDashboardScreen.tsx
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons
 * ------------------------------------------------------------------
 */

import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// ปรับ path นี้ให้ตรงกับตำแหน่งไฟล์จริงในโปรเจกต์ ถ้าไม่ได้วางไว้โฟลเดอร์เดียวกัน
import CheckCostScreen from './checkcost';

// ====================================================================
// Types
// ====================================================================

type FormType = 'general' | 'pr4';

interface EstimateProject {
  uuid: string;
  projectName: string;
  formType: FormType;
  median: number; // grand_total_median (ราคากลาง)
  submitted: number; // submitted_price (ราคายื่น, 0 = ยังไม่ระบุ)
  cost: number; // grand_total_cost (ราคาทุน)
  creatorName: string;
  updaterName?: string;
  createdAtShow: string; // dd/mm/พ.ศ.
}

export interface EstimateDashboardScreenProps {
  onBack?: () => void;
  onCreateNew?: () => void;
  onViewEstimate?: (uuid: string) => void;
  onEditEstimate?: (uuid: string) => void;
}

// ====================================================================
// Mock data
// ====================================================================

const MOCK_ESTIMATES: EstimateProject[] = [
  {
    uuid: 'e-001',
    projectName: 'ก่อสร้างอาคารเรียน 4 ชั้น โรงเรียนสมมติวิทยา',
    formType: 'pr4',
    median: 8500000,
    submitted: 8200000,
    cost: 7600000,
    creatorName: 'คุณสมชาย',
    updaterName: 'คุณกานดา',
    createdAtShow: '05/09/2569',
  },
  {
    uuid: 'e-002',
    projectName: 'ติดตั้งระบบกล้องวงจรปิด อาคารสำนักงานใหญ่',
    formType: 'general',
    median: 1250000,
    submitted: 0,
    cost: 980000,
    creatorName: 'คุณอรทัย',
    createdAtShow: '03/09/2569',
  },
  {
    uuid: 'e-003',
    projectName: 'ปรับปรุงระบบไฟฟ้าโรงงานผลิตชิ้นส่วน',
    formType: 'general',
    median: 640000,
    submitted: 590000,
    cost: 610000,
    creatorName: 'คุณพิชญ์',
    updaterName: 'คุณพิชญ์',
    createdAtShow: '30/08/2569',
  },
  {
    uuid: 'e-004',
    projectName: 'งานถนนคอนกรีตเสริมเหล็ก หมู่บ้านสมมติ',
    formType: 'pr4',
    median: 3200000,
    submitted: 3200000,
    cost: 3200000,
    creatorName: 'คุณวรรณา',
    createdAtShow: '28/08/2569',
  },
  {
    uuid: 'e-005',
    projectName: 'ติดตั้งลิฟต์โดยสารอาคารพาณิชย์',
    formType: 'general',
    median: 2100000,
    submitted: 1980000,
    cost: 2050000,
    creatorName: 'คุณธนา',
    updaterName: 'คุณอรทัย',
    createdAtShow: '20/08/2569',
  },
  {
    uuid: 'e-006',
    projectName: 'ก่อสร้างสะพานข้ามคลองสมมติ',
    formType: 'pr4',
    median: 12500000,
    submitted: 11800000,
    cost: 10200000,
    creatorName: 'คุณสมชาย',
    createdAtShow: '15/08/2569',
  },
];

const TYPE_FILTERS: { label: string; value: FormType | 'all' }[] = [
  { label: 'ทุกประเภทฟอร์ม', value: 'all' },
  { label: 'ฟอร์มทำทุนทั่วไป', value: 'general' },
  { label: 'ฟอร์ม ปร.4', value: 'pr4' },
];

const STATUS_FILTERS: { label: string; value: 'all' | 'profit' | 'loss' | 'even' }[] = [
  { label: 'ทุกสถานะ', value: 'all' },
  { label: 'กำไร', value: 'profit' },
  { label: 'ขาดทุน', value: 'loss' },
  { label: 'เท่าทุน', value: 'even' },
];

// ====================================================================
// Helpers — สูตรเดียวกับ dashboard_estimate.php ทุกตัว
// ====================================================================

function formatBaht(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeEstimate(p: EstimateProject) {
  const sellPrice = p.formType === 'general' ? (p.submitted > 0 ? p.submitted : p.median) : p.submitted;
  const diff = sellPrice - p.cost;
  const percent = p.cost > 0 ? (sellPrice * 100) / p.cost - 100 : diff > 0 ? 100 : 0;
  const status: 'profit' | 'loss' | 'even' = diff > 0 ? 'profit' : diff < 0 ? 'loss' : 'even';
  return { sellPrice, diff, percent, status };
}

function typeMeta(formType: FormType) {
  return formType === 'general'
    ? { label: 'ทั่วไป', bg: '#e0e7ff', fg: '#3730a3', icon: 'file-invoice' as const }
    : { label: 'ปร.4 5 6', bg: '#fef3c7', fg: '#b45309', icon: 'hard-hat' as const };
}

// ====================================================================
// Main screen
// ====================================================================

export default function EstimateDashboardScreen({ onBack, onCreateNew, onViewEstimate, onEditEstimate }: EstimateDashboardScreenProps) {
  // ไม่มี navigation จากภายนอก -> สลับไปหน้า CheckCostScreen เองภายในไฟล์นี้
  const [checkCost, setCheckCost] = useState<{ visible: boolean; editUuid?: string }>({ visible: false });
  const [estimates, setEstimates] = useState<EstimateProject[]>(MOCK_ESTIMATES);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FormType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'profit' | 'loss' | 'even'>('all');

  const counts = useMemo(() => {
    const total = estimates.length;
    const general = estimates.filter((e) => e.formType === 'general').length;
    const pr4 = estimates.filter((e) => e.formType === 'pr4').length;
    return { total, general, pr4 };
  }, [estimates]);

  const filtered = useMemo(() => {
    return estimates.filter((e) => {
      if (typeFilter !== 'all' && e.formType !== typeFilter) return false;
      if (statusFilter !== 'all') {
        const { status } = computeEstimate(e);
        if (status !== statusFilter) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!`${e.projectName} ${e.createdAtShow}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [estimates, search, typeFilter, statusFilter]);

  function handleDelete(p: EstimateProject) {
    // TODO: ต่อ backend จริง -> POST api_save_estimate.php { action: 'delete', uuid }
    Alert.alert('ยืนยันการลบ', `ต้องการลบโปรเจกต์ "${p.projectName}" ใช่หรือไม่?\n(ข้อมูลนี้ไม่สามารถกู้คืนได้)`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบข้อมูล',
        style: 'destructive',
        onPress: () => setEstimates((prev) => prev.filter((x) => x.uuid !== p.uuid)),
      },
    ]);
  }

  function handleView(p: EstimateProject) {
    if (onViewEstimate) return onViewEstimate(p.uuid);
    Alert.alert('ดูรายละเอียด', `จะเปิด view_estimate.php?uuid=${p.uuid}`);
  }

  function handleEdit(p: EstimateProject) {
    if (onEditEstimate) return onEditEstimate(p.uuid);
    setCheckCost({ visible: true, editUuid: p.uuid });
  }

  function handleCreateNew() {
    if (onCreateNew) return onCreateNew();
    setCheckCost({ visible: true, editUuid: undefined });
  }

  function renderHeader() {
    return (
      <View>
        <View style={styles.titleRow}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color="#2c3e50" />
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtnPlaceholder} />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name="pie-chart" size={19} color="#3f51b5" />
            <Text style={styles.title}>แดชบอร์ดประวัติการทำทุน</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#3f51b51a' }]}>
              <Ionicons name="folder-open" size={17} color="#3f51b5" />
            </View>
            <Text style={styles.statValue}>{counts.total}</Text>
            <Text style={styles.statLabel}>ใบเสนอราคาทั้งหมด</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#10b9811a' }]}>
              <FontAwesome5 name="file-invoice" size={14} color="#10b981" />
            </View>
            <Text style={styles.statValue}>{counts.general}</Text>
            <Text style={styles.statLabel}>ฟอร์มทำทุนทั่วไป</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#f59e0b1a' }]}>
              <FontAwesome5 name="hard-hat" size={14} color="#f59e0b" />
            </View>
            <Text style={styles.statValue}>{counts.pr4}</Text>
            <Text style={styles.statLabel}>ฟอร์ม ปร.4 (ก่อสร้าง)</Text>
          </View>
        </View>

        <View style={styles.listHeaderRow}>
          <Text style={styles.listHeaderTitle}>รายการประเมินราคาล่าสุด</Text>
          <TouchableOpacity style={styles.createBtn} onPress={handleCreateNew} activeOpacity={0.8}>
            <Ionicons name="add" size={15} color="#fff" />
            <Text style={styles.createBtnText}>สร้างทุนใหม่</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#94a3b8" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นหาชื่อโครงการ, วันที่..."
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#cbd5e1" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          {TYPE_FILTERS.map((f) => {
            const active = typeFilter === f.value;
            return (
              <TouchableOpacity key={f.label} onPress={() => setTypeFilter(f.value)} style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterChipsRow, { marginTop: 6 }]}>
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value;
            return (
              <TouchableOpacity
                key={f.label}
                onPress={() => setStatusFilter(f.value)}
                style={[styles.filterChip, styles.statusChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.resultCount}>พบ {filtered.length} รายการ</Text>
      </View>
    );
  }

  function renderCard({ item: p, index }: { item: EstimateProject; index: number }) {
    const { sellPrice, diff, percent, status } = computeEstimate(p);
    const tm = typeMeta(p.formType);
    const statusColor = status === 'profit' ? '#059669' : status === 'loss' ? '#dc2626' : '#64748b';

    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={styles.indexBadge}>
            <Text style={styles.indexBadgeText}>{index + 1}</Text>
          </View>
          <Text style={styles.cardDate}>{p.createdAtShow}</Text>
          <View style={[styles.typeBadge, { backgroundColor: tm.bg }]}>
            <FontAwesome5 name={tm.icon} size={10} color={tm.fg} />
            <Text style={[styles.typeBadgeText, { color: tm.fg }]}>{tm.label}</Text>
          </View>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {p.projectName}
        </Text>

        <View style={styles.creatorBox}>
          <View style={styles.creatorLine}>
            <Ionicons name="person-add-outline" size={12} color="#10b981" />
            <Text style={styles.creatorText}>สร้าง: {p.creatorName}</Text>
          </View>
          {!!p.updaterName && (
            <View style={styles.creatorLine}>
              <Ionicons name="create-outline" size={12} color="#f59e0b" />
              <Text style={styles.creatorText}>แก้ไข: {p.updaterName}</Text>
            </View>
          )}
        </View>

        <View style={styles.priceGrid}>
          <View style={styles.priceCell}>
            <Text style={styles.priceLabel}>ราคากลาง</Text>
            <Text style={styles.priceValue}>{formatBaht(p.median)}</Text>
          </View>
          <View style={styles.priceCell}>
            <Text style={styles.priceLabel}>ราคายื่น</Text>
            <Text style={[styles.priceValue, { color: '#059669' }]}>{formatBaht(sellPrice)}</Text>
          </View>
          <View style={styles.priceCell}>
            <Text style={styles.priceLabel}>ราคาทุน</Text>
            <Text style={[styles.priceValue, { color: '#0891b2' }]}>{formatBaht(p.cost)}</Text>
          </View>
        </View>

        <View style={styles.resultRow}>
          <View>
            <Text style={styles.resultLabel}>ผลต่าง (กำไร/ขาดทุน)</Text>
            <Text style={[styles.resultDiff, { color: statusColor }]}>
              {diff > 0 ? '+' : ''}
              {formatBaht(diff)}
            </Text>
          </View>
          {status !== 'even' && (
            <View style={[styles.percentBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.percentBadgeText}>
                {percent > 0 ? '+' : ''}
                {percent.toFixed(2)}%
              </Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.iconBtn, styles.iconBtnView]} onPress={() => handleView(p)}>
            <Ionicons name="eye-outline" size={16} color="#3f51b5" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, styles.iconBtnEdit]} onPress={() => handleEdit(p)}>
            <Ionicons name="create-outline" size={16} color="#d97706" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, styles.iconBtnDelete]} onPress={() => handleDelete(p)}>
            <Ionicons name="trash-outline" size={16} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (checkCost.visible) {
    return (
      <CheckCostScreen
        editUuid={checkCost.editUuid}
        onBack={() => setCheckCost({ visible: false })}
        onSaved={() => setCheckCost({ visible: false })}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.uuid}
        renderItem={renderCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="folder-open-outline" size={28} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>ยังไม่มีข้อมูลการประเมินราคา</Text>
            <Text style={styles.emptyText}>
              แตะปุ่ม "สร้างทุนใหม่" ด้านบนเพื่อเริ่มต้น
            </Text>
          </View>
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

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 12 },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  backBtnPlaceholder: { width: 32 },
  title: { fontSize: 17, fontWeight: '800', color: '#2c3e50' },

  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 14 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  statIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 17, fontWeight: '800', color: '#2c3e50' },
  statLabel: { fontSize: 10.5, color: '#64748b', fontWeight: '600', marginTop: 2 },

  listHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 18 },
  listHeaderTitle: { fontSize: 14.5, fontWeight: '800', color: '#334155' },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#3f51b5', borderRadius: 50, paddingHorizontal: 13, paddingVertical: 7 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 14, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 13, color: '#334155', padding: 0 },

  filterChipsRow: { paddingHorizontal: 16, paddingTop: 10, gap: 6 },
  filterChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 6 },
  statusChip: { backgroundColor: '#f8fafc' },
  filterChipActive: { backgroundColor: '#3f51b5', borderColor: '#3f51b5' },
  filterChipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },

  resultCount: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, fontSize: 12, color: '#64748b', fontWeight: '600' },

  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', marginHorizontal: 16, marginTop: 12, padding: 14 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  indexBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  indexBadgeText: { fontSize: 10.5, color: '#64748b', fontWeight: '700' },
  cardDate: { fontSize: 11.5, color: '#94a3b8', fontWeight: '600', flex: 1 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 9, paddingVertical: 3 },
  typeBadgeText: { fontSize: 10.5, fontWeight: '700' },

  cardTitle: { fontSize: 14.5, fontWeight: '800', color: '#1e293b', marginTop: 8 },

  creatorBox: { marginTop: 6, gap: 3 },
  creatorLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  creatorText: { fontSize: 11.5, color: '#64748b' },

  priceGrid: { flexDirection: 'row', marginTop: 12, backgroundColor: '#f8fafc', borderRadius: 10, padding: 10 },
  priceCell: { flex: 1, alignItems: 'center' },
  priceLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600' },
  priceValue: { fontSize: 12.5, fontWeight: '700', color: '#334155', marginTop: 2 },

  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  resultLabel: { fontSize: 10.5, color: '#94a3b8', fontWeight: '600' },
  resultDiff: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  percentBadge: { borderRadius: 50, paddingHorizontal: 10, paddingVertical: 4 },
  percentBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 10 },

  actionsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  iconBtnView: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  iconBtnEdit: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  iconBtnDelete: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { color: '#64748b', fontSize: 14, fontWeight: '700', marginTop: 4 },
  emptyText: { color: '#94a3b8', fontSize: 12.5 },
});