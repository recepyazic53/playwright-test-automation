// GALAKSİ — JETKASKO KODLU SENARYOLARINI AKIŞA TAŞIMA ("JetKasko (akış)", projeler/galaksi/jetkasko-akis.mjs).
// Kaynak: tests/scenarios/jet-kasko/yeni-kayit.spec.ts — veri güdümlü: jet-kasko-yk.json > jetKaskoYk.senaryolar'ın her öğesi
// bir test (başlık = öğenin "baslik"ı); araç bilgileri jetKaskoYk.araclar[senaryo.arac] sözlüğünden gelir. Kodlu testte her
// senaryo öder (poliçeleştirme + kredi kartı; kabul edilen ödeme sonuçları veride). Kimlikler PROFİL ADIYLA yazılır.
// Kayıt: projeler/galaksi/akis-tasima.mjs > AKIS_TASIYICILARI['jet-kasko-akis'].
// NOT: import.meta KULLANILMAZ.

import { JETKASKO_URUNLERI } from './jetkasko-akis.mjs';

/** @typedef {import('../index.d.mts').YenidenKurulanVeri} YenidenKurulanVeri */
/** @typedef {import('../index.d.mts').AkisSenaryoTaslagi} AkisSenaryoTaslagi */
/** @typedef {import('./akis-tasima.mjs').Tasiyici} Tasiyici */
/** @typedef {Record<string, any>} Nesne */

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** Seçim verisi ({ deger, metin }) → senaryodaki değer (sayfadaki "value"). */
const deger = (/** @type {unknown} */ s) => (nesneMi(s) ? String(/** @type {Nesne} */ (s).deger ?? '') : s === undefined || s === null ? '' : String(s));

/** Kodlu verideki ürün (kısa kod "1"–"5" ya da tam ad) → akış paketinin kısa kodu; boşsa null (paket varsayılanı "4"). */
function urunKodu(/** @type {unknown} */ u) {
  if (typeof u !== 'string' || !u.trim()) return null;
  const s = u.trim();
  if (s in JETKASKO_URUNLERI) return s;
  const kod = Object.entries(JETKASKO_URUNLERI).find(([, ad]) => ad === s)?.[0];
  return kod ?? undefined;
}

