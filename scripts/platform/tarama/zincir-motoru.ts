// BAĞLI ALAN ZİNCİRİ MOTORU (genel; Playwright). Seçim keşfinin (tarama-motoru.ts > secimleriKesfet) bulduğu birinci düzey bağlantılardan
// (ör. İl seçilince İlçe listesi doluyor) başlayıp zinciri SONUNA KADAR yürür: üst listede bir değer seçilir, alt listenin seçenekleri
// gelince onda da değerler denenir, onun alt listesi aranır… (il → ilçe → belde → mahalle → sokak → bina; marka → model → paket).
// Hiçbir alan / ürün adı bilinmez: bağlantı yalnız sayfanın davranışından çıkar (zincir-kesfi.mjs > degisenSecimler).
//
// Yöntem (kat kat): sayfa baştan açılır, kökten bu kata kadarki seçimler sırayla uygulanır; bu kattaki listede örnek değerler (ilk, son,
// aradan; Ayarlar > "Bağlı liste keşfi: her katta denenecek değer") art arda seçilir ve her birinde alt listeler okunur (gözlem + bulgu).
// Kökte her örnek değerin dalı ayrı ayrı derine inilir (farklı kombinasyonlar); daha aşağıda, alt listesi dolan ilk değerin dalı izlenir.
// En çok "derinlik" kat, en çok ZINCIR_EN_COK_ACILIS sayfa açılışı (aşılırsa not düşülür).
//
// GÜVENLİK: yalnız SEÇİM yapılır; hiçbir düğmeye / bağlantıya basılmaz. Kayıt / gönderim çağrıştıran listeler denenmez (koruma.mjs >
// kesifGuvenligi). Seçim sayfayı başka adrese götürürse o dal bırakılır (bulgu). Değer okunmaz (yalnız seçenek etiketleri).
import type { FrameLocator, Page } from '@playwright/test';
import { kesifGuvenligi } from './koruma.mjs';
import type { HamAlan } from './paket-olusturucu.mjs';
import {
  ZINCIR_EN_COK_ACILIS, ZINCIR_EN_COK_KOK, ZINCIR_SECENEK_BEKLEME_MS, birinciDuzeyIliskiler, bulgulariTekillestir, degisenSecimler,
  gercekSecenekler, ornekDegerler, tekrarlayanSecenekler, type ZincirBulgusu, type ZincirSecimi, type ZincirSonucu
} from './zincir-kesfi.mjs';

/** Zinciri yürütmek için çağıranın verdikleri (tarama ve hızlı test kendi sayfa açma / sakinleşme yollarını kullanır). */
export type ZincirBaglami = {
  sayfa: Page;
  /** Hedef sayfayı baştan açar (temiz durum). */
  ac: () => Promise<void>;
  /** Sayfanın sakinleşmesini bekler (bekleme göstergesi yok, istekler bitti; en çok ms). */
  sakinles: (page: Page, ms: number) => Promise<unknown>;
  /** Sayfadaki alanların okuması (değer yok). */
  oku: () => Promise<HamAlan[]>;
  /** Sayfada görünen hata metinleri (seçimden sonra beliren hatalar bulgu olur); verilmezse bakılmaz. */
  hataMetinleri?: () => Promise<string[]>;
  /** İş iptal edildi / tarayıcı kapandı mı. */
  durdu?: () => boolean;
  /** İlerleme bildirimi (kullanıcıya "şu an ne yapılıyor"). */
  ilerleme?: (mesaj: string) => void;
};
export type ZincirAyari = { derinlik: number; ornek: number; bekleMs?: number };
type Kesifler = Parameters<typeof birinciDuzeyIliskiler>[0];

/** Alanın kapsamı: çerçevesi varsa o çerçeve (iç içe), yoksa sayfa. */
function kapsam(sayfa: Page, cerceve: string[] | null | undefined): Page | FrameLocator {
  let k: Page | FrameLocator = sayfa;
  for (const c of cerceve ?? []) k = k.frameLocator(c);
  return k;
}

