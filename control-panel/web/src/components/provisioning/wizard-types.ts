import type { BackupScheduleInput, PerformancePresetInput } from "@/data/types";

export type ProvisionMode = "standard" | "external";

/** Where the new site's database lives. "dedicated" runs a per-site MariaDB
 * container (the default); "shared" provisions onto the one global MariaDB. */
export type DbMode = "dedicated" | "shared";

/** Wizard step keys. The database step only appears in standard mode (external
 * mode brings its own DB), and the external-services step only in external. */
export type StepKey = "basics" | "database" | "options" | "external" | "review";

/** Mutable form state for the new-site wizard (strings everywhere for inputs). */
export interface WizardForm {
	adminEmail: string;
	backupSchedule: BackupScheduleInput;
	dbMode: DbMode;
	domain: string;
	extDbHost: string;
	extDbName: string;
	extDbPassword: string;
	extDbUser: string;
	extRedisHost: string;
	extRedisPassword: string;
	extRedisPort: string;
	monitorEnabled: boolean;
	performancePreset: PerformancePresetInput;
	siteTitle: string;
	stagingDomain: string;
	stagingEnabled: boolean;
}

export const emptyForm: WizardForm = {
	adminEmail: "",
	backupSchedule: "daily",
	dbMode: "dedicated",
	domain: "",
	extDbHost: "",
	extDbName: "",
	extDbPassword: "",
	extDbUser: "",
	extRedisHost: "",
	extRedisPassword: "",
	extRedisPort: "6379",
	monitorEnabled: true,
	performancePreset: "balanced",
	siteTitle: "",
	stagingDomain: "",
	stagingEnabled: false,
};

export const performanceOptions: ReadonlyArray<{
	label: string;
	value: PerformancePresetInput;
}> = [
	{ label: "Conservative (smaller VPS)", value: "conservative" },
	{ label: "Balanced (recommended)", value: "balanced" },
	{ label: "High memory (large VPS)", value: "high-memory" },
];

export const backupOptions: ReadonlyArray<{
	label: string;
	value: BackupScheduleInput;
}> = [
	{ label: "Off", value: "off" },
	{ label: "Daily", value: "daily" },
	{ label: "Weekly", value: "weekly" },
];

/** Build the ordered step list for the given mode. The database-choice step is
 * standard-mode only; external mode already pins the DB to the operator's own
 * MariaDB via the external-services step. */
export function stepsFor(mode: ProvisionMode): StepKey[] {
	return mode === "external"
		? ["basics", "options", "external", "review"]
		: ["basics", "database", "options", "review"];
}
