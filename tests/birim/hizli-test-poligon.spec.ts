// HIZLI TEST POLİGONU — yalnız POLIGON=1 ile koşar (normal `npm test`'i yavaşlatmaz). tests/poligon/ altındaki sahte uygulama (127.0.0.1)
// üzerinde Nöbetçi'nin hızlı testini her ekranda baştan sona sürer: izin "Evet", veri durağı (elle / "Doldur" ile tablodan), zincir,
// bitiş etiketi, doğrulama koşusu, kaydet, ardından kaydedilen senaryonun normal koşusu. Sapmalar BULGU olarak POLIGON_RAPOR_KLASORU'na
// (sonuclar.json + ekran görüntüleri) yazılır; test bu aşamada bulgu yüzünden KIRMIZI olmaz (poligonun kendisi ve kurulum hariç).
// Ayrı Nöbetçi örneği, GEÇİCİ veri kökü (NOBETCI_VERI_KOKU) ve geçici veritabanı; kurulum sihirbazı arayüzden uydurma değerlerle
// geçilir. Kullanıcının veri/ klasörüne ve çalışan Nöbetçi'sine dokunulmaz; tarayıcılar yalnız 127.0.0.1'e çözümler.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { adaySecimi, doldurAdaylari, type DoldurTablosu } from '../../scripts/platform/tablolar/doldur-onerisi.mjs';
import { poligonBaslat } from '../poligon/sunucu.mjs';
import { INSAN_YOLLARI } from '../poligon/insan-yollari';
import { PLANLAR, type EkranPlani } from '../poligon/planlar';
import { korumaliTarayici } from './giris-fikstur';
import { izinleriAcApi, nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- oturum / model JSON'u serbestçe gezilir
type Nesne = Record<string, any>;

const ETKIN = process.env.POLIGON === '1';
test.skip(!ETKIN, 'Poligon koşusu yalnız POLIGON=1 ile (uzun sürer).');
test.describe.configure({ mode: 'serial' });

const RAPOR = process.env.POLIGON_RAPOR_KLASORU ?? join(tmpdir(), 'hizli-test-poligon');
/** Yalnız bu ekranlar (virgülle kökler; ör. POLIGON_EKRAN=/sepet,/otel). */
const SECILI = (process.env.POLIGON_EKRAN ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const PAROLA = `Gecici-Poligon-${randomBytes(6).toString('hex')}`;

let poligon: Awaited<ReturnType<typeof poligonBaslat>>;
let nobetci: Nobetci;
let veriKoku = '';
let projeId = '';
let ortamId = '';
const sonuclar: Nesne[] = [];

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
  return y;
}
const oturum = async (id: string): Promise<Nesne> => (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
const SORU_DURUMLARI = ['veri', 'karar', 'hataSorusu', 'onay', 'bitis', 'kaydet', 'hayirSecim', 'kaydedildi', 'hata', 'iptal'];
async function bekle(id: string, durumlar = SORU_DURUMLARI, sn = 150): Promise<Nesne> {
  const son = Date.now() + sn * 1000;
  for (;;) {
    const o = await oturum(id);
    if (durumlar.includes(o.durum) || ['hata', 'iptal'].includes(o.durum)) return o;
    if (Date.now() > son) throw new Error(`zaman aşımı: beklenen ${durumlar.join('/')}, olan ${o.durum} (${o.calisiyor ?? ''})`);
    await new Promise((c) => setTimeout(c, 300));
  }
}
async function isBitsin(): Promise<void> {
  for (const son = Date.now() + 60_000; Date.now() < son; await new Promise((c) => setTimeout(c, 300))) {
    if (!(await api('/platform/tarama/aktif')).is) return;
  }
}
function goruntuKaydet(ad: string, b64: string | null | undefined): string | null {
  if (!b64) return null;
  const dosya = `${ad.replace(/[^a-z0-9-]+/gi, '-')}.jpg`;
  writeFileSync(join(RAPOR, dosya), Buffer.from(b64, 'base64'));
  return dosya;
}
const sayac = (kok: string): Nesne => poligon.sayaclar()[kok] as Nesne;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  mkdirSync(RAPOR, { recursive: true });
  poligon = await poligonBaslat();
  veriKoku = mkdtempSync(join(process.env.POLIGON_GECICI_KOK ?? tmpdir(), 'poligon-veri-'));
  nobetci = await nobetciBaslat(veriKoku, join(veriKoku, 'platform.db'), {
    NOBETCI_VERI_KOKU: veriKoku, NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: poligon.adres,
    NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '300', NOBETCI_REHBER_OTOMATIK: '0'
  });
  // Kurulum sihirbazı (arayüz; uydurma değerler).
  const tarayici = await korumaliTarayici();
  try {
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' })).newPage();
    await page.goto('/');
    await page.locator('.secim-karti').filter({ hasText: 'Yeni proje başlat' }).click();
    await page.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(PAROLA);
    await page.getByRole('textbox', { name: 'Kasa parolası (tekrar) (zorunlu)', exact: true }).fill(PAROLA);
    await page.getByText('Parolayı unutursam').click();
    await page.getByRole('button', { name: 'Kasayı oluştur ve devam et' }).click();
    await page.getByLabel('Proje adı').fill('Poligon');
    await page.getByRole('button', { name: 'Devam' }).click();
    await expect(page.getByRole('button', { name: 'Atla' })).toBeVisible();
    const { projeler } = (await api('/platform/projeler')) as unknown as { projeler: Array<{ id: string }> };
    projeId = projeler[0].id;
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Poligon', tabanUrl: poligon.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
    await page.getByRole('button', { name: 'Atla' }).click();
    await page.getByRole('radio', { name: /^Gelişmiş — tüm özellikler/ }).check();
    await page.getByRole('button', { name: 'Devam' }).click();
    await page.getByRole('button', { name: 'Devam' }).click();
    await expect(page.getByRole('heading', { name: 'Proje hazır' })).toBeVisible();
    await page.screenshot({ path: join(RAPOR, '00-kurulum-proje-hazir.png') });
  } finally { await tarayici.close(); }
  await izinleriAcApi(nobetci);
  // "Doldur" için test verisi (uydurma).
  await basarili('/platform/tablo/kaydet', {
    projeId, ad: 'Kişiler', tur: 'kayit',
    sutunlar: ['Ad', 'Soyad', 'Ad soyad', 'E-posta', 'Cep telefonu', 'Doğum tarihi', 'Açık adres'].map((ad) => ({ ad })).concat([{ ad: 'Kimlik no', gizli: true } as never, { ad: 'IBAN', gizli: true } as never]),
    satirlar: [{ ad: 'Birinci', degerler: {
      Ad: 'Deneme', Soyad: 'Kişi', 'Ad soyad': 'Deneme Kişi', 'E-posta': 'deneme@ornek.test', 'Cep telefonu': '05001112233', 'Doğum tarihi': '01.02.1990',
      'Açık adres': 'Deneme sokak 1', 'Kimlik no': '10000000146', IBAN: 'TR120006200000000123456789'
    } }]
  });
});

test.afterAll(async () => {
  if (sonuclar.length) writeFileSync(join(RAPOR, 'sonuclar.json'), JSON.stringify(sonuclar, null, 2));
  nobetci?.surec.kill('SIGTERM');
  await poligon?.kapat();
  await new Promise((c) => setTimeout(c, 1500));
  if (veriKoku) rmSync(veriKoku, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
});

test('poligon: her ekran insan yoluyla baştan sona tamamlanır (sayaç: tam bir gönderim)', async () => {
  test.setTimeout(240_000);
  const tarayici = await korumaliTarayici();
  try {
    for (const [kok, yol] of Object.entries(INSAN_YOLLARI)) {
      const once = sayac(kok).gonderim;
      const page = await (await tarayici.newContext({ baseURL: poligon.adres })).newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`${kok}/`);
      await test.step(kok, async () => { await yol(page); });
      expect(hatalar, kok).toEqual([]);
      expect(sayac(kok).gonderim - once, `${kok} gönderim sayısı`).toBe(1);
      await page.context().close();
    }
  } finally { await tarayici.close(); }
});

