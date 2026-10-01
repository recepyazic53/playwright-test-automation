// POLİGON — her ekran için hızlı testin İDEAL davranışı (plan): hangi alanlar keşifte görünmeli, veri durağında hangi değerler
// verilecek (etikete göre; "tablo" = "Doldur" ile test verisi tablosundan), hangi düğmelere sırayla basılacak, bitiş metni ve
// sunucu sayaçlarında beklenen değerler. Sürücü (tests/birim/hizli-test-poligon.spec.ts) planı uygular, sapmaları bulgu olarak yazar.
// Tüm değerler UYDURMADIR.

export type PlanDegeri = {
  /** Veri durağındaki alan etiketi (görünen ad). */
  etiket: RegExp;
  /** Elle yazılacak değer (seçim alanında seçeneğin değeri ya da metni; onay kutusunda true / false). */
  deger?: string | boolean;
  /** "Doldur" ile tablodan (sütun adı; tablo ve satır sürücüde aranır). */
  tablo?: string;
  /** Yalnız ilk veri durağında verilecek değer (ör. önce hatalı değer, sonra düzeltme). */
  ilk?: string;
};

export type EkranPlani = {
  kok: string;
  ekranAdi: string;
  /** Keşifte (hiçbir düğmeye basmadan) veri durağında görünmesi gereken alanlar. */
  kesif: RegExp[];
  /** Sonradan beliren ve sorulması gereken alanlar (hangi eylem / değerden sonra). */
  sonradan: Array<{ etiket: RegExp; neden: string }>;
  degerler: PlanDegeri[];
  /** Sırayla basılacak düğmeler (aday metnine göre). */
  basilacak: RegExp[];
  /** Başarı (Bitti) metni. */
  bitti: RegExp;
  /** Sonuç olmayan, "Bitti" ÖNERİLMEMESİ gereken metinler (sekme / anahtar etiketleri, liste seçenekleri). */
  bittiDegil?: RegExp;
  /** Olumsuz senaryo: beklenen hata metni ("Beklenen uyarı" olarak işaretlenir). */
  olumsuz?: RegExp;
  /** Doldururken / basışta çıkan beklenen hata (ör. alınmış kullanıcı adı): cevap. */
  hataCevaplari?: Array<{ metin: RegExp; cevap: 'hata' | 'uyari' | 'onemsiz' }>;
  /** Sunucu sayacında son gönderimin karşılaması gereken değerler (alan → beklenen). */
  gonderim?: Record<string, unknown>;
  /** Bir gönderim beklenmiyor mu (ör. olumsuz senaryoda gönderim sayısı yine 1). */
  gonderimSayisi?: number;
};

const ay = (): string => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };

