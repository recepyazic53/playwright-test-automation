// MODEL KOŞUSU (genel, saf) — senaryoların ekran modeliyle koşturulması için ortak kurallar. Hem platform sunucusu
// (koşu hedefi, liste rozeti, yasaklı adres koruması) hem veri okuyucu (scripts/platform/veri-oku.mjs) hem de
// Playwright tarafı (tests/support/model-kosucu.ts, tests/model-kosucu/model-senaryolari.spec.ts) bu dosyayı kullanır.
//
//  - Model senaryosu: içeriği sayfa paketinden gelmiş ("paket") ya da açıkça modelle koşan ("kosucu": "model") senaryo.
//  - Model senaryoları TEK bir spec dosyasında (MODEL_SPEC_DOSYASI) üretilir; her testin etiketi
//    "@model-<senaryo UUID>" olur ve koşu bu etiketle daraltılır (grep).
//  - Yasaklı adres koruması: Ayarlar > Güvenlik > "Yasak adresler" (guvenlik/yasak-adresler.mjs; alt süreçlere bu
//    değişkenle verilir) + NOBETCI_YASAK_ADRESLER (virgül/boşlukla ayrılmış host kalıpları, "*" joker)
//    ortam değişkeniyle verilen bir host'a giden koşu, tarayıcı hiçbir yere gitmeden reddedilir.
//  - Koşu planı: adım kapsamı (isteğe bağlı adımlar), doldurulacak alanlar (değer, tip, konum, doldurucu),
//    beklenen sonuç ve bağlam profili modelden ve senaryo verisinden SAF olarak çıkarılır (birim testli).
// NOT: import.meta KULLANILMAZ. Tipler: model-kosusu.d.mts.

import { bilerekBosAnahtarlari, gorunurlukleriHesapla } from '../../dogrulama/senaryo-dogrulayici.mjs';
import { formDegerleriniKur, formSemasiOlustur, kimlikAnahtariBul, kimlikTuruBul, profilHavuzuBul, tumFormAlanlari } from './model-formu.mjs';

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

/**
 * Senaryo model koşucusuyla mı çalışır? (İçeriği sayfa paketinden gelmiş ya da "kosucu": "model".)
 * @param {unknown} icerik senaryolar.icerik_json
 */
