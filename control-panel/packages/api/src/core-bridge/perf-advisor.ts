import type {
	PerfMeasurements,
	PerfPreviewDiff,
	PerfRecommendation,
	PerfRisk,
} from "../contract";

/**
 * perf-advisor — the PURE, deterministic heart of feature #5. It turns a
 * windowed PerfMeasurements snapshot into explainable env-delta recommendations,
 * and enforces ONE hard safety invariant the whole feature is built around:
 *
 *   reservedMiB (sum of all suggested memory reservations + an OS reserve)
 *   MUST be <= RAM_CAP_PERCENT% of host RAM.
 *
 * If a suggestion would breach the cap it is CLAMPED down to fit (with the
 * reason annotated). If even the BASELINE already exceeds the cap, the advisor
 * emits DOWNWARD recommendations at risk:"high" and never proposes a set whose
 * total exceeds the cap. No I/O, no host access — fully unit-testable.
 *
 * The tunable key set here MUST equal bin/perf-apply's PERF_KEY_ALLOWLIST and
 * the panel's exec.ts perf transport contract.
 */

export const PERF_TUNABLE_KEYS = [
	"PHP_FPM_PM_MAX_CHILDREN",
	"PHP_FPM_PM_START_SERVERS",
	"PHP_FPM_PM_MIN_SPARE_SERVERS",
	"PHP_FPM_PM_MAX_SPARE_SERVERS",
	"MARIADB_INNODB_BUFFER_POOL_SIZE",
	"PHP_OPCACHE_MEMORY_CONSUMPTION",
	"REDIS_MAXMEMORY",
	"WP_MEMORY_LIMIT",
] as const;

export const RAM_CAP_PERCENT = 85;
/** RAM held back for the OS/kernel/other daemons, outside the stack budget. */
export const DEFAULT_OS_RESERVE_MIB = 512;
/** Per-FPM-child memory budget when measured avg RSS is unavailable. */
export const DEFAULT_PER_CHILD_MIB = 64;

export interface AdviseResult {
	capMiB: number;
	headroomMiB: number;
	recommendations: PerfRecommendation[];
	reservedMiB: number;
}

export interface AdviseOptions {
	osReserveMiB?: number;
	perChildMiB?: number;
}

// --- size helpers -----------------------------------------------------------

const SIZE_RE = /^(\d+)\s*([kmgKMG])?[bB]?$/;
const ALPHA_RE = /[a-zA-Z]/;

/** Parse a memory-size string (e.g. "512M", "1G", "256mb", bytes) to MiB. */
export function sizeToMiB(raw: string | undefined): number {
	if (!raw) {
		return 0;
	}
	const m = SIZE_RE.exec(raw.trim());
	if (!m) {
		return 0;
	}
	const n = Number(m[1]);
	switch ((m[2] ?? "").toLowerCase()) {
		case "g":
			return n * 1024;
		case "m":
			return n;
		case "k":
			return Math.floor(n / 1024);
		default:
			// Bare number = bytes.
			return Math.floor(n / 1_048_576);
	}
}

/** Render a MiB integer back to an "<n>M" env value (the stack's size form). */
function miBToSize(mib: number): string {
	return `${Math.max(0, Math.round(mib))}M`;
}

function clampInt(n: number, min: number): number {
	return n < min ? min : Math.round(n);
}

// --- env reading ------------------------------------------------------------

function intFromEnv(
	env: Record<string, string>,
	key: string,
	fallback = 0
): number {
	const v = Number(env[key]);
	return Number.isFinite(v) && v >= 0 ? Math.round(v) : fallback;
}

// --- per-child budget -------------------------------------------------------

/** Use measured avg RSS when meaningful, else the default per-child estimate. */
function perChildMiB(m: PerfMeasurements, opts: AdviseOptions): number {
	const measured = m.fpm.avgRssMiB;
	if (measured >= 16 && measured <= 2048) {
		return measured;
	}
	return opts.perChildMiB ?? DEFAULT_PER_CHILD_MIB;
}

// --- internal working model -------------------------------------------------

interface Proposal {
	rec: PerfRecommendation;
	/** Mutators so the cap pass can clamp the suggested value down to fit. */
	setSuggestedMiB?: (mib: number) => void;
	/** MiB this proposal reserves at its SUGGESTED value (0 for non-memory). */
	suggestedMiB: number;
}

function buildRec(
	base: Omit<PerfRecommendation, "risk"> & { risk?: PerfRisk }
): PerfRecommendation {
	return { ...base, risk: base.risk ?? "low" };
}

// --- the deterministic rules ------------------------------------------------

