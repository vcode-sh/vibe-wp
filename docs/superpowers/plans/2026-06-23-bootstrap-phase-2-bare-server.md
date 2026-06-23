# One-Command Bootstrap — Phase 2: Bare-Server Bootstrap (installer-led §7a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a bare VPS, `curl … | sh` clones the repo and leads the installer with a "Set up your control panel" path that installs Docker/Caddy/Bun standalone and runs `/opt/vibe-wp/bin/panel install --access … --admin-email … --admin-password …`, ending at a working HTTPS panel URL.

**Architecture:** A new `panel-bootstrap` install mode. `public-install/install.sh` clones `/opt/vibe-wp`. `host-install.ts` gains a standalone `install-bun` task. A new `core/panel-bootstrap-plan.ts` assembles `[dns-preflight? , docker, caddy, bun, panel-install]` as an `InstallPlan`, reusing the existing `runPlan` executor. The TUI bare-server welcome branch sets the mode; a `PanelScreen` collects access-mode + owner login; the existing Execute screen runs it. Headless parity via `--bootstrap-panel`.

**Tech Stack:** Bun + React/OpenTUI installer (`installer/`), POSIX `sh` (`public-install/install.sh`), `bun test`. **Depends on Phase 1** (`bin/panel --access`).

## Global Constraints

- **Phase 1 is a hard prerequisite:** `bin/panel install --access <domain|magic-dns|ip-port|localhost>` must exist before Task 5's panel-install task can call it.
- Installer rule (`docs/project-rules.md`): TS/TSX files **≤220 lines**; business logic in `core/`, screens stay presentational; **never run shell from screens** — go through the plan/executor; **never print secrets** — the owner password lives only in state/argv, never in redacted plan output or logs.
- `InstallTask.command` is an **argv array**, by convention `["sh","-lc","<one shell line>"]`; privilege comes from a baked-in `sudo ` prefix (`state.host.sudo ? "sudo " : ""`), **not** the cosmetic `privileged` flag.
- **Reserved task ids** (`env-prod`, `env-stage`, `env-external`, `caddyfile`, `stage-caddyfile`) trigger task-runner special writes — panel tasks MUST use fresh ids (`install-bun`, `panel-install`).
- `bin/panel install` blocks on a TTY prompt unless `--domain`/`--admin-email`/`--admin-password` are all passed — the panel plan must pass all three (domain only for `--access domain`).
- `bin/panel` must be invoked as `/opt/vibe-wp/bin/panel` so its `REPO_DIR` resolves to the checkout.
- Default install dir constant: `DEFAULT_INSTALL_DIR = "/opt/vibe-wp"` (`installer/src/cli/args.ts:3`).

---

### Task 1: `public-install/install.sh` clones the canonical repo (Seam A)

**Files:**
- Modify: `public-install/install.sh` (add `git` to required commands; insert clone block before the exec section ~`:179`)

**Interfaces:**
- Produces: a repo checkout at `/opt/vibe-wp` (idempotent) so `bin/panel`/host-level ops have source on disk.
- Consumes: nothing new.

- [ ] **Step 1: Require git (with sudo detection for `/opt`)**

After the existing `need_command` calls (`public-install/install.sh:73-76`), add git as required and detect sudo (the shell currently has none):
```sh
need_command git
if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi
```

- [ ] **Step 2: Clone/update `/opt/vibe-wp` before exec**

Immediately before the `eval "set -- $forward_args"` exec section (`:179`), add:
```sh
VIBE_REPO_DIR="${VIBE_WP_REPO_DIR:-/opt/vibe-wp}"
VIBE_REPO_URL="${VIBE_WP_REPO_URL:-https://github.com/vibe-wp/vibe-wp.git}"
if [ ! -d "$VIBE_REPO_DIR/.git" ]; then
  echo "Cloning Vibe WP to $VIBE_REPO_DIR ..." >&2
  $SUDO git clone --depth 1 "$VIBE_REPO_URL" "$VIBE_REPO_DIR"
else
  $SUDO git -C "$VIBE_REPO_DIR" pull --ff-only >/dev/null 2>&1 || true
fi
```
(The `VIBE_WP_REPO_URL` default must be set to the real repo origin at implementation time — confirm via `git -C . remote get-url origin`.)

