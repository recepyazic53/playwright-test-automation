// BAŞLARKEN KONTROL LİSTESİ (Sonuçlar > Genel > Özet; PROJE BAŞINA) — yeni kullanıcının ilk koşuya giden yolu: ortam → giriş tarifi
// → ilk ekran → ilk senaryo → Dene → Koşuyu başlat → sonuçları incele. Her adımın durumu projenin VERİSİNDEN hesaplanır (ortam, giriş
// tarifi, ekran modeli, senaryo, koşu); verisi olmayan üç işaret ("girişe gerek yok", "denendi", "incelendi") ve "gizle" kararı kasada
// (ayarlar tablosu, anahtar "baslarken", { projeId: { gizli?, girisGerekmez?, denendi?, incelendi? } }) şifreli saklanır — tarayıcıda
// değil. Liste tamamlanınca ya da gizlenince arayüzde görünmez. Gizli değer ya da kullanıcı verisi dönmez: yalnız adım durumları ve
// ilgili ekranın adresi.
import { DepoHatasi, ayarGetir, ayarYaz, ekranModeliGetir, ekranlariListele, ortamlariListele, projeGetir, senaryolariListele } from '../veritabani/depo.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ gizli?: boolean; girisGerekmez?: boolean; denendi?: boolean; incelendi?: boolean }} BaslarkenIsaretleri */
/** @typedef {'tamam' | 'siradaki' | 'bekliyor'} AdimDurumu */
/**
 * @typedef {{ anahtar: string; baslik: string; aciklama: string; eylem: string; adres: string; durum: AdimDurumu; atlanabilir?: boolean;
 *   atlandi?: boolean }} BaslarkenAdimi
 */

export const BASLARKEN_AYAR_ANAHTARI = 'baslarken';
/** Kullanıcının değiştirebildiği işaretler (hepsi true/false). */
export const BASLARKEN_ISARETLERI = /** @type {const} */ (['gizli', 'girisGerekmez', 'denendi', 'incelendi']);

/** @param {Veritabani} vt @returns {Record<string, BaslarkenIsaretleri>} */
function kayit(vt) {
  try {
    const a = ayarGetir(vt, BASLARKEN_AYAR_ANAHTARI);
    return a && typeof a === 'object' && !Array.isArray(a) ? /** @type {Record<string, BaslarkenIsaretleri>} */ (a) : {};
  } catch {
    return {};
  }
}

/** Projenin işaretleri (kayıt yoksa hepsi false). @param {Veritabani} vt @param {string} projeId @returns {Required<BaslarkenIsaretleri>} */
export function baslarkenIsaretleri(vt, projeId) {
  const k = kayit(vt)[projeId];
  const x = k && typeof k === 'object' ? k : {};
  return { gizli: x.gizli === true, girisGerekmez: x.girisGerekmez === true, denendi: x.denendi === true, incelendi: x.incelendi === true };
}

/**
 * İşaretleri doğrulayıp kaydeder (verilmeyenler korunur). @param {Veritabani} vt @param {string} projeId @param {unknown} girdi
 * @returns {Required<BaslarkenIsaretleri>}
 */
export function baslarkenIsaretle(vt, projeId, girdi) {
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  if (!girdi || typeof girdi !== 'object' || Array.isArray(girdi)) throw new DepoHatasi('Başlarken işareti bir nesne olmalıdır.');
  const g = /** @type {Record<string, unknown>} */ (girdi);
  const yeni = { ...baslarkenIsaretleri(vt, projeId) };
  let degisti = false;
  for (const ad of BASLARKEN_ISARETLERI) {
    if (g[ad] === undefined) continue;
    if (typeof g[ad] !== 'boolean') throw new DepoHatasi(`"${ad}" true ya da false olmalıdır.`);
    if (yeni[ad] !== g[ad]) { yeni[ad] = /** @type {boolean} */ (g[ad]); degisti = true; }
  }
  if (degisti) ayarYaz(vt, BASLARKEN_AYAR_ANAHTARI, { ...kayit(vt), [projeId]: yeni });
  return yeni;
}

/**
 * Adım durumları (projenin verisinden) + işaretler. Kasa açık olmalıdır.
 * @param {Veritabani} vt @param {string} projeId
 * @returns {{ gizli: boolean; tamam: boolean; tamamlanan: number; toplam: number; adimlar: BaslarkenAdimi[] }}
 */
