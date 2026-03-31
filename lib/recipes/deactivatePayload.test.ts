import test from "node:test";
import assert from "node:assert/strict";
import { parseDeactivateRecipePayload } from "./deactivatePayload";

test("rejects non-object JSON", () => {
  assert.deepEqual(parseDeactivateRecipePayload(null), {
    ok: false,
    error: "Invalid JSON body",
  });
  assert.deepEqual(parseDeactivateRecipePayload("x"), {
    ok: false,
    error: "Invalid JSON body",
  });
});

test("requires recipe_id and account_id", () => {
  assert.deepEqual(parseDeactivateRecipePayload({}), {
    ok: false,
    error: "recipe_id and account_id are required",
  });
  assert.deepEqual(parseDeactivateRecipePayload({ recipe_id: "r" }), {
    ok: false,
    error: "recipe_id and account_id are required",
  });
  assert.deepEqual(parseDeactivateRecipePayload({ account_id: "a" }), {
    ok: false,
    error: "recipe_id and account_id are required",
  });
});

test("trims ids", () => {
  assert.deepEqual(
    parseDeactivateRecipePayload({
      recipe_id: "  missed-call  ",
      account_id: "  9a1b2c3d-4e5f-6789-abcd-ef0123456789  ",
    }),
    {
      ok: true,
      recipeId: "missed-call",
      accountId: "9a1b2c3d-4e5f-6789-abcd-ef0123456789",
    },
  );
});
