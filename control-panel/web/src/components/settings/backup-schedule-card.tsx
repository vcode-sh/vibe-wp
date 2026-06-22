/**
 * BackupScheduleCard — per-site scheduled-backup cadence (off/daily/weekly).
 * The cadence is backed by a systemd timer on the host, not the panel DB, so
 * the panel and the unattended timer can never disagree. Retention lives in the
 * Off-site backups card; this card only governs how often a backup runs.
 */
import { Label } from "@control-panel/ui/components/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "@control-panel/ui/components/native-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteSettingsQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";

type Cadence = "off" | "daily" | "weekly";

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
	{ value: "off", label: "Off — no automatic backups" },
	{ value: "daily", label: "Daily — 03:30 every day" },
	{ value: "weekly", label: "Weekly — 03:30 every Sunday" },
];

export function BackupScheduleCard({ siteId }: { siteId: string }) {
	const query = useQuery(siteSettingsQuery(siteId));
	return (
		<QueryBoundary
			errorMessage="Couldn't load the backup schedule."
			hasData={query.data !== undefined}
			isError={query.isError}
			isLoading={query.isLoading}
			onRetry={() => query.refetch()}
			skeletonClassName="h-40 w-full"
		>
			{query.data ? (
				<ScheduleForm
					initial={
						(query.data.settings?.backupSchedule as Cadence | undefined) ??
						"off"
					}
					siteId={siteId}
				/>
			) : null}
		</QueryBoundary>
	);
}

function ScheduleForm({
	siteId,
	initial,
}: {
	siteId: string;
	initial: Cadence;
}) {
	const qc = useQueryClient();
	const [cadence, setCadence] = useState<Cadence>(initial);
	const save = useMutation(orpc.siteBackupScheduleSet.mutationOptions());

	async function handleSave() {
		try {
			await save.mutateAsync({ siteId, cadence });
			await qc.invalidateQueries(siteSettingsQuery(siteId));
			toast.success(
				cadence === "off"
					? "Automatic backups turned off."
					: `Automatic backups scheduled ${cadence}.`
			);
		} catch {
			toast.error("Failed to update the backup schedule. Admin role required.");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Backup schedule</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<p className="text-muted-foreground text-xs">
					How often an automatic backup runs on the server. Each run also copies
					off-site when off-site backups are enabled below.
				</p>
				<div className="grid gap-1.5">
					<Label htmlFor={`backup-cadence-${siteId}`}>Cadence</Label>
					<NativeSelect
						className="w-full"
						id={`backup-cadence-${siteId}`}
						onChange={(e) => setCadence(e.target.value as Cadence)}
						value={cadence}
					>
						{CADENCE_OPTIONS.map((o) => (
							<NativeSelectOption key={o.value} value={o.value}>
								{o.label}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</div>
				<Button
					className="justify-self-start"
					disabled={save.isPending || cadence === initial}
					onClick={handleSave}
				>
					{save.isPending ? "Saving…" : "Save schedule"}
				</Button>
			</CardContent>
		</Card>
	);
}
