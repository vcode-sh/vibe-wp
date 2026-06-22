import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@/data/types";

const LABELS: Record<JobStatus, string> = {
	queued: "Queued",
	running: "Running",
	succeeded: "Succeeded",
	failed: "Failed",
	canceled: "Canceled",
};

function statusClassName(status: JobStatus): string {
	switch (status) {
		case "succeeded":
			return "border-transparent bg-success/10 text-success";
		case "failed":
			return "border-transparent bg-destructive/10 text-destructive";
		case "running":
			return "border-transparent bg-primary/10 text-primary";
		default:
			return "border-transparent bg-muted text-muted-foreground";
	}
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
	return (
		<Badge className={statusClassName(status)} variant="outline">
			{LABELS[status]}
		</Badge>
	);
}
