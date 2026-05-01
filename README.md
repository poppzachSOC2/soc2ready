# SOC 2 Readiness Assessment Tool

A paid assessment tool that walks startup CTOs and security leads through 15 expert-crafted questions across all five SOC 2 Trust Services Criteria, scores their readiness, and delivers a full gap analysis with AI-powered recommendations — gated behind a $49 Stripe payment.

**Stack:** Node.js · Express · Stripe · Anthropic Claude · Mailchimp · Vanilla HTML/CSS/JS

---

## How it works

1. User lands on `index.html` and clicks through the assessment (15 questions, no login required)
2. Their email and company name are collected on the way in
3. After completing the quiz they see their overall score and a blurred domain breakdown
4. The **$49 Full Report** button creates a Stripe Checkout session via `/create-checkout-session`
5. After payment, Stripe redirects to `success.html?session_id=...`
6. `success.html` calls `/verify-session` to confirm payment, then links to `index.html?session_id=...`
7. `index.html` detects `?session_id=` in the URL, restores answers from `localStorage`, and renders the full results including an AI action plan from the Anthropic API
8. The Stripe webhook (`/webhook`) fires asynchronously and subscribes the customer to Mailchimp

---

## Prerequisites

- **Node.js 18+** — required for the built-in `fetch` API used in the Mailchimp integration
- **Stripe account** — [stripe.com](https://stripe.com) (free to create, test mode available)
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com)
- **Mailchimp account** *(optional)* — [mailchimp.com](https://mailchimp.com); the server skips this gracefully if env vars are not set

---

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-username/soc2-readiness.git
cd soc2-readiness

# 2. Install dependencies
npm install

# 3. Copy the example env file
cp .env.example .env

# 4. Fill in your environment variables (see sections below for where to find each value)
open .env   # or: code .env / nano .env

# 5. Start the server
node server.js
# → Server running on port 3000

# 6. Open the app
open index.html   # Open directly in your browser from the filesystem
```

The frontend (`index.html`, `success.html`) are static files — open them directly in a browser. The Express server only needs to be running for the payment flow and API calls.

---

## Environment Variables

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (starts with `sk_test_` or `sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from your Stripe webhook endpoint |
| `YOUR_DOMAIN` | Full URL where the app is hosted, e.g. `https://your-app.up.railway.app` |
| `PORT` | Port for the Express server (default: `3000`) |
| `MAILCHIMP_API_KEY` | Your Mailchimp API key |
| `MAILCHIMP_SERVER_PREFIX` | The prefix in your API key URL, e.g. `us21` |
| `MAILCHIMP_AUDIENCE_ID` | The List ID of your Mailchimp audience |

---

## Stripe Setup

### 1. Get your secret key

1. Log in to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Make sure **Test mode** is toggled on (top-right)
3. Go to **Developers → API keys**
4. Copy the **Secret key** (`sk_test_...`) and paste it into `STRIPE_SECRET_KEY` in your `.env`

### 2. Create a webhook endpoint

1. In the Stripe dashboard go to **Developers → Webhooks**
2. Click **Add endpoint**
3. Set the endpoint URL to:
   - Local: use the Stripe CLI method below instead
   - Production: `https://your-domain.com/webhook`
4. Under **Select events**, choose `checkout.session.completed`
5. Click **Add endpoint**
6. On the next screen, click **Reveal** under **Signing secret** and copy the value (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` in your `.env`

### 3. Test webhooks locally with the Stripe CLI

The Stripe CLI forwards live webhook events to your local server so you can test the full payment flow without deploying.

```bash
# Install the Stripe CLI (macOS)
brew install stripe/stripe-cli/stripe

# Log in
stripe login

# Forward webhook events to your local server
stripe listen --forward-to localhost:3000/webhook
```

The CLI will print a webhook signing secret (`whsec_...`). Use this value as `STRIPE_WEBHOOK_SECRET` while testing locally — it is different from the one in the dashboard.

Leave this running in a separate terminal tab while you test payments.

---

## Testing Payments

Use Stripe's test card to simulate a successful payment without being charged:

| Field | Value |
|---|---|
| Card number | `4242 4242 4242 4242` |
| Expiry | Any future date, e.g. `12/34` |
| CVC | Any 3 digits, e.g. `123` |
| ZIP | Any 5 digits, e.g. `10001` |

After completing checkout, Stripe redirects to `success.html?session_id=...`. The page verifies payment via `/verify-session` and shows a button to unlock the full report.

---

## Railway Deployment

[Railway](https://railway.app) is the fastest way to deploy the Express server with zero configuration.

### 1. Prepare your repo

Push your project to a GitHub repository:

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create soc2-readiness --public --push
```

### 2. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign up or log in
2. Click **New Project → Deploy from GitHub repo**
3. Select your repository
4. Railway detects `railway.json` and starts the deploy automatically

### 3. Add environment variables

1. In your Railway project, click the service tile
2. Go to the **Variables** tab
3. Add each variable from your `.env` file:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `YOUR_DOMAIN` — set this to your Railway domain (see step 4)
   - `MAILCHIMP_API_KEY`
   - `MAILCHIMP_SERVER_PREFIX`
   - `MAILCHIMP_AUDIENCE_ID`
4. Go to the **Settings** tab → **Networking → Generate Domain** to get your Railway URL (e.g. `https://soc2-readiness.up.railway.app`)
5. Copy that URL back into the `YOUR_DOMAIN` variable

### 4. Update your Stripe webhook URL

1. Go to **Stripe dashboard → Developers → Webhooks**
2. Click **Add endpoint** (or edit the existing one)
3. Set the URL to: `https://your-app.up.railway.app/webhook`
4. Select event: `checkout.session.completed`
5. Copy the new **Signing secret** and update `STRIPE_WEBHOOK_SECRET` in Railway

### 5. Update the frontend API URL

In `success.html` and `index.html`, the API base URL is hardcoded to `http://localhost:3000` for local development. Before going live, update both files to use your Railway domain:

```js
// success.html — change:
const API_BASE = 'http://localhost:3000';
// to:
const API_BASE = 'https://your-app.up.railway.app';

// index.html — change the fetch URL in startCheckout():
const res = await fetch('http://localhost:3000/create-checkout-session', ...
// to:
const res = await fetch('https://your-app.up.railway.app/create-checkout-session', ...
```

---

## Revenue Model

| | |
|---|---|
| Price per report | $49.00 |
| Stripe fee (2.9% + $0.30) | −$1.72 |
| **Net per sale** | **$47.28** |

| Monthly sales | Gross | Net (after Stripe fees) |
|---|---|---|
| 10 | $490 | $472.80 |
| 50 | $2,450 | $2,364.00 |
| 100 | $4,900 | $4,728.00 |
| 500 | $24,500 | $23,640.00 |

*Fees calculated at Stripe's standard rate of 2.9% + $0.30 per transaction. International cards and currency conversion may incur additional fees.*

---

## Project Structure

```
soc2-readiness/
├── server.js          # Express server — Stripe, webhook, verify-session
├── index.html         # Assessment tool — all 5 screens, scoring, Stripe redirect
├── success.html       # Post-payment confirmation page
├── package.json       # Dependencies
├── railway.json       # Railway deployment config
├── .env               # Your local secrets (never commit this)
└── .env.example       # Template for required environment variables
```

---

## Local Development Tips

- **No payment needed to see results:** Manually append `?session_id=test` to `index.html` in your browser — the app will attempt to restore `localStorage` and render the results screen. Fill in the form first so `localStorage` is populated.
- **Anthropic API key is client-side:** The key in `index.html` is visible in the browser. For production, proxy the `/v1/messages` call through your Express backend to keep the key server-side.
- **Mailchimp is optional:** Leave those three env vars blank and the server logs a skip message instead of failing.
