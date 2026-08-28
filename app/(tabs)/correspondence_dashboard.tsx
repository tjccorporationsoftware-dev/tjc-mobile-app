// app/(tabs)/correspondence_dashboard.tsx
// ระบบสารบรรณ — จอ A: แดชบอร์ด + ลงรับ (dashboard_correspondence.php)
// ดู docs/Correspondence_Spec.md

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  useColorScheme,
  View,
} from "react-native";

import { API_BASE } from "../../constants/config";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// axios instance — ส่ง cookie session (เผื่อ backend อ่าน session)
const api = axios.create({ baseURL: API_BASE, withCredentials: true });
const CORR_URL = "/api_correspondence.php";

// สีอ้างอิงตามเว็บจริง (dashboard_correspondence.php): รับ = เขียวเทียล, ส่ง = น้ำตาลอำพัน
const COLORS = {
  light: {
    bg: "#f1f5f9",
    bgSecondary: "#f8fafc",
    card: "#ffffff",
    text: "#1e293b",
    textSecondary: "#64748b",
    border: "#e2e8f0",
    primary: "#4e54c8",
    received: "#0f766e",
    sent: "#b45309",
    success: "#16a34a",
    danger: "#ef4444",
    overlay: "rgba(0,0,0,0.5)",
  },
  dark: {
    bg: "#0f172a",
    bgSecondary: "#1e293b",
    card: "#1e293b",
    text: "#f1f5f9",
    textSecondary: "#cbd5e1",
    border: "#334155",
    primary: "#8f94fb",
    received: "#2dd4bf",
    sent: "#fbbf24",
    success: "#22c55e",
    danger: "#f87171",
    overlay: "rgba(0,0,0,0.7)",
  },
};

// ไล่สีสำหรับการ์ด/แถบต่าง ๆ (ใช้ทั้ง 2 ธีม เพื่อความสดของสี)
const GRADIENTS = {
  primary: ["#4e54c8", "#8f94fb"] as const,
  received: ["#0f766e", "#0d9488"] as const,
  sent: ["#b45309", "#d97706"] as const,
  success: ["#16a34a", "#34d399"] as const,
  danger: ["#dc2626", "#f87171"] as const,
};

// พื้นหลังพาสเทลอ่อนของหัวป็อปอัปรายละเอียด (ตามเว็บต้นฉบับ dashboard_correspondence.php)
const PASTEL_HERO = {
  received: ["#f0fdfa", "#ecfdf5"] as const,
  sent: ["#fffbeb", "#fff7ed"] as const,
};

const THAI_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

type TabKey = "all" | "waiting" | "done" | "sent";

interface CorrItem {
  id: number;
  book_type: "received" | "sent";
  reg_no?: string;
  book_date?: string;
  book_date_thai?: string;
  doc_date_thai?: string;
  sender?: string;
  company?: string;
  internal_staff?: string;
  subject?: string;
  note?: string;
  creator?: string;
  receiver?: string;
  received_at?: string;
  file_count?: number;
}

