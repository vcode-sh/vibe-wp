# Vibe WP Control Panel — Feature #5: Smart Performance Tuning

- Date: 2026-06-23
- Status: Approved design (ready for implementation plan)
- Effort: L
- Surface: `control-panel/` (web + packages/api + core-bridge) + `bin/` (perf-report, new perf-apply) + new `installer/src/core/perf-advisor.ts`

---

## 1. Context

The stack ships three install-time presets — `conservative`, `balanced`, and `high-memory` —
chosen by `choosePreset(memoryMb)` in `installer/src/core/defaults.ts`. Each preset sets a
fixed bundle of tunables:

| Preset | RAM range | PHP workers | Redis maxmemory | InnoDB buffer | FastCGI cache |
|--------|-----------|-------------|-----------------|---------------|---------------|
| conservative | < 1 800 MB | 6 | 128 mb | 192 M | 512 m |
| balanced | default | 18 | 512 mb | 768 M | 2 g |
| high-memory | ≥ 6 144 MB | 40 | 1 gb | 2 G | 4 g |

The 12 tunables in `PERFORMANCE_FIELDS` (`installer/src/core/performance.ts`) cover
`PHP_FPM_PM_MAX_CHILDREN`, `PHP_FPM_PM_START_SERVERS`, `PHP_FPM_PM_MIN_SPARE_SERVERS`,
`PHP_FPM_PM_MAX_SPARE_SERVERS`, `PHP_MEMORY_LIMIT`, `PHP_OPCACHE_MEMORY_CONSUMPTION`,
`PHP_OPCACHE_MAX_ACCELERATED_FILES`, `REDIS_MAXMEMORY`, `MARIADB_INNODB_BUFFER_POOL_SIZE`,
`NGINX_FASTCGI_CACHE_MAX_SIZE`, `PHP_OPCACHE_JIT`, and `PHP_OPCACHE_JIT_BUFFER_SIZE`.

`clampFpmPool()` enforces the invariant `1 ≤ min_spare ≤ max_spare ≤ max_children`
(start clamped into `[min_spare, max_spare]`) — the advisor must honour this at all
times.

**What does not exist yet:**

- Measurement of *how the site actually behaves* (FPM queue pressure, per-worker RSS,
  InnoDB buffer utilisation, Redis eviction, OPcache key-fill) after deployment.
- A decision layer that turns measurements into safe, concrete env-delta recommendations.
- A panel-driven, reversible apply path: `bin/perf-report --json` currently emits only
  four fields: `ttfbMs`, `cacheHitPercent`, `opcacheHitPercent`, `redisHitPercent`
  (consumed by `healthPerf` in `control-panel/packages/api/src/routers/health.ts`).
- Any form of auto-rollback if a tuning change makes things worse.

Feature #5 adds all four missing pieces as a single coherent advisor loop:
**measure → recommend → preview-diff → apply-as-job → auto-rollback**.

It builds directly on the `perf-report` shell script (`bin/perf-report`) and the
`site-config-apply` env-write pattern (`bin/site-config-apply`, mirrored in
`core-bridge/site-config.ts`), and on the job runner (`core-bridge/jobs.ts`).

Related: Feature #3 (site-health insights) feeds the control-panel dashboard;
this feature adds a dedicated **Performance** tab whose recommendations are derived
from the same underlying signals.

---

## 2. Decisions (settled)

1. **Advisory + reversible, never a black-box auto-tuner.** The system always shows
   the human what it wants to change and why, in plain English, before touching any
   env value. Auto-apply is explicitly **off** in the initial release.

2. **Deterministic, testable formulas.** The recommendation logic lives in a pure
   module (`installer/src/core/perf-advisor.ts`) that takes a measurement snapshot
   and returns a typed `Recommendation[]`. No heuristic ML, no remote calls. This
   makes it unit-testable in the same style as `performance.test.ts`.

3. **Apply is a tracked job with a snapshot-first, auto-revert guarantee.** Before
   writing any env key, the apply op records the *previous* values. If the post-apply
   smoke check fails or TTFB regresses beyond a configurable threshold, the system
   auto-reverts to the snapshot and marks the job failed — all without human
   intervention.

4. **Security: fixed tunable-key allowlist at the wrapper.** The new `bin/perf-apply`
   script enforces the same pattern as `bin/site-config-apply`: a hard-coded
   `PERF_FIELDS` set; per-key value validators (numeric / size-suffix); no arbitrary
   key writes. A compromised panel process can change `REDIS_MAXMEMORY` but cannot
   write `WP_ADMIN_PASSWORD`.

