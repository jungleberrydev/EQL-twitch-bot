/**
 * Wiki lookup smoke test (no Twitch credentials needed).
 * Usage: npm run smoke -- "item SoulFire"
 *        npm run smoke -- "SoulFire"
 */
import { handleEqlCommand } from "../src/handler.js";

const args = process.argv.slice(2).join(" ").trim() || "item SoulFire";
const message = args.toLowerCase().startsWith("!eql")
  ? args
  : `!eql ${args}`;

const reply = await handleEqlCommand(message, "!eql");
console.log(reply ?? "(no reply — message did not match !eql)");
