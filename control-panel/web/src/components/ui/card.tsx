import {
	Card as BaseCard,
	CardAction as BaseCardAction,
	CardContent as BaseCardContent,
	CardDescription as BaseCardDescription,
	CardFooter as BaseCardFooter,
	CardHeader as BaseCardHeader,
	CardTitle as BaseCardTitle,
} from "@control-panel/ui/components/card";
import { cn } from "@control-panel/ui/lib/utils";
import type { ComponentProps } from "react";

function Card({ className, ...props }: ComponentProps<typeof BaseCard>) {
	return <BaseCard className={cn("rounded-sm!", className)} {...props} />;
}

function CardFooter({
	className,
	...props
}: ComponentProps<typeof BaseCardFooter>) {
	return <BaseCardFooter className={cn("rounded-sm!", className)} {...props} />;
}

const CardAction = BaseCardAction;
const CardContent = BaseCardContent;
const CardDescription = BaseCardDescription;
const CardHeader = BaseCardHeader;
const CardTitle = BaseCardTitle;

export {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
};
