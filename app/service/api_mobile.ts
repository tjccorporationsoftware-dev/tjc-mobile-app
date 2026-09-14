// services/apiMobile.ts
// ------------------------------------------------------------------
// Helper กลางสำหรับเรียก api_mobile.php — แก้ให้ตรงกับ format จริงที่เห็นใน
// accounting_API_mobile.php (มอดูลจริงตัวแรกที่ได้เห็น):
//
//   ✅ Response จริง:  { "status": "success", ...ฟิลด์วางแบนราบไปกับ status }
//                      หรือ { "status": "error", "message": "...", "code": "..." }
//   ❌ ไม่ใช่ { success: true, data: {...} } แบบที่เขียนไว้รอบแรก (เดาผิด)
//
//   ✅ ยืนยันตัวตนด้วย `user_id` เป็น request param ธรรมดา ไม่มี token/session
//      (ตรงกับที่เห็นใน _layout.tsx อยู่แล้วที่ส่ง username/user_name ตรงๆ)
//
// ต้องมี useAuth() คืน user.id (เลข user_id ในตาราง users) — ถ้ายังไม่มี ต้องหาว่า
// ตอน login เก็บ user_id ไว้ตรงไหน แล้วส่งเข้ามาที่ apiMobileGet/apiMobilePost ทุกครั้ง
// ------------------------------------------------------------------

import axios from 'axios';
import { API_MODULES } from '../../constants/config';

export interface ApiMobileSuccess {
  status: 'success';
  [key: string]: any;
}
export interface ApiMobileError {
  status: 'error';
  message: string;
  code?: string;
}
export type ApiMobileResponse = ApiMobileSuccess | ApiMobileError;

/**
 * เรียก module ไฟล์ API มือถือตัวใดตัวหนึ่งด้วย GET (query string)
 * @param moduleUrl path เต็มของไฟล์โมดูล เช่น `${API_MODULES}/accounting_API_mobile.php`
 * @param action    ชื่อ action เช่น 'get_dashboard'
 * @param params    พารามิเตอร์อื่น ๆ (ไม่ต้องใส่ action ซ้ำ) — ใส่ user_id ทุกครั้งที่ action ต้องการ
 */
export async function apiMobileGet(moduleUrl: string, action: string, params: Record<string, string | number | undefined> = {}): Promise<ApiMobileSuccess> {
  const query: Record<string, string> = { action };
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) query[k] = String(v);
  });
  const res = await axios.get<ApiMobileResponse>(`${moduleUrl}?${new URLSearchParams(query).toString()}`);
  if (res.data.status !== 'success') throw new Error((res.data as ApiMobileError).message || 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์');
  return res.data;
}

/**
 * เรียก module ไฟล์ API มือถือด้วย POST (form-urlencoded — ให้ตรงกับ $_REQUEST ฝั่ง PHP
 * ที่อ่านได้ทั้ง GET/POST พร้อมกัน ปลอดภัยกว่าส่ง JSON body ดิบเพราะโค้ดจริงใช้ $_REQUEST)
 */
export async function apiMobilePost(moduleUrl: string, action: string, params: Record<string, string | number | undefined> = {}): Promise<ApiMobileSuccess> {
  const body = new URLSearchParams();
  body.append('action', action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) body.append(k, String(v));
  });
  const res = await axios.post<ApiMobileResponse>(moduleUrl, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (res.data.status !== 'success') throw new Error((res.data as ApiMobileError).message || 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์');
  return res.data;
}

// 🌟 path ของโมดูลบัญชีลูกหนี้ — ใช้ API_MODULES ที่มีอยู่แล้วใน constants/config.ts
// (ตรงกับตัวอย่างในคอมเมนต์ของไฟล์นั้นเป๊ะ: `${API_MODULES}/accounting_API_mobile.php?...`)
export const ACCOUNTING_API_URL = `${API_MODULES}/accounting_API_mobile.php`;