'use client';

import Link from "next/link";
import { useMemo } from "react";

export default function MobileShell() {
  const backendUrl = useMemo(() => process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000", []);

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-md w-full px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">AI Glasses</h1>
          <span className="text-xs text-gray-500">Starter</span>
        </div>
      </header>

      <section className="flex-1">
        <div className="mx-auto max-w-md w-full px-4 py-6 space-y-4">
          <div className="rounded-2xl border p-4">
            <h2 className="font-medium mb-1">Welcome</h2>
            <p className="text-sm text-gray-600">
              This is a mobile-style shell. Views/components go here. Nothing is wired up yet.
            </p>
          </div>

          <div className="rounded-2xl border p-4 space-y-1">
            <h3 className="font-medium">Backend endpoint</h3>
            <code className="text-xs block text-gray-700 break-all">{backendUrl}</code>
            <p className="text-xs text-gray-500">Set via <code>NEXT_PUBLIC_BACKEND_URL</code>.</p>
          </div>

          <div className="rounded-2xl border p-4 space-y-2">
            <h3 className="font-medium">Next steps</h3>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
              <li>Add a camera component to stream frames.</li>
              <li>Create a backend WebSocket route to handle live observations.</li>
              <li>Design a prompt-orchestrator (e.g., LangChain) behind a stub API.</li>
            </ol>
          </div>
        </div>
      </section>

      <nav className="sticky bottom-0 bg-white/80 backdrop-blur border-t">
        <div className="mx-auto max-w-md w-full px-6 py-3 flex items-center justify-between text-sm">
          <Link href="#" className="opacity-60 pointer-events-none">Home</Link>
          <Link href="#" className="opacity-60 pointer-events-none">Learn</Link>
          <Link href="#" className="opacity-60 pointer-events-none">Profile</Link>
        </div>
      </nav>
    </main>
  );
}
