$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Install Node.js LTS (22 or newer), then reopen PowerShell.' }
$nodeMajor = [int]((& node.exe --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) { throw 'Node.js 22 or newer is required.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) {
  Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination (Join-Path $projectRoot '.env')
}
$secretDirectory = Join-Path $projectRoot '.secrets'
New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $secretDirectory '/inheritance:r' '/grant:r' "*$($currentSid):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict the .secrets directory permissions.' }
& npm.cmd ci --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'Syntax validation failed.' }
Write-Host 'Setup selesai. Ikuti docs/WINDOWS11.md: simpan Google Desktop OAuth JSON, login, lalu verifikasi spreadsheet.'
