<?php
declare(strict_types=1);
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$blocked = ['/data','/database.sql','/bootstrap.php'];
if (preg_match('~(?:^|/)\\.[^/]*~', $path)) { http_response_code(404); exit('Not found'); }
foreach ($blocked as $prefix) if ($path === $prefix || str_starts_with($path, $prefix . '/')) { http_response_code(404); exit('Not found'); }
if (str_starts_with($path, '/uploads/') && preg_match('/\.php(?:$|\/)/i', $path)) { http_response_code(404); exit('Not found'); }
$file = __DIR__ . $path;
if ($path !== '/' && is_file($file)) return false;
if ($path === '/' || !pathinfo($path, PATHINFO_EXTENSION)) { require __DIR__ . '/index.html'; return true; }
http_response_code(404); echo 'Not found';
