import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import axios from "axios";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";

// Config
import { API_BASE, IMG_BASE_URL } from "../../constants/config";
import { useAuth } from "../_layout";

const COLORS = {
  light: {
    bg: "#f1f5f9",
    bgSecondary: "#f8fafc",
    card: "#fff",
    text: "#1e293b",
    textSecondary: "#64748b",
    border: "#e2e8f0",
    primary: "#3b82f6",
    success: "#16a34a",
    warning: "#f59e0b",
    error: "#dc2626",
    overlay: "rgba(0,0,0,0.5)",
    dateBadge: "#3b82f6",
    dateLine: "#e2e8f0",
  },
  dark: {
    bg: "#0f172a",
    bgSecondary: "#1e293b",
    card: "#1e293b",
    text: "#f1f5f9",
    textSecondary: "#cbd5e1",
    border: "#334155",
    primary: "#60a5fa",
    success: "#22c55e",
    warning: "#fbbf24",
    error: "#ef4444",
    overlay: "rgba(0,0,0,0.7)",
    dateBadge: "#60a5fa",
    dateLine: "#334155",
  },
};

export default function FmDashboard() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;

  const dynamicStyles = useMemo(() => getStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"daily" | "monthly" | "yearly">(
    "daily",
  );
  const [displayMode, setDisplayMode] = useState<"stats" | "drivers">("stats");
  const [filterCategory, setFilterCategory] = useState<
    "all" | "employee" | "partner"
  >("all");
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showChartModal, setShowChartModal] = useState(false);
  const [chartYear, setChartYear] = useState<number>(new Date().getFullYear());
  const [expandedDrivers, setExpandedDrivers] = useState<number[]>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [rawData, setRawData] = useState({
    drivers: [],
    vehicles: [],
    jobs: [],
    maintenance: [],
    fuel: [],
    accommodation: [],
  });

  const apiParam = useMemo(() => {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, "0");
    const d = date.getDate().toString().padStart(2, "0");
    if (viewMode === "daily") return `${y}-${m}-${d}`;
    if (viewMode === "monthly") return `${y}-${m}`;
    return `${y}`;
  }, [date, viewMode]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/api_fm.php`, {
        params: { action: "fetch_dashboard", month: apiParam },
      });
      if (response.data) setRawData(response.data);
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [apiParam, viewMode]);

  const toggleDriver = (id: number) => {
    setExpandedDrivers((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  // ✅ แก้ไข: คืนค่าเป็น string เสมอ (ถ้าไม่มีรูปคืนค่าว่าง '')
  const getProofImageUrl = (filename: string | null): string => {
    if (!filename || filename === "null" || filename === "") return "";

    if (filename.startsWith("http")) return filename;

    let baseUrl = IMG_BASE_URL.replace(/\/uploads\/?$/, "");
    baseUrl = baseUrl.replace(/\/$/, "");

    let cleanName = filename.replace(/^uploads\/proofs\//, "");
    cleanName = cleanName.replace(/^\//, "");

    return `${baseUrl}/uploads/proofs/${cleanName}`;
  };
  // --- [จุดที่ 1] เพิ่มฟังก์ชัน Helper ตรงนี้ ---

  // 1. ฟังก์ชันหาชื่อผู้ช่วยจาก ID
  const getAssistantName = (id: any) => {
    if (!id || id == 0) return "-";
    // ค้นหาใน drivers ที่โหลดมาแล้ว
    const assistant: any = rawData.drivers.find((d: any) => d.id == id);
    return assistant ? assistant.name : "ไม่ระบุ";
  };

  // 2. ฟังก์ชันจัดรูปแบบวันที่และเวลา (เช่น 12 ส.ค. 08:30 น.)
  const formatDateTime = (dateString: any) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    const months = [
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
    return `${d.getDate()} ${months[d.getMonth()]} ${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`;
  };

  const generateChartData = async (year: number) => {
    try {
      const data = [];
      const monthNames = [
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
      for (let i = 0; i < 12; i++) {
        const m = (i + 1).toString().padStart(2, "0");
        const monthParam = `${year}-${m}`;
        try {
          const response = await axios.get(`${API_BASE}/api_fm.php`, {
            params: { action: "fetch_dashboard", month: monthParam },
          });
          if (response.data) {
            const jobs = response.data.jobs || [];
            const maintenance = response.data.maintenance || [];
            const fuel = response.data.fuel || [];
            const accommodation = response.data.accommodation || [];
            const repairCost = maintenance.reduce(
              (sum: number, m: any) => sum + (parseFloat(m.cost) || 0),
              0,
            );
            const fuelCost = fuel.reduce(
              (sum: number, f: any) => sum + (parseFloat(f.amount) || 0),
              0,
            );
            const roomCost = accommodation.reduce(
              (sum: number, a: any) => sum + (parseFloat(a.amount) || 0),
              0,
            );
            let jobExpense = 0;
            jobs.forEach((j: any) => {
              jobExpense += parseFloat(j.cost) || 0;
            });
            data.push({
              month: monthNames[i],
              expense: jobExpense + repairCost + fuelCost + roomCost,
              monthNum: i + 1,
            });
          }
        } catch (error) {
          data.push({ month: monthNames[i], expense: 0, monthNum: i + 1 });
        }
      }
      setChartData(data);
      setChartYear(year);
      setShowChartModal(true);
    } catch (error) {
      console.error(error);
    }
  };

  const stats = useMemo(() => {
    const jobs = rawData.jobs || [];
    const repair = rawData.maintenance.reduce(
      (sum: number, m: any) => sum + (parseFloat(m.cost) || 0),
      0,
    );
    const fuel = rawData.fuel.reduce(
      (sum: number, f: any) => sum + (parseFloat(f.amount) || 0),
      0,
    );
    const room = rawData.accommodation.reduce(
      (sum: number, a: any) => sum + (parseFloat(a.amount) || 0),
      0,
    );
    let totalIncome = 0;
    let totalJobExpense = 0;
    const processedGroups = new Set();

    const filteredJobs = jobs.filter((j: any) => {
      if (filterCategory === "all") return true;
      const driver = rawData.drivers.find(
        (d: any) => d.id == j.driver_id,
      ) as any;
      if (!driver) return false;
      return filterCategory === "partner"
        ? driver.category === "partner"
        : driver.category !== "partner";
    });

    filteredJobs.forEach((j: any) => {
      if (!j.group_id || j.group_id == 0)
        totalIncome += parseFloat(j.actual_price) || 0;
      else if (j.group_total_price && !processedGroups.has(j.group_id)) {
        if (j.group_type === "income")
          totalIncome += parseFloat(j.group_total_price);
        else totalJobExpense += parseFloat(j.group_total_price);
        processedGroups.add(j.group_id);
      }
      totalJobExpense += parseFloat(j.cost) || 0;
    });

    return {
      totalVeh: rawData.vehicles.length,
      availableVeh: rawData.vehicles.filter(
        (v: any) => v.status === "available",
      ).length,
      maintenanceVeh: rawData.vehicles.filter(
        (v: any) => v.status === "maintenance",
      ).length,
      totalJobs: filteredJobs.length,
      completedJobs: filteredJobs.filter((j: any) => j.status === "completed")
        .length,
      failedJobs: filteredJobs.filter((j: any) =>
        ["failed", "canceled", "pending"].includes(j.status),
      ).length,
      income: totalIncome,
      netTransport: totalIncome - totalJobExpense,
      totalExpense: totalJobExpense + repair + fuel + room,
      repair,
      fuel,
      room,
      jobExpense: totalJobExpense,
      filteredJobs,
    };
  }, [rawData, filterCategory]);

  return (
    <View style={[dynamicStyles.container, { backgroundColor: colors.bg }]}>
      {/* Header Area */}
      <View
        style={[
          dynamicStyles.headerArea,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={dynamicStyles.headerTop}>
          <Text style={[dynamicStyles.headerTitle, { color: colors.text }]}>
            📊 แผงควบคุมหลัก
          </Text>
          {/* ✅ แก้ไข: ใช้ Style headerSubtitle ที่เพิ่มมาใหม่ */}
          <Text
            style={[
              dynamicStyles.headerSubtitle,
              { color: colors.textSecondary },
            ]}
          >
            {viewMode === "daily"
              ? `วันที่ ${date.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}`
              : viewMode === "monthly"
                ? `เดือน ${date.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}`
                : `ปี ${date.getFullYear() + 543}`}
          </Text>
        </View>

        <View style={dynamicStyles.controlRow}>
          <View
            style={[
              dynamicStyles.toggleGroup,
              { backgroundColor: colors.bgSecondary },
            ]}
          >
            {["daily", "monthly", "yearly"].map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setViewMode(m as any)}
                style={[
                  dynamicStyles.toggleBtn,
                  viewMode === m && [
                    dynamicStyles.toggleBtnActive,
                    { backgroundColor: colors.primary },
                  ],
                ]}
              >
                <Text
                  style={[
                    dynamicStyles.toggleText,
                    viewMode === m && dynamicStyles.toggleTextActive,
                    viewMode !== m && { color: colors.textSecondary },
                  ]}
                >
                  {m === "daily" ? "วัน" : m === "monthly" ? "เดือน" : "ปี"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[
              dynamicStyles.dateBtn,
              {
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={colors.primary}
            />
          </TouchableOpacity>
        </View>

        <View style={dynamicStyles.modeToggleArea}>
          {["stats", "drivers"].map((m) => (
            <TouchableOpacity
              key={m}
              style={[
                dynamicStyles.modeTab,
                displayMode === m && [
                  dynamicStyles.modeTabActive,
                  {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  },
                ],
                displayMode !== m && {
                  backgroundColor: colors.bgSecondary,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => setDisplayMode(m as any)}
            >
              <Text
                style={[
                  dynamicStyles.modeTabText,
                  displayMode === m && dynamicStyles.modeTabTextActive,
                  displayMode !== m && { color: colors.textSecondary },
                ]}
              >
                {m === "stats" ? "📊 สรุป" : "👥 คนขับ"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={fetchData}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={dynamicStyles.scrollContent}
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: 50 }}
          />
        ) : displayMode === "stats" ? (
          <View>
            <View style={dynamicStyles.statGrid}>
              <View style={{ flex: 1, gap: 10 }}>
                <StatCard
                  label="งานทั้งหมด"
                  value={stats.totalJobs}
                  icon="clipboard-list"
                  color="#3b82f6"
                  border="#3b82f6"
                  colors={colors}
                  styles={dynamicStyles}
                />
                <StatCard
                  label="ไม่สำเร็จ/รอ"
                  value={stats.failedJobs}
                  icon="alert-triangle"
                  color="#f59e0b"
                  border="#f59e0b"
                  colors={colors}
                  styles={dynamicStyles}
                />
                <StatCard
                  label="สำเร็จ"
                  value={stats.completedJobs}
                  icon="check"
                  color="#16a34a"
                  border="#16a34a"
                  colors={colors}
                  styles={dynamicStyles}
                />
                <StatCard
                  label="ค่าขนส่ง"
                  value={`฿${Math.abs(stats.netTransport).toLocaleString()}`}
                  icon="wallet"
                  color="#16a34a"
                  border="#16a34a"
                  colors={colors}
                  styles={dynamicStyles}
                  isMoney
                />
                <StatCard
                  label="ค่าที่พัก"
                  value={`฿${stats.room.toLocaleString()}`}
                  icon="bed"
                  color="#ef4444"
                  border="#ef4444"
                  colors={colors}
                  styles={dynamicStyles}
                  isMoney
                />
              </View>
              <View style={{ flex: 1, gap: 10 }}>
                <StatCard
                  label="รถทั้งหมด"
                  value={stats.totalVeh}
                  icon="truck"
                  color="#3b82f6"
                  border="#3b82f6"
                  colors={colors}
                  styles={dynamicStyles}
                />
                <StatCard
                  label="พร้อมใช้"
                  value={stats.availableVeh}
                  icon="check-circle"
                  color="#16a34a"
                  border="#16a34a"
                  colors={colors}
                  styles={dynamicStyles}
                />
                <StatCard
                  label="ซ่อม/ไม่ว่าง"
                  value={stats.maintenanceVeh}
                  icon="wrench"
                  color="#dc2626"
                  border="#dc2626"
                  colors={colors}
                  styles={dynamicStyles}
                />
                <StatCard
                  label="ค่าน้ำมัน"
                  value={`฿${stats.fuel.toLocaleString()}`}
                  icon="gas-pump"
                  color="#0284c7"
                  border="#0284c7"
                  colors={colors}
                  styles={dynamicStyles}
                  isMoney
                />
                <StatCard
                  label="ค่าซ่อมรถ"
                  value={`฿${stats.repair.toLocaleString()}`}
                  icon="tools"
                  color="#d97706"
                  border="#d97706"
                  colors={colors}
                  styles={dynamicStyles}
                  isMoney
                />
              </View>
            </View>

            <View
              style={[
                dynamicStyles.totalCard,
                { backgroundColor: colors.card, borderColor: colors.primary },
              ]}
            >
              <View
                style={[
                  dynamicStyles.totalIconBox,
                  { backgroundColor: colors.primary + "20" },
                ]}
              >
                <MaterialCommunityIcons
                  name="file-document-edit-outline"
                  size={30}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    dynamicStyles.totalLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  ค่าใช้จ่ายรวม
                </Text>
                <Text
                  style={[dynamicStyles.totalValue, { color: colors.primary }]}
                >
                  ฿{stats.totalExpense.toLocaleString()}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  dynamicStyles.chartBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() => generateChartData(new Date().getFullYear())}
              >
                <Ionicons name="bar-chart" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View
              style={[
                dynamicStyles.tableCard,
                { backgroundColor: colors.card },
              ]}
            >
              <View
                style={[
                  dynamicStyles.tableHeader,
                  {
                    backgroundColor: colors.bgSecondary,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[dynamicStyles.tableTitle, { color: colors.text }]}
                >
                  📦 งานล่าสุด
                </Text>
              </View>
              {stats.filteredJobs.length === 0 ? (
                <View style={dynamicStyles.emptyState}>
                  <Ionicons
                    name="archive-outline"
                    size={40}
                    color={colors.textSecondary}
                  />
                  <Text
                    style={[
                      dynamicStyles.emptyText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    ไม่มีงานในช่วงเวลานี้
                  </Text>
                </View>
              ) : (
                stats.filteredJobs.map((job: any, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      dynamicStyles.tableRow,
                      { borderBottomColor: colors.bgSecondary },
                    ]}
                    onPress={() => setSelectedJob(job)}
                  >
                    <View style={dynamicStyles.rowDate}>
                      <Text
                        style={[
                          dynamicStyles.txtPrimary,
                          { color: colors.text },
                        ]}
                      >
                        {job.start_time
                          ? new Date(job.start_time).toLocaleDateString(
                              "th-TH",
                              { day: "2-digit", month: "short" },
                            )
                          : "-"}
                      </Text>
                      <Text
                        style={[
                          dynamicStyles.txtSecondary,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {(job.start_time || "").substring(11, 16)}
                      </Text>
                    </View>
                    <View style={dynamicStyles.rowInfo}>
                      <Text
                        style={[
                          dynamicStyles.txtPrimary,
                          { color: colors.text },
                        ]}
                        numberOfLines={1}
                      >
                        {job.customer_name}
                      </Text>
                      <Text
                        style={[
                          dynamicStyles.txtSecondary,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {job.destination}
                      </Text>
                    </View>
                    <View style={dynamicStyles.rowStatus}>
                      <Text
                        style={[
                          dynamicStyles.statusBadge,
                          {
                            backgroundColor:
                              job.status === "completed"
                                ? isDark
                                  ? "#064e3b"
                                  : "#dcfce7"
                                : isDark
                                  ? "#0c4a6e"
                                  : "#dbeafe",
                            color:
                              job.status === "completed"
                                ? isDark
                                  ? "#86efac"
                                  : "#166534"
                                : isDark
                                  ? "#93c5fd"
                                  : "#1e40af",
                          },
                        ]}
                      >
                        {job.status === "completed" ? "สำเร็จ" : "ระหว่าง"}
                      </Text>
                      <Text
                        style={[dynamicStyles.rowCost, { color: colors.error }]}
                      >
                        -฿{parseFloat(job.cost || "0").toLocaleString()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        ) : (
          // --- Drivers Mode ---
          <View style={{ paddingBottom: 20 }}>
            <Text style={[dynamicStyles.sectionTitle, { color: colors.text }]}>
              👨‍💼 งานของคนขับ ({rawData.drivers.length})
            </Text>
            {rawData.drivers.map((driver: any) => {
              const driverJobs = rawData.jobs
                .filter((j: any) => j.driver_id == driver.id)
                .sort(
                  (a: any, b: any) =>
                    new Date(b.start_time || "").getTime() -
                    new Date(a.start_time || "").getTime(),
                );

              if (driverJobs.length === 0) return null;
              const isExpanded = expandedDrivers.includes(driver.id);

              const groupedJobs: { [key: string]: any[] } = {};
              driverJobs.forEach((job: any) => {
                if (!job.start_time) return;
                const dateObj = new Date(job.start_time);
                const dateKey = dateObj.toLocaleDateString("th-TH", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                });
                if (!groupedJobs[dateKey]) {
                  groupedJobs[dateKey] = [];
                }
                groupedJobs[dateKey].push(job);
              });

              return (
                <View
                  key={driver.id}
                  style={[
                    dynamicStyles.driverCard,
                    { backgroundColor: colors.card },
                  ]}
                >
                  <TouchableOpacity
                    style={dynamicStyles.driverHeader}
                    onPress={() => toggleDriver(driver.id)}
                  >
                    <View style={dynamicStyles.driverProfile}>
                      <View
                        style={[
                          dynamicStyles.avatar,
                          { backgroundColor: colors.primary + "20" },
                        ]}
                      >
                        <Text
                          style={[
                            dynamicStyles.avatarTxt,
                            { color: colors.primary },
                          ]}
                        >
                          {driver.name ? driver.name.charAt(0) : "?"}
                        </Text>
                      </View>
                      <View>
                        <Text
                          style={[
                            dynamicStyles.driverNameText,
                            { color: colors.text },
                          ]}
                        >
                          {driver.name}
                        </Text>
                        <Text
                          style={[
                            dynamicStyles.jobCount,
                            { color: colors.success },
                          ]}
                        >
                          {driverJobs.length} งาน
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>

                  {isExpanded && (
                    <View
                      style={[
                        dynamicStyles.driverJobsList,
                        {
                          backgroundColor: colors.bgSecondary,
                          borderTopColor: colors.border,
                        },
                      ]}
                    >
                      {Object.keys(groupedJobs).map((dateKey) => (
                        <View key={dateKey} style={dynamicStyles.dateSection}>
                          <View style={dynamicStyles.dateHeaderRow}>
                            <View
                              style={[
                                dynamicStyles.dateBadge,
                                { backgroundColor: colors.primary },
                              ]}
                            >
                              <Ionicons
                                name="calendar"
                                size={10}
                                color="#fff"
                              />
                              <Text style={dynamicStyles.dateBadgeText}>
                                {dateKey}
                              </Text>
                            </View>
                            <View
                              style={[
                                dynamicStyles.dateLine,
                                { backgroundColor: colors.border },
                              ]}
                            />
                          </View>

                          {groupedJobs[dateKey].map((job: any, idx: number) => (
                            <TouchableOpacity
                              key={idx}
                              style={[
                                dynamicStyles.miniJobItem,
                                { backgroundColor: colors.card },
                              ]}
                              onPress={() => setSelectedJob(job)}
                            >
                              <Text
                                style={[
                                  dynamicStyles.miniJobTime,
                                  { color: colors.primary },
                                ]}
                              >
                                {(job.start_time || "").substring(11, 16)} น.
                              </Text>

                              <View
                                style={{
                                  flex: 1,
                                  paddingHorizontal: 10,
                                  justifyContent: "center",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: colors.text,
                                    fontWeight: "700",
                                  }}
                                  numberOfLines={1}
                                >
                                  {job.customer_name}
                                </Text>
                                <View
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    marginTop: 2,
                                  }}
                                >
                                  <Ionicons
                                    name="location-sharp"
                                    size={10}
                                    color={colors.textSecondary}
                                  />
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      color: colors.textSecondary,
                                      marginLeft: 2,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {job.destination}
                                  </Text>
                                </View>
                              </View>

                              <Ionicons
                                name="eye-outline"
                                size={16}
                                color={colors.primary}
                              />
                            </TouchableOpacity>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* --- Modal Details --- */}
      {/* --- [จุดที่ 2] Modal รายละเอียดงาน (แบบใหม่) --- */}
      <Modal visible={!!selectedJob} animationType="fade" transparent>
        <View
          style={[
            dynamicStyles.modalOverlay,
            { backgroundColor: colors.overlay },
          ]}
        >
          <View
            style={[
              dynamicStyles.modalContent,
              { backgroundColor: colors.card },
            ]}
          >
            {/* Header Modal */}
            <View
              style={[
                dynamicStyles.modalInnerHeader,
                { borderBottomColor: colors.border },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <MaterialCommunityIcons
                  name="file-document-outline"
                  size={24}
                  color={colors.primary}
                />
                <Text
                  style={[
                    dynamicStyles.modalTitle,
                    { color: colors.text, marginLeft: 8 },
                  ]}
                >
                  รายละเอียดใบงาน
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedJob(null)}
                style={{ padding: 5 }}
              >
                <Ionicons name="close" size={28} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedJob && (
              <ScrollView
                style={dynamicStyles.modalBody}
                showsVerticalScrollIndicator={false}
              >
                {/* ส่วน A: สถานะและลูกค้า */}
                <View style={{ marginBottom: 20 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <Text
                      style={[
                        dynamicStyles.jobIdText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      ID: #{selectedJob.id}
                    </Text>
                    <View
                      style={[
                        dynamicStyles.statusTag,
                        {
                          backgroundColor:
                            selectedJob.status === "completed"
                              ? colors.success + "20"
                              : colors.warning + "20",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color:
                            selectedJob.status === "completed"
                              ? colors.success
                              : colors.warning,
                          fontSize: 12,
                          fontWeight: "800",
                        }}
                      >
                        {selectedJob.status === "completed"
                          ? "เสร็จสมบูรณ์"
                          : selectedJob.status === "pending"
                            ? "รอ/กำลังวิ่ง"
                            : selectedJob.status}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      dynamicStyles.customerNameBig,
                      { color: colors.text },
                    ]}
                  >
                    {selectedJob.customer_name}
                  </Text>
                  {selectedJob.customer_phone ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 5,
                      }}
                    >
                      <Ionicons
                        name="call"
                        size={14}
                        color={colors.textSecondary}
                      />
                      <Text
                        style={{ color: colors.textSecondary, marginLeft: 5 }}
                      >
                        {selectedJob.customer_phone}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={dynamicStyles.divider} />

                {/* ส่วน C: เส้นทางและเวลา */}
                <View style={dynamicStyles.sectionBox}>
                  <Text
                    style={[
                      dynamicStyles.sectionHeaderTxt,
                      { color: colors.text },
                    ]}
                  >
                    📍 เส้นทางและเวลา
                  </Text>
                  <DetailRowFull
                    icon="navigate-circle-outline"
                    label="ต้นทาง"
                    value={selectedJob.origin}
                    colors={colors}
                  />
                  <DetailRowFull
                    icon="location-sharp"
                    label="ปลายทาง"
                    value={selectedJob.destination}
                    colors={colors}
                    highlight
                  />
                  <View style={{ height: 10 }} />
                  <DetailRowFull
                    icon="time-outline"
                    label="เริ่มงาน"
                    value={formatDateTime(selectedJob.start_time)}
                    colors={colors}
                  />
                  <DetailRowFull
                    icon="checkmark-circle-outline"
                    label="จบงาน"
                    value={
                      selectedJob.end_time
                        ? formatDateTime(selectedJob.end_time)
                        : "-"
                    }
                    colors={colors}
                  />
                </View>

                <View style={dynamicStyles.divider} />

                {/* ส่วน D: ทีมงานและรถ */}
                <View style={dynamicStyles.sectionBox}>
                  <Text
                    style={[
                      dynamicStyles.sectionHeaderTxt,
                      { color: colors.text },
                    ]}
                  >
                    🚛 ทีมงานและพาหนะ
                  </Text>
                  <View style={{ flexDirection: "row" }}>
                    <View style={{ flex: 1 }}>
                      <DetailRowFull
                        icon="person"
                        label="คนขับ"
                        value={selectedJob.driver_name}
                        colors={colors}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <DetailRowFull
                        icon="people-outline"
                        label="ผู้ช่วย"
                        value={getAssistantName(selectedJob.assistant_id)}
                        colors={colors}
                      />
                    </View>
                  </View>
                  <DetailRowFull
                    icon="car-sport-outline"
                    label="รถ/ทะเบียน"
                    value={`${selectedJob.fleet_number || "-"}  (${selectedJob.plate_number || "-"})`}
                    colors={colors}
                  />
                </View>

                {/* ส่วน E: รายละเอียดงานเพิ่มเติม */}
                {selectedJob.job_desc ? (
                  <View
                    style={[
                      dynamicStyles.descBox,
                      {
                        backgroundColor: colors.warning + "15",
                        borderColor: colors.warning,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: colors.warning,
                        marginBottom: 4,
                      }}
                    >
                      รายละเอียดงาน/ภารกิจ:
                    </Text>
                    <Text style={{ fontSize: 14, color: colors.text }}>
                      {selectedJob.job_desc}
                    </Text>
                  </View>
                ) : null}

                {/* ส่วน F: รูปภาพหลักฐาน */}
                <View style={{ marginTop: 20, marginBottom: 40 }}>
                  <Text
                    style={[
                      dynamicStyles.sectionHeaderTxt,
                      { color: colors.text, marginBottom: 10 },
                    ]}
                  >
                    📷 หลักฐานงานจบ
                  </Text>
                  {(() => {
                    const proofUrl = getProofImageUrl(selectedJob.proof_image);
                    return proofUrl ? (
                      <Image
                        source={{ uri: proofUrl }}
                        style={[
                          dynamicStyles.proofImg,
                          { backgroundColor: colors.bgSecondary },
                        ]}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          dynamicStyles.noImg,
                          {
                            backgroundColor: colors.bgSecondary,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name="image-outline"
                          size={48}
                          color={colors.textSecondary}
                        />
                        <Text
                          style={{ color: colors.textSecondary, marginTop: 5 }}
                        >
                          ไม่มีรูปภาพแนบ
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          onChange={(e, d) => {
            setShowDatePicker(false);
            if (d) setDate(d);
          }}
        />
      )}
    </View>
  );
}

const DetailRow = ({ label, value, icon, colors }: any) => (
  <View style={{ flexDirection: "row", alignItems: "center" }}>
    <Ionicons
      name={icon}
      size={18}
      color={colors.primary}
      style={{ width: 30 }}
    />
    <View>
      <Text
        style={{ fontSize: 11, color: colors.textSecondary, fontWeight: "700" }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
        {value || "-"}
      </Text>
    </View>
  </View>
);

const StatCard = ({
  label,
  value,
  icon,
  color,
  border,
  isMoney,
  colors,
  styles,
}: any) => (
  <View
    style={[
      styles.statBox,
      {
        borderLeftWidth: 5,
        borderLeftColor: border,
        backgroundColor: colors.card,
      },
    ]}
  >
    <View style={[styles.iconCircle, { backgroundColor: color + "15" }]}>
      <MaterialCommunityIcons name={icon} size={20} color={color} />
    </View>
    <View style={{ marginLeft: 10, flex: 1 }}>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.statValue,
          isMoney && { fontSize: 13 },
          { color: colors.text },
        ]}
      >
        {value}
      </Text>
    </View>
  </View>
);
// --- [จุดที่ 3] Component ย่อยสำหรับแสดงแถวข้อมูลใน Modal ---
const DetailRowFull = ({ icon, label, value, colors, highlight }: any) => (
  <View
    style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 12 }}
  >
    <View style={{ width: 30, paddingTop: 2 }}>
      <Ionicons
        name={icon}
        size={18}
        color={highlight ? colors.primary : colors.textSecondary}
      />
    </View>
    <View style={{ flex: 1 }}>
      <Text
        style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 2 }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: highlight ? colors.primary : colors.text,
        }}
      >
        {value || "-"}
      </Text>
    </View>
  </View>
);

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    headerArea: {
      paddingHorizontal: 20,
      paddingTop: Platform.OS === "ios" ? 50 : 20,
      paddingBottom: 15,
      borderBottomWidth: 1,
      zIndex: 10,
    },
    headerTop: { marginBottom: 10 },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    headerSubtitle: { fontSize: 12 }, // ✅ Added missing style
    controlRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginVertical: 10,
    },
    toggleGroup: {
      flexDirection: "row",
      borderRadius: 8,
      padding: 3,
      flex: 1,
      marginRight: 10,
    },
    toggleBtn: {
      flex: 1,
      paddingVertical: 6,
      alignItems: "center",
      borderRadius: 6,
    },
    toggleBtnActive: {},
    toggleText: { fontSize: 11, fontWeight: "600" },
    toggleTextActive: { color: "#fff" },
    dateBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
    },
    modeToggleArea: { flexDirection: "row", gap: 10 },
    modeTab: {
      flex: 1,
      paddingVertical: 8,
      alignItems: "center",
      borderRadius: 8,
      borderWidth: 1,
    },
    modeTabActive: {},
    modeTabText: { fontSize: 12, fontWeight: "700" },
    modeTabTextActive: { color: "#fff" },
    scrollContent: { padding: 15 },
    statGrid: { flexDirection: "row", gap: 10, marginBottom: 10 },
    statBox: {
      flex: 1,
      padding: 10,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      elevation: 2,
    },
    iconCircle: {
      width: 32,
      height: 32,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    statLabel: { fontSize: 9, fontWeight: "700" },
    statValue: { fontSize: 16, fontWeight: "800" },
    totalCard: {
      borderRadius: 15,
      padding: 15,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 15,
      borderWidth: 2,
    },
    totalIconBox: {
      width: 45,
      height: 45,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    totalLabel: { fontSize: 12, fontWeight: "700" },
    totalValue: { fontSize: 22, fontWeight: "800" },
    chartBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    tableCard: {
      borderRadius: 15,
      overflow: "hidden",
      elevation: 2,
      marginBottom: 20,
    },
    tableHeader: { padding: 12, borderBottomWidth: 1 },
    tableTitle: { fontSize: 14, fontWeight: "800" },
    tableRow: {
      flexDirection: "row",
      padding: 12,
      borderBottomWidth: 1,
      alignItems: "center",
    },
    emptyState: { padding: 30, alignItems: "center" },
    emptyText: { marginTop: 8, fontSize: 12 },
    rowDate: { width: 55 },
    rowInfo: { flex: 1, paddingHorizontal: 8 },
    rowStatus: { alignItems: "flex-end", width: 75 },
    txtPrimary: { fontSize: 12, fontWeight: "700" },
    txtSecondary: { fontSize: 10 },
    statusBadge: {
      fontSize: 8,
      fontWeight: "800",
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: "hidden",
    },
    rowCost: { fontSize: 11, fontWeight: "700", marginTop: 2 },
    sectionTitle: { fontSize: 15, fontWeight: "800", marginVertical: 10 },
    driverCard: {
      borderRadius: 12,
      marginBottom: 10,
      overflow: "hidden",
      elevation: 2,
    },
    driverHeader: {
      flexDirection: "row",
      padding: 12,
      alignItems: "center",
      justifyContent: "space-between",
    },
    driverProfile: { flexDirection: "row", alignItems: "center" },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 10,
    },
    avatarTxt: { fontWeight: "800", fontSize: 14 },
    driverNameText: { fontSize: 13, fontWeight: "700" },
    jobCount: { fontSize: 10, fontWeight: "700" },
    driverJobsList: { padding: 8, borderTopWidth: 1 },
    dateSection: { marginBottom: 10 },
    dateHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    dateBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 15,
      marginRight: 10,
    },
    dateBadgeText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "700",
      marginLeft: 5,
    },
    dateLine: { flex: 1, height: 1 },
    miniJobItem: {
      flexDirection: "row",
      padding: 10,
      borderRadius: 8,
      marginBottom: 5,
      alignItems: "center",
    },
    miniJobTime: { width: 60, fontSize: 12, fontWeight: "700" },
    miniJobCust: { flex: 1, fontSize: 11 },
    modalOverlay: { flex: 1, justifyContent: "flex-end" },
    modalContent: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      height: "80%",
    },
    modalInnerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 15,
      borderBottomWidth: 1,
    },
    modalTitle: { fontSize: 16, fontWeight: "800" },
    modalBody: { padding: 15 },
    proofImg: {
      width: "100%",
      height: 220,
      borderRadius: 12,
      marginBottom: 15,
    },
    noImg: {
      width: "100%",
      height: 120,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 12,
      borderStyle: "dashed",
      borderWidth: 1,
      marginBottom: 15,
    },
    costBox: {
      marginTop: 10,
      padding: 12,
      borderRadius: 10,
      borderLeftWidth: 4,
    },
    costLabel: { fontSize: 11, fontWeight: "700" },
    costValue: { fontSize: 20, fontWeight: "800" },
    chartModalContent: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      height: "85%",
    },
    chartModalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 15,
      borderBottomWidth: 1,
    },
    chartModalTitle: { fontSize: 16, fontWeight: "800" },
    chartModalBody: { padding: 15 },
    yearNav: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 10,
      borderWidth: 1,
      padding: 10,
    },
    yearNavBtn: { padding: 5 },
    yearNavText: { fontSize: 14, fontWeight: "800" },
    chartYearText: { fontSize: 11 },
    chartLegend: {
      flexDirection: "row",
      marginBottom: 10,
      justifyContent: "center",
      gap: 15,
    },
    chartContainer: {
      backgroundColor: "rgba(0,0,0,0.02)",
      borderRadius: 10,
      padding: 10,
    },
    gridLine: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 1,
      opacity: 0.1,
    },
    avgLine: { position: "absolute", left: 0, right: 0, height: 2 },
    chartSummaryBox: { padding: 12, borderRadius: 10, borderLeftWidth: 4 },
    chartSummaryLabel: { fontSize: 11, fontWeight: "700" },
    chartSummaryValue: { fontSize: 18, fontWeight: "800" },
    // --- [จุดที่ 4] Styles ใหม่สำหรับ Modal ---
    jobIdText: { fontSize: 12, fontWeight: "700" },
    statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    customerNameBig: { fontSize: 22, fontWeight: "800", lineHeight: 28 },
    financeCard: {
      padding: 15,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 15,
    },
    financeRow: { flexDirection: "row", justifyContent: "space-between" },
    divider: { height: 1, backgroundColor: "#e2e8f0", marginVertical: 15 }, // ใช้สี Default ไปก่อน เดี๋ยว Dynamic จะทับเอง
    sectionBox: { marginBottom: 10 },
    sectionHeaderTxt: { fontSize: 14, fontWeight: "800", marginBottom: 12 },
    descBox: {
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      marginTop: 10,
      borderStyle: "dashed",
    },
  });
