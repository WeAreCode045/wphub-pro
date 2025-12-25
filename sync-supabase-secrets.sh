#!/bin/bash
# Sync all .env variables to Supabase secrets for Edge Functions
# Usage: ./sync-supabase-secrets.sh

if [ ! -f .env ]; then
  echo ".env file not found!"
  exit 1
fi

# Read .env and set each variable as a Supabase secret
while IFS= read -r line; do
  # Skip comments and empty lines
  if [[ "$line" =~ ^#.*$ ]] || [[ -z "$line" ]]; then
    continue
  fi
  # Only process lines with KEY=VALUE
  if [[ "$line" == *=* ]]; then
    supabase secrets set "$line"
  fi
done < .env

echo "All .env variables have been set as Supabase secrets."
