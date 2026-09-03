import { findInkBounds, pixelValues, inputDimensions } from "./core";
import type { TegakiConfig } from "./config";

export interface PreprocessedImage {
  pixels: Uint8Array | Float32Array;
  dims: number[];
  preview: HTMLCanvasElement;
}

// Convert the browser canvas into the normalized tensor representation used by the model.
// This centers the ink, crops whitespace, and scales the stroke to fit the model input size.
export function preprocess(source: HTMLCanvasElement, config: TegakiConfig): PreprocessedImage | null {
  const { width, height, padding } = config;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > 2048 || height > 2048 || !Number.isFinite(padding) || padding < 0 || padding >= 0.5) {
    throw new Error("Use image dimensions from 1 to 2048 and padding from 0 to less than 0.5.");
  }
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is unavailable.");
  // Reading the raw pixels lets us crop tightly around the actual handwriting instead of the whole
  // canvas, which keeps the model input focused on the written character.
  const original = context.getImageData(0, 0, source.width, source.height);
  const bounds = findInkBounds(original.data, source.width, source.height);
  if (!bounds) return null;
  const crop = config.crop ? bounds : { x: 0, y: 0, width: source.width, height: source.height };
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const output = canvas.getContext("2d");
  if (!output) throw new Error("Canvas 2D is unavailable.");
  output.fillStyle = "#fff";
  output.fillRect(0, 0, width, height);
  output.imageSmoothingEnabled = true;
  output.imageSmoothingQuality = "high";
  // Scale the cropped handwriting to a padded box so the character stays within the model's view
  // without being stretched disproportionately.
  const scale = Math.min(width * (1 - 2 * padding) / crop.width, height * (1 - 2 * padding) / crop.height);
  const w = crop.width * scale;
  const h = crop.height * scale;
  output.drawImage(source, crop.x, crop.y, crop.width, crop.height, (width - w) / 2, (height - h) / 2, w, h);
  const raster = output.getImageData(0, 0, width, height);
  const pixels = pixelValues(raster.data, config);
  if (config.ink === "white") {
    for (let i = 0; i < raster.data.length; i += 4) {
      raster.data[i] = 255 - raster.data[i];
      raster.data[i + 1] = 255 - raster.data[i + 1];
      raster.data[i + 2] = 255 - raster.data[i + 2];
    }
    output.putImageData(raster, 0, 0);
  }
  return { pixels, dims: inputDimensions(config), preview: canvas };
}
