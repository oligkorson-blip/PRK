import { describe, expect, it } from "vitest";
import {
  TWO_FACTOR_BACKUP_CODES_CONNECTION_ERROR,
  TWO_FACTOR_BACKUP_CODES_SAVED_LABEL,
  TWO_FACTOR_BACKUP_CODES_STEP,
  TWO_FACTOR_BACKUP_STORAGE_GUIDANCE,
  TWO_FACTOR_CONNECTION_ERROR,
  TWO_FACTOR_DISABLE_CONNECTION_ERROR,
  TWO_FACTOR_LOST_ACCESS_PROMPT,
  TWO_FACTOR_NEW_BACKUP_CODES_NOTICE,
  TWO_FACTOR_SETUP_CONNECTION_ERROR,
  TWO_FACTOR_VERIFY_CONNECTION_ERROR
} from "@/lib/copy/security";

describe("two-factor recovery copy", () => {
  it("gives a calm retry path and a single support route", () => {
    expect(TWO_FACTOR_CONNECTION_ERROR).toBe(
      "We couldn't complete verification just yet. Check your connection and try again, or contact the team if it continues."
    );
    expect(TWO_FACTOR_LOST_ACCESS_PROMPT).toBe("Lost access to your authenticator?");
    expect(TWO_FACTOR_DISABLE_CONNECTION_ERROR).toBe(
      "We couldn't disable two-factor just yet. Check your connection and try again, or contact the team if it continues."
    );
    expect(TWO_FACTOR_BACKUP_CODES_CONNECTION_ERROR).toBe(
      "We couldn't regenerate backup codes just yet. Check your connection and try again, or contact the team if it continues."
    );
    expect(TWO_FACTOR_SETUP_CONNECTION_ERROR).toBe(
      "We couldn't start two-factor setup just yet. Check your connection and try again, or contact the team if it continues."
    );
    expect(TWO_FACTOR_VERIFY_CONNECTION_ERROR).toBe(
      "We couldn't verify the code just yet. Check your connection and try again, or contact the team if it continues."
    );
    expect(TWO_FACTOR_BACKUP_STORAGE_GUIDANCE).toBe("Keep your backup codes in a secure place.");
    expect(TWO_FACTOR_NEW_BACKUP_CODES_NOTICE).toBe(
      "New backup codes — save them in a secure place now. Your previous codes have been replaced."
    );
    expect(TWO_FACTOR_BACKUP_CODES_STEP).toBe(
      "2. Save these one-time backup codes in a secure place"
    );
    expect(TWO_FACTOR_BACKUP_CODES_SAVED_LABEL).toBe(
      "I saved the backup codes in a secure place."
    );
  });
});