/** JetKasko YK: senaryolar dizisinin her öğesi = bir kodlu test (araç × sigortalı tipi × sigorta ettiren; acente). */
/** @type {Tasiyici} */
export function jetKaskoTasiyici(v) {
  const d = v.dosyalar['jet-kasko-yk'];
  const u = nesneMi(d) ? /** @type {Nesne} */ (d).jetKaskoYk : undefined;
  if (!nesneMi(u)) throw new Error('"jet-kasko-yk" ürün verisi bu ortamda yok (kodlu testin verisi aktarılmamış).');
  const senaryolar = Array.isArray(u.senaryolar) ? u.senaryolar : [];
  const araclar = nesneMi(u.araclar) ? u.araclar : {};
  const acenteler = nesneMi(v.ortak.kullaniciDegistir) ? /** @type {Nesne} */ (v.ortak.kullaniciDegistir) : {};
  /** @type {AkisSenaryoTaslagi[]} */
  const taslaklar = [];
  const notlar = ['Kodlu testteki gibi her senaryoda ödeme dahil ("Ödeme (kredi kartı)" ortak akışı; JetKasko ödemeye #Policelestir ile geçer).'];
  /** @type {Set<string>} */
  const gorulen = new Set();
  /** @type {string[]} */
  const eksikArac = [];
  /** @type {string[]} */
  const bilinmeyenUrun = [];
  /** @type {string[]} */
  const indirimli = [];

  senaryolar.forEach((/** @type {unknown} */ ham, /** @type {number} */ sira) => {
    const s = nesneMi(ham) ? /** @type {Nesne} */ (ham) : {};
    // Başlık aktarımdakiyle aynı kuralla (tekrar eden başlık sıra numarasıyla ayrılır; yan yana karşılaştırma başlıktan eşleşir).
    let baslik = typeof s.baslik === 'string' && s.baslik ? s.baslik : `#${sira + 1}`;
    if (gorulen.has(baslik)) baslik = `${baslik} #${sira + 1}`;
    gorulen.add(baslik);

    const arac = nesneMi(araclar[s.arac]) ? /** @type {Nesne} */ (araclar[s.arac]) : null;
    if (!arac) eksikArac.push(`${baslik} (“${String(s.arac ?? '')}”)`);
    const a = arac ?? {};
    const ettirenFarkli = s.ettiren === 'farkliOzel' || s.ettiren === 'farkliTuzel';
    const acenteProfili = typeof s.acenteProfili === 'string' && s.acenteProfili ? s.acenteProfili : 'varsayilan';
    const acente = nesneMi(acenteler[acenteProfili]) ? /** @type {Nesne} */ (acenteler[acenteProfili]) : {};
    const yetkiliIndirimi = acente.yetkiliIndirimi === undefined || acente.yetkiliIndirimi === null ? '' : String(acente.yetkiliIndirimi);
    if (yetkiliIndirimi) indirimli.push(`${baslik} (${acenteProfili}: %${yetkiliIndirimi})`);
    const urun = urunKodu(s.urunAdi);
    if (urun === undefined) bilinmeyenUrun.push(`${baslik} (“${String(s.urunAdi)}”)`);

    /** @type {Nesne} */
    const veri = {
      sigortaliTipi: s.sigortaliTipi === 'tuzel' ? 'tuzel' : 'ozel',
      sigortaliProfili: String(s.sigortaliProfili ?? ''),
      plakaIlKodu: String(a.plakaIlKodu ?? ''),
      plakaNo: String(a.plakaNo ?? 'YK'),
      sigortaEttiren: ettirenFarkli ? 'farkli' : 'ayni',
      ...(ettirenFarkli ? { sigortaEttirenTipi: s.ettiren === 'farkliTuzel' ? 'tuzel' : 'ozel', sigortaEttirenProfili: String(s.ettirenProfili ?? '') } : {}),
      modelYili: String(a.modelYili ?? ''),
      markaKodu: String(a.markaKodu ?? ''),
      motorNo: String(a.motorNo ?? ''),
      sasiNo: String(a.sasiNo ?? ''),
      aracTipi: deger(a.aracTipi),
      sinif: deger(a.sinif),
      kullanim: deger(a.kullanim),
      ...(yetkiliIndirimi ? { yetkiliIndirimi } : {}),
      ...(urun ? { urun } : {}),
      acenteProfili,
      odemeAdimiDahil: true
    };
    taslaklar.push({ baslik, veri, aciklama: `jet-kasko-yk.json > senaryolar[${sira}] (araç: ${String(s.arac ?? '')})` });
  });

  if (!senaryolar.length) notlar.push('Ürün verisinde senaryo yok (jetKaskoYk.senaryolar boş).');
  if (eksikArac.length) notlar.push(`Araç sözlüğünde bulunmayan araç (araç alanları boş kalır, önizlemede hata verir): ${eksikArac.join(', ')}.`);
  if (bilinmeyenUrun.length) notlar.push(`Ürün kısa koda çevrilemedi (akış paketi yalnızca 1–5 kabul eder; ürün boş bırakıldı → varsayılan "4"): ${bilinmeyenUrun.join(', ')}.`);
  if (indirimli.length) {
    notlar.push(`"Yetkili indirimi %": kodlu test değeri acente profilinden okuyup alan KAPALIYSA atlıyordu; akış koşucusu kapalı alanı atlamaz. Değer yalnızca profilinde indirim tanımlı senaryolara yazıldı: ${indirimli.join(', ')}. Bu acentede alan kapalı gelirse adım düşer.`);
  }
  notlar.push('Tescil tarihi taşınmaz: akışta "bugün" olarak türetilir (kodlu testteki gibi).');
  if (u.aktif === false) notlar.push('Ürün verisinde "aktif: false": kodlu testler bu ortamda atlanıyordu.');
  const kabul = Array.isArray(u.kabulEdilenOdemeSonuclari) ? u.kabulEdilenOdemeSonuclari.filter((/** @type {unknown} */ x) => typeof x === 'string' && x) : [];
  if (kabul.length) {
    notlar.push(`Kodlu testin kabul ettiği ödeme sonuçları: ${kabul.map((/** @type {string} */ x) => `“${x}”`).join(', ')}. Ödeme ortak akışının başarı mesajları arasında yoksa ödeme adımı bu sonuçla düşer.`);
  }
  notlar.push('Kodlu testte beklenen hata senaryosu yok: "Beklenen sonuç" boş bırakıldı (başarılı akış; ödeme sonucu ortak akışta denetlenir).');
  return { kaynakEkran: 'JetKasko', taslaklar, notlar };
}
