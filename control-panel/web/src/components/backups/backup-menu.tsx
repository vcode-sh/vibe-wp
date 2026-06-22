import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { backupConfigQuery } from "@/data/queries";

type MaskedRow = Record<string, unknown> | null;

interface BackupMenuProps {
	disabled: boolean;
	onSelect: (destination: "local" | "both") => void;
	siteId: string;
}

function isOffsiteReady(site: MaskedRow, global: MaskedRow): boolean {
	return (
		site?.enabled === 1 &&
		Boolean(global?.hasSecret) &&
		Boolean(global?.endpoint) &&
		Boolean(global?.bucket)
	);
}

export function BackupMenu({ siteId, disabled, onSelect }: BackupMenuProps) {
	const configQuery = useQuery({
		...backupConfigQuery(siteId),
		retry: false,
	});

	// off-site is ready when R2 is enabled for this site and the global creds are complete
	const cfg = configQuery.data;
	const offsiteReady = isOffsiteReady(cfg?.site ?? null, cfg?.global ?? null);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled}
				render={<Button disabled={disabled} />}
			>
				Back up now
				<ChevronDown className="ml-1.5 size-3.5 opacity-70" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => onSelect("local")}>
					Local only
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					disabled={!offsiteReady}
					onClick={() => (offsiteReady ? onSelect("both") : undefined)}
				>
					Local + off-site
					{offsiteReady ? null : (
						<span className="ml-auto text-muted-foreground text-xs">
							Configure R2 in Settings
						</span>
					)}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
