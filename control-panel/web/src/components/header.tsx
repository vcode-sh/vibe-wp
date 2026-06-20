import { Link } from "@tanstack/react-router";
import { Server } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
	const links = [
		{ to: "/", label: "Overview" },
		{ to: "/dashboard", label: "Operations" },
	] as const;

	return (
		<header className="border-border border-b bg-background/95">
			<div className="mx-auto flex h-14 max-w-6xl flex-row items-center justify-between px-4">
				<div className="flex items-center gap-3">
					<div className="flex size-8 items-center justify-center border border-border bg-card text-primary">
						<Server className="size-4" />
					</div>
					<div>
						<div className="font-semibold text-sm">Vibe WP</div>
						<div className="text-muted-foreground text-xs">Control Panel</div>
					</div>
				</div>
				<nav className="flex gap-1 text-sm">
					{links.map(({ to, label }) => (
						<Link
							activeProps={{ className: "bg-muted text-foreground" }}
							className="px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
							key={to}
							to={to}
						>
							{label}
						</Link>
					))}
				</nav>
				<div className="flex items-center gap-2">
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
