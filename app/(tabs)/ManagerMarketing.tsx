import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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

const TAB_ID = "marketing";
const ACTIVE_COLOR = "#6366f1"; // สีม่วง Marketing
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

export default function ManagerMarketing() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [summary, setSummary] = useState({ total: 0, expense: 0, sales: 0 });
  const [kpiList, setKpiList] = useState<any[]>([]);
  const [recentList, setRecentList] = useState<any[]>([]);

  // ✅ แก้: ใช้ตัวแปรนี้ตัวเดียว (ลบ shopStats ทิ้งไปเลย)
  const [platformStats, setPlatformStats] = useState<any[]>([]);

  // Filters
  const [reporters, setReporters] = useState<string[]>([]);
  const [filterReporter, setFilterReporter] = useState("");
  const [filterStatus, setFilterStatus] = useState("ทั้งหมด");

  // Dates
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  // UI States & Modals
  const [showFilter, setShowFilter] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateMode, setDateMode] = useState<"start" | "end">("start");
  const [pickerDate, setPickerDate] = useState(new Date());
  const [pickerView, setPickerView] = useState<"day" | "month" | "year">("day");
  const [modalVisible, setModalVisible] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // ✅ แก้: ฟังก์ชันนี้ต้องอยู่ก่อน fetchData
  const fetchFilterOptions = async () => {
    try {
      // ✅ เปลี่ยน action เป็น get_marketing_active_reporters
      const resUsers = await axios.get(
        `${API_BASE}/api_mobile.php?action=get_marketing_active_reporters`,
      );
      if (Array.isArray(resUsers.data)) setReporters(resUsers.data);
    } catch (e) {
      console.log("Error fetching marketing reporters:", e);
    }
  };

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
      const currentStart =
        overrideStart === undefined ? startDate : overrideStart;
      const currentEnd = overrideEnd === undefined ? endDate : overrideEnd;

      const params = new URLSearchParams();
      params.append("action", "get_dashboard_stats");
      params.append("tab", TAB_ID);

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

        // ✅ แก้: รับค่า platformStats จาก API
        setPlatformStats(response.data.platform_stats || []);

        fetchFilterOptions();
      }
    } catch (error) {
      console.log("Fetch Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterStatus]);
  useEffect(() => {
    fetchData();
  }, [filterReporter]);

  // Filter Logic
  const handleShowAllHistory = () => {
    setStartDate(null);
    setEndDate(null);
    fetchData(undefined, undefined, null, null);
  };

  const handleReset = () => {
    setFilterReporter("");
    setFilterStatus("ทั้งหมด");

    // รีเซ็ตวันที่ (หรือเคลียร์เป็น null ตามต้องการ)
    const defaultStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );
    const defaultEnd = new Date();
    setStartDate(defaultStart);
    setEndDate(defaultEnd);

    // บังคับโหลดใหม่ด้วยค่า Default ทันที
    fetchData("", "ทั้งหมด", defaultStart, defaultEnd);
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  // --- Helpers ---
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
      st.includes("ส่งแล้ว") ||
      st.includes("สำเร็จ") ||
      st.includes("เรียบร้อย")
    )
      return {
        colors: ["#10b981", "#059669"],
        icon: "checkmark-circle",
        color: "#10b981",
        bg: "#d1fae5",
      };
    if (st.includes("ตีกลับ") || st.includes("ยกเลิก") || st.includes("คืน"))
      return {
        colors: ["#ef4444", "#dc2626"],
        icon: "close-circle",
        color: "#ef4444",
        bg: "#fee2e2",
      };
    if (st.includes("รอ") || st.includes("กำลัง") || st.includes("เตรียม"))
      return {
        colors: ["#f59e0b", "#d97706"],
        icon: "hourglass",
        color: "#f59e0b",
        bg: "#fef3c7",
      };
    return {
      colors: [ACTIVE_COLOR, "#4f46e5"],
      icon: "bookmark",
      color: ACTIVE_COLOR,
      bg: "#e0e7ff",
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

  // --- Date Picker Logic ---
  const openCustomDatePicker = (mode: "start" | "end") => {
    setDateMode(mode);
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
    const firstDay = new Date(year, month, 1).getDay();
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

  // ==========================================
  // 🎨 RENDER DETAIL SECTIONS (Logic Updated)
  // ==========================================

  // 1. Render Shop Details + Slips
  const renderShopDetails = (
    detailsString: string,
    statusString: string,
    filesString: string,
  ) => {
    if (!detailsString)
      return (
        <Text style={{ color: "#999", fontStyle: "italic" }}>
          - ไม่มีรายการ -
        </Text>
      );

    const shops = detailsString
      .split("--------------------")
      .filter((s) => s.trim() !== "");
    const statuses = (statusString || "").split(",");

    // Map files string into Key-Value for easy lookup
    let fileMap: any = {};
    if (filesString) {
      filesString.split("|").forEach((group) => {
        const parts = group.split(":");
        if (parts.length >= 2) {
          const key = parts[0].trim(); // OrderNo or Platform
          const files = parts.slice(1).join(":").split(",");
          fileMap[key] = files;
        }
      });
    }

    return (
      <View style={{ gap: 15 }}>
        {shops.map((shopTxt, idx) => {
          const lines = shopTxt.trim().split("\n");
          const headerLine = lines[0];
          let orderNo = "-";
          if (headerLine.includes("Order:"))
            orderNo = headerLine.match(/\(Order: (.*?)\)/)?.[1] || "-";
          else if (headerLine.includes("#"))
            orderNo = headerLine.split("#")[1].trim();

          let displayName = headerLine
            .replace(/\?|🌐/g, "")
            .split("#")[0]
            .split("(")[0]
            .trim();
          let st =
            (statuses[idx] || "ดำเนินการ").split(":")[1] ||
            statuses[idx] ||
            "ดำเนินการ";
          st = st.trim();
          const stConfig = getStatusConfig(st);

          let shopTotal = "0.00";
          const items = lines.slice(1).filter((l) => {
            if (l.includes("บาท") || l.includes("ยอด")) {
              const match = l.match(/([\d,\.]+) บาท/);
              if (match) shopTotal = match[1];
              return false;
            }
            return l.trim() !== "";
          });

          // Find Slip Files
          let myFiles: string[] = [];
          if (orderNo !== "-" && fileMap[orderNo]) myFiles = fileMap[orderNo];
          else if (fileMap[displayName]) myFiles = fileMap[displayName];

          return (
            <View key={idx} style={styles.shopCard}>
              <View style={styles.shopHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <FontAwesome5
                      name="store"
                      size={14}
                      color="#333"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.shopName}>{displayName}</Text>
                  </View>
                  <View style={styles.shopOrderBadge}>
                    <Text style={{ fontSize: 10, color: "#64748b" }}>
                      #{orderNo}
                    </Text>
                  </View>
                </View>
                <View
                  style={[styles.statusPill, { backgroundColor: stConfig.bg }]}
                >
                  <Text
                    style={{
                      color: stConfig.color,
                      fontSize: 10,
                      fontWeight: "bold",
                    }}
                  >
                    {st}
                  </Text>
                </View>
              </View>

              <View style={styles.shopTable}>
                <View
                  style={[
                    styles.shopTableRow,
                    {
                      backgroundColor: "#f8fafc",
                      borderBottomWidth: 1,
                      borderBottomColor: "#e2e8f0",
                    },
                  ]}
                >
                  <Text style={[styles.th, { flex: 2 }]}>สินค้า</Text>
                  <Text style={[styles.th, { textAlign: "center" }]}>จน.</Text>
                  <Text style={[styles.th, { textAlign: "right" }]}>รวม</Text>
                </View>
                {items.map((line, i) => {
                  if (!line.includes("=")) return null;
                  let namePart = line.split("(")[0].replace("-", "").trim();
                  let qty = (line.match(/\(x(.*?)\)/) || [])[1] || "1";
                  let total = line.split("=")[1].replace("บ.", "").trim();
                  return (
                    <View key={i} style={styles.shopTableRow}>
                      <Text style={[styles.td, { flex: 2 }]}>{namePart}</Text>
                      <Text style={[styles.td, { textAlign: "center" }]}>
                        x{qty}
                      </Text>
                      <Text
                        style={[
                          styles.td,
                          { textAlign: "right", fontWeight: "bold" },
                        ]}
                      >
                        {total}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.shopFooter}>
                {/* Slip Buttons */}
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 5,
                    flex: 1,
                  }}
                >
                  {myFiles.length > 0 ? (
                    myFiles.map((f, fi) => (
                      <TouchableOpacity
                        key={fi}
                        onPress={() => openImage(f)}
                        style={styles.slipBtn}
                      >
                        <Ionicons name="image" size={12} color={ACTIVE_COLOR} />
                        <Text
                          style={{
                            fontSize: 10,
                            color: ACTIVE_COLOR,
                            fontWeight: "600",
                          }}
                        >
                          สลิป {fi + 1}
                        </Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={{ fontSize: 10, color: "#ccc" }}>
                      - ไม่มีสลิป -
                    </Text>
                  )}
                </View>
                {/* Total */}
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 12, color: "#64748b" }}>สุทธิ</Text>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "bold",
                      color: ACTIVE_COLOR,
                    }}
                  >
                    {shopTotal} ฿
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // ✅ ฟังก์ชัน Render การ์ด (รองรับรูปภาพ)
  const renderShopSalesCard = () => {
    if (platformStats.length === 0) return null;

    return (
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                width: 32,
                height: 32,
                backgroundColor: ACTIVE_COLOR + "15",
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FontAwesome5 name="store" size={16} color={ACTIVE_COLOR} />
            </View>
            <View>
              <Text style={styles.chartTitle}>ยอดขายแยกตามร้านค้า</Text>
              <Text style={styles.chartSub}>
                {platformStats.length} ร้านค้า
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.pfGrid}>
          {platformStats.map((shop, index) => (
            <View key={index} style={styles.pfCard}>
              {/* แถบสีด้านซ้าย */}
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  backgroundColor: ACTIVE_COLOR,
                }}
              />

              <View style={{ flex: 1, marginRight: 10, paddingLeft: 10 }}>
                <Text style={styles.pfName} numberOfLines={1}>
                  {shop.name}
                </Text>
                <Text style={styles.pfValue}>
                  ฿{parseFloat(shop.total).toLocaleString()}
                </Text>
              </View>

              {/* ✅ แสดงรูปภาพ (ถ้ามี) */}
              {shop.image ? (
                <Image
                  source={{ uri: shop.image }}
                  style={styles.pfLogo}
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={[
                    styles.pfLogo,
                    {
                      backgroundColor: "#f8fafc",
                      alignItems: "center",
                      justifyContent: "center",
                    },
                  ]}
                >
                  <FontAwesome5 name="store" size={18} color={ACTIVE_COLOR} />
                </View>
              )}
            </View>
          ))}
        </View>
      </View>
    );
  };

  // 2. Render Expenses + Receipts
  const renderExpenses = (expenseList: string, expenseFiles: string) => {
    if (!expenseList) return null;

    let expenses: { name: string; amount: string }[] = [];
    let pattern = /([^\(\)\|]+)\s*\(([\d,\.]+)\)/g;
    let match;
    while ((match = pattern.exec(expenseList)) !== null) {
      expenses.push({
        name: match[1].trim().replace(/^,/, "").trim(),
        amount: match[2],
      });
    }

    // Get expense files array
    let filesArr: string[] = [];
    if (expenseFiles) {
      filesArr = expenseFiles
        .replace(/\|/g, ",")
        .split(",")
        .filter((f) => f.trim() !== "");
    }

    return (
      <View style={styles.expCard}>
        <View style={styles.expHeader}>
          <Text style={{ fontSize: 14, fontWeight: "bold", color: "#991b1b" }}>
            <Ionicons name="wallet" size={16} /> รายการค่าใช้จ่าย
          </Text>
        </View>
        {expenses.map((item, i) => (
          <View key={i} style={styles.expRow}>
            <Text style={{ flex: 1, fontSize: 13, color: "#333" }}>
              {item.name}
            </Text>

            <View style={{ width: 80, alignItems: "center" }}>
              {filesArr[i] ? (
                <TouchableOpacity
                  onPress={() => openImage(filesArr[i])}
                  style={styles.receiptBtn}
                >
                  <Ionicons name="receipt" size={10} color="#c53030" />
                  <Text
                    style={{
                      fontSize: 9,
                      color: "#c53030",
                      fontWeight: "bold",
                    }}
                  >
                    ดูบิล
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: 10, color: "#ccc" }}>-</Text>
              )}
            </View>

            <Text
              style={{
                fontSize: 13,
                fontWeight: "bold",
                color: "#ef4444",
                width: 60,
                textAlign: "right",
              }}
            >
              {item.amount}
            </Text>
          </View>
        ))}
        <View style={styles.expFooter}>
          <Text style={{ fontSize: 12, color: "#7f1d1d" }}>
            รวมค่าใช้จ่ายสุทธิ
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: "#ef4444" }}>
            {selectedItem?.total_expense
              ? parseFloat(selectedItem.total_expense).toLocaleString()
              : "0"}{" "}
            ฿
          </Text>
        </View>
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
    let title = item.platform_name || "Online";
    let subtitle = item.order_number ? `Order: ${item.order_number}` : "-";
    let rawStatus = item.tax_invoice_status;
    let subIcon = "barcode";

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
                <FontAwesome5 name="bullhorn" size={14} color={ACTIVE_COLOR} />
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
                {item.total_sales > 0 && (
                  <Text
                    style={{
                      color: "#059669",
                      fontSize: 13,
                      fontWeight: "bold",
                    }}
                  >
                    +฿{parseInt(item.total_sales).toLocaleString()}
                  </Text>
                )}
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)/manager_dashboard")}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📊 การตลาดออนไลน์</Text>
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
              label="ยอดขายรวม"
              value={
                "฿" +
                (summary.sales ? (summary.sales / 1000).toFixed(1) + "k" : "0")
              }
              icon="wallet"
              colors={["#9b59b6", "#8e44ad"]}
              delay={100}
            />
          </View>

          {/* Status Breakdown (ปรับแก้: ให้เรียงลงมา ไม่เลื่อนขวา) */}
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

              // 1. Ensure this variable is declared here
              const isSelected = filterStatus === item.status;

              return (
                <TouchableOpacity
                  key={idx}
                  // 2. Updated onPress logic
                  onPress={() => {
                    // Logic: If currently selected, toggle off to "ทั้งหมด", otherwise select this item's status
                    const nextStatus =
                      filterStatus === item.status ? "ทั้งหมด" : item.status;
                    setFilterStatus(nextStatus);
                  }}
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

        <View style={{ paddingHorizontal: 15, marginBottom: 10 }}>
          {renderShopSalesCard()}
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

      {/* Detail Modal */}
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
                  {/* ✅ เรียกใช้ renderShopDetails (ส่ง platform_files ไปด้วย) */}
                  {renderShopDetails(
                    selectedItem.item_details,
                    selectedItem.tax_invoice_status,
                    selectedItem.platform_files,
                  )}

                  {/* ✅ เรียกใช้ renderExpenses (ส่ง expense_files ไปด้วย) */}
                  {renderExpenses(
                    selectedItem.expense_list,
                    selectedItem.expense_files,
                  )}

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

                  {/* Summary Grand Total */}
                  <View style={styles.summaryBox}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: "bold",
                          fontSize: 14,
                          color: "#333",
                        }}
                      >
                        ยอดขายสุทธิ (Grand Total)
                      </Text>
                      <Text
                        style={{
                          fontWeight: "800",
                          fontSize: 20,
                          color: ACTIVE_COLOR,
                        }}
                      >
                        +{parseFloat(selectedItem.total_sales).toLocaleString()}{" "}
                        ฿
                      </Text>
                    </View>
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

      {/* Selector Modal (Reporter) */}
      <Modal visible={selectorVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: "60%" }]}>
            {/* ... หัวข้อ Modal เหมือนเดิม ... */}
            <FlatList
              data={["ทั้งหมด", ...reporters]}
              keyExtractor={(i) => i}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.selectorItem}
                  onPress={() => {
                    // ✅ [แก้ไขตรงนี้] เลือกชื่อพนักงานตรงๆ (item คือ string ชื่อคน)
                    setFilterReporter(item === "ทั้งหมด" ? "" : item);
                    setSelectorVisible(false);
                  }}
                >
                  <Text style={{ fontSize: 16, color: "#333" }}>{item}</Text>

                  {/* ✅ [แก้ไขตรงนี้] แสดงเครื่องหมายถูกที่ชื่อที่เลือกอยู่ */}
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

  // Filter
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

  // KPI & Status
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

  // ✅ ปรับ style ของการ์ด
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

  // List
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
  sectionHeader: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },

  // Modal Details (Web Style)
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

  // Shop Card (New)
  shopCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 5,
  },
  shopHeader: {
    padding: 15,
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  shopName: { fontWeight: "bold", color: "#0f172a", fontSize: 15 },
  shopOrderBadge: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 2,
    alignSelf: "flex-start",
  },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  shopTable: { paddingVertical: 5 },
  shopTableRow: {
    flexDirection: "row",
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  th: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  td: { fontSize: 13, color: "#333" },
  shopFooter: {
    padding: 15,
    backgroundColor: "#fff",
    borderTopWidth: 2,
    borderTopColor: "#f1f5f9",
    borderStyle: "dashed",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Expense Card (New)
  expCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fca5a5",
    overflow: "hidden",
    marginBottom: 20,
    marginTop: 10,
  },
  expHeader: {
    padding: 12,
    backgroundColor: "#fff1f2",
    borderBottomWidth: 1,
    borderBottomColor: "#fecaca",
  },
  expRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  expFooter: {
    padding: 12,
    backgroundColor: "#fff1f2",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Evidence Buttons (New)
  slipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    marginRight: 5,
    marginBottom: 5,
  },
  receiptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#fff1f2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
  },

  // Summary & Misc
  summaryBox: {
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    marginBottom: 20,
    borderTopWidth: 4,
    borderTopColor: ACTIVE_COLOR,
  },
  imgHeader: { fontSize: 15, fontWeight: "bold", color: "#333", marginTop: 10 },

  // Calendar & Modals
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
  chartCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    marginBottom: 10,
  },
  chartHeader: {
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 10,
  },
  chartTitle: { fontSize: 16, fontWeight: "bold", color: "#1e293b" },
  chartSub: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  chartBody: { gap: 15 },
  chartRow: {},
  chartRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    alignItems: "center",
  },
  rankBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  chartLabel: { fontSize: 14, color: "#334155", fontWeight: "600" },
  chartValue: { fontSize: 14, color: ACTIVE_COLOR, fontWeight: "bold" },
  progressBarBg: {
    height: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  pfGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pfCard: {
    width: "48%", // จัดเรียง 2 การ์ดต่อแถว
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    position: "relative",
    height: 80,
  },
  pfName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 4,
  },
  pfValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1e293b",
  },
  pfLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#fff",
  },
});
