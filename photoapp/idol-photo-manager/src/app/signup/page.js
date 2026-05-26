"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSignup = async (e) => {
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

    if (password.length < 6) {
      setErrorMessage("パスワードは6文字以上で入力してください。");
      return;
    }

    if (password !== passwordConfirm) {
      setErrorMessage("確認用パスワードが一致していません。");
      return;
    }

    try {
      setIsLoading(true);

      await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      router.push("/");
    } catch (error) {
      console.error(error);

      if (error.code === "auth/email-already-in-use") {
        setErrorMessage("このメールアドレスはすでに使用されています。");
      } else if (error.code === "auth/invalid-email") {
        setErrorMessage("メールアドレスの形式が正しくありません。");
      } else if (error.code === "auth/weak-password") {
        setErrorMessage("パスワードは6文字以上で入力してください。");
      } else {
        setErrorMessage("アカウント作成に失敗しました。時間をおいて再度お試しください。");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white px-4 py-8 flex items-center justify-center">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-3xl p-6">
        <h1 className="text-3xl font-bold mb-2">アカウント作成</h1>

        <p className="text-zinc-400 text-sm mb-6">
          メールアドレスとパスワードを入力して、アカウントを作成してください。
        </p>

        <form onSubmit={handleSignup} className="grid gap-4">
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
              placeholder="6文字以上"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">
              パスワード確認
            </label>

            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="もう一度入力"
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
            {isLoading ? "作成中..." : "アカウントを作成"}
          </button>
        </form>

        <div className="grid gap-3 mt-6 text-sm">
          <Link href="/login" className="text-cyan-400">
            すでにアカウントを持っている場合
          </Link>
        </div>
      </div>
    </main>
  );
}