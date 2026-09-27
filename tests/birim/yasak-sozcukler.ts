// YASAK SÖZCÜK LİSTESİ (kodda bulunmaması denetlenen şirket/ürün adları).
// Koruma testleri bu listeyi kullanır; sözcükler yalnız bu dosyada geçer (başka test ya da kaynak dosyada yazılmaz).

/** Arayüz metinlerinde (ör. rehber içerikleri) geçmemesi gereken şirket/ürün adları ve alana özgü terimler. */
export const YASAK_SOZCUK_DESENI = /galaksi|jet[a-z]|acente|poliçe|sigort|nippon/i;

/** Platform motorunda (şema, depo, sunucu) geçmemesi gereken, projeye özgü kavramlar (küçük harfle aranır). */
export const MOTOR_YASAK_SOZCUKLERI: readonly string[] = ['galaksi', 'jetseyahat', 'jet-seyahat', 'ödeme', 'odeme', 'poliçe', 'police'];

/** Alana özgü bağlam kavramı açıklama örneği olarak geçebilir, ama tablo/sütun adı olamaz. */
export const YASAK_TABLO_DESENI = /create table[^;]*acente/;
