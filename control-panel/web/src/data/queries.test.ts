import { describe, expect, it } from "vitest";

import {
	inventoryQuery,
	monitoringOverviewQuery,
	serverInfoQuery,
	siteOverviewQuery,
	sitesQuery,
} from "./queries";

describe("query realtime safety options", () => {
	it("keeps broad views fresh on focus and while mounted", () => {
		expect(siteOverviewQuery("site-a")).toMatchObject({
			refetchInterval: 60_000,
			refetchOnWindowFocus: true,
			staleTime: 15_000,
		});
		expect(inventoryQuery("site-a")).toMatchObject({
			refetchInterval: 60_000,
			refetchOnWindowFocus: true,
			staleTime: 15_000,
		});
		expect(monitoringOverviewQuery()).toMatchObject({
			refetchInterval: 60_000,
			refetchOnWindowFocus: true,
			staleTime: 15_000,
		});
		expect(sitesQuery()).toMatchObject({
			refetchInterval: 60_000,
			refetchOnWindowFocus: true,
			staleTime: 15_000,
		});
		expect(serverInfoQuery()).toMatchObject({
			refetchInterval: 60_000,
			refetchOnWindowFocus: true,
			staleTime: 15_000,
		});
	});
});