5. **Reuse `clampFpmPool()`.** The advisor imports it from `performance.ts` to
   produce valid FPM pools — no duplicated clamping logic.

6. **Piggyback the existing monitor timer.** The hourly monitor already calls
   `bin/monitor` (systemd timer). The measurement accumulator hooks into this same
   timer so peak-sampling adds no new cron complexity.

---

## 3. Measurement — new `perf-report --json` signals

The current `--json` output is:

```json
{ "ttfbMs": 120, "cacheHitPercent": 94, "opcacheHitPercent": 99, "redisHitPercent": 87 }
```

Extend `bin/perf-report` to include a `tuning` sub-object when `--json` is passed.
All fields are read-only probes against live container state; no env files are read
in this path.

```json
{
  "ttfbMs": 120,
  "cacheHitPercent": 94,
  "opcacheHitPercent": 99,
  "redisHitPercent": 87,
  "tuning": {
    "fpm": {
      "maxChildren":       18,
      "peakActiveChildren": 16,
      "listenQueueLen":     0,
      "listenQueueMax":     0,
      "slowRequests":       0,
      "measuredWorkerRssKb": 52400
    },
    "opcache": {
      "hitRatePct":          99.1,
      "memUsedMb":           61,
      "memTotalMb":          256,
      "cachedKeys":          4210,
      "maxAcceleratedFiles": 65000
    },
    "redis": {
      "usedMemoryMb":  198,
      "maxmemoryMb":   512,
      "evictedKeys":   0,
      "hitRatePct":    87.2
    },
    "mariadb": {
      "innodbBufferPoolReadRatioPct": 0.3,
      "innodbBufferPoolSizeMb":       768,
      "slowQueryCount":               0
    },
    "nginx": {
      "fastcgiHitRatePct": 94,
      "cacheSizeGb":       0.4,
      "cacheMaxSizeGb":    2.0
    },
    "host": {
      "totalRamMb":   4096,
      "freeRamMb":    812,
      "loadAvg1m":    0.42
    },
    "sampledAt": "2026-06-23T14:00:00Z",
    "windowMinutes": 60
  }
}
```

**How each signal is collected:**

| Signal | Source |
|--------|--------|
| `fpm.peakActiveChildren` | `docker exec wordpress curl -s localhost/fpm-status?full` → `active processes` peak across the sampling window, accumulated by the monitor timer (see §3.1) |
| `fpm.measuredWorkerRssKb` | Median of `/proc/*/status VmRSS` across the PHP-FPM worker pids (already done by `perf-report` for the human report; add to JSON) |
| `fpm.listenQueueLen/Max` | FPM status `listen queue` / `max listen queue` |
| `fpm.slowRequests` | FPM status `slow requests` |
| `opcache.*` | Inline PHP heredoc (already present in `perf-report`); add `cachedKeys` from `opcache_get_status()["opcache_statistics"]["num_cached_keys"]` |
| `redis.*` | `redis-cli INFO stats` + `INFO memory` (already present; surface `evicted_keys` + `used_memory` in JSON) |
| `mariadb.innodbBufferPoolReadRatioPct` | `(Innodb_buffer_pool_reads / Innodb_buffer_pool_read_requests) * 100` from `SHOW GLOBAL STATUS` |
| `mariadb.slowQueryCount` | `SHOW GLOBAL STATUS LIKE 'Slow_queries'` |
| `nginx.fastcgiHitRatePct` | Already computed from `$upstream_cache_status` in access log (the `cacheHitPercent` field); reuse |
| `host.*` | `/proc/meminfo` MemTotal/MemAvailable; `/proc/loadavg` |

### 3.1 Sampling window

`perf-report` is a point-in-time probe. To report *peak* FPM concurrency (the
number that drives the `max_children` recommendation), the hourly monitor timer
is extended:

- After each `bin/monitor` run, a lightweight probe appends `peakActiveChildren`
  and `listenQueueMax` to a rolling ring-file:
  `<siteDir>/.vibe/perf-samples.jsonl` (last 24 samples, ~24 h at 1 h cadence).
- When `perf-report --json` is called, it reads that file and reports the **maximum**
  `peakActiveChildren` seen in the window (default 60 min, configurable with
  `--window-minutes`). If the file is absent or has no entries in the window, it
  falls back to the live point-in-time value.
- The ring-file is capped at 24 lines (oldest evicted); never contains secrets.

This keeps `perf-report` fast (no blocking loop) and gives the advisor
statistically meaningful input even during a brief traffic spike.

---

## 4. The Advisor — deterministic formulas + the ≤ 85 % RAM rule

