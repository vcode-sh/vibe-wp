import { Input as BaseInput } from "@control-panel/ui/components/input";
import { cn } from "@control-panel/ui/lib/utils";
import type { ComponentProps } from "react";

function Input({ className, ...props }: ComponentProps<typeof BaseInput>) {
	return <BaseInput className={cn("rounded-sm!", className)} {...props} />;
}

export { Input };
