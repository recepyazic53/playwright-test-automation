// KORUMA TESTLERİ — birlikte gelen özelliklerin etkileşimi (entegrasyon dalı): tablodan ÇOKLU VERİ koşusu + ekrandaki İNDİRİLEN
// DOSYA doğrulaması + KAYIT kuralları. Dosya beklentisindeki ${Tablo.Sütun} başvuruları her veri koşusunda o koşunun satırıyla
// çözülmeli (veri-oku.mjs > basvurulariCoz: alanlar ve dosya metinleri aynı sabit satır seçimiyle); "Doğrulanan dosya" eki her
// veri koşusunda kalır, "yalnız başarılı" video kuralı kalan veri koşusunun videosunu atar. Uygulama 127.0.0.1'de sahte "Rapor"
// ekranıdır; ayrı Nöbetçi örneği geçici veritabanıyla çalışır. Dış siteye istek gitmez. Değerler SAHTEDİR.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API yanıtları serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;

const CSV = 'Sipariş No;Ürün;Tutar\n1001;Kırmızı Kalem;45,00\n1002;Defter;20,50\n';
const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Rapor</title></head><body>
<label>Sipariş <input id="siparis"></label>
<button id="uygula" onclick="document.getElementById('durum').textContent = 'Rapor hazır: ' + document.getElementById('siparis').value">Uygula</button>
<p id="durum"></p>
<a id="csvIndir" href="/dosya/csv">CSV indir</a>
</body></html>`;

function raporPaketi(): Nesne {
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'birlesik-rapor', ad: 'Birleşik rapor', aciklama: 'Çoklu veri + dosya doğrulama (nötr fikstür).', ekranUrl: '/rapor',
    girisGerekmez: true, specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi' }, kosullar: {},
    adimlar: [
      {
        id: 'suzgec', sira: 1, baslik: 'Rapor süzülür',
        bolumler: [{ id: 'b', baslik: 'Süzgeç', alanlar: [{ id: 'siparis', tip: 'metin', etiket: { ekran: 'Sipariş' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'siparis' }, konum: { secici: '#siparis', kirilganlik: 'dusuk' }, zorunlu: false }] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#uygula', aciklama: 'Uygula' }], basariGostergesi: { tur: 'metin', deger: 'Rapor hazır', secici: '#durum' }, zamanAsimiSn: 10 }
      },
      {
        id: 'csv', sira: 2, baslik: 'Sipariş listesi indirilir',
        // Beklenti tablodan: "Sipariş No = <satırın No'su> olan satırda Ürün = <satırın Ürün'ü>" (alanla aynı satırdan gelmeli).
        dosyaKontrolu: {
          tetikleyici: { secici: '#csvIndir', aciklama: 'CSV indir' }, zamanAsimiSn: 20, bicim: 'csv',
          beklentiler: [{ tur: 'hucre', sutun: 'Ürün', deger: '${Siparisler.Urun}', satir: { tur: 'kosul', sutun: 'Sipariş No', deger: '${Siparisler.No}' } }]
        }
      }
    ],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: 'birlesik-rapor', ad: 'Birleşik rapor', urlYolu: '/rapor' }, olusturan: 'test', olusturulma: '2026-09-28T09:00:00Z', baglamProfilleri: [], not: 'Nötr fikstür; değerler sahte.' },
    model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  };
}

test.describe('çoklu veri + indirilen dosya + kayıt kuralları (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Birlesik-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let sunucu: Server;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne): Promise<Nesne> => {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
    return y;
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'entegrasyon-birlesik-'));
    sunucu = createServer((q, r) => {
      const yol = new URL(q.url ?? '/', 'http://127.0.0.1').pathname;
      if (yol === '/dosya/csv') { r.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="siparisler.csv"' }); r.end(CSV); return; }
      if (yol === '/rapor') { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(SAYFA); return; }
      r.writeHead(404); r.end();
    });
    await new Promise<void>((c) => sunucu.listen(0, '127.0.0.1', () => c()));
    const adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Birleşik Proje' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: adres, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, senaryoIndeksleri: [], ortamIdleri: [ortamId], paket: raporPaketi() });
  });

  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await new Promise((c) => sunucu?.close(c));
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('her veri koşusu dosya beklentisini KENDİ satırıyla çözer; dosya eki her koşuda, "yalnız başarılı" video kalan koşuda atılır', async () => {
    test.setTimeout(300_000);
    // İlk satır ("ilk" seçimde seçilecek olan) SEÇİLMEZ: dosya beklentisi sabit satırla çözülmezse koşular ona düşer ve kalır.
    await basarili('/platform/tablo/kaydet', {
      projeId, ad: 'Siparisler', sutunlar: [{ ad: 'No' }, { ad: 'Urun' }],
      satirlar: [
        { ad: 'yok', degerler: { No: '9999', Urun: 'Olmayan' } },
        { ad: 'kalem', degerler: { No: '1001', Urun: 'Kırmızı Kalem' } },
        { ad: 'defter', degerler: { No: '1002', Urun: 'Defter' } },
        { ad: 'yanlis', degerler: { No: '1001', Urun: 'Defter' } }
      ]
    });
    const tablo = ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((t) => t.ad === 'Siparisler') as Nesne;
    const satir = Object.fromEntries((tablo.satirlar as Nesne[]).map((r) => [String(r.ad), String(r.id)]));
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { indirilenDosya: 'her', video: 'yalnizBasari', adimGoruntusu: 'kapali' } });
    const ekranId = String(((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Nesne[]).find((e) => e.ad === 'Birleşik rapor')?.id);
    const senaryoId = String((await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Sipariş raporu', ortamIdleri: [ortamId], veri: { baslik: 'Sipariş raporu', siparis: '${Siparisler.No}' },
      veriKosulari: { gruplar: { [`${String(tablo.id)}|`]: { kip: 'secili', satirlar: [satir.kalem, satir.defter, satir.yanlis] } } }
    })).id);

    const kosuKimligi = `kosu-${randomUUID()}`;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `k-${randomUUID()}`, senaryoId, ortamId, kosuTuru: 'tekil', kosuKimligi });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    const sonuclar = (await api(`/platform/sonuclar/kosu?id=${kosuKimligi}`)).sonuclar as Nesne[];
    expect(sonuclar.map((s) => s.senaryoBaslik).sort()).toEqual(['Sipariş raporu [defter]', 'Sipariş raporu [kalem]', 'Sipariş raporu [yanlis]']);
    const durum = Object.fromEntries(sonuclar.map((s) => [String(s.veriKosusu?.ad), String(s.durum)]));
    expect(durum).toEqual({ kalem: 'basarili', defter: 'basarili', yanlis: 'basarisiz' });

    for (const s of sonuclar) {
      const ayrinti = (await api(`/platform/sonuclar/sonuc?id=${String(s.id)}`)).sonuc as Nesne;
      const medya = (ayrinti.medya ?? []) as Nesne[];
      const adlar = medya.map((m) => String(m.ad));
      // Doğrulanan dosya (Ayarlar "her zaman") her veri koşusunda ek olarak kalır; kayıt süzgeci ona dokunmaz.
      expect(adlar, String(s.senaryoBaslik)).toContain('İndirilen dosya - siparisler.csv');
      expect(adlar).toContain('Dosya doğrulama - Sipariş listesi indirilir');
      const video = medya.some((m) => m.tur === 'video' || String(m.icerikTuru ?? '').startsWith('video/'));
      expect(video, `${String(s.senaryoBaslik)}: video`).toBe(s.durum === 'basarili');
    }
    const yanlis = (await api(`/platform/sonuclar/sonuc?id=${String(sonuclar.find((s) => s.veriKosusu?.ad === 'yanlis')?.id)}`)).sonuc as Nesne;
    expect(String(yanlis.hataMesaji)).toContain('Sipariş listesi indirilir');
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { indirilenDosya: 'kapali', video: 'her', adimGoruntusu: 'her' } });
  });
});
