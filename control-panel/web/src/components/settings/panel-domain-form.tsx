/**
 * Shared "custom control-panel domain" flow, used by BOTH the onboarding
 * /setup panel-address step and the Settings → Server page. Given a panel-access
 * snapshot (for the VPS IP + the always-working magic-DNS URL), an apply mutation,
 * and a preflight-query factory, it renders the whole idiot-proof flow:
 *
 *   1. a domain input (with live client-side validation)
 *   2. the EXACT DNS A record to create: `panel.yourdomain.com  A  <vps-ip>`
 *   3. a live, debounced DNS preflight status (points-here / not-yet / proxied)
 *   4. an Apply button (disabled until the domain is well-formed)
 *   5. a clear ok / pending result, always reminding the owner the magic-DNS URL
 *      keeps working so they can never get locked out.
 *
 * It owns NO security: the procedures it calls re-validate the domain (pre-spawn
 * AND at the root boundary) and the host op is additive + Caddy-validated.
 */
import type {
	PanelAccess,
	PanelDomainApplyResult,
} from "@control-panel/api/contract";
import { useQuery } from "@tanstack/react-query";
import {
	AlertTriangle,
	CheckCircle2,
	Globe,
	Loader2,
	RefreshCw,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { dnsPreflightQuery } from "@/data/queries";

/** Allowed chars in a panel hostname (mirrors the server-side positive allowlist). */
const HOST_CHARS_RE = /^[a-z0-9.-]+$/;

/** Minimal client-side shape check (a-z 0-9 . - , a dot, no edge dot/dash). */
function looksLikeDomain(raw: string): boolean {
	const d = raw.trim().toLowerCase();
	if (d.length < 3 || d.length > 253 || !d.includes(".")) {
		return false;
	}
	if (!HOST_CHARS_RE.test(d)) {
		return false;
	}
	if (
		d.startsWith(".") ||
		d.endsWith(".") ||
		d.startsWith("-") ||
		d.endsWith("-") ||
		d.includes("..")
	) {
		return false;
	}
	return d.split(".").every((l) => l.length >= 1 && l.length <= 63);
}

/** Debounce a value so we don't preflight on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return debounced;
}

export function PanelDomainForm({
	access,
	preflightQuery,
	onApply,
	isApplying,
	onApplied,
}: {
	access: PanelAccess;
	/**
	 * Factory for the (setup-gated or authed) DNS preflight query for a domain.
	 * Both surfaces' factories return the same orpc query-options shape
	 * (DnsPreflightResult), so we type it off the authed dnsPreflightQuery.
	 */
	preflightQuery: (domain: string) => ReturnType<typeof dnsPreflightQuery>;
	/** Runs the apply mutation; resolves with the result, rejects on failure. */
	onApply: (domain: string) => Promise<PanelDomainApplyResult>;
	/** True while the apply mutation is in flight (disables the button). */
	isApplying: boolean;
	/** Called after a successful apply so the parent can refetch panelAccess. */
	onApplied?: (result: PanelDomainApplyResult) => void;
}) {
	const [domain, setDomain] = useState(access.customDomain ?? "");
	const [result, setResult] = useState<PanelDomainApplyResult | null>(null);
	const normalized = domain.trim().toLowerCase();
	const valid = looksLikeDomain(normalized);
	const debounced = useDebounced(normalized, 600);
	const ip = access.ip ?? "your-server-ip";

	const preflight = useQuery({
		...preflightQuery(debounced),
		enabled: valid && debounced === normalized && looksLikeDomain(debounced),
		refetchOnWindowFocus: false,
		staleTime: 30_000,
		retry: false,
	});

	async function handleApply() {
		try {
			const res = await onApply(normalized);
			setResult(res);
			onApplied?.(res);
			toast.success(
				res.status === "ok"
					? "Custom domain is live."
					: "Custom domain added — securing once DNS propagates."
			);
		} catch {
			toast.error(
				"Couldn't apply the custom domain. Your panel is unchanged and still reachable."
			);
		}
	}

	const pre = preflight.data;
	const preOk = pre?.ok === true;

	return (
		<div className="grid gap-4">
			<div className="grid gap-1.5">
				<label className="font-medium text-sm" htmlFor="panel-custom-domain">
					Custom panel address
				</label>
				<Input
					autoCapitalize="none"
					autoComplete="off"
					id="panel-custom-domain"
					onChange={(e) => setDomain(e.target.value)}
					placeholder="panel.yourdomain.com"
					spellCheck={false}
					value={domain}
				/>
				{domain.length > 0 && !valid ? (
					<p className="text-warning text-xs">
						Enter a full domain like <code>panel.yourdomain.com</code>.
					</p>
				) : null}
			</div>

			<div className="grid gap-1.5">
				<span className="text-muted-foreground text-xs">
					1. Create this DNS record at your domain registrar:
				</span>
				<code className="block rounded-sm bg-muted px-3 py-2 font-mono text-sm">
					{valid ? normalized : "panel.yourdomain.com"}
					&nbsp;&nbsp;A&nbsp;&nbsp;{ip}
				</code>
			</div>

			{valid ? (
				<PreflightPanel
					expectedIp={pre?.expectedIp ?? null}
					isError={preflight.isError}
					isFetching={preflight.isFetching}
					message={pre?.message ?? null}
					ok={preOk}
					onRecheck={() => preflight.refetch()}
				/>
			) : null}

			<div className="flex flex-wrap items-center gap-3">
				<Button
					disabled={!valid || isApplying}
					onClick={handleApply}
					type="button"
				>
					{isApplying ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Globe className="size-4" />
					)}
					{isApplying ? "Applying…" : "Apply custom domain"}
				</Button>
				<span className="text-muted-foreground text-xs">
					2. Then click Apply — it's safe even before DNS is ready.
				</span>
			</div>

			{result ? <ResultPanel result={result} /> : null}
		</div>
	);
}

function PreflightPanel({
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
				Checking whether this domain points here…
			</div>
		);
	}
	const tone = ok
		? "border-success/40 bg-success/10"
		: "border-warning/40 bg-warning/10";
	const Icon = ok ? CheckCircle2 : AlertTriangle;
	const fallback = isError
		? "Couldn't run the DNS check right now — you can still apply; it secures once DNS resolves."
		: "DNS check unavailable — you can still apply.";
	return (
		<div className={`grid gap-2 rounded-lg border p-4 ${tone}`}>
			<div className="flex items-start gap-2 text-sm">
				<Icon
					className={`mt-0.5 size-4 shrink-0 ${ok ? "text-success" : "text-warning"}`}
				/>
				<p className="text-foreground">{message ?? fallback}</p>
			</div>
			{expectedIp && !ok ? (
				<p className="text-muted-foreground text-xs">
					Set an A record to{" "}
					<span className="font-medium text-foreground">{expectedIp}</span>.
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

function ResultPanel({ result }: { result: PanelDomainApplyResult }) {
	const ok = result.status === "ok";
	const tone = ok
		? "border-success/40 bg-success/10"
		: "border-primary/30 bg-primary/5";
	const Icon = ok ? ShieldCheck : Loader2;
	return (
		<div className={`grid gap-2 rounded-lg border p-4 ${tone}`}>
			<div className="flex items-start gap-2 text-sm">
				<Icon
					className={`mt-0.5 size-4 shrink-0 ${ok ? "text-success" : "text-muted-foreground"}`}
				/>
				<p className="text-foreground">{result.message}</p>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="secondary">Always works: {result.magicUrl}</Badge>
			</div>
		</div>
	);
}
