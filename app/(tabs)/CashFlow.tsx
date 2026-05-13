import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BarChart } from "react-native-chart-kit";

import { API_BASE } from "../../constants/config";

// 🎨 Palette สี
const COLORS = {
  primary: "#4e54c8",
  primaryGradient: ["#4e54c8", "#8f94fb"] as const,
  success: "#00b894",
  danger: "#ff7675",
  info: "#0984e3",
  bg: "#f1f2f6",
  card: "#ffffff",
  textMain: "#2d3436",
};

const screenWidth = Dimensions.get("window").width;
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

export default function CashFlowScreen() {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, diff: 0 });
  const [companyStats, setCompanyStats] = useState<any[]>([]);

  const [chartMainMode, setChartMainMode] = useState<"total" | "company">(
    "company",
  );
  const [chartSubMode, setChartSubMode] = useState<
    "income" | "expense" | "diff"
  >("income");

  // Filter States
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [isFilterApplied, setIsFilterApplied] = useState(false);

  // Custom Date Picker States
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateMode, setDateMode] = useState<"start" | "end">("start");
  const [pickerDate, setPickerDate] = useState(new Date());
  const [pickerView, setPickerView] = useState<"day" | "month" | "year">("day");

  // --- Helpers ---
  const getBaseUrl = () => {
    let url = API_BASE.replace("/api_mobile.php", "").replace(
      "api_mobile.php",
      "",
    );
    if (!url.endsWith("/")) url += "/";
    return url;
  };

  const getLogoUrl = (filename: string) =>
    `${getBaseUrl()}uploads/logos/${filename}`;

  const fetchData = async (startStr = "", endStr = "") => {
    setLoading(true);
    try {
      let url = `${API_BASE}/api_mobile.php?action=get_cashflow`;
      if (startStr && endStr)
        url += `&start_date=${startStr}&end_date=${endStr}`;

      const res = await axios.get(url);
      if (res.data.status === "success") {
        setTransactions(res.data.history);
        setSummary(res.data.summary);
        setCompanyStats(res.data.company_stats || []);
        setIsFilterApplied(res.data.filter.is_filtered);
      }
    } catch (error) {
      console.log("Fetch Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  const formatDateForApi = (date: Date) => date.toISOString().split("T")[0];

  const onRefresh = () => {
    setRefreshing(true);
    const startStr = startDate ? formatDateForApi(startDate) : "";
    const endStr = endDate ? formatDateForApi(endDate) : "";
    fetchData(startStr, endStr);
  };

  const handleSearch = () => {
    const start = startDate ? formatDateForApi(startDate) : "";
    const end = endDate ? formatDateForApi(endDate) : "";
    fetchData(start, end);
  };

  const handleClearFilter = () => {
    setStartDate(null);
    setEndDate(null);
    fetchData();
  };

  const handleShowAll = () => {
    setStartDate(null);
    setEndDate(null);
    fetchData("", "");
  };

  const formatDateThai = (dateString: string | Date) => {
    if (!dateString) return "-";
    const date =
      typeof dateString === "string" ? new Date(dateString) : dateString;
    if (isNaN(date.getTime())) return "-";
    return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
  };

  const formatNumber = (num: any) =>
    parseFloat(num).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // --- Custom Date Picker Logic ---
  const openCustomDatePicker = (mode: "start" | "end") => {
    setDateMode(mode);
    const targetDate = mode === "start" ? startDate : endDate;
    setPickerDate(targetDate ? new Date(targetDate) : new Date());
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
      const isSelected = !!(
        currentCheck &&
        currentCheck.getDate() === i &&
        currentCheck.getMonth() === month &&
        currentCheck.getFullYear() === year
      );
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
                color: COLORS.primary,
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

  const renderMonthSelector = () => (
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
                color: COLORS.primary,
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

  const getChartConfig = () => {
    let baseColor = COLORS.primary;
    if (chartMainMode === "company") {
      if (chartSubMode === "income") baseColor = COLORS.success;
      if (chartSubMode === "expense") baseColor = COLORS.danger;
      if (chartSubMode === "diff") baseColor = COLORS.info;
    }
    return {
      backgroundColor: "#ffffff",
      backgroundGradientFrom: "#ffffff",
      backgroundGradientTo: "#ffffff",
      decimalPlaces: 0,
      fillShadowGradient: baseColor,
      fillShadowGradientOpacity: 0.85,
      color: (opacity = 1) => baseColor,
      labelColor: (opacity = 1) => `rgba(45, 52, 54, ${opacity})`,
      barPercentage: 0.65,
      propsForBackgroundLines: { strokeDasharray: "", stroke: "#f0f0f0" },
      propsForLabels: { fontSize: 11, fontWeight: "bold" },
    };
  };

  const getChartData = () => {
    if (chartMainMode === "total") {
      return {
        labels: ["รายรับ", "รายจ่าย", "ส่วนต่าง"],
        datasets: [
          {
            data: [
              parseFloat(summary.income as any),
              parseFloat(summary.expense as any),
              parseFloat(summary.diff as any),
            ],
            colors: [
              (opacity = 1) => COLORS.success,
              (opacity = 1) => COLORS.danger,
              (opacity = 1) => COLORS.info,
            ],
          },
        ],
      };
    } else {
      if (companyStats.length === 0)
        return { labels: ["ว่าง"], datasets: [{ data: [0] }] };
      const topCompanies = companyStats.slice(0, 4);
      const labels = topCompanies.map((item) => item.short_name);
      const data = topCompanies.map((item) => {
        if (chartSubMode === "income") return parseFloat(item.total_in);
        if (chartSubMode === "expense") return parseFloat(item.total_out);
        return parseFloat(item.diff);
      });
      return { labels, datasets: [{ data }] };
    }
  };

  const renderHeader = () => (
    <View style={{ paddingBottom: 10 }}>
      <View style={styles.filterCard}>
        <View style={styles.filterHeader}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={styles.iconCircle}>
              <Ionicons name="calendar" size={16} color={COLORS.primary} />
            </View>
            <Text style={styles.filterTitle}>ช่วงเวลาข้อมูล (พ.ศ.)</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={handleShowAll}
              style={[
                styles.resetBadge,
                { backgroundColor: COLORS.primary + "15" },
              ]}
            >
              <Text
                style={[
                  styles.resetText,
                  { color: COLORS.primary, fontWeight: "bold" },
                ]}
              >
                ดูทั้งหมด
              </Text>
            </TouchableOpacity>
            {isFilterApplied && (
              <TouchableOpacity
                onPress={handleClearFilter}
                style={styles.resetBadge}
              >
                <Text style={styles.resetText}>ล้างค่า</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.filterBody}>
          <TouchableOpacity
            onPress={() => openCustomDatePicker("start")}
            style={styles.dateBox}
          >
            <Text style={styles.dateLabel}>เริ่มต้น</Text>
            <Text style={styles.dateValue}>
              {startDate ? formatDateThai(startDate) : "ทั้งหมด"}
            </Text>
          </TouchableOpacity>
          <View style={styles.filterArrow}>
            <Ionicons name="arrow-forward" size={16} color="#ccc" />
          </View>
          <TouchableOpacity
            onPress={() => openCustomDatePicker("end")}
            style={styles.dateBox}
          >
            <Text style={styles.dateLabel}>สิ้นสุด</Text>
            <Text style={styles.dateValue}>
              {endDate ? formatDateThai(endDate) : "ทั้งหมด"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
            <Ionicons name="search" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>สรุปยอดรายบริษัท</Text>
      </View>
      <FlatList
        horizontal
        data={companyStats}
        keyExtractor={(item) => item.company}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 15, paddingBottom: 10 }}
        renderItem={({ item }) => (
          <LinearGradient
            colors={["#ffffff", "#fcfcfc"]}
            style={styles.compCard}
          >
            <View style={styles.compHeader}>
              <View style={styles.logoContainer}>
                {item.logo_file ? (
                  <Image
                    source={{ uri: getLogoUrl(item.logo_file) }}
                    style={styles.logoImage}
                  />
                ) : (
                  <MaterialCommunityIcons
                    name="office-building"
                    size={20}
                    color={COLORS.primary}
                  />
                )}
              </View>
              <Text style={styles.compName} numberOfLines={2}>
                {item.company}
              </Text>
            </View>
            <View style={styles.compDivider} />
            <View style={styles.compStats}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>รับ</Text>
                <Text style={[styles.statValue, { color: COLORS.success }]}>
                  +{formatNumber(item.total_in)}
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>จ่าย</Text>
                <Text style={[styles.statValue, { color: COLORS.danger }]}>
                  -{formatNumber(item.total_out)}
                </Text>
              </View>
              <View style={[styles.statRow, { marginTop: 6 }]}>
                <Text style={styles.statLabel}>ส่วนต่าง</Text>
                <Text
                  style={[
                    styles.statValue,
                    {
                      color: item.diff >= 0 ? COLORS.info : COLORS.danger,
                      fontWeight: "800",
                    },
                  ]}
                >
                  {formatNumber(item.diff)}
                </Text>
              </View>
            </View>
          </LinearGradient>
        )}
        ListEmptyComponent={
          <Text style={{ marginLeft: 20, color: "#999" }}>ไม่มีข้อมูล</Text>
        }
      />

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>สถิติเปรียบเทียบ</Text>
          <View style={styles.pillContainer}>
            <TouchableOpacity
              style={[
                styles.pillBtn,
                chartMainMode === "company" && styles.pillActive,
              ]}
              onPress={() => setChartMainMode("company")}
            >
              <Text
                style={[
                  styles.pillText,
                  chartMainMode === "company" && styles.pillTextActive,
                ]}
              >
                บริษัท
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.pillBtn,
                chartMainMode === "total" && styles.pillActive,
              ]}
              onPress={() => setChartMainMode("total")}
            >
              <Text
                style={[
                  styles.pillText,
                  chartMainMode === "total" && styles.pillTextActive,
                ]}
              >
                ภาพรวม
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {chartMainMode === "company" && (
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                chartSubMode === "income" && {
                  borderBottomColor: COLORS.success,
                },
              ]}
              onPress={() => setChartSubMode("income")}
            >
              <Text
                style={[
                  styles.tabText,
                  chartSubMode === "income" && { color: COLORS.success },
                ]}
              >
                รายรับ
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                chartSubMode === "expense" && {
                  borderBottomColor: COLORS.danger,
                },
              ]}
              onPress={() => setChartSubMode("expense")}
            >
              <Text
                style={[
                  styles.tabText,
                  chartSubMode === "expense" && { color: COLORS.danger },
                ]}
              >
                รายจ่าย
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                chartSubMode === "diff" && { borderBottomColor: COLORS.info },
              ]}
              onPress={() => setChartSubMode("diff")}
            >
              <Text
                style={[
                  styles.tabText,
                  chartSubMode === "diff" && { color: COLORS.info },
                ]}
              >
                ส่วนต่าง
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {(chartMainMode === "company" && companyStats.length > 0) ||
        chartMainMode === "total" ? (
          <BarChart
            data={getChartData()}
            width={screenWidth - 40}
            height={240}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={getChartConfig()}
            style={{ marginVertical: 8, borderRadius: 16 }}
            fromZero={true}
            showValuesOnTopOfBars={true}
            withInnerLines={true}
            flatColor={true}
            withCustomBarColorFromData={chartMainMode === "total"}
          />
        ) : (
          <View style={styles.noChartData}>
            <Text style={{ color: "#999" }}>ไม่มีข้อมูลกราฟ</Text>
          </View>
        )}
      </View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>รายการล่าสุด</Text>
      </View>
    </View>
  );

  const renderItem = ({ item }: any) => {
    const isIncome = item.type === "Income";
    return (
      <View style={styles.cardItem}>
        <View
          style={[
            styles.cardLeftLine,
            { backgroundColor: isIncome ? COLORS.success : COLORS.danger },
          ]}
        />
        <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.company}
            </Text>
            <Text
              style={[
                styles.itemAmount,
                { color: isIncome ? COLORS.success : COLORS.danger },
              ]}
            >
              {isIncome ? "+" : "-"} {formatNumber(item.amount)}
            </Text>
          </View>
          <View style={styles.cardSubRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="calendar-outline" size={12} color="#999" />
              <Text style={styles.itemDate}>
                {" "}
                {formatDateThai(item.trans_date)}
              </Text>
            </View>
          </View>
          {item.description ? (
            <Text style={styles.itemDesc} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={COLORS.primaryGradient} style={styles.headerBg}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>บัญชีรับ-จ่าย</Text>
            <Text style={styles.headerSubtitle}>
              {startDate && endDate
                ? `${formatDateThai(startDate)} - ${formatDateThai(endDate)}`
                : "ภาพรวมทั้งหมด (ไม่จำกัดวันที่)"}
            </Text>
          </View>
          <View style={styles.summaryContainer}>
            <View style={styles.summaryBox}>
              <Text style={styles.sumLabel}>รายรับ</Text>
              <Text style={[styles.sumValue, { color: COLORS.success }]}>
                +{formatNumber(summary.income)}
              </Text>
            </View>
            <View style={styles.verticalLine} />
            <View style={styles.summaryBox}>
              <Text style={styles.sumLabel}>รายจ่าย</Text>
              <Text style={[styles.sumValue, { color: COLORS.danger }]}>
                -{formatNumber(summary.expense)}
              </Text>
            </View>
            <View style={styles.verticalLine} />
            <View style={styles.summaryBox}>
              <Text style={styles.sumLabel}>ส่วนต่าง</Text>
              <Text
                style={[
                  styles.sumValue,
                  { color: summary.diff >= 0 ? COLORS.info : COLORS.danger },
                ]}
              >
                {formatNumber(summary.diff)}
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View style={styles.body}>
        {loading && !refreshing ? (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 50 }}
          />
        ) : (
          <FlatList
            data={transactions}
            renderItem={renderItem}
            keyExtractor={(item, index) =>
              item.id ? item.id.toString() : index.toString()
            }
            ListHeaderComponent={renderHeader}
            contentContainerStyle={{ paddingBottom: 50, paddingTop: 60 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyView}>
                <Ionicons name="wallet-outline" size={60} color="#ddd" />
                <Text style={{ color: "#aaa", marginTop: 10 }}>
                  ไม่พบรายการ
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* ✅ Custom ปฏิทินภาษาไทย (พ.ศ.) */}
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
              <Text style={{ color: COLORS.primary, fontWeight: "bold" }}>
                ปิด
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerBg: {
    paddingBottom: 60,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerContent: { paddingHorizontal: 20, marginTop: 15, alignItems: "center" },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: "white" },
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginTop: 4,
  },
  summaryContainer: {
    flexDirection: "row",
    backgroundColor: "white",
    marginHorizontal: 15,
    borderRadius: 20,
    paddingVertical: 15,
    position: "absolute",
    bottom: -40,
    left: 0,
    right: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  summaryBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  verticalLine: { width: 1, backgroundColor: "#eee", height: "60%" },
  sumLabel: { fontSize: 11, color: "#888", marginBottom: 2 },
  sumValue: { fontSize: 13, fontWeight: "bold" },
  body: { flex: 1 },
  filterCard: {
    backgroundColor: "white",
    marginHorizontal: 15,
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    marginTop: 10,
  },
  filterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  filterTitle: { fontSize: 14, fontWeight: "bold", color: COLORS.textMain },
  resetBadge: {
    backgroundColor: "#f1f2f6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  resetText: { fontSize: 10, color: "#666" },
  filterBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateBox: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },
  dateLabel: { fontSize: 10, color: "#999" },
  dateValue: { fontSize: 13, fontWeight: "600", color: COLORS.textMain },
  filterArrow: { paddingHorizontal: 5 },
  searchBtn: {
    backgroundColor: COLORS.primary,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: { marginHorizontal: 20, marginBottom: 10, marginTop: 5 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: COLORS.textMain },
  compCard: {
    width: 200,
    borderRadius: 18,
    padding: 15,
    marginHorizontal: 6,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#fff",
  },
  compHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  logoContainer: {
    width: 36,
    height: 36,
    backgroundColor: "#fff",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#eee",
  },
  logoImage: { width: "80%", height: "80%", resizeMode: "contain" },
  compName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.textMain,
  },
  compDivider: { height: 1, backgroundColor: "#f0f0f0", marginBottom: 10 },
  compStats: { gap: 6 },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statLabel: { fontSize: 11, color: "#888" },
  statValue: { fontSize: 12, fontWeight: "bold" },
  chartCard: {
    backgroundColor: "white",
    marginHorizontal: 15,
    borderRadius: 20,
    padding: 15,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  chartTitle: { fontSize: 16, fontWeight: "bold", color: COLORS.textMain },
  pillContainer: {
    flexDirection: "row",
    backgroundColor: "#f1f2f6",
    borderRadius: 20,
    padding: 3,
  },
  pillBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 18 },
  pillActive: {
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  pillText: { fontSize: 11, color: "#888", fontWeight: "600" },
  pillTextActive: { color: COLORS.primary },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  tabBtn: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: { fontSize: 12, color: "#999", fontWeight: "500" },
  noChartData: { height: 200, justifyContent: "center", alignItems: "center" },
  cardItem: {
    flexDirection: "row",
    backgroundColor: "white",
    marginHorizontal: 15,
    marginBottom: 12,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLeftLine: { width: 5 },
  cardContent: { flex: 1, padding: 12 },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.textMain,
    flex: 1,
    marginRight: 10,
  },
  itemAmount: { fontSize: 14, fontWeight: "bold" },
  cardSubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemDate: { fontSize: 11, color: "#999" },
  itemDesc: { fontSize: 11, color: "#aaa", marginTop: 4 },
  emptyView: { alignItems: "center", marginTop: 50 },

  // Styles สำหรับปฏิทิน Custom
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    elevation: 5,
  },
  calHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: COLORS.primary,
  },
  calTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  calNavBtn: { padding: 5 },
  calWeekRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 5,
  },
  calWeekText: { color: "#666", fontSize: 12, width: 35, textAlign: "center" },
  calGrid: { flexDirection: "row", flexWrap: "wrap", width: "100%" },
  calDay: {
    width: "14.28%",
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 2,
  },
  calDayEmpty: { width: "14.28%", height: 40 },
  calDaySelected: { backgroundColor: COLORS.primary, borderRadius: 20 },
  calDayText: { fontSize: 16, color: "#2d3436" },
  calDayTextSelected: { color: "#ffffff", fontWeight: "bold" },
  calCloseBtn: {
    alignSelf: "center",
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    width: "100%",
    alignItems: "center",
  },
  yearGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    padding: 10,
  },
  yearItem: {
    width: "30%",
    paddingVertical: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  yearText: { fontSize: 15, color: "#2d3436" },
});
