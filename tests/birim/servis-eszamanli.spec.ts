// KORUMA TESTLERİ — servis senaryolarında eşzamanlı koşu (Ayarlar > Koşu > Servisler > "Aynı anda en çok N servis senaryosu").
// Sahte SOAP sunucusu (yalnız 127.0.0.1) her yanıtı geciktirir ve aynı anda işlenen istekleri sayar: N = 1'de sırayla (en çok 1
// istek), N = 3'te en çok 3; durdurma çalışanların tümünü keser; sonuç kayıtları tam; akış içi adımlar sırayla; paylaşılan oturum
// (token) paralel senaryolarda bir kez alınır / 401 sonrası bir kez yenilenir. Zamanlanmış koşudaki servis akışları da aynı ayarla.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { servisAkisiKaydet, servisKosulariniListele, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { erisimKontrolu, servisiKaydet, servisSenaryolariniKos } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { oturumlariTemizle, servisAkisiCalistir } from '../../scripts/platform/servisler/servis-akislari.mjs';
import { servisIsiBaslat, servisIsiDurdur, servisIsiDurumu, type ServisIsiGorunumu } from '../../scripts/platform/servisler/servis-isleri.mjs';
import { sinirliKos } from '../../scripts/platform/servisler/eszamanli.mjs';
import { KOSU_AYAR_TANIMLARI, kosuAyarlariniKaydet, kosuAyarlariniOku } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { zamanliKosuyuYurut } from '../../scripts/platform/zamanlama/zamanlayici.mjs';
import type { Kural } from '../../scripts/platform/zamanlama/kurallar.mjs';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';
import { SAHTE_TC, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

const GECIKME = 400;
const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></s:Body></s:Envelope>`;

test('sinirliKos: en çok n iş aynı anda; öğeler sırayla başlar; sonuçlar öğe sırasıyla; devam() false ise yeni iş başlamaz', async () => {
  let aktif = 0;
  let enCok = 0;
  const baslayan: number[] = [];
  const is = async (x: number) => {
    baslayan.push(x); aktif++; enCok = Math.max(enCok, aktif);
    await new Promise((r) => setTimeout(r, 20 + (x % 2) * 15));
    aktif--;
    return x * 10;
  };
  expect(await sinirliKos([1, 2, 3, 4, 5], 2, is)).toEqual([10, 20, 30, 40, 50]);
  expect(enCok).toBe(2);
  expect(baslayan).toEqual([1, 2, 3, 4, 5]);
  enCok = 0;
  expect(await sinirliKos([1, 2, 3], 1, is)).toEqual([10, 20, 30]);
  expect(enCok).toBe(1);
  let izin = 2;
  expect(await sinirliKos([1, 2, 3, 4], 1, is, () => izin-- > 0)).toEqual([10, 20, undefined, undefined]);
});

test('ayar: "Aynı anda en çok servis senaryosu" 1–10, varsayılan 1, Servisler grubunda; açıklama ağ uyarısını içerir', async () => {
  const t = KOSU_AYAR_TANIMLARI.find((x) => x.anahtar === 'servisEszamanli');
  expect(t).toMatchObject({ grup: 'Servisler', tur: 'sayi', varsayilan: 1, enAz: 1, enCok: 10 });
  expect(t?.aciklama).toContain('1: sırayla.');
});

test.describe('eşzamanlı servis koşusu', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('servis-eszamanli');
  let vt: Veritabani;
  let soap: Awaited<ReturnType<typeof sahteSoapSunucusu>>;
  let projeId = '';
  let ortamId = '';
  let servisId = '';
  let giris = '';
  const senaryolar: string[] = [];
  const girisSayisi = () => soap.istekler.filter((i) => i.govde.includes('<Giris')).length;
  const bitene = async (id: string): Promise<ServisIsiGorunumu> => {
    await expect.poll(() => servisIsiDurumu(projeId, id).bitti, { timeout: 20_000 }).toBe(true);
    return servisIsiDurumu(projeId, id);
  };
  const kos = async (idler: string[]) => {
    soap.sayaciSifirla();
    const bas = Date.now();
    const is = servisIsiBaslat(vt, projeId, { servisId, ortamId, senaryoIdleri: idler });
    const son = await bitene(is.id);
    return { son, sure: Date.now() - bas };
  };

  test.beforeAll(async () => {
    soap = await sahteSoapSunucusu({ gecikmeMs: GECIKME });
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Gecici-Eszamanli-1', { kdf: HIZLI_KDF });
    izinleriAc(vt);
    projeId = projeKaydet(vt, { ad: 'Eşzamanlı' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, ayarlar: { riskli: false } });
    const e = await erisimKontrolu(vt, projeId, { ortamId, yol: '/Servis/ornek.asmx' });
    if (!e.erisilebilir) throw new Error('erişim yok');
    servisId = servisiKaydet(vt, projeId, { anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi });
    const kaydet = (baslik: string, govde: string, basliklar?: Record<string, string>) => servisSenaryosuKaydet(vt, {
      projeId, servisId, baslik, kapsam: 'ikisi', icerik: { operasyon: 'Siparis', govde: zarf(govde), kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }], ...(basliklar ? { basliklar } : {}) }
    });
    for (const n of [1, 2, 3, 4]) senaryolar.push(kaydet(`S${n}`, `<IdentityNumber>${SAHTE_TC}</IdentityNumber><No>${n}</No>`));
    giris = kaydet('Giriş', '<Giris/>');
  });
  test.afterAll(async () => { vt?.kapat(); await soap?.kapat(); klasor.temizle(); });

  test('N = 1 (varsayılan): sırayla — aynı anda en çok 1 istek, toplam süre ≈ senaryo × gecikme', async () => {
    expect(kosuAyarlariniOku(vt).servisEszamanli).toBe(1);
    const { son, sure } = await kos(senaryolar);
    expect(son.eszamanli).toBe(1);
    expect(son.satirlar.map((s) => s.durum)).toEqual(['basarili', 'basarili', 'basarili', 'basarili']);
    expect(soap.enCokEszamanli()).toBe(1);
    expect(sure).toBeGreaterThanOrEqual(4 * GECIKME);
  });

  test('N = 3: aynı anda en çok 3 istek, süre kısalır; sonuç kayıtları tam ve sırası korunur', async () => {
    kosuAyarlariniKaydet(vt, { servisEszamanli: 3 });
    const once = servisKosulariniListele(vt, { servisId }).length;
    const { son, sure } = await kos(senaryolar);
    expect(son.eszamanli).toBe(3);
    expect(son.satirlar.map((s) => [s.baslik, s.durum])).toEqual([['S1', 'basarili'], ['S2', 'basarili'], ['S3', 'basarili'], ['S4', 'basarili']]);
    expect(soap.enCokEszamanli()).toBe(3);
    expect(sure).toBeLessThan(4 * GECIKME);
    const kosuIdleri = son.satirlar.map((s) => String(s.sonuc?.kosuId));
    expect(new Set(kosuIdleri).size).toBe(4);
    expect(servisKosulariniListele(vt, { servisId }).length).toBe(once + 4);
    // Senkron toplu koşu ucu da aynı ayarla (sonuçlar senaryo sırasıyla).
    soap.sayaciSifirla();
    const t = await servisSenaryolariniKos(vt, projeId, { servisId, ortamId, senaryoIdleri: senaryolar });
    expect(t.sonuclar.map((x) => x.baslik)).toEqual(['S1', 'S2', 'S3', 'S4']);
    expect(soap.enCokEszamanli()).toBe(3);
  });

  test('durdurma: tüm iş durdurulunca çalışan 3 senaryonun hepsi kesilir, sıradaki başlamaz', async () => {
    kosuAyarlariniKaydet(vt, { servisEszamanli: 3 });
    const is = servisIsiBaslat(vt, projeId, { servisId, ortamId, senaryoIdleri: senaryolar });
    await expect.poll(() => servisIsiDurumu(projeId, is.id).calisanlar.length, { timeout: 5_000 }).toBe(3);
    expect(servisIsiDurumu(projeId, is.id).satirlar.map((s) => s.durum)).toEqual(['calisiyor', 'calisiyor', 'calisiyor', 'sirada']);
    const istekOnce = soap.istekler.length;
    servisIsiDurdur(projeId, is.id);
    const son = await bitene(is.id);
    expect(son.satirlar.map((s) => s.durum)).toEqual(['durduruldu', 'durduruldu', 'durduruldu', 'durduruldu']);
    expect(son.calisanlar).toEqual([]);
    expect(soap.istekler.length).toBe(istekOnce);
    // Tek senaryo durdurma yalnız onu keser.
    const is2 = servisIsiBaslat(vt, projeId, { servisId, ortamId, senaryoIdleri: senaryolar.slice(0, 2) });
    await expect.poll(() => servisIsiDurumu(projeId, is2.id).calisanlar.length, { timeout: 5_000 }).toBe(2);
    servisIsiDurdur(projeId, is2.id, senaryolar[1]);
    const son2 = await bitene(is2.id);
    expect(son2.satirlar.map((s) => s.durum)).toEqual(['basarili', 'durduruldu']);
  });

  test('paylaşılan oturum: paralel senaryolarda token bir kez alınır; 401 sonrası yenileme de bir kez', async () => {
    kosuAyarlariniKaydet(vt, { servisEszamanli: 3 });
    oturumlariTemizle();
    const oturum = servisAkisiKaydet(vt, { projeId, baslik: 'Giriş oturumu', tur: 'oturum', icerik: { adimlar: [
      { ad: 'Giriş', servisId, senaryoId: giris, okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }] }], omurSaniye: 600, yetkiHatasinda: 'yenileVeTekrar' } });
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', oturumAkisi: oturum });
    const yetkili = [1, 2, 3].map((n) => servisSenaryosuKaydet(vt, { projeId, servisId, baslik: `Yetkili ${n}`, kapsam: 'ikisi', icerik: {
      operasyon: 'Siparis', govde: zarf(`<YetkiGerekli/><IdentityNumber>${SAHTE_TC}</IdentityNumber>`), basliklar: { Authorization: 'Bearer ${akis:Token}' },
      kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }] } }));
    let once = girisSayisi();
    const { son } = await kos(yetkili);
    expect(son.satirlar.map((s) => s.durum)).toEqual(['basarili', 'basarili', 'basarili']);
    expect(girisSayisi()).toBe(once + 1);
    // Token başka yerden yenilenir (sunucu eskisini reddeder): üç paralel senaryo 401 alır, oturum yine BİR kez yenilenir.
    await kos([giris]);
    once = girisSayisi();
    const { son: son2 } = await kos(yetkili);
    expect(son2.satirlar.map((s) => s.durum)).toEqual(['basarili', 'basarili', 'basarili']);
    expect(girisSayisi()).toBe(once + 1);
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', oturumAkisi: null });
  });

  test('zamanlanmış koşu: servis akışları aynı ayarla paralel; akışın kendi adımları sırayla', async () => {
    kosuAyarlariniKaydet(vt, { servisEszamanli: 2 });
    const akis = (ad: string) => servisAkisiKaydet(vt, { projeId, baslik: ad, icerik: { adimlar: [
      { ad: 'Adım 1', servisId, senaryoId: senaryolar[0] }, { ad: 'Adım 2', servisId, senaryoId: senaryolar[1] }, { ad: 'Adım 3', servisId, senaryoId: senaryolar[2] }] } });
    const akislar = [akis('A'), akis('B')];
    const kural = { id: 'k1', projeId, ad: 'Gece', ortamId, kapsam: { senaryolar: 'yok', ekranIdleri: [], servisAkisIdleri: akislar }, canliOnay: false } as unknown as Kural;
    soap.sayaciSifirla();
    const once = soap.istekler.length;
    const r = await zamanliKosuyuYurut(vt, kural, 'zamanli-1', { senaryolar: () => [], senaryoCalistir: async () => ({ govde: {} }), servisAkisiCalistir });
    expect(r.akisKosulari.map((a) => [a.akisId, a.durum])).toEqual([[akislar[0], 'basarili'], [akislar[1], 'basarili']]);
    expect(soap.enCokEszamanli()).toBe(2);
    // Her akışın adımları sırayla: aynı akışın n. isteği (n-1). istek bitmeden gelmez. İki akış aynı senaryoları kullanır;
    // <No> değeri adımı gösterir, akışlar paralel olduğundan her adım iki kez gelir.
    const yeni = soap.istekler.slice(once);
    const adim = (i: SahteIstek) => Number(/<No>(\d)<\/No>/.exec(i.govde)?.[1]);
    const adimlar = [1, 2, 3].map((n) => yeni.filter((i) => adim(i) === n));
    expect(adimlar.map((l) => l.length)).toEqual([2, 2, 2]);
    for (const n of [1, 2]) {
      const oncekiIlkBiten = Math.min(...adimlar[n - 1].map((i) => Number(i.bitti)));
      for (const i of adimlar[n]) expect(Number(i.geldi)).toBeGreaterThanOrEqual(oncekiIlkBiten);
    }
    kosuAyarlariniKaydet(vt, { servisEszamanli: 1 });
  });
});
