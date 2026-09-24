Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\SIR VINCI\.gemini\antigravity-ide\brain\17688822-c1dd-4584-ad0c-aa4ecdc53f57\.user_uploaded\media_1790130202971.png"
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)

Write-Host "Image Size: $($bmp.Width) x $($bmp.Height)"

# Check left-most, right-most, top-most, bottom-most pixels with alpha > 50
$minX = 999; $maxX = -1; $minY = 999; $maxY = -1

for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.A -gt 30) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Host "Alpha > 30 Box: minX=$minX, minY=$minY, maxX=$maxX, maxY=$maxY"
Write-Host "Width = $($maxX - $minX + 1), Height = $($maxY - $minY + 1)"
Write-Host "Center = $(($minX + $maxX)/2), $(($minY + $maxY)/2)"

# Check if there are other files in .user_uploaded or assets for comparison
$bmp.Dispose()
