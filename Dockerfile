# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* yarn.lock* package-lock.json* ./

# Install all dependencies (dev needed for build)
RUN npm install

# Copy source code
COPY . .

# Build Next.js app
ARG DATABASE_URL=postgresql://postgres:[REDACTED]@localhost:5432/app
RUN DATABASE_URL=$DATABASE_URL npm run build

# Prune to production dependencies
RUN npm prune --omit=dev

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install dumb-init and PostgreSQL client
RUN apk add --no-cache dumb-init postgresql-client

# Copy built application from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src

# Copy initialization and entrypoint scripts
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
