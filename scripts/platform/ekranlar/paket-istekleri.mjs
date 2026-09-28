// SAYFA PAKETİ İSTEK METİNLERİ (ORTAK, saf) — yapay zekâ aracına (tarayıcıyı kullanabilen bir kodlama asistanı) verilen inceleme
// kuralları ve "İstek metnini kopyala" metni TEK kaynaktan gelir: sunucu (ekran-servisi.mjs > istek dosyası) bu modülü içe aktarır;
// arayüz aynı dosyayı /arayuz/paket-istekleri.mjs olarak alır (ekranlar.js, sayfa-paketi.js). Metin belirli bir araca ya da depo
// dosyasına bağlı değildir: paketin biçimi, arayüzdeki "Paket biçimini indir" ile verilen TEK dosyadadır (BICIM_DOSYASI_ADI; sunucu
// paket-bicimi.mjs ile docs/sayfa-paketi.md + şemalardan üretir). docs/sayfa-paketi.md > "Yapay zekâ aracına verilecek istek" bu metni anlatır.
// KURALLAR: bu dosya hiçbir modül içe aktarmaz, Node'a / DOM'a özgü API kullanmaz (tarayıcıya olduğu gibi gider).

/** Kullanıcının yapay zekâ aracına istek metniyle birlikte verdiği biçim dosyasının adı. */
export const BICIM_DOSYASI_ADI = 'sayfa-paketi-bicimi.md';
/** Biçim dosyasının yerel adresi (127.0.0.1'deki Nöbetçi sunar; arayüzdeki "Paket biçimini indir"). */
export const BICIM_ADRESI = `/arayuz/${BICIM_DOSYASI_ADI}`;
/** İstek metinlerinde biçime yapılan atıf ("… dosyasındaki biçimde … üret"). */
export const BICIM_ATFI = `ekteki ${BICIM_DOSYASI_ADI} dosyasındaki biçimde`;
/** Paket zarfının özü: biçim dosyası eklenmese de araç zarfı doğru kursun (ayrıntı biçim dosyasında). */
export const PAKET_OZU = 'Paket tek bir JSON nesnesidir: "tur": "sayfa-paketi", "surum": 1; meta (ekran.anahtar, ekran.ad, ekran.urlYolu — tam adres değil yol; '
  + 'olusturan, olusturulma, baglamProfilleri), model, senaryoOnerileri, gerekenAyarlar ve bilinmeyenler zorunludur (yoksa boş dizi); '
  + 'kanitlar ve testVerisi isteğe bağlıdır; başka anahtar yazma.';

/** Paketteki test verisi tablosunun adı en çok bu kadar karakterdir (tablo-deposu.mjs TABLO_ADI ile aynı sınır). */
export const TABLO_ADI_EN_UZUN = 60;

/** Yapay zekâ aracının inceleme kuralları (düğme grupları + test verisi tabloları). */
export const INCELEME_KURALLARI = 'Sayfayı yalnızca okuyarak incele: seçimleri ve okları değiştirerek koşullu alanları ve bağımlı listeleri çıkar; '
  + 'yalnızca ekran açan / ilerleten ve hesaplayan düğmelere bas, sonraki alanları ve uyarıları (tarayıcı uyarıları dahil) topla. '
  + 'Kayıt oluşturan, gönderen, onaylayan ya da ödeme yapan düğmelere BASMA: orada dur, sonrasını bilinmeyenlere yaz. '
  + 'Alanlara kart, parola, kimlik no gibi bilgi girme; bir düğmenin ne yaptığından emin değilsen basma, bana sor. '
  + 'İş kuralı uyarısının göründüğü öğeyi adımın kosu.hataGostergesi\'ne, uyarı metinlerini kosu.uyarilar\'a yaz. '
  + 'Alan bir iframe (çerçeve) içindeyse alanın konum.cerceve\'sine iframe seçicisini yaz (dıştan içe dizi, en çok 2; ör. ["iframe#pencere"]); '
  + 'o iframe\'deki düğme ve göstergelerde de (kosu.aksiyonlar, basariGostergesi, hataGostergesi, uyarilar) cerceve\'yi yaz. '
  + 'Gerçek <select>\'i gizli olan özel açılır listelerde (aramalı kutu) konum.secici\'ye gerçek <select>\'in seçicisini, doldurucu\'ya "ozelSecim" yaz. '
  + 'Alanın sayı / uzunluk / tarih sınırları sayfada belliyse (min, max, maxlength, pattern ya da yardım metni) alanın sinirlar\'ına yaz '
  + '(sayıda enAz / enCok / artis, metinde enAzUzunluk / enCokUzunluk / desen, tarihte enAz / enCok: gg.aa.yyyy ya da bugun+N); belli değilse yazma, tahmin etme. '
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
 * İstek metni ("İstek metnini kopyala": Ekranlar listesi ve Ekran ekle > "Yapay zekâ ile oluştur" kopyalatır).
 * @param {string} [adres] sayfa bağlantısı (yoksa yer tutucu)
 */
export function paketIstekCumlesi(adres = '') {
  return `${adres || '<sayfa bağlantısı>'} sayfasını incele ve ${BICIM_ATFI} bir sayfa paketi JSON dosyası üret. ${PAKET_OZU} ${INCELEME_KURALLARI}`;
}
