Add-Type -AssemblyName System.Drawing

$srcPath = "c:\Users\SIR VINCI\OneDrive\Documents\sirvinci site\assets\sirvinci-academy-logo-official.png"
$srcBmp = [System.Drawing.Bitmap]::FromFile($srcPath)

# We want a high-res image suitable for retina @2x display (e.g. 165px wide at 1x means ~330-500px wide @2x)
$padX = 24
$padY = 16
$badgeW = $srcBmp.Width + ($padX * 2)
$badgeH = $srcBmp.Height + ($padY * 2)

$bmp = New-Object System.Drawing.Bitmap $badgeW, $badgeH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bmp.SetResolution(300, 300)

$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# Draw rounded rectangle background (deep dark luxury badge #0A0A0A with #282828 border)
$radius = 24
$rect = New-Object System.Drawing.Rectangle 1, 1, ($badgeW - 3), ($badgeH - 3)

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$diameter = $radius * 2
$path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
$path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
$path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
$path.CloseFigure()

$bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 12, 12, 12))
$g.FillPath($bgBrush, $path)

$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 45, 45, 45)), 2
$g.DrawPath($borderPen, $path)

# Draw the white logo centered inside
$g.DrawImage($srcBmp, $padX, $padY, $srcBmp.Width, $srcBmp.Height)

$destPath = "c:\Users\SIR VINCI\OneDrive\Documents\sirvinci site\assets\sirvinci-academy-email-logo.png"
if (Test-Path $destPath) {
    Remove-Item $destPath -Force
}
$bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)

Write-Host "Created email badge logo: ${badgeW}x${badgeH} at $destPath"

$bgBrush.Dispose()
$borderPen.Dispose()
$path.Dispose()
$g.Dispose()
$bmp.Dispose()
$srcBmp.Dispose()
