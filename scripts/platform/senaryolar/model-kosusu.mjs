// MODEL KOŞUSU (genel, saf) — test kodu OLMAYAN senaryoların (sayfa paketinden/modelden oluşturulanlar)
// ekran modeliyle koşturulması için ortak kurallar. Hem platform sunucusu (koşu hedefi, liste rozeti,
// yasaklı adres koruması) hem veri okuyucu (scripts/platform/aktarim/veri-oku.mjs > model kipi) hem de
// Playwright tarafı (tests/support/model-kosucu.ts, tests/model-kosucu/model-senaryolari.spec.ts) bu
// dosyayı kullanır.
//
//  - Model senaryosu: kodda karşılığı OLMAYAN senaryo — aktarım eşlemesi (kodda tanımlı test) yok, içerik
//    sayfa paketinden gelmiş ("paket") ya da açıkça modelle koşar ("kosucu": "model") ve kaynaktaki spec
//    dosyası diskte yok. Böylece Galaksi'nin kodlu testleri model koşucusunda ASLA tekrarlanmaz.
//  - Model senaryoları TEK bir spec dosyasında (MODEL_SPEC_DOSYASI) üretilir; her testin etiketi
//    "@model-<senaryo UUID>" olur ve koşu bu etiketle daraltılır (grep).
//  - Yasaklı adres koruması: Ayarlar > Güvenlik > "Yasak adresler" (guvenlik/yasak-adresler.mjs; alt süreçlere bu
//    değişkenle verilir) + NOBETCI_YASAK_ADRESLER (virgül/boşlukla ayrılmış host kalıpları, "*" joker)
//    ortam değişkeniyle verilen bir host'a giden koşu, tarayıcı hiçbir yere gitmeden reddedilir.
//  - Koşu planı: adım kapsamı (isteğe bağlı adımlar), doldurulacak alanlar (değer, tip, konum, doldurucu),
//    beklenen sonuç ve bağlam profili modelden ve senaryo verisinden SAF olarak çıkarılır (birim testli).
// NOT: import.meta KULLANILMAZ. Tipler: model-kosusu.d.mts.

import { gorunurlukleriHesapla } from '../../dogrulama/senaryo-dogrulayici.mjs';
import { formSemasiOlustur } from './model-formu.mjs';

