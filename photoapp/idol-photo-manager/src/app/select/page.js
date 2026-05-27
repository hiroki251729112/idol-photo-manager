"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserPhotos } from "@/lib/photoService";
import { getMemberImagesMap, getPhotoImage } from "@/lib/imageDb";

export default function SelectPage() {
  const [group, setGroup] = useState("");
  const [viewMode, setViewMode] = useState("type");
  const [displayMode, setDisplayMode] = useState("image");
  const [photos, setPhotos] = useState([]);
  const [memberImages, setMemberImages] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const [yearFilter, setYearFilter] = useState("すべて");
  const [generationFilter, setGenerationFilter] = useState("すべて");

  const [typeSort, setTypeSort] = useState("created_desc");
  const [memberSort, setMemberSort] = useState("default");

  const typeThumbnailPriority = ["チュウ", "ヨリ", "座りヨリ", "ヒキ", "座り"];

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

  const attachIndexedDbImages = async (targetPhotos) => {
    const photosWithImages = await Promise.all(
      targetPhotos.map(async (photo) => {
        if (photo.image) return photo;

        try {
          const image = await getPhotoImage(photo);
          return {
            ...photo,
            image: image || "",
          };
        } catch (error) {
          console.error(error);
          return photo;
        }
      })
    );

    return photosWithImages;
  };

  useEffect(() => {
    let selectedGroup = "";
    let selectedMode = "";

    const loadBaseSettings = async () => {
      const params = new URLSearchParams(window.location.search);
      selectedGroup = params.get("group") || "";
      selectedMode = params.get("mode") || "";

      setGroup(selectedGroup);

      let loadedMemberImages =
        JSON.parse(localStorage.getItem(`memberImages_${selectedGroup}`)) || {};

      try {
        const indexedDbMemberImages = await getMemberImagesMap(selectedGroup);
        loadedMemberImages = {
          ...loadedMemberImages,
          ...indexedDbMemberImages,
        };
      } catch (error) {
        console.error(error);
      }

      setMemberImages(loadedMemberImages);

      const savedDisplayMode = localStorage.getItem("photoDisplayMode");
      if (savedDisplayMode === "image" || savedDisplayMode === "list") {
        setDisplayMode(savedDisplayMode);
      }

      const savedViewMode = localStorage.getItem("photoViewMode");

      if (selectedMode === "type" || selectedMode === "member") {
        setViewMode(selectedMode);
        localStorage.setItem("photoViewMode", selectedMode);
      } else if (savedViewMode === "type" || savedViewMode === "member") {
        setViewMode(savedViewMode);
      }
    };

    const loadPhotos = async (currentUser) => {
      try {
        const localPhotos = JSON.parse(localStorage.getItem("photos")) || [];
        let loadedPhotos = localPhotos;

        if (currentUser) {
          const firestorePhotos = await getUserPhotos(currentUser.uid);
          loadedPhotos = mergeFirestoreAndLocalPhotos(
            firestorePhotos,
            localPhotos
          );
        }

        const photosWithImages = await attachIndexedDbImages(loadedPhotos);
        setPhotos(photosWithImages);
      } catch (error) {
        console.error(error);
        const localPhotos = JSON.parse(localStorage.getItem("photos")) || [];
        const photosWithImages = await attachIndexedDbImages(localPhotos);
        setPhotos(photosWithImages);
      } finally {
        setIsLoading(false);
      }
    };

    const loadData = async (currentUser) => {
      setIsLoading(true);
      await loadBaseSettings();
      await loadPhotos(currentUser);
    };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      await loadData(currentUser);
    });

    const handleFocus = () => {
      const currentUser = auth.currentUser;
      loadData(currentUser);
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("photoDisplayMode", displayMode);
  }, [displayMode]);

  useEffect(() => {
    localStorage.setItem("photoViewMode", viewMode);
  }, [viewMode]);

  const filteredByGroup = useMemo(() => {
    return photos.filter((photo) => {
      if (group && photo.group !== group) return false;
      if (Number(photo.count || 0) <= 0) return false;
      return true;
    });
  }, [photos, group]);

  const totalCount = useMemo(() => {
    return filteredByGroup.reduce(
      (sum, photo) => sum + Number(photo.count || 0),
      0
    );
  }, [filteredByGroup]);

  const totalTypes = useMemo(() => {
    return new Set(
      filteredByGroup.map((photo) => `${photo.year}-${photo.type}`)
    ).size;
  }, [filteredByGroup]);

  const totalMembers = useMemo(() => {
    return new Set(filteredByGroup.map((photo) => photo.member)).size;
  }, [filteredByGroup]);

  const years = useMemo(() => {
    return [...new Set(filteredByGroup.map((photo) => photo.year))]
      .filter(Boolean)
      .sort((a, b) => Number(b) - Number(a));
  }, [filteredByGroup]);

  const getGenerationBaseNumber = (generation) => {
    if (!generation) return 999;

    const graduateMatch = generation.match(/卒業生（(\d+)期生）/);
    if (graduateMatch) {
      return 100 + Number(graduateMatch[1]);
    }

    if (generation === "卒業生") return 199;

    const normalMatch = generation.match(/(\d+)期生/);
    if (normalMatch) {
      return Number(normalMatch[1]);
    }

    return 999;
  };

  const getGenerationFilterSortValue = (generation) => {
    if (!generation) return -9999;

    const graduateMatch = generation.match(/卒業生（(\d+)期生）/);
    if (graduateMatch) {
      return -100 + Number(graduateMatch[1]);
    }

    if (generation === "卒業生") return -1000;

    const normalMatch = generation.match(/(\d+)期生/);
    if (normalMatch) {
      return Number(normalMatch[1]);
    }

    return -999;
  };

  const generations = useMemo(() => {
    return [
      ...new Set(
        filteredByGroup.map((photo) => photo.generation).filter(Boolean)
      ),
    ].sort(
      (a, b) =>
        getGenerationFilterSortValue(b) - getGenerationFilterSortValue(a)
    );
  }, [filteredByGroup]);

  const getTypeThumbnailImage = (photoList) => {
    for (const pose of typeThumbnailPriority) {
      const matchedPhoto = photoList.find(
        (photo) => photo.pose === pose && photo.image
      );

      if (matchedPhoto?.image) return matchedPhoto.image;
    }

    const otherPhoto = photoList.find(
      (photo) => !typeThumbnailPriority.includes(photo.pose) && photo.image
    );

    if (otherPhoto?.image) return otherPhoto.image;

    const anyPhoto = photoList.find((photo) => photo.image);

    return anyPhoto?.image || "";
  };

  const typeItems = useMemo(() => {
    const filtered =
      yearFilter === "すべて"
        ? filteredByGroup
        : filteredByGroup.filter((photo) => photo.year === yearFilter);

    const typeMap = new Map();

    filtered.forEach((photo) => {
      const key = `${photo.year}-${photo.type}`;

      if (!typeMap.has(key)) {
        typeMap.set(key, {
          year: photo.year,
          type: photo.type,
          image: "",
          totalCount: 0,
          latestId: Number(photo.id || 0),
          oldestId: Number(photo.id || 0),
          photos: [],
        });
      }

      const item = typeMap.get(key);

      item.totalCount += Number(photo.count || 0);
      item.latestId = Math.max(item.latestId, Number(photo.id || 0));
      item.oldestId = Math.min(item.oldestId, Number(photo.id || 0));
      item.photos.push(photo);
    });

    const items = [...typeMap.values()].map((item) => ({
      ...item,
      image: getTypeThumbnailImage(item.photos),
    }));

    switch (typeSort) {
      case "created_asc":
        return items.sort((a, b) => a.oldestId - b.oldestId);
      case "created_desc":
        return items.sort((a, b) => b.latestId - a.latestId);
      case "count":
        return items.sort((a, b) => b.totalCount - a.totalCount);
      default:
        return items;
    }
  }, [filteredByGroup, yearFilter, typeSort]);

  const memberItems = useMemo(() => {
    const filtered =
      generationFilter === "すべて"
        ? filteredByGroup
        : filteredByGroup.filter(
            (photo) => photo.generation === generationFilter
          );

    const memberMap = new Map();

    filtered.forEach((photo) => {
      if (!memberMap.has(photo.member)) {
        memberMap.set(photo.member, {
          member: photo.member,
          memberKana: photo.memberKana || "",
          generation: photo.generation || "",
          image: memberImages[photo.member] || "",
          totalCount: 0,
          latestId: Number(photo.id || 0),
          oldestId: Number(photo.id || 0),
        });
      }

      const item = memberMap.get(photo.member);

      item.totalCount += Number(photo.count || 0);
      item.latestId = Math.max(item.latestId, Number(photo.id || 0));
      item.oldestId = Math.min(item.oldestId, Number(photo.id || 0));

      if (!item.memberKana && photo.memberKana) {
        item.memberKana = photo.memberKana;
      }

      if (!item.generation && photo.generation) {
        item.generation = photo.generation;
      }

      if (memberImages[photo.member]) {
        item.image = memberImages[photo.member];
      }
    });

    const items = [...memberMap.values()];

    switch (memberSort) {
      case "name_asc":
        return items.sort((a, b) =>
          (a.memberKana || a.member).localeCompare(
            b.memberKana || b.member,
            "ja"
          )
        );
      case "name_desc":
        return items.sort((a, b) =>
          (b.memberKana || b.member).localeCompare(
            a.memberKana || a.member,
            "ja"
          )
        );
      case "default":
      default:
        return items.sort((a, b) => {
          const generationDiff =
            getGenerationBaseNumber(a.generation) -
            getGenerationBaseNumber(b.generation);

          if (generationDiff !== 0) return generationDiff;

          return (a.memberKana || a.member).localeCompare(
            b.memberKana || b.member,
            "ja"
          );
        });
    }
  }, [filteredByGroup, generationFilter, memberSort, memberImages]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-xl font-bold">読み込み中...</p>
          <p className="text-zinc-400 text-sm mt-2">コレクションを取得しています</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md md:max-w-4xl lg:max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Link href="/" className="inline-block text-zinc-400 text-sm">
            ← グループ選択へ
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/backup?group=${encodeURIComponent(group || "櫻坂46")}`}
              className="bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-full px-3 py-2 text-[11px] font-bold active:scale-[0.98] transition"
            >
              バックアップ
            </Link>

            <Link
              href={`/detail-edit?group=${encodeURIComponent(group || "櫻坂46")}`}
              className="bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-full px-4 py-2 text-xs font-bold active:scale-[0.98] transition"
            >
              詳細編集
            </Link>
          </div>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-center mb-2">
          生写真コレクション
        </h1>

        {group && <p className="text-center text-zinc-400 mb-5">{group}</p>}

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-3 text-center">
            <p className="text-[11px] text-zinc-400">総所持枚数</p>
            <p className="text-lg font-bold mt-1">{totalCount}枚</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-3 text-center">
            <p className="text-[11px] text-zinc-400">登録種類</p>
            <p className="text-lg font-bold mt-1">{totalTypes}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-3 text-center">
            <p className="text-[11px] text-zinc-400">登録メンバー</p>
            <p className="text-lg font-bold mt-1">{totalMembers}</p>
          </div>
        </div>

        <div className="flex gap-3 mb-5">
          <button
            type="button"
            onClick={() => setViewMode("type")}
            className={`flex-1 rounded-full py-3 font-bold ${
              viewMode === "type"
                ? "bg-cyan-500 text-black"
                : "bg-zinc-800 text-white"
            }`}
          >
            種類
          </button>

          <button
            type="button"
            onClick={() => setViewMode("member")}
            className={`flex-1 rounded-full py-3 font-bold ${
              viewMode === "member"
                ? "bg-cyan-500 text-black"
                : "bg-zinc-800 text-white"
            }`}
          >
            メンバー
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Link
            href={`/photo-add?group=${encodeURIComponent(group || "櫻坂46")}`}
            className="block bg-cyan-500 text-black rounded-2xl py-3 font-bold text-center"
          >
            ＋ 生写真を追加
          </Link>

          <Link
            href={`/export?group=${encodeURIComponent(group || "櫻坂46")}&mode=${viewMode}`}
            className="block bg-white text-black rounded-2xl py-3 font-bold text-center"
          >
            一覧画像を作成
          </Link>
        </div>

        <div className="flex items-start justify-between mb-3 gap-3">
          <p className="text-sm text-zinc-400 pt-2 whitespace-nowrap">
            {viewMode === "type" ? "年で絞り込み" : "期生で絞り込み"}
          </p>

          <div className="flex gap-3 items-start">
            {viewMode === "type" ? (
              <select
                value={typeSort}
                onChange={(e) => setTypeSort(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="created_desc">追加日（降順）</option>
                <option value="created_asc">追加日（昇順）</option>
                <option value="count">枚数順</option>
              </select>
            ) : (
              <select
                value={memberSort}
                onChange={(e) => setMemberSort(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="default">デフォルト</option>
                <option value="name_asc">名前（昇順）</option>
                <option value="name_desc">名前（降順）</option>
              </select>
            )}

            <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 min-w-[120px]">
              <button
                type="button"
                onClick={() => setDisplayMode("image")}
                className="flex items-center gap-2 text-sm w-full text-left"
              >
                <div
                  className={`w-3 h-3 rounded-full border ${
                    displayMode === "image"
                      ? "bg-cyan-400 border-cyan-400"
                      : "border-zinc-400"
                  }`}
                />
                <span>画像表示</span>
              </button>

              <button
                type="button"
                onClick={() => setDisplayMode("list")}
                className="flex items-center gap-2 text-sm w-full text-left mt-3"
              >
                <div
                  className={`w-3 h-3 rounded-full border ${
                    displayMode === "list"
                      ? "bg-cyan-400 border-cyan-400"
                      : "border-zinc-400"
                  }`}
                />
                <span>一覧表示</span>
              </button>
            </div>
          </div>
        </div>

        {viewMode === "type" && (
          <div>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
              <button
                type="button"
                onClick={() => setYearFilter("すべて")}
                className={`rounded-full px-4 py-2 text-sm whitespace-nowrap ${
                  yearFilter === "すべて"
                    ? "bg-cyan-500 text-black"
                    : "bg-zinc-800 text-white"
                }`}
              >
                すべて
              </button>

              {years.map((year) => (
                <button
                  type="button"
                  key={year}
                  onClick={() => setYearFilter(year)}
                  className={`rounded-full px-4 py-2 text-sm whitespace-nowrap ${
                    yearFilter === year
                      ? "bg-cyan-500 text-black"
                      : "bg-zinc-800 text-white"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>

            {displayMode === "image" && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {typeItems.map((item) => (
                  <Link
                    key={`${item.year}-${item.type}`}
                    href={`/photo-list?group=${encodeURIComponent(
                      group
                    )}&type=${encodeURIComponent(item.type)}&year=${item.year}&mode=type`}
                    className="bg-zinc-900 border border-zinc-700 rounded-3xl p-3"
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.type}
                        className="w-full aspect-[3/4] object-contain bg-zinc-800 rounded-2xl p-2"
                      />
                    ) : (
                      <div className="w-full aspect-[3/4] bg-zinc-800 rounded-2xl"></div>
                    )}

                    <div className="mt-3">
                      <p className="font-bold text-sm leading-tight">
                        {item.type}
                      </p>
                      <p className="text-sm text-zinc-400 mt-1">
                        {item.totalCount}枚 ・ {item.year}年
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {displayMode === "list" && (
              <div className="grid gap-1 md:grid-cols-2 lg:grid-cols-3 md:gap-x-6">
                {typeItems.map((item) => (
                  <Link
                    key={`${item.year}-${item.type}`}
                    href={`/photo-list?group=${encodeURIComponent(
                      group
                    )}&type=${encodeURIComponent(item.type)}&year=${item.year}&mode=type`}
                    className="block border-b border-zinc-800 py-3"
                  >
                    <p className="font-bold text-lg leading-tight">
                      {item.type}
                    </p>

                    <p className="text-zinc-400 text-sm mt-1">
                      {item.year}年 ・ {item.totalCount}枚
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {viewMode === "member" && (
          <div>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
              <button
                type="button"
                onClick={() => setGenerationFilter("すべて")}
                className={`rounded-full px-4 py-2 text-sm whitespace-nowrap ${
                  generationFilter === "すべて"
                    ? "bg-cyan-500 text-black"
                    : "bg-zinc-800 text-white"
                }`}
              >
                すべて
              </button>

              {generations.map((generation) => (
                <button
                  type="button"
                  key={generation}
                  onClick={() => setGenerationFilter(generation)}
                  className={`rounded-full px-4 py-2 text-sm whitespace-nowrap ${
                    generationFilter === generation
                      ? "bg-cyan-500 text-black"
                      : "bg-zinc-800 text-white"
                  }`}
                >
                  {generation}
                </button>
              ))}
            </div>

            {displayMode === "image" && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {memberItems.map((item) => (
                  <Link
                    key={item.member}
                    href={`/photo-list?group=${encodeURIComponent(
                      group
                    )}&member=${encodeURIComponent(item.member)}&mode=member`}
                    className="bg-zinc-900 border border-zinc-700 rounded-3xl p-3"
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.member}
                        className="w-full aspect-[3/4] object-cover bg-zinc-800 rounded-2xl"
                      />
                    ) : (
                      <div className="w-full aspect-[3/4] bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-500 text-sm">
                        No Image
                      </div>
                    )}

                    <div className="mt-3">
                      <p className="font-bold text-lg leading-tight">
                        {item.member}
                      </p>
                      <p className="text-sm text-zinc-400 mt-1">
                        {item.totalCount}枚 ・ {item.generation}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {displayMode === "list" && (
              <div className="grid gap-1 md:grid-cols-2 lg:grid-cols-3 md:gap-x-6">
                {memberItems.map((item) => (
                  <Link
                    key={item.member}
                    href={`/photo-list?group=${encodeURIComponent(
                      group
                    )}&member=${encodeURIComponent(item.member)}&mode=member`}
                    className="block border-b border-zinc-800 py-3"
                  >
                    <p className="font-bold text-lg leading-tight">
                      {item.member}
                    </p>

                    <p className="text-zinc-400 text-sm mt-1">
                      {item.generation} ・ {item.totalCount}枚
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
