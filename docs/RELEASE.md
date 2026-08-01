# QuickCalc 发布说明

## Windows 自动发布

仓库中的 `Release Windows` 工作流监听 `v*` 标签。标签通过版本校验后，GitHub Actions 会在官方 Windows runner 上构建 x64 NSIS 与 MSI 安装包，创建非草稿 GitHub Release，并上传两个安装文件。

## 发布步骤

1. 同时更新以下三个版本号，三者必须一致：
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
2. 在本地运行：

   ```bash
   RELEASE_TAG=v0.1.0 npm run release:check
   npm test
   npm run build
   ```

3. 将版本修改合并到 `main`。
4. 从该 `main` 提交创建并推送语义化版本标签：

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. 在仓库 Actions 页面查看 `Release Windows`。成功后，Release 页面会出现：
   - `QuickCalc_<version>_windows_x64_nsis.exe`
   - `QuickCalc_<version>_windows_x64_msi.msi`

带连字符的版本（例如 `v0.2.0-beta.1`）会自动标记为预发布版本。

## 失败保护

- 标签必须是 `v<semver>`，例如 `v0.1.0`。
- 标签版本必须与三个应用版本号一致，否则不会构建或发布。
- 同一标签的重复运行不会并发执行。
- Release 使用仓库自带的 `GITHUB_TOKEN`，工作流仅申请 `contents: write` 权限。

## Windows 签名状态

当前安装包未签名，可以安装，但浏览器下载后可能触发 Windows SmartScreen。正式对外发布前应接入受信任的代码签名证书或 Azure Artifact Signing，并把证书材料保存在 GitHub Actions Secrets 中；不要将证书或密码提交到仓库。