The advisor lives in `installer/src/core/perf-advisor.ts` (pure TypeScript, no
shell calls, ≤ 220 lines, split into sub-modules if needed). It imports `clampFpmPool`
from `performance.ts` and nothing else from host-touching code.

### 4.1 Input / output types

```ts
// All measurements from perf-report --json .tuning
type PerfSnapshot = { fpm, opcache, redis, mariadb, nginx, host, windowMinutes };

type Recommendation = {
  key:        string;       // env var name, must be in PERF_TUNING_FIELDS
  oldValue:   string;       // current value from env
  newValue:   string;       // proposed value
  reason:     string;       // plain English, one sentence
  confidence: "high" | "medium" | "low";
  componentRestart: "fpm" | "redis" | "mariadb" | "nginx" | "none";
};

function advise(snapshot: PerfSnapshot, currentEnv: Partial<Record<string, string>>): Recommendation[];
```

### 4.2 The ≤ 85 % RAM headroom rule

This is the single global constraint. Before any recommendation is emitted, the
advisor must verify that the proposed allocation plan fits within 85 % of total RAM:

```
allocatable_mb = host.totalRamMb * 0.85

planned_mb = proposed_innodb_buffer_mb
           + proposed_redis_maxmemory_mb
           + proposed_opcache_memory_mb
           + proposed_max_children * proposed_worker_rss_mb   // FPM workers
           + OS_RESERVE_MB                                     // hard constant = 128
```

If any single recommendation would push `planned_mb > allocatable_mb`, that
recommendation is dropped (not emitted) and a `"low"` confidence advisory is
emitted instead explaining the RAM constraint prevented it. The 85 % and 128 MB
figures are module-level constants, visible in the open decisions (§10).

### 4.3 Recommendation rules

All rules are applied after the headroom check passes. Rules are independent;
multiple may fire in one `advise()` call.

**R1 — Raise `PHP_FPM_PM_MAX_CHILDREN`** (confidence: high)

Condition: `snapshot.fpm.peakActiveChildren >= currentMaxChildren * 0.90`
AND `allocatable_mb` allows at least one more worker
(i.e. `planned_mb + measured_worker_rss_mb ≤ allocatable_mb`).

Formula: `newMax = floor(allocatable_mb_for_fpm / measured_worker_rss_mb)`
where `allocatable_mb_for_fpm = allocatable_mb - mariadb_buffer_mb - redis_mb - opcache_mb - OS_RESERVE_MB`.
Cap at `floor(newMax * 1.5)` relative to current (avoid a runaway jump).

Then run `clampFpmPool({ max_children: newMax, min_spare, max_spare, start_servers })`
to produce the full valid pool tuple. All four keys go into `Recommendation[]`.

Reason string: `"Peak PHP-FPM concurrency reached {peakActiveChildren} of {maxChildren} workers in the last {windowMinutes} min; {headroomMb} MB RAM available for {N} additional workers."`

**R2 — Lower `PHP_FPM_PM_MAX_CHILDREN`** (confidence: medium)

Condition: `peakActiveChildren < currentMaxChildren * 0.40` AND the site has been
running for at least 24 h (i.e. `windowMinutes >= 1440`).

Formula: `newMax = max(preset_min_children, ceil(peakActiveChildren * 1.5))`.
Run `clampFpmPool`. Reason: reclaiming RAM for other subsystems.

**R3 — Raise `MARIADB_INNODB_BUFFER_POOL_SIZE`** (confidence: high)

Condition: `mariadb.innodbBufferPoolReadRatioPct > 1.0`
(i.e. > 1 % of InnoDB page requests are not satisfied from the buffer pool)
AND `mariadb.slowQueryCount > 0` AND headroom allows.

Formula: increase current size by 25 %, round to nearest 64 M. Never raise above
40 % of `allocatable_mb` in a single recommendation (prevents over-allocation on
shared resources).

Reason: `"InnoDB buffer-pool read miss rate is {ratio}%; raising the pool size reduces disk I/O."`

**R4 — Raise `REDIS_MAXMEMORY`** (confidence: high)

Condition: `redis.evictedKeys > 0` AND `redis.usedMemoryMb >= redis.maxmemoryMb * 0.90`.

Formula: `newMb = min(currentMb * 1.5, allocatable_mb_for_redis)` where
`allocatable_mb_for_redis = allocatable_mb - fpm_allocation_mb - mariadb_buffer_mb - OS_RESERVE_MB`.
Round to nearest 64 M. Emit as a size string e.g. `"768mb"`.

