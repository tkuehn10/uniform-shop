// Client-side photo compression + bytea encoding for item_photos (REQ-1, REQ-2).
// Photos live in Postgres as bytea rather than a separate storage service
// (ADR-001 Amendment 1), so every upload is resized/compressed here before
// it's ever sent to Supabase -- there's no server-side processing step, and
// no raw/uncompressed original is ever stored.

// Tried largest-first: full quality ladder at 400px, then again at 320/240/160
// if nothing fit under MAX_BYTES yet. Keeps photos as sharp as possible while
// still landing under the cap for the vast majority of ordinary product
// photos; only a very busy/detailed source image would ever bottom out at
// the smallest size and quality tried.
const DIMENSION_STEPS = [400, 320, 240, 160];
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4, 0.25];
const MAX_BYTES = 50 * 1024;

export interface CompressedPhoto {
  bytesHex: string; // Postgres bytea hex-format text literal, e.g. "\x89504e47..."
  contentType: string;
  byteSize: number;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function hexToDataUrl(bytesHex: string, contentType: string): string {
  const hex = bytesHex.startsWith('\\x') ? bytesHex.slice(2) : bytesHex;
  let binary = '';
  for (let i = 0; i < hex.length; i += 2) {
    binary += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  const base64 = btoa(binary);
  return `data:${contentType};base64,${base64}`;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = reject;
    });
    img.src = url;
    return await loaded;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encodeAt(
  img: HTMLImageElement,
  dimension: number,
  contentType: string,
  quality: number
): Promise<Blob | null> {
  const scale = Math.min(1, dimension / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, contentType, quality));
}

// Resizes to at most 400px on the long edge and encodes as webp, stepping
// quality down through QUALITY_STEPS until the result fits under MAX_BYTES
// (50KB). If even the lowest quality at 400px doesn't fit, steps the
// dimension down through DIMENSION_STEPS and tries the quality ladder again
// at each size. Best-effort: an unusually busy/detailed image may still come
// in as the smallest result found (160px, lowest quality) without actually
// reaching the cap.
export async function compressImageFile(file: File): Promise<CompressedPhoto> {
  const img = await loadImage(file);
  const contentType = 'image/webp';

  let smallest: Blob | null = null;

  outer: for (const dimension of DIMENSION_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const blob = await encodeAt(img, dimension, contentType, quality);
      if (!blob) continue;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= MAX_BYTES) break outer;
    }
  }
  if (!smallest) throw new Error('Failed to encode image');

  const buffer = await smallest.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return {
    bytesHex: '\\x' + bytesToHex(bytes),
    contentType,
    byteSize: bytes.byteLength
  };
}
