# PDF Studio - kleine lokale webserver (enkel bereikbaar op deze computer). Werkt met Windows PowerShell 5.1 en PowerShell 7.
param([string]$Root = (Split-Path -Parent $PSScriptRoot), [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.json'='application/json'; '.webmanifest'='application/manifest+json'; '.png'='image/png'; '.svg'='image/svg+xml'; '.woff2'='font/woff2';
  '.ttf'='font/ttf'; '.otf'='font/otf'; '.wasm'='application/wasm'; '.txt'='text/plain; charset=utf-8'; '.md'='text/plain; charset=utf-8' }
$listener = $null
foreach ($port in 47613, 47614, 47615, 47616, 47617) {
  try { $l = New-Object System.Net.HttpListener; $l.Prefixes.Add("http://localhost:$port/"); $l.Start(); $listener = $l; break } catch { }
}
if (-not $listener) { Write-Host 'Geen vrije poort gevonden (47613-47617).'; Read-Host 'Druk op Enter om te sluiten'; exit 1 }
$url = "http://localhost:$port/index.html"
Write-Host ''
Write-Host '  PDF Studio draait op' $url
Write-Host '  Laat dit venster open zolang u PDF Studio gebruikt. Sluiten = stoppen.'
Write-Host ''
if (-not $NoBrowser) { Start-Process $url }
$rootFull = [System.IO.Path]::GetFullPath($Root)
while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $res = $ctx.Response
  try {
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    $file = [System.IO.Path]::GetFullPath((Join-Path $rootFull ($path.TrimStart('/') -replace '/', '\')))
    if (-not $file.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
      $res.StatusCode = 404; $b = [System.Text.Encoding]::UTF8.GetBytes('Niet gevonden'); $res.OutputStream.Write($b, 0, $b.Length)
    } else {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = 'application/octet-stream' }
      $res.AddHeader('Cache-Control', 'no-cache')
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch { try { $res.StatusCode = 500 } catch { } }
  finally { try { $res.OutputStream.Close() } catch { } }
}
