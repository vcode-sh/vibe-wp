import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Card } from "@/components/ui/card";
import { offsiteVerifiedQuery } from "@/data/queries";

/** Turn an integer "hours ago" into friendly prose. */
function agoLabel(hoursAgo: number): string {
	if (hoursAgo === 0) {
		return "less than an hour ago";
	}
	if (hoursAgo === 1) {
		return "1 hour ago";
	}
	if (hoursAgo < 48) {
		return `${hoursAgo} hours ago`;
	}
	return `${Math.floor(hoursAgo / 24)} days ago`;
}

/** A copy is considered stale if its last good verification is over 7 days old. */
const STALE_HOURS = 7 * 24;

/**
 * The headline "off-site copy verified" status banner for a site's backups page.
 * Plain-language, idiot-proof: it tells a non-technical operator whether their
 * disaster-recovery copy is known-good, when it was last proven, and what to do
 * next. Three honest states: verified-fresh, verified-but-stale, and
 * never-verified. It reads ONLY real verification rows (no fabricated badge).
 */
export function OffsiteVerifiedBanner({ siteId }: { siteId: string }) {
	const verified = useQuery(offsiteVerifiedQuery(siteId));
	const data = verified.data;

	if (verified.isLoading) {
		return (
			<Card className="flex items-center gap-3 p-4 text-muted-foreground text-sm">
				<ShieldQuestion className="size-5 shrink-0" />
				Checking when your off-site copy was last verified…
			</Card>
		);
	}

	// Never verified — or no off-site copy has ever passed a check.
	if (!(data && data.hoursAgo !== null)) {
		return (
			<Card className="flex items-start gap-3 border-warning/40 bg-warning/5 p-4">
				<ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
				<div className="text-sm">
					<p className="font-medium">Off-site copy not verified yet</p>
					<p className="text-muted-foreground">
						An off-site copy lives on remote storage (R2) so you can recover
						even if this server is lost. We haven't confirmed one is restorable
						yet. Use <span className="font-medium">Verify</span> on an off-site
						backup below to prove it can be restored.
					</p>
				</div>
			</Card>
		);
	}

	const stale = data.hoursAgo >= STALE_HOURS;
	const when = agoLabel(data.hoursAgo);

	if (stale) {
		return (
			<Card className="flex items-start gap-3 border-warning/40 bg-warning/5 p-4">
				<ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
				<div className="text-sm">
					<p className="font-medium">Off-site copy last verified {when}</p>
					<p className="text-muted-foreground">
						It's been a while since we proved your off-site copy is restorable.
						Run <span className="font-medium">Verify</span> on a recent off-site
						backup below to re-confirm it.
					</p>
				</div>
			</Card>
		);
	}

	return (
		<Card className="flex items-start gap-3 border-success/40 bg-success/5 p-4">
			<ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
			<div className="text-sm">
				<p className="font-medium text-success">
					Off-site copy verified {when}
				</p>
				<p className="text-muted-foreground">
					We confirmed your most recent off-site backup is structurally
					restorable. If this server were lost, you could rebuild from it.
				</p>
			</div>
		</Card>
	);
}
