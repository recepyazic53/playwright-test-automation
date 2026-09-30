// UÇTAN UCA (yerel) — ÇOK SAYFALI GİRİŞ KAYDI: kullanıcı giriş yapar, ADRES ÇUBUĞUYLA başka bir sayfaya gider (kullanıcı değiştir), orada bilgileri
// seçip gönderir, "tamamlandı" yazısını görünce adres çubuğuyla ana sayfaya döner. Nöbetçi her sayfa değişimini yakalar, her sayfada
// dokunulan alanları o sayfanın adımı olarak kaydeder (kullanıcı alan SEÇMEZ), oynatmada adımlar doğru adreste uygulanır.
// Ayrıca kayıt kipinde sayfanın kendi açılır penceresi (POST ile yüklenen çerçeve) ENGELLENMEZ ("Bu sayfa Chromium tarafından
// engellendi" olmaz): kayıt kipinde yazma isteği engeli yoktur, kullanıcının kendi tıkladığı akış bozulmaz.
// Güvenlik: yalnızca 127.0.0.1'deki örnek uygulama (NOBETCI_TARAMA_IZINLI_KOKENLER; DNS kapalı); geçici veritabanı, ayrı Nöbetçi.
// Gizlilik: kayıtta yazılan değerler (parola) tarife/loga düşmez.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { girisYap, tarifiHazirla } from '../support/giris-motoru';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { bosPort, nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const PAROLA = `Gecici-Cok-${randomBytes(6).toString('hex')}`;
const ORNEK_KULLANICI = 'ornek.kullanici';
const ORNEK_PAROLA = `Sahte-${randomBytes(5).toString('hex')}`;

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title></head><body>${govde}</body></html>`
});
const yonlendir = (adres: string, basliklar: Record<string, string> = {}): FiksturYaniti => ({ durum: 303, tur: 'text/plain', govde: '', basliklar: { location: adres, ...basliklar } });

const BOLGELER: Record<string, string[]> = { A1: ['A1001'], B2: ['B2001', 'B2002'] };

/**
 *   /                    oturum yoksa giriş sayfası (kullanıcı, parola, "beni hatırla", Giriş); oturum varsa ana sayfa ("Oturumu Kapat" + aktif kullanıcı)
 *   POST /giris          → /panel (oturum çerezi)
 *   /panel               "Hoş geldiniz"; "pencere aç" POST ile yüklenen bir çerçeve (iframe) açar
 *   POST /pencere        çerçevenin içeriği ("Pencere içeriği")
 *   /kullanici-degistir  bölge + kişi seçimi + "KULLANICI DEĞİŞTİR"; POST → /kullanici-tamamlandi ("Kullanıcı değiştirildi")
 */
class Uygulama {
  aktif = 'ilk.kullanici';
  readonly olaylar: string[] = [];
  readonly isle = (i: FiksturIstegi): FiksturYaniti => {
    const oturumlu = i.cerezler.oturum === 'acik';
    this.olaylar.push(`${i.yontem} ${i.yol}`);
    if (i.yol === '/favicon.ico') return { durum: 404, tur: 'text/plain', govde: '' };
    if (i.yol === '/giris' && i.yontem === 'POST') {
      const f = new URLSearchParams(i.govde);
      if (f.get('k') !== ORNEK_KULLANICI || f.get('p') !== ORNEK_PAROLA) return html('Giriş', '<p role="alert">Bilgiler hatalı</p>');
      return yonlendir('/panel', { 'set-cookie': 'oturum=acik; Path=/' });
    }
    if (i.yol === '/') {
      if (!oturumlu) {
        return html('Giriş', `<form method="post" action="/giris"><label for="kullanici">Kullanıcı</label><input id="kullanici" name="k">
<label for="parola">Parola</label><input id="parola" name="p" type="password"><label><input id="hatirla" type="checkbox"> Beni hatırla</label>
<button id="gir" type="submit">Giriş</button></form>`);
      }
      return html('Ana sayfa', `<nav><a href="/cikis">Oturumu Kapat</a></nav><h1>Ana sayfa</h1><p id="aktif">${this.aktif}</p>`);
    }
    if (!oturumlu) return yonlendir('/');
    if (i.yol === '/panel') {
      return html('Panel', `<h1>Hoş geldiniz</h1><span id="pencere-ac" style="cursor:pointer">pencere aç</span>
<form id="pf" method="post" action="/pencere" target="modal" hidden></form>
<script>document.getElementById('pencere-ac').addEventListener('click', () => {
  const f = document.createElement('iframe'); f.id = 'modal'; f.name = 'modal'; f.style.cssText = 'width:400px;height:120px';
  document.body.append(f); document.getElementById('pf').submit();
});</script>`);
    }
    if (i.yol === '/pencere' && i.yontem === 'POST') return html('Pencere', '<p>Pencere içeriği</p>');
    if (i.yol === '/kullanici-degistir' && i.yontem === 'GET') {
      const bolgeler = Object.keys(BOLGELER).map((b) => `<option value="${b}">${b}</option>`).join('');
      const kisiler = Object.values(BOLGELER).flat().map((k) => `<option value="${k}">${k}</option>`).join('');
      return html('Kullanıcı değiştir', `<form method="post" action="/kullanici-degistir"><label for="bolge">Bölge</label>
