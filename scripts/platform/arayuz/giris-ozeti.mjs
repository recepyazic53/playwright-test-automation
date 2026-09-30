// GİRİŞ TARİFİNİN OKUNUR ÖZETİ (saf; tarayıcı ve testler kullanır) — teknik seçici yerine "1. Kullanıcı adını yaz ·
// 2. Parolayı yaz · 3. Giriş'e bas · 4. … seç" gibi adım cümleleri. Ayarlar > Giriş
// profilleri > Giriş tarifi formu bu özeti gösterir. Gizli değer içermez (tarifte yoktur;
// "{ad}" yer tutucuları adıyla gösterilir). Eski tarif (girisAdimlari yok) = kullanıcı adı → parola → giriş düğmesi.

/** Ayarlar > Giriş profilleri'nde ortamın tarif formunu doğrudan açan adres. @param {string} ortamId */
export const tarifFormuAdresi = (ortamId) => `#/ayarlar/giris/tarif/${encodeURIComponent(ortamId)}`;

const VARSAYILAN = [{ islem: 'kullaniciAdi' }, { islem: 'parola' }, { islem: 'gonder' }];
const IKINCI = { totp: 'Authenticator kodu', sms: 'SMS kodu' };

/** Seçiciden kısa, okunur bir ad (ör. "#firmaKodu" → "firmaKodu", 'button:has-text("Devam")' → "Devam"). @param {string} s */
function seciciAdi(s) {
  const t = String(s || '').trim();
  const metin = /has-text\(["'](.+?)["']\)|text=["']?([^"']+)["']?|name=["']?([^"'\]]+)["']?/i.exec(t);
  if (metin) return (metin[1] || metin[2] || metin[3] || '').trim();
  const kimlik = /#([\w-]+)/.exec(t);
  if (kimlik) return kimlik[1];
  return t.length > 40 ? `${t.slice(0, 38)}…` : t;
}

/** Adım hedefinin okunur adı. @param {any} h */
export function hedefAdi(h) {
  if (!h) return '';
  if (h.rol) return h.ad || h.rol;
  if (h.metin) return h.metin;
  return seciciAdi(h.secici);
}

/**
 * Tek adımın cümlesi. tarif: özel adımlarda düğme/alan adını tariften almak için (isteğe bağlı).
 * @param {any} a @param {any} [tarif]
 */
export function adimCumlesi(a, tarif) {
  if (!a || typeof a !== 'object') return '';
  const not = a.aciklama ? String(a.aciklama) : '';
  switch (a.islem) {
    case 'kullaniciAdi': return 'Kullanıcı adını yaz';
    case 'parola': return 'Parolayı yaz';
    case 'gonder': {
      const ad = tarif ? seciciAdi(tarif.gonderDugmesi) : '';
      return ad && !/^(button|input|\[)/i.test(ad) ? `“${ad}” düğmesine bas` : 'Giriş düğmesine bas';
    }
    case 'git': return `Sayfaya git: ${a.adres}`;
    case 'adresBekle': return 'Adresin değişmesini bekle';
    case 'kosulBekle': return not || 'Sayfanın hazır olmasını bekle';
    case 'bekle': return not || `${a.saniye} saniye bekle`;
    case 'tikla': return not || `“${hedefAdi(a.hedef)}” öğesine tıkla`;
    case 'doldur': return `${not || hedefAdi(a.hedef)} alanına ${a.deger} yaz`;
    case 'sec': return `${not || hedefAdi(a.hedef)} listesinden ${a.deger} seç`;
    case 'gorunurBekle': return `“${not || hedefAdi(a.hedef)}” görünene kadar bekle`;
    case 'degerBekle': return `${not || hedefAdi(a.hedef)} değeri ${a.deger} olmalı`;
    case 'sayiBekle': return `${not || hedefAdi(a.hedef)}: ${a.sayi} öğe olmalı`;
    case 'metinBekle': return `“${a.metin}” metnini bekle`;
    default: return not || String(a.islem || '');
  }
}

/**
 * Tarifin tüm girişi (giriş adımları + iki aşamalı doğrulama + bağlam seçimi) okunur cümleler olarak.
 * @param {any} tarif @returns {Array<{ metin: string; bolum: 'giris' | 'ikinci' | 'baglam' }>}
 */
export function girisAdimlariOzeti(tarif) {
  if (!tarif) return [];
  const adimlar = Array.isArray(tarif.girisAdimlari) && tarif.girisAdimlari.length ? tarif.girisAdimlari : VARSAYILAN;
  /** @type {Array<{ metin: string; bolum: 'giris' | 'ikinci' | 'baglam' }>} */
  const sonuc = adimlar.map((a) => ({ metin: adimCumlesi(a, tarif), bolum: /** @type {'giris'} */ ('giris') }));
  const ikinci = tarif.ikinciAdim;
  if (ikinci && ikinci.tur && ikinci.tur !== 'yok') {
    sonuc.push({ metin: `${IKINCI[/** @type {'totp' | 'sms'} */ (ikinci.tur)] || 'Doğrulama kodu'} gir${ikinci.tur === 'sms' && ikinci.smsKipi === 'elle' ? ' (koşuda elle)' : ''}`, bolum: 'ikinci' });
  }
  const b = tarif.baglamDegistirme;
  if (b && Array.isArray(b.adimlar) && b.adimlar.length) {
    // Bağlam adımları uzun olabilir: yalnızca kullanıcıya görünen eylemler (tıkla/doldur/seç) ve açıklamalı adımlar.
    const gorunur = b.adimlar.filter((/** @type {any} */ a) => a.aciklama || ['tikla', 'doldur', 'sec', 'git'].includes(a.islem));
    for (const a of gorunur.slice(0, 8)) sonuc.push({ metin: adimCumlesi(a), bolum: 'baglam' });
    if (gorunur.length > 8) sonuc.push({ metin: `… ${b.baglamTuru} seçiminin ${gorunur.length - 8} adımı daha`, bolum: 'baglam' });
  }
  return sonuc;
}

/** "1. Kullanıcı adını yaz · 2. Parolayı yaz · …" tek satır. @param {any} tarif @param {number} [enCok] */
export function girisOzetSatiri(tarif, enCok = 6) {
  const liste = girisAdimlariOzeti(tarif);
  const parca = liste.slice(0, enCok).map((x, i) => `${i + 1}. ${x.metin}`);
  if (liste.length > enCok) parca.push(`… (+${liste.length - enCok})`);
  return parca.join(' · ');
}
