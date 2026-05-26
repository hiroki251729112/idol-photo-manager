"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim()) {
      setErrorMessage("メールアドレスを入力してください。");
      return;
    }

    if (!password) {
      setErrorMessage("パスワードを入力してください。");
      return;
    }

    try {
      setIsLoading(true);

      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      router.push("/");
    } catch (error) {
      console.error(error);

      if (error.code === "auth/invalid-credential") {
        setErrorMessage("メールアドレスまたはパスワードが違います。");
      } else if (error.code === "auth/user-not-found") {
        setErrorMessage("このメールアドレスのアカウントが見つかりません。");
      } else if (error.code === "auth/wrong-password") {
        setErrorMessage("パスワードが違います。");
      } else if (error.code === "auth/invalid-email") {
        setErrorMessage("メールアドレスの形式が正しくありません。");
      } else {
        setErrorMessage("ログインに失敗しました。時間をおいて再度お試しください。");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white px-4 py-8 flex items-center justify-center">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-3xl p-6">
        <h1 className="text-3xl font-bold mb-2">ログイン</h1>

        <p className="text-zinc-400 text-sm mb-6">
          登録したメールアドレスとパスワードでログインしてください。
        </p>

        <form onSubmit={handleLogin} className="grid gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">
              メールアドレス
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@gmail.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">
              パスワード
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワード"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3"
            />
          </div>

          {errorMessage && (
            <p className="text-sm text-red-400 leading-6">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
          >
            {isLoading ? "ログイン中..." : "ログイン"}
          </button>
        </form>

        <div className="grid gap-3 mt-6 text-sm">
          <Link href="/signup" className="text-cyan-400">
            アカウントを作成する
          </Link>

          <Link href="/reset-password" className="text-zinc-400">
            パスワードを忘れた場合
          </Link>
        </div>
      </div>
    </main>
  );
}