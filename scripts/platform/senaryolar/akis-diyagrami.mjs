// SENARYO AKIŞ DİYAGRAMI (genel, saf) — ekran modelinden ve senaryonun güncel görünürlüklerinden
// senaryonun akışını (başlangıç → adımlar → bitiş) çıkarır; son koşunun adım sonuçlarını adımlara eşler.
// Akış YAPISI buradan değişmez (adım sırası, koşullar: ekran modelinin işi). Senaryo sayfasında diyagram senaryo düzeyinde
// düzenlenir (aşama 3b: değerler, dahil adımlar, giriş, beklenen sonuç); kutuların doğrulama hataları: hataDugumleri().
//
//  - Import YOK, DOM YOK: platform arayüzü bu dosyayı /arayuz/akis-diyagrami.mjs olarak yükler; birim
//    testleri aynı dosyayı kullanır. Görünürlük burada HESAPLANMAZ: tek doğrulayıcının
//    (gorunurlukleriHesapla) sonucu parametre olarak gelir.
//  - Hiçbir projeye özgü ad içermez; adım/alan/koşul metinleri yalnızca modelden okunur.
//  - Adım sonuçları, model koşucusunun (tests/support/model-kosucu.ts) test.step başlıklarıyla eşlenir:
//    başlangıç adımları BASLANGIC_ADIMLARI (+ "Bağlam değiştirilir (…)"), model adımları adımın başlığı.
// Tipler: akis-diyagrami.d.mts.

/** Model koşucusunun ekran öncesi adım başlıkları (model-kosucu.ts ile AYNI olmalı; birim testi denetler). */
export const BASLANGIC_ADIMLARI = Object.freeze(['Sisteme giriş yapılır', 'Ekran açılır']);
/** Bağlam değiştirme adımının başlık öneki (başlık "Bağlam değiştirilir (<profil>)"). */
export const BAGLAM_ADIMI_ONEKI = 'Bağlam değiştirilir';
/** Diyagramda gösterilmeyen alan tipleri (düğmeler ilerleme olarak, çıktılar bitişte gösterilir). */
const ALAN_DISI_TIPLER = new Set(['buton', 'cikti']);
/** SQL adımının beklenen sonuç türü → kısa metin (sql/sql-adimi.mjs; bu dosya tarayıcıda da çalışır, içe aktarmaz). @type {Record<string, string>} */
const SQL_BEKLENEN_METNI = { satirSayisi: 'satır sayısı denetlenir', sutunDegeri: 'ilk satırdaki değer denetlenir', bosDegil: 'sonuç boş olmamalı', bos: 'sonuç boş olmalı', tabloEsit: 'sonuç tabloyla karşılaştırılır' };

function nesneMi(d) {
  return typeof d === 'object' && d !== null && !Array.isArray(d);
}
function etiketi(alan) {
  const e = alan.etiket;
  return (e && typeof e === 'object' && e.form) || (alan.form && alan.form.etiket) || (e && typeof e === 'object' && e.ekran) || alan.id;
}
const tirnak = (m) => `“${m}”`;

/** Modeldeki tüm alanlar (adım bölümleri + senaryo düzeyi), kimliğe göre. */
function alanHaritasi(model) {
  const harita = new Map();
  for (const adim of model.adimlar || []) {
    for (const bolum of adim.bolumler || []) for (const a of bolum.alanlar || []) if (a && a.id) harita.set(a.id, a);
  }
  const sd = nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : [];
  for (const a of sd) if (a && a.id && !harita.has(a.id)) harita.set(a.id, a);
  return harita;
}

/** Seçeneğin görünen metni (senaryo değeri ya da ekran değeri eşleşir; yoksa değerin kendisi). */
function secenekMetni(alan, deger) {
  const liste = alan && Array.isArray(alan.secenekler) ? alan.secenekler : [];
  const s = liste.find((x) => x && (String(x.senaryoDegeri ?? x.deger) === String(deger) || String(x.deger) === String(deger)));
  return s ? String(s.formMetni || s.metin || deger) : String(deger);
}

