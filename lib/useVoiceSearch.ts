"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceLang = "ur-PK" | "en-IN";
type Engine = "web" | "native" | null;

type NativeSR = {
  available(): Promise<{ available: boolean }>;
  requestPermissions(): Promise<unknown>;
  start(o: { language?: string; maxResults?: number; prompt?: string; partialResults?: boolean; popup?: boolean }): Promise<{ matches?: string[] }>;
};

/**
 * Voice input.
 *  - Chrome / Edge / installed PWA: the browser's SpeechRecognition (needs internet + microphone permission).
 *  - Inside the Android app (Capacitor): the native speech plugin, which shows Android's "Speak now" dialog.
 * `supported` is false where neither exists, so the mic button is simply not shown.
 */
export function useVoiceSearch(onResult: (text: string) => void) {
  const [engine, setEngine] = useState<Engine>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rec = useRef<any>(null);
  const native = useRef<NativeSR | null>(null);
  const cb = useRef(onResult);
  useEffect(() => { cb.current = onResult; });

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { Capacitor, registerPlugin } = await import("@capacitor/core");
        if (Capacitor.isNativePlatform()) {
          native.current = registerPlugin<NativeSR>("SpeechRecognition");
          const a = await native.current.available().catch(() => ({ available: false }));
          if (!dead) setEngine(a.available ? "native" : null);
          return;
        }
      } catch { /* not running in the app */ }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (!dead && (w.SpeechRecognition || w.webkitSpeechRecognition)) setEngine("web");
    })();
    return () => { dead = true; };
  }, []);

  const start = useCallback(async (lang: VoiceLang) => {
    setError("");
    if (engine === "native" && native.current) {
      try {
        setListening(true);
        await native.current.requestPermissions().catch(() => {});
        const r = await native.current.start({
          language: lang, maxResults: 1, partialResults: false, popup: true,
          prompt: lang === "ur-PK" ? "پرزے کا نام بولیں" : "Say the part name",
        });
        const text = r?.matches?.[0];
        if (text) cb.current(text);
      } catch (e) {
        const m = String((e as Error)?.message ?? e);
        if (!/cancel|no match|not.?recogni|aborted/i.test(m)) setError("Voice search failed: " + m);
      } finally {
        setListening(false);
      }
      return;
    }
    if (engine === "web") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      const r = new SR();
      r.lang = lang;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onstart = () => setListening(true);
      r.onend = () => setListening(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onerror = (e: any) =>
        setError(
          e.error === "not-allowed" ? "Microphone permission denied"
          : e.error === "no-speech" ? "I did not hear anything"
          : e.error === "network" ? "Voice search needs an internet connection"
          : e.error === "aborted" ? "" : "Voice search error: " + e.error
        );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (e: any) => {
        const text = Array.from(e.results).map((x) => (x as ArrayLike<{ transcript: string }>)[0].transcript).join(" ");
        cb.current(text.trim());
      };
      rec.current = r;
      try { r.start(); } catch { /* already started */ }
    }
  }, [engine]);

  const stop = useCallback(() => rec.current?.stop(), []);
  return { start, stop, listening, supported: engine !== null, error };
}
