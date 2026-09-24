Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\SIR VINCI\.gemini\antigravity-ide\brain\17688822-c1dd-4584-ad0c-aa4ecdc53f57\.user_uploaded\media_1790130202971.png"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

# Crop exactly to the symbol bounds
# We found: minX=13, minY=14, maxX=145, maxY=139
$cropRect = [System.Drawing.Rectangle]::FromLTRB(13, 14, 146, 140)
$cropped = new-object System.Drawing.Bitmap $cropRect.Width, $cropRect.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($cropped)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($src, 0, 0, $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

Write-Host "Cropped size: $($cropped.Width) x $($cropped.Height)"
$cropped.Save("c:\Users\SIR VINCI\OneDrive\Documents\sirvinci site\assets\test_cropped.png", [System.Drawing.Imaging.ImageFormat]::Png)

$cropped.Dispose()
$src.Dispose()
