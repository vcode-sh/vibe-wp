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

import { sitesQuery } from "@/data/queries";

interface CommandMenuProps {
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

/**
 * Heavy body of the command palette (pulls in cmdk + its Radix dialog stack).
 * Lazy-loaded by `CommandMenuLauncher`, so it is controlled rather than owning
 * its own open state — the launcher keeps the lightweight ⌘K listener.
 */
export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
	const navigate = useNavigate();
	const sites = useQuery(sitesQuery());

	return (
		<CommandDialog onOpenChange={onOpenChange} open={open}>
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
								onOpenChange(false);
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
