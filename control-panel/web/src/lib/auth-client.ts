import { ac, roles } from "@control-panel/auth/access";
import { env } from "@control-panel/env/web";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// `adminClient` exposes `authClient.admin.*` (listUsers/createUser/setRole/
// removeUser/banUser). We pass the SAME `ac`/`roles` the server builds (shared
// via @control-panel/auth/access — a server-free module) so the role argument
// of setRole/createUser is typed as viewer/operator/admin, matching what the
// server enforces. The server still authorizes every admin action; the panel
// only gates the Team tab on `session.user.role === "admin"`.
// `inferAdditionalFields` types the server-only `role` field onto session.user.
// `role` is declared `input: false` to mirror the server (output-only), so
// public sign-up does not gain a required `role` field.
export const authClient = createAuthClient({
	baseURL: env.VITE_SERVER_URL,
	plugins: [
		adminClient({ ac, roles }),
		inferAdditionalFields({
			user: { role: { type: "string", input: false } },
		}),
	],
});
