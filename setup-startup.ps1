#Requires -RunAsAdministrator

$TaskName = "stor-serve"
$TaskDescription = "Start stor-serve file storage service on logon"
$ScriptPath = "C:\utils\stor-serve\start.bat"
$User = "RaaViVi"

$TaskExists = $null -ne (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)

if ($TaskExists) {
    Write-Host "Task '$TaskName' already exists. Removing..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Write-Host "Creating scheduled task '$TaskName'..."

$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$ScriptPath`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$Principal = New-ScheduledTaskPrincipal -UserId $User -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName `
  -Description $TaskDescription `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Force

Write-Host "Task '$TaskName' created successfully"
Write-Host "The service will start automatically on next logon as $User with elevated privileges"
