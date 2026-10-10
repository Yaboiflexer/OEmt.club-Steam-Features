# Builds the "OEmt.club" Steam theme: SpaceTheme (MIT, by SpaceEnergy / SpaceTheme) as the layout
# base + the OEmt overlay (OEmt branding, named editable colors, Lucida Console default font).
#
#   powershell -ExecutionPolicy Bypass -File oemt\theme\build-theme.ps1 -SpaceTheme <path> -Out <dir>
#
# -SpaceTheme: a SpaceTheme checkout (https://github.com/SpaceTheme/Steam). Tested with commit 17f93c5.
# -Out:        destination folder, e.g. "<Steam>\oemt\themes\OEmt". Replaced if it exists.
param(
    # Upstream checkout lives in oemt\theme\upstream\SpaceTheme (git-ignored; clone https://github.com/SpaceTheme/Steam there).
    [string]$SpaceTheme = (Join-Path $PSScriptRoot 'upstream\SpaceTheme'),
    [Parameter(Mandatory)][string]$Out
)
$ErrorActionPreference = 'Stop'
$overlay = Join-Path $PSScriptRoot 'overlay'
if (-not (Test-Path (Join-Path $SpaceTheme 'skin.json'))) { throw "No skin.json in $SpaceTheme" }

if (Test-Path $Out) { Remove-Item -Recurse -Force $Out -Confirm:$false }
New-Item -ItemType Directory -Force $Out | Out-Null
robocopy $SpaceTheme $Out /E /XD .git .github /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "copy failed (robocopy $LASTEXITCODE)" }
robocopy $overlay $Out /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "overlay failed (robocopy $LASTEXITCODE)" }

# skin.json: text edits (keeps the file's formatting); validated as JSON before writing.
$utf8 = New-Object System.Text.UTF8Encoding($false)
$skinPath = Join-Path $Out 'skin.json'
$skin = [IO.File]::ReadAllText($skinPath, $utf8)
function Swap([string]$pattern, [string]$replacement) {
    $rx = [regex]$pattern
    if (-not $rx.IsMatch($script:skin)) { throw "skin.json: pattern not found: $pattern" }
    $script:skin = $rx.Replace($script:skin, $replacement, 1)
}
Swap '"name"\s*:\s*"[^"]*"' '"name": "OEmt.club"'
Swap '"description"\s*:\s*"[^"]*"' '"description": "The OEmt.club look for all of Steam. Layout by SpaceTheme (MIT, SpaceEnergy); OEmt palette and Lucida Console."'
Swap '"author"\s*:\s*"[^"]*"' '"author": "OEmt.club (based on SpaceTheme by SpaceEnergy)"'
# No "github" block: Millennium-style update checks would otherwise replace this with upstream SpaceTheme.
Swap '"github"\s*:\s*\{[^}]*\}\s*,' ''
# Font option: add Lucida Console and make it the default.
Swap '("Font"\s*:\s*\{[^{]*?"default"\s*:\s*)"[^"]*"' '$1"Lucida Console (OEmt)"'
Swap '(?s)("Font"\s*:\s*\{.*?"values"\s*:\s*\{)' ('$1' + "`n" + '                "Lucida Console (OEmt)": { "TargetCss": { "affects": [".*"], "src": "options/fonts/lucidaConsole.css" } },')

# Scrollbars option: add "Modern (OEmt)" and make it the default (SpaceTheme only offers hide / Steam default).
Swap '("Scrollbars"\s*:\s*\{[^{]*?"default"\s*:\s*)"[^"]*"' '$1"Modern (OEmt)"'
Swap '(?s)("Scrollbars"\s*:\s*\{.*?"values"\s*:\s*\{)' ('$1' + "`n" + '                "Modern (OEmt)": { "TargetCss": { "affects": [".*"], "src": "options/general/modernScrollbars.css" } },')

# Scripts: store.steampowered.com and steamcommunity.com refuse injected scripts (Content Security Policy),
# which only filled Steam's log with errors. Keep SpaceTheme's scripts in Steam's own windows, drop them there.
# Styles still apply everywhere. Millennium matches these with std::regex (ECMAScript), so lookahead works.
$noWeb = '^(?!https?://([a-z0-9-]+\\.)*(steampowered|steamcommunity)\\.com).*'
Swap '(?s)\{\s*"MatchRegexString"\s*:\s*"\.\*"\s*,\s*"TargetCss"\s*:\s*"src/css/regular\.css"\s*,\s*"TargetJs"\s*:\s*"src/js/regular\.js"\s*\}' ('{ "MatchRegexString": ".*", "TargetCss": "src/css/regular.css" },' + "`n        " + '{ "MatchRegexString": "' + $noWeb + '", "TargetJs": "src/js/regular.js" }')
Swap '"MatchRegexString"\s*:\s*"\.\*"(\s*,\s*"TargetJs"\s*:\s*"src/js/utils\.js")' ('"MatchRegexString": "' + $noWeb + '"$1')
Swap '(?s)\{\s*"MatchRegexString"\s*:\s*"https://\.\*\\\\\.steampowered\\\\\.com\(/\.\*\)\?"\s*,\s*"TargetJs"\s*:\s*"src/js/webkit\.js"\s*\}\s*,' ''
Swap '("TargetCss"\s*:\s*"src/css/custom/custom\.css")\s*,\s*"TargetJs"\s*:\s*"src/js/webkit\.js"' '$1'

