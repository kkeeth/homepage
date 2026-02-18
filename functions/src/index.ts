import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();

const stripe = new Stripe(functions.config().stripe.secret_key, {
  apiVersion: '2023-10-16',
});

/**
 * Auth トリガー: ユーザー作成時に Firestore にドキュメントを作成
 */
export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  await db
    .collection('users')
    .doc(user.uid)
    .set({
      email: user.email || null,
      plan: 'free',
      stripeCustomerId: null,
      subscriptionId: null,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      createdAt: new Date().toISOString(),
    });
});

/**
 * HTTP: Stripe Webhook 受信
 * Payment Links 経由の決済完了やサブスク変更を Firestore に反映する
 */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      functions.config().stripe.webhook_secret,
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.client_reference_id;
      if (uid && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
        );
        await db
          .collection('users')
          .doc(uid)
          .update({
            plan: 'premium',
            stripeCustomerId: session.customer as string,
            subscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            currentPeriodEnd: new Date(
              subscription.current_period_end * 1000,
            ).toISOString(),
          });
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const customer = await stripe.customers.retrieve(
        subscription.customer as string,
      );
      if (!customer.deleted) {
        const uid = customer.metadata?.firebaseUID;
        if (uid) {
          const plan = subscription.status === 'active' ? 'premium' : 'free';
          await db
            .collection('users')
            .doc(uid)
            .update({
              plan,
              subscriptionStatus: subscription.status,
              currentPeriodEnd: new Date(
                subscription.current_period_end * 1000,
              ).toISOString(),
            });
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customer = await stripe.customers.retrieve(
        subscription.customer as string,
      );
      if (!customer.deleted) {
        const uid = customer.metadata?.firebaseUID;
        if (uid) {
          await db.collection('users').doc(uid).update({
            plan: 'free',
            subscriptionStatus: 'canceled',
            subscriptionId: null,
            currentPeriodEnd: null,
          });
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription as string,
        );
        const customer = await stripe.customers.retrieve(
          subscription.customer as string,
        );
        if (!customer.deleted) {
          const uid = customer.metadata?.firebaseUID;
          if (uid) {
            await db.collection('users').doc(uid).update({
              subscriptionStatus: 'past_due',
            });
          }
        }
      }
      break;
    }
  }

  res.status(200).json({ received: true });
});
