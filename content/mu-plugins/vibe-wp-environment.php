<?php
/**
 * Plugin Name: Vibe WP Environment Guards
 * Description: Applies safe runtime behavior for staging WordPress environments.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('vibe_wp_environment_bool')) {
    function vibe_wp_environment_bool(string $name, bool $default = false): bool
    {
        $value = getenv($name);

        if ($value === false || $value === '') {
            return $default;
        }

        return in_array(strtolower((string) $value), array('1', 'true', 'yes', 'on'), true);
    }
}

if (!function_exists('vibe_wp_environment_type')) {
    function vibe_wp_environment_type(): string
    {
        if (function_exists('wp_get_environment_type')) {
            return wp_get_environment_type();
        }

        $value = getenv('WP_ENVIRONMENT_TYPE');
        return $value === false || $value === '' ? 'production' : (string) $value;
    }
}

if (!function_exists('vibe_wp_is_staging')) {
    function vibe_wp_is_staging(): bool
    {
        return vibe_wp_environment_type() === 'staging';
    }
}

if (vibe_wp_is_staging() || vibe_wp_environment_bool('VIBE_WP_FORCE_NOINDEX')) {
    add_filter('pre_option_blog_public', static function () {
        return '0';
    });

    add_action('send_headers', static function (): void {
        if (!headers_sent()) {
            header('X-Robots-Tag: noindex, nofollow', true);
        }
    });

    add_filter('robots_txt', static function (): string {
        return "User-agent: *\nDisallow: /\n";
    }, 10, 2);
}

if (vibe_wp_environment_bool('VIBE_WP_DISABLE_OUTBOUND_MAIL', vibe_wp_is_staging())) {
    add_filter('pre_wp_mail', static function () {
        return true;
    }, 10, 2);
}

add_action('admin_notices', static function (): void {
    if ((!vibe_wp_is_staging() && !vibe_wp_environment_bool('VIBE_WP_FORCE_NOINDEX') && !vibe_wp_environment_bool('VIBE_WP_DISABLE_OUTBOUND_MAIL')) || !current_user_can('manage_options')) {
        return;
    }

    $environment = esc_html(vibe_wp_environment_type());
    echo '<div class="notice notice-warning"><p><strong>Vibe WP:</strong> This is the ' . $environment . ' environment. Staging safeguards are active.</p></div>';
});
