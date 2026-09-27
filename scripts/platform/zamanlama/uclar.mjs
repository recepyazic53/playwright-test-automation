// ZAMANLANMIŞ KOŞULAR — HTTP uçları (sunucu-platform.mjs GET_UCLARI / POST_UCLARI'na eklenir). Belirteç ve kasa kilidi sunucuda
// denetlenir. Hiçbir uç koşu BAŞLATMAZ ("Şimdi koş" yok; koşuları yalnız zamanlayıcı başlatır).
//   GET  /platform/zamanlanmis-kosular?projeId=              kurallar (sonraki çalışma, son tetikleme, son 20 tetikleme) + süren koşu
//   POST /platform/zamanlanmis-kosu/kaydet { projeId, kural }  ekle / düzenle (canlı ortamda kural.canliOnay: true gerekir)
//   POST /platform/zamanlanmis-kosu/etkin  { projeId, id, etkin }
//   POST /platform/zamanlanmis-kosu/sil    { projeId, id }
//   POST /platform/zamanlanmis-kosu/onizle { zaman }          okunur metin + sonraki 3 çalışma zamanı (hiçbir şey yazmaz)
import { DepoHatasi } from '../veritabani/depo.mjs';
import { TOLERANS_MS, sonrakiZamanlar, zamanDogrula, zamanMetni } from './takvim.mjs';
import { kuralEtkinlestir, kuralKaydet, kuralSil, kurallariListele } from './kurallar.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan = 'id') {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/**
 * @param {{ suren: () => { kuralId: string; ad: string } | null }} zamanlayici
 * @returns {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>}
 */
export function zamanlamaGetUclari(zamanlayici) {
  return [
    ['/platform/zamanlanmis-kosular', (db, q) => ({
      kurallar: kurallariListele(db, kimlik(q.get('projeId'), 'projeId')), suren: zamanlayici.suren(), toleransDk: TOLERANS_MS / 60_000
    })]
  ];
}

/** @type {Array<[string, (db: Veritabani, g: Record<string, any>) => Record<string, unknown>]>} */
export const ZAMANLAMA_POST_UCLARI = [
  ['/platform/zamanlanmis-kosu/kaydet', (db, g) => ({ kural: kuralKaydet(db, kimlik(g.projeId, 'projeId'), g.kural) })],
  ['/platform/zamanlanmis-kosu/etkin', (db, g) => ({ kural: kuralEtkinlestir(db, kimlik(g.projeId, 'projeId'), kimlik(g.id), g.etkin === true) })],
  ['/platform/zamanlanmis-kosu/sil', (db, g) => ({ silindi: kuralSil(db, kimlik(g.projeId, 'projeId'), kimlik(g.id)) })],
  ['/platform/zamanlanmis-kosu/onizle', (db, g) => {
    const z = zamanDogrula(g.zaman);
    return { metin: zamanMetni(z), sonrakiler: sonrakiZamanlar(z, new Date(), 3).map((x) => x.toISOString()) };
  }]
];
