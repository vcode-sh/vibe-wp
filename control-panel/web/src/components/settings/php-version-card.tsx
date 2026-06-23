/**
 * PhpVersionCard — pick a site's PHP version. The version is fixed by
 * WORDPRESS_IMAGE (a Docker FROM build arg), so saving writes the chosen image
 * to the site env file and then rebuilds the container (`vibe up --build`) — a
 * plain restart would reuse the old image. The rebuild is surfaced as a
 * streamed lifecycle job so the operator can watch it.
 */
import { Label } from "@control-panel/ui/components/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "@control-panel/ui/components/native-select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteSettingsQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

/**
 * Curated PHP options. Values are the full image tags; the panel server and the
 * root shell writer both enforce this exact set, so an unknown tag is rejected.
 */
const PHP_OPTIONS = [
	{ value: "wordpress:7.0-php8.5-fpm", label: "PHP 8.5" },
	{ value: "wordpress:7.0-php8.4-fpm", label: "PHP 8.4" },
	{ value: "wordpress:7.0-php8.3-fpm", label: "PHP 8.3" },
] as const;

type PhpImage = (typeof PHP_OPTIONS)[number]["value"];

export function PhpVersionCard({
	siteId,
	currentImage,
}: {
	siteId: string;
	currentImage: string;
}) {
	const qc = useQueryClient();
	const { start } = useOperations();
	// Preselect the current image when it is one of the curated options;
	// otherwise fall back to the newest so the control is never empty.
	const known = PHP_OPTIONS.some((o) => o.value === currentImage);
	const [image, setImage] = useState<PhpImage>(
		known ? (currentImage as PhpImage) : PHP_OPTIONS[0].value
	);
	const phpSet = useMutation(orpc.sitePhpImageSet.mutationOptions());
	const rebuild = useMutation(orpc.lifecycleUp.mutationOptions());
	// Only "changed" when we actually read the current image (known). If the env
	// read failed (currentImage empty/unknown), keep the action disabled so we
	// never trigger a surprise rebuild against a misreported current version.
	const changed = known && image !== currentImage;

	async function triggerRebuild() {
		try {
			const result = await rebuild.mutateAsync({ siteId });
			start({
				jobId: result.jobId,
				title: `Rebuilding ${siteId}`,
				kind: "up",
				siteId,
			});
		} catch {
			toast.error("Failed to start the rebuild.");
		}
	}

	async function handleSave() {
		try {
			const result = await phpSet.mutateAsync({ siteId, image });
			await qc.invalidateQueries(siteSettingsQuery(siteId));
			if (result.rebuildRequired) {
				await triggerRebuild();
			}
		} catch {
			toast.error("Failed to set the PHP version. Admin role required.");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">PHP version</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="grid gap-1.5">
					<Label htmlFor={`php-image-${siteId}`}>WordPress runtime image</Label>
					<NativeSelect
						className="w-full"
						id={`php-image-${siteId}`}
						onChange={(e) => setImage(e.target.value as PhpImage)}
						value={image}
					>
						{PHP_OPTIONS.map((o) => (
							<NativeSelectOption key={o.value} value={o.value}>
								{o.label}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</div>
				<Button
					className="justify-self-start"
					disabled={phpSet.isPending || rebuild.isPending || !changed}
					onClick={handleSave}
				>
					{phpSet.isPending || rebuild.isPending
						? "Switching…"
						: "Switch PHP version"}
				</Button>
				<p className="text-muted-foreground text-xs">
					Saving rebuilds the container with the selected image, which briefly
					takes the site offline. The first switch to a new tag may take a few
					minutes while the image is pulled and built.
				</p>
			</CardContent>
		</Card>
	);
}
