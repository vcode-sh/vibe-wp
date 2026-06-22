import { Badge } from "@/components/ui/badge";
import type { ProvisionMode, WizardForm } from "./wizard-types";
import { backupOptions, performanceOptions } from "./wizard-types";

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-4 py-2 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right font-medium">{value}</span>
		</div>
	);
}

function labelFor(
	options: ReadonlyArray<{ label: string; value: string }>,
	value: string
): string {
	return options.find((o) => o.value === value)?.label ?? value;
}

/** Final step — read-only summary. Secrets are never displayed. */
export function StepReview({
	form,
	mode,
}: {
	form: WizardForm;
	mode: ProvisionMode;
}) {
	return (
		<div className="grid gap-4">
			<p className="text-muted-foreground text-sm">
				Review the plan, then create the site. Provisioning runs in the
				background — you can follow it from the operations tray.
			</p>
			<div className="divide-y divide-border rounded-lg border border-border px-4">
				<Row label="Production domain" value={form.domain.trim() || "—"} />
				<Row label="Site title" value={form.siteTitle.trim() || "Default"} />
				<Row label="Admin email" value={form.adminEmail.trim() || "—"} />
				<Row
					label="Staging"
					value={
						form.stagingEnabled
							? form.stagingDomain.trim() || "Enabled"
							: "Disabled"
					}
				/>
				<Row
					label="Performance"
					value={labelFor(performanceOptions, form.performancePreset)}
				/>
				<Row
					label="Backups"
					value={labelFor(backupOptions, form.backupSchedule)}
				/>
				<Row
					label="Monitoring"
					value={form.monitorEnabled ? "Enabled" : "Disabled"}
				/>
				{mode === "external" ? (
					<>
						<Row
							label="External database"
							value={
								form.extDbHost.trim()
									? `${form.extDbName.trim() || "?"} @ ${form.extDbHost.trim()}`
									: "—"
							}
						/>
						<Row
							label="External Redis"
							value={
								form.extRedisHost.trim()
									? `${form.extRedisHost.trim()}:${form.extRedisPort.trim()}`
									: "—"
							}
						/>
						<div className="flex items-center justify-between py-2 text-sm">
							<span className="text-muted-foreground">Credentials</span>
							<Badge variant="outline">Stored as secrets</Badge>
						</div>
					</>
				) : null}
			</div>
		</div>
	);
}
