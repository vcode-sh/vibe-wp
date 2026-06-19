<?php
/**
 * Plugin Name: Vibe WP Loopback Router
 * Description: Routes WordPress self-requests through the internal Docker network when needed.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('vibe_wp_loopback_internal_url')) {
    function vibe_wp_loopback_internal_url(): string
    {
        $value = getenv('VIBE_WP_INTERNAL_URL');
        return $value === false ? '' : rtrim((string) $value, '/');
    }
}

if (!function_exists('vibe_wp_loopback_same_site')) {
    function vibe_wp_loopback_same_site(string $url): bool
    {
        $target = wp_parse_url($url);

        if (!is_array($target) || empty($target['host'])) {
            return false;
        }

        foreach (array(home_url('/'), site_url('/')) as $site_url) {
            $site = wp_parse_url($site_url);

            if (!is_array($site) || empty($site['host'])) {
                continue;
            }

            $target_port = isset($target['port']) ? (int) $target['port'] : (($target['scheme'] ?? 'http') === 'https' ? 443 : 80);
            $site_port = isset($site['port']) ? (int) $site['port'] : (($site['scheme'] ?? 'http') === 'https' ? 443 : 80);

            if (strtolower((string) $target['host']) === strtolower((string) $site['host']) && $target_port === $site_port) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('vibe_wp_loopback_rewrite_url')) {
    function vibe_wp_loopback_rewrite_url(string $url, string $internal_url): string
    {
        $target = wp_parse_url($url);
        $internal = wp_parse_url($internal_url);

        if (!is_array($target) || !is_array($internal) || empty($internal['scheme']) || empty($internal['host'])) {
            return $url;
        }

        $rewritten = $internal['scheme'] . '://' . $internal['host'];

        if (isset($internal['port'])) {
            $rewritten .= ':' . $internal['port'];
        }

        $rewritten .= $target['path'] ?? '/';

        if (!empty($target['query'])) {
            $rewritten .= '?' . $target['query'];
        }

        return $rewritten;
    }
}

add_filter('pre_http_request', static function ($preempt, array $parsed_args, string $url) {
    static $routing = false;

    if ($routing || $preempt !== false || !function_exists('wp_remote_request')) {
        return $preempt;
    }

    $internal_url = vibe_wp_loopback_internal_url();

    if ($internal_url === '' || !vibe_wp_loopback_same_site($url)) {
        return $preempt;
    }

    $rewritten_url = vibe_wp_loopback_rewrite_url($url, $internal_url);

    if ($rewritten_url === $url) {
        return $preempt;
    }

    $target = wp_parse_url($url);
    $host = (string) ($target['host'] ?? '');

    if (isset($target['port'])) {
        $host .= ':' . $target['port'];
    }

    $parsed_args['headers'] = isset($parsed_args['headers']) && is_array($parsed_args['headers'])
        ? $parsed_args['headers']
        : array();

    if ($host !== '') {
        $parsed_args['headers']['Host'] = $host;
        $parsed_args['headers']['X-Forwarded-Host'] = $host;
    }

    if (!empty($target['scheme'])) {
        $parsed_args['headers']['X-Forwarded-Proto'] = $target['scheme'];
    }

    $routing = true;
    $response = wp_remote_request($rewritten_url, $parsed_args);
    $routing = false;

    return $response;
}, 10, 3);
