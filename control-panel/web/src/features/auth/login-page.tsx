import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";

import { Loader } from "@/components/loader";
import { SignInForm } from "@/components/sign-in-form";
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

	// First run: no owner yet. Onboarding lives at /setup (the single first-run
	// surface), so send the visitor there rather than showing a sign-up form here.
	if (data?.needsSetup) {
		return <Navigate to="/setup" />;
	}

	// Owner exists: registration is closed — sign-in only. A quiet /setup link is
	// kept as a fallback so a confused first-run owner can still find onboarding
	// (the /setup route itself redirects back here once setup is complete).
	return (
		<main className="grid min-h-screen place-items-center px-4 py-10">
			<div className="grid w-full max-w-md gap-4">
				<SignInForm />
				<p className="text-center text-muted-foreground text-sm">
					First time here?{" "}
					<Link className="font-medium text-foreground underline" to="/setup">
						Set up your panel
					</Link>
				</p>
			</div>
		</main>
	);
}
