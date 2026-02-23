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
 * 
 * ユーザー特定の流れ:
 * 1. checkout.session.completed: メールアドレスから Firebase Auth ユーザーを特定/作成
 *    - 既存ユーザーの場合: getUserByEmail() で uid を取得
 *    - 新規ユーザーの場合: createUser() で新規作成
 *    - Stripe Customer の metadata に firebaseUID を保存（以降の Webhook で参照）
 * 
 * 2. subscription 関連イベント: Stripe Customer の metadata.firebaseUID で特定
 *    - customer.subscription.updated
 *    - customer.subscription.deleted
 *    - invoice.payment_failed
 * 
 * トレードオフ:
 * - 初回決済時のメールで Firebase Auth ユーザーを特定するため、その後 Firebase Auth 側で
 *   メールアドレスを変更しても、metadata.firebaseUID による追跡は継続される
 * - 異なるメールで再購入した場合は別ユーザーとして扱われる（意図的な動作）
 */
export const stripeWebhook = onRequest(
  {
    region: 'asia-northeast1',
    invoker: 'public',
    secrets: [stripeSecret, stripeWebhookSecret],
  },
  async (req, res) => {
    const stripe = new Stripe(stripeSecret.value());

    const sigHeader = req.headers['stripe-signature'];
    if (!sigHeader) {
      res.status(400).send('Missing stripe-signature header');
      return;
    }
    // Coerce header to single string (it can be string | string[])
    const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        stripeWebhookSecret.value(),
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
        if (!email || !session.subscription) {
          res.status(200).json({ received: true });
          return;
        }

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
        
        // Validate subscription has required properties
        if (!subscription || subscription.status === undefined || subscription.current_period_end === undefined) {
          console.error(
            `Invalid subscription data received for session ${session.id}, subscription ${session.subscription}. Missing required properties.`,
          );
          res.status(502).json({
            received: false,
            error: 'Invalid subscription data from Stripe; subscription not saved.',
          });
          return;
        }
        
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
        res.status(200).json({ received: true });
        return;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(
          subscription.customer as string,
        );
        if (!customer.deleted) {
          if (!customer.metadata || !customer.metadata.firebaseUID) {
            console.error(
              `Missing firebaseUID in customer metadata for customer ${subscription.customer}, subscription ${subscription.id}. Unable to update Firestore subscription state.`,
            );
            res
              .status(500)
              .json({
                received: false,
                error:
                  'Missing firebaseUID in customer metadata; subscription update not applied.',
              });
            return;
          }
          const uid = customer.metadata.firebaseUID;
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
        res.status(200).json({ received: true });
        return;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(
          subscription.customer as string,
        );
        if (!customer.deleted) {
          if (!customer.metadata || !customer.metadata.firebaseUID) {
            console.error(
              `Missing firebaseUID in customer metadata for customer ${subscription.customer}, subscription ${subscription.id}. Skipping update.`,
            );
            res.status(200).json({ received: true, skipped: true });
            return;
          }
          const uid = customer.metadata.firebaseUID;
          await db.collection('users').doc(uid).update({
            plan: 'free',
            subscriptionStatus: 'canceled',
            subscriptionId: null,
            currentPeriodEnd: null,
          });
        }
        res.status(200).json({ received: true });
        return;
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
            if (!customer.metadata || !customer.metadata.firebaseUID) {
              console.error(
                `Missing firebaseUID in customer metadata for customer ${subscription.customer}, invoice ${invoice.id}. Skipping update.`,
              );
              res.status(200).json({ received: true, skipped: true });
              return;
            }
            const uid = customer.metadata.firebaseUID;
            await db.collection('users').doc(uid).update({
              subscriptionStatus: 'past_due',
            });
          }
        }
        res.status(200).json({ received: true });
        return;
      }
    }

    // Unrecognized event type — acknowledge receipt so Stripe does not retry
    res.status(200).json({ received: true });
  },
);
