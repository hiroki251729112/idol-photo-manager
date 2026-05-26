"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function DetailEditTopPage() {
  const [group, setGroup] = useState("櫻坂46");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedGroup = params.get("group") || "櫻坂46";
    setGroup(selectedGroup);
  }, []);

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md md:max-w-3xl lg:max-w-4xl mx-auto">
        <Link
          href={`/select?group=${encodeURIComponent(group)}`}
          className="text-cyan-400 text-sm"
        >
          ← {group}の一覧へ
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-2">
          詳細編集
        </h1>

        <p className="text-zinc-400 mb-6">
          {group} の登録情報をまとめて整理できます。
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href={`/detail-edit/member?group=${encodeURIComponent(group)}`}
            className="block bg-zinc-900 border border-zinc-700 rounded-3xl p-5 active:scale-[0.98] transition"
          >
            <p className="text-2xl font-bold">メンバー編集</p>
            <p className="text-zinc-400 text-sm mt-3 leading-6">
              メンバー名、ふりがな、期生の一括変更や、間違って登録したメンバーの削除ができます。
            </p>
          </Link>

          <Link
            href={`/detail-edit/type?group=${encodeURIComponent(group)}`}
            className="block bg-zinc-900 border border-zinc-700 rounded-3xl p-5 active:scale-[0.98] transition"
          >
            <p className="text-2xl font-bold">種類編集</p>
            <p className="text-zinc-400 text-sm mt-3 leading-6">
              生写真の種類名の一括変更や、間違って登録した種類の削除ができます。
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}