export default function CorrespondenceDashboard() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const c = isDark ? COLORS.dark : COLORS.light;
  const s = useMemo(() => getStyles(c), [c]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    received: 0,
    sent: 0,
    today: 0,
  });
  const [monthly, setMonthly] = useState<
    Record<string, { received: number; sent: number }>
  >({});
  const [companies, setCompanies] = useState<
    { company: string; count: number }[]
  >([]);
  const [recent, setRecent] = useState<CorrItem[]>([]);

  const [tab, setTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Detail modal
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Cancel-ack modal
  const [cancelTarget, setCancelTarget] = useState<CorrItem | null>(null);
  const [cancelRemark, setCancelRemark] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);

  // Cancel logs modal
  const [logsFor, setLogsFor] = useState<CorrItem | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchDashboard = async () => {
    try {
      const res = await api.get(CORR_URL, {
        params: {
          action: "dashboard",
          ...(filterDate ? { date: filterDate } : {}),
          ...(search.trim() ? { subject: search.trim() } : {}),
        },
      });
      const d = res.data || {};
      setStats(d.stats || { total: 0, received: 0, sent: 0, today: 0 });
      setMonthly(d.monthly || {});
      setCompanies(d.companies || []);
      setRecent(d.recent || []);
    } catch (e) {
      console.error("dashboard error", e);
      Alert.alert("ผิดพลาด", "โหลดข้อมูลแดชบอร์ดไม่สำเร็จ");
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await fetchDashboard();
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboard();
    setRefreshing(false);
  };

  // ค้นหา/วันที่เปลี่ยน → refetch
  const applyFilter = async () => {
    setLoading(true);
    await fetchDashboard();
    setLoading(false);
  };

  // ---------- POST helper ----------
  const postForm = async (action: string, fields: Record<string, any>) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      fd.append(k, typeof v === "number" ? String(v) : v);
    });
    const res = await api.post(`${CORR_URL}?action=${action}`, fd, {
      headers: {
        "Content-Type": "multipart/form-data",
        Accept: "application/json",
      },
    });
    return res.data;
  };

  // ---------- Actions ----------
  // ยืนยัน: api_correspondence.php?action=acknowledge อ่านชื่อผู้รับจาก
  // $_SESSION['fullname'] ฝั่ง server เท่านั้น (ไม่รับ field อื่นจาก client เลย)
  // ถ้าแอปมือถือไม่ได้ถือ PHP session เดียวกับตอนล็อกอินเว็บ ผู้รับจะถูก
  // บันทึกเป็น "System" แทนชื่อจริง — ต้องแก้ backend ให้รับ override ถ้าจะพึ่งพาได้แน่นอน
  const acknowledge = (item: CorrItem, onDone?: () => void) => {
    Alert.alert(
      "ยืนยันการรับหนังสือ?",
      "ชื่อของท่านจะถูกบันทึกเป็นผู้รับหนังสือฉบับนี้",
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ยืนยันรับทราบ",
          onPress: async () => {
            try {
              const data = await postForm("acknowledge", { id: item.id });
              if (data?.status === "success" || data?.success) {
                await fetchDashboard();
                onDone?.();
              } else {
                Alert.alert("ลงรับไม่สำเร็จ", data?.message || "");
              }
            } catch (e: any) {
              Alert.alert("ผิดพลาด", e.message || "ลงรับไม่สำเร็จ");
            }
          },
        },
      ],
    );
  };

  const submitCancel = async () => {
    if (!cancelTarget) return;
    if (!cancelRemark.trim())
      return Alert.alert("แจ้งเตือน", "กรุณากรอกหมายเหตุ!");
    setCancelBusy(true);
    try {
      const data = await postForm("cancel_acknowledge", {
        id: cancelTarget.id,
        remark: cancelRemark.trim(),
      });
      if (data?.status === "success" || data?.success) {
        setCancelTarget(null);
        setCancelRemark("");
        await fetchDashboard();
      } else {
        Alert.alert("ยกเลิกไม่สำเร็จ", data?.message || "");
      }
    } catch (e: any) {
      Alert.alert("ผิดพลาด", e.message || "ยกเลิกไม่สำเร็จ");
    } finally {
      setCancelBusy(false);
    }
  };

  const openDetail = async (item: CorrItem) => {
    setDetail({ __loading: true });
    setDetailLoading(true);
    try {
      const res = await api.get(CORR_URL, {
        params: { action: "get_single", id: item.id },
      });
      if (res.data?.status === "success" || res.data?.result) {
        setDetail(res.data.result);
      } else {
        setDetail(null);
        Alert.alert("ไม่พบข้อมูล", res.data?.message || "");
      }
    } catch (e: any) {
      setDetail(null);
      Alert.alert("ผิดพลาด", e.message || "โหลดรายละเอียดไม่สำเร็จ");
    } finally {
      setDetailLoading(false);
    }
  };

  const openLogs = async (item: CorrItem) => {
    setLogsFor(item);
    setLogsLoading(true);
    setLogs([]);
    try {
      const res = await api.get(CORR_URL, {
        params: { action: "get_cancel_logs", id: item.id },
      });
      setLogs(res.data?.logs || []);
    } catch (e: any) {
      Alert.alert("ผิดพลาด", e.message || "โหลดประวัติไม่สำเร็จ");
    } finally {
      setLogsLoading(false);
    }
  };

  // ---------- Tab counts (client-side) ----------
  const counts = useMemo(() => {
    let all = recent.length,
      waiting = 0,
      done = 0,
      sent = 0;
    recent.forEach((r) => {
      if (r.book_type === "sent") sent++;
      else if (r.book_type === "received") r.receiver ? done++ : waiting++;
    });
    return { all, waiting, done, sent };
  }, [recent]);

  const visibleList = useMemo(() => {
    return recent.filter((r) => {
      if (tab === "waiting") return r.book_type === "received" && !r.receiver;
      if (tab === "done") return r.book_type === "received" && !!r.receiver;
      if (tab === "sent") return r.book_type === "sent";
      return true;
    });
  }, [recent, tab]);

  // ---------- Pagination (แท็บละ 50 รายการ) ----------
  const totalPages = Math.max(1, Math.ceil(visibleList.length / PAGE_SIZE));
  const pagedList = useMemo(
    () => visibleList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [visibleList, page],
  );

  // รีเซ็ตกลับหน้า 1 เมื่อสลับแท็บ หรือข้อมูลโหลดใหม่ / clamp ถ้าหน้าปัจจุบันเกินช่วง
  useEffect(() => {
    setPage(1);
  }, [tab, recent]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // ---------- Chart ----------
  const monthKeys = useMemo(() => Object.keys(monthly).sort(), [monthly]);
  const chartMax = useMemo(() => {
    let m = 1;
    monthKeys.forEach((k) => {
      m = Math.max(m, monthly[k].received || 0, monthly[k].sent || 0);
    });
    return m;
  }, [monthKeys, monthly]);

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {loading ? (
        <ActivityIndicator
          size="large"
          color={c.primary}
          style={{ marginTop: 60 }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.primary}
            />
          }
        >
          {/* Banner แจ้งเตือนรอลงรับ */}
          {counts.waiting > 0 && (
            <FadeInUp>
              <ScalePress onPress={() => setTab("waiting")}>
                <LinearGradient
                  colors={GRADIENTS.sent}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.waitBanner}
                >
                  <View style={s.waitBannerIcon}>
                    <Ionicons name="alert-circle" size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.waitBannerTitle}>
                      มี {counts.waiting} ฉบับรอการลงรับ
                    </Text>
                    <Text style={s.waitBannerSub}>
                      แตะเพื่อดูรายการที่ต้องลงรับด่วน
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#fff" />
                </LinearGradient>
              </ScalePress>
            </FadeInUp>
          )}

          {/* Filter */}
          <FadeInUp delay={40}>
            <View
              style={[
                s.filterBox,
                { backgroundColor: c.card, borderColor: c.border },
              ]}
            >
              <View
                style={[
                  s.searchBox,
                  { backgroundColor: c.bgSecondary, borderColor: c.border },
                ]}
              >
                <Ionicons name="search" size={16} color={c.textSecondary} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  onSubmitEditing={applyFilter}
                  placeholder="ค้นหาเรื่อง / หน่วยงาน"
                  placeholderTextColor={c.textSecondary}
                  style={[s.searchInput, { color: c.text }]}
                />
              </View>
              <TouchableOpacity
                style={[
                  s.dateBtn,
                  { backgroundColor: c.bgSecondary, borderColor: c.border },
                ]}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={16} color={c.primary} />
                <Text style={{ color: c.text, fontSize: 12 }}>
                  {filterDate || "ทุกวัน"}
                </Text>
              </TouchableOpacity>
              {filterDate ? (
                <TouchableOpacity
                  onPress={() => {
                    setFilterDate("");
                    setTimeout(applyFilter, 0);
                  }}
                >
                  <Ionicons name="close-circle" size={20} color={c.danger} />
                </TouchableOpacity>
              ) : null}
              <ScalePress
                onPress={applyFilter}
                style={[s.goBtn, { backgroundColor: c.primary }]}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}
                >
                  ค้นหา
                </Text>
              </ScalePress>
            </View>
          </FadeInUp>

          {/* Stat cards */}
          <View style={s.statRow}>
            <FadeInUp delay={80} style={{ flex: 1 }}>
              <StatCard
                label="ทั้งหมด"
                value={stats.total}
                icon="documents"
                gradient={GRADIENTS.primary}
                total={stats.total}
                isDark={isDark}
              />
            </FadeInUp>
            <FadeInUp delay={120} style={{ flex: 1 }}>
              <StatCard
                label="ทะเบียนรับ"
                value={stats.received}
                icon="download"
                gradient={GRADIENTS.received}
                total={stats.total}
                isDark={isDark}
              />
            </FadeInUp>
          </View>
          <View style={s.statRow}>
            <FadeInUp delay={160} style={{ flex: 1 }}>
              <StatCard
                label="ทะเบียนส่ง"
                value={stats.sent}
                icon="send"
                gradient={GRADIENTS.sent}
                total={stats.total}
                isDark={isDark}
              />
            </FadeInUp>
            <FadeInUp delay={200} style={{ flex: 1 }}>
              <StatCard
                label="วันนี้"
                value={stats.today}
                icon="today"
                gradient={GRADIENTS.success}
                total={stats.total}
                isDark={isDark}
              />
            </FadeInUp>
          </View>

          {/* Monthly chart */}
          <FadeInUp delay={240}>
            <View style={[s.panel, { backgroundColor: c.card }]}>
              <Text style={[s.panelTitle, { color: c.text }]}>
                📊 สถิติรายเดือน (6 เดือน)
              </Text>
              <View style={s.legendRow}>
                <Legend color={c.received} label="รับ" c={c} />
                <Legend color={c.sent} label="ส่ง" c={c} />
              </View>
              {monthKeys.length === 0 ? (
                <Text
                  style={{
                    color: c.textSecondary,
                    textAlign: "center",
                    paddingVertical: 20,
                  }}
                >
                  ไม่มีข้อมูล
                </Text>
              ) : (
                <View style={s.chartArea}>
                  {monthKeys.map((k, ci) => {
                    const rec = monthly[k].received || 0;
                    const sen = monthly[k].sent || 0;
                    const label =
                      THAI_MONTHS[parseInt(k.split("-")[1], 10) - 1];
                    return (
                      <View key={k} style={s.chartCol}>
                        <View style={s.barGroup}>
                          <AnimatedBar
                            height={Math.max(3, (rec / chartMax) * 100)}
                            color={c.received}
                            delay={ci * 40}
                          />
                          <AnimatedBar
                            height={Math.max(3, (sen / chartMax) * 100)}
                            color={c.sent}
                            delay={ci * 40 + 80}
                          />
                        </View>
                        <Text
                          style={[s.chartLabel, { color: c.textSecondary }]}
                        >
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </FadeInUp>

          {/* Top companies */}
          {companies.length > 0 && (
            <FadeInUp delay={280}>
              <View style={[s.panel, { backgroundColor: c.card }]}>
                <Text style={[s.panelTitle, { color: c.text }]}>
                  🏢 หน่วยงานสูงสุด
                </Text>
                {companies.map((co, i) => (
                  <View key={i} style={s.companyRow}>
                    <Text
                      style={{ color: c.text, flex: 1, fontSize: 13 }}
                      numberOfLines={1}
                    >
                      {i + 1}. {co.company || "ไม่ระบุ"}
                    </Text>
                    <View
                      style={[
                        s.companyBadge,
                        { backgroundColor: c.primary + "22" },
                      ]}
                    >
                      <Text
                        style={{
                          color: c.primary,
                          fontWeight: "800",
                          fontSize: 12,
                        }}
                      >
                        {co.count}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </FadeInUp>
          )}

          {/* Tabs */}
          <View style={s.tabRow}>
            <TabBtn
              label="ทั้งหมด"
              count={counts.all}
              active={tab === "all"}
              onPress={() => setTab("all")}
              c={c}
            />
            <TabBtn
              label="รอลงรับ"
              count={counts.waiting}
              active={tab === "waiting"}
              onPress={() => setTab("waiting")}
              c={c}
              highlight={c.sent}
            />
            <TabBtn
              label="ลงรับแล้ว"
              count={counts.done}
              active={tab === "done"}
              onPress={() => setTab("done")}
              c={c}
            />
            <TabBtn
              label="ส่ง"
              count={counts.sent}
              active={tab === "sent"}
              onPress={() => setTab("sent")}
              c={c}
            />
          </View>

          {/* List */}
          {visibleList.length === 0 ? (
            <Text
              style={{
                color: c.textSecondary,
                textAlign: "center",
                marginTop: 24,
              }}
            >
              ไม่มีรายการ
            </Text>
          ) : (
            <>
              {/* แถบสรุปจำนวน/หน้า */}
              <View style={s.pageInfoRow}>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                  ทั้งหมด {visibleList.length} รายการ · แสดง{" "}
                  {(page - 1) * PAGE_SIZE + 1}-
                  {Math.min(page * PAGE_SIZE, visibleList.length)}
                </Text>
                <Text
                  style={{
                    color: c.textSecondary,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  หน้า {page}/{totalPages}
                </Text>
              </View>

              {pagedList.map((item, idx) => (
                <CorrRow
                  key={item.id}
                  item={item}
                  index={idx}
                  c={c}
                  s={s}
                  onDetail={() => openDetail(item)}
                  onAck={() => acknowledge(item)}
                  onCancel={() => {
                    setCancelTarget(item);
                    setCancelRemark("");
                  }}
                  onLogs={() => openLogs(item)}
                />
              ))}

              {/* ตัวควบคุมเปลี่ยนหน้า */}
              {totalPages > 1 && (
                <View style={s.pagerRow}>
                  <TouchableOpacity
                    style={[
                      s.pagerBtn,
                      { borderColor: c.border, opacity: page <= 1 ? 0.4 : 1 },
                    ]}
                    disabled={page <= 1}
                    onPress={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <Ionicons name="chevron-back" size={16} color={c.primary} />
                    <Text
                      style={{
                        color: c.primary,
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      ก่อนหน้า
                    </Text>
                  </TouchableOpacity>

                  <Text
                    style={{ color: c.text, fontWeight: "800", fontSize: 14 }}
                  >
                    {page} / {totalPages}
                  </Text>

                  <TouchableOpacity
                    style={[
                      s.pagerBtn,
                      {
                        borderColor: c.border,
                        opacity: page >= totalPages ? 0.4 : 1,
                      },
                    ]}
                    disabled={page >= totalPages}
                    onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <Text
                      style={{
                        color: c.primary,
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      ถัดไป
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={c.primary}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={filterDate ? new Date(filterDate) : new Date()}
          mode="date"
          onChange={(e, d) => {
            setShowDatePicker(false);
            if (e.type === "set" && d) {
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              setFilterDate(iso);
              setTimeout(applyFilter, 0);
            }
          }}
        />
      )}

      {/* Detail modal */}
      <Modal
        visible={!!detail}
        animationType="slide"
        transparent
        onRequestClose={() => setDetail(null)}
      >
        <View style={[s.modalOverlay, { backgroundColor: c.overlay }]}>
          <View
            style={[s.sheet, { backgroundColor: c.card, overflow: "hidden" }]}
          >
            {detailLoading || detail?.__loading ? (
              <>
                <View style={[s.sheetHead, { borderBottomColor: c.border }]}>
                  <Text style={[s.sheetTitle, { color: c.text }]}>
                    รายละเอียดหนังสือ
                  </Text>
                  <TouchableOpacity onPress={() => setDetail(null)}>
                    <Ionicons name="close" size={26} color={c.textSecondary} />
                  </TouchableOpacity>
                </View>
                <ActivityIndicator
                  color={c.primary}
                  style={{ marginTop: 40 }}
                />
              </>
            ) : detail ? (
              (() => {
                const isRec = detail.book_type === "received";
                const themeColor = isRec ? c.received : c.sent;
                const heroPastel = isRec
                  ? PASTEL_HERO.received
                  : PASTEL_HERO.sent;
                return (
                  <>
                    {/* Header pastel ตามประเภทหนังสือ (คงที่ ไม่เลื่อนตามเนื้อหา) */}
                    <LinearGradient
                      colors={heroPastel}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={s.heroPastel}
                    >
                      <LinearGradient
                        colors={isRec ? GRADIENTS.received : GRADIENTS.sent}
                        style={s.heroIconChip}
                      >
                        <Ionicons
                          name={isRec ? "mail-open" : "send"}
                          size={22}
                          color="#fff"
                        />
                      </LinearGradient>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.heroTypeLabel, { color: themeColor }]}>
                          {isRec ? "ทะเบียนรับ" : "ทะเบียนส่ง"}
                        </Text>
                        <Text
                          style={[s.heroTitleText, { color: c.text }]}
                          numberOfLines={2}
                        >
                          {detail.subject || "-"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          s.heroCloseBtn,
                          { backgroundColor: c.card, borderColor: c.border },
                        ]}
                        onPress={() => setDetail(null)}
                      >
                        <Ionicons
                          name="close"
                          size={18}
                          color={c.textSecondary}
                        />
                      </TouchableOpacity>
                    </LinearGradient>

                    {/* เนื้อหา (เลื่อนได้) */}
                    <ScrollView
                      style={{ flex: 1 }}
                      contentContainerStyle={{ padding: 16 }}
                      showsVerticalScrollIndicator={false}
                    >
                      <View style={s.fieldGrid}>
                        <View
                          style={[
                            s.fieldCell,
                            {
                              backgroundColor: c.bgSecondary,
                              borderColor: c.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.fieldCellLabel,
                              { color: c.textSecondary },
                            ]}
                          >
                            เลขทะเบียน
                          </Text>
                          <Text
                            style={[s.fieldCellValue, { color: c.primary }]}
                          >
                            {detail.reg_no || "-"}
                          </Text>
                        </View>
                        <View
                          style={[
                            s.fieldCell,
                            {
                              backgroundColor: c.bgSecondary,
                              borderColor: c.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.fieldCellLabel,
                              { color: c.textSecondary },
                            ]}
                          >
                            วันที่
                          </Text>
                          <Text style={[s.fieldCellValue, { color: c.text }]}>
                            {detail.book_date_thai || detail.book_date || "-"}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          s.subjectCard,
                          {
                            backgroundColor: c.primary + "12",
                            borderColor: c.primary + "30",
                          },
                        ]}
                      >
                        <Text style={[s.fieldCellLabel, { color: c.primary }]}>
                          เรื่อง / รายละเอียด
                        </Text>
                        <Text
                          style={{
                            color: c.text,
                            fontSize: 14,
                            marginTop: 4,
                            lineHeight: 20,
                          }}
                        >
                          {detail.subject || "-"}
                        </Text>
                      </View>

                      <View style={s.fieldGrid}>
                        <View
                          style={[
                            s.fieldCell,
                            {
                              backgroundColor: c.success + "12",
                              borderColor: c.success + "30",
                            },
                          ]}
                        >
                          <Text
                            style={[s.fieldCellLabel, { color: c.success }]}
                          >
                            {isRec ? "จาก" : "ผู้ลงนาม"}
                          </Text>
                          <Text style={[s.fieldCellValue, { color: c.text }]}>
                            {detail.sender || "-"}
                          </Text>
                        </View>
                        <View
                          style={[
                            s.fieldCell,
                            {
                              backgroundColor: "#f59e0b18",
                              borderColor: "#f59e0b40",
                            },
                          ]}
                        >
                          <Text
                            style={[s.fieldCellLabel, { color: "#b45309" }]}
                          >
                            {isRec ? "ผู้รับผิดชอบ" : "ชื่อผู้รับ / หน่วยงาน"}
                          </Text>
                          <Text style={[s.fieldCellValue, { color: c.text }]}>
                            {detail.internal_staff || "-"}
                          </Text>
                        </View>
                      </View>

                      <View style={s.fieldGrid}>
                        <View
                          style={[
                            s.fieldCell,
                            {
                              backgroundColor: c.bgSecondary,
                              borderColor: c.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.fieldCellLabel,
                              { color: c.textSecondary },
                            ]}
                          >
                            ที่หนังสือ
                          </Text>
                          <Text style={[s.fieldCellValue, { color: c.text }]}>
                            {detail.ref_no || "-"}
                          </Text>
                        </View>
                        <View
                          style={[
                            s.fieldCell,
                            {
                              backgroundColor: c.bgSecondary,
                              borderColor: c.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.fieldCellLabel,
                              { color: c.textSecondary },
                            ]}
                          >
                            หน่วยงาน / บริษัท
                          </Text>
                          <Text
                            style={[s.fieldCellValue, { color: c.primary }]}
                          >
                            {detail.company || "-"}
                          </Text>
                        </View>
                      </View>

                      {/* หมายเหตุ — ข้อมูลเสริมนอกเหนือจากดีไซน์เว็บต้นฉบับ */}
                      {!!detail.note && (
                        <View
                          style={[
                            s.noteBox,
                            {
                              backgroundColor: c.bgSecondary,
                              borderColor: c.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.detailCaption,
                              { color: c.textSecondary, marginBottom: 4 },
                            ]}
                          >
                            📝 หมายเหตุ
                          </Text>
                          <Text style={{ color: c.text, fontSize: 13 }}>
                            {detail.note}
                          </Text>
                        </View>
                      )}
                    </ScrollView>

                    {/* Footer คงที่ — ปุ่มลงรับ/ยกเลิกลงรับ (เฉพาะทะเบียนรับ) */}
                    <View
                      style={[
                        s.detailFooterFixed,
                        {
                          borderTopColor: c.border,
                          backgroundColor: c.bgSecondary,
                        },
                      ]}
                    >
                      {isRec && !detail.receiver && (
                        <>
                          <ScalePress
                            onPress={() =>
                              acknowledge(detail, () => setDetail(null))
                            }
                            style={[
                              s.ackBigBtn,
                              { backgroundColor: c.received },
                            ]}
                          >
                            <Ionicons
                              name="checkmark-done"
                              size={20}
                              color="#fff"
                            />
                            <Text
                              style={{
                                color: "#fff",
                                fontWeight: "800",
                                fontSize: 15,
                              }}
                            >
                              กดรับทราบ / รับหนังสือฉบับนี้
                            </Text>
                          </ScalePress>
                          <TouchableOpacity
                            style={[
                              s.historyBtnFooter,
                              {
                                borderColor: c.border,
                                backgroundColor: c.card,
                              },
                            ]}
                            onPress={() => {
                              setDetail(null);
                              openLogs(detail);
                            }}
                          >
                            <Ionicons
                              name="time-outline"
                              size={15}
                              color={c.textSecondary}
                            />
                            <Text
                              style={{
                                color: c.textSecondary,
                                fontWeight: "700",
                                fontSize: 13,
                              }}
                            >
                              ประวัติยกเลิกรับหนังสือ
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {isRec && !!detail.receiver && (
                        <>
                          <View
                            style={[
                              s.receiverRow,
                              {
                                backgroundColor: c.success + "14",
                                borderColor: c.success + "40",
                              },
                            ]}
                          >
                            <View
                              style={[
                                s.receiverAvatar,
                                { backgroundColor: c.success },
                              ]}
                            >
                              <Ionicons
                                name="checkmark-done"
                                size={18}
                                color="#fff"
                              />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text
                                style={{
                                  color: c.success,
                                  fontSize: 10,
                                  fontWeight: "800",
                                  textTransform: "uppercase",
                                  letterSpacing: 0.5,
                                }}
                              >
                                รับทราบแล้วโดย
                              </Text>
                              <Text
                                style={{
                                  color: c.text,
                                  fontWeight: "700",
                                  fontSize: 14,
                                }}
                                numberOfLines={1}
                              >
                                {detail.receiver}
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={[
                                s.cancelChipBtn,
                                { backgroundColor: c.danger + "18" },
                              ]}
                              onPress={() => {
                                setDetail(null);
                                setCancelTarget(detail);
                                setCancelRemark("");
                              }}
                            >
                              <Ionicons
                                name="close-circle-outline"
                                size={15}
                                color={c.danger}
                              />
                              <Text
                                style={{
                                  color: c.danger,
                                  fontWeight: "700",
                                  fontSize: 12,
                                }}
                              >
                                ยกเลิกรับ
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity
                            style={[
                              s.historyBtnFooter,
                              {
                                borderColor: c.border,
                                backgroundColor: c.card,
                              },
                            ]}
                            onPress={() => {
                              setDetail(null);
                              openLogs(detail);
                            }}
                          >
                            <Ionicons
                              name="time-outline"
                              size={15}
                              color={c.textSecondary}
                            />
                            <Text
                              style={{
                                color: c.textSecondary,
                                fontWeight: "700",
                                fontSize: 13,
                              }}
                            >
                              ประวัติยกเลิกรับหนังสือ
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {!isRec && (
                        <TouchableOpacity
                          style={[
                            s.sentCloseBtn,
                            { borderColor: c.border, backgroundColor: c.card },
                          ]}
                          onPress={() => setDetail(null)}
                        >
                          <Ionicons
                            name="close"
                            size={17}
                            color={c.textSecondary}
                          />
                          <Text
                            style={{
                              color: c.textSecondary,
                              fontWeight: "700",
                              fontSize: 15,
                            }}
                          >
                            ปิด
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                );
              })()
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Cancel-ack modal */}
      <Modal
        visible={!!cancelTarget}
        animationType="fade"
        transparent
        onRequestClose={() => setCancelTarget(null)}
      >
        <View
          style={[
            s.modalOverlay,
            {
              backgroundColor: c.overlay,
              justifyContent: "center",
              padding: 20,
            },
          ]}
        >
          <FadeInUp
            duration={220}
            style={[s.dialog, { backgroundColor: c.card }]}
          >
            <View style={s.dlgIconRow}>
              <View
                style={[s.dlgIconWrap, { backgroundColor: c.danger + "22" }]}
              >
                <Ionicons name="close-circle" size={22} color={c.danger} />
              </View>
              <Text style={[s.sheetTitle, { color: c.text }]}>
                ยกเลิกการรับหนังสือ
              </Text>
            </View>
            <Text
              style={{ color: c.textSecondary, fontSize: 12, marginBottom: 12 }}
              numberOfLines={2}
            >
              {cancelTarget?.subject}
            </Text>
            <Text style={[s.fieldLabel, { color: c.textSecondary }]}>
              หมายเหตุการยกเลิก (บังคับ) *
            </Text>
            <TextInput
              value={cancelRemark}
              onChangeText={setCancelRemark}
              placeholder="ระบุเหตุผลที่ยกเลิกรับ..."
              placeholderTextColor={c.textSecondary}
              multiline
              style={[
                s.input,
                {
                  minHeight: 70,
                  textAlignVertical: "top",
                  color: c.text,
                  borderColor: c.border,
                  backgroundColor: c.bgSecondary,
                },
              ]}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[s.dlgCancel, { borderColor: c.border }]}
                onPress={() => setCancelTarget(null)}
              >
                <Text style={{ color: c.textSecondary, fontWeight: "700" }}>
                  ปิด
                </Text>
              </TouchableOpacity>
              <ScalePress
                onPress={submitCancel}
                disabled={cancelBusy}
                style={[s.dlgConfirm, { backgroundColor: c.danger }]}
              >
                {cancelBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "800" }}>
                    ยืนยันยกเลิก
                  </Text>
                )}
              </ScalePress>
            </View>
          </FadeInUp>
        </View>
      </Modal>

      {/* Cancel logs modal */}
      <Modal
        visible={!!logsFor}
        animationType="fade"
        transparent
        onRequestClose={() => setLogsFor(null)}
      >
        <View
          style={[
            s.modalOverlay,
            {
              backgroundColor: c.overlay,
              justifyContent: "center",
              padding: 20,
            },
          ]}
        >
          <FadeInUp
            duration={220}
            style={[s.dialog, { backgroundColor: c.card, maxHeight: "70%" }]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <View style={s.dlgIconRow}>
                <View
                  style={[s.dlgIconWrap, { backgroundColor: c.primary + "22" }]}
                >
                  <Ionicons name="time" size={20} color={c.primary} />
                </View>
                <Text style={[s.sheetTitle, { color: c.text }]}>
                  ประวัติการยกเลิกรับหนังสือ
                </Text>
              </View>
              <TouchableOpacity onPress={() => setLogsFor(null)}>
                <Ionicons name="close" size={24} color={c.textSecondary} />
              </TouchableOpacity>
            </View>
            {logsLoading ? (
              <ActivityIndicator color={c.primary} />
            ) : logs.length === 0 ? (
              <Text style={{ color: c.textSecondary }}>
                ไม่มีประวัติการยกเลิก
              </Text>
            ) : (
              <ScrollView>
                {logs.map((l, i) => (
                  <View key={i} style={[s.logItem, { borderColor: c.border }]}>
                    <Text
                      style={{ color: c.text, fontWeight: "700", fontSize: 13 }}
                    >
                      {l.canceled_by || "ไม่ระบุ"}
                    </Text>
                    <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                      {l.canceled_at}
                    </Text>
                    <Text style={{ color: c.text, fontSize: 13, marginTop: 4 }}>
                      {l.remark}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </FadeInUp>
        </View>
      </Modal>
    </View>
  );
}

// ---------- Animation helpers ----------

// เฟดขึ้น + ไล่ตำแหน่งเล็กน้อยตอน mount (ใช้กับการ์ด/แถวต่าง ๆ)
function FadeInUp({ delay = 0, duration = 380, style, children }: any) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });
  return (
    <Animated.View
      style={[style, { opacity: anim, transform: [{ translateY }] }]}
    >
      {children}
    </Animated.View>
  );
}

// ปุ่ม/การ์ดที่ยุบตัวเล็กน้อยตอนกด ให้ความรู้สึก tactile
function ScalePress({ onPress, style, children, disabled }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  const pressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// แท่งกราฟที่ไล่ความสูงขึ้นมาตอนโหลดข้อมูล
function AnimatedBar({ height, color, delay = 0 }: any) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: height,
      duration: 550,
      delay,
      useNativeDriver: false,
    }).start();
  }, [height]);
  return (
    <Animated.View
      style={{
        width: 10,
        borderTopLeftRadius: 3,
        borderTopRightRadius: 3,
        backgroundColor: color,
        height: anim,
      }}
    />
  );
}

// แถบ progress ที่ไล่ความกว้างขึ้นมา
function AnimatedProgress({ pct, color, trackColor }: any) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 750,
      useNativeDriver: false,
    }).start();
  }, [pct]);
  const width = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });
  return (
    <View
      style={{
        height: 5,
        borderRadius: 3,
        overflow: "hidden",
        backgroundColor: trackColor,
        marginTop: 2,
      }}
    >
      <Animated.View
        style={{ height: 5, borderRadius: 3, backgroundColor: color, width }}
      />
    </View>
  );
}

// ---------- Sub-components ----------
function StatCard({ label, value, icon, gradient, total, isDark }: any) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={statCardStyle.card}
    >
      <View style={statCardStyle.iconWrap}>
        <Ionicons name={icon} size={16} color="#fff" />
      </View>
      <Text style={statCardStyle.label}>{label}</Text>
      <Text style={statCardStyle.value}>{value}</Text>
      <AnimatedProgress
        pct={pct}
        color="#ffffff"
        trackColor="rgba(255,255,255,0.28)"
      />
      <Text style={statCardStyle.pct}>{pct}%</Text>
    </LinearGradient>
  );
}

const statCardStyle = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
  },
  iconWrap: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.22)",
    justifyContent: "center",
    alignItems: "center",
  },
  label: { color: "rgba(255,255,255,0.92)", fontSize: 12, fontWeight: "700" },
  value: { color: "#fff", fontSize: 26, fontWeight: "800", marginVertical: 4 },
  pct: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 10,
    marginTop: 3,
    textAlign: "right",
  },
});

function Legend({ color, label, c }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
      <Text style={{ color: c.textSecondary, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function TabBtn({ label, count, active, onPress, c, highlight }: any) {
  const anim = useRef(new Animated.Value(active ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: active ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [active]);
  const activeColor = highlight || c.primary;
  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [c.card, activeColor],
  });
  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [c.border, activeColor],
  });
  const pressIn = () =>
    Animated.spring(scale, {
      toValue: 0.94,
      useNativeDriver: true,
      speed: 40,
    }).start();
  const pressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
    }).start();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={{
          paddingVertical: 8,
          borderRadius: 8,
          alignItems: "center",
          backgroundColor,
          borderWidth: 1,
          borderColor,
          transform: [{ scale }],
        }}
      >
        <Text
          style={{
            color: active ? "#fff" : c.text,
            fontSize: 11,
            fontWeight: "700",
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: active ? "#fff" : c.textSecondary,
            fontSize: 13,
            fontWeight: "800",
          }}
        >
          {count}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function CorrRow({
  item,
  c,
  s,
  index = 0,
  onDetail,
  onAck,
  onCancel,
  onLogs,
}: any) {
  const isReceived = item.book_type === "received";
  const waiting = isReceived && !item.receiver;
  const typeColor = isReceived ? c.received : c.sent;
  return (
    <FadeInUp
      delay={Math.min(index, 10) * 45}
      style={[s.row, { backgroundColor: c.card, borderLeftColor: typeColor }]}
    >
      <ScalePress onPress={onDetail}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <View style={[s.typePill, { backgroundColor: typeColor + "22" }]}>
            <Text style={{ color: typeColor, fontSize: 10, fontWeight: "800" }}>
              {isReceived ? "รับ" : "ส่ง"}
            </Text>
          </View>
          {!!item.reg_no && (
            <Text
              style={{
                color: c.textSecondary,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              #{item.reg_no}
            </Text>
          )}
          <View style={{ flex: 1 }} />
          <Text style={{ color: c.textSecondary, fontSize: 11 }}>
            {item.book_date_thai || item.book_date}
          </Text>
        </View>
        <Text
          style={{ color: c.text, fontSize: 14, fontWeight: "700" }}
          numberOfLines={2}
        >
          {item.subject || "-"}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 3,
          }}
        >
          {!!item.company && (
            <Text
              style={{ color: c.textSecondary, fontSize: 12 }}
              numberOfLines={1}
            >
              {item.company}
            </Text>
          )}
          {!!item.file_count && item.file_count > 0 && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
            >
              <Ionicons name="attach" size={12} color={c.textSecondary} />
              <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                {item.file_count}
              </Text>
            </View>
          )}
        </View>
      </ScalePress>

      {/* สถานะ + ปุ่ม */}
      <View style={[s.rowActions, { borderTopColor: c.border }]}>
        {isReceived ? (
          waiting ? (
            <>
              <View style={[s.statusChip, { backgroundColor: c.sent + "22" }]}>
                <Text
                  style={{ color: c.sent, fontSize: 11, fontWeight: "800" }}
                >
                  ⏳ รอการรับ
                </Text>
              </View>
              <View style={{ flex: 1 }} />
              <ScalePress
                onPress={onAck}
                style={[s.ackBtn, { backgroundColor: c.success }]}
              >
                <Ionicons name="checkmark-done" size={15} color="#fff" />
                <Text
                  style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}
                >
                  ลงรับ
                </Text>
              </ScalePress>
            </>
          ) : (
            <>
              <View
                style={[s.statusChip, { backgroundColor: c.success + "22" }]}
              >
                <Text
                  style={{ color: c.success, fontSize: 11, fontWeight: "800" }}
                  numberOfLines={1}
                >
                  ✅ รับโดย {item.receiver}
                </Text>
              </View>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={s.linkBtn} onPress={onLogs}>
                <Ionicons
                  name="time-outline"
                  size={13}
                  color={c.textSecondary}
                />
                <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                  ประวัติ
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.linkBtn} onPress={onCancel}>
                <Ionicons
                  name="close-circle-outline"
                  size={13}
                  color={c.danger}
                />
                <Text style={{ color: c.danger, fontSize: 11 }}>
                  ยกเลิกลงรับ
                </Text>
              </TouchableOpacity>
            </>
          )
        ) : (
          <View style={[s.statusChip, { backgroundColor: c.sent + "22" }]}>
            <Text style={{ color: c.sent, fontSize: 11, fontWeight: "800" }}>
              📤 ส่งออกแล้ว
            </Text>
          </View>
        )}
      </View>
    </FadeInUp>
  );
}

