import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker, {
    DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { BlurView } from "expo-blur";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import {
    AlertTriangle,
    AlignLeft,
    Building2,
    Calendar as CalendarIcon,
    CheckCircle2,
    ClipboardEdit,
    CloudUpload,
    HelpCircle,
    History,
    ImagePlus,
    ListChecks,
    MapPin,
    Save,
    User,
    X
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react"; // --- [NEW] เพิ่ม useEffect
import {
    ActivityIndicator,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useColorScheme,
} from "react-native";

// Import Config
import { API_BASE, IMG_BASE_URL } from "../../constants/config";

const SCREEN_WIDTH = Dimensions.get("window").width;

// --- [THEME CONFIGURATION] ---
const Colors = {
  light: {
    background: "#F8FAFC",
    card: "#FFFFFF",
    text: "#1E293B",
    textSecondary: "#64748B",
    border: "#E2E8F0",
    inputBg: "#F8FAFC",
    placeholder: "#94A3B8",
    iconDefault: "#94A3B8",
    modalOverlay: "rgba(15, 23, 42, 0.4)",
  },
  dark: {
    background: "#0F172A",
    card: "#1E293B",
    text: "#F1F5F9",
    textSecondary: "#94A3B8",
    border: "#334155",
    inputBg: "#020617",
    placeholder: "#475569",
    iconDefault: "#64748B",
    modalOverlay: "rgba(0, 0, 0, 0.7)",
  },
};

// --- [CUSTOM COMPONENT] Beautiful Alert ---
// ... (ส่วน BeautifulAlert ใช้โค้ดเดิมของคุณ ไม่มีการเปลี่ยนแปลง)
interface BeautifulAlertProps {
  visible: boolean;
  type: "question" | "success" | "warning" | "error";
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  isDark?: boolean;
}

const BeautifulAlert = ({
  visible,
  type,
  title,
  message,
  confirmText = "ตกลง",
  cancelText = "ยกเลิก",
  showCancel = true,
  onConfirm,
  onCancel,
  isDark = false,
}: BeautifulAlertProps) => {
  if (!visible) return null;

  const theme = isDark ? Colors.dark : Colors.light;

  const getConfig = () => {
    switch (type) {
      case "question":
        return {
          icon: <HelpCircle size={48} color="#3B82F6" />,
          bgIcon: isDark ? "#172554" : "#EFF6FF",
          confirmColor: "#3B82F6",
        };
      case "success":
        return {
          icon: <CheckCircle2 size={48} color="#10B981" />,
          bgIcon: isDark ? "#064E3B" : "#ECFDF5",
          confirmColor: "#10B981",
        };
      case "warning":
        return {
          icon: <AlertTriangle size={48} color="#F59E0B" />,
          bgIcon: isDark ? "#451a03" : "#FFFBEB",
          confirmColor: "#F59E0B",
        };
      case "error":
      default:
        return {
          icon: <X size={48} color="#EF4444" />,
          bgIcon: isDark ? "#450a0a" : "#FEF2F2",
          confirmColor: "#EF4444",
        };
    }
  };

  const config = getConfig();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View
        style={[alertStyles.overlay, { backgroundColor: theme.modalOverlay }]}
      >
        <BlurView
          intensity={isDark ? 40 : 20}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <View style={[alertStyles.container, { backgroundColor: theme.card }]}>
          <View
            style={[alertStyles.iconCircle, { backgroundColor: config.bgIcon }]}
          >
            {config.icon}
          </View>
          <Text style={[alertStyles.title, { color: theme.text }]}>
            {title}
          </Text>
          <Text style={[alertStyles.message, { color: theme.textSecondary }]}>
            {message}
          </Text>
          <View style={alertStyles.buttonRow}>
            {showCancel && onCancel && (
              <TouchableOpacity
                style={[
                  alertStyles.cancelButton,
                  { backgroundColor: isDark ? "#334155" : "#F1F5F9" },
                ]}
                onPress={onCancel}
              >
                <Text
                  style={[
                    alertStyles.cancelText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {cancelText}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                alertStyles.confirmButton,
                { backgroundColor: config.confirmColor },
              ]}
              onPress={onConfirm}
            >
              <Text style={alertStyles.confirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const alertStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 32,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  buttonRow: { flexDirection: "row", gap: 12, width: "100%" },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 16, fontWeight: "600" },
  confirmButton: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmText: { fontSize: 16, fontWeight: "700", color: "white" },
});

// --- Constants ---
interface Company {
  id: string;
  name: string;
  logo: string;
  color: string;
  bg: string;
}

const companies: Company[] = [
  {
    id: "TJC CORPORATION",
    name: "TJC CORPORATION",
    logo: "/logosdeer/logo_1766477513_380.png",
    color: "#EAB308",
    bg: "#FEFCE8",
  },
  {
    id: "TANGJAI CORPORATION",
    name: "TANGJAI CORPORATION",
    logo: "/logosdeer/logo_1766477549_239.png",
    color: "#16A34A",
    bg: "#F0FDF4",
  },
  {
    id: "ASCENT CORPORATION",
    name: "ASCENT CORPORATION",
    logo: "/logosdeer/logo_1766477538_294.png",
    color: "#2563EB",
    bg: "#EFF6FF",
  },
  {
    id: "A.R.T EXPONENTIAL",
    name: "A.R.T EXPONENTIAL",
    logo: "/logosdeer/logo_1766477525_718.png",
    color: "#475569",
    bg: "#F1F5F9",
  },
];

export default function ImmigrationFormScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const styles = useMemo(() => getStyles(isDark), [isDark]);

  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);

  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [assignerName, setAssignerName] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [activity, setActivity] = useState<string>("");
  const [details, setDetails] = useState<string>("");
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);

  // --- [NEW] States สำหรับ History ---
  const [locationHistory, setLocationHistory] = useState<string[]>([]);
  const [filteredLocations, setFilteredLocations] = useState<string[]>([]);
  const [showLocationList, setShowLocationList] = useState<boolean>(false);

  const [activityHistory, setActivityHistory] = useState<string[]>([]);
  const [filteredActivities, setFilteredActivities] = useState<string[]>([]);
  const [showActivityList, setShowActivityList] = useState<boolean>(false);
  // -----------------------------------

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    type: "question" as "question" | "success" | "warning" | "error",
    title: "",
    message: "",
    confirmText: "ตกลง",
    cancelText: "ยกเลิก",
    showCancel: true,
    onConfirm: () => {},
  });

  const showAlert = (config: any) => {
    setAlertConfig({ ...alertConfig, visible: true, ...config });
  };
  const closeAlert = () => {
    setAlertConfig((prev) => ({ ...prev, visible: false }));
  };
  const openImageModal = (url: string) => {
    setActiveImageUrl(url);
    setShowImageModal(true);
  };

  // --- [NEW] Load History ตอนเปิดหน้า ---
  useEffect(() => {
    const loadHistory = async () => {
      try {
        // 1. ดึงข้อมูลที่เคยจำไว้ในเครื่องมือถือ (Local)
        let localLoc: string[] = [];
        let localAct: string[] = [];
        const locData = await AsyncStorage.getItem("history_locations");
        const actData = await AsyncStorage.getItem("history_activities");
        if (locData) localLoc = JSON.parse(locData);
        if (actData) localAct = JSON.parse(actData);

        // 2. วิ่งไปดึงข้อมูลเก่าจาก Database (Server)
        try {
          // ใส่ URL ให้ตรงกับไฟล์ API ที่เราเพิ่งแก้ไป
          const response = await fetch(
            `${API_BASE}/Immigration_save.php?action=get_immigration_history`,
          );
          if (response.ok) {
            const dbData = await response.json();

            if (dbData.success) {
              // เอาข้อมูลจาก DB มารวมกับของในเครื่อง แล้วตัดคำที่ซ้ำกันทิ้ง
              if (dbData.locations) {
                localLoc = [
                  ...new Set([...localLoc, ...dbData.locations]),
                ].slice(0, 100);
              }
              if (dbData.activities) {
                localAct = [
                  ...new Set([...localAct, ...dbData.activities]),
                ].slice(0, 100);
              }

              // เซฟข้อมูลที่รวมแล้วกลับลงไปในเครื่อง
              await AsyncStorage.setItem(
                "history_locations",
                JSON.stringify(localLoc),
              );
              await AsyncStorage.setItem(
                "history_activities",
                JSON.stringify(localAct),
              );
            }
          }
        } catch (apiError) {
          console.log("ไม่สามารถเชื่อมต่อ API ดึงประวัติได้:", apiError);
        }

        // 3. เซ็ตค่าลง State เพื่อให้ Dropdown เอาไปใช้งาน
        setLocationHistory(localLoc);
        setActivityHistory(localAct);
      } catch (e) {
        console.log("Error loading history:", e);
      }
    };

    loadHistory();
  }, []);

  // --- [NEW] ฟังก์ชั่นค้นหาและแสดง Dropdown ---
  const handleLocationChange = (text: string) => {
    setLocation(text);
    if (text.trim() === "") {
      setShowLocationList(false);
    } else {
      const filtered = locationHistory.filter((item) =>
        item.toLowerCase().includes(text.toLowerCase()),
      );
      setFilteredLocations(filtered);
      setShowLocationList(filtered.length > 0);
    }
  };

  const handleActivityChange = (text: string) => {
    setActivity(text);
    if (text.trim() === "") {
      setShowActivityList(false);
    } else {
      const filtered = activityHistory.filter((item) =>
        item.toLowerCase().includes(text.toLowerCase()),
      );
      setFilteredActivities(filtered);
      setShowActivityList(filtered.length > 0);
    }
  };

  // --- [NEW] ฟังก์ชั่นเก็บข้อมูลลง History (สูงสุด 100 รายการ) ---
  const saveToHistory = async (
    key: string,
    value: string,
    currentHistory: string[],
    setHistoryState: any,
  ) => {
    const val = value.trim();
    if (!val) return;
    try {
      let history = [...currentHistory];
      history = history.filter((item) => item !== val); // ลบของเดิมถ้าซ้ำ
      history.unshift(val); // ดันไปไว้บนสุด
      if (history.length > 100) history.pop(); // เก็บแค่ 100 รายการ

      await AsyncStorage.setItem(key, JSON.stringify(history));
      setHistoryState(history); // อัปเดต state
    } catch (e) {
      console.log("Error saving history:", e);
    }
  };
  // -----------------------------------

  useFocusEffect(
    useCallback(() => {
      const fetchUserData = async () => {
        try {
          const storedUser = await AsyncStorage.getItem("user");
          if (storedUser) {
            const userObj = JSON.parse(storedUser);
            const user = userObj.user || userObj.data || userObj;
            const nameToShow =
              user.fullname || user.name || user.full_name || "";
            if (nameToShow) setAssignerName(nameToShow);
          }
        } catch (error) {
          console.log("❌ Error fetching user data:", error);
        }
      };
      fetchUserData();
    }, []),
  );

  const toggleCompany = (id: string) => {
    setSelectedCompanies((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleDateChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    const currentDate = selectedDate || date;
    setShowDatePicker(Platform.OS === "ios");
    setDate(currentDate);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert({
        type: "warning",
        title: "สิทธิ์การเข้าถึง",
        message: "ต้องการสิทธิ์เข้าถึงรูปภาพเพื่อใช้งาน",
        showCancel: false,
        onConfirm: closeAlert,
      });
      return;
    }
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) setImages((prev) => [...prev, ...result.assets]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const newImages = [...prev];
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const formatDateForApi = (d: Date): string => d.toISOString().split("T")[0];
  const formatDateDisplay = (d: Date): string => {
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getCompanyStyle = (comp: Company, isSelected: boolean) => {
    if (!isSelected)
      return { backgroundColor: theme.card, borderColor: theme.border };
    if (isDark)
      return { backgroundColor: theme.background, borderColor: comp.color };
    return { backgroundColor: comp.bg, borderColor: comp.color };
  };

  const handleSubmit = () => {
    if (selectedCompanies.length === 0) {
      showAlert({
        type: "error",
        title: "ข้อมูลไม่ครบถ้วน",
        message: "กรุณาเลือกบริษัทอย่างน้อย 1 แห่ง",
        showCancel: false,
        confirmText: "ตกลง",
        onConfirm: closeAlert,
      });
      return;
    }
    if (!assignerName.trim() || !location.trim() || !activity.trim()) {
      showAlert({
        type: "error",
        title: "ข้อมูลไม่ครบถ้วน",
        message: "กรุณากรอกข้อมูลช่องที่มี * ให้ครบ",
        showCancel: false,
        confirmText: "เข้าใจแล้ว",
        onConfirm: closeAlert,
      });
      return;
    }

    const companyList = selectedCompanies
      .map((id) => companies.find((c) => c.id === id)?.name)
      .join("\n• ");

    showAlert({
      type: "question",
      title: "ยืนยันการบันทึก?",
      message: `บันทึกงานสำหรับ ${selectedCompanies.length} บริษัท ดังนี้:\n\n• ${companyList}`,
      confirmText: "บันทึกทันที",
      cancelText: "ยกเลิก",
      showCancel: true,
      onConfirm: () => {
        closeAlert();
        submitData();
      },
      onCancel: closeAlert,
    });
  };

  const submitData = async () => {
    setIsSubmitting(true);
    try {
      // --- [NEW] บันทึกคำลง LocalStorage ก่อนส่ง API ---
      await saveToHistory(
        "history_locations",
        location,
        locationHistory,
        setLocationHistory,
      );
      await saveToHistory(
        "history_activities",
        activity,
        activityHistory,
        setActivityHistory,
      );
      // ---------------------------------------------

      const formData = new FormData();
      formData.append("company", selectedCompanies.join(","));
      formData.append("work_date", formatDateForApi(date));
      formData.append("location", location);
      formData.append("activity", activity);
      formData.append("details", details);
      formData.append("assigner_name", assignerName);
      formData.append("created_by", assignerName);

      images.forEach((img, index) => {
        const uriParts = img.uri.split(".");
        const fileType = uriParts[uriParts.length - 1];
        // @ts-ignore
        formData.append("image_upload[]", {
          uri: img.uri,
          name: `photo_${index}.${fileType}`,
          type: `image/${fileType}`,
        });
      });

      const response = await fetch(
        `${API_BASE}/Immigration_save.php?action=get_immigration_history`,
        {
          method: "POST",
          body: formData,
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      if (response.ok) {
        showAlert({
          type: "success",
          title: "บันทึกสำเร็จ!",
          message: "ข้อมูลของคุณถูกส่งเข้าระบบเรียบร้อยแล้ว",
          showCancel: false,
          confirmText: "ตกลง",
          onConfirm: () => {
            closeAlert();
            resetForm();
          },
        });
      } else {
        throw new Error("Server response was not ok");
      }
    } catch (error: any) {
      console.error(error);
      showAlert({
        type: "error",
        title: "เกิดข้อผิดพลาด",
        message: `ไม่สามารถเชื่อมต่อ Server ได้\n${error.message}`,
        showCancel: false,
        confirmText: "ลองใหม่",
        onConfirm: closeAlert,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedCompanies([]);
    setDate(new Date());
    setLocation("");
    setActivity("");
    setDetails("");
    setImages([]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.background}
      />
      <SafeAreaView style={{ flex: 1 }}>
        {/* [NEW] ใส่ keyboardShouldPersistTaps เพื่อให้กดเลือกรายการจาก Dropdown ได้โดยไม่เด้งปิดคีย์บอร์ด */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.headerCard}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconContainer}>
                <ClipboardEdit color="#FFF" size={24} />
              </View>
              <Text style={styles.headerTitle}>
                บันทึกงานคนเข้าเมือง (messenger)
              </Text>
            </View>
          </View>

          {/* 1. Company Selection */}
          <View style={[styles.sectionContainer, { zIndex: 1 }]}>
            <View style={styles.labelRow}>
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: isDark ? "#172554" : "#DBEAFE" },
                ]}
              >
                <Building2 color="#2563EB" size={20} />
              </View>
              <Text style={styles.sectionLabel}>
                เลือกบริษัท <Text style={styles.required}>*</Text>
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: theme.textSecondary,
                  marginLeft: "auto",
                  fontWeight: "600",
                }}
              >
                (เลือกได้หลายข้อ)
              </Text>
            </View>

            <View style={styles.grid}>
              {companies.map((comp) => {
                const isSelected = selectedCompanies.includes(comp.id);
                const compStyle = getCompanyStyle(comp, isSelected);
                return (
                  <TouchableOpacity
                    key={comp.id}
                    style={[
                      styles.companyCard,
                      isSelected && styles.companyCardSelected,
                      {
                        borderColor: isSelected ? comp.color : theme.border,
                        backgroundColor: compStyle.backgroundColor,
                      },
                    ]}
                    onPress={() => toggleCompany(comp.id)}
                  >
                    <Image
                      source={{ uri: `${IMG_BASE_URL}${comp.logo}` }}
                      style={styles.logo}
                      resizeMode="contain"
                    />
                    <Text
                      style={[
                        styles.companyName,
                        isSelected && { color: comp.color },
                      ]}
                    >
                      {comp.name}
                    </Text>

                    {isSelected && (
                      <View style={{ position: "absolute", top: 8, right: 8 }}>
                        <CheckCircle2 size={16} color={comp.color} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 2. Job Details */}
          {/* [NEW] สลับ zIndex เพื่อให้ Dropdown ทับกล่องด้านล่าง */}
          <View
            style={[styles.sectionContainer, { zIndex: 20, elevation: 20 }]}
          >
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>
                วันที่ปฏิบัติงาน <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                style={styles.inputWrapper}
              >
                <CalendarIcon
                  color={theme.iconDefault}
                  size={20}
                  style={styles.inputIcon}
                />
                <Text style={styles.inputText}>{formatDateDisplay(date)}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                  themeVariant={isDark ? "dark" : "light"}
                />
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>
                ผู้บันทึกข้อมูล/ผู้มอบหมาย{" "}
                <Text style={styles.required}>*</Text>
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: theme.inputBg },
                ]}
              >
                <User
                  color={theme.iconDefault}
                  size={20}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.textInput, { color: theme.textSecondary }]}
                  value={assignerName}
                  onChangeText={setAssignerName}
                  placeholder="ชื่อจะขึ้นอัตโนมัติ..."
                  placeholderTextColor={theme.placeholder}
                  editable={
                    assignerName === "" || assignerName === "ไม่พบข้อมูลชื่อ"
                  }
                />
              </View>
            </View>

            {/* [NEW] สถานที่ปฏิบัติงาน + Autocomplete */}
            <View style={[styles.formGroup, { zIndex: 20 }]}>
              <Text style={styles.inputLabel}>
                สถานที่ปฏิบัติงาน <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.inputWrapper}>
                <MapPin
                  color={theme.iconDefault}
                  size={20}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={location}
                  onChangeText={handleLocationChange}
                  onBlur={() =>
                    setTimeout(() => setShowLocationList(false), 200)
                  } // Delay นิดนึงให้กด list ทัน
                  placeholder="เช่น ตม.แจ้งวัฒนะ"
                  placeholderTextColor={theme.placeholder}
                />
              </View>

              {/* Dropdown สถานที่ */}
              {showLocationList && (
                <View
                  style={[
                    styles.dropdownContainer,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <ScrollView
                    style={{ maxHeight: 150 }}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled={true}
                  >
                    {filteredLocations.map((item, index) => (
                      <TouchableOpacity
                        key={`loc-${index}`}
                        style={[
                          styles.dropdownItem,
                          { borderBottomColor: theme.border },
                        ]}
                        onPress={() => {
                          setLocation(item);
                          setShowLocationList(false);
                        }}
                      >
                        <History
                          color={theme.iconDefault}
                          size={14}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={{ color: theme.text, fontSize: 14 }}>
                          {item}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* [NEW] กิจกรรมที่ทำ + Autocomplete */}
            <View style={[styles.formGroup, { zIndex: 10 }]}>
              <Text style={styles.inputLabel}>
                กิจกรรมที่ทำ <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.inputWrapper}>
                <ListChecks
                  color={theme.iconDefault}
                  size={20}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={activity}
                  onChangeText={handleActivityChange}
                  onBlur={() =>
                    setTimeout(() => setShowActivityList(false), 200)
                  }
                  placeholder="งานที่ทำโดยย่อ"
                  placeholderTextColor={theme.placeholder}
                />
              </View>

              {/* Dropdown กิจกรรม */}
              {showActivityList && (
                <View
                  style={[
                    styles.dropdownContainer,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <ScrollView
                    style={{ maxHeight: 150 }}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled={true}
                  >
                    {filteredActivities.map((item, index) => (
                      <TouchableOpacity
                        key={`act-${index}`}
                        style={[
                          styles.dropdownItem,
                          { borderBottomColor: theme.border },
                        ]}
                        onPress={() => {
                          setActivity(item);
                          setShowActivityList(false);
                        }}
                      >
                        <History
                          color={theme.iconDefault}
                          size={14}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={{ color: theme.text, fontSize: 14 }}>
                          {item}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>

          {/* 3. Image Upload */}
          <View style={[styles.sectionContainer, { zIndex: 1 }]}>
            <View style={styles.labelRow}>
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: isDark ? "#064E3B" : "#D1FAE5" },
                ]}
              >
                <ImagePlus color="#059669" size={20} />
              </View>
              <Text style={styles.sectionLabel}>รูปภาพ</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{images.length} รูป</Text>
              </View>
            </View>

            <View style={styles.uploadContainer}>
              {images.length === 0 ? (
                <TouchableOpacity
                  style={styles.uploadPlaceholder}
                  onPress={pickImage}
                >
                  <View style={styles.uploadIconCircle}>
                    <CloudUpload color="#10B981" size={32} />
                  </View>
                  <Text style={styles.uploadTextTitle}>
                    แตะเพื่อเพิ่มรูปภาพ
                  </Text>
                  <Text style={styles.uploadTextSub}>เลือกได้หลายรูป</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.imageGrid}>
                  <TouchableOpacity
                    style={styles.addImageBtn}
                    onPress={pickImage}
                  >
                    <CloudUpload color={theme.iconDefault} size={24} />
                    <Text style={styles.addMoreText}>เพิ่ม</Text>
                  </TouchableOpacity>
                  {images.map((img, index) => (
                    <View key={index} style={styles.imageThumbnailWrapper}>
                      <TouchableOpacity
                        key={index}
                        onPress={() => openImageModal(img.uri)}
                      >
                        <Image
                          source={{ uri: img.uri }}
                          style={styles.imageThumbnail}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => removeImage(index)}
                      >
                        <X color="#FFF" size={12} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              <Modal
                visible={showImageModal}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowImageModal(false)}
              >
                <View style={styles.fullImageContainer}>
                  <BlurView
                    intensity={80}
                    tint="dark"
                    style={StyleSheet.absoluteFill}
                  />
                  <TouchableOpacity
                    style={styles.closeImageBtn}
                    onPress={() => setShowImageModal(false)}
                  >
                    <X size={30} color="white" />
                  </TouchableOpacity>
                  {activeImageUrl && (
                    <Image
                      source={{ uri: activeImageUrl }}
                      style={styles.fullScreenImage}
                      resizeMode="contain"
                    />
                  )}
                </View>
              </Modal>
            </View>
          </View>

          {/* 4. Details & Submit */}
          <View
            style={[
              styles.sectionContainer,
              { borderTopWidth: 4, borderTopColor: "#3B82F6", zIndex: 1 },
            ]}
          >
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <AlignLeft color={theme.textSecondary} size={16} />
                <Text
                  style={[
                    styles.inputLabel,
                    { marginBottom: 0, marginLeft: 4 },
                  ]}
                >
                  รายละเอียดเพิ่มเติม
                </Text>
              </View>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={details}
                onChangeText={setDetails}
                placeholder="ระบุหมายเหตุ..."
                placeholderTextColor={theme.placeholder}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                isSubmitting && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Save color="#FFF" size={20} style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>บันทึกข้อมูลงาน</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      <BeautifulAlert
        visible={alertConfig.visible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        showCancel={alertConfig.showCancel}
        onConfirm={alertConfig.onConfirm}
        onCancel={closeAlert}
        isDark={isDark}
      />
    </KeyboardAvoidingView>
  );
}

// --- Dynamic Styles ---
const getStyles = (isDark: boolean) => {
  const theme = isDark ? Colors.dark : Colors.light;

  return StyleSheet.create({
    fullImageContainer: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.9)",
      justifyContent: "center",
      alignItems: "center",
    },
    fullScreenImage: { width: "100%", height: "80%" },
    closeImageBtn: {
      position: "absolute",
      top: 50,
      right: 20,
      zIndex: 10,
      padding: 10,
      backgroundColor: "rgba(255,255,255,0.2)",
      borderRadius: 20,
    },
    container: { flex: 1, backgroundColor: theme.background },
    scrollContent: { padding: 16 },
    headerCard: {
      backgroundColor: theme.card,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      shadowColor: isDark ? "#000" : "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    headerTitleRow: { flexDirection: "row", alignItems: "center" },
    headerIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: "#2563EB",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: theme.text,
      flexShrink: 1,
    },
    sectionContainer: {
      backgroundColor: theme.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      marginBottom: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    labelRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    iconBox: { padding: 6, borderRadius: 8, marginRight: 8 },
    sectionLabel: { fontSize: 16, fontWeight: "bold", color: theme.text },
    required: { color: "#EF4444" },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    companyCard: {
      width: "48%",
      aspectRatio: 1,
      backgroundColor: theme.card,
      borderWidth: 2,
      borderColor: theme.border,
      borderRadius: 20,
      marginBottom: 12,
      alignItems: "center",
      justifyContent: "center",
      padding: 8,
    },
    companyCardSelected: {
      elevation: 4,
      shadowColor: isDark ? "#000" : "#3B82F6",
      shadowOpacity: 0.2,
    },
    logo: { width: "80%", height: "50%", marginBottom: 8 },
    companyName: {
      fontSize: 12,
      fontWeight: "bold",
      color: theme.textSecondary,
      textAlign: "center",
    },
    formGroup: { marginBottom: 16 },
    inputLabel: {
      fontSize: 12,
      fontWeight: "bold",
      color: theme.textSecondary,
      marginBottom: 6,
    },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      height: 48,
      paddingHorizontal: 12,
    },
    inputIcon: { marginRight: 8 },
    textInput: { flex: 1, fontSize: 14, color: theme.text, height: "100%" },
    inputText: { fontSize: 14, color: theme.text },
    textArea: {
      height: 80,
      paddingVertical: 12,
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginTop: 8,
    },
    countBadge: {
      marginLeft: "auto",
      backgroundColor: isDark ? "#334155" : "#F1F5F9",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    countText: { fontSize: 10, fontWeight: "bold", color: theme.textSecondary },
    uploadContainer: { minHeight: 120 },
    uploadPlaceholder: {
      borderWidth: 2,
      borderColor: isDark ? "#334155" : "#CBD5E1",
      borderStyle: "dashed",
      borderRadius: 16,
      height: 150,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.inputBg,
    },
    uploadIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: isDark ? "#064E3B" : "#D1FAE5",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    uploadTextTitle: { fontSize: 14, fontWeight: "bold", color: theme.text },
    uploadTextSub: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
    imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    addImageBtn: {
      width: 80,
      height: 80,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: isDark ? "#334155" : "#CBD5E1",
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.inputBg,
    },
    addMoreText: {
      fontSize: 10,
      fontWeight: "bold",
      color: theme.textSecondary,
      marginTop: 4,
    },
    imageThumbnailWrapper: {
      width: 80,
      height: 80,
      borderRadius: 12,
      overflow: "hidden",
      position: "relative",
    },
    imageThumbnail: { width: "100%", height: "100%" },
    removeBtn: {
      position: "absolute",
      top: 4,
      right: 4,
      backgroundColor: "rgba(239, 68, 68, 0.8)",
      padding: 4,
      borderRadius: 10,
    },
    submitBtn: {
      backgroundColor: "#2563EB",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      borderRadius: 12,
      marginTop: 8,
      shadowColor: "#2563EB",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    submitBtnDisabled: {
      backgroundColor: theme.textSecondary,
      shadowOpacity: 0,
    },
    submitBtnText: { color: "#FFF", fontSize: 16, fontWeight: "bold" },

    // --- [NEW] Styles สำหรับ Dropdown ---
    dropdownContainer: {
      position: "absolute",
      top: 75, // ปรับให้ลอยอยู่ใต้กล่อง Input พอดี
      left: 0,
      right: 0,
      borderWidth: 1,
      borderRadius: 12,
      zIndex: 999, // ดันให้อยู่บนสุด
      elevation: 10, // สำหรับ Android
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
    },
    dropdownItem: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      borderBottomWidth: 1,
    },
  });
};
