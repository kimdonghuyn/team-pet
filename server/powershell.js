import fs from 'node:fs';
import path from 'node:path';

// PowerShell by its full path: on some PCs PATH lacks the PowerShell folder, and
// a bare "powershell" then fails to start (ENOENT). It ships with every Windows.
const full = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
export const POWERSHELL = fs.existsSync(full) ? full : 'powershell';
