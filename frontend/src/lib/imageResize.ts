/**
 * Downscale a picked image to a JPEG data URL before it is sent to the chat.
 *
 * Phone photos are several megabytes; the model does not need more than about
 * 1568 px on the long side, and a smaller image costs the assistant owner fewer
 * input tokens. The backend only accepts JPEG, so every format ends up here.
 */

const MAX_SIDE = 1568;
const JPEG_QUALITY = 0.85;

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" applies the EXIF rotation phones store instead of rotating pixels.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Some formats (e.g. HEIC outside Safari) fail here; try the <img> path below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("This image format is not supported."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function resizeToJpegDataUrl(
  file: File,
  maxSide: number = MAX_SIDE,
  quality: number = JPEG_QUALITY
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const source = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process this image.");

  // JPEG has no transparency; without this, transparent PNG areas turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  if ("close" in source) source.close();

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  if (!dataUrl.startsWith("data:image/jpeg;base64,")) {
    throw new Error("Could not process this image.");
  }
  return dataUrl;
}
