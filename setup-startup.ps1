#Requires -RunAsAdministrator
# Register stor-serve to start at logon, elevated. The task launches this tree's start-silent.vbs;
# the path is derived from this script's own location, so the same file serves both trees:
#   prod:  setup-startup.ps1                                     (triggered at logon)
#   dev:   setup-startup.ps1 -TaskName stor-serve-dev -OnDemand  (no trigger; release.ps1 -Up starts it)

param(
    [string]$TaskName = "stor-serve-prod",
    [string]$User = $env:USERNAME,
    [switch]$OnDemand
)

$ScriptPath = Join-Path $PSScriptRoot "start-silent.vbs"
if (-not (Test-Path $ScriptPath)) {
    Write-Error "start-silent.vbs not found next to this script: $ScriptPath"
    exit 1
}

if ($null -ne (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
    Write-Host "Task '$TaskName' already exists. Replacing it..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action    = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "//nologo `"$ScriptPath`""
$Settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$Principal = New-ScheduledTaskPrincipal -UserId $User -RunLevel Highest

$Params = @{
    TaskName    = $TaskName
    Description = "Start stor-serve file storage service on logon"
    Action      = $Action
    Settings    = $Settings
    Principal   = $Principal
}
if (-not $OnDemand) {
    $Params.Trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
}

Register-ScheduledTask @Params -Force | Out-Null

if ($OnDemand) {
    Write-Host "Task '$TaskName' created with no trigger. Start it with Start-ScheduledTask or release.ps1 -Up."
} else {
    Write-Host "Task '$TaskName' created. It starts at every logon as $User with elevated privileges."
}