/**
 * Açılır listede değeri seçer (özel bileşenin gizli <select>'inde görünürlük beklenmez; olaylar yine gönderilir). Liste seçime hazır
 * olmazsa (sayfa yüklenirken kısa süre kilitliyor ya da süslü bir bileşenin arkasında gizli) bir kez daha, görünürlük beklemeden denenir.
 */
export async function listedenSec(sayfa: Page, a: HamAlan, deger: string, zamanAsimiMs = 10_000): Promise<void> {
  const l = kapsam(sayfa, a.cerceve).locator(a.secici).first();
  try {
    await l.selectOption({ value: deger }, { timeout: zamanAsimiMs, force: a.ozelBilesen === true });
  } catch {
    await l.selectOption({ value: deger }, { timeout: 5_000, force: true });
  }
}

const yolu = (adres: string): string => { try { return new URL(adres).pathname; } catch { return '?'; } };
const ilkSatir = (h: unknown): string => String(h instanceof Error ? h.message : h).split('\n')[0].replace(/https?:\/\/\S+/g, '<adres>').slice(0, 160);

/**
 * Zincir keşfi. kesifler: birinci düzey seçim keşfinin sonuçları (bağlantıların başlangıcı); temel: sayfanın ilk okuması.
 * Sonunda sayfa ilk durumunda DEĞİLDİR: çağıran gerekiyorsa sayfayı yeniden açar (sonuc.acilis > 0).
 */
