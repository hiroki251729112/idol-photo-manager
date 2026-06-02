"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserPhotos, getUserTypeOrder } from "@/lib/photoService";
import { getMemberImagesMap, getPhotoImage } from "@/lib/imageDb";

export default function SelectPage() {
  const [group, setGroup] = useState("");
  const [viewMode, setViewMode] = useState("member");
  const [displayMode, setDisplayMode] = useState("image");
  const [photos, setPhotos] = useState([]);
  const [memberImages, setMemberImages] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const [yearFilter, setYearFilter] = useState("すべて");
  const [generationFilter, setGenerationFilter] = useState("すべて");

  const [typeSort, setTypeSort] = useState("created_desc");
  const [memberSort, setMemberSort] = useState("default");
  const [typeOrder, setTypeOrder] = useState([]);

  const typeThumbnailPriority = ["チュウ", "ヨリ", "座りヨリ", "ヒキ", "座り"];

  const normalizeText = (value) => {
    return String(value || "").trim();
  };

  const normalizeYear = (value) => {
    return String(value || "").trim();
  };

  const getPhotoKey = (photo) => {
    return [
      normalizeText(photo.group),
      normalizeYear(photo.year),
      normalizeText(photo.member),
      normalizeText(photo.type),
      normalizeText(photo.pose),
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

  const normalizeLoadedPhotos = (targetPhotos) => {
    return targetPhotos.map((photo) => ({
      ...photo,
      group: normalizeText(photo.group),
      year: normalizeYear(photo.year),
      generation: normalizeText(photo.generation),
      member: normalizeText(photo.member),
      memberKana: normalizeText(photo.memberKana),
      type: normalizeText(photo.type),
      pose: normalizeText(photo.pose),
      count: Number(photo.count || 0),
    }));
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
      }
    } catch (error) {
      console.error(error);
      setTypeOrder(localOrder);
    }
  };

  useEffect(() => {
    let selectedGroup = "";
    let selectedMode = "";

    const loadBaseSettings = async (currentUser) => {
      const params = new URLSearchParams(window.location.search);
      selectedGroup = params.get("group") || "";
      selectedMode = params.get("mode") || "";

      setGroup(selectedGroup);
      await loadTypeOrder(currentUser, selectedGroup);

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

      if (selectedMode === "type" || selectedMode === "member") {
        setViewMode(selectedMode);
        localStorage.setItem("photoViewMode", selectedMode);
      } else {
        setViewMode("member");
        localStorage.setItem("photoViewMode", "member");
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
        setPhotos(normalizeLoadedPhotos(photosWithImages));
      } catch (error) {
        console.error(error);
        const localPhotos = JSON.parse(localStorage.getItem("photos")) || [];
        const photosWithImages = await attachIndexedDbImages(localPhotos);
        setPhotos(normalizeLoadedPhotos(photosWithImages));
      } finally {
        setIsLoading(false);
      }
    };

    const loadData = async (currentUser) => {
      setIsLoading(true);
      await loadBaseSettings(currentUser);
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
      filteredByGroup.map((photo) => `${photo.year}__${photo.type}`)
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

  const sortTypeItemsByOriginalOrder = (items) => {
    const itemMap = new Map(items.map((item) => [item.key, item]));

    const orderedItems = typeOrder
      .filter((key) => itemMap.has(key))
      .map((key) => itemMap.get(key));

    const missingItems = items.filter((item) => !typeOrder.includes(item.key));

    return [...orderedItems, ...missingItems];
  };

  const typeItems = useMemo(() => {
    const filtered =
      yearFilter === "すべて"
        ? filteredByGroup
        : filteredByGroup.filter((photo) => photo.year === yearFilter);

    const typeMap = new Map();

    filtered.forEach((photo) => {
      const normalizedType = normalizeText(photo.type);
      const normalizedYear = normalizeYear(photo.year);

      if (!normalizedType || !normalizedYear) return;

      const key = `${normalizedYear}__${normalizedType}`;

      if (!typeMap.has(key)) {
        typeMap.set(key, {
          key,
          year: normalizedYear,
          type: normalizedType,
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
        return items.sort((a, b) => {
          const yearDiff = Number(a.year || 0) - Number(b.year || 0);
          if (yearDiff !== 0) return yearDiff;
          return Number(a.oldestId || 0) - Number(b.oldestId || 0);
        });

      case "count":
        return items.sort((a, b) => b.totalCount - a.totalCount);

      case "original":
        return sortTypeItemsByOriginalOrder(items);

      case "created_desc":
      default:
        return items.sort((a, b) => {
          const yearDiff = Number(b.year || 0) - Number(a.year || 0);
          if (yearDiff !== 0) return yearDiff;
          return Number(b.latestId || 0) - Number(a.latestId || a.id || 0);
        });
    }
  }, [filteredByGroup, yearFilter, typeSort, typeOrder]);

  const memberItems = useMemo(() => {
    const filtered =
      generationFilter === "すべて"
        ? filteredByGroup
        : filteredByGroup.filter(
            (photo) => photo.generation === generationFilter
          );

    const memberMap = new Map();

    filtered.forEach((photo) => {
      const normalizedMember = normalizeText(photo.member);

      if (!normalizedMember) return;

      if (!memberMap.has(normalizedMember)) {
        memberMap.set(normalizedMember, {
          member: normalizedMember,
          memberKana: photo.memberKana || "",
          generation: photo.generation || "",
          image: memberImages[normalizedMember] || "",
          totalCount: 0,
          latestId: Number(photo.id || 0),
          oldestId: Number(photo.id || 0),
        });
      }

      const item = memberMap.get(normalizedMember);

      item.totalCount += Number(photo.count || 0);
      item.latestId = Math.max(item.latestId, Number(photo.id || 0));
      item.oldestId = Math.min(item.oldestId, Number(photo.id || 0));

      if (!item.memberKana && photo.memberKana) {
        item.memberKana = photo.memberKana;
      }

      if (!item.generation && photo.generation) {
        item.generation = photo.generation;
      }

      if (memberImages[normalizedMember]) {
        item.image = memberImages[normalizedMember];
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
    <main className="min-h-screen bg-black text-white px-4 py-4">
      <div className="w-full max-w-md md:max-w-4xl lg:max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-3">
          <Link href="/" className="inline-block text-zinc-400 text-xs">
            ← グループ選択へ
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/backup?group=${encodeURIComponent(group || "櫻坂46")}`}
              className="bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-full px-3 py-1.5 text-[11px] font-bold active:scale-[0.98] transition"
            >
              バックアップ
            </Link>

            <Link
              href={`/detail-edit?group=${encodeURIComponent(group || "櫻坂46")}`}
              className="bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-full px-3 py-1.5 text-[11px] font-bold active:scale-[0.98] transition"
            >
              詳細編集
            </Link>
          </div>
        </div>

        <h1 className="text-2xl md:text-4xl font-bold text-center mb-1">
          生写真コレクション
        </h1>

        {group && <p className="text-center text-zinc-400 text-sm mb-4">{group}</p>}

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-2 text-center">
            <p className="text-[10px] text-zinc-400">総所持枚数</p>
            <p className="text-base font-bold mt-0.5">{totalCount}枚</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-2 text-center">
            <p className="text-[10px] text-zinc-400">登録種類</p>
            <p className="text-base font-bold mt-0.5">{totalTypes}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-2 text-center">
            <p className="text-[10px] text-zinc-400">登録メンバー</p>
            <p className="text-base font-bold mt-0.5">{totalMembers}</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-zinc-950 border border-zinc-800 p-1.5">
            <button
              type="button"
              onClick={() => setViewMode("member")}
              className={`rounded-xl py-2 text-sm font-bold border transition ${
                viewMode === "member"
                  ? "bg-zinc-100 text-black border-white"
                  : "bg-zinc-900 text-zinc-300 border-zinc-700"
              }`}
            >
              メンバー
            </button>

            <button
              type="button"
              onClick={() => setViewMode("type")}
              className={`rounded-xl py-2 text-sm font-bold border transition ${
                viewMode === "type"
                  ? "bg-zinc-100 text-black border-white"
                  : "bg-zinc-900 text-zinc-300 border-zinc-700"
              }`}
            >
              種類
            </button>
          </div>
        </div>

        <div className="mb-5">
          <div className="grid grid-cols-2 gap-3">
            <Link
              href={`/photo-add?group=${encodeURIComponent(group || "櫻坂46")}`}
              className="block bg-cyan-500 text-black rounded-2xl py-3 font-bold text-center border border-cyan-400 active:scale-[0.98] transition"
            >
              ＋ 生写真を追加
            </Link>

            <Link
              href={`/export?group=${encodeURIComponent(group || "櫻坂46")}&mode=${viewMode}`}
              className="block bg-zinc-900 text-zinc-100 rounded-2xl py-3 font-bold text-center border border-zinc-700 active:scale-[0.98] transition"
            >
              一覧画像を作成
            </Link>
          </div>
        </div>
        <div className="flex items-start justify-between mb-3 gap-3">
          <p className="text-sm text-zinc-400 pt-2 whitespace-nowrap">
            {viewMode === "type" ? "年で絞り込み" : "期生で絞り込み"}
          </p>

          <div className="flex gap-3 items-start">
            {viewMode === "type" ? (
              <div>
                <select
                  value={typeSort}
                  onChange={(e) => setTypeSort(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="created_desc">追加日（降順）</option>
                  <option value="created_asc">追加日（昇順）</option>
                  <option value="count">枚数順</option>
                  <option value="original">オリジナル</option>
                </select>

                {typeSort === "original" && (
                  <p className="text-[10px] text-zinc-500 mt-1 leading-4 text-right">
                    ※詳細編集の種類編集から表示順を変更できます
                  </p>
                )}
              </div>
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
                    key={item.key}
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
                      <p className="font-bold text-sm leading-tight break-words">
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
                    key={item.key}
                    href={`/photo-list?group=${encodeURIComponent(
                      group
                    )}&type=${encodeURIComponent(item.type)}&year=${item.year}&mode=type`}
                    className="block border-b border-zinc-800 py-3"
                  >
                    <p className="font-bold text-lg leading-tight break-words">
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
                      <p className="font-bold text-lg leading-tight break-words">
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
                    <p className="font-bold text-lg leading-tight break-words">
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