/**
 * slider-captcha-gap — worker source + constants.
 *
 * The worker is spawned from a Blob URL built by buildWorkerSource(), so the
 * package ships as a single JS file and works from any origin: <script>,
 * ES import, userscript, etc.
 *
 * Inference/postprocess ported from Python captcha_recognizer.slider
 * (MIT License, © 2024 Zhao Chenwei)
 * https://github.com/chenwei-zhao/captcha-recognizer
 */

export const CONF_THRESHOLD = 0.5;
export const IOU_THRESHOLD = 0.8;
export const Y_IOU_THRESHOLD = 0.85;
export const IMGSZ = 640;
const NC = 1;           // single class: gap
const MASK_DIM = 32;

const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';

export function buildWorkerSource() {
  return `/* slider-captcha-gap worker (generated) */
/* global ort, importScripts, self */
const CONF_THRESHOLD = ${CONF_THRESHOLD};
const IOU_THRESHOLD = ${IOU_THRESHOLD};
const Y_IOU_THRESHOLD = ${Y_IOU_THRESHOLD};
const IMGSZ = ${IMGSZ};
const NC = ${NC};
const MASK_DIM = ${MASK_DIM};

let session = null;

async function init(modelUrl) {
  if (typeof ort === 'undefined') {
    importScripts(${JSON.stringify(ORT_BASE + 'ort.min.js')});
  }
  ort.env.wasm.numThreads = 1; // page contexts are usually not crossOriginIsolated
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = ${JSON.stringify(ORT_BASE)};
  session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  // Prewarm: first session.run() JIT-compiles the graph and allocates arena
  // buffers (~1-2s in WASM). Do it here so the first user call is as fast as
  // later ones.
  const dummy = new ort.Tensor('float32', new Float32Array(3 * IMGSZ * IMGSZ), [1, 3, IMGSZ, IMGSZ]);
  await session.run({ [session.inputNames[0]]: dummy });
  self.postMessage({ type: 'ready' });
}

function letterboxTensor(source, srcW, srcH) {
  const canvas = new OffscreenCanvas(IMGSZ, IMGSZ);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, IMGSZ, IMGSZ);
  const r = Math.min(IMGSZ / srcH, IMGSZ / srcW);
  const nw = Math.max(1, Math.min(Math.round(srcW * r), IMGSZ));
  const nh = Math.max(1, Math.min(Math.round(srcH * r), IMGSZ));
  const left = Math.round((IMGSZ - nw) / 2);
  const top = Math.round((IMGSZ - nh) / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(source, 0, 0, srcW, srcH, left, top, nw, nh);
  const rgba = ctx.getImageData(0, 0, IMGSZ, IMGSZ).data;
  const n = IMGSZ * IMGSZ;
  const chw = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const b = rgba[i * 4 + 2], g = rgba[i * 4 + 1], r8 = rgba[i * 4];
    chw[i] = b / 255;
    chw[n + i] = g / 255;
    chw[2 * n + i] = r8 / 255;
  }
  return chw;
}

async function identify(source, srcW, srcH) {
  const tensor = new ort.Tensor('float32', letterboxTensor(source, srcW, srcH), [1, 3, IMGSZ, IMGSZ]);
  const feeds = { [session.inputNames[0]]: tensor };
  const results = await session.run(feeds);
  const pred = results[session.outputNames[0]]; // [1, 4+nc+32, 8400]
  const det = nonMaxSuppression(pred, CONF_THRESHOLD, IOU_THRESHOLD, NC)[0];
  if (!det.length) return { box: [], confidence: 0 };
  return pickBest(det, [srcH, srcW]);
}

function nonMaxSuppression(pred, confThres, iouThres, nc) {
  const [, , anchors] = pred.dims;
  const all = [];
  for (let a = 0; a < anchors; a++) {
    let best = -1;
    for (let c = 4; c < 4 + nc; c++) {
      const v = pred.data[c * anchors + a];
      if (v > best) best = v;
    }
    if (best > confThres) {
      const cx = pred.data[0 * anchors + a];
      const cy = pred.data[1 * anchors + a];
      const w = pred.data[2 * anchors + a];
      const h = pred.data[3 * anchors + a];
      all.push({ x1: cx - w/2, y1: cy - h/2, x2: cx + w/2, y2: cy + h/2, conf: best });
    }
  }
  if (!all.length) return [[]];
  all.sort((p, q) => q.conf - p.conf);
  const keep = [];
  for (const cand of all) {
    if (keep.every(k => iouRect(k, cand) <= iouThres)) keep.push(cand);
  }
  return [keep];
}

function iouRect(a, b) {
  const xx1 = Math.max(a.x1, b.x1), yy1 = Math.max(a.y1, b.y1);
  const xx2 = Math.min(a.x2, b.x2), yy2 = Math.min(a.y2, b.y2);
  const w = Math.max(0, xx2 - xx1), h = Math.max(0, yy2 - yy1);
  const inter = w * h;
  const uni = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return uni > 0 ? inter / uni : 0;
}

function pickOutMask(cands) {
  if (cands.length === 1) return cands[0];
  const sorted = [...cands].sort((a, b) => a.x1 - b.x1);
  const slider = sorted[0];
  const rest = sorted.slice(1);
  const yFiltered = rest.filter(b => yIou([slider.y1, slider.y2], [b.y1, b.y2]) > Y_IOU_THRESHOLD);
  const pool = yFiltered.length ? yFiltered : rest;
  if (pool.length === 1) return pool[0];
  let best = pool[0], bestScore = -1;
  for (const cand of pool) {
    const sc = iouRect(slider, cand);
    if (sc > bestScore) { bestScore = sc; best = cand; }
  }
  return best;
}

function yIou([ay1, ay2], [by1, by2]) {
  const inter = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  const uni = (ay2 - ay1) + (by2 - by1) - inter;
  return uni > 0 ? inter / uni : 0;
}

function scaleBoxes(boxes, origShape) {
  const [oh, ow] = origShape;
  const gain = Math.min(IMGSZ / oh, IMGSZ / ow);
  const padX = Math.round((IMGSZ - ow * gain) / 2);
  const padY = Math.round((IMGSZ - oh * gain) / 2);
  for (const b of boxes) {
    b.x1 = clamp((b.x1 - padX) / gain, 0, ow);
    b.y1 = clamp((b.y1 - padY) / gain, 0, oh);
    b.x2 = clamp((b.x2 - padX) / gain, 0, ow);
    b.y2 = clamp((b.y2 - padY) / gain, 0, oh);
  }
  return boxes;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function pickBest(cands, origShape) {
  const scaled = scaleBoxes(cands, origShape);
  const best = pickOutMask(scaled);
  return { box: [best.x1, best.y1, best.x2, best.y2], confidence: best.conf };
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      await init(msg.modelUrl);
      return;
    }
    if (msg.type === 'identify') {
      if (!session) throw new Error('worker not initialized');
      const res = await identify(msg.bitmap, msg.bitmap.width, msg.bitmap.height);
      if (msg.bitmap) msg.bitmap.close();
      self.postMessage({ id: msg.id, ...res });
    } else if (msg.type === 'identifyData') {
      if (!session) throw new Error('worker not initialized');
      const c = new OffscreenCanvas(msg.width, msg.height);
      c.getContext('2d').putImageData(new ImageData(msg.data, msg.width, msg.height), 0, 0);
      const res = await identify(c, msg.width, msg.height);
      self.postMessage({ id: msg.id, ...res });
    }
  } catch (err) {
    self.postMessage({ id: msg.id, error: String((err && err.stack) || err) });
  }
};
`;
}
