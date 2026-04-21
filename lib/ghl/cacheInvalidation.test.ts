import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheStore } from "./cacheStore";

const revalidateTag = vi.fn();

vi.mock("next/cache", () => ({
  revalidateTag,
}));

describe("invalidateGHLCache", () => {
  beforeEach(() => {
    cacheStore.clear();
    revalidateTag.mockReset();
  });

  it("invalidates only the expected cache groups", async () => {
    const { invalidateGHLCache } = await import("./cacheInvalidation");

    cacheStore.set("ghl:acct-1:contacts:list", { value: 1 });
    cacheStore.set("ghl:acct-1:conversations:list", { value: 2 });

    invalidateGHLCache("acct-1", "ContactUpdate", {
      invalidateInMemoryFallback: true,
    });

    expect(revalidateTag).toHaveBeenCalledWith(
      "ghl:acct-1:contacts",
      expect.anything(),
    );
    expect(revalidateTag).not.toHaveBeenCalledWith(
      "ghl:acct-1:conversations",
      expect.anything(),
    );
    expect(cacheStore.has("ghl:acct-1:contacts:list")).toBe(false);
    expect(cacheStore.has("ghl:acct-1:conversations:list")).toBe(true);
  });

  it("maps conversation and appointment events to the right tags", async () => {
    const { invalidateGHLCache } = await import("./cacheInvalidation");

    invalidateGHLCache("acct-2", "ConversationUnreadUpdate");
    invalidateGHLCache("acct-2", "AppointmentStatusUpdate");

    expect(revalidateTag).toHaveBeenNthCalledWith(
      1,
      "ghl:acct-2:conversations",
      expect.anything(),
    );
    expect(revalidateTag).toHaveBeenNthCalledWith(
      2,
      "ghl:acct-2:appointments",
      expect.anything(),
    );
  });
});
