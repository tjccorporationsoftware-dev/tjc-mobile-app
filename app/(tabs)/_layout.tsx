// app/(tabs)/_layout.tsx

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import {
  Drawer,
  DrawerContentScrollView,
  DrawerToggleButton,
  useDrawerStatus,
} from "expo-router/drawer";
import { ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInLeft,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_BASE, API_TASKS_URL } from "../../constants/config";
import { useAuth } from "../_layout";

// 🎨 ธีมเดียวกับหน้า login (app/index.tsx): น้ำเงินเข้ม -> น้ำเงิน -> ฟ้า — แถบหัวทุกหน้า + หัว sidebar
const THEME_GRADIENT = ["#0a1f5c", "#1d4ed8", "#0ea5e9"] as const;
const THEME_BLUE = "#1d4ed8";

// ------------------------------------------------------
// 1. กำหนดหมวดหมู่เมนู (จัดเรียงใหม่ตามความต้องการ)
// ------------------------------------------------------
// icon = ไอคอนหัวหมวด · colors = สีประจำหมวด [สีต้น, สีปลาย] ไล่จากซ้ายไปขวา ใช้กับหัวหมวด/แถบเมนูที่เปิดอยู่
// (สีต้นใช้เป็นสีไอคอน + กล่องไอคอนสีอ่อนของเมนูที่ยังไม่ได้เปิด)
const MENU_GROUPS: {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: [string, string];
  items: string[];
}[] = [
  {
    id: "profile_group",
    title: "หมวดหลักโปรไฟล์",
    icon: "person-circle",
    colors: ["#1e40af", "#60a5fa"], // สีหลักของธีม (น้ำเงิน)
    items: ["Profile"],
  },
  // 3 หมวดงานโครงการต่อจากหน้าหลัก (โครงการ / บัญชีลูกหนี้ / เอกสาร PO-AX)
  {
    id: "project_group",
    title: "แดชบอร์ดโครงการ",
    icon: "briefcase",
    colors: ["#1d4ed8", "#38bdf8"], // น้ำเงิน ไล่ไปฟ้า
    items: ["project_dashboard"],
  },
  {
    id: "accounting_group",
    title: "หมวดบัญชี-การเงิน (โครงการ)",
    icon: "cash",
    colors: ["#0ea5e9", "#7dd3fc"], // ฟ้า
    items: ["accounting_dashboard"],
  },
  {
    id: "document_group",
    title: "หมวดเอกสารโครงการ",
    icon: "document-text",
    colors: ["#a855f7", "#6b21a8"], // ม่วง ไล่ไปม่วงเข้ม
    items: ["document_dashboard"],
  },
  {
    id: "Company Executive",
    title: "หมวดทีมผู้บริหาร",
    icon: "ribbon",
    colors: ["#7c3aed", "#a78bfa"],
    items: ["BossDashboard", "BossCommand"],
  },
  {
    id: "pr_group",
    title: "หมวดประชาสัมพันธ์",
    icon: "megaphone",
    colors: ["#db2777", "#f472b6"],
    items: ["news", "correspondence_dashboard", "correspondence_book"],
  },
  {
    id: "overview_group",
    title: "สรุปภาพรวมรายงานทุกฝ่าย",
    icon: "pie-chart",
    colors: ["#4f46e5", "#818cf8"],
    items: ["manager_dashboard", "map_dashboard"],
  },
  {
    id: "work_report_group",
    title: "หมวดรายงานการทำงาน",
    icon: "create",
    colors: ["#0d9488", "#2dd4bf"],
    items: [
      "write_report",
      "PurchaseReport",
      "OnlinemarketingReport",
      "AdminReport",
    ],
  },
  {
    id: "history_group",
    title: "หมวดประวัติรายงาน",
    icon: "time",
    colors: ["#475569", "#94a3b8"],
    items: ["history"],
  },

  {
    id: "finance_group",
    title: "หมวดบัญชี-การเงิน",
    icon: "wallet",
    colors: ["#16a34a", "#4ade80"],
    items: ["CashFlow"],
  },
  {
    id: "vehicle_group",
    title: "หมวดระบบยานพาหนะ",
    icon: "car-sport",
    colors: ["#2563eb", "#60a5fa"],
    items: ["CarBooking", "CarDashboard"],
  },
  {
    id: "vehicle_groups",
    title: "ขนส่ง",
    icon: "bus",
    colors: ["#ea580c", "#fb923c"],
    items: ["fm_dashboard", "fm_jobs", "alert_screen", "fm_report_travel"],
  },
  {
    id: "driver_group",
    title: "หมวดคนรถ (จัดส่ง)",
    icon: "cube",
    colors: ["#ca8a04", "#facc15"],
    items: ["DriverTasks", "DriverConfirmItems"],
  },
  {
    id: "immigration_groups",
    title: "งานเข้าเมือง",
    icon: "airplane",
    colors: ["#dc2626", "#f87171"],
    items: ["Immigration_dashboard", "Immigration_Report"],
  },
];

