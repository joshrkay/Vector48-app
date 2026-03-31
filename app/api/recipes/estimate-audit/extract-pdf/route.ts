import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * v1: Text-based PDFs only. Scanned/image PDFs need OCR (planned enhancement).
 */
export async function POST(req: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "PDF file required" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  let text: string;
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const result = await parser.getText();
    text = result.text ?? "";
    await parser.destroy();
  } catch (e) {
    console.error("[extract-pdf] parse failed", e);
    return NextResponse.json(
      { error: "Could not read PDF", text: "", warning: "parse_failed" },
      { status: 422 },
    );
  }

  const trimmed = text.replace(/\s+/g, " ").trim();
  const warning =
    trimmed.length < 20
      ? "little_or_no_text"
      : undefined;

  return NextResponse.json({
    text: trimmed,
    warning,
    limitation:
      "Text-based PDFs only in v1. Scanned PDFs require OCR (future release).",
  });
}
