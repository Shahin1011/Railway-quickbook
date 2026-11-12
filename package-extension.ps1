# =============================================================================
# Railway QuickBook – Chrome Extension Packaging & Verification Script (Phase 6)
# =============================================================================

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = Join-Path $rootDir "dist"

Write-Host "🔍 Validating manifest.json..." -ForegroundColor Cyan
$manifestPath = Join-Path $rootDir "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$extName = $manifest.name
$extVer = $manifest.version
$extMVer = $manifest.manifest_version
Write-Host "✅ Extension: $extName v$extVer [Manifest V$extMVer]" -ForegroundColor Green

# Verify all required files exist
$requiredFiles = @(
    "manifest.json",
    "popup\popup.html",
    "popup\popup.css",
    "popup\popup.js",
    "content\content.css",
    "content\content.js",
    "background\service-worker.js",
    "utils\i18n.js",
    "utils\stations-data.js",
    "assets\icon-16.png",
    "assets\icon-48.png",
    "assets\icon-128.png"
)

foreach ($file in $requiredFiles) {
    $fullPath = Join-Path $rootDir $file
    if (-not (Test-Path $fullPath)) {
        throw "❌ Missing required file: $file"
    }
}
Write-Host "✅ All $($requiredFiles.Count) core extension files verified!" -ForegroundColor Green

# Create dist folder and zip package
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$zipPath = Join-Path $distDir "railway-quickbook-v$($manifest.version).zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

$itemsToZip = @(
    (Join-Path $rootDir "manifest.json"),
    (Join-Path $rootDir "popup"),
    (Join-Path $rootDir "content"),
    (Join-Path $rootDir "background"),
    (Join-Path $rootDir "utils"),
    (Join-Path $rootDir "assets")
)

Compress-Archive -Path $itemsToZip -DestinationPath $zipPath -Force
Write-Host "📦 Packaged extension created at: $zipPath" -ForegroundColor Yellow
