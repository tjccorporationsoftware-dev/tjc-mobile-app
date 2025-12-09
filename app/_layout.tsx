import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Stack, useRouter, useSegments } from 'expo-router';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { API_BASE } from '../constants/config';

// 1. กำหนดหน้าตาข้อมูล User (แก้ไข Type สมบูรณ์)
export interface UserData {
  id: string | number; // ID ที่ส่งมาจาก API
  fullname: string;
  // ✅ แก้ไข: เพิ่ม 'admin' เพื่อแก้ Error TS2367
  role: 'admin' | 'manager' | 'staff' | string;
  username: string;
  // ✅ เพิ่ม: ข้อมูลใหม่ที่ API ส่งมา
  avatar: string;
  allowed_pages: string[] | string; // Array ของชื่อไฟล์ หรือ string 'ALL'
}

// 2. สร้าง Context
interface AuthContextType {
  user: UserData | null;
  signIn: (user: string, pass: string) => Promise<boolean>;
  signOut: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// 3. Hook สำหรับให้หน้าอื่นเรียกใช้
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// 4. Provider ตัวจัดการระบบล็อกอิน (แก้ไข signIn)
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ตรวจสอบข้อมูลเก่าตอนเปิดแอป
  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        if (storedUser) {
          // ✅ ต้องแน่ใจว่าโหลดข้อมูลเก่ามาในรูปแบบ UserData ที่สมบูรณ์แล้ว
          setUser(JSON.parse(storedUser));
        }
      } catch (e) {
        console.error("Load user error:", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  // ฟังก์ชัน Login
  const signIn = async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await axios.post(`${API_BASE}/api_mobile.php?action=login`, {
        username,
        password
      });

      if (res.data.status === 'success') {
        // ✅ ดึงข้อมูลใหม่ทั้งหมดจาก API Response
        const userData: UserData = {
          id: res.data.id,
          fullname: res.data.fullname,
          role: res.data.role,
          username: username, // ใช้จาก argument
          avatar: res.data.avatar || '',
          allowed_pages: res.data.allowed_pages || [], // ส่ง [] ถ้าไม่มี
        };
        
        setUser(userData);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login API Error:", error);
      return false;
    }
  };

  // ฟังก์ชัน Logout
  const signOut = async () => {
    setUser(null);
    await AsyncStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

// 5. ส่วนจัดการเปลี่ยนหน้า (Navigation Logic)
function InitialLayout() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
      // รอให้ Layout mount เสร็จสมบูรณ์
      setTimeout(() => setIsReady(true), 100);
  }, []);

  useEffect(() => {
    if (isLoading || !isReady) return;

    const inTabsGroup = segments[0] === '(tabs)';

    if (!user && inTabsGroup) {
      // ถ้าไม่มี User แต่อยู่หน้าข้างใน -> เตะออกไปหน้า Login
      router.replace('/');
    } else if (user && segments[0] !== '(tabs)') {
      // ถ้ามี User แล้ว -> พาไปหน้า Dashboard
      router.replace('/(tabs)/dashboard');
    }
  }, [user, segments, isLoading, isReady]);

  if (isLoading) {
    return (
      <View style={{flex:1, justifyContent:'center', alignItems:'center'}}>
        <ActivityIndicator size="large" color="#4e54c8"/>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" /> 
      <Stack.Screen name="(tabs)" /> 
    </Stack>
  );
}

// 6. ส่งออก RootLayout (รวมทุกอย่างเข้าด้วยกัน)
export default function RootLayout() {
  return (
    <AuthProvider>
      <InitialLayout />
    </AuthProvider>
  );
}