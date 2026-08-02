param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$TargetPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot

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
$certificate.Dispose()

$signTool = Find-SignTool
$signArguments = @(
    "sign",
    "/fd", "SHA256",
    "/f", $certificatePath,
    "/p", $certificatePassword
)

$timestampUrl = [Environment]::GetEnvironmentVariable("QUICKCALC_TIMESTAMP_URL")
if ([string]::IsNullOrWhiteSpace($timestampUrl)) {
    $timestampUrl = "http://timestamp.digicert.com"
}
if ($timestampUrl -ne "none") {
    $signArguments += @("/tr", $timestampUrl, "/td", "SHA256")
}

$signArguments += $resolvedTarget

Write-Host "Signing $([System.IO.Path]::GetFileName($resolvedTarget)) with SHA-256..."
& $signTool @signArguments
if ($LASTEXITCODE -ne 0) {
    throw "signtool.exe failed with exit code $LASTEXITCODE while signing $resolvedTarget"
}

$signature = Get-AuthenticodeSignature -LiteralPath $resolvedTarget
if ($null -eq $signature.SignerCertificate -or $signature.Status -eq "NotSigned" -or $signature.Status -eq "HashMismatch") {
    throw "The Authenticode signature check failed for $resolvedTarget (status: $($signature.Status))."
}

Write-Host "Signed $([System.IO.Path]::GetFileName($resolvedTarget)); signer: $($signature.SignerCertificate.Subject)"
