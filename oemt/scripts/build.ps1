# OEmt.club Windows build: core binaries + OEmt plugin + tests, assembled into an install folder and zip.
#
#   powershell -ExecutionPolicy Bypass -File oemt\scripts\build.ps1            # build + test + package
#   powershell -ExecutionPolicy Bypass -File oemt\scripts\build.ps1 -SkipTests
#
# Needs: Visual Studio 2022 Build Tools (C++ workload), CMake, Bun, Rust. Never touches the Steam
# folder: MILLENNIUM_BUILD_TO_STEAM_PATH is forced OFF. Output: dist\oemt-club-<version>-<time>\ and .zip
#   -ReleasesRepo owner/repo   enables self-update from that public GitHub repo's releases
#                              (default: $env:OEMT_RELEASES_REPO; empty = self-update off)
param([switch]$SkipTests, [string]$ReleasesRepo = $env:OEMT_RELEASES_REPO)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $root

function Step($name) { Write-Host "`n== $name ==" -ForegroundColor Cyan }
function Run($what, [scriptblock]$cmd) {
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" }
}

# --- toolchain -------------------------------------------------------------------------------
Step 'Toolchain'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'Visual Studio C++ build tools not found (install the "Desktop development with C++" workload).' }
cmd /c "`"$vs\Common7\Tools\VsDevCmd.bat`" -arch=x64 -host_arch=x64 >nul 2>nul & set" | ForEach-Object {
    if ($_ -match '=') { $kv = $_.Split('=', 2); Set-Item -Force -Path "ENV:\$($kv[0])" -Value $kv[1] }
}
foreach ($tool in 'cl', 'cmake', 'ninja', 'bun', 'cargo') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool not found on PATH" }
}

# --- core -------------------------------------------------------------------------------------
Step 'Core (CMake windows-release)'
Write-Host "Self-update source: $(if ($ReleasesRepo) { $ReleasesRepo } else { 'none (self-update off)' })"
Run 'cmake configure' { cmake --preset=windows-release -DMILLENNIUM_RUN_TESTS_ON_BUILD=OFF -DMILLENNIUM_BUILD_TO_STEAM_PATH=OFF "-DOEMT_RELEASES_REPO=$ReleasesRepo" }
Run 'cmake build' { cmake --build build }

Step 'Media helper (oemt-media.exe)'
New-Item -ItemType Directory -Force build\media-helper | Out-Null
Run 'cl oemt-media' { cl /nologo /EHsc /std:c++20 /O2 /MT /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /DNOMINMAX oemt\media-helper\main.cpp /Fo:build\media-helper\ /Fe:build\media-helper\oemt-media.exe /link windowsapp.lib ole32.lib /SUBSYSTEM:CONSOLE }

# --- plugin -----------------------------------------------------------------------------------
Step 'starlight (plugin packer)'
$starlight = Join-Path $root 'starlight\target\release\starlight.exe'
Run 'cargo build' { cargo build --release --manifest-path starlight\Cargo.toml }

Step 'OEmt plugin'
Push-Location oemt\plugin
try {
    Run 'bun install' { bun install }
    Run 'type-check' { bun x tsc --noEmit -p tsconfig.json }
} finally { Pop-Location }
New-Item -ItemType Directory -Force build\oemt-plugin | Out-Null
Run 'starlight pack' { & $starlight pack -d oemt\plugin --of build\oemt-plugin --release }
Run 'starlight verify' { & $starlight verify build\oemt-plugin\club.oemt.core.star }

# --- tests ------------------------------------------------------------------------------------
if (-not $SkipTests) {
    Step 'Tests'
    Run 'ctest' { ctest --test-dir build --output-on-failure --timeout 120 }
    Run 'OEmt Lua tests' { .\build\luajit.exe oemt\tests\lua\run.lua }
    Run 'OEmt frontend logic tests' { bun test oemt\tests\ts }
}

# --- package ----------------------------------------------------------------------------------
Step 'Package'
$version = (Get-Content oemt\VERSION -TotalCount 1).Trim()
# Release asset name the self-updater looks for: oemt-club-<tag>-windows-x86_64.zip (tag = v<version>).
$name = "oemt-club-v$version-windows-x86_64"
$out = Join-Path $root "dist\$name"
if (Test-Path $out) { Remove-Item -Recurse -Force $out -Confirm:$false }
New-Item -ItemType Directory -Force "$out\oemt\lib", "$out\oemt\bin", "$out\oemt\plugins" | Out-Null
# The zip mirrors the Steam folder exactly: the updater extracts it straight over <Steam>.
Copy-Item build\oemt.bootstrap64.dll "$out\wsock32.dll"   # Steam loads this by name; it loads oemt\lib\oemt.dll
Copy-Item build\oemt.dll, build\oemt.hhx64.dll "$out\oemt\lib\"
Copy-Item build\oemt.luavm64.exe, build\oemt.crashhandler64.exe, build\media-helper\oemt-media.exe "$out\oemt\bin\"
Copy-Item build\oemt-plugin\club.oemt.core.star "$out\oemt\plugins\"
Copy-Item LICENSE.md, NOTICE.md, oemt\scripts\INSTALL.txt "$out\oemt\"
# Themes: OEmt.club (SpaceTheme base + OEmt overlay; needs oemt\theme\upstream\SpaceTheme) and Steam (original).
$spaceTheme = Join-Path $root 'oemt\theme\upstream\SpaceTheme'
if (Test-Path (Join-Path $spaceTheme 'skin.json')) {
    Run 'theme' { powershell -ExecutionPolicy Bypass -File oemt\theme\build-theme.ps1 -SpaceTheme $spaceTheme -Out "$out\oemt\themes\OEmt" }
} else {
    Write-Warning "SpaceTheme checkout not found at $spaceTheme; the package will not include the OEmt.club theme."
}
Copy-Item oemt\theme\steam-original "$out\oemt\themes\SteamOriginal" -Recurse
Compress-Archive -Path "$out\*" -DestinationPath "$out.zip" -Force

Write-Host "`nBuilt $out.zip" -ForegroundColor Green
Get-ChildItem $out -Recurse -File | ForEach-Object { '  ' + $_.FullName.Substring($out.Length + 1) }
