$port = 3030
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " SIRVINCI School of Design Local Web Server Active" -ForegroundColor Green
    Write-Host " URL: http://localhost:$port/" -ForegroundColor Yellow
    Write-Host " Base Directory: $PSScriptRoot" -ForegroundColor Gray
    Write-Host " Press Ctrl+C in this console to stop" -ForegroundColor Gray
    Write-Host "========================================================" -ForegroundColor Cyan
} catch {
    Write-Host "Failed to start listener on port $port : $_" -ForegroundColor Red
    exit 1
}

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.woff2'= 'font/woff2'
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $localPath = $request.Url.LocalPath
        if ($localPath -eq '' -or $localPath -eq '/') {
            $localPath = '/index.html'
        }

        # Prevent directory traversal
        $cleanPath = $localPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $fullPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot $cleanPath))

        if ($fullPath.StartsWith($PSScriptRoot) -and (Test-Path $fullPath -PathType Leaf)) {
            $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { 'application/octet-stream' }

            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $response.StatusCode = 200
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $localPath")
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.ContentLength64 = $errBytes.Length
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
    } catch {
        # Catch connection aborts or client disconnects cleanly without killing loop
    } finally {
        if ($null -ne $response) {
            try { $response.OutputStream.Flush() } catch {}
            try { $response.Close() } catch {}
        }
    }
}
