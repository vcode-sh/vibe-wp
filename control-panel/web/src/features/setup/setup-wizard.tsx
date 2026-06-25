/**
 * First-run onboarding wizard (/setup). A friendly 3-step flow for a brand-new,
 * possibly non-technical owner landing on a fresh install:
 *   1. Create your owner account  (guarded completeSetup → auto sign-in)
 *   2. Your control panel address (live HTTPS URL + custom-domain DNS guidance)
 *   3. You're all set             (create your first site)
 *
 * Routing guards (setup.tsx + _auth/route.tsx) keep this reachable only while
 * the panel still needs an owner; the server-side completeSetup guard is the
 * real defense. Styling uses shadcn primitives + semantic tokens only.
 */
import { cn } from "@control-panel/ui/lib/utils";
import { useState } from "react";

import { AllSetStep } from "./all-set-step";
import { OwnerAccountStep } from "./owner-account-step";
import { PanelAddressStep } from "./panel-address-step";

const STEPS = [
	{ key: "account", label: "Owner account" },
	{ key: "address", label: "Panel address" },
	{ key: "done", label: "All set" },
] as const;

function StepIndicator({ current }: { current: number }) {
	return (
		<ol className="flex items-center justify-center gap-2">
			{STEPS.map((step, index) => (
				<li className="flex items-center gap-2" key={step.key}>
					<span
						className={cn(
							"flex size-7 items-center justify-center rounded-full border font-medium text-xs",
							index < current &&
								"border-primary bg-primary text-primary-foreground",
							index === current && "border-primary text-primary",
							index > current && "border-border text-muted-foreground"
						)}
					>
						{index + 1}
					</span>
					<span
						className={cn(
							"hidden text-xs sm:inline",
							index === current
								? "font-medium text-foreground"
								: "text-muted-foreground"
						)}
					>
						{step.label}
					</span>
					{index < STEPS.length - 1 ? (
						<span className="hidden h-px w-6 bg-border sm:inline-block" />
					) : null}
				</li>
			))}
		</ol>
	);
}

export function SetupWizard() {
	const [step, setStep] = useState(0);

	return (
		<main className="grid min-h-screen place-items-center px-4 py-10">
			<div className="grid w-full max-w-lg gap-8">
				<header className="grid gap-2 text-center">
					<h1 className="font-semibold text-2xl">Welcome to Vibe WP</h1>
					<p className="text-muted-foreground text-sm">
						Let's get your control panel set up. It only takes a minute.
					</p>
				</header>

				<StepIndicator current={step} />

				<div className="rounded-lg border bg-card p-6 shadow-sm">
					{step === 0 ? (
						<OwnerAccountStep onComplete={() => setStep(1)} />
					) : null}
					{step === 1 ? (
						<PanelAddressStep
							onBack={() => setStep(0)}
							onContinue={() => setStep(2)}
						/>
					) : null}
					{step === 2 ? <AllSetStep /> : null}
				</div>
			</div>
		</main>
	);
}
