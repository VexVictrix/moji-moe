// Default remote assets for the ONNX model, label file, and runtime bundle.
// Keeping these in one place makes it easy to swap model versions or mirror assets.
export const DEFAULT_MODEL_URL = "https://cdn.victrix.io/handwriting-moe/DaKanji-v2.0-model.onnx";
export const DEFAULT_LABELS_URL = "https://cdn.victrix.io/handwriting-moe/DaKanji-v2.0-labels.txt";
export const DEFAULT_ORT_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.min.js";

export type TensorLayout = "NCHW" | "NHWC" | "NHW" | "HW" | "FLAT";
export type InputType = "float32" | "uint8";
export type InkColor = "white" | "black";
export type OutputMode = "logits" | "probabilities";

// Runtime configuration shared by preprocessing, model loading, and ranking.
export interface TegakiConfig {
  modelUrl: string;
  ortUrl: string;
  labelsUrl: string;
  width: number;
  height: number;
  layout: TensorLayout;
  inputType: InputType;
  ink: InkColor;
  scale: number;
  mean: number;
  std: number;
  padding: number;
  crop: boolean;
  outputMode: OutputMode;
  topK: number;
  inputName?: string;
  outputName?: string;
}

export const DEFAULT_CONFIG: TegakiConfig = {
  modelUrl: DEFAULT_MODEL_URL,
  ortUrl: DEFAULT_ORT_URL,
  labelsUrl: DEFAULT_LABELS_URL,
  width: 64,
  height: 64,
  layout: "NCHW",
  inputType: "float32",
  ink: "white",
  scale: 1 / 255,
  mean: 0,
  std: 1,
  padding: 0.1,
  crop: true,
  outputMode: "logits",
  topK: 20,
};
