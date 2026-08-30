import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
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
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE, IMG_BASE_URL } from "../../constants/config";

const PRIMARY_COLOR = "#2563eb";
const SUCCESS_COLOR = "#10b981";
const WARNING_COLOR = "#f59e0b";
const DANGER_COLOR = "#ef4444";
const INFO_COLOR = "#3b82f6";

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

const TH_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// ===== Design tokens: สี/ระยะ/ขนาดตัวอักษร ใช้ทั้งหน้าให้เป็นชุดเดียว =====
const T = {
  bg: "#f1f5f9",
  surface: "#ffffff",
  line: "#e2e8f0",
  lineSoft: "#f1f5f9",
  text: "#0f172a",
  textSub: "#475569",
  textMute: "#94a3b8",
  radius: 14,
  pad: 16,
  gap: 12,
};
const FS = { xs: 11, sm: 12, md: 14, lg: 16, xl: 20, hero: 30 };

export default function ManagerSales() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Data States
  const [summary, setSummary] = useState({
    total: 0, // จำนวน "รายงาน"
    jobs: 0, // จำนวน "งาน" (1 รายงานมีได้หลายงาน)
    expense: 0,
    sales: 0,
    target: 0,
    yearly_target: 0,
  });
  // ยอดขายสะสมทั้งปี — แยกจาก summary.sales ที่ผูกกับช่วงวันที่ที่กรองอยู่
  const [yearSales, setYearSales] = useState(0);
  const [yearSalesByName, setYearSalesByName] = useState<{
    [name: string]: number;
  }>({});
  const [successKeyword, setSuccessKeyword] = useState("เซ็นสัญญา"); // ➕ เก็บคำว่าสถานะไหนคือได้งาน
  const [kpiList, setKpiList] = useState<any[]>([]);
  const [recentList, setRecentList] = useState<any[]>([]);
  const [employeeStats, setEmployeeStats] = useState<any[]>([]);

  // Filter States
  const [reporters, setReporters] = useState<string[]>([]);
  const [filterReporter, setFilterReporter] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // สร้างตัวแปรหาวันที่ 1 และวันสิ้นเดือนของเดือนปัจจุบัน
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  // กำหนดค่าเริ่มต้นให้เป็นเดือนปัจจุบัน
  const [startDate, setStartDate] = useState<Date | null>(firstDayOfMonth);
  const [endDate, setEndDate] = useState<Date | null>(lastDayOfMonth);

  // ➕ ปรับให้รับค่า successKeyword เข้ามาด้วย
  const processEmployeeStats = (dataList: any[], successKeyword: string) => {
    const stats: { [key: string]: any } = {};

    dataList.forEach((item) => {
      // ➕ [ปรับแก้] เช็คว่าเป็นทีมประมูลหรือไม่ ถ้าใช่ให้ใช้ชื่อทีมแทนชื่อพนักงาน
      const isBidding = item.team_type === "bidding";
      const name =
        isBidding && item.bidding_team_name
          ? item.bidding_team_name
          : item.reporter_name || "ไม่ระบุชื่อ";

      if (!stats[name]) {
        stats[name] = {
          name: name,
          teamType: isBidding ? "bidding" : "marketing",
          totalReports: 0,
          totalProjectValue: 0,
          totalExpense: 0,
          targetAmount: parseFloat(String(item.target_amount || "0").replace(/,/g, "")),
          yearlyTargetAmount: parseFloat(String(item.yearly_target_amount || "0").replace(/,/g, "")), // ➕ เพิ่มบรรทัดนี้
          statusCounts: {},
        };
      }
      stats[name].totalReports += 1;
      stats[name].totalExpense += parseFloat(
        String(item.total_expense).replace(/,/g, "") || "0",
      );

      const projects = cleanSplit(item.project_name);
      const statuses = cleanSplit(item.job_status);

      projects.forEach((p, idx) => {
        const currentStatus = statuses[idx] || "";
        // ✅ ใช้ค่า Keyword ไดนามิกมาเช็ค
        if (currentStatus.includes(successKeyword)) {
          const { value } = parseProjectData(p);
          if (value) {
            const numVal = parseCurrency(value);
            stats[name].totalProjectValue += numVal;
          }
        }
      });

      statuses.forEach((s) => {
        if (s && s !== "-") {
          stats[name].statusCounts[s] = (stats[name].statusCounts[s] || 0) + 1;
        }
      });
    });
    return Object.values(stats);
  };

  // ➕ [เพิ่มใหม่] Helper แยกสถานะไม่ให้ติดคอมม่า (วางไว้คู่กัน)
  const processStatusBreakdown = (dataList: any[]) => {
    const statusCount: { [key: string]: number } = {};
    dataList.forEach((item) => {
      // ใช้ cleanSplit เพื่อตัด Comma ออกให้เป็น Array
      const statuses = cleanSplit(item.job_status);
      statuses.forEach((s) => {
        if (s && s !== "-" && s !== "") {
          statusCount[s] = (statusCount[s] || 0) + 1;
        }
      });
    });
    return Object.keys(statusCount).map((key) => ({
      status: key,
      count: statusCount[key],
    }));
  };

  // UI States
  const [showFilter, setShowFilter] = useState(false);

  // Modals
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [empModalVisible, setEmpModalVisible] = useState(false); // ➕ State สำหรับ Popup พนักงาน
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);

  // --- Custom Date Picker States ---
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateMode, setDateMode] = useState<"start" | "end">("start");
  const [pickerDate, setPickerDate] = useState(new Date());
  const [pickerView, setPickerView] = useState<"day" | "month" | "year">("day");

  // ✅ Helper 1: แกะชื่อโครงการและมูลค่า (ตัดคำว่ามูลค่าออกจากชื่อ)
  const parseProjectData = (rawText: string) => {
    if (!rawText || rawText === "-") return { name: "-", value: "" };

    // Regex: หาตัวเลขหลังคำว่า "มูลค่า" (รองรับ 500,000)
    const regexValue = /มูลค่า\s*[:\s]?\s*([\d,.]+)/i;
    const match = rawText.match(regexValue);

    if (match) {
      const valStr = match[1]; // ได้ค่า "500,000"
      // ลบส่วนที่เป็น (มูลค่า...) ทิ้งจากชื่อ
      let cleanName = rawText
        .replace(/[\(-]?\s*มูลค่า\s*[:\s]?\s*[\d,.]+(\s*บาท)?\)?/gi, "")
        .trim();
      // ถ้าลบแล้วเหลือแต่ขีด หรือว่างเปล่า ให้ใส่ -
      if (cleanName === "" || cleanName === "-") cleanName = "-";

      return { name: cleanName, value: valStr };
    }

    return { name: rawText, value: "" };
  };

  // ✅ Helper 2: แปลง "500,000" เป็นตัวเลข (แก้บั๊กแสดงผลผิด)
  const parseCurrency = (valStr: string) => {
    if (!valStr || valStr === "-") return 0;
    return parseFloat(valStr.replace(/,/g, ""));
  };

  // ✅ Helper 3: แยก String เป็น Array
  const cleanSplit = (str: string) => {
    if (!str) return [];
    // แยกด้วย comma แต่ "ห้ามแยก" ถ้า comma นั้นอยู่ในวงเล็บ (...)
    return str.split(/,(?![^(]*\))/).map((s) => s.trim());
  };

  // ✅ Helper 4: แยกบรรทัด (สำหรับ Summary/Notes)
  const newlineSplit = (str: string) => {
    if (!str) return [];
    return str.split(/\r?\n/).map((s) => s.trim());
  };

  // Helper 5: สกัดชื่อสมาชิกทีมจาก activity_detail
  const extractTeamMembers = (
    activityDetail: string,
    customerName: string,
  ): string[] => {
    if (!activityDetail || !customerName) return [];
    const lines = newlineSplit(activityDetail);
    for (const line of lines) {
      if (line.includes(customerName)) {
        const match = line.match(/\[ทีม:\s*([^\]]+)\]/);
        if (match) {
          return match[1]
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean);
        }
      }
    }
    return [];
  };

  const getStatusColor = (status: string) => {
    const s = (status || "").trim();
    if (s.includes("ไม่ได้") || s.includes("ยกเลิก") || s.includes("แพ้"))
      return DANGER_COLOR;

    // ✅ เพิ่ม s.includes(successKeyword) เพื่อให้สถานะไดนามิกกลายเป็นสีเขียว
    if (
      s.includes(successKeyword) ||
      s.includes("ได้งาน") ||
      s.includes("สำเร็จ")
    )
      return SUCCESS_COLOR;

    if (s.includes("ติดตาม") || s.includes("รอ")) return WARNING_COLOR;
    if (s.includes("เสนอ")) return INFO_COLOR;
    return "#8b5cf6";
  };

  const getStatusIcon = (status: string) => {
    const s = (status || "").trim();
    if (s.includes("ไม่ได้") || s.includes("ยกเลิก")) return "close-circle";

    // ✅ เพิ่มตรงนี้ด้วยเช่นกัน
    if (
      s.includes(successKeyword) ||
      s.includes("ได้งาน") ||
      s.includes("สำเร็จ")
    )
      return "checkmark-circle";

    if (s.includes("ติดตาม") || s.includes("รอ")) return "time";
    return "pricetag";
  };

  // ชื่อที่ใช้แสดง/จัดกลุ่ม: ทีมประมูลใช้ชื่อทีม นอกนั้นใช้ชื่อผู้รายงาน
  const displayNameOf = (item: any) =>
    item.team_type === "bidding" && item.bidding_team_name
      ? item.bidding_team_name
      : item.reporter_name || "ไม่ระบุชื่อ";

  // แตก 1 รายงาน -> หลายงาน (backend ส่ง work_result/project_name/job_status
  // มาเป็น string คั่นคอมมา แล้วจับคู่กันด้วย index)
  const jobsOf = (item: any) => {
    const customers = cleanSplit(item.work_result);
    const projects = cleanSplit(item.project_name);
    const statuses = cleanSplit(item.job_status);
    const len = Math.max(customers.length, projects.length, statuses.length);
    const jobs: { cus: string; proj: string; stat: string }[] = [];
    for (let i = 0; i < len; i++) {
      const cus = customers[i] || "";
      if (!cus || cus === "-") continue;
      jobs.push({ cus, proj: projects[i] || "", stat: statuses[i] || "-" });
    }
    return jobs;
  };

  // รวมมูลค่าโครงการเฉพาะงานที่ปิดได้
  const sumSales = (list: any[], keyword: string) => {
    let total = 0;
    list.forEach((item) => {
      const projects = cleanSplit(item.project_name);
      const statuses = cleanSplit(item.job_status);
      projects.forEach((p, idx) => {
        if ((statuses[idx] || "").includes(keyword)) {
          total += parseCurrency(parseProjectData(p).value) || 0;
        }
      });
    });
    return total;
  };

  // ข้อมูลทั้งปีโหลดครั้งเดียวแล้วแคชไว้ เปลี่ยนตัวกรองไม่ต้องยิงใหม่
  // (ล้างแคชตอนดึงลงรีเฟรช)
  const yearCache = useRef<{ list: any[]; keyword: string } | null>(null);

  // ยอดขายสะสมทั้งปีปฏิทิน ใช้กับการ์ด "เป้าทั้งปี" เท่านั้น
  // (เดิมการ์ดนี้เอา summary.sales ของเดือนที่กรองอยู่ไปหารเป้าปี % จึงผิดตลอด)
  const fetchYearSales = async (overrideReporter?: string) => {
    try {
      if (!yearCache.current) {
        const y = new Date().getFullYear();
        const res = await axios.get(
          `${API_BASE}/api_mobile.php?action=get_dashboard_stats&tab=sales&start_date=${y}-01-01&end_date=${y}-12-31`,
        );
        yearCache.current = {
          list: res.data?.recent || [],
          keyword: res.data?.success_keyword || successKeyword,
        };
      }
      const { list, keyword } = yearCache.current;
      const who =
        overrideReporter !== undefined ? overrideReporter : filterReporter;
      const scoped = who
        ? list.filter((i: any) => displayNameOf(i) === who)
        : list;
      setYearSales(sumSales(scoped, keyword));

      // แยกยอดสะสมรายคน/รายทีม ไว้ให้การ์ดสถิติรายบุคคลใช้ (ไม่ผูกกับตัวกรอง)
      const byName: { [name: string]: number } = {};
      list.forEach((i: any) => {
        const n = displayNameOf(i);
        byName[n] = (byName[n] || 0) + sumSales([i], keyword);
      });
      setYearSalesByName(byName);
    } catch (e) {
      setYearSales(0);
      setYearSalesByName({});
    }
  };

  const fetchData = async (
    overrideReporter?: string,
    overrideStatus?: string,
    overrideStart?: Date | null,
    overrideEnd?: Date | null,
  ) => {
    try {
      if (!refreshing) setLoading(true);
      const params = new URLSearchParams();
      params.append("action", "get_dashboard_stats");
      params.append("tab", "sales");

      const formatDateLocal = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      const currentStart =
        overrideStart === undefined ? startDate : overrideStart;
      const currentEnd = overrideEnd === undefined ? endDate : overrideEnd;
      if (currentStart)
        params.append("start_date", formatDateLocal(currentStart));
      if (currentEnd) params.append("end_date", formatDateLocal(currentEnd));

      const response = await axios.get(
        `${API_BASE}/api_mobile.php?${params.toString()}`,
      );

      if (response.data) {
        let rawList = response.data.recent || [];

        // รับค่า Keyword จาก API
        const dynamicSuccessKeyword =
          response.data.success_keyword || "เซ็นสัญญา";
        setSuccessKeyword(dynamicSuccessKeyword);

        const targetReporter =
          overrideReporter !== undefined ? overrideReporter : filterReporter;
        const targetStatus =
          overrideStatus !== undefined ? overrideStatus : filterStatus;

        // ----------------------------------------------------
        // 🟢 STEP 1: กรองข้อมูลตาม "พนักงาน หรือ ชื่อทีมประมูล"
        // ----------------------------------------------------
        let filteredByReporter = rawList;
        if (targetReporter) {
          filteredByReporter = filteredByReporter.filter(
            (i: any) => displayNameOf(i) === targetReporter,
          );
        }

        // อัปเดต Status Breakdown (ใช้ข้อมูลที่กรองแค่พนักงาน เพื่อให้เห็นปุ่มสถานะอื่นๆ ให้กดสลับได้)
        setKpiList(processStatusBreakdown(filteredByReporter));

        // ----------------------------------------------------
        // 🟢 STEP 2: กรองข้อมูลขั้นสุดท้ายตาม "สถานะ"
        // ----------------------------------------------------
        let finalFilteredData = filteredByReporter;
        if (targetStatus) {
          finalFilteredData = finalFilteredData.filter((i: any) => {
            const s = cleanSplit(i.job_status);
            return s.includes(targetStatus);
          });
        }

        // ----------------------------------------------------
        // 🟢 STEP 3: คำนวณ KPI และการ์ดพนักงาน จากข้อมูลที่กรองแล้ว 100%
        // ----------------------------------------------------
        let totalExpenseCalculated = 0;
        let totalJobs = 0;

        finalFilteredData.forEach((item: any) => {
          totalExpenseCalculated += parseFloat(
            String(item.total_expense).replace(/,/g, "") || "0",
          );
          // นับ "งาน" แยกจาก "รายงาน" เพื่อไม่ให้ตัวเลขสองหน่วยปนกันบนหน้าจอ
          totalJobs += jobsOf(item).filter(
            (j) => !targetStatus || j.stat === targetStatus,
          ).length;
        });

        const totalSalesCalculated = sumSales(
          finalFilteredData,
          dynamicSuccessKeyword,
        );

        // ดึงสถิติรายบุคคล (ประมวลผลจากข้อมูลที่ผ่านตัวกรองแล้วเท่านั้น)
        const empStats = processEmployeeStats(
          finalFilteredData,
          dynamicSuccessKeyword,
        );
        setEmployeeStats(empStats);

        // คำนวณเป้าหมายรวม
        let globalTarget = 0;
        if (targetReporter) {
          // ถ้าเลือกดูเฉพาะคน ใช้เป้าหมายของคนนั้น
          empStats.forEach((emp: any) => {
            globalTarget += emp.targetAmount;
          });
        } else {
          // ถ้าไม่ได้เลือกคน (ดูทั้งบริษัท) ใช้ยอดเป้าหมายรวมจาก API จะได้ไม่หายไปเวลากดกรองสถานะ
          globalTarget = response.data.summary.target || 0;
        }

        // อัปเดต Summary หลัก (ด้านบนสุด) ให้ตัวเลขขยับตามข้อมูลในตารางเป๊ะๆ
        setSummary({
          total: finalFilteredData.length,
          jobs: totalJobs,
          expense: totalExpenseCalculated,
          sales: totalSalesCalculated,
          target: globalTarget,
          yearly_target: response.data.summary.yearly_target || 0,
        });

        // นำข้อมูลไปแสดงในรายการตารางด้านล่างสุด
        setRecentList(finalFilteredData);
        fetchFilterOptions();
        fetchYearSales(targetReporter);
      }
    } catch (error) {
      console.log("Fetch Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const res = await axios.get(
        `${API_BASE}/api_mobile.php?action=get_users`,
      );
      if (Array.isArray(res.data)) setReporters(res.data);
    } catch (e) { }
  };

  // ล้างตัวกรองทั้งหมด กลับไปเดือนปัจจุบัน (ใช้ร่วมกันทั้งแถบ chip / ปุ่มรีเซ็ต / empty state)
  const resetFilters = () => {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setFilterReporter("");
    setFilterStatus("");
    setStartDate(s);
    setEndDate(e);
    fetchData("", "", s, e);
  };

  const fetchCustomerHistory = async (customerName: string) => {
    setHistoryModalVisible(true);
    setSelectedCustomer(customerName);
    setLoadingHistory(true);
    const res = await axios.get(
      `${API_BASE}/api_mobile.php?ajax_action=get_customer_history&customer_name=${encodeURIComponent(customerName)}`,
    );
    setCustomerHistory(Array.isArray(res.data) ? res.data : []);
    setLoadingHistory(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  const openImage = (filename: string) => {
    if (!filename) return;
    const fullUrl = `${IMG_BASE_URL}/${filename.trim()}`;
    Linking.openURL(fullUrl).catch(() =>
      Alert.alert("Error", "เปิดไฟล์ไม่ได้"),
    );
  };

  const openCustomDatePicker = (mode: "start" | "end") => {
    setDateMode(mode);
    setPickerDate((mode === "start" ? startDate : endDate) || new Date());
    setPickerView("day");
    setShowDatePicker(true);
  };

  const handleDateSelect = (day: number) => {
    const d = new Date(pickerDate.getFullYear(), pickerDate.getMonth(), day);
    if (dateMode === "start") setStartDate(d);
    else setEndDate(d);
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
                color: PRIMARY_COLOR,
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
                color: PRIMARY_COLOR,
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

  const renderEmployeeCard = ({ item }: { item: any }) => {
    const isBidding = item.teamType === "bidding";
    const themeColor = isBidding ? "#7c3aed" : PRIMARY_COLOR;
    const yearActual = yearSalesByName[item.name] || 0;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.empCard, { borderLeftColor: themeColor }]}
        onPress={() => {
          setFilterReporter(item.name);
          setFilterStatus("");
          fetchData(item.name, "");
          setEmpModalVisible(false);
        }}
      >
        <View style={styles.empHeader}>
          <View style={[styles.avatar, { backgroundColor: themeColor }]}>
            {isBidding ? (
              <Ionicons name="people" size={18} color="#fff" />
            ) : (
              <Text style={styles.avatarText}>
                {String(item.name || "?").charAt(0)}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.empName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.empReportCount}>
              {item.totalReports} รายงานในช่วงที่เลือก
            </Text>
          </View>
        </View>

        {/* ใช้แถบเป้าชุดเดียวกับหน้าหลัก: ยอดเดือนเทียบเป้าเดือน, ยอดสะสมทั้งปีเทียบเป้าปี */}
        <View style={styles.empGoals}>
          {renderGoal(
            "เป้าเดือนนี้",
            item.totalProjectValue,
            item.targetAmount || 0,
            WARNING_COLOR,
          )}
          <View style={styles.heroGoalSep} />
          {renderGoal(
            "เป้าทั้งปี (สะสม)",
            yearActual,
            item.yearlyTargetAmount || 0,
            "#0284c7",
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <View style={[styles.moneyBox, { backgroundColor: "#eff6ff" }]}>
            <Text style={styles.moneyLabel}>ยอดขายทำได้</Text>
            <Text
              style={[styles.moneyValue, { color: "#1d4ed8" }]}
              numberOfLines={1}
            >
              ฿{item.totalProjectValue.toLocaleString()}
            </Text>
          </View>
          <View style={[styles.moneyBox, { backgroundColor: "#fef2f2" }]}>
            <Text style={[styles.moneyLabel, { color: "#991b1b" }]}>
              รวมเบิกจ่าย
            </Text>
            <Text
              style={[styles.moneyValue, { color: "#b91c1c" }]}
              numberOfLines={1}
            >
              ฿{item.totalExpense.toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={styles.empStatusWrap}>
          {Object.keys(item.statusCounts).map((status, idx) => {
            const color = getStatusColor(status);
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.statusTag, { borderColor: color + "55" }]}
                onPress={() => {
                  setFilterReporter(item.name);
                  setFilterStatus(status);
                  fetchData(item.name, status);
                  setEmpModalVisible(false);
                }}
              >
                <Text style={[styles.statusTagCount, { color }]}>
                  {item.statusCounts[status]}
                </Text>
                <Text style={styles.statusTagLabel} numberOfLines={1}>
                  {status}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    );
  };

  // ================= แถบความคืบหน้าเทียบเป้า =================
  const renderGoal = (
    label: string,
    actual: number,
    target: number,
    tone: string,
  ) => {
    const pct = target > 0 ? (actual / target) * 100 : 0;
    const done = pct >= 100;
    const color = done ? SUCCESS_COLOR : tone;
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.goalTop}>
          <Text style={styles.goalLabel}>{label}</Text>
          <Text style={[styles.goalPct, { color }]}>
            {target > 0 ? pct.toFixed(0) + "%" : "—"}
          </Text>
        </View>
        <View style={styles.goalTrack}>
          <View
            style={[
              styles.goalFill,
              {
                width: `${Math.min(pct, 100) || 0}%`,
                backgroundColor: color,
              },
            ]}
          />
        </View>
        <Text style={styles.goalFoot} numberOfLines={1}>
          {target > 0
            ? (done ? "เกินเป้า " : "ขาดอีก ") +
              Math.abs(actual - target).toLocaleString() +
              "  ·  เป้า " +
              target.toLocaleString()
            : "ยังไม่ได้ตั้งเป้า"}
        </Text>
      </View>
    );
  };

  // ================= การ์ดรายงาน: 1 การ์ด = 1 รายงาน, ข้างในบล็อกละ 1 งาน =================
  const renderRecentItem = (
    row: { item: any; jobs: { cus: string; proj: string; stat: string }[] },
    index: number,
  ) => {
    const { item, jobs } = row;
    const expense = parseFloat(item.total_expense) || 0;
    const isOffice = item.gps === "Office";
    const receipts = [
      {
        on: !!item.fuel_receipt,
        icon: "gas-pump",
        color: "#c2410c",
        bg: "#fff7ed",
      },
      {
        on: !!item.accommodation_receipt,
        icon: "bed",
        color: "#1d4ed8",
        bg: "#eff6ff",
      },
      {
        on: !!item.other_receipt,
        icon: "receipt",
        color: "#a16207",
        bg: "#fefce8",
      },
    ].filter((r) => r.on);

    return (
      <Animated.View
        key={index}
        entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(320)}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.card}
          onPress={() => {
            setSelectedItem(item);
            setDetailModalVisible(true);
          }}
        >
          {/* ใคร - เมื่อไหร่ - เบิกเท่าไหร่ */}
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.cardName} numberOfLines={1}>
                {displayNameOf(item)}
              </Text>
              <View style={styles.cardMetaRow}>
                <Text style={styles.cardMeta}>
                  {new Date(item.report_date).toLocaleDateString("th-TH", {
                    day: "numeric",
                    month: "short",
                  })}
                  {"  ·  "}
                  {new Date(item.created_at).toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" น."}
                </Text>
                <View
                  style={[
                    styles.placeTag,
                    { backgroundColor: isOffice ? T.lineSoft : "#eff6ff" },
                  ]}
                >
                  <Ionicons
                    name={isOffice ? "business" : "car"}
                    size={10}
                    color={isOffice ? T.textSub : PRIMARY_COLOR}
                  />
                  <Text
                    style={[
                      styles.placeText,
                      { color: isOffice ? T.textSub : PRIMARY_COLOR },
                    ]}
                  >
                    {isOffice ? "ออฟฟิศ" : "นอกสถานที่"}
                  </Text>
                </View>
              </View>
            </View>
            {expense > 0 && (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.cardMetaSm}>เบิก</Text>
                <Text style={styles.expenseText}>
                  -{expense.toLocaleString()}
                </Text>
              </View>
            )}
          </View>

          {/* งานแต่ละรายการ */}
          {jobs.map((job, i) => {
            const { name: pjName, value: pjValue } = parseProjectData(job.proj);
            const stColor = getStatusColor(job.stat);
            const money = parseCurrency(pjValue) || 0;
            return (
              <View key={i} style={[styles.jobRow, i > 0 && styles.jobDivider]}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <TouchableOpacity
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    onPress={() => fetchCustomerHistory(job.cus)}
                  >
                    <Text style={styles.jobCustomer} numberOfLines={1}>
                      {job.cus}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.jobProject} numberOfLines={2}>
                    {pjName && pjName !== "-" ? pjName : "ไม่ระบุโครงการ"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", minWidth: 104 }}>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: stColor + "18" },
                    ]}
                  >
                    <Text
                      style={[styles.statusPillText, { color: stColor }]}
                      numberOfLines={1}
                    >
                      {job.stat}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.jobMoney,
                      !money && { color: T.textMute, fontWeight: "500" },
                    ]}
                    numberOfLines={1}
                  >
                    {money ? "฿" + money.toLocaleString() : "ไม่ระบุมูลค่า"}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* หลักฐานแนบ + ทางเข้ารายละเอียด */}
          <View style={styles.cardFooter}>
            <View
              style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
            >
              {receipts.length > 0 ? (
                receipts.map((r, i) => (
                  <View
                    key={i}
                    style={[styles.evIcon, { backgroundColor: r.bg }]}
                  >
                    <FontAwesome5
                      name={r.icon as any}
                      size={11}
                      color={r.color}
                    />
                  </View>
                ))
              ) : (
                <Text style={styles.cardMetaSm}>ไม่มีหลักฐานแนบ</Text>
              )}
            </View>
            <View style={styles.detailLinkRow}>
              <Text style={styles.detailLink}>รายละเอียด</Text>
              <Ionicons
                name="chevron-forward"
                size={13}
                color={PRIMARY_COLOR}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // รายการที่จะแสดงจริง - กรองสถานะที่ระดับ "งาน" ครั้งเดียวที่นี่
  // (เดิมกรองซ้ำในตัว render แล้ว return null ทำให้ empty state ไม่เคยขึ้น)
  const visibleList = React.useMemo(() => {
    return recentList
      .map((item: any) => {
        const jobs = jobsOf(item);
        const shown = filterStatus
          ? jobs.filter((j) => j.stat === filterStatus)
          : jobs;
        return { item, jobs: shown };
      })
      .filter((row) => row.jobs.length > 0);
  }, [recentList, filterStatus]);

  const fmtShort = (d: Date | null) =>
    d
      ? d.getDate() +
        " " +
        TH_MONTHS_SHORT[d.getMonth()] +
        " " +
        String(d.getFullYear() + 543).slice(-2)
      : "";
  const rangeLabel =
    startDate && endDate
      ? fmtShort(startDate) + " – " + fmtShort(endDate)
      : "ทุกช่วงเวลา";
  const activeFilterCount = (filterReporter ? 1 : 0) + (filterStatus ? 1 : 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)/manager_dashboard")}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>ภาพรวมฝ่ายขาย</Text>
          <Text style={styles.headerSub}>{rangeLabel}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowFilter(!showFilter)}
          style={[
            styles.filterBtn,
            showFilter && { backgroundColor: PRIMARY_COLOR },
          ]}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={showFilter ? "#fff" : T.text}
          />
          {activeFilterCount > 0 && !showFilter && (
            <View style={styles.filterDot}>
              <Text style={styles.filterDotText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ตัวกรองที่ใช้อยู่ รวมไว้ที่เดียว กดกากบาทเพื่อล้างทีละอัน */}
      {activeFilterCount > 0 && (
        <View style={styles.chipBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipBarInner}
          >
            {filterReporter !== "" && (
              <TouchableOpacity
                style={styles.chip}
                onPress={() => {
                  setFilterReporter("");
                  fetchData("", filterStatus);
                }}
              >
                <Ionicons name="person" size={12} color={PRIMARY_COLOR} />
                <Text style={styles.chipText} numberOfLines={1}>
                  {filterReporter}
                </Text>
                <Ionicons name="close" size={13} color={T.textMute} />
              </TouchableOpacity>
            )}
            {filterStatus !== "" && (
              <TouchableOpacity
                style={styles.chip}
                onPress={() => {
                  setFilterStatus("");
                  fetchData(undefined, "");
                }}
              >
                <View
                  style={[
                    styles.chipDot,
                    { backgroundColor: getStatusColor(filterStatus) },
                  ]}
                />
                <Text style={styles.chipText} numberOfLines={1}>
                  {filterStatus}
                </Text>
                <Ionicons name="close" size={13} color={T.textMute} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={resetFilters}
              hitSlop={{ top: 8, bottom: 8 }}
            >
              <Text style={styles.chipClear}>ล้างทั้งหมด</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              yearCache.current = null;
              setRefreshing(true);
              fetchData();
            }}
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
                  <Ionicons name="calendar-outline" size={20} color="#666" />
                  <Text
                    style={{
                      color: startDate ? "#333" : "#999",
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
                  <Ionicons name="calendar-outline" size={20} color="#666" />
                  <Text
                    style={{ color: endDate ? "#333" : "#999", marginLeft: 8 }}
                  >
                    {endDate ? endDate.toLocaleDateString("th-TH") : "ทั้งหมด"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
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
              <TouchableOpacity
                onPress={resetFilters}
                style={styles.resetBtn}
              >
                <Ionicons name="refresh" size={18} color="#666" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* ===== สรุปยอดขายเทียบเป้า ===== */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>ยอดขายที่ปิดได้</Text>
            <View style={styles.heroTag}>
              <Ionicons
                name="checkmark-circle"
                size={11}
                color={SUCCESS_COLOR}
              />
              <Text style={styles.heroTagText} numberOfLines={1}>
                {successKeyword}
              </Text>
            </View>
          </View>
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
            ฿{summary.sales.toLocaleString()}
          </Text>

          <View style={styles.heroGoals}>
            {renderGoal(
              "เป้าเดือนนี้",
              summary.sales,
              summary.target,
              WARNING_COLOR,
            )}
            <View style={styles.heroGoalSep} />
            {renderGoal(
              "เป้าทั้งปี (สะสม)",
              yearSales,
              summary.yearly_target,
              "#0284c7",
            )}
          </View>
        </View>

        {/* ===== ตัวเลขรวม: แยกหน่วย "รายงาน" กับ "งาน" ให้ชัด ===== */}
        <View style={styles.statRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>
              {summary.total.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>รายงาน</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>
              {summary.jobs.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>งาน</Text>
          </View>
          <View style={styles.statTile}>
            <Text
              style={[styles.statValue, { color: DANGER_COLOR }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              ฿{summary.expense.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>เบิกจ่าย</Text>
          </View>
        </View>

        {/* ===== สถานะงาน ===== */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionHeader}>สถานะงาน</Text>
            {kpiList.length > 0 && (
              <Text style={styles.sectionHint}>แตะเพื่อกรอง</Text>
            )}
          </View>
          {kpiList.length === 0 ? (
            <Text style={styles.mutedText}>ไม่มีข้อมูลสถานะในช่วงนี้</Text>
          ) : (
            <View style={styles.chipWrap}>
              {kpiList.map((it, idx) => {
                const color = getStatusColor(it.status);
                const isSelected = filterStatus === it.status;
                return (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.8}
                    onPress={() => {
                      const next = isSelected ? "" : it.status;
                      setFilterStatus(next);
                      fetchData(undefined, next);
                    }}
                    style={[
                      styles.statusChip,
                      {
                        borderColor: isSelected ? color : T.line,
                        backgroundColor: isSelected ? color + "14" : T.surface,
                      },
                    ]}
                  >
                    <View
                      style={[styles.chipDot, { backgroundColor: color }]}
                    />
                    <Text
                      style={[
                        styles.statusChipText,
                        isSelected && { color, fontWeight: "700" },
                      ]}
                      numberOfLines={1}
                    >
                      {it.status}
                    </Text>
                    <Text style={[styles.statusChipCount, { color }]}>
                      {it.count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ===== ทีมเซลส์ ===== */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ทีมเซลส์</Text>
          <TouchableOpacity
            style={styles.empModalBtn}
            activeOpacity={0.85}
            disabled={employeeStats.length === 0}
            onPress={() => setEmpModalVisible(true)}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={styles.avatarMicroGroup}>
                {employeeStats.slice(0, 4).map((emp, i) => (
                  <View
                    key={i}
                    style={[
                      styles.avatarMicro,
                      { marginLeft: i > 0 ? -12 : 0 },
                    ]}
                  >
                    <Text style={styles.avatarMicroText}>
                      {String(emp.name || "?").charAt(0)}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.empModalBtnText}>
                {employeeStats.length > 0
                  ? "ดูสถิติรายบุคคล (" + employeeStats.length + " คน)"
                  : "ยังไม่มีข้อมูลรายบุคคล"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={PRIMARY_COLOR} />
          </TouchableOpacity>
        </View>

        {/* ===== รายการล่าสุด ===== */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionHeader}>รายการล่าสุด</Text>
            {!loading && visibleList.length > 0 && (
              <Text style={styles.sectionHint}>
                {visibleList.length} รายงาน
              </Text>
            )}
          </View>

          {loading ? (
            <ActivityIndicator
              size="large"
              color={PRIMARY_COLOR}
              style={{ marginTop: 28 }}
            />
          ) : visibleList.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name="document-text-outline"
                size={30}
                color={T.textMute}
              />
              <Text style={styles.emptyText}>
                {activeFilterCount > 0
                  ? "ไม่พบรายงานตามตัวกรองนี้"
                  : "ยังไม่มีรายงานในช่วงวันที่ที่เลือก"}
              </Text>
              {activeFilterCount > 0 && (
                <TouchableOpacity style={styles.emptyBtn} onPress={resetFilters}>
                  <Text style={styles.emptyBtnText}>ล้างตัวกรอง</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            visibleList.map((row, i) => renderRecentItem(row, i))
          )}
        </View>
      </ScrollView>

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

      {/* ✅ Detail Modal: ปรับ Layout ใหม่ตามสั่ง (แสดงครบทุกช่องใน Box) */}
      <Modal visible={detailModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>รายละเอียด</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#999" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {selectedItem &&
                (() => {
                  const customers = cleanSplit(selectedItem.work_result);
                  const projects = cleanSplit(selectedItem.project_name);
                  const statuses = cleanSplit(selectedItem.job_status);
                  const nextAppts = cleanSplit(selectedItem.next_appointment);
                  const summaries = newlineSplit(selectedItem.activity_detail);
                  const notes = newlineSplit(selectedItem.additional_notes);

                  const validJobs: any[] = [];
                  const maxLen = Math.max(
                    customers.length,
                    projects.length,
                    statuses.length,
                  );
                  for (let i = 0; i < maxLen; i++) {
                    const cus = customers[i] || "";
                    if (!cus || cus === "" || cus === "-") continue;

                    const proj = projects[i] || "";
                    const stat = statuses[i] || "-";
                    const appt = nextAppts[i] || "-";
                    let sum = summaries[i] || "";
                    sum = sum.replace(/^[•\-\d].*?:\s*/, "").trim();
                    let note = notes[i] || "";
                    note = note.replace(/^\(.*\):\s*/, "").trim();

                    const members = extractTeamMembers(
                      selectedItem.activity_detail,
                      cus,
                    );
                    validJobs.push({
                      cus,
                      proj,
                      stat,
                      appt,
                      sum,
                      note,
                      members,
                    });
                  }

                  return (
                    <>
                      {/* Meta chips */}
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                          marginBottom: 14,
                          flexWrap: "wrap",
                        }}
                      >
                        <View style={styles.metaChip}>
                          <Ionicons
                            name="person-outline"
                            size={14}
                            color="#64748b"
                          />
                          <Text style={styles.metaChipText}>
                            {selectedItem.reporter_name}
                          </Text>
                        </View>
                        <View style={styles.metaChip}>
                          <Ionicons
                            name="calendar-outline"
                            size={14}
                            color="#64748b"
                          />
                          <Text style={styles.metaChipText}>
                            {new Date(
                              selectedItem.report_date,
                            ).toLocaleDateString("th-TH")}
                          </Text>
                        </View>
                        <View style={styles.metaChip}>
                          <Ionicons
                            name={
                              selectedItem.gps === "Office"
                                ? "business-outline"
                                : "car-outline"
                            }
                            size={14}
                            color="#64748b"
                          />
                          <Text style={styles.metaChipText}>
                            {selectedItem.gps === "Office"
                              ? "ออฟฟิศ"
                              : "นอกสถานที่"}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={[styles.detailSectionTitle, { marginTop: 10 }]}
                      >
                        💼 รายละเอียดงาน
                      </Text>
                      {validJobs.map((job, i) => {
                        const { name: pjName, value: pjValue } =
                          parseProjectData(job.proj);
                        const stColor = getStatusColor(job.stat);
                        const displayValue = pjValue
                          ? parseCurrency(pjValue).toLocaleString() + " ฿"
                          : "-";
                        return (
                          <View key={i} style={styles.jobDetailCard}>
                            {/* ชื่อลูกค้า */}
                            <TouchableOpacity
                              onPress={() => fetchCustomerHistory(job.cus)}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                marginBottom: job.members?.length > 0 ? 6 : 10,
                              }}
                            >
                              <Ionicons
                                name="business"
                                size={15}
                                color={PRIMARY_COLOR}
                              />
                              <Text
                                style={{
                                  fontSize: 15,
                                  fontWeight: "600",
                                  color: PRIMARY_COLOR,
                                }}
                              >
                                {job.cus}
                              </Text>
                            </TouchableOpacity>

                            {/* ผู้ร่วมทีมประมูล */}
                            {job.members?.length > 0 && (
                              <View
                                style={{
                                  flexDirection: "row",
                                  flexWrap: "wrap",
                                  gap: 6,
                                  marginBottom: 10,
                                  paddingLeft: 2,
                                }}
                              >
                                <Ionicons
                                  name="people-outline"
                                  size={13}
                                  color="#7c3aed"
                                  style={{ marginTop: 2 }}
                                />
                                {job.members.map(
                                  (member: string, idx: number) => (
                                    <View
                                      key={idx}
                                      style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        backgroundColor: "#f5f3ff",
                                        borderRadius: 6,
                                        paddingHorizontal: 8,
                                        paddingVertical: 3,
                                        borderWidth: 0.5,
                                        borderColor: "#ddd6fe",
                                      }}
                                    >
                                      <Text
                                        style={{
                                          fontSize: 11,
                                          color: "#7c3aed",
                                          fontWeight: "500",
                                        }}
                                      >
                                        {member}
                                      </Text>
                                    </View>
                                  ),
                                )}
                              </View>
                            )}

                            {/* Grid 2 คอลัมน์ */}
                            <View
                              style={{
                                flexDirection: "row",
                                gap: 10,
                                marginBottom: 8,
                              }}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailLabel}>
                                  ชื่อโครงการ
                                </Text>
                                <Text style={styles.detailValue}>{pjName}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailLabel}>
                                  มูลค่าโครงการ
                                </Text>
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontWeight: "600",
                                    color: pjValue ? SUCCESS_COLOR : "#ccc",
                                  }}
                                >
                                  {displayValue}
                                </Text>
                              </View>
                            </View>
                            <View
                              style={{
                                flexDirection: "row",
                                gap: 10,
                                marginBottom: 6,
                              }}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailLabel}>สถานะงาน</Text>
                                <View
                                  style={[
                                    styles.statusBadgeSmall,
                                    {
                                      borderColor: stColor,
                                      backgroundColor: stColor + "18",
                                      alignSelf: "flex-start",
                                      marginTop: 2,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={{
                                      color: stColor,
                                      fontSize: 11,
                                      fontWeight: "bold",
                                    }}
                                  >
                                    {job.stat}
                                  </Text>
                                </View>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailLabel}>
                                  นัดหมายถัดไป
                                </Text>
                                <Text style={styles.detailValue}>
                                  {job.appt}
                                </Text>
                              </View>
                            </View>

                            {/* สรุปการเข้าพบ */}
                            {job.sum !== "" && (
                              <View style={styles.noteBlue}>
                                <Text style={styles.noteLabelBlue}>
                                  สรุปการเข้าพบ
                                </Text>
                                <Text style={styles.noteTextBlue}>
                                  {job.sum}
                                </Text>
                              </View>
                            )}

                            {/* บันทึกเพิ่มเติม */}
                            {job.note !== "" && (
                              <View
                                style={[
                                  styles.noteBlue,
                                  {
                                    borderLeftColor: "#f97316",
                                    backgroundColor: "#fff7ed",
                                    marginTop: 6,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.noteLabelBlue,
                                    { color: "#c2410c" },
                                  ]}
                                >
                                  บันทึกเพิ่มเติม
                                </Text>
                                <Text
                                  style={[
                                    styles.noteTextBlue,
                                    { color: "#7c2d12" },
                                  ]}
                                >
                                  {job.note}
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })}

                      <View style={styles.divider} />
                      <View style={styles.expenseCard}>
                        {[
                          {
                            label: "น้ำมัน",
                            icon: "flame-outline",
                            val: selectedItem.fuel_cost,
                          },
                          {
                            label: "ที่พัก",
                            icon: "bed-outline",
                            val: selectedItem.accommodation_cost,
                          },
                          {
                            label: `อื่นๆ (${selectedItem.other_cost_detail || "-"})`,
                            icon: "receipt-outline",
                            val: selectedItem.other_cost,
                          },
                        ].map((row, i) => (
                          <View key={i} style={styles.expenseRow}>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <Ionicons
                                name={row.icon as any}
                                size={16}
                                color="#64748b"
                              />
                              <Text style={{ fontSize: 13, color: "#64748b" }}>
                                {row.label}
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "500",
                                color: "#333",
                              }}
                            >
                              {parseFloat(row.val || 0).toLocaleString()} ฿
                            </Text>
                          </View>
                        ))}
                        <View
                          style={[
                            styles.expenseRow,
                            {
                              borderTopWidth: 0.5,
                              borderColor: "#e2e8f0",
                              marginTop: 4,
                              paddingTop: 8,
                            },
                          ]}
                        >
                          <Text style={{ fontWeight: "600", color: "#333" }}>
                            รวมสุทธิ
                          </Text>
                          <Text
                            style={{
                              fontWeight: "700",
                              fontSize: 15,
                              color: DANGER_COLOR,
                            }}
                          >
                            {parseFloat(
                              selectedItem.total_expense,
                            ).toLocaleString()}{" "}
                            ฿
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={[styles.detailSectionTitle, { marginTop: 10 }]}
                      >
                        📸 หลักฐาน
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        {selectedItem.fuel_receipt &&
                          selectedItem.fuel_receipt
                            .split(",")
                            .map((img: string, i: number) => (
                              <TouchableOpacity
                                key={i}
                                onPress={() => openImage(img)}
                                style={[
                                  styles.evBtn,
                                  { borderColor: "#c2410c" },
                                ]}
                              >
                                <FontAwesome5 name="gas-pump" color="#c2410c" />
                                <Text
                                  style={{ fontSize: 10, color: "#c2410c" }}
                                >
                                  น้ำมัน {i + 1}
                                </Text>
                              </TouchableOpacity>
                            ))}
                        {selectedItem.accommodation_receipt && (
                          <TouchableOpacity
                            onPress={() =>
                              openImage(selectedItem.accommodation_receipt)
                            }
                            style={[styles.evBtn, { borderColor: "#1d4ed8" }]}
                          >
                            <FontAwesome5 name="bed" color="#1d4ed8" />
                            <Text style={{ fontSize: 10, color: "#1d4ed8" }}>
                              ที่พัก
                            </Text>
                          </TouchableOpacity>
                        )}
                        {selectedItem.other_receipt && (
                          <TouchableOpacity
                            onPress={() =>
                              openImage(selectedItem.other_receipt)
                            }
                            style={[styles.evBtn, { borderColor: "#a16207" }]}
                          >
                            <FontAwesome5 name="receipt" color="#a16207" />
                            <Text style={{ fontSize: 10, color: "#a16207" }}>
                              อื่นๆ
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  );
                })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* History Modal */}
      <Modal visible={historyModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: "80%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ประวัติ: {selectedCustomer}</Text>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            {loadingHistory ? (
              <ActivityIndicator
                size="large"
                color={PRIMARY_COLOR}
                style={{ marginTop: 20 }}
              />
            ) : (
              <FlatList
                data={customerHistory}
                keyExtractor={(item, index) => index.toString()}
                ListEmptyComponent={
                  <Text
                    style={{
                      textAlign: "center",
                      marginTop: 20,
                      color: "#999",
                    }}
                  >
                    ไม่พบประวัติ
                  </Text>
                }
                renderItem={({ item }) => {
                  const { name: hPjName, value: hPjValue } = parseProjectData(
                    item.project_name,
                  );
                  const displayVal = hPjValue
                    ? parseCurrency(hPjValue).toLocaleString() + " ฿"
                    : null;

                  return (
                    <View style={styles.historyItem}>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text style={{ fontWeight: "bold", color: "#333" }}>
                          <Ionicons name="calendar-outline" />{" "}
                          {new Date(item.report_date).toLocaleDateString(
                            "th-TH",
                          )}
                        </Text>
                        {parseFloat(item.total_expense) > 0 && (
                          <Text style={{ color: DANGER_COLOR, fontSize: 12 }}>
                            -{parseFloat(item.total_expense).toLocaleString()}
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 13, color: "#666" }}>
                        <Ionicons name="person" size={12} />{" "}
                        {item.reporter_name}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          marginTop: 5,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, color: PRIMARY_COLOR }}>
                            {hPjName}
                          </Text>
                          {displayVal ? (
                            <Text
                              style={{
                                fontSize: 11,
                                color: SUCCESS_COLOR,
                                fontWeight: "bold",
                              }}
                            >
                              💰 {displayVal}
                            </Text>
                          ) : null}
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 4,
                            justifyContent: "flex-end",
                            flex: 0.8,
                          }}
                        >
                          {cleanSplit(item.job_status).map(
                            (s: string, i: number) => {
                              const color = getStatusColor(s);
                              return (
                                <Text
                                  key={i}
                                  style={{
                                    fontSize: 10,
                                    backgroundColor: color + "20",
                                    color: color,
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 4,
                                    overflow: "hidden",
                                    fontWeight: "bold",
                                  }}
                                >
                                  {s}
                                </Text>
                              );
                            },
                          )}
                        </View>
                      </View>
                      {item.additional_notes && (
                        <Text
                          style={{
                            fontSize: 12,
                            color: "#888",
                            marginTop: 5,
                            fontStyle: "italic",
                          }}
                        >
                          "{item.additional_notes}"
                        </Text>
                      )}
                    </View>
                  );
                }}
              />
            )}
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
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color={PRIMARY_COLOR}
                      />
                    )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Employee List Modal (Popup สถิติรายบุคคลแนวตั้ง) */}
      <Modal visible={empModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: "85%", padding: 0 }]}>
            <View
              style={[
                styles.modalHeader,
                { padding: 20, paddingBottom: 15, marginBottom: 0 },
              ]}
            >
              <Text style={styles.modalTitle}>👥 สถิติทีมเซลส์</Text>
              <TouchableOpacity onPress={() => setEmpModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#999" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 10 }}>
              {/* ➕ [ปรับแก้] แยกกลุ่มทีมประมูล (สีม่วง) และ ทีมการตลาด (สีน้ำเงิน) แบบหน้าเว็บ */}

              {employeeStats.filter((e) => e.teamType === "bidding").length >
                0 && (
                  <View style={{ marginBottom: 15 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "bold",
                        color: "#7c3aed",
                        marginBottom: 10,
                      }}
                    >
                      <Ionicons name="people" size={16} /> ทีมประมูล
                    </Text>
                    {employeeStats
                      .filter((e) => e.teamType === "bidding")
                      .map((emp, index) => (
                        <View key={`bid-${index}`}>
                          {renderEmployeeCard({ item: emp })}
                        </View>
                      ))}
                  </View>
                )}

              {employeeStats.filter((e) => e.teamType !== "bidding").length >
                0 && (
                  <View style={{ marginBottom: 15 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "bold",
                        color: PRIMARY_COLOR,
                        marginBottom: 10,
                      }}
                    >
                      <Ionicons name="person" size={16} /> ทีมการตลาด (รายบุคคล)
                    </Text>
                    {employeeStats
                      .filter((e) => e.teamType !== "bidding")
                      .map((emp, index) => (
                        <View key={`mkt-${index}`}>
                          {renderEmployeeCard({ item: emp })}
                        </View>
                      ))}
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
  container: { flex: 1, backgroundColor: T.bg },

  // ===== Header + แถบตัวกรองที่ใช้อยู่ =====
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: T.pad,
    paddingVertical: 12,
    backgroundColor: T.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.line,
  },
  backBtn: {
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: T.bg,
    borderRadius: 10,
    marginRight: 12,
  },
  headerTitle: { fontSize: FS.xl, fontWeight: "800", color: T.text },
  headerSub: { fontSize: FS.sm, color: T.textSub, marginTop: 1 },
  filterBtn: {
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: T.bg,
  },
  filterDot: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: PRIMARY_COLOR,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: T.surface,
  },
  filterDotText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  chipBar: {
    backgroundColor: T.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.line,
    paddingVertical: 8,
  },
  chipBarInner: {
    gap: 8,
    alignItems: "center",
    paddingHorizontal: T.pad,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 200,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.bg,
  },
  chipText: { fontSize: FS.sm, color: T.text, fontWeight: "600", flexShrink: 1 },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipClear: {
    fontSize: FS.sm,
    color: DANGER_COLOR,
    fontWeight: "600",
    paddingHorizontal: 4,
  },

  // ===== แผงตัวกรอง =====
  filterSection: {
    backgroundColor: T.surface,
    padding: T.pad,
    margin: T.pad,
    marginBottom: 0,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.line,
  },
  sectionTitle: {
    fontSize: FS.lg,
    fontWeight: "700",
    color: T.text,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: FS.sm,
    color: T.textSub,
    marginBottom: 6,
    fontWeight: "600",
  },
  filterInput: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 10,
    backgroundColor: T.bg,
  },
  dateRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 10,
    backgroundColor: T.bg,
  },
  filterActions: { flexDirection: "row", gap: 10 },
  searchBtn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  resetBtn: {
    width: 50,
    backgroundColor: T.bg,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: T.line,
  },

  // ===== Hero: ยอดขายเทียบเป้า =====
  hero: {
    backgroundColor: T.surface,
    margin: T.pad,
    marginBottom: T.gap,
    padding: T.pad,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.line,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heroLabel: { fontSize: FS.sm, color: T.textSub, fontWeight: "600" },
  heroTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 150,
    backgroundColor: SUCCESS_COLOR + "14",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  heroTagText: {
    fontSize: FS.xs,
    color: "#047857",
    fontWeight: "700",
    flexShrink: 1,
  },
  heroValue: {
    fontSize: FS.hero,
    fontWeight: "800",
    color: T.text,
    marginTop: 4,
    letterSpacing: -0.5,
  },
  heroGoals: {
    flexDirection: "row",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: T.lineSoft,
  },
  heroGoalSep: { width: 1, backgroundColor: T.lineSoft, marginHorizontal: 14 },
  goalTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  goalLabel: { fontSize: FS.xs, color: T.textSub, fontWeight: "600" },
  goalPct: { fontSize: FS.sm, fontWeight: "800" },
  goalTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: T.line,
    overflow: "hidden",
  },
  goalFill: { height: "100%", borderRadius: 3 },
  goalFoot: { fontSize: 10, color: T.textMute, marginTop: 5 },

  // ===== ตัวเลขรวม 3 ช่อง =====
  statRow: {
    flexDirection: "row",
    gap: T.gap,
    paddingHorizontal: T.pad,
    marginBottom: 4,
  },
  statTile: {
    flex: 1,
    backgroundColor: T.surface,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.line,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  statValue: { fontSize: FS.lg, fontWeight: "800", color: T.text },
  statLabel: { fontSize: FS.xs, color: T.textMute, marginTop: 2 },

  // ===== Section ทั่วไป =====
  section: { paddingHorizontal: T.pad, marginTop: 20 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionHeader: {
    fontSize: FS.lg,
    fontWeight: "700",
    color: T.text,
    marginBottom: 10,
  },
  sectionHint: { fontSize: FS.sm, color: T.textMute, marginBottom: 10 },
  mutedText: { fontSize: FS.sm, color: T.textMute },

  // ===== ชิปสถานะ =====
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: FS.sm,
    color: T.textSub,
    fontWeight: "600",
    maxWidth: 140,
  },
  statusChipCount: { fontSize: FS.sm, fontWeight: "800" },

  // ===== การ์ดรายงาน =====
  card: {
    backgroundColor: T.surface,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.line,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    marginBottom: T.gap,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.lineSoft,
  },
  cardName: { fontSize: FS.md, fontWeight: "700", color: T.text },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },
  cardMeta: { fontSize: FS.xs, color: T.textMute },
  cardMetaSm: { fontSize: 10, color: T.textMute },
  placeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  placeText: { fontSize: 10, fontWeight: "600" },
  expenseText: { color: DANGER_COLOR, fontWeight: "700", fontSize: FS.md },

  // งาน 1 บล็อก
  jobRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 11,
  },
  jobDivider: { borderTopWidth: 1, borderTopColor: T.lineSoft },
  jobCustomer: { fontSize: FS.md, fontWeight: "600", color: PRIMARY_COLOR },
  jobProject: { fontSize: FS.sm, color: T.textSub, marginTop: 2 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    maxWidth: 104,
  },
  statusPillText: { fontSize: FS.xs, fontWeight: "700" },
  jobMoney: {
    fontSize: FS.sm,
    fontWeight: "700",
    color: SUCCESS_COLOR,
    marginTop: 4,
  },

  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: T.lineSoft,
    paddingVertical: 9,
  },
  evIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  detailLinkRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  detailLink: { fontSize: FS.sm, color: PRIMARY_COLOR, fontWeight: "700" },

  // ===== Empty state =====
  empty: {
    alignItems: "center",
    paddingVertical: 36,
    backgroundColor: T.surface,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.line,
    borderStyle: "dashed",
  },
  emptyText: { fontSize: FS.sm, color: T.textMute, marginTop: 8 },
  emptyBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: PRIMARY_COLOR + "14",
  },
  emptyBtnText: { fontSize: FS.sm, color: PRIMARY_COLOR, fontWeight: "700" },

  // ===== ปุ่มเปิดสถิติทีม =====
  empModalBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: T.surface,
    padding: 14,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.line,
  },
  empModalBtnText: {
    marginLeft: 12,
    fontWeight: "700",
    color: PRIMARY_COLOR,
    fontSize: FS.md,
  },
  avatarMicroGroup: { flexDirection: "row" },
  avatarMicro: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: T.surface,
  },
  avatarMicroText: { color: "#fff", fontSize: FS.xs, fontWeight: "700" },

  // ===== Modal =====
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    maxHeight: "80%",
    backgroundColor: T.surface,
    borderRadius: T.radius + 2,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: T.line,
    paddingBottom: 10,
  },
  modalTitle: { fontSize: FS.lg + 2, fontWeight: "700", color: T.text },
  detailLabel: {
    fontSize: FS.xs,
    color: T.textMute,
    fontWeight: "600",
    marginBottom: 2,
  },
  detailValue: { fontSize: FS.sm, color: T.text },
  divider: { height: 1, backgroundColor: T.line, marginVertical: 14 },
  detailSectionTitle: {
    fontSize: FS.md,
    fontWeight: "700",
    color: T.text,
    marginBottom: 8,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: T.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: T.line,
  },
  metaChipText: { fontSize: FS.sm, color: T.textSub },
  jobDetailCard: {
    backgroundColor: T.bg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: T.line,
  },
  statusBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  noteBlue: {
    borderLeftWidth: 3,
    borderLeftColor: "#85B7EB",
    backgroundColor: "#E6F1FB",
    borderRadius: 8,
    padding: 9,
    marginTop: 8,
  },
  noteLabelBlue: {
    fontSize: 10,
    fontWeight: "700",
    color: "#185FA5",
    marginBottom: 3,
  },
  noteTextBlue: { fontSize: FS.sm, color: "#0C447C" },
  expenseCard: {
    backgroundColor: T.bg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: T.line,
  },
  expenseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: T.lineSoft,
  },
  evBtn: {
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    backgroundColor: T.surface,
  },
  historyItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.lineSoft,
  },
  selectorItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: T.lineSoft,
  },

  // ===== การ์ดพนักงานใน Modal สถิติทีม =====
  empCard: {
    backgroundColor: T.surface,
    borderRadius: T.radius,
    padding: 14,
    width: "100%",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.line,
    borderLeftWidth: 4,
  },
  empHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: FS.lg },
  empName: { fontSize: FS.md, fontWeight: "700", color: T.text },
  empReportCount: { fontSize: FS.sm, color: T.textMute },
  empGoals: {
    flexDirection: "row",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: T.lineSoft,
  },
  moneyBox: {
    flex: 1,
    padding: 9,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  moneyLabel: { fontSize: 10, color: INFO_COLOR },
  moneyValue: { fontSize: FS.md, fontWeight: "700", marginTop: 1 },
  empStatusWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  statusTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: T.surface,
  },
  statusTagCount: { fontSize: FS.sm, fontWeight: "800" },
  statusTagLabel: { fontSize: FS.xs, color: T.textSub, maxWidth: 130 },

  // ===== ปฏิทินเลือกวันที่ =====
  calHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: PRIMARY_COLOR,
    borderTopLeftRadius: T.radius + 2,
    borderTopRightRadius: T.radius + 2,
  },
  calTitle: { color: "#fff", fontSize: FS.lg + 2, fontWeight: "700" },
  calNavBtn: { padding: 5 },
  calWeekRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 5,
  },
  calWeekText: {
    color: T.textSub,
    fontSize: FS.md,
    width: 35,
    textAlign: "center",
  },
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
  calDayText: { fontSize: FS.lg, color: T.text },
  calDayEmpty: { width: "14.28%", height: 40 },
  calDaySelected: { backgroundColor: PRIMARY_COLOR, borderRadius: 20 },
  calDayTextSelected: { color: "#fff", fontWeight: "700" },
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
    backgroundColor: T.bg,
    borderRadius: 8,
  },
  yearText: { fontSize: FS.lg, color: T.text },
});
