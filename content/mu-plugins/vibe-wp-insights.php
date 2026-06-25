<?php
/**
 * Plugin Name: Vibe WP Insights
 * Description: Collects a strict, non-secret site inventory to wp-content/.vibe/insights.json for the Vibe control panel.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}
if (defined('VIBE_INSIGHTS_DISABLED') && VIBE_INSIGHTS_DISABLED) {
    return;
}

const VIBE_INSIGHTS_SCHEMA   = 1;
const VIBE_INSIGHTS_MAX_BYTES = 524288; // 512 KB hard cap (mirrored panel-side)
const VIBE_INSIGHTS_HOOK     = 'vibe_insights_collect_cron';

// ---------------------------------------------------------------------------
// Output directory
// ---------------------------------------------------------------------------

function vibe_insights_output_dir(): string
{
    $dir = WP_CONTENT_DIR . '/.vibe';
    if (!is_dir($dir)) {
        wp_mkdir_p($dir);
        @chmod($dir, 0750);
    }
    return $dir;
}

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------

function vibe_insights_wp_core(): array
{
    try {
        if (!function_exists('get_core_updates')) {
            require_once ABSPATH . 'wp-admin/includes/update.php';
        }
        $updates          = function_exists('get_core_updates') ? get_core_updates() : array();
        $update_available = false;
        $new_version      = null;
        if (is_array($updates)) {
            foreach ($updates as $update) {
                if (isset($update->response) && $update->response === 'upgrade') {
                    $update_available = true;
                    $new_version      = isset($update->version) ? (string) $update->version : null;
                    break;
                }
            }
        }
        return array(
            'version'          => (string) get_bloginfo('version'),
            'update_available' => $update_available,
            'new_version'      => $new_version,
        );
    } catch (\Throwable $e) {
        return array('version' => (string) get_bloginfo('version'), 'update_available' => false, 'new_version' => null);
    }
}

function vibe_insights_db(): array
{
    try {
        global $wpdb;
        $size_raw      = $wpdb->get_var("SELECT SUM(data_length + index_length) FROM information_schema.TABLES WHERE table_schema = DATABASE()");
        $size_bytes    = $size_raw !== null ? (int) $size_raw : 0;
        $server_ver    = (string) $wpdb->get_var('SELECT VERSION()');
        $engine        = stripos($server_ver, 'mariadb') !== false ? 'MariaDB' : 'MySQL';
        return array(
            'size_bytes'     => $size_bytes,
            'engine'         => $engine,
            'server_version' => $server_ver,
        );
    } catch (\Throwable $e) {
        return array('size_bytes' => 0, 'engine' => 'MySQL', 'server_version' => '');
    }
}

/**
 * Fetch wp.org metadata for a single plugin slug for the Security Radar's
 * abandoned-plugin detection: last_updated, active_installs, tested. Cached in a
 * transient (default 7 days) so collection never hammers api.wordpress.org, and
 * wrapped in try/catch so a blocked/slow API NEVER wedges insight collection.
 * Premium/custom plugins have no wp.org entry -> all three fields are null (a
 * missing date is a WEAK signal the radar deliberately does NOT flag on).
 * Returns array{last_updated:?string, active_installs:?int, tested:?string}.
 */