# Smaller corners by default (SpaceTheme: 8px).
Swap '("Border radius"\s*:\s*\{[^{]*?Default: )8px' '${1}6px'
Swap '("Border radius"\s*:\s*\{[^{]*?"default"\s*:\s*)8\b' '${1}6'

$skin = $script:skin

# Title-bar text logo: SpaceTheme draws "Space" + "Theme" with CSS; make it "OEmt" + ".club" in the accent colors.
$tbPath = Join-Path $Out 'src\css\steam\titlebar.css'
$tb = [IO.File]::ReadAllText($tbPath, $utf8)
foreach ($pair in @(@('content: "Space" !important;', 'content: "OEmt" !important;'), @('content: "Theme" !important;', 'content: ".club" !important;'),
                    @('color: rgb(135, 140, 255);', 'color: rgb(var(--st-accent-2));'), @('color: rgb(102, 108, 255);', 'color: rgb(var(--st-accent-1));'))) {
    if (-not $tb.Contains($pair[0])) { throw "titlebar.css: not found: $($pair[0])" }
    $tb = $tb.Replace($pair[0], $pair[1])
}
# Title-bar Steam menu: the OEmt mark (white) instead of Steam's logo.
$tb += @'

/* OEmt mark instead of the Steam logo in the title bar's Steam menu (added by OEmt build-theme.ps1) */
._2UyOBeiSdBayaFdRa39N2O:nth-of-type(1) svg {
    display: none !important;
}
._2UyOBeiSdBayaFdRa39N2O:nth-of-type(1)::before {
    content: "";
    flex: none;
    width: 16px;
    height: 16px;
    margin-right: 6px;
    background: url("../../icons/logo-light.svg") center / contain no-repeat;
}
'@
[IO.File]::WriteAllText($tbPath, $tb, $utf8)

# Sidebar home button: SpaceTheme tilts its logo 35 degrees; the OEmt mark stays upright.
$sbPath = Join-Path $Out 'src\css\steam\sidebar.css'
$sb = [IO.File]::ReadAllText($sbPath, $utf8)
if (-not $sb.Contains('transform: rotate(35deg) scale(1.2);')) { throw 'sidebar.css: logo transform not found' }
$sb = $sb.Replace('transform: rotate(35deg) scale(1.2);', 'transform: scale(1.1);')
[IO.File]::WriteAllText($sbPath, $sb, $utf8)

$doc = $skin | ConvertFrom-Json
if ($doc.name -ne 'OEmt.club' -or $doc.github -or $doc.Conditions.Font.default -ne 'Lucida Console (OEmt)' -or $doc.Conditions.Scrollbars.default -ne 'Modern (OEmt)') { throw 'skin.json edit check failed' }
if (@($doc.Patches | Where-Object { $_.TargetJs -eq 'src/js/webkit.js' }).Count -ne 0) { throw 'skin.json: webkit.js still injected into web pages' }
if (@($doc.Patches | Where-Object { $_.TargetJs -in 'src/js/regular.js', 'src/js/utils.js' -and $_.MatchRegexString -eq '.*' }).Count -ne 0) { throw 'skin.json: scripts still match web pages' }
[IO.File]::WriteAllText($skinPath, $skin, $utf8)

$notice = @"
OEmt.club Steam theme
=====================
Layout, components and options: SpaceTheme for Steam by SpaceEnergy / SpaceTheme
(https://github.com/SpaceTheme/Steam), MIT License, see LICENSE in this folder.
OEmt changes: src/css/root.css (named, editable colors; SpaceTheme defaults), src/icons/logo.svg,
title-bar text logo (src/css/steam/titlebar.css), options/fonts/lucidaConsole.css (default font), skin.json metadata.
"@
[IO.File]::WriteAllText((Join-Path $Out 'NOTICE-OEmt.txt'), $notice, $utf8)
Write-Host "OEmt.club theme written to $Out"
