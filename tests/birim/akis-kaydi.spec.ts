// UÇTAN UCA (yerel) — "Akışı kaydet" (topla → tasarla): kullanıcı çok adımlı bir akışı tarayıcıda KENDİSİ yürütür, sayfadaki
// Nöbetçi paneli alanları/düğmeleri/mesajları toplar; Nöbetçi'de taslak diyagram tasarlanır, sayfa paketine çevrilir, kabul
// edilir ve kayıttan çıkan modelle bir senaryo Nöbetçi'nin koşu ucundan (genel yol) koşar.
// Kullanıcının yerini bu test alır: kayıt tarayıcısına (alt süreç, başsız)
// yerel uzaktan hata ayıklama portundan bağlanıp alanları doldurur ve panelin düğmelerine basar.
//
// Güvenlik: şirket sitesine HİÇBİR istek gitmez — ortamın adresi 127.0.0.1'deki örnek başvuru fikstürüdür, tarayıcı
// yalnızca bu kökene bağlanabilir (NOBETCI_TARAMA_IZINLI_KOKENLER; DNS kapalı). Geçici veritabanı ve ayrı Nöbetçi örneği.
// Gizlilik: kayıtta girilen değerler pakete/sunucu loguna düşmez; kayıtta ekran görüntüsü alınmaz.
// AKIS_EKRAN_KLASORU verilirse panelin ve Nöbetçi ekranlarının görüntüleri oraya yazılır (inceleme için; üründe yok).
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { SIRKET_DESENI, korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, OrnekBasvuruUygulamasi, ornekGirisTarifi } from './model-fikstur';
import { bosPort, nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Kayit-${randomBytes(6).toString('hex')}`;
/** Kayıt sırasında alana yazılan değer: pakete ve loga DÜŞMEMELİ. */
const GIZLI_DEGER = 'Kayit-Gizli-Kisi-Adi-73';

let nobetci: Nobetci;
let uygulama: OrnekBasvuruUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let cdpPortu = 0;
let projeId = '';
let ortamId = '';
let canliOrtamId = '';
let paket: Nesne = {};
let kayitIsId = '';
let kayitEkranId = '';
let acikPaket: Nesne = {};
/** Girişsiz modelden oluşturulan senaryolar: [kurumsal/ek sürücülü, bireysel/ek sürücüsüz]. */
const acikSenaryoIdleri: string[] = [];
const EKRAN_KLASORU = process.env.AKIS_EKRAN_KLASORU;
async function goruntu(l: { screenshot: (o: { path: string }) => Promise<unknown> }, ad: string): Promise<void> {
  if (!EKRAN_KLASORU) return;
  mkdirSync(EKRAN_KLASORU, { recursive: true });
  await l.screenshot({ path: join(EKRAN_KLASORU, ad) });
}

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''}`).toBe(true);
  return y;
}
async function isDurumu(id: string): Promise<Nesne> {
  return (await api(`/platform/tarama/durum?id=${id}`)).is as Nesne;
}
const kayitGovdesi = (ek: Nesne = {}): Nesne => ({
  kip: 'kayit', projeId, ortamId, ekranAdi: 'Kayıtlı Başvuru', ekranAnahtari: 'kayitli-basvuru', hedef: '/basvuru/', baglamProfilleri: ['Yetkili'], onay: true, ...ek
});

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'akis-kaydi-'));
  uygulama = new OrnekBasvuruUygulamasi({ totp: true });
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  cdpPortu = await bosPort();
  nobetci = await nobetciBaslat(klasor, vtYolu, {
    NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_KAYIT_CDP_PORTU: String(cdpPortu), NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '240'
  });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Kayıt Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true })).ortam as Nesne).id);
  canliOrtamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Üretim', tabanUrl: 'https://uretim.ornek.invalid', canli: true })).ortam as Nesne).id);
  await basarili('/platform/giris-profili/kaydet', {
    projeId, ad: 'Deneme kullanıcısı', kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, ikiAsamaliTur: 'totp', totpGizli: ORNEK_TOTP_ANAHTARI
  });
  await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId, tarif: ornekGirisTarifi() });
  await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId: canliOrtamId, tarif: ornekGirisTarifi() });
  for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) {
    await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad, alanlar: { subeKodu } });
  }
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor && !process.env.AKIS_KLASORU_KALSIN) rmSync(klasor, { recursive: true, force: true });
  else if (klasor) console.log(`[test] klasör: ${klasor}`);
});

test('başlatma kuralları: onay, canlı işaretli ortam ve tek bağlam profili (tarayıcı açılmadan red)', async () => {
  const ortamlar = (await api(`/platform/ortamlar?projeId=${projeId}`)).ortamlar as Nesne[];
  expect(ortamlar.find((o) => o.id === canliOrtamId)?.canli).toBe(true);
  expect(ortamlar.find((o) => o.id === ortamId)?.canli).toBe(false);
  expect(await api('/platform/tarama/baslat', kayitGovdesi({ onay: false }))).toMatchObject({ basarili: false, kod: 'ONAY_GEREKLI' });
  expect(await api('/platform/tarama/baslat', kayitGovdesi({ ortamId: canliOrtamId }))).toMatchObject({ basarili: false, kod: 'CANLI_ORTAM' });
  expect(await api('/platform/tarama/baslat', kayitGovdesi({ baglamProfilleri: ['Merkez', 'Yetkili'] }))).toMatchObject({ basarili: false, kod: 'PROFIL' });
  expect(uygulama.olaylar).toEqual([]);
});

/** Kayıt tarayıcısına bağlanır ve panelin açıldığı hedef sayfayı bulur. */
async function kayitSayfasi(isId: string, yolParcasi = '/basvuru/'): Promise<{ tarayici: Browser; sayfa: Page }> {
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
    const sayfa = tarayici.contexts().flatMap((b) => b.pages()).find((p) => p.url().includes(yolParcasi));
    if (sayfa && d.adimlar.find((a: Nesne) => a.anahtar === 'kayit')?.mesaj?.startsWith('Tarayıcıda akışı yürütün')) return { tarayici, sayfa };
    if (d.durum !== 'suruyor' || Date.now() > son) throw new Error(`kayıt sayfası açılmadı: ${JSON.stringify(d)}`);
    await new Promise((c) => setTimeout(c, 250));
  }
}

/** Kayıt bitene (tarayıcı kapanıp sonuç işlenene) kadar bekler. */
async function kayitBitti(isId: string): Promise<Nesne> {
  let d = await isDurumu(isId);
  for (const son = Date.now() + 30_000; d.durum === 'suruyor' && Date.now() < son; d = await isDurumu(isId)) await new Promise((c) => setTimeout(c, 250));
  return d;
}

