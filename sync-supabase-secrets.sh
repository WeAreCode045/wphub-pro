#!/bin/bash

# Sync all .env variables to Supabase secrets for Edge Functions
# Usage: ./sync-supabase-secrets.sh
#
# IMPORTANT:
# - Use SB_URL, SB_ANON_KEY, SB_SERVICE_ROLE_KEY for backend/edge function secrets (not SUPABASE_*)
# - VITE_* variables are for frontend only and are not secret
# - This script will set all .env variables as secrets, but only SB_* and other non-SUPABASE_ variables will be accepted by Supabase CLI

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
