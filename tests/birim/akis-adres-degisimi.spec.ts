// UÇTAN UCA (yerel) — ÇOK SAYFALI / ADRES DEĞİŞTİREN EKRAN AKIŞI KAYDI ("Akışı kaydet"): kullanıcı sayfa 1'de alan doldurup düğmeye basar,
// ADRES ÇUBUĞUYLA (ya da bağlantıyla) sayfa 2'ye gider, orada alan doldurup düğmeye basar, sonra sayfa 3'e gider. Nöbetçi her adres
// değişimini yakalar (Chromium sayfa geçişi türü — typed —, tıklama zamanlaması, geri / ileri, parça / sorgu / betikle yönlenen
// menü), olay sırasına göre taslakta "Şu adrese git" bloğu yapar; model, koşucu ve Playwright dışa aktarma aynı zinciri yürütür.
// Alınmayan değişimler (aynı sayfa, tıklamayla açılan, otomatik yönlendirme, başka site) onay ekranında nedeniyle görünür.
// Kullanıcının yerini bu test alır: kayıt tarayıcısına (alt süreç, başsız) uzaktan hata ayıklama portundan bağlanıp adres çubuğu
// gezinmesi yapar (page.goto = Chromium'da "typed" sayfa geçişi; yazıp Enter'a basmakla aynı geçiş türü).
// Güvenlik: yalnızca 127.0.0.1'deki örnek uygulama (NOBETCI_TARAMA_IZINLI_KOKENLER; DNS kapalı); geçici veritabanı, ayrı Nöbetçi.
// Gizlilik: kayıtta yazılan değerler pakete / diyagrama / loga düşmez.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { bosPort, nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API yanıtları serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;
const PAROLA = `Gecici-Adres-${randomBytes(6).toString('hex')}`;
/** Kayıtta alanlara yazılan değerler: pakete / diyagrama / loga DÜŞMEMELİ. */
const GIZLI_AD = 'Kayit-Gizli-Ad-51';
const GIZLI_KOD = 'Kayit-Gizli-Kod-52';

const sayfa = (govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8', govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Sayfa</title></head><body>${govde}</body></html>`
});
const SPA = (rapor: boolean): string => `<h1>Uygulama</h1><div id="menu" style="cursor:pointer;padding:8px">Rapor menüsü</div><p id="spa-yol">${rapor ? 'Rapor' : ''}</p>
<script>document.getElementById('menu').addEventListener('click', () => { history.pushState({}, '', '/spa/rapor'); document.getElementById('spa-yol').textContent = 'Rapor'; });</script>`;

/**
 *   /adim-1   Ad + Gönder (POST /kayit) · /adim-2 Kod + Gönder · /adim-3 son sayfa (yazı)
 *   /liste    sorgu dizisi gösterir · /rota  parçayla (#/…) yönlenen sayfa · /spa  betikle (pushState) yönlenen menü (/spa/rapor da açılır)
 *   /otomatik betikle /adim-3'e yönlendirir · /bag /adim-3?x=1 bağlantısı
 */
