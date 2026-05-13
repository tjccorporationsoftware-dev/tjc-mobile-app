import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Alert,
    Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { IMG_BASE_URL } from "../constants/config"; // ปรับ Path ตามจริง

interface Props {
  visible: boolean;
  onClose: () => void;
  item: any;
  color: string;
}

export default function HistoryDetailModal({
  visible,
  onClose,
  item,
  color,
}: Props) {
  if (!item) return null;

  const formatDate = (date: any) => new Date(date).toLocaleDateString("th-TH");

  const openImage = (filename: string, folder = "uploads/") => {
    if (!filename) return;
    const fullUrl = filename.startsWith("http")
      ? filename
      : `${IMG_BASE_URL.replace(/\/$/, "")}/${folder}${filename.trim()}`;
    Linking.openURL(fullUrl).catch(() => Alert.alert("Error", "เปิดรูปไม่ได้"));
  };

  const renderImages = () => {
    const folder =
      item.source_type === "marketing" ? "uploads/marketing/" : "uploads/";
    const files = [
      ...(item.fuel_receipt ? item.fuel_receipt.split(",") : []),
      ...(item.accommodation_receipt
        ? item.accommodation_receipt.split(",")
        : []),
      ...(item.other_receipt ? item.other_receipt.split(",") : []),
      ...(item.platform_files ? item.platform_files.split(",") : []),
    ];

    if (files.length === 0) return null;

    return (
      <View style={{ marginTop: 15 }}>
        <Text style={styles.sectionTitle}>📸 หลักฐาน</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {files.map((file: string, idx: number) => {
            const f = file.trim();
            if (!f) return null;
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => openImage(f, folder)}
                style={[styles.imgBtn, { backgroundColor: color + "15" }]}
              >
                <Ionicons name="image" size={20} color={color} />
                <Text style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                  รูป {idx + 1}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.modalTitle}>รายละเอียด</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#999" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.row}>
              <Text style={styles.label}>วันที่:</Text>
              <Text style={styles.val}>{formatDate(item.report_date)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>ผู้รายงาน:</Text>
              <Text style={styles.val}>{item.reporter_name}</Text>
            </View>
            <View style={styles.divider} />

            {/* Dynamic Content */}
            <View style={styles.row}>
              <Text style={styles.label}>หัวข้อ:</Text>
              <Text style={[styles.val, { fontWeight: "bold", color: color }]}>
                {item.work_result || item.supplier_name || item.platform_name}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>รายละเอียด:</Text>
              <Text style={styles.val}>
                {item.project_name ||
                  (item.order_number ? `Order: ${item.order_number}` : "-")}
              </Text>
            </View>

            {/* Purchase Items List */}
            {item.item_details && (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>{item.item_details}</Text>
              </View>
            )}

            {/* GPS Info */}
            {item.gps && item.gps !== "Office" && (
              <View style={styles.gpsBox}>
                <Ionicons name="location" size={16} color="#0369a1" />
                <Text style={styles.gpsText}>
                  {item.gps_address} ({item.province})
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            {/* Financials */}
            <View style={styles.row}>
              <Text style={styles.label}>ยอดค่าใช้จ่าย:</Text>
              <Text
                style={[styles.val, { color: "#ef4444", fontWeight: "bold" }]}
              >
                {parseFloat(item.total_expense) > 0
                  ? `฿${parseFloat(item.total_expense).toLocaleString()}`
                  : "-"}
              </Text>
            </View>
            {parseFloat(item.total_sales) > 0 && (
              <View style={styles.row}>
                <Text style={styles.label}>ยอดขาย:</Text>
                <Text
                  style={[styles.val, { color: "#059669", fontWeight: "bold" }]}
                >
                  +฿{parseFloat(item.total_sales).toLocaleString()}
                </Text>
              </View>
            )}

            {renderImages()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "90%",
    maxHeight: "80%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#1e293b" },
  row: { flexDirection: "row", marginBottom: 10 },
  label: { width: 100, color: "#64748b", fontSize: 13, fontWeight: "600" },
  val: { flex: 1, color: "#334155", fontSize: 14 },
  divider: { height: 1, backgroundColor: "#f1f5f9", marginVertical: 10 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#475569",
    marginBottom: 10,
  },
  gpsBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f9ff",
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  gpsText: { marginLeft: 5, fontSize: 12, color: "#0369a1", flex: 1 },
  noteBox: {
    backgroundColor: "#f9fafb",
    padding: 10,
    borderRadius: 8,
    marginTop: 5,
  },
  noteText: { fontSize: 12, color: "#4b5563" },
  imgBtn: {
    width: 60,
    height: 60,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});