// ------------------------------------------------------
// 2. ชิ้นส่วน sidebar (react-native-reanimated — อนิเมชั่นรันบน UI thread ไม่กระตุกแม้เมนูยาว)
// ------------------------------------------------------

const MENU_BG = "#f0f5fd"; // พื้นหลังส่วนเมนู (ฟ้าจางๆ ตามธีม) — การ์ดกลุ่มสีขาวจะลอยเด่นขึ้นมา
const TH_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// คำทักตามช่วงเวลา + วันที่วันนี้ (ไม่ใส่ปี) บนหัว sidebar
function greetingNow() {
  const now = new Date();
  const h = now.getHours();
  const greet = h < 12 ? "สวัสดีตอนเช้า" : h < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";
  return { greet, today: `วัน${TH_WEEKDAYS[now.getDay()]}ที่ ${now.getDate()} ${TH_MONTHS_SHORT[now.getMonth()]}` };
}

// กดแล้วยุบลงนิดแล้วเด้งกลับ (spring) — ใช้กับรายการเมนูและปุ่มออกจากระบบ
function PressScale({ onPress, style, children }: { onPress: () => void; style?: any; children: ReactNode }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 15, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 220 });
      }}
    >
      <Animated.View style={[style, aStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

// ป้าย "New" ที่เต้นเบาๆ ให้สะดุดตา — เต้นเฉพาะตอน sidebar เปิดอยู่ (ปิดแล้วหยุด ไม่กินแบตเปล่าๆ)
function PulseBadge({ color, running }: { color: string; running: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (running) {
      s.value = withRepeat(withSequence(withTiming(1.15, { duration: 550 }), withTiming(1, { duration: 550 })), -1, false);
    } else {
      cancelAnimation(s);
      s.value = 1;
    }
    return () => cancelAnimation(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.badgeContainer, { backgroundColor: color }, aStyle]}>
      <Text style={styles.badgeText}>New</Text>
    </Animated.View>
  );
}

// วงกลมตกแต่งพื้นหลังหัว sidebar ลอยช้าๆ (แบบหน้า login) — ลอยเฉพาะตอน sidebar เปิดอยู่
function FloatingCircle({ style, range, duration, running }: { style: any; range: number; duration: number; running: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (running) t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
    else cancelAnimation(t);
    return () => cancelAnimation(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateY: t.value * range }, { translateX: t.value * range * 0.5 }] }));
  return <Animated.View style={[style, aStyle]} />;
}

// รายการเมนู 1 แถว — กล่องไอคอนสีประจำหมวด · หน้าที่เปิดอยู่ = แถบไล่สีของหมวด ตัวหนังสือ/ไอคอนขาว
// แถบไล่สีค่อยๆ ปรากฏ/หาย (และขยายจาก 96%) ตอนเปลี่ยนหน้า
function DrawerMenuItem({
  label,
  renderIcon,
  focused,
  colors,
  badgeColor,
  delay,
  running,
  onPress,
}: {
  label: string;
  renderIcon: (color: string) => ReactNode;
  focused: boolean;
  colors: [string, string];
  badgeColor?: string;
  delay: number;
  running: boolean;
  onPress: () => void;
}) {
  const active = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    active.value = withTiming(focused ? 1 : 0, { duration: 280 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);
  const pillStyle = useAnimatedStyle(() => ({ opacity: active.value, transform: [{ scale: 0.96 + active.value * 0.04 }] }));
  const [c1, c2] = colors;

  return (
    <Animated.View entering={FadeInLeft.delay(delay).duration(320)}>
      <PressScale onPress={onPress} style={styles.menuItem}>
        <Animated.View style={[styles.menuItemPill, pillStyle]}>
          <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.menuItemPillFill} />
        </Animated.View>
        <View style={[styles.menuIconBox, { backgroundColor: focused ? "rgba(255,255,255,0.22)" : `${c1}1A` }]}>
          {renderIcon(focused ? "#ffffff" : c1)}
        </View>
        <Text style={[styles.menuItemLabel, focused && styles.menuItemLabelActive]} numberOfLines={1}>
          {label}
        </Text>
        {badgeColor ? (
          <PulseBadge color={badgeColor} running={running} />
        ) : (
          <Ionicons name="chevron-forward" size={14} color={focused ? "#ffffff" : "#cbd5e1"} />
        )}
      </PressScale>
    </Animated.View>
  );
}

