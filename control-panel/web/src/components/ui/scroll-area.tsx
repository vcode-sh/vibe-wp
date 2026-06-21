import { cn } from "@control-panel/ui/lib/utils";
import type { ComponentProps } from "react";

function ScrollArea({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("relative overflow-auto", className)}
			data-slot="scroll-area"
			{...props}
		/>
	);
}

export { ScrollArea };
