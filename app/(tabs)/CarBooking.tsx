import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import axios from "axios";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
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
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useColorScheme,
} from "react-native";

// 🔥 Import Calendar
import { Calendar, LocaleConfig } from "react-native-calendars";

import { API_BASE } from "../../constants/config";
import { useAuth } from "../_layout";

// --- 🇹🇭 ตั้งค่าภาษาไทยให้ปฏิทิน ---
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

const DEFAULT_CAR_IMAGE =
  "https://cdn-icons-png.flaticon.com/512/3202/3202926.png";
const { width } = Dimensions.get("window");

// --- 👥 โหมด "จองให้ตัวเอง + คนอื่น" ---
interface Employee {
  id: number | string;
  fullname: string;
  phone: string | null;
}

// --- 🧭 กติกาการเดินทาง (เซิร์ฟเวอร์ส่งค่าจริงมาใน get_booking_data ใช้ค่านี้เป็นค่าตั้งต้น) ---
const DEFAULT_MAX_PASSENGERS = 3;
const PLAN_REQUIRED_OVER_DAYS = 2; // เกินกี่วันถึงต้องแนบไฟล์แผนงาน

// ไฟล์แผนงานที่เลือกไว้ในเครื่อง (ยังไม่อัปโหลด)
interface PlanFile {
  uri: string;
  name: string;
  type: string;
}

// ข้อมูลที่กรอกแยกต่อรถ 1 คัน (ใช้เฉพาะโหมด group)
interface CarEntry {
  driverId: number | string | null;
  driverName: string;
  phone: string;
  destination: string;
  reason: string;
  startDate: Date;
  endDate: Date;
  // 👥 ผู้ร่วมเดินทาง / คนขับ / แผนงาน
  passengerIds: (number | string)[];
  wheelId: number | string | null; // คนขับ — ต้องเป็นผู้ใช้รถ หรือหนึ่งในผู้ร่วมเดินทาง
  planFiles: PlanFile[];
}

