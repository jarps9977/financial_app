import { getSettings, isValidApiUrl } from './settings.js';

const TIMEOUT_MS = 25000;

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

function isValidData(d) {
  return d && Number.isInteger(d.year) && Array.isArray(d.groups)
    && d.groups.every((g) => g && typeof g.name === 'string' && Array.isArray(g.items));
}

export async function call(action, payload = {}) {
  const { apiUrl, passcode } = getSettings();
  if (!isValidApiUrl(apiUrl)) throw new ApiError('ยังไม่ได้ตั้งค่า API URL', 'config');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    // text/plain keeps this a CORS simple request; Apps Script cannot answer preflight
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action, key: passcode }),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ApiError(
      e.name === 'AbortError' ? 'หมดเวลาเชื่อมต่อ ลองใหม่อีกครั้ง' : 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ต',
      'network',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new ApiError(`เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`, 'http');
  let body;
  try {
    body = await res.json();
  } catch {
    throw new ApiError('ข้อมูลตอบกลับไม่ถูกต้อง ตรวจสอบ URL และการ Deploy', 'parse');
  }
  if (!body || !body.ok) throw new ApiError((body && body.error) || 'เกิดข้อผิดพลาด', body && body.code);
  if (!isValidData(body.data)) throw new ApiError('รูปแบบข้อมูลไม่ถูกต้อง ตรวจสอบเวอร์ชัน Apps Script', 'parse');
  return body.data;
}
