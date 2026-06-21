import {
	DropdownMenu as BaseDropdownMenu,
	DropdownMenuCheckboxItem as BaseDropdownMenuCheckboxItem,
	DropdownMenuContent as BaseDropdownMenuContent,
	DropdownMenuGroup as BaseDropdownMenuGroup,
	DropdownMenuItem as BaseDropdownMenuItem,
	DropdownMenuLabel as BaseDropdownMenuLabel,
	DropdownMenuPortal as BaseDropdownMenuPortal,
	DropdownMenuRadioGroup as BaseDropdownMenuRadioGroup,
	DropdownMenuRadioItem as BaseDropdownMenuRadioItem,
	DropdownMenuSeparator as BaseDropdownMenuSeparator,
	DropdownMenuShortcut as BaseDropdownMenuShortcut,
	DropdownMenuSub as BaseDropdownMenuSub,
	DropdownMenuSubContent as BaseDropdownMenuSubContent,
	DropdownMenuSubTrigger as BaseDropdownMenuSubTrigger,
	DropdownMenuTrigger as BaseDropdownMenuTrigger,
} from "@control-panel/ui/components/dropdown-menu";
import { cn } from "@control-panel/ui/lib/utils";
import type { ComponentProps } from "react";

function DropdownMenuContent({
	className,
	...props
}: ComponentProps<typeof BaseDropdownMenuContent>) {
	return (
		<BaseDropdownMenuContent
			className={cn("rounded-sm!", className)}
			{...props}
		/>
	);
}

function DropdownMenuItem({
	className,
	...props
}: ComponentProps<typeof BaseDropdownMenuItem>) {
	return (
		<BaseDropdownMenuItem className={cn("rounded-sm!", className)} {...props} />
	);
}

function DropdownMenuCheckboxItem({
	className,
	...props
}: ComponentProps<typeof BaseDropdownMenuCheckboxItem>) {
	return (
		<BaseDropdownMenuCheckboxItem
			className={cn("rounded-sm!", className)}
			{...props}
		/>
	);
}

function DropdownMenuRadioItem({
	className,
	...props
}: ComponentProps<typeof BaseDropdownMenuRadioItem>) {
	return (
		<BaseDropdownMenuRadioItem
			className={cn("rounded-sm!", className)}
			{...props}
		/>
	);
}

function DropdownMenuSubTrigger({
	className,
	...props
}: ComponentProps<typeof BaseDropdownMenuSubTrigger>) {
	return (
		<BaseDropdownMenuSubTrigger
			className={cn("rounded-sm!", className)}
			{...props}
		/>
	);
}

function DropdownMenuSubContent({
	className,
	...props
}: ComponentProps<typeof BaseDropdownMenuSubContent>) {
	return (
		<BaseDropdownMenuSubContent
			className={cn("rounded-sm!", className)}
			{...props}
		/>
	);
}

const DropdownMenu = BaseDropdownMenu;
const DropdownMenuGroup = BaseDropdownMenuGroup;
const DropdownMenuLabel = BaseDropdownMenuLabel;
const DropdownMenuPortal = BaseDropdownMenuPortal;
const DropdownMenuRadioGroup = BaseDropdownMenuRadioGroup;
const DropdownMenuSeparator = BaseDropdownMenuSeparator;
const DropdownMenuShortcut = BaseDropdownMenuShortcut;
const DropdownMenuSub = BaseDropdownMenuSub;
const DropdownMenuTrigger = BaseDropdownMenuTrigger;

export {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
};
