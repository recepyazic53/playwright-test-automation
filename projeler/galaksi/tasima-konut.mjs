// GALAKSİ — KODLU SENARYOLARI AKIŞA TAŞIMA: JetKonut ve JetİlkAteşKonut taşıyıcıları (akis-tasima.mjs'teki JetDASK
// taşıyıcısıyla aynı sözleşme: (YenidenKurulanVeri) → { kaynakEkran, taslaklar, notlar }).
// Kaynak matris: tests/scenarios/jet-konut/teklif-matrisi.spec.ts ve tests/scenarios/jet-ilk-ates-konut/teklif-matrisi.spec.ts
// — sigortalı (özel / tüzel) × sigorta ettiren (aynı / farklı özel / farklı tüzel) × sigortalı durumu (mal sahibi / kiracı)
// = 12 senaryo; hepsi "Teklif Kaydet" + kredi kartıyla öder. Başlıklar kodlu testlerinkiyle aynıdır.
// Kimlikler PROFİL ADIYLA yazılır; cep telefonu (akış ekranında kod + numara iki ayrı alan) profilden bölünür (POM gibi).
// Açılır listeler (seçenekleri pakette "bilinmiyor", gizli jqTransform olabilir) GÖRÜNEN METİNLE yazılır: koşucu görünür
// <select>'te önce değer, olmazsa metinle; jqTransform'da yalnızca metinle seçer.
// NOT: import.meta KULLANILMAZ.

import { TEKLIF_KAYDET_KABUL_EDILEN_SONUCLAR } from './odeme-akis.mjs';

/** @typedef {import('../index.d.mts').YenidenKurulanVeri} YenidenKurulanVeri */
/** @typedef {import('../index.d.mts').AkisSenaryoTaslagi} AkisSenaryoTaslagi */
/** @typedef {Record<string, any>} Nesne */
/** @typedef {(v: YenidenKurulanVeri) => { kaynakEkran: string; taslaklar: AkisSenaryoTaslagi[]; notlar: string[] }} Tasiyici */

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const metin = (/** @type {unknown} */ s) => (s === undefined || s === null ? '' : String(s));
/** Seçim verisi ({ deger, metin }) → görünen metin (yoksa değer). */
const secimMetni = (/** @type {unknown} */ s) => (nesneMi(s) ? String(/** @type {Nesne} */ (s).metin ?? /** @type {Nesne} */ (s).deger ?? '') : metin(s));
/** POM'daki evet / hayır eşlemesi: yalnızca tam "evet" (ya da "var") E'dir, gerisi H. */
const evetHayir = (/** @type {unknown} */ d, evet = 'evet', hayir = 'hayir') => (d === evet ? evet : hayir);

/** Ürün verisi (dosya adı + kök anahtar); yoksa açık hata (önizlemede görünür). */
function urunVerisi(/** @type {YenidenKurulanVeri} */ v, /** @type {string} */ dosya, /** @type {string} */ kok) {
  const d = v.dosyalar[dosya];
  const u = nesneMi(d) ? /** @type {Nesne} */ (d)[kok] : undefined;
  if (!nesneMi(u)) throw new Error(`"${dosya}" ürün verisi bu ortamda yok (kodlu testin verisi aktarılmamış).`);
  return /** @type {Nesne} */ (u);
}

const TIPLER = /** @type {const} */ ([['ozel', 'Özel'], ['tuzel', 'Tüzel']]);
const ETTIRENLER = /** @type {const} */ ([['ayni', 'Aynı'], ['ozel', 'Farklı Özel'], ['tuzel', 'Farklı Tüzel']]);
const DURUMLAR = /** @type {const} */ ([['malSahibi', 'Mal Sahibi'], ['kiraci', 'Kiracı']]);

/**
 * Kodlu testlerin ortak kişi matrisi: 12 senaryo, başlık + sigortalı / sigorta ettiren alanları (profil adıyla, telefon
 * profilden bölünerek) + sigortalı durumu. urunAlanlari: ürüne özgü alanlar (sigortalı durumuna göre).
 * @param {YenidenKurulanVeri} v @param {Nesne} u @param {(durum: 'malSahibi' | 'kiraci') => Nesne} urunAlanlari
 */
