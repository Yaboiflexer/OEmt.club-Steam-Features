# Builds oemt.ico (256/64/48/32/16 px) from the OEmt mark: white ring with a left slit and a four-point
# star on a dark disc. Same geometry as overlay/src/icons/logo.svg (512-unit grid). Uses only .NET's
# System.Drawing, so no image tools are needed.
#
#   powershell -ExecutionPolicy Bypass -File oemt\theme\make-icon.ps1 -Out <path\oemt.ico>
param([Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-MarkPng([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $s = $size / 512.0
    $g.ScaleTransform($s, $s)

    $disc = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 20, 23, 31))
    $g.FillEllipse($disc, 0, 0, 512, 512)
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

    # Ring: outer r 204, inner r 132, minus a horizontal slit through the left side.
    $outer = New-Object System.Drawing.Drawing2D.GraphicsPath
    $outer.AddEllipse(52, 52, 408, 408)
    $inner = New-Object System.Drawing.Drawing2D.GraphicsPath
    $inner.AddEllipse(124, 124, 264, 264)
    $ring = New-Object System.Drawing.Region $outer
    $ring.Exclude($inner)
    $ring.Exclude((New-Object System.Drawing.RectangleF 0, 243, 200, 26))
    $g.FillRegion($white, $ring)

    $g.FillRectangle($white, 28, 252, 112, 8)

    $star = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF 256, 168), (New-Object System.Drawing.PointF 276, 236),
        (New-Object System.Drawing.PointF 344, 256), (New-Object System.Drawing.PointF 276, 276),
        (New-Object System.Drawing.PointF 256, 344), (New-Object System.Drawing.PointF 236, 276),
        (New-Object System.Drawing.PointF 168, 256), (New-Object System.Drawing.PointF 236, 236))
    $g.FillPolygon($white, $star)

    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    return ,$ms.ToArray()
}

# ICO container with PNG-compressed entries (supported since Windows Vista).
$sizes = 256, 64, 48, 32, 16
$images = foreach ($sz in $sizes) { ,(New-MarkPng $sz) }
$fs = [System.IO.File]::Create($Out)
$w = New-Object System.IO.BinaryWriter $fs
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
    $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([UInt16]1); $w.Write([UInt16]32)
    $w.Write([UInt32]$images[$i].Length); $w.Write([UInt32]$offset)
    $offset += $images[$i].Length
}
foreach ($img in $images) { $w.Write($img) }
$w.Close()
Write-Host "Wrote $Out"
