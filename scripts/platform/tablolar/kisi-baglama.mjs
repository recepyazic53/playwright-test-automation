// KİŞİ ALANLARINI TABLOYA BAĞLAMA (Ekran > Test verisi > "Kişi alanlarını tabloya bağla…"). Ekran modelindeki kişi / kimlik alanları
// (kimlik no, vergi no, pasaport, doğum tarihi, telefon, e-posta, ad, soyad, ad soyad — genel desenler + alan tipi) uygun kişi / kayıt
// tablosunun sütunlarına bağlanmak üzere ÖNERİLİR (tahmin değil: kullanıcı sütun eşlemesini onaylar); ardından senaryolardaki düz
// değerler tablo satırına çevrilir. Karar kullanıcınındır: önizleme gösterilir, onay olmadan hiçbir şey yazılmaz.
//   · Senaryo başına (ortam başına) kişinin bağlanan alanlarındaki düz değerler: tabloda HEPSİNİ tutan satır varsa "eşleşti" (o satır);
//     hiçbiri tabloda yoksa "yeni satır" önerisi (satır adı önerisi senaryo başlığından — değerden üretilmez; ortama özel seçimi);
//     değerler tabloda farklı satırlara dağılıyorsa (ör. telefon bir satırda, e-posta başka satırda) "atlandı: kişinin alanları aynı
//     satırda değil" — bir kişinin alanları aynı satırdan gelmelidir.
//   · Çeviri mevcut dönüşümle yapılır (ekran-donusumu.mjs): ${Tablo.Sütun} + gerekirse satır seçimi; KURU DOĞRULAMA orada: koşuda
//     ekrana giden değer her ortamda eskisiyle aynı değilse o alan atlanır (nedeniyle).
//   · Önizlemede değer GÖSTERİLMEZ (yalnız "eşleşti / yeni satır / atlandı: neden"); gizli sütuna yazılacak değer şifreli saklanır.
//   · Onay → bağlar + yeni satırlar + senaryolar TEK işlemde; değişiklik geçmişine kayıt. kimlikProfili alanları (hazır profil / kimlik
//     nesnesi) tablo başvurusu almadığından listelenir ama bağlanmaz.
//   · Aynı türden ikinci kişi alanı (ör. ikinci telefon, "ettiren / ödeyen" ön ekli alanlar, ayrı bölümdeki kişiler) ayrı ETİKETLE
//     bağlanmak üzere önerilir (bağ etiketi: ${Tablo[etiket].Sütun}; her etiket kendi satırından gelir). Etiket alanın ya da bölümün
//     adından türetilir (ör. "Ödeyen telefon" → "ödeyen"); kullanıcı değiştirebilir (etiketler). Tek kişilik ekranda etiket önerilmez.
import { DepoHatasi, gecmisYaz, ortamlariListele, ekranlariListele, ortamGetir } from '../veritabani/depo.mjs';
import { acikAnahtar, zarflariCoz } from '../kasa.mjs';
import { modelBaglami, veriGudumluMu } from '../senaryolar/senaryo-servisi.mjs';
import { modelSenaryosuMu } from '../senaryolar/model-kosusu.mjs';
import { formSemasiOlustur, tumFormAlanlari } from '../senaryolar/model-formu.mjs';
import { tabloKaydet, tablolariListele, BAGLAM_ONEKI } from './tablo-deposu.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet, tabloEkranKullanimi } from './ekran-baglari.mjs';
import { ekranTabloDonusumu } from './ekran-donusumu.mjs';
import { modelAlanlari, alanEtiketi } from './paket-tablolari.mjs';
import { degerBasvurusu } from './tablo-secimi.mjs';
import { baslikNormal, tabloTuru } from './tablo-benzerligi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, any>} Nesne */