Reason: `"Redis evicted {N} keys and is at {pct}% capacity; raising maxmemory reduces cache churn."`

**R5 — Raise `PHP_OPCACHE_MAX_ACCELERATED_FILES`** (confidence: high)

Condition: `opcache.cachedKeys >= opcache.maxAcceleratedFiles * 0.90`.

Formula: `newVal = opcache.maxAcceleratedFiles * 2`, capped at 130 000 (PHP limit).
Reason: `"OPcache has cached {cachedKeys} of {max} allowed file slots; raising the limit prevents cache evictions."`

**R6 — Raise `PHP_OPCACHE_MEMORY_CONSUMPTION`** (confidence: medium)

Condition: `opcache.memUsedMb >= opcache.memTotalMb * 0.85`.

Formula: `newMb = min(ceil(opcache.memUsedMb * 1.5), allocatable_headroom_for_opcache)`.
Round to nearest 16. Reason: `"OPcache memory is {pct}% full; raising consumption avoids recompilation."`

**R7 — Raise `NGINX_FASTCGI_CACHE_MAX_SIZE`** (confidence: low)

Condition: `nginx.cacheSizeGb >= nginx.cacheMaxSizeGb * 0.85`
AND `nginx.fastcgiHitRatePct < 80`.

Formula: `newGb = nginx.cacheMaxSizeGb * 2`, capped at 8 GB. Reason: `"FastCGI cache is {pct}% full and hit rate is below 80%; more disk space for pages may improve cache retention."`

This rule has `confidence: "low"` because disk space is not monitored here and the
host may not have the capacity — the human must confirm.

### 4.4 No-op case

If `advise()` returns `[]`, the UI shows: *"No tuning recommendations — your stack
is well-sized for the observed traffic."*

### 4.5 Testability

`perf-advisor.ts` is a pure function: given `(snapshot, currentEnv)` it returns
`Recommendation[]`. Tests mirror `performance.test.ts`:

- R1 fires when peak children ≥ 90 % of max AND RAM allows.
- R1 does NOT fire when RAM headroom is insufficient (≤ 85 % rule blocks it).
- R2 fires only when window ≥ 1440 min AND utilisation < 40 %.
- R3 fires on miss ratio > 1 % + slow queries.
- R4 fires when Redis has evicted keys AND is near capacity.
- R5 fires on OPcache key-fill ≥ 90 %.
- No recommendations emitted when everything is healthy.
- Multiple rules fire independently.
- `clampFpmPool` invariant is preserved in all R1/R2 outputs.

---

## 5. Apply + auto-rollback

### 5.1 New shell script: `bin/perf-apply`

Mirrors `bin/site-config-apply` exactly in structure. Key differences:

```sh
# Hard-coded allowlist (see §6)
PERF_TUNING_FIELDS="
  PHP_FPM_PM_MAX_CHILDREN
  PHP_FPM_PM_START_SERVERS
  PHP_FPM_PM_MIN_SPARE_SERVERS
  PHP_FPM_PM_MAX_SPARE_SERVERS
  PHP_MEMORY_LIMIT
  PHP_OPCACHE_MEMORY_CONSUMPTION
  PHP_OPCACHE_MAX_ACCELERATED_FILES
  REDIS_MAXMEMORY
  MARIADB_INNODB_BUFFER_POOL_SIZE
  NGINX_FASTCGI_CACHE_MAX_SIZE
  PHP_OPCACHE_JIT
  PHP_OPCACHE_JIT_BUFFER_SIZE
"
```

Per-key validators (regex, checked before any write):

| Key | Validator |
|-----|-----------|
| `PHP_FPM_PM_MAX_CHILDREN`, `_START_SERVERS`, `_MIN_SPARE`, `_MAX_SPARE` | `^[1-9][0-9]*$` |
| `PHP_MEMORY_LIMIT`, `PHP_OPCACHE_MEMORY_CONSUMPTION`, `PHP_OPCACHE_JIT_BUFFER_SIZE` | `^[1-9][0-9]+M$` |
| `PHP_OPCACHE_MAX_ACCELERATED_FILES` | `^[1-9][0-9]*$` |
| `REDIS_MAXMEMORY` | `^[1-9][0-9]*(mb\|gb)$` |
| `MARIADB_INNODB_BUFFER_POOL_SIZE` | `^[1-9][0-9]+[MG]$` |
| `NGINX_FASTCGI_CACHE_MAX_SIZE` | `^[1-9][0-9]*[mg]$` |
| `PHP_OPCACHE_JIT` | `^(disable\|tracing\|on\|off\|[0-9]+)$` |

