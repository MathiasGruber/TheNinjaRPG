FROM node:20.3-alpine3.17

RUN apk update && apk add bash

RUN mkdir /app
WORKDIR /app
COPY ./tnr/package.json ./tnr/tsconfig.json ./tnr/yarn.lock ./

RUN yarn install

RUN echo 'export PS1="\[\e[36m\]AppContainer>\[\e[m\] "' >> /root/.bashrc

ENV PATH /app/node_modules/.bin:$PATH