# MRMS backend — Node + Chromium (for Arabic-RTL PDF generation via Playwright)
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app/server

# Install dependencies first (better build caching)
COPY server/package.json ./
RUN npm install --omit=dev

# Chromium + all required system libraries
RUN npx playwright install --with-deps chromium

COPY server/src ./src
COPY server/scripts ./scripts
RUN mkdir -p uploads generated data

EXPOSE 4000
CMD ["node", "src/index.js"]
