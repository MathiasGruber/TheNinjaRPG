# Stripe payments

The web points shop supports Stripe Checkout alongside PayPal. Native shells use the in-app store. Reputation purchases use the existing USD price/award curve and share the rolling 30-day purchase limit with PayPal. Monthly Federal Support costs USD 5 (NORMAL), USD 10 (SILVER), or USD 15 (GOLD). Prices and receipt validation use USD as the integration currency. Managed Payments always enables Adaptive Pricing, so customers can choose USD or a local-currency amount displayed by Stripe.

## Configuration and deployment

Apply the migrations creating `StripeCheckout`/`StripePayment` and adding `StripePayment.reviewRequired` before deploying application code. Federal reconciliation references these tables even when card checkout is disabled. Preserve both tables and their audit rows when rolling back application code.

Use a dedicated Stripe account and separate live and sandbox configurations. Create three active, fixed USD recurring prices with a one-month interval, quantity one, explicit inclusive tax behavior, and the exact amounts above. Configure these server-only variables:

| Variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | Secret or restricted API key for the intended account/environment |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for that environment's webhook endpoint |
| `STRIPE_PRICE_NORMAL` | USD 5 monthly price ID |
| `STRIPE_PRICE_SILVER` | USD 10 monthly price ID |
| `STRIPE_PRICE_GOLD` | USD 15 monthly price ID |

Production checkout requires a live API key. Sandbox receipts cannot grant production reputation or Federal Support. Keep preview/development keys, price IDs, signing secrets and databases separate from production. A publishable key is unnecessary because the server redirects to hosted Checkout.

Configure a snapshot webhook endpoint at `https://<application-host>/api/webhooks/stripe`. Its payload version can follow the account's stable version: the handler uses only the signed event type, environment and object ID, then retrieves authoritative objects using the installed SDK's API version (`2026-09-30.endive` for Stripe 23). Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `invoice.paid`
- `charge.refunded`
- `charge.dispute.created`

Use a limited API key with Checkout Sessions, Customers and Subscriptions write access, and Invoices, Prices and Products read access. Verify session creation with inline reputation products and recurring prices, session retrieval/expiration, and invoice/subscription retrieval before deployment. Payout, transfer and refund access is unnecessary. Webhook requests must reach the application without deployment protection or an interactive login. Set `NEXT_PUBLIC_BASE_URL` to the environment's canonical application origin for return URLs.

Payout currency and schedule are Stripe account settings, independent of the USD prices. Configure monthly automatic payouts and a fixed DKK reserve in Stripe's bank/payout settings when using a DKK settlement bank account. Bank verification and business activation must be completed by the account holder.

## Tax and merchant of record

Enable Managed Payments for the Stripe account in each environment before deploying checkout. All new sessions explicitly request `managed_payments.enabled`; there is no fallback to ordinary Stripe payments. Authoritative sessions and subscriptions must confirm Managed Payments before the application delivers rewards. Paid sessions/invoices must also have completed automatic tax and match the saved USD amount and paid period.

Managed Payments calculates, collects, withholds, files and remits indirect tax for eligible digital sales in its supported tax jurisdictions, including Denmark and the EU. It does not cover separate PayPal payments, earlier sales, company income tax or sales in tax-unsupported countries. Confirm the current country coverage and any remaining registration/filing obligations with the business's accountant. Existing subscriptions cannot be converted by changing this Checkout integration.

All configured prices include applicable tax. Monthly Federal products use the eligible `txcd_10201004` category (streamed video games, subscription with conditional rights); inline reputation products explicitly use `txcd_10000000` (electronically supplied services, without assuming a time-limited game-access purchase). Assign the Federal category to all three configured Stripe products. Configure inclusive tax behavior on every price and the account default; exclusive or unspecified Federal prices are rejected.

Managed Payments controls tax and Adaptive Pricing. Do not send `automatic_tax`, `adaptive_pricing` or payment-method filters (`payment_method_types`/`allowed_payment_method_types`) in session creation. Checkout retains USD integration amounts even if the customer chooses a localized payment amount; localized presentment amounts must never determine game rewards. Stripe/Link sends receipts and handles transaction support; keep the support email current and review refund-request escalation settings.

