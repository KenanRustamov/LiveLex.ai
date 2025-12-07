'use client';

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LandingPage from "@/components/LandingPage";
import { Loader2 } from "lucide-react";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [roleChecked, setRoleChecked] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  useEffect(() => {
    const checkRole = async () => {
      if (status === 'authenticated' && session?.user?.email) {
        try {
          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
          const res = await fetch(`${backendUrl}/v1/auth/me?email=${session.user.email}`);

          if (res.ok) {
            const data = await res.json();
            if (!data.role) {
              router.replace('/onboarding');
            } else if (data.role === 'teacher') {
              setIsTeacher(true);
              router.replace('/teacher');
            } else {
              // Student
              router.replace('/student');
            }
          } else if (res.status === 404) {
            // User authenticated in frontend but missing in backend.
            // Re-sync user to create DB entry, then redirect to onboarding.
            try {
              await fetch(`${backendUrl}/v1/auth/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: session.user.email,
                  name: session.user.name,
                  profile_image: session.user.image,
                }),
              });
              router.replace('/onboarding');
            } catch (e) {
              console.error("Auto-sync failed", e);
            }
          } else {
            console.error("Failed to fetch role", res.status);
            setRoleChecked(true);
          }
        } catch (error) {
          console.error("Error checking role:", error);
          setRoleChecked(true);
        }
      } else if (status === 'unauthenticated') {
        setRoleChecked(true); // Stop loading to show Landing Page
      }
    };

    checkRole();
  }, [status, session, router]);

  if (status === "loading" || (status === "authenticated" && !roleChecked)) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  // If we are here and authenticated + roleChecked, we should have redirected already. 
  // We return null to avoid flash before redirect completes.
  if (status === "authenticated") return null;

  // If teacher, we redirect, but return null/loader briefly to prevent flash
  if (isTeacher) return null;

  return <LandingPage />;
}