function CustomDrawerContent(props: any) {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const isDrawerOpen = useDrawerStatus();
  const isOpen = isDrawerOpen === "open";

  // State: Profile Data
  const [profile, setProfile] = useState({
    fullname: user?.fullname || "พนักงาน TJC",
    role: user?.role || "USER",
    avatar: user?.avatar || null,
  });
  const [timestamp, setTimestamp] = useState(new Date().getTime());
  // เปิด sidebar ทุกครั้ง -> เปลี่ยน key ของรายการเมนูให้ mount ใหม่ เมนูจะไหลเข้าทีละแถวซ้ำทุกครั้ง (หัวโปรไฟล์นิ่ง)
  const [openKey, setOpenKey] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setOpenKey((k) => k + 1);
      if (user?.username) fetchLatestProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const fetchLatestProfile = async () => {
    try {
      const res = await axios.get(
        `${API_BASE}/api_mobile.php?action=get_user_profile&username=${user?.username}`,
      );
      if (res.data) {
        const apiRole = res.data.role || "USER";
        const apiName = res.data.fullname || profile.fullname;

        if (
          res.data.avatar !== profile.avatar ||
          apiName !== profile.fullname ||
          apiRole !== profile.role
        ) {
          setProfile({
            fullname: apiName,
            role: apiRole,
            avatar: res.data.avatar,
          });
          setTimestamp(new Date().getTime());
        }
      }
    } catch (error) {
      console.log("Sidebar Fetch Error:", error);
    }
  };

  const handleLogout = () => {
    Alert.alert("ออกจากระบบ", "คุณต้องการออกจากระบบใช่หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      { text: "ออก", style: "destructive", onPress: () => signOut() },
    ]);
  };

  const getAvatarSource = () => {
    if (!profile.avatar) return null;
    if (profile.avatar.startsWith("http")) return { uri: profile.avatar };
    let baseUrl = API_BASE.replace("/api_mobile.php", "").replace(
      "api_mobile.php",
      "",
    );
    if (!baseUrl.endsWith("/")) baseUrl += "/";
    return {
      uri: `${baseUrl}uploads/profiles/${profile.avatar}?t=${timestamp}`,
    };
  };

  const avatarSource = getAvatarSource();
  const { greet, today } = greetingNow();

  // ------------------------------------------------------
  // 3. ฟังก์ชันเรนเดอร์กลุ่มเมนู (Render Helper)
  // ------------------------------------------------------
  const renderMenuGroups = () => {
    const { state, descriptors, navigation, immigrationBadge, bossBadge } = props;
    // ลำดับต่อเนื่องทั้งรายการ ใช้หน่วงเวลาให้เมนูไหลเข้าทีละแถว (เพดาน 16 แถว ไม่ให้แถวท้ายรอนาน)
    let seq = 0;
    const nextDelay = () => Math.min(seq++, 16) * 28;

    return MENU_GROUPS.map((group) => {
      const groupRoutes = state.routes.filter((route: any) =>
        group.items.includes(route.name),
      );

      // ถ้ากลุ่มนี้ไม่มีเมนูที่ User มีสิทธิ์เห็นเลย ให้ข้ามไป (ไม่โชว์หัวข้อ)
      const visibleRoutes = groupRoutes.filter((route: any) => {
        const { options } = descriptors[route.key];
        // เช็คว่า style display ไม่ใช่ none (ตาม permission ที่เราตั้งไว้ข้างล่าง)
        return !(
          options.drawerItemStyle && options.drawerItemStyle.display === "none"
        );
      });

      if (visibleRoutes.length === 0) return null;

      return (
        <View key={group.id} style={styles.menuGroup}>
          {/* หัวข้อกลุ่ม — ชิปไอคอนไล่สีประจำหมวด + ชื่อหมวด + เส้นบางยาวถึงขอบ */}
          <Animated.View entering={FadeIn.delay(nextDelay()).duration(300)} style={styles.sectionHeaderRow}>
            <LinearGradient colors={group.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sectionIcon}>
              <Ionicons name={group.icon} size={11} color="#fff" />
            </LinearGradient>
            <Text style={styles.sectionHeader} numberOfLines={1}>
              {group.title}
            </Text>
            <View style={styles.sectionLine} />
          </Animated.View>

          {/* เมนูของหมวดรวมอยู่ในการ์ดขาวใบเดียว */}
          <View style={styles.groupCard}>
            {visibleRoutes.map((route: any) => {
              const { options } = descriptors[route.key];
              const isFocused = state.index === state.routes.indexOf(route);
              const labelText = options.drawerLabel || options.title || route.name;
              // ป้าย New: งานเข้าเมือง / งานผู้บริหาร-พนักงาน
              const badgeColor =
                (route.name === "Immigration_dashboard" && immigrationBadge > 0) ||
                (route.name === "BossDashboard" && bossBadge > 0)
                  ? "#ef4444"
                  : undefined;

              return (
                <DrawerMenuItem
                  key={route.key}
                  label={labelText}
                  renderIcon={(color) =>
                    options.drawerIcon ? options.drawerIcon({ color, size: 18, focused: isFocused }) : null
                  }
                  focused={isFocused}
                  colors={group.colors}
                  badgeColor={badgeColor}
                  delay={nextDelay()}
                  running={isOpen}
                  onPress={() => navigation.navigate(route.name)}
                />
              );
            })}
          </View>
        </View>
      );
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: MENU_BG }}>
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={THEME_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.drawerHeader, { paddingTop: insets.top + 18 }]}
        >
          {/* พื้นหลังตกแต่ง (ลอยช้าๆ) — ตัวโปรไฟล์ด้านบนนิ่ง */}
          <FloatingCircle style={styles.circleDecoration} range={12} duration={4600} running={isOpen} />
          <FloatingCircle style={styles.circleDecorationSmall} range={-8} duration={3400} running={isOpen} />
          <View style={styles.circleDecorationRing} />

          <View style={styles.profileRow}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarContainer}>
                {avatarSource ? (
                  <Image source={avatarSource} style={styles.avatarImage} />
                ) : (
                  <MaterialCommunityIcons
                    name="account"
                    size={34}
                    color={THEME_BLUE}
                  />
                )}
              </View>
            </View>
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={styles.greetingText}>{greet},</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {profile.fullname}
              </Text>
              <View style={styles.roleBadge}>
                <Ionicons name="shield-checkmark" size={10} color="#fff" />
                <Text style={styles.roleText}>
                  {(profile.role || "USER").toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.headerInfo}>
            <Ionicons name="calendar-outline" size={13} color="#fff" />
            <Text style={styles.headerInfoText}>{today}</Text>
            <View style={styles.headerInfoDot} />
            <Text style={styles.headerInfoText}>ONE TJC</Text>
          </View>
        </LinearGradient>
      </View>

      <DrawerContentScrollView
        {...props}
        style={{ backgroundColor: MENU_BG }}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* key เปลี่ยนทุกครั้งที่เปิด sidebar -> เมนูไหลเข้าทีละแถวใหม่ */}
        <View key={`menu-${openKey}`}>{renderMenuGroups()}</View>
      </DrawerContentScrollView>

      <View style={[styles.drawerFooter, { paddingBottom: 14 + insets.bottom }]}>
        <PressScale onPress={handleLogout} style={styles.logoutBtn}>
          <LinearGradient colors={["#ff6b6b", "#ef4444"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logoutIconBg}>
            <Ionicons name="log-out-outline" size={18} color="#fff" />
          </LinearGradient>
          <Text style={styles.logoutText}>ออกจากระบบ</Text>
          <Ionicons name="chevron-forward" size={14} color="#fca5a5" style={{ marginLeft: "auto" }} />
        </PressScale>
        <Text style={styles.versionText}>TJC Mobile v1.0.0</Text>
      </View>
    </View>
  );
}

