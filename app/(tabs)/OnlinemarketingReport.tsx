import { FontAwesome5 } from "@expo/vector-icons";
import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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

const THEME_COLOR = "#6366f1";

// --- Interfaces ---
interface DocRef {
  prefix: string;
  number: string;
}

interface Product {
  name: string;
  qty: string;
  price: string;
  discount: string; // ส่วนลด (ค่าลบ)
  shipping: string; // ค่าส่ง (ค่าบวก)
}

interface Order {
  platform_name: string;
  order_number: string;
  products: Product[];
  status: string;
  proof_uri: string | null;
}

interface Expense {
  name: string;
  amount: string;
  uri: string | null;
  type: string;
  fileName: string;
}

const OnlinemarketingReport = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = ImagePicker.useCameraPermissions();

  // ข้อมูลพื้นฐาน
  const [reportDate, setReportDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [reporterName, setReporterName] = useState(
    user?.fullname || "พนักงานการตลาด",
  );

  // --- 1. Doc Refs (เลขที่เอกสาร) ---
  const [docRefs, setDocRefs] = useState<DocRef[]>([
    { prefix: "AX", number: "" },
  ]);
  const [showPrefixSelector, setShowPrefixSelector] = useState(false);
  const [targetDocIndex, setTargetDocIndex] = useState<number | null>(null);

  const addDocRef = () =>
    setDocRefs([...docRefs, { prefix: "AX", number: "" }]);
  const removeDocRef = (index: number) => {
    const list = [...docRefs];
    list.splice(index, 1);
    setDocRefs(list);
  };
  const updateDocRefNumber = (index: number, value: string) => {
    const list = [...docRefs];
    list[index].number = value;
    setDocRefs(list);
  };

  const handleOpenPrefix = (index: number) => {
    setTargetDocIndex(index);
    setShowPrefixSelector(true);
  };
  const handleSelectPrefix = (prefix: string) => {
    if (targetDocIndex !== null) {
      const list = [...docRefs];
      list[targetDocIndex].prefix = prefix;
      setDocRefs(list);
    }
    setShowPrefixSelector(false);
  };

  // --- 2. Platform Autocomplete ---
  const [platformOptions, setPlatformOptions] = useState<string[]>([]);
  const [showPlatformSuggestions, setShowPlatformSuggestions] = useState<
    number | null
  >(null);

  useEffect(() => {
    const fetchPlatforms = async () => {
      try {
        const res = await axios.get(
          `${API_BASE}/api_mobile.php?action=get_marketing_platforms`,
        );
        if (Array.isArray(res.data)) setPlatformOptions(res.data);
      } catch (error) {
        console.log("Error fetching platforms", error);
      }
    };
    fetchPlatforms();
  }, []);

  // --- 3. Orders (Platforms) ---
  const [orders, setOrders] = useState<Order[]>([
    {
      platform_name: "",
      order_number: "",
      products: [{ name: "", qty: "", price: "", discount: "", shipping: "" }],
      status: "กำลังดำเนินการ",
      proof_uri: null,
    },
  ]);

  // --- 4. Expenses ---
  const [expenses, setExpenses] = useState<Expense[]>([
    { name: "", amount: "", uri: null, type: "image/jpeg", fileName: "" },
  ]);

  // --- 5. Notes ---
  const [problem, setProblem] = useState("");
  const [memo, setMemo] = useState(""); // ใช้แทน Additional Notes

  // ================= Logic: Orders =================
  const addOrder = () => {
    setOrders([
      ...orders,
      {
        platform_name: "",
        order_number: "",
        products: [
          { name: "", qty: "", price: "", discount: "", shipping: "" },
        ],
        status: "กำลังดำเนินการ",
        proof_uri: null,
      },
    ]);
  };

  const removeOrder = (index: number) => {
    const list = [...orders];
    list.splice(index, 1);
    setOrders(list);
  };

  const updateOrder = (index: number, field: keyof Order, value: string) => {
    const list = [...orders];
    (list[index] as any)[field] = value;
    setOrders(list);
  };

  const selectPlatformOption = (index: number, name: string) => {
    updateOrder(index, "platform_name", name);
    setShowPlatformSuggestions(null);
  };

  // ================= Logic: Products =================
  const addProduct = (orderIndex: number) => {
    const list = [...orders];
    list[orderIndex].products.push({
      name: "",
      qty: "",
      price: "",
      discount: "",
      shipping: "",
    });
    setOrders(list);
  };

  const removeProduct = (orderIndex: number, prodIndex: number) => {
    const list = [...orders];
    list[orderIndex].products.splice(prodIndex, 1);
    setOrders(list);
  };

  const updateProduct = (
    orderIndex: number,
    prodIndex: number,
    field: keyof Product,
    value: string,
  ) => {
    const list = [...orders];
    list[orderIndex].products[prodIndex][field] = value;
    setOrders(list);
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
  const updateExpense = (
    index: number,
    field: keyof Expense,
    value: string,
  ) => {
    const list = [...expenses];
    (list[index] as any)[field] = value;
    setExpenses(list);
  };

  // ================= Logic: Image Picker =================
  const selectImageSource = async (
    callback: (result: ImagePicker.ImagePickerResult) => void,
  ) => {
    Alert.alert("เลือกรูปภาพ", "กรุณาเลือกแหล่งที่มาของรูปภาพ", [
      {
        text: "ถ่ายรูป",
        onPress: async () => {
          if (!permission?.granted) {
            const permRes = await requestPermission();
            if (!permRes.granted) return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsEditing: false,
          });
          callback(result);
        },
      },
      {
        text: "เลือกจากอัลบั้ม",
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
          });
          callback(result);
        },
      },
      { text: "ยกเลิก", style: "cancel" },
    ]);
  };

  const pickOrderImage = (index: number) => {
    selectImageSource((result) => {
      if (!result.canceled) {
        const list = [...orders];
        list[index].proof_uri = result.assets[0].uri;
        setOrders(list);
      }
    });
  };

  const pickExpenseImage = (index: number) => {
    selectImageSource((result) => {
      if (!result.canceled) {
        const asset = result.assets[0];
        const list = [...expenses];
        list[index].uri = asset.uri;
        const getFileName = asset.uri.split("/").pop() || `exp_${index}.jpg`;
        list[index].fileName = asset.fileName || getFileName;
        list[index].type = asset.mimeType || "image/jpeg";
        setExpenses(list);
      }
    });
  };

  // ================= Calculations =================
  const calculateOrderTotal = (order: Order) => {
    return order.products.reduce((sum, prod) => {
      const q = parseFloat(prod.qty) || 0;
      const pr = parseFloat(prod.price) || 0;
      const disc = parseFloat(prod.discount) || 0;
      const ship = parseFloat(prod.shipping) || 0;
      // สูตร: (จำนวน * ราคา) - ส่วนลด + ค่าส่ง
      return sum + (q * pr - disc + ship);
    }, 0);
  };

  const calculateTotalSales = () => {
    return orders
      .reduce((sum, order) => sum + calculateOrderTotal(order), 0)
      .toFixed(2);
  };

  const calculateTotalExpense = () => {
    return expenses
      .reduce((acc, item) => acc + (parseFloat(item.amount) || 0), 0)
      .toFixed(2);
  };

  // ================= Submit Logic =================
  const handleSubmit = async () => {
    // 🛑 Validation
    if (orders.some((o) => !o.platform_name.trim())) {
      Alert.alert("ข้อมูลไม่ครบ", 'กรุณาระบุ "ชื่อแพลตฟอร์ม" ให้ครบทุกรายการ');
      return;
    }
    if (orders.some((o) => !o.order_number.trim())) {
      Alert.alert("ข้อมูลไม่ครบ", 'กรุณาระบุ "เลข Order" ให้ครบทุกช่องทาง');
      return;
    }

    // Check Doc Refs
    const validDocs = docRefs.filter((d) => d.number.trim() !== "");
    if (
      docRefs.length > 0 &&
      validDocs.length === 0 &&
      docRefs[0].number.trim() === ""
    ) {
      // อนุญาตให้ว่างได้ถ้ามี 1 แถวเปล่าๆ
    } else if (docRefs.some((d) => d.number.trim() === "")) {
      Alert.alert(
        "ข้อมูลไม่ครบ",
        'กรุณาระบุ "เลขที่เอกสาร" ให้ครบ หรือลบแถวที่ไม่ได้ใช้ออก',
      );
      return;
    }

    setLoading(true);
    const formData = new FormData();

    // Basic Info
    formData.append("report_date", reportDate);
    formData.append("reporter_name", reporterName);
    formData.append("work_type", "company");
    formData.append("problem", problem);
    formData.append("memo", memo); // ใช้ Memo อย่างเดียว ตามที่ขอ (ตัด Additional Notes ออกจาก UI)
    formData.append("total_sales", calculateTotalSales());
    formData.append("total_expense", calculateTotalExpense());

    // 1. Send Doc Refs
    docRefs.forEach((doc, idx) => {
      if (doc.number.trim() !== "") {
        formData.append(`doc_refs[${idx}][prefix]`, doc.prefix);
        formData.append(`doc_refs[${idx}][number]`, doc.number);
      }
    });

    // 2. Send Orders (Platforms)
    orders.forEach((order, idx) => {
      formData.append(`orders[${idx}][platform]`, order.platform_name);
      formData.append(`orders[${idx}][order_no]`, order.order_number);
      formData.append(`orders[${idx}][tax_status]`, order.status);

      // Send Image (Key ต้องเป็น order_files_{index} ตาม PHP)
      if (order.proof_uri) {
        // @ts-ignore
        formData.append(`order_files_${idx}[]`, {
          uri:
            Platform.OS === "android"
              ? order.proof_uri
              : order.proof_uri.replace("file://", ""),
          name: `proof_${idx}.jpg`,
          type: "image/jpeg",
        });
      }

      order.products.forEach((prod, prodIdx) => {
        formData.append(
          `orders[${idx}][products][${prodIdx}][name]`,
          prod.name,
        );
        formData.append(`orders[${idx}][products][${prodIdx}][qty]`, prod.qty);
        formData.append(
          `orders[${idx}][products][${prodIdx}][price]`,
          prod.price,
        );
        // ส่งส่วนลดและค่าส่ง
        formData.append(
          `orders[${idx}][products][${prodIdx}][discount]`,
          prod.discount,
        );
        formData.append(
          `orders[${idx}][products][${prodIdx}][shipping]`,
          prod.shipping,
        );
      });
    });

    // 3. Send Expenses
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
      const response = await axios.post(
        `${API_BASE}/api_mobile.php?action=submit_marketing`,
        formData,
        {
          headers: { Accept: "application/json" }, // ปล่อย Content-Type ให้ Axios จัดการ
        },
      );
      if (response.data.status === "success") {
        Alert.alert("สำเร็จ", "บันทึกรายงานเรียบร้อย", [
          { text: "ตกลง", onPress: () => router.back() },
        ]);
      } else {
        Alert.alert(
          "บันทึกไม่สำเร็จ",
          response.data.message || "เกิดข้อผิดพลาดที่ฝั่ง Server",
        );
      }
    } catch (error) {
      console.log("Upload Error:", error);
      Alert.alert("Error", "การส่งข้อมูลล้มเหลว กรุณาตรวจสอบอินเทอร์เน็ต");
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
        <Text style={styles.headerTitle}>รายงานการตลาด (Online)</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* 1. ข้อมูลทั่วไป */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <FontAwesome5 name="clock" /> ข้อมูลทั่วไป
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

        {/* 2. Orders / Platforms */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <FontAwesome5 name="bullhorn" /> ช่องทางการขาย & ออเดอร์
          </Text>
          {orders.map((order, idx) => (
            <View key={idx} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>ช่องทางที่ {idx + 1}</Text>
                {orders.length > 1 && (
                  <TouchableOpacity onPress={() => removeOrder(idx)}>
                    <FontAwesome5 name="trash" size={16} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, zIndex: 1000 }}>
                  <Text style={styles.label}>
                    แพลตฟอร์ม <Text style={{ color: "red" }}>*</Text>
                  </Text>
                  <View>
                    <TextInput
                      style={styles.input}
                      placeholder="พิมพ์หรือเลือก..."
                      value={order.platform_name}
                      onChangeText={(t) => updateOrder(idx, "platform_name", t)}
                      onFocus={() => setShowPlatformSuggestions(idx)}
                    />
                    <TouchableOpacity
                      style={{ position: "absolute", right: 10, top: 12 }}
                      onPress={() =>
                        setShowPlatformSuggestions(
                          showPlatformSuggestions === idx ? null : idx,
                        )
                      }
                    >
                      <FontAwesome5 name="caret-down" color="#999" size={16} />
                    </TouchableOpacity>
                  </View>
                  {showPlatformSuggestions === idx &&
                    platformOptions.length > 0 && (
                      <View style={styles.suggestionBox}>
                        <ScrollView
                          style={{ maxHeight: 150 }}
                          nestedScrollEnabled={true}
                        >
                          {platformOptions
                            .filter((opt) =>
                              opt
                                .toLowerCase()
                                .includes(order.platform_name.toLowerCase()),
                            )
                            .map((opt, optIdx) => (
                              <TouchableOpacity
                                key={optIdx}
                                style={styles.suggestionItem}
                                onPress={() => selectPlatformOption(idx, opt)}
                              >
                                <Text style={{ color: "#333" }}>{opt}</Text>
                              </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity
                          style={styles.closeSuggestionBtn}
                          onPress={() => setShowPlatformSuggestions(null)}
                        >
                          <Text style={{ fontSize: 10, color: "#666" }}>
                            ปิด
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    เลข Order <Text style={{ color: "red" }}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Order ID..."
                    value={order.order_number}
                    onChangeText={(t) => updateOrder(idx, "order_number", t)}
                  />
                </View>
              </View>

              <View style={styles.divider} />

              {/* Table Header */}
              <View
                style={{
                  flexDirection: "row",
                  marginBottom: 5,
                  paddingHorizontal: 2,
                }}
              >
                <Text style={{ flex: 1.5, fontSize: 11, color: "#666" }}>
                  ชื่อสินค้า
                </Text>
                <Text
                  style={{
                    flex: 0.6,
                    fontSize: 11,
                    color: "#666",
                    textAlign: "center",
                  }}
                >
                  จำนวน
                </Text>
                <Text
                  style={{
                    flex: 0.8,
                    fontSize: 11,
                    color: "#666",
                    textAlign: "center",
                  }}
                >
                  ราคา
                </Text>
                <Text
                  style={{
                    flex: 0.8,
                    fontSize: 11,
                    color: "#ef4444",
                    textAlign: "center",
                  }}
                >
                  ส่วนลด
                </Text>
                <Text
                  style={{
                    flex: 0.8,
                    fontSize: 11,
                    color: "#10b981",
                    textAlign: "center",
                  }}
                >
                  ค่าส่ง
                </Text>
                <View style={{ width: 20 }} />
              </View>

              {order.products.map((prod, prodIdx) => (
                <View key={prodIdx} style={styles.prodRow}>
                  <TextInput
                    style={[styles.inputSmall, { flex: 1.5, marginRight: 5 }]}
                    placeholder="สินค้า"
                    value={prod.name}
                    onChangeText={(t) => updateProduct(idx, prodIdx, "name", t)}
                  />
                  <TextInput
                    style={[
                      styles.inputSmall,
                      { flex: 0.6, textAlign: "center", marginRight: 5 },
                    ]}
                    placeholder="0"
                    keyboardType="numeric"
                    value={prod.qty}
                    onChangeText={(t) => updateProduct(idx, prodIdx, "qty", t)}
                  />
                  <TextInput
                    style={[
                      styles.inputSmall,
                      { flex: 0.8, textAlign: "center", marginRight: 5 },
                    ]}
                    placeholder="0"
                    keyboardType="numeric"
                    value={prod.price}
                    onChangeText={(t) =>
                      updateProduct(idx, prodIdx, "price", t)
                    }
                  />
                  {/* Discount (Red) */}
                  <TextInput
                    style={[
                      styles.inputSmall,
                      {
                        flex: 0.8,
                        textAlign: "center",
                        marginRight: 5,
                        color: "#ef4444",
                      },
                    ]}
                    placeholder="0"
                    keyboardType="numeric"
                    value={prod.discount}
                    onChangeText={(t) =>
                      updateProduct(idx, prodIdx, "discount", t)
                    }
                  />
                  {/* Shipping (Green) */}
                  <TextInput
                    style={[
                      styles.inputSmall,
                      { flex: 0.8, textAlign: "center", color: "#10b981" },
                    ]}
                    placeholder="0"
                    keyboardType="numeric"
                    value={prod.shipping}
                    onChangeText={(t) =>
                      updateProduct(idx, prodIdx, "shipping", t)
                    }
                  />

                  {order.products.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeProduct(idx, prodIdx)}
                      style={{ padding: 5 }}
                    >
                      <FontAwesome5 name="times" size={14} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity
                style={styles.addMiniBtn}
                onPress={() => addProduct(idx)}
              >
                <Text style={styles.addMiniText}>+ เพิ่มสินค้า</Text>
              </TouchableOpacity>

              <View style={styles.subTotalBox}>
                <Text style={styles.subTotalLabel}>รวมยอดร้านนี้:</Text>
                <Text style={styles.subTotalValue}>
                  {calculateOrderTotal(order).toLocaleString()} บ.
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>หลักฐาน/สลิป</Text>
                  <TouchableOpacity
                    style={styles.uploadBtn}
                    onPress={() => pickOrderImage(idx)}
                  >
                    {order.proof_uri ? (
                      <Image
                        source={{ uri: order.proof_uri }}
                        style={{ width: 30, height: 30, borderRadius: 4 }}
                      />
                    ) : (
                      <FontAwesome5 name="camera" color="#666" />
                    )}
                    <Text style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                      {order.proof_uri ? "เปลี่ยน" : "เพิ่มรูป"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1.5 }}>
                  <Text style={styles.label}>
                    สถานะ <Text style={{ color: "red" }}>*</Text>
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}
                  >
                    {["กำลังดำเนินการ", "ส่งแล้ว", "ตีกลับ"].map((st) => (
                      <TouchableOpacity
                        key={st}
                        style={[
                          styles.radio,
                          order.status === st && styles.radioActive,
                        ]}
                        onPress={() => updateOrder(idx, "status", st)}
                      >
                        <Text
                          style={[
                            styles.radioText,
                            order.status === st && { color: "#fff" },
                          ]}
                        >
                          {st}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.addMainBtn} onPress={addOrder}>
            <Text style={styles.addMainText}>+ เพิ่มช่องทางขาย</Text>
          </TouchableOpacity>
          <View style={[styles.totalBox, { backgroundColor: "#e0e7ff" }]}>
            <Text style={[styles.totalText, { color: "#4338ca" }]}>
              ยอดขายรวมทั้งสิ้น: {calculateTotalSales()} บาท
            </Text>
          </View>
        </View>

        {/* 3. Doc Refs (Moved Here) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <FontAwesome5 name="file-invoice" /> เลขที่เอกสาร (AX/PO/SO)
          </Text>
          {docRefs.map((doc, idx) => (
            <View key={idx} style={[styles.row, { marginBottom: 10 }]}>
              <TouchableOpacity
                style={[
                  styles.prefixBtn,
                  doc.prefix === "AX" && {
                    backgroundColor: "#e0e7ff",
                    borderColor: "#4338ca",
                  },
                  doc.prefix === "PO" && {
                    backgroundColor: "#fef3c7",
                    borderColor: "#d97706",
                  },
                  doc.prefix === "SO" && {
                    backgroundColor: "#d1fae5",
                    borderColor: "#059669",
                  },
                ]}
                onPress={() => handleOpenPrefix(idx)}
              >
                <Text
                  style={[
                    styles.prefixText,
                    doc.prefix === "AX" && { color: "#4338ca" },
                    doc.prefix === "PO" && { color: "#d97706" },
                    doc.prefix === "SO" && { color: "#059669" },
                  ]}
                >
                  {doc.prefix} <FontAwesome5 name="caret-down" size={12} />
                </Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="ระบุเลขที่เอกสาร"
                value={doc.number}
                onChangeText={(t) => updateDocRefNumber(idx, t)}
              />
              {docRefs.length > 1 && (
                <TouchableOpacity
                  onPress={() => removeDocRef(idx)}
                  style={styles.deleteBtn}
                >
                  <FontAwesome5 name="trash" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity style={styles.addMiniBtn} onPress={addDocRef}>
            <Text style={styles.addMiniText}>+ เพิ่มเลขที่เอกสาร</Text>
          </TouchableOpacity>
        </View>

        {/* 4. Expenses */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: "#ef4444" }]}>
            <FontAwesome5 name="ad" /> ค่าใช้จ่าย{" "}
          </Text>
          {expenses.map((exp, idx) => (
            <View key={idx} style={styles.expenseRow}>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.input}
                  placeholder="รายการ"
                  value={exp.name}
                  onChangeText={(t) => updateExpense(idx, "name", t)}
                />
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="บาท"
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
                      {exp.uri ? "เปลี่ยน" : "ใบเสร็จ"}
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
              + เพิ่มค่าใช้จ่าย
            </Text>
          </TouchableOpacity>
          <View style={[styles.totalBox, { backgroundColor: "#fee2e2" }]}>
            <Text style={[styles.totalText, { color: "#b91c1c" }]}>
              รวมรายจ่าย: {calculateTotalExpense()} บาท
            </Text>
          </View>
        </View>

        {/* 5. Notes (No Additional Notes, Just Memo) */}
        <View style={styles.section}>
          <Text style={styles.label}>ปัญหาที่พบ</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={2}
            value={problem}
            onChangeText={setProblem}
          />
          <Text style={[styles.label, { marginTop: 10 }]}>บันทึกเพิ่มเติม</Text>
          <TextInput
            style={[styles.textArea, { height: 80 }]}
            multiline
            numberOfLines={3}
            value={memo}
            onChangeText={setMemo}
          />
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View
          style={{
            marginBottom: 10,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontWeight: "bold" }}>กำไรโดยประมาณ:</Text>
          <Text
            style={{
              fontWeight: "bold",
              color:
                parseFloat(calculateTotalSales()) -
                  parseFloat(calculateTotalExpense()) >=
                0
                  ? "#059669"
                  : "#ef4444",
            }}
          >
            {(
              parseFloat(calculateTotalSales()) -
              parseFloat(calculateTotalExpense())
            ).toFixed(2)}{" "}
            บาท
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
              <FontAwesome5 name="paper-plane" color="#fff" size={16} />
              <Text style={styles.submitText}> ส่งรายงาน</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal for Doc Refs */}
      <Modal visible={showPrefixSelector} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPrefixSelector(false)}
        >
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownTitle}>เลือกประเภทเอกสาร</Text>
            {["AX", "PO", "SO"].map((p) => (
              <TouchableOpacity
                key={p}
                style={styles.dropdownItem}
                onPress={() => handleSelectPrefix(p)}
              >
                <Text
                  style={[
                    styles.dropdownText,
                    {
                      fontWeight:
                        targetDocIndex !== null &&
                        docRefs[targetDocIndex]?.prefix === p
                          ? "bold"
                          : "normal",
                    },
                  ]}
                >
                  {p}
                </Text>
                {targetDocIndex !== null &&
                  docRefs[targetDocIndex]?.prefix === p && (
                    <FontAwesome5 name="check" color={THEME_COLOR} />
                  )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
};

// Styles
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
  container: { flex: 1, backgroundColor: "#eef2ff" },
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
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
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
  inputSmall: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    color: "#333",
    marginBottom: 0,
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
  prefixBtn: {
    width: 70,
    height: 48,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#f8f8f8",
    marginBottom: 0,
  },
  prefixText: { fontWeight: "bold", fontSize: 14, color: "#555" },
  deleteBtn: { padding: 10, justifyContent: "center" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  dropdownModal: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    elevation: 5,
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
    color: "#333",
  },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  dropdownText: { fontSize: 16, color: "#333" },
  suggestionBox: {
    position: "absolute",
    top: 75,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    zIndex: 2000,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  closeSuggestionBtn: {
    alignItems: "center",
    padding: 5,
    backgroundColor: "#f9fafb",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
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
  subHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
  },
  prodRow: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    marginBottom: 8,
  },
  subTotalBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f0fdf4",
    padding: 10,
    borderRadius: 8,
    marginTop: 5,
  },
  subTotalLabel: { color: "#166534", fontWeight: "bold", fontSize: 13 },
  subTotalValue: { color: "#166534", fontWeight: "bold", fontSize: 14 },
  addMiniBtn: { alignSelf: "center", padding: 8, marginBottom: 10 },
  addMiniText: { color: THEME_COLOR, fontWeight: "600", fontSize: 13 },
  addMainBtn: {
    backgroundColor: "#312e81",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  addMainText: { color: "#fff", fontWeight: "bold" },
  radioGroup: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
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
  expenseRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderColor: "#f3f4f6",
    paddingBottom: 10,
    marginBottom: 10,
  },
  uploadBtn: {
    width: 60,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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

export default OnlinemarketingReport;
