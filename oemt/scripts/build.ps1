# OEmt.club Windows build: core binaries + OEmt plugin + tests, assembled into an install folder and zip.
#
#   powershell -ExecutionPolicy Bypass -File oemt\scripts\build.ps1            # build + test + package
#   powershell -ExecutionPolicy Bypass -File oemt\scripts\build.ps1 -SkipTests
#
# Needs: Visual Studio 2022 Build Tools (C++ workload), CMake, Bun, Rust. Never touches the Steam
# folder: MILLENNIUM_BUILD_TO_STEAM_PATH is forced OFF. Output: dist\oemt-club-<version>-<time>\ and .zip
param([switch]$SkipTests)
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
Run 'cmake configure' { cmake --preset=windows-release -DMILLENNIUM_RUN_TESTS_ON_BUILD=OFF -DMILLENNIUM_BUILD_TO_STEAM_PATH=OFF }
Run 'cmake build' { cmake --build build }

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
}

# --- package ----------------------------------------------------------------------------------
Step 'Package'
$version = (Get-Content scripts\version)[1].Trim()
$name = "oemt-club-$version-$(Get-Date -Format yyyyMMdd-HHmm)"
$out = Join-Path $root "dist\$name"
New-Item -ItemType Directory -Force "$out\oemt\lib", "$out\oemt\bin", "$out\oemt\plugins" | Out-Null
Copy-Item build\oemt.bootstrap64.dll "$out\wsock32.dll"   # Steam loads this by name; it loads oemt\lib\oemt.dll
Copy-Item build\oemt.dll, build\oemt.hhx64.dll "$out\oemt\lib\"
Copy-Item build\oemt.luavm64.exe, build\oemt.crashhandler64.exe "$out\oemt\bin\"
Copy-Item build\oemt-plugin\club.oemt.core.star "$out\oemt\plugins\"
Copy-Item LICENSE.md, NOTICE.md $out
Copy-Item oemt\scripts\INSTALL.txt $out
Compress-Archive -Path "$out\*" -DestinationPath "$out.zip" -Force

Write-Host "`nBuilt $out.zip" -ForegroundColor Green
Get-ChildItem $out -Recurse -File | ForEach-Object { '  ' + $_.FullName.Substring($out.Length + 1) }
