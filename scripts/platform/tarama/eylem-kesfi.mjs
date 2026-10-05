// EYLEM VE DOĞRULAMA KEŞFİ — saf kurallar (genel; hiçbir proje / ürün / şirket adı içermez). Tarama düğmelere BASMAZ; bu yüzden
// gönderim düğmesi, başarı mesajı, hata alanları, yönlendirme ve bekleme göstergesi yalnız sayfadaki İZLERDEN tahmin edilir
// (tarama/eylem-kesfi-motoru.ts izleri toplar ve seçiciyi üretir; burada puanlanır, sıralanır ve güven düzeyi verilir):
//   gönderim  form içindeki type=submit (güçlü) · form dışında eylem metinli düğme — Hesapla / Gönder / Devam… (olası) · onclick'li
//             ya da adı eylem çağrıştırmayan düğme (tahmin). Temizle / Geri / İptal gibi düğmeler sona düşer. "Kayıt oluşturabilir"
//             ipucu (Kaydet / Onayla / Satın al / Öde / Gönder…) yalnız uyarıdır.
//   başarı    gizli duran başarı kutusu (.alert-success vb.), role=status / aria-live bölgeleri, gizli "…alındı / …başarılı / …hazır" metinleri.
//   hata      .invalid-feedback ve benzeri hata kapları (grup seçicisi; adet), role=alert, aria-describedby ile alana bağlı kaplar, aria-invalid izi.
//   yönlendirme  form action, eylem metinli bağlantılar, onclick içindeki adres (yalnız YOL; sorgu ve köken yazılmaz).
//   bekleme   spinner / yükleniyor öğeleri, role=progressbar, aria-busy (ileride "Devam" etiketi önerisi için).
// Aday bilgisi ÖNERİDİR: modele yeni alan eklenmez. Seçilen aday "Düğmeyi ve sonucu işaretle"deki seçilen öğe biçimine (oge) çevrilir
// ve mevcut alanlara yazılır (düğme → kosu.aksiyonlar, başarı → kosu.basariGostergesi, hata → kosu.hataGostergesi).
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: eylem-kesfi.d.mts.

/** Güven düzeyleri (güçlüden zayıfa). */
export const GUVEN_DUZEYLERI = Object.freeze(['guclu', 'olasi', 'tahmin']);
/** Güven düzeylerinin kullanıcıya görünen adları. */
export const GUVEN_ADLARI = Object.freeze({ guclu: 'güçlü', olasi: 'olası', tahmin: 'tahmin' });
/** Aday türü başına en çok aday. */
export const ADAY_EN_COK = Object.freeze({ gonderim: 8, basari: 6, hata: 6, bekleme: 6, yonlendirme: 6 });

/*
 * Metin kalıpları KATLANMIŞ metinde aranır (küçük harf; ı/İ → i, ç → c, ğ → g, ö → o, ş → s, ü → u): "GÖNDER", "Gönder" ve
 * "gonder" aynı sayılır. Kalıplar genel eylem / durum sözcükleridir (Türkçe ve İngilizce).
 */
