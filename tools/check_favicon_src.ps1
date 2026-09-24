Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\SIR VINCI\.gemini\antigravity-ide\brain\17688822-c1dd-4584-ad0c-aa4ecdc53f57\.user_uploaded\media_1790130202971.png"
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)

$found = 0
for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.A -gt 240) {
            Write-Host "Solid Pixel ($x, $y): A=$($p.A), R=$($p.R), G=$($p.G), B=$($p.B)"
            $found++
            if ($found -ge 10) { break }
        }
    }
    if ($found -ge 10) { break }
}

$bmp.Dispose()
