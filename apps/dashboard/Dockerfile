FROM node:24-slim AS builder
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile

ARG VITE_SERVER_URL
ARG VITE_DASHBOARD_URL
ARG VITE_WEBSITE_URL
ARG VITE_CLOUDINARY_CLOUD_NAME
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
ENV VITE_DASHBOARD_URL=${VITE_DASHBOARD_URL}
ENV VITE_WEBSITE_URL=${VITE_WEBSITE_URL}
ENV VITE_CLOUDINARY_CLOUD_NAME=${VITE_CLOUDINARY_CLOUD_NAME}
ENV NODE_ENV=production
RUN cd apps/dashboard && bun run build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
