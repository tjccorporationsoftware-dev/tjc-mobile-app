import {
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE, IMG_BASE_URL } from "../../constants/config";

const TAB_ID = "purchase";
const ACTIVE_COLOR = "#059669"; // สีเขียว
const TH_MONTHS_FULL = [
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

export default function ManagerPurchase() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [summary, setSummary] = useState({ total: 0, expense: 0, sales: 0 });
  const [kpiList, setKpiList] = useState<any[]>([]);
  const [recentList, setRecentList] = useState<any[]>([]);

  // Filter States
  const [reporters, setReporters] = useState<string[]>([]);
  const [filterReporter, setFilterReporter] = useState("");
  const [filterStatus, setFilterStatus] = useState("ทั้งหมด");

  // ✅ เปลี่ยนเป็น Date | null เพื่อรองรับการ "ล้างวันที่"
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  // UI States
  const [showFilter, setShowFilter] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateMode, setDateMode] = useState<"start" | "end">("start");
  const [pickerDate, setPickerDate] = useState(new Date());
  const [pickerView, setPickerView] = useState<"day" | "month" | "year">("day");

  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // --- Fetch Data ---
  const fetchData = async (
    overrideReporter?: string,
    overrideStatus?: string,
    overrideStart?: Date | null,
    overrideEnd?: Date | null,
  ) => {
    try {
      if (!refreshing) setLoading(true);

      const currentReporter =
        overrideReporter !== undefined ? overrideReporter : filterReporter;
      const currentStatus =
        overrideStatus !== undefined ? overrideStatus : filterStatus;

      // ✅ ถ้าเป็น null คือไม่ส่งวันที่ (ดูทั้งหมด)
      const currentStart =
        overrideStart === undefined ? startDate : overrideStart;
      const currentEnd = overrideEnd === undefined ? endDate : overrideEnd;

      const params = new URLSearchParams();
      params.append("action", "get_dashboard_stats");
      params.append("tab", TAB_ID);

      // ✅ Logic ส่งวันที่: ถ้ามีค่าส่งไป ถ้า null ไม่ต้องส่ง (API จะดึงทั้งหมด)
      if (currentStart)
        params.append("start_date", currentStart.toISOString().split("T")[0]);
      if (currentEnd)
        params.append("end_date", currentEnd.toISOString().split("T")[0]);

      if (currentReporter) params.append("filter_name", currentReporter);
      if (currentStatus !== "ทั้งหมด")
        params.append("filter_status", currentStatus);

      const url = `${API_BASE}/api_mobile.php?${params.toString()}`;
      const response = await axios.get(url);

      if (response.data) {
        setSummary(response.data.summary || { total: 0, expense: 0, sales: 0 });
        setKpiList(response.data.breakdown || []);
        setRecentList(response.data.recent || []);
        fetchFilterOptions();
      }
    } catch (error) {
      console.log("Fetch Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ✅ ปุ่ม: ดูข้อมูลทั้งหมด (ล้างวันที่)
  const handleShowAllHistory = () => {
    setStartDate(null);
    setEndDate(null);
    fetchData(undefined, undefined, null, null); // ส่ง null ไปทันทีเพื่อโหลด
  };

  // ✅ ปุ่ม: รีเซ็ต (กลับมาดูเดือนนี้)
  const handleReset = () => {
    setFilterReporter("");
    setFilterStatus("ทั้งหมด");
    const defaultStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );
    const defaultEnd = new Date();
    setStartDate(defaultStart);
    setEndDate(defaultEnd);
    fetchData("", "ทั้งหมด", defaultStart, defaultEnd);
  };

  useEffect(() => {
    fetchData();
  }, [filterStatus]);

  const fetchFilterOptions = async () => {
    try {
      const resUsers = await axios.get(
        `${API_BASE}/api_mobile.php?action=get_users`,
      );
      if (Array.isArray(resUsers.data)) setReporters(resUsers.data);
    } catch (e) {}
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  // --- Helper Functions ---
  const getStatusConfig = (statusName: string) => {
    const st = (statusName || "").trim();
    if (!st)
      return {
        colors: ["#95a5a6", "#7f8c8d"],
        icon: "help",
        color: "#95a5a6",
        bg: "#f0f3f4",
      };
    if (
      st.includes("ได้") ||
      st.includes("ส่งแล้ว") ||
      st.includes("รับแล้ว") ||
      st.includes("เรียบร้อย") ||
      st.includes("สำเร็จ")
    )
      return {
        colors: ["#00b894", "#55efc4"],
        icon: "checkmark-circle",
        color: "#00b894",
        bg: "#d4edda",
      };
    if (
      st.includes("รอ") ||
      st.includes("ติดตาม") ||
      st.includes("เสนอ") ||
      st.includes("กำลัง")
    )
      return {
        colors: ["#f39c12", "#f1c40f"],
        icon: "hourglass",
        color: "#f39c12",
        bg: "#fff3cd",
      };
    if (
      st.includes("ไม่") ||
      st.includes("ตีกลับ") ||
      st.includes("ยกเลิก") ||
      st.includes("คืน")
    )
      return {
        colors: ["#e74c3c", "#c0392b"],
        icon: "close-circle",
        color: "#e74c3c",
        bg: "#f8d7da",
      };
    return {
      colors: [ACTIVE_COLOR, ACTIVE_COLOR + "99"],
      icon: "bookmark",
      color: ACTIVE_COLOR,
      bg: ACTIVE_COLOR + "15",
    };
  };

  const openDetailModal = (item: any) => {
    setSelectedItem(item);
    setModalVisible(true);
  };
  const openImage = async (filename: string) => {
    if (!filename) return;
    const fullUrl = filename.startsWith("http")
      ? filename
      : `${IMG_BASE_URL.endsWith("/") ? IMG_BASE_URL : IMG_BASE_URL + "/"}${filename.trim()}`;
    Linking.openURL(fullUrl).catch(() => Alert.alert("Error", "เปิดรูปไม่ได้"));
  };

  // ================= Custom Date Picker Logic =================
  const openCustomDatePicker = (mode: "start" | "end") => {
    setDateMode(mode);
    // ถ้าเป็น null ให้เริ่มที่วันนี้
    setPickerDate((mode === "start" ? startDate : endDate) || new Date());
    setPickerView("day");
    setShowDatePicker(true);
  };

  const handleDateSelect = (day: number) => {
    const newDate = new Date(
      pickerDate.getFullYear(),
      pickerDate.getMonth(),
      day,
    );
    if (dateMode === "start") setStartDate(newDate);
    else setEndDate(newDate);
    setShowDatePicker(false);
  };

  const changeMonth = (offset: number) => {
    const newDate = new Date(
      pickerDate.getFullYear(),
      pickerDate.getMonth() + offset,
      1,
    );
    setPickerDate(newDate);
  };

  const renderCalendar = () => {
    const year = pickerDate.getFullYear();
    const month = pickerDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
    const days = [];
    for (let i = 0; i < firstDay; i++)
      days.push(<View key={`empty-${i}`} style={styles.calDayEmpty} />);
    for (let i = 1; i <= daysInMonth; i++) {
      const currentCheck = dateMode === "start" ? startDate : endDate;
      const isSelected =
        currentCheck &&
        currentCheck.getDate() === i &&
        currentCheck.getMonth() === month &&
        currentCheck.getFullYear() === year;
      days.push(
        <TouchableOpacity
          key={i}
          onPress={() => handleDateSelect(i)}
          style={[styles.calDay, isSelected && styles.calDaySelected]}
        >
          <Text
            style={[styles.calDayText, isSelected && styles.calDayTextSelected]}
          >
            {i}
          </Text>
        </TouchableOpacity>,
      );
    }
    return <View style={styles.calGrid}>{days}</View>;
  };

  const renderYearSelector = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
      years.push(
        <TouchableOpacity
          key={i}
          onPress={() => {
            setPickerDate(new Date(i, pickerDate.getMonth(), 1));
            setPickerView("day");
          }}
          style={styles.yearItem}
        >
          <Text
            style={[
              styles.yearText,
              pickerDate.getFullYear() === i && {
                color: ACTIVE_COLOR,
                fontWeight: "bold",
              },
            ]}
          >
            {i + 543}
          </Text>
        </TouchableOpacity>,
      );
    }
    return (
      <ScrollView style={{ maxHeight: 300 }}>
        <View style={styles.yearGrid}>{years}</View>
      </ScrollView>
    );
  };

  const renderMonthSelector = () => {
    return (
      <View style={styles.yearGrid}>
        {TH_MONTHS_FULL.map((m, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => {
              setPickerDate(new Date(pickerDate.getFullYear(), i, 1));
              setPickerView("day");
            }}
            style={styles.yearItem}
          >
            <Text
              style={[
                styles.yearText,
                pickerDate.getMonth() === i && {
                  color: ACTIVE_COLOR,
                  fontWeight: "bold",
                },
              ]}
            >
              {m}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderProductDetails = (detailsString: string) => {
    if (!detailsString)
      return (
        <Text style={{ color: "#999", fontStyle: "italic" }}>
          - ไม่มีรายการ -
        </Text>
      );
    const blocks = detailsString.split("--------------------");
    return (
      <View style={{ gap: 12 }}>
        {blocks.map((block, index) => {
          const lines = block.trim().split("\n");
          if (lines.length === 0 || !lines[0]) return null;
          const header = lines[0];
          const items = lines.slice(1).filter((l) => l.trim().startsWith("-"));
          const totalLine = lines.find(
            (l) => l.includes("💰") || l.includes("ยอดรวม"),
          );
          return (
            <View key={index} style={styles.prodCard}>
              <View
                style={[
                  styles.prodHeader,
                  { backgroundColor: ACTIVE_COLOR + "10" },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flex: 1,
                  }}
                >
                  <View
                    style={{
                      width: 4,
                      height: 16,
                      backgroundColor: ACTIVE_COLOR,
                      borderRadius: 2,
                      marginRight: 8,
                    }}
                  />
                  <Text style={[styles.prodTitle, { color: ACTIVE_COLOR }]}>
                    {header}
                  </Text>
                </View>
              </View>
              <View style={styles.prodBody}>
                {items.length > 0 ? (
                  items.map((item, i) => {
                    const match = item.match(
                      /- (.*?) \(x(.*?) @ (.*?)\) = (.*?) บ\./,
                    );
                    if (match) {
                      return (
                        <View key={i} style={styles.prodRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.prodName}>{match[1]}</Text>
                            <Text style={styles.prodSub}>
                              x{match[2]} @ {match[3]}
                            </Text>
                          </View>
                          <Text style={styles.prodPrice}>{match[4]}</Text>
                        </View>
                      );
                    } else {
                      return (
                        <View key={i} style={styles.prodRow}>
                          <Text style={styles.prodName}>
                            {item.replace("- ", "")}
                          </Text>
                        </View>
                      );
                    }
                  })
                ) : (
                  <Text style={{ color: "#999", fontSize: 12, padding: 10 }}>
                    {lines.slice(1).join("\n")}
                  </Text>
                )}
              </View>
              {totalLine && (
                <View style={styles.prodFooter}>
                  <Text style={styles.prodTotalLabel}>ยอดรวมสุทธิ</Text>
                  <Text style={styles.prodTotalValue}>
                    {totalLine.replace(/.*: /, "")}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const KPICard = ({ label, value, icon, colors, delay, onPress }: any) => (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(600)}
      style={styles.kpiWrapper}
    >
      <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
        <LinearGradient
          colors={colors}
          style={styles.kpiCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.kpiHeader}>
            <Text style={styles.kpiLabel} numberOfLines={1}>
              {label}
            </Text>
            <Ionicons name={icon} size={18} color="rgba(255,255,255,0.8)" />
          </View>
          <Text style={styles.kpiValue}>
            {typeof value === "number" ? value.toLocaleString() : value}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    let title = item.supplier_name || "ไม่ระบุร้านค้า";
    let subtitle = item.project_name || "ไม่ระบุหน้างาน";
    let rawStatus = item.tax_invoice_status;
    let subIcon = "construct";

    const statusArray = rawStatus
      ? rawStatus
          .split(",")
          .map((s: string) =>
            s.includes(":") ? s.split(":")[1].trim() : s.trim(),
          )
          .filter((s: string) => s !== "")
      : ["ไม่ระบุ"];
    const uniqueStatusArray = [...new Set(statusArray)];
    const mainConfig = getStatusConfig(uniqueStatusArray[0] as string);

    return (
      <Animated.View entering={FadeInDown.delay(index * 100).duration(500)}>
        <View style={[styles.card, { borderLeftColor: mainConfig.color }]}>
          <View style={styles.cardHeader}>
            <View
              style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: ACTIVE_COLOR + "15" },
                ]}
              >
                <FontAwesome5
                  name="shopping-cart"
                  size={14}
                  color={ACTIVE_COLOR}
                />
              </View>
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.dateText}>
                  {new Date(item.report_date).toLocaleDateString("th-TH")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 4,
                  }}
                >
                  <Ionicons
                    name="person-circle-outline"
                    size={14}
                    color="#64748b"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.reporterName}>{item.reporter_name}</Text>
                </View>
              </View>
            </View>
            <View
              style={{
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 4,
              }}
            >
              {uniqueStatusArray.map((st, i) => {
                const conf = getStatusConfig(st as string);
                return (
                  <View
                    key={i}
                    style={[styles.statusBadge, { backgroundColor: conf.bg }]}
                  >
                    <Text
                      style={{
                        color: conf.color,
                        fontWeight: "bold",
                        fontSize: 10,
                      }}
                    >
                      {st as string}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
          <View style={styles.cardBody}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name={subIcon as any}
                size={16}
                color="#666"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 8,
              }}
            >
              <View style={{ flexDirection: "row", gap: 10 }}>
                {item.total_expense > 0 && (
                  <Text
                    style={{
                      color: "#ef4444",
                      fontSize: 13,
                      fontWeight: "bold",
                    }}
                  >
                    -฿{parseInt(item.total_expense).toLocaleString()}
                  </Text>
                )}
              </View>
            </View>
          </View>
          <View style={styles.cardFooter}>
            <TouchableOpacity
              onPress={() => openDetailModal(item)}
              style={styles.btnDetail}
            >
              <Text
                style={{
                  color: ACTIVE_COLOR,
                  fontWeight: "bold",
                  fontSize: 13,
                }}
              >
                ดูรายละเอียด
              </Text>
              <Ionicons
                name="arrow-forward"
                size={14}
                color={ACTIVE_COLOR}
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  const DetailItem = ({ icon, color, title, text }: any) => (
    <View style={{ marginBottom: 15 }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}
      >
        <Ionicons
          name={icon}
          size={18}
          color={color}
          style={{ marginRight: 6 }}
        />
        <Text style={{ fontWeight: "bold", color: "#333" }}>{title}</Text>
      </View>
      <Text style={{ color: "#555", paddingLeft: 24, lineHeight: 20 }}>
        {text || "-"}
      </Text>
    </View>
  );

  const ImageButton = ({ icon, color, label, onPress }: any) => (
    <TouchableOpacity
      onPress={onPress}
      style={{ alignItems: "center", padding: 5 }}
      activeOpacity={0.7}
    >
      <View
        style={{
          width: 50,
          height: 50,
          borderRadius: 12,
          backgroundColor: color + "15",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 5,
        }}
      >
        <MaterialCommunityIcons name={icon} size={24} color={color} />
      </View>
      <Text style={{ fontSize: 11, color: "#666" }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)/manager_dashboard")}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📊 ฝ่ายจัดซื้อ</Text>
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
        contentContainerStyle={{ paddingBottom: 100 }}
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
        {showFilter && (
          <Animated.View entering={FadeInDown} style={styles.filterSection}>
            <Text style={styles.sectionTitle}>ตัวกรองข้อมูล</Text>

            <View style={{ marginBottom: 15 }}>
              <Text style={styles.inputLabel}>เลือกพนักงาน</Text>
              <TouchableOpacity
                onPress={() => setSelectorVisible(true)}
                style={styles.filterInput}
              >
                <Text style={{ color: filterReporter ? "#333" : "#999" }}>
                  {filterReporter || "พนักงานทั้งหมด"}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#999" />
              </TouchableOpacity>
            </View>

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>วันที่เริ่มต้น</Text>
                <TouchableOpacity
                  onPress={() => openCustomDatePicker("start")}
                  style={styles.dateInput}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={startDate ? "#666" : "#ccc"}
                  />
                  <Text
                    style={{
                      color: startDate ? "#333" : "#aaa",
                      marginLeft: 8,
                    }}
                  >
                    {startDate
                      ? startDate.toLocaleDateString("th-TH")
                      : "ทั้งหมด"}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>ถึงวันที่</Text>
                <TouchableOpacity
                  onPress={() => openCustomDatePicker("end")}
                  style={styles.dateInput}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={endDate ? "#666" : "#ccc"}
                  />
                  <Text
                    style={{ color: endDate ? "#333" : "#aaa", marginLeft: 8 }}
                  >
                    {endDate ? endDate.toLocaleDateString("th-TH") : "ทั้งหมด"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ✅ ปุ่มใหม่: ดูทั้งหมด (ล้างวันที่) */}
            <TouchableOpacity
              onPress={handleShowAllHistory}
              style={styles.showAllBtn}
            >
              <Text style={{ color: ACTIVE_COLOR, fontWeight: "bold" }}>
                📅 ดูประวัติทั้งหมด (ไม่จำกัดวันที่)
              </Text>
            </TouchableOpacity>

            <View style={styles.filterActions}>
              <TouchableOpacity
                onPress={() => fetchData()}
                style={styles.searchBtn}
              >
                <Ionicons
                  name="search"
                  size={18}
                  color="white"
                  style={{ marginRight: 5 }}
                />
                <Text style={{ color: "white", fontWeight: "bold" }}>
                  ค้นหา
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
                <Ionicons name="refresh" size={18} color="#666" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        <View style={styles.kpiContainer}>
          <View style={styles.kpiRow}>
            <KPICard
              label="รายงานทั้งหมด"
              value={summary.total}
              icon="documents"
              colors={[ACTIVE_COLOR, ACTIVE_COLOR + "99"]}
              delay={0}
              onPress={() => setFilterStatus("ทั้งหมด")}
            />
            <KPICard
              label="ค่าใช้จ่ายรวม"
              value={
                "฿" +
                (summary.expense
                  ? (summary.expense / 1000).toFixed(1) + "k"
                  : "0")
              }
              icon="wallet"
              colors={["#e74c3c", "#c0392b"]}
              delay={100}
            />
          </View>

          <View style={styles.statusGrid}>
            {/* 1. ปุ่ม "ทั้งหมด" */}
            <TouchableOpacity
              onPress={() => setFilterStatus("ทั้งหมด")}
              style={[
                styles.statusCard,
                {
                  backgroundColor: "#fff",
                  borderColor: ACTIVE_COLOR,
                  transform: [{ scale: filterStatus === "ทั้งหมด" ? 1.05 : 1 }],
                  borderWidth: filterStatus === "ทั้งหมด" ? 2 : 1,
                  opacity: filterStatus === "ทั้งหมด" ? 1 : 0.6,
                },
              ]}
            >
              <Text
                style={{
                  color: ACTIVE_COLOR,
                  fontWeight: "bold",
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                ทั้งหมด
              </Text>
              <Text
                style={{
                  color: "#333",
                  fontWeight: "800",
                  fontSize: 16,
                  marginTop: 4,
                }}
              >
                {summary.total}
              </Text>
              {filterStatus === "ทั้งหมด" && (
                <View
                  style={[styles.activeDot, { backgroundColor: ACTIVE_COLOR }]}
                />
              )}
            </TouchableOpacity>

            {/* 2. วนลูปสถานะอื่นๆ */}
            {kpiList.map((item, idx) => {
              const config = getStatusConfig(item.status);
              const isSelected = filterStatus === item.status;
              return (
                <TouchableOpacity
                  key={idx}
                  onPress={() =>
                    setFilterStatus(isSelected ? "ทั้งหมด" : item.status)
                  }
                  style={[
                    styles.statusCard,
                    {
                      backgroundColor: config.colors[0] + "15",
                      borderColor: config.colors[0],
                      transform: [{ scale: isSelected ? 1.05 : 1 }],
                      borderWidth: isSelected ? 2 : 1,
                      opacity:
                        filterStatus === "ทั้งหมด" || isSelected ? 1 : 0.6,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: config.colors[0],
                      fontWeight: "bold",
                      fontSize: 12,
                      textAlign: "center",
                    }}
                  >
                    {item.status}
                  </Text>
                  <Text
                    style={{
                      color: "#333",
                      fontWeight: "800",
                      fontSize: 16,
                      marginTop: 4,
                    }}
                  >
                    {item.count}
                  </Text>
                  {isSelected && (
                    <View
                      style={[
                        styles.activeDot,
                        { backgroundColor: config.colors[0] },
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ paddingHorizontal: 15 }}>
          <Text style={styles.sectionHeader}>
            📋 รายการล่าสุด
            {!startDate && !endDate && (
              <Text
                style={{
                  fontSize: 12,
                  color: ACTIVE_COLOR,
                  fontWeight: "normal",
                }}
              >
                {" "}
                (ทั้งหมด)
              </Text>
            )}
          </Text>
          {loading ? (
            <ActivityIndicator color={ACTIVE_COLOR} />
          ) : (
            <FlatList
              data={recentList}
              keyExtractor={(item, index) => index.toString()}
              renderItem={renderItem}
              scrollEnabled={false}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={{ color: "#999" }}>ไม่พบข้อมูล</Text>
                </View>
              }
            />
          )}
        </View>
      </ScrollView>

      {/* Modals and Custom Components */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.detailModalOverlay}>
          <View style={styles.detailModalContent}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>รายละเอียด</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 500 }}>
              {selectedItem && (
                <View style={{ paddingBottom: 20 }}>
                  <DetailItem
                    icon="storefront"
                    color="#333"
                    title="ร้านค้า"
                    text={selectedItem.supplier_name}
                  />
                  <DetailItem
                    icon="construct"
                    color="#333"
                    title="หน้างาน"
                    text={selectedItem.project_name}
                  />
                  <DetailItem
                    icon="receipt"
                    color="#333"
                    title="สถานะบิล"
                    text={selectedItem.tax_invoice_status}
                  />
                  <Text style={styles.sectionHeader}>📦 รายการสินค้า</Text>
                  {renderProductDetails(selectedItem.item_details)}
                  <View style={{ marginVertical: 10 }}>
                    <DetailItem
                      icon="alert-circle"
                      color="#e74c3c"
                      title="ปัญหา"
                      text={selectedItem.problem}
                    />
                    <DetailItem
                      icon="document-text"
                      color={ACTIVE_COLOR}
                      title="หมายเหตุ"
                      text={selectedItem.additional_notes}
                    />
                  </View>
                  {parseFloat(selectedItem.total_expense) > 0 && (
                    <View
                      style={[
                        styles.costContainer,
                        { borderColor: ACTIVE_COLOR + "30" },
                      ]}
                    >
                      <Text style={[styles.costTitle, { color: ACTIVE_COLOR }]}>
                        💸 สรุปยอดเงิน
                      </Text>
                      <View style={styles.costRow}>
                        <View style={styles.costItem}>
                          <Text style={styles.costLabel}>ค่าใช้จ่าย</Text>
                          <Text style={styles.costValue}>
                            -
                            {parseInt(
                              selectedItem.total_expense || 0,
                            ).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      {selectedItem.expense_list && (
                        <Text style={styles.costNote}>
                          {selectedItem.expense_list}
                        </Text>
                      )}
                    </View>
                  )}
                  <Text style={styles.imgHeader}>📸 หลักฐาน / รูปภาพ</Text>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 10,
                      marginTop: 10,
                    }}
                  >
                    {selectedItem.expense_files &&
                      String(selectedItem.expense_files).trim() !== "" &&
                      String(selectedItem.expense_files)
                        .split(",")
                        .map((img: string, idx: number) => {
                          const c = img.trim();
                          if (!c) return null;
                          return (
                            <ImageButton
                              key={`e-${idx}`}
                              icon="receipt"
                              color="#ef4444"
                              label={`ค่าใช้จ่าย ${idx + 1}`}
                              onPress={() => openImage(c)}
                            />
                          );
                        })}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Custom Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: 320, padding: 0 }]}>
            <View style={styles.calHeader}>
              <TouchableOpacity
                onPress={() => changeMonth(-1)}
                style={styles.calNavBtn}
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </TouchableOpacity>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity onPress={() => setPickerView("month")}>
                  <Text style={styles.calTitle}>
                    {TH_MONTHS_FULL[pickerDate.getMonth()]}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPickerView("year")}>
                  <Text style={styles.calTitle}>
                    {" "}
                    {pickerDate.getFullYear() + 543}
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => changeMonth(1)}
                style={styles.calNavBtn}
              >
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 15 }}>
              {pickerView === "day" && (
                <>
                  <View style={styles.calWeekRow}>
                    {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d, i) => (
                      <Text key={i} style={styles.calWeekText}>
                        {d}
                      </Text>
                    ))}
                  </View>
                  {renderCalendar()}
                </>
              )}
              {pickerView === "month" && renderMonthSelector()}
              {pickerView === "year" && renderYearSelector()}
            </View>
            <TouchableOpacity
              style={styles.calCloseBtn}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={{ color: "#666" }}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Selector Modal */}
      <Modal visible={selectorVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: "60%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>เลือกพนักงาน</Text>
              <TouchableOpacity onPress={() => setSelectorVisible(false)}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={["ทั้งหมด", ...reporters]}
              keyExtractor={(i) => i}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.selectorItem}
                  onPress={() => {
                    setFilterReporter(item === "ทั้งหมด" ? "" : item);
                    setSelectorVisible(false);
                  }}
                >
                  <Text style={{ fontSize: 16, color: "#333" }}>{item}</Text>
                  {(filterReporter === item ||
                    (item === "ทั้งหมด" && !filterReporter)) && (
                    <Ionicons name="checkmark" size={20} color={ACTIVE_COLOR} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    marginRight: 15,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#1e293b" },
  filterBtn: {
    marginLeft: "auto",
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },

  // Filter Section
  filterSection: {
    backgroundColor: "#fff",
    padding: 20,
    margin: 15,
    borderRadius: 16,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 6,
    fontWeight: "600",
  },
  filterInput: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
  },
  dateRow: { flexDirection: "row", gap: 15, marginBottom: 15 },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
  },

  // New Show All Button
  showAllBtn: {
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: ACTIVE_COLOR + "15",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: ACTIVE_COLOR + "30",
  },

  filterActions: { flexDirection: "row", gap: 10 },
  searchBtn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: ACTIVE_COLOR,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: ACTIVE_COLOR,
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  resetBtn: {
    width: 50,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  // KPI & Status Cards
  kpiContainer: { paddingHorizontal: 15, marginTop: 15 },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  kpiWrapper: { flex: 1 },
  kpiCard: {
    padding: 15,
    borderRadius: 15,
    height: 80,
    justifyContent: "space-between",
    elevation: 3,
  },
  kpiHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  kpiLabel: { color: "white", fontSize: 12, fontWeight: "bold", opacity: 0.9 },
  kpiValue: { color: "white", fontSize: 20, fontWeight: "bold" },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap", // สั่งให้ตัดบรรทัด
    paddingHorizontal: 15,
    gap: 10, // ระยะห่างระหว่างการ์ด
    marginBottom: 20,
  },
  statusCard: {
    // marginRight: 10,     <-- ลบอันนี้ออก
    width: "30%", // กำหนดความกว้าง (ประมาณ 3 การ์ดต่อแถว)
    flexGrow: 1, // ให้ขยายเต็มพื้นที่
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },

  activeDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },

  // Recent List
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 15,
    marginBottom: 12,
    borderRadius: 15,
    padding: 15,
    borderLeftWidth: 5,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: { fontSize: 14, fontWeight: "bold", color: "#333" },
  dateText: { fontSize: 11, color: "#888" },
  reporterName: { fontSize: 12, color: "#475569", fontWeight: "600" },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 2,
  },
  cardBody: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    marginBottom: 10,
  },
  cardSubtitle: { fontSize: 13, color: "#555", flex: 1 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  btnDetail: { flexDirection: "row", alignItems: "center" },
  emptyState: { alignItems: "center", marginTop: 50 },

  // Modals & Details
  detailModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  detailModalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 25,
    maxHeight: "85%",
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  detailTitle: { fontSize: 20, fontWeight: "bold", color: "#333" },
  imgHeader: { fontSize: 15, fontWeight: "bold", color: "#333", marginTop: 10 },
  costContainer: {
    backgroundColor: "#f8fafc",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 10,
    marginBottom: 10,
  },
  costTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 10 },
  costRow: { flexDirection: "row", justifyContent: "space-around" },
  costItem: { alignItems: "center" },
  costLabel: { fontSize: 12, color: "#64748b", marginBottom: 2 },
  costValue: { fontSize: 16, fontWeight: "bold", color: "#e74c3c" },
  costNote: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 8,
    fontStyle: "italic",
    textAlign: "center",
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },

  // Product Details
  prodCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
    overflow: "hidden",
    marginBottom: 10,
  },
  prodHeader: { padding: 10, flexDirection: "row", alignItems: "center" },
  prodTitle: { fontSize: 14, fontWeight: "bold" },
  prodBody: { padding: 10 },
  prodRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
    paddingBottom: 6,
  },
  prodName: { fontSize: 13, color: "#333", flex: 1 },
  prodSub: { fontSize: 11, color: "#888", marginTop: 2 },
  prodPrice: { fontSize: 13, fontWeight: "bold", color: "#333" },
  prodFooter: {
    padding: 10,
    backgroundColor: "#fafafa",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  prodTotalLabel: { fontSize: 12, color: "#666" },
  prodTotalValue: { fontSize: 14, fontWeight: "bold", color: "#059669" },

  // Custom Calendar
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    maxHeight: "80%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  calHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: ACTIVE_COLOR,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  calTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  calNavBtn: { padding: 5 },
  calWeekRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 5,
  },
  calWeekText: { color: "#666", fontSize: 14, width: 35, textAlign: "center" },
  calGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  calDay: {
    width: "14.28%",
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  calDayText: { fontSize: 16, color: "#333" },
  calDayEmpty: { width: "14.28%", height: 40 },
  calDaySelected: { backgroundColor: ACTIVE_COLOR, borderRadius: 20 },
  calDayTextSelected: { color: "#fff", fontWeight: "bold" },
  calCloseBtn: { alignSelf: "center", padding: 10, marginTop: 10 },
  yearGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  yearItem: {
    padding: 15,
    width: "30%",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
  },
  yearText: { fontSize: 16, color: "#333" },
  selectorItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
});