export async function zincirKesfet(b: ZincirBaglami, temel: HamAlan[], kesifler: Kesifler, ayar: ZincirAyari): Promise<ZincirSonucu> {
  const sonuc: ZincirSonucu = { iliskiler: [], gozlemler: [], bulgular: [], acilis: 0, secim: 0, notlar: [], sureler: {} };
  const { iliskiler, kokler } = birinciDuzeyIliskiler(kesifler, temel);
  if (!iliskiler.length) return sonuc;
  const derinlik = Math.max(1, ayar.derinlik);
  const ornek = Math.max(1, ayar.ornek);
  const bekleMs = ayar.bekleMs ?? ZINCIR_SECENEK_BEKLEME_MS;
  const ilkAlanlar = new Map(temel.map((a) => [a.anahtar, a]));
  /** Bilinen ilişkiler (üst → altlar); keşif ilerledikçe büyür. */
  const altlari = new Map<string, Set<string>>();
  const iliskiEkle = (ust: string, alt: string): void => {
    if (!altlari.has(ust)) altlari.set(ust, new Set());
    const s = altlari.get(ust) as Set<string>;
    if (s.has(alt)) return;
    s.add(alt);
    sonuc.iliskiler.push({ ust, alt });
  };
  for (const i of iliskiler) iliskiEkle(i.ust, i.alt);
  const bulgu = (x: ZincirBulgusu): void => { sonuc.bulgular.push(x); };
  let butceBitti = false;
  const durdu = (): boolean => butceBitti || Boolean(b.durdu?.());
  const etiket = (a: HamAlan | undefined, anahtar: string): string => a?.etiket || ilkAlanlar.get(anahtar)?.etiket || anahtar;

  /** Sayfayı baştan açıp yolun seçimlerini sırayla uygular; son okuma (ya da dal bırakıldıysa null). */
  async function yoluKur(yol: ZincirSecimi[]): Promise<HamAlan[] | null> {
    if (sonuc.acilis >= ZINCIR_EN_COK_ACILIS) {
      butceBitti = true;
      sonuc.notlar.push(`Bağlı liste keşfi ${ZINCIR_EN_COK_ACILIS} sayfa açılışında durduruldu; zincirin kalan dalları incelenmedi.`);
      return null;
    }
    sonuc.acilis++;
    await b.ac();
    let alanlar = await b.oku();
    for (let i = 0; i < yol.length; i++) {
      const s = yol[i];
      const a = alanlar.find((x) => x.anahtar === s.anahtar);
      if (!a) return null;
      try { await listedenSec(b.sayfa, a, s.deger); sonuc.secim++; } catch { return null; }
      await b.sakinles(b.sayfa, 10_000);
      const sonraki = yol[i + 1];
      alanlar = sonraki ? await secenekBekle(sonraki.anahtar) : await b.oku();
    }
    return alanlar;
  }

  /** Alt listenin gerçek seçenekleri gelene kadar okur (en çok bekleMs); son okumayı döner. */
  async function secenekBekle(anahtar: string): Promise<HamAlan[]> {
    const son = Date.now() + bekleMs;
    for (;;) {
      const alanlar = await b.oku();
      const a = alanlar.find((x) => x.anahtar === anahtar);
      if ((a && gercekSecenekler(a.secenekler).length && !a.devreDisi) || Date.now() >= son || durdu()) return alanlar;
      await b.sayfa.waitForTimeout(400);
    }
  }

  /**
   * Bir kat: yol uygulanmışken "hedef" listesinde örnek değerler denenir; her değerde alt listeler gözlenir. Kökte (yol boş) her değerin
   * dalı, aşağıda alt listesi dolan ilk değerin dalı bir kat daha derine iner.
   */
  async function kat(yol: ZincirSecimi[], hedef: string, duzey: number): Promise<void> {
    if (durdu()) return;
    const taban = await yoluKur(yol);
    if (!taban) return;
    const F = taban.find((x) => x.anahtar === hedef);
    if (!F) return;
    const g = kesifGuvenligi(F);
    if (!g.guvenli) { sonuc.notlar.push(`“${etiket(F, hedef)}” zincirde denenmedi (${g.neden}).`); return; }
    const degerler = ornekDegerler(F.secenekler, ornek);
    const haric = new Set([...yol.map((s) => s.anahtar), hedef]);
    const yolNesnesi = Object.fromEntries(yol.map((s) => [s.anahtar, s.deger]));
    const dallar: Array<{ secim: ZincirSecimi; altlar: string[] }> = [];
    const gorulenler: Array<{ secimler: ZincirSecimi[]; altlar: Set<string> }> = [];
    const adresOnce = yolu(b.sayfa.url());
    const hatalarOnce = new Set(b.hataMetinleri ? await b.hataMetinleri().catch(() => []) : []);
    b.ilerleme?.(`Bağlı listeler inceleniyor: ${[...yol.map((s) => s.metin), etiket(F, hedef)].join(' → ')}`);
    for (const d of degerler) {
      if (durdu()) return;
      const secim: ZincirSecimi = { anahtar: hedef, deger: d.deger, metin: d.metin };
      const secimler = [...yol, secim];
      let secildi = 0;
      try {
        await listedenSec(b.sayfa, F, d.deger);
        secildi = Date.now();
        sonuc.secim++;
      } catch (h) {
        // Seçimin yapılamaması sayfa hatası olduğu kesin değil (liste yüklenirken kilitli olabilir): bulgu değil, not.
        sonuc.notlar.push(`${[...yol.map((s) => s.metin), etiket(F, hedef)].join(' → ')}: “${d.metin}” denenemedi (${ilkSatir(h)}).`);
        continue;
      }
      await b.sakinles(b.sayfa, 10_000);
      if (yolu(b.sayfa.url()) !== adresOnce) {
        bulgu({ tur: 'gezinme', alan: hedef, secimler, metin: yolu(b.sayfa.url()) });
        return; // sayfa değişti: bu kattaki diğer değerler denenemez
      }
      // Bilinen alt listesi varsa seçenekleri gelene kadar beklenir (yavaş yüklenen listeler).
      const bilinen = [...(altlari.get(hedef) ?? [])];
      let sonra = await b.oku();
      for (const k of bilinen) {
        const a = sonra.find((x) => x.anahtar === k);
        if (!a || !gercekSecenekler(a.secenekler).length || a.devreDisi) sonra = await secenekBekle(k);
      }
      if (b.hataMetinleri) {
        for (const m of await b.hataMetinleri().catch(() => [])) if (!hatalarOnce.has(m)) { bulgu({ tur: 'hataMesaji', alan: hedef, secimler, metin: m }); hatalarOnce.add(m); }
      }
      // Alt listelerin dolma süresi (seçimden seçeneklerin okunduğu ana; sayfanın sakinleşmesi dahil): koşucu beklemesini buna göre ayarlar.
      const gecenMs = Date.now() - secildi;
      const degisen = degisenSecimler(taban, sonra, haric).map((x) => x.anahtar);
      const altlar = [...new Set([...degisen, ...bilinen.filter((k) => sonra.some((x) => x.anahtar === k))])];
      const dolu: string[] = [];
      for (const alt of altlar) {
        const a = sonra.find((x) => x.anahtar === alt) as HamAlan;
        iliskiEkle(hedef, alt);
        const l = gercekSecenekler(a.secenekler);
        sonuc.gozlemler.push({ anahtar: alt, secimler: { ...yolNesnesi, [hedef]: d.deger }, secenekler: l });
        if (!l.length) bulgu({ tur: 'bosListe', alan: alt, secimler, beklenenMs: bekleMs });
        else { dolu.push(alt); (sonuc.sureler[alt] ??= []).push(gecenMs); }
        const tekrar = tekrarlayanSecenekler(a.secenekler ?? []);
        if (tekrar.length) bulgu({ tur: 'tekrarlayan', alan: alt, secimler, metinler: tekrar });
      }
      if (dolu.length) dallar.push({ secim, altlar: dolu });
      gorulenler.push({ secimler, altlar: new Set(altlar) });
    }
    // Bazı değerlerde alt liste görüldü (dolu), bazılarında hiç oluşmadı / değişmedi: o değerlerde alt liste boş kalmıştır.
    const tumDolu = new Set(dallar.flatMap((d) => d.altlar));
    for (const x of gorulenler) for (const alt of tumDolu) if (!x.altlar.has(alt)) bulgu({ tur: 'bosListe', alan: alt, secimler: x.secimler, beklenenMs: bekleMs });
    if (duzey >= derinlik) return;
    // Kökte her değerin dalı (farklı kombinasyonlar); aşağıda yalnız ilk dolu dal.
    for (const dal of duzey === 1 ? dallar : dallar.slice(0, 1)) {
      for (const alt of dal.altlar) await kat([...yol, dal.secim], alt, duzey + 1);
    }
  }

  for (const kok of kokler.slice(0, ZINCIR_EN_COK_KOK)) {
    if (durdu()) break;
    try {
      await kat([], kok, 1);
    } catch (h) {
      sonuc.notlar.push(`“${etiket(undefined, kok)}” zinciri incelenirken hata: ${ilkSatir(h)}`);
    }
  }
  if (kokler.length > ZINCIR_EN_COK_KOK) sonuc.notlar.push(`${kokler.length} bağlı liste zincirinden ilk ${ZINCIR_EN_COK_KOK} tanesi incelendi.`);
  sonuc.bulgular = bulgulariTekillestir(sonuc.bulgular);
  // Bir alt liste bazı üst değerlerde boş, bazılarında dolu geldiyse "boş kaldı" bulgusu anlamlıdır; HİÇ dolu gelmediyse liste bu üst
  // seçime bağlı değil ya da hep boştur: bulgu yerine not.
  const doluGelen = new Set(sonuc.gozlemler.filter((x) => x.secenekler.length).map((x) => x.anahtar));
  const hepBos = new Set(sonuc.bulgular.filter((x) => x.tur === 'bosListe' && x.alan && !doluGelen.has(x.alan)).map((x) => x.alan as string));
  sonuc.bulgular = sonuc.bulgular.filter((x) => !(x.tur === 'bosListe' && x.alan && hepBos.has(x.alan)));
  for (const a of hepBos) sonuc.notlar.push(`“${etiket(undefined, a)}” listesi denenen hiçbir seçimde dolmadı.`);
  return sonuc;
}