/** Veri durağı alanı için plandaki değer (etikete göre). */
function planDegeri(p: EkranPlani, etiket: string, ilkSoru: boolean, secenekler: Nesne[] | null = null): { deger?: string | boolean; tablo?: string } | null {
  // Adı görünmeyen seçim grubu: plan etiketi seçeneklerin metniyle eşlenir (kullanıcı seçeneklere bakarak tanır).
  const d = p.degerler.find((x) => x.etiket.test(etiket))
    ?? (/^Adı görünmeyen alan/.test(etiket) && secenekler ? p.degerler.find((x) => secenekler.some((s) => x.etiket.test(String(s.metin ?? '')))) : undefined);
  if (!d) return null;
  if (ilkSoru && d.ilk !== undefined) return { deger: d.ilk };
  return d.tablo ? { tablo: d.tablo } : { deger: d.deger };
}

/** Seçim alanında plan değerini (değer ya da metin) seçeneğin değerine çevirir. */
function secenekDegeri(a: Nesne, d: string | boolean): string | boolean | null {
  if (typeof d === 'boolean' || !Array.isArray(a.secenekler) || !a.secenekler.length) return d;
  const k = (v: unknown): string => String(v).toLocaleLowerCase('tr');
  const s = (a.secenekler as Nesne[]).find((x) => k(x.deger) === k(d) || k(x.metin) === k(d));
  return s ? String(s.deger) : null;
}

