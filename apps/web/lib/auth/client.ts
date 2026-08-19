import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  // twoFactorPage: a 2FA-required sign-in response redirects here automatically.
  plugins: [twoFactorClient({ twoFactorPage: "/two-factor" })]
});
