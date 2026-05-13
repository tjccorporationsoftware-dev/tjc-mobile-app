import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
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
  View,
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

export default function WriteReportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

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

  // 📦 1. ส่วนกล่องงาน
  const [workBoxes, setWorkBoxes] = useState([
    {
      id: Date.now(),
      customer: "",
      project: "",
      value: "",
      type: "ลูกค้าใหม่",
      status: "",
      summary: "",
      notes: "",
      filteredCustomers: [] as string[],
      showSuggestions: false,
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
      try {
        const [statRes, custRes] = await Promise.all([
          axios.get(`${API_BASE}/api_data.php?action=get_job_status`),
          axios.get(
            `${API_BASE}/api_mobile.php?action=get_customers&fullname=${user?.fullname}`,
          ),
        ]);

        if (Array.isArray(statRes.data)) setStatusList(statRes.data);

        if (custRes.data.status === "success") {
          const planCus = custRes.data.plan_customers || [];
          const masterCus = custRes.data.master_customers || [];
          setCustomerList(planCus);
          setMasterCustomerList(masterCus);
          setWorkBoxes((prev) =>
            prev.map((b, i) =>
              i === 0 ? { ...b, filteredCustomers: planCus } : b,
            ),
          );
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadInitialData();
  }, [user]);

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });
    if (!result.canceled) {
      if (type === "fuel") {
        const newItems = [...expenses.fuel.items];
        newItems[index].image = result.assets[0].uri;
        setExpenses({
          ...expenses,
          fuel: { ...expenses.fuel, items: newItems },
        });
      } else {
        setExpenses({
          ...expenses,
          [type]: { ...expenses[type], image: result.assets[0].uri },
        });
      }
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

  const handleSubmit = async () => {
    if (workBoxes.some((b) => !b.customer || !b.status))
      return Alert.alert(
        "แจ้งเตือน",
        "กรุณากรอกชื่อลูกค้าและสถานะงานในทุกกล่อง",
      );
    setLoading(true);
    const postData = new FormData();
    postData.append("reporter_name", user?.fullname || "");
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
      postData.append("project_value[]", box.value); // ส่งค่าที่มี , ไปเลย (PHP เก็บเป็น string อยู่แล้ว)
      postData.append("job_status[]", box.status);
      postData.append("visit_summary[]", box.summary);
      postData.append("additional_notes[]", box.notes);
      postData.append(`customer_type_${i + 1}`, box.type);
    });

    if (expenses.fuel.enabled) {
      expenses.fuel.items.forEach((item, idx) => {
        postData.append("fuel_cost[]", item.cost || "0");
        if (item.image) {
          // @ts-ignore
          postData.append("fuel_receipt_file[]", {
            uri: item.image,
            name: `fuel_${idx}.jpg`,
            type: "image/jpeg",
          });
        }
      });
    }
    if (expenses.hotel.enabled) {
      postData.append("accommodation_cost", expenses.hotel.cost || "0");
      if (expenses.hotel.image) {
        // @ts-ignore
        postData.append("accommodation_receipt_file", {
          uri: expenses.hotel.image,
          name: "hotel.jpg",
          type: "image/jpeg",
        });
      }
    }
    if (expenses.other.enabled) {
      postData.append("other_cost", expenses.other.cost || "0");
      postData.append("other_cost_detail", expenses.other.detail);
      if (expenses.other.image) {
        // @ts-ignore
        postData.append("other_receipt_file", {
          uri: expenses.other.image,
          name: "other.jpg",
          type: "image/jpeg",
        });
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
          { text: "ตกลง", onPress: () => router.replace("/(tabs)/Profile") },
        ]);
      }
    } catch (e) {
      Alert.alert("Error", "ส่งข้อมูลไม่สำเร็จ");
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
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      if (selectorConfig.field === "area")
                        setLocationInfo({ ...locationInfo, area: item });
                      else
                        updateWorkBox(
                          selectorConfig.boxId,
                          selectorConfig.field,
                          item,
                        );
                      setSelectorVisible(false);
                    }}
                  >
                    <Text style={styles.modalItemText}>{item}</Text>
                  </TouchableOpacity>
                )}
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
});
