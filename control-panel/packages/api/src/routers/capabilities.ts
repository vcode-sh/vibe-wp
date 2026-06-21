export const controlCapabilities = [
	{
		name: "Site inventory",
		status: "planned",
		detail: "Read Vibe WP installs from the headless core and bin/vibe.",
	},
	{
		name: "Operation runner",
		status: "planned",
		detail: "Execute reviewed operations with live progress and redacted logs.",
	},
	{
		name: "Backups",
		status: "planned",
		detail:
			"Surface local and remote backup status without making the database authoritative.",
	},
	{
		name: "Health checks",
		status: "planned",
		detail:
			"Expose smoke, runtime doctor, monitoring, and performance reports.",
	},
] as const;
