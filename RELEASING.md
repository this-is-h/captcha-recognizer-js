# Releasing

## 流程（GitHub Flow + 标签触发发布）

1. 在 `main` 上完成功能/修复（feature 分支 + PR 合并）。
2. 发布新版本：

   ```bash
   npm version patch   # 或 minor / major
   git push --follow-tags
   ```

   这会创建 `v1.x.y` 标签并推送，触发 `release.yml` workflow。

3. Workflow 自动完成：
   - `npm ci` + `node build.js`（构建 esm/cjs/iife/umd 四个 bundle）
   - 校验 `package.json` 版本与 tag 一致（不一致时自动同步并提交）
   - `npm publish --access public --provenance`（**Trusted Publisher / OIDC**，无需 NPM_TOKEN secret）
   - 创建 GitHub Release（自动生成 release notes）

## 前置配置（仅一次）

在 npmjs.com 上为包配置 Trusted Publisher：

1. 打开 https://www.npmjs.com/package/captcha-recognizer-js → **Settings** → **Trusted Publisher**（或首次发布时在发布页绑定）
2. 填写：
   - Repository owner: `this-is-h`
   - Repository name: `captcha-recognizer-js`
   - Workflow filename: `.github/workflows/release.yml`

之后每次合并代码到 `main` 后，只需：

```bash
npm version patch|minor|major   # 更新 package.json 并打 tag
git push --follow-tags          # 推送提交 + 标签，触发发布
```

## 手动触发

Actions 页面 → **Release** → **Run workflow** → 选择 bump 类型（patch/minor/major）。workflow 会自动 bump、打 tag、push、构建并发布。

## 首次使用 Trusted Publisher 注意

npm 的 Trusted Publisher 绑定的是 **包名 + 仓库 + workflow 文件路径**。因为该包已存在（1.0.0/1.0.1 由本地发布），首次 CI 发布前需在 npmjs.com 上把包的 Trusted Publisher 配置好，否则 OIDC 发布会被拒绝（`403 E_OIDC`）。
