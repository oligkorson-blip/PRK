import { beforeEach, describe, expect, it, vi } from "vitest";

// redirect() throws NEXT_REDIRECT in production; mirror that so tests prove
// the throw is never swallowed by requireSessionUserOrRedirect's catch.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT: ${url}`);
  })
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers())
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn() } }
}));

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { requireSessionUserOrRedirect } from "@/lib/auth/session";

const getSessionMock = auth.api.getSession as unknown as ReturnType<typeof vi.fn>;
const redirectMock = redirect as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireSessionUserOrRedirect", () => {
  it("returns the session user when one is signed in", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });

    await expect(requireSessionUserOrRedirect()).resolves.toEqual({ id: "u1", email: "a@b.c" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /sign-in on the expected unauthenticated case", async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(requireSessionUserOrRedirect()).rejects.toThrow("NEXT_REDIRECT: /sign-in");
    expect(redirectMock).toHaveBeenCalledWith("/sign-in");
  });

  it("rethrows unexpected errors instead of masking them as sign-outs", async () => {
    getSessionMock.mockRejectedValue(new Error("session store unreachable"));

    await expect(requireSessionUserOrRedirect()).rejects.toThrow("session store unreachable");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
