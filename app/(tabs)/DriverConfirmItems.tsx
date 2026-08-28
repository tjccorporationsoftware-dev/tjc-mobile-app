import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  Building,
  Calendar,
  Camera,
  CheckCircle,
  ChevronLeft,
  MapPin,
  Package,
  Phone,
  User,
  Wrench,
  XCircle,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
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
  View,
} from "react-native";
import { API_BASE, IMG_BASE_URL } from "../../constants/config";

export default function DriverConfirmItems() {
  const { do_no } = useLocalSearchParams();
  const [items, setItems] = useState<any[]>([]);
  const router = useRouter();

  const [itemStates, setItemStates] = useState<Record<string, any>>({});
  const [projectSuccessImages, setProjectSuccessImages] = useState<Record<string, string[]>>({});
  const [projectDmgImages, setProjectDmgImages] = useState<Record<string, string[]>>({});
  const [projectWorkImages, setProjectWorkImages] = useState<Record<string, string[]>>({});
  const [projectWorkNotes, setProjectWorkNotes] = useState<Record<string, string>>({});

  // 🌟 เพิ่ม State ควบคุมการเปิด-ปิด โหมดแก้ไข ของแต่ละหน้างาน
  const [editingProjects, setEditingProjects] = useState<Record<string, boolean>>({});

  // State for image viewer
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  // ฟังก์ชันสำหรับดึงข้อมูล (แยกออกมาเพื่อให้เรียกใช้ใหม่ได้ตอนบันทึกเสร็จ)
  const fetchDeliveryDetail = () => {
    return fetch(`${API_BASE}/api_mobile.php?action=get_delivery_detail&do_no=${do_no}`)
      .then((res) => res.json())
      .then((json) => {
        const fetchedItems = json.data || [];
        setItems(fetchedItems);

        const initialStates: Record<string, any> = {};

        // 🌟 1. เตรียมตัวแปรเพื่อเก็บรูปภาพเดิมแยกตามโปรเจกต์
        const sImgs: Record<string, string[]> = {};
        const dImgs: Record<string, string[]> = {};
        const wImgs: Record<string, string[]> = {};
        const wNotes: Record<string, string> = {};

        fetchedItems.forEach((item: any) => {
          const pId = item.project_id || item.project_name || "ไม่ระบุโครงการ";

          // 🌟 โหลดรูปภาพเดิมเข้า State (ดึงแค่จากไอเทมแรกก็พอเพราะเซฟเหมือนกันทั้งโปรเจกต์)
          if (!sImgs[pId] && item.proof_image && item.proof_image !== "null") {
            sImgs[pId] = item.proof_image.split(',').filter(Boolean).map((img: string) => getImageUri(img));
          }
          if (!dImgs[pId] && item.damaged_image && item.damaged_image !== "null") {
            dImgs[pId] = item.damaged_image.split(',').filter(Boolean).map((img: string) => getImageUri(img));
          }
          if (!wImgs[pId] && item.work_image && item.work_image !== "null") {
            wImgs[pId] = item.work_image.split(',').filter(Boolean).map((img: string) => getImageUri(img));
          }
          // โหลดหมายเหตุงานเพิ่มเติมเข้า State
          if (!wNotes[pId] && item.work_note) {
            wNotes[pId] = item.work_note;
          }

          // 🌟 แกะข้อมูลเดิมมาใส่คืน
          let rType = "warehouse";
          let rShop = "";
          let cleanNote = item.driver_note || "";

          if (item.delivery_status === 'ส่งซ่อมร้านนอก') {
            rType = "repair";
            const match = cleanNote.match(/\[ส่งซ่อม:\s*(.*?)\]/);
            if (match) {
              rShop = match[1];
              cleanNote = cleanNote.replace(/\[ส่งซ่อม:\s*.*?\]\s*/, '');
            }
          } else if (cleanNote.startsWith('[ส่งกลับคลัง]')) {
            cleanNote = cleanNote.replace(/\[ส่งกลับคลัง\]\s*/, '');
          }

          // ดึงชื่อคนแก้ไขตรงๆ จากฐานข้อมูลเลย
          let editedByStr = item.edited_by || "";

          const isSaved = item.delivery_status && item.delivery_status !== "กำลังจัดส่ง";
          let aQty = "";
          let dQty = "";

          if (isSaved) {
            if (item.actual_qty !== null && item.actual_qty !== undefined) {
              const pA = parseFloat(item.actual_qty);
              if (!isNaN(pA)) aQty = pA.toString();
            }
            if (item.damaged_qty !== null && item.damaged_qty !== undefined) {
              const pD = parseFloat(item.damaged_qty);
              if (!isNaN(pD)) dQty = pD.toString();
            }
          }

          initialStates[item.id] = {
            actualQty: aQty,
            damagedQty: dQty,
            returnType: rType,
            repairShop: rShop,
            note: cleanNote.trim(),
            editedBy: editedByStr,
          };
        });

        setItemStates(initialStates);

        // 🌟 2. เซ็ตค่ารูปภาพและงานเพิ่มเติมลง State หลัก
        setProjectSuccessImages(sImgs);
        setProjectDmgImages(dImgs);
        setProjectWorkImages(wImgs);
        setProjectWorkNotes(wNotes);
      })
      .catch((err) => {
        Alert.alert("ข้อผิดพลาด", "ไม่สามารถโหลดข้อมูลได้");
        console.error(err);
      });
  };

  useEffect(() => {
    if (do_no) {
      fetchDeliveryDetail();
    }
  }, [do_no]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDeliveryDetail()?.finally(() => setRefreshing(false));
  };

  const getDamagedQty = (id: string, maxQty: number) => {
    const state = itemStates[id];
    if (state?.damagedQty !== undefined && state?.damagedQty !== "") {
      const dmg = parseFloat(state.damagedQty) || 0;
      return dmg > 0 ? dmg : 0;
    }
    if (state?.actualQty === "" || state?.actualQty === undefined) return 0;
    const actual = parseFloat(state.actualQty) || 0;
    const damaged = maxQty - actual;
    return damaged > 0 ? damaged : 0;
  };

  const handleItemChange = (id: string, field: string, value: string) => {
    setItemStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const pickImage = (type: "success" | "dmg" | "work", projectId: string) => {
    Alert.alert("เลือกรูปภาพ", "คุณต้องการอัปโหลดรูปภาพด้วยวิธีใด?", [
      {
        text: "📷 ถ่ายรูปใหม่",
        onPress: async () => {
          const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
          if (!cameraStatus.granted) {
            Alert.alert("แจ้งเตือน", "กรุณาอนุญาตให้แอปเข้าถึงกล้องครับ");
            return;
          }

          let result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
          if (!result.canceled) {
            const uri = result.assets[0].uri;
            if (type === "success") setProjectSuccessImages((prev) => ({ ...prev, [projectId]: [...(prev[projectId] || []), uri] }));
            if (type === "dmg") setProjectDmgImages((prev) => ({ ...prev, [projectId]: [...(prev[projectId] || []), uri] }));
            if (type === "work") setProjectWorkImages((prev) => ({ ...prev, [projectId]: [...(prev[projectId] || []), uri] }));
          }
        },
      },
      {
        text: "🖼️ เลือกจากคลังรูปภาพ",
        onPress: async () => {
          const galleryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!galleryStatus.granted) {
            Alert.alert("แจ้งเตือน", "กรุณาอนุญาตให้แอปเข้าถึงคลังรูปภาพครับ");
            return;
          }

          let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.5,
            allowsMultipleSelection: true,
          });

          if (!result.canceled) {
            const selectedUris = result.assets.map((asset) => asset.uri);
            if (type === "success") setProjectSuccessImages((prev) => ({ ...prev, [projectId]: [...(prev[projectId] || []), ...selectedUris] }));
            if (type === "dmg") setProjectDmgImages((prev) => ({ ...prev, [projectId]: [...(prev[projectId] || []), ...selectedUris] }));
            if (type === "work") setProjectWorkImages((prev) => ({ ...prev, [projectId]: [...(prev[projectId] || []), ...selectedUris] }));
          }
        },
      },
      { text: "ยกเลิก", style: "cancel" },
    ]);
  };

  const removeImage = (type: "success" | "dmg" | "work", index: number, projectId: string) => {
    if (type === "success") setProjectSuccessImages((prev) => ({ ...prev, [projectId]: prev[projectId].filter((_, i) => i !== index) }));
    if (type === "dmg") setProjectDmgImages((prev) => ({ ...prev, [projectId]: prev[projectId].filter((_, i) => i !== index) }));
    if (type === "work") setProjectWorkImages((prev) => ({ ...prev, [projectId]: prev[projectId].filter((_, i) => i !== index) }));
  };

  const handleSave = (projectId: string, projectItems: any[]) => {
    let hasError = false;
    let errorMessage = "";

    const itemsData = projectItems.map((item) => {
      const state = itemStates[item.id];
      const max = parseFloat(item.delivery_qty);
      let actual = parseFloat(state.actualQty);

      if (isNaN(actual) || actual < 0) {
        hasError = true;
        errorMessage = "กรุณาระบุยอดรับจริงให้ถูกต้องทุกรายการ!";
      }
      if (actual > max) actual = max;

      const dmg = max - actual;

      if (dmg > 0 && state.returnType === "repair" && state.repairShop.trim() === "") {
        hasError = true;
        errorMessage = "มีรายการส่งซ่อมร้านนอก กรุณาระบุชื่อร้านซ่อมด้วยครับ!";
      }

      return {
        log_id: item.real_log_id,
        max_qty: max,
        actual_qty: actual,
        damaged_qty: dmg,
        note: state.note,
        return_type: state.returnType,
        repair_shop: state.repairShop,
      };
    });

    if (hasError) {
      Alert.alert("ข้อมูลไม่ครบถ้วน", errorMessage);
      return;
    }

    const currentDmgImages = projectDmgImages[projectId] || [];
    const currentSuccessImages = projectSuccessImages[projectId] || [];
    const currentWorkImages = projectWorkImages[projectId] || [];
    const currentWorkNote = projectWorkNotes[projectId] || "";

    const projectTotalDamaged = projectItems.reduce((sum, item) => sum + getDamagedQty(item.id, parseFloat(item.delivery_qty)), 0);

    if (projectTotalDamaged > 0 && currentDmgImages.length === 0) {
      Alert.alert("แจ้งเตือน", "มีรายการตีกลับ/ส่งซ่อม กรุณาแนบรูปรวมสินค้าที่มีปัญหาด้วยครับ!");
      return;
    }

    Alert.alert(
      "ยืนยันการบันทึก",
      "คุณต้องการบันทึกข้อมูลหน้างานนี้ใช่หรือไม่?",
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "บันทึกเลย",
          style: "default",
          onPress: async () => {
            try {
              const formData = new FormData();
              formData.append("items_data", JSON.stringify(itemsData));
              formData.append("work_note", currentWorkNote);
              formData.append("custom_time", "");

              // 🌟 แยกรูปเก่า (ที่โหลดมาจาก DB) กับรูปใหม่ (ที่เพิ่งถ่าย/เลือก)
              const keptSuccess = currentSuccessImages.filter(uri => uri.startsWith('http'));
              const newSuccess = currentSuccessImages.filter(uri => !uri.startsWith('http'));

              const keptDmg = currentDmgImages.filter(uri => uri.startsWith('http'));
              const newDmg = currentDmgImages.filter(uri => !uri.startsWith('http'));

              const keptWork = currentWorkImages.filter(uri => uri.startsWith('http'));
              const newWork = currentWorkImages.filter(uri => !uri.startsWith('http'));

              // ส่ง "รูปเก่าที่ยังไม่ถูกลบ" กลับไปบอก API 
              formData.append("kept_proof_images", JSON.stringify(keptSuccess));
              formData.append("kept_damaged_images", JSON.stringify(keptDmg));
              formData.append("kept_work_images", JSON.stringify(keptWork));

              // 🌟 ดึงข้อมูล User เพื่อส่งไปบอก API ว่าใครเป็นคนบันทึก/แก้ไข
              let currentFullName = "";
              let currentRole = "staff";

              try {
                const AsyncStorage = require('@react-native-async-storage/async-storage').default;

                // 🛑 ดักจับ Key หลายๆ แบบ เผื่อตอน Login ตั้งชื่อตัวแปรไว้ต่างกัน
                let userJson = await AsyncStorage.getItem("user");
                if (!userJson) userJson = await AsyncStorage.getItem("user_data");
                if (!userJson) userJson = await AsyncStorage.getItem("userInfo");

                if (userJson) {
                  const userObj = JSON.parse(userJson);
                  currentRole = userObj.role || "staff";
                  currentFullName = userObj.fullname || userObj.name || userObj.username || "";
                }
              } catch (e) {
                console.log("Error loading user data from AsyncStorage:", e);
              }

              // 🚨 เช็คด่านสุดท้าย: ถ้าหาชื่อไม่เจอจริงๆ อย่าเพิ่งยิง API ให้แจ้งเตือนให้รู้ตัวก่อน
              if (!currentFullName || currentFullName.trim() === "") {
                Alert.alert(
                  "ไม่พบข้อมูลผู้ใช้",
                  "แอปไม่สามารถระบุตัวตนของคุณได้ กรุณาล็อกเอาท์แล้วล็อกอินเข้าแอปใหม่อีกครั้งครับ"
                );
                return; // หยุดการทำงาน ไม่ยิงไปหา API
              }

              formData.append("role", currentRole);
              formData.append("fullname", currentFullName);

              const appendImages = (images: string[], fieldName: string) => {
                images.forEach((uri, index) => {
                  const ext = uri.split(".").pop() || "jpg";
                  formData.append(fieldName, {
                    uri: uri,
                    name: `img_${Date.now()}_${index}.${ext}`,
                    type: `image/${ext === "jpg" ? "jpeg" : ext}`,
                  } as any);
                });
              };

              // 🌟 3. อัปโหลดเฉพาะ "รูปใหม่" ส่งไปเป็นไฟล์จริงๆ
              appendImages(newSuccess, "proof_image[]");
              appendImages(newDmg, "damaged_image_group[]");
              appendImages(newWork, "work_image_group[]");

              const response = await fetch(`${API_BASE}/api_mobile.php?action=update_project_items`, {
                method: "POST",
                body: formData,
                headers: { Accept: "application/json" },
              });

              const textResult = await response.text();
              let result;
              try {
                result = JSON.parse(textResult);
              } catch (parseError) {
                Alert.alert("เซิร์ฟเวอร์ส่งข้อมูลผิดพลาด", "กรุณาดูข้อความใน Terminal");
                return;
              }

              if (result.status === "success") {
                Alert.alert("สำเร็จ!", "บันทึกข้อมูลหน้างานเรียบร้อยแล้ว", [
                  {
                    text: "ตกลง",
                    onPress: () => {
                      // ปิดโหมดแก้ไข
                      setEditingProjects(prev => ({ ...prev, [projectId]: false }));

                      // เคลียร์ค่าที่เลือกไว้เฉพาะโปรเจคนี้ เพื่อเตรียมอัปเดตหน้าจอ
                      setProjectSuccessImages(prev => ({ ...prev, [projectId]: [] }));
                      setProjectDmgImages(prev => ({ ...prev, [projectId]: [] }));
                      setProjectWorkImages(prev => ({ ...prev, [projectId]: [] }));
                      setProjectWorkNotes(prev => ({ ...prev, [projectId]: "" }));

                      // ดึงข้อมูลใหม่เพื่อรีเฟรชหน้าจอทันที
                      fetchDeliveryDetail();
                    }
                  },
                ]);
              } else {
                Alert.alert("เกิดข้อผิดพลาด", result.message || "บันทึกไม่สำเร็จ");
              }
            } catch (error) {
              Alert.alert("ข้อผิดพลาดทางเครือข่าย", "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
            }
          },
        },
      ]
    );
  };

  const formatThaiDate = (dateStr: string, deliveredAtStr?: string) => {
    if (!dateStr || dateStr === "-" || dateStr.startsWith("0000-00-00")) return "ไม่ระบุ";
    try {
      const datePart = dateStr.split(" ")[0];
      let timePart = dateStr.split(" ")[1] || "";

      if ((!timePart || timePart === "00:00:00") && deliveredAtStr && !deliveredAtStr.startsWith("0000-00-00")) {
        const deliveredTime = deliveredAtStr.split(" ")[1];
        if (deliveredTime) {
          timePart = deliveredTime;
        }
      }

      if (!timePart || timePart === "00:00:00") {
        const now = new Date();
        timePart = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
      }

      const parts = datePart.split("-");
      if (parts.length === 3) {
        let year = parseInt(parts[0], 10);
        if (year < 2500) year += 543;
        return `${parts[2]}/${parts[1]}/${year} เวลา ${timePart} น.`;
      }
    } catch (e) { }
    return dateStr;
  };

  const displayDoNo = typeof do_no === "string" ? (do_no.split("-")[1] || do_no) : do_no;

  // ฟังก์ชันจัดฟอร์แมต Path ของรูป ป้องกันภาพขาวโพลนและเครื่องหมายแปลกปลอม
  const getImageUri = (filename: string) => {
    if (!filename) return "";

    // ถ้าเป็น URL เต็มอยู่แล้ว หรือเป็นรูปจากเครื่อง (ถ่ายใหม่)
    if (filename.startsWith("http") || filename.startsWith("file://") || filename.startsWith("data:")) {
      return filename;
    }

    // ล้างอักขระแปลกปลอม (เผื่อมี Quote ["] ติดมาตอนเซฟลง DB)
    let cleanFilename = filename.replace(/['"]/g, '').trim();

    // ลบ /uploads/ หรือ uploads/ ออกก่อนเพื่อป้องกันการเบิ้ลโฟลเดอร์
    cleanFilename = cleanFilename.replace(/^\/?(uploads\/)+/, "");

    // ตรวจสอบว่า IMG_BASE_URL มี / ลงท้ายไหม
    const base = IMG_BASE_URL.endsWith('/') ? IMG_BASE_URL.slice(0, -1) : IMG_BASE_URL;

    // หากฝั่ง Pii Cake / Toey เก็บรูปไว้โฟลเดอร์อื่น ให้แก้คำว่า /uploads/ ตรงนี้ครับ
    return `${base}/uploads/${cleanFilename}`;
  };

  const renderClearedImages = (imgField: string | null, title: string, borderColor: string) => {
    if (!imgField || imgField === "null" || imgField === "" || imgField === "[]") return null;

    let imgArray: string[] = [];
    try {
      if (imgField.startsWith("[")) {
        imgArray = JSON.parse(imgField);
      } else {
        imgArray = imgField.split(",").map((s) => s.trim()).filter(Boolean);
      }
    } catch {
      imgArray = [imgField];
    }

    if (!Array.isArray(imgArray) || imgArray.length === 0) return null;

    return (
      <View style={{ marginTop: 16, width: "100%" }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#334155", marginBottom: 8 }}>{title}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {imgArray.map((filename: string, idx: number) => {
            if (!filename) return null;
            const uri = getImageUri(filename);

            return (
              <TouchableOpacity
                key={idx}
                onPress={() => setSelectedImage(uri)}
                activeOpacity={0.7}
                style={{ zIndex: 10 }} // บังคับให้อยู่บนสุดเพื่อไม่ให้โดน View อื่นบังการกด
              >
                <Image
                  source={{ uri }}
                  style={{ width: 90, height: 90, borderRadius: 8, borderWidth: 2, borderColor, backgroundColor: '#e2e8f0' }}
                  resizeMode="cover"
                />

                {/* 💡 DEBUG TIP: หากรูปยังขาวโพลน ให้เอาคอมเมนต์บรรทัดล่างนี้ออก 
                    เพื่อดูว่า URL ที่แอปพยายามโหลดคืออะไร จะได้ไปแก้พาทที่ฝั่ง API ได้ถูกครับ */}
                {/* <Text style={{ fontSize: 9, width: 90, color: 'red', marginTop: 4 }} numberOfLines={4}>{uri}</Text> */}

              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const groupedProjects = items.reduce((acc, item) => {
    const key = item.project_id || item.project_name || "ไม่ระบุโครงการ";
    if (!acc[key]) {
      acc[key] = {
        project_id: item.project_id,
        project_name: item.project_name,
        customer_name: item.customer_name,
        contact_person: item.contact_person,
        delivery_date: item.delivery_date,
        delivered_at: item.delivered_at,
        p_phone: item.p_phone,
        contact_phone: item.contact_phone,
        phone_number: item.phone_number,
        p_address: item.p_address,
        items: []
      };
    }
    acc[key].items.push(item);
    return acc;
  }, {} as Record<string, any>);

  const projects = Object.values(groupedProjects);

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 110 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#2563eb"]} />
            }
          >
            {/* Header Gradient */}
            <LinearGradient
              colors={["#0047AB", "#1e88e5"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerGradient}
            >
              <View style={{ marginBottom: 15, width: "100%", alignItems: "flex-start" }}>
                <TouchableOpacity
                  onPress={() => router.push("/DriverTasks")}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "rgba(255, 255, 255, 0.25)",
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderRadius: 30,
                    borderWidth: 1,
                    borderColor: "rgba(255, 255, 255, 0.4)",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                  }}
                  activeOpacity={0.8}
                >
                  <ChevronLeft size={20} color="#ffffff" style={{ marginLeft: -4, marginRight: 6 }} />
                  <Text style={{ color: "#ffffff", fontSize: 15, fontWeight: "bold" }}>ย้อนกลับไปหน้าใบงาน</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.headerTitle, { marginBottom: 8 }]}>รายละเอียดการจัดส่ง</Text>
              <View style={styles.doNoBadge}>
                <Text style={styles.doNoText}>ใบงาน: {displayDoNo}</Text>
              </View>
            </LinearGradient>

            {projects.map((project: any, pIndex: number) => {
              // 🟢 1. จัดการแยกรวมเบอร์โทรทั้งหมด (แก้ไข: หั่นเบอร์ก่อน แล้วค่อยต่อด้วยชื่อ)
              const phoneList: { label: string, name: string, phone: string }[] = [];
              const addPhones = (label: string, nameStr: string | null | undefined, phoneStr: string | null | undefined) => {
                if (!phoneStr || phoneStr === "-" || phoneStr === "ไม่ระบุ") return;

                // แยกเบอร์ด้วย , / หรือ |
                const parts = String(phoneStr).split(/[,/|]/).map(p => p.trim()).filter(p => p.length >= 8);
                parts.forEach(p => {
                  phoneList.push({
                    label: label,
                    name: nameStr && nameStr !== "-" && nameStr !== "ไม่ระบุ" ? nameStr : "",
                    phone: p
                  });
                });
              };

              addPhones("ผู้ติดต่อ", project.contact_person, project.contact_phone);
              addPhones("เบอร์หน้างาน", null, project.p_phone);
              addPhones("เบอร์ลูกค้า", project.customer_name, project.phone_number);

              // กรองเบอร์ที่ซ้ำกันออก (เช็คจากตัวเลขเท่านั้น)
              const uniquePhones: { label: string, name: string, phone: string }[] = [];
              const seenPhones = new Set();
              phoneList.forEach(item => {
                const numOnly = item.phone.replace(/[^0-9]/g, "");
                if (numOnly.length >= 8 && !seenPhones.has(numOnly)) {
                  seenPhones.add(numOnly);
                  uniquePhones.push(item);
                }
              });

              // 🟢 2. ตัวแปรรายหน้างาน
              const projectId = project.project_id || project.project_name || "ไม่ระบุโครงการ";
              const isProjectCleared = project.items.some((item: any) => item.delivery_status && item.delivery_status !== "กำลังจัดส่ง");
              const pSuccessImgs = projectSuccessImages[projectId] || [];
              const pDmgImgs = projectDmgImages[projectId] || [];
              const pWorkImgs = projectWorkImages[projectId] || [];
              const pWorkNote = projectWorkNotes[projectId] || "";
              const pTotalDmg = project.items.reduce((sum: number, item: any) => sum + getDamagedQty(item.id, parseFloat(item.delivery_qty)), 0);

              return (
                <View key={pIndex} style={[styles.projectCard, pIndex === 0 && styles.projectCardFirst]}>
                  {/* ข้อมูลหน้างาน */}
                  <View style={styles.projectInfoSection}>
                    <View style={styles.infoRow}>
                      <View style={[styles.iconWrap, { backgroundColor: "#eff6ff" }]}>
                        <Building size={18} color="#2563eb" />
                      </View>
                      <Text style={styles.infoTextBold}>
                        {project.project_name || "กำลังโหลด..."}
                      </Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.infoRow}>
                      <View style={[styles.iconWrap, { backgroundColor: "#f0fdf4" }]}>
                        <User size={18} color="#16a34a" />
                      </View>
                      <Text style={styles.infoText}>
                        {project.customer_name || "ไม่ระบุลูกค้า"}
                      </Text>
                    </View>

                    <View style={styles.divider} />

                    {project.delivery_date && project.delivery_date !== "-" && (
                      <View style={styles.infoRow}>
                        <View style={[styles.iconWrap, { backgroundColor: "#f3e8ff" }]}>
                          <Calendar size={18} color="#9333ea" />
                        </View>
                        <Text style={styles.infoTextBold}>
                          วันที่จัดส่ง: {formatThaiDate(project.delivery_date, project.delivered_at)}
                        </Text>
                      </View>
                    )}

                    {/* 🟢 3. ส่วนช่องทางติดต่อที่แยกเบอร์ชัดเจนเป็นปุ่มใหญ่ๆ เรียงลงมา */}
                    {uniquePhones.length > 0 && (
                      <View style={{ marginTop: 12, backgroundColor: "#f8fafc", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0" }}>
                        <Text style={{ fontSize: 13, fontWeight: "800", color: "#64748b", marginBottom: 10 }}>
                          📞 โทรติดต่อ (แตะเพื่อโทร):
                        </Text>
                        <View style={{ gap: 8 }}>
                          {uniquePhones.map((contact, idx) => {
                            const cleanPhone = contact.phone.replace(/[^0-9]/g, "");
                            return (
                              <TouchableOpacity
                                key={idx}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  backgroundColor: "#ffffff",
                                  paddingVertical: 10,
                                  paddingHorizontal: 12,
                                  borderRadius: 10,
                                  borderWidth: 1,
                                  borderColor: "#cbd5e1",
                                  elevation: 1,
                                  shadowColor: "#000",
                                  shadowOffset: { width: 0, height: 1 },
                                  shadowOpacity: 0.05,
                                  shadowRadius: 2,
                                }}
                                onPress={() => Linking.openURL(`tel:${cleanPhone}`)}
                              >
                                <View style={{ backgroundColor: "#2563eb", padding: 8, borderRadius: 8, marginRight: 10 }}>
                                  <Phone size={16} color="#ffffff" />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b", marginBottom: 2 }}>
                                    {contact.label} {contact.name ? `(${contact.name})` : ""}
                                  </Text>
                                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#1e3a8a" }}>
                                    {contact.phone}
                                  </Text>
                                </View>
                                <View style={{ backgroundColor: "#dbeafe", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }}>
                                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#2563eb" }}>โทรออก</Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* ที่อยู่หน้างาน */}
                    <View style={[styles.infoRow, { alignItems: "flex-start", marginTop: 12 }]}>
                      <View style={[styles.iconWrap, { backgroundColor: "#fef2f2" }]}>
                        <MapPin size={18} color="#dc2626" />
                      </View>
                      <Text style={[styles.infoText, { flex: 1, lineHeight: 22 }]} numberOfLines={3}>
                        {project.p_address || "ไม่ระบุที่อยู่"}
                      </Text>
                    </View>
                  </View>

                  {/* รายการสินค้าในหน้างาน */}
                  {isProjectCleared && !editingProjects[projectId] ? (
                    <View style={[styles.projectItemsSection, { backgroundColor: "#ecfdf5", alignItems: "center", paddingVertical: 32 }]}>
                      <CheckCircle size={48} color="#10b981" style={{ marginBottom: 12 }} />
                      <Text style={{ fontSize: 20, fontWeight: "800", color: "#065f46", marginBottom: 12 }}>ส่งหน้างานเรียบร้อยแล้ว</Text>

                      <View style={{ backgroundColor: "white", padding: 16, borderRadius: 12, width: "100%", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: "#1e293b", marginBottom: 8, textAlign: "center" }}>สรุปรายการสินค้า</Text>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={{ fontSize: 15, color: "#475569" }}>ส่งสำเร็จ:</Text>
                          <Text style={{ fontSize: 16, fontWeight: "800", color: "#059669" }}>
                            {project.items.reduce((sum: number, item: any) => sum + (parseFloat(item.actual_qty) || 0), 0)} รายการ
                          </Text>
                        </View>
                        {project.items.reduce((sum: number, item: any) => sum + (parseFloat(item.damaged_qty) || 0), 0) > 0 && (
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#f1f5f9" }}>
                            <Text style={{ fontSize: 15, color: "#475569" }}>ตีกลับ/มีปัญหา:</Text>
                            <Text style={{ fontSize: 16, fontWeight: "800", color: "#dc2626" }}>
                              {project.items.reduce((sum: number, item: any) => sum + (parseFloat(item.damaged_qty) || 0), 0)} รายการ
                            </Text>
                          </View>
                        )}

                        {/* Notes Section */}
                        {(project.items.some((it: any) => it.note || it.repair_shop || itemStates[it.id]?.editedBy) || project.items[0]?.work_note) && (
                          <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#f1f5f9" }}>
                            <Text style={{ fontSize: 15, fontWeight: "700", color: "#1e293b", marginBottom: 8 }}>หมายเหตุ & ข้อมูลเพิ่มเติม</Text>
                            {project.items.map((it: any, idx: number) => {
                              // 🌟 ดึงชื่อคนแก้ไขมาจาก State ที่เราสกัดไว้
                              const editedBy = itemStates[it.id]?.editedBy;

                              // เช็คว่าถ้าไม่มีอะไรเลยให้ข้าม แต่ถ้ามีชื่อคนแก้ให้แสดงด้วย
                              if (!it.note && !it.repair_shop && !editedBy) return null;

                              return (
                                <View key={idx} style={{ marginBottom: 6 }}>
                                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#475569" }}>- {it.main_item_name}:</Text>
                                  {it.note ? <Text style={{ fontSize: 14, color: "#64748b", marginLeft: 12 }}>หมายเหตุ: {it.note}</Text> : null}
                                  {it.repair_shop ? <Text style={{ fontSize: 14, color: "#8b5cf6", marginLeft: 12 }}>ส่งซ่อมร้าน: {it.repair_shop}</Text> : null}

                                  {/* 🌟 แสดงป้ายกำกับว่าใครเป็นคนเข้ามาแก้ไข */}
                                  {editedBy ? (
                                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#8b5cf6", marginLeft: 12, marginTop: 4 }}>
                                      <Wrench size={12} color="#8b5cf6" /> แก้ไขล่าสุดโดย: {editedBy}
                                    </Text>
                                  ) : null}
                                </View>
                              );
                            })}
                            {project.items[0]?.work_note ? (
                              <View style={{ marginTop: 8 }}>
                                <Text style={{ fontSize: 14, fontWeight: "700", color: "#1e40af" }}>งานเพิ่มเติม:</Text>
                                <Text style={{ fontSize: 14, color: "#64748b", marginLeft: 12 }}>{project.items[0].work_note}</Text>
                              </View>
                            ) : null}
                          </View>
                        )}

                        {/* Images Section */}
                        {renderClearedImages(project.items[0]?.proof_image, "✅ รูปรวมสำเร็จ", "#a7f3d0")}
                        {renderClearedImages(project.items[0]?.damaged_image, "⚠️ รูปรวมปัญหา", "#fca5a5")}
                        {renderClearedImages(project.items[0]?.work_image, "📸 รูปงานเพิ่มเติม", "#93c5fd")}
                      </View>

                      {/* 🌟 ปุ่มกดเข้าโหมดแก้ไข */}
                      <TouchableOpacity
                        style={{ marginTop: 16, backgroundColor: '#fffbeb', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, width: '100%' }}
                        onPress={() => setEditingProjects(prev => ({ ...prev, [projectId]: true }))}
                      >
                        <Wrench size={20} color="#d97706" />
                        <Text style={{ color: '#d97706', fontWeight: '700', fontSize: 16 }}>แก้ไขข้อมูลการจัดส่ง</Text>
                      </TouchableOpacity>

                    </View>
                  ) : (
                    <View style={styles.projectItemsSection}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                          <Package size={20} color="#0f172a" /> รายการสินค้าในหน้างานนี้
                        </Text>

                        {/* 🌟 ปุ่มยกเลิกการแก้ไข (โชว์เฉพาะตอนเปิดแก้) */}
                        {isProjectCleared && (
                          <TouchableOpacity onPress={() => setEditingProjects(prev => ({ ...prev, [projectId]: false }))}>
                            <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 14, textDecorationLine: 'underline' }}>ยกเลิกแก้ไข</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {project.items.map((item: any, index: number) => {
                        const isSub = !!item.sub_item_id;
                        const state = itemStates[item.id];
                        if (!state) return null;

                        const maxQty = parseFloat(item.delivery_qty);
                        const dmgQty = getDamagedQty(item.id, maxQty);

                        return (
                          <View
                            key={item.id}
                            style={[
                              styles.itemCard,
                              isSub && styles.subItemCard,
                            ]}
                          >
                            {isSub && <View style={styles.subItemLine} />}

                            <View style={styles.itemHeader}>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.itemName, isSub && styles.subItemName]}>
                                  {isSub ? item.sub_item_name : item.main_item_name}
                                </Text>
                                {!isSub && item.model_name && (
                                  <Text style={styles.itemModel}>รุ่น: {item.model_name}</Text>
                                )}
                              </View>
                              <View style={styles.qtyBadge}>
                                <Text style={styles.qtyBadgeText}>
                                  ต้องส่ง: {maxQty} {isSub ? "" : item.unit}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.inputGroup}>
                              <View style={styles.inputWrapper}>
                                <Text style={styles.labelSuccess}>✅ ส่งจริง</Text>
                                <TextInput
                                  style={[styles.input, styles.inputSuccess]}
                                  keyboardType="numeric"
                                  value={state.actualQty}
                                  onChangeText={(val) => {
                                    let cleaned = val;
                                    if (Number.isInteger(maxQty)) {
                                      cleaned = val.replace(/[^0-9]/g, "");
                                    } else {
                                      cleaned = val.replace(/[^0-9.]/g, "");
                                      const parts = cleaned.split(".");
                                      if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
                                    }

                                    setItemStates(prev => {
                                      const newState = { ...prev[item.id], actualQty: cleaned };
                                      if (cleaned === "") {
                                        newState.damagedQty = "";
                                      } else {
                                        const act = parseFloat(cleaned) || 0;
                                        newState.damagedQty = act <= maxQty ? (maxQty - act).toString() : "0";
                                      }
                                      return { ...prev, [item.id]: newState };
                                    });
                                  }}
                                />
                              </View>
                              <View style={styles.inputWrapper}>
                                <Text style={styles.labelDanger}>⚠️ ตีกลับ</Text>
                                <TextInput
                                  style={[styles.input, styles.inputDanger]}
                                  keyboardType="numeric"
                                  value={state.damagedQty !== undefined ? state.damagedQty : dmgQty.toString()}
                                  onChangeText={(val) => {
                                    let cleaned = val;
                                    if (Number.isInteger(maxQty)) {
                                      cleaned = val.replace(/[^0-9]/g, "");
                                    } else {
                                      cleaned = val.replace(/[^0-9.]/g, "");
                                      const parts = cleaned.split(".");
                                      if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
                                    }

                                    setItemStates(prev => {
                                      const newState = { ...prev[item.id], damagedQty: cleaned };
                                      if (cleaned === "") {
                                        newState.actualQty = "";
                                      } else {
                                        const dmg = parseFloat(cleaned) || 0;
                                        newState.actualQty = dmg <= maxQty ? (maxQty - dmg).toString() : "0";
                                      }
                                      return { ...prev, [item.id]: newState };
                                    });
                                  }}
                                />
                              </View>
                            </View>

                            {dmgQty > 0 && (
                              <View style={styles.returnOptionBox}>
                                <Text style={styles.returnOptionTitle}>วิธีจัดการของที่ไม่ได้ส่ง:</Text>
                                <View style={styles.radioGroup}>
                                  <TouchableOpacity
                                    style={[styles.radioCard, state.returnType === "warehouse" && styles.radioCardActiveW]}
                                    onPress={() => handleItemChange(item.id, "returnType", "warehouse")}
                                  >
                                    <Text style={[styles.radioText, state.returnType === "warehouse" ? { color: "#ea580c" } : { color: "#64748b" }]}>
                                      🔙 ตีกลับคลัง
                                    </Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    style={[styles.radioCard, state.returnType === "repair" && styles.radioCardActiveR]}
                                    onPress={() => handleItemChange(item.id, "returnType", "repair")}
                                  >
                                    <Text style={[styles.radioText, state.returnType === "repair" ? { color: "#8b5cf6" } : { color: "#64748b" }]}>
                                      🛠️ ซ่อมร้านนอก
                                    </Text>
                                  </TouchableOpacity>
                                </View>

                                {state.returnType === "repair" && (
                                  <TextInput
                                    style={styles.repairInput}
                                    placeholder="ระบุชื่อร้านซ่อม..."
                                    placeholderTextColor="#a78bfa"
                                    value={state.repairShop}
                                    onChangeText={(val) => handleItemChange(item.id, "repairShop", val)}
                                  />
                                )}
                              </View>
                            )}

                            <TextInput
                              style={styles.noteInput}
                              placeholder="หมายเหตุ / สาเหตุ (ถ้ามี)..."
                              placeholderTextColor="#94a3b8"
                              value={state.note}
                              onChangeText={(val) => handleItemChange(item.id, "note", val)}
                            />
                          </View>
                        );
                      })}

                      {/* Upload Sections per project */}
                      <View style={[styles.sectionContainer, { marginHorizontal: 0, marginTop: 16 }]}>
                        <Text style={styles.sectionTitle}>
                          <Camera size={20} color="#0f172a" /> หลักฐานการส่งงาน (หน้างานนี้)
                        </Text>

                        <View style={styles.uploadSection}>
                          <Text style={styles.uploadTitle}>✅ ถ่ายรูปรวมสำเร็จ:</Text>
                          <TouchableOpacity style={styles.uploadBtnPrimary} onPress={() => pickImage("success", projectId)} activeOpacity={0.8}>
                            <View style={styles.uploadIconWrapPrimary}>
                              <Camera size={24} color="#4338ca" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.uploadTitlePrimary}>
                                {pSuccessImgs.length > 0 ? "เพิ่มรูปภาพสำเร็จ" : "แนบรูปรวมส่งหน้างาน"}
                              </Text>
                              <Text style={styles.uploadSubtitle}>
                                {pSuccessImgs.length > 0 ? `แนบไว้แล้ว ${pSuccessImgs.length} รูป` : "แตะเพื่อเปิดกล้องหรือคลังรูปภาพ"}
                              </Text>
                            </View>
                            <View style={styles.uploadPlusWrap}>
                              <Text style={styles.uploadPlusText}>+</Text>
                            </View>
                          </TouchableOpacity>
                          <View style={styles.imagePreviewRow}>
                            {pSuccessImgs.map((uri: string, idx: number) => (
                              <View key={idx} style={styles.previewWrap}>
                                <TouchableOpacity onPress={() => setSelectedImage(uri)} activeOpacity={0.8}>
                                  <Image source={{ uri }} style={[styles.previewImg, { borderColor: "#a7f3d0" }]} />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.removeImgBtn} onPress={() => removeImage("success", idx, projectId)}>
                                  <XCircle size={18} color="white" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        </View>

                        {pTotalDmg > 0 && (
                          <View style={[styles.uploadSection, { marginTop: 16 }]}>
                            <Text style={[styles.uploadTitle, { color: "#ef4444" }]}>⚠️ ถ่ายรูปรวมปัญหา (บังคับ):</Text>
                            <TouchableOpacity style={styles.uploadBtnDanger} onPress={() => pickImage("dmg", projectId)} activeOpacity={0.8}>
                              <View style={styles.uploadIconWrapDanger}>
                                <AlertCircle size={24} color="#dc2626" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.uploadTitleDanger}>
                                  {pDmgImgs.length > 0 ? "เพิ่มรูปของเสีย" : "แนบรูปปัญหา/ของเสีย"}
                                </Text>
                                <Text style={styles.uploadSubtitle}>
                                  {pDmgImgs.length > 0 ? `แนบไว้แล้ว ${pDmgImgs.length} รูป` : "แตะเพื่อเปิดกล้องหรือคลังรูปภาพ"}
                                </Text>
                              </View>
                              <View style={styles.uploadPlusWrap}>
                                <Text style={styles.uploadPlusText}>+</Text>
                              </View>
                            </TouchableOpacity>
                            <View style={styles.imagePreviewRow}>
                              {pDmgImgs.map((uri: string, idx: number) => (
                                <View key={idx} style={styles.previewWrap}>
                                  <TouchableOpacity onPress={() => setSelectedImage(uri)} activeOpacity={0.8}>
                                    <Image source={{ uri }} style={[styles.previewImg, { borderColor: "#fca5a5" }]} />
                                  </TouchableOpacity>
                                  <TouchableOpacity style={styles.removeImgBtn} onPress={() => removeImage("dmg", idx, projectId)}>
                                    <XCircle size={18} color="white" />
                                  </TouchableOpacity>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}
                      </View>

                      <View style={[styles.sectionContainer, { marginHorizontal: 0, marginTop: 16 }]}>
                        <Text style={styles.sectionTitle}>
                          <Wrench size={20} color="#0f172a" /> งานเพิ่มเติม (ถ้ามี)
                        </Text>
                        <View style={styles.workExtraBox}>
                          <TextInput
                            style={styles.workNoteInput}
                            multiline
                            numberOfLines={3}
                            placeholder="ระบุสิ่งที่ทำเพิ่ม เช่น เก็บเงินมัดจำมาแล้ว, ติดตั้งบัวเพิ่ม..."
                            placeholderTextColor="#94a3b8"
                            value={pWorkNote}
                            onChangeText={(val) => setProjectWorkNotes(prev => ({ ...prev, [projectId]: val }))}
                          />

                          <Text style={[styles.uploadTitle, { marginTop: 16, color: "#1e40af" }]}>
                            📸 รูปถ่ายงานเพิ่มเติม:
                          </Text>
                          <TouchableOpacity style={styles.uploadBtnInfo} onPress={() => pickImage("work", projectId)} activeOpacity={0.8}>
                            <View style={styles.uploadIconWrapInfo}>
                              <Camera size={24} color="#2563eb" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.uploadTitleInfo}>
                                {pWorkImgs.length > 0 ? "เพิ่มรูปงานที่ทำ" : "แนบรูปภาพเพิ่มเติม"}
                              </Text>
                              <Text style={styles.uploadSubtitle}>
                                {pWorkImgs.length > 0 ? `แนบไว้แล้ว ${pWorkImgs.length} รูป` : "แตะเพื่อเปิดกล้องหรือคลังรูปภาพ"}
                              </Text>
                            </View>
                            <View style={styles.uploadPlusWrap}>
                              <Text style={styles.uploadPlusText}>+</Text>
                            </View>
                          </TouchableOpacity>
                          <View style={styles.imagePreviewRow}>
                            {pWorkImgs.map((uri: string, idx: number) => (
                              <View key={idx} style={styles.previewWrap}>
                                <TouchableOpacity onPress={() => setSelectedImage(uri)} activeOpacity={0.8}>
                                  <Image source={{ uri }} style={[styles.previewImg, { borderColor: "#93c5fd" }]} />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.removeImgBtn} onPress={() => removeImage("work", idx, projectId)}>
                                  <XCircle size={18} color="white" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        </View>
                      </View>

                      {/* Save Button for this project */}
                      <View style={{ marginTop: 24, marginBottom: 8 }}>
                        <TouchableOpacity onPress={() => handleSave(projectId, project.items)} style={styles.saveBtnShadow} activeOpacity={0.8}>
                          <LinearGradient
                            colors={["#10b981", "#059669"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.saveBtn}
                          >
                            <CheckCircle color="white" size={22} />
                            <Text style={styles.saveBtnText}>{isProjectCleared ? "บันทึกการแก้ไข" : "บันทึกข้อมูลหน้างานนี้"}</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* Image Viewer Modal - ย้ายออกมานอก KeyboardAvoidingView เพื่อป้องกันการถูกซ่อน/บดบัง */}
      <Modal
        visible={!!selectedImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)} // รองรับการกด Back บน Android
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={() => setSelectedImage(null)}
          >
            <XCircle color="white" size={36} />
          </TouchableOpacity>
          {selectedImage && (
            <Image
              source={{ uri: selectedImage }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },

  // Modal Styles ปรับแต่งให้แสดงผลชัดเจนขึ้น
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999, // ให้แน่ใจว่าอยู่บนสุดเสมอ
  },
  modalCloseBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    right: 20,
    zIndex: 10000,
    padding: 12, // เพิ่มพื้นที่ในการกดให้ใหญ่ขึ้น
  },
  modalImage: {
    width: "100%",
    height: "80%",
  },

  // Header Gradient
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 60,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    alignItems: 'center',
  },
  headerTitle: { color: "white", fontSize: 22, fontWeight: "800", letterSpacing: 0.5 },
  doNoBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 10,
  },
  doNoText: { color: "white", fontSize: 15, fontWeight: "700" },

  // Project Card
  projectCard: {
    backgroundColor: "white",
    marginHorizontal: 16,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 24,
    overflow: "hidden",
  },
  projectCardFirst: {
    marginTop: -40,
  },
  projectInfoSection: {
    padding: 16,
    gap: 12,
    backgroundColor: "white",
  },
  projectItemsSection: {
    padding: 16,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { padding: 10, borderRadius: 12 },
  infoTextBold: { color: "#1e293b", fontWeight: "800", fontSize: 16, flex: 1 },
  infoText: { color: "#475569", fontSize: 15, flex: 1 },
  divider: { height: 1, backgroundColor: "#f1f5f9", marginVertical: 4 },

  // 🟢 Styles ใหม่สำหรับช่องทางติดต่อ (แยกบรรทัดชัดเจน)
  contactContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  contactHeaderTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#475569",
    marginBottom: 10,
  },
  contactBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    gap: 12,
  },
  contactIconWrap: {
    backgroundColor: "#2563eb",
    padding: 8,
    borderRadius: 10,
  },
  contactBadgeLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  contactBadgeText: {
    color: "#1e293b",
    fontWeight: "800",
    fontSize: 15,
  },

  // Section
  sectionContainer: {
    marginHorizontal: 16,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  // Item Card
  itemCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  subItemCard: {
    marginLeft: 24,
    backgroundColor: "#fafaf9",
    borderLeftWidth: 4,
    borderLeftColor: "#f59e0b",
  },
  subItemLine: {
    position: "absolute",
    left: -24,
    top: 24,
    width: 24,
    height: 2,
    backgroundColor: "#f59e0b",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  itemName: { fontWeight: "700", fontSize: 16, color: "#1e293b", marginBottom: 6 },
  subItemName: { color: "#d97706", fontSize: 15 },
  itemModel: {
    fontSize: 13,
    color: "#0284c7",
    backgroundColor: "#e0f2fe",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
    fontWeight: "600",
  },
  qtyBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  qtyBadgeText: { color: "#475569", fontSize: 13, fontWeight: "800" },

  inputGroup: { flexDirection: "row", gap: 12, marginBottom: 14 },
  inputWrapper: { flex: 1 },
  labelSuccess: { fontSize: 14, color: "#059669", fontWeight: "800", marginBottom: 6 },
  labelDanger: { fontSize: 14, color: "#dc2626", fontWeight: "800", marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
  inputSuccess: {
    borderColor: "#a7f3d0",
    backgroundColor: "#ecfdf5",
    color: "#059669",
  },
  inputDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    color: "#dc2626",
  },

  returnOptionBox: {
    backgroundColor: "#f8fafc",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 14,
  },
  returnOptionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 12,
  },
  radioGroup: { flexDirection: "row", gap: 12, marginBottom: 4 },
  radioCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "white",
  },
  radioCardActiveW: { borderColor: "#ea580c", backgroundColor: "#fff7ed" },
  radioCardActiveR: { borderColor: "#8b5cf6", backgroundColor: "#f5f3ff" },
  radioText: { fontSize: 14, fontWeight: "700" },
  repairInput: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: "#ddd6fe",
    backgroundColor: "white",
    padding: 12,
    borderRadius: 10,
    fontSize: 15,
    color: "#6d28d9",
    fontWeight: "600",
  },

  noteInput: {
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 14,
    borderRadius: 12,
    fontSize: 15,
    color: "#334155",
  },

  // Upload Sections
  uploadSection: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  uploadTitle: {
    fontWeight: "800",
    fontSize: 16,
    color: "#334155",
    marginBottom: 14,
  },
  uploadBtnPrimary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0e7ff",
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#4338ca",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  uploadIconWrapPrimary: { backgroundColor: "#eef2ff", padding: 12, borderRadius: 12 },
  uploadTitlePrimary: { color: "#312e81", fontWeight: "800", fontSize: 16, marginBottom: 2 },

  uploadBtnDanger: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#fee2e2",
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  uploadIconWrapDanger: { backgroundColor: "#fef2f2", padding: 12, borderRadius: 12 },
  uploadTitleDanger: { color: "#7f1d1d", fontWeight: "800", fontSize: 16, marginBottom: 2 },

  workExtraBox: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  workNoteInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 14,
    height: 100,
    textAlignVertical: "top",
    fontSize: 15,
    color: "#334155",
  },
  uploadBtnInfo: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbeafe",
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  uploadIconWrapInfo: { backgroundColor: "#eff6ff", padding: 12, borderRadius: 12 },
  uploadTitleInfo: { color: "#1e3a8a", fontWeight: "800", fontSize: 16, marginBottom: 2 },

  uploadSubtitle: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  uploadPlusWrap: {
    backgroundColor: "#f8fafc",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  uploadPlusText: { color: "#94a3b8", fontSize: 22, fontWeight: "500", lineHeight: 24, marginTop: -2 },

  imagePreviewRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 14 },
  previewWrap: { position: "relative" },
  previewImg: { width: 80, height: 80, borderRadius: 12, borderWidth: 2, borderColor: "#e2e8f0" },
  removeImgBtn: {
    position: "absolute",
    top: -10,
    right: -10,
    backgroundColor: "#ef4444",
    borderRadius: 15,
    padding: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },

  // Bottom Bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 30 : 16,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 15,
  },
  saveBtnShadow: {
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderRadius: 16,
  },
  saveBtn: {
    padding: 18,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  saveBtnText: { color: "white", fontSize: 18, fontWeight: "800", letterSpacing: 0.5 },
});