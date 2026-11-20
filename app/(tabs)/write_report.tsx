import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import axios from "axios";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
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

import { API_BASE, IMG_BASE_URL } from "../../constants/config";
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
// ประเภทลูกค้า (ค่าเดียวกับ customer_type บนเว็บ Report.php)
const CUSTOMER_TYPES = ["ลูกค้าเก่า", "ลูกค้าใหม่"];
const PRIMARY_COLOR = "#004aad";
// สี/ไอคอนของแต่ละประเภท (ธีมเดิมของช่องประเภท: เก่า = เขียว ✅ · ใหม่ = น้ำเงิน 🆕)
const CUSTOMER_TYPE_STYLE: Record<string, { color: string; emoji: string }> = {
  ลูกค้าเก่า: { color: "#10b981", emoji: "✅" },
  ลูกค้าใหม่: { color: "#3b82f6", emoji: "🆕" },
};
const SECONDARY_COLOR = "#3b82f6";
const COLORS = {
  primary: "#004aad",
  blue: "#3b82f6",
  emerald: "#10b981",
  red: "#ef4444",
  slate: "#64748b",
  orange: "#f59e0b",
};

// 📎 เอกสารแนบค่าใช้จ่าย — ตรงกับ report_docs_lib.php ฝั่งเว็บ (คอลัมน์ reports.expense_docs)
type ExpenseCat = "fuel" | "hotel" | "other";
type DocType = "slip" | "tax_invoice" | "receipt" | "other";
const EXPENSE_CATS: ExpenseCat[] = ["fuel", "hotel", "other"];
const DOC_TYPES: { key: DocType; label: string }[] = [
  { key: "slip", label: "สลิปโอนเงิน" },
  { key: "tax_invoice", label: "ใบกำกับภาษี" },
  { key: "receipt", label: "ใบเสร็จรับเงิน" },
  { key: "other", label: "เอกสารอื่นๆ" },
];
const DOC_TYPE_LABEL = Object.fromEntries(
  DOC_TYPES.map((d) => [d.key, d.label]),
) as Record<DocType, string>;

interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}
interface DocRow {
  key: number;
  type: DocType;
  files: PickedFile[];
}
interface ExistingDoc {
  cat: ExpenseCat;
  type: DocType;
  file: string;
  name: string;
  entry: number | null; // ลำดับรอบ/รายการที่เอกสารผูกอยู่ (0, 1, 2 …) · null = ข้อมูลเก่าที่ไม่ได้ผูก
}

let docRowSeq = 0;
const newDocRow = (type: DocType = "slip"): DocRow => ({
  key: ++docRowSeq,
  type,
  files: [],
});

// 🔁 รอบ/รายการของหมวดค่าใช้จ่าย (เหมือนกล่องในฟอร์มเว็บ Report.php)
//   ค่าน้ำมัน = "รอบ N" · ที่พัก / อื่นๆ = "รายการที่ N" — แต่ละกล่องมียอด + สลิป + เอกสารของตัวเอง
type RowList = "slipRows" | "docRows";
interface ExpenseEntry {
  key: number;
  amount: string;
  detail: string; // ใช้เฉพาะหมวดอื่นๆ
  slipRows: DocRow[];
  docRows: DocRow[];
  existing: ExistingDoc[]; // เอกสารเดิมบนเซิร์ฟเวอร์ของกล่องนี้
  legacy: string[]; // สลิปรูปแบบเดิม (คอลัมน์ fuel_receipt / accommodation_receipt / other_receipt)
}
interface ExpenseCatState {
  enabled: boolean;
  entries: ExpenseEntry[];
}
let entrySeq = 0;
// กล่องใหม่มาพร้อมช่องสลิป 1 ช่อง และช่องแนบเอกสาร 1 ช่อง (เหมือนเว็บ)
const newEntry = (init: Partial<ExpenseEntry> = {}): ExpenseEntry => ({
  key: ++entrySeq,
  amount: "",
  detail: "",
  slipRows: [newDocRow()],
  docRows: [newDocRow()],
  existing: [],
  legacy: [],
  ...init,
});
const emptyExpenses = (): Record<ExpenseCat, ExpenseCatState> => ({
  fuel: { enabled: false, entries: [newEntry()] },
  hotel: { enabled: false, entries: [newEntry()] },
  other: { enabled: false, entries: [newEntry()] },
});
const ENTRY_LABEL: Record<ExpenseCat, string> = {
  fuel: "รอบ",
  hotel: "รายการที่",
  other: "รายการที่",
};
const isImageFile = (name: string) => /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name);
const fileExt = (name: string) => (name.split(".").pop() || "").toUpperCase();
const csvFiles = (v: any) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const toNum = (v: any) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
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

