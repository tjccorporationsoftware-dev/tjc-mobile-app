import {
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
import { useAuth } from "../_layout";

const ACTIVE_COLOR = "#059669"; // สีเขียว Purchase
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

export default function HistoryPurchase() {
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
        // 1. กรองเอาเฉพาะ Purchase
        const purchaseData = res.data.history.filter(
          (item: any) => item.source_type === "purchase",
        );

        // ✅ 2. เพิ่มบรรทัดนี้: เรียงวันที่จาก น้อย -> มาก (เก่า -> ใหม่)
        purchaseData.sort(
          (a: any, b: any) =>
            new Date(a.report_date).getTime() -
            new Date(b.report_date).getTime(),
        );

        setRawData(purchaseData);
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
    fetchHistory();
  }, [startDate, endDate]);

  // --- Calculate Summary & Filter List ---
  const { filteredList, summary, statusBreakdown } = useMemo(() => {
    let list = rawData;

    // 1. Filter Status
    if (filterStatus !== "ทั้งหมด") {
      list = list.filter((item) => {
        const st = item.tax_invoice_status || item.job_status || "";
        return st.includes(filterStatus);
      });
    }

    // 2. Calculate KPI
    const totalCount = list.length;
    // Purchase เน้นยอดค่าใช้จ่าย (Expense)
    const totalExpense = list.reduce(
      (sum, item) => sum + (parseFloat(item.total_expense) || 0),
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

    return {
      filteredList: list,
      summary: { total: totalCount, expense: totalExpense },
      statusBreakdown: breakdown,
    };
  }, [rawData, filterStatus]);

  // --- Helper Functions ---
  const getStatusConfig = (st: string) => {
    st = (st || "").trim();
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
      : `${IMG_BASE_URL.replace(/\/$/, "")}/uploads/${filename.trim()}`;
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

  // --- Render Product Details (from Manager) ---
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
            <Text style={styles.kpiLabel}>{label}</Text>
            <Ionicons name={icon} size={18} color="rgba(255,255,255,0.8)" />
          </View>
          <Text style={styles.kpiValue}>{value}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );

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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📊 ประวัติฝ่ายจัดซื้อ</Text>
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
                  ดูทั้งหมด
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
              colors={[ACTIVE_COLOR, ACTIVE_COLOR + "99"]}
              delay={0}
              onPress={() => setFilterStatus("ทั้งหมด")}
            />
            <KPICard
              label="ค่าใช้จ่ายรวม"
              value={`฿${(summary.expense / 1000).toFixed(1)}k`}
              icon="wallet"
              colors={["#e74c3c", "#c0392b"]}
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
                        <View
                          style={{
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                          }}
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
                          <View style={{ marginLeft: 10 }}>
                            <Text style={styles.cardTitle}>
                              {item.supplier_name || "ไม่ระบุร้าน"}
                            </Text>
                            <Text style={styles.dateText}>
                              {formatDate(item.report_date)}
                            </Text>
                          </View>
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
                      <View style={styles.cardBody}>
                        <View
                          style={{ flexDirection: "row", alignItems: "center" }}
                        >
                          <Ionicons
                            name="construct"
                            size={16}
                            color="#666"
                            style={{ marginRight: 6 }}
                          />
                          <Text style={styles.cardSubtitle} numberOfLines={1}>
                            {item.project_name || "-"}
                          </Text>
                        </View>
                        <View style={{ marginTop: 8, alignItems: "flex-end" }}>
                          {item.total_expense > 0 && (
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "bold",
                                color: "#ef4444",
                              }}
                            >
                              -฿{parseInt(item.total_expense).toLocaleString()}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.cardFooter}>
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedItem(item);
                            setModalVisible(true);
                          }}
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
                <TouchableOpacity
                  onPress={() =>
                    setPickerDate(
                      new Date(
                        pickerDate.getFullYear(),
                        pickerDate.getMonth() - 1,
                        1,
                      ),
                    )
                  }
                >
                  <Ionicons name="chevron-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.calTitle}>
                  {TH_MONTHS_FULL[pickerDate.getMonth()]}{" "}
                  {pickerDate.getFullYear() + 543}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setPickerDate(
                      new Date(
                        pickerDate.getFullYear(),
                        pickerDate.getMonth() + 1,
                        1,
                      ),
                    )
                  }
                >
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

                  {/* Expense Summary */}
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

                  {/* Evidence */}
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
                              label={`รูป ${idx + 1}`}
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

  // Filter
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
  cardTitle: { fontSize: 14, fontWeight: "bold", color: "#333" },
  dateText: { fontSize: 11, color: "#888" },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
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

  // Modals & Calendar
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
  imgHeader: { fontSize: 15, fontWeight: "bold", color: "#333", marginTop: 10 },

  // Products
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

  // Cost
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
});
