"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/types";
import type { AuditSuggestion } from "@/lib/recipes/estimate-audit/schema";

export type EstimateVertical = Database["public"]["Enums"]["vertical"];

const VERTICAL_OPTIONS: { value: EstimateVertical; label: string }[] = [
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "roofing", label: "Roofing" },
  { value: "landscaping", label: "Landscaping" },
];

interface EstimateInputProps {
  defaultVertical: EstimateVertical;
  onAnalyzeSuccess: (payload: {
    auditLogId: string;
    suggestions: AuditSuggestion[];
    summary: string;
    totalPotentialValue: number;
  }) => void;
}

export function EstimateInput({
  defaultVertical,
  onAnalyzeSuccess,
}: EstimateInputProps) {
  const [mode, setMode] = React.useState<"upload" | "paste">("paste");
  const [estimateText, setEstimateText] = React.useState("");
  const [vertical, setVertical] =
    React.useState<EstimateVertical>(defaultVertical);
  const [jobType, setJobType] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [pdfLoading, setPdfLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pdfWarning, setPdfWarning] = React.useState<string | null>(null);

  React.useEffect(() => {
    setVertical(defaultVertical);
  }, [defaultVertical]);

  const extractPdf = async (file: File) => {
    setPdfLoading(true);
    setError(null);
    setPdfWarning(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/recipes/estimate-audit/extract-pdf", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as {
        text?: string;
        warning?: string;
        error?: string;
        limitation?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not read PDF");
        return;
      }
      setEstimateText(data.text ?? "");
      if (data.warning === "little_or_no_text") {
        setPdfWarning(
          "Very little text was extracted. This may be a scanned PDF — OCR is not available yet.",
        );
      }
    } catch {
      setError("Could not read PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) void extractPdf(f);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void extractPdf(f);
  };

  const analyze = async () => {
    const text = estimateText.trim();
    if (!text) {
      setError("Add estimate text or upload a PDF first.");
      return;
    }
    if (!jobType.trim()) {
      setError("Enter a job type (e.g. AC replacement).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recipes/estimate-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimateText: text,
          vertical,
          jobType: jobType.trim(),
        }),
      });
      const data = (await res.json()) as {
        auditLogId?: string;
        suggestions?: AuditSuggestion[];
        summary?: string;
        totalPotentialValue?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Analysis failed");
        return;
      }
      if (
        !data.auditLogId ||
        !data.suggestions ||
        !data.summary ||
        data.totalPotentialValue === undefined
      ) {
        setError("Unexpected response");
        return;
      }
      onAnalyzeSuccess({
        auditLogId: data.auditLogId,
        suggestions: data.suggestions,
        summary: data.summary,
        totalPotentialValue: data.totalPotentialValue,
      });
    } catch {
      setError("Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as "upload" | "paste")}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="paste">Paste text</TabsTrigger>
          <TabsTrigger value="upload">Upload PDF</TabsTrigger>
        </TabsList>
        <TabsContent value="paste" className="mt-3">
          <Label htmlFor="estimate-paste" className="text-xs text-muted-foreground">
            Estimate text
          </Label>
          <textarea
            id="estimate-paste"
            className={cn(
              "mt-1 flex min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
              "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
            placeholder="Paste the estimate here…"
            value={estimateText}
            onChange={(e) => setEstimateText(e.target.value)}
          />
        </TabsContent>
        <TabsContent value="upload" className="mt-3 space-y-2">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                document.getElementById("pdf-file")?.click();
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className={cn(
              "flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50",
              pdfLoading && "pointer-events-none opacity-60",
            )}
            onClick={() => document.getElementById("pdf-file")?.click()}
          >
            <Upload className="mb-2 h-8 w-8 opacity-50" />
            <span>Drag and drop a PDF here, or click to browse</span>
            <span className="mt-2 text-xs">
              v1 supports text-based PDFs only (no OCR for scans).
            </span>
            <input
              id="pdf-file"
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={onFileInput}
            />
          </div>
          {pdfLoading && <p className="text-xs text-muted-foreground">Reading PDF…</p>}
          {estimateText && mode === "upload" && (
            <div className="mt-2">
              <Label className="text-xs text-muted-foreground">Extracted text</Label>
              <textarea
                className={cn(
                  "mt-1 flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                )}
                value={estimateText}
                onChange={(e) => setEstimateText(e.target.value)}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {pdfWarning && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{pdfWarning}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="vertical" className="text-xs text-muted-foreground">
            Vertical
          </Label>
          <select
            id="vertical"
            className={cn(
              "mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
            value={vertical}
            onChange={(e) =>
              setVertical(e.target.value as EstimateVertical)
            }
          >
            {VERTICAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="job-type" className="text-xs text-muted-foreground">
            Job type
          </Label>
          <Input
            id="job-type"
            className="mt-1"
            placeholder="e.g. AC replacement, water heater install"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="button"
        className="w-full sm:w-auto"
        disabled={loading}
        onClick={() => void analyze()}
      >
        {loading ? "Analyzing…" : "Analyze Estimate"}
      </Button>
    </div>
  );
}
