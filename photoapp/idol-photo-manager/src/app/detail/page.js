"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function PhotoDetailPage() {
  const params = useParams();
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    const savedPhotos = JSON.parse(localStorage.getItem("photos")) || [];

    const targetPhoto = savedPhotos.find(
      (item) => String(item.id) === String(params.id)
    );

    setPhoto(targetPhoto);
  }, [params.id]);

  if (!photo) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <Link href="/photo-list" className="text-cyan-400 text-sm">
          ← 戻る
        </Link>

        <p className="mt-6 text-zinc-400">
          写真が見つかりません。
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <Link href="/photo-list" className="text-cyan-400 text-sm">
        ← 戻る
      </Link>

      <h1 className="text-2xl font-bold mt-4 mb-6">
        生写真詳細
      </h1>

      {photo.image ? (
        <img
          src={photo.image}
          alt={photo.member}
          className="w-full max-w-sm mx-auto rounded-2xl border border-zinc-700 mb-6"
        />
      ) : (
        <div className="aspect-[3/4] bg-zinc-700 rounded-2xl mb-6 flex items-center justify-center text-zinc-400">
          No Image
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 grid gap-3 mb-6">
        <p>
          <span className="text-zinc-400">グループ：</span>
          {photo.group}
        </p>

        <p>
          <span className="text-zinc-400">年：</span>
          {photo.year}
        </p>

        <p>
          <span className="text-zinc-400">期生：</span>
          {photo.generation}
        </p>

        <p>
          <span className="text-zinc-400">メンバー：</span>
          {photo.member}
        </p>

        <p>
          <span className="text-zinc-400">種類：</span>
          {photo.type}
        </p>

        <p>
          <span className="text-zinc-400">ポーズ：</span>
          {photo.pose}
        </p>

        <p>
          <span className="text-zinc-400">所持枚数：</span>
          {photo.count}枚
        </p>
      </div>

      <Link
        href={`/photo-edit/${photo.id}`}
        className="block w-full bg-cyan-500 text-black rounded-2xl py-3 font-bold text-center"
      >
        編集する
      </Link>
    </main>
  );
}