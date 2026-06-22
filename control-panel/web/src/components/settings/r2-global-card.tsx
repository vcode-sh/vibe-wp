/**
 * R2GlobalCard — settings card for the shared R2 credentials row (__global__).
 * Secret field shows "•••••••• (saved)" when hasSecret, and is only sent when
 * the user types a new value.
 */
import { Label } from "@control-panel/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { backupConfigQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";

const GLOBAL_SITE_ID = "__global__";

const PROVIDERS = ["Cloudflare", "Minio", "Other"] as const;

export function R2GlobalCard() {
	const query = useQuery(backupConfigQuery(GLOBAL_SITE_ID));
	return (
		<QueryBoundary
			errorMessage="Couldn't load global R2 credentials."
			hasData={query.data !== undefined}
			isError={query.isError}
			isLoading={query.isLoading}
			onRetry={() => query.refetch()}
			skeletonClassName="h-48 w-full"
		>
			{query.data ? <R2GlobalForm global={query.data.global} /> : null}
		</QueryBoundary>
	);
}

type MaskedRow = Record<string, unknown> | null;

function R2GlobalForm({ global: row }: { global: MaskedRow }) {
	const qc = useQueryClient();

	const [provider, setProvider] = useState(
		typeof row?.provider === "string" ? row.provider : "Cloudflare"
	);
	const [endpoint, setEndpoint] = useState(
		typeof row?.endpoint === "string" ? row.endpoint : ""
	);
	const [accessKeyId, setAccessKeyId] = useState(
		typeof row?.accessKeyId === "string" ? row.accessKeyId : ""
	);
	const [secret, setSecret] = useState("");
	const [bucket, setBucket] = useState(
		typeof row?.bucket === "string" ? row.bucket : ""
	);

	const hasSecret = row?.hasSecret === true;

	const save = useMutation(orpc.backupConfigSet.mutationOptions());

	async function handleSave() {
		try {
			const patch: Record<string, unknown> = {
				siteId: GLOBAL_SITE_ID,
				provider: provider || undefined,
				endpoint: endpoint || undefined,
				accessKeyId: accessKeyId || undefined,
				bucket: bucket || undefined,
			};
			if (secret) {
				patch.secret = secret;
			}
			await save.mutateAsync(patch as Parameters<typeof save.mutateAsync>[0]);
			await qc.invalidateQueries(backupConfigQuery(GLOBAL_SITE_ID));
			setSecret("");
			toast.success("Global R2 credentials saved.");
		} catch {
			toast.error("Failed to save R2 credentials.");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">
					Off-site backups (R2) — global credentials
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="grid gap-1.5">
					<Label htmlFor="r2-provider">Provider</Label>
					<select
						className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
						id="r2-provider"
						onChange={(e) => setProvider(e.target.value)}
						value={provider}
					>
						{PROVIDERS.map((p) => (
							<option key={p} value={p}>
								{p}
							</option>
						))}
					</select>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="r2-endpoint">Endpoint</Label>
					<Input
						id="r2-endpoint"
						onChange={(e) => setEndpoint(e.target.value)}
						placeholder="https://…"
						value={endpoint}
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="r2-access-key-id">Access key ID</Label>
					<Input
						autoComplete="off"
						id="r2-access-key-id"
						onChange={(e) => setAccessKeyId(e.target.value)}
						placeholder="Access key ID"
						value={accessKeyId}
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="r2-secret">Secret access key</Label>
					<Input
						autoComplete="new-password"
						id="r2-secret"
						onChange={(e) => setSecret(e.target.value)}
						placeholder={
							hasSecret ? "•••••••• (saved)" : "Enter secret access key"
						}
						type="password"
						value={secret}
					/>
					{hasSecret && !secret ? (
						<p className="text-muted-foreground text-xs">
							Leave blank to keep the existing secret.
						</p>
					) : null}
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="r2-bucket">Bucket</Label>
					<Input
						id="r2-bucket"
						onChange={(e) => setBucket(e.target.value)}
						placeholder="my-backups-bucket"
						value={bucket}
					/>
				</div>
				<Button
					className="justify-self-start"
					disabled={save.isPending}
					onClick={handleSave}
				>
					{save.isPending ? "Saving…" : "Save"}
				</Button>
			</CardContent>
		</Card>
	);
}
