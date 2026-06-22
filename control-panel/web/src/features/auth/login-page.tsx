import { useState } from "react";

import { SignInForm } from "@/components/sign-in-form";
import { SignUpForm } from "@/components/sign-up-form";

export function LoginPage() {
	const [showSignIn, setShowSignIn] = useState(true);

	return (
		<main className="grid min-h-screen place-items-center px-4 py-10">
			{showSignIn ? (
				<SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
			) : (
				<SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
			)}
		</main>
	);
}
