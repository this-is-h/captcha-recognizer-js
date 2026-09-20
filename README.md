# captcha-recognizer-js

[Python captcha-recognizer](https://github.com/chenwei-zhao/captcha-recognizer) 的 JavaScript 移植版：**纯浏览器端**滑块验证码缺口识别。基于 ONNX Runtime Web（WASM）+ Web Worker，无需任何服务器，开箱即用。

## 特性

- **纯前端**：15MB int8 量化 ONNX + 推理全部在浏览器完成，无服务端依赖
- **开箱即用**：`import` / `require` / `<script>` 三种接入方式一行调用
- **Worker 推理**：不阻塞主线程，单张 ~800ms，首次调用与后续等速（内置预热）
- **多输入格式**：`ImageBitmap` / `HTMLCanvasElement` / `Blob` / 原始 RGBA 数据
- **协议**：MIT（识别逻辑与模型源自 [captcha-recognizer](https://github.com/chenwei-zhao/captcha-recognizer)，MIT）

## 安装

```bash
npm install captcha-recognizer-js
```

## 使用

### ES Module

```js
import { createRecognizer } from 'captcha-recognizer-js';

const rec = await createRecognizer();                 // 默认从 jsdelivr 加载 15MB 模型
const { box, confidence } = await rec.detect(bitmap); // box=[x1,y1,x2,y2] 原图像素坐标
```

### Userscript（Tampermonkey 等）

```js
// @require https://cdn.jsdelivr.net/npm/captcha-recognizer-js@1/dist/captcha-recognizer-js.umd.js
// @connect cdn.jsdelivr.net
// @connect unpkg.com
...
const rec = await CaptchaRecognizerJs.createRecognizer();
const { box, confidence } = await rec.detect(bitmap);
```

### `<script>` 标签

```html
<script src="https://cdn.jsdelivr.net/npm/captcha-recognizer-js@1/dist/captcha-recognizer-js.iife.js"></script>
<script>
  const rec = await CaptchaRecognizerJs.createRecognizer();
  const { box, confidence } = await rec.detect(myImageBitmap);
</script>
```

## API

### `createRecognizer({ modelUrl? })` → `Promise<Recognizer>`

加载模型（15MB，浏览器 HTTP 缓存）+ Worker 预热。resolve 后 `detect` 即可直接调用，无首次延迟。

- `modelUrl?: string` — 自定义 ONNX 模型地址（默认从 jsdelivr 读取）

### `recognizer.detect(source)` → `Promise<{box, confidence}>`

- `source`: `ImageBitmap` | `HTMLCanvasElement` | `OffscreenCanvas` | `Blob` | `{data,width,height}`（RGBA `Uint8ClampedArray`）
- `box`: `[x1, y1, x2, y2]` 原图像素坐标（缺口左上 / 右下）
- `confidence`: 0-1 置信度

### `recognizer.dispose()`

终止 Worker，释放资源。

## 自托管模型

15MB 模型默认从 jsdelivr CDN 读取，可自行托管：

```js
const rec = await createRecognizer({
  modelUrl: 'https://your-cdn/slider.onnx.q8.onnx'
});
```

## 模型来源

识别逻辑与模型源自 [captcha-recognizer](https://github.com/chenwei-zhao/captcha-recognizer)（MIT，© 2024 Zhao Chenwei）。

原始 fp32 模型（38.7MB）经 int8 QDQ 量化后降至 15.2MB（坐标误差 < 0.3px，置信度误差 < 0.002）。

## 兼容性

Chrome / Edge 80+, Firefox 114+, Safari 16.4+（需要 `OffscreenCanvas`、`Worker`、`WebAssembly SIMD`）。

依赖 [onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web) ^1.20.1（运行时从 jsDelivr CDN 加载，MIT）。

## 免责声明

本项目仅供学习交流，不得用于非法用途。不针对任何验证码厂商。

## License

MIT — 详见 [LICENSE](./LICENSE)