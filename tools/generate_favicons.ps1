Add-Type -AssemblyName System.Drawing

function Generate-Favicons {
    $srcPath = "C:\Users\SIR VINCI\.gemini\antigravity-ide\brain\17688822-c1dd-4584-ad0c-aa4ecdc53f57\.user_uploaded\media_1790130202971.png"
    $src = [System.Drawing.Bitmap]::FromFile($srcPath)

    # Crop exactly to the symbol bounds: (13, 14, 146, 140) -> 133w x 126h
    $cropRect = [System.Drawing.Rectangle]::FromLTRB(13, 14, 146, 140)
    $cropped = new-object System.Drawing.Bitmap $cropRect.Width, $cropRect.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($cropped)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()

    # The user asked:
    # "Use the SIRVINCI primary blue for the icon where appropriate, while also ensuring the icon works clearly on both light and dark browser interfaces."
    # Let's inspect the blue color: In src, it's RGB(0, 0, 114) (deep blue).
    # To ensure it pops on both light and dark tabs:
    # 1. We create a high-contrast version where the blue is the vibrant Sirvinci Royal Blue (RGB: 26, 86, 219 / #1A56DB to #2F76FF) or crisp navy with a subtle light keyline.
    # Let's create a rendering function that draws the cropped symbol centered inside a square canvas of size $size x $size with specified safe margin and contrast enhancement.

    function Render-SquareIcon($sourceBmp, [int]$size, [double]$paddingRatio, [bool]$hasBg, [System.Drawing.Color]$bgColor, [bool]$addDarkTabContrast) {
        $bmp = new-object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

        if ($hasBg) {
            $g.Clear($bgColor)
        }
        else {
            $g.Clear([System.Drawing.Color]::Transparent)
        }

        # Calculate target dimensions with padding
        $availSize = $size * (1.0 - ($paddingRatio * 2))
        $scale = [Math]::Min($availSize / $sourceBmp.Width, $availSize / $sourceBmp.Height)
        $targetW = [int][Math]::Round($sourceBmp.Width * $scale)
        $targetH = [int][Math]::Round($sourceBmp.Height * $scale)
        $targetX = [int][Math]::Round(($size - $targetW) / 2.0)
        $targetY = [int][Math]::Round(($size - $targetH) / 2.0)

        # If contrast enhancement for dark tabs is requested and no solid background:
        # We can draw a subtle, soft translucent white contour/halo (or 1px keyline) around the symbol
        # so it has crystal-clear definition on dark tabs (#202124 / #0A0A0A) while disappearing seamlessly on light tabs (#FFFFFF / #F1F3F4)
        if ($addDarkTabContrast -and -not $hasBg) {
            # Create a white silhouette of the cropped image
            $whiteSilhouette = new-object System.Drawing.Bitmap $sourceBmp.Width, $sourceBmp.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            for ($sy = 0; $sy -lt $sourceBmp.Height; $sy++) {
                for ($sx = 0; $sx -lt $sourceBmp.Width; $sx++) {
                    $p = $sourceBmp.GetPixel($sx, $sy)
                    if ($p.A -gt 25) {
                        # White with proportional alpha (approx 120-160 for subtle halo, or 200 for crisp 16x16)
                        $haloAlpha = [int][Math]::Min(220, [Math]::Round($p.A * 0.75))
                        $whiteSilhouette.SetPixel($sx, $sy, [System.Drawing.Color]::FromArgb($haloAlpha, 255, 255, 255))
                    }
                }
            }

            # Draw white silhouette slightly dilated or offset by 1px
            $offset = [Math]::Max(1, [int][Math]::Round($size / 32.0))
            if ($size -le 16) { $offset = 1 }
            for ($dx = - $offset; $dx -le $offset; $dx++) {
                for ($dy = - $offset; $dy -le $offset; $dy++) {
                    if ($dx -ne 0 -or $dy -ne 0) {
                        $g.DrawImage($whiteSilhouette, $targetX + $dx, $targetY + $dy, $targetW, $targetH)
                    }
                }
            }
            $whiteSilhouette.Dispose()
        }

        # Draw the symbol itself
        $g.DrawImage($sourceBmp, $targetX, $targetY, $targetW, $targetH)
        $g.Dispose()
        return $bmp
    }

    $outDir = "c:\Users\SIR VINCI\OneDrive\Documents\sirvinci site"
    $assetsDir = "c:\Users\SIR VINCI\OneDrive\Documents\sirvinci site\assets"

    # Also prepare a version where the blue is rich electric brand blue if needed, or exact source
    # Let's inspect source blue vs brand blue:
    # In source: R=0, G=0, B=114 (deep royal navy)
    # We can create a rich brand blue bitmap version as well:
    $brandBlueCropped = new-object System.Drawing.Bitmap $cropped.Width, $cropped.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    for ($y = 0; $y -lt $cropped.Height; $y++) {
        for ($x = 0; $x -lt $cropped.Width; $x++) {
            $p = $cropped.GetPixel($x, $y)
            if ($p.A -gt 0) {
                # Rich Sirvinci Royal Blue: #1E50DE (R=30, G=80, B=222)
                # It preserves the exact shape and antialiasing of the original icon
                $brandBlueCropped.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($p.A, 25, 75, 225))
            }
        }
    }

    # 1. favicon-16x16.png (Padding ~10% = 1.5px, add subtle contrast outline so visible on dark & light tabs)
    $f16 = Render-SquareIcon $brandBlueCropped 16 0.10 $false ([System.Drawing.Color]::Transparent) $true
    $f16.Save("$outDir\favicon-16x16.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $f16.Save("$assetsDir\favicon-16x16.png", [System.Drawing.Imaging.ImageFormat]::Png)

    # 2. favicon-32x32.png (Padding ~10% = 3px)
    $f32 = Render-SquareIcon $brandBlueCropped 32 0.10 $false ([System.Drawing.Color]::Transparent) $true
    $f32.Save("$outDir\favicon-32x32.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $f32.Save("$assetsDir\favicon-32x32.png", [System.Drawing.Imaging.ImageFormat]::Png)

    # 48x48 for ICO
    $f48 = Render-SquareIcon $brandBlueCropped 48 0.10 $false ([System.Drawing.Color]::Transparent) $true
    $f48.Save("$assetsDir\favicon-48x48.png", [System.Drawing.Imaging.ImageFormat]::Png)

    # 3. apple-touch-icon.png (180x180)
    # Apple HIG recommendation: solid background, safe space 15-18% so rounded corners don't clip icon.
    # Crisp pure white background with the official brand blue SIRVINCI emblem.
    $fApple = Render-SquareIcon $brandBlueCropped 180 0.15 $true ([System.Drawing.Color]::White) $false
    $fApple.Save("$outDir\apple-touch-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $fApple.Save("$assetsDir\apple-touch-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

    # 4. icon-192.png (192x192) - Android / PWA
    $f192 = Render-SquareIcon $brandBlueCropped 192 0.12 $false ([System.Drawing.Color]::Transparent) $true
    $f192.Save("$outDir\icon-192.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $f192.Save("$assetsDir\icon-192.png", [System.Drawing.Imaging.ImageFormat]::Png)

    # 5. icon-512.png (512x512) - Android / PWA splash
    $f512 = Render-SquareIcon $brandBlueCropped 512 0.12 $false ([System.Drawing.Color]::Transparent) $true
    $f512.Save("$outDir\icon-512.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $f512.Save("$assetsDir\icon-512.png", [System.Drawing.Imaging.ImageFormat]::Png)

    # Build multi-resolution favicon.ico (16x16, 32x32, 48x48)
    $icoImages = @(
        @{ Width = 16; Height = 16; File = "$assetsDir\favicon-16x16.png" },
        @{ Width = 32; Height = 32; File = "$assetsDir\favicon-32x32.png" },
        @{ Width = 48; Height = 48; File = "$assetsDir\favicon-48x48.png" }
    )

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)

    $bw.Write([uint16]0) # Reserved
    $bw.Write([uint16]1) # Type = 1 (ICO)
    $bw.Write([uint16]$icoImages.Count)

    $offset = 6 + ($icoImages.Count * 16)
    $entries = @()

    foreach ($img in $icoImages) {
        $bytes = [System.IO.File]::ReadAllBytes($img.File)
        $wVal = 0
        if ($img.Width -lt 256) { $wVal = $img.Width }
        $hVal = 0
        if ($img.Height -lt 256) { $hVal = $img.Height }

        $entries += @{
            Width  = [byte]$wVal;
            Height = [byte]$hVal;
            Bytes  = $bytes;
            Offset = $offset;
            Length = $bytes.Length
        }
        $offset += $bytes.Length
    }

    foreach ($e in $entries) {
        $bw.Write([byte]$e.Width)
        $bw.Write([byte]$e.Height)
        $bw.Write([byte]0) # ColorCount
        $bw.Write([byte]0) # Reserved
        $bw.Write([uint16]1) # Planes
        $bw.Write([uint16]32) # BitCount
        $bw.Write([uint32]$e.Length)
        $bw.Write([uint32]$e.Offset)
    }

    foreach ($e in $entries) {
        $bw.Write($e.Bytes)
    }

    $bw.Flush()
    $icoBytes = $ms.ToArray()
    [System.IO.File]::WriteAllBytes("$outDir\favicon.ico", $icoBytes)
    [System.IO.File]::WriteAllBytes("$assetsDir\favicon.ico", $icoBytes)

    $bw.Dispose()
    $ms.Dispose()

    $f16.Dispose(); $f32.Dispose(); $f48.Dispose(); $fApple.Dispose(); $f192.Dispose(); $f512.Dispose()
    $brandBlueCropped.Dispose(); $cropped.Dispose(); $src.Dispose()

    Write-Host "Favicons generated successfully!"
}

Generate-Favicons