/** Koşul ifadesinin Türkçe okunuşu (ör. "Müşteri tipi = Kurumsal"). */
export function ifadeMetni(ifade, model, harita = alanHaritasi(model)) {
  if (!nesneMi(ifade)) return 'koşullu';
  if (Array.isArray(ifade.ve)) return ifade.ve.map((x) => ifadeMetni(x, model, harita)).join(' ve ');
  if (Array.isArray(ifade.veya)) return ifade.veya.map((x) => ifadeMetni(x, model, harita)).join(' ya da ');
  if ('degil' in ifade) return `${ifadeMetni(ifade.degil, model, harita)} değilse`;
  if (typeof ifade.alan === 'string') {
    const alan = harita.get(ifade.alan);
    const ad = alan ? etiketi(alan) : ifade.alan;
    if (Array.isArray(ifade.icinde)) return `${ad} = ${ifade.icinde.map((d) => secenekMetni(alan, d)).join(' ya da ')}`;
    if (typeof ifade.esit === 'boolean' && alan && alan.tip === 'onayKutusu') return `${ad} ${ifade.esit ? 'işaretli' : 'işaretsiz'}`;
    return `${ad} = ${secenekMetni(alan, ifade.esit)}`;
  }
  if (typeof ifade.senaryoAyari === 'string') {
    const alan = harita.get(ifade.senaryoAyari);
    const ad = alan ? etiketi(alan) : ifade.senaryoAyari;
    if (ifade.esit === true) return `${ad} işaretli`;
    if (ifade.esit === false) return `${ad} işaretsiz`;
    return `${ad} = ${secenekMetni(alan, ifade.esit)}`;
  }
  if (ifade.calismaZamani === 'gorunurse') return 'ekranda görünürse';
  return 'koşullu';
}

/**
 * Görünürlük tanımının kısa okunuşu (ör. "Müşteri tipi = Kurumsal"). İfade okunamıyorsa (ör. bağlama bağlı koşul)
 * adlandırılmış koşulun açıklaması kullanılır.
 */
export function gorunurlukMetni(gorunurluk, model, harita = alanHaritasi(model)) {
  if (!nesneMi(gorunurluk)) return null;
  if (typeof gorunurluk.kosul === 'string') {
    const k = nesneMi(model.kosullar) ? model.kosullar[gorunurluk.kosul] : null;
    if (!k) return 'koşullu';
    const metin = ifadeMetni(k.ifade, model, harita);
    return metin.includes('koşullu') && typeof k.aciklama === 'string' && k.aciklama.trim() ? k.aciklama.trim() : metin;
  }
  return ifadeMetni(gorunurluk.ifade, model, harita);
}

/** Adımı isteğe bağlı yapan senaryo ayarı ({ senaryoAyari, esit: true }) varsa ayarın kimliği. */
function kapsamAyari(model, gorunurluk) {
  if (!nesneMi(gorunurluk)) return null;
  const ifade = typeof gorunurluk.kosul === 'string'
    ? nesneMi(model.kosullar) && nesneMi(model.kosullar[gorunurluk.kosul]) ? model.kosullar[gorunurluk.kosul].ifade : null
    : gorunurluk.ifade;
  return nesneMi(ifade) && typeof ifade.senaryoAyari === 'string' && ifade.esit === true ? ifade.senaryoAyari : null;
}

/** Aksiyonun okunuşu. */
function aksiyonMetni(a) {
  if (a.tur === 'tikla') return `${tirnak(typeof a.aciklama === 'string' && a.aciklama ? a.aciklama : 'düğme')} düğmesine ${a.kosul === 'gorunurse' ? 'görünürse ' : ''}basılır`;
  if (a.tur === 'bekle' && Number.isInteger(a.sureSn)) return `${a.sureSn} sn beklenir`;
  if (a.tur === 'bekle') return a.durum === 'gizli' ? 'Öğe kaybolana kadar beklenir' : 'Öğe görünene kadar beklenir';
  return null;
}

/** Başarı göstergesinin okunuşu. */
function gostergeMetni(g) {
  // "veya": seçeneklerden herhangi biri.
  if (nesneMi(g) && g.tur === 'veya' && Array.isArray(g.secenekler)) {
    const metinler = g.secenekler.map((s) => gostergeMetni(s)).filter(Boolean);
    return metinler.length ? metinler.join(' VEYA ') : null;
  }
  if (!nesneMi(g) || typeof g.deger !== 'string' || !g.deger) return null;
  if (g.tur === 'metin') return `${tirnak(g.deger)} metni görünür`;
  if (g.tur === 'url') return `Adres ${tirnak(g.deger)} içerir`;
  return 'Sonuç öğesi ekranda görünür';
}

