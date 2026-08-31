#requires -Version 5.1
<#
.SYNOPSIS
  Smoke-test the Excalihome backend API.
#>
param(
  [string]$BaseUrl = "http://localhost/api"
)

$ErrorActionPreference = "Stop"

function Invoke-Json($Uri, $Method = "GET", $Body = $null) {
  $opts = @{ Uri = $Uri; Method = $Method }
  if ($Body) {
    $opts.Body = ($Body | ConvertTo-Json -Compress)
    $opts.ContentType = "application/json"
  }
  return Invoke-RestMethod @opts
}

Write-Host "Health check..." -ForegroundColor Cyan
Invoke-Json "$BaseUrl/health" | Out-Null
Write-Host "OK" -ForegroundColor Green

Write-Host "List diagrams..." -ForegroundColor Cyan
$diagrams = Invoke-Json "$BaseUrl/diagrams"
Write-Host "Found $($diagrams.Count) diagram(s)" -ForegroundColor Green

if ($diagrams.Count -gt 0) {
  $id = $diagrams[0].id
  Write-Host "Load diagram $id..." -ForegroundColor Cyan
  Invoke-Json "$BaseUrl/diagrams/$id" | Out-Null
  Write-Host "OK" -ForegroundColor Green
}

Write-Host "All API checks passed." -ForegroundColor Green
