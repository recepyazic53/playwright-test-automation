// UÇTAN UCA (yerel) — EKRAN SENARYOLARINDA EŞZAMANLI KOŞU (Ayarlar > Koşu > Ekran senaryoları; ortamın "Koşu hızı" ezer).
// Nöbetçi her senaryoyu ayrı Playwright sürecinde koşar; sunucunun dosya yuvası aynı anda en çok N süreç çalıştırır ve süreç
// bitince "senaryolar arası bekleme" kadar yuvayı tutar. Sahte site (yalnız 127.0.0.1): girişsiz ekranda "Kaydet" isteği
// geciktirilir ve aynı anda işlenen istekler sayılır — N = 1'de en çok 1, ortamda N = 2 iken en çok 2; bekleme ardışık senaryolar
// arasına girer. Girişli sahte sitede N = 2: paylaşılan oturum süreçler arası kilitle bir kez alınır (giriş tek kez).
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { yerelSunucu } from './giris-fikstur';
import { ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, OrnekBasvuruUygulamasi, ornekBasvuruPaketi, ornekGirisTarifi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const GECIKME = 7_000;
const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>İş</title></head><body>
<label>Ad <input id="ad" type="text"></label>
<button id="kaydet" type="button">Kaydet</button><p id="sonuc"></p>
<script>document.getElementById('kaydet').addEventListener('click', async () => {
  const r = await fetch('/kaydet', { method: 'POST', body: document.getElementById('ad').value });
  document.getElementById('sonuc').textContent = await r.text();
});</script></body></html>`;

/** Girişsiz "İş" ekranı: ad yazılır, Kaydet → "Kaydedildi". */
function isPaketi(adet: number): Nesne {
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'is', ad: 'İş', aciklama: 'Eşzamanlı koşu (nötr fikstür).', ekranUrl: '/is', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, kosullar: {},
    adimlar: [{
      id: 'bilgi', sira: 1, baslik: 'Bilgi',
      bolumler: [{ id: 'b', baslik: 'Bilgi', alanlar: [{ id: 'ad', tip: 'metin', etiket: { ekran: 'Ad' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'ad' }, konum: { secici: '#ad', kirilganlik: 'orta' }, zorunlu: false }] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Kaydedildi', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: 'is', ad: 'İş', urlYolu: '/is' }, olusturan: 'test', olusturulma: '2026-09-28T09:00:00Z', baglamProfilleri: [], not: 'Nötr fikstür.' },
    model,
    senaryoOnerileri: Array.from({ length: adet }, (_x, i) => ({ baslik: `İş ${i + 1}`, veri: { baslik: `İş ${i + 1}`, ad: `Kişi ${i + 1}` }, adimKapsami: [],
      beklenenSonuc: { tur: 'basari', aciklama: 'Kaydedilir.' }, gerekce: 'Eşzamanlılık' })),
    gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] },
    bilinmeyenler: []
  };
}

test.describe('eşzamanlı ekran koşusu', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-EkranEs-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let site: Server;
  let siteAdresi = '';
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let senaryolar: string[] = [];
  let aktif = 0;
  let enCok = 0;
  /** POST /kaydet zaman çizelgesi ve sayfa açılışları (GET /is). */
  const kayitlar: Array<{ geldi: number; bitti?: number }> = [];
  const acilislar: number[] = [];
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const kos = (idler: string[], oId = ortamId, pId = projeId) => {
    const kosuKimligi = `es-${randomUUID()}`;
    return Promise.all(idler.map((senaryoId) => api('/platform/senaryolar/calistir', { projeId: pId, ortamId: oId, senaryoId, kosuId: `k-${randomUUID()}`, kosuTuru: 'tekil', kosuKimligi })));
  };
  const hizYaz = (kosuHizi: Nesne) => basarili('/platform/ortam/kaydet', { id: ortamId, projeId, ad: 'TEST', tabanUrl: siteAdresi, varsayilan: true, riskli: false, kosuHizi });

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    site = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/is') { acilislar.push(Date.now()); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(SAYFA); return; }
      if (req.method === 'POST' && req.url === '/kaydet') {
        const k: { geldi: number; bitti?: number } = { geldi: Date.now() };
        kayitlar.push(k);
        aktif++; enCok = Math.max(enCok, aktif);
        setTimeout(() => { aktif--; k.bitti = Date.now(); res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Kaydedildi'); }, GECIKME);
        return;
      }
      res.writeHead(404); res.end('yok');
    });
    await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
    siteAdresi = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
    klasor = mkdtempSync(join(tmpdir(), 'ekran-eszamanli-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Eşzamanlı Ekran' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: siteAdresi, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: isPaketi(4), senaryoIndeksleri: [0, 1, 2, 3], ortamIdleri: [ortamId] });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`);
    senaryolar = (liste.senaryolar as Nesne[]).sort((a, b) => String(a.baslik).localeCompare(String(b.baslik), 'tr')).map((s) => String(s.id));
    expect(senaryolar).toHaveLength(4);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await new Promise<void>((r) => { site?.closeAllConnections(); site?.close(() => r()); });
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('N = 1 (varsayılan): dört senaryo aynı anda istense de sırayla koşar — aynı anda en çok 1 istek, zaman aralıkları çakışmaz', async () => {
    test.setTimeout(240_000);
    aktif = 0; enCok = 0; kayitlar.length = 0;
    const y = await kos(senaryolar);
    expect(y.map((x) => [x.basarili, x.durum]), JSON.stringify(y.map((x) => x.mesaj))).toEqual(senaryolar.map(() => [true, 'passed']));
    expect(kayitlar).toHaveLength(4);
    expect(enCok).toBe(1);
    const sirali = [...kayitlar].sort((a, b) => a.geldi - b.geldi);
    for (let i = 1; i < sirali.length; i++) expect(sirali[i].geldi).toBeGreaterThanOrEqual(Number(sirali[i - 1].bitti));
  });

  test('ortamda N = 2 (genel 1): aynı anda en çok 2 istek; ortam değeri genel ayarı ezer; sonuç kayıtları tam', async () => {
    test.setTimeout(240_000);
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { ekranEszamanli: 1 } });
    await hizYaz({ ekranEszamanli: 2 });
    aktif = 0; enCok = 0; kayitlar.length = 0;
    const bas = Date.now();
    const y = await kos(senaryolar);
    const sure = Date.now() - bas;
    expect(y.map((x) => x.durum), JSON.stringify(y.map((x) => x.mesaj))).toEqual(['passed', 'passed', 'passed', 'passed']);
    expect(kayitlar).toHaveLength(4);
    expect(enCok).toBe(2);
    expect(sure).toBeLessThan(4 * GECIKME + 60_000);
    // Her senaryonun kendi sonuç kaydı (medya adları çakışmadan: her süreç kendi çıktı klasöründe).
    const sonuclar = await Promise.all(y.map(async (x) => (await api(`/platform/sonuclar/sonuc?id=${String(x.sonucId)}`)).sonuc as Nesne));
    expect(new Set(sonuclar.map((s) => s.senaryoId))).toEqual(new Set(senaryolar));
    await hizYaz({});
  });

  test('senaryolar arası bekleme: N = 1 + 6000 ms → bir senaryo bitince sıradaki en az 6 sn sonra başlar (0 ms ile kıyasla)', async () => {
    test.setTimeout(300_000);
    /** İki senaryo arka arkaya (istemci ilkini bekler): ilkinin bitişinden ikincisinin sayfa açılışına kadar geçen süre. */
    const ara = async (a: string, b: string) => {
      acilislar.length = 0;
      const [x] = await kos([a]);
      const ilkBitti = Date.now();
      const [y] = await kos([b]);
      expect([x.durum, y.durum]).toEqual(['passed', 'passed']);
      expect(acilislar).toHaveLength(2);
      return acilislar[1] - ilkBitti;
    };
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { ekranEszamanli: 1, ekranBeklemeMs: 0 } });
    const beklemesiz = await ara(senaryolar[0], senaryolar[1]);
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { ekranBeklemeMs: 6_000 } });
    // Sunucu yuvası, ilk süreç bitince 6 sn dolu kalır; ikinci süreç ancak sonra başlar.
    const beklemeli = await ara(senaryolar[2], senaryolar[3]);
    expect(beklemeli).toBeGreaterThanOrEqual(6_000);
    // Fark, beklemesiz koşunun açılış süresine bağlıdır (yavaş makinede ~2 sn); beklemenin etkisi için 3 sn yeter.
    expect(beklemeli - beklemesiz).toBeGreaterThanOrEqual(3_000);
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { ekranBeklemeMs: 0 } });
  });

  test('girişli sahte site, N = 2: iki senaryo aynı anda başlar, paylaşılan oturum kilitle bir kez alınır (giriş tek kez)', async () => {
    test.setTimeout(300_000);
    const uygulama = new OrnekBasvuruUygulamasi({ totp: true });
    const fikstur = await yerelSunucu(uygulama.isle);
    try {
      const pId = String((await basarili('/platform/proje/kaydet', { ad: 'Girişli' })).proje.id);
      const oId = String((await basarili('/platform/ortam/kaydet', { projeId: pId, ad: 'GİRİŞLİ', tabanUrl: fikstur.adres, varsayilan: true, riskli: false,
        kosuHizi: { ekranEszamanli: 2 } })).ortam.id);
      await basarili('/platform/giris-profili/kaydet', { projeId: pId, ortamId: oId, ad: 'Deneme', kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, ikiAsamaliTur: 'totp', totpGizli: ORNEK_TOTP_ANAHTARI });
      await basarili('/platform/giris-tarifi/kaydet', { projeId: pId, ortamId: oId, tarif: ornekGirisTarifi() });
      for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) await basarili('/platform/baglam-profili/kaydet', { projeId: pId, tur: 'Şube', ad, alanlar: { subeKodu } });
      await basarili('/platform/sayfa-paketi/ekle', { projeId: pId, paket: ornekBasvuruPaketi(), senaryoIndeksleri: [1, 4], ortamIdleri: [oId] });
      const liste = await api(`/platform/senaryolar?projeId=${pId}&ortamId=${oId}`);
      const idler = (liste.senaryolar as Nesne[]).map((s) => String(s.id));
      expect(idler).toHaveLength(2);
      const y = await kos(idler, oId, pId);
      expect(y.map((x) => x.durum), JSON.stringify(y.map((x) => x.mesaj))).toEqual(['passed', 'passed']);
      expect(uygulama.olaylar.filter((o) => o === 'POST /giris')).toHaveLength(1);
    } finally {
      await fikstur.kapat();
    }
  });
});