export const PLANLAR: EkranPlani[] = [
  {
    kok: '/sepet', ekranAdi: 'Poligon sepet',
    kesif: [/^Kupon kodu$/],
    sonradan: [
      { etiket: /^Ad soyad$/, neden: '“Ödemeye geç” (SPA pushState) sonrası adres formu' },
      { etiket: /^Teslimat saati$/, neden: '“Daha fazla seçenek” bağlantısıyla açılan gizli bölüm' }
    ],
    degerler: [
      { etiket: /^Kupon kodu$/, deger: 'INDIRIM10' }, { etiket: /^Ad soyad$/, tablo: 'Ad soyad' }, { etiket: /^Cep telefonu$/, tablo: 'Cep telefonu' },
      { etiket: /^İl$/, deger: 'Ortakent' }, { etiket: /^Açık adres$/, tablo: 'Açık adres' }, { etiket: /^Teslimat saati$/, deger: '18:00-22:00' },
      { etiket: /Kapıya bırakılsın/, deger: false }
    ],
    basilacak: [/^Uygula$/, /Ödemeye geç/, /Daha fazla seçenek/, /Siparişi onayla/],
    bitti: /Sipariş numaranız/,
    gonderim: { kupon: 'INDIRIM10', il: 'Ortakent', saat: '18:00-22:00', adSoyad: 'Deneme Kişi' }
  },
  {
    kok: '/otel', ekranAdi: 'Poligon otel',
    kesif: [/^Giriş tarihi$/, /^Çıkış tarihi$/],
    sonradan: [
      { etiket: /^Çocuk yaşı$/, neden: '“Çocuk artır” (output sayacı 0 → 1) sonrası beliren liste' },
      { etiket: /^Ad$/, neden: 'çok kartlı sonuçtan “Bu odayı seç” sonrası misafir formu' }
    ],
    degerler: [
      { etiket: /^Giriş tarihi$/, deger: `10.${ay()}` }, { etiket: /^Çıkış tarihi$/, deger: `13.${ay()}` }, { etiket: /^Çocuk yaşı$/, deger: '3-6' },
      { etiket: /^Ad$/, tablo: 'Ad' }, { etiket: /^Soyad$/, tablo: 'Soyad' }, { etiket: /^E-posta$/, tablo: 'E-posta' }, { etiket: /^Telefon$/, deger: '05001112233' }
    ],
    basilacak: [/Çocuk artır/, /Müsaitlik sorgula/, /Bu odayı seç/, /Rezervasyonu tamamla/],
    bitti: /Rezervasyonunuz onaylandı/,
    gonderim: { giris: `10.${ay()}`, cikis: `13.${ay()}`, cocuk: '1', cocukYasi: '3-6', ad: 'Deneme' }
  },
  {
    kok: '/ucak', ekranAdi: 'Poligon uçak',
    kesif: [/^Nereden$/, /^Nereye$/, /^Gidiş tarihi$/, /^Yolcu$/],
    sonradan: [{ etiket: /^Yolcu adı$/, neden: '“Yolcu bilgilerini gir” → modal' }],
    degerler: [
      { etiket: /^Nereden$/, deger: 'Kuzeykent (KZK)' }, { etiket: /^Nereye$/, deger: 'Batıkent (BTK)' }, { etiket: /^Gidiş tarihi$/, deger: '2026-11-20' },
      { etiket: /^Yolcu$/, deger: '1' }, { etiket: /^Yolcu adı$/, tablo: 'Ad' }, { etiket: /^Yolcu soyadı$/, tablo: 'Soyad' }, { etiket: /^Doğum tarihi/, tablo: 'Doğum tarihi' }
    ],
    // Aynı metinli “Seç” düğmeleri yakın yazılarıyla ayırt edilir (“Seç (07:40 · PG 101 · 1.250 TL)”).
    basilacak: [/Uçuşları ara/, /^Seç( |$)/, /4B/, /Yolcu bilgilerini gir/, /Rezervasyonu tamamla/],
    bitti: /PNR/,
    gonderim: { nereden: 'Kuzeykent (KZK)', nereye: 'Batıkent (BTK)', koltuk: '4B', dogum: '01.02.1990' }
  },
  {
    kok: '/havale', ekranAdi: 'Poligon havale',
    kesif: [/^Alıcı IBAN$/],
    sonradan: [
      { etiket: /^Tutar/, neden: 'IBAN yanındaki “Alıcıyı sorgula” sonrası (zorunlu)' },
      { etiket: /^Onay kodu$/, neden: '“Devam” → aynı sayfada adım değişimi' }
    ],
    degerler: [
      { etiket: /^Alıcı IBAN$/, tablo: 'IBAN' }, { etiket: /^Tutar/, deger: '250' }, { etiket: /^Açıklama$/, deger: 'Kira' }, { etiket: /^Onay kodu$/, deger: '246810' }
    ],
    basilacak: [/Alıcıyı sorgula/, /^Devam$/, /^Onayla$/],
    bitti: /Dekont no/,
    gonderim: { tutar: '250', aciklama: 'Kira', kod: '246810' }
  },
  {
    kok: '/basvuru', ekranAdi: 'Poligon iş başvurusu',
    kesif: [/^Ad$/, /^Soyad$/, /^E-posta$/],
    sonradan: [
      { etiket: /^Pozisyon$/, neden: 'adım 1 “İleri” (aynı sayfada adım)' },
      { etiket: /^Kod deposu adresi$/, neden: 'Pozisyon = Yazılım geliştirici seçilince (zorunlu)' },
      { etiket: /Bilgilerimin doğruluğunu/, neden: 'adım 2 “İleri”' }
    ],
    degerler: [
      { etiket: /^Ad$/, tablo: 'Ad' }, { etiket: /^Soyad$/, tablo: 'Soyad' }, { etiket: /^E-posta$/, tablo: 'E-posta' },
      { etiket: /^Pozisyon$/, deger: 'yazilim' }, { etiket: /^Kod deposu adresi$/, deger: 'https://depo.ornek.test/deneme' }, { etiket: /^Deneyim/, deger: '4' },
      { etiket: /^Beceriler/, deger: 'TypeScript' }, { etiket: /Bilgilerimin doğruluğunu/, deger: true }
    ],
    basilacak: [/^İleri$/, /^İleri$/, /Başvuruyu gönder/],
    bitti: /Başvurunuz alındı/,
    gonderim: { ad: 'Deneme', pozisyon: 'yazilim', depo: 'https://depo.ornek.test/deneme' }
  },
  {
    kok: '/anket', ekranAdi: 'Poligon anket',
    kesif: [/Eklemek|Yorum|İsteğe bağlı/],
    sonradan: [{ etiket: /Neden memnun kalmadınız/, neden: '2. yıldıza basınca (puan ≤ 2) beliren zorunlu alan' }],
    degerler: [
      { etiket: /Neden memnun kalmadınız/, deger: 'Teslimat gecikti' }, { etiket: /Teslimat/, deger: 'İyi' }, { etiket: /Paketleme/, deger: 'İyi' },
      { etiket: /İletişim/, deger: 'İyi' }, { etiket: /Eklemek|Yorum|İsteğe bağlı/, deger: 'Yok' }
    ],
    // Simge (svg) yıldızlar aday listesinde grubun yakın yazısı ve sırasıyla görünür (“Genel puanınız (2/5)”).
    basilacak: [/Genel puanınız \(2\/5\)/, /Anketi gönder/],
    bitti: /yanıtınız kaydedildi/,
    gonderim: { puan: 2, neden: 'Teslimat gecikti' }
  },
  {
    kok: '/destek', ekranAdi: 'Poligon destek bileti',
    // Alt kategori başta devre dışıdır (bağlı liste): kategori seçilince sorulur (sonradan).
    kesif: [/^Kategori$/, /^Konu$/, /^Açıklama$/],
    sonradan: [{ etiket: /^Alt kategori$/, neden: 'Kategori seçilince seçenekleri gelir (bağlı liste, iframe içinde)' }],
    degerler: [
      { etiket: /^Kategori$/, deger: 'teknik' }, { etiket: /^Alt kategori$/, deger: 'Yavaşlık' }, { etiket: /^Öncelik|^Acil$|^Normal$/, deger: 'acil' },
      { etiket: /^Konu$/, deger: 'Sayfa yavaş açılıyor' }, { etiket: /^Açıklama$/, deger: 'Akşam saatlerinde sayfalar çok yavaş yükleniyor.' },
      { etiket: /Ek dosya eklemek/, deger: false }
    ],
    basilacak: [/Bileti oluştur/],
    bitti: /Biletiniz oluşturuldu/,
    gonderim: { kategori: 'teknik', altKategori: 'Yavaşlık', oncelik: 'acil' }
  },
  {
    kok: '/restoran', ekranAdi: 'Poligon restoran',
    kesif: [/Sipariş notu/],
    sonradan: [
      { etiket: /^Kart numarası$/, neden: 'Ödeme = Kartla öde seçilince (Kapıda nakit seçilince kaybolur)' },
      { etiket: /^Adres başlığı$/, neden: '“Adres ekle” (a role=button) → fade modal' }
    ],
    degerler: [
      { etiket: /Sipariş notu/, deger: 'Zil çalışmıyor' }, { etiket: /^Ödeme$|Kartla öde|Kapıda nakit/, deger: 'kart' },
      { etiket: /^Kart numarası$/, deger: '4111111111111111' }, { etiket: /^Son kullanma/, deger: '1230' }, { etiket: /^CVV$/, deger: '123' },
      { etiket: /^Adres başlığı$/, deger: 'Ev' }, { etiket: /^Mahalle$/, deger: 'Yeşiltepe' }, { etiket: /^Açık adres$/, tablo: 'Açık adres' }
    ],
    basilacak: [/Izgara köfte ekle/, /Adres ekle/, /Adresi kaydet/, /Siparişi ver/],
    bitti: /Siparişiniz alındı/,
    gonderim: { odeme: 'kart', not: 'Zil çalışmıyor', skt: '12/30' }
  },
  {
    kok: '/etkinlik', ekranAdi: 'Poligon etkinlik',
    kesif: [/^Ad soyad$/, /^E-posta$/, /^Oturum$/, /Fatura istiyorum/],
    sonradan: [{ etiket: /^Vergi no$/, neden: '“Fatura istiyorum” (gölge DOM onay kutusu) işaretlenince' }],
    degerler: [
      { etiket: /^Ad soyad$/, tablo: 'Ad soyad' }, { etiket: /^E-posta$/, tablo: 'E-posta' }, { etiket: /^Oturum$/, deger: 'atolyeA' },
      { etiket: /Fatura istiyorum/, deger: true }, { etiket: /^Vergi no$/, deger: '1234567890' }
    ],
    basilacak: [/^Kaydol$/],
    bitti: /Kaydınız tamamlandı/,
    gonderim: { oturum: 'atolyeA', fatura: true, vergiNo: '1234567890' }
  },
  {
    kok: '/ayarlar', ekranAdi: 'Poligon hesap ayarları',
    kesif: [/^Görünen ad$/, /^Hakkımda$/],
    sonradan: [
      { etiket: /[Gg]örünürlü|Yalnız bağlantılarım|Herkese açık/, neden: '“Gizlilik” sekmesine geçince' },
      { etiket: /^Cep telefonu$/, neden: '“SMS bildirimleri” anahtarı açılınca (zorunlu)' }
    ],
    degerler: [
      { etiket: /^Hakkımda$/, deger: 'Deneme biyografi' }, { etiket: /^Cep telefonu$/, tablo: 'Cep telefonu' },
      { etiket: /[Gg]örünürlü|Yalnız bağlantılarım|Herkese açık/, deger: 'baglantilar' }, { etiket: /Arama motorlarında/, deger: false }, { etiket: /Özet e-postası/, deger: '7' }
    ],
    basilacak: [/^Bildirimler$/, /SMS bildirimleri/, /^Gizlilik$/, /Değişiklikleri kaydet/],
    bitti: /Ayarlar kaydedildi/,
    bittiDegil: /E-posta bildirimleri|SMS bildirimleri|Özet e-postası|Profil görünürlüğü|Herkese açık|Yalnız bağlantılarım|^Gizli$/,
    gonderim: { gorunurluk: 'baglantilar', biyografi: 'Deneme biyografi' }
  },
  {
    kok: '/arama', ekranAdi: 'Poligon ev arama',
    kesif: [/^Konum$/, /^Oda sayısı$/, /^Eşyalı$/, /^Balkonlu$/],
    sonradan: [
      { etiket: /^Ad soyad$/, neden: 'İncele → hash rota → “Randevu talep et”' },
      { etiket: /^Doğrulama kodu$/, neden: 'Telefon alanından çıkınca (blur; zorunlu)' }
    ],
    degerler: [
      { etiket: /^Konum$/, deger: 'Çınarlı' }, { etiket: /^Oda sayısı$/, deger: '' }, { etiket: /^Eşyalı$/, deger: false }, { etiket: /^Balkonlu$/, deger: false },
      { etiket: /^Ad soyad$/, tablo: 'Ad soyad' }, { etiket: /^Telefon$/, deger: '05001112233' }, { etiket: /^Doğrulama kodu$/, deger: '1234' },
      { etiket: /^Tercih edilen gün$/, deger: 'Cumartesi' }
    ],
    // Aynı metinli “İncele” düğmeleri yakın yazılarıyla ayırt edilir (“İncele (18.500 TL / ay)”).
    basilacak: [/^Ara$/, /^İncele( |$)/, /Randevu talep et/, /Talebi gönder/],
    bitti: /Randevu talebiniz iletildi/,
    gonderim: { kod: '1234', gun: 'Cumartesi' }
  },
  {
    kok: '/not', ekranAdi: 'Poligon hızlı not',
    kesif: [/^Başlık$/, /^Not$/, /^Hatırlatma tarihi$/],
    sonradan: [{ etiket: /^Hatırlatma saati$/, neden: 'Hatırlatma tarihine yazıp 1,5 sn beklenince (debounce; zorunlu)' }],
    degerler: [
      { etiket: /^Başlık$/, deger: 'Alışveriş' }, { etiket: /^Not$/, deger: 'Süt, ekmek' }, { etiket: /^Hatırlatma tarihi$/, deger: '05.11.2026' },
      { etiket: /^Hatırlatma saati$/, deger: '18:00' }
    ],
    basilacak: [/Etiket/, /^Kişisel$/, /Notu kaydet/],
    bitti: /Not kaydedildi/,
    bittiDegil: /^(İş|Kişisel|Acil)$/,
    gonderim: { etiket: 'Kişisel', saat: '18:00' }
  },
  {
    kok: '/abonelik', ekranAdi: 'Poligon abonelik',
    kesif: [/^T\.C\. kimlik no$/, /^Tarife$/, /Bireysel|Kurumsal|Başvuru türü/],
    sonradan: [
      { etiket: /^Doğum tarihi/, neden: 'kimlik no 11 hane + 0,8 sn bekleme (düğme yok; zorunlu)' },
      { etiket: /^Bölge$/, neden: 'doğum tarihi + 1 sn bekleme → adres bölümü (zincir A→B→C)' },
      { etiket: /^İlçe$/, neden: 'Bölge seçilince (bağlı liste)' },
      { etiket: /^Mahalle$/, neden: 'İlçe seçilince (bağlı liste)' }
    ],
    degerler: [
      { etiket: /Bireysel|Kurumsal|Başvuru türü/, deger: 'bireysel' }, { etiket: /^T\.C\. kimlik no$/, tablo: 'Kimlik no' }, { etiket: /^Doğum tarihi/, tablo: 'Doğum tarihi' },
      { etiket: /^Bölge$/, deger: 'kuzey' }, { etiket: /^İlçe$/, deger: 'Sahil' }, { etiket: /^Mahalle$/, deger: 'Fener' }, { etiket: /^Açık adres$/, tablo: 'Açık adres' },
      { etiket: /Fatura adresi farklı/, deger: false }
    ],
    basilacak: [/^Başvur$/],
    bitti: /Başvurunuz alındı/,
    gonderim: { tur: 'bireysel', tc: '10000000146', bolge: 'kuzey', ilce: 'Sahil', mahalle: 'Fener', tarife: '100' }
  },
  {
    kok: '/uyelik', ekranAdi: 'Poligon üyelik',
    kesif: [/Koşulları okudum/],
    sonradan: [{ etiket: /^Kullanıcı adı$/, neden: 'onay kutusu → “Devam” (devre dışıyken etkinleşir) sonrası form' }],
    degerler: [
      { etiket: /Koşulları okudum/, deger: true }, { etiket: /^Kullanıcı adı$/, deger: 'yeni_uye_42', ilk: 'deneme' }, { etiket: /^E-posta$/, deger: 'uye@ornek.test' },
      { etiket: /^Parola$/, deger: 'Gizli-Parola-1' }, { etiket: /^Parola \(tekrar\)$/, deger: 'Gizli-Parola-1' }, { etiket: /^Doğum yılı$/, deger: '1995' },
      { etiket: /Davet kodu/, deger: '' }
    ],
    basilacak: [/^Devam$/, /Hesabı oluştur/],
    hataCevaplari: [{ metin: /alınmış/, cevap: 'hata' }],
    bitti: /Hesabınız hazır/,
    gonderim: { kadi: 'yeni_uye_42', yil: '1995' }
  },
  {
    kok: '/rapor', ekranAdi: 'Poligon rapor (olumsuz)',
    kesif: [/^Rapor türü$/, /^Tarih aralığı$/],
    sonradan: [{ etiket: /^Başlangıç/, neden: 'Tarih aralığı = Özel aralık seçilince' }],
    degerler: [
      { etiket: /^Rapor türü$/, deger: 'ayrintili' }, { etiket: /^Tarih aralığı$/, deger: 'ozel' }, { etiket: /^Başlangıç/, deger: '01.09.2026' },
      { etiket: /^Bitiş/, deger: '30.09.2026' }, { etiket: /PDF|CSV|Biçim/, deger: 'csv' }
    ],
    basilacak: [/Raporu oluştur/],
    olumsuz: /Sunucu hatası: rapor oluşturulamadı/,
    hataCevaplari: [{ metin: /Sunucu hatası/, cevap: 'uyari' }],
    bitti: /Sunucu hatası: rapor oluşturulamadı/,
    gonderim: { tur: 'ayrintili', aralik: 'ozel', bicim: 'csv' }
  },
  {
    kok: '/gider', ekranAdi: 'Poligon masraf beyanı',
    kesif: [/^Sicil no$/, /^Departman$/],
    sonradan: [
      { etiket: /^Tarih 1$/, neden: '“2 · Harcama kalemleri” akordeonu açılıp “Satır ekle”ye basılınca' },
      { etiket: /^Onaylayan yönetici 1$/, neden: 'Tutar 1 > 1000 yazılınca aynı satırda (zorunlu)' },
      { etiket: /Beyanın doğru/, neden: '“3 · Onay” akordeonu açılınca' }
    ],
    degerler: [
      { etiket: /^Sicil no$/, deger: 'S-1024' }, { etiket: /^Departman$/, deger: 'Satış' }, { etiket: /^Tarih 1$/, deger: '03.10.2026' },
      { etiket: /^Açıklama 1$/, deger: 'Müşteri ziyareti' }, { etiket: /^Kategori 1$/, deger: 'Yol' }, { etiket: /^Tutar 1$/, deger: '1250' },
      { etiket: /^Onaylayan yönetici 1$/, deger: 'Deneme Yönetici' }, { etiket: /Beyanın doğru/, deger: true }
    ],
    basilacak: [/Harcama kalemleri/, /Satır ekle/, /Onay$/, /^Devam$/, /Beyanı gönder/],
    bitti: /Beyanınız iletildi/,
    gonderim: { sicil: 'S-1024', departman: 'Satış' }
  }
];
