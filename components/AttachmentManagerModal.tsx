/**
 * AttachmentManagerModal — ป๊อปอัพ "จัดการเอกสารแนบ" ของหนังสือค้ำ / ชุดนำเข้า / ค้ำเงินสด
 * ------------------------------------------------------------------
 * หน้าตาตาม modal #fileAttachmentModal ของ lg_dashboard.php / lg_import_dashboard.php / lg_cash_dashboard.php
 *  - หัวสีน้ำเงิน "จัดการเอกสารแนบ : <เลขที่สัญญา>"
 *  - กล่อง "เอกสารแนบ (ส่งมอบงาน, สัญญาจ้าง, ฯลฯ)"
 *      ตารางไฟล์เดิม: หัวข้อเอกสาร / ชื่อไฟล์ (กดเปิด) / อัปโหลดเมื่อ / ผู้แนบเอกสาร / [ ] ลบ
 *      ตารางไฟล์ใหม่: หมวดหมู่เอกสารใหม่ / เลือกไฟล์ใหม่ / จัดการ
 *        - ยังไม่มีไฟล์เลย -> ตั้งต้น 3 แถวหัวข้อตายตัว ส่งมอบงาน / สัญญาจ้าง / หนังสือค้ำประกัน (ลบแถวไม่ได้) แบบเว็บ
 *        - ปุ่ม "+ เพิ่มช่องอัปโหลดไฟล์" เพิ่มแถวที่ต้องเลือกหัวข้อเอง
 *  - ท้าย: [บันทึกเอกสาร] [ยกเลิก]
 *  - บันทึกผ่าน lg_API_mobile.php?action=save_attachments (kind = lg | import | cash)
 * ------------------------------------------------------------------
 */
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { API_BASE, API_MODULES } from '../constants/config';
import { formatShortThaiDateTime } from './DateTimeField';
import { useScreenInsets } from './useScreenInsets';

const LG_API_URL = `${API_MODULES}/lg_API_mobile.php`;
const BLUE = '#2563eb';
const RED = '#dc2626';
const GRAY = '#64748b';

// หัวข้อเอกสารชุดเดียวกับ <select name="new_file_topics[]"> ของเว็บ
const TOPICS = ['ส่งมอบงาน', 'สัญญาจ้าง', 'หนังสือค้ำประกัน', 'เอกสารอื่นๆ'];
const DEFAULT_TOPICS = ['ส่งมอบงาน', 'สัญญาจ้าง', 'หนังสือค้ำประกัน'];
// นามสกุลตาม accept=".pdf,.doc,.docx,.jpg,.png" ของเว็บ (API ตรวจซ้ำอีกชั้น)
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
const DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];

export interface AttachedFile {
  topic: string;
  filePath: string;
  originalName: string;
  uploadDate: string;
  uploaderName: string;
}
interface PickedFile { uri: string; name: string; type: string }
interface NewRow { key: number; topic: string; fixed: boolean; file: PickedFile | null }

