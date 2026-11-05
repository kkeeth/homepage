# riotjs-with-vite

via https://dev.to/steeve/riotjs-vitejs-tutorial-fpn

## Local Development Setup

Copy `.env.example` to `.env` (or `.env.local`) in the root directory and fill in the values:

```
# Contact form (Google Apps Script)
VITE_GAS_URL=https://your-backend-api-url.example.com
```

**Important:** Never commit actual secrets to version control. `.env` and `.env.local` are ignored by git and are automatically loaded by Vite.
