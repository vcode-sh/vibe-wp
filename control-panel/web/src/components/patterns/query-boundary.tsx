import { Skeleton } from "@control-panel/ui/components/skeleton";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function QueryBoundary({
	isError,
	isLoading,
	hasData,
	errorMessage,
	onRetry,
	skeletonClassName = "h-24 w-full",
	children,
}: {
	isError: boolean;
	isLoading: boolean;
	hasData: boolean;
	errorMessage: string;
	onRetry: () => void;
	skeletonClassName?: string;
	children: ReactNode;
}) {
	if (isError) {
		return (
			<div className="rounded-lg border border-destructive/40 p-6 text-sm">
				<p className="font-medium">{errorMessage}</p>
				<Button className="mt-3" onClick={onRetry} variant="outline">
					Try again
				</Button>
			</div>
		);
	}

	if (isLoading || !hasData) {
		return <Skeleton className={skeletonClassName} />;
	}

	return <>{children}</>;
}
