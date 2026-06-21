import {
	Dialog as BaseDialog,
	DialogClose as BaseDialogClose,
	DialogContent as BaseDialogContent,
	DialogDescription as BaseDialogDescription,
	DialogFooter as BaseDialogFooter,
	DialogHeader as BaseDialogHeader,
	DialogOverlay as BaseDialogOverlay,
	DialogPortal as BaseDialogPortal,
	DialogTitle as BaseDialogTitle,
	DialogTrigger as BaseDialogTrigger,
} from "@control-panel/ui/components/dialog";
import { cn } from "@control-panel/ui/lib/utils";
import type { ComponentProps } from "react";

function DialogContent({
	className,
	...props
}: ComponentProps<typeof BaseDialogContent>) {
	return (
		<BaseDialogContent className={cn("rounded-sm!", className)} {...props} />
	);
}

const Dialog = BaseDialog;
const DialogClose = BaseDialogClose;
const DialogDescription = BaseDialogDescription;
const DialogFooter = BaseDialogFooter;
const DialogHeader = BaseDialogHeader;
const DialogOverlay = BaseDialogOverlay;
const DialogPortal = BaseDialogPortal;
const DialogTitle = BaseDialogTitle;
const DialogTrigger = BaseDialogTrigger;

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
