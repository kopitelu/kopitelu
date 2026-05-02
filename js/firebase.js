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
  },

  // Ambil laporan terakhir per outlet (untuk cek kas terkini)
  async getLastLaporan(outlet) {
    const snap = await getDocs(query(
      collection(db, "laporan"),
      where("outlet", "==", outlet),
      orderBy("tanggal", "desc"),
      orderBy("createdAt", "desc")
    ));
    if (snap.empty) return null;
    // Ambil yang kasAkhirAktual ada
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return docs.find(d => d.kasAkhirAktual > 0) || docs[0];
  },

  // Hitung total setoran setelah laporan terakhir per outlet
  async getSetoranSetelah(outlet, tanggal, createdAt) {
    const snap = await getDocs(query(
      collection(db, "setoran"),
      where("outlet", "==", outlet),
      where("tanggal", ">=", tanggal),
      orderBy("tanggal", "asc")
    ));
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Filter setoran yang dibuat SETELAH laporan terakhir
    return all.filter(s => s.createdAt >= createdAt);
  },

  // Status kas terkini per outlet — pakai kas teoritis jika kas aktual tidak ada
  async getKasStatus(outlets) {
    const results = [];
    for (const outlet of outlets) {
      try {
        // Ambil semua laporan outlet, urutkan manual
        const snap = await getDocs(query(
          collection(db, "laporan"),
          where("outlet", "==", outlet.id),
          orderBy("tanggal", "desc")
        ));
        if (snap.empty) {
          results.push({ outlet: outlet.id, outletNama: outlet.nama, status: 'nodata' });
          continue;
        }

        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Urutkan: tanggal terbaru dulu, lalu shift terbaru (Sore > Middle > Pagi)
        const SHIFT_ORDER = { Sore: 0, Middle: 1, Pagi: 2 };
        docs.sort((a, b) => {
          if (b.tanggal !== a.tanggal) return b.tanggal.localeCompare(a.tanggal);
          return (SHIFT_ORDER[a.shift] ?? 9) - (SHIFT_ORDER[b.shift] ?? 9);
        });
        // Cari laporan terbaru yang ada kasAkhirAktual
        const lastWithKas = docs.find(d => d.kasAkhirAktual > 0);
        // Kalau tidak ada kas aktual, pakai kas teoritis dari laporan terbaru
        const lastLaporan = lastWithKas || docs[0];
        const kasAkhir = lastWithKas
          ? lastWithKas.kasAkhirAktual
          : (docs[0].kasAkhirTeoritis || (docs[0].startingCash || 0) + (docs[0].cash || 0) - (docs[0].totalPengeluaran || 0));

        // Ambil semua setoran outlet
        const setoranSnap = await getDocs(query(
          collection(db, "setoran"),
          where("outlet", "==", outlet.id)
        ));
        const setorans = setoranSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Filter setoran setelah tanggal laporan terakhir
        const relevantSetorans = setorans.filter(s => s.tanggal >= lastLaporan.tanggal);
        const totalSetoran = relevantSetorans.reduce((s, r) => s + (r.nominal || 0), 0);
        const sisaKas = kasAkhir - totalSetoran;
        const isAktual = !!lastWithKas;

        results.push({
          outlet: outlet.id,
          outletNama: outlet.nama,
          kasAkhir,
          totalSetoran,
          sisaKas,
          tanggal: lastLaporan.tanggal,
          shift: lastLaporan.shift,
          isAktual,
          status: 'ok'
        });
      } catch(e) {
        console.warn('getKasStatus error for', outlet.id, e);
        results.push({ outlet: outlet.id, outletNama: outlet.nama, status: 'error', errorMsg: e.message });
      }
    }
    return results;
  }
};
