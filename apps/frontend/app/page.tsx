'use client';

import { useSession } from "next-auth/react";
import MobileShell from "@/components/MobileShell";
import LandingPage from "@/components/LandingPage";

export default function HomePage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (status === "authenticated") {
    return <MobileShell />;
  }

  return <LandingPage />;
}