test('kullanıcı akışı yürütür, panel alanları/düğmeleri/mesajı toplar; taslak diyagram tasarlanıp çok adımlı sayfa paketi olur (değer ve ekran görüntüsü yok)', async () => {
  test.setTimeout(180_000);
  const isId = String((await basarili('/platform/tarama/baslat', kayitGovdesi())).isId);
  kayitIsId = isId;
  const { tarayici, sayfa } = await kayitSayfasi(isId);
  try {
    const panel = sayfa.locator('#nobetci-kayit-paneli');
    await expect(panel.getByText('Nöbetçi · Akış kaydı')).toBeVisible();
    const secim = (etiket: RegExp) => panel.getByRole('group', { name: 'Görülen alanlar' }).locator('label').filter({ hasText: etiket }).locator('input[type="checkbox"]');
    // Açılışta ekran kendiliğinden okunur: görülen alanlar listelenir (dokunulmadı → işaretsiz).
    await expect(secim(/Ad Soyad/)).not.toBeChecked();
    // Dokunulan alan işaretlenir; "Sıfırla" (iki adımlı onay) toplananları siler ve ekranı yeniden okur.
    await sayfa.fill('#adSoyad', 'silinecek');
    await panel.getByRole('button', { name: 'Ekranı yeniden oku' }).click();
    await expect(secim(/Ad Soyad/)).toBeChecked();
    await panel.getByRole('button', { name: 'Sıfırla' }).click();
    await panel.getByRole('button', { name: 'Kayıt silinsin mi? Evet' }).click();
    await expect(secim(/Ad Soyad/)).not.toBeChecked();
    // Alanları doldur (Yetkili şubede indirim alanı görünür) ve ekranı oku.
    await expect(sayfa.locator('#indirim')).toBeVisible();
    await sayfa.selectOption('#urun', 'B');
    await sayfa.fill('#adSoyad', GIZLI_DEGER);
    await sayfa.check('input[name="odeme"][value="taksit"]');
    await sayfa.check('#kampanya');
    await sayfa.fill('#indirim', '12');
    await panel.getByRole('button', { name: 'Ekranı yeniden oku' }).click();
    for (const e of [/Ürün/, /Ad Soyad/, /Ödeme/, /Kampanya/, /İndirim/]) await expect(secim(e)).toBeChecked();
    await expect(secim(/Başlangıç/)).not.toBeChecked();
    await expect(secim(/Belge/)).not.toBeChecked();
    await goruntu(panel.locator('.p'), '01-panel-alan-secimi.png');
    await secim(/Başlangıç/).check(); // kullanıcı dokunmadığı ama akışa ait bir alanı listeye alır
    // Düğmeler (siteye gerçek istek gider) kendiliğinden listeye girer.
    await sayfa.click('#hesapla');
    await expect(sayfa.locator('#sonuc')).toContainText('Prim:');
    await expect(panel.getByText('“Hesapla”')).toBeVisible();
    await sayfa.click('#onayla');
    await expect(sayfa.locator('#onay-sonuc')).toContainText('Başvuru onaylandı');
    // Mesaj seçimi: tıklama siteye gitmez.
    const onceki = uygulama.olaylar.length;
    await panel.getByRole('button', { name: 'Mesaj seç' }).click();
    await sayfa.click('#onay-sonuc');
    await expect(panel.getByText(/“Başvuru onaylandı\. No/)).toBeVisible();
    expect(uygulama.olaylar.length).toBe(onceki);
    await goruntu(panel.locator('.p'), '02-panel-toplandi.png');
    await panel.getByRole('button', { name: 'Bitir', exact: true }).click();
    await expect(panel.getByText(/Listede 6 alan, 2 düğme, 1 mesaj var/)).toBeVisible();
    await goruntu(panel.locator('.p'), '03-panel-bitir.png');
    await panel.getByRole('button', { name: 'Bitir ve Nöbetçi’ye gönder' }).click();
  } finally {
    await tarayici.close().catch(() => undefined);
  }

  const d = await kayitBitti(isId);
  expect(d, JSON.stringify(d)).toMatchObject({ kip: 'kayit', durum: 'tamam', tasarim: true, paketHazir: false, baglamProfili: 'Yetkili' });
  expect(d.olaylar.map((o: Nesne) => o.mesaj)).toEqual(expect.arrayContaining(['Düğmeye basıldı: Hesapla', 'Düğmeye basıldı: Onayla']));
  // Taslak: alan grubu → Hesapla → Onayla → mesaj (değişken numara atılmış öneri) → Bitir.
  const akis = await api(`/platform/tarama/akis?id=${isId}`);
  const bloklar = akis.bloklar as Nesne[];
  const palet = akis.palet as Nesne;
  const etiketler = (b: Nesne): string[] => b.alanlar.map((a: string) => palet.alanlar.find((x: Nesne) => x.anahtar === a).etiket);
  expect(bloklar.map((b) => b.tur)).toEqual(['alanlar', 'aksiyon', 'aksiyon', 'mesaj', 'bitir']);
  expect(etiketler(bloklar[0])).toEqual(['Ürün', 'Ad Soyad', 'Başlangıç tarihi', 'Ödeme', 'Kampanya', 'İndirim oranı (%)']);
  expect([bloklar[1], bloklar[2]].map((b) => palet.dugmeler[b.dugme].metin)).toEqual(['Hesapla', 'Onayla']);
  expect(bloklar[3]).toEqual({ tur: 'mesaj', mesaj: 0, metin: 'Başvuru onaylandı. No' });
  expect(palet.alanlar.find((a: Nesne) => a.etiket === 'Belge')).toMatchObject({ secili: false, blok: null });
  // Hatalı diyagram reddedilir (bloğun sırasıyla hata).
  expect(await api('/platform/tarama/akis', { id: isId, bloklar: bloklar.slice(0, -1) }))
    .toMatchObject({ basarili: false, kod: 'AKIS_GECERSIZ', hatalar: [{ blok: null, mesaj: 'Akış “Bitir” bloğuyla bitmeli.' }] });
  // Tasarım: gruba ad; onay adımı boş bir grupla adlandırılır. Taslak saklanır, sonra pakete çevrilir.
  const tasarim = [{ ...bloklar[0], ad: 'Başvuru bilgileri' }, bloklar[1], { tur: 'alanlar', ad: 'Başvuru onaylanır', alanlar: [], zorunlu: [], kosullar: {} }, bloklar[2], bloklar[3], bloklar[4]];
  await basarili('/platform/tarama/akis', { id: isId, bloklar: tasarim, taslak: true });
  expect((await api(`/platform/tarama/akis?id=${isId}`)).bloklar).toEqual(tasarim);
  expect((await basarili('/platform/tarama/akis', { id: isId, bloklar: tasarim })).ozet).toMatchObject({ adimSayisi: 2, alanSayisi: 6 });
  expect(await isDurumu(isId)).toMatchObject({ paketHazir: true, tasarim: true });
  paket = (await api(`/platform/tarama/paket?id=${isId}`)).paket as Nesne;
  const [a1, a2] = paket.model.adimlar as Nesne[];
  expect(paket.model.semaSurumu).toBe(2);
  expect(paket.model.ekranUrl).toBe('/basvuru/');
  expect([a1.baslik, a2.baslik]).toEqual(['Başvuru bilgileri', 'Başvuru onaylanır']);
  const alanlar = (a: Nesne, yapilandirma: string): string[] => a.bolumler.flatMap((b: Nesne) => b.alanlar.filter((x: Nesne) => x.yapilandirma === yapilandirma).map((x: Nesne) => x.konum.secici)).sort();
  expect(alanlar(a1, 'senaryo')).toEqual(['#adSoyad', '#baslangic', '#indirim', '#kampanya', '#urun', 'input[type="radio"][name="odeme"]'].sort());
  // "İşlemler": ilerleme düğmeleri (aksiyon) ve son adımın sonuç öğesi (çıktı) — alanı olmayan onay adımı da geçerli.
  expect([alanlar(a1, 'aksiyon'), alanlar(a2, 'senaryo'), alanlar(a2, 'aksiyon'), alanlar(a2, 'cikti')]).toEqual([['#hesapla'], [], ['#onayla'], ['#onay-sonuc']]);
  expect(a1.kosu).toEqual({ aksiyonlar: [{ tur: 'tikla', secici: '#hesapla', aciklama: 'Hesapla' }], basariGostergesi: { tur: 'eleman', deger: '#onayla' } });
  // Son adım: gösterge metnindeki değişken numara ("No: 1001") atılır.
  expect(a2.kosu).toEqual({ aksiyonlar: [{ tur: 'tikla', secici: '#onayla', aciklama: 'Onayla' }], basariGostergesi: { tur: 'metin', deger: 'Başvuru onaylandı. No', secici: '#onay-sonuc' } });
  // Bağlam profili alanı (varsayılan: kaydın profili) — koşucu bağlamı bununla değiştirir.
  expect(paket.model.senaryoDuzeyi.alanlar).toEqual([expect.objectContaining({ id: 'baglamProfili', eslesme: { senaryo: 'baglamProfili', profilHavuzu: 'Şube' }, varsayilan: { deger: 'Yetkili' } })]);
  expect(paket.meta).toMatchObject({ olusturan: 'Nöbetçi akış kaydı', baglamProfilleri: ['Yetkili'] });
  // Gizlilik: girilen değer ve parola pakette/diyagramda/logda yok; ekran görüntüsü (kanıt) yok.
  const metin = JSON.stringify(paket) + JSON.stringify(akis);
  expect(metin).not.toContain(GIZLI_DEGER);
  expect(metin).not.toContain('silinecek');
  expect(metin).not.toContain(ORNEK_PAROLA);
  expect(paket.kanitlar).toBeUndefined();
  const log = readFileSync(join(klasor, 'sunucu.log'), 'utf8');
  expect(log).not.toContain(GIZLI_DEGER);
  expect(log).toContain('Akış kaydı başlatıldı');
  // Kayıtta kullanıcının kendisi bastığı için gerçek istekler gitti (1 hesaplama + 1 onay) — değerler uygulamaya ulaştı.
  expect(uygulama.hesaplamalar).toEqual([expect.objectContaining({ urun: 'B', adSoyad: GIZLI_DEGER, odeme: 'taksit', indirim: '12', sube: 'S02' })]);
  expect(uygulama.onaylar).toHaveLength(1);
});

