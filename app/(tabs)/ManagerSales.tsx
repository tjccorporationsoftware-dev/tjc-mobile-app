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

export default function ManagerSales() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Data States
  const [summary, setSummary] = useState({
    total: 0,
    expense: 0,
    sales: 0,
    target: 0,
  });
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
      const name = item.reporter_name;
      if (!stats[name]) {
        stats[name] = {
          name: name,
          totalReports: 0,
          totalProjectValue: 0,
          totalExpense: 0,
          targetAmount: parseFloat(
            String(item.target_amount || "0").replace(/,/g, ""),
          ),
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
        // 🟢 STEP 1: กรองข้อมูลตาม "พนักงาน"
        // ----------------------------------------------------
        let filteredByReporter = rawList;
        if (targetReporter) {
          filteredByReporter = filteredByReporter.filter(
            (i: any) => i.reporter_name === targetReporter,
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
        let totalSalesCalculated = 0;
        let totalExpenseCalculated = 0;

        finalFilteredData.forEach((item: any) => {
          totalExpenseCalculated += parseFloat(
            String(item.total_expense).replace(/,/g, "") || "0",
          );

          const projects = cleanSplit(item.project_name);
          const statuses = cleanSplit(item.job_status);

          projects.forEach((p: string, idx: number) => {
            const currentStatus = statuses[idx] || "";
            // บวกยอดขายเฉพาะรายการที่สำเร็จ
            if (currentStatus.includes(dynamicSuccessKeyword)) {
              const { value } = parseProjectData(p);
              totalSalesCalculated += parseCurrency(value);
            }
          });
        });

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
          expense: totalExpenseCalculated,
          sales: totalSalesCalculated,
          target: globalTarget,
        });

        // นำข้อมูลไปแสดงในรายการตารางด้านล่างสุด
        setRecentList(finalFilteredData);
        fetchFilterOptions();
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
    } catch (e) {}
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
    return (
      <TouchableOpacity
        style={styles.empCard}
        onPress={() => {
          setFilterReporter(item.name);
          setFilterStatus("");
          fetchData(item.name, "");
          setEmpModalVisible(false); // ➕ สั่งปิด Popup ด้วย
        }}
      >
        <View style={styles.empHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
          </View>
          <View>
            <Text style={styles.empName}>{item.name}</Text>
            <Text style={styles.empReportCount}>
              📄 {item.totalReports} รายงาน
            </Text>
          </View>
        </View>

        {/* ➕ [เพิ่มใหม่] ส่วนแสดงเป้าหมายและ Progress Bar */}
        {(() => {
          const target = item.targetAmount || 0;
          const actual = item.totalProjectValue;
          const percent = target > 0 ? (actual / target) * 100 : 0;
          const percentCap = Math.min(percent, 100);
          const diff = actual - target;
          const barColor = percent >= 100 ? SUCCESS_COLOR : WARNING_COLOR;

          return (
            <View
              style={{
                backgroundColor: "#f8fafc",
                padding: 10,
                borderRadius: 10,
                marginTop: 10,
                borderWidth: 1,
                borderColor: "#e2e8f0",
                borderStyle: "dashed",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 5,
                }}
              >
                <Text
                  style={{ fontSize: 11, color: "#64748b", fontWeight: "bold" }}
                >
                  🏁 เป้า: {target > 0 ? target.toLocaleString() : "-"}
                </Text>
                <Text
                  style={{ fontSize: 11, color: "#334155", fontWeight: "900" }}
                >
                  {percent.toFixed(1)}%
                </Text>
              </View>

              <View
                style={{
                  height: 6,
                  backgroundColor: "#e2e8f0",
                  borderRadius: 3,
                  overflow: "hidden",
                  marginBottom: 6,
                }}
              >
                <View
                  style={{
                    width: `${percentCap}%`,
                    height: "100%",
                    backgroundColor: barColor,
                    borderRadius: 3,
                  }}
                />
              </View>

              {target > 0 && (
                <View style={{ alignItems: "flex-end" }}>
                  {diff >= 0 ? (
                    <Text
                      style={{
                        fontSize: 10,
                        color: SUCCESS_COLOR,
                        fontWeight: "bold",
                      }}
                    >
                      ▲ เกินเป้า: {diff.toLocaleString()}
                    </Text>
                  ) : (
                    <Text
                      style={{
                        fontSize: 10,
                        color: DANGER_COLOR,
                        fontWeight: "bold",
                      }}
                    >
                      ▼ ขาดอีก: {Math.abs(diff).toLocaleString()}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })()}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <View style={[styles.moneyBox, { backgroundColor: "#eff6ff" }]}>
            <Text style={{ fontSize: 10, color: INFO_COLOR }}>ยอดขายทำได้</Text>
            <Text
              style={{ fontSize: 13, fontWeight: "bold", color: "#1d4ed8" }}
              numberOfLines={1}
            >
              ฿{item.totalProjectValue.toLocaleString()}
            </Text>
          </View>
          <View style={[styles.moneyBox, { backgroundColor: "#fef2f2" }]}>
            <Text style={{ fontSize: 10, color: "#991b1b" }}>รวมเบิกจ่าย</Text>
            <Text
              style={{ fontSize: 13, fontWeight: "bold", color: "#b91c1c" }}
              numberOfLines={1}
            >
              ฿{item.totalExpense.toLocaleString()}
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 5,
            marginTop: 10,
          }}
        >
          {Object.keys(item.statusCounts).map((status, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.statusTag,
                { borderColor: getStatusColor(status) },
              ]}
              onPress={() => {
                // กดสถานะ = กรองคนนี้ + สถานะนี้
                setFilterReporter(item.name);
                setFilterStatus(status);
                fetchData(item.name, status);
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "bold",
                  color: getStatusColor(status),
                }}
              >
                {item.statusCounts[status]}
              </Text>
              <Text style={{ fontSize: 10, color: "#666", marginLeft: 4 }}>
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    );
  };

  // ================= RENDER ITEM (MAIN LIST - กลับไปใช้ Table Style ที่พี่ชอบ) =================
  const renderRecentItem = ({ item, index }: { item: any; index: number }) => {
    const customersRaw = cleanSplit(item.work_result);
    const projectsRaw = cleanSplit(item.project_name);
    const statusesRaw = cleanSplit(item.job_status);

    const validJobs: any[] = [];
    const maxLen = Math.max(
      customersRaw.length,
      projectsRaw.length,
      statusesRaw.length,
    );

    for (let i = 0; i < maxLen; i++) {
      const cus = customersRaw[i] || "";
      const proj = projectsRaw[i] || "";
      const stat = statusesRaw[i] || "";
      if (!cus || cus === "" || cus === "-") continue;
      validJobs.push({ cus, proj, stat });
    }

    if (validJobs.length === 0 && maxLen > 0) {
      validJobs.push({ cus: "-", proj: "-", stat: "-" });
    }

    // ✅ ส่วนที่เพิ่ม: กรองข้อมูลตาม filterStatus (ถ้ามี)
    const displayedJobs = filterStatus
      ? validJobs.filter((job) => job.stat === filterStatus)
      : validJobs;

    // ถ้ากรองแล้วไม่มีงานใน Card นี้เลย ให้ซ่อน Card นี้ไปเลย (return null)
    if (displayedJobs.length === 0) return null;

    const mainStatusColor = getStatusColor(displayedJobs[0]?.stat || "");
    const hasFuel = !!item.fuel_receipt;
    const hasHotel = !!item.accommodation_receipt;
    const hasOther = !!item.other_receipt;

    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(500)}>
        <View style={[styles.card, { borderLeftColor: mainStatusColor }]}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.dateText}>
                {new Date(item.report_date).toLocaleDateString("th-TH", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                })}
                <Text style={{ fontWeight: "normal", color: "#999" }}>
                  {" "}
                  •{" "}
                  {new Date(item.created_at).toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  น.
                </Text>
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 2,
                }}
              >
                <Text style={styles.reporterName}>{item.reporter_name}</Text>
                {item.gps === "Office" ? (
                  <View style={styles.tagOffice}>
                    <Text style={styles.tagTextOffice}>🏢 ออฟฟิศ</Text>
                  </View>
                ) : (
                  <View style={styles.tagOutside}>
                    <Text style={styles.tagTextOutside}>🚗 นอกสถานที่</Text>
                  </View>
                )}
              </View>
            </View>
            {parseFloat(item.total_expense) > 0 && (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 10, color: "#999" }}>รวมเบิก</Text>
                <Text style={styles.expenseText}>
                  -{parseFloat(item.total_expense).toLocaleString()}
                </Text>
              </View>
            )}
          </View>

          {/* Body: Job List (Table Style) */}
          <View style={styles.cardBody}>
            {/* หัวตาราง */}
            <View
              style={{
                flexDirection: "row",
                borderBottomWidth: 1,
                borderBottomColor: "#f1f5f9",
                paddingBottom: 6,
                marginBottom: 6,
              }}
            >
              <Text style={[styles.tableHead, { flex: 1.1 }]}>ลูกค้า</Text>
              <Text style={[styles.tableHead, { flex: 1.1 }]}>โครงการ</Text>
              <Text style={[styles.tableHead, { flex: 1, textAlign: "right" }]}>
                มูลค่า
              </Text>
              <Text
                style={[styles.tableHead, { width: 65, textAlign: "right" }]}
              >
                สถานะ
              </Text>
            </View>

            {/* ✅ ใช้ displayedJobs แทน validJobs เพื่อแสดงเฉพาะงานที่กรอง */}
            {displayedJobs.map((job, i) => {
              const { name: pjName, value: pjValue } = parseProjectData(
                job.proj,
              );
              const stColor = getStatusColor(job.stat);
              const displayValue = pjValue
                ? parseCurrency(pjValue).toLocaleString() + " ฿"
                : "-";

              return (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    paddingVertical: 8,
                    borderBottomWidth: i === displayedJobs.length - 1 ? 0 : 1,
                    borderBottomColor: "#f8fafc",
                    alignItems: "flex-start",
                  }}
                >
                  {/* 1. ลูกค้า */}
                  <View style={{ flex: 1.2, paddingRight: 4 }}>
                    <TouchableOpacity
                      onPress={() => fetchCustomerHistory(job.cus)}
                    >
                      <Text style={styles.customerLinkTable} numberOfLines={2}>
                        {job.cus || "-"}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* 2. โครงการ */}
                  <View style={{ flex: 1.2, paddingRight: 4 }}>
                    <Text style={styles.projectTextTable} numberOfLines={2}>
                      {pjName}
                    </Text>
                  </View>

                  {/* 3. มูลค่า (แยกคอลัมน์) */}
                  <View
                    style={{ flex: 1, alignItems: "flex-end", paddingRight: 4 }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        color: pjValue ? SUCCESS_COLOR : "#e2e8f0",
                        fontWeight: "700",
                      }}
                      numberOfLines={1}
                    >
                      {displayValue}
                    </Text>
                  </View>

                  {/* 4. สถานะ */}
                  <View style={{ width: 65, alignItems: "flex-end" }}>
                    <View
                      style={[
                        styles.statusBadgeSmall,
                        {
                          borderColor: stColor,
                          backgroundColor: stColor + "10",
                          marginBottom: 4,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: stColor,
                          fontSize: 9,
                          fontWeight: "700",
                        }}
                        numberOfLines={1}
                      >
                        {job.stat || "-"}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Footer */}
          <View style={styles.cardFooter}>
            <View
              style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
            >
              <Text style={{ fontSize: 10, color: "#aaa" }}>หลักฐาน:</Text>
              {hasFuel && (
                <View style={[styles.evIcon, { backgroundColor: "#fff7ed" }]}>
                  <FontAwesome5 name="gas-pump" size={12} color="#c2410c" />
                </View>
              )}
              {hasHotel && (
                <View style={[styles.evIcon, { backgroundColor: "#eff6ff" }]}>
                  <FontAwesome5 name="bed" size={12} color="#1d4ed8" />
                </View>
              )}
              {hasOther && (
                <View style={[styles.evIcon, { backgroundColor: "#fefce8" }]}>
                  <FontAwesome5 name="receipt" size={12} color="#a16207" />
                </View>
              )}
              {!hasFuel && !hasHotel && !hasOther && (
                <Text style={{ fontSize: 10, color: "#ccc" }}>-</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.viewBtn}
              onPress={() => {
                setSelectedItem(item);
                setDetailModalVisible(true);
              }}
            >
              <Text
                style={{ fontSize: 12, color: "#2563eb", fontWeight: "bold" }}
              >
                รายละเอียด <Ionicons name="chevron-forward" size={12} />
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)/manager_dashboard")}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Sales Dashboard</Text>
          <Text style={styles.headerSub}>ภาพรวมฝ่ายขาย</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowFilter(!showFilter)}
          style={[
            styles.filterBtn,
            showFilter && { backgroundColor: PRIMARY_COLOR },
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
                onPress={() => {
                  setFilterReporter("");
                  setFilterStatus("");

                  // รีเซ็ตวันที่กลับมาเป็นเดือนปัจจุบัน
                  const resetStart = new Date(
                    new Date().getFullYear(),
                    new Date().getMonth(),
                    1,
                  );
                  const resetEnd = new Date(
                    new Date().getFullYear(),
                    new Date().getMonth() + 1,
                    0,
                  );
                  setStartDate(resetStart);
                  setEndDate(resetEnd);

                  // บังคับส่งค่าใหม่เข้าไปในฟังก์ชันดึงข้อมูลทันที
                  fetchData("", "", resetStart, resetEnd);
                }}
                style={styles.resetBtn}
              >
                <Ionicons name="refresh" size={18} color="#666" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kpiGrid}
        >
          <TouchableOpacity
            style={[
              styles.kpiCard,
              { borderLeftColor: "#64748b", minWidth: 130 },
              filterStatus !== "" && { opacity: 0.5 },
            ]}
            onPress={() => setFilterStatus("")}
          >
            <Text style={[styles.kpiLabel, { color: "#64748b" }]}>
              รายงานทั้งหมด
            </Text>
            <Text style={styles.kpiValue} numberOfLines={1}>
              {summary.total}
            </Text>
          </TouchableOpacity>

          {/* ➕ ปรับการ์ดมูลค่าโครงการให้มีหลอด Progress แบบเว็บ */}
          <View
            style={[
              styles.kpiCard,
              { borderLeftColor: "#8b5cf6", minWidth: 180 },
            ]}
          >
            <Text style={[styles.kpiLabel, { color: "#8b5cf6" }]}>
              ยอดขาย vs เป้าหมาย
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text
                style={[styles.kpiValue, { color: "#1e293b" }]}
                numberOfLines={1}
              >
                ฿{parseFloat(summary.sales.toString()).toLocaleString()}
              </Text>
              <Text style={{ fontSize: 10, color: "#64748b", marginLeft: 4 }}>
                / {summary.target > 0 ? summary.target.toLocaleString() : "-"}
              </Text>
            </View>

            {(() => {
              const gPercent =
                summary.target > 0 ? (summary.sales / summary.target) * 100 : 0;
              const gCap = Math.min(gPercent, 100);
              const gColor = gPercent >= 100 ? SUCCESS_COLOR : WARNING_COLOR;
              return (
                <View style={{ marginTop: 5 }}>
                  <View
                    style={{
                      height: 4,
                      backgroundColor: "#e2e8f0",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        width: `${gCap}%`,
                        height: "100%",
                        backgroundColor: gColor,
                        borderRadius: 2,
                      }}
                    />
                  </View>
                  <Text
                    style={{
                      textAlign: "right",
                      fontSize: 10,
                      color: gColor,
                      fontWeight: "bold",
                      marginTop: 2,
                    }}
                  >
                    {gPercent.toFixed(1)}%
                  </Text>
                </View>
              );
            })()}
          </View>

          <View
            style={[
              styles.kpiCard,
              { borderLeftColor: DANGER_COLOR, minWidth: 140 },
            ]}
          >
            <Text style={[styles.kpiLabel, { color: DANGER_COLOR }]}>
              ยอดเบิกสะสมรวม
            </Text>
            <Text
              style={[styles.kpiValue, { color: "#1e293b" }]}
              numberOfLines={1}
            >
              ฿{parseFloat(summary.expense.toString()).toLocaleString()}
            </Text>
          </View>
        </ScrollView>

        {/* Status Breakdown (ใช้ processStatusBreakdown ที่มีอยู่แล้ว) */}
        <View style={styles.statusGrid}>
          {kpiList.map((item, idx) => {
            const color = getStatusColor(item.status);
            const isSelected = filterStatus === item.status;
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => {
                  const newStatus = isSelected ? "" : item.status;
                  setFilterStatus(newStatus);
                  fetchData(undefined, newStatus);
                }}
                style={[
                  styles.statusCard,
                  {
                    backgroundColor: color + "15",
                    borderColor: color,
                    borderWidth: isSelected ? 2 : 1,
                    opacity: filterStatus === "" || isSelected ? 1 : 0.4,
                  },
                ]}
              >
                <Text
                  style={{
                    color: color,
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
                    style={[styles.activeDot, { backgroundColor: color }]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ✅ ปุ่มเปิด Popup รายละเอียดรายบุคคล */}
        <View
          style={{ paddingHorizontal: 15, marginBottom: 20, marginTop: 10 }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <Text style={styles.sectionHeader}>👥 รายละเอียดรายบุคคล</Text>
            {filterReporter ? (
              <TouchableOpacity
                onPress={() => {
                  setFilterReporter("");
                  fetchData("", filterStatus);
                }}
              >
                <Text style={{ fontSize: 12, color: DANGER_COLOR }}>
                  ล้างตัวกรองคน
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.empModalBtn}
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
                      {emp.name.charAt(0)}
                    </Text>
                  </View>
                ))}
              </View>
              <Text
                style={{
                  marginLeft: 12,
                  fontWeight: "bold",
                  color: PRIMARY_COLOR,
                  fontSize: 14,
                }}
              >
                ดูสถิติทีมเซลส์ ({employeeStats.length} คน)
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={PRIMARY_COLOR} />
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 15 }}>
          <Text style={styles.sectionHeader}>
            📋 รายการล่าสุด
            {filterStatus !== "" && (
              <Text
                style={{ fontSize: 14, fontWeight: "normal", color: "#666" }}
              >
                {" "}
                (สถานะ: {filterStatus})
              </Text>
            )}
          </Text>
          {loading ? (
            <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          ) : (
            <FlatList
              data={recentList}
              keyExtractor={(item, index) => index.toString()}
              renderItem={renderRecentItem}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text
                  style={{ textAlign: "center", marginTop: 20, color: "#999" }}
                >
                  ไม่พบข้อมูล
                </Text>
              }
            />
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

                    validJobs.push({ cus, proj, stat, appt, sum, note });
                  }

                  return (
                    <>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>ผู้รายงาน:</Text>
                        <Text style={styles.detailValue}>
                          {selectedItem.reporter_name}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>วันที่:</Text>
                        <Text style={styles.detailValue}>
                          {new Date(
                            selectedItem.report_date,
                          ).toLocaleDateString("th-TH")}
                        </Text>
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
                          <View
                            key={i}
                            style={{
                              backgroundColor: "#f8fafc",
                              padding: 15,
                              borderRadius: 12,
                              marginBottom: 12,
                              borderWidth: 1,
                              borderColor: "#e2e8f0",
                            }}
                          >
                            <Text style={styles.detailLabel}>
                              ลูกค้า / หน่วยงาน
                            </Text>
                            <TouchableOpacity
                              onPress={() => fetchCustomerHistory(job.cus)}
                            >
                              <Text
                                style={{
                                  fontWeight: "bold",
                                  color: PRIMARY_COLOR,
                                  fontSize: 15,
                                  marginBottom: 8,
                                }}
                              >
                                {job.cus}
                              </Text>
                            </TouchableOpacity>

                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                marginBottom: 8,
                              }}
                            >
                              <View style={{ flex: 1, paddingRight: 5 }}>
                                <Text style={styles.detailLabel}>
                                  ชื่อโครงการ
                                </Text>
                                <Text style={styles.detailValue}>{pjName}</Text>
                              </View>
                              <View style={{ flex: 0.7 }}>
                                <Text style={styles.detailLabel}>
                                  มูลค่าโครงการ
                                </Text>
                                <Text
                                  style={{
                                    color: SUCCESS_COLOR,
                                    fontWeight: "bold",
                                    fontSize: 13,
                                  }}
                                >
                                  {displayValue}
                                </Text>
                              </View>
                            </View>

                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                marginBottom: 8,
                              }}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailLabel}>สถานะงาน</Text>
                                <View
                                  style={{
                                    alignSelf: "flex-start",
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    borderRadius: 6,
                                    backgroundColor: stColor + "15",
                                    borderWidth: 1,
                                    borderColor: stColor,
                                  }}
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
                                  นัดหมายครั้งถัดไป
                                </Text>
                                <Text style={styles.detailValue}>
                                  <Ionicons name="calendar" size={12} />{" "}
                                  {job.appt}
                                </Text>
                              </View>
                            </View>

                            {job.sum !== "" && (
                              <View
                                style={{
                                  marginTop: 5,
                                  padding: 10,
                                  backgroundColor: "#eff6ff",
                                  borderRadius: 8,
                                  borderLeftWidth: 3,
                                  borderLeftColor: INFO_COLOR,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    color: INFO_COLOR,
                                    fontWeight: "bold",
                                    marginBottom: 2,
                                  }}
                                >
                                  สรุปการเข้าพบ
                                </Text>
                                <Text
                                  style={{ fontSize: 12, color: "#334155" }}
                                >
                                  {job.sum}
                                </Text>
                              </View>
                            )}

                            {job.note !== "" && (
                              <View
                                style={{
                                  marginTop: 8,
                                  padding: 10,
                                  backgroundColor: "#fff7ed",
                                  borderRadius: 8,
                                  borderLeftWidth: 3,
                                  borderLeftColor: "#f97316",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    color: "#c2410c",
                                    fontWeight: "bold",
                                    marginBottom: 2,
                                  }}
                                >
                                  บันทึกเพิ่มเติม
                                </Text>
                                <Text
                                  style={{ fontSize: 12, color: "#7c2d12" }}
                                >
                                  {job.note}
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })}

                      <View style={styles.divider} />
                      <Text style={styles.detailSectionTitle}>
                        💸 รายละเอียดค่าใช้จ่าย
                      </Text>
                      <View style={styles.costGrid}>
                        <View style={styles.costBox}>
                          <Text style={styles.costLabel}>น้ำมัน</Text>
                          <Text style={styles.costNum}>
                            {parseFloat(
                              selectedItem.fuel_cost || 0,
                            ).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.costBox}>
                          <Text style={styles.costLabel}>ที่พัก</Text>
                          <Text style={styles.costNum}>
                            {parseFloat(
                              selectedItem.accommodation_cost || 0,
                            ).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.costBox}>
                          <Text style={styles.costLabel}>
                            อื่นๆ ({selectedItem.other_cost_detail || "-"})
                          </Text>
                          <Text style={styles.costNum}>
                            {parseFloat(
                              selectedItem.other_cost || 0,
                            ).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={{
                          marginTop: 5,
                          paddingTop: 5,
                          borderTopWidth: 1,
                          borderColor: "#eee",
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text
                          style={{ fontWeight: "bold", color: PRIMARY_COLOR }}
                        >
                          รวมสุทธิ
                        </Text>
                        <Text
                          style={{
                            fontWeight: "bold",
                            color: DANGER_COLOR,
                            fontSize: 14,
                          }}
                        >
                          {parseFloat(
                            selectedItem.total_expense,
                          ).toLocaleString()}{" "}
                          ฿
                        </Text>
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
            <FlatList
              data={employeeStats}
              keyExtractor={(item, index) => index.toString()}
              renderItem={renderEmployeeCard}
              contentContainerStyle={{ padding: 20, paddingTop: 10 }}
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
  headerSub: { fontSize: 13, color: "#64748b" },
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
  dateRow: { flexDirection: "row", gap: 15, marginBottom: 20 },
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
    backgroundColor: PRIMARY_COLOR + "15",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: PRIMARY_COLOR + "30",
  },
  filterActions: { flexDirection: "row", gap: 10 },
  searchBtn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: PRIMARY_COLOR,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: PRIMARY_COLOR,
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
  kpiGrid: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 15,
    marginBottom: 10,
    flexGrow: 1,
  },
  kpiCard: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
    elevation: 2,
    flexGrow: 1,
  },
  kpiLabel: { fontSize: 11, fontWeight: "bold", marginBottom: 5 },
  kpiValue: { fontSize: 18, fontWeight: "800", color: "#333" },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 15,
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
  activeDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },

  // Recent List & Cards
  sectionHeader: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
    marginTop: 10,
  },
  card: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    elevation: 2,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  cardBody: { marginBottom: 10 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 10,
  },

  // Table Styles inside Card
  tableHead: { fontSize: 11, color: "#94a3b8", fontWeight: "bold" },
  customerLinkTable: { color: PRIMARY_COLOR, fontWeight: "bold", fontSize: 12 },
  projectTextTable: { fontSize: 12, color: "#333" },
  statusBadgeTable: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  // ✅ เพิ่ม statusBadgeSmall (แก้จอดำ)
  statusBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: "center",
  },
  // ✅ เพิ่ม projectValueText (แก้จอดำ)
  projectValueText: {
    fontSize: 12,
    color: SUCCESS_COLOR,
    fontWeight: "bold",
    marginTop: 2,
  },

  dateText: { fontSize: 12, fontWeight: "bold", color: "#333" },
  reporterName: { fontSize: 13, color: "#333", fontWeight: "600" },
  tagOffice: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  tagTextOffice: { fontSize: 10, color: "#64748b" },
  tagOutside: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  tagTextOutside: { fontSize: 10, color: PRIMARY_COLOR },

  expenseText: { color: DANGER_COLOR, fontWeight: "bold", fontSize: 13 },
  evIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 6,
  },

  // Modals
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
  detailRow: { flexDirection: "row", marginBottom: 8 },
  detailLabel: { width: 80, fontSize: 13, color: "#64748b", fontWeight: "600" },
  detailValue: { flex: 1, fontSize: 13, color: "#333" },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 12 },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  costGrid: { flexDirection: "row", gap: 10, marginBottom: 10 },
  costBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  costLabel: { fontSize: 10, color: "#64748b" },
  costNum: { fontSize: 14, fontWeight: "bold", color: "#333" },
  gpsBox: {
    flexDirection: "row",
    backgroundColor: "#eff6ff",
    padding: 10,
    borderRadius: 8,
    marginTop: 5,
    marginBottom: 10,
  },
  evBtn: {
    flexDirection: "row",
    gap: 5,
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  noteBox: {
    backgroundColor: "#f9f9f9",
    padding: 10,
    borderRadius: 8,
    minHeight: 60,
  },

  // History & Selector
  historyItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  selectorItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },

  // Custom Calendar
  calHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: PRIMARY_COLOR,
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
  calDaySelected: { backgroundColor: PRIMARY_COLOR, borderRadius: 20 },
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
  empCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    width: "100%", // ✅ เปลี่ยนจาก minWidth เป็น 100%
    marginBottom: 15, // ✅ ปรับระยะห่างด้านล่าง
    borderLeftWidth: 4,
    borderColor: PRIMARY_COLOR,
    elevation: 3,
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
  avatarText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  empName: { fontSize: 14, fontWeight: "bold", color: "#333" },
  empReportCount: { fontSize: 12, color: "#666" },
  moneyBox: {
    flexGrow: 1,
    minWidth: 120,
    padding: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTag: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  empModalBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  avatarMicroGroup: { flexDirection: "row" },
  avatarMicro: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#eff6ff",
  },
  avatarMicroText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
});