/** Model senaryolarını üreten spec dosyası (Playwright testDir'e göre göreli yol). */
export const MODEL_SPEC_DOSYASI = 'model-kosucu/model-senaryolari.spec.ts';
/** Model testlerinin etiket öneki (etiket = önek + senaryo UUID'si). */
export const MODEL_ETIKET_ON_EKI = '@model-';
/** Yasaklı host kalıplarının ortam değişkeni. */
export const YASAK_ADRES_DEGISKENI = 'NOBETCI_YASAK_ADRESLER';
/** Dosya alanlarına yüklenebilecek dosyaların klasörü (ortam değişkeni; yoksa veri/yuklenecek-dosyalar). */
export const YUKLEME_KLASORU_DEGISKENI = 'NOBETCI_YUKLEME_KLASORU';
/** Model koşucusunun doldurabildiği alan tipleri. */
export const DOLDURULABILIR_TIPLER = Object.freeze(['secim', 'okluSecim', 'metin', 'sayi', 'telefon', 'tarih', 'onayKutusu', 'radyo', 'dosya']);

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** @param {unknown} d */
const bosMu = (d) => d === undefined || d === null || (typeof d === 'string' && d.trim() === '');
/** @param {string} m */
const regexKacis = (m) => String(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------------------
// Model senaryosu mu?
// ---------------------------------------------------------------------------------------

/** @param {unknown} icerik @returns {{ dosya: string; ad: string } | null} */
function kaynak(icerik) {
  const k = nesneMi(icerik) && nesneMi(icerik.kaynak) ? icerik.kaynak : null;
  return k && typeof k.dosya === 'string' && k.dosya && typeof k.ad === 'string' ? { dosya: k.dosya, ad: k.ad } : null;
}

/**
 * Senaryo model koşucusuyla mı çalışır (kodda karşılığı yok mu)?
 * @param {unknown} icerik senaryolar.icerik_json
 * @param {{ kodEslemesiVar?: boolean; kodDosyasiVar?: (dosya: string) => boolean }} [s]
 *   kodEslemesiVar: senaryo koddan aktarılmış (kaynak_eslemeleri'nde 'senaryo' kaydı var);
 *   kodDosyasiVar: kaynaktaki spec dosyası (testDir'e göre) diskte var mı?
 */
export function modelSenaryosuMu(icerik, s = {}) {
  if (!nesneMi(icerik) || s.kodEslemesiVar) return false;
  if (icerik.kosucu === 'kod') return false;
  if (!(nesneMi(icerik.paket) || icerik.kosucu === 'model')) return false;
  const k = kaynak(icerik);
  if (k && s.kodDosyasiVar && s.kodDosyasiVar(k.dosya)) return false;
  return true;
}

/** @param {string} senaryoId */
export function modelEtiketi(senaryoId) {
  return `${MODEL_ETIKET_ON_EKI}${senaryoId}`;
}

/** Yalnızca bu senaryonun model testini seçen grep deseni (etiketin tamamı; devamı harf/rakam/"-" olamaz). @param {string} senaryoId */
export function modelGrepDeseni(senaryoId) {
  return `${regexKacis(modelEtiketi(senaryoId))}(?![A-Za-z0-9_-])`;
}

/**
 * Model testlerinin başlıkları: senaryo başlığı; aynı başlık bir kez daha geçerse kimliğin ilk 8 karakteri
 * eklenir (Playwright aynı dosyada aynı başlığa izin vermez; sonuç anahtarı "<dosya>::<başlık>" tekil olmalı).
 * Sıra kimliğe göre sabittir: listeleme ve koşu süreçleri aynı başlıkları üretir.
 * @param {Array<{ id: string; baslik: string }>} senaryolar @returns {Map<string, string>} id → başlık
 */
export function modelTestBasliklari(senaryolar) {
  const sonuc = new Map();
  const kullanilan = new Set();
  for (const s of senaryolar.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    let baslik = String(s.baslik).trim() || s.id;
    if (kullanilan.has(baslik)) baslik = `${baslik} (${s.id.slice(0, 8)})`;
    kullanilan.add(baslik);
    sonuc.set(s.id, baslik);
  }
  return sonuc;
}

// ---------------------------------------------------------------------------------------
// Yasaklı adres koruması
// ---------------------------------------------------------------------------------------

/**
 * Host kalıpları: virgül/boşluk/satırla ayrılmış; "*" herhangi bir karakter dizisi (ör. "*nippon*",
 * "galaksi-test.ornek.local"). Büyük/küçük harf duyarsız, tam host'a uygulanır.
 * @param {string | undefined | null} metin @returns {Array<{ kalip: string; desen: RegExp }>}
 */
export function yasakDesenleri(metin) {
  return String(metin ?? '').split(/[\s,;]+/).map((k) => k.trim().toLowerCase()).filter(Boolean).map((kalip) => ({
    kalip,
    desen: new RegExp(`^${kalip.split('*').map(regexKacis).join('.*')}$`, 'i')
  }));
}

/**
 * Adresin host'u yasaklı bir kalıba uyuyor mu? Uyan kalıbı döner (yoksa null). Göreli yol ("/…") ve
 * ayrıştırılamayan adres için null (taban adrese göre çözülür; taban adres ayrıca denetlenir).
 * @param {string | undefined | null} adres @param {Array<{ kalip: string; desen: RegExp }>} desenler
 */
export function adresYasakliMi(adres, desenler) {
  if (!adres || !desenler.length) return null;
  let host;
  try { host = new URL(String(adres)).hostname.toLowerCase(); } catch { return null; }
  if (!host) return null;
  return desenler.find((d) => d.desen.test(host))?.kalip ?? null;
}

/** Yasaklı host'a giden koşunun hata metni (host yazılır; adresin yolu/sorgusu yazılmaz). @param {string} adres @param {string} kalip */
export function yasakliAdresMesaji(adres, kalip) {
  let host = '?';
  try { host = new URL(adres).hostname; } catch { /* yok */ }
  return `Koşu reddedildi: ortamın adresi (${host}) yasaklı adres kalıbına ("${kalip}") uyuyor (Ayarlar > Güvenlik > Yasak adresler ya da ${YASAK_ADRES_DEGISKENI}). Tarayıcı hiçbir yere gitmedi.`;
}

// ---------------------------------------------------------------------------------------
// Koşu planı
// ---------------------------------------------------------------------------------------

/** @param {any} alan */
function etiketi(alan) {
  const e = alan.etiket;
  return (e && e.ekran) || (e && e.form) || (alan.form && alan.form.etiket) || alan.id;
}

/** @param {any} alan @returns {string[]} */
function senaryoAnahtarlari(alan) {
  const s = alan && alan.eslesme && alan.eslesme.senaryo;
  if (s === undefined || s === null) return [];
  return Array.isArray(s) ? s : [s];
}

/**
 * Ekran modeli + senaryo verisi → koşu planı (saf; tarayıcı yok).
 *  - adimlar: akış sırasıyla; dahil = adımın görünürlüğü (tek doğrulayıcı) false değil. Koşu son adımda durur:
 *    iş kuralı hatası bekleniyorsa o adımda, değilse kapsamdaki son adımda.
 *  - alanlar: senaryoda DEĞERİ olan, senaryoda ayarlanabilen alanlar (değer, tip, konum, doldurucu,
 *    seçenekler, "mutlaka görünmeli"). Konumu (seçicisi) olmayan ya da koşucunun doldurmadığı tipteki
 *    alanlar "atla" nedeniyle işaretlenir (koşuda atlanan alan olarak kaydedilir).
 *  - beklenen: { tur: 'basari' } | { tur: 'hata', adim, mesaj }.
 *  - baglamProfili: senaryonun bağlam profili adı (profil havuzlu alanın değeri ya da varsayılanı) | null.
 * Plan kurulamazsa (ör. hata beklenen adım kapsamda değil) hatalar doludur.
 * @param {any} model @param {Record<string, unknown>} veri
 * @param {{ altModeller?: Record<string, any>; mutlakaGorunmeli?: string[] }} [secenekler]
 */
export function modelKosuPlani(model, veri, secenekler = {}) {
  /** @type {string[]} */
  const hatalar = [];
  const mutlaka = new Set(secenekler.mutlakaGorunmeli ?? []);
  const gorunurluk = gorunurlukleriHesapla(veri, { model, altModeller: secenekler.altModeller ?? {}, kaynak: 'kayit' });
  const sema = formSemasiOlustur(model, secenekler.altModeller ?? {});

  // Beklenen sonuç
  /** @type {{ tur: 'basari' } | { tur: 'hata'; adim: string; mesaj: string }} */
  let beklenen = { tur: 'basari' };
  const bs = sema.beklenenSonuc;
  if (bs) {
    const kayit = veri[bs.anahtar];
    if (nesneMi(kayit) && typeof kayit.tip === 'string' && kayit.tip !== bs.basariTipi) {
      const adim = bs.adimAnahtari ? String(kayit[bs.adimAnahtari] ?? '') : '';
      const mesaj = bs.mesajAnahtari ? String(kayit[bs.mesajAnahtari] ?? '').trim() : '';
      if (!adim) hatalar.push('Beklenen iş kuralı hatasının adımı yok.');
      if (!mesaj) hatalar.push('Beklenen iş kuralı hatasının mesajı yok.');
      beklenen = { tur: 'hata', adim, mesaj };
    }
  }

  // Bağlam profili
  const sd = nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : [];
  const profilAlani = sd.find((a) => a && a.eslesme && typeof a.eslesme.profilHavuzu === 'string' && senaryoAnahtarlari(a).length === 1);
  let baglamProfili = null;
  if (profilAlani) {
    const deger = veri[senaryoAnahtarlari(profilAlani)[0]];
    baglamProfili = typeof deger === 'string' && deger.trim() ? deger.trim()
      : profilAlani.varsayilan && typeof profilAlani.varsayilan.deger === 'string' ? profilAlani.varsayilan.deger : null;
  }

  const sirali = (Array.isArray(model.adimlar) ? model.adimlar : []).slice().sort((a, b) => (a.sira || 0) - (b.sira || 0));
  const adimlar = sirali.map((adim) => {
    const dahil = gorunurluk.adimlar[adim.id] !== false;
    const alanlar = [];
    for (const bolum of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const alan of Array.isArray(bolum.alanlar) ? bolum.alanlar : []) {
        if (!alan || alan.yapilandirma !== 'senaryo') continue;
        const anahtarlar = senaryoAnahtarlari(alan);
        if (anahtarlar.length !== 1) continue;
        const deger = veri[anahtarlar[0]];
        if (bosMu(deger)) continue;
        const konum = nesneMi(alan.konum) ? alan.konum : null;
        const tip = alan.doldurucu === 'okluSecim' ? 'okluSecim' : alan.tip;
        /** @type {string | null} */
        let atla = null;
        if (!DOLDURULABILIR_TIPLER.includes(tip)) atla = `model koşucusu "${alan.tip}" tipindeki alanı henüz doldurmuyor`;
        else if (!konum || typeof konum.secici !== 'string' || !konum.secici) atla = 'alanın konumu (seçicisi) modelde yok';
        alanlar.push({
          id: alan.id, etiket: etiketi(alan), anahtar: anahtarlar[0], tip, doldurucu: alan.doldurucu ?? null,
          deger, secici: konum ? konum.secici : null, yardimci: konum && nesneMi(konum.yardimci) ? { ...konum.yardimci } : {},
          secenekler: Array.isArray(alan.secenekler) ? alan.secenekler.map((s) => ({ ...s }))
            : alan.bagimlilik && nesneMi(alan.bagimlilik.secenekHaritasi) ? Object.values(alan.bagimlilik.secenekHaritasi).flat().map((s) => ({ ...s })) : [],
          parametreler: nesneMi(alan.doldurucuParametreleri) ? { ...alan.doldurucuParametreleri } : {},
          mutlakaGorunmeli: mutlaka.has(alan.id), atla
        });
      }
    }
    return { id: adim.id, baslik: adim.baslik || adim.id, sira: adim.sira || 0, dahil, alanlar, kosu: nesneMi(adim.kosu) ? adim.kosu : null, sonAdim: false };
  });

  let son;
  if (beklenen.tur === 'hata') {
    son = adimlar.find((a) => a.id === beklenen.adim);
    if (!son) hatalar.push(`Beklenen hata adımı "${beklenen.adim}" modelde yok.`);
    else if (!son.dahil) hatalar.push(`Beklenen hata adımı "${son.baslik}" bu senaryonun adım kapsamında değil.`);
  } else {
    son = adimlar.filter((a) => a.dahil).pop();
  }
  if (son) son.sonAdim = true;
  const sonIndeks = son ? adimlar.indexOf(son) : -1;
  for (const [i, a] of adimlar.entries()) if (i > sonIndeks) a.dahil = false;
  for (const id of mutlaka) {
    if (!adimlar.some((a) => a.alanlar.some((x) => x.id === id))) {
      // Değeri olmayan alan için "mutlaka görünmeli" yine denetlenir: yalnızca görünürlük kontrolü yapılır.
      for (const adim of sirali) {
        for (const bolum of adim.bolumler || []) {
          const alan = (bolum.alanlar || []).find((x) => x && x.id === id);
          if (!alan) continue;
          const hedef = adimlar.find((a) => a.id === adim.id);
          if (hedef && nesneMi(alan.konum) && alan.konum.secici) {
            hedef.alanlar.push({
              id, etiket: etiketi(alan), anahtar: senaryoAnahtarlari(alan)[0] ?? id, tip: alan.tip, doldurucu: null, deger: null,
              secici: alan.konum.secici, yardimci: {}, secenekler: [], parametreler: {}, mutlakaGorunmeli: true, atla: null, yalnizGorunurluk: true
            });
          }
        }
      }
    }
  }
  return { ekranUrl: typeof model.ekranUrl === 'string' ? model.ekranUrl : '/', adimlar, beklenen, baglamProfili, hatalar };
}

