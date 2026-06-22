import { type CoreRequest, runHeadless, runHeadlessRunPlan } from "../core/headless";
import { terminateActiveTask } from "../core/task-runner";

// Reads a JSON CoreRequest from stdin and writes a JSON CoreResponse to stdout.
// This is the seed of a daemon/IPC mode: a web server or desktop app can drive
// the core over a pipe without any TUI. Example:
//   echo '{"kind":"operations","hasStaging":true}' | vibe-wp-installer --headless-json
export async function runHeadlessJson(): Promise<void> {
  // The panel cancels a provision by killing this process tree; sudo forwards the
  // SIGTERM down to us. Propagate it to the in-flight task subprocess (e.g.
  // `docker compose up`) so a canceled provision stops on the host instead of
  // orphaning a root child that keeps building the site, then exit non-zero.
  const onCancel = () => {
    terminateActiveTask();
    process.exit(143);
  };
  process.on("SIGTERM", onCancel);
  process.on("SIGINT", onCancel);

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
  // runPlan streams: one compact NDJSON line per progress event, then ONE compact
  // line for the terminal CoreResponse. Compact (not pretty) so each event is a
  // single, unambiguously framed line the panel bridge can read incrementally.
  if (request.kind === "runPlan") {
    const final = await runHeadlessRunPlan(request.plan, request.apply, (event) => {
      console.log(JSON.stringify(event));
    });
    console.log(JSON.stringify(final));
    return;
  }
  // Every other kind stays a single pretty-printed, fully parseable CoreResponse.
  const response = await runHeadless(request);
  console.log(JSON.stringify(response, null, 2));
}
