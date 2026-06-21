import {
	Sidebar as BaseSidebar,
	SidebarContent as BaseSidebarContent,
	SidebarFooter as BaseSidebarFooter,
	SidebarGroup as BaseSidebarGroup,
	SidebarGroupLabel as BaseSidebarGroupLabel,
	SidebarHeader as BaseSidebarHeader,
	SidebarInput as BaseSidebarInput,
	SidebarInset as BaseSidebarInset,
	SidebarMenu as BaseSidebarMenu,
	SidebarMenuAction as BaseSidebarMenuAction,
	SidebarMenuBadge as BaseSidebarMenuBadge,
	SidebarMenuButton as BaseSidebarMenuButton,
	SidebarMenuItem as BaseSidebarMenuItem,
	SidebarMenuSkeleton as BaseSidebarMenuSkeleton,
	SidebarMenuSub as BaseSidebarMenuSub,
	SidebarMenuSubButton as BaseSidebarMenuSubButton,
	SidebarMenuSubItem as BaseSidebarMenuSubItem,
	SidebarProvider as BaseSidebarProvider,
	SidebarRail as BaseSidebarRail,
	SidebarSeparator as BaseSidebarSeparator,
	SidebarTrigger as BaseSidebarTrigger,
} from "@control-panel/ui/components/sidebar";
import { cn } from "@control-panel/ui/lib/utils";
import type { ComponentProps } from "react";

function SidebarInset({
	className,
	...props
}: ComponentProps<typeof BaseSidebarInset>) {
	return (
		<BaseSidebarInset
			className={cn("md:peer-data-[variant=inset]:rounded-sm!", className)}
			{...props}
		/>
	);
}

function SidebarMenuButton({
	className,
	...props
}: ComponentProps<typeof BaseSidebarMenuButton>) {
	return (
		<BaseSidebarMenuButton
			className={cn("rounded-sm!", className)}
			{...props}
		/>
	);
}

function SidebarMenuSubButton({
	className,
	...props
}: ComponentProps<typeof BaseSidebarMenuSubButton>) {
	return (
		<BaseSidebarMenuSubButton
			className={cn("rounded-sm!", className)}
			{...props}
		/>
	);
}

function SidebarTrigger({
	className,
	...props
}: ComponentProps<typeof BaseSidebarTrigger>) {
	return (
		<BaseSidebarTrigger className={cn("rounded-sm!", className)} {...props} />
	);
}

const Sidebar = BaseSidebar;
const SidebarContent = BaseSidebarContent;
const SidebarFooter = BaseSidebarFooter;
const SidebarGroup = BaseSidebarGroup;
const SidebarGroupLabel = BaseSidebarGroupLabel;
const SidebarHeader = BaseSidebarHeader;
const SidebarInput = BaseSidebarInput;
const SidebarMenu = BaseSidebarMenu;
const SidebarMenuAction = BaseSidebarMenuAction;
const SidebarMenuBadge = BaseSidebarMenuBadge;
const SidebarMenuItem = BaseSidebarMenuItem;
const SidebarMenuSkeleton = BaseSidebarMenuSkeleton;
const SidebarMenuSub = BaseSidebarMenuSub;
const SidebarMenuSubItem = BaseSidebarMenuSubItem;
const SidebarProvider = BaseSidebarProvider;
const SidebarRail = BaseSidebarRail;
const SidebarSeparator = BaseSidebarSeparator;

export {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInput,
	SidebarInset,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarRail,
	SidebarSeparator,
	SidebarTrigger,
};
