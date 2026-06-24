import {
	NativeSelect,
	NativeSelectOption,
} from "@control-panel/ui/components/native-select";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SiteInsights } from "@/data/types";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

type Cadence = "off" | "weekly" | "daily";

export function CoreUpdateCard({
	siteId,
	wpCore,
}: {
	siteId: string;
	wpCore: SiteInsights["wp_core"];
}) {
	const { start } = useOperations();
	const updateCore = useMutation(orpc.updatesApply.mutationOptions());
	const safeUpdate = useMutation(orpc.safeUpdate.mutationOptions());

	async function runCore(safe: boolean) {
		try {
			const r = safe
				? await safeUpdate.mutateAsync({ siteId, target: { kind: "core" } })
				: await updateCore.mutateAsync({ siteId, what: "core" });
			start({
				jobId: r.jobId,
				title: safe
					? "Safe-updating WordPress core"
					: "Updating WordPress core",
				kind: safe ? "safeUpdate" : "wpUpdate",
				siteId,
			});
		} catch {
			toast.error("Failed to start the core update.");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">WordPress core</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm">
					{wpCore.version}
					{wpCore.update_available && wpCore.new_version ? (
						<span className="ml-2 text-amber-500">→ {wpCore.new_version}</span>
					) : (
						<span className="ml-2 text-muted-foreground">up to date</span>
					)}
				</p>
				{wpCore.update_available ? (
					<div className="flex gap-2">
						<Button onClick={() => runCore(true)} size="sm">
							Update safely
						</Button>
						<Button onClick={() => runCore(false)} size="sm" variant="outline">
							Update
						</Button>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

export function AutoUpdateScheduleCard({ siteId }: { siteId: string }) {
	const [cadence, setCadence] = useState<Cadence>("off");
	const apply = useMutation(orpc.setAutoUpdateSchedule.mutationOptions());

	async function save(next: Cadence) {
		setCadence(next);
		try {
			const r = await apply.mutateAsync({ siteId, cadence: next });
			if (r.ok) {
				toast.success(
					next === "off"
						? "Scheduled plugin auto-updates disabled."
						: `Scheduled plugin auto-updates: ${next}.`
				);
			} else {
				toast.error("Couldn't apply the schedule.");
			}
		} catch {
			toast.error("Couldn't apply the schedule.");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Scheduled plugin auto-updates</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-muted-foreground text-sm">
					Run <code>wp plugin update --all</code> on a timer.
				</p>
				<NativeSelect
					className="w-40"
					disabled={apply.isPending}
					onChange={(e) => save(e.target.value as Cadence)}
					value={cadence}
				>
					<NativeSelectOption value="off">Off</NativeSelectOption>
					<NativeSelectOption value="weekly">Weekly</NativeSelectOption>
					<NativeSelectOption value="daily">Daily</NativeSelectOption>
				</NativeSelect>
			</CardContent>
		</Card>
	);
}

export function BulkUpdateBar({
	siteId,
	hasPluginUpdates,
}: {
	siteId: string;
	hasPluginUpdates: boolean;
}) {
	const { start } = useOperations();
	const safeAll = useMutation(orpc.safeUpdateAll.mutationOptions());
	const updateAll = useMutation(orpc.updatesApply.mutationOptions());

	async function run(safe: boolean) {
		try {
			const r = safe
				? await safeAll.mutateAsync({ siteId })
				: await updateAll.mutateAsync({ siteId, what: "plugins" });
			start({
				jobId: r.jobId,
				title: safe ? "Safe-updating all plugins" : "Updating all plugins",
				kind: safe ? "safeUpdate" : "wpUpdate",
				siteId,
			});
		} catch {
			toast.error("Failed to start the bulk update.");
		}
	}

	if (!hasPluginUpdates) {
		return null;
	}
	return (
		<div className="flex flex-wrap gap-2">
			<Button onClick={() => run(true)} size="sm">
				Update all plugins (safely)
			</Button>
			<Button onClick={() => run(false)} size="sm" variant="outline">
				Update all plugins
			</Button>
		</div>
	);
}
