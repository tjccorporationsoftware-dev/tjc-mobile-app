import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import { useAuth } from "./_layout";

// ⚠️ หน้านี้ใช้ Animated ของ react-native (useNativeDriver) ทั้งหมด — ห้ามใช้ react-native-reanimated
//    บน iOS New Architecture (Expo Go) reanimated commit view tree ใหม่ทุกเฟรมให้อนิเมชั่นที่วนไม่หยุด และ
//    layout animation (entering/exiting) ทำให้มันดักแก้ mutation ทั้งจอ -> ชนกับจังหวะที่ช่องกรอกได้โฟกัส
//    อาการ: กดช่อง user/password แล้วคีย์บอร์ดขึ้นมาครึ่งเดียวแว้บเดียวแล้วหุบ ต้องกดหลายครั้ง
//    native driver ขยับ view ฝั่ง native ตรงๆ ไม่ commit ทุกเฟรม

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
type EasingFn = (value: number) => number;

// 🎨 โทนน้ำเงินไล่ฟ้า
const C = {
  navy: "#0a1f5c",
  blueDeep: "#1e3a8a",
  blue: "#1d4ed8",
  blueMid: "#2563eb",
  sky: "#0ea5e9",
  skyLight: "#38bdf8",
  skyPale: "#e0f2fe",
  ink: "#0f172a",
  inkSoft: "#64748b",
  line: "#e2e8f0",
  fieldBg: "#f8fafc",
};

// ฟองแสงที่ลอยขึ้นช้าๆ ในส่วนหัว — ตำแหน่ง/ขนาดคงที่ (ไม่สุ่มใหม่ทุก render)
const BUBBLES: { left: DimensionValue; size: number; duration: number; delay: number }[] = [
  { left: "8%", size: 10, duration: 9000, delay: 0 },
  { left: "22%", size: 6, duration: 7000, delay: 1800 },
  { left: "38%", size: 14, duration: 11000, delay: 900 },
  { left: "55%", size: 8, duration: 8000, delay: 3000 },
  { left: "70%", size: 12, duration: 10000, delay: 500 },
  { left: "84%", size: 7, duration: 7500, delay: 2400 },
  { left: "92%", size: 10, duration: 9500, delay: 4000 },
];

// ค่า 0 -> 1 วนไม่รู้จบ (reverse = 0 -> 1 -> 0 · pause = พักท้ายรอบ) — native driver
function useLoop(duration: number, opts: { delay?: number; easing?: EasingFn; reverse?: boolean; pause?: number } = {}) {
  const { delay = 0, easing = Easing.linear, reverse = false, pause = 0 } = opts;
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const forward = Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true });
    const steps: Animated.CompositeAnimation[] = [forward];
    if (reverse) steps.push(Animated.timing(v, { toValue: 0, duration, easing, useNativeDriver: true }));
    if (pause) steps.push(Animated.delay(pause));
    const loop = Animated.loop(steps.length === 1 ? forward : Animated.sequence(steps));
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

// เข้าฉากครั้งเดียวตอนเปิด: จางเข้า + เลื่อนจาก fromY มาที่เดิม — คืน style คงที่ (ไม่สร้างใหม่ทุก render)
function useEnter(delay: number, duration: number, fromY: number) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useMemo(
    () => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [fromY, 0] }) }] }),
    [v, fromY],
  );
}

function FadeUp({ delay = 0, duration = 400, fromY = 12, style, children }: { delay?: number; duration?: number; fromY?: number; style?: any; children: ReactNode }) {
  const enter = useEnter(delay, duration, fromY);
  return <Animated.View style={[style, enter]}>{children}</Animated.View>;
}

// แสงฟุ้งทรงกลม (radial gradient จางออกถึงขอบ) — ไม่เป็นวงขอบแข็ง
const Glow = React.memo(function Glow({ id, size, color, opacity }: { id: string; size: number; color: string; opacity: number }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.45} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
});

function Bubble({ left, size, duration, delay }: (typeof BUBBLES)[number]) {
  const t = useLoop(duration, { delay });
  const style = useMemo(
    () => ({
      left,
      width: size,
      height: size,
      borderRadius: size / 2,
      opacity: t.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.6, 0.45, 0] }),
      transform: [
        { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -320] }) },
        { translateX: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 10, 0, -10, 0] }) },
      ],
    }),
    [t, left, size],
  );
  return <Animated.View style={[styles.bubble, style]} />;
}

