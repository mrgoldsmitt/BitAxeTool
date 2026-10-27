Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strDir

' 1. Wenn kompilierte BitAxeTool.exe existiert, direkt nativ ohne Konsole ausführen
If fso.FileExists(strDir & "\dist\BitAxeTool\BitAxeTool.exe") Then
    WshShell.Run """" & strDir & "\dist\BitAxeTool\BitAxeTool.exe""", 0, False
' 2. Andernfalls mit pythonw.exe (Windows no-console GUI interpreter) ausführen
ElseIf fso.FileExists(strDir & "\.venv\Scripts\pythonw.exe") Then
    WshShell.Run """" & strDir & "\.venv\Scripts\pythonw.exe"" main.py", 0, False
' 3. Fallback auf Batch-Starter
Else
    WshShell.Run """" & strDir & "\Run_BitAxeTool.bat""", 1, False
End If
