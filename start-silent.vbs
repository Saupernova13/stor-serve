Option Explicit
Dim objShell, strPath
Set objShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
objShell.Run strPath & "\start.bat", 0, False
