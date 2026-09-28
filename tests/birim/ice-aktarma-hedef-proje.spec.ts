// KORUMA TESTLERİ — yedekten içe aktarmada HEDEF PROJE ve ORTAM EŞLEMESİ (scripts/platform/ice-aktarma-esleme.mjs).
// Yedekteki proje (A: TEST + CANLI) bu bilgisayardaki başka bir projeye (B) aktarılınca: tüm kayıtlar B'ye yazılır, A projesi
// oluşmaz; ortam kimliğine başvuran her yer (servis taban adresleri, tablo satırının ortamı, senaryo ortamları, giriş profili,
// zamanlanmış kural) B'nin ortamlarıyla yazılır. "Yeni ortam olarak ekle", eşlemesiz eski davranış, kimlik çakışması, aynı adlı
// kayıt ve hatalı eşleme. Dış istek yok: yalnız geçici veritabanları.
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import {
  ekranKaydet, ekranModeliEkle, girisProfiliKaydet, ortamKaydet, ortamlariListele, projeGetir, projeKaydet, senaryoGetir, senaryoKaydet,
  testVerisiProfiliKaydet, testVerisiTuruKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { servisKaydet, servisleriListele, servisSenaryolariniListele, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { kuralKaydet, kurallariListele } from '../../scripts/platform/zamanlama/kurallar.mjs';
import { yedekOlustur, type YedekHatasi } from '../../scripts/platform/yedek.mjs';
import { eslemeOnizlemesi, iceAktarmaHazirla, iceAktarmaUygula, MASKE } from '../../scripts/platform/ice-aktarma.mjs';
import { eslemeyiUygula, turetilmisKimlik } from '../../scripts/platform/ice-aktarma-esleme.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { korumaliTarayici, SIRKET_DESENI } from './giris-fikstur';
import { nobetciApi, nobetciBaslat } from './nobetci-sunucusu';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

const PAROLA_A = 'Hedef-Proje-Kaynak-Parola-1';
const PAROLA_B = 'Hedef-Proje-Yerel-Parola-2';
const GIRIS_PAROLASI = 'HedefProjeGiris#7731';

interface Kaynak {
  vt: Veritabani; proje: string; test: string; canli: string; servis: string; servisSenaryo: string; ekran: string; senaryo: string;
  tur: string; satir: string; profil: string;
}

async function kaynakOlustur(): Promise<Kaynak> {
  const vt = await veritabaniniHazirla(null);
  await kasaOlustur(vt, PAROLA_A, { kdf: HIZLI_KDF });
  const proje = projeKaydet(vt, { ad: 'Kaynak proje' });
  const test = ortamKaydet(vt, { projeId: proje, ad: 'TEST', tabanUrl: 'https://kaynak-test.ornek.test', varsayilan: true, ayarlar: { riskli: false } });
  const canli = ortamKaydet(vt, { projeId: proje, ad: 'CANLI', tabanUrl: 'https://kaynak-canli.ornek.test', ayarlar: { riskli: true } });
  const servis = servisKaydet(vt, {
    projeId: proje, anahtar: 'odeme', ad: 'Ödeme', tur: 'rest',
    ayarlar: { tabanlar: { [test]: 'https://odeme-test.ornek.test', [canli]: 'https://odeme-canli.ornek.test' }, erisim: { ortamId: test, zaman: '2026-09-01T00:00:00.000Z', durumKodu: 200 } }
  });
  const servisSenaryo = servisSenaryosuKaydet(vt, { projeId: proje, servisId: servis, baslik: 'Ödeme al', icerik: { operasyon: 'GET /odeme', govde: '{}', kontroller: [] } });
  const ekran = ekranKaydet(vt, { projeId: proje, anahtar: 'sepet', ad: 'Sepet' });
  ekranModeliEkle(vt, { ekranId: ekran, model: { alanlar: [] } });
  const senaryo = senaryoKaydet(vt, { projeId: proje, ekranId: ekran, baslik: 'Sepete ekle', icerik: { adim: 1, ortamlar: { [test]: { veri: 'a' }, [canli]: { veri: 'b' } } } });
  const tur = testVerisiTuruKaydet(vt, { projeId: proje, ad: 'Kartlar', alanlar: [{ ad: 'no' }] });
  const satir = testVerisiProfiliKaydet(vt, { projeId: proje, turId: tur, ortamId: canli, ad: 'Satır 1', degerler: { no: '42' } });
  const profil = girisProfiliKaydet(vt, { projeId: proje, ortamId: test, ad: 'Ana', kullaniciAdi: 'kullanici', parola: GIRIS_PAROLASI });
  kuralKaydet(vt, proje, { ad: 'Gece', ortamId: test, kapsam: { senaryolar: 'tum' }, zaman: { tur: 'gunluk', saat: '02:00' } });
  return { vt, proje, test, canli, servis, servisSenaryo, ekran, senaryo, tur, satir, profil };
}

async function yerelOlustur(yol: string | null = null): Promise<{ vt: Veritabani; proje: string; test: string; canli: string }> {
  const vt = await veritabaniniHazirla(yol);
  await kasaOlustur(vt, PAROLA_B, { kdf: HIZLI_KDF });
  const proje = projeKaydet(vt, { ad: 'Hedef proje' });
  const test = ortamKaydet(vt, { projeId: proje, ad: 'Test', tabanUrl: 'https://hedef-test.ornek.test', varsayilan: true, ayarlar: { riskli: false } });
  // Adı farklı, türü Canlı: öneri türden bulunur.
  const canli = ortamKaydet(vt, { projeId: proje, ad: 'Üretim', tabanUrl: 'https://hedef-canli.ornek.test', ayarlar: { riskli: true } });
  return { vt, proje, test, canli };
}

const say = (vt: Veritabani, sql: string, p: unknown[] = []): number => Number(vt.tek(sql, p)?.n ?? 0);

test('A → B eşlemesi: tüm kayıtlar B\'de, ortam başvuruları B\'nin ortamlarıyla, A projesi oluşmaz; önizleme özeti ve maskeleme', async () => {
  const a = await kaynakOlustur();
  const b = await yerelOlustur();
  try {
    const h = await iceAktarmaHazirla(b.vt, yedekOlustur(a.vt).veri, PAROLA_A);
    const pe = h.onizleme.projeEslemesi;
    expect(pe?.yedekProjeleri).toHaveLength(1);
    expect(pe?.yedekProjeleri[0]).toMatchObject({ id: a.proje, ad: 'Kaynak proje', yerelde: false, onerilenMevcut: b.proje });
    expect(pe?.yedekProjeleri[0].sayilar).toMatchObject({ servisler: 1, ekranlar: 1, senaryolar: 1, ortamlar: 2 });
    expect(pe?.oneri.projeler[a.proje]).toEqual({ hedef: 'yeni' }); // aynı kimlik yok → varsayılan yeni proje
    expect(pe?.yerelProjeler.map((p) => p.ad)).toEqual(['Hedef proje']);

    const esleme = { projeler: { [a.proje]: { hedef: b.proje } } }; // ortamlar verilmez → öneri (ad, yoksa tür)
    const o = await eslemeOnizlemesi(b.vt, h, esleme);
    expect(o.projeEslemesi?.uygulanan?.projeler[a.proje].ortamlar).toEqual({ [a.test]: b.test, [a.canli]: b.canli });
    expect(o.projeEslemesi?.ozet?.[0].metin).toBe('Kaynak proje → Hedef proje: 1 servis, 1 ekran, 1 senaryo, 1 servis senaryosu, 2 ortam, 1 giriş profili, 1 test verisi tablosu, 1 test verisi satırı, 1 ekran modeli sürümü');
    expect(o.projeEslemesi?.ozet?.[0].ortamlar.map((x) => [x.kaynak.ad, x.hedef?.ad ?? null])).toEqual([['TEST', 'Test'], ['CANLI', 'Üretim']]);
    expect(o.varliklar.projeler.yeni).toEqual([]);
    expect(o.varliklar.ortamlar.yeni).toEqual([]);
    expect(o.varliklar.servisler.yeni.map((x) => x.baslik)).toEqual(['Ödeme']);
    expect(o.varliklar.giris_profilleri.yeni[0].dosya.parola).toBe(MASKE);
    expect(JSON.stringify(o).includes(GIRIS_PAROLASI)).toBe(false);
    // Önizleme bir şey yazmaz.
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM servisler')).toBe(0);

    const sonuc = iceAktarmaUygula(b.vt, h, { tumu: true, esleme }, { yapan: 'birim-test' });
    expect(sonuc.projeEslemesi?.ozet[0].hedef).toMatchObject({ id: b.proje, yeni: false });
    expect(sonuc.otomatikEklenenUstKayitlar).toEqual([]);
    expect(projeGetir(b.vt, a.proje)).toBeUndefined();
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM projeler')).toBe(1);
    expect(ortamlariListele(b.vt, b.proje).map((x) => [x.ad, x.tabanUrl])).toEqual(
      expect.arrayContaining([['Test', 'https://hedef-test.ornek.test'], ['Üretim', 'https://hedef-canli.ornek.test']]));
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM ortamlar')).toBe(2);
    const servisler = servisleriListele(b.vt, b.proje);
    expect(servisler.map((x) => x.ad)).toEqual(['Ödeme']);
    expect(servisler[0].ayarlar.tabanlar).toEqual({ [b.test]: 'https://odeme-test.ornek.test', [b.canli]: 'https://odeme-canli.ornek.test' });
    expect(servisler[0].ayarlar.erisim?.ortamId).toBe(b.test);
    expect(servisSenaryolariniListele(b.vt, servisler[0].id).map((x) => x.baslik)).toEqual(['Ödeme al']);
    const s = senaryoGetir(b.vt, a.senaryo);
    expect(s?.projeId).toBe(b.proje);
    expect(Object.keys((s?.icerik as { ortamlar: Record<string, unknown> }).ortamlar).sort()).toEqual([b.test, b.canli].sort());
    expect(b.vt.tek('SELECT proje_id, ortam_id FROM test_verisi_profilleri WHERE id = ?', [a.satir])).toEqual({ proje_id: b.proje, ortam_id: b.canli });
    expect(b.vt.tek('SELECT proje_id, ortam_id FROM giris_profilleri WHERE id = ?', [a.profil])).toEqual({ proje_id: b.proje, ortam_id: b.test });
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM ekran_modelleri m JOIN ekranlar e ON e.id = m.ekran_id WHERE e.proje_id = ?', [b.proje])).toBe(1);
    const kurallar = kurallariListele(b.vt, b.proje);
    expect(kurallar.map((k) => [k.ad, k.ortamId])).toEqual([['Gece', b.test]]);
    // Hiçbir kayıtta kaynak proje / ortam kimliği kalmadı (yabancı anahtarlar dahil).
    for (const t of ['ortamlar', 'giris_profilleri', 'test_verisi_turleri', 'test_verisi_profilleri', 'ekranlar', 'senaryolar', 'servisler', 'servis_senaryolari', 'kosular']) {
      expect(say(b.vt, `SELECT COUNT(*) AS n FROM ${t} WHERE proje_id = ?`, [a.proje]), t).toBe(0);
    }
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM giris_profilleri WHERE ortam_id IN (?, ?)', [a.test, a.canli])).toBe(0);
  } finally {
    a.vt.kapat(); b.vt.kapat();
  }
});

test('"yeni ortam olarak ekle": CANLI hedef projede yeni ortam olur; ona başvuranlar yeni ortamı gösterir', async () => {
  const a = await kaynakOlustur();
  const b = await yerelOlustur();
  try {
    const h = await iceAktarmaHazirla(b.vt, yedekOlustur(a.vt).veri, PAROLA_A);
    const esleme = { projeler: { [a.proje]: { hedef: b.proje, ortamlar: { [a.test]: b.test, [a.canli]: 'yeni' } } } };
    const o = await eslemeOnizlemesi(b.vt, h, esleme);
    expect(o.varliklar.ortamlar.yeni.map((x) => x.baslik)).toEqual(['CANLI']);
    expect(o.projeEslemesi?.ozet?.[0].ortamlar.map((x) => [x.kaynak.ad, x.yeni])).toEqual([['TEST', false], ['CANLI', true]]);
    iceAktarmaUygula(b.vt, h, { tumu: true, esleme }, { yapan: 'birim-test' });
    const ortamlar = ortamlariListele(b.vt, b.proje);
    expect(ortamlar.map((x) => x.ad).sort()).toEqual(['CANLI', 'Test', 'Üretim']);
    expect(ortamlar.find((x) => x.ad === 'CANLI')?.id).toBe(a.canli); // yerelde yoktu: kimlik korunur
    const servis = servisleriListele(b.vt, b.proje)[0];
    expect(servis.ayarlar.tabanlar).toEqual({ [b.test]: 'https://odeme-test.ornek.test', [a.canli]: 'https://odeme-canli.ornek.test' });
    expect(b.vt.tek('SELECT ortam_id FROM test_verisi_profilleri WHERE id = ?', [a.satir])?.ortam_id).toBe(a.canli);
    // Mevcut projeye yeni eklenen ortam projenin varsayılanını değiştirmez (yedekte varsayılan olan TEST bile).
    const e2 = eslemeyiUygula(b.vt, h.tablolar, h.hedefAnahtar, { projeler: { [a.proje]: { hedef: b.proje, ortamlar: { [a.test]: 'yeni', [a.canli]: b.canli } } } });
    expect(e2.tablolar.ortamlar.map((o) => [o.id, o.varsayilan])).toEqual([[a.test, 0]]);
  } finally {
    a.vt.kapat(); b.vt.kapat();
  }
});

test('eşleme verilmezse bugünkü davranış: yedekteki proje eklenir, kayıtlar onun kimlikleriyle yazılır', async () => {
  const a = await kaynakOlustur();
  const b = await yerelOlustur();
  try {
    const h = await iceAktarmaHazirla(b.vt, yedekOlustur(a.vt).veri, PAROLA_A);
    expect(h.onizleme.varliklar.projeler.yeni.map((x) => x.id)).toEqual([a.proje]);
    // esleme: null → eşlemesiz önizleme aynen döner.
    expect(await eslemeOnizlemesi(b.vt, h, null)).toBe(h.onizleme);
    const sonuc = iceAktarmaUygula(b.vt, h, { tumu: true }, { yapan: 'birim-test' });
    expect(sonuc.projeEslemesi).toBeUndefined();
    expect(projeGetir(b.vt, a.proje)?.ad).toBe('Kaynak proje');
    expect(servisleriListele(b.vt, a.proje).map((x) => x.id)).toEqual([a.servis]);
    expect(servisleriListele(b.vt, b.proje)).toEqual([]);
    expect(ortamlariListele(b.vt, a.proje).map((x) => x.id).sort()).toEqual([a.test, a.canli].sort());
  } finally {
    a.vt.kapat(); b.vt.kapat();
  }
});

test('kimlik çakışması ve aynı adlı kayıt: başka projedeki aynı kimlik → kararlı yeni kimlik; hedefte aynı anahtarlı servis → o servis (değişen)', async () => {
  const a = await kaynakOlustur();
  const b = await yerelOlustur();
  try {
    const yedek = yedekOlustur(a.vt).veri;
    // Önce eski davranışla: A projesi bu bilgisayarda (tüm kimlikleriyle) var.
    iceAktarmaUygula(b.vt, await iceAktarmaHazirla(b.vt, yedek, PAROLA_A), { tumu: true }, { yapan: 'birim-test' });
    // B'de aynı anahtarlı servis (farklı kimlik, farklı ad).
    const yerelServis = servisKaydet(b.vt, { projeId: b.proje, anahtar: 'odeme', ad: 'Ödeme (yerel)', tur: 'rest', ayarlar: {} });

    const h = await iceAktarmaHazirla(b.vt, yedek, PAROLA_A);
    expect(h.onizleme.projeEslemesi?.oneri.projeler[a.proje].hedef).toBe(a.proje); // aynı kimlik yerelde → o proje önerilir
    const esleme = { projeler: { [a.proje]: { hedef: b.proje } } };
    const o = await eslemeOnizlemesi(b.vt, h, esleme);
    const degisim = o.projeEslemesi?.kimlikDegisimleri ?? [];
    const yeniEkran = turetilmisKimlik(b.proje, 'ekranlar', a.ekran);
    expect(degisim).toEqual(expect.arrayContaining([
      { tablo: 'servisler', eski: a.servis, yeni: yerelServis, neden: 'ayni_ad' },
      { tablo: 'ekranlar', eski: a.ekran, yeni: yeniEkran, neden: 'kimlik_cakismasi' },
      { tablo: 'projeler', eski: a.proje, yeni: b.proje, neden: 'proje_eslemesi' }
    ]));
    expect(o.varliklar.servisler.degisen.map((x) => x.id)).toEqual([yerelServis]);
    expect(o.varliklar.servisler.yeni).toEqual([]);
    expect(o.varliklar.ekranlar.yeni.map((x) => x.id)).toEqual([yeniEkran]);

    iceAktarmaUygula(b.vt, h, { tumu: true, esleme }, { yapan: 'birim-test' });
    // A'nın kayıtları olduğu gibi; B'de kendi kopyaları.
    expect(b.vt.tek('SELECT proje_id FROM ekranlar WHERE id = ?', [a.ekran])?.proje_id).toBe(a.proje);
    expect(b.vt.tek('SELECT proje_id FROM ekranlar WHERE id = ?', [yeniEkran])?.proje_id).toBe(b.proje);
    const yeniSenaryo = turetilmisKimlik(b.proje, 'senaryolar', a.senaryo);
    expect(senaryoGetir(b.vt, yeniSenaryo)).toMatchObject({ projeId: b.proje, ekranId: yeniEkran });
    expect(senaryoGetir(b.vt, a.senaryo)).toMatchObject({ projeId: a.proje, ekranId: a.ekran });
    // Aynı anahtarlı servis birleşti: B'de tek "odeme"; yerel sürüm geçmişte.
    const bServisleri = servisleriListele(b.vt, b.proje);
    expect(bServisleri.map((x) => [x.id, x.ad])).toEqual([[yerelServis, 'Ödeme']]);
    expect(bServisleri[0].ayarlar.tabanlar).toEqual({ [b.test]: 'https://odeme-test.ornek.test', [b.canli]: 'https://odeme-canli.ornek.test' });
    expect(servisSenaryolariniListele(b.vt, yerelServis).map((x) => x.baslik)).toEqual(['Ödeme al']);
    expect(servisleriListele(b.vt, a.proje).map((x) => x.id)).toEqual([a.servis]);
    // Zamanlanmış kurallar (Ayarlar kaydı) birleşti: A'nınki korunur; B'ye kararlı yeni kimlikle kopyası (ortamı B'nin).
    expect(kurallariListele(b.vt, a.proje).map((k) => k.ortamId)).toEqual([a.test]);
    const bKurallari = kurallariListele(b.vt, b.proje);
    expect(bKurallari.map((k) => [k.ad, k.ortamId])).toEqual([['Gece', b.test]]);
    expect(bKurallari[0].id).not.toBe(kurallariListele(b.vt, a.proje)[0].id);

    // Aynı eşlemeyle yeniden: kararlı kimlikler → yeni kayıt yok.
    const tekrar = await eslemeOnizlemesi(b.vt, await iceAktarmaHazirla(b.vt, yedek, PAROLA_A), esleme);
    for (const t of ['servisler', 'ekranlar', 'senaryolar', 'ekran_modelleri', 'test_verisi_profilleri']) {
      expect(tekrar.varliklar[t].yeni, t).toEqual([]);
    }
  } finally {
    a.vt.kapat(); b.vt.kapat();
  }
});

test('hatalı eşleme açık hatayla reddedilir (hiçbir şey yazılmaz)', async () => {
  const a = await kaynakOlustur();
  const b = await yerelOlustur();
  try {
    const h = await iceAktarmaHazirla(b.vt, yedekOlustur(a.vt).veri, PAROLA_A);
    const hata = async (esleme: unknown): Promise<string> => {
      try { await eslemeOnizlemesi(b.vt, h, esleme); return 'hata yok'; } catch (e) { return `${(e as YedekHatasi).kod}: ${(e as Error).message}`; }
    };
    expect(await hata({ projeler: { [a.proje]: { hedef: b.proje, ortamlar: { [a.test]: b.test, [a.canli]: b.test } } } }))
      .toBe('VERI: "TEST" ve "CANLI" aynı ortama ("Test") eşlenemez; birini yeni ortam olarak ekleyin.');
    expect(await hata({ projeler: { [a.proje]: { hedef: 'olmayan-proje' } } })).toContain('VERI: "Kaynak proje" için seçilen hedef proje bu bilgisayarda yok.');
    expect(await hata({ projeler: { [a.proje]: { hedef: b.proje, ortamlar: { [a.test]: a.canli } } } })).toContain('projesinde yok');
    expect(await hata({ projeler: { yok: { hedef: 'yeni' } } })).toContain('yedekte olmayan bir proje');
    expect(() => iceAktarmaUygula(b.vt, h, { tumu: true, esleme: { projeler: { [a.proje]: { hedef: 'olmayan' } } } }, { yapan: 'birim-test' })).toThrow('bu bilgisayarda yok');
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM servisler')).toBe(0);
  } finally {
    a.vt.kapat(); b.vt.kapat();
  }
});

// ---------------------------------------------------------------------------------------------------------------------------
// Arayüz: Ayarlar > Yedekleme > İçe aktar — hedef proje ve ortam eşlemesi, özet, uygulama sonrası Servisler; 390 px taşma yok.
// ---------------------------------------------------------------------------------------------------------------------------

test('arayüz: önizlemede hedef proje + ortam eşlemesi ve özet; uygulanınca servisler hedef projede görünür (390 px taşma yok)', async () => {
  test.setTimeout(180_000);
  const klasor = geciciKlasor('ice-hedef-proje-arayuz');
  const a = await kaynakOlustur();
  const yedek = yedekOlustur(a.vt).veri;
  a.vt.kapat();
  const b = await yerelOlustur(join(klasor.yol, 'platform.db'));
  b.vt.kapat();
  const nobetci = await nobetciBaslat(klasor.yol, join(klasor.yol, 'platform.db'));
  const tarayici = await korumaliTarayici();
  const hatalar: string[] = [];
  const istekler: string[] = [];
  try {
    expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA_B })).basarili).toBe(true);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 390, height: 844 } });
    baglam.on('request', (r) => { istekler.push(r.url()); });
    const p = await baglam.newPage();
    p.on('pageerror', (e) => hatalar.push(String(e)));
    const tasmaYok = async (sayfa: Page): Promise<void> => {
      expect(await sayfa.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    };

    await p.goto('/#/ayarlar/yedekleme');
    await p.getByRole('button', { name: 'Yedek dosyası seç…' }).click();
    await p.getByLabel('Yedek dosyası').setInputFiles({ name: 'kaynak.tayedek', mimeType: 'application/octet-stream', buffer: yedek });
    await p.getByRole('textbox', { name: 'Yedeğin parolası (zorunlu)' }).fill(PAROLA_A);
    await p.getByRole('button', { name: 'Yükle ve önizle' }).click();
    await expect(p.getByRole('heading', { name: 'Yedek önizlemesi' })).toBeVisible({ timeout: 60_000 });

    const bolum = p.getByRole('region', { name: 'Hedef proje' });
    await expect(bolum).toBeVisible();
    const hedef = bolum.getByLabel('Yedekteki proje: Kaynak proje');
    // Varsayılan: yedekteki proje bu bilgisayarda yok → yeni proje; mevcut tek proje önerilir ve ipucu gösterilir.
    await expect(hedef).toHaveValue('yeni');
    await expect(bolum.getByText('Bu bilgisayarda "Hedef proje" projesi var.', { exact: false })).toBeVisible();
    await expect(hedef.locator('option')).toHaveText(['Yeni proje olarak ekle (yedekteki adıyla)', 'Mevcut projeye aktar: Hedef proje (önerilen)']);
    await tasmaYok(p);

    await hedef.selectOption(b.proje);
    const testSecimi = bolum.getByLabel('TEST (Test) (yedekte)');
    const canliSecimi = bolum.getByLabel('CANLI (Canlı) (yedekte)');
    await expect(testSecimi).toHaveValue(b.test);
    await expect(canliSecimi).toHaveValue(b.canli); // ad yok, tür aynı (Canlı) → önerilen
    await expect(bolum.locator('.esleme-ozeti')).toHaveText(/^Kaynak proje → Hedef proje: 1 servis, 1 ekran, 1 senaryo/);
    await expect(p.locator('[data-tablo="projeler"] .grup.yeni')).toHaveCount(0); // proje kaydı eklenmeyecek
    await expect(hedef).toBeFocused();
    await tasmaYok(p);
    if (process.env.ICE_HEDEF_EKRAN_KLASORU) await bolum.screenshot({ path: join(process.env.ICE_HEDEF_EKRAN_KLASORU, 'hedef-proje-390.png'), animations: 'disabled' });

    // "Yeni ortam olarak ekle" seçilince önizlemede yeni ortam görünür; geri alınınca kaybolur.
    await canliSecimi.selectOption('yeni');
    await expect(bolum.getByLabel('CANLI (Canlı) (yedekte)')).toBeFocused();
    // Tür ve grup varsayılan kapalı: açınca yeni ortam satırı görünür.
    const ortamBolumu = p.locator('[data-tablo="ortamlar"]');
    await expect(ortamBolumu.locator(':scope > .acilir-baslik .acilir-dugme')).toHaveAttribute('aria-expanded', 'false');
    await ortamBolumu.locator(':scope > .acilir-baslik .acilir-dugme').click();
    await ortamBolumu.locator('.grup.yeni .acilir-dugme').click();
    await expect(ortamBolumu.locator('.grup.yeni').getByText('CANLI')).toBeVisible();
    await bolum.getByLabel('CANLI (Canlı) (yedekte)').selectOption(b.canli);
    await expect(p.locator('[data-tablo="ortamlar"] .grup.yeni')).toHaveCount(0);
    // Aynı ortama iki eşleme: açık hata, önizleme değişmez.
    await bolum.getByLabel('CANLI (Canlı) (yedekte)').selectOption(b.test);
    await expect(bolum.getByRole('alert').filter({ hasText: 'aynı ortama' })).toBeVisible();
    await bolum.getByLabel('CANLI (Canlı) (yedekte)').selectOption(b.canli);
    await expect(bolum.locator('.esleme-ozeti')).toBeVisible();
    await tasmaYok(p);

    await p.getByRole('button', { name: 'Seçilenleri uygula' }).click();
    await expect(p.getByRole('heading', { name: 'İçe aktarma tamamlandı' })).toBeVisible({ timeout: 60_000 });
    await expect(p.locator('.esleme-sonucu')).toContainText('Kaynak proje → Hedef proje: 1 servis');
    await tasmaYok(p);

    // Servisler (tek proje: Hedef proje) — içe aktarılan servis görünür; A projesi oluşmadı.
    await p.goto('/#/servisler');
    await expect(p.getByText('Ödeme', { exact: true }).first()).toBeVisible();
    await tasmaYok(p);
    const projeler = (await nobetciApi(nobetci, '/platform/projeler')).projeler as Array<{ id: string }>;
    expect(projeler.map((x) => x.id)).toEqual([b.proje]);
    await baglam.close();
    expect(hatalar, 'sayfa hataları').toEqual([]);
    expect(istekler.filter((u) => SIRKET_DESENI.test(u))).toEqual([]);
    expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  } finally {
    await tarayici.close();
    nobetci.surec.kill('SIGTERM');
    klasor.temizle();
  }
});
