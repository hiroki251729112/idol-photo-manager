"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserPhotos } from "@/lib/photoService";
import { getMemberImage, getPhotoImage, saveMemberImage } from "@/lib/imageDb";

export default function PhotoListPage() {
  const [member, setMember] = useState("");
  const [type, setType] = useState("");
  const [year, setYear] = useState("");
  const [group, setGroup] = useState("");
  const [returnMode, setReturnMode] = useState("");

  const [photos, setPhotos] = useState([]);
  const [sortType, setSortType] = useState("new");
  const [displayMode, setDisplayMode] = useState("image");
  const [memberImage, setMemberImage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
    const params = new URLSearchParams(window.location.search);

    const selectedGroup = params.get("group") || "";
    const selectedMember = params.get("member") || "";
    const selectedType = params.get("type") || "";
    const selectedYear = params.get("year") || "";
    const selectedMode = params.get("mode") || "";

    setGroup(selectedGroup);
    setMember(selectedMember);
    setType(selectedType);
    setYear(selectedYear);
    setReturnMode(
      selectedMode === "member" || selectedMode === "type"
        ? selectedMode
        : selectedMember
        ? "member"
        : "type"
    );

    const loadMemberImage = async () => {
      if (!selectedMember || !selectedGroup) return;

      const savedMemberImages =
        JSON.parse(localStorage.getItem(`memberImages_${selectedGroup}`)) || {};

      let image = savedMemberImages[selectedMember] || "";

      try {
        const indexedDbImage = await getMemberImage(selectedGroup, selectedMember);
        if (indexedDbImage) image = indexedDbImage;
      } catch (error) {
        console.error(error);
      }

      setMemberImage(image);
    };

    const savedDisplayMode = localStorage.getItem("photoDisplayMode");

    if (savedDisplayMode === "image" || savedDisplayMode === "list") {
      setDisplayMode(savedDisplayMode);
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
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
        await loadMemberImage();
      } catch (error) {
        console.error(error);
        const localPhotos = JSON.parse(localStorage.getItem("photos")) || [];
        const photosWithImages = await attachIndexedDbImages(localPhotos);
        setPhotos(photosWithImages);
        await loadMemberImage();
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem("photoDisplayMode", displayMode);
  }, [displayMode]);

  const getDefaultCompleteType = (targetGroup) => {
    return targetGroup === "乃木坂46" ? "3" : "4";
  };

  const allStandardPoseOrder = ["ヨリ", "チュウ", "ヒキ", "座り", "座りヨリ"];

  const getPoseSortIndex = (pose) => {
    const index = allStandardPoseOrder.indexOf(pose);

    if (index !== -1) return index;

    return allStandardPoseOrder.length;
  };

  const chunkItems = (items, size = 4) => {
    const chunks = [];

    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }

    return chunks;
  };

  const filteredPhotos = useMemo(() => {
    return photos
      .filter((photo) => {
        if (Number(photo.count || 0) <= 0) return false;

        if (group && photo.group !== group) return false;

        if (member) return photo.member === member;

        if (type && year) {
          return photo.type === type && photo.year === year;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortType === "new") return Number(b.id || 0) - Number(a.id || 0);
        if (sortType === "old") return Number(a.id || 0) - Number(b.id || 0);
        if (sortType === "count") return Number(b.count || 0) - Number(a.count || 0);

        return 0;
      });
  }, [photos, group, member, type, year, sortType]);

  const totalCount = useMemo(() => {
    return filteredPhotos.reduce(
      (sum, photo) => sum + Number(photo.count || 0),
      0
    );
  }, [filteredPhotos]);

  const title = member ? member : type && year ? type : "生写真一覧";

  const groupedItems = useMemo(() => {
    const map = new Map();

    filteredPhotos.forEach((photo) => {
      const key = member
        ? `${photo.year}-${photo.type}`
        : `${photo.member}-${photo.year}-${photo.type}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          member: photo.member,
          memberKana: photo.memberKana || "",
          generation: photo.generation || "",
          year: photo.year,
          type: photo.type,
          completeType: photo.completeType || getDefaultCompleteType(photo.group),
          title: member ? photo.type : photo.member,
          sub: member ? `${photo.year}年` : `${photo.year}年 ${photo.type}`,
          totalCount: 0,
          latestId: Number(photo.id || 0),
          oldestId: Number(photo.id || 0),
          photos: [],
        });
      }

      const item = map.get(key);

      item.totalCount += Number(photo.count || 0);
      item.latestId = Math.max(item.latestId, Number(photo.id || 0));
      item.oldestId = Math.min(item.oldestId, Number(photo.id || 0));

      if (photo.completeType) {
        item.completeType = photo.completeType;
      }

      item.photos.push(photo);
    });

    const items = [...map.values()].map((item) => ({
      ...item,
      photos: item.photos.sort(
        (a, b) => getPoseSortIndex(a.pose) - getPoseSortIndex(b.pose)
      ),
    }));

    return items.sort((a, b) => {
      if (sortType === "new") return b.latestId - a.latestId;
      if (sortType === "old") return a.oldestId - b.oldestId;
      if (sortType === "count") return b.totalCount - a.totalCount;

      return 0;
    });
  }, [filteredPhotos, member, sortType, group]);

  const makeDetailUrl = (item) => {
    const params = new URLSearchParams();

    if (group) params.set("group", group);
    if (item.member) params.set("member", item.member);
    if (item.type) params.set("type", item.type);
    if (item.year) params.set("year", item.year);
    params.set("mode", returnMode || (member ? "member" : "type"));

    const firstPhoto = item.photos[0];

    return `/photo-detail/${firstPhoto.id}?${params.toString()}`;
  };

  const getImageRows = (item) => {
    const photoMap = new Map();

    item.photos.forEach((photo) => {
      photoMap.set(photo.pose, photo);
    });

    const otherPhotos = item.photos
      .filter((photo) => !allStandardPoseOrder.includes(photo.pose))
      .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));

    if (item.completeType === "other") {
      return chunkItems(item.photos, 4).map((row) =>
        row.map((photo) => ({
          pose: photo.pose,
          photo,
          isPlaceholder: false,
        }))
      );
    }

    if (item.completeType === "3") {
      const firstRow = ["ヨリ", "チュウ", "ヒキ"].map((pose) => ({
        pose,
        photo: photoMap.get(pose) || null,
        isPlaceholder: !photoMap.get(pose),
      }));

      const otherRows = chunkItems(otherPhotos, 4).map((row) =>
        row.map((photo) => ({
          pose: photo.pose,
          photo,
          isPlaceholder: false,
        }))
      );

      return [firstRow, ...otherRows];
    }

    if (item.completeType === "4") {
      const firstRow = ["ヨリ", "チュウ", "ヒキ", "座り"].map((pose) => ({
        pose,
        photo: photoMap.get(pose) || null,
        isPlaceholder: !photoMap.get(pose),
      }));

      const otherRows = chunkItems(otherPhotos, 4).map((row) =>
        row.map((photo) => ({
          pose: photo.pose,
          photo,
          isPlaceholder: false,
        }))
      );

      return [firstRow, ...otherRows];
    }

    if (item.completeType === "5") {
      const firstRow = ["ヨリ", "チュウ", "ヒキ"].map((pose) => ({
        pose,
        photo: photoMap.get(pose) || null,
        isPlaceholder: !photoMap.get(pose),
      }));

      const secondBase = ["座り", "座りヨリ"].map((pose) => ({
        pose,
        photo: photoMap.get(pose) || null,
        isPlaceholder: !photoMap.get(pose),
      }));

      const secondRow = [
        ...secondBase,
        ...otherPhotos.slice(0, 2).map((photo) => ({
          pose: photo.pose,
          photo,
          isPlaceholder: false,
        })),
      ];

      const restOtherRows = chunkItems(otherPhotos.slice(2), 4).map((row) =>
        row.map((photo) => ({
          pose: photo.pose,
          photo,
          isPlaceholder: false,
        }))
      );

      return [firstRow, secondRow, ...restOtherRows];
    }

    return chunkItems(item.photos, 4).map((row) =>
      row.map((photo) => ({
        pose: photo.pose,
        photo,
        isPlaceholder: false,
      }))
    );
  };

  const getCompleteTypeLabel = (completeType) => {
    if (completeType === "3") return "3種コンプ";
    if (completeType === "4") return "4種コンプ";
    if (completeType === "5") return "5種コンプ";
    return "その他";
  };

  const handleMemberImageChange = (e) => {
    const file = e.target.files[0];

    if (!file || !member || !group) return;

    const reader = new FileReader();

    reader.onloadend = async () => {
      const imageData = reader.result;

      try {
        await saveMemberImage(group, member, imageData);
      } catch (error) {
        console.error(error);
      }

      const savedMemberImages =
        JSON.parse(localStorage.getItem(`memberImages_${group}`)) || {};

      savedMemberImages[member] = imageData;

      localStorage.setItem(
        `memberImages_${group}`,
        JSON.stringify(savedMemberImages)
      );

      setMemberImage(imageData);
    };

    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-xl font-bold">読み込み中...</p>
          <p className="text-zinc-400 text-sm mt-2">生写真データを取得しています</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5 overflow-x-hidden">
      <div className="w-full max-w-md md:max-w-4xl lg:max-w-6xl mx-auto min-w-0">
        <Link
          href={`/select?group=${encodeURIComponent(group)}&mode=${returnMode || (member ? "member" : "type")}`}
          className="text-cyan-400 text-sm"
        >
          ← 戻る
        </Link>

        <div className="mt-4 mb-5">
          {member ? (
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl md:text-4xl font-bold leading-tight break-words flex-1 min-w-0">
                  {title}
                </h1>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-14 h-14 rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center">
                    {memberImage ? (
                      <img
                        src={memberImage}
                        alt={member}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-zinc-500 text-[10px]">
                        No Image
                      </span>
                    )}
                  </div>

                  <label className="inline-block text-xs bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1.5 text-zinc-200 active:scale-[0.98] transition whitespace-nowrap">
                    写真変更
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleMemberImageChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <p className="text-zinc-400 mt-2">{totalCount}枚所持</p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl md:text-4xl font-bold leading-tight break-words min-w-0">
                {title}
              </h1>

              <p className="text-zinc-400 mt-2">
                {totalCount}枚所持
                {year && ` ・ ${year}年`}
              </p>
            </>
          )}
        </div>

        <div className="flex items-start justify-end mb-5 gap-3 overflow-x-auto pb-1">
          <div className="flex gap-3 items-start shrink-0">
            <select
              value={sortType}
              onChange={(e) => setSortType(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="new">新しい順</option>
              <option value="old">古い順</option>
              <option value="count">枚数順</option>
            </select>

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

        {groupedItems.length === 0 ? (
          <p className="text-zinc-400">生写真が登録されていません。</p>
        ) : (
          <>
            {displayMode === "image" && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {groupedItems.map((item) => {
                  const imageRows = getImageRows(item);

                  return (
                    <Link
                      key={item.key}
                      href={makeDetailUrl(item)}
                      className="block bg-zinc-900 border border-zinc-700 rounded-3xl p-3 min-w-0 overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <p className="font-bold text-lg leading-tight truncate">
                            {item.title}
                          </p>
                          <p className="text-sm text-zinc-400 mt-1 truncate">
                            {item.sub} ・ {item.totalCount}枚
                          </p>
                        </div>

                        <p className="text-[11px] text-zinc-500 shrink-0">
                          {getCompleteTypeLabel(item.completeType)}
                        </p>
                      </div>

                      <div className="grid gap-3">
                        {imageRows.map((row, rowIndex) => (
                          <div key={rowIndex} className="grid grid-cols-4 gap-1 sm:gap-2 min-w-0">
                            {row.map((slot, slotIndex) => (
                              <div key={`${slot.pose}-${slotIndex}`} className="min-w-0">
                                {slot.photo?.image ? (
                                  <img
                                    src={slot.photo.image}
                                    alt={`${item.title}-${slot.pose}`}
                                    className="w-full aspect-[3/4] object-contain bg-zinc-800 rounded-lg sm:rounded-xl p-0.5 sm:p-1"
                                  />
                                ) : (
                                  <div className="w-full aspect-[3/4] bg-zinc-800 rounded-lg sm:rounded-xl flex items-center justify-center text-zinc-500 text-[9px] sm:text-[10px] text-center px-0.5">
                                    No Image
                                  </div>
                                )}

                                <p className="text-[11px] text-center mt-1 font-bold truncate">
                                  {slot.pose}
                                </p>

                                {slot.photo && (
                                  <p className="text-[11px] text-center text-zinc-400">
                                    {slot.photo.count}枚
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {displayMode === "list" && (
              <div className="grid gap-1 md:grid-cols-2 lg:grid-cols-3 md:gap-x-6">
                {groupedItems.map((item) => (
                  <Link
                    key={item.key}
                    href={makeDetailUrl(item)}
                    className="block border-b border-zinc-800 py-3"
                  >
                    <p className="font-bold text-lg leading-tight">
                      {item.title}　【{item.sub}】
                    </p>

                    <p className="text-zinc-300 mt-1 pl-4 leading-7 break-words">
                      {item.photos
                        .map((photo) =>
                          Number(photo.count || 0) > 1
                            ? `${photo.pose}×${photo.count}`
                            : photo.pose
                        )
                        .join(" / ")}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
