import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy }
  from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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

export const Storage = {
  async checkDuplicate(outlet, tanggal, shift) {
    const snap = await getDocs(query(
      collection(db, "laporan"),
      where("outlet", "==", outlet),
      where("tanggal", "==", tanggal),
      where("shift", "==", shift)
    ));
    return !snap.empty;
  },

  async saveSetoran(setoran) {
    const docRef = await addDoc(collection(db, "setoran"), {
      ...setoran,
      createdAt: new Date().toISOString()
    });
    return docRef.id;
  },

  async getSetoranByDate(tanggal) {
    const snap = await getDocs(query(
      collection(db, "setoran"),
      where("tanggal", "==", tanggal),
      orderBy("createdAt", "desc")
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getSetoranByRange(outlet, startDate, endDate) {
    let constraints = [
      where("tanggal", ">=", startDate),
      where("tanggal", "<=", endDate),
      orderBy("tanggal", "desc")
    ];
    if (outlet !== "all") constraints.push(where("outlet", "==", outlet));
    const snap = await getDocs(query(collection(db, "setoran"), ...constraints));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async saveReport(report) {
    const docRef = await addDoc(collection(db, "laporan"), {
      ...report,
      createdAt: new Date().toISOString()
    });
    return docRef.id;
  },

  async getReports(outlet = "all", startDate = null, endDate = null) {
    let constraints = [orderBy("tanggal", "desc")];
    if (startDate) constraints.push(where("tanggal", ">=", startDate));
    if (endDate)   constraints.push(where("tanggal", "<=", endDate));
    if (outlet !== "all") constraints.push(where("outlet", "==", outlet));
    const snap = await getDocs(query(collection(db, "laporan"), ...constraints));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getSummary(reports) {
    const laporanDenganKas = reports.filter(r => r.kasAkhirAktual > 0);
    const totalSelisih = laporanDenganKas.reduce((s, r) => s + (r.selisihKas || 0), 0);
    return {
      totalOmset:       reports.reduce((s, r) => s + (r.omset || 0), 0),
      totalCash:        reports.reduce((s, r) => s + (r.cash || 0), 0),
      totalEdc:         reports.reduce((s, r) => s + (r.edc || 0), 0),
      totalGrab:        reports.reduce((s, r) => s + (r.grab || 0), 0),
      totalDiskon:      reports.reduce((s, r) => s + (r.diskon || 0), 0),
      totalPengeluaran: reports.reduce((s, r) => s + (r.totalPengeluaran || 0), 0),
      totalSelisihKas:  totalSelisih,
      jumlahLaporanKas: laporanDenganKas.length,
      count: reports.length
    };
  },

  getDailyTotals(reports) {
    const map = {};
    reports.forEach(r => { map[r.tanggal] = (map[r.tanggal] || 0) + (r.omset || 0); });
    return map;
  }
};