async function ekranKos(p: EkranPlani): Promise<Nesne> {
  const r: Nesne = {
    kok: p.kok, ekranAdi: p.ekranAdi, asamalar: {}, bulgular: [] as string[], veriDuraklari: [] as Nesne[], kararlar: [] as Nesne[], hataSorulari: [] as Nesne[],
    sureler: {}, goruntuler: [] as string[], doldurma: {}, sayac: {}
  };
  const bulgu = (m: string): void => { r.bulgular.push(m); };
  const t0 = Date.now();
  const s0 = sayac(p.kok).gonderim;
  const d0 = sayac(p.kok).doldurma.length;
  let id = '';
  try {
    const b = await api('/platform/hizli-test/baslat', { projeId, ortamId, hedef: `${p.kok}/`, ekranAdi: p.ekranAdi, izin: 'evet' });
    if (!b.basarili) { bulgu(`Başlatılamadı: ${b.mesaj}`); r.asamalar.kesif = false; return r; }
    id = String(b.id);
    let o = await bekle(id);
    r.sureler.kesifMs = Date.now() - t0;
    r.kesif = o.kesif;
    r.zincir = o.zincir;
    r.bulgularNobetci = o.bulgular;
    r.goruntuler.push(goruntuKaydet(`${p.kok.slice(1)}-1-kesif`, o.goruntu));
    // Keşif: ilk veri durağında beklenen alanlar.
    const ilkAlanlar: string[] = o.durum === 'veri' ? (o.soru.alanlar as Nesne[]).map((a) => String(a.etiket)) : [];
    const eksikKesif = p.kesif.filter((k) => !ilkAlanlar.some((e) => k.test(e)));
    r.asamalar.kesif = o.durum !== 'hata' && eksikKesif.length === 0;
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
      if (o.durum === 'hata' || o.durum === 'iptal') { bulgu(`Oturum ${o.durum}: ${JSON.stringify(o.hata)}`); eylemOk = false; break; }
      if (o.durum === 'veri') {
        durakNo++;
        const alanlar = o.soru.alanlar as Nesne[];
        r.veriDuraklari.push({
          no: durakNo, not: o.soru.not, alanlar: alanlar.map((a) => ({
            etiket: a.etiket, tur: a.tur, zorunlu: a.zorunlu, hazir: a.hazir, mevcut: a.mevcut, kosul: a.kosul?.metin ?? null, bagli: a.bagli ? `${a.bagli.ustEtiket}${a.bagli.bekliyor ? ' (bekliyor)' : ''}` : null,
            hata: a.hata, secenekSayisi: Array.isArray(a.secenekler) ? a.secenekler.length : null
          }))
        });
        for (const a of alanlar) sorulanlar.add(String(a.etiket));
        const imza = alanlar.map((a) => `${a.anahtar}:${a.hata ?? ''}`).join('|');
        ayniDurak.set(imza, (ayniDurak.get(imza) ?? 0) + 1);
        if ((ayniDurak.get(imza) ?? 0) > 2) { bulgu(`Veri durağı aynı alanlarla tekrar tekrar açılıyor (${o.soru.not ?? ''}); ilerlenemedi.`); veriOk = false; break; }
        const degerler: Nesne = {};
        let tablolar: DoldurTablosu[] | null = null;
        for (const a of alanlar) {
          const ilkSoru = !ilkSorulanlar.has(String(a.anahtar));
          ilkSorulanlar.add(String(a.anahtar));
          const pd = planDegeri(p, String(a.etiket), ilkSoru, Array.isArray(a.secenekler) ? a.secenekler : null);
          if (pd && /^Adı görünmeyen alan/.test(String(a.etiket)) && ilkSoru) bulgu(`Etiketsiz alan: “${a.etiket}” (seçenekler: ${(a.secenekler ?? []).map((x: Nesne) => x.metin).join(' / ')}) — plan değeri seçeneklerden tanındı`);
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
            const aday = adaylar.find((x) => x.sutun === pd.tablo);
            r.doldur = [...(r.doldur ?? []), { alan: a.etiket, istenen: pd.tablo, adaylar: adaylar.map((x) => `${x.tablo}.${x.sutun} (${x.neden})`) }];
            if (!aday || !aday.satirlar.length) { bulgu(`“Doldur”: “${a.etiket}” için “Kişiler.${pd.tablo}” aday değil (adaylar: ${adaylar.map((x) => x.sutun).join(', ') || 'yok'}); elle yazıldı.`); }
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
          if (v === null) { bulgu(`“${a.etiket}” listesinde “${String(pd.deger)}” seçeneği yok (seçenekler: ${JSON.stringify((a.secenekler ?? []).slice(0, 8).map((x: Nesne) => x.metin))})`); continue; }
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
            const a = alanlar.find((x) => x.anahtar === k);
            degerler[k] = { deger: a?.tur === 'checkbox' ? true : a?.secenekler?.[0]?.deger ?? 'Deneme', kaynak: 'elle' };
          }
          const y2 = await api('/platform/hizli-test/veri', { id, degerler });
          if (!y2.basarili) { bulgu(`Veri durağı yine reddedildi: ${y2.mesaj}`); break; }
        }
        o = await bekle(id);
        continue;
      }
      if (o.durum === 'hataSorusu') {
        const metinler = o.soru.metinler as string[];
        const plan = p.hataCevaplari?.find((h) => metinler.some((m) => h.metin.test(m)));
        r.hataSorulari.push({ metinler, cevap: plan?.cevap ?? 'onemsiz', beklenen: Boolean(plan) });
        if (!plan) {
          bulgu(`Beklenmeyen hata sorusu: ${JSON.stringify(metinler)} (önemsiz denildi; düğmeye yeniden basılacak)`);
          eylemOk = false;
          const son = (o.adimlar as Nesne[]).filter((x) => x.bas).at(-1);
          if (son) hataliBasislar.add(Number(son.no));
        }
        await basarili('/platform/hizli-test/hata-cevabi', { id, cevap: plan?.cevap ?? 'onemsiz' });
        o = await bekle(id);
        continue;
      }
      if (o.durum === 'onay') { await basarili('/platform/hizli-test/onay', { id, cevap: true }); o = await bekle(id); continue; }
      if (o.durum === 'karar') {
        const adaylar = (o.soru.adaylar as Nesne[]).map((x) => ({ secici: String(x.secici), metin: String(x.metin ?? '') }));
        const basilanlar = (o.adimlar as Nesne[]).filter((x) => x.bas).map((x) => String(x.bas.metin ?? x.bas.secici));
        r.kararlar.push({ basilanlar, adaylar: adaylar.map((x) => x.metin), seciciler: adaylar.map((x) => x.secici), oneri: adaylar.find((x) => x.secici === o.soru.oneri)?.metin ?? null });
        // Plan sırası: basılmış düğmeler (otomatik basılan dahil; metin ya da seçiciyle) planın başından eşlenir.
        planSira = 0;
        const basisAdimlari = (o.adimlar as Nesne[]).filter((x) => x.bas);
        if (basisAdimlari.length > 25) { bulgu('25\'ten çok basış: döngü kesildi.'); eylemOk = false; break; }
        for (const x of basisAdimlari) {
          if (hataliBasislar.has(Number(x.no))) continue;
          if (planSira < p.basilacak.length && (p.basilacak[planSira].test(String(x.bas.metin ?? '')) || p.basilacak[planSira].test(String(x.bas.secici)))) planSira++;
        }
        if (planSira >= p.basilacak.length) break;
        const hedef = p.basilacak[planSira];
        let aday = adaylar.find((x) => hedef.test(x.metin));
        // Görünen metinle bulunamazsa seçicide (aria-label vb.) aranır: kullanıcı listede yalnız metni görür (bulgu).
        if (!aday) {
          aday = adaylar.find((x) => hedef.test(x.secici));
          if (aday) bulgu(`${String(hedef)} aday listesinde yalnız seçiciyle ayırt edilebiliyor (görünen metin “${aday.metin}”; seçici ${aday.secici})`);
        }
        if (!aday) {
          bulgu(`Aday listesinde ${String(hedef)} yok (adaylar: ${JSON.stringify(adaylar.map((x) => x.metin))})`);
          eylemOk = false;
          r.goruntuler.push(goruntuKaydet(`${p.kok.slice(1)}-aday-yok-${planSira}`, o.goruntu));
          break;
        }
        const deneme = `${planSira}:${basisAdimlari.length}`;
        denemeler.set(deneme, (denemeler.get(deneme) ?? 0) + 1);
        if ((denemeler.get(deneme) ?? 0) > 2) {
          bulgu(`“${aday.metin}” basışı iki kez sonuçsuz kaldı (son hata: ${o.sonHata ?? 'yok'}); zincir kesildi.`);
          eylemOk = false;
          r.goruntuler.push(goruntuKaydet(`${p.kok.slice(1)}-basis-hatasi-${planSira}`, o.goruntu));
          break;
        }
        await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday.secici });
        o = await bekle(id);
        continue;
      }
      if (o.durum === 'bitis' || o.durum === 'kaydet') break;
      bulgu(`Beklenmeyen durum: ${o.durum}`);
      break;
    }
    r.sorulanAlanlar = [...sorulanlar];
    r.adimlar = (o.adimlar as Nesne[]).map((a) => ({
      no: a.no, alanlar: a.alanlar.map((x: Nesne) => `${x.etiket}${x.kosul ? ` [koşul: ${x.kosul.metin}]` : ''}`), bas: a.bas?.metin ?? null,
      fark: a.fark ? { sureMs: a.fark.sureMs, yeniMetinler: a.fark.yeniMetinler.map((m: Nesne) => `${m.metin} (${m.tur})`), yeniAlanlar: a.fark.yeniAlanlar, adres: a.fark.adres, bekleme: a.fark.beklemeMetinleri } : null
    }));
    r.gunluk = (o.gunluk as Nesne[]).map((g) => g.metin);
    const eksikSonradan = p.sonradan.filter((x) => ![...sorulanlar].some((e) => x.etiket.test(e)));
    for (const x of eksikSonradan) bulgu(`Sonradan beliren alan veri durağında sorulmadı: ${String(x.etiket)} (${x.neden})`);
    r.asamalar.veri = veriOk && eksikSonradan.length === 0 && !r.bulgular.some((m: string) => /Planda olmayan zorunlu|doldurulamadı|seçeneği yok/.test(m));
    r.asamalar.eylem = eylemOk && planSira >= p.basilacak.length - 1 && ['karar', 'bitis', 'kaydet'].includes(o.durum);
    r.sureler.zincirMs = Date.now() - t0;
    r.goruntuler.push(goruntuKaydet(`${p.kok.slice(1)}-2-zincir-sonu`, o.goruntu));
    r.sayac.hizli = sayac(p.kok).gonderim - s0;
    // Bitiş.
    if (o.durum === 'karar') {
      const y = await api('/platform/hizli-test/karar', { id, karar: 'bitir' });
      if (!y.basarili) { bulgu(`“Burada bitir” reddedildi: ${y.mesaj}`); r.asamalar.bitis = false; return r; }
      o = await bekle(id);
    }
    if (o.durum === 'bitis') {
      let gorulen = (o.soru.gorulenler as Nesne[]).map((g) => String(g.metin));
      if (!gorulen.some((m) => p.bitti.test(m))) {
        await basarili('/platform/hizli-test/yeniden-tara', { id, etiketler: o.soru.etiketler });
        o = await bekle(id);
        gorulen = (o.soru.gorulenler as Nesne[]).map((g) => String(g.metin));
        if (gorulen.some((m) => p.bitti.test(m))) bulgu('Bitiş metni ancak “Sayfayı yeniden tara” ile görüldü.');
      }
      r.bitis = { gorulenler: o.soru.gorulenler, onerilenEtiketler: o.soru.etiketler, onerilenAdres: o.soru.onerilenAdres };
      const etiketler: Record<string, string | null> = { ...(o.soru.etiketler as Record<string, string | null>) };
      const bittiMetni = gorulen.find((m) => p.bitti.test(m));
      if (!bittiMetni) {
        bulgu(`Bitiş metni görülmedi: ${String(p.bitti)} (görülen: ${JSON.stringify(gorulen)})`);
        r.asamalar.bitis = false;
      } else {
        if (!p.olumsuz && etiketler[bittiMetni] !== 'bitti') bulgu(`Bitiş metni “${bittiMetni}” varsayılan olarak Bitti önerilmedi (öneri: ${etiketler[bittiMetni]})`);
        if (!p.olumsuz) etiketler[bittiMetni] = 'bitti';
      }
      const yb = await api('/platform/hizli-test/bitis', { id, etiketler, ...(p.olumsuz && bittiMetni ? { olumsuz: { mesaj: o.olumsuz?.mesaj ?? bittiMetni } } : {}) });
      if (!yb.basarili) { bulgu(`Bitiş koşulu reddedildi: ${yb.mesaj}`); r.asamalar.bitis = false; return r; }
      r.asamalar.bitis ??= true;
      o = await bekle(id);
    }
    if (o.durum !== 'kaydet') { bulgu(`Kaydet adımına gelinemedi (${o.durum})`); return r; }
    // Doğrulama koşusu.
    const sd = sayac(p.kok).gonderim;
    const td = Date.now();
    await basarili('/platform/hizli-test/dogrula', { id });
    o = await bekle(id, ['kaydet'], 240);
    r.sureler.dogrulamaMs = Date.now() - td;
    r.dogrulama = { ...o.soru.dogrulama, adimlar: o.dogrulamaAdimlari };
    r.asamalar.dogrulama = o.soru.dogrulama?.durum === 'basarili';
    if (!r.asamalar.dogrulama) { bulgu(`Doğrulama koşusu başarısız: ${o.soru.dogrulama?.mesaj}`); r.goruntuler.push(goruntuKaydet(`${p.kok.slice(1)}-3-dogrulama`, o.goruntu)); }
    r.sayac.dogrulama = sayac(p.kok).gonderim - sd;
    // Kaydet.
    const oz = await api('/platform/hizli-test/ozet', { id, baslik: p.ekranAdi });
    r.ozet = oz.basarili ? { tablolar: ((oz.ozet as Nesne).onizleme?.tablolar ?? []).map((t: Nesne) => `${t.ad}: ${t.sutunlar.map((s: Nesne) => s.ad).join(', ')}`), baglantilar: ((oz.ozet as Nesne).onizleme?.baglantilar ?? []).map((x: Nesne) => `${x.alanEtiketi}→${x.tablo}.${x.sutun}`) } : oz.mesaj;
    const k = await api('/platform/hizli-test/kaydet', { id, baslik: p.ekranAdi, ...(oz.basarili ? { secim: (oz.ozet as Nesne).secim } : {}), onay: true });
    if (!k.kaydedildi) { bulgu(`Kaydedilemedi: ${k.mesaj ?? JSON.stringify(k).slice(0, 300)}`); r.asamalar.kayit = false; return r; }
    r.asamalar.kayit = true;
    id = '';
    await isBitsin();
    const model = ((await api(`/platform/ekran?projeId=${projeId}&id=${String(k.ekranId)}`)) as Nesne).model as Nesne;
    r.model = {
      adimlar: (model?.adimlar ?? []).map((a: Nesne) => ({
        ad: a.ad ?? a.baslik ?? null,
        alanlar: (a.bolumler ?? []).flatMap((b: Nesne) => (b.alanlar ?? []).map((x: Nesne) => `${x.etiket?.ekran ?? x.anahtar}${x.gorunurluk || x.kosul ? ' [koşullu]' : ''}${x.tip ? ` (${x.tip})` : ''}`)),
        eylemler: (a.eylemler ?? a.dugmeler ?? []).map((x: Nesne) => x.metin ?? x.ad ?? x.secici ?? '?')
      })),
      bagliListeler: model?.bagliListeler ?? null, kosu: model?.kosu ?? null
    };
    writeFileSync(join(RAPOR, `${p.kok.slice(1)}-model.json`), JSON.stringify(model, null, 2));
    const sen = (await api(`/platform/senaryo?id=${String(k.senaryoId)}&ortamId=${ortamId}`)) as Nesne;
    writeFileSync(join(RAPOR, `${p.kok.slice(1)}-senaryo.json`), JSON.stringify(sen.senaryo ?? sen, null, 2));
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
    r.doldurma.normal = sayac(p.kok).doldurma.slice(dn).map((x: Nesne) => x.alan);
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
    r.doldurma.hizli = sayac(p.kok).doldurma.slice(d0).map((x: Nesne) => x.alan);
    r.sureler.toplamMs = Date.now() - t0;
    if (id) {
      try { const o = await oturum(id); r.sonDurum = o?.durum; r.goruntuler.push(goruntuKaydet(`${p.kok.slice(1)}-son`, o?.goruntu)); r.gunluk ??= (o?.gunluk ?? []).map((g: Nesne) => g.metin); } catch { /* yok */ }
      await api('/platform/hizli-test/iptal', { id }).catch(() => undefined);
      await isBitsin();
    }
    r.goruntuler = r.goruntuler.filter(Boolean);
  }
  return r;
}

