/**
 * GuaranteeUpdateScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า guarantee_update.php (อัปเดตสถานะและติดตามงาน)
 * เปิดจากปุ่ม "แก้ไข" ในหน้า GuaranteeTrackingScreen ผ่าน expo-router:
 *   router.push({ pathname: '/GuaranteeUpdate', params: { id } })
 * ไฟล์นี้จึงอ่าน id ผ่าน useLocalSearchParams() ตรงๆ เหมือน DriverConfirmItems.tsx
 *
 * สถานะไฟล์นี้: เชื่อม API จริงแล้ว (GET/POST guarantee_update.php?id=) — endpoint ไม่มี action param
 * ตาม TODO เดิม ยังไม่ได้ยืนยันกับ backend จริง
 *
 * ตรงกับพฤติกรรมจริงจาก guarantee_update.php:
 *  - ส่วนที่ 1: เลือกสถานะการติดตาม (track_status) จาก pill 7 สี ตรงกับ $status_style_map
 *    (สี/ไอคอนต่อสถานะ map มาจาก class sp-1..sp-7 ในต้นฉบับเป๊ะ)
 *  - ถ้าเลือกสถานะ "แจ้งซ่อม" จะโผล่ฟอร์มย่อย "เปิดใบแจ้งซ่อม (Service Request) อัตโนมัติ" ทันที
 *    (ผู้รับเรื่อง + ความเร่งด่วน + รายการสินค้า/ปัญหา เพิ่ม-ลบได้หลายรายการ) ตรงกับ
 *    section #sr_modal_section ที่ show/hide ตาม pickStatus()
 *  - ส่วนที่ 2: ประวัติการติดตามงาน (followup) เป็นไทม์ไลน์ เพิ่ม/ลบแถวได้ โหลดของเดิมมาก่อน
 *    ตรงกับ all_followups ที่ split('||')
 *  - บันทึก -> อัปเดต track_status, สร้าง service_request ถ้าเลือกแจ้งซ่อม, ลบ+สร้าง followups ใหม่ทั้งหมด
 *
 * ที่ตัดออก/ทำให้ง่ายลง (เกินขอบเขต mockup):
 *  - การแนบไฟล์ในแต่ละรายการแจ้งซ่อม (ต้อง expo-document-picker/expo-image-picker) — เป็น stub
 *  - การแปลงข้อมูลผู้ติดต่อจาก LG ไปเป็นผู้แจ้งอัตโนมัติ (contact_persons JSON ซับซ้อน) — ข้ามไป
 *    ใช้ผู้ใช้ปัจจุบันเป็นผู้แจ้งเสมอในหน้านี้
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons expo-router
 * ------------------------------------------------------------------
 */

import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ Config
import { API_BASE } from '../../constants/config';

// TODO เดิมของไฟล์นี้ระบุ endpoint เป็น "guarantee_update.php?id=editId" โดยไม่มี action param
// (ต่างจากไฟล์อื่นที่ใช้ ?action=xxx) — ยังไม่ได้ยืนยันกับ backend จริง ทั้งฝั่งโหลดและฝั่งบันทึก
const API_URL = `${API_BASE}/guarantee_update.php`;

// ====================================================================
// Types
// ====================================================================

type TrackStatus =
  | 'ยังไม่หมดสัญญา'
  | 'แจ้งซ่อม'
  | 'กำลังดำเนินการ'
  | 'ตรวจชำรุด'
  | 'ได้รับหนังสือแจ้งปลดภาระผูกพัน'
  | 'อยู่ระหว่างส่งหนังสือค้ำคืนมา'
  | 'ได้รับหนังสือค้ำแล้ว';

type Urgency = 'normal' | 'urgent' | 'critical';

interface SrItem {
  id: string;
  product: string;
  jobType: string;
  jobOther: string;
  issue: string;
}

interface GuaranteeRecord {
  projectCode: string;
  contractNo: string;
  trackStatus: TrackStatus;
  followups: string[];
}

export interface GuaranteeUpdateScreenProps {
  onBack?: () => void;
  onSaved?: () => void;
}

