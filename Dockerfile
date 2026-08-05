FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public
COPY tests ./tests
COPY README.md ./
COPY ARCHITECTURE.md ./
COPY DEPLOYMENT.md ./
COPY DECISIONS.md ./
COPY AI-WORKFLOW.md ./
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
