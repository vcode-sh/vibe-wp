/**
 * Settings → Server: "Control panel domain" card (admin-only). Lets the owner set
 * or change a custom panel domain (panel.theirsite.com) AFTER onboarding, using
 * the same flow as the /setup step. It is purely additive and can never lock the
 * owner out: the magic-DNS URL is shown as the always-working fallback, the host
 * op only ADDS the custom domain to Caddy (validating before reload), and the
 * existing session stays on the magic-DNS origin.
 *
 * Gated on `session.user.role === "admin"` (UX; the procedure is adminProcedure
 * too, which is the real boundary). Renders nothing for non-admins.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { dnsPreflightQuery, panelAccessQuery } from "@/data/queries";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc/client";
import { PanelDomainForm } from "./panel-domain-form";

export function PanelDomainCard() {
	const { data: session } = authClient.useSession();
	const isAdmin = session?.user.role === "admin";
	const access = useQuery(panelAccessQuery());
	const apply = useMutation(orpc.panelDomainApply.mutationOptions());

	if (!(isAdmin && access.data)) {
		return null;
	}

	const data = access.data;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Control panel domain</CardTitle>
				<CardDescription>
					Give this control panel its own address, like{" "}
					<code>panel.yourdomain.com</code>. Optional — your panel already works
					at the address below.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-5">
				<div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-4">
					<div className="flex flex-wrap items-center gap-2">
						<Badge className="gap-1" variant="secondary">
							<ShieldCheck className="size-3" />
							Always works
						</Badge>
						<code className="font-mono text-sm">{data.url}</code>
					</div>
					<p className="text-muted-foreground text-xs">
						This address always works and is secured with HTTPS. Adding a custom
						domain never replaces it — if the custom domain isn't ready, your
						panel stays reachable here. You can't get locked out.
					</p>
					{data.customDomain ? (
						<p className="text-muted-foreground text-xs">
							Current custom domain:{" "}
							<span className="font-medium text-foreground">
								{data.customUrl}
							</span>
						</p>
					) : null}
				</div>

				<PanelDomainForm
					access={data}
					isApplying={apply.isPending}
					onApplied={() => access.refetch()}
					onApply={(domain) => apply.mutateAsync({ domain })}
					preflightQuery={(domain) => dnsPreflightQuery(domain)}
				/>
			</CardContent>
		</Card>
	);
}
