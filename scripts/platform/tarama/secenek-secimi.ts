// AÇILIR LİSTEDE (<select>) SEÇENEK BULMA, BEKLEME VE SEÇME — normal koşu (tests/support/model-kosucu.ts) ve hızlı test
// (hizli-test-motoru.ts) aynı kuralı kullanır.
//  · Hedef { deger, metin }: senaryodaki seçenek (değer = sayfadaki kod, metin = görünen ad). Kod bilinmiyorsa ikisi de ad olabilir.
//  · Eşleştirme sırası (secenekEslestir): (1) değer tam, (2) metin tam (boşluklar sadeleştirilmiş), (3) büyük / küçük harf duyarsız
//    (Türkçe) değer ya da metin, (4) "kod - ad" biçimli metin: aranan, sözcük sınırıyla metnin başında, sonra içinde — kısmi eşleşmede
//    YALNIZ TEK aday kabul edilir (birden çok aday varsa tahmin edilmez: "listede yok" iletisiyle düşer). Üstteki kural her zaman önce gelir.
//  · Seçili seçenek zaten hedefse yeniden seçilmez (listedenSecenekSec): yeniden seçmek change gönderir, bağlı alt listeleri boşaltır.
//  · Bekleme (secenekBekle): bağlı liste üst alan seçildikten sonra dolar. TEK döngüde her turda hedef değer YA DA metin olarak aranır;
//    bulunduğu anda döner. Liste doluyken (yer tutucu dışında seçenek var) seçenekler bir süre (sabitMs) değişmiyor ve hedef yoksa
//    sınır süresi beklenmeden biter: hedef listede yok.
// Motor genel kalır: siteye / ürüne özgü sabit yoktur.
import type { Locator } from '@playwright/test';
import { gercekSecenekler } from './zincir-kesfi.mjs';
// Karşılaştırma biçimi tek yerde (plan seçeneği bulma — secenekBul — ile aynı): boşluk sadeleşir, Türkçe büyük harf.
import { secenekNormal } from '../senaryolar/model-kosusu.mjs';

export interface ListeSecenegi { deger: string; metin: string }

const sade = (t: string): string => String(t ?? '').replace(/\s+/g, ' ').trim();

/** Harf ya da rakam mı (sözcük sınırı için). */
const harfMi = (c: string | undefined): boolean => Boolean(c) && /[\p{L}\p{N}]/u.test(c as string);

/** Aranan metinde sözcük sınırıyla geçiyor mu; basta: yalnız metnin başında. */
function sinirlaGeciyor(metin: string, aranan: string, basta: boolean): boolean {
  if (!aranan) return false;
  for (let i = metin.indexOf(aranan); i >= 0; i = metin.indexOf(aranan, i + 1)) {
    if (basta && i > 0) return false;
    if (!harfMi(metin[i - 1]) && !harfMi(metin[i + aranan.length])) return true;
  }
  return false;
}

/**
 * Listede hedef seçenek (yoksa null). Kural sırası dosya başında. Kısmi ("kod - ad") eşleşmede yer tutucu seçenekler ("Seçiniz")
 * aday sayılmaz; birden çok aday belirsizdir (null).
 */
export function secenekEslestir(liste: ReadonlyArray<ListeSecenegi>, hedef: ListeSecenegi): ListeSecenegi | null {
  const o = liste.map((x) => ({ deger: String(x.deger), metin: sade(x.metin) }));
  const d = String(hedef.deger ?? '');
  const m = sade(hedef.metin ?? '');
  const tam = o.find((x) => x.deger === d) ?? o.find((x) => x.metin === m || (d !== '' && x.metin === sade(d)));
  if (tam) return tam;
  const nd = secenekNormal(d);
  const nm = secenekNormal(m);
  const normal = o.find((x) => nd !== '' && secenekNormal(x.deger) === nd)
    ?? o.find((x) => { const k = secenekNormal(x.metin); return (nm !== '' && k === nm) || (nd !== '' && k === nd); });
  if (normal) return normal;
  const gercek = gercekSecenekler(o);
  const arananlar = [...new Set([nm, nd].filter(Boolean))];
  for (const basta of [true, false]) {
    for (const a of arananlar) {
      const adaylar = gercek.filter((x) => sinirlaGeciyor(secenekNormal(x.metin), a, basta));
      if (adaylar.length > 1) return null;
      if (adaylar.length === 1) return { deger: adaylar[0].deger, metin: sade(adaylar[0].metin) };
    }
  }
  return null;
}

export interface ListeDurumu { secenekler: ListeSecenegi[]; kilitli: boolean; secili: string | null }