export function baslarkenDurumu(vt, projeId) {
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  const isaret = baslarkenIsaretleri(vt, projeId);
  const ortamlar = ortamlariListele(vt, projeId);
  const ortam = ortamlar.find((o) => o.varsayilan) ?? ortamlar[0] ?? null;
  const tarifVar = ortamlar.some((o) => o.ayarlar && o.ayarlar.girisTarifi !== undefined && o.ayarlar.girisTarifi !== null);
  // İlk ekran: modeli olan, ortak akış / alt model olmayan, silinmemiş ekran (ekran listesiyle aynı sınıflandırma).
  const ekran = ekranlariListele(vt, projeId).find((e) => {
    const m = ekranModeliGetir(vt, e.id);
    const model = m && m.model && typeof m.model === 'object' ? /** @type {Record<string, unknown>} */ (m.model) : null;
    return Boolean(model) && model?.tur !== 'altModel' && model?.tur !== 'ortakAkis';
  }) ?? null;
  const senaryo = senaryolariListele(vt, { projeId }).find((s) => s.ekranId) ?? null;
  const kosuVar = Boolean(vt.tek('SELECT 1 AS v FROM kosular WHERE proje_id = ? LIMIT 1', [projeId]));
  const tamKosu = vt.tek("SELECT id FROM kosular WHERE proje_id = ? AND tur = 'tam' ORDER BY baslangic DESC LIMIT 1", [projeId]);
  const kodla = encodeURIComponent;

  /** @type {Array<Omit<BaslarkenAdimi, 'durum'> & { bitti: boolean }>} */
  const tanimlar = [
    { anahtar: 'ortam', baslik: 'Ortam ekle', aciklama: 'Testlerin çalışacağı adres (ör. TEST).', eylem: 'Ortamları aç',
      adres: '#/ayarlar/proje', bitti: ortamlar.length > 0 },
    { anahtar: 'giris', baslik: 'Giriş tarifi', aciklama: '"Girişi kaydet": girişi tarayıcıda bir kez kendiniz yapın, Nöbetçi adımları tanır.', eylem: 'Girişi kaydet',
      adres: ortam ? `#/ayarlar/giris/tarif/${kodla(ortam.id)}` : '#/ayarlar/giris', bitti: tarifVar || isaret.girisGerekmez, atlanabilir: !tarifVar, atlandi: !tarifVar && isaret.girisGerekmez },
    { anahtar: 'ekran', baslik: 'İlk ekranı ekle', aciklama: '"Ekranı tara" ya da "Akışı kaydet" ile sayfanın alanlarını ve adımlarını çıkarın.', eylem: 'Ekran ekle',
      adres: '#/ekranlar/yeni', bitti: Boolean(ekran) },
    { anahtar: 'senaryo', baslik: 'İlk senaryo', aciklama: 'Ekranın formundan hangi değerlerle ne beklendiğini yazın.', eylem: 'Senaryo yaz',
      adres: ekran ? `#/senaryolar/yeni/${kodla(ekran.id)}` : '#/senaryolar', bitti: Boolean(senaryo) },
    { anahtar: 'dene', baslik: 'Dene', aciklama: 'Senaryo formundaki "Dene" kaydetmeden tek seferlik çalıştırır.', eylem: 'Senaryoyu aç',
      adres: senaryo ? `#/senaryolar/duzenle/${kodla(senaryo.id)}` : '#/senaryolar', bitti: isaret.denendi || kosuVar },
    { anahtar: 'kosu', baslik: 'Koşuyu başlat', aciklama: 'Koşudaki senaryoların hepsi seçtiğiniz ortamda çalışır; sonuçlar kanıtlarıyla saklanır.', eylem: 'Senaryolara git',
      adres: '#/senaryolar', bitti: Boolean(tamKosu) },
    { anahtar: 'sonuc', baslik: 'Sonuçları incele', aciklama: 'Koşuyu açın: başarısız testin adımları, ekran görüntüleri ve videosu oradadır.', eylem: 'Son koşuyu aç',
      adres: tamKosu ? `#/sonuclar/kosu/${kodla(String(tamKosu.id))}` : '#/sonuclar/ekranlar', bitti: isaret.incelendi }
  ];
  let siradakiVerildi = false;
  const adimlar = tanimlar.map(({ bitti, ...a }) => {
    /** @type {AdimDurumu} */
    let durum = 'bekliyor';
    if (bitti) durum = 'tamam';
    else if (!siradakiVerildi) { durum = 'siradaki'; siradakiVerildi = true; }
    /** @type {BaslarkenAdimi} */
    const adim = { ...a, durum };
    if (!adim.atlanabilir) { delete adim.atlanabilir; delete adim.atlandi; }
    return adim;
  });
  const tamamlanan = adimlar.filter((a) => a.durum === 'tamam').length;
  return { gizli: isaret.gizli, tamam: tamamlanan === adimlar.length, tamamlanan, toplam: adimlar.length, adimlar };
}
