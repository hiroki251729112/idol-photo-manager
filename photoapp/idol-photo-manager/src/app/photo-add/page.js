"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserPhotos, saveUserPhotos } from "@/lib/photoService";
import { savePhotoImage } from "@/lib/imageDb";

function CountSelector({ value, onChange }) {
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

export default function PhotoAddPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [group, setGroup] = useState("櫻坂46");
  const [year, setYear] = useState("2026");
  const [generation, setGeneration] = useState("1期生");

  const [member, setMember] = useState("");
  const [newMember, setNewMember] = useState("");
  const [newMemberKana, setNewMemberKana] = useState("");

  const [typeSelect, setTypeSelect] = useState("");
  const [type, setType] = useState("");
  const [completeType, setCompleteType] = useState("4");

  const [memberOptions, setMemberOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);

  const [memberGenerationMap, setMemberGenerationMap] = useState({});
  const [memberKanaMap, setMemberKanaMap] = useState({});

  const [poseCounts, setPoseCounts] = useState({});
  const [poseImages, setPoseImages] = useState({});

  const [otherPoses, setOtherPoses] = useState([
    { name: "", count: "", image: "" },
  ]);

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

  const normalPoseList = useMemo(() => {
    if (completeType === "3") return ["ヨリ", "チュウ", "ヒキ"];
    if (completeType === "4") return ["ヨリ", "チュウ", "ヒキ", "座り"];
    if (completeType === "5") {
      return ["ヨリ", "チュウ", "ヒキ", "座り", "座りヨリ"];
    }

    return ["ヨリ", "チュウ", "ヒキ", "座り", "座りヨリ"];
  }, [completeType]);

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
      const generationDiff =
        getGenerationSortValue(a.generation) -
        getGenerationSortValue(b.generation);

      if (generationDiff !== 0) return generationDiff;

      return (a.memberKana || a.member).localeCompare(
        b.memberKana || b.member,
        "ja"
      );
    });
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
        normalizedPhotos[existingIndex].count =
          Number(normalizedPhotos[existingIndex].count || 0) +
          Number(photo.count || 0);

        if (photo.imageUrl) {
          normalizedPhotos[existingIndex].imageUrl = photo.imageUrl;
        }
        if (photo.memberKana) {
          normalizedPhotos[existingIndex].memberKana = photo.memberKana;
        }
        if (photo.completeType) {
          normalizedPhotos[existingIndex].completeType = photo.completeType;
        }
        if (photo.hasIndexedDbImage) {
          normalizedPhotos[existingIndex].hasIndexedDbImage = true;
        }
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

  const setupOptionsFromPhotos = (photos, selectedGroup, defaultCompleteType) => {
    const groupPhotos = photos.filter(
      (photo) => photo.group === selectedGroup && Number(photo.count || 0) > 0
    );

    const memberMap = new Map();
    const typeMap = new Map();
    const generationMap = {};
    const kanaMap = {};

    groupPhotos.forEach((photo) => {
      if (photo.member) {
        if (!memberMap.has(photo.member)) {
          memberMap.set(photo.member, {
            member: photo.member,
            memberKana: photo.memberKana || "",
            generation: photo.generation || "",
          });
        } else {
          const item = memberMap.get(photo.member);
          if (!item.memberKana && photo.memberKana) {
            item.memberKana = photo.memberKana;
          }
          if (!item.generation && photo.generation) {
            item.generation = photo.generation;
          }
        }
      }

      if (photo.member && photo.generation) {
        generationMap[photo.member] = photo.generation;
      }

      if (photo.member && photo.memberKana) {
        kanaMap[photo.member] = photo.memberKana;
      }

      if (photo.type) {
        if (!typeMap.has(photo.type)) {
          typeMap.set(photo.type, {
            type: photo.type,
            latestId: Number(photo.id || 0),
          });
        } else {
          const item = typeMap.get(photo.type);
          item.latestId = Math.max(item.latestId, Number(photo.id || 0));
        }
      }
    });

    const sortedTypeOptions = [...typeMap.values()].sort(
      (a, b) => b.latestId - a.latestId
    );

    setMemberOptions(sortMembers([...memberMap.values()]));
    setTypeOptions(sortedTypeOptions);
    setMemberGenerationMap(generationMap);
    setMemberKanaMap(kanaMap);

    const lastInput = JSON.parse(
      localStorage.getItem(`lastPhotoInput_${selectedGroup}`)
    );

    if (lastInput) {
      setYear(lastInput.year || "2026");
      setGeneration(lastInput.generation || "1期生");
      setMember(lastInput.member || "");
      setType(lastInput.type || "");

      const lastTypeExists = sortedTypeOptions.some(
        (item) => item.type === lastInput.type
      );
      setTypeSelect(lastTypeExists ? lastInput.type : "__new__");

      setCompleteType(lastInput.completeType || defaultCompleteType);
    } else {
      setTypeSelect("__new__");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedGroup = params.get("group") || "櫻坂46";
    const defaultCompleteType = selectedGroup === "乃木坂46" ? "3" : "4";

    setGroup(selectedGroup);
    setCompleteType(defaultCompleteType);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      let photosForOptions = [];

      try {
        if (currentUser) {
          photosForOptions = await getUserPhotos(currentUser.uid);
        }
      } catch (error) {
        console.error(error);
      }

      if (!photosForOptions.length) {
        photosForOptions = JSON.parse(localStorage.getItem("photos")) || [];
      }

      setupOptionsFromPhotos(
        photosForOptions,
        selectedGroup,
        defaultCompleteType
      );
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setCompleteType((prev) => {
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

    if (value !== "__new__" && memberGenerationMap[value]) {
      setGeneration(memberGenerationMap[value]);
    }
  };

  const handleTypeSelectChange = (value) => {
    setTypeSelect(value);

    if (value === "__new__") {
      setType("");
    } else {
      setType(value);
    }
  };

  const handlePoseCountChange = (pose, value) => {
    setPoseCounts((prev) => ({
      ...prev,
      [pose]: value,
    }));
  };

  const handlePoseImageChange = (pose, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      setPoseImages((prev) => ({
        ...prev,
        [pose]: reader.result,
      }));
    };

    reader.readAsDataURL(file);
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
        return [...updated, { name: "", count: "", image: "" }];
      }

      return updated;
    });
  };

  const handleOtherPoseImageChange = (index, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      handleOtherPoseChange(index, "image", reader.result);
    };

    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const finalMember = member === "__new__" ? newMember.trim() : member.trim();
    const finalType = type.trim();
    const finalMemberKana =
      member === "__new__" ? newMemberKana.trim() : memberKanaMap[member] || "";

    if (!user) {
      alert("ログイン情報を確認できません。再ログインしてください。");
      return;
    }

    if (!finalMember) {
      alert("メンバーを選択してください");
      return;
    }

    if (member === "__new__" && !finalMemberKana) {
      alert("メンバーのふりがなを入力してください");
      return;
    }

    if (!finalType) {
      alert("種類を入力してください");
      return;
    }

    const normalSelectedPoses = Object.entries(poseCounts)
      .filter(([poseName, value]) =>
        normalPoseList.includes(poseName) && value && Number(value) > 0
      )
      .map(([poseName, count]) => ({
        pose: poseName,
        count: Number(count),
        image: poseImages[poseName] || "",
      }));

    const filledOtherPoses = otherPoses.filter(
      (item) => item.name.trim() || item.count || item.image
    );

    const invalidOtherPose = filledOtherPoses.find(
      (item) => !item.name.trim() || !item.count || Number(item.count) <= 0
    );

    if (invalidOtherPose) {
      alert("その他はポーズ名と枚数を両方入力してください");
      return;
    }

    const otherSelectedPoses = filledOtherPoses.map((item) => ({
      pose: item.name.trim(),
      count: Number(item.count),
      image: item.image || "",
    }));

    const selectedPoses = [...normalSelectedPoses, ...otherSelectedPoses];

    if (selectedPoses.length === 0) {
      alert("ポーズを1つ以上選択してください");
      return;
    }

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
          completeType,
          pose: poseItem.pose,
          status: "所持",
          count: Number(poseItem.count),
          hasIndexedDbImage: Boolean(poseItem.image),
        };

        if (poseItem.image) {
          imageSaveTasks.push(savePhotoImage(basePhoto, poseItem.image));
        }

        const updatePhotos = (photos) => {
          const existingPhotoIndex = photos.findIndex(
            (photo) =>
              photo.group === group &&
              photo.year === year &&
              photo.member === finalMember &&
              photo.type === finalType &&
              photo.pose === poseItem.pose
          );

          if (existingPhotoIndex !== -1) {
            photos[existingPhotoIndex].count =
              Number(photos[existingPhotoIndex].count || 0) +
              Number(poseItem.count);

            photos[existingPhotoIndex].status = "所持";
            photos[existingPhotoIndex].generation = generation;
            photos[existingPhotoIndex].completeType = completeType;

            if (finalMemberKana) {
              photos[existingPhotoIndex].memberKana = finalMemberKana;
            }

            if (poseItem.image) {
              photos[existingPhotoIndex].hasIndexedDbImage = true;
            }
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
      localStorage.setItem(
        `lastPhotoInput_${group}`,
        JSON.stringify({
          year,
          generation,
          member: member === "__new__" ? finalMember : member,
          type: finalType,
          completeType,
        })
      );

      await saveUserPhotos(user.uid, firestorePhotos);

      alert("保存しました");
      router.push(`/select?group=${encodeURIComponent(group)}`);
    } catch (error) {
      console.error(error);
      alert("保存に失敗しました。コンソールを確認してください。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md md:max-w-3xl lg:max-w-4xl mx-auto">
        <Link
          href={`/select?group=${encodeURIComponent(group)}`}
          className="text-cyan-400 text-sm"
        >
          ← 戻る
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mt-4 mb-2">
          生写真を追加
        </h1>

        <p className="text-zinc-400 mb-4">{group}</p>

        <Link
          href={`/photo-bulk-crop?group=${encodeURIComponent(group)}`}
          className="block bg-zinc-900 border border-cyan-500 text-cyan-300 rounded-2xl py-3 px-4 font-bold text-center mb-6 active:scale-[0.98] transition"
        >
          まとめて画像追加
        </Link>

        <form className="grid gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                メンバー
              </label>

              <select
                value={member}
                onChange={(e) => handleMemberChange(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3"
              >
                <option value="">選択してください</option>

                {memberOptions.map((item) => (
                  <option key={item.member} value={item.member}>
                    {item.member}
                  </option>
                ))}

                <option value="__new__">＋ 新しく追加</option>
              </select>

              {member === "__new__" && (
                <input
                  type="text"
                  value={newMember}
                  onChange={(e) => setNewMember(e.target.value)}
                  placeholder="新しいメンバー名"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3 mt-2"
                />
              )}

              {member === "__new__" && (
                <input
                  type="text"
                  value={newMemberKana}
                  onChange={(e) => setNewMemberKana(e.target.value)}
                  placeholder="ふりがな（例：くぼしおり）"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3 mt-2"
                />
              )}
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">種類</label>

              <select
                value={typeSelect}
                onChange={(e) => handleTypeSelectChange(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3"
              >
                <option value="__new__">＋ 新しく入力</option>

                {typeOptions.map((item) => (
                  <option key={item.type} value={item.type}>
                    {item.type}
                  </option>
                ))}
              </select>

              {typeSelect === "__new__" && (
                <input
                  type="text"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder="種類名を入力"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3 mt-2"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">年</label>

              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3"
              >
                {Array.from({ length: 16 }, (_, i) => 2026 - i).map(
                  (yearOption) => (
                    <option key={yearOption} value={String(yearOption)}>
                      {yearOption}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">期生</label>

              <select
                value={generation}
                onChange={(e) => setGeneration(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3"
              >
                {generationOptions.map((generationOption) => (
                  <option key={generationOption} value={generationOption}>
                    {generationOption}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="text-sm text-zinc-400">ポーズ・枚数・画像</p>

              <select
                value={completeType}
                onChange={(e) => setCompleteType(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-2 text-xs"
              >
                {completeTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {normalPoseList.map((pose) => (
                <div
                  key={pose}
                  className="border-b md:border border-zinc-800 md:rounded-2xl md:p-3 pb-4 last:border-b-0 md:last:border-b"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,104px)] gap-3 items-start">
                    <p className="font-bold pt-3 min-w-0">{pose}</p>

                    <CountSelector
                      value={poseCounts[pose] || ""}
                      onChange={(value) => handlePoseCountChange(pose, value)}
                    />
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handlePoseImageChange(pose, e)}
                    className="mt-3 w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm"
                  />

                  {poseImages[pose] && (
                    <img
                      src={poseImages[pose]}
                      alt={pose}
                      className="mt-3 w-full max-w-[140px] rounded-2xl border border-zinc-700 bg-zinc-800 p-2"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-zinc-700 mt-5 pt-4 grid gap-3">
              <p className="text-sm text-zinc-400">その他</p>

              <div className="grid gap-3 md:grid-cols-2">
                {otherPoses.map((otherPose, index) => (
                  <div
                    key={index}
                    className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,104px)] gap-3 items-start">
                      <input
                        type="text"
                        value={otherPose.name}
                        onChange={(e) =>
                          handleOtherPoseChange(index, "name", e.target.value)
                        }
                        placeholder="ポーズ名"
                        className="w-full min-w-0 bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm"
                      />

                      <CountSelector
                        value={otherPose.count}
                        onChange={(value) =>
                          handleOtherPoseChange(index, "count", value)
                        }
                      />
                    </div>

                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleOtherPoseImageChange(index, e)}
                      className="mt-3 w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm"
                    />

                    {otherPose.image && (
                      <img
                        src={otherPose.image}
                        alt={otherPose.name || "その他"}
                        className="mt-3 w-full max-w-[140px] rounded-2xl border border-zinc-700 bg-zinc-800 p-2"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-black rounded-3xl py-4 font-bold text-lg active:scale-[0.98] transition"
          >
            {isSaving ? "保存中..." : "保存する"}
          </button>
        </form>
      </div>
    </main>
  );
}
