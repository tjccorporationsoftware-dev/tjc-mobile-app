/**
 * CheckIncompleteProjectsScreen.tsx
 * ------------------------------------------------------------------
 * พอร์ตของหน้า check_incomplete_projects.php (ตรวจสอบข้อมูลตกหล่น)
 * สำหรับแอป tjc-mobile-app (Expo / React Native)
 *
 * เชื่อม API จริงแล้ว — action=get_incomplete_projects ใน project_API_mobile.php (เพิ่มใหม่ เพราะ
 * check_incomplete_projects.php ต้นทางเป็นหน้า HTML เต็ม ไม่ใช่ JSON endpoint) SQL + เงื่อนไข missing[]
 * คัดมาจากต้นฉบับทั้งชุด (บรรทัด 26-158) ตัวเลข/ป้ายจึงตรงกับเว็บ 100%
 *
 * ตรงกับพฤติกรรม/สูตรจริงจาก check_incomplete_projects.php:
 *  - 4 การ์ดสรุป: โครงการไม่ครบ / ระดับวิกฤต (ขาด≥5) / ระดับปานกลาง (ขาด 3-4) / จุดรวมที่ต้องกรอก
 *  - แบ่งฟิลด์ที่ขาดเป็น 4 หมวด: ข้อมูลหลัก(main)/ข้อมูลสัญญา(contract)/การค้ำประกัน(guarantee)/
 *    การยื่นซอง(bidding) — สีและป้ายตรงกับ CAT_META ของจริงเป๊ะ
 *  - ระดับความรุนแรง: severity(n) = n>=5 'สูง'(แดง) : n>=3 'กลาง'(เหลือง) : 'ต่ำ'(ฟ้า)
 *    ตรงกับฟังก์ชัน severity()/sevColor()/sevLabel() ของจริง
 *  - แถบความคืบหน้า = min(100, round(total/12*100)) — MAX_PTS=12 ตามต้นฉบับ
 *  - ค้นหา + กรองตามระดับ + เรียงลำดับ (มากสุดก่อน/น้อยสุดก่อน/รหัสใหม่สุดก่อน) ตรงกับ renderList()
 *  - แตะการ์ดเพื่อขยาย/ยุบดูรายละเอียดฟิลด์ที่ขาดแยกตามหมวด + ปุ่ม "ไปเติมข้อมูล" ไปหน้าแก้ไขโครงการ
 *  - รหัสโครงการที่แสดง = ตัดจาก project_code ด้วย split('-')[1] แบบเดียวกับ PHP
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons expo-router
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../_layout';
import { API_MODULES } from '../../constants/config';
import { apiMobileGet } from '../../service/api_mobile';

// action=get_incomplete_projects ใน project_API_mobile.php (README_project.md ยังไม่มีบรรทัดนี้ — เพิ่มใหม่)
const PROJECT_API_URL = `${API_MODULES}/project_API_mobile.php`;

// ====================================================================
// Types
// ====================================================================

type CatKey = 'main' | 'contract' | 'guarantee' | 'bidding';
type Severity = 'high' | 'mid' | 'low';
type SortKey = 'miss_desc' | 'miss_asc' | 'code_desc';
type FilterKey = 'all' | Severity;

interface MissingData {
  main: string[];
  contract: string[];
  guarantee: string[];
  bidding: string[];
}

interface IncompleteProject {
  id: number;
  code: string;
  display: string;
  name: string;
  customer: string;
  company: string;
  total: number;
  missing: MissingData;
}

export interface CheckIncompleteProjectsScreenProps {
  onBack?: () => void;
  /** ไปหน้าแก้ไขโครงการ — ถ้าไม่ส่งมา (ใช้แบบ route เดี่ยว) จะ router.push('/createproject') แทน */
  onEditProject?: (projectId: string) => void;
}

// ====================================================================
// Constants
// ====================================================================

const MAX_PTS = 12;

