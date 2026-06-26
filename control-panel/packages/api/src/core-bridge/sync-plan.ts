import { createHash } from "node:crypto";

import type { DetectedSite } from "./sites";

type SyncEnv = "prod" | "stage";

export type StagingSyncDirection = "refreshFromProd" | "pushFilesToLive";

export type StagingSyncConflict =
	| "identical-compose-project"
	| "identical-wp-home"
	| "missing-staging";

export interface StagingSyncPlan {
	apply: {
		procedure: "stagingRefresh" | "stagingPushToLive";
		requiresRole: "operator" | "admin";
	} | null;
	backup: { env: "prod"; required: true; timing: "before-change" };
	canApply: boolean;
	conflicts: StagingSyncConflict[];
	createdAt: string;
	direction: StagingSyncDirection;
	expiresAt: string;
	freshness: { maxAgeMinutes: number; status: "fresh" };
	planId: string;
	scope: string[];
	siteId: string;
	source: { env: SyncEnv; project: string | null; url: string | null };
	steps: string[];
	target: { env: SyncEnv; project: string | null; url: string | null };
	urlRewrite:
		| { estimatedOccurrences: 0; preview: string; required: false }
		| {
				estimatedOccurrences: number | null;
				from: string;
				preview: string;
				required: true;
				to: string;
		  };
}

interface BuildPlanInput {
	countUrlOccurrences?: (from: string, to: string) => Promise<number | null>;
	direction: StagingSyncDirection;
	now?: Date;
	readEnvValue: (env: SyncEnv, key: string) => Promise<string | undefined>;
	site: DetectedSite;
}

const PLAN_TTL_MINUTES = 15;
const issuedPlans = new Map<string, { expiresAtMs: number }>();
const REFRESH_SCOPE = [
	"database",
	"uploads",
	"plugins",
	"themes",
	"mu-plugins",
];
const FILE_SCOPE = ["plugins", "themes", "mu-plugins"];

function hashPlan(input: object): string {
	return createHash("sha256")
		.update(JSON.stringify(input))
		.digest("hex")
		.slice(0, 16);
}

function safePlanToken(value: string): string {
	return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

function purgeExpiredIssuedPlans(now: Date) {
	for (const [planId, issued] of issuedPlans.entries()) {
		if (issued.expiresAtMs < now.getTime()) {
			issuedPlans.delete(planId);
		}
	}
}

export function clearIssuedStagingSyncPlansForTests() {
	issuedPlans.clear();
}

export function issueStagingSyncPlan(
	plan: StagingSyncPlan,
	now = new Date()
): StagingSyncPlan {
	purgeExpiredIssuedPlans(now);
	issuedPlans.set(plan.planId, { expiresAtMs: Date.parse(plan.expiresAt) });
	return plan;
}

export function isIssuedStagingSyncPlanCurrent(
	planId: string,
	now = new Date()
): boolean {
	purgeExpiredIssuedPlans(now);
	const issued = issuedPlans.get(planId);
	return Boolean(issued && issued.expiresAtMs >= now.getTime());
}

async function envIdentity(
	readEnvValue: BuildPlanInput["readEnvValue"],
	env: SyncEnv
) {
	const [url, project] = await Promise.all([
		readEnvValue(env, "WP_HOME"),
		readEnvValue(env, "COMPOSE_PROJECT_NAME"),
	]);
	return { env, project: project || null, url: url || null };
}

function conflictsFor(input: {
	prod: Awaited<ReturnType<typeof envIdentity>>;
	site: DetectedSite;
	stage: Awaited<ReturnType<typeof envIdentity>>;
}): StagingSyncConflict[] {
	const conflicts: StagingSyncConflict[] = [];
	if (!(input.site.hasStaging && input.site.stagingDomain)) {
		conflicts.push("missing-staging");
	}
	if (input.prod.url && input.prod.url === input.stage.url) {
		conflicts.push("identical-wp-home");
	}
	if (input.prod.project && input.prod.project === input.stage.project) {
		conflicts.push("identical-compose-project");
	}
	return conflicts;
}

export async function buildStagingSyncPlan({
	countUrlOccurrences,
	direction,
	now = new Date(),
	readEnvValue,
	site,
}: BuildPlanInput): Promise<StagingSyncPlan> {
	const [prod, stage] = await Promise.all([
		envIdentity(readEnvValue, "prod"),
		envIdentity(readEnvValue, "stage"),
	]);
	const conflicts = conflictsFor({ prod, site, stage });
	const refresh = direction === "refreshFromProd";
	const source = refresh ? prod : stage;
	const target = refresh ? stage : prod;
	const canApply = conflicts.length === 0;
	const createdAt = now.toISOString();
	const expiresAt = new Date(
		now.getTime() + PLAN_TTL_MINUTES * 60_000
	).toISOString();
	const scope = refresh ? REFRESH_SCOPE : FILE_SCOPE;
	const hash = hashPlan({
		direction,
		siteId: site.id,
		source,
		target,
		scope,
		urlRewrite:
			refresh && prod.url && stage.url
				? { from: prod.url, to: stage.url }
				: null,
	});
	const planPrefix = `sync_${direction}_${safePlanToken(site.id)}_`;
	const rewriteCount =
		refresh && prod.url && stage.url && countUrlOccurrences
			? await countUrlOccurrences(prod.url, stage.url)
			: null;
	return {
		apply: canApply
			? {
					procedure: refresh ? "stagingRefresh" : "stagingPushToLive",
					requiresRole: refresh ? "operator" : "admin",
				}
			: null,
		backup: { env: "prod", required: true, timing: "before-change" },
		canApply,
		conflicts,
		createdAt,
		direction,
		expiresAt,
		freshness: { maxAgeMinutes: PLAN_TTL_MINUTES, status: "fresh" },
		planId: `${planPrefix}${hash}`,
		scope,
		siteId: site.id,
		source,
		steps: refresh
			? [
					"backup prod before staging restore",
					"restore prod backup into staging",
					"rewrite prod URLs to staging URLs",
					"verify staging smoke",
				]
			: [
					"backup prod before managed file replacement",
					"replace prod plugins, themes, and mu-plugins from staging",
					"verify prod smoke and restore backup on failure",
				],
		target,
		urlRewrite:
			refresh && prod.url && stage.url
				? {
						estimatedOccurrences: rewriteCount,
						from: prod.url,
						preview:
							rewriteCount === null
								? `Replace ${prod.url} with ${stage.url} during staging restore.`
								: `Replace ${rewriteCount} occurrence(s) of ${prod.url} with ${stage.url} during staging restore.`,
						required: true,
						to: stage.url,
					}
				: {
						estimatedOccurrences: 0,
						preview: refresh
							? "No URL rewrite can be planned until both URLs are known."
							: "No URL rewrite is planned for managed-file promotion.",
						required: false,
					},
	};
}
