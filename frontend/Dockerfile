FROM node:20-alpine

WORKDIR /app

COPY --chown=node:node frontend ./frontend

USER node

EXPOSE 5173

CMD ["node", "frontend/server.js"]
