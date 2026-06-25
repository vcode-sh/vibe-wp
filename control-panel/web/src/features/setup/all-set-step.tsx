/**
 * Step 3 of the onboarding wizard: "You're all set". The owner is created and
 * signed in. We point them straight at the existing create-site wizard as the
 * obvious next action, with a quieter link to the dashboard.
 */
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, LayoutDashboard, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AllSetStep() {
	const navigate = useNavigate();

	return (
		<div className="grid gap-6 text-center">
			<div className="grid justify-items-center gap-2">
				<CheckCircle2 className="size-12 text-primary" />
				<h2 className="font-semibold text-xl">You're all set</h2>
				<p className="max-w-sm text-muted-foreground text-sm">
					Your panel is ready and you're signed in as the owner. The natural
					next step is to create your first WordPress site.
				</p>
			</div>

			<div className="grid gap-3">
				<Button
					className="w-full"
					onClick={() =>
						navigate({ to: "/sites/new", search: { mode: "standard" } })
					}
					size="lg"
				>
					<Rocket className="size-4" />
					Create your first site
				</Button>
				<Button
					className="w-full"
					onClick={() => navigate({ to: "/sites" })}
					variant="ghost"
				>
					<LayoutDashboard className="size-4" />
					Go to the dashboard
				</Button>
			</div>
		</div>
	);
}
