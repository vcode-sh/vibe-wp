import { db } from "@control-panel/db";
import { siteOverviewCache } from "@control-panel/db/schema/site-overview-cache";
import { eq } from "drizzle-orm";

import type { SiteOverview } from "../contract";

export interface SiteOverviewSnapshot {
	payload: SiteOverview;
	refreshedAt: Date;
}

export async function readSiteOverviewSnapshot(
	siteId: string
): Promise<SiteOverviewSnapshot | null> {
	const row = await db.query.siteOverviewCache.findFirst({
		where: eq(siteOverviewCache.siteId, siteId),
	});
	if (!row) {
		return null;
	}
	try {
		return {
			payload: JSON.parse(row.payload) as SiteOverview,
			refreshedAt: row.refreshedAt,
		};
	} catch {
		return null;
	}
}

export async function writeSiteOverviewSnapshot(
	siteId: string,
	payload: SiteOverview
): Promise<void> {
	const refreshedAt = new Date();
	await db
		.insert(siteOverviewCache)
		.values({
			siteId,
			payload: JSON.stringify(payload),
			refreshedAt,
		})
		.onConflictDoUpdate({
			target: siteOverviewCache.siteId,
			set: {
				payload: JSON.stringify(payload),
				refreshedAt,
			},
		});
}

export async function deleteSiteOverviewSnapshot(
	siteId: string
): Promise<void> {
	await db
		.delete(siteOverviewCache)
		.where(eq(siteOverviewCache.siteId, siteId));
}
