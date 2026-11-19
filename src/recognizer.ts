import { rankOutput, type Candidate } from "./core";
import type { MojiConfig } from "./config";

// Minimal shape of the onnxruntime-web global needed by this module. The real
// package is loaded from a CDN <script> tag at runtime (see loadOrt below), so we
// avoid taking an npm dependency on `onnxruntime-web` just for types.
interface OrtTensor {
  data: ArrayLike<number>;
  dims: readonly number[];
  dispose(): void;
}

interface OrtTensorConstructor {
  new (type: "float32" | "uint8", data: ArrayLike<number>, dims: readonly number[]): OrtTensor;
}

interface OrtInferenceSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
}

interface OrtNamespace {
  env: { wasm: { numThreads: number; wasmPaths: string } };
  InferenceSession: { create(bytes: Uint8Array, options: { executionProviders: string[] }): Promise<OrtInferenceSession> };
  Tensor: OrtTensorConstructor;
}

declare global {
  interface Window {
    ort?: OrtNamespace;
  }
}

// ONNX Runtime is loaded once per URL and reused across recognizer instances.
let ortLoadPromise: Promise<OrtNamespace> | null = null;
let loadedOrtUrl: string | null = null;

function readOrtGlobal(): OrtNamespace {
  const ort = (globalThis as { ort?: OrtNamespace }).ort;
  if (!ort || typeof ort !== "object") {
    throw new Error('ONNX Runtime loaded but global "ort" is unavailable.');
  }
  if (!ort.env?.wasm) {
    throw new Error("ONNX Runtime does not expose wasm environment settings.");
  }
  if (typeof ort.InferenceSession?.create !== "function") {
    throw new Error("ONNX Runtime does not expose InferenceSession.create().");
  }
  if (typeof ort.Tensor !== "function") {
    throw new Error("ONNX Runtime does not expose Tensor.");
  }
  return ort;
}

function configureOrt(ort: OrtNamespace, ortUrl: string): void {
  // Single-threaded WASM keeps the browser model lightweight and avoids overusing worker resources.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = new URL("./", ortUrl).href;
}

async function loadOrt(ortUrl: string): Promise<OrtNamespace> {
  if (typeof ortUrl !== "string" || ortUrl.trim() === "") {
    throw new Error("config.ortUrl must be a non-empty string URL.");
  }
  const normalizedOrtUrl = new URL(ortUrl, document.baseURI).href;

  if (loadedOrtUrl && loadedOrtUrl !== normalizedOrtUrl) {
    throw new Error(`ONNX Runtime is already loaded from ${loadedOrtUrl}; cannot load ${normalizedOrtUrl}.`);
  }
  if ((globalThis as { ort?: OrtNamespace }).ort) {
    const ort = readOrtGlobal();
    configureOrt(ort, normalizedOrtUrl);
    loadedOrtUrl = normalizedOrtUrl;
    return ort;
  }
  if (!ortLoadPromise) {
    ortLoadPromise = new Promise<OrtNamespace>((resolve, reject) => {
      const existingScript = Array.from(document.scripts).find(script => script.src === normalizedOrtUrl);
      const script = existingScript ?? document.createElement("script");
      if (!existingScript) {
        script.src = normalizedOrtUrl;
        script.async = true;
        script.dataset.ortLoader = "true";
      }
      script.addEventListener("load", () => {
        const ort = readOrtGlobal();
        configureOrt(ort, normalizedOrtUrl);
        loadedOrtUrl = normalizedOrtUrl;
        resolve(ort);
      }, { once: true });
      script.addEventListener("error", () => {
        reject(new Error(`Could not load ONNX Runtime script from ${normalizedOrtUrl}.`));
      }, { once: true });
      if (!existingScript) document.head.append(script);
    }).catch(error => {
      ortLoadPromise = null;
      throw error;
    });
  }
  return ortLoadPromise;
}

export class Recognizer {
  private constructor(
    private readonly ort: OrtNamespace,
    private readonly session: OrtInferenceSession,
    readonly settings: MojiConfig,
    private readonly labels: string[] | null,
  ) {}

  // Build an inference session with the configured model and runtime settings.
  static async create(model: Uint8Array, settings: MojiConfig, labels: string[] | null): Promise<Recognizer> {
    const ort = await loadOrt(settings.ortUrl);
    const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
    try {
      if (session.inputNames.length !== 1) throw new Error("This starter supports models with one grayscale image input.");
      if (settings.inputName && !session.inputNames.includes(settings.inputName)) {
        throw new Error(`Unknown input ${settings.inputName}. Available: ${session.inputNames.join(", ")}.`);
      }
      if (settings.outputName && !session.outputNames.includes(settings.outputName)) {
        throw new Error(`Unknown output ${settings.outputName}. Available: ${session.outputNames.join(", ")}.`);
      }
      return new Recognizer(ort, session, { ...settings }, labels);
    } catch (error) {
      await session.release();
      throw error;
    }
  }

  get description(): string {
    return `Input: ${this.session.inputNames.join(", ")} · Output: ${this.session.outputNames.join(", ")}`;
  }

  get hasLabels(): boolean { return this.labels !== null; }

  // Run inference on a prepared image tensor and convert the raw output back into the model's
  // character ranking for display in the UI.
  async recognize(image: { pixels: Uint8Array | Float32Array; dims: number[] }): Promise<Candidate[]> {
    const { ort } = this;
    const input = this.settings.inputType === "float32"
      ? new ort.Tensor("float32", image.pixels, image.dims)
      : new ort.Tensor("uint8", image.pixels, image.dims);
    let outputs: Record<string, OrtTensor> | undefined;
    try {
      outputs = await this.session.run({ [this.settings.inputName ?? this.session.inputNames[0]]: input });
      const tensor = outputs[this.settings.outputName ?? this.session.outputNames[0]];
      if (!tensor || !(tensor.data instanceof Float32Array || tensor.data instanceof Float64Array)) {
        throw new Error("Expected floating-point class scores. Select a classification output in config.ts.");
      }
      return rankOutput(tensor.data, tensor.dims, this.labels, this.settings.outputMode, this.settings.topK);
    } finally {
      input.dispose();
      if (outputs) for (const tensor of Object.values(outputs)) tensor.dispose();
    }
  }

  async dispose(): Promise<void> { await this.session.release(); }
}
