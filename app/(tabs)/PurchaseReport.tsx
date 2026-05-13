import { FontAwesome5 } from "@expo/vector-icons";
import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { API_BASE } from "../../constants/config";
import { useAuth } from "../_layout"; // ดึงชื่อ User จาก Auth Context (ถ้ามี)

// สีธีมสำหรับฝ่ายจัดซื้อ (เขียว)
const THEME_COLOR = "#059669";
const BG_COLOR = "#ecfdf5";

export default function PurchaseReport() {
  const router = useRouter();
  const { user } = useAuth(); // ดึง user จาก context
  const [loading, setLoading] = useState(false);

  // --- 1. ข้อมูลทั่วไป ---
  const [reportDate, setReportDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [reporterName, setReporterName] = useState(
    user?.fullname || "พนักงานจัดซื้อ",
  );

  // --- 2. รายการร้านค้า (Shops & Items) ---
  const [shops, setShops] = useState([
    {
      supplier_name: "",
      project_name: "",
      doc_number: "", // เลขที่บิล/PO
      tax_status: "ได้รับแล้ว", // ได้รับแล้ว, รอส่งตามหลัง, ไม่มี
      items: [{ name: "", qty: "" }], // รายการสินค้าในร้านนี้
    },
  ]);

  // --- 3. ค่าใช้จ่ายเพิ่มเติม (Expenses) ---
  const [expenses, setExpenses] = useState([
    {
      name: "",
      amount: "",
      uri: null as string | null,
      type: "image/jpeg",
      fileName: "",
    },
  ]);

  // --- 4. สรุปปัญหา ---
  const [problem, setProblem] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // ================= Logic: Shops =================
  const addShop = () => {
    setShops([
      ...shops,
      {
        supplier_name: "",
        project_name: "",
        doc_number: "",
        tax_status: "ได้รับแล้ว",
        items: [{ name: "", qty: "" }],
      },
    ]);
  };

  const removeShop = (index: number) => {
    const list = [...shops];
    list.splice(index, 1);
    setShops(list);
  };

  const updateShop = (index: number, field: string, value: string) => {
    const list = [...shops];
    (list[index] as any)[field] = value;
    setShops(list);
  };

  // --- Logic Items in Shop ---
  const addItem = (shopIndex: number) => {
    const list = [...shops];
    list[shopIndex].items.push({ name: "", qty: "" });
    setShops(list);
  };

  const removeItem = (shopIndex: number, itemIndex: number) => {
    const list = [...shops];
    list[shopIndex].items.splice(itemIndex, 1);
    setShops(list);
  };

  const updateItem = (
    shopIndex: number,
    itemIndex: number,
    field: string,
    value: string,
  ) => {
    const list = [...shops];
    (list[shopIndex].items[itemIndex] as any)[field] = value;
    setShops(list);
  };

  // ================= Logic: Expenses =================
  const addExpense = () => {
    setExpenses([
      ...expenses,
      { name: "", amount: "", uri: null, type: "image/jpeg", fileName: "" },
    ]);
  };

  const removeExpense = (index: number) => {
    const list = [...expenses];
    list.splice(index, 1);
    setExpenses(list);
  };

  const updateExpense = (index: number, field: string, value: string) => {
    const list = [...expenses];
    (list[index] as any)[field] = value;
    setExpenses(list);
  };

  // --- Logic เลือกรูปภาพ (กล้อง + อัลบั้ม) ---
  const pickExpenseImage = async (index: number) => {
    Alert.alert("เลือกรูปภาพหลักฐาน", "กรุณาเลือกวิธีการแนบรูปภาพ", [
      {
        text: "ถ่ายรูป",
        onPress: async () => {
          // ขอสิทธิ์กล้อง
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            Alert.alert(
              "ไม่ได้รับอนุญาต",
              "ต้องการสิทธิ์การเข้าถึงกล้องเพื่อถ่ายรูป",
            );
            return;
          }

          let result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsEditing: false,
          });
          handleImageResult(result, index);
        },
      },
      {
        text: "เลือกจากอัลบั้ม",
        onPress: async () => {
          let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
          });
          handleImageResult(result, index);
        },
      },
      { text: "ยกเลิก", style: "cancel" },
    ]);
  };

  // ฟังก์ชันช่วยจัดการผลลัพธ์รูปภาพ
  const handleImageResult = (
    result: ImagePicker.ImagePickerResult,
    index: number,
  ) => {
    if (!result.canceled) {
      const asset = result.assets[0];
      const list = [...expenses];
      list[index].uri = asset.uri;
      list[index].fileName = asset.fileName || `receipt_${Date.now()}.jpg`;
      list[index].type = asset.mimeType || "image/jpeg";
      setExpenses(list);
    }
  };

  // ================= Calculate =================
  const calculateTotal = () => {
    return expenses
      .reduce((acc, item) => acc + (parseFloat(item.amount) || 0), 0)
      .toFixed(2);
  };

  // ================= Submit =================
  const handleSubmit = async () => {
    if (shops.some((s) => !s.supplier_name.trim())) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณาระบุชื่อร้านค้าอย่างน้อย 1 ร้าน");
      return;
    }

    setLoading(true);
    const formData = new FormData();

    // 1. Header Data
    formData.append("report_date", reportDate);
    formData.append("reporter_name", reporterName);
    formData.append("problem", problem);
    formData.append("additional_notes", additionalNotes);

    // 2. Shops Data (Loop)
    shops.forEach((shop, idx) => {
      formData.append(`shops[${idx}][supplier]`, shop.supplier_name);
      formData.append(`shops[${idx}][project]`, shop.project_name);
      formData.append(`shops[${idx}][doc_no]`, shop.doc_number);
      formData.append(`shops[${idx}][tax_status]`, shop.tax_status);

      // Items inside Shop
      shop.items.forEach((item, itemIdx) => {
        formData.append(`shops[${idx}][products][${itemIdx}][name]`, item.name);
        formData.append(`shops[${idx}][products][${itemIdx}][qty]`, item.qty);
      });
    });

    // 3. Expenses Data
    expenses.forEach((exp, idx) => {
      if (exp.name || exp.amount) {
        formData.append("exp_name[]", exp.name);
        formData.append("exp_amount[]", exp.amount);
        if (exp.uri) {
          // @ts-ignore
          formData.append("exp_file[]", {
            uri:
              Platform.OS === "android"
                ? exp.uri
                : exp.uri.replace("file://", ""),
            name: exp.fileName,
            type: exp.type,
          });
        }
      }
    });

    try {
      // ✅ ยิงไปที่ api_mobile.php?action=submit_purchase
      const response = await axios.post(
        `${API_BASE}/api_mobile.php?action=submit_purchase`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      console.log("Upload Res:", response.data);

      if (response.data.status === "success") {
        Alert.alert("สำเร็จ", "บันทึกรายงานจัดซื้อเรียบร้อย", [
          { text: "ตกลง", onPress: () => router.back() },
        ]);
      } else {
        Alert.alert("ผิดพลาด", response.data.message || "ส่งข้อมูลไม่สำเร็จ");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={20} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📝 รายงานจัดซื้อ</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* 1. ข้อมูลผู้รายงาน */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <FontAwesome5 name="user-clock" /> ข้อมูลทั่วไป
          </Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.disabledInput, { flex: 1 }]}
              value={reportDate}
              editable={false}
            />
            <TextInput
              style={[styles.input, styles.disabledInput, { flex: 1 }]}
              value={reporterName}
              editable={false}
            />
          </View>
        </View>

        {/* 2. รายการร้านค้า */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <FontAwesome5 name="store" /> รายการร้านค้า
          </Text>

          {shops.map((shop, idx) => (
            <View key={idx} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>ร้านค้าที่ {idx + 1}</Text>
                {shops.length > 1 && (
                  <TouchableOpacity onPress={() => removeShop(idx)}>
                    <FontAwesome5 name="trash" size={16} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>

              {/* ข้อมูลร้าน */}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>ชื่อร้าน *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="ระบุชื่อร้าน..."
                    value={shop.supplier_name}
                    onChangeText={(t) => updateShop(idx, "supplier_name", t)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>หน้างาน/โครงการ</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="ระบุหน้างาน..."
                    value={shop.project_name}
                    onChangeText={(t) => updateShop(idx, "project_name", t)}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>เลขที่บิล/PO</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="เลขที่เอกสาร..."
                    value={shop.doc_number}
                    onChangeText={(t) => updateShop(idx, "doc_number", t)}
                  />
                </View>
              </View>

              {/* สถานะบิล */}
              <Text style={styles.label}>สถานะบิล/ใบกำกับภาษี</Text>
              <View style={styles.radioGroup}>
                {["ได้รับแล้ว", "รอส่งตามหลัง", "ไม่มี/ออกไม่ได้"].map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.radio,
                      shop.tax_status === st && styles.radioActive,
                    ]}
                    onPress={() => updateShop(idx, "tax_status", st)}
                  >
                    <Text
                      style={[
                        styles.radioText,
                        shop.tax_status === st && { color: "#fff" },
                      ]}
                    >
                      {st}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.divider} />

              {/* รายการของในร้าน */}
              <Text style={styles.subHeader}>รายการสินค้า</Text>
              {shop.items.map((item, itemIdx) => (
                <View key={itemIdx} style={styles.itemRow}>
                  <TextInput
                    style={[styles.input, { flex: 2, marginBottom: 0 }]}
                    placeholder="ชื่อสินค้า/วัสดุ"
                    value={item.name}
                    onChangeText={(t) => updateItem(idx, itemIdx, "name", t)}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="จำนวน"
                    value={item.qty}
                    onChangeText={(t) => updateItem(idx, itemIdx, "qty", t)}
                  />
                  {shop.items.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeItem(idx, itemIdx)}
                      style={{ padding: 8 }}
                    >
                      <FontAwesome5 name="times" size={14} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity
                style={styles.addMiniBtn}
                onPress={() => addItem(idx)}
              >
                <Text style={styles.addMiniText}>+ เพิ่มรายการสินค้า</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.addMainBtn} onPress={addShop}>
            <Text style={styles.addMainText}>+ เพิ่มร้านค้า</Text>
          </TouchableOpacity>
        </View>

        {/* 3. ค่าใช้จ่าย (ถ้ามี) */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: "#ef4444" }]}>
            <FontAwesome5 name="wallet" /> ค่าใช้จ่ายอื่นๆ (ถ้ามี)
          </Text>

          {expenses.map((exp, idx) => (
            <View key={idx} style={styles.expenseRow}>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.input}
                  placeholder="รายการ (เช่น ค่าทางด่วน, ค่าส่ง)"
                  value={exp.name}
                  onChangeText={(t) => updateExpense(idx, "name", t)}
                />
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="จำนวนเงิน (บาท)"
                    keyboardType="numeric"
                    value={exp.amount}
                    onChangeText={(t) => updateExpense(idx, "amount", t)}
                  />
                  <TouchableOpacity
                    style={styles.uploadBtn}
                    onPress={() => pickExpenseImage(idx)}
                  >
                    {exp.uri ? (
                      <Image
                        source={{ uri: exp.uri }}
                        style={{ width: 30, height: 30, borderRadius: 4 }}
                      />
                    ) : (
                      <FontAwesome5 name="camera" color="#666" />
                    )}
                    <Text style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                      {exp.uri ? "เปลี่ยน" : "รูป"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {expenses.length > 1 && (
                <TouchableOpacity
                  onPress={() => removeExpense(idx)}
                  style={{ padding: 10 }}
                >
                  <FontAwesome5 name="trash-alt" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}

          <TouchableOpacity style={styles.addMiniBtn} onPress={addExpense}>
            <Text style={[styles.addMiniText, { color: "#ef4444" }]}>
              + เพิ่มรายการค่าใช้จ่าย
            </Text>
          </TouchableOpacity>

          <View style={[styles.totalBox, { backgroundColor: "#fee2e2" }]}>
            <Text style={[styles.totalText, { color: "#b91c1c" }]}>
              รวมเป็นเงิน: {calculateTotal()} บาท
            </Text>
          </View>
        </View>

        {/* 4. ปัญหา/หมายเหตุ */}
        <View style={styles.section}>
          <Text style={styles.label}>ปัญหาที่พบ</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={2}
            placeholder="ระบุปัญหา (ถ้ามี)..."
            value={problem}
            onChangeText={setProblem}
          />

          <Text style={[styles.label, { marginTop: 10 }]}>
            บันทึกรายงานเพิ่มเติม
          </Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={2}
            placeholder="..."
            value={additionalNotes}
            onChangeText={setAdditionalNotes}
          />
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <FontAwesome5 name="save" color="#fff" size={16} />
              <Text style={styles.submitText}> บันทึกรายงาน</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 15,
    paddingTop: 50,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  backBtn: { padding: 10 },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: THEME_COLOR },
  container: { flex: 1, backgroundColor: BG_COLOR },

  section: {
    backgroundColor: "#fff",
    margin: 15,
    marginBottom: 0,
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: THEME_COLOR,
    marginBottom: 15,
  },

  row: { flexDirection: "row", gap: 10 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 5 },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    marginBottom: 10,
    color: "#333",
  },
  disabledInput: { backgroundColor: "#f3f4f6", color: "#6b7280" },
  textArea: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    height: 60,
    textAlignVertical: "top",
  },

  // Card
  card: {
    borderLeftWidth: 4,
    borderLeftColor: THEME_COLOR,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: { fontWeight: "bold", color: THEME_COLOR },
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 10,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  // Items
  subHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    marginBottom: 5,
  },

  // Radio
  radioGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 10,
  },
  radio: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
  },
  radioActive: { backgroundColor: THEME_COLOR, borderColor: THEME_COLOR },
  radioText: { fontSize: 11, color: "#4b5563" },

  // Buttons
  addMiniBtn: { alignSelf: "center", padding: 8 },
  addMiniText: { color: THEME_COLOR, fontWeight: "600", fontSize: 13 },
  addMainBtn: {
    backgroundColor: "#047857",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  addMainText: { color: "#fff", fontWeight: "bold" },

  // Expense
  expenseRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderColor: "#f3f4f6",
    paddingBottom: 10,
    marginBottom: 10,
  },
  uploadBtn: {
    width: 50,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginLeft: 5,
  },
  totalBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    alignItems: "flex-end",
  },
  totalText: { fontWeight: "bold", fontSize: 15 },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#e5e7eb",
  },
  submitBtn: {
    backgroundColor: THEME_COLOR,
    padding: 15,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  submitText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    marginLeft: 10,
  },
});
