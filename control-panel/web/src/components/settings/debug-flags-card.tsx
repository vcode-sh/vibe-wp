/**
 * DebugFlagsCard — WP debug toggles (WP_DEBUG_LOG / WP_DEBUG_DISPLAY /
 * SCRIPT_DEBUG) for one site. These are rendered into wp-config only at
 * container start, so saving prompts a restart, offered as a streamed
 * lifecycle job.
 */
import { Label } from "@control-panel/ui/components/label";
import { Switch } from "@control-panel/ui/components/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteSettingsQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

function ToggleRow({
	id,
	label,
	hint,
	checked,
	onChange,
}: {
	id: string;
	label: string;
	hint: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<div className="grid gap-1.5">
			<div className="flex items-center justify-between gap-4">
				<Label htmlFor={id}>{label}</Label>
				<Switch checked={checked} id={id} onCheckedChange={onChange} />
			</div>
			<p className="text-muted-foreground text-xs">{hint}</p>
		</div>
	);
}

export function DebugFlagsCard({
	siteId,
	initial,
}: {
	siteId: string;
	initial: { debugLog: boolean; debugDisplay: boolean; scriptDebug: boolean };
}) {
	const qc = useQueryClient();
	const { start } = useOperations();
	const [debugLog, setDebugLog] = useState(initial.debugLog);
	const [debugDisplay, setDebugDisplay] = useState(initial.debugDisplay);
	const [scriptDebug, setScriptDebug] = useState(initial.scriptDebug);

	const debugSet = useMutation(orpc.siteDebugSet.mutationOptions());
	const restart = useMutation(orpc.lifecycleRestart.mutationOptions());

	const changed =
		debugLog !== initial.debugLog ||
		debugDisplay !== initial.debugDisplay ||
		scriptDebug !== initial.scriptDebug;

	async function triggerRestart() {
		try {
			const result = await restart.mutateAsync({ siteId });
			start({
				jobId: result.jobId,
				title: `Restarting ${siteId}`,
				kind: "restart",
				siteId,
			});
		} catch {
			toast.error("Failed to restart the site.");
		}
	}

	async function handleSave() {
		try {
			const result = await debugSet.mutateAsync({
				siteId,
				debugLog,
				debugDisplay,
				scriptDebug,
			});
			await qc.invalidateQueries(siteSettingsQuery(siteId));
			if (result.restartRequired) {
				toast.success("Debug flags saved. Restart the site to apply them.", {
					action: {
						label: "Restart now",
						onClick: () => {
							triggerRestart();
						},
					},
				});
			} else {
				toast.success("Debug flags saved.");
			}
		} catch {
			toast.error("Failed to save debug flags. Admin role required.");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Debugging</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<ToggleRow
					checked={debugLog}
					hint="Write PHP notices and errors to wp-content/debug.log. Safe in production."
					id={`debug-log-${siteId}`}
					label="Debug log (WP_DEBUG_LOG)"
					onChange={setDebugLog}
				/>
				<ToggleRow
					checked={debugDisplay}
					hint="Render PHP notices and warnings in the page. Avoid in production — leaks paths to visitors."
					id={`debug-display-${siteId}`}
					label="Display errors (WP_DEBUG_DISPLAY)"
					onChange={setDebugDisplay}
				/>
				<ToggleRow
					checked={scriptDebug}
					hint="Load un-minified core CSS and JavaScript. Useful when debugging the editor or block assets."
					id={`script-debug-${siteId}`}
					label="Script debug (SCRIPT_DEBUG)"
					onChange={setScriptDebug}
				/>
				<Button
					className="justify-self-start"
					disabled={debugSet.isPending || !changed}
					onClick={handleSave}
				>
					{debugSet.isPending ? "Saving…" : "Save debug flags"}
				</Button>
				<p className="text-muted-foreground text-xs">
					Debug flags apply on the next container restart, since wp-config is
					rendered when the container starts.
				</p>
			</CardContent>
		</Card>
	);
}
