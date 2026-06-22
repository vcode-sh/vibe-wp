import { LiveOperation } from "@/components/patterns/live-operation";

export function OperationRunner({
	open,
	onOpenChange,
	title,
	jobId,
	kind = "generic",
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	jobId: string | null;
	kind?: string;
}) {
	return (
		<LiveOperation
			jobId={jobId}
			kind={kind}
			onOpenChange={onOpenChange}
			open={open}
			title={title}
		/>
	);
}