// ---------- Styles ----------
const getStyles = (c: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    waitBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 14,
      marginBottom: 12,
      elevation: 3,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 6,
    },
    waitBannerIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: "rgba(255,255,255,0.25)",
      justifyContent: "center",
      alignItems: "center",
    },
    waitBannerTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
    waitBannerSub: {
      color: "rgba(255,255,255,0.9)",
      fontSize: 11,
      marginTop: 2,
    },
    filterBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 8,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 12,
    },
    searchBox: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      height: 38,
      borderRadius: 8,
      borderWidth: 1,
    },
    searchInput: { flex: 1, fontSize: 13, padding: 0 },
    dateBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      height: 38,
      borderRadius: 8,
      borderWidth: 1,
    },
    goBtn: {
      paddingHorizontal: 12,
      height: 38,
      borderRadius: 8,
      justifyContent: "center",
    },
    statRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
    panel: { borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1 },
    panelTitle: { fontSize: 14, fontWeight: "800", marginBottom: 10 },
    legendRow: { flexDirection: "row", gap: 16, marginBottom: 10 },
    chartArea: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-around",
      height: 130,
    },
    chartCol: { alignItems: "center", flex: 1 },
    barGroup: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 3,
      height: 105,
    },
    bar: { width: 10, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
    chartLabel: { fontSize: 10, marginTop: 4 },
    companyRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 7,
      gap: 8,
    },
    companyBadge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 10,
    },
    tabRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
    pageInfoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    pagerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
      marginBottom: 10,
    },
    pagerBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
    },
    row: {
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
      borderLeftWidth: 4,
      elevation: 1,
    },
    typePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    rowActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 10,
      paddingTop: 8,
      borderTopWidth: 1,
    },
    statusChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      maxWidth: "60%",
    },
    ackBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 8,
    },
    linkBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    // modal
    modalOverlay: { flex: 1, justifyContent: "flex-end" },
    sheet: { height: "85%", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
    sheetHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
    },
    sheetTitle: { fontSize: 16, fontWeight: "800" },
    sheetSection: {
      fontSize: 14,
      fontWeight: "800",
      marginTop: 12,
      marginBottom: 8,
    },
    // detail modal — header pastel คงที่ + เนื้อหาเลื่อนได้ + footer คงที่ (อ้างอิงจาก dashboard_correspondence.php)
    heroPastel: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
      padding: 18,
    },
    heroIconChip: {
      width: 50,
      height: 50,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
    },
    heroCloseBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    heroTypeLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    heroTitleText: { fontSize: 16, fontWeight: "800", lineHeight: 21 },
    fieldGrid: { flexDirection: "row", gap: 10, marginBottom: 10 },
    fieldCell: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12 },
    fieldCellLabel: {
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    fieldCellValue: { fontSize: 14, fontWeight: "700" },
    subjectCard: {
      borderRadius: 12,
      borderWidth: 1,
      padding: 14,
      marginBottom: 10,
    },
    detailCaption: { fontSize: 11, fontWeight: "700" },
    noteBox: {
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderStyle: "dashed",
      marginTop: 2,
      marginBottom: 12,
    },
    detailFooterFixed: { padding: 16, borderTopWidth: 1, gap: 10 },
    ackBigBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
    },
    historyBtnFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 11,
      borderRadius: 10,
      borderWidth: 1,
    },
    sentCloseBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
    },
    receiverRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
    },
    receiverAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    cancelChipBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    dialog: { borderRadius: 16, padding: 18 },
    dlgIconRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
    },
    dlgIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    fieldLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    dlgCancel: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
    },
    dlgConfirm: {
      flex: 1.4,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
    },
    logItem: { padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  });
