"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { saveUserPhotos } from "@/lib/photoService";

export default function MigratePage() {
  const [user, setUser] = useState(null);
  const [localPhotos, setLocalPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [message, setMessage] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      const savedPhotos = JSON.parse(localStorage.getItem("photos")) || [];
      setLocalPhotos(savedPhotos);

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const removeLargeImageFields = (photo) => {
    return {
      id: String(photo.id || Date.now() + Math.random()),
      group: photo.group || "",
      year: photo.year || "",
      generation: photo.generation || "",
      member: photo.member || "",
      memberKana: photo.memberKana || "",
      type: photo.type || "",
      completeType: photo.completeType || "",
      pose: photo.pose || "",
      status: photo.status || "所持",
      count: Number(photo.count || 0),

      imageUrl: photo.imageUrl || "",
      hasLocalImage: Boolean(photo.image),

      createdAtLocal: photo.createdAt || "",
      updatedAtLocal: photo.updatedAt || "",
    };
  };

  const handleMigrate = async () => {
    if (!user) {
      alert("ログインしてから実行してください。");
      return;
    }

    if (localPhotos.length === 0) {
      alert("移行するlocalStorageデータがありません。");
      return;
    }

    const ok = window.confirm(
      `localStorage内の写真データ ${localPhotos.length} 件をFirestoreへ移行します。\n\n` +
        "画像データは容量が大きいため、今回はFirestoreには保存しません。\n" +
        "グループ、メンバー、種類、ポーズ、枚数などの情報だけを移行します。\n\n" +
        "よろしいですか？"
    );

    if (!ok) return;

    try {
      setIsMigrating(true);
      setMessage("");
      setErrorDetail("");

      const normalizedPhotos = localPhotos.map(removeLargeImageFields);

      await saveUserPhotos(user.uid, normalizedPhotos);

      setMessage(
        `${normalizedPhotos.length} 件の写真データをFirestoreへ移行しました。画像データは除外しています。`
      );
    } catch (error) {
      console.error(error);
      setMessage("移行に失敗しました。");
      setErrorDetail(error.message || String(error));
    } finally {
      setIsMigrating(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <p className="text-zinc-400">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md md:max-w-3xl lg:max-w-4xl mx-auto">
        <Link href="/" className="text-cyan-400 text-sm">
          ← トップへ
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-2">
          データ移行
        </h1>

        <p className="text-zinc-400 mb-6 leading-6">
          現在ブラウザ内に保存されているlocalStorageの写真データを、
          ログイン中のアカウントのFirestoreへ移行します。
        </p>

        <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-5 grid gap-4">
          <div>
            <p className="text-sm text-zinc-400">ログイン中のユーザー</p>
            <p className="text-lg font-bold mt-1">
              {user?.email || "未ログイン"}
            </p>
          </div>

          <div>
            <p className="text-sm text-zinc-400">localStorage内の写真データ</p>
            <p className="text-lg font-bold mt-1">{localPhotos.length} 件</p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
            <p className="text-sm text-zinc-300 font-bold mb-2">
              今回の移行内容
            </p>
            <p className="text-xs text-zinc-400 leading-5">
              グループ、メンバー名、期生、種類、ポーズ、枚数などの情報だけをFirestoreへ保存します。
              画像データは容量が大きいため、Firestoreへは保存しません。
            </p>
          </div>

          <button
            type="button"
            onClick={handleMigrate}
            disabled={isMigrating || !user || localPhotos.length === 0}
            className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
          >
            {isMigrating ? "移行中..." : "Firestoreへ移行する"}
          </button>

          {message && (
            <p className="text-sm text-cyan-400 leading-6">{message}</p>
          )}

          {errorDetail && (
            <div className="bg-red-950/40 border border-red-800 rounded-2xl p-3">
              <p className="text-sm text-red-300 font-bold mb-1">
                エラー詳細
              </p>
              <p className="text-xs text-red-200 break-all leading-5">
                {errorDetail}
              </p>
            </div>
          )}

          <p className="text-xs text-zinc-500 leading-5">
            ※この画面ではlocalStorageのデータは削除しません。
            Firestoreへの移行が確認できてから削除する方が安全です。
          </p>
        </div>
      </div>
    </main>
  );
}