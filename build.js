#!/usr/bin/env node
/**
 * Build: bundles src/ into dist/. Uses esbuild.
 * The worker is generated at runtime from a template string, so bundles are
 * tiny (~6KB each). The 15MB model is NOT bundled — it's shipped in model/
 * and fetched from CDN at runtime.
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = __dirname;
const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  target: ['es2020'],
  logLevel: 'info',
};

async function main() {
  // ESM (import in modern apps)
  await esbuild.build({
    entryPoints: [path.join(root, 'src/api.js')],
    outfile: path.join(outDir, 'captcha-recognizer-js.esm.js'),
    format: 'esm',
    bundle: true, minify: true, target: ['es2020'], logLevel: 'info',
  });

  // IIFE (plain <script>, window.CaptchaRecognizerJs) — also serves as UMD body
  await esbuild.build({
    entryPoints: [path.join(root, 'src/iife.js')],
    outfile: path.join(outDir, 'captcha-recognizer-js.iife.js'),
    format: 'iife',
    globalName: 'CaptchaRecognizerJs',
    bundle: true, minify: true, target: ['es2020'],
  });

  // CJS (require() — userscript managers like Tampermonkey @require)
  await esbuild.build({
    entryPoints: [path.join(root, 'src/api.js')],
    outfile: path.join(outDir, 'captcha-recognizer-js.cjs'),
    format: 'cjs',
    platform: 'browser',
    bundle: true, minify: true, target: ['es2020'],
  });

  // UMD = IIFE body + UMD header
  const iife = fs.readFileSync(path.join(outDir, 'captcha-recognizer-js.iife.js'), 'utf8');
  const umd = `/*! captcha-recognizer-js UMD */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) { define([], function () { return factory(); }); }
  else if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.CaptchaRecognizerJs = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  var exports = {};
${iife.replace(/^\/\/.*$/gm, '').trim()}
  return typeof CaptchaRecognizerJs !== 'undefined' ? CaptchaRecognizerJs : exports;
});
`;
  fs.writeFileSync(path.join(outDir, 'captcha-recognizer-js.umd.js'), umd);

  console.log('build complete');
}

main().catch(e => { console.error(e); process.exit(1); });