/** Kişi alanı kategorileri (genel desenler; normal ad üzerinde). Sıra önemlidir (özelden genele). */
const KATEGORILER = /** @type {const} */ ([
  ['vergiNo', 'Vergi no', /(vergi(no|numarasi|kimlik)|vkn|taxno|taxid)/],
  ['pasaportNo', 'Pasaport no', /(pasaport|passport)/],
  ['kimlikNo', 'Kimlik no', /(tckimlik|kimlikno|kimliknumarasi|tckn|tcno|nationalid|identityno|identitynumber|^kimlik$)/],
  ['dogumTarihi', 'Doğum tarihi', /(dogumtarihi|dogumgunu|birthdate|dateofbirth|^dob$|^dogum$)/],
  ['telefon', 'Telefon', /(telefon|ceptel|gsm|mobile|phone|^tel$|telno)/],
  ['eposta', 'E-posta', /(eposta|email|^mail$|epostaadresi)/],
  ['adSoyad', 'Ad soyad', /(adsoyad|adisoyadi|fullname|adsoyadi)/],
  ['soyad', 'Soyad', /(soyad|soyadi|surname|lastname)/],
  ['ad', 'Ad', /^(ad|adi|isim|firstname|name|musteriadi|kisiadi)$/]
]);

/**
 * Alanın kişi kategorisi (id, etiket ya da senaryo anahtarından; telefon / tarih tipi yardımcıdır). Bulunamazsa null.
 * @param {{ id?: string; etiket?: string; anahtar?: string; tip?: string }} a
 * @returns {{ kategori: string; ad: string } | null}
 */
export function kisiKategorisi(a) {
  for (const ham of [a.etiket, a.anahtar, a.id]) {
    const n = baslikNormal(ham);
    if (!n) continue;
    for (const [kategori, ad, desen] of KATEGORILER) {
      if (!desen.test(n)) continue;
      if (kategori === 'dogumTarihi' && a.tip && !['tarih', 'metin'].includes(a.tip)) continue;
      return { kategori, ad };
    }
  }
  if (a.tip === 'telefon') return { kategori: 'telefon', ad: 'Telefon' };
  return null;
}

/** Etiket türetirken atılan genel sözcükler (normal biçim; kategori sözcükleri ayrıca atılır). */
const DOLGU = new Set(['no', 'numara', 'numarasi', 'adres', 'adresi', 'bilgi', 'bilgisi', 'bilgileri', 'cep', 'gsm', 'sabit', 'kisi', 'kisinin', 'tc', 't', 'c', 'e',
  'posta', 'mail', 'kimlik', 'tarihi', 've', 'ile', 'alani', 'numarasi', 'telefonu', 'iletisim']);
export const KISI_ETIKETI = /^[\p{L}\p{N} _-]{1,40}$/u;

/**
 * Alanın (ya da bölümün) adından kişi etiketi: kategori ve genel sözcükler atılır, kalan sözcükler (ör. "Ödeyen telefon" → "ödeyen",
 * "İkinci telefon" → "ikinci"). Kalan yoksa ''.
 * @param {unknown} metin @returns {string}
 */
export function kisiEtiketiTuret(metin) {
  const kelimeler = String(metin ?? '').toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const kalan = kelimeler.filter((k) => {
    const n = baslikNormal(k);
    return n && !DOLGU.has(n) && !KATEGORILER.some(([, , d]) => d.test(n));
  });
  return kalan.join(' ').slice(0, 40).trim();
}

/**
 * Kişi alanlarının bağ etiketleri (öneri). Hiçbir kategoride birden çok alan yoksa hepsi '' (tek kişi). Varsa: alanın adından (yoksa,
 * kişiler farklı bölümlerdeyse bölüm adından) türeyen ön ek, iki ya da daha çok alanda geçiyorsa ya da alanın kategorisi tekrarlıyorsa
 * etiket olur; aynı etikette aynı kategori yine tekrarlıyorsa (ör. "Telefon", "Telefon 2") sonraki "kişi 2", "kişi 3"… olur.
 * @param {Array<{ alanId: string; etiket: string; kategori: string; bolum: string }>} alanlar @returns {Map<string, string>} alanId → etiket
 */
