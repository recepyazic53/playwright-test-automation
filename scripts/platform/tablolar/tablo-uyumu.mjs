// TABLO BAĞI UYUMU (saf; sunucu ve arayüz ORTAK: /arayuz/tablo-uyumu.mjs). Seçenekleri modelde tanımlı bir seçim alanı bir tablo
// sütununa bağlıysa sütundaki değerlerin sayfadaki seçeneklerde karşılığı var mı? Karşılığı olmayan değer koşuda seçilemez (ör. başka
// bir ekran için açılmış tabloya yanlışlıkla bağlanan alan). Bir değer şu durumda karşılıklı sayılır: değerin kendisi ya da sütundaki
// "sayfa" karşılığı (karsiliklar[değer].sayfa) seçeneğin değeri, metni, sayfa değeri ya da sayfa metniyle eşleşir; büyük / küçük harf
// ve Türkçe karakter farkı gözetilmez. Seçenekleri kısmi / bilinmeyen / dinamik alanda, gizli ya da boş sütunda denetim yapılmaz.

/** Seçenek listesi tam okunmamış alanlar: denetlenmez (eksik liste yanlış uyarı verir). */
const TAM_OLMAYAN = new Set(['kismi', 'bilinmiyor', 'dinamik']);
/** Mesajda gösterilen en çok değer / seçenek sayısı. */
const EN_COK = 5;

/**
 * Karşılaştırma biçimi: Türkçe küçük harf, aksan / Türkçe karakter sadeleştirme (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u, â→a), boşluk tekleme.
 * @param {unknown} x @returns {string}
 */
export function uyumNormal(x) {
  return String(x ?? '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
}

/** @param {string[]} l */
const listele = (l) => (l.length > EN_COK ? `${l.slice(0, EN_COK).join(', ')} ve ${l.length - EN_COK} değer daha` : l.join(', '));

/**
 * @typedef {{ deger: string; metin?: string; ekranDegeri?: string; ekranMetni?: string }} UyumSecenegi
 * @typedef {{ duzey: 'guclu' | 'zayif'; eslesmeyen: string[]; eslesen: number; toplam: number; sayfadakiler: string[]; metin: string }} TabloUyumu
 */

/**
 * Bağlı sütunun değerleri alanın seçenekleriyle uyumlu mu. Uyumluysa ya da denetlenemiyorsa null; hiçbir değer eşleşmiyorsa güçlü,
 * bir kısmı eşleşmiyorsa zayıf uyarı.
 * @param {{ etiket: string; secenekler?: UyumSecenegi[] | null; seceneklerDurumu?: string | null }} alan
 * @param {{ gizli?: boolean; karsiliklar?: Record<string, { sayfa?: string }> | null } | null | undefined} sutun
 * @param {unknown[]} degerler sütundaki değerler (satır sırasıyla; tekrar / boş olabilir)
 * @returns {TabloUyumu | null}
 */
export function tabloSecenekUyumu(alan, sutun, degerler) {
  const secenekler = Array.isArray(alan.secenekler) ? alan.secenekler.filter((x) => x && typeof x.deger === 'string') : [];
  if (!secenekler.length || !sutun || sutun.gizli || TAM_OLMAYAN.has(String(alan.seceneklerDurumu ?? ''))) return null;
  /** @type {Set<string>} */
  const sayfada = new Set();
  for (const x of secenekler) for (const m of [x.deger, x.metin, x.ekranDegeri, x.ekranMetni]) if (m !== undefined && m !== null && m !== '') sayfada.add(uyumNormal(m));
  // Tablo başvurusu (${…}) ya da boş değer denetlenmez.
  const tekil = [...new Set(degerler.filter((v) => v !== null && v !== undefined && String(v).trim() !== '' && !String(v).startsWith('${')).map((v) => String(v)))];
  if (!tekil.length) return null;
  const k = sutun.karsiliklar && typeof sutun.karsiliklar === 'object' ? sutun.karsiliklar : {};
  const eslesmeyen = tekil.filter((v) => !sayfada.has(uyumNormal(v)) && !(k[v]?.sayfa && sayfada.has(uyumNormal(k[v].sayfa))));
  if (!eslesmeyen.length) return null;
  const sayfadakiler = [...new Set(secenekler.map((x) => x.metin || x.ekranMetni || x.deger))];
  const duzey = eslesmeyen.length === tekil.length ? 'guclu' : 'zayif';
  const metin = `“${alan.etiket}” bu tablodaki ${listele(eslesmeyen)} ${eslesmeyen.length === 1 ? 'değerini' : 'değerlerini'} sayfada bulamaz (sayfadaki seçenekler: ${listele(sayfadakiler)})`;
  return { duzey, eslesmeyen, eslesen: tekil.length - eslesmeyen.length, toplam: tekil.length, sayfadakiler, metin };
}
