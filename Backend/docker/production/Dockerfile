# ── Stage 1: build + prune ────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Prune devDependencies in-place (native bindings already compiled)
RUN npm prune --omit=dev

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /usr/src/app

# Carry over pruned node_modules (bcrypt .node binding included) + compiled JS
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY package.json ./

# Data directory for vector store persistence
RUN mkdir -p ./data

EXPOSE 3000

CMD ["npm", "run", "serve"]
