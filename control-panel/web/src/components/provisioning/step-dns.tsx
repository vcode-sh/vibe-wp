import { Label } from "@control-panel/ui/components/label";
import { Switch } from "@control-panel/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { dnsPreflightQuery } from "@/data/queries";
import { validateDomain } from "./validation";

/**
 * DNS preflight step — advisory gate before Create. Checks the production
 * domain's A record points at this VPS, shows a clear OK / not-yet state with
 * the target IP, offers a Re-check button, and an explicit "Create anyway"
 * override (DNS can propagate later, or the domain may sit behind a CDN/proxy).
 * Reports the resolved ok-state up via onResult so the wizard can gate Create.
 */
export function StepDns({
	domain,
	override,
	setOverride,
	onResult,
}: {
	domain: string;
	override: boolean;
	setOverride: (next: boolean) => void;
	onResult: (ok: boolean) => void;
}) {
	const normalized = domain.trim().toLowerCase();
	// Only query when the domain passes basic client validation — a half-typed
	// domain would just 400 at the server.
	const domainValid = validateDomain(normalized) === null;
	const query = useQuery({
		...dnsPreflightQuery(normalized),
		enabled: domainValid,
		// DNS/IP rarely change mid-wizard; don't auto-refetch on focus.
		refetchOnWindowFocus: false,
		staleTime: 30_000,
		retry: false,
	});

	const result = query.data;
	const ok = result?.ok === true;

	// Lift the ok-state to the wizard so the Create button can gate on it.
	useEffect(() => {
		onResult(ok);
	}, [ok, onResult]);

	return (
		<div className="grid gap-5">
			<div className="grid gap-1">
				<p className="font-medium text-sm">Check DNS points to this server</p>
				<p className="text-muted-foreground text-sm">
					Before we create the site, we check that{" "}
					<span className="font-medium text-foreground">
						{normalized || "your domain"}
					</span>{" "}
					already points to this VPS, so HTTPS works right away.
				</p>
			</div>

			{domainValid ? (
				<DnsPanel
					expectedIp={result?.expectedIp ?? null}
					isError={query.isError}
					isFetching={query.isFetching}
					message={result?.message ?? null}
					ok={ok}
					onRecheck={() => query.refetch()}
				/>
			) : (
				<div className="rounded-lg border border-border bg-muted/40 p-4 text-muted-foreground text-sm">
					Enter a valid domain in the first step to run the DNS check.
				</div>
			)}

			<div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
				<div className="grid gap-0.5">
					<Label className="font-medium">Create anyway</Label>
					<p className="text-muted-foreground text-xs">
						Skip this check and create the site now. Use this if DNS is still
						propagating, or the domain sits behind a CDN/proxy (e.g.
						Cloudflare). HTTPS will start working once DNS resolves here.
					</p>
				</div>
				<Switch
					aria-label="Create anyway, ignoring the DNS check"
					checked={override}
					onCheckedChange={setOverride}
				/>
			</div>
		</div>
	);
}

function DnsPanel({
	ok,
	isFetching,
	isError,
	message,
	expectedIp,
	onRecheck,
}: {
	ok: boolean;
	isFetching: boolean;
	isError: boolean;
	message: string | null;
	expectedIp: string | null;
	onRecheck: () => void;
}) {
	if (isFetching) {
		return (
			<div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-4 text-muted-foreground text-sm">
				<Loader2 className="size-4 animate-spin" />
				Checking DNS for this domain…
			</div>
		);
	}

	const tone = ok
		? "border-success/40 bg-success/10 text-success"
		: "border-warning/40 bg-warning/10 text-warning";
	const Icon = ok ? CheckCircle2 : AlertTriangle;
	const fallback = isError
		? "Couldn't run the DNS check right now — you can re-check, or create anyway."
		: "DNS check unavailable.";

	return (
		<div className={`grid gap-3 rounded-lg border p-4 ${tone}`}>
			<div className="flex items-start gap-2 text-sm">
				<Icon className="mt-0.5 size-4 shrink-0" />
				<p className="text-foreground">{message ?? fallback}</p>
			</div>
			{expectedIp && !ok ? (
				<p className="text-muted-foreground text-xs">
					Set an A record for this domain to{" "}
					<span className="font-medium text-foreground">{expectedIp}</span> at
					your DNS provider.
				</p>
			) : null}
			<div>
				<Button onClick={onRecheck} size="sm" type="button" variant="outline">
					<RefreshCw className="mr-1.5 size-3.5" />
					Re-check DNS
				</Button>
			</div>
		</div>
	);
}
