#!/usr/bin/env bash
set -euo pipefail
sudo apt-get update
sudo apt-get install -y php-cli php-mysql php-mbstring
php -v
php -m | grep -E '^(PDO|pdo_mysql|mbstring|fileinfo)$'
echo 'PHP e extensões requeridas instalados.'
