// "GİRİŞİ KAYDET" (genel, saf) — "Akışı kaydet" altyapısıyla (tarama/kayit-motoru.ts) görünür tarayıcıda kullanıcının
// kendi yaptığı girişten GİRİŞ TARİFİ taslağı çıkarır. Kayıtta alan DEĞERLERİ yoktur: yalnızca dokunulan alanların yapısı
// (seçici, etiket, tür) ve basılan düğmeler (seçici, görünen metin), olay sırasıyla.
//
//   girisKaydiTaslagi(envanter)    olay sırasından adım listesi (alan / düğme) + her adım için ÖNERİ (kullanıcı adı, parola,
//                                  doğrulama kodu, ek alan; giriş düğmesi, ara tıklama, kod gönder). Öneri yalnızca başlangıç
//                                  seçimidir; KARAR kullanıcının (Nöbetçi'de her adımı işaretler).
//   kayittanTarif(taslak, isaretler, mevcut, girisYolu)
//                                  kullanıcının işaretlerinden ham tarif: özel adımlar (kullaniciAdi / parola / gonder) ve
//                                  aralarındaki ek alan / tıklama adımları (girisAdimlari; ek alanın değeri "{ad}" yer
//                                  tutucusuyla giriş profilinin ek alanından gelir), doğrulama kodu alanı → ikinci adım.
//                                  Mevcut tarifin başarı/hata göstergeleri, bağlam değiştirme ve süreleri KORUNUR. Tarif
//                                  KAYDEDİLMEZ: arayüz önizletir, kullanıcı tarif formunda kontrol edip kaydeder.
// NOT: import.meta KULLANILMAZ. Tipler: giris-kaydi.d.mts.

import { regexKacis, varsayilanGirisAdimlariMi } from './tarif.mjs';

