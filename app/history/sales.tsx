import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { API_BASE, IMG_BASE_URL } from "../../constants/config";
// 🌟 รูปแบบวันที่สั้น "d/m/yy" มาตรฐานเดียวกันทั้งแอป (แทน toLocaleDateString("th-TH") ที่โชว์ปี ค.ศ. 4 หลัก)
import { formatShortThaiDate } from "../../components/DateTimeField";
import { useAuth } from "../_layout";
import WriteReportScreen from "../(tabs)/write_report";

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

// แปลง Date -> YYYY-MM-DD ตามเวลาท้องถิ่น (ไม่ใช้ toISOString เพราะเลื่อน timezone) ให้ formatShortThaiDate ใช้ได้
const toYmdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ดึงเฉพาะเวลา "HH:MM น." จาก timestamp เต็ม (YYYY-MM-DD HH:MM:SS) ใช้คู่กับ formatShortThaiDate ตอนที่ต้องโชว์วันที่/เวลาคนละฟิลด์กัน
const formatTimeHM = (dt?: string | null) => {
  if (!dt) return "-";
  const m = String(dt).match(/(\d{2}):(\d{2})(?::\d{2})?$/);
  return m ? `${m[1]}:${m[2]} น.` : "-";
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
const splitFiles = (v: any) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export default function HistorySales() {
  const router = useRouter();
  const { user } = useAuth();

  // Data States
  const [rawData, setRawData] = useState<any[]>([]); // ข้อมูลดิบ
  const [filteredList, setFilteredList] = useState<any[]>([]); // ข้อมูลที่โชว์
  // ➕ เพิ่ม target เข้าไป
  const [summary, setSummary] = useState({
    total: 0,
    expense: 0,
    sales: 0,
    projectValue: 0,
    target: 0,
  });
  const [kpiList, setKpiList] = useState<any[]>([]);
  const [successKeyword, setSuccessKeyword] = useState("เซ็นสัญญา");

  // Filter States
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  // Modals & UI
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ✏️ รายงานที่กำลังแก้ไข (เปิดฟอร์ม write_report เป็นป๊อปอัปเต็มจอในหน้านี้)
  const [editTarget, setEditTarget] = useState<any>(null);

  // 🗑️ ลบรายงาน (ย้ายไปถังขยะ) / ♻️ กู้คืน
  const [deleteTarget, setDeleteTarget] = useState<any>(null); // รายงานที่รอยืนยันลบ
  const [deleting, setDeleting] = useState(false);
  const [undoInfo, setUndoInfo] = useState<{ trashId: number; label: string } | null>(null);
  const undoTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [trashVisible, setTrashVisible] = useState(false);
  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  // ☑️ เลือกหลายรายการในถังขยะเพื่อกู้คืนพร้อมกัน
  const [selectedTrash, setSelectedTrash] = useState<number[]>([]);
  const [bulkRestoring, setBulkRestoring] = useState(false);

  // ... (States เดิม)

  // ➕ [เพิ่มใหม่] States สำหรับเบิกค่าใช้จ่าย
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [selectedExpenseItem, setSelectedExpenseItem] = useState<any>(null);

  // โครงสร้างข้อมูล: ค่าน้ำมัน (Array), ที่พัก (Object), อื่นๆ (Object)
  const [fuelList, setFuelList] = useState([{ amount: "", file: null as any }]);
  const [hotelCost, setHotelCost] = useState({ amount: "", file: null as any });
  const [otherCost, setOtherCost] = useState({
    amount: "",
    detail: "",
    file: null as any,
  });

  // ➕ [เพิ่มใหม่] ฟังก์ชันเปิด Modal พร้อมจำค่า item
  const openExpenseModal = (item: any) => {
    setSelectedExpenseItem(item); // จำงานที่เลือก

    // 1. ดึงค่าน้ำมัน (เนื่องจาก DB เก็บเป็นยอดรวม เราจะใส่ยอดรวมไว้ในแถวแรก)
    // แตกค่าน้ำมันออกเป็นหลายบิล (DB เก็บเป็น "100,200,300")
    const fuelCosts = item.fuel_cost
      ? String(item.fuel_cost)
        .split(",")
        .map((v: string) => v.trim())
        .filter((v: string) => v !== "")
      : [""];
    const fuelReceipts = item.fuel_receipt
      ? String(item.fuel_receipt)
        .split(",")
        .map((v: string) => v.trim())
        .filter((v: string) => v !== "")
      : [];

    setFuelList(
      fuelCosts.map((cost: string, idx: number) => ({
        amount: parseFloat(cost) > 0 ? parseFloat(cost).toString() : "",
        file: fuelReceipts[idx]
          ? { uri: fuelReceipts[idx], isExisting: true }
          : null,
      })),
    );

    // 2. ดึงค่าที่พัก
    const hasHotelFile =
      item.accommodation_receipt && item.accommodation_receipt !== "";
    setHotelCost({
      amount:
        item.accommodation_cost && parseFloat(item.accommodation_cost) > 0
          ? parseFloat(item.accommodation_cost).toString()
          : "",
      file: hasHotelFile
        ? { uri: item.accommodation_receipt, isExisting: true }
        : null,
    });

    // 3. ดึงค่าอื่นๆ
    const hasOtherFile = item.other_receipt && item.other_receipt !== "";
    setOtherCost({
      amount:
        item.other_cost && parseFloat(item.other_cost) > 0
          ? parseFloat(item.other_cost).toString()
          : "",
      detail: item.other_cost_detail || "",
      file: hasOtherFile ? { uri: item.other_receipt, isExisting: true } : null,
    });

    setExpenseModalVisible(true);
  };

  // ➕ [เพิ่มใหม่] ฟังก์ชันจัดการรายการน้ำมัน (เพิ่ม/ลบ แถว)
  const addFuelRow = () =>
    setFuelList([...fuelList, { amount: "", file: null }]);
  const removeFuelRow = (index: number) => {
    const list = [...fuelList];
    list.splice(index, 1);
    setFuelList(list);
  };
  const updateFuelAmount = (text: string, index: number) => {
    const list = [...fuelList];
    list[index].amount = text;
    setFuelList(list);
  };

  // ➕ [เพิ่มใหม่] ฟังก์ชันเลือกไฟล์ (กล้อง / อัลบั้ม / ไฟล์เอกสาร)
  const handleAttachment = async (
    target: "fuel" | "hotel" | "other",
    index: number = 0,
  ) => {
    Alert.alert("แนบหลักฐาน", "เลือกแหล่งที่มาของไฟล์", [
      {
        text: "ถ่ายรูป 📸",
        onPress: () => pickMedia(target, index, "camera"),
      },
      {
        text: "อัลบั้มรูป 🖼️",
        onPress: () => pickMedia(target, index, "library"),
      },
      {
        text: "เลือกไฟล์ 📁",
        onPress: () => pickDocument(target, index),
      },
      { text: "ยกเลิก", style: "cancel" },
    ]);
  };

  const pickMedia = async (
    target: string,
    index: number,
    type: "camera" | "library",
  ) => {
    let result;
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
    };

    if (type === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert("ต้องการสิทธิ์เข้าถึงกล้อง");
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options);
    }

    if (!result.canceled && result.assets[0]) {
      saveFileToState(target, index, {
        uri: result.assets[0].uri,
        type: "image/jpeg",
        name: `img_${Date.now()}.jpg`,
      });
    }
  };

  const pickDocument = async (target: string, index: number) => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*" });
    if (!result.canceled && result.assets[0]) {
      saveFileToState(target, index, {
        uri: result.assets[0].uri,
        type: result.assets[0].mimeType || "application/octet-stream",
        name: result.assets[0].name,
      });
    }
  };

  const saveFileToState = (target: string, index: number, fileObj: any) => {
    if (target === "fuel") {
      const list = [...fuelList];
      list[index].file = fileObj;
      setFuelList(list);
    } else if (target === "hotel") {
      setHotelCost((prev) => ({ ...prev, file: fileObj }));
    } else if (target === "other") {
      setOtherCost((prev) => ({ ...prev, file: fileObj }));
    }
  };

  // ➕ [เพิ่มใหม่] ฟังก์ชันบันทึกการเบิก (จำลองการส่งข้อมูล)
  // ✏️ [แก้ไข] ฟังก์ชันบันทึกการเบิก (เพิ่ม Logic อัปเดตข้อมูลทันที)
  // ✏️ [แก้ไขใหม่] ฟังก์ชันบันทึกการเบิก (ส่งข้อมูลไป Server จริง + อัปเดตหน้าจอ)
  // ✏️ [แก้ไข] บันทึกข้อมูล (เช็คไฟล์เก่า/ใหม่)
  const submitExpenseForm = async () => {
    if (!selectedExpenseItem) return;
    setSubmittingExpense(true);

    try {
      // 1. คำนวณตัวเลข
      const totalFuel = fuelList.reduce(
        (sum, item) => sum + (parseFloat(item.amount) || 0),
        0,
      );
      const totalHotel = parseFloat(hotelCost.amount) || 0;
      const totalOther = parseFloat(otherCost.amount) || 0;
      const grandTotal = totalFuel + totalHotel + totalOther;

      // 2. เตรียม FormData
      const formData = new FormData();
      formData.append("action", "update_expense_request");
      formData.append("report_id", String(selectedExpenseItem.id));

      // ✅ ส่งแยกแต่ละบิล ไม่รวมเป็นยอดเดียว เพื่อให้ DB เก็บเป็น "100,200,300"
      fuelList.forEach((item) => {
        formData.append("fuel_cost[]", item.amount || "0");
      });
      formData.append("accommodation_cost", totalHotel.toString());
      formData.append("other_cost", totalOther.toString());
      formData.append("other_cost_detail", otherCost.detail);

      // 3. แนบไฟล์ (เฉพาะไฟล์ที่ถ่ายใหม่ - ไม่เอาไฟล์เดิมที่มี isExisting)
      const keptFuelReceipts: string[] = [];
      fuelList.forEach((item) => {
        // เช็คว่ามีไฟล์
        if (item.file) {
          if (item.file.isExisting) {
            keptFuelReceipts.push(item.file.uri);
          } else {
            // @ts-ignore
            formData.append("fuel_receipt_file[]", {
              uri: item.file.uri,
              name: item.file.name || "fuel.jpg",
              type: item.file.type || "image/jpeg",
            });
          }
        }
      });
      formData.append("kept_fuel_receipts", JSON.stringify(keptFuelReceipts));

      if (hotelCost.file && !hotelCost.file.isExisting) {
        // @ts-ignore
        formData.append("accommodation_receipt_file", {
          uri: hotelCost.file.uri,
          name: hotelCost.file.name || "hotel.jpg",
          type: hotelCost.file.type || "image/jpeg",
        });
      }

      if (otherCost.file && !otherCost.file.isExisting) {
        // @ts-ignore
        formData.append("other_receipt_file", {
          uri: otherCost.file.uri,
          name: otherCost.file.name || "other.jpg",
          type: otherCost.file.type || "image/jpeg",
        });
      }

      // 4. ยิง API
      const response = await axios.post(
        `${API_BASE}/api_mobile.php?action=update_expense_request`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      if (response.data.status === "success") {
        Alert.alert("สำเร็จ", "บันทึกข้อมูลเรียบร้อยแล้ว");

        // 5. อัปเดตข้อมูลในหน้าจอทันที
        // ✅ เก็บ fuel_cost เป็น comma-separated string ใน local state
        const fuelCostSaved = fuelList
          .map((f) => f.amount || "0")
          .join(",");

        const updatedData = rawData.map((item) => {
          if (item.id === selectedExpenseItem.id) {
            return {
              ...item,
              fuel_cost: fuelCostSaved,
              accommodation_cost: totalHotel.toString(),
              other_cost: totalOther.toString(),
              other_cost_detail: otherCost.detail,
              total_expense: grandTotal.toString(),

              // อัปเดตสถานะรูปภาพ (ถ้ามีไฟล์ค้างอยู่ หรือ อัปใหม่ ถือว่ามีรูป)
              fuel_receipt: fuelList.some((f) => f.file)
                ? item.fuel_receipt || "uploaded"
                : "",
              accommodation_receipt: hotelCost.file
                ? item.accommodation_receipt || "uploaded"
                : "",
              other_receipt: otherCost.file
                ? item.other_receipt || "uploaded"
                : "",
            };
          }
          return item;
        });

        setRawData(updatedData);
        setExpenseModalVisible(false);
        // ไม่ต้อง Reset Form ที่นี่ก็ได้ เพราะจะถูก Reset ใหม่ตอน openExpenseModal ครั้งหน้า
        setSelectedExpenseItem(null);
      } else {
        Alert.alert(
          "เกิดข้อผิดพลาด",
          response.data.message || "ไม่สามารถบันทึกได้",
        );
      }
    } catch (error) {
      console.error("Submit Error:", error);
      Alert.alert("Error", "เชื่อมต่อ Server ไม่ได้");
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Date Picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateMode, setDateMode] = useState<"start" | "end">("start");
  const [pickerDate, setPickerDate] = useState(new Date());
  const [pickerView, setPickerView] = useState<"day" | "month" | "year">("day");

  // ✅ Helpers
  const parseProjectData = (rawText: string) => {
    if (!rawText || rawText === "-") return { name: "-", value: "" };
    const regexValue = /มูลค่า\s*[:\s]?\s*([\d,.]+)/i;
    const match = rawText.match(regexValue);
    if (match) {
      const valStr = match[1];
      let cleanName = rawText
        .replace(/[\(-]?\s*มูลค่า\s*[:\s]?\s*[\d,.]+(\s*บาท)?\)?/gi, "")
        .trim();
      if (cleanName === "" || cleanName === "-") cleanName = "-";
      return { name: cleanName, value: valStr };
    }
    return { name: rawText, value: "" };
  };

  const parseCurrency = (valStr: string) => {
    if (!valStr || valStr === "-") return 0;
    return parseFloat(valStr.replace(/,/g, ""));
  };

  const cleanSplit = (str: string) => {
    if (!str) return [];
    return str
      .split(/,(?![^(]*\))/)
      .map((s) => s.trim())
      .filter((s) => s !== "");
  };

  const newlineSplit = (str: string) => {
    if (!str) return [];
    return str.split(/\r?\n/).map((s) => s.trim());
  };

  const getStatusColor = (status: string) => {
    const s = (status || "").trim();
    if (s.includes("ไม่ได้") || s.includes("ยกเลิก") || s.includes("แพ้"))
      return DANGER_COLOR;

    // ✅ เพิ่มการเช็ค successKeyword จาก API (ถ้าตรงให้เป็นสีเขียว)
    if (
      s.includes(successKeyword) ||
      s.includes("ได้งาน") ||
      s.includes("สำเร็จ")
    )
      return SUCCESS_COLOR;

    if (s.includes("ติดตาม") || s.includes("รอ")) return WARNING_COLOR;
    return INFO_COLOR;
  };

  const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => {
    const s = (status || "").trim();
    if (s.includes("ไม่ได้") || s.includes("ยกเลิก")) return "close-circle";

    // ✅ เพิ่มการเช็ค successKeyword (ถ้าตรงให้เป็นไอคอนติ๊กถูก)
    if (
      s.includes(successKeyword) ||
      s.includes("ได้งาน") ||
      s.includes("สำเร็จ")
    )
      return "checkmark-circle";

    return "time";
  };

  // ✅ Helper: แยก Status สำหรับ Filter Card (ตัดคอมม่าออก)
  const processStatusBreakdown = (dataList: any[]) => {
    const statusCount: { [key: string]: number } = {};
    dataList.forEach((item) => {
      const statuses = cleanSplit(item.job_status);
      statuses.forEach((s) => {
        if (s && s !== "-") {
          statusCount[s] = (statusCount[s] || 0) + 1;
        }
      });
    });
    return Object.keys(statusCount).map((key) => ({
      status: key,
      count: statusCount[key],
    }));
  };

  // ✅ Fetch Data
  const fetchHistory = async () => {
    try {
      if (!refreshing) setLoading(true);

      const formatDateLocal = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      let url = `${API_BASE}/api_mobile.php?action=get_history&reporter_name=${encodeURIComponent(user?.fullname || "")}`;
      if (startDate) url += `&start_date=${formatDateLocal(startDate)}`;
      if (endDate) url += `&end_date=${formatDateLocal(endDate)}`;

      const res = await axios.get(url);

      if (res.data && res.data.history) {
        // ➕ รับค่าเป้าหมายและ Keyword จาก API
        const userTarget = res.data.target || 0;
        const successKeyword = res.data.success_keyword || "เซ็นสัญญา";
        setSuccessKeyword(successKeyword);

        // กรองเฉพาะ Sales
        const salesData = res.data.history.filter(
          (item: any) => item.source_type === "sales",
        );

        // เรียงวันที่ ใหม่ -> เก่า
        salesData.sort(
          (a: any, b: any) =>
            new Date(b.report_date).getTime() -
            new Date(a.report_date).getTime(),
        );

        setRawData(salesData);

        // คำนวณยอดรวม (Frontend Calculation)
        let totalExp = 0;
        let totalProjVal = 0;

        salesData.forEach((item: any) => {
          totalExp += parseFloat(
            String(item.total_expense).replace(/,/g, "") || "0",
          );

          const projects = cleanSplit(item.project_name);
          const statuses = cleanSplit(item.job_status);

          projects.forEach((p: string, idx: number) => {
            const currentStatus = statuses[idx] || "";
            // ✅ บวกมูลค่าเฉพาะงานที่ได้งาน (เซ็นสัญญา) โดยเช็คจาก Keyword ที่ API ส่งมา
            if (currentStatus.includes(successKeyword)) {
              const { value } = parseProjectData(p);
              totalProjVal += parseCurrency(value);
            }
          });
        });

        // ✅ อัปเดต Summary (ใส่ target เข้าไปด้วย)
        setSummary({
          total: salesData.length,
          expense: totalExp,
          sales: 0,
          projectValue: totalProjVal,
          target: userTarget, // ➕ เซ็ตเป้าหมายลง State
        });

        setKpiList(processStatusBreakdown(salesData));
        applyLocalFilter(salesData, filterStatus);
      } else {
        setRawData([]);
        setFilteredList([]);
        setSummary({
          total: 0,
          expense: 0,
          sales: 0,
          projectValue: 0,
          target: 0,
        }); // ✅ อย่าลืมใส่ target: 0 ตรงนี้ด้วย
        setKpiList([]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ✅ Local Filter Logic
  const applyLocalFilter = (data: any[], status: string) => {
    if (!status) {
      setFilteredList(data);
      return;
    }
    const result = data.filter((item) => {
      const statuses = cleanSplit(item.job_status);
      return statuses.includes(status);
    });
    setFilteredList(result);
  };

  useEffect(() => {
    fetchHistory();
  }, [startDate, endDate]);

  useEffect(() => {
    applyLocalFilter(rawData, filterStatus);
  }, [filterStatus]);

  const fetchCustomerHistory = async (customerName: string) => {
    setHistoryModalVisible(true);
    setSelectedCustomer(customerName);
    setLoadingHistory(true);
    try {
      const url = `${API_BASE}/api_mobile.php?ajax_action=get_customer_history&customer_name=${encodeURIComponent(customerName)}`;
      const res = await axios.get(url);
      setCustomerHistory(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
    } finally {
      setLoadingHistory(false);
    }
  };

  const imageUrl = (filename: string) =>
    `${IMG_BASE_URL}/${encodeURIComponent(filename.trim())}`;

  const openImage = (filename: string) => {
    Linking.openURL(imageUrl(filename)).catch(() =>
      Alert.alert("Error", "เปิดไฟล์ไม่ได้"),
    );
  };

  // --- Date Picker ---
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
    setPickerDate(
      new Date(pickerDate.getFullYear(), pickerDate.getMonth() + offset, 1),
    );
  };

  // ➕ [เพิ่มส่วนนี้ 1] ฟังก์ชันเลือกเดือนที่หายไป
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

  // ➕ [เพิ่มส่วนนี้ 2] ฟังก์ชันเลือกปีที่หายไป
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

  // ✅ Render Item แบบ Table Style
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
      if (!cus || cus === "" || cus === "-") continue;
      validJobs.push({
        cus,
        proj: projectsRaw[i] || "",
        stat: statusesRaw[i] || "",
      });
    }

    const displayedJobs = filterStatus
      ? validJobs.filter((job) => job.stat === filterStatus)
      : validJobs;
    if (displayedJobs.length === 0) return null;

    const mainColor = getStatusColor(displayedJobs[0]?.stat || "");
    const hasFuel = !!item.fuel_receipt;
    const hasHotel = !!item.accommodation_receipt;
    const hasOther = !!item.other_receipt;

    return (
      <Animated.View entering={FadeInDown.delay(index * 50)}>
        <View style={[styles.card, { borderLeftColor: mainColor }]}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.dateText}>
                {formatShortThaiDate(item.report_date)} •{" "}
                {formatTimeHM(item.created_at)}
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
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 10, color: "#999" }}>เบิกจ่าย</Text>
              <Text style={styles.expenseText}>
                -{parseFloat(item.total_expense).toLocaleString()}
              </Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHead, { flex: 1.2 }]}>ลูกค้า</Text>
              <Text style={[styles.tableHead, { flex: 1.2 }]}>โครงการ</Text>
              <Text
                style={[styles.tableHead, { width: 90, textAlign: "right" }]}
              >
                สถานะ/มูลค่า
              </Text>
            </View>

            {displayedJobs.map((job, i) => {
              const { name: pjName, value: pjValue } = parseProjectData(
                job.proj,
              );
              const stColor = getStatusColor(job.stat);
              const stIcon = getStatusIcon(job.stat);
              const displayValue = pjValue
                ? parseCurrency(pjValue).toLocaleString() + " ฿"
                : "-";

              return (
                <View
                  key={i}
                  style={[styles.jobRow, i > 0 && styles.jobRowDivider]}
                >
                  <View style={{ flex: 1.2, paddingRight: 4 }}>
                    <TouchableOpacity
                      onPress={() => fetchCustomerHistory(job.cus)}
                    >
                      <Text style={styles.customerLinkTable} numberOfLines={2}>
                        {job.cus}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1.2, paddingRight: 4 }}>
                    <Text style={styles.projectTextTable} numberOfLines={2}>
                      {pjName}
                    </Text>
                  </View>
                  <View style={{ width: 90, alignItems: "flex-end" }}>
                    <View
                      style={[
                        styles.statusBadgeSmall,
                        {
                          borderColor: stColor,
                          backgroundColor: stColor + "10",
                          marginBottom: 2,
                        },
                      ]}
                    >
                      <Ionicons
                        name={stIcon}
                        size={10}
                        color={stColor}
                        style={{ marginRight: 2 }}
                      />
                      <Text
                        style={{
                          color: stColor,
                          fontSize: 9,
                          fontWeight: "700",
                        }}
                        numberOfLines={1}
                      >
                        {job.stat}
                      </Text>
                    </View>
                    {pjValue ? (
                      <Text style={styles.projectValueText}>
                        {displayValue}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 10, color: "#e2e8f0" }}>-</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.cardFooter}>
            <View
              style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
            >
              <Text style={{ fontSize: 10, color: "#aaa" }}>หลักฐาน:</Text>
              {hasFuel && (
                <FontAwesome5 name="gas-pump" size={12} color="#c2410c" />
              )}
              {hasHotel && (
                <FontAwesome5 name="bed" size={12} color="#1d4ed8" />
              )}
              {hasOther && (
                <FontAwesome5 name="receipt" size={12} color="#a16207" />
              )}
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {/* ➕ ปุ่มแก้ไข */}
              <TouchableOpacity
                style={[styles.viewBtn, { backgroundColor: "#fef2f2" }]}
                onPress={() => setEditTarget(item)} // แก้ไขในป๊อปอัปเต็มจอ อยู่หน้าประวัติต่อ
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: DANGER_COLOR,
                    fontWeight: "bold",
                  }}
                >
                  <Ionicons name="create-outline" size={12} /> แก้ไข
                </Text>
              </TouchableOpacity>

              {/* 🗑️ ปุ่มลบ (ถามยืนยันก่อน · กู้คืนได้) */}
              <TouchableOpacity
                style={[styles.viewBtn, styles.deleteBtn]}
                onPress={() => setDeleteTarget(item)}
              >
                <Ionicons name="trash-outline" size={14} color="#fff" />
              </TouchableOpacity>

              {/* ปุ่มรายละเอียด (เดิม) */}
              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => {
                  setSelectedItem(item);
                  setDetailModalVisible(true);
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: PRIMARY_COLOR,
                    fontWeight: "bold",
                  }}
                >
                  รายละเอียด <Ionicons name="chevron-forward" size={12} />
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  };

  // ================= 🗑️ ลบ / ♻️ กู้คืน รายงาน =================
  // ลบ = ย้ายไปถังขยะบนเซิร์ฟเวอร์ (report_trash) กู้คืนได้ทั้งจากแถบ "เลิกทำ" และหน้าถังขยะ
  const reportLabel = (it: any) => {
    const customers = cleanSplit(it?.work_result).join(", ");
    return `${formatShortThaiDate(it?.report_date)}${customers ? " · " + customers : ""}`;
  };

  const showUndo = (trashId: number, label: string) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoInfo({ trashId, label });
    undoTimer.current = setTimeout(() => setUndoInfo(null), 7000);
  };

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const doDeleteReport = async () => {
    const item = deleteTarget;
    if (!item || deleting) return;
    setDeleting(true);
    try {
      const fd = new FormData();
      fd.append("report_id", String(item.id));
      fd.append("user_id", String(user?.id ?? ""));
      const res = await axios.post(
        `${API_BASE}/api_mobile.php?action=delete_report`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      if (res.data?.status !== "success")
        throw new Error(res.data?.message || "ลบไม่สำเร็จ");
      setDeleteTarget(null);
      if (detailModalVisible && String(selectedItem?.id) === String(item.id))
        setDetailModalVisible(false);
      showUndo(res.data.trash_id, reportLabel(item));
      fetchHistory();
    } catch (e: any) {
      Alert.alert("ลบไม่สำเร็จ", e?.message || "กรุณาลองใหม่อีกครั้ง");
    } finally {
      setDeleting(false);
    }
  };

  const fetchTrash = async () => {
    setSelectedTrash([]);
    setTrashLoading(true);
    try {
      const res = await axios.get(
        `${API_BASE}/api_mobile.php?action=get_deleted_reports&user_id=${encodeURIComponent(String(user?.id ?? ""))}`,
      );
      setTrashItems(res.data?.status === "success" ? res.data.items || [] : []);
    } catch {
      setTrashItems([]);
    } finally {
      setTrashLoading(false);
    }
  };

  // เรียก API กู้คืน 1 รายการ (โยน error พร้อมข้อความจากเซิร์ฟเวอร์ถ้าไม่สำเร็จ)
  const callRestore = async (trashId: number) => {
    const fd = new FormData();
    fd.append("trash_id", String(trashId));
    fd.append("user_id", String(user?.id ?? ""));
    const res = await axios.post(
      `${API_BASE}/api_mobile.php?action=restore_report`,
      fd,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    if (res.data?.status !== "success")
      throw new Error(res.data?.message || "กู้คืนไม่สำเร็จ");
  };

  const toggleTrashSelect = (trashId: number) =>
    setSelectedTrash((sel) =>
      sel.includes(trashId) ? sel.filter((x) => x !== trashId) : [...sel, trashId],
    );

  // ♻️ กู้คืนรายการที่เลือกทั้งหมด (ทีละรายการ แล้วสรุปผล)
  const restoreSelected = async () => {
    if (bulkRestoring || selectedTrash.length === 0) return;
    setBulkRestoring(true);
    const done: number[] = [];
    const failed: string[] = [];
    for (const tid of selectedTrash) {
      try {
        await callRestore(tid);
        done.push(tid);
      } catch (e: any) {
        const t = trashItems.find((x) => x.trash_id === tid);
        failed.push(
          `• ${formatShortThaiDate(t?.report_date)} ${cleanSplit(t?.work_result).join(", ")}: ${e?.message || "ไม่สำเร็จ"}`,
        );
      }
    }
    setTrashItems((list) => list.filter((t) => !done.includes(t.trash_id)));
    setSelectedTrash((sel) => sel.filter((x) => !done.includes(x)));
    if (undoInfo && done.includes(undoInfo.trashId)) setUndoInfo(null);
    if (done.length > 0) fetchHistory();
    setBulkRestoring(false);
    Alert.alert(
      failed.length ? "กู้คืนได้บางส่วน" : "กู้คืนสำเร็จ",
      `กู้คืนแล้ว ${done.length} รายการ` +
        (failed.length ? `\nไม่สำเร็จ ${failed.length} รายการ\n${failed.join("\n")}` : ""),
    );
  };

  const restoreReport = async (trashId: number): Promise<boolean> => {
    if (restoringId || bulkRestoring) return false;
    setRestoringId(trashId);
    try {
      await callRestore(trashId);
      if (undoInfo?.trashId === trashId) setUndoInfo(null);
      setTrashItems((list) => list.filter((t) => t.trash_id !== trashId));
      setSelectedTrash((sel) => sel.filter((x) => x !== trashId));
      fetchHistory();
      return true;
    } catch (e: any) {
      Alert.alert("กู้คืนไม่สำเร็จ", e?.message || "กรุณาลองใหม่อีกครั้ง");
      return false;
    } finally {
      setRestoringId(null);
    }
  };

  // ♻️ กู้คืนจากหน้ารายละเอียด (เปิดมาจากถังขยะ) → สำเร็จแล้วปิดป๊อปอัป กลับหน้าประวัติที่มีรายการนี้แล้ว
  const restoreFromDetail = async () => {
    const tid = selectedItem?.__trash?.trash_id;
    if (!tid) return;
    const ok = await restoreReport(tid);
    if (ok) {
      setDetailModalVisible(false);
      setSelectedItem(null);
    }
  };

  // 👁️ ดูรายละเอียดรายงานในถังขยะ (เหมือนก่อนลบ · ดูอย่างเดียว)
  // iOS เปิด Modal ทับ Modal ไม่ได้ → ปิดถังขยะก่อน แล้วค่อยเปิดป๊อปอัปรายละเอียด
  const viewTrashItem = (t: any) => {
    if (!t?.row) return;
    setTrashVisible(false);
    setTimeout(() => {
      setSelectedItem({
        ...t.row,
        __trash: {
          trash_id: t.trash_id,
          deleted_at: t.deleted_at,
          deleted_by: t.deleted_by,
        },
      });
      setDetailModalVisible(true);
    }, 350);
  };

  // ปิดป๊อปอัปรายละเอียด — ถ้าเปิดมาจากถังขยะ ให้กลับไปที่ถังขยะ
  const closeDetail = () => {
    const fromTrash = !!selectedItem?.__trash;
    setDetailModalVisible(false);
    if (fromTrash) setTimeout(() => setTrashVisible(true), 350);
  };

  const fmtDeletedAt = (at?: string) => {
    if (!at) return "";
    const [d, t] = String(at).split(" ");
    return `${formatShortThaiDate(d)}${t ? " " + t.slice(0, 5) + " น." : ""}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Sales History</Text>
          <Text style={styles.headerSub}>ประวัติการทำงานของฉัน</Text>
        </View>

        {/* 🗑️ ถังขยะ (กู้คืนรายงานที่ลบ) */}
        <TouchableOpacity
          onPress={() => {
            setTrashVisible(true);
            fetchTrash();
          }}
          style={[styles.filterBtn, { marginRight: 8 }]}
        >
          <Ionicons name="trash-bin-outline" size={21} color="#333" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowFilter(!showFilter)}
          style={[
            styles.filterBtn,
            { marginLeft: 0 },
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
              fetchHistory();
            }}
          />
        }
      >
        {showFilter && (
          <View style={styles.filterSection}>
            <Text style={styles.sectionTitle}>ตัวกรองวันที่</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                onPress={() => openCustomDatePicker("start")}
                style={styles.dateInput}
              >
                <Text>
                  {startDate ? formatShortThaiDate(toYmdLocal(startDate)) : "เริ่ม"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => openCustomDatePicker("end")}
                style={styles.dateInput}
              >
                <Text>
                  {endDate ? formatShortThaiDate(toYmdLocal(endDate)) : "ถึง"}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.filterActions}>
              <TouchableOpacity onPress={fetchHistory} style={styles.searchBtn}>
                <Text style={{ color: "white", fontWeight: "bold" }}>
                  ค้นหา
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setStartDate(null);
                  setEndDate(null);
                  setFilterStatus("");
                  fetchHistory();
                }}
                style={styles.resetBtn}
              >
                <Ionicons name="refresh" size={20} color="#666" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ✅ KPI Cards */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kpiGrid}
        >
          <TouchableOpacity
            style={[
              styles.kpiCard,
              { borderLeftColor: "#64748b", minWidth: 120 },
              filterStatus !== "" && { opacity: 0.5 },
            ]}
            onPress={() => setFilterStatus("")}
          >
            <Text style={[styles.kpiLabel, { color: "#64748b" }]}>
              รายงานทั้งหมด
            </Text>
            <Text style={styles.kpiValue}>{summary.total}</Text>
          </TouchableOpacity>

          {/* ➕ ปรับการ์ดมูลค่าโครงการให้มีเป้าหมายและ Progress Bar */}
          <View
            style={[
              styles.kpiCard,
              { borderLeftColor: "#8b5cf6", minWidth: 180 },
            ]}
          >
            <Text style={[styles.kpiLabel, { color: "#8b5cf6" }]}>
              เป้าหมายในช่วงนี้
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text
                style={[styles.kpiValue, { color: "#1e293b", fontSize: 16 }]}
                numberOfLines={1}
              >
                ฿{summary.projectValue.toLocaleString()}
              </Text>
              <Text style={{ fontSize: 10, color: "#64748b", marginLeft: 4 }}>
                / {summary.target > 0 ? summary.target.toLocaleString() : "-"}
              </Text>
            </View>

            {(() => {
              const gPercent =
                summary.target > 0
                  ? (summary.projectValue / summary.target) * 100
                  : 0;
              const gCap = Math.min(gPercent, 100);
              const gColor = gPercent >= 100 ? SUCCESS_COLOR : WARNING_COLOR;
              const diff = summary.projectValue - summary.target;

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
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginTop: 3,
                    }}
                  >
                    <Text
                      style={{ fontSize: 9, color: gColor, fontWeight: "bold" }}
                    >
                      {gPercent.toFixed(1)}%
                    </Text>
                    {summary.target > 0 && (
                      <Text
                        style={{
                          fontSize: 9,
                          color: diff >= 0 ? SUCCESS_COLOR : DANGER_COLOR,
                          fontWeight: "bold",
                        }}
                      >
                        {diff >= 0
                          ? `+${diff.toLocaleString()}`
                          : `ขาด ${Math.abs(diff).toLocaleString()}`}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })()}
          </View>

          <View
            style={[
              styles.kpiCard,
              { borderLeftColor: DANGER_COLOR, minWidth: 120 },
            ]}
          >
            <Text style={[styles.kpiLabel, { color: DANGER_COLOR }]}>
              เบิกจ่ายรวม
            </Text>
            <Text
              style={[styles.kpiValue, { color: DANGER_COLOR, fontSize: 16 }]}
            >
              ฿{summary.expense.toLocaleString()}
            </Text>
          </View>
        </ScrollView>

        {/* ✅ Status Breakdown */}
        <View style={styles.statusGrid}>
          {kpiList.map((item, idx) => {
            const color = getStatusColor(item.status);
            const isSelected = filterStatus === item.status;
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => setFilterStatus(isSelected ? "" : item.status)}
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
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 15 }}>
          <Text style={styles.sectionHeader}>
            📋 รายการล่าสุด ({filteredList.length})
          </Text>
          {loading ? (
            <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          ) : (
            <FlatList
              data={filteredList}
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

      {/* Date Picker Modal */}
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
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={detailModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>รายละเอียด</Text>
              <TouchableOpacity onPress={closeDetail}>
                <Ionicons name="close" size={28} color="#999" />
              </TouchableOpacity>
            </View>
            {/* 🗑️ เปิดมาจากถังขยะ: ดูได้อย่างเดียว */}
            {selectedItem?.__trash && (
              <View style={styles.trashBanner}>
                <Ionicons name="trash" size={16} color="#b91c1c" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.trashBannerTitle}>
                    รายงานนี้อยู่ในถังขยะ
                  </Text>
                  <Text style={styles.trashBannerMeta}>
                    ลบเมื่อ {fmtDeletedAt(selectedItem.__trash.deleted_at)}
                    {selectedItem.__trash.deleted_by
                      ? ` โดย ${selectedItem.__trash.deleted_by}`
                      : ""}
                  </Text>
                </View>
                {/* ♻️ กู้คืนจากหน้านี้ได้เลย */}
                <TouchableOpacity
                  disabled={!!restoringId}
                  style={styles.restoreBtn}
                  onPress={restoreFromDetail}
                >
                  {restoringId === selectedItem.__trash.trash_id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={14} color="#fff" />
                      <Text style={styles.restoreBtnText}>กู้คืน</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
            <ScrollView>
              {(() => {
                // ✅ 1. ดึงข้อมูลล่าสุดจาก rawData โดยใช้ ID (เพื่อให้ค่าใช้จ่ายอัปเดตทันที)
                // ถ้าหาไม่เจอ ให้กันเหนียวด้วย selectedItem ตัวเดิม
                const currentItem =
                  rawData.find((item) => item.id === selectedItem?.id) ||
                  selectedItem;

                if (!currentItem) return null;

                // ✅ 2. เตรียมข้อมูลสำหรับแสดงผล (Split String)
                const customers = cleanSplit(currentItem.work_result);
                const projects = cleanSplit(currentItem.project_name);
                const statuses = cleanSplit(currentItem.job_status);
                const nextAppts = cleanSplit(currentItem.next_appointment);
                const summaries = newlineSplit(currentItem.activity_detail);
                const notes = newlineSplit(currentItem.additional_notes);

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

                // ✅ 3. ฟังก์ชันคำนวณยอดเงิน (รองรับ "1,200" และ "500, 300")
                const calcSum = (val: any) => {
                  if (!val) return 0;
                  return String(val)
                    .split(",")
                    .reduce(
                      (acc, curr) =>
                        acc + (parseFloat(curr.trim().replace(/,/g, "")) || 0),
                      0,
                    );
                };

                // ใช้ข้อมูลจาก currentItem (ตัวล่าสุด) มาคำนวณ
                const fuelTotal = calcSum(currentItem.fuel_cost);
                const hotelTotal = calcSum(currentItem.accommodation_cost);
                const otherTotal = calcSum(currentItem.other_cost);
                const grandTotal =
                  parseFloat(
                    String(currentItem.total_expense).replace(/,/g, ""),
                  ) || 0;

                return (
                  <>
                    {/* --- Header ข้อมูลทั่วไป --- */}
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>ผู้รายงาน:</Text>
                      <Text style={styles.detailValue}>
                        {currentItem.reporter_name}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>วันที่:</Text>
                      <Text style={styles.detailValue}>
                        {formatShortThaiDate(currentItem.report_date)}
                      </Text>
                    </View>

                    <View style={styles.divider} />

                    {/* --- รายการงาน (Jobs) --- */}
                    <Text
                      style={{
                        fontWeight: "bold",
                        marginBottom: 10,
                        fontSize: 15,
                      }}
                    >
                      💼 รายการงาน:
                    </Text>
                    {validJobs.map((job, i) => {
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
                              <Text style={{ fontSize: 12, color: "#334155" }}>
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
                              <Text style={{ fontSize: 12, color: "#7c2d12" }}>
                                {job.note}
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}

                    <View style={styles.divider} />

                    {/* --- 💸 ส่วนแสดงค่าใช้จ่าย (จุดที่แก้ไขให้อัปเดตทันที) --- */}
                    <Text style={styles.detailSectionTitle}>
                      💸 รายละเอียดค่าใช้จ่าย
                    </Text>
                    {/* แต่ละหมวด: ยอดเงิน + หลักฐานเป็นรูปจริงของหมวดนั้น (แบบเดียวกับหน้าภาพรวมฝ่ายขาย) */}
                    <View style={styles.expCatBox}>
                      {(() => {
                        const docs = parseExpenseDocs(currentItem);
                        const fuelSlips = splitFiles(currentItem.fuel_receipt);
                        return [
                          {
                            cat: "fuel",
                            label: "น้ำมัน",
                            icon: "flame-outline",
                            val: fuelTotal,
                            color: "#c2410c",
                            slips: fuelSlips.map((f, i) => ({
                              file: f,
                              label: fuelSlips.length > 1 ? `สลิป ${i + 1}` : "สลิป",
                            })),
                          },
                          {
                            cat: "hotel",
                            label: "ที่พัก",
                            icon: "bed-outline",
                            val: hotelTotal,
                            color: "#1d4ed8",
                            slips: splitFiles(currentItem.accommodation_receipt).map((f) => ({
                              file: f,
                              label: "สลิป",
                            })),
                          },
                          {
                            cat: "other",
                            label: `อื่นๆ (${currentItem.other_cost_detail || "-"})`,
                            icon: "receipt-outline",
                            val: otherTotal,
                            color: "#a16207",
                            slips: splitFiles(currentItem.other_receipt).map((f) => ({
                              file: f,
                              label: "สลิป",
                            })),
                          },
                        ].map((row) => {
                          const evidence = [
                            ...row.slips,
                            ...docs
                              .filter((d) => d.cat === row.cat)
                              .map((d) => ({
                                file: d.file,
                                label: DOC_LABEL[d.type] || "เอกสาร",
                              })),
                          ];
                          return (
                            <View key={row.cat} style={styles.expCatBlock}>
                              <View style={styles.expCatRow}>
                                <View style={styles.expCatLabelWrap}>
                                  <Ionicons
                                    name={row.icon as any}
                                    size={16}
                                    color="#64748b"
                                  />
                                  <Text style={styles.expCatLabel}>{row.label}</Text>
                                </View>
                                <Text style={styles.expCatVal}>
                                  {row.val.toLocaleString()} ฿
                                </Text>
                              </View>
                              {evidence.length > 0 && (
                                <View style={styles.evThumbRow}>
                                  {evidence.map((ev, i) => {
                                    const isPdf = /\.pdf$/i.test(ev.file);
                                    return (
                                      <View key={ev.file + i} style={styles.evThumbWrap}>
                                        <TouchableOpacity
                                          activeOpacity={0.8}
                                          onPress={() => openImage(ev.file)}
                                          style={[styles.evThumb, { borderColor: row.color }]}
                                        >
                                          {isPdf ? (
                                            <View style={styles.evThumbPdf}>
                                              <FontAwesome5
                                                name="file-pdf"
                                                size={20}
                                                color={row.color}
                                              />
                                            </View>
                                          ) : (
                                            <Image
                                              source={{ uri: imageUrl(ev.file) }}
                                              style={styles.evThumbImg}
                                            />
                                          )}
                                        </TouchableOpacity>
                                        <Text
                                          style={[styles.evThumbLabel, { color: row.color }]}
                                          numberOfLines={1}
                                        >
                                          {ev.label}
                                        </Text>
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                            </View>
                          );
                        });
                      })()}
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
                        {grandTotal.toLocaleString()} ฿
                      </Text>
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

      <Modal visible={expenseModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "90%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>💸 เบิกค่าใช้จ่าย</Text>
              <TouchableOpacity onPress={() => setExpenseModalVisible(false)}>
                <Ionicons name="close" size={28} color="#999" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
              {/* 1. ค่าน้ำมัน (Dynamic) */}
              <Text style={styles.inputLabel}>⛽ ค่าน้ำมัน</Text>
              {fuelList.map((item, index) => (
                <View key={index} style={styles.expenseRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.inputGroup}>
                      <Text style={{ marginRight: 5 }}>฿</Text>
                      <TextInput
                        style={styles.moneyInput}
                        placeholder="ระบุจำนวนเงิน"
                        keyboardType="numeric"
                        value={item.amount}
                        onChangeText={(t) => updateFuelAmount(t, index)}
                      />
                    </View>
                    {/* ปุ่มแนบไฟล์ */}
                    <TouchableOpacity
                      onPress={() => handleAttachment("fuel", index)}
                      style={[
                        styles.attachBtn,
                        item.file && styles.attachBtnActive,
                      ]}
                    >
                      <Ionicons
                        name={item.file ? "document-text" : "camera"}
                        size={16}
                        color={item.file ? "white" : "#666"}
                      />
                      <Text
                        style={[
                          styles.attachText,
                          item.file && { color: "white" },
                        ]}
                      >
                        {item.file ? "แนบแล้ว" : "แนบหลักฐาน"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {fuelList.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeFuelRow(index)}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="trash" size={18} color="white" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity onPress={addFuelRow} style={styles.addMoreBtn}>
                <Ionicons name="add-circle" size={18} color={PRIMARY_COLOR} />
                <Text style={{ color: PRIMARY_COLOR, fontWeight: "bold" }}>
                  {" "}
                  เพิ่มรายการน้ำมัน
                </Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              {/* 2. ค่าที่พัก */}
              <Text style={styles.inputLabel}>🏨 ค่าที่พัก</Text>
              <View style={styles.expenseRow}>
                <View style={styles.inputGroup}>
                  <Text style={{ marginRight: 5 }}>฿</Text>
                  <TextInput
                    style={styles.moneyInput}
                    placeholder="ระบุจำนวนเงิน"
                    keyboardType="numeric"
                    value={hotelCost.amount}
                    onChangeText={(t) =>
                      setHotelCost((prev) => ({ ...prev, amount: t }))
                    }
                  />
                </View>
                <TouchableOpacity
                  onPress={() => handleAttachment("hotel")}
                  style={[
                    styles.attachBtn,
                    hotelCost.file && styles.attachBtnActive,
                  ]}
                >
                  <Ionicons
                    name={hotelCost.file ? "document-text" : "camera"}
                    size={20}
                    color={hotelCost.file ? "white" : "#666"}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              {/* 3. ค่าอื่นๆ */}
              <Text style={styles.inputLabel}>🧾 ค่าอื่นๆ</Text>
              <View style={{ gap: 10 }}>
                <TextInput
                  style={styles.textInput}
                  placeholder="รายละเอียด (เช่น ค่าทางด่วน)"
                  value={otherCost.detail}
                  onChangeText={(t) =>
                    setOtherCost((prev) => ({ ...prev, detail: t }))
                  }
                />
                <View style={styles.expenseRow}>
                  <View style={styles.inputGroup}>
                    <Text style={{ marginRight: 5 }}>฿</Text>
                    <TextInput
                      style={styles.moneyInput}
                      placeholder="ระบุจำนวนเงิน"
                      keyboardType="numeric"
                      value={otherCost.amount}
                      onChangeText={(t) =>
                        setOtherCost((prev) => ({ ...prev, amount: t }))
                      }
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => handleAttachment("other")}
                    style={[
                      styles.attachBtn,
                      otherCost.file && styles.attachBtnActive,
                    ]}
                  >
                    <Ionicons
                      name={otherCost.file ? "document-text" : "camera"}
                      size={20}
                      color={otherCost.file ? "white" : "#666"}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* ปุ่มบันทึก */}
              <TouchableOpacity
                onPress={submitExpenseForm}
                style={styles.submitBtn}
                disabled={submittingExpense}
              >
                {submittingExpense ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>ยืนยันการเบิก</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 🗑️ ยืนยันการลบรายงาน */}
      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.delOverlay}
          onPress={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        >
          <TouchableOpacity activeOpacity={1} style={styles.delBox}>
            <View style={styles.delIcon}>
              <Ionicons name="trash" size={30} color={DANGER_COLOR} />
            </View>
            <Text style={styles.delTitle}>ยืนยันการลบรายงาน</Text>
            <Text style={styles.delMsg}>
              ต้องการลบรายงาน{" "}
              <Text style={{ fontWeight: "800", color: "#1e293b" }}>
                {reportLabel(deleteTarget)}
              </Text>{" "}
              ใช่หรือไม่?
            </Text>
            <View style={styles.delNote}>
              <Ionicons name="information-circle" size={15} color="#0369a1" />
              <Text style={styles.delNoteText}>
                รายงานจะถูกย้ายไปที่ถังขยะ กู้คืนได้ภายหลังจากปุ่มถังขยะด้านบน
              </Text>
            </View>
            <View style={styles.delBtns}>
              <TouchableOpacity
                disabled={deleting}
                style={[styles.delBtn, { backgroundColor: "#f1f5f9" }]}
                onPress={() => setDeleteTarget(null)}
              >
                <Text style={{ fontWeight: "700", color: "#475569" }}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={deleting}
                style={[styles.delBtn, { backgroundColor: DANGER_COLOR }]}
                onPress={doDeleteReport}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="trash" size={15} color="#fff" />
                    <Text style={{ fontWeight: "800", color: "#fff" }}>ลบรายงาน</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ♻️ ถังขยะ: รายงานที่ลบ กดกู้คืนได้ */}
      <Modal
        visible={trashVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTrashVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.trashSheet]}>
            <View style={styles.trashHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>ถังขยะ</Text>
                <Text style={{ fontSize: 12, color: "#64748b" }}>
                  ติ๊กเลือกรายการ หรือกด "กู้คืน" ทีละรายการ
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTrashVisible(false)}>
                <Ionicons name="close-circle" size={30} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {trashLoading ? (
              <ActivityIndicator
                size="large"
                color={PRIMARY_COLOR}
                style={{ marginVertical: 30 }}
              />
            ) : trashItems.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 36 }}>
                <Ionicons name="trash-bin-outline" size={40} color="#cbd5e1" />
                <Text style={{ color: "#94a3b8", marginTop: 8 }}>
                  ไม่มีรายงานในถังขยะ
                </Text>
              </View>
            ) : (
              <>
              {/* ☑️ เลือกทั้งหมด */}
              {(() => {
                const allOn =
                  trashItems.length > 0 &&
                  selectedTrash.length === trashItems.length;
                return (
                  <TouchableOpacity
                    disabled={bulkRestoring}
                    style={styles.trashSelectAll}
                    onPress={() =>
                      setSelectedTrash(
                        allOn ? [] : trashItems.map((t) => t.trash_id),
                      )
                    }
                  >
                    <Ionicons
                      name={allOn ? "checkbox" : "square-outline"}
                      size={22}
                      color={allOn ? SUCCESS_COLOR : "#94a3b8"}
                    />
                    <Text style={styles.trashSelectAllText}>
                      เลือกทั้งหมด ({trashItems.length})
                    </Text>
                    {selectedTrash.length > 0 && (
                      <Text style={styles.trashSelectedCount}>
                        เลือกแล้ว {selectedTrash.length}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })()}
              <FlatList
                data={trashItems}
                keyExtractor={(t) => String(t.trash_id)}
                contentContainerStyle={{ paddingBottom: 20, gap: 10 }}
                renderItem={({ item: t }) => {
                  const restoring = restoringId === t.trash_id;
                  const checked = selectedTrash.includes(t.trash_id);
                  return (
                    <View
                      style={[styles.trashItem, checked && styles.trashItemChecked]}
                    >
                      {/* ☑️ ติ๊กเลือก */}
                      <TouchableOpacity
                        disabled={bulkRestoring}
                        onPress={() => toggleTrashSelect(t.trash_id)}
                        hitSlop={8}
                        style={{ paddingRight: 10 }}
                      >
                        <Ionicons
                          name={checked ? "checkbox" : "square-outline"}
                          size={24}
                          color={checked ? SUCCESS_COLOR : "#94a3b8"}
                        />
                      </TouchableOpacity>
                      {/* แตะเพื่อดูรายละเอียดเหมือนก่อนลบ */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={{ flex: 1, paddingRight: 10 }}
                        onPress={() => viewTrashItem(t)}
                      >
                        <Text style={styles.trashDate}>
                          {formatShortThaiDate(t.report_date)}
                          {Number(t.total_expense) > 0
                            ? `  ·  เบิก ${Number(t.total_expense).toLocaleString()} ฿`
                            : ""}
                        </Text>
                        <Text style={styles.trashCustomer} numberOfLines={2}>
                          {cleanSplit(t.work_result).join(", ") || "-"}
                        </Text>
                        <Text style={styles.trashMeta} numberOfLines={1}>
                          ลบเมื่อ {fmtDeletedAt(t.deleted_at)}
                          {t.deleted_by ? ` โดย ${t.deleted_by}` : ""}
                        </Text>
                        <Text style={styles.trashViewLink}>
                          <Ionicons name="eye-outline" size={12} /> ดูรายละเอียด
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={!!restoringId || bulkRestoring}
                        style={[
                          styles.restoreBtn,
                          (bulkRestoring || (!!restoringId && !restoring)) && {
                            opacity: 0.4,
                          },
                        ]}
                        onPress={() => restoreReport(t.trash_id)}
                      >
                        {restoring ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="refresh" size={14} color="#fff" />
                            <Text style={styles.restoreBtnText}>กู้คืน</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />

              {/* ♻️ กู้คืนรายการที่เลือก */}
              {selectedTrash.length > 0 && (
                <TouchableOpacity
                  disabled={bulkRestoring}
                  style={styles.bulkRestoreBtn}
                  onPress={restoreSelected}
                >
                  {bulkRestoring ? (
                    <>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={styles.bulkRestoreText}>กำลังกู้คืน...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="refresh" size={18} color="#fff" />
                      <Text style={styles.bulkRestoreText}>
                        กู้คืนที่เลือก ({selectedTrash.length})
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ✏️ แก้ไขรายงานในหน้านี้เลย (ฟอร์มเดียวกับหน้าเขียนรายงาน) — บันทึกแล้วปิดและโหลดรายการใหม่ */}
      <Modal
        visible={!!editTarget}
        animationType="slide"
        onRequestClose={() => setEditTarget(null)}
      >
        {/* Modal บน Android ไม่ได้ inset ขอบจอเอง → ครอบ SafeAreaProvider ใหม่ให้คำนวณใหม่ */}
        <SafeAreaProvider>
          {editTarget && (
            <WriteReportScreen
              key={String(editTarget.id)}
              editId={editTarget.id}
              editData={JSON.stringify(editTarget)}
              onClose={(saved) => {
                setEditTarget(null);
                if (saved) fetchHistory();
              }}
            />
          )}
        </SafeAreaProvider>
      </Modal>

      {/* ↩️ แถบ "ลบแล้ว · เลิกทำ" หลังลบ (หายเองใน 7 วินาที) */}
      {undoInfo && (
        <View style={styles.undoBar}>
          <Ionicons name="trash" size={16} color="#fca5a5" />
          <Text style={styles.undoText} numberOfLines={1}>
            ลบแล้ว: {undoInfo.label}
          </Text>
          <TouchableOpacity
            disabled={!!restoringId}
            onPress={() => restoreReport(undoInfo.trashId)}
            style={styles.undoBtn}
          >
            {restoringId === undoInfo.trashId ? (
              <ActivityIndicator color="#93c5fd" size="small" />
            ) : (
              <Text style={styles.undoBtnText}>เลิกทำ</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
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
  filterSection: {
    backgroundColor: "#fff",
    padding: 15,
    margin: 15,
    borderRadius: 16,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 14,
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
  dateRow: { flexDirection: "row", gap: 15, marginBottom: 20 },
  dateInput: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    alignItems: "center",
  },
  filterActions: { flexDirection: "row", gap: 10 },
  searchBtn: {
    flex: 1,
    backgroundColor: PRIMARY_COLOR,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  resetBtn: {
    width: 50,
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiGrid: { flexDirection: "row", gap: 10, padding: 15 },
  kpiCard: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    elevation: 2,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#64748b",
    marginBottom: 4,
  },
  kpiValue: { fontSize: 13, fontWeight: "800" },
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
  sectionHeader: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
    marginTop: 10,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 15,
    borderLeftWidth: 5,
    elevation: 3,
    marginHorizontal: 15,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  cardBody: { padding: 12 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 10,
  },
  tableHead: { fontSize: 10, color: "#94a3b8", fontWeight: "bold" },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 6,
    marginBottom: 6,
  },
  customerLinkTable: { color: PRIMARY_COLOR, fontWeight: "bold", fontSize: 12 },
  projectTextTable: { fontSize: 12, color: "#333", marginTop: 2 },
  statusBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: "center",
  },
  projectValueText: { fontSize: 11, color: SUCCESS_COLOR, fontWeight: "800" },
  dateText: { fontSize: 11, fontWeight: "bold", color: "#475569" },
  reporterName: { fontSize: 12, color: "#64748b" },
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
  expenseText: { color: DANGER_COLOR, fontWeight: "bold", fontSize: 14 },
  evIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  viewBtn: {
    padding: 6,
    backgroundColor: "#eff6ff", // เปลี่ยนสีพื้นหลังนิดหน่อยให้แยกกับปุ่มเบิกชัดเจน
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
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
    borderRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 10,
    marginBottom: 15,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold" },

  // ===== 🗑️ ลบ / ♻️ กู้คืน =====
  deleteBtn: {
    backgroundColor: DANGER_COLOR,
    paddingHorizontal: 9,
  },
  delOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "center",
    padding: 28,
  },
  delBox: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
  },
  delIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  delTitle: { fontSize: 17, fontWeight: "800", color: "#1e293b", marginBottom: 6 },
  delMsg: { fontSize: 14, color: "#475569", textAlign: "center", lineHeight: 21 },
  delNote: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    backgroundColor: "#f0f9ff",
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    alignSelf: "stretch",
  },
  delNoteText: { flex: 1, fontSize: 12, color: "#0369a1", lineHeight: 18 },
  delBtns: { flexDirection: "row", gap: 10, marginTop: 16, alignSelf: "stretch" },
  delBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  trashSheet: { width: "94%", maxHeight: "85%" },
  trashHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 10,
  },
  trashItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  trashDate: { fontSize: 12, fontWeight: "700", color: "#334155" },
  trashCustomer: { fontSize: 14, fontWeight: "700", color: PRIMARY_COLOR, marginTop: 2 },
  trashMeta: { fontSize: 11, color: "#94a3b8", marginTop: 3 },
  trashItemChecked: { borderColor: SUCCESS_COLOR, backgroundColor: "#ecfdf5" },
  trashSelectAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  trashSelectAllText: { fontSize: 14, fontWeight: "700", color: "#334155" },
  trashSelectedCount: {
    marginLeft: "auto",
    fontSize: 12,
    fontWeight: "700",
    color: SUCCESS_COLOR,
  },
  bulkRestoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: SUCCESS_COLOR,
    height: 48,
    borderRadius: 14,
    marginTop: 6,
  },
  bulkRestoreText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  trashViewLink: { fontSize: 12, color: PRIMARY_COLOR, fontWeight: "700", marginTop: 4 },
  trashBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  trashBannerTitle: { fontSize: 13, fontWeight: "800", color: "#b91c1c" },
  trashBannerMeta: { fontSize: 11, color: "#991b1b", marginTop: 1 },
  restoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: SUCCESS_COLOR,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
    minWidth: 82,
    justifyContent: "center",
  },
  restoreBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  undoBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1e293b",
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  undoText: { flex: 1, color: "#e2e8f0", fontSize: 13 },
  undoBtn: { paddingHorizontal: 14, height: 36, justifyContent: "center" },
  undoBtnText: { color: "#93c5fd", fontWeight: "800", fontSize: 14 },
  detailRow: { flexDirection: "row", marginBottom: 6 },
  detailLabel: { width: 90, fontSize: 11, color: "#64748b", fontWeight: "600" },
  detailValue: { flex: 1, fontSize: 12, color: "#333" },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  costGrid: { flexDirection: "row", gap: 10, marginBottom: 10 },
  // ===== 💸 ค่าใช้จ่ายรายหมวด + 📸 รูปหลักฐาน =====
  expCatBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
  },
  expCatBlock: {
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
    paddingVertical: 8,
  },
  expCatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  expCatLabelWrap: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  expCatLabel: { fontSize: 13, color: "#64748b", flexShrink: 1 },
  expCatVal: { fontSize: 13, fontWeight: "600", color: "#333" },
  evThumbRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingLeft: 24,
    paddingTop: 8,
  },
  evThumbWrap: { width: 60, alignItems: "center" },
  evThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: "hidden",
    backgroundColor: "#eef2f7",
  },
  evThumbImg: { width: "100%", height: "100%" },
  evThumbPdf: { flex: 1, alignItems: "center", justifyContent: "center" },
  evThumbLabel: { fontSize: 9, marginTop: 2, fontWeight: "600" },
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
  historyItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  calHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 15,
    backgroundColor: PRIMARY_COLOR,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
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
    height: 35,
    justifyContent: "center",
    alignItems: "center",
  },
  calDayText: { fontSize: 14 },
  calDayEmpty: { width: "14.28%", height: 35 },
  calDaySelected: { backgroundColor: PRIMARY_COLOR, borderRadius: 17.5 },
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
  jobRow: {
    flexDirection: "row",
    paddingVertical: 8,
    alignItems: "flex-start",
  },
  jobRowDivider: { borderTopWidth: 1, borderTopColor: "#f8fafc" },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 12 },

  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  inputGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f9f9f9",
  },
  moneyInput: { flex: 1, paddingVertical: 10, fontSize: 16 },
  textInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f9f9f9",
    fontSize: 14,
  },

  attachBtn: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#eee",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    minWidth: 44,
  },
  attachBtnActive: { backgroundColor: SUCCESS_COLOR },
  attachText: { fontSize: 10, color: "#666" },

  removeBtn: {
    backgroundColor: DANGER_COLOR,
    padding: 12,
    borderRadius: 8,
    justifyContent: "center",
  },
  addMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    marginBottom: 10,
  },

  submitBtn: {
    backgroundColor: PRIMARY_COLOR,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
  submitBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },
  withdrawBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fefce8",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#facc15",
  },
  withdrawTextSmall: {
    fontSize: 10,
    color: "#b45309",
    fontWeight: "bold",
  },
});
