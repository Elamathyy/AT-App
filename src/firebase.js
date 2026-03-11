import { initializeApp } from 'firebase/app';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  initializeFirestore,
  setDoc,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);
const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const db = app
  ? initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      useFetchStreams: false,
    })
  : null;

const FARMERS_KEY = 'green-harvest-farmers';
const LISTINGS_KEY = 'green-harvest-listings';

function withTimeout(promise, label, timeoutMs = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${label} is taking too long. Please check your Firebase rules or internet and try again.`));
      }, timeoutMs);
    }),
  ]);
}

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function saveFarmerLocally(farmer) {
  const farmers = readJson(FARMERS_KEY, {});
  farmers[farmer.phone] = farmer;
  writeJson(FARMERS_KEY, farmers);
}

function getFarmerLocally(phone) {
  const farmers = readJson(FARMERS_KEY, {});
  return farmers[phone] ?? null;
}

function updateFarmerLocally(phone, updates) {
  const farmer = getFarmerLocally(phone);
  if (!farmer) {
    return;
  }

  saveFarmerLocally({ ...farmer, ...updates });
}

function saveListingLocally(listing) {
  const listings = readJson(LISTINGS_KEY, []);
  const listingId = `local-${Date.now()}`;
  listings.unshift({ ...listing, listingId, createdAt: new Date().toISOString() });
  writeJson(LISTINGS_KEY, listings);
  return listingId;
}

function syncFarmerToFirebase(phone, farmer) {
  if (!db) {
    return;
  }

  withTimeout(setDoc(doc(db, 'farmers', phone), farmer), 'Registration').catch(() => {});
}

function syncFarmerUpdateToFirebase(phone, updates) {
  if (!db) {
    return;
  }

  withTimeout(setDoc(doc(db, 'farmers', phone), updates, { merge: true }), 'Language update').catch(() => {});
}

function syncListingToFirebase(listing) {
  if (!db) {
    return;
  }

  withTimeout(
    addDoc(collection(db, 'harvestListings'), {
      ...listing,
      createdAt: new Date().toISOString(),
    }),
    'Saving harvest details',
  ).catch(() => {});
}

export function isFirebaseReady() {
  return Boolean(db);
}

export async function registerFarmer({ name, phone, pin, language }) {
  const farmer = {
    name,
    phone,
    pin,
    language,
    createdAt: new Date().toISOString(),
  };

  saveFarmerLocally(farmer);
  syncFarmerToFirebase(phone, farmer);
  return { mode: db ? 'local-first' : 'local' };
}

export async function loginFarmer({ phone, pin }) {
  const localFarmer = getFarmerLocally(phone);

  if (localFarmer && localFarmer.pin === pin) {
    return { ...localFarmer, mode: 'local' };
  }

  if (!db) {
    if (!localFarmer) {
      throw new Error('Account not found for this phone number.');
    }

    throw new Error('Incorrect 4 digit pin.');
  }

  const snapshot = await withTimeout(getDoc(doc(db, 'farmers', phone)), 'Login');

  if (!snapshot.exists()) {
    if (localFarmer) {
      throw new Error('Incorrect 4 digit pin.');
    }

    throw new Error('Account not found on this device yet. Please register first or complete Firebase setup.');
  }

  const farmer = snapshot.data();

  if (farmer.pin !== pin) {
    throw new Error('Incorrect 4 digit pin.');
  }

  saveFarmerLocally(farmer);
  return { ...farmer, mode: 'firebase' };
}

export async function updateFarmerLanguage(phone, language) {
  const updates = {
    language,
    updatedAt: new Date().toISOString(),
  };

  updateFarmerLocally(phone, updates);
  syncFarmerUpdateToFirebase(phone, updates);
  return { mode: db ? 'local-first' : 'local' };
}

export async function saveHarvestListing(listing) {
  const localId = saveListingLocally(listing);
  syncListingToFirebase(listing);
  return localId;
}
