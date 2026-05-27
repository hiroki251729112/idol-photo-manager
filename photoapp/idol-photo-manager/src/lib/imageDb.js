const DB_NAME = "idol-photo-manager-db";
const DB_VERSION = 1;
const IMAGE_STORE_NAME = "photoImages";
const MEMBER_IMAGE_STORE_NAME = "memberImages";

const openImageDatabase = () => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB is only available in the browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        db.createObjectStore(IMAGE_STORE_NAME, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(MEMBER_IMAGE_STORE_NAME)) {
        db.createObjectStore(MEMBER_IMAGE_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

const runStoreOperation = async (storeName, mode, operation) => {
  const db = await openImageDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    const request = operation(store);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };

    transaction.oncomplete = () => {
      db.close();
    };

    transaction.onerror = () => {
      reject(transaction.error);
      db.close();
    };
  });
};

export const makePhotoImageId = (photo) => {
  return [
    photo.group || "",
    photo.year || "",
    photo.member || "",
    photo.type || "",
    photo.pose || "",
  ].join("__");
};

export const makeMemberImageId = (group, member) => {
  return `${group || ""}__${member || ""}`;
};

export const savePhotoImage = async (photo, imageData) => {
  if (!imageData) return;

  const id = makePhotoImageId(photo);

  await runStoreOperation(IMAGE_STORE_NAME, "readwrite", (store) =>
    store.put({
      id,
      image: imageData,
      updatedAt: Date.now(),
    })
  );
};

export const getPhotoImage = async (photo) => {
  const id = makePhotoImageId(photo);

  const result = await runStoreOperation(IMAGE_STORE_NAME, "readonly", (store) =>
    store.get(id)
  );

  return result?.image || "";
};

export const getPhotoImagesMap = async (photos) => {
  const entries = await Promise.all(
    photos.map(async (photo) => {
      const id = makePhotoImageId(photo);
      const image = await getPhotoImage(photo);
      return [id, image];
    })
  );

  return Object.fromEntries(entries.filter(([, image]) => Boolean(image)));
};

export const deletePhotoImage = async (photo) => {
  const id = makePhotoImageId(photo);

  await runStoreOperation(IMAGE_STORE_NAME, "readwrite", (store) =>
    store.delete(id)
  );
};

const migratePhotoImageId = async (oldPhoto, nextPhoto) => {
  const oldId = makePhotoImageId(oldPhoto);
  const nextId = makePhotoImageId(nextPhoto);

  if (!oldId || !nextId || oldId === nextId) return;

  const db = await openImageDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(IMAGE_STORE_NAME);
    const getRequest = store.get(oldId);

    getRequest.onsuccess = () => {
      const oldItem = getRequest.result;

      if (!oldItem?.image) return;

      store.put({
        ...oldItem,
        id: nextId,
        updatedAt: Date.now(),
      });

      store.delete(oldId);
    };

    getRequest.onerror = () => {
      reject(getRequest.error);
    };

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

export const migratePhotoImagesForTypeRename = async (
  group,
  oldType,
  nextType,
  photos = []
) => {
  if (!group || !oldType || !nextType || oldType === nextType) return;

  const targets = photos.filter(
    (photo) => photo.group === group && photo.type === oldType
  );

  await Promise.all(
    targets.map((photo) =>
      migratePhotoImageId(photo, {
        ...photo,
        type: nextType,
      })
    )
  );
};

export const migratePhotoImagesForMemberRename = async (
  group,
  oldMember,
  nextMember,
  photos = []
) => {
  if (!group || !oldMember || !nextMember || oldMember === nextMember) return;

  const targets = photos.filter(
    (photo) => photo.group === group && photo.member === oldMember
  );

  await Promise.all(
    targets.map((photo) =>
      migratePhotoImageId(photo, {
        ...photo,
        member: nextMember,
      })
    )
  );
};

export const deletePhotoImagesForType = async (group, type, photos = []) => {
  if (!group || !type) return;

  const targets = photos.filter(
    (photo) => photo.group === group && photo.type === type
  );

  await Promise.all(targets.map((photo) => deletePhotoImage(photo)));
};

export const deletePhotoImagesForMember = async (group, member, photos = []) => {
  if (!group || !member) return;

  const targets = photos.filter(
    (photo) => photo.group === group && photo.member === member
  );

  await Promise.all(targets.map((photo) => deletePhotoImage(photo)));
};

export const saveMemberImage = async (group, member, imageData) => {
  if (!imageData) return;

  const id = makeMemberImageId(group, member);

  await runStoreOperation(MEMBER_IMAGE_STORE_NAME, "readwrite", (store) =>
    store.put({
      id,
      group,
      member,
      image: imageData,
      updatedAt: Date.now(),
    })
  );
};

export const getMemberImage = async (group, member) => {
  const id = makeMemberImageId(group, member);

  const result = await runStoreOperation(MEMBER_IMAGE_STORE_NAME, "readonly", (store) =>
    store.get(id)
  );

  return result?.image || "";
};

export const getMemberImagesMap = async (group) => {
  const db = await openImageDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEMBER_IMAGE_STORE_NAME, "readonly");
    const store = transaction.objectStore(MEMBER_IMAGE_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result || [];
      const map = {};

      items.forEach((item) => {
        if (item.group === group && item.member) {
          map[item.member] = item.image || "";
        }
      });

      resolve(map);
    };

    request.onerror = () => {
      reject(request.error);
    };

    transaction.oncomplete = () => {
      db.close();
    };

    transaction.onerror = () => {
      reject(transaction.error);
      db.close();
    };
  });
};

export const deleteMemberImage = async (group, member) => {
  const id = makeMemberImageId(group, member);

  await runStoreOperation(MEMBER_IMAGE_STORE_NAME, "readwrite", (store) =>
    store.delete(id)
  );
};

export const migrateMemberImageName = async (group, oldMember, nextMember) => {
  if (!group || !oldMember || !nextMember || oldMember === nextMember) return;

  const oldId = makeMemberImageId(group, oldMember);
  const nextId = makeMemberImageId(group, nextMember);

  const db = await openImageDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEMBER_IMAGE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(MEMBER_IMAGE_STORE_NAME);
    const getRequest = store.get(oldId);

    getRequest.onsuccess = () => {
      const oldItem = getRequest.result;

      if (!oldItem?.image) return;

      store.put({
        ...oldItem,
        id: nextId,
        group,
        member: nextMember,
        updatedAt: Date.now(),
      });

      store.delete(oldId);
    };

    getRequest.onerror = () => {
      reject(getRequest.error);
    };

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

export const exportAllImages = async () => {
  const db = await openImageDatabase();

  const getAllFromStore = (storeName) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  };

  const photoImages = await getAllFromStore(IMAGE_STORE_NAME);
  const memberImages = await getAllFromStore(MEMBER_IMAGE_STORE_NAME);

  db.close();

  return {
    photoImages,
    memberImages,
  };
};

export const importAllImages = async ({ photoImages = [], memberImages = [] }) => {
  const db = await openImageDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [IMAGE_STORE_NAME, MEMBER_IMAGE_STORE_NAME],
      "readwrite"
    );

    const photoStore = transaction.objectStore(IMAGE_STORE_NAME);
    const memberStore = transaction.objectStore(MEMBER_IMAGE_STORE_NAME);

    photoImages.forEach((item) => {
      if (item?.id) photoStore.put(item);
    });

    memberImages.forEach((item) => {
      if (item?.id) memberStore.put(item);
    });

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};
