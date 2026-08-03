# QuickCalc 发布说明

## Windows 自动发布

仓库中的 `Release Windows` 工作流监听 `v*` 标签。标签通过版本校验后，GitHub Actions 会在官方 Windows runner 上构建 x64 NSIS 与 MSI 安装包，使用同一 PFX 对主程序和两个安装程序进行 Authenticode 签名，创建非草稿 GitHub Release，并上传两个安装文件。

## 配置 Windows 签名

本地证书默认放在 `cert/cert.pfx`。PFX 包含私钥，已被 `.gitignore` 排除，不应提交到仓库。签名使用 SHA-256，并默认通过 `http://timestamp.digicert.com` 添加 RFC 3161 时间戳。

本地构建前，在当前 PowerShell 会话中设置 PFX 密码：

```powershell
$env:QUICKCALC_CERT_PASSWORD = "你的 PFX 密码"
npm run tauri build
```

如需使用其他证书路径，设置 `QUICKCALC_CERT_PATH`；如需使用其他时间戳服务，设置 `QUICKCALC_TIMESTAMP_URL`。在离线环境中可将后者设为 `none`，但此时签名不会带时间戳。脚本会自动查找 Windows SDK 中的 `signtool.exe`，也可通过 `SIGNTOOL_PATH` 指定。

GitHub Actions 不读取仓库中的 PFX。先在本地把证书转换为 Base64 并复制到剪贴板：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path .\cert\cert.pfx))) | Set-Clipboard
```

然后在 GitHub 仓库的 `Settings → Secrets and variables → Actions` 中添加：

- `WINDOWS_CERTIFICATE_PFX_BASE64`：上一步复制的完整 Base64 文本。
- `WINDOWS_CERTIFICATE_PASSWORD`：PFX 密码。

工作流只在 runner 上临时还原 `cert/cert.pfx`，构建结束后删除。密码仅通过环境变量传给签名脚本，不写入配置或构建产物。

## 发布步骤

1. 同时更新以下三个版本号，三者必须一致：
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
2. 在本地运行：

   ```bash
   RELEASE_TAG=v0.2.1 npm run release:check
   npm test
   npm run build
   ```

3. 将版本修改合并到 `main`。
4. 从该 `main` 提交创建并推送语义化版本标签：

   ```bash
   git tag v0.2.1
   git push origin v0.2.1
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
- 缺少证书 Secret、密码或 Windows SDK 签名工具时，发布会在上传任何未签名产物前失败。

## Windows 签名状态

主程序、NSIS `.exe` 与 MSI 都会自动签名。当前证书是自签名证书，因此签名可以证明文件在签名后未被修改，但只有把证书加入目标设备的受信任证书存储后，Windows 才会信任发布者；未信任的设备仍可能显示发布者或 SmartScreen 警告。正式面向公众发布时，建议换用受信任的代码签名证书或托管签名服务。
