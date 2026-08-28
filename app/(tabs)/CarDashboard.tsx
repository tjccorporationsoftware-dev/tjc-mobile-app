import {
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import axios from "axios";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// 🔥 1. Import Calendar
import { Calendar, LocaleConfig } from "react-native-calendars";

// ✅ 1. Import Config
import { API_BASE } from "../../constants/config";

// ✅ 2. Import Auth Context
import { useAuth } from "../_layout";

// --- ตั้งค่าภาษาไทยให้ปฏิทิน ---
LocaleConfig.locales["th"] = {
  monthNames: [
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
  ],
  monthNamesShort: [
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
  ],
  dayNames: [
    "อาทิตย์",
    "จันทร์",
    "อังคาร",
    "พุธ",
    "พฤหัสบดี",
    "ศุกร์",
    "เสาร์",
  ],
  dayNamesShort: ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."],
  today: "วันนี้",
};
LocaleConfig.defaultLocale = "th";

// --- Theme Configuration ---
const THEME = {
  dark: {
    bg: "#0f172a",
    card: "#1e293b",
    textMain: "#f1f5f9",
    textSub: "#94a3b8",
    border: "#334155",
    primary: "#3b82f6",
    success: "#10b981",
    danger: "#ef4444",
    warning: "#f59e0b",
    info: "#0ea5e9",
    cardSelected: "#1e3a8a",
    inputBg: "#1e293b",
    modalBg: "#1e293b",
    activeHeader: "#059669",
    maintenance: "#fbbf24",
    maintenanceBg: "rgba(245, 158, 11, 0.15)",
    busyBg: "rgba(239, 68, 68, 0.15)",
    pendingBg: "rgba(249, 115, 22, 0.15)",
    statusCompleted: "#6b7280",
    statusCancelled: "#000000",
    statusPending: "#f97316",
    statusOverdue: "#ef4444",
    statusActive: "#3b82f6",
    statusApproved: "#10b981",
  },
  light: {
    bg: "#f1f5f9",
    card: "#ffffff",
    textMain: "#1e293b",
    textSub: "#64748b",
    border: "#e2e8f0",
    primary: "#2563eb",
    success: "#059669",
    danger: "#dc2626",
    warning: "#d97706",
    info: "#0284c7",
    cardSelected: "#eff6ff",
    inputBg: "#ffffff",
    modalBg: "#ffffff",
    activeHeader: "#10b981",
    maintenance: "#d97706",
    maintenanceBg: "#fffbeb",
    busyBg: "#fef2f2",
    pendingBg: "#fff7ed",
    statusCompleted: "#6b7280",
    statusCancelled: "#000000",
    statusPending: "#f97316",
    statusOverdue: "#ef4444",
    statusActive: "#2563eb",
    statusApproved: "#10b981",
  },
};

const THAI_MONTHS = [
  { id: 1, name: "มกราคม" },
  { id: 2, name: "กุมภาพันธ์" },
  { id: 3, name: "มีนาคม" },
  { id: 4, name: "เมษายน" },
  { id: 5, name: "พฤษภาคม" },
  { id: 6, name: "มิถุนายน" },
  { id: 7, name: "กรกฎาคม" },
  { id: 8, name: "สิงหาคม" },
  { id: 9, name: "กันยายน" },
  { id: 10, name: "ตุลาคม" },
  { id: 11, name: "พฤศจิกายน" },
  { id: 12, name: "ธันวาคม" },
];

const currentYear = new Date().getFullYear();
const YEARS_LIST = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
const DAYS_LIST = Array.from({ length: 31 }, (_, i) => i + 1);

const SCREEN_WIDTH = Dimensions.get("window").width;
const GAP = 10;
const CARD_WIDTH = (SCREEN_WIDTH - GAP * 3) / 2;

// ✅ Helper Functions
const getCarImageSource = (imagePath: string | null) => {
  if (!imagePath)
    return { uri: "https://cdn-icons-png.flaticon.com/512/3202/3202926.png" };
  if (imagePath.startsWith("http")) return { uri: imagePath };
  let baseUrl = API_BASE.replace("/api_carboooking_mobile.php", "").replace(
    "api_carboooking_mobile.php",
    "",
  );
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  return { uri: `${baseUrl}/uploads/cars/${imagePath}` };
};

const formatDateTimeThai = (dateStr: string) => {
  if (!dateStr || dateStr === "0000-00-00 00:00:00" || dateStr === "-")
    return "-";
  const d = new Date(dateStr.replace(" ", "T"));
  if (isNaN(d.getTime())) return dateStr;
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
  const year = d.getFullYear() + 543;
  const day = d.getDate();
  const time = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  return `${day} ${months[d.getMonth()]} ${year} ${time}`;
};

const formatJustDateThai = (dateStr: string) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = [
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
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
};

const cleanNoteText = (rawNote: string) => {
  if (!rawNote || rawNote === "-" || rawNote === "") return "-";
  let temp = rawNote;
  // ลบ emoji ที่ใช้นำหน้าแต่ละส่วน (📍 🔋 ⚡ ⚠️) ออกก่อน
  // เพื่อให้ regex ด้านล่างจับได้ทั้งฟอร์แมตของเว็บและของแอป
  temp = temp.replace(/[\u{1F4CD}\u{1F50B}\u{26A1}\u{26A0}\u{FE0F}]/gu, "");
  temp = temp.replace(
    /จอดที่\s*:.*?(?=\s*(?:\||พลังงาน|ปัญหา|หมายเหตุ|$))/gi,
    "",
  );
  temp = temp.replace(/\|?\s*พลังงาน(คงเหลือ)?\s*:\s*[^\s|]*/gi, "");
  temp = temp.replace(/\|?\s*เสียบชาร์จอยู่/gi, "");
  temp = temp.replace(/(?:\||^)?\s*(?:ปัญหา|หมายเหตุ)\s*:/gi, "");
  temp = temp.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
  return temp || "-";
};

// 🔥 Helper สำหรับ List ประวัติการจองทั่วไป
const getStatusInfo = (
  status: string,
  endDateStr: string,
  startDateStr: string,
  colors: any,
) => {
  const now = new Date();
  const start = new Date(startDateStr.replace(" ", "T"));
  const end = new Date(endDateStr.replace(" ", "T"));

  if (status === "completed") {
    return { text: "คืนแล้ว", color: colors.statusCompleted };
  } else if (status === "cancelled" || status === "rejected") {
    return { text: "ยกเลิก", color: colors.statusCancelled };
  } else if (status === "pending") {
    return { text: "รออนุมัติ", color: colors.statusPending };
  } else if (status === "active" || status === "approved") {
    if (now > end) {
      return { text: "เกินกำหนด", color: colors.statusOverdue };
    } else if (status === "active" || (status === "approved" && now >= start)) {
      return { text: "ใช้อยู่", color: colors.statusActive };
    } else {
      return { text: "จองแล้ว", color: colors.statusApproved };
    }
  } else if (status === "maintenance") {
    return { text: "แจ้งซ่อม", color: colors.maintenance };
  }
  return { text: status, color: colors.textSub };
};

// ----------------------------------------------------------------------
// ✅ CarCard Component
// ----------------------------------------------------------------------
const CarCard = React.memo(
  ({
    item,
    schedule,
    isSelected,
    onPress,
    onOpenSchedule,
    colors,
    isDarkMode,
  }: any) => {
    const { isMaintenance, isBusy, isOverdue, currentTask, nextQueue } =
      useMemo(() => {
        const now = new Date();
        let _isMaintenance = item.status === "maintenance";
        let _isBusy = false;
        let _isOverdue = false;
        let _currentTask = null;
        let _nextQueue = null;

        if (schedule && schedule.length > 0) {
          const sortedSchedule = [...schedule].sort(
            (a: any, b: any) =>
              new Date(a.start).getTime() - new Date(b.start).getTime(),
          );

          for (const s of sortedSchedule) {
            if (!s.start || !s.end) continue;

            const start = new Date(s.start.replace(" ", "T"));
            const end = new Date(s.end.replace(" ", "T"));
            const status = s.status;
            const type = s.type;

            if (["completed", "cancelled", "rejected"].includes(status))
              continue;

            if (type === "maintenance") {
              if (
                (status === "pending" || status === "active") &&
                now >= start
              ) {
                _isMaintenance = true;
                _currentTask = s;
                break;
              }
            }
            if (status === "active" || status === "approved") {
              if (now >= start) {
                _isBusy = true;
                _currentTask = s;
                if (now > end) _isOverdue = true;
                break;
              } else {
                if (!_nextQueue) _nextQueue = s;
              }
            } else if (status === "pending") {
              if (!_nextQueue) _nextQueue = s;
            }
          }
        }
        return {
          isMaintenance: _isMaintenance,
          isBusy: _isBusy,
          isOverdue: _isOverdue,
          currentTask: _currentTask,
          nextQueue: _nextQueue,
        };
      }, [schedule, item.status]);

    let cardStyle = {};
    let statusText = "ว่าง";
    let statusColor = colors.success;
    let displayInfo = null;
    let lastLocation = "-";
    let lastEnergy = "-";
    let lastIssue = "";
    let isCharging = false;

    if (item.last_info) {
      const parts = item.last_info.split("|");
      parts.forEach((p: string) => {
        if (p.includes("จอดที่")) lastLocation = p.split(":")[1]?.trim();
        if (p.includes("พลังงาน")) lastEnergy = p.split(":")[1]?.trim();
        if (p.includes("หมายเหตุ") || p.includes("ปัญหา"))
          lastIssue = cleanNoteText(p);
        if (p.includes("เสียบชาร์จอยู่")) isCharging = true;
      });
    }

    if (isMaintenance) {
      cardStyle = {
        borderColor: colors.maintenance,
        backgroundColor: colors.maintenanceBg,
        borderWidth: 1.5,
      };
      statusText = "กำลังซ่อม";
      statusColor = colors.maintenance;
      displayInfo = {
        user: currentTask?.user || "ช่างซ่อม/ศูนย์",
        phone: currentTask?.phone || "-",
        dest: currentTask?.destination || "กำลังซ่อมบำรุง",
      };
    } else if (isBusy) {
      cardStyle = {
        borderColor: colors.danger,
        backgroundColor: colors.busyBg,
        borderWidth: 1.5,
      };
      statusText = "ไม่ว่าง";
      statusColor = colors.danger;
      displayInfo = {
        user: currentTask?.user || item.busy_user_name || "-",
        phone: currentTask?.phone || item.busy_user_phone || "-",
        dest: currentTask?.destination || item.busy_dest || "-",
      };
    }

    const displayType = item.type === "EV" ? "EV" : "Fuel";

    return (
      <TouchableOpacity
        style={[
          styles.carCard,
          {
            width: CARD_WIDTH,
            backgroundColor: colors.card,
            borderColor: isSelected ? colors.primary : colors.border,
            marginBottom: GAP,
          },
          isSelected && {
            borderWidth: 2,
            borderColor: colors.primary,
            transform: [{ scale: 0.98 }],
          },
          cardStyle,
        ]}
        onPress={() => onPress(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.carHeader}>
          <View style={{ flex: 1, marginRight: 5 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 2,
              }}
            >
              {item.car_number ? (
                <View
                  style={[
                    styles.carNumberCircle,
                    {
                      backgroundColor: isMaintenance
                        ? colors.maintenance
                        : isDarkMode
                          ? "#f1f5f9"
                          : "#111",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.carNumberText,
                      { color: isDarkMode ? "#000" : "#fff" },
                    ]}
                  >
                    {item.car_number}
                  </Text>
                </View>
              ) : null}
              <Text
                style={[
                  styles.carName,
                  { color: colors.textMain, fontSize: 13, flex: 1 },
                ]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
            </View>
            <Text
              style={[
                styles.carPlate,
                { color: colors.textSub, fontSize: 10, marginBottom: 4 },
              ]}
            >
              {item.plate}
            </Text>
            <View style={{ flexDirection: "row" }}>
              <View
                style={[
                  styles.typeBadge,
                  {
                    backgroundColor: isDarkMode
                      ? "rgba(59, 130, 246, 0.15)"
                      : "rgba(37, 99, 235, 0.1)",
                    borderColor:
                      item.type === "EV"
                        ? isDarkMode
                          ? "#60a5fa"
                          : "#2563eb"
                        : isDarkMode
                          ? "#fbbf24"
                          : "#f59e0b",
                    marginLeft: 6,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 8,
                    fontWeight: "bold",
                    color:
                      item.type === "EV"
                        ? isDarkMode
                          ? "#60a5fa"
                          : "#2563eb"
                        : isDarkMode
                          ? "#fbbf24"
                          : "#f59e0b",
                  }}
                >
                  {displayType}
                </Text>
              </View>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={{ color: "#fff", fontSize: 9, fontWeight: "bold" }}>
              {statusText}
            </Text>
          </View>
        </View>

        <View style={[styles.carImgBox, { height: 70 }]}>
          <Image
            source={getCarImageSource(item.car_image)}
            style={[
              styles.carImage,
              (isBusy || isMaintenance) && { opacity: 0.6 },
            ]}
            resizeMode="contain"
          />
          {isSelected && (
            <View style={styles.selectedOverlay}>
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={colors.primary}
              />
            </View>
          )}
        </View>

        <View
          style={[
            styles.carFooter,
            {
              padding: 8,
              backgroundColor: isDarkMode ? "#0f172a" : "#f3f4f6",
              ...(isBusy
                ? {
                    backgroundColor: isDarkMode
                      ? "rgba(239, 68, 68, 0.2)"
                      : "#fee2e2",
                  }
                : {}),
              ...(isMaintenance
                ? {
                    backgroundColor: isDarkMode
                      ? "rgba(245, 158, 11, 0.2)"
                      : "#fff7ed",
                  }
                : {}),
            },
          ]}
        >
          {(isMaintenance || isBusy) && displayInfo ? (
            <View>
              <View style={styles.infoRow}>
                <Ionicons
                  name="person"
                  size={10}
                  color={colors.textSub}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.infoText,
                    { color: colors.textMain, fontWeight: "bold", flex: 1 },
                  ]}
                  numberOfLines={1}
                >
                  {displayInfo.user}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons
                  name="call"
                  size={10}
                  color={colors.textSub}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[styles.infoText, { color: colors.textSub, flex: 1 }]}
                  numberOfLines={1}
                >
                  {displayInfo.phone}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons
                  name="location"
                  size={10}
                  color={colors.textSub}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[styles.infoText, { color: colors.textSub, flex: 1 }]}
                  numberOfLines={1}
                >
                  {displayInfo.dest}
                </Text>
              </View>
            </View>
          ) : (
            <View>
              <View style={styles.infoRow}>
                <Ionicons
                  name="location-sharp"
                  size={12}
                  color="#ef4444"
                  style={{ marginRight: 3 }}
                />
                <Text
                  style={[
                    styles.infoText,
                    { color: colors.textSub, fontSize: 10 },
                  ]}
                  numberOfLines={1}
                >
                  {lastLocation}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <MaterialCommunityIcons
                  name={item.type === "EV" ? "battery-high" : "gas-station"}
                  size={12}
                  color={item.type === "EV" ? "#10b981" : "#f59e0b"}
                  style={{ marginRight: 3 }}
                />
                <Text
                  style={[
                    styles.infoText,
                    { color: colors.textSub, fontSize: 10 },
                  ]}
                >
                  {lastEnergy} {item.type === "EV" && "%"}
                </Text>
                {isCharging && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginLeft: 4,
                      backgroundColor: "#dcfce7",
                      paddingHorizontal: 3,
                      borderRadius: 3,
                    }}
                  >
                    <Ionicons name="flash" size={8} color="#16a34a" />
                    <Text
                      style={{
                        fontSize: 8,
                        color: "#166534",
                        fontWeight: "bold",
                      }}
                    >
                      ชาร์จ
                    </Text>
                  </View>
                )}
              </View>
              {lastIssue ? (
                <View style={[styles.infoRow, { marginTop: 2 }]}>
                  <Ionicons
                    name="alert-circle"
                    size={12}
                    color="#f59e0b"
                    style={{ marginRight: 3 }}
                  />
                  <Text
                    style={[
                      styles.infoText,
                      {
                        color: isDarkMode ? "#fbbf24" : "#d97706",
                        fontStyle: "italic",
                        flex: 1,
                        fontSize: 10,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {lastIssue}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {/* 🔥 ปุ่มดูตารางงาน */}
          <View
            style={{
              marginTop: 8,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 6,
            }}
          >
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 2,
              }}
              onPress={() => onOpenSchedule(item)}
            >
              <MaterialCommunityIcons
                name="calendar-month"
                size={14}
                color={colors.primary}
              />
              <Text
                style={{
                  fontSize: 11,
                  color: colors.primary,
                  fontWeight: "bold",
                  marginLeft: 4,
                }}
              >
                ดูตารางงาน
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

// ----------------------------------------------------------------------
// ✅ Main Screen Component
// ----------------------------------------------------------------------
export default function CarDashboardScreen() {
  const systemColorScheme = useColorScheme();
  const isDarkMode = systemColorScheme === "dark";
  const colors = isDarkMode ? THEME.dark : THEME.light;

  const { user } = useAuth();
  const userId = user?.id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cars, setCars] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any>({});
  const [history, setHistory] = useState<any[]>([]);
  const [maintenanceHistory, setMaintenanceHistory] = useState<any[]>([]);

  const [selectedCarId, setSelectedCarId] = useState<number | null>(null);
  const [filterDay, setFilterDay] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(
    new Date().getMonth() + 1,
  );
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterType, setFilterType] = useState<
    "all" | "available" | "unavailable"
  >("all");

  const [activeTab, setActiveTab] = useState<"usage" | "maintenance">("usage");

  // 🔥 States สำหรับ Modal ปฏิทิน
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduleModalCar, setScheduleModalCar] = useState<any>(null);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string>("");

  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"car" | "day" | "month" | "year">(
    "month",
  );

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);

  const flatListRef = useRef<FlatList>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // ตรวจสอบการชนกันของการจอง
  const validateBookingConflict = (selectedCar: any) => {
    if (!selectedCar) return { conflict: false };
    const carSchedule = schedules[selectedCar.id] || [];
    if (!carSchedule.length) return { conflict: false };
    const reqStart = new Date().getTime(); // ตรวจสอบจากเวลาปัจจุบัน
    for (const b of carSchedule) {
      if (["cancelled", "rejected", "completed"].includes(b.status)) continue;
      const start = new Date(b.start.replace(" ", "T")).getTime(),
        end = new Date(b.end.replace(" ", "T")).getTime();
      if (reqStart < end && reqStart > start)
        return { conflict: true, details: b };
    }
    return { conflict: false };
  };

  const fetchData = async () => {
    try {
      if (!refreshing) setLoading(true);
      const url = `${API_BASE}/api_carboooking_mobile.php`;
      const response = await axios.get(url, {
        params: {
          action: "get_car_dashboard_data",
          user_id: userId,
          d: filterDay || "",
          m: filterMonth || "",
          y: filterYear,
          car_id: selectedCarId || "",
        },
      });

      const { data } = response;
      if (data.status === "success") {
        let sortedCars = [];
        if (Array.isArray(data.cars)) {
          sortedCars = data.cars.sort((a: any, b: any) => {
            const numA = a.car_number ? parseInt(a.car_number, 10) : 999999;
            const numB = b.car_number ? parseInt(b.car_number, 10) : 999999;
            return numA - numB;
          });
        }
        setCars(sortedCars);
        setHistory(data.history || []);
        setMaintenanceHistory(data.maintenance_logs || []);
        setSchedules(data.car_schedules || {});
      }
    } catch (error) {
      console.error("Fetch Error:", error);
      Alert.alert("ผิดพลาด", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [filterDay, filterMonth, filterYear]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };
  const handleReset = () => {
    const now = new Date();
    setSelectedCarId(null);
    setFilterDay(now.getDate());
    setFilterMonth(now.getMonth() + 1);
    setFilterYear(now.getFullYear());
    setFilterType("all");
    setActiveTab("usage");
    fetchData();
  };

  const handleCarPress = useCallback((id: number) => {
    setSelectedCarId((prev) => (prev === id ? null : id));
  }, []);

  const handleOpenSchedule = useCallback((car: any) => {
    setScheduleModalCar(car);
    setCalendarSelectedDate(new Date().toISOString().split("T")[0]); // Default วันปัจจุบัน
    setScheduleModalVisible(true);
  }, []);

  const filteredHistory = useMemo(() => {
    const sourceData = activeTab === "usage" ? history : maintenanceHistory;
    return selectedCarId
      ? sourceData.filter((h) => (h.car_id || h.vehicle_id) == selectedCarId)
      : sourceData;
  }, [selectedCarId, history, maintenanceHistory, activeTab]);

  const filteredCars = useMemo(() => {
    if (filterType === "all") return cars;
    return cars.filter((c) => {
      const isMaintenance = c.status === "maintenance";
      const conflictResult: any = validateBookingConflict(c);
      const isUnavailable = isMaintenance || conflictResult.conflict;
      return filterType === "available" ? !isUnavailable : isUnavailable;
    });
  }, [cars, filterType, schedules]);

  // 🔥 Helper สำหรับปฏิทินโดยเฉพาะ (ให้แสดงแค่ 3 สถานะ)
  const getModalStatusInfo = (
    status: string,
    endStr: string,
    startStr: string,
    type: string,
  ) => {
    const now = new Date();
    const end = new Date(endStr.replace(" ", "T"));

    if (status === "maintenance" || type === "maintenance") {
      return { text: "กำลังซ่อม", color: colors.maintenance };
    } else if (status === "active" || status === "approved") {
      if (now > end) {
        return { text: "เกินกำหนด", color: colors.statusOverdue };
      } else {
        return { text: "จองแล้ว", color: colors.statusApproved };
      }
    }
    return { text: status, color: colors.textSub };
  };

  // 🔥 คำนวณวันที่สำหรับ Modal ปฏิทิน (ซ่อนอันที่คืนแล้ว/ยกเลิก)
  const modalMarkedDates = useMemo(() => {
    if (!scheduleModalCar) return {};
    const marks: any = {};
    const carSchedule = schedules[scheduleModalCar.id] || [];

    // กรองเอาเฉพาะ active, approved และ maintenance
    const activeEvents = carSchedule.filter(
      (h: any) =>
        h.status === "active" ||
        h.status === "approved" ||
        h.status === "maintenance" ||
        h.type === "maintenance",
    );

    activeEvents.forEach((item: any) => {
      if (!item.start || !item.end) return;

      let dateKey = item.start.split(" ")[0];
      let endDateKey = item.end.split(" ")[0];
      const { color } = getModalStatusInfo(
        item.status,
        item.end,
        item.start,
        item.type,
      );

      if (!marks[dateKey]) {
        marks[dateKey] = {
          startingDay: true,
          color: color,
          textColor: "white",
          endingDay: dateKey === endDateKey,
        };
      } else {
        marks[dateKey] = { ...marks[dateKey], marked: true, dotColor: color };
      }

      if (dateKey !== endDateKey) {
        if (!marks[endDateKey]) {
          marks[endDateKey] = {
            endingDay: true,
            color: color,
            textColor: "white",
            startingDay: false,
          };
        }
      }
    });

    if (calendarSelectedDate) {
      const existing = marks[calendarSelectedDate] || {};
      marks[calendarSelectedDate] = {
        ...existing,
        color: colors.primary,
        textColor: "#ffffff",
        startingDay: existing.startingDay,
        endingDay: existing.endingDay,
      };
    }

    return marks;
  }, [scheduleModalCar, schedules, colors, calendarSelectedDate]);

  // 🔥 รายการของวันที่เลือกใน Modal
  const modalSelectedDateEvents = useMemo(() => {
    if (!scheduleModalCar || !calendarSelectedDate) return [];
    const carSchedule = schedules[scheduleModalCar.id] || [];

    return carSchedule.filter((item: any) => {
      if (!item.start || !item.end) return false;

      const start = item.start.split(" ")[0];
      const end = item.end.split(" ")[0];

      const isAllowedStatus =
        item.status === "active" ||
        item.status === "approved" ||
        item.status === "maintenance" ||
        item.type === "maintenance";

      return (
        isAllowedStatus &&
        calendarSelectedDate >= start &&
        calendarSelectedDate <= end
      );
    });
  }, [scheduleModalCar, calendarSelectedDate, schedules]);

  const openModal = (type: any) => {
    setModalType(type);
    setModalVisible(true);
  };
  const handleSelect = (value: any) => {
    if (modalType === "car") setSelectedCarId(value);
    if (modalType === "day") setFilterDay(value);
    if (modalType === "month") setFilterMonth(value);
    if (modalType === "year") setFilterYear(value);
    setModalVisible(false);
  };

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollTop(offsetY > 300);
  };
  const scrollToTop = () =>
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });

  const openDetail = (item: any) => {
    setSelectedDetail(item);
    setDetailModalVisible(true);
  };

  const HistoryItem = ({ item }: { item: any }) => {
    const { text, color } = getStatusInfo(
      item.status,
      item.end_date,
      item.start_date,
      colors,
    );
    const isActiveRow = text === "ใช้อยู่" || text === "เกินกำหนด";

    return (
      <View
        style={[
          styles.historyCard,
          {
            backgroundColor: colors.card,
            borderColor: isActiveRow ? colors.primary : colors.border,
            borderWidth: isActiveRow ? 1.5 : 1,
          },
        ]}
      >
        <View style={styles.timelineCol}>
          <View style={{ alignItems: "center" }}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    item.status === "cancelled" ? "#ccc" : colors.success,
                },
              ]}
            />
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    item.status === "cancelled" ? "#ccc" : colors.danger,
                },
              ]}
            />
          </View>
          <View
            style={{
              marginLeft: 8,
              justifyContent: "space-between",
              paddingVertical: 2,
            }}
          >
            <Text style={[styles.timeText, { color: colors.textMain }]}>
              ออก {formatDateTimeThai(item.start_date)}
            </Text>
            <Text style={[styles.timeText, { color: colors.textSub }]}>
              คืน {formatDateTimeThai(item.end_date)}
            </Text>
          </View>
        </View>
        <View
          style={{
            height: 1,
            backgroundColor: colors.border,
            marginVertical: 10,
          }}
        />
        <View style={styles.detailRow}>
          <View style={{ flex: 1.2, paddingRight: 5 }}>
            <Text style={[styles.userLabel, { color: colors.textSub }]}>
              ผู้ใช้งาน
            </Text>
            <Text style={[styles.userName, { color: colors.textMain }]}>
              {item.fullname}
            </Text>
            {item.phone && item.phone !== "-" && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 2,
                }}
              >
                <Ionicons
                  name="call"
                  size={10}
                  color={colors.textSub}
                  style={{ marginRight: 4 }}
                />
                <Text style={{ fontSize: 10, color: colors.textSub }}>
                  {item.phone}
                </Text>
              </View>
            )}
          </View>

          <View style={{ flex: 1.5 }}>
            <Text style={[styles.userLabel, { color: colors.textSub }]}>
              รถที่ใช้
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  backgroundColor: "#1e293b",
                  paddingHorizontal: 4,
                  borderRadius: 4,
                  marginRight: 4,
                }}
              >
                <Text style={{ color: "#fff", fontSize: 9 }}>
                  {item.car_number}
                </Text>
              </View>
              <Text
                style={{
                  color: colors.textMain,
                  fontSize: 11,
                  fontWeight: "bold",
                }}
              >
                {item.car_name}
              </Text>
            </View>
          </View>

          <View style={{ flex: 0.8, alignItems: "flex-end" }}>
            <View style={[styles.badge, { backgroundColor: color }]}>
              <Text style={styles.badgeText}>{text}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={{ alignSelf: "flex-end", marginTop: 8 }}
          onPress={() => openDetail(item)}
        >
          <Text style={{ color: colors.primary, fontSize: 12 }}>
            ดูรายละเอียด
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const MaintenanceItem = ({ item }: { item: any }) => {
    const repairDate = new Date(
      item.repair_date || item.created_at || new Date(),
    );
    const formatDate = (d: Date) =>
      d.toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    const isPending = item.status === "pending";
    const statusColor = isPending ? colors.warning : colors.success;

    return (
      <View
        style={[
          styles.maintCard,
          {
            backgroundColor: colors.card,
            borderLeftColor: statusColor,
            borderColor: colors.border,
            borderWidth: 1,
          },
        ]}
      >
        <View style={styles.maintHeader}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <FontAwesome5
              name="calendar-alt"
              size={14}
              color={colors.textSub}
              style={{ marginRight: 6 }}
            />
            <Text
              style={{
                color: colors.textMain,
                fontWeight: "bold",
                fontSize: 14,
              }}
            >
              {formatDate(repairDate)}
            </Text>
          </View>
          <Text
            style={{ color: colors.danger, fontWeight: "bold", fontSize: 16 }}
          >
            ฿{item.cost ? Number(item.cost).toLocaleString() : "0"}
          </Text>
        </View>
        <View
          style={{
            height: 1,
            backgroundColor: colors.border,
            marginVertical: 10,
          }}
        />
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text
              style={{
                fontSize: 10,
                color: colors.textSub,
                marginBottom: 2,
                fontWeight: "600",
              }}
            >
              ยานพาหนะ
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <FontAwesome5
                name="car"
                size={12}
                color={colors.primary}
                style={{ marginRight: 6 }}
              />
              <View>
                <Text
                  style={{
                    color: colors.textMain,
                    fontWeight: "bold",
                    fontSize: 13,
                  }}
                >
                  {item.car_name || item.name || "ไม่ระบุ"}
                </Text>
                <Text style={{ color: colors.textSub, fontSize: 11 }}>
                  {item.plate}
                </Text>
              </View>
            </View>
          </View>
          <View style={{ flex: 1.2 }}>
            <Text
              style={{
                fontSize: 10,
                color: colors.textSub,
                marginBottom: 2,
                fontWeight: "600",
              }}
            >
              อาการ/สาเหตุ
            </Text>
            <View
              style={{
                backgroundColor: isDarkMode
                  ? "rgba(255,255,255,0.05)"
                  : "#f8f9fa",
                padding: 8,
                borderRadius: 6,
              }}
            >
              <Text
                style={{ color: colors.textMain, fontSize: 12, lineHeight: 18 }}
              >
                {item.description || item.reason || "-"}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderDetailModal = () => {
    if (!selectedDetail) return null;
    const s = selectedDetail.status;
    const isCompleted = s === "completed";

    const cleanNote = cleanNoteText(
      selectedDetail.return_note || selectedDetail.note || "",
    );

    const startTime = selectedDetail.start_date || selectedDetail.start;
    const endTime = selectedDetail.end_date || selectedDetail.end;
    const userName =
      selectedDetail.fullname || selectedDetail.user || "ไม่ระบุชื่อ";

    const phoneNumber =
      selectedDetail.phone ||
      selectedDetail.phone_number ||
      selectedDetail.user_phone ||
      "-";

    return (
      <View
        style={{
          backgroundColor: colors.card,
          padding: 20,
          borderRadius: 16,
          width: "90%",
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight: "bold",
            color: colors.textMain,
            marginBottom: 15,
            textAlign: "center",
          }}
        >
          รายละเอียดการจอง
        </Text>
        <View
          style={{
            backgroundColor: isDarkMode ? "#334155" : "#f8f9fa",
            padding: 12,
            borderRadius: 10,
            marginBottom: 10,
          }}
        >
          {/* fullname มาจาก user_id = ผู้ใช้รถจริง ไม่ใช่คนที่กดจอง */}
          <Text style={{ color: colors.textSub, fontSize: 12 }}>ผู้ใช้รถ</Text>
          <Text
            style={{ color: colors.textMain, fontSize: 16, fontWeight: "bold" }}
          >
            {userName}
          </Text>

          <View
            style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}
          >
            <Ionicons
              name="call"
              size={14}
              color={colors.textSub}
              style={{ marginRight: 6 }}
            />
            <Text style={{ color: colors.textSub, fontSize: 14 }}>
              {phoneNumber !== "-" && phoneNumber
                ? phoneNumber
                : "ไม่ระบุเบอร์โทร"}
            </Text>
          </View>

          {/* 👥 แสดงผู้จองแทนเฉพาะกรณีที่มี (จองเองจะไม่ขึ้น) */}
          {!!selectedDetail.booked_by && !!selectedDetail.booker_name && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                marginTop: 8,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: isDarkMode ? "#1e40af" : "#bfdbfe",
                backgroundColor: isDarkMode
                  ? "rgba(37, 99, 235, 0.15)"
                  : "#eff6ff",
              }}
            >
              <Ionicons
                name="person-add"
                size={12}
                color={isDarkMode ? "#93c5fd" : "#1e40af"}
                style={{ marginRight: 5 }}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "bold",
                  color: isDarkMode ? "#93c5fd" : "#1e40af",
                }}
              >
                จองแทนโดย: {selectedDetail.booker_name}
              </Text>
            </View>
          )}
        </View>

        <View
          style={{
            flexDirection: "row",
            marginBottom: 15,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              padding: 10,
              borderRightWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 10, color: colors.textSub }}>เวลาออก</Text>
            <Text
              style={{
                color: colors.success,
                fontWeight: "bold",
                fontSize: 12,
              }}
            >
              {formatDateTimeThai(startTime)}
            </Text>
          </View>
          <View style={{ flex: 1, padding: 10 }}>
            <Text style={{ fontSize: 10, color: colors.textSub }}>
              กำหนดคืน
            </Text>
            <Text
              style={{
                color: colors.textMain,
                fontWeight: "bold",
                fontSize: 12,
              }}
            >
              {formatDateTimeThai(endTime)}
            </Text>
          </View>
        </View>

        {isCompleted && (
          <View
            style={{
              backgroundColor: isDarkMode
                ? "rgba(16, 185, 129, 0.1)"
                : "#f0fdf4",
              padding: 10,
              borderRadius: 10,
              marginBottom: 15,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 10, color: colors.success }}>คืนจริง</Text>
            <Text style={{ color: colors.success, fontWeight: "bold" }}>
              {formatDateTimeThai(selectedDetail.actual_return_time || "-")}
            </Text>
          </View>
        )}

        <View style={{ marginBottom: 10 }}>
          <Text
            style={{ fontSize: 12, color: colors.textSub, fontWeight: "bold" }}
          >
            สถานที่ไป
          </Text>
          <Text style={{ color: colors.textMain }}>
            {selectedDetail.destination || "-"}
          </Text>
        </View>
        <View style={{ marginBottom: 15 }}>
          <Text
            style={{ fontSize: 12, color: colors.textSub, fontWeight: "bold" }}
          >
            ภารกิจ
          </Text>
          <Text style={{ color: colors.textMain }}>
            {selectedDetail.reason || "-"}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: colors.warning + "20",
            padding: 10,
            borderRadius: 8,
          }}
        >
          <Text
            style={{ fontSize: 12, color: colors.warning, fontWeight: "bold" }}
          >
            หมายเหตุ
          </Text>
          <Text style={{ color: colors.textMain }}>{cleanNote}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setDetailModalVisible(false)}
          style={{
            backgroundColor: colors.border,
            padding: 12,
            borderRadius: 10,
            marginTop: 20,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.textMain, fontWeight: "bold" }}>
            ปิด
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderScheduleModal = () => {
    if (!scheduleModalCar) return null;

    const legends = [
      { label: "จองแล้ว", color: colors.statusApproved },
      { label: "กำลังซ่อม", color: colors.maintenance },
      { label: "เกินกำหนด", color: colors.statusOverdue },
    ];

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: "90%",
            height: "80%",
            backgroundColor: colors.card,
            borderRadius: 16,
            overflow: "hidden",
            borderColor: colors.border,
            borderWidth: 1,
          }}
        >
          <View
            style={{
              padding: 15,
              backgroundColor: "#10b981",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              zIndex: 10,
            }}
          >
            <View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <MaterialCommunityIcons
                  name="calendar-month"
                  size={20}
                  color="#fff"
                />
                <Text
                  style={{
                    color: "#fff",
                    fontWeight: "bold",
                    fontSize: 18,
                    marginLeft: 6,
                  }}
                >
                  ปฏิทินการใช้รถ
                </Text>
              </View>
              <Text style={{ color: "#fff", fontSize: 14, marginTop: 2 }}>
                {scheduleModalCar.name}{" "}
                {scheduleModalCar.car_number
                  ? `(${scheduleModalCar.car_number})`
                  : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setScheduleModalVisible(false)}>
              <Ionicons name="close-circle" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>
            <Calendar
              current={
                calendarSelectedDate || new Date().toISOString().split("T")[0]
              }
              onDayPress={(day: any) => setCalendarSelectedDate(day.dateString)}
              enableSwipeMonths={true}
              firstDay={1}
              markedDates={modalMarkedDates}
              markingType={"period"}
              theme={
                {
                  calendarBackground: colors.card,
                  textSectionTitleColor: colors.textMain,
                  dayTextColor: colors.textMain,
                  todayTextColor: colors.primary,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: "#ffffff",
                  monthTextColor: colors.textMain,
                  textDisabledColor: isDarkMode ? "#334155" : "#d9e1e8",
                  arrowColor: colors.textMain,
                  textMonthFontWeight: "bold",
                  textDayHeaderFontWeight: "bold",
                  "stylesheet.calendar.header": {
                    week: {
                      marginTop: 7,
                      flexDirection: "row",
                      justifyContent: "space-around",
                      paddingHorizontal: 0,
                    },
                    dayHeader: {
                      width: 32,
                      textAlign: "center",
                      fontSize: 13,
                      color: colors.textMain,
                      fontWeight: "bold",
                    },
                  },
                } as any
              }
            />

            <View
              style={{
                padding: 15,
                flex: 1,
                backgroundColor: colors.card,
              }}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontWeight: "bold",
                  fontSize: 16,
                  marginBottom: 10,
                }}
              >
                รายการจอง: {formatJustDateThai(calendarSelectedDate)}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  marginBottom: 10,
                  justifyContent: "center",
                  paddingBottom: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                {legends.map((l, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginRight: 10,
                      marginBottom: 4,
                    }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        backgroundColor: l.color,
                        borderRadius: 2,
                        marginRight: 4,
                      }}
                    />
                    <Text style={{ color: colors.textSub, fontSize: 11 }}>
                      {l.label}
                    </Text>
                  </View>
                ))}
              </View>

              <ScrollView style={{ flex: 1 }}>
                {modalSelectedDateEvents.length > 0 ? (
                  modalSelectedDateEvents.map((item: any, index: number) => {
                    const { text, color } = getModalStatusInfo(
                      item.status,
                      item.end,
                      item.start,
                      item.type,
                    );
                    const isMaint =
                      item.status === "maintenance" ||
                      item.type === "maintenance";

                    const isActiveRow =
                      text === "ใช้อยู่" || text === "เกินกำหนด";

                    return (
                      <TouchableOpacity
                        key={index}
                        onPress={() => openDetail(item)}
                        activeOpacity={0.7}
                        style={[
                          styles.historyCard,
                          {
                            backgroundColor: colors.card,
                            borderColor: isActiveRow
                              ? colors.primary
                              : colors.border,
                            borderWidth: isActiveRow ? 1.5 : 1,
                            marginHorizontal: 0,
                            marginTop: 5,
                            marginBottom: 10,
                          },
                        ]}
                      >
                        <View style={styles.timelineCol}>
                          <View style={{ alignItems: "center" }}>
                            <View
                              style={[
                                styles.dot,
                                {
                                  backgroundColor: isMaint
                                    ? colors.maintenance
                                    : colors.success,
                                },
                              ]}
                            />
                            <View
                              style={[
                                styles.line,
                                { backgroundColor: colors.border },
                              ]}
                            />
                            <View
                              style={[
                                styles.dot,
                                {
                                  backgroundColor: isMaint
                                    ? colors.maintenance
                                    : colors.danger,
                                },
                              ]}
                            />
                          </View>
                          <View
                            style={{
                              marginLeft: 8,
                              justifyContent: "space-between",
                              paddingVertical: 2,
                            }}
                          >
                            <Text
                              style={[
                                styles.timeText,
                                { color: colors.textMain },
                              ]}
                            >
                              ออก{" "}
                              {item.start
                                ? formatDateTimeThai(item.start)
                                : "-"}
                            </Text>
                            <Text
                              style={[
                                styles.timeText,
                                { color: colors.textSub },
                              ]}
                            >
                              คืน{" "}
                              {item.end ? formatDateTimeThai(item.end) : "-"}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={{
                            height: 1,
                            backgroundColor: colors.border,
                            marginVertical: 10,
                          }}
                        />

                        <View style={styles.detailRow}>
                          <View style={{ flex: 1.2, paddingRight: 5 }}>
                            <Text
                              style={[
                                styles.userLabel,
                                { color: colors.textSub },
                              ]}
                            >
                              {isMaint ? "ผู้แจ้งซ่อม" : "ผู้ใช้งาน"}
                            </Text>
                            <Text
                              style={[
                                styles.userName,
                                { color: colors.textMain },
                              ]}
                            >
                              {isMaint ? (
                                <Ionicons
                                  name="build"
                                  size={10}
                                  color={color}
                                />
                              ) : (
                                <Ionicons
                                  name="person-circle"
                                  size={12}
                                  color={colors.textSub}
                                />
                              )}{" "}
                              {item.fullname ||
                                item.user ||
                                (isMaint ? "แจ้งซ่อม" : "ไม่ระบุชื่อ")}
                            </Text>

                            {item.phone && item.phone !== "-" && (
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  marginTop: 2,
                                }}
                              >
                                <Ionicons
                                  name="call"
                                  size={10}
                                  color={colors.textSub}
                                  style={{ marginRight: 4 }}
                                />
                                <Text
                                  style={{
                                    fontSize: 10,
                                    color: colors.textSub,
                                  }}
                                >
                                  {item.phone}
                                </Text>
                              </View>
                            )}
                          </View>

                          <View style={{ flex: 1.5 }}>
                            <Text
                              style={[
                                styles.userLabel,
                                { color: colors.textSub },
                              ]}
                            >
                              สถานที่ไป
                            </Text>
                            <Text
                              style={{
                                color: colors.textMain,
                                fontSize: 11,
                                fontWeight: "bold",
                              }}
                              numberOfLines={2}
                            >
                              {item.destination ||
                                (isMaint ? "ศูนย์บริการ/อู่ซ่อม" : "-")}
                            </Text>
                          </View>

                          <View
                            style={{
                              flex: 0.8,
                              alignItems: "flex-end",
                              justifyContent: "center",
                            }}
                          >
                            <View
                              style={[styles.badge, { backgroundColor: color }]}
                            >
                              <Text style={styles.badgeText}>{text}</Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={{ alignItems: "center", marginTop: 20 }}>
                    <Text style={{ color: colors.textSub }}>
                      ไม่มีการจองในวันนี้
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bg }]}
      edges={["left", "right"]}
    >
      <StatusBar
        barStyle={isDarkMode ? "light-content" : "dark-content"}
        backgroundColor={colors.bg}
      />
      <View style={styles.header}>
        <View>
          <Text style={[styles.appTitle, { color: colors.textMain }]}>
            Car Dashboard
          </Text>
          <Text style={[styles.appSubtitle, { color: colors.textSub }]}>
            สถานะรถและประวัติการใช้งาน
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleReset}
          style={[styles.resetBtn, { borderColor: colors.border }]}
        >
          <Ionicons name="refresh" size={14} color={colors.textSub} />
          <Text style={{ color: colors.textSub, fontSize: 12, marginLeft: 4 }}>
            รีเซ็ต
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 15,
          marginBottom: 10,
        }}
      >
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "usage" && {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
              shadowOpacity: 0.3,
              shadowRadius: 5,
              elevation: 3,
            },
          ]}
          onPress={() => setActiveTab("usage")}
        >
          <Ionicons
            name="car-sport"
            size={14}
            color={activeTab === "usage" ? "#fff" : colors.textSub}
            style={{ marginRight: 6 }}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === "usage" ? "#fff" : colors.textSub },
            ]}
          >
            การใช้งาน
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "maintenance" && {
              backgroundColor: colors.maintenance,
              shadowColor: colors.maintenance,
              shadowOpacity: 0.3,
              shadowRadius: 5,
              elevation: 3,
            },
          ]}
          onPress={() => setActiveTab("maintenance")}
        >
          <FontAwesome5
            name="tools"
            size={12}
            color={activeTab === "maintenance" ? "#fff" : colors.textSub}
            style={{ marginRight: 6 }}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === "maintenance" ? "#fff" : colors.textSub },
            ]}
          >
            ซ่อมบำรุง
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        data={filteredHistory}
        keyExtractor={(item, index) =>
          item.id ? item.id.toString() : index.toString()
        }
        renderItem={({ item }) =>
          activeTab === "usage" ? (
            <HistoryItem item={item} />
          ) : (
            <MaintenanceItem item={item} />
          )
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={{ marginBottom: 20 }}>
              <View style={styles.sectionHeader}>
                <FontAwesome5 name="car" size={14} color={colors.textMain} />
                <Text style={[styles.sectionTitle, { color: colors.textMain }]}>
                  สถานะยานพาหนะ
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  paddingHorizontal: GAP,
                  justifyContent: "space-between",
                }}
              >
                {cars.map((car) => (
                  <CarCard
                    key={car.id}
                    item={car}
                    schedule={schedules[car.id] || []}
                    isSelected={selectedCarId === car.id}
                    onPress={handleCarPress}
                    onOpenSchedule={handleOpenSchedule}
                    colors={colors}
                    isDarkMode={isDarkMode}
                  />
                ))}
              </View>
            </View>
            <View style={{ paddingHorizontal: 15, marginBottom: 15 }}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons
                  name="history"
                  size={16}
                  color={colors.textMain}
                />
                <Text style={[styles.sectionTitle, { color: colors.textMain }]}>
                  ประวัติ
                </Text>
              </View>

              <View style={{ gap: 10 }}>
                {/* Filters */}
                <View style={{ flexDirection: "row" }}>
                  <TouchableOpacity
                    style={[
                      styles.filterBox,
                      {
                        flex: 1,
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => openModal("car")}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View>
                        <Text
                          style={[
                            styles.filterLabel,
                            { color: colors.textSub },
                          ]}
                        >
                          เลือกรถ
                        </Text>
                        <Text
                          style={[
                            styles.filterValue,
                            { color: colors.textMain },
                          ]}
                          numberOfLines={1}
                        >
                          {selectedCarId
                            ? cars.find((c) => c.id === selectedCarId)?.name
                            : "-- แสดงรถทุกคัน --"}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-down"
                        size={14}
                        color={colors.textSub}
                      />
                    </View>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={[
                      styles.filterBox,
                      {
                        flex: 0.8,
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => openModal("day")}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View>
                        <Text
                          style={[
                            styles.filterLabel,
                            { color: colors.textSub },
                          ]}
                        >
                          วันที่
                        </Text>
                        <Text
                          style={[
                            styles.filterValue,
                            { color: colors.textMain },
                          ]}
                        >
                          {filterDay ? filterDay : "ทุกวัน"}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-down"
                        size={14}
                        color={colors.textSub}
                      />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterBox,
                      {
                        flex: 1,
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => openModal("month")}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View>
                        <Text
                          style={[
                            styles.filterLabel,
                            { color: colors.textSub },
                          ]}
                        >
                          เดือน
                        </Text>
                        <Text
                          style={[
                            styles.filterValue,
                            { color: colors.textMain },
                          ]}
                        >
                          {filterMonth
                            ? THAI_MONTHS.find((m) => m.id === filterMonth)
                                ?.name
                            : "ทุกเดือน"}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-down"
                        size={14}
                        color={colors.textSub}
                      />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterBox,
                      {
                        flex: 0.8,
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => openModal("year")}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View>
                        <Text
                          style={[
                            styles.filterLabel,
                            { color: colors.textSub },
                          ]}
                        >
                          ปี
                        </Text>
                        <Text
                          style={[
                            styles.filterValue,
                            { color: colors.textMain },
                          ]}
                        >
                          {filterYear}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-down"
                        size={14}
                        color={colors.textSub}
                      />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.searchBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={fetchData}
                  >
                    <Ionicons name="search" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={() =>
          !loading && (
            <View style={styles.emptyState}>
              <Ionicons
                name="file-tray-outline"
                size={48}
                color={colors.border}
              />
              <Text style={{ color: colors.textSub, marginTop: 10 }}>
                {activeTab === "usage"
                  ? "ไม่พบข้อมูลประวัติการใช้งาน"
                  : "ไม่พบข้อมูลประวัติการซ่อมบำรุง"}
              </Text>
            </View>
          )
        }
      />

      {/* Modals เลือกเงื่อนไข (รถ, วัน, เดือน, ปี) */}
      <Modal
        transparent={true}
        visible={modalVisible}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.modalBg, borderColor: colors.border },
            ]}
          >
            <View
              style={{
                padding: 15,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "bold",
                  color: colors.textMain,
                }}
              >
                เลือกรายการ
              </Text>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {modalType === "car" && (
                <View>
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      { borderBottomColor: colors.border },
                    ]}
                    onPress={() => handleSelect(null)}
                  >
                    <Text style={{ color: colors.primary, fontWeight: "bold" }}>
                      -- แสดงรถทุกคัน --
                    </Text>
                  </TouchableOpacity>
                  {cars.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.modalItem,
                        { borderBottomColor: colors.border },
                      ]}
                      onPress={() => handleSelect(c.id)}
                    >
                      <Text style={{ color: colors.textMain }}>
                        {c.car_number ? `${c.car_number} - ` : ""}
                        {c.name} ({c.plate})
                      </Text>
                      {selectedCarId === c.id && (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={colors.success}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {modalType === "day" && (
                <View>
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      { borderBottomColor: colors.border },
                    ]}
                    onPress={() => handleSelect(null)}
                  >
                    <Text style={{ color: colors.primary, fontWeight: "bold" }}>
                      -- ทุกวัน --
                    </Text>
                  </TouchableOpacity>
                  {DAYS_LIST.map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.modalItem,
                        { borderBottomColor: colors.border },
                      ]}
                      onPress={() => handleSelect(d)}
                    >
                      <Text style={{ color: colors.textMain }}>{d}</Text>
                      {filterDay === d && (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={colors.success}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {modalType === "month" && (
                <View>
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      { borderBottomColor: colors.border },
                    ]}
                    onPress={() => handleSelect(null)}
                  >
                    <Text style={{ color: colors.primary, fontWeight: "bold" }}>
                      -- ทุกเดือน --
                    </Text>
                  </TouchableOpacity>
                  {THAI_MONTHS.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.modalItem,
                        { borderBottomColor: colors.border },
                      ]}
                      onPress={() => handleSelect(m.id)}
                    >
                      <Text style={{ color: colors.textMain }}>{m.name}</Text>
                      {filterMonth === m.id && (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={colors.success}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {modalType === "year" && (
                <View>
                  {YEARS_LIST.map((y) => (
                    <TouchableOpacity
                      key={y}
                      style={[
                        styles.modalItem,
                        { borderBottomColor: colors.border },
                      ]}
                      onPress={() => handleSelect(y)}
                    >
                      <Text style={{ color: colors.textMain }}>{y}</Text>
                      {filterYear === y && (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={colors.success}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
            <TouchableOpacity
              style={{ padding: 15, alignItems: "center" }}
              onPress={() => setModalVisible(false)}
            >
              <Text style={{ color: colors.danger }}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ✅ Detail Modal — เปิดได้ 2 ทาง: จากรายการประวัติ และจากรายการในปฏิทิน
          ⚠️ Android: <Modal> คือ native Dialog — Modal 2 ตัวที่เป็นพี่น้องกัน
          ตัวที่เปิดทีหลังจะไม่ถูกยกขึ้นมาแสดงจนกว่าตัวแรกจะปิด (ดูเหมือนกดไม่ติด)
          → ถ้าปฏิทินเปิดอยู่ ต้อง render ไว้ "ข้างใน" Modal ปฏิทิน */}
      {!scheduleModalVisible && (
        <Modal
          transparent={true}
          visible={detailModalVisible}
          animationType="fade"
          onRequestClose={() => setDetailModalVisible(false)}
        >
          <View style={styles.modalOverlay}>{renderDetailModal()}</View>
        </Modal>
      )}

      {/* ✅ Schedule Modal (Calendar) */}
      <Modal
        transparent={true}
        visible={scheduleModalVisible}
        animationType="slide"
        onRequestClose={() => setScheduleModalVisible(false)}
      >
        {renderScheduleModal()}

        {scheduleModalVisible && (
          <Modal
            transparent={true}
            visible={detailModalVisible}
            animationType="fade"
            onRequestClose={() => setDetailModalVisible(false)}
          >
            <View style={styles.modalOverlay}>{renderDetailModal()}</View>
          </Modal>
        )}
      </Modal>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      {showScrollTop && (
        <TouchableOpacity
          style={[
            styles.scrollTopBtn,
            {
              backgroundColor: isDarkMode
                ? "rgba(30, 41, 59, 0.9)"
                : "rgba(255, 255, 255, 0.9)",
              borderColor: isDarkMode ? "#334155" : "#e2e8f0",
            },
          ]}
          onPress={scrollToTop}
        >
          <Ionicons
            name="arrow-up"
            size={24}
            color={isDarkMode ? "#fff" : "#2563eb"}
          />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 15,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  appTitle: { fontSize: 22, fontWeight: "bold", marginBottom: 2 },
  appSubtitle: { fontSize: 12 },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 6,
    borderWidth: 1,
    borderRadius: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: Platform.OS === "ios" ? 0 : 15,
  },
  sectionTitle: { fontSize: 14, fontWeight: "bold", marginLeft: 8 },
  carCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  carHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  carNumberCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  carNumberText: {
    fontWeight: "bold",
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  carImgBox: {
    alignItems: "center",
    justifyContent: "center",
    height: 90,
    position: "relative",
    marginVertical: 5,
  },
  carImage: { width: "90%", height: "100%" },
  selectedOverlay: { position: "absolute", top: 5, right: 5 },
  carName: { fontSize: 15, fontWeight: "bold", marginBottom: 2 },
  carPlate: { fontSize: 12 },
  typeBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  carFooter: { borderRadius: 8, padding: 10 },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  infoText: { fontSize: 11 },
  tabContainer: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    marginBottom: 15,
    borderWidth: 1,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  tabText: { fontSize: 13, fontWeight: "bold" },
  filterBox: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
  },
  filterLabel: { fontSize: 9, marginBottom: 2 },
  filterValue: { fontSize: 12, fontWeight: "bold" },
  searchBtn: {
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  historyCard: {
    marginHorizontal: 15,
    marginBottom: 10,
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
  },
  timelineCol: { flexDirection: "row" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 2, height: 16, marginVertical: 2 },
  timeText: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  detailRow: { flexDirection: "row", justifyContent: "space-between" },
  userLabel: { fontSize: 9, marginBottom: 2 },
  userName: { fontSize: 12, fontWeight: "bold" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  maintCard: {
    marginHorizontal: 15,
    marginBottom: 10,
    borderRadius: 12,
    padding: 15,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  maintHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  emptyState: { alignItems: "center", marginTop: 40 },
  loadingOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  modalItem: {
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  scrollTopBtn: {
    position: "absolute",
    bottom: 80,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    borderWidth: 1,
  },
});
