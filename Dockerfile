FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
COPY config ./config
COPY scripts/prepare-fly.ts ./scripts/prepare-fly.ts
RUN npm run build:fly

FROM nginx:stable-alpine
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/build/fly/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist/index.html /usr/share/nginx/html/index.html
COPY --from=build /app/dist/favicon.svg /usr/share/nginx/html/favicon.svg
COPY --from=build /app/dist/assets /usr/share/nginx/html/assets
USER nginx
RUN nginx -t
EXPOSE 8080
STOPSIGNAL SIGQUIT
ENTRYPOINT ["nginx", "-g", "daemon off;"]
