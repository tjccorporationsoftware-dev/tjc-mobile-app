import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { API_BASE } from "../../constants/config";

// --- Helper Functions ---
const formatMoney = (amount: any) => {
  const num = parseFloat(String(amount)) || 0;
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

// แปลง YYYY-MM-DD -> DD/MM/YYYY (พ.ศ.)
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
    return JSON.parse(jsonString);
  } catch (e) {
    return typeof jsonString === "string" ? [jsonString] : [];
  }
};

const openFile = (fileName: string, folder: string = "admin") => {
  if (!fileName) return;
  const baseUrl = API_BASE.replace("/api_mobile.php", "");
  const fullUrl = `${baseUrl}/uploads/${folder}/${fileName}`;
  Linking.openURL(fullUrl).catch((err) =>
    Alert.alert("Error", "ไม่สามารถเปิดไฟล์ได้: " + fullUrl),
  );
};

// =====================================================================
// 📅 Custom Calendar Component (เขียนเอง ไม่ใช้ Native)
// =====================================================================
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

const CustomCalendarModal = ({ visible, onClose, onSelect }: any) => {
  const [currentDate, setCurrentDate] = useState(new Date()); // ใช้ดูเดือนปัจจุบันในปฏิทิน

  if (!visible) return null;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // หาจำนวนวันในเดือนนี้
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // หาวันแรกของเดือนเริ่มที่วันอะไร (0=อาทิตย์, 1=จันทร์...)
  const firstDayIndex = new Date(year, month, 1).getDay();

  // สร้าง Array สำหรับ render
  const days = [];
  // ช่องว่างก่อนวันที่ 1
  for (let i = 0; i < firstDayIndex; i++) {
    days.push(null);
  }
  // วันที่ 1 ถึงวันสุดท้าย
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const changeMonth = (offset: number) => {
    const newDate = new Date(year, month + offset, 1);
    setCurrentDate(newDate);
  };

  const handleSelectDay = (day: number) => {
    // สร้าง Date Object และแปลงเป็น YYYY-MM-DD string ส่งกลับไป
    const selected = new Date(year, month, day);
    // ปรับ Timezone offset ให้ถูกต้อง (กันเลื่อนวัน)
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
          {/* Header ปฏิทิน */}
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

          {/* ชื่อวัน */}
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

          {/* ตารางวันที่ */}
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
                      // ไฮไลท์วันปัจจุบัน (Optional)
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

          {/* ปุ่มปิด */}
          <TouchableOpacity onPress={onClose} style={styles.calCloseBtn}>
            <Text style={styles.calCloseText}>ยกเลิก</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
// =====================================================================

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);

  // --- Filter State ---
  // ค่าเริ่มต้นเป็นว่าง "" (ตามที่ขอ)
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [selectedReporter, setSelectedReporter] = useState("");
  const [reporters, setReporters] = useState<string[]>([]);
  const [showReporterModal, setShowReporterModal] = useState(false);

  // ✅ State สำหรับ Custom Calendar
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMode, setCalendarMode] = useState<"start" | "end">("start");

  // ✅ เปิดปฏิทินที่เราทำเอง
  const openCalendar = (mode: "start" | "end") => {
    setCalendarMode(mode);
    setShowCalendar(true);
  };

  // ✅ เมื่อเลือกวันที่จากปฏิทินเอง
  const handleDateSelect = (dateStr: string) => {
    if (calendarMode === "start") {
      setStartDate(dateStr);
    } else {
      setEndDate(dateStr);
    }
    // ปิด Modal ทำใน Component แล้ว หรือจะสั่งปิดตรงนี้ก็ได้ถ้าต้องการ logic เพิ่ม
    setShowCalendar(false);
  };

  // --- Fetch Data ---
  // --- Fetch Data ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("action", "get_admin_dashboard");

      // ถ้าเลือกวันที่ ให้ส่งไป
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);

      // ✅ [เพิ่ม] ถ้าไม่ได้เลือกวันที่เลย ให้ส่ง flag พิเศษไปบอก Server ว่า "ขอทั้งหมด"
      if (!startDate && !endDate) {
        params.append("start_date", "1900-01-01"); // วันที่ย้อนหลังไกลๆ
        params.append("end_date", "2100-12-31"); // วันที่ในอนาคตไกลๆ
      }

      if (selectedReporter) params.append("reporter", selectedReporter);

      const res = await axios.get(
        `${API_BASE}/api_mobile.php?${params.toString()}`,
      );

      if (res.data && res.data.status === "success") {
        if (res.data.recent && Array.isArray(res.data.recent)) {
          res.data.recent.sort((a: any, b: any) => {
            const dateA = new Date(a.report_date).getTime();
            const dateB = new Date(b.report_date).getTime();
            return dateB - dateA; // เรียงใหม่ไปเก่า (ล่าสุดขึ้นก่อน)
          });
        }
        setData(res.data);
      }
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  const handleReset = () => {
    // 1. ล้างค่าในตัวแปร
    setStartDate("");
    setEndDate("");
    setSelectedReporter("");

    // 2. สั่งโหลดข้อมูลใหม่ (ใช้ setTimeout นิดนึงเพื่อให้ State อัปเดตค่าว่างทันก่อนโหลด)
    setLoading(true);
    setTimeout(() => {
      fetchData();
    }, 100);
  };
  // Fetch Reporters (ดึงรายชื่อเฉพาะคนที่มีรายงานจริง)
  const fetchReporters = async () => {
    try {
      // ✅ เปลี่ยน action เป็น get_active_reporters
      const res = await axios.get(
        `${API_BASE}/api_mobile.php?action=get_active_reporters`,
      );

      if (Array.isArray(res.data)) {
        setReporters(res.data);
      }
    } catch (error) {
      console.log("Failed to fetch reporters", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
      fetchReporters();
    }, []),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

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

    // ✅ 1. ประกาศตัวแปร totalDocs ตรงนี้ (สำคัญมาก)
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

      // 🔥 Logic แสดงผลเอกสาร
      const docRaw = docs[i] || "-";
      const subDocs = docRaw
        .split(",")
        .map((s: any) => s.trim())
        .filter((s: any) => s);

      const renderedDocs =
        subDocs.length > 0 && subDocs[0] !== "-" ? (
          subDocs.map((subDoc: string, idx: number) => {
            // Regex จับรูปแบบ: AX 1234 ( รายการ : 500 )
            const match = subDoc.match(
              /^(.*?)\s*\(\s*(.*?)\s*[:]\s*(.*?)\s*\)/,
            );

            if (match) {
              const header = match[1].trim();
              const itemDesc = match[2].trim();

              // ✅ 2. ประกาศและคำนวณ priceStr ตรงนี้
              const priceStr = match[3]
                .trim()
                .replace(/บ\.|บาท/g, "")
                .replace(/,/g, "")
                .trim();

              const price = parseFloat(priceStr) || 0;

              // ✅ 3. บวกยอดเงินเข้า totalDocs
              totalDocs += price;

              return (
                <View key={idx} style={styles.docCard}>
                  {/* Header: เลขที่เอกสาร */}
                  <View style={styles.docHeader}>
                    <Ionicons
                      name="document-text-outline"
                      size={12}
                      color="#64748b"
                    />
                    <Text style={styles.docHeaderText}>{header}</Text>
                  </View>
                  {/* Body: รายการ + ราคา */}
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
                      {/* ใช้ toLocaleString() เพื่อใส่ลูกน้ำกลับคืน */}
                      <Text style={styles.docPriceText}>
                        {price.toLocaleString()} ฿
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }
            // กรณีไม่เข้า Format (แสดงกรอบเรียบๆ)
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

  const KpiCard = ({ title, value, icon, color, bg }: any) => (
    <View
      style={[
        styles.kpiCard,
        { backgroundColor: "#fff", borderTopColor: color },
      ]}
    >
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

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)/manager_dashboard")}
            style={{
              marginRight: 15,
              width: 40,
              height: 40,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: "#fff",
              borderRadius: 12,
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 5,
              elevation: 2,
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#1e293b" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Dashboard ธุรการ</Text>
            <Text style={styles.headerSubtitle}>
              {startDate || endDate
                ? `ช่วงวันที่: ${startDate ? formatDate(startDate) : "-"} ถึง ${endDate ? formatDate(endDate) : "-"}`
                : "ภาพรวมทั้งหมด (All Time)"}
            </Text>
          </View>
        </View>

        {/* --- Filter Section --- */}
        <View style={styles.filterCard}>
          <Text style={styles.filterTitle}>
            <Ionicons name="filter" size={16} /> ตัวกรองข้อมูล
          </Text>
          <TouchableOpacity
            style={styles.filterInput}
            onPress={() => setShowReporterModal(true)}
          >
            <Text style={{ color: selectedReporter ? "#000" : "#888" }}>
              {selectedReporter || "เลือกพนักงาน (ทั้งหมด)"}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#666" />
          </TouchableOpacity>

          {/* ✅ ส่วนเลือกวันที่: กดที่ช่องสี่เหลี่ยม -> เด้ง Custom Calendar */}
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
                  style={{ color: endDate ? "#333" : "#94a3b8", fontSize: 14 }}
                >
                  {endDate ? formatDate(endDate) : "วว/ดด/ปปปป"}
                </Text>
                <Ionicons name="calendar-outline" size={16} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ✅ [แก้ส่วนนี้] เปลี่ยนจากปุ่มค้นหาอันเดียว เป็นปุ่มคู่ */}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            {/* ปุ่มแสดงทั้งหมด (เคลียร์ค่า) */}
            <TouchableOpacity
              style={[
                styles.searchBtn,
                { flex: 1, backgroundColor: "#94a3b8" },
              ]} // สีเทา
              onPress={handleReset}
            >
              <Ionicons
                name="refresh"
                size={16}
                color="white"
                style={{ marginRight: 5 }}
              />
              <Text style={styles.searchBtnText}>แสดงทั้งหมด</Text>
            </TouchableOpacity>

            {/* ปุ่มค้นหา (สีเดิม) */}
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
        </View>

        {/* --- KPI Grid --- */}
        <View style={styles.gridContainer}>
          <KpiCard
            title="ค่าที่พัก"
            value={data?.kpi.accom || 0}
            icon="hotel"
            color="#ec4899"
            bg="#fce7f3"
          />
          <KpiCard
            title="ค่าแรง (สุทธิ)"
            value={data?.kpi.labor || 0}
            icon="users"
            color="#ef4444"
            bg="#fee2e2"
          />
          <KpiCard
            title="ค่าใช้จ่ายอื่นๆ"
            value={data?.kpi.other || 0}
            icon="coins"
            color="#f97316"
            bg="#fff7ed"
          />
          <KpiCard
            title="งบประมาณ BOQ'"
            value={data?.kpi.pr || 0}
            icon="shopping-cart"
            color="#3b82f6"
            bg="#eff6ff"
          />
          <KpiCard
            title="งบประมาณโครงการ"
            value={data?.kpi.job || 0}
            icon="hard-hat"
            color="#8b5cf6"
            bg="#f3e8ff"
          />
          <KpiCard
            title="ยอดค้ำประกัน"
            value={data?.kpi.bg || 0}
            icon="landmark"
            color="#f59e0b"
            bg="#fffbeb"
          />
          <KpiCard
            title="ค่าใช้จ่ายตีตราสาร"
            value={data?.kpi.stamp || 0}
            icon="stamp"
            color="#10b981"
            bg="#ecfdf5"
          />
          <KpiCard
            title="ยอดรวมเอกสาร (AX/PO)"
            value={data?.kpi.docs || 0} // ต้องมั่นใจว่า Backend ส่ง key 'docs' มาด้วย
            icon="file-contract"
            color="#2563eb" // สีน้ำเงิน
            bg="#dbeafe"
          />
        </View>

        <Text style={styles.sectionHeaderTitle}>รายการล่าสุด</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#4f46e5" />
        ) : (
          <View style={styles.listContainer}>
            {data?.recent?.map((item: any) => (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                onPress={() => setSelectedReport(item)}
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
                    {formatMoney(item.total_amount)} ฿
                  </Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.reporter}>
                    <Ionicons name="person" /> {item.reporter_name}
                  </Text>
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
                  <Ionicons name="chevron-forward" size={14} color="#4f46e5" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ✅ เรียกใช้ Custom Calendar Modal */}
      <CustomCalendarModal
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        onSelect={handleDateSelect}
      />

      {/* Detail Modal */}
      <Modal
        visible={selectedReport !== null}
        animationType="slide"
        transparent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>รายละเอียดรายการ</Text>
              <TouchableOpacity onPress={() => setSelectedReport(null)}>
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
                  <Text style={styles.grandTotalLabel}>
                    ยอดรวมทั้งสิ้น (สุทธิ)
                  </Text>
                  <Text style={styles.grandTotalValue}>
                    {formatMoney(selectedReport.total_amount)} บาท
                  </Text>
                </View>
                {selectedReport.note ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteLabel}>Note:</Text>
                    <Text style={styles.noteText}>{selectedReport.note}</Text>
                  </View>
                ) : null}
                <View style={{ height: 30 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Reporter Selection Modal */}
      <Modal visible={showReporterModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: "50%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>เลือกพนักงาน</Text>
              <TouchableOpacity onPress={() => setShowReporterModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={["", ...reporters]}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.reporterItem}
                  onPress={() => {
                    setSelectedReporter(item);
                    setShowReporterModal(false);
                  }}
                >
                  <Text style={styles.reporterItemText}>
                    {item || "ทั้งหมด"}
                  </Text>
                  {selectedReporter === item && (
                    <Ionicons name="checkmark" size={20} color="#4f46e5" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scrollContent: { padding: 20, paddingBottom: 50 },
  header: { marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "#1e293b" },
  headerSubtitle: { fontSize: 14, color: "#64748b" },

  dateInputBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: "#fff",
    marginTop: 5,
  },
  filterCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 3,
  },
  filterTitle: {
    fontWeight: "bold",
    fontSize: 15,
    color: "#334155",
    marginBottom: 12,
  },
  filterInput: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  searchBtn: {
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  searchBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },

  // --- KPI Grid ---
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  kpiCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
    borderTopWidth: 4,
  },
  kpiIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  kpiTitle: { fontSize: 12, color: "#64748b", fontWeight: "700" },
  kpiValue: { fontSize: 18, fontWeight: "800", marginTop: 2 },

  // --- List Cards ---
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 15,
  },
  listContainer: { paddingBottom: 20 },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 18,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  dateText: { fontWeight: "bold", color: "#334155", fontSize: 15 },
  timeText: { fontSize: 13, color: "#94a3b8" },
  amountText: { fontWeight: "900", color: "#4f46e5", fontSize: 18 },
  cardBody: { paddingVertical: 5 },
  reporter: {
    fontSize: 14,
    color: "#475569",
    marginBottom: 8,
    fontWeight: "500",
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  badgeText: { fontSize: 11, fontWeight: "bold" },
  cardFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  viewDetailText: {
    color: "#4f46e5",
    fontSize: 14,
    fontWeight: "700",
    marginRight: 6,
  },

  // --- Modals ---
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#f8fafc",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 24,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  modalBody: { padding: 20 },

  // --- Details ---
  metaBox: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#e2e8f0",
  },
  metaLabel: { color: "#64748b", fontSize: 14, fontWeight: "600" },
  metaValue: { fontWeight: "700", color: "#1e293b", fontSize: 15 },
  detailSection: { marginBottom: 25 },
  sectionHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  sectionHeaderText: { fontWeight: "800", marginLeft: 10, fontSize: 15 },

  // Inner Card (Expenses)
  innerCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: { fontSize: 14, color: "#64748b", fontWeight: "500" },
  value: {
    fontSize: 14,
    color: "#1e293b",
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  divider: { height: 1, backgroundColor: "#cbd5e1", marginVertical: 12 },
  dividerDashed: {
    height: 1,
    borderRadius: 1,
    borderStyle: "dashed",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    marginVertical: 12,
  },
  boldLabel: { fontSize: 15, fontWeight: "700", color: "#334155" },
  boldValue: { fontSize: 16, fontWeight: "800", color: "#1e293b" },
  highlightValue: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 14,
    fontWeight: "700",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  smallNote: {
    fontSize: 11,
    color: "#059669",
    textAlign: "right",
    fontWeight: "600",
    marginTop: 2,
  },
  otherBox: {
    backgroundColor: "#fff7ed",
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#f97316",
    borderWidth: 1,
    borderColor: "#ffedd5",
  },
  fileLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  grandTotalBox: {
    backgroundColor: "#fff",
    padding: 25,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#4f46e5",
    marginVertical: 15,
    shadowColor: "#4f46e5",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  grandTotalLabel: {
    color: "#4f46e5",
    fontWeight: "800",
    fontSize: 15,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  grandTotalValue: {
    color: "#4f46e5",
    fontWeight: "900",
    fontSize: 28,
    marginTop: 8,
  },
  summaryBox: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginTop: 5,
    borderWidth: 2,
    borderColor: "#cbd5e1",
  },
  // ✅ [เพิ่ม] Note Styles ที่หายไป
  noteBox: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e2e8f0",
  },
  noteLabel: {
    fontWeight: "bold",
    fontSize: 13,
    color: "#64748b",
    marginBottom: 5,
  },
  noteText: { fontSize: 14, color: "#334155", lineHeight: 20 },

  // --- Document Cards ---
  docCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#94a3b8",
    borderLeftWidth: 5,
    borderLeftColor: "#ef4444",
    marginBottom: 10,
    width: "100%",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  docHeader: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
  },
  docHeaderText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
    marginLeft: 8,
  },
  docBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  docItemText: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "600",
  },
  docPriceBadge: {
    backgroundColor: "#fef2f2",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  docPriceText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ef4444",
  },
  simpleDocBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#94a3b8",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    alignSelf: "flex-end",
  },
  simpleDocText: { fontSize: 13, color: "#334155", fontWeight: "700" },

  // --- Calendar ---
  calOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  calContainer: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    elevation: 10,
  },
  calHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  calTitle: { fontSize: 20, fontWeight: "bold", color: "#333" },
  calNavBtn: { padding: 10, backgroundColor: "#f1f5f9", borderRadius: 10 },
  calWeekRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 10,
  },
  calWeekText: {
    width: 35,
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 15,
    color: "#64748b",
  },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calDayCell: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
  },
  calDayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  calDayText: { fontSize: 16, color: "#333", fontWeight: "500" },
  calCloseBtn: {
    marginTop: 20,
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
  },
  calCloseText: { color: "#475569", fontSize: 15, fontWeight: "bold" },

  // Reporter Item
  reporterItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  reporterItemText: { fontSize: 16, color: "#333", fontWeight: "600" },
});
