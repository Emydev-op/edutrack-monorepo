# The local router (see gateway.dev.conf). The config is built into the image rather than mounted:
# on macOS, containers reading files under ~/Documents can block on a privacy permission.
FROM nginx:1.31-alpine
COPY gateway.dev.conf /etc/nginx/templates/default.conf.template
# nginx can stall looking up host.docker.internal at start-up, so the address is looked up here
# and written into the config (the image renders templates/ with envsubst).
ENTRYPOINT ["sh", "-c", "export DEV_HOST=$(getent hosts host.docker.internal | awk '{print $1}'); exec /docker-entrypoint.sh nginx -g 'daemon off;'"]
