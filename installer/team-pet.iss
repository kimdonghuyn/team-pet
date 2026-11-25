; 팀 펫 설치 파일. scripts/pack.js 가 ISCC 로 두 번 만든다:
;   /DRole=member  팀원용      /DRole=hub  관리자용 (허브)
; 그 밖에 /DSrc=<묶을 폴더> /DNodeExe=<node.exe> /DAppVer=<버전> /DOut=<출력 폴더>.
; 관리자 권한 없이 사용자 폴더(%LOCALAPPDATA%\Programs)에 설치하고, 설정(~\.team-pet)은
; 지우지 않는다 — 다시 설치하면 그 설정으로 바로 켠다.

#if Role == "hub"
  #define AppTitle "팀 펫 관리자"
  #define Obj "를"
  #define AppGuid "{{B7D24E91-5C3A-4F6E-A812-9E4C7B1D3F55}"
  #define DirName "TeamPetHub"
  #define LaunchRole "hub"
  #define SetupCmd "setup-hub.cmd"
  #define OutName "팀-펫-관리자-설치"
#else
  #define AppTitle "팀 펫"
  #define Obj "을"
  #define AppGuid "{{4E8A1C73-2B9D-4D05-B6F1-7A3E5C9D2B84}"
  #define DirName "TeamPet"
  #define LaunchRole "collector"
  #define SetupCmd "setup.cmd"
  #define OutName "팀-펫-설치"
#endif

