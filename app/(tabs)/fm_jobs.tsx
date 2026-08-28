// app/(tabs)/fm_jobs.tsx
// ตารางงานขนส่ง (Fleet Schedule) — คนขับ → รายการงาน (accordion)
// อ้างอิง fm_jobs.php + api_fm.php (ดู docs/FleetSchedule_Spec.md)

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";

import { API_BASE, IMG_BASE_URL } from "../../constants/config";

// ------------------------------------------------------------------
// ค่าคงที่: สถานะงาน + สี (ตาม spec ข้อ 1)
// ------------------------------------------------------------------
const STATUS_ORDER = ["pending", "in_progress", "completed", "failed"] as const;
type JobStatus = (typeof STATUS_ORDER)[number];

const STATUS_META: Record<
  JobStatus,
  { label: string; short: string; color: string }
> = {
  pending: { label: "⏳ รอดำเนินการ", short: "รอดำเนินการ", color: "#f59e0b" },
  in_progress: { label: "🚚 กำลังส่ง", short: "กำลังส่ง", color: "#0ea5e9" },
  completed: { label: "✅ เสร็จสิ้น", short: "เสร็จสิ้น", color: "#10b981" },
  failed: { label: "❌ ไม่สำเร็จ", short: "ไม่สำเร็จ", color: "#ef4444" },
};

const COLORS = {
  light: {
    bg: "#f1f5f9",
    bgSecondary: "#f8fafc",
    card: "#ffffff",
    text: "#1e293b",
    textSecondary: "#64748b",
    border: "#e2e8f0",
    primary: "#3b82f6",
    overlay: "rgba(0,0,0,0.5)",
  },
  dark: {
    bg: "#0f172a",
    bgSecondary: "#1e293b",
    card: "#1e293b",
    text: "#f1f5f9",
    textSecondary: "#cbd5e1",
    border: "#334155",
    primary: "#60a5fa",
    overlay: "rgba(0,0,0,0.7)",
  },
};

// ------------------------------------------------------------------
// Helper วันเวลา
// ------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");

