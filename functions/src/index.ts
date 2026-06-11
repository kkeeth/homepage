import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();
const stripeSecret = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const stripeWebhookSecretTest = defineSecret('STRIPE_WEBHOOK_SECRET_TEST');

/**
 * Stripe Price を Firestore config/pricing に同期する。
 * recurring な active price のみ対象。interval (month/year) をキーに保存。
 */
async function syncPrice(price: Stripe.Price): Promise<void> {
  if (!price.recurring || !price.active) return;

  const key = price.recurring.interval === 'month' ? 'monthly' : 'yearly';
  await db.collection('config').doc('pricing').set(
    {
      [key]: {
        amount: price.unit_amount,
        currency: price.currency,
        priceId: price.id,
        productId: typeof price.product === 'string' ? price.product : price.product.id,
      },
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * 削除済み Stripe Customer の premium アクセスを剥奪する。
 * metadata が参照不能なため stripeCustomerId でFirestore を逆引きする。
 */
async function revokeAccessByCustomerId(customerId: string): Promise<void> {
  const snapshot = await db
    .collection('users')
    .where('stripeCustomerId', '==', customerId)
    .get();
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.set(
      doc.ref,
      {
        plan: 'free',
        subscriptionStatus: 'canceled',
        subscriptionId: null,
        currentPeriodEnd: null,
      },
      { merge: true },
    );
  });
  if (!snapshot.empty) {
    await batch.commit();
  }
}

/**
 * HTTP: Stripe Webhook 受信
 * Payment Links 経由の決済完了やサブスク変更を Firestore に反映する
 *
 * ユーザー特定の流れ:
 * 1. checkout.session.completed: client_reference_id (Firebase UID) で特定
 *    - フォールバック: メールアドレスから Firebase Auth ユーザーを特定/作成
 *    - Stripe Customer の metadata に firebaseUID を保存（以降の Webhook で参照）
 *
 * 2. subscription 関連イベント: Stripe Customer の metadata.firebaseUID で特定
 *    - customer.subscription.updated
 *    - customer.subscription.deleted
 *    - invoice.payment_failed
 */
export const stripeWebhook = onRequest(
  {
    region: 'asia-northeast1',
    invoker: 'public',
    secrets: [stripeSecret, stripeWebhookSecret, stripeWebhookSecretTest],
  },
  async (req, res) => {
    const stripe = new Stripe(stripeSecret.value(), {
      apiVersion: '2023-10-16',
    });

    const sigHeader = req.headers['stripe-signature'];
    if (!sigHeader) {
      res.status(400).send('Missing stripe-signature header');
      return;
    }
    const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

    const secrets = [stripeWebhookSecret.value(), stripeWebhookSecretTest.value()].filter(Boolean);
    let event: Stripe.Event | null = null;
    for (const secret of secrets) {
      try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, secret);
        break;
      } catch {
        // try next secret
      }
    }
    if (!event) {
      console.error('VERIFICATION_ERROR: No matching webhook secret');
      res.status(400).send('Webhook Error: signature verification failed');
      return;
    }

    switch (event.type) {
      case 'price.created':
      case 'price.updated': {
        const price = event.data.object as Stripe.Price;
        await syncPrice(price);
        break;
      }

      case 'price.deleted': {
        const price = event.data.object as Stripe.Price;
        if (price.recurring?.interval) {
          const key = price.recurring.interval === 'month' ? 'monthly' : 'yearly';
          await db.collection('config').doc('pricing').set(
            { [key]: admin.firestore.FieldValue.delete(), updatedAt: new Date().toISOString() },
            { merge: true },
          );
        }
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (!session.subscription) break;

        const customerId = session.customer as string;
        let uid: string;

        if (session.client_reference_id) {
          try {
            await admin.auth().getUser(session.client_reference_id);
            uid = session.client_reference_id;
          } catch (err: any) {
            console.error(`Invalid client_reference_id: ${session.client_reference_id}`, err.code);
            res.status(400).json({ received: false, error: 'Invalid client_reference_id' });
            return;
          }
        } else {
          const email = session.customer_details?.email;
          if (!email) break;

          try {
            const userRecord = await admin.auth().getUserByEmail(email);
            uid = userRecord.uid;

            const existingDoc = await db.collection('users').doc(uid).get();
            const existingCustomerId = existingDoc.data()?.stripeCustomerId as string | undefined;
            if (existingCustomerId && existingCustomerId !== customerId) {
              console.warn(
                `checkout.session.completed: uid=${uid} already linked to ${existingCustomerId}, rejecting ${customerId}. Possible account takeover attempt.`,
              );
              res.status(200).json({ received: true, skipped: true });
              return;
            }
          } catch (err: any) {
            if (err.code !== 'auth/user-not-found') {
              console.error(`getUserByEmail failed for ${email}:`, err.code, err.message);
              res.status(500).json({ received: false, error: 'Failed to look up user' });
              return;
            }
            const newUser = await admin.auth().createUser({ email, emailVerified: false });
            uid = newUser.uid;
          }
        }

        await stripe.customers.update(customerId, { metadata: { firebaseUID: uid } });

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        if (!subscription || subscription.status === undefined || subscription.current_period_end === undefined) {
          console.error(`Invalid subscription data for session ${session.id}`);
          res.status(500).json({ received: false, error: 'Invalid subscription data from Stripe' });
          return;
        }

        await db.collection('users').doc(uid).set(
          {
            plan: 'premium',
            stripeCustomerId: customerId,
            subscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
            createdAt: new Date().toISOString(),
          },
          { merge: true },
        );
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if (!customer.deleted) {
          if (!customer.metadata?.firebaseUID) {
            console.error(
              `Missing firebaseUID in customer metadata for customer ${subscription.customer}`,
            );
            res.status(200).json({ received: true, skipped: true });
            return;
          }
          const uid = customer.metadata.firebaseUID;
          const plan = subscription.status === 'active' ? 'premium' : 'free';
          await db.collection('users').doc(uid).set(
            {
              plan,
              subscriptionStatus: subscription.status,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
            },
            { merge: true },
          );
        } else {
          console.warn(`Customer ${subscription.customer} is deleted; revoking premium access.`);
          await revokeAccessByCustomerId(subscription.customer as string);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if (!customer.deleted) {
          if (!customer.metadata?.firebaseUID) {
            console.error(
              `Missing firebaseUID in customer metadata for customer ${subscription.customer}`,
            );
            res.status(200).json({ received: true, skipped: true });
            return;
          }
          const uid = customer.metadata.firebaseUID;
          await db.collection('users').doc(uid).set(
            {
              plan: 'free',
              subscriptionStatus: 'canceled',
              subscriptionId: null,
              currentPeriodEnd: null,
            },
            { merge: true },
          );
        } else {
          console.warn(`Customer ${subscription.customer} is deleted; revoking premium access.`);
          await revokeAccessByCustomerId(subscription.customer as string);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          if (!customer.deleted) {
            if (!customer.metadata?.firebaseUID) {
              console.error(
                `Missing firebaseUID in customer metadata for customer ${subscription.customer}`,
              );
              res.status(200).json({ received: true, skipped: true });
              return;
            }
            const uid = customer.metadata.firebaseUID;
            await db.collection('users').doc(uid).set(
              { subscriptionStatus: 'past_due' },
              { merge: true },
            );
          } else {
            console.warn(`Customer ${subscription.customer} is deleted; revoking premium access.`);
            await revokeAccessByCustomerId(subscription.customer as string);
          }
        }
        break;
      }
    }

    res.status(200).json({ received: true });
  },
);