// ====================================================================
// Constants
// ====================================================================

const STATUS_META: Record<TrackStatus, { bg: string; fg: string; icon: keyof typeof FontAwesome5.glyphMap }> = {
  ยังไม่หมดสัญญา: { bg: '#fef9c3', fg: '#854d0e', icon: 'clock' },
  แจ้งซ่อม: { bg: '#fde4d0', fg: '#9a3412', icon: 'wrench' },
  กำลังดำเนินการ: { bg: '#d1fae5', fg: '#065f46', icon: 'spinner' },
  ตรวจชำรุด: { bg: '#ede9fe', fg: '#5b21b6', icon: 'search' },
  ได้รับหนังสือแจ้งปลดภาระผูกพัน: { bg: '#dc2626', fg: '#ffffff', icon: 'unlock' },
  อยู่ระหว่างส่งหนังสือค้ำคืนมา: { bg: '#0f766e', fg: '#ffffff', icon: 'truck' },
  ได้รับหนังสือค้ำแล้ว: { bg: '#166534', fg: '#ffffff', icon: 'check-circle' },
};

const STATUS_LIST = Object.keys(STATUS_META) as TrackStatus[];

const MOCK_USERS = ['คุณธนา', 'คุณสมชาย', 'คุณกานดา', 'คุณปิยะ'];
const MOCK_JOB_TYPES = ['ซ่อมบำรุงทั่วไป', 'ระบบไฟฟ้า', 'ระบบปรับอากาศ', 'ระบบกล้องวงจรปิด', 'อื่นๆ'];

const URGENCY_OPTIONS: { value: Urgency; label: string }[] = [
  { value: 'normal', label: '🟢 ปกติ' },
  { value: 'urgent', label: '🟠 ด่วน' },
  { value: 'critical', label: '🔴 ด่วนมาก' },
];

const EMPTY_RECORD: GuaranteeRecord = { projectCode: '', contractNo: '', trackStatus: 'ยังไม่หมดสัญญา', followups: [] };

// แปลงข้อมูลดิบจาก backend ให้เข้ารูป GuaranteeRecord — รองรับหลายชื่อ field เพราะยังไม่มี spec ยืนยัน
function mapRecord(raw: any): GuaranteeRecord {
  return {
    projectCode: String(raw.projectCode ?? raw.project_code ?? ''),
    contractNo: String(raw.contractNo ?? raw.contract_no ?? ''),
    trackStatus: (raw.trackStatus ?? raw.track_status ?? 'ยังไม่หมดสัญญา') as TrackStatus,
    followups: raw.followups ?? (typeof raw.all_followups === 'string' ? raw.all_followups.split('||').filter(Boolean) : []),
  };
}

let uidCounter = 1;
function uid(): string {
  uidCounter += 1;
  return `sr_${Date.now()}_${uidCounter}`;
}

