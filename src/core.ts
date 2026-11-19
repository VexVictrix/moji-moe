import type { InputType, InkColor, OutputMode, MojiConfig } from "./config";

// A single ranked candidate produced from model output plus its label.
export interface Candidate {
  index: number;
  character: string | null;
  score: number;
}

export interface InkBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Convert a pixel from RGBA to a monochrome brightness value while respecting alpha.
// Transparent pixels are treated as white so the crop logic ignores empty canvas areas.
export function grayscale(rgba: Uint8ClampedArray, offset: number): number {
  const alpha = rgba[offset + 3] / 255;
  return (0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2])
    * alpha + 255 * (1 - alpha);
}

// Bounding box for the non-white ink ensures we crop tightly around the written stroke.
export function findInkBounds(rgba: Uint8ClampedArray, width: number, height: number): InkBounds | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grayscale(rgba, (y * width + x) * 4) >= 245) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

// Model inputs are expected in a specific layout; this helper converts our image size
// into the tensor shape required by the ONNX model.
export function inputDimensions(config: Pick<MojiConfig, "width" | "height" | "layout">): number[] {
  const { width: w, height: h } = config;
  switch (config.layout) {
    case "NCHW": return [1, 1, h, w];
    case "NHWC": return [1, h, w, 1];
    case "NHW": return [1, h, w];
    case "HW": return [h, w];
    case "FLAT": return [1, h * w];
    default: throw new Error(`Unsupported layout: ${config.layout satisfies never}`);
  }
}

export interface PixelValuesConfig {
  inputType: InputType;
  ink: InkColor;
  scale: number;
  mean: number;
  std: number;
}

// Convert a raster image into the normalized feature vector that the classifier expects.
// We keep the model input consistent by inverting ink colors and applying the configured
// mean/std normalization before returning the tensor payload.
export function pixelValues(rgba: Uint8ClampedArray, config: PixelValuesConfig): Uint8Array | Float32Array {
  const values = config.inputType === "uint8"
    ? new Uint8Array(rgba.length / 4)
    : new Float32Array(rgba.length / 4);
  if (!Number.isFinite(config.std) || config.std <= 0) throw new Error("std must be positive.");
  for (let i = 0; i < values.length; i++) {
    const gray = grayscale(rgba, i * 4);
    const intensity = config.ink === "white" ? 255 - gray : gray;
    values[i] = config.inputType === "uint8"
      ? Math.round(intensity)
      : (intensity * config.scale - config.mean) / config.std;
  }
  return values;
}

// Label files are a single UTF-8 string containing the model classes in order.
export function parseLabels(text: string): string[] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length !== 1) {
    throw new Error("labels file must contain exactly one line where each character is a class label in model class order.");
  }
  const line = lines[0];
  const labels = Array.from(line);
  if (labels.length === 0) {
    throw new Error("labels file line is empty.");
  }
  return labels;
}

// Convert raw model logits or probabilities into a sorted list of likely characters.
// The top-K list is scaled to a 0..1000 range so the UI can show percentages cleanly.
export function rankOutput(
  raw: ArrayLike<number>,
  dims: readonly number[],
  labels: string[] | null,
  mode: OutputMode,
  topK: number,
): Candidate[] {
  if (!(dims.length === 1 || (dims.length === 2 && dims[0] === 1)) ||
      dims[dims.length - 1] !== raw.length || raw.length === 0) {
    throw new Error(`Expected output [classes] or [1, classes], got [${dims.join(", ")}].`);
  }
  if (labels && labels.length !== raw.length) {
    throw new Error(`Model returned ${raw.length} classes, but labels file has ${labels.length} characters.`);
  }
  if (!Number.isInteger(topK) || topK < 1) throw new Error("topK must be a positive integer.");
  let scores = Array.from(raw);
  if (!scores.every(Number.isFinite)) throw new Error("Model returned non-finite scores. Check preprocessing.");
  if (mode === "logits") {
    const max = scores.reduce((a, b) => Math.max(a, b), -Infinity);
    scores = scores.map(value => Math.exp(value - max));
    const sum = scores.reduce((a, b) => a + b, 0);
    scores = scores.map(value => value / sum);
  } else {
    const sum = scores.reduce((a, b) => a + b, 0);
    if (scores.some(value => value < 0 || value > 1) || Math.abs(sum - 1) > 0.01) {
      throw new Error('Output is not a probability vector. Try outputMode: "logits" in config.ts.');
    }
  }
  scores = scores.map(value => value * 1000);
  return scores.map((score, index) => ({ index, character: labels?.[index] ?? null, score }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, topK);
}
