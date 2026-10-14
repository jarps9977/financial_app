import { parseSlip } from '../utils/slip-parser.js';

// Pinned version; worker, wasm core and language data load from the same CDN on first use
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const LANGS = ['tha', 'eng'];
const MAX_SIDE = 1600;

const STATUS_TH = {
  'loading tesseract core': 'โหลดตัวอ่าน',
  'initializing tesseract': 'เตรียมตัวอ่าน',
  'loading language traineddata': 'โหลดข้อมูลภาษา',
  'initializing api': 'เตรียมตัวอ่าน',
  'recognizing text': 'กำลังอ่านสลิป',
};

let libPromise = null;
let workerPromise = null;
let listener = null;

function loadLibrary() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TESSERACT_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('โหลดตัวอ่านสลิปไม่สำเร็จ')));
      script.onerror = () => {
        script.remove();
        libPromise = null;
        reject(new Error('โหลดตัวอ่านสลิปไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต'));
      };
      document.head.append(script);
    });
  }
  return libPromise;
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = loadLibrary()
      .then((T) => T.createWorker(LANGS, 1, {
        logger: (m) => { if (listener) listener(STATUS_TH[m.status] || 'กำลังเตรียม', m.progress || 0); },
      }))
      .catch((e) => {
        workerPromise = null;
        throw e;
      });
  }
  return workerPromise;
}

// Downscale and grayscale large photos; falls back to the raw file if the browser cannot decode it
async function prepareImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.filter = 'grayscale(1) contrast(1.2)';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas;
  } catch {
    return file;
  }
}

// Runs fully in the browser; the image is never uploaded. Calls must be sequential.
export async function readSlip(file, onProgress) {
  listener = onProgress || null;
  try {
    if (listener) listener('กำลังเตรียม', 0);
    const worker = await getWorker();
    const image = await prepareImage(file);
    const { data } = await worker.recognize(image);
    return parseSlip(data.text);
  } finally {
    listener = null;
  }
}

// Frees the worker memory; language data stays cached by Tesseract (IndexedDB)
export async function releaseOcr() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch { /* already gone */ }
}
