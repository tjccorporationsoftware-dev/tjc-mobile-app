/**
 * useScreenInsets — ขอบปลอดภัยของ "หน้าจอจริง" สำหรับวางป๊อปอัพ / bottom sheet ใน <Modal>
 *
 * ทำไมไม่ใช้ useSafeAreaInsets() ตรงๆ:
 *   หน้าใน Drawer มีแถบหัว (header) อยู่แล้ว react-navigation จึงส่ง insets.top = 0 ให้หน้าลูก
 *   และบน Android แบบ edge-to-edge บางเครื่อง insets.bottom ก็ได้ 0 ด้วย
 *   พอเอาไปใช้ใน <Modal statusBarTranslucent navigationBarTranslucent> เนื้อหาจึงไปซ้อน
 *   ใต้แถบสถานะ/แถบปุ่มนำทางของมือถือ (ปุ่มกลับกดไม่ได้ ท้ายจอโดนบัง)
 *   ตัวนี้เอาค่าที่มากที่สุดจาก insets ปัจจุบัน, ค่าตอนเปิดแอป (initialWindowMetrics)
 *   และความสูงแถบสถานะของ Android
 */
import { Platform, StatusBar } from 'react-native';
import { EdgeInsets, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

export function useScreenInsets(): EdgeInsets {
  const live = useSafeAreaInsets();
  const init = initialWindowMetrics?.insets;
  const androidStatus = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;
  return {
    top: Math.max(live.top, init?.top ?? 0, androidStatus),
    bottom: Math.max(live.bottom, init?.bottom ?? 0),
    left: Math.max(live.left, init?.left ?? 0),
    right: Math.max(live.right, init?.right ?? 0),
  };
}
