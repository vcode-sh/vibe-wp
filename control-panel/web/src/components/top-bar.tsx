import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@control-panel/ui/components/breadcrumb";
import { Separator } from "@control-panel/ui/components/separator";
import { Fragment } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function TopBar({ crumbs }: { crumbs: string[] }) {
	return (
		<header className="flex h-14 shrink-0 items-center gap-2 border-border border-b px-4">
			<SidebarTrigger className="-ml-1" />
			<Separator className="mx-1" orientation="vertical" />
			<Breadcrumb>
				<BreadcrumbList>
					{crumbs.map((c, i) => (
						<Fragment key={c}>
							{i > 0 && <BreadcrumbSeparator />}
							<BreadcrumbItem>
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
						</Fragment>
					))}
				</BreadcrumbList>
			</Breadcrumb>
			<div className="ml-auto flex items-center gap-2">
				<ModeToggle />
			</div>
		</header>
	);
}
