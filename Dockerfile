FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json ./
RUN yarn install

COPY . .

RUN yarn build

EXPOSE 3020

CMD ["yarn", "start:prod"]