function adviseFpm(
	m: PerfMeasurements,
	env: Record<string, string>,
	pcMiB: number
): Proposal | null {
	const current =
		m.fpm.maxChildren || intFromEnv(env, "PHP_FPM_PM_MAX_CHILDREN", 0);
	if (current <= 0) {
		return null;
	}
	// Saturation signal: workers pinned at the ceiling AND a backlog forming.
	const saturated =
		m.fpm.active >= current &&
		(m.fpm.listenQueue > 0 || m.fpm.maxActiveReached > 0);
	if (!saturated) {
		return null;
	}
	// Grow by 50% (at least +2), to be clamped by the RAM cap pass.
	const suggested = clampInt(Math.max(current + 2, current * 1.5), current + 1);
	const rec = buildRec({
		key: "PHP_FPM_PM_MAX_CHILDREN",
		label: "PHP-FPM max children",
		current: String(current),
		suggested: String(suggested),
		unit: "workers",
		category: "fpm",
		risk: "medium",
		reason: `FPM is saturated: ${m.fpm.active}/${current} workers active with listenQueue=${m.fpm.listenQueue} (max-children reached ${m.fpm.maxActiveReached}×). Each worker is budgeted at ${pcMiB} MiB.`,
	});
	const proposal: Proposal = {
		rec,
		suggestedMiB: suggested * pcMiB,
		setSuggestedMiB: (mib) => {
			// Floor to whatever whole-worker budget fits in `mib`; do NOT force a
			// minimum (a forced +1 could overshoot the cap). If it floors to <= the
			// current count the advisePerf clamp pass drops this proposal as a no-op.
			const workers = Math.max(0, Math.floor(mib / pcMiB));
			rec.suggested = String(workers);
			proposal.suggestedMiB = workers * pcMiB;
		},
	};
	return proposal;
}

function adviseInnodb(
	m: PerfMeasurements,
	env: Record<string, string>
): Proposal | null {
	const currentMiB =
		m.innodb.bufferPoolSizeMiB ||
		sizeToMiB(env.MARIADB_INNODB_BUFFER_POOL_SIZE) ||
		0;
	if (currentMiB <= 0) {
		return null;
	}
	const lowRatio = m.innodb.bufferPoolReadRatioPercent < 99;
	const tightFree = m.innodb.bufferPoolFreePct < 10;
	if (!(lowRatio || tightFree)) {
		return null;
	}
	const suggestedMiB = Math.round(currentMiB * 1.5);
	const rec = buildRec({
		key: "MARIADB_INNODB_BUFFER_POOL_SIZE",
		label: "InnoDB buffer pool size",
		current: miBToSize(currentMiB),
		suggested: miBToSize(suggestedMiB),
		unit: "MiB",
		category: "innodb",
		risk: "high",
		reason: `InnoDB buffer pool read ratio is ${m.innodb.bufferPoolReadRatioPercent}% (target ≥99%) with ${m.innodb.bufferPoolFreePct}% free pages — too small for the working set.`,
	});
	const proposal: Proposal = {
		rec,
		suggestedMiB,
		setSuggestedMiB: (mib) => {
			rec.suggested = miBToSize(mib);
			proposal.suggestedMiB = Math.round(mib);
		},
	};
	return proposal;
}

function adviseOpcache(
	m: PerfMeasurements,
	env: Record<string, string>
): Proposal | null {
	const currentMiB =
		intFromEnv(env, "PHP_OPCACHE_MEMORY_CONSUMPTION", 0) ||
		m.opcache.usedMiB + m.opcache.freeMiB;
	if (currentMiB <= 0) {
		return null;
	}
	const oom = m.opcache.oomRestarts > 0;
	const lowFree = m.opcache.freeMiB > 0 && m.opcache.freeMiB < 16;
	if (!(oom || lowFree)) {
		return null;
	}
	const suggestedMiB = Math.round(currentMiB * 1.5);
	const rec = buildRec({
		key: "PHP_OPCACHE_MEMORY_CONSUMPTION",
		label: "OPcache memory",
		current: String(currentMiB),
		suggested: String(suggestedMiB),
		unit: "MiB",
		category: "opcache",
		risk: "low",
		reason: oom
			? `OPcache has restarted ${m.opcache.oomRestarts}× out of memory — it is undersized.`
			: `OPcache has only ${m.opcache.freeMiB} MiB free — near exhaustion.`,
	});
	const proposal: Proposal = {
		rec,
		suggestedMiB,
		setSuggestedMiB: (mib) => {
			rec.suggested = String(Math.round(mib));
			proposal.suggestedMiB = Math.round(mib);
		},
	};
	return proposal;
}

