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
   * @param {{displayWidth?: number, displayHeight?: number}} [opts]
   *   Optional display area size. When the captcha image is rendered at a
   *   different size than its natural resolution (e.g. CSS scaling), pass the
   *   rendered size and the returned box is mapped into display coordinates.
   *   Defaults to the source's natural size (no remapping).
   * @returns {Promise<{box:number[], confidence:number}>}
   *   box = [x1,y1,x2,y2] in display coordinates.
   */
  async function detect(source, { displayWidth, displayHeight } = {}) {
    if (source instanceof Blob) {
      source = await createImageBitmap(source);
    }
    if (source && source.data && source.width && source.height) {
      const r = await send({
        type: 'identifyData',
        width: source.width, height: source.height, data: source.data,
      });
      return mapToDisplay(r, source.width, source.height, displayWidth, displayHeight);
    }
    // Normalize any drawable (HTMLCanvasElement / OffscreenCanvas / image
    // element) to an ImageBitmap: postMessage cannot transfer an
    // OffscreenCanvas with a rendering context attached (InvalidStateError).
    // Capture the natural size BEFORE transfer — a transferred ImageBitmap is
    // detached and its width/height read as 0 afterwards.
    if (!(source instanceof ImageBitmap)) {
      source = await createImageBitmap(source);
    }
    const natW = source.width, natH = source.height;
    const r = await send({ type: 'identify', bitmap: source }, [source]);
    return mapToDisplay(r, natW, natH, displayWidth, displayHeight);
  }

  /** Map a model-space box (original image pixels) into display coordinates. */
  function mapToDisplay(res, naturalW, naturalH, displayWidth, displayHeight) {
    const dw = displayWidth ?? naturalW;
    const dh = displayHeight ?? naturalH;
    return {
      box: [
        res.box[0] * (dw / naturalW),
        res.box[1] * (dh / naturalH),
        res.box[2] * (dw / naturalW),
        res.box[3] * (dh / naturalH),
      ],
      confidence: res.confidence,
      naturalWidth: naturalW,
      naturalHeight: naturalH,
    };
  }

  function dispose() { worker.terminate(); URL.revokeObjectURL(workerUrl); }

  await ready;
  return { detect, dispose };
}
