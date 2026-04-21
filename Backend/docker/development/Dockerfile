FROM node:20-alpine AS base

WORKDIR /usr/src/app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