function kisiMatrisi(v, u, urunAlanlari) {
  const profiller = nesneMi(u.profiller) ? u.profiller : {};
  const kimlikler = nesneMi(v.ortak) && nesneMi(/** @type {Nesne} */ (v.ortak).kimlikBilgileri) ? /** @type {Nesne} */ (v.ortak).kimlikBilgileri : {};
  /** @type {string[]} */
  const eksikTelefon = [];
  /** Profil adı → { profil, kod, no } (POM: telefonun ilk 3 hanesi kod, kalanı numara). @param {'ozel' | 'tuzel'} tip @param {string} anahtar */
  const kisi = (tip, anahtar) => {
    const profil = metin(profiller[anahtar]);
    const k = nesneMi(kimlikler[tip]) ? kimlikler[tip][profil] : undefined;
    const tel = nesneMi(k) ? metin(k.cepTelefonu) : '';
    if (!tel && !eksikTelefon.includes(profil)) eksikTelefon.push(profil || anahtar);
    return { profil, kod: tel.slice(0, 3), no: tel.slice(3) };
  };
  /** @type {AkisSenaryoTaslagi[]} */
  const taslaklar = [];
  for (const [tip, tipMetni] of TIPLER) {
    const s = kisi(tip, tip === 'ozel' ? 'sigortaliOzel' : 'sigortaliTuzel');
    for (const [ettiren, ettirenMetni] of ETTIRENLER) {
      /** @type {Nesne} */
      const ettirenAlanlari = { sigortaEttiren: ettiren === 'ayni' ? 'ayni' : 'farkli' };
      if (ettiren !== 'ayni') {
        const e = kisi(ettiren, ettiren === 'ozel' ? 'farkliOzel' : 'farkliTuzel');
        Object.assign(ettirenAlanlari, { ettirenTipi: ettiren, ettirenTelefonKodu: e.kod, ettirenTelefonNo: e.no, ettirenProfili: e.profil });
      }
      for (const [durum, durumMetni] of DURUMLAR) {
        taslaklar.push({
          baslik: `Sigortalı ${tipMetni} / Sigorta Ettiren ${ettirenMetni} / Sigortalı Durumu ${durumMetni} Testi`,
          veri: {
            sigortaliTipi: tip, sigortaliTelefonKodu: s.kod, sigortaliTelefonNo: s.no, sigortaliProfili: s.profil,
            ...ettirenAlanlari, sigortaliDurumu: durum, ...urunAlanlari(durum), odemeAdimiDahil: true
          }
        });
      }
    }
  }
  /** @type {string[]} */
  const notlar = [];
  if (eksikTelefon.length) notlar.push(`Cep telefonu profilde bulunamadı (${eksikTelefon.join(', ')}): telefon kodu / numarası boş yazıldı.`);
  return { taslaklar, notlar };
}

/**
 * Kodlu testlerin ödeme sonucu: ortak.json > odeme.krediKarti.beklenenHataMesaji (ürüne özgü kabul listesi yok). Ödeme ortak
 * akışının başarı mesajları arasında yoksa akıştaki ödeme adımı bu sonuçla düşer.
 * @param {YenidenKurulanVeri} v
 */
function odemeNotu(v) {
  const kk = nesneMi(v.ortak) && nesneMi(/** @type {Nesne} */ (v.ortak).odeme) ? /** @type {Nesne} */ (v.ortak).odeme.krediKarti : undefined;
  const m = nesneMi(kk) ? metin(kk.beklenenHataMesaji) : '';
  const notlar = ['Kodlu testteki gibi her senaryoda ödeme dahil ("Ödeme (teklif kaydet + kredi kartı)" ortak akışı; yalnızca test ortamında koşar).'];
  // Ortak akışın başarı mesajları "içerir" eşleşmesiyle aranır (koşucudaki gibi).
  if (m && !TEKLIF_KAYDET_KABUL_EDILEN_SONUCLAR.some((x) => m.includes(x))) {
    notlar.push(`Kodlu testin kabul ettiği ödeme sonucu: “${m}” (ortak veri > kredi kartı > beklenen hata mesajı). Ödeme ortak akışının başarı mesajları (${TEKLIF_KAYDET_KABUL_EDILEN_SONUCLAR.map((x) => `“${x}”`).join(', ')}) arasında yok; ödeme adımı bu sonuçla düşer (ortak akışa "veya" mesajı olarak eklenmeli).`);
  }
  return notlar;
}

const LISTE_NOTU = 'Açılır listeler görünen metinle yazıldı (paket seçenekleri "bilinmiyor"; gizli jqTransform listede koşucu yalnızca metinle seçer, görünür <select>\'te önce değer sonra metin dener). Kodlu test değerle (value) seçiyordu; metin sayfadakiyle birebir değilse ya da "1" gibi kısa metinler sayfada başka öğelerle çakışırsa adım düşebilir.';