function adviseRedis(
	m: PerfMeasurements,
	env: Record<string, string>
): Proposal | null {
	const currentMiB =
		m.redis.maxMemoryMiB || sizeToMiB(env.REDIS_MAXMEMORY) || 0;
	if (currentMiB <= 0 || m.redis.evictedKeysDelta <= 0) {
		return null;
	}
	const suggestedMiB = Math.round(currentMiB * 1.5);
	const rec = buildRec({
		key: "REDIS_MAXMEMORY",
		label: "Redis max memory",
		current: miBToSize(currentMiB),
		suggested: miBToSize(suggestedMiB),
		unit: "MiB",
		category: "redis",
		risk: "medium",
		reason: `Redis evicted ${m.redis.evictedKeysDelta} keys in the sample window — the object cache is too small and is dropping live data.`,
	});
	const proposal: Proposal = {
		rec,
		suggestedMiB,
		setSuggestedMiB: (mib) => {
			rec.suggested = miBToSize(mib);
			proposal.suggestedMiB = Math.round(mib);
		},
	};
	return proposal;
}

// --- the cap pass -----------------------------------------------------------

/**
 * Baseline reserved MiB = the CURRENT footprint of every memory tunable + OS
 * reserve. Always counted (even keys with no recommendation) so the headroom
 * math reflects the real box.
 */
function baselineReservedMiB(
	m: PerfMeasurements,
	env: Record<string, string>,
	pcMiB: number,
	osReserveMiB: number
): number {
	const children =
		m.fpm.maxChildren || intFromEnv(env, "PHP_FPM_PM_MAX_CHILDREN", 0);
	const innodb =
		m.innodb.bufferPoolSizeMiB ||
		sizeToMiB(env.MARIADB_INNODB_BUFFER_POOL_SIZE);
	const opcache =
		intFromEnv(env, "PHP_OPCACHE_MEMORY_CONSUMPTION", 0) ||
		m.opcache.usedMiB + m.opcache.freeMiB;
	const redis = m.redis.maxMemoryMiB || sizeToMiB(env.REDIS_MAXMEMORY);
	const wp = sizeToMiB(env.WP_MEMORY_LIMIT);
	return children * pcMiB + innodb + opcache + redis + wp + osReserveMiB;
}

/** The MiB a proposal currently reserves at its CURRENT (pre-change) value. */
function currentMiBOf(p: Proposal, pcMiB: number): number {
	if (p.rec.key === "PHP_FPM_PM_MAX_CHILDREN") {
		return Number(p.rec.current) * pcMiB;
	}
	if (p.rec.unit === "MiB") {
		// current is either an "<n>M" size or a bare MiB integer.
		return ALPHA_RE.test(p.rec.current)
			? sizeToMiB(p.rec.current)
			: Number(p.rec.current);
	}
	return 0;
}

export function advisePerf(
	measurements: PerfMeasurements,
	hostRamMiB: number,
	currentEnv: Record<string, string>,
	options: AdviseOptions = {}
): AdviseResult {
	const osReserveMiB = options.osReserveMiB ?? DEFAULT_OS_RESERVE_MIB;
	const pcMiB = perChildMiB(measurements, options);
	const capMiB = Math.floor((hostRamMiB * RAM_CAP_PERCENT) / 100);

	// When host RAM is unknown (0 — non-Linux dev / unmeasurable), emit NO
	// memory-raising recommendations: we cannot prove they stay within budget.
	if (hostRamMiB <= 0) {
		return { recommendations: [], reservedMiB: 0, headroomMiB: 0, capMiB: 0 };
	}

	const proposals: Proposal[] = [];
	for (const p of [
		adviseFpm(measurements, currentEnv, pcMiB),
		adviseInnodb(measurements, currentEnv),
		adviseOpcache(measurements, currentEnv),
		adviseRedis(measurements, currentEnv),
	]) {
		if (p) {
			proposals.push(p);
		}
	}

	const baseline = baselineReservedMiB(
		measurements,
		currentEnv,
		pcMiB,
		osReserveMiB
	);

	// CAP-BREACH (baseline already over budget): never raise anything. Emit a
	// single downward flag for the largest memory reservation at risk:"high".
	if (baseline > capMiB) {
		return overBudgetResult(measurements, currentEnv, baseline, capMiB);
	}

	// Apply each proposal in priority order, clamping so the running reserved
	// total NEVER breaches the cap. `reserved` begins at the fixed (non-proposal)
	// footprint: the full baseline minus every proposal's CURRENT footprint. We
	// then add back each proposal at its (possibly clamped) suggested footprint.
	let reserved = baseline;
	for (const p of proposals) {
		reserved -= currentMiBOf(p, pcMiB);
	}

	const kept: Proposal[] = [];
	for (const p of proposals) {
		const headroom = capMiB - reserved;
		const currentMiB = currentMiBOf(p, pcMiB);
		// If clamping is needed, shrink the suggestion to fit the headroom.
		if (p.suggestedMiB > headroom && p.setSuggestedMiB) {
			p.setSuggestedMiB(Math.max(0, headroom));
			p.rec.reason += " (clamped to stay within 85% RAM budget)";
		}
		// Drop a proposal that, after clamping, can no longer offer a real
		// increase over its current footprint — recommending "raise X to its
		// current value" is noise, and never let reserved exceed the cap.
		if (p.suggestedMiB <= currentMiB || reserved + p.suggestedMiB > capMiB) {
			reserved += currentMiB; // keep the current footprint counted
			continue;
		}
		reserved += p.suggestedMiB;
		kept.push(p);
	}

	// Derive FPM spare-server values from the final max_children so the pool
	// stays internally consistent when applied.
	const out: PerfRecommendation[] = [];
	for (const p of kept) {
		out.push(p.rec);
		if (p.rec.key === "PHP_FPM_PM_MAX_CHILDREN") {
			out.push(...deriveFpmSpares(p.rec));
		}
	}

	return {
		recommendations: out,
		reservedMiB: Math.round(reserved),
		headroomMiB: Math.round(capMiB - reserved),
		capMiB,
	};
}

