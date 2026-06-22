import { Label } from "@control-panel/ui/components/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "@control-panel/ui/components/native-select";
import { Switch } from "@control-panel/ui/components/switch";
import { Input } from "@/components/ui/input";
import type { BackupScheduleInput, PerformancePresetInput } from "@/data/types";
import { FieldRow } from "./field-row";
import type { Errors } from "./validation";
import {
	backupOptions,
	performanceOptions,
	type WizardForm,
} from "./wizard-types";

function ToggleRow({
	checked,
	onChange,
	title,
	description,
}: {
	checked: boolean;
	onChange: (next: boolean) => void;
	title: string;
	description: string;
}) {
	return (
		<div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
			<div className="grid gap-0.5">
				<Label className="font-medium">{title}</Label>
				<p className="text-muted-foreground text-xs">{description}</p>
			</div>
			<Switch checked={checked} onCheckedChange={onChange} />
		</div>
	);
}

/** Step 2 — staging, performance preset, backup schedule, and monitoring. */
export function StepOptions({
	form,
	errors,
	set,
}: {
	form: WizardForm;
	errors: Errors;
	set: <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => void;
}) {
	return (
		<div className="grid gap-5">
			<ToggleRow
				checked={form.stagingEnabled}
				description="Provision a separate staging copy you can refresh and promote."
				onChange={(next) => set("stagingEnabled", next)}
				title="Staging site"
			/>

			{form.stagingEnabled ? (
				<FieldRow
					error={errors.stagingDomain}
					hint="Must differ from the production domain."
					label="Staging domain"
				>
					{(id) => (
						<Input
							autoCapitalize="none"
							autoComplete="off"
							autoCorrect="off"
							id={id}
							onChange={(e) => set("stagingDomain", e.target.value)}
							placeholder="staging.example.com"
							spellCheck={false}
							value={form.stagingDomain}
						/>
					)}
				</FieldRow>
			) : null}

			<FieldRow
				hint="Sizing for nginx, PHP-FPM and the object cache."
				label="Performance preset"
			>
				{(id) => (
					<NativeSelect
						className="w-full"
						id={id}
						onChange={(e) =>
							set("performancePreset", e.target.value as PerformancePresetInput)
						}
						value={form.performancePreset}
					>
						{performanceOptions.map((o) => (
							<NativeSelectOption key={o.value} value={o.value}>
								{o.label}
							</NativeSelectOption>
						))}
					</NativeSelect>
				)}
			</FieldRow>

			<FieldRow
				hint="Automatic off-site backups on a schedule."
				label="Backup schedule"
			>
				{(id) => (
					<NativeSelect
						className="w-full"
						id={id}
						onChange={(e) =>
							set("backupSchedule", e.target.value as BackupScheduleInput)
						}
						value={form.backupSchedule}
					>
						{backupOptions.map((o) => (
							<NativeSelectOption key={o.value} value={o.value}>
								{o.label}
							</NativeSelectOption>
						))}
					</NativeSelect>
				)}
			</FieldRow>

			<ToggleRow
				checked={form.monitorEnabled}
				description="Track uptime and health, and alert on problems."
				onChange={(next) => set("monitorEnabled", next)}
				title="Monitoring"
			/>
		</div>
	);
}