export function modelSenaryosuMu(icerik) {
  if (!nesneMi(icerik) || icerik.kosucu === 'kod') return false;
  return nesneMi(icerik.paket) || icerik.kosucu === 'model';
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
 * VERİ KOŞULARI (tablodan çoklu satır): aynı senaryonun her veri koşusu ayrı testtir; başlığı "Senaryo [satır-adı]" (anahtar
 * modelTestAnahtari: "<id>#<veri anahtarı>"). Tek satırlı koşuda anahtar senaryo kimliğidir (bugünkü başlık).
 * @param {Array<{ id: string; baslik: string; veriKosusu?: { anahtar: string | null; ad?: string | null } | null }>} senaryolar
 * @returns {Map<string, string>} modelTestAnahtari → başlık
 */
export function modelTestBasliklari(senaryolar) {
  const sonuc = new Map();
  const kullanilan = new Set();
  /** @type {Map<string, string>} senaryo kimliği → temel başlık */
  const temeller = new Map();
  for (const s of senaryolar.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (!temeller.has(s.id)) {
      let baslik = String(s.baslik).trim() || s.id;
      if (kullanilan.has(baslik)) baslik = `${baslik} (${s.id.slice(0, 8)})`;
      kullanilan.add(baslik);
      temeller.set(s.id, baslik);
    }
    const temel = /** @type {string} */ (temeller.get(s.id));
    const ad = s.veriKosusu?.anahtar ? s.veriKosusu.ad : null;
    sonuc.set(modelTestAnahtari(s), ad ? `${temel} [${ad}]` : temel);
  }
  return sonuc;
}

/**
 * Model testinin anahtarı: veri koşusunda "<senaryo kimliği>#<veri anahtarı>", değilse senaryo kimliği.
 * @param {{ id: string; veriKosusu?: { anahtar: string | null } | null }} s
 */
export const modelTestAnahtari = (s) => (s.veriKosusu?.anahtar ? `${s.id}#${s.veriKosusu.anahtar}` : s.id);

// ---------------------------------------------------------------------------------------
// Yasaklı adres koruması
// ---------------------------------------------------------------------------------------

/**
 * Host kalıpları: virgül/boşluk/satırla ayrılmış; "*" herhangi bir karakter dizisi (ör. "*sirket*",
 * "test.ornek.local"). Büyük/küçük harf duyarsız, tam host'a uygulanır.
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

/**
 * Metindeki bilinen gizli değerleri (ör. ${Tablo.Sütun} ile gizli tablo sütunundan gelen değer) "•••" ile maskeler; 3 karakterden
 * kısa değerler metni bozmasın diye atlanır, uzundan kısaya uygulanır. @param {string} metin @param {ReadonlyArray<unknown>} gizliler
 */
export function gizliDegerleriMaskele(metin, gizliler) {
  let m = String(metin ?? '');
  for (const g of [...new Set(gizliler.map((x) => String(x ?? '')))].filter((x) => x.length >= 3).sort((a, b) => b.length - a.length)) m = m.split(g).join('•••');
  return m;
}

/**
 * Senaryonun çözülemeyen tablo başvuruları (${Tablo.Sütun}; veri-oku.mjs) → koşuyu durduran hata metni.
 * @param {string} baslik @param {ReadonlyArray<{ alan: string; mesaj: string }>} hatalar
 */
export function veriHatalariMetni(baslik, hatalar) {
  return `"${baslik}": senaryonun test verisi başvurusu çözülemedi — ${hatalar.map((h) => h.mesaj).join(' ')} Tabloyu Ayarlar > Test verisi'nde tamamlayın ya da senaryoda başka bir değer seçin. Tarayıcı açılmadı.`;
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
 *  - alanlar: senaryoda DEĞERİ olan (boş bırakılmışsa modelin varsayılanı), senaryoda ayarlanabilen alanlar (değer, tip, konum, doldurucu,
 *    seçenekler, "mutlaka görünmeli"). Konumu (seçicisi) olmayan ya da koşucunun doldurmadığı tipteki
 *    alanlar "atla" nedeniyle işaretlenir (koşuda atlanan alan olarak kaydedilir).
 *  - beklenen: { tur: 'basari' } | { tur: 'hata', adim, mesaj }.
 *  - baglamProfili: senaryonun bağlam profili adı (profil havuzlu alanın değeri ya da varsayılanı) | null.
 * Plan kurulamazsa (ör. hata beklenen adım kapsamda değil) hatalar doludur.
 * @param {any} model @param {Record<string, unknown>} veriHam
 * Sabit / türetilmiş değerler: senaryo alanı olmayan ama modelde "sabitDeger" taşıyan alan her koşuda o değerle doldurulur;
 * tarih alanında "bugun", "bugun+7", "bugun-3" (Europe/Istanbul; alanın biçimiyle) koşu anında hesaplanır.
 * Kimlik alanları (kimlikProfili): senaryodaki serbest kimlik ya da seçilen (yoksa varsayılan) hazır profil — profil değerleri
 * secenekler.kimlikProfilleri[havuz][profil] — alt alanlara (doğum tarihi, telefon, T.C./VKN…) sırayla açılır; alt alanın
 * kimlik alanı kimlik türüne göre seçilir (türde karşılığı yoksa alt alan atlanır).
 * @param {{ altModeller?: Record<string, any>; mutlakaGorunmeli?: string[]; kimlikProfilleri?: Record<string, Record<string, Record<string, unknown>>>; simdi?: Date }} [secenekler]
 */
export function modelKosuPlani(model, veriHam, secenekler = {}) {
  /** @type {string[]} */
  const hatalar = [];
  // Boş bırakılan alanlar modelin varsayılan değeriyle (formdaki "Varsayılan"); görünürlük koşulları da bu değerlerle hesaplanır.
  const veri = varsayilanlariUygula(model, veriHam);
  const mutlaka = new Set(secenekler.mutlakaGorunmeli ?? []);
  const gorunurluk = gorunurlukleriHesapla(veri, { model, altModeller: secenekler.altModeller ?? {}, kaynak: 'kayit' });
  const sema = formSemasiOlustur(model, secenekler.altModeller ?? {});

  // Beklenen sonuç
  /** @type {{ tur: 'basari' } | { tur: 'hata'; adim: string; mesaj: string; mesajlar: string[] }} */
  let beklenen = { tur: 'basari' };
  const bs = sema.beklenenSonuc;
  if (bs) {
    const kayit = veri[bs.anahtar];
    if (nesneMi(kayit) && typeof kayit.tip === 'string' && kayit.tip !== bs.basariTipi) {
      const adim = bs.adimAnahtari ? String(kayit[bs.adimAnahtari] ?? '') : '';
      const mesaj = bs.mesajAnahtari ? String(kayit[bs.mesajAnahtari] ?? '').trim() : '';
      if (!adim) hatalar.push('Beklenen iş kuralı hatasının adımı yok.');
      if (!mesaj) hatalar.push('Beklenen iş kuralı hatasının mesajı yok.');
      // Akıştaki uyarılardan birden çoğu seçildiyse (mesajlar): herhangi biri görünürse beklenen sonuç sağlanır.
      const liste = Array.isArray(kayit.mesajlar) ? kayit.mesajlar.filter((m) => typeof m === 'string' && m.trim()).map((m) => m.trim()) : [];
      beklenen = { tur: 'hata', adim, mesaj, mesajlar: liste.length ? [...new Set([mesaj, ...liste].filter(Boolean))] : [mesaj] };
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
  /** Kimlik çözümü için form değerleri (bağlı alanın değeri → kimlik türü / profil havuzu). */
  const formDegerleri = formDegerleriniKur(sema, veri);
  const formAlanlari = tumFormAlanlari(sema);
  /** Plan alanı (doldurucu, konum, seçenekler, parametreler). @param {any} alan @param {unknown} deger @param {{ id?: string; etiket?: string; anahtar?: string }} [ek] */
  const planAlani = (alan, deger, ek = {}) => {
    const konum = nesneMi(alan.konum) ? alan.konum : null;
    const tip = alan.doldurucu === 'okluSecim' ? 'okluSecim' : alan.tip;
    /** @type {string | null} */
    let atla = null;
    if (!DOLDURULABILIR_TIPLER.includes(tip)) atla = `model koşucusu "${alan.tip}" tipindeki alanı henüz doldurmuyor`;
    else if (!konum || typeof konum.secici !== 'string' || !konum.secici) atla = 'alanın konumu (seçicisi) modelde yok';
    const id = ek.id ?? alan.id;
    return {
      id, etiket: ek.etiket ?? etiketi(alan), anahtar: ek.anahtar ?? senaryoAnahtarlari(alan)[0] ?? id, tip, doldurucu: alan.doldurucu ?? null,
      deger, secici: konum ? konum.secici : null, yardimci: konum && nesneMi(konum.yardimci) ? { ...konum.yardimci } : {},
      // Çerçeve (iframe) seçicileri: koşucu alanı (ve yardımcı seçicilerini) o çerçevede arar.
      cerceve: konum && Array.isArray(konum.cerceve) && konum.cerceve.length ? konum.cerceve.map(String) : null,
      secenekler: Array.isArray(alan.secenekler) ? alan.secenekler.map((/** @type {any} */ s) => ({ ...s }))
        : alan.bagimlilik && nesneMi(alan.bagimlilik.secenekHaritasi) ? Object.values(alan.bagimlilik.secenekHaritasi).flat().map((/** @type {any} */ s) => ({ ...s })) : [],
      parametreler: nesneMi(alan.doldurucuParametreleri) ? { ...alan.doldurucuParametreleri } : {},
      // Akışta "zorunlu" işaretli alan (model: mutlakaGorunmeli) ya da senaryonun "mutlaka görünmeli" kuralı.
      mutlakaGorunmeli: mutlaka.has(id) || alan.mutlakaGorunmeli === true, atla
    };
  };
  /** Kimlik alanı → alt alanları (değerli olanlar, sırayla). @param {any} alan */
  const kimlikAlanlari = (alan) => {
    const f = /** @type {any} */ (formAlanlari.find((x) => x.id === alan.id && x.tip === 'kimlik'));
    if (!f) return [];
    const tur = kimlikTuruBul(f, formDegerleri, sema);
    const serbestAnahtar = kimlikAnahtariBul(f, tur);
    /** @type {Record<string, unknown> | null} */
    let kimlik = serbestAnahtar && nesneMi(veri[serbestAnahtar]) ? /** @type {Record<string, unknown>} */ (veri[serbestAnahtar]) : null;
    let neden = '';
    if (!kimlik) {
      const profil = f.profilAnahtari && typeof veri[f.profilAnahtari] === 'string' && String(veri[f.profilAnahtari]).trim()
        ? String(veri[f.profilAnahtari]).trim()
        : nesneMi(alan.varsayilan) && typeof alan.varsayilan.deger === 'string' ? alan.varsayilan.deger : null;
      const havuz = profilHavuzuBul(f, formDegerleri, sema);
      const bulunan = profil && havuz ? secenekler.kimlikProfilleri?.[havuz]?.[profil] : undefined;
      if (nesneMi(bulunan)) kimlik = bulunan;
      else neden = profil ? `"${profil}" kimlik kaydı bulunamadı (Ayarlar > Test verisi > Kişi ve kayıt verileri: "${havuz ?? '?'}" tablosunda bu adla satır yok)` : 'kimlik bilgisi (kayıt ya da yeni kimlik) yok';
    }
    if (!kimlik) return [{ ...planAlani(alan, null), atla: neden }];
    const altlar = (Array.isArray(alan.altAlanlar) ? alan.altAlanlar : []).filter((a) => nesneMi(a) && nesneMi(a.eslesme) && a.eslesme.kimlikAlani !== undefined)
      .slice().sort((a, b) => (a.sira || 0) - (b.sira || 0));
    return altlar.flatMap((a) => {
      const { ad, dilim } = kimlikAlaniCoz(a.eslesme.kimlikAlani, tur);
      const ham = secimDegeri(ad ? /** @type {Record<string, unknown>} */ (kimlik)[ad] : undefined);
      // Dilim: profildeki değerin bir parçası (ör. cep telefonu → ilk 3 hane / kalanı); boşluklar yok sayılır.
      const deger = dilim && typeof ham === 'string' ? ham.replace(/\s+/g, '').slice(dilim[0], dilim[1]) : ham;
      if (bosMu(deger)) return [];
      return [planAlani(a, deger, { etiket: `${etiketi(alan)} — ${etiketi(a)}`, anahtar: `${senaryoAnahtarlari(alan)[0] ?? alan.id}.${ad}` })];
    });
  };
  const adimlar = sirali.map((adim) => {
    const dahil = gorunurluk.adimlar[adim.id] !== false;
    const alanlar = [];
    for (const bolum of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const alan of Array.isArray(bolum.alanlar) ? bolum.alanlar : []) {
        if (!alan) continue;
        // Sabit / türetilmiş değer (senaryodan bağımsız; ör. "bugün + 7" tarih, her koşuda aynı seçim).
        if (alan.yapilandirma !== 'senaryo' && alan.sabitDeger !== undefined) {
          if (gorunurluk.alanlar[alan.id] === false) continue;
          alanlar.push(planAlani(alan, sabitDegeriCoz(alan, secenekler.simdi)));
          continue;
        }
        if (alan.yapilandirma !== 'senaryo') continue;
        if (alan.tip === 'kimlikProfili') {
          if (gorunurluk.alanlar[alan.id] === false) continue;
          alanlar.push(...kimlikAlanlari(alan));
          continue;
        }
        const anahtarlar = senaryoAnahtarlari(alan);
        if (anahtarlar.length !== 1) continue;
        const deger = veri[anahtarlar[0]];
        if (bosMu(deger) || gorunurluk.alanlar[alan.id] === false) continue;
        alanlar.push(planAlani(alan, deger));
      }
    }
    if (dahil && typeof adim.eksikOrtakAkis === 'string') hatalar.push(`"${adim.baslik || adim.id}" adımının ortak akışı ("${adim.eksikOrtakAkis}") bu projede bulunamadı.`);
    return {
      id: adim.id, baslik: adim.baslik || adim.id, sira: adim.sira || 0, dahil, alanlar, kosu: nesneMi(adim.kosu) ? adim.kosu : null, sonAdim: false,
      // Ortak akıştan açılan adım: "yalnızca test ortamı" (koşucu canlı ortamda atlar) ve ortak akışın adı (raporda).
      ...(adim.yalnizTest === true ? { yalnizTest: true } : {}),
      ...(typeof adim.ortakAkisAdi === 'string' ? { ortakAkisAdi: adim.ortakAkisAdi } : {}),
      // SQL sorgusu adımı (sql/sql-adimi.mjs): koşucu sorguyu çalıştırıp beklenenle karşılaştırır (alan / aksiyon yok).
      ...(nesneMi(adim.sqlKontrolu) ? { sql: adim.sqlKontrolu } : {}),
      // İndirilen dosyayı doğrulama adımı (dosyalar/dosya-icerigi.mjs): tetikleyici düğmeye basılır, indirilen dosya beklentilerle
      // doğrulanır (alan yok).
      ...(nesneMi(adim.dosyaKontrolu) ? { dosya: adim.dosyaKontrolu } : {}),
      // Yeniden giriş adımı: oturum kapatılır (çerezler temizlenir), ortamın giriş tarifiyle (isteğe bağlı başka giriş
      // profiliyle) yeniden girilir; alan / aksiyon yok.
      ...(nesneMi(adim.yenidenGiris) ? { yenidenGiris: { profil: typeof adim.yenidenGiris.profil === 'string' && adim.yenidenGiris.profil.trim() ? adim.yenidenGiris.profil.trim() : null } } : {})
    };
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
  // Modelde "akışta zorunlu" (mutlakaGorunmeli) işaretli, görünür olması beklenen alanlar da (değeri olmasa bile) denetlenir.
  for (const adim of sirali) {
    for (const bolum of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const alan of Array.isArray(bolum.alanlar) ? bolum.alanlar : []) {
        if (nesneMi(alan) && alan.mutlakaGorunmeli === true && typeof alan.id === 'string' && gorunurluk.alanlar[alan.id] !== false) mutlaka.add(alan.id);
      }
    }
  }
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
              id, etiket: etiketi(alan), anahtar: senaryoAnahtarlari(alan)[0] ?? id, tip: alan.tip,
              // Özel açılır listenin gerçek <select>'i gizlidir: görünürlük bileşenle denetlenir (doldurucu korunur).
              doldurucu: alan.doldurucu === 'ozelSecim' ? 'ozelSecim' : null, deger: null,
              secici: alan.konum.secici, yardimci: {}, cerceve: Array.isArray(alan.konum.cerceve) && alan.konum.cerceve.length ? alan.konum.cerceve.map(String) : null,
              secenekler: [], parametreler: {}, mutlakaGorunmeli: true, atla: null, yalnizGorunurluk: true
            });
          }
        }
      }
    }
  }
  return { ekranUrl: typeof model.ekranUrl === 'string' ? model.ekranUrl : '/', adimlar, beklenen, baglamProfili, hatalar };
}