function vibe_insights_plugin_meta(string $slug): array
{
    $null_meta = array('last_updated' => null, 'active_installs' => null, 'tested' => null);
    try {
        // Slug guard mirrors the panel's wp.org-style slug regex (defense in depth).
        if ($slug === '' || !preg_match('/^[a-z0-9][a-z0-9-]{0,62}$/', $slug)) {
            return $null_meta;
        }
        $cache_key = 'vibe_insights_meta_' . $slug;
        $cached    = get_transient($cache_key);
        if (is_array($cached)) {
            return array(
                'last_updated'    => isset($cached['last_updated']) ? $cached['last_updated'] : null,
                'active_installs' => isset($cached['active_installs']) ? $cached['active_installs'] : null,
                'tested'          => isset($cached['tested']) ? $cached['tested'] : null,
            );
        }
        if (!function_exists('plugins_api')) {
            require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
        }
        if (!function_exists('plugins_api')) {
            return $null_meta;
        }
        $info = plugins_api('plugin_information', array(
            'slug'   => $slug,
            'fields' => array(
                'last_updated'    => true,
                'active_installs' => true,
                'tested'          => true,
                'sections'        => false,
                'description'     => false,
                'screenshots'     => false,
                'banners'         => false,
                'icons'           => false,
                'reviews'         => false,
                'versions'        => false,
            ),
        ));
        if (is_wp_error($info) || !is_object($info)) {
            // Cache the negative result (shorter TTL) so a non-wp.org plugin
            // isn't re-queried every cron run.
            set_transient($cache_key, $null_meta, DAY_IN_SECONDS);
            return $null_meta;
        }
        // last_updated from wp.org looks like "2021-03-04 5:35pm GMT"; normalize to
        // an ISO-8601 string the panel can Date.parse(). Fall back to the raw value.
        $last_updated = null;
        if (!empty($info->last_updated)) {
            $ts = strtotime((string) $info->last_updated);
            $last_updated = $ts !== false ? gmdate('c', $ts) : (string) $info->last_updated;
        }
        $meta = array(
            'last_updated'    => $last_updated,
            'active_installs' => isset($info->active_installs) ? (int) $info->active_installs : null,
            'tested'          => !empty($info->tested) ? (string) $info->tested : null,
        );
        set_transient($cache_key, $meta, 7 * DAY_IN_SECONDS);
        return $meta;
    } catch (\Throwable $e) {
        return $null_meta;
    }
}

function vibe_insights_plugins(): array
{
    try {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        if (!function_exists('get_plugin_updates')) {
            require_once ABSPATH . 'wp-admin/includes/update.php';
        }
        $all_plugins     = function_exists('get_plugins') ? get_plugins() : array();
        $plugin_updates  = function_exists('get_plugin_updates') ? get_plugin_updates() : array();
        $auto_update_opt = (array) get_option('auto_update_plugins', array());
        $result          = array();
        foreach ($all_plugins as $plugin_file => $plugin_data) {
            $dirname    = dirname($plugin_file);
            $slug       = ($dirname === '.' || $dirname === '') ? basename($plugin_file, '.php') : $dirname;
            $has_update = isset($plugin_updates->response[$plugin_file]);
            $new_ver    = $has_update && isset($plugin_updates->response[$plugin_file]->new_version)
                ? (string) $plugin_updates->response[$plugin_file]->new_version
                : null;
            $is_active  = (function_exists('is_plugin_active') && is_plugin_active($plugin_file));
            // wp.org metadata only for ACTIVE plugins — that bounds the number of
            // (transient-cached) api.wordpress.org calls and is exactly the set the
            // radar evaluates for "abandoned". Inactive plugins get null meta.
            $meta = $is_active
                ? vibe_insights_plugin_meta($slug)
                : array('last_updated' => null, 'active_installs' => null, 'tested' => null);
            $result[]   = array(
                'slug'             => $slug,
                'name'             => (string) ($plugin_data['Name'] ?? ''),
                'version'          => (string) ($plugin_data['Version'] ?? ''),
                'status'           => $is_active ? 'active' : 'inactive',
                'update_available' => $has_update,
                'new_version'      => $new_ver,
                'auto_update'      => in_array($plugin_file, $auto_update_opt, true) ? true : null,
                'last_updated'     => $meta['last_updated'],
                'active_installs'  => $meta['active_installs'],
                'tested'           => $meta['tested'],
            );
        }
        return $result;
    } catch (\Throwable $e) {
        return array();
    }
}

