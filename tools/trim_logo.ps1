Add-Type -AssemblyName System.Drawing

$src = "c:\Users\SIR VINCI\OneDrive\Documents\sirvinci site\assets\sirvinci-academy-official-logo.png"
$bmp = [System.Drawing.Bitmap]::FromFile($src)
Write-Host "Size: $($bmp.Width) x $($bmp.Height)"

$minX = 999; $maxX = -1; $minY = 999; $maxY = -1
for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.A -gt 20) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
Write-Host "Logo bbox: minX=$minX, minY=$minY, maxX=$maxX, maxY=$maxY (W=$($maxX-$minX+1), H=$($maxY-$minY+1))"

# If there is excess margin, let's create a tight, razor-sharp crop
$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1
$cropped = new-object System.Drawing.Bitmap $cropW, $cropH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($cropped)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($bmp, 0, 0, [System.Drawing.Rectangle]::FromLTRB($minX, $minY, $maxX+1, $maxY+1), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

$cropped.Save("c:\Users\SIR VINCI\OneDrive\Documents\sirvinci site\assets\sirvinci-academy-logo-official.png", [System.Drawing.Imaging.ImageFormat]::Png)
$cropped.Dispose()
$bmp.Dispose()
Write-Host "Saved trimmed official logo to assets\sirvinci-academy-logo-official.png"