class Uygulama {
  readonly istekler: string[] = [];
  readonly kayitlar: string[] = [];
  readonly isle = (i: FiksturIstegi): FiksturYaniti => {
    this.istekler.push(`${i.yontem} ${i.yol}${i.sorgu.size ? `?${i.sorgu.toString()}` : ''}`);
    if (i.yol === '/favicon.ico') return { durum: 404, tur: 'text/plain', govde: '' };
    if (i.yol === '/kayit' && i.yontem === 'POST') { this.kayitlar.push(i.govde); return { tur: 'text/plain', govde: 'ok' }; }
    switch (i.yol) {
      case '/adim-1': return sayfa(`<h1>Birinci sayfa</h1><label>Ad <input id="ad"></label><button type="button" id="gonder1">Gönder</button><p id="sonuc1"></p>
<script>document.getElementById('gonder1').addEventListener('click', () => { document.getElementById('sonuc1').textContent = 'Birinci adım tamam'; fetch('/kayit', { method: 'POST', body: JSON.stringify({ sayfa: 1, ad: document.getElementById('ad').value }) }); });</script>`);
      case '/adim-2': return sayfa(`<h1>İkinci sayfa</h1><label>Kod <input id="kod"></label><button type="button" id="gonder2">Gönder</button><p id="sonuc2"></p>
<script>document.getElementById('gonder2').addEventListener('click', () => { document.getElementById('sonuc2').textContent = 'İkinci adım tamam'; fetch('/kayit', { method: 'POST', body: JSON.stringify({ sayfa: 2, kod: document.getElementById('kod').value }) }); });</script>`);
      case '/adim-3': return sayfa('<h1>Üçüncü sayfa</h1><p id="son">Üçüncü sayfa hazır</p>');
      case '/liste': return sayfa(`<h1>Liste</h1><p>Durum: ${i.sorgu.get('durum') ?? 'hepsi'}</p>`);
      case '/rota': return sayfa(`<h1>Rota</h1><p id="rota"></p><script>const g = () => { document.getElementById('rota').textContent = 'Rota: ' + location.hash; }; window.addEventListener('hashchange', g); g();</script>`);
      case '/spa': return sayfa(SPA(false));
      case '/spa/rapor': return sayfa(SPA(true));
      case '/otomatik': return sayfa("<p>Yönlendiriliyor</p><script>setTimeout(() => location.replace('/adim-3'), 300);</script>");
      case '/pencere-ac': return sayfa('<h1>Pencere aç</h1><a id="ac" href="/pencere" target="_blank">Yeni pencerede aç</a>');
      case '/pencere': return sayfa('<h1>Pencere</h1><p>Açılan pencerenin içeriği</p>');
      case '/bag': return sayfa('<h1>Bağlantı</h1><a id="baglanti" href="/adim-3?x=1">Üçüncü sayfaya bağlantı</a>');
      default: return { durum: 404, tur: 'text/plain', govde: 'yok' };
    }
  };
}