function vibe_insights_themes(): array
{
    try {
        if (!function_exists('get_theme_updates')) {
            require_once ABSPATH . 'wp-admin/includes/update.php';
        }
        $all_themes      = wp_get_themes();
        $theme_updates   = function_exists('get_theme_updates') ? get_theme_updates() : array();
        $active_template = get_template();
        $active_style    = get_stylesheet();
        $auto_update_opt = (array) get_option('auto_update_themes', array());
        $result          = array();
        foreach ($all_themes as $slug => $theme) {
            if ($slug === $active_style) {
                $status = 'active';
            } elseif ($slug === $active_template) {
                $status = 'parent';
            } else {
                $status = 'inactive';
            }
            $has_update = isset($theme_updates->response[$slug]);
            $new_ver    = $has_update && isset($theme_updates->response[$slug]['new_version'])
                ? (string) $theme_updates->response[$slug]['new_version']
                : null;
            $result[]   = array(
                'slug'             => (string) $slug,
                'name'             => (string) $theme->get('Name'),
                'version'          => (string) $theme->get('Version'),
                'status'           => $status,
                'update_available' => $has_update,
                'new_version'      => $new_ver,
                'auto_update'      => in_array($slug, $auto_update_opt, true) ? true : null,
            );
        }
        return $result;
    } catch (\Throwable $e) {
        return array();
    }
}

function vibe_insights_users(): array
{
    try {
        $counts       = count_users();
        $total        = (int) ($counts['total_users'] ?? 0);
        $admin_count  = (int) ($counts['avail_roles']['administrator'] ?? 0);
        return array(
            'count'       => $total,
            'admin_count' => $admin_count,
            'last_login'  => null,
        );
    } catch (\Throwable $e) {
        return array('count' => 0, 'admin_count' => 0, 'last_login' => null);
    }
}

function vibe_insights_site_health(): array
{
    $default = array('collected_at' => gmdate('c'), 'critical' => array(), 'recommended' => array());
    try {
        if (!class_exists('WP_Site_Health')) {
            require_once ABSPATH . 'wp-admin/includes/class-wp-site-health.php';
        }
        if (!function_exists('get_plugin_updates')) {
            require_once ABSPATH . 'wp-admin/includes/update.php';
        }
        if (!class_exists('WP_Site_Health')) {
            return $default;
        }
        $health   = WP_Site_Health::get_instance();
        $tests    = $health->get_tests();
        $direct   = isset($tests['direct']) && is_array($tests['direct']) ? $tests['direct'] : array();
        $critical    = array();
        $recommended = array();
        foreach ($direct as $test_id => $test_def) {
            try {
                $callback = $test_def['test'] ?? null;
                if (!is_callable($callback)) {
                    continue;
                }
                $result = call_user_func($callback);
                if (!is_array($result)) {
                    continue;
                }
                $status = $result['status'] ?? '';
                $item   = array(
                    'label'       => (string) ($result['label'] ?? ''),
                    'description' => strip_tags((string) ($result['description'] ?? '')),
                    'test'        => (string) $test_id,
                );
                if ($status === 'critical' && count($critical) < 50) {
                    $critical[] = $item;
                } elseif ($status === 'recommended' && count($recommended) < 100) {
                    $recommended[] = $item;
                }
            } catch (\Throwable $inner) {
                // Skip individual failing test; continue with others.
            }
        }
        return array(
            'collected_at' => gmdate('c'),
            'critical'     => $critical,
            'recommended'  => $recommended,
        );
    } catch (\Throwable $e) {
        return $default;
    }
}

function vibe_insights_signals(): array
{
    try {
        $auto_core = 'major';
        if (defined('WP_AUTO_UPDATE_CORE')) {
            $val = WP_AUTO_UPDATE_CORE;
            if ($val === true || $val === 'minor') {
                $auto_core = 'minor';
            } elseif ($val === false) {
                $auto_core = 'off';
            } else {
                $auto_core = 'major';
            }
        }
        return array(
            'xmlrpc_enabled'    => (bool) apply_filters('xmlrpc_enabled', true),
            'file_edit_enabled' => !(defined('DISALLOW_FILE_EDIT') && DISALLOW_FILE_EDIT),
            'debug_on'          => (defined('WP_DEBUG') && WP_DEBUG),
            'debug_log_on'      => (defined('WP_DEBUG_LOG') && WP_DEBUG_LOG),
            'debug_display_on'  => (defined('WP_DEBUG_DISPLAY') && WP_DEBUG_DISPLAY),
            'script_debug_on'   => (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG),
            'auto_update_core'  => $auto_core,
            'cron_disabled'     => (defined('DISABLE_WP_CRON') && DISABLE_WP_CRON),
        );
    } catch (\Throwable $e) {
        return array(
            'xmlrpc_enabled'    => true,
            'file_edit_enabled' => true,
            'debug_on'          => false,
            'debug_log_on'      => false,
            'debug_display_on'  => false,
            'script_debug_on'   => false,
            'auto_update_core'  => 'major',
            'cron_disabled'     => false,
        );
    }
}

