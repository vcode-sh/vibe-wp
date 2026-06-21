import {
	Badge as BaseBadge,
	badgeVariants as baseBadgeVariants,
} from "@control-panel/ui/components/badge";
import { cn } from "@control-panel/ui/lib/utils";
import type { ComponentProps } from "react";

function Badge({ className, ...props }: ComponentProps<typeof BaseBadge>) {
	return <BaseBadge className={cn("rounded-sm!", className)} {...props} />;
}

const badgeVariants = baseBadgeVariants;

export { Badge, badgeVariants };
