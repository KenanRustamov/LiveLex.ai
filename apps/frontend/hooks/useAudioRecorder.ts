import { useCallback, useEffect, useRef, useState } from 'react';

type UseAudioRecorder = {
  isRecording: boolean;
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
  error: string | null;
};

export function useAudioRecorder(): UseAudioRecorder {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      if (isRecording) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Configure MediaRecorder options for better Firefox compatibility
      // Firefox prefers 'audio/webm' or 'audio/ogg; codecs=opus'
      const options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        options.mimeType = 'audio/ogg;codecs=opus';
      }
      
      const mr = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      setIsRecording(true);
      // Use timeslice to ensure chunks are properly finalized (helps w/ Firefox)
      mr.start(100); // 100ms chunks
    } catch (e: any) {
      setError(e?.message ?? 'Microphone access failed');
      setIsRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    }
  }, [isRecording]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    return new Promise(resolve => {
      try {
        const mr = mediaRecorderRef.current;
        if (!mr || !isRecording) { resolve(null); return; }
        
        // Ensure we get the final chunk before stopping (important for Firefox)
        mr.requestData();
        
        mr.onstop = () => {
          // Firefox may need a small delay to finalize the WebM container
          setTimeout(() => {
            const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
            chunksRef.current = [];
            setIsRecording(false);
            if (streamRef.current) {
              streamRef.current.getTracks().forEach(t => t.stop());
              streamRef.current = null;
            }
            resolve(blob);
          }, 50); // Small delay to ensure WebM is finalized
        };
        mr.stop();
      } catch {
        setIsRecording(false);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        resolve(null);
      }
    });
  }, [isRecording]);

  useEffect(() => () => {
    try { if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop(); } catch {}
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  return { isRecording, start, stop, error };
}

export default useAudioRecorder;


