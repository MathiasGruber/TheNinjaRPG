# Reuse the official application's configuration and entrypoint, while compiling
# extensions against the PHP runtime rather than copying incompatible binaries.
FROM phpmyadmin:5.2.3-apache AS phpmyadmin
FROM php:8.5.11-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libbz2-dev libfreetype6-dev libjpeg62-turbo-dev libpng-dev libwebp-dev libzip-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j"$(nproc)" bcmath bz2 gd mysqli zip \
    && rm -rf /var/lib/apt/lists/*

ENV PMA_SSL_DIR=/etc/phpmyadmin/ssl \
    MAX_EXECUTION_TIME=600 \
    MEMORY_LIMIT=512M \
    UPLOAD_LIMIT=2048K \
    TZ=UTC \
    SESSION_SAVE_PATH=/sessions

COPY --from=phpmyadmin /var/www/html/ /var/www/html/
COPY --from=phpmyadmin /etc/phpmyadmin/ /etc/phpmyadmin/
COPY --from=phpmyadmin /docker-entrypoint.sh /docker-entrypoint.sh
COPY --from=phpmyadmin /usr/local/etc/php/conf.d/phpmyadmin-misc.ini /usr/local/etc/php/conf.d/phpmyadmin-misc.ini
COPY --from=phpmyadmin /usr/local/etc/php/conf.d/session-strict.ini /usr/local/etc/php/conf.d/session-strict.ini
COPY --from=phpmyadmin /usr/local/etc/php/conf.d/opcache-recommended.ini /usr/local/etc/php/conf.d/opcache-recommended.ini

RUN mkdir -p /sessions /etc/phpmyadmin/ssl \
    && chmod 1777 /sessions \
    && chown -R www-data:www-data /etc/phpmyadmin

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["apache2-foreground"]
