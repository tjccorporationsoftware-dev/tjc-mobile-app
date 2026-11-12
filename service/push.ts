// service/push.ts — แจ้งเตือน push ลงมือถือ (Expo Push) · เพิ่ม 12 พ.ย. 2569
// ------------------------------------------------------------------
//  ลงทะเบียน: มีผู้ใช้ (ล็อกอิน / เปิดแอปที่ล็อกอินค้าง) → ขอสิทธิ์แจ้งเตือน → ขอ Expo push token → ส่งเก็บคู่ user_id
//            ที่ tjc-api-server: mobile_api/modules/push_API_mobile.php (register)
//  ออกจากระบบ: ลบ token เครื่องนี้ (unregister) — คนต่อไปที่ล็อกอินเครื่องนี้จะลงทะเบียนเป็นชื่อตัวเอง
//  ฝั่งส่งอยู่ที่ helpers/push_notify.php: แจ้งจัดงานใหม่ → ทีมจัดของ · มีคนรับงาน → คนที่แจ้ง
//  กดแจ้งเตือน: data.url = เส้นทางในแอป (/site_job_board, /site_item_check?project_id=12) → เปิดหน้านั้น
//            เปิดแอปจากแจ้งเตือนตอนแอปปิดอยู่ = รอเข้าหน้าในแอป (ผ่านหน้า login) ก่อนแล้วค่อยเปิด
//  แจ้งเตือนเรื่องงานเข้ามาตอนเปิดแอปอยู่ = ส่ง JOB_REFRESH_EVENT ให้หน้าแจ้งจัดงานโหลดใหม่ทันที
//
//  ⚠️ Expo Go (SDK 53+) ใช้ push ไม่ได้ และแค่ require('expo-notifications') ก็พัง (ดู alert_screen.tsx) → โหลดแบบมีเงื่อนไข
//  ⚠️ Android ต้องมี google-services.json (Firebase) ใน build ถึงจะขอ token ได้ — ยังไม่มี = ข้ามเงียบ ๆ ไม่กระทบแอป
//  ⚠️ ชื่อช่องต้องตรงกับ PHP: JOB_CHANNEL = PUSH_CHANNEL_JOBS · GENERAL_CHANNEL = PUSH_CHANNEL_GENERAL
//  เสียง: ทุกแจ้งเตือนใช้เสียงปกติของเครื่อง (ผู้ใช้เลือก 12 พ.ย. 69 — เคยลองเสียงเฉพาะแล้วเอาออก)
// ------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRunningInExpoGo } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';

import { API_MODULES } from '../constants/config';
import { apiMobilePost } from './api_mobile';

type NotificationsModule = typeof import('expo-notifications');

const PUSH_API_URL = `${API_MODULES}/push_API_mobile.php`;
const TOKEN_KEY = 'PUSH_TOKEN';
// ช่องแจ้งเตือน Android (หมวดในตั้งค่ามือถือ ผู้ใช้ปิด/เปิดแยกได้) · ทั้งสองช่องใช้เสียงปกติของเครื่อง
// ⚠️ Android ตั้งเสียงของช่องได้ครั้งเดียวตอนสร้าง ถ้าวันหลังจะเปลี่ยนเสียง ต้องเปลี่ยนชื่อช่องด้วย
const JOB_CHANNEL = 'jobs';
const GENERAL_CHANNEL = 'general';
/** หน้าแจ้งจัดงานฟังสัญญาณนี้แล้วโหลดรายการใหม่ (site_job_board.tsx) */
export const JOB_REFRESH_EVENT = 'siteJobBoardRefresh';

const isExpoGo = isRunningInExpoGo() || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let N: NotificationsModule | null = null;
if (!isExpoGo && Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    N = require('expo-notifications');
    // แจ้งเตือนเข้ามาตอนเปิดแอปอยู่ก็ยังโชว์แถบด้านบน + เสียง
    N!.setNotificationHandler({
      handleNotification: async () =>
        ({ shouldShowBanner: true, shouldShowList: true, shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }) as any,
    });
  } catch (e) {
    N = null;
    console.warn('โหลด expo-notifications ไม่สำเร็จ:', e);
  }
}

