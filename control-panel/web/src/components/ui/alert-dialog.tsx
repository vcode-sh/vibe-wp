import {
	AlertDialog as BaseAlertDialog,
	AlertDialogAction as BaseAlertDialogAction,
	AlertDialogCancel as BaseAlertDialogCancel,
	AlertDialogContent as BaseAlertDialogContent,
	AlertDialogDescription as BaseAlertDialogDescription,
	AlertDialogFooter as BaseAlertDialogFooter,
	AlertDialogHeader as BaseAlertDialogHeader,
	AlertDialogMedia as BaseAlertDialogMedia,
	AlertDialogOverlay as BaseAlertDialogOverlay,
	AlertDialogPortal as BaseAlertDialogPortal,
	AlertDialogTitle as BaseAlertDialogTitle,
	AlertDialogTrigger as BaseAlertDialogTrigger,
} from "@control-panel/ui/components/alert-dialog";
import { cn } from "@control-panel/ui/lib/utils";
import type { ComponentProps } from "react";

function AlertDialogContent({
	className,
	...props
}: ComponentProps<typeof BaseAlertDialogContent>) {
	return (
		<BaseAlertDialogContent
			className={cn("rounded-sm!", className)}
			{...props}
		/>
	);
}

function AlertDialogAction({
	className,
	...props
}: ComponentProps<typeof BaseAlertDialogAction>) {
	return (
		<BaseAlertDialogAction
			className={cn("rounded-sm!", className)}
			{...props}
		/>
	);
}

function AlertDialogCancel({
	className,
	...props
}: ComponentProps<typeof BaseAlertDialogCancel>) {
	return (
		<BaseAlertDialogCancel
			className={cn("rounded-sm!", className)}
			{...props}
		/>
	);
}

const AlertDialog = BaseAlertDialog;
const AlertDialogDescription = BaseAlertDialogDescription;
const AlertDialogFooter = BaseAlertDialogFooter;
const AlertDialogHeader = BaseAlertDialogHeader;
const AlertDialogMedia = BaseAlertDialogMedia;
const AlertDialogOverlay = BaseAlertDialogOverlay;
const AlertDialogPortal = BaseAlertDialogPortal;
const AlertDialogTitle = BaseAlertDialogTitle;
const AlertDialogTrigger = BaseAlertDialogTrigger;

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
};
