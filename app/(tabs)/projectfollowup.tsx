/**
 * ProjectFollowupScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า project_followup.php (ติดตามหนี้ — บันทึกการติดตาม)
 * เปิดจากปุ่ม "ติดตาม" ในหน้า AccountingDashboard ผ่าน expo-router:
 *   router.push({ pathname: '/ProjectFollowup', params: { id } })
 * จึงอ่าน id ผ่าน useLocalSearchParams() ตรงๆ เหมือนไฟล์อื่นในชุดนี้
 *
 * สถานะไฟล์นี้: เชื่อม API จริงแล้ว (GET โหลดข้อมูลโครงการ+ประวัติติดตาม, POST ajax_save บันทึก)
 * ผ่าน project_followup.php — action/param names เป็นการเดาตาม TODO เดิม ยังไม่ได้ยืนยันกับ backend จริง
 *
 * ตรงกับพฤติกรรมจริงจาก project_followup.php:
 *  - หน้านี้บันทึก "เฉพาะสถานะกลุ่มติดตาม" เท่านั้น (ไม่ใช่สถานะจ่ายเงิน — อันนั้นอยู่หน้า
 *    ลงบัญชี) ตรงกับข้อความเตือนสีเหลืองในต้นฉบับเป๊ะ
 *  - การ์ดข้อมูลโครงการด้านบน: เลขหน้างาน/งบประมาณ+จ่ายแล้ว/ค้างชำระ/บริษัท/ชื่อโครงการ/
 *    ลูกค้า/ข้อมูลติดต่อ/ที่อยู่ (โชว์เฉพาะที่มีข้อมูล)
 *  - แต่ละ "ครั้งที่ติดตาม" มี: ชื่อครั้ง, วันเวลาที่บันทึก (ระบบประทับให้อัตโนมัติ ไม่ให้กรอกเอง),
 *    สถานะติดตาม, ธนาคาร(เข้าเช็ค), ผู้บันทึก (ล็อกเป็นผู้ใช้ปัจจุบันสำหรับรายการใหม่), หมายเหตุ
 *  - รายการเดิมเริ่มแบบพับ (แสดงสรุป) กดปุ่ม "แก้ไข" เพื่อขยายดู/แก้ไขฟิลด์ — รายการใหม่ขยายอยู่แล้ว
 *  - ลบรายการเดิม (ที่เคยบันทึกในระบบ) ต้อง confirm ก่อนเสมอ เพราะลบแล้วประวัติหายถาวร
 *
 * ที่ตัดออก/ทำให้ง่ายลง (เกินขอบเขต mockup):
 *  - "จัดการสถานะ" (เพิ่ม/ลบ/แก้ไขตัวเลือกสถานะติดตามเอง) — เป็นฟีเจอร์ตั้งค่าระดับแอดมิน
 *  - ตารางประวัติการแก้ไขละเอียด (edit log popup) — ย่อเหลือป้าย "แก้ไขล่าสุดโดย" บรรทัดเดียว
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons expo-router
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// ✅ Config
import { API_BASE } from '../../constants/config';

// endpoint นี้ไม่มี action param ตาม TODO เดิมของไฟล์นี้ (?id=projectId, ajax_save=1 ตอนบันทึก)
// ส่วนฝั่งโหลดข้อมูล (project info + ประวัติการติดตามที่มีอยู่แล้ว) เป็นการเดา — ยังไม่ได้ยืนยันกับ backend จริงทั้งคู่
const API_URL = `${API_BASE}/project_followup.php`;

// ====================================================================
// Types
// ====================================================================

interface FollowupEntry {
  id: string;
  isNew: boolean;
  name: string;
  status: string;
  bankName: string;
  remark: string;
  owner: string;
  createdAtShow?: string;
  editedBy?: string;
}

interface ProjectInfo {
  jobNo: string;
  company: string;
  projectName: string;
  customer: string;
  budget: number;
  paid: number;
  contact?: string;
  address?: string;
}

export interface ProjectFollowupScreenProps {
  id?: string; // ถ้าส่งมาตรงๆ (เช่น embed จาก AccountingDashboard) จะใช้ค่านี้แทนค่าจาก route params
  onBack?: () => void;
  onSaved?: () => void;
}

// ====================================================================
// Mock data — ใช้ id เดียวกับ AccountingDashboard.tsx (544-548) เพื่อความสอดคล้อง
// ====================================================================

const CURRENT_USER = 'คุณธนา';
const CALL_STATUSES = ['กำลังติดตาม', 'นัดโทรกลับ', 'ติดต่อไม่ได้', 'รอเอกสารจากลูกค้า', 'ปิดติดตามแล้ว'];
const BANK_LIST = ['ธนาคารกรุงไทย', 'ธนาคารกสิกรไทย', 'ธนาคารไทยพาณิชย์', 'ธนาคารกรุงเทพ'];

const EMPTY_PROJECT: ProjectInfo = { jobNo: '', company: '', projectName: '', customer: '', budget: 0, paid: 0 };

// แปลงข้อมูลดิบจาก backend ให้เข้ารูป ProjectInfo/FollowupEntry — รองรับหลายชื่อ field เพราะยังไม่มี spec ยืนยัน
function mapProjectInfo(raw: any): ProjectInfo {
  return {
    jobNo: String(raw.jobNo ?? raw.job_no ?? ''),
    company: String(raw.company ?? raw.company_name ?? ''),
    projectName: String(raw.projectName ?? raw.project_name ?? ''),
    customer: String(raw.customer ?? raw.customer_name ?? ''),
    budget: Number(raw.budget ?? raw.project_budget ?? 0),
    paid: Number(raw.paid ?? raw.paid_gross ?? 0),
    contact: raw.contact ?? undefined,
    address: raw.address ?? undefined,
  };
}

function mapFollowupEntry(raw: any): FollowupEntry {
  return {
    id: String(raw.id ?? raw.fu_id ?? uid()),
    isNew: false,
    name: String(raw.name ?? raw.followup_name ?? ''),
    status: String(raw.status ?? raw.call_status ?? CALL_STATUSES[0]),
    bankName: String(raw.bankName ?? raw.bank_name ?? ''),
    remark: String(raw.remark ?? ''),
    owner: String(raw.owner ?? raw.owner_name ?? CURRENT_USER),
    createdAtShow: raw.createdAtShow ?? raw.created_at_show ?? undefined,
    editedBy: raw.editedBy ?? raw.edited_by ?? undefined,
  };
}

let uidCounter = 1;
function uid(): string {
  uidCounter += 1;
  return `fu_new_${Date.now()}_${uidCounter}`;
}

function mkEntry(): FollowupEntry {
  return { id: uid(), isNew: true, name: '', status: CALL_STATUSES[0], bankName: '', remark: '', owner: CURRENT_USER };
}

function num(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ====================================================================
// Main screen
// ====================================================================

export default function ProjectFollowupScreen({ id, onBack, onSaved }: ProjectFollowupScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const projectId = id ?? params.id ?? '547';

  const [project, setProject] = useState<ProjectInfo>(EMPTY_PROJECT);
  const [entries, setEntries] = useState<FollowupEntry[]>([mkEntry()]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const outstanding = Math.max(project.budget - project.paid, 0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await axios.get(API_URL, { params: { id: projectId } });
      const d = res.data?.data ?? res.data;
      const proj = mapProjectInfo(d?.project ?? d ?? {});
      const rawEntries = Array.isArray(d?.followups ?? d?.entries) ? d.followups ?? d.entries : [];
      const mapped: FollowupEntry[] = rawEntries.length > 0 ? rawEntries.map(mapFollowupEntry) : [mkEntry()];
      setProject(proj);
      setEntries(mapped);
      setExpandedIds(new Set(mapped.filter((e) => e.isNew).map((e) => e.id)));
    } catch (e) {
      console.error('load project_followup failed', e);
      setLoadError('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleBack() {
    if (onBack) return onBack();
    if (router.canGoBack()) return router.back();
    router.push('/accounting_dashboard' as never);
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addEntry() {
    const e = mkEntry();
    e.name = `ครั้งที่ ${entries.length + 1}`;
    setEntries((prev) => [...prev, e]);
    setExpandedIds((prev) => new Set(prev).add(e.id));
  }

  function removeEntry(entry: FollowupEntry) {
    if (!entry.isNew) {
      Alert.alert('ยืนยันการลบครั้งนี้?', 'ครั้งนี้เป็น "ข้อมูลในระบบ" หากลบทิ้งและกดบันทึก ประวัติจะหายไปอย่างถาวร', [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ยืนยันการลบ', style: 'destructive', onPress: () => setEntries((prev) => prev.filter((e) => e.id !== entry.id)) },
      ]);
    } else {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    }
  }

  function updateEntry(id: string, field: keyof FollowupEntry, value: string) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  }

  async function handleSave() {
    const invalid = entries.some((e) => !e.name.trim());
    if (invalid) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุ "ชื่อครั้ง" ให้ครบทุกรายการก่อนบันทึก');
      return;
    }

    // payload ตรงกับ TODO เดิมของไฟล์นี้ — ชื่อ field แบบ array ต่อครั้ง เรียงตามลำดับ entries
    const fd = new FormData();
    fd.append('ajax_save', '1');
    entries.forEach((e) => {
      fd.append('fu_id[]', e.isNew ? '' : e.id);
      fd.append('followup_name[]', e.name);
      fd.append('call_status[]', e.status);
      fd.append('bank_name[]', e.bankName);
      fd.append('remark[]', e.remark);
    });

    setSaving(true);
    try {
      const res = await axios.post(`${API_URL}?id=${encodeURIComponent(projectId)}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.status === 'success' || res.data?.success) {
        Alert.alert('บันทึกสำเร็จ', `บันทึกการติดตาม ${entries.length} รายการเรียบร้อยแล้ว!`, [
          { text: 'ตกลง', onPress: () => (onSaved ? onSaved() : handleBack()) },
        ]);
      } else {
        Alert.alert('บันทึกไม่สำเร็จ', res.data?.message || 'กรุณาลองใหม่อีกครั้ง');
      }
    } catch (e) {
      console.error('save project_followup failed', e);
      Alert.alert('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ActivityIndicator size="large" color="#d97706" />
          <Text style={{ color: '#94a3b8', fontSize: 12.5 }}>กำลังโหลดข้อมูล...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 }}>
          <Ionicons name="alert-circle-outline" size={28} color="#ef4444" />
          <Text style={{ color: '#64748b', fontSize: 13, textAlign: 'center' }}>{loadError}</Text>
          <TouchableOpacity style={styles.addBtn} onPress={loadData}>
            <Text style={styles.addBtnText}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.headerCard}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={18} color="#fff" />
            <Text style={styles.backBtnText}>กลับ</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="headset-outline" size={17} color="#fff" />
            <Text style={styles.headerTitle}>ติดตามหนี้ (บันทึกการติดตาม)</Text>
          </View>
          <Text style={styles.headerSubtitle}>บันทึกการโทร/ทวงแต่ละครั้ง — ส่วนยอดเงินลงที่หน้า "ลงบัญชี"</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.infoPanel}>
            <View style={styles.infoBadge}>
              <Ionicons name="folder-open-outline" size={11} color="#92400e" />
              <Text style={styles.infoBadgeText}>ข้อมูลโครงการ</Text>
            </View>
            <View style={styles.infoGrid}>
              <InfoItem icon="pricetag-outline" label="เลขหน้างาน" value={`#${project.jobNo}`} valueColor="#d97706" />
              <InfoItem icon="business-outline" label="บริษัท" value={project.company} />
              <InfoItem icon="cash-outline" label="งบประมาณรวม" value={`${num(project.budget)} ฿`} valueColor="#059669" sub={`จ่ายแล้ว: ${num(project.paid)} ฿`} />
              <InfoItem icon="alert-circle-outline" label="ค้างชำระ" value={`${num(outstanding)} ฿`} valueColor="#dc2626" />
            </View>
            <InfoItem icon="git-network-outline" label="ชื่องบ / โครงการ" value={project.projectName} full />
            <InfoItem icon="person-outline" label="ลูกค้า" value={project.customer} valueColor="#2563eb" full />
            {!!project.contact && <InfoItem icon="call-outline" label="ข้อมูลติดต่อ" value={project.contact} full small />}
            {!!project.address && <InfoItem icon="location-outline" label="ที่อยู่ลูกค้า" value={project.address} full small />}
          </View>

          <View style={styles.warnBanner}>
            <Ionicons name="information-circle" size={14} color="#92400e" />
            <Text style={styles.warnBannerText}>
              <Text style={{ fontWeight: '800' }}>หน้านี้บันทึกเฉพาะการติดตาม</Text> — สถานะ "จ่ายเงินแล้ว" ให้ไปลงที่หน้า "ลงบัญชี" พร้อมยอดเงิน
              วันเวลาของแต่ละครั้งระบบประทับให้อัตโนมัติตอนกดบันทึก
            </Text>
          </View>

          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="call-outline" size={15} color="#b45309" />
              <Text style={styles.sectionHeaderText}>ประวัติการติดตาม</Text>
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={addEntry}>
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={styles.addBtnText}>เพิ่มการติดตาม</Text>
            </TouchableOpacity>
          </View>

          {entries.map((e, idx) => {
            const expanded = expandedIds.has(e.id);
            return (
              <View key={e.id} style={[styles.entryCard, e.isNew && styles.entryCardNew]}>
                <View style={styles.entryTopRow}>
                  <View style={[styles.entryBadge, e.isNew ? styles.entryBadgeNew : styles.entryBadgeExisting]}>
                    <Ionicons name={e.isNew ? 'sparkles' : 'server'} size={10} color={e.isNew ? '#7c3aed' : '#0891b2'} />
                    <Text style={[styles.entryBadgeText, { color: e.isNew ? '#7c3aed' : '#0891b2' }]}>{e.isNew ? 'รายการใหม่ (รอเซฟ)' : 'ข้อมูลในระบบ'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeEntry(e)} style={styles.entryDeleteBtn}>
                    <Ionicons name="close" size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                {!e.isNew && !expanded ? (
                  <TouchableOpacity onPress={() => toggleExpand(e.id)} activeOpacity={0.7}>
                    <Text style={styles.collapsedName}>{e.name || `ครั้งที่ ${idx + 1}`}</Text>
                    <View style={styles.collapsedMetaRow}>
                      <Text style={styles.collapsedMeta}>🕐 {e.createdAtShow}</Text>
                      <Text style={styles.collapsedMeta}>👤 {e.owner}</Text>
                    </View>
                    <View style={styles.collapsedStatusBadge}>
                      <Text style={styles.collapsedStatusBadgeText}>{e.status || '-'}</Text>
                    </View>
                    {!!e.editedBy && <Text style={styles.editedByText}>แก้ไขล่าสุดโดย: {e.editedBy}</Text>}
                    {!!e.remark && (
                      <Text style={styles.collapsedRemark} numberOfLines={2}>
                        {e.remark}
                      </Text>
                    )}
                    <View style={styles.expandBtn}>
                      <Ionicons name="create-outline" size={12} color="#475569" />
                      <Text style={styles.expandBtnText}>แก้ไข</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View>
                    <FieldLabel text="ชื่อครั้ง" required />
                    <TextInput style={styles.input} placeholder="เช่น ครั้งที่ 1" placeholderTextColor="#94a3b8" value={e.name} onChangeText={(v) => updateEntry(e.id, 'name', v)} />

                    <FieldLabel text="วันเวลาที่บันทึก" />
                    <View style={styles.stampBox}>
                      <Ionicons name="calendar-outline" size={13} color="#d97706" />
                      <Text style={styles.stampBoxText}>{e.isNew ? 'ระบบจะประทับให้เมื่อกดบันทึก' : e.createdAtShow}</Text>
                    </View>

                    <FieldLabel text="สถานะติดตาม" />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                      {CALL_STATUSES.map((s) => (
                        <TouchableOpacity key={s} onPress={() => updateEntry(e.id, 'status', s)} style={[styles.chip, e.status === s && styles.chipActive]}>
                          <Text style={[styles.chipText, e.status === s && styles.chipTextActive]}>{s}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <FieldLabel text="ธนาคาร (เข้าเช็ค)" />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                      <TouchableOpacity onPress={() => updateEntry(e.id, 'bankName', '')} style={[styles.chip, e.bankName === '' && styles.chipActive]}>
                        <Text style={[styles.chipText, e.bankName === '' && styles.chipTextActive]}>ไม่ระบุ</Text>
                      </TouchableOpacity>
                      {BANK_LIST.map((b) => (
                        <TouchableOpacity key={b} onPress={() => updateEntry(e.id, 'bankName', b)} style={[styles.chip, e.bankName === b && styles.chipActive]}>
                          <Text style={[styles.chipText, e.bankName === b && styles.chipTextActive]}>{b}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <FieldLabel text="ผู้บันทึก" />
                    <View style={styles.stampBox}>
                      <Ionicons name="person-outline" size={13} color="#059669" />
                      <Text style={styles.stampBoxText}>{e.owner || '—'}</Text>
                    </View>

                    <FieldLabel text="รายละเอียด / หมายเหตุ" />
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      placeholder="เช่น ลูกค้าแจ้งว่ารอเบิกงบ..."
                      placeholderTextColor="#94a3b8"
                      multiline
                      value={e.remark}
                      onChangeText={(v) => updateEntry(e.id, 'remark', v)}
                    />

                    {!e.isNew && (
                      <TouchableOpacity onPress={() => toggleExpand(e.id)} style={styles.collapseBtn}>
                        <Ionicons name="chevron-up" size={13} color="#475569" />
                        <Text style={styles.collapseBtnText}>พับเก็บ</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleBack}>
              <Ionicons name="arrow-back" size={15} color="#475569" />
              <Text style={styles.cancelBtnText}>กลับไปหน้าหลัก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={16} color="#fff" />}
              <Text style={styles.saveBtnText}>{saving ? 'กำลังบันทึก...' : 'บันทึกการติดตาม'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoItem({
  icon,
  label,
  value,
  valueColor,
  sub,
  full,
  small,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
  full?: boolean;
  small?: boolean;
}) {
  return (
    <View style={[styles.infoItem, full && { width: '100%' }]}>
      <View style={styles.infoItemLabelRow}>
        <Ionicons name={icon} size={11} color="#94a3b8" />
        <Text style={styles.infoItemLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoItemValue, valueColor ? { color: valueColor } : null, small && { fontSize: 11.5, fontWeight: '600' }]}>{value}</Text>
      {!!sub && <Text style={styles.infoItemSub}>{sub}</Text>}
    </View>
  );
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {text} {required ? <Text style={styles.required}>*</Text> : null}
    </Text>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8faff' },

  headerCard: { backgroundColor: '#d97706', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 10 },
  backBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, marginTop: 6 },

  body: { padding: 16 },

  infoPanel: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  infoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#fffbeb', borderRadius: 50, paddingHorizontal: 9, paddingVertical: 4, marginBottom: 10 },
  infoBadgeText: { fontSize: 10, fontWeight: '800', color: '#92400e' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  infoItem: { width: '47%', marginBottom: 10 },
  infoItemLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  infoItemLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600' },
  infoItemValue: { fontSize: 13, color: '#1e293b', fontWeight: '700' },
  infoItemSub: { fontSize: 10.5, color: '#0ea5e9', fontWeight: '600', marginTop: 3 },

  warnBanner: { flexDirection: 'row', gap: 8, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 12, marginTop: 14 },
  warnBannerText: { flex: 1, fontSize: 11.5, color: '#92400e', lineHeight: 17 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  sectionHeaderText: { fontSize: 13, fontWeight: '800', color: '#334155' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#d97706', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  addBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  entryCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 12 },
  entryCardNew: { borderColor: '#c4b5fd', backgroundColor: '#faf5ff' },
  entryTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  entryBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3 },
  entryBadgeNew: { backgroundColor: '#f5f3ff' },
  entryBadgeExisting: { backgroundColor: '#f0f9ff' },
  entryBadgeText: { fontSize: 9.5, fontWeight: '700' },
  entryDeleteBtn: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },

  collapsedName: { fontSize: 13.5, fontWeight: '800', color: '#1e293b' },
  collapsedMetaRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  collapsedMeta: { fontSize: 11, color: '#64748b' },
  collapsedStatusBadge: { alignSelf: 'flex-start', backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, marginTop: 6 },
  collapsedStatusBadgeText: { fontSize: 11, color: '#334155', fontWeight: '700' },
  editedByText: { fontSize: 10.5, color: '#2563eb', fontWeight: '700', marginTop: 6 },
  collapsedRemark: { fontSize: 11.5, color: '#64748b', marginTop: 6 },
  expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10 },
  expandBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 5, marginTop: 9 },
  required: { color: '#ef4444' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 12.5, color: '#0f172a', backgroundColor: '#fff' },
  textarea: { minHeight: 56, textAlignVertical: 'top' },

  stampBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9 },
  stampBoxText: { fontSize: 11.5, color: '#64748b', fontWeight: '600' },

  chipsRow: { gap: 6, paddingVertical: 2 },
  chip: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 11, paddingVertical: 7 },
  chipActive: { backgroundColor: '#d97706', borderColor: '#d97706' },
  chipText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  collapseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 14, paddingVertical: 7, marginTop: 14 },
  collapseBtnText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },

  footerRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 14 },
  cancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  saveBtn: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#d97706', borderRadius: 12, paddingVertical: 14 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});