"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  getUserPhotos,
  getUserTypeOrder,
  saveUserPhotos,
} from "@/lib/photoService";
import { savePhotoImage } from "@/lib/imageDb";

function CountSelector({ value, onChange }) {
  const numericValue = Number(value || 0);
  const isCustom = value !== "" && numericValue > 10;

  return (
    <div className="w-full min-w-0 grid gap-2">
      <select
        value={isCustom ? "__custom__" : value || ""}
        onChange={(e) => {
          if (e.target.value === "__custom__") onChange("11");
          else onChange(e.target.value);
        }}
        className="w-full min-w-0 max-w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm"
      >
        <option value="">枚数選択</option>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
          <option key={num} value={String(num)}>
            {num}枚
          </option>
        ))}
        <option value="__custom__">枚数入力</option>
      </select>

      {isCustom && (
        <input
          type="number"
          min="11"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="入力"
          className="w-full min-w-0 max-w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm"
        />
      )}
    </div>
  );
}

function NumberSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3"
    >
      {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
        <option key={num} value={String(num)}>
          {num}
        </option>
      ))}
    </select>
  );
}

export default function PhotoBulkCropPage() {
  const router = useRouter();
  const imageAreaRef = useRef(null);
  const candidateAreaRef = useRef(null);

  const [user, setUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [group, setGroup] = useState("櫻坂46");
  const [year, setYear] = useState("2026");
  const [generation, setGeneration] = useState("1期生");

  const [member, setMember] = useState("");
  const [newMember, setNewMember] = useState("");
  const [newMemberKana, setNewMemberKana] = useState("");

  const [typeSelect, setTypeSelect] = useState("__new__");
  const [type, setType] = useState("");
  const [completeType, setCompleteType] = useState("4");
  const [poseSetNames, setPoseSetNames] = useState([""]);

  const [memberOptions, setMemberOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);
  const [memberGenerationMap, setMemberGenerationMap] = useState({});
  const [memberKanaMap, setMemberKanaMap] = useState({});

  const [sourceImage, setSourceImage] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const [gridCols, setGridCols] = useState("5");
  const [gridRows, setGridRows] = useState("3");
  const [cropBox, setCropBox] = useState({ left: 2, top: 2, right: 98, bottom: 98 });
  const [innerXLines, setInnerXLines] = useState([]);
  const [innerYLines, setInnerYLines] = useState([]);
  const [dragTarget, setDragTarget] = useState(null);

  const [croppedItems, setCroppedItems] = useState([]);
  const [activeCropId, setActiveCropId] = useState(null);
  const [singleDragTarget, setSingleDragTarget] = useState(null);
  const [message, setMessage] = useState("");

  const basePoseOptions = ["ヨリ", "チュウ", "ヒキ", "座り"];
  const poseOptions = ["ヨリ", "チュウ", "ヒキ", "座り", "座りヨリ", "その他"];

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

  const isCustomCompleteType = completeType === "custom";
  const actualCompleteType = isCustomCompleteType ? String(poseSetNames.length * 4) : completeType;
  const activePoseSetNames = useMemo(() => poseSetNames.map((name) => name.trim()).filter(Boolean), [poseSetNames]);

  const completeTypeOptions = useMemo(() => {
    const commonOptions = [
      { value: "custom", label: "〇種類コンプ" },
      { value: "other", label: "その他" },
    ];

    if (group === "乃木坂46") {
      return [
        { value: "3", label: "3種コンプ" },
        { value: "5", label: "5種コンプ" },
        ...commonOptions,
      ];
    }

    return [{ value: "4", label: "4種コンプ" }, ...commonOptions];
  }, [group]);

  const visiblePoseOptions = useMemo(() => {
    if (isCustomCompleteType) return [...basePoseOptions, "その他"];

    if (group === "乃木坂46") {
      if (completeType === "3") return ["ヨリ", "チュウ", "ヒキ", "その他"];
      return poseOptions;
    }

    if (completeType === "4") return ["ヨリ", "チュウ", "ヒキ", "座り", "その他"];
    return poseOptions;
  }, [group, completeType, isCustomCompleteType]);

  const selectedItems = useMemo(() => croppedItems.filter((item) => item.selected), [croppedItems]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedGroup = params.get("group") || "櫻坂46";
    const defaultCompleteType = selectedGroup === "乃木坂46" ? "3" : "4";

    setGroup(selectedGroup);
    setCompleteType(defaultCompleteType);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      await loadOptions(selectedGroup, currentUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setCompleteType((prev) => {
      if (prev === "custom" || prev === "other") return prev;

      if (group === "乃木坂46") {
        if (prev === "4") return "3";
        return prev || "3";
      }

      if (prev === "3" || prev === "5") return "4";
      return prev || "4";
    });
  }, [group]);

  useEffect(() => {
    resetGridLines();
  }, [gridCols, gridRows, sourceImage]);

  useEffect(() => {
    if (!croppedItems.length) {
      setActiveCropId(null);
      return;
    }

    const exists = croppedItems.some((item) => item.id === activeCropId);
    if (!exists) setActiveCropId(croppedItems[0].id);
  }, [croppedItems, activeCropId]);

  useEffect(() => {
    if (!dragTarget) return;

    const handlePointerMove = (event) => {
      const rect = imageAreaRef.current?.getBoundingClientRect();
      if (!rect) return;

      const xPercent = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      const yPercent = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));

      if (dragTarget.type === "box-left") setCropBox((prev) => ({ ...prev, left: Math.min(xPercent, prev.right - 2) }));
      if (dragTarget.type === "box-right") setCropBox((prev) => ({ ...prev, right: Math.max(xPercent, prev.left + 2) }));
      if (dragTarget.type === "box-top") setCropBox((prev) => ({ ...prev, top: Math.min(yPercent, prev.bottom - 2) }));
      if (dragTarget.type === "box-bottom") setCropBox((prev) => ({ ...prev, bottom: Math.max(yPercent, prev.top + 2) }));
      if (dragTarget.type === "inner-x") moveInnerLine("x", dragTarget.index, xPercent);
      if (dragTarget.type === "inner-y") moveInnerLine("y", dragTarget.index, yPercent);
    };

    const handlePointerUp = () => setDragTarget(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragTarget, cropBox, innerXLines, innerYLines]);

  useEffect(() => {
    if (!singleDragTarget) return;

    const handlePointerMove = (event) => {
      const area = document.getElementById(`single-adjust-area-${singleDragTarget.id}`);
      if (!area) return;

      const rect = area.getBoundingClientRect();
      const xPercent = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      const yPercent = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));

      updateSingleCropLine(singleDragTarget.id, singleDragTarget.edge, xPercent, yPercent);
    };

    const handlePointerUp = () => {
      recropSingleItem(singleDragTarget.id);
      setSingleDragTarget(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [singleDragTarget, imageSize, sourceImage, croppedItems]);

  const scrollToCandidates = () => {
    setTimeout(() => {
      candidateAreaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };
  const resetGridLines = () => {
    const cols = Math.max(1, Number(gridCols || 1));
    const rows = Math.max(1, Number(gridRows || 1));

    const xLines = Array.from({ length: Math.max(0, cols - 1) }, (_, index) => Number((((index + 1) / cols) * 100).toFixed(4)));
    const yLines = Array.from({ length: Math.max(0, rows - 1) }, (_, index) => Number((((index + 1) / rows) * 100).toFixed(4)));

    setInnerXLines(xLines);
    setInnerYLines(yLines);
  };

  const resetCropBox = () => {
    setCropBox({ left: 2, top: 2, right: 98, bottom: 98 });
    resetGridLines();
  };

  const moveInnerLine = (axis, index, absolutePercent) => {
    if (axis === "x") {
      const relative = ((absolutePercent - cropBox.left) / (cropBox.right - cropBox.left)) * 100;
      setInnerXLines((prev) => {
        const next = [...prev];
        const min = index === 0 ? 1 : next[index - 1] + 1;
        const max = index === next.length - 1 ? 99 : next[index + 1] - 1;
        next[index] = Math.max(min, Math.min(max, Number(relative.toFixed(4))));
        return next;
      });
    }

    if (axis === "y") {
      const relative = ((absolutePercent - cropBox.top) / (cropBox.bottom - cropBox.top)) * 100;
      setInnerYLines((prev) => {
        const next = [...prev];
        const min = index === 0 ? 1 : next[index - 1] + 1;
        const max = index === next.length - 1 ? 99 : next[index + 1] - 1;
        next[index] = Math.max(min, Math.min(max, Number(relative.toFixed(4))));
        return next;
      });
    }
  };

  const absoluteXLine = (relativePercent) => cropBox.left + ((cropBox.right - cropBox.left) * relativePercent) / 100;
  const absoluteYLine = (relativePercent) => cropBox.top + ((cropBox.bottom - cropBox.top) * relativePercent) / 100;

  const getGenerationSortValue = (value) => {
    if (!value) return 9999;
    const graduateMatch = value.match(/卒業生（(\d+)期生）/);
    if (graduateMatch) return 100 + Number(graduateMatch[1]);
    const normalMatch = value.match(/(\d+)期生/);
    if (normalMatch) return Number(normalMatch[1]);
    if (value === "卒業生") return 199;
    return 9999;
  };

  const sortMembers = (items) => {
    return [...items].sort((a, b) => {
      const generationDiff = getGenerationSortValue(a.generation) - getGenerationSortValue(b.generation);
      if (generationDiff !== 0) return generationDiff;
      return (a.memberKana || a.member).localeCompare(b.memberKana || b.member, "ja");
    });
  };

  const loadTypeOrder = async (currentUser, selectedGroup) => {
    const localOrder =
      JSON.parse(localStorage.getItem(`typeOrder_${selectedGroup}`)) || [];

    if (!currentUser) return localOrder;

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
        return firestoreOrder;
      }

      return localOrder;
    } catch (error) {
      console.error(error);
      return localOrder;
    }
  };

  const sortTypeOptionsBySavedOrder = (items, savedOrder = []) => {
    const itemMap = new Map(
      items.map((item) => [`${item.year}__${item.type}`, item])
    );

    const orderedItems = savedOrder
      .filter((key) => itemMap.has(key))
      .map((key) => itemMap.get(key));

    const missingItems = items.filter(
      (item) => !savedOrder.includes(`${item.year}__${item.type}`)
    );

    return [...orderedItems, ...missingItems];
  };

  const normalizePhotos = (photos) => {
    const normalizedPhotos = [];

    photos.forEach((photo) => {
      const existingIndex = normalizedPhotos.findIndex(
        (p) =>
          p.group === photo.group &&
          p.year === photo.year &&
          p.member === photo.member &&
          p.type === photo.type &&
          p.pose === photo.pose
      );

      if (existingIndex !== -1) {
        normalizedPhotos[existingIndex].count = Number(normalizedPhotos[existingIndex].count || 0) + Number(photo.count || 0);
        normalizedPhotos[existingIndex].status = photo.status || "所持";
        if (photo.memberKana) normalizedPhotos[existingIndex].memberKana = photo.memberKana;
        if (photo.completeType) normalizedPhotos[existingIndex].completeType = photo.completeType;
        if (photo.hasIndexedDbImage) normalizedPhotos[existingIndex].hasIndexedDbImage = true;
      } else {
        const { image, ...photoWithoutImage } = photo;
        normalizedPhotos.push({
          ...photoWithoutImage,
          id: String(photo.id || Date.now() + Math.random()),
          count: Number(photo.count || 0),
          status: photo.status || "所持",
        });
      }
    });

    return normalizedPhotos;
  };

  const removeImageForFirestore = (photo) => {
    return {
      id: String(photo.id || Date.now() + Math.random()),
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
      hasIndexedDbImage: Boolean(photo.hasIndexedDbImage),
    };
  };

  const loadOptions = async (selectedGroup, currentUser = null) => {
    let savedPhotos = [];
    const savedTypeOrder = await loadTypeOrder(currentUser, selectedGroup);

    try {
      if (currentUser) savedPhotos = await getUserPhotos(currentUser.uid);
    } catch (error) {
      console.error(error);
    }

    if (!savedPhotos.length) savedPhotos = JSON.parse(localStorage.getItem("photos")) || [];

    const groupPhotos = savedPhotos.filter((photo) => photo.group === selectedGroup && Number(photo.count || 0) > 0);

    const memberMap = new Map();
    const typeMap = new Map();
    const generationMap = {};
    const kanaMap = {};

    groupPhotos.forEach((photo) => {
      if (photo.member) {
        if (!memberMap.has(photo.member)) {
          memberMap.set(photo.member, { member: photo.member, memberKana: photo.memberKana || "", generation: photo.generation || "" });
        } else {
          const item = memberMap.get(photo.member);
          if (!item.memberKana && photo.memberKana) item.memberKana = photo.memberKana;
          if (!item.generation && photo.generation) item.generation = photo.generation;
        }
      }

      if (photo.member && photo.generation) generationMap[photo.member] = photo.generation;
      if (photo.member && photo.memberKana) kanaMap[photo.member] = photo.memberKana;

      if (photo.type) {
        const key = `${photo.year || ""}__${photo.type || ""}`;

        if (!typeMap.has(key)) {
          typeMap.set(key, {
            type: photo.type,
            year: photo.year || "",
            latestId: Number(photo.id || 0),
          });
        } else {
          const item = typeMap.get(key);
          item.latestId = Math.max(item.latestId, Number(photo.id || 0));
        }
      }
    });

    const defaultSortedTypeOptions = [...typeMap.values()].sort((a, b) => {
      const yearDiff = Number(b.year || 0) - Number(a.year || 0);
      if (yearDiff !== 0) return yearDiff;
      return Number(b.latestId || 0) - Number(a.latestId || 0);
    });

    const sortedTypeOptions = sortTypeOptionsBySavedOrder(
      defaultSortedTypeOptions,
      savedTypeOrder
    );

    setMemberOptions(sortMembers([...memberMap.values()]));
    setTypeOptions(sortedTypeOptions);
    setMemberGenerationMap(generationMap);
    setMemberKanaMap(kanaMap);

    const lastInput = JSON.parse(localStorage.getItem(`lastPhotoInput_${selectedGroup}`));

    if (lastInput) {
      setYear(lastInput.year || "2026");
      setGeneration(lastInput.generation || "1期生");
      setMember(lastInput.member || "");
      setType(lastInput.type || "");

      const lastTypeExists = sortedTypeOptions.some((item) => item.type === lastInput.type && item.year === lastInput.year);
      setTypeSelect(lastTypeExists ? `${lastInput.year}__${lastInput.type}` : "__new__");
      setCompleteType(lastInput.completeType && Number(lastInput.completeType) > 5 ? "custom" : lastInput.completeType || (selectedGroup === "乃木坂46" ? "3" : "4"));
    } else {
      setTypeSelect("__new__");
    }
  };

  const handleMemberChange = (value) => {
    setMember(value);
    if (value !== "__new__" && memberGenerationMap[value]) setGeneration(memberGenerationMap[value]);
  };

  const handleTypeSelectChange = (value) => {
    setTypeSelect(value);

    if (value === "__new__") {
      setType("");
      return;
    }

    const selectedType = typeOptions.find((item) => `${item.year}__${item.type}` === value);

    if (selectedType) {
      setType(selectedType.type);
      if (selectedType.year) setYear(selectedType.year);
    }
  };

  const handleCompleteTypeChange = (value) => {
    setCompleteType(value);
    if (value === "custom" && poseSetNames.length === 0) setPoseSetNames([""]);
  };

  const addPoseSetName = () => setPoseSetNames((prev) => [...prev, ""]);

  const updatePoseSetName = (index, value) => {
    setPoseSetNames((prev) => prev.map((name, i) => (i === index ? value : name)));
  };

  const removePoseSetName = (index) => {
    setPoseSetNames((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const buildCustomPoseName = (basePose, setName) => {
    const trimmedName = String(setName || "").trim();
    if (!trimmedName) return basePose;
    return `${basePose}（${trimmedName}）`;
  };

  const getFinalPoseFromItem = (item) => {
    if (item.pose === "その他") return item.customPose.trim();
    if (!isCustomCompleteType) return item.pose;
    return buildCustomPoseName(item.pose, item.poseSetName);
  };

  const handleSourceImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSourceImage(reader.result);
      setCroppedItems([]);
      setActiveCropId(null);
      setMessage("画像を読み込みました。外枠と線を動かして、切り出しを押してください。");
    };
    reader.readAsDataURL(file);
  };

  const handleImageLoad = (e) => setImageSize({ width: e.target.naturalWidth, height: e.target.naturalHeight });

  const createCropImage = (img, rect) => {
    const sx = Math.max(0, Number(rect.x || 0));
    const sy = Math.max(0, Number(rect.y || 0));
    const sw = Math.max(1, Number(rect.width || 1));
    const sh = Math.max(1, Number(rect.height || 1));
    const safeWidth = Math.min(sw, img.naturalWidth - sx);
    const safeHeight = Math.min(sh, img.naturalHeight - sy);

    const canvas = document.createElement("canvas");
    canvas.width = safeWidth;
    canvas.height = safeHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, safeWidth, safeHeight, 0, 0, safeWidth, safeHeight);

    return canvas.toDataURL("image/jpeg", 0.92);
  };

  const createCropImageAsync = (imageSource, rect) => {
    return new Promise((resolve, reject) => {
      if (!imageSource || !rect) {
        reject(new Error("画像または切り出し範囲がありません"));
        return;
      }

      const img = new Image();
      img.src = imageSource;

      img.onload = () => {
        try {
          const croppedImage = createCropImage(img, rect);
          resolve(croppedImage);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error("保存用画像の再生成に失敗しました"));
      };
    });
  };

  const getStableImageForSave = async (item) => {
    if (sourceImage && item?.rect) {
      try {
        return await createCropImageAsync(sourceImage, item.rect);
      } catch (error) {
        console.error(error);
      }
    }

    return item.image || "";
  };

  const makeZoomView = (rect) => {
    if (!imageSize.width || !imageSize.height) return null;

    const padding = Math.max(rect.width, rect.height) * 0.45;
    const x1 = Math.max(0, rect.x - padding);
    const y1 = Math.max(0, rect.y - padding);
    const x2 = Math.min(imageSize.width, rect.x + rect.width + padding);
    const y2 = Math.min(imageSize.height, rect.y + rect.height + padding);

    return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
  };

  const cropByGrid = () => {
    if (!sourceImage) {
      setMessage("先に画像を選択してください。");
      return;
    }

    const cols = Number(gridCols);
    const rows = Number(gridRows);

    if (!cols || !rows || cols <= 0 || rows <= 0) {
      setMessage("横の枚数と縦の段数を正しく選択してください。");
      return;
    }

    if (!imageSize.width || !imageSize.height) {
      setMessage("画像サイズを取得できていません。もう一度画像を読み込んでください。");
      return;
    }

    const previousItems = [...croppedItems];
    const isRecrop = previousItems.length > 0;
    const img = new Image();
    img.src = sourceImage;

    img.onload = () => {
      const xLines = [0, ...innerXLines, 100].sort((a, b) => a - b);
      const yLines = [0, ...innerYLines, 100].sort((a, b) => a - b);
      const results = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const index = row * cols + col;
          const previousItem = previousItems[index];
          const x1 = cropBox.left + ((cropBox.right - cropBox.left) * xLines[col]) / 100;
          const x2 = cropBox.left + ((cropBox.right - cropBox.left) * xLines[col + 1]) / 100;
          const y1 = cropBox.top + ((cropBox.bottom - cropBox.top) * yLines[row]) / 100;
          const y2 = cropBox.top + ((cropBox.bottom - cropBox.top) * yLines[row + 1]) / 100;

          const rect = {
            x: Math.round((x1 / 100) * imageSize.width),
            y: Math.round((y1 / 100) * imageSize.height),
            width: Math.round(((x2 - x1) / 100) * imageSize.width),
            height: Math.round(((y2 - y1) / 100) * imageSize.height),
          };

          results.push({
            id: previousItem?.id || Date.now() + Math.random() + index,
            image: createCropImage(img, rect),
            selected: previousItem?.selected || false,
            pose: previousItem?.pose || "",
            poseSetName: previousItem?.poseSetName || "",
            customPose: previousItem?.customPose || "",
            count: previousItem?.count || "1",
            row: row + 1,
            col: col + 1,
            rect,
            zoomView: previousItem?.zoomView || makeZoomView(rect),
          });
        }
      }

      setCroppedItems(results);
      if (results.length > 0 && !results.some((item) => item.id === activeCropId)) setActiveCropId(results[0].id);
      setMessage(isRecrop ? `${results.length}枚の候補を再切り出ししました。` : `${results.length}枚の候補を切り出しました。保存したい候補を選んでください。`);
      scrollToCandidates();
    };

    img.onerror = () => setMessage("画像の切り出しに失敗しました。");
  };

  const updateCroppedItem = (id, field, value) => {
    setCroppedItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const toggleThumbnailSelected = (id) => {
    setActiveCropId(id);
    setCroppedItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, selected: !item.selected, zoomView: item.zoomView || makeZoomView(item.rect) }
          : item
      )
    );
  };

  const removeCroppedItem = (id) => setCroppedItems((prev) => prev.filter((item) => item.id !== id));

  const getZoomViewRect = (item) => {
    if (!item || !imageSize.width || !imageSize.height) return { x: 0, y: 0, width: 1, height: 1 };
    return item.zoomView || makeZoomView(item.rect) || { x: 0, y: 0, width: 1, height: 1 };
  };

  const getSingleBoxPercentInZoom = (item) => {
    if (!item || !imageSize.width || !imageSize.height) return { left: 0, top: 0, width: 0, height: 0 };

    const view = getZoomViewRect(item);

    return {
      left: ((item.rect.x - view.x) / view.width) * 100,
      top: ((item.rect.y - view.y) / view.height) * 100,
      width: (item.rect.width / view.width) * 100,
      height: (item.rect.height / view.height) * 100,
    };
  };

  const getZoomedSourceImageStyle = (item) => {
    if (!item || !imageSize.width || !imageSize.height) return { width: "100%", left: "0%", top: "0%" };

    const view = getZoomViewRect(item);

    return {
      width: `${(imageSize.width / view.width) * 100}%`,
      left: `-${(view.x / view.width) * 100}%`,
      top: `-${(view.y / view.height) * 100}%`,
    };
  };

  const updateSingleCropLine = (id, edge, xPercent, yPercent) => {
    const targetItem = croppedItems.find((item) => item.id === id);
    if (!targetItem) return;

    const view = getZoomViewRect(targetItem);
    const imageX = view.x + (xPercent / 100) * view.width;
    const imageY = view.y + (yPercent / 100) * view.height;

    setCroppedItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const minSize = 8;
        const rect = { ...item.rect };
        const currentLeft = rect.x;
        const currentTop = rect.y;
        const currentRight = rect.x + rect.width;
        const currentBottom = rect.y + rect.height;

        if (edge === "left") {
          const nextLeft = Math.max(0, Math.min(imageX, currentRight - minSize));
          rect.x = Math.round(nextLeft);
          rect.width = Math.round(currentRight - nextLeft);
        }
        if (edge === "right") {
          const nextRight = Math.min(imageSize.width, Math.max(imageX, currentLeft + minSize));
          rect.width = Math.round(nextRight - currentLeft);
        }
        if (edge === "top") {
          const nextTop = Math.max(0, Math.min(imageY, currentBottom - minSize));
          rect.y = Math.round(nextTop);
          rect.height = Math.round(currentBottom - nextTop);
        }
        if (edge === "bottom") {
          const nextBottom = Math.min(imageSize.height, Math.max(imageY, currentTop + minSize));
          rect.height = Math.round(nextBottom - currentTop);
        }

        return { ...item, rect };
      })
    );
  };

  const recropSingleItem = (id) => {
    if (!sourceImage) return;
    const img = new Image();
    img.src = sourceImage;

    img.onload = () => {
      setCroppedItems((prev) => prev.map((item) => (item.id === id ? { ...item, image: createCropImage(img, item.rect) } : item)));
    };
  };

  const resetSelectedItemsAfterContinuousSave = (savedIds) => {
    setCroppedItems((prev) =>
      prev.map((item) =>
        savedIds.includes(item.id)
          ? { ...item, selected: false, pose: "", poseSetName: "", customPose: "", count: "1" }
          : item
      )
    );

    const nextItem = croppedItems.find((item) => !savedIds.includes(item.id));
    if (nextItem) setActiveCropId(nextItem.id);
  };

  const closeNewMemberAndTypeInputsAfterSave = (finalMember, finalMemberKana, finalType) => {
    if (member === "__new__") {
      setMemberOptions((prev) => {
        const exists = prev.some((item) => item.member === finalMember);
        const next = exists ? prev : [...prev, { member: finalMember, memberKana: finalMemberKana, generation }];
        return sortMembers(next);
      });
      setMemberGenerationMap((prev) => ({ ...prev, [finalMember]: generation }));
      setMemberKanaMap((prev) => ({ ...prev, [finalMember]: finalMemberKana }));
      setMember(finalMember);
      setNewMember("");
      setNewMemberKana("");
    }

    if (typeSelect === "__new__") {
      setTypeOptions((prev) => {
        const exists = prev.some((item) => item.type === finalType && item.year === year);
        return exists ? prev : [{ type: finalType, year, latestId: Date.now() }, ...prev];
      });
      setTypeSelect(`${year}__${finalType}`);
      setType(finalType);
    }
  };

  const handleSave = async ({ continueRegister = false } = {}) => {
    const finalMember = member === "__new__" ? newMember.trim() : member.trim();
    const finalType = type.trim();
    const finalMemberKana = member === "__new__" ? newMemberKana.trim() : memberKanaMap[member] || "";

    if (!user) return alert("ログイン情報を確認できません。再ログインしてください。");
    if (!finalMember) return alert("メンバーを選択してください");
    if (member === "__new__" && !finalMemberKana) return alert("メンバーのふりがなを入力してください");
    if (!finalType) return alert("種類を入力してください");

    if (isCustomCompleteType && activePoseSetNames.length === 0) {
      return alert("〇種類コンプでは、登録情報のポーズ種類名を1つ以上入力してください。例：ドレス");
    }

    const selectedItemsForSave = croppedItems.filter((item) => item.selected);
    if (selectedItemsForSave.length === 0) return alert("保存する画像を1枚以上選択してください");

    const invalidItem = selectedItemsForSave.find((item) => {
      const finalPose = getFinalPoseFromItem(item);
      if (isCustomCompleteType && item.pose !== "その他" && !item.poseSetName) return true;
      return !finalPose || !item.count || Number(item.count) <= 0;
    });

    if (invalidItem) return alert("選択した画像には、ポーズ種類名・ポーズ・枚数を設定してください。その他の場合はポーズ名も入力してください。");

    try {
      setIsSaving(true);

      let localPhotos = JSON.parse(localStorage.getItem("photos")) || [];
      localPhotos = normalizePhotos(localPhotos);

      let firestorePhotos = [];

      try {
        firestorePhotos = await getUserPhotos(user.uid);
      } catch (error) {
        console.error(error);
      }

      firestorePhotos = normalizePhotos(firestorePhotos);
      const imageSaveTasks = [];

      for (const item of selectedItemsForSave) {
        const finalPose = getFinalPoseFromItem(item);
        const count = Number(item.count);
        const stableImage = await getStableImageForSave(item);

        const basePhoto = {
          id: String(Date.now() + Math.random()),
          group,
          year,
          generation,
          member: finalMember,
          memberKana: finalMemberKana,
          type: finalType,
          completeType: actualCompleteType,
          pose: finalPose,
          status: "所持",
          count,
          hasIndexedDbImage: Boolean(stableImage),
        };

        if (stableImage) {
          imageSaveTasks.push(savePhotoImage(basePhoto, stableImage));
        }

        const updatePhotos = (photos) => {
          const existingPhotoIndex = photos.findIndex(
            (photo) =>
              photo.group === group &&
              photo.year === year &&
              photo.member === finalMember &&
              photo.type === finalType &&
              photo.pose === finalPose
          );

          if (existingPhotoIndex !== -1) {
            photos[existingPhotoIndex].count =
              Number(photos[existingPhotoIndex].count || 0) + count;
            photos[existingPhotoIndex].status = "所持";
            photos[existingPhotoIndex].generation = generation;
            photos[existingPhotoIndex].completeType = actualCompleteType;

            if (finalMemberKana) {
              photos[existingPhotoIndex].memberKana = finalMemberKana;
            }

            if (stableImage) {
              photos[existingPhotoIndex].hasIndexedDbImage = true;
            }
          } else {
            photos.push(basePhoto);
          }
        };

        updatePhotos(localPhotos);
        updatePhotos(firestorePhotos);
      }

      await Promise.all(imageSaveTasks);

      localPhotos = normalizePhotos(localPhotos);
      firestorePhotos = normalizePhotos(firestorePhotos).map(removeImageForFirestore);

      localStorage.setItem("photos", JSON.stringify(localPhotos));
      localStorage.setItem(
        `lastPhotoInput_${group}`,
        JSON.stringify({ year, generation, member: finalMember, type: finalType, completeType: actualCompleteType })
      );

      await saveUserPhotos(user.uid, firestorePhotos);
      closeNewMemberAndTypeInputsAfterSave(finalMember, finalMemberKana, finalType);

      if (continueRegister) {
        const savedIds = selectedItemsForSave.map((item) => item.id);
        resetSelectedItemsAfterContinuousSave(savedIds);
        setMessage(`${selectedItemsForSave.length}件を保存しました。続けて別の候補を選択して登録できます。`);
        alert("保存しました。続けて登録できます。");
        scrollToCandidates();
        return;
      }

      alert("保存しました");
      router.push(`/select?group=${encodeURIComponent(group)}&mode=member`);
    } catch (error) {
      console.error(error);
      alert("保存に失敗しました。コンソールを確認してください。");
    } finally {
      setIsSaving(false);
    }
  };
  const renderAdjustArea = (item) => {
    const itemBox = getSingleBoxPercentInZoom(item);
    const zoomView = getZoomViewRect(item);
    const zoomedStyle = getZoomedSourceImageStyle(item);

    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 grid gap-3">
        <p className="text-sm font-bold">画像調整</p>
        <p className="text-xs text-zinc-400 leading-5">水色の枠線をドラッグして調整してください。指を離すと自動で再切り出しされます。</p>

        <div
          id={`single-adjust-area-${item.id}`}
          className="relative w-full select-none touch-none rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-800"
          style={{ aspectRatio: `${zoomView.width} / ${zoomView.height}` }}
        >
          <img src={sourceImage} alt="個別調整用元画像" className="absolute block opacity-90 max-w-none" style={zoomedStyle} draggable={false} />
          <div className="absolute border-[3px] border-cyan-400 pointer-events-none" style={{ left: `${itemBox.left}%`, top: `${itemBox.top}%`, width: `${itemBox.width}%`, height: `${itemBox.height}%` }} />

          <button type="button" onPointerDown={(e) => { e.preventDefault(); setSingleDragTarget({ id: item.id, edge: "left" }); }} className="absolute top-0 bottom-0 w-6 -translate-x-1/2 cursor-ew-resize bg-transparent" style={{ left: `${itemBox.left}%` }} />
          <button type="button" onPointerDown={(e) => { e.preventDefault(); setSingleDragTarget({ id: item.id, edge: "right" }); }} className="absolute top-0 bottom-0 w-6 -translate-x-1/2 cursor-ew-resize bg-transparent" style={{ left: `${itemBox.left + itemBox.width}%` }} />
          <button type="button" onPointerDown={(e) => { e.preventDefault(); setSingleDragTarget({ id: item.id, edge: "top" }); }} className="absolute left-0 right-0 h-6 -translate-y-1/2 cursor-ns-resize bg-transparent" style={{ top: `${itemBox.top}%` }} />
          <button type="button" onPointerDown={(e) => { e.preventDefault(); setSingleDragTarget({ id: item.id, edge: "bottom" }); }} className="absolute left-0 right-0 h-6 -translate-y-1/2 cursor-ns-resize bg-transparent" style={{ top: `${itemBox.top + itemBox.height}%` }} />
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md md:max-w-5xl lg:max-w-6xl mx-auto">
        <Link href={`/select?group=${encodeURIComponent(group)}&mode=member`} className="text-cyan-400 text-sm">← 戻る</Link>

        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-2">まとめて画像追加</h1>
        <p className="text-zinc-400 mb-6">外枠と線を動かしてまとめて切り出し、その後に候補ごとに調整できます。</p>

        <div className="grid gap-5">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4">
            <p className="text-sm text-zinc-400 mb-4">画像アップロード・全体切り出し</p>
            <input type="file" accept="image/*" onChange={handleSourceImageChange} className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm mb-4" />

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">横の枚数</label>
                <NumberSelect value={gridCols} onChange={setGridCols} />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">縦の段数</label>
                <NumberSelect value={gridRows} onChange={setGridRows} />
              </div>
            </div>

            {sourceImage && (
              <div>
                <div ref={imageAreaRef} className="relative w-full select-none touch-none rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-800">
                  <img src={sourceImage} alt="アップロード画像" onLoad={handleImageLoad} className="w-full block" draggable={false} />
                  <div className="absolute border-[4px] border-cyan-400 pointer-events-none" style={{ left: `${cropBox.left}%`, top: `${cropBox.top}%`, width: `${cropBox.right - cropBox.left}%`, height: `${cropBox.bottom - cropBox.top}%` }} />

                  <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget({ type: "box-left" }); }} className="absolute top-0 bottom-0 w-5 -translate-x-1/2 cursor-ew-resize bg-transparent" style={{ left: `${cropBox.left}%` }} />
                  <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget({ type: "box-right" }); }} className="absolute top-0 bottom-0 w-5 -translate-x-1/2 cursor-ew-resize bg-transparent" style={{ left: `${cropBox.right}%` }} />
                  <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget({ type: "box-top" }); }} className="absolute left-0 right-0 h-5 -translate-y-1/2 cursor-ns-resize bg-transparent" style={{ top: `${cropBox.top}%` }} />
                  <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget({ type: "box-bottom" }); }} className="absolute left-0 right-0 h-5 -translate-y-1/2 cursor-ns-resize bg-transparent" style={{ top: `${cropBox.bottom}%` }} />

                  {innerXLines.map((line, index) => {
                    const absolute = absoluteXLine(line);
                    return (
                      <div key={`x-${index}`}>
                        <div className="absolute top-0 bottom-0 w-[3px] bg-cyan-400 pointer-events-none" style={{ left: `${absolute}%` }} />
                        <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget({ type: "inner-x", index }); }} className="absolute top-0 bottom-0 w-5 -translate-x-1/2 cursor-ew-resize bg-transparent" style={{ left: `${absolute}%` }} />
                      </div>
                    );
                  })}

                  {innerYLines.map((line, index) => {
                    const absolute = absoluteYLine(line);
                    return (
                      <div key={`y-${index}`}>
                        <div className="absolute left-0 right-0 h-[3px] bg-cyan-400 pointer-events-none" style={{ top: `${absolute}%` }} />
                        <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget({ type: "inner-y", index }); }} className="absolute left-0 right-0 h-5 -translate-y-1/2 cursor-ns-resize bg-transparent" style={{ top: `${absolute}%` }} />
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-zinc-500 mt-3 leading-5">水色の外枠で全体範囲を調整し、内側の線でカード同士の境界を調整できます。</p>
                {imageSize.width > 0 && imageSize.height > 0 && <p className="text-xs text-zinc-500 mt-1">元画像サイズ：{imageSize.width} × {imageSize.height}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-4">
              <button type="button" onClick={resetCropBox} disabled={!sourceImage} className="w-full bg-zinc-800 disabled:bg-zinc-700 disabled:text-zinc-500 border border-zinc-700 text-zinc-200 rounded-2xl py-3 font-bold active:scale-[0.98] transition">枠をリセット</button>
              <button type="button" onClick={cropByGrid} disabled={!sourceImage} className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition">{croppedItems.length > 0 ? "線を反映して再切り出し" : "切り出し"}</button>
            </div>

            {message && <p className="text-sm text-zinc-400 leading-6 mt-3">{message}</p>}
          </div>

          <div ref={candidateAreaRef} className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4 scroll-mt-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="text-sm text-zinc-400">切り出し候補</p>
              <p className="text-xs text-zinc-500">{croppedItems.length}件</p>
            </div>

            {croppedItems.length === 0 ? (
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 text-zinc-500 text-sm leading-6">まだ切り出し結果がありません。<br />画像を選択して、線を調整してから「切り出し」を押してください。</div>
            ) : (
              <div className="grid gap-4">
                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-3 w-max">
                    {croppedItems.map((item, index) => (
                      <button key={item.id} type="button" onClick={() => toggleThumbnailSelected(item.id)} className={`relative w-28 shrink-0 rounded-2xl border p-2 text-left ${activeCropId === item.id ? "border-cyan-500 bg-zinc-950" : "border-zinc-800 bg-zinc-950"}`}>
                        <div className="relative">
                          <img src={item.image} alt={`候補${index + 1}`} className="w-full aspect-[3/4] object-contain bg-zinc-800 rounded-xl" />
                          <div className={`absolute top-2 left-2 w-8 h-8 rounded-full border-[5px] shadow-lg ${item.selected ? "border-cyan-300 bg-cyan-400" : "border-white bg-zinc-900/50"}`}>{item.selected && <span className="block w-full h-full rounded-full bg-cyan-400" />}</div>
                        </div>
                        <p className="text-xs font-bold mt-2">候補{index + 1}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedItems.length === 0 ? (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 text-zinc-500 text-sm leading-6">保存したい候補を上のサムネイルから選択してください。</div>
                ) : (
                  <div className="grid gap-5">
                    {selectedItems.map((item) => {
                      const displayIndex = croppedItems.findIndex((candidate) => candidate.id === item.id) + 1;
                      return (
                        <div key={item.id} className="bg-zinc-950 border border-cyan-500 rounded-3xl p-4">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                              <p className="text-lg font-bold">候補{displayIndex}</p>
                              <p className="text-sm text-zinc-400 mt-1">{item.row}段目 / {item.col}列目</p>
                            </div>
                            <button type="button" onClick={() => removeCroppedItem(item.id)} className="text-sm text-red-400">削除</button>
                          </div>

                          <div className="grid gap-4">
                            {renderAdjustArea(item)}

                            {isCustomCompleteType && item.pose !== "その他" && (
                              <select
                                value={item.poseSetName || ""}
                                onChange={(e) => updateCroppedItem(item.id, "poseSetName", e.target.value)}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm"
                              >
                                <option value="">ポーズ種類名を選択</option>
                                {activePoseSetNames.map((name) => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                              </select>
                            )}

                            <select value={item.pose} onChange={(e) => updateCroppedItem(item.id, "pose", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm">
                              <option value="">ポーズ選択</option>
                              {visiblePoseOptions.map((pose) => <option key={pose} value={pose}>{pose}</option>)}
                            </select>

                            {item.pose === "その他" && <input type="text" value={item.customPose} onChange={(e) => updateCroppedItem(item.id, "customPose", e.target.value)} placeholder="その他のポーズ名" className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm" />}

                            <CountSelector value={item.count} onChange={(value) => updateCroppedItem(item.id, "count", value)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4">
            <p className="text-sm text-zinc-400 mb-4">登録情報</p>

            <div className="grid gap-3">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">メンバー</label>
                <select value={member} onChange={(e) => handleMemberChange(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3">
                  <option value="">選択してください</option>
                  {memberOptions.map((item) => <option key={item.member} value={item.member}>{item.member}</option>)}
                  <option value="__new__">＋ 新しく追加</option>
                </select>

                {member === "__new__" && <input type="text" value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="新しいメンバー名" className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mt-2" />}
                {member === "__new__" && <input type="text" value={newMemberKana} onChange={(e) => setNewMemberKana(e.target.value)} placeholder="ふりがな（例：くぼしおり）" className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mt-2" />}
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">種類</label>
                <select value={typeSelect} onChange={(e) => handleTypeSelectChange(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3">
                  <option value="__new__">＋ 新しく入力</option>
                  {typeOptions.map((item) => <option key={`${item.year}__${item.type}`} value={`${item.year}__${item.type}`}>{item.year ? `${item.year}年　` : ""}{item.type}</option>)}
                </select>

                {typeSelect === "__new__" && <input type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="種類名を入力" className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 mt-2" />}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">年</label>
                  <select value={year} onChange={(e) => setYear(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3">
                    {Array.from({ length: 16 }, (_, i) => 2026 - i).map((yearOption) => <option key={yearOption} value={String(yearOption)}>{yearOption}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">期生</label>
                  <select value={generation} onChange={(e) => setGeneration(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3">
                    {generationOptions.map((generationOption) => <option key={generationOption} value={generationOption}>{generationOption}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">コンプ種別</label>
                <select value={completeType} onChange={(e) => handleCompleteTypeChange(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3">
                  {completeTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              {isCustomCompleteType && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{actualCompleteType}種コンプ</p>
                      <p className="text-xs text-zinc-400 mt-1">ここに入力した名前が、切り出し候補側の選択肢にすぐ反映されます。</p>
                    </div>
                    <button type="button" onClick={addPoseSetName} className="w-11 h-11 rounded-full bg-cyan-500 text-black text-2xl font-bold active:scale-[0.98] transition">＋</button>
                  </div>

                  {poseSetNames.map((name, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => updatePoseSetName(index, e.target.value)}
                        placeholder={`種類名${index + 1}（例：ドレス）`}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removePoseSetName(index)}
                        disabled={poseSetNames.length <= 1}
                        className="bg-zinc-800 disabled:text-zinc-600 text-red-300 border border-zinc-700 rounded-2xl px-3 py-3 text-sm"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {croppedItems.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSave({ continueRegister: false })}
                disabled={isSaving || selectedItems.length === 0}
                className="w-full bg-white disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-3xl py-4 font-bold text-sm md:text-lg active:scale-[0.98] transition"
              >
                {isSaving ? "保存中..." : "保存して戻る"}
              </button>

              <button
                type="button"
                onClick={() => handleSave({ continueRegister: true })}
                disabled={isSaving || selectedItems.length === 0}
                className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-3xl py-4 font-bold text-sm md:text-lg active:scale-[0.98] transition"
              >
                {isSaving ? "保存中..." : "連続して登録"}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}