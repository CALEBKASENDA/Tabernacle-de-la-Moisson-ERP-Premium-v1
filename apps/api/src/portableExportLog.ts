import fs from 'node:fs';
import path from 'node:path';

export type PortableExportLogEntry = {
  id: string;
  at: string;
  direction: 'export' | 'import';
  packagePath: string;
  bytes?: number;
  userId?: string;
};

const LOG_FILE = 'portable-export-history.json';

function logPath(dataDir: string): string {
  return path.join(dataDir, LOG_FILE);
}

export function readPortableExportHistory(dataDir: string): PortableExportLogEntry[] {
  const file = logPath(dataDir);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PortableExportLogEntry[];
  } catch {
    return [];
  }
}

export function appendPortableExportLog(
  dataDir: string,
  entry: Omit<PortableExportLogEntry, 'id' | 'at'>
): PortableExportLogEntry {
  const items = readPortableExportHistory(dataDir);
  const row: PortableExportLogEntry = {
    id: `pel_${Date.now()}`,
    at: new Date().toISOString(),
    ...entry,
  };
  items.unshift(row);
  fs.writeFileSync(logPath(dataDir), JSON.stringify(items.slice(0, 50), null, 2), 'utf8');
  return row;
}