The script:
1. Reads `VIBE_PERF_APPLY_KEYS` (comma-separated key names) from the caller env.
2. Validates each key is in `PERF_TUNING_FIELDS` and each value matches its regex.
3. **Before writing:** reads current values for each key → emits a JSON snapshot to
   stdout: `{"snapshot": {"PHP_FPM_PM_MAX_CHILDREN":"18", ...}}`.
4. Atomically writes the env file (same `cp -p` + `mv -f` pattern as `site-config-apply`).
5. Emits `{"restartRequired": [...components...]}` so the caller knows what to restart.

The script NEVER reads secrets; it reads only the specific keys being changed.

### 5.2 New `VIBE_OPS` entry: `perfApply`

In `core-bridge/exec.ts`, add to `VIBE_OPS`:

```ts
perfApply: {
  bin:      "perf-apply",
  stream:   false,
  takesArg: false,
  yes:      false,
}
```

Called by a new `applyPerfTuning(siteId, keys)` function in `core-bridge/site-config.ts`.

### 5.3 Apply job flow

The panel exposes a `perf.apply(siteId, recommendations)` oRPC procedure (admin-only).
It creates a tracked job via `startJob` and runs the following steps sequentially,
streaming log lines to the browser:

```
Step 1 — Snapshot current env values (read-only)
Step 2 — Write proposal to job audit row in SQLite (for revert)
Step 3 — Call perf-apply (writes env, returns snapshot + restartRequired)
Step 4 — Restart affected components (docker compose restart <services>)
Step 5 — Wait 10 s for services to stabilise
Step 6 — Run smoke (bin/smoke --json); if non-zero exit → REVERT (see §5.4)
Step 7 — Run perf-report --json (60 s timeout); compare ttfbMs to pre-apply value
          if ttfbMs > preApply * (1 + TTFB_REGRESSION_THRESHOLD) → REVERT
Step 8 — Mark job succeeded; emit final snapshot + new PerfReport to the browser
```

The `restartRequired` array from `perf-apply` determines which services are restarted:
- `PHP_FPM_PM_*`, `PHP_MEMORY_LIMIT`, `PHP_OPCACHE_*` → restart `wordpress`
- `REDIS_MAXMEMORY` → restart `redis`
- `MARIADB_INNODB_BUFFER_POOL_SIZE` → restart `db`
- `NGINX_FASTCGI_CACHE_MAX_SIZE` → recreate `nginx` (same `recreateRequired` flag as
  the FastCGI toggle in `applyFastcgiCache`)

### 5.4 Auto-revert

If Step 6 or Step 7 triggers a revert:

1. Re-call `perf-apply` with the **snapshot values** from Step 3 (writing back the
   original env).
2. Restart affected services (same list).
3. Run `bin/smoke --json` again; if it still fails, emit a critical alert and stop.
4. Mark the job `failed` with `revertedAt` timestamp and reason in the audit row.
5. Stream an error line to the browser: `"Auto-reverted after {reason}: smoke check
   failed / TTFB regressed from {pre}ms to {post}ms (threshold: {pct}%). Original
   values restored."`

The snapshot is stored in the `jobs` table `metadata` JSON column (already part of
the job schema) before the write — the write never happens if SQLite is down.

### 5.5 Restart vs. recreate

Following the pattern established in `applyFastcgiCache`:
- `restartRequired` → `docker compose restart <service>` (fast, seconds).
- `recreateRequired` (nginx only, when `NGINX_FASTCGI_CACHE_MAX_SIZE` changes because
  the `fastcgi_cache_path` directive must be re-rendered from template) → `docker compose
  up -d --force-recreate nginx`.

The advisor marks nginx recommendations with `componentRestart: "nginx"` and the apply
layer checks this to decide restart vs. recreate.

---

## 6. Security model

The `bin/perf-apply` script is root-owned (like `bin/site-config-apply`), called via
`sudo -n` through `wrapVibeArgv`. It enforces:

1. **Fixed `PERF_TUNING_FIELDS` set** — the 12 env keys in `PERFORMANCE_FIELDS`. No
   key outside this set can be written, regardless of what the panel sends.
2. **Per-key value validators** — regex from §5.1. Size-suffix typos are rejected.
3. **No secret access** — `perf-apply` reads only the keys it is about to change
   (to populate the snapshot). It does not read `DB_PASSWORD`, `REDIS_PASSWORD`,
   `WP_ADMIN_PASSWORD`, or any other secret. Those are not in `PERF_TUNING_FIELDS`.
