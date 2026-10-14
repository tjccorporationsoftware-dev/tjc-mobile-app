/**
 * ProjectFollowupScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า project_followup.php (ติดตามหนี้ — บันทึกการติดตาม)
 * เปิดจากปุ่ม "ติดตาม" ในหน้า AccountingDashboard ผ่าน expo-router:
 *   router.push({ pathname: '/ProjectFollowup', params: { id } })
 * จึงอ่าน id ผ่าน useLocalSearchParams() ตรงๆ เหมือนไฟล์อื่นในชุดนี้
 *
 * สถานะไฟล์นี้: เชื่อม API จริงแล้ว — project_followup.php (เว็บ) ถูกบังคับผ่าน auth.php ที่ต้อง
 * มี PHP session cookie จาก login หน้าเว็บ แต่แอปมือถือ login แบบ stateless (ไม่มี session) จึงยิง
 * ตรงไม่ได้เลย (โดน redirect ไป login.php เงียบๆ) เปลี่ยนมาใช้ project_API_mobile.php แทน:
 * action=get_followup_detail (โหลดข้อมูลโครงการ+ประวัติติดตาม+ตัวเลือกสถานะ/ธนาคารจริง) และ
 * action=save_followup (บันทึกทั้งชุด) — พอร์ตตรรกะจาก project_followup.php มาไว้ในโมดูลมือถือ
 * ยืนยันตัวตนด้วย user_id แทน session ทั้งสอง action ยืนยันแล้วว่าทำงานจริง (ทดสอบ insert/edit/
 * delete/cross-user-attribution ครบก่อนส่งมอบ)
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
import { ActivityIndicator, Alert, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../_layout';
// ✅ Config
import { API_MODULES } from '../../constants/config';
import { formatShortThaiDateTime } from '../../components/DateTimeField';
import { apiMobileGet } from '../../service/api_mobile';

const PROJECT_API_URL = `${API_MODULES}/project_API_mobile.php`;

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
// ค่าเริ่มต้น/ตัวช่วย — ตัวเลือกสถานะติดตาม/ธนาคารจริงโหลดจาก get_followup_detail (call_statuses/
// bank_list) ตอนเปิดหน้า ไม่ใช่ mock อีกต่อไป — ใช้ fallback นี้แค่ระหว่างรอโหลดครั้งแรก
// ====================================================================

const FALLBACK_STATUSES = ['กำลังติดตาม', 'นัดโทรกลับ', 'ติดต่อไม่ได้', 'รอเอกสารจากลูกค้า', 'ปิดติดตามแล้ว'];

const EMPTY_PROJECT: ProjectInfo = { jobNo: '', company: '', projectName: '', customer: '', budget: 0, paid: 0 };

// แปลงข้อมูลดิบจาก get_followup_detail (project_API_mobile.php) ให้เข้ารูป ProjectInfo/FollowupEntry
// ชื่อคีย์ยึดตาม action จริงที่ยืนยันแล้ว (ไม่ใช่การเดาอีกต่อไป)
function mapProjectInfo(raw: any): ProjectInfo {
  return {
    jobNo: String(raw.job_no ?? ''),
    company: String(raw.company_name ?? ''),
    projectName: String(raw.project_name ?? ''),
    customer: String(raw.customer_name ?? ''),
    budget: Number(raw.project_budget ?? 0),
    paid: Number(raw.paid_gross ?? 0),
    contact: raw.contact || undefined,
    address: raw.address || undefined,
  };
}

function mapFollowupEntry(raw: any, currentUser: string): FollowupEntry {
  return {
    id: String(raw.id ?? uid()),
    isNew: false,
    name: String(raw.followup_name ?? ''),
    status: String(raw.call_status ?? ''),
    bankName: String(raw.bank_name ?? ''),
    remark: String(raw.remark ?? ''),
    owner: String(raw.created_by || currentUser),
    createdAtShow: raw.created_at || raw.status_updated_at || undefined,
    editedBy: raw.edited_by || undefined,
  };
}

let uidCounter = 1;
function uid(): string {
  uidCounter += 1;
  return `fu_new_${Date.now()}_${uidCounter}`;
}

function mkEntry(currentUser: string, defaultStatus: string): FollowupEntry {
  return { id: uid(), isNew: true, name: '', status: defaultStatus, bankName: '', remark: '', owner: currentUser };
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
  const { user } = useAuth();
  const userId = (user as any)?.id;
  const currentUserName = (user as any)?.fullname || 'ไม่ระบุ';

  const [project, setProject] = useState<ProjectInfo>(EMPTY_PROJECT);
  const [entries, setEntries] = useState<FollowupEntry[]>([]);
  const [callStatuses, setCallStatuses] = useState<string[]>(FALLBACK_STATUSES);
  const [bankList, setBankList] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ป๊อปอัพเลือกตัวเลือกแบบใช้ร่วมกันทุกช่อง (แทนที่ chip picker แบบเลื่อนแนวนอนเดิม)
  const [pickerModal, setPickerModal] = useState<{
    visible: boolean;
    title: string;
    options: { value: string; label: string }[];
    current: string;
    onSelect: (v: string) => void;
  }>({ visible: false, title: '', options: [], current: '', onSelect: () => {} });
  function openPicker(title: string, options: { value: string; label: string }[], current: string, onSelect: (v: string) => void) {
    setPickerModal({ visible: true, title, options, current, onSelect });
  }
  const [saving, setSaving] = useState(false);

  const outstanding = Math.max(project.budget - project.paid, 0);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiMobileGet(PROJECT_API_URL, 'get_followup_detail', { user_id: userId, project_id: projectId });
      const proj = mapProjectInfo(res.project ?? {});
      const statuses: string[] = Array.isArray(res.call_statuses) && res.call_statuses.length > 0 ? res.call_statuses : FALLBACK_STATUSES;
      const banks: string[] = Array.isArray(res.bank_list) ? res.bank_list : [];
      const actor = String(res.current_user || currentUserName);
      const rawEntries: any[] = Array.isArray(res.followups) ? res.followups : [];
      const mapped: FollowupEntry[] = rawEntries.length > 0 ? rawEntries.map((r) => mapFollowupEntry(r, actor)) : [mkEntry(actor, statuses[0] ?? '')];
      setProject(proj);
      setCallStatuses(statuses);
      setBankList(banks);
      setEntries(mapped);
      setExpandedIds(new Set(mapped.filter((e) => e.isNew).map((e) => e.id)));
    } catch (e: any) {
      console.error('load project_API_mobile get_followup_detail failed', e);
      setLoadError(e?.message || 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [projectId, userId, currentUserName]);

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
    const e = mkEntry(currentUserName, callStatuses[0] ?? '');
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
    if (!userId) return;
    const invalid = entries.some((e) => !e.name.trim());
    if (invalid) {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุ "ชื่อครั้ง" ให้ครบทุกรายการก่อนบันทึก');
      return;
    }

    // save_followup (project_API_mobile.php) อ่าน $_REQUEST['followup_name'] เป็น array ต่อครั้ง
    // เรียงตามลำดับ entries เหมือนเดิม — apiMobilePost ไม่รองรับ key ซ้ำ จึงประกอบ body เองตรงนี้
    const body = new URLSearchParams();
    body.append('action', 'save_followup');
    body.append('user_id', String(userId));
    body.append('project_id', String(projectId));
    entries.forEach((e) => {
      body.append('fu_id[]', e.isNew ? '' : e.id);
      body.append('followup_name[]', e.name);
      body.append('call_status[]', e.status);
      body.append('bank_name[]', e.bankName);
      body.append('remark[]', e.remark);
    });

    setSaving(true);
    try {
      const res = await axios.post(PROJECT_API_URL, body.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (res.data?.status === 'success') {
        Alert.alert('บันทึกสำเร็จ', `บันทึกการติดตาม ${res.data.saved ?? entries.length} รายการเรียบร้อยแล้ว!`, [
          { text: 'ตกลง', onPress: () => (onSaved ? onSaved() : handleBack()) },
        ]);
      } else {
        Alert.alert('บันทึกไม่สำเร็จ', res.data?.message || 'กรุณาลองใหม่อีกครั้ง');
      }
    } catch (e: any) {
      console.error('save_followup failed', e);
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
                      <Text style={styles.collapsedMeta}>🕐 {formatShortThaiDateTime(e.createdAtShow)}</Text>
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
                      <Text style={styles.stampBoxText}>{e.isNew ? 'ระบบจะประทับให้เมื่อกดบันทึก' : formatShortThaiDateTime(e.createdAtShow)}</Text>
                    </View>

                    <FieldLabel text="สถานะติดตาม" />
                    <PickerTrigger
                      label={e.status}
                      placeholder="เลือกสถานะ..."
                      onPress={() => openPicker('สถานะติดตาม', callStatuses.map((s) => ({ value: s, label: s })), e.status, (v) => updateEntry(e.id, 'status', v))}
                    />

                    <FieldLabel text="ธนาคาร (เข้าเช็ค)" />
                    <PickerTrigger
                      label={e.bankName}
                      placeholder="ไม่ระบุ"
                      onPress={() =>
                        openPicker(
                          'ธนาคาร (เข้าเช็ค)',
                          [{ value: '', label: 'ไม่ระบุ' }, ...bankList.map((b) => ({ value: b, label: b }))],
                          e.bankName,
                          (v) => updateEntry(e.id, 'bankName', v)
                        )
                      }
                    />

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

      {/* ป๊อปอัพเลือกตัวเลือกแบบใช้ร่วมกันทุกช่อง (แทนที่ chip picker แบบเลื่อนแนวนอนเดิม) */}
      <Modal visible={pickerModal.visible} transparent animationType="fade" onRequestClose={() => setPickerModal((s) => ({ ...s, visible: false }))}>
        <TouchableOpacity style={styles.pickerModalOverlay} activeOpacity={1} onPress={() => setPickerModal((s) => ({ ...s, visible: false }))}>
          <View style={styles.pickerModalSheet}>
            <Text style={styles.pickerModalTitle}>{pickerModal.title}</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {pickerModal.options.map((opt) => {
                const active = pickerModal.current === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value || '__none__'}
                    style={[styles.pickerModalOption, active && styles.pickerModalOptionActive]}
                    onPress={() => {
                      pickerModal.onSelect(opt.value);
                      setPickerModal((s) => ({ ...s, visible: false }));
                    }}
                  >
                    <Text style={styles.pickerModalOptionText}>{opt.label}</Text>
                    {active && <Ionicons name="checkmark" size={16} color="#d97706" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.pickerModalCloseBtn} onPress={() => setPickerModal((s) => ({ ...s, visible: false }))}>
              <Text style={styles.pickerModalCloseBtnText}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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

// ปุ่มกด-เปิดป๊อปอัพเลือกตัวเลือก — แทนที่ chip picker แบบเลื่อนแนวนอนเดิม
function PickerTrigger({ label, placeholder, onPress }: { label: string; placeholder: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.pickerTrigger} onPress={onPress}>
      <Text style={[styles.pickerTriggerText, !label && styles.pickerTriggerPlaceholder]} numberOfLines={1}>
        {label || placeholder}
      </Text>
      <Ionicons name="chevron-down" size={16} color="#64748b" />
    </TouchableOpacity>
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

  pickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  pickerTriggerText: { fontSize: 13, color: '#0f172a', fontWeight: '600', flexShrink: 1 },
  pickerTriggerPlaceholder: { color: '#94a3b8', fontWeight: '400' },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  pickerModalSheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  pickerModalTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  pickerModalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  pickerModalOptionActive: { backgroundColor: '#fffbeb' },
  pickerModalOptionText: { fontSize: 12.5, fontWeight: '700', color: '#334155', flexShrink: 1 },
  pickerModalCloseBtn: { marginTop: 8, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 },
  pickerModalCloseBtnText: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },

  collapseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 50, paddingHorizontal: 14, paddingVertical: 7, marginTop: 14 },
  collapseBtnText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },

  footerRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 14 },
  cancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  saveBtn: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#d97706', borderRadius: 12, paddingVertical: 14 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});