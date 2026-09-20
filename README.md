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
// @require https://cdn.jsdelivr.net/npm/captcha-recognizer-js@1.0.3/dist/captcha-recognizer-js.umd.js
// @connect cdn.jsdelivr.net
// @connect unpkg.com
...
const rec = await CaptchaRecognizerJs.createRecognizer();
const { box, confidence } = await rec.detect(bitmap);
```

> **版本锁定建议**：jsdelivr 对 `@1` 这类 semver 范围路径有边缘缓存，新版本发布后可能延迟刷新。userscript 建议锁定精确版本号（如 `@1.0.3`），或发布后到 [purge.jsdelivr.net](https://purge.jsdelivr.net) 手动刷新。

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

### `recognizer.detect(source, opts?)` → `Promise<{box, confidence, naturalWidth, naturalHeight}>`

- `source`: `ImageBitmap` | `HTMLCanvasElement` | `OffscreenCanvas` | `Blob` | `{data,width,height}`（RGBA `Uint8ClampedArray`）
- `opts.displayWidth` / `opts.displayHeight`（可选）— 展示区域宽高。验证码图片在页面上被缩放渲染时（如 CSS 缩放），传入实际渲染尺寸，返回的 `box` 将映射为**展示区域坐标系**；不传则默认为图片原始尺寸（不换算）
- `box`: `[x1, y1, x2, y2]` 缺口左上 / 右下坐标（展示坐标系，见上）
- `confidence`: 0-1 置信度
- `naturalWidth` / `naturalHeight`: 输入图片的原始像素尺寸（用于反向换算）

```js
// 图片原始 278×155，页面渲染为 556×310（2 倍）：
const { box } = await rec.detect(bitmap, { displayWidth: 556, displayHeight: 310 });
// box 坐标已映射到展示区域，可直接用于模拟拖拽距离

// 不传 opts → box 为原图像素坐标（向后兼容）
```

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

## 发布

版本发布为全自动流程：合并到 `main` 后执行 `npm version patch|minor|major && git push --follow-tags`，GitHub Actions 自动构建、发布到 npm（Trusted Publisher / OIDC）并创建 Release。详见 [RELEASING.md](./RELEASING.md)。

## 兼容性

Chrome / Edge 80+, Firefox 114+, Safari 16.4+（需要 `OffscreenCanvas`、`Worker`、`WebAssembly SIMD`）。

依赖 [onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web) ^1.20.1（运行时从 jsDelivr CDN 加载，MIT）。

## 免责声明

本项目仅供学习交流，不得用于非法用途。不针对任何验证码厂商。

## License

MIT — 详见 [LICENSE](./LICENSE)