import { describe, expect, it } from "vitest";
import { assertTransition, canTransitionInterest } from "@/lib/interests/transitions";

describe("canTransitionInterest", () => {
  it("allows pending to confirmed|declined|withdrawn", () => {
    expect(canTransitionInterest("pending", "confirmed")).toBe(true);
    expect(canTransitionInterest("pending", "declined")).toBe(true);
    expect(canTransitionInterest("pending", "withdrawn")).toBe(true);
  });
  it("rejects transitions out of confirmed/declined", () => {
    expect(canTransitionInterest("confirmed", "declined")).toBe(false);
    expect(canTransitionInterest("declined", "pending")).toBe(false);
  });
  it("rejects reactivating a withdrawn interest", () => {
    expect(canTransitionInterest("withdrawn", "pending")).toBe(false);
    expect(canTransitionInterest("withdrawn", "confirmed")).toBe(false);
    expect(canTransitionInterest("withdrawn", "declined")).toBe(false);
  });
  it("rejects self-transitions", () => {
    expect(canTransitionInterest("pending", "pending")).toBe(false);
    expect(canTransitionInterest("confirmed", "confirmed")).toBe(false);
  });
});

describe("assertTransition", () => {
  it("throws on an illegal transition", () => {
    expect(() => assertTransition("withdrawn", "pending")).toThrow(
      "Illegal interest transition withdrawn → pending"
    );
  });
  it("does not throw on a legal transition", () => {
    expect(() => assertTransition("pending", "confirmed")).not.toThrow();
  });
});
