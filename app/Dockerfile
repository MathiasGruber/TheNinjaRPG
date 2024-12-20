FROM oven/bun:alpine

RUN apk update && apk add bash

RUN mkdir /workspace
RUN mkdir /workspace/app
WORKDIR /workspace/app
COPY ./package.json ./tsconfig.json ./bun.lock ./
RUN chown -R bun /workspace/app

USER bun
RUN bun install --save-text-lockfile
RUN echo 'export PS1="\[\e[36m\]AppContainer>\[\e[m\] "' >> /home/bun/.bashrc
ENV PATH /workspace/app/node_modules/.bin:$PATH