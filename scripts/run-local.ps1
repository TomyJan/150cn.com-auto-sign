param(
    [string]$CredentialPath = (Join-Path $env:LOCALAPPDATA '150cn-auto-sign\site-credential.xml')
)

$ErrorActionPreference = 'Stop'
$names = @('SITE_USERNAME', 'SITE_PASSWORD', 'BROWSER_HEADLESS', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_PROXY_URL')
$previous = @{}
foreach ($name in $names) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$result = 1
$credential = $null
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    $credential = Import-Clixml -LiteralPath $CredentialPath
    $env:SITE_USERNAME = $credential.UserName
    $env:SITE_PASSWORD = $credential.GetNetworkCredential().Password
    $env:BROWSER_HEADLESS = 'true'
    foreach ($name in @('TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_PROXY_URL')) {
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
            [Environment]::SetEnvironmentVariable($name, [Environment]::GetEnvironmentVariable($name, 'User'), 'Process')
        }
    }
    if ([string]::IsNullOrWhiteSpace($env:TELEGRAM_PROXY_URL)) {
        $settings = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
        if ($settings.ProxyEnable -eq 1 -and $settings.ProxyServer) {
            $entries = @(([string]$settings.ProxyServer) -split ';')
            $server = $entries | Where-Object { $_ -like 'https=*' } | Select-Object -First 1
            if (-not $server) { $server = $entries | Where-Object { $_ -like 'http=*' } | Select-Object -First 1 }
            if (-not $server) { $server = $entries | Where-Object { $_ -notmatch '=' } | Select-Object -First 1 }
            if ($server) {
                $server = ($server -replace '^https?=', '').Trim()
                $env:TELEGRAM_PROXY_URL = if ($server -match '^\w+://') { $server } else { 'http://' + $server }
            }
        }
    }
    & node src/cli.mjs
    $result = $LASTEXITCODE
} finally {
    foreach ($name in $names) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
    $credential = $null
    Pop-Location
}
exit $result
