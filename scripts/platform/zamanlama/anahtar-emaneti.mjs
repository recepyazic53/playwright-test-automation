// ZAMANLANMIŞ KOŞULAR — anahtar emaneti ("Kasa kilitlense de zamanlanmış koşular çalışsın", Planlı koşular; varsayılan KAPALI).
// Kullanıcı tercihi açıkken kasa kilitlenince ARAYÜZ kilitlenir ama kasa anahtarının bir KOPYASI yalnız bu modülün içindeki
// değişkende (bellekte) kalır. Kopyayı dışarı veren bir fonksiyon YOKTUR: yalnız zamanlayıcının arka plan işi
// (arkaPlanIsiBaslat) onu kasaya "arka plan kipinde" (kasa.mjs > kasayiArkaPlandaAc) geçici olarak yerleştirir:
//   - Arka plan kipinde kasaAcikMi true (koşucu alt sürecine anahtar verilir, raporlayıcı yazar), arayuzAcikMi false:
//     HTTP veri uçları 423 KASA_KILITLI döner (sunucu-platform.mjs > acikVeritabani + arayuzKilidindeIzinliMi süzgeci).
//   - İş bitince (sayaç sıfırlanınca) anahtar kasadan silinir (kasaKilitle); emanetteki kopya kalır.
//   - Kullanıcı arada parolayla açarsa (kasaAc) arayüz kilidi kalkar; iş bitince kasa AÇIK bırakılır.
// Nöbetçi kapanınca/yeniden başlayınca kopya gider (yalnız bellek; diske hiçbir şey yazılmaz — B seçeneği ayrı: dpapi.mjs).
// "Tamamen kilitle" emanetiSil + kasaKilitle yapar. Tipler: anahtar-emaneti.d.mts.
import { acikAnahtar, anahtarDogrulayiciyaUyarMi, arayuzuKilitle, arkaPlanKipindeMi, kasaAcikMi, kasaKilitle, kasayiArkaPlandaAc } from '../kasa.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

/** @type {WeakMap<Veritabani, Buffer>} */
const emanetler = new WeakMap();
/** Süren arka plan işi sayısı (zamanlayıcı denetimi + başlattığı koşular). @type {WeakMap<Veritabani, number>} */
const isler = new WeakMap();

/**
 * Anahtarın kopyasını emanete alır (önceki kopya sıfırlanır). Anahtar kasanın doğrulayıcısına uymalıdır.
 * @param {Veritabani} vt @param {Buffer} anahtar
 */
export function anahtariEmanetEt(vt, anahtar) {
  const dogrulayici = vt.metaOku('kasa_dogrulayici');
  if (!dogrulayici || !anahtarDogrulayiciyaUyarMi(anahtar, dogrulayici)) throw new Error('Kasa anahtarı bu kasaya uymuyor.');
  const eski = emanetler.get(vt);
  if (eski) eski.fill(0);
  emanetler.set(vt, Buffer.from(anahtar));
}

/** @param {Veritabani} vt */
export function emanetVarMi(vt) {
  return emanetler.has(vt);
}

/** Emanetteki kopyayı sıfırlayıp siler. @param {Veritabani} vt */
export function emanetiSil(vt) {
  const eski = emanetler.get(vt);
  if (eski) eski.fill(0);
  emanetler.delete(vt);
}

/** @param {Veritabani} vt */
export function arkaPlanIsiSuruyorMu(vt) {
  return (isler.get(vt) ?? 0) > 0;
}

/**
 * "Kilitle (zamanlanmış koşular sürsün)": açık kasanın anahtarı emanete alınır ve arayüz kilitlenir. Süren arka plan işi
 * yoksa anahtar kasadan hemen silinir (yalnız emanette kalır); varsa iş bitince silinir.
 * @param {Veritabani} vt
 */
export function arayuzuKilitleEmanetle(vt) {
  if (kasaAcikMi(vt) && !arkaPlanKipindeMi(vt)) anahtariEmanetEt(vt, acikAnahtar(vt));
  arayuzuKilitle(vt);
  if (!arkaPlanIsiSuruyorMu(vt)) kasaKilitle(vt);
}

/**
 * Zamanlayıcının arka plan işi başlıyor. Kasa açıksa (kullanıcı ya da süren başka iş) yalnız sayaç artar; kilitliyse ve
 * emanet varsa anahtar arka plan kipinde (arayüz kilitli) yerleştirilir. Dönen "bitir" fonksiyonu (bir kez) çağrılınca
 * sayaç azalır; sıfırlanınca arka plan kipindeki anahtar kasadan silinir. Anahtar yoksa null.
 * Emanetteki kopya kasaya artık uymuyorsa (ör. yedekten tam yükleme) emanet silinir ve null döner.
 * @param {Veritabani} vt
 * @returns {(() => void) | null}
 */
export function arkaPlanIsiBaslat(vt) {
  if (!kasaAcikMi(vt)) {
    const anahtar = emanetler.get(vt);
    if (!anahtar) return null;
    try {
      kasayiArkaPlandaAc(vt, anahtar);
    } catch {
      emanetiSil(vt);
      console.error('[zamanlama] Bellekteki kasa anahtarı bu kasaya artık uymuyor (parola değişmiş ya da yedek yüklenmiş olabilir); zamanlanmış koşular kasa açılana kadar çalışmaz.');
      return null;
    }
  }
  isler.set(vt, (isler.get(vt) ?? 0) + 1);
  let bitti = false;
  return () => {
    if (bitti) return;
    bitti = true;
    const kalan = Math.max(0, (isler.get(vt) ?? 1) - 1);
    if (kalan) isler.set(vt, kalan); else isler.delete(vt);
    if (!kalan && arkaPlanKipindeMi(vt)) kasaKilitle(vt);
  };
}

/**
 * Arka plan kipinde (arayüz kilitli, anahtar bellekte) izin verilen istekler: durum, kasayı açma / kilitleme, çalışma alanı
 * seçimi (gizli bilgi yok) ve Playwright raporlayıcısının token'lı yazma uçları. Diğer HER /platform/* isteği 423 döner
 * (varsayılan: reddet). Saf fonksiyon.
 * @param {string} yontem @param {string} yol
 */
export function arayuzKilidindeIzinliMi(yontem, yol) {
  if (yontem === 'GET') return yol === '/platform/durum' || yol === '/platform/calisma-alanlari';
  if (yontem !== 'POST') return false;
  return yol === '/platform/kasa/ac' || yol === '/platform/kasa/kilitle'
    || /^\/platform\/calisma-alani\/(ac|kapat)$/.test(yol)
    || /^\/platform\/sonuc\/(durum|medya-anahtari|kosu|kaydet|bitir)$/.test(yol);
}
