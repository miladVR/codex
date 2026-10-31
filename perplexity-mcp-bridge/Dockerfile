FROM node:20-alpine
WORKDIR /app
COPY perplexity-mcp-bridge/package*.json ./
RUN npm install --omit=dev
COPY perplexity-mcp-bridge/ .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm","start"]
