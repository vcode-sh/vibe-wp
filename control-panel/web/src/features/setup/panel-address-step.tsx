/**
 * Step 2 of the onboarding wizard: "Your control panel address".
 *
 * Shows the live, HTTPS-secured panel URL (the magic-DNS sslip.io host on a
 * fresh install) with a copy button, AND a working "Use a custom domain
 * (optional)" expander: the owner can enter panel.yourdomain.com, see the exact
 * A record to create, run a live DNS preflight, and Apply it right here during
 * onboarding (setup-gated). The magic-DNS card stays shown above as the always-
 * working fallback — applying a custom domain is purely additive and can never
 * lock anyone out.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, Globe, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Loader } from "@/components/loader";
import { PanelDomainForm } from "@/components/settings/panel-domain-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { panelAccessQuery, setupPanelDnsPreflightQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";

function CopyButton({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			aria-label="Copy panel address"
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(value);
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				} catch {
					setCopied(false);
				}
			}}
			size="icon"
			type="button"
			variant="outline"
		>
			{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
		</Button>
	);
}

export function PanelAddressStep({
	onBack,
	onContinue,
}: {
	onBack: () => void;
	onContinue: () => void;
}) {
	const access = useQuery(panelAccessQuery());
	const apply = useMutation(orpc.setupPanelDomainApply.mutationOptions());
	const [showCustom, setShowCustom] = useState(false);

	if (access.isLoading || !access.data) {
		return <Loader />;
	}

	const data = access.data;

	return (
		<div className="grid gap-5">
			<div className="grid gap-1.5">
				<h2 className="font-semibold text-xl">Your control panel address</h2>
				<p className="text-muted-foreground text-sm">
					This is where you'll manage your WordPress sites from now on. It's
					already live and protected with HTTPS — bookmark it.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Globe className="size-4 text-muted-foreground" />
						Panel address
					</CardTitle>
					<CardDescription>Open this link to reach your panel.</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3">
					<div className="flex items-center gap-2">
						<code className="flex-1 truncate rounded-sm bg-muted px-3 py-2 font-mono text-sm">
							{data.url}
						</code>
						<CopyButton value={data.url} />
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Badge className="gap-1" variant="secondary">
							<ShieldCheck className="size-3" />
							Live &amp; secured by HTTPS
						</Badge>
						{data.isMagicDns ? (
							<span className="text-muted-foreground text-xs">
								Automatic address — no DNS setup needed. It always works.
							</span>
						) : null}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Use a custom domain (optional)
					</CardTitle>
					<CardDescription>
						Prefer something like <code>panel.yourdomain.com</code>? Add it now
						— the address above keeps working, so you can't get locked out.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3">
					{showCustom ? (
						<PanelDomainForm
							access={data}
							isApplying={apply.isPending}
							onApplied={() => access.refetch()}
							onApply={(domain) => apply.mutateAsync({ domain })}
							preflightQuery={(domain) => setupPanelDnsPreflightQuery(domain)}
						/>
					) : (
						<div>
							<Button
								onClick={() => setShowCustom(true)}
								type="button"
								variant="outline"
							>
								<Globe className="size-4" />
								Set up a custom domain
							</Button>
						</div>
					)}
				</CardContent>
			</Card>

			<div className="flex items-center justify-between gap-3">
				<Button onClick={onBack} type="button" variant="ghost">
					Back
				</Button>
				<Button onClick={onContinue} type="button">
					Continue
				</Button>
			</div>
		</div>
	);
}
