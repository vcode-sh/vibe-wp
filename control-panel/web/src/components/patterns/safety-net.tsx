import { Button } from "@control-panel/ui/components/button";
import { Card, CardHeader, CardTitle } from "@control-panel/ui/components/card";
import { CopyCheck, ShieldCheck } from "lucide-react";

import type { SiteOverview } from "@/data/types";

export function SafetyNet({
	safety,
	onBackup,
	onRestore,
}: {
	safety: SiteOverview["safety"];
	onBackup: () => void;
	onRestore: () => void;
}) {
	return (
		<Card className="p-4">
			<CardHeader className="p-0">
				<CardTitle className="text-sm">Your safety net</CardTitle>
			</CardHeader>
			<div className="mt-3 grid gap-3">
				<div className="flex items-start gap-3">
					<CopyCheck className="mt-0.5 size-4 text-success" />
					<div>
						<div className="font-medium text-sm">{safety.backupText}</div>
						<div className="text-muted-foreground text-xs">
							{safety.backupDetail}
						</div>
					</div>
				</div>
				<div className="flex items-start gap-3">
					<ShieldCheck className="mt-0.5 size-4 text-success" />
					<div>
						<div className="font-medium text-sm">{safety.securityText}</div>
						<div className="text-muted-foreground text-xs">
							{safety.securityDetail}
						</div>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<Button onClick={onBackup} size="sm">
						Back up now
					</Button>
					<Button
						className="text-primary"
						onClick={onRestore}
						size="sm"
						variant="link"
					>
						Restore a backup…
					</Button>
				</div>
			</div>
		</Card>
	);
}