/**
 * Senaryo verisi + boş bırakılan tek anahtarlı senaryo alanlarının varsayılan değerleri (dosya hariç: varsayılan dosya
 * Ayarlar > Dosyalar'dan gelir). Senaryonun bilerek boş bıraktığı alanlar (olumsuz senaryo; bilerekBos) varsayılanı da almaz.
 * @param {any} model @param {Record<string, unknown>} veri @returns {Record<string, unknown>}
 */
function varsayilanlariUygula(model, veri) {
  const sonuc = { ...veri };
  const bilerekBos = new Set(bilerekBosAnahtarlari(veri));
  for (const adim of Array.isArray(model.adimlar) ? model.adimlar : []) {
    for (const bolum of adim && Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      for (const alan of bolum && Array.isArray(bolum.alanlar) ? bolum.alanlar : []) {
        if (!alan || alan.yapilandirma !== 'senaryo' || alan.tip === 'dosya' || alan.tip === 'kimlikProfili') continue;
        const anahtarlar = senaryoAnahtarlari(alan);
        if (anahtarlar.length !== 1 || !bosMu(sonuc[anahtarlar[0]]) || bilerekBos.has(anahtarlar[0])) continue;
        if (nesneMi(alan.varsayilan) && !bosMu(alan.varsayilan.deger)) sonuc[anahtarlar[0]] = alan.varsayilan.deger;
      }
    }
  }
  return sonuc;
}

