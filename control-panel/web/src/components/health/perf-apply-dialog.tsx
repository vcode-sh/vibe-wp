/**
 * PerfApplyDialog — the idiot-proof confirm step for applying performance tuning.
 *
 * It spells out, in plain language, exactly what will happen and the automatic
 * safety net behind it: a fresh snapshot is taken first, the new settings are
 * written, the affected containers restart to pick them up, the site is health-
 * checked, and if that check fails the previous settings are restored for you.
 * A before → after table makes the change concrete. No jargon, no surprises.
 */

import { ArrowRight, ShieldCheck } from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface PerfApplyChange {
	from: string;
	key: string;
	label: string;
	to: string;
	unit: string;
}

const STEPS: { text: string }[] = [
	{ text: "Take a fresh backup of this site (your safety net)." },
	{ text: "Write the new settings to this site's configuration." },
	{
		text: "Briefly restart WordPress, the database and cache so the settings take effect — a few seconds of downtime.",
	},
	{ text: "Run a health check and time the home page." },
	{
		text: "If the health check fails, automatically restore the previous settings and restart again — you do not have to do anything.",
	},
];

function ChangeTable({ changes }: { changes: PerfApplyChange[] }) {
	if (changes.length === 0) {
		return null;
	}
	return (
		<div className="overflow-hidden rounded-lg border border-border">
			<div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 bg-muted/50 px-3 py-2 font-medium text-muted-foreground text-xs">
				<span>Setting</span>
				<span className="text-right">Now</span>
				<span className="px-1" />
				<span className="text-right">After</span>
			</div>
			<div className="divide-y divide-border">
				{changes.map((c) => (
					<div
						className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-3 py-2 text-sm"
						key={c.key}
					>
						<span className="font-medium">{c.label}</span>
						<span className="text-right font-mono text-muted-foreground text-xs tabular-nums">
							{c.from}
						</span>
						<ArrowRight className="size-3 text-muted-foreground" />
						<span className="text-right font-mono text-xs tabular-nums">
							{c.to}
							{c.unit ? (
								<span className="text-muted-foreground"> {c.unit}</span>
							) : null}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function PerfApplyDialog({
	open,
	onOpenChange,
	changes,
	onConfirm,
}: {
	changes: PerfApplyChange[];
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						<ShieldCheck className="size-5 text-success" />
						Apply these performance settings?
					</AlertDialogTitle>
					<AlertDialogDescription>
						These are the changes the advisor recommends. They never reserve
						more than 85% of this server's memory, and the whole change is
						protected by an automatic safety net.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="grid gap-4">
					<ChangeTable changes={changes} />

					<div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
						<p className="font-medium text-sm">What happens when you confirm</p>
						<ol className="grid list-decimal gap-1.5 pl-5 text-muted-foreground text-sm">
							{STEPS.map((s) => (
								<li key={s.text}>{s.text}</li>
							))}
						</ol>
					</div>

					<div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
						<ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
						<p className="text-foreground">
							You are safe to try this. If anything looks wrong afterwards, the
							previous settings are restored for you automatically — and the
							pre-change backup is kept either way.
						</p>
					</div>
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction autoFocus onClick={onConfirm}>
						Apply &amp; restart safely
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
