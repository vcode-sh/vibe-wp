import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { stagingQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";
import { FieldRow } from "./field-row";
import { validateDomain } from "./validation";

/** Dialog to attach a staging site by domain, tracked via the operations tray. */
export function StagingDialog({
	siteId,
	productionDomain,
	open,
	onOpenChange,
}: {
	siteId: string;
	productionDomain?: string;
	open: boolean;
	onOpenChange: (next: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const { start, getStatus } = useOperations();
	const attach = useMutation(orpc.attachStaging.mutationOptions());
	const [domain, setDomain] = useState("");
	const [error, setError] = useState<string | undefined>(undefined);
	const [attaching, setAttaching] = useState(false);
	const handledRef = useRef(false);

	// Gate on the attach job's terminal status: only refresh staging info on
	// success so the card reflects the newly provisioned site; on failure/cancel
	// surface an error and leave the prior state untouched. Reads the current
	// status (no transition race) and fires at most once per job.
	useEffect(() => {
		if (!attaching || handledRef.current) {
			return;
		}
		const status = getStatus(siteId, "attachStaging");
		if (status === null) {
			return;
		}
		handledRef.current = true;
		setAttaching(false);
		if (status === "succeeded") {
			queryClient.invalidateQueries({
				queryKey: stagingQuery(siteId).queryKey,
			});
			return;
		}
		const label = status === "canceled" ? "was canceled" : "failed";
		toast.error(`Adding staging for ${siteId} ${label}.`);
	}, [attaching, getStatus, siteId, queryClient]);

	function check(value: string): string | undefined {
		const domainError = validateDomain(value);
		if (domainError) {
			return domainError;
		}
		if (
			productionDomain &&
			value.trim().toLowerCase() === productionDomain.trim().toLowerCase()
		) {
			return "Staging domain must differ from production.";
		}
		return;
	}

	async function handleAttach() {
		const validationError = check(domain);
		if (validationError) {
			setError(validationError);
			return;
		}
		const stagingDomain = domain.trim().toLowerCase();
		try {
			const result = await attach.mutateAsync({ siteId, stagingDomain });
			handledRef.current = false;
			setAttaching(true);
			start({
				jobId: result.jobId,
				title: `Add staging for ${siteId}`,
				kind: "attachStaging",
				siteId,
			});
			onOpenChange(false);
			setDomain("");
			setError(undefined);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to start adding staging."
			);
		}
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add a staging site</DialogTitle>
					<DialogDescription>
						We provision a separate copy at the domain below. Point its DNS at
						this VPS first.
					</DialogDescription>
				</DialogHeader>
				<FieldRow
					error={error}
					hint="Must differ from the production domain."
					label="Staging domain"
				>
					{(id) => (
						<Input
							autoCapitalize="none"
							autoComplete="off"
							autoCorrect="off"
							id={id}
							onChange={(e) => {
								setDomain(e.target.value);
								setError(undefined);
							}}
							placeholder="staging.example.com"
							spellCheck={false}
							value={domain}
						/>
					)}
				</FieldRow>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={
							attach.isPending || attaching || domain.trim().length === 0
						}
						onClick={handleAttach}
					>
						Add staging
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
