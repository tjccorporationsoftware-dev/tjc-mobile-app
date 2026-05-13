import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View
} from "react-native";

// --- Config & Auth ---
import { API_BASE, IMG_BASE_URL } from "../../constants/config";
import { useAuth } from "../_layout";

// 🔥 แก้ไข: เติม as any เพื่อปิด Error สีแดง
Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }) as any,
});

// --- Theme Colors ---
const COLORS = {
  light: {
    bg: "#f8fafc",
    card: "#ffffff",
    text: "#1e293b",
    textSec: "#64748b",
    border: "#e2e8f0",
    primary: "#4f46e5",
    danger: "#ef4444",
    warning: "#f59e0b",
    success: "#10b981",
    info: "#3b82f6",
    shadow: "#000",
    overlay: "rgba(0,0,0,0.03)",
  },
  dark: {
    bg: "#0f172a",
    card: "#1e293b",
    text: "#f8fafc",
    textSec: "#94a3b8",
    border: "#334155",
    primary: "#818cf8",
    danger: "#f87171",
    warning: "#fbbf24",
    success: "#34d399",
    info: "#60a5fa",
    shadow: "#000",
    overlay: "rgba(255,255,255,0.05)",
  },
};

export default function AlertScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [stats, setStats] = useState({ urgent: 0, soon: 0, total: 0 });

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        await Notifications.requestPermissionsAsync();
      }
    })();
  }, []);

  const fetchData = async () => {
    try {
      if (!refreshing) setLoading(true);
      const url = `${API_BASE}/api_manager_car.php`;

      const formData = new FormData();
      formData.append("ajax_action", "get_all_alerts");
      const userIdStr = user?.id ? String(user.id) : "";
      formData.append("user_id", userIdStr);

      const response = await axios.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.data && response.data.data) {
        processAlerts(response.data.data);
      } else {
        setAlerts([]);
        setStats({ urgent: 0, soon: 0, total: 0 });
      }
    } catch (error: any) {
      console.error("❌ Fetch Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const processAlerts = async (data: any[]) => {
    let uCount = 0;
    let sCount = 0;
    const filtered: any[] = [];

    await Notifications.cancelAllScheduledNotificationsAsync();

    data.forEach((car) => {
      const tax = parseInt(car.tax_days_left);
      const insure = parseInt(car.insure_days_left);
      const minDays = Math.min(
        isNaN(tax) ? 999 : tax,
        isNaN(insure) ? 999 : insure,
      );

      if (minDays < 0) uCount++;
      else if (minDays <= 30) sCount++;

      if (minDays <= 7 && uCount <= 3) {
        triggerNotification(car.plate, minDays);
      }

      filtered.push({ ...car, minDays });
    });

    filtered.sort((a, b) => a.minDays - b.minDays);
    setAlerts(filtered);
    setStats({ urgent: uCount, soon: sCount, total: filtered.length });
  };

  const triggerNotification = async (plate: string, days: number) => {
    const title =
      days < 0
        ? `⚠️ ทะเบียน ${plate} ขาดต่ออายุ!`
        : `🔔 ทะเบียน ${plate} ใกล้หมดอายุ`;
    const body =
      days < 0
        ? `เอกสารขาดมาแล้ว ${Math.abs(days)} วัน โปรดดำเนินการทันที`
        : `เอกสารจะหมดอายุในอีก ${days} วัน`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: title,
        body: body,
        sound: "default",
        data: { plate: plate },
      },
      trigger: null,
    });
  };

  useEffect(() => {
    fetchData();
  }, [user]);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [user]);

  const getSmartCarImage = (filename: string | null) => {
    if (!filename || filename === "null" || filename === "") return null;
    if (filename.startsWith("http")) return filename;

    let rootUrl = IMG_BASE_URL.replace(/\/uploads\/?$/, "").replace(/\/+$/, "");
    let cleanName = filename.replace(/^(\/|uploads\/|cars\/)+/, "");

    return `${rootUrl}/uploads/cars/${cleanName}`;
  };

  const renderItem = ({ item }: { item: any }) => {
    const taxDays = parseInt(item.tax_days_left);
    const insureDays = parseInt(item.insure_days_left);
    const isUrgent = taxDays < 0 || insureDays < 0;

    const carImageUrl = getSmartCarImage(item.car_image);

    return (
      <View style={[styles.card, isUrgent && styles.cardUrgent]}>
        <View style={styles.cardImageContainer}>
          {carImageUrl ? (
            <Image
              source={{ uri: carImageUrl }}
              style={styles.cardImage}
              resizeMode="cover"
              onError={(e) =>
                console.log(`❌ รูปไม่ขึ้น (${item.plate}):`, carImageUrl)
              }
            />
          ) : (
            <View style={styles.noImage}>
              <Ionicons
                name="car-sport"
                size={40}
                color={colors.textSec}
                style={{ opacity: 0.5 }}
              />
            </View>
          )}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={styles.imageOverlay}
          />
          <View style={styles.plateBadge}>
            <Text style={styles.plateText}>{item.plate}</Text>
          </View>
          <View style={styles.carNumBadge}>
            <Text style={styles.carNumText}>#{item.car_number || "-"}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.carName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.divider} />
          <View style={{ gap: 8 }}>
            <StatusBadge
              days={taxDays}
              type="tax"
              colors={colors}
              isDark={isDark}
            />
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.dateText}>
                หมด:{" "}
                {item.tax_exp_date
                  ? new Date(item.tax_exp_date).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    })
                  : "-"}
              </Text>
            </View>
            <StatusBadge
              days={insureDays}
              type="insure"
              colors={colors}
              isDark={isDark}
            />
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.dateText}>
                หมด:{" "}
                {item.insure_exp_date
                  ? new Date(item.insure_exp_date).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    })
                  : "-"}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const StatusBadge = ({ days, type, colors, isDark }: any) => {
    let bg, txt, label, icon;
    if (isNaN(days))
      return (
        <Text style={{ color: colors.textSec, fontSize: 11 }}>ไม่ระบุ</Text>
      );
    if (days < 0) {
      bg = isDark ? "rgba(239, 68, 68, 0.2)" : "#fee2e2";
      txt = colors.danger;
      label = `ขาด ${Math.abs(days)} วัน`;
      icon = "alert-circle";
    } else if (days <= 30) {
      bg = isDark ? "rgba(245, 158, 11, 0.2)" : "#fef3c7";
      txt = colors.warning;
      label = `เหลือ ${days} วัน`;
      icon = "clock-alert";
    } else {
      bg = isDark ? "rgba(16, 185, 129, 0.2)" : "#d1fae5";
      txt = colors.success;
      label = `เหลือ ${days} วัน`;
      icon = "check-circle";
    }
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={[
              styles.iconBoxMini,
              {
                backgroundColor:
                  type === "tax" ? colors.info + "20" : colors.primary + "20",
              },
            ]}
          >
            <MaterialCommunityIcons
              name={
                type === "tax"
                  ? "file-document-outline"
                  : "shield-check-outline"
              }
              size={14}
              color={type === "tax" ? colors.info : colors.primary}
            />
          </View>
          <Text style={styles.rowLabelText}>
            {type === "tax" ? "พ.ร.บ." : "ประกัน"}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: bg }]}>
          <MaterialCommunityIcons
            name={icon as any}
            size={12}
            color={txt}
            style={{ marginRight: 4 }}
          />
          <Text style={{ color: txt, fontSize: 11, fontWeight: "700" }}>
            {label}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🔔 แจ้งเตือนเอกสาร</Text>
          <Text style={styles.headerSub}>พ.ร.บ. และ ประกันภัย (60 วัน)</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          {refreshing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="sync" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.statsContainer}>
            <StatCard
              label="หมดอายุ"
              value={stats.urgent}
              icon="alert-decagram"
              color={colors.danger}
              bg={isDark ? "rgba(239, 68, 68, 0.1)" : "#fef2f2"}
              styles={styles}
            />
            <StatCard
              label="ใกล้หมด"
              value={stats.soon}
              icon="clock-alert"
              color={colors.warning}
              bg={isDark ? "rgba(245, 158, 11, 0.1)" : "#fffbeb"}
              styles={styles}
            />
            <StatCard
              label="รายการ"
              value={stats.total}
              icon="file-multiple"
              color={colors.primary}
              bg={isDark ? "rgba(79, 70, 229, 0.1)" : "#eef2ff"}
              styles={styles}
            />
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <View
                style={[
                  styles.emptyIconCircle,
                  {
                    backgroundColor: isDark
                      ? "rgba(16, 185, 129, 0.2)"
                      : "#d1fae5",
                  },
                ]}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={60}
                  color={colors.success}
                />
              </View>
              <Text style={styles.emptyTitle}>ยอดเยี่ยมมาก!</Text>
              <Text style={styles.emptySub}>รถทุกคันเอกสารครบถ้วนสมบูรณ์</Text>
            </View>
          ) : null
        }
      />
      {loading && !refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSec, marginTop: 10, fontSize: 12 }}>
            กำลังโหลดข้อมูล...
          </Text>
        </View>
      )}
    </View>
  );
}