4. **Recommendations derived from already-redacted `perf-report` output** — the
   `PerfSnapshot` passed to `advise()` contains only counters and sizes, never
   passwords or salts. It is the same `--json` output already consumed by `healthPerf`.
5. **Admin-only oRPC procedure** — `perf.apply` is gated at the procedure level;
   operator and viewer roles cannot call it. `perf.report` (read) is viewer-accessible.
6. **No arbitrary shell** — `perf-apply` receives key-value pairs over env vars, not
   as shell arguments. `buildVibeArgv` passes them as a structured payload; the script
   reads them via `$VIBE_PERF_APPLY_KEYS` and per-key `eval` substitution inside the
   validated allowlist (same pattern as `site-config-apply`).

Threat model: if a panel process is fully compromised, an attacker can at most change
the 12 tunable values to values that pass the per-key regex. They cannot write
`WP_ADMIN_PASSWORD`, execute arbitrary commands, or read secrets. Worst-case outcome
is a misconfigured performance parameter that the auto-revert catches within 30 s.

---

## 7. UI surface

The Performance tab already exists in the panel (routes to `healthPerf` for the four
current metrics). Feature #5 adds a **Smart Tuning** section below the existing metric
tiles.

### 7.1 Recommendation cards

Each `Recommendation` renders as a card:

```
┌─────────────────────────────────────────────────────────────┐
│ [HIGH]  PHP-FPM Worker Pool                                 │
│                                                             │
│ Peak concurrency reached 16/18 workers in the last hour.   │
│ 812 MB free RAM allows 4 additional workers.               │
│                                                             │
│  PHP_FPM_PM_MAX_CHILDREN   18  →  22                       │
│  PHP_FPM_PM_MIN_SPARE_SERVERS   4  →  4                    │
│  PHP_FPM_PM_MAX_SPARE_SERVERS   6  →  8                    │
│  PHP_FPM_PM_START_SERVERS   4  →  4                        │
│                                                             │
│  Requires: PHP-FPM restart (~2 s)                          │
└─────────────────────────────────────────────────────────────┘
                          [Preview diff]  [Apply]
```

- **Confidence badge**: `HIGH` (green), `MEDIUM` (amber), `LOW` (grey).
- **Plain-English reason**: one sentence from `recommendation.reason`.
- **Diff table**: old value → new value for each key in the group.
- **Restart cost**: "PHP-FPM restart (~2 s)" / "Redis restart (~3 s)" / "MariaDB
  restart (~5 s)" / "Nginx recreate (~4 s)".
- **[Preview diff]**: opens a modal showing the exact env-file lines that will change
  (diff view, no secrets visible — only the tuning keys).
- **[Apply]**: triggers `perf.apply` for this recommendation group, opens the live job
  log panel.

Multiple recommendation cards can be shown; each has its own Apply button. Selecting
multiple and clicking a single Apply is a phase-2 enhancement.

### 7.2 Apply progress

Reuses the existing `OperationRunner` / live job log pattern (SSE stream). Step labels
(snapshot / write / restart / smoke / TTFB check) appear as progress lines. On success:
metrics tiles refresh automatically. On auto-revert: a red banner with the revert reason.

### 7.3 History

A collapsible **Tuning history** table beneath the cards shows past `perf.apply` job
rows: timestamp, keys changed, outcome (succeeded / reverted), and a link to the job
log. Sourced from `operations.list` filtered by `kind: "perf-apply"`.

### 7.4 Refresh cadence

Recommendations are computed on demand (page load + manual refresh button). A staleness
indicator shows `sampledAt` from the snapshot. Background auto-refresh is not in scope
for the initial release.

---

## 8. Scope / out-of-scope

**In scope (phase 1)**

- Extended `perf-report --json` with `tuning` signals.
- `perf-samples.jsonl` ring-file accumulator piggybacking the monitor timer.
- `installer/src/core/perf-advisor.ts` (pure, fully unit-tested).
- `bin/perf-apply` shell script with allowlisted keys + per-key validators.
- `perfApply` op in `VIBE_OPS` + `applyPerfTuning()` in `core-bridge/site-config.ts`.
- `perf.report` (viewer) and `perf.apply` (admin) oRPC procedures.
- Apply job with snapshot-first + auto-revert on smoke failure or TTFB regression.
- Recommendation cards + diff preview + apply progress in the Performance tab.
- Tuning history table.

**Out of scope (explicitly deferred)**

- **Auto-apply / scheduled tuning** — always human-confirmed in the initial release.
  The architecture allows it (a cron-triggered job with the same flow), but enabling
  it is gated on the open decision in §10.