/**
 * Akış diyagramı.
 * @param {object} model ekran modeli
 * @param {{ gorunurluk?: { adimlar?: Record<string, boolean | null>; alanlar?: Record<string, boolean | null> } | null;
 *   beklenen?: { hataAdimi?: string | null; mesaj?: string | null } | null;
 *   sonuc?: { durum: string; adimlar?: Array<{ ad: string; durum: string; sureMs?: number | null; hataMesaji?: string | null }> } | null;
 *   giris?: { kip: string; profil?: string | null } | null }} [s] giris: senaryonun giriş seçimi (senaryo-girisi.mjs; yoksa ortamın girişiyle)
 */
export function akisDiyagrami(model, s = {}) {
  if (!nesneMi(model) || !Array.isArray(model.adimlar)) throw new Error('Geçersiz ekran modeli (adimlar yok).');
  const harita = alanHaritasi(model);
  const g = s.gorunurluk || {};
  const gAdim = g.adimlar || {};
  const gAlan = g.alanlar || {};
  const hataAdimi = s.beklenen && s.beklenen.hataAdimi ? s.beklenen.hataAdimi : null;
  const degerler = nesneMi(s.degerler) ? s.degerler : null;
  const sirali = model.adimlar.slice().sort((a, b) => (a.sira || 0) - (b.sira || 0));
  const hataSirasi = hataAdimi ? sirali.findIndex((a) => a.id === hataAdimi) : -1;

  const adimlar = sirali.map((adim, i) => {
    const ayar = kapsamAyari(model, adim.gorunurluk);
    const ayarAlani = ayar ? harita.get(ayar) : null;
    const kapsamda = gAdim[adim.id];
    const hedefSonrasi = hataSirasi >= 0 && i > hataSirasi;
    const alanlar = [];
    for (const bolum of adim.bolumler || []) {
      for (const a of bolum.alanlar || []) {
        if (!a || !a.id || ALAN_DISI_TIPLER.has(a.tip)) continue;
        const kosul = a.gorunurluk ? gorunurlukMetni(a.gorunurluk, model, harita) : bolum.gorunurluk ? gorunurlukMetni(bolum.gorunurluk, model, harita) : null;
        const v = gAlan[a.id];
        const deger = degerler && typeof degerler[a.id] === 'string' && degerler[a.id] ? degerler[a.id] : null;
        alanlar.push({ id: a.id, etiket: String(etiketi(a)), kosul, buSenaryoda: v === undefined ? true : v, zorunlu: a.mutlakaGorunmeli === true, ...(degerler ? { deger } : {}) });
      }
    }
    const kosu = nesneMi(adim.kosu) ? adim.kosu : {};
    const aksiyonlar = Array.isArray(kosu.aksiyonlar) ? kosu.aksiyonlar.filter(nesneMi) : [];
    const tikla = aksiyonlar.filter((x) => x.tur === 'tikla');
    const kapsamEtiketi = ayar ? String(ayarAlani ? etiketi(ayarAlani) : ayar) : !ayar && adim.gorunurluk ? gorunurlukMetni(adim.gorunurluk, model, harita) : null;
    const kosulur = hedefSonrasi ? false : kapsamda === undefined ? true : kapsamda;
    return {
      id: adim.id, no: i + 1, baslik: String(adim.baslik || adim.id),
      istegeBagli: Boolean(ayar),
      kapsamEtiketi,
      // Bu senaryoda koşulur mu? false: kapsam dışı ya da beklenen hata adımından sonra; null: bilinmiyor.
      kosulur,
      // Koşulmuyorsa nedeni (diyagramda soluk kutunun altında yazılır).
      neden: kosulur !== false ? null
        : hedefSonrasi ? 'Beklenen hata daha önceki bir adımda: akış orada biter.'
          : ayar ? `${tirnak(kapsamEtiketi)} bu senaryoda işaretli değil.`
            : kapsamEtiketi ? `Koşul sağlanmıyor: ${kapsamEtiketi}.` : 'Koşul sağlanmıyor.',
      altAkis: nesneMi(adim.altModel) ? String(adim.altModel.bolum || adim.altModel.dosya || '') || null : null,
      // SQL sorgusu adımı: veritabanı sorgusu beklenenle karşılaştırılır (alan yok).
      sqlOzeti: nesneMi(adim.sqlKontrolu) ? `SQL sorgusu: ${SQL_BEKLENEN_METNI[adim.sqlKontrolu.beklenen?.tur] ?? 'sonuç beklenenle karşılaştırılır'}` : null,
      // İndirilen dosyayı doğrulama adımı: düğmeye basılır, dosya beklentilerle doğrulanır (alan yok).
      dosyaOzeti: nesneMi(adim.dosyaKontrolu)
        ? `İndirilen dosya doğrulanır: ${Array.isArray(adim.dosyaKontrolu.beklentiler) ? adim.dosyaKontrolu.beklentiler.length : 0} beklenti${nesneMi(adim.dosyaKontrolu.tetikleyici) && typeof adim.dosyaKontrolu.tetikleyici.aciklama === 'string' ? ` (“${adim.dosyaKontrolu.tetikleyici.aciklama}” düğmesiyle)` : ''}`
        : null,
      // Yeniden giriş adımı: oturum kapatılır, ortamın giriş tarifiyle (isteğe bağlı başka profille) yeniden girilir.
      yenidenGiris: nesneMi(adim.yenidenGiris) ? { profil: typeof adim.yenidenGiris.profil === 'string' && adim.yenidenGiris.profil ? adim.yenidenGiris.profil : null } : null,
      alanlar,
      ilerleme: tikla.map((x) => (typeof x.aciklama === 'string' && x.aciklama ? x.aciklama : 'düğme')),
      // Adımdan sonraki bağlantıda okunan aksiyonlar, sırayla (düğmeye basma, süreli ya da öğeye bağlı bekleme).
      aksiyonMetinleri: aksiyonlar.map(aksiyonMetni).filter(Boolean),
      gosterge: gostergeMetni(kosu.basariGostergesi),
      hedef: /** @type {'basari' | 'hata' | null} */ (null),
      sonuc: /** @type {null | { durum: string; sureMs: number | null; hataMesaji: string | null }} */ (null)
    };
  });

  // Hedef adım: beklenen hata adımı ya da koşulan son adım.
  const kosulanlar = adimlar.filter((a) => a.kosulur !== false);
  const hedef = hataAdimi && hataSirasi >= 0 ? adimlar[hataSirasi] : kosulanlar[kosulanlar.length - 1] || null;
  if (hedef) hedef.hedef = hataAdimi && hataSirasi >= 0 ? 'hata' : 'basari';

  // Son koşunun adım sonuçları: başlıkla eşleşir (aynı başlık iki kez geçerse sırayla).
  const sonuc = nesneMi(s.sonuc) ? s.sonuc : null;
  const kalan = sonuc && Array.isArray(sonuc.adimlar) ? sonuc.adimlar.filter((x) => nesneMi(x) && typeof x.ad === 'string').slice() : [];
  const al = (esles) => {
    const i = kalan.findIndex((x) => esles(x.ad));
    return i < 0 ? null : kalan.splice(i, 1)[0];
  };
  const ozet = (x) => ({ durum: String(x.durum), sureMs: typeof x.sureMs === 'number' ? x.sureMs : null, hataMesaji: typeof x.hataMesaji === 'string' ? x.hataMesaji : null });

  const baslangicSonuclari = [];
  if (sonuc) {
    for (const ad of BASLANGIC_ADIMLARI) { const x = al((a) => a === ad); if (x) baslangicSonuclari.push(x); }
    for (let x = al((a) => a.startsWith(BAGLAM_ADIMI_ONEKI)); x; x = al((a) => a.startsWith(BAGLAM_ADIMI_ONEKI))) baslangicSonuclari.push(x);
  }
  if (sonuc) {
    for (const a of adimlar) {
      if (a.kosulur === false) continue;
      const x = al((ad) => ad === a.baslik);
      a.sonuc = x ? ozet(x) : { durum: 'kosulmadi', sureMs: null, hataMesaji: null };
    }
  }
  const baslangicDurumu = !sonuc ? null
    : baslangicSonuclari.some((x) => x.durum === 'basarisiz') ? 'basarisiz'
      : baslangicSonuclari.some((x) => x.durum === 'durduruldu') ? 'durduruldu'
        : baslangicSonuclari.length ? 'basarili' : 'kosulmadi';
  const baslangicHatasi = baslangicSonuclari.find((x) => x.durum === 'basarisiz');

  // Giriş: model girişsizse her zaman girişsiz; değilse senaryonun seçimi (senaryo-girisi.mjs ile aynı kural).
  const secim = nesneMi(s.giris) ? s.giris : null;
  const kip = model.girisGerekmez === true ? 'girissiz' : secim && (secim.kip === 'girissiz' || secim.kip === 'temiz') ? secim.kip : 'ortam';
  const girisProfili = kip !== 'girissiz' && secim && typeof secim.profil === 'string' && secim.profil ? secim.profil : null;
  const girisVar = kip !== 'girissiz';
  const girisNotu = [girisProfili ? `${girisProfili} profili` : '', kip === 'temiz' ? 'temiz oturum' : ''].filter(Boolean).join(', ');
  const son = hedef && hedef.hedef === 'basari' ? sirali.find((a) => a.id === hedef.id) : null;
  return {
    baslangic: {
      girisVar, kip, profil: girisProfili,
      metin: girisVar ? `Giriş (ortam tarifi${girisNotu ? `; ${girisNotu}` : ''}), ekran açılır`
        : model.girisGerekmez === true ? 'Girişsiz: ekran açılır (ekran giriş gerektirmez)' : 'Girişsiz: ekran açılır (senaryo girişsiz)',
      sonuc: baslangicDurumu ? { durum: baslangicDurumu, sureMs: null, hataMesaji: baslangicHatasi && typeof baslangicHatasi.hataMesaji === 'string' ? baslangicHatasi.hataMesaji : null } : null
    },
    adimlar,
    bitis: {
      tur: hataAdimi && hataSirasi >= 0 ? 'hata' : 'basari',
      metin: hataAdimi && hataSirasi >= 0
        ? `İş kuralı hatası beklenir${s.beklenen && s.beklenen.mesaj ? `: ${tirnak(s.beklenen.mesaj)}` : ''}`
        : (son && nesneMi(son.kosu) ? gostergeMetni(son.kosu.basariGostergesi) : null) || 'Son adım tamamlanır',
      durum: sonuc ? String(sonuc.durum) : null
    },
    // Son koşuda olup modelde karşılığı bulunmayan adımlar (koşudan sonra akış değişmiş olabilir).
    eslesmeyenler: kalan.map((x) => x.ad)
  };
}

