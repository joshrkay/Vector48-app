import test from "node:test";
import assert from "node:assert/strict";
import { parseAccountIdFromRecipeStatusUrl } from "./recipeStatusParams";

test("returns null when account_id is missing", () => {
  assert.equal(parseAccountIdFromRecipeStatusUrl("http://localhost/api/recipes/status"), null);
});

test("returns null when account_id is empty or whitespace", () => {
  assert.equal(parseAccountIdFromRecipeStatusUrl("http://localhost/api/recipes/status?account_id="), null);
  assert.equal(parseAccountIdFromRecipeStatusUrl("http://localhost/api/recipes/status?account_id=%20%20"), null);
});

test("trims account_id", () => {
  assert.equal(
    parseAccountIdFromRecipeStatusUrl(
      "http://localhost/api/recipes/status?account_id=%20%209a1b2c3d-4e5f-6789-abcd-ef0123456789%20%20",
    ),
    "9a1b2c3d-4e5f-6789-abcd-ef0123456789",
  );
});
