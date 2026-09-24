Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\SIR VINCI\.gemini\antigravity-ide\brain\17688822-c1dd-4584-ad0c-aa4ecdc53f57\.user_uploaded\media_1790130021601.png"
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)

Write-Host "Image Size: $($bmp.Width) x $($bmp.Height)"
$c00 = $bmp.GetPixel(0,0)
Write-Host "Corner pixel: A=$($c00.A), R=$($c00.R), G=$($c00.G), B=$($c00.B)"

$bmp.Dispose()
