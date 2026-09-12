/**
 * TravelAllowanceScreen.tsx
 * ------------------------------------------------------------------
 * Mobile mockup ของหน้า fm_report_travel.php ("รายการเบิกเบี้ยเลี้ยง" — โมดูลขนส่ง)
 * สำหรับแอป tjc-mobile-app (Expo / React Native)
 *
 * ไฟล์ต้นฉบับใหญ่มาก (4,300+ บรรทัด) รวม 3 อย่างไว้ในไฟล์เดียว: หน้ารายการคนขับ (list),
 * แท็บแผนที่ GPS จุดเบิก (map), และกล่องสรุป "ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง" (e-form
 * อนุมัติหลายขั้นตอน) — ส่วนฟอร์มกรอกข้อมูลจริงของคนขับแต่ละคนอยู่คนละไฟล์ (fm_report_travel_form.php)
 * ซึ่งยังไม่ได้ส่งมา — mockup รอบนี้จึงทำเฉพาะ "หน้ารายการ" (mode=list) + "ตั้งค่าตัวเลือก
 * เบี้ยเลี้ยง" ให้ครบเต็มรูปแบบ ส่วนที่เหลือ (แผนที่/ใบขออนุมัติ/ฟอร์มกรอกจริง) เป็น stub
 * ดูรายละเอียดท้ายไฟล์
 *
 * สถานะไฟล์นี้: UI MOCKUP — ข้อมูลทั้งหมดเป็น MOCK_DRIVERS/MOCK_RATE_OPTIONS ด้านล่าง
 *
 * ตรงกับพฤติกรรม/สูตรจริงจาก fm_report_travel.php:
 *  - หัวข้อ + ช่วงวันที่รอบเบิก + ปุ่ม "รอบก่อนหน้า/รอบถัดไป" (เปลี่ยนช่วงวันที่ทั้งก้อน)
 *  - สรุปสถานะ: บันทึกแล้ว / ยังไม่ทำ / รวม N คน / ใบงานในช่วงนี้ M ใบ
 *  - การ์ดคนขับแต่ละคน: รูป/ตัวอักษรย่อ, badge สถานะ (บันทึกแล้ว/ยังไม่ทำรายการ), ยอดเงินรวม
 *    (ถ้ามี), จำนวนใบงานในช่วงนี้ + ปิดงานแล้วกี่ใบ, วันที่บันทึกล่าสุด, ปุ่ม "ดูใบเบิก"+
 *    "แก้ไขข้อมูล" (ถ้ามีข้อมูลแล้ว) หรือ "กรอกข้อมูลใหม่" (ถ้ายังไม่มี)
 *  - ตั้งค่าตัวเลือกเบี้ยเลี้ยง: จัดการ "เกณฑ์" (opt_key/label/rate/group) แบ่งกลุ่มอัตโนมัติ,
 *    ใส่ค่าติดลบ = ไปอยู่กลุ่ม "หักออก" แทน (RateOptsPos/RateOptsNeg), toggle "ต้องจับพิกัด GPS"
 *  - สูตร MoneyFmt: จำนวนเต็มไม่โชว์ทศนิยม มีเศษถึงโชว์ 2 ตำแหน่ง (210 / 210.50)
 *
 * ที่เป็น stub (นอกขอบเขตรอบนี้ — ต้องไฟล์เพิ่ม/ไลบรารีแผนที่/ซับซ้อนเกินไป):
 *  - "ดูใบเบิก" (mode=view) และ "กรอกข้อมูลใหม่/แก้ไขข้อมูล" (fm_report_travel_form.php)
 *    — ฟอร์มกรอกจริงของคนขับแต่ละคน ยังไม่มีไฟล์ต้นฉบับให้ดู ส่งมาได้จะทำต่อให้
 *  - แท็บแผนที่ GPS จุดเบิก — ต้องมี react-native-maps + ข้อมูลพิกัดจริง
 *  - กล่องสรุป "ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง" (multi-step e-form อนุมัติ) — ซับซ้อนพอ
 *    เป็นอีกโมดูลนึงได้เลย รอส่งรายละเอียดเพิ่ม
 *
 * ต้องติดตั้ง (ถ้ายังไม่มี): npx expo install @expo/vector-icons
 * ------------------------------------------------------------------
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// ปรับ path นี้ให้ตรงกับตำแหน่งไฟล์จริงในโปรเจกต์ ถ้าไม่ได้วางไว้โฟลเดอร์เดียวกัน
import TravelAllowanceFormScreen from './fm_report_travel_form'; // ฟอร์มกรอกข้อมูลจริงของคนขับแต่ละคน (mode=form) — ยังไม่มีต้นฉบับให้ดู
import TravelAllowanceMapScreen from './fm_report_travel_map'; // แท็บแผนที่ GPS จุดเบิก — ยังไม่มีต้นฉบับให้ดู
import TravelAllowanceViewScreen from './fm_report_travel_view'; // ดูใบเบิกของคนขับแต่ละคน (mode=view) — ยังไม่มีต้นฉบับให้ดู

// ====================================================================
// Types
// ====================================================================

interface DriverRow {
  id: number;
  name: string;
  photoUrl?: string;
  hasData: boolean;
  totalAmount: number;
  jobTotal: number;
  jobDone: number;
  lastUpdateShow?: string; // "19 ส.ค. 69"
  lastUpdateTime?: string; // "14:25"
}

interface RateOption {
  id: string;
  optKey: string;
  label: string;
  rate: number;
  group: string;
  requiresGps: boolean;
}

export interface TravelAllowanceScreenProps {
  onBack?: () => void;
}

// ====================================================================
// Mock data
// ====================================================================

const DEFAULT_RATE_OPTIONS: RateOption[] = [
  { id: 'hotel', optKey: 'hotel', label: 'นอนโรงแรม', rate: 210, group: 'ที่พัก', requiresGps: false },
  { id: 'vehicle', optKey: 'vehicle', label: 'นอนรถ/นอนบ้านพัก', rate: 310, group: 'ที่พัก', requiresGps: false },
  { id: 'roundtrip', optKey: 'roundtrip', label: 'ไป-กลับ', rate: 80, group: 'ที่พัก', requiresGps: false },
  { id: '1-200', optKey: '1-200', label: '1-200 กม.', rate: 80, group: 'หน้างานสุดท้ายถึงบริษัท', requiresGps: true },
  { id: '200-500', optKey: '200-500', label: '200-500 กม.', rate: 160, group: 'หน้างานสุดท้ายถึงบริษัท', requiresGps: true },
  { id: '500+', optKey: '500+', label: '500 กม. ขึ้นไป', rate: 210, group: 'หน้างานสุดท้ายถึงบริษัท', requiresGps: true },
  { id: 'deduct50', optKey: 'deduct50', label: 'พักเกิน 50 กม. ห่างจากหน้างาน', rate: -100, group: 'หักออก', requiresGps: true },
];

const MOCK_DRIVERS: DriverRow[] = [
  { id: 1, name: 'วิชัย ใจดี', hasData: true, totalAmount: 890, jobTotal: 5, jobDone: 5, lastUpdateShow: '08 ก.ย. 69', lastUpdateTime: '16:40' },
  { id: 2, name: 'สมชาย รักไทย', hasData: true, totalAmount: 1240.5, jobTotal: 7, jobDone: 6, lastUpdateShow: '09 ก.ย. 69', lastUpdateTime: '09:15' },
  { id: 3, name: 'ประไพ ยิ้มแย้ม', hasData: false, totalAmount: 0, jobTotal: 3, jobDone: 1, lastUpdateShow: undefined },
  { id: 4, name: 'อรทัย ใจงาม', hasData: true, totalAmount: 420, jobTotal: 2, jobDone: 2, lastUpdateShow: '05 ก.ย. 69', lastUpdateTime: '11:20' },
  { id: 5, name: 'ธนกร มั่นคง', hasData: false, totalAmount: 0, jobTotal: 0, jobDone: 0, lastUpdateShow: undefined },
  { id: 6, name: 'กานดา สุขใจ', hasData: true, totalAmount: 1560, jobTotal: 9, jobDone: 9, lastUpdateShow: '10 ก.ย. 69', lastUpdateTime: '18:02' },
  { id: 7, name: 'ปิยะ เจริญสุข', hasData: false, totalAmount: 0, jobTotal: 4, jobDone: 2, lastUpdateShow: undefined },
];

// ====================================================================
// Helpers
// ====================================================================

// เทียบเท่า MoneyFmt() ของต้นฉบับ — จำนวนเต็มไม่โชว์ทศนิยม มีเศษถึงโชว์ 2 ตำแหน่ง
function moneyFmt(v: number): string {
  const n = Math.round(v * 100) / 100;
  return n === Math.floor(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function groupRateOptions(opts: RateOption[]): { group: string; items: RateOption[] }[] {
  const order: string[] = [];
  const map: Record<string, RateOption[]> = {};
  opts.forEach((o) => {
    if (!map[o.group]) {
      map[o.group] = [];
      order.push(o.group);
    }
    map[o.group].push(o);
  });
  return order.map((g) => ({ group: g, items: map[g] }));
}

function addDaysToDate(dateStr: string, days: number): string {
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return dateStr;
  const [, dd, mm, yyyy] = m;
  const d = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

let uidCounter = 1;
function uid(): string {
  uidCounter += 1;
  return `rate_${Date.now()}_${uidCounter}`;
}

// ====================================================================
// Main screen
// ====================================================================

export default function TravelAllowanceScreen({ onBack }: TravelAllowanceScreenProps) {
  const [startDate, setStartDate] = useState('01/09/2569');
  const [endDate, setEndDate] = useState('15/09/2569');
  const [drivers] = useState<DriverRow[]>(MOCK_DRIVERS);
  const [rateOptions, setRateOptions] = useState<RateOption[]>(DEFAULT_RATE_OPTIONS);

  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [rateGroup, setRateGroup] = useState('');
  const [rateLabel, setRateLabel] = useState('');
  const [rateValue, setRateValue] = useState('');
  const [rateGps, setRateGps] = useState(false);

  // 🌟 [เพิ่มใหม่] สลับไปหน้า TravelAllowanceFormScreen (กรอกข้อมูลใหม่/แก้ไข) เองภายในไฟล์นี้
  const [formScreen, setFormScreen] = useState<{ visible: boolean; driver?: DriverRow }>({ visible: false });
  const [viewScreen, setViewScreen] = useState<{ visible: boolean; driver?: DriverRow }>({ visible: false });
  const [mapVisible, setMapVisible] = useState(false);

  const stats = useMemo(() => {
    const saved = drivers.filter((d) => d.hasData).length;
    const total = drivers.length;
    const jobSum = drivers.reduce((s, d) => s + d.jobTotal, 0);
    return { saved, unsaved: total - saved, total, jobSum };
  }, [drivers]);

  const groupedRates = useMemo(() => groupRateOptions(rateOptions), [rateOptions]);
  const knownGroups = useMemo(() => Array.from(new Set(rateOptions.map((o) => o.group))), [rateOptions]);

  function goCycle(direction: -1 | 1) {
    // ตรงกับ PayCycle()/รอบก่อนหน้า-รอบถัดไป ของต้นฉบับแบบย่อ — เลื่อนทั้งช่วงตามความยาวเดิม
    const spanDays = 14; // ประมาณรอบ 15 วันแบบเดียวกับ mock เริ่มต้น
    if (direction === -1) {
      setEndDate(addDaysToDate(startDate, -1));
      setStartDate(addDaysToDate(startDate, -1 - spanDays));
    } else {
      setStartDate(addDaysToDate(endDate, 1));
      setEndDate(addDaysToDate(endDate, 1 + spanDays));
    }
  }

  function resetRateForm() {
    setEditingRateId(null);
    setRateGroup('');
    setRateLabel('');
    setRateValue('');
    setRateGps(false);
  }

  function startEditRate(o: RateOption) {
    setEditingRateId(o.id);
    setRateGroup(o.group);
    setRateLabel(o.label);
    setRateValue(String(o.rate));
    setRateGps(o.requiresGps);
  }

  function saveRateOpt() {
    // TODO: ต่อ backend จริง -> POST expense_rate_options (opt_key/label/rate/group_name/sort_order)
    if (!rateGroup.trim() || !rateLabel.trim() || rateValue.trim() === '') {
      Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณากรอกกลุ่ม, ชื่อตัวเลือก และเบี้ยเลี้ยงให้ครบ');
      return;
    }
    const rateNum = parseFloat(rateValue);
    if (isNaN(rateNum)) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'เบี้ยเลี้ยง/วัน ต้องเป็นตัวเลข');
      return;
    }
    if (editingRateId) {
      setRateOptions((prev) => prev.map((o) => (o.id === editingRateId ? { ...o, group: rateGroup.trim(), label: rateLabel.trim(), rate: rateNum, requiresGps: rateGps } : o)));
    } else {
      setRateOptions((prev) => [...prev, { id: uid(), optKey: uid(), group: rateGroup.trim(), label: rateLabel.trim(), rate: rateNum, requiresGps: rateGps }]);
    }
    resetRateForm();
  }

  function deleteRateOpt(o: RateOption) {
    Alert.alert('ยืนยันการลบ?', `ลบตัวเลือก "${o.label}" — ใบเบิกเก่าที่เคยใช้ตัวเลือกนี้จะยังโชว์ชื่อเดิมไว้`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: () => {
          setRateOptions((prev) => prev.filter((x) => x.id !== o.id));
          if (editingRateId === o.id) resetRateForm();
        },
      },
    ]);
  }

  function stubFeature(name: string, detail: string) {
    Alert.alert(name, detail);
  }

  function renderDriverCard({ item: d }: { item: DriverRow }) {
    const initial = d.name.trim().charAt(0);
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
              <Text style={styles.driverSeq}>
                ลำดับที่ {drivers.indexOf(d) + 1} จาก {drivers.length}
              </Text>
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
                บันทึกล่าสุด: <Text style={styles.dateBadgeStrong}>{d.lastUpdateShow}</Text>{' '}
                <Text style={styles.dateBadgeTime}>({d.lastUpdateTime} น.)</Text>
              </Text>
            </View>
          ) : (
            <View style={styles.dateBadge}>
              <Ionicons name="calendar-clear-outline" size={12} color="#94a3b8" />
              <Text style={[styles.dateBadgeText, { color: '#94a3b8' }]}>ยังไม่มีข้อมูลในช่วงนี้</Text>
            </View>
          )}

          {d.hasData ? (
            <View style={styles.cardActionsRow}>
              <TouchableOpacity
                style={[styles.cardActionBtn, styles.cardActionBtnSaved]}
                onPress={() => setViewScreen({ visible: true, driver: d })}
              >
                <Ionicons name="eye-outline" size={13} color="#0369a1" />
                <Text style={[styles.cardActionBtnText, { color: '#0369a1' }]}>ดูใบเบิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cardActionBtn, styles.cardActionBtnEdit]} onPress={() => setFormScreen({ visible: true, driver: d })}>
                <Ionicons name="pencil-outline" size={13} color="#0ea5e9" />
                <Text style={[styles.cardActionBtnText, { color: '#0ea5e9' }]}>แก้ไขข้อมูล</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.cardActionBtnNew} onPress={() => setFormScreen({ visible: true, driver: d })}>
              <Ionicons name="add" size={14} color="#fff" />

              <Text style={styles.cardActionBtnNewText}>กรอกข้อมูลใหม่</Text>
            </TouchableOpacity>
          )}
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
        hasSavedData={formScreen.driver.hasData}
        onBack={() => setFormScreen({ visible: false })}
        onSaved={() => setFormScreen({ visible: false })}
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
        requesterName={viewScreen.driver.name}
        startDate={startDate}
        endDate={endDate}
        onBack={() => setViewScreen({ visible: false })}
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
              ประจำวันที่ {startDate} ถึง {endDate}
            </Text>

            <View style={styles.dateRow}>
              <TextInput style={styles.dateInput} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={startDate} onChangeText={setStartDate} />
              <Text style={styles.dateSep}>ถึง</Text>
              <TextInput style={styles.dateInput} placeholder="วว/ดด/ปปปป" placeholderTextColor="#94a3b8" value={endDate} onChangeText={setEndDate} />
            </View>

            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={styles.rateSetupBtn} onPress={() => setRateModalVisible(true)}>
                <Ionicons name="settings-outline" size={13} color="#475569" />
                <Text style={styles.rateSetupBtnText}>ตั้งค่าตัวเลือก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cycleBtn} onPress={() => goCycle(-1)}>
                <Ionicons name="chevron-back" size={13} color="#4338ca" />
                <Text style={styles.cycleBtnText}>รอบก่อนหน้า</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cycleBtn} onPress={() => goCycle(1)}>
                <Text style={styles.cycleBtnText}>รอบถัดไป</Text>
                <Ionicons name="chevron-forward" size={13} color="#4338ca" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.mapTabHint}
              onPress={() => setMapVisible(true)}
            >
              <Ionicons name="map-outline" size={13} color="#64748b" />
              <Text style={styles.mapTabHintText}>ดูแผนที่จุดเบิก GPS</Text>
            </TouchableOpacity>

            <View style={styles.statsBar}>
              <View style={styles.statsItem}>
                <View style={[styles.dot, { backgroundColor: '#10b981' }]} />
                <Text style={styles.statsText}>
                  บันทึกแล้ว <Text style={styles.statsStrong}>{stats.saved}</Text>
                </Text>
              </View>
              <View style={styles.statsItem}>
                <View style={[styles.dot, { backgroundColor: '#f59e0b' }]} />
                <Text style={styles.statsText}>
                  ยังไม่ทำ <Text style={styles.statsStrong}>{stats.unsaved}</Text>
                </Text>
              </View>
              <View style={styles.statsItem}>
                <Text style={[styles.statsText, { color: '#4338ca', fontWeight: '800' }]}>รวม {stats.total} คน</Text>
              </View>
              <View style={styles.statsItem}>
                <Text style={styles.statsTextMuted}>
                  ใบงานในช่วงนี้ <Text style={styles.statsStrong}>{stats.jobSum}</Text>
                </Text>
              </View>
            </View>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />

      {/* Modal: ตั้งค่าตัวเลือกเบี้ยเลี้ยง */}
      <Modal visible={rateModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle}>
                <Ionicons name="settings-outline" size={15} color="#334155" /> ตั้งค่าตัวเลือก ที่พัก / ระยะทาง
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setRateModalVisible(false);
                  resetRateForm();
                }}
                hitSlop={8}
              >
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
              <Text style={styles.rateColTitle}>
                ตัวเลือกทั้งหมด <Text style={styles.rateColCount}>({rateOptions.length})</Text>
              </Text>

              {groupedRates.map((g) => (
                <View key={g.group} style={{ marginBottom: 10 }}>
                  <Text style={styles.rateGroupLabel}>{g.group}</Text>
                  {g.items.map((o) => (
                    <View key={o.id} style={styles.rateListItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rateItemLabel}>{o.label}</Text>
                        <View style={styles.rateItemMetaRow}>
                          <Text style={[styles.rateItemRate, { color: o.rate < 0 ? '#dc2626' : '#059669' }]}>{o.rate >= 0 ? `+${moneyFmt(o.rate)}` : moneyFmt(o.rate)} บาท</Text>
                          {o.requiresGps && (
                            <View style={styles.gpsTag}>
                              <Ionicons name="location" size={9} color="#2563eb" />
                              <Text style={styles.gpsTagText}>GPS</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <TouchableOpacity style={styles.rateItemBtn} onPress={() => startEditRate(o)}>
                        <Ionicons name="pencil" size={13} color="#0ea5e9" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rateItemBtn} onPress={() => deleteRateOpt(o)}>
                        <Ionicons name="trash" size={13} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ))}

              <View style={styles.rateFormBox}>
                <Text style={styles.rateFormTitle}>
                  <Ionicons name={editingRateId ? 'pencil' : 'add'} size={13} color="#334155" /> {editingRateId ? 'แก้ไขตัวเลือก' : 'เพิ่มตัวเลือกใหม่'}
                </Text>

                <Text style={styles.rateFieldLabel}>กลุ่ม</Text>
                <TextInput style={styles.rateInput} placeholder="เช่น ที่พัก" placeholderTextColor="#94a3b8" value={rateGroup} onChangeText={setRateGroup} />
                {knownGroups.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupChipsRow}>
                    {knownGroups.map((g) => (
                      <TouchableOpacity key={g} onPress={() => setRateGroup(g)} style={styles.groupChip}>
                        <Text style={styles.groupChipText}>{g}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                <Text style={styles.rateFieldLabel}>ชื่อตัวเลือก</Text>
                <TextInput style={styles.rateInput} placeholder="เช่น นอนโรงแรม" placeholderTextColor="#94a3b8" value={rateLabel} onChangeText={setRateLabel} />

                <Text style={styles.rateFieldLabel}>เบี้ยเลี้ยง / วัน (บาท)</Text>
                <TextInput style={styles.rateInput} placeholder="210" placeholderTextColor="#94a3b8" keyboardType="numbers-and-punctuation" value={rateValue} onChangeText={setRateValue} />
                <Text style={styles.rateHint}>
                  ใส่ตัวเลข<Text style={{ fontWeight: '800' }}> ติดลบ </Text>เช่น <Text style={{ fontWeight: '800' }}>-100</Text> รายการนั้นจะไปอยู่กลุ่ม <Text style={{ fontWeight: '800' }}>หักออก</Text> แทน
                </Text>

                <TouchableOpacity style={styles.gpsToggleRow} onPress={() => setRateGps((v) => !v)}>
                  <Ionicons name={rateGps ? 'checkbox' : 'square-outline'} size={19} color="#2563eb" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gpsToggleTitle}>ต้องจับพิกัด GPS</Text>
                    <Text style={styles.gpsToggleDesc}>เลือกตัวเลือกนี้ในใบเบิก จะมีปุ่มจับพิกัดขึ้นมา และต้องกดก่อนบันทึก</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.rateFormActions}>
                  <TouchableOpacity style={styles.rateResetBtn} onPress={resetRateForm}>
                    <Text style={styles.rateResetBtnText}>ล้างฟอร์ม</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rateSaveBtn} onPress={saveRateOpt}>
                    <Ionicons name="save-outline" size={14} color="#fff" />
                    <Text style={styles.rateSaveBtnText}>บันทึก</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 12 },
  dateInput: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 12.5, color: '#0f172a', backgroundColor: '#fff' },
  dateSep: { fontSize: 12, color: '#64748b', fontWeight: '600' },

  actionButtonsRow: { flexDirection: 'row', gap: 6, marginHorizontal: 14, marginTop: 10, flexWrap: 'wrap' },
  rateSetupBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8 },
  rateSetupBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },
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
  cardActionBtnNew: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#4338ca', borderRadius: 9, paddingVertical: 10, marginTop: 12 },
  cardActionBtnNewText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, maxHeight: '88%' },
  modalHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 13.5, fontWeight: '800', color: '#334155', flexShrink: 1 },

  rateColTitle: { fontSize: 11.5, fontWeight: '800', color: '#334155', marginBottom: 8 },
  rateColCount: { color: '#94a3b8', fontWeight: '600' },
  rateGroupLabel: { fontSize: 10.5, fontWeight: '800', color: '#4338ca', marginBottom: 6, textTransform: 'uppercase' },
  rateListItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderRadius: 9, padding: 9, marginBottom: 6 },
  rateItemLabel: { fontSize: 12, fontWeight: '700', color: '#1e293b' },
  rateItemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  rateItemRate: { fontSize: 11, fontWeight: '800' },
  gpsTag: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#eff6ff', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  gpsTagText: { fontSize: 8.5, fontWeight: '800', color: '#2563eb' },
  rateItemBtn: { width: 28, height: 28, borderRadius: 7, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },

  rateFormBox: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginTop: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  rateFormTitle: { fontSize: 12, fontWeight: '800', color: '#334155', marginBottom: 8 },
  rateFieldLabel: { fontSize: 10.5, fontWeight: '700', color: '#64748b', marginBottom: 5, marginTop: 8 },
  rateInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 12.5, color: '#0f172a', backgroundColor: '#fff' },
  groupChipsRow: { gap: 6, marginTop: 6 },
  groupChip: { backgroundColor: '#eef2ff', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 5 },
  groupChipText: { fontSize: 10.5, fontWeight: '700', color: '#4338ca' },
  rateHint: { fontSize: 10, color: '#64748b', marginTop: 6, lineHeight: 15 },

  gpsToggleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, backgroundColor: '#fff', borderRadius: 9, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  gpsToggleTitle: { fontSize: 11.5, fontWeight: '700', color: '#1e293b' },
  gpsToggleDesc: { fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 14 },

  rateFormActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  rateResetBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', borderRadius: 9, paddingVertical: 11 },
  rateResetBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  rateSaveBtn: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#059669', borderRadius: 9, paddingVertical: 11 },
  rateSaveBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});