# Tegaki-moe

A kanji and kana handwriting recognition Svelte component, packaged as a standalone web component. Draw a character on the canvas and get ranked recognition candidates, powered by an ONNX model (DaKanji v2.0) running in the browser via onnxruntime-web.

## Features

- Handwriting recognition for Japanese kanji and kana
- Runs entirely in the browser (no server-side inference)
- Framework-agnostic `<tegaki-moe>` custom element, built with Svelte
- Configurable model input preprocessing (tensor layout, normalization, ink color, cropping, top-K results)

## Build

```bash
npm install
npm run build
```

This outputs `dist/tegaki-moe.mjs`.

## Usage

Include the built bundle and place the element in your HTML:

```html
<script type="module" src="./dist/tegaki-moe.mjs"></script>

<tegaki-moe></tegaki-moe>
```

Open [index.html](index.html) for a minimal working example (serve the folder with any static file server after building).

You can also import it from JavaScript/TypeScript:

```ts
import { TegakiMoe, DEFAULT_CONFIG } from "tegaki-moe";
import type { Candidate, TegakiConfig } from "tegaki-moe";
```

## Configuration

The component can be configured with a `TegakiConfig` object (see [src/config.ts](src/config.ts)). Defaults point to remotely hosted model assets:

| Option | Default | Description |
| --- | --- | --- |
| `modelUrl` | DaKanji-v2.0 ONNX model (CDN) | URL of the ONNX recognition model |
| `labelsUrl` | DaKanji-v2.0 labels (CDN) | URL of the character label file |
| `ortUrl` | onnxruntime-web 1.22.0 (CDN) | URL of the ONNX Runtime web bundle |
| `width` / `height` | `64` | Model input dimensions |
| `layout` | `"NCHW"` | Tensor layout (`NCHW`, `NHWC`, `NHW`, `HW`, `FLAT`) |
| `inputType` | `"float32"` | Input tensor type (`float32` or `uint8`) |
| `ink` | `"white"` | Ink color expected by the model |
| `scale` / `mean` / `std` | `1/255`, `0`, `1` | Pixel normalization parameters |
| `padding` | `0.1` | Padding added around the cropped ink |
| `crop` | `true` | Crop to the ink bounding box before inference |
| `outputMode` | `"logits"` | Interpret model output as `logits` or `probabilities` |
| `topK` | `20` | Number of ranked candidates to return |

## License

MIT