- [ ] **Step 3: Keep `NO_EXEC` honest**

Verify the `VIBE_WP_INSTALLER_NO_EXEC=1` early-exit (`:174-177`) still precedes nothing host-mutating it shouldn't. The clone is intentionally *after* `NO_EXEC` returns (so the safe-check path stays read-only). Move the clone block to AFTER the `NO_EXEC` exit (it is already, since `:174` is before `:179`). Confirm by reading: `NO_EXEC` exit at `:176`, clone after.

- [ ] **Step 4: shellcheck**

Run: `shellcheck public-install/install.sh`
Expected: no new warnings.

- [ ] **Step 5: Commit**

```bash
git add public-install/install.sh
git commit -m "install.sh: clone canonical repo to /opt/vibe-wp for panel deploy"
```

---

### Task 2: Detect Bun in host facts

**Files:**
- Modify: `installer/src/core/types.ts` (`HostFacts` ~`:58-74`)
- Modify: `installer/src/core/defaults.ts` (`emptyHostFacts` ~`:14-31`)
- Modify: `installer/src/core/host.ts` (`detectHostFacts` ~`:45`)
- Test: `installer/src/core/host-install.test.ts` helper (add a `bun` knob)

**Interfaces:**
- Produces: `HostFacts.bun: string | null` (version string or null).
- Consumes: existing `commandVersion(command, args)` (`host.ts:23-33`).

- [ ] **Step 1: Add the field to the type**

In `installer/src/core/types.ts` `HostFacts` (after `caddy: string | null,`), add:
```ts
  bun: string | null;
```

- [ ] **Step 2: Add to `emptyHostFacts`**

In `installer/src/core/defaults.ts` `emptyHostFacts()`, add alongside `caddy: null,`:
```ts
    bun: null,
```

- [ ] **Step 3: Detect it**

In `installer/src/core/host.ts` `detectHostFacts`, next to the caddy detection (`:47`), add:
```ts
  facts.bun = await commandVersion("bun", ["--version"]);
```

- [ ] **Step 4: Verify the type compiles + existing tests pass**

