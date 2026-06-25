import { Label } from "@control-panel/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { Database, HardDrive, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { sharedDbStatusQuery } from "@/data/queries";
import type { DbMode, WizardForm } from "./wizard-types";

function OptionCard({
	icon: Icon,
	title,
	description,
	selected,
	disabled,
	onSelect,
	footer,
}: {
	icon: typeof Database;
	title: string;
	description: string;
	selected: boolean;
	disabled?: boolean;
	onSelect: () => void;
	footer?: ReactNode;
}) {
	const base =
		"flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors";
	const state = selected
		? "border-primary bg-primary/5"
		: "border-border hover:border-primary/50";
	const off = disabled
		? "cursor-not-allowed opacity-60 hover:border-border"
		: "";
	return (
		<button
			aria-pressed={selected}
			className={`${base} ${state} ${off}`}
			disabled={disabled}
			onClick={onSelect}
			type="button"
		>
			<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
				<Icon className="size-4" />
			</span>
			<span className="grid gap-1">
				<Label className="font-medium">{title}</Label>
				<span className="text-muted-foreground text-xs">{description}</span>
				{footer}
			</span>
		</button>
	);
}

/** Step — choose where the new site's database lives. The shared option is only
 * selectable when the global MariaDB project reports healthy; otherwise it is
 * disabled with a hint pointing at Settings. */
export function StepDatabase({
	form,
	set,
}: {
	form: WizardForm;
	set: <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => void;
}) {
	const status = useQuery(sharedDbStatusQuery());
	const sharedHealthy = status.data?.healthy === true;
	const sharedDisabled = !sharedHealthy;

	const pick = (mode: DbMode) => () => {
		if (mode === "shared" && sharedDisabled) {
			return;
		}
		set("dbMode", mode);
	};

	return (
		<div className="grid gap-3">
			<p className="text-muted-foreground text-sm">
				Choose where this site stores its data. You can change this later only
				by recreating the site.
			</p>

			<OptionCard
				description="A private MariaDB container just for this site. Best isolation; the recommended default."
				icon={HardDrive}
				onSelect={pick("dedicated")}
				selected={form.dbMode === "dedicated"}
				title="Dedicated container"
			/>

			<OptionCard
				description="Provision this site onto the one shared MariaDB server. Lower memory per site; the shared server must be healthy."
				disabled={sharedDisabled}
				footer={
					sharedDisabled ? (
						<span className="text-warning text-xs">
							{status.isLoading ? (
								<span className="inline-flex items-center gap-1">
									<Loader2 className="size-3 animate-spin" />
									Checking shared database…
								</span>
							) : (
								"Initialize the shared database in Settings first."
							)}
						</span>
					) : null
				}
				icon={Database}
				onSelect={pick("shared")}
				selected={form.dbMode === "shared"}
				title="Shared database"
			/>
		</div>
	);
}