export const KALIPLAR = Object.freeze({
  /** Gönderim / ilerleme eylemi. */
  eylem: '\\b(hesapla\\w*|gonder\\w*|kaydet\\w*|devam\\w*|ileri|onayla\\w*|tamamla\\w*|sorgula\\w*|ara|bul|listele|getir|basvur\\w*|olustur\\w*|ekle|uygula|satin al\\w*|ode|odeme yap\\w*|siparis\\w*|submit|send|save|continue|next|confirm|calculate|search|apply|finish|complete|create|add|pay|buy|order|proceed|go)\\b',
  /** Kayıt oluşturabilecek / geri alınamaz eylem (yalnız uyarı). */
  kayit: '\\b(kaydet\\w*|onayla\\w*|tamamla\\w*|satin al\\w*|ode|odeme\\w*|siparis\\w*|gonder\\w*|basvur\\w*|olustur\\w*|sil|save|submit|confirm|pay|payment|buy|purchase|order|create|delete|complete|finish)\\b',
  /** Gönderim olmayan düğme (temizleme, geri dönme, kapatma…). */
  olumsuz: '\\b(temizle\\w*|sifirla\\w*|iptal\\w*|vazgec\\w*|geri|kapat\\w*|cikis\\w*|sil|kaldir|yazdir\\w*|indir\\w*|yardim|reset|clear|cancel|back|close|logout|delete|remove|print|download|help)\\b',
  /** Başarı metni. */
  basariMetni: '(alindi|basari\\w*|tamamlandi|hazir|olusturuldu|kaydedildi|gonderildi|tesekkur\\w*|onaylandi|iletildi|guncellendi|success\\w*|thank\\w*|received|completed|ready|saved|submitted|created|confirmed)',
  /** Hata metni. */
  hataMetni: '(hata\\w*|gecersiz|zorunlu|eksik|bos birakilamaz|uygun degil|basarisiz|error|invalid|required|failed|\\bmust\\b)',
  /** Bekleme metni. */
  beklemeMetni: '(yukleniyor|bekleyin|hesaplaniyor|isleniyor|gonderiliyor|sorgulaniyor|onaylaniyor|hazirlaniyor|olusturuluyor|kaydediliyor|dogrulaniyor|aktariliyor|kontrol ediliyor|loading|please wait|processing|calculating|^\\d{1,3} ?%$)',
  /** Başarı kutusu sınıf parçası. */
  basariSinifi: '(^|[-_])(success|basari|basarili)([-_]|$)',
  /** Hata kabı sınıf parçası (form alanının kendisi hariç). */
  hataSinifi: '(^|[-_])(error|errors|danger|invalid|hata|validation)([-_]|$)',
  /** Bilinen alan hatası kapları (güçlü). */
  alanHataSinifi: '^(invalid-feedback|invalid-tooltip|field-validation-error|parsley-errors-list|error-message|field-error|form-error|validation-message|help-block)$',
  /** Bekleme göstergesi sınıf parçası. */
  beklemeSinifi: '(^|[-_])(spinner|spin|loading|loader|preloader|yukleniyor|busy|progress|blockui|blockoverlay|blockmsg)([-_]|$)'
});

/** Metni kalıp aramasına hazırlar (küçük harf, Türkçe harfler katlanır, boşluklar tek). @param {unknown} m */
export function katla(m) {
  if (typeof m !== 'string') return '';
  return m.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
    .replace(/\u0307/g, '').replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/\s+/g, ' ').trim();
}

