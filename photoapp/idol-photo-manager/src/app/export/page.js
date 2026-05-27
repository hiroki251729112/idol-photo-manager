"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserPhotos } from "@/lib/photoService";

export default function ExportPage() {
  const [group, setGroup] = useState("");
  const [photos, setPhotos] = useState([]);
  const [exportMode, setExportMode] = useState("member");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [previewBlob, setPreviewBlob] = useState(null);
  const [imageOnlyMode, setImageOnlyMode] = useState(false);

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
      return ["ヨリ", "チュウ", "座りヨリ", "ヒキ", "座り", "その他"];
    }

    return ["ヨリ", "チュウ", "座りヨリ", "ヒキ", "座り", "その他"];
  }, [group]);

  const getPoseSortIndex = (pose) => {
    const index = poseOrder.indexOf(pose);
    if (index !== -1) return index;
    return poseOrder.length;
  };

  const getGenerationSortValue = (generation) => {
    if (!generation) return 9999;

    const graduateMatch = generation.match(/卒業生（(\d+)期生）/);
    if (graduateMatch) return 100 + Number(graduateMatch[1]);

    const normalMatch = generation.match(/(\d+)期生/);
    if (normalMatch) return Number(normalMatch[1]);

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

  const wrapText = (ctx, text, maxWidth) => {
    const chars = String(text || "").split("");
    const lines = [];
    let currentLine = "";

    chars.forEach((char) => {
      const testLine = currentLine + char;
      const width = ctx.measureText(testLine).width;

      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  };

  const drawRoundedRect = (ctx, x, y, width, height, radius) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  const canvasToBlob = (canvas) => {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png", 1);
    });
  };

  const getCanvasWidthByColumns = (columns) => {
    if (columns === 1) return 1240;
    if (columns === 2) return 1900;
    if (columns === 3) return 2580;
    return 3260;
  };

  const buildSectionLayouts = (ctx, items, columnWidth) => {
    const cardPadding = 28;
    const titleFont = "bold 34px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const rowFont = "26px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const innerWidth = columnWidth - cardPadding * 2;

    return items.map((item) => {
      ctx.font = titleFont;
      const titleLines = wrapText(ctx, item.title, innerWidth);

      const rowLayouts = item.rows.map((row) => {
        ctx.font = rowFont;
        const rowText = `${row.label}　[${row.poses}]`;
        const lines = wrapText(ctx, rowText, innerWidth);
        return {
          ...row,
          lines,
        };
      });

      let height = cardPadding;
      height += titleLines.length * 42;
      height += 18;

      rowLayouts.forEach((rowLayout, index) => {
        height += rowLayout.lines.length * 32;
        if (index < rowLayouts.length - 1) {
          height += 12;
        }
      });

      height += cardPadding;

      return {
        item,
        titleLines,
        rowLayouts,
        height,
      };
    });
  };

  const chooseColumnConfig = (ctx, items) => {
    const outerPadding = 60;
    const columnGap = 32;
    const headerHeight = 180;
    const targetColumnHeight = 2200;

    let selected = null;

    for (let columns = 1; columns <= 4; columns += 1) {
      const canvasWidth = getCanvasWidthByColumns(columns);
      const columnWidth =
        (canvasWidth - outerPadding * 2 - columnGap * (columns - 1)) / columns;

      const layouts = buildSectionLayouts(ctx, items, columnWidth);
      const columnHeights = Array(columns).fill(headerHeight);

      layouts.forEach((layout) => {
        let shortestIndex = 0;

        for (let i = 1; i < columnHeights.length; i += 1) {
          if (columnHeights[i] < columnHeights[shortestIndex]) {
            shortestIndex = i;
          }
        }

        columnHeights[shortestIndex] += layout.height + 24;
      });

      const maxHeight = Math.max(...columnHeights);

      selected = {
        columns,
        canvasWidth,
        columnWidth,
        layouts,
        maxHeight,
      };

      if (maxHeight <= targetColumnHeight) {
        break;
      }
    }

    return selected;
  };

  const drawExportImage = async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");

    const config = chooseColumnConfig(tempCtx, exportItems);

    const outerPadding = 60;
    const columnGap = 32;
    const topPadding = 70;
    const bottomPadding = 60;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const canvasWidth = config.canvasWidth;
    const canvasHeight = Math.ceil(config.maxHeight + bottomPadding);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const titleFont = "bold 58px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const metaFont = "32px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const cardTitleFont = "bold 34px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const rowFont = "26px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    const columnHeights = Array(config.columns).fill(180);

    ctx.fillStyle = "#111827";
    ctx.font = titleFont;
    ctx.fillText(`${group} 生写真 所持リスト`, outerPadding, topPadding);

    ctx.fillStyle = "#6b7280";
    ctx.font = metaFont;
    ctx.fillText(
      `${exportMode === "member" ? "メンバー別" : "種類別"}・合計 ${totalCount}枚`,
      outerPadding,
      topPadding + 52
    );

    if (config.layouts.length === 0) {
      ctx.fillStyle = "#374151";
      ctx.font = rowFont;
      ctx.fillText("生写真が登録されていません。", outerPadding, topPadding + 130);
      return canvas;
    }

    config.layouts.forEach((layout) => {
      let shortestIndex = 0;

      for (let i = 1; i < columnHeights.length; i += 1) {
        if (columnHeights[i] < columnHeights[shortestIndex]) {
          shortestIndex = i;
        }
      }

      const x =
        outerPadding +
        shortestIndex * (config.columnWidth + columnGap);
      const y = columnHeights[shortestIndex];
      const width = config.columnWidth;
      const height = layout.height;
      const cardPadding = 28;

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#d1d5db";
      ctx.lineWidth = 3;
      drawRoundedRect(ctx, x, y, width, height, 22);
      ctx.fill();
      ctx.stroke();

      let currentY = y + cardPadding + 6;

      ctx.fillStyle = "#111827";
      ctx.font = cardTitleFont;
      layout.titleLines.forEach((line) => {
        ctx.fillText(line, x + cardPadding, currentY);
        currentY += 42;
      });

      currentY += 10;

      ctx.fillStyle = "#374151";
      ctx.font = rowFont;

      layout.rowLayouts.forEach((rowLayout, index) => {
        rowLayout.lines.forEach((line) => {
          ctx.fillText(line, x + cardPadding, currentY);
          currentY += 32;
        });

        if (index < layout.rowLayouts.length - 1) {
          currentY += 12;
        }
      });

      columnHeights[shortestIndex] += height + 24;
    });

    return canvas;
  };

  const createImage = async () => {
    const canvas = await drawExportImage();
    const image = canvas.toDataURL("image/png");
    const blob = await canvasToBlob(canvas);

    setPreviewImage(image);
    setPreviewBlob(blob);

    return { image, blob };
  };

  const handleCreateImage = async () => {
    if (isCreating) return;

    try {
      setIsCreating(true);
      setMessage("画像を作成しています...");

      const result = await createImage();

      if (!result?.image) {
        setMessage("画像の作成に失敗しました。");
        return;
      }

      setMessage("画像を作成しました。下に表示された画像を確認してください。");
    } catch (error) {
      console.error(error);
      setMessage("画像の作成に失敗しました。もう一度試してください。");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveImage = async () => {
    if (isCreating) return;

    try {
      setIsCreating(true);
      setMessage("保存用画像を準備しています...");

      const result = previewBlob
        ? { image: previewImage, blob: previewBlob }
        : await createImage();

      if (!result?.blob || !result?.image) {
        setMessage("画像を準備できませんでした。");
        return;
      }

      const fileName = `${group || "collection"}-${exportMode}-list.png`;

      if (navigator.share && navigator.canShare) {
        const file = new File([result.blob], fileName, { type: "image/png" });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "生写真 所持リスト",
            text: "作成した一覧画像です。",
          });
          setMessage("共有画面を開きました。保存先を選んで画像を保存してください。");
          return;
        }
      }

      const link = document.createElement("a");
      link.href = result.image;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setMessage("保存を開始しました。うまくいかない場合は、表示された画像を長押し保存してください。");
    } catch (error) {
      if (error?.name === "AbortError") {
        setMessage("保存をキャンセルしました。");
      } else {
        console.error(error);
        setMessage("保存に失敗しました。表示された画像を長押し保存してください。");
      }
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-xl font-bold">読み込み中...</p>
          <p className="text-zinc-400 text-sm mt-2">
            一覧画像用データを取得しています
          </p>
        </div>
      </main>
    );
  }

  if (imageOnlyMode && previewImage) {
    return (
      <main className="min-h-screen bg-black text-white px-4 py-5">
        <div className="w-full max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setImageOnlyMode(false)}
            className="text-cyan-400 text-sm mb-4"
          >
            ← 作成画面に戻る
          </button>

          <h1 className="text-2xl font-bold mb-2">保存用画像</h1>
          <p className="text-sm text-zinc-400 leading-6 mb-4">
            下の画像を長押しして「写真に保存」または「画像を保存」を選んでください。
          </p>

          <img
            src={previewImage}
            alt="保存用画像"
            className="w-full h-auto block rounded-2xl bg-white"
          />
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

        <h1 className="text-3xl font-bold mt-4 mb-2">一覧画像を作成</h1>

        <p className="text-zinc-400 mb-6">
          {group}・{exportMode === "member" ? "メンバー別" : "種類別"}
        </p>

        <div className="grid gap-3 mb-4">
          <button
            type="button"
            onClick={handleCreateImage}
            disabled={isCreating}
            className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
          >
            {isCreating ? "作成中..." : "保存用画像を作成"}
          </button>

          <button
            type="button"
            onClick={handleSaveImage}
            disabled={isCreating}
            className="w-full bg-white disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
          >
            画像を保存
          </button>
        </div>

        <p className="text-xs text-zinc-500 leading-5 mb-4">
          先に「保存用画像を作成」を押してください。作成後は「画像を保存」から保存できます。
        </p>

        {message && (
          <p className="text-sm text-zinc-400 leading-6 mb-4">
            {message}
          </p>
        )}

        {previewImage && (
          <div className="bg-zinc-900 border border-cyan-500 rounded-3xl p-3 mb-6">
            <p className="text-sm font-bold mb-2">保存用画像</p>
            <p className="text-xs text-zinc-400 leading-5 mb-3">
              見づらい場合は下のボタンで画像だけ表示してください。
            </p>

            <button
              type="button"
              onClick={() => setImageOnlyMode(true)}
              className="w-full bg-cyan-500 text-black rounded-2xl py-3 font-bold mb-3 active:scale-[0.98] transition"
            >
              画像だけ表示する
            </button>

            <img
              src={previewImage}
              alt="保存用画像"
              className="w-full rounded-2xl bg-white"
            />
          </div>
        )}

        <div className="bg-white text-black p-5 rounded-2xl">
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
                <div key={index} className="border border-gray-300 rounded-2xl p-4">
                  <p className="font-bold text-lg mb-3 break-words">
                    {item.title}
                  </p>

                  <div className="grid gap-2">
                    {item.rows.map((row, rowIndex) => (
                      <div
                        key={rowIndex}
                        className="text-sm leading-6 break-words text-gray-700"
                      >
                        <span className="font-bold">{row.label}</span>
                        <span>　[{row.poses}]</span>
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