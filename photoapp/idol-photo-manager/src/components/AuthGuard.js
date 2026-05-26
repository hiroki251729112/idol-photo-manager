"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function AuthGuard({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  const [isChecking, setIsChecking] = useState(true);
  const [user, setUser] = useState(null);

  const publicPaths = ["/login", "/signup", "/reset-password"];
  const isPublicPage = publicPaths.includes(pathname);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsChecking(false);

      if (!currentUser && !isPublicPage) {
        router.replace("/login");
      }

      if (currentUser && isPublicPage) {
        router.replace("/");
      }
    });

    return () => unsubscribe();
  }, [router, isPublicPage]);

  if (isChecking) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-xl font-bold">読み込み中...</p>
          <p className="text-zinc-400 text-sm mt-2">
            ログイン状態を確認しています
          </p>
        </div>
      </main>
    );
  }

  if (!user && !isPublicPage) {
    return null;
  }

  return children;
}