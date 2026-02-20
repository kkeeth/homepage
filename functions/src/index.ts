import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();
const stripeSecret = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

/**
 * HTTP: Stripe Webhook 受信
 * Payment Links 経由の決済完了やサブスク変更を Firestore に反映する
 */
export const stripeWebhook = onRequest(
  {
    region: 'asia-northeast1',
    invoker: 'public',
    secrets: [stripeSecret, stripeWebhookSecret],
  },
  async (req, res) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

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
        process.env.STRIPE_WEBHOOK_SECRET || '',
      );
    } catch (err: any) {
      console.error('VERIFICATION_ERROR_DETAIL:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const email = session.customer_details?.email;
        if (!email || !session.subscription) break;

        // メールアドレスから Firebase Auth ユーザーを特定/作成
        let uid: string;
        try {
          const userRecord = await admin.auth().getUserByEmail(email);
          uid = userRecord.uid;
        } catch {
          const newUser = await admin.auth().createUser({ email });
          uid = newUser.uid;
        }

        // Stripe Customer に firebaseUID を保存（以降の Webhook で参照）
        const customerId = session.customer as string;
        await stripe.customers.update(customerId, {
          metadata: { firebaseUID: uid },
        });

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
        );
        await db
          .collection('users')
          .doc(uid)
          .set(
            {
              plan: 'premium',
              stripeCustomerId: customerId,
              subscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
              currentPeriodEnd: new Date(
                subscription.current_period_end * 1000,
              ).toISOString(),
              createdAt: new Date().toISOString(),
            },
            { merge: true },
          );
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
  },
);
