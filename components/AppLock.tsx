import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ------------------------------------------------------
// ล็อกแอปด้วย PIN 6 หลัก + Face ID / ลายนิ้วมือ
// ------------------------------------------------------
// - เก็บในเครื่องล้วน (SecureStore = Keychain/Keystore) ไม่ผ่านเซิร์ฟเวอร์ · ผูกกับ user id
// - บังคับตั้ง PIN หลังล็อกอิน · ล็อกตอนเปิดแอปใหม่ และตอนกลับเข้าแอปหลังอยู่เบื้องหลังเกิน 1 นาที
// - ใส่ PIN ผิดครบ MAX_FAILS (นับข้ามการปิดเปิดแอป) / กด "ลืม PIN" = ออกจากระบบ ให้ล็อกอินด้วยรหัสผ่านใหม่
// - ออกจากระบบ = ลบ PIN ทิ้ง ล็อกอินครั้งหน้าตั้งใหม่
// - หน้าล็อกเป็น <Modal> ทับทั้งแอป (ไม่ใช่ route) — หน้าข้างใต้ไม่ถูก unmount สลับไปถ่ายรูปแล้วกลับมาข้อมูลยังอยู่
//   และขึ้นทับ Modal ของหน้าอื่นที่เปิดค้างไว้ได้
// ⚠️ Face ID ใช้ใน Expo Go บน iPhone ไม่ได้ (ต้อง build ด้วย EAS) — PIN ใช้ได้ปกติ

const PIN_LENGTH = 6;
const MAX_FAILS = 5;
const LOCK_AFTER_MS = 60 * 1000;
const STORE_KEY = "tjc_app_lock";
// THIS_DEVICE_ONLY = ไม่ติดไปกับ iCloud backup ลงเครื่องอื่น
const STORE_OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const C = {
  navy: "#0a1f5c",
  blue: "#1d4ed8",
  sky: "#0ea5e9",
  error: "#fecaca",
};

interface LockRecord {
  userId: string;
  pin: string;
  bio: boolean;
  fails: number;
}

// คืน null = ยังไม่เคยตั้ง · throw = อ่านไม่ได้ (คนเรียกต้องจัดการ ห้ามตีความว่า "ยังไม่ตั้ง")
async function readLock(): Promise<LockRecord | null> {
  const raw = await SecureStore.getItemAsync(STORE_KEY, STORE_OPTS);
  return raw ? (JSON.parse(raw) as LockRecord) : null;
}
const writeLock = (rec: LockRecord) => SecureStore.setItemAsync(STORE_KEY, JSON.stringify(rec), STORE_OPTS);
const clearLock = () => SecureStore.deleteItemAsync(STORE_KEY, STORE_OPTS).catch(() => {});

// PIN ซ้ำตัวเดียว (111111) หรือเรียงกัน (123456 / 654321) เดาง่ายเกินไป
const isWeakPin = (p: string) => /^(\d)\1+$/.test(p) || "0123456789".includes(p) || "9876543210".includes(p);

// ---------- Biometric ----------
type BioKind = "face" | "finger" | "both" | "other";
interface BioInfo {
  available: boolean;
  kind: BioKind;
}

async function getBioInfo(): Promise<BioInfo> {
  try {
    const [hasHw, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    return { available: hasHw && enrolled, kind: face && finger ? "both" : face ? "face" : finger ? "finger" : "other" };
  } catch {
    return { available: false, kind: "other" };
  }
}

export function bioLabelOf(kind: BioKind) {
  if (Platform.OS === "ios") return kind === "finger" ? "Touch ID" : "Face ID";
  if (kind === "face") return "สแกนใบหน้า";
  if (kind === "finger") return "ลายนิ้วมือ";
  return "สแกนใบหน้า/ลายนิ้วมือ";
}

export function BioIcon({ kind, size, color }: { kind: BioKind; size: number; color: string }) {
  if (kind === "finger") return <Ionicons name="finger-print" size={size} color={color} />;
  return <MaterialCommunityIcons name="face-recognition" size={size} color={color} />;
}

// disableDeviceFallback = ไม่ให้ไปใช้รหัสเครื่องแทน (เรามี PIN ของแอปเอง)
async function runBiometric(promptMessage: string): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "ใช้ PIN",
      fallbackLabel: "ใช้ PIN",
      disableDeviceFallback: true,
    });
    // Expo Go บน iPhone ไม่มี NSFaceIDUsageDescription → โมดูลตอบล้มเหลวทันทีโดยไม่ขึ้นกล่องสแกน บอกให้รู้ว่าทำไม
    if (!res.success && (res.error as string) === "missing_usage_description") {
      Alert.alert("ใช้ Face ID ใน Expo Go ไม่ได้", "ต้องติดตั้งแอปที่ build ด้วย EAS ถึงจะสแกนหน้าได้ ระหว่างนี้ใช้ PIN ไปก่อน");
    }
    return res.success;
  } catch {
    return false;
  }
}

