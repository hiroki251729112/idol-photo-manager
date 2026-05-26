"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { deleteUserPhoto, getUserPhotos } from "@/lib/photoService";
import { deletePhotoImage, getPhotoImage } from "@/lib/imageDb";

export default function PhotoDetailPage() {
  const params = useParams();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const [photos, setPhotos] = useState([]);
  const [basePhoto, setBasePhoto] = useState(null);

  const [group, setGroup] = useState("");
  const [member, setMember] = useState("");
  const [type, setType] = useState("");
  const [year, setYear] = useState("");

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
    const searchParams = new URLSearchParams(window.location.search);

    const urlGroup = searchParams.get("group") || "";
    const urlMember = searchParams.get("member") || "";
    const urlType = searchParams.get("type") || "";
    const urlYear = searchParams.get("year") || "";

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      try {
        const localPhotos = JSON.parse(localStorage.getItem("photos")) || [];
        let loadedPhotos = localPhotos;

        if (currentUser) {
          const firestorePhotos = await getUserPhotos(currentUser.uid);
          loadedPhotos = mergeFirestoreAndLocalPhotos(firestorePhotos, localPhotos);
        }

        loadedPhotos = await attachIndexedDbImages(loadedPhotos);

        const targetPhoto = loadedPhotos.find(
          (item) => String(item.id) === String(params.id) || String(item.firestoreId) === String(params.id)
        );

        const fixedGroup = urlGroup || targetPhoto?.group || "";
        const fixedMember = urlMember || targetPhoto?.member || "";
        const fixedType = urlType || targetPhoto?.type || "";
        const fixedYear = urlYear || targetPhoto?.year || "";

        setPhotos(loadedPhotos);
        setBasePhoto(targetPhoto || null);

        setGroup(fixedGroup);
        setMember(fixedMember);
        setType(fixedType);
        setYear(fixedYear);
      } catch (error) {
        console.error(error);
        const localPhotos = JSON.parse(localStorage.getItem("photos")) || [];
        const photosWithImages = await attachIndexedDbImages(localPhotos);

        const targetPhoto = photosWithImages.find(
          (item) => String(item.id) === String(params.id)
        );

        const fixedGroup = urlGroup || targetPhoto?.group || "";
        const fixedMember = urlMember || targetPhoto?.member || "";
        const fixedType = urlType || targetPhoto?.type || "";
        const fixedYear = urlYear || targetPhoto?.year || "";

        setPhotos(photosWithImages);
        setBasePhoto(targetPhoto || null);

        setGroup(fixedGroup);
        setMember(fixedMember);
        setType(fixedType);
        setYear(fixedYear);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [params.id]);

  const poseOrder = useMemo(() => {
    return ["ヨリ", "チュウ", "ヒキ", "座り", "座りヨリ"];
  }, []);

  const getPoseSortIndex = (pose) => {
    const index = poseOrder.indexOf(pose);

    if (index !== -1) return index;

    return poseOrder.length;
  };

  const groupedPhotos = useMemo(() => {
    return photos
      .filter((photo) => {
        if (Number(photo.count || 0) <= 0) return false;
        if (group && photo.group !== group) return false;
        if (member && photo.member !== member) return false;
        if (type && photo.type !== type) return false;
        if (year && photo.year !== year) return false;
        return true;
      })
      .sort((a, b) => getPoseSortIndex(a.pose) - getPoseSortIndex(b.pose));
  }, [photos, group, member, type, year]);

  const totalCount = useMemo(() => {
    return groupedPhotos.reduce(
      (sum, photo) => sum + Number(photo.count || 0),
      0
    );
  }, [groupedPhotos]);

  const makePhotoListUrl = () => {
    const urlParams = new URLSearchParams();

    if (group) urlParams.set("group", group);
    if (member) urlParams.set("member", member);
    if (type) urlParams.set("type", type);
    if (year) urlParams.set("year", year);

    const query = urlParams.toString();

    return query ? `/photo-list?${query}` : "/select";
  };

  const makeEditUrl = () => {
    const urlParams = new URLSearchParams();

    if (group) urlParams.set("group", group);
    if (member) urlParams.set("member", member);
    if (type) urlParams.set("type", type);
    if (year) urlParams.set("year", year);

    const query = urlParams.toString();

    return query
      ? `/photo-edit/${params.id}?${query}`
      : `/photo-edit/${params.id}`;
  };

  const handleDeleteGroup = async () => {
    const confirmDelete = window.confirm(
      "この生写真のまとまりをすべて削除しますか？\nこの操作は元に戻せません。"
    );

    if (!confirmDelete) return;

    try {
      setIsDeleting(true);

      const deleteTargets = photos.filter((photo) => {
        if (group && photo.group !== group) return false;
        if (member && photo.member !== member) return false;
        if (type && photo.type !== type) return false;
        if (year && photo.year !== year) return false;
        return true;
      });

      const updatedLocalPhotos = (JSON.parse(localStorage.getItem("photos")) || []).filter((photo) => {
        if (group && photo.group !== group) return true;
        if (member && photo.member !== member) return true;
        if (type && photo.type !== type) return true;
        if (year && photo.year !== year) return true;
        return false;
      });

      localStorage.setItem("photos", JSON.stringify(updatedLocalPhotos));

      for (const photo of deleteTargets) {
        try {
          await deletePhotoImage(photo);
        } catch (error) {
          console.error(error);
        }
      }

      if (user) {
        for (const photo of deleteTargets) {
          await deleteUserPhoto(user.uid, photo.id || photo.firestoreId);
        }
      }

      alert("削除しました");

      router.push(makePhotoListUrl());
    } catch (error) {
      console.error(error);
      alert("削除に失敗しました。コンソールを確認してください。");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-xl font-bold">読み込み中...</p>
          <p className="text-zinc-400 text-sm mt-2">生写真詳細を取得しています</p>
        </div>
      </main>
    );
  }

  if (!basePhoto && groupedPhotos.length === 0) {
    return (
      <main className="min-h-screen bg-black text-white px-4 py-5">
        <div className="w-full max-w-md md:max-w-4xl lg:max-w-5xl mx-auto">
          <Link href={makePhotoListUrl()} className="text-cyan-400 text-sm">
            ← 戻る
          </Link>

          <p className="mt-6 text-zinc-400">写真が見つかりません。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md md:max-w-4xl lg:max-w-5xl mx-auto">
        <Link href={makePhotoListUrl()} className="text-cyan-400 text-sm">
          ← 戻る
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-2">生写真詳細</h1>

        <p className="text-zinc-400 mb-6">{group}</p>

        <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
          <div>
            <div className="bg-zinc-900 border border-zinc-700 rounded-[28px] p-5 mb-6">
              <p className="text-3xl font-bold leading-tight">{member}</p>

              <p className="text-zinc-300 text-lg mt-2 leading-tight">
                {year}年 {type}
              </p>

              <p className="text-4xl font-bold mt-6">{totalCount}枚</p>

              <div className="mt-6 pt-4 border-t border-zinc-700 text-sm text-zinc-400 grid gap-2">
                <p>グループ：{group}</p>
                <p>期生：{groupedPhotos[0]?.generation || basePhoto?.generation || ""}</p>
              </div>
            </div>

            <div className="grid gap-3">
              <Link
                href={makeEditUrl()}
                className="block w-full bg-cyan-500 text-black rounded-3xl py-4 font-bold text-center text-lg active:scale-[0.98] transition"
              >
                編集する
              </Link>

              <button
                type="button"
                onClick={handleDeleteGroup}
                disabled={isDeleting}
                className="w-full bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-white rounded-3xl py-4 font-bold text-lg active:scale-[0.98] transition"
              >
                {isDeleting ? "削除中..." : "このまとまりを削除する"}
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded-[28px] p-4 mb-6">
            <p className="text-sm text-zinc-400 mb-4">所持ポーズ</p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {groupedPhotos.map((photo) => (
                <div
                  key={photo.id || photo.firestoreId}
                  className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3"
                >
                  {photo.image ? (
                    <img
                      src={photo.image}
                      alt={`${photo.member}-${photo.pose}`}
                      className="w-full aspect-[3/4] object-contain bg-zinc-800 rounded-xl p-2"
                    />
                  ) : (
                    <div className="w-full aspect-[3/4] bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 text-sm">
                      No Image
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 gap-2">
                    <p className="font-bold text-sm truncate">{photo.pose}</p>
                    <p className="text-lg font-bold">{photo.count}枚</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
