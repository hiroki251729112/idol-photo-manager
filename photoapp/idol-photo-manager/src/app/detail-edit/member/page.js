"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { deleteUserPhoto, getUserPhotos, saveUserPhotos } from "@/lib/photoService";
import {
  deleteMemberImage as deleteIndexedDbMemberImage,
  deletePhotoImagesForMember,
  migrateMemberImageName,
  migratePhotoImagesForMemberRename,
} from "@/lib/imageDb";

export default function DetailEditMemberPage() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [group, setGroup] = useState("櫻坂46");
  const [photos, setPhotos] = useState([]);

  const [targetMemberForName, setTargetMemberForName] = useState("");
  const [newMemberName, setNewMemberName] = useState("");

  const [targetMemberForKana, setTargetMemberForKana] = useState("");
  const [newMemberKana, setNewMemberKana] = useState("");

  const [targetMemberForGeneration, setTargetMemberForGeneration] =
    useState("");
  const [newGeneration, setNewGeneration] = useState("1期生");

  const [targetMemberForDelete, setTargetMemberForDelete] = useState("");

  const generationOptions = [
    "1期生",
    "2期生",
    "3期生",
    "4期生",
    "5期生",
    "6期生",
    "卒業生（1期生）",
    "卒業生（2期生）",
    "卒業生（3期生）",
    "卒業生（4期生）",
    "卒業生（5期生）",
    "卒業生（6期生）",
  ];

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

  const getGenerationSortValue = (value) => {
    if (!value) return 9999;

    const graduateMatch = value.match(/卒業生（(\d+)期生）/);
    if (graduateMatch) return 100 + Number(graduateMatch[1]);

    const normalMatch = value.match(/(\d+)期生/);
    if (normalMatch) return Number(normalMatch[1]);

    if (value === "卒業生") return 199;

    return 9999;
  };

  const activeGroupPhotos = useMemo(() => {
    return photos.filter(
      (photo) => photo.group === group && Number(photo.count || 0) > 0
    );
  }, [photos, group]);

  const memberOptions = useMemo(() => {
    const map = new Map();

    activeGroupPhotos.forEach((photo) => {
      if (!photo.member) return;

      if (!map.has(photo.member)) {
        map.set(photo.member, {
          member: photo.member,
          memberKana: photo.memberKana || "",
          generation: photo.generation || "",
          totalCount: 0,
        });
      }

      const item = map.get(photo.member);
      item.totalCount += Number(photo.count || 0);

      if (!item.memberKana && photo.memberKana) {
        item.memberKana = photo.memberKana;
      }

      if (!item.generation && photo.generation) {
        item.generation = photo.generation;
      }
    });

    return [...map.values()].sort((a, b) => {
      const generationDiff =
        getGenerationSortValue(a.generation) -
        getGenerationSortValue(b.generation);

      if (generationDiff !== 0) return generationDiff;

      return (a.memberKana || a.member).localeCompare(
        b.memberKana || b.member,
        "ja"
      );
    });
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

  const syncLocalStorageMemberImageName = (oldName, nextName) => {
    const savedMemberImages =
      JSON.parse(localStorage.getItem(`memberImages_${group}`)) || {};

    if (savedMemberImages[oldName]) {
      savedMemberImages[nextName] = savedMemberImages[oldName];
      delete savedMemberImages[oldName];

      localStorage.setItem(
        `memberImages_${group}`,
        JSON.stringify(savedMemberImages)
      );
    }
  };

  const deleteLocalStorageMemberImage = (memberName) => {
    const savedMemberImages =
      JSON.parse(localStorage.getItem(`memberImages_${group}`)) || {};

    if (savedMemberImages[memberName]) {
      delete savedMemberImages[memberName];
      localStorage.setItem(
        `memberImages_${group}`,
        JSON.stringify(savedMemberImages)
      );
    }
  };

  const handleRenameMember = async () => {
    if (!targetMemberForName) {
      alert("変更したいメンバーを選択してください");
      return;
    }

    if (!newMemberName.trim()) {
      alert("新しいメンバー名を入力してください");
      return;
    }

    if (!user) {
      alert("ログイン情報を確認できません。再ログインしてください。");
      return;
    }

    const nextName = newMemberName.trim();

    if (targetMemberForName === nextName) {
      alert("変更前と同じメンバー名です");
      return;
    }

    const duplicateMemberExists = memberOptions.some(
      (item) => item.member === nextName && item.member !== targetMemberForName
    );

    const confirmText = duplicateMemberExists
      ? `${targetMemberForName} を既存の「${nextName}」に統合しますか？\n同じ種類・年・ポーズがある場合はデータがまとまります。`
      : `${targetMemberForName} を「${nextName}」に一括変更しますか？`;

    const confirmUpdate = window.confirm(confirmText);

    if (!confirmUpdate) return;

    try {
      setIsSaving(true);

      await migratePhotoImagesForMemberRename(
        group,
        targetMemberForName,
        nextName,
        photos
      );

      await migrateMemberImageName(group, targetMemberForName, nextName);
      syncLocalStorageMemberImageName(targetMemberForName, nextName);

      const updatedPhotos = photos.map((photo) => {
        if (photo.group === group && photo.member === targetMemberForName) {
          return {
            ...photo,
            member: nextName,
            hasIndexedDbImage: Boolean(photo.hasIndexedDbImage || photo.hasLocalImage || photo.image),
          };
        }

        return photo;
      });

      await savePhotos(updatedPhotos);
      setTargetMemberForName("");
      setNewMemberName("");

      alert("メンバー名を一括変更しました");
    } catch (error) {
      console.error(error);
      alert("メンバー名の変更に失敗しました。コンソールを確認してください。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateKana = async () => {
    if (!targetMemberForKana) {
      alert("ふりがなを変更したいメンバーを選択してください");
      return;
    }

    if (!newMemberKana.trim()) {
      alert("新しいふりがなを入力してください");
      return;
    }

    if (!user) {
      alert("ログイン情報を確認できません。再ログインしてください。");
      return;
    }

    const nextKana = newMemberKana.trim();

    const confirmUpdate = window.confirm(
      `${targetMemberForKana} のふりがなを「${nextKana}」に一括変更しますか？`
    );

    if (!confirmUpdate) return;

    try {
      setIsSaving(true);

      const updatedPhotos = photos.map((photo) => {
        if (photo.group === group && photo.member === targetMemberForKana) {
          return {
            ...photo,
            memberKana: nextKana,
          };
        }

        return photo;
      });

      await savePhotos(updatedPhotos);
      setTargetMemberForKana("");
      setNewMemberKana("");

      alert("ふりがなを一括変更しました");
    } catch (error) {
      console.error(error);
      alert("ふりがなの変更に失敗しました。コンソールを確認してください。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateGeneration = async () => {
    if (!targetMemberForGeneration) {
      alert("期生を変更したいメンバーを選択してください");
      return;
    }

    if (!user) {
      alert("ログイン情報を確認できません。再ログインしてください。");
      return;
    }

    const confirmUpdate = window.confirm(
      `${targetMemberForGeneration} の期生を「${newGeneration}」に一括変更しますか？`
    );

    if (!confirmUpdate) return;

    try {
      setIsSaving(true);

      const updatedPhotos = photos.map((photo) => {
        if (photo.group === group && photo.member === targetMemberForGeneration) {
          return {
            ...photo,
            generation: newGeneration,
          };
        }

        return photo;
      });

      await savePhotos(updatedPhotos);
      setTargetMemberForGeneration("");

      alert("期生を一括変更しました");
    } catch (error) {
      console.error(error);
      alert("期生の変更に失敗しました。コンソールを確認してください。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!targetMemberForDelete) {
      alert("削除したいメンバーを選択してください");
      return;
    }

    if (!user) {
      alert("ログイン情報を確認できません。再ログインしてください。");
      return;
    }

    const targetInfo = memberOptions.find(
      (item) => item.member === targetMemberForDelete
    );

    const confirmDelete = window.confirm(
      `${targetMemberForDelete} の生写真データをすべて削除します。\n` +
        `対象：${targetInfo?.totalCount || 0}枚\n\n` +
        "この操作は元に戻せません。本当に削除しますか？"
    );

    if (!confirmDelete) return;

    try {
      setIsSaving(true);

      const deleteTargets = photos.filter(
        (photo) => photo.group === group && photo.member === targetMemberForDelete
      );

      await deletePhotoImagesForMember(group, targetMemberForDelete, photos);
      await deleteIndexedDbMemberImage(group, targetMemberForDelete);
      deleteLocalStorageMemberImage(targetMemberForDelete);

      const updatedPhotos = photos.filter(
        (photo) =>
          !(photo.group === group && photo.member === targetMemberForDelete)
      );

      localStorage.setItem("photos", JSON.stringify(updatedPhotos));
      setPhotos(updatedPhotos);

      for (const photo of deleteTargets) {
        await deleteUserPhoto(user.uid, photo.id || photo.firestoreId);
      }

      setTargetMemberForDelete("");

      alert("メンバーと関連する生写真データを削除しました");
    } catch (error) {
      console.error(error);
      alert("メンバーの削除に失敗しました。コンソールを確認してください。");
    } finally {
      setIsSaving(false);
    }
  };

  const getSelectedMemberInfo = (memberName) => {
    return memberOptions.find((item) => item.member === memberName);
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-xl font-bold">読み込み中...</p>
          <p className="text-zinc-400 text-sm mt-2">メンバー情報を取得しています</p>
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
          メンバー編集
        </h1>

        <p className="text-zinc-400 mb-6">
          {group} のメンバー情報をまとめて編集できます。
        </p>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4">
            <h2 className="text-xl font-bold mb-2">メンバー名を一括変更</h2>
            <p className="text-sm text-zinc-400 mb-4">
              名前を間違えて登録したときに、画像の紐づけも含めてすべてのデータをまとめて変更します。
            </p>

            <select
              value={targetMemberForName}
              onChange={(e) => {
                setTargetMemberForName(e.target.value);
                setNewMemberName(e.target.value);
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mb-3"
            >
              <option value="">メンバーを選択</option>
              {memberOptions.map((item) => (
                <option key={item.member} value={item.member}>
                  {item.member}（{item.generation || "期生未設定"} /{" "}
                  {item.totalCount}枚）
                </option>
              ))}
            </select>

            <input
              type="text"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="新しいメンバー名"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mb-3"
            />

            <button
              type="button"
              onClick={handleRenameMember}
              disabled={isSaving}
              className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
            >
              {isSaving ? "処理中..." : "メンバー名を変更する"}
            </button>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4">
            <h2 className="text-xl font-bold mb-2">ふりがなを一括変更</h2>
            <p className="text-sm text-zinc-400 mb-4">
              名前順の並び替えに使うふりがなをまとめて修正します。
            </p>

            <select
              value={targetMemberForKana}
              onChange={(e) => {
                const selected = e.target.value;
                setTargetMemberForKana(selected);
                setNewMemberKana(
                  getSelectedMemberInfo(selected)?.memberKana || ""
                );
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mb-3"
            >
              <option value="">メンバーを選択</option>
              {memberOptions.map((item) => (
                <option key={item.member} value={item.member}>
                  {item.member}（{item.memberKana || "ふりがな未設定"}）
                </option>
              ))}
            </select>

            <input
              type="text"
              value={newMemberKana}
              onChange={(e) => setNewMemberKana(e.target.value)}
              placeholder="新しいふりがな"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mb-3"
            />

            <button
              type="button"
              onClick={handleUpdateKana}
              disabled={isSaving}
              className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
            >
              {isSaving ? "処理中..." : "ふりがなを変更する"}
            </button>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4">
            <h2 className="text-xl font-bold mb-2">期生を一括変更</h2>
            <p className="text-sm text-zinc-400 mb-4">
              卒業などで期生表示をまとめて変更します。
            </p>

            <select
              value={targetMemberForGeneration}
              onChange={(e) => setTargetMemberForGeneration(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mb-3"
            >
              <option value="">メンバーを選択</option>
              {memberOptions.map((item) => (
                <option key={item.member} value={item.member}>
                  {item.member}（現在：{item.generation || "期生未設定"}）
                </option>
              ))}
            </select>

            <select
              value={newGeneration}
              onChange={(e) => setNewGeneration(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mb-3"
            >
              {generationOptions.map((generation) => (
                <option key={generation} value={generation}>
                  {generation}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleUpdateGeneration}
              disabled={isSaving}
              className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
            >
              {isSaving ? "処理中..." : "期生を変更する"}
            </button>
          </div>

          <div className="bg-zinc-900 border border-red-800 rounded-3xl p-4">
            <h2 className="text-xl font-bold mb-2 text-red-400">
              メンバーを削除
            </h2>
            <p className="text-sm text-zinc-400 mb-4">
              間違って登録したメンバーと、そのメンバーに紐づく生写真データ・画像を完全に削除します。
            </p>

            <select
              value={targetMemberForDelete}
              onChange={(e) => setTargetMemberForDelete(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mb-3"
            >
              <option value="">メンバーを選択</option>
              {memberOptions.map((item) => (
                <option key={item.member} value={item.member}>
                  {item.member}（{item.totalCount}枚）
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleDeleteMember}
              disabled={isSaving}
              className="w-full bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-white rounded-2xl py-3 font-bold active:scale-[0.98] transition"
            >
              {isSaving ? "処理中..." : "このメンバーを削除する"}
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