const CAT_META: Record<CatKey, { label: string; color: string; bg: string; dot: string }> = {
  main: { label: 'ข้อมูลหลัก', color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  contract: { label: 'ข้อมูลสัญญา', color: '#059669', bg: '#f0fdf4', dot: '#10b981' },
  guarantee: { label: 'การค้ำประกัน', color: '#7c3aed', bg: '#f5f3ff', dot: '#8b5cf6' },
  bidding: { label: 'การยื่นซอง', color: '#0891b2', bg: '#ecfeff', dot: '#06b6d4' },
};

const CAT_ORDER: CatKey[] = ['main', 'contract', 'guarantee', 'bidding'];

const FILTER_BUTTONS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'high', label: '🔴 วิกฤต' },
  { key: 'mid', label: '🟡 ปานกลาง' },
  { key: 'low', label: '🔵 น้อย' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'miss_desc', label: 'มากที่สุดขึ้นก่อน' },
  { key: 'miss_asc', label: 'น้อยที่สุดขึ้นก่อน' },
  { key: 'code_desc', label: 'รหัสใหม่สุดขึ้นก่อน' },
];

// แปลงข้อมูลดิบจาก action=get_incomplete_projects (project_API_mobile.php) ให้เข้ารูป IncompleteProject
function mapProject(raw: any): IncompleteProject {
  const missingRaw = raw.missing ?? {};
  return {
    id: Number(raw.id ?? 0),
    code: String(raw.code ?? ''),
    display: String(raw.display ?? ''),
    name: String(raw.name ?? ''),
    customer: String(raw.customer ?? ''),
    company: String(raw.company ?? ''),
    total: Number(raw.total ?? 0),
    missing: {
      main: missingRaw.main ?? [],
      contract: missingRaw.contract ?? [],
      guarantee: missingRaw.guarantee ?? [],
      bidding: missingRaw.bidding ?? [],
    },
  };
}

// ====================================================================
// Helpers
// ====================================================================

function severity(total: number): Severity {
  if (total >= 5) return 'high';
  if (total >= 3) return 'mid';
  return 'low';
}

const SEV_META: Record<Severity, { color: string; bg: string; text: string; label: string }> = {
  high: { color: '#dc2626', bg: '#fef2f2', text: '#b91c1c', label: '🔴 วิกฤต' },
  mid: { color: '#f59e0b', bg: '#fffbeb', text: '#92400e', label: '🟡 ปานกลาง' },
  low: { color: '#3b82f6', bg: '#eff6ff', text: '#1d4ed8', label: '🔵 น้อย' },
};

function categoriesOf(p: IncompleteProject): { key: CatKey; items: string[] }[] {
  return CAT_ORDER.map((k) => ({ key: k, items: p.missing[k] })).filter((c) => c.items.length > 0);
}

// ====================================================================
// Main screen
// ====================================================================

