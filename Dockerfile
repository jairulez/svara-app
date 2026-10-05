FROM node:22-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY scripts ./scripts
COPY public ./public
RUN mkdir -p /app/data/uploads && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# APP_SECRET must be provided at runtime in production.
CMD ["sh", "-c", "node scripts/migrate.js && node -e \"import('./server/db/seed.js').then(m=>m.seedReference())\" && node server/index.js"]
