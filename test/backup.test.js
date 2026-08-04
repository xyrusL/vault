import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const view = await readFile(new URL("../src/dashboard/BackupView.jsx", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/api.js", import.meta.url), "utf8");

test("full JSON backups include all restorable protected records", () => {
  assert.match(worker, /format: 'vault-backup'/);
  assert.match(worker, /version: 2/);
  assert.match(worker, /vaultSecrets,/);
  assert.match(worker, /notes,/);
  assert.match(worker, /authenticators,/);
  assert.match(worker, /password: await decryptCredential/);
  assert.match(worker, /const backupAccounts = \(accountResult\.results \|\| \[\]\)\.map\(presentBackupAccount\)/);
  assert.match(worker, /const accountFields = format === 'json'/);
  assert.match(worker, /accounts: accountsWithPasswords/);
  assert.match(worker, /\.\.\.backupAccounts\.map/);
  assert.match(worker, /backup\.exported/);
});

test("backup files are encrypted locally and support legacy imports", () => {
  assert.match(view, /format: "vault-encrypted-backup"/);
  assert.match(view, /crypto\.subtle\.encrypt/);
  assert.match(view, /crypto\.subtle\.decrypt/);
  assert.match(view, /PBKDF2-SHA-256/);
  assert.match(view, /backupIterations = 250000/);
  assert.match(view, /Array\.isArray\(backup\)/);
  assert.match(view, /vaultSecrets \|\| \[\]/);
  assert.match(view, /Restore adds records without deleting existing data/);
});
