import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";

admin.initializeApp();
const db = admin.firestore();

const stripe = new Stripe(functions.config().stripe.secret_key, {
  apiVersion: "2024-04-10",
});

/**
 * Callable: Stripe Checkout Session を作成
 */
export const createCheckoutSession = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "ログインが必要です"
      );
    }

    const uid = context.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();

    let customerId = userData?.stripeCustomerId;

    // Stripe Customer がなければ作成
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: context.auth.token.email,
        metadata: { firebaseUID: uid },
      });
      customerId = customer.id;
      await db.collection("users").doc(uid).update({
        stripeCustomerId: customerId,
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: functions.config().stripe.price_id,
          quantity: 1,
        },
      ],
      success_url: `${data.origin}/account?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${data.origin}/account`,
      metadata: { firebaseUID: uid },
    });

    return { sessionId: session.id, url: session.url };
  }
);

/**
 * HTTP: Stripe Webhook 受信
 */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!sig) {
    res.status(400).send("Missing stripe-signature header");
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      functions.config().stripe.webhook_secret
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    res.status(400).send("Webhook signature verification failed");
    return;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.metadata?.firebaseUID;
      if (uid && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        await db
          .collection("users")
          .doc(uid)
          .update({
            plan: "premium",
            subscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            currentPeriodEnd: new Date(
              subscription.current_period_end * 1000
            ).toISOString(),
          });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customer = await stripe.customers.retrieve(
        subscription.customer as string
      );
      if (!customer.deleted) {
        const uid = customer.metadata?.firebaseUID;
        if (uid) {
          const plan =
            subscription.status === "active" ? "premium" : "free";
          await db
            .collection("users")
            .doc(uid)
            .update({
              plan,
              subscriptionStatus: subscription.status,
              currentPeriodEnd: new Date(
                subscription.current_period_end * 1000
              ).toISOString(),
            });
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customer = await stripe.customers.retrieve(
        subscription.customer as string
      );
      if (!customer.deleted) {
        const uid = customer.metadata?.firebaseUID;
        if (uid) {
          await db.collection("users").doc(uid).update({
            plan: "free",
            subscriptionStatus: "canceled",
            subscriptionId: null,
            currentPeriodEnd: null,
          });
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription as string
        );
        const customer = await stripe.customers.retrieve(
          subscription.customer as string
        );
        if (!customer.deleted) {
          const uid = customer.metadata?.firebaseUID;
          if (uid) {
            await db.collection("users").doc(uid).update({
              subscriptionStatus: "past_due",
            });
          }
        }
      }
      break;
    }
  }

  res.status(200).json({ received: true });
});

/**
 * Callable: Stripe Customer Portal Session を作成
 */
export const customerPortalSession = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "ログインが必要です"
      );
    }

    const uid = context.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.stripeCustomerId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Stripe顧客IDが見つかりません"
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: userData.stripeCustomerId,
      return_url: `${data.origin}/account`,
    });

    return { url: session.url };
  }
);
