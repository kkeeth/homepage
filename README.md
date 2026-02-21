# riotjs-with-vite
via https://dev.to/steeve/riotjs-vitejs-tutorial-fpn

## Local Development Setup

For local development environments, create environment variables in `.env.local` files and set each secret there:

### Root Directory `.env.local`

Create a `.env.local` file in the root directory with the following variables:

```
# Feed and API URLs
VITE_RSS_URL=https://your-rss-feed-url.example.com/feed
VITE_GAS_URL=https://your-backend-api-url.example.com

# Firebase
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-firebase-sender-id
VITE_FIREBASE_APP_ID=your-firebase-app-id

# Stripe Payment Links
VITE_STRIPE_PAYMENT_LINK_URL=https://checkout.stripe.com/pay/your-payment-link-id
VITE_STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/your-portal-link-id
```

### Functions Directory `.env.local`

Create a `.env.local` file in the `functions/` directory with the following variables:

```
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
```

**Important:** Never commit actual secrets to version control. The `.env.local` files are ignored by git to prevent accidental exposure of credentials and are automatically loaded by Vite, so use `.env.local` (not `.env`) for any local secret values.
