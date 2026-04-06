"use client";

const SILENCE_TIMEOUT_MS = 3_000;
const MAX_RECORDING_MS = 20_000;
const LEVEL_SAMPLE_MS = 150;
const SPEECH_THRESHOLD = 0.02;

export type VoiceRecognitionErrorCode =
  | "permission_denied"
  | "unavailable"
  | "no_speech"
  | "network"
  | "aborted"
  | "transcription_failed"
  | "unknown";

export class VoiceRecognitionError extends Error {
  code: VoiceRecognitionErrorCode;

  constructor(code: VoiceRecognitionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface StartListeningOptions {
  onInterimResult?: (value: string) => void;
  signal?: AbortSignal;
}

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

async function ensureMicPermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new VoiceRecognitionError(
      "unavailable",
      "Microphone access is not available in this browser.",
    );
  }

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    throw new VoiceRecognitionError(
      "permission_denied",
      "Microphone permission is required for voice navigation.",
    );
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

async function transcribeBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  form.set("audio", blob, "voice.webm");

  const response = await fetch("/api/voice/transcribe", {
    method: "POST",
    body: form,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    transcript?: string;
    error?: string;
  };

  if (!response.ok || !payload.transcript?.trim()) {
    throw new VoiceRecognitionError(
      "transcription_failed",
      payload.error ?? "Could not transcribe audio.",
    );
  }

  return payload.transcript.trim();
}

function waitForAbort(signal: AbortSignal, onAbort: () => void) {
  if (signal.aborted) {
    onAbort();
    return () => {};
  }
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

function getMediaRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

async function startWhisperFallback(
  options: StartListeningOptions,
): Promise<string> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new VoiceRecognitionError(
      "unavailable",
      "Voice recognition is not supported in this browser.",
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContext();
  const sourceNode = audioContext.createMediaStreamSource(stream);
  const analyzer = audioContext.createAnalyser();
  analyzer.fftSize = 2048;
  sourceNode.connect(analyzer);

  const mimeType = getMediaRecorderMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  const sampleBuffer = new Float32Array(analyzer.fftSize);

  let lastSpeechAt = Date.now();
  let ended = false;
  let silenceInterval: ReturnType<typeof setInterval> | null = null;
  let hardStopTimeout: ReturnType<typeof setTimeout> | null = null;
  let removeAbortListener = () => {};

  const cleanup = () => {
    if (ended) return;
    ended = true;
    if (silenceInterval) clearInterval(silenceInterval);
    if (hardStopTimeout) clearTimeout(hardStopTimeout);
    removeAbortListener();
    stream.getTracks().forEach((track) => track.stop());
    void audioContext.close().catch(() => undefined);
  };

  return new Promise<string>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = () => {
      cleanup();
      reject(
        new VoiceRecognitionError("unknown", "Could not record microphone audio."),
      );
    };

    recorder.onstop = async () => {
      cleanup();
      try {
        if (!chunks.length) {
          throw new VoiceRecognitionError(
            "no_speech",
            "I did not hear any speech.",
          );
        }
        const blob = new Blob(chunks, {
          type: mimeType ?? "audio/webm",
        });
        const transcript = await transcribeBlob(blob);
        if (!transcript) {
          throw new VoiceRecognitionError("no_speech", "I did not hear any speech.");
        }
        resolve(transcript);
      } catch (error) {
        reject(
          error instanceof VoiceRecognitionError
            ? error
            : new VoiceRecognitionError("unknown", "Voice transcription failed."),
        );
      }
    };

    try {
      recorder.start(250);
    } catch {
      cleanup();
      reject(
        new VoiceRecognitionError("unknown", "Could not start microphone recording."),
      );
      return;
    }

    silenceInterval = setInterval(() => {
      analyzer.getFloatTimeDomainData(sampleBuffer);
      let sumSquares = 0;
      for (let i = 0; i < sampleBuffer.length; i += 1) {
        const value = sampleBuffer[i];
        sumSquares += value * value;
      }
      const rms = Math.sqrt(sumSquares / sampleBuffer.length);
      if (rms > SPEECH_THRESHOLD) {
        lastSpeechAt = Date.now();
      }
      if (Date.now() - lastSpeechAt >= SILENCE_TIMEOUT_MS && recorder.state === "recording") {
        recorder.stop();
      }
    }, LEVEL_SAMPLE_MS);

    hardStopTimeout = setTimeout(() => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, MAX_RECORDING_MS);

    if (options.signal) {
      removeAbortListener = waitForAbort(options.signal, () => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
        reject(new VoiceRecognitionError("aborted", "Voice capture cancelled."));
      });
    }
  });
}

async function startWebSpeechRecognition(
  options: StartListeningOptions,
  Ctor: new () => SpeechRecognitionLike,
): Promise<string> {
  await ensureMicPermission();

  return new Promise<string>((resolve, reject) => {
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";
    let isResolved = false;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let removeAbortListener = () => {};

    const clearSilenceTimer = () => {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    };

    const resetSilenceTimer = () => {
      clearSilenceTimer();
      silenceTimer = setTimeout(() => {
        recognition.stop();
      }, SILENCE_TIMEOUT_MS);
    };

    const fail = (error: VoiceRecognitionError) => {
      if (isResolved) return;
      isResolved = true;
      clearSilenceTimer();
      removeAbortListener();
      reject(error);
    };

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";
        if (result.isFinal) {
          finalTranscript += `${transcript} `;
        } else {
          interim += transcript;
        }
      }
      const preview = `${finalTranscript}${interim}`.trim();
      options.onInterimResult?.(preview);
      if (preview) {
        resetSilenceTimer();
      }
    };

    recognition.onerror = (event) => {
      const errorCode = event.error ?? "unknown";
      if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
        fail(
          new VoiceRecognitionError(
            "permission_denied",
            "Microphone permission is required for voice navigation.",
          ),
        );
        return;
      }
      if (errorCode === "no-speech") {
        fail(new VoiceRecognitionError("no_speech", "I did not hear any speech."));
        return;
      }
      if (errorCode === "network") {
        fail(new VoiceRecognitionError("network", "Speech recognition network error."));
        return;
      }
      if (errorCode === "aborted") {
        fail(new VoiceRecognitionError("aborted", "Voice capture cancelled."));
        return;
      }
      fail(new VoiceRecognitionError("unknown", "Speech recognition failed."));
    };

    recognition.onend = () => {
      if (isResolved) return;
      const transcript = finalTranscript.trim();
      if (!transcript) {
        fail(new VoiceRecognitionError("no_speech", "I did not hear any speech."));
        return;
      }
      isResolved = true;
      clearSilenceTimer();
      removeAbortListener();
      resolve(transcript);
    };

    if (options.signal) {
      removeAbortListener = waitForAbort(options.signal, () => {
        recognition.abort();
        fail(new VoiceRecognitionError("aborted", "Voice capture cancelled."));
      });
    }

    try {
      recognition.start();
      resetSilenceTimer();
    } catch {
      fail(
        new VoiceRecognitionError("unavailable", "Speech recognition is unavailable."),
      );
    }
  });
}

export async function startListening(
  options: StartListeningOptions = {},
): Promise<string> {
  const ctor = getSpeechRecognitionCtor();
  if (ctor) {
    try {
      return await startWebSpeechRecognition(options, ctor);
    } catch (error) {
      if (
        error instanceof VoiceRecognitionError &&
        (error.code === "permission_denied" || error.code === "aborted")
      ) {
        throw error;
      }
      return startWhisperFallback(options);
    }
  }

  return startWhisperFallback(options);
}

