/**
 * slider-captcha-gap — public API.
 *
 * Usage (browser / userscript):
 *   import { createRecognizer, MODEL_URL } from 'slider-captcha-gap';
 *   const rec = await createRecognizer();                    // default CDN model
 *   const { box, confidence } = await rec.detect(imageBitmap);
 *
 * The 15MB int8 ONNX model is fetched from jsdelivr once and HTTP-cached.
 * All inference runs in a Web Worker via ONNX Runtime Web (WASM).
 */

import { buildWorkerSource, CONF_THRESHOLD, IOU_THRESHOLD, IMGSZ } from './core.js';

export { CONF_THRESHOLD, IOU_THRESHOLD, IMGSZ };

export const MODEL_URL =
  'https://cdn.jsdelivr.net/npm/captcha-recognizer-js@1/model/slider.onnx.q8.onnx';

/**
 * @param {{modelUrl?: string}} [opts]
 * @returns {Promise<{detect(source): Promise<{box:number[],confidence:number}>, dispose(): void}>}
 */
export async function createRecognizer({ modelUrl = MODEL_URL } = {}) {
  const blob = new Blob([buildWorkerSource()], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);
  let msgId = 0;
  const pending = new Map();
  let readyResolve, readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });

  worker.onmessage = (e) => {
    const d = e.data;
    if (d.type === 'ready') { readyResolve(); return; }
    const p = pending.get(d.id);
    if (p) {
      pending.delete(d.id);
      d.error ? p.reject(new Error(d.error)) : p.resolve(d);
    }
  };
  worker.onerror = (e) => {
    readyReject(new Error('worker failed: ' + e.message));
    for (const p of pending.values()) p.reject(new Error(e.message));
    pending.clear();
  };

  worker.postMessage({ id: 0, type: 'init', modelUrl });

  function send(msg, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id }, transfer);
    });
  }

  /**
   * @param {ImageBitmap|HTMLCanvasElement|OffscreenCanvas|Blob|
   *         {data:Uint8ClampedArray,width:number,height:number}} source
   * @returns {Promise<{box:number[], confidence:number}>}
   *   box = [x1,y1,x2,y2] in source pixel coordinates.
   */
  async function detect(source) {
    if (source instanceof Blob) {
      source = await createImageBitmap(source);
    }
    if (source && source.data && source.width && source.height) {
      const r = await send({
        type: 'identifyData',
        width: source.width, height: source.height, data: source.data,
      });
      return { box: r.box, confidence: r.confidence };
    }
    if (!(source instanceof ImageBitmap) &&
        !(typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas)) {
      const oc = new OffscreenCanvas(source.width, source.height);
      oc.getContext('2d').drawImage(source, 0, 0);
      source = oc;
    }
    const r = await send({ type: 'identify', bitmap: source }, [source]);
    return { box: r.box, confidence: r.confidence };
  }

  function dispose() { worker.terminate(); URL.revokeObjectURL(workerUrl); }

  await ready;
  return { detect, dispose };
}
