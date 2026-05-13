import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { API_BASE } from "../../constants/config";
import { useAuth } from "../_layout";

// --- Interfaces ---
interface DocRef {
  id: number;
  type: string;
  number: string;
  desc: string; // [เพิ่มใหม่] เก็บชื่อรายการ
  amount: string; // [เพิ่มใหม่] เก็บจำนวนเงิน
}

interface AdminItem {
  id: number;
  docRefs: DocRef[];
  company: string;
  department: string;
  project: string;
  laborCost: string;
  accommodationCost: string;
  otherDesc: string;
  otherAmount: string;
  accommodationFile: any;
  otherFile: any;
}

interface GenericItem {
  id: number;
  department: string;
  project: string;
  amount: string;
  extra1?: string;
}

// Master Data
const DOC_TYPES = ["AX", "PO", "SO", "-"];

export default function AdminReport() {
  const { user } = useAuth();
  const [reportDate, setReportDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const [companyList, setCompanyList] = useState<string[]>([]);

  // Modal States
  const [companyModalVisible, setCompanyModalVisible] = useState(false);
  const [docTypeModalVisible, setDocTypeModalVisible] = useState(false);

  const [currentEditingId, setCurrentEditingId] = useState<number | null>(null);
  const [currentDocTarget, setCurrentDocTarget] = useState<{
    itemId: number;
    docId: number;
  } | null>(null);

  // Toggles
  const [sections, setSections] = useState({
    admin: false,
    pr: false,
    job: false,
    bg: false,
    stamp: false,
  });

  const [adminItems, setAdminItems] = useState<AdminItem[]>([]);
  const [prItems, setPrItems] = useState<GenericItem[]>([]);
  const [jobItems, setJobItems] = useState<GenericItem[]>([]);
  const [bgItems, setBgItems] = useState<GenericItem[]>([]);
  const [stampItems, setStampItems] = useState<GenericItem[]>([]);

  const [totalNet, setTotalNet] = useState(0);

  // --- Init ---
  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const res = await axios.get(
        `${API_BASE}/api_mobile.php?action=get_companies`,
      );
      if (Array.isArray(res.data)) setCompanyList(res.data);
    } catch (error) {
      console.log("Failed to fetch companies", error);
    }
  };

  useEffect(() => {
    let total = 0;
    adminItems.forEach((item) => {
      const labor = parseFloat(item.laborCost || "0");
      const accom = parseFloat(item.accommodationCost || "0");
      const other = parseFloat(item.otherAmount || "0");

      // [เพิ่ม] วนลูปบวกเงินจากเอกสารย่อย
      let docTotal = 0;
      item.docRefs.forEach((d) => {
        docTotal += parseFloat(d.amount || "0");
      });

      total += labor * 0.97 + accom + other + docTotal; // รวม docTotal เข้าไป
    });

    prItems.forEach((i) => (total += parseFloat(i.amount || "0")));
    jobItems.forEach((i) => (total += parseFloat(i.amount || "0")));
    bgItems.forEach((i) => (total += parseFloat(i.amount || "0")));
    stampItems.forEach((i) => (total += parseFloat(i.amount || "0")));

    setTotalNet(total);
  }, [adminItems, prItems, jobItems, bgItems, stampItems]);

  // --- Handlers: Generic Items (แก้ชื่อฟังก์ชันให้ตรงกัน) ---
  const addGenericItem = (setter: any) =>
    setter((prev: any) => [
      ...prev,
      { id: Date.now(), department: "", project: "", amount: "", extra1: "" },
    ]);
  const removeGenericItem = (id: number, setter: any) =>
    setter((prev: any) => prev.filter((i: any) => i.id !== id));
  const updateGenericItem = (
    id: number,
    field: keyof GenericItem,
    value: string,
    setter: any,
  ) => {
    setter((prev: any) =>
      prev.map((item: any) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  };

  const toggleSection = (key: keyof typeof sections) => {
    setSections((prev) => {
      const newState = { ...prev, [key]: !prev[key] };
      if (newState[key]) {
        if (key === "admin" && adminItems.length === 0) addAdminRow();
        if (key === "pr" && prItems.length === 0) addGenericItem(setPrItems);
        if (key === "job" && jobItems.length === 0) addGenericItem(setJobItems);
        if (key === "bg" && bgItems.length === 0) addGenericItem(setBgItems);
        if (key === "stamp" && stampItems.length === 0)
          addGenericItem(setStampItems);
      }
      return newState;
    });
  };

  // --- Admin Handlers ---
  const addAdminRow = () => {
    setAdminItems([
      ...adminItems,
      {
        id: Date.now(),
        docRefs: [
          { id: Date.now(), type: "AX", number: "", desc: "", amount: "" },
        ],
        company: "",
        department: "",
        project: "",
        laborCost: "",
        accommodationCost: "",
        otherDesc: "",
        otherAmount: "",
        accommodationFile: null,
        otherFile: null,
      },
    ]);
  };

  const removeAdminRow = (id: number) =>
    setAdminItems((prev) => prev.filter((i) => i.id !== id));

  const updateAdminRow = (id: number, field: keyof AdminItem, value: any) => {
    setAdminItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const addSubDoc = (itemId: number) => {
    setAdminItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              docRefs: [
                ...item.docRefs,
                {
                  id: Date.now(),
                  type: "AX",
                  number: "",
                  desc: "",
                  amount: "",
                },
              ],
            }
          : item,
      ),
    );
  };

  const updateSubDocField = (
    itemId: number,
    docId: number,
    field: keyof DocRef,
    value: string,
  ) => {
    setAdminItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              docRefs: item.docRefs.map((d) =>
                // ✅ จุดที่แก้ไข: ใช้ [field] เพื่อให้มันรู้ว่าต้องอัปเดตช่องไหน (รายการ/เงิน/เลขที่)
                d.id === docId ? { ...d, [field]: value } : d,
              ),
            }
          : item,
      ),
    );
  };

  const removeSubDoc = (itemId: number, docId: number) => {
    setAdminItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, docRefs: item.docRefs.filter((d) => d.id !== docId) }
          : item,
      ),
    );
  };

  const openDocTypePicker = (itemId: number, docId: number) => {
    setCurrentDocTarget({ itemId, docId });
    setDocTypeModalVisible(true);
  };

  const selectDocType = (type: string) => {
    if (currentDocTarget) {
      setAdminItems((prev) =>
        prev.map((item) =>
          item.id === currentDocTarget.itemId
            ? {
                ...item,
                docRefs: item.docRefs.map((d) =>
                  d.id === currentDocTarget.docId ? { ...d, type: type } : d,
                ),
              }
            : item,
        ),
      );
    }
    setDocTypeModalVisible(false);
    setCurrentDocTarget(null);
  };

  const openCompanyPicker = (id: number) => {
    setCurrentEditingId(id);
    setCompanyModalVisible(true);
  };
  const selectCompany = (name: string) => {
    if (currentEditingId) updateAdminRow(currentEditingId, "company", name);
    setCompanyModalVisible(false);
    setCurrentEditingId(null);
  };

  const handleFileAction = (
    id: number,
    field: "accommodationFile" | "otherFile",
  ) => {
    Alert.alert("แนบหลักฐาน", "กรุณาเลือกวิธีการแนบไฟล์", [
      { text: "📷 ถ่ายรูป", onPress: () => pickImage(id, field, "camera") },
      {
        text: "🖼️ เลือกจากอัลบั้ม",
        onPress: () => pickImage(id, field, "gallery"),
      },
      { text: "📂 เลือกไฟล์", onPress: () => pickDocument(id, field) },
      { text: "ยกเลิก", style: "cancel" },
    ]);
  };

  const pickImage = async (
    id: number,
    field: "accommodationFile" | "otherFile",
    type: "camera" | "gallery",
  ) => {
    try {
      let result;
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: false,
      };

      if (type === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== "granted")
          return Alert.alert("ต้องการสิทธิ์", "กรุณาอนุญาตให้เข้าถึงกล้อง");
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      if (!result.canceled) {
        const asset = result.assets[0];
        const fileObj = {
          uri: asset.uri,
          name: asset.fileName || `photo_${Date.now()}.jpg`,
          mimeType: asset.mimeType || "image/jpeg",
          type: "image/jpeg",
        };
        updateAdminRow(id, field, fileObj);
      }
    } catch (error) {
      console.log("Image Picker Error: ", error);
    }
  };

  const pickDocument = async (
    id: number,
    field: "accommodationFile" | "otherFile",
  ) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        updateAdminRow(id, field, result.assets[0]);
      }
    } catch (err) {
      console.log("File picker error:", err);
    }
  };

  // --- Submit ---
  const handleSubmit = async () => {
    const hasData = Object.values(sections).some((v) => v) || note.length > 0;
    if (!hasData)
      return Alert.alert("เตือน", "กรุณากรอกข้อมูลอย่างน้อย 1 ส่วน");

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("action", "submit_admin_report");
      formData.append("report_date", reportDate);
      formData.append("reporter_name", user?.fullname || "Unknown");
      formData.append("note", note);

      const processedAdminItems = adminItems.map((item) => ({
        ...item,
        // [แก้ไข] Logic การรวมข้อความ
        docRefs: item.docRefs
          .map((d) => {
            let str = `${d.type} ${d.number}`;

            // สร้างส่วนรายละเอียดในวงเล็บ
            let details = [];
            if (d.desc) details.push(d.desc);
            if (d.amount) details.push(d.amount); // ไม่ต้องใส่หน่วย 'บาท' ก็ได้ เดี๋ยวหน้าเว็บเติมให้

            // ถ้าระบุรายการหรือเงินมา ให้เติมวงเล็บต่อท้าย
            if (details.length > 0) {
              str += ` (${details.join(" : ")})`;
            }
            return str.trim();
          })
          .filter((s) => s.length > 2), // กรองค่าว่างทิ้ง
      }));
      formData.append(
        "adminItems",
        JSON.stringify(sections.admin ? processedAdminItems : []),
      );

      formData.append(
        "prItems",
        JSON.stringify(
          sections.pr
            ? prItems.map((i) => ({
                department: i.department,
                project: i.project,
                budget: i.amount,
              }))
            : [],
        ),
      );
      formData.append(
        "jobItems",
        JSON.stringify(
          sections.job
            ? jobItems.map((i) => ({
                jobNumber: i.extra1,
                department: i.department,
                project: i.project,
                budget: i.amount,
              }))
            : [],
        ),
      );
      formData.append(
        "bgItems",
        JSON.stringify(
          sections.bg
            ? bgItems.map((i) => ({
                department: i.department,
                project: i.project,
                amount: i.amount,
              }))
            : [],
        ),
      );
      formData.append(
        "stampItems",
        JSON.stringify(
          sections.stamp
            ? stampItems.map((i) => ({
                department: i.department,
                project: i.project,
                cost: i.amount,
              }))
            : [],
        ),
      );

      formData.append("totals", JSON.stringify({ net: totalNet }));

      if (sections.admin) {
        adminItems.forEach((item) => {
          if (item.accommodationFile) {
            const file: any = {
              uri: item.accommodationFile.uri,
              name: item.accommodationFile.name || `file_${Date.now()}.jpg`,
              type: item.accommodationFile.mimeType || "image/jpeg",
            };
            formData.append(`admin_accom_files[]`, file);
          }
          if (item.otherFile) {
            const file: any = {
              uri: item.otherFile.uri,
              name: item.otherFile.name || `file_${Date.now()}.jpg`,
              type: item.otherFile.mimeType || "image/jpeg",
            };
            formData.append(`admin_other_files[]`, file);
          }
        });
      }

      const res = await axios.post(
        `${API_BASE}/api_mobile.php?action=submit_admin_report`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      if (res.data.status === "success") {
        Alert.alert("สำเร็จ", "บันทึกข้อมูลเรียบร้อย");
        setAdminItems([]);
        setPrItems([]);
        setJobItems([]);
        setBgItems([]);
        setStampItems([]);
        setSections({
          admin: false,
          pr: false,
          job: false,
          bg: false,
          stamp: false,
        });
        setNote("");
      } else {
        Alert.alert("ผิดพลาด", res.data.message || "บันทึกไม่สำเร็จ");
      }
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "ไม่สามารถเชื่อมต่อ Server ได้");
    } finally {
      setLoading(false);
    }
  };

  // --- Render Helpers ---
  const renderSectionHeader = (
    title: string,
    icon: any,
    key: keyof typeof sections,
    color: string,
  ) => (
    <TouchableOpacity
      style={styles.sectionHeader}
      onPress={() => toggleSection(key)}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={[styles.iconBox, { backgroundColor: color + "20" }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Ionicons
        name={sections[key] ? "chevron-up" : "chevron-down"}
        size={20}
        color="#666"
      />
    </TouchableOpacity>
  );

  const renderGenericSection = (
    key: keyof typeof sections,
    list: GenericItem[],
    setter: any,
    labelAmount: string,
    hasExtra: boolean = false,
  ) => {
    if (!sections[key]) return null;
    return (
      <View style={styles.sectionContent}>
        {list.map((item, index) => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemIndex}>รายการที่ {index + 1}</Text>
              <TouchableOpacity
                onPress={() => removeGenericItem(item.id, setter)}
              >
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            </View>
            {hasExtra && (
              <TextInput
                style={styles.input}
                placeholder="เลขหน้างาน"
                value={item.extra1}
                onChangeText={(v) =>
                  updateGenericItem(item.id, "extra1", v, setter)
                }
              />
            )}
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 5 }]}
                placeholder="หน่วยงาน"
                value={item.department}
                onChangeText={(v) =>
                  updateGenericItem(item.id, "department", v, setter)
                }
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="โครงการ"
                value={item.project}
                onChangeText={(v) =>
                  updateGenericItem(item.id, "project", v, setter)
                }
              />
            </View>
            <TextInput
              style={styles.input}
              placeholder={labelAmount + " (บาท)"}
              keyboardType="numeric"
              value={item.amount}
              onChangeText={(v) =>
                updateGenericItem(item.id, "amount", v, setter)
              }
            />
          </View>
        ))}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => addGenericItem(setter)}
        >
          <Ionicons name="add-circle-outline" size={20} color="#64748b" />
          <Text style={styles.addBtnText}>เพิ่มรายการ</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 50 }}
      >
        <View style={styles.header}>
          <Text style={styles.title}>บันทึกรายงานประจำวัน</Text>
          <Text style={styles.subtitle}>Daily Admin Report</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>วันที่รายงาน</Text>
          <TextInput
            style={styles.input}
            value={reportDate}
            onChangeText={setReportDate}
            placeholder="YYYY-MM-DD"
          />
        </View>

        {/* 1. Admin Expense */}
        <View style={styles.sectionCard}>
          {renderSectionHeader(
            "ค่าใช้จ่าย (Expenses)",
            "document-text",
            "admin",
            "#4f46e5",
          )}
          {sections.admin && (
            <View style={styles.sectionContent}>
              {adminItems.map((item, index) => (
                <View key={item.id} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemIndex}>รายการที่ {index + 1}</Text>
                    <TouchableOpacity onPress={() => removeAdminRow(item.id)}>
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#ef4444"
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.subSection}>
                    <Text style={styles.subLabel}>เลขที่เอกสาร</Text>
                    {item.docRefs.map((doc) => (
                      <View
                        key={doc.id}
                        style={{
                          backgroundColor: "#fff",
                          borderRadius: 8,
                          padding: 8,
                          marginBottom: 8,
                          borderWidth: 1,
                          borderColor: "#e2e8f0",
                        }}
                      >
                        {/* บรรทัดที่ 1: ประเภท + เลขที่ + ปุ่มลบ */}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <TouchableOpacity
                            style={styles.typeBox}
                            onPress={() => openDocTypePicker(item.id, doc.id)}
                          >
                            <Text style={styles.typeText}>
                              {doc.type}{" "}
                              <Ionicons name="caret-down" size={10} />
                            </Text>
                          </TouchableOpacity>

                          {/* เปลี่ยนมาใช้ updateSubDocField */}
                          <TextInput
                            style={[
                              styles.input,
                              { flex: 1, marginBottom: 0, height: 40 },
                            ]}
                            placeholder="เลขที่..."
                            value={doc.number}
                            onChangeText={(v) =>
                              updateSubDocField(item.id, doc.id, "number", v)
                            }
                          />

                          <TouchableOpacity
                            onPress={() => removeSubDoc(item.id, doc.id)}
                            style={{ padding: 5, marginLeft: 5 }}
                          >
                            <Ionicons
                              name="close-circle"
                              size={22}
                              color="#ef4444"
                            />
                          </TouchableOpacity>
                        </View>

                        {/* บรรทัดที่ 2: รายการ + จำนวนเงิน */}
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <TextInput
                            style={[
                              styles.input,
                              {
                                flex: 2,
                                marginBottom: 0,
                                height: 40,
                                fontSize: 13,
                              },
                            ]}
                            placeholder="รายการค่าใช้จ่าย"
                            value={doc.desc}
                            onChangeText={(v) =>
                              updateSubDocField(item.id, doc.id, "desc", v)
                            }
                          />
                          <TextInput
                            style={[
                              styles.input,
                              {
                                flex: 1,
                                marginBottom: 0,
                                height: 40,
                                fontSize: 13,
                              },
                            ]}
                            placeholder="จำนวนเงิน"
                            keyboardType="numeric"
                            value={doc.amount}
                            onChangeText={(v) =>
                              updateSubDocField(item.id, doc.id, "amount", v)
                            }
                          />
                        </View>
                      </View>
                    ))}
                    <TouchableOpacity
                      onPress={() => addSubDoc(item.id)}
                      style={styles.smallAddBtn}
                    >
                      <Text style={styles.smallAddText}>+ เพิ่มเอกสาร</Text>
                    </TouchableOpacity>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginTop: 10,
                      paddingTop: 8,
                      borderTopWidth: 1,
                      borderTopColor: "#e2e8f0",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        fontWeight: "600",
                      }}
                    >
                      รวมยอดเอกสาร:
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: "#4f46e5",
                        fontWeight: "bold",
                      }}
                    >
                      {item.docRefs
                        .reduce(
                          (sum, d) => sum + (parseFloat(d.amount) || 0),
                          0,
                        )
                        .toLocaleString()}{" "}
                      บาท
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => openCompanyPicker(item.id)}
                    style={styles.inputBtn}
                  >
                    <Text style={{ color: item.company ? "#000" : "#aaa" }}>
                      {item.company || "เลือกบริษัท"}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#666" />
                  </TouchableOpacity>

                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginRight: 5 }]}
                      placeholder="หน่วยงาน"
                      value={item.department}
                      onChangeText={(v) =>
                        updateAdminRow(item.id, "department", v)
                      }
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="โครงการ"
                      value={item.project}
                      onChangeText={(v) =>
                        updateAdminRow(item.id, "project", v)
                      }
                    />
                  </View>

                  <Text style={styles.subLabel}>ค่าใช้จ่าย</Text>
                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginRight: 5 }]}
                      placeholder="ค่าที่พัก"
                      keyboardType="numeric"
                      value={item.accommodationCost}
                      onChangeText={(v) =>
                        updateAdminRow(item.id, "accommodationCost", v)
                      }
                    />
                    <TouchableOpacity
                      style={styles.fileBtn}
                      onPress={() =>
                        handleFileAction(item.id, "accommodationFile")
                      }
                    >
                      <Ionicons
                        name={
                          item.accommodationFile ? "checkmark-circle" : "camera"
                        }
                        size={22}
                        color={item.accommodationFile ? "#10b981" : "#64748b"}
                      />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="ค่าแรง (เต็ม)"
                      keyboardType="numeric"
                      value={item.laborCost}
                      onChangeText={(v) =>
                        updateAdminRow(item.id, "laborCost", v)
                      }
                    />
                  </View>
                  <Text style={styles.hintText}>
                    สุทธิ (97%):{" "}
                    {(
                      parseFloat(item.laborCost || "0") * 0.97
                    ).toLocaleString()}{" "}
                    บาท
                  </Text>

                  <View style={[styles.row, { marginTop: 5 }]}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginRight: 5 }]}
                      placeholder="อื่นๆ (ระบุ)"
                      value={item.otherDesc}
                      onChangeText={(v) =>
                        updateAdminRow(item.id, "otherDesc", v)
                      }
                    />
                    <TextInput
                      style={[styles.input, { width: 80 }]}
                      placeholder="บาท"
                      keyboardType="numeric"
                      value={item.otherAmount}
                      onChangeText={(v) =>
                        updateAdminRow(item.id, "otherAmount", v)
                      }
                    />
                    <TouchableOpacity
                      style={styles.fileBtn}
                      onPress={() => handleFileAction(item.id, "otherFile")}
                    >
                      <Ionicons
                        name={item.otherFile ? "checkmark-circle" : "camera"}
                        size={22}
                        color={item.otherFile ? "#10b981" : "#64748b"}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.addBtn} onPress={addAdminRow}>
                <Ionicons name="add-circle-outline" size={20} color="#4f46e5" />
                <Text style={[styles.addBtnText, { color: "#4f46e5" }]}>
                  เพิ่มรายการ
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 2. PR */}
        <View style={styles.sectionCard}>
          {renderSectionHeader("BOQ", "cart", "pr", "#10b981")}
          {renderGenericSection("pr", prItems, setPrItems, "งบประมาณ")}
        </View>

        {/* 3. Job */}
        <View style={styles.sectionCard}>
          {renderSectionHeader(
            "แจ้งอัปงาน (Job)",
            "construct",
            "job",
            "#f97316",
          )}
          {renderGenericSection(
            "job",
            jobItems,
            setJobItems,
            "งบโครงการ",
            true,
          )}
        </View>

        {/* 4. BG */}
        <View style={styles.sectionCard}>
          {renderSectionHeader("ค้ำประกัน (LG)", "business", "bg", "#d97706")}
          {renderGenericSection("bg", bgItems, setBgItems, "ยอดค้ำประกัน")}
        </View>

        {/* 5. Stamp */}
        <View style={styles.sectionCard}>
          {renderSectionHeader(
            "ตีตราสาร (e-Stamp)",
            "pricetag",
            "stamp",
            "#ef4444",
          )}
          {renderGenericSection(
            "stamp",
            stampItems,
            setStampItems,
            "ค่าตีตราสาร",
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>บันทึกเพิ่มเติม</Text>
          <TextInput
            style={[styles.input, { height: 80 }]}
            multiline
            value={note}
            onChangeText={setNote}
            placeholder="รายละเอียดอื่นๆ..."
          />
        </View>

        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ยอดสุทธิรวม:</Text>
            <Text style={styles.totalValue}>
              {totalNet.toLocaleString()} บาท
            </Text>
          </View>
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons
                  name="save-outline"
                  size={20}
                  color="#fff"
                  style={{ marginRight: 10 }}
                />
                <Text style={styles.submitBtnText}>บันทึกข้อมูลเข้าระบบ</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* --- Company Modal --- */}
        <Modal visible={companyModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>เลือกบริษัท</Text>
              <FlatList
                data={companyList}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => selectCompany(item)}
                  >
                    <Text style={styles.modalItemText}>{item}</Text>
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 300 }}
              />
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setCompanyModalVisible(false)}
              >
                <Text style={{ color: "#666" }}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* --- Doc Type Modal --- */}
        <Modal visible={docTypeModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { width: "80%" }]}>
              <Text style={styles.modalTitle}>เลือกประเภทเอกสาร</Text>
              {DOC_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={styles.modalItem}
                  onPress={() => selectDocType(type)}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      {
                        textAlign: "center",
                        fontWeight: "bold",
                        color: "#4f46e5",
                      },
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setDocTypeModalVisible(false)}
              >
                <Text style={{ color: "#666" }}>ยกเลิก</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 20 },
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "bold", color: "#1e293b" },
  subtitle: { fontSize: 13, color: "#64748b" },
  card: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  label: { fontSize: 14, fontWeight: "600", color: "#334155", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fff",
    marginBottom: 10,
    fontSize: 14,
  },
  inputBtn: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  sectionCard: {
    backgroundColor: "white",
    borderRadius: 12,
    marginBottom: 15,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "#fff",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#1e293b",
    marginLeft: 10,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionContent: {
    padding: 10,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },

  itemCard: {
    backgroundColor: "white",
    padding: 12,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  itemIndex: { fontSize: 12, fontWeight: "bold", color: "#94a3b8" },
  row: { flexDirection: "row", alignItems: "center" },
  subLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 5,
    marginBottom: 5,
  },
  fileBtn: {
    width: 40,
    height: 40,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    marginLeft: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  hintText: {
    fontSize: 11,
    color: "#10b981",
    textAlign: "right",
    marginBottom: 8,
    fontWeight: "600",
  },

  subSection: {
    backgroundColor: "#f1f5f9",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  docRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },

  typeBox: {
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  typeText: { fontWeight: "bold", fontSize: 12, color: "#4f46e5" },

  smallAddBtn: { marginTop: 5 },
  smallAddText: { fontSize: 12, color: "#4f46e5", fontWeight: "600" },

  addBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    marginTop: 5,
  },
  addBtnText: {
    color: "#64748b",
    fontWeight: "600",
    marginLeft: 5,
    fontSize: 13,
  },

  footer: { marginTop: 10, marginBottom: 30 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    padding: 15,
    backgroundColor: "#e0e7ff",
    borderRadius: 10,
  },
  totalLabel: { fontWeight: "bold", color: "#312e81", fontSize: 15 },
  totalValue: { fontWeight: "bold", color: "#4f46e5", fontSize: 18 },
  submitBtn: {
    backgroundColor: "#4f46e5",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#4f46e5",
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  submitBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 30,
  },
  modalContent: { backgroundColor: "white", borderRadius: 16, padding: 20 },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  modalItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  modalItemText: { fontSize: 16 },
  modalCloseBtn: { marginTop: 15, alignItems: "center", padding: 10 },
});
