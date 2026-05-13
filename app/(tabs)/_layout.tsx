// app/(tabs)/_layout.tsx

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DrawerContentScrollView,
  DrawerItem,
  DrawerToggleButton,
  useDrawerStatus,
} from "@react-navigation/drawer";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Drawer } from "expo-router/drawer";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_BASE, API_TASKS_URL } from "../../constants/config";
import { useAuth } from "../_layout";

// ------------------------------------------------------
// 1. กำหนดหมวดหมู่เมนู (จัดเรียงใหม่ตามความต้องการ)
// ------------------------------------------------------
const MENU_GROUPS = [
  {
    id: "profile_group",
    title: "หมวดหลักโปรไฟล์",
    items: ["Profile"],
  },
  {
    id: "Company Executive",
    title: "หมวดทีมผู้บริหาร",
    items: ["BossDashboard", "BossCommand"],
  },
  {
    id: "pr_group",
    title: "หมวดประชาสัมพันธ์",
    items: ["news"],
  },
  {
    id: "overview_group",
    title: "สรุปภาพรวมรายงานทุกฝ่าย",
    items: ["manager_dashboard", "map_dashboard"],
  },
  {
    id: "work_report_group",
    title: "หมวดรายงานการทำงาน",
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
    items: ["history"],
  },

  {
    id: "finance_group",
    title: "หมวดบัญชี-การเงิน",
    items: ["CashFlow"],
  },
  {
    id: "vehicle_group",
    title: "หมวดระบบยานพาหนะ",
    items: ["CarBooking", "CarDashboard"],
  },
  {
    id: "vehicle_groups",
    title: "ขนส่ง",
    items: ["fm_dashboard", "alert_screen"],
  },
  {
    id: "driver_group",
    title: "หมวดคนรถ (จัดส่ง)",
    items: ["DriverTasks", "DriverConfirmItems"],
  },
  {
    id: "immigration_groups",
    title: "งานเข้าเมือง",
    items: ["Immigration_dashboard", "Immigration_Report"],
  },
];

