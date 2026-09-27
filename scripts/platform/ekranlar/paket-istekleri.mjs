// SAYFA PAKETİ İSTEK METİNLERİ (ORTAK, saf) — Claude Code'a verilen inceleme kuralları ve "Paket nasıl üretilir?" cümlesi TEK
// kaynaktan gelir: sunucu (ekran-servisi.mjs > istek dosyası) bu modülü içe aktarır; arayüz aynı dosyayı /arayuz/paket-istekleri.mjs
// olarak alır (ekranlar.js, sayfa-paketi.js). docs/sayfa-paketi.md > "Claude Code'a verilecek istek" bu metni anlatır.
// KURALLAR: bu dosya hiçbir modül içe aktarmaz, Node'a / DOM'a özgü API kullanmaz (tarayıcıya olduğu gibi gider).

/** Paketteki test verisi tablosunun adı en çok bu kadar karakterdir (tablo-deposu.mjs TABLO_ADI ile aynı sınır). */
export const TABLO_ADI_EN_UZUN = 60;

/** Claude'un inceleme kuralları (düğme grupları + test verisi tabloları). */
export const INCELEME_KURALLARI = 'Sayfayı yalnızca okuyarak incele: seçimleri ve okları değiştirerek koşullu alanları ve bağımlı listeleri çıkar; '
  + 'yalnızca ekran açan / ilerleten ve hesaplayan düğmelere bas, sonraki alanları ve uyarıları (tarayıcı uyarıları dahil) topla. '
  + 'Kayıt oluşturan, gönderen, onaylayan ya da ödeme yapan düğmelere BASMA: orada dur, sonrasını bilinmeyenlere yaz. '
  + 'Alanlara kart, parola, kimlik no gibi bilgi girme; bir düğmenin ne yaptığından emin değilsen basma, bana sor. '
  + 'İş kuralı uyarısının göründüğü öğeyi adımın kosu.hataGostergesi\'ne, uyarı metinlerini kosu.uyarilar\'a yaz. '
  + 'Test verisini testVerisi.tablolar\'a tablo olarak yaz (sütun = alan, satır = birlikte geçerli değerler). '
  + '(1) Ekran listeleri: seçim alanlarının (açılır liste, radyo, oklu seçim) seçeneklerini "tur": "liste" olan, "<Ekran adı> — <Alan>" adlı tablolara yaz; '
  + 'bağımlı listeler tek tabloda olur ("<Ekran adı> — <Üst alan> - <Alt alan>"; her satır geçerli bir kombinasyon: üst seçim + alt seçenek); '
  + `tablo adı en çok ${TABLO_ADI_EN_UZUN} karakter, . [ ] { } $ < > & | içermez. `
  + 'Hücreye görünen metni yaz, sayfadaki value farklıysa sütunun karsiliklar\'ına ekle; alanları testVerisi.baglantilar ile sütunlara bağla ve '
  + 'senaryo önerilerinde bu alanlara tablodaki değeri yaz. '
  + '(2) Kişi ve kayıt verileri (müşteri, araç, adres gibi): "tur": "kayit" olan tablolarda her satır bir kayıttır; senaryo önerisinde değeri '
  + 'düz yazmak yerine ${Tablo.Sütun} ya da aynı tablo iki kez gerekiyorsa ${Tablo[etiket].Sütun} başvurusuyla ver (koşuda seçilen satırdan gelir). '
  + 'Projede aynı işi gören tablo varsa onun adını kullan. Senaryoların gerektirdiği tabloların adlarını gerekenAyarlar.testVerisiTurleri\'ne yaz. '
  + 'Kişisel ya da gizli değerleri (parola, kart, kimlik no) hiçbir yere yazma; böyle bir sütun gerekiyorsa "gizli": true işaretle ve boş bırak.';

/** Tekrar analiz istek dosyasının ek kuralı (dosyadaki testVerisi bölümüyle birlikte okunur). */
export const MEVCUT_TABLO_KURALI = 'Dosyadaki testVerisi bölümü ekranın mevcut alan bağlantılarını ve bağlı tabloların adlarını / sütunlarını '
  + 'listeler (değer yok): paketinde bu tablo ve sütun adlarını AYNEN kullan; aynı listeyi başka adla yeni tablo olarak yazma.';

/**
 * "Paket nasıl üretilir?" cümlesi (Ekranlar listesi ve Sayfa ekle kartı kopyalatır).
 * @param {string} [adres] sayfa bağlantısı (yoksa yer tutucu)
 */
export function paketIstekCumlesi(adres = '') {
  return `${adres || '<sayfa bağlantısı>'} sayfasını incele ve docs/sayfa-paketi.md biçiminde bir sayfa paketi JSON dosyası üret. ${INCELEME_KURALLARI}`;
}
