import { LiveOperation } from "@/components/patterns/live-operation";
import { useOperations } from "@/lib/operations/operations-provider";

export function ActiveOperationDialog() {
	const { ops, expandedId, minimize } = useOperations();
	const expanded = ops.find((o) => o.jobId === expandedId);

	return (
		<LiveOperation
			jobId={expanded?.jobId ?? null}
			kind={expanded?.kind ?? "generic"}
			onOpenChange={(open) => {
				if (!open) {
					minimize();
				}
			}}
			open={Boolean(expanded)}
			title={expanded?.title ?? ""}
		/>
	);
}
