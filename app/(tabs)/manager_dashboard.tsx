import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import axios from "axios";
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

  // เช็คไอคอนว่าเป็น FontAwesome หรือ Ionicons (ปกติ FontAwesome5 จะใช้กับ truck/box ได้ดีกว่า)
  const getIcon = (iconName: string, color: string) => {
    const faIcons = [
      "truck",
      "box",
      "dolly",
      "warehouse",
      "bullhorn",
      "shopping-cart",
    ];
    if (faIcons.includes(iconName) || iconName === "building") {
      return <FontAwesome5 name={iconName} size={24} color={color} />;
    }
    // Default เป็น Ionicons
    return <Ionicons name={iconName as any} size={24} color={color} />;
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
              <View
                style={[styles.iconBox, { backgroundColor: item.color + "15" }]}
              >
                {getIcon(item.icon, item.color)}
              </View>

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
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  contentBox: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  cardSubtitle: { fontSize: 13, color: "#888", marginTop: 2 },

  emptyState: { alignItems: "center", marginTop: 50, opacity: 0.7 },
  emptyText: { marginTop: 10, fontSize: 16, color: "#666", fontWeight: "600" },
});
