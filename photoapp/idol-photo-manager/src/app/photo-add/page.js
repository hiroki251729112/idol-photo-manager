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

const createPoseSet = (name = "") => ({
  id: String(Date.now() + Math.random()),
  name,
  otherPoses: [{ name: "", count: "", image: "" }],
});

export default function PhotoAddPage() {
  const router = useRouter();
  const cropAreaRef = useRef(null);

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
  const [poseSets, setPoseSets] = useState([createPoseSet()]);
  const [memberOptions, setMemberOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);
  const [memberGenerationMap, setMemberGenerationMap] = useState({});
  const [memberKanaMap, setMemberKanaMap] = useState({});
  const [poseCounts, setPoseCounts] = useState({});
  const [poseImages, setPoseImages] = useState({});
  const [otherPoses, setOtherPoses] = useState([{ name: "", count: "", image: "" }]);
  const [cropTarget, setCropTarget] = useState(null);
  const [cropImageSize, setCropImageSize] = useState({ width: 0, height: 0 });
  const [cropBox, setCropBox] = useState({ left: 5, top: 5, right: 95, bottom: 95 });
  const [dragTarget, setDragTarget] = useState(null);

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

  const basePoseList = ["ヨリ", "チュウ", "ヒキ", "座り"];
  const isCustomCompleteType = completeType === "custom";
  const activePoseSetNames = useMemo(
    () => poseSets.map((set) => set.name.trim()).filter(Boolean),
    [poseSets]
  );
  const actualCompleteType = isCustomCompleteType
    ? String(activePoseSetNames.length * 4 || poseSets.length * 4)
    : completeType;

  const normalizeText = (value) => String(value || "").trim();
  const normalizeYear = (value) => String(value || "").trim();

  const getDefaultCompleteType = (targetGroup) => {
    return targetGroup === "乃木坂46" ? "3" : "4";
  };

  const getPoseSetName = (pose) => {
    const match = String(pose || "").match(/^.+?（(.+)）$/);
    return match ? match[1] : "";
  };

  const getSafePoseSetNames = () => {
    if (!isCustomCompleteType) return [];
    return poseSets.map((set) => set.name.trim()).filter(Boolean);
  };

  const completeTypeOptions = useMemo(() => {
    const common = [
      { value: "custom", label: "〇種類コンプ" },
      { value: "other", label: "その他" },
    ];

    if (group === "乃木坂46") {
      return [
        { value: "3", label: "3種コンプ" },
        { value: "5", label: "5種コンプ" },
        ...common,
      ];
    }

    return [{ value: "4", label: "4種コンプ" }, ...common];
  }, [group]);

  const buildCustomPoseName = (basePose, setName) => {
    const trimmedName = String(setName || "").trim();
    if (!trimmedName) return basePose;
    return `${basePose}（${trimmedName}）`;
  };

  const normalPoseList = useMemo(() => {
    if (isCustomCompleteType) {
      return poseSets.flatMap((set) =>
        basePoseList.map((pose) => buildCustomPoseName(pose, set.name))
      );
    }

    if (completeType === "3") return ["ヨリ", "チュウ", "ヒキ"];
    if (completeType === "4") return ["ヨリ", "チュウ", "ヒキ", "座り"];
    if (completeType === "5") return ["ヨリ", "チュウ", "ヒキ", "座り", "座りヨリ"];
    return [];
  }, [completeType, isCustomCompleteType, poseSets]);

  useEffect(() => {
    if (!dragTarget) return;

    const handlePointerMove = (event) => {
      const rect = cropAreaRef.current?.getBoundingClientRect();
      if (!rect) return;

      const xPercent = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      const yPercent = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));

      if (dragTarget === "left") setCropBox((prev) => ({ ...prev, left: Math.min(xPercent, prev.right - 2) }));
      if (dragTarget === "right") setCropBox((prev) => ({ ...prev, right: Math.max(xPercent, prev.left + 2) }));
      if (dragTarget === "top") setCropBox((prev) => ({ ...prev, top: Math.min(yPercent, prev.bottom - 2) }));
      if (dragTarget === "bottom") setCropBox((prev) => ({ ...prev, bottom: Math.max(yPercent, prev.top + 2) }));
    };

    const handlePointerUp = () => setDragTarget(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragTarget]);

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

    return [...missingItems, ...orderedItems];
  };

  const normalizePhotos = (photos) => {
    const normalizedPhotos = [];

    photos.forEach((photo) => {
      const existingIndex = normalizedPhotos.findIndex(
        (p) =>
          normalizeText(p.group) === normalizeText(photo.group) &&
          normalizeYear(p.year) === normalizeYear(photo.year) &&
          normalizeText(p.member) === normalizeText(photo.member) &&
          normalizeText(p.type) === normalizeText(photo.type) &&
          normalizeText(p.pose) === normalizeText(photo.pose)
      );

      if (existingIndex !== -1) {
        normalizedPhotos[existingIndex].count =
          Number(normalizedPhotos[existingIndex].count || 0) +
          Number(photo.count || 0);
        normalizedPhotos[existingIndex].status = photo.status || "所持";
        if (photo.imageUrl) normalizedPhotos[existingIndex].imageUrl = photo.imageUrl;
        if (photo.memberKana) normalizedPhotos[existingIndex].memberKana = normalizeText(photo.memberKana);
        if (photo.completeType) normalizedPhotos[existingIndex].completeType = normalizeText(photo.completeType);
        if (photo.hasIndexedDbImage) normalizedPhotos[existingIndex].hasIndexedDbImage = true;

        const mergedPoseSetNames = [
          ...(normalizedPhotos[existingIndex].poseSetNames || []),
          ...(Array.isArray(photo.poseSetNames) ? photo.poseSetNames : []),
        ].filter((name, index, array) => name && array.indexOf(name) === index);

        if (mergedPoseSetNames.length > 0) {
          normalizedPhotos[existingIndex].poseSetNames = mergedPoseSetNames;
        }
      } else {
        const { image, ...photoWithoutImage } = photo;
        normalizedPhotos.push({
          ...photoWithoutImage,
          id: String(photo.id || Date.now() + Math.random()),
          group: normalizeText(photo.group),
          year: normalizeYear(photo.year),
          generation: normalizeText(photo.generation),
          member: normalizeText(photo.member),
          memberKana: normalizeText(photo.memberKana),
          type: normalizeText(photo.type),
          completeType: normalizeText(photo.completeType),
          pose: normalizeText(photo.pose),
          poseSetNames: Array.isArray(photo.poseSetNames) ? photo.poseSetNames : [],
          count: Number(photo.count || 0),
          status: photo.status || "所持",
        });
      }
    });

    return normalizedPhotos;
  };

  const removeImageForFirestore = (photo) => ({
    id: String(photo.id || Date.now() + Math.random()),
    group: normalizeText(photo.group),
    year: normalizeYear(photo.year),
    generation: normalizeText(photo.generation),
    member: normalizeText(photo.member),
    memberKana: normalizeText(photo.memberKana),
    type: normalizeText(photo.type),
    completeType: normalizeText(photo.completeType),
    pose: normalizeText(photo.pose),
    poseSetNames: Array.isArray(photo.poseSetNames) ? photo.poseSetNames : [],
    status: photo.status || "所持",
    count: Number(photo.count || 0),
    imageUrl: photo.imageUrl || "",
    hasIndexedDbImage: Boolean(photo.hasIndexedDbImage),
  });

  const applyCompleteTypeFromSelectedType = (selectedType, defaultCompleteType) => {
    if (!selectedType) {
      setCompleteType(defaultCompleteType);
      setPoseSets([createPoseSet()]);
      return;
    }

    if (Number(selectedType.completeType || 0) > 5) {
      const names =
        selectedType.poseSetNames?.length > 0
          ? selectedType.poseSetNames
          : [""];

      setCompleteType("custom");
      setPoseSets(names.map((name) => createPoseSet(name)));
      return;
    }

    setCompleteType(selectedType.completeType || defaultCompleteType);
    setPoseSets([createPoseSet()]);
  };

  const setupOptionsFromPhotos = async (photos, selectedGroup, defaultCompleteType, currentUser) => {
    const savedTypeOrder = await loadTypeOrder(currentUser, selectedGroup);

    const groupPhotos = photos.filter((photo) => normalizeText(photo.group) === selectedGroup && Number(photo.count || 0) > 0);
    const memberMap = new Map();
    const typeMap = new Map();
    const generationMap = {};
    const kanaMap = {};

    groupPhotos.forEach((photo) => {
      const normalizedMember = normalizeText(photo.member);
      const normalizedMemberKana = normalizeText(photo.memberKana);
      const normalizedGeneration = normalizeText(photo.generation);
      const normalizedType = normalizeText(photo.type);
      const normalizedYear = normalizeYear(photo.year);

      if (normalizedMember) {
        if (!memberMap.has(normalizedMember)) {
          memberMap.set(normalizedMember, {
            member: normalizedMember,
            memberKana: normalizedMemberKana,
            generation: normalizedGeneration,
          });
        } else {
          const item = memberMap.get(normalizedMember);
          if (!item.memberKana && normalizedMemberKana) item.memberKana = normalizedMemberKana;
          if (!item.generation && normalizedGeneration) item.generation = normalizedGeneration;
        }
      }

      if (normalizedMember && normalizedGeneration) generationMap[normalizedMember] = normalizedGeneration;
      if (normalizedMember && normalizedMemberKana) kanaMap[normalizedMember] = normalizedMemberKana;

      if (normalizedType) {
        const key = `${normalizedYear}__${normalizedType}`;

        if (!typeMap.has(key)) {
          typeMap.set(key, {
            type: normalizedType,
            year: normalizedYear,
            latestId: Number(photo.id || 0),
            completeType: normalizeText(photo.completeType),
            poseSetNames: [],
          });
        } else {
          const item = typeMap.get(key);
          item.latestId = Math.max(item.latestId, Number(photo.id || 0));
          if (Number(photo.completeType || 0) > Number(item.completeType || 0)) {
            item.completeType = normalizeText(photo.completeType);
          }
        }

        const typeItem = typeMap.get(key);

        if (Array.isArray(photo.poseSetNames)) {
          photo.poseSetNames.forEach((name) => {
            const safeName = normalizeText(name);
            if (safeName && !typeItem.poseSetNames.includes(safeName)) {
              typeItem.poseSetNames.push(safeName);
            }
          });
        }

        const setName = getPoseSetName(photo.pose);
        if (setName && !typeItem.poseSetNames.includes(setName)) {
          typeItem.poseSetNames.push(setName);
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
      const lastYear = normalizeYear(lastInput.year || "2026");
      const lastType = normalizeText(lastInput.type || "");

      setYear(lastYear || "2026");
      setGeneration(lastInput.generation || "1期生");
      setMember(lastInput.member || "");
      setType(lastType);

      const selectedType = sortedTypeOptions.find((item) => item.type === lastType && item.year === lastYear);

      if (selectedType) {
        setTypeSelect(`${lastYear}__${lastType}`);
        applyCompleteTypeFromSelectedType(selectedType, defaultCompleteType);
      } else {
        setTypeSelect("__new__");
        setCompleteType(defaultCompleteType);
        setPoseSets([createPoseSet()]);
      }
    } else {
      setTypeSelect("__new__");
      setCompleteType(defaultCompleteType);
      setPoseSets([createPoseSet()]);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedGroup = params.get("group") || "櫻坂46";
    const defaultCompleteType = getDefaultCompleteType(selectedGroup);

    setGroup(selectedGroup);
    setCompleteType(defaultCompleteType);
    setPoseSets([createPoseSet()]);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      let photosForOptions = [];

      try {
        if (currentUser) photosForOptions = await getUserPhotos(currentUser.uid);
      } catch (error) {
        console.error(error);
      }

      if (!photosForOptions.length) photosForOptions = JSON.parse(localStorage.getItem("photos")) || [];
      await setupOptionsFromPhotos(photosForOptions, selectedGroup, defaultCompleteType, currentUser);
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

  const handleMemberChange = (value) => {
    setMember(value);
    if (value !== "__new__" && memberGenerationMap[value]) setGeneration(memberGenerationMap[value]);
  };

  const handleTypeSelectChange = (value) => {
    const defaultCompleteType = getDefaultCompleteType(group);

    setTypeSelect(value);

    if (value === "__new__") {
      setType("");
      setCompleteType(defaultCompleteType);
      setPoseSets([createPoseSet()]);
      return;
    }

    const selectedType = typeOptions.find((item) => `${item.year}__${item.type}` === value);

    if (selectedType) {
      setType(selectedType.type);
      if (selectedType.year) setYear(selectedType.year);
      applyCompleteTypeFromSelectedType(selectedType, defaultCompleteType);
    }
  };

  const handleCompleteTypeChange = (value) => {
    setCompleteType(value);
    if (value === "custom" && poseSets.length === 0) setPoseSets([createPoseSet()]);
  };

  const addPoseSet = () => setPoseSets((prev) => [...prev, createPoseSet()]);

  const updatePoseSetName = (setId, value) => {
    setPoseSets((prev) => prev.map((set) => (set.id === setId ? { ...set, name: value } : set)));
  };

  const removePoseSet = (setId) => {
    setPoseSets((prev) => (prev.length <= 1 ? prev : prev.filter((set) => set.id !== setId)));
  };

  const handlePoseCountChange = (pose, value) => {
    setPoseCounts((prev) => ({ ...prev, [pose]: value }));
  };

  const openCropEditor = ({ kind, pose, index, setId, sourceImage }) => {
    setCropTarget({ kind, pose, index, setId, sourceImage });
    setCropImageSize({ width: 0, height: 0 });
    setCropBox({ left: 5, top: 5, right: 95, bottom: 95 });

    const editorId = kind === "normal" ? `photo-add-crop-editor-normal-${pose}` : `photo-add-crop-editor-other-${setId || "base"}-${index}`;
    setTimeout(() => document.getElementById(editorId)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  };

  const handlePoseImageChange = (pose, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => openCropEditor({ kind: "normal", pose, index: null, setId: null, sourceImage: reader.result });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleOtherPoseChange = (index, field, value, setId = null) => {
    if (setId) {
      setPoseSets((prev) =>
        prev.map((set) => {
          if (set.id !== setId) return set;
          const updated = set.otherPoses.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item));
          const lastItem = updated[updated.length - 1];
          const nextOtherPoses = lastItem && (lastItem.name.trim() || lastItem.count || lastItem.image) && updated.length < 20 ? [...updated, { name: "", count: "", image: "" }] : updated;
          return { ...set, otherPoses: nextOtherPoses };
        })
      );
      return;
    }

    setOtherPoses((prev) => {
      const updated = prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item));
      const lastItem = updated[updated.length - 1];
      if (lastItem && (lastItem.name.trim() || lastItem.count || lastItem.image) && updated.length < 20) {
        return [...updated, { name: "", count: "", image: "" }];
      }
      return updated;
    });
  };

  const handleOtherPoseImageChange = (index, e, setId = null) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => openCropEditor({ kind: "other", pose: "その他", index, setId, sourceImage: reader.result });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const createCroppedImage = () => {
    return new Promise((resolve, reject) => {
      if (!cropTarget?.sourceImage) {
        reject(new Error("切り出し対象の画像がありません"));
        return;
      }
      const img = new Image();
      img.src = cropTarget.sourceImage;
      img.onload = () => {
        const sx = Math.round((cropBox.left / 100) * img.naturalWidth);
        const sy = Math.round((cropBox.top / 100) * img.naturalHeight);
        const sw = Math.round(((cropBox.right - cropBox.left) / 100) * img.naturalWidth);
        const sh = Math.round(((cropBox.bottom - cropBox.top) / 100) * img.naturalHeight);
        const safeWidth = Math.max(1, Math.min(sw, img.naturalWidth - sx));
        const safeHeight = Math.max(1, Math.min(sh, img.naturalHeight - sy));
        const canvas = document.createElement("canvas");
        canvas.width = safeWidth;
        canvas.height = safeHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, safeWidth, safeHeight, 0, 0, safeWidth, safeHeight);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      };
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    });
  };

  const handleApplyCrop = async () => {
    try {
      const croppedImage = await createCroppedImage();
      if (cropTarget.kind === "normal") setPoseImages((prev) => ({ ...prev, [cropTarget.pose]: croppedImage }));
      if (cropTarget.kind === "other") handleOtherPoseChange(cropTarget.index, "image", croppedImage, cropTarget.setId);
      setCropTarget(null);
    } catch (error) {
      console.error(error);
      alert("画像の切り出しに失敗しました");
    }
  };

  const handleUseOriginalImage = () => {
    if (!cropTarget?.sourceImage) return;
    if (cropTarget.kind === "normal") setPoseImages((prev) => ({ ...prev, [cropTarget.pose]: cropTarget.sourceImage }));
    if (cropTarget.kind === "other") handleOtherPoseChange(cropTarget.index, "image", cropTarget.sourceImage, cropTarget.setId);
    setCropTarget(null);
  };

  const handleCancelCrop = () => {
    setCropTarget(null);
    setCropImageSize({ width: 0, height: 0 });
    setCropBox({ left: 5, top: 5, right: 95, bottom: 95 });
  };

  const isCropEditorForNormalPose = (pose) => cropTarget?.kind === "normal" && cropTarget?.pose === pose;
  const isCropEditorForOtherPose = (index, setId = null) => cropTarget?.kind === "other" && cropTarget?.index === index && cropTarget?.setId === setId;

  const renderCropEditor = (editorId) => {
    if (!cropTarget) return null;

    return (
      <div id={editorId} className="bg-zinc-950 border border-cyan-500 rounded-3xl p-4 mt-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold">画像調整</h2>
            <p className="text-sm text-zinc-400 mt-1 leading-6">水色の枠線をドラッグして、保存したい範囲を調整してください。</p>
          </div>
          <button type="button" onClick={handleCancelCrop} className="text-zinc-400 text-sm shrink-0">閉じる</button>
        </div>

        <div ref={cropAreaRef} className="relative w-full select-none touch-none rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-800">
          <img
            src={cropTarget.sourceImage}
            alt="調整中の画像"
            onLoad={(e) => setCropImageSize({ width: e.target.naturalWidth, height: e.target.naturalHeight })}
            className="w-full block"
            draggable={false}
          />
          <div className="absolute border-[4px] border-cyan-400 pointer-events-none" style={{ left: `${cropBox.left}%`, top: `${cropBox.top}%`, width: `${cropBox.right - cropBox.left}%`, height: `${cropBox.bottom - cropBox.top}%` }} />
          <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget("left"); }} className="absolute top-0 bottom-0 w-8 -translate-x-1/2 cursor-ew-resize bg-transparent" style={{ left: `${cropBox.left}%` }} />
          <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget("right"); }} className="absolute top-0 bottom-0 w-8 -translate-x-1/2 cursor-ew-resize bg-transparent" style={{ left: `${cropBox.right}%` }} />
          <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget("top"); }} className="absolute left-0 right-0 h-8 -translate-y-1/2 cursor-ns-resize bg-transparent" style={{ top: `${cropBox.top}%` }} />
          <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget("bottom"); }} className="absolute left-0 right-0 h-8 -translate-y-1/2 cursor-ns-resize bg-transparent" style={{ top: `${cropBox.bottom}%` }} />
        </div>

        {cropImageSize.width > 0 && cropImageSize.height > 0 && (
          <p className="text-xs text-zinc-500 mt-2">元画像サイズ：{cropImageSize.width} × {cropImageSize.height}</p>
        )}

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button type="button" onClick={() => setCropBox({ left: 5, top: 5, right: 95, bottom: 95 })} className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-2xl py-3 font-bold active:scale-[0.98] transition">枠をリセット</button>
          <button type="button" onClick={handleApplyCrop} className="bg-cyan-500 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition">この範囲で切り出す</button>
        </div>

        <button type="button" onClick={handleUseOriginalImage} className="w-full bg-white text-black border border-white rounded-2xl py-3 font-bold mt-3 active:scale-[0.98] transition">調整せず元画像を使う</button>
      </div>
    );
  };

  const validateCustomPoseSets = () => {
    if (!isCustomCompleteType) return true;

    const names = poseSets.map((set) => set.name.trim());
    const hasEmpty = names.some((name) => !name);
    if (hasEmpty) {
      alert("〇種類コンプでは、すべてのポーズ種類名を入力してください。例：白、赤");
      return false;
    }

    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      alert("ポーズ種類名が重複しています。別の名前を入力してください。");
      return false;
    }

    return true;
  };

  const collectOtherPoses = () => {
    if (isCustomCompleteType) {
      return poseSets.flatMap((set) =>
        set.otherPoses
          .filter((item) => item.name.trim() || item.count || item.image)
          .map((item) => ({ ...item, setName: set.name.trim() }))
      );
    }

    return otherPoses.filter((item) => item.name.trim() || item.count || item.image);
  };

  const handleSave = async () => {
    const finalMember = member === "__new__" ? newMember.trim() : member.trim();
    const finalType = type.trim();
    const finalMemberKana = member === "__new__" ? newMemberKana.trim() : memberKanaMap[member] || "";
    const safePoseSetNames = getSafePoseSetNames();

    if (!user) return alert("ログイン情報を確認できません。再ログインしてください。");
    if (!finalMember) return alert("メンバーを選択してください");
    if (member === "__new__" && !finalMemberKana) return alert("メンバーのふりがなを入力してください");
    if (!finalType) return alert("種類を入力してください");
    if (!validateCustomPoseSets()) return;

    const normalSelectedPoses = Object.entries(poseCounts)
      .filter(([poseName, value]) => normalPoseList.includes(poseName) && value && Number(value) > 0)
      .map(([poseName, count]) => ({ pose: poseName, count: Number(count), image: poseImages[poseName] || "" }));

    const filledOtherPoses = collectOtherPoses();
    const invalidOtherPose = filledOtherPoses.find((item) => !item.name.trim() || !item.count || Number(item.count) <= 0);

    if (invalidOtherPose) return alert("その他はポーズ名と枚数を両方入力してください");

    const otherSelectedPoses = filledOtherPoses.map((item) => ({
      pose: item.setName ? `${item.name.trim()}（${item.setName}）` : item.name.trim(),
      count: Number(item.count),
      image: item.image || "",
    }));

    const selectedPoses = [...normalSelectedPoses, ...otherSelectedPoses];

    if (selectedPoses.length === 0) return alert("ポーズを1つ以上選択してください");

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

      selectedPoses.forEach((poseItem) => {
        const basePhoto = {
          id: String(Date.now() + Math.random()),
          group,
          year,
          generation,
          member: finalMember,
          memberKana: finalMemberKana,
          type: finalType,
          completeType: actualCompleteType,
          pose: poseItem.pose,
          poseSetNames: isCustomCompleteType ? safePoseSetNames : [],
          status: "所持",
          count: Number(poseItem.count),
          hasIndexedDbImage: Boolean(poseItem.image),
        };

        if (poseItem.image) imageSaveTasks.push(savePhotoImage(basePhoto, poseItem.image));

        const updatePhotos = (photos) => {
          const existingPhotoIndex = photos.findIndex(
            (photo) =>
              normalizeText(photo.group) === normalizeText(group) &&
              normalizeYear(photo.year) === normalizeYear(year) &&
              normalizeText(photo.member) === normalizeText(finalMember) &&
              normalizeText(photo.type) === normalizeText(finalType) &&
              normalizeText(photo.pose) === normalizeText(poseItem.pose)
          );

          if (existingPhotoIndex !== -1) {
            photos[existingPhotoIndex].count = Number(photos[existingPhotoIndex].count || 0) + Number(poseItem.count);
            photos[existingPhotoIndex].status = "所持";
            photos[existingPhotoIndex].generation = generation;
            photos[existingPhotoIndex].completeType = actualCompleteType;
            photos[existingPhotoIndex].poseSetNames = isCustomCompleteType ? safePoseSetNames : [];
            if (finalMemberKana) photos[existingPhotoIndex].memberKana = finalMemberKana;
            if (poseItem.image) photos[existingPhotoIndex].hasIndexedDbImage = true;
          } else {
            photos.push(basePhoto);
          }
        };

        updatePhotos(localPhotos);
        updatePhotos(firestorePhotos);
      });

      await Promise.all(imageSaveTasks);
      localPhotos = normalizePhotos(localPhotos);
      firestorePhotos = normalizePhotos(firestorePhotos).map(removeImageForFirestore);
      localStorage.setItem("photos", JSON.stringify(localPhotos));
      localStorage.setItem(`lastPhotoInput_${group}`, JSON.stringify({ year, generation, member: finalMember, type: finalType }));
      await saveUserPhotos(user.uid, firestorePhotos);
      alert("保存しました");
      router.push(`/select?group=${encodeURIComponent(group)}&mode=member`);
    } catch (error) {
      console.error(error);
      alert("保存に失敗しました。コンソールを確認してください。");
    } finally {
      setIsSaving(false);
    }
  };

  const renderOtherPoseInputs = (items, setId = null) => {
    return (
      <div className="border-t border-zinc-700 mt-5 pt-4 grid gap-3">
        <p className="text-sm text-zinc-400">その他</p>
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((otherPose, index) => (
            <div key={index} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,104px)] gap-3 items-start">
                <input type="text" value={otherPose.name} onChange={(e) => handleOtherPoseChange(index, "name", e.target.value, setId)} placeholder="ポーズ名" className="w-full min-w-0 bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm" />
                <CountSelector value={otherPose.count} onChange={(value) => handleOtherPoseChange(index, "count", value, setId)} />
              </div>
              <input type="file" accept="image/*" onChange={(e) => handleOtherPoseImageChange(index, e, setId)} className="mt-3 w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm" />
              {isCropEditorForOtherPose(index, setId) && renderCropEditor(`photo-add-crop-editor-other-${setId || "base"}-${index}`)}
              {otherPose.image && <img src={otherPose.image} alt={otherPose.name || "その他"} className="mt-3 w-full max-w-[140px] rounded-2xl border border-zinc-700 bg-zinc-800 p-2" />}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderNormalPoseInput = (pose) => {
    return (
      <div key={pose} className="border-b md:border border-zinc-800 md:rounded-2xl md:p-3 pb-4 last:border-b-0 md:last:border-b">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,104px)] gap-3 items-start">
          <p className="font-bold pt-3 min-w-0 break-words">{pose}</p>
          <CountSelector value={poseCounts[pose] || ""} onChange={(value) => handlePoseCountChange(pose, value)} />
        </div>
        <input type="file" accept="image/*" onChange={(e) => handlePoseImageChange(pose, e)} className="mt-3 w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm" />
        {isCropEditorForNormalPose(pose) && renderCropEditor(`photo-add-crop-editor-normal-${pose}`)}
        {poseImages[pose] && <img src={poseImages[pose]} alt={pose} className="mt-3 w-full max-w-[140px] rounded-2xl border border-zinc-700 bg-zinc-800 p-2" />}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md md:max-w-3xl lg:max-w-4xl mx-auto">
        <Link href={`/select?group=${encodeURIComponent(group)}&mode=member`} className="text-cyan-400 text-sm">← 戻る</Link>

        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-2">生写真を追加</h1>
        <p className="text-zinc-400 mb-4">{group}</p>

        <Link href={`/photo-bulk-crop?group=${encodeURIComponent(group)}`} className="block bg-zinc-900 border border-cyan-500 text-cyan-300 rounded-2xl py-3 px-4 font-bold text-center mb-6 active:scale-[0.98] transition">まとめて画像追加</Link>

        <form className="grid gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">メンバー</label>
              <select value={member} onChange={(e) => handleMemberChange(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3">
                <option value="">選択してください</option>
                {memberOptions.map((item) => <option key={item.member} value={item.member}>{item.member}</option>)}
                <option value="__new__">＋ 新しく追加</option>
              </select>

              {member === "__new__" && <input type="text" value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="新しいメンバー名" className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3 mt-2" />}
              {member === "__new__" && <input type="text" value={newMemberKana} onChange={(e) => setNewMemberKana(e.target.value)} placeholder="ふりがな（例：くぼしおり）" className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3 mt-2" />}
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">種類</label>
              <select value={typeSelect} onChange={(e) => handleTypeSelectChange(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3">
                <option value="__new__">＋ 新しく入力</option>
                {typeOptions.map((item) => (
                  <option key={`${item.year}__${item.type}`} value={`${item.year}__${item.type}`}>
                    {item.type}
                  </option>
                ))}
              </select>
              {typeSelect === "__new__" && <input type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="種類名を入力" className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3 mt-2" />}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">年</label>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3">
                {Array.from({ length: 16 }, (_, i) => 2026 - i).map((yearOption) => <option key={yearOption} value={String(yearOption)}>{yearOption}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-2">期生</label>
              <select value={generation} onChange={(e) => setGeneration(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3">
                {generationOptions.map((generationOption) => <option key={generationOption} value={generationOption}>{generationOption}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-sm text-zinc-400">ポーズ・枚数・画像</p>
                {isCustomCompleteType && <p className="text-xs text-zinc-500 mt-1">現在：{actualCompleteType}種コンプ</p>}
              </div>
              <select value={completeType} onChange={(e) => handleCompleteTypeChange(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-2 text-xs">
                {completeTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            {isCustomCompleteType ? (
              <div className="grid gap-5">
                {poseSets.map((set, setIndex) => {
                  const setPoseNames = basePoseList.map((pose) => buildCustomPoseName(pose, set.name));

                  return (
                    <div key={set.id} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-3">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-bold">セット{setIndex + 1}</p>
                          <p className="text-xs text-zinc-500 mt-1">ポーズ種類名〜その他までが1セットです。</p>
                        </div>
                        <button type="button" onClick={() => removePoseSet(set.id)} disabled={poseSets.length <= 1} className="bg-zinc-800 disabled:text-zinc-600 text-red-300 border border-zinc-700 rounded-2xl px-3 py-2 text-sm">削除</button>
                      </div>

                      <input type="text" value={set.name} onChange={(e) => updatePoseSetName(set.id, e.target.value)} placeholder="ポーズ種類名（例：白）" className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm mb-4" />

                      <div className="grid gap-5 md:grid-cols-2">
                        {setPoseNames.map((pose) => renderNormalPoseInput(pose))}
                      </div>

                      {renderOtherPoseInputs(set.otherPoses, set.id)}
                    </div>
                  );
                })}

                <button type="button" onClick={addPoseSet} className="w-full bg-zinc-950 border border-cyan-500 text-cyan-300 rounded-3xl py-4 font-bold active:scale-[0.98] transition">
                  ＋ ポーズ種類を追加する
                </button>
              </div>
            ) : (
              <>
                {completeType !== "other" && (
                  <div className="grid gap-5 md:grid-cols-2">
                    {normalPoseList.map((pose) => renderNormalPoseInput(pose))}
                  </div>
                )}

                {renderOtherPoseInputs(otherPoses)}
              </>
            )}
          </div>

          <button type="button" onClick={handleSave} disabled={isSaving} className="w-full bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-3xl py-4 font-bold text-lg active:scale-[0.98] transition">
            {isSaving ? "保存中..." : "保存する"}
          </button>
        </form>
      </div>
    </main>
  );
}