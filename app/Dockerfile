FROM arm64v8/node:20

RUN mkdir /app
WORKDIR /app
COPY ./tnr/package.json ./tnr/tsconfig.json ./tnr/yarn.lock ./

RUN yarn install

RUN echo 'export PS1="\[\e[36m\]AppContainer>\[\e[m\] "' >> /root/.bashrc

ENV PATH /app/node_modules/.bin:$PATH