/** ลงทะเบียนเครื่องนี้รับแจ้งเตือนของ user · คืน token (null = ใช้ไม่ได้/ไม่อนุญาต) */
export async function registerPush(userId: string | number): Promise<string | null> {
  if (!N || !Device.isDevice) return null;
  try {
    if (Platform.OS === 'android') {
      // ต้องมีช่องก่อนขอสิทธิ์ (Android 13+) และชื่อช่องเหล่านี้ PHP ส่งมาใน channelId
      await N.setNotificationChannelAsync(JOB_CHANNEL, {
        name: 'งานจัดของ',
        description: 'แจ้งจัดงานใหม่ และมีคนรับงาน',
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
        lightColor: '#2459EA',
        sound: 'default',
      });
      await N.setNotificationChannelAsync(GENERAL_CHANNEL, {
        name: 'แจ้งเตือนทั่วไป',
        description: 'แจ้งเตือนเรื่องอื่นในแอป',
        importance: N.AndroidImportance.HIGH,
        sound: 'default',
      });
    }
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await apiMobilePost(PUSH_API_URL, 'register', { user_id: userId, token, platform: Platform.OS, device: Device.modelName ?? '' });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch (e: any) {
    // ยังไม่มี Firebase (Android) / เน็ตหลุด / เซิร์ฟเวอร์ยังไม่มี API — แอปใช้งานต่อได้ปกติ
    console.log('ลงทะเบียนแจ้งเตือนไม่สำเร็จ:', e?.message ?? e);
    return null;
  }
}

/** ออกจากระบบ: เอาเครื่องนี้ออกจากผู้รับแจ้งเตือนของ user คนนี้ */
export async function unregisterPush(userId: string | number): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    await AsyncStorage.removeItem(TOKEN_KEY);
    if (token) await apiMobilePost(PUSH_API_URL, 'unregister', { user_id: userId, token });
  } catch {
    // ลบไม่สำเร็จ = เครื่องนี้อาจได้แจ้งเตือนของคนเดิมจนมีคนล็อกอินใหม่ (token ย้ายเจ้าของเอง)
  }
}

/**
 * เรียกครั้งเดียวที่ root layout (app/_layout.tsx InitialLayout)
 * ลงทะเบียนเครื่องเมื่อมีผู้ใช้ · กดแจ้งเตือน = เปิดหน้าตาม data.url เมื่ออยู่ในหน้าในแอปแล้ว
 */
export function usePushNotifications(userId: string | number | null | undefined) {
  const router = useRouter();
  const segments = useSegments();
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const inApp = segments[0] === '(tabs)';

  useEffect(() => {
    if (userId) void registerPush(userId);
  }, [userId]);

  useEffect(() => {
    if (!N) return;
    const notifications = N;
    const take = (data: any) => {
      const url = typeof data?.url === 'string' && data.url.startsWith('/') ? data.url : '';
      if (url) setPendingUrl(url);
    };
    // แอปปิดอยู่แล้วเปิดจากแจ้งเตือน · ใช้แล้วล้าง ไม่ให้เปิดซ้ำทุกครั้งที่เปิดแอป
    notifications
      .getLastNotificationResponseAsync()
      .then((r) => {
        if (!r) return;
        take(r.notification.request.content.data);
        void (notifications as any).clearLastNotificationResponseAsync?.();
      })
      .catch(() => {});
    const tap = notifications.addNotificationResponseReceivedListener((r) => take(r.notification.request.content.data));
    const got = notifications.addNotificationReceivedListener((n) => {
      if (String(n.request.content.data?.type ?? '').startsWith('job')) DeviceEventEmitter.emit(JOB_REFRESH_EVENT);
    });
    return () => {
      tap.remove();
      got.remove();
    };
  }, []);

  // เปิดหน้าเมื่อพร้อม (ล็อกอินแล้ว และพ้นหน้า login เข้ามาในแอปแล้ว)
  useEffect(() => {
    if (!pendingUrl || !userId || !inApp) return;
    router.push(pendingUrl as never);
    setPendingUrl(null);
  }, [pendingUrl, userId, inApp, router]);
}
