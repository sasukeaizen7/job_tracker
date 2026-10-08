' Lance tracker.ps1 sans afficher de fenetre de console.
' Usage : wscript launch.vbs [stop]
Set shell = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
args = ""
If WScript.Arguments.Count > 0 Then
  If LCase(WScript.Arguments(0)) = "stop" Then args = " -Stop"
End If
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\tracker.ps1""" & args, 0, False
