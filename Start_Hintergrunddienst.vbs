Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strDir

' Startet das BitAxeTool vollständig lautlos im Hintergrund (Headless)
If fso.FileExists(strDir & "\BitAxeTool.exe") Then
    WshShell.Run """" & strDir & "\BitAxeTool.exe"" --headless", 0, False
ElseIf fso.FileExists(strDir & "\dist\BitAxeTool\BitAxeTool.exe") Then
    WshShell.Run """" & strDir & "\dist\BitAxeTool\BitAxeTool.exe"" --headless", 0, False
ElseIf fso.FileExists(strDir & "\.venv\Scripts\pythonw.exe") Then
    WshShell.Run """" & strDir & "\.venv\Scripts\pythonw.exe"" app\main.py --headless", 0, False
End If
