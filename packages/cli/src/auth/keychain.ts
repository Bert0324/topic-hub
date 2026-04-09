import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const SERVICE_NAME = 'topichub-cli';
const CREDENTIALS_DIR = path.join(process.env.HOME ?? '~', '.topichub');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.enc');

let keytar: any = null;
try {
  keytar = require('keytar');
} catch {
  // keytar not available — fall back to encrypted file
}

export async function storeToken(account: string, token: string): Promise<void> {
  if (keytar) {
    await keytar.setPassword(SERVICE_NAME, account, token);
    return;
  }
  await storeToFile(account, token);
}

export async function getToken(account: string): Promise<string | null> {
  if (keytar) {
    return keytar.getPassword(SERVICE_NAME, account);
  }
  return getFromFile(account);
}

export async function deleteToken(account: string): Promise<void> {
  if (keytar) {
    await keytar.deletePassword(SERVICE_NAME, account);
    return;
  }
  await deleteFromFile(account);
}

const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(process.env.TOPICHUB_FILE_KEY ?? 'topichub-default-dev-key')
  .digest();

function ensureDir() {
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  }
}

function readStore(): Record<string, string> {
  if (!fs.existsSync(CREDENTIALS_FILE)) return {};
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    const [ivHex, encrypted] = raw.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return JSON.parse(decrypted);
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string>) {
  ensureDir();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(JSON.stringify(store), 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  fs.writeFileSync(CREDENTIALS_FILE, `${iv.toString('hex')}:${encrypted}`, {
    mode: 0o600,
  });
}

async function storeToFile(account: string, token: string) {
  const store = readStore();
  store[account] = token;
  writeStore(store);
}

async function getFromFile(account: string): Promise<string | null> {
  const store = readStore();
  return store[account] ?? null;
}

async function deleteFromFile(account: string) {
  const store = readStore();
  delete store[account];
  writeStore(store);
}
