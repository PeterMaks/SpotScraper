FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY server.js parser.js logger.js ./

# Create logs directory
RUN mkdir -p logs

EXPOSE 3001

CMD ["node", "server.js"]
