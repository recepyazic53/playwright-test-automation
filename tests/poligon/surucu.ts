// POLİGON SÜRÜCÜSÜ (spec DEĞİL) — hızlı testi bir poligon ekranında baştan sona API ile sürer: izin "Evet" (ya da verilen), veri durağı
// (elle / "Doldur" ile tablodan), zincir, bitiş etiketi, doğrulama koşusu, kaydet, ardından kaydedilen senaryonun normal koşusu. Sapmalar
// BULGU olarak sonuca yazılır. Hem uzun poligon koşusu (tests/birim/hizli-test-poligon.spec.ts, POLIGON=1) hem poligon düzeltmelerinin
// birim testleri (tests/birim/poligon-*.spec.ts) kullanır.
//
// poligonOrtami: ayrı Nöbetçi örneği (boş port, GEÇİCİ veri kökü ve veritabanı; kasa API ile), poligon sunucusu (127.0.0.1), proje + ortam
// + "Kişiler" test verisi tablosu (uydurma). Kullanıcının veri/ klasörüne ve çalışan Nöbetçi'sine dokunulmaz.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { adaySecimi, doldurAdaylari, type DoldurTablosu } from '../../scripts/platform/tablolar/doldur-onerisi.mjs';
import { izinleriAcApi, nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from '../birim/nobetci-sunucusu';
import { HIZLI_KDF } from '../birim/platform-ortak';
import { poligonBaslat } from './sunucu.mjs';
import type { EkranPlani } from './planlar';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- oturum / model JSON'u serbestçe gezilir
export type Nesne = Record<string, any>;

export type PoligonOrtami = {
  nobetci: Nobetci;
  poligon: Awaited<ReturnType<typeof poligonBaslat>>;
  projeId: string;
  ortamId: string;
  veriKoku: string;
  api: (yol: string, govde?: Nesne) => Promise<Yanit>;
  sayac: (kok: string) => Nesne;
  kapat: () => Promise<void>;
};

/** "Doldur" için uydurma kişi satırı (Kişiler tablosu). */
export const KISI = {
  Ad: 'Deneme', Soyad: 'Kişi', 'Ad soyad': 'Deneme Kişi', 'E-posta': 'deneme@ornek.test', 'Cep telefonu': '05001112233', 'Doğum tarihi': '01.02.1990',
  'Açık adres': 'Deneme sokak 1', 'Kimlik no': '10000000146', IBAN: 'TR120006200000000123456789'
} as const;

/** Ayrı Nöbetçi + poligon (127.0.0.1) + proje / ortam / Kişiler tablosu. kapat() her şeyi kapatır ve geçici veri kökünü siler. */
export async function poligonOrtami(ek: { kasaArayuzu?: boolean; geciciKok?: string } = {}): Promise<PoligonOrtami> {
  const poligon = await poligonBaslat();
  const veriKoku = mkdtempSync(join(ek.geciciKok ?? tmpdir(), 'poligon-veri-'));
  const vtYolu = join(veriKoku, 'platform.db');
  const parola = `Gecici-Poligon-${randomBytes(6).toString('hex')}`;
  if (!ek.kasaArayuzu) {
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
    vt.kapat();
  }
  const nobetci = await nobetciBaslat(veriKoku, vtYolu, {
    NOBETCI_VERI_KOKU: veriKoku, NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: poligon.adres,
    NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '300', NOBETCI_REHBER_OTOMATIK: '0'
  });
  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  const kapat = async (): Promise<void> => {
    nobetci.surec.kill('SIGTERM');
    await poligon.kapat();
    await new Promise((c) => setTimeout(c, 1500));
    rmSync(veriKoku, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  };
  const ortam: PoligonOrtami = { nobetci, poligon, projeId: '', ortamId: '', veriKoku, api, sayac: (kok) => poligon.sayaclar()[kok] as Nesne, kapat };
  if (ek.kasaArayuzu) return ortam;
  const zorunlu = async (yol: string, govde: Nesne): Promise<Yanit> => {
    const y = await api(yol, govde);
    if (!y.basarili) throw new Error(`${yol}: ${y.mesaj ?? JSON.stringify(y).slice(0, 300)}`);
    return y;
  };
  await zorunlu('/platform/kasa/ac', { parola });
  await izinleriAcApi(nobetci);
  ortam.projeId = String(((await zorunlu('/platform/proje/kaydet', { ad: 'Poligon' })).proje as Nesne).id);
  ortam.ortamId = String(((await zorunlu('/platform/ortam/kaydet', { projeId: ortam.projeId, ad: 'Poligon', tabanUrl: poligon.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  await kisilerTablosu(ortam);
  return ortam;
}

/** "Doldur" için test verisi (uydurma; hassas sütunlar gizli). */
export async function kisilerTablosu(o: Pick<PoligonOrtami, 'api' | 'projeId'>): Promise<void> {
  const y = await o.api('/platform/tablo/kaydet', {
    projeId: o.projeId, ad: 'Kişiler', tur: 'kayit',
    sutunlar: ['Ad', 'Soyad', 'Ad soyad', 'E-posta', 'Cep telefonu', 'Doğum tarihi', 'Açık adres'].map((ad) => ({ ad })).concat([{ ad: 'Kimlik no', gizli: true } as never, { ad: 'IBAN', gizli: true } as never]),
    satirlar: [{ ad: 'Birinci', degerler: { ...KISI } }]
  });
  if (!y.basarili) throw new Error(`Kişiler tablosu: ${y.mesaj}`);
}

const SORU_DURUMLARI = ['veri', 'karar', 'hataSorusu', 'onay', 'diyalog', 'bitis', 'kaydet', 'hayirSecim', 'kaydedildi', 'hata', 'iptal'];

export async function oturumOku(o: PoligonOrtami, id: string): Promise<Nesne> {
  return (await o.api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
}

/** Oturum bir soru durumuna gelene kadar bekler (hata / iptal de döner). */
export async function oturumBekle(o: PoligonOrtami, id: string, durumlar = SORU_DURUMLARI, sn = 150): Promise<Nesne> {
  const son = Date.now() + sn * 1000;
  for (;;) {
    const x = await oturumOku(o, id);
    if (durumlar.includes(x.durum) || ['hata', 'iptal'].includes(x.durum)) return x;
    if (Date.now() > son) throw new Error(`zaman aşımı: beklenen ${durumlar.join('/')}, olan ${x.durum} (${x.calisiyor ?? ''})`);
    await new Promise((c) => setTimeout(c, 300));
  }
}

/** Süren tarayıcı işi bitene kadar. */
export async function isBitsin(o: PoligonOrtami): Promise<void> {
  for (const son = Date.now() + 60_000; Date.now() < son; await new Promise((c) => setTimeout(c, 300))) {
    if (!(await o.api('/platform/tarama/aktif')).is) return;
  }
}

/** Veri durağı alanı için plandaki değer (etikete göre). */
export function planDegeri(p: EkranPlani, etiket: string, ilkSoru: boolean, secenekler: Nesne[] | null = null): { deger?: string | boolean; tablo?: string } | null {
  // Adı görünmeyen seçim grubu: plan etiketi seçeneklerin metniyle eşlenir (kullanıcı seçeneklere bakarak tanır).
  const d = p.degerler.find((x) => x.etiket.test(etiket))
    ?? (/^Adı görünmeyen alan/.test(etiket) && secenekler ? p.degerler.find((x) => secenekler.some((s) => x.etiket.test(String(s.metin ?? '')))) : undefined);
  if (!d) return null;
  if (ilkSoru && d.ilk !== undefined) return { deger: d.ilk };
  return d.tablo ? { tablo: d.tablo } : { deger: d.deger };
}

/** Seçim alanında plan değerini (değer ya da metin) seçeneğin değerine çevirir. */
export function secenekDegeri(a: Nesne, d: string | boolean): string | boolean | null {
  if (typeof d === 'boolean' || !Array.isArray(a.secenekler) || !a.secenekler.length) return d;
  const k = (v: unknown): string => String(v).toLocaleLowerCase('tr');
  const s = (a.secenekler as Nesne[]).find((x) => k(x.deger) === k(d) || k(x.metin) === k(d));
  return s ? String(s.deger) : null;
}

export type SurucuAyari = {
  /** Basma izni (varsayılan Evet). */
  izin?: 'evet' | 'sor' | 'hayir';
  /** Görüntü / model / senaryo dosyalarının yazılacağı klasör (yoksa yazılmaz). */
  rapor?: string | null;
  /** Bana sor: pencere sorusunun yanıtı (varsayılan kabul). */
  diyalogYaniti?: 'kabul' | 'iptal';
  /** Doğrulama koşusundan sonra dur (kaydet / normal koşu yapılmaz). */
  kayitYok?: boolean;
};

/** Bir ekranı hızlı testle baştan sona sürer; aşamalar (✓ / ✗), bulgular, sayaçlar ve ham kayıtlar döner. */
export async function ekranKos(o: PoligonOrtami, p: EkranPlani, ayar: SurucuAyari = {}): Promise<Nesne> {
  const { api, projeId, ortamId } = o;
  const sayac = o.sayac;
  const rapor = ayar.rapor ?? null;
  const goruntuKaydet = (ad: string, b64: string | null | undefined): string | null => {
    if (!b64 || !rapor) return null;
    const dosya = `${ad.replace(/[^a-z0-9-]+/gi, '-')}.jpg`;
    writeFileSync(join(rapor, dosya), Buffer.from(b64, 'base64'));
    return dosya;
  };
  const bekle = (id: string, durumlar?: string[], sn?: number): Promise<Nesne> => oturumBekle(o, id, durumlar, sn);
  const basarili = async (yol: string, govde: Nesne): Promise<Yanit> => {
    const y = await api(yol, govde);
    if (!y.basarili) throw new Error(`${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`);
    return y;
  };
  const r: Nesne = {
    kok: p.kok, ekranAdi: p.ekranAdi, asamalar: {}, bulgular: [] as string[], veriDuraklari: [] as Nesne[], kararlar: [] as Nesne[], hataSorulari: [] as Nesne[],
    diyalogSorulari: [] as Nesne[], sureler: {}, goruntuler: [] as string[], doldurma: {}, sayac: {}
  };
  const bulgu = (m: string): void => { r.bulgular.push(m); };
  const t0 = Date.now();
  const s0 = sayac(p.kok).gonderim;
  const d0 = sayac(p.kok).doldurma.length;
  let id = '';
  try {
    const b = await api('/platform/hizli-test/baslat', { projeId, ortamId, hedef: `${p.kok}/`, ekranAdi: p.ekranAdi, izin: ayar.izin ?? 'evet' });
    if (!b.basarili) { bulgu(`Başlatılamadı: ${b.mesaj}`); r.asamalar.kesif = false; return r; }
    id = String(b.id);
    r.oturumId = id;
    let x = await bekle(id);
    r.sureler.kesifMs = Date.now() - t0;
    r.kesif = x.kesif;
    r.zincir = x.zincir;
    r.bulgularNobetci = x.bulgular;
    r.goruntuler.push(goruntuKaydet(`${p.kok.slice(1)}-1-kesif`, x.goruntu));
    // Keşif: ilk veri durağında beklenen alanlar.
    const ilkAlanlar: string[] = x.durum === 'veri' ? (x.soru.alanlar as Nesne[]).map((a) => String(a.etiket)) : [];
    const eksikKesif = p.kesif.filter((k) => !ilkAlanlar.some((e) => k.test(e)));
    r.asamalar.kesif = x.durum !== 'hata' && eksikKesif.length === 0;
    if (eksikKesif.length) bulgu(`Keşifte görünmeyen alanlar: ${eksikKesif.map(String).join(', ')} (keşfedilen: ${JSON.stringify(ilkAlanlar)})`);
    let durakNo = 0;
    let planSira = 0;
    let veriOk = true;
    let eylemOk = true;
    const ayniDurak = new Map<string, number>();
    const sorulanlar = new Set<string>();
    const ilkSorulanlar = new Set<string>();
    /** Beklenmeyen hata sorusuyla sonuçlanan basışların adım numaraları (plan sırasında sayılmaz; düğmeye yeniden basılır). */
    const hataliBasislar = new Set<number>();
    const denemeler = new Map<string, number>();
    for (let tur = 0; tur < 40; tur++) {
      if (x.durum === 'hata' || x.durum === 'iptal') { bulgu(`Oturum ${x.durum}: ${JSON.stringify(x.hata)}`); eylemOk = false; break; }
      if (x.durum === 'veri') {
        durakNo++;
        const alanlar = x.soru.alanlar as Nesne[];
        r.veriDuraklari.push({
          no: durakNo, not: x.soru.not, alanlar: alanlar.map((a) => ({
            etiket: a.etiket, tur: a.tur, zorunlu: a.zorunlu, hazir: a.hazir, mevcut: a.mevcut, kosul: a.kosul?.metin ?? null, bagli: a.bagli ? `${a.bagli.ustEtiket}${a.bagli.bekliyor ? ' (bekliyor)' : ''}` : null,
            hata: a.hata, secenekSayisi: Array.isArray(a.secenekler) ? a.secenekler.length : null
          }))
        });
        for (const a of alanlar) sorulanlar.add(String(a.etiket));
        const imza = alanlar.map((a) => `${a.anahtar}:${a.hata ?? ''}`).join('|');
        ayniDurak.set(imza, (ayniDurak.get(imza) ?? 0) + 1);
        if ((ayniDurak.get(imza) ?? 0) > 2) { bulgu(`Veri durağı aynı alanlarla tekrar tekrar açılıyor (${x.soru.not ?? ''}); ilerlenemedi.`); veriOk = false; break; }
        const degerler: Nesne = {};
        let tablolar: DoldurTablosu[] | null = null;
        for (const a of alanlar) {
          const ilkSoru = !ilkSorulanlar.has(String(a.anahtar));
          ilkSorulanlar.add(String(a.anahtar));
          const pd = planDegeri(p, String(a.etiket), ilkSoru, Array.isArray(a.secenekler) ? a.secenekler : null);
          if (pd && /^Adı görünmeyen alan/.test(String(a.etiket)) && ilkSoru) bulgu(`Etiketsiz alan: “${a.etiket}” (seçenekler: ${(a.secenekler ?? []).map((s: Nesne) => s.metin).join(' / ')}) — plan değeri seçeneklerden tanındı`);
          if (a.hata) bulgu(`Alan doldurulamadı: “${a.etiket}” — ${a.hata}`);
          if (!pd) {
            if (a.zorunlu && !a.hazir && !a.deger) bulgu(`Planda olmayan zorunlu alan soruldu: “${a.etiket}” (${a.tur})`);
            continue;
          }
          // Doldurulamayan alana ikinci kez değer gönderilmez (ilerlemek için boş bırakılır).
          if (a.hata && (ayniDurak.get(imza) ?? 0) > 1) { degerler[a.anahtar] = { deger: null }; continue; }
          if (pd.tablo) {
            tablolar ??= ((await api(`/platform/tablolar?projeId=${projeId}&secim=1`)).tablolar as DoldurTablosu[]);
            const tip = ({ select: 'secim', radio: 'radyo', checkbox: 'onayKutusu', date: 'tarih', number: 'sayi', tel: 'telefon' } as Record<string, string>)[String(a.tur)] ?? 'metin';
            const adaylar = doldurAdaylari({ alan: { id: a.anahtar, etiket: a.etiket, tip, hassas: a.gizli, secenekler: null }, tablolar, ortamId });
            const aday = adaylar.find((y) => y.sutun === pd.tablo);
            r.doldur = [...(r.doldur ?? []), { alan: a.etiket, istenen: pd.tablo, adaylar: adaylar.map((y) => `${y.tablo}.${y.sutun} (${y.neden})`) }];
            if (!aday || !aday.satirlar.length) { bulgu(`“Doldur”: “${a.etiket}” için “Kişiler.${pd.tablo}” aday değil (adaylar: ${adaylar.map((y) => y.sutun).join(', ') || 'yok'}); elle yazıldı.`); }
            else {
              const sec = adaySecimi(aday, aday.satirlar[0].satirId);
              degerler[a.anahtar] = { deger: sec.deger, kaynak: 'tablo', tabloSecimi: sec.tabloSecimi };
              continue;
            }
            const satir = (tablolar.find((t) => t.ad === 'Kişiler')?.satirlar[0]?.degerler ?? {}) as Record<string, string | null>;
            degerler[a.anahtar] = { deger: satir[pd.tablo] ?? '', kaynak: 'elle' };
            continue;
          }
          if (pd.deger === undefined) continue;
          const v = secenekDegeri(a, pd.deger);
          if (v === null) { bulgu(`“${a.etiket}” listesinde “${String(pd.deger)}” seçeneği yok (seçenekler: ${JSON.stringify((a.secenekler ?? []).slice(0, 8).map((s: Nesne) => s.metin))})`); continue; }
          if (a.hazir && a.mevcut === v) continue;
          degerler[a.anahtar] = { deger: v === '' ? null : v, kaynak: 'elle' };
        }
        const y = await api('/platform/hizli-test/veri', { id, degerler });
        if (!y.basarili) {
          bulgu(`Veri durağı reddedildi: ${y.mesaj}`);
          veriOk = false;
          // Eksik zorunlu alanlara (planda yoksa) uydurma değer: zincirin geri kalanını görebilmek için.
          const eksikler = ((y as Nesne).eksikler ?? []) as string[];
          if (!eksikler.length) break;
          for (const k of eksikler) {
            const a = alanlar.find((z) => z.anahtar === k);
            degerler[k] = { deger: a?.tur === 'checkbox' ? true : a?.secenekler?.[0]?.deger ?? 'Deneme', kaynak: 'elle' };
          }
          const y2 = await api('/platform/hizli-test/veri', { id, degerler });
          if (!y2.basarili) { bulgu(`Veri durağı yine reddedildi: ${y2.mesaj}`); break; }
        }
        x = await bekle(id);
        continue;
      }
      if (x.durum === 'hataSorusu') {
        const metinler = x.soru.metinler as string[];
        const plan = p.hataCevaplari?.find((h) => metinler.some((m) => h.metin.test(m)));
        r.hataSorulari.push({ metinler, cevap: plan?.cevap ?? 'onemsiz', beklenen: Boolean(plan) });
        if (!plan) {
          bulgu(`Beklenmeyen hata sorusu: ${JSON.stringify(metinler)} (önemsiz denildi; düğmeye yeniden basılacak)`);
          eylemOk = false;
          const son = (x.adimlar as Nesne[]).filter((z) => z.bas).at(-1);
          if (son) hataliBasislar.add(Number(son.no));
        }
        await basarili('/platform/hizli-test/hata-cevabi', { id, cevap: plan?.cevap ?? 'onemsiz' });
        x = await bekle(id);
        continue;
      }
      if (x.durum === 'onay') { await basarili('/platform/hizli-test/onay', { id, cevap: true }); x = await bekle(id); continue; }
      if (x.durum === 'diyalog') {
        r.diyalogSorulari.push({ mesaj: x.soru.mesaj, tur: x.soru.diyalogTuru });
        await basarili('/platform/hizli-test/diyalog', { id, cevap: ayar.diyalogYaniti ?? 'kabul' });
        x = await bekle(id);
        continue;
      }
      if (x.durum === 'karar') {
        const adaylar = (x.soru.adaylar as Nesne[]).map((z) => ({ secici: String(z.secici), metin: String(z.metin ?? '') }));
        const basilanlar = (x.adimlar as Nesne[]).filter((z) => z.bas).map((z) => String(z.bas.metin ?? z.bas.secici));
        r.kararlar.push({ basilanlar, adaylar: adaylar.map((z) => z.metin), seciciler: adaylar.map((z) => z.secici), oneri: adaylar.find((z) => z.secici === x.soru.oneri)?.metin ?? null });
        // Plan sırası: basılmış düğmeler (otomatik basılan dahil; metin ya da seçiciyle) planın başından eşlenir.
        planSira = 0;
        const basisAdimlari = (x.adimlar as Nesne[]).filter((z) => z.bas);
        if (basisAdimlari.length > 25) { bulgu('25\'ten çok basış: döngü kesildi.'); eylemOk = false; break; }
        for (const z of basisAdimlari) {
          if (hataliBasislar.has(Number(z.no))) continue;
          if (planSira < p.basilacak.length && (p.basilacak[planSira].test(String(z.bas.metin ?? '')) || p.basilacak[planSira].test(String(z.bas.secici)))) planSira++;
        }
        if (planSira >= p.basilacak.length) break;
        const hedef = p.basilacak[planSira];
        let aday = adaylar.find((z) => hedef.test(z.metin));
        // Görünen metinle bulunamazsa seçicide (aria-label vb.) aranır: kullanıcı listede yalnız metni görür (bulgu).
        if (!aday) {
          aday = adaylar.find((z) => hedef.test(z.secici));
          if (aday) bulgu(`${String(hedef)} aday listesinde yalnız seçiciyle ayırt edilebiliyor (görünen metin “${aday.metin}”; seçici ${aday.secici})`);
        }
        if (!aday) {
          bulgu(`Aday listesinde ${String(hedef)} yok (adaylar: ${JSON.stringify(adaylar.map((z) => z.metin))})`);
          eylemOk = false;
          r.goruntuler.push(goruntuKaydet(`${p.kok.slice(1)}-aday-yok-${planSira}`, x.goruntu));
          break;
        }
        const deneme = `${planSira}:${basisAdimlari.length}`;
        denemeler.set(deneme, (denemeler.get(deneme) ?? 0) + 1);
        if ((denemeler.get(deneme) ?? 0) > 2) {
          bulgu(`“${aday.metin}” basışı iki kez sonuçsuz kaldı (son hata: ${x.sonHata ?? 'yok'}); zincir kesildi.`);
          eylemOk = false;
          r.goruntuler.push(goruntuKaydet(`${p.kok.slice(1)}-basis-hatasi-${planSira}`, x.goruntu));
          break;
        }
        await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday.secici });
        x = await bekle(id);
        continue;
      }
      if (x.durum === 'bitis' || x.durum === 'kaydet') break;
      bulgu(`Beklenmeyen durum: ${x.durum}`);
      break;
    }
    r.sorulanAlanlar = [...sorulanlar];
    r.adimlar = (x.adimlar as Nesne[]).map((a) => ({
      no: a.no, alanlar: a.alanlar.map((z: Nesne) => `${z.etiket}${z.kosul ? ` [koşul: ${z.kosul.metin}]` : ''}`), bas: a.bas?.metin ?? null, diyalog: a.bas?.diyalog ?? null,
      fark: a.fark ? { sureMs: a.fark.sureMs, yeniMetinler: a.fark.yeniMetinler.map((m: Nesne) => `${m.metin} (${m.tur})`), yeniAlanlar: a.fark.yeniAlanlar, adres: a.fark.adres, bekleme: a.fark.beklemeMetinleri, diyaloglar: a.fark.diyaloglar } : null
    }));
    r.gunluk = (x.gunluk as Nesne[]).map((g) => g.metin);
    const eksikSonradan = p.sonradan.filter((z) => ![...sorulanlar].some((e) => z.etiket.test(e)));
    for (const z of eksikSonradan) bulgu(`Sonradan beliren alan veri durağında sorulmadı: ${String(z.etiket)} (${z.neden})`);
    r.asamalar.veri = veriOk && eksikSonradan.length === 0 && !r.bulgular.some((m: string) => /Planda olmayan zorunlu|doldurulamadı|seçeneği yok/.test(m));
    r.asamalar.eylem = eylemOk && planSira >= p.basilacak.length - 1 && ['karar', 'bitis', 'kaydet'].includes(x.durum);
    r.sureler.zincirMs = Date.now() - t0;
    r.goruntuler.push(goruntuKaydet(`${p.kok.slice(1)}-2-zincir-sonu`, x.goruntu));
    r.sayac.hizli = sayac(p.kok).gonderim - s0;
    // Bitiş.
    if (x.durum === 'karar') {
      const y = await api('/platform/hizli-test/karar', { id, karar: 'bitir' });
      if (!y.basarili) { bulgu(`“Burada bitir” reddedildi: ${y.mesaj}`); r.asamalar.bitis = false; return r; }
      x = await bekle(id);
    }
    if (x.durum === 'bitis') {
      let gorulen = (x.soru.gorulenler as Nesne[]).map((g) => String(g.metin));
      if (!gorulen.some((m) => p.bitti.test(m))) {
        await basarili('/platform/hizli-test/yeniden-tara', { id, etiketler: x.soru.etiketler });
        x = await bekle(id);
        gorulen = (x.soru.gorulenler as Nesne[]).map((g) => String(g.metin));
        if (gorulen.some((m) => p.bitti.test(m))) bulgu('Bitiş metni ancak “Sayfayı yeniden tara” ile görüldü.');
      }
      r.bitis = { gorulenler: x.soru.gorulenler, onerilenEtiketler: x.soru.etiketler, onerilenAdres: x.soru.onerilenAdres, uyarilar: x.soru.uyarilar ?? [] };
      const etiketler: Record<string, string | null> = { ...(x.soru.etiketler as Record<string, string | null>) };
      // Sonuç olmayan metne (sekme / anahtar etiketi, liste seçeneği) varsayılan "Bitti" önerisi bulgu olur.
      for (const [m, e] of Object.entries(etiketler)) if (e === 'bitti' && p.bittiDegil?.test(m)) bulgu(`Sonuç olmayan “${m}” varsayılan olarak Bitti önerildi.`);
      const bittiMetni = gorulen.find((m) => p.bitti.test(m));
      if (!bittiMetni) {
        bulgu(`Bitiş metni görülmedi: ${String(p.bitti)} (görülen: ${JSON.stringify(gorulen)})`);
        r.asamalar.bitis = false;
      } else {
        if (!p.olumsuz && etiketler[bittiMetni] !== 'bitti') bulgu(`Bitiş metni “${bittiMetni}” varsayılan olarak Bitti önerilmedi (öneri: ${etiketler[bittiMetni]})`);
        if (!p.olumsuz) etiketler[bittiMetni] = 'bitti';
      }
      const yb = await api('/platform/hizli-test/bitis', { id, etiketler, ...(p.olumsuz && bittiMetni ? { olumsuz: { mesaj: x.olumsuz?.mesaj ?? bittiMetni } } : {}) });
      if (!yb.basarili) { bulgu(`Bitiş koşulu reddedildi: ${yb.mesaj}`); r.asamalar.bitis = false; return r; }
      r.asamalar.bitis ??= true;
      x = await bekle(id);
    }
    if (x.durum !== 'kaydet') { bulgu(`Kaydet adımına gelinemedi (${x.durum})`); return r; }
    // Doğrulama koşusu.
    const sd = sayac(p.kok).gonderim;
    const td = Date.now();
    await basarili('/platform/hizli-test/dogrula', { id });
    x = await bekle(id, ['kaydet'], 240);
    r.sureler.dogrulamaMs = Date.now() - td;
    r.dogrulama = { ...x.soru.dogrulama, adimlar: x.dogrulamaAdimlari };
    r.asamalar.dogrulama = x.soru.dogrulama?.durum === 'basarili';
    if (!r.asamalar.dogrulama) { bulgu(`Doğrulama koşusu başarısız: ${x.soru.dogrulama?.mesaj}`); r.goruntuler.push(goruntuKaydet(`${p.kok.slice(1)}-3-dogrulama`, x.goruntu)); }
    r.sayac.dogrulama = sayac(p.kok).gonderim - sd;
    if (ayar.kayitYok) return r;
    // Kaydet.
    const oz = await api('/platform/hizli-test/ozet', { id, baslik: p.ekranAdi });
    r.ozet = oz.basarili ? { tablolar: ((oz.ozet as Nesne).onizleme?.tablolar ?? []).map((t: Nesne) => `${t.ad}: ${t.sutunlar.map((s: Nesne) => s.ad).join(', ')}`), baglantilar: ((oz.ozet as Nesne).onizleme?.baglantilar ?? []).map((z: Nesne) => `${z.alanEtiketi}→${z.tablo}.${z.sutun}`) } : oz.mesaj;
    const k = await api('/platform/hizli-test/kaydet', { id, baslik: p.ekranAdi, ...(oz.basarili ? { secim: (oz.ozet as Nesne).secim } : {}), onay: true });
    if (!k.kaydedildi) { bulgu(`Kaydedilemedi: ${k.mesaj ?? JSON.stringify(k).slice(0, 300)}`); r.asamalar.kayit = false; return r; }
    r.asamalar.kayit = true;
    id = '';
    await isBitsin(o);
    const model = ((await api(`/platform/ekran?projeId=${projeId}&id=${String(k.ekranId)}`)) as Nesne).model as Nesne;
    r.modelHam = model;
    r.model = {
      adimlar: (model?.adimlar ?? []).map((a: Nesne) => ({
        ad: a.ad ?? a.baslik ?? null,
        alanlar: (a.bolumler ?? []).flatMap((bb: Nesne) => (bb.alanlar ?? []).map((z: Nesne) => `${z.etiket?.ekran ?? z.anahtar}${z.gorunurluk || z.kosul ? ' [koşullu]' : ''}${z.tip ? ` (${z.tip})` : ''}`)),
        aksiyonlar: a.kosu?.aksiyonlar ?? []
      })),
      bagliListeler: model?.bagliListeler ?? null
    };
    if (rapor) writeFileSync(join(rapor, `${p.kok.slice(1)}-model.json`), JSON.stringify(model, null, 2));
    const sen = (await api(`/platform/senaryo?id=${String(k.senaryoId)}&ortamId=${ortamId}`)) as Nesne;
    r.senaryo = sen.senaryo ?? sen;
    if (rapor) writeFileSync(join(rapor, `${p.kok.slice(1)}-senaryo.json`), JSON.stringify(sen.senaryo ?? sen, null, 2));
    // Normal koşu (koşucu).
    const sn = sayac(p.kok).gonderim;
    const dn = sayac(p.kok).doldurma.length;
    const tn = Date.now();
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: String(k.senaryoId), ortamId });
    r.sureler.normalMs = Date.now() - tn;
    if (!y.basarili) { bulgu(`Normal koşu başlatılamadı: ${y.mesaj}`); r.asamalar.normal = false; }
    else {
      const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
      r.normal = { durum: sonuc.durum, hata: sonuc.hataMesaji ?? null };
      r.asamalar.normal = sonuc.durum === 'basarili';
      if (!r.asamalar.normal) bulgu(`Normal koşu ${sonuc.durum}: ${String(sonuc.hataMesaji ?? '').slice(0, 400)}`);
    }
    r.sayac.normal = sayac(p.kok).gonderim - sn;
    r.doldurma.normal = sayac(p.kok).doldurma.slice(dn).map((z: Nesne) => z.alan);
    const son = sayac(p.kok).gonderimler.at(-1) as Nesne | undefined;
    r.sonGonderim = son ?? null;
    const beklenen = p.gonderimSayisi ?? 1;
    const sapmalar = Object.entries(p.gonderim ?? {}).filter(([kk, v]) => JSON.stringify(son?.[kk]) !== JSON.stringify(v)).map(([kk, v]) => `${kk}: beklenen ${JSON.stringify(v)}, gelen ${JSON.stringify(son?.[kk])}`);
    r.asamalar.sayac = r.sayac.hizli === beklenen && r.sayac.dogrulama === beklenen && r.sayac.normal === beklenen && sapmalar.length === 0;
    if (r.sayac.hizli !== beklenen || r.sayac.dogrulama !== beklenen || r.sayac.normal !== beklenen) bulgu(`Gönderim sayıları (hızlı / doğrulama / normal): ${r.sayac.hizli} / ${r.sayac.dogrulama} / ${r.sayac.normal} (beklenen ${beklenen} / ${beklenen} / ${beklenen})`);
    if (sapmalar.length) bulgu(`Son gönderimdeki değerler: ${sapmalar.join('; ')}`);
  } catch (e) {
    bulgu(`İstisna: ${String(e instanceof Error ? e.message : e).slice(0, 400)}`);
  } finally {
    r.doldurma.hizli = sayac(p.kok).doldurma.slice(d0).map((z: Nesne) => z.alan);
    r.sureler.toplamMs = Date.now() - t0;
    if (id) {
      try { const s = await oturumOku(o, id); r.sonDurum = s?.durum; r.goruntuler.push(goruntuKaydet(`${p.kok.slice(1)}-son`, s?.goruntu)); r.gunluk ??= (s?.gunluk ?? []).map((g: Nesne) => g.metin); } catch { /* yok */ }
      await api('/platform/hizli-test/iptal', { id }).catch(() => undefined);
      await isBitsin(o);
    }
    r.goruntuler = r.goruntuler.filter(Boolean);
  }
  return r;
}
