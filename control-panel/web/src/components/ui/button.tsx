import { Button as BaseButton } from "@control-panel/ui/components/button";
import { cn } from "@control-panel/ui/lib/utils";
import type { ComponentProps } from "react";

function Button({ className, ...props }: ComponentProps<typeof BaseButton>) {
	return <BaseButton className={cn("rounded-sm!", className)} {...props} />;
}

export { Button };
