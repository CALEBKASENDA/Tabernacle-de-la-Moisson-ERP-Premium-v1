' Lance Tabernacle de la Moisson ERP sans fenêtre console visible
Option Explicit

Dim shell, fso, installRoot, ps1
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

installRoot = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
ps1 = installRoot & "\scripts\start-tabernacle.ps1"

If Not fso.FileExists(ps1) Then
  MsgBox "Script introuvable :" & vbCrLf & ps1, vbCritical, "Tabernacle de la Moisson ERP"
  WScript.Quit 1
End If

' 0 = fenêtre masquée, False = ne pas attendre la fin (retour immédiat)
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
