#!/bin/bash
set -e

echo "Backing up config files..."
cp servers.json backup-servers.json
cp config.json backup-config.json

echo "Fetching latest changes from GitHub..."
git fetch origin

echo "Resetting project to latest GitHub version..."
git reset --hard origin/main

echo "Restoring config files..."
mv backup-servers.json servers.json
mv backup-config.json config.json

echo "Removing untracked files..."
git clean -fd

echo "Installing updated dependencies..."
npm install

echo "Update completed successfully ✅"
