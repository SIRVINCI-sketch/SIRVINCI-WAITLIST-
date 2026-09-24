$filePath = "c:\Users\SIR VINCI\OneDrive\Documents\sirvinci site\assets\sirvinci-academy-logo-official.png"
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$url = "https://pnkxoktjhzjvjarediid.supabase.co/storage/v1/object/assets/sirvinci-academy-logo-official.png"
$headers = @{
    "apikey" = "sb_publishable_ORhuj4o-S8_Fw8BJPmbfAg_yG7hFqky"
    "Authorization" = "Bearer sb_publishable_ORhuj4o-S8_Fw8BJPmbfAg_yG7hFqky"
    "Content-Type" = "image/png"
    "x-upsert" = "true"
}

$res = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $bytes
Write-Host "Uploaded: " ($res | ConvertTo-Json -Compress)