/**
 * Profil / senaryo değerindeki seçim ({ deger, metin } — test verisinde JSON metni olarak da saklanır) → deger; diğerleri aynen.
 * @param {unknown} v
 */
function secimDegeri(v) {
  if (nesneMi(v) && 'deger' in v) return String(v.deger);
  if (typeof v === 'string' && /^\s*\{/.test(v)) {
    try {
      const o = JSON.parse(v);
      if (nesneMi(o) && 'deger' in o) return String(o.deger);
    } catch {
      // JSON değil: metin olarak kalır.
    }
  }
  return v;
}

/**
 * "bugun", "bugun+7", "bugun-3" → biçimli tarih (Europe/Istanbul günü; biçim: gg, aa, yyyy parçaları; varsayılan
 * gg.aa.yyyy). Göreli ifade değilse null. @param {string} ifade @param {string} [bicim] @param {Date} [simdi]
 */
export function goreliTarih(ifade, bicim = 'gg.aa.yyyy', simdi = new Date()) {
  const m = /^bugun(?:\s*([+-])\s*(\d{1,4}))?$/.exec(String(ifade).trim());
  if (!m) return null;
  const [y, a, g] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(simdi).split('-').map(Number);
  const t = new Date(Date.UTC(y, a - 1, g + (m[1] === '-' ? -1 : 1) * Number(m[2] ?? 0)));
  const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return bicim.replace('yyyy', String(t.getUTCFullYear())).replace('aa', iki(t.getUTCMonth() + 1)).replace('gg', iki(t.getUTCDate()));
}

/** Alanın sabit değeri (tarihte göreli ifade koşu anında hesaplanır). @param {any} alan @param {Date} [simdi] */
function sabitDegeriCoz(alan, simdi) {
  const d = alan.sabitDeger;
  if (alan.tip === 'tarih' && typeof d === 'string') return goreliTarih(d, typeof alan.bicim === 'string' ? alan.bicim : 'gg.aa.yyyy', simdi) ?? d;
  return d;
}

/**
 * Seçim/oklu seçim alanında senaryo değerine karşılık gelen seçenek: ekrandaki değer (deger) ve görünen metin.
 * @param {Array<{ deger: string; metin?: string | null; senaryoDegeri?: string; formMetni?: string; secici?: string }>} secenekler
 * @param {unknown} deger
 */
/**
 * Kimlik alt alanının profil alanı referansı: "ad" | { ad, dilim?: [baş, son?] } | { <kimlik türü>: "ad" | { ad, dilim } }.
 * @param {unknown} k @param {string | null} tur @returns {{ ad: string | null; dilim: [number, number | undefined] | null }}
 */
export function kimlikAlaniCoz(k, tur) {
  const ref = typeof k === 'string' || (nesneMi(k) && typeof /** @type {any} */ (k).ad === 'string') ? k : nesneMi(k) && tur ? /** @type {any} */ (k)[tur] : null;
  if (typeof ref === 'string') return { ad: ref, dilim: null };
  if (!nesneMi(ref) || typeof ref.ad !== 'string') return { ad: null, dilim: null };
  const d = Array.isArray(ref.dilim) && Number.isInteger(ref.dilim[0]) ? /** @type {[number, number | undefined]} */ ([ref.dilim[0], Number.isInteger(ref.dilim[1]) ? ref.dilim[1] : undefined]) : null;
  return { ad: ref.ad, dilim: d };
}

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
