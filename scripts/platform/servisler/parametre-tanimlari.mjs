// SERVİS PARAMETRE TANIMLARI (DEĞER LİSTELERİ) — saf yardımcılar (sunucu ve arayüz PAYLAŞIR; /arayuz/parametre-tanimlari.mjs).
// Bir tanım (Ayarlar > Test verisi > Servis parametreleri) bir alanın alabileceği değerleri söyler; tüm servislerde seçilebilir:
//   liste       : sabit değerler (her birine açıklama) — ör. InvoiceType: 1 / 2 / 3
//   mantiksal   : true / false
//   test_verisi : bir test verisi türünün (açık, hassas olmayan) alanındaki profil değerleri — ör. Channel ← Servis girişi.kanal
//   serbest     : liste yok; yalnız varsayılan / açıklama
// Bağlantı: servisin metot tablosunda her alan için bir liste seçilir (servis ayarı alanListeleri: { <metot>: { <yol>: tanımId | '' } }).
// Seçim yapılmamışsa ve alana koşuda dolan bir parametre (${AD}) bağlı değilse, adı alanla aynı (harf duyarsız) liste kullanılır;
// '' = bilerek "liste yok".
// Listede olmayan değer ENGELLENMEZ (olumsuz senaryolar bilerek geçersiz değer gönderir); yalnız uyarılır.

/** @typedef {'liste' | 'mantiksal' | 'test_verisi' | 'serbest'} TanimTuru */
/**
 * @typedef {{ deger: string; aciklama?: string; ekranDegeri?: string; ekranMetni?: string }} TanimDegeri
 * @typedef {{ id: string; projeId?: string; ad: string; aciklama?: string; tur: TanimTuru; degerler?: TanimDegeri[];
 *   kaynak?: { turId: string; alan: string } | null; varsayilan?: string; elleYazilabilir?: boolean }} ParametreTanimi
 */

export const TANIM_TURLERI = /** @type {const} */ (['liste', 'mantiksal', 'test_verisi', 'serbest']);
export const TANIM_TURU_ETIKETI = { liste: 'Liste', mantiksal: 'Evet / Hayır', test_verisi: 'Test verisinden', serbest: 'Serbest' };

/** @param {string} a */
const anahtar = (a) => String(a || '').toLocaleLowerCase('en');

/** Adı alanla aynı (harf duyarsız) liste. @param {ParametreTanimi[]} tanimlar @param {string} alanAdi */
export const adlaBul = (tanimlar, alanAdi) => tanimlar.find((t) => anahtar(t.ad) === anahtar(alanAdi)) ?? null;

/**
 * Alanın değer listesi: açık bağlantı (id; '' = yok) → yoksa, alana parametre bağlı değilse adı aynı liste.
 * @param {ParametreTanimi[]} tanimlar @param {Record<string, string> | undefined} baglantilar  metodun { yol: tanımId | '' }
 * @param {string} yol @param {string} alanAdi @param {boolean} [parametreVar]
 * @returns {ParametreTanimi | null}
 */
export function alanListesi(tanimlar, baglantilar, yol, alanAdi, parametreVar = false) {
  if (baglantilar && Object.prototype.hasOwnProperty.call(baglantilar, yol)) return tanimlar.find((t) => t.id === baglantilar[yol]) ?? null;
  return parametreVar ? null : adlaBul(tanimlar, alanAdi);
}

/**
 * Tanımın değer listesi. test_verisi: türün profillerindeki alan değerleri (tekrarsız; açıklama = profil adları). Hassas
 * alanlar maskeli geldiği için (nesne) listeye girmez.
 * @param {ParametreTanimi} tanim
 * @param {Array<{ turId: string; ad: string; degerler: Record<string, unknown> }>} [profiller]
 * @returns {TanimDegeri[]}
 */
