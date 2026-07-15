FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server ./
COPY admin-merchant /app/admin-merchant
COPY admin-ops /app/admin-ops
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "src/server.js"]
