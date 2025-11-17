import { useEffect, useRef, useState } from 'react';
import { MicVAD } from '@ricky0123/vad-web';

export default function useVadPredefined(
  enabled: boolean,
  handlers: { onSpeechStart?: () => void; onSpeechRealStart?: () => void; onSpeechEnd?: (audio?: Float32Array) => void }
) {
  // Keep handler refs stable to avoid recreating VAD on every render
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);
  const [listening, setListening] = useState(false);
  const vadRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const vad = await (MicVAD as any).new({
          onSpeechStart: () => {
            if (!cancelled) handlersRef.current.onSpeechStart?.();
          },
          onSpeechRealStart: () => {
            if (!cancelled) handlersRef.current.onSpeechRealStart?.();
          },
          onSpeechEnd: (_audio?: Float32Array) => {
            if (!cancelled) handlersRef.current.onSpeechEnd?.(_audio);
          },
          baseAssetPath: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web/dist/',
          onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/',
          model: 'legacy',
          startOnLoad: true,
          // FrameProcessor tuning
          preSpeechPadMs: 450,
          redemptionMs: 600,
          minSpeechMs: 80,
          positiveSpeechThreshold: 0.8,
          negativeSpeechThreshold: 0.35,
        });
        try {
          console.log('[VAD] initialized', {
            baseAssetPath: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web/dist/',
            onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/',
          });
        } catch {}
        if (cancelled) {
          try { vad.pause(); vad.destroy?.(); } catch {}
          return;
        }
        vadRef.current = vad;
        await vad.start();
        try { console.log('[VAD] started listening'); } catch {}
        if (!cancelled) setListening(true);
      } catch (e) {
        try { console.error('[VAD] failed to initialize/start', e); } catch {}
      }
    }
    async function stop() {
      try {
        const vad = vadRef.current;
        if (vad) {
          try { vad.pause?.(); } catch {}
          try { vad.destroy?.(); } catch {}
        }
      } finally {
        vadRef.current = null;
        setListening(false);
        try { console.log('[VAD] stopped/destroyed'); } catch {}
      }
    }

    if (enabled) start(); else stop();
    return () => { cancelled = true; stop(); };
  }, [enabled]);

  return { listening };
}
