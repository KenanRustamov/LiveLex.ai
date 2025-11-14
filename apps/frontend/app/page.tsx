'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MobileShell from "@/components/MobileShell";

export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('livelex_profile');
      const username = raw ? (JSON.parse(raw)?.username as string | undefined) : undefined;
      if (!username || !username.trim()) {
        router.replace('/login');
        return;
      }
    } catch {}
    setReady(true);
  }, [router]);

  if (!ready) return null;
  return <MobileShell />;
}
