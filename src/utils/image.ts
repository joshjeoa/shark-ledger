/** 凭证照片压缩：最长边压到 maxEdge 内、转 JPEG，单张控制在 ~200KB 量级，避免 IndexedDB 膨胀 */

const MAX_EDGE = 1280;
const QUALITY = 0.82;

export const MAX_PHOTOS_PER_BILL = 3;

/** 解码时应用 EXIF 方向（iPhone 拍摄的照片不带此处理会横竖颠倒） */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fallthrough：旧浏览器不支持选项 */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('图片解码失败'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 压缩用户选择的照片；解码失败/非图片返回 null 由调用方提示 */
export async function compressImage(file: File): Promise<Blob | null> {
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await decode(file);
  } catch {
    return null;
  }
  const w = 'width' in src ? src.width : 0;
  const h = 'height' in src ? src.height : 0;
  if (!w || !h) return null;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(src as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ('close' in src) src.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', QUALITY));
}
