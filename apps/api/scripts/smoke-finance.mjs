/**
 * Test smoke finance — login + création opération + vérif JSON.
 * Usage : node scripts/smoke-finance.mjs [port]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const port = process.argv[2] ?? '3847';
const base = `http://127.0.0.1:${port}/api/v1`;

async function req(method, urlPath, body, headers = {}) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${method} ${urlPath} → JSON invalide (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} → HTTP ${res.status}: ${json.error ?? text}`);
  }
  return json;
}

const envPath = path.join(os.homedir(), 'AppData', 'Local', 'Tabernacle ERP', '.env');
let email = 'admin@local.dev';
let password = 'ChangeMe123!';
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('TABERNACLE_BOOTSTRAP_EMAIL=')) email = line.split('=')[1].trim();
    if (line.startsWith('TABERNACLE_BOOTSTRAP_PASSWORD=')) password = line.split('=').slice(1).join('=').trim();
  }
}

const login = await req('POST', '/auth/login', { email, password });
const sessionId = login.data.sessionId;
const headers = {
  'x-session-id': sessionId,
  'x-church-id': login.data.churchId,
  'x-user-id': login.data.userId,
  'x-workstation-id': 'smoke_test',
};

const taux = await req('GET', '/finance/exchange-rates/today', null, headers);
if (!taux.data) throw new Error('Aucun taux du jour — bootstrap échoué');

const cats = await req('GET', '/finance/categories', null, headers);
if (!cats.data?.length) throw new Error('Aucune rubrique');

const today = new Date().toISOString().slice(0, 10);
const created = await req(
  'POST',
  '/finance/operations',
  {
    pieceType: 'REC',
    opDate: today,
    label: 'Test smoke automatisé',
    categoryId: cats.data[0].category_id,
    fundId: null,
    receiptsCdf: '1000',
    receiptsUsd: '0',
    expensesCdf: '0',
    expensesUsd: '0',
  },
  headers
);

if (!created.data?.pieceNumber) throw new Error('Réponse création opération invalide');

console.log('OK smoke finance —', created.data.pieceNumber);
