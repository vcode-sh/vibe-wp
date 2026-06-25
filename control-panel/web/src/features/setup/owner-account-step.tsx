/**
 * Step 1 of the first-run onboarding wizard: "Create your owner account".
 *
 * Collects email + password (with a strength meter) + a confirm field, validated
 * client-side with the SAME passwordSchema the server enforces. On submit it
 * calls the guarded completeSetup procedure, then immediately signs the new owner
 * in on the canonical /api/auth path to establish the session cookie. The
 * password is passed once to completeSetup and once to signIn over same-origin
 * HTTPS; it is never logged.
 */
import { Label } from "@control-panel/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordField } from "@/components/users/password-field";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc/client";
import { passwordSchema } from "@/lib/password";

const GENERIC_ERROR =
	"We couldn't create your account. Check your details and try again.";
// The server reports this when the panel was already set up — the owner belongs
// on the login screen, not the create-account step.
const ALREADY_SETUP_RE = /already complete/i;

export function OwnerAccountStep({ onComplete }: { onComplete: () => void }) {
	const [confirm, setConfirm] = useState("");
	const navigate = useNavigate();
	const completeSetup = useMutation(orpc.completeSetup.mutationOptions());

	const form = useForm({
		defaultValues: { name: "", email: "", password: "" },
		validators: {
			onSubmit: z.object({
				name: z.string().min(2, "Tell us what to call you (2+ characters)"),
				email: z.email("Enter a valid email address"),
				password: passwordSchema,
			}),
		},
		onSubmit: async ({ value }) => {
			if (value.password !== confirm) {
				toast.error("Passwords don't match. Re-type them to be sure.");
				return;
			}
			try {
				await completeSetup.mutateAsync({
					email: value.email,
					password: value.password,
					name: value.name,
				});
			} catch (err) {
				// Surface the server's specific reason ("email already registered",
				// "Setup is already complete.") instead of a generic message that
				// loops the owner forever. If the panel is already set up, send them
				// to the login screen — there's nothing to create here.
				const message =
					err instanceof Error && err.message ? err.message : GENERIC_ERROR;
				toast.error(message);
				if (ALREADY_SETUP_RE.test(message)) {
					navigate({ to: "/login" });
				}
				return;
			}
			// Owner created — establish the session cookie via the canonical auth path.
			const signedIn = await authClient.signIn.email({
				email: value.email,
				password: value.password,
			});
			if (signedIn.error) {
				toast.error(
					"Account created, but automatic sign-in failed. Try signing in."
				);
				return;
			}
			toast.success("Your owner account is ready.");
			onComplete();
		},
	});

	const passwordsMismatch = (value: string) =>
		confirm.length > 0 && value !== confirm ? "Passwords don't match" : null;

	return (
		<div className="grid gap-5">
			<div className="grid gap-1.5">
				<h2 className="font-semibold text-xl">Create your owner account</h2>
				<p className="text-muted-foreground text-sm">
					This is the very first account — it becomes the panel owner with full
					control. There are no default logins, so pick credentials only you
					know.
				</p>
			</div>

			<form
				className="grid gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<form.Field name="name">
					{(field) => (
						<div className="grid gap-1.5">
							<Label htmlFor={field.name}>Your name</Label>
							<Input
								autoComplete="name"
								id={field.name}
								name={field.name}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="Jane Owner"
								value={field.state.value}
							/>
							{field.state.meta.errors.map((error) => (
								<p className="text-destructive text-sm" key={error?.message}>
									{error?.message}
								</p>
							))}
						</div>
					)}
				</form.Field>

				<form.Field name="email">
					{(field) => (
						<div className="grid gap-1.5">
							<Label htmlFor={field.name}>Email address</Label>
							<Input
								autoComplete="email"
								id={field.name}
								name={field.name}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="you@example.com"
								type="email"
								value={field.state.value}
							/>
							<p className="text-muted-foreground text-xs">
								You'll sign in with this email.
							</p>
							{field.state.meta.errors.map((error) => (
								<p className="text-destructive text-sm" key={error?.message}>
									{error?.message}
								</p>
							))}
						</div>
					)}
				</form.Field>

				<form.Field name="password">
					{(field) => (
						<div className="grid gap-1.5">
							<PasswordField
								autoComplete="new-password"
								id={field.name}
								label="Password"
								onChange={(v) => field.handleChange(v)}
								placeholder="At least 8 characters"
								showStrength
								value={field.state.value}
							/>
							{field.state.meta.errors.map((error) => (
								<p className="text-destructive text-sm" key={error?.message}>
									{error?.message}
								</p>
							))}
						</div>
					)}
				</form.Field>

				<form.Subscribe selector={(state) => state.values.password}>
					{(password) => (
						<div className="grid gap-1.5">
							<PasswordField
								autoComplete="new-password"
								id="confirm-password"
								label="Confirm password"
								onChange={setConfirm}
								placeholder="Re-type your password"
								value={confirm}
							/>
							{passwordsMismatch(password) ? (
								<p className="text-destructive text-sm">
									{passwordsMismatch(password)}
								</p>
							) : null}
						</div>
					)}
				</form.Subscribe>

				<form.Subscribe
					selector={(state) => ({
						canSubmit: state.canSubmit,
						isSubmitting: state.isSubmitting,
					})}
				>
					{({ canSubmit, isSubmitting }) => (
						<Button
							className="w-full"
							disabled={!canSubmit || isSubmitting}
							type="submit"
						>
							{isSubmitting ? "Creating your account…" : "Create owner account"}
						</Button>
					)}
				</form.Subscribe>
			</form>
		</div>
	);
}