<select id="bolge" name="bolge"><option value="">Seçiniz</option>${bolgeler}</select>
<label for="kisi">Kişi</label><select id="kisi" name="kisi"><option value="">Seçiniz</option>${kisiler}</select>
<button id="degistir" type="submit">KULLANICI DEĞİŞTİR</button></form>`);
    }
    if (i.yol === '/kullanici-degistir' && i.yontem === 'POST') {
      const f = new URLSearchParams(i.govde);
      if (!(BOLGELER[f.get('bolge') ?? ''] ?? []).includes(f.get('kisi') ?? '')) return html('Hata', '<p role="alert">Geçersiz seçim</p>');
      this.aktif = f.get('kisi') as string;
      return yonlendir('/kullanici-tamamlandi');
    }
    if (i.yol === '/kullanici-tamamlandi') return html('Tamamlandı', '<p>Kullanıcı değiştirildi</p>');
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}

let nobetci: Nobetci;
let uygulama: Uygulama;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let tarayici: Browser;
let klasor = '';
let cdpPortu = 0;
let projeId = '';
let ortamId = '';

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''}`).toBe(true);
  return y;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'giris-cok-'));
  uygulama = new Uygulama();
  fikstur = await yerelSunucu(uygulama.isle);
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
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Çok Sayfalı Proje' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

