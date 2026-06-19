<?php
/**
 * Plugin Name: Vibe WP Redis Runtime
 * Description: Adds WordPress cache-group hints for the Redis object-cache layer.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('vibe_wp_redis_csv_env')) {
    function vibe_wp_redis_csv_env(string $name): array
    {
        $value = getenv($name);

        if ($value === false || $value === '') {
            return array();
        }

        return array_values(array_filter(array_map('trim', explode(',', (string) $value)), static function ($item): bool {
            return $item !== '';
        }));
    }
}

if (!function_exists('vibe_wp_redis_unique_groups')) {
    function vibe_wp_redis_unique_groups(array $groups): array
    {
        $groups = array_map('sanitize_key', $groups);
        $groups = array_filter($groups, static function ($group): bool {
            return $group !== '';
        });

        return array_values(array_unique($groups));
    }
}

if (!function_exists('vibe_wp_redis_add_cache_groups')) {
    function vibe_wp_redis_add_cache_groups(): void
    {
        if (!function_exists('wp_using_ext_object_cache') || !wp_using_ext_object_cache() || !function_exists('wp_cache_add_global_groups')) {
            return;
        }

        $global_groups = array(
            'blog-details',
            'blog-id-cache',
            'blog-lookup',
            'global-posts',
            'networks',
            'rss',
            'site-details',
            'site-lookup',
            'site-options',
            'site-transient',
            'sites',
            'useremail',
            'userlogins',
            'usermeta',
            'user_meta',
            'users',
            'userslugs',
        );

        $global_groups = array_merge($global_groups, vibe_wp_redis_csv_env('VIBE_WP_REDIS_EXTRA_GLOBAL_GROUPS'));
        wp_cache_add_global_groups(vibe_wp_redis_unique_groups($global_groups));

        if (function_exists('wp_cache_add_non_persistent_groups')) {
            $non_persistent_groups = vibe_wp_redis_unique_groups(vibe_wp_redis_csv_env('VIBE_WP_REDIS_NON_PERSISTENT_GROUPS'));

            if ($non_persistent_groups !== array()) {
                wp_cache_add_non_persistent_groups($non_persistent_groups);
            }
        }
    }
}

if (!function_exists('vibe_wp_redis_add_unflushable_groups')) {
    function vibe_wp_redis_add_unflushable_groups(): void
    {
        global $wp_object_cache;

        $groups = vibe_wp_redis_unique_groups(vibe_wp_redis_csv_env('VIBE_WP_REDIS_UNFLUSHABLE_GROUPS'));

        if ($groups === array() || !is_object($wp_object_cache) || !method_exists($wp_object_cache, 'add_unflushable_groups')) {
            return;
        }

        $wp_object_cache->add_unflushable_groups($groups);
    }
}

vibe_wp_redis_add_cache_groups();
vibe_wp_redis_add_unflushable_groups();
