# Windows 签名证书

本地签名默认读取本目录下的 `cert.pfx`。PFX 包含私钥，已被 `.gitignore` 排除，不能提交到仓库。

签名密码通过 `QUICKCALC_CERT_PASSWORD` 环境变量传入；也可用 `QUICKCALC_CERT_PATH` 覆盖证书路径。GitHub Actions 使用仓库 Secrets 临时还原证书，构建结束后会删除临时文件。
