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
  const [hasAutoCreated, setHasAutoCreated] = useState(false);
  const [message, setMessage] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [previewBlob, setPreviewBlob] = useState(null);

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

  const mergeFirestoreAndLocalPhotos = (firestorePhotos, localPhotos) => {
    const localMap = new Map();

    localPhotos.forEach((photo) => {
      localMap.set(getPhotoKey(photo), photo);
    });

    if (!firestorePhotos.length) return localPhotos;

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
          setPhotos(mergeFirestoreAndLocalPhotos(firestorePhotos, localPhotos));
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
    return activePhotos.filter((photo) => normalizeText(photo.group) === group);
  }, [photos, group]);

  const totalCount = useMemo(() => {
    return filteredPhotos.reduce(
      (sum, photo) => sum + Number(photo.count || 0),
      0
    );
  }, [filteredPhotos]);

  const poseOrder = useMemo(() => {
    return ["ヨリ", "チュウ", "座りヨリ", "ヒキ", "座り", "その他"];
  }, []);

  const getPoseBase = (pose) => {
    const match = String(pose || "").match(/^(.+?)（(.+)）$/);
    return match ? match[1] : pose;
  };

  const getPoseSetName = (pose) => {
    const match = String(pose || "").match(/^(.+?)（(.+)）$/);
    return match ? match[2] : "";
  };

  const getPoseSortIndex = (pose) => {
    const basePose = getPoseBase(pose);
    const setName = getPoseSetName(pose);
    const baseIndex = poseOrder.indexOf(basePose);
    const safeBaseIndex = baseIndex !== -1 ? baseIndex : poseOrder.length;

    return `${setName || "000"}-${String(safeBaseIndex).padStart(2, "0")}-${pose}`;
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
          ? normalizeText(photo.member)
          : `${normalizeYear(photo.year)}__${normalizeText(photo.type)}`;

      const mainTitle =
        exportMode === "member"
          ? normalizeText(photo.member)
          : normalizeText(photo.type);

      const subKey =
        exportMode === "member"
          ? normalizeText(photo.type)
          : normalizeText(photo.member);

      if (!mainKey || !subKey) return;

      if (!mainMap.has(mainKey)) {
        mainMap.set(mainKey, {
          title: mainTitle,
          memberKana: normalizeText(photo.memberKana),
          year: normalizeYear(photo.year),
          latestId: Number(photo.id || 0),
          rows: new Map(),
        });
      }

      const mainItem = mainMap.get(mainKey);
      mainItem.latestId = Math.max(mainItem.latestId, Number(photo.id || 0));

      if (!mainItem.memberKana && photo.memberKana) {
        mainItem.memberKana = normalizeText(photo.memberKana);
      }

      if (!mainItem.rows.has(subKey)) {
        mainItem.rows.set(subKey, []);
      }

      mainItem.rows.get(subKey).push({
        pose: normalizeText(photo.pose),
        text: getPoseText(photo),
      });
    });

    const items = [...mainMap.values()].map((item) => ({
      ...item,
      rows: [...item.rows.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "ja"))
        .map(([label, poses]) => ({
          label,
          poses: poses
            .sort((a, b) => getPoseSortIndex(a.pose).localeCompare(getPoseSortIndex(b.pose), "ja"))
            .map((poseItem) => poseItem.text)
            .join(" / "),
        })),
    }));

    if (exportMode === "member") {
      return items.sort((a, b) =>
        (a.memberKana || a.title).localeCompare(b.memberKana || b.title, "ja")
      );
    }

    return items.sort((a, b) => {
      const yearDiff = Number(b.year || 0) - Number(a.year || 0);
      if (yearDiff !== 0) return yearDiff;
      return a.title.localeCompare(b.title, "ja");
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

    if (currentLine) lines.push(currentLine);
    return lines;
  };

  const canvasToBlob = (canvas) => {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png", 1);
    });
  };

  const getCanvasWidthByColumns = (columns) => {
    if (columns === 1) return 900;
    if (columns === 2) return 1280;
    if (columns === 3) return 1760;
    if (columns === 4) return 2200;
    return 2600;
  };

  const buildBlocks = (ctx, items, columnWidth) => {
    const nameFont = "bold 27px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const rowFont = "21px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    return items.map((item) => {
      ctx.font = nameFont;
      const titleLines = wrapText(ctx, item.title, columnWidth);

      const rowLayouts = item.rows.map((row) => {
        ctx.font = rowFont;
        const rowText = `${row.label}　[${row.poses}]`;
        const lines = wrapText(ctx, rowText, columnWidth);
        return { rowText, lines };
      });

      const height =
        titleLines.length * 31 +
        5 +
        rowLayouts.reduce((sum, row) => sum + row.lines.length * 25 + 3, 0) +
        17;

      return {
        item,
        titleLines,
        rowLayouts,
        height,
      };
    });
  };

  const distributeBlocks = (blocks, columns, headerHeight) => {
    const columnHeights = Array(columns).fill(headerHeight);
    const placements = [];
    const itemsPerColumn = Math.ceil(blocks.length / columns);

    blocks.forEach((block, index) => {
      const columnIndex = Math.min(
        columns - 1,
        Math.floor(index / itemsPerColumn)
      );

      placements.push({
        ...block,
        columnIndex,
        y: columnHeights[columnIndex],
      });

      columnHeights[columnIndex] += block.height;
    });

    return {
      placements,
      columnHeights,
      maxHeight: Math.max(...columnHeights),
      minHeight: Math.min(...columnHeights),
    };
  };

  const chooseBestLayout = (ctx, items) => {
    const headerHeight = 105;
    const outerPadding = 42;
    const columnGap = 38;
    const totalRows = items.reduce((sum, item) => sum + item.rows.length, 0);
    const maxColumns = Math.min(5, Math.max(1, items.length));
    const candidates = [];

    for (let columns = 1; columns <= maxColumns; columns += 1) {
      const canvasWidth = getCanvasWidthByColumns(columns);
      const columnWidth =
        (canvasWidth - outerPadding * 2 - columnGap * (columns - 1)) / columns;
      const blocks = buildBlocks(ctx, items, columnWidth);
      const distributed = distributeBlocks(blocks, columns, headerHeight);
      const canvasHeight = Math.ceil(distributed.maxHeight + 34);
      const aspectRatio = canvasWidth / canvasHeight;
      const heightDifference = distributed.maxHeight - distributed.minHeight;

      let score = 0;

      if (canvasHeight > 3600) score += (canvasHeight - 3600) * 3;
      if (canvasHeight > 5200) score += (canvasHeight - 5200) * 6;
      if (aspectRatio > 2.1) score += (aspectRatio - 2.1) * 900;
      if (aspectRatio < 0.55) score += (0.55 - aspectRatio) * 900;

      score += heightDifference * 0.45;
      score += columns * 40;

      if (items.length <= 2 && columns > 1) score += 950;
      if (items.length <= 4 && columns > 2) score += 700;
      if (totalRows <= 40 && columns > 2) score += 550;

      candidates.push({
        columns,
        canvasWidth,
        canvasHeight,
        columnWidth,
        blocks,
        ...distributed,
        score,
      });
    }

    return candidates.sort((a, b) => a.score - b.score)[0];
  };

  const drawExportImage = async () => {
    if (document.fonts?.ready) await document.fonts.ready;

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    const layout = chooseBestLayout(tempCtx, exportItems);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const outerPadding = 42;
    const columnGap = 38;
    const topPadding = 36;

    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#111827";
    ctx.font = "bold 40px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(`${group} 生写真 所持リスト`, outerPadding, topPadding);

    ctx.fillStyle = "#6b7280";
    ctx.font = "24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(
      `${exportMode === "member" ? "メンバー別" : "種類別"}・合計 ${totalCount}枚`,
      outerPadding,
      topPadding + 36
    );

    if (layout.placements.length === 0) {
      ctx.fillStyle = "#374151";
      ctx.font = "22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("生写真が登録されていません。", outerPadding, 108);
      return canvas;
    }

    layout.placements.forEach((block) => {
      const x = outerPadding + block.columnIndex * (layout.columnWidth + columnGap);
      let y = block.y;

      ctx.fillStyle = "#be123c";
      ctx.font = "bold 27px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      block.titleLines.forEach((line) => {
        ctx.fillText(line, x, y);
        y += 31;
      });

      y += 5;

      ctx.fillStyle = "#111827";
      ctx.font = "21px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      block.rowLayouts.forEach((rowLayout) => {
        rowLayout.lines.forEach((line) => {
          ctx.fillText(line, x, y);
          y += 25;
        });
        y += 3;
      });

      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, block.y + block.height - 8);
      ctx.lineTo(x + layout.columnWidth, block.y + block.height - 8);
      ctx.stroke();
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

  useEffect(() => {
    const createInitialImage = async () => {
      if (isLoading || hasAutoCreated) return;

      try {
        setHasAutoCreated(true);
        setIsCreating(true);
        setMessage("保存用画像を作成しています...");

        await createImage();

        setMessage("");
      } catch (error) {
        console.error(error);
        setMessage("画像の作成に失敗しました。もう一度開き直してください。");
      } finally {
        setIsCreating(false);
      }
    };

    createInitialImage();
  }, [isLoading, hasAutoCreated, exportItems]);

  const handleSaveImage = async () => {
    if (isCreating) return;

    try {
      setIsCreating(true);
      setMessage("共有画面を開く準備をしています...");

      let image = previewImage;
      let blob = previewBlob;

      if (!image || !blob) {
        const result = await createImage();
        image = result.image;
        blob = result.blob;
      }

      if (!blob || !image) {
        setMessage("画像を準備できませんでした。");
        return;
      }

      const fileName = `${group || "collection"}-${exportMode}-list.png`;

      if (navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: "image/png" });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "生写真 所持リスト",
            text: "作成した一覧画像です。",
          });
          setMessage("共有画面を開きました。保存先で保存できているか確認してください。");
          return;
        }
      }

      const link = document.createElement("a");
      link.href = image;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setMessage("画像の保存を開始しました。保存できない場合は、下の画像を長押し保存してください。");
    } catch (error) {
      if (error?.name === "AbortError") {
        setMessage("保存をキャンセルしました。");
      } else {
        console.error(error);
        setMessage("保存に失敗しました。下の画像を長押し保存してください。");
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
          <p className="text-zinc-400 text-sm mt-2">一覧画像用データを取得しています</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md mx-auto">
        <Link
          href={`/select?group=${encodeURIComponent(group)}&mode=${exportMode}`}
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
            onClick={handleSaveImage}
            disabled={isCreating || !previewImage}
            className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition"
          >
            {isCreating ? "作成・保存中..." : "画像を保存"}
          </button>
        </div>

        {message && <p className="text-sm text-zinc-400 leading-6 mb-4">{message}</p>}

        <div className="bg-zinc-900 border border-cyan-500 rounded-3xl p-3 mb-6">
          <p className="text-sm font-bold mb-2">作成した画像</p>
          <p className="text-xs text-zinc-400 leading-5 mb-3">
            ボタンで保存できない場合は、この画像を長押しして保存してください。
          </p>

          {previewImage ? (
            <img
              src={previewImage}
              alt="保存用画像"
              className="w-full rounded-2xl bg-white"
            />
          ) : (
            <div className="w-full aspect-[3/4] rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-500 text-sm">
              保存用画像を作成しています...
            </div>
          )}
        </div>
      </div>
    </main>
  );
}