const extOf = (name: string) => (name.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();

export function mapAttachedFiles(list: any): AttachedFile[] {
  return (Array.isArray(list) ? list : []).map((f: any) => ({
    topic: String(f?.topic ?? '') || 'เอกสารแนบ',
    filePath: String(f?.file_path ?? ''),
    originalName: String(f?.original_name ?? ''),
    uploadDate: String(f?.upload_date ?? ''),
    uploaderName: String(f?.uploader_name ?? ''),
  }));
}

export default function AttachmentManagerModal({
  visible,
  onClose,
  userId,
  kind,
  recordId,
  label,
  files,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  userId?: number | string;
  kind: 'lg' | 'import' | 'cash';
  recordId: number;
  /** แสดงต่อท้ายหัว "จัดการเอกสารแนบ :" — เว็บใช้เลขที่สัญญา ว่างแสดง "ไม่ระบุ" */
  label: string;
  files: AttachedFile[];
  onSaved: (files: AttachedFile[]) => void;
}) {
  const insets = useScreenInsets();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<NewRow[]>([]);
  const [openTopic, setOpenTopic] = useState<number | null>(null); // แถวที่กางตัวเลือกหัวข้ออยู่
  const [saving, setSaving] = useState(false);
  const keySeq = useRef(0);

  // เปิดใหม่ทุกครั้ง: ไม่มีไฟล์เดิม -> 3 แถวตั้งต้นแบบเว็บ, มีไฟล์แล้ว -> ตารางไฟล์ใหม่ว่าง
  useEffect(() => {
    if (!visible) return;
    setRemoved(new Set());
    setOpenTopic(null);
    setSaving(false);
    setRows(files.length === 0 ? DEFAULT_TOPICS.map((t) => ({ key: keySeq.current++, topic: t, fixed: true, file: null })) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, recordId]);

  const setRowFile = (key: number, file: PickedFile | null) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, file } : r)));

  function acceptFile(key: number, f: PickedFile) {
    if (!ALLOWED_EXT.includes(extOf(f.name))) {
      Alert.alert('ไฟล์ไม่รองรับ', `แนบได้เฉพาะ PDF, DOCX, JPG, PNG\n${f.name}`);
      return;
    }
    setRowFile(key, f);
  }

  async function pickDocument(key: number) {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: DOC_TYPES, multiple: false, copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      acceptFile(key, { uri: a.uri, name: a.name || `file_${Date.now()}`, type: a.mimeType || 'application/octet-stream' });
    } catch (e) {
      console.log('document picker error:', e);
    }
  }

  async function takePhoto(key: number) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('แจ้งเตือน', 'กรุณาอนุญาตการใช้กล้อง');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    const uri = r.assets[0].uri;
    const ext = extOf(uri) === 'png' ? 'png' : 'jpg';
    acceptFile(key, { uri, name: `photo_${Date.now()}.${ext}`, type: ext === 'png' ? 'image/png' : 'image/jpeg' });
  }

  // ช่อง "เลือกไฟล์" ของแต่ละแถว — มือถือเลือกได้ทั้งไฟล์ในเครื่องหรือถ่ายรูป
  function chooseFile(key: number) {
    Alert.alert('เลือกไฟล์ใหม่', 'PDF, DOCX, JPG, PNG', [
      { text: 'เลือกไฟล์ในเครื่อง', onPress: () => void pickDocument(key) },
      { text: 'ถ่ายรูป', onPress: () => void takePhoto(key) },
      { text: 'ยกเลิก', style: 'cancel' },
    ]);
  }

  function toggleRemove(path: string) {
    setRemoved((s) => {
      const n = new Set(s);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  }

  const filled = rows.filter((r) => r.file);
  const changed = removed.size > 0 || filled.length > 0;

  async function save() {
    if (!userId || !changed) return;
    if (filled.some((r) => !r.topic)) {
      Alert.alert('กรุณาเลือกหัวข้อเอกสาร', 'ทุกไฟล์ใหม่ต้องเลือกหมวดหมู่เอกสาร');
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append('action', 'save_attachments');
      form.append('user_id', String(userId));
      form.append('kind', kind);
      form.append('id', String(recordId));
      form.append('keep', JSON.stringify(files.filter((f) => !removed.has(f.filePath)).map((f) => f.filePath)));
      filled.forEach((r) => {
        form.append('upload_files[]', { uri: r.file!.uri, name: r.file!.name, type: r.file!.type } as any);
        form.append('new_file_topics[]', r.topic);
      });
      const res = await axios.post(LG_API_URL, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const data = res.data;
      if (data?.status !== 'success') throw new Error(data?.message || 'บันทึกไม่สำเร็จ');
      onSaved(mapAttachedFiles(data.attached_files));
      Alert.alert('อัปเดตเอกสารแนบสำเร็จ!');
      onClose();
    } catch (e: any) {
      Alert.alert('เกิดข้อผิดพลาดในการอัปเดตไฟล์', e?.response?.data?.message || e?.message || 'กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  const close = () => {
    if (!saving) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.dialog}>
          {/* หัวสีน้ำเงินแบบเว็บ */}
          <View style={styles.header}>
            <Ionicons name="attach" size={20} color="#fff" />
            <Text style={styles.headerTitle} numberOfLines={2}>
              จัดการเอกสารแนบ : {label?.trim() ? label : 'ไม่ระบุ'}
            </Text>
            <TouchableOpacity onPress={close} hitSlop={10} accessibilityLabel="ปิด">
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="document-attach" size={15} color="#0f172a" />
                <Text style={styles.cardTitle}>เอกสารแนบ (ส่งมอบงาน, สัญญาจ้าง, ฯลฯ)</Text>
              </View>

              {/* ---- ไฟล์เดิม ---- */}
              <View style={styles.table}>
                <View style={styles.thRow}>
                  <Text style={[styles.th, { flex: 1 }]}>หัวข้อเอกสาร / ชื่อไฟล์</Text>
                  <Text style={[styles.th, styles.thDel]}>ลบ</Text>
                </View>
                {files.length === 0 ? (
                  <Text style={styles.emptyRow}>ยังไม่มีเอกสารแนบ</Text>
                ) : (
                  files.map((f) => {
                    const del = removed.has(f.filePath);
                    return (
                      <View key={f.filePath} style={[styles.tdRow, del && styles.tdRowDel]}>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={[styles.topic, del && styles.strike]}>{f.topic}</Text>
                          <TouchableOpacity
                            disabled={!f.filePath}
                            onPress={() => Linking.openURL(`${API_BASE}/${f.filePath.replace(/^\/+/, '')}`)}
                            style={styles.linkRow}
                          >
                            <Ionicons name="download-outline" size={14} color={BLUE} />
                            <Text style={[styles.link, del && styles.strike]}>{f.originalName || f.filePath}</Text>
                          </TouchableOpacity>
                          <Text style={styles.meta}>อัปโหลดเมื่อ {f.uploadDate ? formatShortThaiDateTime(f.uploadDate) : '-'}</Text>
                          <View style={styles.linkRow}>
                            <Ionicons name="person-outline" size={12} color="#0891b2" />
                            <Text style={styles.meta}>{f.uploaderName || '-'}</Text>
                          </View>
                        </View>
                        <TouchableOpacity style={[styles.delChk, del && styles.delChkOn]} onPress={() => toggleRemove(f.filePath)} disabled={saving}>
                          <Ionicons name={del ? 'checkbox' : 'square-outline'} size={15} color={RED} />
                          <Text style={styles.delChkText}>ลบ</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>

              <View style={styles.hr} />

              {/* ---- ไฟล์ใหม่ ---- */}
              <View style={styles.table}>
                <View style={styles.thRow}>
                  <Text style={[styles.th, { flex: 1 }]}>หมวดหมู่เอกสารใหม่ / เลือกไฟล์ใหม่ (PDF, DOCX, JPG, PNG)</Text>
                  <Text style={[styles.th, styles.thDel]}>จัดการ</Text>
                </View>
                {rows.map((r) => (
                  <View key={r.key} style={styles.tdRow}>
                    <View style={{ flex: 1, gap: 6 }}>
                      {r.fixed ? (
                        <View style={[styles.select, styles.selectFixed]}>
                          <Text style={styles.selectFixedText}>{r.topic}</Text>
                        </View>
                      ) : (
                        <>
                          <TouchableOpacity style={styles.select} onPress={() => setOpenTopic(openTopic === r.key ? null : r.key)} disabled={saving}>
                            <Text style={[styles.selectText, !r.topic && { color: '#94a3b8' }]}>{r.topic || '-- เลือกหัวข้อเอกสาร --'}</Text>
                            <Ionicons name={openTopic === r.key ? 'chevron-up' : 'chevron-down'} size={14} color={GRAY} />
                          </TouchableOpacity>
                          {openTopic === r.key && (
                            <View style={styles.optionList}>
                              {TOPICS.map((t) => (
                                <TouchableOpacity
                                  key={t}
                                  style={[styles.option, r.topic === t && styles.optionOn]}
                                  onPress={() => {
                                    setRows((cur) => cur.map((x) => (x.key === r.key ? { ...x, topic: t } : x)));
                                    setOpenTopic(null);
                                  }}
                                >
                                  <Text style={[styles.optionText, r.topic === t && { color: BLUE, fontWeight: '800' }]}>{t}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </>
                      )}
                      <TouchableOpacity style={styles.fileInput} onPress={() => chooseFile(r.key)} disabled={saving}>
                        <View style={styles.fileBtn}>
                          <Text style={styles.fileBtnText}>เลือกไฟล์</Text>
                        </View>
                        <Text style={[styles.fileName, !r.file && { color: '#94a3b8' }]} numberOfLines={1}>
                          {r.file ? r.file.name : 'ยังไม่ได้เลือกไฟล์'}
                        </Text>
                        {!!r.file && (
                          <TouchableOpacity onPress={() => setRowFile(r.key, null)} hitSlop={8}>
                            <Ionicons name="close-circle" size={16} color="#cbd5e1" />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    </View>
                    {/* แถวตั้งต้น 3 แถวลบไม่ได้ (ปุ่มจางแบบ disabled บนเว็บ) */}
                    <TouchableOpacity
                      style={[styles.trashBtn, r.fixed && { opacity: 0.4 }]}
                      disabled={r.fixed || saving}
                      onPress={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                      accessibilityLabel="ลบช่องนี้"
                    >
                      <Ionicons name="trash" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={styles.addRowBtn}
                onPress={() => setRows((cur) => [...cur, { key: keySeq.current++, topic: '', fixed: false, file: null }])}
                disabled={saving}
              >
                <Ionicons name="add" size={15} color={BLUE} />
                <Text style={styles.addRowText}>เพิ่มช่องอัปโหลดไฟล์</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* ท้าย: บันทึกเอกสาร / ยกเลิก แบบเว็บ */}
          <View style={styles.footer}>
            <TouchableOpacity style={[styles.saveBtn, (!changed || saving) && { opacity: 0.5 }]} onPress={save} disabled={!changed || saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="save" size={15} color="#fff" />}
              <Text style={styles.saveText}>บันทึกเอกสาร</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={close} disabled={saving}>
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', paddingHorizontal: 12 },
  dialog: { maxHeight: '100%', backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BLUE, paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 15.5, fontWeight: '900' },
  body: { backgroundColor: '#f1f5f9', flexGrow: 0, flexShrink: 1 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#0f172a' },
  table: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, overflow: 'hidden' },
  thRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 9 },
  th: { fontSize: 11.5, fontWeight: '800', color: '#475569' },
  thDel: { width: 64, textAlign: 'center' },
  emptyRow: { textAlign: 'center', color: GRAY, fontSize: 12, paddingVertical: 12 },
  tdRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  tdRowDel: { backgroundColor: '#fef2f2' },
  topic: { fontSize: 13, fontWeight: '900', color: '#0f172a' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  link: { flexShrink: 1, fontSize: 12.5, color: BLUE },
  meta: { fontSize: 11, color: GRAY },
  strike: { textDecorationLine: 'line-through', color: '#94a3b8' },
  delChk: { width: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: RED, borderRadius: 8, paddingVertical: 6 },
  delChkOn: { backgroundColor: '#fee2e2' },
  delChkText: { fontSize: 11.5, color: RED, fontWeight: '700' },
  hr: { height: 1, backgroundColor: '#cbd5e1', marginVertical: 14 },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 38, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, paddingHorizontal: 10, backgroundColor: '#fff' },
  selectText: { flex: 1, fontSize: 12.5, color: '#0f172a' },
  selectFixed: { backgroundColor: '#f1f5f9' },
  selectFixedText: { fontSize: 12.5, fontWeight: '800', color: '#0f172a' },
  optionList: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, overflow: 'hidden' },
  option: { paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff' },
  optionOn: { backgroundColor: '#eff6ff' },
  optionText: { fontSize: 12.5, color: '#334155' },
  fileInput: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 38, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, overflow: 'hidden', paddingRight: 8 },
  fileBtn: { alignSelf: 'stretch', justifyContent: 'center', backgroundColor: '#e2e8f0', paddingHorizontal: 10 },
  fileBtnText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  fileName: { flex: 1, fontSize: 12, color: '#0f172a' },
  trashBtn: { width: 34, height: 30, borderRadius: 6, backgroundColor: RED, alignItems: 'center', justifyContent: 'center', marginHorizontal: 15 },
  addRowBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: BLUE, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, marginTop: 10 },
  addRowText: { fontSize: 12, color: BLUE, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BLUE, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11 },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  cancelBtn: { justifyContent: 'center', backgroundColor: '#6b7280', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 11 },
  cancelText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
