/**
 * Forgot-password transport wrapper. The success copy stays generic on
 * purpose (no registered-email enumeration); this helper only surfaces
 * genuine transport failures so the caller can always leave pending state.
 */
export const FORGOT_PASSWORD_ERROR =
  "We couldn't send the reset link just yet. Try again, or email contact@parkwise.eu if it continues.";

export async function requestPasswordResetSafely(
  send: () => Promise<unknown>
): Promise<{ sent: true } | { sent: false; error: string }> {
  try {
    await send();
    return { sent: true };
  } catch {
    return { sent: false, error: FORGOT_PASSWORD_ERROR };
  }
}