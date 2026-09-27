// UÇTAN UCA (yerel) — servis testleri HTTP uçları: geçici Nöbetçi örneği + SAHTE SOAP sunucusu (127.0.0.1).
// SoapUI önizleme / aktarım (büyük gövde), erişim kontrolü, Dene, koşu, raporlar ve giriş bilgisi değerlerinin hiçbir
// yanıtta dönmemesi. Şirket sitesine istek yoktur.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { SAHTE_PAROLA, SAHTE_TC, SOAPUI, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Servis-${randomBytes(6).toString('hex')}`;

let nobetci: Nobetci;
let klasor = '';
let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
let projeId = '';
let testOrtami = '';

const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
async function basarili(yol: string, govde?: Nesne): Promise<Nesne> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true);
  return y;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'servis-uclari-'));
  soap = await sahteSoapSunucusu();
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Servis Projesi' })).proje.id);
  testOrtami = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, riskli: false })).ortam.id);
  await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad: 'Kişi', alanlar: [{ ad: 'tcKimlikNo', servisParametreleri: [{ ad: 'MUSTERI_TC', rol: 'musteri' }] }] });
  // Giriş bilgisi tablosu (sütun adları WSDL alanlarıyla aynı): aktarım bağlar, dosyadaki giriş bilgisini satır olarak ekler.
  await basarili('/platform/tablo/kaydet', { projeId, ad: 'Giriş', sutunlar: [{ ad: 'Channel' }, { ad: 'Username' }, { ad: 'Password', gizli: true }] });
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await soap?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('SoapUI önizle → erişimi kontrol et → aktar → parametreler → Dene → koşu → raporlar', async () => {
  test.setTimeout(90_000);
  // Büyük gövdeli uç: 64 KB sınırına takılmamalı.
  const buyuk = SOAPUI.replace('</con:soapui-project>', `<!-- ${'x'.repeat(200_000)} --></con:soapui-project>`);
  const ozet = await basarili('/platform/servis/soapui/onizle', { projeId, xml: buyuk });
  expect(ozet.onizleme.durumlar).toEqual([expect.objectContaining({ takim: 'Takim', durum: 'OrnekDurum', istekSayisi: 3, kimlikParametreleri: ['CHANNEL', 'PASSWORD', 'USERNAME'] })]);
  const onizleme = await basarili('/platform/servis/soapui/onizle', { projeId, xml: buyuk, takim: 'Takim', durum: 'OrnekDurum' });
  expect(JSON.stringify(onizleme)).not.toContain(SAHTE_PAROLA);
  expect(onizleme.onizleme.veriParametreleri).toEqual([{ ad: 'MUSTERI_TC', esleme: { turAd: 'Kişi', alan: 'tcKimlikNo', rol: 'musteri' } }]);

  // Erişim kontrolü olmadan aktarım (yeni servis) reddedilir.
  const red = await api('/platform/servis/soapui/aktar', { projeId, xml: SOAPUI, takim: 'Takim', durum: 'OrnekDurum', servis: 'ornek-service' });
  expect(red.basarili).toBe(false);
  expect(String(red.mesaj)).toContain('Erişimi kontrol et');
  const erisim = await basarili('/platform/servis/erisim', { projeId, ortamId: testOrtami, yol: '/Servis/ornek.asmx' });
  expect(erisim).toMatchObject({ erisilebilir: true, durumKodu: 200 });
  const aktar = await basarili('/platform/servis/soapui/aktar', {
    projeId, xml: SOAPUI, takim: 'Takim', durum: 'OrnekDurum', servis: 'ornek-service', erisimKimligi: erisim.erisimKimligi, girisEkle: true,
    // Önizlemedeki kullanıcı seçimleri: MUSTERI_TC gövdede kalır (eski eşleme — geriye uyum); parola onayla şifreli yazılır.
    ozellikler: { MUSTERI_TC: 'birak' }, sifreliKaydet: ['PASSWORD']
  });
  expect(aktar).toMatchObject({ yeniServis: true, eklenen: 3, baglananAlan: 5, girisSatiriEklendi: true, eksikSatirlar: [] });
  const servisId = String(aktar.servisId);

  const liste = await basarili(`/platform/servisler?projeId=${projeId}`);
  expect(liste.servisler).toEqual([expect.objectContaining({ id: servisId, anahtar: 'ornek-service', senaryoSayisi: 3, sonKosu: null })]);
  const kimlikler = await basarili(`/platform/servis-kimlikleri?projeId=${projeId}`);
  expect(kimlikler.profiller).toEqual([]);

  // Rol için profil seç (test verisi profili) → Parametreler tamam.
  const turler = await basarili(`/platform/test-verisi-turleri?projeId=${projeId}`);
  const turId = String(turler.turler.find((x: Nesne) => x.ad === 'Kişi').id);
  const profil = await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId, ad: 'k1', degerler: { tcKimlikNo: SAHTE_TC } });
  await basarili('/platform/servis/kaydet', { projeId, id: servisId, anahtar: 'ornek-service', ad: 'OrnekService', yol: '/Servis/ornek.asmx', veriProfilleri: { [`${turId}:musteri`]: profil.profil.id } });
  const parametreler = await basarili(`/platform/servis/parametreler?projeId=${projeId}&id=${servisId}`);
  expect(parametreler.roller).toEqual([expect.objectContaining({ turAd: 'Kişi', rol: 'musteri', profilId: profil.profil.id })]);
  expect(parametreler.parametreler.every((p: Nesne) => p.kaynak.tur !== 'eslenmemis')).toBe(true);

  const servis = await basarili(`/platform/servis?projeId=${projeId}&id=${servisId}`);
  const gecerli = servis.senaryolar.find((s: Nesne) => s.baslik === 'Geçerli kimlik');
  const dene = await basarili('/platform/servis/senaryo/dene', { projeId, servisId, senaryoId: gecerli.id, ortamId: testOrtami });
  expect(dene.sonuc).toMatchObject({ durum: 'basarili', durumKodu: 200 });
  expect(JSON.stringify(dene)).not.toContain(SAHTE_PAROLA);
  expect(JSON.stringify(dene)).not.toContain(SAHTE_TC);

  // Taslak Dene (kaydedilmemiş gövde) ve senaryo kaydı.
  const taslak = await basarili('/platform/servis/senaryo/dene', { projeId, servisId, ortamId: testOrtami, baslik: 'Taslak', icerik: { ...gecerli.icerik, kontroller: [{ tur: 'icermez', deger: 'HATA' }] } });
  expect(taslak.sonuc.durum).toBe('basarili');
  const yeni = await basarili('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Elle eklenen', kapsam: 'ikisi', icerik: { operasyon: 'Siparis', govde: gecerli.icerik.govde, kontroller: [{ tur: 'soapHatasiYok' }] } });
  const bozuk = await api('/platform/servis/senaryo/kaydet', { projeId, servisId, baslik: 'Bozuk', icerik: { operasyon: 'Siparis', govde: '<a/>', kontroller: [{ tur: 'icerir' }] } });
  expect(bozuk.basarili).toBe(false);

  const kos = await basarili('/platform/servis/kos', { projeId, servisId, ortamId: testOrtami });
  expect(kos.kosu.ozet).toEqual({ basarili: 4, basarisiz: 0, hata: 0 });
  const kosular = await basarili(`/platform/servis/kosular?projeId=${projeId}&servisId=${servisId}`);
  expect(kosular.kosular).toHaveLength(6);
  const ayrinti = await basarili(`/platform/servis/kosu?projeId=${projeId}&id=${kosular.kosular[0].id}`);
  expect(ayrinti.kosu.sonuc.istek).toContain('***');
  // Ekran sonuçlarına karışmaz.
  const ekranKosulari = await api(`/platform/sonuclar/kosular?projeId=${projeId}`);
  expect(JSON.stringify(ekranKosulari)).not.toContain('Elle eklenen');

  await basarili('/platform/servis/senaryo/sil', { projeId, id: yeni.id });
  const sil = await basarili('/platform/servis/sil', { projeId, id: servisId });
  expect(sil).toMatchObject({ onayGerekli: true, senaryoSayisi: 3 });
  expect(await basarili('/platform/servis/sil', { projeId, id: servisId, onay: true })).toMatchObject({ silindi: true });
  expect((await basarili(`/platform/servisler?projeId=${projeId}`)).servisler).toEqual([]);
  // Sahte sunucuya giden istekler yalnız WSDL + SOAP çağrıları.
  expect(soap.istekler.every((i) => i.yol.startsWith('/Servis/ornek.asmx'))).toBe(true);
});
