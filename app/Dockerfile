FROM node:22-alpine3.19

RUN apk update && apk add bash
RUN npm install -g pnpm

RUN mkdir /workspace
RUN mkdir /workspace/app
WORKDIR /workspace/app
COPY ./package.json ./tsconfig.json ./pnpm-lock.yaml ./
RUN chown -R node /workspace/app

USER node
RUN pnpm config set store-dir /workspace/app/.pnpm-store
RUN pnpm install
RUN echo 'export PS1="\[\e[36m\]AppContainer>\[\e[m\] "' >> /home/node/.bashrc
ENV PATH /workspace/app/node_modules/.bin:$PATH