test('kayıttan çıkan model kabul edilir; formdan senaryo oluşturulur ve Nöbetçi koşusu başarılı', async () => {
  test.setTimeout(180_000);
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  const ekran = liste.ekranlar.find((e) => e.ad === 'Kayıtlı Başvuru') as Nesne;
  kayitEkranId = String(ekran.id);
  expect(ekran).toMatchObject({ modelVar: true, olusturulabilir: true });
  const id = (secici: string): string => String((paket.model.adimlar[0].bolumler as Nesne[]).flatMap((b) => b.alanlar).find((x: Nesne) => x.konum.secici === secici).id);
  const yeni = await basarili('/platform/senaryo/kaydet', {
    projeId, ekranId: ekran.id, baslik: 'Kayıttan / Yetkili / peşin', ortamIdleri: [ortamId],
    veri: { [id('#urun')]: 'A', [id('#adSoyad')]: 'Koşu Kişi', [id('input[type="radio"][name="odeme"]')]: 'pesin', [id('#kampanya')]: false, [id('#indirim')]: '5', baglamProfili: 'Yetkili' }
  });
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
  expect(y.basarili, y.mesaj).toBe(true);
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect((sonuc.adimlar as Nesne[]).map((a) => a.ad)).toEqual(expect.arrayContaining(['Başvuru bilgileri', 'Başvuru onaylanır']));
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ urun: 'A', adSoyad: 'Koşu Kişi', odeme: 'pesin', indirim: '5', sube: 'S02' });
  expect(uygulama.onaylar).toHaveLength(2);
  expect(uygulama.olaylar.filter((o) => SIRKET_DESENI.test(o))).toEqual([]);
});

test('arayüz: ekranda "Akışı kaydet" diyaloğu (canlı ortam seçilemez, onaysız başlamaz) ve akış diyagramı oluştur sayfası (taşı, ekle, sil, hata, önizleme)', async () => {
  test.setTimeout(120_000);
  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    const istekler: string[] = [];
    baglam.on('request', (r) => { istekler.push(r.url()); });
    const page = await baglam.newPage();
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(kayitEkranId)}`);
    await page.getByRole('button', { name: 'Akışı kaydet' }).first().click();
    const diyalog = page.locator('dialog[open]');
    await expect(diyalog.getByText('Akışı siz yürütürsünüz: bastığınız düğmeler siteye GERÇEK istek gönderir.')).toBeVisible();
    await expect(diyalog.locator('option', { hasText: 'Üretim (canlı — kayıt kapalı)' })).toBeDisabled();
    const baslat = diyalog.getByRole('button', { name: 'Kaydı başlat' });
    await expect(baslat).toBeDisabled();
    // "Giriş yapmadan aç": bağlam profili seçilemez.
    await diyalog.getByText('Giriş yapmadan aç', { exact: true }).click();
    await expect(diyalog.getByLabel('Bağlam profili')).toBeDisabled();
    await diyalog.getByText('Giriş yapmadan aç', { exact: true }).click();
    await diyalog.getByLabel('Bağlam profili').selectOption('Yetkili');
    await diyalog.getByText('Anladım; bastığım düğmeler siteye gerçek istek gönderecek.').click();
    await expect(baslat).toBeEnabled();
    await goruntu(diyalog, '04-kayit-diyalogu.png');
    await diyalog.getByRole('button', { name: 'Vazgeç' }).click();
    // Tamamlanan kaydın sayfası: akış diyagramı (kaydedilen tasarım) açılır.
    await page.goto(`/#/ekranlar/tarama/${encodeURIComponent(kayitIsId)}`);
    await expect(page.getByRole('heading', { name: 'Akış diyagramı: Kayıtlı Başvuru' })).toBeVisible({ timeout: 15_000 });
    const diyagram = page.getByRole('list', { name: 'Akış diyagramı' });
    const blok = (ad: string) => diyagram.getByRole('listitem', { name: ad, exact: true });
    const grup1 = blok('1. blok: Alan grubu (Başvuru bilgileri)');
    const grup2 = blok('3. blok: Alan grubu (Başvuru onaylanır)');
    await expect(grup1.getByRole('list', { name: 'Doldurulacak alanlar' }).getByRole('listitem')).toHaveCount(6);
    await expect(blok('2. blok: Aksiyon').getByRole('combobox', { name: 'Basılacak düğme' })).toHaveValue('0');
    await expect(blok('5. blok: Beklenen mesaj').getByRole('textbox', { name: 'Aranacak metin' })).toHaveValue('Başvuru onaylandı. No');
    await goruntu(page.locator('main'), '04b-akis-diyagrami-olustur.png');
    // Etkin gruba "Ekle": alan diğer gruptan taşınır; sürükleyip bırakınca geri gelir.
    await grup2.click();
    await page.getByRole('button', { name: 'Başlangıç tarihi: etkin gruba ekle' }).click();
    await expect(grup2).toContainText('Başlangıç tarihi');
    await expect(grup1).not.toContainText('Başlangıç tarihi');
    await page.locator('.palet-ogesi', { hasText: 'Başlangıç tarihi' }).dragTo(grup1);
    await expect(grup1).toContainText('Başlangıç tarihi');
    await expect(grup2).not.toContainText('Başlangıç tarihi');
    // "+" ile boş bir mesaj bloğu: kaydederken bloğun altında hata; silince kaydedilir.
    await diyagram.getByRole('button', { name: 'Buraya blok ekle' }).nth(5).click();
    await diyagram.getByRole('button', { name: 'Beklenen mesaj', exact: true }).click();
    await page.getByRole('button', { name: 'Kaydet ve önizle' }).click();
    const bos = blok('6. blok: Beklenen mesaj');
    await expect(bos).toContainText('Beklenen mesajın aranacak metnini yazın.');
    await bos.getByRole('button', { name: 'Bloğu sil' }).click();
    // Alan zorunluluğu (varsayılan: sayfanın zorunluluğu → görünürse doldur) ve "Hesapla"dan sonra 2 sn bekleme.
    const adSoyad = grup1.getByRole('button', { name: 'Ad Soyad: zorunlu' });
    await expect(adSoyad).toHaveText('Görünürse doldur');
    await adSoyad.click();
    await expect(grup1.getByRole('button', { name: 'Ad Soyad: zorunlu' })).toHaveAttribute('aria-pressed', 'true');
    // Koşul: İndirim oranı yalnız Ödeme = Taksitli iken görünür (seçenek işaretlenmeden kaydedilmez).
    await grup1.getByRole('button', { name: 'İndirim oranı (%): koşul' }).click();
    const duz = grup1.locator('.kosul-duzenleyici');
    await duz.getByRole('combobox', { name: 'Koşulun seçim alanı' }).selectOption({ label: 'Ödeme' });
    await duz.getByRole('button', { name: 'Koşulu kaydet' }).click();
    await expect(duz.getByRole('alert')).toHaveText('Alanın görünür olduğu en az bir seçeneği işaretleyin.');
    await duz.getByLabel('Taksitli').check();
    await goruntu(page.locator('main'), '04d-kosul-duzenleyici.png');
    await duz.getByRole('button', { name: 'Koşulu kaydet' }).click();
    await expect(grup1.getByRole('button', { name: 'İndirim oranı (%): koşul' })).toHaveText('Ödeme = Taksitli ise');
    await diyagram.getByRole('button', { name: 'Buraya blok ekle' }).nth(2).click();
    await diyagram.getByRole('button', { name: 'Bekleme süresi', exact: true }).click();
    const saniye = blok('3. blok: Bekleme süresi').getByRole('spinbutton', { name: 'Saniye' });
    await saniye.fill('2');
    await saniye.press('Tab');
    await goruntu(page.locator('main'), '04c-zorunlu-bekleme.png');
    await page.getByRole('button', { name: 'Kaydet ve önizle' }).click();
    // Önizleme bandı kayıt özetini gösterir; "Diyagrama dön" düzenlemeye geri götürür.
    await expect(page.getByText(/Kayıt tamamlandı: 2 adım, 6 alan/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('akış kaydı sonucu (sayfa paketi, sürüm 1)')).toBeVisible();
    await goruntu(page.locator('main'), '05-kayit-onizleme.png');
    const onizlenen = ((await api(`/platform/tarama/paket?id=${kayitIsId}`)).paket as Nesne).model.adimlar[0] as Nesne;
    expect(onizlenen.kosu.aksiyonlar).toEqual([{ tur: 'tikla', secici: '#hesapla', aciklama: 'Hesapla' }, { tur: 'bekle', sureSn: 2 }]);
    const onizlenenAlanlar = onizlenen.bolumler.flatMap((b: Nesne) => b.alanlar) as Nesne[];
    expect(onizlenenAlanlar.find((x) => x.konum.secici === '#adSoyad')).toMatchObject({ zorunlu: true, mutlakaGorunmeli: true });
    const indirim = onizlenenAlanlar.find((x) => x.konum.secici === '#indirim') as Nesne;
    const odemeId = (onizlenenAlanlar.find((x) => String(x.konum.secici).includes('odeme')) as Nesne).id;
    const onizlenenModel = ((await api(`/platform/tarama/paket?id=${kayitIsId}`)).paket as Nesne).model as Nesne;
    expect(onizlenenModel.kosullar[indirim.gorunurluk.kosul].ifade).toEqual({ alan: odemeId, esit: 'taksit' });
    await page.getByRole('button', { name: 'Diyagrama dön' }).click();
    await expect(page.getByRole('heading', { name: 'Akış diyagramı: Kayıtlı Başvuru' })).toBeVisible();
    await expect(blok('3. blok: Bekleme süresi')).toBeVisible();
    expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  } finally {
    await tarayici.close();
  }
});

