import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getFirestore, collection, getDocs, addDoc, deleteDoc,
  doc, query, where, updateDoc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAx4RfDW-UdkFf3m_wQuSdeptqssE7n2wU",
  authDomain: "cafe-shift-report-70c6c.firebaseapp.com",
  projectId: "cafe-shift-report-70c6c",
  storageBucket: "cafe-shift-report-70c6c.firebasestorage.app",
  messagingSenderId: "461174765046",
  appId: "1:461174765046:web:660d43de856294644343d7"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);

// Default outlets jika belum ada di Firestore
const DEFAULT_OUTLETS = [
  { id: "outlet1", nama: "Kopi Telu Sawah View" },
  { id: "outlet2", nama: "Kopi Telu Awang Awang" },
  { id: "outlet3", nama: "Kopi Telu Citraland" },
];

// Cache outlets supaya tidak query berulang
let _outletsCache = null;

export const OutletManager = {
  async getAll() {
    if (_outletsCache) return _outletsCache;
    try {
      const snap = await getDocs(collection(db, "outlets"));
      if (snap.empty) {
        // Seed default outlets
        for (const o of DEFAULT_OUTLETS) {
          await setDoc(doc(db, "outlets", o.id), { nama: o.nama });
        }
        _outletsCache = [...DEFAULT_OUTLETS];
      } else {
        _outletsCache = snap.docs.map(d => ({ id: d.id, nama: d.data().nama }));
      }
    } catch(e) {
      _outletsCache = [...DEFAULT_OUTLETS];
    }
    return _outletsCache;
  },

  invalidate() { _outletsCache = null; },

  async getNamesMap() {
    const list = await this.getAll();
    const map = { all: "Semua Outlet" };
    list.forEach(o => map[o.id] = o.nama);
    return map;
  },

  async add(nama) {
    if (!nama) throw new Error("Nama outlet tidak boleh kosong");
    const list = await this.getAll();
    // Generate ID baru
    const existingNums = list
      .map(o => parseInt(o.id.replace("outlet", "")))
      .filter(n => !isNaN(n));
    const nextNum = existingNums.length ? Math.max(...existingNums) + 1 : 1;
    const newId = "outlet" + nextNum;
    await setDoc(doc(db, "outlets", newId), { nama });
    this.invalidate();
    return newId;
  },

  async updateNama(id, nama) {
    if (!nama) throw new Error("Nama tidak boleh kosong");
    await updateDoc(doc(db, "outlets", id), { nama });
    this.invalidate();
  },
};

export const Auth = {
  async login(username, password, outlet) {
    // Owner — cek password dari Firestore (bisa diubah)
    if (username === "owner") {
      const ownerDoc = await getDoc(doc(db, "config", "owner"));
      const ownerPassword = ownerDoc.exists() ? ownerDoc.data().password : "owner123";
      if (password !== ownerPassword) return null;
      const session = { username, role: "owner", nama: "Owner", selectedOutlet: outlet };
      localStorage.setItem("cafe_session", JSON.stringify(session));
      return session;
    }

    // Pegawai/Gudang dari Firestore
    const snap = await getDocs(query(
      collection(db, "users"),
      where("username", "==", username),
      where("password", "==", password)
    ));
    if (snap.empty) return null;
    const u = { id: snap.docs[0].id, ...snap.docs[0].data() };

    // Akun gudang tidak perlu pilih outlet
    if (u.role === "gudang") {
      const session = { ...u };
      localStorage.setItem("cafe_session", JSON.stringify(session));
      return session;
    }

    const allowedOutlets = u.outlets || (u.outlet ? [u.outlet] : []);
    if (!allowedOutlets.includes(outlet)) {
      throw new Error("Kamu tidak terdaftar di outlet ini.");
    }
    const session = { ...u, outlets: allowedOutlets, selectedOutlet: outlet };
    localStorage.setItem("cafe_session", JSON.stringify(session));
    return session;
  },

  logout() {
    localStorage.removeItem("cafe_session");
    window.location.href = "index.html";
  },

  getUser() {
    const s = localStorage.getItem("cafe_session");
    return s ? JSON.parse(s) : null;
  },

  requireAuth(role) {
    const u = this.getUser();
    if (!u) { window.location.href = "index.html"; return null; }
    if (role === "owner" && u.role !== "owner") { window.location.href = "home.html"; return null; }
    if (role === "inventori" && !["owner","gudang"].includes(u.role) && !u.aksesGudang) {
      window.location.href = "home.html"; return null;
    }
    return u;
  },

  // Ganti password owner — simpan ke Firestore
  async changeOwnerPassword(oldPassword, newPassword) {
    const ownerDoc = await getDoc(doc(db, "config", "owner"));
    const current = ownerDoc.exists() ? ownerDoc.data().password : "owner123";
    if (oldPassword !== current) throw new Error("Password lama salah.");
    if (!newPassword || newPassword.length < 6) throw new Error("Password baru minimal 6 karakter.");
    await setDoc(doc(db, "config", "owner"), { password: newPassword });
  },

  // Manajemen pegawai
  async getUsers() {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async addUser(data) {
    const snap = await getDocs(query(collection(db, "users"), where("username", "==", data.username)));
    if (!snap.empty) throw new Error("Username sudah digunakan");
    if (data.role === "gudang") {
      return addDoc(collection(db, "users"), { ...data, role: "gudang" });
    }
    if (!data.outlets || data.outlets.length === 0) throw new Error("Pilih minimal 1 outlet");
    return addDoc(collection(db, "users"), { ...data, role: "pegawai" });
  },

  async updateUserOutlets(id, outlets) {
    if (!outlets || outlets.length === 0) throw new Error("Pilih minimal 1 outlet");
    await updateDoc(doc(db, "users", id), { outlets });
  },

  async updateAksesGudang(id, value) {
    await updateDoc(doc(db, "users", id), { aksesGudang: value });
  },

  async deleteUser(id) {
    return deleteDoc(doc(db, "users", id));
  }
};