// ก้อนแสงฟ้าฟุ้งใหญ่ๆ ลอยไปมาช้าๆ เป็นพื้นหลัง
function Blob({ id, top, left, right, size, color, opacity, dx, dy, duration }: {
  id: string; top: number; left?: number; right?: number; size: number; color: string; opacity: number; dx: number; dy: number; duration: number;
}) {
  const t = useLoop(duration, { easing: Easing.inOut(Easing.sin), reverse: true });
  const style = useMemo(
    () => ({
      top,
      left,
      right,
      transform: [
        { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
        { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
      ],
    }),
    [t, top, left, right, dx, dy],
  );
  return (
    <Animated.View pointerEvents="none" style={[styles.blob, style]}>
      <Glow id={id} size={size} color={color} opacity={opacity} />
    </Animated.View>
  );
}

// วงแสงที่ขยายออกจากโลโก้แล้วจางหาย (เหมือนคลื่นเรดาร์)
function Ripple({ delay }: { delay: number }) {
  const t = useLoop(3000, { delay, easing: Easing.out(Easing.quad) });
  const style = useMemo(
    () => ({
      opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
      transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
    }),
    [t],
  );
  return <Animated.View style={[styles.ripple, style]} />;
}

// กดแล้วยุบลงนิดแล้วคืนรูป
function PressScale({ onPress, disabled, style, children }: { onPress: () => void; disabled?: boolean; style?: any; children: ReactNode }) {
  const s = useRef(new Animated.Value(1)).current;
  const springTo = (toValue: number) =>
    Animated.spring(s, { toValue, speed: 40, bounciness: toValue < 1 ? 0 : 8, useNativeDriver: true }).start();
  const aStyle = useMemo(() => ({ transform: [{ scale: s }] }), [s]);
  return (
    <Pressable onPress={onPress} disabled={disabled} onPressIn={() => springTo(0.97)} onPressOut={() => springTo(1)}>
      <Animated.View style={[style, aStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

// ====================================================================
// อนิเมชั่นตอนกดเข้าสู่ระบบ (ทับเต็มจอ)
//  loading : วงแหวนไล่สีหมุนสวนกัน 2 ชั้น + จุดโคจร + โลโก้หายใจเข้าออก + จุด ... + แถบวิ่ง
//  success : วงแหวนขาววาดรอบโลโก้จนครบ + ติ๊กถูกเด้งขึ้น + ประกายแตกกระจาย + "ยินดีต้อนรับ ชื่อ"
//  idle    : (รหัสผิด) ค่อยๆ จางหายแล้วเรียก onHidden ให้ถอดออก
// ====================================================================

const STAGE = 240; // พื้นที่วงแหวนรอบโลโก้

function useSpin(duration: number, reverse?: boolean) {
  const t = useLoop(duration);
  return useMemo(
    () => ({ transform: [{ rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", reverse ? "-360deg" : "360deg"] }) }] }),
    [t, reverse],
  );
}

// วงแหวนไล่สีบางส่วนที่หมุนรอบโลโก้ (dash = สัดส่วนความยาวเส้นต่อเส้นรอบวง)
function SpinnerArc({ id, size, stroke, dash, duration, reverse, colors }: {
  id: string; size: number; stroke: number; dash: number; duration: number; reverse?: boolean; colors: [string, string];
}) {
  const spin = useSpin(duration, reverse);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Animated.View style={[styles.stageLayer, { width: size, height: size }, spin]}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c * dash} ${c}`}
        />
      </Svg>
    </Animated.View>
  );
}

// จุดแสง 3 ดวงโคจรรอบโลโก้
function OrbitDots({ radius, duration }: { radius: number; duration: number }) {
  const spin = useSpin(duration);
  const size = radius * 2;
  return (
    <Animated.View style={[styles.stageLayer, { width: size, height: size }, spin]}>
      {[0, 120, 240].map((deg, i) => {
        const a = (deg * Math.PI) / 180;
        const d = [8, 6, 5][i];
        return (
          <View
            key={deg}
            style={[
              styles.orbitDot,
              { width: d, height: d, borderRadius: d / 2, left: radius + Math.cos(a) * radius - d / 2, top: radius + Math.sin(a) * radius - d / 2 },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

// วงแหวนขาวที่วาดเส้นรอบโลโก้จนครบวง (ตอนสำเร็จ) — strokeDashoffset เป็น prop ของ SVG ใช้ native driver ไม่ได้
function SuccessRing({ size }: { size: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(p, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const offset = useMemo(() => p.interpolate({ inputRange: [0, 1], outputRange: [c, 0] }), [p, c]);
  return (
    <View style={[styles.stageLayer, { width: size, height: size, transform: [{ rotate: "-90deg" }] }]}>
      <Svg width={size} height={size}>
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#ffffff"
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
        />
      </Svg>
    </View>
  );
}

// ประกายแสงแตกกระจายออกจากโลโก้ (ตอนสำเร็จ)
const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  angle: (i / 14) * Math.PI * 2,
  dist: 105 + (i % 3) * 16,
  size: 5 + (i % 3) * 2,
  color: i % 2 ? "#e0f2fe" : "#7dd3fc",
  delay: 250 + (i % 4) * 45,
}));
function Particle({ angle, dist, size, color, delay }: { angle: number; dist: number; size: number; color: string; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 950, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color,
      opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
      transform: [
        { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * dist] }) },
        { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * dist] }) },
        { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1.2, 0.5] }) },
      ],
    }),
    [t, angle, dist, size, color],
  );
  return <Animated.View style={[styles.particle, style]} />;
}

// จุด ... ท้ายข้อความ กระพริบไล่กัน
function LoadingDot({ delay }: { delay: number }) {
  const t = useLoop(480, { delay, easing: Easing.inOut(Easing.quad), reverse: true });
  const style = useMemo(
    () => ({
      opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
      transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
    }),
    [t],
  );
  return <Animated.View style={[styles.loadingDot, style]} />;
}

// แถบโหลดแบบวิ่งไปมา (ไม่รู้ % จริง)
function IndeterminateBar() {
  const t = useLoop(1300, { easing: Easing.inOut(Easing.quad) });
  const style = useMemo(() => ({ transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-90, 210] }) }] }), [t]);
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, style]}>
        <LinearGradient colors={["rgba(255,255,255,0)", "#ffffff", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

function LoginOverlay({ phase, welcomeName, onHidden }: { phase: "idle" | "loading" | "success"; welcomeName: string; onHidden: () => void }) {
  const fade = useRef(new Animated.Value(0)).current; // ทั้งฉาก
  const done = useRef(new Animated.Value(0)).current; // 0 = กำลังรอ · 1 = สำเร็จ
  const pop = useRef(new Animated.Value(0)).current; // โลโก้เด้งตอนสำเร็จ
  const badge = useRef(new Animated.Value(0)).current; // ติ๊กถูก
  const breathe = useLoop(1400, { easing: Easing.inOut(Easing.sin), reverse: true });

  useEffect(() => {
    if (phase === "loading") {
      done.setValue(0);
      pop.setValue(0);
      badge.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    } else if (phase === "success") {
      Animated.timing(done, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      Animated.sequence([
        Animated.timing(pop, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 0, friction: 4, tension: 160, useNativeDriver: true }),
      ]).start();
      Animated.sequence([Animated.delay(420), Animated.spring(badge, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true })]).start();
    } else {
      // รหัสผิด -> ค่อยๆ จางหาย แล้วค่อยถอดออก (ถ้ากดเข้าสู่ระบบใหม่ระหว่างจาง finished = false ไม่ถอด)
      Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onHidden();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const s = useMemo(
    () => ({
      overlay: { opacity: fade },
      loadingLayer: { width: STAGE, height: STAGE, opacity: done.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
      logo: {
        transform: [
          {
            scale: Animated.add(
              breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }),
              pop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }),
            ),
          },
        ],
      },
      badge: { transform: [{ scale: badge }] },
    }),
    [fade, done, breathe, pop, badge],
  );

  return (
    <Animated.View pointerEvents={phase === "idle" ? "none" : "auto"} style={[styles.overlay, s.overlay]}>
      <LinearGradient
        colors={["rgba(10,31,92,0.97)", "rgba(29,78,216,0.95)", "rgba(14,165,233,0.94)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.stage}>
        <View pointerEvents="none" style={styles.stageGlow}>
          <Glow id="ovGlow" size={340} color="#bae6fd" opacity={phase === "success" ? 0.7 : 0.5} />
        </View>

        {/* ชั้นตอนรอ — จางหายตอนสำเร็จ */}
        <Animated.View style={[styles.stageLayer, s.loadingLayer]}>
          <Ripple delay={0} />
          <Ripple delay={1000} />
          <SpinnerArc id="arcA" size={196} stroke={5} dash={0.32} duration={1100} colors={["#ffffff", "#7dd3fc"]} />
          <SpinnerArc id="arcB" size={172} stroke={3} dash={0.18} duration={1700} reverse colors={["#38bdf8", "rgba(255,255,255,0.4)"]} />
          <OrbitDots radius={110} duration={2600} />
        </Animated.View>

        {/* ชั้นตอนสำเร็จ — mount ตอนสำเร็จ อนิเมชั่นข้างในเริ่มเล่นทันที */}
        {phase === "success" && (
          <View style={[styles.stageLayer, { width: STAGE, height: STAGE }]}>
            <SuccessRing size={176} />
            {PARTICLES.map((p, i) => (
              <Particle key={i} {...p} />
            ))}
          </View>
        )}

        <Animated.View style={[styles.ovLogo, s.logo]}>
          <Image source={require("../assets/images/favicon2.png")} style={styles.logoImage} />
        </Animated.View>

        {phase === "success" && (
          <Animated.View style={[styles.checkBadge, s.badge]}>
            <LinearGradient colors={["#34d399", "#059669"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.checkBadgeFill}>
              <Ionicons name="checkmark" size={26} color="#fff" />
            </LinearGradient>
          </Animated.View>
        )}
      </View>

      {phase === "success" ? (
        <FadeUp key="t-done" delay={300} duration={450} style={styles.ovTextBox}>
          <Text style={styles.ovTitle}>เข้าสู่ระบบสำเร็จ</Text>
          <Text style={styles.ovSub} numberOfLines={1}>
            ยินดีต้อนรับ{welcomeName ? ` คุณ${welcomeName}` : ""}
          </Text>
        </FadeUp>
      ) : (
        <FadeUp key="t-load" duration={380} style={styles.ovTextBox}>
          <View style={styles.ovTitleRow}>
            <Text style={styles.ovTitle}>กำลังเข้าสู่ระบบ</Text>
            <View style={styles.dotsRow}>
              {[0, 1, 2].map((i) => (
                <LoadingDot key={i} delay={i * 160} />
              ))}
            </View>
          </View>
          <Text style={styles.ovSub}>กำลังตรวจสอบข้อมูลผู้ใช้</Text>
          <IndeterminateBar />
        </FadeUp>
      )}
    </Animated.View>
  );
}

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // idle = กรอกฟอร์ม · loading = กำลังตรวจรหัส (อนิเมชั่นทับเต็มจอ) · success = ผ่านแล้ว เล่นฉากสำเร็จก่อนเข้าแอป
  const [phase, setPhase] = useState<"idle" | "loading" | "success">("idle");
  // ฉากทับยังอยู่บนจอไหม — รหัสผิดแล้ว phase กลับเป็น idle ฉากจะจางหายก่อน แล้วค่อยถอด (onHidden)
  const [overlayOn, setOverlayOn] = useState(false);
  const [welcomeName, setWelcomeName] = useState("");
  const loading = phase !== "idle";
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<"user" | "pass" | null>(null);

  const { signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const passRef = useRef<TextInput>(null);

  // หน้าเต็มจอ: ส่วนหัวได้พื้นที่ที่เหลือจากการ์ดฟอร์ม แล้วย่อโลโก้/ชื่อให้พอดีพื้นที่นั้นเอง
  // (heroSpace = ความสูงที่ใช้ได้ · heroContent = ความสูงจริงของโลโก้+ชื่อ ก่อนย่อ)
  // ตอนคีย์บอร์ดขึ้นไม่มีอะไรในหน้าเปลี่ยนโครง — ส่วนหัวมี minHeight = ขนาดโลโก้ที่ย่อแล้ว แล้วให้ ScrollView เลื่อนแทน
  const HERO_PAD = insets.top + 20; // paddingTop (insets.top + 12) + paddingBottom (8)
  const [heroSpace, setHeroSpace] = useState<number | null>(null); // null = ยังไม่ได้วัด
  const [heroContent, setHeroContent] = useState(0);
  // คุมสเกลไว้ 0.3–1 — กันพื้นที่ ≤ 0 แล้วสเกลติดลบจนโลโก้กลับด้าน/วูบ
  const heroScale = heroSpace !== null && heroContent > 0 ? Math.max(0.3, Math.min(1, heroSpace / heroContent)) : 1;
  const heroMinHeight = heroContent > 0 ? heroContent * heroScale + HERO_PAD : 0;

  // เข้าฉากตอนเปิดหน้า: โลโก้/ชื่อเลื่อนลงมา · คลื่น+การ์ดฟอร์มเลื่อนขึ้นมา
  const logoIn = useEnter(0, 900, -24);
  const titleIn = useEnter(200, 900, -24);
  const cardIn = useEnter(250, 800, 36);

  // โลโก้ลอยขึ้นลงเบาๆ
  const float = useLoop(3200, { easing: Easing.inOut(Easing.sin), reverse: true });
  const logoFloatStyle = useMemo(() => ({ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] }) }] }), [float]);

  // แสงวิ่งผ่านปุ่มเข้าสู่ระบบ (วิ่ง 1.4 วิ แล้วพัก 1.8 วิ)
  const shimmer = useLoop(1400, { easing: Easing.inOut(Easing.quad), pause: 1800 });
  const shimmerStyle = useMemo(
    () => ({ transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-140, width] }) }, { skewX: "-20deg" }] }),
    [shimmer, width],
  );

  // ฟอร์มสั่นซ้าย-ขวาเวลากรอกไม่ครบ/รหัสผิด
  const shakeX = useRef(new Animated.Value(0)).current;
  const shakeStyle = useMemo(() => ({ transform: [{ translateX: shakeX }] }), [shakeX]);
  const shake = () => {
    shakeX.setValue(0);
    Animated.sequence(
      [-12, 12, -10, 8, -4, 0].map((toValue, i) => Animated.timing(shakeX, { toValue, duration: i === 0 ? 50 : 80, useNativeDriver: true })),
    ).start();
  };

  const handleLogin = async () => {
    if (phase !== "idle") return;
    if (!username || !password) {
      shake();
      Alert.alert("แจ้งเตือน", "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
      return;
    }
    Keyboard.dismiss();
    setOverlayOn(true);
    setPhase("loading");
    // ให้อนิเมชั่นตอนรอเล่นอย่างน้อยช่วงหนึ่ง — เซิร์ฟเวอร์ตอบไวจะได้ไม่วาบแล้วหาย
    const startedAt = Date.now();
    const holdLoading = (ms: number) => sleep(Math.max(0, ms - (Date.now() - startedAt)));
    try {
      // ไม่ log รหัสผ่านลง console (เดิม log ทั้ง username/password)
      // ฉากสำเร็จต้องเล่นใน beforeCommit — พอ signIn เซ็ต user แล้ว InitialLayout จะพาไปหน้า news ทันที
      const success = await signIn(username, password, async (u) => {
        await holdLoading(1200);
        setWelcomeName(u.fullname || u.username);
        setPhase("success");
        await sleep(1800);
      });

      if (success) {
        router.replace("/(tabs)/news");
      } else {
        await holdLoading(800);
        setPhase("idle");
        shake();
        Alert.alert("เข้าสู่ระบบไม่สำเร็จ", "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      }
    } catch (error) {
      console.log("เกิด Error ใน handleLogin:", error);
      setPhase("idle");
      shake();
      Alert.alert("Error", "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  };

  // 🐛 ต้นเหตุคีย์บอร์ดเด้งแว้บแล้วหุบ (ต้องกดหลายครั้ง): ตอนโฟกัส fieldFocused เพิ่ม shadowColor/elevation ให้กรอบ
  //    ใน Fabric (New Arch) กรอบที่มีแค่สีพื้น/เส้นขอบ ลูกข้างใน (TextInput) ถูก "flatten" ไปแปะกับ view ชั้นบน
  //    พอมี shadowColor กรอบกลายเป็น stacking context -> TextInput ถูกย้ายเข้ามาในกรอบ = native view หลุดจาก
  //    superview ชั่วขณะ -> iOS หุบคีย์บอร์ดทันที -> onBlur เอาเงาออก -> ย้ายกลับ (react-native#45798)
  //    แก้: กรอบต้องเป็น stacking context ตลอด (collapsable={false}) โฟกัสแล้วเปลี่ยนแค่สี/เงา ไม่ย้ายช่องกรอก
  const fieldStyle = (key: "user" | "pass") => [styles.field, focused === key && styles.fieldFocused];
  // กล่องไอคอนเป็น LinearGradient ตัวเดิมเสมอ เปลี่ยนแค่สีตามโฟกัส — ไม่สลับชนิด component ข้างช่องกรอก
  const fieldIcon = (key: "user" | "pass", name: keyof typeof Ionicons.glyphMap) => {
    const on = focused === key;
    return (
      <LinearGradient colors={on ? [C.blue, C.sky] : ["#eff6ff", "#eff6ff"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fieldIcon}>
        <Ionicons name={name} size={18} color={on ? "#fff" : C.blueMid} />
      </LinearGradient>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* พื้นหลัง: ไล่สีน้ำเงินเข้ม -> น้ำเงิน -> ฟ้า (ถึงฟ้าในครึ่งบนที่มองเห็น) + ก้อนแสง + ฟองแสงลอยขึ้น */}
      <LinearGradient
        colors={[C.navy, C.blueDeep, C.blueMid, C.sky]}
        locations={[0, 0.22, 0.4, 0.58]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Blob id="g1" top={-170} right={-170} size={420} color={C.skyLight} opacity={0.55} dx={-30} dy={40} duration={7000} />
      <Blob id="g2" top={150} left={-190} size={380} color="#22d3ee" opacity={0.32} dx={40} dy={-30} duration={9000} />
      <Blob id="g3" top={260} right={-120} size={300} color="#7dd3fc" opacity={0.4} dx={-25} dy={-20} duration={8000} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom: "40%" }]}>
        {BUBBLES.map((b, i) => (
          <Bubble key={i} {...b} />
        ))}
      </View>

      {/* เต็มจอพอดีเป๊ะตอนคีย์บอร์ดไม่ขึ้น (contentContainer flexGrow = สูงเท่าจอ ไม่มีที่ให้เลื่อน)
          คีย์บอร์ดขึ้น: iOS ใช้ automaticallyAdjustKeyboardInsets (ระบบเว้นที่ + เลื่อนหาช่องที่กำลังกรอกให้เอง)
          Android ระบบย่อจอเอง (windowSoftInputMode=adjustResize) แล้ว ScrollView เลื่อนหาช่องที่โฟกัสอยู่ */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flex: 1 }}>
          {/* ---- ส่วนหัว: โลโก้ + ชื่อระบบ (ย่ออัตโนมัติให้พอดีพื้นที่ที่เหลือ) ---- */}
          <View
            style={[styles.hero, { paddingTop: insets.top + 12, minHeight: heroMinHeight }]}
            onLayout={(e) => setHeroSpace(e.nativeEvent.layout.height - HERO_PAD)}
          >
            {/* collapsable={false}: สเกล 1 กับไม่ใช่ 1 ต้องไม่ทำให้ view นี้ถูก flatten/unflatten สลับไปมา */}
            <View
              collapsable={false}
              style={{ alignItems: "center", transform: [{ scale: heroScale }] }}
              onLayout={(e) => setHeroContent(e.nativeEvent.layout.height)}
            >
              <Animated.View style={[styles.logoWrap, logoIn]}>
                {/* แสงฟุ้งสีฟ้าด้านหลังโลโก้ */}
                <View pointerEvents="none" style={styles.logoGlow}>
                  <Glow id="logoGlow" size={300} color="#bae6fd" opacity={0.55} />
                </View>
                <Ripple delay={0} />
                <Ripple delay={1500} />
                <Animated.View style={logoFloatStyle}>
                  <View style={styles.logoHalo}>
                    <View style={styles.logoCircle}>
                      <Image source={require("../assets/images/favicon2.png")} style={styles.logoImage} />
                    </View>
                  </View>
                </Animated.View>
              </Animated.View>

              <Animated.View style={[{ alignItems: "center", marginTop: 18 }, titleIn]}>
                <Text style={styles.appName}>ONE TJC</Text>
                <View style={styles.subtitlePill}>
                  <View style={styles.subtitleDot} />
                  <Text style={styles.appSubtitle}>Enterprise Management System</Text>
                </View>
              </Animated.View>
            </View>
          </View>

          {/* ---- คลื่นรอยต่อระหว่างส่วนหัวกับการ์ดฟอร์ม (2 ชั้น ชั้นหลังโปร่ง) ---- */}
          <Animated.View style={cardIn}>
            <Svg width={width} height={48} viewBox="0 0 1440 160" preserveAspectRatio="none" style={styles.wave}>
              <Path d="M0,96 C240,24 480,24 720,72 C960,120 1200,128 1440,64 L1440,160 L0,160 Z" fill="rgba(255,255,255,0.35)" />
              <Path d="M0,112 C260,56 520,64 760,104 C1000,144 1220,136 1440,96 L1440,160 L0,160 Z" fill="#ffffff" />
            </Svg>

            {/* ---- การ์ดฟอร์ม ---- */}
            <View style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
              <Text style={styles.welcomeText}>ยินดีต้อนรับ</Text>
              <LinearGradient colors={[C.blue, C.sky]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.welcomeBar} />
              <Text style={styles.instructionText}>เข้าสู่ระบบเพื่อเริ่มต้นใช้งาน</Text>

              {/* ช่องกรอก + ปุ่ม — สั่นทั้งก้อนตอนกรอกไม่ครบ/รหัสผิด */}
              <Animated.View style={shakeStyle}>
                <Text style={styles.fieldLabel}>ชื่อผู้ใช้</Text>
                <View collapsable={false} style={fieldStyle("user")}>
                  {fieldIcon("user", "person")}
                  <TextInput
                    style={styles.input}
                    placeholder="กรอกชื่อผู้ใช้ (Username)"
                    placeholderTextColor="#94a3b8"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    // บอก iOS ตรงๆ ว่าเป็นฟอร์มล็อกอิน (ไม่ใช่ฟอร์มสมัคร) — ไม่ให้เด้ง Strong Password
                    textContentType="username"
                    autoComplete="username"
                    returnKeyType="next"
                    editable={!loading}
                    onSubmitEditing={() => passRef.current?.focus()}
                    onFocus={() => setFocused("user")}
                    onBlur={() => setFocused(null)}
                    selectionColor={C.blueMid}
                  />
                </View>

                <Text style={styles.fieldLabel}>รหัสผ่าน</Text>
                <View collapsable={false} style={fieldStyle("pass")}>
                  {fieldIcon("pass", "lock-closed")}
                  <TextInput
                    ref={passRef}
                    style={styles.input}
                    placeholder="กรอกรหัสผ่าน (Password)"
                    placeholderTextColor="#94a3b8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    autoComplete="password"
                    returnKeyType="go"
                    editable={!loading}
                    onSubmitEditing={handleLogin}
                    onFocus={() => setFocused("pass")}
                    onBlur={() => setFocused(null)}
                    selectionColor={C.blueMid}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} hitSlop={8}>
                    <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color={focused === "pass" ? C.blueMid : "#94a3b8"} />
                  </TouchableOpacity>
                </View>

                <PressScale onPress={handleLogin} disabled={loading} style={styles.loginBtnShadow}>
                  <LinearGradient colors={[C.blue, C.blueMid, C.sky]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.loginBtn}>
                    {!loading && (
                      <Animated.View pointerEvents="none" style={[styles.shimmer, shimmerStyle]}>
                        <LinearGradient
                          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.45)", "rgba(255,255,255,0)"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={StyleSheet.absoluteFill}
                        />
                      </Animated.View>
                    )}
                    {loading ? (
                      <View style={styles.loginBtnRow}>
                        <ActivityIndicator color="#fff" />
                        <Text style={styles.loginBtnText}>กำลังเข้าสู่ระบบ...</Text>
                      </View>
                    ) : (
                      <View style={styles.loginBtnRow}>
                        <Text style={styles.loginBtnText}>เข้าสู่ระบบ</Text>
                        <View style={styles.loginArrow}>
                          <Ionicons name="arrow-forward" size={18} color={C.blue} />
                        </View>
                      </View>
                    )}
                  </LinearGradient>
                </PressScale>
              </Animated.View>

              <View style={styles.footer}>
                <Ionicons name="shield-checkmark" size={13} color="#94a3b8" />
                <Text style={styles.footerText}>© {new Date().getFullYear()} TJC Engineering Service Co., Ltd.</Text>
              </View>
            </View>
          </Animated.View>
        </View>
      </ScrollView>

      {/* อนิเมชั่นตอนกดเข้าสู่ระบบ — ทับเต็มจอบนสุด */}
      {overlayOn && <LoginOverlay phase={phase} welcomeName={welcomeName} onHidden={() => setOverlayOn(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.navy },

  // --- พื้นหลังตกแต่ง ---
  blob: { position: "absolute" },
  bubble: { position: "absolute", bottom: 0, backgroundColor: "rgba(224,242,254,0.9)" },

  // --- ส่วนหัว ---
  // ไม่กำหนด minHeight — ส่วนหัวต้องหดได้ (คีย์บอร์ดขึ้น/จอเตี้ย) เนื้อหาข้างในย่อตาม heroScale แทน
  hero: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 8, overflow: "hidden" },
  logoWrap: { alignItems: "center", justifyContent: "center", width: 200, height: 200 },
  logoGlow: { position: "absolute", left: -50, top: -50 },
  ripple: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: "rgba(186,230,253,0.95)",
  },
  logoHalo: {
    width: 148,
    height: 148,
    borderRadius: 74,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  logoCircle: {
    flex: 1,
    borderRadius: 66,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    shadowColor: "#0c4a6e",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 16,
  },
  logoImage: { width: "100%", height: "100%", resizeMode: "contain" },
  appName: {
    fontSize: 36,
    fontWeight: "900",
    color: "white",
    letterSpacing: 4,
    textShadowColor: "rgba(2,6,23,0.35)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  subtitlePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  subtitleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#7dd3fc" },
  appSubtitle: { fontSize: 12.5, color: C.skyPale, fontWeight: "700", letterSpacing: 1 },

  // --- คลื่น + การ์ดฟอร์ม ---
  wave: { marginBottom: -1 },
  card: { backgroundColor: "white", paddingHorizontal: 28, paddingTop: 6 },
  welcomeText: { fontSize: 24, fontWeight: "900", color: C.ink, letterSpacing: 0.3 },
  welcomeBar: { width: 44, height: 4, borderRadius: 2, marginTop: 6, marginBottom: 6 },
  instructionText: { fontSize: 13.5, color: C.inkSoft, fontWeight: "500", marginBottom: 14 },

  fieldLabel: { fontSize: 12.5, fontWeight: "800", color: "#334155", marginBottom: 6, marginLeft: 2 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    height: 54,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.fieldBg,
    paddingLeft: 8,
    marginBottom: 12,
  },
  fieldFocused: {
    borderColor: C.blueMid,
    backgroundColor: "white",
    shadowColor: C.blueMid,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  fieldIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  // outlineWidth: 0 = ตัดกรอบโฟกัสดำของ browser (ตอนรันแบบ web) — มือถือไม่มีผล
  input: { flex: 1, height: "100%", fontSize: 16, color: C.ink, fontWeight: "600", paddingHorizontal: 12, outlineWidth: 0 },
  eyeBtn: { paddingHorizontal: 16, height: "100%", justifyContent: "center" },

  loginBtnShadow: {
    marginTop: 8,
    borderRadius: 20,
    shadowColor: C.blueMid,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 14,
  },
  loginBtn: { height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  shimmer: { position: "absolute", top: -10, bottom: -10, left: 0, width: 90 },
  loginBtnRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  loginBtnText: { color: "white", fontSize: 18, fontWeight: "800", letterSpacing: 1 },
  loginArrow: { width: 30, height: 30, borderRadius: 15, backgroundColor: "white", alignItems: "center", justifyContent: "center" },

  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 18 },

  // --- อนิเมชั่นตอนเข้าสู่ระบบ (LoginOverlay) ---
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", zIndex: 10 },
  stage: { width: STAGE, height: STAGE, alignItems: "center", justifyContent: "center" },
  stageGlow: { position: "absolute", left: (STAGE - 340) / 2, top: (STAGE - 340) / 2 },
  // ชั้นซ้อนกลางเวที — absolute ไม่ใส่ตำแหน่ง ให้พ่อจัดกึ่งกลางให้
  stageLayer: { position: "absolute", alignItems: "center", justifyContent: "center" },
  orbitDot: { position: "absolute", backgroundColor: "#e0f2fe", shadowColor: "#7dd3fc", shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  particle: { position: "absolute" },
  ovLogo: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: "white",
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0c4a6e",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 18,
  },
  checkBadge: {
    position: "absolute",
    right: (STAGE - 124) / 2 - 8,
    bottom: (STAGE - 124) / 2 - 8,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: "white",
    elevation: 20,
    shadowColor: "#064e3b",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  checkBadgeFill: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  ovTextBox: { alignItems: "center", marginTop: 26, paddingHorizontal: 32 },
  ovTitleRow: { flexDirection: "row", alignItems: "flex-end" },
  ovTitle: { color: "white", fontSize: 22, fontWeight: "900", letterSpacing: 0.5 },
  ovSub: { color: "#e0f2fe", fontSize: 13.5, fontWeight: "600", marginTop: 6, opacity: 0.9 },
  dotsRow: { flexDirection: "row", gap: 4, marginLeft: 6, marginBottom: 8 },
  loadingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "white" },
  barTrack: { width: 200, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", marginTop: 18, overflow: "hidden" },
  barFill: { position: "absolute", top: 0, bottom: 0, width: 90, borderRadius: 2 },
  footerText: { color: "#94a3b8", fontSize: 11.5, fontWeight: "600" },
});
