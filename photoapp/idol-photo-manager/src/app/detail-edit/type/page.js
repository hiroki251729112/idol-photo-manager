"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  deleteUserPhoto,
  getUserPhotos,
  getUserTypeOrder,
  saveUserPhotos,
  saveUserTypeOrder,
} from "@/lib/photoService";
import {
  deletePhotoImage,
  getPhotoImage,
  savePhotoImage,
} from "@/lib/imageDb";

export default function DetailEditTypePage() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [group, setGroup] = useState("櫻坂46");
  const [photos, setPhotos] = useState([]);

  const [targetTypeForRename, setTargetTypeForRename] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeYear, setNewTypeYear] = useState("2026");

  const [targetTypeForDelete, setTargetTypeForDelete] = useState("");

  const [typeOrder, setTypeOrder] = useState([]);
  const [draggingTypeKey, setDraggingTypeKey] = useState("");

  const normalizeText = (value) => String(value || "").trim();
  const normalizeYear = (value) => String(value || "").trim();

  const getPhotoKey = (photo) => {
    return [
      normalizeText(photo.group),
      normalizeYear(photo.year),
      normalizeText(photo.member),
      normalizeText(photo.type),
      normalizeText(photo.pose),
    ].join("__");
  };

  const getTypeKey = (year, type) => {
    return `${normalizeYear(year)}__${normalizeText(type)}`;
  };

  const parseTypeKey = (key) => {
    const [year = "", ...typeParts] = String(key || "").split("__");

    return {
      year,
      type: typeParts.join("__"),
    };
  };

  const getTypeOrderStorageKey = (targetGroup = group) => {
    return `typeOrder_${targetGroup || "櫻坂46"}`;
  };

  const saveTypeOrder = async (nextOrder) => {
    localStorage.setItem(getTypeOrderStorageKey(), JSON.stringify(nextOrder));
    setTypeOrder(nextOrder);

    if (user) {
      try {
        await saveUserTypeOrder(user.uid, group, nextOrder);
      } catch (error) {
        console.error(error);
      }
    }
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
      group: normalizeText(photo.group),
      year: normalizeYear(photo.year),
      generation: normalizeText(photo.generation),
      member: normalizeText(photo.member),
      memberKana: normalizeText(photo.memberKana),
      type: normalizeText(photo.type),
      completeType: normalizeText(photo.completeType),
      pose: normalizeText(photo.pose),
      status: photo.status || "所持",
      count: Number(photo.count || 0),
      imageUrl: photo.imageUrl || "",
      hasIndexedDbImage: Boolean(
        photo.hasIndexedDbImage || photo.hasLocalImage || photo.image
      ),
    };
  };

  const normalizePhotos = (targetPhotos) => {
    const map = new Map();

    targetPhotos.forEach((photo) => {
      const normalizedPhoto = {
        ...photo,
        id: String(photo.id || photo.firestoreId || Date.now() + Math.random()),
        group: normalizeText(photo.group),
        year: normalizeYear(photo.year),
        generation: normalizeText(photo.generation),
        member: normalizeText(photo.member),
        memberKana: normalizeText(photo.memberKana),
        type: normalizeText(photo.type),
        completeType: normalizeText(photo.completeType),
        pose: normalizeText(photo.pose),
        status: photo.status || "所持",
        count: Number(photo.count || 0),
        hasIndexedDbImage: Boolean(
          photo.hasIndexedDbImage || photo.hasLocalImage || photo.image
        ),
      };

      const key = getPhotoKey(normalizedPhoto);

      if (map.has(key)) {
        const existingPhoto = map.get(key);

        map.set(key, {
          ...existingPhoto,
          count:
            Number(existingPhoto.count || 0) +
            Number(normalizedPhoto.count || 0),
          status: normalizedPhoto.status || existingPhoto.status || "所持",
          generation: normalizedPhoto.generation || existingPhoto.generation,
          memberKana: normalizedPhoto.memberKana || existingPhoto.memberKana,
          completeType:
            normalizedPhoto.completeType || existingPhoto.completeType,
          imageUrl: normalizedPhoto.imageUrl || existingPhoto.imageUrl || "",
          hasIndexedDbImage: Boolean(
            existingPhoto.hasIndexedDbImage ||
              normalizedPhoto.hasIndexedDbImage
          ),
          image: existingPhoto.image || normalizedPhoto.image || "",
        });
      } else {
        map.set(key, normalizedPhoto);
      }
    });

    return [...map.values()].filter((photo) => Number(photo.count || 0) > 0);
  };

  const loadTypeOrder = async (currentUser, selectedGroup) => {
    const localOrder =
      JSON.parse(localStorage.getItem(`typeOrder_${selectedGroup}`)) || [];

    if (!currentUser) {
      setTypeOrder(localOrder);
      return;
    }

    try {
      const firestoreOrder = await getUserTypeOrder(
        currentUser.uid,
        selectedGroup
      );

      if (firestoreOrder.length > 0) {
        localStorage.setItem(
          `typeOrder_${selectedGroup}`,
          JSON.stringify(firestoreOrder)
        );
        setTypeOrder(firestoreOrder);
      } else {
        setTypeOrder(localOrder);

        if (localOrder.length > 0) {
          await saveUserTypeOrder(currentUser.uid, selectedGroup, localOrder);
        }
      }
    } catch (error) {
      console.error(error);
      setTypeOrder(localOrder);
    }
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
        setPhotos(normalizePhotos(mergedPhotos));
      } else {
        setPhotos(normalizePhotos(localPhotos));
      }
    } catch (error) {
      console.error(error);
      const localPhotos = JSON.parse(localStorage.getItem("photos")) || [];
      setPhotos(normalizePhotos(localPhotos));
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
      await loadTypeOrder(currentUser, selectedGroup);
      await loadPhotos(currentUser, selectedGroup);
    });

    return () => unsubscribe();
  }, []);

  const activeGroupPhotos = useMemo(() => {
    return photos.filter(
      (photo) =>
        normalizeText(photo.group) === group && Number(photo.count || 0) > 0
    );
  }, [photos, group]);

  const typeOptions = useMemo(() => {
    const map = new Map();

    activeGroupPhotos.forEach((photo) => {
      const normalizedType = normalizeText(photo.type);
      const normalizedYear = normalizeYear(photo.year);

      if (!normalizedType) return;

      const key = getTypeKey(normalizedYear, normalizedType);

      if (!map.has(key)) {
        map.set(key, {
          key,
          type: normalizedType,
          year: normalizedYear,
          totalCount: 0,
          latestId: Number(photo.id || 0),
          oldestId: Number(photo.id || 0),
          memberCountSet: new Set(),
        });
      }

      const item = map.get(key);
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
      .sort((a, b) => {
        const yearDiff = Number(b.year || 0) - Number(a.year || 0);
        if (yearDiff !== 0) return yearDiff;
        return Number(b.latestId || 0) - Number(a.latestId || 0);
      });
  }, [activeGroupPhotos]);

  const orderedTypeOptions = useMemo(() => {
    const typeMap = new Map(typeOptions.map((item) => [item.key, item]));
    const orderedKeys = typeOrder.filter((key) => typeMap.has(key));
    const missingItems = typeOptions.filter(
      (item) => !orderedKeys.includes(item.key)
    );

    return [...orderedKeys.map((key) => typeMap.get(key)), ...missingItems];
  }, [typeOptions, typeOrder]);

  useEffect(() => {
    if (!group || typeOptions.length === 0) return;

    const validKeys = new Set(typeOptions.map((item) => item.key));
    const cleanedOrder = typeOrder.filter((key) => validKeys.has(key));
    const missingKeys = typeOptions
      .map((item) => item.key)
      .filter((key) => !cleanedOrder.includes(key));

    const nextOrder = [...cleanedOrder, ...missingKeys];

    if (JSON.stringify(nextOrder) !== JSON.stringify(typeOrder)) {
      saveTypeOrder(nextOrder);
    }
  }, [group, typeOptions]);

  const savePhotos = async (updatedPhotos) => {
    const normalizedPhotos = normalizePhotos(updatedPhotos);

    localStorage.setItem("photos", JSON.stringify(normalizedPhotos));
    setPhotos(normalizedPhotos);

    if (user) {
      const firestorePhotos = normalizedPhotos
        .filter((photo) => normalizeText(photo.group) === group)
        .map(removeImageForFirestore);

      await saveUserPhotos(user.uid, firestorePhotos);
    }
  };

  const migrateImagesForTypeAndYearChange = async ({
    oldType,
    oldYear,
    nextType,
    nextYear,
    targetPhotos,
  }) => {
    const imageTasks = targetPhotos.map(async (photo) => {
      const oldPhoto = {
        ...photo,
        group,
        year: oldYear,
        type: oldType,
      };

      const nextPhoto = {
        ...photo,
        group,
        year: nextYear,
        type: nextType,
        hasIndexedDbImage: Boolean(
          photo.hasIndexedDbImage || photo.hasLocalImage || photo.image
        ),
      };

      try {
        const image = photo.image || (await getPhotoImage(oldPhoto));

        if (image) {
          await savePhotoImage(nextPhoto, image);
        }

        const isSameImageKey =
          normalizeYear(oldYear) === normalizeYear(nextYear) &&
          normalizeText(oldType) === normalizeText(nextType);

        if (!isSameImageKey) {
          await deletePhotoImage(oldPhoto);
        }
      } catch (error) {
        console.error(error);
      }
    });

    await Promise.all(imageTasks);
  };

  const deleteImagesForTypeAndYear = async ({
    targetType,
    targetYear,
    targetPhotos,
  }) => {
    const imageTasks = targetPhotos.map(async (photo) => {
      try {
        await deletePhotoImage({
          ...photo,
          group,
          year: targetYear,
          type: targetType,
        });
      } catch (error) {
        console.error(error);
      }
    });

    await Promise.all(imageTasks);
  };

  const reorderTypeOrder = (sourceKey, targetKey) => {
    if (!sourceKey || !targetKey || sourceKey === targetKey) return;

    const currentOrder = orderedTypeOptions.map((item) => item.key);
    const sourceIndex = currentOrder.indexOf(sourceKey);
    const targetIndex = currentOrder.indexOf(targetKey);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const nextOrder = [...currentOrder];
    const [movedItem] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, movedItem);

    saveTypeOrder(nextOrder);
  };

  const moveType = (key, direction) => {
    const currentOrder = orderedTypeOptions.map((item) => item.key);
    const index = currentOrder.indexOf(key);

    if (index === -1) return;

    const nextIndex = direction === "up" ? index - 1 : index + 1;

    if (nextIndex < 0 || nextIndex >= currentOrder.length) return;

    const nextOrder = [...currentOrder];
    const temp = nextOrder[index];
    nextOrder[index] = nextOrder[nextIndex];
    nextOrder[nextIndex] = temp;

    saveTypeOrder(nextOrder);
  };

  const resetTypeOrder = () => {
    const confirmReset = window.confirm(
      "種類の並び順を「追加日（降順）」に戻しますか？"
    );

    if (!confirmReset) return;

    const defaultOrder = typeOptions.map((item) => item.key);
    saveTypeOrder(defaultOrder);
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

    if (!newTypeYear) {
      alert("新しい年を選択してください");
      return;
    }

    if (!user) {
      alert("ログイン情報を確認できません。再ログインしてください。");
      return;
    }

    const targetInfo = typeOptions.find(
      (item) => item.key === targetTypeForRename
    );
    const { type: beforeTypeName, year: beforeYear } = parseTypeKey(
      targetTypeForRename
    );

    if (!targetInfo || !beforeTypeName) {
      alert("変更対象の種類情報を確認できませんでした");
      return;
    }

    const nextTypeName = normalizeText(newTypeName);
    const nextYear = normalizeYear(newTypeYear);
    const nextKey = getTypeKey(nextYear, nextTypeName);

    if (targetTypeForRename === nextKey) {
      alert("変更前と同じ種類名・年です");
      return;
    }

    const duplicateTypeExists = typeOptions.some(
      (item) => item.key === nextKey && item.key !== targetTypeForRename
    );

    const confirmText = duplicateTypeExists
      ? `${beforeYear}年「${beforeTypeName}」を既存の ${nextYear}年「${nextTypeName}」に統合しますか？\n同じメンバー・ポーズがある場合はデータがまとまります。`
      : `${beforeYear}年「${beforeTypeName}」を ${nextYear}年「${nextTypeName}」に一括変更しますか？`;

    const confirmUpdate = window.confirm(confirmText);

    if (!confirmUpdate) return;

    try {
      setIsSaving(true);

      const renameTargets = photos.filter(
        (photo) =>
          normalizeText(photo.group) === group &&
          normalizeText(photo.type) === beforeTypeName &&
          normalizeYear(photo.year) === beforeYear
      );

      await migrateImagesForTypeAndYearChange({
        oldType: beforeTypeName,
        oldYear: beforeYear,
        nextType: nextTypeName,
        nextYear,
        targetPhotos: renameTargets,
      });

      const updatedPhotos = photos.map((photo) => {
        if (
          normalizeText(photo.group) === group &&
          normalizeText(photo.type) === beforeTypeName &&
          normalizeYear(photo.year) === beforeYear
        ) {
          return {
            ...photo,
            year: nextYear,
            type: nextTypeName,
            hasIndexedDbImage: Boolean(
              photo.hasIndexedDbImage || photo.hasLocalImage || photo.image
            ),
          };
        }

        return photo;
      });

      const nextOrder = orderedTypeOptions
        .map((item) => (item.key === targetTypeForRename ? nextKey : item.key))
        .filter((key, index, array) => array.indexOf(key) === index);

      await saveTypeOrder(nextOrder);
      await savePhotos(updatedPhotos);

      setTargetTypeForRename("");
      setNewTypeName("");
      setNewTypeYear("2026");

      alert("種類名・年を一括変更しました");
    } catch (error) {
      console.error(error);
      alert("種類名・年の変更に失敗しました。コンソールを確認してください。");
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
      (item) => item.key === targetTypeForDelete
    );

    if (!targetInfo) {
      alert("削除対象の種類情報を確認できませんでした");
      return;
    }

    const confirmDelete = window.confirm(
      `${targetInfo.year}年「${targetInfo.type}」の生写真データをすべて削除します。\n` +
        `対象：${targetInfo.totalCount || 0}枚 / ${
          targetInfo.memberCount || 0
        }人分\n\n` +
        "この操作は元に戻せません。本当に削除しますか？"
    );

    if (!confirmDelete) return;

    try {
      setIsSaving(true);

      const deleteTargets = photos.filter(
        (photo) =>
          normalizeText(photo.group) === group &&
          normalizeText(photo.type) === targetInfo.type &&
          normalizeYear(photo.year) === targetInfo.year
      );

      await deleteImagesForTypeAndYear({
        targetType: targetInfo.type,
        targetYear: targetInfo.year,
        targetPhotos: deleteTargets,
      });

      const updatedPhotos = photos.filter(
        (photo) =>
          !(
            normalizeText(photo.group) === group &&
            normalizeText(photo.type) === targetInfo.type &&
            normalizeYear(photo.year) === targetInfo.year
          )
      );

      const nextOrder = orderedTypeOptions
        .map((item) => item.key)
        .filter((key) => key !== targetTypeForDelete);

      await saveTypeOrder(nextOrder);

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
    return typeOptions.find((item) => item.key === targetTypeForRename);
  }, [typeOptions, targetTypeForRename]);

  const selectedDeleteTypeInfo = useMemo(() => {
    return typeOptions.find((item) => item.key === targetTypeForDelete);
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
          {group} の生写真の種類名・年・表示順をまとめて編集できます。
        </p>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4">
            <h2 className="text-xl font-bold mb-2">種類名・年を一括変更</h2>

            <p className="text-sm text-zinc-400 mb-4">
              種類名や年を間違えて登録したときに、画像の紐づけも含めてまとめて変更します。
            </p>

            <select
              value={targetTypeForRename}
              onChange={(e) => {
                const selectedKey = e.target.value;
                const selectedItem = typeOptions.find(
                  (item) => item.key === selectedKey
                );

                setTargetTypeForRename(selectedKey);
                setNewTypeName(selectedItem?.type || "");
                setNewTypeYear(selectedItem?.year || "2026");
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mb-3"
            >
              <option value="">種類を選択</option>

              {orderedTypeOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.year}年　{item.type}（{item.totalCount}枚 / {item.memberCount}人）
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

            <select
              value={newTypeYear}
              onChange={(e) => setNewTypeYear(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mb-3"
            >
              {Array.from({ length: 16 }, (_, i) => 2026 - i).map(
                (yearOption) => (
                  <option key={yearOption} value={String(yearOption)}>
                    {yearOption}年
                  </option>
                )
              )}
            </select>

            {selectedRenameTypeInfo && (
              <p className="text-xs text-zinc-500 mb-3 leading-5">
                対象：{selectedRenameTypeInfo.year}年{" "}
                {selectedRenameTypeInfo.type} /{" "}
                {selectedRenameTypeInfo.totalCount}枚 /{" "}
                {selectedRenameTypeInfo.memberCount}人分
              </p>
            )}

            <button
              type="button"
              onClick={handleRenameType}
              disabled={isSaving}
              className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
            >
              {isSaving ? "処理中..." : "種類名・年を変更する"}
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

              {orderedTypeOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.year}年　{item.type}（{item.totalCount}枚 / {item.memberCount}人）
                </option>
              ))}
            </select>

            {selectedDeleteTypeInfo && (
              <p className="text-xs text-zinc-500 mb-3 leading-5">
                対象：{selectedDeleteTypeInfo.year}年{" "}
                {selectedDeleteTypeInfo.type} /{" "}
                {selectedDeleteTypeInfo.totalCount}枚 /{" "}
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

        <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4 mt-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold">種類の並び替え</h2>
              <p className="text-sm text-zinc-400 mt-2 leading-6">
                ここで並び替えた順番が、生写真追加・まとめて画像追加・種類タブのオリジナル順に反映されます。
                同じアカウントなら別端末にも反映されます。
              </p>
            </div>

            <button
              type="button"
              onClick={resetTypeOrder}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-2xl px-3 py-2 text-xs font-bold shrink-0 active:scale-[0.98] transition"
            >
              初期順に戻す
            </button>
          </div>

          {orderedTypeOptions.length === 0 ? (
            <p className="text-zinc-500 text-sm">並び替えできる種類がありません。</p>
          ) : (
            <div className="grid gap-2">
              {orderedTypeOptions.map((item, index) => (
                <div
                  key={item.key}
                  draggable
                  onDragStart={() => setDraggingTypeKey(item.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    reorderTypeOrder(draggingTypeKey, item.key);
                    setDraggingTypeKey("");
                  }}
                  onDragEnd={() => setDraggingTypeKey("")}
                  className={`bg-zinc-950 border rounded-2xl p-3 transition ${
                    draggingTypeKey === item.key
                      ? "border-cyan-500 opacity-60"
                      : "border-zinc-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-zinc-500 text-sm w-7 shrink-0 text-center">
                      {index + 1}
                    </div>

                    <div className="text-zinc-500 text-xl cursor-grab active:cursor-grabbing select-none shrink-0">
                      ☰
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-bold leading-tight break-words">
                        {item.type}
                      </p>
                      <p className="text-xs text-zinc-400 mt-1">
                        {item.year}年 ・ {item.totalCount}枚 ・ {item.memberCount}人
                      </p>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveType(item.key, "up")}
                        disabled={index === 0}
                        className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 disabled:text-zinc-600 text-zinc-100 font-bold"
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        onClick={() => moveType(item.key, "down")}
                        disabled={index === orderedTypeOptions.length - 1}
                        className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 disabled:text-zinc-600 text-zinc-100 font-bold"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-zinc-500 mt-4 leading-5">
            ※スマホでドラッグしづらい場合は、右側の ↑ ↓ ボタンを使ってください。
          </p>
        </div>
      </div>
    </main>
  );
}