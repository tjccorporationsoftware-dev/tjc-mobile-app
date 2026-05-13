import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image, // ✅ ใส่ Image เข้าไปตรงนี้ครับ
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
import { useAuth } from "../_layout";

const ShopLogo = ({ uri }: { uri: string | null }) => {
  const [hasError, setHasError] = useState(false);

  // ถ้าไม่มี URL หรือโหลดรูป error -> ให้โชว์ไอคอน
  if (!uri || hasError) {
    return (
      <View
        style={[
          styles.pfLogo,
          {
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f1f5f9",
            borderWidth: 1,
            borderColor: "#e2e8f0",
          },
        ]}
      >
        <FontAwesome5 name="store" size={16} color={ACTIVE_COLOR} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.pfLogo, { backgroundColor: "#fff" }]}
      resizeMode="contain"
      onError={() => setHasError(true)}
    />
  );
};

const ACTIVE_COLOR = "#6366f1"; // สีธีม Marketing
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

export default function HistoryMarketing() {
  const router = useRouter();
  const { user } = useAuth();

  // Data States
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter States
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [filterStatus, setFilterStatus] = useState("ทั้งหมด");
  const [showFilter, setShowFilter] = useState(false);

  // Date Picker UI
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateMode, setDateMode] = useState<"start" | "end">("start");
  const [pickerDate, setPickerDate] = useState(new Date());
  const [pickerView, setPickerView] = useState<"day" | "month" | "year">("day");

  // Modal Detail
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [logoMap, setLogoMap] = useState<any>({});

  const fetchLogos = async () => {
    try {
      const res = await axios.get(
        `${API_BASE}/api_mobile.php?action=get_marketing_platforms`,
      );
      if (res.data) {
        setLogoMap(res.data);
      }
    } catch (e) {
      console.log("Logo Fetch Error:", e);
    }
  };

  // --- Fetch Data ---
  const fetchHistory = async () => {
    try {
      if (!refreshing) setLoading(true);

      let url = `${API_BASE}/api_mobile.php?action=get_history&reporter_name=${encodeURIComponent(user?.fullname || "")}`;

      if (startDate)
        url += `&start_date=${startDate.toISOString().split("T")[0]}`;
      if (endDate) url += `&end_date=${endDate.toISOString().split("T")[0]}`;

      const res = await axios.get(url);

      if (res.data && res.data.history) {
        // 1. กรองเอาเฉพาะ Marketing
        const marketingData = res.data.history.filter(
          (item: any) => item.source_type === "marketing",
        );

        // ✅ Sorting: เรียงจาก ใหม่ -> เก่า (Newest First)
        // ถ้าต้องการ เก่า -> ใหม่ ให้ใช้ a - b
        marketingData.sort(
          (a: any, b: any) =>
            new Date(b.report_date).getTime() -
            new Date(a.report_date).getTime(),
        );

        setRawData(marketingData);
      } else {
        setRawData([]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogos();
    fetchHistory();
  }, [startDate, endDate]);

  // --- Calculate Summary & Filter List (Client-Side) ---
  const { filteredList, summary, statusBreakdown, platformStats } =
    useMemo(() => {
      let list = rawData;

      // 1. Filter by Status
      if (filterStatus !== "ทั้งหมด") {
        list = list.filter((item) => {
          const st = item.tax_invoice_status || item.job_status || "";
          return st.includes(filterStatus);
        });
      }

      // 2. Calculate KPI
      const totalCount = list.length;
      const totalSales = list.reduce(
        (sum, item) => sum + (parseFloat(item.total_sales) || 0),
        0,
      );

      // 3. Status Breakdown
      const stats: { [key: string]: number } = {};
      rawData.forEach((item) => {
        const stRaw = item.tax_invoice_status || item.job_status || "ไม่ระบุ";
        const st =
          stRaw.split(",")[0].split(":")[1]?.trim() ||
          stRaw.split(":")[0].trim() ||
          "ไม่ระบุ";
        stats[st] = (stats[st] || 0) + 1;
      });

      const breakdown = Object.entries(stats).map(([k, v]) => ({
        status: k,
        count: v,
      }));

      // ✅ 4. Calculate Sales by Shop (Client-Side)
      const pfMap: Record<string, number> = {};
      list.forEach((item) => {
        // ดึงชื่อร้าน
        const name = (item.platform_name || "อื่นๆ").split(",")[0].trim();
        const sale = parseFloat(item.total_sales) || 0;
        if (sale > 0) {
          pfMap[name] = (pfMap[name] || 0) + sale;
        }
      });

      // เตรียม Base URL สำหรับกรณีเดารูปเอง (Fallback)
      // ตัด api_mobile.php ออก
      const baseUrl = API_BASE.replace("/api_mobile.php", "");

      const pfStats = Object.entries(pfMap)
        .map(([name, total]) => {
          // Logic:
          // 1. ลองหาใน Map (จาก DB) ซึ่ง PHP ส่งมาเป็น URL เต็มแล้ว -> ใช้ได้เลย
          // 2. ถ้าไม่มี -> ให้ลองเดา URL เองจากชื่อร้าน
          let imgUrl = logoMap[name.toLowerCase()];

          if (!imgUrl) {
            // กรณีเดาเอง: http://.../uploads/platforms/ชื่อร้าน.png
            imgUrl = `${baseUrl}/uploads/platforms/${encodeURIComponent(name)}.png`;
          }

          return {
            name,
            total,
            image: imgUrl,
          };
        })
        .sort((a, b) => b.total - a.total);

      return {
        filteredList: list,
        summary: { total: totalCount, sales: totalSales },
        statusBreakdown: breakdown,
        platformStats: pfStats,
      };
    }, [rawData, filterStatus, logoMap]);

  // --- Helpers ---
  const getStatusConfig = (st: string) => {
    st = (st || "").trim();
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
    if (st.includes("รอ") || st.includes("กำลัง"))
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

  const formatDate = (date: any) =>
    new Date(date).toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const openImage = (filename: string) => {
    if (!filename) return;
    const fullUrl = filename.startsWith("http")
      ? filename
      : `${IMG_BASE_URL.replace(/\/$/, "")}/uploads/marketing/${filename.trim()}`;
    Linking.openURL(fullUrl).catch(() => Alert.alert("Error", "เปิดรูปไม่ได้"));
  };

  // --- Render Functions ---
  // ✅ [จุดที่ 3] แก้ไขฟังก์ชัน Render การ์ดร้านค้า
  const renderShopSalesCard = () => {
    if (!platformStats || platformStats.length === 0) return null;

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
                {platformStats.length} ร้านค้า (คำนวณจากรายการที่กรอง)
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.pfGrid}>
          {platformStats.map((shop: any, index: number) => (
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
                  ฿{shop.total.toLocaleString()}
                </Text>
              </View>

              {/* ใช้ Component ShopLogo ที่เราสร้าง */}
              <ShopLogo uri={shop.image} />
            </View>
          ))}
        </View>
      </View>
    );
  };

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
    let fileMap: any = {};
    if (filesString) {
      filesString.split("|").forEach((group) => {
        const parts = group.split(":");
        if (parts.length >= 2) {
          const key = parts[0].trim();
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
            <Text style={styles.kpiLabel}>{label}</Text>
            <Ionicons name={icon} size={18} color="rgba(255,255,255,0.8)" />
          </View>
          <Text style={styles.kpiValue}>{value}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );

  // --- Date Picker Components ---
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
    setPickerDate(
      new Date(pickerDate.getFullYear(), pickerDate.getMonth() + offset, 1),
    );
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📊 ประวัติฝ่ายการตลาดออนไลน์</Text>
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
              fetchHistory();
            }}
            colors={[ACTIVE_COLOR]}
          />
        }
      >
        {/* Filter Section */}
        {showFilter && (
          <Animated.View entering={FadeInDown} style={styles.filterSection}>
            <Text style={styles.sectionTitle}>ตัวกรองวันที่</Text>
            <View style={styles.dateRow}>
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
                  style={{ color: startDate ? "#333" : "#aaa", marginLeft: 8 }}
                >
                  {startDate ? formatDate(startDate) : "ทั้งหมด"}
                </Text>
              </TouchableOpacity>
              <Text style={{ alignSelf: "center" }}> - </Text>
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
                  {endDate ? formatDate(endDate) : "ทั้งหมด"}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.filterActions}>
              <TouchableOpacity
                onPress={() => {
                  setStartDate(null);
                  setEndDate(null);
                  setFilterStatus("ทั้งหมด");
                }}
                style={styles.resetBtn}
              >
                <Ionicons name="refresh" size={18} color="#666" />
                <Text
                  style={{ color: "#666", fontWeight: "bold", marginLeft: 5 }}
                >
                  ดูประวัติทั้งหมด
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => fetchHistory()}
                style={styles.searchBtn}
              >
                <Ionicons name="search" size={18} color="white" />
                <Text
                  style={{ color: "white", fontWeight: "bold", marginLeft: 5 }}
                >
                  ค้นหา
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* KPI Cards */}
        <View style={styles.kpiContainer}>
          <View style={styles.kpiRow}>
            <KPICard
              label="รายการทั้งหมด"
              value={summary.total}
              icon="documents"
              colors={[ACTIVE_COLOR, "#818cf8"]}
              delay={0}
              onPress={() => setFilterStatus("ทั้งหมด")}
            />
            <KPICard
              label="ยอดขายรวม"
              value={`฿${(summary.sales / 1000).toFixed(1)}k`}
              icon="wallet"
              colors={["#059669", "#10b981"]}
              delay={100}
            />
          </View>

          {/* Status Breakdown */}
          <View style={styles.statusGrid}>
            <TouchableOpacity
              onPress={() => setFilterStatus("ทั้งหมด")}
              style={[
                styles.statusCard,
                {
                  backgroundColor: "#fff",
                  borderColor: ACTIVE_COLOR,
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
            </TouchableOpacity>
            {statusBreakdown.map((item, idx) => {
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
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ✅ Sales by Shop Card */}
        <View style={{ paddingHorizontal: 15, marginBottom: 15 }}>
          {renderShopSalesCard()}
        </View>

        {/* List Section */}
        <View style={{ paddingHorizontal: 15 }}>
          <Text style={styles.sectionHeader}>
            📋 รายการ ({filteredList.length})
          </Text>
          {loading ? (
            <ActivityIndicator
              size="large"
              color={ACTIVE_COLOR}
              style={{ marginTop: 20 }}
            />
          ) : (
            <FlatList
              data={filteredList}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item, index }) => {
                const stRaw =
                  item.tax_invoice_status || item.job_status || "ไม่ระบุ";
                const st =
                  stRaw.split(",")[0].split(":")[1]?.trim() ||
                  stRaw.split(":")[0].trim() ||
                  "ไม่ระบุ";
                const conf = getStatusConfig(st);
                return (
                  <Animated.View
                    entering={FadeInDown.delay(index * 50).duration(400)}
                  >
                    <TouchableOpacity
                      style={[styles.card, { borderLeftColor: conf.color }]}
                      onPress={() => {
                        setSelectedItem(item);
                        setModalVisible(true);
                      }}
                    >
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.title}>
                            {item.platform_name || "Online"}
                          </Text>
                          <Text style={styles.date}>
                            {formatDate(item.report_date)}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: conf.bg },
                          ]}
                        >
                          <Text
                            style={{
                              color: conf.color,
                              fontWeight: "bold",
                              fontSize: 10,
                            }}
                          >
                            {st}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.subHeader}>
                        <Ionicons
                          name="document-text-outline"
                          size={14}
                          color="#666"
                        />
                        <Text style={styles.subText} numberOfLines={1}>
                          Order: {item.order_number || "-"}
                        </Text>
                      </View>
                      <View style={styles.footer}>
                        {parseFloat(item.total_sales) > 0 && (
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: "bold",
                              color: "#059669",
                            }}
                          >
                            +{parseFloat(item.total_sales).toLocaleString()}
                          </Text>
                        )}
                        {parseFloat(item.total_expense) > 0 && (
                          <Text style={styles.price}>
                            -{parseFloat(item.total_expense).toLocaleString()}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              }}
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

      {/* Date Picker Modal */}
      {showDatePicker && (
        <Modal transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.datePickerContent}>
              <View style={styles.calHeader}>
                <TouchableOpacity onPress={() => changeMonth(-1)}>
                  <Ionicons name="chevron-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.calTitle}>
                  {TH_MONTHS_FULL[pickerDate.getMonth()]}{" "}
                  {pickerDate.getFullYear() + 543}
                </Text>
                <TouchableOpacity onPress={() => changeMonth(1)}>
                  <Ionicons name="chevron-forward" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 15 }}>{renderCalendar()}</View>
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={styles.closeBtn}
              >
                <Text style={{ color: "#666" }}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

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
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginBottom: 15,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: "#666" }}>
                      วันที่: {formatDate(selectedItem.report_date)}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#666" }}>
                      ผู้ทำรายการ: {selectedItem.reporter_name}
                    </Text>
                  </View>
                  {renderShopDetails(
                    selectedItem.item_details,
                    selectedItem.tax_invoice_status,
                    selectedItem.platform_files,
                  )}
                  {renderExpenses(
                    selectedItem.expense_list,
                    selectedItem.expense_files,
                  )}
                  <View style={{ marginVertical: 10 }}>
                    {/* ... Note and Problem sections ... */}
                    {/* Simplified for brevity as they are just text displays */}
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
                          +
                          {parseFloat(
                            selectedItem.total_sales,
                          ).toLocaleString()}{" "}
                          ฿
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fd" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#eee",
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
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#1e293b", flex: 1 },
  filterBtn: {
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
    padding: 15,
    margin: 15,
    borderRadius: 16,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  dateInput: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
  },
  filterActions: { flexDirection: "row", gap: 10 },
  searchBtn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: ACTIVE_COLOR,
    padding: 12,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  resetBtn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    padding: 12,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  // KPI
  kpiContainer: { paddingHorizontal: 15, marginTop: 5 },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 15 },
  kpiWrapper: { flex: 1 },
  kpiCard: {
    padding: 15,
    borderRadius: 15,
    height: 80,
    justifyContent: "space-between",
    elevation: 3,
  },
  kpiHeader: { flexDirection: "row", justifyContent: "space-between" },
  kpiLabel: { color: "white", fontSize: 12, fontWeight: "bold", opacity: 0.9 },
  kpiValue: { color: "white", fontSize: 18, fontWeight: "bold" },

  // Status Scroll
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  statusCard: {
    width: "30%",
    flexGrow: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },

  // List Card
  sectionHeader: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#fff",
    marginBottom: 12,
    borderRadius: 12,
    padding: 15,
    borderLeftWidth: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  title: { fontSize: 16, fontWeight: "bold", color: "#1e293b" },
  date: { fontSize: 11, color: "#888" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  subHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  subText: { fontSize: 13, color: "#666", marginLeft: 5 },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
  },
  price: { fontSize: 14, fontWeight: "bold", color: "#ef4444" },
  emptyState: { alignItems: "center", marginTop: 50 },

  // Modals & Calendar (Keeping existing styles)
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  datePickerContent: {
    backgroundColor: "white",
    margin: 20,
    borderRadius: 15,
    overflow: "hidden",
    width: 320,
    alignSelf: "center",
  },
  calHeader: {
    backgroundColor: ACTIVE_COLOR,
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calTitle: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calDay: {
    width: "14.28%",
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  calDayText: { color: "#333" },
  calDaySelected: { backgroundColor: ACTIVE_COLOR, borderRadius: 20 },
  calDayTextSelected: { color: "#fff", fontWeight: "bold" },
  calDayEmpty: { width: "14.28%", height: 40 },
  closeBtn: {
    padding: 15,
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#eee",
  },

  // Detail Modal
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
    maxHeight: "90%",
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  detailTitle: { fontSize: 20, fontWeight: "bold", color: "#333" },

  // Shop & Expense Cards
  shopCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 20,
    overflow: "hidden",
  },
  shopHeader: {
    padding: 15,
    backgroundColor: "#f1f5f9",
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
  },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  shopTable: { paddingVertical: 5 },
  shopTableRow: {
    flexDirection: "row",
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
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

  expCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fca5a5",
    overflow: "hidden",
    marginBottom: 20,
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

  slipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
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
  summaryBox: {
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 20,
    borderTopWidth: 4,
    borderTopColor: ACTIVE_COLOR,
  },

  // ✅ New Chart/Platform Card Styles
  chartCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  chartHeader: {
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 10,
  },
  chartTitle: { fontSize: 16, fontWeight: "bold", color: "#1e293b" },
  chartSub: { fontSize: 12, color: "#94a3b8" },
  pfGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pfCard: {
    width: "48%",
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
    height: 70,
  },
  pfName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 2,
  },
  pfValue: { fontSize: 15, fontWeight: "800", color: "#1e293b" },
  pfLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#fff",
  },
});
