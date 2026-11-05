FROM node:22-alpine
WORKDIR /app
# Sin dependencias externas: usa el http que ya trae Node
COPY package.json index.js expedientes.wsdl ./
EXPOSE 4100
CMD ["node", "index.js"]