// นับวันปฏิทินรวมหัวท้าย (29→31 = 3 วัน) — ต้องตรงกับ CarManager::tripDays() ฝั่ง PHP
const tripDaysBetween = (start: Date | string, end: Date | string) => {
  const toDay = (v: Date | string) => {
    const d = typeof v === "string" ? new Date(v.replace(" ", "T")) : new Date(v);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const s = toDay(start);
  const e = toDay(end);
  if (s == null || e == null || e < s) return 1;
  return Math.round((e - s) / 86400000) + 1;
};

const needsPlanFile = (start: Date | string, end: Date | string) =>
  tripDaysBetween(start, end) > PLAN_REQUIRED_OVER_DAYS;

// ข้อความจาก createBooking() ฝั่ง PHP มี <br> ติดมา ต้องแปลงก่อนแสดงในแอป
const stripHtml = (s: string) =>
  (s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();

// --- 📅 Helper Functions ---
const formatDateDisplay = (date: Date) => {
  const d = new Date(date);
  const year = d.getFullYear() + 543;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}/${month}/${year}`;
};

const formatTimeDisplay = (date: Date) => {
  const d = new Date(date);
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
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

// 🔥 Helper คำนวณสถานะและสีสำหรับปฏิทิน
const getStatusInfo = (
  status: string,
  endDateStr: string,
  startDateStr: string,
  colors: any,
) => {
  const now = new Date();
  const end = new Date(endDateStr.replace(" ", "T"));

  if (status === "maintenance" || status === "repair") {
    return { text: "แจ้งซ่อม", color: colors.maintenance };
  } else if (status === "active" || status === "approved") {
    if (now > end) {
      return { text: "เกินกำหนด", color: colors.statusOverdue };
    } else {
      // รวบทั้งสถานะรอถึงเวลาและกำลังใช้งาน ให้แสดงเป็น "จองแล้ว" สีเขียวทั้งหมด
      return { text: "จองแล้ว", color: colors.statusApproved };
    }
  }

  return { text: status, color: colors.subText };
};

// --- ⚡ Blinking Component ---
const BlinkingView = ({ children, style }: any) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [fadeAnim]);
  return (
    <Animated.View style={[style, { opacity: fadeAnim }]}>
      {children}
    </Animated.View>
  );
};

// --- 🎨 Custom Alert Component ---
const CustomAlertModal = ({
  visible,
  type,
  title,
  message,
  onConfirm,
  onCancel,
  showCancel,
  showConfirm = true,
  themeColors,
  isDark,
}: any) => {
  if (!visible) return null;
  let iconName: any = "checkmark-circle",
    iconColor = "#10b981",
    bgIconColor = "rgba(16, 185, 129, 0.1)";
  if (type === "warning") {
    iconName = "alert-circle";
    iconColor = "#f59e0b";
    bgIconColor = "rgba(245, 158, 11, 0.1)";
  } else if (type === "error") {
    iconName = "close-circle";
    iconColor = "#ef4444";
    bgIconColor = "rgba(239, 68, 68, 0.1)";
  } else if (type === "question") {
    iconName = "help-circle";
    iconColor = "#3b82f6";
    bgIconColor = "rgba(59, 130, 246, 0.1)";
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: themeColors.card,
            width: "100%",
            maxWidth: 340,
            borderRadius: 20,
            padding: 25,
            alignItems: "center",
            borderWidth: 1,
            borderColor: isDark ? "#334155" : "#fff",
          }}
        >
          <View
            style={{
              width: 70,
              height: 70,
              borderRadius: 35,
              backgroundColor: bgIconColor,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 15,
            }}
          >
            <Ionicons name={iconName} size={40} color={iconColor} />
          </View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "bold",
              color: themeColors.text,
              marginBottom: 10,
              textAlign: "center",
            }}
          >
            {title}
          </Text>
          {/* ScrollView ครอบไว้ เพราะสรุปผลจองแบบกลุ่มอาจยาวหลายบรรทัด */}
          <ScrollView
            style={{ maxHeight: 260, width: "100%" }}
            contentContainerStyle={{ paddingBottom: 5 }}
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={{
                fontSize: 15,
                color: themeColors.subText,
                textAlign: "center",
                marginBottom: 25,
                lineHeight: 22,
              }}
            >
              {message}
            </Text>
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
            {showCancel && (
              <TouchableOpacity
                onPress={onCancel}
                style={{
                  flex: 1,
                  backgroundColor: isDark ? "#334155" : "#e5e7eb",
                  padding: 12,
                  borderRadius: 10,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: isDark ? "#cbd5e1" : "#374151",
                    fontWeight: "bold",
                  }}
                >
                  ยกเลิก
                </Text>
              </TouchableOpacity>
            )}
            {showConfirm && (
              <TouchableOpacity
                onPress={onConfirm}
                style={{
                  flex: 1,
                  backgroundColor: iconColor,
                  padding: 12,
                  borderRadius: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "bold" }}>ตกลง</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function CarBookingScreen() {
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();

  // State Hooks
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    type: "success",
    title: "",
    message: "",
    showCancel: false,
    showConfirm: true,
    onConfirm: () => {},
    onCancel: () => setAlertConfig((prev) => ({ ...prev, visible: false })),
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [cars, setCars] = useState<any[]>([]);
  const [phone, setPhone] = useState("");
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [selectedCarId, setSelectedCarId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<
    "all" | "available" | "unavailable"
  >("all");

  // Return Car Modal States
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnBookingData, setReturnBookingData] = useState<any>(null);
  const [parkingLoc, setParkingLoc] = useState("");
  const [energyLevel, setEnergyLevel] = useState("");
  const [issue, setIssue] = useState("");
  const [isCharging, setIsCharging] = useState(false);

  // 🔥 Schedule Modal States (เพิ่มใหม่)
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduleModalCar, setScheduleModalCar] = useState<any>(null);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string>("");

  // 🔥 Detail Modal States (สำหรับดูรายละเอียดในปฏิทิน)
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);

  // Date Picker Config (carId มีค่าเมื่อเป็นการเลือกวัน-เวลาของรถรายคันในโหมด group)
  const [pickerConfig, setPickerConfig] = useState<{
    mode: "date" | "time";
    target: "start" | "end";
    carId?: number | null;
  } | null>(null);

  // 👥 โหมดจองให้ตัวเอง + คนอื่น
  const [canBookForOthers, setCanBookForOthers] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [bookingMode, setBookingMode] = useState<"self" | "group">("self");
  const [carEntries, setCarEntries] = useState<Record<number, CarEntry>>({});
  const [driverPickerCarId, setDriverPickerCarId] = useState<number | null>(
    null,
  );
  const [driverSearch, setDriverSearch] = useState("");

  // 👥 ผู้ร่วมเดินทาง / คนขับ / ไฟล์แผนงาน (โหมดจองเอง — โหมด group เก็บใน carEntries)
  const [passengerIds, setPassengerIds] = useState<(number | string)[]>([]);
  const [wheelId, setWheelId] = useState<number | string | null>(null);
  const [planFiles, setPlanFiles] = useState<PlanFile[]>([]);
  const [maxPassengers, setMaxPassengers] = useState(DEFAULT_MAX_PASSENGERS);
  // "self" = ฟอร์มจองเอง, ตัวเลข = รหัสรถในโหมด group
  const [passengerPickerFor, setPassengerPickerFor] = useState<
    "self" | number | null
  >(null);
  const [passengerSearch, setPassengerSearch] = useState("");

  const isDark = colorScheme === "dark";
  const themeColors = isDark ? DarkColors : LightColors;
  const themeStyles = useMemo(() => getStyles(isDark), [isDark]);

  // ข้อมูลการจองบาง response ไม่มี car_type จึงต้องหา type จากรายการรถด้วย car_id
  const returnCarType =
    returnBookingData?.car_type ??
    returnBookingData?.type ??
    cars.find(
      (car) => String(car.id) === String(returnBookingData?.car_id ?? ""),
    )?.type;
  const isReturnCarEV =
    String(returnCarType ?? "")
      .trim()
      .toUpperCase() === "EV";

  // 🔥 Memoized Calendar Theme (เพื่อความสมูทในการเปลี่ยนเดือน และจัดตัวเลข)
  const calendarTheme = useMemo(() => {
    return {
      calendarBackground: themeColors.card,
      textSectionTitleColor: themeColors.text,
      dayTextColor: themeColors.text,
      todayTextColor: themeColors.primary,
      selectedDayBackgroundColor: themeColors.primary,
      selectedDayTextColor: "#ffffff",
      monthTextColor: themeColors.text,
      textDisabledColor: themeColors.border,
      arrowColor: themeColors.text,
      textMonthFontWeight: "bold",
      textDayHeaderFontWeight: "bold",
      textDayFontSize: 15,
      textMonthFontSize: 17,
      textDayHeaderFontSize: 13,
      // จัดบรรทัด "จ. อ. พ." ให้เรียงตรงกับตัวเลขวันที่
      "stylesheet.calendar.header": {
        week: {
          marginTop: 7,
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 8,
        },
        dayHeader: {
          width: 32,
          textAlign: "center",
          fontSize: 13,
          color: themeColors.text,
          fontWeight: "bold",
        },
      },
      // ทำให้ตัวเลขจัดกลาง Grid ในแบบ period อย่างสมูท
      "stylesheet.day.period": {
        base: {
          width: 36,
          height: 36,
          alignItems: "center",
          justifyContent: "center",
        },
        todayText: {
          fontWeight: "bold",
          color: themeColors.primary,
        },
      },
    } as any;
  }, [themeColors]);

  // Validate Logic
  // from/to เป็น optional เพื่อให้โหมด group ส่งช่วงเวลาของรถรายคันเข้ามาได้
  // (โหมด self เรียกแบบเดิมได้เพราะมี default parameter)
  const validateBookingConflict = (
    selectedCar: any,
    from: Date = startDate,
    to: Date = endDate,
  ) => {
    if (!selectedCar?.schedule?.length) return { conflict: false };
    const reqStart = from.getTime(),
      reqEnd = to.getTime();
    for (const b of selectedCar.schedule) {
      if (["cancelled", "rejected", "completed"].includes(b.status)) continue;

      // 🟢 ป้องกัน error ถ้ารูปแบบวันที่พัง
      if (!b.start || !b.end) continue;

      const start = new Date(b.start.replace(" ", "T")).getTime(),
        end = new Date(b.end.replace(" ", "T")).getTime();
      if (reqStart < end && reqEnd > start)
        return { conflict: true, details: b };
    }
    return { conflict: false };
  };

  const filteredCars = useMemo(() => {
    if (filterType === "all") return cars;
    return cars.filter((c) => {
      // โหมด group: คันที่เลือกไว้แล้วต้องไม่หายไปจากรายการ ไม่ว่าตัวกรองจะเป็นอะไร
      // (ไม่งั้นผู้ใช้จะเห็นการ์ดรายละเอียดด้านล่าง แต่หาการ์ดรถที่กดเลือกไว้ไม่เจอ)
      if (bookingMode === "group" && carEntries[c.id]) return true;

      const isMaintenance = c.status === "maintenance";
      const conflictResult: any = validateBookingConflict(c);

      // ถ้ารถติดซ่อม หรือมีคิวชน ถือว่า "ไม่ว่าง"
      const isUnavailable = isMaintenance || conflictResult.conflict;

      return filterType === "available" ? !isUnavailable : isUnavailable;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, filterType, startDate, endDate, bookingMode, carEntries]);

  // --- 👥 Helper สำหรับโหมด group ---

  // "คันที่ 3 — Toyota Vios" (ให้ตรงกับข้อความสรุปที่ API ส่งกลับ)
  const carLabel = useCallback(
    (carId: number) => {
      const c = cars.find((x) => String(x.id) === String(carId));
      if (!c) return `รถ #${carId}`;
      return (c.car_number ? `คันที่ ${c.car_number} — ` : "") + c.name;
    },
    [cars],
  );

  const selectedCarIds = useMemo(
    () => Object.keys(carEntries).map(Number),
    [carEntries],
  );

  // รายชื่อพนักงานใน Modal: ปักหมุด "ตัวฉัน" บนสุด แล้วค่อยรายชื่อที่ผ่านการค้นหา
  const filteredEmployees = useMemo(() => {
    const q = driverSearch.trim().toLowerCase();
    const list = q
      ? employees.filter((e) => (e.fullname || "").toLowerCase().includes(q))
      : employees;
    // ตัวฉันแสดงเป็นแถวแยกด้านบนแล้ว จึงกันซ้ำออกจากรายการหลัก
    return list.filter((e) => String(e.id) !== String(user?.id));
  }, [employees, driverSearch, user?.id]);

  const updateEntry = (carId: number, patch: Partial<CarEntry>) => {
    setCarEntries((prev) => {
      if (!prev[carId]) return prev;
      return { ...prev, [carId]: { ...prev[carId], ...patch } };
    });
  };

  const removeEntry = (carId: number) => {
    setCarEntries((prev) => {
      const next = { ...prev };
      delete next[carId];
      return next;
    });
  };

  // =====================================================================
  // 👥 ผู้ร่วมเดินทาง / คนขับ / ไฟล์แผนงาน
  // =====================================================================
  const empName = useCallback(
    (id: number | string | null | undefined) => {
      if (id == null || id === "") return "";
      if (String(id) === String(user?.id))
        return user?.fullname || "ตัวฉัน";
      const e = employees.find((x) => String(x.id) === String(id));
      return e?.fullname || `user #${id}`;
    },
    [employees, user?.id, user?.fullname],
  );

  // ผู้ร่วมเดินทางของฟอร์มที่กำลังเปิดอยู่ (จองเอง หรือรถคันหนึ่งในโหมด group)
  const passengersOf = (target: "self" | number): (number | string)[] =>
    target === "self" ? passengerIds : (carEntries[target]?.passengerIds ?? []);

  const setPassengersOf = (
    target: "self" | number,
    ids: (number | string)[],
  ) => {
    if (target === "self") {
      setPassengerIds(ids);
      // คนขับที่เลือกไว้หลุดออกจากกลุ่มแล้ว → กลับไปเป็นผู้ใช้รถขับเอง
      if (wheelId != null && !ids.some((i) => String(i) === String(wheelId)))
        setWheelId(null);
    } else {
      const e = carEntries[target];
      const patch: Partial<CarEntry> = { passengerIds: ids };
      if (e?.wheelId != null && !ids.some((i) => String(i) === String(e.wheelId)))
        patch.wheelId = null;
      updateEntry(target, patch);
    }
  };

  const togglePassenger = (target: "self" | number, id: number | string) => {
    const current = passengersOf(target);
    const exists = current.some((i) => String(i) === String(id));
    if (exists) {
      setPassengersOf(
        target,
        current.filter((i) => String(i) !== String(id)),
      );
      return;
    }
    if (current.length >= maxPassengers) {
      showAlert(
        "warning",
        "เลือกได้ไม่เกิน " + maxPassengers + " คน",
        `ผู้ร่วมเดินทางสูงสุด ${maxPassengers} คน ถ้าจะเปลี่ยนคน ให้เอาคนเดิมออกก่อน`,
      );
      return;
    }
    setPassengersOf(target, [...current, id]);
  };

  // เจ้าของรถของฟอร์มนั้น ๆ (จองเอง = ตัวเรา, group = ผู้ใช้รถของคันนั้น)
  const ownerOf = (target: "self" | number): (number | string) | null =>
    target === "self" ? (user?.id ?? null) : (carEntries[target]?.driverId ?? null);

  const wheelOf = (target: "self" | number) =>
    target === "self" ? wheelId : (carEntries[target]?.wheelId ?? null);

  const setWheelOf = (target: "self" | number, id: number | string | null) => {
    if (target === "self") setWheelId(id);
    else updateEntry(target, { wheelId: id });
  };

  const planFilesOf = (target: "self" | number): PlanFile[] =>
    target === "self" ? planFiles : (carEntries[target]?.planFiles ?? []);

  const setPlanFilesOf = (target: "self" | number, files: PlanFile[]) => {
    if (target === "self") setPlanFiles(files);
    else updateEntry(target, { planFiles: files });
  };

  const removePlanFile = (target: "self" | number, index: number) => {
    setPlanFilesOf(
      target,
      planFilesOf(target).filter((_, i) => i !== index),
    );
  };

  // แนบรูป (ถ่ายเอกสารแผนงานมาก็ได้)
  const pickPlanImages = async (target: "self" | number) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.7,
      });
      if (result.canceled) return;
      const picked: PlanFile[] = result.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName || `plan_${Date.now()}_${i}.jpg`,
        type: a.mimeType || "image/jpeg",
      }));
      setPlanFilesOf(target, [...planFilesOf(target), ...picked]);
    } catch (e) {
      console.log("Plan image picker error:", e);
    }
  };

  // แนบไฟล์ (PDF / Word / Excel)
  const pickPlanDocs = async (target: "self" | number) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const picked: PlanFile[] = result.assets.map((a, i) => ({
        uri: a.uri,
        name: a.name || `plan_${Date.now()}_${i}`,
        type: a.mimeType || "application/octet-stream",
      }));
      setPlanFilesOf(target, [...planFilesOf(target), ...picked]);
    } catch (e) {
      console.log("Plan document picker error:", e);
    }
  };

  // ลิงก์เปิดไฟล์แผนงานที่อัปโหลดแล้ว (API คืนมาแค่ชื่อไฟล์)
  const planFileUrl = (fileName: string) =>
    `${API_BASE}/uploads/carplans/${encodeURIComponent(fileName)}`;

  // ถ้าสิทธิ์ถูกถอนระหว่างที่ผู้ใช้ค้างอยู่ในโหมด group ต้องเด้งกลับโหมด self ไม่ให้ค้าง
  useEffect(() => {
    if (!canBookForOthers && bookingMode === "group") {
      setBookingMode("self");
      setCarEntries({});
      setDriverPickerCarId(null);
    }
  }, [canBookForOthers, bookingMode]);

  // 🔥 คำนวณวันที่สำหรับปฏิทิน
  const modalMarkedDates = useMemo(() => {
    if (!scheduleModalCar || !scheduleModalCar.schedule) return {};
    const marks: any = {};

    // กรองเอาเฉพาะ active, approved และ maintenance (ซ่อนที่คืนแล้วและยกเลิก)
    const carSchedule = scheduleModalCar.schedule.filter(
      (h: any) =>
        h.status === "active" ||
        h.status === "approved" ||
        h.status === "maintenance" ||
        h.type === "maintenance",
    );

    carSchedule.forEach((item: any) => {
      // 🟢 ดักจับ Error
      if (!item.start || !item.end) return;

      let dateKey = item.start.split(" ")[0];
      let endDateKey = item.end.split(" ")[0];
      const { color } = getStatusInfo(
        item.status,
        item.end,
        item.start,
        themeColors,
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
        color: themeColors.primary,
        textColor: "#ffffff",
        startingDay: existing.startingDay,
        endingDay: existing.endingDay,
      };
    }

    return marks;
  }, [scheduleModalCar, themeColors, calendarSelectedDate]);

  // 🔥 รายการของวันที่เลือกใน Modal
  const modalSelectedDateEvents = useMemo(() => {
    if (
      !scheduleModalCar ||
      !scheduleModalCar.schedule ||
      !calendarSelectedDate
    )
      return [];

    return scheduleModalCar.schedule.filter((item: any) => {
      // 🟢 ดักจับ Error
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
  }, [scheduleModalCar, calendarSelectedDate]);

  // 🔥 ฟังก์ชันเปิด Modal ตารางงาน
  const handleOpenSchedule = useCallback((car: any) => {
    setScheduleModalCar(car);
    setCalendarSelectedDate(new Date().toISOString().split("T")[0]); // Default วันปัจจุบัน
    setScheduleModalVisible(true);
  }, []);

  // 🔥 ฟังก์ชันเปิด Modal รายละเอียด (Detail)
  const openDetail = (item: any) => {
    console.log("👉 ข้อมูลคิวที่กดดู:", item); // <--- เพิ่มบรรทัดนี้
    setSelectedDetail(item);
    setDetailModalVisible(true);
  };

  const showAlert = (
    type: string,
    title: string,
    message: string,
    showCancel = false,
    onConfirm?: () => void,
    duration?: number,
  ) => {
    setAlertConfig({
      visible: true,
      type,
      title,
      message,
      showCancel,
      showConfirm: !duration,
      onConfirm: () => {
        setAlertConfig((prev) => ({ ...prev, visible: false }));
        if (onConfirm) onConfirm();
      },
      onCancel: () => setAlertConfig((prev) => ({ ...prev, visible: false })),
    });
    if (duration)
      setTimeout(() => {
        setAlertConfig((prev) => {
          if (!prev.visible) return prev;
          return { ...prev, visible: false };
        });
        if (onConfirm) onConfirm();
      }, duration);
  };

  const fetchData = async () => {
    try {
      if (!refreshing) setLoading(true);
      const response = await axios.get(
        `${API_BASE}/api_carboooking_mobile.php?action=get_booking_data&user_id=${user?.id}`,
      );
      const { data } = response;
      if (data.status === "success") {
        setMyBookings(
          Array.isArray(data.my_bookings)
            ? data.my_bookings
            : data.activeBooking
              ? [data.activeBooking]
              : [],
        );
        if (Array.isArray(data.cars)) {
          const sortedCars = data.cars.sort((a: any, b: any) => {
            const numA = a.car_number ? parseInt(a.car_number, 10) : Infinity;
            const numB = b.car_number ? parseInt(b.car_number, 10) : Infinity;
            return numA - numB;
          });
          setCars(sortedCars);
        } else setCars([]);
        if (data.user_phone && !phone) setPhone(data.user_phone);

        // สิทธิ์ + รายชื่อพนักงาน มาใหม่ทุกครั้งที่โหลดหน้า
        // → แอดมินแก้สิทธิ์ใน ManagePermissions แล้วเห็นผลทันทีแค่ pull-to-refresh
        setCanBookForOthers(data.can_book_for_others === true);
        setEmployees(Array.isArray(data.employees) ? data.employees : []);
        // กติกาจำนวนผู้ร่วมเดินทาง ให้เซิร์ฟเวอร์เป็นคนกำหนด
        if (Number(data.max_passengers) > 0)
          setMaxPassengers(Number(data.max_passengers));
      }
    } catch (error) {
      console.error("❌ Fetch Error:", error);
      showAlert("error", "ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อข้อมูลได้");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (user?.id) fetchData();
    }, [user?.id]),
  );

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollTop(offsetY > 300);
  };

  const scrollToTop = () =>
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });

  const getCarImageUri = (imagePath: string | null) => {
    if (!imagePath) return DEFAULT_CAR_IMAGE;
    if (imagePath.startsWith("http")) return imagePath;
    let baseUrl = API_BASE;
    if (baseUrl.includes("api_mobile.php"))
      baseUrl = baseUrl
        .replace("/api_mobile.php", "")
        .replace("api_mobile.php", "");
    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    const cleanPath = imagePath.startsWith("/")
      ? imagePath.substring(1)
      : imagePath;
    return `${baseUrl}/uploads/cars/${cleanPath}`;
  };

  const showPicker = (
    target: "start" | "end",
    mode: "date" | "time",
    carId?: number,
  ) => {
    const entry = carId != null ? carEntries[carId] : null;
    const currentDate = entry
      ? target === "start"
        ? entry.startDate
        : entry.endDate
      : target === "start"
        ? startDate
        : endDate;

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: currentDate,
        onChange: (event, date) => {
          if (event.type === "set" && date)
            handleDateChange(target, date, mode, carId);
        },
        mode: mode,
        is24Hour: true,
        minimumDate: mode === "date" ? new Date() : undefined,
      });
    } else setPickerConfig({ target, mode, carId: carId ?? null });
  };

  const handleDateChange = (
    target: "start" | "end",
    newDate: Date,
    mode: "date" | "time",
    carId?: number | null,
  ) => {
    const setDate = (prev: Date) => {
      const d = new Date(prev);
      if (mode === "date")
        d.setFullYear(
          newDate.getFullYear(),
          newDate.getMonth(),
          newDate.getDate(),
        );
      else d.setHours(newDate.getHours(), newDate.getMinutes());
      return d;
    };

    // โหมด group: เขียนลงช่วงเวลาของรถคันนั้นๆ
    if (carId != null) {
      const entry = carEntries[carId];
      if (!entry) return;
      if (target === "start") {
        const updated = setDate(entry.startDate);
        const patch: Partial<CarEntry> = { startDate: updated };
        if (updated >= entry.endDate) {
          const next = new Date(updated);
          next.setHours(updated.getHours() + 4);
          patch.endDate = next;
        }
        updateEntry(carId, patch);
      } else {
        updateEntry(carId, { endDate: setDate(entry.endDate) });
      }
      return;
    }

    if (target === "start") {
      const updated = setDate(startDate);
      setStartDate(updated);
      if (updated >= endDate) {
        const next = new Date(updated);
        next.setHours(updated.getHours() + 4);
        setEndDate(next);
      }
    } else {
      setEndDate(setDate(endDate));
    }
  };

  const handleSetNow = () => {
    const now = new Date();
    setStartDate(now);
    const next = new Date(now);
    next.setHours(now.getHours() + 4);
    setEndDate(next);
  };
  const formatDT = (date: Date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const submitBooking = async () => {
    try {
      // multipart เพราะต้องแนบไฟล์แผนงานไปด้วย (ทริปเกิน 2 วัน)
      const form = new FormData();
      form.append("action", "book_car");
      form.append("user_id", String(user?.id));
      form.append("car_id", String(selectedCarId));
      form.append("phone_number", phone);
      form.append("start_datetime", formatDT(startDate) + ":00");
      form.append("end_datetime", formatDT(endDate) + ":00");
      form.append("destination", destination);
      form.append("reason", reason);
      form.append("passenger_ids", passengerIds.join(","));
      form.append("driver_choice", String(wheelId ?? user?.id ?? ""));
      planFiles.forEach((f) => form.append("plan_files[]", f as any));

      const response = await axios.post(
        `${API_BASE}/api_carboooking_mobile.php`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      let data = response.data;
      if (typeof data === "string") {
        try {
          const jsonStart = data.indexOf("{");
          const jsonEnd = data.lastIndexOf("}");
          if (jsonStart !== -1 && jsonEnd !== -1) {
            data = JSON.parse(data.substring(jsonStart, jsonEnd + 1));
          }
        } catch (e) {
          console.log("Parse JSON Error:", e);
        }
      }

      const isSuccess =
        data.status === "success" ||
        data.success === true ||
        data === "success" ||
        (data.message && data.message.toLowerCase().includes("success"));

      if (isSuccess) {
        showAlert(
          "success",
          "สำเร็จ",
          "จองรถสำเร็จ!",
          false,
          async () => {
            setDestination("");
            setReason("");
            setSelectedCarId(null);
            setPassengerIds([]);
            setWheelId(null);
            setPlanFiles([]);
            await fetchData();
            scrollToTop();
          },
          1500,
        );
      } else {
        showAlert(
          "warning",
          "แจ้งเตือน",
          typeof data === "object"
            ? data.message || "จองรถไม่สำเร็จ"
            : "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์",
        );
        await fetchData();
      }
    } catch (error: any) {
      console.error("❌ Booking Error:", error);
      showAlert("error", "ผิดพลาด", error.message || "การเชื่อมต่อขัดข้อง");
    } finally {
      setLoading(false);
    }
  };

  // --- 👥 ส่งการจองแบบกลุ่ม (หลายคัน / ระบุผู้ใช้รถแยกคัน) ---
  const submitGroupBooking = async () => {
    try {
      setLoading(true);

      const items = Object.entries(carEntries).map(([cid, e]) => ({
        car_id: Number(cid),
        driver_id: e.driverId,
        phone: e.phone.replace(/[^0-9]/g, ""), // ให้ตรงกับ preg_replace ของเว็บ
        destination: e.destination.trim(),
        reason: e.reason.trim(),
        start: formatDT(e.startDate) + ":00",
        end: formatDT(e.endDate) + ":00",
        passenger_ids: e.passengerIds,
        driver_choice: e.wheelId ?? e.driverId,
      }));

      // multipart: ไฟล์แผนงานแยกรายคัน → plan_files_<รหัสรถ>[]
      const form = new FormData();
      form.append("action", "book_car");
      form.append("booking_type", "group");
      form.append("user_id", String(user?.id));
      form.append("items", JSON.stringify(items));
      Object.entries(carEntries).forEach(([cid, e]) => {
        e.planFiles.forEach((f) =>
          form.append(`plan_files_${cid}[]`, f as any),
        );
      });

      const response = await axios.post(
        `${API_BASE}/api_carboooking_mobile.php`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      // PHP อาจแทรก warning ก่อน JSON — ใช้ตัวแยกแบบเดียวกับ submitBooking()
      let data: any = response.data;
      if (typeof data === "string") {
        try {
          const jsonStart = data.indexOf("{");
          const jsonEnd = data.lastIndexOf("}");
          if (jsonStart !== -1 && jsonEnd !== -1) {
            data = JSON.parse(data.substring(jsonStart, jsonEnd + 1));
          }
        } catch (e) {
          console.log("Parse JSON Error:", e);
        }
      }

      // ไม่มีสิทธิ์ / ข้อมูลไม่ครบ / payload พัง — API ไม่ส่ง results กลับมา
      if (!Array.isArray(data?.results)) {
        const problems = Array.isArray(data?.problems) ? data.problems : [];
        return showAlert(
          data?.code === "no_permission" ? "error" : "warning",
          data?.code === "no_permission" ? "ไม่มีสิทธิ์" : "แจ้งเตือน",
          [stripHtml(data?.message || "จองรถไม่สำเร็จ"), ...problems]
            .filter(Boolean)
            .join("\n"),
        );
      }

      const lines = data.results.map((r: any) => {
        const head = `${r.success ? "✅" : "❌"} ${r.car_label} → ${r.driver_name}`;
        if (r.success) return head;
        // ข้อความ "คุณมีการจองรถคันอื่น..." จาก createBooking พูดถึงผู้ใช้รถ ไม่ใช่คนกดจอง
        const msg = stripHtml(r.message).replace(
          /^คุณมีการจองรถคันอื่น/,
          `${r.driver_name} มีการจองรถคันอื่น`,
        );
        return `${head}\n     ${msg}`;
      });

      const alertType =
        data.status === "success"
          ? "success"
          : data.status === "partial"
            ? "warning"
            : "error";
      const alertTitle =
        data.status === "success"
          ? `จองรถสำเร็จ ${data.ok_count} คัน!`
          : data.status === "partial"
            ? "จองสำเร็จบางส่วน"
            : "จองไม่สำเร็จ:";

      showAlert(alertType, alertTitle, lines.join("\n"), false, async () => {
        // เคลียร์เฉพาะคันที่จองสำเร็จ — คันที่ล้มเหลวคงข้อมูลไว้ให้แก้แล้วยิงซ้ำได้
        setCarEntries((prev) => {
          const next = { ...prev };
          data.results.forEach((r: any) => {
            if (r.success) delete next[Number(r.car_id)];
          });
          return next;
        });
        // คงโหมด group ไว้ เพราะคนใช้ฟีเจอร์นี้มักจองต่อเนื่องหลายรอบ
        await fetchData();
        scrollToTop();
      });
    } catch (error: any) {
      console.error("❌ Group Booking Error:", error);
      showAlert("error", "ผิดพลาด", error.message || "การเชื่อมต่อขัดข้อง");
    } finally {
      setLoading(false);
    }
  };

  const handleBookingPress = () => {
    if (!user?.id) return showAlert("error", "แจ้งเตือน", "กรุณา Login ใหม่");

    // --- 👥 โหมดจองให้ตัวเอง + คนอื่น ---
    if (bookingMode === "group") {
      if (!canBookForOthers)
        return showAlert(
          "error",
          "ไม่มีสิทธิ์",
          "คุณไม่มีสิทธิ์จองรถให้คนอื่น กรุณาติดต่อผู้ดูแลระบบ",
        );

      const ids = selectedCarIds;
      if (ids.length === 0)
        return showAlert(
          "warning",
          "แจ้งเตือน",
          "กรุณาเลือกรถอย่างน้อย 1 คัน และระบุผู้ใช้รถ",
        );

      // เก็บปัญหาของทุกคันแล้วรายงานทีเดียว (ดีกว่าเว็บที่หยุดที่คันแรก)
      const problems: string[] = [];
      ids.forEach((cid) => {
        const e = carEntries[cid];
        if (!e) return;
        const label = carLabel(cid);
        if (!e.driverId) problems.push(`${label}: ยังไม่เลือกผู้ใช้รถ`);
        if (!e.phone.trim()) problems.push(`${label}: ยังไม่กรอกเบอร์โทร`);
        if (!e.destination.trim()) problems.push(`${label}: ยังไม่กรอกสถานที่`);
        if (!e.reason.trim()) problems.push(`${label}: ยังไม่กรอกภารกิจ`);
        if (e.endDate <= e.startDate)
          problems.push(`${label}: เวลาคืนรถต้องหลังเวลารับรถ`);
        // 👥 ผู้ร่วมเดินทาง + แผนงาน
        if (e.passengerIds.length > maxPassengers)
          problems.push(`${label}: ผู้ร่วมเดินทางได้ไม่เกิน ${maxPassengers} คน`);
        if (
          e.driverId &&
          e.passengerIds.some((p) => String(p) === String(e.driverId))
        )
          problems.push(`${label}: ผู้ใช้รถถูกเลือกเป็นผู้ร่วมเดินทางซ้ำ`);
        if (needsPlanFile(e.startDate, e.endDate) && e.planFiles.length === 0)
          problems.push(
            `${label}: เดินทาง ${tripDaysBetween(e.startDate, e.endDate)} วัน ต้องแนบไฟล์แผนงาน`,
          );
      });
      if (problems.length)
        return showAlert("warning", "ข้อมูลไม่ครบ", problems.join("\n"));

      // เช็คคิวชนฝั่ง client เพื่อ UX (เซิร์ฟเวอร์เช็คจริงอีกชั้นตอนบันทึก)
      const conflicts: string[] = [];
      ids.forEach((cid) => {
        const e = carEntries[cid];
        const car = cars.find((c) => String(c.id) === String(cid));
        if (!car || !e) return;
        const r: any = validateBookingConflict(car, e.startDate, e.endDate);
        if (r.conflict)
          conflicts.push(
            `${carLabel(cid)}: ${
              r.details?.type === "maintenance"
                ? "ติดซ่อมบำรุงในช่วงเวลานี้"
                : "ถูกจองในช่วงเวลานี้แล้ว"
            }`,
          );
      });
      if (conflicts.length)
        return showAlert("error", "มีคิวชนกัน", conflicts.join("\n"));

      return showAlert(
        "question",
        "ยืนยันการจอง",
        `จองรถ ${ids.length} คัน ตรวจสอบข้อมูลครบถ้วนแล้ว?`,
        true,
        submitGroupBooking,
      );
    }

    // --- โหมดจองให้ตัวเอง (เดิม) ---
    if (!selectedCarId)
      return showAlert("warning", "แจ้งเตือน", "กรุณาเลือกรถ");
    if (!phone.trim() || !destination.trim() || !reason.trim())
      return showAlert("warning", "แจ้งเตือน", "กรุณากรอกข้อมูลให้ครบ");
    if (endDate <= startDate)
      return showAlert("warning", "เวลาไม่ถูกต้อง", "เวลาคืนต้องหลังเวลารับ");
    const conflict = validateBookingConflict(
      cars.find((c) => c.id === selectedCarId),
    );
    if (conflict.conflict)
      return showAlert(
        "error",
        conflict.details.type === "maintenance"
          ? "จองไม่ได้: ติดซ่อม"
          : "ไม่ว่างช่วงนี้",
        "รถคันนี้ถูกจองหรือซ่อมบำรุงแล้ว",
      );

    // 👥 ผู้ร่วมเดินทาง + แผนงาน (เกิน 2 วันต้องแนบไฟล์)
    const days = tripDaysBetween(startDate, endDate);
    if (passengerIds.length > maxPassengers)
      return showAlert(
        "warning",
        "ผู้ร่วมเดินทางเกินกำหนด",
        `เลือกผู้ร่วมเดินทางได้ไม่เกิน ${maxPassengers} คน`,
      );
    if (needsPlanFile(startDate, endDate) && planFiles.length === 0)
      return showAlert(
        "warning",
        "ยังไม่ได้แนบแผนงาน",
        `เดินทาง ${days} วัน (เกิน ${PLAN_REQUIRED_OVER_DAYS} วัน) ต้องแนบไฟล์แผนงานว่าไปทำอะไร ที่ไหน เวลาใดบ้าง`,
      );

    const wheelName = empName(wheelId ?? user?.id);
    showAlert(
      "question",
      "ยืนยันการจอง",
      `ไปกัน ${1 + passengerIds.length} คน · ${days} วัน\nคนขับ: ${wheelName}` +
        (planFiles.length ? `\nแผนงาน ${planFiles.length} ไฟล์` : ""),
      true,
      submitBooking,
    );
  };

  const cancelBooking = async (bid: number) => {
    try {
      setLoading(true);
      const { data } = await axios.post(
        `${API_BASE}/api_carboooking_mobile.php`,
        new URLSearchParams({
          action: "cancel_booking",
          booking_id: String(bid),
          user_id: String(user?.id),
        }).toString(),
      );
      if (data.status === "success")
        showAlert(
          "success",
          "สำเร็จ",
          "ยกเลิกการจองแล้ว",
          false,
          fetchData,
          1500,
        );
      else showAlert("warning", "แจ้งเตือน", data.message);
    } catch {
      showAlert("error", "Error", "ไม่สามารถยกเลิกได้");
    } finally {
      setLoading(false);
    }
  };
  const submitReturnCar = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        action: "return_car",
        booking_id: String(returnBookingData?.id),
        user_id: String(user?.id),
        car_id: String(returnBookingData?.car_id),
        parking_location: parkingLoc,
        energy_level: energyLevel,
        car_issue: issue,
        // ส่งแยกฟิลด์ (เดิมยัดรวมใน car_issue) ให้ตรงกับที่เว็บส่ง
        is_charging: isCharging ? "1" : "0",
      });
      const { data } = await axios.post(
        `${API_BASE}/api_carboooking_mobile.php`,
        params.toString(),
      );
      if (data.status === "success") {
        setShowReturnModal(false);
        showAlert(
          "success",
          "สำเร็จ",
          "คืนรถเรียบร้อย",
          false,
          async () => {
            setParkingLoc("");
            setEnergyLevel("");
            setIssue("");
            setIsCharging(false);
            setReturnBookingData(null);
            await fetchData();
          },
          1500,
        );
      } else showAlert("warning", "แจ้งเตือน", data.message);
    } catch {
      showAlert("error", "Error", "ส่งข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleReturnPress = () => {
    if (!parkingLoc.trim() || !energyLevel.trim()) {
      return showAlert(
        "warning",
        "แจ้งเตือน",
        "กรุณากรอกข้อมูลให้ครบ (ที่จอดและพลังงาน)",
      );
    }

    // ถ้าเป็นรายการที่เราจองแทนคนอื่น ให้ระบุชื่อผู้ใช้รถในข้อความยืนยันเพื่อกันกดผิด
    const b = returnBookingData;
    const isProxy =
      !!b?.booked_by &&
      String(b.booked_by) === String(user?.id ?? "") &&
      String(b.user_id) !== String(user?.id ?? "");

    showAlert(
      "question",
      "ยืนยันการคืนรถ",
      isProxy
        ? `ยืนยันคืนรถแทน ${b.driver_name || "ผู้ใช้รถ"} ใช่หรือไม่?`
        : "คุณตรวจสอบความถูกต้องแล้ว และต้องการยืนยันการคืนรถใช่หรือไม่?",
      true,
      submitReturnCar,
    );
  };

  // 🔥 ฟังก์ชัน Render Modal รายละเอียด (Detail Popup)
  const renderDetailModal = () => {
    if (!selectedDetail) return null;
    const cleanNote = cleanNoteText(
      selectedDetail.return_note || selectedDetail.note,
    );

    // เช็คเบอร์โทรเผื่อ API ส่งมาในชื่อคีย์อื่น
    const phoneNumber =
      selectedDetail.phone ||
      selectedDetail.phone_number ||
      selectedDetail.user_phone ||
      "ไม่ระบุเบอร์โทร";

    return (
      <View
        style={{
          width: "95%",
          maxHeight: "80%",
          backgroundColor: themeColors.card,
          borderRadius: 20,
          paddingVertical: 20,
          paddingHorizontal: 20,
          alignItems: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
          elevation: 5,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            fontWeight: "bold",
            color: themeColors.text,
            marginBottom: 20,
          }}
        >
          รายละเอียดการจอง
        </Text>

        <View style={{ width: "100%" }}>
          <View
            style={{
              backgroundColor: isDark ? "#334155" : "#f8f9fa",
              borderRadius: 12,
              padding: 15,
              marginBottom: 15,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: themeColors.subText,
                marginBottom: 4,
              }}
            >
              ผู้จอง
            </Text>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "bold",
                color: themeColors.text,
                marginBottom: 2,
              }}
            >
              {selectedDetail.fullname || "ไม่ระบุชื่อ"}
            </Text>

            {/* 🟢 ส่วนที่ปรับปรุง: เพิ่มไอคอนและแสดงเบอร์โทรให้ชัดเจน */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <Ionicons
                name="call"
                size={14}
                color={themeColors.subText}
                style={{ marginRight: 6 }}
              />
              <Text style={{ fontSize: 14, color: themeColors.subText }}>
                {phoneNumber}
              </Text>
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              borderWidth: 1,
              borderColor: themeColors.border,
              borderRadius: 12,
              marginBottom: 15,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flex: 1,
                padding: 12,
                borderRightWidth: 1,
                borderRightColor: themeColors.border,
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: themeColors.subText,
                  marginBottom: 4,
                }}
              >
                เวลาออก
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "bold",
                  color: "#10b981",
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatDateDisplay(selectedDetail.start)} -{" "}
                {selectedDetail.start?.split(" ")[1]?.slice(0, 5) || "00:00"}
              </Text>
            </View>
            <View style={{ flex: 1, padding: 12, justifyContent: "center" }}>
              <Text
                style={{
                  fontSize: 10,
                  color: themeColors.subText,
                  marginBottom: 4,
                }}
              >
                กำหนดคืน
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "bold",
                  color: themeColors.text,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatDateDisplay(selectedDetail.end)} -{" "}
                {selectedDetail.end?.split(" ")[1]?.slice(0, 5) || "00:00"}
              </Text>
            </View>
          </View>

          <View style={{ marginBottom: 10 }}>
            <Text
              style={{
                fontSize: 12,
                color: themeColors.subText,
                marginBottom: 2,
              }}
            >
              สถานที่ไป
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: themeColors.text,
                fontWeight: "500",
              }}
            >
              {selectedDetail.destination || "-"}
            </Text>
          </View>

          <View style={{ marginBottom: 15 }}>
            <Text
              style={{
                fontSize: 12,
                color: themeColors.subText,
                marginBottom: 2,
              }}
            >
              ภารกิจ
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: themeColors.text,
                fontWeight: "500",
              }}
            >
              {selectedDetail.reason || "-"}
            </Text>
          </View>

          {/* 👥 ผู้เดินทาง / คนขับ / แผนงาน */}
          <View style={{ marginBottom: 15 }}>
            <Text
              style={{
                fontSize: 12,
                color: themeColors.subText,
                marginBottom: 2,
              }}
            >
              ผู้เดินทาง ({selectedDetail.passenger_count || 1} คน ·{" "}
              {tripDaysBetween(selectedDetail.start, selectedDetail.end)} วัน)
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: themeColors.text,
                fontWeight: "500",
              }}
            >
              คนขับ: {selectedDetail.wheel_driver_name || selectedDetail.fullname || "-"}
            </Text>
            {!!selectedDetail.passenger_list && (
              <Text style={{ fontSize: 12, color: themeColors.subText }}>
                ร่วมเดินทาง: {selectedDetail.passenger_list}
              </Text>
            )}
            {Array.isArray(selectedDetail.plan_files) &&
              selectedDetail.plan_files.length > 0 &&
              selectedDetail.plan_files.map((f: any) => (
                <TouchableOpacity
                  key={String(f.id)}
                  style={themeStyles.planFileLink}
                  onPress={() => Linking.openURL(planFileUrl(f.file_name))}
                  activeOpacity={0.8}
                >
                  <Ionicons name="attach" size={14} color="#f59e0b" />
                  <Text style={themeStyles.planFileLinkText} numberOfLines={1}>
                    {f.original_name || f.file_name}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>

          <View
            style={{
              backgroundColor: isDark
                ? "rgba(245, 158, 11, 0.15)"
                : "rgba(255, 247, 237, 1)",
              borderRadius: 12,
              padding: 15,
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: "#d97706",
                fontWeight: "bold",
                marginBottom: 4,
              }}
            >
              หมายเหตุ
            </Text>
            <Text style={{ fontSize: 14, color: themeColors.text }}>
              {cleanNote}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setDetailModalVisible(false)}
            style={{
              backgroundColor: isDark ? "#334155" : "#e2e8f0",
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: "center",
              width: "100%",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "bold",
                color: themeColors.text,
              }}
            >
              ปิด
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // 🔥 ฟังก์ชัน Render Modal ตารางงาน (เปลี่ยนมาใช้ Calendar แบบปัด 1 ครั้ง = 1 เดือน)
  const renderScheduleModal = () => {
    if (!scheduleModalCar) return null;

    const legends = [
      { label: "จองแล้ว", color: themeColors.statusApproved },
      { label: "แจ้งซ่อม", color: themeColors.maintenance },
      { label: "เกินกำหนด", color: themeColors.statusOverdue },
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
            backgroundColor: themeColors.card,
            borderRadius: 16,
            overflow: "hidden",
            borderColor: themeColors.border,
            borderWidth: 1,
          }}
        >
          {/* Header */}
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

          {/* 🔥 ปฏิทิน Calendar */}
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
              hideExtraDays={true}
              theme={calendarTheme}
            />

            {/* ส่วนเนื้อหาข้างล่างปฏิทิน */}
            <View
              style={{
                padding: 15,
                flex: 1,
                backgroundColor: themeColors.card,
              }}
            >
              <Text
                style={{
                  color: themeColors.primary,
                  fontWeight: "bold",
                  fontSize: 16,
                  marginBottom: 10,
                }}
              >
                รายการ: {formatJustDateThai(calendarSelectedDate)}
              </Text>

              {/* Legend Bar */}
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  marginBottom: 10,
                  paddingBottom: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: themeColors.border,
                }}
              >
                {legends.map((l, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginRight: 15,
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
                    <Text style={{ color: themeColors.subText, fontSize: 11 }}>
                      {l.label}
                    </Text>
                  </View>
                ))}
              </View>

              <ScrollView style={{ flex: 1 }}>
                {modalSelectedDateEvents.length > 0 ? (
                  modalSelectedDateEvents.map((item: any, index: number) => {
                    const { text, color } = getStatusInfo(
                      item.status,
                      item.end,
                      item.start,
                      themeColors,
                    );
                    const isMaint =
                      item.status === "maintenance" ||
                      item.type === "maintenance";

                    return (
                      <TouchableOpacity
                        key={index}
                        onPress={() => openDetail(item)}
                        activeOpacity={0.7}
                        style={{
                          marginBottom: 10,
                          padding: 15,
                          backgroundColor: themeColors.card,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                        }}
                      >
                        {/* 🟢 ส่วนที่ 1: Timeline เวลาออก - เวลาคืน */}
                        <View style={{ flexDirection: "row" }}>
                          <View style={{ alignItems: "center" }}>
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: isMaint
                                  ? themeColors.maintenance
                                  : "#10b981",
                              }}
                            />
                            <View
                              style={{
                                width: 2,
                                height: 16,
                                marginVertical: 2,
                                backgroundColor: themeColors.border,
                              }}
                            />
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: isMaint
                                  ? themeColors.maintenance
                                  : "#ef4444",
                              }}
                            />
                          </View>
                          <View
                            style={{
                              marginLeft: 8,
                              justifyContent: "space-between",
                              paddingVertical: 2,
                              flex: 1,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontFamily:
                                  Platform.OS === "ios"
                                    ? "Courier"
                                    : "monospace",
                                color: themeColors.text,
                              }}
                            >
                              ออก{" "}
                              {item.start
                                ? formatDateDisplay(
                                    new Date(item.start.replace(" ", "T")),
                                  )
                                : "-"}{" "}
                              {item.start?.split(" ")[1]?.slice(0, 5) ||
                                "00:00"}{" "}
                              น.
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                fontFamily:
                                  Platform.OS === "ios"
                                    ? "Courier"
                                    : "monospace",
                                color: themeColors.subText,
                              }}
                            >
                              คืน{" "}
                              {item.end
                                ? formatDateDisplay(
                                    new Date(item.end.replace(" ", "T")),
                                  )
                                : "-"}{" "}
                              {item.end?.split(" ")[1]?.slice(0, 5) || "00:00"}{" "}
                              น.
                            </Text>
                          </View>
                        </View>

                        <View
                          style={{
                            height: 1,
                            backgroundColor: themeColors.border,
                            marginVertical: 10,
                          }}
                        />

                        {/* 🟢 ส่วนที่ 2: ข้อมูลผู้ใช้งาน สถานที่ และ Badge สถานะ */}
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <View style={{ flex: 1.5, paddingRight: 5 }}>
                            <Text
                              style={{
                                fontSize: 9,
                                color: themeColors.subText,
                                marginBottom: 2,
                              }}
                            >
                              {isMaint ? "ผู้แจ้งซ่อม" : "ผู้ใช้งาน"}
                            </Text>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "bold",
                                color: themeColors.text,
                              }}
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
                                  color={themeColors.subText}
                                />
                              )}{" "}
                              {item.fullname ||
                                (isMaint ? "แจ้งซ่อม" : "ไม่ระบุชื่อ")}
                            </Text>
                            {item.phone && item.phone !== "-" && (
                              <Text
                                style={{
                                  fontSize: 10,
                                  color: themeColors.subText,
                                  marginTop: 2,
                                }}
                              >
                                <Ionicons name="call" size={10} /> {item.phone}
                              </Text>
                            )}
                          </View>

                          <View style={{ flex: 1.2, paddingRight: 5 }}>
                            <Text
                              style={{
                                fontSize: 9,
                                color: themeColors.subText,
                                marginBottom: 2,
                              }}
                            >
                              สถานที่ไป
                            </Text>
                            <Text
                              style={{ fontSize: 11, color: themeColors.text }}
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
                              style={{
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                                backgroundColor: color,
                              }}
                            >
                              <Text
                                style={{
                                  color: "#fff",
                                  fontSize: 10,
                                  fontWeight: "bold",
                                }}
                              >
                                {text}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={{ alignItems: "center", marginTop: 20 }}>
                    <Text style={{ color: themeColors.subText }}>
                      ไม่มีรายการในวันนี้
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

  const renderCarItem = (item: any) => {
    const isMaintenance = item.status === "maintenance";
    const entry = carEntries[item.id];
    const isGroup = bookingMode === "group";
    const isSelected = isGroup ? !!entry : selectedCarId === item.id;
    // ลำดับที่เลือกในโหมด group (แสดงเป็นเลขบนการ์ด)
    const orderNo = isGroup && entry ? selectedCarIds.indexOf(item.id) + 1 : 0;
    const imageUri = getCarImageUri(item.image_path || item.car_image);

    // ถ้าคันนี้ถูกเลือกในโหมด group ให้เช็คคิวชนตามช่วงเวลาของคันนั้นเอง
    const conflictResult: any = entry
      ? validateBookingConflict(item, entry.startDate, entry.endDate)
      : validateBookingConflict(item);
    const isTimeConflict = conflictResult.conflict && !isMaintenance;

    let displayLocation = item.last_parking_location || "-";
    let displayEnergy = "-";

    if (item.type === "EV") {
      displayEnergy = item.current_battery ? `${item.current_battery}%` : "-";
    } else {
      displayEnergy = item.current_fuel || "-";
    }
    const isCharging = item.description?.includes("เสียบชาร์จ") || false;

    let statusText = "ว่าง";
    let statusColor = "#10b981";
    let displayInfo: any = null;

    if (isMaintenance) {
      statusText = "แจ้งซ่อม";
      statusColor = "#f59e0b";

      // 🟢 ค้นหาตารางงานปัจจุบันเพื่อดึงข้อมูลคนแจ้งซ่อม
      let currentTask = null;
      if (item.schedule && item.schedule.length > 0) {
        const now = new Date();
        currentTask = item.schedule.find((s: any) => {
          if (
            s.type === "maintenance" &&
            (s.status === "active" || s.status === "pending") &&
            s.start &&
            s.end
          ) {
            const start = new Date(s.start.replace(" ", "T"));
            return now >= start;
          }
          return false;
        });
      }

      displayInfo = {
        user: currentTask?.fullname || currentTask?.user || "ช่างซ่อม/ศูนย์",
        phone: item.phone || currentTask?.phone || "-",
      };
    } else if (isTimeConflict) {
      statusText = "ไม่ว่าง";
      statusColor = "#ef4444";
    } else {
      statusText = "ว่าง";
      statusColor = "#10b981";
    }

    const handlePressCar = () => {
      // อนุญาตให้เลือก car_id ได้แม้จะเป็นสถานะ maintenance เพื่อใช้ในการจองล่วงหน้า
      if (isGroup) {
        // โหมด group: แตะการ์ดเพื่อ toggle เข้า/ออกรายการที่เลือก
        if (entry) {
          removeEntry(item.id);
          return; // ยกเลิกเลือกแล้ว ไม่ต้องเตือนเรื่องซ่อม
        }
        setCarEntries((prev) => ({
          ...prev,
          [item.id]: {
            driverId: null,
            driverName: "",
            phone: "",
            destination: "",
            reason: "",
            // ยืมช่วงเวลาจากฟอร์มด้านบนเป็นค่าเริ่มต้น (sync แค่ตอนเพิ่มคันใหม่
            // เพื่อไม่เขียนทับค่าที่ผู้ใช้ปรับรายคันไปแล้ว)
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            passengerIds: [],
            wheelId: null,
            planFiles: [],
          },
        }));
      } else {
        setSelectedCarId(item.id);
      }

      if (isMaintenance) {
        // แสดงคำเตือนเพื่อให้ผู้ใช้ทราบเฉยๆ แต่ยังอนุญาตให้เลือก ID ได้
        showAlert(
          "warning",
          "แจ้งเตือน",
          "รถคันนี้อยู่ระหว่างซ่อมบำรุง แต่คุณสามารถเลือกจองล่วงหน้าในวันอื่นได้",
          false,
          undefined,
          2000, // ปิดเองใน 2 วินาที
        );
      }
    };

    return (
      <View
        key={item.id}
        style={[
          themeStyles.carCard,
          isSelected && themeStyles.carCardSelected,
          isMaintenance && {
            borderColor: themeColors.maintenance,
            backgroundColor: themeColors.maintenanceBg,
          },
          isTimeConflict && {
            borderColor: "#ef4444",
            backgroundColor: themeColors.busyBg,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            themeStyles.carCardRow,
            // จางเฉพาะแถวข้อมูลรถ ไม่ให้ฟอร์มกรอกด้านล่างจางไปด้วย
            (isMaintenance || isTimeConflict) && { opacity: 0.9 },
          ]}
          onPress={handlePressCar}
          activeOpacity={0.8}
        >
          <View style={themeStyles.imageContainer}>
            <Image
              source={{ uri: imageUri }}
              style={[themeStyles.carImage, isMaintenance && { opacity: 0.5 }]}
              resizeMode="contain"
            />
            {isSelected &&
              (orderNo > 0 ? (
                <View style={themeStyles.orderBadge}>
                  <Text style={themeStyles.orderBadgeText}>{orderNo}</Text>
                </View>
              ) : (
                <View style={themeStyles.selectedOverlay}>
                  <Ionicons name="checkmark-circle" size={24} color="#2563eb" />
                </View>
              ))}
          </View>

          <View style={themeStyles.cardContent}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {item.car_number ? (
                <View
                  style={[
                    themeStyles.carNumberCircle,
                    isMaintenance && {
                      backgroundColor: themeColors.maintenance,
                    },
                  ]}
                >
                  <Text style={themeStyles.carNumberText}>
                    {item.car_number}
                  </Text>
                </View>
              ) : null}
              <Text style={themeStyles.carName} numberOfLines={1}>
                {item.name}
              </Text>
            </View>

            <View style={themeStyles.subHeaderRow}>
              <Text style={themeStyles.plateText}>{item.plate}</Text>
              {item.type === "EV" ? (
                <View
                  style={[
                    themeStyles.typeBadge,
                    {
                      borderColor: isDark ? "#60a5fa" : "#2563eb",
                      backgroundColor: isDark
                        ? "rgba(59, 130, 246, 0.15)"
                        : "rgba(37, 99, 235, 0.1)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      themeStyles.typeText,
                      { color: isDark ? "#60a5fa" : "#2563eb" },
                    ]}
                  >
                    EV
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    themeStyles.typeBadge,
                    {
                      borderColor: isDark ? "#fbbf24" : "#f59e0b",
                      backgroundColor: isDark
                        ? "rgba(245, 158, 11, 0.2)"
                        : "rgba(245, 158, 11, 0.1)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      themeStyles.typeText,
                      { color: isDark ? "#fbbf24" : "#f59e0b" },
                    ]}
                  >
                    Fuel
                  </Text>
                </View>
              )}
            </View>

            <View style={{ marginTop: 6 }}>
              {isMaintenance && displayInfo ? (
                <View>
                  <View style={themeStyles.infoItemRow}>
                    <Ionicons
                      name="person"
                      size={12}
                      color={themeColors.subText}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={themeStyles.infoText} numberOfLines={1}>
                      {displayInfo.user}
                    </Text>
                  </View>
                  <View style={themeStyles.infoItemRow}>
                    <Ionicons
                      name="call"
                      size={12}
                      color={themeColors.subText}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={themeStyles.infoText} numberOfLines={1}>
                      {displayInfo.phone}
                    </Text>
                  </View>
                </View>
              ) : (
                <View>
                  <View style={themeStyles.infoItemRow}>
                    <Ionicons
                      name="location-sharp"
                      size={12}
                      color="#ef4444"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={themeStyles.infoText} numberOfLines={1}>
                      {displayLocation}
                    </Text>
                  </View>
                  <View style={themeStyles.infoItemRow}>
                    <MaterialCommunityIcons
                      name="lightning-bolt"
                      size={12}
                      color="#f59e0b"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={themeStyles.infoText}>{displayEnergy}</Text>
                    {isCharging && (
                      <BlinkingView
                        style={{
                          marginLeft: 6,
                          backgroundColor: "#dcfce7",
                          paddingHorizontal: 4,
                          borderRadius: 3,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 8,
                            color: "#166534",
                            fontWeight: "bold",
                          }}
                        >
                          ⚡ ชาร์จ
                        </Text>
                      </BlinkingView>
                    )}
                  </View>
                </View>
              )}
            </View>
          </View>

          <View
            style={[
              themeStyles.statusBadge,
              {
                backgroundColor: statusColor,
                position: "absolute",
                top: 10,
                right: 10,
              },
            ]}
          >
            <Text style={[themeStyles.statusText, { color: "#fff" }]}>
              {statusText}
            </Text>
          </View>

          {/* 🔥 ปุ่มดูตารางงาน */}
          <TouchableOpacity
            style={themeStyles.scheduleBtn}
            onPress={() => handleOpenSchedule(item)}
          >
            <MaterialCommunityIcons
              name="calendar-clock"
              size={14}
              color="#fff"
            />
            <Text
              style={{
                color: "#fff",
                fontSize: 10,
                fontWeight: "bold",
                marginLeft: 4,
              }}
            >
              ตารางงาน
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* 👥 ฟอร์มกรอกรายละเอียดของรถคันนี้ — กางอยู่ในกล่องรถเลย */}
        {isGroup && entry && renderCarEntryForm(item.id, entry)}
      </View>
    );
  };

  const renderActiveBookings = () => {
    if (myBookings.length === 0) return null;
    return (
      <View style={{ marginBottom: 20 }}>
        <View style={themeStyles.headerTitleRow}>
          <Ionicons name="list" size={24} color="#2563eb" />
          <Text style={themeStyles.sectionTitle}>
            รายการจองของคุณ ({myBookings.length})
          </Text>
        </View>
        {myBookings.map((b, i) => {
          const isOverdue =
            (b.status === "active" || b.status === "approved") &&
            new Date() > new Date(b.end_date);

          // 👥 การจองแทน — เทียบ id ด้วย String() เพราะ API ส่ง id มาเป็น string บางที่
          const myId = String(user?.id ?? "");
          const iBookedForOther =
            !!b.booked_by &&
            String(b.booked_by) === myId &&
            String(b.user_id) !== myId;
          const bookedForMeByOther =
            String(b.user_id) === myId &&
            !!b.booked_by &&
            String(b.booked_by) !== myId;

          return (
            <View key={i} style={themeStyles.activeCard}>
              <View
                style={[
                  themeStyles.headerBg,
                  isOverdue
                    ? { backgroundColor: "#ef4444" }
                    : b.status === "pending"
                      ? { backgroundColor: "#64748b" }
                      : { backgroundColor: themeColors.activeHeader },
                ]}
              >
                <Text style={themeStyles.headerTitle}>
                  {isOverdue
                    ? "คืนล่าช้า / เกินกำหนด"
                    : b.status === "pending"
                      ? "รออนุมัติ"
                      : b.status === "active"
                        ? "กำลังใช้งาน"
                        : "จองสำเร็จ"}
                </Text>
              </View>
              <View style={themeStyles.activeBody}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "bold",
                    color: themeColors.text,
                    marginBottom: 10,
                  }}
                >
                  {b.car_number} - {b.car_name}
                </Text>

                {/* 👥 ป้ายบอกว่าใครจองแทนใคร */}
                {iBookedForOther && (
                  <View style={themeStyles.proxyBadge}>
                    <Ionicons name="person-add" size={12} color="#2563eb" />
                    <Text style={themeStyles.proxyBadgeText}>
                      คุณจองให้: {b.driver_name || "ไม่ระบุชื่อ"}
                    </Text>
                  </View>
                )}
                {bookedForMeByOther && (
                  <View style={themeStyles.proxyBadge}>
                    <Ionicons
                      name="checkmark-circle"
                      size={12}
                      color="#2563eb"
                    />
                    <Text style={themeStyles.proxyBadgeText}>
                      จองให้คุณโดย: {b.booker_name || "ไม่ระบุชื่อ"}
                    </Text>
                  </View>
                )}

                <Text style={{ color: themeColors.subText }}>
                  เริ่ม: {formatDateDisplay(new Date(b.start_date))}{" "}
                  {formatTimeDisplay(new Date(b.start_date))} น.
                </Text>
                <Text
                  style={{
                    color: isOverdue ? "#ef4444" : themeColors.subText,
                    fontWeight: isOverdue ? "bold" : "normal",
                  }}
                >
                  คืน: {formatDateDisplay(new Date(b.end_date))}{" "}
                  {formatTimeDisplay(new Date(b.end_date))} น.
                </Text>

                {/* 👥 ผู้เดินทาง / คนขับ / แผนงาน */}
                <View style={themeStyles.tripSummaryBox}>
                  <Text style={themeStyles.tripSummaryText}>
                    👥 ไปกัน {b.people_count ?? b.passenger_count ?? 1} คน
                  </Text>
                  <Text style={themeStyles.tripSummaryText}>
                    🗓️ {b.trip_days ?? tripDaysBetween(b.start_date, b.end_date)}{" "}
                    วัน
                  </Text>
                </View>
                <Text style={{ color: themeColors.subText, marginTop: 6 }}>
                  คนขับ: {b.wheel_driver_name || b.driver_name || "-"}
                </Text>
                {Array.isArray(b.passengers) && b.passengers.length > 0 && (
                  <Text
                    style={{ color: themeColors.subText, fontSize: 12 }}
                    numberOfLines={2}
                  >
                    ร่วมเดินทาง:{" "}
                    {b.passengers.map((p: any) => p.fullname).join(", ")}
                  </Text>
                )}
                {Array.isArray(b.plan_files) && b.plan_files.length > 0
                  ? b.plan_files.map((f: any) => (
                      <TouchableOpacity
                        key={String(f.id)}
                        style={themeStyles.planFileLink}
                        onPress={() =>
                          Linking.openURL(planFileUrl(f.file_name))
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons name="attach" size={14} color="#f59e0b" />
                        <Text
                          style={themeStyles.planFileLinkText}
                          numberOfLines={1}
                        >
                          {f.original_name || f.file_name}
                        </Text>
                      </TouchableOpacity>
                    ))
                  : (b.trip_days ??
                      tripDaysBetween(b.start_date, b.end_date)) >
                      PLAN_REQUIRED_OVER_DAYS && (
                      <Text
                        style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}
                      >
                        ⚠️ ยังไม่มีไฟล์แผนงาน
                      </Text>
                    )}
                <View style={{ flexDirection: "row", marginTop: 15, gap: 10 }}>
                  {(b.status === "active" || b.status === "approved") && (
                    <TouchableOpacity
                      style={[
                        themeStyles.returnBtn,
                        {
                          marginTop: 0,
                          flex: 1,
                          padding: 12,
                          backgroundColor: "#10b981",
                        },
                      ]}
                      onPress={() => {
                        setReturnBookingData(b);
                        setIsCharging(false);
                        setShowReturnModal(true);
                      }}
                    >
                      <Text
                        style={[themeStyles.returnBtnText, { fontSize: 14 }]}
                      >
                        แจ้งคืนรถ
                      </Text>
                    </TouchableOpacity>
                  )}
                  {(b.status === "pending" || b.status === "approved") && (
                    <TouchableOpacity
                      style={[
                        themeStyles.returnBtn,
                        {
                          marginTop: 0,
                          flex: 1,
                          padding: 12,
                          backgroundColor: "transparent",
                          borderWidth: 1,
                          borderColor: "#ef4444",
                        },
                      ]}
                      onPress={() =>
                        showAlert(
                          "question",
                          "ยกเลิก?",
                          iBookedForOther
                            ? `ยืนยันยกเลิกการจองแทน ${b.driver_name || "ผู้ใช้รถ"}?`
                            : "ยืนยันการยกเลิก",
                          true,
                          () => cancelBooking(b.id),
                        )
                      }
                    >
                      <Text
                        style={[
                          themeStyles.returnBtnText,
                          { fontSize: 14, color: "#ef4444" },
                        ]}
                      >
                        ยกเลิก
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // --- 👥 การ์ดกรอกรายละเอียดรายคัน (โหมด group) ---
  // --- 👥 ฟอร์มกรอกรายละเอียดของรถคันนั้น (กางอยู่ในกล่องรถ) ---
  // =====================================================================
  // 👥 บล็อก "ผู้เดินทาง + คนขับ + แผนงาน" — ใช้ทั้งโหมดจองเองและรายคันในโหมด group
  // =====================================================================
  const renderTravelSection = (
    target: "self" | number,
    tripStart: Date,
    tripEnd: Date,
  ) => {
    const pIds = passengersOf(target);
    const owner = ownerOf(target);
    const wheel = wheelOf(target) ?? owner;
    const files = planFilesOf(target);
    const days = tripDaysBetween(tripStart, tripEnd);
    const mustAttach = needsPlanFile(tripStart, tripEnd);
    const ownerLabel =
      target === "self"
        ? `ตัวฉัน (${user?.fullname || "ฉัน"})`
        : carEntries[target]?.driverName || "ผู้ใช้รถ";

    return (
      <>
        {/* ผู้ร่วมเดินทาง */}
        <Text style={themeStyles.entryLabel}>
          ผู้ร่วมเดินทาง{" "}
          <Text style={{ color: themeColors.subText, fontWeight: "normal" }}>
            (ไม่เกิน {maxPassengers} คน · ไม่ต้องเลือกตัวเอง)
          </Text>
        </Text>
        <TouchableOpacity
          style={themeStyles.driverSelectBtn}
          onPress={() => {
            setPassengerSearch("");
            setPassengerPickerFor(target);
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={pIds.length ? "people" : "people-outline"}
            size={16}
            color={pIds.length ? "#2563eb" : themeColors.subText}
            style={{ marginRight: 8 }}
          />
          <Text
            style={[
              themeStyles.driverSelectText,
              !pIds.length && { color: isDark ? "#94a3b8" : "#9ca3af" },
            ]}
            numberOfLines={1}
          >
            {pIds.length
              ? `เลือกแล้ว ${pIds.length} คน`
              : "ไปคนเดียว (แตะเพื่อเพิ่มคน)"}
          </Text>
          <Ionicons name="chevron-down" size={16} color={themeColors.subText} />
        </TouchableOpacity>

        {pIds.length > 0 && (
          <View style={themeStyles.chipWrap}>
            {pIds.map((pid) => (
              <View key={String(pid)} style={themeStyles.passengerChip}>
                <Text style={themeStyles.passengerChipText} numberOfLines={1}>
                  {empName(pid)}
                </Text>
                <TouchableOpacity
                  onPress={() => togglePassenger(target, pid)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={15} color="#2563eb" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* คนขับ — เลือกได้จากผู้ใช้รถ + ผู้ร่วมเดินทาง */}
        <Text style={themeStyles.entryLabel}>ใครเป็นคนขับ</Text>
        <View style={themeStyles.chipWrap}>
          {[
            { id: owner, label: ownerLabel },
            ...pIds.map((pid) => ({ id: pid, label: empName(pid) })),
          ].map((opt) => {
            const active = String(opt.id ?? "") === String(wheel ?? "");
            return (
              <TouchableOpacity
                key={`wheel-${String(opt.id)}`}
                style={[
                  themeStyles.wheelChip,
                  active && themeStyles.wheelChipActive,
                ]}
                onPress={() =>
                  setWheelOf(
                    target,
                    String(opt.id) === String(owner) ? null : opt.id,
                  )
                }
                activeOpacity={0.8}
              >
                <Ionicons
                  name={active ? "car-sport" : "car-sport-outline"}
                  size={13}
                  color={active ? "#fff" : themeColors.subText}
                />
                <Text
                  style={[
                    themeStyles.wheelChipText,
                    active && { color: "#fff" },
                  ]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* สรุปจำนวนคน / จำนวนวัน */}
        <View style={themeStyles.tripSummaryBox}>
          <Text style={themeStyles.tripSummaryText}>
            👥 ไปกัน {1 + pIds.length} คน
          </Text>
          <Text style={themeStyles.tripSummaryText}>🗓️ {days} วัน</Text>
        </View>

        {/* แผนงาน — บังคับเมื่อเกิน 2 วัน */}
        {mustAttach && (
          <>
            <Text style={[themeStyles.entryLabel, { color: "#ef4444" }]}>
              ไฟล์แผนงาน <Text style={{ color: "red" }}>*</Text>{" "}
              <Text style={{ fontWeight: "normal" }}>
                (เดินทางเกิน {PLAN_REQUIRED_OVER_DAYS} วัน)
              </Text>
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={themeStyles.attachBtn}
                onPress={() => pickPlanImages(target)}
                activeOpacity={0.8}
              >
                <Ionicons name="image-outline" size={16} color="#2563eb" />
                <Text style={themeStyles.attachBtnText}>แนบรูป</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={themeStyles.attachBtn}
                onPress={() => pickPlanDocs(target)}
                activeOpacity={0.8}
              >
                <Ionicons name="document-outline" size={16} color="#2563eb" />
                <Text style={themeStyles.attachBtnText}>แนบไฟล์</Text>
              </TouchableOpacity>
            </View>

            {files.length === 0 ? (
              <Text style={themeStyles.planHintText}>
                แนบแผนงานว่าไปทำอะไร ที่ไหน เวลาใดบ้าง — รูป / PDF / Word /
                Excel แนบได้หลายไฟล์ (ไฟล์ละไม่เกิน 10MB)
              </Text>
            ) : (
              files.map((f, idx) => (
                <View key={`${f.uri}-${idx}`} style={themeStyles.planFileRow}>
                  <Ionicons
                    name={
                      f.type?.startsWith("image")
                        ? "image"
                        : "document-text-outline"
                    }
                    size={15}
                    color="#f59e0b"
                  />
                  <Text style={themeStyles.planFileName} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removePlanFile(target, idx)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={15} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}
      </>
    );
  };

  const renderCarEntryForm = (cid: number, e: CarEntry) => {
    const orderNo = selectedCarIds.indexOf(cid) + 1;

    return (
      <View style={themeStyles.entryInline}>
        <View style={themeStyles.entryInlineHeader}>
          <View style={themeStyles.entryOrderCircle}>
            <Text style={themeStyles.entryOrderText}>{orderNo}</Text>
          </View>
          <Text style={themeStyles.entryInlineTitle} numberOfLines={1}>
            รายละเอียดการจองคันนี้
          </Text>
          <TouchableOpacity
            onPress={() => removeEntry(cid)}
            style={themeStyles.entryRemoveBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>

        {/* ผู้ใช้รถ */}
        <Text style={themeStyles.entryLabel}>
          ผู้ใช้รถ <Text style={{ color: "red" }}>*</Text>
        </Text>
        <TouchableOpacity
          style={themeStyles.driverSelectBtn}
          onPress={() => {
            setDriverSearch("");
            setDriverPickerCarId(cid);
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={e.driverId ? "person" : "person-add-outline"}
            size={16}
            color={e.driverId ? "#2563eb" : themeColors.subText}
            style={{ marginRight: 8 }}
          />
          <Text
            style={[
              themeStyles.driverSelectText,
              !e.driverId && { color: isDark ? "#94a3b8" : "#9ca3af" },
            ]}
            numberOfLines={1}
          >
            {e.driverName || "เลือกพนักงาน..."}
          </Text>
          <Ionicons name="chevron-down" size={16} color={themeColors.subText} />
        </TouchableOpacity>

        {/* เบอร์โทร */}
        <Text style={themeStyles.entryLabel}>
          เบอร์โทร <Text style={{ color: "red" }}>*</Text>
        </Text>
        <TextInput
          style={themeStyles.input}
          value={e.phone}
          onChangeText={(t) =>
            updateEntry(cid, { phone: t.replace(/[^0-9]/g, "") })
          }
          placeholder="0xx-xxx-xxxx"
          placeholderTextColor={isDark ? "#94a3b8" : "#9ca3af"}
          keyboardType="number-pad"
          maxLength={10}
        />

        {/* วัน-เวลารับรถ */}
        <Text style={themeStyles.entryLabel}>รับรถ</Text>
        <View style={themeStyles.dateTimeRow}>
          <TouchableOpacity
            style={themeStyles.dateBtnHalf}
            onPress={() => showPicker("start", "date", cid)}
          >
            <Ionicons
              name="calendar-outline"
              size={16}
              color={isDark ? "#cbd5e1" : "#555"}
              style={{ marginRight: 5 }}
            />
            <Text style={themeStyles.dateText}>
              {formatDateDisplay(e.startDate)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={themeStyles.dateBtnHalf}
            onPress={() => showPicker("start", "time", cid)}
          >
            <Ionicons
              name="time-outline"
              size={16}
              color="#2563eb"
              style={{ marginRight: 5 }}
            />
            <Text style={themeStyles.timeText}>
              {formatTimeDisplay(e.startDate)} น.
            </Text>
          </TouchableOpacity>
        </View>

        {/* วัน-เวลาคืนรถ */}
        <Text style={[themeStyles.entryLabel, { color: "#ef4444" }]}>
          คืนรถ
        </Text>
        <View style={themeStyles.dateTimeRow}>
          <TouchableOpacity
            style={[
              themeStyles.dateBtnHalf,
              {
                backgroundColor: isDark ? "#450a0a" : "#fff1f2",
                borderColor: "#fca5a5",
              },
            ]}
            onPress={() => showPicker("end", "date", cid)}
          >
            <Ionicons
              name="calendar-outline"
              size={16}
              color="#ef4444"
              style={{ marginRight: 5 }}
            />
            <Text style={[themeStyles.dateText, { color: "#ef4444" }]}>
              {formatDateDisplay(e.endDate)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              themeStyles.dateBtnHalf,
              {
                backgroundColor: isDark ? "#450a0a" : "#fff1f2",
                borderColor: "#fca5a5",
              },
            ]}
            onPress={() => showPicker("end", "time", cid)}
          >
            <Ionicons
              name="time-outline"
              size={16}
              color="#ef4444"
              style={{ marginRight: 5 }}
            />
            <Text style={[themeStyles.timeText, { color: "#ef4444" }]}>
              {formatTimeDisplay(e.endDate)} น.
            </Text>
          </TouchableOpacity>
        </View>

        {/* สถานที่ + ภารกิจ */}
        <Text style={themeStyles.entryLabel}>
          ไปที่ไหน (สถานที่) <Text style={{ color: "red" }}>*</Text>
        </Text>
        <TextInput
          style={themeStyles.input}
          value={e.destination}
          onChangeText={(t) => updateEntry(cid, { destination: t })}
          placeholder="ระบุอำเภอ / จังหวัด"
          placeholderTextColor={isDark ? "#94a3b8" : "#9ca3af"}
        />
        <Text style={themeStyles.entryLabel}>
          ภารกิจ / เหตุผล <Text style={{ color: "red" }}>*</Text>
        </Text>
        <TextInput
          style={themeStyles.input}
          value={e.reason}
          onChangeText={(t) => updateEntry(cid, { reason: t })}
          placeholder="รายละเอียดเพิ่มเติม..."
          placeholderTextColor={isDark ? "#94a3b8" : "#9ca3af"}
        />

        {/* 👥 ผู้ร่วมเดินทาง / คนขับ / แผนงาน ของคันนี้ */}
        {renderTravelSection(cid, e.startDate, e.endDate)}
      </View>
    );
  };

  // --- 👥 ปุ่มยืนยันการจองแบบกลุ่ม (ท้ายรายการรถ) ---
  const renderGroupFooter = () => {
    const ids = selectedCarIds;

    return (
      <View>
        {ids.length === 0 && (
          <View style={themeStyles.emptyEntryBox}>
            <Ionicons
              name="car-outline"
              size={28}
              color={themeColors.subText}
            />
            <Text style={themeStyles.emptyEntryText}>
              ยังไม่ได้เลือกรถ — แตะการ์ดรถด้านบนเพื่อเลือก (เลือกได้หลายคัน)
              {"\n"}ช่องกรอกรายละเอียดจะกางอยู่ในกล่องรถคันนั้นเลย
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            themeStyles.submitBtn,
            ids.length === 0 && {
              backgroundColor: "#9ca3af",
              shadowOpacity: 0,
            },
          ]}
          onPress={handleBookingPress}
          disabled={ids.length === 0}
        >
          <Text style={themeStyles.submitBtnText}>
            {ids.length > 0 ? `ยืนยันการจอง ${ids.length} คัน` : "ยืนยันการจอง"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // --- 👥 Modal เลือกผู้ใช้รถ ---
  // --- 👥 Modal เลือกผู้ร่วมเดินทาง (เลือกได้หลายคน สูงสุด maxPassengers) ---
  const renderPassengerPicker = () => {
    const target = passengerPickerFor;
    if (target == null) return null;

    const chosen = passengersOf(target);
    const owner = ownerOf(target);
    const q = passengerSearch.trim().toLowerCase();
    // ผู้ใช้รถของคันนั้นเป็นผู้เดินทางอยู่แล้ว จึงไม่ให้เลือกซ้ำ
    const list = employees.filter((e) => {
      if (String(e.id) === String(owner)) return false;
      return q ? (e.fullname || "").toLowerCase().includes(q) : true;
    });

    const close = () => {
      setPassengerPickerFor(null);
      setPassengerSearch("");
    };

    return (
      <View style={themeStyles.modalOverlay}>
        <View style={themeStyles.driverModalCard}>
          <View style={themeStyles.driverModalHeader}>
            <Text style={themeStyles.driverModalTitle}>
              ผู้ร่วมเดินทาง ({chosen.length}/{maxPassengers})
            </Text>
            <TouchableOpacity
              onPress={close}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 15, paddingTop: 12 }}>
            <View style={themeStyles.driverSearchBox}>
              <Ionicons name="search" size={16} color={themeColors.subText} />
              <TextInput
                style={themeStyles.driverSearchInput}
                value={passengerSearch}
                onChangeText={setPassengerSearch}
                placeholder="ค้นหาชื่อ..."
                placeholderTextColor={isDark ? "#94a3b8" : "#9ca3af"}
              />
              {passengerSearch !== "" && (
                <TouchableOpacity onPress={() => setPassengerSearch("")}>
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={themeColors.subText}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <FlatList
            data={list}
            keyExtractor={(item) => String(item.id)}
            style={{ maxHeight: 330 }}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => (
              <View
                style={{ height: 1, backgroundColor: themeColors.border }}
              />
            )}
            ListEmptyComponent={
              <View style={{ padding: 25, alignItems: "center" }}>
                <Text style={{ color: themeColors.subText }}>
                  ไม่พบพนักงานที่ค้นหา
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const picked = chosen.some(
                (i) => String(i) === String(item.id),
              );
              return (
                <TouchableOpacity
                  style={themeStyles.driverRow}
                  onPress={() => togglePassenger(target, item.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={picked ? "checkbox" : "square-outline"}
                    size={18}
                    color={picked ? "#2563eb" : themeColors.subText}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={themeStyles.driverRowName} numberOfLines={1}>
                    {item.fullname || "-"}
                  </Text>
                  <Text style={themeStyles.driverRowPhone}>
                    {item.phone || "-"}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />

          <TouchableOpacity
            style={themeStyles.passengerDoneBtn}
            onPress={close}
            activeOpacity={0.85}
          >
            <Text style={themeStyles.passengerDoneText}>
              เสร็จสิ้น ({1 + chosen.length} คน)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDriverPicker = () => {
    const cid = driverPickerCarId;
    if (cid == null) return null;

    const pick = (id: number | string, name: string, ph?: string | null) => {
      updateEntry(cid, {
        driverId: id,
        driverName: name,
        // เติมเบอร์อัตโนมัติ (ยังแก้ได้) — ตรงกับพฤติกรรม $empPhones ของเว็บ
        phone: (ph || "").replace(/[^0-9]/g, ""),
      });
      setDriverPickerCarId(null);
      setDriverSearch("");
    };

    const me = employees.find((e) => String(e.id) === String(user?.id));

    return (
      <View style={themeStyles.modalOverlay}>
        <View style={themeStyles.driverModalCard}>
          <View style={themeStyles.driverModalHeader}>
            <Text style={themeStyles.driverModalTitle}>เลือกผู้ใช้รถ</Text>
            <TouchableOpacity
              onPress={() => {
                setDriverPickerCarId(null);
                setDriverSearch("");
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 15, paddingTop: 12 }}>
            <View style={themeStyles.driverSearchBox}>
              <Ionicons name="search" size={16} color={themeColors.subText} />
              <TextInput
                style={themeStyles.driverSearchInput}
                value={driverSearch}
                onChangeText={setDriverSearch}
                placeholder="ค้นหาชื่อ..."
                placeholderTextColor={isDark ? "#94a3b8" : "#9ca3af"}
              />
              {driverSearch !== "" && (
                <TouchableOpacity onPress={() => setDriverSearch("")}>
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={themeColors.subText}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ทางลัด "ตัวฉัน" — ฟีเจอร์นี้คือจองให้ตัวเอง + คนอื่น ต้องเลือกตัวเองได้ */}
          <TouchableOpacity
            style={themeStyles.driverMeRow}
            onPress={() =>
              pick(
                user?.id as any,
                `ตัวฉัน (${me?.fullname || user?.fullname || "ฉัน"})`,
                me?.phone || phone,
              )
            }
            activeOpacity={0.7}
          >
            <Ionicons name="star" size={16} color="#f59e0b" />
            <Text style={themeStyles.driverMeText} numberOfLines={1}>
              ตัวฉัน ({me?.fullname || user?.fullname || "ฉัน"})
            </Text>
          </TouchableOpacity>

          <FlatList
            data={filteredEmployees}
            keyExtractor={(item) => String(item.id)}
            style={{ maxHeight: 340 }}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => (
              <View
                style={{ height: 1, backgroundColor: themeColors.border }}
              />
            )}
            ListEmptyComponent={
              <View style={{ padding: 25, alignItems: "center" }}>
                <Text style={{ color: themeColors.subText }}>
                  ไม่พบพนักงานที่ค้นหา
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={themeStyles.driverRow}
                onPress={() => pick(item.id, item.fullname, item.phone)}
                activeOpacity={0.7}
              >
                <Text style={themeStyles.driverRowName} numberOfLines={1}>
                  {item.fullname || "-"}
                </Text>
                <Text style={themeStyles.driverRowPhone}>
                  {item.phone || "-"}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    );
  };

  // ⚠️ Android: <Modal> คือ native Dialog — Modal 2 ตัวที่เป็น "พี่น้องกัน"
  // ตัวที่เปิดทีหลังจะไม่ถูกยกขึ้นมาแสดงจนกว่าตัวแรกจะปิด (ดูเหมือนแอปค้าง)
  // ดังนั้น alert ต้อง render อยู่ "ข้างใน" Modal ที่กำลังเปิดอยู่ ไม่ใช่ข้างนอก
  // → เรียกฟังก์ชันนี้ที่เดียวเสมอ โดยเลือกตำแหน่งตามว่ามี Modal ไหนเปิดอยู่
  const renderAlert = () => (
    <CustomAlertModal
      visible={alertConfig.visible}
      type={alertConfig.type}
      title={alertConfig.title}
      message={alertConfig.message}
      onConfirm={alertConfig.onConfirm}
      onCancel={alertConfig.onCancel}
      showCancel={alertConfig.showCancel}
      showConfirm={alertConfig.showConfirm}
      themeColors={themeColors}
      isDark={isDark}
    />
  );

  if (loading && !refreshing)
    return (
      <View style={themeStyles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={themeStyles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={themeColors.bg}
        />
        <ScrollView
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchData();
              }}
              tintColor={themeColors.text}
            />
          }
          contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
          style={{ backgroundColor: themeColors.bg }}
        >
          {renderActiveBookings()}
          <View>
            <View style={themeStyles.headerTitleRow}>
              <Ionicons name="calendar" size={24} color="#2563eb" />
              <Text style={themeStyles.sectionTitle}>
                จองรถใหม่ / สร้างการจอง
              </Text>
            </View>
            <View style={themeStyles.formCard}>
              {/* 👥 สลับโหมด — แสดงเฉพาะคนที่มีสิทธิ์ book_for_others
                  คนที่ไม่มีสิทธิ์จะไม่เห็นอะไรเลย หน้าจอเหมือนเดิม 100% */}
              {canBookForOthers && (
                <View style={themeStyles.modeToggleRow}>
                  {(
                    [
                      { key: "self", label: "จองให้ตัวเอง", icon: "person" },
                      {
                        key: "group",
                        label: "จองให้ตัวเอง + คนอื่น",
                        icon: "people",
                      },
                    ] as const
                  ).map((m) => {
                    const active = bookingMode === m.key;
                    return (
                      <TouchableOpacity
                        key={m.key}
                        style={[
                          themeStyles.modeBtn,
                          active && themeStyles.modeBtnActive,
                        ]}
                        onPress={() => {
                          if (bookingMode === m.key) return;
                          setBookingMode(m.key);
                          setSelectedCarId(null);
                          setCarEntries({});
                          setDriverPickerCarId(null);
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={m.icon}
                          size={14}
                          color={active ? "#fff" : themeColors.subText}
                        />
                        <Text
                          style={[
                            themeStyles.modeBtnText,
                            active && themeStyles.modeBtnTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {bookingMode === "group" ? (
                <View style={themeStyles.groupHint}>
                  <Ionicons
                    name="information-circle"
                    size={16}
                    color="#2563eb"
                  />
                  <Text style={themeStyles.groupHintText}>
                    วัน-เวลาด้านล่างเป็น{" "}
                    <Text style={{ fontWeight: "bold" }}>ค่าเริ่มต้น</Text>{" "}
                    ของคันที่เลือกใหม่ — ผู้ใช้รถ / เบอร์โทร / สถานที่ / ภารกิจ
                    ให้กรอกแยกรายคันด้านล่าง
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={themeStyles.inputLabel}>
                    เบอร์โทรศัพท์ติดต่อ (จำเป็น)
                  </Text>
                  <TextInput
                    style={themeStyles.input}
                    value={phone}
                    onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ""))}
                    placeholder="0xx-xxx-xxxx"
                    placeholderTextColor={isDark ? "#94a3b8" : "#9ca3af"}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </>
              )}
              <View style={themeStyles.dateSection}>
                <View style={themeStyles.dateHeaderRow}>
                  <Text style={themeStyles.inputLabel}>
                    {bookingMode === "group"
                      ? "เริ่มต้นใช้งาน (ค่าเริ่มต้น)"
                      : "เริ่มต้นใช้งาน"}
                  </Text>
                  <TouchableOpacity
                    style={themeStyles.nowBtn}
                    onPress={handleSetNow}
                  >
                    <Ionicons name="time" size={12} color="#2563eb" />
                    <Text style={themeStyles.nowBtnText}>เดี๋ยวนี้</Text>
                  </TouchableOpacity>
                </View>
                <View style={themeStyles.dateTimeRow}>
                  <TouchableOpacity
                    style={themeStyles.dateBtnHalf}
                    onPress={() => showPicker("start", "date")}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={16}
                      color={isDark ? "#cbd5e1" : "#555"}
                      style={{ marginRight: 5 }}
                    />
                    <Text style={themeStyles.dateText}>
                      {formatDateDisplay(startDate)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={themeStyles.dateBtnHalf}
                    onPress={() => showPicker("start", "time")}
                  >
                    <Ionicons
                      name="time-outline"
                      size={16}
                      color="#2563eb"
                      style={{ marginRight: 5 }}
                    />
                    <Text style={themeStyles.timeText}>
                      {formatTimeDisplay(startDate)} น.
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={themeStyles.dateSection}>
                <Text style={[themeStyles.inputLabel, { color: "#ef4444" }]}>
                  สิ้นสุด / คืนรถ
                </Text>
                <View style={themeStyles.dateTimeRow}>
                  <TouchableOpacity
                    style={[
                      themeStyles.dateBtnHalf,
                      {
                        backgroundColor: isDark ? "#450a0a" : "#fff1f2",
                        borderColor: "#fca5a5",
                      },
                    ]}
                    onPress={() => showPicker("end", "date")}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={16}
                      color="#ef4444"
                      style={{ marginRight: 5 }}
                    />
                    <Text style={[themeStyles.dateText, { color: "#ef4444" }]}>
                      {formatDateDisplay(endDate)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      themeStyles.dateBtnHalf,
                      {
                        backgroundColor: isDark ? "#450a0a" : "#fff1f2",
                        borderColor: "#fca5a5",
                      },
                    ]}
                    onPress={() => showPicker("end", "time")}
                  >
                    <Ionicons
                      name="time-outline"
                      size={16}
                      color="#ef4444"
                      style={{ marginRight: 5 }}
                    />
                    <Text style={[themeStyles.timeText, { color: "#ef4444" }]}>
                      {formatTimeDisplay(endDate)} น.
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {bookingMode === "group" ? (
                selectedCarIds.length > 0 && (
                  <TouchableOpacity
                    style={themeStyles.copyTimeBtn}
                    onPress={() => {
                      setCarEntries((prev) => {
                        const next: Record<number, CarEntry> = {};
                        Object.entries(prev).forEach(([cid, e]) => {
                          next[Number(cid)] = {
                            ...e,
                            startDate: new Date(startDate),
                            endDate: new Date(endDate),
                          };
                        });
                        return next;
                      });
                      showAlert(
                        "success",
                        "สำเร็จ",
                        `ตั้งวัน-เวลานี้ให้ทั้ง ${selectedCarIds.length} คันแล้ว`,
                        false,
                        undefined,
                        1200,
                      );
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="copy-outline" size={14} color="#2563eb" />
                    <Text style={themeStyles.copyTimeBtnText}>
                      ใช้เวลาเดียวกันทุกคัน ({selectedCarIds.length})
                    </Text>
                  </TouchableOpacity>
                )
              ) : (
                <>
                  <View style={themeStyles.divider} />
                  <Text style={themeStyles.inputLabel}>
                    ไปที่ไหน (สถานที่) <Text style={{ color: "red" }}>*</Text>
                  </Text>
                  <TextInput
                    style={themeStyles.input}
                    value={destination}
                    onChangeText={setDestination}
                    placeholder="ระบุอำเภอ / จังหวัด"
                    placeholderTextColor={isDark ? "#94a3b8" : "#9ca3af"}
                  />
                  <Text style={themeStyles.inputLabel}>
                    ภารกิจ / เหตุผล <Text style={{ color: "red" }}>*</Text>
                  </Text>
                  <TextInput
                    style={themeStyles.input}
                    value={reason}
                    onChangeText={setReason}
                    placeholder="รายละเอียดเพิ่มเติม..."
                    placeholderTextColor={isDark ? "#94a3b8" : "#9ca3af"}
                  />

                  {/* 👥 ผู้ร่วมเดินทาง / คนขับ / แผนงาน */}
                  {renderTravelSection("self", startDate, endDate)}

                  <TouchableOpacity
                    style={themeStyles.submitBtn}
                    onPress={handleBookingPress}
                  >
                    <Text style={themeStyles.submitBtnText}>ยืนยันการจอง</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            <View style={themeStyles.headerTitleRow}>
              <Ionicons name="car" size={24} color="#2563eb" />
              <Text style={themeStyles.sectionTitle}>
                {bookingMode === "group"
                  ? `เลือกรถ (แตะเพื่อเลือกได้หลายคัน)`
                  : "เลือกรถที่ต้องการ"}
              </Text>
            </View>
            <View style={themeStyles.filterContainer}>
              {["all", "available", "unavailable"].map((ft) => (
                <TouchableOpacity
                  key={ft}
                  style={[
                    themeStyles.filterBtn,
                    filterType === ft
                      ? ft === "all"
                        ? themeStyles.filterBtnActiveAll
                        : ft === "available"
                          ? themeStyles.filterBtnActiveGreen
                          : themeStyles.filterBtnActiveRed
                      : themeStyles.filterBtnInactive,
                  ]}
                  onPress={() => setFilterType(ft as any)}
                >
                  <Text
                    style={[
                      themeStyles.filterBtnText,
                      filterType === ft
                        ? themeStyles.filterBtnTextActive
                        : {
                            color:
                              ft === "all"
                                ? themeColors.text
                                : ft === "available"
                                  ? "#10b981"
                                  : "#ef4444",
                          },
                    ]}
                  >
                    {ft === "all"
                      ? "ทั้งหมด"
                      : ft === "available"
                        ? "ว่าง"
                        : "ไม่ว่าง"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={themeStyles.grid}>
              {filteredCars.length > 0 ? (
                filteredCars.map(renderCarItem)
              ) : (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: "#999", fontSize: 16 }}>ไม่พบรถ</Text>
                </View>
              )}
            </View>

            {/* 👥 ปุ่มยืนยัน (โหมด group) — ฟอร์มรายคันอยู่ในกล่องรถแต่ละคันแล้ว */}
            {bookingMode === "group" && renderGroupFooter()}
          </View>
        </ScrollView>
        {Platform.OS === "ios" && pickerConfig && (
          <Modal transparent animationType="fade">
            <View style={themeStyles.modalOverlay}>
              <View style={[themeStyles.modalContent, { padding: 0 }]}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    padding: 15,
                    borderBottomWidth: 1,
                    borderColor: isDark ? "#374151" : "#eee",
                  }}
                >
                  <Text style={{ fontWeight: "bold", color: themeColors.text }}>
                    เลือกเวลา
                  </Text>
                  <TouchableOpacity onPress={() => setPickerConfig(null)}>
                    <Text style={{ color: "#2563eb" }}>เสร็จสิ้น</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={
                    pickerConfig.carId != null && carEntries[pickerConfig.carId]
                      ? pickerConfig.target === "start"
                        ? carEntries[pickerConfig.carId].startDate
                        : carEntries[pickerConfig.carId].endDate
                      : pickerConfig.target === "start"
                        ? startDate
                        : endDate
                  }
                  mode={pickerConfig.mode}
                  display="spinner"
                  onChange={(e, d) =>
                    d &&
                    handleDateChange(
                      pickerConfig.target,
                      d,
                      pickerConfig.mode!,
                      pickerConfig.carId,
                    )
                  }
                  minimumDate={new Date()}
                  locale="th-TH"
                  themeVariant={isDark ? "dark" : "light"}
                />
              </View>
            </View>
          </Modal>
        )}
        <Modal
          visible={showReturnModal}
          transparent
          animationType="fade"
          onRequestClose={() => {
            Keyboard.dismiss();
            setShowReturnModal(false);
          }}
        >
          <TouchableWithoutFeedback
            onPress={Keyboard.dismiss}
            accessible={false}
          >
            <View style={themeStyles.modalOverlay}>
              <View style={themeStyles.modalContent}>
                <View style={themeStyles.modalHeader}>
                  <Text style={themeStyles.modalTitle}>แบบฟอร์มคืนรถ</Text>
                  <TouchableOpacity
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowReturnModal(false);
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: "rgba(255,255,255,0.2)",
                        borderRadius: 20,
                        padding: 5,
                      }}
                    >
                      <Ionicons name="close" size={20} color="#fff" />
                    </View>
                  </TouchableOpacity>
                </View>
                <View style={themeStyles.modalBody}>
                  <Text style={themeStyles.inputLabel}>จอดรถไว้ที่ไหน?</Text>
                  <TextInput
                    style={themeStyles.input}
                    value={parkingLoc}
                    onChangeText={setParkingLoc}
                    placeholder="ระบุตำแหน่ง"
                    placeholderTextColor={isDark ? "#94a3b8" : "#9ca3af"}
                  />
                  <Text style={themeStyles.inputLabel}>
                    {isReturnCarEV
                      ? "แบตเตอรี่คงเหลือ (%)"
                      : "ปริมาณน้ำมันคงเหลือ"}
                  </Text>
                  {isReturnCarEV ? (
                    <View>
                      <View style={themeStyles.evInputBox}>
                        <TextInput
                          style={themeStyles.evInput}
                          value={energyLevel}
                          onChangeText={setEnergyLevel}
                          keyboardType="numeric"
                          returnKeyType="done"
                          blurOnSubmit
                          onSubmitEditing={Keyboard.dismiss}
                          placeholder="0"
                          placeholderTextColor="#047857"
                        />
                        <Text style={themeStyles.evUnit}>%</Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          themeStyles.chargingBox,
                          isCharging && themeStyles.chargingBoxActive,
                        ]}
                        onPress={() => setIsCharging(!isCharging)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="flash"
                          size={20}
                          color={
                            isCharging
                              ? isDark
                                ? "#4ade80"
                                : "#15803d"
                              : isDark
                                ? "#94a3b8"
                                : "#6b7280"
                          }
                          style={{ marginRight: 8 }}
                        />
                        <Text
                          style={[
                            themeStyles.chargingText,
                            isCharging && themeStyles.chargingTextActive,
                          ]}
                        >
                          เสียบสายชาร์จทิ้งไว้
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={themeStyles.fuelRow}>
                      {["Empty", "1/4", "1/2", "3/4", "Full"].map((lvl) => (
                        <TouchableOpacity
                          key={lvl}
                          style={[
                            themeStyles.fuelBtn,
                            energyLevel === lvl && themeStyles.fuelBtnActive,
                          ]}
                          onPress={() => setEnergyLevel(lvl)}
                        >
                          <Text
                            style={[
                              themeStyles.fuelText,
                              energyLevel === lvl && themeStyles.fuelTextActive,
                            ]}
                          >
                            {lvl}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <Text style={themeStyles.inputLabel}>หมายเหตุ (ถ้ามี)</Text>
                  <TextInput
                    style={themeStyles.input}
                    value={issue}
                    onChangeText={setIssue}
                    placeholder="เช่น ยางแบน"
                    placeholderTextColor={isDark ? "#94a3b8" : "#9ca3af"}
                  />
                  <TouchableOpacity
                    style={themeStyles.confirmReturnBtn}
                    onPress={() => {
                      Keyboard.dismiss();
                      handleReturnPress();
                    }}
                  >
                    <Text style={themeStyles.confirmReturnText}>
                      ยืนยันการคืนรถ
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>

          {/* alert ต้องอยู่ในชั้นเดียวกับฟอร์มคืนรถ ไม่งั้น Android ไม่แสดง */}
          {showReturnModal && renderAlert()}
        </Modal>

        {/* 🔥 Modal ตารางงาน */}
        <Modal
          transparent={true}
          visible={scheduleModalVisible}
          animationType="slide"
          onRequestClose={() => setScheduleModalVisible(false)}
        >
          {renderScheduleModal()}

          {/* 🔥 Modal รายละเอียด — เปิดจากรายการในปฏิทิน จึงต้องอยู่ในชั้นเดียวกับ
              Modal ตารางงาน ไม่งั้น Android จะไม่ยกขึ้นมาแสดง (ดูเหมือนกดไม่ติด) */}
          <Modal
            transparent={true}
            visible={detailModalVisible}
            animationType="fade"
            onRequestClose={() => setDetailModalVisible(false)}
          >
            <View style={themeStyles.modalOverlay}>{renderDetailModal()}</View>
          </Modal>
        </Modal>

        {/* 👥 Modal เลือกผู้ใช้รถ (โหมด group) */}
        <Modal
          transparent={true}
          visible={driverPickerCarId != null}
          animationType="fade"
          onRequestClose={() => setDriverPickerCarId(null)}
        >
          {renderDriverPicker()}
        </Modal>

        {/* 👥 Modal เลือกผู้ร่วมเดินทาง (ใช้ได้ทั้ง 2 โหมด) */}
        <Modal
          transparent={true}
          visible={passengerPickerFor != null}
          animationType="fade"
          onRequestClose={() => setPassengerPickerFor(null)}
        >
          {renderPassengerPicker()}
          {/* Android: alert ต้องอยู่ใน Modal ที่เปิดอยู่ ไม่งั้นจะไม่แสดง */}
          {renderAlert()}
        </Modal>
      </KeyboardAvoidingView>
      {/* ตอนฟอร์มคืนรถ / ตัวเลือกผู้ร่วมเดินทางเปิดอยู่ alert ถูก render อยู่ข้างในนั้นแล้ว */}
      {!showReturnModal && passengerPickerFor == null && renderAlert()}
      {showScrollTop && (
        <TouchableOpacity
          style={themeStyles.scrollTopBtn}
          onPress={scrollToTop}
          activeOpacity={0.8}
        >
          <Ionicons
            name="arrow-up"
            size={24}
            color={isDark ? "#fff" : "#2563eb"}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

// --- Colors & Styles ---
const LightColors = {
  bg: "#f3f4f6",
  card: "#ffffff",
  text: "#1f2937",
  subText: "#4b5563",
  border: "#e2e8f0",
  inputBg: "#ffffff",
  activeHeader: "#10b981",
  maintenance: "#d97706",
  maintenanceBg: "#fffbeb",
  busyBg: "#fef2f2",
  textMaintenance: "#92400e",
  primary: "#2563eb",
  statusCompleted: "#6b7280",
  statusCancelled: "#000000",
  statusPending: "#f97316",
  statusOverdue: "#ef4444",
  statusActive: "#2563eb",
  statusApproved: "#10b981",
};

const DarkColors = {
  bg: "#0f172a",
  card: "#1e293b",
  text: "#f1f5f9",
  subText: "#94a3b8",
  border: "#334155",
  inputBg: "#1e293b",
  activeHeader: "#059669",
  maintenance: "#fbbf24",
  maintenanceBg: "rgba(245, 158, 11, 0.15)",
  busyBg: "rgba(239, 68, 68, 0.15)",
  textMaintenance: "#fbbf24",
  primary: "#3b82f6",
  statusCompleted: "#6b7280",
  statusCancelled: "#000000",
  statusPending: "#f97316",
  statusOverdue: "#ef4444",
  statusActive: "#3b82f6",
  statusApproved: "#10b981",
};

const getStyles = (isDark: boolean) => {
  const colors = isDark ? DarkColors : LightColors;
  return StyleSheet.create({
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.bg,
    },
    container: { flex: 1, backgroundColor: colors.bg },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 20,
      marginBottom: 10,
      paddingHorizontal: 5,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: colors.text,
      marginLeft: 10,
    },
    filterContainer: {
      flexDirection: "row",
      marginBottom: 15,
      paddingHorizontal: 5,
    },
    filterBtn: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: 1,
      marginRight: 10,
    },
    filterBtnText: { fontWeight: "bold", fontSize: 14, color: colors.text },
    filterBtnActiveAll: {
      backgroundColor: isDark ? "#fff" : "#1f2937",
      borderColor: isDark ? "#fff" : "#1f2937",
    },
    filterBtnInactive: {
      backgroundColor: "transparent",
      borderColor: isDark ? "#94a3b8" : "#4b5563",
    },
    filterBtnTextActive: { color: isDark ? "#000" : "#fff" },
    filterBtnActiveGreen: {
      backgroundColor: "#10b981",
      borderColor: "#10b981",
    },
    filterBtnInactiveGreen: {
      backgroundColor: "transparent",
      borderColor: "#10b981",
    },
    filterBtnActiveRed: {
      backgroundColor: "#ef4444",
      borderColor: "#ef4444",
    },
    filterBtnInactiveRed: {
      backgroundColor: "transparent",
      borderColor: "#ef4444",
    },
    formCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 3,
    },
    inputLabel: {
      fontSize: 14,
      color: colors.subText,
      marginBottom: 6,
      fontWeight: "600",
      marginTop: 15,
    },
    input: {
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      color: colors.text,
    },
    dateSection: { marginBottom: 5 },
    dateHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 10,
      marginBottom: 5,
    },
    nowBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark ? "#172554" : "#eff6ff",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? "#1e40af" : "#bfdbfe",
    },
    nowBtnText: {
      color: "#2563eb",
      fontSize: 12,
      fontWeight: "bold",
      marginLeft: 4,
    },
    dateTimeRow: { flexDirection: "row", justifyContent: "space-between" },
    dateBtnHalf: {
      flex: 0.48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "#0f172a" : "#f0f9ff",
      borderWidth: 1,
      borderColor: isDark ? "#1e3a8a" : "#bae6fd",
      borderRadius: 10,
      padding: 12,
    },
    dateText: { fontSize: 14, color: colors.text },
    timeText: { fontSize: 16, fontWeight: "bold", color: "#2563eb" },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 15 },
    grid: { flexDirection: "column" },
    // กรอบนอกของการ์ดรถ — ไม่ใช่ปุ่ม เพื่อให้วางฟอร์มกรอกรายคันไว้ข้างในได้
    // โดยการแตะช่องกรอกไม่ทะลุไปสั่งยกเลิกเลือกรถ
    carCard: {
      width: "100%",
      backgroundColor: colors.card,
      borderRadius: 12,
      marginBottom: 15,
      borderWidth: 2,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.03,
      shadowRadius: 5,
      elevation: 2,
      overflow: "hidden",
    },
    // แถวข้อมูลรถ (รูป + ชื่อ + สถานะ) — ส่วนที่แตะเพื่อเลือก/ยกเลิกเลือก
    carCardRow: {
      flexDirection: "row",
      padding: 10,
    },
    carCardSelected: {
      borderColor: "#2563eb",
      backgroundColor: isDark ? "#1e293b" : "#fff",
    },
    carCardBusy: {
      backgroundColor: isDark ? "#334155" : "#f9fafb",
      borderColor: "#ef4444",
    },
    imageContainer: {
      width: 110,
      height: 80,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      alignSelf: "center",
    },
    carImage: { width: "100%", height: "100%" },
    selectedOverlay: { position: "absolute", top: 0, right: 0 },
    cardContent: { flex: 1, justifyContent: "center" },
    carNumberCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: isDark ? "#f1f5f9" : "#111",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 6,
    },
    carNumberText: {
      color: isDark ? "#000" : "#fff",
      fontWeight: "bold",
      fontSize: 10,
      fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    },
    carName: {
      fontSize: 15,
      fontWeight: "bold",
      color: colors.text,
      flexShrink: 1,
    },
    subHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
    },
    plateText: { fontSize: 12, color: colors.subText, marginRight: 8 },
    typeBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      borderWidth: 1,
    },
    typeText: { fontSize: 9, fontWeight: "bold" },
    infoItemRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 3,
    },
    infoText: { fontSize: 11, color: colors.subText },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
      zIndex: 1,
    },
    statusFree: { backgroundColor: "#10b981" },
    statusBusy: { backgroundColor: "#ef4444" },
    statusText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
    scheduleBtn: {
      position: "absolute",
      bottom: 10,
      right: 10,
      backgroundColor: "#2563eb",
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 15,
      zIndex: 10,
    },
    submitBtn: {
      backgroundColor: "#2563eb",
      padding: 16,
      borderRadius: 14,
      alignItems: "center",
      marginTop: 25,
      marginBottom: 10,
      shadowColor: "#2563eb",
      shadowOpacity: 0.3,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    submitBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },

    // --- 👥 โหมดจองให้ตัวเอง + คนอื่น ---
    modeToggleRow: {
      flexDirection: "row",
      backgroundColor: isDark ? "#0f172a" : "#f1f5f9",
      borderRadius: 12,
      padding: 4,
      gap: 4,
      marginBottom: 5,
    },
    modeBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 9,
      paddingHorizontal: 6,
      borderRadius: 9,
    },
    modeBtnActive: { backgroundColor: "#2563eb" },
    modeBtnText: {
      fontSize: 12,
      fontWeight: "bold",
      color: colors.subText,
      flexShrink: 1,
    },
    modeBtnTextActive: { color: "#fff" },
    groupHint: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      backgroundColor: isDark ? "rgba(37, 99, 235, 0.12)" : "#eff6ff",
      borderWidth: 1,
      borderColor: isDark ? "#1e40af" : "#bfdbfe",
      borderRadius: 10,
      padding: 10,
      marginTop: 12,
    },
    groupHintText: {
      flex: 1,
      fontSize: 11,
      lineHeight: 17,
      color: isDark ? "#93c5fd" : "#1e40af",
    },
    copyTimeBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: isDark ? "#172554" : "#eff6ff",
      borderWidth: 1,
      borderColor: isDark ? "#1e40af" : "#bfdbfe",
      borderRadius: 10,
      paddingVertical: 10,
      marginTop: 15,
    },
    copyTimeBtnText: { color: "#2563eb", fontSize: 12, fontWeight: "bold" },
    orderBadge: {
      position: "absolute",
      top: 0,
      right: 0,
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "#2563eb",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 5,
    },
    orderBadgeText: { color: "#fff", fontSize: 11, fontWeight: "bold" },
    // ฟอร์มรายคันที่กางอยู่ในกล่องรถ
    entryInline: {
      paddingHorizontal: 12,
      paddingBottom: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: isDark ? "rgba(37, 99, 235, 0.06)" : "#f8fbff",
    },
    entryInlineHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingTop: 12,
      paddingBottom: 4,
    },
    entryInlineTitle: {
      flex: 1,
      fontSize: 12,
      fontWeight: "bold",
      color: isDark ? "#93c5fd" : "#1e40af",
    },
    entryLabel: {
      fontSize: 13,
      color: colors.subText,
      marginBottom: 5,
      fontWeight: "600",
      marginTop: 12,
    },
    // 👥 ผู้ร่วมเดินทาง / คนขับ / แผนงาน
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 8,
    },
    passengerChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 999,
      maxWidth: "100%",
      backgroundColor: isDark ? "rgba(37, 99, 235, 0.18)" : "#eff6ff",
      borderWidth: 1,
      borderColor: isDark ? "rgba(37, 99, 235, 0.5)" : "#bfdbfe",
    },
    passengerChipText: {
      fontSize: 12,
      color: isDark ? "#93c5fd" : "#1d4ed8",
      fontWeight: "600",
      flexShrink: 1,
    },
    wheelChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 6,
      paddingHorizontal: 11,
      borderRadius: 999,
      maxWidth: "100%",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    wheelChipActive: {
      backgroundColor: "#2563eb",
      borderColor: "#2563eb",
    },
    wheelChipText: {
      fontSize: 12,
      color: colors.subText,
      fontWeight: "600",
      flexShrink: 1,
    },
    tripSummaryBox: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 12,
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: isDark ? "rgba(148, 163, 184, 0.12)" : "#f8fafc",
      borderWidth: 1,
      borderColor: colors.border,
    },
    tripSummaryText: {
      fontSize: 13,
      fontWeight: "bold",
      color: colors.text,
    },
    attachBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: "#2563eb",
      backgroundColor: isDark ? "rgba(37, 99, 235, 0.12)" : "#eff6ff",
    },
    attachBtnText: { fontSize: 13, fontWeight: "600", color: "#2563eb" },
    planHintText: {
      fontSize: 11,
      color: colors.subText,
      marginTop: 6,
      lineHeight: 16,
    },
    planFileRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: isDark ? "rgba(245, 158, 11, 0.12)" : "#fffbeb",
      borderWidth: 1,
      borderColor: isDark ? "rgba(245, 158, 11, 0.4)" : "#fde68a",
    },
    planFileName: {
      flex: 1,
      fontSize: 12,
      color: colors.text,
    },
    planFileLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      alignSelf: "flex-start",
      maxWidth: "100%",
      backgroundColor: isDark ? "rgba(245, 158, 11, 0.15)" : "#fffbeb",
      borderWidth: 1,
      borderColor: isDark ? "rgba(245, 158, 11, 0.45)" : "#fde68a",
    },
    planFileLinkText: {
      fontSize: 12,
      fontWeight: "600",
      color: isDark ? "#fbbf24" : "#b45309",
      flexShrink: 1,
    },
    passengerDoneBtn: {
      margin: 15,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: "#2563eb",
      alignItems: "center",
    },
    passengerDoneText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
    entryOrderCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: "#2563eb",
      alignItems: "center",
      justifyContent: "center",
    },
    entryOrderText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
    entryRemoveBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(239, 68, 68, 0.15)" : "#fef2f2",
    },
    emptyEntryBox: {
      alignItems: "center",
      gap: 8,
      padding: 25,
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    emptyEntryText: {
      fontSize: 12,
      color: colors.subText,
      textAlign: "center",
      lineHeight: 18,
    },
    driverSelectBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
    },
    driverSelectText: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      fontWeight: "600",
    },
    driverModalCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      overflow: "hidden",
      maxHeight: "85%",
    },
    driverModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 15,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    driverModalTitle: {
      fontSize: 16,
      fontWeight: "bold",
      color: colors.text,
    },
    driverSearchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: isDark ? "#0f172a" : "#f1f5f9",
      borderRadius: 10,
      paddingHorizontal: 12,
    },
    driverSearchInput: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
    },
    driverMeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 15,
      paddingVertical: 14,
      marginTop: 12,
      backgroundColor: isDark ? "rgba(245, 158, 11, 0.12)" : "#fffbeb",
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    driverMeText: {
      flex: 1,
      fontSize: 15,
      fontWeight: "bold",
      color: colors.text,
    },
    driverRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingHorizontal: 15,
      paddingVertical: 13,
    },
    driverRowName: { flex: 1, fontSize: 15, color: colors.text },
    driverRowPhone: { fontSize: 12, color: colors.subText },
    proxyBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      alignSelf: "center",
      backgroundColor: isDark ? "rgba(37, 99, 235, 0.15)" : "#eff6ff",
      borderWidth: 1,
      borderColor: isDark ? "#1e40af" : "#bfdbfe",
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginBottom: 10,
    },
    proxyBadgeText: {
      fontSize: 11,
      fontWeight: "bold",
      color: isDark ? "#93c5fd" : "#1e40af",
    },
    activeCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.1,
      elevation: 5,
      marginBottom: 20,
    },
    headerBg: {
      backgroundColor: colors.activeHeader,
      padding: 15,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
    },
    headerTitle: { color: "#fff", fontSize: 16, fontWeight: "bold" },
    activeBody: { padding: 20, alignItems: "center" },
    returnBtn: {
      backgroundColor: "#ef4444",
      padding: 16,
      borderRadius: 14,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 25,
      shadowColor: "#ef4444",
      shadowOpacity: 0.3,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    returnBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      padding: 20,
    },
    modalContent: {
      backgroundColor: colors.card,
      borderRadius: 20,
      overflow: "hidden",
    },
    modalHeader: {
      backgroundColor: "#1f2937",
      padding: 18,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    modalTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
    modalBody: { padding: 25 },
    fuelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginVertical: 10,
    },
    fuelBtn: {
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      flex: 1,
      alignItems: "center",
      marginHorizontal: 3,
    },
    fuelBtnActive: {
      backgroundColor: isDark ? "#431407" : "#fff7ed",
      borderColor: "#f97316",
      borderWidth: 2,
    },
    fuelText: { fontSize: 12, color: colors.subText },
    fuelTextActive: { color: "#f97316", fontWeight: "bold" },
    evInputBox: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "#064e3b" : "#ecfdf5",
      padding: 20,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#10b981",
      marginBottom: 15,
    },
    evInput: {
      fontSize: 32,
      fontWeight: "bold",
      color: isDark ? "#4ade80" : "#047857",
      width: 80,
      textAlign: "center",
    },
    evUnit: {
      fontSize: 24,
      color: isDark ? "#4ade80" : "#047857",
      fontWeight: "bold",
    },
    chargingBox: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      padding: 15,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.card,
      marginVertical: 5,
    },
    chargingBoxActive: {
      backgroundColor: isDark ? "rgba(34, 197, 94, 0.25)" : "#dcfce7",
      borderColor: "#22c55e",
    },
    chargingText: { fontSize: 16, color: colors.subText, fontWeight: "500" },
    chargingTextActive: {
      color: isDark ? "#4ade80" : "#15803d",
      fontWeight: "bold",
    },
    confirmReturnBtn: {
      backgroundColor: "#10b981",
      padding: 16,
      borderRadius: 14,
      alignItems: "center",
      marginTop: 25,
      shadowColor: "#10b981",
      shadowOpacity: 0.3,
      elevation: 4,
    },
    confirmReturnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
    scrollTopBtn: {
      position: "absolute",
      bottom: 80,
      right: 20,
      backgroundColor: isDark
        ? "rgba(30, 41, 59, 0.9)"
        : "rgba(255, 255, 255, 0.9)",
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
      borderColor: isDark ? "#334155" : "#e2e8f0",
    },
  });
};
