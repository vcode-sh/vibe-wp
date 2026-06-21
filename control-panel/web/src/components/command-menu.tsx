import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@control-panel/ui/components/command";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { sitesQuery } from "@/data/queries";

export function CommandMenu() {
	const [open, setOpen] = useState(false);
	const navigate = useNavigate();
	const sites = useQuery(sitesQuery());

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((o) => !o);
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	return (
		<CommandDialog onOpenChange={setOpen} open={open}>
			<CommandInput placeholder="Jump to a site or page…" />
			<CommandList>
				<CommandEmpty>No results.</CommandEmpty>
				<CommandGroup heading="Sites">
					{sites.data?.map((s) => (
						<CommandItem
							key={s.id}
							onSelect={() => {
								navigate({
									to: "/sites/$siteId/overview",
									params: { siteId: s.id },
								});
								setOpen(false);
							}}
							value={s.name}
						>
							{s.name}
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