Managed Payments is an additional 3.5% of the customer payment, plus processing and applicable Billing/conversion fees. It supplies tax services for its transactions; the application does not require a separate Tax Complete subscription. See [integration requirements](https://docs.stripe.com/payments/managed-payments/update-checkout), [tax coverage](https://docs.stripe.com/payments/managed-payments/tax-compliance) and [pricing](https://support.stripe.com/questions/managed-payments-pricing).

## Delivery and Federal Support

Checkout terms and the buyer/recipient are persisted before contacting Stripe. Stripe and PayPal reputation checkouts reserve the same rolling allowance before provider order creation. Both reservation paths serialize allowance changes on the buyer row. Retries reuse Stripe's idempotency key and the saved checkout. Returning through the cancellation URL expires the session before releasing its reservation; the session expiry is fixed at 24 hours after reservation creation, with one additional hour reserved for payment reconciliation. An unknown creation response can be retried with the same idempotency key until 31 minutes before that deadline. A sessionless reservation can be closed after the full 25-hour reservation window; it stays reserved beforehand because Stripe may already have created a payable session.

PayPal reputation orders are created and captured server-side with fixed USD terms and provider idempotency keys. Capture claims the saved reservation before contacting PayPal; cancellation can release only an unclaimed reservation. Capture starts within three hours of reservation creation. Unclaimed reservations expire from allowance accounting after the same three-hour window; cancel unfinished orders through Transaction History to release them earlier. An uncertain capture retains its allowance until reconciliation. PayPal receipt conversion and reputation delivery commit together, so reporting imports and browser retries cannot deliver twice.

Previously captured, unreserved PayPal orders still pass the shared allowance guard. If a legacy payment exceeds the remaining allowance, it is retained as `REVIEW_REQUIRED`, no points or referral bonus are delivered, and the payer receives a support/refund message. Staff must reconcile or refund these payments before treating them as completed game purchases. Revenue reporting includes these received payments and excludes unpaid reservations; referral reconciliation requires a completed delivery.

Neither redirect parameters nor webhook payload amounts establish payment. Fulfillment verifies the webhook signature, retrieves authoritative Stripe state, and checks the saved USD amount, mode, identifiers and paid status. Reputation receipts use payment-intent IDs; subscription receipts use invoice IDs. A single guarded multi-table update commits the receipt claim and reputation credit together. Repeated or reordered delivery cannot credit a receipt twice; retries also repair interrupted Federal Support reconciliation.

PayPal subscription recovery and the renewal job share configured-plan, ownership, exact USD amount and last-payment checks. They persist the authoritative last-payment date rather than refreshing an expired subscription from its active status alone. Subscription approval/reporting can omit a separate order ID; the subscription ID then serves as the non-null provider approval reference in `PaypalSubscription.orderId`, distinguishing externally billed support from reputation-funded rows. A new paid period uses the original billed tier; an existing reputation upgrade remains valid through its saved period.

Federal coverage follows the exact paid invoice period. Reconciliation retains the highest valid tier across Stripe, PayPal and native-store receipts. Failed renewal does not grant another period, and cancellation stops renewal while retaining already-paid coverage. Payers and recipients can cancel Stripe renewal from the Federal tab. Reputation upgrades require an owned, current paid period and atomically debit points once; the upgrade ends with that period, and the next renewal uses the original billed tier.

Character recreation settles pending retained receipts without redelivering points already spent. User-ID changes migrate Stripe checkout and receipt ownership alongside the other purchase ledgers.

## Operations and validation

Before activation, verify sandbox reputation checkout, all three subscription tiers, gifting, cancellation, first invoice and renewal delivery, duplicate webhook replay, and recovery after a failed response. Use a disposable SQL database for the purchase regression tests; the test harness truncates its configured tables. Never point it at production or a shared development database.

Watch Stripe webhook delivery failures and Sentry events tagged `source=stripeWebhook`. Fulfillment errors return HTTP 500 so Stripe can retry. Missing or invalid signatures are rejected before database work. The browser return page can retry an unresolved payment and exposes delivery status/history.

Refunds and disputes raise a Sentry warning for staff review. They do not automatically create negative balances or remove coverage from another provider. Review the Stripe event and retained payment receipt, determine whether rewards have been consumed, and resolve the account through staff procedures. Stripe's dashboard remains the source for financial refunds, disputes and payout administration.

Reputation-funded Federal Support purchases commit the guarded balance debit, recipient tier claim and paid ledger together. Upgrades use one guarded joined update; expired PayPal coverage cannot discount a new purchase. These purchases have no external renewal, and cancelling retains their paid period.
