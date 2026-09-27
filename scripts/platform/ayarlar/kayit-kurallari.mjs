// KAYIT KURALLARI (genel) — Ayarlar > Koşu > Kayıt seçimlerinin TEK kaynağı: koşucu (tests/support/kosu-ayarlari.ts →
// playwright.config.ts), test fikstürleri (fixtures.ts), model koşucusu (adım görüntüleri), raporlayıcı (raporlayici.mjs; medya
// süzgeci) ve saklama temizliği (medya inceltme) aynı sınıflandırmayı ve eşlemeyi kullanır. Sunucu koşusu ayarları ortam
// değişkeniyle, terminal / CI koşusu kasadaki kayıtlı ayarla verir (kosu-ayarlari.mjs); ikisi de buradaki kurala düşer.
//
// Video / iz / test sonu ekran görüntüsü: her | yalnizBasari | yalnizHata | kapali. Playwright'ın kayıt kipleri "yalnız başarılı"
// seçeneğini tanımaz: bu seçimde kayıt 'on' ile alınır ve raporlayıcı KALAN (başarılı olmayan) testlerin medyasını şifreleyip
// sonuç deposuna eklemeden ÖNCE atar (düz metin dosyası da silinir).
// Adım ekran görüntüsü: her (bugünkü davranış) | yalnizKalan | secili (ekran modelinde "Ekran görüntüsü al" işaretli akış adımları)
// | kapali. Senaryo bu seçimi ezebilir (senaryo içeriğinde adimGoruntusu; yoksa "Ayarlara uy").
// NOT: import.meta KULLANILMAZ (koşucu bu dosyayı CommonJS'e çevirerek yükler).

/** Video, iz ve test sonu ekran görüntüsü seçimleri. */
export const KAYIT_SECIMLERI = Object.freeze(['her', 'yalnizBasari', 'yalnizHata', 'kapali']);
/** Adım ekran görüntüsü seçimleri. */
export const ADIM_GORUNTUSU_SECIMLERI = Object.freeze(['her', 'yalnizKalan', 'secili', 'kapali']);
/** Video boyutu: kucuk = Playwright varsayılanı (800 px'e sığdırma), ekran = koşu ekran boyutu (viewport). */
export const VIDEO_BOYUTU_SECIMLERI = Object.freeze(['kucuk', 'ekran']);

/** Test sonu görüntüsünün ekleri (fixtures.ts > hataYakalayici) ve Playwright'ın kendi 'screenshot' eki. */
export const BASARILI_GORUNTU_ADI = '✅ BAŞARILI - Son Ekran Görüntüsü';
export const HATA_GORUNTU_ADI = '❌ HATA ANI - Ekran Görüntüsü';
export const TEST_SONU_GORUNTU_ADLARI = Object.freeze(['screenshot', BASARILI_GORUNTU_ADI, HATA_GORUNTU_ADI]);
/** Kalan adımda alınan görüntünün adındaki ek ("NN - <adım> (kalan adım)"). */
export const KALAN_ADIM_EKI = ' (kalan adım)';
/** Adım görüntüsü alınamadığında eklenen notun adındaki ek ("NN - <adım> (ekran görüntüsü alınamadı: <neden>)"). */
export const GORUNTU_ALINAMADI_EKI = ' (ekran görüntüsü alınamadı';

/** @param {unknown} v @param {string} varsayilan @returns {string} */
export function kayitSecimi(v, varsayilan) {
  return typeof v === 'string' && KAYIT_SECIMLERI.includes(v) ? v : varsayilan;
}

/** Video / iz için Playwright kipi. @param {string} secim @returns {'on' | 'retain-on-failure' | 'off'} */
export function videoIzKipi(secim) {
  return secim === 'her' || secim === 'yalnizBasari' ? 'on' : secim === 'yalnizHata' ? 'retain-on-failure' : 'off';
}

/** Test sonu ekran görüntüsü için Playwright kipi. @param {string} secim @returns {'on' | 'only-on-failure' | 'off'} */
export function ekranGoruntusuKipi(secim) {
  return secim === 'her' || secim === 'yalnizBasari' ? 'on' : secim === 'yalnizHata' ? 'only-on-failure' : 'off';
}

/**
 * Raporlayıcı bu medyayı ATSIN mı? Yalnız "yalnızca başarılı" seçiminde, başarılı olmayan testte. Diğer seçimlerde Playwright'ın
 * kendi kipi zaten doğru kaydı alır (bugünkü davranış korunur; ör. Nöbetçi ▷ koşusundaki başarılı test sonu görüntüsü).
 * @param {string} secim @param {boolean} basarili
 */
export function medyaAtilsinMi(secim, basarili) {
  return secim === 'yalnizBasari' && !basarili;
}

/**
 * Ekin / medya satırının sınıfı. video · iz · testSonu (test sonu ekran görüntüsü) · kalanAdim (kalan adımda alınan) · adim
 * (adım görüntüsü, "NN - …") · diger (görüntü olmayan ekler, ör. "görüntü alınamadı" notu).
 * @param {{ ad: string; icerikTuru?: string | null; tur?: string | null }} m
 * @returns {'video' | 'iz' | 'testSonu' | 'kalanAdim' | 'adim' | 'diger'}
 */
