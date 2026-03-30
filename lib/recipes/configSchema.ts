import { z } from "zod";
import type { RecipeConfigField } from "@/types/recipes";

export function buildRecipeConfigZodSchema(
  fields: RecipeConfigField[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const f of fields) {
    let fieldSchema: z.ZodTypeAny;

    switch (f.type) {
      case "text":
      case "textarea":
        fieldSchema = z.string();
        break;
      case "phone":
        fieldSchema = z
          .string()
          .min(10, "Enter a valid phone number")
          .regex(/^[\d\s\-+().]+$/, "Enter a valid phone number");
        break;
      case "number":
        fieldSchema = z.coerce.number();
        break;
      case "boolean":
      case "toggle":
        fieldSchema = z.boolean();
        break;
      case "select":
        if (f.options?.length) {
          const allowed = f.options;
          fieldSchema = z
            .string()
            .refine((v) => allowed.includes(v), "Select a valid option");
        } else {
          fieldSchema = z.string();
        }
        break;
      default:
        fieldSchema = z.unknown();
    }

    if (!f.required) {
      fieldSchema = fieldSchema.optional();
    }

    shape[f.name] = fieldSchema;
  }

  return z.object(shape);
}