- **Per-plugin OPcache attribution** — identifying which plugins fill the key cache;
  useful but requires WP-CLI integration beyond the scope of this advisor.
- **Network / I/O tuning** — `NGINX_WORKER_CONNECTIONS`, `MARIADB_MAX_CONNECTIONS`,
  `REDIS_IO_THREADS`. These are more topology-dependent; deferred.
- **Multi-recommendation batch apply** — single recommendation per Apply click in
  phase 1. Batching is a UX enhancement for phase 2.
- **Trend graphs** — the `perf-samples.jsonl` ring-file provides the data; a charting
  UI is out of scope for this feature.
- **WooCommerce-specific tuning** — different session/cart/checkout patterns; deferred.

---

## 9. Phased build outline

### Phase 1 — Measure (no code changes to advisor yet)

1. Extend `bin/perf-report` to populate `tuning.*` in `--json` output.
2. Add the ring-file accumulator probe to the monitor timer hook
   (writes `peakActiveChildren` + `listenQueueMax` to `.vibe/perf-samples.jsonl`).
3. Update `healthPerf` in `health.ts` to pass through the `tuning` sub-object.
4. Add `PerfSnapshot` type to `packages/api` shared types.
5. **VPS validation:** SSH to the test VPS, run `bin/perf-report --json`, confirm
   `tuning.*` is populated correctly and `measuredWorkerRssKb` is plausible.

### Phase 2 — Advisor (pure, TDD first)

6. Write tests in `installer/src/core/perf-advisor.test.ts` for all rules in §4.3
   (red phase — tests fail because the module does not exist yet).
7. Implement `installer/src/core/perf-advisor.ts` until all tests pass (green phase).
8. Run `bun run quality` to confirm ≤ 220 line limit, no lint errors, all tests pass.
9. Wire `advise()` into the `perf.report` procedure: return `recommendations` alongside
   the raw snapshot. The UI can now display cards (even before Apply works).

### Phase 3 — Apply + rollback

10. Write `bin/perf-apply` (allowlist, validators, atomic write, snapshot output).
11. Add `perfApply` to `VIBE_OPS`; add `applyPerfTuning()` to `core-bridge/site-config.ts`.
12. Implement `perf.apply` oRPC procedure with the 8-step job flow (§5.3) including
    auto-revert.
13. Add the Apply button + progress panel + tuning history table to the Performance tab.
14. **VPS validation:** apply a real recommendation (e.g. raise `PHP_FPM_PM_MAX_CHILDREN`
    from the conservative-preset 6 to 10), confirm restart, check TTFB, confirm job
    marked succeeded. Then deliberately break smoke (stop WordPress) and confirm
    auto-revert fires and restores the original value.

### Phase 4 — Polish

15. Diff preview modal.
16. Staleness indicator + manual refresh button.
17. Tuning history table linked to job logs.
18. `bun run quality` on the installer side; TypeScript check on `packages/api`.

---

## 10. Open decisions for the owner

These questions require product judgment; the design above is intentionally neutral on
them. They should be resolved before Phase 3 begins.

**D1 — Auto-apply: allowed at all, or always human-confirm?**
The initial release requires a human click. Should Phase 2+ allow an opt-in
auto-apply mode (e.g. high-confidence recommendations applied nightly if the
last 3 smoke checks passed)? Risk: a traffic spike coinciding with auto-apply
could trigger revert loops. Recommendation: require explicit opt-in per site,
never the default.

**D2 — TTFB-regression rollback threshold.**
Current placeholder: revert if `newTtfbMs > oldTtfbMs * 1.30` (30 % regression).
Is 30 % the right threshold? A MariaDB buffer-pool raise takes minutes to warm
up; the cold TTFB immediately after restart may spike even on a successful change.
Consider: measure TTFB at 30 s post-restart and again at 5 min; only revert if
*both* readings regress. The specific threshold and measurement window need a
decision.

**D3 — RAM-reserve percentage.**
The spec uses 85 % as the planning ceiling and 128 MB as the hard OS reserve.
These are conservative values for a 2–4 GB VPS. On a 16 GB VPS, 15 % is 2.4 GB
of permanently reserved RAM — possibly too generous. Should the headroom percentage
be adaptive (e.g. 90 % above 8 GB)?

**D4 — `php-fpm-www.conf` changes: rolling or restart?**
FPM supports dynamic pool resizing (`kill -USR2 <master-pid>`) which is near-zero
downtime. The current spec uses a Docker service restart (~2 s downtime). For
production sites serving traffic, rolling config reload (USR2) is preferable.
Does the owner want zero-downtime FPM reload as a phase 2 enhancement, or is 2 s
acceptable?

