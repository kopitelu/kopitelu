// Pengaturan & fungsi kirim Telegram — satu tempat untuk semua halaman.
// Mau memindah notifikasi ke topic lain? Ubah angka di TUJUAN di bawah saja.

const TG_TOKEN = '8613637829:AAERHEyn8KfJRcJIDra-w3h-kgYcS29WhMQ';
const CHAT_PRIBADI = '7202941698';      // chat merah (pribadi dengan bot)
const CHAT_GRUP    = '-1004291425176';  // grup hijau (Topics)

export const TUJUAN = {
  pribadi:     { chat_id: CHAT_PRIBADI },                    // laporan shift, ringkasan, dll
  serahterima: { chat_id: CHAT_GRUP, thread: 2 },            // topic Serah Terima Kas
  setoran:     { chat_id: CHAT_GRUP, thread: 3 },            // topic Setoran
  absensi:     { chat_id: CHAT_GRUP, thread: 8 }             // topic Absen
};

const polos = (s) => String(s).replace(/[*_`]/g, '');

async function kirim(body) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), keepalive: true
    });
    let j = {}; try { j = await r.json(); } catch (e) {}
    return { ok: r.ok && j.ok !== false, j };
  } catch (e) {
    return { ok: false, j: { description: String((e && e.message) || e) } };
  }
}

/**
 * Kirim pesan ke tujuan ('pribadi' | 'serahterima' | 'setoran' | 'absensi').
 * - Kalau Markdown ditolak, dikirim ulang sebagai teks biasa.
 * - Kalau gagal ke grup (mis. bot dikeluarkan), pesan dialihkan ke chat pribadi supaya tidak hilang.
 * Mengembalikan true kalau terkirim ke mana pun.
 */
export async function kirimTelegram(tujuan, teks) {
  const t = TUJUAN[tujuan] || TUJUAN.pribadi;
  const dasar = { chat_id: t.chat_id };
  if (t.thread) dasar.message_thread_id = t.thread;

  let res = await kirim({ ...dasar, text: teks, parse_mode: 'Markdown' });
  if (!res.ok) res = await kirim({ ...dasar, text: polos(teks) });

  if (!res.ok && t.chat_id !== CHAT_PRIBADI) {
    const alasan = (res.j && res.j.description) || 'ditolak';
    console.warn('Telegram ke grup gagal, dialihkan ke chat pribadi:', alasan);
    res = await kirim({ chat_id: CHAT_PRIBADI, text: `⚠️ (gagal ke grup: ${alasan})\n\n` + polos(teks) });
  }
  if (!res.ok) console.warn('Telegram gagal terkirim:', res.j);
  return res.ok;
}
