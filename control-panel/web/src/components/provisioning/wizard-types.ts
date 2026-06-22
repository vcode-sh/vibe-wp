import type { BackupScheduleInput, PerformancePresetInput } from "@/data/types";

export type ProvisionMode = "standard" | "external";

/** Wizard step keys; the external-services step only appears in external mode. */
export type StepKey = "basics" | "options" | "external" | "review";

/** Mutable form state for the new-site wizard (strings everywhere for inputs). */
export interface WizardForm {
	adminEmail: string;
	backupSchedule: BackupScheduleInput;
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

/** Build the ordered step list for the given mode. */
export function stepsFor(mode: ProvisionMode): StepKey[] {
	return mode === "external"
		? ["basics", "options", "external", "review"]
		: ["basics", "options", "review"];
}
