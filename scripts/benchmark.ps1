param(
  [string]$Executable = "src-tauri\target\release\quickcalc.exe",
  [int]$IdleSeconds = 10
)

$ErrorActionPreference = "Stop"

Write-Host "10k evaluator benchmark"
cargo test --release --manifest-path src-tauri\Cargo.toml benchmark_ten_thousand_expressions -- --nocapture

if (-not (Test-Path -LiteralPath $Executable)) {
  Write-Warning "未找到 $Executable。运行 npm run tauri build 后，可再次执行此脚本采集冷启动、空闲 CPU 和常驻内存。"
  exit 0
}

$watch = [Diagnostics.Stopwatch]::StartNew()
$process = Start-Process -FilePath $Executable -PassThru
for ($attempt = 0; $attempt -lt 100 -and -not $process.Responding; $attempt++) { Start-Sleep -Milliseconds 50 }
$watch.Stop()
Start-Sleep -Seconds $IdleSeconds
$process.Refresh()
[pscustomobject]@{
  ColdStartMs = $watch.ElapsedMilliseconds
  IdleCpuSeconds = [math]::Round($process.TotalProcessorTime.TotalSeconds, 3)
  WorkingSetMiB = [math]::Round($process.WorkingSet64 / 1MB, 1)
  PrivateMemoryMiB = [math]::Round($process.PrivateMemorySize64 / 1MB, 1)
} | Format-List
Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
