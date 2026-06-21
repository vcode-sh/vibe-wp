import {
	Tabs as BaseTabs,
	TabsContent as BaseTabsContent,
	TabsList as BaseTabsList,
	TabsTrigger as BaseTabsTrigger,
	tabsListVariants as baseTabsListVariants,
} from "@control-panel/ui/components/tabs";
import { cn } from "@control-panel/ui/lib/utils";
import type { ComponentProps } from "react";

const Tabs = BaseTabs;
const TabsContent = BaseTabsContent;

function TabsList({
	className,
	...props
}: ComponentProps<typeof BaseTabsList>) {
	return <BaseTabsList className={cn("rounded-sm!", className)} {...props} />;
}

function TabsTrigger({
	className,
	...props
}: ComponentProps<typeof BaseTabsTrigger>) {
	return (
		<BaseTabsTrigger className={cn("rounded-sm!", className)} {...props} />
	);
}

const tabsListVariants = baseTabsListVariants;

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
