// Client-side photo compression + bytea encoding for item_photos (REQ-1, REQ-2).
// Photos live in Postgres as bytea rather than a separate storage service
// (ADR-001 Amendment 1), so every upload is resized/compressed here before
// it's ever sent to Supabase -- there's no server-side processing step.

const MAX_DIMENSION = 400;
const MAX_BYTES = 100 * 1024;

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

// Resizes to at most MAX_DIMENSION on the long edge and encodes as webp,
// stepping quality down until it fits under MAX_BYTES (best-effort -- an
// already-small/simple image may just come in well under the cap).
export async function compressImageFile(file: File): Promise<CompressedPhoto> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, width, height);

  const contentType = 'image/webp';
  let quality = 0.85;
  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, contentType, quality));
    if (!blob || blob.size <= MAX_BYTES) break;
    quality -= 0.15;
  }
  if (!blob) throw new Error('Failed to encode image');

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return {
    bytesHex: '\\x' + bytesToHex(bytes),
    contentType,
    byteSize: bytes.byteLength
  };
}