test('girişsiz kayıt: giriş yapılmaz; seçim değişince ekran kendiliğinden okunur; tasarımda isteğe bağlı aksiyon ve aranacak metin', async () => {
  test.setTimeout(180_000);
  const oncekiGirisler = uygulama.olaylar.filter((o) => o.includes('/giris') || o.includes('/dogrulama')).length;
  const isId = String((await basarili('/platform/tarama/baslat', {
    kip: 'kayit', projeId, ortamId, ekranAdi: 'Açık Teklif', ekranAnahtari: 'acik-teklif', hedef: '/acik-teklif/', baglamProfilleri: [], onay: true, girissiz: true
  })).isId);
  const { tarayici, sayfa } = await kayitSayfasi(isId, '/acik-teklif/');
  try {
    const panel = sayfa.locator('#nobetci-kayit-paneli');
    const satir = (etiket: RegExp) => panel.getByRole('group', { name: 'Görülen alanlar' }).locator('label').filter({ hasText: etiket });
    await expect(satir(/TC kimlik no/)).toBeVisible();
    await sayfa.fill('#musteriAd', GIZLI_DEGER);
    await sayfa.fill('#tcKimlik', 'Kayit-TC-Degeri');
    await panel.getByRole('button', { name: 'Ekranı yeniden oku' }).click();
    await expect(satir(/TC kimlik no/).locator('input')).toBeChecked();
    // Seçim değişince ekran kendiliğinden okunur: Vergi kimlik no listeye gelir, TC kimlik no "şu an görünmüyor".
    await sayfa.check('input[name="tip"][value="kurumsal"]');
    await expect(satir(/Vergi kimlik no/)).toBeVisible();
    await expect(satir(/TC kimlik no/)).toContainText('şu an görünmüyor');
    await sayfa.fill('#vergiNo', 'Kayit-VKN-Degeri');
    await goruntu(panel.locator('.p'), '06-panel-secime-gore.png');
    // Düğmeden sonra da okunur: açılan "Ek sürücü adı" listeye gelir.
    await sayfa.click('#ekSurucuEkle');
    await expect(satir(/Ek sürücü adı/)).toBeVisible();
    await sayfa.fill('#ekSurucuAd', 'Kayit-Ek-Surucu');
    await sayfa.click('#devam');
    await expect(satir(/^Teminat/)).toBeVisible();
    // Kullanıcı yeni alan açılışlarında ekranı okur: önce "Dar", sonra "Geniş" (Cam kırılması belirir).
    await sayfa.selectOption('#teminat', 'dar');
    await panel.getByRole('button', { name: 'Ekranı yeniden oku' }).click();
    await sayfa.selectOption('#teminat', 'genis');
    await expect(satir(/Cam kırılması/)).toBeVisible();
    await sayfa.check('#ekTeminat');
    await sayfa.click('#kaydet');
    await expect(sayfa.locator('#teklif-sonuc')).toContainText('Teklif oluşturuldu');
    await panel.getByRole('button', { name: 'Mesaj seç' }).click();
    await sayfa.click('#teklif-sonuc');
    await expect(panel.getByText(/“Teklif oluşturuldu\. No/)).toBeVisible();
    await goruntu(panel.locator('.p'), '07-panel-teklif.png');
    await panel.getByRole('button', { name: 'Bitir', exact: true }).click();
    await panel.getByRole('button', { name: 'Bitir ve Nöbetçi’ye gönder' }).click();
  } finally {
    await tarayici.close().catch(() => undefined);
  }
  const d = await kayitBitti(isId);
  expect(d, JSON.stringify(d)).toMatchObject({ kip: 'kayit', durum: 'tamam', tasarim: true, baglamProfili: null });
  expect(d.adimlar.find((a: Nesne) => a.anahtar === 'giris')).toMatchObject({ durum: 'atlandi' });
  // Giriş yapılmadı (giriş/doğrulama sayfalarına istek yok).
  expect(uygulama.olaylar.filter((o) => o.includes('/giris') || o.includes('/dogrulama')).length).toBe(oncekiGirisler);
  // Taslak: her düğme bir aksiyon, aradaki alanlar bir grup.
  const akis = await api(`/platform/tarama/akis?id=${isId}`);
  const b = akis.bloklar as Nesne[];
  const palet = akis.palet as Nesne;
  const etiketler = (x: Nesne): string[] => x.alanlar.map((a: string) => palet.alanlar.find((p: Nesne) => p.anahtar === a).etiket);
  expect(b.map((x) => x.tur)).toEqual(['alanlar', 'aksiyon', 'alanlar', 'aksiyon', 'alanlar', 'aksiyon', 'mesaj', 'bitir']);
  expect([b[0], b[2], b[4]].map(etiketler)).toEqual([['Ad Soyad', 'Müşteri tipi', 'TC kimlik no', 'Vergi kimlik no'], ['Ek sürücü adı'], ['Teminat', 'Cam kırılması']]);
  expect([b[1], b[3], b[5]].map((x) => palet.dugmeler[x.dugme].metin)).toEqual(['Ek sürücü ekle', 'Devam', 'Teklifi kaydet']);
  // Tasarım: "Ek sürücü ekle" her senaryoda basılmaz; grup adları; aranacak metin kullanıcıdan.
  // Ad Soyad ve Vergi kimlik no zorunlu (vergi no yalnızca Kurumsal'da görünür: koşul sağlanınca zorunlu); "Devam"dan sonra 1 sn.
  const zorunlu = [b[0].alanlar[0], b[0].alanlar[3]];
  expect(b[0].zorunlu).toEqual([]);
  const tasarim = [{ ...b[0], ad: 'Müşteri bilgileri', zorunlu }, { ...b[1], istegeBagli: true }, b[2], b[3], { tur: 'bekle', saniye: 1 }, { ...b[4], ad: 'Teminat' }, b[5], { ...b[6], metin: 'Teklif oluşturuldu' }, b[7]];
  await basarili('/platform/tarama/akis', { id: isId, bloklar: tasarim });
  acikPaket = (await api(`/platform/tarama/paket?id=${isId}`)).paket as Nesne;
  const m = acikPaket.model as Nesne;
  expect(m.girisGerekmez).toBe(true);
  expect(m.adimlar.map((a: Nesne) => a.baslik)).toEqual([
    'Müşteri bilgileri', 'Müşteri bilgileri: Ek sürücü ekle', 'Müşteri bilgileri: Ek sürücü ekle sonrası', 'Müşteri bilgileri: Devam', 'Teminat'
  ]);
  const [ilk, dugme, sonrasi, devam, teminat] = m.adimlar as Nesne[];
  const seciciler = (a: Nesne): string[] => a.bolumler.flatMap((b: Nesne) => b.alanlar.filter((x: Nesne) => x.yapilandirma === 'senaryo').map((x: Nesne) => x.konum.secici));
  expect(seciciler(ilk).sort()).toEqual(['#musteriAd', '#tcKimlik', '#vergiNo', 'input[type="radio"][name="tip"]']);
  // Seçime göre görünürlük: okumalar arasında değişen tek seçim (müşteri tipi) → koşul.
  const alan = (a: Nesne, secici: string): Nesne => a.bolumler.flatMap((b: Nesne) => b.alanlar).find((x: Nesne) => x.konum.secici === secici);
  const tipId = alan(ilk, 'input[type="radio"][name="tip"]').id;
  expect(m.kosullar[alan(ilk, '#tcKimlik').gorunurluk.kosul].ifade).toEqual({ alan: tipId, esit: 'bireysel' });
  expect(m.kosullar[alan(ilk, '#vergiNo').gorunurluk.kosul].ifade).toEqual({ alan: tipId, esit: 'kurumsal' });
  expect(alan(ilk, '#musteriAd').gorunurluk).toBeUndefined();
  expect(ilk.kosu).toBeUndefined();
  // Senaryoda seçilen düğme: kendi adımı + açtığı alanlar aynı koşula bağlı isteğe bağlı adımlar.
  expect(dugme.kosu).toEqual({ aksiyonlar: [{ tur: 'tikla', secici: '#ekSurucuEkle', aciklama: 'Ek sürücü ekle' }], basariGostergesi: { tur: 'eleman', deger: '#ekSurucuAd' } });
  expect(seciciler(sonrasi)).toEqual(['#ekSurucuAd']);
  expect(dugme.gorunurluk).toEqual(sonrasi.gorunurluk);
  expect(m.kosullar[dugme.gorunurluk.kosul]).toMatchObject({ ifade: { senaryoAyari: 'ekSurucuEkleDahil', esit: true } });
  expect(m.senaryoDuzeyi.alanlar).toEqual([expect.objectContaining({ id: 'ekSurucuEkleDahil', tip: 'onayKutusu', etiket: { ekran: null, form: '“Ek sürücü ekle” dahil' } })]);
  // İlerleme, isteğe bağlı parçadan sonra ayrı adım (atlansa da basılır); gösterge: kullanıcının metni.
  expect(devam.gorunurluk).toBeUndefined();
  expect(devam.kosu).toEqual({ aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }, { tur: 'bekle', sureSn: 1 }], basariGostergesi: { tur: 'eleman', deger: '#teminat' } });
  expect([alan(ilk, '#musteriAd'), alan(ilk, '#vergiNo'), alan(ilk, '#tcKimlik')].map((x) => [x.zorunlu, x.mutlakaGorunmeli ?? false])).toEqual([[true, true], [true, true], [false, false]]);
  expect(teminat.kosu).toEqual({ aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Teklifi kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Teklif oluşturuldu', secici: '#teklif-sonuc' } });
  expect(seciciler(teminat)).toEqual(['#teminat', '#ekTeminat']);
  expect(m.kosullar[alan(teminat, '#ekTeminat').gorunurluk.kosul].ifade).toEqual({ alan: alan(teminat, '#teminat').id, esit: 'genis' });
  expect(JSON.stringify(acikPaket)).not.toContain(GIZLI_DEGER);
  expect(JSON.stringify(acikPaket)).not.toContain('Kayit-Ek-Surucu');
  expect(JSON.stringify(acikPaket)).not.toContain('Kayit-TC-Degeri');
  expect(JSON.stringify(acikPaket)).not.toContain('Kayit-VKN-Degeri');
});

