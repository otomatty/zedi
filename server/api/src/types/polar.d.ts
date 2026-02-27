declare module "@polar-sh/sdk" {
  export class Polar {
    constructor(options: { accessToken: string; server?: string });
    checkouts: {
      create(params: {
        products: string[];
        externalCustomerId?: string;
        successUrl?: string;
      }): Promise<{ url: string }>;
    };
    customerSessions: {
      create(params: { externalCustomerId?: string }): Promise<{ customerPortalUrl: string }>;
    };
  }
}

declare module "@polar-sh/sdk/webhooks" {
  export class WebhookVerificationError extends Error {}
  export function validateEvent(
    body: string,
    headers: Record<string, string>,
    secret: string,
  ): unknown;
}
