"use client";

import Link from "next/link";
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (!email.trim()) {
      setErrorMessage("メールアドレスを入力してください。");
      return;
    }

    try {
      setIsLoading(true);

      await sendPasswordResetEmail(auth, email.trim());

      setMessage(
        "パスワード再設定メールを送信しました。メールを確認してください。"
      );
      setEmail("");
    } catch (error) {
      console.error(error);

      if (error.code === "auth/invalid-email") {
        setErrorMessage("メールアドレスの形式が正しくありません。");
      } else if (error.code === "auth/user-not-found") {
        setErrorMessage("このメールアドレスのアカウントが見つかりません。");
      } else {
        setErrorMessage(
          "パスワード再設定メールの送信に失敗しました。時間をおいて再度お試しください。"
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white px-4 py-8 flex items-center justify-center">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-3xl p-6">
        <h1 className="text-3xl font-bold mb-2">パスワード再設定</h1>

        <p className="text-zinc-400 text-sm mb-6">
          登録したメールアドレスを入力すると、パスワード再設定用のメールを送信します。
        </p>

        <form onSubmit={handleResetPassword} className="grid gap-4">
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

          {message && (
            <p className="text-sm text-cyan-400 leading-6">{message}</p>
          )}

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
            {isLoading ? "送信中..." : "再設定メールを送信"}
          </button>
        </form>

        <div className="grid gap-3 mt-6 text-sm">
          <Link href="/login" className="text-cyan-400">
            ログイン画面に戻る
          </Link>

          <Link href="/signup" className="text-zinc-400">
            アカウントを作成する
          </Link>
        </div>
      </div>
    </main>
  );
}