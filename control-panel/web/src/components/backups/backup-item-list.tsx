import { File, Folder, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { BackupFileEntry } from "@/data/types";

/** Human-readable byte size; "—" for unknown/zero so empty meta reads cleanly. */
export function formatBytes(bytes: number): string {
	if (bytes <= 0) {
		return "—";
	}
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1_048_576) {
		return `${Math.round(bytes / 1024)} KB`;
	}
	return `${Math.round((bytes / 1_048_576) * 10) / 10} MB`;
}

/** Group files by their top-level directory for a shallow, scannable tree. */
function groupFiles(files: BackupFileEntry[]): [string, BackupFileEntry[]][] {
	const groups = new Map<string, BackupFileEntry[]>();
	for (const f of files) {
		const slash = f.path.indexOf("/");
		const top = slash === -1 ? "(root)" : f.path.slice(0, slash);
		const list = groups.get(top) ?? [];
		list.push(f);
		groups.set(top, list);
	}
	return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function ItemRow({
	label,
	meta,
	icon,
	canRestore,
	restoreHint,
	onRestore,
}: {
	label: string;
	meta?: string;
	icon: React.ReactNode;
	canRestore: boolean;
	restoreHint: string;
	onRestore: () => void;
}) {
	return (
		<div className="flex items-center justify-between gap-2 py-1 pl-6 text-sm">
			<span className="flex min-w-0 items-center gap-2">
				{icon}
				<span className="truncate" title={label}>
					{label}
				</span>
			</span>
			<span className="flex shrink-0 items-center gap-3">
				{meta ? (
					<span className="text-muted-foreground text-xs">{meta}</span>
				) : null}
				{canRestore ? (
					<Button
						onClick={onRestore}
						size="sm"
						title={restoreHint}
						variant="ghost"
					>
						Restore this item…
					</Button>
				) : null}
			</span>
		</div>
	);
}

/** Files tab: searchable, directory-grouped, single-file restore per row. */
export function FileList({
	files,
	truncated,
	canRestore,
	onRestore,
}: {
	files: BackupFileEntry[];
	truncated: boolean;
	canRestore: boolean;
	onRestore: (path: string) => void;
}) {
	const [query, setQuery] = useState("");
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files;
	}, [files, query]);
	const grouped = useMemo(() => groupFiles(filtered), [filtered]);

	return (
		<div className="grid gap-2">
			<div className="flex items-center gap-2">
				<Input
					aria-label="Search files"
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search files by name or path…"
					value={query}
				/>
				{truncated ? (
					<Badge variant="secondary">Listing capped — large tree</Badge>
				) : null}
			</div>
			<ScrollArea className="h-80 rounded-md border border-border">
				<div className="p-2">
					{grouped.map(([dir, group]) => (
						<div className="mb-2" key={dir}>
							<span className="flex items-center gap-2 font-medium text-sm">
								<Folder className="size-4 text-muted-foreground" />
								{dir}
							</span>
							{group.map((f) => (
								<ItemRow
									canRestore={canRestore}
									icon={
										<File className="size-3.5 shrink-0 text-muted-foreground" />
									}
									key={f.path}
									label={f.path}
									meta={formatBytes(f.bytes)}
									onRestore={() => onRestore(f.path)}
									restoreHint={`Replace the live wp-content/${f.path} with this backup's copy`}
								/>
							))}
						</div>
					))}
					{filtered.length === 0 ? (
						<p className="p-4 text-center text-muted-foreground text-sm">
							{files.length === 0
								? "No files in this backup."
								: "No files match your search."}
						</p>
					) : null}
				</div>
			</ScrollArea>
		</div>
	);
}

/** Tables tab: searchable list of DB table names, single-table restore per row. */
export function TableList({
	tables,
	canRestore,
	onRestore,
}: {
	tables: string[];
	canRestore: boolean;
	onRestore: (name: string) => void;
}) {
	const [query, setQuery] = useState("");
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return q ? tables.filter((t) => t.toLowerCase().includes(q)) : tables;
	}, [tables, query]);

	return (
		<div className="grid gap-2">
			<Input
				aria-label="Search tables"
				onChange={(e) => setQuery(e.target.value)}
				placeholder="Search tables by name…"
				value={query}
			/>
			<ScrollArea className="h-80 rounded-md border border-border">
				<div className="p-2">
					{filtered.map((t) => (
						<ItemRow
							canRestore={canRestore}
							icon={
								<Table2 className="size-3.5 shrink-0 text-muted-foreground" />
							}
							key={t}
							label={t}
							onRestore={() => onRestore(t)}
							restoreHint={`Replace the live "${t}" table with this backup's copy`}
						/>
					))}
					{filtered.length === 0 ? (
						<p className="p-4 text-center text-muted-foreground text-sm">
							{tables.length === 0
								? "No tables in this backup."
								: "No tables match your search."}
						</p>
					) : null}
				</div>
			</ScrollArea>
		</div>
	);
}