/** JetKonut: 2 sigortalı tipi × 3 sigorta ettiren × 2 sigortalı durumu; hepsi öder (tests/scenarios/jet-konut/teklif-matrisi.spec.ts). */
/** @type {Tasiyici} */
export function jetKonutTasiyici(v) {
  const u = urunVerisi(v, 'jet-konut', 'jetKonut');
  const t = nesneMi(u.teminatlar) ? u.teminatlar : {};
  const ortak = {
    adresKodu: metin(u.adresKodu),
    binaTipi: secimMetni(u.binaTipi), dainiMurtehin: evetHayir(u.dainiMurtehin, 'var', 'yok'),
    alternatifPlus: secimMetni(u.alternatifPlus), alternatif: secimMetni(u.alternatif), yapiTarzi: secimMetni(u.yapiTarzi),
    toplamKat: secimMetni(u.toplamKat), rizikonunBulunduguKat: secimMetni(u.rizikonunBulunduguKat), catiTipi: secimMetni(u.catiTipi),
    altmisGundenFazlaBos: evetHayir(u.altmisGundenFazlaBos), binaInsaYili: metin(u.binaInsaYili),
    esyaYangin: metin(t.esyaYangin), dahiliDekorasyonYangin: metin(t.dahiliDekorasyonYangin), camKirilmasi: metin(t.camKirilmasi),
    esyaDeprem: t.esyaDeprem === true, dahiliDekorasyonDeprem: t.dahiliDekorasyonDeprem === true,
    hirsizlik: t.hirsizlik === true, binaSabitKiymetHirsizlik: t.binaSabitKiymetHirsizlik === true,
    ferdiKazaTekLimit: secimMetni(t.ferdiKazaTekLimit), hukuksalKoruma: secimMetni(t.hukuksalKoruma), enflasyonOrani: secimMetni(t.enflasyonOrani)
  };
  // POM: brüt m², DASK'a bağlılık ve bina yangın bedeli yalnızca mal sahibinde girilir (paket de yalnızca mal sahibinde gösterir).
  const malSahibi = { brutYuzolcum: metin(u.brutYuzolcum), daskaBagli: evetHayir(u.daskaBagli), binaYangin: metin(t.binaYangin) };
  const { taslaklar, notlar } = kisiMatrisi(v, u, (durum) => (durum === 'malSahibi' ? { ...ortak, ...malSahibi } : { ...ortak }));
  notlar.unshift(...odemeNotu(v));
  notlar.push(LISTE_NOTU);
  notlar.push('Kodlu testin "#RiskFloor seçimi korundu" ve "Sonraki Adım" düğme metni denetimleri akışta yok (paketin bilinmeyenleri).');
  if (u.aktif === false) notlar.push('Ürün verisinde "aktif: false": kodlu testler bu ortamda atlanıyordu.');
  return { kaynakEkran: 'JetKonut', taslaklar, notlar };
}

/** JetİlkAteşKonut: 2 sigortalı tipi × 3 sigorta ettiren × 2 sigortalı durumu; hepsi öder (tests/scenarios/jet-ilk-ates-konut/teklif-matrisi.spec.ts). */
/** @type {Tasiyici} */
export function jetIlkAtesKonutTasiyici(v) {
  const u = urunVerisi(v, 'jet-ilk-ates-konut', 'jetIlkAtesKonut');
  const ortak = { adresKodu: metin(u.adresKodu), alternatif: secimMetni(u.alternatif), yapiTarzi: secimMetni(u.yapiTarzi), binaInsaYili: metin(u.binaInsaYili) };
  const { taslaklar, notlar } = kisiMatrisi(v, u, () => ({ ...ortak }));
  notlar.unshift(...odemeNotu(v));
  notlar.push(LISTE_NOTU);
  const bedeller = [u.esyaYanginBedeli ? `eşya yangın ${metin(u.esyaYanginBedeli)}` : '', u.ekTeminatBedeli ? `ek teminat ${metin(u.ekTeminatBedeli)}` : ''].filter(Boolean);
  if (bedeller.length) {
    notlar.push(`Kodlu test alternatif seçildikten sonra bedelleri denetliyordu (${bedeller.join(', ')}); akış paketinde bu denetim ve alanları yok — bu değerler taşınmadı.`);
  }
  if (u.aktif === false) notlar.push('Ürün verisinde "aktif: false": kodlu testler bu ortamda atlanıyordu.');
  return { kaynakEkran: 'JetİlkAteşKonut', taslaklar, notlar };
}
