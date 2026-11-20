# Moji-Moe

A kanji and kana optical character recognition Svelte component, packaged to be used from plain HTML. Just draw a kana/kanji and get ranked recognition candidates to copy to clipboard. Ppowered by an ONNX model (DaKanji v2.0) running in the browser via onnxruntime-web.

## Features

- Handwriting recognition for Japanese kanji and kana
- Runs entirely in the browser (no server-side processing)
- Portable `<moji-moe>` custom element, built with Svelte
- Configurable model input preprocessing (tensor layout, normalization, ink color, cropping, top-K results)

## Preview

Click [here]() for a live web preview.

## Build

```bash
npm install
npm run build
```

This outputs `dist/moji-moe.js`.

## Usage

Include the built bundle and place the element in your HTML:

```html
<script type="module" src="./dist/moji-moe.js"></script>
<moji-moe></moji-moe>
```

You can also import it from JavaScript/TypeScript:

```ts
import { MojiMoe, DEFAULT_CONFIG } from "moji-moe";
import type { Candidate, MojiConfig } from "moji-moe";
```

## Configuration

The component can be configured with a `MojiConfig` object (see [src/config.ts](src/config.ts)). Defaults point to remotely hosted model assets:

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

## Credit

Based on the [DaKanji](https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition) model.
