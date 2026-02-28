import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();
const stripeSecret = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

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
        if (!email || !session.subscription) break;

        // メールアドレスから Firebase Auth ユーザーを特定/作成
        let uid: string;
        try {
          const userRecord = await admin.auth().getUserByEmail(email);
          uid = userRecord.uid;
        } catch (err: any) {
          if (err.code !== 'auth/user-not-found') {
            // ネットワーク障害・レートリミット等の一時的エラーは 500 を返し Stripe にリトライさせる
            console.error(`getUserByEmail failed for ${email}:`, err.code, err.message);
            res.status(500).json({ received: false, error: 'Failed to look up user' });
            return;
          }
          // 【設計上の意図】emailVerified: false のまま premium を付与する
          //
          // このフローでは Stripe がチェックアウト時にメールアドレスの実在を担保している。
          // Stripe は決済完了メールをそのアドレスに送付するため、到達不能なメールへの
          // 決済は事実上不可能であり、Firebase のメール確認と同等の信頼性がある。
          //
          // また、マジックリンク（sendSignInLinkToEmail）でサインインした時点で
          // Firebase Auth は自動的に emailVerified を true に更新するため、
          // 初回ログイン後にこのフラグは解消される。
          //
          // よって、メール確認を premium 付与の前提条件にすることはしない。
          // 決済完了 = メール実在確認 として扱う。
          const newUser = await admin.auth().createUser({
            email,
            emailVerified: false,
          });
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
          res.status(500).json({
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
        break;
      }

      case 'customer.subscription.updated': {
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
          const plan = subscription.status === 'active' ? 'premium' : 'free';
          await db
            .collection('users')
            .doc(uid)
            .set(
              {
                plan,
                subscriptionStatus: subscription.status,
                currentPeriodEnd: new Date(
                  subscription.current_period_end * 1000,
                ).toISOString(),
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
            await db.collection('users').doc(uid).set(
              {
                subscriptionStatus: 'past_due',
              },
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
