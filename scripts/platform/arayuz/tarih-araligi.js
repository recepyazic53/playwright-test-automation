// Tarih aralığı süzgeci (ORTAK bileşen): başlangıç–bitiş (tarih + saat) ve hızlı seçimler (Son 1 saat, Bugün, Son 7 gün,
// Son 15 gün, Son 30 gün, Tümü). Sonuçlar (ekran / servis), hata kalıpları ve servis Raporlar sekmesi kullanır.
// Değer: { hizli: '1s' | 'bugun' | '7g' | '15g' | '30g' | 'tumu' } ya da { baslangic?: ISO, bitis?: ISO } (elle aralık).
// Hızlı seçim her kullanımda "şimdi"ye göre yeniden çözülür (araligiCoz). Seçim oturum boyunca korunur (sessionStorage;
// sekme kapanınca unutulur). Bitiş başlangıçtan önceyse alan hatası gösterilir, süzgeç uygulanmaz.
import { alan, alanHatasi, h, ikon, yeniKimlik } from './ortak.js';

export const HIZLI_SECIMLER = Object.freeze([
  ['1s', 'Son 1 saat'], ['bugun', 'Bugün'], ['7g', 'Son 7 gün'], ['15g', 'Son 15 gün'], ['30g', 'Son 30 gün'], ['tumu', 'Tümü']
]);
/** Sonuçlar ekranlarının (ekran + servis + hata kalıpları) ortak oturum anahtarı. */
export const SONUC_ARALIGI = 'platform.sonucAraligi';
const TUMU = Object.freeze({ hizli: 'tumu' });
const SAAT_MS = 3_600_000;
const GUN_MS = 24 * SAAT_MS;

const iki = (n) => String(n).padStart(2, '0');
/** ISO → datetime-local değeri (yerel saat, "YYYY-AA-GGTSS:DD"). */
function yerelDeger(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return `${t.getFullYear()}-${iki(t.getMonth() + 1)}-${iki(t.getDate())}T${iki(t.getHours())}:${iki(t.getMinutes())}`;
}
/** datetime-local değeri → ISO (boş / geçersiz → null). */
function isoDeger(yerel) {
  if (!yerel) return null;
  const t = new Date(yerel);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}
const kisa = (iso) => { const t = new Date(iso); return `${iki(t.getDate())}.${iki(t.getMonth() + 1)}.${t.getFullYear()} ${iki(t.getHours())}:${iki(t.getMinutes())}`; };

/** Değeri doğrular (bilinmeyen biçim → Tümü). */
function temizle(d) {
  if (d && typeof d === 'object') {
    if (HIZLI_SECIMLER.some(([a]) => a === d.hizli)) return { hizli: d.hizli };
    const baslangic = typeof d.baslangic === 'string' && !Number.isNaN(Date.parse(d.baslangic)) ? d.baslangic : null;
    const bitis = typeof d.bitis === 'string' && !Number.isNaN(Date.parse(d.bitis)) ? d.bitis : null;
    if ((baslangic || bitis) && !(baslangic && bitis && bitis < baslangic)) return { ...(baslangic ? { baslangic } : {}), ...(bitis ? { bitis } : {}) };
  }
  return { ...TUMU };
}

/** Hızlı seçimi / elle aralığı { baslangic, bitis } ISO'ya çevirir (null = sınırsız). */
export function araligiCoz(deger, simdi = new Date()) {
  const d = temizle(deger);
  const n = simdi.getTime();
  switch (d.hizli) {
    case 'tumu': return { baslangic: null, bitis: null };
    case '1s': return { baslangic: new Date(n - SAAT_MS).toISOString(), bitis: null };
    case 'bugun': { const g = new Date(simdi); g.setHours(0, 0, 0, 0); return { baslangic: g.toISOString(), bitis: null }; }
    case '7g': return { baslangic: new Date(n - 7 * GUN_MS).toISOString(), bitis: null };
    case '15g': return { baslangic: new Date(n - 15 * GUN_MS).toISOString(), bitis: null };
    case '30g': return { baslangic: new Date(n - 30 * GUN_MS).toISOString(), bitis: null };
    default: return { baslangic: d.baslangic ?? null, bitis: d.bitis ?? null };
  }
}

/** Sorgu dizesine baslangic / bitis ekler (sunucu uçları bu adları kullanır). */
export function araligiSorguyaEkle(sorgu, deger) {
  const c = araligiCoz(deger);
  if (c.baslangic) sorgu.set('baslangic', c.baslangic);
  if (c.bitis) sorgu.set('bitis', c.bitis);
  return sorgu;
}

/** ISO zaman aralıkta mı (istemci tarafı süzme; zaman yoksa aralık sınırsızsa geçer). */
export function araliktaMi(iso, deger) {
  const c = araligiCoz(deger);
  if (!c.baslangic && !c.bitis) return true;
  if (!iso) return false;
  return (!c.baslangic || iso >= c.baslangic) && (!c.bitis || iso <= c.bitis);
}

