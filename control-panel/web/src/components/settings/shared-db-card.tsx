/**
 * SharedDbCard — server-area card for the ONE shared MariaDB project. Reading
 * status is available to any operator; initializing the project and rotating the
 * root password are admin-only and gated on `session.user.role === "admin"`.
 * Initialize blocks for minutes (shows a pending state); rotate-root is
 * confirmed through an AlertDialog. No secrets are ever displayed — the server
 * bridge keeps the root/per-site passwords out of the returned payloads.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sharedDbStatusQuery } from "@/data/queries";
import { authClient } from "@/lib/auth-client";
import { type client, orpc } from "@/lib/orpc/client";
import {
	invalidateSharedDbInitialized,
	invalidateSharedDbRotated,
} from "@/lib/realtime/immediate-invalidation";

/** The operator-readable status payload, derived from the typed oRPC client so
 * the type stays in lockstep with the server without a contract import. */
type SharedDbStatus = Awaited<ReturnType<typeof client.sharedDbStatus>>;

function StatusBadge({ status }: { status: SharedDbStatus }) {
	if (status.healthy) {
		return (
			<Badge className="bg-success text-success-foreground">Healthy</Badge>
		);
	}
	if (status.present) {
		return (
			<Badge className="bg-warning text-warning-foreground">Unhealthy</Badge>
		);
	}
	return <Badge variant="outline">Not installed</Badge>;
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-4 py-2 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right font-medium">{value}</span>
		</div>
	);
}

export function SharedDbCard() {
	const query = useQuery(sharedDbStatusQuery());
	return (
		<QueryBoundary
			errorMessage="Couldn't load shared database status."
			hasData={query.data !== undefined}
			isError={query.isError}
			isLoading={query.isLoading}
			onRetry={() => query.refetch()}
			skeletonClassName="h-64 w-full"
		>
			{query.data ? <SharedDbBody status={query.data} /> : null}
		</QueryBoundary>
	);
}

function SharedDbBody({ status }: { status: SharedDbStatus }) {
	const qc = useQueryClient();
	const { data: session } = authClient.useSession();
	const isAdmin = session?.user.role === "admin";

	const [rotateOpen, setRotateOpen] = useState(false);
	const [output, setOutput] = useState<string | null>(null);

	const init = useMutation(orpc.sharedDbInit.mutationOptions());
	const rotate = useMutation(orpc.sharedDbRotateRoot.mutationOptions());

	async function handleInit() {
		setOutput(null);
		try {
			const res = await init.mutateAsync({});
			setOutput(res.output || "(no output)");
			if (res.ok) {
				toast.success("Shared database initialized.");
			} else {
				toast.error("Initialization reported a failure — see output below.");
			}
			await invalidateSharedDbInitialized(qc);
		} catch {
			toast.error("Failed to initialize the shared database.");
		}
	}

	async function handleRotate() {
		setRotateOpen(false);
		setOutput(null);
		try {
			const res = await rotate.mutateAsync({});
			setOutput(res.output || "(no output)");
			if (res.ok) {
				toast.success("Root password rotated.");
			} else {
				toast.error("Rotation reported a failure — see output below.");
			}
			await invalidateSharedDbRotated(qc);
		} catch {
			toast.error("Failed to rotate the root password.");
		}
	}

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
				<CardTitle className="flex items-center gap-2 text-sm">
					<Database className="size-4" />
					Shared database
				</CardTitle>
				<StatusBadge status={status} />
			</CardHeader>
			<CardContent className="grid gap-4">
				<p className="text-muted-foreground text-xs">
					One global MariaDB server that hosts the databases for sites you
					provision with the shared-database option. Sites using a dedicated
					container are unaffected.
				</p>

				<div className="divide-y divide-border rounded-lg border border-border px-4">
					<Row label="Network" value={status.network} />
					<Row
						label="Max connections"
						value={status.maxConnections?.toString() ?? "—"}
					/>
					<Row label="Buffer pool" value={status.bufferPool ?? "—"} />
					<Row label="Databases" value={status.databases?.toString() ?? "—"} />
				</div>

				{isAdmin ? (
					<div className="flex flex-wrap gap-2">
						{status.healthy ? (
							<Button
								disabled={rotate.isPending}
								onClick={() => setRotateOpen(true)}
								variant="outline"
							>
								<KeyRound className="mr-1.5 size-4" />
								{rotate.isPending ? "Rotating…" : "Rotate root password"}
							</Button>
						) : (
							<Button disabled={init.isPending} onClick={handleInit}>
								{init.isPending ? (
									<Loader2 className="mr-1.5 size-4 animate-spin" />
								) : (
									<Database className="mr-1.5 size-4" />
								)}
								{init.isPending
									? "Initializing… (this can take a few minutes)"
									: "Initialize shared database"}
							</Button>
						)}
					</div>
				) : (
					<p className="text-muted-foreground text-xs">
						Initializing and rotating the root password require an admin.
					</p>
				)}

				{output === null ? null : (
					<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
						{output}
					</pre>
				)}
			</CardContent>

			<AlertDialog onOpenChange={setRotateOpen} open={rotateOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Rotate the root password?</AlertDialogTitle>
						<AlertDialogDescription>
							Generates a new root password for the shared MariaDB server and
							verifies the old one stops working. Per-site users are unaffected.
							The new password is stored on the host and never shown here.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction autoFocus onClick={handleRotate}>
							Rotate root password
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	);
}
