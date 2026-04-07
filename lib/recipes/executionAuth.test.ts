import { afterEach, describe, expect, it } from "vitest";

import {
  computeExecutionToken,
  EXECUTION_AUTH_CONFIG_ERROR,
  getExecutionAuthConfigError,
  validateExecutionAuth,
} from "@/lib/recipes/executionAuth";

const ORIGINAL_SECRET = process.env.RECIPE_EXECUTION_SECRET;

afterEach(() => {
  if (typeof ORIGINAL_SECRET === "string") {
    process.env.RECIPE_EXECUTION_SECRET = ORIGINAL_SECRET;
  } else {
    delete process.env.RECIPE_EXECUTION_SECRET;
  }
});

describe("execution auth", () => {
  it("throws and reports config error when RECIPE_EXECUTION_SECRET is missing", async () => {
    delete process.env.RECIPE_EXECUTION_SECRET;

    expect(() => computeExecutionToken("acct-1")).toThrowError(EXECUTION_AUTH_CONFIG_ERROR);
    expect(() =>
      validateExecutionAuth(
        new Request("https://example.com/api/recipes/execution/send-sms", {
          headers: { Authorization: "Bearer abc123" },
        }),
        "acct-1",
      ),
    ).toThrowError(EXECUTION_AUTH_CONFIG_ERROR);
    expect(getExecutionAuthConfigError()).toBe(EXECUTION_AUTH_CONFIG_ERROR);

    const { GET } = await import("@/app/api/recipes/execution/contact/route");
    const response = await GET(
      new Request(
        "https://example.com/api/recipes/execution/contact?accountId=acct-1&contactId=contact-1",
        {
          headers: {
            Authorization: "Bearer anything",
          },
        },
      ) as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: EXECUTION_AUTH_CONFIG_ERROR,
    });
  });

  it("authorizes when bearer token matches account + secret", () => {
    process.env.RECIPE_EXECUTION_SECRET = "super-secret";

    const token = computeExecutionToken("acct-1");
    const request = new Request("https://example.com/api/recipes/execution/send-sms", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(validateExecutionAuth(request, "acct-1")).toBe(true);
  });

  it("rejects mismatched account/token combinations", () => {
    process.env.RECIPE_EXECUTION_SECRET = "super-secret";

    const tokenForAcct1 = computeExecutionToken("acct-1");
    const request = new Request("https://example.com/api/recipes/execution/send-sms", {
      headers: {
        Authorization: `Bearer ${tokenForAcct1}`,
      },
    });

    expect(validateExecutionAuth(request, "acct-2")).toBe(false);
  });
});
