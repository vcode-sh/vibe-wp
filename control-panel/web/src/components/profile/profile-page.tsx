/**
 * Profile page — self-service account management for any signed-in user: edit
 * display name, change password, and manage active sessions. Reached from the
 * sidebar user menu.
 */
import { PageHeader } from "@/components/patterns/page-header";
import { TopBar } from "@/components/top-bar";
import { ChangePasswordCard } from "./change-password-card";
import { ProfileDetailsCard } from "./profile-details-card";
import { SessionsCard } from "./sessions-card";

export function ProfilePage() {
	return (
		<>
			<TopBar crumbs={["Profile"]} />
			<div className="mx-auto grid w-full max-w-2xl gap-4 p-6">
				<PageHeader
					subtitle="Manage your account, password, and signed-in devices."
					title="Profile"
				/>
				<ProfileDetailsCard />
				<ChangePasswordCard />
				<SessionsCard />
			</div>
		</>
	);
}
