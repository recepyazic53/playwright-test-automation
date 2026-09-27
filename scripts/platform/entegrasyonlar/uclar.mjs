// ENTEGRASYONLAR — HTTP uçları (sunucu-platform.mjs GET_UCLARI / POST_UCLARI'na eklenir). Belirteç, gövde ve kasa kilidi
// sunucuda denetlenir. Gizli alan değerleri hiçbir yanıtta dönmez ({ dolu, maske }).
//   GET  /platform/entegrasyonlar?projeId=                         katalog (türler) + projenin bağlantıları
//   POST /platform/entegrasyon/kaydet { projeId, id?, tur, ad, alanlar, olaylar, ortamIdleri, etkin, sonDeneme? }
//   POST /platform/entegrasyon/etkin  { projeId, id, etkin }          devre dışı bırak / etkinleştir
//   POST /platform/entegrasyon/sil    { projeId, id }
//   POST /platform/entegrasyon/dene-hedefi { projeId, id?, tur?, alanlar? }   onay diyaloğundaki hedef (istek GÖNDERMEZ)
//   POST /platform/entegrasyon/dene   { projeId, id?, tur?, alanlar?, onay: true }  YALNIZ kullanıcı onaylayınca
//   POST /platform/entegrasyon/hata-kaydi/onizle { projeId, sonucId, baglantiId }  (istek GÖNDERMEZ)
//   POST /platform/entegrasyon/hata-kaydi/ac     { projeId, sonucId, baglantiId, baslik, aciklama, ekranGoruntuleri?, video?, onay: true }
//   POST /platform/entegrasyon/dbeaver/onizle    { projeId, icerik }          kullanıcının seçtiği data-sources.json içeriği
//   POST /platform/entegrasyon/dbeaver/ekle      { projeId, icerik, kaynakIdleri }
import { EntegrasyonHatasi } from './istek.mjs';
import { katalogGorunumu } from './katalog.mjs';
import { baglantiEtkinlestir, baglantiKaydet, baglantiSil, baglantilariListele } from './depo.mjs';
import { baglantiEslemeleriniKaldir } from '../sql/veritabanlari.mjs';
import { baglantiDene, dbeaverEkle, dbeaverOnizle, denemeHedefi, hataKaydiAc, hataKaydiOnizle } from './servis.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan = 'id') {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(d)) throw new EntegrasyonHatasi(`"${alan}" geçersiz.`);
  return d;
}

/** Büyük gövde kabul eden uçlar (DBeaver dosyası). */
export const ENTEGRASYON_BUYUK_GOVDE_UCLARI = ['/platform/entegrasyon/dbeaver/onizle', '/platform/entegrasyon/dbeaver/ekle'];

/** @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const ENTEGRASYON_GET_UCLARI = [
  ['/platform/entegrasyonlar', (db, q) => ({ turler: katalogGorunumu(), baglantilar: baglantilariListele(db, kimlik(q.get('projeId'), 'projeId')) })]
];

/**
 * @param {{ medyaKlasoruYolu: () => string }} ortam
 * @returns {Array<[string, (db: Veritabani, g: Record<string, any>) => Record<string, unknown> | Promise<Record<string, unknown>>]>}
 */
export function entegrasyonPostUclari(ortam) {
  return [
    ['/platform/entegrasyon/kaydet', (db, g) => ({ baglanti: baglantiKaydet(db, kimlik(g.projeId, 'projeId'), g) })],
    ['/platform/entegrasyon/etkin', (db, g) => ({ baglanti: baglantiEtkinlestir(db, kimlik(g.projeId, 'projeId'), kimlik(g.id), g.etkin === true) })],
    // Silinen bağlantının Veritabanları eşlemeleri de kalkar (o ortamlarda SQL adımı sorgu atmadan "bağlantı tanımlı değil" hatasıyla kalır).
    ['/platform/entegrasyon/sil', (db, g) => {
      const projeId = kimlik(g.projeId, 'projeId');
      const silindi = baglantiSil(db, projeId, kimlik(g.id));
      return { silindi, kaldirilanEsleme: baglantiEslemeleriniKaldir(db, projeId, kimlik(g.id)) };
    }],
    ['/platform/entegrasyon/dene-hedefi', (db, g) => ({ hedef: denemeHedefi(db, kimlik(g.projeId, 'projeId'), g) })],
    ['/platform/entegrasyon/dene', (db, g) => baglantiDene(db, kimlik(g.projeId, 'projeId'), g)],
    ['/platform/entegrasyon/hata-kaydi/onizle', (db, g) => hataKaydiOnizle(db, kimlik(g.projeId, 'projeId'), kimlik(g.sonucId, 'sonucId'), kimlik(g.baglantiId, 'baglantiId'))],
    ['/platform/entegrasyon/hata-kaydi/ac', (db, g) => hataKaydiAc(db, kimlik(g.projeId, 'projeId'), g, { medyaKlasoru: ortam.medyaKlasoruYolu() })],
    ['/platform/entegrasyon/dbeaver/onizle', (db, g) => { kimlik(g.projeId, 'projeId'); return dbeaverOnizle(g.icerik); }],
    ['/platform/entegrasyon/dbeaver/ekle', (db, g) => dbeaverEkle(db, kimlik(g.projeId, 'projeId'), g.icerik, g.kaynakIdleri)]
  ];
}
