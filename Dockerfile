# Multi-stage build for optimized image size
FROM node:20-alpine AS base

# Install native dependencies required by @napi-rs/canvas
RUN apk add --no-cache \
    build-base \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev \
    freetype-dev \
    fontconfig-dev \
    ttf-dejavu \
    font-noto \
    font-liberation \
    font-liberation-sans-narrow \
    wget

# Download Google Fonts at build time for production use
# Edit fonts-build.txt to customize which fonts are pre-installed
# TEMPORARILY DISABLED - Using runtime downloads with detailed logging
# COPY fonts-build.txt /tmp/fonts.txt
# COPY scripts/download-fonts.sh /tmp/download-fonts.sh
# RUN chmod +x /tmp/download-fonts.sh && \
#     /tmp/download-fonts.sh && \
#     rm /tmp/download-fonts.sh /tmp/fonts.txt

# Create fonts directory for runtime downloads
RUN mkdir -p /usr/share/fonts/truetype/google-fonts

# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy package files and .npmrc for authentication
COPY package*.json .npmrc ./

RUN npm install

# Clean up .npmrc to avoid leaking token in the image
RUN rm -f .npmrc

# Builder stage
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript application
RUN npm run build

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 renderuser

# Copy necessary files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/test ./test
COPY --from=builder /app/src/examples ./src/examples

# Set ownership
RUN chown -R renderuser:nodejs /app

USER renderuser

EXPOSE 3000

# Run the API server
CMD ["npm", "start"]

