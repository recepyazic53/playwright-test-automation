// BAĞLI ALAN ZİNCİRİ MOTORU (genel; Playwright). Seçim keşfinin (tarama-motoru.ts > secimleriKesfet) bulduğu birinci düzey bağlantılardan
// (ör. İl seçilince İlçe listesi doluyor) başlayıp zinciri SONUNA KADAR yürür: üst listede bir değer seçilir, alt listenin seçenekleri
// gelince onda da değerler denenir, onun alt listesi aranır… (il → ilçe → belde → mahalle → sokak → bina → daire; marka → model → paket).
// Hiçbir alan / ürün adı bilinmez: bağlantı yalnız sayfanın davranışından çıkar (zincir-kesfi.mjs > degisenSecimler).
//
// Yöntem (kat kat): sayfa baştan açılır, kökten bu kata kadarki seçimler sırayla uygulanır; bu kattaki listede örnek değerler (ilk, son,
// aradan; Ayarlar > "Bağlı liste keşfi: her katta denenecek değer") art arda seçilir ve her birinde alt listeler okunur (gözlem + bulgu).
// Kökte her örnek değerin dalı ayrı ayrı derine inilir (farklı kombinasyonlar); daha aşağıda, alt listesi dolan ilk değerin dalı izlenir.
// En çok "derinlik" kat, en çok acilisSiniri(...) sayfa açılışı (aşılırsa "N. halkada durdu" notu düşülür).
//
// GÜVENLİK: yalnız SEÇİM yapılır; hiçbir düğmeye / bağlantıya basılmaz. Kayıt / gönderim çağrıştıran listeler denenmez (koruma.mjs >
// kesifGuvenligi). Seçim sayfayı başka adrese götürürse o dal bırakılır (bulgu). Değer okunmaz (yalnız seçenek etiketleri).
import type { FrameLocator, Page } from '@playwright/test';
import { kesifGuvenligi } from './koruma.mjs';
import type { HamAlan } from './paket-olusturucu.mjs';
import {
  ZINCIR_EK_DENEME, ZINCIR_EN_COK_KOK, ZINCIR_GEC_DOLMA_MS, ZINCIR_SECENEK_BEKLEME_MS, acilisSiniri, belirsizBaglar, birinciDuzeyIliskiler,
  bulgulariTekillestir, degisenSecimler, gercekSecenekler, ornekDegerler, tekrarlayanSecenekler, type ZincirBulgusu, type ZincirSecimi, type ZincirSonucu
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
 * Açılır listede değeri seçer. Sıra: (1) liste ETKİNLEŞENE ve seçenek gelene kadar beklenir (seçenekler gelirken liste kısa süre devre
 * dışı kalabilir); (2) Playwright seçimi (özel bileşenin gizli <select>'inde görünürlük beklenmez); (3) olmazsa normal koşunun özel bileşen
 * yolu: değer doğrudan yazılır + input / change olayları gönderilir (gizli / sarılı / kilitli kalan liste; değer, yoksa görünen metinle
 * eşleşir). Hepsi olmazsa hata (çağıran sonraki değeri dener).
 */
export async function listedenSec(sayfa: Page, a: HamAlan, deger: string, zamanAsimiMs = 10_000): Promise<void> {
  const l = kapsam(sayfa, a.cerceve).locator(a.secici).first();
  type Durum = 'hazir' | 'kilitli' | 'yok' | 'secim-degil';
  const durum = (): Promise<Durum> => l.evaluate((el, v): Durum => {
    if (!(el instanceof HTMLSelectElement)) return 'secim-degil';
    if (![...el.options].some((o) => o.value === v || (o.textContent ?? '').trim() === v)) return 'yok';
    return el.disabled ? 'kilitli' : 'hazir';
  }, deger, { timeout: 2_000 }).catch((): Durum => 'yok');
  // (1) Etkinleşme + seçeneğin gelmesi (en çok zamanAsimiMs; kilitli kalırsa yine denenir — bazı bileşenler yerel listeyi kilitli tutar).
  const son = Date.now() + zamanAsimiMs;
  let d = await durum();
  while (d !== 'hazir' && d !== 'secim-degil' && Date.now() < son) {
    await sayfa.waitForTimeout(250);
    d = await durum();
  }
  // (2) Playwright seçimi (kısa).
  try {
    await l.selectOption({ value: deger }, { timeout: d === 'hazir' ? 3_000 : 1_000, force: a.ozelBilesen === true || d !== 'hazir' });
    return;
  } catch { /* özel bileşen yolu */ }
  // (3) Özel bileşen yolu: değer + olaylar.
  const sonuc = await l.evaluate((el, v) => {
    if (!(el instanceof HTMLSelectElement)) return 'seçim listesi değil';
    const o = [...el.options].find((x) => x.value === v) ?? [...el.options].find((x) => (x.textContent ?? '').trim() === v);
    if (!o) return 'seçenek listede yok';
    el.value = o.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value === o.value ? 'tamam' : 'değer yazılamadı';
  }, deger, { timeout: 3_000 }).catch((h: unknown) => String(h instanceof Error ? h.message : h).split('\n')[0]);
  if (sonuc !== 'tamam') throw new Error(`“${deger}” seçilemedi: ${sonuc}${d === 'kilitli' ? ' (liste devre dışı kaldı)' : ''}`);
}

const yolu = (adres: string): string => { try { return new URL(adres).pathname; } catch { return '?'; } };
const ilkSatir = (h: unknown): string => String(h instanceof Error ? h.message : h).split('\n')[0].replace(/https?:\/\/\S+/g, '<adres>').slice(0, 160);
/** Bağlı liste olabilecek alan: tekli açılır liste. */
const listeMi = (a: HamAlan): boolean => a.tur === 'select' && !a.coklu;

/**
 * Zincir keşfi. kesifler: birinci düzey seçim keşfinin sonuçları (bağlantıların başlangıcı); temel: sayfanın ilk okuması.
 * Sonunda sayfa ilk durumunda DEĞİLDİR: çağıran gerekiyorsa sayfayı yeniden açar (sonuc.acilis > 0).
 *
 * Son halkaların kaçmaması için (uzun zincir: il → … → bina → daire):
 *  - bir katta örnek değerlerin HİÇBİRİNDE alt liste dolmadıysa (bazı üst değerlerin altı boş) en çok ZINCIR_EK_DENEME değer daha denenir;
 *  - seçimden sonra hiçbir liste değişmediyse ve sayfada boş liste varsa geç dolma (zamanlayıcıyla dolan liste) için bir süre daha bakılır;
 *  - sayfa açılış sınırı zincir sayısı / uzunluğuyla büyür; sınır ya da derinlik yüzünden durulursa "N. halkada durdu" notu düşülür;
 *  - bağlantısı yine bulunamayan boş listeler, alt listesi bulunamayan halkaya "belirsiz" bağla bağlanır (veri durağında denenir).
 */
export async function zincirKesfet(b: ZincirBaglami, temel: HamAlan[], kesifler: Kesifler, ayar: ZincirAyari): Promise<ZincirSonucu> {
  const sonuc: ZincirSonucu = { iliskiler: [], belirsizler: [], gozlemler: [], bulgular: [], acilis: 0, secim: 0, notlar: [], sureler: {} };
  const { iliskiler, kokler } = birinciDuzeyIliskiler(kesifler, temel);
  if (!iliskiler.length) return sonuc;
  const derinlik = Math.max(1, ayar.derinlik);
  const ornek = Math.max(1, ayar.ornek);
  const bekleMs = ayar.bekleMs ?? ZINCIR_SECENEK_BEKLEME_MS;
  const enCokAcilis = acilisSiniri(kokler.length, ornek, derinlik);
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
  /** Alt listesi bulunamayan (ya da sınır yüzünden inilmeyen) halkalar: belirsiz bağların olası üstleri. */
  const yapraklar = new Set<string>();
  /** Ölçülen en uzun dolma süresi (geç dolma beklemesi buna göre uzar). */
  const enUzunSure = (): number => Math.max(0, ...Object.values(sonuc.sureler).flat());

  /** Sayfayı baştan açıp yolun seçimlerini sırayla uygular; son okuma (ya da dal bırakıldıysa null). duzey: açılan katın halka numarası. */
  async function yoluKur(yol: ZincirSecimi[], duzey: number, hedef: string): Promise<HamAlan[] | null> {
    if (sonuc.acilis >= enCokAcilis) {
      if (!butceBitti) sonuc.notlar.push(`Zincir keşfi ${duzey}. halkada durdu (süre: ${enCokAcilis} sayfa açılışı sınırı); zincirin kalan dalları incelenmedi.`);
      butceBitti = true;
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
      // Sonraki seçim ya da bu katın hedef listesi: seçenekleri gelip liste ETKİNLEŞENE kadar beklenir (seçenekler gelirken kısa süre
      // kilitli kalan liste "devre dışı" sanılıp zincirden düşmesin).
      alanlar = await secenekBekle(yol[i + 1]?.anahtar ?? hedef);
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
    const taban = await yoluKur(yol, duzey, hedef);
    if (!taban) { if (butceBitti) yapraklar.add(hedef); return; }
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
    const yolMetni = [...yol.map((s) => s.metin), etiket(F, hedef)].join(' → ');
    b.ilerleme?.(`Bağlı listeler inceleniyor: ${yolMetni}`);
    /** Bir değeri dener; sayfa başka adrese gittiyse false (bu kattaki diğer değerler denenemez). */
    const dene = async (d: { deger: string; metin: string }): Promise<boolean> => {
      const secim: ZincirSecimi = { anahtar: hedef, deger: d.deger, metin: d.metin };
      const secimler = [...yol, secim];
      let secildi = 0;
      try {
        await listedenSec(b.sayfa, F, d.deger);
        secildi = Date.now();
        sonuc.secim++;
      } catch (h) {
        // Seçimin yapılamaması sayfa hatası olduğu kesin değil (liste yüklenirken kilitli olabilir): bulgu değil, not.
        sonuc.notlar.push(`${yolMetni}: “${d.metin}” denenemedi (${ilkSatir(h)}).`);
        return true;
      }
      await b.sakinles(b.sayfa, 10_000);
      if (yolu(b.sayfa.url()) !== adresOnce) {
        bulgu({ tur: 'gezinme', alan: hedef, secimler, metin: yolu(b.sayfa.url()) });
        return false;
      }
      // Bilinen alt listesi varsa seçenekleri gelene kadar beklenir (yavaş yüklenen listeler).
      const bilinen = [...(altlari.get(hedef) ?? [])];
      let sonra = await b.oku();
      for (const k of bilinen) {
        const a = sonra.find((x) => x.anahtar === k);
        if (!a || !gercekSecenekler(a.secenekler).length || a.devreDisi) sonra = await secenekBekle(k);
      }
      // Hiçbir liste değişmediyse ama sayfada boş liste varsa: liste geç dolabilir (istek bittikten sonra zamanlayıcıyla). Bir süre daha bakılır.
      if (!bilinen.length && !degisenSecimler(taban, sonra, haric).length
        && sonra.some((a) => listeMi(a) && !haric.has(a.anahtar) && (!gercekSecenekler(a.secenekler).length || a.devreDisi))) {
        const son = Date.now() + Math.min(bekleMs, Math.max(ZINCIR_GEC_DOLMA_MS, enUzunSure() * 3));
        while (Date.now() < son && !durdu()) {
          await b.sayfa.waitForTimeout(400);
          sonra = await b.oku();
          if (degisenSecimler(taban, sonra, haric).length) { await b.sakinles(b.sayfa, 5_000); sonra = await b.oku(); break; }
        }
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
      return true;
    };
    for (const d of degerler) {
      if (durdu()) return;
      if (!(await dene(d))) return;
    }
    // Örnek değerlerin hiçbirinde alt liste dolmadıysa (ör. ilk / son / ortadaki binanın dairesi yok): kalan değerlerden birkaçı daha
    // denenir; ilk dolan değerde durulur. Bağ, denenen değerlerden EN AZ BİRİNDE alt liste değiştiyse kurulur.
    if (!dallar.length) {
      const denenen = new Set(degerler.map((d) => d.deger));
      const kalan = gercekSecenekler(F.secenekler).filter((s) => !denenen.has(s.deger));
      for (const d of ornekDegerler(kalan, ZINCIR_EK_DENEME)) {
        if (durdu() || dallar.length) break;
        if (!(await dene(d))) return;
      }
      if (!dallar.length && !durdu()) yapraklar.add(hedef);
    }
    // Bazı değerlerde alt liste görüldü (dolu), bazılarında hiç oluşmadı / değişmedi: o değerlerde alt liste boş kalmıştır.
    const tumDolu = new Set(dallar.flatMap((d) => d.altlar));
    for (const x of gorulenler) for (const alt of tumDolu) if (!x.altlar.has(alt)) bulgu({ tur: 'bosListe', alan: alt, secimler: x.secimler, beklenenMs: bekleMs });
    if (duzey >= derinlik) {
      if (dallar.length) {
        const kalanlar = [...new Set(dallar.flatMap((d) => d.altlar))];
        for (const a of kalanlar) yapraklar.add(a);
        sonuc.notlar.push(`Zincir keşfi ${duzey}. halkada durdu (derinlik sınırı ${derinlik}; Ayarlar > Koşu > Tarama ve akış kaydı): ${kalanlar.map((k) => `“${etiket(undefined, k)}”`).join(', ')} listesinin altı incelenmedi.`);
      }
      return;
    }
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
  // Bazı üst değerlerde boş, bazılarında dolu gelen liste (ör. dairesi olmayan bina, ilçesi olmayan il): çoğu zaman verinin kendisidir,
  // sayfa hatası değil. Her değer için ayrı bulgu yerine liste başına tek özet not: "bazı “Bina No” değerlerinde boş geliyor (3/9)".
  const kismenBos = new Map<string, { ust: string; bos: Set<string> }>();
  for (const x of sonuc.bulgular) {
    if (x.tur !== 'bosListe' || !x.alan) continue;
    const ust = x.secimler.at(-1)?.anahtar ?? '';
    const k = kismenBos.get(x.alan) ?? { ust, bos: new Set<string>() };
    k.bos.add(JSON.stringify(x.secimler.map((s) => s.deger)));
    kismenBos.set(x.alan, k);
  }
  sonuc.bulgular = sonuc.bulgular.filter((x) => x.tur !== 'bosListe');
  for (const [alt, { ust, bos }] of kismenBos) {
    const dolu = new Set(sonuc.gozlemler.filter((g) => g.anahtar === alt && g.secenekler.length).map((g) => JSON.stringify(Object.values(g.secimler)))).size;
    sonuc.notlar.push(`“${etiket(undefined, alt)}” bazı “${etiket(undefined, ust)}” değerlerinde boş geliyor (${bos.size}/${bos.size + dolu} denenen değerde boş; sayfa hatası sayılmadı).`);
  }
  // Bağlantısı bulunamayan boş listeler (sayfa açılınca yalnız yer tutuculu; hiçbir bağda yok): alt listesi bulunamayan halkaya belirsiz bağ.
  const iliskili = new Set(sonuc.iliskiler.flatMap((i) => [i.ust, i.alt]));
  const sira = new Map(temel.map((a, i) => [a.anahtar, i]));
  const yetimler = temel.filter((a) => listeMi(a) && !iliskili.has(a.anahtar) && !gercekSecenekler(a.secenekler).length && kesifGuvenligi(a).guvenli).map((a) => a.anahtar);
  sonuc.belirsizler = belirsizBaglar(yetimler, [...yapraklar], (k) => sira.get(k) ?? 1e6);
  for (const x of sonuc.belirsizler) {
    sonuc.notlar.push(`“${etiket(undefined, x.alt)}” listesinin “${etiket(undefined, x.ust)}” seçimine bağlı olduğu kesinleşmedi (denenen değerlerde seçenek gelmedi); veri durağında “↓ … seçeneklerini getir” ile seçtiğiniz değerle denenir.`);
  }
  return sonuc;
}
