# Windows 手动发布

`Build Windows Installers` 工作流会在 `main` 推送或手动触发时，构建并签名 x64/ARM64 的 NSIS 与 MSI 安装包，将它们作为 Actions artifacts 上传；它不会创建或更新 GitHub Release。

## 发布 v0.2.2

1. 确认 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 的版本一致。
2. 运行 `npm test`、`npm run build` 与 `cargo test --manifest-path src-tauri/Cargo.toml`。
3. 在 Actions 手动触发 `Build Windows Installers`，下载两个架构的 artifacts。
4. 在 GitHub Releases 页面手动创建对应标签（例如 `v0.2.2`），填写发行说明并上传下载的 `.exe` 与 `.msi`。

如需本地版本检查，可运行：

```powershell
$env:RELEASE_TAG = "v0.2.2"
npm run release:check
```