/** Kısa açıklama: "Son 7 gün", "24.09.2026 10:00 → 25.09.2026 12:00", "Tüm zamanlar". */
export function aralikMetni(deger) {
  const d = temizle(deger);
  if (d.hizli === 'tumu') return 'Tüm zamanlar';
  if (d.hizli) return (HIZLI_SECIMLER.find(([a]) => a === d.hizli) || [])[1];
  if (d.baslangic && d.bitis) return `${kisa(d.baslangic)} → ${kisa(d.bitis)}`;
  return d.baslangic ? `${kisa(d.baslangic)} sonrası` : `${kisa(d.bitis)} öncesi`;
}

/** Oturumda saklanan seçim (yoksa varsayılan: Tümü). */
export function kayitliAralik(anahtar = SONUC_ARALIGI) {
  try { return temizle(JSON.parse(sessionStorage.getItem(anahtar) || 'null')); } catch { return { ...TUMU }; }
}
export function araligiKaydet(deger, anahtar = SONUC_ARALIGI) {
  try { sessionStorage.setItem(anahtar, JSON.stringify(temizle(deger))); } catch { /* yok sayılır */ }
}

/**
 * Süzgeç bileşeni. degisti(yeniDeger) yalnız geçerli seçimde çağrılır; seçim (anahtar verilirse) oturumda saklanır.
 * @param {{ deger?: object; degisti: (d: object) => void; anahtar?: string | null; etiket?: string }} secenek
 */
export function tarihAraligiSecici(secenek) {
  let deger = temizle(secenek.deger ?? (secenek.anahtar === null ? TUMU : kayitliAralik(secenek.anahtar || SONUC_ARALIGI)));
  const onEk = yeniKimlik('aralik');
  const bas = h('input', { type: 'datetime-local', id: `${onEk}-bas` });
  const bit = h('input', { type: 'datetime-local', id: `${onEk}-bit` });
  let kok = null;
  const hizli = h('div', { class: 'segment tarih-hizli', role: 'group', 'aria-label': 'Hızlı seçim' });
  const alanlariDoldur = () => {
    const c = araligiCoz(deger);
    bas.value = yerelDeger(c.baslangic);
    bit.value = yerelDeger(c.bitis);
  };
  // Düğmeler bir kez oluşturulur; seçimde yalnız aria-pressed güncellenir (odak düğmede kalır).
  hizli.append(...HIZLI_SECIMLER.map(([a, metin]) => h('button', { type: 'button', 'data-aralik': a, onclick: () => sec({ hizli: a }) }, metin)));
  const hizliCiz = () => { for (const d of hizli.children) d.setAttribute('aria-pressed', d.getAttribute('data-aralik') === deger.hizli ? 'true' : 'false'); };
  const sec = (yeni, kaynak = 'hizli') => {
    bekleyenOdak = { kaynak, zaman: Date.now(), eski: kok };
    deger = temizle(yeni);
    alanHatasi(bit, '');
    if (secenek.anahtar !== null) araligiKaydet(deger, secenek.anahtar || SONUC_ARALIGI);
    hizliCiz();
    alanlariDoldur();
    secenek.degisti({ ...deger });
  };
  const uygula = () => {
    const b = isoDeger(bas.value);
    const s = isoDeger(bit.value);
    if (b && s && s < b) { alanHatasi(bit, 'Bitiş, başlangıçtan önce olamaz.'); bit.focus(); return; }
    alanHatasi(bit, '');
    sec(b || s ? { ...(b ? { baslangic: b } : {}), ...(s ? { bitis: s } : {}) } : TUMU, 'uygula');
  };
  for (const g of [bas, bit]) g.addEventListener('keydown', (o) => { if (o.key === 'Enter') { o.preventDefault(); uygula(); } });
  hizliCiz();
  alanlariDoldur();
  const uygulaDugmesi = h('button', { type: 'button', class: 'kucuk-dugme', onclick: uygula }, ikon('takvim'), 'Uygula');
  kok = h('div', { class: 'tarih-araligi', role: 'group', 'aria-label': secenek.etiket || 'Tarih aralığı' },
    hizli,
    h('div', { class: 'filtre-satiri tarih-alanlari' }, alan('Başlangıç', bas), alan('Bitiş', bit), uygulaDugmesi));
  odagiGeriVer(kok, () => (bekleyenOdak && bekleyenOdak.kaynak === 'uygula' ? uygulaDugmesi : hizli.querySelector('[aria-pressed="true"]')));
  return kok;
}

/**
 * Seçim sonrası ekran yeniden çizilirse (eski bileşen DOM'dan çıkar) odak yeni bileşendeki aynı denetime taşınır; klavye
 * kullanıcısı sayfanın başına düşmez. Eski bileşen yerinde kaldıysa (yeniden çizilmeyen ekran) odak taşınmaz; 5 sn geçerlidir.
 */
let bekleyenOdak = null;
function odagiGeriVer(kok, hedef) {
  if (!bekleyenOdak || Date.now() - bekleyenOdak.zaman > 5_000) return;
  let deneme = 0;
  const dene = () => {
    if (!bekleyenOdak) return;
    if (kok.isConnected && !bekleyenOdak.eski?.isConnected) { const el = hedef(); bekleyenOdak = null; el?.focus(); return; }
    if (++deneme < 120) requestAnimationFrame(dene);
  };
  requestAnimationFrame(dene);
}
