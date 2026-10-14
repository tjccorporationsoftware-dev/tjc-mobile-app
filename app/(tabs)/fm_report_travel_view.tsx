/**
 * TravelAllowanceViewScreen.tsx
 * ------------------------------------------------------------------
 * "ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง" ฉบับอ่าน/เซ็นอนุมัติ — ต่อ API จริงแล้ว ผ่าน
 * fm_travel_API_mobile.php: get_detail / get_master_data (เกณฑ์รายการหัก) / save_deduct / sign_form
 *
 * เปลี่ยนจาก mockup เดิม:
 *  - โหลดข้อมูลจริงจาก get_detail (detail/jobs/signatures/company) แทน DEFAULT_ROWS/mock
 *  - ปุ่ม "บันทึกรายการหัก" เรียก save_deduct จริง และซ่อนถ้า can_full_access = false
 *    (สเปกระบุชัดว่า save_deduct ต้องเป็น checker/approver เท่านั้น)
 *  - ปุ่มอนุมัติ 3 ขั้น (ธุรการจัดส่ง/HR/หัวหน้า) เปลี่ยนเป็นข้อมูลจริงจาก signatures{requester,
 *    checker,approver} และเรียก sign_form(sign_type) จริง ปุ่ม "อนุมัติ" โชว์เฉพาะขั้นที่
 *    can_sign=true ของแถวนั้น
 *  - ใช้ status_effective/status_effective_text แสดงสถานะเสมอ ไม่ใช้ status ดิบ (ตามกติกาเอกสาร
 *    ที่ย้ำว่า status ดิบมีบั๊กค้างสถานะ draft ทั้งที่เซ็นครบแล้ว)
 *  - ลบปุ่ม "พิมพ์"/"Excel" ออก — ไม่มี action รองรับใน backend จริง (เดิมเป็นแค่ stub Alert)
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ Config + API helper กลาง
import { API_MODULES } from '../../constants/config';
import { formatShortThaiDate, formatShortThaiDateTime } from '../../components/DateTimeField';
import { useAuth } from '../_layout';
import { apiMobileGet, apiMobilePost } from '../../service/api_mobile';

const FM_TRAVEL_API_URL = `${API_MODULES}/fm_travel_API_mobile.php`;

// ====================================================================
// Types — ตรงกับ field ที่เอกสาร get_detail ระบุไว้ (jobs[]/detail{}/signatures{})
// ====================================================================

interface ViewRow {
  no: number;
  jobId: number;
  dateThai: string;
  time: string;
  route: string;
  rate: number;
  qty: number;
  amount: number;
  rateTypeLabel: string;
  deductType: string;
  deductTypeLabel: string;
  detail: string;
  hasGps: boolean;
  gpsMapUrl: string;
  photosCount: number;
}

interface DeductOption {
  key: string;
  label: string;
  rate: number;
}

interface SignatureStep {
  key: 'requester' | 'checker' | 'approver';
  title: string;
  name: string;
  position: string;
  dateShow: string;
  signed: boolean;
  canSign: boolean;
}

export interface TravelAllowanceViewScreenProps {
  driverId?: string;
  requesterName?: string; // ใช้เป็นค่าเริ่มต้นก่อนโหลดจริง (มาจากการ์ดในหน้ารายการ)
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  onBack?: () => void;
  onEditFull?: () => void;
}

// ====================================================================
// Helpers
// ====================================================================

function moneyFmt(v: number): string {
  const n = Math.round(v * 100) / 100;
  return n === Math.floor(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const THAI_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function thaiIntegerText(numberStr: string): string {
  const value = numberStr.replace(/^0+/, '') || '0';
  if (value === '0') return THAI_DIGITS[0];
  if (value.length > 6) {
    const head = value.slice(0, -6);
    const tail = value.slice(-6);
    const tailText = Number(tail) === 0 ? '' : thaiIntegerText(tail);
    return `${thaiIntegerText(head)}ล้าน${tailText}`;
  }
  let text = '';
  for (let index = 0; index < value.length; index++) {
    const digit = Number(value[index]);
    const place = value.length - index - 1;
    if (digit === 0) continue;
    if (place === 1 && digit === 1) text += 'สิบ';
    else if (place === 1 && digit === 2) text += 'ยี่สิบ';
    else if (place === 0 && digit === 1 && value.length > 1) text += 'เอ็ด';
    else text += THAI_DIGITS[digit] + THAI_PLACES[place];
  }
  return text;
}

function thaiBahtText(value: number): string {
  const roundedSatang = Math.round(value * 100);
  const absoluteSatang = Math.abs(roundedSatang);
  const baht = Math.floor(absoluteSatang / 100);
  const satang = absoluteSatang % 100;
  const prefix = roundedSatang < 0 ? 'ลบ' : '';
  let text = `${prefix}${thaiIntegerText(String(baht))}บาท`;
  text += satang === 0 ? 'ถ้วน' : `${thaiIntegerText(String(satang))}สตางค์`;
  return text;
}

function mapViewRow(raw: any): ViewRow {
  return {
    no: Number(raw.no ?? 0),
    jobId: Number(raw.job_id ?? 0),
    dateThai: raw.date_ymd ? formatShortThaiDate(raw.date_ymd) : String(raw.date_thai ?? ''),
    time: String(raw.time ?? ''),
    route: String(raw.route ?? ''),
    rate: Number(raw.rate ?? 0),
    qty: Number(raw.qty ?? 0),
    amount: Number(raw.amount ?? 0),
    rateTypeLabel: String(raw.rate_type_label ?? raw.rate_type ?? ''),
    deductType: String(raw.deduct_type ?? ''),
    deductTypeLabel: String(raw.deduct_type_label ?? ''),
    detail: String(raw.detail ?? ''),
    hasGps: Number(raw.has_gps ?? 0) === 1,
    gpsMapUrl: String(raw.gps_map_url ?? ''),
    photosCount: Number(raw.photos_count ?? 0),
  };
}

function mapSignature(key: SignatureStep['key'], raw: any): SignatureStep {
  return {
    key,
    title: String(raw?.title ?? ''),
    name: String(raw?.name ?? ''),
    position: String(raw?.position ?? ''),
    dateShow: String(raw?.date ?? ''),
    signed: Number(raw?.signed ?? 0) === 1,
    canSign: !!raw?.can_sign,
  };
}

function mapDeductOption(raw: any): DeductOption {
  return { key: String(raw.opt_key ?? raw.key ?? ''), label: String(raw.label ?? ''), rate: Number(raw.rate ?? 0) };
}

// ====================================================================
// Main screen
// ====================================================================

export default function TravelAllowanceViewScreen({ driverId, requesterName: initialRequesterName, startDate = '', endDate = '', onBack, onEditFull }: TravelAllowanceViewScreenProps) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [savingDeduct, setSavingDeduct] = useState(false);
  const [signingKey, setSigningKey] = useState<string | null>(null);

  const [companyNameTh, setCompanyNameTh] = useState('');
  const [companyNameEn, setCompanyNameEn] = useState('');
  const [lastSavedBy, setLastSavedBy] = useState('');
  const [updatedAtThai, setUpdatedAtThai] = useState('');
  const [dateSubmitThai, setDateSubmitThai] = useState('');
  const [requesterName, setRequesterName] = useState(initialRequesterName || '');
  const [dept, setDept] = useState('');
  const [startDateThai, setStartDateThai] = useState('');
  const [endDateThai, setEndDateThai] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [footerCode, setFooterCode] = useState('');
  const [statusEffectiveText, setStatusEffectiveText] = useState('');
  const [grandTotal, setGrandTotal] = useState(0);
  const [bahtText, setBahtText] = useState('');

  const [rows, setRows] = useState<ViewRow[]>([]);
  const [pendingDeduct, setPendingDeduct] = useState<Record<number, string>>({}); // no -> deductType ที่แก้ยังไม่ได้บันทึก
  const [signatures, setSignatures] = useState<SignatureStep[]>([]);
  const [deductOptions, setDeductOptions] = useState<DeductOption[]>([]);

  const [canFullAccess, setCanFullAccess] = useState(false);

  const dirty = Object.keys(pendingDeduct).length > 0;

  const load = useCallback(async () => {
    if (!user || !driverId) return;
    setLoading(true);
    try {
      const [detailRes, masterRes] = await Promise.all([
        apiMobileGet(FM_TRAVEL_API_URL, 'get_detail', { user_id: user.id, driver_id: driverId, start_date: startDate, end_date: endDate }),
        apiMobileGet(FM_TRAVEL_API_URL, 'get_master_data', { user_id: user.id }),
      ]);

      const detail = detailRes.detail || {};
      const company = detailRes.company || {};
      setCompanyNameTh(company.name_th || company.name || '');
      setCompanyNameEn(company.name_en || '');
      setLastSavedBy(detail.last_saved_by || '');
      setUpdatedAtThai(detail.updated_at ? formatShortThaiDateTime(detail.updated_at) : detail.updated_at_thai || '');
      setDateSubmitThai(detail.date_submit ? formatShortThaiDate(detail.date_submit) : detail.date_submit_thai || '');
      setRequesterName(detail.driver_name || initialRequesterName || '');
      setDept(detail.dept || '');
      setStartDateThai(formatShortThaiDate(detail.start_date || startDate));
      setEndDateThai(formatShortThaiDate(detail.end_date || endDate));
      setPayMethod(detail.pay_method || '');
      setFooterCode(detail.footer_code || '');
      setStatusEffectiveText(detail.status_effective_text || '');
      setGrandTotal(Number(detail.grand_total ?? 0));
      setBahtText(detail.baht_text || '');

      setRows(Array.isArray(detailRes.jobs) ? detailRes.jobs.map(mapViewRow) : []);
      setPendingDeduct({});

      const sig = detailRes.signatures || {};
      setSignatures([mapSignature('requester', sig.requester), mapSignature('checker', sig.checker), mapSignature('approver', sig.approver)]);

      setCanFullAccess(!!detailRes.can_full_access);
      setDeductOptions(Array.isArray(masterRes.rate_options_negative) ? masterRes.rate_options_negative.map(mapDeductOption) : []);
    } catch (e: any) {
      Alert.alert('โหลดข้อมูลไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด', [{ text: 'ตกลง', onPress: onBack }]);
    } finally {
      setLoading(false);
    }
  }, [user, driverId, startDate, endDate, initialRequesterName, onBack]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, startDate, endDate]);

  const totals = useMemo(() => {
    const qty = rows.reduce((s, r) => s + r.qty, 0);
    return { qty, amount: grandTotal };
  }, [rows, grandTotal]);

  function setDeduct(no: number, key: string) {
    setPendingDeduct((prev) => ({ ...prev, [no]: key }));
  }

  // ป๊อปอัพเลือก "อื่นๆ (หัก)" แทนแถวชิปเลื่อนแนวนอน — เลือกง่ายกว่าตอนมีตัวเลือกเยอะ
  const [deductPicker, setDeductPicker] = useState<{ visible: boolean; rowNo?: number; current?: string }>({ visible: false });

  function handleBack() {
    if (onBack) return onBack();
  }

  // save_deduct: ต้อง can_full_access (checker/approver) เท่านั้น — ปุ่มถูกซ่อนไปแล้วถ้าไม่มีสิทธิ์
  async function handleSaveDeduct() {
    if (!user || !driverId || !dirty) return;
    setSavingDeduct(true);
    try {
      const params: Record<string, string | number | undefined> = {
        user_id: user.id,
        driver_id: driverId,
        start_date: startDate,
        end_date: endDate,
      };
      Object.entries(pendingDeduct).forEach(([no, deductType]) => {
        const idx = rows.findIndex((r) => r.no === Number(no));
        if (idx >= 0) params[`jobs[${idx}][deduct_type]`] = deductType;
      });
      await apiMobilePost(FM_TRAVEL_API_URL, 'save_deduct', params);
      Alert.alert('บันทึกสำเร็จ', 'บันทึกรายการหักเรียบร้อยแล้ว');
      void load();
    } catch (e: any) {
      Alert.alert('บันทึกไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSavingDeduct(false);
    }
  }

  async function signApproval(step: SignatureStep) {
    if (!user || !driverId) return;
    Alert.alert('ยืนยันการอนุมัติ?', `ยืนยันอนุมัติในขั้น "${step.title || step.key}"`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'อนุมัติ',
        onPress: async () => {
          setSigningKey(step.key);
          try {
            await apiMobilePost(FM_TRAVEL_API_URL, 'sign_form', {
              user_id: user.id,
              driver_id: driverId,
              sign_type: step.key,
              start_date: startDate,
              end_date: endDate,
            });
            void load();
          } catch (e: any) {
            Alert.alert('อนุมัติไม่สำเร็จ', e.message || 'เกิดข้อผิดพลาด');
          } finally {
            setSigningKey(null);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#fff" size="large" />
      </SafeAreaView>
    );
  }

  return (
    <>
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={14} color="#fff" />
          <Text style={styles.backBtnText}>ย้อนกลับ</Text>
        </TouchableOpacity>
        {canFullAccess && (
          <View style={styles.editBadge}>
            <Ionicons name="create-outline" size={11} color="#fff" />
            <Text style={styles.editBadgeText}>แก้ได้เฉพาะช่อง "อื่นๆ (หัก)"</Text>
          </View>
        )}
      </View>
      <View style={styles.userRow}>
        <Ionicons name="person-circle-outline" size={13} color="#94a3b8" />
        <Text style={styles.userRowText}>บันทึกโดย: {lastSavedBy || '-'}</Text>
      </View>

      <View style={styles.actionsRow}>
        {canFullAccess && (
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnGreen, !dirty && styles.actionBtnDisabled]} disabled={!dirty || savingDeduct} onPress={handleSaveDeduct}>
            {savingDeduct ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={13} color="#fff" />}
            <Text style={styles.actionBtnText}>บันทึกรายการหัก</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnBlue]} onPress={onEditFull}>
          <Ionicons name="pencil-outline" size={13} color="#fff" />
          <Text style={styles.actionBtnText}>แก้ไขข้อมูล</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <View style={styles.docCard}>
          <View style={styles.docHeadRow}>
            <View style={styles.companyRow}>
              <View style={styles.logoCircle}>
                <Text style={styles.logoText}>TJC</Text>
              </View>
              <View>
                <Text style={styles.companyNameTh}>{companyNameTh}</Text>
                {!!companyNameEn && <Text style={styles.companyNameEn}>{companyNameEn}</Text>}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {!!updatedAtThai && <Text style={styles.savedByText}>อัปเดตล่าสุด: {updatedAtThai}</Text>}
              <Text style={styles.submitDateLabel}>วันที่เสนอเบิก</Text>
              <Text style={styles.submitDateValue}>{dateSubmitThai}</Text>
            </View>
          </View>

          <View style={styles.docTitleBar}>
            <Text style={styles.docTitleText}>ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง</Text>
            {!!statusEffectiveText && (
              <View style={styles.statusChip}>
                <Text style={styles.statusChipText}>{statusEffectiveText}</Text>
              </View>
            )}
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>ผู้ขอเบิกชื่อพนักงาน</Text>
              <Text style={styles.infoGridValue}>{requesterName}</Text>
            </View>
            <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>ชื่อแผนก</Text>
              <Text style={styles.infoGridValue}>{dept}</Text>
            </View>
            <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>ระหว่างวันที่</Text>
              <Text style={styles.infoGridValue}>{startDateThai}</Text>
            </View>
            <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>ถึงวันที่</Text>
              <Text style={styles.infoGridValue}>{endDateThai}</Text>
            </View>
          </View>

          <Text style={styles.rowsSectionLabel}>รายการเดินทาง</Text>
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="reader-outline" size={24} color="#cbd5e1" />
              <Text style={styles.emptyText}>ยังไม่มีรายการในรอบนี้</Text>
            </View>
          ) : (
            rows.map((r) => {
              const currentDeduct = pendingDeduct[r.no] ?? r.deductType;
              return (
                <View key={r.no} style={styles.rowCard}>
                  <View style={styles.rowCardTop}>
                    <View style={styles.rowNoBadge}>
                      <Text style={styles.rowNoBadgeText}>{r.no}</Text>
                    </View>
                    <Text style={styles.rowDateTime}>
                      {r.dateThai} {r.time}
                    </Text>
                    <View style={{ flex: 1 }} />
                    <Text style={styles.rowAmount}>{moneyFmt(r.amount)} บ.</Text>
                  </View>
                  <Text style={styles.rowRoute}>{r.route}</Text>

                  <View style={styles.rowMiniGrid}>
                    <View style={styles.rowMiniCell}>
                      <Text style={styles.rowMiniLabel}>เบี้ยเลี้ยง/วัน</Text>
                      <Text style={styles.rowMiniValue}>{moneyFmt(r.rate)}</Text>
                    </View>
                    <View style={styles.rowMiniCell}>
                      <Text style={styles.rowMiniLabel}>จำนวนวัน</Text>
                      <Text style={styles.rowMiniValue}>{r.qty}</Text>
                    </View>
                    <View style={styles.rowMiniCell}>
                      <Text style={styles.rowMiniLabel}>ค่าเบี้ยเลี้ยง</Text>
                      <Text style={styles.rowMiniValue}>{moneyFmt(r.rate * r.qty)}</Text>
                    </View>
                  </View>

                  <View style={styles.rowFieldLine}>
                    <Text style={styles.rowFieldLabel}>ที่พัก / ระยะทาง</Text>
                    <View style={styles.readonlyChip}>
                      <Text style={styles.readonlyChipText}>{r.rateTypeLabel}</Text>
                    </View>
                  </View>

                  <View style={styles.rowFieldLine}>
                    <Text style={styles.rowFieldLabel}>
                      อื่นๆ (หัก) {canFullAccess ? <Text style={styles.editableTag}>แก้ได้</Text> : null}
                    </Text>
                    {canFullAccess ? (
                      <TouchableOpacity style={styles.deductPickerTrigger} onPress={() => setDeductPicker({ visible: true, rowNo: r.no, current: currentDeduct })}>
                        <Text style={styles.deductPickerTriggerText} numberOfLines={1}>
                          {currentDeduct === '' ? '— ไม่มี —' : deductOptions.find((o) => o.key === currentDeduct)?.label ?? currentDeduct}
                        </Text>
                        <Ionicons name="chevron-down" size={14} color="#475569" />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.readonlyChip}>
                        <Text style={styles.readonlyChipText}>{r.deductTypeLabel || '— ไม่มี —'}</Text>
                      </View>
                    )}
                  </View>

                  {r.photosCount > 0 && (
                    <View style={styles.metaRow}>
                      <Ionicons name="images-outline" size={12} color="#64748b" />
                      <Text style={styles.metaText}>แนบรูปหลักฐาน {r.photosCount} รูป</Text>
                    </View>
                  )}
                  {r.hasGps && (
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={12} color="#2563eb" />
                      <Text style={[styles.metaText, { color: '#2563eb' }]}>มีพิกัด GPS แนบไว้</Text>
                    </View>
                  )}

                  {!!r.detail && (
                    <View style={styles.rowDetailBox}>
                      <Text style={styles.rowDetailText}>{r.detail}</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}

          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>รวมทั้งสิ้น</Text>
            <Text style={styles.grandTotalQty}>{totals.qty} วัน</Text>
            <Text style={styles.grandTotalAmount}>{moneyFmt(totals.amount)} บาท</Text>
          </View>

          <View style={styles.bahtTextRow}>
            <Text style={styles.bahtTextLabel}>(ตัวอักษร) บาท</Text>
            <Text style={styles.bahtTextValue}>{bahtText || thaiBahtText(totals.amount)}</Text>
          </View>

          {!!payMethod && (
            <View style={styles.payMethodBox}>
              <Text style={styles.payMethodText}>เบิกค่าเบี้ยเลี้ยงโดย{payMethod}</Text>
            </View>
          )}

          <View style={styles.statsGrid}>
            <View style={styles.statsCell}>
              <Text style={styles.statsCellLabel}>จำนวนรายการใบงาน</Text>
              <Text style={styles.statsCellValue}>{rows.length} รายการ</Text>
            </View>
            <View style={styles.statsCell}>
              <Text style={styles.statsCellLabel}>รวมจำนวนวัน</Text>
              <Text style={styles.statsCellValue}>{totals.qty} วัน</Text>
            </View>
            <View style={styles.statsCell}>
              <Text style={styles.statsCellLabel}>รวมค่าเบี้ยเลี้ยง (บาท)</Text>
              <Text style={[styles.statsCellValue, { color: '#4338ca' }]}>{moneyFmt(totals.amount)}</Text>
            </View>
          </View>

          <View style={styles.approvalGrid}>
            {signatures.map((s) => (
              <View key={s.key} style={styles.approvalCell}>
                <Text style={styles.approvalCellLabel}>{s.title || s.key}</Text>
                {s.signed ? (
                  <View style={styles.approvalSignedBox}>
                    <Text style={styles.approvalSignedName}>( {s.name} )</Text>
                    {!!s.position && <Text style={styles.approvalSignedDate}>{s.position}</Text>}
                    <Text style={styles.approvalSignedDate}>วันที่ {s.dateShow}</Text>
                  </View>
                ) : (
                  <View style={styles.approvalPendingBox}>
                    <Text style={styles.approvalPendingText}>ยังไม่อนุมัติ</Text>
                    {s.canSign && (
                      <TouchableOpacity style={styles.approveBtn} onPress={() => signApproval(s)} disabled={signingKey === s.key}>
                        {signingKey === s.key ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.approveBtnText}>อนุมัติ</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>

          <View style={styles.footerRow}>
            <View style={styles.netBox}>
              <Text style={styles.netBoxLabel}>สุทธิ:</Text>
              <Text style={styles.netBoxValue}>{moneyFmt(totals.amount)}</Text>
            </View>
            {!!footerCode && <Text style={styles.footerCodeText}>{footerCode}</Text>}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>

    <Modal visible={deductPicker.visible} transparent animationType="fade" onRequestClose={() => setDeductPicker({ visible: false })}>
      <TouchableOpacity style={styles.deductModalOverlay} activeOpacity={1} onPress={() => setDeductPicker({ visible: false })}>
        <View style={styles.deductModalSheet}>
          <Text style={styles.deductModalTitle}>เลือกรายการ "อื่นๆ (หัก)"</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            <TouchableOpacity
              style={[styles.deductModalOption, (deductPicker.current ?? '') === '' && styles.deductModalOptionActive]}
              onPress={() => {
                if (deductPicker.rowNo != null) setDeduct(deductPicker.rowNo, '');
                setDeductPicker({ visible: false });
              }}
            >
              <Text style={styles.deductModalOptionText}>— ไม่มี —</Text>
              {(deductPicker.current ?? '') === '' && <Ionicons name="checkmark" size={16} color="#2563eb" />}
            </TouchableOpacity>
            {deductOptions.map((o) => {
              const active = (deductPicker.current ?? '') === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.deductModalOption, active && styles.deductModalOptionActive]}
                  onPress={() => {
                    if (deductPicker.rowNo != null) setDeduct(deductPicker.rowNo, o.key);
                    setDeductPicker({ visible: false });
                  }}
                >
                  <Text style={styles.deductModalOptionText}>
                    {o.label} ({moneyFmt(o.rate)})
                  </Text>
                  {active && <Ionicons name="checkmark" size={16} color="#2563eb" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={styles.deductModalCloseBtn} onPress={() => setDeductPicker({ visible: false })}>
            <Text style={styles.deductModalCloseBtnText}>ปิด</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
    </>
  );
}

// ====================================================================
// Styles
// ====================================================================

const styles = StyleSheet.create({
  // #f8fafc ให้ตรงกับพื้นหลังหน้าจอของอีก 3 โมดูล — เดิมใช้ #f4f7fb ต่างกันเล็กน้อย
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1e293b', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, flexWrap: 'wrap' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  backBtnText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  editBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#b45309', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  editBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1e293b', paddingHorizontal: 14, paddingBottom: 10 },
  userRowText: { color: '#cbd5e1', fontSize: 10.5, fontWeight: '600' },

  actionsRow: { flexDirection: 'row', gap: 7, backgroundColor: '#1e293b', paddingHorizontal: 14, paddingBottom: 12, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  actionBtnGreen: { backgroundColor: '#059669' },
  actionBtnBlue: { backgroundColor: '#2563eb' },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },

  docCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  docHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  logoCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 10, fontWeight: '900', color: '#b45309' },
  companyNameTh: { fontSize: 13, fontWeight: '800', color: '#1e293b' },
  companyNameEn: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  savedByText: { fontSize: 10, color: '#059669', fontWeight: '700' },
  submitDateLabel: { fontSize: 9.5, color: '#94a3b8', marginTop: 6 },
  submitDateValue: { fontSize: 12, fontWeight: '800', color: '#1e293b' },

  docTitleBar: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 9, alignItems: 'center', marginTop: 14, gap: 6 },
  docTitleText: { fontSize: 13, fontWeight: '800', color: '#1e293b' },
  statusChip: { backgroundColor: '#eef2ff', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 3 },
  statusChipText: { fontSize: 10, fontWeight: '800', color: '#4338ca' },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  infoGridItem: { width: '47%' },
  infoGridLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600' },
  infoGridValue: { fontSize: 12.5, fontWeight: '800', color: '#1e293b', marginTop: 3 },

  rowsSectionLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 11.5, textAlign: 'center' },

  rowCard: { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  rowCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowNoBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  rowNoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  rowDateTime: { fontSize: 11, color: '#64748b', fontWeight: '700' },
  rowAmount: { fontSize: 13.5, fontWeight: '900', color: '#4338ca' },
  rowRoute: { fontSize: 13, fontWeight: '800', color: '#1e293b', marginTop: 6 },

  rowMiniGrid: { flexDirection: 'row', gap: 8, marginTop: 9 },
  rowMiniCell: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 8, alignItems: 'center' },
  rowMiniLabel: { fontSize: 9, color: '#94a3b8', fontWeight: '600' },
  rowMiniValue: { fontSize: 12.5, fontWeight: '800', color: '#1e293b', marginTop: 3 },

  rowFieldLine: { marginTop: 10 },
  rowFieldLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', marginBottom: 5 },
  editableTag: { fontSize: 9, color: '#2563eb', fontWeight: '800' },
  readonlyChip: { alignSelf: 'flex-start', backgroundColor: '#eef2ff', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
  readonlyChipText: { fontSize: 11, fontWeight: '700', color: '#4338ca' },

  deductChipsRow: { gap: 6 },
  deductChip: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  deductChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  deductChipText: { fontSize: 10.5, fontWeight: '700', color: '#64748b' },
  deductChipTextActive: { color: '#fff' },
  deductPickerTrigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 9, minWidth: 160,
  },
  deductPickerTriggerText: { fontSize: 11.5, fontWeight: '700', color: '#0f172a', flexShrink: 1 },
  deductModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  deductModalSheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  deductModalTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  deductModalOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8,
  },
  deductModalOptionActive: { backgroundColor: '#eff6ff' },
  deductModalOptionText: { fontSize: 12.5, fontWeight: '700', color: '#334155' },
  deductModalCloseBtn: { marginTop: 8, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 },
  deductModalCloseBtnText: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  metaText: { fontSize: 10.5, color: '#64748b', fontWeight: '600' },

  rowDetailBox: { backgroundColor: '#fffbeb', borderRadius: 8, padding: 9, marginTop: 10 },
  rowDetailText: { fontSize: 11, color: '#92400e', lineHeight: 16 },

  grandTotalRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#334155', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, marginTop: 4, gap: 10 },
  grandTotalLabel: { color: '#fff', fontSize: 12, fontWeight: '800', flex: 1 },
  grandTotalQty: { color: '#cbd5e1', fontSize: 11.5, fontWeight: '700' },
  grandTotalAmount: { color: '#fff', fontSize: 14, fontWeight: '900' },

  bahtTextRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: '#f8fafc', borderRadius: 8, padding: 10 },
  bahtTextLabel: { fontSize: 10.5, fontWeight: '800', color: '#64748b' },
  bahtTextValue: { fontSize: 11.5, fontWeight: '700', color: '#1e293b', flexShrink: 1 },

  payMethodBox: { marginTop: 8, padding: 10 },
  payMethodText: { fontSize: 11, color: '#64748b', textAlign: 'center' },

  statsGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statsCell: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 10, alignItems: 'center' },
  statsCellLabel: { fontSize: 9, color: '#94a3b8', fontWeight: '700', textAlign: 'center' },
  statsCellValue: { fontSize: 13, fontWeight: '900', color: '#1e293b', marginTop: 5 },

  approvalGrid: { flexDirection: 'row', gap: 8, marginTop: 10 },
  approvalCell: { flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  approvalCellLabel: { fontSize: 9.5, fontWeight: '800', color: '#334155', textAlign: 'center', backgroundColor: '#f1f5f9', paddingVertical: 8, paddingHorizontal: 4 },
  approvalSignedBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 6, minHeight: 90 },
  approvalSignedName: { fontSize: 11, fontWeight: '700', color: '#1e293b', textAlign: 'center' },
  approvalSignedDate: { fontSize: 10, color: '#64748b', marginTop: 4 },
  approvalPendingBox: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 8, minHeight: 90 },
  approvalPendingText: { fontSize: 10.5, fontWeight: '700', color: '#94a3b8' },
  approveBtn: { borderRadius: 50, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: '#059669' },
  approveBtnText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },

  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  netBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  netBoxLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155' },
  netBoxValue: { fontSize: 15, fontWeight: '900', color: '#1e293b' },
  footerCodeText: { fontSize: 10, color: '#94a3b8' },
});
