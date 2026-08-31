#requires -Version 5.1
<#
.SYNOPSIS
  Generate a self-signed certificate for local HTTPS.
#>
param(
  [string]$OutDir = "$PSScriptRoot\..\certs"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$certPath = Join-Path $OutDir "excalihome.crt"
$keyPath = Join-Path $OutDir "excalihome.key"

if (Get-Command openssl -ErrorAction SilentlyContinue) {
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
    -keyout $keyPath -out $certPath `
    -subj "/CN=localhost/O=Excalihome" `
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  Write-Host "Generated:`n  $certPath`n  $keyPath" -ForegroundColor Green
} else {
  Write-Warning "OpenSSL not found. Install OpenSSL or generate certs manually."
}
