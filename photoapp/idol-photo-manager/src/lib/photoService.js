import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const getPhotosCollectionRef = (userId) => {
  return collection(db, "users", userId, "photos");
};

export const getUserPhotos = async (userId) => {
  if (!userId) return [];

  const querySnapshot = await getDocs(getPhotosCollectionRef(userId));

  return querySnapshot.docs.map((docSnap) => ({
    firestoreId: docSnap.id,
    ...docSnap.data(),
  }));
};

export const saveUserPhoto = async (userId, photo) => {
  if (!userId) {
    throw new Error("userId is required");
  }

  const photoId = String(photo.id || Date.now() + Math.random());
  const photoRef = doc(db, "users", userId, "photos", photoId);

  await setDoc(
    photoRef,
    {
      ...photo,
      id: photoId,
      updatedAt: serverTimestamp(),
      createdAt: photo.createdAt || serverTimestamp(),
    },
    { merge: true }
  );

  return photoId;
};

export const saveUserPhotos = async (userId, photos) => {
  if (!userId) {
    throw new Error("userId is required");
  }

  const results = [];

  for (const photo of photos) {
    const savedId = await saveUserPhoto(userId, photo);
    results.push(savedId);
  }

  return results;
};

export const deleteUserPhoto = async (userId, photoId) => {
  if (!userId || !photoId) return;

  const photoRef = doc(db, "users", userId, "photos", String(photoId));
  await deleteDoc(photoRef);
};

export const deleteUserPhotosByCondition = async (userId, conditionFn) => {
  if (!userId) return;

  const photos = await getUserPhotos(userId);
  const targets = photos.filter(conditionFn);

  for (const photo of targets) {
    await deleteUserPhoto(userId, photo.id || photo.firestoreId);
  }

  return targets.length;
};