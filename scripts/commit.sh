#!/usr/bin/env bash

cd $ACTION_PATH

cp -r ./tmp/* $GITHUB_WORKSPACE/

cd $GITHUB_WORKSPACE
git config user.email "73682299+scratchaddons-bot[bot]@users.noreply.github.com"
git config user.name "scratchaddons-bot[bot]"

if git status | grep -q "git add"; then
    echo Update available. Pushing to GitHub...
    git add .
    git commit --no-gpg-sign -m "Update DevTools extension"
    git push origin master
    echo Pushed to master
fi
