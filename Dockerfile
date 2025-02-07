# Copyright © 2025 Navarrotech

FROM node:latest

# Base app directory
WORKDIR /app

COPY package.json .
COPY tsconfig.json .
COPY yarn.lock .
COPY ./src/ src/
COPY ./prisma/ prisma/

RUN yarn
CMD ["yarn", "start"]

# Prisma
RUN yarn prisma generate

# Run tools
RUN yarn global add typescript tsx
