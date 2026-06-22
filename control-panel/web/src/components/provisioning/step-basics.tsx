import { Input } from "@/components/ui/input";
import { FieldRow } from "./field-row";
import type { Errors } from "./validation";
import type { WizardForm } from "./wizard-types";

/** Step 1 — domain, optional site title, and admin email. */
export function StepBasics({
	form,
	errors,
	set,
}: {
	form: WizardForm;
	errors: Errors;
	set: <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => void;
}) {
	return (
		<div className="grid gap-5">
			<FieldRow
				error={errors.domain}
				hint="Point DNS for this domain at this VPS before you continue."
				label="Production domain"
			>
				{(id) => (
					<Input
						autoCapitalize="none"
						autoComplete="off"
						autoCorrect="off"
						autoFocus
						id={id}
						onChange={(e) => set("domain", e.target.value)}
						placeholder="example.com"
						spellCheck={false}
						value={form.domain}
					/>
				)}
			</FieldRow>

			<FieldRow
				error={errors.siteTitle}
				hint="Optional. Shown in the WordPress admin and emails."
				label="Site title"
			>
				{(id) => (
					<Input
						id={id}
						onChange={(e) => set("siteTitle", e.target.value)}
						placeholder="My Vibe WP site"
						value={form.siteTitle}
					/>
				)}
			</FieldRow>

			<FieldRow
				error={errors.adminEmail}
				hint="Receives the admin login and site notifications."
				label="Admin email"
			>
				{(id) => (
					<Input
						autoCapitalize="none"
						autoComplete="off"
						id={id}
						onChange={(e) => set("adminEmail", e.target.value)}
						placeholder="you@yourdomain.com"
						type="email"
						value={form.adminEmail}
					/>
				)}
			</FieldRow>
		</div>
	);
}
