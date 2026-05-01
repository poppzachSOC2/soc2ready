require('dotenv').config();

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Raw body needed for webhook signature verification — must come before express.json()
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/create-checkout-session', async (req, res) => {
  const { email, company } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'SOC 2 Readiness Full Report',
            },
            unit_amount: 4900,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: { company },
      success_url: `${process.env.YOUR_DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.YOUR_DOMAIN}/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creating checkout session:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('Payment completed for customer:', session.customer_email);
    console.log('Metadata:', session.metadata);

    await addToMailchimp(session.customer_email, session.metadata?.company);
  }

  res.json({ received: true });
});

app.get('/verify-session', async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'Missing session_id' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json({
      email: session.customer_email,
      payment_status: session.payment_status,
      company: session.metadata?.company || '',
    });
  } catch (err) {
    console.error('Error retrieving session:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function addToMailchimp(email, company) {
  const { MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, MAILCHIMP_AUDIENCE_ID } = process.env;

  if (!MAILCHIMP_API_KEY || !MAILCHIMP_SERVER_PREFIX || !MAILCHIMP_AUDIENCE_ID) {
    console.log('Mailchimp env vars not configured — skipping subscribe.');
    return;
  }

  const url = `https://${MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Mailchimp uses HTTP Basic auth: any string + API key
        Authorization: `Basic ${Buffer.from(`anystring:${MAILCHIMP_API_KEY}`).toString('base64')}`,
      },
      body: JSON.stringify({
        email_address: email,
        status: 'subscribed',
        merge_fields: { COMPANY: company || '' },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      // 400 with title "Member Exists" is safe to ignore
      if (data.title === 'Member Exists') {
        console.log('Mailchimp: member already subscribed:', email);
      } else {
        console.error('Mailchimp API error:', data.title, data.detail);
      }
    } else {
      console.log('Mailchimp: subscribed', email);
    }
  } catch (err) {
    // Never crash the webhook over a Mailchimp failure
    console.error('Mailchimp request failed:', err.message);
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
