"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserPhotos } from "@/lib/photoService";

export default function ExportPage() {
  const exportRef = useRef(null);

  const [group, setGroup] = useState("");
  const [photos, setPhotos] = useState([]);
  const [exportMode, setExportMode] = useState("member");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [previewImage, setPreviewImage] = useState("");

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedGroup = params.get("group") || "";
    const selectedMode = params.get("mode") || "member";

    setGroup(selectedGroup);

    if (selectedMode === "type" || selectedMode === "member") {
      setExportMode(selectedMode);
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
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
    });

    return () => unsubscribe();
  }, []);

  const filteredPhotos = useMemo(() => {
    const activePhotos = photos.filter((photo) => Number(photo.count || 0) > 0);

    if (!group) return activePhotos;

    return activePhotos.filter((photo) => photo.group === group);
  }, [photos, group]);

  const totalCount = useMemo(() => {
    return filteredPhotos.reduce(
      (sum, photo) => sum + Number(photo.count || 0),
      0
    );
  }, [filteredPhotos]);

  const poseOrder = useMemo(() => {
    if (group === "乃木坂46") {
      return ["ヨリ", "チュウ", "ヒキ", "座り", "座りヨリ", "その他"];
    }

    return ["ヨリ", "チュウ", "ヒキ", "座り", "その他"];
  }, [group]);

  const getPoseSortIndex = (pose) => {
    const index = poseOrder.indexOf(pose);
    if (index !== -1) return index;
    return poseOrder.length;
  };

  const getGenerationSortValue = (generation) => {
    if (!generation) return 9999;

    const graduateMatch = generation.match(/卒業生（(\d+)期生）/);
    if (graduateMatch) {
      return 100 + Number(graduateMatch[1]);
    }

    const normalMatch = generation.match(/(\d+)期生/);
    if (normalMatch) {
      return Number(normalMatch[1]);
    }

    if (generation === "卒業生") return 199;

    return 9999;
  };

  const getPoseText = (photo) => {
    const count = Number(photo.count || 0);
    return count > 1 ? `${photo.pose}×${count}` : photo.pose;
  };

  const exportItems = useMemo(() => {
    const mainMap = new Map();

    filteredPhotos.forEach((photo) => {
      const mainKey =
        exportMode === "member"
          ? photo.member
          : `${photo.type}-${photo.year}`;

      const mainTitle = exportMode === "member" ? photo.member : photo.type;
      const subKey = exportMode === "member" ? photo.type : photo.member;

      if (!mainKey || !subKey) return;

      if (!mainMap.has(mainKey)) {
        mainMap.set(mainKey, {
          title: mainTitle,
          generation: photo.generation || "",
          year: photo.year || "",
          latestId: Number(photo.id || 0),
          rows: new Map(),
        });
      }

      const mainItem = mainMap.get(mainKey);

      mainItem.latestId = Math.max(mainItem.latestId, Number(photo.id || 0));

      if (!mainItem.generation && photo.generation) {
        mainItem.generation = photo.generation;
      }

      if (!mainItem.rows.has(subKey)) {
        mainItem.rows.set(subKey, []);
      }

      mainItem.rows.get(subKey).push({
        pose: photo.pose,
        text: getPoseText(photo),
      });
    });

    const items = [...mainMap.values()].map((item) => ({
      ...item,
      rows: [...item.rows.entries()].map(([label, poses]) => ({
        label,
        poses: poses
          .sort((a, b) => getPoseSortIndex(a.pose) - getPoseSortIndex(b.pose))
          .map((poseItem) => poseItem.text)
          .join(" / "),
      })),
    }));

    if (exportMode === "member") {
      return items.sort((a, b) => {
        const generationDiff =
          getGenerationSortValue(a.generation) -
          getGenerationSortValue(b.generation);

        if (generationDiff !== 0) return generationDiff;

        return a.title.localeCompare(b.title, "ja");
      });
    }

    return items.sort((a, b) => {
      const yearDiff = Number(b.year || 0) - Number(a.year || 0);

      if (yearDiff !== 0) return yearDiff;

      return Number(b.latestId || 0) - Number(a.latestId || 0);
    });
  }, [filteredPhotos, exportMode, poseOrder]);

  const createExportImage = async () => {
    if (!exportRef.current) return "";

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const canvas = await html2canvas(exportRef.current, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
    });

    return canvas.toDataURL("image/png");
  };

  const handleCreatePreview = async () => {
    if (!exportRef.current || isCreating) return;

    try {
      setIsCreating(true);
      setMessage("画像を作成しています...");

      const image = await createExportImage();

      if (!image) {
        setMessage("画像の作成に失敗しました。");
        return;
      }

      setPreviewImage(image);
      setMessage("画像を作成しました。下のプレビュー画像を長押しして保存してください。");
    } catch (error) {
      console.error(error);
      setMessage("画像の作成に失敗しました。もう一度試してください。");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDownload = async () => {
    if (!exportRef.current || isCreating) return;

    try {
      setIsCreating(true);
      setMessage("画像を作成しています...");

      const image = await createExportImage();

      if (!image) {
        setMessage("画像の作成に失敗しました。");
        return;
      }

      setPreviewImage(image);

      const link = document.createElement("a");
      link.href = image;
      link.download = `${group || "collection"}-${exportMode}-list.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setMessage("保存が始まらない場合は、下のプレビュー画像を長押しして保存してください。");
    } catch (error) {
      console.error(error);
      setMessage("画像保存に失敗しました。下のプレビュー作成も試してください。");
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenImage = async () => {
    if (!exportRef.current || isCreating) return;

    const imageWindow = window.open("", "_blank");

    if (imageWindow) {
      imageWindow.document.write(
        "<html><head><title>一覧画像</title><meta name='viewport' content='width=device-width, initial-scale=1.0'></head><body style='margin:0;background:#111;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;'><p>画像を作成しています...</p></body></html>"
      );
      imageWindow.document.close();
    }

    try {
      setIsCreating(true);
      setMessage("画像を作成しています...");

      const image = await createExportImage();

      if (!image) {
        setMessage("画像の作成に失敗しました。");
        if (imageWindow) imageWindow.close();
        return;
      }

      setPreviewImage(image);

      if (imageWindow) {
        imageWindow.document.open();
        imageWindow.document.write(`
          <html>
            <head>
              <title>一覧画像</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin:0;background:#111;color:white;font-family:sans-serif;padding:16px;box-sizing:border-box;">
              <p style="font-size:14px;line-height:1.7;margin:0 0 12px;">画像を長押しして保存してください。</p>
              <img src="${image}" style="width:100%;height:auto;display:block;background:white;border-radius:12px;" />
            </body>
          </html>
        `);
        imageWindow.document.close();
        setMessage("画像を別タブで開きました。画像を長押しして保存してください。");
      } else {
        setMessage("別タブを開けませんでした。下のプレビュー画像を長押しして保存してください。");
      }
    } catch (error) {
      console.error(error);
      setMessage("画像を開けませんでした。下のプレビュー作成も試してください。");
      if (imageWindow) imageWindow.close();
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-xl font-bold">読み込み中...</p>
          <p className="text-zinc-400 text-sm mt-2">一覧画像用データを取得しています</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md mx-auto">
        <Link
          href={`/select?group=${encodeURIComponent(group)}`}
          className="text-cyan-400 text-sm"
        >
          ← 戻る
        </Link>

        <h1 className="text-3xl font-bold mt-4 mb-2">
          一覧画像を作成
        </h1>

        <p className="text-zinc-400 mb-6">
          {group}・{exportMode === "member" ? "メンバー別" : "種類別"}
        </p>

        <div className="grid gap-3 mb-3">
          <button
            type="button"
            onClick={handleCreatePreview}
            disabled={isCreating}
            className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
          >
            {isCreating ? "作成中..." : "プレビュー画像を作成"}
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isCreating}
              className="w-full bg-white disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
            >
              画像として保存
            </button>

            <button
              type="button"
              onClick={handleOpenImage}
              disabled={isCreating}
              className="w-full bg-zinc-800 disabled:bg-zinc-700 disabled:text-zinc-400 text-white border border-zinc-700 rounded-2xl py-3 font-bold active:scale-[0.98] transition"
            >
              画像を開く
            </button>
          </div>
        </div>

        <p className="text-xs text-zinc-500 leading-5 mb-4">
          スマホで直接保存できない場合は、「プレビュー画像を作成」を押して、下に出た画像を長押しして保存してください。
        </p>

        {message && (
          <p className="text-sm text-zinc-400 leading-6 mb-4">
            {message}
          </p>
        )}

        {previewImage && (
          <div className="bg-zinc-900 border border-cyan-500 rounded-3xl p-3 mb-6">
            <p className="text-sm font-bold mb-2">保存用プレビュー</p>
            <p className="text-xs text-zinc-400 leading-5 mb-3">
              この画像を長押しして「写真に保存」または「画像を保存」を選んでください。
            </p>
            <img
              src={previewImage}
              alt="保存用プレビュー"
              className="w-full rounded-2xl bg-white"
            />
          </div>
        )}

        <div
          ref={exportRef}
          className="bg-white text-black p-5 rounded-2xl"
        >
          <h2 className="text-2xl font-bold mb-1">
            {group} 生写真 所持リスト
          </h2>

          <p className="text-sm text-gray-500 mb-5">
            {exportMode === "member" ? "メンバー別" : "種類別"}・合計 {totalCount}枚
          </p>

          {exportItems.length === 0 ? (
            <p className="text-sm text-gray-500">
              生写真が登録されていません。
            </p>
          ) : (
            <div className="grid gap-5">
              {exportItems.map((item, index) => (
                <div key={index}>
                  <p className="font-bold text-lg border-b border-gray-300 pb-1 mb-2">
                    {item.title}
                  </p>

                  <div className="grid gap-1 pl-3">
                    {item.rows.map((row, rowIndex) => (
                      <div
                        key={rowIndex}
                        className="grid grid-cols-[auto_1fr] gap-2 text-sm leading-6"
                      >
                        <p className="font-bold text-gray-700 whitespace-nowrap">
                          {row.label}
                        </p>

                        <p className="break-words">
                          [{row.poses}]
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
