import { useQuery } from "@tanstack/react-query";

import { Loader } from "@/components/loader";
import { SignInForm } from "@/components/sign-in-form";
import { SignUpForm } from "@/components/sign-up-form";
import { needsSetupQuery } from "@/data/queries";

export function LoginPage() {
	const { data, isLoading } = useQuery(needsSetupQuery());

	if (isLoading) {
		return (
			<main className="grid min-h-screen place-items-center px-4 py-10">
				<Loader />
			</main>
		);
	}

	if (data?.needsSetup) {
		// First run: no admin yet — show owner-creation form with no toggle back to sign-in
		return (
			<main className="grid min-h-screen place-items-center px-4 py-10">
				<SignUpForm ownerSetup />
			</main>
		);
	}

	// Admin exists: registration is closed — sign-in only, no "Create one" CTA
	return (
		<main className="grid min-h-screen place-items-center px-4 py-10">
			<SignInForm />
		</main>
	);
}
