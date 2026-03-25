import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH    = path.join(__dirname, "base.db");
const BACKUP_DIR = path.join(__dirname, "backup");
const RETENTION_DAYS = 14;

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// Créer le dossier backup s'il n'existe pas
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Backup
const timestamp = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
const backupPath = path.join(BACKUP_DIR, `base_${timestamp}.db`);

log(`Backup → ${backupPath}`);
const db = new Database(DB_PATH);
await db.backup(backupPath);
db.close();
log("Backup terminée.");

// Purge des fichiers > 14 jours
const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
for (const file of fs.readdirSync(BACKUP_DIR)) {
  if (!file.endsWith(".db")) continue;
  const filePath = path.join(BACKUP_DIR, file);
  if (fs.statSync(filePath).mtimeMs < cutoff) {
    fs.unlinkSync(filePath);
    log(`Supprimé : ${file}`);
  }
}