function CustomDrawerContent(props: any) {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const isDrawerOpen = useDrawerStatus();

  // State: Profile Data
  const [profile, setProfile] = useState({
    fullname: user?.fullname || "พนักงาน TJC",
    role: user?.role || "USER",
    avatar: user?.avatar || null,
  });
  const [timestamp, setTimestamp] = useState(new Date().getTime());

  // ... (useEffect และ fetchLatestProfile เหมือนเดิม) ...
  useEffect(() => {
    if (isDrawerOpen === "open" && user?.username) {
      fetchLatestProfile();
    }
  }, [isDrawerOpen]);

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

  // ------------------------------------------------------
  // 2. ฟังก์ชันเรนเดอร์กลุ่มเมนู (Render Helper)
  // ------------------------------------------------------
  const renderMenuGroups = () => {
    const { state, descriptors, navigation, immigrationBadge } = props;

    return MENU_GROUPS.map((group, groupIndex) => {
      // Filter routes that belong to this group
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
          {/* หัวข้อกลุ่ม (Section Header) */}
          <Text style={styles.sectionHeader}>{group.title}</Text>

          {visibleRoutes.map((route: any) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === state.routes.indexOf(route);

            return (
              <DrawerItem
                key={route.key}
                // ✅ แก้ไข: วาด Label ใหม่ให้มีป้ายแดง
                label={({ focused, color }) => {
                  const labelText =
                    options.drawerLabel || options.title || route.name;

                  // เช็คว่าเป็นเมนูไหน
                  const isImmigration = route.name === "Immigration_dashboard";
                  const isBoss = route.name === "BossDashboard";

                  // ✅ รับค่า bossBadge มาจาก props
                  const { immigrationBadge, bossBadge } = props;

                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flex: 1,
                      }}
                    >
                      <Text style={{ color, fontSize: 14, fontWeight: "500" }}>
                        {labelText}
                      </Text>

                      {/* ป้ายของงานเข้าเมือง (ของเดิม) - สีแดง */}
                      {isImmigration && immigrationBadge > 0 && (
                        <View style={styles.badgeContainer}>
                          <Text style={styles.badgeText}>New</Text>
                        </View>
                      )}

                      {/* ✅ ป้ายของผู้บริหาร/พนักงาน - สีน้ำเงิน (แยกสีกันจะได้ไม่งง) */}
                      {isBoss && bossBadge > 0 && (
                        <View
                          style={[
                            styles.badgeContainer,
                            { backgroundColor: "#ef4444" },
                          ]}
                        >
                          <Text style={styles.badgeText}>New</Text>
                        </View>
                      )}
                    </View>
                  );
                }}
                icon={({ color, size }) =>
                  options.drawerIcon
                    ? options.drawerIcon({ color, size, focused: isFocused })
                    : null
                }
                focused={isFocused}
                activeTintColor="#4e54c8"
                activeBackgroundColor="rgba(78, 84, 200, 0.1)"
                inactiveTintColor="#333"
                labelStyle={styles.drawerLabel}
                style={styles.drawerItem}
                onPress={() => {
                  navigation.navigate(route.name);
                }}
              />
            );
          })}

          {/* เส้นคั่น ยกเว้นกลุ่มสุดท้าย */}
          {groupIndex < MENU_GROUPS.length - 1 && (
            <View style={styles.divider} />
          )}
        </View>
      );
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={["#4e54c8", "#8f94fb"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.drawerHeader, { paddingTop: insets.top + 20 }]}
        >
          <View style={styles.circleDecoration} />
          <View style={styles.circleDecorationSmall} />

          <View style={styles.profileRow}>
            <View style={styles.avatarContainer}>
              {avatarSource ? (
                <Image source={avatarSource} style={styles.avatarImage} />
              ) : (
                <MaterialCommunityIcons
                  name="account"
                  size={32}
                  color="#4e54c8"
                />
              )}
            </View>
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text style={styles.greetingText}>สวัสดี,</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {profile.fullname}
              </Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>
                  {(profile.role || "USER").toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      <DrawerContentScrollView
        {...props}
        contentContainerStyle={{ paddingTop: 0 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ✅ เรียกใช้ฟังก์ชันแสดงเมนูแบบกลุ่ม */}
        {renderMenuGroups()}
      </DrawerContentScrollView>

      <View style={styles.drawerFooter}>
        <TouchableOpacity
          onPress={handleLogout}
          style={styles.logoutBtn}
          activeOpacity={0.8}
        >
          <View style={styles.logoutIconBg}>
            <Ionicons
              name="log-out"
              size={20}
              color="#ff4757"
              style={{ marginLeft: 2 }}
            />
          </View>
          <Text style={styles.logoutText}>ออกจากระบบ</Text>
        </TouchableOpacity>
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
        <ActivityIndicator size="large" color="#4e54c8" />
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
      drawerIcon: ({ color, focused }: any) => (
        <View
          style={[
            styles.menuIconContainer,
            { backgroundColor: focused ? "#4e54c8" : "#f0f2f5" },
          ]}
        >
          {/* ปรับสี Icon เมื่อ Active ให้เป็นสีขาว */}
          <Ionicons
            name={iconName}
            size={18}
            color={focused ? "white" : "#666"}
          />
        </View>
      ),
      // ใช้ display: none ซ่อนถาวร ถ้าไม่มีสิทธิ์ (Logic ใน CustomDrawerContent จะเช็คตรงนี้)
      drawerItemStyle: hasPermission
        ? styles.drawerItem
        : { display: "none" as const },
      headerLeft: () => <DrawerToggleButton tintColor="white" />,
    };
  };

  return (
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
          backgroundColor: "#4e54c8",
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTitleStyle: { fontWeight: "bold" },
        drawerType: "front",
        drawerStyle: {
          width: "80%",
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
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
        name="alert_screen"
        options={getDrawerOptions(
          "แจ้งเตือน พ.ร.บ และ ประกัน",
          "alert",
          "vehicle_alerts.php",
        )}
      />
      <Drawer.Screen
        name="DriverTasks"
        options={getDrawerOptions(
          "งานจัดส่งของฉัน",
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
      {/* หน้าที่ซ่อน */}
      <Drawer.Screen
        name="index"
        options={{ drawerItemStyle: { display: "none" }, headerShown: false }}
      />
      <Drawer.Screen
        name="AdminDashboard"
        options={{ drawerItemStyle: { display: "none" } }}
      />
      {/* AdminDashboard เดิมซ่อนไว้ หรือถ้าจะใช้ให้เอาไปใส่ในหมวดภาพรวมได้ครับ */}
    </Drawer>
  );
}

// ------------------------------------------------------
// 3. Styles (ปรับปรุงให้สวยขึ้น)
// ------------------------------------------------------
const styles = StyleSheet.create({
  headerWrapper: {
    borderBottomRightRadius: 0,
    overflow: "hidden",
    marginBottom: 0,
  },
  drawerHeader: {
    paddingBottom: 30,
    paddingHorizontal: 20,
    position: "relative",
  },
  circleDecoration: {
    position: "absolute",
    top: -30,
    right: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  circleDecorationSmall: {
    position: "absolute",
    bottom: 20,
    right: 40,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  profileRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatarImage: { width: 60, height: 60, borderRadius: 30 },

  greetingText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    marginBottom: 2,
  },
  userName: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 6,
  },
  roleBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  roleText: {
    color: "white",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  // Styles สำหรับ Group Menu
  menuGroup: { marginBottom: 5 },
  sectionHeader: {
    fontSize: 12,
    color: "#999",
    fontWeight: "700",
    marginLeft: 20,
    marginTop: 15,
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  drawerItem: { borderRadius: 12, marginHorizontal: 10, marginVertical: 2 },
  drawerLabel: { fontSize: 14, fontWeight: "500", marginLeft: -10 },

  menuIconContainer: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  divider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 5,
  },

  drawerFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    backgroundColor: "#fafafa",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff0f0",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffcfcf",
  },
  logoutIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ff4757",
    justifyContent: "center",
    alignItems: "center",
  },
  logoutText: {
    fontSize: 14,
    marginLeft: 12,
    color: "#ff4757",
    fontWeight: "bold",
  },
  versionText: {
    textAlign: "center",
    color: "#bbb",
    fontSize: 11,
    marginTop: 15,
  },
  // ✅ เพิ่มสไตล์สำหรับป้ายแดง New
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
