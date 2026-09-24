Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\SIR VINCI\.gemini\antigravity-ide\brain\17688822-c1dd-4584-ad0c-aa4ecdc53f57\.user_uploaded\media_1790130202971.png"
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)

Write-Host "Width=$($bmp.Width), Height=$($bmp.Height)"

# Let's inspect the top-most row with pixels
for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        if ($bmp.GetPixel($x, $y).A -gt 20) {
            Write-Host "Top-most pixel at y=$y (x=$x, A=$($bmp.GetPixel($x, $y).A), R=$($bmp.GetPixel($x, $y).R), G=$($bmp.GetPixel($x, $y).G), B=$($bmp.GetPixel($x, $y).B))"
            break
        }
    }
    if ($y -eq 14) { break }
}

# Let's inspect the bottom-most row with pixels
for ($y = $bmp.Height - 1; $y -ge 0; $y--) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        if ($bmp.GetPixel($x, $y).A -gt 20) {
            Write-Host "Bottom-most pixel at y=$y (x=$x, A=$($bmp.GetPixel($x, $y).A), R=$($bmp.GetPixel($x, $y).R), G=$($bmp.GetPixel($x, $y).G), B=$($bmp.GetPixel($x, $y).B))"
            break
        }
    }
    if ($y -eq 138) { break }
}

# Let's inspect left-most and right-most
for ($x = 0; $x -lt $bmp.Width; $x++) {
    for ($y = 0; $y -lt $bmp.Height; $y++) {
        if ($bmp.GetPixel($x, $y).A -gt 20) {
            Write-Host "Left-most pixel at x=$x (y=$y)"
            break
        }
    }
    if ($x -eq 13) { break }
}

for ($x = $bmp.Width - 1; $x -ge 0; $x--) {
    for ($y = 0; $y -lt $bmp.Height; $y++) {
        if ($bmp.GetPixel($x, $y).A -gt 20) {
            Write-Host "Right-most pixel at x=$x (y=$y)"
            break
        }
    }
    if ($x -eq 145) { break }
}

$bmp.Dispose()
