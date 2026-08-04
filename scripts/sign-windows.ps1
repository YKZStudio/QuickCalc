param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$TargetPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$diagnosticPath = Join-Path $repoRoot "cert\signing.log"

function Write-SigningDiagnostic {
    param([Parameter(Mandatory = $true)][string]$Message)

    $timestamp = (Get-Date).ToUniversalTime().ToString("o")
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -LiteralPath $diagnosticPath -Value $line
}

function Resolve-ConfiguredPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$BasePath
    )

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $BasePath $Path))
}

function Find-SignTool {
    $configuredPath = [Environment]::GetEnvironmentVariable("SIGNTOOL_PATH")
    if (-not [string]::IsNullOrWhiteSpace($configuredPath)) {
        $resolvedPath = Resolve-ConfiguredPath -Path $configuredPath -BasePath $repoRoot
        if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
            throw "SIGNTOOL_PATH points to a missing file: $resolvedPath"
        }
        return $resolvedPath
    }

    $pathCommand = Get-Command "signtool.exe" -ErrorAction SilentlyContinue
    if ($null -ne $pathCommand) {
        return $pathCommand.Source
    }

    $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
    if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) {
        $sdkRoot = Join-Path $programFilesX86 "Windows Kits\10\bin"
        if (Test-Path -LiteralPath $sdkRoot -PathType Container) {
            $candidate = Get-ChildItem -LiteralPath $sdkRoot -Directory |
                Sort-Object -Property Name -Descending |
                ForEach-Object { Join-Path $_.FullName "x64\signtool.exe" } |
                Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
                Select-Object -First 1

            if ($null -ne $candidate) {
                return $candidate
            }
        }
    }

    throw "signtool.exe was not found. Install the Windows SDK, or set SIGNTOOL_PATH to signtool.exe."
}

$resolvedTarget = Resolve-ConfiguredPath -Path $TargetPath -BasePath (Get-Location).Path
if (-not (Test-Path -LiteralPath $resolvedTarget -PathType Leaf)) {
    throw "The file to sign does not exist: $resolvedTarget"
}

$configuredCertificatePath = [Environment]::GetEnvironmentVariable("QUICKCALC_CERT_PATH")
if ([string]::IsNullOrWhiteSpace($configuredCertificatePath)) {
    $configuredCertificatePath = "cert\cert.pfx"
}
$certificatePath = Resolve-ConfiguredPath -Path $configuredCertificatePath -BasePath $repoRoot
if (-not (Test-Path -LiteralPath $certificatePath -PathType Leaf)) {
    throw "The signing certificate does not exist: $certificatePath"
}

$certificatePassword = [Environment]::GetEnvironmentVariable("QUICKCALC_CERT_PASSWORD")
if ($null -eq $certificatePassword) {
    throw "QUICKCALC_CERT_PASSWORD is not set. Set it to the password for cert/cert.pfx before building installers."
}

try {
    $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
        $certificatePath,
        $certificatePassword,
        [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
    )
} catch {
    throw "The PFX could not be opened. Check QUICKCALC_CERT_PASSWORD and the certificate file."
}
if (-not $certificate.HasPrivateKey) {
    throw "The configured PFX does not contain a private key and cannot sign files."
}
$certificateSubject = $certificate.Subject
$certificate.Dispose()

$signTool = Find-SignTool
$baseSignArguments = @(
    "sign",
    "/fd", "SHA256",
    "/f", $certificatePath,
    "/p", $certificatePassword
)

function Invoke-SignTool {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Description
    )

    Write-SigningDiagnostic "Signing $([System.IO.Path]::GetFileName($resolvedTarget)): $Description"
    $commandArguments = @($Arguments) + $resolvedTarget
    # signtool writes ordinary failures to stderr. Do not let PowerShell turn that
    # native stderr into a terminating error before it can be recorded or retried.
    # PSNativeCommandUseErrorActionPreference only exists in PowerShell 7.3 and
    # newer, while Tauri deliberately invokes this script with Windows PowerShell
    # 5.1 through powershell.exe. Access it through Get-Variable so StrictMode does
    # not abort the signing process on Windows PowerShell.
    $previousErrorActionPreference = $ErrorActionPreference
    $nativeCommandPreference = Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
    $previousNativeCommandPreference = $null
    if ($null -ne $nativeCommandPreference) {
        $previousNativeCommandPreference = $nativeCommandPreference.Value
    }
    $ErrorActionPreference = "Continue"
    if ($null -ne $nativeCommandPreference) {
        Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $false
    }
    try {
        $signOutput = & $signTool @commandArguments 2>&1
        $exitCode = $LASTEXITCODE
    } catch {
        Write-SigningDiagnostic "signtool.exe could not be invoked: $($_.Exception.Message)"
        throw
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
        if ($null -ne $nativeCommandPreference) {
            Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $previousNativeCommandPreference
        }
    }
    foreach ($line in @($signOutput)) {
        Write-SigningDiagnostic ([string]$line)
    }
    return $exitCode -eq 0
}

$configuredTimestampUrls = [Environment]::GetEnvironmentVariable("QUICKCALC_TIMESTAMP_URLS")
if ([string]::IsNullOrWhiteSpace($configuredTimestampUrls)) {
    $configuredTimestampUrls = "http://timestamp.digicert.com;http://timestamp.sectigo.com"
}
$timestampUrls = $configuredTimestampUrls.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries) |
    ForEach-Object { $_.Trim() }

$signed = $false
if ($timestampUrls.Count -eq 1 -and $timestampUrls[0] -eq "none") {
    $signed = Invoke-SignTool -Arguments $baseSignArguments -Description "without timestamp (explicitly configured)"
} else {
    foreach ($timestampUrl in $timestampUrls) {
        $timestampArguments = $baseSignArguments + @("/tr", $timestampUrl, "/td", "SHA256")
        if (Invoke-SignTool -Arguments $timestampArguments -Description "with RFC3161 timestamp $timestampUrl") {
            $signed = $true
            break
        }
        Write-SigningDiagnostic "Timestamp endpoint failed: $timestampUrl"
    }
}

if (-not $signed) {
    Write-SigningDiagnostic "All configured timestamp endpoints failed; retrying the signed build without a timestamp."
    $signed = Invoke-SignTool -Arguments $baseSignArguments -Description "without timestamp fallback"
}
if (-not $signed) {
    throw "signtool.exe failed; inspect cert/signing.log for the complete diagnostic output."
}

Write-SigningDiagnostic "Signed $([System.IO.Path]::GetFileName($resolvedTarget)); signer: $certificateSubject"
