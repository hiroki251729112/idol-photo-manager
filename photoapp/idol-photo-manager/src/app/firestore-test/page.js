"use client";

import Link from "next/link";
import { useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function FirestoreTestPage() {
  const [message, setMessage] = useState("");
  const [testData, setTestData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleWriteTest = async () => {
    setMessage("");
    setTestData(null);
    setIsLoading(true);

    try {
      const user = await new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
          unsubscribe();
          resolve(currentUser);
        });
      });

      if (!user) {
        setMessage("ログインしていません。");
        return;
      }

      const testRef = doc(db, "users", user.uid, "test", "connection");

      await setDoc(testRef, {
        email: user.email,
        message: "Firestore接続テスト成功",
        createdAt: serverTimestamp(),
      });

      setMessage("Firestoreへの書き込みに成功しました。");
    } catch (error) {
      console.error(error);
      setMessage(`エラー: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReadTest = async () => {
    setMessage("");
    setTestData(null);
    setIsLoading(true);

    try {
      const user = await new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
          unsubscribe();
          resolve(currentUser);
        });
      });

      if (!user) {
        setMessage("ログインしていません。");
        return;
      }

      const testRef = doc(db, "users", user.uid, "test", "connection");
      const snap = await getDoc(testRef);

      if (!snap.exists()) {
        setMessage("テストデータがまだありません。先に書き込みテストをしてください。");
        return;
      }

      setTestData(snap.data());
      setMessage("Firestoreからの読み込みに成功しました。");
    } catch (error) {
      console.error(error);
      setMessage(`エラー: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md md:max-w-3xl mx-auto">
        <Link href="/" className="text-cyan-400 text-sm">
          ← トップへ
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-2">
          Firestore接続テスト
        </h1>

        <p className="text-zinc-400 mb-6 leading-6">
          ログイン中のユーザー専用エリアに、小さいテストデータを書き込み・読み込みします。
        </p>

        <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-5 grid gap-4">
          <button
            type="button"
            onClick={handleWriteTest}
            disabled={isLoading}
            className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold"
          >
            {isLoading ? "処理中..." : "書き込みテスト"}
          </button>

          <button
            type="button"
            onClick={handleReadTest}
            disabled={isLoading}
            className="w-full bg-zinc-800 disabled:bg-zinc-700 border border-zinc-700 text-white rounded-2xl py-3 font-bold"
          >
            {isLoading ? "処理中..." : "読み込みテスト"}
          </button>

          {message && (
            <p className="text-sm text-cyan-400 leading-6">
              {message}
            </p>
          )}

          {testData && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
              <p className="text-sm text-zinc-400 mb-2">取得したデータ</p>
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all">
                {JSON.stringify(testData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}