import { runAgent } from "./agent.ts";
import { configFromDb, loadConfigFromJson } from "./config.ts";
import { openDb, readSettings } from "./db.ts";

const [project, question] = process.argv.slice(2);
if (!project || !question) {
  console.error('Usage: npm run ask -- <project> "<question>"');
  process.exit(1);
}

// Prefer JSON config (DUCKY_CONFIG env var), then fall back to the SQLite DB.
const config =
  loadConfigFromJson() ??
  (() => {
    const db = openDb();
    const settings = readSettings(db);
    db.close();
    if (!settings) {
      console.error("No configuration found. Run the sidecar and complete first-time setup.");
      process.exit(1);
    }
    return configFromDb(settings);
  })();

const result = await runAgent(config, project, question);
if (result.ok) {
  console.log(result.answer);
} else {
  console.error(`Ducky couldn't answer: ${result.reason}`);
  process.exit(1);
}