export function tanimDegerleri(tanim, profiller = []) {
  if (tanim.tur === 'mantiksal') {
    const acik = (/** @type {string} */ d) => (tanim.degerler || []).find((x) => x.deger === d)?.aciklama || '';
    return [{ deger: 'true', aciklama: acik('true') || 'Evet' }, { deger: 'false', aciklama: acik('false') || 'Hayır' }];
  }
  if (tanim.tur === 'test_verisi') {
    const k = tanim.kaynak;
    if (!k) return [];
    /** @type {Map<string, string[]>} */
    const harita = new Map();
    for (const p of profiller) {
      if (p.turId !== k.turId) continue;
      const d = p.degerler?.[k.alan];
      if (!((typeof d === 'string' && d !== '') || typeof d === 'number')) continue;
      const m = String(d);
      harita.set(m, [...(harita.get(m) || []), p.ad]);
    }
    return [...harita].map(([deger, adlar]) => ({ deger, aciklama: adlar.join(', ') }));
  }
  if (tanim.tur === 'liste') return (tanim.degerler || []).map((x) => ({ deger: String(x.deger), ...(x.aciklama ? { aciklama: x.aciklama } : {}) }));
  return [];
}

/** Değer listede var mı (liste boşsa — serbest — her değer uygundur). @param {TanimDegeri[]} liste @param {string} deger */
export const listedeMi = (liste, deger) => !liste.length || liste.some((x) => x.deger === deger);

/**
 * WSDL'den öneri: enumeration → liste; boolean → evet / hayır. Başka tipte öneri yok.
 * @param {{ tip?: string; secenekler?: string[] }} alan
 * @returns {{ tur: TanimTuru; degerler: TanimDegeri[] } | null}
 */
export function wsdlOnerisi(alan) {
  if (alan.secenekler && alan.secenekler.length) return { tur: 'liste', degerler: alan.secenekler.map((d) => ({ deger: d })) };
  if (alan.tip === 'mantiksal') return { tur: 'mantiksal', degerler: [] };
  return null;
}

/** Değer etiketi: "1 — Peşin" (açıklama yoksa yalnız değer). @param {TanimDegeri} x */
export const degerEtiketi = (x) => (x.aciklama ? `${x.deger} — ${x.aciklama}` : x.deger);

// ---- Koşullu listeler (kullanım yeri: ekran / servis) ---------------------------------------------------------------------
// Liste bir alanı hedefler (ekran: ekranId + alan kimliği; servis: parametre adı, isteğe bağlı servisId) ve koşulları ("ve")
// o ekranın / servisin diğer alanlarının değerleridir. Çözüm: koşulları tutan listeler (en çok koşul tutanlar; birden
// çoksa değerler birleşir) → yoksa hedefi aynı koşulsuz liste → yoksa (çağıranda) alanın kendi listesi.

/** @param {ParametreTanimi} t @param {string} ekranId @param {string} alanId */
export const ekranHedefiMi = (t, ekranId, alanId) => t.kullanim === 'ekran' && t.hedef?.ekranId === ekranId && t.hedef?.alan === alanId;
/** @param {ParametreTanimi} t @param {string | null} servisId @param {string} alanAdi */
export const servisHedefiMi = (t, servisId, alanAdi) => t.kullanim !== 'ekran' && Boolean(t.hedef?.parametre)
  && anahtar(t.hedef?.parametre ?? '') === anahtar(alanAdi) && (!t.hedef?.servisId || t.hedef.servisId === servisId);

/**
 * @param {ParametreTanimi[]} listeler @param {(t: ParametreTanimi) => boolean} hedefMi
 * @param {(alan: string) => string | undefined} degerOku  koşuldaki alanın şu anki değeri
 * @returns {ParametreTanimi[]}
 */
export function eslesenListeler(listeler, hedefMi, degerOku) {
  const aday = listeler.filter(hedefMi);
  const kosullu = aday.filter((t) => (t.kosullar || []).length && (t.kosullar || []).every((k) => degerOku(k.alan) === k.deger));
  if (kosullu.length) {
    const en = Math.max(...kosullu.map((t) => (t.kosullar || []).length));
    return kosullu.filter((t) => (t.kosullar || []).length === en);
  }
  return aday.filter((t) => !(t.kosullar || []).length);
}

/** Eşleşen listelerin değerleri (tekrarsız; ilk açıklama kalır). @param {ParametreTanimi[]} eslesen @param {Parameters<typeof tanimDegerleri>[1]} [profiller] */
export function birlesikDegerler(eslesen, profiller = []) {
  /** @type {Map<string, TanimDegeri>} */
  const m = new Map();
  for (const t of eslesen) for (const x of tanimDegerleri(t, profiller)) if (!m.has(x.deger)) m.set(x.deger, x);
  return [...m.values()];
}
