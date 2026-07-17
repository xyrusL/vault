# Vault

Your private home for online accounts, passwords, and important login details.

Vault keeps everything organized in one clean dashboard, so you spend less time hunting for credentials and more time getting things done.

## What It Does

- Stores account details and encrypted passwords
- Organizes logins by category, status, and platform
- Supports password login and authenticator codes
- Tracks important account activity
- Imports and exports backups
- Includes an AI assistant for account management

## Built With

- React and Vite
- Tailwind CSS
- Cloudflare Workers
- Cloudflare D1

See [Vault Architecture](docs/architecture.md) for the system diagram and request flows.

## Security

API tokens and encryption keys belong in Cloudflare secrets, never in source control.

Vault is designed for personal use. Keep your deployment private, use a strong password, and enable two-factor authentication.
