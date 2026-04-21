# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: serve via nginx ──────────────────────────────────────────────────
FROM nginx:alpine AS runtime

# Copy built assets
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Custom nginx config for SPA routing + backend proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