Run: `cd installer && bun run typecheck && bun test src/core/host-install.test.ts`
Expected: typecheck clean; existing host-install tests still pass (they don't assert bun yet).

- [ ] **Step 5: Commit**

```bash
git add installer/src/core/types.ts installer/src/core/defaults.ts installer/src/core/host.ts
git commit -m "installer: detect Bun in host facts"
```

---

### Task 3: Standalone `install-bun` host task + `installBun` state

**Files:**
- Modify: `installer/src/core/types.ts` (`InstallerState` ~`:88-146`)
- Modify: `installer/src/core/defaults.ts` (`defaultState` — set `installBun`)
- Modify: `installer/src/core/host-install.ts` (`buildHostInstallTasks`)
- Test: `installer/src/core/host-install.test.ts`

**Interfaces:**
- Consumes: `state.installBun: boolean`, `state.host.bun` (Task 2), `state.host.sudo`.
- Produces: an `install-bun` `InstallTask` (id `"install-bun"`) when `installBun && !host.bun`.

- [ ] **Step 1: Write the failing test**

In `installer/src/core/host-install.test.ts`, extend the helper to accept a `bun` override and add:
```ts
it("installs Bun when missing", () => {
  const state = hostState({ docker: "x", caddy: "x", bun: null });
  state.installBun = true;
  const ids = buildHostInstallTasks(state).map((t) => t.id);
  expect(ids).toContain("install-bun");
});

it("skips Bun when already present", () => {
  const state = hostState({ docker: "x", caddy: "x", bun: "1.2.3" });
  state.installBun = true;
  const ids = buildHostInstallTasks(state).map((t) => t.id);
  expect(ids).not.toContain("install-bun");
});
```
(Update `hostState` to spread `bun` into `state.host` and default `state.installBun = !overrides.bun`.)

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd installer && bun test src/core/host-install.test.ts -t Bun`
Expected: FAIL (`install-bun` not produced; `installBun` not a field yet).

- [ ] **Step 3: Add `installBun` to state + default**

`types.ts` `InstallerState`: add near `installCaddy`/`installDocker`:
```ts
  installBun: boolean;
```
`defaults.ts` `defaultState`: set it true when Bun is absent, mirroring the docker/caddy defaults:
```ts
    installBun: !host.bun,
```

- [ ] **Step 4: Add the `install-bun` task**

In `installer/src/core/host-install.ts`, before the `rcloneTask` block, add (mirrors `bin/panel`'s Bun install — system-wide so systemd can exec it):
```ts
  if (state.installBun && !state.host.bun) {
    tasks.push({
      id: "install-bun",
      title: "Install Bun",
      description: "Install the Bun runtime to /usr/local for the control panel.",
      privileged: true,
      command: [
        "sh",
        "-lc",
        `curl -fsSL https://bun.sh/install | ${sudo}env BUN_INSTALL=/usr/local bash`
      ]
    });
  }
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `cd installer && bun test src/core/host-install.test.ts`
Expected: PASS (all, including the two new cases).

- [ ] **Step 6: Commit**

```bash
git add installer/src/core/types.ts installer/src/core/defaults.ts installer/src/core/host-install.ts installer/src/core/host-install.test.ts
git commit -m "installer: standalone install-bun host task gated on host.bun"
```

---

### Task 4: `panel-bootstrap-plan.ts` — pure access-URL helper + plan builder

**Files:**
- Create: `installer/src/core/panel-access.ts` (pure resolver, ≤60 lines)
- Create: `installer/src/core/panel-access.test.ts`
- Create: `installer/src/core/panel-bootstrap-plan.ts` (≤120 lines)
- Create: `installer/src/core/panel-bootstrap-plan.test.ts`

**Interfaces:**
- Produces:
  - `type PanelAccessMode = "domain" | "magic-dns" | "ip-port" | "localhost"`
  - `resolvePanelAccessUrl(mode: PanelAccessMode, domain: string, publicIp: string | null): string` — the display/Done URL. **Contract: must match `bin/panel`'s resolver from Phase 1** (magic-dns → `https://panel.<ip-dashed>.sslip.io`, ip-port → `https://<ip>:8443`, localhost → `https://localhost:8443`, domain → `https://<domain>`).
  - `buildPanelBootstrapPlan(state: InstallerState): InstallPlan`
- Consumes: `buildHostInstallTasks` (host-install.ts), `buildDnsPreflightTask` (dns-preflight.ts), `INSTALLER_VERSION` (defaults.ts), `shellQuote` (shell.ts), `state.panelAccessMode`, `state.productionDomain`, `state.adminEmail`, `state.adminPassword`, `state.host.publicIp`.

- [ ] **Step 1: Write the failing test for the pure resolver**

`installer/src/core/panel-access.test.ts`:
```ts
import { describe, expect, it } from "bun:test";
import { resolvePanelAccessUrl } from "./panel-access";

describe("resolvePanelAccessUrl", () => {
  it("derives a dashed sslip.io host for magic-dns", () => {
    expect(resolvePanelAccessUrl("magic-dns", "", "203.0.113.7"))
      .toBe("https://panel.203-0-113-7.sslip.io");
  });
  it("uses ip:8443 for ip-port", () => {
    expect(resolvePanelAccessUrl("ip-port", "", "203.0.113.7"))
      .toBe("https://203.0.113.7:8443");
  });
  it("uses the domain verbatim for domain mode", () => {
    expect(resolvePanelAccessUrl("domain", "panel.acme.com", null))
      .toBe("https://panel.acme.com");
  });
  it("uses localhost:8443 for localhost", () => {
    expect(resolvePanelAccessUrl("localhost", "", null))
      .toBe("https://localhost:8443");
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd installer && bun test src/core/panel-access.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the resolver**

`installer/src/core/panel-access.ts`:
```ts
export type PanelAccessMode = "domain" | "magic-dns" | "ip-port" | "localhost";

export const PANEL_ACCESS_MODES: PanelAccessMode[] = [
  "domain",
  "magic-dns",
  "ip-port",
  "localhost",
];

// Display/Done URL. MUST mirror bin/panel resolve_access() (Phase 1).
export function resolvePanelAccessUrl(
  mode: PanelAccessMode,
  domain: string,
  publicIp: string | null,
): string {
  switch (mode) {
    case "domain":
      return `https://${domain}`;
    case "magic-dns": {
      const dashed = (publicIp ?? "").replaceAll(".", "-");
      return `https://panel.${dashed}.sslip.io`;
    }
    case "ip-port":
      return `https://${publicIp ?? ""}:8443`;
    case "localhost":
      return "https://localhost:8443";
  }
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `cd installer && bun test src/core/panel-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the plan builder**

`installer/src/core/panel-bootstrap-plan.test.ts` (mirror `headless.test.ts`'s minimal-state pattern; build a bare state via `defaultState` + overrides):
```ts
import { describe, expect, it } from "bun:test";
import { defaultState } from "./defaults";
import { emptyHostFacts } from "./defaults";
import { buildPanelBootstrapPlan } from "./panel-bootstrap-plan";

function bareState() {
  const host = { ...emptyHostFacts(), sudo: true, publicIp: "203.0.113.7" };
  const state = defaultState(host);
  state.mode = "panel-bootstrap";
  state.panelAccessMode = "magic-dns";
  state.adminEmail = "you@acme.com";
  state.adminPassword = "supersecret";
  state.installDocker = true;
  state.installCaddy = true;
  state.installBun = true;
  return state;
}

describe("buildPanelBootstrapPlan", () => {
  it("orders host installs before the panel install", () => {
    const ids = buildPanelBootstrapPlan(bareState()).tasks.map((t) => t.id);
    expect(ids).toEqual([
      "install-docker",
      "install-caddy",
      "install-bun",
      "panel-install",
    ]);
  });

  it("passes the access mode + owner creds to bin/panel and omits --domain for magic-dns", () => {
    const plan = buildPanelBootstrapPlan(bareState());
    const panel = plan.tasks.find((t) => t.id === "panel-install");
    const line = panel?.command?.[2] ?? "";
    expect(line).toContain("/opt/vibe-wp/bin/panel install");
    expect(line).toContain("--access magic-dns");
    expect(line).toContain("--admin-email you@acme.com");
    expect(line).toContain("--admin-password");
    expect(line).not.toContain("--domain");
  });

  it("includes a DNS preflight only for domain mode", () => {
    const s = bareState();
    s.panelAccessMode = "domain";
    s.productionDomain = "panel.acme.com";
    const ids = buildPanelBootstrapPlan(s).tasks.map((t) => t.id);
    expect(ids[0]).toBe("dns-preflight");
  });
});
```

- [ ] **Step 6: Run — verify it fails**

Run: `cd installer && bun test src/core/panel-bootstrap-plan.test.ts`
Expected: FAIL (module not found / `panel-bootstrap` mode not yet in the union — add it in Task 5; for now the import fails).

> Note: this test depends on Task 5's `InstallMode`/state-field additions. If running tasks in order, implement Task 5 Steps 1–2 (type additions) before this builder compiles. The plan keeps them separate because Task 5 also covers CLI wiring; do the type additions first.

- [ ] **Step 7: Implement the plan builder**

`installer/src/core/panel-bootstrap-plan.ts`:
```ts
import { buildDnsPreflightTask } from "./dns-preflight";
import { INSTALLER_VERSION } from "./defaults";
import { buildHostInstallTasks } from "./host-install";
import { resolvePanelAccessUrl } from "./panel-access";
import { shellQuote } from "./shell";
import type { InstallPlan, InstallTask, InstallerState } from "./types";

export function buildPanelBootstrapPlan(state: InstallerState): InstallPlan {
  const tasks: InstallTask[] = [];
  if (state.panelAccessMode === "domain") {
    tasks.push(buildDnsPreflightTask(state));
  }
  tasks.push(...buildHostInstallTasks(state));

  const sudo = state.host.sudo ? "sudo " : "";
  const parts = [
    `${sudo}/opt/vibe-wp/bin/panel install`,
    `--access ${state.panelAccessMode}`,
    `--admin-email ${shellQuote(state.adminEmail)}`,
    `--admin-password ${shellQuote(state.adminPassword)}`,
  ];
  if (state.panelAccessMode === "domain") {
    parts.push(`--domain ${shellQuote(state.productionDomain)}`);
  }
  tasks.push({
    id: "panel-install",
    title: "Install the control panel",
    description: "Deploy the Vibe WP control panel (systemd + Caddy + owner).",
    privileged: true,
    command: ["sh", "-lc", parts.join(" ")],
  });

  const url = resolvePanelAccessUrl(
    state.panelAccessMode,
    state.productionDomain,
    state.host.publicIp,
  );
  return {
    caddyfile: "",
    domains: {
      production: state.productionDomain,
      stagingEnabled: false,
      staging: "",
      wwwAlias: false,
    },
    envFiles: [],
    generatedAt: "",
    installDir: "/opt/vibe-wp-panel",
    localSandbox: state.localSandbox,
    ref: "",
    repo: "",
    siteSlug: "panel",
    summary: `Set up the control panel at ${url}`,
    tasks,
    version: INSTALLER_VERSION,
    warnings: [],
  };
}
```
(If `InstallPlan` requires different/more fields, copy them verbatim from `types.ts:163-182`; the test's `headless.test.ts` `planWithTasks` helper shows the exact required set.)

- [ ] **Step 8: Run — verify it passes**

Run: `cd installer && bun test src/core/panel-bootstrap-plan.test.ts src/core/panel-access.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add installer/src/core/panel-access.ts installer/src/core/panel-access.test.ts installer/src/core/panel-bootstrap-plan.ts installer/src/core/panel-bootstrap-plan.test.ts
git commit -m "installer: panel-bootstrap plan + pure access-URL resolver"
```

---

### Task 5: `panel-bootstrap` mode + state fields + CLI flags

**Files:**
- Modify: `installer/src/core/types.ts` (`InstallMode` `:1-7`; `InstallerState` `:88-146`)
- Modify: `installer/src/cli/args.ts` (`INSTALL_MODES` `:5-12`; flag maps; `parseArgs`)
- Modify: `installer/src/cli/usage.ts`
- Modify: `installer/src/cli/apply-cli-state.ts`
- Modify: `installer/src/main.tsx` (set mode when `--bootstrap-panel`)
- Modify: `installer/src/core/install-plan.ts` (`buildTasks` mode dispatch `:69-83`)
- Test: `installer/src/cli/args.test.ts`

**Interfaces:**
- Produces: `InstallMode` gains `"panel-bootstrap"`; `InstallerState` gains `panelAccessMode: PanelAccessMode` (default `"magic-dns"`) and reuses `adminPassword`/`adminEmail`/`productionDomain`; CLI flags `--bootstrap-panel`, `--access <mode>`, `--admin-password <p>`.
- Consumes: `PANEL_ACCESS_MODES` (Task 4), `buildPanelBootstrapPlan` (Task 4).

- [ ] **Step 1: Extend the type unions**

`types.ts` `InstallMode`: add `| "panel-bootstrap"`.
`types.ts` `InstallerState`: add (import the type):
```ts
  panelAccessMode: PanelAccessMode;
```
`defaults.ts` `defaultState`: add `panelAccessMode: "magic-dns",`.

- [ ] **Step 2: Mode dispatch in `buildInstallPlan`**

`install-plan.ts` `buildTasks` mode-dispatch block (`:69-83`), add at the top:
```ts
  if (state.mode === "panel-bootstrap") {
    return buildPanelBootstrapPlan(state).tasks;
  }
```
(Import `buildPanelBootstrapPlan`. Since `buildInstallPlan` wraps `buildTasks` into a full plan, returning the panel plan's `.tasks` keeps the existing wrapper; the panel-specific summary/installDir come through Task 4's builder when called directly by the headless path — for the TUI path the wrapper plan is fine because the panel screen drives `productionDomain`/access.)

- [ ] **Step 3: Write the failing CLI test**

`installer/src/cli/args.test.ts`, add:
```ts
it("parses --bootstrap-panel and --access", () => {
  const o = parseArgs(["--bootstrap-panel", "--access", "magic-dns", "--admin-email", "a@b.c"]);
  expect(o.bootstrapPanel).toBe(true);
  expect(o.access).toBe("magic-dns");
});
it("rejects an invalid --access value", () => {
  expect(() => parseArgs(["--access", "nope"])).toThrow("Invalid --access value: nope");
});
```

- [ ] **Step 4: Run — verify it fails**

Run: `cd installer && bun test src/cli/args.test.ts -t access`
Expected: FAIL.

- [ ] **Step 5: Add the flags**

`args.ts`: add `"bootstrapPanel"` to the `BooleanOption` union + `booleanFlags` Map (`["--bootstrap-panel","bootstrapPanel"]`); add `access` + `adminPassword` to the `StringOption` union + `stringFlags` Map (`["--admin-password","adminPassword"]`); for `--access`, mirror the `parseMode` custom-validation pattern (`:173-179`):
```ts
const ACCESS_MODES = ["domain", "magic-dns", "ip-port", "localhost"];
function parseAccess(value: string): string {
  if (!ACCESS_MODES.includes(value)) {
    throw new Error(`Invalid --access value: ${value}`);
  }
  return value;
}
```
Wire `--access` through `parseAccess` in `parseArgs`. Add `bootstrapPanel`/`access`/`adminPassword` to `InstallerOptions` (`types.ts:12-56`) + the defaults object (`:105-124`).

- [ ] **Step 6: Run — verify it passes**

Run: `cd installer && bun test src/cli/args.test.ts`
Expected: PASS.

- [ ] **Step 7: Wire options → state**

`main.tsx`: when `options.bootstrapPanel`, set `state.mode = "panel-bootstrap"` before `buildInstallPlan`. `apply-cli-state.ts`: map `options.access` → `state.panelAccessMode` and `options.adminPassword` → `state.adminPassword`. `usage.ts`: add `--bootstrap-panel`, `--access domain|magic-dns|ip-port|localhost`, `--admin-password P` to the Options block.

- [ ] **Step 8: Typecheck + full installer tests + commit**

Run: `cd installer && bun run quality`
Expected: check:loc + typecheck + lint + test all green.
```bash
git add installer/src/core/types.ts installer/src/core/defaults.ts installer/src/cli/args.ts installer/src/cli/args.test.ts installer/src/cli/usage.ts installer/src/cli/apply-cli-state.ts installer/src/main.tsx installer/src/core/install-plan.ts
git commit -m "installer: panel-bootstrap mode + --bootstrap-panel/--access/--admin-password flags"
```

---

### Task 6: Headless `panelBootstrapPlan` request (programmatic + GUI bridge)

**Files:**
- Modify: `installer/src/core/headless.ts` (`CoreRequest`/`CoreResponse` `:15-32`; `runHeadless` switch)
- Test: `installer/src/core/headless.test.ts`

**Interfaces:**
- Produces: `CoreRequest` gains `{ kind: "panelBootstrapPlan"; state: InstallerState }`; `runHeadless` returns `{ kind: "plan"; plan }` with the panel plan (reuse the existing `plan` response shape so `runPlan`/`runHeadlessRunPlan` execute it unchanged).
- Consumes: `buildPanelBootstrapPlan` (Task 4).

- [ ] **Step 1: Write the failing test**

`installer/src/core/headless.test.ts`, add (mirror the existing `runHeadless({kind:"plan"})` test):
```ts
it("builds a panel-bootstrap plan", async () => {
  const state = /* bareState() as in panel-bootstrap-plan.test.ts */;
  const res = await runHeadless({ kind: "panelBootstrapPlan", state });
  if (res.kind !== "plan") throw new Error("expected plan");
  expect(res.plan.tasks.map((t) => t.id)).toContain("panel-install");
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd installer && bun test src/core/headless.test.ts -t panel-bootstrap`
Expected: FAIL.

- [ ] **Step 3: Add the request kind + handler**

`headless.ts`: add to the `CoreRequest` union `| { kind: "panelBootstrapPlan"; state: InstallerState }`; in `runHeadless`'s switch, add:
```ts
    case "panelBootstrapPlan":
      return { kind: "plan", plan: buildPanelBootstrapPlan(request.state) };
```

- [ ] **Step 4: Run — verify it passes**

Run: `cd installer && bun test src/core/headless.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add installer/src/core/headless.ts installer/src/core/headless.test.ts
git commit -m "installer: headless panelBootstrapPlan request"
```

---

### Task 7: TUI panel-first UX — flow, welcome branch, PanelScreen (§7a)

**Files:**
- Modify: `installer/src/app/steps.ts` (`StepId` `:23-40`; `steps` registry `:49-152`; `focusCountFor` `:5-21`)
- Modify: `installer/src/app/flow.ts` (`visibleStepIds` `:59-78`)
- Modify: `installer/src/screens/welcome-screen.tsx` (bare-server branch)
- Create: `installer/src/screens/panel-screen.tsx` (≤220 lines; mirror `SystemScreen` toggles + `AdminScreen` owner inputs)
- Modify: `installer/src/app/screen-router.tsx` (route the `panel` step)
- Modify: `installer/src/core/execute-labels.ts` (access-mode-aware confirmation phrase)
- Test: `installer/src/app/flow.test.ts`

**Interfaces:**
- Consumes: `state.panelAccessMode`, `state.adminEmail`, `state.adminPassword`, `state.productionDomain`, `resolvePanelAccessUrl` (display), `update`/`next` screen props.
- Produces: a `"panel"` `StepId`; a `panel-bootstrap` step order `["welcome","panel","review","execute","success"]`.

- [ ] **Step 1: Write the failing flow test**

`installer/src/app/flow.test.ts`, add:
```ts
it("orders the panel-bootstrap flow panel-first", () => {
  expect(visibleStepIds("panel-bootstrap", false)).toEqual([
    "welcome", "panel", "review", "execute", "success",
  ]);
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd installer && bun test src/app/flow.test.ts -t panel-bootstrap`
Expected: FAIL.

- [ ] **Step 3: Register the step + order**

`steps.ts`: add `"panel"` to `StepId`; add a `Step` `{ id: "panel", focusCount: 4, title: "Control panel", help: "Where the panel lives + your owner login." }` to the registry; handle its focus count in `focusCountFor` if the access mode changes input count (owner password always shown). `flow.ts` `visibleStepIds`: add `case "panel-bootstrap": return ["welcome", "panel", "review", "execute", "success"];`.

- [ ] **Step 4: Run — verify the flow test passes**

Run: `cd installer && bun test src/app/flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Bare-server welcome branch**

`welcome-screen.tsx`: destructure `update` from props; compute `bare = state.host.existingSites.length === 0 && !state.host.docker && !state.host.caddy`; when `bare`, the primary CTA becomes "Set up your control panel" and on activate does `update("mode", "panel-bootstrap"); next();`. Keep the existing `siteCount > 0` / guided-install branches otherwise.

- [ ] **Step 6: Build `panel-screen.tsx`**

Create `installer/src/screens/panel-screen.tsx` — presentational only (no shell/plan logic). Mirror `SystemScreen`'s `ToggleRow` pattern for the access mode (a cycle/select among `domain|magic-dns|ip-port|localhost`, default `magic-dns`) and `AdminScreen`'s `<Field secret>` for the owner password. Fields: access mode; conditional domain field (only when access=domain, with inline DNS preflight hint reusing `state.host.publicIp`); owner email; owner password. Writes via `update(...)`. Show the resolved URL via `resolvePanelAccessUrl(state.panelAccessMode, state.productionDomain, state.host.publicIp)` as a live preview line. Route it in `screen-router.tsx` (`case "panel": return <PanelScreen {...props} />`).

- [ ] **Step 7: Access-aware confirmation phrase**

`execute-labels.ts`: the Execute screen confirmation phrase is hardcoded to `INSTALL ${state.productionDomain}`. Add a `panel-bootstrap` branch returning `INSTALL PANEL` (so a domainless run still has a stable confirm phrase; `--yes`/headless bypasses it).

- [ ] **Step 8: Typecheck + lint + tests + commit**

Run: `cd installer && bun run quality`
Expected: all green (including `check:loc` — keep `panel-screen.tsx` ≤220 lines).
```bash
git add installer/src/app/steps.ts installer/src/app/flow.ts installer/src/app/flow.test.ts installer/src/screens/welcome-screen.tsx installer/src/screens/panel-screen.tsx installer/src/app/screen-router.tsx installer/src/core/execute-labels.ts
git commit -m "installer: panel-first TUI flow + PanelScreen (§7a)"
```

---

### Task 8: End-to-end bare-VPS validation (acceptance gate)

**Files:** none (validation only).

- [ ] **Step 1: Dry-run the headless plan locally**

Run: `cd installer && bun run src/main.tsx --bootstrap-panel --access magic-dns --admin-email you@example.com --dry-run`
Expected: prints a plan whose tasks are `install-docker, install-caddy, install-bun, panel-install`; the panel-install command shows `/opt/vibe-wp/bin/panel install --access magic-dns …`; the owner password (if passed) is **redacted** in the printed plan.

- [ ] **Step 2: Bare test VPS — full run**

On a fresh VPS with NO Docker/Caddy/sites (disposable test VPS; SSH in local-only docs):
```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
# choose "Set up your control panel"; access = magic-dns (default); enter owner email + password
```
Expected: the Execute screen runs Docker → Caddy → Bun → panel-install; ends "Control panel live at https://panel.<ip-dashed>.sslip.io".

- [ ] **Step 3: Confirm reachability + sign-in + zero-site server page**

```sh
curl -fsS https://panel.<ip-dashed>.sslip.io/ -o /dev/null -w '%{http_code} %{ssl_verify_result}\n'  # 200 0
```
Open the URL, sign in as owner, confirm `/sites` shows the "Create your first site" empty state and `/server` renders (depends on Phase 3 for zero-site `/server`; if Phase 3 not yet landed, `/server`'s security card may error — note it).

- [ ] **Step 4: Create the first site in the browser**

Use the GUI `/sites/new` wizard to provision a site end-to-end; confirm it succeeds (proves the panel-first → GUI handoff).

- [ ] **Step 5: Record the validated commit + URL.**

---

## Self-Review

**Spec coverage (`2026-06-23-…-one-command-bootstrap-design.md`):**
- §4 #1 (install.sh clones `/opt/vibe-wp`) → Task 1. ✓
- §4 #2 (factor host-install; add Bun) → Tasks 2–3. ✓
- §4 #3 (installer §7a UX; `--bootstrap-panel`/`--access`) → Tasks 5, 7; headless Task 6. ✓
- §3 flow (bare-server lead → panel-first → Execute → Done → GUI first site) → Tasks 7–8. ✓
- §5 access resolution (display URL; DNS preflight only for domain) → Task 4. ✓
- §11 scope (no off-root work — already shipped; no GUI parity wins) → none added. ✓

**Placeholder scan:** the only deferred specifics are the real repo URL (Task 1 Step 2 — explicitly "confirm via git remote") and exact `InstallPlan` field set (Task 4 Step 7 — "copy verbatim from types.ts:163-182"); both name the exact source of truth rather than leaving a blank. No "TODO/handle edge cases".

**Type/name consistency:** `PanelAccessMode` + `resolvePanelAccessUrl` defined in Task 4, consumed by Tasks 5/7; `panelAccessMode` state field added in Task 5 Step 1 and consumed by Task 4's builder (do Task 5 Steps 1–2 before Task 4 compiles — flagged in Task 4 Step 6); `buildPanelBootstrapPlan` produced in Task 4, consumed in Tasks 5/6; task ids (`install-bun`, `panel-install`) avoid the reserved set. ✓

**Note:** `bin/panel --access` (Phase 1) MUST be merged before Task 8 can pass.