function mkSrItem(): SrItem {
  return { id: uid(), product: '', jobType: '', jobOther: '', issue: '' };
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

// ====================================================================
// Main screen
// ====================================================================

export default function GuaranteeUpdateScreen({ onBack, onSaved }: GuaranteeUpdateScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id ?? '1';

  const [record, setRecord] = useState<GuaranteeRecord>(EMPTY_RECORD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [trackStatus, setTrackStatus] = useState<TrackStatus>('ยังไม่หมดสัญญา');
  const [followups, setFollowups] = useState<string[]>(['']);

  const [srReceiver, setSrReceiver] = useState('');
  const [srUrgency, setSrUrgency] = useState<Urgency>('normal');

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
  const [srItems, setSrItems] = useState<SrItem[]>([mkSrItem()]);

  const loadRecord = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await axios.get(API_URL, { params: { id: editId } });
      const raw = res.data?.data ?? res.data;
      const mapped = mapRecord(raw ?? {});
      setRecord(mapped);
      setTrackStatus(mapped.trackStatus);
      setFollowups(mapped.followups.length > 0 ? mapped.followups : ['']);
    } catch (e) {
      console.error('load guarantee_update failed', e);
      setLoadError('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [editId]);

  useEffect(() => {
    loadRecord();
  }, [loadRecord]);

  function handleBack() {
    if (onBack) return onBack();
    if (router.canGoBack()) return router.back();
    router.push('/guarantee_tracking' as never); // fallback เผื่อไม่มีประวัติย้อนกลับ ปรับ path ให้ตรงไฟล์จริง
  }

  function addFollowup() {
    setFollowups((prev) => [...prev, '']);
  }

  function updateFollowup(index: number, value: string) {
    setFollowups((prev) => prev.map((f, i) => (i === index ? value : f)));
  }

  function removeFollowup(index: number) {
    setFollowups((prev) => prev.filter((_, i) => i !== index));
  }

  function addSrItem() {
    setSrItems((prev) => [...prev, mkSrItem()]);
  }

  function removeSrItem(id: string) {
    setSrItems((prev) => prev.filter((it) => it.id !== id));
  }

  function updateSrItem(id: string, field: keyof SrItem, value: string) {
    setSrItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  }

  async function handleSave() {
    if (trackStatus === 'แจ้งซ่อม') {
      if (!srReceiver) {
        Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาเลือกผู้รับเรื่องก่อนบันทึก');
        return;
      }
      const invalidItem = srItems.some((it) => !it.product.trim() || !it.issue.trim());
      if (invalidItem) {
        Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุสินค้า/อุปกรณ์ และอาการที่พบให้ครบทุกรายการ');
        return;
      }
    }

    // payload ตรงกับ TODO เดิมของไฟล์นี้ (track_status, followup[], sr_* ถ้าเลือก "แจ้งซ่อม")
    const fd = new FormData();
    fd.append('track_status', trackStatus);
    followups.filter((f) => f.trim()).forEach((f) => fd.append('followup[]', f));
    if (trackStatus === 'แจ้งซ่อม') {
      fd.append('sr_receiver', srReceiver);
      fd.append('sr_urgency', srUrgency);
      srItems.forEach((it) => {
        fd.append('sr_product[]', it.product);
        fd.append('sr_job_type[]', it.jobType);
        fd.append('sr_job_other[]', it.jobOther);
        fd.append('sr_issue[]', it.issue);
      });
    }

    setSaving(true);
    try {
      const res = await axios.post(`${API_URL}?id=${encodeURIComponent(editId)}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.status === 'success' || res.data?.success) {
        Alert.alert('บันทึกสำเร็จ', 'อัปเดตสถานะและประวัติการติดตามเรียบร้อยแล้ว!', [
          {
            text: 'ตกลง',
            onPress: () => {
              if (onSaved) return onSaved();
              handleBack();
            },
          },
        ]);
      } else {
        Alert.alert('บันทึกไม่สำเร็จ', res.data?.message || 'กรุณาลองใหม่อีกครั้ง');
      }
    } catch (e) {
      console.error('save guarantee_update failed', e);
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
          <ActivityIndicator size="large" color="#059669" />
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
          <TouchableOpacity style={styles.addFuBtn} onPress={loadRecord}>
            <Text style={styles.addFuBtnText}>ลองใหม่</Text>
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
            <Text style={styles.backBtnText}>ย้อนกลับ</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            <Ionicons name="create-outline" size={16} color="#fff" /> อัปเดตสถานะและติดตามงาน
          </Text>
          <Text style={styles.headerSubtitle}>
            เลขหน้างาน: {record.projectCode} | เลขสัญญา: {record.contractNo}
          </Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionLabel}>
            <Ionicons name="flag-outline" size={13} color="#3b82f6" /> 1. อัปเดตสถานะล่าสุด
          </Text>

          <View style={styles.statusGrid}>
            {STATUS_LIST.map((s) => {
              const meta = STATUS_META[s];
              const selected = trackStatus === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusPill, { backgroundColor: meta.bg }, selected && styles.statusPillSelected]}
                  onPress={() => setTrackStatus(s)}
                >
                  <FontAwesome5 name={meta.icon} size={12} color={meta.fg} />
                  <Text style={[styles.statusPillText, { color: meta.fg }]} numberOfLines={2}>
                    {s}
                  </Text>
                  {selected && <Ionicons name="checkmark-circle" size={14} color={meta.fg} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {trackStatus === 'แจ้งซ่อม' && (
            <View style={styles.srBox}>
              <Text style={styles.srBoxTitle}>
                <Ionicons name="build-outline" size={13} color="#e11d48" /> ข้อมูลสำหรับเปิดใบแจ้งซ่อม (Service Request) อัตโนมัติ
              </Text>

              <Text style={styles.fieldLabel}>
                ผู้รับเรื่อง <Text style={styles.required}>*</Text>
              </Text>
              <PickerTrigger
                label={srReceiver}
                placeholder="เลือกผู้รับเรื่อง..."
                onPress={() => openPicker('ผู้รับเรื่อง', MOCK_USERS.map((u) => ({ value: u, label: u })), srReceiver, setSrReceiver)}
              />

              <Text style={styles.fieldLabel}>
                ความเร่งด่วน <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.rowGap}>
                {URGENCY_OPTIONS.map((u) => (
                  <TouchableOpacity key={u.value} onPress={() => setSrUrgency(u.value)} style={[styles.urgencyChip, srUrgency === u.value && styles.urgencyChipActive]}>
                    <Text style={styles.urgencyChipText}>{u.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {srItems.map((it, idx) => (
                <View key={it.id} style={styles.srItemBox}>
                  <View style={styles.srItemTopRow}>
                    <Text style={styles.srItemCount}>
                      <Ionicons name="cube-outline" size={12} color="#e11d48" /> รายการที่ {idx + 1}
                    </Text>
                    {srItems.length > 1 && (
                      <TouchableOpacity onPress={() => removeSrItem(it.id)}>
                        <Ionicons name="close-circle" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.fieldLabel}>
                    สินค้า / อุปกรณ์ <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput style={styles.input} placeholder="เช่น กล้องวงจรปิด, PC..." placeholderTextColor="#94a3b8" value={it.product} onChangeText={(v) => updateSrItem(it.id, 'product', v)} />

                  <Text style={styles.fieldLabel}>
                    ประเภทงาน <Text style={styles.required}>*</Text>
                  </Text>
                  <PickerTrigger
                    label={it.jobType}
                    placeholder="เลือกประเภทงาน..."
                    onPress={() => openPicker('ประเภทงาน', MOCK_JOB_TYPES.map((jt) => ({ value: jt, label: jt })), it.jobType, (v) => updateSrItem(it.id, 'jobType', v))}
                  />
                  {it.jobType === 'อื่นๆ' && (
                    <TextInput style={styles.input} placeholder="ระบุประเภทอื่นๆ..." placeholderTextColor="#94a3b8" value={it.jobOther} onChangeText={(v) => updateSrItem(it.id, 'jobOther', v)} />
                  )}

                  <Text style={styles.fieldLabel}>
                    อาการ / ปัญหาที่พบ <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, styles.textarea]}
                    multiline
                    placeholder="ระบุอาการเสีย..."
                    placeholderTextColor="#94a3b8"
                    value={it.issue}
                    onChangeText={(v) => updateSrItem(it.id, 'issue', v)}
                  />

                  <TouchableOpacity
                    style={styles.attachBtn}
                    onPress={() => Alert.alert('แนบไฟล์', 'ต้องเพิ่ม expo-document-picker/expo-image-picker เพื่อแนบไฟล์จริงบนมือถือ')}
                  >
                    <Ionicons name="attach-outline" size={13} color="#64748b" />
                    <Text style={styles.attachBtnText}>อัปโหลดไฟล์แนบ (ถ้ามี)</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={styles.addSrBtn} onPress={addSrItem}>
                <Ionicons name="add-circle-outline" size={15} color="#e11d48" />
                <Text style={styles.addSrBtnText}>เพิ่มรายการสินค้า/ปัญหาที่แจ้ง</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.followupHeaderRow}>
            <Text style={styles.sectionLabel}>
              <Ionicons name="chatbubbles-outline" size={13} color="#3b82f6" /> 2. ประวัติการติดตามงาน
            </Text>
            <TouchableOpacity style={styles.addFuBtn} onPress={addFollowup}>
              <Ionicons name="add" size={13} color="#fff" />
              <Text style={styles.addFuBtnText}>เพิ่มรายการ</Text>
            </TouchableOpacity>
          </View>

          {followups.map((f, idx) => (
            <View key={idx} style={styles.fuRow}>
              <View style={styles.fuBullet}>
                <Text style={styles.fuBulletText}>{idx + 1}</Text>
              </View>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="ระบุรายละเอียดการติดตามงาน..." placeholderTextColor="#94a3b8" value={f} onChangeText={(v) => updateFollowup(idx, v)} />
              <TouchableOpacity style={styles.fuDelBtn} onPress={() => removeFollowup(idx)}>
                <Ionicons name="close" size={14} color="#f43f5e" />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleBack}>
              <Text style={styles.cancelBtnText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={16} color="#fff" />}
              <Text style={styles.saveBtnText}>{saving ? 'กำลังบันทึก...' : 'บันทึกการอัปเดต'}</Text>
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
                    {active && <Ionicons name="checkmark" size={16} color="#e11d48" />}
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

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8faff' },

  headerCard: { backgroundColor: '#0f172a', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 10 },
  backBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6 },

  body: { padding: 18 },
  sectionLabel: { fontSize: 12.5, fontWeight: '800', color: '#3b82f6', marginBottom: 12, textTransform: 'uppercase' },

  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 2, borderColor: 'transparent', width: '47%' },
  statusPillSelected: { borderColor: 'currentColor' },
  statusPillText: { fontSize: 11, fontWeight: '700', flex: 1 },

  srBox: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', borderLeftWidth: 5, borderLeftColor: '#e11d48', borderRadius: 12, padding: 14, marginTop: 14 },
  srBoxTitle: { fontSize: 12.5, fontWeight: '800', color: '#e11d48', marginBottom: 12 },

  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 8 },
  required: { color: '#ef4444' },

  pickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  pickerTriggerText: { fontSize: 13, color: '#0f172a', fontWeight: '600', flexShrink: 1 },
  pickerTriggerPlaceholder: { color: '#94a3b8', fontWeight: '400' },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  pickerModalSheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  pickerModalTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  pickerModalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  pickerModalOptionActive: { backgroundColor: '#fef2f2' },
  pickerModalOptionText: { fontSize: 12.5, fontWeight: '700', color: '#334155', flexShrink: 1 },
  pickerModalCloseBtn: { marginTop: 8, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 },
  pickerModalCloseBtnText: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },

  rowGap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  urgencyChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  urgencyChipActive: { borderColor: '#e11d48', backgroundColor: '#fff1f2' },
  urgencyChipText: { fontSize: 12, fontWeight: '600', color: '#334155' },

  input: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#0f172a', backgroundColor: '#fff' },
  textarea: { minHeight: 70, textAlignVertical: 'top' },

  srItemBox: { backgroundColor: '#fff', padding: 13, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca', marginTop: 14 },
  srItemTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#ffe4e6', paddingBottom: 8, marginBottom: 10 },
  srItemCount: { fontSize: 12.5, fontWeight: '700', color: '#e11d48' },

  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start' },
  attachBtnText: { fontSize: 11, color: '#64748b', fontWeight: '600' },

  addSrBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff0f2', borderWidth: 1, borderColor: '#fda4af', borderStyle: 'dashed', borderRadius: 50, paddingVertical: 10, marginTop: 14 },
  addSrBtnText: { fontSize: 12.5, fontWeight: '700', color: '#e11d48' },

  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 24 },

  followupHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  addFuBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7 },
  addFuBtnText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },

  fuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  fuBullet: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  fuBulletText: { fontSize: 10.5, fontWeight: '800', color: '#94a3b8' },
  fuDelBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#fff1f2', borderWidth: 1.5, borderColor: '#fecdd3', alignItems: 'center', justifyContent: 'center' },

  footerRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  cancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 14.5 },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', borderRadius: 12, paddingVertical: 15 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
});