// ... (DrawerLayout เหมือนเดิม แต่เช็คชื่อ route ให้ตรงกับ MENU_GROUPS ด้านบน) ...
export default function DrawerLayout() {
  const { user, isLoading } = useAuth();
  // ✅ 1. เพิ่มตัวแปรเก็บสถานะ Badge

  const [immigrationBadge, setImmigrationBadge] = useState(0);
  const [bossBadge, setBossBadge] = useState(0);
  // ✅ แก้ไข: ใช้ useEffect แทน useFocusEffect เพื่อให้ Listener ทำงานตลอดเวลาที่ Layout ยังอยู่
  useEffect(() => {
    let isActive = true;

    const fetchImmigrationBadge = async () => {
      // ป้องกันกรณี user หรือ user.id ยังไม่โหลด
      const currentUserId = user?.id;
      if (!currentUserId) return;

      try {
        const res = await axios.get(
          `${API_TASKS_URL}?action=get_immigration_unread`,
        );
        if (isActive && res.data && res.data.success) {
          // ดึงรายการ ID จาก Server (เน้นย้ำว่าเป็น String และ Trim แล้ว)
          const serverIds = (res.data.ids || []).map((id: any) =>
            String(id).trim(),
          );

          // ดึงรายการ ID ที่อ่านแล้วจากเครื่อง
          const storageKey = `READ_IMMIGRATION_IDS_${currentUserId}`;
          const readData = await AsyncStorage.getItem(storageKey);
          const readIds = readData
            ? JSON.parse(readData).map((id: any) => String(id).trim())
            : [];

          // คำนวณ: งานจาก Server ที่ "ไม่อยู่ใน" รายการที่อ่านแล้ว
          const unreadCount = serverIds.filter(
            (id: string) => !readIds.includes(id),
          ).length;

          console.log("📊 Unread Count Update:", unreadCount); // ใส่ไว้ดู Debug ใน Console
          setImmigrationBadge(unreadCount);
        }
      } catch (e) {
        console.log("Fetch Badge Error", e);
      }
    };

    // ฟังเหตุการณ์การอัปเดต
    const sub = DeviceEventEmitter.addListener("updateImmigrationBadge", () => {
      // เพิ่ม delay เล็กน้อยเพื่อให้ AsyncStorage บันทึกเสร็จก่อนดึงข้อมูล
      setTimeout(fetchImmigrationBadge, 300);
    });

    fetchImmigrationBadge();
    const interval = setInterval(fetchImmigrationBadge, 10000); // ปรับเป็น 10 วินาทีเพื่อไม่ให้กินทรัพยากรเกินไป

    return () => {
      isActive = false;
      clearInterval(interval);
      sub.remove();
    };
  }, [user?.id]); // Re-run เมื่อ User ID เปลี่ยน

  // ✅ 3. เพิ่ม useEffect ใหม่ สำหรับนับป้ายแจ้งเตือนผู้บริหาร/พนักงาน
  useEffect(() => {
    let isActive = true;

    const fetchBossBadge = async () => {
      const currentUserId = user?.id;
      const currentUserName = user?.username;
      const currentUserRole = user?.role;

      if (!currentUserId || !currentUserName) return;

      try {
        // ยิง API ดึงงานมาเช็ค (ใช้ API เดียวกับหน้าแดชบอร์ด)
        const res = await axios.get(
          `${API_TASKS_URL}?action=get_boss_dashboard&user_name=${currentUserName}&role=${currentUserRole}`,
        );

        if (isActive && res.data && res.data.status === "success") {
          const tasks = res.data.tasks || [];

          // ดึงประวัติการอ่านของพนักงานจากเครื่อง
          const storageKey = `READ_BOSS_TASK_IDS_${currentUserId}`;
          const readData = await AsyncStorage.getItem(storageKey);
          const readIds = readData
            ? JSON.parse(readData).map((id: any) => String(id))
            : [];

          let unreadCount = 0;

          // นำงานมาวนลูปนับป้าย (ใช้เงื่อนไขเดียวกับหน้าการ์ดเป๊ะๆ)
          tasks.forEach((item: any) => {
            const cleanAssignedTo = item.assigned_to
              ? item.assigned_to.split("(")[0].trim()
              : "";
            const isAssignedToMe = cleanAssignedTo === currentUserName;
            const isCreatorOrAdmin =
              currentUserRole === "admin" ||
              currentUserRole === "ceo" ||
              item.created_by === currentUserName;

            // พนักงานมีงานใหม่ยังไม่อ่าน
            const isEmployeeUnread =
              isAssignedToMe &&
              !readIds.includes(String(item.task_id)) &&
              item.status === "มอบหมาย";
            // บอสมีงานอัปเดตใหม่
            const isBossUnread =
              isCreatorOrAdmin && item.is_read_admin == 0 && !isAssignedToMe;

            if (isEmployeeUnread || isBossUnread) {
              unreadCount++;
            }
          });

          // ✅ 1. เพิ่มบรรทัดนี้ เพื่อดูว่ามันนับได้กี่งาน
          console.log("🔥 Boss Unread Count:", unreadCount);
          setBossBadge(unreadCount);
        }
      } catch (e) {
        console.log("Fetch Boss Badge Error", e);
      }
    };

    // รอรับสัญญาณจากหน้าแดชบอร์ด เพื่อให้ป้ายลดลงทันทีตอนกดอ่าน
    const sub1 = DeviceEventEmitter.addListener("updateCreatorBadge", () => {
      setTimeout(fetchBossBadge, 300);
    });
    const sub2 = DeviceEventEmitter.addListener("updateBossBadge", () => {
      setTimeout(fetchBossBadge, 300);
    });

    fetchBossBadge();
    const interval = setInterval(fetchBossBadge, 10000); // เช็คทุก 10 วินาที

    return () => {
      isActive = false;
      clearInterval(interval);
      sub1.remove();
      sub2.remove();
    };
  }, [user?.id, user?.username, user?.role]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={THEME_BLUE} />
      </View>
    );
  }

  const canAccess = (pageFile: string) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    const allowed = user.allowed_pages;
    if (
      allowed === "ALL" ||
      (Array.isArray(allowed) && allowed.includes("ALL"))
    )
      return true;
    if (Array.isArray(allowed)) return allowed.includes(pageFile);
    return false;
  };

  const getDrawerOptions = (label: string, iconName: any, phpFile: string) => {
    const hasPermission = canAccess(phpFile);
    return {
      drawerLabel: label,
      title: label,
      // ไอคอนเปล่า — กล่องไอคอน/สีประจำหมวดวาดใน DrawerMenuItem (หน้าที่เปิดอยู่ได้สีขาว)
      drawerIcon: ({ color, size }: any) => <Ionicons name={iconName} size={size ?? 18} color={color} />,
      // ใช้ display: none ซ่อนถาวร ถ้าไม่มีสิทธิ์ (Logic ใน CustomDrawerContent จะเช็คตรงนี้)
      drawerItemStyle: hasPermission
        ? styles.drawerItem
        : { display: "none" as const },
      headerLeft: () => <DrawerToggleButton tintColor="white" />,
    };
  };

  return (
    <>
    {/* ไอคอนแถบสถานะสีขาวเป็นค่าตั้งต้นทุกหน้า — อยู่บนแถบหัวสีน้ำเงินเข้มเสมอ (หน้าไหนมี StatusBar ของตัวเองจะทับค่านี้) */}
    <StatusBar barStyle="light-content" />
    <Drawer
      // ✅ 2. ส่งค่า bossBadge เข้าไปใน Props ด้วย
      drawerContent={(props) => (
        <CustomDrawerContent
          {...props}
          immigrationBadge={immigrationBadge}
          bossBadge={bossBadge}
        />
      )}
      screenOptions={{
        headerShown: true,
        headerTintColor: "white",
        headerStyle: {
          backgroundColor: THEME_BLUE,
          elevation: 0,
          shadowOpacity: 0,
        },
        // แถบหัวทุกหน้าไล่สีแบบหน้า login (backgroundColor ด้านบนเป็นสีสำรอง)
        headerBackground: () => (
          <LinearGradient colors={THEME_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        ),
        headerTitleStyle: { fontWeight: "bold" },
        drawerType: "front",
        // มุมขวาโค้ง + พื้นหลังมืด (โทนน้ำเงินเข้ม) ตอนเปิด ให้ sidebar ลอยเด่นจากหน้าข้างหลัง
        overlayColor: "rgba(10,31,92,0.5)",
        drawerStyle: {
          width: "80%",
          borderTopRightRadius: 24,
          borderBottomRightRadius: 24,
          overflow: "hidden",
        },
      }}
    >
      {/* 1. หมวดหลักโปรไฟล์ */}
      <Drawer.Screen
        name="Profile"
        options={getDrawerOptions("หน้าหลัก", "home", "Profile.php")}
      />

      {/* 2. งานผู้บริหาร */}
      <Drawer.Screen
        name="BossDashboard"
        options={getDrawerOptions(
          "dashboard ผู้บริหาร",
          "stats-chart",
          "boss dashboard.php",
        )}
      />
      <Drawer.Screen
        name="BossCommand"
        options={getDrawerOptions(
          "สมุดลงงานผู้บริหาร",
          "create",
          "boss_task_form.php",
        )}
      />

      {/* 2. หมวดประชาสัมพันธ์ */}
      <Drawer.Screen
        name="news"
        options={getDrawerOptions(
          "ข่าวประชาสัมพันธ์",
          "newspaper",
          "Announcement.php",
        )}
      />

      {/* 3. หมวดรายงานการทำงาน (รวม 4 ฝ่าย) */}
      <Drawer.Screen
        name="write_report"
        options={getDrawerOptions("รายงานฝ่ายขาย", "create", "Report.php")}
      />
      <Drawer.Screen
        name="PurchaseReport"
        options={getDrawerOptions(
          "รายงานฝ่ายจัดซื้อ",
          "cart",
          "Report_Purchase.php",
        )}
      />
      <Drawer.Screen
        name="OnlinemarketingReport"
        options={getDrawerOptions(
          "รายงานฝ่ายการตลาดออนไลน์",
          "megaphone",
          "Online_Marketing_Report.php",
        )}
      />
      <Drawer.Screen
        name="AdminReport"
        options={getDrawerOptions(
          "รายงานฝ่ายธุรการ",
          "document-text",
          "report_admin.php",
        )}
      />

      {/* 4. หมวดประวัติรายงาน */}
      <Drawer.Screen
        name="history"
        options={getDrawerOptions("ประวัติงาน", "time", "StaffHistory.php")}
      />

      {/* 5. สรุปภาพรวมรายงานทุกฝ่าย */}
      <Drawer.Screen
        name="manager_dashboard"
        options={() => {
          // 1. สร้างเงื่อนไข: เป็น Admin/Manager หรือ เข้าถึงรายงานฝ่ายใดฝ่ายหนึ่งได้
          const hasDashboardAccess =
            user?.role === "admin" ||
            user?.role === "manager" ||
            canAccess("Report.php") || // มีสิทธิ์ฝ่ายขาย
            canAccess("Report_Purchase.php") || // มีสิทธิ์จัดซื้อ
            canAccess("Online_Marketing_Report.php") || // มีสิทธิ์การตลาด
            canAccess("report_admin.php"); // มีสิทธิ์ธุรการ

          // 2. ใช้ getDrawerOptions เพื่อเอาดีไซน์ แต่ Override ส่วนการแสดงผล (display)
          const baseOptions = getDrawerOptions(
            "ภาพรวม (Manager)",
            "stats-chart",
            "", // ไม่ต้องใส่ชื่อไฟล์ เพราะเราเช็คเองข้างบนแล้ว
          );

          return {
            ...baseOptions, // เอาดีไซน์เดิมมา
            drawerItemStyle: hasDashboardAccess
              ? styles.drawerItem // ถ้ามีสิทธิ์ ให้แสดง
              : { display: "none" }, // ถ้าไม่มี ให้ซ่อน
          };
        }}
      />
      <Drawer.Screen
        name="map_dashboard"
        options={getDrawerOptions(
          "แผนที่ติดตามรายงานฝ่ายขาย",
          "map",
          "MapDashboard.php",
        )}
      />

      {/* 6. หมวดบัญชี-การเงิน */}
      <Drawer.Screen
        name="CashFlow"
        options={getDrawerOptions(
          "บันทึกเงินเข้า-เงินออก",
          "cash",
          "CashFlow.php",
        )}
      />
      {/* 7. หมวดระบบยานพาหนะ */}
      <Drawer.Screen
        name="CarBooking"
        options={getDrawerOptions("จองรถ", "car", "CarBooking.php")}
      />
      <Drawer.Screen
        name="CarDashboard"
        options={getDrawerOptions(
          "ตารางการใช้รถ",
          "calendar",
          "CarDashboard.php",
        )}
      />
      <Drawer.Screen
        name="fm_dashboard"
        options={getDrawerOptions("จัดการงานขนส่ง", "bus", "fm_dashboard.php")}
      />
      <Drawer.Screen
        name="fm_jobs"
        options={getDrawerOptions(
          "ตารางงานขนส่ง",
          "calendar-number",
          "fm_jobs.php",
        )}
      />
      <Drawer.Screen
        name="alert_screen"
        options={getDrawerOptions(
          "แจ้งเตือน พ.ร.บ และ ประกัน",
          "alert",
          "vehicle_alerts.php",
        )}
      />
      {/* 🌟 เบี้ยเลี้ยงขนส่ง — เมนูหลัก มองเห็นได้ */}
      <Drawer.Screen
        name="fm_report_travel"
        options={getDrawerOptions(
          "เบี้ยเลี้ยงขนส่ง",
          "wallet-outline",
          "fm_report_travel.php",
        )}
      />
      {/* sub-screen ของเบี้ยเลี้ยงขนส่ง — เปิดจากปุ่มในหน้า fm_report_travel เอง ไม่โชว์ในเมนู */}
      <Drawer.Screen
        name="fm_report_travel_form"
        options={{ drawerItemStyle: { display: "none" }, headerTitle: "กรอกข้อมูลค่าเบี้ยเลี้ยง" }}
      />
      <Drawer.Screen
        name="fm_report_travel_view"
        options={{ drawerItemStyle: { display: "none" }, headerTitle: "ใบขออนุมัติเบิกจ่ายค่าเบี้ยเลี้ยง" }}
      />
      <Drawer.Screen
        name="DriverTasks"
        options={getDrawerOptions(
          "ใบงานจัดส่ง",
          "car-sport",
          "driver_tasks.php",
        )}
      />
      <Drawer.Screen
        name="DriverConfirmItems"
        options={{
          drawerItemStyle: { display: "none" }, // ซ่อนหน้ารายละเอียดไว้ไม่ให้โชว์เป็นปุ่มในเมนู
          headerTitle: "รายละเอียดการจัดส่ง",
        }}
      />
      <Drawer.Screen
        name="Immigration_dashboard"
        options={getDrawerOptions(
          "dashboard เข้าเมือง",
          "stats-chart",
          "Immigration_dashboard.php",
        )}
      />
      <Drawer.Screen
        name="Immigration_Report"
        options={getDrawerOptions(
          "สมุดลงงานเข้าเมือง",
          "create",
          "Immigration_Report.php",
        )}
      />
      <Drawer.Screen
        name="correspondence_dashboard"
        options={getDrawerOptions(
          "แดชบอร์ด/ลงรับ สารบรรณ",
          "documents",
          "dashboard_correspondence.php",
        )}
      />
      <Drawer.Screen
        name="correspondence_book"
        options={getDrawerOptions(
          "สมุดทะเบียนหนังสือ",
          "book",
          "correspondence_book.php",
        )}
      />
      {/* 8. แดชบอร์ดโครงการ (โมดูลใหม่ - หน้าตาเท่านั้น) */}
      <Drawer.Screen
        name="project_dashboard"
        options={getDrawerOptions(
          "แดชบอร์ดโครงการ",
          "briefcase",
          "project_dashboard.php", // TODO: ปรับชื่อไฟล์สิทธิ์ให้ตรงกับ backend จริง
        )}
      />
      {/* sub-screen ของแดชบอร์ดโครงการ — เปิดจากปุ่มลัดในหน้านั้นเอง ไม่โชว์ในเมนู */}
      <Drawer.Screen name="Estimatedashboard" options={{ drawerItemStyle: { display: "none" } }} />
      <Drawer.Screen name="checkcost" options={{ drawerItemStyle: { display: "none" } }} />
      <Drawer.Screen name="Guaranteeupdate" options={{ drawerItemStyle: { display: "none" } }} />
      <Drawer.Screen name="Checkincompleteproject" options={{ drawerItemStyle: { display: "none" } }} />
      {/* 9. หมวดบัญชี-การเงิน (โครงการ) */}
      <Drawer.Screen
        name="accounting_dashboard"
        options={getDrawerOptions(
          "แดชบอร์ดบัญชีลูกหนี้",
          "cash",
          "accounting_dashboard.php", // TODO: ปรับชื่อไฟล์สิทธิ์ให้ตรงกับ backend จริง
        )}
      />
      <Drawer.Screen name="projectfollowup" options={{ drawerItemStyle: { display: "none" } }} />
      <Drawer.Screen name="projectaccounting" options={{ drawerItemStyle: { display: "none" } }} />
      <Drawer.Screen name="CostCheckScreen" options={{ drawerItemStyle: { display: "none" } }} />
      {/* 10. หมวดเอกสารโครงการ */}
      <Drawer.Screen
        name="document_dashboard"
        options={getDrawerOptions(
          "เอกสาร PO/AX",
          "folder-open",
          "document_dashboard.php", // TODO: ปรับชื่อไฟล์สิทธิ์ให้ตรงกับ backend จริง
        )}
      />
      <Drawer.Screen name="submitdocument" options={{ drawerItemStyle: { display: "none" } }} />

      {/* หน้าที่ซ่อน */}
      <Drawer.Screen
        name="AdminDashboard"
        options={{ drawerItemStyle: { display: "none" } }}
      />
      {/* AdminDashboard เดิมซ่อนไว้ หรือถ้าจะใช้ให้เอาไปใส่ในหมวดภาพรวมได้ครับ */}
    </Drawer>
    </>
  );
}

