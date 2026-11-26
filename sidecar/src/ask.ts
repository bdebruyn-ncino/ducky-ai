import { runAgent } from "./agent.ts";
import { loadConfig } from "./config.ts";

const [project, question] = process.argv.slice(2);
if (!project || !question) {
  console.error('Usage: npm run ask -- <project> "<question>"');
  process.exit(1);
}

const result = await runAgent(loadConfig(), project, question);
if (result.ok) {
  console.log(result.answer);
} else {
  console.error(`Ducky couldn't answer: ${result.reason}`);
  process.exit(1);
}
