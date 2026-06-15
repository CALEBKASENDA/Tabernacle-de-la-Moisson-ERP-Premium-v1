' Lance Tabernacle ERP — sans fenetre console (Node direct, pas PowerShell)
Option Explicit

Dim shell, fso, installRoot, nodeExe, launcher, bootHtml
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

installRoot = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
nodeExe = installRoot & "\node\node.exe"
launcher = installRoot & "\scripts\launch-tabernacle.mjs"
bootHtml = installRoot & "\assets\boot.html"

If Not fso.FileExists(nodeExe) Then
  MsgBox "Node embarque introuvable :" & vbCrLf & nodeExe, vbCritical, "Tabernacle de la Moisson ERP"
  WScript.Quit 1
End If

If Not fso.FileExists(launcher) Then
  MsgBox "Lanceur introuvable :" & vbCrLf & launcher, vbCritical, "Tabernacle de la Moisson ERP"
  WScript.Quit 1
End If

' 0 = fenetre masquee ; demarrage immediat sans attendre
shell.Run """" & nodeExe & """ """ & launcher & """", 0, False
