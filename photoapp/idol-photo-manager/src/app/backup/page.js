"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserPhotos, saveUserPhotos } from "@/lib/photoService";
import { exportAllImages, importAllImages } from "@/lib/imageDb";

export default function BackupPage() {
  const fileInputRef = useRef(null);

  const [user, setUser] = useState(null);
  const [group, setGroup] = useState("櫻坂46");
  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedGroup = params.get("group") || "櫻坂46";
    setGroup(selectedGroup);

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  const getNowText = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");

    return `${yyyy}${mm}${dd}-${hh}${mi}`;
  };

  const downloadJson = (data, filename) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  };

  const handleExportBackup = async () => {
    if (!user) {
      alert("ログイン情報を確認できません。再ログインしてください。");
      return;
    }

    try {
      setIsProcessing(true);
      setMessage("バックアップを作成しています...");

      const localPhotos = JSON.parse(localStorage.getItem("photos")) || [];
      const localMemberImages = {};

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        if (key.startsWith("memberImages_")) {
          localMemberImages[key] = JSON.parse(localStorage.getItem(key)) || {};
        }
      }

      let firestorePhotos = [];

      try {
        firestorePhotos = await getUserPhotos(user.uid);
      } catch (error) {
        console.error(error);
      }

      const images = await exportAllImages();

      const backupData = {
        appName: "idol-photo-manager",
        version: 1,
        exportedAt: new Date().toISOString(),
        userEmail: user.email || "",
        firestorePhotos,
        localPhotos,
        localMemberImages,
        indexedDbImages: images,
      };

      downloadJson(
        backupData,
        `idol-photo-manager-backup-${getNowText()}.json`
      );

      setMessage("バックアップを書き出しました。ファイルを大切に保管してください。");
    } catch (error) {
      console.error(error);
      setMessage("バックアップの作成に失敗しました。コンソールを確認してください。");
    } finally {
      setIsProcessing(false);
    }
  };

  const readJsonFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  };

  const handleImportBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!user) {
      alert("ログイン情報を確認できません。再ログインしてください。");
      e.target.value = "";
      return;
    }

    const confirmImport = window.confirm(
      "バックアップを復元します。\n現在のFirestoreデータと端末内の画像データが、バックアップ内容で上書きされます。\n本当に復元しますか？"
    );

    if (!confirmImport) {
      e.target.value = "";
      return;
    }

    try {
      setIsProcessing(true);
      setMessage("バックアップを読み込んでいます...");

      const backupData = await readJsonFile(file);

      if (backupData?.appName !== "idol-photo-manager") {
        alert("このアプリのバックアップファイルではない可能性があります。");
        e.target.value = "";
        return;
      }

      const firestorePhotos = Array.isArray(backupData.firestorePhotos)
        ? backupData.firestorePhotos
        : [];

      const localPhotos = Array.isArray(backupData.localPhotos)
        ? backupData.localPhotos
        : firestorePhotos;

      localStorage.setItem("photos", JSON.stringify(localPhotos));

      if (backupData.localMemberImages) {
        Object.entries(backupData.localMemberImages).forEach(([key, value]) => {
          localStorage.setItem(key, JSON.stringify(value));
        });
      }

      if (backupData.indexedDbImages) {
        await importAllImages(backupData.indexedDbImages);
      }

      await saveUserPhotos(user.uid, firestorePhotos);

      setMessage("バックアップを復元しました。画面を戻って確認してください。");
      alert("復元が完了しました");
    } catch (error) {
      console.error(error);
      setMessage("復元に失敗しました。バックアップファイルを確認してください。");
    } finally {
      setIsProcessing(false);
      e.target.value = "";
    }
  };

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md md:max-w-3xl mx-auto">
        <Link
          href={`/select?group=${encodeURIComponent(group)}`}
          className="text-cyan-400 text-sm"
        >
          ← 戻る
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-2">
          バックアップ・復元
        </h1>

        <p className="text-zinc-400 mb-6 leading-6">
          Firestoreの所持データと、端末内のIndexedDB画像をまとめて保存・復元できます。
        </p>

        <div className="grid gap-5">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-5">
            <h2 className="text-xl font-bold mb-2">バックアップを書き出す</h2>
            <p className="text-sm text-zinc-400 leading-6 mb-4">
              現在の所持データと画像データをJSONファイルとして保存します。スマホの機種変更前や、大量登録後に実行してください。
            </p>

            <button
              type="button"
              onClick={handleExportBackup}
              disabled={isProcessing}
              className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
            >
              {isProcessing ? "処理中..." : "バックアップを書き出す"}
            </button>
          </div>

          <div className="bg-zinc-900 border border-red-800 rounded-3xl p-5">
            <h2 className="text-xl font-bold mb-2 text-red-400">
              バックアップを復元する
            </h2>
            <p className="text-sm text-zinc-400 leading-6 mb-4">
              保存しておいたJSONファイルを読み込み、所持データと画像データを復元します。現在のデータは上書きされます。
            </p>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="w-full bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-white rounded-2xl py-3 font-bold active:scale-[0.98] transition"
            >
              {isProcessing ? "処理中..." : "バックアップを読み込む"}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportBackup}
              className="hidden"
            />

            <p className="text-xs text-red-300 mt-3 leading-5">
              ※復元すると現在のデータがバックアップ内容で上書きされます。
            </p>
          </div>

          {message && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
              <p className="text-sm text-zinc-300 leading-6">{message}</p>
            </div>
          )}

          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
            <p className="text-sm text-zinc-400 leading-6">
              無料運用では、画像はクラウドではなく端末内に保存されます。ブラウザのデータ削除や機種変更に備えて、定期的にバックアップを書き出してください。
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
