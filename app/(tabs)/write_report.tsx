import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_BASE } from "../../constants/config";
import { useAuth } from "../_layout";

const REGIONS = [
  "อุบล",
  "ภาคอีสาน",
  "ภาคเหนือ",
  "ภาคกลาง",
  "ภาคใต้",
  "ภาคตะวันออก",
  "ภาคตะวันตก",
];
const PRIMARY_COLOR = "#004aad";
const SECONDARY_COLOR = "#3b82f6";
const COLORS = {
  primary: "#004aad",
  blue: "#3b82f6",
  emerald: "#10b981",
  red: "#ef4444",
  slate: "#64748b",
  orange: "#f59e0b",
};

// ✅ เพิ่ม type นี้ก่อน export default WriteReportScreen
interface WorkBox {
  id: number;
  customer: string;
  project: string;
  value: string;
  type: string;
  status: string;
  summary: string;
  notes: string;
  filteredCustomers: string[];
  showSuggestions: boolean;
  biddingMembers: string[]; // ✅ NEW
}

export default function WriteReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); // ➕ เพิ่มบรรทัดนี้
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  // ✅ เพิ่มต่อจาก const [loading, setLoading] = useState(false);
  const [teamType, setTeamType] = useState<"marketing" | "bidding">(
    "marketing",
  );
  const [biddingTeamName, setBiddingTeamName] = useState("");
  const [employeesList, setEmployeesList] = useState<string[]>([]);
  const [biddingModalVisible, setBiddingModalVisible] = useState(false);
  const [biddingModalBoxId, setBiddingModalBoxId] = useState<number | null>(
    null,
  );
  const [biddingSearch, setBiddingSearch] = useState("");
  const [biddingTeamsList, setBiddingTeamsList] = useState<string[]>([]);
  const [lastBiddingTeam, setLastBiddingTeam] = useState("");
  const [teamPickerVisible, setTeamPickerVisible] = useState(false);
  const [newTeamInput, setNewTeamInput] = useState("");

  // --- Data Lists ---
  const [statusList, setStatusList] = useState<string[]>([]);
  const [customerList, setCustomerList] = useState<string[]>([]);
  const [masterCustomerList, setMasterCustomerList] = useState<string[]>([]);

  // --- Form Header Data ---
  const [reportDate, setReportDate] = useState(new Date());
  const [workType, setWorkType] = useState("outside");
  const [locationInfo, setLocationInfo] = useState({
    area: "",
    province: "",
    gps: "",
    address: "",
  });

  // ✅ แก้ useState ของ workBoxes เดิม เพิ่มแค่บรรทัด biddingMembers: []
  const [workBoxes, setWorkBoxes] = useState<WorkBox[]>([
    {
      id: Date.now(),
      customer: "",
      project: "",
      value: "",
      type: "ลูกค้าใหม่",
      status: "",
      summary: "",
      notes: "",
      filteredCustomers: [],
      showSuggestions: false,
      biddingMembers: [], // ✅ NEW
    },
  ]);

  // 💰 2. ส่วนค่าใช้จ่าย
  const [expenses, setExpenses] = useState({
    fuel: {
      enabled: false,
      items: [{ cost: "", image: null as string | null }],
    },
    hotel: { enabled: false, cost: "", image: null as string | null },
    other: {
      enabled: false,
      cost: "",
      detail: "",
      image: null as string | null,
    },
  });

  const [problem, setProblem] = useState("");
  const [suggestion, setSuggestion] = useState("");

  // --- UI States ---
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorConfig, setSelectorConfig] = useState({
    title: "",
    data: [] as string[],
    field: "" as any,
    boxId: 0,
  });

  useEffect(() => {
    const loadInitialData = async () => {
      // 1. ดึงสถานะงาน
      try {
        const statRes = await axios.get(`${API_BASE}/api_mobile.php?action=get_job_status`);
        let statusArray = statRes.data?.data || statRes.data?.result || statRes.data;

        if (!Array.isArray(statusArray) || statusArray.length === 0) {
          statusArray = ["เสนอราคา", "กำลังติดตาม", "ได้งาน/เซ็นสัญญา", "เสียงาน", "เข้าพบครั้งแรก"];
        }
        const formattedStatusList = statusArray.map((item: any) =>
          typeof item === "object" && item !== null ? (item.status_name || item.name || item.status) : String(item)
        );
        setStatusList(formattedStatusList);
      } catch (e: any) {
        console.log("❌ Error get_job_status:", e.response?.data || e.message);
        setStatusList(["เสนอราคา", "กำลังติดตาม", "ได้งาน/เซ็นสัญญา", "เสียงาน", "เข้าพบครั้งแรก"]); // ใส่ค่า Default กันเหนียว
      }

      // 2. ดึงลูกค้า
      try {
        const custRes = await axios.get(`${API_BASE}/api_mobile.php?action=get_customers&fullname=${user?.fullname}`);
        if (custRes.data.status === "success") {
          const planCus = custRes.data.plan_customers || [];
          setCustomerList(planCus);
          setMasterCustomerList(custRes.data.master_customers || []);
          setWorkBoxes((prev) => prev.map((b, i) => i === 0 ? { ...b, filteredCustomers: planCus } : b));
        }
      } catch (e: any) {
        console.log("❌ Error get_customers:", e.response?.data || e.message);
      }

      // 3. ดึงข้อมูลพนักงาน
      try {
        const empRes = await axios.get(`${API_BASE}/api_mobile.php?action=get_service_initial_data`);
        if (empRes.data?.status === "success" && empRes.data?.data?.users) {
          setEmployeesList(empRes.data.data.users);
        }
      } catch (e: any) {
        console.log("❌ Error get_service_initial_data:", e.response?.data || e.message);
      }

      // 4. ดึงทีมประมูล
      try {
        const teamsRes = await axios.get(`${API_BASE}/api_mobile.php?action=get_bidding_teams&fullname=${user?.fullname}`);
        if (teamsRes.data?.status === "success") {
          setBiddingTeamsList(teamsRes.data.teams || []);
          const last = teamsRes.data.last_team || "";
          setLastBiddingTeam(last);
          if (last) setBiddingTeamName(last);
        }
      } catch (e: any) {
        console.log("❌ Error get_bidding_teams:", e.response?.data || e.message);
      }
    };

    loadInitialData();
  }, [user]);

  // ➕ [เพิ่มใหม่] useEffect สำหรับจับข้อมูลเมื่อมีการแก้ไข (Edit Mode)
  useEffect(() => {
    if (params?.edit_data) {
      try {
        const editData = JSON.parse(params.edit_data as string);

        // 1. เซ็ตข้อมูล Header
        setReportDate(new Date(editData.report_date));
        if (editData.gps === "Office") {
          setWorkType("company");
        } else {
          setWorkType("outside");
          setLocationInfo({
            area: editData.area || "",
            province: editData.province || "",
            gps: editData.gps || "",
            address: editData.gps_address || "",
          });
        }

        // 2. เซ็ตข้อมูลทีม
        setTeamType(editData.team_type === "bidding" ? "bidding" : "marketing");
        if (editData.bidding_team_name) {
          setBiddingTeamName(editData.bidding_team_name);
        }

        // 3. แกะข้อมูล WorkBoxes (Array)
        const customers = (editData.work_result || "")
          .split(",")
          .map((s: string) => s.trim());
        const projects = (editData.project_name || "")
          .split(",")
          .map((s: string) => s.trim());
        const statuses = (editData.job_status || "")
          .split(",")
          .map((s: string) => s.trim());
        const rawSummaries = (editData.activity_detail || "").split("\n");
        const rawNotes = (editData.additional_notes || "").split("\n");

        const parsedBoxes: WorkBox[] = [];
        for (let i = 0; i < customers.length; i++) {
          if (!customers[i]) continue;

          // แยกมูลค่าและชื่อโครงการ
          const match = projects[i]?.match(/มูลค่า\s*[:\s]?\s*([\d,.]+)/i);
          const pjVal = match ? match[1] : "";
          let pjName =
            projects[i]
              ?.replace(/[\(-]?\s*มูลค่า\s*[:\s]?\s*[\d,.]+(\s*บาท)?\)?/gi, "")
              .trim() || "";
          if (pjName === "-") pjName = "";

          // แยกข้อมูลลูกทีมออกจาก Summary (Pattern: • ลูกค้า [ทีม: A, B]: รายละเอียด)
          let sumLine = rawSummaries[i] || "";
          const teamMatch = sumLine.match(/\[ทีม:\s*(.+?)\]/);
          const bMembers = teamMatch
            ? teamMatch[1].split(",").map((m: any) => m.trim())
            : [];
          let cleanSum = sumLine
            .replace(/\[ทีม:\s*(.+?)\]/, "")
            .replace(/^[•\-\d].*?:\s*/, "")
            .trim();

          let noteLine = rawNotes[i] || "";
          let cleanNote = noteLine.replace(/^\(.*\):\s*/, "").trim();

          parsedBoxes.push({
            id: Date.now() + i,
            customer: customers[i],
            project: pjName,
            value: pjVal,
            type: "ลูกค้าเก่า", // จะอัปเดตเองถ้ามีข้อมูลใน masterCustomerList
            status: statuses[i] || "",
            summary: cleanSum,
            notes: cleanNote,
            filteredCustomers: [],
            showSuggestions: false,
            biddingMembers: bMembers,
          });
        }
        if (parsedBoxes.length > 0) setWorkBoxes(parsedBoxes);

        // 4. เซ็ตค่าใช้จ่าย
        // 4. เซ็ตค่าใช้จ่าย (แก้ไขตรงนี้)
        const rawFuelCosts = editData.fuel_cost
          ? String(editData.fuel_cost).split(",")
          : [];
        const rawFuelReceipts = editData.fuel_receipt
          ? String(editData.fuel_receipt).split(",")
          : [];

        // สร้าง array ของ items ใหม่จากข้อมูลที่ได้
        const fuelItems = rawFuelCosts.map((cost, idx) => ({
          cost: cost.trim(),
          image: rawFuelReceipts[idx] ? rawFuelReceipts[idx].trim() : null,
        }));

        setExpenses({
          fuel: {
            enabled: rawFuelCosts.length > 0 && rawFuelCosts[0] !== "",
            items:
              fuelItems.length > 0 ? fuelItems : [{ cost: "", image: null }],
          },
          hotel: {
            enabled:
              parseFloat(editData.accommodation_cost || 0) > 0 ||
              !!editData.accommodation_receipt,
            cost: editData.accommodation_cost || "",
            image: editData.accommodation_receipt || null,
          },
          other: {
            enabled:
              parseFloat(editData.other_cost || 0) > 0 ||
              !!editData.other_receipt,
            cost: editData.other_cost || "",
            detail: editData.other_cost_detail || "",
            image: editData.other_receipt || null,
          },
        });

        setProblem(editData.problem || "");
        setSuggestion(editData.suggestion || "");
      } catch (e) {
        console.log("Parse Edit Data Error", e);
      }
    }
  }, [params?.edit_data]);

  // --- 🔢 Helper: ฟังก์ชันใส่ลูกน้ำ (Comma) ---
  const formatCurrency = (amount: string) => {
    // 1. ลบทุกอย่างที่ไม่ใช่ตัวเลขและจุด
    let value = amount.replace(/[^0-9.]/g, "");

    // 2. ป้องกันการใส่จุดเกิน 1 ตัว
    const parts = value.split(".");
    if (parts.length > 2) {
      value = parts[0] + "." + parts.slice(1).join("");
    }

    // 3. ใส่คอมม่าที่หลักพัน (เฉพาะส่วนจำนวนเต็ม)
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    return parts.join(".");
  };

  // ✅ ใน addWorkBox เพิ่มแค่บรรทัด biddingMembers: []
  const addWorkBox = () => {
    setWorkBoxes([
      ...workBoxes,
      {
        id: Date.now(),
        customer: "",
        project: "",
        value: "",
        type: "ลูกค้าใหม่",
        status: "",
        summary: "",
        notes: "",
        filteredCustomers: customerList,
        showSuggestions: false,
        biddingMembers: [], // ✅ NEW
      },
    ]);
  };

  const removeWorkBox = (id: number) => {
    if (workBoxes.length > 1)
      setWorkBoxes(workBoxes.filter((b) => b.id !== id));
  };

  const updateWorkBox = (id: number, field: string, value: any) => {
    setWorkBoxes(
      workBoxes.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    );
  };

  const selectCustomer = (boxId: number, name: string) => {
    const isExisting = masterCustomerList.some(
      (c) => c.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    setWorkBoxes(
      workBoxes.map((b) =>
        b.id === boxId
          ? {
            ...b,
            customer: name,
            showSuggestions: false,
            type: isExisting ? "ลูกค้าเก่า" : "ลูกค้าใหม่",
          }
          : b,
      ),
    );
    Keyboard.dismiss();
  };

  const handleCustomerInput = (id: number, text: string) => {
    const filtered =
      text.trim() === ""
        ? customerList
        : customerList.filter((c) =>
          c.toLowerCase().includes(text.toLowerCase()),
        );

    const isExisting = masterCustomerList.some(
      (c) => c.trim().toLowerCase() === text.trim().toLowerCase(),
    );

    setWorkBoxes(
      workBoxes.map((b) =>
        b.id === id
          ? {
            ...b,
            customer: text,
            filteredCustomers: filtered,
            showSuggestions: true,
            type: isExisting ? "ลูกค้าเก่า" : "ลูกค้าใหม่",
          }
          : b,
      ),
    );
  };

  // ✅ เพิ่มต่อจาก handleCustomerInput

  const openBiddingModal = (boxId: number) => {
    setBiddingModalBoxId(boxId);
    setBiddingSearch("");
    setBiddingModalVisible(true);
  };

  const toggleBiddingMember = (boxId: number, name: string) => {
    setWorkBoxes(
      workBoxes.map((b) => {
        if (b.id !== boxId) return b;
        const already = b.biddingMembers.includes(name);
        return {
          ...b,
          biddingMembers: already
            ? b.biddingMembers.filter((m) => m !== name)
            : [...b.biddingMembers, name],
        };
      }),
    );
  };

  const removeBiddingMember = (boxId: number, name: string) => {
    setWorkBoxes(
      workBoxes.map((b) =>
        b.id === boxId
          ? { ...b, biddingMembers: b.biddingMembers.filter((m) => m !== name) }
          : b,
      ),
    );
  };

  const addFuelRow = () => {
    setExpenses({
      ...expenses,
      fuel: {
        ...expenses.fuel,
        items: [...expenses.fuel.items, { cost: "", image: null }],
      },
    });
  };

  const removeFuelRow = (index: number) => {
    const newItems = expenses.fuel.items.filter((_, i) => i !== index);
    setExpenses({ ...expenses, fuel: { ...expenses.fuel, items: newItems } });
  };

  const pickImage = async (type: "fuel" | "hotel" | "other", index = 0) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.2, // 📉 บีบอัดให้เล็กลงเหลือ 20% (ลดภาระเซิร์ฟเวอร์)
        allowsEditing: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;

        if (type === "fuel") {
          const newItems = [...expenses.fuel.items];
          newItems[index].image = imageUri;
          setExpenses({
            ...expenses,
            fuel: { ...expenses.fuel, items: newItems },
          });
        } else {
          setExpenses({
            ...expenses,
            [type]: { ...expenses[type], image: imageUri },
          });
        }
      }
    } catch (error) {
      console.log("ImagePicker Error: ", error);
      Alert.alert(
        "เกิดข้อผิดพลาด",
        "ไม่สามารถเลือกรูปภาพนี้ได้ อาจเป็นไฟล์ที่ถูกสำรองไว้ใน iCloud หรือไฟล์ไม่สมบูรณ์ กรุณาลองเลือกรูปอื่นครับ",
      );
    }
  };

  const handleGetLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted")
      return Alert.alert("Error", "ไม่อนุญาตให้เข้าถึงตำแหน่ง");
    setLocationInfo((prev) => ({
      ...prev,
      gps: "กำลังค้นหา...",
      address: "กำลังโหลด...",
    }));
    try {
      let loc = await Location.getCurrentPositionAsync({});
      let addr = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      let addrTxt =
        addr.length > 0
          ? `${addr[0].name || ""} ${addr[0].street || ""} ${addr[0].subregion || ""}`.trim()
          : "ระบุเอง";
      setLocationInfo({
        ...locationInfo,
        gps: `${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`,
        address: addrTxt,
      });
    } catch (e) {
      setLocationInfo((prev) => ({ ...prev, gps: "", address: "" }));
    }
  };

  const resetForm = () => {
    setReportDate(new Date());
    setWorkType("outside");
    setLocationInfo({ area: "", province: "", gps: "", address: "" });
    setTeamType("marketing");
    setBiddingTeamName("");
    setWorkBoxes([
      {
        id: Date.now(),
        customer: "",
        project: "",
        value: "",
        type: "ลูกค้าใหม่",
        status: "",
        summary: "",
        notes: "",
        filteredCustomers: customerList, // โหลดรายชื่อลูกค้าไว้เหมือนเดิม
        showSuggestions: false,
        biddingMembers: [],
      },
    ]);
    setExpenses({
      fuel: { enabled: false, items: [{ cost: "", image: null }] },
      hotel: { enabled: false, cost: "", image: null },
      other: { enabled: false, cost: "", detail: "", image: null },
    });
    setProblem("");
    setSuggestion("");
  };

  const handleSubmit = async () => {
    if (workBoxes.some((b) => !b.customer || !b.status))
      return Alert.alert(
        "แจ้งเตือน",
        "กรุณากรอกชื่อลูกค้าและสถานะงานในทุกกล่อง",
      );

    // ✅ validation อยู่ก่อน setLoading
    if (teamType === "bidding" && !biddingTeamName.trim())
      return Alert.alert("แจ้งเตือน", "กรุณาระบุชื่อทีมประมูล");

    setLoading(true);
    const postData = new FormData();

    // 1. ถ้าเป็นการแก้ไข ให้ส่ง edit_id ไปด้วย
    if (params?.edit_id) {
      postData.append("edit_id", params.edit_id as string);
    }

    // 2. ส่งแค่ชื่อผู้รายงานคนเดียวตามที่ต้องการ
    postData.append("reporter_name", user?.fullname || "");

    // 3. คงค่า team_type และ bidding_team_name ไว้เพื่อให้ backend ทำงานต่อได้
    postData.append("team_type", teamType);
    if (teamType === "bidding") {
      postData.append("bidding_team_name", biddingTeamName.trim());
    }

    postData.append("report_date", reportDate.toISOString().split("T")[0]);
    postData.append("work_type", workType);

    if (workType === "company") {
      postData.append("area_zone", "เข้าบริษัท (สำนักงาน)");
      postData.append("province", "กรุงเทพมหานคร");
      postData.append("gps", "Office");
      postData.append("gps_address", "สำนักงานใหญ่");
    } else {
      postData.append("area_zone", locationInfo.area);
      postData.append("province", locationInfo.province);
      postData.append("gps", locationInfo.gps);
      postData.append("gps_address", locationInfo.address);
    }

    workBoxes.forEach((box, i) => {
      postData.append("work_result[]", box.customer);
      postData.append("project_name[]", box.project);
      postData.append("project_value[]", box.value);
      postData.append("job_status[]", box.status);
      postData.append("visit_summary[]", box.summary);
      postData.append("additional_notes[]", box.notes);
      postData.append(`customer_type_${i + 1}`, box.type);

      if (teamType === "bidding") {
        box.biddingMembers.forEach((m) => {
          postData.append(`bidding_members[${i}][]`, m);
        });
      }
    });

    // แทนที่ส่วนเดิมที่คุณเขียนไว้ใน handleSubmit

    // ⛽ ส่วนของค่าน้ำมัน
    if (expenses.fuel.enabled) {
      const keptFuelReceipts: string[] = [];
      expenses.fuel.items.forEach((item, idx) => {
        postData.append("fuel_cost[]", item.cost || "0");
        if (item.image) {
          if (item.image.startsWith("file://") || item.image.startsWith("content://")) {
            postData.append("fuel_receipt_file[]", {
              uri: item.image,
              name: `fuel_${idx}.jpg`,
              type: "image/jpeg",
            } as any);
          } else {
            keptFuelReceipts.push(item.image);
          }
        }
      });
      postData.append("kept_fuel_receipts", JSON.stringify(keptFuelReceipts));
    }

    // 🏨 ส่วนของค่าที่พัก
    if (expenses.hotel.enabled) {
      postData.append("accommodation_cost", expenses.hotel.cost || "0");
      if (expenses.hotel.image) {
        if (expenses.hotel.image.startsWith("file://") || expenses.hotel.image.startsWith("content://")) {
          postData.append("accommodation_receipt_file", {
            uri: expenses.hotel.image,
            name: "hotel.jpg",
            type: "image/jpeg",
          } as any);
        }
      }
    }

    // 🧩 ส่วนของค่าใช้จ่ายอื่นๆ
    if (expenses.other.enabled) {
      postData.append("other_cost", expenses.other.cost || "0");
      postData.append("other_cost_detail", expenses.other.detail || "");
      if (expenses.other.image) {
        if (expenses.other.image.startsWith("file://") || expenses.other.image.startsWith("content://")) {
          postData.append("other_receipt_file", {
            uri: expenses.other.image,
            name: "other.jpg",
            type: "image/jpeg",
          } as any);
        }
      }
    }

    postData.append("problem", problem);
    postData.append("suggestion", suggestion);

    try {
      const res = await axios.post(
        `${API_BASE}/api_mobile.php?action=submit_report`,
        postData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      if (res.data.status === "success") {
        Alert.alert("สำเร็จ", "บันทึกเรียบร้อย", [
          {
            text: "ตกลง",
            onPress: () => {
              resetForm();
              router.replace("/(tabs)/Profile");
            },
          },
        ]);
      } else {
        // เพิ่มบรรทัดนี้ เพื่อโชว์ข้อความจาก PHP แบบเต็มๆ
        Alert.alert("เซิร์ฟเวอร์แจ้งเตือน", res.data.message || "เกิดข้อผิดพลาดจากฐานข้อมูล");
      }
    } catch (e: any) {
      console.log("🔥 PHP Error Details:", e.response?.data || e.message);
      Alert.alert("Error", "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#f8f9fd" }}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.mainHeader}>📝 รายงานฝ่ายขาย (Sales Report)</Text>

        {/* --- 0. ประเภทการรายงาน --- */}
        <View style={[styles.card, { marginBottom: 15 }]}>
          <SectionHeader icon="people-outline" title="ประเภทการรายงาน" />

          <View style={{ flexDirection: "row", gap: 10, marginTop: 5 }}>
            <TouchableOpacity
              onPress={() => setTeamType("marketing")}
              style={[
                styles.teamTypeBtn,
                {
                  borderColor:
                    teamType === "marketing" ? PRIMARY_COLOR : "#e2e8f0",
                  backgroundColor:
                    teamType === "marketing" ? PRIMARY_COLOR : "#fff",
                },
              ]}
              activeOpacity={0.8}
            >
              <Ionicons
                name="person"
                size={18}
                color={teamType === "marketing" ? "#fff" : COLORS.slate}
              />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text
                  style={{
                    fontWeight: "700",
                    fontSize: 13,
                    color: teamType === "marketing" ? "#fff" : "#1e293b",
                  }}
                >
                  ทีมการตลาด
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color:
                      teamType === "marketing"
                        ? "rgba(255,255,255,0.75)"
                        : COLORS.slate,
                  }}
                >
                  รายบุคคล
                </Text>
              </View>
              {teamType === "marketing" && (
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setTeamType("bidding")}
              style={[
                styles.teamTypeBtn,
                {
                  borderColor:
                    teamType === "bidding" ? COLORS.emerald : "#e2e8f0",
                  backgroundColor:
                    teamType === "bidding" ? COLORS.emerald : "#fff",
                },
              ]}
              activeOpacity={0.8}
            >
              <Ionicons
                name="people"
                size={18}
                color={teamType === "bidding" ? "#fff" : COLORS.slate}
              />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text
                  style={{
                    fontWeight: "700",
                    fontSize: 13,
                    color: teamType === "bidding" ? "#fff" : "#1e293b",
                  }}
                >
                  ทีมประมูล
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color:
                      teamType === "bidding"
                        ? "rgba(255,255,255,0.75)"
                        : COLORS.slate,
                  }}
                >
                  กลุ่ม
                </Text>
              </View>
              {teamType === "bidding" && (
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          {teamType === "bidding" && (
            <Animated.View
              entering={FadeInDown.duration(250)}
              style={{
                marginTop: 12,
                padding: 12,
                backgroundColor: "#f0f9ff",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#7dd3fc",
              }}
            >
              <Text
                style={[styles.subLabel, { color: "#0369a1", marginTop: 0 }]}
              >
                🏷️ ชื่อทีมประมูล <Text style={{ color: COLORS.red }}>*</Text>
              </Text>

              {/* ปุ่มเปิด Dropdown */}
              <TouchableOpacity
                onPress={() => {
                  setNewTeamInput("");
                  setTeamPickerVisible(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: 12,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: "#7dd3fc",
                  backgroundColor: "#fff",
                }}
                activeOpacity={0.8}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Ionicons name="people" size={16} color="#0ea5e9" />
                  <Text
                    style={{
                      fontWeight: "600",
                      color: biddingTeamName ? "#0369a1" : "#94a3b8",
                      fontSize: 14,
                    }}
                  >
                    {biddingTeamName || "-- เลือกหรือพิมพ์ชื่อทีม --"}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={18} color="#7dd3fc" />
              </TouchableOpacity>

              <Text style={{ fontSize: 11, color: COLORS.slate, marginTop: 6 }}>
                <Ionicons
                  name="information-circle-outline"
                  size={11}
                  color={COLORS.slate}
                />{" "}
                เลือกทีมเดิมหรือสร้างทีมใหม่ได้
              </Text>
            </Animated.View>
          )}
        </View>

        {/* --- 1. สถานที่ --- */}
        <View style={[styles.card, { zIndex: 100 }]}>
          <SectionHeader icon="location-outline" title="ประเภทงานและสถานที่" />
          <View style={styles.radioGroup}>
            <Pressable
              onPress={() => setWorkType("company")}
              style={[
                styles.radioBtn,
                workType === "company" && styles.radioBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.radioText,
                  workType === "company" && { color: "white" },
                ]}
              >
                🏢 เข้าบริษัท
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setWorkType("outside")}
              style={[
                styles.radioBtn,
                workType === "outside" && styles.radioBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.radioText,
                  workType === "outside" && { color: "white" },
                ]}
              >
                📍 นอกสถานที่
              </Text>
            </Pressable>
          </View>
          {workType === "outside" && (
            <View style={styles.subBox}>
              <TouchableOpacity
                style={styles.selectorBtn}
                onPress={() => {
                  setSelectorConfig({
                    title: "เลือกโซน",
                    data: REGIONS,
                    field: "area",
                    boxId: 0,
                  });
                  setSelectorVisible(true);
                }}
              >
                <Text
                  style={
                    locationInfo.area
                      ? styles.selectorText
                      : styles.placeholderText
                  }
                >
                  {locationInfo.area || "เลือกภาค/โซน"}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#aaa" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.gpsBtn}
                onPress={handleGetLocation}
              >
                <LinearGradient
                  colors={["#f59e0b", "#d97706"]}
                  style={styles.gradientBtn}
                >
                  <Text style={{ color: "white", fontWeight: "bold" }}>
                    📡 จับพิกัด GPS
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                value={locationInfo.address}
                onChangeText={(t) =>
                  setLocationInfo({ ...locationInfo, address: t })
                }
                placeholder="ที่อยู่พิกัด..."
                multiline
              />
            </View>
          )}
        </View>

        {/* --- 2. กล่องงาน --- */}
        <View style={{ marginTop: 15 }}>
          {workBoxes.map((box, index) => (
            <Animated.View
              key={box.id}
              entering={FadeInDown}
              style={[
                styles.card,
                {
                  marginBottom: 15,
                  zIndex: workBoxes.length - index,
                  elevation: workBoxes.length - index,
                },
              ]}
            >
              <View style={styles.workBoxHeader}>
                <Text style={styles.workBoxTitle}>💼 งานที่ {index + 1}</Text>
                {workBoxes.length > 1 && (
                  <TouchableOpacity onPress={() => removeWorkBox(box.id)}>
                    <Ionicons name="trash" size={20} color={COLORS.red} />
                  </TouchableOpacity>
                )}
              </View>

              {teamType === "bidding" && (
                <View
                  style={{
                    backgroundColor: "#f0f9ff",
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: "#7dd3fc",
                    borderStyle: "dashed",
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      color: "#0284c7",
                      fontWeight: "700",
                      fontSize: 13,
                      marginBottom: 8,
                    }}
                  >
                    👥 ผู้ร่วมทีมประมูล (เฉพาะงานนี้)
                  </Text>

                  {box.biddingMembers.length > 0 && (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      {box.biddingMembers.map((m) => (
                        <View
                          key={m}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            backgroundColor: "#dbeafe",
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 20,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              color: "#1d4ed8",
                              fontWeight: "600",
                            }}
                          >
                            {m}
                          </Text>
                          <TouchableOpacity
                            onPress={() => removeBiddingMember(box.id, m)}
                            style={{ marginLeft: 6 }}
                          >
                            <Ionicons
                              name="close-circle"
                              size={16}
                              color="#3b82f6"
                            />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={() => openBiddingModal(box.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: "#0ea5e9",
                      borderRadius: 8,
                      paddingVertical: 7,
                      backgroundColor: "#fff",
                    }}
                  >
                    <Ionicons name="person-add" size={16} color="#0ea5e9" />
                    <Text
                      style={{
                        color: "#0ea5e9",
                        fontWeight: "600",
                        marginLeft: 6,
                        fontSize: 13,
                      }}
                    >
                      เพิ่มรายชื่อลูกทีม
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.subLabel}>ลูกค้า / หน่วยงาน *</Text>
              <View style={{ position: "relative", zIndex: 1000 }}>
                <TextInput
                  style={styles.input}
                  placeholder="ค้นหาชื่อลูกค้า..."
                  value={box.customer}
                  onChangeText={(t) => handleCustomerInput(box.id, t)}
                  onFocus={() => updateWorkBox(box.id, "showSuggestions", true)}
                />
                {box.showSuggestions && box.filteredCustomers.length > 0 && (
                  <View style={styles.suggestionBox}>
                    <ScrollView
                      keyboardShouldPersistTaps="always"
                      nestedScrollEnabled={true}
                      style={{ maxHeight: 180 }}
                    >
                      {box.filteredCustomers.slice(0, 50).map((c, i) => (
                        <TouchableOpacity
                          key={i}
                          style={styles.suggestionItem}
                          onPress={() => selectCustomer(box.id, c)}
                        >
                          <Text style={{ fontSize: 14, color: "#333" }}>
                            <Ionicons
                              name="business"
                              size={14}
                              color={COLORS.slate}
                            />{" "}
                            {c}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>ประเภท</Text>
                  <View
                    style={[
                      styles.miniSelector,
                      {
                        borderColor:
                          box.type === "ลูกค้าใหม่"
                            ? COLORS.blue
                            : COLORS.emerald,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          box.type === "ลูกค้าใหม่"
                            ? COLORS.blue
                            : COLORS.emerald,
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {box.type === "ลูกค้าใหม่"
                        ? "🆕 ลูกค้าใหม่"
                        : "✅ ลูกค้าเก่า"}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1.5, marginLeft: 10 }}>
                  <Text style={styles.subLabel}>มูลค่าโครงการ</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    keyboardType="decimal-pad" // ✅ ใช้ปุ่มตัวเลขที่มีจุด
                    value={box.value}
                    onChangeText={(t) =>
                      updateWorkBox(box.id, "value", formatCurrency(t))
                    } // ✅ ใส่ Comma อัตโนมัติ
                  />
                </View>
              </View>

              <Text style={styles.subLabel}>ชื่อโครงการ</Text>
              <TextInput
                style={styles.input}
                placeholder="ระบุโครงการ..."
                value={box.project}
                onChangeText={(t) => updateWorkBox(box.id, "project", t)}
              />

              <Text style={styles.subLabel}>สถานะงาน *</Text>
              <TouchableOpacity
                style={styles.selectorBtn}
                onPress={() => {
                  setSelectorConfig({
                    title: "สถานะงาน",
                    data: statusList,
                    field: "status",
                    boxId: box.id,
                  });
                  setSelectorVisible(true);
                }}
              >
                <Text
                  style={
                    box.status ? styles.selectorText : styles.placeholderText
                  }
                >
                  {box.status || "เลือกสถานะ..."}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#aaa" />
              </TouchableOpacity>

              <Text style={styles.subLabel}>สรุปรายละเอียด</Text>
              <TextInput
                style={[styles.input, { height: 70 }]}
                multiline
                placeholder="สรุปการเข้าพบ..."
                value={box.summary}
                onChangeText={(t) => updateWorkBox(box.id, "summary", t)}
              />

              <Text style={styles.subLabel}>บันทึกเพิ่มเติม</Text>
              <TextInput
                style={[styles.input, { height: 60 }]}
                multiline
                placeholder="โน้ตเพิ่มเติม..."
                value={box.notes}
                onChangeText={(t) => updateWorkBox(box.id, "notes", t)}
              />
            </Animated.View>
          ))}

          <TouchableOpacity
            style={styles.addWorkBtn}
            onPress={addWorkBox}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={24} color="white" />
            <Text style={styles.addWorkBtnText}> เพิ่มงาน/ลูกค้าถัดไป</Text>
          </TouchableOpacity>
        </View>

        {/* --- 3. ค่าใช้จ่าย --- */}
        <View style={[styles.card, { marginTop: 15, zIndex: 0 }]}>
          <SectionHeader
            icon="receipt-outline"
            title="เบิกค่าใช้จ่าย"
            color="#e17055"
          />

          <View style={styles.expenseItem}>
            <View style={styles.expenseHeader}>
              <Text style={styles.expenseTitle}>⛽ ค่าน้ำมัน</Text>
              <Switch
                value={expenses.fuel.enabled}
                onValueChange={(v) =>
                  setExpenses({
                    ...expenses,
                    fuel: { ...expenses.fuel, enabled: v },
                  })
                }
              />
            </View>
            {expenses.fuel.enabled && (
              <View style={{ marginTop: 10 }}>
                {expenses.fuel.items.map((item, idx) => (
                  <View key={idx} style={styles.fuelRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="บาท"
                      keyboardType="decimal-pad"
                      value={item.cost}
                      onChangeText={(t) => {
                        const newItems = [...expenses.fuel.items];
                        newItems[idx].cost = t;
                        setExpenses({
                          ...expenses,
                          fuel: { ...expenses.fuel, items: newItems },
                        });
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => pickImage("fuel", idx)}
                      style={styles.miniPhotoBtn}
                    >
                      <Ionicons
                        name={item.image ? "checkmark-circle" : "camera"}
                        size={22}
                        color={item.image ? COLORS.emerald : PRIMARY_COLOR}
                      />
                    </TouchableOpacity>
                    {idx > 0 && (
                      <TouchableOpacity onPress={() => removeFuelRow(idx)}>
                        <Ionicons name="trash" size={20} color={COLORS.red} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity
                  onPress={addFuelRow}
                  style={styles.addMoreBtn}
                >
                  <Text style={{ color: "white", fontSize: 12 }}>
                    + เพิ่มบิล
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <ExpenseItem
            title="🏨 ค่าที่พัก"
            data={expenses.hotel}
            onToggle={(v: boolean) =>
              setExpenses({
                ...expenses,
                hotel: { ...expenses.hotel, enabled: v },
              })
            }
            onChange={(t: string) =>
              setExpenses({
                ...expenses,
                hotel: { ...expenses.hotel, cost: t },
              })
            }
            onPick={() => pickImage("hotel")}
          />
          <ExpenseItem
            title="🧩 อื่นๆ"
            data={expenses.other}
            onToggle={(v: boolean) =>
              setExpenses({
                ...expenses,
                other: { ...expenses.other, enabled: v },
              })
            }
            onChange={(t: string) =>
              setExpenses({
                ...expenses,
                other: { ...expenses.other, cost: t },
              })
            }
            onPick={() => pickImage("other")}
          />
          {expenses.other.enabled && (
            <TextInput
              style={[styles.input, { marginTop: 5 }]}
              placeholder="รายละเอียดค่าใช้จ่ายอื่นๆ..."
              value={expenses.other.detail}
              onChangeText={(t) =>
                setExpenses({
                  ...expenses,
                  other: { ...expenses.other, detail: t },
                })
              }
            />
          )}
        </View>

        <View style={[styles.card, { marginTop: 15 }]}>
          <SectionHeader
            icon="alert-circle-outline"
            title="ปัญหา / ข้อเสนอแนะ"
          />
          <TextInput
            style={[styles.input, { height: 60, marginBottom: 10 }]}
            multiline
            placeholder="ปัญหาที่พบ..."
            value={problem}
            onChangeText={setProblem}
          />
          <TextInput
            style={[styles.input, { height: 60 }]}
            multiline
            placeholder="ข้อเสนอแนะ..."
            value={suggestion}
            onChangeText={setSuggestion}
          />
        </View>

        <TouchableOpacity
          onPress={handleSubmit}
          style={styles.submitBtnContainer}
        >
          <LinearGradient
            colors={[PRIMARY_COLOR, SECONDARY_COLOR]}
            style={styles.submitBtn}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.submitBtnText}>ส่งรายงานประจำวัน</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />

        {/* ✅ NEW: Modal เลือก/สร้างทีมประมูล */}
        <Modal visible={teamPickerVisible} transparent animationType="slide">
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setTeamPickerVisible(false)}
          >
            <View style={[styles.modalContent, { maxHeight: "75%" }]}>
              <Text style={styles.modalHeaderTitle}>🏷️ ชื่อทีมประมูล</Text>

              {/* ── สร้างทีมใหม่ ── */}
              <View
                style={{
                  backgroundColor: "#f0f9ff",
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#bae6fd",
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: "#0369a1",
                    marginBottom: 8,
                  }}
                >
                  ＋ สร้างทีมใหม่
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, fontSize: 14 }]}
                    placeholder="พิมพ์ชื่อทีมใหม่..."
                    value={newTeamInput}
                    onChangeText={setNewTeamInput}
                    onSubmitEditing={() => {
                      if (newTeamInput.trim()) {
                        setBiddingTeamName(newTeamInput.trim());
                        setNewTeamInput("");
                        setTeamPickerVisible(false);
                      }
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      if (!newTeamInput.trim()) return;
                      setBiddingTeamName(newTeamInput.trim());
                      setNewTeamInput("");
                      setTeamPickerVisible(false);
                    }}
                    style={{
                      backgroundColor: "#0ea5e9",
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                    >
                      ✓ ใช้ชื่อนี้
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── ทีมที่มีในระบบ ── */}
              {biddingTeamsList.length > 0 && (
                <>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 6,
                    }}
                  >
                    ทีมที่มีอยู่ในระบบ
                  </Text>
                  <FlatList
                    data={biddingTeamsList}
                    keyExtractor={(item, index) => `team-${index}-${item}`}
                    renderItem={({ item }) => {
                      const isSelected = biddingTeamName === item;
                      const isLast = lastBiddingTeam === item;
                      return (
                        <TouchableOpacity
                          onPress={() => {
                            setBiddingTeamName(item);
                            setTeamPickerVisible(false);
                          }}
                          style={[
                            styles.modalItem,
                            {
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                              backgroundColor: isSelected
                                ? "#eff6ff"
                                : "transparent",
                              borderRadius: 10,
                              paddingHorizontal: 8,
                            },
                          ]}
                        >
                          {/* Avatar icon */}
                          <View
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              backgroundColor: isSelected
                                ? PRIMARY_COLOR
                                : "#e2e8f0",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Ionicons
                              name="people"
                              size={14}
                              color={isSelected ? "#fff" : COLORS.slate}
                            />
                          </View>

                          <Text
                            style={[
                              styles.modalItemText,
                              { flex: 1 },
                              isSelected && {
                                color: PRIMARY_COLOR,
                                fontWeight: "700",
                              },
                            ]}
                          >
                            {item}
                          </Text>

                          {/* Badge ล่าสุด */}
                          {isLast && !isSelected && (
                            <View
                              style={{
                                backgroundColor: "#dbeafe",
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                borderRadius: 20,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: "#1d4ed8",
                                  fontWeight: "600",
                                }}
                              >
                                ✓ ล่าสุด
                              </Text>
                            </View>
                          )}

                          {isSelected && (
                            <Ionicons
                              name="checkmark-circle"
                              size={20}
                              color={PRIMARY_COLOR}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    }}
                  />
                </>
              )}

              {biddingTeamsList.length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <Ionicons
                    name="folder-open-outline"
                    size={36}
                    color="#cbd5e1"
                  />
                  <Text
                    style={{ color: "#94a3b8", marginTop: 8, fontSize: 14 }}
                  >
                    ยังไม่มีทีมในระบบ{"\n"}พิมพ์ชื่อทีมใหม่ด้านบนได้เลย
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        </Modal>

        <Modal visible={biddingModalVisible} transparent animationType="slide">
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setBiddingModalVisible(false)}
          >
            <View style={[styles.modalContent, { maxHeight: "70%" }]}>
              <Text style={styles.modalHeaderTitle}>เลือกผู้ร่วมทีมประมูล</Text>

              <TextInput
                style={[styles.input, { marginBottom: 10 }]}
                placeholder="🔍 ค้นหาชื่อพนักงาน..."
                value={biddingSearch}
                onChangeText={setBiddingSearch}
              />

              <FlatList
                data={employeesList
                  .filter((e) => e !== user?.fullname)
                  .filter((e) =>
                    biddingSearch.trim() === ""
                      ? true
                      : e.toLowerCase().includes(biddingSearch.toLowerCase()),
                  )}
                keyExtractor={(item, index) => `member-${index}-${item}`}
                renderItem={({ item }) => {
                  const box = workBoxes.find((b) => b.id === biddingModalBoxId);
                  const selected = box?.biddingMembers.includes(item) ?? false;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.modalItem,
                        {
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          backgroundColor: selected ? "#eff6ff" : "transparent",
                        },
                      ]}
                      onPress={() => {
                        if (biddingModalBoxId !== null)
                          toggleBiddingMember(biddingModalBoxId, item);
                      }}
                    >
                      <Text
                        style={[
                          styles.modalItemText,
                          selected && {
                            color: PRIMARY_COLOR,
                            fontWeight: "700",
                          },
                        ]}
                      >
                        {item}
                      </Text>
                      {selected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={PRIMARY_COLOR}
                        />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />

              <TouchableOpacity
                onPress={() => setBiddingModalVisible(false)}
                style={{
                  marginTop: 10,
                  backgroundColor: PRIMARY_COLOR,
                  padding: 13,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}
                >
                  ✓ เสร็จสิ้น (
                  {workBoxes.find((b) => b.id === biddingModalBoxId)
                    ?.biddingMembers.length ?? 0}{" "}
                  คน)
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>

        <Modal visible={selectorVisible} transparent animationType="slide">
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setSelectorVisible(false)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalHeaderTitle}>
                {selectorConfig.title}
              </Text>
              <FlatList
                data={selectorConfig.data}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => {
                  // สกัดค่า text ออกมาเผื่อกรณีที่เป็น Object
                  const displayValue =
                    typeof item === "object" && item !== null
                      ? (item as any).status_name ||
                      (item as any).name ||
                      (item as any).status
                      : String(item);

                  return (
                    <TouchableOpacity
                      style={styles.modalItem}
                      onPress={() => {
                        if (selectorConfig.field === "area")
                          setLocationInfo({
                            ...locationInfo,
                            area: displayValue,
                          });
                        else
                          updateWorkBox(
                            selectorConfig.boxId,
                            selectorConfig.field,
                            displayValue,
                          );
                        setSelectorVisible(false);
                      }}
                    >
                      <Text style={styles.modalItemText}>{displayValue}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </Pressable>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const SectionHeader = ({ icon, title, color }: any) => (
  <View style={styles.sectionHeader}>
    <Ionicons name={icon} size={20} color={color || PRIMARY_COLOR} />
    <Text style={styles.sectionTitle}> {title}</Text>
  </View>
);

const ExpenseItem = ({ title, data, onToggle, onChange, onPick }: any) => (
  <View style={styles.expenseItem}>
    <View style={styles.expenseHeader}>
      <Text style={styles.expenseTitle}>{title}</Text>
      <Switch value={data.enabled} onValueChange={onToggle} />
    </View>
    {data.enabled && (
      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="บาท"
          keyboardType="decimal-pad"
          value={data.cost}
          onChangeText={onChange}
        />
        <TouchableOpacity onPress={onPick} style={styles.miniPhotoBtn}>
          <Ionicons
            name={data.image ? "checkmark-circle" : "camera"}
            size={22}
            color={data.image ? COLORS.emerald : PRIMARY_COLOR}
          />
        </TouchableOpacity>
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: { padding: 15 },
  mainHeader: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 15,
    textAlign: "center",
  },
  card: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 20,
    elevation: 3,
    shadowOpacity: 0.1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: { fontWeight: "bold", fontSize: 16, color: "#334155" },
  subLabel: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 5,
    marginTop: 10,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
    fontSize: 15,
    backgroundColor: "#fff",
    color: "#333",
  },
  selectorBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  selectorText: { fontSize: 15, color: "#1e293b" },
  placeholderText: { fontSize: 15, color: "#94a3b8" },
  radioGroup: { flexDirection: "row", gap: 10 },
  radioBtn: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    borderRadius: 12,
  },
  radioBtnActive: {
    backgroundColor: PRIMARY_COLOR,
    borderColor: PRIMARY_COLOR,
  },
  radioText: { fontWeight: "bold", color: "#64748b" },
  subBox: { marginTop: 10, gap: 10 },
  gpsBtn: { marginTop: 5 },
  gradientBtn: { padding: 12, borderRadius: 10, alignItems: "center" },
  workBoxHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 10,
    marginBottom: 5,
  },
  workBoxTitle: { fontWeight: "800", color: PRIMARY_COLOR, fontSize: 15 },
  miniSelector: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  addWorkBtn: {
    backgroundColor: "#1e293b",
    flexDirection: "row",
    padding: 15,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    elevation: 4,
  },
  addWorkBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },
  expenseItem: {
    marginBottom: 10,
    padding: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  expenseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  expenseTitle: { fontWeight: "bold", fontSize: 14, color: "#334155" },
  fuelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  miniPhotoBtn: {
    width: 42,
    height: 42,
    backgroundColor: "#fff",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  addMoreBtn: {
    backgroundColor: SECONDARY_COLOR,
    padding: 6,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
    width: 80,
    alignSelf: "flex-end",
  },
  submitBtnContainer: { marginTop: 20 },
  submitBtn: { padding: 16, borderRadius: 15, alignItems: "center" },
  submitBtnText: { color: "white", fontWeight: "bold", fontSize: 18 },
  row: { flexDirection: "row" },
  suggestionBox: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: "white",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    maxHeight: 180,
    zIndex: 9999,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  suggestionItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "60%",
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    color: PRIMARY_COLOR,
  },
  modalItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  modalItemText: { fontSize: 16 },
  teamTypeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
});
