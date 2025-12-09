import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Alert, TouchableOpacity } from 'react-native';
import { useAuth } from '../_layout';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}) {
  return <Ionicons size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { user, signOut } = useAuth();

  // ✅ ฟังก์ชันเช็คสิทธิ์ (หัวใจสำคัญ)
  // รับชื่อไฟล์ PHP (ตามที่ตั้งใน Database) เพื่อเช็คว่า User มีสิทธิ์ไหม
  const canAccess = (pageFile: string) => {
    if (!user) return false;
    
    // 1. ถ้าเป็น Admin ให้ผ่านตลอด
    type UserRole = 'admin' | 'manager' | 'staff';

    // 2. ถ้า API ส่งมาว่า 'ALL' (สำหรับเคส Admin ที่จัดการผ่าน API)
    if (user.allowed_pages && user.allowed_pages.includes('ALL')) return true;

    // 3. เช็คว่าชื่อไฟล์นี้ อยู่ในรายการที่ได้รับอนุญาตไหม
    // ต้องแน่ใจว่า user.allowed_pages เป็น Array
    return Array.isArray(user.allowed_pages) && user.allowed_pages.includes(pageFile);
  };

  const handleLogout = () => {
    Alert.alert("ออกจากระบบ", "คุณต้องการออกจากระบบใช่หรือไม่?", [
        { text: "ยกเลิก", style: "cancel" },
        { text: "ออก", style: "destructive", onPress: () => signOut() }
    ]);
  };

  const LogoutButton = () => (
    <TouchableOpacity onPress={handleLogout} style={{ marginRight: 15 }}>
        <Ionicons name="log-out-outline" size={26} color="#ff4757" />
    </TouchableOpacity>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4e54c8',
        tabBarInactiveTintColor: '#888',
        headerShown: true,
        headerRight: () => <LogoutButton />,
        headerStyle: { backgroundColor: '#fff', shadowOpacity: 0, elevation: 0 },
        headerTitleStyle: { fontWeight: 'bold', color: '#2d3436' },
        tabBarStyle: { height: 65, paddingBottom: 10, paddingTop: 5 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }
      }}>

      {/* 1. หน้าหลัก (ผูกกับ Main.php) */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'โปรไฟล์',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
          // ✅ ผูกกับ Main.php เพื่อเช็คสิทธิ์ (ถ้าไม่มีสิทธิ์ก็จะมองไม่เห็น App เลย)
          href: canAccess('Profile.php') ? '/(tabs)/dashboard' : null,
        }}
      />
      {/* 2. เขียนรายงาน (ผูกกับ Report.php) */}
      <Tabs.Screen
        name="write_report"
        options={{  
          title: 'เขียนรายงาน',  
          tabBarIcon: ({ color }) => <TabBarIcon name="create" color={color} />,
          // ✅ เช็คสิทธิ์จากชื่อไฟล์
          href: canAccess('Report.php') ? '/(tabs)/write_report' : null,
        }}
      />

      {/* 3. ประวัติ (ผูกกับ StaffHistory.php) */}
      <Tabs.Screen
        name="history"
        options={{
          title: 'ประวัติ',
          tabBarIcon: ({ color }) => <TabBarIcon name="time" color={color} />,
          // ✅ เช็คสิทธิ์จากชื่อไฟล์
          href: canAccess('StaffHistory.php') ? '/(tabs)/history' : null,
        }}
      />

      {/* 4. แผนที่ (ผูกกับ MapDashboard.php) */}
      <Tabs.Screen
        name="map_dashboard"
        options={{
          title: 'แผนที่',
          tabBarIcon: ({ color }) => <TabBarIcon name="map" color={color} />,
          // ✅ เช็คสิทธิ์จากชื่อไฟล์
          href: canAccess('MapDashboard.php') ? '/(tabs)/map_dashboard' : null,
        }}
      />

      {/* 5. ผู้บริหาร (ผูกกับ Dashboard.php) */}
      <Tabs.Screen
        name="manager_dashboard"
        options={{
          title: 'ผู้บริหาร',
          tabBarIcon: ({ color }) => <TabBarIcon name="stats-chart" color={color} />,
          // ✅ เช็คสิทธิ์จากชื่อไฟล์
          href: canAccess('Dashboard.php') ? '/(tabs)/manager_dashboard' : null,
        }}
      />

      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}