import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE } from "../../constants/config"; // ✅ Ensure path is correct
import { useAuth } from "../_layout";

export default function HistoryScreen() {
  const router = useRouter();
  const { user } = useAuth();

  // State to store menus from API
  const [dynamicMenu, setDynamicMenu] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMenus = async () => {
      try {
        if (!user?.role) return;

        setLoading(true);

        console.log("Fetching menus for role:", user.role);

        // ✅ Call API to get pre-filtered menus
        // (API จะส่งเฉพาะเมนูที่ user คนนั้นมีสิทธิ์เห็นมาให้)
        const res = await axios.get(`${API_BASE}/api_mobile.php`, {
          params: { action: "get_menus", role: user.role },
        });

        console.log("API RESPONSE:", res.data);

        if (Array.isArray(res.data)) {
          // ✅ ใช้ข้อมูลจาก API โดยตรง (ลบโค้ด Manual Push ออกหมดแล้ว)
          setDynamicMenu(res.data);
        } else {
          console.warn("Invalid menu format received");
          setDynamicMenu([]);
        }
      } catch (error) {
        console.error("Error fetching menus:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMenus();
  }, [user]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fd" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>📜 ประวัติการทำงาน</Text>
          <Text style={styles.headerSub}>
            {user?.fullname || "ผู้ใช้งาน"}{" "}
            <Text style={{ fontSize: 12, color: "#94a3b8" }}>
              ({user?.role})
            </Text>
          </Text>
        </View>
        <View style={styles.avatar}>
          <Text style={{ fontSize: 20 }}>👤</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>เมนูของคุณ</Text>

        {loading ? (
          <View style={{ marginTop: 50, alignItems: "center" }}>
            <ActivityIndicator size="large" color="#4f46e5" />
            <Text style={{ color: "#94a3b8", marginTop: 10 }}>
              กำลังโหลดรายการเมนู...
            </Text>
          </View>
        ) : (
          <View style={styles.cardContainer}>
            {dynamicMenu.length > 0 ? (
              // ✅ Render buttons based on API data
              dynamicMenu.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.card, { borderLeftColor: item.color }]}
                  onPress={() => router.push(item.route)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.iconBox,
                      { backgroundColor: item.color + "15" },
                    ]}
                  >
                    {/* FontAwesome5 icon name comes from API */}
                    <FontAwesome5
                      name={item.icon}
                      size={24}
                      color={item.color}
                    />
                  </View>

                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle}>{item.label}</Text>
                    <Text style={styles.cardSub}>{item.subLabel}</Text>
                  </View>

                  <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
                </TouchableOpacity>
              ))
            ) : (
              // No permission state
              <View
                style={{ alignItems: "center", marginTop: 40, opacity: 0.6 }}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={48}
                  color="#cbd5e1"
                />
                <Text
                  style={{
                    textAlign: "center",
                    color: "#64748b",
                    marginTop: 10,
                  }}
                >
                  คุณไม่มีสิทธิ์เข้าถึงเมนูประวัติใดๆ
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fd" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: "#1e293b" },
  headerSub: { fontSize: 14, color: "#64748b", marginTop: 2 },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  content: { padding: 20 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 15,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardContainer: { gap: 15 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    borderLeftWidth: 5,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "bold", color: "#334155" },
  cardSub: { fontSize: 12, color: "#94a3b8", marginTop: 3 },
});
