import { ConfigError } from "./config/config-error.js";
import { parseEnv } from "./config/env.js";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  const server = await startServer(parseEnv(process.env));
  const shutDown = () => void server.close().then(() => process.exit(0));
  process.once("SIGINT", shutDown);
  process.once("SIGTERM", shutDown);
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    // The message names the file and the rule, never a value.
    console.error(error.message);
    process.exit(1);
  }
  throw error;
});
