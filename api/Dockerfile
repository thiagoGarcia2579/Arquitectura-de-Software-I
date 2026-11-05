FROM node:22-alpine
WORKDIR /app
# Primero solo las dependencias: si no cambian, Docker reutiliza esta capa (cache)
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 3000
CMD ["node", "src/index.js"]