export function medyaSinifi(m) {
  const tur = String(m.icerikTuru ?? '').toLowerCase();
  if (m.tur === 'video' || tur.startsWith('video/')) return 'video';
  if (m.tur === 'iz' || m.ad === 'trace' || tur === 'application/zip' || tur.includes('trace')) return 'iz';
  const gorsel = m.tur === 'ekran_goruntusu' || tur.startsWith('image/');
  if (!gorsel) return 'diger';
  if (TEST_SONU_GORUNTU_ADLARI.includes(m.ad)) return 'testSonu';
  if (m.ad.endsWith(KALAN_ADIM_EKI)) return 'kalanAdim';
  // Adım görüntüleri "NN - <adım>"; adı tanınmayan diğer görüntüler de adım görüntüsü sayılır (test sonu kuralına bağlanmaz).
  return 'adim';
}

/**
 * Raporlayıcı süzgeci: ek atılsın mı? (video → video seçimi, iz → iz seçimi, test sonu görüntüsü → ekran görüntüsü seçimi; adım
 * görüntüleri ve diğer ekler bu seçimlere bağlı değildir).
 * @param {{ name: string; contentType?: string }} ek @param {{ video: string; ekranGoruntusu: string; iz: string }} kurallar @param {boolean} basarili
 */
export function ekAtilsinMi(ek, kurallar, basarili) {
  const sinif = medyaSinifi({ ad: ek.name, icerikTuru: ek.contentType ?? '' });
  if (sinif === 'video') return medyaAtilsinMi(kurallar.video, basarili);
  if (sinif === 'iz') return medyaAtilsinMi(kurallar.iz, basarili);
  if (sinif === 'testSonu') return medyaAtilsinMi(kurallar.ekranGoruntusu, basarili);
  return false;
}

/** Ortam değişkenlerinden kayıt kuralları (raporlayıcıya seçenek verilmediyse; koşucunun varsayılanlarıyla aynı). */
export function ortamKayitKurallari() {
  return {
    video: kayitSecimi(process.env.NOBETCI_VIDEO, process.env.TEST_SUNUCU_GORUNUR ? 'her' : 'yalnizHata'),
    ekranGoruntusu: kayitSecimi(process.env.NOBETCI_EKRAN_GORUNTUSU, 'yalnizHata'),
    iz: kayitSecimi(process.env.NOBETCI_IZ, 'yalnizHata')
  };
}

/** @param {unknown} v @returns {'her' | 'yalnizKalan' | 'secili' | 'kapali' | null} geçersizse null */
export function adimGoruntusuSecimi(v) {
  return typeof v === 'string' && ADIM_GORUNTUSU_SECIMLERI.includes(v) ? /** @type {'her' | 'yalnizKalan' | 'secili' | 'kapali'} */ (v) : null;
}

/**
 * Senaryonun adım görüntüsü seçimi (senaryo formu): 'ayar' / boş → null ("Ayarlara uy"; içeriğe yazılmaz); geçersizse hata.
 * @param {unknown} ham @returns {{ secim: 'her' | 'yalnizKalan' | 'secili' | 'kapali' | null; hata: string | null }}
 */
export function senaryoAdimGoruntusuAyikla(ham) {
  if (ham === undefined || ham === null || ham === '' || ham === 'ayar') return { secim: null, hata: null };
  const s = adimGoruntusuSecimi(ham);
  return s ? { secim: s, hata: null } : { secim: null, hata: `Adım ekran görüntüsü yalnızca ayar, ${ADIM_GORUNTUSU_SECIMLERI.join(', ')} olabilir.` };
}

/**
 * Adım görüntüsü alınsın mı? secili: yalnız ekran modelinde "Ekran görüntüsü al" işaretli akış adımında (sistem adımları — giriş,
 * bağlam, ekran açılışı — alınmaz). yalnizKalan: başarılı adımda alınmaz (kalan adımın görüntüsü ayrıca alınır).
 * @param {string} secim @param {{ isaretli?: boolean }} adim
 */
export function adimGoruntusuAlinsinMi(secim, adim) {
  if (secim === 'her') return true;
  if (secim === 'secili') return adim.isaretli === true;
  return false;
}

// ---------------------------------------------------------------------------------------
// Kademeli saklama (Ayarlar > Yedekleme > Sonuç saklama > "Medyayı incelt")
// ---------------------------------------------------------------------------------------

/** Medya inceltme seçimleri: kapali (varsayılan) | basarili | hatali | ikisi. */
export const MEDYA_INCELTME_SECIMLERI = Object.freeze(['kapali', 'basarili', 'hatali', 'ikisi']);

/**
 * İnceltmede bu medya satırı silinsin mi? Yalnız ekran görüntüleri ve videolar (izler ve diğer ekler kalır). Hatalı testte
 * "koru" işaretliyse kalan adımın görüntüsü (yoksa son adım görüntüsü — hataya en yakın) ve test sonu görüntüsü korunur.
 * @param {{ secim: string; koru: boolean }} ayar
 * @param {{ sonucBasarili: boolean; sinif: ReturnType<typeof medyaSinifi>; korunanAdim: boolean }} m
 */
export function inceltmedeSilinsinMi(ayar, m) {
  if (!['video', 'testSonu', 'kalanAdim', 'adim'].includes(m.sinif)) return false;
  const kapsamda = ayar.secim === 'ikisi' || (ayar.secim === 'basarili' && m.sonucBasarili) || (ayar.secim === 'hatali' && !m.sonucBasarili);
  if (!kapsamda) return false;
  if (!m.sonucBasarili && ayar.koru && (m.sinif === 'testSonu' || m.sinif === 'kalanAdim' || m.korunanAdim)) return false;
  return true;
}
