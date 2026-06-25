import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StepBasics } from "./step-basics";
import { StepDatabase } from "./step-database";
import { StepExternal } from "./step-external";
import { StepOptions } from "./step-options";
import { StepReview } from "./step-review";
import { useProvisionWizard } from "./use-provision-wizard";
import type { ProvisionMode, StepKey } from "./wizard-types";

const STEP_LABELS: Record<StepKey, string> = {
	basics: "Basics",
	database: "Database",
	options: "Options",
	external: "External services",
	review: "Review",
};

function badgeClasses(active: boolean, done: boolean): string {
	if (active) {
		return "border-primary bg-primary text-primary-foreground";
	}
	if (done) {
		return "border-success bg-success text-background";
	}
	return "border-border text-muted-foreground";
}

function Stepper({ steps, index }: { steps: StepKey[]; index: number }) {
	return (
		<ol className="flex flex-wrap items-center gap-2 text-sm">
			{steps.map((key, i) => {
				const done = i < index;
				const active = i === index;
				return (
					<li className="flex items-center gap-2" key={key}>
						<span
							className={`flex size-6 items-center justify-center rounded-full border text-xs ${badgeClasses(active, done)}`}
						>
							{done ? <Check className="size-3.5" /> : i + 1}
						</span>
						<span className={active ? "font-medium" : "text-muted-foreground"}>
							{STEP_LABELS[key]}
						</span>
						{i < steps.length - 1 ? (
							<span className="text-muted-foreground">/</span>
						) : null}
					</li>
				);
			})}
		</ol>
	);
}

/** The full new-site wizard chrome; `mode` adds the external-services step. */
export function ProvisionWizard({ mode }: { mode: ProvisionMode }) {
	const w = useProvisionWizard(mode);

	return (
		<Card>
			<CardContent className="grid gap-6 py-6">
				<Stepper index={w.index} steps={w.steps} />

				{w.step === "basics" ? (
					<StepBasics errors={w.errors} form={w.form} set={w.set} />
				) : null}
				{w.step === "database" ? (
					<StepDatabase form={w.form} set={w.set} />
				) : null}
				{w.step === "options" ? (
					<StepOptions errors={w.errors} form={w.form} set={w.set} />
				) : null}
				{w.step === "external" ? (
					<StepExternal errors={w.errors} form={w.form} set={w.set} />
				) : null}
				{w.step === "review" ? <StepReview form={w.form} mode={mode} /> : null}

				<div className="flex items-center justify-between">
					<Button
						disabled={w.index === 0 || w.submitting || w.started}
						onClick={w.back}
						variant="ghost"
					>
						<ArrowLeft className="mr-1.5 size-4" />
						Back
					</Button>

					{w.isLast ? (
						<Button
							disabled={!w.valid || w.submitting || w.started}
							onClick={w.submit}
						>
							{w.submitting || w.started ? (
								<Loader2 className="mr-1.5 size-4 animate-spin" />
							) : (
								<Check className="mr-1.5 size-4" />
							)}
							Create site
						</Button>
					) : (
						<Button onClick={w.next}>
							Next
							<ArrowRight className="ml-1.5 size-4" />
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