let nobetci: Nobetci;
let uygulama: Uygulama;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let baskaSite: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let cdpPortu = 0;
let projeId = '';
let ortamId = '';
/** Değişken kayıt (ikinci test) işi: arayüz testi bunu açar. */
let cesitliIsId = '';

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
  return y;
}
const isDurumu = async (id: string): Promise<Nesne> => (await api(`/platform/tarama/durum?id=${id}`)).is as Nesne;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'akis-adres-'));
  uygulama = new Uygulama();
  fikstur = await yerelSunucu(uygulama.isle);
  baskaSite = await yerelSunucu(() => sayfa('<h1>Başka site</h1>'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  cdpPortu = await bosPort();
  nobetci = await nobetciBaslat(klasor, vtYolu, {
    NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_KAYIT_CDP_PORTU: String(cdpPortu), NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '240'
  });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Adres Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  await baskaSite?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

const kayitGovdesi = (ad: string, anahtar: string, hedef: string): Nesne => ({
  kip: 'kayit', projeId, ortamId, ekranAdi: ad, ekranAnahtari: anahtar, hedef, baglamProfilleri: [], onay: true, girissiz: true
});

/** Kayıt tarayıcısına bağlanır; panelin açıldığı sayfayı bulur. */
async function kayitSayfasi(isId: string, yolParcasi: string): Promise<{ tarayici: Browser; sayfa: Page }> {
  const son = Date.now() + 60_000;
  let tarayici: Browser | null = null;
  while (!tarayici) {
    try { tarayici = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPortu}`); } catch {
      if (Date.now() > son) throw new Error(`kayıt tarayıcısına bağlanılamadı: ${JSON.stringify(await isDurumu(isId))}`);
      await new Promise((c) => setTimeout(c, 250));
    }
  }
  for (;;) {
    const d = await isDurumu(isId);
    const s = tarayici.contexts().flatMap((b) => b.pages()).find((p) => p.url().includes(yolParcasi));
    if (s && d.adimlar.find((a: Nesne) => a.anahtar === 'kayit')?.mesaj?.startsWith('Tarayıcıda akışı yürütün')) return { tarayici, sayfa: s };
    if (d.durum !== 'suruyor' || Date.now() > son) throw new Error(`kayıt sayfası açılmadı: ${JSON.stringify(d)}`);
    await new Promise((c) => setTimeout(c, 250));
  }
}
async function kayitBitti(isId: string): Promise<Nesne> {
  let d = await isDurumu(isId);
  for (const son = Date.now() + 30_000; d.durum === 'suruyor' && Date.now() < son; d = await isDurumu(isId)) await new Promise((c) => setTimeout(c, 250));
  return d;
}
async function bitir(sayfaNesnesi: Page): Promise<void> {
  const panel = sayfaNesnesi.locator('#nobetci-kayit-paneli');
  await panel.getByRole('button', { name: 'Bitir', exact: true }).click();
  await panel.getByRole('button', { name: 'Bitir ve Nöbetçi’ye gönder' }).click();
}
const gitYollari = (bloklar: Nesne[]): string[] => bloklar.filter((b) => b.tur === 'git').map((b) => b.yol);

test('3 sayfalı kayıt: alan + düğme → adres çubuğuyla sayfa 2 → alan + düğme → adres çubuğuyla sayfa 3; taslakta her sayfa geçişi "Şu adrese git", model ve koşu aynı zinciri yürütür', async () => {
  test.setTimeout(240_000);
  const isId = String((await basarili('/platform/tarama/baslat', kayitGovdesi('Üç Sayfa', 'uc-sayfa', '/adim-1'))).isId);
  const { tarayici, sayfa: s } = await kayitSayfasi(isId, '/adim-1');
  try {
    await expect(s.locator('#nobetci-kayit-paneli')).toBeAttached();
    // Sayfa 1: alan + düğme. Adres çubuğuna hemen (düğmeden 4 sn önce) yazılarak sayfa 2'ye gidilir.
    await s.fill('#ad', GIZLI_AD);
    await s.click('#gonder1');
    await expect(s.locator('#sonuc1')).toHaveText('Birinci adım tamam');
    await s.goto(`${fikstur.adres}/adim-2`);
    // Sayfa 2: alan + düğme; sonra adres çubuğuyla sayfa 3.
    await s.fill('#kod', GIZLI_KOD);
    await s.click('#gonder2');
    await expect(s.locator('#sonuc2')).toHaveText('İkinci adım tamam');
    await s.goto(`${fikstur.adres}/adim-3`);
    await expect(s.locator('#son')).toBeVisible();
    await bitir(s);
  } finally {
    await tarayici.close().catch(() => undefined);
  }
  const d = await kayitBitti(isId);
  expect(d, JSON.stringify(d)).toMatchObject({ kip: 'kayit', durum: 'tamam', tasarim: true });

  // KÖK NEDEN KANITI: kayıt motoru adres değişimlerini yakalar; taslak / model bunları kullanır (önceden akisTaslagi gezinmeleri hiç okumuyordu).
  const akis = await api(`/platform/tarama/akis?id=${isId}`);
  const bloklar = akis.bloklar as Nesne[];
  const palet = akis.palet as Nesne;
  expect(bloklar.map((b) => b.tur)).toEqual(['alanlar', 'aksiyon', 'git', 'alanlar', 'aksiyon', 'git', 'bitir']);
  expect(gitYollari(bloklar)).toEqual(['/adim-2', '/adim-3']);
  expect(bloklar[0].alanlar.map((a: string) => palet.alanlar.find((x: Nesne) => x.anahtar === a).etiket)).toEqual(['Ad']);
  expect(bloklar[3].alanlar.map((a: string) => palet.alanlar.find((x: Nesne) => x.anahtar === a).etiket)).toEqual(['Kod']);
  // Onay ekranı verisi: özet her zaman var (2 adres değişimi, ikisi de adım).
  expect(akis.gezinme).toMatchObject({ ozet: { toplam: 2, adim: 2, baskaSiteler: [] }, ozetMetni: 'Kayıtta 2 adres değişimi görüldü: 2 tanesi adım oldu.', uyarilar: [] });
  expect((akis.ortam as Nesne).tabanUrl).toBe(fikstur.adres);

  // Tasarım: sayfa 3'te beklenen yazı (git adımının başarı göstergesi; gidilen sayfada aranır) → pakete çevrilir.
  const tasarim = [...bloklar.slice(0, -1), { tur: 'mesaj', mesaj: null, metin: 'Üçüncü sayfa hazır' }, { tur: 'bitir' }];
  await basarili('/platform/tarama/akis', { id: isId, bloklar: tasarim });
  const paket = (await api(`/platform/tarama/paket?id=${isId}`)).paket as Nesne;
  const adimlar = paket.model.adimlar as Nesne[];
  expect(adimlar.map((a) => a.baslik)).toEqual(['Birinci sayfa', 'Adrese git: /adim-2', 'İkinci sayfa', 'Adrese git: /adim-3']);
  expect(adimlar.map((a) => a.kosu.aksiyonlar)).toEqual([
    [{ tur: 'tikla', secici: '#gonder1', aciklama: 'Gönder' }], [{ tur: 'git', yol: '/adim-2' }],
    [{ tur: 'tikla', secici: '#gonder2', aciklama: 'Gönder' }], [{ tur: 'git', yol: '/adim-3' }]
  ]);
  expect(paket.model.ekranUrl).toBe('/adim-1');
  expect(adimlar[3].kosu.basariGostergesi).toEqual({ tur: 'metin', deger: 'Üçüncü sayfa hazır' });
  // Gizlilik: yazılan değerler pakette / diyagramda / logda yok.
  const metin = JSON.stringify(paket) + JSON.stringify(akis);
  for (const g of [GIZLI_AD, GIZLI_KOD]) { expect(metin).not.toContain(g); expect(readFileSync(join(klasor, 'sunucu.log'), 'utf8')).not.toContain(g); }

  // Model kabul edilir; senaryo formdan oluşturulur; Nöbetçi koşusu 3 sayfayı sırayla yürütür.
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  const ekran = liste.ekranlar.find((e) => e.ad === 'Üç Sayfa') as Nesne;
  expect(ekran).toMatchObject({ modelVar: true, olusturulabilir: true });
  const id = (secici: string): string => String(adimlar.flatMap((a) => a.bolumler).flatMap((b: Nesne) => b.alanlar).find((x: Nesne) => x.konum?.secici === secici).id);
  const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId: ekran.id, baslik: 'Üç sayfa', ortamIdleri: [ortamId], veri: { [id('#ad')]: 'Koşu Ad', [id('#kod')]: 'K-99' } });
  const once = uygulama.istekler.length;
  uygulama.kayitlar.length = 0;
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
  expect(y.basarili, y.mesaj).toBe(true);
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect((sonuc.adimlar as Nesne[]).map((a) => a.ad)).toEqual(expect.arrayContaining(['Birinci sayfa', 'Adrese git: /adim-2', 'İkinci sayfa', 'Adrese git: /adim-3']));
  // Koşu zinciri: 1 → (gönderim) → 2 → (gönderim) → 3; her sayfa bir kez açıldı, değerler doğru sayfada yazıldı.
  expect(uygulama.istekler.slice(once).filter((x) => x.startsWith('GET /adim-'))).toEqual(['GET /adim-1', 'GET /adim-2', 'GET /adim-3']);
  expect(uygulama.kayitlar).toEqual([JSON.stringify({ sayfa: 1, ad: 'Koşu Ad' }), JSON.stringify({ sayfa: 2, kod: 'K-99' })]);
});

test('kayıtta adres değişimi çeşitleri: sorgu, parça (#/rota), betikle yönlenen menü, geri / yenileme / otomatik yönlendirme / bağlantı / başka site — hangisi adım, hangisi neden değil', async () => {
  test.setTimeout(240_000);
  const isId = String((await basarili('/platform/tarama/baslat', kayitGovdesi('Çeşitli Gezinme', 'cesitli-gezinme', '/adim-1'))).isId);
  cesitliIsId = isId;
  const { tarayici, sayfa: s } = await kayitSayfasi(isId, '/adim-1');
  try {
    await expect(s.locator('#nobetci-kayit-paneli')).toBeAttached();
    await s.fill('#ad', GIZLI_AD);
    await s.click('#gonder1');
    await expect(s.locator('#sonuc1')).toHaveText('Birinci adım tamam');
    // (a) Düğmeden hemen sonra (4 sn dolmadan) adres çubuğuyla gidiş: Chromium "typed" geçişi ölçülür.
    await s.goto(`${fikstur.adres}/liste?durum=aktif`);
    // Aynı yola yalnız sorgu dizisi değişerek gidiş de bir sayfa geçişidir.
    await s.goto(`${fikstur.adres}/liste?durum=pasif`);
    // Parçayla yönlenen sayfa: yeni yol + yalnız parçası değişen gidiş.
    await s.goto(`${fikstur.adres}/rota#/ozet`);
    await expect(s.locator('#rota')).toHaveText('Rota: #/ozet');
    await s.goto(`${fikstur.adres}/rota#/detay`);
    await expect(s.locator('#rota')).toHaveText('Rota: #/detay');
    // Betikle yönlenen menü (kayıt motorunun düğme saymadığı öğe; pushState): adres çubuğu değil, ayrı bir adım.
    await s.goto(`${fikstur.adres}/spa`);
    await s.click('#menu');
    await expect(s).toHaveURL(/\/spa\/rapor$/);
    // Yenileme ve aynı adrese yeniden gidiş: yeni sayfa sayılmaz.
    await s.reload();
    await s.goto(`${fikstur.adres}/spa/rapor`);
    // Betikle otomatik yönlendirme: /otomatik adım olur (adres çubuğu), yönlendirdiği /adim-3 adım olmaz.
    await s.goto(`${fikstur.adres}/otomatik`);
    await expect(s).toHaveURL(/\/adim-3$/, { timeout: 15_000 });
    // Sayfa içi bağlantı: kayıtlı düğme gibi kaydedilir; açtığı sayfa ayrıca adım olmaz (oynatmada tıklama zaten gider).
    await s.goto(`${fikstur.adres}/bag`);
    await s.click('#baglanti');
    await expect(s).toHaveURL(/\/adim-3\?x=1$/);
    // Başka siteye gidiş engellenir ama sessizce kaybolmaz: onay ekranında uyarı olur.
    await s.goto(`${baskaSite.adres}/`).catch(() => undefined);
    await expect.poll(() => s.url(), { timeout: 10_000 }).toMatch(/^chrome-error:/);
    await s.goto(`${fikstur.adres}/adim-3`);
    await expect(s.locator('#son')).toBeVisible();
    await bitir(s);
  } finally {
    await tarayici.close().catch(() => undefined);
  }
  const d = await kayitBitti(isId);
  expect(d, JSON.stringify(d)).toMatchObject({ kip: 'kayit', durum: 'tamam', tasarim: true });
  const akis = await api(`/platform/tarama/akis?id=${isId}`);
  const bloklar = akis.bloklar as Nesne[];
  expect(gitYollari(bloklar)).toEqual([
    '/liste?durum=aktif', '/liste?durum=pasif', '/rota#/ozet', '/rota#/detay', '/spa', '/spa/rapor', '/otomatik', '/bag', '/adim-3'
  ]);
  const g = akis.gezinme as Nesne;
  expect(g.ozet).toMatchObject({
    adim: 9, atlanan: { ayniSayfa: 2, baskaSite: 1, otomatik: 1, tiklama: 1, yeniPencere: 0 },
    baskaSiteler: [{ koken: new URL(baskaSite.adres).origin, kayitli: false }]
  });
  expect(g.ozet.toplam).toBe(14);
  expect(g.ozetMetni).toBe('Kayıtta 14 adres değişimi görüldü: 9 tanesi adım oldu, 5 tanesi alınmadı '
    + '(nedeni — aynı sayfa: 2; başka site: 1; otomatik yönlendirme: 1; tıklamayla açıldı, oynatmada tıklama zaten gider: 1).');
  expect(g.uyarilar).toEqual([`Şu siteye gidildi: ${new URL(baskaSite.adres).origin}; ortamın adresi dışında olduğu için alınmadı.`]);
  // Bağlantı tıklaması bir aksiyon bloğudur (oynatmada tıklama oraya götürür); yazılan değer diyagramda yok.
  expect(bloklar.some((b) => b.tur === 'aksiyon' && (akis.palet as Nesne).dugmeler[b.dugme].metin === 'Üçüncü sayfaya bağlantı')).toBe(true);
  expect(JSON.stringify(akis)).not.toContain(GIZLI_AD);
});

test('yeni pencere (sekme): açılan pencere ve kapanışı özette görünür, adım olmaz (model tek sayfada koşar)', async () => {
  test.setTimeout(180_000);
  const isId = String((await basarili('/platform/tarama/baslat', kayitGovdesi('Pencereli', 'pencereli', '/adim-1'))).isId);
  const { tarayici, sayfa: s } = await kayitSayfasi(isId, '/adim-1');
  try {
    await expect(s.locator('#nobetci-kayit-paneli')).toBeAttached();
    await s.fill('#ad', GIZLI_AD);
    await s.goto(`${fikstur.adres}/pencere-ac`);
    const [pencere] = await Promise.all([s.context().waitForEvent('page'), s.click('#ac')]);
    await expect(pencere.locator('h1')).toHaveText('Pencere');
    await pencere.close();
    await s.goto(`${fikstur.adres}/adim-3`);
    await expect(s.locator('#son')).toBeVisible();
    await bitir(s);
  } finally {
    await tarayici.close().catch(() => undefined);
  }
  const d = await kayitBitti(isId);
  expect(d, JSON.stringify(d)).toMatchObject({ kip: 'kayit', durum: 'tamam', tasarim: true });
  const akis = await api(`/platform/tarama/akis?id=${isId}`);
  const g = akis.gezinme as Nesne;
  expect(gitYollari(akis.bloklar as Nesne[])).toEqual(['/pencere-ac', '/adim-3']);
  expect(g.ozet.atlanan).toMatchObject({ yeniPencere: 1, baskaSite: 0 });
  expect(g.ozet.pencereler).toEqual([{ sira: expect.any(Number), olay: 'acildi', yol: '/pencere' }, { sira: expect.any(Number), olay: 'kapandi', yol: '' }]);
  expect(g.ozetMetni).toBe('Kayıtta 3 adres değişimi görüldü: 2 tanesi adım oldu, 1 tanesi alınmadı (nedeni — yeni pencere: 1).');
});

test('arayüz: kayıt sonrası diyagramda "Şu adrese git" blokları taban adresle görünür, özet satırı ve başka site uyarısı çıkar; blok kaldırılabilir, elle eklenebilir, geçersiz yol reddedilir', async () => {
  test.setTimeout(180_000);
  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1600 } });
    const page = await baglam.newPage();
    await page.goto(`/#/ekranlar/tarama/${encodeURIComponent(cesitliIsId)}`);
    await expect(page.getByRole('heading', { name: 'Akış diyagramı: Çeşitli Gezinme' })).toBeVisible({ timeout: 15_000 });
    // Özet satırı her zaman; başka site uyarısı ve ek taban adres önerisi.
    const ozet = page.locator('[data-gezinme-ozet-metni]');
    await expect(ozet).toContainText('Kayıtta 14 adres değişimi görüldü: 9 tanesi adım oldu, 5 tanesi alınmadı');
    const uyari = page.locator('.gezinme-uyarisi');
    await expect(uyari).toContainText(`Şu siteye gidildi: ${new URL(baskaSite.adres).origin}; ortamın adresi dışında olduğu için alınmadı.`);
    await expect(uyari.getByRole('button', { name: 'Bu adresi ortamın ek taban adresi olarak ekle' })).toBeVisible();
    // Bloklar okunur: "Şu adrese git" + taban adres salt okunur önek + tam adres açıklaması.
    const diyagram = page.getByRole('list', { name: 'Akış diyagramı' });
    const gitBloklari = diyagram.getByRole('listitem', { name: /: Şu adrese git$/ });
    await expect(gitBloklari).toHaveCount(9);
    const ilk = gitBloklari.first();
    await expect(ilk.locator('.adres-oneki')).toHaveText(fikstur.adres);
    await expect(ilk.getByRole('textbox', { name: /^Gidilecek yol/ })).toHaveValue('/liste?durum=aktif');
    await expect(ilk.locator('[data-tam-adres]')).toHaveText(`Adrese gidildi: /liste?durum=aktif · Tam adres: ${fikstur.adres}/liste?durum=aktif (ortam: Deneme)`);
    await expect(ilk.locator('.dugum-basligi')).toContainText('/liste?durum=aktif');
    // Kullanıcı kaldırabilir.
    await ilk.getByRole('button', { name: 'Bloğu sil' }).click();
    await expect(gitBloklari).toHaveCount(8);
    // Elle ekleme: "+ > Şu adrese git"; yol yazılır. Geçersiz yol (tam adres) kaydederken bloğun altında hata verir.
    await diyagram.getByRole('button', { name: 'Buraya blok ekle' }).first().click();
    await diyagram.getByRole('button', { name: 'Şu adrese git', exact: true }).click();
    await expect(gitBloklari).toHaveCount(9);
    const yeni = gitBloklari.first();
    const yol = yeni.getByRole('textbox', { name: /^Gidilecek yol/ });
    await yol.fill('https://baska.site/x');
    await page.getByRole('button', { name: 'Kaydet ve önizle' }).click();
    await expect(yeni).toContainText('"/" ile başlayan');
    await yol.fill('/elle');
    await expect(yeni.locator('[data-tam-adres]')).toHaveText(`Adrese gidildi: /elle · Tam adres: ${fikstur.adres}/elle (ortam: Deneme)`);
    await page.getByRole('button', { name: 'Kaydet ve önizle' }).click();
    await expect(page.getByText(/Kayıt tamamlandı/)).toBeVisible({ timeout: 20_000 });
    const onizlenen = ((await api(`/platform/tarama/paket?id=${cesitliIsId}`)).paket as Nesne).model.adimlar as Nesne[];
    const yollar = onizlenen.flatMap((a) => (a.kosu?.aksiyonlar ?? []) as Nesne[]).filter((x) => x.tur === 'git').map((x) => x.yol);
    expect(yollar).toEqual(['/elle', '/liste?durum=pasif', '/rota#/ozet', '/rota#/detay', '/spa', '/spa/rapor', '/otomatik', '/bag', '/adim-3']);
  } finally {
    await tarayici.close();
  }
});
