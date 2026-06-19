import { type CoreRequest, runHeadless } from "../core/headless";

// Reads a JSON CoreRequest from stdin and writes a JSON CoreResponse to stdout.
// This is the seed of a daemon/IPC mode: a web server or desktop app can drive
// the core over a pipe without any TUI. Example:
//   echo '{"kind":"operations","hasStaging":true}' | vibe-wp-installer --headless-json
export async function runHeadlessJson(): Promise<void> {
  const input = (await Bun.stdin.text()).trim();
  if (!input) {
    console.log(JSON.stringify({ kind: "error", message: "Empty request." }));
    return;
  }
  let request: CoreRequest;
  try {
    request = JSON.parse(input) as CoreRequest;
  } catch {
    console.log(JSON.stringify({ kind: "error", message: "Invalid JSON request." }));
    return;
  }
  const response = await runHeadless(request);
  console.log(JSON.stringify(response, null, 2));
}
