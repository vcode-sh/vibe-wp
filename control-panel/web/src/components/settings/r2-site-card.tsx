/**
 * R2SiteCard — per-site off-site backup settings.
 * Credentials are inherited from the global R2 config card above.
 */

import { Label } from "@control-panel/ui/components/label";
import { Switch } from "@control-panel/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { backupConfigQuery, sitesQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";

export function R2SiteCard() {
	const sites = useQuery(sitesQuery());
	return (
		<QueryBoundary
			errorMessage="Couldn't load site list."
			hasData={Boolean(sites.data)}
			isError={sites.isError}
			isLoading={sites.isLoading}
			onRetry={() => sites.refetch()}
			skeletonClassName="h-48 w-full"
		>
			{sites.data && sites.data.length > 0 ? (
				<R2SiteForm sites={sites.data} />
			) : (
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">
							Off-site backups (R2) — per-site settings
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">No sites found.</p>
					</CardContent>
				</Card>
			)}
		</QueryBoundary>
	);
}

interface SiteSummary {
	domain: string;
	id: string;
	name: string;
}

// Caller guarantees sites is non-empty (length > 0 guard in R2SiteCard).
const DEFAULT_SITE: SiteSummary = { id: "", name: "", domain: "" };

function R2SiteForm({ sites }: { sites: SiteSummary[] }) {
	const first = sites[0] ?? DEFAULT_SITE;
	const [siteId, setSiteId] = useState(first.id);
	const selectedSite: SiteSummary = sites.find((s) => s.id === siteId) ?? first;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">
					Off-site backups (R2) — per-site settings
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="grid gap-1.5">
					<Label htmlFor="r2-site-selector">Site</Label>
					<select
						className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
						id="r2-site-selector"
						onChange={(e) => setSiteId(e.target.value)}
						value={siteId}
					>
						{sites.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name} ({s.domain})
							</option>
						))}
					</select>
				</div>
				<p className="text-muted-foreground text-xs">
					Credentials (endpoint, access key, secret, bucket) are shared from the
					global settings above.
				</p>
				<R2SiteFields key={siteId} site={selectedSite} />
			</CardContent>
		</Card>
	);
}

function R2SiteFields({ site }: { site: SiteSummary }) {
	const qc = useQueryClient();
	const query = useQuery(backupConfigQuery(site.id));

	return (
		<QueryBoundary
			errorMessage="Couldn't load per-site config."
			hasData={query.data !== undefined}
			isError={query.isError}
			isLoading={query.isLoading}
			onRetry={() => query.refetch()}
			skeletonClassName="h-32 w-full"
		>
			{query.data ? (
				<R2SiteFieldsForm qc={qc} site={site} siteRow={query.data.site} />
			) : null}
		</QueryBoundary>
	);
}

type MaskedRow = Record<string, unknown> | null;

function R2SiteFieldsForm({
	site,
	siteRow,
	qc,
}: {
	site: SiteSummary;
	siteRow: MaskedRow;
	qc: ReturnType<typeof useQueryClient>;
}) {
	const [enabled, setEnabled] = useState(siteRow?.enabled === 1);
	const [prefix, setPrefix] = useState(
		typeof siteRow?.prefix === "string" ? siteRow.prefix : ""
	);
	const [retention, setRetention] = useState(
		typeof siteRow?.retention === "number" ? String(siteRow.retention) : ""
	);

	const save = useMutation(orpc.backupConfigSet.mutationOptions());

	async function handleSave() {
		try {
			const retentionNum = retention
				? Number.parseInt(retention, 10)
				: undefined;
			await save.mutateAsync({
				siteId: site.id,
				enabled: enabled ? 1 : 0,
				prefix: prefix || undefined,
				retention: retentionNum && retentionNum > 0 ? retentionNum : undefined,
			});
			await qc.invalidateQueries(backupConfigQuery(site.id));
			toast.success(`Off-site settings saved for ${site.name}.`);
		} catch {
			toast.error("Failed to save per-site R2 settings.");
		}
	}

	return (
		<div className="grid gap-4">
			<div className="flex items-center justify-between gap-4">
				<Label htmlFor={`r2-enabled-${site.id}`}>Enable off-site backups</Label>
				<Switch
					checked={enabled}
					id={`r2-enabled-${site.id}`}
					onCheckedChange={setEnabled}
				/>
			</div>
			<div className="grid gap-1.5">
				<Label htmlFor={`r2-prefix-${site.id}`}>Folder (R2 prefix)</Label>
				<Input
					id={`r2-prefix-${site.id}`}
					onChange={(e) => setPrefix(e.target.value)}
					placeholder={site.domain}
					value={prefix}
				/>
				<p className="text-muted-foreground text-xs">
					Defaults to the site domain ({site.domain}) when left blank.
				</p>
			</div>
			<div className="grid gap-1.5">
				<Label htmlFor={`r2-retention-${site.id}`}>
					Retention (keep N backups)
				</Label>
				<Input
					id={`r2-retention-${site.id}`}
					min="1"
					onChange={(e) => setRetention(e.target.value)}
					placeholder="e.g. 10"
					type="number"
					value={retention}
				/>
			</div>
			<Button
				className="justify-self-start"
				disabled={save.isPending}
				onClick={handleSave}
			>
				{save.isPending ? "Saving…" : "Save"}
			</Button>
		</div>
	);
}
