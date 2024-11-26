# Soketi Setup

The files within this folder were used for setting up Soketi on a AWS EC2 instance running on arm architecture. We use Soketi as a replacement for Pusher in order to save costs.

To review current load, SSH into the server and run these commands:

```bash
curl http://127.0.0.1:9601/usage
```

```bash
nvm use 18
pm2 list
```
