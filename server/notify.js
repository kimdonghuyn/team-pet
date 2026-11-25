import { spawn } from 'node:child_process';
import { POWERSHELL } from './powershell.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Windows alerts for the person at this PC (a call by name, a note, a poke, a game's turn).

// The toast's sender. Windows shows the name and icon registered for this id
// under the user's own classes (no admin rights); without it, a toast would
// have to borrow PowerShell's id and show up as "Windows PowerShell".
const APP_ID = 'TeamPet.TeamPet';
const ICON = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'assets', 'icon.png');

// A Windows toast through PowerShell, or a macOS notification through osascript, so no
// install is needed. Elsewhere (or if it fails) the line in the console is the alert.
// open: a page the Windows toast opens when clicked.
export function desktopNotify(title, body, { open = '' } = {}) {
  console.log(`[알림] ${title} — ${body}`);
  if (process.platform === 'darwin') {
    // Passed as arguments, never pasted into the script, so no quote in a message can break it.
    const script = 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run';
    try { spawn('osascript', ['-e', script, String(title), String(body)], { stdio: 'ignore' }).on('error', () => {}); } catch {}
    return;
  }
  if (process.platform !== 'win32') return;
  try {
    spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', toastScript(title, body, open)], { stdio: 'ignore', windowsHide: true }).on('error', () => {});
  } catch {}
}

export function toastScript(title, body, open = '') {
  // Single quotes are the only thing a PowerShell literal string needs escaped.
  const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const launch = open ? ` activationType="protocol" launch="${escXml(open)}"` : '';
  const xml = `<toast${launch}><visual><binding template="ToastGeneric"><text>${escXml(title)}</text><text>${escXml(body)}</text></binding></visual></toast>`;
  return [
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
    '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
    '$x = New-Object Windows.Data.Xml.Dom.XmlDocument',
    `$x.LoadXml(${lit(xml)})`,
    `$key = ${lit(`HKCU:\\Software\\Classes\\AppUserModelId\\${APP_ID}`)}`,
    'New-Item -Path $key -Force | Out-Null',
    "Set-ItemProperty -Path $key -Name DisplayName -Value '팀 펫'",
    `Set-ItemProperty -Path $key -Name IconUri -Value ${lit(ICON)}`,
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(${lit(APP_ID)}).Show([Windows.UI.Notifications.ToastNotification]::new($x))`,
  ].join('; ');
}

function escXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}
