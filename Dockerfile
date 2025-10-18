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
    wget \
    unzip \
    curl

# Download and install Noto Sans CJK fonts for Korean, Japanese, Chinese support
RUN mkdir -p /usr/share/fonts/noto && \
    cd /usr/share/fonts/noto && \
    # Download Noto Sans CJK KR (Korean)
    wget -q https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf && \
    wget -q https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Bold.otf && \
    # Download Noto Sans CJK JP (Japanese)
    wget -q https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf && \
    wget -q https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Bold.otf && \
    # Download Noto Sans CJK SC (Simplified Chinese)
    wget -q https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf && \
    wget -q https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf && \
    # Update font cache
    fc-cache -f -v && \
    echo "✓ Installed Noto CJK fonts"

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

