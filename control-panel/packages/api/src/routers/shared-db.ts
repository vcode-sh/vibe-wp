import {
	type SharedDbStatus,
	sharedDbInit,
	sharedDbRotateRoot,
	sharedDbStatus,
} from "../core-bridge/shared-db";
import { adminProcedure, protectedProcedure } from "../procedures";

/**
 * Shared-database lifecycle (the ONE global MariaDB project). Reading status is
 * available to any signed-in operator; initializing the project and rotating the
 * root password are admin-only. Provisioning a SITE onto the shared DB lives in
 * the provisioning router (it produces a tracked install job).
 */
export const sharedDbRouter = {
	sharedDbStatus: protectedProcedure.handler(
		(): Promise<SharedDbStatus> => sharedDbStatus()
	),

	sharedDbInit: adminProcedure.handler(
		(): Promise<{ ok: boolean; output: string }> => sharedDbInit()
	),

	sharedDbRotateRoot: adminProcedure.handler(
		(): Promise<{ ok: boolean; output: string }> => sharedDbRotateRoot()
	),
};
