"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const ok = window.confirm("ログアウトしますか？");
    if (!ok) return;

    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error(error);
      alert("ログアウトに失敗しました。");
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-2xl px-4 py-2 text-sm font-bold active:scale-[0.98] transition"
    >
      ログアウト
    </button>
  );
}