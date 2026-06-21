import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "@control-panel/ui/components/breadcrumb";
import { Separator } from "@control-panel/ui/components/separator";
import { SidebarTrigger } from "@control-panel/ui/components/sidebar";

import { ModeToggle } from "@/components/mode-toggle";

export function TopBar({ crumbs }: { crumbs: string[] }) {
	return (
		<header className="flex h-14 shrink-0 items-center gap-2 border-border border-b px-4">
			<SidebarTrigger className="-ml-1" />
			<Separator className="mr-1 h-4" orientation="vertical" />
			<Breadcrumb>
				<BreadcrumbList>
					{crumbs.map((c, i) => (
						<BreadcrumbItem key={c}>
							<BreadcrumbPage
								className={
									i === crumbs.length - 1
										? "text-foreground"
										: "text-muted-foreground"
								}
							>
								{c}
							</BreadcrumbPage>
						</BreadcrumbItem>
					))}
				</BreadcrumbList>
			</Breadcrumb>
			<div className="ml-auto flex items-center gap-2">
				<ModeToggle />
			</div>
		</header>
	);
}
