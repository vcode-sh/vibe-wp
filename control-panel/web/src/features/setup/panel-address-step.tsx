/**
 * Step 2 of the onboarding wizard: "Your control panel address".
 *
 * Shows the live, HTTPS-secured panel URL (the magic-DNS sslip.io host on a
 * fresh install) with a copy button, plus DNS guidance for owners who want a
 * custom domain: the exact A record to create and a pointer to Settings for
 * applying it. We deliberately do NOT pretend to apply a custom domain here —
 * applying one is a privileged Caddy/origin switch handled in Settings.
 */
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Globe, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Loader } from "@/components/loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { panelAccessQuery } from "@/data/queries";

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
	const { data, isLoading } = useQuery(panelAccessQuery());

	if (isLoading || !data) {
		return <Loader />;
	}

	const ip = data.ip ?? "your-server-ip";

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
								Automatic address — no DNS setup needed.
							</span>
						) : null}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Want a custom domain? (optional)
					</CardTitle>
					<CardDescription>
						Prefer something like <code>panel.yourdomain.com</code>? Point it at
						this server, then apply it in Settings.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3">
					<div className="grid gap-1.5">
						<span className="text-muted-foreground text-xs">
							1. Create this DNS record at your domain registrar:
						</span>
						<code className="block rounded-sm bg-muted px-3 py-2 font-mono text-sm">
							panel.yourdomain.com&nbsp;&nbsp;A&nbsp;&nbsp;{ip}
						</code>
					</div>
					<p className="text-muted-foreground text-xs">
						2. Once it resolves, open{" "}
						<span className="font-medium text-foreground">
							Settings → Panel domain
						</span>{" "}
						to switch the panel over to your domain. You don't need to do this
						now — the address above works today.
					</p>
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