export default function CheckIncompleteProjectsScreen({ onBack, onEditProject }: CheckIncompleteProjectsScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;

  // ปีที่เลือกได้มาจาก backend เสมอ (DISTINCT YEAR(created_at) จริงในตาราง projects) ไม่ hardcode
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('miss_desc');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);

  const [projects, setProjects] = useState<IncompleteProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (opts?: { silent?: boolean; year?: number }) => {
    if (!userId) return;
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await apiMobileGet(PROJECT_API_URL, 'get_incomplete_projects', {
        user_id: userId,
        year: opts?.year ?? selectedYear ?? undefined,
      });
      const list = Array.isArray(res.data) ? res.data : [];
      setProjects(list.map(mapProject));
      setAvailableYears(Array.isArray(res.available_years) ? res.available_years : []);
      setSelectedYear(Number(res.year));
    } catch (e) {
      console.error('project_API_mobile action=get_incomplete_projects failed', e);
      setError('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, selectedYear]);

  useEffect(() => {
    loadData();
    // โหลดครั้งแรกเท่านั้น — เปลี่ยนปีทำผ่าน selectYear() ด้านล่างเพื่อคุม opts.year ตรงๆ ไม่ชนกับปีเก่าใน state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function selectYear(y: number) {
    setSelectedYear(y);
    loadData({ year: y });
  }

  function onRefresh() {
    setRefreshing(true);
    loadData({ silent: true });
  }

  const stats = useMemo(() => {
    const total = projects.length;
    const high = projects.filter((p) => p.total >= 5).length;
    const mid = projects.filter((p) => p.total >= 3 && p.total < 5).length;
    const pts = projects.reduce((sum, p) => sum + p.total, 0);
    return { total, high, mid, pts };
  }, [projects]);

  const filtered = useMemo(() => {
    let data = [...projects];
    const q = search.trim().toLowerCase();
    if (q) {
      data = data.filter((p) => p.name.toLowerCase().includes(q) || p.customer.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.display.toLowerCase().includes(q));
    }
    if (filter !== 'all') data = data.filter((p) => severity(p.total) === filter);
    if (sort === 'miss_desc') data.sort((a, b) => b.total - a.total);
    else if (sort === 'miss_asc') data.sort((a, b) => a.total - b.total);
    else data.sort((a, b) => b.id - a.id);
    return data;
  }, [projects, search, filter, sort]);

  function toggleCard(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpandAll() {
    if (allExpanded) {
      setExpandedIds(new Set());
      setAllExpanded(false);
    } else {
      setExpandedIds(new Set(filtered.map((p) => p.id)));
      setAllExpanded(true);
    }
  }

  function goEditProject(p: IncompleteProject) {
    if (onEditProject) return onEditProject(String(p.id));
    router.push({ pathname: '/createproject', params: { edit_id: String(p.id) } });
  }

  function renderHeader() {
    return (
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
            <Ionicons name="clipboard-outline" size={18} color="#dc2626" />
            <Text style={styles.title}>ตรวจสอบข้อมูลตกหล่น</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearRow}>
          {availableYears.map((y) => {
            const active = selectedYear === y;
            return (
              <TouchableOpacity key={y} onPress={() => selectYear(y)} style={[styles.yearChip, active && styles.yearChipActive]}>
                <Text style={[styles.yearChipText, active && styles.yearChipTextActive]}>ปี ค.ศ. {y}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>พบข้อมูลไม่ครบ {stats.total} โครงการ</Text>
          </View>
        </ScrollView>

        <View style={styles.summaryGrid}>
          <SummaryCard icon="🗂️" label="โครงการไม่ครบ" value={stats.total} color="#dc2626" sub="โครงการที่ยังขาดข้อมูล" />
          <SummaryCard icon="🚨" label="ระดับวิกฤต" value={stats.high} color="#ef4444" sub="ขาดข้อมูล ≥ 5 จุด" />
          <SummaryCard icon="⚠️" label="ระดับปานกลาง" value={stats.mid} color="#f59e0b" sub="ขาดข้อมูล 3–4 จุด" />
          <SummaryCard icon="📋" label="จุดรวมที่ต้องกรอก" value={stats.pts} color="#0891b2" sub="fields ทั้งหมดที่ขาด" />
        </View>

        {stats.total > 0 ? (
          <>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color="#94a3b8" />
              <TextInput style={styles.searchInput} placeholder="ค้นหาโครงการ / ลูกค้า / รหัส..." placeholderTextColor="#94a3b8" value={search} onChangeText={setSearch} />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#cbd5e1" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {FILTER_BUTTONS.map((f) => {
                const active = filter === f.key;
                return (
                  <TouchableOpacity key={f.key} onPress={() => setFilter(f.key)} style={[styles.filterBtn, active && styles.filterBtnActive]}>
                    <Text style={[styles.filterBtnText, active && styles.filterBtnTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
              {SORT_OPTIONS.map((s) => {
                const active = sort === s.key;
                return (
                  <TouchableOpacity key={s.key} onPress={() => setSort(s.key)} style={[styles.sortChip, active && styles.sortChipActive]}>
                    <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.resultsMeta}>
              <Text style={styles.resultCount}>
                แสดง {filtered.length} จาก {projects.length} โครงการ
              </Text>
              <TouchableOpacity style={styles.expandAllBtn} onPress={toggleExpandAll}>
                <Ionicons name={allExpanded ? 'contract-outline' : 'expand-outline'} size={13} color="#475569" />
                <Text style={styles.expandAllBtnText}>{allExpanded ? 'ยุบทั้งหมด' : 'ขยายทั้งหมด'}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </View>
    );
  }

  function renderCard({ item: p }: { item: IncompleteProject }) {
    const sv = severity(p.total);
    const sm = SEV_META[sv];
    const pct = Math.min(100, Math.round((p.total / MAX_PTS) * 100));
    const cats = categoriesOf(p);
    const expanded = expandedIds.has(p.id);

    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.cardHeader} onPress={() => toggleCard(p.id)} activeOpacity={0.7}>
          <View style={[styles.sevStripe, { backgroundColor: sm.color }]} />
          <View style={{ flex: 1 }}>
            <View style={styles.cardTopRow}>
              <Text style={styles.projCode}>{p.display}</Text>
              <View style={[styles.sevBadge, { backgroundColor: sm.bg }]}>
                <Text style={[styles.sevBadgeText, { color: sm.text }]}>{sm.label}</Text>
              </View>
            </View>
            <Text style={styles.projName} numberOfLines={expanded ? undefined : 1}>
              {p.name}
            </Text>
            <View style={styles.projCustomerRow}>
              <Ionicons name="person" size={10} color="#94a3b8" />
              <Text style={styles.projCustomer}>{p.customer}</Text>
            </View>

            <View style={styles.progressRow}>
              <Text style={[styles.progressLabel, { color: sm.color }]}>ขาด {p.total} จุด</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: sm.color }]} />
              </View>
              <Text style={styles.progressPct}>{pct}%</Text>
            </View>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#94a3b8" />
        </TouchableOpacity>

        {expanded && (
          <View style={styles.cardBody}>
            {cats.map((c) => {
              const meta = CAT_META[c.key];
              return (
                <View key={c.key} style={styles.missGroup}>
                  <View style={styles.missGroupTitleRow}>
                    <View style={[styles.missDot, { backgroundColor: meta.dot }]} />
                    <Text style={[styles.missGroupTitle, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <View style={styles.missChipsRow}>
                    {c.items.map((m) => (
                      <View key={m} style={styles.missChip}>
                        <Ionicons name="close-circle" size={11} color="#ef4444" />
                        <Text style={styles.missChipText}>{m}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}

            <View style={styles.cardFooter}>
              <View style={styles.catSummaryRow}>
                {cats.map((c) => {
                  const meta = CAT_META[c.key];
                  return (
                    <View key={c.key} style={[styles.catPill, { backgroundColor: meta.bg }]}>
                      <View style={[styles.missDot, { backgroundColor: meta.dot }]} />
                      <Text style={[styles.catPillText, { color: meta.color }]}>
                        {meta.label} ({c.items.length})
                      </Text>
                    </View>
                  );
                })}
              </View>
              <TouchableOpacity style={styles.editBtn} onPress={() => goEditProject(p)}>
                <Ionicons name="create-outline" size={14} color="#fff" />
                <Text style={styles.editBtnText}>ไปเติมข้อมูล</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  if (loading && projects.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.emptyBox}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.emptyText}>กำลังโหลดข้อมูล...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={filtered}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderCard}
        ListHeaderComponent={renderHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#dc2626']} tintColor="#dc2626" />}
        ListEmptyComponent={
          error ? (
            <View style={styles.emptyBox}>
              <Ionicons name="alert-circle-outline" size={30} color="#ef4444" />
              <Text style={styles.emptyText}>{error}</Text>
              <TouchableOpacity style={styles.editBtn} onPress={() => loadData()}>
                <Text style={styles.editBtnText}>ลองใหม่</Text>
              </TouchableOpacity>
            </View>
          ) : stats.total > 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="search-outline" size={26} color="#cbd5e1" />
              <Text style={styles.emptyText}>ไม่พบโครงการที่ตรงกับเงื่อนไข</Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-circle" size={36} color="#22c55e" />
              <Text style={styles.emptyTitle}>ยอดเยี่ยมมาก!</Text>
              <Text style={styles.emptyText}>ทุกโครงการในปี ค.ศ. {selectedYear ?? 0} มีข้อมูลครบถ้วนสมบูรณ์ครับ</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function SummaryCard({ icon, label, value, color, sub }: { icon: string; label: string; value: number; color: string; sub: string }) {
  return (
    <View style={styles.scard}>
      <View style={[styles.scardAccent, { backgroundColor: color }]} />
      <Text style={styles.scardIcon}>{icon}</Text>
      <Text style={styles.scardLabel}>{label}</Text>
      <Text style={[styles.scardVal, { color }]}>{value}</Text>
      <Text style={styles.scardSub}>{sub}</Text>
    </View>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f0f4f8' },

  titleBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12 },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },

  yearRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 8, alignItems: 'center' },
  yearChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 7 },
  yearChipActive: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  yearChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  yearChipTextActive: { color: '#fff' },
  totalBadge: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 7 },
  totalBadgeText: { fontSize: 11.5, fontWeight: '700', color: '#b91c1c' },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14 },
  scard: { width: '48%', backgroundColor: '#fff', borderRadius: 12, padding: 12, overflow: 'hidden' },
  scardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  scardIcon: { fontSize: 18, marginBottom: 4 },
  scardLabel: { fontSize: 10.5, color: '#64748b', fontWeight: '700' },
  scardVal: { fontSize: 22, fontWeight: '900', marginTop: 2 },
  scardSub: { fontSize: 9.5, color: '#94a3b8', marginTop: 2 },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 12.5, color: '#0f172a' },

  filterRow: { paddingHorizontal: 14, paddingTop: 10, gap: 6 },
  filterBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 7 },
  filterBtnActive: { backgroundColor: '#334155', borderColor: '#334155' },
  filterBtnText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  filterBtnTextActive: { color: '#fff' },

  sortRow: { paddingHorizontal: 14, paddingTop: 8, gap: 6 },
  sortChip: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  sortChipActive: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  sortChipText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  sortChipTextActive: { color: '#1d4ed8', fontWeight: '700' },

  resultsMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, marginTop: 12, marginBottom: 4 },
  resultCount: { fontSize: 11.5, color: '#64748b', fontWeight: '600' },
  expandAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 6 },
  expandAllBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },

  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 14, marginTop: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 10 },
  sevStripe: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  projCode: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  sevBadge: { borderRadius: 50, paddingHorizontal: 9, paddingVertical: 3 },
  sevBadgeText: { fontSize: 10.5, fontWeight: '700' },
  projName: { fontSize: 12.5, color: '#334155', fontWeight: '700', marginTop: 5 },
  projCustomerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  projCustomer: { fontSize: 11, color: '#94a3b8' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  progressLabel: { fontSize: 11, fontWeight: '700', width: 62 },
  progressTrack: { flex: 1, height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressPct: { fontSize: 10, color: '#94a3b8', fontWeight: '600', width: 32, textAlign: 'right' },

  cardBody: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  missGroup: { marginBottom: 10 },
  missGroupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  missDot: { width: 6, height: 6, borderRadius: 3 },
  missGroupTitle: { fontSize: 11.5, fontWeight: '800' },
  missChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  missChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fef2f2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  missChipText: { fontSize: 10.5, color: '#b91c1c', fontWeight: '600' },

  cardFooter: { marginTop: 4, gap: 10 },
  catSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 9, paddingVertical: 4 },
  catPillText: { fontSize: 10, fontWeight: '700' },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#334155', borderRadius: 8, paddingVertical: 10 },
  editBtnText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8, paddingHorizontal: 30 },
  emptyTitle: { color: '#166534', fontSize: 15, fontWeight: '800', marginTop: 4 },
  emptyText: { color: '#94a3b8', fontSize: 12.5, textAlign: 'center' },
});