This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Environment Variables

Create a `.env.local` in the project root with the following keys:

```bash
MONGODB_URI=...
MONGODB_DB=atoa

# Hedera operator (used by /api/hedera/account to create user accounts)
# Testnet recommended for development
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.xxxxx
HEDERA_OPERATOR_KEY=302e020100300506032b657004220420...
# Optional: initial balance in HBAR for new accounts (default 0)
HEDERA_INITIAL_HBAR=0

# Optional: for AI routes
GOOGLE_GENERATIVE_AI_API_KEY=...

# Pyth price feeds
# Hermes (default public): https://hermes.pyth.network
PYTH_HERMES_URL=https://hermes.pyth.network
# HBAR/USD feed id from Pyth docs: https://docs.pyth.network/price-feeds
# Example (placeholder): 0x... set your actual feed id here
PYTH_PRICE_ID_HBAR_USD=0xYOUR_HBAR_USD_FEED_ID

# HCS topics (optional):
# If set, alerts will publish signals to these topics instead of creating new topics
HEDERA_SIGNAL_TOPIC_BUY=0.0.xxxxx
HEDERA_SIGNAL_TOPIC_SELL=0.0.yyyyy
```