test('girişsiz model: ek sürücülü ve ek sürücüsüz iki senaryo formdan oluşturulur, ikisi de girişsiz koşar', async () => {
  test.setTimeout(180_000);
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: acikPaket, senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  const ekran = liste.ekranlar.find((e) => e.ad === 'Açık Teklif') as Nesne;
  // Senaryo formunda "Ek sürücü ekle dahil" isteğe bağlı adım kapsamı olarak görünür.
  const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekran.id}&ortamId=${ortamId}`) as Nesne;
  expect(form.olusturulabilir).toBe(true);
  const alanlar = (acikPaket.model.adimlar as Nesne[]).flatMap((a) => a.bolumler.flatMap((b: Nesne) => b.alanlar));
  const id = (secici: string): string => String(alanlar.find((x: Nesne) => x.konum.secici === secici).id);
  const ortak = { [id('#musteriAd')]: 'Koşu Müşteri' };
  const oncekiGirisler = uygulama.olaylar.filter((o) => o.includes('/giris') || o.includes('/dogrulama')).length;
  for (const [baslik, veri] of [
    ['Açık / kurumsal / ek sürücülü / geniş', {
      ...ortak, [id('input[type="radio"][name="tip"]')]: 'kurumsal', [id('#vergiNo')]: 'VKN-1',
      ekSurucuEkleDahil: true, [id('#ekSurucuAd')]: 'Ek Kişi', [id('#teminat')]: 'genis', [id('#ekTeminat')]: true
    }],
    ['Açık / bireysel / ek sürücüsüz / dar', {
      ...ortak, [id('input[type="radio"][name="tip"]')]: 'bireysel', [id('#tcKimlik')]: 'TC-1', ekSurucuEkleDahil: false, [id('#teminat')]: 'dar'
    }]
  ] as const) {
    const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId: ekran.id, baslik, ortamIdleri: [ortamId], veri });
    acikSenaryoIdleri.push(String(yeni.id));
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, `${baslik}: ${JSON.stringify(sonuc.hataMesaji)}`).toBe('basarili');
    expect((sonuc.adimlar as Nesne[]).map((a) => a.ad)).not.toContain('Sisteme giriş yapılır');
  }
  // Koşucu seçilen tipin alanını doldurdu, görünmeyeni atladı; ek teminat yalnızca "Geniş"te.
  expect(uygulama.acikTeklifler.slice(-2)).toEqual([
    { musteriAd: 'Koşu Müşteri', tip: 'kurumsal', tcKimlik: null, vergiNo: 'VKN-1', ekSurucuAd: 'Ek Kişi', teminat: 'genis', ekTeminat: true },
    { musteriAd: 'Koşu Müşteri', tip: 'bireysel', tcKimlik: 'TC-1', vergiNo: null, ekSurucuAd: null, teminat: 'dar', ekTeminat: null }
  ]);
  expect(uygulama.olaylar.filter((o) => o.includes('/giris') || o.includes('/dogrulama')).length).toBe(oncekiGirisler);
});

test('akış diyagramı: senaryonun akışı formdaki seçimlerle çizilir, adımlar son koşunun sonucuyla renklenir (salt okunur)', async () => {
  test.setTimeout(120_000);
  const bireyselId = acikSenaryoIdleri[1];
  expect(bireyselId).toBeTruthy();
  const son = (await api(`/platform/senaryo/son-sonuc?id=${bireyselId}&ortamId=${ortamId}`)).sonuc as Nesne;
  expect(son).toMatchObject({ durum: 'basarili' });
  expect((son.adimlar as Nesne[]).map((a) => a.ad)).toEqual(expect.arrayContaining(['Ekran açılır', 'Müşteri bilgileri', 'Teminat']));
  expect(JSON.stringify(son)).not.toContain('TC-1');
  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1600 }, colorScheme: 'dark' });
    const page = await baglam.newPage();
    await page.goto(`/#/senaryolar/duzenle/${encodeURIComponent(bireyselId)}`);
    await page.getByRole('tab', { name: 'Akış diyagramı' }).click();
    const d = page.locator('.akis-diyagrami');
    await expect(d.getByText('Renkler: Deneme ortamındaki son koşu')).toBeVisible();
    const dugum = (baslik: string) => d.locator('.diyagram-dugumu').filter({ has: page.getByRole('heading', { name: baslik, exact: true }) });
    await expect(dugum('Başlangıç')).toHaveClass(/durum-basari/);
    await expect(dugum('Başlangıç')).toContainText('Ekran açılır (giriş gerekmez)');
    await expect(dugum('Müşteri bilgileri')).toHaveClass(/durum-basari/);
    // Seçime bağlı alanlar: bu senaryoda (bireysel) vergi numarası görünmez, TC görünür.
    const musteri = dugum('Müşteri bilgileri');
    await expect(musteri.locator('.diyagram-alani.gizli')).toHaveCount(1);
    await expect(musteri.locator('.diyagram-alani.gizli')).toContainText(/Vergi kimlik no.*= Kurumsal \(bu senaryoda değil\)$/);
    await expect(musteri.locator('.diyagram-alani.kosullu:not(.gizli)')).toContainText(/TC kimlik no.*= Bireysel$/);
    // Ek sürücü adımları bu senaryoda koşulmaz; "Devam" ve "Teklifi kaydet" bağlantılarda.
    await expect(dugum('Müşteri bilgileri: Ek sürücü ekle')).toHaveClass(/disarida/);
    await expect(dugum('Müşteri bilgileri: Ek sürücü ekle')).toContainText('bu senaryoda koşulmaz');
    await expect(d.getByText('“Devam” düğmesine basılır, 1 sn beklenir')).toBeVisible();
    await expect(musteri.locator('.diyagram-alani', { hasText: 'Ad Soyad' })).toContainText('zorunlu');
    await expect(d.getByText('“Teklifi kaydet” düğmesine basılır')).toBeVisible();
    await expect(dugum('Teminat')).toHaveClass(/durum-basari/);
    await expect(dugum('Beklenen sonuç: başarı')).toContainText('“Teklif oluşturuldu” metni görünür');
    await expect(d.locator('input, select, textarea')).toHaveCount(0);
    await goruntu(d, '09-akis-diyagrami.png');
    // Formda "Ek sürücü ekle" dahil edilince diyagram kaydetmeden güncellenir: adımlar artık koşulur, son koşuda yoktu.
    await page.getByRole('tab', { name: 'Form' }).click();
    await page.getByRole('switch', { name: '“Ek sürücü ekle” dahil' }).first().check();
    await page.getByRole('tab', { name: 'Akış diyagramı' }).click();
    await expect(dugum('Müşteri bilgileri: Ek sürücü ekle')).not.toHaveClass(/disarida/);
    await expect(dugum('Müşteri bilgileri: Ek sürücü ekle')).toContainText('Koşulmadı');
    await expect(dugum('Müşteri bilgileri: Ek sürücü ekle sonrası')).toContainText('Ek sürücü adı');
    await expect(dugum('Müşteri bilgileri')).toHaveClass(/durum-basari/);
    // Ekran sayfasının "Akış" sekmesi: ekranın güncel akışı (tüm senaryolar; senaryo seçimi ve koşu rengi yok).
    const ekranlar = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Nesne[];
    const acikEkran = ekranlar.find((e) => e.ad === 'Açık Teklif') as Nesne;
    // Form kaydedilmeden sayfadan çıkılıyor: "Değişiklikleriniz kaydedilmeyecek" onayı.
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(String(acikEkran.id))}/akis`);
    await page.getByRole('dialog', { name: 'Değişiklikleriniz kaydedilmeyecek' }).getByRole('button', { name: 'Kaydetmeden çık' }).click();
    await expect(page.getByRole('tab', { name: /^Akış/ })).toHaveAttribute('aria-selected', 'true');
    const ea = page.getByRole('region', { name: 'Ekranın akışı' });
    await expect(ea.getByText('Ekranın akışı (tüm senaryolar).', { exact: false })).toBeVisible();
    const ed = (baslik: string) => ea.locator('.diyagram-dugumu').filter({ has: page.getByRole('heading', { name: baslik, exact: true }) });
    await expect(ed('Müşteri bilgileri: Ek sürücü ekle')).toContainText('isteğe bağlı: “Ek sürücü ekle” dahil');
    await expect(ed('Müşteri bilgileri: Ek sürücü ekle')).not.toHaveClass(/disarida/);
    await expect(ed('Müşteri bilgileri').locator('.diyagram-alani', { hasText: 'Vergi kimlik no' })).toContainText('= Kurumsal');
    await expect(ea.locator('.diyagram-alani.gizli')).toHaveCount(0);
    await expect(ed('Beklenen sonuç: başarı')).toContainText('“Teklif oluşturuldu” metni görünür');
    await expect(page.getByRole('button', { name: 'Düzenle', exact: true })).toBeVisible();
    await goruntu(page.locator('main'), '10-ekran-akis-sekmesi.png');
  } finally {
    await tarayici.close();
  }
});

test('çoklu akış: Akışlar sekmesinde kopyadan yeni akış; senaryo akışını seçer ve o akışla koşar; varsayılan değişince eski senaryolar akışında kalır', async () => {
  test.setTimeout(180_000);
  const ekranlar = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Nesne[];
  const ekranId = String((ekranlar.find((e) => e.ad === 'Açık Teklif') as Nesne).id);
  // Başlangıç: tek, örtük "Ana akış" (iki senaryo onu kullanır).
  expect(await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`)).toMatchObject({
    duzenlenebilir: true, akislar: [{ id: 'ana', ad: 'Ana akış', varsayilan: true, senaryoSayisi: 2 }]
  });
  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1400 }, colorScheme: 'dark' });
    const page = await baglam.newPage();
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/akis`);
    await expect(page.getByRole('tab', { name: /^Akışlar/ })).toHaveAttribute('aria-selected', 'true');
    const liste = page.getByRole('list', { name: 'Akışlar' });
    await expect(liste.getByRole('listitem')).toHaveCount(1);
    await expect(liste).toContainText('Ana akış');
    // Yeni akış: ad + "Şu akıştan kopyala" → diyagram düzenleyicisi (yalnızca bu ekranın alanları).
    await page.getByRole('button', { name: 'Yeni akış oluştur' }).click();
    await page.getByRole('textbox', { name: 'Yeni akışın adı' }).fill('Kurumsal teklif');
    await page.getByText('Şu akıştan kopyala').click();
    await page.getByRole('button', { name: 'Oluştur', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Yeni akış' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Akış adı' })).toHaveValue('Kurumsal teklif');
    const diyagram = page.getByRole('list', { name: 'Akış diyagramı' });
    const grup1 = diyagram.getByRole('listitem', { name: '1. blok: Alan grubu (Müşteri bilgileri)', exact: true });
    await expect(grup1).toContainText('Vergi kimlik no');
    // Kopyadan gelen koşullar ve zorunluluk korunur.
    await expect(grup1.getByRole('button', { name: 'Vergi kimlik no: koşul' })).toHaveText('Müşteri tipi = Kurumsal ise');
    await expect(grup1.getByRole('button', { name: 'Ad Soyad: zorunlu' })).toHaveText('Zorunlu');
    await grup1.getByRole('button', { name: 'TC kimlik no: gruptan çıkar' }).click();
    await expect(grup1).not.toContainText('TC kimlik no');
    // Grup içi sıra: sol üstte doldurma sırası; ↑ ile ikinci alan başa geçer (sonra geri alınır).
    const cipler = grup1.locator('.tasarim-alani');
    await expect(cipler.first().locator('.alan-sirasi')).toHaveText('1');
    const ikinci = await cipler.nth(1).locator('.ad').innerText();
    await expect(cipler.first().getByRole('button', { name: /: yukarı taşı$/ })).toBeDisabled();
    await cipler.nth(1).getByRole('button', { name: /: yukarı taşı$/ }).click();
    await expect(cipler.first().locator('.ad')).toHaveText(ikinci);
    await expect(cipler.nth(1).locator('.alan-sirasi')).toHaveText('2');
    await cipler.first().getByRole('button', { name: /: aşağı taşı$/ }).click();
    await expect(cipler.nth(1).locator('.ad')).toHaveText(ikinci);
    // Kaydedilmemiş değişiklikle sayfadan çıkılırken uyarı; vazgeçilince düzenleyicide kalınır.
    await page.locator('.kirinti').getByRole('link', { name: 'Ekranlar' }).click();
    const cikisOnayi = page.locator('dialog.onay-diyalogu');
    await expect(cikisOnayi.getByRole('heading', { name: 'Değişiklikler kaydedilmedi' })).toBeVisible();
    await cikisOnayi.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(cikisOnayi).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Yeni akış' })).toBeVisible();
    await expect(grup1).not.toContainText('TC kimlik no');
    await goruntu(page.locator('main'), '11-yeni-akis-duzenleyici.png');
    await page.getByRole('button', { name: 'Akışı oluştur' }).click();
    const onay = page.locator('dialog.onay-diyalogu');
    await expect(onay.getByRole('heading', { name: '“Kurumsal teklif” akışı oluşturulsun mu?' })).toBeVisible();
    await onay.getByRole('button', { name: 'Oluştur', exact: true }).click();
    // Liste: iki akış, yeni akış seçili; diyagramında TC yok.
    await expect(liste.getByRole('listitem')).toHaveCount(2);
    await expect(page.locator('.akis-eylemleri h3')).toHaveText('Kurumsal teklif');
    const ea = page.getByRole('region', { name: 'Ekranın akışı' });
    await expect(ea).toContainText('Vergi kimlik no');
    await expect(ea).not.toContainText('TC kimlik no');
    await goruntu(page.locator('main'), '12-akislar-sekmesi.png');
    // Yeni senaryo formu: önce akış seçilir (varsayılan önde); "Kurumsal teklif"te TC alanı yok.
    await page.goto(`/#/senaryolar/yeni/${encodeURIComponent(ekranId)}`);
    const akisSecimi = page.getByRole('combobox', { name: 'Akış' });
    await expect(akisSecimi.locator('option')).toHaveText(['Ana akış (varsayılan)', 'Kurumsal teklif']);
    // Ana akışta TC alanı formda (koşullu: Müşteri tipi seçilince görünür); Kurumsal teklif akışında hiç yok.
    await expect(page.getByText('TC kimlik no', { exact: true })).toHaveCount(1);
    await akisSecimi.selectOption({ label: 'Kurumsal teklif' });
    await expect(page.getByRole('combobox', { name: 'Akış' })).toHaveValue('kurumsalTeklif');
    await expect(page.getByText('TC kimlik no', { exact: true })).toHaveCount(0);
    await goruntu(page.locator('main'), '13-senaryo-akis-secimi.png');
  } finally {
    await tarayici.close();
  }
  // Yeni akışta senaryo: akış içerikte saklanır, koşu o akışın adımlarıyla.
  const akislar = (await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`)).akislar as Nesne[];
  expect(akislar.map((a) => [a.id, a.ad, a.varsayilan, a.senaryoSayisi])).toEqual([['ana', 'Ana akış', true, 2], ['kurumsalTeklif', 'Kurumsal teklif', false, 0]]);
  const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}&akisId=kurumsalTeklif`) as Nesne;
  expect(form.akisId).toBe('kurumsalTeklif');
  const alanlar = (form.model.adimlar as Nesne[]).flatMap((a) => a.bolumler.flatMap((b: Nesne) => b.alanlar));
  expect(alanlar.map((x: Nesne) => x.konum?.secici)).not.toContain('#tcKimlik');
  const id = (secici: string): string => String(alanlar.find((x: Nesne) => x.konum?.secici === secici).id);
  const yeni = await basarili('/platform/senaryo/kaydet', {
    projeId, ekranId, akisId: 'kurumsalTeklif', baslik: 'Kurumsal akış / dar', ortamIdleri: [ortamId],
    veri: { [id('#musteriAd')]: 'Akış Müşteri', [id('input[type="radio"][name="tip"]')]: 'kurumsal', [id('#vergiNo')]: 'VKN-9', ekSurucuEkleDahil: false, [id('#teminat')]: 'dar' }
  });
  expect(((await api(`/platform/senaryo?id=${yeni.id}&ortamId=${ortamId}`)).senaryo as Nesne).akis).toBe('kurumsalTeklif');
  const satir = ((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[]).find((x) => x.id === yeni.id) as Nesne;
  expect(satir.akis).toEqual({ id: 'kurumsalTeklif', ad: 'Kurumsal teklif' });
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
  expect(y.basarili, y.mesaj).toBe(true);
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.acikTeklifler.at(-1)).toMatchObject({ musteriAd: 'Akış Müşteri', tip: 'kurumsal', vergiNo: 'VKN-9', teminat: 'dar' });
  // Olmayan akış reddedilir.
  expect(await api('/platform/senaryo/kaydet', { projeId, ekranId, akisId: 'yok', baslik: 'X', ortamIdleri: [ortamId], veri: {} })).toMatchObject({ basarili: false, mesaj: 'Seçilen akış bu ekranda yok.' });
  // Varsayılan değişir: akışı yazılı olmayan eski senaryolar "Ana akış"ta kalır.
  expect(await basarili('/platform/ekran/akis/varsayilan', { projeId, ekranId, akisId: 'kurumsalTeklif' })).toMatchObject({ tasinan: 2 });
  for (const sid of acikSenaryoIdleri) expect(((await api(`/platform/senaryo?id=${sid}&ortamId=${ortamId}`)).senaryo as Nesne).akis).toBe('ana');
  expect(((await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`)).akislar as Nesne[]).map((a) => [a.id, a.varsayilan, a.senaryoSayisi]))
    .toEqual([['kurumsalTeklif', true, 1], ['ana', false, 2]]);
  // Senaryosu olan akış silinemez; model sürümleri Model geçmişinde.
  expect(await api('/platform/ekran/akis/sil', { projeId, ekranId, akisId: 'ana' })).toMatchObject({ basarili: false, mesaj: 'Bu akışı kullanan 2 senaryo var; önce senaryoları başka akışa taşıyın ya da silin.' });
  const gecmis = ((await api(`/platform/ekran?projeId=${projeId}&id=${ekranId}`)).gecmis as Nesne[]).map((g) => g.aciklama);
  expect(gecmis.slice(0, 2)).toEqual(['Varsayılan akış: Kurumsal teklif', 'Akış eklendi: Kurumsal teklif']);
});

test('mevcut ekranın kaydı: varsayılan akış güncellenebilir (paket geçerli) ya da kayıt yeni akış olarak eklenir', async () => {
  test.setTimeout(180_000);
  const ekranlar = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Nesne[];
  const ekranId = String((ekranlar.find((e) => e.ad === 'Açık Teklif') as Nesne).id);
  const isId = String((await basarili('/platform/tarama/baslat', {
    kip: 'kayit', projeId, ortamId, ekranId, hedef: '/acik-teklif/', baglamProfilleri: [], onay: true, girissiz: true
  })).isId);
  const { tarayici, sayfa } = await kayitSayfasi(isId, '/acik-teklif/');
  try {
    const panel = sayfa.locator('#nobetci-kayit-paneli');
    await expect(panel.getByRole('group', { name: 'Görülen alanlar' })).toContainText('Ad Soyad');
    await sayfa.fill('#musteriAd', GIZLI_DEGER);
    await sayfa.check('input[name="tip"][value="kurumsal"]');
    await sayfa.fill('#vergiNo', 'VKN-Kayit');
    await sayfa.click('#devam');
    await sayfa.selectOption('#teminat', 'dar');
    await sayfa.click('#kaydet');
    await expect(sayfa.locator('#teklif-sonuc')).toContainText('Teklif oluşturuldu');
    await panel.getByRole('button', { name: 'Bitir', exact: true }).click();
    await panel.getByRole('button', { name: 'Bitir ve Nöbetçi’ye gönder' }).click();
  } finally {
    await tarayici.close().catch(() => undefined);
  }
  expect(await kayitBitti(isId)).toMatchObject({ durum: 'tamam', tasarim: true, mod: 'analiz' });
  const akis = await api(`/platform/tarama/akis?id=${isId}`);
  // Mevcut ekran: akış listesi gelir (kayıt yeni akış olabilir ya da bir akışı güncelleyebilir).
  expect((akis.ekranAkislari as Nesne).akislar.map((a: Nesne) => a.ad)).toEqual(['Kurumsal teklif', 'Ana akış']);
  const b = akis.bloklar as Nesne[];
  const tasarim = [{ ...b[0], ad: 'Kurumsal müşteri' }, ...b.slice(1, -1), { tur: 'mesaj', mesaj: null, metin: 'Teklif oluşturuldu' }, b[b.length - 1]];
  // Varsayılan akışı güncelleme yolu: sayfa paketi geçerli (akışlı modelde varsayılan kopyası eşitlenir).
  expect((await basarili('/platform/tarama/akis', { id: isId, bloklar: tasarim })).ozet).toMatchObject({ adimSayisi: 2 });
  const paketModel = ((await api(`/platform/tarama/paket?id=${isId}`)).paket as Nesne).model as Nesne;
  expect(paketModel.akislar.find((a: Nesne) => a.varsayilan).adimlar).toEqual(paketModel.adimlar);
  // Yeni akış olarak ekle: önce etki (kaydetmez), onayla yeni model sürümü.
  const hedef = { tur: 'akis', ad: 'Kayıttan akış' };
  const on = await basarili('/platform/tarama/akis', { id: isId, bloklar: tasarim, hedef });
  expect(on.etki).toEqual({ yeni: true, senaryolar: [] });
  expect(((await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`)).akislar as Nesne[]).length).toBe(2);
  const y = await basarili('/platform/tarama/akis', { id: isId, bloklar: tasarim, hedef, onay: true });
  expect(y.akisId).toBe('kayittanAkis');
  const akislar = (await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`)).akislar as Nesne[];
  expect(akislar.map((a) => [a.ad, a.adimSayisi])).toEqual([['Kurumsal teklif', 5], ['Ana akış', 5], ['Kayıttan akış', 2]]);
  // Kaydın alanları mevcut alanlarla seçiciyle eşleşti (kimlikler korunur); yeni akışta koşul gerçek okumalardan.
  const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}&akisId=kayittanAkis`) as Nesne;
  const alanlar = (form.model.adimlar as Nesne[]).flatMap((a) => a.bolumler.flatMap((x: Nesne) => x.alanlar)).filter((x: Nesne) => x.yapilandirma === 'senaryo');
  const anaForm = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}&akisId=ana`) as Nesne;
  const anaAlanlar = (anaForm.model.adimlar as Nesne[]).flatMap((a) => a.bolumler.flatMap((x: Nesne) => x.alanlar));
  const kimlik = (liste: Nesne[], secici: string) => liste.find((x) => x.konum?.secici === secici)?.id;
  expect(kimlik(alanlar, '#musteriAd')).toBe(kimlik(anaAlanlar, '#musteriAd'));
  expect(kimlik(alanlar, '#vergiNo')).toBe(kimlik(anaAlanlar, '#vergiNo'));
  expect(JSON.stringify(akis)).not.toContain(GIZLI_DEGER);
  // Arayüz: kayıt diyagramında "Kayıt nereye yazılsın?" seçenekleri.
  const tarayici2 = await korumaliTarayici();
  try {
    const page = await (await tarayici2.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1200 }, colorScheme: 'dark' })).newPage();
    await page.goto(`/#/ekranlar/tarama/${encodeURIComponent(isId)}`);
    const secim = page.getByRole('radiogroup', { name: 'Kayıt nereye yazılsın?' });
    await expect(secim).toBeVisible({ timeout: 15_000 });
    await secim.getByText('Şu akışı güncelle').click();
    await expect(secim.getByRole('combobox', { name: 'Güncellenecek akış' }).locator('option')).toHaveText(['Kurumsal teklif (varsayılan)', 'Ana akış', 'Kayıttan akış']);
    await expect(page.getByRole('button', { name: 'Akışı güncelle' })).toBeVisible();
    await goruntu(page.locator('main'), '14-kayit-hedefi.png');
  } finally {
    await tarayici2.close();
  }
});