// เปิดได้ 2 แบบ:
//  1) เป็นหน้าในเมนู (route) — รับ edit_id / edit_data ทาง route params เหมือนเดิม
//  2) ฝังเป็นป๊อปอัปเต็มจอในหน้าประวัติ (history/sales) — ส่ง editId / editData / onClose มาเป็น props
//     บันทึกเสร็จเรียก onClose(true) แทนการเด้งไปหน้า Profile ผู้ใช้จึงอยู่หน้าประวัติต่อได้
type WriteReportProps = {
  editId?: string | number;
  editData?: string;
  onClose?: (saved: boolean) => void;
};

export default function WriteReportScreen({
  editId,
  editData,
  onClose,
}: WriteReportProps = {}) {
  const router = useRouter();
  const routeParams = useLocalSearchParams();
  const params: any =
    editData !== undefined
      ? { edit_id: String(editId ?? ""), edit_data: editData }
      : routeParams;
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
  const [expenses, setExpenses] =
    useState<Record<ExpenseCat, ExpenseCatState>>(emptyExpenses);

  const [problem, setProblem] = useState("");
  const [suggestion, setSuggestion] = useState("");

  // 📎 ป๊อปอัปเลือกประเภทบิล/เอกสารของช่องที่กด
  const [docTypePicker, setDocTypePicker] = useState<{
    cat: ExpenseCat;
    entryKey: number;
    list: RowList;
    rowKey: number;
  } | null>(null);

  // --- UI States ---
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);
  // กล่องงานที่เปิดดรอปดาวน์ประเภทลูกค้าอยู่ (null = ปิด)
  const [typeDropdownBox, setTypeDropdownBox] = useState<number | null>(null);
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
            // ฐานข้อมูลเก็บประเภทไว้ช่องเดียว (customer_type = ของงานแรก) · งานอื่นถือเป็นลูกค้าเก่า
            type:
              parsedBoxes.length === 0 && editData.customer_type === "ลูกค้าใหม่"
                ? "ลูกค้าใหม่"
                : "ลูกค้าเก่า",
            status: statuses[i] || "",
            summary: cleanSum,
            notes: cleanNote,
            filteredCustomers: [],
            showSuggestions: false,
            biddingMembers: bMembers,
          });
        }
        if (parsedBoxes.length > 0) setWorkBoxes(parsedBoxes);

        // 4. ค่าใช้จ่าย → กล่องรอบ/รายการ (กติกาเดียวกับ Report.php ตอนแก้ไข)
        // 📎 เอกสารแนบเดิม (expense_docs เป็น JSON string จาก get_history)
        let parsedDocs: ExistingDoc[] = [];
        try {
          const rawDocs =
            typeof editData.expense_docs === "string"
              ? JSON.parse(editData.expense_docs || "[]")
              : editData.expense_docs;
          if (Array.isArray(rawDocs)) {
            parsedDocs = rawDocs
              .filter((d: any) => d && d.file)
              .map((d: any) => ({
                cat: EXPENSE_CATS.includes(d.cat) ? d.cat : "other",
                type: DOC_TYPE_LABEL[d.type as DocType] ? d.type : "other",
                file: String(d.file),
                name: String(d.name || ""),
                entry:
                  d.entry !== null && d.entry !== undefined && !isNaN(Number(d.entry))
                    ? Number(d.entry)
                    : null,
              }));
          }
        } catch {
          parsedDocs = [];
        }

        // ยอดแยกรายการของที่พัก/อื่นๆ อยู่ใน expense_rounds · รายงานเก่าที่ไม่มี = 1 รายการรวม
        let roundAmounts: any[] = [];
        try {
          const rx =
            typeof editData.expense_rounds === "string"
              ? JSON.parse(editData.expense_rounds || "{}")
              : editData.expense_rounds;
          if (rx && Array.isArray(rx.amounts)) roundAmounts = rx.amounts;
        } catch {
          roundAmounts = [];
        }
        const amountsOf = (cat: ExpenseCat) =>
          roundAmounts
            .filter((a) => a && a.cat === cat)
            .map((a) => ({
              amount: String(a.amount ?? ""),
              detail: String(a.detail ?? ""),
            }));

        const fuelSeed = csvFiles(editData.fuel_cost).map((a) => ({
          amount: a,
          detail: "",
        }));
        let hotelSeed = amountsOf("hotel");
        if (hotelSeed.length === 0 && toNum(editData.accommodation_cost) > 0)
          hotelSeed = [{ amount: String(editData.accommodation_cost), detail: "" }];
        let otherSeed = amountsOf("other");
        if (otherSeed.length === 0 && toNum(editData.other_cost) > 0)
          otherSeed = [
            {
              amount: String(editData.other_cost),
              detail: String(editData.other_cost_detail || ""),
            },
          ];

        const legacyOf: Record<ExpenseCat, string[]> = {
          fuel: csvFiles(editData.fuel_receipt),
          hotel: csvFiles(editData.accommodation_receipt),
          other: csvFiles(editData.other_receipt),
        };

        const buildCat = (
          cat: ExpenseCat,
          seed: { amount: string; detail: string }[],
        ): ExpenseCatState => {
          const docs = parsedDocs.filter((d) => d.cat === cat);
          const legacy = legacyOf[cat];
          const entries = (seed.length > 0 ? seed : [{ amount: "", detail: "" }]).map(
            (s) => newEntry({ amount: s.amount, detail: s.detail }),
          );
          const last = entries.length - 1;
          docs.forEach((d) => {
            // ค่าน้ำมันที่ไม่ระบุรอบ → รอบล่าสุด · ที่พัก/อื่นๆ ที่ไม่ระบุ → รายการแรก (เหมือนเว็บ)
            const ok = d.entry !== null && d.entry >= 0 && d.entry <= last;
            const at = ok ? (d.entry as number) : cat === "fuel" ? last : 0;
            entries[at].existing.push(d);
          });
          // สลิปรูปแบบเดิม: ค่าน้ำมันเรียงตามรอบ (เกินจำนวนรอบ → รอบสุดท้าย) · ที่พัก/อื่นๆ อยู่รายการแรก
          legacy.forEach((f, i) => {
            const at = cat === "fuel" ? Math.min(i, last) : 0;
            entries[at].legacy.push(f);
          });
          return {
            enabled: seed.length > 0 || docs.length > 0 || legacy.length > 0,
            entries,
          };
        };

        setExpenses({
          fuel: buildCat("fuel", fuelSeed),
          hotel: buildCat("hotel", hotelSeed),
          other: buildCat("other", otherSeed),
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

  // อัปเดตจากค่าล่าสุดเสมอ (functional update) — Android ส่ง onChangeText ถี่ๆ ระหว่างพิมพ์ (โดยเฉพาะคีย์บอร์ดไทย)
  // ถ้าอ้าง workBoxes ตอน render ตัวอักษรที่พิมพ์ติดกันจะทับกันจนพิมพ์ไม่ติด
  const updateWorkBox = (id: number, field: string, value: any) => {
    setWorkBoxes((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    );
  };

  const selectCustomer = (boxId: number, name: string) => {
    const isExisting = masterCustomerList.some(
      (c) => c.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    setWorkBoxes((prev) =>
      prev.map((b) =>
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

    setWorkBoxes((prev) =>
      prev.map((b) =>
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

  const toggleExpense = (cat: ExpenseCat) => {
    setExpenses((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], enabled: !prev[cat].enabled },
    }));
  };

  // 🔁 จัดการกล่องรอบ/รายการ
  const updateEntry = (
    cat: ExpenseCat,
    entryKey: number,
    fn: (e: ExpenseEntry) => ExpenseEntry,
  ) =>
    setExpenses((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        entries: prev[cat].entries.map((e) => (e.key === entryKey ? fn(e) : e)),
      },
    }));

  const addEntry = (cat: ExpenseCat) =>
    setExpenses((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], entries: [...prev[cat].entries, newEntry()] },
    }));

  const removeEntry = (cat: ExpenseCat, entryKey: number) =>
    setExpenses((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        entries: prev[cat].entries.filter((e) => e.key !== entryKey),
      },
    }));

  // 📎 ช่องสลิป / ช่องแนบเอกสารในกล่อง
  const addRow = (cat: ExpenseCat, entryKey: number, list: RowList) =>
    updateEntry(cat, entryKey, (e) => ({ ...e, [list]: [...e[list], newDocRow()] }));

  const removeRow = (cat: ExpenseCat, entryKey: number, list: RowList, rowKey: number) =>
    updateEntry(cat, entryKey, (e) => ({
      ...e,
      [list]: e[list].filter((r) => r.key !== rowKey),
    }));

  const setRowType = (
    cat: ExpenseCat,
    entryKey: number,
    list: RowList,
    rowKey: number,
    type: DocType,
  ) =>
    updateEntry(cat, entryKey, (e) => ({
      ...e,
      [list]: e[list].map((r) => (r.key === rowKey ? { ...r, type } : r)),
    }));

  const removePickedFile = (
    cat: ExpenseCat,
    entryKey: number,
    list: RowList,
    rowKey: number,
    idx: number,
  ) =>
    updateEntry(cat, entryKey, (e) => ({
      ...e,
      [list]: e[list].map((r) =>
        r.key === rowKey ? { ...r, files: r.files.filter((_, i) => i !== idx) } : r,
      ),
    }));

  const removeExistingDoc = (cat: ExpenseCat, entryKey: number, file: string) =>
    updateEntry(cat, entryKey, (e) => ({
      ...e,
      existing: e.existing.filter((d) => d.file !== file),
    }));

  // สลิปรูปแบบเดิมลบได้เฉพาะค่าน้ำมัน (ที่พัก/อื่นๆ API เก็บไฟล์เดิมไว้เสมอ)
  const removeLegacy = (cat: ExpenseCat, entryKey: number, file: string) =>
    updateEntry(cat, entryKey, (e) => ({
      ...e,
      legacy: e.legacy.filter((f) => f !== file),
    }));

  // เลือกไฟล์แบบสะสม: กดเลือกเพิ่มได้เรื่อยๆ ไม่ทับไฟล์เดิมในช่อง
  //   ช่องสลิป = รูปจากคลังภาพ (บีบอัด) · ช่องแนบเอกสาร = รูปหรือ PDF
  const pickRowFiles = async (
    cat: ExpenseCat,
    entryKey: number,
    list: RowList,
    rowKey: number,
  ) => {
    let added: PickedFile[] = [];
    try {
      if (list === "slipRows") {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.2, // 📉 บีบอัดให้เล็กลงเหลือ 20% (ลดภาระเซิร์ฟเวอร์)
          allowsMultipleSelection: true,
          selectionLimit: 0, // 0 = ไม่จำกัด
        });
        if (result.canceled || !result.assets?.length) return;
        added = result.assets.map((a, i) => ({
          uri: a.uri,
          name: a.fileName || `slip_${Date.now()}_${i}.jpg`,
          mimeType: a.mimeType || "image/jpeg",
        }));
      } else {
        const res = await DocumentPicker.getDocumentAsync({
          type: ["image/*", "application/pdf"],
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (res.canceled || !res.assets?.length) return;
        added = res.assets.map((a) => {
          const name = a.name || `file_${Date.now()}.jpg`;
          return {
            uri: a.uri,
            name,
            mimeType:
              a.mimeType ||
              (name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
          };
        });
      }
    } catch (error) {
      console.log("File picker Error: ", error);
      Alert.alert(
        "เกิดข้อผิดพลาด",
        "ไม่สามารถเลือกไฟล์นี้ได้ อาจเป็นไฟล์ที่ถูกสำรองไว้ใน iCloud หรือไฟล์ไม่สมบูรณ์ กรุณาลองใหม่",
      );
      return;
    }
    updateEntry(cat, entryKey, (e) => ({
      ...e,
      [list]: e[list].map((r) =>
        r.key === rowKey ? { ...r, files: [...r.files, ...added] } : r,
      ),
    }));
  };

  const expenseTotal = EXPENSE_CATS.reduce(
    (sum, cat) =>
      expenses[cat].enabled
        ? sum + expenses[cat].entries.reduce((s, e) => s + toNum(e.amount), 0)
        : sum,
    0,
  );

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
    setExpenses(emptyExpenses());
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

    // 💰 ค่าใช้จ่าย — แต่ละรอบ/รายการ = 1 กล่อง (รูปแบบเดียวกับ Report.php)
    //   ยอด: fuel_cost[] / accommodation_cost[] / other_cost[] + other_cost_detail[] เรียงตามกล่อง
    //   ไฟล์: doc_cat[i] / doc_type[i] / doc_entry[i] / doc_files[i][] · ไฟล์เดิม: existing_doc[] + existing_doc_entry[]
    //   doc_entry = ลำดับกล่องที่ส่ง → เซิร์ฟเวอร์ผูกเป็นรอบของเอกสาร
    // expense_docs_sent บอกเซิร์ฟเวอร์ว่าแอปรุ่นนี้ส่งรายการเอกสารครบ — แอปรุ่นเก่าไม่ส่ง จึงไม่ไปลบเอกสารเดิม
    postData.append("expense_docs_sent", "1");
    const AMOUNT_FIELD: Record<ExpenseCat, string> = {
      fuel: "fuel_cost[]",
      hotel: "accommodation_cost[]",
      other: "other_cost[]",
    };
    const keptFuelLegacy: string[] = [];
    let docIdx = 0;
    EXPENSE_CATS.forEach((cat) => {
      if (!expenses[cat].enabled) return;
      // กล่องที่ว่างทั้งหมด (ไม่มียอด รายละเอียด หรือไฟล์) ไม่ต้องส่ง
      const sent = expenses[cat].entries.filter(
        (e) =>
          e.amount.trim() !== "" ||
          e.detail.trim() !== "" ||
          e.existing.length > 0 ||
          e.legacy.length > 0 ||
          [...e.slipRows, ...e.docRows].some((r) => r.files.length > 0),
      );
      sent.forEach((e, entryIdx) => {
        postData.append(AMOUNT_FIELD[cat], e.amount.replace(/,/g, "").trim() || "0");
        if (cat === "other") postData.append("other_cost_detail[]", e.detail.trim());
        if (cat === "fuel") keptFuelLegacy.push(...e.legacy);
        e.existing.forEach((d) => {
          postData.append("existing_doc[]", d.file);
          postData.append("existing_doc_entry[]", String(entryIdx));
        });
        [...e.slipRows, ...e.docRows].forEach((row) => {
          if (row.files.length === 0) return;
          const i = docIdx++;
          postData.append(`doc_cat[${i}]`, cat);
          postData.append(`doc_type[${i}]`, row.type);
          postData.append(`doc_entry[${i}]`, String(entryIdx));
          row.files.forEach((f) =>
            postData.append(`doc_files[${i}][]`, {
              uri: f.uri,
              name: f.name,
              type: f.mimeType,
            } as any),
          );
        });
      });
    });
    // สลิปค่าน้ำมันรูปแบบเดิม (คอลัมน์ fuel_receipt) ที่ยังเก็บไว้
    if (expenses.fuel.enabled) {
      postData.append("kept_fuel_receipts", JSON.stringify(keptFuelLegacy));
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
              if (onClose) onClose(true); // แก้ไขจากหน้าประวัติ → ปิดป๊อปอัป กลับหน้าประวัติ
              else router.replace("/(tabs)/Profile");
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

  // 🖼️ รูปย่อของไฟล์ (รูป = ภาพจริง · ไฟล์อื่น = ไอคอน + นามสกุล) พร้อมปุ่ม ✕ (ถ้าลบได้)
  const renderThumb = (
    key: string,
    opts: { uri?: string; name: string; onOpen?: () => void; onRemove?: () => void },
  ) => (
    <View key={key} style={styles.slipThumbWrap}>
      <TouchableOpacity activeOpacity={0.8} onPress={opts.onOpen} disabled={!opts.onOpen}>
        {opts.uri && isImageFile(opts.name) ? (
          <Image source={{ uri: opts.uri }} style={styles.slipThumb} />
        ) : (
          <View style={[styles.slipThumb, styles.fileThumb]}>
            <Ionicons name="document-text" size={22} color="#dc2626" />
            <Text style={styles.fileThumbExt} numberOfLines={1}>
              {fileExt(opts.name)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
      {opts.onRemove && (
        <TouchableOpacity style={styles.slipThumbDel} onPress={opts.onRemove} hitSlop={8}>
          <Ionicons name="close" size={12} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );

  const openUpload = (file: string) =>
    Linking.openURL(`${IMG_BASE_URL}/${encodeURIComponent(file)}`);

  // 📎 ส่วน "สลิป" หรือ "แนบเอกสาร" ในกล่องรอบ (หน้าตาเหมือนฟอร์มเว็บ Report.php)
  const renderRowSection = (cat: ExpenseCat, entry: ExpenseEntry, list: RowList) => {
    const isSlip = list === "slipRows";
    const rows = entry[list];
    // ไฟล์เดิมของกล่อง: ประเภทสลิปโอนเงินแสดงในส่วนสลิป · ประเภทอื่นแสดงในส่วนแนบเอกสาร
    const existing = entry.existing.filter((d) => (d.type === "slip") === isSlip);
    const legacy = isSlip ? entry.legacy : [];
    const pickLabel = isSlip ? "เลือกสลิป" : "เลือกไฟล์";
    return (
      <View style={styles.secWrap}>
        <View style={styles.secHead}>
          <View style={styles.docBoxTitleRow}>
            <Ionicons
              name={isSlip ? "receipt" : "attach"}
              size={15}
              color="#334155"
            />
            <Text style={styles.docBoxTitle}>{isSlip ? "สลิป" : "แนบเอกสาร"}</Text>
          </View>
          <TouchableOpacity
            style={styles.secAddBtn}
            onPress={() => addRow(cat, entry.key, list)}
          >
            <Text style={styles.secAddBtnText}>
              {isSlip ? "+ เพิ่มสลิป" : "+ เพิ่มเอกสาร"}
            </Text>
          </TouchableOpacity>
        </View>

        {(existing.length > 0 || legacy.length > 0) && (
          <View style={styles.thumbWrap}>
            {legacy.map((f, i) =>
              renderThumb(`legacy-${f}-${i}`, {
                uri: `${IMG_BASE_URL}/${encodeURIComponent(f)}`,
                name: f,
                onOpen: () => openUpload(f),
                onRemove:
                  cat === "fuel" ? () => removeLegacy(cat, entry.key, f) : undefined,
              }),
            )}
            {existing.map((d) =>
              renderThumb(`doc-${d.file}`, {
                uri: `${IMG_BASE_URL}/${encodeURIComponent(d.file)}`,
                name: d.file,
                onOpen: () => openUpload(d.file),
                onRemove: () => removeExistingDoc(cat, entry.key, d.file),
              }),
            )}
          </View>
        )}

        {rows.length > 0 && (
          <View style={styles.docRowsWrap}>
            {rows.map((row) => {
              const n = row.files.length;
              return (
                <View key={row.key} style={{ gap: 8 }}>
                  <View style={styles.docRow}>
                    <TouchableOpacity
                      style={styles.docTypeSelect}
                      onPress={() =>
                        setDocTypePicker({ cat, entryKey: entry.key, list, rowKey: row.key })
                      }
                    >
                      <Text style={styles.docTypeText} numberOfLines={1}>
                        {DOC_TYPE_LABEL[row.type]}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color="#334155" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.docPick, n > 0 && styles.docPickActive]}
                      onPress={() => pickRowFiles(cat, entry.key, list, row.key)}
                    >
                      <Ionicons
                        name={n > 0 ? "add-circle" : "cloud-upload-outline"}
                        size={16}
                        color={n > 0 ? "#166534" : "#334155"}
                      />
                      <Text
                        style={[styles.docPickText, n > 0 && { color: "#166534" }]}
                        numberOfLines={1}
                      >
                        {n === 0 ? pickLabel : `เลือกแล้ว ${n} ไฟล์ · กดเพื่อเพิ่ม`}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.docDelBtn}
                      onPress={() => removeRow(cat, entry.key, list, row.key)}
                    >
                      <Ionicons name="trash" size={16} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                  {n > 0 && (
                    <View style={styles.thumbWrap}>
                      {row.files.map((f, i) =>
                        renderThumb(`${row.key}-${i}`, {
                          uri: f.uri,
                          name: f.name,
                          onRemove: () =>
                            removePickedFile(cat, entry.key, list, row.key, i),
                        }),
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // 📦 กล่องรอบ/รายการ 1 กล่อง: หัว "รอบ N" + ปุ่มลบ · ยอดเงิน · สลิป · แนบเอกสาร
  const renderEntry = (cat: ExpenseCat, entry: ExpenseEntry, idx: number) => (
    <View key={entry.key} style={styles.entryBox}>
      <View style={styles.entryHead}>
        <Text style={styles.entryTitle}>
          {ENTRY_LABEL[cat]} {idx + 1}
        </Text>
        <TouchableOpacity
          style={styles.entryDelBtn}
          onPress={() => removeEntry(cat, entry.key)}
          hitSlop={6}
        >
          <Ionicons name="trash" size={15} color="#1e293b" />
        </TouchableOpacity>
      </View>
      {cat === "other" && (
        <TextInput
          style={styles.expInput}
          placeholder="รายละเอียด"
          placeholderTextColor="#94a3b8"
          value={entry.detail}
          onChangeText={(t) => updateEntry(cat, entry.key, (e) => ({ ...e, detail: t }))}
        />
      )}
      <TextInput
        style={styles.expInput}
        placeholder="บาท"
        placeholderTextColor="#94a3b8"
        keyboardType="decimal-pad"
        value={entry.amount}
        onChangeText={(t) => updateEntry(cat, entry.key, (e) => ({ ...e, amount: t }))}
      />
      {renderRowSection(cat, entry, "slipRows")}
      {renderRowSection(cat, entry, "docRows")}
    </View>
  );

  const renderEntries = (cat: ExpenseCat) => (
    <>
      {expenses[cat].entries.map((e, i) => renderEntry(cat, e, i))}
      <TouchableOpacity
        style={styles.addEntryBtn}
        onPress={() => addEntry(cat)}
        activeOpacity={0.7}
      >
        <Ionicons name="add-circle" size={22} color="#2563eb" />
        <Text style={styles.addEntryBtnText}>
          {cat === "fuel" ? "เพิ่มรอบ" : "เพิ่มรายการ"}
        </Text>
      </TouchableOpacity>
    </>
  );

  const currentPickerType = docTypePicker
    ? expenses[docTypePicker.cat].entries
        .find((e) => e.key === docTypePicker.entryKey)
        ?.[docTypePicker.list].find((r) => r.key === docTypePicker.rowKey)?.type
    : undefined;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#f8f9fd" }}
      edges={["top"]}
    >
      {/* แถบหัวเมื่อเปิดเป็นป๊อปอัปจากหน้าประวัติ: ปุ่มปิดกลับหน้าประวัติ */}
      {onClose && (
        <View style={styles.embedBar}>
          <TouchableOpacity
            onPress={() =>
              Alert.alert("ปิดหน้าแก้ไข", "ข้อมูลที่แก้ไขยังไม่ได้บันทึก ต้องการปิดใช่หรือไม่?", [
                { text: "แก้ไขต่อ", style: "cancel" },
                { text: "ปิด", style: "destructive", onPress: () => onClose(false) },
              ])
            }
            style={styles.embedCloseBtn}
            hitSlop={8}
          >
            <Ionicons name="close" size={22} color="#334155" />
          </TouchableOpacity>
          <Text style={styles.embedTitle}>แก้ไขรายงาน</Text>
          <View style={{ width: 40 }} />
        </View>
      )}
      {/* Android (RN 0.88) เป็น edge-to-edge: หน้าจอไม่หดหนีคีย์บอร์ดเองแล้ว ช่องด้านล่างจึงโดนคีย์บอร์ดบังจนพิมพ์ไม่ได้
          → ดันเนื้อหาขึ้นเองทั้ง iOS และ Android */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {!onClose && (
          <Text style={styles.mainHeader}>📝 รายงานฝ่ายขาย (Sales Report)</Text>
        )}

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
                  // ออกจากช่องแล้วปิดรายการค้นหา ไม่ให้ค้างทับช่องด้านล่าง (ประเภท / มูลค่า / ชื่อโครงการ)
                  // หน่วงไว้เล็กน้อยให้การแตะเลือกชื่อลูกค้าทำงานก่อน
                  onBlur={() =>
                    setTimeout(() => updateWorkBox(box.id, "showSuggestions", false), 200)
                  }
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

              <View
                style={[
                  styles.row,
                  // รายการดรอปดาวน์ต้องอยู่เหนือช่องถัดไป (Android เรียงชั้นตาม zIndex/elevation ของแถว)
                  typeDropdownBox === box.id && { zIndex: 999, elevation: 10 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>ประเภท</Text>
                  {/* ดรอปดาวน์ประเภทลูกค้า: กดแล้วรายการเลื่อนลงมาจากกรอบ (ธีมเดิม: ขอบ/ตัวอักษรสีตามประเภท)
                      ระบบยังเลือกให้อัตโนมัติตามชื่อลูกค้าใน master */}
                  <View style={{ position: "relative", zIndex: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() =>
                      setTypeDropdownBox((cur) => (cur === box.id ? null : box.id))
                    }
                    style={[
                      styles.miniSelector,
                      styles.custTypeSelector,
                      { borderColor: CUSTOMER_TYPE_STYLE[box.type]?.color || COLORS.slate },
                    ]}
                  >
                    <Text
                      style={[
                        styles.custTypeText,
                        { color: CUSTOMER_TYPE_STYLE[box.type]?.color || COLORS.slate },
                      ]}
                      numberOfLines={1}
                    >
                      {CUSTOMER_TYPE_STYLE[box.type]
                        ? `${CUSTOMER_TYPE_STYLE[box.type].emoji} ${box.type}`
                        : "เลือกประเภท"}
                    </Text>
                    <Ionicons
                      name={typeDropdownBox === box.id ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={CUSTOMER_TYPE_STYLE[box.type]?.color || COLORS.slate}
                    />
                  </TouchableOpacity>
                  {typeDropdownBox === box.id && (
                    <Animated.View
                      entering={FadeInDown.duration(160)}
                      style={styles.custTypeDropdown}
                    >
                      {CUSTOMER_TYPES.map((t, i) => {
                        const on = box.type === t;
                        const c = CUSTOMER_TYPE_STYLE[t].color;
                        return (
                          <TouchableOpacity
                            key={t}
                            onPress={() => {
                              updateWorkBox(box.id, "type", t);
                              setTypeDropdownBox(null);
                            }}
                            style={[
                              styles.custTypeOption,
                              i === CUSTOMER_TYPES.length - 1 && { borderBottomWidth: 0 },
                              on && { backgroundColor: c + "14" },
                            ]}
                          >
                            <Text
                              style={[
                                styles.custTypeOptionText,
                                on && { color: c, fontWeight: "700" },
                              ]}
                            >
                              {CUSTOMER_TYPE_STYLE[t].emoji} {t}
                            </Text>
                            {on && <Ionicons name="checkmark" size={16} color={c} />}
                          </TouchableOpacity>
                        );
                      })}
                    </Animated.View>
                  )}
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

          {/* ⛽ ค่าน้ำมัน — แยกเป็นรอบ */}
          <ExpenseCard
            icon="gas-station"
            title="ค่าน้ำมัน"
            enabled={expenses.fuel.enabled}
            onToggle={() => toggleExpense("fuel")}
          >
            {renderEntries("fuel")}
          </ExpenseCard>

          {/* 🏨 ค่าที่พัก */}
          <ExpenseCard
            icon="office-building"
            title="ค่าที่พัก"
            enabled={expenses.hotel.enabled}
            onToggle={() => toggleExpense("hotel")}
          >
            {renderEntries("hotel")}
          </ExpenseCard>

          {/* 🧩 อื่นๆ */}
          <ExpenseCard
            icon="dots-horizontal"
            title="อื่นๆ"
            enabled={expenses.other.enabled}
            onToggle={() => toggleExpense("other")}
          >
            {renderEntries("other")}
          </ExpenseCard>

          {/* 💰 รวม */}
          <LinearGradient
            colors={["#0047b3", "#0a84ff"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.totalBar}
          >
            <Text style={styles.totalBarText}>รวม:</Text>
            <Text style={styles.totalBarAmount}>
              {expenseTotal.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <Text style={styles.totalBarText}>บาท</Text>
          </LinearGradient>
        </View>

        {/* 📎 เลือกประเภทเอกสาร */}
        <Modal
          visible={!!docTypePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setDocTypePicker(null)}
        >
          <Pressable
            style={styles.docTypeOverlay}
            onPress={() => setDocTypePicker(null)}
          >
            <View style={styles.docTypeSheet}>
              <Text style={styles.docTypeSheetTitle}>ประเภทเอกสาร</Text>
              {DOC_TYPES.map((opt) => {
                const active = currentPickerType === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={styles.docTypeOption}
                    onPress={() => {
                      if (docTypePicker)
                        setRowType(
                          docTypePicker.cat,
                          docTypePicker.entryKey,
                          docTypePicker.list,
                          docTypePicker.rowKey,
                          opt.key,
                        );
                      setDocTypePicker(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.docTypeOptionText,
                        active && { color: "#2563eb", fontWeight: "700" },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {active && (
                      <Ionicons name="checkmark" size={18} color="#2563eb" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Modal>

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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const SectionHeader = ({ icon, title, color }: any) => (
  <View style={styles.sectionHeader}>
    <Ionicons name={icon} size={20} color={color || PRIMARY_COLOR} />
    <Text style={styles.sectionTitle}> {title}</Text>
  </View>
);

// การ์ดหมวดค่าใช้จ่าย: ติ๊กเปิด/ปิด แล้วขอบซ้ายเป็นสีน้ำเงินแบบฟอร์มเว็บ
const ExpenseCard = ({ icon, title, enabled, onToggle, children }: any) => (
  <View style={[styles.expCard, enabled && styles.expCardActive]}>
    <TouchableOpacity
      style={styles.expCardHeader}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <Ionicons
        name={enabled ? "checkbox" : "square-outline"}
        size={22}
        color={enabled ? "#2563eb" : "#64748b"}
      />
      <MaterialCommunityIcons name={icon} size={18} color="#1e293b" />
      <Text style={styles.expCardTitle}>{title}</Text>
    </TouchableOpacity>
    {enabled && <View style={styles.expCardBody}>{children}</View>}
  </View>
);

const styles = StyleSheet.create({
  container: { padding: 15 },
  embedBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  embedCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  embedTitle: { fontSize: 17, fontWeight: "800", color: "#1e293b" },
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
  // ช่องประเภทลูกค้า + รายการที่เลื่อนลงมาทับเนื้อหาด้านล่าง (แบบ select บนเว็บ)
  custTypeSelector: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
  },
  custTypeText: { fontWeight: "700", fontSize: 12, flexShrink: 1 },
  custTypeDropdown: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    overflow: "hidden",
    zIndex: 9999,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  custTypeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  custTypeOptionText: { fontSize: 13, color: "#334155" },
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
  // --- เบิกค่าใช้จ่าย (แบบฟอร์มเว็บ) ---
  expCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  expCardActive: {
    backgroundColor: "#f8fafc",
    borderColor: "#2563eb",
    borderLeftWidth: 4,
  },
  expCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  expCardTitle: { fontWeight: "bold", fontSize: 15, color: "#1e293b" },
  expCardBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e8edf3",
    gap: 10,
  },
  expRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  expInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 15,
    backgroundColor: "#fff",
    color: "#1e293b",
  },
  // กล่องรอบ/รายการ (เส้นประแบบฟอร์มเว็บ)
  entryBox: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    backgroundColor: "#fff",
  },
  entryHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  entryTitle: { fontWeight: "800", color: "#1d4ed8", fontSize: 14 },
  entryDelBtn: {
    width: 32,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#64748b",
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  secWrap: { gap: 8 },
  secHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  secAddBtn: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderStyle: "dashed",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  secAddBtnText: { fontSize: 12, fontWeight: "700", color: "#1d4ed8" },
  addEntryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: "#3b82f6",
    borderStyle: "dashed",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
  },
  addEntryBtnText: { fontSize: 16, fontWeight: "700", color: "#2563eb" },
  thumbWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 4 },
  fileThumb: { alignItems: "center", justifyContent: "center", backgroundColor: "#fef2f2" },
  fileThumbExt: { fontSize: 9, fontWeight: "700", color: "#dc2626" },
  slipThumbWrap: { width: 64, height: 64 },
  slipThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  slipThumbDel: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  docBox: {
    marginTop: 2,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e8edf3",
    gap: 8,
  },
  docBoxTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  docBoxTitle: { fontSize: 13, fontWeight: "600", color: "#475569" },
  docRowsWrap: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 8,
    gap: 8,
  },
  docRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  docTypeSelect: {
    width: 122,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  docTypeText: { fontSize: 13, color: "#1e293b", flex: 1 },
  docPick: {
    flex: 1,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  docPickActive: { backgroundColor: "#dcfce7" },
  docPickText: { fontSize: 13, color: "#334155", flex: 1, fontWeight: "600" },
  docDelBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  docAddBtn: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 6,
    backgroundColor: "#f1f5f9",
    paddingVertical: 6,
    alignItems: "center",
  },
  docAddBtnText: { fontSize: 13, color: "#1e293b" },
  docChipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  docChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#eff6ff",
    maxWidth: "100%",
  },
  docChipText: { fontSize: 12, color: "#1d4ed8", flexShrink: 1 },
  docChipDel: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  totalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
  },
  totalBarText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  totalBarAmount: { color: "#fff", fontWeight: "800", fontSize: 18 },
  docTypeOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 30,
  },
  docTypeSheet: { backgroundColor: "#fff", borderRadius: 16, paddingVertical: 8 },
  docTypeSheetTitle: {
    fontWeight: "bold",
    fontSize: 15,
    color: "#334155",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  docTypeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  docTypeOptionText: { fontSize: 15, color: "#1e293b" },
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
