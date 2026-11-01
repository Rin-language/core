// Exits 0 only when the network is unreachable. Run before the tests of the
// offline job, so a green run proves they needed no network: a test suite that
// silently reached a real model would otherwise pass.
import { connect } from "node:net";

const PROBE_ADDRESS = "1.1.1.1";
const PROBE_PORT = 443;
const PROBE_TIMEOUT_MS = 3000;

const socket = connect(PROBE_PORT, PROBE_ADDRESS);
socket.setTimeout(PROBE_TIMEOUT_MS);
socket.on("connect", () => {
  console.error("The network is reachable: this is not an offline run.");
  process.exit(1);
});
socket.on("timeout", () => process.exit(0));
socket.on("error", () => process.exit(0));
