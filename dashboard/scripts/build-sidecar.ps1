$ErrorActionPreference = "Stop"

# 1. Ensure Rust Cargo bin is in PATH
$cargoPath = "C:\Users\ADMIN\.cargo\bin"
if ($env:PATH -notlike "*$cargoPath*") {
    $env:PATH = "$cargoPath;$env:PATH"
}

# 2. Resolve repository paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dashboardDir = Split-Path -Parent $scriptDir
$repoRoot = Split-Path -Parent $dashboardDir
$binariesDir = Join-Path $dashboardDir "src-tauri\binaries"
$scraperScript = Join-Path $repoRoot "Scraper.py"
$buildWorkDir = Join-Path $dashboardDir "src-tauri\target\pyinstaller-build"
$distWorkDir = Join-Path $dashboardDir "src-tauri\target\pyinstaller-dist"

if (-not (Test-Path $scraperScript)) {
    Write-Error "Scraper.py not found at $scraperScript"
    exit 1
}

New-Item -ItemType Directory -Force -Path $binariesDir | Out-Null
New-Item -ItemType Directory -Force -Path $buildWorkDir | Out-Null
New-Item -ItemType Directory -Force -Path $distWorkDir | Out-Null

# 3. Query rustc for the exact host target triple (e.g. x86_64-pc-windows-msvc)
$rustcVersionOutput = & rustc -vV
$hostLine = $rustcVersionOutput | Where-Object { $_ -match "^host:\s+(.+)$" }
if (-not $hostLine) {
    Write-Error "Failed to detect host target triple from rustc -vV"
    exit 1
}
$targetTriple = ($hostLine -replace "^host:\s+", "").Trim()
Write-Host "[Sidecar Build] Target Triple: $targetTriple" -ForegroundColor Cyan

$targetSidecarPath = Join-Path $binariesDir "spotscraper-engine-$targetTriple.exe"

# Fast-path check if already built recently in CI or local
if ((Test-Path $targetSidecarPath) -and ($env:CI -eq "true")) {
    Write-Host "[Sidecar Build] Pre-built sidecar already present in CI at $targetSidecarPath" -ForegroundColor Green
    exit 0
}

# 4. Ensure PyInstaller, yt-dlp, mutagen, and certifi are installed
Write-Host "[Sidecar Build] Verifying Python build dependencies..." -ForegroundColor Cyan
& python -m pip install --upgrade pyinstaller yt-dlp mutagen certifi requests python-json-logger

# 5. Detect optional local or PATH ffmpeg.exe & ffprobe.exe to bundle inside the sidecar
$addBinaryArgs = @()
$ffmpegCmd = Get-Command "ffmpeg.exe" -ErrorAction SilentlyContinue
$ffprobeCmd = Get-Command "ffprobe.exe" -ErrorAction SilentlyContinue

if (Test-Path (Join-Path $repoRoot "ffmpeg.exe")) {
    $ffmpegPath = Join-Path $repoRoot "ffmpeg.exe"
    $addBinaryArgs += @("--add-binary", "$ffmpegPath;.")
    Write-Host "[Sidecar Build] Bundling repo ffmpeg.exe" -ForegroundColor Green
} elseif ($ffmpegCmd) {
    $addBinaryArgs += @("--add-binary", "$($ffmpegCmd.Source);.")
    Write-Host "[Sidecar Build] Bundling PATH ffmpeg.exe from $($ffmpegCmd.Source)" -ForegroundColor Green
}

if (Test-Path (Join-Path $repoRoot "ffprobe.exe")) {
    $ffprobePath = Join-Path $repoRoot "ffprobe.exe"
    $addBinaryArgs += @("--add-binary", "$ffprobePath;.")
} elseif ($ffprobeCmd) {
    $addBinaryArgs += @("--add-binary", "$($ffprobeCmd.Source);.")
}

# 6. Compile Scraper.py into a single standalone executable using PyInstaller
Write-Host "[Sidecar Build] Compiling Scraper.py with PyInstaller..." -ForegroundColor Cyan
$pyInstallerArgs = @(
    "-m", "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--noconsole",
    "--name", "spotscraper-engine",
    "--distpath", $distWorkDir,
    "--workpath", $buildWorkDir,
    "--specpath", $buildWorkDir,
    "--collect-all", "yt_dlp",
    "--collect-all", "mutagen",
    "--collect-all", "certifi"
) + $addBinaryArgs + @($scraperScript)

& python @pyInstallerArgs

# 7. Move and rename with Tauri v2 target triple suffix
$compiledExe = Join-Path $distWorkDir "spotscraper-engine.exe"

if (-not (Test-Path $compiledExe)) {
    Write-Error "PyInstaller failed to produce $compiledExe"
    exit 1
}

Copy-Item -Path $compiledExe -Destination $targetSidecarPath -Force
Write-Host "[Sidecar Build] Successfully created sidecar: $targetSidecarPath" -ForegroundColor Green

# 8. Smoke-test the compiled sidecar binary
$versionCheck = & $targetSidecarPath --version-check
Write-Host "[Sidecar Build] Smoke Test Output: $versionCheck" -ForegroundColor Green
