import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_BASE } from "../../constants/config";
import { useAuth } from "../_layout";

const ACTIVE_COLOR = "#f97316"; // 🟠 สีส้ม Admin
const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

// --- Helper Functions ---
const formatMoney = (amount: any) => {
  const num = parseFloat(String(amount)) || 0;
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${date.getFullYear() + 543}`;
};

const formatTime = (dateStr: string) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
};

const safeParse = (jsonString: any): any[] => {
  if (!jsonString) return [];
  try {
    if (Array.isArray(jsonString)) return jsonString;
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    return typeof jsonString === "string" ? [jsonString] : [];
  }
};

const sumArray = (arr: any) => {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
};

const openFile = (fileName: string, folder: string = "admin") => {
  if (!fileName) return;
  const baseUrl = API_BASE.replace("/api_mobile.php", "");
  const fullUrl = `${baseUrl}/uploads/${folder}/${fileName}`;
  Linking.openURL(fullUrl).catch((err) =>
    Alert.alert("Error", "ไม่สามารถเปิดไฟล์ได้: " + fullUrl),
  );
};

const formatDateForAPI = (date: Date) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// =====================================================================
// 📅 Custom Calendar Component
// =====================================================================
const CustomCalendarModal = ({ visible, onClose, onSelect }: any) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  if (!visible) return null;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const days = [];
  for (let i = 0; i < firstDayIndex; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const changeMonth = (offset: number) => {
    const newDate = new Date(year, month + offset, 1);
    setCurrentDate(newDate);
  };

  const handleSelectDay = (day: number) => {
    const selected = new Date(year, month, day);
    const offset = selected.getTimezoneOffset() * 60000;
    const localISOTime = new Date(selected.getTime() - offset)
      .toISOString()
      .slice(0, 10);
    onSelect(localISOTime);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.calOverlay}>
        <View style={styles.calContainer}>
          <View style={styles.calHeader}>
            <TouchableOpacity
              onPress={() => changeMonth(-1)}
              style={styles.calNavBtn}
            >
              <Ionicons name="chevron-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.calTitle}>
              {THAI_MONTHS[month]} {year + 543}
            </Text>
            <TouchableOpacity
              onPress={() => changeMonth(1)}
              style={styles.calNavBtn}
            >
              <Ionicons name="chevron-forward" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          <View style={styles.calWeekRow}>
            {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d, i) => (
              <Text
                key={i}
                style={[
                  styles.calWeekText,
                  i === 0 || i === 6 ? { color: "#ef4444" } : null,
                ]}
              >
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.calGrid}>
            {days.map((day, index) => (
              <TouchableOpacity
                key={index}
                style={styles.calDayCell}
                onPress={() => day && handleSelectDay(day)}
                disabled={!day}
              >
                {day && (
                  <View
                    style={[
                      styles.calDayCircle,
                      day === new Date().getDate() &&
                      month === new Date().getMonth() &&
                      year === new Date().getFullYear()
                        ? { backgroundColor: "#e0e7ff" }
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calDayText,
                        day === new Date().getDate() &&
                        month === new Date().getMonth() &&
                        year === new Date().getFullYear()
                          ? { color: "#4f46e5", fontWeight: "bold" }
                          : null,
                      ]}
                    >
                      {day}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.calCloseBtn}>
            <Text style={styles.calCloseText}>ยกเลิก</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// =====================================================================
// 🚀 Main Component
// =====================================================================
export default function HistoryAdmin() {
  const router = useRouter();
  const { user } = useAuth();

  // Data States
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // KPI State
  const [kpi, setKpi] = useState({
    accom: 0,
    labor: 0,
    other: 0,
    docs: 0,
    pr: 0,
    job: 0,
    bg: 0,
    stamp: 0,
  });

  // Filter States
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState("ทั้งหมด");
  const [showFilter, setShowFilter] = useState(false);

  // Calendar & Modal
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMode, setCalendarMode] = useState<"start" | "end">("start");
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);

  // --- Calendar Logic ---
  const openCalendar = (mode: "start" | "end") => {
    setCalendarMode(mode);
    setShowCalendar(true);
  };

  const handleDateSelect = (dateStr: string) => {
    if (calendarMode === "start") setStartDate(dateStr);
    else setEndDate(dateStr);
    setShowCalendar(false);
  };

  // --- Fetch Data ---
  const fetchData = async () => {
    try {
      if (!refreshing) setLoading(true);

      let url = `${API_BASE}/api_mobile.php?action=get_history&reporter_name=${encodeURIComponent(user?.fullname || "")}`;

      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;

      const res = await axios.get(url);

      if (res.data && res.data.history) {
        // 1. กรองเอาเฉพาะ Admin/General/Other (ตัด Sales, Marketing, Purchase)
        const adminData = res.data.history.filter((item: any) => {
          const type = item.source_type;
          return (
            type === "admin" ||
            type === "general" ||
            type === "other" ||
            (type !== "sales" && type !== "marketing" && type !== "purchase")
          );
        });

        // 2. เรียงวันที่ น้อย -> มาก (เก่า -> ใหม่)
        adminData.sort(
          (a: any, b: any) =>
            new Date(a.report_date).getTime() -
            new Date(b.report_date).getTime(),
        );

        // 3. คำนวณ KPI (Client-side)
        let stats = {
          accom: 0,
          labor: 0,
          other: 0,
          docs: 0,
          pr: 0,
          job: 0,
          bg: 0,
          stamp: 0,
        };
        adminData.forEach((item: any) => {
          if (item.has_expense) {
            stats.accom += sumArray(safeParse(item.exp_accom));
            stats.labor += sumArray(safeParse(item.exp_labor)); // * อาจจะต้องคิด Net 97% หากต้องการ
            stats.other += sumArray(safeParse(item.exp_other_amount));
            const docs = safeParse(item.exp_doc);
            docs.forEach((docStr: any) => {
              if (typeof docStr === "string") {
                // แยกรายการด้วยเครื่องหมายลูกน้ำ (,)
                const subDocs = docStr.split(",");
                subDocs.forEach((s) => {
                  // Regex จับตัวเลขหลัง : และก่อน )
                  const match = s.match(/:\s*([\d,\.]+)\s*\)/);
                  if (match) {
                    stats.docs += parseFloat(match[1].replace(/,/g, "")) || 0;
                  }
                });
              }
            });
          }
          if (item.has_pr) stats.pr += sumArray(safeParse(item.pr_budget));
          if (item.has_job) stats.job += sumArray(safeParse(item.job_budget));
          if (item.has_bg) stats.bg += sumArray(safeParse(item.bg_amount));
          if (item.has_stamp)
            stats.stamp += sumArray(safeParse(item.stamp_cost));
        });

        setKpi(stats);
        setData(adminData);
      } else {
        setData([]);
        setKpi({
          accom: 0,
          labor: 0,
          other: 0,
          pr: 0,
          job: 0,
          bg: 0,
          stamp: 0,
          docs: 0,
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleReset = () => {
    setStartDate("");
    setEndDate("");
    setFilterStatus("ทั้งหมด");
    setLoading(true);
    setTimeout(() => fetchData(), 100);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Render Helpers ---
  const KpiCard = ({ title, value, icon, color, bg }: any) => (
    <View style={[styles.kpiCard, { borderTopColor: color }]}>
      <View style={[styles.kpiIconBox, { backgroundColor: bg }]}>
        <FontAwesome5 name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.kpiTitle}>{title}</Text>
        <Text style={[styles.kpiValue, { color: color }]}>
          {formatMoney(value)}
        </Text>
      </View>
    </View>
  );

  const Badge = ({ label, color, bg }: any) => (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color: color }]}>{label}</Text>
    </View>
  );

  // --- Details Renderers ---
  const renderAdminDetails = (item: any) => {
    if (!item.has_expense) return null;
    const docs = safeParse(item.exp_doc);
    const comps = safeParse(item.exp_company);
    const depts = safeParse(item.exp_dept);
    const projs = safeParse(item.exp_proj);
    const accoms = safeParse(item.exp_accom);
    const labors = safeParse(item.exp_labor);
    const files = safeParse(item.exp_file);
    const otherDescs = safeParse(item.exp_other_desc);
    const otherAmts = safeParse(item.exp_other_amount);
    const otherFiles = safeParse(item.exp_other_file);

    const count = Math.max(comps.length, depts.length);
    let rows = [];

    // ✅ [แก้จุดที่ 1] ประกาศตัวแปร totalDocs ตรงนี้
    let totalAccom = 0,
      totalLabor = 0,
      totalOther = 0,
      totalDocs = 0;

    for (let i = 0; i < count; i++) {
      const labor = parseFloat(labors[i] || "0");
      const laborNet = labor * 0.97;
      const accom = parseFloat(accoms[i] || "0");
      const other = parseFloat(otherAmts[i] || "0");
      const subTotal = laborNet + accom + other;

      totalAccom += accom;
      totalLabor += labor;
      totalOther += other;

      const docRaw = docs[i] || "-";
      const subDocs = docRaw
        .split(",")
        .map((s: any) => s.trim())
        .filter((s: any) => s);

      const renderedDocs =
        subDocs.length > 0 && subDocs[0] !== "-" ? (
          subDocs.map((subDoc: string, idx: number) => {
            const match = subDoc.match(
              /^(.*?)\s*\(\s*(.*?)\s*[:]\s*(.*?)\s*\)/,
            );
            if (match) {
              const header = match[1].trim();
              const itemDesc = match[2].trim();

              // ✅ [แก้จุดที่ 2] รับค่าเป็น priceStr และแปลงเป็นตัวเลข priceVal
              const priceStr = match[3]
                .trim()
                .replace(/บ\.|บาท/g, "")
                .replace(/,/g, "")
                .trim();

              const priceVal = parseFloat(priceStr) || 0;

              // บวกยอดเงินเข้า totalDocs
              totalDocs += priceVal;

              return (
                <View key={idx} style={styles.docCard}>
                  <View style={styles.docHeader}>
                    <Ionicons
                      name="document-text-outline"
                      size={12}
                      color="#64748b"
                    />
                    <Text style={styles.docHeaderText}>{header}</Text>
                  </View>
                  <View style={styles.docBody}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flex: 1,
                        marginRight: 5,
                      }}
                    >
                      <Ionicons
                        name="pricetag-outline"
                        size={12}
                        color="#94a3b8"
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.docItemText} numberOfLines={1}>
                        {itemDesc}
                      </Text>
                    </View>
                    <View style={styles.docPriceBadge}>
                      <Text style={styles.docPriceText}>
                        {formatMoney(priceVal)} ฿
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }
            return (
              <View key={idx} style={styles.simpleDocBox}>
                <Text style={styles.simpleDocText}>{subDoc}</Text>
              </View>
            );
          })
        ) : (
          <Text style={styles.value}>-</Text>
        );

      rows.push(
        <View key={i} style={styles.innerCard}>
          <View style={[styles.rowBetween, { alignItems: "flex-start" }]}>
            <Text style={[styles.label, { marginTop: 6 }]}>เอกสาร:</Text>
            <View style={{ flex: 1, alignItems: "flex-end", marginLeft: 10 }}>
              {renderedDocs}
            </View>
          </View>

          <View style={styles.rowBetween}>
            <Text style={styles.label}>บริษัท:</Text>
            <Text style={styles.value}>{comps[i] || "-"}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>หน่วยงาน:</Text>
            <Text style={styles.value}>{depts[i] || "-"}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>โครงการ:</Text>
            <Text style={styles.value}>{projs[i] || "-"}</Text>
          </View>
          <View style={styles.dividerDashed} />

          <View style={styles.rowBetween}>
            <Text style={styles.label}>
              <Ionicons name="bed" /> ค่าที่พัก
            </Text>
            <Text
              style={[
                styles.highlightValue,
                { color: "#ec4899", backgroundColor: "#fce7f3" },
              ]}
            >
              {formatMoney(accom)} ฿
            </Text>
          </View>
          {files[i] ? (
            <TouchableOpacity
              onPress={() => openFile(files[i])}
              style={styles.fileLink}
            >
              <Ionicons name="attach" size={14} color="#ec4899" />
              <Text
                style={{ color: "#ec4899", fontSize: 12, fontWeight: "bold" }}
              >
                {" "}
                ดูไฟล์หลักฐาน
              </Text>
            </TouchableOpacity>
          ) : null}

          <View style={[styles.rowBetween, { marginTop: 8 }]}>
            <Text style={styles.label}>
              <Ionicons name="people" /> ค่าแรง
            </Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={[
                  styles.highlightValue,
                  { color: "#ef4444", backgroundColor: "#fee2e2" },
                ]}
              >
                {formatMoney(labor)} ฿
              </Text>
              <Text style={styles.smallNote}>
                (สุทธิ 97%: {formatMoney(laborNet)})
              </Text>
            </View>
          </View>

          {(other > 0 || otherDescs[i]) && (
            <View style={styles.otherBox}>
              <View style={styles.rowBetween}>
                <Text style={[styles.label, { color: "#d97706", flex: 1 }]}>
                  ค่าใช้จ่ายอื่นๆ: {otherDescs[i]}
                </Text>
                <Text
                  style={[
                    styles.highlightValue,
                    { color: "#d97706", backgroundColor: "#fffbeb" },
                  ]}
                >
                  {formatMoney(other)} ฿
                </Text>
              </View>
              {otherFiles[i] ? (
                <TouchableOpacity
                  onPress={() => openFile(otherFiles[i])}
                  style={[
                    styles.fileLink,
                    { alignSelf: "flex-start", marginTop: 5 },
                  ]}
                >
                  <Ionicons name="attach" size={14} color="#d97706" />
                  <Text
                    style={{
                      color: "#d97706",
                      fontSize: 12,
                      fontWeight: "bold",
                    }}
                  >
                    {" "}
                    ไฟล์แนบ
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <Text style={styles.boldLabel}>รวมรายการนี้</Text>
            <Text style={[styles.boldValue, { color: "#4f46e5" }]}>
              {formatMoney(subTotal)} ฿
            </Text>
          </View>
        </View>,
      );
    }

    const totalWht = totalLabor * 0.03;
    const totalNet = totalAccom + totalLabor * 0.97 + totalOther;

    return (
      <View style={styles.detailSection}>
        <View style={[styles.sectionHeaderBar, { backgroundColor: "#fee2e2" }]}>
          <Ionicons name="document-text" size={18} color="#ef4444" />
          <Text style={[styles.sectionHeaderText, { color: "#ef4444" }]}>
            ค่าใช้จ่าย (Admin)
          </Text>
        </View>
        {rows}
        <View style={styles.summaryBox}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>รวมค่าที่พัก</Text>
            <Text style={styles.value}>{formatMoney(totalAccom)} ฿</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>รวมค่าแรง</Text>
            <Text style={styles.value}>{formatMoney(totalLabor)} ฿</Text>
          </View>

          {/* ✅ 4. แสดงผลยอดรวมเอกสาร (totalDocs) */}
          <View
            style={[
              styles.rowBetween,
              {
                backgroundColor: "#f1f5f9",
                paddingHorizontal: 5,
                borderRadius: 4,
                marginVertical: 2,
              },
            ]}
          >
            <Text
              style={[styles.label, { fontWeight: "700", color: "#1e293b" }]}
            >
              รวมค่าเอกสาร
            </Text>
            <Text
              style={[styles.value, { fontWeight: "700", color: "#2563eb" }]}
            >
              {formatMoney(totalDocs)} ฿
            </Text>
          </View>

          <View style={styles.rowBetween}>
            <Text style={styles.label}>รวมค่าอื่นๆ</Text>
            <Text style={[styles.value, { color: "#d97706" }]}>
              {formatMoney(totalOther)} ฿
            </Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={[styles.label, { color: "#64748b" }]}>
              หัก ณ ที่จ่าย 3%
            </Text>
            <Text style={[styles.value, { color: "#ef4444" }]}>
              -{formatMoney(totalWht)} ฿
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <Text style={[styles.boldLabel, { fontSize: 16 }]}>
              ยอดสุทธิ (Net)
            </Text>
            <Text
              style={[styles.boldValue, { fontSize: 20, color: "#4f46e5" }]}
            >
              {formatMoney(totalNet)} ฿
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderGenericDetails = (
    item: any,
    type: "pr" | "job" | "bg" | "stamp",
  ) => {
    const config = {
      pr: {
        key: "has_pr",
        title: "ขอซื้อ/จ้าง (PR)",
        color: "#2563eb",
        bg: "#dbeafe",
        icon: "cart",
        fields: ["pr_dept", "pr_proj", "pr_budget"],
      },
      job: {
        key: "has_job",
        title: "แจ้งอัปงาน (Job)",
        color: "#7c3aed",
        bg: "#f3e8ff",
        icon: "construct",
        fields: ["job_dept", "job_proj", "job_budget", "job_num"],
      },
      bg: {
        key: "has_bg",
        title: "ค้ำประกัน (BG)",
        color: "#d97706",
        bg: "#fef3c7",
        icon: "briefcase",
        fields: ["bg_dept", "bg_proj", "bg_amount"],
      },
      stamp: {
        key: "has_stamp",
        title: "อากรแสตมป์",
        color: "#059669",
        bg: "#d1fae5",
        icon: "pricetag",
        fields: ["stamp_dept", "stamp_proj", "stamp_cost"],
      },
    }[type];

    if (!item[config.key]) return null;
    const depts = safeParse(item[config.fields[0]]);
    const projs = safeParse(item[config.fields[1]]);
    const amounts = safeParse(item[config.fields[2]]);
    const nums = type === "job" ? safeParse(item[config.fields[3]]) : [];

    return (
      <View style={styles.detailSection}>
        <View style={[styles.sectionHeaderBar, { backgroundColor: config.bg }]}>
          <Ionicons name={config.icon as any} size={18} color={config.color} />
          <Text style={[styles.sectionHeaderText, { color: config.color }]}>
            {config.title}
          </Text>
        </View>
        {amounts.map((amt: any, i: number) => (
          <View key={i} style={styles.innerCard}>
            {type === "job" && (
              <View style={styles.rowBetween}>
                <Text style={styles.label}>เลขหน้างาน:</Text>
                <Text style={styles.value}>{nums[i] || "-"}</Text>
              </View>
            )}
            <View style={styles.rowBetween}>
              <Text style={styles.label}>หน่วยงาน:</Text>
              <Text style={styles.value}>{depts[i] || "-"}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>โครงการ:</Text>
              <Text style={styles.value}>{projs[i] || "-"}</Text>
            </View>
            <View
              style={[
                styles.rowBetween,
                {
                  marginTop: 5,
                  paddingTop: 5,
                  borderTopWidth: 1,
                  borderTopColor: "#f1f5f9",
                },
              ]}
            >
              <Text style={styles.label}>ยอดเงิน</Text>
              <Text
                style={[
                  styles.highlightValue,
                  { color: config.color, backgroundColor: config.bg },
                ]}
              >
                {formatMoney(amt)} ฿
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>ประวัติธุรการ</Text>
          <Text style={styles.headerSubtitle}>ประวัติงานทั่วไป/เบิกจ่าย</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowFilter(!showFilter)}
          style={[
            styles.filterBtn,
            showFilter && { backgroundColor: ACTIVE_COLOR },
          ]}
        >
          <Ionicons
            name="options"
            size={22}
            color={showFilter ? "white" : "#333"}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchData();
            }}
            colors={[ACTIVE_COLOR]}
          />
        }
      >
        {/* Filter Section */}
        {showFilter && (
          <Animated.View entering={FadeInDown} style={styles.filterCard}>
            <Text style={styles.filterTitle}>
              <Ionicons name="filter" size={16} /> ตัวกรองวันที่
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>วันที่เริ่ม</Text>
                <TouchableOpacity
                  onPress={() => openCalendar("start")}
                  style={styles.dateInputBox}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: startDate ? "#333" : "#94a3b8",
                      fontSize: 14,
                    }}
                  >
                    {startDate ? formatDate(startDate) : "วว/ดด/ปปปป"}
                  </Text>
                  <Ionicons name="calendar-outline" size={16} color="#94a3b8" />
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>วันที่สิ้นสุด</Text>
                <TouchableOpacity
                  onPress={() => openCalendar("end")}
                  style={styles.dateInputBox}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: endDate ? "#333" : "#94a3b8",
                      fontSize: 14,
                    }}
                  >
                    {endDate ? formatDate(endDate) : "วว/ดด/ปปปป"}
                  </Text>
                  <Ionicons name="calendar-outline" size={16} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[
                  styles.searchBtn,
                  { flex: 1, backgroundColor: "#94a3b8" },
                ]}
                onPress={handleReset}
              >
                <Ionicons
                  name="refresh"
                  size={16}
                  color="white"
                  style={{ marginRight: 5 }}
                />
                <Text style={styles.searchBtnText}>ดูทั้งหมด</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.searchBtn, { flex: 1 }]}
                onPress={fetchData}
              >
                <Ionicons
                  name="search"
                  size={16}
                  color="white"
                  style={{ marginRight: 5 }}
                />
                <Text style={styles.searchBtnText}>ค้นหา</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* KPI Grid */}
        <View style={styles.gridContainer}>
          <KpiCard
            title="ค่าที่พัก"
            value={kpi.accom}
            icon="hotel"
            color="#ec4899"
            bg="#fce7f3"
          />
          <KpiCard
            title="ค่าแรง (สุทธิ)"
            value={kpi.labor}
            icon="users"
            color="#ef4444"
            bg="#fee2e2"
          />
          <KpiCard
            title="ค่าใช้จ่ายอื่นๆ"
            value={kpi.other}
            icon="coins"
            color="#f97316"
            bg="#fff7ed"
          />
          <KpiCard
            title="งบประมาณ BOQ"
            value={kpi.pr}
            icon="shopping-cart"
            color="#3b82f6"
            bg="#eff6ff"
          />
          <KpiCard
            title="งบประมาณโครงการ"
            value={kpi.job}
            icon="hard-hat"
            color="#8b5cf6"
            bg="#f3e8ff"
          />
          <KpiCard
            title="ยอดค้ำประกัน"
            value={kpi.bg}
            icon="landmark"
            color="#f59e0b"
            bg="#fffbeb"
          />
          <KpiCard
            title="ค่าใช้จ่ายตีตราสาร"
            value={kpi.stamp}
            icon="stamp"
            color="#10b981"
            bg="#ecfdf5"
          />
          <KpiCard
            title="ยอดรวมเอกสาร"
            value={kpi.docs}
            icon="file-contract" // ใช้ icon รูปเอกสาร
            color="#2563eb" // สีน้ำเงิน
            bg="#dbeafe"
          />
        </View>

        {/* Recent List */}
        <Text style={styles.sectionHeaderTitle}>รายการล่าสุด</Text>
        {loading ? (
          <ActivityIndicator size="large" color={ACTIVE_COLOR} />
        ) : (
          <View style={styles.listContainer}>
            {data.length > 0 ? (
              data.map((item: any) => (
                <Animated.View
                  key={item.id}
                  entering={FadeInDown.duration(500)}
                >
                  <TouchableOpacity
                    style={styles.card}
                    onPress={() => {
                      setSelectedReport(item);
                      setModalVisible(true);
                    }}
                  >
                    <View style={styles.cardHeader}>
                      <View>
                        <Text style={styles.dateText}>
                          {formatDate(item.report_date)}
                        </Text>
                        <Text style={styles.timeText}>
                          {formatTime(item.created_at)} น.
                        </Text>
                      </View>
                      <Text style={styles.amountText}>
                        {formatMoney(item.total_amount || item.total_expense)} ฿
                      </Text>
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.tags}>
                        {item.has_expense && (
                          <Badge label="ธุรการ" color="#dc2626" bg="#fee2e2" />
                        )}
                        {item.has_pr && (
                          <Badge label="PR" color="#2563eb" bg="#dbeafe" />
                        )}
                        {item.has_job && (
                          <Badge label="Job" color="#7c3aed" bg="#f3e8ff" />
                        )}
                        {item.has_bg && (
                          <Badge label="BG" color="#d97706" bg="#fef3c7" />
                        )}
                        {item.has_stamp && (
                          <Badge label="Stamp" color="#059669" bg="#d1fae5" />
                        )}
                      </View>
                    </View>
                    <View style={styles.cardFooter}>
                      <Text style={styles.viewDetailText}>ดูรายละเอียด</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={ACTIVE_COLOR}
                      />
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              ))
            ) : (
              <Text
                style={{ textAlign: "center", marginTop: 20, color: "#999" }}
              >
                ไม่พบข้อมูล
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modals */}
      <CustomCalendarModal
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        onSelect={handleDateSelect}
      />

      {/* Detail Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>รายละเอียด</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            {selectedReport && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.metaBox}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.metaLabel}>วันที่:</Text>
                    <Text style={styles.metaValue}>
                      {formatDate(selectedReport.report_date)}
                    </Text>
                  </View>
                  <View style={styles.rowBetween}>
                    <Text style={styles.metaLabel}>ผู้บันทึก:</Text>
                    <Text style={styles.metaValue}>
                      {selectedReport.reporter_name}
                    </Text>
                  </View>
                </View>
                {renderAdminDetails(selectedReport)}
                {renderGenericDetails(selectedReport, "pr")}
                {renderGenericDetails(selectedReport, "job")}
                {renderGenericDetails(selectedReport, "bg")}
                {renderGenericDetails(selectedReport, "stamp")}
                <View style={styles.grandTotalBox}>
                  <Text style={styles.grandTotalLabel}>ยอดรวมทั้งสิ้น</Text>
                  <Text style={styles.grandTotalValue}>
                    {formatMoney(
                      selectedReport.total_amount ||
                        selectedReport.total_expense,
                    )}{" "}
                    บาท
                  </Text>
                </View>
                {selectedReport.additional_notes ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteLabel}>Note:</Text>
                    <Text style={styles.noteText}>
                      {selectedReport.additional_notes}
                    </Text>
                  </View>
                ) : null}
                <View style={{ height: 30 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scrollContent: { padding: 20, paddingBottom: 50 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#eee",
    marginBottom: 15,
  },
  backButton: {
    marginRight: 15,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#1e293b" },
  headerSubtitle: { fontSize: 13, color: "#64748b" },
  filterBtn: {
    marginLeft: "auto",
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },

  dateInputBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 45,
    backgroundColor: "#fff",
    marginTop: 5,
  },
  filterCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    elevation: 2,
  },
  filterTitle: {
    fontWeight: "bold",
    fontSize: 14,
    color: "#334155",
    marginBottom: 10,
  },
  searchBtn: {
    backgroundColor: ACTIVE_COLOR,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  searchBtnText: { color: "#fff", fontWeight: "bold" },

  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  kpiCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderTopWidth: 3,
  },
  kpiIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  kpiTitle: { fontSize: 11, color: "#64748b", fontWeight: "600" },
  kpiValue: { fontSize: 16, fontWeight: "bold" },

  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#334155",
    marginBottom: 15,
  },
  listContainer: { paddingBottom: 20 },
  card: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  dateText: { fontWeight: "bold", color: "#334155" },
  timeText: { fontSize: 12, color: "#94a3b8" },
  amountText: { fontWeight: "bold", color: ACTIVE_COLOR, fontSize: 16 },
  cardBody: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 8,
    paddingBottom: 5,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  badgeText: { fontSize: 10, fontWeight: "bold" },
  cardFooter: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f8fafc",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  viewDetailText: {
    color: ACTIVE_COLOR,
    fontSize: 13,
    fontWeight: "600",
    marginRight: 4,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#f1f5f9",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#1e293b" },
  modalBody: { padding: 20 },
  metaBox: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  metaLabel: { color: "#64748b", fontSize: 13 },
  metaValue: { fontWeight: "600", color: "#1e293b" },
  detailSection: { marginBottom: 20 },
  sectionHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  sectionHeaderText: { fontWeight: "bold", marginLeft: 8, fontSize: 14 },
  innerCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  label: { fontSize: 13, color: "#64748b" },
  value: {
    fontSize: 13,
    color: "#1e293b",
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
  },
  divider: { height: 1, backgroundColor: "#e2e8f0", marginVertical: 8 },
  dividerDashed: {
    height: 1,
    borderRadius: 1,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginVertical: 8,
  },
  boldLabel: { fontSize: 13, fontWeight: "bold", color: "#334155" },
  boldValue: { fontSize: 14, fontWeight: "bold", color: "#1e293b" },
  highlightValue: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 13,
    fontWeight: "bold",
    overflow: "hidden",
  },
  smallNote: { fontSize: 10, color: "#059669", textAlign: "right" },
  otherBox: {
    backgroundColor: "#fff7ed",
    padding: 8,
    borderRadius: 6,
    marginTop: 5,
    borderLeftWidth: 3,
    borderLeftColor: "#f97316",
  },
  fileLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: "#f8fafc",
    padding: 4,
    borderRadius: 4,
    marginTop: 2,
  },
  summaryBox: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginTop: 5,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  grandTotalBox: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 2,
    borderColor: ACTIVE_COLOR,
    marginVertical: 10,
  },
  grandTotalLabel: {
    color: ACTIVE_COLOR,
    fontWeight: "bold",
    fontSize: 14,
    textTransform: "uppercase",
  },
  grandTotalValue: {
    color: ACTIVE_COLOR,
    fontWeight: "900",
    fontSize: 24,
    marginTop: 5,
  },
  noteBox: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  noteLabel: {
    fontWeight: "bold",
    fontSize: 13,
    color: "#64748b",
    marginBottom: 5,
  },
  noteText: { fontSize: 14, color: "#334155", lineHeight: 20 },

  calOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  calContainer: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 15,
    elevation: 10,
  },
  calHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  calTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  calNavBtn: { padding: 5 },
  calWeekRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 5,
  },
  calWeekText: {
    width: 35,
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 14,
    color: "#666",
  },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calDayCell: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  calDayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  calDayText: { fontSize: 16, color: "#333" },
  calCloseBtn: { marginTop: 15, alignSelf: "center", padding: 10 },
  calCloseText: { color: "#666", fontSize: 14 },
  docCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderLeftWidth: 4,
    borderLeftColor: "#ef4444",
    marginBottom: 8,
    overflow: "hidden",
  },
  docHeader: {
    backgroundColor: "#f8fafc",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
  },
  docHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginLeft: 6,
  },
  docBody: {
    padding: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  docItemText: {
    fontSize: 12,
    color: "#64748b",
    flex: 1,
  },
  docPriceBadge: {
    backgroundColor: "#fef2f2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  docPriceText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ef4444",
  },
  simpleDocBox: {
    backgroundColor: "#f1f5f9",
    padding: 6,
    borderRadius: 4,
    marginBottom: 4,
    alignSelf: "flex-end",
  },
  simpleDocText: {
    fontSize: 12,
    color: "#475569",
  },
});
