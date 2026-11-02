# ABYRUS dev environment: the built game (dist/) served by nginx on Cloud Run.
# deploy.sh builds dist/ and puts it, this file, nginx.conf.template and htpasswd in one folder
# before handing that folder to `gcloud run deploy --source`.
FROM nginx:1.27-alpine

# Cloud Run tells the container which port to listen on through $PORT; the nginx image fills
# ${PORT} into the template at start-up.
ENV PORT=8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY htpasswd /etc/nginx/htpasswd
COPY dist /usr/share/nginx/html
