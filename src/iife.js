/**
 * IIFE entry — exposes globals for <script> and userscript usage.
 * Global name: CaptchaRecognizerJs
 */
import { createRecognizer, MODEL_URL, CONF_THRESHOLD, IOU_THRESHOLD, IMGSZ } from './api.js';

export { createRecognizer, MODEL_URL, CONF_THRESHOLD, IOU_THRESHOLD, IMGSZ };

// UMD-ish attach for userscript managers (GM_*) and plain <script>:
if (typeof window !== 'undefined') {
  window.CaptchaRecognizerJs = { createRecognizer, MODEL_URL, CONF_THRESHOLD, IOU_THRESHOLD, IMGSZ };
}
if (typeof self !== 'undefined' && typeof self.sliderCaptchaGap === 'undefined') {
  self.sliderCaptchaGap = { createRecognizer, MODEL_URL, CONF_THRESHOLD, IOU_THRESHOLD, IMGSZ };
}
