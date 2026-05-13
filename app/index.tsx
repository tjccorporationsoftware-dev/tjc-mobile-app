import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useAuth } from "./_layout";

const { width, height } = Dimensions.get("window");

// 🎨 Refined Ultra Premium Palette
const COLORS = {
  midnightBlue: "#020c1b",
  deepOcean: "#0a192f",
  primaryBlue: "#0047AB",
  vividBlue: "#1e88e5",
  cyanGlow: "#64ffda",

  // Glassmorphism - Refined
  glassBg: "rgba(255, 255, 255, 0.88)", // เพิ่มความทึบอีกนิดให้ตัวหนังสือชัดขึ้น
  glassBorderTop: "rgba(255, 255, 255, 0.6)", // ขอบบนสว่างจัด (แสงกระทบ)
  glassBorderSide: "rgba(255, 255, 255, 0.25)", // ขอบข้างจางๆ
  inputBg: "rgba(235, 240, 245, 0.6)", // พื้นหลัง input โปร่งขึ้น

  textMain: "#1e293b", // สีเข้มขึ้นเล็กน้อยเพื่อความชัด
  textSoft: "#64748b",
  white: "#FFFFFF",
};

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { signIn } = useAuth();
  const router = useRouter();

  // --- Animation (ชุดเดิม) ---
  const shape1TY = useSharedValue(0);
  const shape1TX = useSharedValue(0);
  const shape2TY = useSharedValue(0);
  const shape2TX = useSharedValue(0);
  const glowOpacity = useSharedValue(0.3);
  const glowScale = useSharedValue(1.2);

  useEffect(() => {
    const config = { duration: 6000, easing: Easing.inOut(Easing.sin) };
    shape1TY.value = withRepeat(
      withSequence(withTiming(-40, config), withTiming(0, config)),
      -1,
      true,
    );
    shape1TX.value = withRepeat(
      withSequence(withTiming(20, config), withTiming(0, config)),
      -1,
      true,
    );
    shape2TY.value = withRepeat(
      withSequence(
        withTiming(50, { ...config, duration: 8000 }),
        withTiming(0, { ...config, duration: 8000 }),
      ),
      -1,
      true,
    );
    shape2TX.value = withRepeat(
      withSequence(
        withTiming(-30, { ...config, duration: 8000 }),
        withTiming(0, { ...config, duration: 8000 }),
      ),
      -1,
      true,
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 3000 }),
        withTiming(0.2, { duration: 3000 }),
      ),
      -1,
      true,
    );
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.35, { duration: 3000 }),
        withTiming(1.15, { duration: 3000 }),
      ),
      -1,
      true,
    );
  }, []);

  const animatedShape1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: shape1TY.value }, { translateX: shape1TX.value }],
  }));
  const animatedShape2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: shape2TY.value }, { translateX: shape2TX.value }],
  }));
  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert("แจ้งเตือน", "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
      return;
    }
    setLoading(true);
    try {
      console.log("กำลังส่งข้อมูลไปที่ signIn:", username, password); // <--- เพิ่มบรรทัดนี้

      const success = await signIn(username, password);

      console.log("ผลลัพธ์จาก signIn:", success); // <--- เพิ่มบรรทัดนี้

      if (success) {
        router.replace("/(tabs)/news");
      } else {
        Alert.alert("เข้าสู่ระบบไม่สำเร็จ", "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      }
    } catch (error) {
      console.log("เกิด Error ใน handleLogin:", error); // <--- เพิ่มบรรทัดนี้
      Alert.alert("Error", "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />

      {/* Background Gradients & Shapes */}
      <LinearGradient
        colors={[COLORS.midnightBlue, COLORS.deepOcean, COLORS.primaryBlue]}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 0.9 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        entering={FadeInDown.delay(100).duration(1500)}
        style={[
          styles.bgShapeWrapper,
          { top: -120, right: -80, width: 450, height: 450, borderRadius: 225 },
          animatedShape1Style,
        ]}
      >
        <LinearGradient
          colors={[COLORS.vividBlue, COLORS.midnightBlue]}
          style={styles.bgShape}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
        />
      </Animated.View>
      <Animated.View
        entering={FadeInDown.delay(300).duration(1500)}
        style={[
          styles.bgShapeWrapper,
          {
            bottom: -80,
            left: -120,
            width: 400,
            height: 400,
            borderRadius: 200,
            opacity: 0.12,
          },
          animatedShape2Style,
        ]}
      >
        <LinearGradient
          colors={[COLORS.cyanGlow, COLORS.primaryBlue]}
          style={styles.bgShape}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.contentContainer}>
          {/* Header Section */}
          <View style={styles.headerSection}>
            <Animated.View
              entering={FadeInDown.delay(200).duration(1000).springify()}
              style={styles.logoContainer}
            >
              <Animated.View style={[styles.logoGlowBase, animatedGlowStyle]} />
              <View style={styles.logoCircle}>
                <Image
                  source={require("../assets/images/favicon2.png")}
                  style={styles.logoImage}
                />
              </View>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(400).duration(1000).springify()}
              style={{ alignItems: "center", marginTop: 28 }}
            >
              <Text style={styles.appName}>TJC GROUP</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 10,
                  opacity: 0.8,
                }}
              >
                <View style={styles.subtitleDash} />
                <Text style={styles.appSubtitle}>
                  Enterprise Management System
                </Text>
                <View style={styles.subtitleDash} />
              </View>
            </Animated.View>
          </View>

          {/* Glass Form Card (Refined) */}
          <Animated.View
            entering={FadeInUp.delay(600).duration(1000).springify()}
            style={styles.glassFormCard}
          >
            <View style={{ marginBottom: 32, alignItems: "center" }}>
              <Text style={styles.welcomeText}>ยินดีต้อนรับ</Text>
              <Text style={styles.instructionText}>
                เข้าสู่ระบบเพื่อเริ่มต้นใช้งาน
              </Text>
            </View>

            {/* Inputs (Refined) */}
            <View style={styles.inputWrapper}>
              <View style={styles.glassInputContainer}>
                <View style={styles.iconBox}>
                  {/* ใช้ Filled Icon เพื่อความหนักแน่น */}
                  <Ionicons
                    name="person"
                    size={22}
                    color={COLORS.primaryBlue}
                  />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="ชื่อผู้ใช้ (Username)"
                  placeholderTextColor={COLORS.textSoft}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  selectionColor={COLORS.primaryBlue}
                />
              </View>
            </View>

            <View style={styles.inputWrapper}>
              <View style={styles.glassInputContainer}>
                <View style={styles.iconBox}>
                  <Ionicons
                    name="lock-closed"
                    size={22}
                    color={COLORS.primaryBlue}
                  />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="รหัสผ่าน (Password)"
                  placeholderTextColor={COLORS.textSoft}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  selectionColor={COLORS.primaryBlue}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? "eye-off" : "eye"}
                    size={22}
                    color={COLORS.textSoft}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Login Button (Refined) */}
            <View style={{ marginTop: 24 }}>
              <TouchableOpacity
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
                style={styles.loginBtnShadow}
              >
                <LinearGradient
                  colors={[COLORS.vividBlue, COLORS.primaryBlue]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }} // ปรับองศาไล่สี
                  style={styles.loginBtn}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.loginBtnText}>เข้าสู่ระบบ</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                © 2024 TJC Engineering Service Co., Ltd.
              </Text>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.midnightBlue },
  bgShapeWrapper: { position: "absolute", opacity: 0.2 },
  bgShape: { width: "100%", height: "100%", borderRadius: 999 },
  contentContainer: { flex: 1, justifyContent: "space-between" },

  // --- Header ---
  headerSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 40,
  },
  logoContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  logoGlowBase: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.vividBlue,
    opacity: 0.3,
    filter: "blur(20px)", // (Note: filter blur works on some Expo versions, if not, opacity handles it)
  },
  logoCircle: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
    shadowColor: COLORS.cyanGlow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 25,
    elevation: 25,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
  },
  logoImage: { width: "100%", height: "100%", resizeMode: "contain" },
  appName: {
    fontSize: 38,
    fontWeight: "900",
    color: "white",
    letterSpacing: 3,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  subtitleDash: {
    height: 1,
    width: 24,
    backgroundColor: COLORS.cyanGlow,
    marginHorizontal: 10,
  },
  appSubtitle: {
    fontSize: 13,
    color: COLORS.cyanGlow,
    fontWeight: "600",
    letterSpacing: 1.2,
  },

  // --- Refined Glass Form Card ---
  glassFormCard: {
    backgroundColor: COLORS.glassBg,
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    // เพิ่ม Padding ให้ดูโปร่งขึ้น
    paddingHorizontal: 38,
    paddingTop: 48,
    paddingBottom: Platform.OS === "ios" ? 48 : 32,
    width: width,
    // เทคนิคขอบแสง: ขอบบนสว่างสุด ขอบข้างจางๆ
    borderTopWidth: 1.5,
    borderTopColor: COLORS.glassBorderTop,
    borderLeftWidth: 0.8,
    borderLeftColor: COLORS.glassBorderSide,
    borderRightWidth: 0.8,
    borderRightColor: COLORS.glassBorderSide,
    // เงาที่นุ่มนวลขึ้น
    shadowColor: COLORS.deepOcean,
    shadowOffset: { width: 0, height: -15 },
    shadowOpacity: 0.2,
    shadowRadius: 35,
    elevation: 35,
    overflow: "hidden",
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.textMain,
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  instructionText: {
    fontSize: 15,
    color: COLORS.textSoft,
    textAlign: "center",
    fontWeight: "500",
    lineHeight: 22,
  },

  // --- Refined Inputs ---
  inputWrapper: { marginBottom: 22 },
  glassInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
    borderRadius: 22,
    height: 66, // สูงขึ้นนิดหน่อย
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    // เงาน้อยๆ ให้ดูลอยนิดเดียว
    shadowColor: COLORS.primaryBlue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
  },
  iconBox: {
    width: 64,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.04)",
  },
  input: {
    flex: 1,
    height: "100%",
    fontSize: 17,
    color: COLORS.textMain,
    fontWeight: "600",
    paddingHorizontal: 18,
  },
  eyeBtn: { paddingHorizontal: 22, height: "100%", justifyContent: "center" },

  // --- Refined Button ---
  loginBtnShadow: {
    shadowColor: COLORS.vividBlue,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 18,
    borderRadius: 34,
  },
  loginBtn: {
    height: 68,
    borderRadius: 34,
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.35)", // ขอบแสงด้านบนปุ่ม
  },
  loginBtnText: {
    color: "white",
    fontSize: 19,
    fontWeight: "bold",
    letterSpacing: 2,
  }, // เพิ่มขนาดและระยะห่าง
  footer: { marginTop: 38, alignItems: "center" },
  footerText: {
    color: COLORS.textSoft,
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.7,
  },
});