/** Açılır listenin o anki seçenekleri, kilitli (disabled) durumu ve seçili değeri; öğe <select> değilse ya da okunamazsa null. */
export async function listeDurumu(l: Locator): Promise<ListeDurumu | null> {
  return l.evaluate((e) => (e instanceof HTMLSelectElement
    ? { secenekler: [...e.options].map((x) => ({ deger: x.value, metin: x.text })), kilitli: e.disabled, secili: e.selectedIndex >= 0 ? e.value : null }
    : null), undefined, { timeout: 2_000 }).catch(() => null);
}

export interface SecenekBekleSonucu {
  /** Bulunan seçenek; bulunamadıysa null. */
  secenek: ListeSecenegi | null;
  /** Bekleyiş süresi (ms). */
  bekleyisMs: number;
  /** Son görülen seçenekler (bulunamadığında iletide gösterilir). */
  liste: ListeSecenegi[];
}

/** Seçenekler bu kadar süre değişmezse liste "doldu" sayılır (hedef yoksa erken biter). */
export const LISTE_SABIT_MS = 1_200;

/**
 * Hedef seçenek listede belirene kadar bekler (tek döngü; her turda değer ya da metin aranır). Seçenek bulunduğunda liste hâlâ kilitliyse
 * (seçenekler gelirken kısa süre devre dışı kalan liste) sınır süresi içinde etkinleşmesi beklenir; kilitli kalırsa yine döner. Hedef yoksa:
 * liste doluysa ve seçenekler sabitMs boyunca değişmediyse erken, değilse sınır süresinde biter.
 */
export async function secenekBekle(l: Locator, hedef: ListeSecenegi, s: { sinirMs: number; sabitMs?: number; aralikMs?: number }): Promise<SecenekBekleSonucu> {
  const bas = Date.now();
  const bitis = bas + Math.max(0, s.sinirMs);
  const sabitMs = s.sabitMs ?? LISTE_SABIT_MS;
  let imza = '';
  let degisim = bas;
  let liste: ListeSecenegi[] = [];
  for (;;) {
    const d = await listeDurumu(l);
    liste = d ? d.secenekler : [];
    const bulunan = secenekEslestir(liste, hedef);
    const simdi = Date.now();
    if (bulunan && (!d?.kilitli || simdi >= bitis)) return { secenek: bulunan, bekleyisMs: simdi - bas, liste };
    const yeniImza = JSON.stringify(liste);
    if (yeniImza !== imza) { imza = yeniImza; degisim = simdi; }
    if (!bulunan && d && !d.kilitli && gercekSecenekler(liste).length > 0 && simdi - degisim >= sabitMs) return { secenek: null, bekleyisMs: simdi - bas, liste };
    if (simdi >= bitis) return { secenek: null, bekleyisMs: simdi - bas, liste };
    await new Promise((c) => setTimeout(c, s.aralikMs ?? 150));
  }
}

/** Listede gösterilecek en çok seçenek sayısı (iletide). */
const GOSTERILEN = 6;

/**
 * Bulunamayan seçeneğin açık iletisi: "‹Alan›: “X” listede yok (listede: A, B, C … N seçenek)". Yer tutucular gösterilmez; liste boşsa
 * beklenen süre yazılır.
 */
export function listedeYokMetni(etiket: string, aranan: string, r: Pick<SecenekBekleSonucu, 'liste' | 'bekleyisMs'>): string {
  const gercek = gercekSecenekler(r.liste).map((x) => sade(x.metin) || x.deger);
  const ad = etiket ? `${etiket}: ` : '';
  if (!gercek.length) return `${ad}“${aranan}” listede yok (liste boş kaldı; ${Math.round(r.bekleyisMs / 1000)} sn beklendi)`;
  const ilk = gercek.slice(0, GOSTERILEN).join(', ');
  return `${ad}“${aranan}” listede yok (listede: ${gercek.length > GOSTERILEN ? `${ilk} … ${gercek.length} seçenek` : ilk})`;
}

/**
 * Hedef seçeneği bekleyip seçer (selectOption, bulunan seçeneğin değeriyle; olaylar sayfaya gider). Bulunamazsa { hata }
 * (listedeYokMetni). Değer zaten seçiliyse yeniden seçilmez (her seçimde: yeniden seçmek change gönderir, bağlı alt listeleri boşaltabilir).
 */
export async function listedenSecenekSec(l: Locator, hedef: ListeSecenegi, s: { sinirMs: number; etiket: string; sabitMs?: number; secimMs?: number }):
  Promise<{ secenek: ListeSecenegi; bekleyisMs: number } | { hata: string }> {
  const r = await secenekBekle(l, hedef, s);
  if (!r.secenek) return { hata: listedeYokMetni(s.etiket, sade(hedef.metin) || hedef.deger, r) };
  if ((await listeDurumu(l))?.secili !== r.secenek.deger) await l.selectOption({ value: r.secenek.deger }, { timeout: s.secimMs ?? 5_000 });
  return { secenek: r.secenek, bekleyisMs: r.bekleyisMs };
}
