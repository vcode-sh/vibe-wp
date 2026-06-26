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
	direction: StagingSyncDirection;
	scope: string[];
	siteId: string;
	source: { env: SyncEnv; project: string | null; url: string | null };
	steps: string[];
	target: { env: SyncEnv; project: string | null; url: string | null };
	urlRewrite:
		| { required: false }
		| { from: string; required: true; to: string };
}

interface BuildPlanInput {
	direction: StagingSyncDirection;
	readEnvValue: (env: SyncEnv, key: string) => Promise<string | undefined>;
	site: DetectedSite;
}

const REFRESH_SCOPE = [
	"database",
	"uploads",
	"plugins",
	"themes",
	"mu-plugins",
];
const FILE_SCOPE = ["plugins", "themes", "mu-plugins"];

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
	direction,
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
		direction,
		scope: refresh ? REFRESH_SCOPE : FILE_SCOPE,
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
				? { from: prod.url, required: true, to: stage.url }
				: { required: false },
	};
}