const StatCard = ({ label, value, icon, color, bg, styles }: any) => (
  <View style={[styles.statCard, { backgroundColor: bg, borderColor: color }]}>
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}
    >
      <View>
        <Text style={[styles.statValue, { color: color }]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={color}
        style={{ opacity: 0.8 }}
      />
    </View>
  </View>
);

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      paddingTop: Platform.OS === "ios" ? 60 : 45,
      paddingBottom: 20,
      paddingHorizontal: 20,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    headerTitle: { fontSize: 20, fontWeight: "800", color: colors.text },
    headerSub: { fontSize: 12, color: colors.textSec, marginTop: 2 },
    refreshBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      elevation: 4,
    },
    statsContainer: { flexDirection: "row", gap: 10, marginBottom: 20 },
    statCard: {
      flex: 1,
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.03,
      shadowRadius: 3,
      elevation: 1,
    },
    statValue: { fontSize: 22, fontWeight: "800" },
    statLabel: { fontSize: 11, fontWeight: "600", opacity: 0.7, marginTop: 2 },
    listContent: { padding: 20, paddingBottom: 50 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      marginBottom: 20,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 3,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    cardUrgent: { borderColor: colors.danger, borderWidth: 1.5 },
    cardImageContainer: {
      height: 160,
      backgroundColor: colors.bg,
      position: "relative",
    },
    cardImage: { width: "100%", height: "100%" },
    noImage: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.overlay,
    },
    imageOverlay: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 60,
    },
    plateBadge: {
      position: "absolute",
      bottom: 10,
      left: 10,
      backgroundColor: "#fff",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      elevation: 2,
    },
    plateText: { fontSize: 12, fontWeight: "800", color: "#000" },
    carNumBadge: {
      position: "absolute",
      top: 10,
      right: 10,
      backgroundColor: "rgba(0,0,0,0.6)",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 20,
      backdropFilter: "blur(5px)",
    },
    carNumText: { color: "#fff", fontSize: 10, fontWeight: "700" },
    cardBody: { padding: 16 },
    carName: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 12,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginBottom: 12,
      borderStyle: "dashed",
      borderWidth: 0.5,
      borderColor: colors.border,
    },
    iconBoxMini: {
      width: 24,
      height: 24,
      borderRadius: 6,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 8,
    },
    rowLabelText: { fontSize: 13, fontWeight: "600", color: colors.text },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    dateText: {
      fontSize: 10,
      color: colors.textSec,
      marginTop: 2,
      fontStyle: "italic",
    },
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 60,
    },
    emptyIconCircle: {
      width: 100,
      height: 100,
      borderRadius: 50,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 20,
    },
    emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
    emptySub: { fontSize: 13, color: colors.textSec, marginTop: 5 },
    loadingOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.bg,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
    },
  });
