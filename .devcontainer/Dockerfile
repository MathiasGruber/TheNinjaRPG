FROM nanomathias/vscode-devcontainer:release-1.2.3

# Install gitmoji
RUN npm i -g gitmoji-cli

# Install drizzle-kit
RUN npm i -g drizzle-kit

# Show we're in devcontainer
RUN bash -c "$(curl -fskSL https://raw.github.com/ohmybash/oh-my-bash/master/tools/install.sh)"
RUN sed -i 's/OSH_THEME="font"/OSH_THEME="agnoster"/g' /home/vscode/.bashrc

# Change to non-root
USER vscode

# Setting the ENTRYPOINT to docker-init.sh will configure non-root access to
# the Docker socket if "overrideCommand": false is set in devcontainer.json.
# The script will also execute CMD if you need to alter startup behaviors.
ENTRYPOINT [ "/usr/local/share/docker-init.sh" ]
CMD [ "sleep", "infinity" ]