for (const p of PLANLAR) {
  test(`hızlı test: ${p.kok}`, async () => {
    test.skip(SECILI.length > 0 && !SECILI.includes(p.kok), 'seçili değil');
    test.setTimeout(600_000);
    const r = await ekranKos(p);
    sonuclar.push(r);
    writeFileSync(join(RAPOR, 'sonuclar.json'), JSON.stringify(sonuclar, null, 2));
    console.log(`[${p.kok}] ${JSON.stringify(r.asamalar)} — ${r.bulgular.length} bulgu`);
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// HIZLI TEST ARAYÜZÜ — Nöbetçi'nin hızlı test ekranı kullanıcı gibi sürülür; her kontrol ✓ / ✗ + not olarak arayuz.json'a yazılır.
// ---------------------------------------------------------------------------------------------------------------------------------
const arayuzSonuclari: Nesne[] = [];
async function kontrol(bolum: string, ad: string, is: () => Promise<string | void>): Promise<boolean> {
  try {
    const not = await is();
    arayuzSonuclari.push({ bolum, ad, sonuc: true, not: not ?? '' });
    return true;
  } catch (e) {
    arayuzSonuclari.push({ bolum, ad, sonuc: false, not: String(e instanceof Error ? e.message : e).split('\n').slice(0, 4).join(' ').slice(0, 500) });
    return false;
  } finally {
    writeFileSync(join(RAPOR, 'arayuz.json'), JSON.stringify(arayuzSonuclari, null, 2));
  }
}
const UZUN = { timeout: 150_000 };
const soruKarti = (page: Page) => page.locator('.hizli-soru');
async function baslatArayuz(page: Page, ad: string, adres: string, izin: 'Evet' | 'Bana sor' | 'Hayır', ekranId?: string): Promise<void> {
  // Önceki (yarıda kalan) oturum yeni başlatmayı engeller: kapatılır.
  const s = (await api(`/platform/hizli-test/secenekler?projeId=${projeId}`)) as Nesne;
  if (s.surenOturum?.id) { await api('/platform/hizli-test/iptal', { id: s.surenOturum.id }); await isBitsin(); }
  await page.goto(ekranId ? `/#/hizli-test/duzenle/${ekranId}` : '/#/hizli-test');
  if (!ekranId) await page.getByLabel('Testin adı').fill(ad);
  await page.getByLabel('Sayfa adresi').fill(adres);
  await page.locator('.hizli-izin-secenegi').filter({ hasText: new RegExp(`^${izin}`) }).click();
  await page.getByRole('button', { name: 'Başlat' }).click();
  await expect(page).toHaveURL(/#\/hizli-test\/o\/[a-f0-9]{24}$/, { timeout: 30_000 });
}
const oturumKimligi = (page: Page): string => /#\/hizli-test\/o\/([a-f0-9]{24})/.exec(page.url())?.[1] ?? '';
async function veriSatirlari(page: Page): Promise<string[]> {
  return page.locator('.hizli-alanlar .hizli-alan .hizli-alan-baslik label').evaluateAll((l) => l.map((x) => (x.childNodes[0]?.textContent ?? '').trim()));
}
const satirBul = (page: Page, etiket: string) => page.locator('.hizli-alanlar .hizli-alan').filter({ has: page.locator('.hizli-alan-baslik label', { hasText: new RegExp(`^${etiket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }) }).first();

test('hızlı test arayüzü: kullanıcı gibi (iş başvurusu, Evet) — sıra, Doldur, karar, bitiş, kaydet, özet sekmesi, düzenleme', async () => {
  test.skip(SECILI.length > 0 && !SECILI.includes('arayuz'), 'seçili değil');
  test.setTimeout(900_000);
  const tarayici = await korumaliTarayici();
  const B = 'Evet / iş başvurusu';
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    baglam.setDefaultTimeout(30_000);
    const sayfaHatalari: string[] = [];
    page.on('pageerror', (e) => sayfaHatalari.push(String(e)));
    const d0 = sayac('/basvuru').doldurma.length;
    await kontrol(B, 'Başlat: ad boşken uyarı', async () => {
      await page.goto('/#/hizli-test');
      await expect(page.locator('.hizli-duraklar li')).toHaveCount(6);
      await page.getByRole('button', { name: 'Başlat' }).click();
      await expect(page.getByText('Testin adını yazın.')).toBeVisible();
    });
    await kontrol(B, 'Başlat: Evet izniyle oturum açılır, keşif kartı', async () => {
      await baslatArayuz(page, 'Poligon arayüz başvuru', '/basvuru/', 'Evet');
    });
    await kontrol(B, 'Veri durağı: alanlar sayfa sırasıyla (Ad, Soyad, E-posta); ilk ↑ ve son ↓ pasif', async () => {
      await expect(soruKarti(page).getByRole('heading', { name: /veri gerekli/ })).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-01-veri-duragi.png'), fullPage: true });
      const s = await veriSatirlari(page);
      expect(s.slice(0, 3)).toEqual(['Ad', 'Soyad', 'E-posta']);
      await expect(satirBul(page, 'Ad').getByRole('button', { name: 'Yukarı taşı' })).toBeDisabled();
      await expect(page.locator('.hizli-alanlar .hizli-alan').last().getByRole('button', { name: 'Aşağı taşı' })).toBeDisabled();
      return `sorulan: ${s.join(', ')}`;
    });
    await kontrol(B, '↓ ile sıra değişir (Ad en sona)', async () => {
      await satirBul(page, 'Ad').getByRole('button', { name: 'Aşağı taşı' }).click();
      await satirBul(page, 'Ad').getByRole('button', { name: 'Aşağı taşı' }).click();
      const s = await veriSatirlari(page);
      expect(s.slice(0, 3)).toEqual(['Soyad', 'E-posta', 'Ad']);
      return s.join(', ');
    });
    await kontrol(B, '“Doldur”: E-posta için tablo adayları (Kişiler › E-posta seçilir), rozet “tablodan”, “Elle yaz” geri döner', async () => {
      const satir = satirBul(page, 'E-posta');
      await satir.getByRole('button', { name: 'Doldur', exact: true }).click();
      const deger = satir.locator('.hizli-tablo-degeri');
      const panel = satir.locator('.doldur-paneli');
      // Tablolar istekle gelir: ya değer doğrudan seçilir (tek anlamlı) ya da aday paneli açılır.
      const sec = async (): Promise<string> => {
        await expect(deger.or(panel.getByRole('button').first())).toBeVisible();
        if (await deger.isVisible()) return '(tek anlamlı: doğrudan seçildi)';
        const m = (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 250);
        await panel.getByRole('button').first().click();
        return m;
      };
      const paneldekiler = await sec();
      await expect(deger).toHaveText(/\$\{.+\.E-posta\}/);
      await expect(satir.getByText('tablodan')).toBeVisible();
      await satir.getByRole('button', { name: 'Elle yaz' }).click();
      await expect(satir.locator('input')).toBeVisible();
      await satir.getByRole('button', { name: 'Doldur', exact: true }).click();
      await sec();
      return `seçilen: ${await deger.innerText()}; panel: ${paneldekiler}`;
    });
    await kontrol(B, '“Doldur”: benzer ad — “Soyad” için aday listesi', async () => {
      const satir = satirBul(page, 'Soyad');
      await satir.getByRole('button', { name: 'Doldur', exact: true }).click();
      const panel = satir.locator('.doldur-paneli');
      const metin = (await panel.isVisible().catch(() => false)) ? await panel.innerText() : `doğrudan seçildi: ${await satir.locator('.hizli-tablo-degeri').innerText().catch(() => '?')}`;
      if (await panel.isVisible().catch(() => false)) await panel.getByRole('button').first().click();
      return metin.replace(/\s+/g, ' ').slice(0, 200);
    });
    await kontrol(B, 'Elle yazma + “Devam et”: sayfada yeni sıra ile doldurulur (Soyad → E-posta → Ad)', async () => {
      await satirBul(page, 'Ad').locator('input').fill('Deneme');
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: /Adım 2: veri gerekli|Şimdi ne yapayım/ })).toBeVisible(UZUN);
      await expect.poll(() => new Set(sayac('/basvuru').doldurma.slice(d0).map((x: Nesne) => x.alan)).size, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
      const sira = sayac('/basvuru').doldurma.slice(d0).map((x: Nesne) => x.alan);
      const ilk3 = [...new Set(sira)].slice(0, 3);
      expect(ilk3).toEqual(['Soyad', 'E-posta', 'Ad']);
      return `sayfadaki doldurma sırası: ${sira.join(' → ')}`;
    });
    await kontrol(B, 'Adım 2 veri durağı: “yeni alan” rozetleri, Pozisyon listesinde yer tutucu yok', async () => {
      await expect(soruKarti(page).getByRole('heading', { name: /Adım 2: veri gerekli/ })).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-02-adim2.png'), fullPage: true });
      const s = await veriSatirlari(page);
      const poz = satirBul(page, 'Pozisyon').locator('select');
      const secenekler = await poz.locator('option').allInnerTexts();
      expect(secenekler.some((x) => /Pozisyon seçin/.test(x))).toBe(false);
      return `alanlar: ${s.join(', ')}; Pozisyon seçenekleri: ${secenekler.join(' | ')}`;
    });
    await kontrol(B, 'Pozisyon = Yazılım geliştirici seçilince “Kod deposu adresi” koşullu satır olarak görünür', async () => {
      await satirBul(page, 'Pozisyon').locator('select').selectOption({ label: 'Yazılım geliştirici' });
      await expect(satirBul(page, 'Kod deposu adresi')).toBeVisible({ timeout: 3000 });
      const kosul = await satirBul(page, 'Kod deposu adresi').locator('.hizli-kosul').innerText().catch(() => '(koşul yazısı yok)');
      return kosul;
    });
    await kontrol(B, 'Özgeçmiş (dosya) alanı veri durağında nasıl görünüyor', async () => {
      const satir = satirBul(page, 'Özgeçmiş');
      if (!(await satir.count())) return 'dosya alanı veri durağında YOK';
      return (await satir.innerText()).replace(/\s+/g, ' ').slice(0, 200);
    });
    await kontrol(B, 'Adım 2 doldur → “Devam et”', async () => {
      const yaz = async (e: string, v: string): Promise<void> => { const s = satirBul(page, e); if (await s.count()) await s.locator('input').fill(v); };
      await yaz('Kod deposu adresi', 'https://depo.ornek.test/deneme');
      await yaz('Deneyim', '4');
      await yaz('Beceriler', 'TypeScript');
      await yaz('Tercih edilen bölge', 'Kuzey');
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: /veri gerekli|Şimdi ne yapayım|hata mı/ })).toBeVisible(UZUN);
      return await soruKarti(page).getByRole('heading').first().innerText();
    });
    // Karar ekranı
    await kontrol(B, '“Şimdi ne yapayım?”: üç seçenek, aday listesi, öneri seçili', async () => {
      await expect(soruKarti(page).getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-03-karar.png'), fullPage: true });
      const secenekler = await soruKarti(page).locator('.hizli-karar-secenegi').allInnerTexts();
      expect(secenekler.length).toBe(3);
      const adaylar = await page.locator('#hizli-aday option').allInnerTexts();
      const secili = await page.locator('#hizli-aday').evaluate((s) => (s as HTMLSelectElement).selectedOptions[0]?.textContent ?? '');
      return `adaylar: ${adaylar.join(' | ')}; seçili: ${secili}; seçenekler: ${secenekler.map((x) => x.replace(/\s+/g, ' ').slice(0, 40)).join(' / ')}`;
    });
    await kontrol(B, '“Veriyi düzenle” veri durağına döner, girilen değerler korunur', async () => {
      await soruKarti(page).getByRole('button', { name: 'Veriyi düzenle' }).click();
      await expect(soruKarti(page).getByRole('heading', { name: /veri gerekli/ })).toBeVisible(UZUN);
      const v = await satirBul(page, 'Deneyim').locator('input').inputValue().catch(() => '(yok)');
      expect(v).toBe('4');
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: /Şimdi ne yapayım|veri gerekli/ })).toBeVisible(UZUN);
      return `Deneyim: ${v}`;
    });
    await kontrol(B, '“Başka bir düğmeye bas…” → “Tarayıcıda düğmeyi seçin” + Vazgeç', async () => {
      await expect(soruKarti(page).getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible(UZUN);
      await soruKarti(page).locator('.hizli-karar-secenegi').filter({ hasText: 'Başka bir düğmeye bas' }).click();
      await soruKarti(page).getByRole('button', { name: 'Uygula' }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Tarayıcıda düğmeyi seçin' })).toBeVisible(UZUN);
      await soruKarti(page).getByRole('button', { name: 'Vazgeç' }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible(UZUN);
      return 'sayfada seçim başsız tarayıcıda tıklanamaz (yalnız açılış / vazgeç denendi)';
    });
    // İş başvurusu beceri etiketi (yaz + Enter) yüzünden ilerleyemez (bkz. ekran koşusu): arayüzden iptal edilir, akışın geri kalanı
    // üyelik ekranında (önce onay → form → yönlendirme) denenir.
    await kontrol(B, '“Hızlı testi iptal et” onay penceresi → iptal; “Yeni hızlı test başlat” bağlantısı', async () => {
      await soruKarti(page).getByRole('button', { name: 'Hızlı testi iptal et' }).click();
      const d = page.locator('dialog[open]');
      await expect(d).toBeVisible();
      await d.getByRole('button', { name: 'İptal et' }).click();
      await expect(page.getByRole('link', { name: 'Yeni hızlı test başlat' })).toBeVisible(UZUN);
    });
    await isBitsin();
    const U = 'Evet / üyelik';
    await kontrol(U, 'Üyelik: onay kutusu durağı → Evet + tek aday “Devam” kendiliğinden basılır → 6 yeni alan', async () => {
      await baslatArayuz(page, 'Poligon arayüz üyelik', '/uyelik/', 'Evet');
      await expect(soruKarti(page).getByRole('heading', { name: /veri gerekli/ })).toBeVisible(UZUN);
      await satirBul(page, 'Koşulları okudum').locator('input[type=checkbox]').check();
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: /Adım 2: veri gerekli/ })).toBeVisible(UZUN);
      return (await veriSatirlari(page)).join(', ');
    });
    const du = sayac('/uyelik').doldurma.length;
    await kontrol(U, '↑ ile “Doğum yılı” en üste: sayfada önce doğum yılı doldurulur', async () => {
      for (let i = 0; i < 6; i++) {
        const b = satirBul(page, 'Doğum yılı').getByRole('button', { name: 'Yukarı taşı' });
        if (await b.isDisabled()) break;
        await b.click();
      }
      expect((await veriSatirlari(page))[0]).toBe('Doğum yılı');
      const yaz = async (e: string, v: string): Promise<void> => { await satirBul(page, e).locator('input').fill(v); };
      await yaz('Doğum yılı', '1995');
      await yaz('Kullanıcı adı', 'arayuz_uye_7');
      await yaz('E-posta', 'uye@ornek.test');
      await satirBul(page, 'Parola').first().locator('input').fill('Gizli-Parola-1');
      await yaz('Parola (tekrar)', 'Gizli-Parola-1');
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible(UZUN);
      await expect.poll(() => sayac('/uyelik').doldurma.length - du, { timeout: 10_000 }).toBeGreaterThanOrEqual(5);
      const sira = [...new Set(sayac('/uyelik').doldurma.slice(du).map((x: Nesne) => x.alan))];
      expect(sira[0]).toBe('Doğum yılı');
      return `sayfadaki sıra: ${sira.join(' → ')}`;
    });
    await kontrol(U, '“Devam et: Hesabı oluştur” → yönlendirme sonrası karar ekranı', async () => {
      const adaylar = await page.locator('#hizli-aday option').allInnerTexts();
      await soruKarti(page).locator('.hizli-karar-secenegi').filter({ hasText: 'Devam et:' }).click();
      await page.locator('#hizli-aday').selectOption({ label: adaylar.find((x) => /Hesabı oluştur/.test(x)) ?? '' });
      await soruKarti(page).getByRole('button', { name: 'Uygula' }).click();
      await expect(soruKarti(page).getByText(/Adres değişti/)).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-03b-fark.png'), fullPage: true });
      return `adaylar: ${adaylar.join(' | ')}`;
    });
    await kontrol(U, 'Zincir kartı (sağ sütun) gerçeği yansıtır', async () => {
      const z = await page.locator('.hizli-zincir li').allInnerTexts();
      expect(z.some((x) => /Hesabı oluştur/.test(x))).toBe(true);
      return z.join(' / ');
    });
    await kontrol(U, '“Burada bitir” → bitiş koşulu: başarı metni Bitti önerili', async () => {
      await soruKarti(page).locator('.hizli-karar-secenegi').filter({ hasText: 'Burada bitir' }).click();
      await soruKarti(page).getByRole('button', { name: 'Uygula' }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Bitiş koşulu: ne görülünce biter?' })).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-04-bitis.png'), fullPage: true });
      const satir = page.locator('.hizli-bitis-satiri').filter({ hasText: 'Hesabınız hazır' });
      await expect(satir.getByRole('radio', { name: 'Bitti' })).toHaveAttribute('aria-checked', 'true');
      return (await page.locator('.hizli-bitis-satiri .hizli-cip').allInnerTexts()).join(' | ');
    });
    await kontrol(U, 'Seçili etikete yeniden tıklamak etiketi kaldırır; Bitti yokken “Devam et” pasif + gerekçe; adres yazılınca etkin', async () => {
      const satir = page.locator('.hizli-bitis-satiri').filter({ hasText: 'Hesabınız hazır' });
      await satir.getByRole('radio', { name: 'Bitti' }).click();
      await expect(satir.getByRole('radio', { name: 'Bitti' })).toHaveAttribute('aria-checked', 'false');
      for (const r of await page.locator('.hizli-bitis-satiri').all()) {
        if ((await r.getByRole('radio', { name: 'Bitti' }).getAttribute('aria-checked')) === 'true') await r.getByRole('radio', { name: 'Etiketsiz' }).click();
      }
      await expect(soruKarti(page).getByRole('button', { name: 'Devam et', exact: true })).toBeDisabled();
      await expect(page.locator('#hizli-bitis-eksik')).toContainText('Bitti');
      await page.getByLabel(/Adres şu olursa bitti/).fill('/uyelik/hosgeldin');
      await expect(soruKarti(page).getByRole('button', { name: 'Devam et', exact: true })).toBeEnabled();
      await page.getByLabel(/Adres şu olursa bitti/).fill('');
      await satir.getByRole('radio', { name: 'Bitti' }).click();
      await expect(soruKarti(page).getByRole('button', { name: 'Devam et', exact: true })).toBeEnabled();
    });
    await kontrol(U, '“Sayfayı yeniden tara” etiketleri korur', async () => {
      await soruKarti(page).getByRole('button', { name: 'Sayfayı yeniden tara' }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Bitiş koşulu: ne görülünce biter?' })).toBeVisible(UZUN);
      await expect(page.locator('.hizli-bitis-satiri').filter({ hasText: 'Hesabınız hazır' }).getByRole('radio', { name: 'Bitti' })).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    });
    await kontrol(U, 'Bitiş → Kaydet; “Bitiş koşulunu düzenle” geri döner, etiket korunur', async () => {
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Kaydedilecekler' })).toBeVisible(UZUN);
      await soruKarti(page).getByRole('button', { name: 'Bitiş koşulunu düzenle' }).click();
      await expect(page.locator('.hizli-bitis-satiri').filter({ hasText: 'Hesabınız hazır' }).getByRole('radio', { name: 'Bitti' })).toHaveAttribute('aria-checked', 'true', UZUN);
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Kaydedilecekler' })).toBeVisible(UZUN);
    });
    await kontrol(U, 'Kaydet ekranı: ad, toplu koşuya dahil (işaretli), tablo seçeneği (işaretli), H3 “Evet, doğrula / Hayır, kaydet”', async () => {
      await page.screenshot({ path: join(RAPOR, 'ui-05-kaydet.png'), fullPage: true });
      await expect(page.getByLabel('Senaryonun adı')).toHaveValue(/Poligon arayüz üyelik/);
      await expect(page.getByLabel('Toplu koşuya dahil')).toBeChecked();
      await expect(page.getByLabel(/test verisi tablosu olarak kaydet/)).toBeChecked();
      await expect(soruKarti(page).getByRole('button', { name: 'Evet, doğrula' })).toBeVisible();
      await expect(soruKarti(page).getByRole('button', { name: 'Hayır, kaydet' })).toBeVisible();
      return `zincir: ${(await page.locator('.hizli-zincir.buyuk li').allInnerTexts()).join(' / ')}`;
    });
    const sd = sayac('/uyelik').gonderim;
    await kontrol(U, '“Evet, doğrula”: adım listesi ilerler, sonuç başarılı', async () => {
      await soruKarti(page).getByRole('button', { name: 'Evet, doğrula' }).click();
      await expect(page.getByText(/Doğrulama koşusu (başarılı|başarısız)/)).toBeVisible({ timeout: 240_000 });
      await page.screenshot({ path: join(RAPOR, 'ui-06-dogrulama.png'), fullPage: true });
      await expect(page.getByText(/Doğrulama koşusu başarılı/)).toBeVisible();
      return `doğrulamada gönderim: ${sayac('/uyelik').gonderim - sd}`;
    });
    let ekranId = '';
    await kontrol(U, '“Kaydet — özeti göster” özeti YENİ SEKMEDE açar; “Onayla ve kaydet” → Test kaydedildi; “Hızlı teste dön” bağlantısı', async () => {
      await page.getByLabel('Senaryonun adı').fill('Poligon arayüz senaryosu');
      const yeniSekme = baglam.waitForEvent('page', { timeout: 30_000 });
      await soruKarti(page).getByRole('button', { name: 'Kaydet — özeti göster' }).click();
      const ozet = await yeniSekme;
      await ozet.waitForLoadState();
      await expect(ozet).toHaveURL(/#\/hizli-test\/ozet\//);
      await expect(ozet.getByRole('heading', { name: /Kayıt özeti/ })).toBeVisible(UZUN);
      await ozet.screenshot({ path: join(RAPOR, 'ui-07-ozet-sekmesi.png'), fullPage: true });
      await ozet.getByRole('button', { name: /Onayla ve kaydet/ }).click();
      await expect(ozet.getByRole('heading', { name: 'Test kaydedildi' })).toBeVisible(UZUN);
      await expect(ozet.getByRole('link', { name: 'Hızlı teste dön' })).toBeVisible();
      const akis = await ozet.getByRole('link', { name: 'Akış diyagramında aç' }).getAttribute('href');
      ekranId = decodeURIComponent(/#\/ekranlar\/e\/([^/]+)\/akis/.exec(akis ?? '')?.[1] ?? '');
      await ozet.close();
      return `ekran ${ekranId}`;
    });
    await isBitsin();
    await kontrol(U, 'Kaydedilen senaryonun normal koşusu ↑ ile verilen sırayı korur (önce Doğum yılı)', async () => {
      const o = await oturum(oturumKimligi(page));
      const senaryoId = String(o.soru?.senaryoId ?? '');
      expect(senaryoId).not.toBe('');
      const dn = sayac('/uyelik').doldurma.length;
      const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId, ortamId });
      const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
      const sira = [...new Set(sayac('/uyelik').doldurma.slice(dn).map((x: Nesne) => x.alan))];
      expect(sonuc.durum, String(sonuc.hataMesaji ?? '')).toBe('basarili');
      expect(sira.filter((x) => x !== 'Koşulları okudum ve kabul ediyorum')[0]).toBe('Doğum yılı');
      return `normal koşu sırası: ${sira.join(' → ')}`;
    });
    await kontrol(U, 'Düzenleme kipi: aynı senaryo adıyla kaydet → “Üzerine yaz / Yeni adla kaydet / Vazgeç” sorusu', async () => {
      expect(ekranId).not.toBe('');
      await baslatArayuz(page, '', '/uyelik/', 'Evet', ekranId);
      const id = oturumKimligi(page);
      // Zincir API ile hızla yürütülür (arayüzün kendisi yukarıda denendi).
      let o = await bekle(id);
      for (let i = 0; i < 20 && !['bitis', 'kaydet'].includes(o.durum); i++) {
        if (o.durum === 'veri') {
          const dg: Nesne = {};
          for (const a of o.soru.alanlar as Nesne[]) {
            const pd = planDegeri(PLANLAR.find((x) => x.kok === '/uyelik') as EkranPlani, String(a.etiket), false);
            if (pd?.deger !== undefined && !a.hazir) dg[a.anahtar] = { deger: secenekDegeri(a, pd.deger), kaynak: 'elle' };
            else if (pd?.tablo) dg[a.anahtar] = { deger: { Ad: 'Deneme', Soyad: 'Kişi', 'E-posta': 'deneme@ornek.test' }[pd.tablo] ?? 'x', kaynak: 'elle' };
          }
          await api('/platform/hizli-test/veri', { id, degerler: dg });
        } else if (o.durum === 'karar') {
          const ad = (o.soru.adaylar as Nesne[]).find((x) => /Hesabı oluştur/.test(x.metin)) ?? (o.soru.adaylar as Nesne[]).find((x) => /^İleri$/.test(x.metin));
          const gonderildi = (o.adimlar as Nesne[]).some((x) => /Hesabı oluştur/.test(x.bas?.metin ?? ''));
          if (gonderildi || !ad) await api('/platform/hizli-test/karar', { id, karar: 'bitir' });
          else await api('/platform/hizli-test/karar', { id, karar: 'bas', secici: ad.secici });
        } else if (o.durum === 'hataSorusu') await api('/platform/hizli-test/hata-cevabi', { id, cevap: 'onemsiz' });
        o = await bekle(id);
      }
      expect(o.durum).toBe('bitis');
      const et = { ...(o.soru.etiketler as Nesne) };
      for (const m of Object.keys(et)) if (/Hesabınız hazır/.test(m)) et[m] = 'bitti';
      await basarili('/platform/hizli-test/bitis', { id, etiketler: et });
      await expect(soruKarti(page).getByRole('heading', { name: 'Kaydedilecekler' })).toBeVisible(UZUN);
      await page.getByLabel('Senaryonun adı').fill('Poligon arayüz senaryosu');
      await soruKarti(page).getByRole('button', { name: 'Hayır, kaydet' }).click();
      let ozet = await baglam.waitForEvent('page', { timeout: 30_000 });
      await expect(ozet.getByRole('heading', { name: /Kayıt özeti/ })).toBeVisible(UZUN);
      const uyari = await ozet.locator('.not-kutusu.uyari').allInnerTexts();
      const onay = ozet.getByRole('button', { name: /Onayla ve kaydet|Farkları onayla/ });
      let pasifNedeni = '';
      if (await onay.isDisabled()) {
        // Düzenlemede mevcut tablolarla birleştirme kararı bekleniyor olabilir: neden kaydedilir, tablo yazımı kapatılıp yeniden denenir.
        pasifNedeni = (await ozet.locator('.hizli-ozet-karti [role=status]').last().innerText().catch(() => '')).slice(0, 300);
        await ozet.screenshot({ path: join(RAPOR, 'ui-08a-ozet-onay-pasif.png'), fullPage: true });
        await ozet.close();
        await page.getByLabel(/test verisi tablosu olarak kaydet/).uncheck();
        arayuzSonuclari.push({ bolum: U, ad: 'Düzenleme kipi: özet sekmesinde “Onayla” pasif', sonuc: false, not: pasifNedeni || '(gerekçe yazısı yok)' });
        const yeni = baglam.waitForEvent('page', { timeout: 30_000 });
        yeni.catch(() => undefined);
        await soruKarti(page).getByRole('button', { name: 'Hayır, kaydet' }).click();
        ozet = await yeni;
        await expect(ozet.getByRole('heading', { name: /Kayıt özeti/ })).toBeVisible(UZUN);
      }
      await ozet.getByRole('button', { name: /Onayla ve kaydet|Farkları onayla/ }).click();
      const diyalog = ozet.locator('dialog[open]');
      await expect(diyalog).toBeVisible({ timeout: 30_000 });
      await ozet.screenshot({ path: join(RAPOR, 'ui-08-senaryo-var.png') });
      await expect(diyalog.getByRole('button', { name: 'Üzerine yaz' })).toBeVisible();
      await expect(diyalog.getByRole('button', { name: 'Vazgeç' })).toBeVisible();
      await diyalog.getByRole('button', { name: 'Yeni adla kaydet' }).click();
      await expect(ozet.getByRole('heading', { name: 'Test kaydedildi' })).toBeVisible(UZUN);
      const metin = await ozet.locator('.hizli-soru p').first().innerText();
      await ozet.close();
      return `${pasifNedeni ? `İLK DENEMEDE “Onayla” PASİF (neden: ${pasifNedeni}); tablo yazımı kapatılınca: ` : ''}${uyari.join(' / ').slice(0, 200)} → ${metin}`;
    });
    await isBitsin();
    await kontrol(U, 'Arayüzde sayfa hatası (pageerror) yok', async () => { expect(sayfaHatalari).toEqual([]); });
  } finally { await tarayici.close(); }
});

test('hızlı test arayüzü: izin kipleri (Bana sor / Hayır), iptal, 390 px yerleşim', async () => {
  test.skip(SECILI.length > 0 && !SECILI.includes('arayuz'), 'seçili değil');
  test.setTimeout(600_000);
  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    baglam.setDefaultTimeout(30_000);
    const S = 'Bana sor / havale';
    const s0 = sayac('/havale').olaylar.aliciSorgu ?? 0;
    await kontrol(S, 'Bana sor: ilk düğmeden önce “… basayım mı?” sorusu; “Hayır, basma” → basılmaz, karara döner', async () => {
      await baslatArayuz(page, 'Poligon havale sor', '/havale/', 'Bana sor');
      await expect(soruKarti(page).getByRole('heading', { name: /veri gerekli/ })).toBeVisible(UZUN);
      await satirBul(page, 'Alıcı IBAN').locator('input').fill('TR120006200000000123456789');
      await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soruKarti(page).getByRole('heading', { name: /Şimdi ne yapayım|basayım mı/ })).toBeVisible(UZUN);
      if (await soruKarti(page).getByRole('heading', { name: 'Şimdi ne yapayım?' }).isVisible()) {
        await soruKarti(page).locator('.hizli-karar-secenegi').filter({ hasText: 'Devam et:' }).click();
        await soruKarti(page).getByRole('button', { name: 'Uygula' }).click();
      }
      await expect(soruKarti(page).getByRole('heading', { name: /basayım mı/ })).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-09-bana-sor.png') });
      await soruKarti(page).getByRole('button', { name: 'Hayır, basma' }).click();
      await expect(soruKarti(page).getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible(UZUN);
      expect((sayac('/havale').olaylar.aliciSorgu ?? 0) - s0).toBe(0);
    });
    await kontrol(S, '390 px: yatay kaydırma yok, karar kartı sığar', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(RAPOR, 'ui-10-390px-karar.png'), fullPage: true });
      const tasma = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(tasma).toBeLessThanOrEqual(0);
      await page.setViewportSize({ width: 1440, height: 1000 });
      return `taşma ${tasma}px`;
    });
    await kontrol(S, '“Hızlı testi iptal et” onay ister; iptal sonrası “Yeni hızlı test başlat”', async () => {
      await soruKarti(page).getByRole('button', { name: 'Hızlı testi iptal et' }).click();
      const d = page.locator('dialog[open]');
      await expect(d).toBeVisible();
      await d.getByRole('button', { name: 'İptal et' }).click();
      await expect(page.getByRole('link', { name: 'Yeni hızlı test başlat' })).toBeVisible(UZUN);
    });
    await isBitsin();
    const H = 'Hayır / etkinlik';
    const e0 = sayac('/etkinlik').gonderim;
    await kontrol(H, 'Hayır: veri durağı → “Düğmeyi ve mesajı seçin”; düğme adayları ve mesaj adayları', async () => {
      await baslatArayuz(page, 'Poligon etkinlik hayır', '/etkinlik/', 'Hayır');
      await expect(soruKarti(page).getByRole('heading', { name: /veri gerekli|Düğmeyi ve mesajı seçin/ })).toBeVisible(UZUN);
      if (await soruKarti(page).getByRole('heading', { name: /veri gerekli/ }).isVisible()) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(RAPOR, 'ui-11-390px-veri.png'), fullPage: true });
        const tasma = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        await page.setViewportSize({ width: 1440, height: 1000 });
        arayuzSonuclari.push({ bolum: H, ad: '390 px veri durağı yatay taşma', sonuc: tasma <= 0, not: `taşma ${tasma}px` });
        for (const s of await page.locator('.hizli-alanlar .hizli-alan').all()) {
          const g = s.locator('input[type=text], input:not([type])').first();
          if (await g.count()) await g.fill('Deneme');
        }
        await soruKarti(page).getByRole('button', { name: 'Devam et', exact: true }).click();
      }
      await expect(soruKarti(page).getByRole('heading', { name: 'Düğmeyi ve mesajı seçin' })).toBeVisible(UZUN);
      await page.screenshot({ path: join(RAPOR, 'ui-12-hayir-secim.png'), fullPage: true });
      const dugmeler = await page.locator('#hizli-hayir-dugme option').allInnerTexts();
      const mesajlar = await page.locator('.hizli-mesajlar label').allInnerTexts();
      return `düğme adayları: ${dugmeler.join(' | ') || 'YOK'}; mesaj adayları: ${mesajlar.join(' | ') || 'YOK'}`;
    });
    await kontrol(H, 'Hayır: hiçbir gönderim yapılmadı (sunucu sayacı)', async () => {
      expect(sayac('/etkinlik').gonderim - e0).toBe(0);
    });
    await api('/platform/hizli-test/iptal', { id: oturumKimligi(page) }).catch(() => undefined);
    await isBitsin();
  } finally { await tarayici.close(); }
});