function vibe_insights_object_cache(): array
{
    try {
        // wp_using_ext_object_cache() returns the uninitialized global (null) when
        // the object cache isn't set up in the collection context, so cast to bool
        // to satisfy the panel's strict boolean schema.
        $dropin = file_exists(WP_CONTENT_DIR . '/object-cache.php');
        return array(
            'enabled'        => (bool) wp_using_ext_object_cache(),
            'type'           => $dropin ? 'redis' : 'none',
            'dropin_present' => (bool) $dropin,
        );
    } catch (\Throwable $e) {
        return array('enabled' => false, 'type' => 'none', 'dropin_present' => false);
    }
}

function vibe_insights_fastcgi_cache(): array
{
    try {
        return array(
            'enabled' => in_array(strtolower((string) getenv('NGINX_FASTCGI_CACHE')), array('1', 'true', 'on', 'yes'), true),
        );
    } catch (\Throwable $e) {
        return array('enabled' => false);
    }
}

// ---------------------------------------------------------------------------
// Assemble the full inventory
// ---------------------------------------------------------------------------

/** Assemble the inventory array. Every value is non-secret + display-only. */
function vibe_insights_collect(): array
{
    return array(
        'schema_version' => VIBE_INSIGHTS_SCHEMA,
        'generated_at'   => gmdate('c'),
        'site_url'       => (string) home_url(),
        'wp_core'        => vibe_insights_wp_core(),
        'php_version'    => PHP_VERSION,
        'db'             => vibe_insights_db(),
        'plugins'        => vibe_insights_plugins(),
        'themes'         => vibe_insights_themes(),
        'users'          => vibe_insights_users(),
        'site_health'    => vibe_insights_site_health(),
        'signals'        => vibe_insights_signals(),
        'object_cache'   => vibe_insights_object_cache(),
        'fastcgi_cache'  => vibe_insights_fastcgi_cache(),
    );
}

// ---------------------------------------------------------------------------
// Atomic write
// ---------------------------------------------------------------------------

function vibe_insights_write(): void
{
    try {
        $data = vibe_insights_collect();
        $json = wp_json_encode($data, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return;
        }
        if (strlen($json) > VIBE_INSIGHTS_MAX_BYTES) {
            // Drop the heaviest arrays to fit, then re-encode.
            $data['plugins']     = array();
            $data['themes']      = array();
            $data['site_health'] = array('collected_at' => gmdate('c'), 'critical' => array(), 'recommended' => array());
            $data['_truncated']  = true;
            $json = wp_json_encode($data, JSON_UNESCAPED_SLASHES);
            if ($json === false || strlen($json) > VIBE_INSIGHTS_MAX_BYTES) {
                return;
            }
        }
        $dir    = vibe_insights_output_dir();
        $target = $dir . '/insights.json';
        $tmp    = $dir . '/.insights.tmp.' . getmypid();
        if (file_put_contents($tmp, $json, LOCK_EX) === false) {
            return;
        }
        @chmod($tmp, 0640);
        @rename($tmp, $target); // atomic on the same filesystem
    } catch (\Throwable $e) {
        // Never let collection break the site; the panel shows staleness instead.
    }
}

// ---------------------------------------------------------------------------
// Cron registration
// ---------------------------------------------------------------------------

add_filter('cron_schedules', static function (array $s): array {
    $s['vibe_15min'] = array('interval' => 900, 'display' => 'Every 15 minutes (Vibe Insights)');
    return $s;
});

add_action(VIBE_INSIGHTS_HOOK, 'vibe_insights_write');

add_action('init', static function (): void {
    if (!wp_next_scheduled(VIBE_INSIGHTS_HOOK)) {
        wp_schedule_event(time() + 60, 'vibe_15min', VIBE_INSIGHTS_HOOK);
    }
});