/** Diyagram düğüm kimlikleri: başlangıç (giriş + senaryo ayarları), adımlar ("adim:<id>"), bitiş (beklenen sonuç). */
export const GIRIS_DUGUMU = 'giris';
export const SONUC_DUGUMU = 'sonuc';
export const adimDugumu = (adimId) => `adim:${adimId}`;

/** Form kontrol anahtarı (model-formu.mjs: "<anahtar>", "<id>#kip", "<id>.<alt>", "<anahtar>#ozel" …) bu alana mı ait? */
function alanaAit(anahtar, alan) {
  return [alan.anahtar, alan.id].filter((x) => typeof x === 'string' && x)
    .some((on) => anahtar === on || anahtar.startsWith(`${on}.`) || anahtar.startsWith(`${on}#`));
}

/**
 * Form kontrol anahtarının diyagramdaki düğümleri (form şeması: formSemasiOlustur). Başlık ve senaryo düzeyi alanlar giriş
 * düğümünde, beklenen sonuç bitişte, adım alanları kendi adımında; isteğe bağlı adım ayarı grubundaki her adımda. Eşleşmezse [].
 * @param {string} anahtar @param {any} sema @returns {string[]}
 */
export function kontrolDugumleri(anahtar, sema) {
  const k = String(anahtar || '');
  if (!k || !nesneMi(sema)) return [];
  if (k === sema.baslik) return [GIRIS_DUGUMU];
  const bs = sema.beklenenSonuc;
  if (nesneMi(bs) && (k === bs.anahtar || k.startsWith(`${bs.anahtar}.`))) return [SONUC_DUGUMU];
  const grup = (sema.adimKapsami || []).find((g) => g.ayar === k);
  if (grup) return grup.adimlar.map(adimDugumu);
  for (const adim of sema.adimlar || []) {
    for (const b of adim.bolumler || []) if ((b.alanlar || []).some((a) => alanaAit(k, a))) return [adimDugumu(adim.id)];
  }
  if ((sema.senaryoAlanlari || []).some((a) => alanaAit(k, a))) return [GIRIS_DUGUMU];
  return [];
}

/**
 * Doğrulama hatalarının düğümlere dağılımı: hatalariDagit(...).alanlar (kontrol → mesajlar) → düğüm → mesajlar.
 * @param {Record<string, string[]>} alanHatalari @param {any} sema @returns {Record<string, string[]>}
 */
export function hataDugumleri(alanHatalari, sema) {
  /** @type {Record<string, string[]>} */
  const sonuc = {};
  for (const [anahtar, mesajlar] of Object.entries(alanHatalari || {})) {
    for (const d of kontrolDugumleri(anahtar, sema)) (sonuc[d] = sonuc[d] || []).push(...(Array.isArray(mesajlar) ? mesajlar : []));
  }
  return sonuc;
}