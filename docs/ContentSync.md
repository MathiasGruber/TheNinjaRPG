# Syncing Content

This document describes how to download all game content from live environment, and how to restore it into your local environment.

## Download [Requires TNR developer access]

Install the `pscale` CLI tool from planetscale, and run following command:

```bash
pscale database dump tnr main --tables Bloodline,Item,Jutsu --output ./content_snapshot
```

## Insert data into local database

Install the `pscale` CLI tool from planetscale, and run the following command:

```bash
pscale database restore-dump tnr [BRANCH_NAME] --dir ./content_snapshot --overwrite-tables
```