[Setup]
AppId={#AppGuid}
AppName={#AppTitle}
AppVersion={#AppVer}
AppVerName={#AppTitle}
DisableWelcomePage=no
AppPublisher=팀 펫
DefaultDirName={localappdata}\Programs\{#DirName}
DefaultGroupName={#AppTitle}
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#Out}
OutputBaseFilename={#OutName}
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\client\assets\icon.ico
UninstallDisplayName={#AppTitle}
WizardStyle=modern
WizardImageFile=wizard.bmp
WizardSmallImageFile=wizard-small.bmp
WizardImageStretch=yes
Compression=lzma2/max
SolidCompression=yes
CloseApplications=no
ShowLanguageDialog=no

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Messages]
#if Role == "hub"
korean.WelcomeLabel2={#AppTitle}{#Obj} 이 PC 에 설치합니다.%n%n관리자 권한은 필요 없습니다. 설치가 끝나면 작업표시줄 위에 펫이 나오고, 펫이 내 이름과 첫 방 이름을 물어봅니다(이미 쓰던 PC 라면 그대로 바로 켜집니다).
#else
korean.WelcomeLabel2={#AppTitle}{#Obj} 이 PC 에 설치합니다.%n%n관리자 권한은 필요 없습니다. 설치가 끝나면 작업표시줄 위에 펫이 나오고, 펫에 이름과 관리자에게 받은 참가 코드를 넣으면 바로 대화에 들어갑니다(이미 쓰던 PC 라면 그대로 바로 켜집니다).
#endif

[Tasks]
Name: "desktopicon"; Description: "바탕화면에 ""{#AppTitle}"" 아이콘 만들기"

[Files]
Source: "{#Src}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
Source: "{#NodeExe}"; DestDir: "{app}\runtime"; Flags: ignoreversion

[InstallDelete]
; 예전 .url 바로가기(꺼져 있으면 빈 화면만 열리던 것)는 아래 바로가기로 바뀐다.
Type: files; Name: "{group}\{#AppTitle}.url"
Type: files; Name: "{userdesktop}\{#AppTitle}.url"

[Icons]
; 펫을 띄운다 — 꺼져 있으면 먼저 켠다(창 없이). scripts\hidden.vbs → launch.js pet.
Name: "{group}\{#AppTitle}"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\scripts\hidden.vbs"" {#LaunchRole} pet"; WorkingDir: "{app}"; IconFilename: "{app}\client\assets\icon.ico"
Name: "{userdesktop}\{#AppTitle}"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\scripts\hidden.vbs"" {#LaunchRole} pet"; WorkingDir: "{app}"; IconFilename: "{app}\client\assets\icon.ico"; Tasks: desktopicon
; 설정 화면(브라우저): 이름 · 방 · 펫 설정을 한 화면에서 볼 때.
Name: "{group}\{#AppTitle} 설정 화면"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\scripts\hidden.vbs"" {#LaunchRole} open"; WorkingDir: "{app}"; IconFilename: "{app}\client\assets\icon.ico"
Name: "{group}\사용 설명서"; Filename: "{app}\사용-설명서.md"
Name: "{group}\{#AppTitle} 제거"; Filename: "{uninstallexe}"

[Run]
; 설정 창 없이 바로 켠다: 처음이면 펫이 이름과 참가 코드(관리자는 첫 방 이름)를 묻는다.
; 다시 설치면 같은 설정으로 새 폴더에서 켜고, 자동 실행이 이 폴더를 가리키게 한다.
Filename: "{app}\runtime\node.exe"; Parameters: """{app}\scripts\autostart.js"" on {#LaunchRole}"; WorkingDir: "{app}"; Flags: runhidden; Check: Ready
Filename: "{app}\runtime\node.exe"; Parameters: """{app}\scripts\launch.js"" restart {#LaunchRole}"; WorkingDir: "{app}"; Flags: runhidden; Check: Ready

[UninstallRun]
Filename: "{app}\runtime\node.exe"; Parameters: """{app}\scripts\launch.js"" stop {#LaunchRole}"; WorkingDir: "{app}"; Flags: runhidden; RunOnceId: "stop"
Filename: "{app}\runtime\node.exe"; Parameters: """{app}\scripts\autostart.js"" off {#LaunchRole}"; WorkingDir: "{app}"; Flags: runhidden; RunOnceId: "autostart"

[UninstallDelete]
; 자동 업데이트가 받은 파일까지.
Type: filesandordirs; Name: "{app}"
Type: files; Name: "{group}\{#AppTitle}.url"
Type: dirifempty; Name: "{group}"

[Code]
function ConfigText(): String;
var
  S: AnsiString;
begin
  Result := '';
  if LoadStringFromFile(ExpandConstant('{%USERPROFILE}\.team-pet\config.json'), S) then
    Result := String(S);
end;

{ "links": [ ... ] (팀원) 또는 "floors": [ ... ] (관리자) 가 비어 있지 않으면 설정된 것이다. }
function ListHasItems(Text, Key: String): Boolean;
var
  P: Integer;
begin
  Result := False;
  P := Pos('"' + Key + '": [', Text);
  if P = 0 then Exit;
  P := P + Length(Key) + 5;
  while (P <= Length(Text)) and ((Text[P] = ' ') or (Text[P] = #13) or (Text[P] = #10)) do
    P := P + 1;
  Result := (P <= Length(Text)) and (Text[P] <> ']');
end;

function IsConfigured(): Boolean;
begin
#if Role == "hub"
  Result := ListHasItems(ConfigText(), 'floors');
#else
  Result := ListHasItems(ConfigText(), 'links');
#endif
end;

{ 켜도 되는가: 언제나. 처음이면 펫이 등록을 받는다(관리자는 첫 방을 만든다). }
function Ready(): Boolean;
begin
  Result := True;
end;

function Port(Param: String): String;
var
  Text: String;
  P: Integer;
begin
  Result := '4322';
  Text := ConfigText();
  P := Pos('"port": ', Text);
  if P = 0 then Exit;
  P := P + 8;
  Result := '';
  while (P <= Length(Text)) and (Text[P] >= '0') and (Text[P] <= '9') do
  begin
    Result := Result + Text[P];
    P := P + 1;
  end;
  if Result = '' then Result := '4322';
end;

{ 켜져 있는 것을 먼저 끈다: 이 폴더의 node.exe 가 쓰이는 중이면 덮어쓸 수 없고,
  예전 압축 설치본이 켜져 있으면 포트가 겹친다. pid 파일은 설정 폴더에 하나뿐이다. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  S: AnsiString;
  Code: Integer;
begin
  Result := '';
#if Role != "hub"
  { 관리자 PC 는 허브가 자기 펫도 함께 띄운다. 팀원용을 같이 깔면 포트·설정이 겹친다. }
  if ListHasItems(ConfigText(), 'floors') then
  begin
    Result := '이 PC 는 팀 펫 허브(관리자)입니다. 팀원용 설치는 필요 없습니다 — 관리자용 설치 파일을 쓰세요.';
    Exit;
  end;
#endif
  if LoadStringFromFile(ExpandConstant('{%USERPROFILE}\.team-pet\{#LaunchRole}.pid'), S) and (Trim(String(S)) <> '') then
  begin
    { 오래된 pid 파일이 다른 프로그램 번호를 가리킬 수 있어 node.exe 일 때만 끈다. }
    Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /FI "IMAGENAME eq node.exe" /PID ' + Trim(String(S)), '', SW_HIDE, ewWaitUntilTerminated, Code);
    Sleep(800);
  end;
end;

{ 바탕화면 아이콘은 이 설치본을 가리킬 때만 지운다 — 같은 이름의 압축 설치본 아이콘은 남긴다. }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  F: String;
  S: AnsiString;
begin
  if CurUninstallStep <> usPostUninstall then Exit;
  F := ExpandConstant('{userdesktop}\{#AppTitle}.url');
  if LoadStringFromFile(F, S) and (Pos(Lowercase(ExpandConstant('{app}')), Lowercase(String(S))) > 0) then
    DeleteFile(F);
end;