// ---------- Context (หน้าโปรไฟล์ใช้ เปลี่ยน PIN / เปิดปิด Face ID) ----------
interface AppLockContextType {
  bioAvailable: boolean;
  bioKind: BioKind;
  bioEnabled: boolean;
  setBioEnabled: (on: boolean) => Promise<boolean>;
  changePin: () => void;
}

const AppLockContext = createContext<AppLockContextType | null>(null);

// คืน null ถ้ายังไม่ได้ตั้ง PIN (ไม่ throw — หน้าโปรไฟล์ซ่อนการ์ดไปเฉยๆ)
export function useAppLock() {
  return useContext(AppLockContext);
}

// ---------- Gate ----------
type Mode = "loading" | "none" | "lock" | "setup" | "change";

export function AppLockGate({
  userId,
  userName,
  onSignOut,
  children,
}: {
  userId: string | null;
  userName?: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  // ไม่มี user (หน้า login) เริ่มที่ none เลย ไม่งั้น Modal จะแว้บขึ้นมา 1 เฟรม
  const [mode, setMode] = useState<Mode>(userId ? "loading" : "none");
  const [record, setRecord] = useState<LockRecord | null>(null);
  const [bio, setBio] = useState<BioInfo>({ available: false, kind: "other" });
  const bioBusyRef = useRef(false);

  // undefined = ยังไม่เคยเห็น user เลย → รอบแรกคือ "เปิดแอป" (user กู้มาจาก AsyncStorage) ต้องล็อก
  // รอบหลังจากนั้นที่ user เปลี่ยนเป็นคนใหม่ = เพิ่งล็อกอินด้วยรหัสผ่าน ไม่ต้องล็อกซ้ำ
  const prevUserRef = useRef<string | null | undefined>(undefined);
  const bgAtRef = useRef<number | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const recordRef = useRef(record);
  recordRef.current = record;
  const signOutRef = useRef(onSignOut);
  signOutRef.current = onSignOut;

  useEffect(() => {
    getBioInfo().then(setBio);
  }, []);

  useEffect(() => {
    const prev = prevUserRef.current;
    prevUserRef.current = userId;
    const isBoot = prev === undefined;
    let cancelled = false;

    if (!userId) {
      if (prev) clearLock(); // เพิ่งออกจากระบบ
      setRecord(null);
      setMode("none");
      return;
    }

    setMode("loading");
    readLock()
      .then((rec) => {
        if (cancelled) return;
        if (rec && rec.userId === userId) {
          setRecord(rec);
          setMode(isBoot ? "lock" : "none");
        } else {
          setRecord(null);
          setMode("setup");
        }
      })
      .catch(() => {
        // อ่าน PIN ไม่ได้ ห้ามปล่อยไปหน้าตั้งใหม่ (= ข้ามด่าน) → ให้ล็อกอินด้วยรหัสผ่านแทน
        if (!cancelled) signOutRef.current();
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // นับเวลาเฉพาะ background — iOS ตอนขึ้น Face ID/ดึงแถบแจ้งเตือนเป็นแค่ inactive ไม่นับ
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        bgAtRef.current = Date.now();
      } else if (next === "active") {
        const since = bgAtRef.current;
        bgAtRef.current = null;
        getBioInfo().then(setBio); // อาจไปตั้ง Face ID เพิ่ม/ลบ ในการตั้งค่าเครื่องมา
        if (since && Date.now() - since >= LOCK_AFTER_MS && modeRef.current === "none" && recordRef.current) {
          setMode("lock");
        }
      }
    });
    return () => sub.remove();
  }, []);

  const persist = useCallback(async (rec: LockRecord) => {
    setRecord(rec);
    await writeLock(rec).catch(() => {});
  }, []);

  const forceSignOut = useCallback(async () => {
    await clearLock();
    signOutRef.current();
  }, []);

  // คืนข้อความ error ให้หน้า PIN แสดง · null = ผ่าน
  const unlockWithPin = useCallback(
    async (pin: string): Promise<string | null> => {
      const rec = recordRef.current;
      if (!rec) return null;
      if (pin === rec.pin) {
        if (rec.fails) await persist({ ...rec, fails: 0 });
        setMode("none");
        return null;
      }
      const fails = rec.fails + 1;
      if (fails >= MAX_FAILS) {
        await forceSignOut();
        // รอ Modal ปิดก่อน — iOS ถ้าเปิด Alert ค้างบน Modal ที่กำลังปิด Alert จะหายไปด้วย
        setTimeout(() => Alert.alert("ใส่ PIN ผิดเกินกำหนด", "กรุณาเข้าสู่ระบบด้วยรหัสผ่านอีกครั้ง"), 500);
        return null;
      }
      await persist({ ...rec, fails });
      return `PIN ไม่ถูกต้อง เหลืออีก ${MAX_FAILS - fails} ครั้ง`;
    },
    [persist, forceSignOut],
  );

  const unlockWithBio = useCallback(async () => {
    // กันเด้งกล่องสแกนซ้อน (เด้งเองตอนเปิด + ผู้ใช้กดปุ่มซ้ำ)
    if (bioBusyRef.current) return;
    bioBusyRef.current = true;
    const ok = await runBiometric("ปลดล็อก TJC GROUP");
    bioBusyRef.current = false;
    if (!ok || modeRef.current !== "lock") return;
    const rec = recordRef.current;
    if (rec?.fails) await persist({ ...rec, fails: 0 });
    setMode("none");
  }, [persist]);

  const confirmForgot = useCallback(() => {
    Alert.alert("ลืม PIN?", "ต้องออกจากระบบ แล้วเข้าสู่ระบบด้วยรหัสผ่านอีกครั้งเพื่อตั้ง PIN ใหม่", [
      { text: "ยกเลิก", style: "cancel" },
      { text: "ออกจากระบบ", style: "destructive", onPress: forceSignOut },
    ]);
  }, [forceSignOut]);

  const finishSetup = useCallback(
    async (pin: string, bioOn: boolean) => {
      if (!userId) return;
      await persist({ userId, pin, bio: bioOn, fails: 0 });
      setMode("none");
    },
    [userId, persist],
  );

  const setBioEnabled = useCallback(
    async (on: boolean) => {
      const rec = recordRef.current;
      if (!rec) return false;
      // เปิดต้องสแกนผ่านก่อน 1 ครั้ง (ยืนยันว่าเจ้าของเครื่องเปิดเอง)
      if (on && !(await runBiometric(`ยืนยันเพื่อเปิดใช้ ${bioLabelOf(bio.kind)}`))) return false;
      await persist({ ...rec, bio: on });
      return true;
    },
    [bio.kind, persist],
  );

  const ctx: AppLockContextType | null = record
    ? {
        bioAvailable: bio.available,
        bioKind: bio.kind,
        bioEnabled: record.bio && bio.available,
        setBioEnabled,
        changePin: () => setMode("change"),
      }
    : null;

  let screen: ReactNode = null;
  if (mode === "loading") {
    screen = (
      <Backdrop>
        <ActivityIndicator size="large" color="white" />
      </Backdrop>
    );
  } else if (mode === "lock" && record) {
    screen = (
      <LockScreen
        userName={userName}
        bio={record.bio && bio.available ? bio.kind : null}
        onPin={unlockWithPin}
        onBio={unlockWithBio}
        onForgot={confirmForgot}
      />
    );
  } else if (mode === "setup" || mode === "change") {
    screen = (
      <SetupFlow
        isChange={mode === "change"}
        currentPin={record?.pin}
        bio={bio.available ? bio.kind : null}
        onDone={(pin, bioOn) => finishSetup(pin, mode === "change" ? !!record?.bio : bioOn)}
        onCancel={() => setMode("none")}
        onSignOut={forceSignOut}
      />
    );
  }

  return (
    <AppLockContext.Provider value={ctx}>
      {children}
      <Modal
        visible={screen !== null}
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        // ปุ่มย้อนกลับ Android: ปิดได้เฉพาะตอนเปลี่ยน PIN จากหน้าโปรไฟล์
        onRequestClose={() => {
          if (modeRef.current === "change") setMode("none");
        }}
      >
        {screen}
      </Modal>
    </AppLockContext.Provider>
  );
}

