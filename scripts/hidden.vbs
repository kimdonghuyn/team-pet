' Starts the office with no window at all, for the Windows startup folder:
'   wscript hidden.vbs hub|collector
'   wscript hidden.vbs collector pet    (the desktop icon: start if off, then show the pet)
'   wscript hidden.vbs collector open   (the settings page)
' (A shortcut straight to node or cmd would flash a console window at sign-in.)
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
role = "collector"
mode = "start"
If WScript.Arguments.Count > 0 Then role = WScript.Arguments(0)
If WScript.Arguments.Count > 1 Then mode = WScript.Arguments(1)
' The installer brings its own Node (runtime\node.exe); a zip install uses the one on PATH.
node = "node"
bundled = fso.GetParentFolderName(dir) & "\runtime\node.exe"
If fso.FileExists(bundled) Then node = """" & bundled & """"
CreateObject("WScript.Shell").Run node & " """ & dir & "\launch.js"" " & mode & " " & role, 0, False
