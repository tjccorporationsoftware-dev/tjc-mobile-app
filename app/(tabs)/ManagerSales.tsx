import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
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
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE, IMG_BASE_URL } from "../../constants/config";
// 🌟 รูปแบบวันที่สั้น "d/m/yy" มาตรฐานเดียวกันทั้งแอป แทน toLocaleDateString("th-TH")/ชื่อเดือนย่อ
import { formatShortThaiDate } from "../../components/DateTimeField";
import { useAuth } from "../_layout";

// โทนน้ำเงินชุดเดียวกับ sidebar / หน้า login (navy → blue → sky)
const PRIMARY_COLOR = "#1d4ed8";
const THEME_GRADIENT = ["#0a1f5c", "#1d4ed8", "#0ea5e9"] as const;
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
  bg: "#f0f5fd",
  surface: "#ffffff",
  line: "#e2e8f0",
  lineSoft: "#eef2f7",
  text: "#0f172a",
  textSub: "#475569",
  textMute: "#94a3b8",
  cardLine: "#e6ecf5",
  radius: 14,
  pad: 16,
  gap: 12,
};
const FS = { xs: 11, sm: 12, md: 14, lg: 16, xl: 20, hero: 30 };
// เงาการ์ดบางๆ โทนน้ำเงินเข้ม ใช้กับการ์ด/แผงทั้งหน้า
const CARD_SHADOW = {
  shadowColor: "#0a1f5c",
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// 📎 เอกสารแนบเพิ่ม (reports.expense_docs JSON) → แยกตามหมวด fuel / hotel / other
const DOC_LABEL: Record<string, string> = {
  slip: "สลิป",
  tax_invoice: "ใบกำกับภาษี",
  receipt: "ใบเสร็จ",
  other: "เอกสารอื่น",
};
const parseExpenseDocs = (
  item: any,
): { cat: string; type: string; file: string }[] => {
  try {
    const raw =
      typeof item?.expense_docs === "string"
        ? JSON.parse(item.expense_docs || "[]")
        : item?.expense_docs;
    return Array.isArray(raw) ? raw.filter((d: any) => d && d.file) : [];
  } catch {
    return [];
  }
};
// fuel_cost เก็บแยกบิลคั่นด้วยคอมม่า เช่น "500,300"
const sumCsv = (v: any) =>
  String(v ?? "")
    .split(",")
    .reduce((s, x) => s + (parseFloat(x) || 0), 0);
const splitFiles = (v: any) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// 🗂️ หลักฐานแยกรอบ (เหมือน renderEvidenceByRound ใน js/dashboard_script.js ฝั่งเว็บ)
type EvCat = "fuel" | "hotel" | "other";
interface EvDoc {
  cat: EvCat;
  file: string;
  type: string; // ป้ายภาษาไทย: สลิป / ใบกำกับภาษี / ใบเสร็จ / เอกสาร
  round: number;
  entry: number | null;
}
interface EvAmount {
  cat: EvCat;
  amount: number;
  detail: string;
  round: number;
  idx: number; // ลำดับรายการในหมวด (ตรงกับ entry ของเอกสาร)
}
const EV_CATS: { key: EvCat; label: string; color: string; icon: string }[] = [
  { key: "fuel", label: "น้ำมัน", color: "#ea580c", icon: "gas-pump" },
  { key: "hotel", label: "ที่พัก", color: "#2563eb", icon: "bed" },
  { key: "other", label: "อื่นๆ", color: "#d97706", icon: "receipt" },
];
const EV_TYPE_ORDER = ["สลิป", "ใบกำกับภาษี", "ใบเสร็จ", "เอกสาร"];
const EV_TYPE_NAME: Record<string, string> = {
  slip: "สลิป",
  tax_invoice: "ใบกำกับภาษี",
  receipt: "ใบเสร็จ",
  other: "เอกสาร",
};
const asCat = (c: any): EvCat => (c === "fuel" || c === "hotel" ? c : "other");

// รายการหลักฐานทั้งหมดของรายงาน: สลิปรูปแบบเดิม (นับเป็นรอบ 1) + เอกสารแนบ (expense_docs)
const buildEvidence = (item: any): EvDoc[] => {
  const docs: EvDoc[] = [];
  const legacy = (v: any, cat: EvCat) =>
    splitFiles(v)
      .filter((f) => f !== "0" && f !== "null")
      .forEach((f) => docs.push({ cat, file: f, type: "สลิป", round: 1, entry: null }));
  legacy(item?.fuel_receipt, "fuel");
  legacy(item?.accommodation_receipt, "hotel");
  legacy(item?.other_receipt, "other");
  parseExpenseDocs(item).forEach((d: any) =>
    docs.push({
      cat: asCat(d.cat),
      file: String(d.file),
      type: EV_TYPE_NAME[d.type] || "เอกสาร",
      round: Math.max(1, parseInt(d.round, 10) || 1),
      entry: Number.isInteger(d.entry) ? d.entry : null,
    }),
  );
  return docs;
};

// expense_rounds: {round, round_at: {"1": "...", "2": "..."}, amounts: [{cat, amount, detail, round}]}
const parseRounds = (item: any): { roundAt: Record<string, string>; amounts: EvAmount[] } => {
  let rx: any = {};
  try {
    rx =
      typeof item?.expense_rounds === "string"
        ? JSON.parse(item.expense_rounds || "{}")
        : item?.expense_rounds || {};
  } catch {
    rx = {};
  }
  const seen: Record<string, number> = {};
  const amounts: EvAmount[] = (Array.isArray(rx?.amounts) ? rx.amounts : []).map((a: any) => {
    const cat = asCat(a?.cat);
    const idx = seen[cat] ?? 0;
    seen[cat] = idx + 1;
    return {
      cat,
      amount: parseFloat(a?.amount) || 0,
      detail: String(a?.detail ?? ""),
      round: Math.max(1, parseInt(a?.round, 10) || 1),
      idx,
    };
  });
  const roundAt =
    rx?.round_at && typeof rx.round_at === "object" ? (rx.round_at as Record<string, string>) : {};
  return { roundAt, amounts };
};

// 💰 รายงานนี้ติ๊ก "จ่ายแล้ว" หรือยัง (API แนบ is_paid มากับ get_dashboard_stats tab=sales)
const isPaid = (item: any) => String(item?.is_paid ?? "0") === "1";

// ย่อเงินก้อนใหญ่ให้อ่านง่ายในที่แคบ: 63,583,333.33 → "63.58 ล้าน"
const fmtMoneyShort = (n: number) =>
  Math.abs(n) >= 1e6
    ? (n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " ล้าน"
    : Math.round(n).toLocaleString();

// สีเหรียญอันดับ 1-3 ใน popup สถิติทีมเซลส์ (ทอง / เงิน / ทองแดง)
const RANK_COLORS = ["#f59e0b", "#64748b", "#c2410c"];

// อักษรย่อบนวงกลมรูปโปรไฟล์ — ข้ามสระหน้า (เ แ โ ใ ไ) ไม่ให้วงกลมขึ้นแค่ "เ"
const initialOf = (name: string) => {
  const raw = String(name || "").trim();
  return raw.replace(/^[เแโใไ]+/, "").charAt(0) || raw.charAt(0) || "?";
};

export default function ManagerSales() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
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
  // 💰 แท็บ/สถานะ จ่ายแล้ว-ยังไม่จ่าย ("" = ทั้งหมด)
  const [payFilter, setPayFilter] = useState<"" | "paid" | "unpaid">("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payConfirm, setPayConfirm] = useState<{
    item: any;
    paid: boolean;
  } | null>(null);
  const [employeeStats, setEmployeeStats] = useState<any[]>([]);

  // Filter States
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
  // แผ่นตัวกรอง (bottom sheet): เลือกค่าแบบร่างก่อน กด "ดู N รายงาน" ค่อยใช้จริง
  const [showFilter, setShowFilter] = useState(false);
  const [fStart, setFStart] = useState<Date | null>(null);
  const [fEnd, setFEnd] = useState<Date | null>(null);
  const [fReporter, setFReporter] = useState("");
  const [fStatus, setFStatus] = useState("");
  // รายงานของช่วงวันที่ในแบบร่าง (null = กำลังโหลด) ไว้นับจำนวนข้างตัวเลือก
  const [sheetList, setSheetList] = useState<any[] | null>(null);
  const sheetReq = useRef(0);

  // Modals
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  // ตัวกรองหลักฐานในป๊อปอัปรายละเอียด: รอบที่เลือก + ประเภทเอกสารของแต่ละกล่องรอบ
  const [evRound, setEvRound] = useState<string>("all");
  const [evTypeOf, setEvTypeOf] = useState<Record<string, string>>({});
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [empModalVisible, setEmpModalVisible] = useState(false); // ➕ State สำหรับ Popup พนักงาน
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);

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
        fetchYearSales(targetReporter);
      }
    } catch (error) {
      console.log("Fetch Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ---------- แผ่นตัวกรอง ----------
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // โหลดรายงานของช่วงวันที่ในแบบร่าง (ยิงซ้อนกันได้ — ผลของรอบล่าสุดชนะ)
  const loadSheetList = async (s: Date | null, e: Date | null) => {
    const id = ++sheetReq.current;
    setSheetList(null);
    try {
      let url = `${API_BASE}/api_mobile.php?action=get_dashboard_stats&tab=sales`;
      if (s) url += `&start_date=${ymd(s)}`;
      if (e) url += `&end_date=${ymd(e)}`;
      const res = await axios.get(url);
      if (id === sheetReq.current) setSheetList(res.data?.recent || []);
    } catch (err) {
      if (id === sheetReq.current) setSheetList([]);
    }
  };

  const openFilterSheet = () => {
    setFStart(startDate);
    setFEnd(endDate);
    setFReporter(filterReporter);
    setFStatus(filterStatus);
    setShowDatePicker(false);
    setShowFilter(true);
    loadSheetList(startDate, endDate);
  };

  const setDraftRange = (s: Date | null, e: Date | null) => {
    setFStart(s);
    setFEnd(e);
    loadSheetList(s, e);
  };

  // ล้างแบบร่าง (ยังไม่ใช้จริงจนกว่าจะกด "ดู N รายงาน")
  const clearDraft = () => {
    const now = new Date();
    setFReporter("");
    setFStatus("");
    setDraftRange(
      new Date(now.getFullYear(), now.getMonth(), 1),
      new Date(now.getFullYear(), now.getMonth() + 1, 0),
    );
  };

  const applyDraft = () => {
    setStartDate(fStart);
    setEndDate(fEnd);
    setFilterReporter(fReporter);
    setFilterStatus(fStatus);
    setShowFilter(false);
    fetchData(fReporter, fStatus, fStart, fEnd);
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

  // 🖼️ รูปย่อหลักฐาน 1 ชิ้น: กรอบสีตามหมวด + ป้ายประเภท + รอบ (showLabel=false = รูปอย่างเดียว ใช้ในกรอบรายการอื่นๆ)
  const renderEvThumb = (d: EvDoc, color: string, key: string, showLabel = true) => {
    const isImg = /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(d.file);
    return (
      <TouchableOpacity
        key={key}
        activeOpacity={0.8}
        onPress={() => openImage(encodeURIComponent(d.file))}
        style={styles.evrThumbWrap}
      >
        <View style={[styles.evrThumb, { borderColor: color }]}>
          {isImg ? (
            <Image
              source={{ uri: `${IMG_BASE_URL}/${encodeURIComponent(d.file)}` }}
              style={styles.evThumbImg}
            />
          ) : (
            <View style={styles.evThumbPdf}>
              <FontAwesome5 name="file-alt" size={24} color="#dc2626" />
              <Text style={styles.evrExt}>{(d.file.split(".").pop() || "").toUpperCase()}</Text>
            </View>
          )}
        </View>
        {showLabel && (
          <>
            <Text style={[styles.evrThumbType, { color }]} numberOfLines={1}>
              {d.type}
            </Text>
            <Text style={styles.evrThumbRound}>รอบ {d.round}</Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  // 🗂️ หลักฐานของ 1 กล่อง (ทั้งรายงาน หรือ 1 รอบ): แถวกรองประเภท + แยกตามหมวด น้ำมัน / ที่พัก / อื่นๆ
  //   amountOf(cat) = ยอดของหมวดในกล่องนี้ · otherItems = ค่าใช้จ่ายอื่นๆ ทีละรายการ (แยกกรอบตามรายการ)
  const renderEvView = (
    boxKey: string,
    docs: EvDoc[],
    amountOf: (cat: EvCat) => number,
    otherItems: EvAmount[],
    otherLabel: string,
  ) => {
    const types = [
      ...EV_TYPE_ORDER.filter((t) => docs.some((d) => d.type === t)),
      ...[...new Set(docs.map((d) => d.type))].filter((t) => !EV_TYPE_ORDER.includes(t)),
    ];
    const want = evTypeOf[boxKey] || "all";
    const match = (d: EvDoc) => want === "all" || d.type === want;
    const chips = [
      { key: "all", label: "ทุกประเภท", n: docs.length },
      ...types.map((t) => ({ key: t, label: t, n: docs.filter((d) => d.type === t).length })),
    ];
    const blocks = EV_CATS.filter(
      (c) => docs.some((d) => d.cat === c.key) || amountOf(c.key) > 0,
    ).filter(
      // กำลังกรองประเภท → ซ่อนหมวดที่ไม่มีรูปตรงเงื่อนไข
      (c) => want === "all" || docs.some((d) => d.cat === c.key && match(d)),
    );

    return (
      <View>
        {docs.length > 0 && (
          <View style={styles.evrSegWrap}>
            {renderSeg(
              chips,
              want,
              (k) => setEvTypeOf((p) => ({ ...p, [boxKey]: k })),
              true,
              true,
            )}
          </View>
        )}
        {blocks.map((c) => {
          const amt = amountOf(c.key);
          const cDocs = docs.filter((d) => d.cat === c.key);
          let body: React.ReactNode;
          if (c.key === "other" && otherItems.length > 0) {
            // อื่นๆ: กรอบละรายการ (รายละเอียด + ยอด + สลิปของรายการนั้น)
            const used = new Set<EvDoc>();
            const frames = otherItems.map((it) => {
              const fDocs = cDocs.filter((d) => d.entry === it.idx);
              fDocs.forEach((d) => used.add(d));
              return { title: it.detail || "ไม่ระบุรายละเอียด", amount: it.amount, docs: fDocs };
            });
            const rest = cDocs.filter((d) => !used.has(d));
            if (rest.length) frames.push({ title: "สลิปที่ยังไม่ระบุรายการ", amount: 0, docs: rest });
            body = frames.map((f, i) => {
              const shown = f.docs.filter(match);
              if (want !== "all" && shown.length === 0) return null;
              return (
                <View key={i} style={styles.evrOtherFrame}>
                  <View style={styles.evrCatHead}>
                    <Text style={[styles.evrOtherTitle, { color: c.color }]}>{f.title}</Text>
                    {f.amount > 0 && (
                      <Text style={styles.evrOtherAmt}>฿{f.amount.toLocaleString()}</Text>
                    )}
                  </View>
                  {shown.length > 0 ? (
                    <View style={styles.evrGrid}>
                      {shown.map((d, k) => renderEvThumb(d, c.color, `${d.file}-${k}`, false))}
                    </View>
                  ) : (
                    <Text style={styles.cardMetaSm}>ไม่มีสลิป</Text>
                  )}
                </View>
              );
            });
          } else {
            const shown = cDocs.filter(match);
            body =
              shown.length > 0 ? (
                <View style={styles.evrGrid}>
                  {shown.map((d, k) => renderEvThumb(d, c.color, `${d.file}-${k}`))}
                </View>
              ) : null;
          }
          return (
            <View key={c.key} style={styles.evrCat}>
              <View style={styles.evrCatHead}>
                <View style={styles.evrCatTitleRow}>
                  <FontAwesome5 name={c.icon} size={16} color={c.color} solid />
                  <Text style={styles.evrCatTitle}>
                    {c.key === "other" && otherItems.length === 0 ? otherLabel : c.label}
                  </Text>
                </View>
                {amt > 0 && <Text style={styles.evrCatAmt}>฿{amt.toLocaleString()}</Text>}
              </View>
              {body}
            </View>
          );
        })}
        {docs.length === 0 && blocks.length === 0 && (
          <Text style={styles.cardMetaSm}>ไม่มีหลักฐานแนบ</Text>
        )}
      </View>
    );
  };

  // 🔁 หลักฐานทั้งรายงาน: หลายรอบ → แถวกรอง ทั้งหมด / รอบ 1 / รอบ 2 … + กล่องละรอบ · รอบเดียว → แสดงรวม
  const renderEvidenceByRound = (item: any) => {
    const docs = buildEvidence(item);
    const { roundAt, amounts } = parseRounds(item);
    const rounds = [
      ...new Set([
        ...docs.map((d) => d.round),
        ...amounts.map((a) => a.round),
        ...Object.keys(roundAt).map(Number),
      ]),
    ]
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    const otherAll = amounts.filter((a) => a.cat === "other");
    const otherLabel = `อื่นๆ (${item.other_cost_detail || "-"})`;

    if (rounds.length <= 1) {
      // รอบเดียว: ยอดของแต่ละหมวดจากคอลัมน์หลักของรายงาน
      const totals: Record<EvCat, number> = {
        fuel: sumCsv(item.fuel_cost),
        hotel: sumCsv(item.accommodation_cost),
        other: sumCsv(item.other_cost),
      };
      return renderEvView("all", docs, (c) => totals[c], otherAll, otherLabel);
    }

    // จำนวนข้างปุ่มรอบ = จำนวนไฟล์หลักฐานของรอบนั้น
    const roundChips = [
      { key: "all", label: "ทั้งหมด", n: docs.length },
      ...rounds.map((r) => ({
        key: String(r),
        label: `รอบ ${r}`,
        n: docs.filter((d) => d.round === r).length,
      })),
    ];
    return (
      <View>
        <View style={styles.evrSegWrap}>
          {renderSeg(roundChips, evRound, setEvRound, roundChips.length > 4, true)}
        </View>
        {rounds
          .filter((r) => evRound === "all" || String(r) === evRound)
          .map((r) => {
            const rDocs = docs.filter((d) => d.round === r);
            const sumOf = (c: EvCat) =>
              amounts
                .filter((a) => a.cat === c && a.round === r)
                .reduce((s, a) => s + a.amount, 0);
            // รายการอื่นๆ ของรอบนี้ = บันทึกในรอบนี้ หรือมีสลิปของรอบนี้ผูกอยู่
            const rOther = otherAll.filter(
              (a) =>
                a.round === r || rDocs.some((d) => d.cat === "other" && d.entry === a.idx),
            );
            const hasAmount = EV_CATS.some((c) => sumOf(c.key) > 0);
            return (
              <View key={r} style={styles.evrBox}>
                <View style={styles.evrBoxHead}>
                  <View style={styles.evrCatTitleRow}>
                    <FontAwesome5 name="layer-group" size={15} color="#1d4ed8" />
                    <Text style={styles.evrBoxTitle}>รอบ {r}</Text>
                  </View>
                  <Text style={styles.evrBoxAt}>{roundAt[String(r)] || ""}</Text>
                </View>
                {rDocs.length > 0 || hasAmount ? (
                  renderEvView(`r${r}`, rDocs, sumOf, rOther, otherLabel)
                ) : (
                  <Text style={styles.cardMetaSm}>
                    รอบนี้แก้ไขข้อมูลอื่น (ไม่มียอดหรือเอกสารใหม่)
                  </Text>
                )}
              </View>
            );
          })}
      </View>
    );
  };

  const openCustomDatePicker = (mode: "start" | "end") => {
    setDateMode(mode);
    setPickerDate((mode === "start" ? fStart : fEnd) || new Date());
    setPickerView("day");
    setShowDatePicker(true);
  };

  // ปฏิทินเปิดจากแผ่นตัวกรองเท่านั้น → เลือกวันแล้วแก้แบบร่าง
  const handleDateSelect = (day: number) => {
    const d = new Date(pickerDate.getFullYear(), pickerDate.getMonth(), day);
    if (dateMode === "start") setDraftRange(d, fEnd);
    else setDraftRange(fStart, d);
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
            {i}
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
      const currentCheck = dateMode === "start" ? fStart : fEnd;
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

  // ================= การ์ดพนักงาน 1 คน/ทีม ใน popup สถิติทีมเซลส์ =================
  // แตะการ์ด = กรองหน้าหลักเป็นคนนี้, แตะชิปสถานะ = กรองคนนี้ + สถานะนั้น
  const renderEmployeeCard = (item: any, rank: number) => {
    const isBidding = item.teamType === "bidding";
    const themeColor = isBidding ? "#7c3aed" : PRIMARY_COLOR;
    const yearActual = yearSalesByName[item.name] || 0;
    const hasSales = item.totalProjectValue > 0;
    // เหรียญอันดับ 1-3 ให้เฉพาะคนที่มียอดจริง (ยอด 0 ทั้งหมดไม่ควรมีใครได้ที่ 1)
    const medal = hasSales && rank <= 3 ? RANK_COLORS[rank - 1] : null;
    const statuses = Object.keys(item.statusCounts).sort(
      (a, b) => item.statusCounts[b] - item.statusCounts[a],
    );
    const statusTotal = statuses.reduce(
      (sum, st) => sum + item.statusCounts[st],
      0,
    );
    // จับคู่ทีละ 2 ช่อง — แถวสุดท้ายที่เหลือช่องเดียวเติมช่องว่าง ให้ทุกช่องกว้างเท่ากัน
    const statusPairs: (string | null)[][] = [];
    for (let i = 0; i < statuses.length; i += 2)
      statusPairs.push([statuses[i], statuses[i + 1] ?? null]);
    const pick = (status: string) => {
      setFilterReporter(item.name);
      setFilterStatus(status);
      fetchData(item.name, status);
      setEmpModalVisible(false);
    };

    return (
      <TouchableOpacity
        key={item.name}
        activeOpacity={0.85}
        style={styles.empCard}
        onPress={() => pick("")}
      >
        {/* ใคร + ยอดขายที่ปิดได้ */}
        <View style={styles.empHeader}>
          <View style={[styles.avatar, { backgroundColor: themeColor }]}>
            {isBidding ? (
              <Ionicons name="people" size={18} color="#fff" />
            ) : (
              <Text style={styles.avatarText}>{initialOf(item.name)}</Text>
            )}
            <View
              style={[styles.rankBadge, medal ? { backgroundColor: medal } : null]}
            >
              <Text style={[styles.rankText, medal ? { color: "#fff" } : null]}>
                {rank}
              </Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.empName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.empMeta} numberOfLines={1}>
              {item.totalReports} รายงาน
              {item.totalExpense > 0
                ? "  ·  เบิก ฿" + item.totalExpense.toLocaleString()
                : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", maxWidth: "38%" }}>
            <Text style={styles.empSalesLabel}>ยอดที่ปิดได้</Text>
            <Text
              style={[styles.empSales, { color: hasSales ? themeColor : T.textMute }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              ฿{fmtMoneyShort(item.totalProjectValue)}
            </Text>
          </View>
        </View>

        {/* แถบเป้าชุดเดียวกับหน้าหลัก: ยอดเดือนเทียบเป้าเดือน, ยอดสะสมทั้งปีเทียบเป้าปี */}
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

        {statuses.length > 0 && (
          <View style={styles.empStatusBox}>
            <View style={styles.empStatusHead}>
              <Text style={styles.empStatusTitle}>สถานะงาน</Text>
              <Text style={styles.empStatusTotal}>รวม {statusTotal} งาน</Text>
            </View>

            {/* สัดส่วนทุกสถานะในแถบเดียว */}
            <View style={styles.empStatusBar}>
              {statuses.map((st) => (
                <View
                  key={st}
                  style={{
                    flex: item.statusCounts[st],
                    backgroundColor: getStatusColor(st),
                  }}
                />
              ))}
            </View>

            {/* ตาราง 2 คอลัมน์ ช่องกว้าง/สูงเท่ากันทั้งแถว — ชื่อยาวขึ้นได้ 3 บรรทัดแทนการตัดคำ */}
            <View style={styles.empStatusGrid}>
              {statusPairs.map((pair, r) => (
                <View key={r} style={styles.empStatusRow}>
                  {pair.map((st, c) => {
                    if (!st) return <View key={"blank-" + c} style={{ flex: 1 }} />;
                    const color = getStatusColor(st);
                    const n = item.statusCounts[st];
                    return (
                      <TouchableOpacity
                        key={st}
                        activeOpacity={0.75}
                        style={[styles.empStatusTile, { backgroundColor: color + "0F" }]}
                        onPress={() => pick(st)}
                      >
                        <View
                          style={[styles.empStatusAccent, { backgroundColor: color }]}
                        />
                        <Text style={styles.empStatusName} numberOfLines={3}>
                          {st}
                        </Text>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[styles.empStatusCount, { color }]}>
                            {n}
                          </Text>
                          <Text style={styles.empStatusPct}>
                            {Math.round((n / statusTotal) * 100)}%
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.empFooter}>
          <Text style={[styles.empFooterText, { color: themeColor }]}>
            {isBidding ? "ดูรายงานของทีมนี้" : "ดูรายงานของคนนี้"}
          </Text>
          <Ionicons name="chevron-forward" size={13} color={themeColor} />
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
        {/* ตัวเลขเป้าหลักสิบ-ร้อยล้าน บรรทัดเดียวไม่พอ — แยก 2 บรรทัด + ย่อเป็น "ล้าน" */}
        <Text style={styles.goalFoot} numberOfLines={1}>
          {target > 0 ? "เป้า ฿" + fmtMoneyShort(target) : "ยังไม่ได้ตั้งเป้า"}
        </Text>
        {target > 0 && (
          <Text
            style={[styles.goalFootSub, done && { color: SUCCESS_COLOR }]}
            numberOfLines={1}
          >
            {(done ? "เกินเป้า ฿" : "ขาดอีก ฿") +
              fmtMoneyShort(Math.abs(actual - target))}
          </Text>
        )}
      </View>
    );
  };

  // ================= ตัวเลขรวม 1 ช่องในการ์ดสรุป =================
  const renderStat = (
    icon: string,
    label: string,
    value: string,
    color: string,
    tintValue = false,
  ) => (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: color + "14" }]}>
        <Ionicons name={icon as any} size={15} color={color} />
      </View>
      <Text
        style={[styles.statValue, tintValue && { color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  // ================= หัวข้อ section: ไอคอน + ชื่อ + ข้อความ/ป้ายด้านขวา =================
  const renderSectionHeader = (
    icon: string,
    title: string,
    right?: React.ReactNode,
  ) => (
    <View style={styles.secHead}>
      <View style={styles.secIcon}>
        <Ionicons name={icon as any} size={14} color={PRIMARY_COLOR} />
      </View>
      <Text style={styles.secTitle}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );

  // ================= ช่วงเวลาลัดในแผ่นตัวกรอง =================
  const RANGE_PRESETS = [
    {
      label: "เดือนนี้",
      s: new Date(today.getFullYear(), today.getMonth(), 1),
      e: new Date(today.getFullYear(), today.getMonth() + 1, 0),
    },
    {
      label: "เดือนที่แล้ว",
      s: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      e: new Date(today.getFullYear(), today.getMonth(), 0),
    },
    {
      label: "ปีนี้",
      s: new Date(today.getFullYear(), 0, 1),
      e: new Date(today.getFullYear(), 11, 31),
    },
  ];
  const sameDay = (a: Date | null, b: Date) =>
    !!a &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  // ================= แผ่นตัวกรอง (bottom sheet) =================
  // กลุ่มปุ่มแบบ segmented: ปุ่มละ label + จำนวน (wrap = ขึ้นบรรทัดใหม่ได้เมื่อมีหลายตัวเลือก)
  const renderSeg = (
    opts: { key: string; label: string; n?: number | null; dot?: string }[],
    value: string,
    onPick: (k: string) => void,
    wrap = false,
    compact = false, // ขนาดเล็กสำหรับใช้ในกล่องรายละเอียด
  ) => (
    <View style={[styles.fsSeg, wrap && styles.fsSegWrap, compact && styles.fsSegCompact]}>
      {opts.map((o) => {
        const on = o.key === value;
        return (
          <TouchableOpacity
            key={o.key || "_all"}
            activeOpacity={0.8}
            style={[
              styles.fsSegItem,
              wrap ? { flexGrow: 1 } : { flex: 1 },
              compact && styles.fsSegItemCompact,
              on && styles.fsSegItemOn,
            ]}
            onPress={() => onPick(o.key)}
          >
            {o.dot && !on && (
              <View style={[styles.pillDot, { backgroundColor: o.dot }]} />
            )}
            <Text
              style={[
                styles.fsSegText,
                compact && { fontSize: FS.sm + 1 },
                on && styles.fsSegTextOn,
              ]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
            {o.n !== undefined && (
              <Text
                style={[
                  styles.fsSegNum,
                  compact && { fontSize: FS.xs },
                  on && styles.fsSegNumOn,
                ]}
              >
                {o.n === null ? "–" : compact ? `(${o.n})` : o.n}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ปฏิทินเลือกวัน (แสดงซ้อนในแผ่นตัวกรอง)
  const renderDatePickerCard = () => (
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
              {pickerDate.getFullYear()}
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
  );

  const renderFilterSheet = () => {
    const loadingCounts = sheetList === null;
    const sl = sheetList || [];
    const hasStatus = (i: any, s: string) => cleanSplit(i.job_status).includes(s);
    const draftPreset = RANGE_PRESETS.find(
      (p) => sameDay(fStart, p.s) && sameDay(fEnd, p.e),
    )?.label;
    const draftCount =
      (fReporter ? 1 : 0) +
      (fStatus ? 1 : 0) +
      (draftPreset === "เดือนนี้" ? 0 : 1);

    // จำนวนข้างสถานะ = รายงานของพนักงานที่เลือก ที่มีสถานะนั้นอย่างน้อย 1 งาน
    const byReporter = fReporter
      ? sl.filter((i) => displayNameOf(i) === fReporter)
      : sl;
    const statusCount: Record<string, number> = {};
    byReporter.forEach((i) =>
      new Set(cleanSplit(i.job_status)).forEach((s) => {
        if (s && s !== "-") statusCount[s] = (statusCount[s] || 0) + 1;
      }),
    );
    if (fStatus && !(fStatus in statusCount)) statusCount[fStatus] = 0;
    const statusOpts = Object.entries(statusCount).sort((a, b) => b[1] - a[1]);

    // จำนวนข้างพนักงาน = รายงานของคนนั้นตามสถานะที่เลือก
    const byStatus = fStatus ? sl.filter((i) => hasStatus(i, fStatus)) : sl;
    const nameCount: Record<string, number> = {};
    byStatus.forEach((i) => {
      const n = displayNameOf(i);
      nameCount[n] = (nameCount[n] || 0) + 1;
    });
    if (fReporter && !(fReporter in nameCount)) nameCount[fReporter] = 0;
    const nameOpts = Object.entries(nameCount).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"),
    );

    const resultCount = byReporter.filter(
      (i) => !fStatus || hasStatus(i, fStatus),
    ).length;
    const num = (n: number) => (loadingCounts ? null : n);

    return (
      <Modal
        visible={showFilter}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() =>
          showDatePicker ? setShowDatePicker(false) : setShowFilter(false)
        }
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setShowFilter(false)}
          />
          <View style={[styles.fsSheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.fsHandle} />
            <View style={styles.fsHead}>
              <Text style={styles.fsTitle}>ตัวกรอง</Text>
              {draftCount > 0 && (
                <Text style={styles.fsHeadCount}>เลือกอยู่ {draftCount}</Text>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={styles.fsClose}
                onPress={() => setShowFilter(false)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="close" size={18} color={T.textSub} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={styles.fsBody}
              showsVerticalScrollIndicator={false}
            >
              {/* ช่วงเวลา */}
              <Text style={styles.fsLabel}>ช่วงเวลา</Text>
              {renderSeg(
                RANGE_PRESETS.map((p) => ({ key: p.label, label: p.label })),
                draftPreset || "",
                (k) => {
                  const p = RANGE_PRESETS.find((x) => x.label === k)!;
                  setDraftRange(p.s, p.e);
                },
              )}
              <View style={styles.fsDateRow}>
                {(["start", "end"] as const).map((m) => {
                  const d = m === "start" ? fStart : fEnd;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={styles.fsDateField}
                      activeOpacity={0.8}
                      onPress={() => openCustomDatePicker(m)}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={15}
                        color={PRIMARY_COLOR}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fsDateCap}>
                          {m === "start" ? "ตั้งแต่" : "ถึง"}
                        </Text>
                        <Text
                          style={[styles.fieldText, !d && styles.fieldPlaceholder]}
                          numberOfLines={1}
                        >
                          {d ? fmtShort(d) : "ทั้งหมด"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* สถานะงาน */}
              <Text style={styles.fsLabel}>สถานะงาน</Text>
              {renderSeg(
                [
                  { key: "", label: "ทั้งหมด", n: num(byReporter.length) },
                  ...statusOpts.map(([s, n]) => ({
                    key: s,
                    label: s,
                    n: num(n),
                    dot: getStatusColor(s),
                  })),
                ],
                fStatus,
                (k) => setFStatus(k),
                true,
              )}

              {/* พนักงาน / ทีม */}
              <View style={styles.fsLabelRow}>
                <Text style={[styles.fsLabel, { marginBottom: 0 }]}>
                  พนักงาน / ทีม
                </Text>
                <Text style={styles.fsLabelSub}>แตะอีกครั้งเพื่อยกเลิก</Text>
              </View>
              <View style={styles.fsList}>
                {loadingCounts ? (
                  <ActivityIndicator
                    color={PRIMARY_COLOR}
                    style={{ paddingVertical: 18 }}
                  />
                ) : nameOpts.length === 0 ? (
                  <Text style={styles.fsEmpty}>ไม่มีรายงานในช่วงนี้</Text>
                ) : (
                  nameOpts.map(([name, n], idx) => {
                    const on = fReporter === name;
                    return (
                      <TouchableOpacity
                        key={name}
                        activeOpacity={0.7}
                        style={[styles.fsListRow, idx > 0 && styles.fsListLine]}
                        onPress={() => setFReporter(on ? "" : name)}
                      >
                        <Text
                          style={[styles.fsListName, on && { color: PRIMARY_COLOR }]}
                          numberOfLines={1}
                        >
                          {name}
                        </Text>
                        <Text style={styles.fsListNum}>{n}</Text>
                        <View style={[styles.fsCheck, on && styles.fsCheckOn]}>
                          {on && <Ionicons name="checkmark" size={15} color="#fff" />}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </ScrollView>

            <View style={styles.fsFooter}>
              <TouchableOpacity
                style={styles.fsClearBtn}
                activeOpacity={0.8}
                onPress={clearDraft}
              >
                <Text style={styles.fsClearText}>ล้างทั้งหมด</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.fsApplyBtn}
                activeOpacity={0.85}
                onPress={applyDraft}
              >
                <Text style={styles.fsApplyText}>
                  {loadingCounts ? "ดูรายงาน" : `ดู ${resultCount} รายงาน`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ปฏิทินซ้อนอยู่ใน Modal นี้เลย (iOS เปิด Modal ซ้อน Modal ไม่ได้) */}
          {showDatePicker && (
            <View style={styles.fsPickerOverlay}>{renderDatePickerCard()}</View>
          )}
        </View>
      </Modal>
    );
  };

  // ================= 💰 จ่ายแล้ว / ยังไม่จ่าย =================
  // ติ๊กเองครั้งเดียวต่อ 1 รายงาน · ตารางเดียวกับหน้าเว็บ Dashboard.php (report_customer_payments)
  // กล่องยืนยัน จ่ายแล้ว / ยังไม่จ่าย (ใช้ทั้งใน Modal ของตัวเอง และซ้อนในป๊อปอัปรายละเอียด)
  const renderPayConfirm = () => {
    if (!payConfirm) return null;
    const { item, paid } = payConfirm;
    const color = paid ? SUCCESS_COLOR : DANGER_COLOR;
    return (
      <TouchableOpacity
        activeOpacity={1}
        style={styles.payConfirmOverlay}
        onPress={() => setPayConfirm(null)}
      >
        <TouchableOpacity activeOpacity={1} style={styles.payConfirmBox}>
          <View style={[styles.payConfirmIcon, { backgroundColor: color + "1a" }]}>
            <Ionicons
              name={paid ? "checkmark-circle" : "close-circle"}
              size={34}
              color={color}
            />
          </View>
          <Text style={styles.payConfirmTitle}>
            {paid ? "ยืนยันการจ่ายเงิน" : "ยืนยันสถานะยังไม่จ่าย"}
          </Text>
          <Text style={styles.payConfirmMsg}>
            เปลี่ยนสถานะรายงานของ{" "}
            <Text style={{ fontWeight: "700", color: T.text }}>
              {displayNameOf(item)}
            </Text>{" "}
            ({formatShortThaiDate(item.report_date)}) เป็น{" "}
            <Text style={{ fontWeight: "800", color }}>
              "{paid ? "จ่ายแล้ว" : "ยังไม่จ่าย"}"
            </Text>{" "}
            ใช่หรือไม่?
          </Text>
          <View style={styles.payConfirmBtns}>
            <TouchableOpacity
              style={[styles.payConfirmBtn, styles.payConfirmCancel]}
              onPress={() => setPayConfirm(null)}
            >
              <Text style={styles.payConfirmCancelText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.payConfirmBtn, { backgroundColor: color }]}
              onPress={() => {
                setPayConfirm(null);
                saveReportPaid(item, paid);
              }}
            >
              <Ionicons name={paid ? "checkmark" : "close"} size={16} color="#fff" />
              <Text style={styles.payConfirmOkText}>
                {paid ? "ยืนยันจ่ายแล้ว" : "ยืนยันยังไม่จ่าย"}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // ถามยืนยันก่อนทุกครั้ง กันกดพลาด (ป๊อปอัปเอง เพราะ Alert ของ Android ใส่สีปุ่มไม่ได้)
  const setReportPaid = (item: any, paid: boolean) => {
    if (payingId || isPaid(item) === paid) return;
    setPayConfirm({ item, paid });
  };

  const saveReportPaid = async (item: any, paid: boolean) => {
    if (payingId) return;
    const id = String(item.id);
    const patch =
      (p: boolean, by?: string, at?: string) =>
      (it: any) =>
        String(it.id) === id
          ? {
              ...it,
              is_paid: p ? 1 : 0,
              ...(by !== undefined ? { paid_by: by, paid_at: at } : {}),
            }
          : it;
    const apply = (fn: (it: any) => any) => {
      setRecentList((list) => list.map(fn));
      setSelectedItem((s: any) => (s ? fn(s) : s));
    };

    apply(patch(paid)); // เปลี่ยนบนจอทันที ถ้าบันทึกไม่สำเร็จค่อยย้อนกลับ
    setPayingId(id);
    try {
      const fd = new FormData();
      fd.append("report_id", id);
      fd.append("user_id", String(user?.id ?? ""));
      fd.append("is_paid", paid ? "1" : "0");
      const res = await axios.post(
        `${API_BASE}/api_mobile.php?action=toggle_report_paid`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      if (res.data?.status !== "success")
        throw new Error(res.data?.message || "บันทึกไม่สำเร็จ");
      apply(patch(paid, res.data.paid_by, res.data.paid_at));
    } catch (e: any) {
      apply(patch(!paid));
      Alert.alert("บันทึกไม่สำเร็จ", e?.message || "กรุณาลองใหม่อีกครั้ง");
    } finally {
      setPayingId(null);
    }
  };

  const fmtPaidAt = (at?: string) => {
    if (!at) return "";
    const [d, t] = String(at).split(" ");
    return `${formatShortThaiDate(d)}${t ? " " + t.slice(0, 5) : ""}`;
  };

  const renderPayToggle = (item: any) => {
    const paid = isPaid(item);
    const saving = payingId === String(item.id);
    return (
      <View style={styles.payRow}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.payLabel}>การจ่ายเงิน</Text>
          {!!item.paid_by && (
            <Text style={styles.payMeta} numberOfLines={1}>
              แก้ล่าสุด {item.paid_by}
              {item.paid_at ? " · " + fmtPaidAt(item.paid_at) : ""}
            </Text>
          )}
        </View>
        {[true, false].map((p) => {
          const on = paid === p;
          const color = p ? SUCCESS_COLOR : DANGER_COLOR;
          return (
            <TouchableOpacity
              key={p ? "paid" : "unpaid"}
              disabled={saving}
              onPress={() => setReportPaid(item, p)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              style={[
                styles.payBtn,
                { borderColor: on ? color : T.line },
                on && { backgroundColor: color },
                saving && { opacity: 0.5 },
              ]}
            >
              <Ionicons
                name={p ? "checkmark" : "close"}
                size={14}
                color={on ? "#fff" : color}
              />
              <Text style={[styles.payBtnText, { color: on ? "#fff" : color }]}>
                {p ? "จ่ายแล้ว" : "ยังไม่จ่าย"}
              </Text>
            </TouchableOpacity>
          );
        })}
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
    const isBidding = item.team_type === "bidding";
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
            setEvRound("all");
            setEvTypeOf({});
            setDetailModalVisible(true);
          }}
        >
          {/* ใคร - เมื่อไหร่ - เบิกเท่าไหร่ */}
          <View style={styles.cardHeader}>
            <View
              style={[
                styles.cardAvatar,
                { backgroundColor: (isBidding ? "#7c3aed" : PRIMARY_COLOR) + "16" },
              ]}
            >
              {isBidding ? (
                <Ionicons name="people" size={15} color="#7c3aed" />
              ) : (
                <Text style={[styles.cardAvatarText, { color: PRIMARY_COLOR }]}>
                  {initialOf(displayNameOf(item))}
                </Text>
              )}
            </View>
            <View style={{ flex: 1, paddingRight: 4 }}>
              <Text style={styles.cardName} numberOfLines={1}>
                {displayNameOf(item)}
              </Text>
              <View style={styles.cardMetaRow}>
                <Text style={styles.cardMeta}>
                  {formatShortThaiDate(item.report_date)}
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

          {/* 💰 จ่ายแล้ว / ยังไม่จ่าย */}
          {renderPayToggle(item)}

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
  const jobRows = React.useMemo(() => {
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

  // แท็บ ทั้งหมด / ยังไม่จ่าย / จ่ายแล้ว (นับเป็นจำนวนรายงาน เหมือนหน้าเว็บ)
  const payCounts = React.useMemo(() => {
    const paid = jobRows.filter((r) => isPaid(r.item)).length;
    return { all: jobRows.length, paid, unpaid: jobRows.length - paid };
  }, [jobRows]);

  const visibleList = React.useMemo(
    () =>
      payFilter
        ? jobRows.filter((r) => isPaid(r.item) === (payFilter === "paid"))
        : jobRows,
    [jobRows, payFilter],
  );

  const fmtShort = (d: Date | null) =>
    d
      ? formatShortThaiDate(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        )
      : "";
  const rangeLabel =
    startDate && endDate
      ? fmtShort(startDate) + " – " + fmtShort(endDate)
      : "ทุกช่วงเวลา";
  const activeFilterCount = (filterReporter ? 1 : 0) + (filterStatus ? 1 : 0);
  // popup สถิติทีมเซลส์: แยกกลุ่มแบบหน้าเว็บ (ทีมประมูลก่อน) แต่ละกลุ่มเรียงตามยอดขาย
  const bySales = (a: any, b: any) =>
    b.totalProjectValue - a.totalProjectValue || b.totalReports - a.totalReports;
  const empGroups = [
    {
      key: "bidding",
      title: "ทีมประมูล",
      icon: "people",
      color: "#7c3aed",
      list: employeeStats.filter((e) => e.teamType === "bidding").sort(bySales),
    },
    {
      key: "marketing",
      title: "ทีมการตลาด (รายบุคคล)",
      icon: "person",
      color: PRIMARY_COLOR,
      list: employeeStats.filter((e) => e.teamType !== "bidding").sort(bySales),
    },
  ].filter((g) => g.list.length > 0);
  const empWithTarget = employeeStats.filter((e) => e.targetAmount > 0);
  const empHitTarget = empWithTarget.filter(
    (e) => e.totalProjectValue >= e.targetAmount,
  ).length;

  // สถานะงานเรียงจากมากไปน้อย — แถบยาวเทียบกับสถานะที่มีมากที่สุด
  const statusRows = [...kpiList].sort((a, b) => b.count - a.count);
  const statusMax = Math.max(1, ...statusRows.map((r) => r.count));

  return (
    <View style={styles.container}>
      {/* ===== หัวหน้า: ไล่สีแนวนอน (x อย่างเดียว) ชุดเดียวกับ hero ด้านล่าง
          สีที่ตำแหน่งแนวนอนเดียวกันจึงตรงกันพอดี เลื่อนแล้ว hero ต่อกับหัวเป็นผืนเดียว ===== */}
      <LinearGradient
        colors={THEME_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)/manager_dashboard")}
          style={styles.headerBtn}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>ภาพรวมฝ่ายขาย</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            ยอดขาย · เป้าหมาย · รายงานทีม
          </Text>
        </View>
        <TouchableOpacity
          onPress={openFilterSheet}
          style={styles.headerBtn}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="options-outline" size={20} color="#fff" />
          {activeFilterCount > 0 && (
            <View style={styles.filterDot}>
              <Text style={styles.filterDotText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#fff"
            colors={[PRIMARY_COLOR]}
            onRefresh={() => {
              yearCache.current = null;
              setRefreshing(true);
              fetchData();
            }}
          />
        }
      >
        {/* พื้นที่เหนือขอบบนตอนดึงรีเฟรช (iOS เด้ง) ให้เป็นสีเดียวกับหัว ไม่โผล่พื้นเทา */}
        <LinearGradient
          colors={THEME_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.overscrollFill}
        />

        {/* ===== Hero: ช่วงเวลา/ตัวกรองที่ใช้อยู่ + ยอดขายที่ปิดได้ ===== */}
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={THEME_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.hero}
          >
            {/* ตัวกรองทั้งหมดรวมไว้แถวเดียว: แตะช่วงวันที่เพื่อเปิดแผงกรอง, แตะชิปอื่นเพื่อล้างทีละอัน */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pillScroll}
              contentContainerStyle={styles.pillRow}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.pill}
                onPress={openFilterSheet}
              >
                <Ionicons name="calendar-outline" size={13} color="#fff" />
                <Text style={styles.pillText} numberOfLines={1}>
                  {rangeLabel}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color="rgba(255,255,255,0.8)"
                />
              </TouchableOpacity>
              {filterReporter !== "" && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.pill}
                  onPress={() => {
                    setFilterReporter("");
                    fetchData("", filterStatus);
                  }}
                >
                  <Ionicons name="person" size={12} color="#fff" />
                  <Text style={styles.pillText} numberOfLines={1}>
                    {filterReporter}
                  </Text>
                  <Ionicons
                    name="close-circle"
                    size={14}
                    color="rgba(255,255,255,0.85)"
                  />
                </TouchableOpacity>
              )}
              {filterStatus !== "" && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.pill}
                  onPress={() => {
                    setFilterStatus("");
                    fetchData(undefined, "");
                  }}
                >
                  <View
                    style={[
                      styles.pillDot,
                      { backgroundColor: getStatusColor(filterStatus) },
                    ]}
                  />
                  <Text style={styles.pillText} numberOfLines={1}>
                    {filterStatus}
                  </Text>
                  <Ionicons
                    name="close-circle"
                    size={14}
                    color="rgba(255,255,255,0.85)"
                  />
                </TouchableOpacity>
              )}
              {activeFilterCount > 0 && (
                <TouchableOpacity
                  onPress={resetFilters}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={styles.pillClear}>ล้างทั้งหมด</Text>
                </TouchableOpacity>
              )}
            </ScrollView>


            <View style={styles.heroTop}>
              <Text style={styles.heroLabel}>ยอดขายที่ปิดได้</Text>
              <View style={styles.heroTag}>
                <Ionicons name="checkmark-circle" size={12} color="#6ee7b7" />
                <Text style={styles.heroTagText} numberOfLines={1}>
                  {successKeyword}
                </Text>
              </View>
            </View>
            <Text
              style={styles.heroValue}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              ฿{summary.sales.toLocaleString()}
            </Text>
            <Text style={styles.heroCaption} numberOfLines={1}>
              {filterReporter ? "เฉพาะ " + filterReporter : "รวมทั้งทีม"}
              {filterStatus ? "  ·  สถานะ " + filterStatus : ""}
            </Text>
          </LinearGradient>
        </View>

        {/* ===== การ์ดสรุปลอยทับขอบ hero: เป้าเดือน/ปี + ตัวเลขรวม ===== */}
        <View style={styles.summaryCard}>
          <View style={styles.goalRow}>
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
          <View style={styles.summaryDivider} />
          {/* แยกหน่วย "รายงาน" กับ "งาน" ให้ชัด (1 รายงานมีได้หลายงาน) */}
          <View style={styles.statRow}>
            {renderStat(
              "document-text",
              "รายงาน",
              summary.total.toLocaleString(),
              PRIMARY_COLOR,
            )}
            <View style={styles.statSep} />
            {renderStat(
              "briefcase",
              "งาน",
              summary.jobs.toLocaleString(),
              "#0ea5e9",
            )}
            <View style={styles.statSep} />
            {renderStat(
              "wallet",
              "เบิกจ่าย",
              "฿" + summary.expense.toLocaleString(),
              DANGER_COLOR,
              summary.expense > 0,
            )}
          </View>
        </View>

        {/* ===== สถานะงาน: เรียงจากมากไปน้อย แถบยาวตามสัดส่วนเทียบสถานะที่มากที่สุด ===== */}
        <View style={styles.section}>
          {renderSectionHeader(
            "stats-chart",
            "สถานะงาน",
            kpiList.length > 0 ? (
              <Text style={styles.secHint}>แตะเพื่อกรอง</Text>
            ) : null,
          )}
          <View style={styles.panel}>
            {kpiList.length === 0 ? (
              <Text style={styles.panelEmpty}>ไม่มีข้อมูลสถานะในช่วงนี้</Text>
            ) : (
              statusRows.map((it, idx) => {
                const color = getStatusColor(it.status);
                const isSelected = filterStatus === it.status;
                return (
                  <TouchableOpacity
                    key={it.status}
                    activeOpacity={0.75}
                    onPress={() => {
                      const next = isSelected ? "" : it.status;
                      setFilterStatus(next);
                      fetchData(undefined, next);
                    }}
                    style={[
                      styles.statusRow,
                      isSelected && {
                        backgroundColor: color + "12",
                        borderColor: color + "55",
                      },
                    ]}
                  >
                    <View
                      style={[styles.statusIcon, { backgroundColor: color + "18" }]}
                    >
                      <Ionicons
                        name={getStatusIcon(it.status) as any}
                        size={15}
                        color={color}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.statusRowTop}>
                        <Text
                          style={[
                            styles.statusName,
                            isSelected && { color, fontWeight: "800" },
                          ]}
                          numberOfLines={1}
                        >
                          {it.status}
                        </Text>
                        <Text style={[styles.statusCount, { color }]}>
                          {it.count}
                        </Text>
                      </View>
                      <View style={styles.statusTrack}>
                        <View
                          style={[
                            styles.statusFill,
                            {
                              width: `${(it.count / statusMax) * 100}%`,
                              backgroundColor: color,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>

        {/* ===== ทีมเซลส์ ===== */}
        <View style={styles.section}>
          {renderSectionHeader(
            "people",
            "ทีมเซลส์",
            employeeStats.length > 0 ? (
              <Text style={styles.secHint}>
                {employeeStats.length} คน/ทีม
              </Text>
            ) : null,
          )}
          <TouchableOpacity
            style={[styles.panel, styles.teamRow]}
            activeOpacity={0.85}
            disabled={employeeStats.length === 0}
            onPress={() => setEmpModalVisible(true)}
          >
            <View style={styles.avatarMicroGroup}>
              {employeeStats.slice(0, 4).map((emp, i) => {
                const isBidding = emp.teamType === "bidding";
                return (
                  <View
                    key={i}
                    style={[
                      styles.avatarMicro,
                      {
                        marginLeft: i > 0 ? -10 : 0,
                        backgroundColor: isBidding ? "#7c3aed" : PRIMARY_COLOR,
                      },
                    ]}
                  >
                    {isBidding ? (
                      <Ionicons name="people" size={13} color="#fff" />
                    ) : (
                      <Text style={styles.avatarMicroText}>
                        {initialOf(emp.name)}
                      </Text>
                    )}
                  </View>
                );
              })}
              {employeeStats.length > 4 && (
                <View
                  style={[
                    styles.avatarMicro,
                    styles.avatarMicroMore,
                    { marginLeft: -10 },
                  ]}
                >
                  <Text style={styles.avatarMicroMoreText}>
                    +{employeeStats.length - 4}
                  </Text>
                </View>
              )}
              {employeeStats.length === 0 && (
                <View style={[styles.avatarMicro, styles.avatarMicroMore]}>
                  <Ionicons name="people-outline" size={14} color={T.textMute} />
                </View>
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.teamTitle}>
                {employeeStats.length > 0
                  ? "ดูสถิติรายบุคคล"
                  : "ยังไม่มีข้อมูลรายบุคคล"}
              </Text>
              <Text style={styles.teamSub} numberOfLines={1}>
                เป้า ยอดขาย และสถานะงานของแต่ละคน
              </Text>
            </View>
            {employeeStats.length > 0 && (
              <View style={styles.teamChevron}>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={PRIMARY_COLOR}
                />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ===== รายการล่าสุด ===== */}
        <View style={styles.section}>
          {renderSectionHeader(
            "document-text",
            "รายการล่าสุด",
            !loading && visibleList.length > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {visibleList.length} รายงาน
                </Text>
              </View>
            ) : null,
          )}

          {/* 💰 แท็บ ทั้งหมด / ยังไม่จ่าย / จ่ายแล้ว */}
          <View style={styles.payTabs}>
            {(
              [
                ["", "ทั้งหมด", "list", PRIMARY_COLOR, payCounts.all],
                ["unpaid", "ยังไม่จ่าย", "close-circle", DANGER_COLOR, payCounts.unpaid],
                ["paid", "จ่ายแล้ว", "checkmark-circle", SUCCESS_COLOR, payCounts.paid],
              ] as const
            ).map(([key, label, icon, color, count]) => {
              const active = payFilter === key;
              return (
                <TouchableOpacity
                  key={key || "all"}
                  onPress={() => setPayFilter(key)}
                  style={[
                    styles.payTab,
                    active && { backgroundColor: color, borderColor: color },
                  ]}
                >
                  <Ionicons
                    name={icon}
                    size={14}
                    color={active ? "#fff" : color}
                  />
                  <Text
                    style={[styles.payTabText, active && { color: "#fff" }]}
                  >
                    {label}
                  </Text>
                  <View
                    style={[
                      styles.payTabCount,
                      active && { backgroundColor: "rgba(255,255,255,0.25)" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.payTabCountText,
                        active && { color: "#fff" },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {loading ? (
            <ActivityIndicator
              size="large"
              color={PRIMARY_COLOR}
              style={{ marginTop: 28 }}
            />
          ) : visibleList.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="document-text-outline"
                  size={26}
                  color={PRIMARY_COLOR}
                />
              </View>
              <Text style={styles.emptyText}>
                {payFilter && jobRows.length > 0
                  ? payFilter === "paid"
                    ? "ยังไม่มีรายการที่จ่ายแล้ว"
                    : "ไม่มีรายการที่ยังไม่จ่าย"
                  : activeFilterCount > 0
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

      {renderFilterSheet()}

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
                            {formatShortThaiDate(selectedItem.report_date)}
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
                        {renderEvidenceByRound(selectedItem)}
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

                      {/* 💰 จ่ายแล้ว / ยังไม่จ่าย */}
                      <View style={{ marginTop: 10 }}>
                        {renderPayToggle(selectedItem)}
                      </View>
                    </>
                  );
                })()}
            </ScrollView>
          </View>
        </View>
        {/* ยืนยันการจ่ายเงินซ้อนอยู่ใน Modal นี้เลย (iOS เปิด Modal ที่สองทับไม่ได้) */}
        {!!payConfirm && (
          <View style={styles.payConfirmLayer}>{renderPayConfirm()}</View>
        )}
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
                          {formatShortThaiDate(item.report_date)}
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

      {/* ===== Popup สถิติทีมเซลส์: bottom sheet — สรุปทั้งทีมด้านบน, การ์ดรายคนแยกกลุ่มด้านล่าง =====
          Android edge-to-edge: Modal ไม่ได้ inset เอง จึงใช้ insets ของหน้าหลักเว้นขอบล่างให้ */}
      <Modal
        visible={empModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setEmpModalVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setEmpModalVisible(false)}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
            <LinearGradient
              colors={THEME_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sheetHeader}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetTitleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>สถิติทีมเซลส์</Text>
                  <Text style={styles.sheetSub} numberOfLines={1}>
                    {rangeLabel}
                    {filterStatus ? "  ·  สถานะ " + filterStatus : ""}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.headerBtn}
                  onPress={() => setEmpModalVisible(false)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* สรุปรวมทั้งทีมในช่วงที่เลือก */}
              <View style={styles.sheetStats}>
                <View style={styles.sheetStat}>
                  <Text
                    style={styles.sheetStatValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    ฿{fmtMoneyShort(summary.sales)}
                  </Text>
                  <Text style={styles.sheetStatLabel}>ยอดที่ปิดได้รวม</Text>
                </View>
                <View style={styles.sheetStat}>
                  <Text style={styles.sheetStatValue}>
                    {employeeStats.length}
                  </Text>
                  <Text style={styles.sheetStatLabel}>คน/ทีม</Text>
                </View>
                <View style={styles.sheetStat}>
                  <Text style={styles.sheetStatValue}>
                    {empWithTarget.length > 0
                      ? empHitTarget + "/" + empWithTarget.length
                      : "—"}
                  </Text>
                  <Text style={styles.sheetStatLabel}>ถึงเป้าเดือน</Text>
                </View>
              </View>
            </LinearGradient>

            <ScrollView contentContainerStyle={styles.sheetBody}>
              <View style={styles.sheetHintRow}>
                <Ionicons name="swap-vertical" size={12} color={T.textMute} />
                <Text style={styles.sheetHint}>
                  เรียงตามยอดที่ปิดได้ · แตะการ์ดเพื่อดูรายงานของคนนั้น
                </Text>
              </View>
              {empGroups.map((g) => (
                <View key={g.key} style={{ marginBottom: 6 }}>
                  <View style={styles.secHead}>
                    <View
                      style={[styles.secIcon, { backgroundColor: g.color + "16" }]}
                    >
                      <Ionicons name={g.icon as any} size={14} color={g.color} />
                    </View>
                    <Text style={styles.secTitle}>{g.title}</Text>
                    <View style={{ flex: 1 }} />
                    <View
                      style={[styles.countBadge, { backgroundColor: g.color + "14" }]}
                    >
                      <Text style={[styles.countBadgeText, { color: g.color }]}>
                        {g.list.length + (g.key === "bidding" ? " ทีม" : " คน")}
                      </Text>
                    </View>
                  </View>
                  {g.list.map((emp, i) => renderEmployeeCard(emp, i + 1))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 💰 ยืนยันก่อนเปลี่ยน จ่ายแล้ว / ยังไม่จ่าย — กดจากการ์ดในรายการ
          (ถ้าป๊อปอัปรายละเอียดเปิดอยู่ จะแสดงซ้อนอยู่ข้างในป๊อปอัปนั้นแทน เพราะ iOS เปิด Modal ซ้อน Modal ไม่ได้) */}
      <Modal
        visible={!!payConfirm && !detailModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPayConfirm(null)}
      >
        {renderPayConfirm()}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },

  // ===== หัวหน้า (ไล่สีน้ำเงิน) =====
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: T.pad,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  headerBtnActive: { backgroundColor: "#fff", borderColor: "#fff" },
  headerTitle: { fontSize: FS.xl - 2, fontWeight: "800", color: "#fff" },
  headerSub: {
    fontSize: FS.xs,
    color: "rgba(255,255,255,0.75)",
    marginTop: 1,
  },
  filterDot: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: WARNING_COLOR,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  filterDotText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  // ===== Hero =====
  overscrollFill: {
    position: "absolute",
    top: -600,
    left: 0,
    right: 0,
    height: 600,
  },
  heroWrap: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  hero: { paddingHorizontal: T.pad, paddingTop: 4, paddingBottom: 56 },
  pillScroll: { marginHorizontal: -T.pad, flexGrow: 0 },
  pillRow: { gap: 8, alignItems: "center", paddingHorizontal: T.pad },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
  },
  pillText: {
    fontSize: FS.sm,
    color: "#fff",
    fontWeight: "700",
    flexShrink: 1,
  },
  pillDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  pillClear: {
    fontSize: FS.sm,
    color: "#fde68a",
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 18,
  },
  heroLabel: {
    fontSize: FS.sm + 1,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
  },
  heroTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 160,
    backgroundColor: "rgba(16,185,129,0.22)",
    borderWidth: 1,
    borderColor: "rgba(110,231,183,0.45)",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  heroTagText: {
    fontSize: FS.xs,
    color: "#d1fae5",
    fontWeight: "700",
    flexShrink: 1,
  },
  heroValue: {
    fontSize: 34,
    fontWeight: "800",
    color: "#fff",
    marginTop: 4,
    letterSpacing: -0.5,
  },
  heroCaption: {
    fontSize: FS.sm,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },

  // ===== แผงตัวกรอง =====
  filterCard: {
    backgroundColor: T.surface,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  filterLabel: {
    fontSize: FS.xs,
    color: T.textSub,
    fontWeight: "700",
    marginBottom: 6,
  },
  presetRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  preset: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: T.bg,
    borderWidth: 1,
    borderColor: T.line,
  },
  presetOn: { backgroundColor: PRIMARY_COLOR, borderColor: PRIMARY_COLOR },
  presetText: { fontSize: FS.sm, color: T.textSub, fontWeight: "700" },
  presetTextOn: { color: "#fff" },
  dateRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.bg,
  },
  fieldText: { fontSize: FS.md, color: T.text, fontWeight: "600" },
  fieldPlaceholder: { color: T.textMute, fontWeight: "500" },
  filterActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
  },
  resetBtnText: { fontSize: FS.md, color: T.textSub, fontWeight: "700" },
  searchBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: PRIMARY_COLOR,
  },
  searchBtnText: { fontSize: FS.md, color: "#fff", fontWeight: "800" },

  // ===== แผ่นตัวกรอง (bottom sheet) =====
  fsSheet: {
    maxHeight: "88%",
    backgroundColor: T.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: T.pad,
  },
  fsHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
    marginTop: 8,
    marginBottom: 12,
  },
  fsHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  fsTitle: { fontSize: FS.xl, fontWeight: "800", color: T.text },
  fsHeadCount: { fontSize: FS.sm, fontWeight: "700", color: PRIMARY_COLOR },
  fsClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
  },
  fsBody: { paddingBottom: 8 },
  fsLabel: {
    fontSize: FS.md - 1,
    fontWeight: "700",
    color: T.textSub,
    marginTop: 16,
    marginBottom: 8,
  },
  fsLabelRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  fsLabelSub: { fontSize: FS.xs, color: T.textMute },
  fsSeg: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    borderRadius: 14,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.lineSoft,
  },
  fsSegWrap: { flexWrap: "wrap" },
  fsSegCompact: { padding: 3, gap: 3, borderRadius: 12, borderColor: T.line },
  fsSegItemCompact: { minHeight: 34, paddingHorizontal: 10, borderRadius: 9 },
  fsSegItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  fsSegItemOn: { backgroundColor: PRIMARY_COLOR },
  fsSegText: { fontSize: FS.md, fontWeight: "700", color: T.text },
  fsSegTextOn: { color: "#fff" },
  fsSegNum: { fontSize: FS.sm, fontWeight: "600", color: T.textMute },
  fsSegNumOn: { color: "rgba(255,255,255,0.85)" },
  fsDateRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  fsDateField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.lineSoft,
  },
  fsDateCap: { fontSize: 10, color: T.textMute, fontWeight: "600" },
  fsList: {
    borderRadius: 14,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.lineSoft,
    paddingHorizontal: 14,
  },
  fsListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  fsListLine: { borderTopWidth: 1, borderTopColor: T.lineSoft },
  fsListName: { flex: 1, fontSize: FS.md + 1, fontWeight: "700", color: T.text },
  fsListNum: { fontSize: FS.md, fontWeight: "600", color: T.textMute },
  fsCheck: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  fsCheckOn: { backgroundColor: PRIMARY_COLOR, borderColor: PRIMARY_COLOR },
  fsEmpty: {
    textAlign: "center",
    paddingVertical: 18,
    fontSize: FS.sm,
    color: T.textMute,
  },
  fsFooter: { flexDirection: "row", gap: 10, paddingTop: 12 },
  fsClearBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
  },
  fsClearText: { fontSize: FS.md + 1, fontWeight: "700", color: T.text },
  fsApplyBtn: {
    flex: 1.6,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY_COLOR,
  },
  fsApplyText: { fontSize: FS.md + 1, fontWeight: "800", color: "#fff" },
  fsPickerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ===== การ์ดสรุปลอยทับขอบ hero =====
  summaryCard: {
    backgroundColor: T.surface,
    marginHorizontal: T.pad,
    marginTop: -40,
    padding: T.pad,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.cardLine,
    shadowColor: "#0a1f5c",
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  goalRow: { flexDirection: "row" },
  heroGoalSep: { width: 1, backgroundColor: T.line, marginHorizontal: 14 },
  goalTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  goalLabel: { fontSize: FS.xs, color: T.textSub, fontWeight: "700" },
  goalPct: { fontSize: FS.md, fontWeight: "800" },
  goalTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: T.lineSoft,
    overflow: "hidden",
  },
  goalFill: { height: "100%", borderRadius: 3 },
  goalFoot: { fontSize: 10, color: T.textMute, marginTop: 6 },
  goalFootSub: { fontSize: 10, color: T.textSub, fontWeight: "700", marginTop: 1 },
  summaryDivider: {
    height: 1,
    backgroundColor: T.lineSoft,
    marginVertical: 14,
  },
  statRow: { flexDirection: "row", alignItems: "center" },
  statSep: { width: 1, alignSelf: "stretch", backgroundColor: T.lineSoft },
  stat: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statValue: { fontSize: FS.lg, fontWeight: "800", color: T.text },
  statLabel: { fontSize: FS.xs, color: T.textMute, marginTop: 1 },

  // ===== Section ทั่วไป =====
  section: { paddingHorizontal: T.pad, marginTop: 22 },
  secHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  secIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY_COLOR + "14",
  },
  secTitle: { fontSize: FS.lg, fontWeight: "800", color: T.text },
  secHint: { fontSize: FS.sm, color: T.textMute },
  countBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: PRIMARY_COLOR + "14",
  },
  countBadgeText: { fontSize: FS.xs, color: PRIMARY_COLOR, fontWeight: "800" },
  panel: {
    backgroundColor: T.surface,
    borderRadius: T.radius + 2,
    borderWidth: 1,
    borderColor: T.cardLine,
    padding: 6,
    ...CARD_SHADOW,
  },
  panelEmpty: {
    fontSize: FS.sm,
    color: T.textMute,
    textAlign: "center",
    paddingVertical: 16,
  },

  // ===== แถวสถานะงาน =====
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  statusIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statusRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  statusName: { flex: 1, fontSize: FS.md, color: T.text, fontWeight: "600" },
  statusCount: { fontSize: FS.md, fontWeight: "800" },
  statusTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: T.lineSoft,
    overflow: "hidden",
  },
  statusFill: { height: "100%", borderRadius: 2 },

  // ===== การ์ดรายงาน =====
  card: {
    backgroundColor: T.surface,
    borderRadius: T.radius + 2,
    borderWidth: 1,
    borderColor: T.cardLine,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 2,
    marginBottom: T.gap,
    ...CARD_SHADOW,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.lineSoft,
  },
  cardAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  cardAvatarText: { fontSize: FS.md, fontWeight: "800" },
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
  jobCustomer: { fontSize: FS.md, fontWeight: "700", color: PRIMARY_COLOR },
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

  // ===== 💰 จ่ายแล้ว / ยังไม่จ่าย =====
  payRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: T.lineSoft,
    paddingVertical: 9,
  },
  payLabel: { fontSize: FS.sm, fontWeight: "700", color: T.textSub },
  payMeta: { fontSize: 10, color: T.textMute, marginTop: 1 },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: T.surface,
  },
  payBtnText: { fontSize: FS.sm, fontWeight: "700" },
  payTabs: { flexDirection: "row", gap: 6, marginBottom: 10 },
  payTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.surface,
  },
  payTabText: { fontSize: FS.sm, fontWeight: "700", color: T.textSub },
  payTabCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: T.lineSoft,
    alignItems: "center",
  },
  payTabCountText: { fontSize: 10, fontWeight: "800", color: T.textSub },
  // ชั้นซ้อนเต็มจอภายในป๊อปอัปรายละเอียด
  payConfirmLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    elevation: 100,
  },
  payConfirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "center",
    padding: 28,
  },
  payConfirmBox: {
    backgroundColor: T.surface,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
  },
  payConfirmIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  payConfirmTitle: {
    fontSize: FS.lg,
    fontWeight: "800",
    color: T.text,
    marginBottom: 6,
  },
  payConfirmMsg: {
    fontSize: FS.md,
    color: T.textSub,
    textAlign: "center",
    lineHeight: 21,
  },
  payConfirmBtns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    alignSelf: "stretch",
  },
  payConfirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 44,
    borderRadius: 12,
  },
  payConfirmCancel: { backgroundColor: T.lineSoft },
  payConfirmCancelText: { fontSize: FS.md, fontWeight: "700", color: T.textSub },
  payConfirmOkText: { fontSize: FS.md, fontWeight: "800", color: "#fff" },

  // ===== Empty state =====
  empty: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    backgroundColor: T.surface,
    borderRadius: T.radius + 2,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY_COLOR + "12",
  },
  emptyText: {
    fontSize: FS.sm,
    color: T.textSub,
    marginTop: 10,
    textAlign: "center",
  },
  emptyBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: PRIMARY_COLOR + "14",
  },
  emptyBtnText: { fontSize: FS.sm, color: PRIMARY_COLOR, fontWeight: "700" },

  // ===== ทีมเซลส์ =====
  teamRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  teamTitle: { fontSize: FS.md, fontWeight: "800", color: T.text },
  teamSub: { fontSize: FS.xs, color: T.textMute, marginTop: 2 },
  teamChevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY_COLOR + "12",
  },
  avatarMicroGroup: { flexDirection: "row" },
  avatarMicro: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: T.surface,
  },
  avatarMicroText: { color: "#fff", fontSize: FS.sm, fontWeight: "800" },
  avatarMicroMore: { backgroundColor: T.lineSoft },
  avatarMicroMoreText: { color: T.textSub, fontSize: FS.xs, fontWeight: "800" },

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
  // 1 หมวดค่าใช้จ่าย = แถวยอดเงิน + หลักฐานของหมวดนั้นอยู่ใต้แถว (เส้นคั่นอยู่ท้ายบล็อก)
  expenseBlock: {
    borderBottomWidth: 1,
    borderBottomColor: T.lineSoft,
    paddingBottom: 4,
  },
  expenseEvRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingLeft: 24,
    paddingBottom: 6,
  },
  // รูปย่อหลักฐาน (สลิป/เอกสาร) ในป๊อปอัปรายละเอียด
  evThumbWrap: { width: 60, alignItems: "center", marginTop: 4 },
  evThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: "hidden",
    backgroundColor: T.lineSoft,
  },
  evThumbImg: { width: "100%", height: "100%" },
  evThumbPdf: { flex: 1, alignItems: "center", justifyContent: "center" },
  evThumbLabel: { fontSize: 9, marginTop: 2, fontWeight: "600" },
  // --- หลักฐานแยกรอบ (แบบหน้ารายละเอียดบนเว็บ) ---
  evrSegWrap: { marginBottom: 10 },
  evrBox: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  evrBoxHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#dbeafe",
    borderStyle: "dashed",
  },
  evrBoxTitle: { fontWeight: "800", fontSize: 15, color: "#1d4ed8" },
  evrBoxAt: { fontSize: 11, color: "#64748b" },
  evrCat: { paddingVertical: 6 },
  evrCatHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  evrCatTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  evrCatTitle: { fontWeight: "700", fontSize: 14, color: "#334155", flexShrink: 1 },
  evrCatAmt: { fontWeight: "700", fontSize: 14, color: "#334155" },
  evrGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  evrThumbWrap: { width: 84, alignItems: "center" },
  evrThumb: {
    width: 84,
    height: 84,
    borderRadius: 8,
    borderWidth: 2,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  evrExt: { fontSize: 10, fontWeight: "700", color: "#dc2626", marginTop: 2 },
  evrThumbType: { fontSize: 11, fontWeight: "700", marginTop: 3 },
  evrThumbRound: { fontSize: 10, color: "#64748b" },
  evrOtherFrame: { paddingLeft: 24, paddingTop: 6, paddingBottom: 4 },
  evrOtherTitle: { fontWeight: "700", fontSize: 13, flexShrink: 1 },
  evrOtherAmt: { fontWeight: "700", fontSize: 13, color: "#334155" },
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

  // ===== Popup สถิติทีมเซลส์ (bottom sheet) =====
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(10,31,92,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    height: "88%",
    backgroundColor: T.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  sheetHeader: { paddingHorizontal: T.pad, paddingTop: 8, paddingBottom: 14 },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.45)",
    marginBottom: 10,
  },
  sheetTitleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetTitle: { fontSize: FS.xl - 2, fontWeight: "800", color: "#fff" },
  sheetSub: {
    fontSize: FS.xs,
    color: "rgba(255,255,255,0.78)",
    marginTop: 2,
  },
  sheetStats: { flexDirection: "row", gap: 8, marginTop: 14 },
  sheetStat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  sheetStatValue: { fontSize: FS.md + 1, fontWeight: "800", color: "#fff" },
  sheetStatLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.78)",
    marginTop: 2,
  },
  sheetBody: { padding: T.pad, paddingBottom: 24 },
  sheetHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 14,
  },
  sheetHint: { fontSize: FS.xs, color: T.textMute },

  // ===== การ์ดพนักงานใน popup สถิติทีมเซลส์ =====
  empCard: {
    backgroundColor: T.surface,
    borderRadius: T.radius + 2,
    borderWidth: 1,
    borderColor: T.cardLine,
    padding: 14,
    marginBottom: T.gap,
    ...CARD_SHADOW,
  },
  empHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: FS.lg },
  rankBadge: {
    position: "absolute",
    right: -5,
    bottom: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.line,
    borderWidth: 2,
    borderColor: T.surface,
  },
  rankText: { fontSize: 10, fontWeight: "800", color: T.textSub },
  empName: { fontSize: FS.md + 1, fontWeight: "800", color: T.text },
  empMeta: { fontSize: FS.xs, color: T.textMute, marginTop: 2 },
  empSalesLabel: { fontSize: 10, color: T.textMute, fontWeight: "600" },
  empSales: { fontSize: FS.lg, fontWeight: "800", marginTop: 1 },
  empGoals: {
    flexDirection: "row",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: T.lineSoft,
  },
  // กล่องสถานะงานในการ์ด: หัว + แถบสัดส่วน + ตาราง 2 คอลัมน์
  empStatusBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: T.lineSoft,
  },
  empStatusHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  empStatusTitle: { fontSize: FS.xs, color: T.textSub, fontWeight: "700" },
  empStatusTotal: { fontSize: FS.xs, color: T.textMute, fontWeight: "600" },
  empStatusBar: {
    flexDirection: "row",
    gap: 2,
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: T.lineSoft,
    marginBottom: 10,
  },
  empStatusGrid: { gap: 8 },
  empStatusRow: { flexDirection: "row", gap: 8 },
  empStatusTile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 54,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: 10,
  },
  empStatusAccent: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  empStatusName: {
    flex: 1,
    fontSize: FS.sm,
    lineHeight: 16,
    color: T.text,
    fontWeight: "600",
  },
  empStatusCount: { fontSize: FS.lg, fontWeight: "800", lineHeight: 20 },
  empStatusPct: { fontSize: 10, color: T.textMute, fontWeight: "600" },
  empFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: T.lineSoft,
  },
  empFooterText: { fontSize: FS.sm, fontWeight: "700" },

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