// ---------- หน้าจอ ----------
function Backdrop({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={[C.navy, C.blue, C.sky]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.backdrop, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}
    >
      {children}
    </LinearGradient>
  );
}

// จอเตี้ย (iPhone SE / Android จอเล็ก) ย่อโลโก้กับแป้นกด ไม่งั้นแป้นล้นจอ
const useCompact = () => useWindowDimensions().height < 740;

function Logo() {
  const size = useCompact() ? 72 : 96;
  return (
    <View style={[styles.logoHalo, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={styles.logoCircle}>
        <Image source={require("../assets/images/favicon2.png")} style={styles.logoImage} />
      </View>
    </View>
  );
}

function LockScreen({
  userName,
  bio,
  onPin,
  onBio,
  onForgot,
}: {
  userName?: string;
  bio: BioKind | null;
  onPin: (pin: string) => Promise<string | null>;
  onBio: () => void;
  onForgot: () => void;
}) {
  // เด้งสแกนให้เองครั้งเดียวตอนหน้าล็อกขึ้น — ตอนเปิดแอป bio อาจโหลดเสร็จทีหลังหน้าล็อก เลยรอจน bio มีค่า
  // หน่วงนิดให้แอปกลับมา active เต็มที่ก่อน ไม่งั้น iOS ยกเลิกเอง (system_cancel)
  const autoTriedRef = useRef(false);
  useEffect(() => {
    if (!bio || autoTriedRef.current) return;
    autoTriedRef.current = true;
    const t = setTimeout(onBio, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bio]);

  return (
    <Backdrop>
      <Logo />
      <Text style={styles.greeting} numberOfLines={1}>
        {userName ? `สวัสดี ${userName}` : "ยินดีต้อนรับกลับ"}
      </Text>
      <PinPad
        title="กรอก PIN เพื่อเข้าใช้งาน"
        onSubmit={onPin}
        bio={bio}
        onBio={onBio}
        footer={<FooterLink label="ลืม PIN?" onPress={onForgot} />}
      />
    </Backdrop>
  );
}

type SetupStep = "old" | "new" | "confirm" | "bio";

function SetupFlow({
  isChange,
  currentPin,
  bio,
  onDone,
  onCancel,
  onSignOut,
}: {
  isChange: boolean;
  currentPin?: string;
  bio: BioKind | null;
  onDone: (pin: string, bioOn: boolean) => void;
  onCancel: () => void;
  onSignOut: () => void;
}) {
  const [step, setStep] = useState<SetupStep>(isChange ? "old" : "new");
  const [firstPin, setFirstPin] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [enablingBio, setEnablingBio] = useState(false);
  // จำชนิดไว้ตอนเข้าขั้น bio — prop bio อาจกลายเป็น null ระหว่างนั้น (รีเฟรชตอนกลับเข้าแอป)
  const [offerKind, setOfferKind] = useState<BioKind | null>(null);

  const footer = isChange ? (
    <FooterLink label="ยกเลิก" onPress={onCancel} />
  ) : (
    <FooterLink label="ออกจากระบบ" onPress={onSignOut} />
  );

  if (step === "bio" && offerKind) {
    const label = bioLabelOf(offerKind);
    const enable = async () => {
      setEnablingBio(true);
      const ok = await runBiometric(`ยืนยันเพื่อเปิดใช้ ${label}`);
      setEnablingBio(false);
      onDone(firstPin, ok);
    };
    return (
      <Backdrop>
        <View style={styles.bioOffer}>
          <View style={styles.bioOfferIcon}>
            <BioIcon kind={offerKind} size={64} color="white" />
          </View>
          <Text style={styles.title}>เปิดใช้ {label} ไหม?</Text>
          <Text style={styles.subtitle}>ครั้งต่อไปปลดล็อกแอปได้ทันทีโดยไม่ต้องกด PIN{"\n"}เปลี่ยนภายหลังได้ที่หน้าโปรไฟล์</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={enable} disabled={enablingBio}>
            {enablingBio ? <ActivityIndicator color={C.blue} /> : <Text style={styles.primaryBtnText}>เปิดใช้ {label}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => onDone(firstPin, false)} disabled={enablingBio}>
            <Text style={styles.secondaryBtnText}>ไว้ทีหลัง</Text>
          </TouchableOpacity>
        </View>
      </Backdrop>
    );
  }

  const handle = async (pin: string): Promise<string | null> => {
    if (step === "old") {
      if (pin !== currentPin) return "PIN เดิมไม่ถูกต้อง";
      setNotice(null);
      setStep("new");
      return null;
    }
    if (step === "new") {
      if (isWeakPin(pin)) return "PIN เดาง่ายเกินไป ห้ามใช้เลขซ้ำหรือเรียงกัน";
      if (isChange && pin === currentPin) return "PIN ใหม่ต้องไม่ซ้ำกับ PIN เดิม";
      setFirstPin(pin);
      setNotice(null);
      setStep("confirm");
      return null;
    }
    // confirm
    if (pin !== firstPin) {
      setFirstPin("");
      setNotice("PIN ไม่ตรงกัน กรุณาตั้งใหม่อีกครั้ง");
      setStep("new");
      return null;
    }
    if (!isChange && bio) {
      setOfferKind(bio);
      setStep("bio");
    } else onDone(pin, false);
    return null;
  };

  const titles: Record<Exclude<SetupStep, "bio">, [string, string]> = {
    old: ["กรอก PIN เดิม", "ยืนยันตัวตนก่อนเปลี่ยน PIN"],
    new: [isChange ? "ตั้ง PIN ใหม่" : "ตั้ง PIN 6 หลัก", "ใช้ปลดล็อกแอปทุกครั้งที่เปิดใช้งาน"],
    confirm: ["ยืนยัน PIN อีกครั้ง", "กรอก PIN เดิมซ้ำอีกครั้ง"],
  };
  const [title, subtitle] = titles[step as Exclude<SetupStep, "bio">];

  return (
    <Backdrop>
      <Logo />
      {/* key = รีเซ็ตจุดที่กรอกไว้ทุกครั้งที่เปลี่ยนขั้น */}
      <PinPad key={step} title={title} subtitle={subtitle} notice={notice} onSubmit={handle} footer={footer} />
    </Backdrop>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}>
      <Text style={styles.footerLink}>{label}</Text>
    </TouchableOpacity>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "del"];

function PinPad({
  title,
  subtitle,
  notice,
  onSubmit,
  bio = null,
  onBio,
  footer,
}: {
  title: string;
  subtitle?: string;
  notice?: string | null;
  onSubmit: (pin: string) => Promise<string | null>;
  bio?: BioKind | null;
  onBio?: () => void;
  footer?: ReactNode;
}) {
  const [pin, setPin] = useState("");
  // อ่านค่าล่าสุดจาก ref — กดรัวๆ ก่อน re-render จะได้ไม่ทับตัวเลขกันหาย
  const pinRef = useRef("");
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const compact = useCompact();
  const keySize = compact ? 64 : 76;
  const keyDim = { width: keySize, height: keySize, borderRadius: keySize / 2 };

  const updatePin = (p: string) => {
    pinRef.current = p;
    setPin(p);
  };

  const runShake = () => {
    Vibration.vibrate(200); // iOS ไม่สนระยะเวลา สั่นสั้นๆ ตามระบบ
    shake.setValue(0);
    Animated.sequence(
      [12, -12, 8, -8, 4, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true })),
    ).start();
  };

  const press = async (key: string) => {
    if (busyRef.current) return;
    if (key === "del") {
      updatePin(pinRef.current.slice(0, -1));
      return;
    }
    if (key === "bio") {
      onBio?.();
      return;
    }
    if (pinRef.current.length >= PIN_LENGTH) return;
    const next = pinRef.current + key;
    updatePin(next);
    setError(null);
    if (next.length < PIN_LENGTH) return;

    busyRef.current = true;
    const err = await onSubmit(next);
    busyRef.current = false;
    if (err) {
      setError(err);
      runShake();
    }
    updatePin("");
  };

  const message = error || notice;

  return (
    <View style={styles.padWrap}>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

      <Animated.View style={[styles.dots, { transform: [{ translateX: shake }] }]}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </Animated.View>
      <Text style={styles.error} numberOfLines={2}>
        {message || " "}
      </Text>

      <View style={[styles.keypad, { width: keySize * 3 + 28 * 2, rowGap: compact ? 12 : 16 }]}>
        {KEYS.map((key) => {
          if (key === "bio" && !bio) return <View key={key} style={[styles.key, keyDim]} />;
          const isAction = key === "bio" || key === "del";
          return (
            <Pressable
              key={key}
              onPress={() => press(key)}
              style={({ pressed }) => [styles.key, keyDim, !isAction && styles.keyDigit, pressed && styles.keyPressed]}
              accessibilityLabel={key === "del" ? "ลบ" : key === "bio" ? bioLabelOf(bio!) : key}
            >
              {key === "del" ? (
                <Ionicons name="backspace-outline" size={28} color="white" />
              ) : key === "bio" ? (
                <BioIcon kind={bio!} size={32} color="white" />
              ) : (
                <Text style={styles.keyText}>{key}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  logoHalo: {
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  logoCircle: { flex: 1, borderRadius: 999, backgroundColor: "white", alignItems: "center", justifyContent: "center", padding: 12 },
  logoImage: { width: "100%", height: "100%", resizeMode: "contain" },
  greeting: { color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: "600", marginTop: 14, maxWidth: "90%" },

  padWrap: { alignItems: "center", width: "100%", marginTop: 18 },
  title: { color: "white", fontSize: 22, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "rgba(255,255,255,0.75)", fontSize: 14, marginTop: 6, textAlign: "center", lineHeight: 21 },
  dots: { flexDirection: "row", gap: 16, marginTop: 28 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.8)" },
  dotFilled: { backgroundColor: "white", borderColor: "white" },
  error: { color: C.error, fontSize: 14, fontWeight: "600", marginTop: 14, minHeight: 40, textAlign: "center" },

  keypad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  key: { alignItems: "center", justifyContent: "center" },
  keyDigit: { backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  keyPressed: { backgroundColor: "rgba(255,255,255,0.35)" },
  keyText: { color: "white", fontSize: 30, fontWeight: "600" },
  footer: { marginTop: 22, minHeight: 24 },
  footerLink: { color: "white", fontSize: 15, fontWeight: "700", textDecorationLine: "underline" },

  bioOffer: { alignItems: "center", width: "100%" },
  bioOfferIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    marginBottom: 24,
  },
  primaryBtn: {
    marginTop: 32,
    alignSelf: "stretch",
    height: 54,
    borderRadius: 16,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: C.blue, fontSize: 17, fontWeight: "800" },
  secondaryBtn: { marginTop: 12, alignSelf: "stretch", height: 50, alignItems: "center", justifyContent: "center" },
  secondaryBtnText: { color: "white", fontSize: 16, fontWeight: "700" },
});