/** Kayıt tarayıcısına bağlanır; panelin açıldığı giriş sayfasını bulur. */
async function kayitSayfasi(): Promise<{ kayit: Browser; sayfa: Page }> {
  const son = Date.now() + 60_000;
  let kayit: Browser | null = null;
  while (!kayit) {
    try { kayit = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPortu}`); } catch {
      if (Date.now() > son) throw new Error('kayıt tarayıcısına bağlanılamadı');
      await new Promise((c) => setTimeout(c, 250));
    }
  }
  for (;;) {
    const sayfa = kayit.contexts().flatMap((b) => b.pages()).find((p) => p.url().startsWith(fikstur.adres));
    if (sayfa && (await sayfa.locator('#nobetci-kayit-paneli').count())) return { kayit, sayfa };
    if (Date.now() > son) throw new Error('kayıt sayfası açılmadı');
    await new Promise((c) => setTimeout(c, 250));
  }
}

test('çok sayfalı giriş kaydı: adres çubuğuyla gidilen sayfalar algılanır, dokunulan alanlar kendiliğinden listelenir, oynatma adımları doğru adreste uygular', async () => {
  test.setTimeout(240_000);
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1360, height: 1200 } });
  const page = await baglam.newPage();
  await page.goto('/#/ayarlar/giris');
  const satir = page.locator('.giris-tarifi-bolumu li[data-ortam]').filter({ hasText: 'Deneme' });
  await satir.getByRole('button', { name: 'Girişi kaydet — Deneme girişi' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tarayıcıyı aç' }).click();

  const { kayit, sayfa } = await kayitSayfasi();
  try {
    const panel = sayfa.locator('#nobetci-kayit-paneli');
    // 1. sayfa: giriş. "Beni hatırla"ya dokunulmaz.
    await sayfa.fill('#kullanici', ORNEK_KULLANICI);
    await sayfa.fill('#parola', ORNEK_PAROLA);
    await sayfa.click('#gir');
    await sayfa.waitForURL(/\/panel$/);
    // Sayfanın kendi açılır penceresi (POST ile yüklenen çerçeve) kayıt kipinde ENGELLENMEZ.
    await sayfa.click('#pencere-ac');
    await expect(sayfa.frameLocator('#modal').getByText('Pencere içeriği')).toBeVisible();
    // 2. sayfa: adres çubuğuyla (yazarak) gidilir; bölge ve kişi seçilir, kullanıcı değiştirilir.
    await sayfa.goto(`${fikstur.adres}/kullanici-degistir`);
    await sayfa.selectOption('#bolge', 'B2');
    await sayfa.selectOption('#kisi', 'B2001');
    await sayfa.click('#degistir');
    await expect(sayfa.getByText('Kullanıcı değiştirildi')).toBeVisible();
    // 3. sayfa: "tamamlandı" yazısını görünce adres çubuğuyla ana sayfaya dönülür.
    await sayfa.goto(`${fikstur.adres}/`);
    await expect(sayfa.getByText('Oturumu Kapat')).toBeVisible();
    await expect(panel).toBeAttached();
    // Panel alan SEÇTİRMEZ: dokunulanlar kendiliğinden listede, dokunulmayanlar (Beni hatırla) kapalı bölümde işaretsiz.
    await expect(panel.getByText(/^Dokunduğunuz alanlar \(\d+\)$/)).toBeVisible();
    await expect(panel.getByRole('group', { name: 'Dokunulan alanlar' }).getByRole('checkbox', { checked: true })).toHaveCount(4);
    await panel.getByText(/^Dokunmadığınız alanlar/).click();
    await expect(panel.getByRole('group', { name: 'Dokunulmayan alanlar' }).getByRole('checkbox', { name: 'Beni hatırla: listeye al' })).not.toBeChecked();
    await panel.getByRole('button', { name: 'Bitir', exact: true }).click();
    const gonderildi = sayfa.waitForEvent('console', { predicate: (m) => m.text().startsWith('nobetci-test-paneli:'), timeout: 60_000 });
    await panel.evaluate((host) => {
      const kok = host.shadowRoot as ShadowRoot;
      new MutationObserver(() => {
        const metin = kok.textContent ?? '';
        if (metin.includes('Kayıt Nöbetçi’ye gönderildi')) console.log(`nobetci-test-paneli:${metin}`);
      }).observe(kok, { childList: true, subtree: true, characterData: true });
    });
    await panel.getByRole('button', { name: 'Bitir ve Nöbetçi’ye gönder' }).click();
    await gonderildi;
  } finally {
    await kayit.close().catch(() => undefined);
  }

  // Onay ekranı: her sayfa değişimi ve o sayfadaki alanlar sırayla; roller önerilmiş.
  const kutu = page.getByRole('region', { name: 'Giriş kaydı: Deneme' });
  await expect(kutu.getByText('Nöbetçi girişi böyle anladı')).toBeVisible({ timeout: 60_000 });
  const rol = (n: number) => kutu.getByRole('combobox', { name: `Kayıt adımı ${n}: ne?` });
  await expect(rol(1)).toHaveValue('kullaniciAdi');
  await expect(rol(2)).toHaveValue('parola');
  await expect(rol(3)).toHaveValue('gonder');
  await expect(kutu.locator('li.giris-kaydi-adimi').nth(3)).toContainText('Sayfa: /kullanici-degistir');
  await expect(rol(4)).toHaveValue('git');
  await expect(rol(5)).toHaveValue('ek');
  await expect(rol(6)).toHaveValue('ek');
  await expect(rol(7)).toHaveValue('tikla');
  await expect(kutu.locator('li.giris-kaydi-adimi').nth(7)).toContainText('Sayfa: /');
  await expect(rol(8)).toHaveValue('git');
  // Ek alanların adları (değerleri giriş profilinde): etiketten önerilir.
  await kutu.getByLabel('Kayıt adımı 5: ek alan adı').fill('bolge');
  await kutu.getByLabel('Kayıt adımı 6: ek alan adı').fill('kisi');
  const kaydet = kutu.getByRole('button', { name: 'Doğru, kaydet' });
  await expect(kaydet).toBeEnabled({ timeout: 30_000 });
  await kaydet.click();
  await expect(kutu.getByText('Deneme girişi kaydedildi.')).toBeVisible();
  await kutu.getByRole('button', { name: 'Şimdi değil' }).click();

  const tarif = ((await api(`/platform/giris-tarifleri?projeId=${projeId}`)).ortamlar as Nesne[]).find((o) => o.ortamId === ortamId)?.tarif as Nesne;
  expect(tarif.girisAdimlari).toEqual([
    { islem: 'kullaniciAdi' }, { islem: 'parola' }, { islem: 'gonder' },
    { islem: 'git', adres: '/kullanici-degistir', aciklama: '/kullanici-degistir sayfasına git' },
    { islem: 'sec', hedef: { secici: '#bolge' }, deger: '{bolge}', aciklama: 'Bölge' },
    { islem: 'sec', hedef: { secici: '#kisi' }, deger: '{kisi}', aciklama: 'Kişi' },
    { islem: 'tikla', hedef: { secici: '#degistir', metin: 'KULLANICI DEĞİŞTİR' }, aciklama: '“KULLANICI DEĞİŞTİR” düğmesine bas' },
    { islem: 'git', adres: '/', aciklama: '/ sayfasına git' }
  ]);
  expect(tarif).toMatchObject({ kullaniciAlani: '#kullanici', parolaAlani: '#parola', gonderDugmesi: '#gir', basariGostergesi: { tur: 'metin', deger: 'Oturumu Kapat' } });
  // Gizlilik: yazılan parola tarifte ve logda yok.
  expect(JSON.stringify(tarif) + readFileSync(join(klasor, 'sunucu.log'), 'utf8')).not.toContain(ORNEK_PAROLA);

  // Oynatma: kaydedilen tarif çok sayfalı girişi doğru adreslerde uygular (kullanıcı değişir, ana sayfada başarı görülür).
  uygulama.aktif = 'ilk.kullanici';
  const giris = await tarayici.newContext({ baseURL: fikstur.adres });
  try {
    const p = await giris.newPage();
    await girisYap(p, tarifiHazirla(tarif), {
      kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, totpGizli: null, sabitKod: null, smsKipi: null, ekAlanlar: { bolge: 'B2', kisi: 'B2002' }
    }, { izinliKokenler: [fikstur.adres], alanBeklemeMs: 5_000 });
    expect(new URL(p.url()).pathname).toBe('/');
    await expect(p.locator('#aktif')).toHaveText('B2002');
    expect(uygulama.aktif).toBe('B2002');
  } finally {
    await giris.close();
  }
  await baglam.close();
});
