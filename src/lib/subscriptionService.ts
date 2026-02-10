/**
 * Subscription service — handles LemonSqueezy checkout and subscription state
 */

/**
 * Open a LemonSqueezy checkout for the AI Power subscription.
 * Passes the user's Cognito sub as custom_data so the webhook
 * can associate the subscription with the correct user.
 */
export function openAISubscriptionCheckout(userId: string): void {
  const storeId = import.meta.env.VITE_LEMONSQUEEZY_STORE_ID || "";
  const productId = import.meta.env.VITE_LEMONSQUEEZY_AI_PRODUCT_ID || "";

  if (!storeId || !productId) {
    console.error("LemonSqueezy store/product IDs not configured");
    return;
  }

  // Build LemonSqueezy checkout URL with custom data
  const checkoutUrl = new URL(
    `https://${storeId}.lemonsqueezy.com/buy/${productId}`
  );

  // Pass user ID as custom data for webhook association
  checkoutUrl.searchParams.set("checkout[custom][user_id]", userId);

  // Open in new tab
  window.open(checkoutUrl.toString(), "_blank");
}

/**
 * Open the LemonSqueezy customer portal for managing subscriptions.
 */
export function openCustomerPortal(): void {
  const portalUrl = import.meta.env.VITE_LEMONSQUEEZY_PORTAL_URL;
  if (!portalUrl) {
    console.error("LemonSqueezy portal URL not configured");
    return;
  }
  window.open(portalUrl, "_blank");
}
