"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { deleteUserPhoto, getUserPhotos, saveUserPhotos } from "@/lib/photoService";
import {
  deletePhotoImagesForType,
  migratePhotoImagesForTypeRename,
} from "@/lib/imageDb";

export default function DetailEditTypePage() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [group, setGroup] = useState("櫻坂46");
  const [photos, setPhotos] = useState([]);

  const [targetTypeForRename, setTargetTypeForRename] = useState("");
  const [newTypeName, setNewTypeName] = useState("");

  const [targetTypeForDelete, setTargetTypeForDelete] = useState("");

  const getPhotoKey = (photo) => {
    return [
      photo.group || "",
      photo.year || "",
      photo.member || "",
      photo.type || "",
      photo.pose || "",
    ].join("__");
  };

  const mergeFirestoreAndLocalPhotos = (firestorePhotos, localPhotos) => {
    const localMap = new Map();

    localPhotos.forEach((photo) => {
      localMap.set(getPhotoKey(photo), photo);
    });

    if (!firestorePhotos.length) {
      return localPhotos;
    }

    return firestorePhotos.map((photo) => {
      const localPhoto = localMap.get(getPhotoKey(photo));

      return {
        ...photo,
        image: localPhoto?.image || photo.image || "",
      };
    });
  };

  const removeImageForFirestore = (photo) => {
    return {
      id: String(photo.id || photo.firestoreId || Date.now() + Math.random()),
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
      hasIndexedDbImage: Boolean(photo.hasIndexedDbImage || photo.hasLocalImage || photo.image),
    };
  };

  const loadPhotos = async (currentUser, selectedGroup) => {
    try {
      const localPhotos = JSON.parse(localStorage.getItem("photos")) || [];

      if (currentUser) {
        const firestorePhotos = await getUserPhotos(currentUser.uid);
        const mergedPhotos = mergeFirestoreAndLocalPhotos(
          firestorePhotos,
          localPhotos
        );
        setPhotos(mergedPhotos);
      } else {
        setPhotos(localPhotos);
      }
    } catch (error) {
      console.error(error);
      const localPhotos = JSON.parse(localStorage.getItem("photos")) || [];
      setPhotos(localPhotos);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedGroup = params.get("group") || "櫻坂46";
    setGroup(selectedGroup);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      await loadPhotos(currentUser, selectedGroup);
    });

    return () => unsubscribe();
  }, []);

  const activeGroupPhotos = useMemo(() => {
    return photos.filter(
      (photo) => photo.group === group && Number(photo.count || 0) > 0
    );
  }, [photos, group]);

  const typeOptions = useMemo(() => {
    const map = new Map();

    activeGroupPhotos.forEach((photo) => {
      if (!photo.type) return;

      if (!map.has(photo.type)) {
        map.set(photo.type, {
          type: photo.type,
          totalCount: 0,
          latestId: Number(photo.id || 0),
          oldestId: Number(photo.id || 0),
          memberCountSet: new Set(),
        });
      }

      const item = map.get(photo.type);
      item.totalCount += Number(photo.count || 0);
      item.latestId = Math.max(item.latestId, Number(photo.id || 0));
      item.oldestId = Math.min(item.oldestId, Number(photo.id || 0));

      if (photo.member) {
        item.memberCountSet.add(photo.member);
      }
    });

    return [...map.values()]
      .map((item) => ({
        ...item,
        memberCount: item.memberCountSet.size,
      }))
      .sort((a, b) => b.latestId - a.latestId);
  }, [activeGroupPhotos]);

  const savePhotos = async (updatedPhotos) => {
    localStorage.setItem("photos", JSON.stringify(updatedPhotos));
    setPhotos(updatedPhotos);

    if (user) {
      const firestorePhotos = updatedPhotos
        .filter((photo) => photo.group === group)
        .map(removeImageForFirestore);

      await saveUserPhotos(user.uid, firestorePhotos);
    }
  };

  const handleRenameType = async () => {
    if (!targetTypeForRename) {
      alert("変更したい種類を選択してください");
      return;
    }

    if (!newTypeName.trim()) {
      alert("新しい種類名を入力してください");
      return;
    }

    if (!user) {
      alert("ログイン情報を確認できません。再ログインしてください。");
      return;
    }

    const nextTypeName = newTypeName.trim();

    if (targetTypeForRename === nextTypeName) {
      alert("変更前と同じ種類名です");
      return;
    }

    const duplicateTypeExists = typeOptions.some(
      (item) => item.type === nextTypeName && item.type !== targetTypeForRename
    );

    const confirmText = duplicateTypeExists
      ? `${targetTypeForRename} を既存の「${nextTypeName}」に統合しますか？\n同じメンバー・年・ポーズがある場合はデータがまとまります。`
      : `${targetTypeForRename} を「${nextTypeName}」に一括変更しますか？`;

    const confirmUpdate = window.confirm(confirmText);

    if (!confirmUpdate) return;

    try {
      setIsSaving(true);

      await migratePhotoImagesForTypeRename(
        group,
        targetTypeForRename,
        nextTypeName,
        photos
      );

      const updatedPhotos = photos.map((photo) => {
        if (photo.group === group && photo.type === targetTypeForRename) {
          return {
            ...photo,
            type: nextTypeName,
            hasIndexedDbImage: Boolean(photo.hasIndexedDbImage || photo.hasLocalImage || photo.image),
          };
        }

        return photo;
      });

      await savePhotos(updatedPhotos);
      setTargetTypeForRename("");
      setNewTypeName("");

      alert("種類名を一括変更しました");
    } catch (error) {
      console.error(error);
      alert("種類名の変更に失敗しました。コンソールを確認してください。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteType = async () => {
    if (!targetTypeForDelete) {
      alert("削除したい種類を選択してください");
      return;
    }

    if (!user) {
      alert("ログイン情報を確認できません。再ログインしてください。");
      return;
    }

    const targetInfo = typeOptions.find(
      (item) => item.type === targetTypeForDelete
    );

    const confirmDelete = window.confirm(
      `${targetTypeForDelete} の生写真データをすべて削除します。\n` +
        `対象：${targetInfo?.totalCount || 0}枚 / ${
          targetInfo?.memberCount || 0
        }人分\n\n` +
        "この操作は元に戻せません。本当に削除しますか？"
    );

    if (!confirmDelete) return;

    try {
      setIsSaving(true);

      const deleteTargets = photos.filter(
        (photo) => photo.group === group && photo.type === targetTypeForDelete
      );

      await deletePhotoImagesForType(group, targetTypeForDelete, photos);

      const updatedPhotos = photos.filter(
        (photo) => !(photo.group === group && photo.type === targetTypeForDelete)
      );

      localStorage.setItem("photos", JSON.stringify(updatedPhotos));
      setPhotos(updatedPhotos);

      for (const photo of deleteTargets) {
        await deleteUserPhoto(user.uid, photo.id || photo.firestoreId);
      }

      setTargetTypeForDelete("");

      alert("種類と関連する生写真データを削除しました");
    } catch (error) {
      console.error(error);
      alert("種類の削除に失敗しました。コンソールを確認してください。");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedRenameTypeInfo = useMemo(() => {
    return typeOptions.find((item) => item.type === targetTypeForRename);
  }, [typeOptions, targetTypeForRename]);

  const selectedDeleteTypeInfo = useMemo(() => {
    return typeOptions.find((item) => item.type === targetTypeForDelete);
  }, [typeOptions, targetTypeForDelete]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-xl font-bold">読み込み中...</p>
          <p className="text-zinc-400 text-sm mt-2">種類情報を取得しています</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md md:max-w-3xl lg:max-w-4xl mx-auto">
        <Link
          href={`/detail-edit?group=${encodeURIComponent(group)}`}
          className="text-cyan-400 text-sm"
        >
          ← 詳細編集へ
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-2">
          種類編集
        </h1>

        <p className="text-zinc-400 mb-6">
          {group} の生写真の種類をまとめて編集できます。
        </p>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4">
            <h2 className="text-xl font-bold mb-2">種類名を一括変更</h2>

            <p className="text-sm text-zinc-400 mb-4">
              種類名を間違えて登録したときに、画像の紐づけも含めてまとめて変更します。
            </p>

            <select
              value={targetTypeForRename}
              onChange={(e) => {
                setTargetTypeForRename(e.target.value);
                setNewTypeName(e.target.value);
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mb-3"
            >
              <option value="">種類を選択</option>

              {typeOptions.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.type}（{item.totalCount}枚 / {item.memberCount}人）
                </option>
              ))}
            </select>

            <input
              type="text"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="新しい種類名"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mb-3"
            />

            {selectedRenameTypeInfo && (
              <p className="text-xs text-zinc-500 mb-3 leading-5">
                対象：{selectedRenameTypeInfo.totalCount}枚 /{" "}
                {selectedRenameTypeInfo.memberCount}人分
              </p>
            )}

            <button
              type="button"
              onClick={handleRenameType}
              disabled={isSaving}
              className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
            >
              {isSaving ? "処理中..." : "種類名を変更する"}
            </button>
          </div>

          <div className="bg-zinc-900 border border-red-800 rounded-3xl p-4">
            <h2 className="text-xl font-bold mb-2 text-red-400">
              種類を削除
            </h2>

            <p className="text-sm text-zinc-400 mb-4">
              間違って登録した種類と、その種類に紐づく生写真データ・画像を完全に削除します。
            </p>

            <select
              value={targetTypeForDelete}
              onChange={(e) => setTargetTypeForDelete(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mb-3"
            >
              <option value="">種類を選択</option>

              {typeOptions.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.type}（{item.totalCount}枚 / {item.memberCount}人）
                </option>
              ))}
            </select>

            {selectedDeleteTypeInfo && (
              <p className="text-xs text-zinc-500 mb-3 leading-5">
                対象：{selectedDeleteTypeInfo.totalCount}枚 /{" "}
                {selectedDeleteTypeInfo.memberCount}人分
              </p>
            )}

            <button
              type="button"
              onClick={handleDeleteType}
              disabled={isSaving}
              className="w-full bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-white rounded-2xl py-3 font-bold active:scale-[0.98] transition"
            >
              {isSaving ? "処理中..." : "この種類を削除する"}
            </button>

            <p className="text-xs text-red-300 mt-3 leading-5">
              ※削除すると元に戻せません。間違って登録したデータを消したい場合のみ使用してください。
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
