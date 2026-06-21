import { protectedProcedure } from "../procedures";
import { controlCapabilities } from "./capabilities";

export const controlOverviewRouter = {
	controlOverview: protectedProcedure.handler(({ context }) => ({
		currentUser: {
			name: context.session.user.name,
			email: context.session.user.email,
		},
		sourceOfTruth: "bin/vibe + installer headless core",
		databaseRole: "local control-plane metadata only",
		capabilities: controlCapabilities,
	})),
};