// ------------------------------------------------------
// 3. Styles (ปรับปรุงให้สวยขึ้น)
// ------------------------------------------------------
const styles = StyleSheet.create({
  // ---- หัว sidebar (โปรไฟล์) ----
  headerWrapper: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  drawerHeader: {
    paddingBottom: 18,
    paddingHorizontal: 20,
    position: "relative",
  },
  circleDecoration: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  circleDecorationSmall: {
    position: "absolute",
    bottom: 34,
    right: 64,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  circleDecorationRing: {
    position: "absolute",
    top: 36,
    left: -34,
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 12,
    borderColor: "rgba(255,255,255,0.06)",
  },

  profileRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  avatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    padding: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  avatarContainer: {
    flex: 1,
    borderRadius: 33,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },

  greetingText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12.5,
    marginBottom: 1,
  },
  userName: {
    color: "white",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 50,
    alignSelf: "flex-start",
  },
  roleText: {
    color: "white",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  // แถบกระจกใต้โปรไฟล์: วันที่วันนี้ · ONE TJC
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 50,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerInfoText: { color: "white", fontSize: 11.5, fontWeight: "600" },
  headerInfoDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.6)" },

  // ---- กลุ่มเมนู ----
  menuGroup: { marginBottom: 6 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 18,
    marginTop: 14,
    marginBottom: 7,
  },
  sectionIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    fontSize: 11.5,
    color: "#64748b",
    fontWeight: "800",
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  sectionLine: { flex: 1, height: 1, backgroundColor: "#e2e8f0" },
  groupCard: {
    backgroundColor: "white",
    marginHorizontal: 12,
    borderRadius: 16,
    padding: 4,
    shadowColor: "#1e293b",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  // drawerItemStyle ของ Drawer.Screen (ใช้คู่กับ display: none ตอนไม่มีสิทธิ์) — แถวเมนูจริงวาดเองใน DrawerMenuItem
  drawerItem: { borderRadius: 12, marginHorizontal: 10, marginVertical: 2 },

  // ---- แถวเมนู (DrawerMenuItem) ----
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  menuItemPill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    overflow: "hidden",
  },
  menuItemPillFill: { flex: 1 },
  menuIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  menuItemLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: "#334155" },
  menuItemLabelActive: { color: "white", fontWeight: "800" },

  // ---- ท้าย sidebar ----
  drawerFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e8ecf4",
    backgroundColor: MENU_BG,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "white",
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fde2e2",
    shadowColor: "#ef4444",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  logoutIconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutText: {
    fontSize: 14,
    color: "#ef4444",
    fontWeight: "800",
  },
  versionText: {
    textAlign: "center",
    color: "#a0aec0",
    fontSize: 11,
    marginTop: 10,
  },
  // ป้าย New
  badgeContainer: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
});