/**
 * Seçim/oklu seçim alanında senaryo değerine karşılık gelen seçenek: ekrandaki değer (deger) ve görünen metin.
 * @param {Array<{ deger: string; metin?: string | null; senaryoDegeri?: string; formMetni?: string; secici?: string }>} secenekler
 * @param {unknown} deger
 */
export function secenekBul(secenekler, deger) {
  const d = String(deger);
  const s = secenekler.find((x) => (x.senaryoDegeri ?? x.deger) === d) ?? secenekler.find((x) => x.deger === d || x.metin === d);
  return { deger: s ? s.deger : d, metin: s && s.metin ? s.metin : s ? s.deger : d, secici: s && s.secici ? s.secici : null };
}

/**
 * Dosya alanının değeri (dosya ADI) → izinli klasördeki dosyanın yolu. Klasör dışına çıkan (/, \, ..) ya da
 * gizli (".") adlar reddedilir. Varlık kontrolü çağıranın işidir (fs burada yok).
 * @param {unknown} deger @param {string} klasor @param {(a: string, b: string) => string} birlestir path.join
 * @returns {{ yol: string } | { hata: string }}
 */
export function yuklemeDosyasiYolu(deger, klasor, birlestir) {
  const ad = typeof deger === 'string' ? deger.trim() : '';
  if (!ad) return { hata: 'dosya adı boş' };
  if (/[\\/]/.test(ad) || ad.startsWith('.') || ad.includes('..') || ad.length > 200) {
    return { hata: `"${ad}" geçerli bir dosya adı değil (yalnızca izinli klasördeki bir dosyanın adı yazılır; yol yazılmaz)` };
  }
  return { yol: birlestir(klasor, ad) };
}