**D5 — Minimum window before R2 (lower max_children) fires.**
The spec requires 24 h of samples before recommending a *downward* change (to avoid
reacting to low-traffic off-hours). Is 24 h the right threshold, or should it be
the last 7 days?

**D6 — MariaDB slow-query requirement for R3.**
R3 requires *both* a high miss ratio *and* slow queries before recommending an InnoDB
buffer-pool increase. This prevents false positives on freshly-started containers.
Should R3 fire on miss ratio alone above a higher threshold (e.g. > 5 %), or keep
the compound condition?

---

## 11. Testing & validation

### Unit tests (`installer/src/core/perf-advisor.test.ts`)

All tests written before implementation (TDD, Phase 2 step 6). Minimum coverage:

- `advise()` returns `[]` on a healthy snapshot (no rules fire).
- R1 fires correctly and emits a valid clamped pool tuple.
- R1 is suppressed by the ≤ 85 % RAM rule when headroom is insufficient.
- R2 fires only after `windowMinutes >= 1440` and utilisation < 40 %.
- R3 fires on miss ratio > 1 % + slow queries > 0; suppressed on miss ratio ≤ 1 %.
- R4 fires on `evictedKeys > 0` + `usedMemory >= 90 % maxmemory`.
- R5 fires on `cachedKeys >= 90 % maxAcceleratedFiles`.
- R6 fires on `memUsedMb >= 85 % memTotalMb`.
- R7 fires on cache fill ≥ 85 % + hit rate < 80 %; is always `confidence: "low"`.
- Multiple rules fire independently in a single call.
- `clampFpmPool` invariant preserved: `1 ≤ min_spare ≤ max_spare ≤ max_children`
  in every R1 and R2 output.
- `oldValue` in each Recommendation matches the `currentEnv` input.

### Integration tests (VPS)

On the test VPS (`root@178.104.10.126`, key `~/.ssh/vcode_sh`):

1. **Measurement:** `curl -fsSL .../bin/vibe local perf-report --json | jq .tuning`
   confirms all fields present and plausible.
2. **Happy-path apply:** trigger `perf.apply` for a safe low-risk change (raise
   `PHP_FPM_PM_MAX_CHILDREN` by 2); confirm job reaches `succeeded`, FPM restarts,
   TTFB is acceptable, env file is updated.
3. **Auto-revert:** manually stop the `wordpress` container after apply is initiated
   but before smoke runs; confirm job reaches `failed` with `revertedAt` set, env
   file is back to original values, `wordpress` is restarted.
4. **Security check:** attempt to call `perf-apply` with a key not in
   `PERF_TUNING_FIELDS` (e.g. `DB_PASSWORD`); confirm the script exits non-zero
   and the env file is unchanged.

---

## 12. References

- `installer/src/core/defaults.ts` — `choosePreset(memoryMb)`, `performanceValues()`
- `installer/src/core/performance.ts` — `PERFORMANCE_FIELDS`, `clampFpmPool()`
- `installer/src/core/performance.test.ts` — test pattern to mirror
- `bin/perf-report` — current probe script; extended in Phase 1
- `bin/site-config-apply` — env-write pattern; `bin/perf-apply` mirrors this exactly
- `control-panel/packages/api/src/routers/health.ts` — `healthPerf` procedure
- `control-panel/packages/api/src/core-bridge/exec.ts` — `VIBE_OPS`, `validate_env_key` pattern
- `control-panel/packages/api/src/core-bridge/site-config.ts` — `applyFastcgiCache` (restart vs. recreate precedent)
- `control-panel/packages/api/src/core-bridge/jobs.ts` — job registry, `startJob`, `launchJob`
- `docker/wordpress/php-fpm-www.conf.template` — FPM tunables rendered from env
- `docker/wordpress/php.ini.template` — OPcache tunables rendered from env
- `docker/redis/redis.conf.template` — `REDIS_MAXMEMORY` + `REDIS_MAXMEMORY_POLICY`
- `docker/mariadb/mariadb.cnf.template` — `MARIADB_INNODB_BUFFER_POOL_SIZE`
- `docker/nginx/nginx.conf.template` — `NGINX_FASTCGI_CACHE_MAX_SIZE`, `cache=$upstream_cache_status` log field
- `docs/performance.md` — OPcache tuning guidance + healthy-signal thresholds
- Spec #3 (feature #3 insights): `2026-06-22-control-panel-live-streaming-design.md` (perf-report consumer)
- `2026-06-21-control-panel-backend-install-design.md` §4 (exec layer / allowlist architecture)
