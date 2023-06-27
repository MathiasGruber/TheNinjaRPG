FROM node:20.3-alpine3.17

RUN apk update && apk add bash
RUN npm install -g pnpm

RUN mkdir /app
WORKDIR /app
COPY ./tnr/package.json ./tnr/tsconfig.json ./tnr/pnpm-lock.yaml ./
RUN chown -R node /app

USER node
RUN pnpm config set store-dir /app/.pnpm-store
RUN pnpm install
RUN echo 'export PS1="\[\e[36m\]AppContainer>\[\e[m\] "' >> /home/node/.bashrc
ENV PATH /app/node_modules/.bin:$PATH