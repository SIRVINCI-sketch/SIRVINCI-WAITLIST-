Add-Type -AssemblyName System.Drawing

$src = "C:\Users\SIR VINCI\.gemini\antigravity-ide\brain\7d45c7a6-d45f-4166-9905-99131c5ca3f2\.user_uploaded\media_1790216942090.png"
$bmp = [System.Drawing.Bitmap]::FromFile($src)

$minX = $bmp.Width; $maxX = -1; $minY = $bmp.Height; $maxY = -1
for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.A -gt 20 -and ($p.R -lt 240 -or $p.G -lt 240 -or $p.B -lt 240)) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1
Write-Host "Cropping: minX=$minX, minY=$minY, W=$cropW, H=$cropH"

$cropped = New-Object System.Drawing.Bitmap $cropW, $cropH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$cropped.SetResolution(300, 300)

$g = [System.Drawing.Graphics]::FromImage($cropped)
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

$destRect = New-Object System.Drawing.Rectangle 0, 0, $cropW, $cropH
$srcRect = New-Object System.Drawing.Rectangle $minX, $minY, $cropW, $cropH
$g.DrawImage($bmp, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$g.Dispose()

$destPath = "c:\Users\SIR VINCI\OneDrive\Documents\sirvinci site\assets\sirvinci-academy-logo-blue.png"
if (Test-Path $destPath) {
    Remove-Item $destPath -Force
}
$cropped.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved blue logo to $destPath"

$cropped.Dispose()
$bmp.Dispose()