export const ALAN_ROLLERI = Object.freeze(['kullaniciAdi', 'parola', 'kod', 'ek', 'yoksay']);
export const DUGME_ROLLERI = Object.freeze(['gonder', 'tikla', 'kodGonder', 'yoksay']);
/** Doğrulama kodunun kaynağı: Authenticator (TOTP), SMS sabit test kodu, SMS koşu sırasında elle girilir. */
export const KOD_KAYNAKLARI = Object.freeze(['totp', 'sabit', 'elle']);
const EK_ALAN_ADI = /^[\p{L}\p{N}_.-]{1,60}$/u;
const TR = /** @type {Record<string, string>} */ ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' });

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** @param {unknown} d @param {number} n */
const metin = (d, n) => (typeof d === 'string' && d.trim() ? d.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Etiketten ek alan adı önerisi ("Firma kodu" → "firmaKodu"). @param {string} etiket */
export function ekAlanAdiOner(etiket) {
  const kelimeler = String(etiket).toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, (c) => TR[c] ?? c).normalize('NFKD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 5);
  const ad = kelimeler.map((k, i) => (i ? k[0].toUpperCase() + k.slice(1) : k)).join('').slice(0, 40);
  if (!ad) return 'alan';
  return /^[a-z]/.test(ad) ? ad : `alan${ad}`.slice(0, 40);
}

/**
 * Kayıttan taslak adımlar. @param {import('../tarama/akis-tasarimi.d.mts').AkisEnvanteri} env
 * @returns {import('./giris-kaydi.d.mts').GirisTaslagi}
 */
export function girisKaydiTaslagi(env) {
  /** @type {Map<string, import('../tarama/paket-olusturucu.d.mts').HamAlan>} */
  const alanlar = new Map();
  for (const a of env.alanlar) if (nesneMi(a) && nesneMi(a.alan) && typeof a.alan.anahtar === 'string') alanlar.set(a.alan.anahtar, a.alan);
  /** @type {import('./giris-kaydi.d.mts').TaslakAdimi[]} */
  const adimlar = [];
  const eklenen = new Set();
  /** @type {string[]} */
  const yollar = [];
  const alanEkle = (/** @type {string[]} */ anahtarlar) => {
    for (const k of anahtarlar) {
      const alan = alanlar.get(k);
      if (!alan || eklenen.has(k)) continue;
      eklenen.add(k);
      adimlar.push({
        tur: 'alan', anahtar: k, etiket: metin(alan.etiket ?? alan.ad ?? '', 120) || k, alanTuru: alan.tur, secici: alan.secici, oneri: 'ek'
      });
    }
  };
  for (const o of env.olaylar) {
    if (o.tur === 'okuma') { alanEkle(o.okuma.dokunulan); if (o.okuma.yol) yollar.push(o.okuma.yol); }
    else if (o.tur === 'tik') {
      alanEkle(o.oncesi.dokunulan);
      if (o.oncesi.yol) yollar.push(o.oncesi.yol);
      const d = env.dugmeler[o.dugme];
      if (d && typeof d.secici === 'string') adimlar.push({ tur: 'dugme', sira: o.dugme, metin: metin(d.metin, 120), secici: d.secici, oneri: 'tikla' });
    }
  }
  // Panelde listeye alınmış ama dokunulduğu görülmemiş alanlar sona (kullanıcı çıkarabilir).
  alanEkle(env.alanlar.filter((a) => a.secili).map((a) => a.alan.anahtar));
  oneriVer(adimlar);
  const son = nesneMi(env.sonSayfa) ? env.sonSayfa : null;
  return {
    adimlar, ilkYol: yollar[0] ?? null, sonYol: yollar[yollar.length - 1] ?? null,
    sonSayfa: son ? { yol: metin(son.yol, 300), cikisMetni: metin(son.cikisMetni, 40) || null } : null
  };
}

/** Başlangıç önerileri (sezgisel; kullanıcı değiştirir). @param {import('./giris-kaydi.d.mts').TaslakAdimi[]} adimlar */
function oneriVer(adimlar) {
  const metinAlani = (/** @type {string} */ t) => ['text', 'email', 'tel', ''].includes(t);
  const p = adimlar.findIndex((a) => a.tur === 'alan' && a.alanTuru === 'password');
  if (p >= 0) {
    adimlar[p].oneri = 'parola';
    for (let i = p - 1; i >= 0; i--) {
      const a = adimlar[i];
      if (a.tur === 'alan' && metinAlani(a.alanTuru)) { a.oneri = 'kullaniciAdi'; break; }
    }
    const g = adimlar.findIndex((a, i) => i > p && a.tur === 'dugme');
    if (g >= 0) {
      adimlar[g].oneri = 'gonder';
      // Gönderden sonraki ilk metin/parola alanı doğrulama kodu, ondan sonraki ilk düğme kod gönder.
      const k = adimlar.findIndex((a, i) => i > g && a.tur === 'alan' && (metinAlani(a.alanTuru) || a.alanTuru === 'password' || a.alanTuru === 'number'));
      if (k >= 0) {
        adimlar[k].oneri = 'kod';
        const kg = adimlar.findIndex((a, i) => i > k && a.tur === 'dugme');
        if (kg >= 0) adimlar[kg].oneri = 'kodGonder';
      }
    }
  }
}

/**
 * Kullanıcının işaretlerinden ham tarif. isaretler[i] taslak.adimlar[i] içindir.
 * @param {import('./giris-kaydi.d.mts').GirisTaslagi} taslak
 * @param {unknown} isaretlerHam
 * @param {import('./tarif.d.mts').GirisTarifi | null} mevcut
 * @param {string | null} girisYolu kaydın başladığı sayfanın yolu
 * @param {unknown} [secimlerHam] onay ekranındaki seçimler: kodKaynagi (totp | sabit | elle), basariMetni (girişten sonra
 *   görünen yazı; kayıttan önerilemediğinde kullanıcı yazar)
 * @returns {import('./giris-kaydi.d.mts').KayittanTarifSonucu}
 */
export function kayittanTarif(taslak, isaretlerHam, mevcut, girisYolu, secimlerHam) {
  const secimler = nesneMi(secimlerHam) ? secimlerHam : {};
  const kodKaynagi = typeof secimler.kodKaynagi === 'string' && KOD_KAYNAKLARI.includes(secimler.kodKaynagi) ? secimler.kodKaynagi : null;
  const basariMetni = metin(secimler.basariMetni, 200);
  /** @type {string[]} */
  const hatalar = [];
  /** @type {string[]} */
  const notlar = [];
  const isaretler = Array.isArray(isaretlerHam) ? isaretlerHam : [];
  if (isaretler.length !== taslak.adimlar.length) hatalar.push('İşaretler kayıttaki adım sayısıyla uyuşmuyor; sayfayı yenileyip yeniden işaretleyin.');
  /** @type {Array<Record<string, unknown>>} */
  const adimlar = [];
  /** @type {Array<{ ad: string; gizli: boolean; etiket: string }>} */
  const ekAlanlar = [];
  const secici = { kullaniciAlani: '', parolaAlani: '', gonderDugmesi: '', kodAlani: '', kodGonder: '' };
  let kodSonrasi = false;
  taslak.adimlar.forEach((a, i) => {
    const s = nesneMi(isaretler[i]) ? isaretler[i] : {};
    const rol = typeof s.rol === 'string' ? s.rol : 'yoksay';
    const ad = `${i + 1}. adım (${a.tur === 'alan' ? a.etiket : a.metin || 'düğme'})`;
    if (a.tur === 'alan') {
      if (!ALAN_ROLLERI.includes(rol)) { hatalar.push(`${ad}: geçersiz seçim.`); return; }
      if (rol === 'yoksay') return;
      if (kodSonrasi && rol !== 'kod') { notlar.push(`${ad} doğrulama kodundan sonra geldiği için tarife alınmadı.`); return; }
      if (rol === 'kullaniciAdi' || rol === 'parola') {
        const anahtar = rol === 'kullaniciAdi' ? 'kullaniciAlani' : 'parolaAlani';
        if (secici[anahtar]) { hatalar.push(`${ad}: ${rol === 'kullaniciAdi' ? 'kullanıcı adı' : 'parola'} alanı birden çok kez işaretlenmiş.`); return; }
        secici[anahtar] = a.secici;
        adimlar.push({ islem: rol });
        return;
      }
      if (rol === 'kod') {
        if (secici.kodAlani) { hatalar.push(`${ad}: doğrulama kodu alanı birden çok kez işaretlenmiş.`); return; }
        secici.kodAlani = a.secici;
        kodSonrasi = true;
        return;
      }
      // Ek alan: onay kutusu / radyo tıklanır (değer yok); seçim listesi ve metin alanı ek alanın değeriyle.
      if (a.alanTuru === 'checkbox' || a.alanTuru === 'radio') {
        adimlar.push({ islem: 'tikla', hedef: { secici: a.secici }, aciklama: a.etiket.slice(0, 200) });
        return;
      }
      const ekAd = typeof s.ad === 'string' ? s.ad.trim() : '';
      if (!EK_ALAN_ADI.test(ekAd)) { hatalar.push(`${ad}: ek alan adı 1–60 karakter; yalnızca harf, rakam, _ . - (boşluk yok; ör. ${ekAlanAdiOner(a.etiket)}).`); return; }
      if (ekAlanlar.some((e) => e.ad === ekAd)) { hatalar.push(`${ad}: "${ekAd}" ek alan adı iki kez kullanılmış.`); return; }
      ekAlanlar.push({ ad: ekAd, gizli: s.gizli === true, etiket: a.etiket });
      adimlar.push({ islem: a.alanTuru === 'select' ? 'sec' : 'doldur', hedef: { secici: a.secici }, deger: `{${ekAd}}`, aciklama: a.etiket.slice(0, 200) });
      return;
    }
    if (!DUGME_ROLLERI.includes(rol)) { hatalar.push(`${ad}: geçersiz seçim.`); return; }
    if (rol === 'yoksay') return;
    if (rol === 'kodGonder') {
      if (!secici.kodAlani) { hatalar.push(`${ad}: "Kodu gönder" düğmesinden önce doğrulama kodu alanı işaretlenmeli.`); return; }
      secici.kodGonder = a.secici;
      return;
    }
    if (kodSonrasi) { notlar.push(`${ad} doğrulama kodundan sonra geldiği için tarife alınmadı.`); return; }
    if (rol === 'gonder') {
      if (secici.gonderDugmesi) { hatalar.push(`${ad}: giriş düğmesi birden çok kez işaretlenmiş.`); return; }
      secici.gonderDugmesi = a.secici;
      adimlar.push({ islem: 'gonder' });
      return;
    }
    adimlar.push({ islem: 'tikla', hedef: a.metin ? { secici: a.secici, metin: a.metin } : { secici: a.secici }, ...(a.metin ? { aciklama: `“${a.metin}” düğmesine bas` } : {}) });
  });
  if (!secici.kullaniciAlani) hatalar.push('Kullanıcı adı alanını işaretleyin.');
  if (!secici.parolaAlani) hatalar.push('Parola alanını işaretleyin.');
  if (!secici.gonderDugmesi) hatalar.push('Giriş düğmesini işaretleyin.');

  const m = mevcut;
  // Girişten sonraki sayfa: "Bitir" anındaki sayfa (yoksa son okumanın yolu); sorgu parametreleri alınmaz.
  const yalin = (/** @type {string | null | undefined} */ y) => (y ? y.split(/[?#]/)[0] : '');
  const sonYol = yalin(taslak.sonSayfa?.yol) || yalin(taslak.sonYol);
  const yolDegisti = Boolean(sonYol) && sonYol !== (yalin(girisYolu) || yalin(taslak.ilkYol));
  const cikis = taslak.sonSayfa?.cikisMetni ?? null;
  /** @type {Record<string, unknown>} */
  const tarif = {
    girisAdresi: m?.girisAdresi ?? (girisYolu || '/'),
    oturumKontrolAdresi: m?.oturumKontrolAdresi ?? (yolDegisti ? sonYol : girisYolu || '/'),
    kullaniciAlani: secici.kullaniciAlani,
    parolaAlani: secici.parolaAlani,
    gonderDugmesi: secici.gonderDugmesi,
    // Öncelik: kullanıcının yazdığı metin > mevcut tarif > görünen çıkış yazısı > girişten sonraki adres.
    basariGostergesi: basariMetni ? { tur: 'metin', deger: basariMetni } : m?.basariGostergesi
      ?? (cikis ? { tur: 'metin', deger: cikis } : yolDegisti ? { tur: 'url', deger: regexKacis(sonYol) } : { tur: 'metin', deger: '' }),
    hataGostergeleri: m?.hataGostergeleri ?? [],
    ikinciAdim: m?.ikinciAdim ?? { tur: 'yok' },
    zamanAsimiSn: m?.zamanAsimiSn ?? 45,
    baglamDegistirme: m?.baglamDegistirme ?? null
  };
  if (!varsayilanGirisAdimlariMi(adimlar)) tarif.girisAdimlari = adimlar;
  if (secici.kodAlani) {
    const onceki = m && m.ikinciAdim.tur !== 'yok' ? m.ikinciAdim : null;
    tarif.ikinciAdim = {
      tur: kodKaynagi ? (kodKaynagi === 'totp' ? 'totp' : 'sms') : onceki ? onceki.tur : 'totp', kodAlani: secici.kodAlani, gonderDugmesi: secici.kodGonder,
      smsKipi: kodKaynagi ? (kodKaynagi === 'totp' ? null : kodKaynagi) : onceki ? onceki.smsKipi : null, hataGostergeleri: onceki ? onceki.hataGostergeleri : [], elleBeklemeSn: onceki ? onceki.elleBeklemeSn : 180
    };
    if (!onceki && !kodKaynagi) notlar.push('Doğrulama kodu alanı işaretlendi: tarif formunda kodun türünü (Authenticator ya da SMS) kontrol edin.');
  }
  if (!m?.basariGostergesi && !basariMetni && !/** @type {any} */ (tarif.basariGostergesi).deger) {
    notlar.push('Girişten sonra ekranda görünen bir yazı (ör. menüdeki bir başlık) belirtin; giriş bununla doğrulanır.');
  }
  return { tarif, ekAlanlar, hatalar, notlar };
}
