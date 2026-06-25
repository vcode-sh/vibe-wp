<?php
/**
 * Plugin Name: Vibe WP One-Click Login
 * Description: Redeems a single-use, short-lived token minted by the Vibe control
 *              panel to start an authenticated wp-admin session. The token is
 *              hashed at rest (sha256), single-use, and expires after 60 seconds.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('VIBE_WP_SSO_TTL')) {
    // Seconds a minted token stays valid. Mirrors the panel's mint TTL.
    define('VIBE_WP_SSO_TTL', 60);
}

if (!function_exists('vibe_wp_sso_fail')) {
    /**
     * Generic failure. Never reveal whether the token was unknown, expired,
     * already used, or pointed at a missing user — send the visitor to the
     * normal login screen with the token stripped from the URL.
     */
    function vibe_wp_sso_fail(): void
    {
        wp_safe_redirect(wp_login_url());
        exit;
    }
}

if (!function_exists('vibe_wp_sso_maybe_login')) {
    function vibe_wp_sso_maybe_login(): void
    {
        if (!isset($_GET['vibe_sso'])) {
            return;
        }

        $raw = $_GET['vibe_sso'];
        if (!is_string($raw)) {
            vibe_wp_sso_fail();
        }

        // A 32-byte token rendered as 64 lowercase hex characters. Anything else
        // is not a token we minted — reject before any lookup.
        $token = wp_unslash($raw);
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            vibe_wp_sso_fail();
        }

        // We store only sha256(token); the plaintext is never persisted server
        // side. Look up by the hash key — no comparison, so no timing oracle.
        $key = 'vibe_sso_' . hash('sha256', $token);
        $user_id = get_transient($key);

        // Single-use: consume the token regardless of what happens next.
        delete_transient($key);

        if ($user_id === false) {
            vibe_wp_sso_fail();
        }

        $user = get_user_by('id', (int) $user_id);
        if (!$user) {
            vibe_wp_sso_fail();
        }

        // Start a fresh authenticated session for the target user. Session cookie
        // only (not "remember me"), then redirect to wp-admin so the token drops
        // out of the address bar immediately.
        wp_set_current_user($user->ID);
        wp_set_auth_cookie($user->ID, false);
        wp_safe_redirect(admin_url());
        exit;
    }
}

add_action('init', 'vibe_wp_sso_maybe_login', 1);
