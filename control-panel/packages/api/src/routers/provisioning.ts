import { ORPCError } from "@orpc/server";

import type { ProvisionJobRef } from "../contract";
import {
	attachStagingSchema,
	createExternalSchema,
	createSiteSchema,
	removeSiteSchema,
} from "../core-bridge/provision-input";
import { startProvisionJob } from "../core-bridge/provision-job";
import {
	buildAttachStagingState,
	buildCreateExternalState,
	buildCreateSiteState,
	buildRemoveSiteState,
} from "../core-bridge/provision-state";
import { findSite } from "../core-bridge/sites";
import { adminProcedure } from "../procedures";

/**
 * Provisioning router — the panel's reason for existing. Every procedure is
 * admin-gated and returns `{ jobId }` for the operations tray (5c wizards hand
 * the jobId to useOperations().start()). The router DELEGATES to the installer
 * headless core: it builds a complete InstallerState via the baseState bridge +
 * validated overrides, then drives one tracked one-shot provision job. Secrets
 * (ext DB/Redis passwords) live only inside the state object piped on STDIN by
 * the bridge — never argv, never logged.
 */
export const provisioningRouter = {
	createSite: adminProcedure
		.input(createSiteSchema)
		.handler(async ({ input, context }): Promise<ProvisionJobRef> => {
			const state = await buildCreateSiteState(input);
			return startProvisionJob({
				action: "createSite",
				apply: true,
				kind: "provision",
				siteId: String(state.siteSlug ?? input.domain),
				state,
				userId: context.session.user.id,
			});
		}),

	createExternal: adminProcedure
		.input(createExternalSchema)
		.handler(async ({ input, context }): Promise<ProvisionJobRef> => {
			const state = await buildCreateExternalState(input);
			return startProvisionJob({
				action: "createExternal",
				apply: true,
				kind: "provision",
				siteId: String(state.siteSlug ?? input.domain),
				state,
				userId: context.session.user.id,
			});
		}),

	attachStaging: adminProcedure
		.input(attachStagingSchema)
		.handler(async ({ input, context }): Promise<ProvisionJobRef> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND");
			}
			if (
				site.domain.trim().toLowerCase() ===
				input.stagingDomain.trim().toLowerCase()
			) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Staging domain must be different from production.",
				});
			}
			const state = await buildAttachStagingState(
				site.installDir,
				site.domain,
				input.stagingDomain
			);
			return startProvisionJob({
				action: "attachStaging",
				apply: true,
				kind: "attachStaging",
				siteId: site.id,
				state,
				userId: context.session.user.id,
			});
		}),

	removeSite: adminProcedure
		.input(removeSiteSchema)
		.handler(async ({ input, context }): Promise<ProvisionJobRef> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND");
			}
			const state = await buildRemoveSiteState(
				site.installDir,
				site.domain,
				input.purge
			);
			return startProvisionJob({
				action: input.purge ? "removeSite:purge" : "removeSite",
				apply: true,
				kind: "removeSite",
				siteId: site.id,
				state,
				userId: context.session.user.id,
			});
		}),
};