/** @param {keyof typeof KALIPLAR} ad @param {unknown} m */
export function kalipVar(ad, m) {
  return new RegExp(KALIPLAR[ad], 'i').test(katla(m));
}

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** @param {unknown} d @param {number} n */
const metin = (d, n) => (typeof d === 'string' && d.trim() ? d.replace(/\s+/g, ' ').trim().slice(0, n) : null);
const SECICI_EN_UZUN = 500;
/** @param {unknown} s */
const seciciGecerli = (s) => typeof s === 'string' && s.trim() !== '' && s.length <= SECICI_EN_UZUN && !/[\r\n]/.test(s) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s.trim());
const KIRILGANLIKLAR = ['dusuk', 'orta', 'yuksek'];
const SECICI_TURLERI = ['rol', 'metin', 'kimlik', 'etiket', 'css'];
/** Adres → yalnız yol (sorgu, parça ve köken atılır). @param {unknown} a */
const yalnizYol = (a) => {
  if (typeof a !== 'string' || !a.startsWith('/') || a.startsWith('//')) return null;
  return a.split(/[?#]/)[0].slice(0, 300) || null;
};
/** @param {number} p @param {number} guclu @param {number} olasi @returns {'guclu' | 'olasi' | 'tahmin'} */
const duzey = (p, guclu, olasi) => (p >= guclu ? 'guclu' : p >= olasi ? 'olasi' : 'tahmin');

/**
 * Gönderim düğmesi izi → puan, güven, gerekçe.
 * @param {import('./eylem-kesfi.d.mts').HamEylemIzi} iz
 */
function gonderimPuani(iz) {
  /** @type {string[]} */
  const gerekce = [];
  let p = 10;
  const eylem = kalipVar('eylem', iz.metin);
  const olumsuz = kalipVar('olumsuz', iz.metin);
  if (iz.submit && iz.formIci) { p += 60; gerekce.push('form içinde gönderim (submit) düğmesi'); }
  else if (iz.formIci) { p += 5; gerekce.push('form içinde'); } else gerekce.push('form dışında');
  if (eylem) { p += 30; gerekce.push('eylem metni'); }
  if (iz.onclick) { p += 10; gerekce.push('tıklama betiği (onclick)'); }
  if (olumsuz) { p -= 60; gerekce.push('gönderim olmayan eylem (ör. temizle, geri)'); }
  if (!iz.metin) { p -= 10; gerekce.push('yazısız'); }
  if (iz.devreDisi) { p -= 5; gerekce.push('şu an devre dışı'); }
  /** @type {'guclu' | 'olasi' | 'tahmin'} */
  const guven = iz.submit && iz.formIci ? (olumsuz ? 'olasi' : 'guclu') : eylem && !olumsuz ? 'olasi' : 'tahmin';
  return { puan: p, guven, gerekce };
}

/** @param {import('./eylem-kesfi.d.mts').HamEylemIzi} iz */
function basariPuani(iz) {
  /** @type {string[]} */
  const gerekce = [];
  const m = kalipVar('basariMetni', iz.metin) && !kalipVar('hataMetni', iz.metin);
  let p = 0;
  if (iz.sinif) { p += 40; gerekce.push(`başarı sınıfı (.${iz.sinif})`); }
  if (iz.rol === 'status' || iz.canliBolge) { p += 15; gerekce.push(iz.rol === 'status' ? 'role=status' : 'aria-live bölgesi'); }
  if (m) { p += 30; gerekce.push('başarı metni'); }
  if (iz.gizli) { p += 15; gerekce.push('şu an gizli (eylemden sonra görünür)'); } else if (iz.metin) { p -= 10; gerekce.push('şu an görünür'); }
  if (!iz.metin) { p -= 15; gerekce.push('metni yok'); }
  /** @type {'guclu' | 'olasi' | 'tahmin'} */
  const guven = iz.sinif && m && iz.gizli ? 'guclu' : ((iz.sinif || iz.rol === 'status' || iz.canliBolge) && (m || (iz.gizli && iz.metin))) || (iz.gizli && m) ? 'olasi' : 'tahmin';
  return { puan: p, guven, gerekce };
}

/** @param {import('./eylem-kesfi.d.mts').HamEylemIzi} iz */
function hataPuani(iz) {
  /** @type {string[]} */
  const gerekce = [];
  let p = 0;
  if (iz.sinif && new RegExp(KALIPLAR.alanHataSinifi, 'i').test(iz.sinif)) { p += 50; gerekce.push(`alan hata kabı (.${iz.sinif})`); }
  else if (iz.sinif) { p += 30; gerekce.push(`hata sınıfı (.${iz.sinif})`); }
  if (iz.rol === 'alert') { p += 35; gerekce.push('role=alert'); }
  if (iz.alanaBagli) { p += 20; gerekce.push('alana bağlı (aria-describedby / alanın yanında)'); }
  if ((iz.adet ?? 1) > 1) { p += 10; gerekce.push(`${iz.adet} öğe`); }
  if (kalipVar('hataMetni', iz.metin)) { p += 10; gerekce.push('hata metni'); }
  if (iz.ariaInvalid) { p += 5; gerekce.push(`sayfada ${iz.ariaInvalid} alanda aria-invalid`); }
  return { puan: p, guven: duzey(p, 60, 35), gerekce };
}

/** @param {import('./eylem-kesfi.d.mts').HamEylemIzi} iz */
function beklemePuani(iz) {
  /** @type {string[]} */
  const gerekce = [];
  let p = 0;
  if (iz.sinif) { p += 50; gerekce.push(`bekleme sınıfı (.${iz.sinif})`); }
  if (iz.rol === 'progressbar') { p += 50; gerekce.push('role=progressbar'); }
  if (iz.mesgul) { p += 40; gerekce.push('aria-busy'); }
  if (kalipVar('beklemeMetni', iz.metin)) { p += 30; gerekce.push('bekleme metni'); }
  if (iz.gizli) { p += 5; gerekce.push('şu an gizli'); }
  return { puan: p, guven: duzey(p, 50, 30), gerekce };
}

/**
 * Adayın "Düğmeyi ve sonucu işaretle"deki seçilen öğe karşılığı (düğme → aksiyon, başarı → başarı göstergesi, hata → hata
 * göstergesi). Bekleme göstergesinin model karşılığı yoktur (null).
 * @param {{ tur: string; secici: string; kirilganlik: string; seciciTuru: string; metin: string | null }} a
 * @returns {import('./oge-isaretleri.d.mts').SecilenOge | null}
 */
export function adayOgesi(a) {
  const tur = a.tur === 'gonderim' ? 'dugme' : a.tur === 'basari' ? 'basari' : a.tur === 'hata' ? 'hata' : null;
  if (!tur) return null;
  return {
    tur, secici: a.secici, kirilganlik: /** @type {any} */ (KIRILGANLIKLAR.includes(a.kirilganlik) ? a.kirilganlik : 'orta'),
    seciciTuru: /** @type {any} */ (SECICI_TURLERI.includes(a.seciciTuru) ? a.seciciTuru : 'css'),
    // Hata göstergesinde metin kullanılmaz (kabın kendisi okunur).
    metin: tur === 'hata' ? null : a.metin, adaySeciciler: [a.secici]
  };
}

/**
 * Sayfadaki izleri puanlar, güven düzeyi verir ve sıralar (en olası başta; eşitlikte sayfa sırası). Her türün ilki "enOlasi"dır.
 * @param {import('./eylem-kesfi.d.mts').HamEylemIzleri} ham
 * @param {{ gonderim?: number }} [sinir] tür başına en çok aday (varsayılan ADAY_EN_COK; hızlı test tüm düğmeleri listelemek için yükseltir)
 * @returns {import('./eylem-kesfi.d.mts').EylemAdaylari}
 */
export function eylemAdaylariniDegerlendir(ham, sinir = {}) {
  const izler = Array.isArray(ham?.izler) ? ham.izler : [];
  /** @param {'gonderim' | 'basari' | 'hata' | 'bekleme'} tur @param {(iz: import('./eylem-kesfi.d.mts').HamEylemIzi) => { puan: number; guven: 'guclu' | 'olasi' | 'tahmin'; gerekce: string[] }} puanla */
  const grup = (tur, puanla) => {
    const kaynak = tur === 'gonderim' ? 'dugme' : tur;
    const liste = izler.filter((iz) => iz.tur === kaynak && seciciGecerli(iz.secici)).map((iz, sira) => {
      const { puan, guven, gerekce } = puanla(iz);
      /** @type {import('./eylem-kesfi.d.mts').EylemAdayi} */
      const a = {
        anahtar: `${tur}:${iz.cerceve?.length ? `${iz.cerceve.join(' » ')} » ` : ''}${iz.secici}`, tur, secici: iz.secici, seciciTuru: SECICI_TURLERI.includes(iz.seciciTuru) ? iz.seciciTuru : 'css',
        kirilganlik: KIRILGANLIKLAR.includes(iz.kirilganlik) ? iz.kirilganlik : 'orta', metin: metin(iz.metin, 200), guven, puan, gerekce,
        gizli: iz.gizli === true, konum: iz.konum ?? null, enOlasi: false, oge: null
      };
      if (tur === 'gonderim') {
        a.kayitOlusturabilir = kalipVar('kayit', iz.metin); a.baglanti = iz.baglanti === true;
        if (iz.pencerede) a.pencerede = true;
        if (iz.arkada) a.arkada = true;
        if (iz.alanIkonu) a.alanIkonu = true;
      }
      if (tur === 'hata' && typeof iz.adet === 'number') a.adet = iz.adet;
      if (Array.isArray(iz.cerceve) && iz.cerceve.length) a.cerceve = iz.cerceve.map(String).slice(0, 2);
      a.oge = adayOgesi(a);
      return { a, sira };
    });
    // Gönderim kümeleri: açık pencerenin içindekiler önce, sonra sayfanın düğmeleri, pencerenin arkasındakiler, en sonda alan simgeleri.
    const kume = (/** @type {import('./eylem-kesfi.d.mts').EylemAdayi} */ a) => (a.alanIkonu ? 3 : a.pencerede ? 0 : a.arkada ? 2 : 1);
    const sonuc = liste.sort((x, y) => kume(x.a) - kume(y.a) || GUVEN_DUZEYLERI.indexOf(x.a.guven) - GUVEN_DUZEYLERI.indexOf(y.a.guven) || y.a.puan - x.a.puan || x.sira - y.sira)
      .map((x) => x.a).slice(0, (tur === 'gonderim' ? sinir.gonderim : undefined) ?? ADAY_EN_COK[tur]);
    if (sonuc[0]) sonuc[0].enOlasi = true;
    return sonuc;
  };
  const sayfaYolu = yalnizYol(ham?.sayfaYolu);
  /** @type {import('./eylem-kesfi.d.mts').YonlendirmeAdayi[]} */
  const yonlendirme = [];
  for (const y of Array.isArray(ham?.yonlendirmeler) ? ham.yonlendirmeler : []) {
    const adres = yalnizYol(y?.adres);
    if (!adres || adres === sayfaYolu || yonlendirme.some((x) => x.adres === adres)) continue;
    if (y.kaynak === 'baglanti' && !kalipVar('eylem', y.metin)) continue;
    yonlendirme.push({ adres, kaynak: y.kaynak === 'form' || y.kaynak === 'betik' ? y.kaynak : 'baglanti', metin: metin(y.metin, 120), guven: 'tahmin' });
  }
  // Form hedefi önce, sonra betik ve bağlantılar.
  const kaynakSirasi = ['form', 'betik', 'baglanti'];
  yonlendirme.sort((x, y) => kaynakSirasi.indexOf(x.kaynak) - kaynakSirasi.indexOf(y.kaynak));
  return {
    gonderim: grup('gonderim', gonderimPuani), basari: grup('basari', basariPuani), hata: grup('hata', hataPuani), bekleme: grup('bekleme', beklemePuani),
    yonlendirme: yonlendirme.slice(0, ADAY_EN_COK.yonlendirme), notlar: (Array.isArray(ham?.notlar) ? ham.notlar : []).map((n) => metin(n, 300)).filter((n) => n !== null).slice(0, 10)
  };
}

/** Boş aday kümesi. @returns {import('./eylem-kesfi.d.mts').EylemAdaylari} */
export function bosEylemAdaylari() {
  return { gonderim: [], basari: [], hata: [], bekleme: [], yonlendirme: [], notlar: [] };
}

/**
 * Alt süreçten (tarama envanteri) gelen aday kümesini doğrular: bilinmeyen alanlar atılır, seçiciler denetlenir, oge yeniden
 * üretilir. Biçim bozuksa null.
 * @param {unknown} ham @returns {import('./eylem-kesfi.d.mts').EylemAdaylari | null}
 */
export function eylemAdaylariniAyikla(ham) {
  if (!nesneMi(ham)) return null;
  const sonuc = bosEylemAdaylari();
  for (const tur of /** @type {const} */ (['gonderim', 'basari', 'hata', 'bekleme'])) {
    const liste = Array.isArray(ham[tur]) ? ham[tur] : [];
    for (const a of liste.slice(0, ADAY_EN_COK[tur])) {
      if (!nesneMi(a) || !seciciGecerli(a.secici) || !GUVEN_DUZEYLERI.includes(a.guven)) continue;
      const k = nesneMi(a.konum) && ['x', 'y', 'genislik', 'yukseklik'].every((x) => Number.isFinite(a.konum[x]))
        ? { x: Math.round(a.konum.x), y: Math.round(a.konum.y), genislik: Math.round(a.konum.genislik), yukseklik: Math.round(a.konum.yukseklik) } : null;
      /** @type {import('./eylem-kesfi.d.mts').EylemAdayi} */
      const t = {
        anahtar: `${tur}:${String(a.secici).trim()}`, tur, secici: String(a.secici).trim(), seciciTuru: SECICI_TURLERI.includes(a.seciciTuru) ? a.seciciTuru : 'css',
        kirilganlik: KIRILGANLIKLAR.includes(a.kirilganlik) ? a.kirilganlik : 'orta', metin: metin(a.metin, 200), guven: a.guven,
        puan: Number.isFinite(a.puan) ? Number(a.puan) : 0, gerekce: (Array.isArray(a.gerekce) ? a.gerekce : []).map((g) => metin(g, 120)).filter((g) => g !== null).slice(0, 8),
        gizli: a.gizli === true, konum: k, enOlasi: a.enOlasi === true, oge: null
      };
      if (tur === 'gonderim') {
        t.kayitOlusturabilir = a.kayitOlusturabilir === true; t.baglanti = a.baglanti === true;
        if (a.pencerede === true) t.pencerede = true;
        if (a.arkada === true) t.arkada = true;
        if (a.alanIkonu === true) t.alanIkonu = true;
      }
      if (tur === 'hata' && Number.isInteger(a.adet) && a.adet > 0) t.adet = a.adet;
      if (Array.isArray(a.cerceve) && a.cerceve.length && a.cerceve.every((c) => seciciGecerli(c))) {
        t.cerceve = a.cerceve.map(String).slice(0, 2);
        t.anahtar = `${tur}:${t.cerceve.join(' » ')} » ${t.secici}`;
      }
      t.oge = adayOgesi(t);
      if (!sonuc[tur].some((x) => x.anahtar === t.anahtar)) sonuc[tur].push(t);
    }
  }
  for (const y of (Array.isArray(ham.yonlendirme) ? ham.yonlendirme : []).slice(0, ADAY_EN_COK.yonlendirme)) {
    const adres = nesneMi(y) ? yalnizYol(y.adres) : null;
    if (!adres || !nesneMi(y)) continue;
    sonuc.yonlendirme.push({ adres, kaynak: y.kaynak === 'form' || y.kaynak === 'betik' ? y.kaynak : 'baglanti', metin: metin(y.metin, 120), guven: 'tahmin' });
  }
  sonuc.notlar = (Array.isArray(ham.notlar) ? ham.notlar : []).map((n) => metin(n, 300)).filter((n) => n !== null).slice(0, 10);
  return sonuc;
}
