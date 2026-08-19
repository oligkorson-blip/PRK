import { describe, expect, it } from "vitest";
import { validateScreeningInput } from "./validation";

const validInput = {
  result: "clear",
  screeningNote: "Sanctions and PEP lists checked manually, no hits.",
  sourceOfFundsNote: "Employment income, verified against onboarding note."
};

describe("validateScreeningInput", () => {
  it("accepts a fully valid screening and trims notes", () => {
    const result = validateScreeningInput({
      ...validInput,
      screeningNote: "  Sanctions clear.  ",
      sourceOfFundsNote: "  Employment income. "
    });
    expect(result).toEqual({
      ok: true,
      data: {
        result: "clear",
        screeningNote: "Sanctions clear.",
        sourceOfFundsNote: "Employment income."
      }
    });
  });

  it("allows the source-of-funds note to be omitted or blank", () => {
    const { sourceOfFundsNote, ...rest } = validInput;
    expect(validateScreeningInput(rest)).toEqual({
      ok: true,
      data: { result: "clear", screeningNote: validInput.screeningNote, sourceOfFundsNote: null }
    });
    expect(validateScreeningInput({ ...validInput, sourceOfFundsNote: "   " })).toEqual({
      ok: true,
      data: { result: "clear", screeningNote: validInput.screeningNote, sourceOfFundsNote: null }
    });
  });

  it("accepts review and rejected results", () => {
    expect(validateScreeningInput({ ...validInput, result: "review" }).ok).toBe(true);
    expect(validateScreeningInput({ ...validInput, result: "rejected" }).ok).toBe(true);
  });

  it("rejects an unknown screening result", () => {
    const result = validateScreeningInput({ ...validInput, result: "passed" });
    expect(result).toEqual({ ok: false, error: "Select a valid screening result." });
  });

  it("requires a screening note of at least 8 characters", () => {
    expect(validateScreeningInput({ ...validInput, screeningNote: "" })).toEqual({
      ok: false,
      error: "Screening note required (at least 8 characters)."
    });
    expect(validateScreeningInput({ ...validInput, screeningNote: "short" })).toEqual({
      ok: false,
      error: "Screening note required (at least 8 characters)."
    });
    expect(validateScreeningInput({ ...validInput, screeningNote: undefined })).toEqual({
      ok: false,
      error: "Screening note required (at least 8 characters)."
    });
  });

  it("caps the screening note at 500 characters", () => {
    const result = validateScreeningInput({ ...validInput, screeningNote: "x".repeat(501) });
    expect(result).toEqual({
      ok: false,
      error: "Screening note must be 500 characters or fewer."
    });
  });

  it("caps the source-of-funds note at 500 characters", () => {
    const result = validateScreeningInput({ ...validInput, sourceOfFundsNote: "x".repeat(501) });
    expect(result).toEqual({
      ok: false,
      error: "Source-of-funds note must be 500 characters or fewer."
    });
  });
});
