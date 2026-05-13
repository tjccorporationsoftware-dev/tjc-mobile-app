import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { Stack, useRouter, useSegments } from "expo-router";
import React, { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { API_BASE } from "../constants/config";

// ------------------------------------------------------
// 1. ส่วนจัดการ Auth (รวมไว้ในนี้เลย ไม่ต้องแยกไฟล์)
// ------------------------------------------------------

export interface UserData {
  id: string | number;
  fullname: string;
  role: "admin" | "manager" | "staff" | string;
  username: string;
  avatar: string;
  allowed_pages: string[] | string;
}

interface AuthContextType {
  user: UserData | null;
  signIn: (user: string, pass: string) => Promise<boolean>;
  signOut: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Hook สำหรับให้หน้าอื่นเรียกใช้
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedUser = await AsyncStorage.getItem("user");
        if (storedUser) setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Load user error:", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  const signIn = async (
    username: string,
    password: string,
  ): Promise<boolean> => {
    try {
      // 1. สร้าง FormData สำหรับส่งไปให้ PHP ($_POST)
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);

      // 2. ยิง API พร้อมกำหนด Header ว่าส่งเป็น form-data
      const res = await axios.post(
        `${API_BASE}/api_mobile.php?action=login`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      console.log("👉 Server ตอบกลับ:", res.data);

      if (res.data.status === "success") {
        const userData: UserData = {
          id: res.data.id,
          fullname: res.data.fullname,
          role: res.data.role,
          username: username,
          avatar: res.data.avatar || "",
          allowed_pages: res.data.allowed_pages || [],
        };
        setUser(userData);
        await AsyncStorage.setItem("user", JSON.stringify(userData));
        return true;
      }
      return false;
    } catch (error: any) {
      console.error(
        "❌ Login API Error:",
        error.response ? error.response.data : error.message,
      );
      return false;
    }
  };

  const signOut = async () => {
    setUser(null);
    await AsyncStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

// ------------------------------------------------------
// 2. ส่วนจัดการ Navigation (Layout)
// ------------------------------------------------------

function InitialLayout() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsReady(true), 100);
  }, []);

  useEffect(() => {
    if (isLoading || !isReady) return;

    const inTabsGroup = segments[0] === "(tabs)";

    const atLoginPage =
      (segments as string[]).length === 0 ||
      (segments as string[])[0] === "index";

    if (!user && inTabsGroup) {
      // 1. ถ้าไม่มี User แต่อยู่หน้าข้างใน -> เตะออกไปหน้า Login
      router.replace("/");
    } else if (user && atLoginPage) {
      // ✅ [ปรับแก้ตรงนี้] ไม่ว่า Role ไหน ก็ให้ไปหน้า news ทันที
      router.replace("/(tabs)/news");
    }
  }, [user, segments, isLoading, isReady]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#4e54c8" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="history" options={{ headerShown: false }} />
    </Stack>
  );
}

// 3. ส่งออก RootLayout
export default function RootLayout() {
  return (
    <AuthProvider>
      <InitialLayout />
    </AuthProvider>
  );
}
