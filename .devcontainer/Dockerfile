FROM nanomathias/vscode-devcontainer:release-1.2.3

# Install gitmoji
RUN npm i -g gitmoji-cli

# Install drizzle-kit
RUN npm i -g drizzle-kit

# Show we're in devcontainer
RUN echo 'export PS1="\[\e[36m\]DevContainer>\[\e[m\] "' >> /home/vscode/.bashrc

# Change to non-root
USER vscode

# Setting the ENTRYPOINT to docker-init.sh will configure non-root access to
# the Docker socket if "overrideCommand": false is set in devcontainer.json.
# The script will also execute CMD if you need to alter startup behaviors.
ENTRYPOINT [ "/usr/local/share/docker-init.sh" ]
CMD [ "sleep", "infinity" ]