export function kisiEtiketleriOner(alanlar) {
  /** @type {Map<string, string>} */
  const sonuc = new Map(alanlar.map((a) => [a.alanId, '']));
  const kategoriSayisi = new Map();
  for (const a of alanlar) kategoriSayisi.set(a.kategori, (kategoriSayisi.get(a.kategori) ?? 0) + 1);
  if (![...kategoriSayisi.values()].some((n) => n > 1)) return sonuc;
  const bolumler = new Set(alanlar.map((a) => kisiEtiketiTuret(a.bolum)).filter(Boolean));
  const onek = new Map(alanlar.map((a) => [a.alanId, kisiEtiketiTuret(a.etiket) || (bolumler.size > 1 ? kisiEtiketiTuret(a.bolum) : '')]));
  const onekSayisi = new Map();
  for (const x of onek.values()) if (x) onekSayisi.set(x, (onekSayisi.get(x) ?? 0) + 1);
  /** @type {Set<string>} */
  const dolu = new Set();
  let kisiNo = 1;
  for (const a of alanlar) {
    const o = /** @type {string} */ (onek.get(a.alanId));
    let e = o && (onekSayisi.get(o) > 1 || kategoriSayisi.get(a.kategori) > 1) ? o : '';
    if (/^\d+$/.test(e)) e = `kişi ${e}`;
    while (dolu.has(`${e}|${a.kategori}`)) e = `kişi ${++kisiNo}`;
    dolu.add(`${e}|${a.kategori}`);
    sonuc.set(a.alanId, e);
  }
  return sonuc;
}

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const duz = (/** @type {unknown} */ v) => (typeof v === 'string' && v.trim() && !degerBasvurusu(v) ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);
const kucuk = (/** @type {unknown} */ x) => String(x ?? '').trim().toLocaleLowerCase('tr');

export const NEDENLER = Object.freeze({
  farkliSatirlar: 'kişinin alanları tabloda farklı satırlarda (bir kişinin alanları aynı satırdan gelmeli)',
  kismen: 'değerlerin bir kısmı tabloda bir satırla uyuşuyor, bir kısmı uyuşmuyor',
  deger: 'kişi alanlarında düz değer yok',
  baskaTablo: 'alan zaten başka bir tabloya bağlı',
  ayniKategori: 'bu kategoride aynı etiketle başka bir alan zaten eşlendi (ikinci kişiye farklı bir etiket verin)',
  kimlikProfili: 'kimlik profili alanı: değerler hazır profilden / kimlik nesnesinden gelir; tablo başvurusu almaz'
});

/**
 * Plan (ve onaylıysa uygulama).
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ ekranId: string; tabloId?: string | null; eslemeler?: Record<string, string>; yeniSatirlar?: Record<string, { ad?: string; ortamaOzel?: boolean; ekle?: boolean }>;
 *   etiketler?: Record<string, string>; onay?: boolean; secimler?: unknown; yapan?: string }} girdi
 *   eslemeler: alanId → sütun adı ('' = bağlama). Verilmezse öneri kullanılır (önizleme); onayda verilmesi gerekir.
 *   etiketler: alanId → kişi etiketi ('' = etiketsiz). Verilmezse öneri (kisiEtiketleriOner) kullanılır.
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean }} [secenekler]
 */
