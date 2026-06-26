import { Label } from "@control-panel/ui/components/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "@control-panel/ui/components/native-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { logRotationConfigQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";
import { invalidateLogRotationConfigSaved } from "@/lib/realtime/immediate-invalidation";

const MAX_SIZES = ["1m", "5m", "10m", "25m", "50m", "100m"] as const;

export function LogRotationCard() {
	const qc = useQueryClient();
	const query = useQuery(logRotationConfigQuery());
	const save = useMutation(orpc.logRotationConfigSet.mutationOptions());
	const config = query.data?.config;
	const [maxSize, setMaxSize] = useState<(typeof MAX_SIZES)[number]>("10m");
	const [maxFile, setMaxFile] = useState(3);

	useEffect(() => {
		if (!config) {
			return;
		}
		setMaxSize(config.maxSize);
		setMaxFile(config.maxFile);
	}, [config]);

	async function handleSave() {
		const files = Math.min(10, Math.max(1, Math.trunc(maxFile || 3)));
		try {
			const result = await save.mutateAsync({ maxSize, maxFile: files });
			await invalidateLogRotationConfigSaved(qc);
			setMaxFile(files);
			toast.success(
				result.recreateRequired
					? "Log rotation saved. Recreate site containers to apply it."
					: "Log rotation saved."
			);
		} catch {
			toast.error("Failed to save log rotation. Admin role required.");
		}
	}

	return (
		<QueryBoundary
			errorMessage="Couldn't load log rotation settings."
			hasData={Boolean(query.data)}
			isError={query.isError}
			isLoading={query.isLoading}
			onRetry={() => query.refetch()}
			skeletonClassName="h-44 w-full"
		>
			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Log rotation</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="grid gap-1.5">
							<Label htmlFor="log-max-size">Max file size</Label>
							<NativeSelect
								id="log-max-size"
								onChange={(e) =>
									setMaxSize(e.target.value as (typeof MAX_SIZES)[number])
								}
								value={maxSize}
							>
								{MAX_SIZES.map((value) => (
									<NativeSelectOption key={value} value={value}>
										{value}
									</NativeSelectOption>
								))}
							</NativeSelect>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="log-max-file">Files to keep</Label>
							<Input
								id="log-max-file"
								max={10}
								min={1}
								onChange={(e) => setMaxFile(Number(e.target.value))}
								type="number"
								value={maxFile}
							/>
						</div>
					</div>
					<Button
						className="justify-self-start"
						disabled={save.isPending}
						onClick={handleSave}
					>
						{save.isPending ? "Saving..." : "Save log rotation"}
					</Button>
					<p className="text-muted-foreground text-xs">
						Applied to every site's env file. Docker applies json-file logging
						options when containers are recreated.
					</p>
				</CardContent>
			</Card>
		</QueryBoundary>
	);
}