// คืนค่ารูปแบบ YYYY-MM-DD HH:MM:SS (โซนเวลาเครื่อง = เวลาไทย)
const toMysqlDateTime = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const parseDateTime = (s?: string | null): Date | null => {
  if (!s) return null;
  // รองรับ "YYYY-MM-DD HH:MM:SS" (แปลง space เป็น T กัน iOS งอแง)
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

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

const dateKeyOf = (s?: string | null) => (s ? String(s).substring(0, 10) : "");

const formatDateHead = (dateKey: string) => {
  const d = parseDateTime(`${dateKey} 00:00:00`);
  if (!d) return dateKey;
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
};

const formatTime = (s?: string | null) =>
  s ? String(s).substring(11, 16) : "--:--";

const formatDateTimeFull = (s?: string | null) => {
  const d = parseDateTime(s);
  if (!d) return "-";
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543} เวลา ${pad(d.getHours())}:${pad(d.getMinutes())} น.`;
};

// ------------------------------------------------------------------
// รูปหลักฐาน
// ------------------------------------------------------------------
const getProofUrl = (filename?: string | null): string => {
  if (!filename || filename === "null" || filename === "") return "";
  if (filename.startsWith("http")) return filename;
  let base = IMG_BASE_URL.replace(/\/uploads\/?$/, "").replace(/\/$/, "");
  let name = filename.replace(/^\/?(uploads\/)?(proofs\/)?/, "");
  return `${base}/uploads/proofs/${name}`;
};

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
interface Driver {
  id: number;
  name: string;
  category?: string;
  priority?: number;
  default_vehicle_id?: number | null;
}
interface Vehicle {
  id: number;
  plate_number?: string;
  fleet_number?: string;
}
interface Job {
  id: number;
  customer_name?: string;
  customer_phone?: string;
  customer_phone2?: string;
  job_desc?: string;
  origin?: string;
  destination?: string;
  gps_link?: string;
  driver_id?: number;
  assistant_id?: number;
  vehicle_id?: number;
  start_time?: string;
  end_time?: string;
  status?: JobStatus;
  cost?: string | number;
  proof_image?: string;
  group_id?: number;
  group_name?: string;
  group_price?: string | number;
}

interface JobForm {
  id?: number;
  customer_name: string;
  customer_phone: string;
  customer_phone2: string;
  job_desc: string;
  origin: string;
  destination: string;
  gps_link: string;
  driver_id: number | null;
  assistant_id: number | null;
  vehicle_id: number | null;
  start_time: string; // YYYY-MM-DD HH:MM:SS
  cost: string;
}

const emptyForm = (
  driverId: number | null,
  vehicleId: number | null,
): JobForm => ({
  customer_name: "",
  customer_phone: "",
  customer_phone2: "",
  job_desc: "",
  origin: "",
  destination: "",
  gps_link: "",
  driver_id: driverId,
  assistant_id: null,
  vehicle_id: vehicleId,
  start_time: toMysqlDateTime(new Date()),
  cost: "",
});

// ==================================================================
// Component หลัก
// ==================================================================
export default function FmJobs() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const s = useMemo(() => getStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [provinces, setProvinces] = useState<{ name_th: string }[]>([]);

  const [expandedDrivers, setExpandedDrivers] = useState<number[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState<string>(""); // YYYY-MM-DD ("" = ทุกวัน)
  const [showFilterDate, setShowFilterDate] = useState(false);
  const [filterDriverId, setFilterDriverId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<JobStatus | "all">("all");
  const [showFilters, setShowFilters] = useState(false);

  // การเลือกงานเพื่อรวมบิล
  const [selectMode, setSelectMode] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
  const [groupModal, setGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupPrice, setGroupPrice] = useState("");

  // Job modal (เพิ่ม/แก้ไข)
  const [jobModal, setJobModal] = useState(false);
  const [form, setForm] = useState<JobForm>(emptyForm(null, null));
  const [saving, setSaving] = useState(false);
  const [showFormDate, setShowFormDate] = useState(false);
  const [showFormTime, setShowFormTime] = useState(false);
  const [wipYear, setWipYear] = useState(
    String(new Date().getFullYear() + 543),
  );
  const [wipNo, setWipNo] = useState("");
  const [wipLoading, setWipLoading] = useState(false);
  const [assistantPickerOpen, setAssistantPickerOpen] = useState(false);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);

  // Complete modal (สถานะ completed)
  const [completeModal, setCompleteModal] = useState(false);
  const [completeJobTarget, setCompleteJobTarget] = useState<Job | null>(null);
  const [completeEndTime, setCompleteEndTime] = useState(
    toMysqlDateTime(new Date()),
  );
  const [completeProof, setCompleteProof] = useState<string | null>(null);
  const [showCompleteDate, setShowCompleteDate] = useState(false);
  const [showCompleteTime, setShowCompleteTime] = useState(false);
  const [completing, setCompleting] = useState(false);

  // สถานะ dropdown ต่อ 1 การ์ด
  const [statusMenuJobId, setStatusMenuJobId] = useState<number | null>(null);

  // Preview รูปเต็มจอ
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Popup รายละเอียดงาน
  const [detailJob, setDetailJob] = useState<Job | null>(null);

  // ----------------------------------------------------------------
  // โหลดข้อมูล
  // ----------------------------------------------------------------
  const fetchSchedule = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api_fm.php`, {
        params: { action: "fetch_schedule" },
      });
      const d = res.data || {};
      const drv: Driver[] = (d.drivers || []).slice();
      drv.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
      setDrivers(drv);
      setVehicles(d.vehicles || []);
      setJobs(d.jobs || []);
    } catch (e) {
      console.error("fetch_schedule error:", e);
      Alert.alert("ผิดพลาด", "โหลดตารางงานไม่สำเร็จ");
    }
  };

  const fetchProvinces = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api_fm.php`, {
        params: { action: "fetch_provinces" },
      });
      setProvinces(
        Array.isArray(res.data) ? res.data : res.data?.provinces || [],
      );
    } catch (e) {
      // ไม่ critical — แค่ทำให้ autocomplete ว่าง
      console.log("fetch_provinces error:", e);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([fetchSchedule(), fetchProvinces()]);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSchedule();
    setRefreshing(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  // ----------------------------------------------------------------
  // POST helper (FormData)
  // ----------------------------------------------------------------
  const postForm = async (action: string, fields: Record<string, any>) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      fd.append(k, typeof v === "number" ? String(v) : v);
    });
    const res = await fetch(`${API_BASE}/api_fm.php?action=${action}`, {
      method: "POST",
      body: fd,
      headers: { Accept: "application/json" },
    });
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch {
      console.log(`ผลลัพธ์ ${action} ไม่ใช่ JSON:`, txt);
      throw new Error("เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ");
    }
  };

  // ----------------------------------------------------------------
  // การกรอง
  // ----------------------------------------------------------------
  const vehicleLabel = (id?: number | null) => {
    if (!id) return "";
    const v = vehicles.find((x) => x.id == id);
    if (!v) return "";
    return `${v.fleet_number || ""}${v.plate_number ? ` (${v.plate_number})` : ""}`.trim();
  };

  const driverName = (id?: number | null) => {
    if (!id) return "-";
    return drivers.find((d) => d.id == id)?.name || "ไม่ระบุ";
  };

  const jobMatchesFilter = (job: Job) => {
    if (filterStatus !== "all" && job.status !== filterStatus) return false;
    if (filterDate && dateKeyOf(job.start_time) !== filterDate) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay =
        `${job.customer_name || ""} ${job.destination || ""} ${job.origin || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  // งานของคนขับ 1 คน (จับคู่ทั้ง driver_id และ assistant_id) + ผ่าน filter
  const jobsForDriver = (driverId: number) =>
    jobs
      .filter(
        (j) =>
          (j.driver_id == driverId || j.assistant_id == driverId) &&
          jobMatchesFilter(j),
      )
      .sort(
        (a, b) =>
          (parseDateTime(b.start_time)?.getTime() || 0) -
          (parseDateTime(a.start_time)?.getTime() || 0),
      );

  // จัดกลุ่มงานตามวัน (วันใหม่ → เก่า)
  const groupByDate = (list: Job[]) => {
    const map: Record<string, Job[]> = {};
    list.forEach((j) => {
      const key = dateKeyOf(j.start_time) || "ไม่ระบุวันที่";
      (map[key] = map[key] || []).push(j);
    });
    return Object.keys(map)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((key) => ({ key, jobs: map[key] }));
  };

  const visibleDrivers = useMemo(() => {
    let list = drivers;
    if (filterDriverId) list = list.filter((d) => d.id == filterDriverId);
    return list;
  }, [drivers, filterDriverId]);

  // ----------------------------------------------------------------
  // Actions
  // ----------------------------------------------------------------
  const toggleDriver = (id: number) =>
    setExpandedDrivers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const openAddJob = (driverId: number) => {
    const drv = drivers.find((d) => d.id == driverId);
    setForm(emptyForm(driverId, drv?.default_vehicle_id ?? null));
    setWipNo("");
    setJobModal(true);
  };

  const openEditJob = (job: Job) => {
    setForm({
      id: job.id,
      customer_name: job.customer_name || "",
      customer_phone: job.customer_phone || "",
      customer_phone2: job.customer_phone2 || "",
      job_desc: job.job_desc || "",
      origin: job.origin || "",
      destination: job.destination || "",
      gps_link: job.gps_link || "",
      driver_id: job.driver_id ?? null,
      assistant_id: job.assistant_id ?? null,
      vehicle_id: job.vehicle_id ?? null,
      start_time: job.start_time || toMysqlDateTime(new Date()),
      cost: job.cost != null ? String(job.cost) : "",
    });
    setWipNo("");
    setJobModal(true);
  };

  const fetchWipInfo = async () => {
    if (!wipNo.trim()) {
      Alert.alert("แจ้งเตือน", "กรุณากรอกเลขหน้างานก่อน");
      return;
    }
    setWipLoading(true);
    try {
      const data = await postForm("fetch_project_wip_info", {
        year: wipYear.trim(),
        job_number: wipNo.trim(),
      });
      if (data?.success) {
        setForm((f) => ({
          ...f,
          customer_name: data.customer || data.project_name || f.customer_name,
          customer_phone: data.phone || f.customer_phone,
        }));
        Alert.alert("สำเร็จ", "ดึงข้อมูลลูกค้าเรียบร้อย");
      } else {
        Alert.alert("ไม่พบข้อมูล", data?.message || "ไม่พบเลขหน้างานนี้");
      }
    } catch (e: any) {
      Alert.alert("ผิดพลาด", e.message || "ดึงข้อมูลไม่สำเร็จ");
    } finally {
      setWipLoading(false);
    }
  };

  const saveJob = async () => {
    if (!form.customer_name.trim()) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณาระบุชื่อลูกค้า/หน้างาน");
      return;
    }
    if (!form.destination.trim()) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณาระบุปลายทาง");
      return;
    }
    if (!form.driver_id) {
      Alert.alert("ข้อมูลไม่ครบ", "ไม่พบคนขับของงานนี้");
      return;
    }
    if (!form.start_time) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณาระบุวัน-เวลาเริ่ม");
      return;
    }
    setSaving(true);
    try {
      const data = await postForm("save_job", {
        id: form.id,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        customer_phone2: form.customer_phone2.trim(),
        job_desc: form.job_desc.trim(),
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        gps_link: form.gps_link.trim(),
        driver_id: form.driver_id,
        assistant_id: form.assistant_id,
        vehicle_id: form.vehicle_id,
        start_time: form.start_time,
        cost: form.cost.trim(),
      });
      if (data?.success) {
        setJobModal(false);
        await fetchSchedule();
      } else {
        Alert.alert("บันทึกไม่สำเร็จ", data?.message || "เกิดข้อผิดพลาด");
      }
    } catch (e: any) {
      Alert.alert("ผิดพลาด", e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (job: Job) => {
    Alert.alert(
      "ลบงาน",
      `ต้องการลบงานของ "${job.customer_name || "-"}" ใช่หรือไม่?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ลบ",
          style: "destructive",
          onPress: async () => {
            try {
              const data = await postForm("delete_job", { id: job.id });
              if (data?.success) await fetchSchedule();
              else Alert.alert("ลบไม่สำเร็จ", data?.message || "");
            } catch (e: any) {
              Alert.alert("ผิดพลาด", e.message || "ลบไม่สำเร็จ");
            }
          },
        },
      ],
    );
  };

  const changeStatus = async (job: Job, status: JobStatus) => {
    setStatusMenuJobId(null);
    if (status === "completed") {
      // เปิด modal ขอ end_time + รูป
      setCompleteJobTarget(job);
      setCompleteEndTime(job.end_time || toMysqlDateTime(new Date()));
      setCompleteProof(null);
      setCompleteModal(true);
      return;
    }
    try {
      const data = await postForm("update_status", { id: job.id, status });
      if (data?.success) await fetchSchedule();
      else Alert.alert("เปลี่ยนสถานะไม่สำเร็จ", data?.message || "");
    } catch (e: any) {
      Alert.alert("ผิดพลาด", e.message || "เปลี่ยนสถานะไม่สำเร็จ");
    }
  };

  const pickCompleteProof = async () => {
    Alert.alert("แนบรูปหลักฐาน", "เลือกวิธี", [
      {
        text: "📷 ถ่ายรูป",
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted)
            return Alert.alert("แจ้งเตือน", "กรุณาอนุญาตกล้อง");
          const r = await ImagePicker.launchCameraAsync({ quality: 0.5 });
          if (!r.canceled) setCompleteProof(r.assets[0].uri);
        },
      },
      {
        text: "🖼️ เลือกจากคลัง",
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted)
            return Alert.alert("แจ้งเตือน", "กรุณาอนุญาตคลังรูป");
          const r = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.5,
          });
          if (!r.canceled) setCompleteProof(r.assets[0].uri);
        },
      },
      { text: "ยกเลิก", style: "cancel" },
    ]);
  };

  const submitComplete = async () => {
    if (!completeJobTarget) return;
    setCompleting(true);
    try {
      const fd = new FormData();
      fd.append("id", String(completeJobTarget.id));
      fd.append("end_time", completeEndTime);
      if (completeProof) {
        const ext = completeProof.split(".").pop() || "jpg";
        fd.append("proof_image", {
          uri: completeProof,
          name: `proof_${Date.now()}.${ext}`,
          type: `image/${ext === "jpg" ? "jpeg" : ext}`,
        } as any);
      }
      const res = await fetch(`${API_BASE}/api_fm.php?action=complete_job`, {
        method: "POST",
        body: fd,
        headers: { Accept: "application/json" },
      });
      const txt = await res.text();
      let data: any;
      try {
        data = JSON.parse(txt);
      } catch {
        throw new Error("เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ");
      }
      if (data?.success) {
        setCompleteModal(false);
        setCompleteJobTarget(null);
        await fetchSchedule();
      } else {
        Alert.alert("บันทึกไม่สำเร็จ", data?.message || "");
      }
    } catch (e: any) {
      Alert.alert("ผิดพลาด", e.message || "บันทึกงานจบไม่สำเร็จ");
    } finally {
      setCompleting(false);
    }
  };

  const toggleSelectJob = (id: number) =>
    setSelectedJobIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const submitGroup = async () => {
    if (!groupName.trim())
      return Alert.alert("แจ้งเตือน", "กรุณาระบุชื่อบิล/กลุ่ม");
    if (selectedJobIds.length < 2)
      return Alert.alert("แจ้งเตือน", "เลือกงานอย่างน้อย 2 รายการ");
    // ใช้วันของงานแรกที่เลือกเป็น job_date
    const first = jobs.find((j) => j.id == selectedJobIds[0]);
    const jobDate =
      dateKeyOf(first?.start_time) ||
      toMysqlDateTime(new Date()).substring(0, 10);
    try {
      const data = await postForm("create_group", {
        group_name: groupName.trim(),
        total_price: groupPrice.trim() || "0",
        type: "cost",
        job_ids: JSON.stringify(selectedJobIds),
        job_date: jobDate,
      });
      if (data?.success) {
        setGroupModal(false);
        setSelectMode(false);
        setSelectedJobIds([]);
        setGroupName("");
        setGroupPrice("");
        await fetchSchedule();
      } else {
        Alert.alert("รวมบิลไม่สำเร็จ", data?.message || "");
      }
    } catch (e: any) {
      Alert.alert("ผิดพลาด", e.message || "รวมบิลไม่สำเร็จ");
    }
  };

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  const provinceSuggestions = (text: string) => {
    const q = text.trim();
    if (!q) return [];
    return provinces
      .filter((p) => p.name_th && p.name_th.includes(q) && p.name_th !== q)
      .slice(0, 6);
  };

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {/* Header + Filter */}
      <View
        style={[
          s.header,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={s.headerRow}>
          <View style={s.searchBox}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="ค้นหาลูกค้า / ปลายทาง"
              placeholderTextColor={colors.textSecondary}
              style={[s.searchInput, { color: colors.text }]}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons
                  name="close-circle"
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={[
              s.iconBtn,
              {
                backgroundColor: showFilters
                  ? colors.primary
                  : colors.bgSecondary,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setShowFilters((v) => !v)}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={showFilters ? "#fff" : colors.primary}
            />
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={{ marginTop: 10, gap: 10 }}>
            {/* วันที่ */}
            <View style={s.filterRow}>
              <TouchableOpacity
                style={[
                  s.pill,
                  {
                    backgroundColor: colors.bgSecondary,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setShowFilterDate(true)}
              >
                <Ionicons
                  name="calendar-outline"
                  size={15}
                  color={colors.primary}
                />
                <Text style={[s.pillText, { color: colors.text }]}>
                  {filterDate ? formatDateHead(filterDate) : "ทุกวัน"}
                </Text>
              </TouchableOpacity>
              {filterDate ? (
                <TouchableOpacity
                  style={s.clearPill}
                  onPress={() => setFilterDate("")}
                >
                  <Text
                    style={{
                      color: "#ef4444",
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    ล้างวันที่
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* คนขับ */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              <FilterChip
                active={filterDriverId === null}
                label="คนขับทั้งหมด"
                onPress={() => setFilterDriverId(null)}
                colors={colors}
              />
              {drivers.map((d) => (
                <FilterChip
                  key={d.id}
                  active={filterDriverId === d.id}
                  label={d.name}
                  onPress={() =>
                    setFilterDriverId(filterDriverId === d.id ? null : d.id)
                  }
                  colors={colors}
                />
              ))}
            </ScrollView>

            {/* สถานะ */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              <FilterChip
                active={filterStatus === "all"}
                label="ทุกสถานะ"
                onPress={() => setFilterStatus("all")}
                colors={colors}
              />
              {STATUS_ORDER.map((st) => (
                <FilterChip
                  key={st}
                  active={filterStatus === st}
                  label={STATUS_META[st].short}
                  dotColor={STATUS_META[st].color}
                  onPress={() =>
                    setFilterStatus(filterStatus === st ? "all" : st)
                  }
                  colors={colors}
                />
              ))}
            </ScrollView>

            {/* โหมดเลือกหลายงาน */}
            <TouchableOpacity
              style={[
                s.selectModeBtn,
                {
                  borderColor: colors.primary,
                  backgroundColor: selectMode ? colors.primary : "transparent",
                },
              ]}
              onPress={() => {
                setSelectMode((v) => !v);
                setSelectedJobIds([]);
              }}
            >
              <Ionicons
                name={selectMode ? "checkbox" : "checkbox-outline"}
                size={16}
                color={selectMode ? "#fff" : colors.primary}
              />
              <Text
                style={{
                  color: selectMode ? "#fff" : colors.primary,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {selectMode ? "ยกเลิกเลือก" : "เลือกหลายงาน (รวมบิล)"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* รายการคนขับ */}
      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 50 }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 12,
            paddingBottom: selectMode ? 100 : 30,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {visibleDrivers.length === 0 && (
            <Text
              style={{
                color: colors.textSecondary,
                textAlign: "center",
                marginTop: 40,
              }}
            >
              ไม่พบคนขับ
            </Text>
          )}
          {visibleDrivers.map((driver) => {
            const dJobs = jobsForDriver(driver.id);
            const isExpanded = expandedDrivers.includes(driver.id);
            const grouped = groupByDate(dJobs);
            return (
              <View
                key={driver.id}
                style={[
                  s.driverCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <TouchableOpacity
                  style={s.driverHeader}
                  onPress={() => toggleDriver(driver.id)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      s.avatar,
                      { backgroundColor: colors.primary + "22" },
                    ]}
                  >
                    <Text style={[s.avatarTxt, { color: colors.primary }]}>
                      {driver.name?.charAt(0) || "?"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.driverName, { color: colors.text }]}>
                      {driver.name}
                    </Text>
                    {driver.category === "partner" && (
                      <Text
                        style={{ fontSize: 10, color: colors.textSecondary }}
                      >
                        รถร่วม
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      s.countBadge,
                      {
                        backgroundColor: dJobs.length
                          ? colors.primary
                          : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}
                    >
                      {dJobs.length}
                    </Text>
                  </View>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={colors.textSecondary}
                    style={{ marginLeft: 8 }}
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View
                    style={[
                      s.jobsWrap,
                      {
                        borderTopColor: colors.border,
                        backgroundColor: colors.bgSecondary,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={[s.addJobBtn, { borderColor: colors.primary }]}
                      onPress={() => openAddJob(driver.id)}
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={18}
                        color={colors.primary}
                      />
                      <Text
                        style={{
                          color: colors.primary,
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        เพิ่มงานให้ {driver.name}
                      </Text>
                    </TouchableOpacity>

                    {grouped.length === 0 && (
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: 12,
                          textAlign: "center",
                          paddingVertical: 12,
                        }}
                      >
                        ยังไม่มีงาน
                      </Text>
                    )}

                    {grouped.map((g) => (
                      <View key={g.key} style={{ marginBottom: 6 }}>
                        <View style={s.dateHeadRow}>
                          <View
                            style={[
                              s.dateBadge,
                              { backgroundColor: colors.primary },
                            ]}
                          >
                            <Ionicons name="calendar" size={10} color="#fff" />
                            <Text style={s.dateBadgeTxt}>
                              {formatDateHead(g.key)}
                            </Text>
                          </View>
                          <View
                            style={[
                              s.dateLine,
                              { backgroundColor: colors.border },
                            ]}
                          />
                        </View>

                        {g.jobs.map((job) => (
                          <JobCard
                            key={job.id}
                            job={job}
                            colors={colors}
                            s={s}
                            selectMode={selectMode}
                            selected={selectedJobIds.includes(job.id)}
                            onToggleSelect={() => toggleSelectJob(job.id)}
                            assistantName={
                              job.assistant_id
                                ? driverName(job.assistant_id)
                                : ""
                            }
                            vehicleText={vehicleLabel(job.vehicle_id)}
                            onEdit={() => openEditJob(job)}
                            onDelete={() => confirmDelete(job)}
                            onOpenStatus={() =>
                              setStatusMenuJobId(
                                statusMenuJobId === job.id ? null : job.id,
                              )
                            }
                            statusMenuOpen={statusMenuJobId === job.id}
                            onChangeStatus={(st: JobStatus) =>
                              changeStatus(job, st)
                            }
                            onOpenProof={(uri: string) => setPreviewImage(uri)}
                            onOpenDetail={() => setDetailJob(job)}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Footer รวมบิล */}
      {selectMode && selectedJobIds.length > 0 && (
        <View
          style={[
            s.footerBar,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          <Text style={{ color: colors.text, fontWeight: "700" }}>
            เลือกแล้ว {selectedJobIds.length} งาน
          </Text>
          <TouchableOpacity
            style={[s.groupBtn, { backgroundColor: colors.primary }]}
            onPress={() => setGroupModal(true)}
          >
            <MaterialCommunityIcons
              name="format-list-group"
              size={18}
              color="#fff"
            />
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              รวมบิล / เหมา
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ---------- Job Modal ---------- */}
      <Modal
        visible={jobModal}
        animationType="slide"
        transparent
        onRequestClose={() => setJobModal(false)}
      >
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[s.modalHead, { borderBottomColor: colors.border }]}>
              <Text style={[s.modalTitle, { color: colors.text }]}>
                {form.id ? "แก้ไขงาน" : "เพิ่มงานใหม่"}
              </Text>
              <TouchableOpacity onPress={() => setJobModal(false)}>
                <Ionicons name="close" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={{ flex: 1 }}
            >
              <ScrollView
                style={{ padding: 16 }}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={[s.assignedTo, { color: colors.textSecondary }]}>
                  คนขับ:{" "}
                  <Text style={{ color: colors.primary, fontWeight: "800" }}>
                    {driverName(form.driver_id)}
                  </Text>
                </Text>

                {/* ดึงข้อมูลอัตโนมัติจากเลขหน้างาน */}
                <View
                  style={[
                    s.wipBox,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.bgSecondary,
                    },
                  ]}
                >
                  <Text style={[s.wipLabel, { color: colors.textSecondary }]}>
                    ⚡ ดึงข้อมูลจากเลขหน้างาน (WIP)
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput
                      value={wipYear}
                      onChangeText={setWipYear}
                      keyboardType="number-pad"
                      placeholder="ปี พ.ศ."
                      placeholderTextColor={colors.textSecondary}
                      style={[
                        s.input,
                        {
                          flex: 1,
                          color: colors.text,
                          borderColor: colors.border,
                          backgroundColor: colors.card,
                        },
                      ]}
                    />
                    <TextInput
                      value={wipNo}
                      onChangeText={setWipNo}
                      placeholder="เลขหน้างาน เช่น 001"
                      placeholderTextColor={colors.textSecondary}
                      style={[
                        s.input,
                        {
                          flex: 1.4,
                          color: colors.text,
                          borderColor: colors.border,
                          backgroundColor: colors.card,
                        },
                      ]}
                    />
                    <TouchableOpacity
                      style={[s.wipBtn, { backgroundColor: colors.primary }]}
                      onPress={fetchWipInfo}
                      disabled={wipLoading}
                    >
                      {wipLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons
                          name="download-outline"
                          size={20}
                          color="#fff"
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <Field label="ลูกค้า*" colors={colors} s={s}>
                  <TextInput
                    value={form.customer_name}
                    onChangeText={(t) =>
                      setForm((f) => ({ ...f, customer_name: t }))
                    }
                    placeholder="ชื่อลูกค้า"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      s.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.bgSecondary,
                      },
                    ]}
                  />
                </Field>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Field
                    label="เบอร์โทร"
                    colors={colors}
                    s={s}
                    style={{ flex: 1 }}
                  >
                    <TextInput
                      value={form.customer_phone}
                      onChangeText={(t) =>
                        setForm((f) => ({ ...f, customer_phone: t }))
                      }
                      keyboardType="phone-pad"
                      placeholder="เบอร์หลัก"
                      placeholderTextColor={colors.textSecondary}
                      style={[
                        s.input,
                        {
                          color: colors.text,
                          borderColor: colors.border,
                          backgroundColor: colors.bgSecondary,
                        },
                      ]}
                    />
                  </Field>
                  <Field
                    label="เบอร์เพิ่มเติม"
                    colors={colors}
                    s={s}
                    style={{ flex: 1 }}
                  >
                    <TextInput
                      value={form.customer_phone2}
                      onChangeText={(t) =>
                        setForm((f) => ({ ...f, customer_phone2: t }))
                      }
                      keyboardType="phone-pad"
                      placeholder="เบอร์สำรอง"
                      placeholderTextColor={colors.textSecondary}
                      style={[
                        s.input,
                        {
                          color: colors.text,
                          borderColor: colors.border,
                          backgroundColor: colors.bgSecondary,
                        },
                      ]}
                    />
                  </Field>
                </View>

                <Field label="ภารกิจ / รายละเอียด" colors={colors} s={s}>
                  <TextInput
                    value={form.job_desc}
                    onChangeText={(t) =>
                      setForm((f) => ({ ...f, job_desc: t }))
                    }
                    placeholder="รายละเอียดงาน"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    style={[
                      s.input,
                      {
                        minHeight: 60,
                        textAlignVertical: "top",
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.bgSecondary,
                      },
                    ]}
                  />
                </Field>

                <ProvinceField
                  label="ต้นทาง"
                  value={form.origin}
                  onChange={(t: string) =>
                    setForm((f) => ({ ...f, origin: t }))
                  }
                  suggestions={provinceSuggestions(form.origin)}
                  colors={colors}
                  s={s}
                />
                <ProvinceField
                  label="ปลายทาง *"
                  value={form.destination}
                  onChange={(t: string) =>
                    setForm((f) => ({ ...f, destination: t }))
                  }
                  suggestions={provinceSuggestions(form.destination)}
                  colors={colors}
                  s={s}
                />

                <Field label="ลิงก์ GPS (Google Maps)" colors={colors} s={s}>
                  <TextInput
                    value={form.gps_link}
                    onChangeText={(t) =>
                      setForm((f) => ({ ...f, gps_link: t }))
                    }
                    placeholder="https://maps.google.com/..."
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                    style={[
                      s.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.bgSecondary,
                      },
                    ]}
                  />
                </Field>

                {/* วัน-เวลาเริ่ม */}
                <Field label="วัน-เวลาเริ่ม *" colors={colors} s={s}>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <TouchableOpacity
                      style={[
                        s.input,
                        s.dateTimeBtn,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.bgSecondary,
                        },
                      ]}
                      onPress={() => setShowFormDate(true)}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={{ color: colors.text }}>
                        {(() => {
                          const d = parseDateTime(form.start_time);
                          return d
                            ? `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
                            : "-";
                        })()}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.nowBtn, { backgroundColor: colors.primary }]}
                      onPress={() =>
                        setForm((f) => ({
                          ...f,
                          start_time: toMysqlDateTime(new Date()),
                        }))
                      }
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        เดี๋ยวนี้
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Field>

                {/* รถ */}
                <Field label="รถที่ใช้" colors={colors} s={s}>
                  <PickerButton
                    text={vehicleLabel(form.vehicle_id) || "— เลือกรถ —"}
                    onPress={() => setVehiclePickerOpen((v) => !v)}
                    colors={colors}
                    s={s}
                  />
                  {vehiclePickerOpen && (
                    <View
                      style={[
                        s.pickerList,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <PickerOption
                        label="— ไม่ระบุ —"
                        onPress={() => {
                          setForm((f) => ({ ...f, vehicle_id: null }));
                          setVehiclePickerOpen(false);
                        }}
                        colors={colors}
                        s={s}
                      />
                      {vehicles.map((v) => (
                        <PickerOption
                          key={v.id}
                          label={`${v.fleet_number || ""} ${v.plate_number ? `(${v.plate_number})` : ""}`.trim()}
                          active={form.vehicle_id === v.id}
                          onPress={() => {
                            setForm((f) => ({ ...f, vehicle_id: v.id }));
                            setVehiclePickerOpen(false);
                          }}
                          colors={colors}
                          s={s}
                        />
                      ))}
                    </View>
                  )}
                </Field>

                {/* ผู้ช่วย */}
                <Field label="ผู้ช่วย" colors={colors} s={s}>
                  <PickerButton
                    text={
                      form.assistant_id
                        ? driverName(form.assistant_id)
                        : "— เลือกผู้ช่วย —"
                    }
                    onPress={() => setAssistantPickerOpen((v) => !v)}
                    colors={colors}
                    s={s}
                  />
                  {assistantPickerOpen && (
                    <View
                      style={[
                        s.pickerList,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <PickerOption
                        label="— ไม่มีผู้ช่วย —"
                        onPress={() => {
                          setForm((f) => ({ ...f, assistant_id: null }));
                          setAssistantPickerOpen(false);
                        }}
                        colors={colors}
                        s={s}
                      />
                      {drivers
                        .filter((d) => d.id !== form.driver_id)
                        .map((d) => (
                          <PickerOption
                            key={d.id}
                            label={d.name}
                            active={form.assistant_id === d.id}
                            onPress={() => {
                              setForm((f) => ({ ...f, assistant_id: d.id }));
                              setAssistantPickerOpen(false);
                            }}
                            colors={colors}
                            s={s}
                          />
                        ))}
                    </View>
                  )}
                </Field>

                <Field label="รายจ่าย (ค่ารถร่วม)" colors={colors} s={s}>
                  <TextInput
                    value={form.cost}
                    onChangeText={(t) =>
                      setForm((f) => ({
                        ...f,
                        cost: t.replace(/[^0-9.]/g, ""),
                      }))
                    }
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      s.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.bgSecondary,
                      },
                    ]}
                  />
                </Field>

                <TouchableOpacity
                  style={[s.saveBtn, { backgroundColor: colors.primary }]}
                  onPress={saveJob}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={20} color="#fff" />
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "800",
                          fontSize: 16,
                        }}
                      >
                        บันทึกงาน
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <View style={{ height: 30 }} />
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </View>

        {/* date/time picker ของฟอร์ม */}
        {showFormDate && (
          <DateTimePicker
            value={parseDateTime(form.start_time) || new Date()}
            mode="date"
            onChange={(e, d) => {
              setShowFormDate(false);
              if (e.type === "set" && d) {
                const cur = parseDateTime(form.start_time) || new Date();
                d.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
                setForm((f) => ({ ...f, start_time: toMysqlDateTime(d) }));
                setShowFormTime(true);
              }
            }}
          />
        )}
        {showFormTime && (
          <DateTimePicker
            value={parseDateTime(form.start_time) || new Date()}
            mode="time"
            is24Hour
            onChange={(e, d) => {
              setShowFormTime(false);
              if (e.type === "set" && d) {
                const cur = parseDateTime(form.start_time) || new Date();
                cur.setHours(d.getHours(), d.getMinutes(), 0, 0);
                setForm((f) => ({ ...f, start_time: toMysqlDateTime(cur) }));
              }
            }}
          />
        )}
      </Modal>

      {/* ---------- Complete Modal ---------- */}
      <Modal
        visible={completeModal}
        animationType="fade"
        transparent
        onRequestClose={() => setCompleteModal(false)}
      >
        <View
          style={[
            s.modalOverlay,
            {
              backgroundColor: colors.overlay,
              justifyContent: "center",
              padding: 20,
            },
          ]}
        >
          <View style={[s.completeCard, { backgroundColor: colors.card }]}>
            <Text
              style={[s.modalTitle, { color: colors.text, marginBottom: 4 }]}
            >
              ปิดงาน (เสร็จสิ้น)
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 12,
                marginBottom: 14,
              }}
            >
              {completeJobTarget?.customer_name}
            </Text>

            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
              เวลาที่เสร็จ
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
              <TouchableOpacity
                style={[
                  s.input,
                  s.dateTimeBtn,
                  {
                    flex: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bgSecondary,
                  },
                ]}
                onPress={() => setShowCompleteDate(true)}
              >
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text style={{ color: colors.text }}>
                  {(() => {
                    const d = parseDateTime(completeEndTime);
                    return d
                      ? `${d.getDate()} ${THAI_MONTHS[d.getMonth()]}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
                      : "-";
                  })()}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.nowBtn, { backgroundColor: colors.primary }]}
                onPress={() => setCompleteEndTime(toMysqlDateTime(new Date()))}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}
                >
                  เดี๋ยวนี้
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
              รูปหลักฐาน (ไม่บังคับ)
            </Text>
            {completeProof ? (
              <View style={{ marginBottom: 12 }}>
                <Image
                  source={{ uri: completeProof }}
                  style={{ width: "100%", height: 160, borderRadius: 10 }}
                />
                <TouchableOpacity
                  style={s.removeProof}
                  onPress={() => setCompleteProof(null)}
                >
                  <Ionicons name="close-circle" size={26} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.uploadBox, { borderColor: colors.border }]}
                onPress={pickCompleteProof}
              >
                <Ionicons
                  name="camera-outline"
                  size={26}
                  color={colors.primary}
                />
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  แตะเพื่อแนบรูป
                </Text>
              </TouchableOpacity>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <TouchableOpacity
                style={[s.modalCancel, { borderColor: colors.border }]}
                onPress={() => setCompleteModal(false)}
              >
                <Text
                  style={{ color: colors.textSecondary, fontWeight: "700" }}
                >
                  ยกเลิก
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.modalConfirm,
                  { backgroundColor: STATUS_META.completed.color },
                ]}
                onPress={submitComplete}
                disabled={completing}
              >
                {completing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "800" }}>
                    ยืนยันปิดงาน
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {showCompleteDate && (
          <DateTimePicker
            value={parseDateTime(completeEndTime) || new Date()}
            mode="date"
            onChange={(e, d) => {
              setShowCompleteDate(false);
              if (e.type === "set" && d) {
                const cur = parseDateTime(completeEndTime) || new Date();
                d.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
                setCompleteEndTime(toMysqlDateTime(d));
                setShowCompleteTime(true);
              }
            }}
          />
        )}
        {showCompleteTime && (
          <DateTimePicker
            value={parseDateTime(completeEndTime) || new Date()}
            mode="time"
            is24Hour
            onChange={(e, d) => {
              setShowCompleteTime(false);
              if (e.type === "set" && d) {
                const cur = parseDateTime(completeEndTime) || new Date();
                cur.setHours(d.getHours(), d.getMinutes(), 0, 0);
                setCompleteEndTime(toMysqlDateTime(cur));
              }
            }}
          />
        )}
      </Modal>

      {/* ---------- Group Modal ---------- */}
      <Modal
        visible={groupModal}
        animationType="fade"
        transparent
        onRequestClose={() => setGroupModal(false)}
      >
        <View
          style={[
            s.modalOverlay,
            {
              backgroundColor: colors.overlay,
              justifyContent: "center",
              padding: 20,
            },
          ]}
        >
          <View style={[s.completeCard, { backgroundColor: colors.card }]}>
            <Text
              style={[s.modalTitle, { color: colors.text, marginBottom: 14 }]}
            >
              รวมบิล / เหมา ({selectedJobIds.length} งาน)
            </Text>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
              ชื่อบิล / กลุ่ม
            </Text>
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="เช่น เหมาส่งของโซนเหนือ"
              placeholderTextColor={colors.textSecondary}
              style={[
                s.input,
                {
                  marginBottom: 12,
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.bgSecondary,
                },
              ]}
            />
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
              ราคารวม (เหมา)
            </Text>
            <TextInput
              value={groupPrice}
              onChangeText={(t) => setGroupPrice(t.replace(/[^0-9.]/g, ""))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              style={[
                s.input,
                {
                  marginBottom: 16,
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.bgSecondary,
                },
              ]}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[s.modalCancel, { borderColor: colors.border }]}
                onPress={() => setGroupModal(false)}
              >
                <Text
                  style={{ color: colors.textSecondary, fontWeight: "700" }}
                >
                  ยกเลิก
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirm, { backgroundColor: colors.primary }]}
                onPress={submitGroup}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>รวมบิล</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Job Detail Modal ---------- */}
      <Modal
        visible={!!detailJob}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailJob(null)}
      >
        <View style={[s.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[s.detailSheet, { backgroundColor: colors.card }]}>
            <View style={[s.modalHead, { borderBottomColor: colors.border }]}>
              <Text style={[s.modalTitle, { color: colors.text }]}>
                รายละเอียดงาน
              </Text>
              <TouchableOpacity onPress={() => setDetailJob(null)}>
                <Ionicons name="close" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {detailJob &&
              (() => {
                const st = (
                  detailJob.status && detailJob.status in STATUS_META
                    ? detailJob.status
                    : "pending"
                ) as JobStatus;
                const meta = STATUS_META[st];
                const proofUrl = getProofUrl(detailJob.proof_image);
                const phones = [
                  detailJob.customer_phone,
                  detailJob.customer_phone2,
                ].filter((p) => p && String(p).trim());
                return (
                  <ScrollView
                    style={{ padding: 16 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {/* สถานะ + id */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        ID #{detailJob.id}
                      </Text>
                      <View
                        style={[
                          s.detailStatusTag,
                          { backgroundColor: meta.color + "22" },
                        ]}
                      >
                        <Text
                          style={{
                            color: meta.color,
                            fontWeight: "800",
                            fontSize: 12,
                          }}
                        >
                          {meta.label}
                        </Text>
                      </View>
                    </View>

                    {/* ลูกค้า */}
                    <Text style={s.detailCaption}>👤 ลูกค้า</Text>
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: "800",
                        color: colors.text,
                        marginBottom: 4,
                      }}
                    >
                      {detailJob.customer_name || "-"}
                    </Text>

                    {/* เบอร์โทร (แตะเพื่อโทร) */}
                    {phones.length > 0 && (
                      <>
                        <Text style={[s.detailCaption, { marginTop: 10 }]}>
                          📞 เบอร์ติดต่อ (แตะเพื่อโทร)
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 8,
                            marginTop: 4,
                            marginBottom: 6,
                          }}
                        >
                          {phones.map((p, i) => (
                            <TouchableOpacity
                              key={i}
                              style={[
                                s.detailPhoneBtn,
                                { backgroundColor: colors.primary + "18" },
                              ]}
                              onPress={() =>
                                Linking.openURL(
                                  `tel:${String(p).replace(/[^0-9]/g, "")}`,
                                )
                              }
                            >
                              <Ionicons
                                name="call"
                                size={14}
                                color={colors.primary}
                              />
                              <Text
                                style={{
                                  color: colors.primary,
                                  fontWeight: "700",
                                }}
                              >
                                {p}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}

                    <View
                      style={[
                        s.detailDivider,
                        { backgroundColor: colors.border },
                      ]}
                    />

                    {/* เส้นทาง + เวลา */}
                    <Text
                      style={[s.detailSectionTitle, { color: colors.text }]}
                    >
                      📍 เส้นทางและเวลา
                    </Text>
                    <DetailLine
                      icon="navigate-circle-outline"
                      label="ต้นทาง"
                      value={detailJob.origin}
                      colors={colors}
                    />
                    <DetailLine
                      icon="location-sharp"
                      label="ปลายทาง"
                      value={detailJob.destination}
                      colors={colors}
                      highlight
                    />
                    <DetailLine
                      icon="time-outline"
                      label="เริ่มงาน"
                      value={formatDateTimeFull(detailJob.start_time)}
                      colors={colors}
                    />
                    <DetailLine
                      icon="checkmark-circle-outline"
                      label="จบงาน"
                      value={
                        detailJob.end_time
                          ? formatDateTimeFull(detailJob.end_time)
                          : "-"
                      }
                      colors={colors}
                    />
                    {!!detailJob.gps_link && (
                      <TouchableOpacity
                        style={[s.detailGpsBtn, { borderColor: "#0ea5e9" }]}
                        onPress={() => Linking.openURL(detailJob.gps_link!)}
                      >
                        <Ionicons name="map" size={16} color="#0ea5e9" />
                        <Text style={{ color: "#0ea5e9", fontWeight: "700" }}>
                          เปิดพิกัด GPS
                        </Text>
                      </TouchableOpacity>
                    )}

                    <View
                      style={[
                        s.detailDivider,
                        { backgroundColor: colors.border },
                      ]}
                    />

                    {/* ทีมงาน + รถ */}
                    <Text
                      style={[s.detailSectionTitle, { color: colors.text }]}
                    >
                      🚛 ทีมงานและพาหนะ
                    </Text>
                    <View style={{ flexDirection: "row" }}>
                      <View style={{ flex: 1 }}>
                        <DetailLine
                          icon="person"
                          label="คนขับ"
                          value={driverName(detailJob.driver_id)}
                          colors={colors}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <DetailLine
                          icon="people-outline"
                          label="ผู้ช่วย"
                          value={
                            detailJob.assistant_id
                              ? driverName(detailJob.assistant_id)
                              : "-"
                          }
                          colors={colors}
                        />
                      </View>
                    </View>
                    <DetailLine
                      icon="car-sport-outline"
                      label="รถ / ทะเบียน"
                      value={vehicleLabel(detailJob.vehicle_id) || "-"}
                      colors={colors}
                    />
                    <DetailLine
                      icon="cash-outline"
                      label="รายจ่าย (ค่ารถร่วม)"
                      value={
                        detailJob.cost != null && String(detailJob.cost) !== ""
                          ? `฿${Number(detailJob.cost).toLocaleString()}`
                          : "-"
                      }
                      colors={colors}
                    />

                    {/* ภารกิจ */}
                    {!!detailJob.job_desc && (
                      <View
                        style={[
                          s.detailDescBox,
                          {
                            backgroundColor: STATUS_META.pending.color + "15",
                            borderColor: STATUS_META.pending.color,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: STATUS_META.pending.color,
                            marginBottom: 4,
                          }}
                        >
                          ภารกิจ / รายละเอียด
                        </Text>
                        <Text style={{ fontSize: 14, color: colors.text }}>
                          {detailJob.job_desc}
                        </Text>
                      </View>
                    )}

                    {/* กลุ่ม/บิลเหมา */}
                    {!!detailJob.group_name && (
                      <View
                        style={[
                          s.detailGroupBox,
                          {
                            backgroundColor: colors.primary + "12",
                            borderColor: colors.primary,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="format-list-group"
                          size={16}
                          color={colors.primary}
                        />
                        <Text
                          style={{
                            color: colors.primary,
                            fontWeight: "700",
                            flex: 1,
                          }}
                        >
                          {detailJob.group_name}
                          {detailJob.group_price
                            ? `  ·  ฿${Number(detailJob.group_price).toLocaleString()}`
                            : ""}
                        </Text>
                      </View>
                    )}

                    {/* รูปหลักฐาน */}
                    <Text
                      style={[
                        s.detailSectionTitle,
                        { color: colors.text, marginTop: 16 },
                      ]}
                    >
                      📷 หลักฐานงานจบ
                    </Text>
                    {proofUrl ? (
                      <TouchableOpacity
                        onPress={() => setPreviewImage(proofUrl)}
                        activeOpacity={0.9}
                      >
                        <Image
                          source={{ uri: proofUrl }}
                          style={{
                            width: "100%",
                            height: 200,
                            borderRadius: 12,
                            backgroundColor: colors.bgSecondary,
                          }}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ) : (
                      <View
                        style={[
                          s.detailNoImg,
                          {
                            backgroundColor: colors.bgSecondary,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name="image-outline"
                          size={40}
                          color={colors.textSecondary}
                        />
                        <Text
                          style={{
                            color: colors.textSecondary,
                            marginTop: 4,
                            fontSize: 12,
                          }}
                        >
                          ยังไม่มีรูปหลักฐาน
                        </Text>
                      </View>
                    )}

                    {/* ปุ่ม แก้ไข */}
                    <TouchableOpacity
                      style={[
                        s.saveBtn,
                        { backgroundColor: colors.primary, marginTop: 18 },
                      ]}
                      onPress={() => {
                        const j = detailJob;
                        setDetailJob(null);
                        openEditJob(j);
                      }}
                    >
                      <Ionicons name="create-outline" size={20} color="#fff" />
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "800",
                          fontSize: 16,
                        }}
                      >
                        แก้ไขงานนี้
                      </Text>
                    </TouchableOpacity>
                    <View style={{ height: 30 }} />
                  </ScrollView>
                );
              })()}
          </View>
        </View>
      </Modal>

      {/* ---------- Image Preview ---------- */}
      <Modal
        visible={!!previewImage}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.95)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <TouchableOpacity
            style={{
              position: "absolute",
              top: 50,
              right: 20,
              padding: 10,
              zIndex: 10,
            }}
            onPress={() => setPreviewImage(null)}
          >
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
          {previewImage && (
            <Image
              source={{ uri: previewImage }}
              style={{ width: "100%", height: "80%" }}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* filter date picker */}
      {showFilterDate && (
        <DateTimePicker
          value={
            filterDate
              ? parseDateTime(`${filterDate} 00:00:00`) || new Date()
              : new Date()
          }
          mode="date"
          onChange={(e, d) => {
            setShowFilterDate(false);
            if (e.type === "set" && d)
              setFilterDate(toMysqlDateTime(d).substring(0, 10));
          }}
        />
      )}
    </View>
  );
}

// ==================================================================
// Sub-components
// ==================================================================
function FilterChip({ active, label, onPress, colors, dotColor }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
        backgroundColor: active ? colors.primary : colors.bgSecondary,
        borderColor: active ? colors.primary : colors.border,
      }}
    >
      {dotColor && (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: dotColor,
          }}
        />
      )}
      <Text
        style={{
          color: active ? "#fff" : colors.text,
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Field({ label, children, colors, s, style }: any) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function ProvinceField({
  label,
  value,
  onChange,
  suggestions,
  colors,
  s,
}: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 12, position: "relative", zIndex: 5 }}>
      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="พิมพ์ชื่อจังหวัด/สถานที่"
        placeholderTextColor={colors.textSecondary}
        style={[
          s.input,
          {
            color: colors.text,
            borderColor: colors.border,
            backgroundColor: colors.bgSecondary,
          },
        ]}
      />
      {focused && suggestions.length > 0 && (
        <View
          style={[
            s.pickerList,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {suggestions.map((p: any, i: number) => (
            <TouchableOpacity
              key={i}
              style={s.pickerOption}
              onPress={() => onChange(p.name_th)}
            >
              <Text style={{ color: colors.text, fontSize: 14 }}>
                {p.name_th}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function PickerButton({ text, onPress, colors, s }: any) {
  return (
    <TouchableOpacity
      style={[
        s.input,
        {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          borderColor: colors.border,
          backgroundColor: colors.bgSecondary,
        },
      ]}
      onPress={onPress}
    >
      <Text style={{ color: colors.text }}>{text}</Text>
      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

function PickerOption({ label, active, onPress, colors, s }: any) {
  return (
    <TouchableOpacity style={s.pickerOption} onPress={onPress}>
      <Text
        style={{
          color: active ? colors.primary : colors.text,
          fontWeight: active ? "800" : "500",
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function DetailLine({ icon, label, value, colors, highlight }: any) {
  if (!value) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: 12,
      }}
    >
      <Ionicons
        name={icon}
        size={18}
        color={highlight ? colors.primary : colors.textSecondary}
        style={{ width: 28, paddingTop: 2 }}
      />
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
          {value}
        </Text>
      </View>
    </View>
  );
}

function JobCard({
  job,
  colors,
  s,
  selectMode,
  selected,
  onToggleSelect,
  assistantName,
  vehicleText,
  onEdit,
  onDelete,
  onOpenStatus,
  statusMenuOpen,
  onChangeStatus,
  onOpenProof,
  onOpenDetail,
}: any) {
  const meta =
    STATUS_META[
      (job.status as JobStatus) in STATUS_META
        ? (job.status as JobStatus)
        : "pending"
    ];
  const proofUrl = getProofUrl(job.proof_image);
  return (
    <View
      style={[
        s.jobCard,
        { backgroundColor: colors.card, borderLeftColor: meta.color },
      ]}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}
      >
        {selectMode && (
          <TouchableOpacity onPress={onToggleSelect} style={{ marginRight: 8 }}>
            <Ionicons
              name={selected ? "checkbox" : "square-outline"}
              size={22}
              color={colors.primary}
            />
          </TouchableOpacity>
        )}
        <Text style={[s.jobTime, { color: colors.primary }]}>
          {formatTime(job.start_time)} น.
        </Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[s.statusPill, { backgroundColor: meta.color + "22" }]}
          onPress={onOpenStatus}
        >
          <Text style={{ color: meta.color, fontWeight: "800", fontSize: 11 }}>
            {meta.label}
          </Text>
          <Ionicons name="chevron-down" size={12} color={meta.color} />
        </TouchableOpacity>
      </View>

      {statusMenuOpen && (
        <View
          style={[
            s.pickerList,
            {
              position: "relative",
              top: 0,
              marginBottom: 8,
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
            },
          ]}
        >
          {STATUS_ORDER.map((st) => (
            <TouchableOpacity
              key={st}
              style={s.pickerOption}
              onPress={() => onChangeStatus(st)}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: STATUS_META[st].color,
                  }}
                />
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: job.status === st ? "800" : "500",
                  }}
                >
                  {STATUS_META[st].label}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity activeOpacity={0.7} onPress={onOpenDetail}>
        <Text style={[s.jobCustomer, { color: colors.text }]}>
          {job.customer_name || "-"}
        </Text>

        {!!job.customer_phone && (
          <TouchableOpacity
            style={s.jobRow}
            onPress={() =>
              Linking.openURL(
                `tel:${String(job.customer_phone).replace(/[^0-9]/g, "")}`,
              )
            }
          >
            <Ionicons name="call" size={13} color={colors.textSecondary} />
            <Text style={[s.jobRowText, { color: colors.primary }]}>
              {job.customer_phone}
              {job.customer_phone2 ? `, ${job.customer_phone2}` : ""}
            </Text>
          </TouchableOpacity>
        )}

        {!!assistantName && (
          <View style={s.jobRow}>
            <Ionicons
              name="people-outline"
              size={13}
              color={colors.textSecondary}
            />
            <Text style={[s.jobRowText, { color: colors.textSecondary }]}>
              ผู้ช่วย: {assistantName}
            </Text>
          </View>
        )}

        {!!vehicleText && (
          <View style={s.jobRow}>
            <Ionicons
              name="car-outline"
              size={13}
              color={colors.textSecondary}
            />
            <Text style={[s.jobRowText, { color: colors.textSecondary }]}>
              {vehicleText}
            </Text>
          </View>
        )}

        {!!job.job_desc && (
          <View style={s.jobRow}>
            <Ionicons
              name="document-text-outline"
              size={13}
              color={colors.textSecondary}
            />
            <Text
              style={[s.jobRowText, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {job.job_desc}
            </Text>
          </View>
        )}

        <View style={s.jobRow}>
          <Ionicons name="location-outline" size={13} color="#ef4444" />
          <Text
            style={[s.jobRowText, { color: colors.text, fontWeight: "700" }]}
            numberOfLines={1}
          >
            {job.origin ? `${job.origin} → ` : ""}
            {job.destination || "-"}
          </Text>
        </View>

        {!!job.group_name && (
          <View
            style={[s.groupTag, { backgroundColor: colors.primary + "18" }]}
          >
            <MaterialCommunityIcons
              name="format-list-group"
              size={12}
              color={colors.primary}
            />
            <Text
              style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}
            >
              {job.group_name}
              {job.group_price
                ? ` · ฿${Number(job.group_price).toLocaleString()}`
                : ""}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Action row */}
      <View style={[s.jobActions, { borderTopColor: colors.border }]}>
        {!!job.gps_link && (
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => Linking.openURL(job.gps_link)}
          >
            <Ionicons name="map-outline" size={16} color="#0ea5e9" />
            <Text style={[s.actionTxt, { color: "#0ea5e9" }]}>GPS</Text>
          </TouchableOpacity>
        )}
        {!!proofUrl && (
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => onOpenProof(proofUrl)}
          >
            <Ionicons name="image-outline" size={16} color="#10b981" />
            <Text style={[s.actionTxt, { color: "#10b981" }]}>รูป</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={s.actionBtn} onPress={onEdit}>
          <Ionicons name="create-outline" size={16} color={colors.primary} />
          <Text style={[s.actionTxt, { color: colors.primary }]}>แก้ไข</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={onDelete}>
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
          <Text style={[s.actionTxt, { color: "#ef4444" }]}>ลบ</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ==================================================================
// Styles
// ==================================================================
const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      paddingHorizontal: 14,
      paddingTop: Platform.OS === "ios" ? 12 : 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      zIndex: 20,
    },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    searchBox: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.bgSecondary,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: { flex: 1, fontSize: 14, padding: 0 },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
    },
    filterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
    },
    pillText: { fontSize: 13, fontWeight: "600" },
    clearPill: { paddingHorizontal: 10, paddingVertical: 8 },
    selectModeBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
    },
    // Driver
    driverCard: {
      borderRadius: 14,
      marginBottom: 10,
      borderWidth: 1,
      overflow: "hidden",
    },
    driverHeader: { flexDirection: "row", alignItems: "center", padding: 12 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    avatarTxt: { fontWeight: "800", fontSize: 16 },
    driverName: { fontSize: 15, fontWeight: "700" },
    countBadge: {
      minWidth: 26,
      paddingHorizontal: 8,
      height: 24,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    jobsWrap: { borderTopWidth: 1, padding: 10 },
    addJobBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderStyle: "dashed",
      borderRadius: 10,
      paddingVertical: 10,
      marginBottom: 12,
    },
    dateHeadRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
      marginTop: 4,
    },
    dateBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
    },
    dateBadgeTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
    dateLine: { flex: 1, height: 1, marginLeft: 10 },
    // Job card
    jobCard: {
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
      borderLeftWidth: 5,
      elevation: 1,
    },
    jobTime: { fontSize: 15, fontWeight: "800" },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
    },
    jobCustomer: { fontSize: 15, fontWeight: "800", marginBottom: 4 },
    jobRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 3,
    },
    jobRowText: { fontSize: 13, flex: 1 },
    groupTag: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      alignSelf: "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      marginTop: 8,
    },
    jobActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 10,
      paddingTop: 8,
      borderTopWidth: 1,
    },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    actionTxt: { fontSize: 12, fontWeight: "700" },
    // Footer
    footerBar: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      paddingBottom: Platform.OS === "ios" ? 28 : 12,
      borderTopWidth: 1,
    },
    groupBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    // Modal
    modalOverlay: { flex: 1, justifyContent: "flex-end" },
    modalSheet: {
      height: "92%",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
    modalHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
    },
    modalTitle: { fontSize: 17, fontWeight: "800" },
    assignedTo: { fontSize: 13, marginBottom: 12 },
    wipBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
    wipLabel: { fontSize: 12, fontWeight: "700", marginBottom: 8 },
    wipBtn: {
      width: 46,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    fieldLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    dateTimeBtn: { flexDirection: "row", alignItems: "center", gap: 8 },
    nowBtn: {
      paddingHorizontal: 14,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    pickerList: {
      position: "absolute",
      top: 72,
      left: 0,
      right: 0,
      borderWidth: 1,
      borderRadius: 10,
      maxHeight: 220,
      elevation: 6,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 6,
      zIndex: 30,
    },
    pickerOption: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    saveBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      marginTop: 8,
    },
    // Complete / Group modal card
    completeCard: { borderRadius: 16, padding: 18 },
    uploadBox: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderRadius: 12,
      paddingVertical: 24,
      alignItems: "center",
      marginBottom: 12,
    },
    removeProof: {
      position: "absolute",
      top: 6,
      right: 6,
      backgroundColor: "#fff",
      borderRadius: 13,
    },
    modalCancel: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
    },
    modalConfirm: {
      flex: 1.4,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
    },
    // Detail modal
    detailSheet: {
      height: "88%",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
    detailCaption: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.textSecondary,
      marginBottom: 3,
    },
    detailStatusTag: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 8,
    },
    detailPhoneBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
    },
    detailDivider: { height: 1, marginVertical: 14 },
    detailSectionTitle: { fontSize: 14, fontWeight: "800", marginBottom: 12 },
    detailGpsBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      marginTop: 2,
    },
    detailDescBox: {
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderStyle: "dashed",
      marginTop: 6,
    },
    detailGroupBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      marginTop: 12,
    },
    detailNoImg: {
      height: 130,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: "dashed",
      justifyContent: "center",
      alignItems: "center",
    },
  });
