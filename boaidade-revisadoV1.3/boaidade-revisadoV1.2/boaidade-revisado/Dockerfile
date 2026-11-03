FROM php:8.3-apache
RUN apt-get update && apt-get install -y --no-install-recommends libonig-dev \
    && docker-php-ext-install pdo_mysql mbstring fileinfo \
    && rm -rf /var/lib/apt/lists/*
RUN printf 'upload_max_filesize=52M\npost_max_size=55M\n' > /usr/local/etc/php/conf.d/uploads.ini
WORKDIR /var/www/html
COPY . /var/www/html/
RUN mkdir -p uploads \
    && chown -R www-data:www-data uploads \
    && chmod 750 uploads
EXPOSE 80
CMD ["apache2-foreground"]