export function kisiAlanlariniBagla(vt, projeId, girdi, secenekler = {}) {
  acikAnahtar(vt);
  const ekran = ekranlariListele(vt, projeId).find((e) => e.id === girdi.ekranId);
  if (!ekran) throw new DepoHatasi('Ekran bulunamadı.');
  const mb = modelBaglami(vt, ekran.id, null);
  if (!mb) throw new DepoHatasi('Bu ekranın modeli yok.');
  const sema = formSemasiOlustur(mb.model, mb.altModeller);
  const formAlanlari = tumFormAlanlari(sema);
  /** Bölüm kimliği → bölüm başlığı (kişi etiketi önerisi için). */
  const bolumAdi = new Map(sema.adimlar.flatMap((a) => a.bolumler.map((b) => [b.id, b.baslik || a.baslik])));
  const baglar = ekranAlanBaglari(vt, ekran.id);
  const tablolar = tablolariListele(vt, projeId, { cozulsun: true }).filter((t) => !t.id.startsWith(BAGLAM_ONEKI));
  const ek = tabloEkranKullanimi(vt, projeId);
  const kayitTablolari = tablolar.filter((t) => tabloTuru(t, ek) === 'kayit');
  const ortamAdi = new Map(ortamlariListele(vt, projeId).map((o) => [o.id, o.ad]));

  // --- Kişi alanları ---
  /** @type {Array<{ alanId: string; anahtar: string; etiket: string; tip: string; kategori: string; kategoriAdi: string; hassas: boolean; bolum: string; bagli: { tablo: string; sutun: string; etiket?: string } | null }>} */
  const alanlar = [];
  /** @type {Array<{ alanId: string; etiket: string; neden: string }>} */
  const kimlikAlanlari = [];
  for (const [id, a] of modelAlanlari(mb.model)) {
    if (a.tip === 'kimlikProfili' && a.yapilandirma === 'senaryo') kimlikAlanlari.push({ alanId: id, etiket: alanEtiketi(a), neden: NEDENLER.kimlikProfili });
  }
  for (const fa of formAlanlari) {
    if (!fa.anahtar || !['metin', 'tarih', 'telefon', 'sayi'].includes(fa.tip)) continue;
    const k = kisiKategorisi({ id: String(fa.id), etiket: String(fa.etiket ?? ''), anahtar: String(fa.anahtar), tip: fa.tip });
    if (!k) continue;
    const b = baglar[String(fa.id)];
    alanlar.push({ alanId: String(fa.id), anahtar: String(fa.anahtar), etiket: String(fa.etiket ?? fa.id), tip: fa.tip, kategori: k.kategori, kategoriAdi: k.ad, hassas: fa.hassas === true,
      bolum: String(bolumAdi.get(String(fa.bolumId ?? '')) ?? ''), bagli: b ? { tablo: b.tablo, sutun: b.sutun, ...(b.etiket ? { etiket: b.etiket } : {}) } : null });
  }
  // Kişi etiketleri: öneri ya da kullanıcının verdiği (aynı türden ikinci kişi ayrı satırdan gelsin).
  const etiketOnerisi = kisiEtiketleriOner(alanlar);
  /** @param {{ alanId: string }} a */
  const kisiEtiketi = (a) => {
    const v = girdi.etiketler && Object.hasOwn(girdi.etiketler, a.alanId) ? String(girdi.etiketler[a.alanId] ?? '').trim() : /** @type {string} */ (etiketOnerisi.get(a.alanId));
    if (v && !KISI_ETIKETI.test(v)) throw new DepoHatasi(`"${v}" etiketi geçersiz (harf, rakam, boşluk, "_", "-"; en çok 40).`);
    return v;
  };

  // --- Tablo önerisi: kişi alanlarının kategorilerini en çok karşılayan kişi / kayıt tablosu ---
  const sutunKategorisi = (/** @type {{ ad: string }} */ s) => kisiKategorisi({ etiket: s.ad })?.kategori ?? null;
  const puan = (/** @type {import('./tablo-deposu.mjs').Tablo} */ t) => new Set(alanlar.map((a) => a.kategori).filter((k) => t.sutunlar.some((s) => sutunKategorisi(s) === k))).size;
  const adaylar = kayitTablolari.map((t) => ({ id: t.id, ad: t.ad, puan: puan(t) })).filter((x) => x.puan > 0).sort((a, b) => b.puan - a.puan);
  const tabloId = girdi.tabloId && kayitTablolari.some((t) => t.id === girdi.tabloId) ? girdi.tabloId : adaylar[0]?.id ?? null;
  if (girdi.tabloId && tabloId !== girdi.tabloId) throw new DepoHatasi('Seçilen tablo bulunamadı (kişi / kayıt tablosu olmalı).');
  const tablo = tabloId ? /** @type {import('./tablo-deposu.mjs').Tablo} */ (tablolar.find((t) => t.id === tabloId)) : null;

  // --- Sütun eşleme (öneri → kullanıcı onayı) ---
  /** @type {Set<string>} */
  const kullanilanKategori = new Set();
  const eslemeSatirlari = alanlar.map((a) => {
    let e = kisiEtiketi(a);
    const oneri = tablo ? tablo.sutunlar.find((s) => sutunKategorisi(s) === a.kategori) ?? tablo.sutunlar.find((s) => baslikNormal(s.ad) === baslikNormal(a.etiket)) : undefined;
    const verilen = girdi.eslemeler && Object.hasOwn(girdi.eslemeler, a.alanId) ? String(girdi.eslemeler[a.alanId] ?? '') : undefined;
    let sutun = verilen === undefined ? oneri?.ad ?? '' : verilen;
    /** @type {string | undefined} */
    let neden;
    if (sutun && tablo && !tablo.sutunlar.some((s) => s.ad === sutun)) throw new DepoHatasi(`"${sutun}" sütunu "${tablo.ad}" tablosunda yok.`);
    if (a.bagli && tablo && a.bagli.tablo !== tablo.id) { neden = NEDENLER.baskaTablo; sutun = ''; }
    else if (a.bagli && tablo && a.bagli.tablo === tablo.id) { sutun = a.bagli.sutun; e = a.bagli.etiket ?? ''; }
    else if (sutun && kullanilanKategori.has(`${e}|${a.kategori}`)) { neden = NEDENLER.ayniKategori; sutun = ''; }
    if (sutun) kullanilanKategori.add(`${e}|${a.kategori}`);
    const { bolum: _b, ...kalan } = a;
    return { ...kalan, kisiEtiketi: e, ...(etiketOnerisi.get(a.alanId) ? { onerilenEtiket: etiketOnerisi.get(a.alanId) } : {}),
      onerilen: oneri?.ad ?? null, sutun, zatenBagli: Boolean(a.bagli && tablo && a.bagli.tablo === tablo.id), ...(neden ? { neden } : {}) };
  });
  const eslenen = eslemeSatirlari.filter((a) => a.sutun);

  // --- Senaryolar: eşleşen satır / yeni satır / atlanan ---
  /** @type {Array<{ anahtar: string; senaryoId: string; senaryo: string; kisiEtiketi: string; ortamlar: string[]; durum: 'eslesti' | 'yeniSatir' | 'atlandi'; satir?: string; onerilenAd?: string; ortamaOzel?: boolean; neden?: string; alanlar: string[] }>} */
  const senaryolar = [];
  /** @type {Array<{ anahtar: string; ad: string; ortamId: string | null; degerler: Record<string, string> }>} */
  const yeniSatirlar = [];
  if (tablo && eslenen.length) {
    const gorunur = (/** @type {{ ortamId: string | null }} */ r, /** @type {string} */ o) => !r.ortamId || r.ortamId === o;
    const kullanilanAdlar = new Set(tablo.satirlar.map((r) => kucuk(r.ad)));
    const kisiler = [...new Set(eslenen.map((a) => a.kisiEtiketi))];
    for (const s of vt.tumu('SELECT id, baslik, icerik_json FROM senaryolar WHERE proje_id = ? AND ekran_id = ? ORDER BY baslik', [projeId, ekran.id])) for (const kisi of kisiler) {
      const eslenenK = eslenen.filter((a) => a.kisiEtiketi === kisi);
      const icerik = /** @type {Nesne} */ (JSON.parse(String(s.icerik_json)));
      if (!modelSenaryosuMu(icerik) || !veriGudumluMu(icerik) || !nesneMi(icerik.ortamlar)) continue;
      const ortamlar = /** @type {Record<string, Nesne>} */ (icerik.ortamlar);
      const oIdleri = Object.keys(ortamlar).filter((o) => nesneMi(ortamlar[o]) && nesneMi(ortamlar[o].veri));
      /** @type {Map<string, { ortamlar: string[]; degerler: Record<string, string> }>} değer imzası → ortamlar */
      const kumeler = new Map();
      for (const o of oIdleri) {
        const veri = /** @type {Nesne} */ (zarflariCoz(vt, ortamlar[o].veri));
        /** @type {Record<string, string>} */
        const degerler = {};
        for (const a of eslenenK) { const v = duz(veri[a.anahtar]); if (v !== null) degerler[a.sutun] = v; }
        if (!Object.keys(degerler).length) continue;
        const imza = JSON.stringify(Object.entries(degerler).sort());
        const k = kumeler.get(imza) ?? { ortamlar: [], degerler };
        k.ortamlar.push(o);
        kumeler.set(imza, k);
      }
      const coklu = kumeler.size > 1;
      for (const k of kumeler.values()) {
        const anahtar = `${String(s.id)}${kisi ? `#${kisi}` : ''}|${coklu ? k.ortamlar.join(',') : '*'}`;
        const ortak = { anahtar, senaryoId: String(s.id), senaryo: String(s.baslik), kisiEtiketi: kisi, ortamlar: k.ortamlar.map((o) => ortamAdi.get(o) ?? o),
          alanlar: eslenenK.filter((a) => k.degerler[a.sutun] !== undefined).map((a) => a.etiket) };
        const esit = (/** @type {import('./tablo-deposu.mjs').TabloSatiri} */ r, /** @type {string} */ c) => String(r.degerler[c] ?? '').trim() === k.degerler[c];
        const sutunlar = Object.keys(k.degerler);
        const tam = k.ortamlar.map((o) => tablo.satirlar.find((r) => gorunur(r, o) && sutunlar.every((c) => esit(r, c))));
        if (tam.every(Boolean)) { senaryolar.push({ ...ortak, durum: 'eslesti', satir: [...new Set(tam.map((r) => r?.ad))].join(', ') }); continue; }
        const herBiriVar = sutunlar.every((c) => tablo.satirlar.some((r) => esit(r, c)));
        const kismi = tablo.satirlar.some((r) => sutunlar.some((c) => esit(r, c)));
        if (herBiriVar && sutunlar.length > 1) { senaryolar.push({ ...ortak, durum: 'atlandi', neden: NEDENLER.farkliSatirlar }); continue; }
        if (kismi) { senaryolar.push({ ...ortak, durum: 'atlandi', neden: NEDENLER.kismen }); continue; }
        const karar = girdi.yeniSatirlar?.[anahtar];
        const ortamaOzel = coklu || karar?.ortamaOzel === true;
        const kok = `${String(s.baslik)} — ${kisi || 'kişi'}`;
        let ad = (karar?.ad ?? '').trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, 120) || kok.slice(0, 120);
        for (let n = 2; kullanilanAdlar.has(kucuk(ad)); n++) ad = `${kok} ${n}`.slice(0, 120);
        kullanilanAdlar.add(kucuk(ad));
        senaryolar.push({ ...ortak, durum: karar?.ekle === false ? 'atlandi' : 'yeniSatir', onerilenAd: ad, ortamaOzel, ...(karar?.ekle === false ? { neden: 'yeni satır eklenmesin seçildi' } : {}) });
        if (karar?.ekle === false) continue;
        for (const o of ortamaOzel ? k.ortamlar : [null]) yeniSatirlar.push({ anahtar, ad: ortamaOzel && k.ortamlar.length > 1 ? `${ad} · ${ortamAdi.get(/** @type {string} */ (o)) ?? o}`.slice(0, 120) : ad, ortamId: o, degerler: k.degerler });
      }
    }
  }

  const onizleme = {
    ekran: { id: ekran.id, ad: ekran.ad },
    tablolar: adaylar, tabloId, tabloAdi: tablo?.ad ?? null,
    sutunlar: tablo ? tablo.sutunlar.map((s) => ({ ad: s.ad, gizli: s.gizli })) : [],
    alanlar: eslemeSatirlari.map(({ bagli: _b, ...x }) => x), kimlikAlanlari,
    senaryolar,
    ozet: { alan: eslenen.length, eslesti: senaryolar.filter((x) => x.durum === 'eslesti').length, yeniSatir: senaryolar.filter((x) => x.durum === 'yeniSatir').length, atlandi: senaryolar.filter((x) => x.durum === 'atlandi').length }
  };
  if (!tablo || !eslenen.length) return { onizleme: { ...onizleme, donusum: [] } };

  // --- Deneme / uygulama: bağlar + yeni satırlar + dönüşüm (kuru doğrulama dönüşümde) ---
  const GERI_AL = Symbol('geri-al');
  /** @type {any} */
  let sonuc = null;
  try {
    vt.islem(() => {
      const yeniBaglar = { ...baglar };
      for (const a of eslenen) yeniBaglar[a.alanId] = { tablo: tablo.id, sutun: a.sutun, ...(a.kisiEtiketi ? { etiket: a.kisiEtiketi } : {}) };
      ekranAlanBaglariniKaydet(vt, projeId, ekran.id, yeniBaglar);
      if (yeniSatirlar.length) {
        tabloKaydet(vt, {
          projeId, id: tablo.id, ad: tablo.ad, sutunlar: tablo.sutunlar.map((s) => ({ ad: s.ad, eskiAd: s.ad, gizli: s.gizli })),
          satirlar: yeniSatirlar.map((r) => ({ ad: r.ad, ortamId: r.ortamId, degerler: r.degerler })), ortamVar: (id) => Boolean(ortamGetir(vt, id))
        });
      }
      const kisiAnahtarlari = new Set(eslenen.map((a) => a.anahtar));
      const plan = ekranTabloDonusumu(vt, projeId, { ekranId: ekran.id }, secenekler);
      const donusum = ('onizleme' in plan ? plan.onizleme : plan).satirlar.filter((x) => kisiAnahtarlari.has(x.alan))
        .map((x) => ({ anahtar: x.anahtar, senaryoId: x.senaryoId, senaryo: x.senaryo, alan: x.alan, alanEtiketi: x.alanEtiketi, durum: x.durum, gizli: x.gizli, ...(x.neden ? { neden: x.neden } : {}), satirSecimiEklenir: Boolean(x.satirSecimi) }));
      const tam = { ...onizleme, donusum };
      if (!girdi.onay) { sonuc = { onizleme: tam }; throw GERI_AL; }
      const istenen = new Set((Array.isArray(girdi.secimler) ? girdi.secimler : []).filter(nesneMi).map((x) => `${/** @type {Nesne} */ (x).senaryoId}|${/** @type {Nesne} */ (x).alan}`));
      const secilen = donusum.filter((x) => x.durum === 'cevrilecek' && (!istenen.size || istenen.has(x.anahtar)));
      /** @type {any} */
      let yazim = { guncellenenSenaryo: 0, cevrilenAlan: 0 };
      if (secilen.length) yazim = ekranTabloDonusumu(vt, projeId, { ekranId: ekran.id, onay: true, secimler: secilen.map((x) => ({ senaryoId: x.senaryoId, alan: x.alan })), yapan: girdi.yapan }, secenekler);
      gecmisYaz(vt, { varlikTuru: 'kisi_baglama', varlikId: ekran.id, islem: 'guncelle', yapan: girdi.yapan,
        aciklama: `Kişi alanları "${tablo.ad}" tablosuna bağlandı: ${eslenen.length} alan, ${yeniSatirlar.length} yeni satır, ${yazim.cevrilenAlan} senaryo değeri tabloya çevrildi.`,
        sonraki: { tablo: tablo.id, alanlar: eslenen.map((a) => a.alanId), yeniSatir: yeniSatirlar.length } });
      sonuc = { uygulandi: true, baglanan: eslenen.length, eklenenSatir: yeniSatirlar.length, guncellenenSenaryo: yazim.guncellenenSenaryo, cevrilenAlan: yazim.cevrilenAlan, onizleme: tam };
    });
  } catch (e) {
    if (e !== GERI_AL) throw e;
  }
  return sonuc;
}
