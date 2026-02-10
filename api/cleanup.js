
import Database from "better-sqlite3";
import * as fs from 'fs';
const db = new Database("/var/www/api/base.db");


function cleanup() {
  let deleted = 0;
  let vacuumStatus = "unknown";
  let logLine;

  try {
    // Delete old rows
    const result = db.prepare("DELETE FROM fait WHERE date(date) < date(date(), '-1 day')").run();
    deleted = result.changes;

    // Try vacuum
    try {
        db.prepare("VACUUM").run();
        vacuumStatus = "completed";
    } catch (err) {
        vacuumStatus = "failed: " + err.message;
    }

    logLine = `[${new Date().toISOString()}] Deleted=${deleted} | Vacuum=${vacuumStatus}`;
  } catch (err) {
    logLine = `[${new Date().toISOString()}] Cleanup failed: ${err.message}`;
  }

  console.log(logLine);
  fs.appendFileSync('/var/www/api/cleanup.log', logLine + '\n');
}

cleanup();