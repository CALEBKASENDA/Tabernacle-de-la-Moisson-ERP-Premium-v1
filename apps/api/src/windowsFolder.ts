import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

export function listWindowsDrives(): string[] {
  if (process.platform !== 'win32') {
    return ['/'];
  }
  const drives: string[] = [];
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    const root = `${letter}:\\`;
    try {
      if (fs.existsSync(root)) drives.push(root);
    } catch {
      /* ignore */
    }
  }
  return drives;
}

export function browseWindowsFolder(initialPath?: string): string | null {
  if (process.platform !== 'win32') {
    return initialPath ?? null;
  }

  const init = (initialPath ?? '').replace(/'/g, "''");
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = 'Selectionnez un dossier (cle USB, disque...)'
$dlg.ShowNewFolderButton = $true
if ('${init}' -ne '') { $dlg.SelectedPath = '${init}' }
if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dlg.SelectedPath
}
`;

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', timeout: 120_000, windowsHide: false }
  );

  const out = (result.stdout ?? '').trim();
  if (!out || result.status !== 0) return null;
  return out;
}
