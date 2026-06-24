<?php
/**
 * Plugin Name: Vibe WP SMTP
 * Description: Aligns the WordPress mail sender (From) with the SMTP envelope from env.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

$vibe_smtp_from = (string) (getenv('SMTP_FROM') ?: '');
if ($vibe_smtp_from !== '') {
    add_filter('wp_mail_from', static fn (): string => $vibe_smtp_from);
}

$vibe_smtp_from_name = (string) (getenv('SMTP_FROM_NAME') ?: '');
if ($vibe_smtp_from_name !== '') {
    add_filter('wp_mail_from_name', static fn (): string => $vibe_smtp_from_name);
}
