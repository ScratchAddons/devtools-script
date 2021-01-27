#!/usr/bin/env bash

cd $ACTION_PATH

cp -r ./tmp/* $GITHUB_WORKSPACE/

cd $GITHUB_WORKSPACE
git config user.email "33279053+apple502j@users.noreply.github.com"
git config user.name "apple502j"

if git status | grep -q "git add"; then
    echo Update available. Pushing to GitHub...
    git add .
    git commit --no-gpg-sign -m "Update DevTools extension"
    git push origin master
    echo Pushed to master
fi