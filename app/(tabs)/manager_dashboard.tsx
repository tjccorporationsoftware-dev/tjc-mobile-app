import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE } from "../../constants/config";
import { useAuth } from "../_layout";

export default function ManagerDashboard() {
  const router = useRouter();
  const { user } = useAuth();

  const [menus, setMenus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMenus = async () => {
    if (!user?.role) return;
    try {
      setLoading(true);
      const res = await axios.get(
        `${API_BASE}/api_mobile.php?action=get_manager_menus&role=${user.role}`,
      );
      if (Array.isArray(res.data)) {
        setMenus(res.data);
      }
    } catch (error) {
      console.error("Error fetching menus:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMenus();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMenus();
  };

  // ปรับสีให้อ่อนลง/เข้มขึ้น สำหรับทำไล่เฉดในกล่องไอคอน (percent บวก = อ่อนลง)
  const shade = (hex: string, percent: number) => {
    const h = (hex || "#4e54c8").replace("#", "");
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    const num = parseInt(full, 16);
    const adj = (v: number) =>
      Math.round(Math.min(255, Math.max(0, v + (percent / 100) * 255)));
    const r = adj((num >> 16) & 255);
    const g = adj((num >> 8) & 255);
    const b = adj(num & 255);
    return `rgb(${r}, ${g}, ${b})`;
  };

  // ไอคอนประจำฝ่าย — เลือกให้สื่อถึงงานของฝ่ายนั้นและรูปทรงต่างกันชัดเจน
  // อิงจาก id ที่ API ส่งมา (ไม่ใช่ชื่อไอคอนใน DB) เพื่อคุมหน้าตาได้แน่นอน
  const ICON_BY_ID: Record<string, string> = {
    sales: "chart-line", // กราฟยอดขายพุ่งขึ้น
    purchase: "shopping-cart", // รถเข็นจัดซื้อ
    marketing: "bullhorn", // โทรโข่งประชาสัมพันธ์
    admin: "clipboard-list", // แฟ้มเอกสารงานธุรการ
    warehouse: "warehouse",
    delivery: "truck",
    accounting: "coins",
    hr: "users",
    document: "file-invoice-dollar",
  };

  const getIcon = (item: any, color: string) => {
    // ใช้ไอคอนประจำฝ่ายก่อน ถ้าเป็นฝ่ายใหม่ที่ยังไม่ได้กำหนด
    // ค่อยใช้ชื่อไอคอนที่ DB ส่งมา และปิดท้ายด้วยไอคอนกลาง
    const name = ICON_BY_ID[item.id] || item.icon || "th-large";
    return <FontAwesome5 name={name as any} size={24} color={color} />;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ผู้บริหาร (Manager)</Text>
        <Text style={styles.headerSubtitle}>
          สวัสดี, {user?.fullname || "ผู้ใช้งาน"}
        </Text>
        <Text style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          (ตำแหน่ง: {user?.role})
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.menuContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color="#4e54c8"
            style={{ marginTop: 50 }}
          />
        ) : menus.length > 0 ? (
          menus.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, { borderLeftColor: item.color }]}
              onPress={() => router.push(item.route)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[
                  shade(item.color, 22),
                  item.color,
                  shade(item.color, -20),
                ]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={[styles.iconBox, { shadowColor: item.color }]}
              >
                {/* แสงสะท้อนมุมบนซ้าย ทำให้ดูนูนขึ้นมา */}
                <View style={styles.iconGloss} />
                {getIcon(item, "#fff")}
              </LinearGradient>

              <View style={styles.contentBox}>
                <Text style={styles.cardTitle}>{item.label}</Text>
                <Text style={styles.cardSubtitle}>ดูภาพรวมและรายงาน</Text>
              </View>

              <Ionicons name="chevron-forward" size={24} color="#ccc" />
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <FontAwesome5 name="lock" size={40} color="#ccc" />
            <Text style={styles.emptyText}>
              คุณไม่มีสิทธิ์เข้าถึงข้อมูลฝ่ายใดเลย
            </Text>
            <Text style={{ fontSize: 12, color: "#999", marginTop: 5 }}>
              กรุณาติดต่อ Admin เพื่อขอสิทธิ์ใช้งาน
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fd" },
  header: {
    padding: 20,
    backgroundColor: "#fff",
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "#333" },
  headerSubtitle: { fontSize: 14, color: "#666", marginTop: 5 },
  menuContainer: { padding: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    marginBottom: 15,
    borderLeftWidth: 5,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  iconBox: {
    width: 54,
    height: 54,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
    overflow: "hidden",
    // เงาสีเดียวกับไอคอน ทำให้ดูลอยขึ้นจากการ์ด
    elevation: 6,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  iconGloss: {
    position: "absolute",
    top: -14,
    left: -14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  contentBox: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  cardSubtitle: { fontSize: 13, color: "#888", marginTop: 2 },

  emptyState: { alignItems: "center", marginTop: 50, opacity: 0.7 },
  emptyText: { marginTop: 10, fontSize: 16, color: "#666", fontWeight: "600" },
});
