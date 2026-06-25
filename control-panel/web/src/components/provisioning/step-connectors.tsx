import { KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FieldRow } from "./field-row";
import type { WizardForm } from "./wizard-types";

/**
 * Optional step — AI connector API keys. Every field is OPTIONAL: skip them and
 * add them later in the site's Settings. Keys are masked password inputs sent
 * over TLS and written only to the site's env file (OPENAI_API_KEY /
 * GOOGLE_API_KEY / ANTHROPIC_API_KEY). They are never echoed back, shown in the
 * review step, or logged.
 */
export function StepConnectors({
	form,
	set,
}: {
	form: WizardForm;
	set: <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => void;
}) {
	return (
		<div className="grid gap-5">
			<div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
				<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
					<KeyRound className="size-4" />
				</span>
				<div className="grid gap-0.5">
					<p className="font-medium text-sm">AI connectors (optional)</p>
					<p className="text-muted-foreground text-xs">
						Paste API keys to let this site's AI features work out of the box.
						Every field is optional — skip this and add them later in the site's
						Settings. Keys are stored as secrets and never shown again.
					</p>
				</div>
			</div>

			<FieldRow
				hint="Used for OpenAI models (GPT). Starts with “sk-”."
				label="OpenAI API key"
			>
				{(id) => (
					<Input
						autoCapitalize="none"
						autoComplete="off"
						autoCorrect="off"
						id={id}
						onChange={(e) => set("aiOpenAiKey", e.target.value)}
						placeholder="Optional — leave blank to add later"
						spellCheck={false}
						type="password"
						value={form.aiOpenAiKey}
					/>
				)}
			</FieldRow>

			<FieldRow hint="Used for Google Gemini models." label="Google AI API key">
				{(id) => (
					<Input
						autoCapitalize="none"
						autoComplete="off"
						autoCorrect="off"
						id={id}
						onChange={(e) => set("aiGoogleKey", e.target.value)}
						placeholder="Optional — leave blank to add later"
						spellCheck={false}
						type="password"
						value={form.aiGoogleKey}
					/>
				)}
			</FieldRow>

			<FieldRow
				hint="Used for Anthropic Claude models. Starts with “sk-ant-”."
				label="Anthropic API key"
			>
				{(id) => (
					<Input
						autoCapitalize="none"
						autoComplete="off"
						autoCorrect="off"
						id={id}
						onChange={(e) => set("aiAnthropicKey", e.target.value)}
						placeholder="Optional — leave blank to add later"
						spellCheck={false}
						type="password"
						value={form.aiAnthropicKey}
					/>
				)}
			</FieldRow>
		</div>
	);
}