/** Derive START/MIN_SPARE/MAX_SPARE from a final max_children recommendation. */
function deriveFpmSpares(parent: PerfRecommendation): PerfRecommendation[] {
	const max = Number(parent.suggested);
	const start = clampInt(max / 4, 1);
	const minSpare = clampInt(max / 8, 1);
	const maxSpare = clampInt(max / 2, 2);
	const mk = (
		key: string,
		label: string,
		value: number
	): PerfRecommendation => ({
		key,
		label,
		current: "(derived)",
		suggested: String(value),
		unit: "workers",
		category: "fpm",
		risk: "low",
		reason: `Derived from max_children=${max} to keep the pool internally consistent.`,
	});
	return [
		mk("PHP_FPM_PM_START_SERVERS", "FPM start servers", start),
		mk("PHP_FPM_PM_MIN_SPARE_SERVERS", "FPM min spare servers", minSpare),
		mk("PHP_FPM_PM_MAX_SPARE_SERVERS", "FPM max spare servers", maxSpare),
	];
}

/** Baseline > cap: propose the single largest downward cut, risk:"high". */
function overBudgetResult(
	m: PerfMeasurements,
	env: Record<string, string>,
	baseline: number,
	capMiB: number
): AdviseResult {
	const overBy = baseline - capMiB;
	const innodbMiB =
		m.innodb.bufferPoolSizeMiB ||
		sizeToMiB(env.MARIADB_INNODB_BUFFER_POOL_SIZE);
	const redisMiB = m.redis.maxMemoryMiB || sizeToMiB(env.REDIS_MAXMEMORY);

	// Cut from the largest reducible memory pool first (innodb, then redis).
	const recs: PerfRecommendation[] = [];
	if (innodbMiB >= redisMiB && innodbMiB > 0) {
		recs.push(
			downRec(
				"MARIADB_INNODB_BUFFER_POOL_SIZE",
				"InnoDB buffer pool size",
				innodbMiB,
				overBy,
				"innodb"
			)
		);
	} else if (redisMiB > 0) {
		recs.push(
			downRec("REDIS_MAXMEMORY", "Redis max memory", redisMiB, overBy, "redis")
		);
	}
	return {
		recommendations: recs,
		reservedMiB: Math.round(baseline),
		headroomMiB: Math.round(capMiB - baseline),
		capMiB,
	};
}

function downRec(
	key: string,
	label: string,
	currentMiB: number,
	overByMiB: number,
	category: PerfRecommendation["category"]
): PerfRecommendation {
	const target = Math.max(64, currentMiB - overByMiB);
	return {
		key,
		label,
		current: miBToSize(currentMiB),
		suggested: miBToSize(target),
		unit: "MiB",
		category,
		risk: "high",
		reason: `Reserved memory already exceeds the 85% RAM budget by ${Math.round(overByMiB)} MiB — reduce ${label.toLowerCase()} to free headroom and avoid the OOM-killer.`,
	};
}

// --- preview diff -----------------------------------------------------------

/** Pure: turn recommendations into a from→to diff array + a rendered text block. */
export function buildPreviewDiff(recommendations: PerfRecommendation[]): {
	diff: PerfPreviewDiff[];
	text: string;
} {
	const diff: PerfPreviewDiff[] = recommendations.map((r) => ({
		key: r.key,
		from: r.current,
		to: r.suggested,
	}));
	const text =
		diff.length === 0
			? "No changes proposed."
			: diff.map((d) => `- ${d.key}=${d.from}\n+ ${d.key}=${d.to}`).join("\n");
	return { diff, text };
}
