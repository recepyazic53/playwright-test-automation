// JETSEYAHAT SEÇENEKLERİ — Galaksi TEST JetSeyahat ekranından (Yurt Dışı ürünü) 2026-09-25'te kullanıcının oturumuyla
// yalnızca okunarak alındı (form gönderilmedi). Ülke listesi burada tutulmaz: test verisi tablosundadır (ülke adı + sayfa değeri
// karşılığı; bkz. scripts/platform/tablolar).
// Acenteye göre değişebilir (okuma tek acenteyle yapıldı). Biçim: [value, görünen metin].

export const KAPSAM_ALTERNATIF = Object.freeze({
  'DÜNYA': ['SEYAHAT PAKET', 'VİZE TÜM DÜNYA'],
  'AVRUPA': ['VİZE SCHENGEN', 'SEYAHAT PAKET']
});

export const PLANLAR = [['1', 'Plan 1'], ['2', 'Plan 2'], ['3', 'Plan 3']];

/** #Bedel_Select (yalnızca alternatif SEYAHAT PAKET iken etkin). */
export const IPTAL_BEDELLERI = [['1', '1.000'], ['2', '2.000'], ['3', '3.000'], ['4', '5.000'], ['5', '500']];

/** Prim Hesapla'da tarayıcı uyarısı (alert) olarak çıkan, TEST'te görülen doğrulama mesajları. */
export const HESAPLA_UYARILARI = ['Lütfen seyahat edilecek ülkeyi seçiniz.', 'Lütfen sigortalı kimlik numaralarını geçerli şekilde giriniz.'];

/**
 * Prim hesaplamada sunucunun iş kuralı uyarıları (#dialog-content). Kaynak: kodlu JetSeyahat senaryolarının beklenen
 * hata mesajları (TEST'te geçerli kimlikle görülür). [metin, seçici].
 */
export const SUNUCU_UYARILARI = [
  ['Covid Teminatı “Hayır” olması durumunda yalnızca “VİZE SCHENGEN” veya “VİZE TÜM DÜNYA” alternatifleri seçilebilir', '#dialog-content']
];
