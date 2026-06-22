import { protectedProcedure } from "../procedures";

/**
 * Honest capability ledger for the control panel. `status` reflects what is
 * actually wired through the typed server + bin/vibe / installer headless core
 * today (`shipped`) versus work that is genuinely still ahead (`planned`).
 * Keep this in sync with the routers as pillars land — never claim more than
 * what a procedure truly delivers.
 */
const controlCapabilities = [
	{
		name: "Site inventory & truthful reads",
		status: "shipped",
		detail:
			"Detects Vibe WP installs and reports real smoke/monitor/doctor signals from bin/vibe — no fabricated greens.",
	},
	{
		name: "Health, security & performance",
		status: "shipped",
		detail:
			"Smoke checks, monitor (HTTP/TLS/disk/backup/containers), runtime doctor, security-status and perf reports from the host.",
	},
	{
		name: "Operation runner",
		status: "shipped",
		detail:
			"Executes reviewed operations through one host-exec chokepoint with persisted jobs, live SSE progress and redacted logs.",
	},
	{
		name: "Lifecycle operations",
		status: "shipped",
		detail: "Up, restart, cache flush and down as tracked, role-gated jobs.",
	},
	{
		name: "Backups & R2 test",
		status: "shipped",
		detail:
			"Surfaces local/offsite backup status, runs backups/verify/restore, and validates offsite (R2) credentials without making the database authoritative.",
	},
	{
		name: "Notifications",
		status: "shipped",
		detail:
			"Configure and test Telegram/webhook/email monitor alerts; secrets never leave the env files.",
	},
	{
		name: "Team & roles",
		status: "shipped",
		detail:
			"Better Auth login with viewer/operator/admin RBAC enforced on every mutating procedure.",
	},
	{
		name: "Provisioning",
		status: "shipped",
		detail:
			"Create sites (managed or external DB/Redis), attach staging and remove/purge sites via the installer headless core.",
	},
	{
		name: "Dedicated-user hardening",
		status: "planned",
		detail:
			"Run the panel under a least-privilege host user with a narrowed sudo allowlist instead of broad host access.",
	},
	{
		name: "Single-binary distribution",
		status: "planned",
		detail:
			"Ship the server + web assets as one compiled artifact under systemd for a turnkey install.",
	},
	{
		name: "Tauri desktop packaging",
		status: "planned",
		detail: "Package the panel as a native desktop app for local operators.",
	},
] as const;

export const controlOverviewRouter = {
	controlOverview: protectedProcedure.handler(({ context }) => ({
		currentUser: {
			name: context.session.user.name,
			email: context.session.user.email,
		},
		sourceOfTruth: "bin/vibe + installer headless core",
		databaseRole: "local control-plane metadata only",
		capabilities: controlCapabilities,
	})),
};
