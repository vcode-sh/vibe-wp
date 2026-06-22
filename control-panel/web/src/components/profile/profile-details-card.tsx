/**
 * Self-service profile details: edit your display name. Email is shown read-only
 * (changing it would be an identity change handled by an admin). Uses
 * `authClient.updateUser`; the reactive session hook reflects the new name.
 */
import { Label } from "@control-panel/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function ProfileDetailsCard() {
	const { data: session } = authClient.useSession();
	const currentName = session?.user.name ?? "";
	const email = session?.user.email ?? "";
	const [name, setName] = useState(currentName);

	// Keep the field in sync once the session loads / changes elsewhere.
	useEffect(() => {
		setName(currentName);
	}, [currentName]);

	const save = useMutation({
		mutationFn: async () => {
			const res = await authClient.updateUser({ name: name.trim() });
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to update profile.");
			}
		},
		onSuccess: () => toast.success("Profile updated."),
		onError: (err: Error) => toast.error(err.message),
	});

	const dirty = name.trim() !== currentName && name.trim().length > 0;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Profile</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (dirty && !save.isPending) {
							save.mutate();
						}
					}}
				>
					<div className="grid gap-1.5">
						<Label htmlFor="profile-email">Email</Label>
						<Input
							disabled
							id="profile-email"
							readOnly
							type="email"
							value={email}
						/>
						<p className="text-muted-foreground text-xs">
							Contact an admin to change your email.
						</p>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="profile-name">Display name</Label>
						<Input
							autoComplete="name"
							id="profile-name"
							onChange={(e) => setName(e.target.value)}
							placeholder="Your name"
							value={name}
						/>
					</div>
					<div>
						<Button disabled={!dirty || save.isPending} type="submit">
							{save.isPending ? "Saving…" : "Save changes"}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
