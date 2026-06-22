import type { NeedItem, SecurityStatus } from "../contract";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
// Match bin/monitor's backup-freshness default (VIBE_MONITOR_BACKUP_MAX_AGE_HOURS).
const BACKUP_STALE_HOURS = 26;
const TLS_EXPIRY_RE = /(expires in|expired)/i;
const DISK_USED_RE = /\d+% used/;

export interface MonitorCheck {
	name: string;
	ok: boolean;
}

/** Honest, dependency-free relative age (e.g. "3h ago", "2d ago"). */
function relativeAge(iso: string, nowMs: number): string {
	const then = Date.parse(iso);
	if (Number.isNaN(then)) {
		return "unknown";
	}
	const diff = Math.max(0, nowMs - then);
	if (diff < HOUR_MS) {
		return "under 1h ago";
	}
	if (diff < DAY_MS) {
		return `${Math.floor(diff / HOUR_MS)}h ago`;
	}
	return `${Math.floor(diff / DAY_MS)}d ago`;
}

/** Backup-derived safety copy + an optional NeedItem, from the real latest backup. */
export function backupSignal(
	lastBackupISO: string,
	nowMs: number
): { text: string; detail: string; need: NeedItem | null } {
	const then = Date.parse(lastBackupISO);
	if (!lastBackupISO || Number.isNaN(then)) {
		return {
			text: "No backups yet",
			detail: "Create the first backup from the Backups tab.",
			need: {
				id: "backup-missing",
				icon: "backup",
				title: "No backups yet",
				detail: "This site has never been backed up.",
				actionLabel: "Back up now",
				reversible: false,
			},
		};
	}
	const stale = (nowMs - then) / HOUR_MS > BACKUP_STALE_HOURS;
	return {
		text: `Last backup ${relativeAge(lastBackupISO, nowMs)}`,
		detail: stale
			? `Newest backup is older than ${BACKUP_STALE_HOURS}h.`
			: "Backups are current.",
		need: stale
			? {
					id: "backup-stale",
					icon: "backup",
					title: "Backup is stale",
					detail: `Newest backup ${relativeAge(lastBackupISO, nowMs)}.`,
					actionLabel: "Back up now",
					reversible: false,
				}
			: null,
	};
}

/**
 * A NeedItem from the monitor TLS-certificate check, or null when the cert is
 * healthy / not checkable. bin/monitor emits one "TLS certificate: …" check;
 * it is ok only when valid, and not-ok (warn/fail) when near expiry, expired,
 * or unreadable. Surface only the genuine expiry/expired ones — the real
 * message carries the day count — and omit "skipped/unreadable" diagnostics
 * rather than faking a number.
 */
export function certNeed(checks: MonitorCheck[]): NeedItem | null {
	const tls = checks.find((c) => c.name.startsWith("TLS certificate:"));
	if (!tls || tls.ok || !TLS_EXPIRY_RE.test(tls.name)) {
		return null;
	}
	return {
		id: "cert-expiry",
		icon: "cert",
		title: "TLS certificate needs attention",
		detail: tls.name,
		actionLabel: "View health",
		reversible: false,
	};
}

/**
 * A NeedItem from the monitor disk-space check, or null when disk has headroom.
 * bin/monitor emits a "Disk space: <path> is N% used" check per path and marks
 * it not-ok at its warn/fail thresholds; surface the not-ok one with its real
 * percentage rather than re-probing the host.
 */
export function diskNeed(checks: MonitorCheck[]): NeedItem | null {
	const disk = checks.find(
		(c) =>
			c.name.startsWith("Disk space:") && !c.ok && DISK_USED_RE.test(c.name)
	);
	if (!disk) {
		return null;
	}
	return {
		id: "low-disk",
		icon: "disk",
		title: "Low disk space",
		detail: disk.name,
		actionLabel: "View health",
		reversible: false,
	};
}

/**
 * A NeedItem when host security posture has regressed, or null when firewall,
 * fail2ban and auto-updates are all on. Derived from the real security-status
 * op (host-wide); names the actual disabled protections.
 */
export function securityNeed(status: SecurityStatus | null): NeedItem | null {
	if (!status) {
		return null;
	}
	const off: string[] = [];
	if (!status.firewall) {
		off.push("firewall");
	}
	if (!status.fail2ban) {
		off.push("fail2ban");
	}
	if (!status.autoUpdates) {
		off.push("auto-updates");
	}
	if (off.length === 0) {
		return null;
	}
	return {
		id: "security-regression",
		icon: "security",
		title: "Security protections are off",
		detail: `${off.join(", ")} ${off.length === 1 ? "is" : "are"} disabled on this server.`,
		actionLabel: "Review security",
		reversible: false,
	};
}

/** Honest safety-card copy for the host security posture (no false green). */
export function securitySafety(status: SecurityStatus | null): {
	securityText: string;
	securityDetail: string;
} {
	if (!status) {
		return {
			securityText: "See Server & security",
			securityDetail: "Firewall, fail2ban and auto-updates are host-wide.",
		};
	}
	const allOn = status.firewall && status.fail2ban && status.autoUpdates;
	const onOff = (v: boolean) => (v ? "on" : "off");
	return {
		securityText: allOn ? "Protections on" : "Protections need attention",
		securityDetail: `Firewall ${onOff(status.firewall)} · fail2ban ${onOff(status.fail2ban)} · auto-updates ${onOff(status.autoUpdates)}.`,
	};
}

/** A NeedItem for pending plugin updates, or null when nothing is pending. */
export function updatesNeed(pluginUpdates: number): NeedItem | null {
	if (pluginUpdates <= 0) {
		return null;
	}
	const plural = pluginUpdates === 1 ? "" : "s";
	return {
		id: "plugin-updates",
		icon: "update",
		title: `${pluginUpdates} plugin update${plural} available`,
		detail: "Apply pending plugin updates to stay patched.",
		actionLabel: "Update plugins",
		reversible: false,
	};
}
