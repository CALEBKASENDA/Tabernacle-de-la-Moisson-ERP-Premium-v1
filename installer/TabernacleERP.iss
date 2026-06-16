; Tabernacle ERP Premium — Installeur Windows (Inno Setup 6)
; Modes : TauriMode (desktop natif) ou LegacyWeb (Edge + Node)

#ifndef MyAppVersion
#define MyAppVersion "1.6.0"
#endif

#define MyAppName "Tabernacle de la Moisson ERP"
#define MyAppPublisher "Tabernacle de la Moisson"
#define MyAppURL "https://github.com/tabernacle-moisson/erp"
#define MyAppExeName "TabernacleERP.exe"
#define MyAppExeNameDebug "Launch-Tabernacle.cmd"
#define MyPowerShell "{sys}\WindowsPowerShell\v1.0\powershell.exe"

[Setup]
AppId={{A7B3C9D1-4E2F-5A6B-8C9D-0E1F2A3B4C5D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\Tabernacle de la Moisson ERP
DefaultGroupName=Tabernacle de la Moisson ERP
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=TabernacleERP-Setup-{#MyAppVersion}
SetupIconFile=assets\tabernacle.ico
Compression=lzma2/max
SolidCompression=no
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\assets\tabernacle.ico
MinVersion=10.0

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer une icône sur le Bureau"; GroupDescription: "Raccourcis :"
Name: "startupicon"; Description: "Démarrer Tabernacle de la Moisson ERP au lancement de Windows"; GroupDescription: "Raccourcis :"; Flags: unchecked

#ifndef StagingDir
#define StagingDir "staging"
#endif

[Files]
#ifdef TauriMode
Source: "{#StagingDir}\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StagingDir}\resources\*"; DestDir: "{app}\resources"; Flags: ignoreversion recursesubdirs createallsubdirs
#else
Source: "{#StagingDir}\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs
Source: "{#StagingDir}\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "assets\boot.html"; DestDir: "{app}\assets"; Flags: ignoreversion
#endif
Source: "{#StagingDir}\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "{#StagingDir}\config\*"; DestDir: "{app}\config"; Flags: ignoreversion
Source: "assets\tabernacle.ico"; DestDir: "{app}\assets"; Flags: ignoreversion

[Icons]
#ifdef TauriMode
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\tabernacle.ico"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\tabernacle.ico"; Tasks: desktopicon; WorkingDir: "{app}"
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\tabernacle.ico"; Tasks: startupicon; WorkingDir: "{app}"
#else
Name: "{group}\{#MyAppName}"; Filename: "{app}\scripts\Launch-Tabernacle.vbs"; IconFilename: "{app}\assets\tabernacle.ico"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\scripts\Launch-Tabernacle.vbs"; IconFilename: "{app}\assets\tabernacle.ico"; Tasks: desktopicon; WorkingDir: "{app}"
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\scripts\Launch-Tabernacle.vbs"; IconFilename: "{app}\assets\tabernacle.ico"; Tasks: startupicon; WorkingDir: "{app}"
Name: "{group}\{#MyAppName} (mode debug)"; Filename: "{app}\scripts\{#MyAppExeNameDebug}"; IconFilename: "{app}\assets\tabernacle.ico"; WorkingDir: "{app}"
#endif
Name: "{group}\Arrêter {#MyAppName}"; Filename: "{app}\scripts\Stop-Tabernacle.cmd"; WorkingDir: "{app}"
Name: "{group}\Exporter vers cle USB"; Filename: "{app}\scripts\Export-Portable.cmd"; IconFilename: "{app}\assets\tabernacle.ico"; WorkingDir: "{app}"
Name: "{group}\Importer depuis cle USB"; Filename: "{app}\scripts\Import-Portable.cmd"; IconFilename: "{app}\assets\tabernacle.ico"; WorkingDir: "{app}"
Name: "{group}\Ouvrir le dossier de données"; Filename: "explorer.exe"; Parameters: "{code:GetDataDir}"
Name: "{group}\Modifier la configuration"; Filename: "notepad.exe"; Parameters: "{code:GetEnvFile}"

[Run]
#ifdef TauriMode
Filename: "{app}\{#MyAppExeName}"; Description: "Lancer {#MyAppName} maintenant"; Flags: postinstall nowait skipifsilent
#else
Filename: "{app}\scripts\Launch-Tabernacle.vbs"; Description: "Lancer {#MyAppName} maintenant"; Flags: postinstall nowait skipifsilent shellexec
#endif

[UninstallRun]
Filename: "{#MyPowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\stop-tabernacle.ps1"""; Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\Tabernacle ERP\tabernacle.pid"

[Dirs]
Name: "{app}\data"; Permissions: users-modify
Name: "{app}\config"; Permissions: users-modify

[Code]
function GetDataDir(Param: String): String;
begin
  Result := ExpandConstant('{app}\data');
end;

function GetEnvFile(Param: String): String;
begin
  Result := ExpandConstant('{app}\config\.env');
end;

[Messages]
french.WelcomeLabel2=Ce programme installera [name/ver] sur votre ordinateur.%n%nApplication desktop autonome (sans navigateur, sans localhost).%n%nVos données financières seront enregistrées dans le dossier d'installation (data\), exportables vers une clé USB.
