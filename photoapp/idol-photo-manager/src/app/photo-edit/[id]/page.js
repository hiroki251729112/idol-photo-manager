"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserPhotos, saveUserPhotos } from "@/lib/photoService";
import { deletePhotoImage, getPhotoImage, savePhotoImage } from "@/lib/imageDb";

function CountSelector({ value, onChange, allowZero = false }) {
  const numericValue = Number(value || 0);
  const isCustom = value !== "" && numericValue > 10;

  return (
    <div className="w-full min-w-0 grid gap-2">
      <select
        value={isCustom ? "__custom__" : value || ""}
        onChange={(e) => {
          if (e.target.value === "__custom__") {
            onChange("11");
          } else {
            onChange(e.target.value);
          }
        }}
        className="w-full min-w-0 max-w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm"
      >
        <option value="">枚数選択</option>

        {allowZero && <option value="0">0枚</option>}

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

export default function PhotoEditPage() {
  const params = useParams();
  const router = useRouter();
  const cropAreaRef = useRef(null);

  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [returnGroup, setReturnGroup] = useState("");
  const [returnMember, setReturnMember] = useState("");
  const [returnType, setReturnType] = useState("");
  const [returnYear, setReturnYear] = useState("");

  const [originalGroup, setOriginalGroup] = useState("");
  const [originalMember, setOriginalMember] = useState("");
  const [originalType, setOriginalType] = useState("");
  const [originalYear, setOriginalYear] = useState("");

  const [group, setGroup] = useState("櫻坂46");
  const [year, setYear] = useState("2026");
  const [generation, setGeneration] = useState("1期生");
  const [member, setMember] = useState("");
  const [memberKana, setMemberKana] = useState("");
  const [type, setType] = useState("");
  const [completeType, setCompleteType] = useState("4");

  const [normalPoseCounts, setNormalPoseCounts] = useState({});
  const [normalPoseImages, setNormalPoseImages] = useState({});
  const [normalPoseExistingIds, setNormalPoseExistingIds] = useState({});

  const [otherPoses, setOtherPoses] = useState([
    { id: null, name: "", count: "", image: "" },
  ]);

  const [cropTarget, setCropTarget] = useState(null);
  const [cropImageSize, setCropImageSize] = useState({ width: 0, height: 0 });
  const [cropBox, setCropBox] = useState({ left: 5, top: 5, right: 95, bottom: 95 });
  const [dragTarget, setDragTarget] = useState(null);

  const completeTypeOptions = useMemo(() => {
    if (group === "乃木坂46") {
      return [
        { value: "3", label: "3種コンプ" },
        { value: "5", label: "5種コンプ" },
        { value: "other", label: "その他" },
      ];
    }

    return [
      { value: "4", label: "4種コンプ" },
      { value: "other", label: "その他" },
    ];
  }, [group]);

  const getDefaultCompleteType = (targetGroup) => {
    return targetGroup === "乃木坂46" ? "3" : "4";
  };

  const getNormalPoseList = (targetCompleteType) => {
    if (targetCompleteType === "3") return ["ヨリ", "チュウ", "ヒキ"];
    if (targetCompleteType === "4") return ["ヨリ", "チュウ", "ヒキ", "座り"];
    if (targetCompleteType === "5") return ["ヨリ", "チュウ", "ヒキ", "座り", "座りヨリ"];
    return ["ヨリ", "チュウ", "ヒキ", "座り", "座りヨリ"];
  };

  const normalPoseList = useMemo(() => {
    return getNormalPoseList(completeType);
  }, [completeType]);

  const allStandardPoseList = ["ヨリ", "チュウ", "ヒキ", "座り", "座りヨリ"];

  useEffect(() => {
    if (!dragTarget) return;

    const handlePointerMove = (event) => {
      const rect = cropAreaRef.current?.getBoundingClientRect();
      if (!rect) return;

      const xPercent = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      const yPercent = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));

      if (dragTarget === "left") {
        setCropBox((prev) => ({ ...prev, left: Math.min(xPercent, prev.right - 2) }));
      }
      if (dragTarget === "right") {
        setCropBox((prev) => ({ ...prev, right: Math.max(xPercent, prev.left + 2) }));
      }
      if (dragTarget === "top") {
        setCropBox((prev) => ({ ...prev, top: Math.min(yPercent, prev.bottom - 2) }));
      }
      if (dragTarget === "bottom") {
        setCropBox((prev) => ({ ...prev, bottom: Math.max(yPercent, prev.top + 2) }));
      }
    };

    const handlePointerUp = () => setDragTarget(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragTarget]);

  const getPhotoKey = (photo) => {
    return [photo.group || "", photo.year || "", photo.member || "", photo.type || "", photo.pose || ""].join("__");
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

  const attachIndexedDbImages = async (targetPhotos) => {
    const photosWithImages = await Promise.all(
      targetPhotos.map(async (photo) => {
        if (photo.image) return photo;

        try {
          const image = await getPhotoImage(photo);
          return { ...photo, image: image || "" };
        } catch (error) {
          console.error(error);
          return photo;
        }
      })
    );

    return photosWithImages;
  };

  const removeImageForFirestore = (photo) => {
    return {
      id: String(photo.id || photo.firestoreId || Date.now() + Math.random()),
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

  const normalizePhotos = (photos) => {
    const normalizedPhotos = [];

    photos.forEach((photo) => {
      const existingIndex = normalizedPhotos.findIndex(
        (item) =>
          item.group === photo.group &&
          item.year === photo.year &&
          item.member === photo.member &&
          item.type === photo.type &&
          item.pose === photo.pose
      );

      if (existingIndex !== -1) {
        normalizedPhotos[existingIndex].count = Number(photo.count || 0);
        normalizedPhotos[existingIndex].status = photo.status || "所持";
        normalizedPhotos[existingIndex].generation = photo.generation || normalizedPhotos[existingIndex].generation;
        normalizedPhotos[existingIndex].completeType = photo.completeType || normalizedPhotos[existingIndex].completeType;
        if (photo.imageUrl) normalizedPhotos[existingIndex].imageUrl = photo.imageUrl;
        if (photo.memberKana) normalizedPhotos[existingIndex].memberKana = photo.memberKana;
        if (photo.hasIndexedDbImage) normalizedPhotos[existingIndex].hasIndexedDbImage = true;
      } else {
        const { image, ...photoWithoutImage } = photo;

        normalizedPhotos.push({
          ...photoWithoutImage,
          id: String(photo.id || photo.firestoreId || Date.now() + Math.random()),
          count: Number(photo.count || 0),
          status: photo.status || "所持",
        });
      }
    });

    return normalizedPhotos;
  };

  const makeDetailUrl = () => {
    const urlParams = new URLSearchParams();
    if (returnGroup || group) urlParams.set("group", returnGroup || group);
    if (returnMember || member) urlParams.set("member", returnMember || member);
    if (returnType || type) urlParams.set("type", returnType || type);
    if (returnYear || year) urlParams.set("year", returnYear || year);
    const query = urlParams.toString();
    return query ? `/photo-detail/${params.id}?${query}` : `/photo-detail/${params.id}`;
  };

  const makeUpdatedDetailUrl = (targetId) => {
    const urlParams = new URLSearchParams();
    if (group) urlParams.set("group", group);
    if (member) urlParams.set("member", member);
    if (type) urlParams.set("type", type);
    if (year) urlParams.set("year", year);
    const query = urlParams.toString();
    return query ? `/photo-detail/${targetId}?${query}` : `/photo-detail/${targetId}`;
  };

  const setupEditForm = (loadedPhotos, urlGroup, urlMember, urlType, urlYear) => {
    const targetPhoto = loadedPhotos.find(
      (item) => String(item.id) === String(params.id) || String(item.firestoreId) === String(params.id)
    );

    const fixedGroup = urlGroup || targetPhoto?.group || "櫻坂46";
    const fixedMember = urlMember || targetPhoto?.member || "";
    const fixedType = urlType || targetPhoto?.type || "";
    const fixedYear = urlYear || targetPhoto?.year || "2026";

    setReturnGroup(fixedGroup);
    setReturnMember(fixedMember);
    setReturnType(fixedType);
    setReturnYear(fixedYear);

    setOriginalGroup(fixedGroup);
    setOriginalMember(fixedMember);
    setOriginalType(fixedType);
    setOriginalYear(fixedYear);

    setGroup(fixedGroup);
    setYear(fixedYear);
    setMember(fixedMember);
    setType(fixedType);

    const targetGroupPhotos = loadedPhotos.filter(
      (photo) =>
        photo.group === fixedGroup &&
        photo.member === fixedMember &&
        photo.type === fixedType &&
        photo.year === fixedYear
    );

    const firstPhoto = targetGroupPhotos[0] || targetPhoto;

    if (firstPhoto) {
      setGeneration(firstPhoto.generation || "1期生");
      setMemberKana(firstPhoto.memberKana || "");
      setCompleteType(firstPhoto.completeType || getDefaultCompleteType(fixedGroup));
    } else {
      setCompleteType(getDefaultCompleteType(fixedGroup));
    }

    const countMap = {};
    const imageMap = {};
    const idMap = {};
    const otherList = [];

    targetGroupPhotos.forEach((photo) => {
      const photoId = String(photo.id || photo.firestoreId || Date.now() + Math.random());

      if (allStandardPoseList.includes(photo.pose)) {
        countMap[photo.pose] = String(photo.count ?? "");
        imageMap[photo.pose] = photo.image || "";
        idMap[photo.pose] = photoId;
      } else {
        otherList.push({
          id: photoId,
          name: photo.pose || "",
          count: String(photo.count ?? ""),
          image: photo.image || "",
        });
      }
    });

    setNormalPoseCounts(countMap);
    setNormalPoseImages(imageMap);
    setNormalPoseExistingIds(idMap);
    setOtherPoses(
      otherList.length > 0
        ? [...otherList, { id: null, name: "", count: "", image: "" }]
        : [{ id: null, name: "", count: "", image: "" }]
    );
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
        setupEditForm(loadedPhotos, urlGroup, urlMember, urlType, urlYear);
      } catch (error) {
        console.error(error);
        const localPhotos = JSON.parse(localStorage.getItem("photos")) || [];
        const photosWithImages = await attachIndexedDbImages(localPhotos);
        setupEditForm(photosWithImages, urlGroup, urlMember, urlType, urlYear);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [params.id]);

  const handleNormalPoseCountChange = (pose, value) => {
    setNormalPoseCounts((prev) => ({ ...prev, [pose]: value }));
  };

  const handleOtherPoseChange = (index, field, value) => {
    setOtherPoses((prev) => {
      const updated = prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      );

      const lastItem = updated[updated.length - 1];

      if (
        lastItem &&
        (lastItem.name.trim() || lastItem.count || lastItem.image) &&
        updated.length < 20
      ) {
        return [...updated, { id: null, name: "", count: "", image: "" }];
      }

      return updated;
    });
  };

  const openCropEditor = ({ kind, pose, index, sourceImage }) => {
    setCropTarget({ kind, pose, index, sourceImage });
    setCropImageSize({ width: 0, height: 0 });
    setCropBox({ left: 5, top: 5, right: 95, bottom: 95 });

    const editorId =
      kind === "normal"
        ? `photo-edit-crop-editor-normal-${pose}`
        : `photo-edit-crop-editor-other-${index}`;

    setTimeout(() => {
      document
        .getElementById(editorId)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const handleNormalPoseImageChange = (pose, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      openCropEditor({ kind: "normal", pose, index: null, sourceImage: reader.result });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleOtherPoseImageChange = (index, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      openCropEditor({ kind: "other", pose: "その他", index, sourceImage: reader.result });
    };
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

      if (cropTarget.kind === "normal") {
        setNormalPoseImages((prev) => ({ ...prev, [cropTarget.pose]: croppedImage }));
      }

      if (cropTarget.kind === "other") {
        handleOtherPoseChange(cropTarget.index, "image", croppedImage);
      }

      setCropTarget(null);
    } catch (error) {
      console.error(error);
      alert("画像の切り出しに失敗しました");
    }
  };

  const handleUseOriginalImage = () => {
    if (!cropTarget?.sourceImage) return;

    if (cropTarget.kind === "normal") {
      setNormalPoseImages((prev) => ({ ...prev, [cropTarget.pose]: cropTarget.sourceImage }));
    }

    if (cropTarget.kind === "other") {
      handleOtherPoseChange(cropTarget.index, "image", cropTarget.sourceImage);
    }

    setCropTarget(null);
  };

  const handleCancelCrop = () => {
    setCropTarget(null);
    setCropImageSize({ width: 0, height: 0 });
    setCropBox({ left: 5, top: 5, right: 95, bottom: 95 });
  };

  const isCropEditorForNormalPose = (pose) => cropTarget?.kind === "normal" && cropTarget?.pose === pose;
  const isCropEditorForOtherPose = (index) => cropTarget?.kind === "other" && cropTarget?.index === index;

  const renderCropEditor = (editorId) => {
    if (!cropTarget) return null;

    return (
      <div id={editorId} className="bg-zinc-950 border border-cyan-500 rounded-3xl p-4 mt-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold">画像調整</h2>
            <p className="text-sm text-zinc-400 mt-1 leading-6">
              水色の枠線をドラッグして、保存したい範囲を調整してください。
            </p>
          </div>

          <button type="button" onClick={handleCancelCrop} className="text-zinc-400 text-sm shrink-0">
            閉じる
          </button>
        </div>

        <div ref={cropAreaRef} className="relative w-full select-none touch-none rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-800">
          <img
            src={cropTarget.sourceImage}
            alt="調整中の画像"
            onLoad={(e) => setCropImageSize({ width: e.target.naturalWidth, height: e.target.naturalHeight })}
            className="w-full block"
            draggable={false}
          />

          <div
            className="absolute border-[4px] border-cyan-400 pointer-events-none"
            style={{
              left: `${cropBox.left}%`,
              top: `${cropBox.top}%`,
              width: `${cropBox.right - cropBox.left}%`,
              height: `${cropBox.bottom - cropBox.top}%`,
            }}
          />

          <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget("left"); }} className="absolute top-0 bottom-0 w-8 -translate-x-1/2 cursor-ew-resize bg-transparent" style={{ left: `${cropBox.left}%` }} />
          <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget("right"); }} className="absolute top-0 bottom-0 w-8 -translate-x-1/2 cursor-ew-resize bg-transparent" style={{ left: `${cropBox.right}%` }} />
          <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget("top"); }} className="absolute left-0 right-0 h-8 -translate-y-1/2 cursor-ns-resize bg-transparent" style={{ top: `${cropBox.top}%` }} />
          <button type="button" onPointerDown={(e) => { e.preventDefault(); setDragTarget("bottom"); }} className="absolute left-0 right-0 h-8 -translate-y-1/2 cursor-ns-resize bg-transparent" style={{ top: `${cropBox.bottom}%` }} />
        </div>

        {cropImageSize.width > 0 && cropImageSize.height > 0 && (
          <p className="text-xs text-zinc-500 mt-2">
            元画像サイズ：{cropImageSize.width} × {cropImageSize.height}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button type="button" onClick={() => setCropBox({ left: 5, top: 5, right: 95, bottom: 95 })} className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-2xl py-3 font-bold active:scale-[0.98] transition">
            枠をリセット
          </button>

          <button type="button" onClick={handleApplyCrop} className="bg-cyan-500 text-black rounded-2xl py-3 font-bold active:scale-[0.98] transition">
            この範囲で切り出す
          </button>
        </div>

        <button type="button" onClick={handleUseOriginalImage} className="w-full bg-white text-black border border-white rounded-2xl py-3 font-bold mt-3 active:scale-[0.98] transition">
          調整せず元画像を使う
        </button>
      </div>
    );
  };

  const buildUpdates = () => {
    const visibleStandardPoses = getNormalPoseList(completeType);
    const hiddenStandardPoses = allStandardPoseList.filter((pose) => !visibleStandardPoses.includes(pose));

    const hiddenHasCount = hiddenStandardPoses.some((pose) => Number(normalPoseCounts[pose] || 0) > 0);

    if (hiddenHasCount) {
      const confirmHiddenReset = window.confirm(
        "選択したコンプ種別では表示されないポーズに枚数が登録されています。対象外のポーズを0枚にして保存しますか？"
      );

      if (!confirmHiddenReset) return null;
    }

    const normalPoseUpdates = allStandardPoseList
      .map((pose) => {
        const isVisible = visibleStandardPoses.includes(pose);

        return {
          id: normalPoseExistingIds[pose] || null,
          pose,
          count: isVisible ? (normalPoseCounts[pose] === "" || normalPoseCounts[pose] == null ? 0 : Number(normalPoseCounts[pose])) : 0,
          image: normalPoseImages[pose] || "",
        };
      })
      .filter((item) => item.id || item.count > 0 || item.image);

    const filledOtherPoses = otherPoses.filter((item) => item.id || item.name.trim() || item.count || item.image);

    const invalidOtherPose = filledOtherPoses.find((item) => {
      if (item.id) return !item.name.trim() || item.count === "" || Number(item.count) < 0;
      return !item.name.trim() || !item.count || Number(item.count) <= 0;
    });

    if (invalidOtherPose) {
      alert("その他はポーズ名と枚数を正しく入力してください");
      return null;
    }

    const otherPoseUpdates = filledOtherPoses.map((item) => ({
      id: item.id,
      pose: item.name.trim(),
      count: Number(item.count),
      image: item.image || "",
    }));

    const updates = [...normalPoseUpdates, ...otherPoseUpdates];

    if (updates.length === 0) {
      alert("ポーズを1つ以上入力してください");
      return null;
    }

    return updates;
  };

  const applyUpdatesToPhotos = (sourcePhotos, updates) => {
    let firstSavedId = String(params.id);

    const updatedPhotos = sourcePhotos.map((photo) => {
      const isOriginalGroup =
        photo.group === originalGroup &&
        photo.member === originalMember &&
        photo.type === originalType &&
        photo.year === originalYear;

      if (!isOriginalGroup) return photo;

      const photoId = String(photo.id || photo.firestoreId || "");

      const updateById = updates.find((item) => item.id && String(item.id) === photoId);
      const updateByPose = updates.find((item) => !item.id && item.pose === photo.pose);
      const updateItem = updateById || updateByPose;

      if (!updateItem) {
        return { ...photo, year, completeType, status: "所持" };
      }

      return {
        ...photo,
        id: photoId || String(Date.now() + Math.random()),
        group,
        year,
        generation,
        member,
        memberKana,
        type,
        completeType,
        pose: updateItem.pose,
        status: "所持",
        count: Number(updateItem.count),
        hasIndexedDbImage: Boolean(updateItem.image || photo.hasIndexedDbImage),
      };
    });

    updates.forEach((updateItem) => {
      if (updateItem.id) return;
      if (Number(updateItem.count) <= 0) return;

      const alreadyExists = updatedPhotos.some(
        (photo) =>
          photo.group === group &&
          photo.member === member &&
          photo.type === type &&
          photo.year === year &&
          photo.pose === updateItem.pose
      );

      if (alreadyExists) return;

      const newId = String(Date.now() + Math.random());
      firstSavedId = newId;

      updatedPhotos.push({
        id: newId,
        group,
        year,
        generation,
        member,
        memberKana,
        type,
        completeType,
        pose: updateItem.pose,
        status: "所持",
        count: Number(updateItem.count),
        hasIndexedDbImage: Boolean(updateItem.image),
      });
    });

    return { firstSavedId, photos: normalizePhotos(updatedPhotos) };
  };

  const handleUpdate = async () => {
    const updates = buildUpdates();
    if (!updates) return;

    if (!user) {
      alert("ログイン情報を確認できません。再ログインしてください。");
      return;
    }

    try {
      setIsSaving(true);

      const localPhotos = JSON.parse(localStorage.getItem("photos")) || [];
      let firestorePhotos = [];

      try {
        firestorePhotos = await getUserPhotos(user.uid);
      } catch (error) {
        console.error(error);
      }

      if (!firestorePhotos.length) {
        firestorePhotos = localPhotos.map(removeImageForFirestore);
      }

      const localResult = applyUpdatesToPhotos(localPhotos, updates);
      const firestoreResult = applyUpdatesToPhotos(firestorePhotos, updates);

      const photosForImageSave = localResult.photos;
      const imageSaveTasks = [];
      const imageDeleteTasks = [];

      updates.forEach((updateItem) => {
        const targetPhoto = photosForImageSave.find(
          (photo) =>
            photo.group === group &&
            photo.year === year &&
            photo.member === member &&
            photo.type === type &&
            photo.pose === updateItem.pose
        );

        if (!targetPhoto) return;

        if (updateItem.image) {
          imageSaveTasks.push(savePhotoImage(targetPhoto, updateItem.image));
        }

        if (Number(updateItem.count) <= 0) {
          imageDeleteTasks.push(deletePhotoImage(targetPhoto));
        }
      });

      await Promise.all([...imageSaveTasks, ...imageDeleteTasks]);

      const filteredLocalPhotos = localResult.photos.filter((photo) => Number(photo.count || 0) > 0);
      const filteredFirestorePhotos = firestoreResult.photos
        .filter((photo) => Number(photo.count || 0) > 0)
        .map(removeImageForFirestore);

      localStorage.setItem("photos", JSON.stringify(filteredLocalPhotos));
      await saveUserPhotos(user.uid, filteredFirestorePhotos);

      alert("更新しました");
      router.push(makeUpdatedDetailUrl(localResult.firstSavedId || firestoreResult.firstSavedId));
    } catch (error) {
      console.error(error);
      alert("更新に失敗しました。コンソールを確認してください。");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-xl font-bold">読み込み中...</p>
          <p className="text-zinc-400 text-sm mt-2">編集データを取得しています</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md md:max-w-3xl lg:max-w-4xl mx-auto">
        <Link href={makeDetailUrl()} className="text-cyan-400 text-sm">
          ← 戻る
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-6">生写真を編集</h1>

        <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4 mb-5">
          <p className="text-sm text-zinc-400 mb-3">編集対象</p>

          <div className="grid gap-2 text-sm text-zinc-300">
            <p><span className="text-zinc-500">グループ：</span>{group}</p>
            <p><span className="text-zinc-500">メンバー：</span>{member}</p>
            <p><span className="text-zinc-500">種類：</span>{type}</p>
            <p><span className="text-zinc-500">期生：</span>{generation}</p>
          </div>
        </div>

        <form className="grid gap-5">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">年</label>

            <select value={year} onChange={(e) => setYear(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3">
              {Array.from({ length: 16 }, (_, i) => 2026 - i).map((yearOption) => (
                <option key={yearOption} value={String(yearOption)}>{yearOption}</option>
              ))}
            </select>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="text-sm text-zinc-400">ポーズ・枚数・画像</p>

              <select value={completeType} onChange={(e) => setCompleteType(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-2 text-xs">
                {completeTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {normalPoseList.map((pose) => (
                <div key={pose} className="border-b md:border border-zinc-800 md:rounded-2xl md:p-3 pb-4 last:border-b-0 md:last:border-b">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,104px)] gap-3 items-start">
                    <p className="font-bold pt-3 min-w-0">{pose}</p>

                    <CountSelector value={normalPoseCounts[pose] || ""} onChange={(value) => handleNormalPoseCountChange(pose, value)} allowZero={true} />
                  </div>

                  <input type="file" accept="image/*" onChange={(e) => handleNormalPoseImageChange(pose, e)} className="mt-3 w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm" />

                  {isCropEditorForNormalPose(pose) && renderCropEditor(`photo-edit-crop-editor-normal-${pose}`)}

                  {normalPoseImages[pose] && (
                    <img src={normalPoseImages[pose]} alt={pose} className="mt-3 w-full max-w-[140px] rounded-2xl border border-zinc-700 bg-zinc-800 p-2" />
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-zinc-700 mt-5 pt-4 grid gap-3">
              <p className="text-sm text-zinc-400">その他</p>

              <div className="grid gap-3 md:grid-cols-2">
                {otherPoses.map((otherPose, index) => (
                  <div key={index} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,104px)] gap-3 items-start">
                      <input type="text" value={otherPose.name} onChange={(e) => handleOtherPoseChange(index, "name", e.target.value)} placeholder="ポーズ名" className="w-full min-w-0 bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm" />

                      <CountSelector value={otherPose.count} onChange={(value) => handleOtherPoseChange(index, "count", value)} allowZero={Boolean(otherPose.id)} />
                    </div>

                    <input type="file" accept="image/*" onChange={(e) => handleOtherPoseImageChange(index, e)} className="mt-3 w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm" />

                    {isCropEditorForOtherPose(index) && renderCropEditor(`photo-edit-crop-editor-other-${index}`)}

                    {otherPose.image && (
                      <img src={otherPose.image} alt={otherPose.name || "その他"} className="mt-3 w-full max-w-[140px] rounded-2xl border border-zinc-700 bg-zinc-800 p-2" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button type="button" onClick={handleUpdate} disabled={isSaving} className="bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-3xl py-4 font-bold text-lg active:scale-[0.98] transition">
            {isSaving ? "更新中..." : "更新する"}
          </button>
        </form>
      </div>
    </main>
  );
}
