import type { StepDef } from "./steps";

const BACKUP: StepDef[] = [
	{ match: /Dumping MariaDB/i, label: "Dumping database" },
	{ match: /Archiving wp-content/i, label: "Archiving files" },
	{ match: /Backup written/i, label: "Writing backup" },
	{ match: /Uploading|Transferred:/i, label: "Uploading off-site" },
	{
		match: /uploaded to off-server|Verifying remote/i,
		label: "Verifying upload",
	},
];

const RESTORE: StepDef[] = [
	{ match: /Starting required services/i, label: "Starting services" },
	{ match: /Resetting WordPress database/i, label: "Resetting database" },
	{ match: /Restoring database/i, label: "Restoring database" },
	{ match: /Restoring wp-content/i, label: "Restoring files" },
	{ match: /Normalizing/i, label: "Fixing permissions" },
	{ match: /Flushing caches/i, label: "Flushing caches" },
	{ match: /Restore complete/i, label: "Done" },
];

export const GENERIC_STEPS: StepDef[] = [{ match: /./, label: "Working" }];

export const OP_STEPS: Record<string, StepDef[]> = {
	backup: BACKUP,
	restore: RESTORE,
};
